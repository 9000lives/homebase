// Device-bound 2FA trust.
//
// The previous "remember this login for a week" was a single Date on the user
// document. Any login for that account, from anywhere in the world, consulted
// the same field — so after one legitimate 2FA login the challenge was skipped
// for everybody holding the password, for seven days. The feature's name
// promises per-device trust; the implementation granted per-account trust.
//
// Now: verifying a code mints a high-entropy device token. The client stores
// it and presents it on subsequent logins. Only that device skips the
// challenge, and only until its own expiry.
//
// Tokens are stored as SHA-256 hashes, not plaintext, so a database read does
// not yield working bypass credentials. SHA-256 rather than bcrypt because
// these are 256-bit random values — there is nothing to brute-force — and
// login must compare against every device on the account.

const crypto = require('crypto')
const { DEVICE_TRUST_TTL_MS } = require('../config/env')

// Cap the list so an attacker with the password cannot grow the user document
// without bound by repeatedly completing challenges.
const MAX_TRUSTED_DEVICES = 10

const hashDeviceToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

const generateDeviceToken = () => crypto.randomBytes(32).toString('hex')

const isExpired = (device) => !device.expiresAt || device.expiresAt.getTime() <= Date.now()

// True if `token` matches a live trusted device on `user`. Mutates lastUsedAt;
// the caller persists.
//
// Comparison is over hashes of equal, fixed length, so timingSafeEqual is well
// defined here.
const isTrustedDevice = (user, token) => {
    if (typeof token !== 'string' || token.length !== 64) return false

    const candidate = Buffer.from(hashDeviceToken(token), 'hex')

    for (const device of user.trustedDevices || []) {
        if (isExpired(device)) continue
        const stored = Buffer.from(device.tokenHash, 'hex')
        if (stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate)) {
            device.lastUsedAt = new Date()
            return true
        }
    }
    return false
}

// Mint a new trusted device, dropping expired entries and trimming to the cap
// (oldest first). Returns the plaintext token — the only time it exists.
const trustDevice = (user, { userAgent } = {}) => {
    const token = generateDeviceToken()

    const live = (user.trustedDevices || []).filter((d) => !isExpired(d))

    live.push({
        tokenHash: hashDeviceToken(token),
        expiresAt: new Date(Date.now() + DEVICE_TRUST_TTL_MS),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 200) : null
    })

    live.sort((a, b) => a.createdAt - b.createdAt)
    user.trustedDevices = live.slice(-MAX_TRUSTED_DEVICES)

    return token
}

// Drop a single device (sign-out on this browser).
const revokeDevice = (user, token) => {
    if (typeof token !== 'string') return
    const target = hashDeviceToken(token)
    user.trustedDevices = (user.trustedDevices || []).filter((d) => d.tokenHash !== target)
}

// Drop every device — used when 2FA is disabled or credentials change.
const revokeAllDevices = (user) => {
    user.trustedDevices = []
}

module.exports = {
    MAX_TRUSTED_DEVICES,
    generateDeviceToken,
    hashDeviceToken,
    isTrustedDevice,
    trustDevice,
    revokeDevice,
    revokeAllDevices
}
