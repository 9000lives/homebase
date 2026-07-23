// ============================================================
//  src/components/FileTile.jsx
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { FolderIcon, FileIcon, KebabIcon, PencilIcon, TrashIcon, ShareIcon } from './Icons';

/**
 * @param {object} item - { _id, name, type: 'folder' | 'file' }
 * @param {Function} onClick - called with `item` when the tile is activated
 * @param {Function} onRename - called with `item` when "Rename" is chosen
 * @param {Function} onDelete - called with `item` when "Delete" is chosen
 * @param {Function} [onShare] - called with `item` when "Share" is chosen (folders only)
 * @param {boolean} [readOnly] - when true, hides the kebab menu (rename/delete/share) entirely —
 *                                used for items shared with the current user, which they don't own
 */
const FileTile = ({ item, onClick, onRename, onDelete, onShare, readOnly = false }) => {
  const isFolder = item.type === 'folder';
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

  return (
    <div className="file-tile-wrap" ref={wrapRef}>
      <button
        type="button"
        className="file-tile"
        onClick={() => onClick(item)}
        title={item.name}
      >
        <span className="file-tile__icon">
          {isFolder ? <FolderIcon /> : <FileIcon />}
        </span>
        <span className="file-tile__name">{item.name}</span>
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
