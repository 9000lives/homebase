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
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })

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
    PASSWORD_MIN_LENGTH,
    PASSWORD_BREACH_CHECK
}
