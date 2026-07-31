// All JWT issuance and verification. Nothing else in the codebase should call
// jwt.sign or jwt.verify directly.
//
// Two token types exist, and they must never be interchangeable:
//
//   session  — full API access. Signed with JWT_SECRET.
//   pre-auth — issued after a password check while a 2FA challenge is pending.
//              Signed with JWT_PREAUTH_SECRET, a DIFFERENT key.
//
// The separation is enforced twice, independently:
//   1. Different signing keys, so a pre-auth token fails signature
//      verification in verifySessionToken outright.
//   2. A POSITIVE scope assertion — a token must declare the scope it is being
//      used for. A blocklist ("reject scope === 'login-2fa'") fails open the
//      moment a third token type is added; this fails closed.

const jwt = require('jsonwebtoken')
const {
    JWT_SECRET,
    JWT_PREAUTH_SECRET,
    SESSION_TOKEN_TTL,
    PREAUTH_TOKEN_TTL
} = require('../config/env')

const SESSION_SCOPE = 'session'
const PREAUTH_SCOPE = 'login-2fa'

// `tv` pins the token to the user's current tokenVersion. Bumping that field
// (password change, 2FA disable, logout) invalidates every token issued before
// the bump — checked in `protect`, which already loads the user document.
const signSessionToken = (user) =>
    jwt.sign(
        { id: user._id.toString(), scope: SESSION_SCOPE, tv: user.tokenVersion ?? 0 },
        JWT_SECRET,
        { expiresIn: SESSION_TOKEN_TTL }
    )

// Throws (JsonWebTokenError / TokenExpiredError / Error) on any failure.
// Callers translate that into a 401 — never leak which check failed.
const verifySessionToken = (token) => {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (decoded.scope !== SESSION_SCOPE) {
        throw new jwt.JsonWebTokenError('token is not a session token')
    }
    return decoded
}

const signPreAuthToken = (user) =>
    jwt.sign(
        { id: user._id.toString(), scope: PREAUTH_SCOPE },
        JWT_PREAUTH_SECRET,
        { expiresIn: PREAUTH_TOKEN_TTL }
    )

const verifyPreAuthToken = (token) => {
    const decoded = jwt.verify(token, JWT_PREAUTH_SECRET)
    if (decoded.scope !== PREAUTH_SCOPE) {
        throw new jwt.JsonWebTokenError('token is not a pre-auth token')
    }
    return decoded
}

module.exports = {
    SESSION_SCOPE,
    PREAUTH_SCOPE,
    signSessionToken,
    verifySessionToken,
    signPreAuthToken,
    verifyPreAuthToken
}
