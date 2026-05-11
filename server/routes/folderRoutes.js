const express = require('express')
const router = express.Router()
const { createFolder, 
        getFolders, 
        deleteFolder,  
        updateFolderName, 
        updateFolderParent } = require('../controllers/folderController')
const { protect } = require('../middleware/authMiddleware')

// POST /api/folders/create
// Private — protect runs first and verifies the JWT from the Authorization header.
// Calls createFolder to create a new folder in the database
router.post('/create', protect, createFolder)

// GET /api/folders
// Private - only fetches folders that the user owns
// Fetches all folders inside the folder specifed, that are owned by the user
router.get('/', protect, getFolders)

// DELETE /api/folders/:id/delete
// Private - only the owner of the folder can delete it
// Deletes the specified folder and all its contents (subfolders and files)
router.delete('/:id/delete', protect, deleteFolder)

// PATCH /api/folders/:id/rename
// Private - only the owner of the folder can rename it
// Updates just the name of the specified folder
router.patch('/:id/rename', protect, updateFolderName)

// PATCH /api/folders/:id/move
// Private - only the owner of the folder can move it
// Updates just the parentFolderId of the specified folder
router.patch('/:id/move', protect, updateFolderParent)

module.exports = router