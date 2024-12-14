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
app.post('/set-goals', isAuthenticated, async (req, res) => {
    const { goals, stepsPerDay, caloriesDeficit, minsPerDay, waterGoal } = req.body;
    const userId = req.session.userId;

    // Collect goals based on user selection
    const goalEntries = [];

    if (goals?.includes('steps') && stepsPerDay) {
        goalEntries.push({ goal_type: 'Steps', target_value: stepsPerDay });
    }
    if (goals?.includes('calories') && caloriesDeficit) {
        goalEntries.push({ goal_type: 'Calorie Deficit', target_value: caloriesDeficit });
    }
    if (goals?.includes('mins') && minsPerDay) {
        goalEntries.push({ goal_type: 'Minutes', target_value: minsPerDay });
    }
    // Always include water goal
    goalEntries.push({ goal_type: 'Water', target_value: waterGoal });

    try {
        const startDate = new Date();
        const endDate = null;

        for (const goal of goalEntries) {
            await pool.query(
                `INSERT INTO goals (user_id, goal_type, target_value, start_date, end_date)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                target_value = VALUES(target_value), start_date = VALUES(start_date), end_date = VALUES(end_date)`,
                [userId, goal.goal_type, goal.target_value, startDate, endDate]
            );
        }

        console.log("Goals updated for user:", userId);
        res.redirect('/home');
    } catch (err) {
        console.error("Error updating goals:", err);
        res.status(500).send("Failed to save goals.");
    }
});
app.get('/submit-log', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;

    try {
        // Fetch previously set goals for the user
        const [rows] = await pool.query(
            `SELECT goal_type FROM goals WHERE user_id = ?`,
            [userId]
        );

        const goals = rows.map(row => row.goal_type); // Extract goal types

        res.render('daily-log', { goals }); // Render the daily log form
    } catch (err) {
        console.error("Error fetching goals:", err);
        res.status(500).send("Failed to load daily log page.");
    }
});
app.post('/submit-log', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const { logDate, steps, activeMinutes, caloriesBurned, caloriesEaten, weightKg } = req.body;

    try {
        // Insert daily log data into the activity_log table
        await pool.query(
            `INSERT INTO activity_log (user_id, log_date, steps, active_minutes, calories_burned, calories_eaten, weight_kg)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            steps = VALUES(steps),
            active_minutes = VALUES(active_minutes),
            calories_burned = VALUES(calories_burned),
            calories_eaten = VALUES(calories_eaten),
            weight_kg = VALUES(weight_kg)`,
            [userId, logDate, steps || 0, activeMinutes || 0, caloriesBurned || null, caloriesEaten || null, weightKg || null]
        );

        console.log("Daily log saved for user:", userId);
        res.redirect('/home');
    } catch (err) {
        console.error("Error saving daily log:", err);
        res.status(500).send("Failed to save daily log.");
    }
});



// Serve the goals page
app.get('/goals', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'goals.html'));
});

// Handle the goals form submission
app.post('/set-goals', isAuthenticated, async (req, res) => {
    const { stepsPerDay, caloriesDeficit, minsPerDay } = req.body;

    // Collect goals based on the user's input
    const stepsGoal = req.body.goals?.steps ? stepsPerDay : null;
    const caloriesGoal = req.body.goals?.calories ? caloriesDeficit : null;
    const minsGoal = req.body.goals?.mins ? minsPerDay : null;

    try {
        const userId = req.session.userId;
        const startDate = new Date(); // Assuming goals start immediately
        const endDate = null; // Optional, based on your requirements

        // Build an array of goals
        const goals = [];

        if (stepsGoal) {
            goals.push({ goal_type: 'Steps', target_value: stepsGoal, start_date: startDate, end_date: endDate });
        }
        if (caloriesGoal) {
            goals.push({ goal_type: 'Calorie Deficit', target_value: caloriesGoal, start_date: startDate, end_date: endDate });
        }
        if (minsGoal) {
            goals.push({ goal_type: 'Minutes', target_value: minsGoal, start_date: startDate, end_date: endDate });
        }

        // Insert each goal into the database
        for (const goal of goals) {
            await pool.query(
                `INSERT INTO goals (user_id, goal_type, target_value, start_date, end_date) 
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                target_value = VALUES(target_value), start_date = VALUES(start_date), end_date = VALUES(end_date)`,
                [userId, goal.goal_type, goal.target_value, goal.start_date, goal.end_date]
            );
        }

        console.log("User goals updated successfully");

        // Redirect to the home page after setting goals
        res.redirect('/home');
    } catch (err) {
        console.error("Error saving user goals:", err);
        res.status(500).send('Error saving user goals');
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
