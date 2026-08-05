// ============================================================
//  src/components/AuthArt.jsx
//  The right half of the auth split. Today it is an empty brand panel;
//  eventually it holds a small animated SVG.
//
//  To land the artwork:
//    1. save it as client/src/assets/cabinet-animation.svg
//    2. uncomment the import below, and set ART_SRC to cabinetAnimation
//  Nothing else changes — the panel's sizing, centring and the
//  responsive hide below 900px are already wired in auth.css.
//
//  The import stays commented until the file exists on purpose: a static
//  ESM import of a missing asset fails the build outright, so it cannot
//  be pre-wired ahead of the file.
//
//  WHAT THE SVG HAS TO SATISFY, because <img> loads it as an isolated
//  document rather than as part of this page:
//
//   * Animation must be self-contained — CSS keyframes or SMIL inside
//     the file. Script-driven animation (Lottie, GSAP) does NOT run in
//     an <img>; that needs inlining instead, and this is the only file
//     that would change.
//   * No external references. Web fonts, linked images and anything else
//     fetched from outside the file will not load. Convert text to paths.
//   * It must carry its own `@media (prefers-reduced-motion: reduce)`
//     block. base.css's global clamp cannot reach inside it. The OS
//     preference does reach it, so the rule works — it just has to live
//     in the file.
//   * A viewBox, so the panel can scale it. Without one it ignores the
//     CSS box and renders at its intrinsic size.
//   * Legible on BOTH panel colours: --color-auth-art is #00a1db (the
//     brand cyan) in light and #14313d in dark, and this file cannot see
//     `data-theme` to tell them apart. Note cyan artwork will VANISH
//     against the light panel. White or near-white line art is the one
//     treatment that holds on both; anything else needs a light/dark pair
//     here, wired the way Logo.jsx does it.
// ============================================================

import React from 'react';

import cabinetAnimation from '../assets/cabinet-animation.svg';
const ART_SRC = cabinetAnimation;

// aria-hidden: the panel is decoration. It carries no information the
// form doesn't already give, so it stays out of the accessibility tree.
const AuthArt = () => (
  <div className="auth-art" aria-hidden="true">
    {ART_SRC && <img src={ART_SRC} alt="" className="auth-art__media" />}
  </div>
);

export default AuthArt;
