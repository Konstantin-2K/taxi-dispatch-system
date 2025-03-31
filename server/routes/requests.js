const express = require('express');
const RouteRequest = require('../models/RouteRequest');
const Driver = require('../models/Driver');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const requests = await RouteRequest.getAll();
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching route requests', error: error.message });
    }
});

router.get('/pending', async (req, res) => {
    try {
        const requests = await RouteRequest.getPending();
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching pending requests', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const {
        pickup_lat,
        pickup_lng,
        dropoff_lat,
        dropoff_lng,
        pickup_name,
        dropoff_name,
        distance,
        estimated_time
    } = req.body;

    if (!pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng || !pickup_name || !dropoff_name || !distance || !estimated_time) {
        return res.status(400).json({ message: 'Missing required coordinates or location names' });
    }

    try {
        const request = await RouteRequest.create(
            pickup_lat,
            pickup_lng,
            dropoff_lat,
            dropoff_lng,
            pickup_name,
            dropoff_name,
            distance,
            estimated_time
        );

        req.io.emit('new_route_request', request);

        res.status(201).json(request);
    } catch (error) {
        res.status(500).json({ message: 'Error creating route request', error: error.message });
    }
});

router.put('/:id/status', async (req, res) => {
    const { status, driver_id } = req.body;

    if (!status || !['accepted', 'rejected', 'completed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status provided' });
    }

    try {
        if (status === 'accepted' && driver_id) {
            await Driver.updateStatus(driver_id, 'busy');
        }

        if (status === 'completed' && driver_id) {
            await Driver.updateStatus(driver_id, 'available');
        }

        const success = await RouteRequest.updateStatus(req.params.id, status, driver_id || null);
        if (!success) {
            return res.status(404).json({ message: 'Route request not found' });
        }

        const requests = await RouteRequest.getAll();
        const updatedRequest = requests.find(r => r.id === parseInt(req.params.id));

        if (!updatedRequest) {
            return res.status(404).json({ message: 'Updated request not found' });
        }

        req.io.emit('route_request_updated', updatedRequest);

        res.json(updatedRequest);
    } catch (error) {
        console.error('Error updating route request:', error);
        res.status(500).json({ message: 'Error updating route request', error: error.message });
    }
});

module.exports = router;
