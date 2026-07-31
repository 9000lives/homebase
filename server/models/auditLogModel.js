const mongoose = require('mongoose')
const { AUDIT_RETENTION_DAYS } = require('../config/env')

// Durable security audit trail.
//
// utils/logger.js `audit()` still writes to stdout; this collection is a second
// sink so the record survives a process restart and can be read from the admin
// dashboard. Rows are written fire-and-forget — an audit write must never fail
// the request that produced it.
//
// EVERYTHING HERE HAS ALREADY PASSED THROUGH redact(). The logger redacts and
// then persists, never the reverse. Writing raw fields would quietly undo the
// structural guarantee that a token, password or OTP can't reach a log.

const auditLogSchema = mongoose.Schema({
        event: {
            type: String,
            required: true
        },
        // Nullable: pre-auth events (a failed login, a rate-limit trip) have no
        // established actor, and that absence is itself worth recording.
        actorId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            ref: 'User'
        },
        // The account acted upon, when it differs from the actor — an admin
        // approving someone, suspending them, resetting their 2FA.
        targetUserId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            ref: 'User'
        },
        ip: {
            type: String,
            default: null
        },
        userAgent: {
            type: String,
            default: null,
            maxlength: 200
        },
        // Ties a row to the requestId returned in an error response, so a user
        // quoting an id leads straight to what happened.
        requestId: {
            type: String,
            default: null
        },
        // Whatever else the call site passed, already redacted. Mixed because
        // the shape differs per event and pinning it would mean editing this
        // schema every time a new audit() call is added.
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
})

// Reverse-chronological listing, plus the two filters the viewer offers.
auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ event: 1, createdAt: -1 })
auditLogSchema.index({ actorId: 1, createdAt: -1 })

// Retention. Unlike Announcement — where expiry is a filter because the history
// is the point — an audit trail genuinely should age out: it accumulates on
// every login attempt, and it holds IP addresses and a behavioural record of
// every member. Mongo's TTL monitor drops rows past the window automatically.
auditLogSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: AUDIT_RETENTION_DAYS * 24 * 60 * 60 }
)

module.exports = mongoose.model('AuditLog', auditLogSchema)
