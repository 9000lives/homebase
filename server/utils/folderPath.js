const Folder = require('../models/folderModel')

// Loads every folder the user owns and builds a lookup of folderId -> ancestor
// trail, so search results can show WHERE a match lives without a per-result
// walk up parentFolderId. Each value is the path from the root down to AND
// INCLUDING that folder, as [{ _id, name }, ...] (root first).
//
// Mirrors the parentFolderId-walking in folderAccess.js, but produces a display
// path instead of an access boolean. The user's folder set is small, so a single
// find() + in-memory resolve is cheaper than repeated DB lookups.
async function buildFolderPathMap(ownerId) {
    const folders = await Folder.find({ ownerId }).select('_id name parentFolderId')

    // id -> { name, parentFolderId } for quick parent lookups
    const byId = new Map()
    for (const folder of folders) {
        byId.set(folder._id.toString(), {
            name: folder.name,
            parentFolderId: folder.parentFolderId ? folder.parentFolderId.toString() : null
        })
    }

    // Resolve each folder's full trail, memoizing as we go.
    const pathMap = new Map()

    const resolve = (id) => {
        if (pathMap.has(id)) return pathMap.get(id)

        const node = byId.get(id)
        if (!node) return []   // missing/deleted ancestor — stop the chain

        const parentPath = node.parentFolderId ? resolve(node.parentFolderId) : []
        const trail = [...parentPath, { _id: id, name: node.name }]
        pathMap.set(id, trail)
        return trail
    }

    for (const id of byId.keys()) {
        resolve(id)
    }

    return pathMap
}

module.exports = { buildFolderPathMap }
