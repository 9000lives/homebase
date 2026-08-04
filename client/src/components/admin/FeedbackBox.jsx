// ============================================================
//  src/components/admin/FeedbackBox.jsx
//  Member-submitted feedback: the triage queue and its history.
//
//  Takes no props. Nothing an account-status change does invalidates a
//  feedback row, and triaging one changes no account — so this box stays
//  out of the page's dataVersion counter, like AnnouncementsBox. It keeps
//  its own list in sync locally after a status change or a delete.
//
//  EVERY field on a row except `status` is MEMBER-AUTHORED TEXT rendering
//  in an admin's browser. It is React children throughout — never
//  dangerouslySetInnerHTML, and newlines survive through the stylesheet's
//  `white-space: pre-wrap`, not by splitting on \n and building markup.
//  This is the mirror image of the announcement body's constraint: there
//  one admin writes and everyone reads; here everyone writes and the one
//  account that can suspend, delete and read the audit trail reads.
// ============================================================

import React, { useState, useEffect } from 'react';
import { fetchFeedback, setFeedbackStatus, deleteFeedback } from '../../services/adminApi';
import { FEEDBACK_TYPES, FEEDBACK_STATUSES, labelForType } from '../../utils/feedbackTypes';
import ConfirmActionModal from '../ConfirmActionModal';

// Smaller than AuditLogBox's 25: a feedback row is multi-line, so a page of 25
// would overflow .admin-list's max-height several times over.
const PAGE_SIZE = 10;

const formatWhen = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

const FeedbackBox = () => {
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [typeFilter, setTypeFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading]   = useState(true);
  const [loaded, setLoaded]     = useState(false);
  const [error, setError]       = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting]           = useState(false);
  const [confirmError, setConfirmError]   = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchFeedback({ type: typeFilter || null, status: statusFilter || null, limit: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setNewCount(data.newCount ?? 0);
        setLoaded(true);
      })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load feedback.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [typeFilter, statusFilter]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await fetchFeedback({
        type:   typeFilter || null,
        status: statusFilter || null,
        limit:  PAGE_SIZE,
        skip:   rows.length,
      });
      setRows((prev) => [...prev, ...(data.rows ?? [])]);
      setTotal(data.total ?? 0);
      setNewCount(data.newCount ?? 0);
    } catch (err) {
      setError(err.message ?? 'Could not load more feedback.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleStatusChange = async (row, status) => {
    setSavingId(row.id);
    setError('');
    try {
      const updated = await setFeedbackStatus(row.id, status);

      // The header count is unfiltered, so it moves on any transition into or
      // out of `new` regardless of what the list happens to be showing.
      if (row.status === 'new' && updated.status !== 'new') setNewCount((n) => Math.max(0, n - 1));
      if (row.status !== 'new' && updated.status === 'new') setNewCount((n) => n + 1);

      // A row that no longer matches the active status filter leaves the list,
      // rather than sitting there contradicting the filter above it.
      if (statusFilter && updated.status !== statusFilter) {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      }
    } catch (err) {
      setError(err.message ?? 'Could not update that item.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setConfirmError('');
    try {
      await deleteFeedback(confirmTarget.id);
      setRows((prev) => prev.filter((r) => r.id !== confirmTarget.id));
      setTotal((t) => Math.max(0, t - 1));
      if (confirmTarget.status === 'new') setNewCount((n) => Math.max(0, n - 1));
      setConfirmTarget(null);
    } catch (err) {
      // The dialog stays open so the failure is attached to what it applied to.
      setConfirmError(err.message ?? 'Could not delete that item.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="admin-box">
      <div className="admin-box__header">
        <h2 className="admin-box__title">Feedback</h2>
        {loaded && (
          <span className="admin-box__total" title="Feedback awaiting triage">
            {newCount}
            <span className="feedback-box__total-suffix"> new</span>
          </span>
        )}
      </div>

      <div className="feedback-filters">
        <div className="form-group">
          <label htmlFor="feedback-type-filter">Type</label>
          <select
            id="feedback-type-filter"
            className="admin-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {FEEDBACK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="feedback-status-filter">Status</label>
          <select
            id="feedback-status-filter"
            className="admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {!loaded && loading && <p className="admin-box__hint">Loading…</p>}
      {error && <p className="admin-box__error">{error}</p>}

      {loaded && (
        <div className={`admin-box__body${loading ? ' admin-box__body--refreshing' : ''}`}>
          {rows.length === 0 ? (
            <p className="admin-box__empty">
              {typeFilter || statusFilter ? 'Nothing matches those filters.' : 'Nobody has sent feedback yet.'}
            </p>
          ) : (
            <>
              <div className="admin-list">
                {rows.map((row) => (
                  <div key={row.id} className="feedback-row">
                    <div className="feedback-row__head">
                      <span className="feedback-row__type">{labelForType(row.type)}</span>
                      <span className={`status-badge status-badge--${row.status}`}>
                        {row.status.replace('_', ' ')}
                      </span>
                      <span className="feedback-row__when">{formatWhen(row.createdAt)}</span>
                    </div>

                    <p className="feedback-row__message">{row.message}</p>

                    <div className="feedback-row__who">
                      {row.submitter.displayName}
                      <span className="feedback-row__email"> · {row.submitter.email}</span>
                      {row.submitter.deleted && (
                        <span className="feedback-row__gone"> · account deleted</span>
                      )}
                    </div>

                    <div className="feedback-row__actions">
                      <label className="sr-only" htmlFor={`feedback-status-${row.id}`}>
                        Status for feedback from {row.submitter.displayName}
                      </label>
                      <select
                        id={`feedback-status-${row.id}`}
                        className="admin-select"
                        value={row.status}
                        disabled={savingId === row.id}
                        onChange={(e) => handleStatusChange(row, e.target.value)}
                      >
                        {FEEDBACK_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="modal-button modal-button--ghost feedback-row__delete"
                        onClick={() => setConfirmTarget(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {rows.length < total && (
                <button
                  type="button"
                  className="modal-button modal-button--ghost audit-more"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : `Load more (${total - rows.length} left)`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {confirmTarget && (
        <ConfirmActionModal
          title="Delete this feedback?"
          body={`This permanently removes the message from ${confirmTarget.submitter.displayName}. They are not notified, and they have no copy of it.`}
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

export default FeedbackBox;
