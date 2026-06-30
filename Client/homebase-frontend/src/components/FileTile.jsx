// ============================================================
//  src/components/FileTile.jsx
// ============================================================

import React from 'react';
import { FolderIcon, FileIcon } from './Icons';

/**
 * @param {object} item - { _id, name, type: 'folder' | 'file' }
 * @param {Function} onClick - called with `item` when the tile is activated
 */
const FileTile = ({ item, onClick }) => {
  const isFolder = item.type === 'folder';

  return (
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
  );
};

export default FileTile;
