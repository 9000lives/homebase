const mongoose = require('mongoose')
const { Schema } = mongoose

const fileSchema = mongoose.Schema({
    ownerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please add a file name']
    },
    size: {
        type: Number
    },
    mimeType: {
        type: String
    },
    storagePath: {
        type: String
    },
    parentFolderId: {
        type: Schema.Types.ObjectId,
        ref: 'Folder'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

module.exports = mongoose.model('File', fileSchema)