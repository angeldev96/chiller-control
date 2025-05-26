import ModbusRTU from "modbus-serial";
import moment from "moment-timezone";
// --- Importa la conexión pool desde tu archivo ---
import { pool } from "./database.js";

// --- Constantes y Configuraciones Modbus ---
const CHILLER_AIRE_IP = "192.168.30.50"; // <--- VERIFICA ESTA IP
const CHILLER_AGUA_IP = "192.168.30.50"; // <--- VERIFICA ESTA IP (¿Es la misma?)
const MODBUS_PORT = 502;
const SLAVE_ID = 1;
const CONNECT_TIMEOUT = 5000; // Tiempo de espera para conectar (ms)
const READ_TIMEOUT = 3000;    // Tiempo de espera para leer (ms)
const VALOR_FALLO = null;      // Valor a usar si la lectura o procesamiento falla

// --- Constantes de Configuración General ---
const ZONA_HORARIA = "America/Tegucigalpa"; // Asegúrate que sea tu zona horaria
const INTERVALO_LECTURA_MS = 15000; // Aumentado a 15 segundos, ya que solo nos importan los minutos

// --- Identificadores para la BD ---
const CHILLER_ID_AIRE = 'CHILLER_AIRE_01';
const CHILLER_ID_AGUA = 'CHILLER_AGUA_01';

// --- Definición de Registros a Leer (SOLO MINUTOS) ---
const REGISTROS_A_LEER_MINUTOS = {
    // ========== CHILLER AIRE (Minutos) ==========
    "AIRE_PRESION_SALIDA_COMPRESOR": { ip: CHILLER_AIRE_IP, type: "holding", addr: 100, desc: "Presión de salida del compresor", scale: 10, freq: "min", dbColumn: "presion_salida_compresor_psi" },
    "AIRE_PRESION_ENTRADA_COMPRESOR": { ip: CHILLER_AIRE_IP, type: "holding", addr: 199, desc: "Presión de entrada del compresor", scale: 100, freq: "min", dbColumn: "presion_entrada_compresor_psi" },
    "AIRE_TEMP_ENTRADA_EVAPORADOR": { ip: CHILLER_AIRE_IP, type: "holding", addr: 50, desc: "Temperatura de entrada del evaporador", scale: 100, freq: "min", dbColumn: "temp_entrada_evaporador_c" },
    "AIRE_TEMP_SALIDA_EVAPORADOR": { ip: CHILLER_AIRE_IP, type: "holding", addr: 89, desc: "Temperatura de salida del evaporador", scale: 100, freq: "min", dbColumn: "temp_salida_evaporador_c" },

    // ========== CHILLER AGUA (Minutos) ==========
    "AGUA_PRESION_SALIDA_COMPRESOR": { ip: CHILLER_AGUA_IP, type: "holding", addr: 150, desc: "Presión de salida del compresor de agua", scale: 10, freq: "min", dbColumn: "presion_salida_compresor_psi" },
    "AGUA_PRESION_ENTRADA_COMPRESOR": { ip: CHILLER_AGUA_IP, type: "holding", addr: 153, desc: "Presión de entrada del compresor de agua", scale: 10, freq: "min", dbColumn: "presion_entrada_compresor_psi" },
    "AGUA_TEMP_ENTRADA_CONDENSADOR": { ip: CHILLER_AGUA_IP, type: "holding", addr: 176, desc: "Temperatura de entrada del condensador", scale: 100, freq: "min", dbColumn: "temp_entrada_condensador_c" },
    "AGUA_LEVEL_SENSOR_TANK1": { ip: CHILLER_AGUA_IP, type: "input", addr: 11, desc: "Nivel del sensor del tanque 1", scale: 1, freq: "min", dbColumn: "level_sensor_tank1" },
    "AGUA_LEVEL_SENSOR_TANK2": { ip: CHILLER_AGUA_IP, type: "input", addr: 12, desc: "Nivel del sensor del tanque 2", scale: 1, freq: "min", dbColumn: "level_sensor_tank2" },
    "AGUA_TEMP_ENTRADA_EVAPORADOR": { ip: CHILLER_AGUA_IP, type: "holding", addr: 164, desc: "Temperatura entrada evaporador agua", scale: 100, freq: "min", dbColumn: "temp_entrada_evaporador_c" },
    "AGUA_TEMP_SALIDA_EVAPORADOR": { ip: CHILLER_AGUA_IP, type: "holding", addr: 170, desc: "Temperatura salida evaporador agua", scale: 100, freq: "min", dbColumn: "temp_salida_evaporador_c" }
};

// Para evitar procesar el mismo minuto dos veces
let ultimoMinutoProcesado = null;

// --- Funciones Auxiliares Modbus (Sin cambios) ---
async function leerRegistrosPorPLC(ip, registrosConfig) {
    const client = new ModbusRTU();
    const resultadosRaw = {};
    let conectado = false;

    try {
        client.setTimeout(CONNECT_TIMEOUT);
        await client.connectTCP(ip, { port: MODBUS_PORT });
        client.setID(SLAVE_ID);
        conectado = true;
        client.setTimeout(READ_TIMEOUT);

        for (const config of registrosConfig) {
            const key = config.key;
            try {
                let result;
                switch (config.type) {
                    case 'holding':
                        result = await client.readHoldingRegisters(config.addr, 1);
                        resultadosRaw[key] = result.data[0];
                        break;
                    case 'input':
                        result = await client.readInputRegisters(config.addr, 1);
                        resultadosRaw[key] = result.data[0];
                        break;
                    // No necesitamos leer coils para los datos minutales en este ejemplo
                    // pero dejamos la lógica por si se añade alguno en el futuro
                    case 'coil':
                        result = await client.readCoils(config.addr, 1);
                        resultadosRaw[key] = (result.data && result.data.length > 0) ? result.data[0] : VALOR_FALLO;
                        break;
                    default:
                        resultadosRaw[key] = VALOR_FALLO;
                }
            } catch (readError) {
                console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR al leer ${config.desc} (${key}) desde ${ip}: ${readError.message}`);
                resultadosRaw[key] = VALOR_FALLO;
            }
        }
        return resultadosRaw;

    } catch (connectError) {
        console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR FATAL al conectar o configurar ${ip}: ${connectError.message}`);
        registrosConfig.forEach(config => {
            resultadosRaw[config.key] = VALOR_FALLO;
        });
        return resultadosRaw;

    } finally {
        if (conectado && client.isOpen) {
            try {
                await client.close(() => {});
            } catch (closeError) {
                console.error(`[${moment().tz(ZONA_HORARIA).format()}] Error al cerrar conexión con ${ip}: ${closeError.message}`);
            }
        }
    }
}

// --- Función de Procesamiento (Sin cambios, pero solo procesará datos minutales) ---
function procesarValor(valorRaw, config) {
    if (valorRaw === VALOR_FALLO || valorRaw === null || valorRaw === undefined) {
        return VALOR_FALLO;
    }
    if (typeof valorRaw === 'boolean') {
        return valorRaw ? 1 : 0; // Aunque no esperamos bools en minutos ahora mismo
    }
    if (config.scale && typeof valorRaw === 'number') {
        return valorRaw / config.scale;
    }
    if (typeof valorRaw === 'number') {
         return valorRaw;
    }
    return VALOR_FALLO;
}

// --- Función de Inserción en Base de Datos para MINUTOS (Sin cambios) ---
async function registrarDatosMinuto(tabla, chillerId, timestamp, datos) {
    const columnas = Object.keys(datos).filter(col => datos[col] !== VALOR_FALLO);

    if (columnas.length === 0) {
        return;
    }

    const columnasSql = columnas.join(', ');
    const placeholders = columnas.map(() => '?').join(', ');
    const updatesSql = columnas.map(col => `${col} = VALUES(${col})`).join(', ');
    const valores = columnas.map(col => datos[col]);

    const query = `
        INSERT INTO ${tabla} (chiller_id, fecha_hora, ${columnasSql})
        VALUES (?, ?, ${placeholders})
        ON DUPLICATE KEY UPDATE ${updatesSql}
    `;
    const finalValues = [chillerId, timestamp, ...valores];

    try {
        await pool.query(query, finalValues);
    } catch (error) {
        console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR al guardar datos MINUTO en ${tabla} para ${timestamp}: ${error.message}`);
    }
}

// --- Lógica Principal de Ejecución del Ciclo (Simplificada) ---
async function ejecutarCicloLecturaYGuardadoMinutos() {
    const ahora = moment().tz(ZONA_HORARIA);
    const minutoActualTimestamp = ahora.clone().startOf("minute").format("YYYY-MM-DD HH:mm:ss");

    try {
        // --- 1. Agrupar registros MINUTALES por IP ---
        const todosLosResultadosRaw = {};
        const registrosPorIP = {};
        for (const [key, config] of Object.entries(REGISTROS_A_LEER_MINUTOS)) { // Usa la lista filtrada
            const ip = config.ip;
            if (!registrosPorIP[ip]) registrosPorIP[ip] = [];
            config.key = key;
            registrosPorIP[ip].push(config);
        }

        // --- 2. Leer Datos Raw MINUTALES por IP ---
        for (const ip in registrosPorIP) {
            const configParaIP = registrosPorIP[ip];
            const resultadosRawIP = await leerRegistrosPorPLC(ip, configParaIP);
            Object.assign(todosLosResultadosRaw, resultadosRawIP);
        }

        // --- 3. Procesar y Separar Datos MINUTALES ---
        const datosAireMin = {};
        const datosAguaMin = {};

        for (const [key, config] of Object.entries(REGISTROS_A_LEER_MINUTOS)) { // Usa la lista filtrada
            const valorRaw = todosLosResultadosRaw[key];
            const valorProcesado = procesarValor(valorRaw, config);
            const dbCol = config.dbColumn;

            if (valorProcesado !== VALOR_FALLO) {
                 if (key.startsWith('AIRE_')) {
                    datosAireMin[dbCol] = valorProcesado;
                } else if (key.startsWith('AGUA_')) {
                    datosAguaMin[dbCol] = valorProcesado;
                }
            }
        }

        // --- 4. Insertar/Actualizar Datos de MINUTO (solo si el minuto cambió) ---
        if (minutoActualTimestamp !== ultimoMinutoProcesado) {
            ultimoMinutoProcesado = minutoActualTimestamp;

            await registrarDatosMinuto('chiller_aire_minutos', CHILLER_ID_AIRE, minutoActualTimestamp, datosAireMin);
            await registrarDatosMinuto('chiller_agua_minutos', CHILLER_ID_AGUA, minutoActualTimestamp, datosAguaMin);
        }

    } catch (error) {
        console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR CRÍTICO en ciclo principal (minutos): ${error.message}`, error.stack);
    }
}

// --- Inicialización y arranque (Simplificado) ---
async function iniciarAplicacion() {
    try {
        const connection = await pool.getConnection();
        connection.release();
    } catch (error) {
        console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR CRÍTICO al conectar a la base de datos al inicio: ${error.message}`);
        process.exit(1);
    }

    // Ejecutar el primer ciclo inmediatamente
    await ejecutarCicloLecturaYGuardadoMinutos();

    // Configurar ejecución periódica
    // Aumentamos el intervalo ya que solo nos interesan los cambios de minuto.
    // Leer cada 15 segundos debería ser suficiente para capturar el cambio de minuto.
    setInterval(ejecutarCicloLecturaYGuardadoMinutos, INTERVALO_LECTURA_MS);
}

// --- Manejo de errores no capturados (Sin cambios) ---
process.on('uncaughtException', (error) => {
    console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR NO CAPTURADO (Uncaught Exception): ${error.message}`, error.stack);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR NO CAPTURADO (Unhandled Rejection):`, reason);
});

// Iniciar la aplicación
iniciarAplicacion().catch(error => {
    console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR FATAL durante la inicialización: ${error.message}`, error.stack);
    process.exit(1);
});