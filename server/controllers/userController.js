const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const User = require('../models/userModel')
const req = require('express/lib/request')
const { sendMail } = require('../config/mailer')
const { generateOtp, hashOtp, verifyOtp, OTP_TTL_MINUTES } = require('../utils/otp')

const TRUST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// @desc    Register a new user
// @route   POST /api/users/
// @access  Public (no token required)
const registerUser = asyncHandler(async (req, res) => {

    // destructure fields from the JSON body
    const {name: displayName, email: rawEmail, password} = req.body
    // change the email to lowercase so when we comapre it to
    // the database it matches schema
    const email = rawEmail.toLowerCase()

    // make sure all fields are present
    if(!displayName|| !email || !password) {
        throw new Error("Please fill all fields")
    }

    //Check if a user with this email already exists
    const userExists = await User.findOne({ email })
    if(userExists) {
        res.status(400)
        throw new Error('User already exsists')
    }

    const salt = await bcrypt.genSalt(12)
    const passwordHash = await bcrypt.hash(password, salt)

    const user = await User.create({ displayName, email, passwordHash })

    if(user) {
        res.status(201).json({
            _id: user.id,
            name: user.displayName,
            email: user.email,
            token: generateToken(user._id)
        })
    }
    else {
        res.status(400)
        throw new Error('Invalid user data')
    }
})

// @desc    Authenticate an existing user and return a token.
//          If the account has 2FA enabled and isn't within its 7-day trust
//          window, this sends an email code and returns a loginToken instead
//          of a real token — see loginWith2FA for the second step.
// @route   POST /api/users/login/
// @access  Public (no token required)
const loginUser = asyncHandler(async (req, res) => {

    // destructure credentials from the JSON body
    const {email: rawEmail, password} = req.body
    // change the email to lowercase to match DB schema
    const email = rawEmail.toLowerCase()


    const user = await User.findOne({ email })

    if(user && (await bcrypt.compare(password, user.passwordHash))) {
        //credentials are valid

        const isTrusted = user.twoFactorTrustedUntil && user.twoFactorTrustedUntil > new Date()

        if (user.twoFactorEnabled && !isTrusted) {
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

            return res.status(200).json({
                twoFactorRequired: true,
                loginToken: generatePreAuthToken(user._id)
            })
        }

        res.json({
            _id: user.id,
            name: user.displayName,
            email: user.email,
            token: generateToken(user._id),
            twoFactorEnabled: user.twoFactorEnabled
        })
    } else {
        // no user found OR invalid credentials
        // same error in both cases to avoid leaking whether an email is registers or not
        res.status(400)
        throw new Error('Invalid Credentials')
    }
})

// @desc    Complete a 2FA-challenged login by verifying the emailed code.
// @route   POST /api/users/login/2fa
// @access  Public (the loginToken, not a session JWT, is the credential here)
const loginWith2FA = asyncHandler(async (req, res) => {
    const { loginToken, code } = req.body

    let decoded
    try {
        decoded = jwt.verify(loginToken, process.env.JWT_SECRET)
    } catch (error) {
        res.status(401)
        throw new Error('Login session expired, please sign in again')
    }

    if (decoded.scope !== 'login-2fa') {
        res.status(401)
        throw new Error('Invalid login session')
    }

    const user = await User.findById(decoded.id)
        .select('+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodeAttempts')

    if (!user) {
        res.status(401)
        throw new Error('Invalid login session')
    }

    const result = await verifyOtp(user, code)

    if (!result.ok) {
        await user.save()
        res.status(400)
        throw new Error(result.reason)
    }

    user.twoFactorTrustedUntil = new Date(Date.now() + TRUST_WINDOW_MS)
    await user.save()

    res.json({
        _id: user.id,
        name: user.displayName,
        email: user.email,
        token: generateToken(user._id)
    })
})

// @desc    Sign the current user out server-side. Revokes the 2FA "remember
//          this login for a week" trust window, so a manual sign-out always
//          forces the challenge again next time — unlike letting a session
//          simply expire.
// @route   POST /api/users/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
    req.user.twoFactorTrustedUntil = null
    await req.user.save()
    res.status(200).json({ message: 'Logged out' })
})

// @desc    Update a user status
// @route   PATCH /api/admin/users/:id/status
// @access  Private (requires valid JWT, and admin role - enforced by the `adminProtect` middlware)
const updateUserStatus = asyncHandler(async (req, res) => {

    const { status } = req.body

    const user = await User.findById(req.params.id)

    //update just the role then call save() so that our mongoose validation runs
    user.status = status
    const updatedUser = await user.save()

    res.status(200).json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        status: updatedUser.status
    })
})

// @desc    Return the currently authenticated user's profile
// @route   GET /api/users/me
// @access  Private (requires a valid JWT — enforced by the `protect` middleware)
const getMe = asyncHandler(async (req, res) => {
    // req.user doesnt exsist by defualt, it is created and sent from the protect middlware
    // the protect middleware validates the JWT, decodes the user ID, and fetches the user from the DB
    const { _id, displayName, email, role, twoFactorEnabled } = await User.findById(req.user.id)

    res.status(200).json({
        id: _id,
        displayName,
        email,
        role,
        twoFactorEnabled
    })
})

// @desc    Change the current user's display name (their "username").
//          Password-gated; not affected by 2FA either way.
// @route   PATCH /api/users/me/username
// @access  Private
const changeUsername = asyncHandler(async (req, res) => {
    const { password, displayName } = req.body

    const user = await User.findById(req.user.id)

    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
        res.status(401)
        throw new Error('Incorrect password')
    }

    const trimmedName = (displayName || '').trim()
    if (!trimmedName) {
        res.status(400)
        throw new Error('Display name cannot be empty')
    }

    user.displayName = trimmedName
    await user.save()

    res.status(200).json({
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role
    })
})

// @desc    Change the current user's password when 2FA is NOT enabled —
//          requires the current password plus the new password twice.
// @route   PATCH /api/users/me/password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body

    if (!newPassword || newPassword !== confirmNewPassword) {
        res.status(400)
        throw new Error('New passwords do not match')
    }

    const user = await User.findById(req.user.id)

    if (user.twoFactorEnabled) {
        res.status(403)
        throw new Error('2FA is enabled on this account — use the verification code flow to change your password')
    }

    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
        res.status(401)
        throw new Error('Incorrect current password')
    }

    const salt = await bcrypt.genSalt(12)
    user.passwordHash = await bcrypt.hash(newPassword, salt)
    await user.save()

    res.status(200).json({ message: 'Password updated' })
})

// @desc    Send an email verification code to start a 2FA-gated password
//          change (step 1 of 2).
// @route   POST /api/users/me/password/2fa-challenge
// @access  Private
const requestPasswordChangeCode = asyncHandler(async (req, res) => {
    if (!req.user.twoFactorEnabled) {
        res.status(400)
        throw new Error('2FA is not enabled on this account')
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
        res.status(400)
        throw new Error('New passwords do not match')
    }

    const user = await User.findById(req.user.id)
        .select('+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodeAttempts')

    const result = await verifyOtp(user, code)

    if (!result.ok) {
        await user.save()
        res.status(400)
        throw new Error(result.reason)
    }

    const salt = await bcrypt.genSalt(12)
    user.passwordHash = await bcrypt.hash(newPassword, salt)
    await user.save()

    res.status(200).json({ message: 'Password updated' })
})

// @desc    Send an email verification code to start enabling 2FA (step 1 of 2).
// @route   POST /api/users/me/2fa/enable
// @access  Private
const requestEnable2FA = asyncHandler(async (req, res) => {
    if (req.user.twoFactorEnabled) {
        res.status(400)
        throw new Error('2FA is already enabled')
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
        .select('+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodeAttempts')

    const result = await verifyOtp(user, code)

    if (!result.ok) {
        await user.save()
        res.status(400)
        throw new Error(result.reason)
    }

    user.twoFactorEnabled = true
    user.twoFactorTrustedUntil = new Date(Date.now() + TRUST_WINDOW_MS)
    await user.save()

    res.status(200).json({ twoFactorEnabled: true })
})

// @desc    Disable 2FA. Password-gated since it lowers account security.
// @route   POST /api/users/me/2fa/disable
// @access  Private
const disable2FA = asyncHandler(async (req, res) => {
    const { password } = req.body

    const user = await User.findById(req.user.id)

    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
        res.status(401)
        throw new Error('Incorrect password')
    }

    user.twoFactorEnabled = false
    user.twoFactorTrustedUntil = null
    await user.save()

    res.status(200).json({ twoFactorEnabled: false })
})

// Helper: Generate a signed JSON Web Token (JWT)
// Called after successful registration and login.
const generateToken = (id) => {
    return jwt.sign(
        { id },                      // Payload — the data embedded inside the token (kept minimal: just the user ID)
        process.env.JWT_SECRET,      // Secret key used to sign the token — must be kept private on the server; anyone with this key can forge tokens
        {
            expiresIn: '7d'         // Expiry — token becomes invalid after 7 days, forcing re-login and limiting the window of damage if a token is ever stolen
        }
    )
}

// Helper: Generate a short-lived token identifying which login is pending a
// 2FA challenge. Distinct `scope` keeps it from being usable as a real
// session token even though it's signed with the same secret.
const generatePreAuthToken = (id) => {
    return jwt.sign(
        { id, scope: 'login-2fa' },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
    )
}

// export controller functions so they can be connected to routes in userRoutes.js
// do not include generateToken/generatePreAuthToken as they are only intended to be used inside of the controller
module.exports = {
    registerUser,
    loginUser,
    loginWith2FA,
    logout,
    getMe,
    updateUserStatus,
    changeUsername,
    changePassword,
    requestPasswordChangeCode,
    confirmPasswordChangeWithCode,
    requestEnable2FA,
    confirmEnable2FA,
    disable2FA
}
