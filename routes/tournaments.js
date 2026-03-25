const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const Team = require('../models/Team');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function populateTournament(query) {
  return query
    .populate('teamA', 'name players')
    .populate('teamB', 'name players')
    .populate('playerOfTournament', 'name role jersey')
    .populate({
      path: 'matches',
      populate: [
        { path: 'teamA', select: 'name' },
        { path: 'teamB', select: 'name' },
        { path: 'winner', select: 'name' },
      ],
    });
}

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, teamA, teamB, totalMatches } = req.body;
    if (!name || !teamA || !teamB || !totalMatches) {
      return res.status(400).json({ error: 'name, teamA, teamB and totalMatches are required' });
    }
    const tournament = await Tournament.create({
      name,
      teamA,
      teamB,
      totalMatches,
      createdBy: req.user._id,
    });
    const populated = await populateTournament(Tournament.findById(tournament._id));
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (_req, res) => {
  try {
    const tournaments = await populateTournament(
      Tournament.find().sort({ createdAt: -1 })
    );
    res.json(tournaments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const tournament = await populateTournament(Tournament.findById(req.params.id));
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/add-match', authenticate, requireAdmin, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const { matchId } = req.body;
    if (!matchId) return res.status(400).json({ error: 'matchId is required' });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    if (tournament.matches.some((m) => m.toString() === matchId)) {
      return res.status(400).json({ error: 'Match already in this tournament' });
    }

    match.tournament = tournament._id;
    await match.save();

    tournament.matches.push(matchId);
    recalculateTally(tournament, await Match.find({ _id: { $in: tournament.matches } }));
    if (tournament.status === 'upcoming') tournament.status = 'live';
    await tournament.save();

    const populated = await populateTournament(Tournament.findById(tournament._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/complete', authenticate, requireAdmin, async (req, res) => {
  try {
    const tournament = await populateTournament(Tournament.findById(req.params.id));
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const teamAName = tournament.teamA?.name || 'Team A';
    const teamBName = tournament.teamB?.name || 'Team B';

    if (tournament.teamAWins > tournament.teamBWins) {
      tournament.result = `${teamAName} won ${tournament.teamAWins}-${tournament.teamBWins}`;
    } else if (tournament.teamBWins > tournament.teamAWins) {
      tournament.result = `${teamBName} won ${tournament.teamBWins}-${tournament.teamAWins}`;
    } else {
      tournament.result = `Series drawn ${tournament.teamAWins}-${tournament.teamBWins}`;
    }

    const { playerOfTournament } = req.body;
    if (playerOfTournament) {
      tournament.playerOfTournament = playerOfTournament;
    } else {
      const stats = computeTournamentStats(tournament);
      if (stats.topRunScorer) {
        tournament.playerOfTournament = stats.topRunScorer.playerId;
      }
    }

    tournament.status = 'completed';
    await tournament.save();

    const populated = await populateTournament(Tournament.findById(tournament._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/stats', async (req, res) => {
  try {
    const tournament = await populateTournament(Tournament.findById(req.params.id));
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const stats = computeTournamentStats(tournament);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    await Match.updateMany(
      { _id: { $in: tournament.matches } },
      { $set: { tournament: null } }
    );

    await Tournament.findByIdAndDelete(req.params.id);
    res.json({ message: 'Tournament deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function recalculateTally(tournament, matches) {
  let aWins = 0, bWins = 0, draws = 0;
  const teamAId = tournament.teamA.toString();

  for (const m of matches) {
    if (m.status !== 'completed') continue;
    if (!m.winner) {
      draws++;
    } else if (m.winner.toString() === teamAId) {
      aWins++;
    } else {
      bWins++;
    }
  }
  tournament.teamAWins = aWins;
  tournament.teamBWins = bWins;
  tournament.draws = draws;
}

function computeTournamentStats(tournament) {
  const batting = {};
  const bowling = {};

  for (const match of tournament.matches) {
    if (!match.innings) continue;
    for (const inn of match.innings) {
      if (inn.batsmen) {
        for (const bat of inn.batsmen) {
          const pid = bat.player.toString();
          if (!batting[pid]) {
            batting[pid] = { playerId: pid, playerName: '', runs: 0, balls: 0, fours: 0, sixes: 0, innings: 0, outs: 0 };
          }
          batting[pid].runs += bat.runs;
          batting[pid].balls += bat.balls;
          batting[pid].fours += bat.fours;
          batting[pid].sixes += bat.sixes;
          batting[pid].innings += 1;
          if (bat.isOut) batting[pid].outs += 1;
        }
      }
      if (inn.bowlers) {
        for (const bowl of inn.bowlers) {
          const pid = bowl.player.toString();
          if (!bowling[pid]) {
            bowling[pid] = { playerId: pid, playerName: '', overs: 0, balls: 0, runs: 0, wickets: 0, maidens: 0 };
          }
          bowling[pid].overs += bowl.overs;
          bowling[pid].balls += bowl.balls;
          bowling[pid].runs += bowl.runs;
          bowling[pid].wickets += bowl.wickets;
          bowling[pid].maidens += bowl.maidens;
        }
      }
    }
  }

  const batArray = Object.values(batting);
  const bowlArray = Object.values(bowling);

  const mostSixes = batArray.length ? batArray.reduce((a, b) => (b.sixes > a.sixes ? b : a)) : null;
  const topRunScorer = batArray.length ? batArray.reduce((a, b) => (b.runs > a.runs ? b : a)) : null;
  const bestStrikeRate = batArray.filter((b) => b.balls >= 6).length
    ? batArray.filter((b) => b.balls >= 6).reduce((a, b) => {
        const srA = (a.runs / a.balls) * 100;
        const srB = (b.runs / b.balls) * 100;
        return srB > srA ? b : a;
      })
    : null;

  const mostWickets = bowlArray.length ? bowlArray.reduce((a, b) => (b.wickets > a.wickets ? b : a)) : null;
  const bestEconomy = bowlArray.filter((b) => b.overs * 6 + b.balls >= 6).length
    ? bowlArray.filter((b) => b.overs * 6 + b.balls >= 6).reduce((a, b) => {
        const totalBallsA = a.overs * 6 + a.balls;
        const totalBallsB = b.overs * 6 + b.balls;
        const ecoA = totalBallsA > 0 ? (a.runs / totalBallsA) * 6 : 999;
        const ecoB = totalBallsB > 0 ? (b.runs / totalBallsB) * 6 : 999;
        return ecoB < ecoA ? b : a;
      })
    : null;

  return {
    mostSixes,
    topRunScorer,
    bestStrikeRate,
    mostWickets,
    bestEconomy,
    battingLeaderboard: batArray.sort((a, b) => b.runs - a.runs).slice(0, 10),
    bowlingLeaderboard: bowlArray.sort((a, b) => b.wickets - a.wickets).slice(0, 10),
  };
}

module.exports = router;
module.exports.recalculateTally = recalculateTally;
