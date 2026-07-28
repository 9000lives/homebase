const express = require('express')
const router = express.Router()
const { uploadFile,
        getFiles,
        downloadFile,
        viewFile,
        deleteFile,
        updateFileName,
        updateFileFolder,
        getSharedFiles,
        searchFiles,
        shareFile,
        unshareFile } = require('../controllers/fileController')
const { protect } = require('../middleware/authMiddleware')
const upload = require('../middleware/uploadMiddleware')

// POST /api/files/upload
// Private — protect runs first and verifies the JWT from the Authorization header.
// Calls protect to verify user, then calls the upload middleware to upload the file to the server
// then calls uploadFile to create the cooresponding file in our database
router.post('/upload', protect, upload.single('file'), uploadFile)

// GET /api/files
// Private - only fetches files that the user owns
// Fetches all files inside the folder specifed, that are owned by the user
router.get('/', protect, getFiles)

// GET /api/files/shared
// Private — fetches files that other users have shared with the logged in user
router.get('/shared', protect, getSharedFiles)

// GET /api/files/search?q=<term>
// Private — searches the logged in user's own files by name across their whole tree
router.get('/search', protect, searchFiles)

// GET /api/files/:id/download
// Private — protect runs first and verifies the JWT from the Authorization header.
// Calls the res.download to attach the specified file as an attachment to the request
router.get('/:id/download', protect, downloadFile)

// GET /api/files/:id/view
// Private — protect runs first and verifies the JWT from the Authorization header.
// Serves the file inline (Content-Type set, no attachment disposition) for previewing in the browser
router.get('/:id/view', protect, viewFile)

// DELETE /api/files/:id/delete
// Private — protect runs first and verifies the JWT from the Authorization header.
// Checks if file exsits, verifies the user owns file, then deletes it from the server and the database
router.delete('/:id/delete', protect, deleteFile)

// PATCH /api/files/:id/rename
// Private — protect runs first and verifies the JWT from the Authorization header.
// Checks if file exsits, verifies the user owns file, then updates the name of the file in the database
router.patch('/:id/rename', protect, updateFileName)

// PATCH /api/files/:id/move
// Private — protect runs first and verifies the JWT from the Authorization header.
// Checks if file exsits, verifies the user owns file, then updates the parent folder of the file in the database
router.patch('/:id/move', protect, updateFileFolder)

// PATCH /api/files/:id/share
// Private — protect runs first and verifies the JWT from the Authorization header.
// Checks if file exists, verifies the user owns it, then adds userId (from the body) to sharedWith
router.patch('/:id/share', protect, shareFile)

// PATCH /api/files/:id/unshare
// Private — protect runs first and verifies the JWT from the Authorization header.
// Checks if file exists, verifies the user owns it, then removes userId (from the body) from sharedWith
router.patch('/:id/unshare', protect, unshareFile)

module.exports = router