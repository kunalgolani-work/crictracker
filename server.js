require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const playerRoutes = require('./routes/players');
const teamRoutes = require('./routes/teams');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/players', playerRoutes);
app.use('/api/teams', teamRoutes);

app.get('/', (_req, res) => {
  res.json({ status: 'CricTracker API is running' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
