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

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [menuOpen]);

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
            className="file-tile__menu-trigger"
            aria-label="More actions"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            <KebabIcon />
          </button>

          {menuOpen && (
            <div className="file-tile__menu">
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

export default FileTile;
