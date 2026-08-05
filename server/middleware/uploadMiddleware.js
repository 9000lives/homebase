// Upload pipeline.
//
// Three stages, in order, and the order matters:
//
//   enforceStorageQuota  → before Multer, so an over-quota user's bytes are
//                          never written to disk at all.
//   upload.single('file')→ Multer writes to <uploads>/<userId>/<uuid>, with NO
//                          extension. The client's filename never becomes a
//                          path component and never picks the stored extension.
//   verifyUploadedFile   → reads the leading bytes, requires the real content
//                          type to match what the client declared, and renames
//                          the file to the extension implied by the VERIFIED
//                          type.
//
// Previously only the client-declared Content-Type of the multipart part was
// checked, and the on-disk extension came from the client's filename — so the
// declared type, the extension, and the actual bytes could disagree in any
// combination. That let an attacker store an executable, record it as
// `image/png`, and have the UI present it as an image to everyone they shared
// it with.

const multer = require('multer')
const path = require('path')
const fsp = require('fs/promises')
const mongoose = require('mongoose')
const { v4: uuidv4 } = require('uuid')
const asyncHandler = require('express-async-handler')

const File = require('../models/fileModel')
const { MAX_UPLOAD_BYTES, USER_STORAGE_QUOTA_BYTES, UPLOAD_ROOT } = require('../config/env')
const { SAMPLE_BYTES, ALLOWED_TYPES, detectType, matchDangerous } = require('../utils/fileSignature')
const { payloadTooLarge, unsupportedMediaType, badRequest } = require('../utils/httpError')
const { log } = require('../utils/logger')

// Total bytes currently attributed to a user. Same aggregation the admin
// dashboard uses for its per-user figure, so the two can never disagree.
const getUserStorageBytes = async (userId) => {
    // $match inside aggregate() does NOT run Mongoose casting, so a string
    // ownerId would silently match zero documents and report a quota of 0 —
    // the explicit ObjectId is load-bearing.
    const [totals] = await File.aggregate([
        { $match: { ownerId: new mongoose.Types.ObjectId(String(userId)) } },
        { $group: { _id: null, bytes: { $sum: { $ifNull: ['$size', 0] } } } }
    ])
    return totals?.bytes ?? 0
}

// Runs BEFORE Multer. Rejects on the declared Content-Length so an over-quota
// request costs no disk at all. The post-write check below catches a request
// that lied about (or omitted) its length.
const enforceStorageQuota = asyncHandler(async (req, res, next) => {
    const used = await getUserStorageBytes(req.user.id)

    if (used >= USER_STORAGE_QUOTA_BYTES) {
        throw payloadTooLarge('Storage quota exceeded. Delete some files to free up space.')
    }

    const declared = Number(req.headers['content-length'] || 0)
    if (declared && used + declared > USER_STORAGE_QUOTA_BYTES) {
        throw payloadTooLarge('This upload would exceed your storage quota.')
    }

    req.storageUsedBytes = used
    next()
})

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Keyed by the AUTHENTICATED user id, never a client-supplied value.
        const dir = path.join(UPLOAD_ROOT, req.user.id.toString())
        // Async so a slow filesystem doesn't block the event loop for every
        // other in-flight request.
        fsp.mkdir(dir, { recursive: true })
            .then(() => cb(null, dir))
            .catch(cb)
    },
    filename: (req, file, cb) => {
        // No extension yet. The client's filename gets no say in what this
        // file is called on disk; verifyUploadedFile appends the extension
        // implied by the verified content type.
        cb(null, uuidv4())
    }
})

// First-pass filter on the declared type. Cheap, and it stops the obvious
// cases before any bytes are written — but it is NOT trusted on its own,
// because this value is chosen by the client. verifyUploadedFile is the check
// that actually decides.
const fileFilter = (req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
        cb(null, true)
    } else {
        cb(unsupportedMediaType(`File type '${file.mimetype}' is not allowed`))
    }
}

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        // Bound the non-file parts too, so a multipart body can't be used to
        // deliver an unbounded field.
        fields: 10,
        fieldSize: 64 * 1024
    }
})

// Runs AFTER Multer. Anything thrown from here is cleaned up by the error
// handler, which unlinks req.file.path on every error path.
const verifyUploadedFile = asyncHandler(async (req, res, next) => {
    if (!req.file) throw badRequest('No file uploaded')

    // Re-check against the real size on disk: Content-Length is client-supplied
    // and chunked uploads omit it entirely.
    if ((req.storageUsedBytes ?? 0) + req.file.size > USER_STORAGE_QUOTA_BYTES) {
        throw payloadTooLarge('This upload would exceed your storage quota.')
    }

    const handle = await fsp.open(req.file.path, 'r')
    let sample
    try {
        const buffer = Buffer.alloc(SAMPLE_BYTES)
        const { bytesRead } = await handle.read(buffer, 0, SAMPLE_BYTES, 0)
        sample = buffer.subarray(0, bytesRead)
    } finally {
        await handle.close()
    }

    // Reported separately so a user who uploaded the wrong thing gets a useful
    // message, and so the attempt is logged as what it was.
    const dangerous = matchDangerous(sample)
    if (dangerous) {
        log.warn('upload blocked: dangerous content', {
            requestId: req.id,
            userId: req.user.id,
            declared: req.file.mimetype,
            signature: dangerous.label
        })
        throw unsupportedMediaType(`Files of this kind (${dangerous.label}) cannot be uploaded`)
    }

    const detected = detectType(sample)

    if (!detected) {
        throw unsupportedMediaType('File content does not match any allowed file type')
    }

    // The declared type and the actual bytes must agree. This is the check the
    // whole stage exists for.
    if (detected.mime !== req.file.mimetype) {
        log.warn('upload type mismatch', {
            requestId: req.id,
            userId: req.user.id,
            declared: req.file.mimetype,
            detected: detected.mime
        })
        throw unsupportedMediaType(
            `File contents (${detected.mime}) do not match the declared type (${req.file.mimetype})`
        )
    }

    // Rename to the extension implied by the VERIFIED type, so what is on disk
    // always describes what the file actually is.
    const verifiedPath = `${req.file.path}${detected.ext}`
    await fsp.rename(req.file.path, verifiedPath)

    req.file.path = verifiedPath
    req.file.filename = path.basename(verifiedPath)
    req.verifiedType = detected

    next()
})

// UPLOAD_ROOT is deliberately NOT re-exported here. It is configuration, and it
// comes from config/env.js like every other setting — two import paths for one
// value is exactly how the two drift apart later.
module.exports = {
    upload,
    enforceStorageQuota,
    verifyUploadedFile,
    getUserStorageBytes
}
