const express = require('express');
const Driver = require('../models/Driver');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const drivers = await Driver.getAll();
        res.json(drivers);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching drivers', error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const driver = await Driver.getById(req.params.id);
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }
        res.json(driver);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching driver', error: error.message });
    }
});

router.put('/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!status || !['available', 'busy', 'offline'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status provided' });
    }

    try {
        const success = await Driver.updateStatus(req.params.id, status);
        if (!success) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        const driver = await Driver.getById(req.params.id);

        req.io.emit('driver_status_changed', driver);

        res.json(driver);
    } catch (error) {
        res.status(500).json({ message: 'Error updating driver status', error: error.message });
    }
});

router.put('/:id/location', async (req, res) => {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
        return res.status(400).json({ message: 'Invalid location provided' });
    }

    try {
        const success = await Driver.updateLocation(req.params.id, lat, lng);
        if (!success) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        const driver = await Driver.getById(req.params.id);

        req.io.emit('driver_location_changed', driver);

        res.json(driver);
    } catch (error) {
        res.status(500).json({ message: 'Error updating driver location', error: error.message });
    }
});

module.exports = router;
