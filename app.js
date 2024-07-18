import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pg from 'pg';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import flash from 'connect-flash';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

const apiKey = 'f569680204dc4b14b5f81f58260d1d19';
const apiBaseURL = 'http://api.football-data.org/v4';

// PostgreSQL client setup
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
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
}));
app.use(flash());

// Set up EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
async function fetchAllTeamData(apiKey) {
  try {
    const teamsUrl = `https://api.api-football.com/v2/teams`;
    const response = await axios.get(teamsUrl, {
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'api.api-football.com' },
    });

    const teamsData = response.data.api.teams;

    for (const team of teamsData) {
      const teamId = team.team_id;
      const teamQuery = `INSERT INTO teams (id, name, short_name, tla, crest_url, squad_market_value) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`;
      const teamValues = [
        teamId,
        team.name,
        team.shortName,
        team.tla,
        team.crestUrl,
        team.squadMarketValue,
      ];

      console.log(`Executing query: ${teamQuery} with values ${teamValues}`);
      await db.query(teamQuery, teamValues);

      // Fetch fixtures for the team
      const fixturesUrl = `https://api.api-football.com/v2/fixtures/team/${teamId}`;
      console.log(`Fetching fixtures for team ${team.name}...`);
      const fixturesResponse = await axios.get(fixturesUrl, {
        headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'api.api-football.com' },
      });
      const fixturesData = fixturesResponse.data.api.fixtures;

      // Insert fixtures into database
      for (const fixture of fixturesData) {
        const fixtureQuery = `INSERT INTO fixtures (id, team_id, opponent, matchday, stage, score, home_team_score, away_team_score) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`;
        const fixtureValues = [
          fixture.fixture_id,
          teamId,
          fixture.awayTeam.team_name,
          fixture.matchday,
          fixture.stage,
          `${fixture.score.halftime.home} - ${fixture.score.halftime.away}`,
          fixture.score.fulltime.home,
          fixture.score.fulltime.away,
        ];

        console.log(`Executing query: ${fixtureQuery} with values ${fixtureValues}`);
        await db.query(fixtureQuery, fixtureValues);
      }

      // Fetch players for the team
      const playersUrl = `https://api.api-football.com/v2/players/team/${teamId}`;
      console.log(`Fetching players for team ${team.name}...`);
      const playersResponse = await axios.get(playersUrl, {
        headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'api.api-football.com' },
      });
      const playersData = playersResponse.data.api.players;

      // Insert players into database
      for (const player of playersData) {
        const playerQuery = `INSERT INTO players (id, team_id, name, position, jersey_number, date_of_birth, nationality) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`;
        const playerValues = [
          player.player_id,
          teamId,
          player.player_name,
          player.position,
          player.jersey_number,
          player.date_of_birth,
          player.nationality,
        ];

        console.log(`Executing query: ${playerQuery} with values ${playerValues}`);
        await db.query(playerQuery, playerValues);
      }
    }
  } catch (error) {
    console.error(`Error fetching team data: ${error}`);
  }
}

// Example usage:
 // Replace with your API key

fetchAllTeamData(apiKey);
// Index route with matches from API
app.get('/', async (req, res) => {
  try {
    const today = new Date();
    const dateFrom = formatDate(today);  // Today's date
    const dateTo = formatDate(addDays(today, 3));

    // Fetch matches from API
    const apiResponse = await axios.get(`${apiBaseURL}/matches`, {
      headers: { 'X-Auth-Token': apiKey },
      params: { dateFrom: dateFrom, dateTo: dateTo },
    });

    const matches = apiResponse.data.matches;
    res.render('index', { title: 'Football Portal', matches });
  } catch (err) {
    console.error('Error fetching matches:', err);
    res.status(500).send('Server Error');
  }
});

// Login route
app.get('/login', (req, res) => {
  const message = req.flash('error') || req.flash('success');
  res.render('login', { message });
});

// Handle login logic
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const queryResult = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = queryResult.rows[0];

    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/login');
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      req.flash('error', 'Incorrect password.');
      return res.redirect('/login');
    }

    req.session.user = user; // Store the entire user object in the session
    req.flash('success', 'Login successful.');
    res.redirect('/');
  } catch (err) {
    console.error('Error during login:', err);
    req.flash('error', 'Server error. Please try again.');
    res.redirect('/login');
  }
});

// Register route
app.get('/register', (req, res) => {
  const message = req.flash('error') || req.flash('success');
  res.render('register', { message });
});

// Handle registration logic
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if the user already exists
    const userCheckQuery = 'SELECT * FROM users WHERE username = $1';
    const userCheckResult = await db.query(userCheckQuery, [username]);

    if (userCheckResult.rows.length > 0) {
      req.flash('error', 'Username already exists.');
      return res.redirect('/register');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const insertUserQuery = 'INSERT INTO users (username, password) VALUES ($1, $2)';
    await db.query(insertUserQuery, [username, hashedPassword]);

    req.flash('success', 'Registration successful. You can now log in.');
    res.redirect('/login');
  } catch (err) {
    console.error('Error during registration:', err);
    req.flash('error', 'Server error. Please try again.');
    res.redirect('/register');
  }
});

// Matches route with API integration
app.get('/matches', async (req, res) => {
  try {
    const today = new Date();
    const dateFrom = formatDate(today);  // Today's date
    const dateTo = formatDate(addDays(today, 3));

    // Fetch matches from API
    const apiResponse = await axios.get(`${apiBaseURL}/matches`, {
      headers: { 'X-Auth-Token': apiKey },
      params: { dateFrom: dateFrom, dateTo: dateTo },
    });

    const matches = apiResponse.data.matches;
    res.render('matches', { title: 'Football Matches', matches });
  } catch (err) {
    console.error('Error fetching matches:', err);
    res.status(500).send('Server Error');
  }
});

// Teams route with PostgreSQL integration
app.get('/teams', async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM teams");
    const teams=result.rows;
    console.log(req.session.user);
    // console.log(teams); // Replace with your actual data fetching logic
    res.render('teams', {
      title: 'Teams',
      teams: teams,
      user: req.session.user // Pass the user data to the template
    });
  } catch (err) {
    console.error('Error fetching teams:', err);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/players', async (req, res) => {
  try {
    const queryResult = await db.query(`
      SELECT players.*, teams.name AS "teamName"
      FROM players
      JOIN teams ON players.team_id = teams.id
    `);
    const players = queryResult.rows;
    console.log(players);
    res.render('players', { 
      title: 'Players', 
      players: players, 
      user: req.session.user // Pass the user data to the template
    });
  } catch (err) {
    console.error('Error fetching players:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/favourites', async (req, res) => {
  try {
    const userId = req.session.user.id; // Access the numeric ID from req.session.user

    const favouriteTeamsQuery = `
      SELECT teams.*
      FROM favorites
      JOIN teams ON favorites.team_id = teams.id
      WHERE favorites.user_id = $1
    `;
    const favouritePlayersQuery = `
      SELECT players.*, teams.name AS "teamName"
      FROM favorites
      JOIN players ON favorites.player_id = players.id
      JOIN teams ON players.team_id = teams.id
      WHERE favorites.user_id = $1
    `;

    const favouriteTeamsResult = await db.query(favouriteTeamsQuery, [userId]);
    const favouritePlayersResult = await db.query(favouritePlayersQuery, [userId]);

    const favouriteTeams = favouriteTeamsResult.rows;
    const favouritePlayers = favouritePlayersResult.rows;

    res.render('favourites', {
      title: 'Favourites',
      favouriteTeams,
      favouritePlayers,
      user: req.session.user,
    });
  } catch (err) {
    console.error('Error fetching favourites:', err);
    res.status(500).send('Server Error');
  }
});

app.post('/favourites', async (req, res) => {
  try {
    const userId = req.session.user.id;
    console.log("UserId : ",userId);
    console.log(typeof(userId)); // Access the numeric ID from req.session.user
    const { teamId, playerId } = req.body;

    // Ensure userId is an integer
    if (typeof userId !== 'number') {
      throw new Error('User ID is not a number.');
    }

    if (teamId) {
      const insertFavouriteQuery = `
        INSERT INTO favorites (user_id, team_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, team_id) DO NOTHING
      `;
      await db.query(insertFavouriteQuery, [userId, teamId]);
    } else if (playerId) {
      const insertFavouriteQuery = `
        INSERT INTO favorites (user_id, player_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, player_id) DO NOTHING
      `;
      await db.query(insertFavouriteQuery, [userId, playerId]);
    }

    res.redirect('/favourites');
  } catch (err) {
    console.error('Error adding to favourites:', err);
    res.status(500).send('Server Error');
  }
});


app.post('/favourites/remove', async (req, res) => {
  try {
    const userId = req.session.user.id; // Access the numeric ID from req.session.user
    const { teamId, playerId } = req.body;

    if (teamId) {
      const deleteFavouriteQuery = `
        DELETE FROM favorites
        WHERE user_id = $1 AND team_id = $2
      `;
      await db.query(deleteFavouriteQuery, [userId, teamId]);
    } else if (playerId) {
      const deleteFavouriteQuery = `
        DELETE FROM favorites
        WHERE user_id = $1 AND player_id = $2
      `;
      await db.query(deleteFavouriteQuery, [userId, playerId]);
    }

    res.redirect('/favourites');
  } catch (err) {
    console.error('Error removing from favourites:', err);
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

// Helper functions
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to add days to a date
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
