// ============================================================
//  src/components/PreviewModal.jsx
//  Triggered by clicking a file tile. Renders images/PDFs/text
//  inline; falls back to a message + Download for other types.
// ============================================================

import React, { useState, useEffect } from 'react';
import { fetchFilePreview, fetchFileForDownload } from '../services/filesApi';
import { ShareIcon } from './Icons';
import Modal from './Modal';
import LoadingDots from './LoadingDots';
import ShareModal from './ShareModal';
import { getFileKind } from '../utils/fileType';
import { downloadBlob } from '../utils/downloadBlob';

const PREVIEWABLE = new Set(['image', 'pdf', 'text', 'audio']);

/**
 * @param {object}   item           - { _id, name, mimeType }
 * @param {Function} onClose        - called to dismiss the modal
 * @param {boolean}  [readOnly]     - true when previewing a file shared *with* the current
 *                                    user (they don't own it, so no Share button is shown)
 * @param {Function} [onShareChange] - called after a share/unshare succeeds, so the caller
 *                                     can refresh e.g. a "Shared files" list
 */
const PreviewModal = ({ item, onClose, readOnly = false, onShareChange }) => {
  const [objectUrl, setObjectUrl]     = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [downloading, setDownloading] = useState(false);
  const [shareOpen, setShareOpen]     = useState(false);

  const fileKind = getFileKind(item.mimeType);
  const kind = PREVIEWABLE.has(fileKind) ? fileKind : null;

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
      downloadBlob(blob, item.name);
    } catch (err) {
      setError(err.message ?? 'Could not download file.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
    <Modal
      title={item.name}
      onClose={onClose}
      showClose
      truncateTitle
      cardClassName="preview-card"
    >
        <div className="preview-card__body">
          {loading && <LoadingDots />}

          {!loading && error && <p className="preview-card__fallback">{error}</p>}

          {!loading && !error && kind === 'image' && (
            <img src={objectUrl} alt={item.name} className="preview-card__image" />
          )}
          {!loading && !error && kind === 'pdf' && (
            <iframe src={objectUrl} title={item.name} className="preview-card__pdf" />
          )}
          {/* tabIndex so a keyboard-only user can scroll a long file: arrow keys
              scroll the focused element's nearest scrollable ancestor, which is
              .preview-card__body. The other kinds don't need it — images fit,
              audio has controls, and an iframe is focusable already.
              Children stay {textContent}: React-escaped, never innerHTML. */}
          {!loading && !error && kind === 'text' && (
            <pre
              className="preview-card__text"
              tabIndex={0}
              aria-label={`Contents of ${item.name}`}
            >{textContent}</pre>
          )}
          {!loading && !error && kind === 'audio' && (
            <audio src={objectUrl} controls className="preview-card__audio" />
          )}
          {!loading && !error && !kind && (
            <p className="preview-card__fallback">No preview available for this file type.</p>
          )}
        </div>

        <div className="modal-actions">
          {!readOnly && (
            <button type="button" className="modal-button modal-button--ghost" onClick={() => setShareOpen(true)}>
              <ShareIcon /> Share
            </button>
          )}
          <button
            type="button"
            className="modal-button modal-button--primary"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        </div>
    </Modal>

    {shareOpen && (
      <ShareModal item={item} onClose={() => setShareOpen(false)} onShareChange={onShareChange} />
    )}
    </>
  );
};

export default PreviewModal;
