const asyncHandler = require('express-async-handler')
const fs = require('fs')
const path = require('path')
const { ZipArchive } = require('archiver')
const Folder = require('../models/folderModel')
const File = require('../models/fileModel')
const User = require('../models/userModel')
const mongoose = require('mongoose')
const { isFolderAccessibleToUser } = require('../utils/folderAccess')
const { buildFolderPathMap } = require('../utils/folderPath')

// @desc    Create a folder
// @route   POST /api/folders
// @access  Private (requires valid JWT)
const createFolder = asyncHandler(async (req, res) => {
    const { name, parentFolderId } = req.body

    if(!name) {
        throw new Error('Please fill all fields')
    }

    // a shared folder's id is now discoverable by non-owners, so make sure the
    // requester actually owns the parent before letting them create inside it
    if (parentFolderId) {
        const parent = await Folder.findById(parentFolderId)
        if (!parent || parent.ownerId.toString() !== req.user.id) {
            res.status(403)
            throw new Error('Not authorized to create a folder here')
        }
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

// @desc    Get all folders inside the given parentFolderId — either the
//          requester's own (root or own subfolder), or a foreign folder the
//          requester has live shared access to
// @route   GET /api/folders
// @access  Private (requires valid JWT)
const getFolders = asyncHandler(async (req, res) => {
    const parentFolderId = req.query.parentFolderId || null

    if (!parentFolderId) {
        // root — always the requester's own root
        const folders = await Folder.find({ ownerId: req.user.id, parentFolderId: null })
        return res.json(folders)
    }

    const parent = await Folder.findById(parentFolderId)
    if (!parent) {
        res.status(404)
        throw new Error('Folder not found')
    }

    if (parent.ownerId.toString() === req.user.id) {
        // own subfolder — unchanged existing behavior
        const folders = await Folder.find({ ownerId: req.user.id, parentFolderId })
        return res.json(folders)
    }

    // foreign folder — only accessible via a live share chain
    const accessible = await isFolderAccessibleToUser(parentFolderId, req.user.id)
    if (!accessible) {
        res.status(403)
        throw new Error('Not authorized to view this folder')
    }
    const folders = await Folder.find({ parentFolderId })
    res.json(folders)
})

// @desc    Get all folders shared directly with the logged in user
// @route   GET /api/folders/shared
// @access  Private (requires valid JWT)
const getSharedFolders = asyncHandler(async (req, res) => {
    const folders = await Folder.find({ sharedWith: req.user.id })
        .populate('ownerId', 'displayName email')
    res.json(folders)
})

// @desc    Search the logged in user's OWN folders by name, across their whole tree
// @route   GET /api/folders/search?q=<term>
// @access  Private (requires valid JWT)
const searchFolders = asyncHandler(async (req, res) => {
    const q = req.query.q
    if (!q || !q.trim()) return res.json([])

    // escape regex metacharacters so a search for "a.b" doesn't match "axb"
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(escaped, 'i')   // case-insensitive substring match

    // ownerId-scoped only (no parentFolderId) = every folder the user owns.
    const folders = await Folder.find({ ownerId: req.user.id, name: pattern }).limit(50)

    // path = the folder's ancestors, EXCLUDING itself (i.e. its parent's trail),
    // so the UI shows where the matched folder lives.
    const pathMap = await buildFolderPathMap(req.user.id)
    const results = folders.map((folder) => ({
        ...folder.toObject(),
        path: folder.parentFolderId ? (pathMap.get(folder.parentFolderId.toString()) || []) : []
    }))

    res.json(results)
})

// @desc    Share a folder (and everything inside it, live) with another active user (owner only)
// @route   PATCH /api/folders/:id/share
// @access  Private (requires valid JWT)
const shareFolder = asyncHandler(async (req, res) => {
    const { userId } = req.body

    const folder = await Folder.findById(req.params.id)

    if (!folder) {
        res.status(404)
        throw new Error('Folder not found')
    }

    if (folder.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to share this folder')
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

    const alreadyShared = folder.sharedWith.some((id) => id.toString() === userId)
    if (!alreadyShared) {
        folder.sharedWith.push(userId)
        await folder.save()
    }

    res.status(200).json({ _id: folder._id, sharedWith: folder.sharedWith })
})

// @desc    Remove another user's access to a folder (owner only)
// @route   PATCH /api/folders/:id/unshare
// @access  Private (requires valid JWT)
const unshareFolder = asyncHandler(async (req, res) => {
    const { userId } = req.body

    const folder = await Folder.findById(req.params.id)

    if (!folder) {
        res.status(404)
        throw new Error('Folder not found')
    }

    if (folder.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to unshare this folder')
    }

    if (!userId) {
        res.status(400)
        throw new Error('userId is required')
    }

    folder.sharedWith = folder.sharedWith.filter((id) => id.toString() !== userId)
    await folder.save()

    res.status(200).json({ _id: folder._id, sharedWith: folder.sharedWith })
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

// @desc    Download a folder and all its contents as a zip
// @route   GET /api/folders/:id/download
// @access  Private (requires valid JWT, owner only)
const downloadFolder = asyncHandler(async (req, res) => {
    const folder = await Folder.findById(req.params.id)

    if (!folder) {
        res.status(404)
        throw new Error('Folder not found')
    }

    if (folder.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to download this folder')
    }

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${folder.name}.zip"`)

    const archive = new ZipArchive({ zlib: { level: 9 } })
    archive.on('error', (err) => { throw err })
    archive.pipe(res)

    await addFolderToArchive(archive, folder._id, folder.name)
    await archive.finalize()
})

// Helper function to recursively add a folder's files and subfolders into a zip archive,
// preserving the folder structure under `prefix`. Mirrors deleteFolderFromDB's traversal.
async function addFolderToArchive(archive, folderId, prefix) {
    const files = await File.find({ parentFolderId: folderId })
    for (const file of files) {
        archive.file(path.resolve(file.storagePath), { name: `${prefix}/${file.name}` })
    }

    const subfolders = await Folder.find({ parentFolderId: folderId })
    for (const subfolder of subfolders) {
        await addFolderToArchive(archive, subfolder._id, `${prefix}/${subfolder.name}`)
    }

    if (files.length === 0 && subfolders.length === 0) {
        archive.append(null, { name: `${prefix}/` }) // preserve empty folders in the zip
    }
}

// @desc    Update a folder name
// @route   PATCH /api/folders/:id/rename
// @access  Private (requires valid JWT 'protect` middlware)
const updateFolderName = asyncHandler(async (req, res) => {

    const { name } = req.body

    const folder = await Folder.findById(req.params.id)

    if (!folder) {
        res.status(404)
        throw new Error('Folder not found')
    }

    if (folder.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to update this folder')
    }

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

    if (!folder) {
        res.status(404)
        throw new Error('Folder not found')
    }

    if (folder.ownerId.toString() !== req.user.id) {
        res.status(403)
        throw new Error('Not authorized to update this folder')
    }

    //update just the parentFolderId then call save() so that our mongoose validation runs
    folder.parentFolderId = parentFolderId
    const updatedFolder = await folder.save()

    res.status(200).json({
        _id: updatedFolder._id,
        name: updatedFolder.name,
        parentFolderId: updatedFolder.parentFolderId
    })
})

module.exports = {
    createFolder,
    getFolders,
    deleteFolder,
    downloadFolder,
    updateFolderName,
    updateFolderParent,
    getSharedFolders,
    searchFolders,
    shareFolder,
    unshareFolder
}