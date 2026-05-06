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

module.exports = { protect } // Exports the middleware so routes can import and use it to guard protected endpoints