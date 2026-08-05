// Configuration must load and validate before anything reads it.
const {
    PORT,
    NODE_ENV,
    isProduction,
    CORS_ORIGINS,
    TRUST_PROXY
} = require('./config/env')

const crypto = require('crypto')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const mongoose = require('mongoose')

const connectDB = require('./config/db')
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware')
const { globalLimiter } = require('./middleware/rateLimiters')
const { log } = require('./utils/logger')

// An unhandled throw inside an EventEmitter listener (archiver's 'error' event
// was the known case) escapes every promise chain and terminates the process by
// default, with no supervisor configured to bring it back. These handlers make
// that exit deliberate and, crucially, logged — so the cause is recoverable
// from the logs rather than lost. They are NOT a substitute for a process
// supervisor — run this under systemd, PM2, or a container restart policy.
process.on('uncaughtException', (error) => {
    log.error('uncaught exception — shutting down', { error, stack: error?.stack })
    process.exit(1)
})
process.on('unhandledRejection', (reason) => {
    log.error('unhandled promise rejection — shutting down', {
        error: reason instanceof Error ? reason : { message: String(reason) },
        stack: reason?.stack
    })
    process.exit(1)
})

connectDB()

const app = express()

// Rate limiters key on the client IP. Behind a proxy that address is in
// X-Forwarded-For — but trusting that header when there is no proxy lets any
// client spoof its address and bypass every limiter. Off unless configured.
app.set('trust proxy', TRUST_PROXY)

// Express 5 defaults the query parser to 'simple', which cannot produce nested
// objects — so ?x[$ne]=1 yields the literal key 'x[$ne]' rather than a Mongo
// operator. Pinned explicitly so that protection is a decision rather than an
// inherited default that a future `app.set` could silently remove.
app.set('query parser', 'simple')

// Don't advertise the framework.
app.disable('x-powered-by')

app.use(
    helmet({
        // This process serves JSON and user-uploaded file bytes — never HTML,
        // scripts, or styles of its own. So the policy denies everything by
        // default and grants nothing back. If a response is ever coerced into
        // being interpreted as a document, there is nothing it may load or run.
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                'default-src': ["'none'"],
                'script-src': ["'none'"],
                'object-src': ["'none'"],
                'base-uri': ["'none'"],
                'form-action': ["'none'"],
                'frame-ancestors': ["'none'"],
                'sandbox': []
            }
        },
        // Uploaded bytes must not be embeddable by other origins.
        crossOriginResourcePolicy: { policy: 'same-site' },
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        referrerPolicy: { policy: 'no-referrer' },
        // HSTS only once TLS actually terminates in front of this app.
        // Sending it from a plain-HTTP deployment locks users out.
        hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false
    })
)

// Belt and braces: helmet sets this, but it is the single most important header
// for the file-serving routes (a mismatched Content-Type must never be
// content-sniffed into an executable document), so it is asserted globally.
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    next()
})

// Correlation id. Returned to the client on errors and written to every log
// line, so a user can quote an id and an operator can find the real error
// without the response ever carrying a stack trace.
app.use((req, res, next) => {
    req.id = crypto.randomUUID()
    res.setHeader('X-Request-Id', req.id)
    next()
})

// Explicit origin allow-list from configuration. The previous regex matched any
// localhost port and was labelled "switch before prod" — it would have broken
// on deployment, and `credentials: true` becomes materially dangerous the
// moment authentication moves to cookies.
//
// Authentication is Authorization-header based with no cookies anywhere, so
// credentials are not enabled. Revisit this together with CSRF if that changes.
const corsOptions = {
    origin: CORS_ORIGINS.length > 0
        ? CORS_ORIGINS
        // Development only: any localhost port, so the Vite dev server works on
        // whichever port it lands on. Production requires CORS_ORIGINS to be
        // set — config/env.js refuses to start otherwise.
        : /^http:\/\/localhost:\d+$/,
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id', 'X-Total-Count'],
    maxAge: 600
}
app.use(cors(corsOptions))

// 100kb default is plenty for this API's JSON bodies; file bytes arrive as
// multipart and are bounded separately by Multer.
app.use(express.json({ limit: '100kb' }))

// Express 5 leaves req.body UNDEFINED when no parser matched — a request with
// no body, or one with no Content-Type. Express 4 handed over `{}`, and every
// controller here still reads req.body on that assumption (34 call sites at the
// time of writing, both `req.body.x` and `const { x } = req.body`).
//
// Without this, `DELETE /api/admin/users/:id` sent with no body threw
// "Cannot read properties of undefined (reading 'confirmEmail')" and returned a
// 500 where the typed-email check should have produced a clean 400 — a caller
// omitting the confirmation got an unexpected-error response instead of being
// told what was missing. Every other write endpoint had the same latent shape.
//
// Normalising here rather than guarding each call site: 34 `?.` operators are
// 34 chances to miss one, and a validator reading `undefined` instead of a
// missing property produces exactly the same 400 it would for an empty object.
app.use((req, res, next) => {
    if (req.body === undefined) req.body = {}
    next()
})

// Liveness/readiness probe.
//
// Public and unauthenticated by necessity: a process supervisor, a reverse
// proxy's upstream check and an external uptime monitor cannot present a JWT.
// The detailed panel — database state, mail configuration, disk figures, Node
// version — stays behind GET /api/admin/system/health. An endpoint anyone can
// reach must not describe the deployment to whoever asks, so this one answers
// exactly one question: can this process serve a request right now?
//
// Mounted BEFORE globalLimiter deliberately. A probe running every few seconds
// would otherwise spend the shared per-IP budget that real traffic needs — and
// behind a proxy every probe arrives from the same address as every user, so
// they compete for one bucket. Leaving it unlimited is safe because the handler
// does no I/O: readyState is an in-memory integer on the Mongoose connection,
// not a round trip to the database. A probe that queried Mongo would turn this
// into an amplifier, where one cheap request costs a database operation.
//
// Nothing is logged here for the same reason — one line per probe every few
// seconds buries the log volume that matters.
//
// 503 rather than 200 when the database is unreachable, so a proxy configured
// with an upstream health check pulls this instance rather than serving
// requests that can only fail once they reach a controller.
app.get('/health', (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1
    res.status(dbConnected ? 200 : 503).json({ status: dbConnected ? 'ok' : 'degraded' })
})

// Backstop limiter for every route, including any added without their own.
app.use(globalLimiter)

app.use('/api/users', require('./routes/userRoutes'))
app.use('/api/files', require('./routes/fileRoutes'))
app.use('/api/folders', require('./routes/folderRoutes'))

// Reading announcements is a member action, so it mounts as its own resource.
// Creating and retracting them is an admin action and lives under /api/admin.
app.use('/api/announcements', require('./routes/announcementRoutes'))

// Sending feedback is a member action, so it mounts as its own resource — and
// carries only a POST. Reading and triaging it is an admin action and lives
// under /api/admin.
app.use('/api/feedback', require('./routes/feedbackRoutes'))

// admin dashboard — every route inside is behind protect + requireAdmin
app.use('/api/admin', require('./routes/adminRoutes'))

app.use(notFoundHandler)
app.use(errorHandler)

const server = app.listen(PORT, () => log.info('server started', { port: PORT, env: NODE_ENV }))

// Graceful shutdown.
//
// Without this, stopping the service terminates the process mid-request. An
// upload in flight is lost, and — worse because it fails silently — a zip
// download is truncated into an archive the client cannot distinguish from a
// complete one.
//
// WINDOWS SIGNALS: SIGTERM is never delivered on Windows. Node permits
// listening for it and it simply never fires. The service wrapper
// (deploy/homebase-service.xml) stops this process with a console Ctrl+C /
// Ctrl+Break event, which arrives as SIGINT / SIGBREAK. A SIGTERM-only handler
// — the Linux-idiomatic version — would read correctly, pass review, and do
// nothing whatsoever in production here. All three are registered so this works
// under the Windows service, a container, and a POSIX host alike.
const SHUTDOWN_GRACE_MS = 10_000

let shuttingDown = false

const shutdown = async (signal) => {
    // A second Ctrl+C, or SIGINT and SIGBREAK arriving together, must not
    // restart a drain that is already running.
    if (shuttingDown) return
    shuttingDown = true

    log.info('shutdown started', { signal, graceMs: SHUTDOWN_GRACE_MS })

    // Backstop. A client holding a connection open without completing its
    // request would otherwise stall the drain indefinitely. This must stay
    // BELOW the wrapper's <stoptimeout> (15s) or the wrapper kills the process
    // first and none of this is ever reported. unref() so the timer itself
    // cannot be the thing keeping the event loop alive.
    const force = setTimeout(() => {
        log.error('shutdown timed out, forcing exit', { signal })
        process.exit(1)
    }, SHUTDOWN_GRACE_MS)
    force.unref()

    try {
        // close() stops accepting new connections and resolves once in-flight
        // requests finish. It does NOT drop idle keep-alive sockets — those
        // will never send another request but still count as open, so without
        // closing them explicitly the drain waits for their full timeout.
        const drained = new Promise((resolve, reject) =>
            server.close((err) => (err ? reject(err) : resolve()))
        )
        server.closeIdleConnections()
        await drained

        // Only after HTTP has drained. A request still finishing its work needs
        // the database connection to be there.
        await mongoose.connection.close(false)

        log.info('shutdown complete', { signal })
        process.exit(0)
    } catch (error) {
        log.error('shutdown failed', { signal, error })
        process.exit(1)
    }
}

for (const signal of ['SIGTERM', 'SIGINT', 'SIGBREAK']) {
    process.on(signal, () => shutdown(signal))
}

// Exported so the test suite can start the real application and shut it down
// afterward, rather than testing a parallel wiring that could drift from this one.
module.exports = server
module.exports.app = app
