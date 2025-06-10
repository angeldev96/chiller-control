import ModbusRTU from "modbus-serial";
import moment from "moment-timezone";
// --- Importa la conexión pool desde tu archivo ---
import { pool } from "./database.js"; // Asume que database.js está en el mismo directorio

// --- Constantes y Configuraciones Modbus ---
const TARGET_IP = "192.168.30.50";     // IP del dispositivo (Verificar si ambos chillers usan esta)
const MODBUS_PORT = 502;
const SLAVE_ID = 1;
const CONNECT_TIMEOUT = 5000; // Tiempo de espera para conectar (ms)
const READ_TIMEOUT = 2500;    // Tiempo de espera para leer (ms) - Ajustado
const VALOR_FALLO = null;      // Valor a usar si la lectura falla (aunque preferimos no insertar en caso de fallo)

// --- Constantes de Configuración General ---
const ZONA_HORARIA = "America/Tegucigalpa"; // Asegúrate que sea tu zona horaria
const INTERVALO_LECTURA_MS = 1000; // Ejecutar cada SEGUNDO

// --- Identificadores para la BD ---
const CHILLER_ID_AIRE = 'CHILLER_AIRE_01';
const CHILLER_ID_AGUA = 'CHILLER_AGUA_01';
const TABLA_AIRE_SEGUNDOS = 'chiller_aire_segundos';
const TABLA_AGUA_SEGUNDOS = 'chiller_agua_segundos';

// --- Definición de Registros a Leer (VALIDADA CON SCHEMA - EXCLUYE COLUMNAS INEXISTENTES DE BD) ---
// Incluye: name (único), originalAddress, type, base0Address, dbColumn (SI EXISTE), chillerType, [transform]
const DEFINICIONES_REGISTROS = [
    // --- Chiller enfriado por aire ---
    // Columna: presion_agua_proceso_psi (decimal(6,1))
    { name: 'AIRE_PresionAguaProceso', originalAddress: '40191', type: 'holding', base0Address: 190, transform: value => value / 10, dbColumn: 'presion_agua_proceso_psi', chillerType: 'aire' },
    // Columna: status_vdf_pump_process (tinyint unsigned)
    { name: 'AIRE_StatusVDFPumpProcess', originalAddress: '0:0013', type: 'coil', base0Address: 12, dbColumn: 'status_vdf_pump_process', chillerType: 'aire' },
    // Columna: solenoide_gas (tinyint unsigned)
    { name: 'AIRE_SolenoidGas', originalAddress: '0:0031', type: 'coil', base0Address: 30, dbColumn: 'solenoide_gas', chillerType: 'aire' },
    // Columna: solenoide_liquido (smallint unsigned) <- VERIFICAR TIPO MODBUS (¿Realmente coil?)
    { name: 'AIRE_SolenoidLiquido', originalAddress: '0:0032', type: 'coil', base0Address: 31, dbColumn: 'solenoide_liquido', chillerType: 'aire' },
    // Columna: status_compresor (smallint unsigned) <- VERIFICAR TIPO MODBUS (¿Realmente coil?)
    { name: 'AIRE_StatusCompresor', originalAddress: '0:0001', type: 'coil', base0Address: 0, dbColumn: 'status_compresor', chillerType: 'aire' },
    // Columna: status_bomba (smallint unsigned) <- VERIFICAR TIPO MODBUS (¿Realmente coil?)
    { name: 'AIRE_StatusBomba', originalAddress: '0:0002', type: 'coil', base0Address: 1, dbColumn: 'status_bomba', chillerType: 'aire' },
    // Columna: enable_air (tinyint unsigned)
    { name: 'AIRE_Enable', originalAddress: '0:00090', type: 'coil', base0Address: 89, dbColumn: 'enable_air', chillerType: 'aire' },
    // Columna: status_air (smallint unsigned) <- VERIFICAR TIPO MODBUS (¿Realmente coil?)
    { name: 'AIRE_Status', originalAddress: '0:000100', type: 'coil', base0Address: 99, dbColumn: 'status_air', chillerType: 'aire' },

    // --- Chiller enfriado por agua ---
    // Columna: enable_water (tinyint unsigned)
    { name: 'AGUA_Enable', originalAddress: '0:00190', type: 'coil', base0Address: 189, dbColumn: 'enable_water', chillerType: 'agua' },
    // Columna: status_water (smallint unsigned)
    { name: 'AGUA_Status', originalAddress: '0:00200', type: 'coil', base0Address: 199, dbColumn: 'status_water', chillerType: 'agua' },
    // Columna: status_compresor (smallint unsigned)
    { name: 'AGUA_StatusCompresor', originalAddress: '0:0004', type: 'coil', base0Address: 3, dbColumn: 'status_compresor', chillerType: 'agua' },
    // Columna: solenoide_liquido (smallint unsigned)
    { name: 'AGUA_SolenoidLiquido', originalAddress: '0:00030', type: 'coil', base0Address: 29, dbColumn: 'solenoide_liquido', chillerType: 'agua' },
    // Columna: status_bomba_agua (smallint unsigned)
    { name: 'AGUA_StatusBombaAgua', originalAddress: '0:0005', type: 'coil', base0Address: 4, dbColumn: 'status_bomba_agua', chillerType: 'agua' },
    // Columna: pump_tank1_status (smallint unsigned)
    { name: 'AGUA_PumpTank1', originalAddress: '0:0006', type: 'coil', base0Address: 5, dbColumn: 'pump_tank1_status', chillerType: 'agua' },
    // Columna: vdf_condensador_status (tinyint unsigned)
    { name: 'AGUA_VDFCondensador', originalAddress: '0:0008', type: 'coil', base0Address: 7, dbColumn: 'vdf_condensador_status', chillerType: 'agua' },
    // Columna: solenoide_gas (tinyint unsigned)
    { name: 'AGUA_SolenoidGas', originalAddress: '0:00026', type: 'coil', base0Address: 25, dbColumn: 'solenoide_gas', chillerType: 'agua' },

    // --- Registros Leídos del Modbus PERO SIN COLUMNA EN LA BD (NO SE INSERTARÁN) ---
    { name: 'AGUA_LevelSensorTank1', originalAddress: '30012', type: 'input', base0Address: 11, dbColumn: null, chillerType: 'agua' }, // dbColumn es null porque no existe en la tabla
    { name: 'AGUA_LevelSensorTank2', originalAddress: '30013', type: 'input', base0Address: 12, dbColumn: null, chillerType: 'agua' }, // dbColumn es null porque no existe en la tabla
];
// --- **ACCIÓN REQUERIDA:** Verifica si los registros marcados con "VERIFICAR TIPO MODBUS"
// --- son realmente Coils (ON/OFF) o si deberías leerlos como 'holding' registers.
// --- Si son 'holding', cambia el `type` en esta definición. ¡Esto NO causará error si la DB es smallint!
// --- Si necesitas guardar los Level Sensors (30012, 30013), DEBES AÑADIR las columnas
// --- `level_sensor_tank1` y `level_sensor_tank2` (o como quieras llamarlas) a la tabla
// --- `chiller_agua_segundos` y luego actualizar el `dbColumn` correspondiente aquí.

// ========================================================================
// === EL RESTO DEL CÓDIGO (FUNCIONES, CICLO PRINCIPAL, ETC.)            ===
// === ES IDÉNTICO AL DE LA RESPUESTA ANTERIOR. COPIA Y PEGA            ===
// === DESDE AQUÍ HACIA ABAJO DE LA RESPUESTA ANTERIOR O ÚSALO COMPLETO: ===
// ========================================================================

// --- Función de Lectura Modbus Optimizada (Adaptada) ---
async function leerTodosLosRegistros(ip, registrosDefs) {
    const client = new ModbusRTU();
    const results = {}; // Objeto para almacenar los resultados finales { name: { ... data ... } }
    let conectado = false;

    // Filtrar solo los registros que tienen una dirección base 0 válida para leer
    const registrosALeer = registrosDefs.filter(r => r.base0Address !== undefined && r.base0Address !== null);

    try {
        client.setTimeout(CONNECT_TIMEOUT);
        await client.connectTCP(ip, { port: MODBUS_PORT });
        client.setID(SLAVE_ID);
        conectado = true;
        client.setTimeout(READ_TIMEOUT); // Timeout para operaciones de lectura

        // 1. Agrupar registros por tipo y ordenar por dirección base 0
        const groupedRegisters = { holding: [], input: [], coil: [] };
        registrosALeer.forEach(regDef => { // Usar la lista filtrada para leer
            if (groupedRegisters[regDef.type]) {
                groupedRegisters[regDef.type].push(regDef);
            }
        });
        for (const type in groupedRegisters) {
            groupedRegisters[type].sort((a, b) => a.base0Address - b.base0Address);
        }

        // 2. Crear y ejecutar tareas de lectura optimizadas
        const readTasks = [];

        for (const type of ['holding', 'input', 'coil']) {
            const registers = groupedRegisters[type];
            if (registers.length === 0) continue;

            let currentReadStart = -1;
            let currentReadLength = 0;
            let registersInCurrentRead = [];

            const executeRead = async (startAddr, len, readType, regsIncluded) => {
                try {
                    let readResult;
                    const functionName = {
                        holding: 'readHoldingRegisters',
                        input: 'readInputRegisters',
                        coil: 'readCoils'
                    }[readType];

                    readResult = await client[functionName](startAddr, len);

                    if (readResult && readResult.data) {
                        regsIncluded.forEach((regInfo) => {
                            const offset = regInfo.base0Address - startAddr;
                            if (offset >= 0 && offset < readResult.data.length) {
                                const rawValue = readResult.data[offset];
                                const finalValue = regInfo.transform ? regInfo.transform(rawValue) : rawValue;
                                results[regInfo.name] = {
                                    rawValue: rawValue,
                                    value: finalValue,
                                    success: true,
                                    type: regInfo.type
                                };
                            } else {
                                console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR: Offset inválido (${offset}) para ${regInfo.name} en bloque ${startAddr}-${len}`);
                                results[regInfo.name] = { error: `Offset inválido`, success: false };
                            }
                        });
                    } else {
                        console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR: Lectura fallida o vacía para ${readType} @ ${startAddr} (len ${len})`);
                        regsIncluded.forEach(regInfo => {
                            results[regInfo.name] = { error: `Lectura fallida (respuesta vacía)`, success: false };
                        });
                    }
                } catch (err) {
                    console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR leyendo ${readType} @ ${startAddr} (len ${len}): ${err.message} (Code: ${err.modbusCode})`);
                    regsIncluded.forEach(regInfo => {
                        results[regInfo.name] = { error: err.message, modbusCode: err.modbusCode, success: false };
                    });
                }
            };

            // Agrupar lecturas contiguas
            for (let i = 0; i < registers.length; i++) {
                const reg = registers[i];
                if (currentReadStart === -1 || reg.base0Address !== currentReadStart + currentReadLength) {
                    if (currentReadStart !== -1) {
                        readTasks.push(executeRead(currentReadStart, currentReadLength, type, [...registersInCurrentRead]));
                    }
                    currentReadStart = reg.base0Address;
                    currentReadLength = 1;
                    registersInCurrentRead = [reg];
                } else {
                    currentReadLength += 1;
                    registersInCurrentRead.push(reg);
                }
            }
            if (currentReadStart !== -1) {
                readTasks.push(executeRead(currentReadStart, currentReadLength, type, [...registersInCurrentRead]));
            }
        }

        // 3. Esperar a que todas las lecturas terminen
        await Promise.all(readTasks);

    } catch (connectError) {
        console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR FATAL al conectar o configurar ${ip}: ${connectError.message}`);
        // Marcar todos como fallidos si la conexión falla
        registrosALeer.forEach(regDef => { // Marcar los que se intentaron leer
            results[regDef.name] = { error: `Error de conexión a ${ip}`, success: false };
        });
    } finally {
        if (conectado && client.isOpen) {
            client.close(() => {});
        }
    }
    return results; // Devuelve el objeto con todos los resultados por 'name'
}


// --- Función de Inserción en Base de Datos (Adaptada ligeramente para logs) ---
async function registrarDatosSegundo(tabla, chillerId, timestamp, datos) {
    const columnas = Object.keys(datos); // Insertar todas las columnas recibidas

    if (columnas.length === 0) {
        // Esto es normal si solo se leyeron registros sin columna BD o todos fallaron
        return;
    }

    const columnasSql = columnas.map(c => `\`${c}\``).join(', '); // Asegurar nombres de columna con backticks
    const placeholders = columnas.map(() => '?').join(', ');
    const valores = columnas.map(col => datos[col]); // Valores ya están procesados

    const query = `
        INSERT INTO \`${tabla}\` (\`chiller_id\`, \`fecha_hora\`, ${columnasSql})
        VALUES (?, ?, ${placeholders})
    `;
    const finalValues = [chillerId, timestamp, ...valores];

    try {
        const [result] = await pool.query(query, finalValues);
        if (result.affectedRows === 0) {
             console.warn(`[${moment().tz(ZONA_HORARIA).format()}] WARN: Inserción en ${tabla} para ${timestamp} no afectó filas.`);
        }
    } catch (error) {
        console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR al guardar datos SEGUNDO en ${tabla} para ${timestamp}: ${error.message}`);
        console.error(`  Failed Query: ${query.trim()}`);
        console.error(`  Failed Values: ${JSON.stringify(finalValues)}`);
    }
}

// --- Lógica Principal de Ejecución del Ciclo (Revisada) ---
async function ejecutarCicloLecturaYGuardado() {
    const ahora = moment().tz(ZONA_HORARIA);
    const timestampActual = ahora.format("YYYY-MM-DD HH:mm:ss"); // Timestamp para la BD

    try {
        // --- 1. Leer Todos los Datos Definidos ---
        // Asume una sola IP para todos los registros definidos
        const resultadosLectura = await leerTodosLosRegistros(TARGET_IP, DEFINICIONES_REGISTROS);

        // --- 2. Procesar y Separar Datos por Chiller/Tabla (SOLO los que tienen dbColumn) ---
        const datosParaAire = {};
        const datosParaAgua = {};

        for (const regDef of DEFINICIONES_REGISTROS) {
            // Solo procesar para BD si tiene definida una columna
            if (!regDef.dbColumn) {
                continue; // Saltar al siguiente registro, no se inserta
            }

            const resultado = resultadosLectura[regDef.name];

            if (resultado && resultado.success) {
                let valorFinalParaBD = resultado.value;

                // Convertir booleanos (de coils) a 0 o 1 para la BD
                if (regDef.type === 'coil') {
                    valorFinalParaBD = valorFinalParaBD ? 1 : 0;
                }

                // Validar que no sea null/undefined (aunque success=true debería prevenirlo)
                if (valorFinalParaBD !== null && valorFinalParaBD !== undefined) {
                    if (regDef.chillerType === 'aire') {
                        datosParaAire[regDef.dbColumn] = valorFinalParaBD;
                    } else if (regDef.chillerType === 'agua') {
                        datosParaAgua[regDef.dbColumn] = valorFinalParaBD;
                    }
                } else {
                     console.warn(`[${ahora.format()}] WARN: Valor procesado es null/undefined para ${regDef.name} (${regDef.dbColumn}), aunque lectura fue exitosa.`);
                }

            } else {
                // Hubo error en la lectura, no incluir en la inserción (se loggea en leerTodosLosRegistros)
                 console.log(`[${ahora.format()}] INFO: Lectura fallida para ${regDef.name} (${regDef.dbColumn}). No se incluirá en BD.`);
            }
        }

        // --- 3. Insertar Datos en las Tablas Correspondientes ---
        await registrarDatosSegundo(TABLA_AIRE_SEGUNDOS, CHILLER_ID_AIRE, timestampActual, datosParaAire);
        await registrarDatosSegundo(TABLA_AGUA_SEGUNDOS, CHILLER_ID_AGUA, timestampActual, datosParaAgua);

    } catch (error) {
        console.error(`[${ahora.format()}] ERROR CRÍTICO en ciclo principal: ${error.message}`, error.stack);
    }
}

// --- Inicialización y arranque (Sin cambios significativos, usa nuevo nombre de ciclo) ---
async function iniciarAplicacion() {
    try {
        const connection = await pool.getConnection();
        connection.release();
    } catch (error) {
        console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR CRÍTICO al conectar a la base de datos al inicio: ${error.message}`);
        process.exit(1); // Salir si no se puede conectar a la BD
    }

    // Ejecutar el primer ciclo inmediatamente
    await ejecutarCicloLecturaYGuardado(); // Llama a la función renombrada/principal

    // Configurar ejecución periódica
    console.log(`[${moment().tz(ZONA_HORARIA).format()}] INFO: Configurando ejecución cada ${INTERVALO_LECTURA_MS / 1000} segundo(s)...`);
    const intervalId = setInterval(ejecutarCicloLecturaYGuardado, INTERVALO_LECTURA_MS); // Llama a la función renombrada/principal

    console.log(`[${moment().tz(ZONA_HORARIA).format()}] INFO: Aplicación iniciada y ejecutándose. Presiona Ctrl+C para detener.`);

    // Opcional: Manejo elegante de cierre (Ctrl+C)
    process.on('SIGINT', () => {
        console.log(`\n[${moment().tz(ZONA_HORARIA).format()}] INFO: Deteniendo aplicación...`);
        clearInterval(intervalId);
        process.exit(0);
    });
}

// --- Manejo de errores no capturados (Sin cambios) ---
process.on('uncaughtException', (error) => {
    console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR NO CAPTURADO (Uncaught Exception): ${error.message}`, error.stack);
    // Considera reiniciar el proceso o loggear y salir de forma controlada en producción
    // process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR NO CAPTURADO (Unhandled Rejection):`, reason);
    // process.exit(1);
});

// Iniciar la aplicación
iniciarAplicacion().catch(error => {
    console.error(`[${moment().tz(ZONA_HORARIA).format()}] ERROR FATAL durante la inicialización: ${error.message}`, error.stack);
    process.exit(1);
});