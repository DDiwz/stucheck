/**
 * models/History.js — Mongoose schema for STU-Check session history
 */

const mongoose = require('mongoose');

const RoundSnapshotSchema = new mongoose.Schema({
  round:  { type: Number },
  time:   { type: String },
  data:   { type: Array, default: [] }
}, { _id: false });

const HistorySchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true
  },
  userId:       { type: String, required: true },
  subjectCode:  { type: String, default: '' },
  subjectName:  { type: String, default: '' },
  classroom:    { type: String, default: '' },
  roomCode:     { type: String, default: '' },
  startTime:    { type: String, default: '' },
  endTime:      { type: String, default: '' },
  duration:     { type: String, default: '' },
  roundCount:   { type: Number, default: 0 },
  roundHistory: { type: [RoundSnapshotSchema], default: [] },
  savedAt:      { type: Date, default: Date.now }
});

module.exports = mongoose.model('History', HistorySchema);
