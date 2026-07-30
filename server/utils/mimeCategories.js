// Friendly file-type groupings for the admin dashboard's storage breakdown.
//
// This is the single source of truth for the mapping. The API returns
// { key, label, bytes } so the client never maps a MIME string to a category —
// client/src/utils/fileType.js keeps its own separate map because it does a
// different job (picking a per-file icon) and must not learn about these groups.
//
// The ORDER here is the donut's colour slot order. Colour binds to `key` in
// client/src/styles/admin.css, never to an array index, so a category dropping
// to 0 bytes can't repaint its neighbours.
//
// Keep `mimeTypes` in sync with the upload whitelist in
// server/middleware/uploadMiddleware.js — anything not listed here lands in 'other'.
const CATEGORIES = [
    { key: 'images', label: 'Images', mimeTypes: ['image/jpeg', 'image/png', 'image/gif'] },
    { key: 'pdfs', label: 'PDFs', mimeTypes: ['application/pdf'] },
    {
        key: 'documents',
        label: 'Documents',
        mimeTypes: [
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
    },
    { key: 'audio', label: 'Audio', mimeTypes: ['audio/mpeg'] },
    { key: 'text', label: 'Text', mimeTypes: ['text/plain'] },
    { key: 'other', label: 'Other', mimeTypes: [] } // catch-all, always last
]

// $switch branches for the storage aggregation. 'other' is the pipeline's
// `default`, so it never gets a branch of its own — and a file with no
// mimeType at all matches nothing and falls through to it.
const categoryBranches = () =>
    CATEGORIES
        .filter((c) => c.mimeTypes.length > 0)
        .map((c) => ({ case: { $in: ['$mimeType', c.mimeTypes] }, then: c.key }))

module.exports = { CATEGORIES, categoryBranches }
