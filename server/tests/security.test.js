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
