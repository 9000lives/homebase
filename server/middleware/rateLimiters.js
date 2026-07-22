const rateLimit = require('express-rate-limit')

// Plain login attempts (email + password) — slows down credential-stuffing/guessing.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts, please try again later.' }
})

// "Send me a code" endpoints — capped lower since sending is rarer than checking,
// and an uncapped endpoint here can be used to spam a user's inbox.
const otpRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many code requests, please wait before trying again.' }
})

// "Check this code" endpoints — a 6-digit code is only 1,000,000 combinations,
// so this is the primary defense against brute-forcing a still-valid code.
const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many verification attempts, please wait before trying again.' }
})

module.exports = { loginLimiter, otpRequestLimiter, otpVerifyLimiter }
