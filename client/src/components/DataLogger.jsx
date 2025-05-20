import React, { useState } from 'react';

const opciones = [
  { value: 'aire-min', label: 'Chiller Aire Minutos' },
  { value: 'aire-seg', label: 'Chiller Aire Segundos' },
  { value: 'agua-min', label: 'Chiller Agua Minutos' },
  { value: 'agua-seg', label: 'Chiller Agua Segundos' },
];

export default function DataLogger() {
  const [selectedOption, setSelectedOption] = useState(opciones[0].value);

  return (
    <div className="w-screen min-h-screen bg-gray-100">
      <div className="bg-white shadow-lg p-10">
        {/* Dropdown de selección */}
        <div className="mb-10">
          <label className="block text-lg font-medium text-gray-700 mb-2" htmlFor="chiller-select">
            Seleccionar Base de datos:
          </label>
          <select
            id="chiller-select"
            className="px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
            value={selectedOption}
            onChange={e => setSelectedOption(e.target.value)}
          >
            {opciones.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Contenido principal */}
        <div className="w-full">
          <p className="text-gray-600 text-xl">
            Mostrando datos para: <span className="font-bold text-blue-700">
              {opciones.find(opt => opt.value === selectedOption)?.label}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
} 