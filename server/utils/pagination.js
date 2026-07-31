// Bounded list responses.
//
// Four list endpoints returned every matching document with no limit. Combined
// with no storage quota, nothing bounded the result set an attacker could
// construct: a folder holding 100,000 rows was loaded into memory, serialized,
// and transmitted on every navigation — and the shared-item endpoints add a
// populate join per document on top.
//
// The response stays a plain JSON array so existing clients are unaffected.
// The bound is applied regardless of whether the client asks for it, and the
// real total travels in X-Total-Count so a client can tell it has more.

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

const readInt = (value, fallback) => {
    const raw = Array.isArray(value) ? value[0] : value
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

// Server-enforced: a client asking for 100000 gets MAX_LIMIT.
const readPageParams = (req) => ({
    limit: Math.min(readInt(req.query.limit, DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT),
    skip: readInt(req.query.skip, 0)
})

// Runs the query with the bound applied and reports the unbounded total.
// `query` is an un-awaited Mongoose Query, so the count can reuse its filter.
const sendPage = async (res, query, { limit, skip }) => {
    const total = await query.model.countDocuments(query.getFilter())
    const docs = await query.skip(skip).limit(limit)

    res.setHeader('X-Total-Count', String(total))
    res.setHeader('X-Page-Limit', String(limit))
    res.setHeader('X-Page-Skip', String(skip))

    return res.json(docs)
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, readPageParams, sendPage }
