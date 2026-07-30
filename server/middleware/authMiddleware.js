//Auth Middleware from Professor Bibek Upadhayay!

const jwt = require('jsonwebtoken') // Imports JWT library to verify incoming tokens
const asyncHandler = require('express-async-handler') // Wraps async functions to automatically catch errors and pass them to Express error handler — no need for try/catch everywhere
const User = require('../models/userModel') // Imports User model to look up the user from the database once token is verified

const protect = asyncHandler(async (req, res, next) => {
    let token

    if (
        req.headers.authorization && 
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1]
            const decoded = jwt.verify(token, process.env.JWT_SECRET)
            req.user = await User.findById(decoded.id).select('-passwordHash')
        } catch (error) {
            res.status(401)
            throw new Error('Not authorized, invalid token')
        }

        // a valid token can still name a user that has since been deleted —
        // without this, req.user.status below throws a TypeError and surfaces as a 500
        if (!req.user) {
            res.status(401)
            throw new Error('Not authorized, invalid token')
        }

        // status checks OUTSIDE the try/catch so they aren't swallowed
        if (req.user.status === 'pending') {
            res.status(403)
            throw new Error('Account is awaiting admin approval')
        }

        if (req.user.status === 'suspended') {
            res.status(403)
            throw new Error('Account has been suspended')
        }

        next()
    }

    if (!token) {
        res.status(401)
        throw new Error('Not authorized, no token')
    }
})

// Role check only — assumes `protect` has already run and populated req.user.
// Kept separate so it can be chained after protect rather than wrapping it.
const requireAdmin = asyncHandler(async (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403) // authenticated, but not allowed here
        throw new Error('Not authorized')
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

module.exports = { protect, adminProtect, requireAdmin } // Exports the middleware so routes can import and use it to guard protected endpoints