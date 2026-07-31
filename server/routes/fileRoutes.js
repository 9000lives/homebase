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
const { upload, enforceStorageQuota, verifyUploadedFile } = require('../middleware/uploadMiddleware')
const { uploadLimiter, downloadLimiter } = require('../middleware/rateLimiters')

// POST /api/files/upload
// Private. The order of this chain is a security control, not a style choice:
//   protect             — establishes req.user, which the storage path is keyed on
//   uploadLimiter       — bounds the rate before any bytes are accepted
//   enforceStorageQuota — rejects an over-quota user BEFORE Multer writes to disk
//   upload.single       — writes to <uploads>/<userId>/<uuid> with no extension
//   verifyUploadedFile  — magic-byte check; the client's declared type and the
//                         actual bytes must agree, and the stored extension is
//                         derived from the VERIFIED type
//   uploadFile          — authorizes the destination folder and creates the row
//
// Any throw after Multer has written leaves the bytes on disk, so the error
// handler unlinks req.file.path on every error path.
router.post(
    '/upload',
    protect,
    uploadLimiter,
    enforceStorageQuota,
    upload.single('file'),
    verifyUploadedFile,
    uploadFile
)

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
// Private — attaches the specified file as an attachment to the response
router.get('/:id/download', protect, downloadLimiter, downloadFile)

// GET /api/files/:id/view
// Private — serves the file inline for previewing in the browser, with
// nosniff and a sandboxing CSP so a mismatched type can't be sniffed into a
// document running in this origin
router.get('/:id/view', protect, downloadLimiter, viewFile)

// DELETE /api/files/:id/delete
// Private — verifies the user owns the file, then removes the row and unlinks the bytes
router.delete('/:id/delete', protect, deleteFile)

// PATCH /api/files/:id/rename
// Private — verifies ownership, validates the new name, then updates it
router.patch('/:id/rename', protect, updateFileName)

// PATCH /api/files/:id/move
// Private — verifies ownership of BOTH the file and the destination folder
router.patch('/:id/move', protect, updateFileFolder)

// PATCH /api/files/:id/share
// Private — verifies the user owns it, then adds userId (from the body) to sharedWith
router.patch('/:id/share', protect, shareFile)

// PATCH /api/files/:id/unshare
// Private — verifies the user owns it, then removes userId (from the body) from sharedWith
router.patch('/:id/unshare', protect, unshareFile)

module.exports = router
