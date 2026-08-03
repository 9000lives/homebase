// ============================================================
//  src/services/filesApi.js
//  REST API connection layer for the file explorer.
//
//  Folders and files are separate resources on your backend:
//    - GET  /api/folders   and  GET  /api/files
//      both take ownerId + parentFolderId as query params
//    - POST /api/folders   takes JSON { name, parentFolderId }
//    - POST /api/files     takes a multipart upload (Multer) —
//      the server derives owner, name, size, mimeType, and
//      storagePath from the uploaded file + auth token; the
//      client only needs to send the file itself + parentFolderId
//
//  The API origin, the fetch wrapper and the header builders all live in
//  services/apiClient.js — configure the origin there (VITE_API_URL).
// ============================================================

import {
  FILES_API_URL,
  FOLDERS_API_URL,
  apiFetch,
  apiFetchList,
  authHeaders,
  uploadHeaders,
  fetchBlob,
} from './apiClient';

/**
 * Folders and files are separate resources server-side, but the UI treats them
 * as one list. Both the directory load and the search do the same thing:
 * request the pair in parallel, tag each item with its `type`, concatenate.
 *
 * Totals are summed across the two, because "showing 200 of 412" has to count
 * folders and files together — that's the single list the user is looking at.
 *
 * @param   {Promise<{items: Array, total: number}>} foldersPromise
 * @param   {Promise<{items: Array, total: number}>} filesPromise
 * @returns {Promise<{items: Array, total: number}>}
 */
const mergeTagged = async (foldersPromise, filesPromise) => {
  const [folders, files] = await Promise.all([foldersPromise, filesPromise]);
  return {
    items: [
      ...folders.items.map((f) => ({ ...f, type: 'folder' })),
      ...files.items.map((f) => ({ ...f, type: 'file' })),
    ],
    total: folders.total + files.total,
  };
};

// ── ✏️  LIST FOLDERS in a directory ─────────────────────────
/**
 * GET /api/folders?ownerId=<id>&parentFolderId=<id|omitted for root>
 * Expects an array of folder objects back, e.g. { _id, name, ownerId, parentFolderId }
 */
export const fetchFolders = (ownerId, parentFolderId = null) => {
  const params = new URLSearchParams({ ownerId });
  if (parentFolderId) params.append('parentFolderId', parentFolderId);
  return apiFetchList(`${FOLDERS_API_URL}?${params.toString()}`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });
};

// ── ✏️  LIST FILES in a directory ───────────────────────────
/**
 * GET /api/files?ownerId=<id>&parentFolderId=<id|omitted for root>
 * Expects an array of file objects back, e.g. { _id, name, size, mimeType, ownerId, parentFolderId }
 */
export const fetchFiles = (ownerId, parentFolderId = null) => {
  const params = new URLSearchParams({ ownerId });
  if (parentFolderId) params.append('parentFolderId', parentFolderId);
  return apiFetchList(`${FILES_API_URL}?${params.toString()}`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });
};

// ── Combined directory load ─────────────────────────────────
/**
 * Fetches folders and files in parallel for the given directory,
 * then tags each item with a `type` field ('folder' | 'file') so
 * the rest of the app can treat them as one unified list — even
 * though your backend keeps them as separate resources.
 */
export const fetchDirectoryContents = (ownerId, parentFolderId = null) =>
  mergeTagged(
    fetchFolders(ownerId, parentFolderId),
    fetchFiles(ownerId, parentFolderId),
  );

// ── SEARCH (whole tree, own items only) ─────────────────────
/**
 * GET /api/files/search?q=<term> — the user's own files matching the term
 * anywhere in their tree. Each result carries a `path` array ([{ _id, name }, ...])
 * of its folder's ancestors so the UI can show where the match lives.
 */
export const searchFiles = (query) =>
  apiFetchList(`${FILES_API_URL}/search?q=${encodeURIComponent(query)}`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });

/**
 * GET /api/folders/search?q=<term> — the user's own folders matching the term.
 * `path` here is the matched folder's ancestors, excluding itself.
 */
export const searchFolders = (query) =>
  apiFetchList(`${FOLDERS_API_URL}/search?q=${encodeURIComponent(query)}`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });

/**
 * Runs both searches in parallel and tags each result with a `type`
 * ('folder' | 'file'), mirroring fetchDirectoryContents. Results already
 * carry `path` from the server.
 */
export const searchDirectory = (query) =>
  mergeTagged(searchFolders(query), searchFiles(query));

// ── ✏️  CREATE A FOLDER ──────────────────────────────────────
/**
 * POST /api/folders
 * Sends:   { name, parentFolderId }   (owner comes from the auth token server-side)
 * Expects: the created folder object back
 */
export const createFolder = (name, parentFolderId = null) =>
  apiFetch(`${FOLDERS_API_URL}/create`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ name, parentFolderId }),
  });

// ── ✏️  UPLOAD A FILE ────────────────────────────────────────
/**
 * POST /api/files   (multipart/form-data — handled by Multer)
 *
 * Sends:
 *   - the raw File object under the form field "file"
 *     ✏️  change 'file' below if your Multer field name differs,
 *         e.g. upload.single('document') would need 'document'
 *   - parentFolderId as a plain form field
 *
 * The server derives owner, name, size, mimeType, and storagePath
 * from the upload itself + the auth token — nothing else to send.
 *
 * Expects: the created file object back
 */
export const uploadFile = (file, parentFolderId = null) => {
  const formData = new FormData();
  formData.append('file', file);
  if (parentFolderId) formData.append('parentFolderId', parentFolderId);

  return apiFetch(`${FILES_API_URL}/upload`, {
    method:  'POST',
    headers: uploadHeaders(),
    body:    formData,
  });
};

// ── RENAME ───────────────────────────────────────────────────
export const renameFolder = (id, name) =>
  apiFetch(`${FOLDERS_API_URL}/${id}/rename`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    JSON.stringify({ name }),
  });

export const renameFile = (id, name) =>
  apiFetch(`${FILES_API_URL}/${id}/rename`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    JSON.stringify({ name }),
  });

// ── DELETE ───────────────────────────────────────────────────
export const deleteFolder = (id) =>
  apiFetch(`${FOLDERS_API_URL}/${id}/delete`, {
    method:  'DELETE',
    headers: authHeaders({ json: false }),
  });

export const deleteFile = (id) =>
  apiFetch(`${FILES_API_URL}/${id}/delete`, {
    method:  'DELETE',
    headers: authHeaders({ json: false }),
  });

// ── SHARING ──────────────────────────────────────────────────
export const shareFile = (fileId, userId) =>
  apiFetch(`${FILES_API_URL}/${fileId}/share`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    JSON.stringify({ userId }),
  });

export const unshareFile = (fileId, userId) =>
  apiFetch(`${FILES_API_URL}/${fileId}/unshare`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    JSON.stringify({ userId }),
  });

// GET /api/files/shared — files other users have shared with the logged in user
export const fetchSharedFiles = () =>
  apiFetch(`${FILES_API_URL}/shared`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });

export const shareFolder = (folderId, userId) =>
  apiFetch(`${FOLDERS_API_URL}/${folderId}/share`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    JSON.stringify({ userId }),
  });

export const unshareFolder = (folderId, userId) =>
  apiFetch(`${FOLDERS_API_URL}/${folderId}/unshare`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    JSON.stringify({ userId }),
  });

// GET /api/folders/shared — folders other users have shared with the logged in user
export const fetchSharedFolders = () =>
  apiFetch(`${FOLDERS_API_URL}/shared`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });

// ── PREVIEW / DOWNLOAD ──────────────────────────────────────
// Auth is header-based, so a plain <img>/<iframe>/<a> src can't include the
// token — the bytes are fetched as a Blob and the caller gets an object URL
// (via URL.createObjectURL) to use as the src/href instead. fetchBlob now lives
// in apiClient.js; the reason it must never take a token in the URL is
// documented there.

// GET /api/files/:id/view — inline-served bytes, correct Content-Type, no forced download
export const fetchFilePreview = (id) => fetchBlob(`${FILES_API_URL}/${id}/view`);

// GET /api/files/:id/download — same bytes, but the server sends Content-Disposition: attachment
export const fetchFileForDownload = (id) => fetchBlob(`${FILES_API_URL}/${id}/download`);

// GET /api/folders/:id/download — a zip of the folder and all its nested contents
export const fetchFolderForDownload = (id) => fetchBlob(`${FOLDERS_API_URL}/${id}/download`);
