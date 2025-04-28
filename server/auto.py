#!/usr/bin/env python3

from pymodbus.client import ModbusTcpClient
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Essential Configuration ---
TARGET_IP = "192.168.7.10"  # PLC IP address
TARGET_PORT = 502           # Modbus TCP port
SLAVE_ID = 1                # Slave ID

# --- CORRECTED ADDRESSES (Based on testing feedback) ---
# Assuming Proworx 00051 (AUTO) -> Modbus base 0 address 50
# Assuming Proworx 00050 (MANUAL) -> Modbus base 0 address 49
DEFLECTOR_AUTO_ADDRESS = 39  # Address for AUTO mode coil
DEFLECTOR_MANUAL_ADDRESS = 41   # Address for MANUAL mode coil (PLC 00050?)
# --- End Corrected Addresses ---

TIMEOUT = 5                 # Timeout in seconds

def get_modbus_client():
    """Create and return a connected Modbus client"""
    client = ModbusTcpClient(
        host=TARGET_IP,
        port=TARGET_PORT,
        timeout=TIMEOUT
    )
    try:
        if not client.connect():
            logging.error(f"Failed to connect to Modbus device at {TARGET_IP}:{TARGET_PORT}")
            return None
        logging.info(f"Successfully connected to Modbus device at {TARGET_IP}:{TARGET_PORT}")
        return client
    except Exception as e:
        logging.error(f"Exception during connection to {TARGET_IP}:{TARGET_PORT}: {str(e)}")
        return None

def read_deflector_status(client):
    """
    Read the current status of the deflector coils using the CORRECTED addresses.
    Returns a dictionary {'auto': bool, 'manual': bool} or None on error.
    """
    if not client or not client.is_socket_open():
        logging.error("Read status failed: Client is not connected.")
        return None

    try:
        auto_status = None
        manual_status = None

        # Read AUTO status from CORRECTED address (50)
        auto_result = client.read_coils(DEFLECTOR_AUTO_ADDRESS, 1, slave=SLAVE_ID)
        if not auto_result.isError():
            auto_status = auto_result.bits[0]
            logging.info(f"Read AUTO coil ({DEFLECTOR_AUTO_ADDRESS}): {auto_status}")
        else:
            logging.error(f"Failed to read AUTO coil status ({DEFLECTOR_AUTO_ADDRESS}): {auto_result}")
            return None # Critical failure

        # Read MANUAL status from CORRECTED address (49)
        manual_result = client.read_coils(DEFLECTOR_MANUAL_ADDRESS, 1, slave=SLAVE_ID)
        if not manual_result.isError():
            manual_status = manual_result.bits[0]
            logging.info(f"Read MANUAL coil ({DEFLECTOR_MANUAL_ADDRESS}): {manual_status}")
        else:
            logging.error(f"Failed to read MANUAL coil status ({DEFLECTOR_MANUAL_ADDRESS}): {manual_result}")
            return None # Critical failure

        # Return the status correctly mapped
        return {'auto': auto_status, 'manual': manual_status}

    except Exception as e:
        logging.error(f"Exception during status read: {str(e)}")
        return None

def set_deflector_auto_mode():
    """
    Sets the deflector to AUTO mode using the CORRECTED addresses.
    This involves:
    1. Connecting to the PLC.
    2. Reading the current status (optional, for logging).
    3. Writing AUTO coil (50) to TRUE.
    4. Writing MANUAL coil (49) to FALSE.
    5. Returns True on success, False on failure.
    """
    client = None
    try:
        client = get_modbus_client()
        if not client:
            return False # Connection failed

        # 1. Read current status (Optional, but good for context)
        current_status = read_deflector_status(client)
        if current_status:
            logging.info(f"Current state before setting AUTO: AUTO={current_status['auto']}, MANUAL={current_status['manual']}")
            # Check if already in the desired state
            if current_status['auto'] and not current_status['manual']:
                logging.info(f"Deflector is already in AUTO mode (AUTO={DEFLECTOR_AUTO_ADDRESS} is True, MANUAL={DEFLECTOR_MANUAL_ADDRESS} is False). No change needed.")
                # return True # Optionally exit early
        else:
            logging.warning("Could not read current status before setting AUTO mode.")
            # Proceeding cautiously...

        # 2. Write AUTO coil to TRUE (using CORRECTED address 50)
        logging.info(f"Attempting to write AUTO coil ({DEFLECTOR_AUTO_ADDRESS}) = True")
        result_auto = client.write_coil(DEFLECTOR_AUTO_ADDRESS, True, slave=SLAVE_ID)
        if result_auto.isError():
            logging.error(f"Failed to set AUTO coil ({DEFLECTOR_AUTO_ADDRESS}) to TRUE: {result_auto}")
            return False # Exit if we couldn't set AUTO

        logging.info(f"Successfully set AUTO coil ({DEFLECTOR_AUTO_ADDRESS}) to TRUE")

        # --- Optional small delay ---
        # time.sleep(0.1) # Uncomment if you suspect timing issues in the PLC

        # 3. Write MANUAL coil to FALSE (using CORRECTED address 49)
        logging.info(f"Attempting to write MANUAL coil ({DEFLECTOR_MANUAL_ADDRESS}) = False")
        result_manual = client.write_coil(DEFLECTOR_MANUAL_ADDRESS, False, slave=SLAVE_ID)
        if result_manual.isError():
            logging.error(f"Failed to set MANUAL coil ({DEFLECTOR_MANUAL_ADDRESS}) to FALSE: {result_manual}")
            # If this fails, AUTO might be True but MANUAL didn't go False.
            return False

        logging.info(f"Successfully set MANUAL coil ({DEFLECTOR_MANUAL_ADDRESS}) to FALSE")

        logging.info(f"Deflector successfully commanded to AUTO mode (Wrote True to {DEFLECTOR_AUTO_ADDRESS}, False to {DEFLECTOR_MANUAL_ADDRESS})")
        return True

    except Exception as e:
        logging.error(f"Detailed error setting AUTO mode: {str(e)}")
        return False
    finally:
        if client and client.is_socket_open():
            client.close()
            logging.info("Modbus client closed (set_deflector_auto_mode)")

def read_final_status_standalone():
    """Reads status using its own connection - useful for verification"""
    client = None
    try:
        client = get_modbus_client()
        if not client:
            return None
        # Uses the read_deflector_status function which now uses the CORRECTED addresses
        return read_deflector_status(client)
    except Exception as e:
         logging.error(f"Error in standalone status read: {str(e)}")
         return None
    finally:
        if client and client.is_socket_open():
            client.close()
            logging.info("Modbus client closed (read_final_status_standalone)")

# --- Main Execution ---
if __name__ == "__main__":
    print("-" * 30)
    # Updated print statement to show the addresses being used
    print(f"Attempting to set Deflector to AUTO Mode")
    print(f"(Targeting AUTO={DEFLECTOR_AUTO_ADDRESS}, MANUAL={DEFLECTOR_MANUAL_ADDRESS})")
    print("-" * 30)

    # Optional: Show status before attempting the change
    print("\n[INFO] Reading current deflector status before operation...")
    initial_status = read_final_status_standalone()
    if initial_status:
        print(f"[INFO] Current status: AUTO={initial_status['auto']}, MANUAL={initial_status['manual']}")
    else:
        print("[WARNING] Failed to read current status before operation.")

    # Set to AUTO mode
    print("\n[ACTION] Setting deflectors to AUTO mode...")
    success = set_deflector_auto_mode()

    if success:
        print("[SUCCESS] Operation to set AUTO mode completed successfully (Commands sent).")
    else:
        print("[FAILURE] Operation to set AUTO mode failed.")

    # Allow some time for PLC to process if needed, then verify
    print("\n[INFO] Waiting 2 seconds before final status check...")
    time.sleep(2)

    # Check final status
    print("\n[VERIFICATION] Reading final deflector status...")
    final_status = read_final_status_standalone()
    if final_status:
        print(f"[VERIFICATION] Final status: AUTO={final_status['auto']}, MANUAL={final_status['manual']}")
        # Verify if the state is as expected (AUTO=True, MANUAL=False)
        if success and final_status['auto'] and not final_status['manual']:
            print("[VERIFICATION] Status confirmed: AUTO=True, MANUAL=False.")
        elif success:
            print("[VERIFICATION][WARNING] Operation reported success sending commands, but final state is unexpected!")
            print(f"[VERIFICATION][WARNING] Expected AUTO=True/MANUAL=False, got AUTO={final_status['auto']}/MANUAL={final_status['manual']}")
            print("[VERIFICATION][WARNING] This might indicate PLC logic overriding the commands.")
        else:
             print("[VERIFICATION] Final state reflects reported failure or initial state.")

    else:
        print("[VERIFICATION][ERROR] Failed to read final status.")

    print("\nScript finished.")