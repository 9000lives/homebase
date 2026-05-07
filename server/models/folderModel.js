const mongoose = require('mongoose')
const { Schema } = mongoose

const folderSchema = mongoose.Schema({
    ownerID: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please add a folder name']
    },
    parentFolderID: {
        type: Schema.Types.ObjectId,
        ref: 'Folder',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

module.exports = mongoose.model('Folder', folderSchema)