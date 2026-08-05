const asyncHandler = require('express-async-handler')
const mongoose = require('mongoose')
const fsp = require('fs/promises')
const path = require('path')
const User = require('../models/userModel')
const File = require('../models/fileModel')
const Folder = require('../models/folderModel')
const { sendMail } = require('../config/mailer')
const { CATEGORIES, categoryBranches } = require('../utils/mimeCategories')
const { requireObjectId } = require('../utils/ownership')
const { badRequest, notFound } = require('../utils/httpError')
const { log, audit, actorFrom } = require('../utils/logger')
const { revokeAllDevices } = require('../utils/deviceTrust')
const { clearOtp } = require('../utils/otp')
const { UPLOAD_ROOT } = require('../config/env')
const { resolveStoredPath } = require('../utils/fileStorage')

// Read the whitelist straight off the schema so it can never drift from the model
const ALLOWED_STATUSES = User.schema.path('status').enumValues

// Loads the target of an admin action and refuses the two accounts an admin
// must never act on through the API.
//
// Both rules were already enforced on updateUserStatus; every destructive
// action added since needs the same pair, so they live in one place rather than
// being restated (and eventually forgotten) per handler.
//
//   self  — suspending, session-revoking or deleting yourself is unrecoverable
//           without direct database access.
//   admin — admins can't be locked out or removed from in-app. Promoting or
//           demoting one stays a deliberate DB-only operation.
const loadActionableUser = async (req, { select } = {}) => {
    requireObjectId(req.params.id, 'user id')

    const query = User.findById(req.params.id)
    if (select) query.select(select)
    const user = await query

    if (!user) throw notFound('User not found')

    if (user._id.equals(req.user._id)) {
        throw badRequest("You can't perform this action on your own account")
    }

    if (user.role === 'admin') {
        throw badRequest('Admin accounts cannot be changed here')
    }

    return user
}

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
            throw badRequest(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`)
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
    requireObjectId(req.params.id, 'user id')

    const user = await User.findById(req.params.id)
        .select('_id displayName email role status twoFactorEnabled createdAt')

    if (!user) {
        throw notFound('User not found')
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

    if (!ALLOWED_STATUSES.includes(status)) {
        throw badRequest(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`)
    }

    const user = await loadActionableUser(req)

    const previousStatus = user.status
    const wasPending = previousStatus === 'pending'

    // assign then save() so the schema's enum validation still runs
    user.status = status
    const updated = await user.save()

    audit('admin.user_status_changed', {
        ...actorFrom(req),
        targetUserId: updated._id.toString(),
        from: previousStatus,
        to: updated.status
    })

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
        }).catch((error) => log.error('approval email failed', {
            targetUserId: updated._id.toString(),
            error
        }))
    }
})

// @desc    Sign an account out everywhere.
// @route   POST /api/admin/users/:id/revoke-sessions
// @access  Private/Admin
//
// The support answer to "I think someone got into my account" — suspending was
// previously the only lever, and it locks the rightful owner out too.
const revokeUserSessions = asyncHandler(async (req, res) => {
    const user = await loadActionableUser(req, { select: '+trustedDevices' })

    // Same mechanism as logout and password change: protect compares this
    // against the token's `tv` claim, so every outstanding token for the
    // account fails on its next request.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1

    // Sessions alone aren't enough. A trusted device skips the 2FA challenge,
    // so leaving that intact would let whoever holds the password walk straight
    // back in without a second factor.
    revokeAllDevices(user)

    await user.save()

    audit('admin.sessions_revoked', {
        ...actorFrom(req),
        targetUserId: user._id.toString()
    })

    res.status(200).json({
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        tokenVersion: user.tokenVersion
    })
})

// @desc    Turn off an account's two-factor authentication.
// @route   POST /api/admin/users/:id/reset-2fa
// @access  Private/Admin
//
// Self-service password reset now exists (POST /api/users/password/forgot), but
// it delivers its code to the same inbox 2FA does — so it is no help to someone
// who has lost access to that inbox. This stays the only recovery route for
// them, and the only one that can move an account off an address they can no
// longer read.
const resetUserTwoFactor = asyncHandler(async (req, res) => {
    const user = await loadActionableUser(req, {
        select: '+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodeAttempts +trustedDevices'
    })

    user.twoFactorEnabled = false
    clearOtp(user)
    revokeAllDevices(user)

    // This lowers the account's security, so every existing session goes with
    // it — if the account was already compromised, the attacker's session must
    // not survive the reset that was meant to recover from it.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1

    await user.save()

    audit('admin.2fa_reset', {
        ...actorFrom(req),
        targetUserId: user._id.toString()
    })

    res.status(200).json({
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        twoFactorEnabled: user.twoFactorEnabled
    })

    // After the response, like the approval notice. The user must be told their
    // second factor was switched off — if it wasn't them who asked, this is the
    // signal that something is wrong.
    sendMail({
        to: user.email,
        subject: 'Two-factor authentication was turned off on your Homebase account',
        text:
            `Hi ${user.displayName},\n\n` +
            `An administrator turned off two-factor authentication for your Homebase ` +
            `account, and signed you out of all devices.\n\n` +
            `If you didn't ask for this, contact the administrator immediately.\n\n` +
            `You can turn two-factor authentication back on from Settings once you sign in.\n`
    }).catch((error) => log.error('2FA reset email failed', {
        targetUserId: user._id.toString(),
        error
    }))
})

// @desc    Delete an account and everything it owns.
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
    const user = await loadActionableUser(req)

    // Typing the address is the confirmation. A destructive, irreversible action
    // reached by one click in a list needs something the admin can only supply
    // by looking at the right row.
    const confirmEmail = typeof req.body.confirmEmail === 'string'
        ? req.body.confirmEmail.trim().toLowerCase()
        : ''

    if (confirmEmail !== user.email.toLowerCase()) {
        throw badRequest("Type the account's email address to confirm deletion")
    }

    const userId = user._id
    const files = await File.find({ ownerId: userId }).select('_id storagePath')

    // Database first, then a best-effort unlink, treating ENOENT as success.
    // A file with no row is recoverable garbage; a row pointing at nothing
    // crashed the zip download path. Do not reverse this ordering.
    //
    // No recursive walk is needed here as it is in deleteFolder: everything the
    // account owns is going, so one owner-scoped query per collection covers
    // the whole tree regardless of its shape.
    await File.deleteMany({ ownerId: userId })
    await Folder.deleteMany({ ownerId: userId })

    // A departing member's id left behind in other people's sharedWith arrays
    // is a dangling reference that surfaces as a null in the share list's
    // populate join.
    await Promise.all([
        File.updateMany({ sharedWith: userId }, { $pull: { sharedWith: userId } }),
        Folder.updateMany({ sharedWith: userId }, { $pull: { sharedWith: userId } })
    ])

    await User.findByIdAndDelete(userId)

    audit('admin.user_deleted', {
        ...actorFrom(req),
        targetUserId: userId.toString(),
        email: user.email,
        fileCount: files.length
    })

    res.status(200).json({ id: userId, fileCount: files.length })

    // Byte cleanup runs after the response — the account is already gone as far
    // as the API is concerned, and a slow filesystem must not hold the request
    // open. Anything left behind is inert: nothing can reach it without a row.
    removeUserFiles(userId, files).catch((error) =>
        log.error('failed to remove files for deleted user', {
            targetUserId: userId.toString(),
            error
        })
    )
})

// Unlink a deleted account's bytes, then its upload directory.
//
// Bounded concurrency for the same reason deleteFolderFromDB uses it: fully
// serial unlinks block the event loop for the whole request on an account with
// thousands of files.
async function removeUserFiles(userId, files) {
    const CONCURRENCY = 16

    for (let i = 0; i < files.length; i += CONCURRENCY) {
        await Promise.all(
            files.slice(i, i + CONCURRENCY).map(async (file) => {
                const absolutePath = resolveStoredPath(file.storagePath)
                if (!absolutePath) {
                    // Covers both a missing value and one that does not land
                    // inside UPLOAD_ROOT. The per-user directory removal below
                    // is what actually reclaims the space in that case.
                    log.error('cannot unlink file during account delete: path does not resolve', {
                        fileId: file._id.toString(),
                        storagePath: file.storagePath
                    })
                    return
                }
                try {
                    await fsp.unlink(absolutePath)
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        log.error('failed to unlink file during account delete', {
                            fileId: file._id.toString(),
                            error
                        })
                    }
                }
            })
        )
    }

    // The per-user directory is named for the account id, which is not
    // attacker-controlled — but it is still joined rather than interpolated,
    // and only ever under UPLOAD_ROOT.
    try {
        await fsp.rm(path.join(UPLOAD_ROOT, String(userId)), { recursive: true, force: true })
    } catch (error) {
        log.error('failed to remove upload directory for deleted user', {
            targetUserId: String(userId),
            error
        })
    }
}

module.exports = {
    getStorageStats,
    listUsers,
    getUserDetail,
    updateUserStatus,
    revokeUserSessions,
    resetUserTwoFactor,
    deleteUser
}
