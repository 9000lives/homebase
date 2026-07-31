const asyncHandler = require('express-async-handler')
const bcrypt = require('bcryptjs')
const User = require('../models/userModel')
// used read-only in searchUsers to check whether a candidate is already
// in a given file's or folder's sharedWith list
const File = require('../models/fileModel')
const Folder = require('../models/folderModel')
const { sendMail } = require('../config/mailer')
const { generateOtp, hashOtp, verifyOtp, OTP_TTL_MINUTES } = require('../utils/otp')
const { signSessionToken, signPreAuthToken, verifyPreAuthToken } = require('../utils/tokens')
const { assertPasswordAcceptable } = require('../utils/passwordPolicy')
const { isTrustedDevice, trustDevice, revokeDevice, revokeAllDevices } = require('../utils/deviceTrust')
const { validateItemName } = require('../utils/names')
const { badRequest, unauthorized, forbidden } = require('../utils/httpError')
const { optionalObjectId } = require('../utils/ownership')
const { audit, actorFrom } = require('../utils/logger')

const BCRYPT_COST = 12

// Minimum characters before the sharing search will return anything. A
// single-letter query used to return 15 arbitrary members, which made the
// whole directory — real names and email addresses — enumerable a page at a
// time by any approved account.
const MIN_SEARCH_LENGTH = 3

// Basic shape check only; the authoritative test is whether the address
// receives the verification mail.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Normalizes an email from a request body. Validates type BEFORE dereferencing:
// the previous `rawEmail.toLowerCase()` ran ahead of the presence check, so a
// body with no `email` threw a TypeError and returned a 500 (with a stack
// trace) to an unauthenticated caller.
const readEmail = (value) => {
    if (typeof value !== 'string') throw badRequest('A valid email address is required')
    const email = value.trim().toLowerCase()
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
        throw badRequest('A valid email address is required')
    }
    return email
}

// Query params arrive as an array when a parameter is repeated (?q=a&q=b), so
// `q.trim()` threw. Take the first value and require a string.
const readQueryString = (value) => {
    const raw = Array.isArray(value) ? value[0] : value
    return typeof raw === 'string' ? raw.trim() : ''
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hashPassword = async (password) => bcrypt.hash(password, await bcrypt.genSalt(BCRYPT_COST))

// The authenticated-session payload. One shape, one place to change it.
const sessionResponse = (user, extra = {}) => ({
    _id: user.id,
    name: user.displayName,
    email: user.email,
    // AuthContext stores this from the login response; without it an admin
    // who just logged in has no role until /me re-hydrates on refresh
    role: user.role,
    token: signSessionToken(user),
    twoFactorEnabled: user.twoFactorEnabled,
    ...extra
})

// @desc    Register a new user
// @route   POST /api/users/
// @access  Public (no token required)
const registerUser = asyncHandler(async (req, res) => {
    const { name, email: rawEmail, password } = req.body

    const email = readEmail(rawEmail)
    const displayName = validateItemName(name, 'Display name')

    // Enforced here AND on both password-change paths — a policy applied only
    // at registration is bypassed by registering weakly and never changing.
    await assertPasswordAcceptable(password, { email, displayName })

    const userExists = await User.findOne({ email })
    if (userExists) {
        throw badRequest('An account with that email already exists')
    }

    const passwordHash = await hashPassword(password)
    const user = await User.create({ displayName, email, passwordHash })

    audit('user.registered', { ...actorFrom(req), userId: user._id.toString() })

    // Every account starts `pending` and cannot use the platform until an
    // admin promotes it, so issuing a token here grants nothing but a
    // consistent client flow.
    res.status(201).json(sessionResponse(user))
})

// @desc    Authenticate an existing user and return a token.
//          If the account has 2FA enabled and the request doesn't present a
//          trusted device token, this sends an email code and returns a
//          loginToken instead — see loginWith2FA for the second step.
// @route   POST /api/users/login/
// @access  Public (no token required)
const loginUser = asyncHandler(async (req, res) => {
    const { password, deviceToken } = req.body
    const email = readEmail(req.body.email)

    const user = await User.findOne({ email }).select('+trustedDevices')

    // Identical error for "no such account" and "wrong password" so this
    // endpoint cannot be used to discover which addresses are registered.
    if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
        audit('auth.login_failed', { ...actorFrom(req), email })
        throw badRequest('Invalid Credentials')
    }

    // Trust is bound to the DEVICE that completed a challenge, not to the
    // account. The old account-wide `twoFactorTrustedUntil` meant one
    // legitimate 2FA login disabled the second factor for anyone holding the
    // password, anywhere, for a week.
    const trusted = user.twoFactorEnabled && isTrustedDevice(user, deviceToken)

    if (user.twoFactorEnabled && !trusted) {
        const code = generateOtp()
        user.twoFactorCodeHash = await hashOtp(code)
        user.twoFactorCodeExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
        user.twoFactorCodeAttempts = 0
        await user.save()

        await sendMail({
            to: user.email,
            subject: 'Homebase login verification code',
            text: `Your Homebase login verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`
        })

        audit('auth.2fa_challenged', { ...actorFrom(req), userId: user._id.toString() })

        return res.status(200).json({
            twoFactorRequired: true,
            // Signed with a DIFFERENT secret than a session token and carrying
            // scope 'login-2fa'. It cannot authenticate any protected route.
            loginToken: signPreAuthToken(user)
        })
    }

    if (trusted) await user.save()   // persist the device's lastUsedAt

    audit('auth.login_succeeded', {
        ...actorFrom(req),
        userId: user._id.toString(),
        trustedDevice: trusted
    })

    res.json(sessionResponse(user))
})

// @desc    Complete a 2FA-challenged login by verifying the emailed code.
// @route   POST /api/users/login/2fa
// @access  Public (the loginToken, not a session JWT, is the credential here)
const loginWith2FA = asyncHandler(async (req, res) => {
    const { loginToken, code } = req.body

    let decoded
    try {
        // Verifies against JWT_PREAUTH_SECRET and asserts scope 'login-2fa'.
        decoded = verifyPreAuthToken(loginToken)
    } catch {
        throw unauthorized('Login session expired, please sign in again')
    }

    const user = await User.findById(decoded.id)
        .select('+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodeAttempts +trustedDevices')

    if (!user) {
        throw unauthorized('Invalid login session')
    }

    const result = await verifyOtp(user, code)

    if (!result.ok) {
        // verifyOtp mutates attempt/clear state; persist it either way so a
        // failed attempt still counts.
        await user.save()
        audit('auth.2fa_failed', { ...actorFrom(req), userId: user._id.toString() })
        throw badRequest(result.reason)
    }

    // This browser may skip the challenge until the device entry expires.
    const newDeviceToken = trustDevice(user, { userAgent: req.get('user-agent') })
    await user.save()

    audit('auth.2fa_succeeded', { ...actorFrom(req), userId: user._id.toString() })

    res.json(sessionResponse(user, { deviceToken: newDeviceToken }))
})

// @desc    Sign the current user out server-side.
//          Bumps tokenVersion, which invalidates every session token issued for
//          this account, and drops the trusted device so the next login from it
//          is challenged again.
// @route   POST /api/users/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('+trustedDevices')
    if (!user) throw unauthorized('Not authorized')

    // "Log out" now actually logs you out. Previously it cleared only the 2FA
    // trust window and left the JWT valid for up to seven more days.
    user.tokenVersion += 1

    if (typeof req.body?.deviceToken === 'string') {
        revokeDevice(user, req.body.deviceToken)
    } else {
        revokeAllDevices(user)
    }

    await user.save()

    audit('auth.logout', { ...actorFrom(req), userId: user._id.toString() })

    res.status(200).json({ message: 'Logged out' })
})

// NOTE: updateUserStatus moved to controllers/adminController.js — it now lives
// behind PATCH /api/admin/users/:id/status, which is the route its own doc
// comment always claimed. One path means one place to keep the guards.

// @desc    Return the currently authenticated user's profile
// @route   GET /api/users/me
// @access  Private (requires a valid JWT — enforced by the `protect` middleware)
const getMe = asyncHandler(async (req, res) => {
    // protect already loaded and validated this document — reuse it rather than
    // issuing a second query that could return null if the user was deleted in
    // between (which used to throw on destructuring and surface as a 500).
    const { _id, displayName, email, role, twoFactorEnabled } = req.user

    res.status(200).json({ id: _id, displayName, email, role, twoFactorEnabled })
})

// @desc    Search active users by email or displayName, for sharing files.
//          Optionally accepts a fileId so results can indicate which
//          candidates the file is already shared with.
// @route   GET /api/users/search?q=<term>&fileId=<optional>
// @access  Private (requires a valid JWT — enforced by the `protect` middleware)
const searchUsers = asyncHandler(async (req, res) => {
    const q = readQueryString(req.query.q)
    const fileId = optionalObjectId(req.query.fileId, 'file id')
    const folderId = optionalObjectId(req.query.folderId, 'folder id')

    // On a private whitelist platform the membership list is itself sensitive.
    // A minimum length turns "walk the alphabet" into "already know roughly who
    // you're looking for", which is the actual sharing use case.
    if (q.length < MIN_SEARCH_LENGTH) {
        return res.json([])
    }

    // escape regex metacharacters so search terms like "a.b" or "(" don't break the query
    const pattern = new RegExp(escapeRegex(q), 'i')

    const users = await User.find({
        _id: { $ne: req.user.id },
        status: 'active',
        $or: [{ email: pattern }, { displayName: pattern }]
    })
        .select('_id displayName email')
        .limit(15)

    let sharedIds = new Set()
    if (fileId) {
        const file = await File.findById(fileId).select('sharedWith ownerId')
        // only trust the sharedWith list if the requester actually owns this file
        if (file && file.ownerId.toString() === req.user.id) {
            sharedIds = new Set((file.sharedWith || []).map((id) => id.toString()))
        }
    } else if (folderId) {
        const folder = await Folder.findById(folderId).select('sharedWith ownerId')
        // only trust the sharedWith list if the requester actually owns this folder
        if (folder && folder.ownerId.toString() === req.user.id) {
            sharedIds = new Set((folder.sharedWith || []).map((id) => id.toString()))
        }
    }

    res.json(users.map((u) => ({
        id: u._id,
        displayName: u.displayName,
        email: u.email,
        isShared: sharedIds.has(u._id.toString())
    })))
})

// @desc    Change the current user's display name (their "username").
//          Password-gated; not affected by 2FA either way.
// @route   PATCH /api/users/me/username
// @access  Private
const changeUsername = asyncHandler(async (req, res) => {
    const { password, displayName } = req.body

    const user = await User.findById(req.user.id)
    if (!user) throw unauthorized('Not authorized')

    if (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
        throw unauthorized('Incorrect password')
    }

    user.displayName = validateItemName(displayName, 'Display name')
    await user.save()

    audit('user.username_changed', { ...actorFrom(req), userId: user._id.toString() })

    res.status(200).json({
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role
    })
})

// Shared tail of both password-change paths: hash, invalidate every outstanding
// session, drop trusted devices, and hand the caller a fresh token so the
// browser that just changed the password isn't signed out by its own action.
const applyNewPassword = async (user, newPassword, req) => {
    user.passwordHash = await hashPassword(newPassword)

    // Changing your password is the single most important thing a user does
    // when they suspect compromise. Without this it evicted nobody — an
    // attacker holding a token kept full access for the rest of its lifetime.
    user.tokenVersion += 1
    revokeAllDevices(user)

    await user.save()

    audit('user.password_changed', { ...actorFrom(req), userId: user._id.toString() })
}

// @desc    Change the current user's password when 2FA is NOT enabled —
//          requires the current password plus the new password twice.
// @route   PATCH /api/users/me/password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body

    if (!newPassword || newPassword !== confirmNewPassword) {
        throw badRequest('New passwords do not match')
    }

    const user = await User.findById(req.user.id).select('+trustedDevices')
    if (!user) throw unauthorized('Not authorized')

    if (user.twoFactorEnabled) {
        throw forbidden('2FA is enabled on this account — use the verification code flow to change your password')
    }

    if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
        throw unauthorized('Incorrect current password')
    }

    await assertPasswordAcceptable(newPassword, { email: user.email, displayName: user.displayName })
    await applyNewPassword(user, newPassword, req)

    res.status(200).json({ message: 'Password updated', token: signSessionToken(user) })
})

// @desc    Send an email verification code to start a 2FA-gated password
//          change (step 1 of 2).
// @route   POST /api/users/me/password/2fa-challenge
// @access  Private
const requestPasswordChangeCode = asyncHandler(async (req, res) => {
    if (!req.user.twoFactorEnabled) {
        throw badRequest('2FA is not enabled on this account')
    }

    const code = generateOtp()
    req.user.twoFactorCodeHash = await hashOtp(code)
    req.user.twoFactorCodeExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
    req.user.twoFactorCodeAttempts = 0
    await req.user.save()

    await sendMail({
        to: req.user.email,
        subject: 'Homebase password change verification code',
        text: `Your Homebase verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`
    })

    res.status(200).json({ message: 'Verification code sent' })
})

// @desc    Verify the emailed code and set a new password (step 2 of 2 of
//          the 2FA-gated password change flow).
// @route   PATCH /api/users/me/password/2fa-confirm
// @access  Private
const confirmPasswordChangeWithCode = asyncHandler(async (req, res) => {
    const { code, newPassword, confirmNewPassword } = req.body

    if (!newPassword || newPassword !== confirmNewPassword) {
        throw badRequest('New passwords do not match')
    }

    const user = await User.findById(req.user.id)
        .select('+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodeAttempts +trustedDevices')
    if (!user) throw unauthorized('Not authorized')

    // Check the policy BEFORE consuming the one-time code, so a rejected
    // password doesn't force the user to request a fresh code.
    await assertPasswordAcceptable(newPassword, { email: user.email, displayName: user.displayName })

    const result = await verifyOtp(user, code)

    if (!result.ok) {
        await user.save()
        throw badRequest(result.reason)
    }

    await applyNewPassword(user, newPassword, req)

    res.status(200).json({ message: 'Password updated', token: signSessionToken(user) })
})

// @desc    Send an email verification code to start enabling 2FA (step 1 of 2).
// @route   POST /api/users/me/2fa/enable
// @access  Private
const requestEnable2FA = asyncHandler(async (req, res) => {
    if (req.user.twoFactorEnabled) {
        throw badRequest('2FA is already enabled')
    }

    const code = generateOtp()
    req.user.twoFactorCodeHash = await hashOtp(code)
    req.user.twoFactorCodeExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
    req.user.twoFactorCodeAttempts = 0
    await req.user.save()

    await sendMail({
        to: req.user.email,
        subject: 'Homebase two-factor setup code',
        text: `Your Homebase two-factor setup code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`
    })

    res.status(200).json({ message: 'Verification code sent to your email' })
})

// @desc    Verify the emailed code and turn 2FA on (step 2 of 2).
// @route   POST /api/users/me/2fa/verify
// @access  Private
const confirmEnable2FA = asyncHandler(async (req, res) => {
    const { code } = req.body

    const user = await User.findById(req.user.id)
        .select('+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodeAttempts +trustedDevices')
    if (!user) throw unauthorized('Not authorized')

    const result = await verifyOtp(user, code)

    if (!result.ok) {
        await user.save()
        throw badRequest(result.reason)
    }

    user.twoFactorEnabled = true
    // The browser that just enrolled is trusted; every other one is challenged.
    const newDeviceToken = trustDevice(user, { userAgent: req.get('user-agent') })
    await user.save()

    audit('user.2fa_enabled', { ...actorFrom(req), userId: user._id.toString() })

    res.status(200).json({ twoFactorEnabled: true, deviceToken: newDeviceToken })
})

// @desc    Disable 2FA. Password-gated since it lowers account security.
// @route   POST /api/users/me/2fa/disable
// @access  Private
const disable2FA = asyncHandler(async (req, res) => {
    const { password } = req.body

    const user = await User.findById(req.user.id).select('+trustedDevices')
    if (!user) throw unauthorized('Not authorized')

    if (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
        throw unauthorized('Incorrect password')
    }

    user.twoFactorEnabled = false
    revokeAllDevices(user)
    // Lowering the account's security bar invalidates sessions established
    // under the higher one.
    user.tokenVersion += 1
    await user.save()

    audit('user.2fa_disabled', { ...actorFrom(req), userId: user._id.toString() })

    res.status(200).json({ twoFactorEnabled: false, token: signSessionToken(user) })
})

// export controller functions so they can be connected to routes in userRoutes.js
module.exports = {
    registerUser,
    loginUser,
    loginWith2FA,
    logout,
    getMe,
    searchUsers,
    changeUsername,
    changePassword,
    requestPasswordChangeCode,
    confirmPasswordChangeWithCode,
    requestEnable2FA,
    confirmEnable2FA,
    disable2FA
}
