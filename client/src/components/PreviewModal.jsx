// ============================================================
//  src/components/PreviewModal.jsx
//  Triggered by clicking a file tile. Renders images/PDFs/text
//  inline; falls back to a message + Download for other types.
// ============================================================

import React, { useState, useEffect } from 'react';
import { fetchFilePreview, fetchFileForDownload } from '../services/filesApi';
import { CloseIcon } from './Icons';

const PREVIEWABLE_KINDS = {
  'image/jpeg':      'image',
  'image/png':       'image',
  'image/gif':       'image',
  'application/pdf': 'pdf',
  'text/plain':      'text',
};

/**
 * @param {object}   item    - { _id, name, mimeType }
 * @param {Function} onClose - called to dismiss the modal
 */
const PreviewModal = ({ item, onClose }) => {
  const [objectUrl, setObjectUrl]     = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [downloading, setDownloading] = useState(false);

  const kind = PREVIEWABLE_KINDS[item.mimeType] ?? null;

  useEffect(() => {
    let currentUrl = null;
    let cancelled = false;

    const load = async () => {
      if (!kind) { setLoading(false); return; }
      setLoading(true);
      setError('');
      try {
        const blob = await fetchFilePreview(item._id);
        if (cancelled) return;
        if (kind === 'text') {
          setTextContent(await blob.text());
        } else {
          currentUrl = URL.createObjectURL(blob);
          setObjectUrl(currentUrl);
        }
      } catch (err) {
        if (!cancelled) setError(err.message ?? 'Could not load preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [item._id, kind]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await fetchFileForDownload(item._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message ?? 'Could not download file.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="preview-card" onClick={(e) => e.stopPropagation()}>
        <div className="preview-card__header">
          <span className="preview-card__title" title={item.name}>{item.name}</span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close preview">
            <CloseIcon />
          </button>
        </div>

        <div className="preview-card__body">
          {loading && (
            <div className="dashboard-loading">
              <span className="auth-loading__dot" />
              <span className="auth-loading__dot" />
              <span className="auth-loading__dot" />
            </div>
          )}

          {!loading && error && <p className="preview-card__fallback">{error}</p>}

          {!loading && !error && kind === 'image' && (
            <img src={objectUrl} alt={item.name} className="preview-card__image" />
          )}
          {!loading && !error && kind === 'pdf' && (
            <iframe src={objectUrl} title={item.name} className="preview-card__pdf" />
          )}
          {!loading && !error && kind === 'text' && (
            <pre className="preview-card__text">{textContent}</pre>
          )}
          {!loading && !error && !kind && (
            <p className="preview-card__fallback">No preview available for this file type.</p>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-button modal-button--ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="modal-button modal-button--primary"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
