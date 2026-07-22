const mongoose = require('mongoose')
const roleEnum = {
  values: ['user', 'admin'],
  message: 'enum validator failed for path `{PATH}` with value `{VALUE}`'
}
const statusEnum = {
  values: ['pending', 'active', 'suspended'],
  message: 'enum validator failed for path `{PATH}` with value `{VALUE}`'    
}

const userSchema = mongoose.Schema({
        email: {
            type: String,
            required: [true, 'Please add an email'],
            unique: true,
            lowercase: true,
            trim: true
        },
        passwordHash: {
            type: String,
            required: true
        },
        displayName: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: roleEnum,
            default: 'user'
        },
        status: {
            type: String,
            enum: statusEnum,
            default: 'pending'
        },
        twoFactorEnabled: {
            type: Boolean,
            default: false
        },
        twoFactorCodeHash: {
            type: String,
            default: null,
            select: false
        },
        twoFactorCodeExpires: {
            type: Date,
            default: null,
            select: false
        },
        twoFactorCodeAttempts: {
            type: Number,
            default: 0,
            select: false
        },
        twoFactorTrustedUntil: {
            type: Date,
            default: null
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
})

module.exports = mongoose.model('User', userSchema)