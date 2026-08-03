// ============================================================
//  src/components/settings/SettingsModal.jsx
//  The dialog wrapper for the Settings page's forms.
//
//  Replaces ChangeUsernameModal and ChangePasswordModal, which were the
//  same component twice over — once <Modal> owned the overlay and the
//  close button, all that was left of each was a title and a child.
// ============================================================

import React from 'react';
import Modal from '../Modal';

/**
 * @param {string}   title   - dialog heading
 * @param {Function} onClose - called to dismiss the modal
 */
const SettingsModal = ({ title, onClose, children }) => (
  <Modal title={title} onClose={onClose} showClose>
    {children}
  </Modal>
);

export default SettingsModal;
