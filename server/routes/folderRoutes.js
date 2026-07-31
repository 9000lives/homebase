const express = require('express')
const router = express.Router()
const { createFolder,
        getFolders,
        deleteFolder,
        downloadFolder,
        updateFolderName,
        updateFolderParent,
        getSharedFolders,
        searchFolders,
        shareFolder,
        unshareFolder } = require('../controllers/folderController')
const { protect } = require('../middleware/authMiddleware')
const { downloadLimiter } = require('../middleware/rateLimiters')

// POST /api/folders/create
// Private — protect runs first and verifies the JWT from the Authorization header.
// Calls createFolder to create a new folder in the database
router.post('/create', protect, createFolder)

// GET /api/folders
// Private - only fetches folders that the user owns
// Fetches all folders inside the folder specifed, that are owned by the user
router.get('/', protect, getFolders)

// GET /api/folders/shared
// Private — fetches folders that other users have shared directly with the logged in user
router.get('/shared', protect, getSharedFolders)

// GET /api/folders/search?q=<term>
// Private — searches the logged in user's own folders by name across their whole tree
router.get('/search', protect, searchFolders)

// DELETE /api/folders/:id/delete
// Private - only the owner of the folder can delete it
// Deletes the specified folder and all its contents (subfolders and files)
router.delete('/:id/delete', protect, deleteFolder)

// GET /api/folders/:id/download
// Private - only the owner can download; streams a zip of the folder and all its contents.
// Rate-limited separately: zip generation walks the whole subtree and streams a
// compressed archive, which is far more costly than an ordinary read.
router.get('/:id/download', protect, downloadLimiter, downloadFolder)

// PATCH /api/folders/:id/rename
// Private - only the owner of the folder can rename it
// Updates just the name of the specified folder
router.patch('/:id/rename', protect, updateFolderName)

// PATCH /api/folders/:id/move
// Private - only the owner of the folder can move it
// Updates just the parentFolderId of the specified folder
router.patch('/:id/move', protect, updateFolderParent)

// PATCH /api/folders/:id/share
// Private - only the owner of the folder can share it
// Adds userId (from the body) to sharedWith, granting live read access to this folder's subtree
router.patch('/:id/share', protect, shareFolder)

// PATCH /api/folders/:id/unshare
// Private - only the owner of the folder can unshare it
// Removes userId (from the body) from sharedWith
router.patch('/:id/unshare', protect, unshareFolder)

module.exports = router