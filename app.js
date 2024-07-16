import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pg from 'pg';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

const apiKey = 'f569680204dc4b14b5f81f58260d1d19';
const apiBaseURL = 'http://api.football-data.org/v4';

// PostgreSQL pool setup
const db = new pg.Client({
  user: 'postgres',
  host: 'localhost',
  database: 'FOOTSCORE',
  password: 'Devansh@222',
  port: 5432,
});

// Connect to PostgreSQL
db.connect()
  .then(() => console.log('PostgreSQL connected'))
  .catch(err => console.error('PostgreSQL connection error', err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Set up EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Routes
// Index route
app.get('/', async (req, res) => {
  try {
    const apiResponse = await axios.get(`${apiBaseURL}/matches`, {
      headers: { 'X-Auth-Token': apiKey },
      params: { dateFrom: '2024-07-15', dateTo: '2024-07-22' }, // Adjust dates as needed
    });
    const matches = apiResponse.data.matches;
    res.render('index', { title: 'Football Portal', matches });
  } catch (err) {
    console.error('Error fetching matches:', err);
    res.status(500).send('Server Error');
  }
});

// Teams route
app.get('/teams', async (req, res) => {
  try {
    const apiResponse = await axios.get(`${apiBaseURL}/teams`, {
      headers: { 'X-Auth-Token': apiKey },
    });
    const teams = apiResponse.data.teams;
    res.render('teams', { title: 'Teams', teams });
  } catch (err) {
    console.error('Error fetching teams:', err);
    res.status(500).send('Server Error');
  }
});

// Players route
app.get('/players', async (req, res) => {
  try {
    const apiResponse = await axios.get(`${apiBaseURL}/players`, {
      headers: { 'X-Auth-Token': apiKey },
    });
    const players = apiResponse.data.players;
    res.render('players', { title: 'Players', players });
  } catch (err) {
    console.error('Error fetching players:', err);
    res.status(500).send('Server Error');
  }
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
