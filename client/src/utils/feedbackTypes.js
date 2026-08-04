// ============================================================
//  src/utils/feedbackTypes.js
//  Single source of truth for the feedback type and status LABELS, used
//  by both the Settings form (its dropdown) and the admin FeedbackBox
//  (its two filters and every row).
//
//  MIRRORS server/models/feedbackModel.js. The enum itself lives on the
//  schema — the server validates against schema.path(…).enumValues and
//  never restates the list — so this file owns the human labels only. But
//  the `value`s have to match the schema exactly.
//
//  A shared module isn't available: client/ and server/ are two Node
//  projects with their own package.json, ESM against CJS, and Vite would
//  need its fs.allow reconfigured to reach across. A GET /api/feedback/types
//  endpoint would be worse — feedback deliberately has no member read path
//  at all, and the dropdown would need a round trip before it could render.
//  So this is a hand-mirror, the same convention MAX_TITLE_LENGTH follows
//  in AnnouncementsBox.jsx, with two things added to make drift loud:
//
//    1. The test 'the feedback enums are the lists the client mirrors' in
//       server/tests/security.test.js asserts these lists literally and
//       names this file in its failure message.
//    2. If a mismatch ever ships anyway, labelFor*() falls through to the
//       raw value — an unrecognised type renders as `escalation` rather
//       than as a blank row that looks like a bug in the box.
// ============================================================

// Arrays of objects, not maps: the dropdown order is deliberate, and
// Object.keys ordering is not something to hang a UI on.
export const FEEDBACK_TYPES = [
  { value: 'feature', label: 'Feature Suggestion' },
  { value: 'bug',     label: 'Bug or Error' },
  { value: 'help',    label: 'Help With a Feature' },
  { value: 'account', label: 'Account or Access Issue' },
  { value: 'other',   label: 'Other' },
];

export const FEEDBACK_STATUSES = [
  { value: 'new',         label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'dismissed',   label: 'Dismissed' },
];

export const MAX_MESSAGE_LENGTH = 1000;   // mirrors Feedback.MAX_MESSAGE_LENGTH

const TYPE_LABELS   = Object.fromEntries(FEEDBACK_TYPES.map((t) => [t.value, t.label]));
const STATUS_LABELS = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s.value, s.label]));

export const labelForType   = (value) => TYPE_LABELS[value]   ?? value;
export const labelForStatus = (value) => STATUS_LABELS[value] ?? value;
