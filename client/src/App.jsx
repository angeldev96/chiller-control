import { useState, useEffect } from 'react';
import { Power, ThermometerSnowflake, Edit2, Check } from 'lucide-react';
import './App.css';

// Local development configuration
const DOMAIN = 'localhost';
const PORT = '3001';
const API_BASE_URL = `http://${DOMAIN}:${PORT}/api`;

// Constants for validation
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 50;

export default function ChillerControl() {
  const [isOn, setIsOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [onSetpoint, setOnSetpoint] = useState(0);
  const [offSetpoint, setOffSetpoint] = useState(0);
  const [editingOnSetpoint, setEditingOnSetpoint] = useState(false);
  const [editingOffSetpoint, setEditingOffSetpoint] = useState(false);
  const [tempOnSetpoint, setTempOnSetpoint] = useState('');
  const [tempOffSetpoint, setTempOffSetpoint] = useState('');
  const [setpointError, setSetpointError] = useState('');

  // Función para obtener el estado actual del chiller
  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/chiller/status`);
      const data = await response.json();
      if (data.success) {
        setIsOn(data.isOn);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Error al obtener el estado del chiller');
    }
  };

  // Cargar estado inicial
  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTurnOn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/chiller/on`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        setIsOn(true);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Error al encender el chiller');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTurnOff = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/chiller/off`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        setIsOn(false);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Error al apagar el chiller');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOnSetpointChange = (e) => {
    setTempOnSetpoint(e.target.value);
  };

  const handleOffSetpointChange = (e) => {
    setTempOffSetpoint(e.target.value);
  };

  const handleOnSetpointSubmit = () => {
    const value = parseFloat(tempOnSetpoint);
    if (!isNaN(value)) {
      setOnSetpoint(value);
      setEditingOnSetpoint(false);
      setTempOnSetpoint('');
    }
  };

  const handleOffSetpointSubmit = () => {
    const value = parseFloat(tempOffSetpoint);
    if (!isNaN(value)) {
      setOffSetpoint(value);
      setEditingOffSetpoint(false);
      setTempOffSetpoint('');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 p-4">
            <h1 className="text-white text-center text-2xl font-bold">Control de Chiller</h1>
          </div>
          
          {/* Status Banner */}
          <div className={`p-6 text-center ${isOn ? 'bg-green-100' : 'bg-red-100'} border-b-4 ${isOn ? 'border-green-400' : 'border-red-400'} mb-4`}>
            <div className="flex items-center justify-center">
              <ThermometerSnowflake className={`mr-3 ${isOn ? 'text-green-600' : 'text-red-600'}`} size={32} />
              <div>
                <span className={`text-xl font-bold ${isOn ? 'text-green-700' : 'text-red-700'}`}>
                  {isOn ? 'CHILLER ENCENDIDO' : 'CHILLER APAGADO'}
                </span>
                <p className={`text-sm ${isOn ? 'text-green-600' : 'text-red-600'}`}>
                  {isOn ? 'Sistema en funcionamiento' : 'Sistema detenido'}
                </p>
              </div>
            </div>
          </div>

          {/* Setpoints Section */}
          <div className="p-6 border-b border-gray-200">
            <div className="space-y-4">
              {/* On Setpoint */}
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Consigna de Encendido:</span>
                <div className="flex items-center space-x-2">
                  {editingOnSetpoint ? (
                    <>
                      <input
                        type="number"
                        value={tempOnSetpoint}
                        onChange={handleOnSetpointChange}
                        className="w-20 px-2 py-1 border rounded"
                        placeholder={onSetpoint}
                      />
                      <button
                        onClick={handleOnSetpointSubmit}
                        className="p-1 text-green-600 hover:text-green-700"
                      >
                        <Check size={20} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-lg font-medium">{onSetpoint}°C</span>
                      <button
                        onClick={() => setEditingOnSetpoint(true)}
                        className="p-1 text-blue-600 hover:text-blue-700"
                      >
                        <Edit2 size={20} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Off Setpoint */}
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Consigna de Apagado:</span>
                <div className="flex items-center space-x-2">
                  {editingOffSetpoint ? (
                    <>
                      <input
                        type="number"
                        value={tempOffSetpoint}
                        onChange={handleOffSetpointChange}
                        className="w-20 px-2 py-1 border rounded"
                        placeholder={offSetpoint}
                      />
                      <button
                        onClick={handleOffSetpointSubmit}
                        className="p-1 text-green-600 hover:text-green-700"
                      >
                        <Check size={20} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-lg font-medium">{offSetpoint}°C</span>
                      <button
                        onClick={() => setEditingOffSetpoint(true)}
                        className="p-1 text-blue-600 hover:text-blue-700"
                      >
                        <Edit2 size={20} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-100 text-red-700 text-center">
              {error}
            </div>
          )}
          
          {/* Control Buttons */}
          <div className="p-6 pt-2">
            <p className="text-gray-600 text-center mb-4 text-sm">Seleccione una acción:</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleTurnOn}
                disabled={isOn || isLoading}
                className={`flex-1 py-3 px-6 rounded-lg font-medium text-white ${
                  (isOn || isLoading) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
                } transition-all flex items-center justify-center shadow`}
              >
                <Power className="mr-2" size={20} />
                {isLoading ? 'Procesando...' : 'Encender'}
              </button>
              
              <button
                onClick={handleTurnOff}
                disabled={!isOn || isLoading}
                className={`flex-1 py-3 px-6 rounded-lg font-medium text-white ${
                  (!isOn || isLoading) ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'
                } transition-all flex items-center justify-center shadow`}
              >
                <Power className="mr-2" size={20} />
                {isLoading ? 'Procesando...' : 'Apagar'}
              </button>
            </div>
          </div>
          
          {/* Footer */}
          <div className="bg-gray-100 p-4 border-t border-gray-200">
            <p className="text-center text-gray-600">
              Estado actual: <span className={`font-medium ${isOn ? 'text-green-600' : 'text-red-600'}`}>
                {isOn ? 'En funcionamiento' : 'Detenido'}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}