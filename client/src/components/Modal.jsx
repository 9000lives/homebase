// ============================================================
//  src/components/Modal.jsx
//  The overlay + card shell every dialog in the app renders into,
//  and the single place modal accessibility is implemented:
//  role="dialog", focus move-in, focus trap, Escape, focus restore,
//  and a body scroll lock.
//
//  Before this existed each of the ten modals hand-rolled its own
//  overlay markup and none of them did any of the above.
// ============================================================

import React, { useRef, useEffect, useId } from 'react';
import { CloseIcon } from './Icons';

// Every mounted Modal, innermost last. Two pairs nest in this app —
// PreviewModal -> ShareModal and UserDetailModal -> ConfirmActionModal — and
// without a stack BOTH members would answer Escape (closing the pair in one
// keystroke) and both would run a focus trap, fighting each other on Tab.
const stack = [];

const isTopmost = (instance) => stack[stack.length - 1] === instance;

// Refcounted rather than a plain set/clear: closing the inner modal of a
// nested pair would otherwise unlock scrolling while the outer one is still up.
let scrollLocks = 0;

const lockScroll = () => {
  if (scrollLocks === 0) document.body.style.overflow = 'hidden';
  scrollLocks += 1;
};

const unlockScroll = () => {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = '';
};

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * @param {node}     title            - dialog heading; also names the dialog via aria-labelledby
 * @param {Function} onClose          - dismiss
 * @param {boolean}  [wide]           - widen the card (modal-card--wide)
 * @param {boolean}  [showClose]      - render the header-row × button
 * @param {boolean}  [dismissible]    - gates backdrop click AND Escape together. Pass false
 *                                      while a request is in flight, or for a dialog whose
 *                                      own button must be the only way out.
 * @param {boolean}  [truncateTitle]  - ellipsize the heading (filenames, display names)
 * @param {string}   [cardClassName]  - card class; PreviewModal uses .preview-card
 */
const Modal = ({
  title,
  onClose,
  wide = false,
  showClose = false,
  dismissible = true,
  truncateTitle = false,
  cardClassName = 'modal-card',
  children,
}) => {
  const cardRef = useRef(null);
  const titleId = useId();

  // Per instance, so closing ShareModal returns focus to the Share button
  // inside PreviewModal rather than to whatever opened PreviewModal.
  const returnFocusTo = useRef(null);
  const instance = useRef({});

  useEffect(() => {
    const entry = instance.current;
    returnFocusTo.current = document.activeElement;
    stack.push(entry);
    lockScroll();

    // React applies autoFocus during commit, which is BEFORE this effect runs.
    // Several modals rely on it (NewItemModal, RenameModal, ShareModal, the OTP
    // inputs), so only fall back to the card when nothing inside took focus.
    if (!cardRef.current?.contains(document.activeElement)) {
      cardRef.current?.focus();
    }

    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      unlockScroll();
      returnFocusTo.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!isTopmost(instance.current)) return;

      if (e.key === 'Escape') {
        // Not just cosmetic: AnnouncementModal passes dismissible={false} so an
        // unread broadcast can't be escaped away without being marked seen.
        if (!dismissible) return;
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = cardRef.current?.querySelectorAll(FOCUSABLE);
      if (!focusables?.length) {
        e.preventDefault();   // nothing to move to — keep focus in the dialog
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Bubble, not capture: React attaches its handlers at the root container,
    // so an inner component that calls stopPropagation on Escape (the file
    // tile's kebab menu) still gets to handle it first.
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismissible, onClose]);

  const heading = (
    <h2
      id={titleId}
      className={`modal-title${truncateTitle ? ' modal-title--truncate' : ''}`}
      title={truncateTitle && typeof title === 'string' ? title : undefined}
    >
      {title}
    </h2>
  );

  return (
    <div className="modal-overlay" onClick={dismissible ? onClose : undefined}>
      <div
        ref={cardRef}
        className={`${cardClassName}${wide ? ' modal-card--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {showClose ? (
          <div className="modal-card__header">
            {heading}
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              disabled={!dismissible}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        ) : (
          heading
        )}

        {children}
      </div>
    </div>
  );
};

export default Modal;
