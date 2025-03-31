const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

async function setupSocket(io) {
    const pubClient = createClient({
        socket: {
            host: '192.168.111.138',
            port: 6379
        },
        password: 'redispass'
    });

    const subClient = pubClient.duplicate();

    await pubClient.connect();
    await subClient.connect();

    pubClient.on('error', (err) => {
        console.error('Redis pub error:', err);
    });

    subClient.on('error', (err) => {
        console.error('Redis sub error:', err);
    });

    io.adapter(createAdapter(pubClient, subClient));

    io.on('connection', (socket) => {
        console.log('A client connected:', socket.id);
        const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
        console.log('Client IP:', clientIp);

        socket.on('update_driver_status', async (data) => {
            try {
                io.emit('driver_status_updated', data);
            } catch (error) {
                console.error('Socket error on update_driver_status:', error);
            }
        });

        socket.on('update_driver_location', async (data) => {
            try {
                io.emit('driver_location_updated', data);
            } catch (error) {
                console.error('Socket error on update_driver_location:', error);
            }
        });

        socket.on('driver_eta', (data) => {
            io.emit('driver_eta', data);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });
}

module.exports = setupSocket;
