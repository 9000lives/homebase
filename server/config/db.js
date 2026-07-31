// NOTE: the previous version called dns.setServers(['8.8.8.8', '1.1.1.1']) to
// work around an ECONNREFUSED when reaching Atlas from one developer machine.
// That call is process-GLOBAL, not scoped to this connection — it redirected
// every lookup the process makes (Atlas SRV, the SMTP host, anything added
// later) through two third-party resolvers, bypassing the host's DNS, any
// split-horizon resolution, and any DNSSEC validation. A local symptom belongs
// in the local environment, not in code that ships. Removed.

const mongoose = require('mongoose')
const { MONGO_URI } = require('./env')
const { log } = require('../utils/logger')

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            // Fail fast rather than hanging a request for 30s when the cluster
            // is unreachable.
            serverSelectionTimeoutMS: 10000
        })
        log.info('MongoDB connected')
    } catch (error) {
        // The URI contains credentials — log only the failure, never the value.
        log.error('MongoDB connection failed', { error: { name: error.name, message: error.message } })
        process.exit(1)
    }
}

module.exports = connectDB
