// Shared object-level authorization.
//
// This replaces ten hand-repeated `doc.ownerId.toString() !== req.user.id`
// comparisons. That duplication is what produced H1: the move endpoints
// checked the object being moved and forgot the destination it was moving
// into. One implementation means one place to get it right.
//
// Every helper here validates the id BEFORE querying, so a malformed id
// produces a clean 400 rather than a Mongoose CastError surfacing as a 500.

const Folder = require('../models/folderModel')
const { badRequest, forbidden, notFound } = require('./httpError')

// Stricter than mongoose.Types.ObjectId.isValid, which also accepts any
// 12-character string and any number — both of which cast to an unrelated id
// instead of failing. Only the 24-character hex form a client could legitimately
// have received from this API is accepted.
const isValidObjectId = (id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)

// Accepts a value that must be a well-formed ObjectId string.
// Rejects objects outright, which closes the NoSQL operator-injection sink
// where a body of {"userId": {"$ne": null}} reached a query.
const requireObjectId = (value, label = 'id') => {
    if (!isValidObjectId(value)) {
        throw badRequest(`Invalid ${label}`)
    }
    return value
}

// Optional variant: null/undefined/'' mean "not provided" and pass through as
// null. Used for parentFolderId, where null legitimately means "root".
const optionalObjectId = (value, label = 'id') => {
    if (value === undefined || value === null || value === '') return null
    return requireObjectId(value, label)
}

const ownsDocument = (doc, req) => doc.ownerId.toString() === req.user.id

// Load a document by id and require the requester to own it.
//
// Returns 404 when the document does not exist and 403 when it exists but
// belongs to someone else. That distinction is deliberate and safe here: ids
// are only discoverable through endpoints that already authorize the caller.
const findOwned = async (Model, id, req, { label = 'item', select } = {}) => {
    requireObjectId(id, `${label} id`)

    const query = Model.findById(id)
    if (select) query.select(select)
    const doc = await query

    if (!doc) throw notFound(`${label[0].toUpperCase()}${label.slice(1)} not found`)
    if (!ownsDocument(doc, req)) throw forbidden(`Not authorized to access this ${label}`)

    return doc
}

// Resolve the destination of a move/create into a folder.
//
// Returns null for the requester's own root, or the validated id of a folder
// they own. This is the check that was missing from both move endpoints —
// mirroring what uploadFile and createFolder already did.
const resolveOwnedFolderDestination = async (parentFolderId, req) => {
    const id = optionalObjectId(parentFolderId, 'parent folder id')
    if (id === null) return null

    const parent = await Folder.findById(id).select('_id ownerId')

    if (!parent || !ownsDocument(parent, req)) {
        // One message for "doesn't exist" and "isn't yours" so this endpoint
        // can't be used to probe which folder ids exist.
        throw forbidden('Not authorized to place items in this folder')
    }

    return parent._id
}

module.exports = {
    isValidObjectId,
    requireObjectId,
    optionalObjectId,
    ownsDocument,
    findOwned,
    resolveOwnedFolderDestination
}
