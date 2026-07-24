const multer = require('multer')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')

const storage = multer.diskStorage({
    // where to save the file on disk
    destination: (req, file, cb) => {
        // explicit destination so that this will work across machines
        const dir = path.join(__dirname, '..', 'uploads', req.user.id.toString())
        // create the user's folder if it doesn't exist yet
        fs.mkdirSync(dir, { recursive: true })
        cb(null, dir)
    },
    // what to name the file
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname)
        cb(null, `${uuidv4()}${ext}`)
    }
})

// file filter - only allow certain file types
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 
        'image/png', 
        'image/gif',
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'audio/mpeg'
    ]

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true)
    } else {
        cb(new Error('File type not allowed'), false)
    }
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
})

module.exports = upload