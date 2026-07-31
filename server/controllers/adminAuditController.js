const asyncHandler = require('express-async-handler')
const AuditLog = require('../models/auditLogModel')
const { badRequest } = require('../utils/httpError')
const { requireObjectId } = require('../utils/ownership')
const { readPageParams } = require('../utils/pagination')

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const readQueryString = (value) => {
    const raw = Array.isArray(value) ? value[0] : value
    return typeof raw === 'string' ? raw.trim() : ''
}

// Populated refs come back null when the referenced account has since been
// deleted — which is exactly when an audit row matters most. The raw id is
// always kept so a deleted actor is still identifiable.
const describeUser = (populated, rawId) => {
    if (!rawId) return null
    if (!populated) return { id: rawId, displayName: null, email: null, deleted: true }
    return {
        id: populated._id,
        displayName: populated.displayName,
        email: populated.email,
        deleted: false
    }
}

// @desc    Filtered, reverse-chronological view of the audit trail.
// @route   GET /api/admin/audit?event=&actorId=&since=&until=&limit=&skip=
// @access  Private/Admin
const listAuditLog = asyncHandler(async (req, res) => {
    const { limit, skip } = readPageParams(req)
    const filter = {}

    // Prefix match, anchored. "auth" selects every auth.* event; the full
    // "auth.login_failed" selects just that one. One control covers both the
    // category dropdown and an exact lookup.
    const event = readQueryString(req.query.event)
    if (event) {
        filter.event = new RegExp(`^${escapeRegex(event)}`)
    }

    const actorId = readQueryString(req.query.actorId)
    if (actorId) {
        filter.actorId = requireObjectId(actorId, 'actor id')
    }

    const since = readQueryString(req.query.since)
    const until = readQueryString(req.query.until)
    if (since || until) {
        filter.createdAt = {}
        if (since) {
            const date = new Date(since)
            if (Number.isNaN(date.getTime())) throw badRequest("Invalid 'since' date")
            filter.createdAt.$gte = date
        }
        if (until) {
            const date = new Date(until)
            if (Number.isNaN(date.getTime())) throw badRequest("Invalid 'until' date")
            filter.createdAt.$lte = date
        }
    }

    const [total, rows] = await Promise.all([
        AuditLog.countDocuments(filter),
        AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('actorId', 'displayName email')
            .populate('targetUserId', 'displayName email')
    ])

    res.setHeader('X-Total-Count', String(total))

    // An envelope rather than the bare array the other list endpoints return.
    // The paging UI needs the unbounded total, and services/*.js apiFetch
    // discards the Response object — so a header alone would be unreadable
    // without changing the fetch helper in all four service files.
    res.status(200).json({
        total,
        limit,
        skip,
        rows: rows.map((row) => ({
            id: row._id,
            event: row.event,
            actor: describeUser(row.actorId, row.actorId?._id ?? null),
            target: describeUser(row.targetUserId, row.targetUserId?._id ?? null),
            ip: row.ip,
            userAgent: row.userAgent,
            requestId: row.requestId,
            meta: row.meta,
            createdAt: row.createdAt
        }))
    })
})

// @desc    Event names actually present in the trail, for the filter control.
// @route   GET /api/admin/audit/events
// @access  Private/Admin
//
// Read from the data rather than a hardcoded list, so an audit() call added
// later shows up in the filter without anyone remembering to register it.
const listAuditEvents = asyncHandler(async (req, res) => {
    const events = await AuditLog.distinct('event')

    // Categories are the prefix before the first dot: auth, admin, file, …
    const categories = [...new Set(events.map((e) => e.split('.')[0]))].sort()

    res.status(200).json({ events: events.sort(), categories })
})

module.exports = { listAuditLog, listAuditEvents }
