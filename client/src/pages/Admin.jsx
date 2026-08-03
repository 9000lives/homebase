// ============================================================
//  src/pages/Admin.jsx
//  Admin dashboard. Reached from the Admin section in Settings; the
//  route is guarded by AdminRoute, and every endpoint it calls is
//  guarded again server-side by requireAdmin.
// ============================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StorageBox from '../components/admin/StorageBox';
import PendingAccountsBox from '../components/admin/PendingAccountsBox';
import AccountSearchBox from '../components/admin/AccountSearchBox';
import AnnouncementsBox from '../components/admin/AnnouncementsBox';
import AuditLogBox from '../components/admin/AuditLogBox';
import SystemHealthBox from '../components/admin/SystemHealthBox';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import '../styles/dashboard.css';   // modal system, .share-user-tile*, .icon-button
import '../styles/admin.css';

const Admin = () => {
  useDocumentTitle('Admin');
  const navigate = useNavigate();

  // Bumped by any status mutation so both user lists refetch. This is what
  // makes an activation in the pending box show up in the search box, and an
  // account set back to pending reappear in the queue. The storage box ignores
  // it — changing a status doesn't move bytes.
  const [dataVersion, setDataVersion] = useState(0);
  const bump = () => setDataVersion((v) => v + 1);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <button type="button" className="admin-back" onClick={() => navigate('/settings')}>
          &larr; Back to Settings
        </button>
        <h1 className="admin-header__title">Admin Dashboard</h1>
      </header>

      <main className="admin-main">
        {/* Each box owns its own fetch, loading and error state, so one
            failing endpoint can't blank the whole page. */}
        <div className="admin-grid">
          <StorageBox />
          <PendingAccountsBox version={dataVersion} onChanged={bump} />
          <AccountSearchBox version={dataVersion} onChanged={bump} />
          {/* No version/onChanged: announcements and account status don't
              affect each other, so neither needs to refetch on the other's
              change — same reasoning as StorageBox above. */}
          <AnnouncementsBox />
          {/* Both append-only / read-only, so neither participates in
              dataVersion either. */}
          <AuditLogBox />
          <SystemHealthBox />
        </div>
      </main>
    </div>
  );
};

export default Admin;
