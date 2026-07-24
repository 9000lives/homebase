// ============================================================
//  src/components/Icons.jsx
//  Inline SVG icons for the file explorer.
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

// Style (fill/accent/label) per file "kind" — see src/utils/fileType.js
// for the mimeType -> kind mapping.
const FILE_TYPE_STYLES = {
  image:   { fill: '#dcfce7', accent: '#22c55e', label: 'IMG' },
  pdf:     { fill: '#fee2e2', accent: '#ef4444', label: 'PDF' },
  doc:     { fill: '#dbeafe', accent: '#3b82f6', label: 'DOC' },
  audio:   { fill: '#f3e8ff', accent: '#a855f7', label: 'MP3' },
  text:    { fill: '#f3f4f6', accent: '#6b7280', label: 'TXT' },
  generic: { fill: '#f3f4f6', accent: '#9ca3af', label: '' },
};

export const FileIcon = ({ kind = 'generic' }) => {
  const { fill, accent, label } = FILE_TYPE_STYLES[kind] ?? FILE_TYPE_STYLES.generic;
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11 5.5C11 4.119 12.119 3 13.5 3H27L37 13V42.5C37 43.881 35.881 45 34.5 45H13.5C12.119 45 11 43.881 11 42.5V5.5Z"
        fill={fill}
        stroke={accent}
        strokeWidth="1.5"
      />
      <path d="M27 3L37 13H29C27.895 13 27 12.105 27 11V3Z" fill={accent} fillOpacity="0.35" />
      {label && (
        <text
          x="24"
          y="32"
          textAnchor="middle"
          fontFamily="Inter, sans-serif"
          fontSize="9"
          fontWeight="700"
          fill={accent}
          letterSpacing="0.5"
        >
          {label}
        </text>
      )}
    </svg>
  );
};

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

export const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
    <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M8.2 10.8L15.8 6.4M8.2 13.2l7.6 4.4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
    <path
      d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 19h16"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
    <path
      d="M5 12.5l4.5 4.5L19 7.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
