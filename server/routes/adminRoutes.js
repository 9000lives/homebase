const express = require('express')
const router = express.Router()

const {
    getStorageStats,     //GET    platform-wide storage totals grouped by file type
    listUsers,           //GET    accounts by status and/or search term
    getUserDetail,       //GET    one account plus its owned-file storage total
    updateUserStatus,    //PATCH  promote/suspend an account
    revokeUserSessions,  //POST   sign an account out everywhere
    resetUserTwoFactor,  //POST   turn off an account's 2FA (the only recovery path)
    deleteUser           //DELETE remove an account and everything it owns
} = require('../controllers/adminController')

const {
    createAnnouncement, //POST   broadcast a new announcement
    listAnnouncements,  //GET    every announcement, newest first
    deleteAnnouncement  //DELETE retract one
} = require('../controllers/announcementController')

const {
    listFeedback,         //GET    every feedback row, newest first
    updateFeedbackStatus, //PATCH  move one through the triage workflow
    deleteFeedback        //DELETE remove one
} = require('../controllers/feedbackController')

const {
    listAuditLog,    //GET filtered, reverse-chronological audit trail
    listAuditEvents  //GET event names present, for the filter control
} = require('../controllers/adminAuditController')

const {
    getSystemHealth, //GET  DB/mail/disk/process state
    getSystemConfig, //GET  the non-secret half of the running configuration
    sendTestEmail    //POST prove the mail path works
} = require('../controllers/adminSystemController')

const { protect, requireAdmin } = require('../middleware/authMiddleware')
const { testEmailLimiter } = require('../middleware/rateLimiters')

// Every route in this file is admin-only. Applied once here rather than
// per-route so a new endpoint can't accidentally ship unguarded.
router.use(protect, requireAdmin)

router.get('/stats/storage', getStorageStats)

// NOTE: '/users/:id' will swallow any literal segment declared after it
// (e.g. '/users/export'). Put literals above the param route.
router.get('/users', listUsers)
router.get('/users/:id', getUserDetail)
router.patch('/users/:id/status', updateUserStatus)

// Support actions. These sit below '/users/:id' safely because each carries a
// further literal segment (or a distinct method) — but a bare '/users/<word>'
// added later must still go above line 41.
router.post('/users/:id/revoke-sessions', revokeUserSessions)
router.post('/users/:id/reset-2fa', resetUserTwoFactor)
router.delete('/users/:id', deleteUser)

// Announcements. A separate prefix, so the '/users/:id' ordering hazard above
// doesn't apply — but '/announcements' literals still belong above
// '/announcements/:id' for the same reason.
router.post('/announcements', createAnnouncement)
router.get('/announcements', listAnnouncements)
router.delete('/announcements/:id', deleteAnnouncement)

// Feedback. Members submit at POST /api/feedback (feedbackRoutes.js); reading
// and triaging are admin actions and live here. Same ordering rule as above: a
// bare '/feedback/<word>' literal added later must go above '/feedback/:id'.
// The two param routes below are safe as written — one carries a further
// literal segment, the other a distinct method.
router.get('/feedback', listFeedback)
router.patch('/feedback/:id/status', updateFeedbackStatus)
router.delete('/feedback/:id', deleteFeedback)

// Audit trail. '/audit/events' is a literal and must stay above any future
// '/audit/:id'.
router.get('/audit/events', listAuditEvents)
router.get('/audit', listAuditLog)

// System health. The test-email route gets its own limiter — it is an
// authenticated trigger for outbound mail, which the global limiter does not
// meaningfully bound.
router.get('/system/health', getSystemHealth)
router.get('/system/config', getSystemConfig)
router.post('/system/test-email', testEmailLimiter, sendTestEmail)

module.exports = router
