const express = require('express')
const router = express.Router()

const {
    registerUser, //POST creates new user account
    loginUser,    //POST validates credentials and returns JWT
    getMe         //GET returns the profile of the currently logged-in user
} = require('../controllers/userController')

const { protect } = require('../middleware/authMiddleware')

// POST - /api/users/
// Public — no token required. Accepts { name, email, password } in the request body.
// Registers a new user and returns a JWT so the client is authenticated immediately.
router.post('/', registerUser)

// POST /api/users/login
// Public — no token required. Accepts { email, password } in the request body.
// Validates credentials against the DB and returns a JWT on success.
router.post('/login', loginUser)

// GET /api/users/me
// Private — protect runs first and verifies the JWT from the Authorization header.
// If valid, req.user is set and getMe returns that user's profile data.
// If invalid or missing, protect rejects with a 401 before getMe ever runs.
router.get('/me', protect, getMe)

module.exports = router