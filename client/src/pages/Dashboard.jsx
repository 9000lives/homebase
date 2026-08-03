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
  searchDirectory,
} from '../services/filesApi';
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import FileTile from '../components/FileTile';
import LoadingDots from '../components/LoadingDots';
import NewItemModal from '../components/NewItemModal';
import RenameModal from '../components/RenameModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PreviewModal from '../components/PreviewModal';
import ShareModal from '../components/ShareModal';
import { downloadBlob } from '../utils/downloadBlob';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
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
  useDocumentTitle('Your files');
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
  // The list endpoints are server-bounded (200 default, 500 max), so `items`
  // can be a truncated view of the folder. This is the real count, from
  // X-Total-Count, and drives the notice under the grid.
  const [itemsTotal, setItemsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Files other users have shared with the logged-in user — shown in their
  // own "Shared files" section, separate from the current folder's contents.
  const [sharedItems, setSharedItems] = useState([]);

  // ── Search ──────────────────────────────────────────────
  // `query` tracks the raw input; `debouncedQuery` lags 500ms behind (or jumps
  // ahead instantly on Enter) and is what actually drives the search request.
  // `searchResults` holds the personal-tree matches from the backend; the shared
  // section is filtered client-side from the already-loaded `sharedItems`.
  const [query, setQuery] = useState('');
  const [debouncedQuery, flushQuery] = useDebouncedValue(query, 500);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

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
      const { items: data, total } = await fetchDirectoryContents(ownerId, parentFolderId);
      setItems(sortItems(data));
      setItemsTotal(total);
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

  // ── Search ──────────────────────────────────────────────
  // Run the personal-tree search whenever the debounced query settles. The
  // `cancelled` flag drops out-of-order responses when typing quickly.
  useEffect(() => {
    const term = debouncedQuery.trim();
    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchDirectory(term)
      .then(({ items: results }) => { if (!cancelled) setSearchResults(sortItems(results)); })
      .catch((err) => { if (!cancelled) console.error('Search failed', err); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleSearchSubmit = () => flushQuery(query);   // Enter → search now

  // flushQuery('') rather than relying on the debounce: clearing must take
  // effect at once, and it also cancels a pending timer that would otherwise
  // land afterwards and re-populate the search from the old term.
  const clearSearch = useCallback(() => {
    setQuery('');
    flushQuery('');
    setSearchResults([]);
  }, [flushQuery]);

  // ── Navigation ──────────────────────────────────────────

  // The three tile handlers and the download are useCallback'd so React.memo on
  // FileTile actually holds — a fresh closure each render would defeat it and
  // the whole grid would re-render on every keystroke in the search box.
  const handleTileClick = useCallback((item) => {
    if (item.type !== 'folder') {
      setPreviewTarget(item);
      return;
    }
    setBreadcrumbs((prev) => [...prev, { id: item._id, name: item.name }]);
    setCurrentFolderId(item._id);
  }, []);

  // Entry point for a personal search result — the match may live in a folder
  // other than the one currently open, so we can't reuse handleTileClick (which
  // would append to the current breadcrumb trail). Instead we rebuild the trail
  // from the result's own ancestor `path`, then clear the search to reveal the
  // folder. Files just open in the preview, wherever they live.
  const handleSearchResultClick = useCallback((item) => {
    if (item.type === 'folder') {
      const trail = (item.path || []).map((p) => ({ id: p._id, name: p.name }));
      setBreadcrumbs([...trail, { id: item._id, name: item.name }]);
      setCurrentFolderId(item._id);
      setMode('own');
      clearSearch();
    } else {
      setPreviewTarget(item);
    }
  }, [clearSearch]);

  // Entry point for the "Shared files" section only — drilling deeper once
  // inside a shared folder reuses handleTileClick unchanged, since it never
  // touches `mode`, so `mode` correctly stays 'shared' through any depth.
  const handleSharedTileClick = useCallback((item) => {
    if (item.type === 'folder') {
      setMode('shared');
      setBreadcrumbs((prev) => [...prev, { id: item._id, name: item.name }]);
      setCurrentFolderId(item._id);
    } else {
      setPreviewTarget(item);
    }
  }, []);

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

  const handleDownloadFolder = useCallback(async (item) => {
    setDownloadingId(item._id);
    try {
      const blob = await fetchFolderForDownload(item._id);
      downloadBlob(blob, `${item.name}.zip`);
    } catch (err) {
      setError(err.message ?? 'Could not download folder.');
    } finally {
      setDownloadingId(null);
    }
  }, []);

  // ── Header actions ──────────────────────────────────────

  const handleSettings = () => {
    navigate('/settings');   // ✏️  build this route when ready
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // ── Render ──────────────────────────────────────────────

  // Search is a personal-tree feature, only active in 'own' mode with a term.
  const isSearching = mode === 'own' && debouncedQuery.trim() !== '';
  // Personal grid shows backend search matches while searching, else the folder.
  const personalList = isSearching ? searchResults : items;
  // Shared grid filters the already-loaded shared list client-side while searching.
  const sharedList = isSearching
    ? sharedItems.filter((it) =>
        it.name.toLowerCase().includes(debouncedQuery.trim().toLowerCase()))
    : sharedItems;

  return (
    <div className="dashboard">
      <Header
        onNewItem={() => setModalOpen(true)}
        onSettings={handleSettings}
        onLogout={handleLogout}
        showNewButton={mode === 'own'}
      />

      <main className="dashboard-main">
        {/* The visual design names this page through the logo and breadcrumbs,
            neither of which is a heading — so the document would otherwise have
            no h1 at all. Settings and Admin carry visible ones. */}
        <h1 className="sr-only">Your files</h1>

        {/* ── Search ── */}
        {mode === 'own' && (
          <SearchBar
            value={query}
            onChange={setQuery}
            onClear={clearSearch}
            onSubmit={handleSearchSubmit}
          />
        )}

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
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>

        {/* ── Content ── */}
        {(loading && !isSearching) || (isSearching && searching) ? (
          <LoadingDots />
        ) : personalList.length === 0 ? (
          <div className="dashboard-empty">
            <p>{isSearching ? 'No matching files or folders.' : 'This folder is empty.'}</p>
            {!isSearching && mode === 'own' && (
              <p className="dashboard-empty__sub">Use "+ New" above to add a file or folder.</p>
            )}
          </div>
        ) : (
          <div className="file-grid">
            {personalList.map((item) => (
              <FileTile
                key={item._id}
                item={item}
                onClick={isSearching ? handleSearchResultClick : handleTileClick}
                onRename={setRenameTarget}
                onDelete={setDeleteTarget}
                onShare={setShareTarget}
                onDownload={handleDownloadFolder}
                downloading={downloadingId === item._id}
                readOnly={mode === 'shared' || isSearching}
              />
            ))}
          </div>
        )}

        {/* Only while browsing — a search returns its own bounded result set,
            and reporting the folder's total against it would be nonsense. */}
        {!isSearching && itemsTotal > items.length && (
          <p className="dashboard-truncated">
            Showing {items.length} of {itemsTotal} items in this folder.
          </p>
        )}

        {mode === 'own' && sharedList.length > 0 && (
          <>
            <div className="section-divider"><span>Shared files</span></div>
            <div className="file-grid">
              {sharedList.map((item) => (
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
