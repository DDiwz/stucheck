/**
 * models/User.js — Mongoose schema for STU-Check users
 * Passwords are stored as bcrypt hashes (never plain text).
 */

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,       // store as lowercase for case-insensitive lookup
    minlength: 1,
    maxlength: 50
  },
  password: {
    type: String,
    required: true         // bcrypt hash, never plain text
  },
  displayName: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);
