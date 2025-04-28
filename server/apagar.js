

const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();

// --- Essential Configuration ---
const TARGET_IP = "192.168.7.10"; // PLC IP address
const TARGET_PORT = 502;          // Modbus TCP port
const SLAVE_ID = 1;               // Slave ID
const TIMEOUT = 5000;             // Timeout in milliseconds (5 seconds)
const PULSE_WIDTH_MS = 1000;       // Duration of the "press" in milliseconds (e.g., 200ms) - ADJUST AS NEEDED

// --- Button Addresses (Base 0) ---
// Proworx 000040 (Encender) -> Modbus base 0 address 39
const START_BUTTON_ADDRESS = 39;
// Proworx 000042 (Cancelar Alarma) -> Modbus base 0 address 41
const CANCEL_ALARM_BUTTON_ADDRESS = 41;
// --- End Button Addresses ---

// Helper function for delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// --- Main Execution ---
async function main() {
    // *** Select the button to press: CANCEL ALARM ***
    const targetButtonAddress = CANCEL_ALARM_BUTTON_ADDRESS;
    const buttonName = "CANCEL ALARM";
    // *** (No need to change this part for this specific script) ***

    console.log("----------------------------------------");
    console.log(`Attempting to PULSE Button: ${buttonName} (Address: ${targetButtonAddress})`);
    console.log(`Pulse width: ${PULSE_WIDTH_MS} ms`);
    console.log("----------------------------------------");

    let success = false;

    try {
        // Connect to the PLC
        console.log(`INFO: Connecting to ${TARGET_IP}:${TARGET_PORT}...`);
        await client.connectTCP(TARGET_IP, { port: TARGET_PORT });
        client.setID(SLAVE_ID);
        client.setTimeout(TIMEOUT);
        console.log(`INFO: Successfully connected to Modbus device.`);

        // Pulse the selected button
        console.log(`\n[ACTION] Pulsing ${buttonName} button...`);
        success = await pulseCoil(client, targetButtonAddress, PULSE_WIDTH_MS);

        if (success) {
            console.log(`[SUCCESS] Pulse command sequence for ${buttonName} completed successfully.`);
            console.log(`[INFO] Observe the system/PLC for the expected action (alarm cancelled).`);
        } else {
            console.error(`[FAILURE] Pulse command sequence for ${button_name} failed.`);
        }

    } catch (error) {
        console.error(`ERROR: Connection or main execution error: ${error.message}`);
        success = false;
    } finally {
        // Ensure the connection is closed
        if (client.isOpen) {
            client.close(() => {
                console.log("INFO: Modbus client connection closed.");
                console.log("\nScript finished.");
            });
        } else {
            console.log("INFO: Modbus client connection was not open or already closed.");
            console.log("\nScript finished.");
        }
    }
}

// Run the main function
main();