const express = require('express')
const router = express.Router()
const { uploadFile, 
        getFiles, 
        downloadFile, 
        deleteFile, 
        updateFileName, 
        updateFileFolder } = require('../controllers/fileController')
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

// GET /api/files/:id/download
// Private — protect runs first and verifies the JWT from the Authorization header.
// Calls the res.download to attach the specified file as an attachment to the request
router.get('/:id/download', protect, downloadFile)

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

module.exports = router