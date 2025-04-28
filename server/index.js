const express = require('express');
const cors = require('cors');

// Fix for debug package issue
process.env.DEBUG = '*'; // Enable all debug logs or use 'modbus-serial' for specific logs
global.debug = require('debug');

const ModbusRTU = require('modbus-serial');

const app = express();
app.use(cors());
app.use(express.json());

// --- Configuración Esencial ---
const TARGET_IP = "192.168.7.10";     // IP del dispositivo
const TARGET_PORT = 502;               // Puerto Modbus TCP
const SLAVE_ID = 1;                    // ID del esclavo
const TIMEOUT = 5000;                  // Timeout general (ms)
const PULSE_WIDTH_MS = 1000;           // Duración del pulso en milisegundos

// --- Button Addresses (Base 0) ---
const START_BUTTON_ADDRESS = 39;       // Proworx 000040 (Encender)
const CANCEL_ALARM_BUTTON_ADDRESS = 41; // Proworx 000042 (Cancelar Alarma)
const CHILLER_STATUS_ADDRESS = 202;    // Dirección para leer estado

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

// Endpoint para obtener el estado del chiller
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
    console.log(`Servidor Modbus API corriendo en puerto ${PORT}`);
});

// Exportar app para tests si es necesario
module.exports = app;