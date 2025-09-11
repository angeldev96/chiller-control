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
                             'chiller_aire_minutos', 'chiller_aire_segundos', 'ion_meter_minutos'];
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
                             'chiller_aire_minutos', 'chiller_aire_segundos', 'ion_meter_minutos'];
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
                             'chiller_aire_minutos', 'chiller_aire_segundos', 'ion_meter_minutos'];
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

        // Permitir exportación de todas las tablas
        const allowedTables = [
            'chiller_aire_minutos', 
            'chiller_agua_minutos',
            'chiller_aire_segundos',
            'chiller_agua_segundos',
            'ion_meter_minutos'
        ];
        
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                success: false,
                message: 'Tabla no válida para exportación'
            });
        }

        // Consultar los datos
        let query = `SELECT * FROM ${table} WHERE DATE(fecha_hora) = ? ORDER BY fecha_hora ASC`;
        const [rows] = await db.pool.query(query, [date]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No hay datos para exportar en la fecha seleccionada'
            });
        }

        // Formatear los datos para Excel
        const formattedData = rows.map(row => {
            const fecha = row.fecha_hora;
            const formattedRow = {};

            // Formatear la fecha como string en formato legible
            const formattedDate = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;
            
            formattedRow['Fecha y Hora'] = formattedDate;

            // Copiar y renombrar las columnas restantes, excluyendo id y chiller_id
            for (const [key, value] of Object.entries(row)) {
                if (key !== 'id' && key !== 'chiller_id' && key !== 'fecha_hora') {
                    // Formatear el nombre de la columna para mejor legibilidad
                    const formattedKey = key
                        .split('_')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                    
                    // Asegurar que los valores numéricos se mantengan como números
                    let processedValue = value;
                    if (value !== null && value !== undefined && value !== '') {
                        // Intentar convertir a número si es posible
                        const numericValue = Number(value);
                        if (!isNaN(numericValue) && isFinite(numericValue)) {
                            processedValue = numericValue;
                        }
                    }
                    
                    formattedRow[formattedKey] = processedValue;
                }
            }

            return formattedRow;
        });

        // Crear el libro de Excel
        const wb = XLSX.utils.book_new();
        
        // Configurar las opciones de la hoja
        const ws = XLSX.utils.json_to_sheet(formattedData);

        // Ajustar el ancho de las columnas basado en el contenido
        const colWidths = [];
        const headers = Object.keys(formattedData[0] || {});
        
        headers.forEach((header) => {
            const maxWidth = Math.max(
                header.length,
                ...formattedData.map(row => {
                    const value = row[header];
                    return String(value).length;
                })
            );
            colWidths.push({ wch: Math.min(maxWidth + 2, 20) }); // max width 20 characters
        });
        ws['!cols'] = colWidths;

        // Añadir la hoja al libro con nombre descriptivo
        const sheetName = `Datos ${date} ${table.includes('segundos') ? '(seg)' : '(min)'}`;
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Generar el buffer del archivo
        const excelBuffer = XLSX.write(wb, { 
            type: 'buffer', 
            bookType: 'xlsx',
            compression: true
        });

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

// Endpoint para obtener promedios de temperatura diarios de evaporadores
app.get('/api/chiller/temperature-averages/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere una fecha para calcular promedios'
            });
        }

        // Validar que la tabla sea de minutos y válida para promedios de temperatura
        const allowedTables = ['chiller_aire_minutos', 'chiller_agua_minutos'];
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                success: false,
                message: 'Tabla no válida para promedios de temperatura. Solo se permiten tablas de minutos.'
            });
        }

        const temperatureData = await db.getDailyTemperatureAverages(table, date);
        
        res.json({ 
            success: true, 
            data: temperatureData 
        });
    } catch (error) {
        console.error('Error al obtener promedios de temperatura:', error);
        res.status(500).json({
            success: false,
            message: 'Error al calcular los promedios de temperatura del día'
        });
    }
});

// Endpoint para obtener promedios de energía del medidor ION
app.get('/api/chiller/energy-averages/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere una fecha para calcular promedios de energía'
            });
        }

        // Validar que la tabla sea válida para promedios de energía
        const allowedTables = ['ion_meter_minutos'];
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                success: false,
                message: 'Tabla no válida para promedios de energía. Solo se permiten tablas del medidor ION.'
            });
        }

        // Consultar los promedios de energía del día
        const query = `
            SELECT 
                AVG(kwh_imp) as avg_kwh_imp,
                AVG(kwh_exp) as avg_kwh_exp,
                AVG(kwh_tot) as avg_kwh_tot,
                AVG(kwh_net) as avg_kwh_net,
                AVG(kvarh_imp) as avg_kvarh_imp,
                AVG(kvarh_exp) as avg_kvarh_exp,
                AVG(kvarh_tot) as avg_kvarh_tot,
                AVG(kvarh_net) as avg_kvarh_net,
                AVG(kvah_tot) as avg_kvah_tot,
                AVG(freq) as avg_freq,
                AVG(vln_a) as avg_vln_a,
                AVG(vln_b) as avg_vln_b,
                AVG(vln_avg) as avg_vln_avg,
                AVG(ia) as avg_ia,
                AVG(ib) as avg_ib,
                AVG(pf) as avg_pf,
                COUNT(*) as total_records
            FROM ${table}
            WHERE DATE(fecha_hora) = ?
        `;

        const [results] = await db.pool.query(query, [date]);
        
        if (results.length === 0 || results[0].total_records === 0) {
            return res.status(404).json({
                success: false,
                message: 'No hay datos de energía para la fecha seleccionada'
            });
        }

        const energyData = {
            ...results[0],
            date: date,
            table: table
        };

        res.json({ 
            success: true, 
            data: energyData 
        });
    } catch (error) {
        console.error('Error al obtener promedios de energía:', error);
        res.status(500).json({
            success: false,
            message: 'Error al calcular los promedios de energía del día'
        });
    }
});

// Nuevo Endpoint para obtener KWH_NET de medianoche del medidor ION
app.get('/api/chiller/ion/midnight-kwh-net', async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere una fecha para obtener el KWH NET de medianoche'
            });
        }

        const midnightTimestamp = `${date} 00:00:00`;

        const query = `
            SELECT kwh_net
            FROM ion_meter_minutos
            WHERE fecha_hora = ?
            LIMIT 1
        `;

        const [results] = await db.pool.query(query, [midnightTimestamp]);
        
        if (results.length > 0) {
            res.json({
                success: true,
                kwh_net_midnight: results[0].kwh_net
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'No se encontró KWH NET para la medianoche de la fecha seleccionada'
            });
        }

    } catch (error) {
        console.error('Error al obtener KWH NET de medianoche:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener el KWH NET de medianoche'
        });
    }
});

// Nuevo Endpoint para obtener KWH_IMP de medianoche del medidor ION
app.get('/api/chiller/ion/midnight-kwh-imp', async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere una fecha para obtener el KWH IMP de medianoche'
            });
        }

        const midnightTimestamp = `${date} 00:00:00`;

        const query = `
            SELECT kwh_imp
            FROM ion_meter_minutos
            WHERE fecha_hora = ?
            LIMIT 1
        `;

        const [results] = await db.pool.query(query, [midnightTimestamp]);
        
        if (results.length > 0) {
            res.json({
                success: true,
                kwh_imp_midnight: results[0].kwh_imp
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'No se encontró KWH IMP para la medianoche de la fecha seleccionada'
            });
        }

    } catch (error) {
        console.error('Error al obtener KWH IMP de medianoche:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener el KWH IMP de medianoche'
        });
    }
});

// Endpoint para obtener estados de componentes del chiller
app.get('/api/chiller/component-status/:table', async (req, res) => {
    try {
        const { table } = req.params;
        
        // Validar que la tabla sea de segundos
        const allowedTables = ['chiller_aire_segundos', 'chiller_agua_segundos'];
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                success: false,
                message: 'Tabla no válida para estados de componentes. Solo se permiten tablas de segundos.'
            });
        }

        // Obtener el último registro para mostrar el estado actual
        const lastRecord = await db.getLastRecord(table);
        
        if (!lastRecord) {
            return res.status(404).json({
                success: false,
                message: 'No se encontraron registros para esta tabla'
            });
        }

        // Extraer los estados relevantes según la tabla
        let componentStatus = {};
        
        if (table === 'chiller_aire_segundos') {
            componentStatus = {
                compresor: lastRecord.status_compresor || 0,
                ventilador: lastRecord.status_air || 0,
                bomba_proceso: lastRecord.status_vdf_pump_process || 0,
                timestamp: lastRecord.fecha_hora
            };
        } else if (table === 'chiller_agua_segundos') {
            componentStatus = {
                compresor: lastRecord.status_compresor || 0,
                bomba_condensador: lastRecord.status_bomba_agua || 0,
                bomba_proceso: lastRecord.vdf_condensador_status || 0, // Usando vdf_condensador_status como bomba de proceso
                timestamp: lastRecord.fecha_hora
            };
        }

        res.json({ 
            success: true, 
            data: componentStatus 
        });
    } catch (error) {
        console.error('Error al obtener estados de componentes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener los estados de los componentes del chiller'
        });
    }
});

app.get('/api/chiller/uptime', async (req, res) => {
  const { date } = req.query;
  
  try {
    // Crear las fechas de inicio y fin del día para optimizar la consulta
    const startDate = `${date} 00:00:00`;
    const endDate = `${date} 23:59:59`;
    
    const query = `
      SELECT
        SUM(status_air) AS total_segundos_encendido_air,
        SUM(status_vdf_pump_process) AS total_segundos_encendido_pump,
        (SELECT SUM(status_water) 
         FROM chiller_agua_segundos 
         WHERE fecha_hora >= ? AND fecha_hora <= ?) AS total_segundos_encendido_water
      FROM chiller_aire_segundos
      WHERE fecha_hora >= ? AND fecha_hora <= ?
    `;
    
    const [results] = await db.pool.query(query, [startDate, endDate, startDate, endDate]);
    res.json(results[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener los datos de tiempo de encendido' });
  }
});

// Endpoint de diagnóstico para verificar estructura de tablas
app.get('/api/chiller/debug-tables', async (req, res) => {
    try {
        const tables = ['chiller_agua_minutos', 'chiller_agua_segundos', 'chiller_aire_segundos', 'ion_meter_minutos'];
        const results = {};

        for (const table of tables) {
            // Obtener estructura de la tabla
            const [columns] = await db.pool.query(`DESCRIBE ${table}`);
            
            // Obtener algunos registros de ejemplo
            const [sampleData] = await db.pool.query(`SELECT * FROM ${table} ORDER BY fecha_hora DESC LIMIT 3`);
            
            // Contar registros totales
            const [count] = await db.pool.query(`SELECT COUNT(*) as total FROM ${table}`);

            results[table] = {
                columns: columns.map(col => col.Field),
                sampleData: sampleData,
                totalRecords: count[0].total
            };
        }

        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Error al obtener información de debug:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener información de debug'
        });
    }
});

// Endpoint de diagnóstico específico para resumen bitácora
app.get('/api/chiller/debug-summary/:date', async (req, res) => {
    try {
        const { date } = req.params;
        
        // Calcular la fecha del día siguiente para el KWH IMP
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        const midnightNextDay = `${nextDayStr} 00:00:00`;

        // Crear timestamps para las consultas del día seleccionado
        const endOfDay = `${date} 23:59:59`;
        const startOfDay = `${date} 00:00:00`;

        console.log(`Debug Summary para fecha: ${date}`);
        console.log(`Día siguiente: ${nextDayStr}`);
        console.log(`Medianoche día siguiente: ${midnightNextDay}`);
        console.log(`Inicio del día: ${startOfDay}`);
        console.log(`Fin del día: ${endOfDay}`);

        const debugResults = {};

        // 1. Test KWH IMP query
        try {
            const [kwhResults] = await db.pool.query(`
                SELECT kwh_imp, fecha_hora
                FROM ion_meter_minutos
                WHERE fecha_hora = ?
                LIMIT 1
            `, [midnightNextDay]);
            debugResults.kwh_query = {
                query: `SELECT kwh_imp FROM ion_meter_minutos WHERE fecha_hora = '${midnightNextDay}'`,
                results: kwhResults,
                count: kwhResults.length
            };
        } catch (err) {
            debugResults.kwh_query = { error: err.message };
        }

        // 2. Test Water Uptime query
        try {
            const [waterResults] = await db.pool.query(`
                SELECT SUM(status_water) as total_segundos, COUNT(*) as total_records
                FROM chiller_agua_segundos
                WHERE fecha_hora >= ? AND fecha_hora <= ?
            `, [startOfDay, endOfDay]);
            debugResults.water_uptime_query = {
                query: `SELECT SUM(status_water) FROM chiller_agua_segundos WHERE fecha_hora BETWEEN '${startOfDay}' AND '${endOfDay}'`,
                results: waterResults,
                count: waterResults.length
            };
        } catch (err) {
            debugResults.water_uptime_query = { error: err.message };
        }

        // 3. Test Air Uptime query
        try {
            const [airResults] = await db.pool.query(`
                SELECT SUM(status_air) as total_segundos, COUNT(*) as total_records
                FROM chiller_aire_segundos
                WHERE fecha_hora >= ? AND fecha_hora <= ?
            `, [startOfDay, endOfDay]);
            debugResults.air_uptime_query = {
                query: `SELECT SUM(status_air) FROM chiller_aire_segundos WHERE fecha_hora BETWEEN '${startOfDay}' AND '${endOfDay}'`,
                results: airResults,
                count: airResults.length
            };
        } catch (err) {
            debugResults.air_uptime_query = { error: err.message };
        }

        // 4. Test Temperature query
        try {
            const [tempResults] = await db.pool.query(`
                SELECT AVG(temp_entrada_evaporador_c) as avg_temp, COUNT(*) as total_records
                FROM chiller_agua_minutos
                WHERE DATE(fecha_hora) = ?
            `, [date]);
            debugResults.temp_query = {
                query: `SELECT AVG(temp_entrada_evaporador_c) FROM chiller_agua_minutos WHERE DATE(fecha_hora) = '${date}'`,
                results: tempResults,
                count: tempResults.length
            };
        } catch (err) {
            debugResults.temp_query = { error: err.message };
        }

        // 5. Test Water Level query
        try {
            const [levelResults] = await db.pool.query(`
                SELECT level_sensor_tank2, fecha_hora
                FROM chiller_agua_minutos
                WHERE fecha_hora <= ?
                ORDER BY fecha_hora DESC
                LIMIT 1
            `, [endOfDay]);
            debugResults.water_level_query = {
                query: `SELECT level_sensor_tank2 FROM chiller_agua_minutos WHERE fecha_hora <= '${endOfDay}' ORDER BY fecha_hora DESC LIMIT 1`,
                results: levelResults,
                count: levelResults.length
            };
        } catch (err) {
            debugResults.water_level_query = { error: err.message };
        }

        // 6. Test Tank 2 Temperature query
        try {
            const [tank2Results] = await db.pool.query(`
                SELECT temp_entrada_evaporador_c, fecha_hora
                FROM chiller_agua_minutos
                WHERE fecha_hora <= ?
                ORDER BY fecha_hora DESC
                LIMIT 1
            `, [endOfDay]);
            debugResults.tank2_temp_query = {
                query: `SELECT temp_entrada_evaporador_c FROM chiller_agua_minutos WHERE fecha_hora <= '${endOfDay}' ORDER BY fecha_hora DESC LIMIT 1`,
                results: tank2Results,
                count: tank2Results.length
            };
        } catch (err) {
            debugResults.tank2_temp_query = { error: err.message };
        }

        res.json({ 
            success: true, 
            date: date,
            nextDay: nextDayStr,
            data: debugResults 
        });

    } catch (error) {
        console.error('Error en debug summary:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener información de debug del resumen'
        });
    }
});

// Endpoint para obtener resumen bitácora
app.get('/api/chiller/summary-bitacora', async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere una fecha para obtener el resumen bitácora'
            });
        }

        // Calcular la fecha del día siguiente para el KWH IMP
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        const midnightNextDay = `${nextDayStr} 00:00:00`;

        // Crear timestamps para las consultas del día seleccionado
        const endOfDay = `${date} 23:59:59`;
        const startOfDay = `${date} 00:00:00`;

        // 1. Main Meter ION7300 kWh (medianoche del día siguiente)
        const kwhQuery = `
            SELECT kwh_imp
            FROM ion_meter_minutos
            WHERE fecha_hora = ?
            LIMIT 1
        `;

        // 2. Hourmeter - Water Chiller (horas de tiempo encendido del chiller agua)
        const waterUptimeQuery = `
            SELECT SUM(status_water) as total_segundos
            FROM chiller_agua_segundos
            WHERE fecha_hora >= ? AND fecha_hora <= ?
        `;

        // 3. Hourmeter - Air Chiller (horas de tiempo encendido del chiller aire)
        const airUptimeQuery = `
            SELECT SUM(status_air) as total_segundos
            FROM chiller_aire_segundos
            WHERE fecha_hora >= ? AND fecha_hora <= ?
        `;

        // 4. Temp °C – Central Chilled Water Tank (Bottom) - promedio del día de entrada al evaporador
        const tempCentralQuery = `
            SELECT AVG(temp_entrada_evaporador_c) as avg_temp
            FROM chiller_agua_minutos
            WHERE DATE(fecha_hora) = ?
        `;

        // 5. Water Level – Tank 2 (a las 23:59:59, dividido entre 1000)
        const waterLevelQuery = `
            SELECT level_sensor_tank2
            FROM chiller_agua_minutos
            WHERE fecha_hora <= ?
            ORDER BY fecha_hora DESC
            LIMIT 1
        `;

        // 6. Temp °C – Tank 2 (temp entrada evaporador a las 23:59:59)
        const tempTank2Query = `
            SELECT temp_entrada_evaporador_c
            FROM chiller_agua_minutos
            WHERE fecha_hora <= ?
            ORDER BY fecha_hora DESC
            LIMIT 1
        `;

        // Ejecutar todas las consultas con logs de depuración
        console.log('Ejecutando consulta KWH IMP para:', midnightNextDay);
        const [kwhResults] = await db.pool.query(kwhQuery, [midnightNextDay]);
        console.log('Resultados KWH IMP:', kwhResults);

        console.log('Ejecutando consulta Water Uptime para:', startOfDay, 'a', endOfDay);
        const [waterUptimeResults] = await db.pool.query(waterUptimeQuery, [startOfDay, endOfDay]);
        console.log('Resultados Water Uptime:', waterUptimeResults);

        console.log('Ejecutando consulta Air Uptime para:', startOfDay, 'a', endOfDay);
        const [airUptimeResults] = await db.pool.query(airUptimeQuery, [startOfDay, endOfDay]);
        console.log('Resultados Air Uptime:', airUptimeResults);

        console.log('Ejecutando consulta Temperature para:', date);
        const [tempCentralResults] = await db.pool.query(tempCentralQuery, [date]);
        console.log('Resultados Temperature:', tempCentralResults);

        console.log('Ejecutando consulta Water Level para:', endOfDay);
        const [waterLevelResults] = await db.pool.query(waterLevelQuery, [endOfDay]);
        console.log('Resultados Water Level:', waterLevelResults);

        console.log('Ejecutando consulta Tank2 Temp para:', endOfDay);
        const [tempTank2Results] = await db.pool.query(tempTank2Query, [endOfDay]);
        console.log('Resultados Tank2 Temp:', tempTank2Results);

        // Procesar los resultados
        const summaryData = {
            // Main Meter ION7300 kWh
            main_meter_kwh: kwhResults.length > 0 && kwhResults[0].kwh_imp !== null ? 
                parseFloat(kwhResults[0].kwh_imp) : null,

            // Hourmeter - Water Chiller (convertir segundos a horas con 3 decimales)
            hourmeter_water_chiller: waterUptimeResults.length > 0 && waterUptimeResults[0].total_segundos !== null ? 
                parseFloat((parseFloat(waterUptimeResults[0].total_segundos) / 3600).toFixed(3)) : null,

            // Hourmeter - Air Chiller (convertir segundos a horas con 3 decimales)
            hourmeter_air_chiller: airUptimeResults.length > 0 && airUptimeResults[0].total_segundos !== null ? 
                parseFloat((parseFloat(airUptimeResults[0].total_segundos) / 3600).toFixed(3)) : null,

            // Temp °C – Central Chilled Water Tank (Bottom)
            temp_central_chilled_water_tank: tempCentralResults.length > 0 && tempCentralResults[0].avg_temp !== null ? 
                parseFloat(parseFloat(tempCentralResults[0].avg_temp).toFixed(2)) : null,

            // Water Level – Tank 2 (dividir entre 1000)
            water_level_tank2: waterLevelResults.length > 0 && waterLevelResults[0].level_sensor_tank2 !== null ? 
                parseFloat((parseFloat(waterLevelResults[0].level_sensor_tank2) / 1000).toFixed(1)) : null,

            // Temp °C – Tank 2
            temp_tank2: tempTank2Results.length > 0 && tempTank2Results[0].temp_entrada_evaporador_c !== null ? 
                parseFloat(parseFloat(tempTank2Results[0].temp_entrada_evaporador_c).toFixed(2)) : null,

            date: date,
            next_day: nextDayStr
        };

        console.log('Datos procesados del resumen:', summaryData);

        res.json({ 
            success: true, 
            data: summaryData 
        });

    } catch (error) {
        console.error('Error al obtener resumen bitácora:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener el resumen bitácora'
        });
    }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor HTTP corriendo en puerto ${PORT} y accesible desde la red`);
});

// Exportar app para tests si es necesario
module.exports = app;