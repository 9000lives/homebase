const mongoose = require('mongoose')
const { Schema } = mongoose
const { MAX_NAME_LENGTH } = require('../utils/names')

const fileSchema = mongoose.Schema({
    ownerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please add a file name'],
        trim: true,
        maxlength: [MAX_NAME_LENGTH, 'File name is too long']
    },
    size: {
        type: Number,
        default: 0,
        min: 0
    },
    mimeType: {
        type: String
    },
    storagePath: {
        type: String
    },
    parentFolderId: {
        type: Schema.Types.ObjectId,
        ref: 'Folder',
        default: null
    },
    sharedWith: {
        type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

// Directory listings and the per-user storage aggregation used for quota
// enforcement. Without these both are collection scans.
fileSchema.index({ ownerId: 1, parentFolderId: 1 })
fileSchema.index({ parentFolderId: 1 })
fileSchema.index({ sharedWith: 1 })

module.exports = mongoose.model('File', fileSchema)
