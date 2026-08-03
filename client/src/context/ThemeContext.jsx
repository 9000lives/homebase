// ============================================================
//  src/context/ThemeContext.jsx
//
//  The stored value is the user's explicit CHOICE, not the resolved
//  theme. Absent means "follow the operating system, live".
//
//  That distinction is load-bearing. Seeding state from matchMedia and
//  then persisting on every render — which is what this did before —
//  would freeze whatever the OS happened to be on the first visit into
//  localStorage, pinning the user to it forever even after they changed
//  their system setting, without them ever touching the toggle. So the
//  write only happens once a choice is actually made.
// ============================================================

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';

const THEME_KEY = 'homebase_theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const ThemeContext = createContext(null);

// useSyncExternalStore rather than useState + an effect: matchMedia is an
// external store, and this is both less code and the reason a mid-session OS
// switch is picked up without any extra wiring.
const subscribeToSystemTheme = (onChange) => {
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

const getSystemPrefersDark = () => window.matchMedia(DARK_QUERY).matches;

export const ThemeProvider = ({ children }) => {
  // null = no explicit choice yet = follow the system.
  const [choice, setChoice] = useState(() => localStorage.getItem(THEME_KEY));

  const systemDark = useSyncExternalStore(subscribeToSystemTheme, getSystemPrefersDark);

  const theme = choice ?? (systemDark ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Only when explicit — see the header comment.
    if (choice) localStorage.setItem(THEME_KEY, choice);
  }, [theme, choice]);

  // Flips the RESOLVED theme, not `choice`, which may still be null. Toggling
  // is what turns "follow the system" into a standing preference.
  const toggleTheme = () => setChoice(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
};
