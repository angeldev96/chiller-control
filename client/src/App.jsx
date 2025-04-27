import { useState, useEffect } from 'react';
import { Power, ThermometerSnowflake } from 'lucide-react';
import './App.css';

const API_BASE_URL = 'http://localhost:3001/api';

export default function ChillerControl() {
  const [isOn, setIsOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 p-4">
            <h1 className="text-white text-center text-2xl font-bold">Control de Chiller</h1>
          </div>
          
          {/* Status Banner - Modified with lighter colors and more separation */}
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
          
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-100 text-red-700 text-center">
              {error}
            </div>
          )}
          
          {/* Control Buttons - Now with more space from the banner */}
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
          
          {/* Footer with additional status info */}
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