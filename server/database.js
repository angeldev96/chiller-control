import { createPool } from 'mysql2/promise';

// Connection pool configuration
const poolConfig = {
    host: 'localhost',
    user: 'root',
    password: 'cisa',
    database: 'lecturas',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'America/Tegucigalpa', // Añadir configuración de zona horaria
    dateStrings: true // Opcional: evita conversiones automáticas
};

const connectLevelDB = createPool({
    ...poolConfig,
    database: 'niveles'
});

const connectGenerationDB = createPool({
    ...poolConfig,
    database: 'lecturas'
});

// Add connection error handlers
connectLevelDB.on('error', (err) => {
    console.error('LevelDB pool error:', err);
});

connectGenerationDB.on('error', (err) => {
    console.error('GenerationDB pool error:', err);
});

console.log('Conexión a base de datos configurada!');

export { connectLevelDB, connectGenerationDB };