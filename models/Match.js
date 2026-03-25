const mongoose = require('mongoose');

const dismissalSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'bowled',
        'caught',
        'lbw',
        'run_out',
        'stumped',
        'hit_wicket',
        'retired',
      ],
    },
    bowler: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    fielder: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
  },
  { _id: false }
);

const batsmanInningsSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    runs: { type: Number, default: 0 },
    balls: { type: Number, default: 0 },
    fours: { type: Number, default: 0 },
    sixes: { type: Number, default: 0 },
    isOut: { type: Boolean, default: false },
    dismissal: { type: dismissalSchema, default: null },
    isOnStrike: { type: Boolean, default: false },
    isAtCrease: { type: Boolean, default: false },
  },
  { _id: false }
);

const bowlerInningsSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    overs: { type: Number, default: 0 },
    balls: { type: Number, default: 0 },
    maidens: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    wides: { type: Number, default: 0 },
    noBalls: { type: Number, default: 0 },
    isCurrentBowler: { type: Boolean, default: false },
  },
  { _id: false }
);

const ballSchema = new mongoose.Schema(
  {
    overNum: { type: Number, required: true },
    ballNum: { type: Number, required: true },
    batsman: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    bowler: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    runs: { type: Number, default: 0 },
    extras: {
      type: { type: String, enum: ['wide', 'no_ball', 'leg_bye', 'bye', null], default: null },
      runs: { type: Number, default: 0 },
    },
    isWicket: { type: Boolean, default: false },
    wicket: {
      type: { type: String, enum: ['bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', null], default: null },
      batsman: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
      fielder: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    },
    isLegal: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const fowSchema = new mongoose.Schema(
  {
    wicketNum: { type: Number, required: true },
    runs: { type: Number, required: true },
    oversStr: { type: String, required: true },
    batsman: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
  },
  { _id: false }
);

const inningsSchema = new mongoose.Schema(
  {
    battingTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    bowlingTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    totalRuns: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    overs: { type: Number, default: 0 },
    balls: { type: Number, default: 0 },
    extras: {
      wides: { type: Number, default: 0 },
      noBalls: { type: Number, default: 0 },
      legByes: { type: Number, default: 0 },
      byes: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    batsmen: [batsmanInningsSchema],
    bowlers: [bowlerInningsSchema],
    ballLog: [ballSchema],
    fallOfWickets: [fowSchema],
    currentOverRuns: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false },
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    teamA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    teamB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    totalOvers: { type: Number, required: true, min: 1, max: 50 },
    tossWinner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    tossDecision: { type: String, enum: ['bat', 'bowl'] },
    status: {
      type: String,
      enum: ['setup', 'live', 'completed'],
      default: 'setup',
    },
    currentInnings: { type: Number, default: 0 },
    innings: [inningsSchema],
    result: { type: String, default: '' },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', matchSchema);
