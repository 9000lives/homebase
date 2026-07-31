const mongoose = require('mongoose')

// A broadcast message shown once to every active user.
//
// Delivery is pull-based: there is no push channel in this app, so the client
// asks for unseen announcements when it opens and the server answers from this
// collection plus the reader's User.lastSeenAnnouncementAt watermark.

const MAX_TITLE_LENGTH = 120
const MAX_BODY_LENGTH = 2000

const announcementSchema = mongoose.Schema({
        title: {
            type: String,
            required: [true, 'Please add a title'],
            trim: true,
            maxlength: [MAX_TITLE_LENGTH, 'Title is too long']
        },
        body: {
            type: String,
            required: [true, 'Please add a message'],
            trim: true,
            maxlength: [MAX_BODY_LENGTH, 'Message is too long']
        },
        // Read as a filter, never as a deletion trigger — see the index note.
        expiresAt: {
            type: Date,
            required: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
})

// Backs the active-announcement query (expiresAt > now, newest first).
//
// Deliberately NOT a TTL index. An expired announcement must survive so the
// admin list can show what was sent and when; expiry is enforced in the query.
// A TTL index here would silently erase that history.
announcementSchema.index({ expiresAt: 1, createdAt: -1 })

module.exports = mongoose.model('Announcement', announcementSchema)
module.exports.MAX_TITLE_LENGTH = MAX_TITLE_LENGTH
module.exports.MAX_BODY_LENGTH = MAX_BODY_LENGTH
