const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    teamA: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    teamB: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    totalMatches: { type: Number, required: true, min: 1, max: 20 },
    matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Match' }],
    status: {
      type: String,
      enum: ['upcoming', 'live', 'completed'],
      default: 'upcoming',
    },
    teamAWins: { type: Number, default: 0 },
    teamBWins: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    result: { type: String, default: '' },
    playerOfTournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tournament', tournamentSchema);
