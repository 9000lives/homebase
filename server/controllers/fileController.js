const asyncHandler = require('express-async-handler')
const fsp = require('fs/promises')
const path = require('path')
const File = require('../models/fileModel')
const User = require('../models/userModel')
const Folder = require('../models/folderModel')
const { isFolderAccessibleToUser } = require('../utils/folderAccess')
const { buildFolderPathMap } = require('../utils/folderPath')
const {
    requireObjectId,
    optionalObjectId,
    findOwned,
    ownsDocument,
    resolveOwnedFolderDestination
} = require('../utils/ownership')
const { validateItemName } = require('../utils/names')
const { badRequest, forbidden, notFound } = require('../utils/httpError')
const { log, audit, actorFrom } = require('../utils/logger')
const { readPageParams, sendPage } = require('../utils/pagination')

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const readQueryString = (value) => {
    const raw = Array.isArray(value) ? value[0] : value
    return typeof raw === 'string' ? raw.trim() : ''
}

// Shared read-access test: owner, direct share, or a share on any ancestor
// folder. Used by both download and view so the two can never diverge.
const canReadFile = async (file, req) => {
    if (ownsDocument(file, req)) return true
    if ((file.sharedWith || []).some((id) => id.toString() === req.user.id)) return true
    if (file.parentFolderId) return isFolderAccessibleToUser(file.parentFolderId, req.user.id)
    return false
}

// Headers applied to every response that streams user-uploaded bytes.
// nosniff is the important one: the stored MIME type is only as trustworthy as
// the upload verification, and a browser that content-sniffs a mismatched
// response into HTML would execute it in this application's own origin.
const setFileServingHeaders = (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    res.setHeader('Cache-Control', 'private, no-store')
}

// @desc    Upload a file
// @route   POST /api/files/upload
// @access  Private (requires valid JWT)
const uploadFile = asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file uploaded')

    // a shared folder's id is discoverable by non-owners, so make sure the
    // requester actually owns the parent before letting them upload inside it
    const parentFolderId = await resolveOwnedFolderDestination(req.body.parentFolderId, req)

    // The client's filename is data, not a path — it never touched the on-disk
    // name (that is a server-generated UUID) but it does become the download
    // filename and a zip entry, so it is validated like any other name.
    const name = validateItemName(req.file.originalname, 'File name')

    const file = await File.create({
        ownerId:        req.user.id,
        name,
        size:           req.file.size,
        // The VERIFIED type from magic-byte inspection, not the client's
        // declared Content-Type.
        mimeType:       req.verifiedType?.mime ?? req.file.mimetype,
        storagePath:    req.file.path,
        parentFolderId
    })

    audit('file.uploaded', {
        ...actorFrom(req),
        fileId: file._id.toString(),
        size: file.size,
        mimeType: file.mimeType
    })

    res.status(201).json(file)
})

// @desc    Get all files inside the given parentFolderId — either the
//          requester's own (root or own subfolder), or a foreign folder the
//          requester has live shared access to
// @route   GET /api/files
// @access  Private (requires valid JWT)
const getFiles = asyncHandler(async (req, res) => {
    const parentFolderId = optionalObjectId(req.query.parentFolderId, 'parent folder id')
    const page = readPageParams(req)

    if (!parentFolderId) {
        // root — always the requester's own root
        return sendPage(res, File.find({ ownerId: req.user.id, parentFolderId: null }), page)
    }

    const parent = await Folder.findById(parentFolderId).select('_id ownerId')
    if (!parent) throw notFound('Folder not found')

    if (ownsDocument(parent, req)) {
        // own subfolder — unchanged existing behavior
        return sendPage(res, File.find({ ownerId: req.user.id, parentFolderId }), page)
    }

    // foreign folder — only accessible via a live share chain
    if (!(await isFolderAccessibleToUser(parentFolderId, req.user.id))) {
        throw forbidden('Not authorized to view this folder')
    }

    // Scoped to the folder owner's files. Anything a third party managed to
    // park in this folder is not disclosed through someone else's share.
    return sendPage(res, File.find({ ownerId: parent.ownerId, parentFolderId }), page)
})

// @desc    Download a file
// @route   GET /api/files/:id/download
// @access  Private (requires valid JWT)
const downloadFile = asyncHandler(async (req, res) => {
    requireObjectId(req.params.id, 'file id')
    const file = await File.findById(req.params.id)

    if (!file) throw notFound('File not found')
    if (!(await canReadFile(file, req))) throw forbidden('Not authorized to access this file')

    setFileServingHeaders(res)

    // res.download builds Content-Disposition through the `content-disposition`
    // package, which quotes, escapes and RFC 5987-encodes the filename.
    res.download(path.resolve(file.storagePath), file.name, (error) => {
        if (!error) return
        // Headers are already sent by the time a stream error surfaces, so
        // there is no clean JSON error to send — log it and let the socket close.
        if (error.code === 'ENOENT') {
            log.error('download failed: file missing from disk', {
                requestId: req.id,
                fileId: file._id.toString(),
                storagePath: file.storagePath
            })
        } else {
            log.error('download failed', { requestId: req.id, fileId: file._id.toString(), error })
        }
        if (!res.headersSent) res.status(404).json({ message: 'File not found', requestId: req.id })
        else res.destroy(error)
    })
})

// @desc    Serve a file inline for preview (no forced download)
// @route   GET /api/files/:id/view
// @access  Private (requires valid JWT)
const viewFile = asyncHandler(async (req, res) => {
    requireObjectId(req.params.id, 'file id')
    const file = await File.findById(req.params.id)

    if (!file) throw notFound('File not found')
    if (!(await canReadFile(file, req))) throw forbidden('Not authorized to access this file')

    setFileServingHeaders(res)
    // The stored type is now the one verified against the file's magic bytes at
    // upload, so echoing it here no longer reflects a client-chosen value.
    // Defaults to application/octet-stream for rows written before that check.
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    // Inline, but named — so a browser that ignores the inline hint still saves
    // it under a safely-encoded filename rather than the URL's last segment.
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`)

    res.sendFile(path.resolve(file.storagePath), (error) => {
        if (!error) return
        log.error('view failed', { requestId: req.id, fileId: file._id.toString(), error })
        if (!res.headersSent) res.status(404).json({ message: 'File not found', requestId: req.id })
        else res.destroy(error)
    })
})

// @desc    Get all files shared with the logged in user (by other owners)
// @route   GET /api/files/shared
// @access  Private (requires valid JWT)
const getSharedFiles = asyncHandler(async (req, res) => {
    const page = readPageParams(req)
    return sendPage(
        res,
        File.find({ sharedWith: req.user.id }).populate('ownerId', 'displayName email'),
        page
    )
})

// @desc    Search the logged in user's OWN files by name, across their whole tree
// @route   GET /api/files/search?q=<term>
// @access  Private (requires valid JWT)
const searchFiles = asyncHandler(async (req, res) => {
    const q = readQueryString(req.query.q)
    if (!q) return res.json([])

    // escape regex metacharacters so a search for "a.b" doesn't match "axb"
    const pattern = new RegExp(escapeRegex(q), 'i')   // case-insensitive substring match

    // ownerId-scoped only (no parentFolderId) = every folder the user owns.
    // Shared-with-me files are intentionally excluded — they live in the shared section.
    const files = await File.find({ ownerId: req.user.id, name: pattern }).limit(50)

    // attach the ancestor trail of each file's folder so the UI can show where it lives
    const pathMap = await buildFolderPathMap(req.user.id)
    const results = files.map((file) => ({
        ...file.toObject(),
        path: file.parentFolderId ? (pathMap.get(file.parentFolderId.toString()) || []) : []
    }))

    res.json(results)
})

// @desc    Share a file with another active user (owner only)
// @route   PATCH /api/files/:id/share
// @access  Private (requires valid JWT)
const shareFile = asyncHandler(async (req, res) => {
    // requireObjectId rejects a non-string body value outright, which closes the
    // operator-injection sink where {"userId": {"$ne": null}} reached findById.
    const userId = requireObjectId(req.body.userId, 'user id')
    const file = await findOwned(File, req.params.id, req, { label: 'file' })

    const targetUser = await User.findById(userId).select('_id status')
    if (!targetUser || targetUser.status !== 'active') {
        throw badRequest('User not found or not active')
    }

    const alreadyShared = file.sharedWith.some((id) => id.toString() === userId)
    if (!alreadyShared) {
        file.sharedWith.push(userId)
        await file.save()
        audit('file.shared', { ...actorFrom(req), fileId: file._id.toString(), targetUserId: userId })
    }

    res.status(200).json({ _id: file._id, sharedWith: file.sharedWith })
})

// @desc    Remove another user's access to a file (owner only)
// @route   PATCH /api/files/:id/unshare
// @access  Private (requires valid JWT)
const unshareFile = asyncHandler(async (req, res) => {
    const userId = requireObjectId(req.body.userId, 'user id')
    const file = await findOwned(File, req.params.id, req, { label: 'file' })

    file.sharedWith = file.sharedWith.filter((id) => id.toString() !== userId)
    await file.save()

    audit('file.unshared', { ...actorFrom(req), fileId: file._id.toString(), targetUserId: userId })

    res.status(200).json({ _id: file._id, sharedWith: file.sharedWith })
})

// @desc    Delete a file
// @route   DELETE /api/files/:id/delete
// @access  Private (requires valid JWT)
const deleteFile = asyncHandler(async (req, res) => {
    const file = await findOwned(File, req.params.id, req, { label: 'file' })

    // Database FIRST, then a best-effort unlink.
    //
    // The previous order (unlink, then delete the row) meant a throwing
    // unlinkSync — ENOENT from a concurrent delete, or a Windows sharing
    // violation while the file was being streamed — aborted the handler and
    // left a row pointing at nothing. Such a row later crashed the zip download
    // path. A file on disk with no row is recoverable garbage; a row with no
    // file was a denial-of-service primitive.
    await File.findByIdAndDelete(file._id)

    try {
        await fsp.unlink(path.resolve(file.storagePath))
    } catch (error) {
        // Already gone is the desired end state, not a failure.
        if (error.code !== 'ENOENT') {
            log.error('failed to unlink file from disk', {
                requestId: req.id,
                fileId: file._id.toString(),
                error
            })
        }
    }

    audit('file.deleted', { ...actorFrom(req), fileId: file._id.toString() })

    res.json({ message: 'File deleted' })
})

// @desc    Update a file name
// @route   PATCH /api/files/:id/rename
// @access  Private (requires valid JWT 'protect` middlware)
const updateFileName = asyncHandler(async (req, res) => {
    const file = await findOwned(File, req.params.id, req, { label: 'file' })

    // Names reach zip entry paths and download headers, so they are constrained
    // here rather than only sanitized at the point of use.
    file.name = validateItemName(req.body.name, 'File name')
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
    const file = await findOwned(File, req.params.id, req, { label: 'file' })

    // BOTH sides of the move are authorized. Previously only the file was
    // checked and the destination was written straight from the body, so any
    // user could move their file into a folder belonging to someone else —
    // where that owner's recursive delete would destroy it, their share
    // recipients would see it, and their zip download would include it.
    file.parentFolderId = await resolveOwnedFolderDestination(req.body.parentFolderId, req)

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
    searchFiles,
    shareFile,
    unshareFile
}
