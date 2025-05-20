const mysql = require('mysql2/promise');

// Configuración de la conexión a la base de datos
const dbConfig = {
  host: "localhost",
  user: "chiller_app",
  password: "chiller_data",
  database: "chiller_data",
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: 'local' // Usar la zona horaria local del servidor
};

// Pool de conexiones
const pool = mysql.createPool(dbConfig);

// Función para probar la conexión
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Conexión a la base de datos establecida correctamente');
    
    // Verificar la zona horaria
    const [timeZoneResult] = await connection.query('SELECT @@session.time_zone');
    console.log('Zona horaria de MySQL:', timeZoneResult[0]['@@session.time_zone']);
    
    // Verificar una fecha de ejemplo
    const [dateTest] = await connection.query('SELECT NOW() as current_time');
    console.log('Hora actual en MySQL:', dateTest[0].current_time);
    
    const [tables] = await connection.query('SHOW TABLES');
    console.log('Tablas disponibles:', tables.map(t => Object.values(t)[0]).join(', '));
    
    connection.release();
    return true;
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('Las credenciales de la base de datos son incorrectas');
    }
    return false;
  }
}

// Ejecutar prueba de conexión al iniciar
testConnection();

// Función para obtener los últimos N registros de una tabla específica
async function getLastRecords(table, limit = 100) {
  try {
    const connection = await pool.getConnection();
    // Convertir explícitamente la fecha a la zona horaria local
    const [rows] = await connection.query(
      `SELECT *, CONVERT_TZ(fecha_hora, 'UTC', 'America/Tegucigalpa') as fecha_hora 
       FROM ${table} ORDER BY fecha_hora DESC LIMIT ?`,
      [limit]
    );
    connection.release();
    return rows;
  } catch (error) {
    console.error('Error al obtener registros:', error);
    throw error;
  }
}

// Función para obtener registros por rango de fechas
async function getRecordsByDateRange(table, startDate, endDate) {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT *, CONVERT_TZ(fecha_hora, 'UTC', 'America/Tegucigalpa') as fecha_hora 
       FROM ${table} 
       WHERE fecha_hora BETWEEN ? AND ? 
       ORDER BY fecha_hora DESC`,
      [startDate, endDate]
    );
    connection.release();
    return rows;
  } catch (error) {
    console.error('Error al obtener registros por rango de fechas:', error);
    throw error;
  }
}

// Función para obtener el último registro
async function getLastRecord(table) {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT *, CONVERT_TZ(fecha_hora, 'UTC', 'America/Tegucigalpa') as fecha_hora 
       FROM ${table} ORDER BY fecha_hora DESC LIMIT 1`
    );
    connection.release();
    return rows[0];
  } catch (error) {
    console.error('Error al obtener el último registro:', error);
    throw error;
  }
}

// Función para obtener estadísticas básicas por rango de fechas
async function getStats(table, field, startDate, endDate) {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT 
        MIN(${field}) as min_value,
        MAX(${field}) as max_value,
        AVG(${field}) as avg_value
       FROM ${table}
       WHERE fecha_hora BETWEEN ? AND ?`,
      [startDate, endDate]
    );
    connection.release();
    return rows[0];
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    throw error;
  }
}

module.exports = {
  pool,
  getLastRecords,
  getRecordsByDateRange,
  getLastRecord,
  getStats,
  testConnection
}; 