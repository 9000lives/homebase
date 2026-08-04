// ============================================================
//  src/components/Logo.jsx
//  The single source of truth for the brand mark. Every place the logo
//  appears renders this, so replacing the files in src/assets/ updates
//  all of them at once.
//
//  Four files, one per variant/theme pair:
//
//              light surface        dark surface
//    full      logo-full.svg        logo-full-dark.svg
//    mark      logo-mark.svg        logo-mark-dark.svg
//
//    full — wordmark with the house worked in as the leading "h"
//    mark — the house on its own, for tight spaces
//
//  WHY THE THEME PAIR EXISTS
//  -------------------------
//  The wordmark's "ome" is neutral ink. A single file can't serve both
//  surfaces: black reads on #ffffff and disappears on #1a1d23, and white
//  does the reverse. The dark files carry the same artwork with that ink
//  inverted.
//
//  WHY THIS IS A JS DECISION RATHER THAN CSS
//  -----------------------------------------
//  An SVG loaded through <img> is an isolated document, so it cannot see
//  the `data-theme` attribute this app themes with. It can only see the
//  OS preference — a different question entirely once the user has made
//  an explicit choice in Settings. Reading the resolved theme here is
//  what keeps the logo in step with the rest of the page.
//
//  IF YOU REPLACE THE LOGO: replace both files in the pair. Swapping
//  only the light one leaves the other theme silently showing the old
//  artwork, and nothing will fail loudly to tell you.
//
//  The favicon (public/favicon.svg) is a deliberate fifth copy of the
//  mark — it can't import from here, because <link rel="icon"> needs a
//  root-served path. It also can't follow the in-app theme, so it should
//  be whichever version reads on a browser tab strip. Update it by hand
//  when the mark changes.
// ============================================================

import React from 'react';
import { useTheme } from '../context/ThemeContext';
import logoFull from '../assets/logo-full.svg';
import logoFullDark from '../assets/logo-full-dark.svg';
import logoMark from '../assets/logo-mark.svg';
import logoMarkDark from '../assets/logo-mark-dark.svg';

const SOURCES = {
  full: { light: logoFull, dark: logoFullDark },
  mark: { light: logoMark, dark: logoMarkDark },
};

/**
 * @param {'full'|'mark'} [variant] - which artwork to render
 * @param {boolean} [decorative]    - true drops it from the accessibility
 *                                    tree, for when a sibling already names
 *                                    the product
 * @param {string} [className]      - extra classes; sizing lives in the
 *                                    consuming context's CSS, not here
 */
const Logo = ({ variant = 'full', decorative = false, className = '' }) => {
  const { theme } = useTheme();

  // Fall back on the variant rather than crashing if an unknown one is
  // passed; `theme` is always one of the two, since ThemeContext resolves
  // it before handing it over.
  const pair = SOURCES[variant] ?? SOURCES.full;

  return (
    <img
      src={pair[theme] ?? pair.light}
      alt={decorative ? '' : 'Homebase'}
      className={`logo logo--${variant}${className ? ` ${className}` : ''}`}
      draggable="false"
    />
  );
};

export default Logo;
