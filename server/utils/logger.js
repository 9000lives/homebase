// Structured logging with mandatory redaction.
//
// Two entry points:
//   log.{debug,info,warn,error}  — operational logging
//   audit(event, fields)         — security-relevant events that must be
//                                  reconstructable after an incident
//
// Every value passes through redact() before it is written, so a token,
// password, or OTP that leaks into a log call by accident is dropped rather
// than persisted. Never bypass this by calling console.* directly in a
// request path.

const { isProduction, isTest, AUDIT_PERSIST } = require('../config/env')

// Field names whose values must never be written, however they arrive.
const SENSITIVE_KEYS = new Set([
    'password',
    'newpassword',
    'currentpassword',
    'confirmnewpassword',
    'passwordhash',
    'token',
    'logintoken',
    'devicetoken',
    'accesstoken',
    'refreshtoken',
    'authorization',
    'cookie',
    'code',
    'otp',
    'twofactorcodehash',
    'secret',
    'jwt_secret',
    'mongo_uri',
    'smtp_pass',
    'apikey',
    'api_key'
])

const REDACTED = '[redacted]'

const redact = (value, depth = 0) => {
    if (value === null || value === undefined) return value
    if (depth > 6) return '[truncated]'

    if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))

    if (value instanceof Error) {
        return { name: value.name, message: value.message, code: value.code }
    }

    if (typeof value === 'object') {
        const out = {}
        for (const [key, val] of Object.entries(value)) {
            out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(val, depth + 1)
        }
        return out
    }

    if (typeof value === 'string' && value.length > 512) return `${value.slice(0, 512)}…`

    return value
}

const write = (level, message, fields = {}) => {
    // Tests drive hundreds of deliberate 4xx responses, so the routine channels
    // are muted — but errors are never silenced, or a genuine 500 during a test
    // run would be invisible.
    if (isTest && level !== 'error') return

    const entry = {
        ts: new Date().toISOString(),
        level,
        msg: message,
        ...redact(fields)
    }

    // JSON in production so a log shipper can parse it; readable lines locally.
    const line = isProduction ? JSON.stringify(entry) : `[${level}] ${message} ${JSON.stringify(entry)}`

    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
}

const log = {
    debug: (message, fields) => { if (!isProduction) write('debug', message, fields) },
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields)
}

// Only a well-formed 24-character hex id becomes an ObjectId column; anything
// else stays out rather than throwing a CastError inside a fire-and-forget
// write that nobody is awaiting.
const asObjectId = (value) =>
    typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value) ? value : null

// Durable sink for the audit channel, alongside stdout.
//
// Three properties here are load-bearing:
//
//   1. Redaction happens BEFORE the row is assembled. The DB write consumes
//      redact()'s output, never the raw fields — otherwise persisting a log
//      would quietly undo the guarantee that a token or OTP can't reach one.
//   2. Fire-and-forget. An audit write must never fail, delay, or reject the
//      request that produced it, so nothing awaits this and every path catches.
//   3. Suppressed under NODE_ENV=test, matching write()'s own muting — the
//      security suite drives hundreds of deliberate auth failures and must not
//      accumulate rows for them.
const persistAudit = (event, fields) => {
    if (!AUDIT_PERSIST || isTest) return

    const safe = redact(fields) ?? {}
    const { actorId, targetUserId, ip, userAgent, requestId, ...meta } = safe

    // Required lazily: logger.js loads before the models do (server.js pulls it
    // in at startup), and requiring a model at this file's top level would make
    // every consumer of the logger depend on mongoose being initialised first.
    const AuditLog = require('../models/auditLogModel')

    AuditLog.create({
        event,
        actorId: asObjectId(actorId),
        targetUserId: asObjectId(targetUserId),
        ip: typeof ip === 'string' ? ip : null,
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 200) : null,
        requestId: typeof requestId === 'string' ? requestId : null,
        meta
    }).catch((error) => {
        // write() directly, not audit() — routing this back through the audit
        // channel would retry the failing write and recurse.
        write('error', 'audit persistence failed', { event, error })
    })
}

// Security audit trail. Kept as its own channel (audit: true) so these can be
// routed and retained separately from operational noise.
const audit = (event, fields = {}) => {
    write('info', `audit.${event}`, { audit: true, event, ...fields })
    persistAudit(event, fields)
}

// Pulls the actor/source identifiers every audit entry should carry.
const actorFrom = (req) => ({
    actorId: req.user?.id ?? null,
    ip: req.ip,
    userAgent: req.get?.('user-agent')?.slice(0, 200) ?? null,
    requestId: req.id ?? null
})

module.exports = { log, audit, actorFrom, redact }
