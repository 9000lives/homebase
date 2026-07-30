const asyncHandler = require('express-async-handler')
const mongoose = require('mongoose')
const User = require('../models/userModel')
const File = require('../models/fileModel')
const { sendMail } = require('../config/mailer')
const { CATEGORIES, categoryBranches } = require('../utils/mimeCategories')

// Read the whitelist straight off the schema so it can never drift from the model
const ALLOWED_STATUSES = User.schema.path('status').enumValues

// @desc    Total storage across every file in the platform, grouped by file type.
// @route   GET /api/admin/stats/storage
// @access  Private/Admin
const getStorageStats = asyncHandler(async (req, res) => {
    // No $match — this is deliberately every file in the DB, not per-user.
    const rows = await File.aggregate([
        {
            $group: {
                _id: { $switch: { branches: categoryBranches(), default: 'other' } },
                // size has no schema default, so older docs may not have it
                bytes: { $sum: { $ifNull: ['$size', 0] } },
                fileCount: { $sum: 1 }
            }
        }
    ])

    const byKey = new Map(rows.map((r) => [r._id, r]))

    // Always emit all six, zero-filled and in CATEGORIES order. A category that
    // vanished from the response at 0 bytes would shuffle the donut's colours.
    const categories = CATEGORIES.map(({ key, label }) => ({
        key,
        label,
        bytes: byKey.get(key)?.bytes ?? 0,
        fileCount: byKey.get(key)?.fileCount ?? 0
    }))

    res.status(200).json({
        totalBytes: categories.reduce((sum, c) => sum + c.bytes, 0),
        fileCount: categories.reduce((sum, c) => sum + c.fileCount, 0),
        categories
    })
})

// @desc    List accounts, filtered by status and/or a name/email search term.
// @route   GET /api/admin/users?status=<status>&q=<term>&limit=<n>
// @access  Private/Admin
const listUsers = asyncHandler(async (req, res) => {
    const { status, q, limit } = req.query

    // Refuse to dump the whole user table on an empty request — same precedent
    // as userController.searchUsers returning [] for a blank q.
    if (!status && !(q && q.trim())) {
        return res.json([])
    }

    const filter = {}

    if (status) {
        if (!ALLOWED_STATUSES.includes(status)) {
            res.status(400)
            throw new Error(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`)
        }
        filter.status = status
    }

    if (q && q.trim()) {
        // escape regex metacharacters so search terms like "a.b" or "(" don't break the query
        const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(escaped, 'i')
        filter.$or = [{ email: pattern }, { displayName: pattern }]
    }

    // Two deliberate differences from userController.searchUsers: no
    // status:'active' filter and no self-exclusion. An admin must be able to
    // find suspended accounts and see their own row — self-protection belongs
    // on the mutation, not the read.
    const users = await User.find(filter)
        .select('_id displayName email role status createdAt')
        // approval queue: longest-waiting first. free-text search: alphabetical.
        .sort(status && !q ? { createdAt: 1 } : { displayName: 1 })
        .limit(Math.min(Number(limit) || 25, 100))

    res.json(
        users.map((u) => ({
            id: u._id,
            displayName: u.displayName,
            email: u.email,
            role: u.role,
            status: u.status,
            createdAt: u.createdAt
        }))
    )
})

// @desc    One account's profile plus the storage consumed by the files it owns.
// @route   GET /api/admin/users/:id
// @access  Private/Admin
const getUserDetail = asyncHandler(async (req, res) => {
    // new ObjectId() throws on a malformed id, so validate before constructing one
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400)
        throw new Error('Invalid user id')
    }

    const user = await User.findById(req.params.id)
        .select('_id displayName email role status twoFactorEnabled createdAt')

    if (!user) {
        res.status(404)
        throw new Error('User not found')
    }

    // Owned files only — sharedWith is deliberately NOT consulted, so a shared
    // file is billed once, to its owner.
    //
    // $match inside aggregate() does NOT run Mongoose casting: a string ownerId
    // would silently match zero documents and report 0 B with no error. The
    // explicit ObjectId is load-bearing.
    const [totals] = await File.aggregate([
        { $match: { ownerId: new mongoose.Types.ObjectId(req.params.id) } },
        {
            $group: {
                _id: null,
                bytes: { $sum: { $ifNull: ['$size', 0] } },
                fileCount: { $sum: 1 }
            }
        }
    ])

    res.status(200).json({
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        storage: { bytes: totals?.bytes ?? 0, fileCount: totals?.fileCount ?? 0 }
    })
})

// @desc    Change an account's status (the whitelist promotion/suspension path).
// @route   PATCH /api/admin/users/:id/status
// @access  Private/Admin
const updateUserStatus = asyncHandler(async (req, res) => {
    const { status } = req.body

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400)
        throw new Error('Invalid user id')
    }

    if (!ALLOWED_STATUSES.includes(status)) {
        res.status(400)
        throw new Error(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`)
    }

    const user = await User.findById(req.params.id)

    if (!user) {
        res.status(404)
        throw new Error('User not found')
    }

    // Suspending yourself is unrecoverable without direct DB access
    if (user._id.equals(req.user._id)) {
        res.status(400)
        throw new Error("You can't change your own account status")
    }

    // Same reasoning one step out: admins can't be locked out from in-app.
    // Promoting/demoting an admin is a deliberate DB-only operation.
    if (user.role === 'admin') {
        res.status(400)
        throw new Error('Admin accounts cannot be changed here')
    }

    const wasPending = user.status === 'pending'

    // assign then save() so the schema's enum validation still runs
    user.status = status
    const updated = await user.save()

    // No token revocation needed: protect re-reads the user from the DB on
    // every request, so a suspension bites on the target's next call.
    res.status(200).json({
        id: updated._id,
        displayName: updated.displayName,
        email: updated.email,
        role: updated.role,
        status: updated.status
    })

    // Fire-and-forget AFTER the response: a mail outage must never fail (or
    // delay) an approval that already saved. Only on a genuine pending→active
    // transition, so re-activating an active account doesn't re-send.
    if (wasPending && updated.status === 'active') {
        sendMail({
            to: updated.email,
            subject: 'Your Homebase account has been approved',
            text:
                `Hi ${updated.displayName},\n\n` +
                `Your Homebase account has been approved — you can sign in now.\n`
        }).catch((err) => console.error('approval email failed:', err.message))
    }
})

module.exports = { getStorageStats, listUsers, getUserDetail, updateUserStatus }
