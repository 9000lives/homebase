// ============================================================
//  src/components/admin/SystemHealthBox.jsx
//  Is the database up, is mail working, is the disk filling?
//
//  The test-email button exists because approval notices are sent
//  fire-and-forget after the response — a dead SMTP credential fails
//  silently, and this is the only way to notice from inside the app.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  fetchSystemHealth,
  fetchSystemConfig,
  sendTestEmail,
} from '../../services/adminApi';
import { formatBytes } from '../../utils/formatBytes';

const formatUptime = (seconds) => {
  if (!Number.isFinite(seconds)) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const Row = ({ label, value, badge }) => (
  <div className="health-row">
    <span className="health-row__label">{label}</span>
    {badge
      ? <span className={`status-badge status-badge--${badge.tone}`}>{badge.text}</span>
      : <span className="health-row__value">{value}</span>}
  </div>
);

const SystemHealthBox = () => {
  const [health, setHealth] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState('');
  const [testError, setTestError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    // Both in one pass; either failing takes the box to its error state rather
    // than rendering half a panel.
    Promise.all([fetchSystemHealth(), fetchSystemConfig()])
      .then(([h, c]) => { if (!cancelled) { setHealth(h); setConfig(c); } })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load system status.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleTestEmail = async () => {
    setTesting(true);
    setTestResult('');
    setTestError('');
    try {
      const result = await sendTestEmail();
      setTestResult(`Sent to ${result.to}. Check that it arrives.`);
    } catch (err) {
      setTestError(err.message ?? 'Could not send the test email.');
    } finally {
      setTesting(false);
    }
  };

  const disk = health?.storage;
  const hasDisk = disk?.diskTotalBytes > 0;
  const diskUsedFraction = hasDisk
    ? 1 - disk.diskFreeBytes / disk.diskTotalBytes
    : 0;

  return (
    <section className="admin-box">
      <div className="admin-box__header">
        <h2 className="admin-box__title">System</h2>
      </div>

      {loading && <p className="admin-box__hint">Loading…</p>}
      {error && <p className="admin-box__error">{error}</p>}

      {health && config && (
        <>
          <div className="health-list">
            <Row
              label="Database"
              badge={{
                tone: health.database.connected ? 'active' : 'suspended',
                text: health.database.state,
              }}
            />
            <Row
              label="Email"
              badge={{
                tone: health.mail.configured ? 'active' : 'pending',
                text: health.mail.configured ? 'configured' : 'not configured',
              }}
            />
            <Row label="Uptime" value={formatUptime(health.process.uptimeSeconds)} />
            <Row label="Environment" value={health.process.environment} />
            <Row label="Node" value={health.process.nodeVersion} />
            <Row
              label="Stored"
              value={`${formatBytes(health.storage.usedBytes)} · ${health.storage.fileCount} files`}
            />
            <Row
              label="Disk free"
              value={
                // null when the platform can't report it — say so rather than
                // rendering a confident "0 B".
                hasDisk
                  ? `${formatBytes(disk.diskFreeBytes)} of ${formatBytes(disk.diskTotalBytes)}`
                  : 'unavailable'
              }
            />
          </div>

          {hasDisk && (
            <div className="health-bar">
              <div
                className="health-bar__fill"
                style={{ width: `${Math.min(diskUsedFraction * 100, 100)}%` }}
              />
            </div>
          )}

          <div className="health-config">
            <Row label="Max upload" value={formatBytes(config.maxUploadBytes)} />
            <Row label="Storage quota" value={formatBytes(config.userStorageQuotaBytes)} />
            <Row label="Session lifetime" value={config.sessionTokenTtl} />
            <Row label="Device trust" value={`${config.deviceTrustDays} days`} />
            <Row label="Min password" value={`${config.passwordMinLength} chars`} />
            <Row
              label="Breach check"
              value={config.passwordBreachCheck ? 'on' : 'off'}
            />
            <Row
              label="Audit retention"
              value={config.auditPersist ? `${config.auditRetentionDays} days` : 'not persisted'}
            />
            <Row
              label="CORS origins"
              value={config.corsOrigins?.length ? config.corsOrigins.join(', ') : 'dev (any localhost)'}
            />
            <Row
              label="Trust proxy"
              value={String(config.trustProxy)}
            />
          </div>

          <button
            type="button"
            className="modal-button modal-button--ghost health-test-button"
            onClick={handleTestEmail}
            disabled={testing}
          >
            {testing ? 'Sending…' : 'Send test email'}
          </button>

          {testResult && <p className="modal-text modal-text--success">{testResult}</p>}
          {testError  && <p className="modal-text modal-text--error">{testError}</p>}
        </>
      )}
    </section>
  );
};

export default SystemHealthBox;
