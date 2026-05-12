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

The backend is complete and the frontend is currently in development.

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
| Dev Tools | Nodemon, ESLint                   |

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
- 🚧 Frontend (in progress)

---

## Project Structure

```
homebase/
├── server/
│   ├── server.js               
│   ├── middleware/
│   │   ├── authMiddleware.js   
│   │   └── uploadMiddleware.js 
│   ├── models/
│   │   ├── userModel.js
│   │   ├── fileModel.js
│   │   └── folderModel.js
│   ├── controllers/
│   │   ├── userController.js
│   │   └── fileController.js
│   └── routes/
│       ├── userRoutes.js
│       ├── fileRoutes.js
│       └── folderRoutes.js
├── .env                        
├── package.json
└── DEVLOG.md
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

> **Note:** On first run, the `uploads/` directory is created automatically if it doesn't exist.

---

## API Reference

All protected routes require a valid JWT token in the `Authorization` header:
```
Authorization: Bearer <token>
```

### Auth — `/api/users`

| Method | Endpoint        | Auth      | Description                                           |
|--------|-----------------|-----------|-------------------------------------------------------|
| POST   | `/register`     | Public    | Register a new user (default status: `pending`)       |
| POST   | `/login`        | Public    | Login and receive a JWT token                         |
| GET    | `/me`           | Protected | Get the currently authenticated user                  |
| PUT    | `/:id/status`   | Admin     | Update a user's status (`pending`/`active`/`suspended`) |

### Files — `/api/files`

| Method | Endpoint            | Auth      | Description                     |
|--------|---------------------|-----------|---------------------------------|
| POST   | `/upload`           | Protected | Upload a file                   |
| GET    | `/`                 | Protected | List all files for current user |
| GET    | `/download/:id`     | Protected | Download a file by ID           |
| DELETE | `/:id`              | Protected | Delete a file by ID             |

### Folders — `/api/folders`

| Method | Endpoint        | Auth      | Description                                          |
|--------|-----------------|-----------|------------------------------------------------------|
| POST   | `/`             | Protected | Create a new folder                                  |
| GET    | `/`             | Protected | List all folders for current user                    |
| PUT    | `/:id/rename`   | Protected | Rename a folder                                      |
| PUT    | `/:id/move`     | Protected | Move a folder to a different parent                  |
| DELETE | `/:id`          | Protected | Delete a folder and all its contents recursively     |

---

## Database Schema

### User

| Field          | Type   | Notes                                   |
|----------------|--------|-----------------------------------------|
| `email`        | String | Unique                                  |
| `passwordHash` | String | bcrypt hashed                           |
| `displayName`  | String |                                         |
| `role`         | String | `user` or `admin`                       |
| `status`       | String | `pending`, `active`, or `suspended`     |
| `createdAt`    | Date   |                                         |

### File

| Field            | Type     | Notes                                |
|------------------|----------|--------------------------------------|
| `ownerId`        | ObjectId | Ref: User                            |
| `originalName`   | String   | Filename as uploaded by the client   |
| `storedName`     | String   | UUID-based filename stored on disk   |
| `parentFolderId` | ObjectId | Ref: Folder — null means root        |
| `size`           | Number   |                                      |
| `mimetype`       | String   |                                      |
| `createdAt`      | Date     |                                      |

### Folder

| Field            | Type     | Notes                                |
|------------------|----------|--------------------------------------|
| `ownerId`        | ObjectId | Ref: User                            |
| `name`           | String   |                                      |
| `parentFolderId` | ObjectId | Ref: Folder — null means root        |
| `createdAt`      | Date     |                                      |

> Folders exist only in the database — no corresponding directories are created on disk. The `parentFolderId` field is used by the frontend to render the folder hierarchy.

---

## Scripts

| Command       | Description                               |
|---------------|-------------------------------------------|
| `npm start`   | Start the server with Node                |
| `npm run dev` | Start with Nodemon (auto-reload on save)  |

---

## Roadmap

- [ ] Frontend dashboard (file browser UI)
- [ ] Shared links / public file sharing
- [ ] Storage quota per user
- [ ] Email notifications, Email-based 2FA (nodemailer is already a dependency)
- [ ] File preview (images, PDFs)