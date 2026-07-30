// ============================================================
//  src/components/admin/StorageBox.jsx
//  Platform-wide storage usage, broken down by file type.
//  Owns its own fetch/loading/error state so a failure here can't
//  blank the rest of the dashboard.
// ============================================================

import React, { useState, useEffect } from 'react';
import { fetchStorageStats } from '../../services/adminApi';
import { formatBytes, formatPercent } from '../../utils/formatBytes';
import StorageDonut from './StorageDonut';

const StorageBox = () => {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchStorageStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load storage stats.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const totalBytes = stats?.totalBytes ?? 0;
  const isEmpty = !loading && !error && totalBytes === 0;

  return (
    <section className="admin-box">
      <div className="admin-box__header">
        <h2 className="admin-box__title">Storage used</h2>
        {stats && <span className="admin-box__total">{formatBytes(totalBytes)}</span>}
      </div>

      {loading && <p className="admin-box__hint">Loading…</p>}
      {error && <p className="admin-box__error">{error}</p>}

      {stats && (
        <>
          {/* The header already shows the total, so the hole carries the
              secondary figure rather than repeating it. */}
          <StorageDonut
            categories={stats.categories}
            totalBytes={totalBytes}
            holeLabel={
              isEmpty
                ? null
                : `${stats.fileCount} ${stats.fileCount === 1 ? 'file' : 'files'}`
            }
          />

          {isEmpty && <p className="admin-box__empty">No files stored yet.</p>}

          {/* Always rendered, and always with the byte figure and percent as
              real text — this legend is the required relief channel for the
              light-mode slice colours that fall below 3:1 on white. Rows are
              in fixed category order, never sorted by size, so colour follows
              the category rather than its rank. */}
          <div className="admin-legend">
            {stats.categories.map((c) => {
              const empty = c.bytes === 0;
              return (
                <div
                  key={c.key}
                  className={`admin-legend__row${empty ? ' admin-legend__row--empty' : ''}`}
                >
                  <span className={`admin-legend__swatch admin-legend__swatch--${c.key}`} />
                  <span className="admin-legend__label">{c.label}</span>
                  <span className="admin-legend__value">{formatBytes(c.bytes)}</span>
                  <span className="admin-legend__percent">
                    {formatPercent(totalBytes > 0 ? c.bytes / totalBytes : 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};

export default StorageBox;
