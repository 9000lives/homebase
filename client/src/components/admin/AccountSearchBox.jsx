// ============================================================
//  src/components/admin/AccountSearchBox.jsx
//  Search any account regardless of status, and open its detail modal.
//  (usersApi.searchUsers can't back this — it hard-filters to active users.)
// ============================================================

import React, { useState, useEffect } from 'react';
import { fetchAdminUsers } from '../../services/adminApi';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import UserTile from './UserTile';
import UserDetailModal from './UserDetailModal';

/**
 * @param {number}   version   - bumped by any status change elsewhere; refetches
 * @param {Function} onChanged - called after a successful status change
 */
const AccountSearchBox = ({ version, onChanged }) => {
  const [query, setQuery]     = useState('');
  const debouncedQuery        = useDebouncedValue(query, 500);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [detailUser, setDetailUser] = useState(null);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setError('');
      return;
    }
    // `cancelled` guards against out-of-order responses — without it a slow
    // reply for "ad" can land after (and overwrite) the results for "ada"
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchAdminUsers({ q: debouncedQuery, limit: 25 })
      .then((data) => { if (!cancelled) setResults(data); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Search failed.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery, version]);

  return (
    <section className="admin-box">
      <div className="admin-box__header">
        <h2 className="admin-box__title">Account management</h2>
      </div>

      <div className="form-group">
        <label htmlFor="admin-user-search">Search by name or email</label>
        <input
          id="admin-user-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing…"
        />
      </div>

      {error && <p className="admin-box__error">{error}</p>}

      {!debouncedQuery && !error && (
        <p className="admin-box__hint">Search for an account to view or change it.</p>
      )}

      {debouncedQuery && (
        <div className={`admin-box__body${loading ? ' admin-box__body--refreshing' : ''}`}>
          {loading && results.length === 0 && <p className="admin-box__hint">Searching…</p>}
          {!loading && results.length === 0 && !error && (
            <p className="admin-box__empty">No matching accounts.</p>
          )}
          {results.length > 0 && (
            <div className="admin-list">
              {results.map((u) => (
                <UserTile
                  key={u.id}
                  user={u}
                  actionLabel="View"
                  variant="ghost"
                  onAction={setDetailUser}
                  showStatus
                />
              ))}
            </div>
          )}
        </div>
      )}

      {detailUser && (
        <UserDetailModal
          initialUser={detailUser}
          onClose={() => setDetailUser(null)}
          onChanged={onChanged}
        />
      )}
    </section>
  );
};

export default AccountSearchBox;
