// Cambiado de 'import' a 'require'
const express = require('express');
const cors = require('cors');

// Fix for debug package issue
process.env.DEBUG = '*'; // Enable all debug logs or use 'modbus-serial' for specific logs
global.debug = require('debug');

const ModbusRTU = require('modbus-serial'); // Importación directa con require

const app = express();
app.use(cors());
app.use(express.json());

// --- Configuración Esencial ---
// const TARGET_IP = "192.168.30.50";     // IP del dispositivo
const TARGET_IP = "192.168.7.10";     // IP del dispositivo

const TARGET_PORT = 502;               // Puerto Modbus TCP
const SLAVE_ID = 1;                    // ID del esclavo
const CHILLER_ON_ADDRESS = 49;        // Dirección para encender chiller
const CHILLER_OFF_ADDRESS = 50;       // Dirección para apagar chiller
const CHILLER_STATUS_ADDRESS = 202;    // Dirección para leer estado
const TIMEOUT = 5000;                   // Timeout general (ms)

// Función auxiliar para conectar al cliente Modbus (ahora no necesita ser async solo por la importación)
async function getModbusClient() {
    // Ya no se necesita 'await import', ModbusRTU ya está cargado
    const client = new ModbusRTU();
    client.setTimeout(TIMEOUT);
    // connectTCP sigue siendo asíncrono, así que mantenemos await aquí
    await client.connectTCP(TARGET_IP, { port: TARGET_PORT });
    client.setID(SLAVE_ID);
    return client;
}

// Endpoint para encender el chiller (sin cambios en la lógica interna)
// Endpoint para poner el chiller en modo AUTO
app.post('/api/chiller/mode/auto', async (req, res) => {
    let client;
    try {
        client = await getModbusClient();
        console.log('Intentando escribir Coil 49=true, Coil 50=false'); // Log de depuración
        // Primero pon el deseado en TRUE
        await client.writeCoil(CHILLER_AUTO_MODE_ADDRESS, true);
        // Luego pon el otro en FALSE explícitamente
        await client.writeCoil(CHILLER_MANUAL_MODE_ADDRESS, false);
        console.log('Escritura de Coils (AUTO) completada.'); // Log de depuración
        res.json({ success: true, message: 'Chiller puesto en modo AUTO' });
    } catch (error) {
        // LOG DETALLADO DEL ERROR
        console.error("Error detallado al poner modo AUTO:", error);
        res.status(500).json({ success: false, message: error.message || 'Error interno del servidor', code: error.code, errno: error.errno });
    } finally {
        // ... (código finally sin cambios) ...
    }
});

// Endpoint para poner el chiller en modo MANUAL (haz lo mismo)
app.post('/api/chiller/mode/manual', async (req, res) => {
    let client;
    try {
        client = await getModbusClient();
        console.log('Intentando escribir Coil 50=true, Coil 49=false'); // Log de depuración
        // Primero pon el deseado en TRUE
        await client.writeCoil(CHILLER_MANUAL_MODE_ADDRESS, true);
        // Luego pon el otro en FALSE explícitamente
        await client.writeCoil(CHILLER_AUTO_MODE_ADDRESS, false);
        console.log('Escritura de Coils (MANUAL) completada.'); // Log de depuración
        res.json({ success: true, message: 'Chiller puesto en modo MANUAL' });
    } catch (error) {
        // LOG DETALLADO DEL ERROR
        console.error("Error detallado al poner modo MANUAL:", error);
        res.status(500).json({ success: false, message: error.message || 'Error interno del servidor', code: error.code, errno: error.errno });
    } finally {
         // ... (código finally sin cambios) ...
    }
});

// Endpoint para obtener el estado del chiller (sin cambios en la lógica interna)
app.get('/api/chiller/status', async (req, res) => {
    let client;
    try {
        client = await getModbusClient();
        const result = await client.readHoldingRegisters(CHILLER_STATUS_ADDRESS, 1);
        // Valida que result y result.data existen antes de acceder
        if (result && result.data && result.data.length > 0) {
            const isOn = result.data[0] === 1; // Asume 1=ON, otro valor=OFF
            res.json({ success: true, isOn });
        } else {
             throw new Error("Respuesta inválida del dispositivo Modbus");
        }
    } catch (error) {
        console.error("Error al obtener estado:", error);
        res.status(500).json({ success: false, message: error.message || 'Error interno del servidor' });
    } finally {
        if (client && client.isOpen) {
            client.close(() => { console.log("Cliente Modbus cerrado (Status)"); });
        } else if (client && !client.isOpen) {
             console.log("Cliente Modbus ya estaba cerrado (Status)");
        }
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor Modbus API (CommonJS) corriendo en puerto ${PORT}`); // Mensaje actualizado
});

// Exportar 'app' no es estrictamente necesario si solo ejecutas este archivo,
// pero es buena práctica si alguna vez necesitas importarlo en otro lugar (p.ej. para tests).
// module.exports = app; // Descomentar si es necesario