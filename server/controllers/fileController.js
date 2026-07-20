const asyncHandler = require('express-async-handler')
const fs = require('fs')
const path = require('path')
const File = require('../models/fileModel')

// @desc    Upload a file
// @route   POST /api/files/upload
// @access  Private (requires valid JWT)
const uploadFile = asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400)
        throw new Error('No file uploaded')
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

// @desc    Get all files for the logged in user
// @route   GET /api/files
// @access  Private (requires valid JWT)
const getFiles = asyncHandler(async (req, res) => {
    const files = await File.find({
        ownerId: req.user.id,
        parentFolderId: req.query.parentFolderId || null
    })
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

    // make sure the requesting user owns this file
    if (file.ownerId.toString() !== req.user.id) {
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

    // make sure the requesting user owns this file
    if (file.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to access this file')
    }

    res.setHeader('Content-Type', file.mimeType)
    res.sendFile(path.resolve(file.storagePath))
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

module.exports = { uploadFile, getFiles, downloadFile, viewFile, deleteFile, updateFileName, updateFileFolder }