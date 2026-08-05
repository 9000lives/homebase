// Stored file paths.
//
// `File.storagePath` holds a path RELATIVE to UPLOAD_ROOT — `<userId>/<uuid>.<ext>`
// — never an absolute one. Three things follow from that, and the first is the
// reason the column changed shape at all:
//
//   1. UPLOAD_ROOT stays the single thing that decides where files live. An
//      absolute path freezes the answer into every row at upload time, so
//      moving the directory later strands every file already written while new
//      uploads land somewhere else — and an account deletion then misses the
//      older bytes entirely.
//   2. The upload response echoes this field to the client. Absolute meant
//      handing every member the server's filesystem layout; relative discloses
//      nothing about the host.
//   3. Rows survive the code that wrote them, so resolution is guarded rather
//      than trusted. See resolveStoredPath.
//
// Separators are stored POSIX-style. On Windows both are accepted on the way
// back in, but a backslash is an ordinary filename character on Linux, so a row
// written with one would be unreadable if the data ever moved hosts.

const path = require('path')
const { UPLOAD_ROOT } = require('../config/env')

// Multer reports an absolute path on `req.file.path`. This is the only place a
// stored value is produced.
const toStoredPath = (absolutePath) =>
    path.relative(UPLOAD_ROOT, absolutePath).split(path.sep).join('/')

// Resolve a stored path back to an absolute one, or null if it does not land
// inside UPLOAD_ROOT.
//
// Every value reaching here today is server-generated — an ObjectId directory
// and a UUID filename — so this cannot presently be reached with a hostile
// value. The check is here because that is a property of the current call
// sites and not of this function: a row read back years later is untrusted
// input, and `..` in a stored path would otherwise resolve to anywhere on the
// volume and hand it to res.download. Same reasoning as validating item names
// on write *and* sanitizing them at use.
const resolveStoredPath = (storagePath) => {
    if (typeof storagePath !== 'string' || storagePath.trim() === '') return null

    const absolute = path.resolve(UPLOAD_ROOT, storagePath)

    // path.relative does the containment test because it is case-insensitive on
    // Windows, where a string prefix comparison would not be. An empty result
    // means the path IS UPLOAD_ROOT — a directory, not a file, so also refused.
    const rel = path.relative(UPLOAD_ROOT, absolute)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null

    return absolute
}

module.exports = { toStoredPath, resolveStoredPath }
