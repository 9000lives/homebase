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
//  ✏️  SETUP: set the two base URLs below.
// ============================================================

import { getStoredToken } from './authApi';

// ── ✏️  CHANGE THESE to match your backend ──────────────────
const FILES_API_URL   = 'http://localhost:3000/api/files';
const FOLDERS_API_URL = 'http://localhost:3000/api/folders';
// ──────────────────────────────────────────────────────────

// Headers for normal JSON requests.
const buildJsonHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  const token = getStoredToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Headers for multipart/form-data uploads.
// IMPORTANT: do NOT set 'Content-Type' here — the browser sets it
// automatically (including the multipart boundary) when the body
// is a FormData instance. Setting it manually breaks the upload.
const buildUploadHeaders = () => {
  const headers = {};
  const token = getStoredToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw body;
  return body;
};

// ── ✏️  LIST FOLDERS in a directory ─────────────────────────
/**
 * GET /api/folders?ownerId=<id>&parentFolderId=<id|omitted for root>
 * Expects an array of folder objects back, e.g. { _id, name, ownerId, parentFolderId }
 */
export const fetchFolders = (ownerId, parentFolderId = null) => {
  const params = new URLSearchParams({ ownerId });
  if (parentFolderId) params.append('parentFolderId', parentFolderId);
  return apiFetch(`${FOLDERS_API_URL}?${params.toString()}`, {
    method:  'GET',
    headers: buildJsonHeaders(),
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
  return apiFetch(`${FILES_API_URL}?${params.toString()}`, {
    method:  'GET',
    headers: buildJsonHeaders(),
  });
};

// ── Combined directory load ─────────────────────────────────
/**
 * Fetches folders and files in parallel for the given directory,
 * then tags each item with a `type` field ('folder' | 'file') so
 * the rest of the app can treat them as one unified list — even
 * though your backend keeps them as separate resources.
 */
export const fetchDirectoryContents = async (ownerId, parentFolderId = null) => {
  const [folders, files] = await Promise.all([
    fetchFolders(ownerId, parentFolderId),
    fetchFiles(ownerId, parentFolderId),
  ]);

  const taggedFolders = folders.map((f) => ({ ...f, type: 'folder' }));
  const taggedFiles   = files.map((f) => ({ ...f, type: 'file' }));

  return [...taggedFolders, ...taggedFiles];
};

// ── ✏️  CREATE A FOLDER ──────────────────────────────────────
/**
 * POST /api/folders
 * Sends:   { name, parentFolderId }   (owner comes from the auth token server-side)
 * Expects: the created folder object back
 */
export const createFolder = (name, parentFolderId = null) =>
  apiFetch(`${FOLDERS_API_URL}/create`, {
    method:  'POST',
    headers: buildJsonHeaders(),
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
    headers: buildUploadHeaders(),
    body:    formData,
  });
};

// ── RENAME ───────────────────────────────────────────────────
export const renameFolder = (id, name) =>
  apiFetch(`${FOLDERS_API_URL}/${id}/rename`, {
    method:  'PATCH',
    headers: buildJsonHeaders(),
    body:    JSON.stringify({ name }),
  });

export const renameFile = (id, name) =>
  apiFetch(`${FILES_API_URL}/${id}/rename`, {
    method:  'PATCH',
    headers: buildJsonHeaders(),
    body:    JSON.stringify({ name }),
  });

// ── DELETE ───────────────────────────────────────────────────
export const deleteFolder = (id) =>
  apiFetch(`${FOLDERS_API_URL}/${id}/delete`, {
    method:  'DELETE',
    headers: buildJsonHeaders(),
  });

export const deleteFile = (id) =>
  apiFetch(`${FILES_API_URL}/${id}/delete`, {
    method:  'DELETE',
    headers: buildJsonHeaders(),
  });

// ── SHARING ──────────────────────────────────────────────────
export const shareFile = (fileId, userId) =>
  apiFetch(`${FILES_API_URL}/${fileId}/share`, {
    method:  'PATCH',
    headers: buildJsonHeaders(),
    body:    JSON.stringify({ userId }),
  });

export const unshareFile = (fileId, userId) =>
  apiFetch(`${FILES_API_URL}/${fileId}/unshare`, {
    method:  'PATCH',
    headers: buildJsonHeaders(),
    body:    JSON.stringify({ userId }),
  });

// GET /api/files/shared — files other users have shared with the logged in user
export const fetchSharedFiles = () =>
  apiFetch(`${FILES_API_URL}/shared`, {
    method:  'GET',
    headers: buildJsonHeaders(),
  });

export const shareFolder = (folderId, userId) =>
  apiFetch(`${FOLDERS_API_URL}/${folderId}/share`, {
    method:  'PATCH',
    headers: buildJsonHeaders(),
    body:    JSON.stringify({ userId }),
  });

export const unshareFolder = (folderId, userId) =>
  apiFetch(`${FOLDERS_API_URL}/${folderId}/unshare`, {
    method:  'PATCH',
    headers: buildJsonHeaders(),
    body:    JSON.stringify({ userId }),
  });

// GET /api/folders/shared — folders other users have shared with the logged in user
export const fetchSharedFolders = () =>
  apiFetch(`${FOLDERS_API_URL}/shared`, {
    method:  'GET',
    headers: buildJsonHeaders(),
  });

// ── PREVIEW / DOWNLOAD ──────────────────────────────────────
// Auth is header-based, so a plain <img>/<iframe>/<a> src can't include
// the token — fetch the file as a Blob instead and hand the caller an
// object URL (via URL.createObjectURL) to use as the src/href.
const fetchBlob = async (url) => {
  const response = await fetch(url, {
    method:  'GET',
    headers: buildJsonHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw body;
  }
  return response.blob();
};

// GET /api/files/:id/view — inline-served bytes, correct Content-Type, no forced download
export const fetchFilePreview = (id) => fetchBlob(`${FILES_API_URL}/${id}/view`);

// GET /api/files/:id/download — same bytes, but the server sends Content-Disposition: attachment
export const fetchFileForDownload = (id) => fetchBlob(`${FILES_API_URL}/${id}/download`);
