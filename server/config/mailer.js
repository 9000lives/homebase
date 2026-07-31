const nodemailer = require('nodemailer')
const { HttpError } = require('../utils/httpError')
const { log } = require('../utils/logger')
const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM
} = require('../config/env')

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
    }
})

// Delivery failures are translated into a 503 with a safe, actionable message.
//
// Without this, an SMTP outage surfaced as a bare 500 on the login route: the
// provider's raw rejection ("550 Invalid `to` field…") became the error message
// and, before the error handler was fixed, shipped with a stack trace. The real
// reason is logged; the client is told to retry.
const sendMail = async ({ to, subject, text, html }) => {
    try {
        return await transporter.sendMail({
            from: SMTP_FROM,
            to,
            subject,
            text,
            html
        })
    } catch (error) {
        // Log the recipient and the provider's reason, never the message body —
        // verification codes travel in `text`.
        log.error('mail delivery failed', {
            to,
            subject,
            error: { name: error.name, message: error.message, code: error.code }
        })
        throw new HttpError(503, 'Could not send the verification email. Please try again shortly.')
    }
}

module.exports = { transporter, sendMail }
