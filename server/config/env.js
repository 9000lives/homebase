// Centralized environment configuration.
//
// This module is the ONLY place that reads process.env for application
// settings. It loads .env explicitly (rather than relying on the process
// working directory), validates everything the app cannot safely start
// without, and derives sensible defaults for everything else.
//
// Require this first, before anything that reads configuration.

const path = require('path')
const crypto = require('crypto')
const dotenv = require('dotenv')

// Explicit path so the app behaves identically whether it's started from the
// repo root (npm start) or from anywhere else.
const REPO_ROOT = path.join(__dirname, '..', '..')
dotenv.config({ path: path.join(REPO_ROOT, '.env') })

const NODE_ENV = process.env.NODE_ENV || 'development'
const isProduction = NODE_ENV === 'production'
const isTest = NODE_ENV === 'test'

const fatal = []
const warnings = []

const requireEnv = (name) => {
    const value = process.env[name]
    if (!value) {
        fatal.push(`${name} is required but not set`)
        return ''
    }
    return value
}

// ── Secrets ──────────────────────────────────────────────────────────────
const MONGO_URI = requireEnv('MONGO_URI')
const JWT_SECRET = requireEnv('JWT_SECRET')

// A short secret makes HS256 signatures brute-forceable offline. 32 bytes of
// entropy (64 hex chars) is the floor for a secret that guards every session.
if (JWT_SECRET && JWT_SECRET.length < 32) {
    fatal.push('JWT_SECRET must be at least 32 characters; generate one with `openssl rand -hex 64`')
}

// Pre-authentication tokens (issued mid-2FA-challenge) MUST NOT verify as
// session tokens. Signing them with a different key makes that structurally
// impossible rather than dependent on a claim check.
//
// Derived from JWT_SECRET by default so no extra operator setup is required;
// set JWT_PREAUTH_SECRET explicitly to use an independent key. The derivation
// is one-way, so holding a pre-auth token never reveals anything about
// JWT_SECRET.
const JWT_PREAUTH_SECRET =
    process.env.JWT_PREAUTH_SECRET ||
    crypto.createHmac('sha256', JWT_SECRET || 'unset').update('homebase/preauth/v1').digest('hex')

if (process.env.JWT_PREAUTH_SECRET && process.env.JWT_PREAUTH_SECRET === JWT_SECRET) {
    fatal.push('JWT_PREAUTH_SECRET must differ from JWT_SECRET')
}

// ── Tokens ───────────────────────────────────────────────────────────────
// Sessions are revocable (User.tokenVersion), so the lifetime is a UX/exposure
// trade-off rather than the only bound on a stolen token. Two days keeps the
// window short without forcing a daily re-login.
const SESSION_TOKEN_TTL = process.env.SESSION_TOKEN_TTL || '2d'
const PREAUTH_TOKEN_TTL = process.env.PREAUTH_TOKEN_TTL || '10m'

// How long a device stays exempt from the 2FA challenge once verified.
const DEVICE_TRUST_TTL_MS = Number(process.env.DEVICE_TRUST_DAYS || 7) * 24 * 60 * 60 * 1000

// ── CORS ─────────────────────────────────────────────────────────────────
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

if (isProduction && CORS_ORIGINS.length === 0) {
    fatal.push('CORS_ORIGINS must list the deployed frontend origin(s) in production')
}

// ── Proxy ────────────────────────────────────────────────────────────────
// Rate limiters key on the client IP. Behind a proxy that means trusting
// X-Forwarded-For — but trusting it blindly lets any client spoof its address
// and bypass every limiter. So this is opt-in and prefers a hop count.
const parseTrustProxy = (raw) => {
    if (!raw || raw === 'false') return false
    if (raw === 'true') {
        warnings.push(
            "TRUST_PROXY=true trusts every hop, which lets clients spoof X-Forwarded-For " +
            'and bypass rate limiting. Prefer the number of proxies in front of this app.'
        )
        return true
    }
    if (/^\d+$/.test(raw)) return Number(raw)
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY)

if (isProduction && TRUST_PROXY === false) {
    warnings.push(
        'TRUST_PROXY is unset. If this app runs behind a reverse proxy or CDN, every ' +
        'rate limiter will key on the proxy IP and collapse into one global bucket.'
    )
}

// ── Storage limits ───────────────────────────────────────────────────────
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 100 * 1024 * 1024)
const USER_STORAGE_QUOTA_BYTES = Number(process.env.USER_STORAGE_QUOTA_BYTES || 5 * 1024 * 1024 * 1024)

// Where uploaded bytes live: <UPLOAD_ROOT>/<userId>/<uuid>.<verified-ext>.
//
// A RELATIVE value resolves against the repository root rather than the working
// directory, so `server/uploads` means the same thing however the process was
// started — matching how this file finds .env. An ABSOLUTE value is taken as
// given, which is the point of making this configurable: file bytes are the one
// thing here that grows without bound, and they usually belong on a different
// volume from the application.
//
// The default reproduces the previous hardcoded location exactly, so an
// existing install that never sets this keeps working untouched.
const UPLOAD_ROOT = path.resolve(
    REPO_ROOT,
    process.env.UPLOAD_ROOT || path.join('server', 'uploads')
)

// True when `child` is `parent` or sits beneath it. path.relative does the
// comparison, which on Windows is case-insensitive — a plain string prefix test
// would miss C:\HOMEBASE\Client against C:\Homebase\client.
const isInside = (child, parent) => {
    const rel = path.relative(parent, child)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// Uploaded bytes must never sit inside a directory a web server publishes.
// Both halves of `client/` qualify: the reverse proxy serves `client/dist` as
// static files in production, and the Vite dev server serves out of `client/`
// itself in development. Either way every uploaded file becomes downloadable by
// anyone who can guess the URL — no authentication, no ownership check, handed
// out by a process that has never heard of either.
//
// This is the same rule as "uploads/ must never be served through
// express.static", pointed at the other web server in the stack. Fatal rather
// than a warning: the failure is silent, and it is unauthenticated disclosure
// of every member's files.
const CLIENT_DIR = path.join(REPO_ROOT, 'client')
if (isInside(UPLOAD_ROOT, CLIENT_DIR)) {
    fatal.push(
        `UPLOAD_ROOT resolves to ${UPLOAD_ROOT}, which is inside ${CLIENT_DIR}. ` +
        'That directory is served as static files, so every uploaded file would be ' +
        'publicly downloadable. Point it outside client/.'
    )
}

// ── Mail ─────────────────────────────────────────────────────────────────
// These were read directly by config/mailer.js, which contradicted this file's
// own "only place that reads process.env" contract and left the one piece of
// configuration with no startup validation at all. Centralized here so the
// admin health panel can report whether mail is configured without reaching
// into process.env itself.
const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = Number(process.env.SMTP_PORT || 587)
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER

// Not fatal: the app runs fine without mail until something tries to send.
// 2FA and approval notices are the things that break, so warn rather than exit.
const SMTP_CONFIGURED = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)

if (!SMTP_CONFIGURED && !isTest) {
    warnings.push(
        'SMTP is not fully configured (needs SMTP_HOST, SMTP_USER, SMTP_PASS). ' +
        'Two-factor codes and account-approval emails will fail to send.'
    )
}

// ── Audit trail ──────────────────────────────────────────────────────────
// audit() always writes to stdout. This governs the second, durable sink that
// backs the admin dashboard's log viewer.
//
// The trail holds IP addresses and a behavioural record of every member, so it
// ages out rather than accumulating forever. 90 days is long enough to
// investigate an incident noticed late and short enough to bound the exposure.
const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || 90)
const AUDIT_PERSIST = process.env.AUDIT_PERSIST !== 'false'

if (!Number.isFinite(AUDIT_RETENTION_DAYS) || AUDIT_RETENTION_DAYS < 1) {
    fatal.push('AUDIT_RETENTION_DAYS must be a positive number of days')
}

// ── Password policy ──────────────────────────────────────────────────────
const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH || 12)
// Checks candidate passwords against Have I Been Pwned using k-anonymity (only
// a 5-character SHA-1 prefix ever leaves this server). Fails open on a network
// error so an outage can't lock users out of registration.
const PASSWORD_BREACH_CHECK = process.env.PASSWORD_BREACH_CHECK !== 'false'

// ── Report and exit ──────────────────────────────────────────────────────
for (const warning of warnings) {
    console.warn(`[config] WARNING: ${warning}`)
}

if (fatal.length > 0) {
    for (const problem of fatal) {
        console.error(`[config] FATAL: ${problem}`)
    }
    console.error('[config] Refusing to start with an incomplete configuration. See .env.example.')
    process.exit(1)
}

if (!isProduction && !isTest) {
    console.warn(
        `[config] NODE_ENV is "${NODE_ENV}". Set NODE_ENV=production before deploying — ` +
        'several libraries change behaviour based on it.'
    )
}

module.exports = {
    NODE_ENV,
    isProduction,
    isTest,
    PORT: Number(process.env.PORT || 3000),
    MONGO_URI,
    JWT_SECRET,
    JWT_PREAUTH_SECRET,
    SESSION_TOKEN_TTL,
    PREAUTH_TOKEN_TTL,
    DEVICE_TRUST_TTL_MS,
    CORS_ORIGINS,
    TRUST_PROXY,
    MAX_UPLOAD_BYTES,
    USER_STORAGE_QUOTA_BYTES,
    UPLOAD_ROOT,
    PASSWORD_MIN_LENGTH,
    PASSWORD_BREACH_CHECK,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
    SMTP_CONFIGURED,
    AUDIT_RETENTION_DAYS,
    AUDIT_PERSIST
}
