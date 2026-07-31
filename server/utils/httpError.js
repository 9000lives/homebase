// Typed HTTP errors.
//
// The previous pattern — `res.status(400); throw new Error(msg)` — relies on
// remembering a side effect on `res` before an unrelated `throw`. Forgetting it
// silently produced a 500 (and, before the error handler was fixed, a stack
// trace). Carrying the status on the error itself makes that impossible.
//
// `expose` marks a message as safe to return to the client. Deliberately-thrown
// validation errors are; unexpected 500s are not.

class HttpError extends Error {
    constructor(status, message, { expose = status < 500, code } = {}) {
        super(message)
        this.name = 'HttpError'
        this.status = status
        this.expose = expose
        if (code) this.code = code
        Error.captureStackTrace?.(this, HttpError)
    }
}

const badRequest = (message, opts) => new HttpError(400, message, opts)
const unauthorized = (message = 'Not authorized', opts) => new HttpError(401, message, opts)
const forbidden = (message = 'Not authorized', opts) => new HttpError(403, message, opts)
const notFound = (message = 'Not found', opts) => new HttpError(404, message, opts)
const conflict = (message, opts) => new HttpError(409, message, opts)
const payloadTooLarge = (message, opts) => new HttpError(413, message, opts)
const unsupportedMediaType = (message, opts) => new HttpError(415, message, opts)
const tooManyRequests = (message, opts) => new HttpError(429, message, opts)

module.exports = {
    HttpError,
    badRequest,
    unauthorized,
    forbidden,
    notFound,
    conflict,
    payloadTooLarge,
    unsupportedMediaType,
    tooManyRequests
}
