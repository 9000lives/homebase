// ============================================================
//  src/components/admin/AuditLogBox.jsx
//  The security trail: logins, 2FA outcomes, admin actions, shares,
//  deletes, rate-limit trips.
//
//  Takes no `version` — audit rows are append-only, so nothing another
//  box does can invalidate what's already on screen.
// ============================================================

import React, { useState, useEffect } from 'react';
import { fetchAuditLog, fetchAuditEvents } from '../../services/adminApi';

const PAGE_SIZE = 25;

// Event names are machine-readable (`admin.user_status_changed`); this is the
// only place they're turned into something an operator reads at a glance.
const humanizeEvent = (event) => {
  const [category, ...rest] = event.split('.');
  const action = rest.join('.').replace(/_/g, ' ');
  return { category, action: action || category };
};

const formatWhen = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

const nameOf = (party) => {
  if (!party) return null;
  if (party.deleted) return 'deleted account';
  return party.displayName ?? party.email ?? null;
};

const AuditLogBox = () => {
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [loaded, setLoaded]     = useState(false);
  const [error, setError]       = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter options load once — they describe what the trail contains, which
  // doesn't change as you page through it.
  useEffect(() => {
    let cancelled = false;
    fetchAuditEvents()
      .then((data) => { if (!cancelled) setCategories(data.categories ?? []); })
      .catch(() => {});   // the filter degrades to "All events"; not worth an error
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchAuditLog({ event: filter || null, limit: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setLoaded(true);
      })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load the audit log.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await fetchAuditLog({
        event: filter || null,
        limit: PAGE_SIZE,
        skip:  rows.length,
      });
      setRows((prev) => [...prev, ...(data.rows ?? [])]);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err.message ?? 'Could not load more entries.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="admin-box">
      <div className="admin-box__header">
        <h2 className="admin-box__title">Audit log</h2>
        {loaded && <span className="admin-box__total">{total}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="audit-filter">Event type</label>
        <select
          id="audit-filter"
          className="admin-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All events</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {!loaded && loading && <p className="admin-box__hint">Loading…</p>}
      {error && <p className="admin-box__error">{error}</p>}

      {loaded && (
        <div className={`admin-box__body${loading ? ' admin-box__body--refreshing' : ''}`}>
          {rows.length === 0 ? (
            <p className="admin-box__empty">Nothing recorded yet.</p>
          ) : (
            <>
              <div className="audit-list">
                {rows.map((row) => {
                  const { category, action } = humanizeEvent(row.event);
                  const actor  = nameOf(row.actor);
                  const target = nameOf(row.target);
                  return (
                    <div key={row.id} className="audit-row">
                      <span className={`audit-row__tag audit-row__tag--${category}`}>
                        {category}
                      </span>
                      <div className="audit-row__main">
                        <span className="audit-row__action">{action}</span>
                        <span className="audit-row__who">
                          {actor ?? 'anonymous'}
                          {target && target !== actor && <> → {target}</>}
                          {row.ip && <span className="audit-row__ip"> · {row.ip}</span>}
                        </span>
                      </div>
                      <span className="audit-row__when">{formatWhen(row.createdAt)}</span>
                    </div>
                  );
                })}
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
    </section>
  );
};

export default AuditLogBox;
