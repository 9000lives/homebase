const mongoose = require('mongoose')
const { Schema } = mongoose

const folderSchema = mongoose.Schema({
    ownerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please add a folder name']
    },
    parentFolderId: {
        type: Schema.Types.ObjectId,
        ref: 'Folder',
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

module.exports = mongoose.model('Folder', folderSchema)