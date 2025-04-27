import ModbusRTU from "modbus-serial";

// Function to write to holding registers
async function writeHoldingRegister(ip, port, slaveId, address, value) {
    const client = new ModbusRTU();

    try {
        await client.connectTCP(ip, { port });
        client.setID(slaveId);

        await client.writeRegister(address, value);
        return `Register ${address} written with value ${value}`;
    } catch (err) {
        console.error(`Error writing holding register to ${ip}:`, err);
        return null;
    } finally {
        await client.close();
    }
}

// Function to write to coils
async function writeCoil(ip, port, slaveId, address, value) {
    const client = new ModbusRTU();

    try {
        await client.connectTCP(ip, { port });
        client.setID(slaveId);

        await client.writeCoil(address, value);
        return `Coil ${address} written with value ${value}`;
    } catch (err) {
        console.error(`Error writing coil to ${ip}:`, err);
        return null;
    } finally {
        await client.close();
    }
}

export { writeHoldingRegister, writeCoil };