# Known Issues & In-Progress Features

Living tracker so we know where to pick up each session. Update this whenever a bug is fixed or a new one is found — check it off / move it to a changelog rather than deleting the line, so we keep a record of what's already been dealt with.

---

## Open bugs

### 1. Settings icon does nothing (dead route)
`Header.jsx`'s settings button calls `onSettings`, which `Dashboard.jsx` wires to `navigate('/settings')`. `App.jsx` never defines a `/settings` route, so the catch-all `<Route path="*" element={<Navigate to="/dashboard" replace />} />` immediately bounces back to `/dashboard` — clicking the gear icon just flashes/reloads the dashboard.
- **Fix**: either build a real `/settings` route + page, or disable/hide the button until it exists.
- Explicitly out of scope for the 2026-07-20 dashboard pass (navigation fix + rename/delete + previews) — deferred on purpose, not forgotten.

### 6. Admin status update example uses an invalid enum value
`authApi.js`'s `updateUserStatus` doc comment shows `status: 'deactivated'`, but the `User` model's enum only allows `pending` / `active` / `suspended` — `'deactivated'` fails Mongoose validation. No UI currently calls this function.
- **Files**: `client/src/services/authApi.js:66-74`, `server/models/userModel.js:6-9`

### 7. README documents the wrong HTTP method for status updates
`README.md`'s API reference table lists `PUT /api/users/:id/status`; the actual route (`server/routes/userRoutes.js:33`) is `PATCH`.

---

## Fixed (2026-07-20 — navigation fix + rename/delete + previews pass)

- **Opening a folder showed files that weren't in it** — `fileController.js`'s `getFiles` read `req.query.folderId` instead of `req.query.parentFolderId`, so it always queried root-level files regardless of which folder was open. Fixed by reading the correct query key. Verified manually: nested folders (`A > B`) each show only their own contents.
- **Validation errors returned HTTP 200 instead of an error status** — `errorMiddleware.js`'s `res.statusCode ? res.statusCode : 500` never fell through to 500 since Express defaults `res.statusCode` to the truthy `200`. Fixed to treat a still-200 status as unset (`res.statusCode && res.statusCode !== 200 ? ... : 500`).
- **PATCHing a non-existent file/folder threw an unhandled TypeError instead of a 404** — `updateFileName`, `updateFileFolder`, `updateFolderName`, `updateFolderParent` now have the same existence + ownership guard already used in `deleteFile`/`deleteFolder`.
- **Frontend rename/delete calls targeted routes that didn't exist on the backend** — `filesApi.js`'s `renameFile`/`deleteFile`/`renameFolder`/`deleteFolder` now hit `/:id/rename` and `/:id/delete`, matching the real routes.
- **Rename & delete UI** — kebab menu on each file/folder tile (`FileTile.jsx`), with `RenameModal.jsx` and `ConfirmDeleteModal.jsx`. Verified manually: rename a file/folder, delete a file, and recursive delete of a non-empty folder (subfolder + files all removed).
- **File preview** — clicking a file now opens `PreviewModal.jsx` instead of doing nothing. Images, PDFs, and `.txt` render inline (new `GET /api/files/:id/view` endpoint, auth'd blob-fetch + `URL.createObjectURL`); Word docs show a "no preview available" fallback. A Download button (via `GET /api/files/:id/download`, also blob-fetched) is available in every preview state. Verified manually for all four cases plus the Download button.

---

## In-Progress / Not Yet Implemented

- **Settings page** — button exists, no route or page built yet (see bug #1)
- **Move file/folder UI** — backend route exists (`PATCH .../:id/move`), no frontend affordance (e.g. drag-and-drop) yet
- **Storage quota per user** (README roadmap)
- **Shared / public file links** (README roadmap)
- **Email notifications & email-based 2FA** (README roadmap — `nodemailer` is already a dependency but unused)

---

See `CLAUDE.md` for the broader architecture notes these bugs live in.
