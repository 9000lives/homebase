const { walkAncestors, asHttpError } = require('./folderTree')

// Walks parentFolderId upward from folderId (inclusive of folderId itself),
// returning true as soon as a folder in the chain has userId in sharedWith.
// Returns false if it reaches the root or hits a missing/deleted ancestor.
//
// The walk is bounded (see folderTree.js). Before that, a self-parented folder
// made this loop forever, issuing a Folder.findById on every iteration — a few
// concurrent requests exhausted the Mongoose connection pool and starved every
// other request in the process.
async function isFolderAccessibleToUser(folderId, userId) {
    try {
        for await (const folder of walkAncestors(folderId, 'sharedWith parentFolderId')) {
            if ((folder.sharedWith || []).some((id) => id.toString() === userId.toString())) {
                return true
            }
        }
    } catch (error) {
        throw asHttpError(error)
    }
    return false
}

module.exports = { isFolderAccessibleToUser }
