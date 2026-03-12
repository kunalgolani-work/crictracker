const express = require('express');
const Team = require('../models/Team');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const teams = await Team.find()
      .populate('players', 'name role jersey batting bowling fielding')
      .sort({ createdAt: -1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).populate(
      'players',
      'name role jersey batting bowling fielding'
    );
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const team = await Team.create({
      name: req.body.name,
      players: req.body.players || [],
    });
    const populated = await team.populate(
      'players',
      'name role jersey batting bowling fielding'
    );
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { name: req.body.name, players: req.body.players },
      { new: true }
    ).populate('players', 'name role jersey batting bowling fielding');
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-generate N balanced teams from a list of player IDs
router.post('/generate', async (req, res) => {
  try {
    const { playerIds, teamCount, teamNames } = req.body;

    if (!playerIds?.length || !teamCount || teamCount < 2) {
      return res
        .status(400)
        .json({ error: 'Provide playerIds and teamCount (>= 2)' });
    }

    // Shuffle players for random distribution
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);

    const buckets = Array.from({ length: teamCount }, () => []);
    shuffled.forEach((id, i) => {
      buckets[i % teamCount].push(id);
    });

    const created = [];
    for (let i = 0; i < teamCount; i++) {
      const name =
        teamNames?.[i] || `Team ${String.fromCharCode(65 + i)}`;
      const team = await Team.create({ name, players: buckets[i] });
      const populated = await team.populate(
        'players',
        'name role jersey batting bowling fielding'
      );
      created.push(populated);
    }

    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
