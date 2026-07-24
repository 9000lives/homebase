// ============================================================
//  src/utils/fileType.js
//  Single source of truth for mimeType -> file "kind", used by
//  both FileTile (icon selection) and PreviewModal (preview
//  support + rendering).
// ============================================================

const MIME_TO_KIND = {
  'image/jpeg': 'image',
  'image/png':  'image',
  'image/gif':  'image',
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
  'audio/mpeg': 'audio',
};

export const getFileKind = (mimeType) => MIME_TO_KIND[mimeType] ?? 'generic';
