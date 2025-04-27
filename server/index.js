import ModbusRTU from "modbus-serial";

// --- Configuración Esencial ---
const TARGET_IP = "192.168.30.50";     // IP del dispositivo
const TARGET_PORT = 502;               // Puerto Modbus TCP
const SLAVE_ID = 1;                    // ID del esclavo
const REGISTER_ADDRESS = 199;          // <-- Dirección base 0 (Ej: 40200 -> 199)
const REGISTER_TYPE = 'holding';       // <-- Tipo: 'holding', 'input', o 'coil'
const TIMEOUT = 5000;                  // Timeout general (ms)

// --- Lógica Principal (Minimalista) ---
(async () => { // IIAFE para usar await directamente
    const client = new ModbusRTU();
    try {
        client.setTimeout(TIMEOUT); // Establecer timeout para operaciones
        await client.connectTCP(TARGET_IP, { port: TARGET_PORT });
        client.setID(SLAVE_ID);

        let result;
        // Seleccionar la función de lectura correcta
        if (REGISTER_TYPE === 'holding') {
            result = await client.readHoldingRegisters(REGISTER_ADDRESS, 1); // Leer 1 registro
        } else if (REGISTER_TYPE === 'input') {
            result = await client.readInputRegisters(REGISTER_ADDRESS, 1); // Leer 1 registro
        } else if (REGISTER_TYPE === 'coil') {
            result = await client.readCoils(REGISTER_ADDRESS, 1);          // Leer 1 registro
        } else {
            throw new Error(`Tipo de registro inválido: ${REGISTER_TYPE}`);
        }

        // Mostrar resultado si es válido
        if (result && result.data && result.data.length > 0) {
            console.log(`Valor Crudo [${REGISTER_TYPE}@${REGISTER_ADDRESS}]:`, result.data[0]);
        } else {
            console.error("Respuesta Modbus inválida o vacía.");
        }

    } catch (error) {
        // Mostrar solo el mensaje de error
        console.error("ERROR:", error.message);
    } finally {
        // Siempre intentar cerrar la conexión
        if (client.isOpen) {
            client.close();
        }
    }
})(); 