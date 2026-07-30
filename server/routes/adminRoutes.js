const express = require('express')
const router = express.Router()

const {
    getStorageStats,  //GET  platform-wide storage totals grouped by file type
    listUsers,        //GET  accounts by status and/or search term
    getUserDetail,    //GET  one account plus its owned-file storage total
    updateUserStatus  //PATCH promote/suspend an account
} = require('../controllers/adminController')

const { protect, requireAdmin } = require('../middleware/authMiddleware')

// Every route in this file is admin-only. Applied once here rather than
// per-route so a new endpoint can't accidentally ship unguarded.
router.use(protect, requireAdmin)

router.get('/stats/storage', getStorageStats)

// NOTE: '/users/:id' will swallow any literal segment declared after it
// (e.g. '/users/export'). Put literals above the param route.
router.get('/users', listUsers)
router.get('/users/:id', getUserDetail)
router.patch('/users/:id/status', updateUserStatus)

module.exports = router
