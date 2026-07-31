// ============================================================
//  src/components/AnnouncementGate.jsx
//  Fetches unseen announcements once per "app open" and shows them.
//
//  WHERE THIS IS MOUNTED IS THE FEATURE. It sits in App.jsx as a
//  sibling of <Routes>, inside <AuthProvider>. react-router swaps only
//  the route element BELOW it, so navigating between pages never
//  remounts this component and never re-runs the effect — which is what
//  makes "once per app open, not once per navigation" fall out of the
//  structure instead of needing a sessionStorage flag.
//
//  Moving this inside a page would silently break that guarantee.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchActiveAnnouncements, markAnnouncementsSeen } from '../services/announcementsApi';
import AnnouncementModal from './AnnouncementModal';

const AnnouncementGate = () => {
  const { user, loading } = useAuth();
  const [announcements, setAnnouncements] = useState([]);

  // Which account we've already fetched for. A ref rather than state because
  // it must update without causing a render, and because React.StrictMode
  // double-invokes effects in development — without this the fetch fires twice
  // on every mount.
  const fetchedFor = useRef(null);

  useEffect(() => {
    // Keyed on the user id, not [], so this covers both ways the app "opens":
    // a page load once /me resolves, and a fresh login where `user` goes
    // null -> object with no reload.
    if (loading || !user?.id) return;
    if (fetchedFor.current === user.id) return;

    fetchedFor.current = user.id;

    let cancelled = false;
    fetchActiveAnnouncements()
      .then((data) => { if (!cancelled && Array.isArray(data)) setAnnouncements(data); })
      // Deliberately silent. An announcement failing to load must never put an
      // error in front of someone trying to use their files.
      .catch(() => {});

    return () => { cancelled = true; };
  }, [user?.id, loading]);

  // Signing out must clear both the queue and the guard, or the next account to
  // sign in on this browser inherits the previous one's announcements.
  useEffect(() => {
    if (!loading && !user) {
      fetchedFor.current = null;
      setAnnouncements([]);
    }
  }, [user, loading]);

  const handleDismiss = () => {
    setAnnouncements([]);
    // Fire-and-forget: the modal closes immediately either way. If this fails
    // the watermark simply doesn't advance and they see it again next open,
    // which is the right way for this to fail.
    markAnnouncementsSeen().catch(() => {});
  };

  if (loading || !user || announcements.length === 0) return null;

  return <AnnouncementModal announcements={announcements} onDismiss={handleDismiss} />;
};

export default AnnouncementGate;
