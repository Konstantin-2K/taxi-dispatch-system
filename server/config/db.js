const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'taxi_dispatch',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDatabase() {
    try {
        const tempPool = mysql.createPool({
            host: 'localhost',
            user: 'root',
            password: '1234',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        const connection = await tempPool.getConnection();
        await connection.query(`CREATE DATABASE IF NOT EXISTS taxi_dispatch`);
        await connection.query(`USE taxi_dispatch`);
        await connection.query(`
        CREATE TABLE IF NOT EXISTS drivers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        status ENUM('available', 'busy', 'offline') DEFAULT 'offline',
        last_location_lat DECIMAL(10, 8),
        last_location_lng DECIMAL(11, 8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        await connection.query(`
        CREATE TABLE IF NOT EXISTS route_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pickup_lat DECIMAL(10, 8) NOT NULL,
        pickup_lng DECIMAL(11, 8) NOT NULL,
        dropoff_lat DECIMAL(10, 8) NOT NULL,
        dropoff_lng DECIMAL(11, 8) NOT NULL,
        pickup_name VARCHAR(200) NOT NULL,
        distance DECIMAL(3,2) NOT NULL,
        estimated_time INT(5) NOT NULL,
        dropoff_name VARCHAR(200) NOT NULL,
        
        status ENUM('pending', 'accepted', 'rejected', 'completed') DEFAULT 'pending',
        driver_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers(id)
      )
    `);

        const [rows] = await connection.query('SELECT COUNT(*) as count FROM drivers');
        if (rows[0].count === 0) {
            await connection.query(`
        INSERT INTO drivers (name, status) VALUES 
        ('John Doe', 'available'),
        ('Jane Smith', 'available'),
        ('Mike Johnson', 'offline')
      `);
        }

        await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('dispatcher', 'driver') NOT NULL,
        driver_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL)
        `);

        const [userRows] = await connection.query('SELECT COUNT(*) as count FROM users');
        if (userRows[0].count === 0) {
            await connection.query(`
            INSERT INTO users (username, password, role) VALUES 
            ('dispatcher', '$2b$10$4nxJsQ5o9VzKR.8R9A9t4ObkQ2YeWh2MdntEMxRQUBP1AA7Q4SBx6', 'dispatcher')
            `);
            const [drivers] = await connection.query('SELECT id FROM drivers');
            for (const driver of drivers) {
                await connection.query(`
          INSERT INTO users (username, password, role, driver_id) VALUES 
          (?, '$2b$10$DjxA89M8PK.wKOHcMDQaYeu8MH9knIkL0Uz2N6qMJT3jYy9eDR.Lu', 'driver', ?)
        `, [`driver${driver.id}`, driver.id]);
            }
        }

        connection.release();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

module.exports = {
    pool,
    initDatabase
};
