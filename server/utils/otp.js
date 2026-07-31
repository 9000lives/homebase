// Emailed one-time codes.
//
// TWO SEPARATE CODE SLOTS, and the separation is load-bearing.
//
// Every OTP in this app used to live in the same three User fields, with no
// record of what the code had been issued FOR. That was survivable while all
// the callers were 2FA-shaped, but password reset breaks it two ways:
//
//   Functionally — requesting a reset would silently overwrite a 2FA login
//   challenge already in flight, and vice versa. Two flows, one slot.
//
//   Security — a code minted for one purpose would be redeemable for another.
//   Someone phished into reading out "your Homebase login code" would be
//   handing over a working password-reset credential.
//
// So each purpose gets its own field set, and every function here takes the set
// it operates on. The parameter defaults to the 2FA fields so the pre-existing
// call sites read exactly as they did before.

const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const OTP_LENGTH = 6
const OTP_TTL_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5

// The two slots. A new purpose gets a new set here — never a third consumer of
// an existing one.
const TWO_FACTOR_FIELDS = {
    hash: 'twoFactorCodeHash',
    expires: 'twoFactorCodeExpires',
    attempts: 'twoFactorCodeAttempts'
}

const PASSWORD_RESET_FIELDS = {
    hash: 'passwordResetCodeHash',
    expires: 'passwordResetExpires',
    attempts: 'passwordResetAttempts'
}

// numeric-only — easy to type from an email on mobile, no ambiguous characters
const generateOtp = () => {
    return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0')
}

const hashOtp = async (code) => {
    const salt = await bcrypt.genSalt(10)
    return bcrypt.hash(code, salt)
}

// Mint a code into one slot and return the plaintext — the only moment it
// exists unhashed, so the caller must mail it and drop it.
//
// This was four identical lines copy-pasted at every issue site. Consolidated
// because the copies are how the expiry or the attempt reset eventually gets
// forgotten at one of them: a code minted without `attempts = 0` inherits the
// previous code's failed attempts and can be locked out before its first use.
//
// Caller is responsible for .save()-ing.
const issueOtp = async (user, fields = TWO_FACTOR_FIELDS) => {
    const code = generateOtp()

    user[fields.hash] = await hashOtp(code)
    user[fields.expires] = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
    user[fields.attempts] = 0

    return code
}

// Clears a pending code off a user doc. Caller is responsible for .save()-ing.
const clearOtp = (user, fields = TWO_FACTOR_FIELDS) => {
    user[fields.hash] = null
    user[fields.expires] = null
    user[fields.attempts] = 0
}

// Checks `code` against the pending OTP in one slot, mutating attempt/clear
// state as a side effect. Caller is responsible for .save()-ing afterward
// regardless of the outcome, since attempts/clearing need to persist either way.
//
// A code is only ever checked against the slot it was issued into, so a login
// code presented to the reset flow reads as "no code requested" rather than
// verifying against the wrong purpose.
const verifyOtp = async (user, code, fields = TWO_FACTOR_FIELDS) => {
    if (!user[fields.hash] || !user[fields.expires]) {
        return { ok: false, reason: 'No verification code was requested.' }
    }
    if (user[fields.expires] < new Date()) {
        clearOtp(user, fields)
        return { ok: false, reason: 'Verification code has expired.' }
    }
    if (user[fields.attempts] >= OTP_MAX_ATTEMPTS) {
        clearOtp(user, fields)
        return { ok: false, reason: 'Too many failed attempts. Please request a new code.' }
    }

    // bcrypt.compare rejects a non-string outright rather than throwing, so a
    // structured body like {"code": {"$ne": null}} fails here as a mismatch.
    const match = await bcrypt.compare(typeof code === 'string' ? code : '', user[fields.hash])
    if (!match) {
        user[fields.attempts] += 1
        return { ok: false, reason: 'Incorrect verification code.' }
    }

    clearOtp(user, fields)
    return { ok: true }
}

module.exports = {
    generateOtp,
    hashOtp,
    issueOtp,
    verifyOtp,
    clearOtp,
    TWO_FACTOR_FIELDS,
    PASSWORD_RESET_FIELDS,
    OTP_TTL_MINUTES,
    OTP_MAX_ATTEMPTS
}
