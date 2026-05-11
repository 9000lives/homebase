// code to avoid econnrefused error when connecting to MongoDB Atlas from localhost
// delete before prod, only testing purposes
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose')

const connectDB = async()=>{
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI)
        console.log("MongoDB connected")
    } catch(error) {
        console.log(error)
        process.exit(1) 
    }
}

module.exports = connectDB