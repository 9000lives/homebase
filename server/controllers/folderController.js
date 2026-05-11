const asyncHandler = require('express-async-handler')
const fs = require('fs')
const path = require('path')
const Folder = require('../models/folderModel')
const File = require('../models/fileModel')
const mongoose = require('mongoose')

// @desc    Create a folder
// @route   POST /api/folders
// @access  Private (requires valid JWT)
const createFolder = asyncHandler(async (req, res) => {
    const { name, parentFolderId } = req.body

    if(!name) {
        throw new Error('Please fill all fields')
    }

    const folder = await Folder.create({
        ownerId: req.user.id,
        name,
        parentFolderId: parentFolderId || null
    })

    if(folder) {
        res.status(201).json({
            _id: folder.id,
            ownerId: folder.ownerId,
            name: folder.name,
            parentFolderId: folder.parentFolderId,
        })
    }
    else {
        res.status(400)
        throw new Error('Invalid folder data')
    }
})

// @desc    Get all folders for the logged in user
// @route   GET /api/folders
// @access  Private (requires valid JWT)
const getFolders = asyncHandler(async (req, res) => {
    const folders = await Folder.find({ 
        ownerId: req.user.id,
        parentFolderId: req.query.parentFolderId || null
    })
    res.json(folders)
})

// @desc    Delete a folder and all its contents
// @route   DELETE /api/folders/:id/delete
// @access  Private (requires valid JWT)
const deleteFolder = asyncHandler(async (req, res) => {
    const folder = await Folder.findById(req.params.id)

    if (!folder) {
        res.status(404)
        throw new Error('Folder not found')
    }

    if (folder.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to delete this folder')
    }

    // Delete from DB recursively
    await deleteFolderFromDB(folder._id)

    res.json({ message: 'Folder deleted' })
})

// Helper function to recursively delete a folder and its contents from the database
async function deleteFolderFromDB(folderId) {
    
    const subfolders = await Folder.find({ parentFolderId: folderId })

    // Recurse into each subfolder 
    for (const subfolder of subfolders) {
        await deleteFolderFromDB(subfolder._id)
    }
    
    const files = await File.find({ parentFolderId: folderId })

    for (const file of files) {
        fs.unlinkSync(path.resolve(file.storagePath)) // delete subfiles from disk
    }
    await File.deleteMany({ parentFolderId: folderId }) // delete subfiles from database
    // Delete the folder itself
    await Folder.findByIdAndDelete(folderId)
}

// @desc    Update a folder name
// @route   PATCH /api/folders/:id/rename
// @access  Private (requires valid JWT 'protect` middlware)
const updateFolderName = asyncHandler(async (req, res) => {

    const { name } = req.body

    const folder = await Folder.findById(req.params.id)

    //update just the name then call save() so that our mongoose validation runs
    folder.name = name
    const updatedFolder = await folder.save()

    res.status(200).json({
        _id: updatedFolder._id,
        name: updatedFolder.name,
        parentFolderId: updatedFolder.parentFolderId
    })
})

// @desc    Update a folder's parent folder
// @route   PATCH /api/folders/:id/move
// @access  Private (requires valid JWT 'protect` middlware)
const updateFolderParent = asyncHandler(async (req, res) => {

    const { parentFolderId } = req.body

    const folder = await Folder.findById(req.params.id)

    //update just the parentFolderId then call save() so that our mongoose validation runs
    folder.parentFolderId = parentFolderId
    const updatedFolder = await folder.save()

    res.status(200).json({
        _id: updatedFolder._id,
        name: updatedFolder.name,
        parentFolderId: updatedFolder.parentFolderId
    })
})

module.exports = { createFolder, getFolders, deleteFolder, updateFolderName, updateFolderParent }