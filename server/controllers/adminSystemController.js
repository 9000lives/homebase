const asyncHandler = require('express-async-handler')
const mongoose = require('mongoose')
const fsp = require('fs/promises')
const File = require('../models/fileModel')
const { sendMail } = require('../config/mailer')
const { audit, actorFrom } = require('../utils/logger')
const env = require('../config/env')
const { UPLOAD_ROOT } = env

const CONNECTION_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting']

// fs.statfs landed in Node 18.15. Rather than pinning a version, report the
// figure when it's available and say so plainly when it isn't — a missing disk
// reading must not take the whole health panel down with it.
const readDiskSpace = async () => {
    if (typeof fsp.statfs !== 'function') return null
    try {
        const stats = await fsp.statfs(UPLOAD_ROOT)
        return {
            freeBytes: stats.bavail * stats.bsize,
            totalBytes: stats.blocks * stats.bsize
        }
    } catch {
        // Most likely the uploads directory doesn't exist yet on a fresh
        // install. Not an error worth surfacing as a failed request.
        return null
    }
}

// @desc    Runtime health of the instance.
// @route   GET /api/admin/system/health
// @access  Private/Admin
const getSystemHealth = asyncHandler(async (req, res) => {
    const [disk, totals] = await Promise.all([
        readDiskSpace(),
        File.aggregate([
            { $group: { _id: null, bytes: { $sum: { $ifNull: ['$size', 0] } }, fileCount: { $sum: 1 } } }
        ])
    ])

    res.status(200).json({
        database: {
            state: CONNECTION_STATES[mongoose.connection.readyState] ?? 'unknown',
            connected: mongoose.connection.readyState === 1
        },
        mail: {
            // Whether credentials are present, NOT whether they work. Only
            // POST /system/test-email can answer the second question.
            configured: env.SMTP_CONFIGURED,
            host: env.SMTP_HOST || null,
            from: env.SMTP_FROM || null
        },
        storage: {
            usedBytes: totals[0]?.bytes ?? 0,
            fileCount: totals[0]?.fileCount ?? 0,
            diskFreeBytes: disk?.freeBytes ?? null,
            diskTotalBytes: disk?.totalBytes ?? null
        },
        process: {
            uptimeSeconds: Math.floor(process.uptime()),
            nodeVersion: process.version,
            environment: env.NODE_ENV
        }
    })
})

// @desc    The non-secret half of the running configuration.
// @route   GET /api/admin/system/config
// @access  Private/Admin
//
// An explicit allow-list, deliberately built key by key. Spreading the env
// module here would silently start leaking JWT_SECRET, MONGO_URI and SMTP_PASS
// the moment anyone added a field to it.
const getSystemConfig = asyncHandler(async (req, res) => {
    res.status(200).json({
        maxUploadBytes: env.MAX_UPLOAD_BYTES,
        userStorageQuotaBytes: env.USER_STORAGE_QUOTA_BYTES,
        sessionTokenTtl: env.SESSION_TOKEN_TTL,
        preAuthTokenTtl: env.PREAUTH_TOKEN_TTL,
        deviceTrustDays: Math.round(env.DEVICE_TRUST_TTL_MS / (24 * 60 * 60 * 1000)),
        passwordMinLength: env.PASSWORD_MIN_LENGTH,
        passwordBreachCheck: env.PASSWORD_BREACH_CHECK,
        corsOrigins: env.CORS_ORIGINS,
        trustProxy: env.TRUST_PROXY,
        auditRetentionDays: env.AUDIT_RETENTION_DAYS,
        auditPersist: env.AUDIT_PERSIST,
        smtpConfigured: env.SMTP_CONFIGURED
    })
})

// @desc    Prove the mail path actually works.
// @route   POST /api/admin/system/test-email
// @access  Private/Admin
//
// Approval notices are sent fire-and-forget after the response, so a dead SMTP
// credential fails silently and approvals simply stop notifying anyone. This is
// the only way to find that out without reading server logs.
const sendTestEmail = asyncHandler(async (req, res) => {
    // The recipient is the authenticated admin's own address and is NEVER read
    // from the body. An authenticated endpoint that mails an arbitrary address
    // on demand is an open relay with a login page in front of it.
    const to = req.user.email

    await sendMail({
        to,
        subject: 'Homebase test email',
        text:
            `This is a test message from your Homebase instance.\n\n` +
            `If you're reading it, outgoing mail is working — account approval ` +
            `notices and two-factor codes will reach their recipients.\n`
    })

    audit('admin.test_email_sent', { ...actorFrom(req) })

    res.status(200).json({ sent: true, to })
})

module.exports = { getSystemHealth, getSystemConfig, sendTestEmail }
