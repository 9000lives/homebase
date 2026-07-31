// Server-side password policy.
//
// Applied identically at registration AND on both password-change paths — a
// policy enforced only at registration is trivially bypassed by registering
// weakly and never changing, or by changing to a weak value afterward.
//
// Length is weighted over composition rules deliberately: mandatory character
// classes push users toward predictable patterns (`Password1!`) without adding
// real entropy. The breach check does far more work than any complexity rule.

const crypto = require('crypto')
const { badRequest } = require('./httpError')
const { PASSWORD_MIN_LENGTH, PASSWORD_BREACH_CHECK } = require('../config/env')
const { log } = require('./logger')

// bcrypt silently truncates at 72 bytes, so anything beyond that adds no
// strength — reject rather than accept a password that is partly ignored.
const MAX_PASSWORD_BYTES = 72

// A short list of the passwords that dominate every credential-stuffing
// wordlist. The HIBP check below is the real defence; this catches the worst
// offenders even when that check is disabled or unreachable.
const COMMON_PASSWORDS = new Set([
    'password', 'password1', 'password123', 'passw0rd', '123456', '1234567',
    '12345678', '123456789', '1234567890', 'qwerty', 'qwerty123', 'letmein',
    'welcome', 'welcome1', 'admin', 'administrator', 'iloveyou', 'monkey',
    'dragon', 'sunshine', 'princess', 'football', 'baseball', 'abc123',
    'trustno1', 'changeme', 'starwars', 'whatever', 'homebase', 'homebase1'
])

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

// Rejects a password that is essentially the user's own identity. Compared on
// a normalized form so `J.Doe@mail.com` still catches `jdoe2024`.
const resemblesIdentity = (password, { email, displayName }) => {
    const candidate = normalize(password)
    if (candidate.length < 4) return false

    const parts = []
    if (email) parts.push(email.split('@')[0], email)
    if (displayName) parts.push(displayName)

    return parts
        .map(normalize)
        .filter((part) => part.length >= 4)
        .some((part) => candidate.includes(part) || part.includes(candidate))
}

// Have I Been Pwned range API, k-anonymity mode: only the first 5 characters
// of the SHA-1 hash are sent, so the password itself never leaves this server
// and the API cannot tell which of the ~800 returned hashes was ours.
//
// Fails OPEN on any network problem — an outage at a third party must not
// block registration or a password change. That is a deliberate availability
// trade-off, logged so it is visible rather than silent.
const isBreachedPassword = async (password) => {
    if (!PASSWORD_BREACH_CHECK) return false

    const sha1 = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)

    try {
        const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: { 'Add-Padding': 'true', 'User-Agent': 'Homebase-PasswordPolicy' },
            signal: AbortSignal.timeout(2500)
        })
        if (!response.ok) {
            log.warn('breach check unavailable', { status: response.status })
            return false
        }

        const body = await response.text()
        for (const line of body.split('\n')) {
            const [hashSuffix, count] = line.trim().split(':')
            if (hashSuffix === suffix && Number(count) > 0) return true
        }
        return false
    } catch (error) {
        log.warn('breach check failed, allowing password', { error: error.message })
        return false
    }
}

// Throws a 400 HttpError describing the first rule the password fails.
// `identity` supplies the email/displayName to compare against.
const assertPasswordAcceptable = async (password, identity = {}) => {
    if (typeof password !== 'string' || !password) {
        throw badRequest('Password is required')
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
        throw badRequest(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
        throw badRequest(`Password must be at most ${MAX_PASSWORD_BYTES} bytes`)
    }
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        throw badRequest('That password is too common. Please choose a different one.')
    }
    if (resemblesIdentity(password, identity)) {
        throw badRequest('Password must not be based on your name or email address')
    }
    if (await isBreachedPassword(password)) {
        throw badRequest(
            'That password has appeared in a known data breach. Please choose a different one.'
        )
    }
}

module.exports = {
    PASSWORD_MIN_LENGTH,
    MAX_PASSWORD_BYTES,
    assertPasswordAcceptable,
    isBreachedPassword
}
