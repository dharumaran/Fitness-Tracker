const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const pool = require('./db'); // Ensure this is correctly configured to connect to your database

const app = express();

// Middleware to serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON and URL-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure session middleware
app.use(session({
    secret: 'your-secret-key', // Replace with a strong, secure key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to check authentication
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Default route to serve the welcome page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the signup page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Register a new user
app.post('/register', async (req, res) => {
    const { username, email, password, age, height_cm, weight_kg } = req.body;

    try {
        // Hash the user's password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the new user into the database
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password_hash, age, height_cm, weight_kg) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, age, height_cm, weight_kg]
        );
        console.log("User registered with ID:", result.insertId);

        // Set the userId in the session to keep the user logged in
        req.session.userId = result.insertId;

        // Redirect to home page after successful registration
        res.redirect('/home');
    } catch (err) {
        console.error("Error during registration:", err);
        res.status(500).send('Error registering user');
    }
});

// Serve the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login a user
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length > 0) {
            const match = await bcrypt.compare(password, rows[0].password_hash);

            if (match) {
                req.session.userId = rows[0].id;
                console.log("User logged in with ID:", rows[0].id);
                res.json({ message: 'Login successful', redirectTo: '/home' }); // Send JSON response
            } else {
                console.warn("Invalid credentials for email:", email);
                res.status(401).json({ message: 'Invalid credentials' }); // Send JSON response
            }
        } else {
            console.warn("User not found for email:", email);
            res.status(404).json({ message: 'User not found' }); // Send JSON response
        }
    } catch (err) {
        console.error("Error during login:", err);
        res.status(500).json({ message: 'Error logging in user' }); // Send JSON response
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Error during logout:", err);
            res.status(500).send('Error logging out');
        } else {
            res.redirect('/login');
        }
    });
});

// Serve home.html after login
app.get('/home', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Fetch user profile data
app.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const [userData] = await pool.query('SELECT * FROM user_data WHERE user_id = ?', [userId]);
        res.json(userData);
    } catch (err) {
        console.error("Error fetching user data:", err);
        res.status(500).send('Error fetching user data');
    }
});

// Serve the daily log page
app.get('/daily-log', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'daily-log.html'));
});

// Handle the daily log form submission
app.post('/submit-daily-log', isAuthenticated, async (req, res) => {
    const { steps, workout_mins, calories, water_intake } = req.body;

    try {
        await pool.query(
            'INSERT INTO user_data (user_id, steps, workout_mins, calories, water_intake) VALUES (?, ?, ?, ?, ?)',
            [req.session.userId, steps, workout_mins, calories, water_intake]
        );
        console.log("Daily log submitted for user ID:", req.session.userId);
        res.redirect('/home');
    } catch (err) {
        console.error("Error saving daily log:", err);
        res.status(500).send('Error saving daily log');
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
