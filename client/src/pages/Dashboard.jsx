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
} from '../services/filesApi';
import Header from '../components/Header';
import FileTile from '../components/FileTile';
import NewItemModal from '../components/NewItemModal';
import RenameModal from '../components/RenameModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PreviewModal from '../components/PreviewModal';
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

  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [creating,  setCreating]  = useState(false);

  const [renameTarget, setRenameTarget]   = useState(null);   // item being renamed, or null
  const [deleteTarget, setDeleteTarget]   = useState(null);   // item pending delete confirm, or null
  const [previewTarget, setPreviewTarget] = useState(null);   // file being previewed, or null
  const [actionLoading, setActionLoading] = useState(false);

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

  // ── Navigation ──────────────────────────────────────────

  const handleTileClick = (item) => {
    if (item.type !== 'folder') {
      setPreviewTarget(item);
      return;
    }
    setBreadcrumbs((prev) => [...prev, { id: item._id, name: item.name }]);
    setCurrentFolderId(item._id);
  };

  const handleBreadcrumbClick = (index) => {
    // index === -1 means "Home" (root)
    if (index === -1) {
      setBreadcrumbs([]);
      setCurrentFolderId(null);
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
            <p className="dashboard-empty__sub">Use "+ New" above to add a file or folder.</p>
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
              />
            ))}
          </div>
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
        <PreviewModal item={previewTarget} onClose={() => setPreviewTarget(null)} />
      )}
    </div>
  );
};

export default Dashboard;
