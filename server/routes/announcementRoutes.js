const express = require('express')
const router = express.Router()

const {
    listMyAnnouncements,   //GET   unseen, unexpired announcements for this user
    markAnnouncementsSeen  //PATCH advance this user's seen watermark
} = require('../controllers/announcementController')

const { protect } = require('../middleware/authMiddleware')

// Reading announcements needs a session and nothing more. `protect` already
// rejects pending and suspended accounts, so the audience is exactly the active
// members without a second status check here.
//
// The admin-side create/list/delete routes live in adminRoutes.js instead, so
// every admin-gated path stays behind that file's single router.use guard.
router.get('/', protect, listMyAnnouncements)
router.patch('/seen', protect, markAnnouncementsSeen)

module.exports = router
