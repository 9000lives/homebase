const asyncHandler = require('express-async-handler')
const Feedback = require('../models/feedbackModel')
const User = require('../models/userModel')
const { badRequest, notFound } = require('../utils/httpError')
const { requireObjectId } = require('../utils/ownership')
const { readPageParams } = require('../utils/pagination')
const { audit, actorFrom } = require('../utils/logger')

const { MAX_MESSAGE_LENGTH } = Feedback

// Read the whitelists straight off the schema so they can never drift from the
// model — same precedent as ALLOWED_STATUSES in adminController.js.
const ALLOWED_TYPES = Feedback.schema.path('type').enumValues
const ALLOWED_STATUSES = Feedback.schema.path('status').enumValues

// Same shape as the helper in announcementController.js. A second copy rather
// than a shared util because the model's own trim + maxlength validator is the
// real backstop (the error handler maps a ValidationError to a 400); this is a
// clearer message on top of a control that exists anyway, not the control
// itself. Worth extracting to utils/ if a third consumer ever appears.
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

// Express's 'simple' query parser turns ?type=a&type=b into an array. Same
// normalisation adminAuditController.js does, for the same reason.
const readQueryString = (value) => {
    const raw = Array.isArray(value) ? value[0] : value
    return typeof raw === 'string' ? raw.trim() : ''
}

// Which of the submitters on this page still have an account, as one indexed
// query for the whole page. A populate() would answer the same question by
// returning null for a deleted account — and take the name and address down
// with it, which is exactly what the snapshot on the row exists to prevent.
const findLiveSubmitters = async (rows) => {
    const ids = rows.map((row) => row.submittedBy)
    const found = await User.find({ _id: { $in: ids } }).select('_id')
    return new Set(found.map((user) => user._id.toString()))
}

// The submitter as the admin needs to see them: the snapshot taken when the
// message was sent, plus a live "this account is gone" flag.
const toAdminItem = (feedback, alive) => ({
    id: feedback._id,
    type: feedback.type,
    message: feedback.message,
    status: feedback.status,
    createdAt: feedback.createdAt,
    submitter: {
        id: feedback.submittedBy,
        displayName: feedback.submitterName,
        email: feedback.submitterEmail,
        deleted: !alive.has(feedback.submittedBy.toString())
    }
})

// ─────────────────────────────────────────────────────────────────────────────
//  User-facing
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Send a message to the admin.
// @route   POST /api/feedback
// @access  Private
//
// Write-only. There is deliberately no GET counterpart on this resource, so no
// member can read anyone's feedback — including their own. The reading and
// triaging routes live under /api/admin/feedback, behind adminRoutes.js's
// single protect + requireAdmin guard.
const submitFeedback = asyncHandler(async (req, res) => {
    // A non-primitive can never be `includes`-equal to an enum string, so this
    // also closes the {"type":{"$ne":null}} operator-injection shape.
    if (!ALLOWED_TYPES.includes(req.body.type)) {
        throw badRequest(`type must be one of: ${ALLOWED_TYPES.join(', ')}`)
    }

    const message = requireText(req.body.message, 'Message', MAX_MESSAGE_LENGTH)

    // Identity comes from the session, never from the body. Spreading req.body
    // in here would let a member file under someone else's name and address,
    // and mark their own report `resolved` on the way in.
    const feedback = await Feedback.create({
        type: req.body.type,
        message,
        submittedBy: req.user._id,
        submitterName: req.user.displayName,
        submitterEmail: req.user.email
    })

    audit('feedback.submitted', {
        ...actorFrom(req),
        feedbackId: feedback._id.toString(),
        feedbackType: feedback.type
    })

    // No echo of the message and none of the admin fields — the client shows a
    // fixed confirmation line and keeps no history to add this to.
    res.status(201).json({
        id: feedback._id,
        type: feedback.type,
        createdAt: feedback.createdAt
    })
})

// ─────────────────────────────────────────────────────────────────────────────
//  Admin
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Every feedback row, newest first, filterable by type and by status.
// @route   GET /api/admin/feedback?type=&status=&limit=&skip=
// @access  Private/Admin
const listFeedback = asyncHandler(async (req, res) => {
    const { limit, skip } = readPageParams(req)
    const filter = {}

    const type = readQueryString(req.query.type)
    if (type) {
        if (!ALLOWED_TYPES.includes(type)) {
            throw badRequest(`type must be one of: ${ALLOWED_TYPES.join(', ')}`)
        }
        filter.type = type
    }

    const status = readQueryString(req.query.status)
    if (status) {
        if (!ALLOWED_STATUSES.includes(status)) {
            throw badRequest(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`)
        }
        filter.status = status
    }

    // newCount is deliberately UNFILTERED. The header badge answers "how much is
    // waiting for me", which must not move when the admin narrows the list.
    const [total, newCount, rows] = await Promise.all([
        Feedback.countDocuments(filter),
        Feedback.countDocuments({ status: 'new' }),
        Feedback.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
    ])

    const alive = await findLiveSubmitters(rows)

    res.setHeader('X-Total-Count', String(total))

    // An envelope rather than the bare array the announcement list returns, for
    // the same reason as adminAuditController.listAuditLog: services/apiClient.js
    // apiFetch discards the Response, so a header is unreadable to the caller.
    // Here it is forced rather than merely preferred — the box needs two numbers
    // and X-Total-Count can only carry one.
    res.status(200).json({
        total,
        newCount,
        limit,
        skip,
        rows: rows.map((feedback) => toAdminItem(feedback, alive))
    })
})

// @desc    Move a feedback item through the triage workflow.
// @route   PATCH /api/admin/feedback/:id/status
// @access  Private/Admin
//
// Any value may follow any other — there is no transition graph. The intended
// path is new → in_progress → resolved | dismissed, but an admin re-opening
// something they closed too early is a legitimate correction, and
// updateUserStatus sets the precedent of validating the value rather than the
// transition.
const updateFeedbackStatus = asyncHandler(async (req, res) => {
    requireObjectId(req.params.id, 'feedback id')

    const { status } = req.body
    if (!ALLOWED_STATUSES.includes(status)) {
        throw badRequest(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`)
    }

    const feedback = await Feedback.findById(req.params.id)

    if (!feedback) {
        throw notFound('Feedback not found')
    }

    const previousStatus = feedback.status

    // Assign then save(), rather than findByIdAndUpdate, so the schema's enum
    // validator still runs on the way in.
    feedback.status = status
    await feedback.save()

    // targetUserId is the submitter: AuditLog.targetUserId means "the account
    // acted upon", and setting it here makes a member's feedback history
    // reachable from the audit viewer's actor pivot.
    audit('feedback.status_changed', {
        ...actorFrom(req),
        feedbackId: feedback._id.toString(),
        targetUserId: feedback.submittedBy.toString(),
        from: previousStatus,
        to: feedback.status
    })

    const alive = await findLiveSubmitters([feedback])

    res.status(200).json(toAdminItem(feedback, alive))
})

// @desc    Remove a feedback item.
// @route   DELETE /api/admin/feedback/:id
// @access  Private/Admin
//
// loadActionableUser() is deliberately not used here. Its two refusals — self
// and admin targets — are about acting on an *account*; a feedback row is not
// one, and an admin deleting their own report is harmless.
const deleteFeedback = asyncHandler(async (req, res) => {
    requireObjectId(req.params.id, 'feedback id')

    const feedback = await Feedback.findByIdAndDelete(req.params.id)

    if (!feedback) {
        throw notFound('Feedback not found')
    }

    audit('feedback.deleted', {
        ...actorFrom(req),
        feedbackId: feedback._id.toString(),
        targetUserId: feedback.submittedBy.toString(),
        feedbackType: feedback.type
    })

    res.status(200).json({ id: feedback._id })
})

module.exports = {
    submitFeedback,
    listFeedback,
    updateFeedbackStatus,
    deleteFeedback
}
