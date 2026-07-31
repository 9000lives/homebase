// File and folder name handling.
//
// Item names are attacker-controlled from two directions: the multipart
// `originalname` at upload, and the rename endpoints afterward. They then flow
// into a zip entry path and (previously) a hand-built Content-Disposition
// header — so they need to be constrained on write AND sanitized on use.
//
// Both, deliberately. Validating only on write leaves rows that predate the
// rule; sanitizing only on use leaves every future consumer of `name` exposed.

const { badRequest } = require('./httpError')

const MAX_NAME_LENGTH = 255

// C0 controls, DEL, and the C1 range. Tested by code point rather than a regex
// character class so the source file itself stays free of literal control
// bytes. These break Content-Disposition construction (Node's setHeader throws
// on CR/LF), terminal output, and archive extractors.
const isControlChar = (codePoint) =>
    codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)

const hasControlChars = (value) => {
    for (let i = 0; i < value.length; i += 1) {
        if (isControlChar(value.charCodeAt(i))) return true
    }
    return false
}

const stripControlChars = (value) => {
    let out = ''
    for (let i = 0; i < value.length; i += 1) {
        if (!isControlChar(value.charCodeAt(i))) out += value[i]
    }
    return out
}

// Windows reserved device names — a file called `CON` or `LPT1.txt` is
// unopenable on Windows and breaks archive extraction there.
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

// Validate a name supplied for an item on write. Returns the trimmed name.
const validateItemName = (raw, label = 'name') => {
    if (typeof raw !== 'string') throw badRequest(`${label} is required`)

    const name = raw.trim()

    if (!name) throw badRequest(`${label} cannot be empty`)
    if (name.length > MAX_NAME_LENGTH) {
        throw badRequest(`${label} cannot be longer than ${MAX_NAME_LENGTH} characters`)
    }
    if (hasControlChars(name)) {
        throw badRequest(`${label} cannot contain control characters`)
    }
    // Path separators and traversal segments are the Zip Slip primitive.
    if (name.includes('/') || name.includes('\\')) {
        throw badRequest(`${label} cannot contain path separators`)
    }
    if (name === '.' || name === '..') {
        throw badRequest(`${label} is not a valid name`)
    }
    if (RESERVED_NAMES.test(name)) {
        throw badRequest(`${label} uses a reserved system name`)
    }

    return name
}

// Coerce any stored name into something safe to use as a single path segment
// inside an archive. Used at zip-build time so rows written before the
// validation above — or by any future code path that skips it — still cannot
// escape the archive root.
const sanitizePathSegment = (raw) => {
    let name = stripControlChars(String(raw ?? ''))

    name = name.replace(/^[a-zA-Z]:/, '')   // drive letter
    name = name.replace(/[/\\]+/g, '_')     // separators, incl. any `../` chain
    name = name.trim()

    if (/^\.+$/.test(name)) name = ''       // `.` / `..` as a whole segment
    if (RESERVED_NAMES.test(name)) name = `_${name}`
    if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH)

    return name || 'unnamed'
}

module.exports = {
    MAX_NAME_LENGTH,
    validateItemName,
    sanitizePathSegment
}
