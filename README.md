# Homebase

> Self-hosted cloud storage for family and friends.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running the App](#running-the-app)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Scripts](#scripts)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

Homebase is a self-hosted cloud storage platform designed for personal use among trusted family and friends. Rather than relying on commercial cloud providers, Homebase lets you run your own private file storage server. Access is whitelist-based, every new account starts as `pending` and must be manually approved by an admin before it can be used, keeping the platform closed to anyone outside your circle.

Both halves are functional: an Express 5 + MongoDB API, and a React 19 frontend covering the dashboard, file and folder actions, sharing, account settings and an admin dashboard.

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Runtime   | Node.js                           |
| Framework | Express 5                         |
| Database  | MongoDB                |
| Auth      | JWT + bcryptjs                    |
| File I/O  | Multer (disk storage)             |
| Security  | Helmet, express-rate-limit, CORS  |
| Frontend  | React 19, Vite, React Router 7    |
| Dev Tools | Nodemon, ESLint, oxlint           |

---

## Features

- ✅ User registration and login with JWT authentication
- ✅ Whitelist-based access: new accounts require admin approval
- ✅ Admin role with protected endpoints for user management
- ✅ File upload, download, and delete
- ✅ Collision-safe file storage using UUID-based filenames on disk
- ✅ Configurable file type and size restrictions
- ✅ Folder creation, renaming, moving, and recursive delete
- ✅ Files and folders are tied to individual user accounts
- ✅ Two-factor authentication over emailed one-time codes, with per-device trust
- ✅ Self-service password reset that doesn't disclose whether an address is registered
- ✅ File and folder sharing
- ✅ React frontend: dashboard, file grid with search, previews, and account settings
- ✅ Member feedback: bug reports, feature requests and questions, triaged from the admin dashboard
- ✅ Admin dashboard: account approval and search, storage breakdown, announcements, feedback, audit log, system health
- ✅ Light/dark theming that follows the OS until the user chooses otherwise

---

## Project Structure

```
homebase/
├── server/
│   ├── server.js               
│   ├── config/                 # env validation, mailer, db
│   ├── middleware/             # auth, uploads, error handling
│   ├── models/                 # user, file, folder, announcement, feedback, audit log
│   ├── controllers/
│   ├── routes/
│   ├── utils/                  # shared auth/validation/logging helpers
│   ├── tests/                  # security regression suite
│   └── uploads/                # never served statically
├── client/                     
│   ├── public/
│   │   └── favicon.svg
│   └── src/
│       ├── assets/             
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── pages/
│       ├── services/           # thin wrappers over one apiClient
│       ├── styles/
│       └── utils/
├── deploy/                     # service definition and reverse proxy config
├── .env                        
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 20 or newer
- A running MongoDB instance (local or Atlas). No replica set is required — nothing here uses transactions.

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/tasmerdo/homebase.git
cd homebase

# 2. Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the **project root** (not in `server/`) and fill in your values. `.env.example` documents every variable with the reasoning behind each default; the table below is the summary.

Everything is read in exactly one place — `server/config/env.js`. Don't read `process.env` directly elsewhere, or validation and defaults stop living together.

**Required**

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string. `mongodb://127.0.0.1:27017/homebase` locally |
| `JWT_SECRET` | Signs session tokens. **Minimum 32 characters**; generate 64 random bytes as hex |
| `CORS_ORIGINS` | Comma-separated allow-list of origins permitted to call the API. **Required under `NODE_ENV=production`** — startup fails without it |

**Core**

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables HSTS and JSON-formatted logs |
| `PORT` | `3000` | Port the API listens on |
| `TRUST_PROXY` | `false` | Number of proxies in front of the app. Wrong in either direction breaks or bypasses every rate limiter |
| `JWT_PREAUTH_SECRET` | derived from `JWT_SECRET` | Signs pre-auth 2FA tokens. Must differ from `JWT_SECRET`; the default derivation is one-way |

**Sessions and 2FA**

| Variable | Default | Description |
|---|---|---|
| `SESSION_TOKEN_TTL` | `2d` | Session token lifetime |
| `PREAUTH_TOKEN_TTL` | `10m` | Lifetime of the token issued mid-2FA-challenge |
| `DEVICE_TRUST_DAYS` | `7` | How long a verified device may skip the 2FA challenge |

**Storage**

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_BYTES` | `104857600` (100 MiB) | Per-file upload ceiling |
| `USER_STORAGE_QUOTA_BYTES` | `5368709120` (5 GiB) | Per-user total, enforced before bytes are written |
| `UPLOAD_ROOT` | `server/uploads` | Where uploaded bytes are written. Relative values resolve against the repo root; absolute values are used as given, so file storage can live on its own volume |

> **`UPLOAD_ROOT` must not be inside `client/`** — that directory is served as static files, so uploads underneath it would be downloadable without authentication. The app refuses to start if you point it there.
>
> **To relocate storage later:** stop the app, move the `<userId>` directories, change the value, start it again. `File.storagePath` records a path *relative* to this directory, so the database needs no changes.

**Passwords**

| Variable | Default | Description |
|---|---|---|
| `PASSWORD_MIN_LENGTH` | `12` | Minimum length, applied on registration and every change path |
| `PASSWORD_BREACH_CHECK` | `true` | Check candidates against Have I Been Pwned via k-anonymity. Fails open on a network error |

**Mail** — 2FA codes and approval notices fail to send without these. Incomplete configuration warns at startup rather than failing.

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465) |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password or API key |
| `SMTP_FROM` | `SMTP_USER` | From address on outgoing mail |

**Audit trail**

| Variable | Default | Description |
|---|---|---|
| `AUDIT_PERSIST` | `true` | Also write audit events to the `AuditLog` collection, not just stdout |
| `AUDIT_RETENTION_DAYS` | `90` | TTL on audit rows. They hold IP addresses, so they age out |

**Tests only**

| Variable | Description |
|---|---|
| `MONGO_URI_TEST` | Scratch database for `npm test`. The name **must** end in `_test`; the suite drops it before and after each run |

The frontend has its own `.env` in `client/`, holding exactly one variable — `VITE_API_URL` (default `http://localhost:3000`). See `client/.env.example`; the value is constrained by the server's CORS allow-list and its `Cross-Origin-Resource-Policy`, not just by whether the host is reachable.

> **`VITE_API_URL` is baked into the bundle at build time.** Set it before `npm run build`, or the built client calls `localhost:3000` from every visitor's browser.

### Running the App

Two processes in development — the API from the repo root, the Vite dev server from `client/`:

```bash
npm run dev                 # API with auto-reload, http://localhost:3000
npm --prefix client run dev # frontend, http://localhost:5173
```

Configuration is validated at startup (`server/config/env.js`) — the process refuses to boot on a missing `MONGO_URI`/`JWT_SECRET`, a `JWT_SECRET` shorter than 32 characters, or (in production) a missing `CORS_ORIGINS`.

`npm start` runs the API under bare Node with no supervision. That is fine for a local check and is **not** how to run it in production — see [Deployment](#deployment).

> **Note:** Per-user upload directories are created under `server/uploads/<userId>/` on first upload. That path is never served through `express.static` — do not add it.

---

## Deployment

Configuration for a Windows Server host lives in `deploy/`. Each file carries its own install and operate instructions in its header.

| File | Purpose |
|---|---|
| `deploy/homebase-service.xml` | [WinSW](https://github.com/winsw/winsw) service definition — registers the API with the Service Control Manager, restarts it on failure, rotates captured stdout/stderr |
| `deploy/Caddyfile` | Reverse proxy: serves the built client, proxies `/api`, and obtains TLS certificates automatically |

The shape of it:

- **One origin for client and API.** The API sets `crossOriginResourcePolicy: 'same-site'`, so serving the client from a different *site* blocks every file preview and download in the browser even with CORS correct.
- **Caddy's `root` points at `client/dist`, never the repository root.** One directory too high publishes `.env` and `server/uploads/` as static files.
- **The API binds `0.0.0.0`.** Port 3000 is reachable on every interface and bypasses TLS entirely, so block it at the host firewall and let the proxy be the only way in.
- **Set `TRUST_PROXY` to the real hop count** (`1` behind a single reverse proxy), or every rate limiter keys on the proxy's address and collapses into one shared bucket.

**Health check.** `GET /health` is public and unauthenticated — a supervisor or uptime monitor cannot present a JWT. It returns `200 {"status":"ok"}`, or `503 {"status":"degraded"}` when the database is unreachable. It does no I/O and is mounted ahead of the global rate limiter so probes don't consume the budget real traffic needs. The detailed panel is a separate, admin-only endpoint.

**Shutdown is graceful.** The service stops the process with a console Ctrl+C event, which arrives as `SIGINT`/`SIGBREAK`; the handler stops accepting connections, drains in-flight requests, closes the database connection, then exits. It gives itself 10 seconds and then forces an exit — keep that below the wrapper's `stoptimeout`. Windows never delivers `SIGTERM`, so a `SIGTERM`-only handler would do nothing here.

**First admin.** Every account registers as `pending` with role `user`, and promotion to `admin` is deliberately a direct database operation — no endpoint grants it. Bootstrap the first one by hand:

```javascript
db.users.updateOne(
  { email: "you@example.com" },              // lowercase; registration normalizes it
  { $set: { role: "admin", status: "active" } }
)
```

**Back up both halves.** File bytes live on disk under `server/uploads/`, metadata in MongoDB. A database restore without the matching files leaves rows pointing at nothing.

---

## API Reference

All protected routes require a valid JWT token in the `Authorization` header:
```
Authorization: Bearer <token>
```

Tokens carry a `scope` claim and a token version. Changing your password, disabling 2FA, or logging out invalidates every token issued before that point; those endpoints return a replacement token.

### Auth — `/api/users`

| Method | Endpoint                     | Auth      | Description                                                        |
|--------|------------------------------|-----------|--------------------------------------------------------------------|
| POST   | `/`                          | Public    | Register (default status `pending`; password policy enforced)       |
| POST   | `/login`                     | Public    | Login. Returns a token, or `{ twoFactorRequired, loginToken }`      |
| POST   | `/login/2fa`                 | Public    | Complete a 2FA challenge; returns a token and a device token        |
| POST   | `/password/forgot`           | Public    | Request a reset code. Same response whether or not the address exists |
| POST   | `/password/reset`            | Public    | Redeem the code and set a new password. Returns **no** session token  |
| POST   | `/logout`                    | Protected | Invalidate all session tokens and drop this device's 2FA trust      |
| GET    | `/me`                        | Protected | Get the currently authenticated user                                |
| GET    | `/search?q=`                 | Protected | Find active users for sharing (minimum 3 characters)                |
| PATCH  | `/me/username`               | Protected | Change display name (password-gated)                                |
| PATCH  | `/me/password`               | Protected | Change password when 2FA is off                                     |
| POST   | `/me/password/2fa-challenge` | Protected | Send a password-change code (2FA on)                                |
| PATCH  | `/me/password/2fa-confirm`   | Protected | Verify the code and set the new password                            |
| POST   | `/me/2fa/enable`             | Protected | Send a 2FA setup code                                               |
| POST   | `/me/2fa/verify`             | Protected | Verify the code and enable 2FA                                      |
| POST   | `/me/2fa/disable`            | Protected | Disable 2FA (password-gated)                                        |

### Files — `/api/files`

| Method | Endpoint          | Auth      | Description                                                   |
|--------|-------------------|-----------|---------------------------------------------------------------|
| POST   | `/upload`         | Protected | Upload a file (quota checked first; content type verified)     |
| GET    | `/`               | Protected | List files in a folder. Bounded; total in `X-Total-Count`      |
| GET    | `/shared`         | Protected | Files other users have shared with you                         |
| GET    | `/search?q=`      | Protected | Search your own files across the whole tree                    |
| GET    | `/:id/download`   | Protected | Download a file (owner or shared)                              |
| GET    | `/:id/view`       | Protected | Serve inline for preview, with `nosniff` and a sandboxing CSP  |
| DELETE | `/:id/delete`     | Protected | Delete a file (owner only)                                     |
| PATCH  | `/:id/rename`     | Protected | Rename a file (owner only)                                     |
| PATCH  | `/:id/move`       | Protected | Move a file — **both** the file and the destination are authorized |
| PATCH  | `/:id/share`      | Protected | Share with an active user (owner only)                         |
| PATCH  | `/:id/unshare`    | Protected | Revoke a user's access (owner only)                            |

### Folders — `/api/folders`

| Method | Endpoint          | Auth      | Description                                                        |
|--------|-------------------|-----------|--------------------------------------------------------------------|
| POST   | `/create`         | Protected | Create a folder (destination ownership checked)                     |
| GET    | `/`               | Protected | List folders in a folder. Bounded; total in `X-Total-Count`          |
| GET    | `/shared`         | Protected | Folders shared directly with you                                     |
| GET    | `/search?q=`      | Protected | Search your own folders                                              |
| GET    | `/:id/download`   | Protected | Download the folder subtree as a zip (owner only)                    |
| DELETE | `/:id/delete`     | Protected | Delete a folder and its contents recursively (owner only)            |
| PATCH  | `/:id/rename`     | Protected | Rename a folder (owner only)                                         |
| PATCH  | `/:id/move`       | Protected | Move a folder — destination authorized, and cycles rejected          |
| PATCH  | `/:id/share`      | Protected | Share the subtree with an active user (owner only)                   |
| PATCH  | `/:id/unshare`    | Protected | Revoke a user's access (owner only)                                  |

### Announcements — `/api/announcements`

Pull-based; there is no push channel. Creating and retracting them is an admin action and lives under `/api/admin`.

| Method | Endpoint | Auth      | Description                                                     |
|--------|----------|-----------|-----------------------------------------------------------------|
| GET    | `/`      | Protected | Unexpired announcements created since your last-seen watermark   |
| PATCH  | `/seen`  | Protected | Advance the watermark                                            |

### Feedback — `/api/feedback`

One-way by design. There is deliberately **no member `GET`** — not a guarded one, none. A collection with no member-reachable read path cannot disclose one member's message to another, however the admin-side filters change. Reading and triage live under `/api/admin`.

| Method | Endpoint | Auth      | Description                                          |
|--------|----------|-----------|------------------------------------------------------|
| POST   | `/`      | Protected | Submit a bug report, feature request or question (10/hour) |

### Admin — `/api/admin`

Every route below `router.use(protect, requireAdmin)`. Actions targeting another account refuse two targets: the acting admin, and any other admin.

| Method | Endpoint                     | Auth  | Description                                                  |
|--------|------------------------------|-------|--------------------------------------------------------------|
| GET    | `/stats/storage`             | Admin | Platform storage totals grouped by file type                  |
| GET    | `/users?status=&q=`          | Admin | List accounts by status and/or search term                    |
| GET    | `/users/:id`                 | Admin | One account plus its storage total                            |
| PATCH  | `/users/:id/status`          | Admin | Set status (`pending`/`active`/`suspended`)                   |
| POST   | `/users/:id/revoke-sessions` | Admin | Invalidate every outstanding token for an account             |
| POST   | `/users/:id/reset-2fa`       | Admin | Clear 2FA and trusted devices, and revoke sessions            |
| DELETE | `/users/:id`                 | Admin | Delete an account and everything it owns (typed email required) |
| POST   | `/announcements`             | Admin | Broadcast an announcement with an expiry                      |
| GET    | `/announcements`             | Admin | List what has been sent, including expired                    |
| DELETE | `/announcements/:id`         | Admin | Retract an announcement                                       |
| GET    | `/feedback`                  | Admin | Triage queue. Envelope with `total` and an unfiltered `newCount` |
| PATCH  | `/feedback/:id/status`       | Admin | Move through `new` → `in_progress` → `resolved`/`dismissed`    |
| DELETE | `/feedback/:id`              | Admin | Delete a feedback row                                         |
| GET    | `/audit`                     | Admin | Audit log, paginated                                          |
| GET    | `/audit/events`              | Admin | Distinct event names, for the filter dropdown                 |
| GET    | `/system/health`             | Admin | Database, mail, disk and process state                        |
| GET    | `/system/config`             | Admin | The non-secret half of the running configuration              |
| POST   | `/system/test-email`         | Admin | Send a test message to your own address (5/15min)             |

> Unauthenticated `GET /health` also exists, outside `/api`, for supervisors and uptime monitors. See [Deployment](#deployment).

---

## Database Schema

### User

| Field                   | Type    | Notes                                                      |
|-------------------------|---------|------------------------------------------------------------|
| `email`                 | String  | Unique, lowercase, max 254                                  |
| `passwordHash`          | String  | bcrypt, cost 12                                             |
| `displayName`           | String  | Max 255                                                     |
| `role`                  | String  | `user` or `admin`                                           |
| `status`                | String  | `pending`, `active`, or `suspended`                         |
| `tokenVersion`          | Number  | Bumped to invalidate every outstanding session token        |
| `twoFactorEnabled`      | Boolean |                                                             |
| `twoFactorCode*`        | mixed   | `select: false` — bcrypt-hashed OTP, expiry, attempt count  |
| `trustedDevices`        | Array   | `select: false` — SHA-256 device token hashes with expiry   |
| `createdAt`             | Date    |                                                             |

### File

| Field            | Type     | Notes                                                    |
|------------------|----------|----------------------------------------------------------|
| `ownerId`        | ObjectId | Ref: User                                                |
| `name`           | String   | Display name; validated (no separators, max 255)          |
| `storagePath`    | String   | `server/uploads/<userId>/<uuid>.<verified-ext>` on disk   |
| `parentFolderId` | ObjectId | Ref: Folder — null means root                             |
| `size`           | Number   | Counts toward the owner's quota                           |
| `mimeType`       | String   | The type **verified from magic bytes**, not the declared one |
| `sharedWith`     | [ObjectId] | Ref: User                                               |
| `createdAt`      | Date     |                                                          |

Indexes: `{ ownerId, parentFolderId }`, `{ parentFolderId }`, `{ sharedWith }`.

### Folder

| Field            | Type       | Notes                                     |
|------------------|------------|-------------------------------------------|
| `ownerId`        | ObjectId   | Ref: User                                 |
| `name`           | String     | Validated (no separators, max 255)        |
| `parentFolderId` | ObjectId   | Ref: Folder — null means root             |
| `sharedWith`     | [ObjectId] | Ref: User — grants live access to the subtree |
| `createdAt`      | Date       |                                           |

Indexes: `{ ownerId, parentFolderId }`, `{ parentFolderId }`, `{ sharedWith }`.

> Folders exist only in the database — no corresponding directories are created on disk. The `parentFolderId` field renders the hierarchy. Cycles are rejected on write and every traversal is depth-bounded.

---

## Security

The detailed security assessment is kept out of this repository on purpose — it maps the application's weaknesses in depth, which isn't something to publish next to the code. In brief:

- **Access control** — every account starts `pending` and needs admin approval. Object-level authorization runs through one shared helper (`server/utils/ownership.js`), and operations with a source *and* a destination authorize both.
- **Sessions** — JWTs carry a positively-asserted `scope` and a token version, so logout and password change actually revoke. The pre-auth token issued during a 2FA challenge is signed with a different key and cannot authenticate anything.
- **Uploads** — content type is verified from magic bytes and must match what the client declared; the stored extension comes from the verified type; executables and markup are rejected outright. Per-user quota enforced before bytes are written.
- **Transport & headers** — helmet with an explicit deny-everything CSP, `nosniff`, HSTS under `NODE_ENV=production`, and an explicit CORS allow-list.
- **Errors** — stack traces are never returned; every error carries a `requestId` that correlates to the server log.

Transport security, process supervision and the reverse proxy are covered by the configuration in `deploy/` — see [Deployment](#deployment). What remains operator work, and cannot be done from this repository:

- **Rotate the database and SMTP credentials.** Generate them from a password manager, long and random.
- **Restrict database network access** to the deployment host — bind a local MongoDB to `127.0.0.1` and enable authorization, or narrow the Atlas Network Access allow-list. Remove any `0.0.0.0/0`.
- **Set `NODE_ENV=production` and `CORS_ORIGINS`**, and `TRUST_PROXY` to the real hop count.
- **Run the test suite against a scratch database** before going live.
- **Set up backups** of both the database and `server/uploads/`, stored off the host.

---

## Scripts

Backend, from the repo root:

| Command       | Description                                                                 |
|---------------|-----------------------------------------------------------------------------|
| `npm start`   | Start the server with Node (no supervision — see [Deployment](#deployment))  |
| `npm run dev` | Start with Nodemon (auto-reload on save)                                     |
| `npm test`    | Security regression suite (76 tests). Requires `MONGO_URI_TEST`              |
| `npx eslint server` | Lint the backend                                                       |

Frontend, from `client/`:

| Command           | Description                          |
|-------------------|--------------------------------------|
| `npm run dev`     | Vite dev server on port 5173          |
| `npm run build`   | Production build into `client/dist`   |
| `npm run preview` | Serve the production build locally    |
| `npm run lint`    | oxlint                                |

`npm test` refuses to run unless `MONGO_URI_TEST` points at a database whose name ends in `_test`, and drops that database before and after the run.

---

## Roadmap

- [ ] Client-side pagination for directories over 200 items (the server already bounds them)
- [ ] Refresh-token rotation
- [ ] Trusted-device management UI (view and revoke individual devices)
- [ ] Malware scanning on upload
- [ ] CI: run the test suite and dependency scanning on every push
- [ ] Encryption at rest for stored file bytes