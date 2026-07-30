// ============================================================
//  src/utils/formatBytes.js
//  The DB stores raw byte counts; these turn them into something readable.
// ============================================================

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Formats a byte count using binary steps (1024).
 *   0 → "0 B" · 1023 → "1023 B" · 1536 → "1.5 KB" · 4.6e9 → "4.3 GB"
 * Anything past TB clamps to TB rather than inventing bigger units.
 */
export const formatBytes = (bytes, decimals = 1) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';

  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1);
  const value = n / 1024 ** i;

  // bytes are never fractional, so don't print "1023.0 B"
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${UNITS[i]}`;
};

/**
 * Formats a 0–1 fraction as a percentage. Anything real but below 0.1% renders
 * as "<0.1%" so a genuinely non-empty category never reads as "0.0%".
 */
export const formatPercent = (fraction) => {
  const f = Number(fraction);
  if (!Number.isFinite(f) || f <= 0) return '0%';
  const pct = f * 100;
  return pct < 0.1 ? '<0.1%' : `${pct.toFixed(1)}%`;
};
