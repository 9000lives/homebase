const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const OTP_LENGTH = 6
const OTP_TTL_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5

// numeric-only — easy to type from an email on mobile, no ambiguous characters
const generateOtp = () => {
    return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0')
}

const hashOtp = async (code) => {
    const salt = await bcrypt.genSalt(10)
    return bcrypt.hash(code, salt)
}

// Clears any pending code off a user doc. Caller is responsible for .save()-ing.
const clearOtp = (user) => {
    user.twoFactorCodeHash = null
    user.twoFactorCodeExpires = null
    user.twoFactorCodeAttempts = 0
}

// Checks `code` against the pending OTP on `user`, mutating attempt/clear state
// as a side effect. Caller is responsible for .save()-ing afterward regardless
// of the outcome, since attempts/clearing need to persist either way.
const verifyOtp = async (user, code) => {
    if (!user.twoFactorCodeHash || !user.twoFactorCodeExpires) {
        return { ok: false, reason: 'No verification code was requested.' }
    }
    if (user.twoFactorCodeExpires < new Date()) {
        clearOtp(user)
        return { ok: false, reason: 'Verification code has expired.' }
    }
    if (user.twoFactorCodeAttempts >= OTP_MAX_ATTEMPTS) {
        clearOtp(user)
        return { ok: false, reason: 'Too many failed attempts. Please request a new code.' }
    }

    const match = await bcrypt.compare(code, user.twoFactorCodeHash)
    if (!match) {
        user.twoFactorCodeAttempts += 1
        return { ok: false, reason: 'Incorrect verification code.' }
    }

    clearOtp(user)
    return { ok: true }
}

module.exports = { generateOtp, hashOtp, verifyOtp, clearOtp, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS }
