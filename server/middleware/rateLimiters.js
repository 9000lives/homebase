const { rateLimit, ipKeyGenerator } = require('express-rate-limit')
const { isTest } = require('../config/env')
const { audit, actorFrom } = require('../utils/logger')

// Falls back to the client IP when there is no authenticated user.
// ipKeyGenerator normalizes IPv6 into a /56 subnet — without it, a single
// client can rotate through its address block and get a fresh bucket per
// request, which silently defeats the limiter.
const byUserOrIp = (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip))

// Shared factory so every limiter logs consistently and returns the same
// JSON error shape as the rest of the API.
const make = ({ windowMs, max, message, name, keyGenerator }) =>
    rateLimit({
        windowMs,
        limit: max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator,
        // The test suite drives dozens of requests from one address on purpose.
        // Scoped strictly to NODE_ENV=test — there is no way to reach this from
        // a development or production process.
        skip: () => isTest,
        handler: (req, res) => {
            audit('ratelimit.tripped', { ...actorFrom(req), limiter: name, path: req.originalUrl })
            res.status(429).json({ message })
        }
    })

// Backstop for every route. Generous enough that normal use never notices,
// low enough to blunt scripted abuse of any endpoint that has no limiter of
// its own — including ones added in future.
const globalLimiter = make({
    name: 'global',
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many requests, please slow down.'
})

// Plain login attempts (email + password) — slows down credential-stuffing/guessing.
const loginLimiter = make({
    name: 'login',
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts, please try again later.'
})

// Registration is the only unauthenticated write endpoint, and each call costs
// a deliberately-expensive bcrypt cost-12 hash (~250ms of CPU) plus a row in
// the admin approval queue. Uncapped it is simultaneously a CPU-exhaustion
// attack, a database-growth attack, and a denial of the admin workflow.
const registerLimiter = make({
    name: 'register',
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Too many accounts created from this address. Please try again later.'
})

// "Send me a code" endpoints — capped lower since sending is rarer than checking,
// and an uncapped endpoint here can be used to spam a user's inbox.
const otpRequestLimiter = make({
    name: 'otp-request',
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many code requests, please wait before trying again.'
})

// "Check this code" endpoints — a 6-digit code is only 1,000,000 combinations,
// so this is the primary defense against brute-forcing a still-valid code.
const otpVerifyLimiter = make({
    name: 'otp-verify',
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many verification attempts, please wait before trying again.'
})

// The user-search endpoint returns real names and email addresses. Uncapped, a
// single approved account could enumerate the entire member list 15 rows at a
// time. Keyed by account rather than IP — the limit is about how much of the
// directory one user may extract, not about network origin.
const userSearchLimiter = make({
    name: 'user-search',
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: 'Too many searches, please wait before trying again.',
    keyGenerator: byUserOrIp
})

// Member-authored text landing in the admin's triage queue. Uncapped, one
// member can push thousands of 1000-character rows into the dashboard — a
// database-growth problem, and more practically a denial of the admin's
// attention, which is the entire point of that box. It is the same shape of
// abuse as registration (the other endpoint that fills an admin queue), so it
// borrows registerLimiter's one-hour window rather than the house 15-minute
// one: what needs bounding here is sustained volume, not a burst. Keyed by
// account — the limit is about how much one member may file, not about network
// origin.
const feedbackLimiter = make({
    name: 'feedback',
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Too much feedback sent recently, please try again later.',
    keyGenerator: byUserOrIp
})

// Uploads are expensive in disk, CPU and event-loop time. The per-user storage
// quota bounds total consumption; this bounds the rate of getting there.
const uploadLimiter = make({
    name: 'upload',
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many uploads, please wait before trying again.',
    keyGenerator: byUserOrIp
})

// Zip generation walks the tree and streams a compressed archive — much more
// costly than an ordinary read.
const downloadLimiter = make({
    name: 'download',
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Too many downloads, please wait before trying again.',
    keyGenerator: byUserOrIp
})

// The admin "is mail working?" button. Admin-only and harmless in intent, but
// it is still an authenticated trigger for outbound mail — it spends SMTP quota
// and can put the sending domain's reputation at risk if held down. The global
// limiter's 1000/15min is not a meaningful bound on that.
const testEmailLimiter = make({
    name: 'test-email',
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many test emails, please wait before trying again.',
    keyGenerator: byUserOrIp
})

module.exports = {
    globalLimiter,
    loginLimiter,
    registerLimiter,
    otpRequestLimiter,
    otpVerifyLimiter,
    userSearchLimiter,
    feedbackLimiter,
    uploadLimiter,
    downloadLimiter,
    testEmailLimiter
}
