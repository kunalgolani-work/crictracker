const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      required: true,
      enum: ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'],
    },
    jersey: { type: String, default: '-' },
    batting: {
      matches: { type: Number, default: 0 },
      innings: { type: Number, default: 0 },
      runs: { type: Number, default: 0 },
      ballsFaced: { type: Number, default: 0 },
      fours: { type: Number, default: 0 },
      sixes: { type: Number, default: 0 },
      notOuts: { type: Number, default: 0 },
      highestScore: { type: Number, default: 0 },
      fifties: { type: Number, default: 0 },
      hundreds: { type: Number, default: 0 },
    },
    bowling: {
      innings: { type: Number, default: 0 },
      oversBowled: { type: Number, default: 0 },
      ballsBowled: { type: Number, default: 0 },
      maidens: { type: Number, default: 0 },
      runsConceded: { type: Number, default: 0 },
      wickets: { type: Number, default: 0 },
      bestWickets: { type: Number, default: 0 },
      bestRuns: { type: Number, default: 0 },
      fourWickets: { type: Number, default: 0 },
      fiveWickets: { type: Number, default: 0 },
    },
    fielding: {
      catches: { type: Number, default: 0 },
      runOuts: { type: Number, default: 0 },
      stumpings: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Player', playerSchema);
