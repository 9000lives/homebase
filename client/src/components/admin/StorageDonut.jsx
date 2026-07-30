// ============================================================
//  src/components/admin/StorageDonut.jsx
//  Hand-rolled SVG donut — no chart library.
//
//  Built from concentric <circle>s with stroke-dasharray rather than <path>
//  arcs: no arc-flag arithmetic, the 100% case is a plain full circle (a real
//  <path> renders a 360° arc as NOTHING, since start == end), and the
//  inter-slice gap is subtraction on one number instead of trigonometry at
//  both ends of every arc.
// ============================================================

import React from 'react';
import { formatBytes, formatPercent } from '../../utils/formatBytes';

const SIZE = 180;                      // viewBox units
const STROKE = 22;                     // ring thickness
const R = (SIZE - STROKE) / 2;         // 79 — keeps the stroke inside the viewBox
const C = 2 * Math.PI * R;             // circumference, ≈496.37
const CENTER = SIZE / 2;
const GAP = 2;                         // surface-coloured gap between slices
const MIN_ARC = 3;                     // smallest drawable sliver

/**
 * @param {Array}  categories - [{ key, label, bytes }], all six, fixed order
 * @param {number} totalBytes
 * @param {node}   [holeLabel] - secondary figure rendered in the middle
 */
const StorageDonut = ({ categories, totalBytes, holeLabel = null }) => {
  const slices = categories.filter((c) => c.bytes > 0);
  const multi = slices.length > 1;

  // Never compute a fraction when the total is 0 — a NaN dasharray silently
  // paints the entire ring in one colour instead of failing visibly.
  let cursor = 0;
  const arcs = totalBytes > 0
    ? slices.map((c) => {
        const fraction = c.bytes / totalBytes;
        const raw = fraction * C;
        // A single 100% slice must NOT lose the gap, or an unbroken ring
        // meaning "everything" gets a visible notch in it.
        // Tiny slices would go negative once the gap is subtracted, so floor them.
        const length = Math.max(raw - (multi ? GAP : 0), MIN_ARC);
        const arc = {
          key: c.key,
          label: c.label,
          bytes: c.bytes,
          fraction,
          dasharray: `${length} ${C - length}`,
          // dashoffset shifts the pattern BACKWARDS, so advancing clockwise
          // needs -cursor; (C - cursor) % C is the same position modulo the
          // circumference and avoids negative attribute values.
          dashoffset: (C - cursor) % C,
        };
        // Advance by the TRUE length, never the clamped one — clamping only
        // lengthens slivers, and advancing by `length` would rotate every
        // subsequent slice, silently misstating the data.
        cursor += raw;
        return arc;
      })
    : [];

  const ariaLabel = totalBytes > 0
    ? `Storage by file type. Total ${formatBytes(totalBytes)}. ` +
      arcs.map((a) => `${a.label} ${formatBytes(a.bytes)}`).join(', ')
    : 'Storage by file type. No files stored yet.';

  return (
    <div className="admin-donut">
      <svg
        className="admin-donut__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={ariaLabel}
      >
        {/* rotate -90° about the centre: a <circle>'s path starts at 3 o'clock,
            and readers expect the first slice to start at 12 */}
        <g
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          fill="none"
          strokeWidth={STROKE}
          /* butt, not round: round caps overhang STROKE/2 at BOTH ends of every
             dash, swallowing the gap and bulging small slices past their angle */
          strokeLinecap="butt"
        >
          {/* also the whole chart in the zero state */}
          <circle className="admin-donut__track" cx={CENTER} cy={CENTER} r={R} />

          {arcs.map((a) => (
            <circle
              key={a.key}
              className={`admin-donut__arc admin-donut__arc--${a.key}`}
              cx={CENTER}
              cy={CENTER}
              r={R}
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
            >
              <title>
                {`${a.label}: ${formatBytes(a.bytes)} (${formatPercent(a.fraction)})`}
              </title>
            </circle>
          ))}
        </g>
      </svg>

      {holeLabel && (
        <div className="admin-donut__hole">
          <span className="admin-donut__hole-label">{holeLabel}</span>
        </div>
      )}
    </div>
  );
};

export default StorageDonut;
