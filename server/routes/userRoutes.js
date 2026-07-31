const express = require('express')
const router = express.Router()

const {
    registerUser, //POST creates new user account
    loginUser,    //POST validates credentials and returns JWT
    loginWith2FA, //POST completes a 2FA-challenged login
    logout,       //POST revokes the 2FA trust window server-side
    getMe,         //GET returns the profile of the currently logged-in user
    searchUsers,   //GET searches active users by email/displayName for sharing
    changeUsername,             //PATCH renames the current user (password-gated)
    changePassword,              //PATCH changes password when 2FA is off
    requestPasswordChangeCode,  //POST sends a 2FA password-change code
    confirmPasswordChangeWithCode, //PATCH verifies the code and sets the new password
    requestPasswordReset,       //POST emails a reset code (public)
    resetPasswordWithCode,      //POST verifies the reset code and sets a new password (public)
    requestEnable2FA,           //POST sends a 2FA setup code
    confirmEnable2FA,           //POST verifies the code and turns 2FA on
    disable2FA                  //POST turns 2FA off (password-gated)
} = require('../controllers/userController')

const { protect } = require('../middleware/authMiddleware')
const {
    loginLimiter,
    registerLimiter,
    otpRequestLimiter,
    otpVerifyLimiter,
    userSearchLimiter
} = require('../middleware/rateLimiters')

// POST - /api/users/
// Public — no token required. Accepts { name, email, password } in the request body.
// Registers a new user and returns a JWT so the client is authenticated immediately
// (the account is still `pending` and cannot use the platform until an admin
// approves it, so the token grants nothing on its own).
//
// Rate-limited: this is the only unauthenticated write endpoint, and each call
// costs a deliberately-expensive bcrypt cost-12 hash plus a row in the admin
// approval queue.
router.post('/', registerLimiter, registerUser)

// POST /api/users/login
// Public — no token required. Accepts { email, password } in the request body.
// Validates credentials against the DB and returns a JWT on success, or — if the
// account has 2FA enabled and isn't within its trust window — a loginToken instead.
router.post('/login', loginLimiter, loginUser)

// POST /api/users/login/2fa
// Public — the loginToken (not a session JWT) is the credential here.
router.post('/login/2fa', otpVerifyLimiter, loginWith2FA)

// POST /api/users/password/forgot
// Public — accepts { email } and emails a 6-digit reset code.
//
// Always answers with the SAME message whether or not that address is
// registered. On a private whitelist platform the membership list is itself
// sensitive, so this endpoint must not become a way to test who has an account.
//
// Rate-limited on the request side because it triggers outbound mail to an
// address the caller chose. The limiter is keyed by IP; a per-account resend
// cooldown in the controller covers the distributed case.
//
// NOTE: this and the route below are PUBLIC and must stay above the `/me/…`
// section, which is the private self-service prefix.
router.post('/password/forgot', otpRequestLimiter, requestPasswordReset)

// POST /api/users/password/reset
// Public — the emailed code is the credential, so no token is required or
// returned. Accepts { email, code, newPassword, confirmNewPassword }.
//
// Rate-limited on verification: a 6-digit code is only a million combinations,
// and this limiter plus OTP_MAX_ATTEMPTS per issued code is what bounds a
// brute-force attempt.
router.post('/password/reset', otpVerifyLimiter, resetPasswordWithCode)

// POST /api/users/logout
// Private — clears the 2FA trust window so the next login always re-challenges.
router.post('/logout', protect, logout)

// GET /api/users/me
// Private — protect runs first and verifies the JWT from the Authorization header.
// If valid, req.user is set and getMe returns that user's profile data.
// If invalid or missing, protect rejects with a 401 before getMe ever runs.
router.get('/me', protect, getMe)

// GET /api/users/search?q=<term>&fileId=<optional>
// Private — used by the file-sharing search modal to find active users by
// email or displayName. Excludes the requesting user themself.
//
// Rate-limited per ACCOUNT (not per IP): this endpoint returns real names and
// email addresses, and on a private whitelist platform the membership list is
// itself sensitive. The limit bounds how much of the directory any one user can
// extract. A 3-character minimum query is enforced in the controller.
router.get('/search', protect, userSearchLimiter, searchUsers)

// NOTE: PATCH /:id/status moved to routes/adminRoutes.js as
// PATCH /api/admin/users/:id/status — all admin endpoints live under /api/admin.

// ── Self-service settings routes — all act on req.user.id, never req.params.id ──

router.patch('/me/username', protect, changeUsername)

router.patch('/me/password', protect, changePassword)
router.post('/me/password/2fa-challenge', protect, otpRequestLimiter, requestPasswordChangeCode)
router.patch('/me/password/2fa-confirm', protect, otpVerifyLimiter, confirmPasswordChangeWithCode)

router.post('/me/2fa/enable', protect, otpRequestLimiter, requestEnable2FA)
router.post('/me/2fa/verify', protect, otpVerifyLimiter, confirmEnable2FA)
router.post('/me/2fa/disable', protect, disable2FA)

module.exports = router
