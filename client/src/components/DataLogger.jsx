import React, { useState, useEffect } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Configurar dayjs para usar UTC y timezone
dayjs.extend(utc);
dayjs.extend(timezone);

// Establecer la zona horaria por defecto
dayjs.tz.setDefault('America/Tegucigalpa');

const opciones = [
  { value: 'chiller_aire_minutos', label: 'Chiller Aire Minutos' },
  { value: 'chiller_aire_segundos', label: 'Chiller Aire Segundos' },
  { value: 'chiller_agua_minutos', label: 'Chiller Agua Minutos' },
  { value: 'chiller_agua_segundos', label: 'Chiller Agua Segundos' },
];

const ITEMS_PER_PAGE = 10;

export default function DataLogger() {
  const [selectedOption, setSelectedOption] = useState(opciones[0].value);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dateFilter, setDateFilter] = useState('');

  const isMinutesTable = selectedOption.includes('minutos');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `http://localhost:3001/api/chiller/data/${selectedOption}`;
      
      // Para tablas de minutos, no usamos paginación y traemos todos los datos del día
      if (isMinutesTable) {
        if (dateFilter) {
          url += `?date=${dateFilter}`;
        }
      } else {
        // Para tablas de segundos, mantenemos la paginación
        url += `?limit=${ITEMS_PER_PAGE}`;
        if (dateFilter) {
          url += `&date=${dateFilter}`;
        }
      }
      
      const response = await axios.get(url);
      setData(response.data.data || []);
      
      // Solo calculamos páginas totales para tablas de segundos
      if (!isMinutesTable) {
        setTotalPages(Math.ceil((response.data.total || 0) / ITEMS_PER_PAGE));
      }
    } catch (err) {
      setError('Error al cargar los datos');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedOption, currentPage, dateFilter]);

  const formatDateTime = (dateStr) => {
    try {
      return dayjs(dateStr).format('DD/MM/YYYY HH:mm:ss');
    } catch (error) {
      console.error('Error al formatear fecha:', error);
      return dateStr;
    }
  };

  const renderTableHeaders = () => {
    if (data.length === 0) return null;
    const headers = Object.keys(data[0]).filter(key => key !== 'id');
    return (
      <tr className="bg-gray-100">
        {headers.map(header => (
          <th key={header} className="px-4 py-2 text-left sticky top-0 bg-gray-100 z-10">
            {header.replace(/_/g, ' ').toUpperCase()}
          </th>
        ))}
      </tr>
    );
  };

  const renderTableRows = () => {
    return data.map((row, index) => (
      <tr key={row.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
        {Object.entries(row).map(([key, value]) => {
          if (key === 'id') return null;
          if (key === 'fecha_hora') {
            return (
              <td key={key} className="px-4 py-2">
                {formatDateTime(value)}
              </td>
            );
          }
          return (
            <td key={key} className="px-4 py-2">
              {value}
            </td>
          );
        })}
      </tr>
    ));
  };

  return (
    <div className="w-screen min-h-screen bg-gray-100 p-6">
      <div className="bg-white shadow-lg rounded-lg p-6">
        {/* Controles superiores */}
        <div className="flex flex-wrap gap-4 mb-6">
          {/* Selector de base de datos */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Base de datos:
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedOption}
              onChange={e => {
                setSelectedOption(e.target.value);
                setCurrentPage(1); // Reset page when changing database
              }}
            >
              {opciones.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Filtro de fecha */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filtrar por fecha:
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={dateFilter}
              onChange={e => {
                setDateFilter(e.target.value);
                setCurrentPage(1); // Reset page when changing date
              }}
            />
          </div>

          {/* Botón de actualizar */}
          <div className="flex items-end">
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {/* Mensaje de error */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {/* Tabla de datos con scroll */}
        <div className="overflow-x-auto">
          <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                {renderTableHeaders()}
              </thead>
              <tbody className="divide-y divide-gray-200">
                {renderTableRows()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginación (solo para tablas de segundos) */}
        {!isMinutesTable && (
          <div className="mt-4 flex justify-between items-center">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || loading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-gray-600">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || loading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 