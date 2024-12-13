// db.js
const mysql = require('mysql2');
require('dotenv').config();

// Create a connection pool using the environment variables
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// Export the pool with promise-based queries
module.exports = pool.promise();
