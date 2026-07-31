// ============================================================
//  src/components/admin/AnnouncementsBox.jsx
//  Compose a broadcast and review what's been sent.
//
//  Every active user sees a new announcement in a modal the next time
//  they open the app, once. Expired ones stay in this list as history.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  createAnnouncement,
  fetchAnnouncements,
  deleteAnnouncement,
} from '../../services/adminApi';
import ConfirmActionModal from '../ConfirmActionModal';

const MAX_TITLE_LENGTH = 120;   // mirrors server/models/announcementModel.js
const MAX_BODY_LENGTH  = 2000;

// <input type="datetime-local"> both reads and writes a local-naive string
// ("2026-08-01T09:30"), while the API speaks ISO/UTC. These two functions are
// the only places that conversion happens — getting it wrong silently expires
// an announcement hours early or late depending on the admin's offset.
const toLocalInputValue = (date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const defaultExpiry = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return toLocalInputValue(d);
};

const formatExpiry = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

// Takes no version/onChanged. Announcements and account status are independent,
// so this box neither triggers nor responds to the page's dataVersion counter —
// it keeps its own list in sync locally after a create or delete.
const AnnouncementsBox = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded]   = useState(false);
  const [error, setError]     = useState('');

  const [title, setTitle]         = useState('');
  const [body, setBody]           = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);

  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const [success, setSuccess]       = useState('');

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting]           = useState(false);
  const [confirmError, setConfirmError]   = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchAnnouncements()
      .then((data) => { if (!cancelled) { setAnnouncements(data); setLoaded(true); } })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load announcements.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    setSuccess('');
    try {
      const created = await createAnnouncement({
        title: title.trim(),
        body:  body.trim(),
        // Local-naive -> ISO. The server stores UTC and rejects a past date.
        expiresAt: new Date(expiresAt).toISOString(),
      });
      setAnnouncements((prev) => [created, ...prev]);
      setTitle('');
      setBody('');
      setExpiresAt(defaultExpiry());
      setSuccess('Announcement published.');
    } catch (err) {
      setFormError(err.message ?? 'Could not publish this announcement.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setConfirmError('');
    try {
      await deleteAnnouncement(confirmTarget.id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== confirmTarget.id));
      setConfirmTarget(null);
    } catch (err) {
      setConfirmError(err.message ?? 'Could not retract this announcement.');
    } finally {
      setDeleting(false);
    }
  };

  // Cheap client-side gate only — the server re-validates all three.
  const canSubmit = title.trim() && body.trim() && expiresAt && !saving;

  return (
    <section className="admin-box">
      <div className="admin-box__header">
        <h2 className="admin-box__title">Announcements</h2>
        {loaded && <span className="admin-box__total">{announcements.length}</span>}
      </div>

      <form className="announcement-form" onSubmit={handleCreate}>
        <div className="form-group">
          <label htmlFor="announcement-title">Title</label>
          <input
            id="announcement-title"
            type="text"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            placeholder="Scheduled maintenance"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="announcement-body">Message</label>
          <textarea
            id="announcement-body"
            className="announcement-form__body"
            value={body}
            maxLength={MAX_BODY_LENGTH}
            rows={4}
            placeholder="Homebase will be offline on Saturday morning for about an hour."
            onChange={(e) => setBody(e.target.value)}
          />
          <span className="announcement-form__count">
            {body.length} / {MAX_BODY_LENGTH}
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="announcement-expiry">Stops showing after</label>
          <input
            id="announcement-expiry"
            type="datetime-local"
            value={expiresAt}
            min={toLocalInputValue(new Date())}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        {formError && <p className="modal-text modal-text--error">{formError}</p>}
        {success   && <p className="modal-text modal-text--success">{success}</p>}

        <button
          type="submit"
          className="modal-button modal-button--primary"
          disabled={!canSubmit}
        >
          {saving ? 'Publishing…' : 'Publish'}
        </button>
      </form>

      {!loaded && loading && <p className="admin-box__hint">Loading…</p>}
      {error && <p className="admin-box__error">{error}</p>}

      {loaded && (
        <div className={`admin-box__body${loading ? ' admin-box__body--refreshing' : ''}`}>
          {announcements.length === 0 ? (
            <p className="admin-box__empty">Nothing has been announced yet.</p>
          ) : (
            <div className="admin-list">
              {announcements.map((a) => {
                // Derived at render rather than read from the server, so a list
                // left open past an expiry corrects itself on the next paint.
                const expired = new Date(a.expiresAt) <= new Date();
                return (
                  <div key={a.id} className="announcement-row">
                    <div className="announcement-row__main">
                      <span className="announcement-row__title">{a.title}</span>
                      <span className="announcement-row__meta">
                        {expired ? 'Expired' : 'Until'} {formatExpiry(a.expiresAt)}
                      </span>
                    </div>
                    <span
                      className={`status-badge status-badge--${expired ? 'suspended' : 'active'}`}
                    >
                      {expired ? 'expired' : 'live'}
                    </span>
                    <button
                      type="button"
                      className="modal-button modal-button--ghost announcement-row__delete"
                      onClick={() => setConfirmTarget(a)}
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {confirmTarget && (
        <ConfirmActionModal
          title="Delete announcement?"
          body={`"${confirmTarget.title}" will stop reaching anyone who hasn't seen it yet. People who already saw it are unaffected.`}
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
          error={confirmError}
          onClose={() => { setConfirmTarget(null); setConfirmError(''); }}
          onConfirm={handleDelete}
        />
      )}
    </section>
  );
};

export default AnnouncementsBox;
