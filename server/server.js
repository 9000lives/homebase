const express = require('express')
const dotenv = require('dotenv')
const connectDB = require('./config/db')
const fs = require('fs')
const cors = require('cors');
const { errorHandler } = require('./middleware/errorMiddleware')


dotenv.config()
connectDB()

if(!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads')
}

const app = express()

// configed to allow any localhost port dynamically, switch before prod
app.use(cors({
  origin: /^http:\/\/localhost:\d+$/,
  credentials: true
}));

app.use(express.json()) // lets Express parse JSON request bodies

const userRoutes = require('./routes/userRoutes')
app.use('/api/users', userRoutes)

const fileRoutes = require('./routes/fileRoutes')
app.use('/api/files', fileRoutes)

const folderRoutes = require('./routes/folderRoutes')
app.use('/api/folders', folderRoutes)

// admin dashboard — every route inside is behind protect + requireAdmin
const adminRoutes = require('./routes/adminRoutes')
app.use('/api/admin', adminRoutes)

app.use(errorHandler)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))