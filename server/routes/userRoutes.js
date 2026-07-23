const express = require('express')
const router = express.Router()

const {
    registerUser, //POST creates new user account
    loginUser,    //POST validates credentials and returns JWT
    loginWith2FA, //POST completes a 2FA-challenged login
    logout,       //POST revokes the 2FA trust window server-side
    getMe,         //GET returns the profile of the currently logged-in user
    searchUsers,   //GET searches active users by email/displayName for sharing
    updateUserStatus, //PATCH updates user status and returns updated user object
    changeUsername,             //PATCH renames the current user (password-gated)
    changePassword,              //PATCH changes password when 2FA is off
    requestPasswordChangeCode,  //POST sends a 2FA password-change code
    confirmPasswordChangeWithCode, //PATCH verifies the code and sets the new password
    requestEnable2FA,           //POST sends a 2FA setup code
    confirmEnable2FA,           //POST verifies the code and turns 2FA on
    disable2FA                  //POST turns 2FA off (password-gated)
} = require('../controllers/userController')

const { protect, adminProtect } = require('../middleware/authMiddleware')
const { loginLimiter, otpRequestLimiter, otpVerifyLimiter } = require('../middleware/rateLimiters')

// POST - /api/users/
// Public — no token required. Accepts { name, email, password } in the request body.
// Registers a new user and returns a JWT so the client is authenticated immediately.
router.post('/', registerUser)

// POST /api/users/login
// Public — no token required. Accepts { email, password } in the request body.
// Validates credentials against the DB and returns a JWT on success, or — if the
// account has 2FA enabled and isn't within its trust window — a loginToken instead.
router.post('/login', loginLimiter, loginUser)

// POST /api/users/login/2fa
// Public — the loginToken (not a session JWT) is the credential here.
router.post('/login/2fa', otpVerifyLimiter, loginWith2FA)

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
router.get('/search', protect, searchUsers)

// PATCH /api/users/:id/status
// Private - adminProtect runs first, verifies JWT and user role
// If valid, req.user is set and updateUserRole updates the user's status
// If invalid or missing, protect rejects with a 401 before updateUserStatus ever runs.
router.patch('/:id/status', adminProtect, updateUserStatus)

// ── Self-service settings routes — all act on req.user.id, never req.params.id ──

router.patch('/me/username', protect, changeUsername)

router.patch('/me/password', protect, changePassword)
router.post('/me/password/2fa-challenge', protect, otpRequestLimiter, requestPasswordChangeCode)
router.patch('/me/password/2fa-confirm', protect, otpVerifyLimiter, confirmPasswordChangeWithCode)

router.post('/me/2fa/enable', protect, otpRequestLimiter, requestEnable2FA)
router.post('/me/2fa/verify', protect, otpVerifyLimiter, confirmEnable2FA)
router.post('/me/2fa/disable', protect, disable2FA)

module.exports = router
