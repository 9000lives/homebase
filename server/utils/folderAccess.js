const Folder = require('../models/folderModel')

// Walks parentFolderId upward from folderId (inclusive of folderId itself),
// returning true as soon as a folder in the chain has userId in sharedWith.
// Returns false if it reaches the root or hits a missing/deleted ancestor.
async function isFolderAccessibleToUser(folderId, userId) {
    let currentId = folderId
    while (currentId) {
        const folder = await Folder.findById(currentId).select('sharedWith parentFolderId')
        if (!folder) return false
        if ((folder.sharedWith || []).some((id) => id.toString() === userId.toString())) {
            return true
        }
        currentId = folder.parentFolderId
    }
    return false
}

module.exports = { isFolderAccessibleToUser }
