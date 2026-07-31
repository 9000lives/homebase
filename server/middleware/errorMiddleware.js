// Centralized error handling.
//
// Express recognises a 4-argument middleware as an error handler. Everything
// thrown from a controller (via express-async-handler) or passed to next()
// lands here.
//
// Two rules govern what goes back to the client:
//
//   1. NEVER a stack trace. The previous handler gated that on
//      `NODE_ENV === 'production'` — and NODE_ENV was set nowhere in the
//      repository, so the default deployment returned absolute filesystem
//      paths, module structure, and dependency layout to every client on every
//      error. Making disclosure the default and safety the exception is
//      backwards; the stack is now logged server-side against a request id and
//      never serialized.
//
//   2. Only deliberately-thrown messages are exposed. Anything unexpected
//      becomes a generic 500 message. The request id is returned so a user can
//      quote it and an operator can find the real error in the logs.

const multer = require('multer')
const fs = require('fs/promises')
const { HttpError } = require('../utils/httpError')
const { log } = require('../utils/logger')

// Map framework/driver errors onto the status they actually mean, instead of
// letting them all fall through to a 500.
const classify = (err) => {
    if (err instanceof HttpError) {
        return { status: err.status, message: err.message, expose: err.expose }
    }

    // Malformed ObjectId or an un-castable value reaching a query.
    if (err.name === 'CastError') {
        return { status: 400, message: `Invalid value for '${err.path}'`, expose: true }
    }

    // Mongoose schema validation (enum, required, maxlength).
    if (err.name === 'ValidationError') {
        const detail = Object.values(err.errors || {})
            .map((e) => e.message)
            .join('; ')
        return { status: 400, message: detail || 'Invalid data', expose: true }
    }

    // Duplicate key — in practice the unique index on User.email.
    if (err.name === 'MongoServerError' && err.code === 11000) {
        return { status: 409, message: 'That value is already in use', expose: true }
    }

    // Multer. These were reaching the client as 500s with a stack trace on
    // every over-sized or wrong-type upload — an ordinary user mistake turned
    // into an information-disclosure primitive.
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return { status: 413, message: 'File is larger than the upload limit', expose: true }
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
            return { status: 400, message: 'Unexpected file upload', expose: true }
        }
        return { status: 400, message: 'Upload rejected', expose: true }
    }

    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return { status: 401, message: 'Not authorized, invalid token', expose: true }
    }

    // Body parser: malformed JSON.
    if (err.type === 'entity.parse.failed') {
        return { status: 400, message: 'Malformed JSON body', expose: true }
    }
    if (err.type === 'entity.too.large') {
        return { status: 413, message: 'Request body is too large', expose: true }
    }

    // A status set the old way (`res.status(400); throw new Error(...)`) is
    // still honoured, so existing throw sites keep working.
    if (err.status || err.statusCode) {
        const status = err.status || err.statusCode
        return { status, message: err.message, expose: status < 500 }
    }

    return { status: 500, message: err.message, expose: false }
}

// Multer's diskStorage writes the complete file before the route handler runs.
// If anything downstream throws — an authorization failure, a quota rejection,
// a failed File.create — those bytes stay on disk with no database record and
// no cleanup, invisible to the admin storage dashboard (which aggregates the
// File collection, not the volume). Cleaning up here covers every error path
// out of the upload pipeline at once, including ones added later.
const cleanUpOrphanedUpload = async (req) => {
    if (!req.file?.path) return
    try {
        await fs.unlink(req.file.path)
        log.info('cleaned up orphaned upload', { requestId: req.id })
    } catch (error) {
        if (error.code !== 'ENOENT') {
            log.error('failed to clean up orphaned upload', { requestId: req.id, error })
        }
    }
}

// The unused `next` is required: Express identifies an error handler by its
// arity, so removing the fourth parameter silently turns this into ordinary
// middleware that never runs.
const errorHandler = (err, req, res, next) => {
    const { status, message, expose } = classify(err)

    cleanUpOrphanedUpload(req)

    const logFields = {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
        status,
        userId: req.user?.id ?? null,
        ip: req.ip,
        error: { name: err.name, message: err.message, code: err.code },
        // The stack is logged, never sent.
        stack: err.stack
    }

    if (status >= 500) log.error('request failed', logFields)
    else log.warn('request rejected', logFields)

    // Headers already sent — a streaming response (zip download) failed part
    // way through. There is no way to convert this into a JSON error, so the
    // connection is destroyed and the client must treat a truncated body as a
    // failure.
    if (res.headersSent) {
        return res.destroy(err)
    }

    res.status(status).json({
        message: expose ? message : 'Something went wrong. Please try again.',
        requestId: req.id
    })
}

// 404 for anything that matched no route, so unknown paths return JSON like
// every other error rather than Express's default HTML page.
const notFoundHandler = (req, res, next) => {
    next(new HttpError(404, `Not found: ${req.method} ${req.originalUrl}`))
}

module.exports = { errorHandler, notFoundHandler }
