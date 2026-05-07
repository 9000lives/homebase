const mongoose = require('mongoose')
const roleEnum = {
  values: ['user', 'admin'],
  message: 'enum validator failed for path `{PATH}` with value `{VALUE}`'
}
const statusEnum = {
  values: ['pending', 'active', 'suspended'],
  message: 'enum validator failed for path `{PATH}` with value `{VALUE}`'    
}

const userSchema = mongoose.Schema({
        email: {
            type: String,
            required: [true, 'Please add an email'],
            unique: true,
            lowercase: true,
            trim: true
        },
        passwordHash: {
            type: String,
            required: true
        },
        displayName: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: roleEnum,
            default: 'user'
        },
        status: {
            type: String,
            enum: statusEnum,
            default: 'pending'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
})

module.exports = mongoose.model('User', userSchema)