const express = require('express');
const cors = require('cors');
const XLSX = require('xlsx');
const path = require('path');

// Fix for debug package issue
process.env.DEBUG = '*'; // Enable all debug logs or use 'modbus-serial' for specific logs
global.debug = require('debug');

const ModbusRTU = require('modbus-serial');

const app = express();
app.use(cors());
app.use(express.json());

// Importar el módulo de base de datos
const db = require('./database');

// --- Configuración Esencial ---
const TARGET_IP = "192.168.30.50";     // IP del dispositivo
const TARGET_PORT = 502;               // Puerto Modbus TCP
const SLAVE_ID = 1;                    // ID del esclavo
const TIMEOUT = 5000;                  // Timeout general (ms)
const PULSE_WIDTH_MS = 1000;           // Duración del pulso en milisegundos

// --- Button Addresses (Base 0) ---
const START_BUTTON_ADDRESS = 299;       // Proworx 000040 (Encender)
const CANCEL_ALARM_BUTTON_ADDRESS = 300; // Proworx 000042 (Cancelar Alarma)
const CHILLER_STATUS_ADDRESS = 15;    // Dirección para leer estado

// Helper function for delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Función auxiliar para conectar al cliente Modbus
async function getModbusClient() {
    const client = new ModbusRTU();
    client.setTimeout(TIMEOUT);
    await client.connectTCP(TARGET_IP, { port: TARGET_PORT });
    client.setID(SLAVE_ID);
    return client;
}

/**
 * Simulates a momentary button press by writing True, waiting, then writing False.
 * @param {ModbusRTU} modbusClient The connected modbus-serial client.
 * @param {number} address The Modbus coil address to pulse.
 * @param {number} pulseDurationMs Duration of the pulse in milliseconds.
 * @returns {Promise<boolean>} True on success (both writes successful), False otherwise.
 */
async function pulseCoil(modbusClient, address, pulseDurationMs = PULSE_WIDTH_MS) {
    if (!modbusClient || !modbusClient.isOpen) {
        console.error("ERROR: Pulse coil failed: Client not connected or not open.");
        return false;
    }

    console.log(`INFO: Pulsing coil ${address}: Setting to TRUE...`);
    try {
        // 1. Press the button (Write True)
        await modbusClient.writeCoil(address, true);
        console.log(`INFO: Coil ${address} set to TRUE successfully.`);

        // 2. Wait for the pulse duration
        await sleep(pulseDurationMs);

        // 3. Release the button (Write False)
        console.log(`INFO: Pulsing coil ${address}: Setting back to FALSE...`);
        await modbusClient.writeCoil(address, false);
        console.log(`INFO: Coil ${address} set back to FALSE successfully.`);

        console.log(`INFO: Pulse completed for coil ${address}.`);
        return true;

    } catch (error) {
        console.error(`ERROR: Exception during pulse_coil for address ${address}: ${error.message}`);
        if (error.err) { 
            console.error(`ERROR: Modbus Error Code: ${error.err}`);
        }
        // Attempt recovery to ensure coil is off
        try {
            console.log(`INFO: Attempting recovery: Setting coil ${address} to FALSE after error...`);
            await modbusClient.writeCoil(address, false);
            console.log(`INFO: Recovery attempt: Coil ${address} set to FALSE.`);
        } catch (recoveryError) {
            console.error(`ERROR: Failed to set coil ${address} back to FALSE during error recovery: ${recoveryError.message}`);
        }
        return false;
    }
}

// Endpoint para encender el chiller
app.post('/api/chiller/on', async (req, res) => {
    console.log("Iniciando operación: Encender chiller");
    let client;
    try {
        client = await getModbusClient();
        console.log(`Pulsando botón START (Dirección: ${START_BUTTON_ADDRESS})`);
        
        const success = await pulseCoil(client, START_BUTTON_ADDRESS, PULSE_WIDTH_MS);
        
        if (success) {
            console.log("Chiller encendido exitosamente");
            res.json({ success: true, message: 'Chiller encendido exitosamente' });
        } else {
            console.error("Error al intentar encender el chiller");
            res.status(500).json({ success: false, message: 'Error al intentar encender el chiller' });
        }
    } catch (error) {
        console.error("Error detallado al encender chiller:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Error interno del servidor al encender el chiller', 
            code: error.code, 
            errno: error.errno 
        });
    } finally {
        if (client && client.isOpen) {
            client.close(() => { console.log("Cliente Modbus cerrado (encender)"); });
        } else if (client) {
            console.log("Cliente Modbus ya estaba cerrado (encender)");
        }
    }
});

// Endpoint para apagar el chiller
app.post('/api/chiller/off', async (req, res) => {
    console.log("Iniciando operación: Apagar chiller");
    let client;
    try {
        client = await getModbusClient();
        console.log(`Pulsando botón CANCEL ALARM (Dirección: ${CANCEL_ALARM_BUTTON_ADDRESS})`);
        
        const success = await pulseCoil(client, CANCEL_ALARM_BUTTON_ADDRESS, PULSE_WIDTH_MS);
        
        if (success) {
            console.log("Chiller apagado exitosamente");
            res.json({ success: true, message: 'Chiller apagado exitosamente' });
        } else {
            console.error("Error al intentar apagar el chiller");
            res.status(500).json({ success: false, message: 'Error al intentar apagar el chiller' });
        }
    } catch (error) {
        console.error("Error detallado al apagar chiller:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Error interno del servidor al apagar el chiller', 
            code: error.code, 
            errno: error.errno 
        });
    } finally {
        if (client && client.isOpen) {
            client.close(() => { console.log("Cliente Modbus cerrado (apagar)"); });
        } else if (client) {
            console.log("Cliente Modbus ya estaba cerrado (apagar)");
        }
    }
});

const CHILLER_STATUS_COIL_ADDRESS = 15;
const NUM_COILS_TO_READ = 1;

// Endpoint para obtener el estado del chiller

// --- Endpoint Corregido ---
app.get('/api/chiller/status', async (req, res) => {
    let client; // Declara fuera para poder usar en finally
    try {
        // Asumimos que getModbusClient() configura la IP, puerto, SlaveID y timeout
        // y devuelve un cliente conectado o lanza un error si falla.
        client = await getModbusClient();
        console.log(`Intentando leer estado del Chiller (Coil ${CHILLER_STATUS_COIL_ADDRESS} - PLC ${CHILLER_STATUS_COIL_ADDRESS + 1})`);

        // *** ¡CAMBIO CLAVE AQUÍ! ***
        // Usar readCoils en lugar de readHoldingRegisters
        const result = await client.readCoils(CHILLER_STATUS_COIL_ADDRESS, NUM_COILS_TO_READ);

        // Validar la respuesta de readCoils
        // result.data será un array de booleanos, ej: [true] o [false]
        if (result && result.data && result.data.length >= NUM_COILS_TO_READ) {
            // *** ¡CAMBIO CLAVE AQUÍ! ***
            // El estado es directamente el valor booleano en el primer elemento
            const isOn = result.data[0];

            console.log(`Estado del chiller (Coil ${CHILLER_STATUS_COIL_ADDRESS}) leído: ${isOn} (${isOn ? 'ENCENDIDO' : 'APAGADO'})`);
            // Devolver el estado booleano directamente
            res.json({ success: true, isOn: isOn });

        } else {
            // La respuesta no fue la esperada (podría ser un error de Modbus manejado
            // por la biblioteca, o simplemente una respuesta vacía/incorrecta)
            console.error("Respuesta Modbus inválida o vacía al leer Coil:", result);
            throw new Error("Respuesta inválida o vacía del dispositivo Modbus al leer el estado");
        }

    } catch (error) {
        // Capturar errores de conexión (de getModbusClient) o de lectura (de readCoils)
        console.error("Error en /api/chiller/status:", error.message || error);
        res.status(500).json({
            success: false,
            // Devuelve el mensaje de error si existe, o uno genérico
            message: `Error al obtener estado del chiller: ${error.message || 'Error interno del servidor'}`
        });
    } finally {
        // Asegurarse de cerrar la conexión si se abrió
        // (Ajusta esto según cómo funcione tu getModbusClient, podría manejar pooling)
        if (client && client.isOpen) {
            client.close(() => {
                console.log("Cliente Modbus cerrado (Status Endpoint)");
            });
        } else if (client) {
             // Si el cliente existe pero no está abierto (pudo fallar la conexión)
            console.log("Cliente Modbus no estaba abierto o ya cerrado (Status Endpoint)");
        }
    }
});

app.get('/api/chiller/test_modbus_direction', async (req, res) => {
    let client; // Declara fuera para poder usar en finally
    try {
        // Asumimos que getModbusClient() configura la IP, puerto, SlaveID y timeout
        // y devuelve un cliente conectado o lanza un error si falla.
        client = await getModbusClient();
        console.log(`Intentando leer estado del Chiller (Coil ${CHILLER_STATUS_COIL_ADDRESS} - PLC ${CHILLER_STATUS_COIL_ADDRESS + 1})`);

        // *** ¡CAMBIO CLAVE AQUÍ! ***
        // Usar readCoils en lugar de readHoldingRegisters
        const result = await client.readCoils(CHILLER_STATUS_COIL_ADDRESS, NUM_COILS_TO_READ);

        // Validar la respuesta de readCoils
        // result.data será un array de booleanos, ej: [true] o [false]
        if (result && result.data && result.data.length >= NUM_COILS_TO_READ) {
            // *** ¡CAMBIO CLAVE AQUÍ! ***
            // El estado es directamente el valor booleano en el primer elemento
            const isOn = result.data[0];

            console.log(`Estado del chiller (Coil ${CHILLER_STATUS_COIL_ADDRESS}) leído: ${isOn} (${isOn ? 'ENCENDIDO' : 'APAGADO'})`);
            // Devolver el estado booleano directamente
            res.json({ success: true, isOn: isOn });

        } else {
            // La respuesta no fue la esperada (podría ser un error de Modbus manejado
            // por la biblioteca, o simplemente una respuesta vacía/incorrecta)
            console.error("Respuesta Modbus inválida o vacía al leer Coil:", result);
            throw new Error("Respuesta inválida o vacía del dispositivo Modbus al leer el estado");
        }

    } catch (error) {
        // Capturar errores de conexión (de getModbusClient) o de lectura (de readCoils)
        console.error("Error en /api/chiller/status:", error.message || error);
        res.status(500).json({
            success: false,
            // Devuelve el mensaje de error si existe, o uno genérico
            message: `Error al obtener estado del chiller: ${error.message || 'Error interno del servidor'}`
        });
    } finally {
        // Asegurarse de cerrar la conexión si se abrió
        // (Ajusta esto según cómo funcione tu getModbusClient, podría manejar pooling)
        if (client && client.isOpen) {
            client.close(() => {
                console.log("Cliente Modbus cerrado (Status Endpoint)");
            });
        } else if (client) {
             // Si el cliente existe pero no está abierto (pudo fallar la conexión)
            console.log("Cliente Modbus no estaba abierto o ya cerrado (Status Endpoint)");
        }
    }
});

// --- API endpoints for database data ---
app.get('/api/chiller/data/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const { date } = req.query;
        
        // Validar que la tabla sea una de las permitidas
        const allowedTables = ['chiller_agua_minutos', 'chiller_agua_segundos', 
                             'chiller_aire_minutos', 'chiller_aire_segundos'];
        if (!allowedTables.includes(table)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Tabla no válida' 
            });
        }

        let query = `SELECT * FROM ${table}`;
        const params = [];

        if (date) {
            query += ' WHERE DATE(fecha_hora) = ?';
            params.push(date);
        }

        // Para tablas de segundos, mostrar los últimos 1000 registros
        // Para tablas de minutos con fecha, mostrar todos los registros del día
        const isMinutesTable = table.includes('minutos');
        if (!isMinutesTable) {
            query += ' ORDER BY fecha_hora DESC LIMIT 1000';
        } else if (!date) {
            // Si es tabla de minutos pero no hay fecha, mostrar los últimos 100
            query += ' ORDER BY fecha_hora DESC LIMIT 100';
        } else {
            query += ' ORDER BY fecha_hora DESC';
        }

        const [rows] = await db.pool.query(query, params);
        const [totalRows] = await db.pool.query(`SELECT COUNT(*) as total FROM ${table}`);

        // Format date consistently in the response
        const formattedRows = rows.map(row => {
            if (row.fecha_hora) {
                // Format date as YYYY-MM-DD HH:MM:SS
                const fecha = row.fecha_hora;
                const formattedDate = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;
                
                return {
                    ...row,
                    fecha_hora: formattedDate
                };
            }
            return row;
        });

        res.json({ 
            success: true, 
            data: formattedRows,
            total: totalRows[0].total
        });
    } catch (error) {
        console.error('Error al obtener datos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener datos del chiller' 
        });
    }
});

app.get('/api/chiller/data/:table/range', async (req, res) => {
    try {
        const { table } = req.params;
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ 
                success: false, 
                message: 'Se requieren fechas de inicio y fin' 
            });
        }

        const allowedTables = ['chiller_agua_minutos', 'chiller_agua_segundos', 
                             'chiller_aire_minutos', 'chiller_aire_segundos'];
        if (!allowedTables.includes(table)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Tabla no válida' 
            });
        }

        const data = await db.getRecordsByDateRange(table, startDate, endDate);
        
        // Format date consistently in the response
        const formattedData = data.map(row => {
            if (row.fecha_hora) {
                // Format date as YYYY-MM-DD HH:MM:SS
                const fecha = row.fecha_hora;
                const formattedDate = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;
                
                return {
                    ...row,
                    fecha_hora: formattedDate
                };
            }
            return row;
        });
        
        res.json({ success: true, data: formattedData });
    } catch (error) {
        console.error('Error al obtener datos por rango:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener datos del chiller por rango de fechas' 
        });
    }
});

app.get('/api/chiller/data/:table/last', async (req, res) => {
    try {
        const { table } = req.params;
        const allowedTables = ['chiller_agua_minutos', 'chiller_agua_segundos', 
                             'chiller_aire_minutos', 'chiller_aire_segundos'];
        if (!allowedTables.includes(table)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Tabla no válida' 
            });
        }

        const data = await db.getLastRecord(table);
        
        // Format date consistently in the response
        if (data && data.fecha_hora) {
            const fecha = data.fecha_hora;
            data.fecha_hora = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;
        }
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error al obtener último registro:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener el último registro del chiller' 
        });
    }
});

// Endpoint para exportar datos a Excel
app.get('/api/chiller/export/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere una fecha para exportar'
            });
        }

        // Solo permitir exportación de tablas de minutos por ahora
        const allowedTables = ['chiller_aire_minutos', 'chiller_agua_minutos'];
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                success: false,
                message: 'Solo se pueden exportar tablas de minutos'
            });
        }

        // Consultar los datos
        let query = `SELECT * FROM ${table} WHERE DATE(fecha_hora) = ? ORDER BY fecha_hora DESC`;
        const [rows] = await db.pool.query(query, [date]);

        // Formatear los datos para Excel
        const formattedData = rows.map(row => {
            const fecha = row.fecha_hora;
            return {
                ...row,
                fecha_hora: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`
            };
        });

        // Crear el libro de Excel
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(formattedData);

        // Ajustar el ancho de las columnas
        const colWidths = [];
        for (let i = 0; i < Object.keys(formattedData[0] || {}).length; i++) {
            colWidths.push({ wch: 15 }); // width = 15 characters
        }
        ws['!cols'] = colWidths;

        // Añadir la hoja al libro
        XLSX.utils.book_append_sheet(wb, ws, `Datos ${date}`);

        // Generar el buffer del archivo
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Configurar headers para la descarga
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=chiller_data_${table}_${date}.xlsx`);
        
        // Enviar el archivo
        res.send(excelBuffer);

    } catch (error) {
        console.error('Error al exportar datos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al exportar datos a Excel'
        });
    }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor HTTP corriendo en puerto ${PORT} y accesible desde la red`);
});

// Exportar app para tests si es necesario
module.exports = app;