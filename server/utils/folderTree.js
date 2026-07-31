// Bounded folder-graph traversal.
//
// The folder tree is a graph of parentFolderId pointers. Nothing at the
// database level prevents that graph containing a cycle, and four separate
// traversals used to assume the parent chain terminates — so a single
// self-parented folder (stored, therefore surviving restarts) turned ordinary
// reads into unbounded loops.
//
// Two independent defences live here:
//   1. wouldCreateCycle() rejects a move that would introduce one.
//   2. MAX_FOLDER_DEPTH caps every walk, so a cycle arriving through some
//      future write path degrades into a clean error instead of a hang.
//
// Defence 2 matters because the traversals are shared infrastructure while the
// set of write paths that could corrupt the graph will keep growing.

const Folder = require('../models/folderModel')
const { badRequest } = require('./httpError')

// Deep enough that no realistic tree hits it, shallow enough that a cycle
// costs a bounded number of queries.
const MAX_FOLDER_DEPTH = 64

class FolderDepthExceeded extends Error {
    constructor() {
        super('Folder hierarchy is too deep or contains a cycle')
        this.name = 'FolderDepthExceeded'
    }
}

// Walk from `startId` up to the root, yielding each folder.
// Throws FolderDepthExceeded rather than looping forever on a cycle; the
// `seen` set catches a cycle immediately, the depth counter catches a chain
// that is merely pathological.
async function* walkAncestors(startId, select = 'parentFolderId') {
    let currentId = startId
    const seen = new Set()
    let depth = 0

    while (currentId) {
        const key = currentId.toString()
        if (seen.has(key) || depth >= MAX_FOLDER_DEPTH) throw new FolderDepthExceeded()
        seen.add(key)
        depth += 1

        const folder = await Folder.findById(currentId).select(select)
        if (!folder) return

        yield folder
        currentId = folder.parentFolderId
    }
}

// True if moving `folderId` under `destinationId` would create a cycle —
// i.e. the destination is the folder itself, or lives somewhere beneath it.
//
// Implemented by walking UP from the destination: if we meet the folder being
// moved on the way to the root, the destination is one of its descendants.
const wouldCreateCycle = async (folderId, destinationId) => {
    if (!destinationId) return false // root is never a descendant

    const movingId = folderId.toString()
    if (destinationId.toString() === movingId) return true

    try {
        for await (const ancestor of walkAncestors(destinationId)) {
            if (ancestor._id.toString() === movingId) return true
        }
    } catch (error) {
        if (error instanceof FolderDepthExceeded) {
            // The destination's own chain is already broken. Refuse the move
            // rather than adding another edge to a graph we can't reason about.
            return true
        }
        throw error
    }

    return false
}

// Translates a traversal blow-out into a client-visible 400 instead of an
// unhandled 500. Callers that traverse should wrap with this.
const asHttpError = (error) => {
    if (error instanceof FolderDepthExceeded) {
        return badRequest('Folder hierarchy is too deep or contains a cycle')
    }
    return error
}

module.exports = {
    MAX_FOLDER_DEPTH,
    FolderDepthExceeded,
    walkAncestors,
    wouldCreateCycle,
    asHttpError
}
