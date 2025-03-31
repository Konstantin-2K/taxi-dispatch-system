const { pool } = require('../config/db');
const bcrypt = require('bcrypt');

class User {
    static async getByUsername(username) {
        try {
            const [rows] = await pool.query(
                'SELECT u.*, d.name as driver_name FROM users u LEFT JOIN drivers d ON u.driver_id = d.id WHERE u.username = ?',
                [username]
            );
            return rows[0];
        } catch (error) {
            console.error('Error fetching user by username:', error);
            throw error;
        }
    }

    static async getById(id) {
        try {
            const [rows] = await pool.query(
                'SELECT u.*, d.name as driver_name FROM users u LEFT JOIN drivers d ON u.driver_id = d.id WHERE u.id = ?',
                [id]
            );
            return rows[0];
        } catch (error) {
            console.error('Error fetching user by ID:', error);
            throw error;
        }
    }

    static async validatePassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    static async hashPassword(password) {
        return await bcrypt.hash(password, 10);
    }
}

module.exports = User;
