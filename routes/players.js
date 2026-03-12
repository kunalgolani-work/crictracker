const express = require('express');
const Player = require('../models/Player');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const players = await Player.find().sort({ createdAt: -1 });
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const player = await Player.create({
      name: req.body.name,
      role: req.body.role,
      jersey: req.body.jersey || '-',
    });
    res.status(201).json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const player = await Player.findByIdAndDelete(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json({ message: 'Player deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/batting', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const s = req.body;
    player.batting.matches += 1;
    player.batting.innings += 1;
    player.batting.runs += s.runs || 0;
    player.batting.ballsFaced += s.ballsFaced || 0;
    player.batting.fours += s.fours || 0;
    player.batting.sixes += s.sixes || 0;
    if (s.notOut) player.batting.notOuts += 1;
    if ((s.runs || 0) > player.batting.highestScore)
      player.batting.highestScore = s.runs;
    if (s.runs >= 100) player.batting.hundreds += 1;
    else if (s.runs >= 50) player.batting.fifties += 1;

    await player.save();
    res.json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/bowling', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const s = req.body;
    const overs = s.overs || 0;
    const wickets = s.wickets || 0;
    const runsConceded = s.runsConceded || 0;

    player.bowling.innings += 1;
    player.bowling.oversBowled += overs;
    player.bowling.ballsBowled += overs * 6 + (s.extraBalls || 0);
    player.bowling.maidens += s.maidens || 0;
    player.bowling.runsConceded += runsConceded;
    player.bowling.wickets += wickets;

    if (
      wickets > player.bowling.bestWickets ||
      (wickets === player.bowling.bestWickets &&
        runsConceded < player.bowling.bestRuns)
    ) {
      player.bowling.bestWickets = wickets;
      player.bowling.bestRuns = runsConceded;
    }
    if (wickets >= 5) player.bowling.fiveWickets += 1;
    else if (wickets >= 4) player.bowling.fourWickets += 1;

    await player.save();
    res.json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
