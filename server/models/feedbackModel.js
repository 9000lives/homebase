const mongoose = require('mongoose')

// A member-authored message to the admin: a bug report, a feature request, a
// question, or a complaint about access.
//
// One-way by design. There is no member read endpoint at all — not a guarded
// one, none (see controllers/feedbackController.js). That is not only a UI
// decision: a collection with no member-reachable read path cannot leak one
// member's message to another, however the admin-side filters drift later.

const MAX_MESSAGE_LENGTH = 1000

// Object form, like userModel's roleEnum/statusEnum, so the 400 the error
// handler builds from a ValidationError names the path and the bad value.
//
// The human labels for both lists are mirrored in
// client/src/utils/feedbackTypes.js. Changing a value here needs a change
// there — the test 'the feedback enums are the lists the client mirrors' in
// server/tests/security.test.js fails loudly if only one side moves.
const typeEnum = {
    values: ['feature', 'bug', 'help', 'account', 'other'],
    message: 'enum validator failed for path `{PATH}` with value `{VALUE}`'
}

const statusEnum = {
    values: ['new', 'in_progress', 'resolved', 'dismissed'],
    message: 'enum validator failed for path `{PATH}` with value `{VALUE}`'
}

const feedbackSchema = mongoose.Schema({
        type: {
            type: String,
            required: [true, 'Please add a feedback type'],
            enum: typeEnum
        },
        message: {
            type: String,
            required: [true, 'Please add a message'],
            trim: true,
            maxlength: [MAX_MESSAGE_LENGTH, 'Message is too long']
        },
        // Triage state. Set only by an admin; a member cannot supply it.
        status: {
            type: String,
            enum: statusEnum,
            default: 'new'
        },
        // Kept alongside the snapshot below so the row is still linkable to a
        // live account. Always req.user._id, never anything from the body.
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User'
        },
        // Identity SNAPSHOT, taken from req.user at submit time. Not a
        // denormalisation for speed — it is what keeps a support record
        // answerable later:
        //
        //   - PATCH /api/users/me/username exists, so a populate() would show
        //     the name the account has now, not the one attached to the report.
        //   - adminController.deleteUser removes the User document outright and
        //     does not cascade here, so a populate-only design would turn every
        //     historical row from that member anonymous at exactly the moment
        //     the admin most wants to know who filed it.
        //
        // The trade-off is that a deleted account's address survives in this
        // collection. That is a deliberate retention decision, on the same
        // reasoning that keeps expired announcements alive for the admin list,
        // and it is written up in the project's internal security notes.
        submitterName: {
            type: String,
            required: true,
            trim: true,
            maxlength: [120, 'Submitter name is too long']
        },
        submitterEmail: {
            type: String,
            required: true,
            trim: true,
            maxlength: [254, 'Submitter email is too long']
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
})

// Backs the default admin view: everything, newest first. Both filters below
// are optional, so a compound index led by type or status cannot serve the
// unfiltered sort — createdAt is not a prefix of either.
feedbackSchema.index({ createdAt: -1 })

// Backs the status filter, and the header's unhandled count — which reads the
// index prefix alone (countDocuments({ status: 'new' })).
feedbackSchema.index({ status: 1, createdAt: -1 })

// Backs the type filter, newest first.
feedbackSchema.index({ type: 1, createdAt: -1 })

// Deliberately NO TTL index. Feedback is history, like announcements, not
// telemetry like the audit log — a report has to survive long enough to be
// acted on, and its retention is the admin's decision (delete), not a clock's.

module.exports = mongoose.model('Feedback', feedbackSchema)
module.exports.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH
