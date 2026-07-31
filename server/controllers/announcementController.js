const asyncHandler = require('express-async-handler')
const Announcement = require('../models/announcementModel')
const { badRequest, notFound } = require('../utils/httpError')
const { requireObjectId } = require('../utils/ownership')
const { readPageParams } = require('../utils/pagination')
const { audit, actorFrom } = require('../utils/logger')

const { MAX_TITLE_LENGTH, MAX_BODY_LENGTH } = Announcement

// Ceiling on how many unseen announcements one client is handed at once.
// Sorted newest-first before slicing, so the cap only ever drops the oldest of
// an absurd backlog — the ones a reader is least likely to care about.
const MAX_FEED = 20

const toFeedItem = (a) => ({
    id: a._id,
    title: a.title,
    body: a.body,
    createdAt: a.createdAt,
    expiresAt: a.expiresAt
})

// `isExpired` is deliberately NOT computed here. The client derives it from
// expiresAt so a list left open past an expiry corrects itself without a
// refetch, and so the value can't be stale by the time it renders.
const toAdminItem = (a) => ({
    id: a._id,
    title: a.title,
    body: a.body,
    createdAt: a.createdAt,
    expiresAt: a.expiresAt,
    createdBy: a.createdBy
})

const requireText = (value, label, max) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw badRequest(`${label} is required`)
    }
    const trimmed = value.trim()
    if (trimmed.length > max) {
        throw badRequest(`${label} must be ${max} characters or fewer`)
    }
    return trimmed
}

// ─────────────────────────────────────────────────────────────────────────────
//  User-facing
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Announcements this user has not seen yet and that have not expired.
// @route   GET /api/announcements
// @access  Private
//
// `protect` already rejects pending and suspended accounts, so the audience is
// exactly the active members without a status filter here.
const listMyAnnouncements = asyncHandler(async (req, res) => {
    const active = await Announcement.find({ expiresAt: { $gt: new Date() } })
        .sort({ createdAt: -1 })
        .limit(MAX_FEED)

    // The watermark is compared in JS rather than in the query because a null
    // watermark ("has seen nothing") is not expressible as a $gt bound — it
    // would have to become a $or, and getting that wrong fails open by hiding
    // announcements rather than by showing them twice.
    const watermark = req.user.lastSeenAnnouncementAt
    const unseen = watermark ? active.filter((a) => a.createdAt > watermark) : active

    res.status(200).json(unseen.map(toFeedItem))
})

// @desc    Mark every announcement up to now as seen.
// @route   PATCH /api/announcements/seen
// @access  Private
//
// Idempotent, and safe to call when nothing was shown — advancing the watermark
// past an already-empty feed is a no-op.
const markAnnouncementsSeen = asyncHandler(async (req, res) => {
    req.user.lastSeenAnnouncementAt = new Date()
    await req.user.save()

    res.status(200).json({ lastSeenAnnouncementAt: req.user.lastSeenAnnouncementAt })
})

// ─────────────────────────────────────────────────────────────────────────────
//  Admin
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Broadcast a new announcement.
// @route   POST /api/admin/announcements
// @access  Private/Admin
const createAnnouncement = asyncHandler(async (req, res) => {
    const title = requireText(req.body.title, 'Title', MAX_TITLE_LENGTH)
    const body = requireText(req.body.body, 'Message', MAX_BODY_LENGTH)

    const expiresAt = new Date(req.body.expiresAt)

    if (Number.isNaN(expiresAt.getTime())) {
        throw badRequest('A valid expiry date is required')
    }

    // An announcement that expires in the past would be created, stored, and
    // shown to nobody — a silent no-op the admin would only notice by its
    // absence. Reject it instead.
    if (expiresAt <= new Date()) {
        throw badRequest('The expiry date must be in the future')
    }

    const announcement = await Announcement.create({
        title,
        body,
        expiresAt,
        createdBy: req.user._id
    })

    audit('announcement.created', {
        ...actorFrom(req),
        announcementId: announcement._id.toString(),
        expiresAt: announcement.expiresAt.toISOString()
    })

    res.status(201).json(toAdminItem(announcement))
})

// @desc    Every announcement, newest first, including expired ones.
// @route   GET /api/admin/announcements
// @access  Private/Admin
const listAnnouncements = asyncHandler(async (req, res) => {
    const { limit, skip } = readPageParams(req)

    // readPageParams supplies the bound; sendPage is not used because the
    // response is mapped to the admin surface's { id, ... } shape rather than
    // raw documents. The total still travels in X-Total-Count as it does there.
    const [total, rows] = await Promise.all([
        Announcement.countDocuments({}),
        Announcement.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit)
    ])

    res.setHeader('X-Total-Count', String(total))
    res.status(200).json(rows.map(toAdminItem))
})

// @desc    Retract an announcement.
// @route   DELETE /api/admin/announcements/:id
// @access  Private/Admin
const deleteAnnouncement = asyncHandler(async (req, res) => {
    requireObjectId(req.params.id, 'announcement id')

    const announcement = await Announcement.findByIdAndDelete(req.params.id)

    if (!announcement) {
        throw notFound('Announcement not found')
    }

    audit('announcement.deleted', {
        ...actorFrom(req),
        announcementId: announcement._id.toString()
    })

    res.status(200).json({ id: announcement._id })
})

module.exports = {
    listMyAnnouncements,
    markAnnouncementsSeen,
    createAnnouncement,
    listAnnouncements,
    deleteAnnouncement
}
