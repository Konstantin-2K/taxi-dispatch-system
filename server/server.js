const express = require('express');
const http = require('http');
const fs = require('fs');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDatabase } = require('./config/db');

const driversRoutes = require('./routes/driver.js');
const requestsRoutes = require('./routes/requests');
const authRoutes = require('./routes/auth');

const { isAuthenticated, isDispatcher, isDriver, isOwnDriverPage } = require('./middleware/auth');

const setupSocket = require('./utils/socket');
const session = require("express-session");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use('/api/drivers', isAuthenticated, driversRoutes);
app.use('/api/requests', isAuthenticated, requestsRoutes);
app.use('/api/auth', authRoutes);

const startServer = async () => {
    try {
        await initDatabase();
        await setupSocket(io);

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/dispatch', isAuthenticated, isDispatcher, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dispatch.html'));
});

app.get('/driver/:id', isAuthenticated, isOwnDriverPage, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/driver.html'));
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;

startServer();
