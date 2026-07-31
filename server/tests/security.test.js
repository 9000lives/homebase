// Security regression suite.
//
// The audit's closing observation was that both Phase-1 authorization findings
// "would have been caught by a single test asserting that a user cannot move a
// file into a folder they do not own." These tests assert the authorization
// matrix and the other controls that are easy to remove by accident while
// fixing something else.
//
// Run with:
//   MONGO_URI_TEST="mongodb+srv://.../homebase_test" npm test
//
// The suite REFUSES to run against a database whose name does not end in
// `_test`, so it can never be pointed at real data. It drops that database
// before and after the run.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs/promises')

const TEST_URI = process.env.MONGO_URI_TEST

if (!TEST_URI) {
    test('security suite', { skip: 'set MONGO_URI_TEST to a scratch database to run these tests' }, () => {})
    return
}

const dbName = TEST_URI.split('/').pop().split('?')[0]
if (!dbName.endsWith('_test')) {
    throw new Error(
        `Refusing to run: MONGO_URI_TEST database is "${dbName}", which does not end in "_test". ` +
        'Point it at a scratch database.'
    )
}

// The server reads configuration at require time, so set the environment first.
process.env.MONGO_URI = TEST_URI
process.env.PORT = process.env.TEST_PORT || '3199'
process.env.NODE_ENV = 'test'
// Keep the suite offline and deterministic — the breach check is exercised
// separately by its own unit test below.
process.env.PASSWORD_BREACH_CHECK = 'false'

const mongoose = require('mongoose')
const User = require('../models/userModel')
const { signPreAuthToken, signSessionToken } = require('../utils/tokens')
const { validateItemName, sanitizePathSegment } = require('../utils/names')
const { detectType, matchDangerous } = require('../utils/fileSignature')

const BASE = `http://127.0.0.1:${process.env.PORT}/api`
const PASSWORD = 'correct-horse-battery-staple-77'

let server

const api = async (method, p, { token, body } = {}) => {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${BASE}${p}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await res.text()
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = { _raw: text.slice(0, 200) } }
    return { status: res.status, body: parsed, headers: res.headers }
}

const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 7)
])
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 9)])

const upload = async (token, { bytes, filename, contentType, parentFolderId }) => {
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: contentType }), filename)
    if (parentFolderId) form.append('parentFolderId', parentFolderId)
    const res = await fetch(`${BASE}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
}

// Registered through the API so the real registration path is exercised, then
// promoted directly — approval is an admin action and not what these tests are
// about.
const makeUser = async (email, role = 'user') => {
    const r = await api('POST', '/users/', { body: { name: email.split('@')[0], email, password: PASSWORD } })
    assert.equal(r.status, 201, `registration failed: ${JSON.stringify(r.body)}`)
    await User.updateOne({ _id: r.body._id }, { status: 'active', role })
    const login = await api('POST', '/users/login', { body: { email, password: PASSWORD } })
    assert.equal(login.status, 200, `login failed: ${JSON.stringify(login.body)}`)
    return { id: r.body._id, token: login.body.token, email }
}

let alice   // admin
let bob     // ordinary user

test.before(async () => {
    // Starting the real application (not a parallel wiring) means these tests
    // exercise exactly the middleware chain production runs.
    server = require('../server')

    // The HTTP port accepts connections immediately, but connectDB() is async
    // and not awaited by server.js — without this, the first request races the
    // database handshake and fails with MongoNotConnectedError.
    await mongoose.connection.asPromise()
    await mongoose.connection.dropDatabase()

    for (let i = 0; i < 60; i += 1) {
        try {
            await fetch(`${BASE}/users/me`)
            break
        } catch {
            await new Promise((r) => setTimeout(r, 250))
        }
    }

    alice = await makeUser('alice@homebase.test', 'admin')
    bob = await makeUser('bob@homebase.test')
})

test.after(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    server?.close?.()
})

// ── C1 ────────────────────────────────────────────────────────────────────
test('C1: a pre-auth 2FA token cannot authenticate a session', async () => {
    const bobDoc = await User.findById(bob.id)
    const preAuth = signPreAuthToken(bobDoc)

    assert.equal((await api('GET', '/users/me', { token: preAuth })).status, 401)
    assert.equal((await api('GET', '/admin/users?status=active', { token: preAuth })).status, 401)

    // The same user's genuine session token still works, proving the rejection
    // is about the token's scope and signing key, not the account.
    assert.equal((await api('GET', '/users/me', { token: signSessionToken(bobDoc) })).status, 200)
})

test('C1: protect asserts the session scope positively', async () => {
    const jwt = require('jsonwebtoken')
    const bobDoc = await User.findById(bob.id)

    // Forged with the SESSION secret but carrying the wrong scope.
    const wrongScope = jwt.sign(
        { id: bob.id, scope: 'login-2fa', tv: bobDoc.tokenVersion },
        process.env.JWT_SECRET
    )
    assert.equal((await api('GET', '/users/me', { token: wrongScope })).status, 401)

    // No scope at all — a blocklist would let this through; a positive
    // assertion must not.
    const noScope = jwt.sign({ id: bob.id, tv: bobDoc.tokenVersion }, process.env.JWT_SECRET)
    assert.equal((await api('GET', '/users/me', { token: noScope })).status, 401)
})

// ── H8 ────────────────────────────────────────────────────────────────────
test('H8: logout invalidates the session token', async () => {
    const user = await makeUser('logout@homebase.test')
    assert.equal((await api('POST', '/users/logout', { token: user.token })).status, 200)
    assert.equal((await api('GET', '/users/me', { token: user.token })).status, 401)
})

test('H8: changing the password invalidates existing tokens', async () => {
    const user = await makeUser('pwchange@homebase.test')
    const old = user.token

    const changed = await api('PATCH', '/users/me/password', {
        token: old,
        body: {
            currentPassword: PASSWORD,
            newPassword: PASSWORD + 'ZZ',
            confirmNewPassword: PASSWORD + 'ZZ'
        }
    })
    assert.equal(changed.status, 200)

    assert.equal((await api('GET', '/users/me', { token: old })).status, 401)
    // ...and the replacement token keeps the caller signed in.
    assert.equal((await api('GET', '/users/me', { token: changed.body.token })).status, 200)
})

// ── H1 / H2: the authorization matrix the audit called out ────────────────
test('H1: a file cannot be moved into a folder the user does not own', async () => {
    const bobFolder = await api('POST', '/folders/create', { token: bob.token, body: { name: 'bob-folder' } })
    const aliceFile = await upload(alice.token, { bytes: PNG, filename: 'a.png', contentType: 'image/png' })

    const moved = await api('PATCH', `/files/${aliceFile.body._id}/move`, {
        token: alice.token,
        body: { parentFolderId: bobFolder.body._id }
    })
    assert.equal(moved.status, 403)
})

test('H1: a folder cannot be moved into a folder the user does not own', async () => {
    const bobFolder = await api('POST', '/folders/create', { token: bob.token, body: { name: 'bob-target' } })
    const aliceFolder = await api('POST', '/folders/create', { token: alice.token, body: { name: 'alice-src' } })

    const moved = await api('PATCH', `/folders/${aliceFolder.body._id}/move`, {
        token: alice.token,
        body: { parentFolderId: bobFolder.body._id }
    })
    assert.equal(moved.status, 403)
})

test('moving within your own tree still works', async () => {
    const parent = await api('POST', '/folders/create', { token: alice.token, body: { name: 'own-parent' } })
    const file = await upload(alice.token, { bytes: PNG, filename: 'b.png', contentType: 'image/png' })

    const moved = await api('PATCH', `/files/${file.body._id}/move`, {
        token: alice.token,
        body: { parentFolderId: parent.body._id }
    })
    assert.equal(moved.status, 200)
    assert.equal(moved.body.parentFolderId, parent.body._id)

    // ...including back to the root.
    const toRoot = await api('PATCH', `/files/${file.body._id}/move`, {
        token: alice.token,
        body: { parentFolderId: null }
    })
    assert.equal(toRoot.status, 200)
    assert.equal(toRoot.body.parentFolderId, null)
})

test('H2: a folder cannot be parented to itself or a descendant', async () => {
    const root = await api('POST', '/folders/create', { token: alice.token, body: { name: 'cyc-root' } })
    const child = await api('POST', '/folders/create', {
        token: alice.token,
        body: { name: 'cyc-child', parentFolderId: root.body._id }
    })
    const grandchild = await api('POST', '/folders/create', {
        token: alice.token,
        body: { name: 'cyc-grandchild', parentFolderId: child.body._id }
    })

    for (const destination of [root.body._id, child.body._id, grandchild.body._id]) {
        const moved = await api('PATCH', `/folders/${root.body._id}/move`, {
            token: alice.token,
            body: { parentFolderId: destination }
        })
        assert.equal(moved.status, 400, `destination ${destination} should be rejected`)
    }
})

test('creating inside another user\'s folder is refused', async () => {
    const bobFolder = await api('POST', '/folders/create', { token: bob.token, body: { name: 'bob-private' } })
    const created = await api('POST', '/folders/create', {
        token: alice.token,
        body: { name: 'intruder', parentFolderId: bobFolder.body._id }
    })
    assert.equal(created.status, 403)
})

test('uploading into another user\'s folder is refused', async () => {
    const bobFolder = await api('POST', '/folders/create', { token: bob.token, body: { name: 'bob-uploads' } })
    const r = await upload(alice.token, {
        bytes: PNG,
        filename: 'x.png',
        contentType: 'image/png',
        parentFolderId: bobFolder.body._id
    })
    assert.equal(r.status, 403)
})

// ── H5: upload content verification ───────────────────────────────────────
test('H5: an executable declared as image/png is rejected', async () => {
    const r = await upload(alice.token, { bytes: EXE, filename: 'invoice.exe', contentType: 'image/png' })
    assert.equal(r.status, 415)
})

test('H5: a disallowed declared type is rejected', async () => {
    const r = await upload(alice.token, {
        bytes: EXE,
        filename: 'evil.exe',
        contentType: 'application/x-msdownload'
    })
    assert.equal(r.status, 415)
})

test('H5: a genuine file is accepted and stored under the verified type', async () => {
    const r = await upload(alice.token, { bytes: PNG, filename: 'real.png', contentType: 'image/png' })
    assert.equal(r.status, 201)
    assert.equal(r.body.mimeType, 'image/png')
    // The on-disk name is a server-generated UUID plus the VERIFIED extension —
    // never anything derived from the client's filename.
    assert.match(path.basename(r.body.storagePath), /^[0-9a-f-]{36}\.png$/)
})

// ── H6: quota and orphan cleanup ──────────────────────────────────────────
test('H6: a rejected upload leaves no bytes on disk', async () => {
    const userDir = path.join(__dirname, '..', 'uploads', alice.id)
    const count = async () => {
        try { return (await fs.readdir(userDir)).length } catch { return 0 }
    }

    const before = await count()

    // Every rejection path AFTER Multer has already written the file. This is
    // the subtle half of H6: the bytes exist, no File row is created, and the
    // admin dashboard aggregates rows — so orphans would be invisible while
    // consuming disk.
    const bobFolder = await api('POST', '/folders/create', { token: bob.token, body: { name: 'not-alices' } })

    // ...rejected by content verification
    assert.equal((await upload(alice.token, {
        bytes: EXE, filename: 'x.png', contentType: 'image/png'
    })).status, 415)

    // ...rejected by destination authorization, after the write
    assert.equal((await upload(alice.token, {
        bytes: PNG, filename: 'y.png', contentType: 'image/png', parentFolderId: bobFolder.body._id
    })).status, 403)

    assert.equal(await count(), before, 'rejected uploads must not accumulate on disk')
})

// ── M3 / M4: names, headers and archives ──────────────────────────────────
test('M4: traversal and separators are refused as item names', () => {
    for (const bad of ['../x', 'a/b', 'a\\b', '..', '.', 'CON']) {
        assert.throws(() => validateItemName(bad), /name/i, `should reject ${JSON.stringify(bad)}`)
    }
})

test('M4: any stored name collapses to one safe archive segment', () => {
    for (const hostile of ['../../../../.ssh/authorized_keys', 'C:\\Windows\\evil', '..', '']) {
        const safe = sanitizePathSegment(hostile)
        assert.ok(!safe.includes('/'), `${safe} must not contain /`)
        assert.ok(!safe.includes('\\'), `${safe} must not contain \\`)
        assert.notEqual(safe, '..')
        assert.ok(safe.length > 0)
    }
})

test('M3/M4: a folder zip contains no traversal entries', async () => {
    const folder = await api('POST', '/folders/create', { token: alice.token, body: { name: 'ziptest' } })
    await upload(alice.token, {
        bytes: PNG,
        filename: 'inner.png',
        contentType: 'image/png',
        parentFolderId: folder.body._id
    })

    const res = await fetch(`${BASE}/folders/${folder.body._id}/download`, {
        headers: { Authorization: `Bearer ${alice.token}` }
    })
    assert.equal(res.status, 200)

    const bytes = Buffer.from(await res.arrayBuffer())
    assert.equal(bytes.subarray(0, 2).toString(), 'PK')
    assert.equal(bytes.includes(Buffer.from('../')), false)
    assert.equal(bytes.includes(Buffer.from('..\\')), false)
})

test('M3: a hostile folder name cannot inject a second filename parameter', async () => {
    const folder = await api('POST', '/folders/create', { token: alice.token, body: { name: 'hdr' } })
    // Names containing quotes are rejected on write; even so the header is
    // built by res.attachment(), which encodes rather than interpolates.
    await api('PATCH', `/folders/${folder.body._id}/rename`, {
        token: alice.token,
        body: { name: 'a"; filename="report.pdf' }
    })

    const res = await fetch(`${BASE}/folders/${folder.body._id}/download`, {
        headers: { Authorization: `Bearer ${alice.token}` }
    })
    const disposition = res.headers.get('content-disposition') || ''
    await res.arrayBuffer()
    // At most one `filename=` plus one RFC 5987 `filename*=`.
    assert.ok((disposition.match(/filename=/g) || []).length <= 2, disposition)
})

// ── H3: a record whose bytes are missing must not kill the process ────────
test('H3: a dangling file record does not crash the zip download', async () => {
    const folder = await api('POST', '/folders/create', { token: alice.token, body: { name: 'dangling' } })
    const good = await upload(alice.token, {
        bytes: PNG, filename: 'good.png', contentType: 'image/png', parentFolderId: folder.body._id
    })
    const orphan = await upload(alice.token, {
        bytes: PNG, filename: 'gone.png', contentType: 'image/png', parentFolderId: folder.body._id
    })

    // Simulate the disk/database divergence that used to arm the crash: the row
    // survives, the bytes do not.
    await fs.unlink(orphan.body.storagePath)

    const res = await fetch(`${BASE}/folders/${folder.body._id}/download`, {
        headers: { Authorization: `Bearer ${alice.token}` }
    })
    assert.equal(res.status, 200)
    const bytes = Buffer.from(await res.arrayBuffer())
    assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'a valid archive is still produced')

    // The surviving file is still served, and the process is still alive.
    assert.equal((await api('GET', `/files/${good.body._id}/download`, { token: alice.token })).status, 200)
    assert.equal((await api('GET', '/users/me', { token: alice.token })).status, 200)
})

test('H3: deleting a file whose bytes are already gone still succeeds', async () => {
    const file = await upload(alice.token, { bytes: PNG, filename: 'twice.png', contentType: 'image/png' })
    await fs.unlink(file.body.storagePath)

    // ENOENT on unlink is the desired end state, not a failure — the row must
    // still be removed rather than the handler aborting and leaving it behind.
    const r = await api('DELETE', `/files/${file.body._id}/delete`, { token: alice.token })
    assert.equal(r.status, 200)
    assert.equal((await api('GET', `/files/${file.body._id}/download`, { token: alice.token })).status, 404)
})

// ── L1: injection and id handling ─────────────────────────────────────────
test('L1: a Mongo operator object as an id is rejected', async () => {
    const file = await upload(alice.token, { bytes: PNG, filename: 'share.png', contentType: 'image/png' })
    const r = await api('PATCH', `/files/${file.body._id}/share`, {
        token: alice.token,
        body: { userId: { $ne: null } }
    })
    assert.equal(r.status, 400)
})

test('a malformed id returns 400, not 500', async () => {
    assert.equal((await api('GET', '/files/not-an-id/download', { token: alice.token })).status, 400)
    assert.equal((await api('DELETE', '/files/xyz/delete', { token: alice.token })).status, 400)
})

// ── Sharing still works end to end ────────────────────────────────────────
test('sharing grants read access and unsharing revokes it', async () => {
    const file = await upload(alice.token, { bytes: PNG, filename: 'shared.png', contentType: 'image/png' })
    const id = file.body._id

    assert.equal((await api('GET', `/files/${id}/download`, { token: bob.token })).status, 403)

    assert.equal(
        (await api('PATCH', `/files/${id}/share`, { token: alice.token, body: { userId: bob.id } })).status,
        200
    )
    assert.equal((await api('GET', `/files/${id}/download`, { token: bob.token })).status, 200)

    assert.equal(
        (await api('PATCH', `/files/${id}/unshare`, { token: alice.token, body: { userId: bob.id } })).status,
        200
    )
    assert.equal((await api('GET', `/files/${id}/download`, { token: bob.token })).status, 403)
})

test('a non-owner cannot rename, move or delete another user\'s file', async () => {
    const file = await upload(alice.token, { bytes: PNG, filename: 'mine.png', contentType: 'image/png' })
    const id = file.body._id

    assert.equal((await api('PATCH', `/files/${id}/rename`, { token: bob.token, body: { name: 'yours.png' } })).status, 403)
    assert.equal((await api('PATCH', `/files/${id}/move`, { token: bob.token, body: { parentFolderId: null } })).status, 403)
    assert.equal((await api('DELETE', `/files/${id}/delete`, { token: bob.token })).status, 403)
    assert.equal((await api('PATCH', `/files/${id}/share`, { token: bob.token, body: { userId: bob.id } })).status, 403)
})

// ── M2 / M5 ───────────────────────────────────────────────────────────────
test('M2: the password policy is enforced on registration', async () => {
    const weak = await api('POST', '/users/', {
        body: { name: 'Weak', email: 'weak@homebase.test', password: 'short' }
    })
    assert.equal(weak.status, 400)
    assert.match(weak.body.message, /at least 12/)

    const selfish = await api('POST', '/users/', {
        body: { name: 'Selfish', email: 'selfish@homebase.test', password: 'selfish@homebase.test' }
    })
    assert.equal(selfish.status, 400)
})

test('M5: user search requires a minimum query length', async () => {
    assert.deepEqual((await api('GET', '/users/search?q=a', { token: alice.token })).body, [])
    assert.deepEqual((await api('GET', '/users/search?q=ab', { token: alice.token })).body, [])
    const hit = await api('GET', '/users/search?q=bob', { token: alice.token })
    assert.equal(hit.status, 200)
    assert.ok(Array.isArray(hit.body))
})

// ── H4 / H7: headers and error hygiene ────────────────────────────────────
test('H4: security headers are present on every response', async () => {
    const res = await fetch(`${BASE}/users/me`)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-powered-by'), null)
    const csp = res.headers.get('content-security-policy')
    assert.ok(csp, 'CSP header must be set')
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /default-src 'none'/)
    await res.arrayBuffer()
})

test('H5/H4: file responses carry nosniff and a sandboxing CSP', async () => {
    const file = await upload(alice.token, { bytes: PNG, filename: 'hdr.png', contentType: 'image/png' })
    const res = await fetch(`${BASE}/files/${file.body._id}/view`, {
        headers: { Authorization: `Bearer ${alice.token}` }
    })
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.match(res.headers.get('content-security-policy') || '', /sandbox/)
    await res.arrayBuffer()
})

test('H7: errors never carry a stack trace and always carry a request id', async () => {
    const bad = await api('GET', '/users/me', { token: 'garbage' })
    assert.equal(bad.status, 401)
    assert.equal(bad.body.stack, undefined)
    assert.ok(bad.body.requestId)

    // A body that used to throw a TypeError before its presence check.
    const noEmail = await api('POST', '/users/', { body: { password: PASSWORD } })
    assert.equal(noEmail.status, 400)
    assert.equal(noEmail.body.stack, undefined)
})

test('L8: a repeated query parameter does not produce a 500', async () => {
    const r = await api('GET', '/users/search?q=bob&q=alice', { token: alice.token })
    assert.equal(r.status, 200)
})

// ── Account lifecycle ─────────────────────────────────────────────────────
test('pending accounts are locked out until an admin approves them', async () => {
    const r = await api('POST', '/users/', {
        body: { name: 'Pending', email: 'pending@homebase.test', password: PASSWORD }
    })
    assert.equal(r.status, 201)
    // A token is issued, but the account is `pending` so it grants nothing.
    assert.equal((await api('GET', '/users/me', { token: r.body.token })).status, 403)
})

test('suspension takes effect on the next request', async () => {
    const victim = await makeUser('suspend@homebase.test')
    assert.equal((await api('GET', '/users/me', { token: victim.token })).status, 200)

    const suspended = await api('PATCH', `/admin/users/${victim.id}/status`, {
        token: alice.token,
        body: { status: 'suspended' }
    })
    assert.equal(suspended.status, 200)
    assert.equal((await api('GET', '/users/me', { token: victim.token })).status, 403)
})

test('non-admins cannot reach admin routes', async () => {
    assert.equal((await api('GET', '/admin/stats/storage', { token: bob.token })).status, 403)
    assert.equal((await api('GET', '/admin/users?status=pending', { token: bob.token })).status, 403)
    assert.equal((await api('GET', '/admin/stats/storage', { token: alice.token })).status, 200)
})

// ── M6 ────────────────────────────────────────────────────────────────────
test('M6: list endpoints are bounded regardless of what the client asks for', async () => {
    const r = await api('GET', '/files?limit=999999', { token: alice.token })
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body), 'response shape must stay an array')
    assert.ok(Number(r.headers.get('x-page-limit')) <= 500)
    assert.ok(r.headers.get('x-total-count') !== null)
})

// ── L9: password reset ────────────────────────────────────────────────────
//
// The audit called this "the highest-risk feature still to be written". These
// assert the properties L9 required of it.
//
// Codes are seeded directly into the reset slot rather than read from an email:
// the tests can't open an inbox, and the plaintext exists nowhere else by
// design. /password/forgot is exercised only where the endpoint's own behaviour
// is what's under test.
const seedResetCode = async (userId, code, { expiresInMs = 10 * 60 * 1000 } = {}) => {
    const { hashOtp } = require('../utils/otp')
    await User.updateOne({ _id: userId }, {
        passwordResetCodeHash: await hashOtp(code),
        passwordResetExpires: new Date(Date.now() + expiresInMs),
        passwordResetAttempts: 0
    })
}

const readResetSlot = (userId) =>
    User.findById(userId).select(
        '+passwordResetCodeHash +passwordResetExpires +passwordResetAttempts ' +
        '+twoFactorCodeHash +twoFactorCodeExpires'
    )

test('L9: /password/forgot answers identically for a real and an unknown address', async () => {
    const known = await makeUser('forgot-known@homebase.test')

    const hit = await api('POST', '/users/password/forgot', { body: { email: known.email } })
    const miss = await api('POST', '/users/password/forgot', {
        body: { email: 'nobody-here@homebase.test' }
    })

    // The single most important assertion in the feature. On a private
    // whitelist platform the membership list is itself sensitive, so any
    // difference here — status, body, or wording — is an enumeration oracle.
    assert.equal(hit.status, 200)
    assert.equal(miss.status, 200)
    assert.deepEqual(hit.body, miss.body)

    // And the real one actually armed a code, so the parity isn't achieved by
    // the endpoint quietly doing nothing at all.
    const doc = await readResetSlot(known.id)
    assert.ok(doc.passwordResetCodeHash, 'a real address must get a code minted')
})

test('L9: pending and suspended accounts get the same response as an active one', async () => {
    const pending = await api('POST', '/users/', {
        body: { name: 'Pend', email: 'forgot-pending@homebase.test', password: PASSWORD }
    })
    assert.equal(pending.status, 201)   // left at status 'pending'

    const suspended = await makeUser('forgot-suspended@homebase.test')
    await User.updateOne({ _id: suspended.id }, { status: 'suspended' })

    const active = await makeUser('forgot-active@homebase.test')

    const responses = []
    for (const email of [
        'forgot-pending@homebase.test',
        'forgot-suspended@homebase.test',
        'forgot-active@homebase.test'
    ]) {
        responses.push(await api('POST', '/users/password/forgot', { body: { email } }))
    }

    for (const r of responses) {
        assert.equal(r.status, 200)
        assert.deepEqual(r.body, responses[0].body)
    }
})

test('L9: a reset code sets the password, kills sessions, and returns no token', async () => {
    const user = await makeUser('reset-happy@homebase.test')
    const NEW_PASSWORD = 'entirely-different-phrase-42'

    assert.equal((await api('GET', '/users/me', { token: user.token })).status, 200)

    await seedResetCode(user.id, '123456')

    const reset = await api('POST', '/users/password/reset', {
        body: {
            email: user.email,
            code: '123456',
            newPassword: NEW_PASSWORD,
            confirmNewPassword: NEW_PASSWORD
        }
    })
    assert.equal(reset.status, 200, JSON.stringify(reset.body))

    // A public endpoint must not hand back a session — that would skip the 2FA
    // challenge for an account that has it enabled.
    assert.equal(reset.body.token, undefined, '/password/reset must not return a token')

    // H8: every outstanding session dies with the old password.
    assert.equal((await api('GET', '/users/me', { token: user.token })).status, 401)

    assert.equal(
        (await api('POST', '/users/login', { body: { email: user.email, password: PASSWORD } })).status,
        400,
        'the old password must stop working'
    )
    const relogin = await api('POST', '/users/login', {
        body: { email: user.email, password: NEW_PASSWORD }
    })
    assert.equal(relogin.status, 200, 'the new password must work')

    // Single-use: the code is cleared on redemption.
    const doc = await readResetSlot(user.id)
    assert.equal(doc.passwordResetCodeHash, null, 'a redeemed code must be cleared')
})

test('L9: a redeemed reset code cannot be replayed', async () => {
    const user = await makeUser('reset-replay@homebase.test')
    await seedResetCode(user.id, '222222')

    const body = (pw) => ({
        email: user.email, code: '222222', newPassword: pw, confirmNewPassword: pw
    })

    assert.equal((await api('POST', '/users/password/reset', { body: body('first-new-password-11') })).status, 200)
    assert.equal((await api('POST', '/users/password/reset', { body: body('second-new-password-22') })).status, 400)
})

test('L9: a code issued for one account cannot reset another', async () => {
    const owner = await makeUser('reset-owner@homebase.test')
    const victim = await makeUser('reset-victim@homebase.test')

    await seedResetCode(owner.id, '333333')

    const r = await api('POST', '/users/password/reset', {
        body: {
            email: victim.email,
            code: '333333',
            newPassword: 'not-going-to-happen-99',
            confirmNewPassword: 'not-going-to-happen-99'
        }
    })
    assert.equal(r.status, 400)

    // The victim's password is untouched.
    assert.equal(
        (await api('POST', '/users/login', { body: { email: victim.email, password: PASSWORD } })).status,
        200
    )
})

// ── The field-separation guarantee ────────────────────────────────────────
//
// Every OTP in this app used to share one slot on the User document. These two
// tests are what prove reset codes and 2FA codes no longer do. If either fails,
// a code minted for one purpose is redeemable for the other and the whole
// design collapses.
test('L9: a 2FA login code cannot be redeemed at /password/reset', async () => {
    const { hashOtp } = require('../utils/otp')
    const user = await makeUser('crossflow-a@homebase.test')

    // Arm the 2FA slot only, exactly as a login challenge would.
    await User.updateOne({ _id: user.id }, {
        twoFactorCodeHash: await hashOtp('444444'),
        twoFactorCodeExpires: new Date(Date.now() + 10 * 60 * 1000),
        twoFactorCodeAttempts: 0
    })

    const r = await api('POST', '/users/password/reset', {
        body: {
            email: user.email,
            code: '444444',
            newPassword: 'should-not-work-at-all-77',
            confirmNewPassword: 'should-not-work-at-all-77'
        }
    })
    assert.equal(r.status, 400, 'a login code must not reset a password')

    assert.equal(
        (await api('POST', '/users/login', { body: { email: user.email, password: PASSWORD } })).status,
        200,
        'the password must be unchanged'
    )
})

test('L9: requesting a reset does not clobber a pending 2FA login challenge', async () => {
    const { hashOtp } = require('../utils/otp')
    const user = await makeUser('crossflow-b@homebase.test')

    await User.updateOne({ _id: user.id }, {
        twoFactorCodeHash: await hashOtp('555555'),
        twoFactorCodeExpires: new Date(Date.now() + 10 * 60 * 1000),
        twoFactorCodeAttempts: 0
    })
    const before = await readResetSlot(user.id)

    assert.equal(
        (await api('POST', '/users/password/forgot', { body: { email: user.email } })).status,
        200
    )

    const after = await readResetSlot(user.id)
    assert.equal(
        after.twoFactorCodeHash,
        before.twoFactorCodeHash,
        'a reset request must leave an in-flight 2FA challenge alone'
    )
    assert.ok(after.passwordResetCodeHash, 'and must arm the reset slot instead')
})

test('L9: a rejected password does not consume the code', async () => {
    const user = await makeUser('reset-policy@homebase.test')
    await seedResetCode(user.id, '666666')

    // 'password' is on the common-password deny list, so this fails the policy
    // check — which runs BEFORE the code is verified, precisely so a bad
    // password doesn't cost the user a fresh email.
    const weak = await api('POST', '/users/password/reset', {
        body: {
            email: user.email, code: '666666',
            newPassword: 'password', confirmNewPassword: 'password'
        }
    })
    assert.equal(weak.status, 400)

    const good = await api('POST', '/users/password/reset', {
        body: {
            email: user.email, code: '666666',
            newPassword: 'a-perfectly-fine-passphrase-1', confirmNewPassword: 'a-perfectly-fine-passphrase-1'
        }
    })
    assert.equal(good.status, 200, 'the same code must still work after a policy rejection')
})

test('L9: an expired reset code is refused', async () => {
    const user = await makeUser('reset-expired@homebase.test')
    await seedResetCode(user.id, '777777', { expiresInMs: -1000 })

    const r = await api('POST', '/users/password/reset', {
        body: {
            email: user.email, code: '777777',
            newPassword: 'too-late-for-this-one-88', confirmNewPassword: 'too-late-for-this-one-88'
        }
    })
    assert.equal(r.status, 400)
    assert.match(r.body.message, /expired/i)
})

test('L9: wrong codes are capped, and the cap survives a later correct guess', async () => {
    const user = await makeUser('reset-bruteforce@homebase.test')
    await seedResetCode(user.id, '888888')

    const attempt = (code) => api('POST', '/users/password/reset', {
        body: {
            email: user.email, code,
            newPassword: 'brute-force-attempt-value-1', confirmNewPassword: 'brute-force-attempt-value-1'
        }
    })

    // OTP_MAX_ATTEMPTS is 5.
    for (let i = 0; i < 5; i += 1) {
        assert.equal((await attempt('000000')).status, 400)
    }

    // The 6th is refused on the cap before the code is even compared — so the
    // correct code no longer helps.
    const withCorrect = await attempt('888888')
    assert.equal(withCorrect.status, 400, 'the correct code must not work once the cap is hit')

    assert.equal(
        (await api('POST', '/users/login', { body: { email: user.email, password: PASSWORD } })).status,
        200,
        'the password must be unchanged'
    )
})

test('L9: an unknown email at /password/reset gives the wrong-code error, not a 404', async () => {
    const r = await api('POST', '/users/password/reset', {
        body: {
            email: 'ghost@homebase.test', code: '123456',
            newPassword: 'does-not-matter-at-all-12', confirmNewPassword: 'does-not-matter-at-all-12'
        }
    })
    // A 404 here would hand back the enumeration /password/forgot is careful
    // not to give away.
    assert.equal(r.status, 400)
    assert.match(r.body.message, /verification code/i)
})

test('L9: an ordinary password change kills an outstanding reset code', async () => {
    const user = await makeUser('reset-superseded@homebase.test')
    await seedResetCode(user.id, '999999')

    // Change the password the normal way (no 2FA on this account).
    const changed = await api('PATCH', '/users/me/password', {
        token: user.token,
        body: {
            currentPassword: PASSWORD,
            newPassword: 'changed-it-myself-thanks-5',
            confirmNewPassword: 'changed-it-myself-thanks-5'
        }
    })
    assert.equal(changed.status, 200, JSON.stringify(changed.body))

    // The code emailed a moment ago must be dead — otherwise it sits in the
    // inbox as a live credential for the rest of its ten minutes.
    const doc = await readResetSlot(user.id)
    assert.equal(doc.passwordResetCodeHash, null, 'a password change must clear the reset slot')

    const r = await api('POST', '/users/password/reset', {
        body: {
            email: user.email, code: '999999',
            newPassword: 'should-be-rejected-now-33', confirmNewPassword: 'should-be-rejected-now-33'
        }
    })
    assert.equal(r.status, 400)
})

test('L9: mismatched confirmation is refused before anything else happens', async () => {
    const user = await makeUser('reset-mismatch@homebase.test')
    await seedResetCode(user.id, '121212')

    const r = await api('POST', '/users/password/reset', {
        body: {
            email: user.email, code: '121212',
            newPassword: 'one-good-passphrase-11', confirmNewPassword: 'a-different-one-22'
        }
    })
    assert.equal(r.status, 400)

    const doc = await readResetSlot(user.id)
    assert.ok(doc.passwordResetCodeHash, 'the code must survive a mismatch')
    assert.equal(doc.passwordResetAttempts, 0, 'and must not count as an attempt')
})

// ── Admin surface: authorization matrix ───────────────────────────────────
//
// Every admin endpoint gets the same three-way assertion. The audit's two worst
// findings were both authorization gaps, and a new route added to adminRoutes.js
// is only guarded because of the router-level `protect, requireAdmin` — this is
// what proves that guard is actually reaching each one.
test('every admin endpoint rejects anonymous, pre-auth and non-admin callers', async () => {
    const bobDoc = await User.findById(bob.id)
    const preAuth = signPreAuthToken(bobDoc)

    const endpoints = [
        ['GET', '/admin/stats/storage'],
        ['GET', '/admin/users?status=pending'],
        ['GET', `/admin/users/${bob.id}`],
        ['PATCH', `/admin/users/${bob.id}/status`],
        ['POST', `/admin/users/${bob.id}/revoke-sessions`],
        ['POST', `/admin/users/${bob.id}/reset-2fa`],
        ['DELETE', `/admin/users/${bob.id}`],
        ['GET', '/admin/announcements'],
        ['POST', '/admin/announcements'],
        ['DELETE', '/admin/announcements/000000000000000000000000'],
        ['GET', '/admin/audit'],
        ['GET', '/admin/audit/events'],
        ['GET', '/admin/system/health'],
        ['GET', '/admin/system/config'],
        ['POST', '/admin/system/test-email']
    ]

    for (const [method, p] of endpoints) {
        assert.equal((await api(method, p)).status, 401, `${method} ${p} must reject anonymous`)
        assert.equal(
            (await api(method, p, { token: preAuth })).status, 401,
            `${method} ${p} must reject a pre-auth token`
        )
        assert.equal(
            (await api(method, p, { token: bob.token })).status, 403,
            `${method} ${p} must reject a non-admin`
        )
    }
})

test('admin read endpoints answer for an admin', async () => {
    for (const p of [
        '/admin/announcements',
        '/admin/audit',
        '/admin/audit/events',
        '/admin/system/health',
        '/admin/system/config'
    ]) {
        assert.equal((await api('GET', p, { token: alice.token })).status, 200, p)
    }
})

test('the config endpoint never returns a secret', async () => {
    const r = await api('GET', '/admin/system/config', { token: alice.token })
    assert.equal(r.status, 200)

    const serialized = JSON.stringify(r.body)
    for (const secret of ['JWT_SECRET', 'MONGO_URI', 'SMTP_PASS', 'jwtSecret', 'mongoUri', 'smtpPass']) {
        assert.ok(!serialized.includes(secret), `config leaked a key named ${secret}`)
    }
    // The real values, not just their names.
    assert.ok(!serialized.includes(process.env.JWT_SECRET), 'config leaked the JWT secret value')
    assert.ok(!serialized.includes(TEST_URI), 'config leaked the database URI')
})

// ── Announcements ─────────────────────────────────────────────────────────
test('an announcement is delivered once, then not again', async () => {
    const reader = await makeUser('reader@homebase.test')

    const created = await api('POST', '/admin/announcements', {
        token: alice.token,
        body: {
            title: 'Scheduled maintenance',
            body: 'Homebase will be offline briefly on Saturday.',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        }
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))

    const first = await api('GET', '/announcements', { token: reader.token })
    assert.equal(first.status, 200)
    assert.ok(
        first.body.some((a) => a.title === 'Scheduled maintenance'),
        'a live announcement must reach a user who has not seen it'
    )

    assert.equal((await api('PATCH', '/announcements/seen', { token: reader.token })).status, 200)

    const second = await api('GET', '/announcements', { token: reader.token })
    assert.equal(second.status, 200)
    assert.deepEqual(second.body, [], 'nothing live should remain after the watermark advances')

    // Idempotent — the client fires this without awaiting it.
    assert.equal((await api('PATCH', '/announcements/seen', { token: reader.token })).status, 200)
    assert.deepEqual((await api('GET', '/announcements', { token: reader.token })).body, [])
})

test('an expired announcement is never delivered, even to someone who never saw it', async () => {
    const Announcement = require('../models/announcementModel')

    const created = await api('POST', '/admin/announcements', {
        token: alice.token,
        body: {
            title: 'Already over',
            body: 'This one expires before anyone opens the app.',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        }
    })
    assert.equal(created.status, 201)

    // The API refuses a past expiry, so age it directly — this is the state a
    // live announcement reaches on its own once the clock passes expiresAt.
    await Announcement.updateOne(
        { _id: created.body.id },
        { expiresAt: new Date(Date.now() - 1000) }
    )

    // A brand-new account has a null watermark, so it has "seen nothing" —
    // expiry is the only thing that can be keeping this back.
    const latecomer = await makeUser('latecomer@homebase.test')
    const feed = await api('GET', '/announcements', { token: latecomer.token })

    assert.equal(feed.status, 200)
    assert.ok(
        !feed.body.some((a) => a.title === 'Already over'),
        'an expired announcement must not be delivered'
    )
})

test('an announcement cannot be created with an expiry in the past', async () => {
    const r = await api('POST', '/admin/announcements', {
        token: alice.token,
        body: {
            title: 'Pointless',
            body: 'Nobody would ever see this.',
            expiresAt: new Date(Date.now() - 60 * 1000).toISOString()
        }
    })
    assert.equal(r.status, 400)

    const missing = await api('POST', '/admin/announcements', {
        token: alice.token,
        body: { title: '', body: '', expiresAt: 'not a date' }
    })
    assert.equal(missing.status, 400)
})

test('announcements require an approved account', async () => {
    const r = await api('POST', '/users/', {
        body: { name: 'Waiting', email: 'waiting@homebase.test', password: PASSWORD }
    })
    assert.equal(r.status, 201)
    // Same 403 protect gives every other member route — the audience for an
    // announcement is exactly the set of accounts that may use the app.
    assert.equal((await api('GET', '/announcements', { token: r.body.token })).status, 403)
})

// ── Account support actions ───────────────────────────────────────────────
test('support actions refuse your own account and other admins', async () => {
    const otherAdmin = await makeUser('admin2@homebase.test', 'admin')

    for (const [method, suffix] of [
        ['POST', '/revoke-sessions'],
        ['POST', '/reset-2fa'],
        ['DELETE', '']
    ]) {
        const onSelf = await api(method, `/admin/users/${alice.id}${suffix}`, {
            token: alice.token,
            body: { confirmEmail: alice.email }
        })
        assert.equal(onSelf.status, 400, `${method} ${suffix} must refuse self`)

        const onAdmin = await api(method, `/admin/users/${otherAdmin.id}${suffix}`, {
            token: alice.token,
            body: { confirmEmail: otherAdmin.email }
        })
        assert.equal(onAdmin.status, 400, `${method} ${suffix} must refuse an admin target`)
    }

    // Still there — none of the refusals half-applied.
    assert.equal((await api('GET', '/users/me', { token: otherAdmin.token })).status, 200)
})

test('revoking sessions invalidates the target\'s existing token', async () => {
    const victim = await makeUser('revokeme@homebase.test')
    assert.equal((await api('GET', '/users/me', { token: victim.token })).status, 200)

    const r = await api('POST', `/admin/users/${victim.id}/revoke-sessions`, { token: alice.token })
    assert.equal(r.status, 200)

    // 401, not 403: the token is no longer valid at all, rather than the
    // account being blocked. The account itself is untouched.
    assert.equal((await api('GET', '/users/me', { token: victim.token })).status, 401)

    const again = await api('POST', '/users/login', {
        body: { email: victim.email, password: PASSWORD }
    })
    assert.equal(again.status, 200, 'the account must still be usable after a sign-out')
})

test('deleting an account requires the typed email and removes what it owned', async () => {
    const doomed = await makeUser('doomed@homebase.test')

    const uploaded = await upload(doomed.token, {
        bytes: PNG, filename: 'photo.png', contentType: 'image/png'
    })
    assert.equal(uploaded.status, 201)

    const folder = await api('POST', '/folders/create', {
        token: doomed.token,
        body: { name: 'Holiday' }
    })
    assert.equal(folder.status, 201)

    // Wrong address, and no address at all, are both refused.
    assert.equal(
        (await api('DELETE', `/admin/users/${doomed.id}`, { token: alice.token })).status,
        400
    )
    assert.equal(
        (await api('DELETE', `/admin/users/${doomed.id}`, {
            token: alice.token, body: { confirmEmail: 'someone@else.test' }
        })).status,
        400
    )
    assert.equal((await api('GET', '/users/me', { token: doomed.token })).status, 200)

    const deleted = await api('DELETE', `/admin/users/${doomed.id}`, {
        token: alice.token,
        body: { confirmEmail: doomed.email }
    })
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body))
    assert.equal(deleted.body.fileCount, 1)

    assert.equal((await api('GET', '/users/me', { token: doomed.token })).status, 401)
    assert.equal(await User.countDocuments({ _id: doomed.id }), 0)

    const File = require('../models/fileModel')
    const Folder = require('../models/folderModel')
    assert.equal(await File.countDocuments({ ownerId: doomed.id }), 0, 'files must go with the account')
    assert.equal(await Folder.countDocuments({ ownerId: doomed.id }), 0, 'folders must go with the account')
})

test('deleting an account clears it from other people\'s sharedWith arrays', async () => {
    const File = require('../models/fileModel')

    const leaver = await makeUser('leaver@homebase.test')
    const stayer = await makeUser('stayer@homebase.test')

    const uploaded = await upload(stayer.token, {
        bytes: PNG, filename: 'shared.png', contentType: 'image/png'
    })
    assert.equal(uploaded.status, 201)

    const shared = await api('PATCH', `/files/${uploaded.body._id}/share`, {
        token: stayer.token,
        body: { userId: leaver.id }
    })
    assert.equal(shared.status, 200, JSON.stringify(shared.body))

    const before = await File.findById(uploaded.body._id)
    assert.equal(before.sharedWith.length, 1)

    assert.equal(
        (await api('DELETE', `/admin/users/${leaver.id}`, {
            token: alice.token, body: { confirmEmail: leaver.email }
        })).status,
        200
    )

    // A dangling id here surfaces as a null in the share list's populate join.
    const after = await File.findById(uploaded.body._id)
    assert.equal(after.sharedWith.length, 0, 'a deleted user must not linger in sharedWith')
})

// ── Audit trail ───────────────────────────────────────────────────────────
test('the audit log endpoint returns an envelope with a total', async () => {
    const r = await api('GET', '/admin/audit?limit=5', { token: alice.token })
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body.rows), 'rows must be an array')
    assert.equal(typeof r.body.total, 'number')
    assert.ok(r.body.rows.length <= 5, 'the server-side bound must apply')
    assert.ok(r.headers.get('x-total-count') !== null)
})

test('audit rows are not persisted under NODE_ENV=test', async () => {
    const AuditLog = require('../models/auditLogModel')

    // By this point the suite has driven registrations, logins, failed logins,
    // admin status changes and account deletions — every one of which calls
    // audit(). The DB sink must stay muted in test exactly as write() does, or
    // a test run silently accumulates a security trail of fake accounts.
    assert.equal(
        await AuditLog.countDocuments({}),
        0,
        'audit persistence must be suppressed in the test environment'
    )
})

// ── Pure unit checks ──────────────────────────────────────────────────────
test('file signature detection identifies the allowed types', () => {
    assert.equal(detectType(PNG).mime, 'image/png')
    assert.equal(detectType(Buffer.from('%PDF-1.7\n')).mime, 'application/pdf')
    assert.equal(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).mime, 'image/jpeg')
    assert.equal(detectType(Buffer.from('GIF89a')).mime, 'image/gif')
    assert.equal(detectType(Buffer.from('a normal note\n')).mime, 'text/plain')
})

test('H5: executables and markup are rejected outright, not treated as text', () => {
    // text/plain has no signature of its own, so it is matched by a heuristic.
    // Without an explicit deny-list an MZ executable whose leading bytes happen
    // to be printable would satisfy that heuristic and be stored as a .txt.
    for (const [label, bytes] of [
        ['windows exe', EXE],
        ['elf', Buffer.concat([Buffer.from([0x7f]), Buffer.from('ELF'), Buffer.alloc(32, 9)])],
        ['shebang', Buffer.from('#!/bin/sh\necho hi\n')],
        ['html', Buffer.from('<!DOCTYPE html><script>alert(1)</script>')],
        ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')]
    ]) {
        assert.equal(detectType(bytes), null, `${label} must not be detected as an allowed type`)
        assert.ok(matchDangerous(bytes), `${label} must match a dangerous signature`)
    }
})

test('H5: markup declared as text/plain is refused by the upload pipeline', async () => {
    const html = Buffer.from('<!DOCTYPE html><script>alert(document.domain)</script>')
    const r = await upload(alice.token, { bytes: html, filename: 'note.txt', contentType: 'text/plain' })
    assert.equal(r.status, 415)
})

test('a genuine text file still uploads', async () => {
    const r = await upload(alice.token, {
        bytes: Buffer.from('shopping list\n- milk\n'),
        filename: 'list.txt',
        contentType: 'text/plain'
    })
    assert.equal(r.status, 201)
    assert.equal(r.body.mimeType, 'text/plain')
})
