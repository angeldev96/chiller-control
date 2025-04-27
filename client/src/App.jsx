import { useState } from 'react';
import { Power, ThermometerSnowflake } from 'lucide-react';
import './App.css';


export default function ChillerControl() {
  const [isOn, setIsOn] = useState(false);

  const handleTurnOn = () => {
    setIsOn(true);
  };

  const handleTurnOff = () => {
    setIsOn(false);
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
          
          {/* Control Buttons - Now with more space from the banner */}
          <div className="p-6 pt-2">
            <p className="text-gray-600 text-center mb-4 text-sm">Seleccione una acción:</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleTurnOn}
                disabled={isOn}
                className={`flex-1 py-3 px-6 rounded-lg font-medium text-white ${
                  isOn ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
                } transition-all flex items-center justify-center shadow`}
              >
                <Power className="mr-2" size={20} />
                Encender
              </button>
              
              <button
                onClick={handleTurnOff}
                disabled={!isOn}
                className={`flex-1 py-3 px-6 rounded-lg font-medium text-white ${
                  !isOn ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'
                } transition-all flex items-center justify-center shadow`}
              >
                <Power className="mr-2" size={20} />
                Apagar
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