const express = require('express')
const router = express.Router()

const {
    submitFeedback //POST send a message to the admin
} = require('../controllers/feedbackController')

const { protect } = require('../middleware/authMiddleware')
const { feedbackLimiter } = require('../middleware/rateLimiters')

// Write-only for members, and there is deliberately no GET here. Adding one
// would be a behaviour change rather than a feature: with no read path at all,
// no member can reach another member's feedback however the admin-side filters
// drift later, and a probe gets a 404 from notFoundHandler rather than meeting
// an authorization check that could be written wrong.
//
// `protect` runs BEFORE the limiter so byUserOrIp sees req.user and the bucket
// is per-account rather than per-address — same ordering as the search route in
// userRoutes.js.
//
// The admin list/triage/delete routes live in adminRoutes.js instead, so every
// admin-gated path stays behind that file's single router.use guard.
router.post('/', protect, feedbackLimiter, submitFeedback)

module.exports = router
