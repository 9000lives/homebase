const asyncHandler = require('express-async-handler')
const fs = require('fs')
const path = require('path')
const File = require('../models/fileModel')
const User = require('../models/userModel')
const Folder = require('../models/folderModel')
const { isFolderAccessibleToUser } = require('../utils/folderAccess')

// @desc    Upload a file
// @route   POST /api/files/upload
// @access  Private (requires valid JWT)
const uploadFile = asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400)
        throw new Error('No file uploaded')
    }

    // a shared folder's id is now discoverable by non-owners, so make sure the
    // requester actually owns the parent before letting them upload inside it
    if (req.body.parentFolderId) {
        const parent = await Folder.findById(req.body.parentFolderId)
        if (!parent || parent.ownerId.toString() !== req.user.id) {
            res.status(403)
            throw new Error('Not authorized to upload into this folder')
        }
    }

    const file = await File.create({
        ownerId:        req.user.id,
        name:           req.file.originalname,
        size:           req.file.size,
        mimeType:       req.file.mimetype,
        storagePath:    req.file.path,
        parentFolderId: req.body.parentFolderId || null
    })

    res.status(201).json(file)
})

// @desc    Get all files inside the given parentFolderId — either the
//          requester's own (root or own subfolder), or a foreign folder the
//          requester has live shared access to
// @route   GET /api/files
// @access  Private (requires valid JWT)
const getFiles = asyncHandler(async (req, res) => {
    const parentFolderId = req.query.parentFolderId || null

    if (!parentFolderId) {
        // root — always the requester's own root
        const files = await File.find({ ownerId: req.user.id, parentFolderId: null })
        return res.json(files)
    }

    const parent = await Folder.findById(parentFolderId)
    if (!parent) {
        res.status(404)
        throw new Error('Folder not found')
    }

    if (parent.ownerId.toString() === req.user.id) {
        // own subfolder — unchanged existing behavior
        const files = await File.find({ ownerId: req.user.id, parentFolderId })
        return res.json(files)
    }

    // foreign folder — only accessible via a live share chain
    const accessible = await isFolderAccessibleToUser(parentFolderId, req.user.id)
    if (!accessible) {
        res.status(403)
        throw new Error('Not authorized to view this folder')
    }
    const files = await File.find({ parentFolderId })
    res.json(files)
})

// @desc    Download a file
// @route   GET /api/files/:id/download
// @access  Private (requires valid JWT)
const downloadFile = asyncHandler(async (req, res) => {
    const file = await File.findById(req.params.id)

    if (!file) {
        res.status(404)
        throw new Error('File not found')
    }

    // owner always has access; a user the file (or an ancestor folder) has been
    // shared with gets read-only access too
    const isOwner = file.ownerId.toString() === req.user.id
    const isSharedWithUser = (file.sharedWith || []).some((id) => id.toString() === req.user.id)
    let hasAccess = isOwner || isSharedWithUser
    if (!hasAccess && file.parentFolderId) {
        hasAccess = await isFolderAccessibleToUser(file.parentFolderId, req.user.id)
    }
    if (!hasAccess) {
        res.status(403)
        throw new Error('Not authorized to access this file')
    }

    res.download(path.resolve(file.storagePath), file.name)
})

// @desc    Serve a file inline for preview (no forced download)
// @route   GET /api/files/:id/view
// @access  Private (requires valid JWT)
const viewFile = asyncHandler(async (req, res) => {
    const file = await File.findById(req.params.id)

    if (!file) {
        res.status(404)
        throw new Error('File not found')
    }

    // owner always has access; a user the file (or an ancestor folder) has been
    // shared with gets read-only access too
    const isOwner = file.ownerId.toString() === req.user.id
    const isSharedWithUser = (file.sharedWith || []).some((id) => id.toString() === req.user.id)
    let hasAccess = isOwner || isSharedWithUser
    if (!hasAccess && file.parentFolderId) {
        hasAccess = await isFolderAccessibleToUser(file.parentFolderId, req.user.id)
    }
    if (!hasAccess) {
        res.status(403)
        throw new Error('Not authorized to access this file')
    }

    res.setHeader('Content-Type', file.mimeType)
    res.sendFile(path.resolve(file.storagePath))
})

// @desc    Get all files shared with the logged in user (by other owners)
// @route   GET /api/files/shared
// @access  Private (requires valid JWT)
const getSharedFiles = asyncHandler(async (req, res) => {
    const files = await File.find({ sharedWith: req.user.id })
        .populate('ownerId', 'displayName email')
    res.json(files)
})

// @desc    Share a file with another active user (owner only)
// @route   PATCH /api/files/:id/share
// @access  Private (requires valid JWT)
const shareFile = asyncHandler(async (req, res) => {
    const { userId } = req.body

    const file = await File.findById(req.params.id)

    if (!file) {
        res.status(404)
        throw new Error('File not found')
    }

    if (file.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to share this file')
    }

    if (!userId) {
        res.status(400)
        throw new Error('userId is required')
    }

    const targetUser = await User.findById(userId)
    if (!targetUser || targetUser.status !== 'active') {
        res.status(400)
        throw new Error('User not found or not active')
    }

    const alreadyShared = file.sharedWith.some((id) => id.toString() === userId)
    if (!alreadyShared) {
        file.sharedWith.push(userId)
        await file.save()
    }

    res.status(200).json({ _id: file._id, sharedWith: file.sharedWith })
})

// @desc    Remove another user's access to a file (owner only)
// @route   PATCH /api/files/:id/unshare
// @access  Private (requires valid JWT)
const unshareFile = asyncHandler(async (req, res) => {
    const { userId } = req.body

    const file = await File.findById(req.params.id)

    if (!file) {
        res.status(404)
        throw new Error('File not found')
    }

    if (file.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to unshare this file')
    }

    if (!userId) {
        res.status(400)
        throw new Error('userId is required')
    }

    file.sharedWith = file.sharedWith.filter((id) => id.toString() !== userId)
    await file.save()

    res.status(200).json({ _id: file._id, sharedWith: file.sharedWith })
})

// @desc    Delete a file
// @route   DELETE /api/files/:id/delete
// @access  Private (requires valid JWT)
const deleteFile = asyncHandler(async (req, res) => {
    const file = await File.findById(req.params.id)

    if (!file) {
        res.status(404)
        throw new Error('File not found')
    }

    if (file.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to delete this file')
    }

    // delete from disk first, then from database
    fs.unlinkSync(path.resolve(file.storagePath))
    await File.findByIdAndDelete(req.params.id)

    res.json({ message: 'File deleted' })
})

// @desc    Update a file name
// @route   PATCH /api/files/:id/rename
// @access  Private (requires valid JWT 'protect` middlware)
const updateFileName = asyncHandler(async (req, res) => {

    const { name } = req.body

    const file = await File.findById(req.params.id)

    if (!file) {
        res.status(404)
        throw new Error('File not found')
    }

    if (file.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to update this file')
    }

    //update just the name then call save() so that our mongoose validation runs
    file.name = name
    const updatedFile = await file.save()

    res.status(200).json({
        _id: updatedFile._id,
        name: updatedFile.name,
        mimeType: updatedFile.mimeType,
        parentFolderId: updatedFile.parentFolderId
    })
})

// @desc    Update a file's parent folder
// @route   PATCH /api/files/:id/move
// @access  Private (requires valid JWT 'protect` middlware)
const updateFileFolder = asyncHandler(async (req, res) => {

    const { parentFolderId } = req.body

    const file = await File.findById(req.params.id)

    if (!file) {
        res.status(404)
        throw new Error('File not found')
    }

    if (file.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to update this file')
    }

    //update just the parentFolderId then call save() so that our mongoose validation runs
    file.parentFolderId = parentFolderId
    const updatedFile = await file.save()

    res.status(200).json({
        _id: updatedFile._id,
        name: updatedFile.name,
        mimeType: updatedFile.mimeType,
        parentFolderId: updatedFile.parentFolderId
    })
})

module.exports = {
    uploadFile,
    getFiles,
    downloadFile,
    viewFile,
    deleteFile,
    updateFileName,
    updateFileFolder,
    getSharedFiles,
    shareFile,
    unshareFile
}