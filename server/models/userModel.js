const mongoose = require('mongoose')
const { MAX_NAME_LENGTH } = require('../utils/names')

const roleEnum = {
  values: ['user', 'admin'],
  message: 'enum validator failed for path `{PATH}` with value `{VALUE}`'
}
const statusEnum = {
  values: ['pending', 'active', 'suspended'],
  message: 'enum validator failed for path `{PATH}` with value `{VALUE}`'
}

// A device that has completed a 2FA challenge and may skip it until expiry.
// See utils/deviceTrust.js — the token is stored hashed, never in plaintext.
const trustedDeviceSchema = mongoose.Schema({
        tokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date, default: Date.now },
        userAgent: { type: String, default: null, maxlength: 200 }
}, { _id: false })

const userSchema = mongoose.Schema({
        email: {
            type: String,
            required: [true, 'Please add an email'],
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: [254, 'Email address is too long']   // RFC 5321 maximum
        },
        passwordHash: {
            type: String,
            required: true
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
            maxlength: [MAX_NAME_LENGTH, 'Display name is too long']
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
        // Bumped whenever every existing session must stop working: password
        // change, password reset, 2FA disable, logout, and the admin
        // revoke-sessions / reset-2fa actions. `protect` compares it against
        // the `tv` claim in the presented token, which costs nothing extra
        // because protect already loads this document on every request.
        tokenVersion: {
            type: Number,
            default: 0
        },
        twoFactorEnabled: {
            type: Boolean,
            default: false
        },
        // Watermark for the announcement feed: everything created at or before
        // this instant has been seen. Same idea as tokenVersion — one cheap
        // scalar that settles a whole class of "has this been handled?" without
        // an array that grows forever on the document `protect` loads on every
        // authenticated request.
        //
        // null means "has seen nothing", so existing accounts correctly receive
        // the next announcement without a migration.
        lastSeenAnnouncementAt: {
            type: Date,
            default: null
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
        // A SECOND code slot, deliberately not the three fields above.
        //
        // Sharing one slot would mean a password-reset request silently
        // clobbering a 2FA login challenge already in flight, and — worse — a
        // code issued for one purpose being redeemable for the other. See the
        // header comment in utils/otp.js.
        passwordResetCodeHash: {
            type: String,
            default: null,
            select: false
        },
        passwordResetExpires: {
            type: Date,
            default: null,
            select: false
        },
        passwordResetAttempts: {
            type: Number,
            default: 0,
            select: false
        },
        // Replaces the old account-wide `twoFactorTrustedUntil` Date, which
        // granted trust to anyone holding the password rather than to the
        // device that actually passed the challenge.
        trustedDevices: {
            type: [trustedDeviceSchema],
            default: [],
            select: false
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
})

// Backs the sharing search and the admin account list.
userSchema.index({ status: 1 })

module.exports = mongoose.model('User', userSchema)
