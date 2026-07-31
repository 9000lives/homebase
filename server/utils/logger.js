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

const { isProduction, isTest } = require('../config/env')

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

// Security audit trail. Kept as its own channel (audit: true) so these can be
// routed and retained separately from operational noise.
const audit = (event, fields = {}) => {
    write('info', `audit.${event}`, { audit: true, event, ...fields })
}

// Pulls the actor/source identifiers every audit entry should carry.
const actorFrom = (req) => ({
    actorId: req.user?.id ?? null,
    ip: req.ip,
    userAgent: req.get?.('user-agent')?.slice(0, 200) ?? null,
    requestId: req.id ?? null
})

module.exports = { log, audit, actorFrom, redact }
