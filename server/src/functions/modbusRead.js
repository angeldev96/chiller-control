import ModbusRTU from "modbus-serial";

// Function to read holding registers
async function readHoldingRegisters(
  ip,
  port,
  slaveId,
  address,
  numRegisters = 1
) {
  const client = new ModbusRTU();
  try {
    await client.connectTCP(ip, { port });
    client.setID(slaveId);

    const data = await client.readHoldingRegisters(address, numRegisters);
    return data.data;
  } catch (err) {
    console.error(`Error reading holding registers from ${ip}:`, err);
    return null;
  } finally {
    await client.close();
  }
}

async function readSignedHoldingRegister(ip, port, slaveId, address) {
  const client = new ModbusRTU();
  try {
    await client.connectTCP(ip, { port });
    client.setID(slaveId);

    const { data } = await client.readHoldingRegisters(address, 1);
    if (!data || data.length < 1) {
      throw new Error("No data received or data format incorrect");
    }

    const signedValue = data[0] >= 32768 ? data[0] - 65536 : data[0];
    console.log(`Raw data: ${data[0]}, Signed value: ${signedValue}`);
    return signedValue;
  } catch (err) {
    console.error(`Error reading holding registers from ${ip}:`, err);
    return null;
  } finally {
    client.close();
  }
}
/*
async function readSignedHoldingRegisterWithTimeout(
  ip,
  port,
  slaveId,
  address,
  timeout = 3000,
  retries = 3
) {
  const client = new ModbusRTU();
  let attempts = 0;

  while (attempts < retries) {
    try {
      await client.connectTCP(ip, { port });
      client.setID(slaveId);

      // Configuramos un timeout para evitar bloqueos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const { data } = await client.readHoldingRegisters(address, 1, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!data || data.length < 1) {
        throw new Error("No data received or data format incorrect");
      }

      const signedValue = data[0] >= 32768 ? data[0] - 65536 : data[0];
      console.log(`Raw data: ${data[0]}, Signed value: ${signedValue}`);
      return signedValue;
    } catch (err) {
      console.error(
        `Attempt ${attempts + 1}: Error reading holding registers from ${ip}:`,
        err.message
      );
    } finally {
      client.close();
    }

    attempts++;
    console.log(
      `Reintentando la lectura de kvar21 (Intento ${
        attempts + 1
      }/${retries})...`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Espera antes del siguiente intento
  }

  console.error(
    `Failed to read signed holding register after ${retries} attempts.`
  );
  return null;
}*/

async function readSignedHoldingRegisterWithTimeout(
  ip,
  port,
  slaveId,
  address,
  timeout = 3000,
  retries = 3
) {
  const client = new ModbusRTU();
  let attempts = 0;

  while (attempts < retries) {
    try {
      console.log(`Intentando leer registro en ${ip}:${port}, slaveId: ${slaveId}, dirección: ${address}`);
      
      // Conectar al dispositivo Modbus
      await client.connectTCP(ip, { port });
      client.setID(slaveId);

      // Configurar un timeout para la operación
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Leer el registro Modbus
      const { data } = await client.readHoldingRegisters(address, 1, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!data || data.length < 1) {
        throw new Error("No se recibieron datos o el formato es incorrecto");
      }

      const rawValue = data[0]; // Valor bruto leído
      const signedValue = rawValue >= 32768 ? rawValue - 65536 : rawValue;

      console.log(`Lectura cruda: ${rawValue}, Valor con signo: ${signedValue}`);
      return signedValue; // Devuelve el valor convertido
    } catch (err) {
      console.error(
        `Intento ${attempts + 1}: Error al leer registro con signo desde ${ip}:`,
        err.message
      );
    } finally {
      try {
        client.close();
      } catch (closeErr) {
        console.error("Error al cerrar la conexión Modbus:", closeErr.message);
      }
    }

    attempts++;
    console.log(
      `Reintentando la lectura de registro con signo (Intento ${attempts}/${retries})...`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Espera antes del siguiente intento
  }

  console.error(
    `No se pudo leer el registro con signo después de ${retries} intentos.`
  );
  return null; // Devuelve null si no se pudo leer el registro
}


// Function to read coils
async function readCoils(ip, port, slaveId, address, numCoils = 1) {
  const client = new ModbusRTU();
  try {
    await client.connectTCP(ip, { port });
    client.setID(slaveId);

    const data = await client.readCoils(address, numCoils);
    return data.data;
  } catch (err) {
    console.error(`Error reading coils from ${ip}:`, err);
    return null;
  } finally {
    await client.close();
  }
}

// Función para leer un valor de 32 bits a partir de dos registros de 16 bits
async function read32BitHoldingRegister(
  ip,
  port,
  slaveId,
  lowRegister,
  highRegister
) {
  const [lowData, highData] = await Promise.all([
    readHoldingRegisters(ip, port, slaveId, lowRegister, 1),
    readHoldingRegisters(ip, port, slaveId, highRegister, 1),
  ]);

  if (!lowData || !highData) return null;

  const lowValue = lowData[0];
  const highValue = highData[0];

  let combinedValue = highValue * 65536 + lowValue;
  if (combinedValue & 0x80000000) {
    combinedValue -= 0x100000000;
  }

  return combinedValue / 10;
}

export {
  readHoldingRegisters,
  readSignedHoldingRegister,
  readSignedHoldingRegisterWithTimeout,
  readCoils,
  read32BitHoldingRegister,
};
