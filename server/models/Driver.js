const { pool } = require('../config/db');

class Driver {
    static async getAll() {
        try {
            const [rows] = await pool.query('SELECT * FROM drivers');
            return rows;
        } catch (error) {
            console.error('Error fetching drivers:', error);
            throw error;
        }
    }

    static async getById(id) {
        try {
            const [rows] = await pool.query('SELECT * FROM drivers WHERE id = ?', [id]);
            return rows[0];
        } catch (error) {
            console.error('Error fetching driver by ID:', error);
            throw error;
        }
    }

    static async updateStatus(id, status) {
        try {
            const [result] = await pool.query(
                'UPDATE drivers SET status = ? WHERE id = ?',
                [status, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating driver status:', error);
            throw error;
        }
    }

    static async updateLocation(id, lat, lng) {
        try {
            const [result] = await pool.query(
                'UPDATE drivers SET last_location_lat = ?, last_location_lng = ? WHERE id = ?',
                [lat, lng, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating driver location:', error);
            throw error;
        }
    }
}

module.exports = Driver;
