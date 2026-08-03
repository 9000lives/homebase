// ============================================================
//  src/components/FileTile.jsx
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { FolderIcon, FileIcon, KebabIcon, PencilIcon, TrashIcon, ShareIcon, DownloadIcon } from './Icons';
import { getFileKind } from '../utils/fileType';

/**
 * @param {object} item - { _id, name, type: 'folder' | 'file' }
 * @param {Function} onClick - called with `item` when the tile is activated
 * @param {Function} onRename - called with `item` when "Rename" is chosen
 * @param {Function} onDelete - called with `item` when "Delete" is chosen
 * @param {Function} [onShare] - called with `item` when "Share" is chosen (folders only)
 * @param {Function} [onDownload] - called with `item` when "Download" is chosen (folders only)
 * @param {boolean} [downloading] - true while this folder's zip is being generated
 * @param {boolean} [readOnly] - when true, hides the kebab menu (rename/delete/share) entirely —
 *                                used for items shared with the current user, which they don't own
 */
const FileTile = ({ item, onClick, onRename, onDelete, onShare, onDownload, downloading = false, readOnly = false }) => {
  const isFolder = item.type === 'folder';
  const kind = isFolder ? null : getFileKind(item.mimeType);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    // focusout as well as mousedown: pointer users click away, keyboard users
    // Tab away, and only handling the former left the menu open behind them.
    const closeOnFocusLeaving = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.relatedTarget)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    wrapRef.current?.addEventListener('focusout', closeOnFocusLeaving);
    const wrap = wrapRef.current;
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      wrap?.removeEventListener('focusout', closeOnFocusLeaving);
    };
  }, [menuOpen]);

  // Move into the menu on open so a keyboard user lands on Rename rather than
  // having to Tab past the tile to reach it.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector('button')?.focus();
  }, [menuOpen]);

  // Escape closes and hands focus back to the trigger, so the tab position
  // isn't lost to the top of the document.
  const handleMenuKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setMenuOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Auto-close the menu once a download finishes, since the Download item stays
  // open (showing "Zipping…") instead of closing immediately like the other actions.
  const wasDownloading = useRef(downloading);
  useEffect(() => {
    if (wasDownloading.current && !downloading) {
      setMenuOpen(false);
    }
    wasDownloading.current = downloading;
  }, [downloading]);

  return (
    <div className="file-tile-wrap" ref={wrapRef}>
      <button
        type="button"
        className="file-tile"
        onClick={() => onClick(item)}
        title={item.name}
      >
        <span className="file-tile__icon">
          {isFolder ? <FolderIcon /> : <FileIcon kind={kind} />}
        </span>
        {/* The icon carries folder-vs-file visually, but it's decorative to a
            screen reader — without this, a folder and a file of the same name
            are announced identically. */}
        <span className="sr-only">{isFolder ? 'Folder: ' : 'File: '}</span>
        <span className="file-tile__name">{item.name}</span>
        {/* Search results always carry a `path` array (folder ancestors, empty at
            root) so every result shows where it lives — "Home" for root items,
            "Home / Folder / …" for nested ones. Normal browsing and shared tiles
            have no `path` field, so no location line renders for them. */}
        {Array.isArray(item.path) && (
          <span className="file-tile__path" title={['Home', ...item.path.map((p) => p.name)].join(' / ')}>
            {['Home', ...item.path.map((p) => p.name)].join(' / ')}
          </span>
        )}
      </button>

      {!readOnly && (
        <>
          <button
            type="button"
            ref={triggerRef}
            className="file-tile__menu-trigger"
            /* Named per item: a grid of 40 tiles otherwise announces
               "More actions, button" 40 times with nothing to tell them apart. */
            aria-label={`More actions for ${item.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            <KebabIcon />
          </button>

          {menuOpen && (
            <div
              className="file-tile__menu"
              ref={menuRef}
              onKeyDown={handleMenuKeyDown}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onRename(item);
                }}
              >
                <PencilIcon /> Rename
              </button>
              {item.type === 'folder' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onShare(item);
                  }}
                >
                  <ShareIcon /> Share
                </button>
              )}
              {item.type === 'folder' && (
                <button
                  type="button"
                  disabled={downloading}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(item);
                  }}
                >
                  <DownloadIcon /> {downloading ? 'Zipping…' : 'Download'}
                </button>
              )}
              <button
                type="button"
                className="file-tile__menu-item--danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(item);
                }}
              >
                <TrashIcon /> Delete
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Memoised because the dashboard renders up to 200 of these and `query` lives
// on the page — without this, every keystroke in the search box re-rendered the
// entire grid. Dashboard useCallbacks the handlers it passes down, which is
// what makes the memo actually hold.
export default React.memo(FileTile);
