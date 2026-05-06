const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const User = require('../models/userModel')

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

// @desc    Authenticate an existing user and return a token
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

        res.json({
            _id: user.id,
            name: user.displayName,
            email: user.email,
            token: generateToken(user._id)
        })
    } else {
        // no user found OR invalid credentials
        // same error in both cases to avoid leaking whether an email is registers or not
        res.status(400)
        throw new Error('Invalid Credentials')
    }
})

// @desc    Return the currently authenticated user's profile
// @route   GET /api/users/me
// @access  Private (requires a valid JWT — enforced by the `protect` middleware)
const getMe = asyncHandler(async (req, res) => {
    // req.user doesnt exsist by defualt, it is created and sent from the protect middlware
    // the protect middleware validates the JWT, decodes the user ID, and fetches the user from the DB
    const { _id, displayName, email, role } = await User.findById(req.user.id)

    res.status(200).json({
        id: _id,
        displayName,
        email,
        role
    })
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

// export controller functions so they can be connected to routes in userRoutes.js
// do not include generateToken as it is only intended to be used inside of the controller
module.exports = {
    registerUser,
    loginUser,
    getMe
}