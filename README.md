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
- ✅ Admin dashboard: account approval and search, storage breakdown, announcements, audit log, system health
- ✅ Light/dark theming that follows the OS until the user chooses otherwise

---

## Project Structure

```
homebase/
├── server/
│   ├── server.js               
│   ├── config/                 # env validation, mailer, db
│   ├── middleware/             # auth, uploads, error handling
│   ├── models/                 # user, file, folder, announcement, audit log
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
├── .env                        
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- A running MongoDB instance (local or Atlas)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/tasmerdo/homebase.git
cd homebase

# 2. Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the project root and fill in your values:

| Variable      | Description                            | Example                              |
|---------------|----------------------------------------|--------------------------------------|
| `PORT`        | Port for the API server (default: 5000)| `8888`                               |
| `MONGO_URI`   | MongoDB connection string              | `mongodb://localhost:27017/homebase` |
| `JWT_SECRET`  | Secret key used to sign JWT tokens     | `your-secret-key`                    |

### Running the App

```bash
# Development (with auto-reload via nodemon)
npm run dev

# Production
npm start
```

The server will start on `http://localhost:<PORT>`.

Configuration is validated at startup (`server/config/env.js`) — the process refuses to boot on a missing `MONGO_URI`/`JWT_SECRET`, a `JWT_SECRET` shorter than 32 characters, or (in production) a missing `CORS_ORIGINS`. See `.env.example` for every supported variable.

> **Note:** Per-user upload directories are created under `server/uploads/<userId>/` on first upload. That path is never served through `express.static` — do not add it.

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

### Admin — `/api/admin`

Every route below `router.use(protect, requireAdmin)`.

| Method | Endpoint              | Auth  | Description                                        |
|--------|-----------------------|-------|----------------------------------------------------|
| GET    | `/stats/storage`      | Admin | Platform storage totals grouped by file type        |
| GET    | `/users?status=&q=`   | Admin | List accounts by status and/or search term          |
| GET    | `/users/:id`          | Admin | One account plus its storage total                  |
| PATCH  | `/users/:id/status`   | Admin | Set status (`pending`/`active`/`suspended`)         |

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

Before deploying: rotate the database and SMTP credentials, restrict the MongoDB Atlas Network Access allow-list to the deployment host, terminate TLS, set `NODE_ENV=production` and `CORS_ORIGINS`, set `TRUST_PROXY` to the real hop count, and run under a process supervisor.

---

## Scripts

| Command       | Description                                                                 |
|---------------|-----------------------------------------------------------------------------|
| `npm start`   | Start the server with Node                                                   |
| `npm run dev` | Start with Nodemon (auto-reload on save)                                     |
| `npm test`    | Security regression suite (37 tests). Requires `MONGO_URI_TEST`              |
| `npx eslint server` | Lint the backend                                                       |

`npm test` refuses to run unless `MONGO_URI_TEST` points at a database whose name ends in `_test`, and drops that database before and after the run.

---

## Roadmap

- [ ] Client-side pagination for directories over 200 items
- [ ] Password reset / account recovery (design it before building — single-use tokens, hashed at rest, short TTL, rate-limited, identical response whether or not the email exists, and invalidating all sessions)
- [ ] Refresh-token rotation
- [ ] Trusted-device management UI (view and revoke individual devices)
- [ ] Malware scanning on upload
- [ ] CI: run the test suite and dependency scanning on every push
- [ ] File preview (images, PDFs)