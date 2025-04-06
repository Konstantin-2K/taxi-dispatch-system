const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const isAuthenticated = (req, res, next) => {
    try {
        const token = req.cookies.auth_token;

        if (!token) {
            return res.redirect('/login');
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.clearCookie('auth_token');
        return res.redirect('/login');
    }
};

const isDispatcher = (req, res, next) => {
    if (req.user && req.user.role === 'dispatcher') {
        return next();
    }

    return res.status(403).send('Access denied. Dispatchers only.');
};

const isDriver = (req, res, next) => {
    if (req.user && req.user.role === 'driver') {
        return next();
    }

    return res.status(403).send('Access denied. Drivers only.');
};

const isOwnDriverPage = (req, res, next) => {
    if (req.user && req.user.role === 'driver') {
        const requestedDriverId = parseInt(req.params.id);

        if (req.user.driver_id === requestedDriverId) {
            return next();
        }
    }

    if (req.user && req.user.role === 'driver') {
        return res.redirect(`/driver/${req.user.driver_id}`);
    }

    return res.status(403).send('Access denied.');
};

module.exports = {
    isAuthenticated,
    isDispatcher,
    isDriver,
    isOwnDriverPage,
    JWT_SECRET
};
