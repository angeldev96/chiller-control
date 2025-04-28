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
DEFLECTOR_AUTO_ADDRESS = 50  # Address for auto mode
DEFLECTOR_MANUAL_ADDRESS = 51  # Address for manual mode
TIMEOUT = 5                 # Timeout in seconds
RESET_DELAY = 1             # Delay before resetting coils (seconds)

def get_modbus_client():
    """Create and return a connected Modbus client"""
    client = ModbusTcpClient(
        host=TARGET_IP,
        port=TARGET_PORT,
        timeout=TIMEOUT
    )
    
    if not client.connect():
        raise ConnectionError(f"Failed to connect to Modbus device at {TARGET_IP}:{TARGET_PORT}")
    
    return client

def set_deflector_auto_mode():
    """Set the deflector to AUTO mode"""
    client = None
    try:
        client = get_modbus_client()
        logging.info("Attempting to write Coil 50=true")
        
        # Activate the AUTO coil
        result = client.write_coil(DEFLECTOR_AUTO_ADDRESS, True, slave=SLAVE_ID)
        if not result.isError():
            logging.info("Successfully set AUTO coil to TRUE")
        else:
            logging.error(f"Failed to set AUTO coil: {result}")
            return False
        
        # IMPORTANT: Wait a short time to allow the PLC to process the command
        time.sleep(RESET_DELAY)
        
        # Now reset the coil to avoid "stuck" processes
        reset_result = client.write_coil(DEFLECTOR_AUTO_ADDRESS, False, slave=SLAVE_ID)
        if not reset_result.isError():
            logging.info("Successfully reset AUTO coil to FALSE")
        else:
            logging.error(f"Failed to reset AUTO coil: {reset_result}")
            # Even if reset fails, we consider the operation successful if the initial command worked
        
        logging.info("Coil writing completed (AUTO mode)")
        return True
        
    except Exception as e:
        logging.error(f"Detailed error setting AUTO mode: {str(e)}")
        return False
    finally:
        if client and client.is_socket_open():
            client.close()
            logging.info("Modbus client closed (AUTO)")

def set_deflector_manual_mode():
    """Set the deflector to MANUAL mode"""
    client = None
    try:
        client = get_modbus_client()
        logging.info("Attempting to write Coil 51=true")
        
        # Activate the MANUAL coil
        result = client.write_coil(DEFLECTOR_MANUAL_ADDRESS, True, slave=SLAVE_ID)
        if not result.isError():
            logging.info("Successfully set MANUAL coil to TRUE")
        else:
            logging.error(f"Failed to set MANUAL coil: {result}")
            return False
        
        # IMPORTANT: Wait a short time to allow the PLC to process the command
        time.sleep(RESET_DELAY)
        
        # Now reset the coil to avoid "stuck" processes
        reset_result = client.write_coil(DEFLECTOR_MANUAL_ADDRESS, False, slave=SLAVE_ID)
        if not reset_result.isError():
            logging.info("Successfully reset MANUAL coil to FALSE")
        else:
            logging.error(f"Failed to reset MANUAL coil: {reset_result}")
            # Even if reset fails, we consider the operation successful if the initial command worked
            
        logging.info("Coil writing completed (MANUAL mode)")
        return True
        
    except Exception as e:
        logging.error(f"Detailed error setting MANUAL mode: {str(e)}")
        return False
    finally:
        if client and client.is_socket_open():
            client.close()
            logging.info("Modbus client closed (MANUAL)")

def read_deflector_status():
    """Read the current status of the deflectors"""
    client = None
    try:
        client = get_modbus_client()
        
        # Read AUTO coil status
        auto_result = client.read_coils(DEFLECTOR_AUTO_ADDRESS, 1, slave=SLAVE_ID)
        if auto_result.isError():
            logging.error(f"Failed to read AUTO coil status: {auto_result}")
            return None
            
        # Read MANUAL coil status    
        manual_result = client.read_coils(DEFLECTOR_MANUAL_ADDRESS, 1, slave=SLAVE_ID)
        if manual_result.isError():
            logging.error(f"Failed to read MANUAL coil status: {manual_result}")
            return None
            
        return {
            'auto': auto_result.bits[0],
            'manual': manual_result.bits[0]
        }
        
    except Exception as e:
        logging.error(f"Error reading deflector status: {str(e)}")
        return None
    finally:
        if client and client.is_socket_open():
            client.close()
            logging.info("Modbus client closed (status read)")

# Example usage
if __name__ == "__main__":
    # Show current status
    print("Reading current deflector status...")
    status = read_deflector_status()
    if status:
        print(f"Current status: AUTO={status['auto']}, MANUAL={status['manual']}")
    else:
        print("Failed to read current status")
    
    # Set to AUTO mode
    print("\nSetting deflectors to AUTO mode...")
    result = set_deflector_auto_mode()
    print(f"AUTO mode setting {'succeeded' if result else 'failed'}")
    
    time.sleep(2)  # Wait 2 seconds between operations
    
    # Set to MANUAL mode
    print("\nSetting deflectors to MANUAL mode...")
    result = set_deflector_manual_mode()
    print(f"MANUAL mode setting {'succeeded' if result else 'failed'}")
    
    # Check final status
    print("\nReading final deflector status...")
    status = read_deflector_status()
    if status:
        print(f"Final status: AUTO={status['auto']}, MANUAL={status['manual']}")
    else:
        print("Failed to read final status")