const express = require('express')
const dotenv = require('dotenv')
const connectDB = require('./config/db')
const fs = require('fs')
const cors = require('cors');


dotenv.config()
connectDB()

if(!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads')
}

const app = express()

app.use(cors({
  origin: 'http://localhost:5173',
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json()) // lets Express parse JSON request bodies

const userRoutes = require('./routes/userRoutes')
app.use('/api/users', userRoutes)

const fileRoutes = require('./routes/fileRoutes')
app.use('/api/files', fileRoutes)

const folderRoutes = require('./routes/folderRoutes')
app.use('/api/folders', folderRoutes)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))