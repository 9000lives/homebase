// ============================================================
//  src/utils/downloadBlob.js
//  Saves an already-fetched Blob to disk under a chosen filename.
//
//  Bytes arrive as a Blob rather than a plain <a href> because auth is
//  header-based — see the comment above fetchBlob in services/filesApi.js.
//  A credential must never appear in a URL.
// ============================================================

/**
 * @param {Blob}   blob     - the bytes to save
 * @param {string} filename - the name to save them under
 */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Appended before clicking, and revoked on a later task rather than inline.
  // A detached anchor doesn't reliably start a download in Firefox, and
  // revoking in the same synchronous block races the download it just began —
  // Chrome tolerates both, Firefox and Safari abort.
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 0);
};
