const express = require('express');
const Match = require('../models/Match');
const Player = require('../models/Player');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// --------------- helpers ---------------

function getInnings(match) {
  return match.innings[match.currentInnings];
}

function getStriker(inn) {
  return inn.batsmen.find((b) => b.isOnStrike && b.isAtCrease);
}

function getNonStriker(inn) {
  return inn.batsmen.find((b) => !b.isOnStrike && b.isAtCrease);
}

function getCurrentBowler(inn) {
  return inn.bowlers.find((b) => b.isCurrentBowler);
}

function swapStrike(inn) {
  inn.batsmen.forEach((b) => {
    if (b.isAtCrease) b.isOnStrike = !b.isOnStrike;
  });
}

function oversString(overs, balls) {
  return `${overs}.${balls}`;
}

function populateMatch(query) {
  return query
    .populate('teamA', 'name players')
    .populate('teamB', 'name players')
    .populate('tossWinner', 'name')
    .populate('winner', 'name')
    .populate({
      path: 'teamA',
      populate: { path: 'players', select: 'name role jersey' },
    })
    .populate({
      path: 'teamB',
      populate: { path: 'players', select: 'name role jersey' },
    });
}

// --------------- CRUD ---------------

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { teamA, teamB, totalOvers, tossWinner, tossDecision } = req.body;

    if (!teamA || !teamB || !totalOvers) {
      return res
        .status(400)
        .json({ error: 'teamA, teamB and totalOvers are required' });
    }

    const match = await Match.create({
      teamA,
      teamB,
      totalOvers,
      tossWinner: tossWinner || null,
      tossDecision: tossDecision || null,
      status: 'setup',
      currentInnings: 0,
      innings: [],
      createdBy: req.user._id,
    });

    const populated = await populateMatch(Match.findById(match._id));
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (_req, res) => {
  try {
    const matches = await populateMatch(
      Match.find().sort({ createdAt: -1 })
    );
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/live', async (_req, res) => {
  try {
    const match = await populateMatch(Match.findOne({ status: 'live' }));
    if (!match) return res.json(null);
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const match = await populateMatch(Match.findById(req.params.id));
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const match = await Match.findByIdAndDelete(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ message: 'Match deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------- Start innings ---------------

router.post(
  '/:id/start-innings',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const match = await Match.findById(req.params.id);
      if (!match) return res.status(404).json({ error: 'Match not found' });

      const { battingTeamId, strikerId, nonStrikerId, bowlerId } = req.body;
      if (!battingTeamId || !strikerId || !nonStrikerId || !bowlerId) {
        return res.status(400).json({
          error:
            'battingTeamId, strikerId, nonStrikerId, bowlerId are required',
        });
      }

      const bowlingTeamId = match.teamA.toString() === battingTeamId
        ? match.teamB.toString()
        : match.teamA.toString();

      match.innings.push({
        battingTeam: battingTeamId,
        bowlingTeam: bowlingTeamId,
        totalRuns: 0,
        wickets: 0,
        overs: 0,
        balls: 0,
        extras: { wides: 0, noBalls: 0, legByes: 0, byes: 0, total: 0 },
        batsmen: [
          {
            player: strikerId,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            isOut: false,
            dismissal: null,
            isOnStrike: true,
            isAtCrease: true,
          },
          {
            player: nonStrikerId,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            isOut: false,
            dismissal: null,
            isOnStrike: false,
            isAtCrease: true,
          },
        ],
        bowlers: [
          {
            player: bowlerId,
            overs: 0,
            balls: 0,
            maidens: 0,
            runs: 0,
            wickets: 0,
            wides: 0,
            noBalls: 0,
            isCurrentBowler: true,
          },
        ],
        ballLog: [],
        fallOfWickets: [],
        currentOverRuns: 0,
        isCompleted: false,
      });

      match.currentInnings = match.innings.length - 1;
      match.status = 'live';
      await match.save();

      const populated = await populateMatch(Match.findById(match._id));
      res.json(populated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// --------------- Log a ball ---------------

router.post('/:id/ball', authenticate, requireAdmin, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.status !== 'live') {
      return res.status(400).json({ error: 'Match is not live' });
    }

    const inn = getInnings(match);
    if (inn.isCompleted) {
      return res.status(400).json({ error: 'Innings is completed' });
    }

    const { runs = 0, extraType = null, extraRuns = 0, isWicket = false, wicketType = null, outBatsmanId = null, fielderId = null } = req.body;

    const striker = getStriker(inn);
    const bowler = getCurrentBowler(inn);
    if (!striker || !bowler) {
      return res.status(400).json({ error: 'No striker or bowler set' });
    }

    const isWide = extraType === 'wide';
    const isNoBall = extraType === 'no_ball';
    const isLegBye = extraType === 'leg_bye';
    const isBye = extraType === 'bye';
    const isLegal = !isWide && !isNoBall;

    let totalRunsThisBall = 0;
    let batsmanRuns = 0;
    let bowlerRuns = 0;

    if (isWide) {
      totalRunsThisBall = 1 + extraRuns;
      bowlerRuns = 1 + extraRuns;
      inn.extras.wides += 1 + extraRuns;
      inn.extras.total += 1 + extraRuns;
      bowler.wides += 1;
    } else if (isNoBall) {
      totalRunsThisBall = 1 + runs + extraRuns;
      batsmanRuns = runs;
      bowlerRuns = 1 + runs + extraRuns;
      inn.extras.noBalls += 1;
      inn.extras.total += 1 + extraRuns;
      bowler.noBalls += 1;
      striker.balls += 1;
    } else if (isLegBye) {
      totalRunsThisBall = extraRuns;
      bowlerRuns = 0;
      inn.extras.legByes += extraRuns;
      inn.extras.total += extraRuns;
      striker.balls += 1;
    } else if (isBye) {
      totalRunsThisBall = extraRuns;
      bowlerRuns = 0;
      inn.extras.byes += extraRuns;
      inn.extras.total += extraRuns;
      striker.balls += 1;
    } else {
      totalRunsThisBall = runs;
      batsmanRuns = runs;
      bowlerRuns = runs;
      striker.balls += 1;
    }

    striker.runs += batsmanRuns;
    if (batsmanRuns === 4) striker.fours += 1;
    if (batsmanRuns === 6) striker.sixes += 1;

    inn.totalRuns += totalRunsThisBall;
    bowler.runs += bowlerRuns;

    let ballNumForLog;
    if (isLegal) {
      inn.balls += 1;
      bowler.balls += 1;
      ballNumForLog = inn.balls;
    } else {
      ballNumForLog = inn.balls + 1;
    }

    const ball = {
      overNum: inn.overs,
      ballNum: ballNumForLog,
      batsman: striker.player,
      bowler: bowler.player,
      runs: batsmanRuns,
      extras: { type: extraType, runs: isWide ? 1 + extraRuns : isNoBall ? 1 + extraRuns : extraRuns },
      isWicket,
      wicket: isWicket
        ? {
            type: wicketType,
            batsman: outBatsmanId || striker.player,
            fielder: fielderId || null,
          }
        : { type: null, batsman: null, fielder: null },
      isLegal,
      timestamp: new Date(),
    };
    inn.ballLog.push(ball);

    if (isWicket) {
      const outBatsman = outBatsmanId
        ? inn.batsmen.find((b) => b.player.toString() === outBatsmanId)
        : striker;

      if (outBatsman) {
        outBatsman.isOut = true;
        outBatsman.isAtCrease = false;
        outBatsman.isOnStrike = false;
        outBatsman.dismissal = {
          type: wicketType,
          bowler: ['bowled', 'caught', 'lbw', 'hit_wicket', 'stumped'].includes(wicketType)
            ? bowler.player
            : null,
          fielder: fielderId || null,
        };
      }
      inn.wickets += 1;
      bowler.wickets += 1;

      inn.fallOfWickets.push({
        wicketNum: inn.wickets,
        runs: inn.totalRuns,
        oversStr: oversString(inn.overs, inn.balls > 6 ? inn.balls % 6 : inn.balls),
        batsman: outBatsman ? outBatsman.player : striker.player,
      });
    }

    const runsForStrikeSwap = isLegBye || isBye ? extraRuns : batsmanRuns + (isWide ? extraRuns : 0);
    const shouldSwap = runsForStrikeSwap % 2 === 1;

    if (isLegal && inn.balls >= 6) {
      inn.overs += 1;
      inn.balls = 0;

      const ballsInThisOver = inn.ballLog.filter(
        (b) => b.overNum === inn.overs - 1 && b.isLegal
      );
      const overRuns = ballsInThisOver.reduce((sum, b) => sum + b.runs + (b.extras.runs || 0), 0);
      if (overRuns === 0) bowler.maidens += 1;
      bowler.overs += 1;
      bowler.balls = 0;
      bowler.isCurrentBowler = false;

      if (!shouldSwap) {
        swapStrike(inn);
      }
    } else if (shouldSwap && !isWicket) {
      swapStrike(inn);
    }

    const totalPlayersOnTeam = await getTeamPlayerCount(inn.battingTeam);
    const maxWickets = totalPlayersOnTeam - 1;
    const allOut = inn.wickets >= maxWickets;
    const oversComplete = inn.overs >= match.totalOvers && inn.balls === 0;

    if (match.currentInnings === 1) {
      const target = match.innings[0].totalRuns + 1;
      if (inn.totalRuns >= target) {
        inn.isCompleted = true;
      }
    }

    if (allOut || oversComplete) {
      inn.isCompleted = true;
    }

    await match.save();
    const populated = await populateMatch(Match.findById(match._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function getTeamPlayerCount(teamId) {
  const Team = require('../models/Team');
  const team = await Team.findById(teamId);
  return team ? team.players.length : 11;
}

// --------------- Undo last ball ---------------

router.post('/:id/undo', authenticate, requireAdmin, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const inn = getInnings(match);
    if (!inn || inn.ballLog.length === 0) {
      return res.status(400).json({ error: 'No balls to undo' });
    }

    const lastBall = inn.ballLog.pop();

    if (lastBall.isWicket) {
      const outBatsman = inn.batsmen.find(
        (b) =>
          b.player.toString() ===
          (lastBall.wicket.batsman?.toString() || lastBall.batsman.toString())
      );
      if (outBatsman) {
        outBatsman.isOut = false;
        outBatsman.isAtCrease = true;
        outBatsman.dismissal = null;
      }
      inn.wickets -= 1;
      inn.fallOfWickets.pop();

      const bowlerEntry = inn.bowlers.find(
        (b) => b.player.toString() === lastBall.bowler.toString()
      );
      if (bowlerEntry) bowlerEntry.wickets -= 1;

      const newBatsman = inn.batsmen.find(
        (b) =>
          b.player.toString() !== outBatsman?.player.toString() &&
          b.balls === 0 &&
          b.runs === 0 &&
          !b.isOut
      );
      if (newBatsman && newBatsman !== outBatsman) {
        inn.batsmen = inn.batsmen.filter(
          (b) => b.player.toString() !== newBatsman.player.toString()
        );
      }

      if (outBatsman) {
        outBatsman.isOnStrike =
          lastBall.batsman.toString() === outBatsman.player.toString();
      }
    }

    const extraType = lastBall.extras?.type;
    const isWide = extraType === 'wide';
    const isNoBall = extraType === 'no_ball';
    const isLegBye = extraType === 'leg_bye';
    const isBye = extraType === 'bye';

    let totalRunsThisBall = 0;
    let batsmanRuns = 0;
    let bowlerRuns = 0;

    const bowlerEntry = inn.bowlers.find(
      (b) => b.player.toString() === lastBall.bowler.toString()
    );

    if (isWide) {
      const wideRuns = lastBall.extras.runs || 1;
      totalRunsThisBall = wideRuns;
      bowlerRuns = wideRuns;
      inn.extras.wides -= wideRuns;
      inn.extras.total -= wideRuns;
      if (bowlerEntry) {
        bowlerEntry.wides -= 1;
        bowlerEntry.runs -= bowlerRuns;
      }
    } else if (isNoBall) {
      const nbRuns = lastBall.extras.runs || 1;
      batsmanRuns = lastBall.runs;
      totalRunsThisBall = nbRuns + batsmanRuns;
      bowlerRuns = nbRuns + batsmanRuns;
      inn.extras.noBalls -= 1;
      inn.extras.total -= nbRuns;
      if (bowlerEntry) {
        bowlerEntry.noBalls -= 1;
        bowlerEntry.runs -= bowlerRuns;
      }
    } else if (isLegBye) {
      const lbRuns = lastBall.extras.runs || 0;
      totalRunsThisBall = lbRuns;
      inn.extras.legByes -= lbRuns;
      inn.extras.total -= lbRuns;
    } else if (isBye) {
      const byeRuns = lastBall.extras.runs || 0;
      totalRunsThisBall = byeRuns;
      inn.extras.byes -= byeRuns;
      inn.extras.total -= byeRuns;
    } else {
      batsmanRuns = lastBall.runs;
      totalRunsThisBall = batsmanRuns;
      bowlerRuns = batsmanRuns;
      if (bowlerEntry) bowlerEntry.runs -= bowlerRuns;
    }

    inn.totalRuns -= totalRunsThisBall;

    const striker = inn.batsmen.find(
      (b) => b.player.toString() === lastBall.batsman.toString()
    );
    if (striker && !isWide) {
      striker.runs -= batsmanRuns;
      striker.balls -= 1;
      if (batsmanRuns === 4) striker.fours -= 1;
      if (batsmanRuns === 6) striker.sixes -= 1;
    }

    if (lastBall.isLegal) {
      if (inn.balls === 0) {
        inn.overs -= 1;
        inn.balls = 5;
        if (bowlerEntry) {
          bowlerEntry.overs -= 1;
          bowlerEntry.balls = 5;
          bowlerEntry.isCurrentBowler = true;

          const prevOverBalls = inn.ballLog.filter(
            (b) => b.overNum === inn.overs && b.isLegal
          );
          const prevOverRuns = prevOverBalls.reduce(
            (sum, b) => sum + b.runs + (b.extras.runs || 0),
            0
          );
          if (prevOverRuns === 0 && prevOverBalls.length === 5) {
            // maiden was counted prematurely, but we can't know for sure, so we won't touch it here
          }
        }
        // Undo the end-of-over strike swap
        const runsForSwap = isLegBye || isBye
          ? (lastBall.extras?.runs || 0)
          : batsmanRuns + (isWide ? (lastBall.extras?.runs || 0) - 1 : 0);
        if (runsForSwap % 2 === 0) {
          swapStrike(inn);
        }
      } else {
        inn.balls -= 1;
        if (bowlerEntry) bowlerEntry.balls -= 1;

        const runsForSwap = isLegBye || isBye
          ? (lastBall.extras?.runs || 0)
          : batsmanRuns;
        if (runsForSwap % 2 === 1 && !lastBall.isWicket) {
          swapStrike(inn);
        }
      }
    } else {
      const runsForSwap = isWide
        ? (lastBall.extras?.runs || 1) - 1
        : batsmanRuns;
      if (runsForSwap % 2 === 1) {
        swapStrike(inn);
      }
    }

    inn.isCompleted = false;

    await match.save();
    const populated = await populateMatch(Match.findById(match._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------- Change bowler ---------------

router.post(
  '/:id/change-bowler',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const match = await Match.findById(req.params.id);
      if (!match) return res.status(404).json({ error: 'Match not found' });

      const inn = getInnings(match);
      const { bowlerId } = req.body;
      if (!bowlerId) {
        return res.status(400).json({ error: 'bowlerId is required' });
      }

      inn.bowlers.forEach((b) => (b.isCurrentBowler = false));

      let bowlerEntry = inn.bowlers.find(
        (b) => b.player.toString() === bowlerId
      );
      if (bowlerEntry) {
        bowlerEntry.isCurrentBowler = true;
      } else {
        inn.bowlers.push({
          player: bowlerId,
          overs: 0,
          balls: 0,
          maidens: 0,
          runs: 0,
          wickets: 0,
          wides: 0,
          noBalls: 0,
          isCurrentBowler: true,
        });
      }

      await match.save();
      const populated = await populateMatch(Match.findById(match._id));
      res.json(populated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// --------------- Change batsman (after wicket) ---------------

router.post(
  '/:id/change-batsman',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const match = await Match.findById(req.params.id);
      if (!match) return res.status(404).json({ error: 'Match not found' });

      const inn = getInnings(match);
      const { batsmanId, onStrike = true } = req.body;
      if (!batsmanId) {
        return res.status(400).json({ error: 'batsmanId is required' });
      }

      const existing = inn.batsmen.find(
        (b) => b.player.toString() === batsmanId
      );
      if (existing) {
        return res.status(400).json({ error: 'Batsman already in the innings' });
      }

      if (onStrike) {
        inn.batsmen.forEach((b) => {
          if (b.isAtCrease) b.isOnStrike = false;
        });
      }

      inn.batsmen.push({
        player: batsmanId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        isOut: false,
        dismissal: null,
        isOnStrike: onStrike,
        isAtCrease: true,
      });

      await match.save();
      const populated = await populateMatch(Match.findById(match._id));
      res.json(populated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// --------------- End innings ---------------

router.post(
  '/:id/end-innings',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const match = await Match.findById(req.params.id);
      if (!match) return res.status(404).json({ error: 'Match not found' });

      const inn = getInnings(match);
      inn.isCompleted = true;
      inn.bowlers.forEach((b) => (b.isCurrentBowler = false));
      inn.batsmen.forEach((b) => {
        b.isOnStrike = false;
        if (b.isAtCrease && !b.isOut) b.isAtCrease = false;
      });

      await match.save();
      const populated = await populateMatch(Match.findById(match._id));
      res.json(populated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// --------------- Complete match (with stats aggregation) ---------------

router.post(
  '/:id/complete',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const match = await Match.findById(req.params.id);
      if (!match) return res.status(404).json({ error: 'Match not found' });

      match.innings.forEach((inn) => (inn.isCompleted = true));

      if (match.innings.length === 2) {
        const inn1 = match.innings[0];
        const inn2 = match.innings[1];

        const Team = require('../models/Team');
        const teamADoc = await Team.findById(match.teamA).select('name');
        const teamBDoc = await Team.findById(match.teamB).select('name');
        function teamNameFor(battingTeamId) {
          const id = battingTeamId.toString();
          if (id === match.teamA.toString()) return teamADoc?.name || 'Team A';
          return teamBDoc?.name || 'Team B';
        }

        if (inn2.totalRuns > inn1.totalRuns) {
          match.winner = inn2.battingTeam;
          const wicketsLeft =
            (await getTeamPlayerCount(inn2.battingTeam)) -
            1 -
            inn2.wickets;
          match.result = `${teamNameFor(inn2.battingTeam)} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
        } else if (inn1.totalRuns > inn2.totalRuns) {
          match.winner = inn1.battingTeam;
          const runDiff = inn1.totalRuns - inn2.totalRuns;
          match.result = `${teamNameFor(inn1.battingTeam)} won by ${runDiff} run${runDiff !== 1 ? 's' : ''}`;
        } else {
          match.result = 'Match Tied';
        }
      }

      const { result, winner } = req.body;
      if (result) match.result = result;
      if (winner) match.winner = winner;

      match.status = 'completed';
      await match.save();

      try {
        await aggregatePlayerStats(match);
      } catch (statsErr) {
        console.error('Stats aggregation error (non-fatal):', statsErr);
      }

      const populated = await populateMatch(Match.findById(match._id));
      res.json(populated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

async function aggregatePlayerStats(match) {
  const playerMap = {};

  for (const inn of match.innings) {
    for (const bat of inn.batsmen) {
      const pid = bat.player.toString();
      if (!playerMap[pid]) playerMap[pid] = { batting: null, bowling: null };
      playerMap[pid].batting = bat;
    }
    for (const bowl of inn.bowlers) {
      const pid = bowl.player.toString();
      if (!playerMap[pid]) playerMap[pid] = { batting: null, bowling: null };
      playerMap[pid].bowling = bowl;
    }
  }

  for (const [playerId, data] of Object.entries(playerMap)) {
    try {
      const player = await Player.findById(playerId);
      if (!player) continue;

      player.batting.matches += 1;

      if (data.batting) {
        const b = data.batting;
        player.batting.innings += 1;
        player.batting.runs += b.runs;
        player.batting.ballsFaced += b.balls;
        player.batting.fours += b.fours;
        player.batting.sixes += b.sixes;
        if (!b.isOut) player.batting.notOuts += 1;
        if (b.runs > player.batting.highestScore) {
          player.batting.highestScore = b.runs;
        }
        if (b.runs >= 100) player.batting.hundreds += 1;
        else if (b.runs >= 50) player.batting.fifties += 1;
      }

      if (data.bowling && data.bowling.balls > 0) {
        const bw = data.bowling;
        player.bowling.innings += 1;
        player.bowling.oversBowled += bw.overs;
        player.bowling.ballsBowled += bw.overs * 6 + bw.balls;
        player.bowling.maidens += bw.maidens;
        player.bowling.runsConceded += bw.runs;
        player.bowling.wickets += bw.wickets;

        if (
          bw.wickets > player.bowling.bestWickets ||
          (bw.wickets === player.bowling.bestWickets &&
            bw.runs < player.bowling.bestRuns)
        ) {
          player.bowling.bestWickets = bw.wickets;
          player.bowling.bestRuns = bw.runs;
        }
        if (bw.wickets >= 5) player.bowling.fiveWickets += 1;
        else if (bw.wickets >= 4) player.bowling.fourWickets += 1;
      }

      await player.save();
    } catch (err) {
      console.error(`Failed to aggregate stats for player ${playerId}:`, err);
    }
  }
}

module.exports = router;
