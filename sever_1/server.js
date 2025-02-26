const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const port = 80;
const SECONDARY_VM_IP = '34.170.186.108';

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
        axios.post(`http://${SECONDARY_VM_IP}:${port}/register`, { username }).catch(() => {});
    });
});

// List Users Endpoint, from part 2.3
app.get('/list', async (req, res) => {
    // If this is a replicated call, only query the local database.
    if (req.query.replicated) {
        try {
        const [rows] = await db.promise().query('SELECT username FROM Users');
        return res.json({ users: rows.map(row => row.username) });
        } catch (err) {
        return res.status(500).json({ error: err.message });
        }
    }

    try {
        // Fetch local users using the promise wrapper
        const [localRows] = await db.promise().query('SELECT username FROM Users');
        let remoteUsers = [];
        try {
        const remoteResponse = await axios.get(`http://${SECONDARY_VM_IP}:${port}/list?replicated=true`);
        remoteUsers = remoteResponse.data.users;
        } catch (remoteErr) {
        console.error("Remote /list fetch failed:", remoteErr.message);
        }

        // Combine users and remove duplicates
        const combinedUsers = Array.from(new Set([...localRows.map(row => row.username), ...remoteUsers]));
        res.json({ users: combinedUsers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});  

// Clear Users Endpoint
app.post('/clear', (req, res) => {
    // If this is a replicated clear call, just clear locally.
    if (req.query.replicated) {
        return db.query('DELETE FROM Users', (err) => {
            if (err) return res.status(500).json({ error: err.message });
            return res.json({ message: "All users deleted (replicated)" });
        });
    }
    
    // Clear the local database.
    db.query('DELETE FROM Users', (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "All users deleted" });
        
        // Replicate the clear command to the secondary server, 
        // but include a flag to avoid circular calls.
        axios.post(`http://${SECONDARY_VM_IP}:${port}/clear?replicated=true`).catch((err) => {
            console.error("Replication of /clear failed:", err.message);
        });
    });
});


// Start Server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});