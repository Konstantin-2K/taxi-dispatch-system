const { pool } = require('../config/db');

class RouteRequest {
    static async getAll() {
        try {
            const [rows] = await pool.query(`
        SELECT rr.*, d.name as driver_name 
        FROM route_requests rr
        LEFT JOIN drivers d ON rr.driver_id = d.id
        ORDER BY rr.created_at DESC
      `);
            return rows;
        } catch (error) {
            console.error('Error fetching route requests:', error);
            throw error;
        }
    }

    static async getPending() {
        try {
            const [rows] = await pool.query(`
        SELECT * FROM route_requests 
        WHERE status = 'pending'
        ORDER BY created_at DESC
      `);
            return rows;
        } catch (error) {
            console.error('Error fetching pending route requests:', error);
            throw error;
        }
    }

    static async create(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_name, dropoff_name, distance, estimated_time) {
        try {
            const [result] = await pool.query(
                'INSERT INTO route_requests (pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_name, dropoff_name, distance, estimated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_name, dropoff_name, distance, estimated_time]
            );

            const [rows] = await pool.query('SELECT * FROM route_requests WHERE id = ?', [result.insertId]);
            return rows[0];
        } catch (error) {
            console.error('Error creating route request:', error);
            throw error;
        }
    }

    static async updateStatus(id, status, driver_id = null) {
        try {
            if (driver_id) {
                const [result] = await pool.query(
                    'UPDATE route_requests SET status = ?, driver_id = ? WHERE id = ?',
                    [status, driver_id, id]
                );
                return result.affectedRows > 0;
            } else {
                const [result] = await pool.query(
                    'UPDATE route_requests SET status = ? WHERE id = ?',
                    [status, id]
                );
                return result.affectedRows > 0;
            }
        } catch (error) {
            console.error('Error updating route request status:', error);
            throw error;
        }
    }
}

module.exports = RouteRequest;
