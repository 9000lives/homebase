// ============================================================
//  src/components/Icons.jsx
//  Inline SVG icons for the file explorer.
//  Add more file-type icons here later (e.g. ImageIcon, PdfIcon)
//  and branch on item.name's extension in FileTile.jsx.
// ============================================================

import React from 'react';

export const FolderIcon = () => (
  <svg viewBox="0 0 48 48" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M5 12.5C5 10.567 6.567 9 8.5 9H18.5L22 13H39.5C41.433 13 43 14.567 43 16.5V35.5C43 37.433 41.433 39 39.5 39H8.5C6.567 39 5 37.433 5 35.5V12.5Z"
      fill="#00a1db"
    />
    <path
      d="M5 17.5C5 16.119 6.119 15 7.5 15H40.5C41.881 15 43 16.119 43 17.5V35.5C43 37.433 41.433 39 39.5 39H8.5C6.567 39 5 37.433 5 35.5V17.5Z"
      fill="#33b5e3"
    />
  </svg>
);

export const FileIcon = () => (
  <svg viewBox="0 0 48 48" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M11 5.5C11 4.119 12.119 3 13.5 3H27L37 13V42.5C37 43.881 35.881 45 34.5 45H13.5C12.119 45 11 43.881 11 42.5V5.5Z"
      fill="#f3f4f6"
      stroke="#9ca3af"
      strokeWidth="1.5"
    />
    <path d="M27 3L37 13H29C27.895 13 27 12.105 27 11V3Z" fill="#d1d5db" />
    <text
      x="24"
      y="32"
      textAnchor="middle"
      fontFamily="Inter, sans-serif"
      fontSize="9"
      fontWeight="700"
      fill="#6b7280"
      letterSpacing="0.5"
    >
      TXT
    </text>
  </svg>
);

export const KebabIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
    <circle cx="12" cy="5" r="1.8" fill="currentColor" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="19" r="1.8" fill="currentColor" />
  </svg>
);

export const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
    <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path
      d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
    <path
      d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
    <path
      d="M6 6l12 12M18 6L6 18"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);
