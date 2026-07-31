const mongoose = require('mongoose')
const { Schema } = mongoose
const { MAX_NAME_LENGTH } = require('../utils/names')

const folderSchema = mongoose.Schema({
    ownerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please add a folder name'],
        trim: true,
        maxlength: [MAX_NAME_LENGTH, 'Folder name is too long']
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

// Directory listings, the share-chain walk, and the shared-folder list.
folderSchema.index({ ownerId: 1, parentFolderId: 1 })
folderSchema.index({ parentFolderId: 1 })
folderSchema.index({ sharedWith: 1 })

module.exports = mongoose.model('Folder', folderSchema)
