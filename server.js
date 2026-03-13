require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./lib/mongodb');

const playerRoutes = require('./routes/players');
const teamRoutes = require('./routes/teams');

const app = express();

app.use(cors());
app.use(express.json());

app.use(async (_req, _res, next) => {
  await connectDB();
  next();
});

app.use('/api/players', playerRoutes);
app.use('/api/teams', teamRoutes);

app.get('/', (_req, res) => {
  res.json({ status: 'CricTracker API is running' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

module.exports = app;
