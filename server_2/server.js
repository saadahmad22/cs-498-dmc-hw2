const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const port = 3000;
const SECONDARY_VM_IP = '34.136.18.48';

// Connect to MariaDB
const db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'nodeuser',
    password: '',
    database: 'cloudDB'
});

db.connect(err => {
    if (err) throw err;
    console.log('Connected to MariaDB');
});

// Greeting Endpoint, from part 1
app.get('/greeting', (req, res) => {
    res.send('<h1>Hello World!</h1>');
});

// Register User Endpoint, from part 2.2
app.post('/register', async (req, res) => {
    // fetch fro json
    const { username } = req.body;

    // no user in json
    if (!username) return res.status(400).json({ error: "Username required" });

    // add to both
    db.query('INSERT INTO Users (username) VALUES (?)', [username], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `User ${username} registered` });

        // Replicate to second instance
        axios.post(`http://${SECONDARY_VM_IP}:3000/register`, { username }).catch(() => {});
    });
});

// List Users Endpoint, from part 2.3
app.get('/list', (req, res) => {
    // fetch from this  database. since data is replicated, no need to look at other server
    db.query('SELECT username FROM Users', (err, results) => {
        // return gracefully
        if (err) return res.status(500).json({ error: err.message });
        res.json({ users: results.map(row => row.username) });
    });
});

// Clear Users Endpoint
app.post('/clear', (req, res) => {
    db.query('DELETE FROM Users', (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "All users deleted" });

        // Replicate to second instance
        axios.post(`http://${SECONDARY_VM_IP}:3000/clear`).catch(() => {});
    });
});

// Start Server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});