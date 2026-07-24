// ============================================================
//  src/pages/Dashboard.jsx
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchDirectoryContents,
  createFolder,
  uploadFile,
  renameFile,
  renameFolder,
  deleteFile,
  deleteFolder,
  fetchSharedFiles,
  fetchSharedFolders,
  fetchFolderForDownload,
} from '../services/filesApi';
import Header from '../components/Header';
import FileTile from '../components/FileTile';
import NewItemModal from '../components/NewItemModal';
import RenameModal from '../components/RenameModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PreviewModal from '../components/PreviewModal';
import ShareModal from '../components/ShareModal';
import '../styles/dashboard.css';

/**
 * Sorts an array of file/folder items: folders first (alphabetically),
 * then files (alphabetically). Backend sort order isn't relied on —
 * this guarantees consistent display regardless of API response order.
 */
const sortItems = (items) =>
  [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

const Dashboard = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const ownerId = user?.id;   // ✏️  comes from your /me response, mapped in AuthContext

  // currentFolderId === null means we're viewing the root directory
  const [currentFolderId, setCurrentFolderId] = useState(null);
  // Breadcrumb trail: [{ id, name }, ...]  — empty array = at root
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  // 'own' = browsing the logged-in user's own tree; 'shared' = browsing inside
  // a folder someone else shared with them (read-only), entered via the
  // "Shared files" section and reset to 'own' only by the Home breadcrumb.
  const [mode, setMode] = useState('own');

  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Files other users have shared with the logged-in user — shown in their
  // own "Shared files" section, separate from the current folder's contents.
  const [sharedItems, setSharedItems] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [creating,  setCreating]  = useState(false);

  const [renameTarget, setRenameTarget]   = useState(null);   // item being renamed, or null
  const [deleteTarget, setDeleteTarget]   = useState(null);   // item pending delete confirm, or null
  const [previewTarget, setPreviewTarget] = useState(null);   // file being previewed, or null
  const [shareTarget, setShareTarget]     = useState(null);   // item being shared, or null
  const [actionLoading, setActionLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);   // id of the folder currently being zipped, or null

  // ── Load contents of the current folder ───────────────────
  const loadItems = useCallback(async (parentFolderId) => {
    if (!ownerId) return;   // wait until the user is loaded
    setLoading(true);
    setError('');
    try {
      // Fetches GET /api/folders and GET /api/files in parallel,
      // both scoped to ownerId + parentFolderId, then merges them.
      const data = await fetchDirectoryContents(ownerId, parentFolderId);
      setItems(sortItems(data));
    } catch (err) {
      setError(err.message ?? 'Could not load files. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  // Load root directory on mount, and reload whenever the folder
  // or the logged-in user changes (ownerId starts null until the
  // auth context finishes verifying the stored token).
  useEffect(() => {
    loadItems(currentFolderId);
  }, [currentFolderId, ownerId, loadItems]);

  // ── Load files/folders shared with the logged in user ──────
  // Not folder-scoped (this is the flat "Shared files" section, not the
  // current folder's contents), so this only depends on ownerId, not
  // currentFolderId. Shared folders render as real folder tiles here — their
  // own contents are only fetched once you navigate into one (see `mode`).
  const loadSharedItems = useCallback(async () => {
    if (!ownerId) return;
    try {
      const [sharedFolders, sharedFiles] = await Promise.all([
        fetchSharedFolders(),
        fetchSharedFiles(),
      ]);
      const combined = [
        ...sharedFolders.map((f) => ({ ...f, type: 'folder', readOnly: true })),
        ...sharedFiles.map((f) => ({ ...f, type: 'file', readOnly: true })),
      ];
      setSharedItems(sortItems(combined));
    } catch (err) {
      // Secondary section — don't clobber the main error banner over this.
      console.error('Could not load shared items', err);
    }
  }, [ownerId]);

  useEffect(() => {
    loadSharedItems();
  }, [ownerId, loadSharedItems]);

  // ── Navigation ──────────────────────────────────────────

  const handleTileClick = (item) => {
    if (item.type !== 'folder') {
      setPreviewTarget(item);
      return;
    }
    setBreadcrumbs((prev) => [...prev, { id: item._id, name: item.name }]);
    setCurrentFolderId(item._id);
  };

  // Entry point for the "Shared files" section only — drilling deeper once
  // inside a shared folder reuses handleTileClick unchanged, since it never
  // touches `mode`, so `mode` correctly stays 'shared' through any depth.
  const handleSharedTileClick = (item) => {
    if (item.type === 'folder') {
      setMode('shared');
      setBreadcrumbs((prev) => [...prev, { id: item._id, name: item.name }]);
      setCurrentFolderId(item._id);
    } else {
      setPreviewTarget(item);
    }
  };

  const handleBreadcrumbClick = (index) => {
    // index === -1 means "Home" (root) — always exits back to the user's own tree
    if (index === -1) {
      setBreadcrumbs([]);
      setCurrentFolderId(null);
      setMode('own');
      return;
    }
    const target = breadcrumbs[index];
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    setCurrentFolderId(target.id);
  };

  // ── New item creation ──────────────────────────────────

  const handleCreateFolder = async (name) => {
    setCreating(true);
    try {
      // POST /api/folders  { name, parentFolderId }
      await createFolder(name, currentFolderId);
      setModalOpen(false);
      await loadItems(currentFolderId);   // refresh the tile grid
    } catch (err) {
      setError(err.message ?? 'Could not create folder. Please try again.');
      setModalOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleUploadFile = async (file) => {
    setCreating(true);
    try {
      // POST /api/files  (multipart — file + parentFolderId)
      await uploadFile(file, currentFolderId);
      setModalOpen(false);
      await loadItems(currentFolderId);   // refresh the tile grid
    } catch (err) {
      setError(err.message ?? 'Could not upload file. Please try again.');
      setModalOpen(false);
    } finally {
      setCreating(false);
    }
  };

  // ── Rename / Delete ──────────────────────────────────────

  const handleRenameSubmit = async (newName) => {
    setActionLoading(true);
    try {
      if (renameTarget.type === 'folder') {
        await renameFolder(renameTarget._id, newName);
      } else {
        await renameFile(renameTarget._id, newName);
      }
      setRenameTarget(null);
      await loadItems(currentFolderId);   // refresh the tile grid
    } catch (err) {
      setError(err.message ?? 'Could not rename. Please try again.');
      setRenameTarget(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setActionLoading(true);
    try {
      if (deleteTarget.type === 'folder') {
        await deleteFolder(deleteTarget._id);
        // If the deleted folder is an ancestor of where we currently are,
        // our view is no longer valid — bounce back to root.
        if (breadcrumbs.some((crumb) => crumb.id === deleteTarget._id)) {
          setBreadcrumbs([]);
          setCurrentFolderId(null);
        }
      } else {
        await deleteFile(deleteTarget._id);
      }
      setDeleteTarget(null);
      await loadItems(currentFolderId);   // refresh the tile grid
    } catch (err) {
      setError(err.message ?? 'Could not delete. Please try again.');
      setDeleteTarget(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadFolder = async (item) => {
    setDownloadingId(item._id);
    try {
      const blob = await fetchFolderForDownload(item._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${item.name}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message ?? 'Could not download folder.');
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Header actions ──────────────────────────────────────

  const handleSettings = () => {
    navigate('/settings');   // ✏️  build this route when ready
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="dashboard">
      <Header
        onNewItem={() => setModalOpen(true)}
        onSettings={handleSettings}
        onLogout={handleLogout}
        showNewButton={mode === 'own'}
      />

      <main className="dashboard-main">

        {/* ── Breadcrumb trail ── */}
        <nav className="breadcrumbs" aria-label="Folder path">
          <button
            type="button"
            className="breadcrumbs__item"
            onClick={() => handleBreadcrumbClick(-1)}
          >
            Home
          </button>
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.id}>
              <span className="breadcrumbs__sep">/</span>
              <button
                type="button"
                className="breadcrumbs__item"
                onClick={() => handleBreadcrumbClick(i)}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* ── Error banner ── */}
        <div
          className={`dashboard-error${error ? ' dashboard-error--visible' : ''}`}
          role="alert"
          aria-live="polite"
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="dashboard-loading">
            <span className="auth-loading__dot" />
            <span className="auth-loading__dot" />
            <span className="auth-loading__dot" />
          </div>
        ) : items.length === 0 ? (
          <div className="dashboard-empty">
            <p>This folder is empty.</p>
            {mode === 'own' && (
              <p className="dashboard-empty__sub">Use "+ New" above to add a file or folder.</p>
            )}
          </div>
        ) : (
          <div className="file-grid">
            {items.map((item) => (
              <FileTile
                key={item._id}
                item={item}
                onClick={handleTileClick}
                onRename={setRenameTarget}
                onDelete={setDeleteTarget}
                onShare={setShareTarget}
                onDownload={handleDownloadFolder}
                downloading={downloadingId === item._id}
                readOnly={mode === 'shared'}
              />
            ))}
          </div>
        )}

        {mode === 'own' && sharedItems.length > 0 && (
          <>
            <div className="section-divider"><span>Shared files</span></div>
            <div className="file-grid">
              {sharedItems.map((item) => (
                <FileTile
                  key={item._id}
                  item={item}
                  onClick={handleSharedTileClick}
                  readOnly
                />
              ))}
            </div>
          </>
        )}

      </main>

      {modalOpen && (
        <NewItemModal
          onClose={() => setModalOpen(false)}
          onCreateFolder={handleCreateFolder}
          onUploadFile={handleUploadFile}
          loading={creating}
        />
      )}

      {renameTarget && (
        <RenameModal
          item={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSubmit={handleRenameSubmit}
          loading={actionLoading}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
          loading={actionLoading}
        />
      )}

      {previewTarget && (
        <PreviewModal
          item={previewTarget}
          onClose={() => setPreviewTarget(null)}
          readOnly={mode === 'shared' || !!previewTarget.readOnly}
          onShareChange={loadSharedItems}
        />
      )}

      {shareTarget && (
        <ShareModal
          item={shareTarget}
          onClose={() => setShareTarget(null)}
          onShareChange={loadSharedItems}
        />
      )}
    </div>
  );
};

export default Dashboard;
