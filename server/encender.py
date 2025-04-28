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
TIMEOUT = 5                 # Timeout in seconds
PULSE_WIDTH = 0.2           # Duration of the "press" in seconds (e.g., 200ms) - ADJUST AS NEEDED

# --- Button Addresses (Base 0) ---
# Proworx 000040 (Encender) -> Modbus base 0 address 39
START_BUTTON_ADDRESS = 39
# Proworx 000042 (Cancelar Alarma) -> Modbus base 0 address 41
CANCEL_ALARM_BUTTON_ADDRESS = 41
# --- End Button Addresses ---

# --- Keep Deflector Addresses if needed elsewhere, otherwise can be removed ---
# DEFLECTOR_AUTO_ADDRESS = 50
# DEFLECTOR_MANUAL_ADDRESS = 49
# ---

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

# --- NEW FUNCTION: Pulse a coil ---
def pulse_coil(client, address, pulse_duration=PULSE_WIDTH):
    """
    Simulates a momentary button press by writing True, waiting, then writing False.
    Returns True on success (both writes successful), False otherwise.
    """
    if not client or not client.is_socket_open():
        logging.error(f"Pulse coil failed: Client not connected.")
        return False

    logging.info(f"Pulsing coil {address}: Setting to TRUE...")
    try:
        # 1. Press the button (Write True)
        result_on = client.write_coil(address, True, slave=SLAVE_ID)
        if result_on.isError():
            logging.error(f"Failed to write TRUE to coil {address}: {result_on}")
            return False
        logging.info(f"Coil {address} set to TRUE successfully.")

        # 2. Wait for the pulse duration
        time.sleep(pulse_duration)

        # 3. Release the button (Write False)
        logging.info(f"Pulsing coil {address}: Setting back to FALSE...")
        result_off = client.write_coil(address, False, slave=SLAVE_ID)
        if result_off.isError():
            # Important: Log error, but the press might have still worked
            logging.error(f"Failed to write FALSE back to coil {address}: {result_off}")
            # Decide if this constitutes failure. Usually yes, as the state is left ON.
            return False
        logging.info(f"Coil {address} set back to FALSE successfully.")

        logging.info(f"Pulse completed for coil {address}.")
        return True

    except Exception as e:
        logging.error(f"Exception during pulse_coil for address {address}: {str(e)}")
        return False

# --- Functions like read_deflector_status and set_deflector_manual_mode are no longer directly used ---
# --- You can keep them if needed for other purposes, or remove them. ---
# --- For clarity, I will comment them out for this specific button-pressing task ---
#
# def read_deflector_status(client):
#     ... (previous code) ...
#
# def set_deflector_manual_mode():
#      ... (previous code) ...
#
# def read_final_status_standalone():
#      ... (previous code) ...

# --- Main Execution ---
if __name__ == "__main__":
    # Select the button to press
    target_button_address = START_BUTTON_ADDRESS # Change to CANCEL_ALARM_BUTTON_ADDRESS to press the other one
    button_name = "START" if target_button_address == START_BUTTON_ADDRESS else "CANCEL ALARM"

    print("-" * 30)
    print(f"Attempting to PULSE Button: {button_name} (Address: {target_button_address})")
    print(f"Pulse width: {PULSE_WIDTH} seconds")
    print("-" * 30)

    client = None # Define client outside try block for finally clause
    success = False
    try:
        # Get a client connection
        client = get_modbus_client()

        if client:
            # Pulse the selected button
            print(f"\n[ACTION] Pulsing {button_name} button...")
            success = pulse_coil(client, target_button_address, PULSE_WIDTH)

            if success:
                print(f"[SUCCESS] Pulse command sequence for {button_name} completed successfully.")
                print(f"[INFO] Observe the system/PLC for the expected action.")
            else:
                print(f"[FAILURE] Pulse command sequence for {button_name} failed.")
        else:
            print("[FAILURE] Could not establish Modbus connection.")

    except Exception as e:
        logging.error(f"An unexpected error occurred in main execution: {str(e)}")
        print(f"[ERROR] An unexpected error occurred: {str(e)}")
    finally:
        # Ensure client is closed
        if client and client.is_socket_open():
            client.close()
            logging.info("Modbus client closed (Main Execution)")

    # Note: Verification by reading status might not be useful here,
    # as the coil should be False after the pulse. Success is determined
    # by whether the PLC performed the action triggered by the pulse.

    print("\nScript finished.")