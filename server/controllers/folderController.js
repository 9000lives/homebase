const asyncHandler = require('express-async-handler')
const fsp = require('fs/promises')
const { ZipArchive } = require('archiver')
const Folder = require('../models/folderModel')
const File = require('../models/fileModel')
const User = require('../models/userModel')
const { isFolderAccessibleToUser } = require('../utils/folderAccess')
const { buildFolderPathMap } = require('../utils/folderPath')
const { wouldCreateCycle, MAX_FOLDER_DEPTH } = require('../utils/folderTree')
const {
    requireObjectId,
    optionalObjectId,
    findOwned,
    ownsDocument,
    resolveOwnedFolderDestination
} = require('../utils/ownership')
const { validateItemName, sanitizePathSegment } = require('../utils/names')
const { resolveStoredPath } = require('../utils/fileStorage')
const { badRequest, forbidden, notFound } = require('../utils/httpError')
const { log, audit, actorFrom } = require('../utils/logger')
const { readPageParams, sendPage } = require('../utils/pagination')

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const readQueryString = (value) => {
    const raw = Array.isArray(value) ? value[0] : value
    return typeof raw === 'string' ? raw.trim() : ''
}

// @desc    Create a folder
// @route   POST /api/folders
// @access  Private (requires valid JWT)
const createFolder = asyncHandler(async (req, res) => {
    const name = validateItemName(req.body.name, 'Folder name')

    // a shared folder's id is discoverable by non-owners, so make sure the
    // requester actually owns the parent before letting them create inside it
    const parentFolderId = await resolveOwnedFolderDestination(req.body.parentFolderId, req)

    const folder = await Folder.create({ ownerId: req.user.id, name, parentFolderId })

    res.status(201).json({
        _id: folder.id,
        ownerId: folder.ownerId,
        name: folder.name,
        parentFolderId: folder.parentFolderId
    })
})

// @desc    Get all folders inside the given parentFolderId — either the
//          requester's own (root or own subfolder), or a foreign folder the
//          requester has live shared access to
// @route   GET /api/folders
// @access  Private (requires valid JWT)
const getFolders = asyncHandler(async (req, res) => {
    const parentFolderId = optionalObjectId(req.query.parentFolderId, 'parent folder id')
    const page = readPageParams(req)

    if (!parentFolderId) {
        // root — always the requester's own root
        return sendPage(res, Folder.find({ ownerId: req.user.id, parentFolderId: null }), page)
    }

    const parent = await Folder.findById(parentFolderId).select('_id ownerId')
    if (!parent) throw notFound('Folder not found')

    if (ownsDocument(parent, req)) {
        // own subfolder — unchanged existing behavior
        return sendPage(res, Folder.find({ ownerId: req.user.id, parentFolderId }), page)
    }

    // foreign folder — only accessible via a live share chain
    if (!(await isFolderAccessibleToUser(parentFolderId, req.user.id))) {
        throw forbidden('Not authorized to view this folder')
    }

    // Owner-scoped, so a stray document from a third party is never disclosed
    // through someone else's share.
    return sendPage(res, Folder.find({ ownerId: parent.ownerId, parentFolderId }), page)
})

// @desc    Get all folders shared directly with the logged in user
// @route   GET /api/folders/shared
// @access  Private (requires valid JWT)
const getSharedFolders = asyncHandler(async (req, res) => {
    const page = readPageParams(req)
    return sendPage(
        res,
        Folder.find({ sharedWith: req.user.id }).populate('ownerId', 'displayName email'),
        page
    )
})

// @desc    Search the logged in user's OWN folders by name, across their whole tree
// @route   GET /api/folders/search?q=<term>
// @access  Private (requires valid JWT)
const searchFolders = asyncHandler(async (req, res) => {
    const q = readQueryString(req.query.q)
    if (!q) return res.json([])

    // escape regex metacharacters so a search for "a.b" doesn't match "axb"
    const pattern = new RegExp(escapeRegex(q), 'i')   // case-insensitive substring match

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
    const userId = requireObjectId(req.body.userId, 'user id')
    const folder = await findOwned(Folder, req.params.id, req, { label: 'folder' })

    const targetUser = await User.findById(userId).select('_id status')
    if (!targetUser || targetUser.status !== 'active') {
        throw badRequest('User not found or not active')
    }

    const alreadyShared = folder.sharedWith.some((id) => id.toString() === userId)
    if (!alreadyShared) {
        folder.sharedWith.push(userId)
        await folder.save()
        audit('folder.shared', { ...actorFrom(req), folderId: folder._id.toString(), targetUserId: userId })
    }

    res.status(200).json({ _id: folder._id, sharedWith: folder.sharedWith })
})

// @desc    Remove another user's access to a folder (owner only)
// @route   PATCH /api/folders/:id/unshare
// @access  Private (requires valid JWT)
const unshareFolder = asyncHandler(async (req, res) => {
    const userId = requireObjectId(req.body.userId, 'user id')
    const folder = await findOwned(Folder, req.params.id, req, { label: 'folder' })

    folder.sharedWith = folder.sharedWith.filter((id) => id.toString() !== userId)
    await folder.save()

    audit('folder.unshared', { ...actorFrom(req), folderId: folder._id.toString(), targetUserId: userId })

    res.status(200).json({ _id: folder._id, sharedWith: folder.sharedWith })
})

// @desc    Delete a folder and all its contents
// @route   DELETE /api/folders/:id/delete
// @access  Private (requires valid JWT)
const deleteFolder = asyncHandler(async (req, res) => {
    const folder = await findOwned(Folder, req.params.id, req, { label: 'folder' })

    await deleteFolderFromDB(folder._id, folder.ownerId)

    audit('folder.deleted', { ...actorFrom(req), folderId: folder._id.toString() })

    res.json({ message: 'Folder deleted' })
})

// Recursively delete a folder and its contents.
//
// Two changes from the original, both about blast radius:
//
//   ownerId scoping — every query is filtered by the owner, so a document
//   parked in this folder by someone else is never swept into the owner's
//   delete. That is defence in depth behind the destination-authorization fix
//   in updateFileFolder; the cross-user write should no longer be possible at
//   all, but a stray row must not destroy another user's data if it is.
//
//   depth bounding — a cycle in the parent graph made this recurse forever.
//
// Ordering is unchanged and load-bearing: recurse into subfolders depth-first
// BEFORE deleting this level, or the children are orphaned.
async function deleteFolderFromDB(folderId, ownerId, depth = 0) {
    if (depth > MAX_FOLDER_DEPTH) {
        log.error('folder delete aborted: depth limit reached', { folderId: folderId.toString() })
        throw badRequest('Folder hierarchy is too deep or contains a cycle')
    }

    const subfolders = await Folder.find({ parentFolderId: folderId, ownerId }).select('_id')
    for (const subfolder of subfolders) {
        await deleteFolderFromDB(subfolder._id, ownerId, depth + 1)
    }

    const files = await File.find({ parentFolderId: folderId, ownerId }).select('_id storagePath')

    // Database first, then best-effort unlink — same reasoning as deleteFile:
    // a dangling row is far more dangerous than an orphaned byte.
    await File.deleteMany({ _id: { $in: files.map((f) => f._id) } })

    // Bounded concurrency: fully serial blocking unlinks froze the event loop
    // for the whole request on a folder with thousands of files.
    const CONCURRENCY = 16
    for (let i = 0; i < files.length; i += CONCURRENCY) {
        await Promise.all(
            files.slice(i, i + CONCURRENCY).map(async (file) => {
                const absolutePath = resolveStoredPath(file.storagePath)
                if (!absolutePath) {
                    log.error('cannot unlink file during folder delete: path does not resolve', {
                        fileId: file._id.toString(),
                        storagePath: file.storagePath
                    })
                    return
                }
                try {
                    await fsp.unlink(absolutePath)
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        log.error('failed to unlink file during folder delete', {
                            fileId: file._id.toString(),
                            error
                        })
                    }
                }
            })
        )
    }

    await Folder.findByIdAndDelete(folderId)
}

// @desc    Download a folder and all its contents as a zip
// @route   GET /api/folders/:id/download
// @access  Private (requires valid JWT, owner only)
const downloadFolder = asyncHandler(async (req, res) => {
    const folder = await findOwned(Folder, req.params.id, req, { label: 'folder' })

    const archive = new ZipArchive({ zlib: { level: 9 } })

    // Previously: archive.on('error', err => { throw err }).
    //
    // emit() runs synchronously inside archiver's own stream machinery, outside
    // the request's promise chain — so express-async-handler never saw the
    // throw. It escaped as an uncaught exception and terminated the process,
    // and the trigger (a File row pointing at a missing path) was persistent,
    // making it a one-shot setup for indefinite downtime.
    //
    // Headers are already sent by this point, so there is no clean JSON error
    // to send. Log it and destroy the connection; the client must treat a
    // truncated archive as a failure.
    archive.on('error', (error) => {
        log.error('archive failed', {
            requestId: req.id,
            folderId: folder._id.toString(),
            error
        })
        res.destroy(error)
    })

    archive.on('warning', (error) => {
        log.warn('archive warning', { requestId: req.id, error })
    })

    // res.attachment() delegates to the `content-disposition` package, which
    // quotes, escapes and RFC 5987-encodes the filename — the same treatment
    // res.download already gave the file route. The previous hand-built header
    // interpolated an unvalidated folder name straight into the value, letting
    // a name like `a"; filename="report.pdf` inject a second filename
    // parameter (and a name containing CR/LF throw a 500 out of setHeader).
    res.attachment(`${sanitizePathSegment(folder.name)}.zip`)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('X-Content-Type-Options', 'nosniff')

    archive.pipe(res)

    await addFolderToArchive(archive, folder._id, folder.ownerId, sanitizePathSegment(folder.name))
    await archive.finalize()
})

// Recursively add a folder's files and subfolders into a zip archive,
// preserving the structure under `prefix`. Mirrors deleteFolderFromDB.
//
// Every path component passes through sanitizePathSegment, so a name like
// `../../../../.ssh/authorized_keys` — which the rename endpoint used to accept
// and which was concatenated straight into the entry name — collapses to a
// single harmless segment instead of escaping the extraction directory on the
// downloading user's machine.
//
// Queries are owner-scoped and the recursion is depth-bounded, for the same
// reasons as the delete path.
async function addFolderToArchive(archive, folderId, ownerId, prefix, depth = 0) {
    if (depth > MAX_FOLDER_DEPTH) {
        throw badRequest('Folder hierarchy is too deep or contains a cycle')
    }

    const files = await File.find({ parentFolderId: folderId, ownerId }).select('name storagePath')

    for (const file of files) {
        const resolved = resolveStoredPath(file.storagePath)

        // Skip rows whose path does not resolve, for the same reason as ones
        // whose bytes are gone: archiver would emit the error mid-stream.
        if (!resolved) {
            log.error('archive skipped file: storage path does not resolve', {
                fileId: file._id.toString(),
                storagePath: file.storagePath
            })
            continue
        }

        // Skip rows whose bytes are missing rather than letting archiver emit
        // ENOENT mid-stream. A partial archive beats a destroyed connection,
        // and the row is reported so it can be reconciled.
        try {
            await fsp.access(resolved)
        } catch {
            log.error('archive skipped missing file', {
                fileId: file._id.toString(),
                storagePath: file.storagePath
            })
            continue
        }

        archive.file(resolved, { name: `${prefix}/${sanitizePathSegment(file.name)}` })
    }

    const subfolders = await Folder.find({ parentFolderId: folderId, ownerId }).select('_id name')
    for (const subfolder of subfolders) {
        await addFolderToArchive(
            archive,
            subfolder._id,
            ownerId,
            `${prefix}/${sanitizePathSegment(subfolder.name)}`,
            depth + 1
        )
    }

    if (files.length === 0 && subfolders.length === 0) {
        archive.append(null, { name: `${prefix}/` }) // preserve empty folders in the zip
    }
}

// @desc    Update a folder name
// @route   PATCH /api/folders/:id/rename
// @access  Private (requires valid JWT 'protect` middlware)
const updateFolderName = asyncHandler(async (req, res) => {
    const folder = await findOwned(Folder, req.params.id, req, { label: 'folder' })

    folder.name = validateItemName(req.body.name, 'Folder name')
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
    const folder = await findOwned(Folder, req.params.id, req, { label: 'folder' })

    // The destination is authorized, not just the folder being moved.
    const destinationId = await resolveOwnedFolderDestination(req.body.parentFolderId, req)

    // A folder parented to itself (or to one of its own descendants) creates a
    // cycle in the graph. That cycle is STORED, so it survives restarts, and
    // every traversal that walks the parent chain — share-access checks, search
    // breadcrumbs, delete, zip download — hangs on it. One request used to be
    // enough to poison the account permanently.
    if (await wouldCreateCycle(folder._id, destinationId)) {
        throw badRequest('A folder cannot be moved into itself or one of its own subfolders')
    }

    folder.parentFolderId = destinationId
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
