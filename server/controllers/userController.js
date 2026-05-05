const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const User = require('../models/userModel')

const registerUser = asyncHandler(async (req, res) => {
    
    const {name, email, password} = req.body

    if(!name || !email || !password) {
        
    }
})