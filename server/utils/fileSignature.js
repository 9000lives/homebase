// Content-based file type detection.
//
// Multer's `file.mimetype` is taken verbatim from the Content-Type header of
// the multipart part — it is chosen by the client and never compared against
// the bytes. So was the stored extension, which came from the client's
// filename. Declared type, extension, and actual content could disagree in any
// combination, which is how an executable got stored and served as an "image".
//
// This module inspects the leading bytes and reports what the file actually
// is, so the upload pipeline can require all three to agree.
//
// Written in-repo rather than pulled from a dependency because the allow-list
// is eight types long and the signatures are stable; a local implementation is
// auditable in one screen and adds no supply-chain surface.

// How many bytes to read from the front of the file. Every signature below
// fits comfortably; MP3 needs headroom to skip an ID3 tag.
const SAMPLE_BYTES = 4096

const startsWith = (buf, bytes, offset = 0) => {
    if (buf.length < offset + bytes.length) return false
    for (let i = 0; i < bytes.length; i += 1) {
        if (buf[offset + i] !== bytes[i]) return false
    }
    return true
}

const ascii = (str) => [...str].map((c) => c.charCodeAt(0))

// MPEG audio frame sync: 11 set bits. Covers MPEG-1/2/2.5 Layer I-III.
const isMpegFrameSync = (buf, offset) =>
    buf.length > offset + 1 && buf[offset] === 0xff && (buf[offset + 1] & 0xe0) === 0xe0

const looksLikeMp3 = (buf) => {
    if (startsWith(buf, ascii('ID3'))) return true      // ID3v2 tagged
    return isMpegFrameSync(buf, 0)                      // bare frame
}

// Heuristic for text/plain, which has no signature by definition. Require the
// sample to decode as UTF-8 and contain no NUL or stray control bytes — enough
// to reject a binary payload declared as text.
const looksLikeText = (buf) => {
    if (buf.length === 0) return true

    const decoded = new TextDecoder('utf-8', { fatal: true })
    try {
        decoded.decode(buf)
    } catch {
        return false
    }

    for (const byte of buf) {
        if (byte === 0x00) return false
        // Allow tab (09), LF (0A), FF (0C), CR (0D), ESC (1B).
        if (byte < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d, 0x1b].includes(byte)) return false
    }
    return true
}

// Signatures that must never be accepted, whatever the file claims to be.
//
// These are checked BEFORE anything else because text/plain has no signature of
// its own and is therefore matched by a heuristic. A Windows PE that happens to
// contain only printable bytes and tabs near its start would otherwise satisfy
// looksLikeText and be stored as a .txt — which a recipient could rename and
// run. Executables and markup are rejected outright rather than being allowed
// to fall through to the text branch.
const DANGEROUS_SIGNATURES = [
    { label: 'dos/windows executable', test: (b) => startsWith(b, ascii('MZ')) },
    { label: 'elf executable', test: (b) => startsWith(b, [0x7f, 0x45, 0x4c, 0x46]) },
    { label: 'mach-o executable', test: (b) =>
        startsWith(b, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(b, [0xfe, 0xed, 0xfa, 0xcf]) ||
        startsWith(b, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(b, [0xce, 0xfa, 0xed, 0xfe]) ||
        startsWith(b, [0xca, 0xfe, 0xba, 0xbe]) },
    { label: 'java class', test: (b) => startsWith(b, [0xca, 0xfe, 0xba, 0xbe]) },
    { label: 'script shebang', test: (b) => startsWith(b, ascii('#!')) },
    // HTML and SVG are the stored-XSS vectors. Neither is on the allow-list, but
    // both are valid UTF-8 text, so without this they would be accepted as
    // text/plain and then served back — inert only because of nosniff and the
    // sandboxing CSP. Reject at the door instead of relying on those alone.
    {
        label: 'markup',
        test: (b) => {
            const head = b.subarray(0, 512).toString('utf8').trimStart().toLowerCase()
            return head.startsWith('<!doctype html') ||
                head.startsWith('<html') ||
                head.startsWith('<svg') ||
                head.startsWith('<?xml') ||
                head.startsWith('<script')
        }
    }
]

const matchDangerous = (buffer) => DANGEROUS_SIGNATURES.find((s) => s.test(buffer)) || null

// Ordered: the first match wins, so specific signatures precede the text
// fallback. `mime` is the canonical type; `ext` is the extension the file will
// be stored under, replacing whatever the client's filename claimed.
const SIGNATURES = [
    { mime: 'image/jpeg', ext: '.jpg', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
    { mime: 'image/png', ext: '.png', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { mime: 'image/gif', ext: '.gif', test: (b) => startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a')) },
    { mime: 'application/pdf', ext: '.pdf', test: (b) => startsWith(b, ascii('%PDF-')) },
    { mime: 'audio/mpeg', ext: '.mp3', test: looksLikeMp3 },

    // Legacy .doc is an OLE2 compound document.
    { mime: 'application/msword', ext: '.doc', test: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },

    // .docx is a ZIP container. The ZIP signature alone cannot distinguish it
    // from any other zip, so this accepts the declared type when the container
    // is genuinely a zip — see the note in the module docs above.
    {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: '.docx',
        test: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])
    },

    { mime: 'text/plain', ext: '.txt', test: looksLikeText }
]

// Every type this application accepts. The upload filter and this map are the
// same list, so they cannot drift.
const ALLOWED_TYPES = new Map(SIGNATURES.map((s) => [s.mime, s]))

// Returns { mime, ext } for the first signature the sample matches, or null if
// the content is unrecognised or matches a dangerous signature.
const detectType = (buffer) => {
    if (matchDangerous(buffer)) return null

    for (const signature of SIGNATURES) {
        if (signature.test(buffer)) return { mime: signature.mime, ext: signature.ext }
    }
    return null
}

module.exports = { SAMPLE_BYTES, ALLOWED_TYPES, DANGEROUS_SIGNATURES, matchDangerous, detectType }
