const express = require('express')
const dotenv = require('dotenv')
const connectDB = require('./config/db')

dotenv.config()
connectDB()

const app = express()

app.use(express.json()) // lets Express parse JSON request bodies

const userRoutes = require('./routes/userRoutes')
app.use('/api/users', userRoutes)

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))