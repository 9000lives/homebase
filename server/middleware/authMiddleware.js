//Auth Middleware, originally from Professor Bibek Upadhayay!

const asyncHandler = require('express-async-handler') // Wraps async functions so thrown errors reach the Express error handler
const User = require('../models/userModel')
const { verifySessionToken } = require('../utils/tokens')
const { unauthorized, forbidden } = require('../utils/httpError')
const { audit, actorFrom } = require('../utils/logger')

// Verifies a SESSION token and loads the user behind it.
//
// Three things must all hold, and each is checked positively:
//   1. The token verifies against JWT_SECRET *and* declares scope 'session'.
//      Pre-auth tokens (issued mid-2FA-challenge) are signed with a different
//      key and carry a different scope, so they fail both ways. Before this,
//      protect ignored `scope` entirely — a pre-auth token, handed out after a
//      password-only check, authenticated every endpoint for its full 10-minute
//      life and reduced 2FA to decoration.
//   2. The token's `tv` claim matches the user's current tokenVersion, so a
//      password change / 2FA disable / logout actually invalidates outstanding
//      tokens instead of leaving them live until natural expiry.
//   3. The account is `active`.
const protect = asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization

    if (!header || !header.startsWith('Bearer ')) {
        throw unauthorized('Not authorized, no token')
    }

    const token = header.slice('Bearer '.length).trim()
    if (!token) {
        throw unauthorized('Not authorized, no token')
    }

    let decoded
    try {
        decoded = verifySessionToken(token)
    } catch {
        // One message for expired, malformed, wrong-scope and bad-signature —
        // an attacker learns nothing about why their token was refused.
        throw unauthorized('Not authorized, invalid token')
    }

    const user = await User.findById(decoded.id).select('-passwordHash')

    // A valid token can still name a user that has since been deleted —
    // without this, the status check below throws a TypeError and surfaces as a 500.
    if (!user) {
        throw unauthorized('Not authorized, invalid token')
    }

    // Token issued before the user's credentials or sessions were invalidated.
    if ((decoded.tv ?? null) !== (user.tokenVersion ?? 0)) {
        audit('session.revoked_token_used', { ...actorFrom(req), userId: user._id.toString() })
        throw unauthorized('Session has expired, please sign in again')
    }

    // Status checks are deliberately NOT inside a try/catch, so a 403 for a
    // suspended account is never silently converted into a 401 for a bad token.
    if (user.status === 'pending') {
        throw forbidden('Account is awaiting admin approval')
    }

    if (user.status === 'suspended') {
        throw forbidden('Account has been suspended')
    }

    req.user = user
    next()
})

// Role check only — assumes `protect` has already run and populated req.user.
// Kept separate so it can be chained after protect rather than wrapping it.
const requireAdmin = asyncHandler(async (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        audit('admin.access_denied', { ...actorFrom(req), path: req.originalUrl })
        throw forbidden('Not authorized') // authenticated, but not allowed here
    }
    next()
})

// An array, not a wrapper. The previous version called protect(req, res, cb) and
// passed cb as protect's `next` — but express-async-handler does
// `Promise.resolve(fn(...args)).catch(next)`, so when protect THREW (pending or
// suspended account) it called cb with the error, cb ignored its argument, saw
// role === 'admin', and let the request through. A suspended admin kept every
// admin power. Express accepts an array anywhere it accepts middleware, so the
// two run in sequence and a throw in protect short-circuits properly.
const adminProtect = [protect, requireAdmin]

module.exports = { protect, adminProtect, requireAdmin }
