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
  const [exporting, setExporting] = useState(false);

  const isMinutesTable = selectedOption.includes('minutos');

  const fetchData = async () => {
    if (!dateFilter) {
      setData([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let url = `http://localhost:3001/api/chiller/data/${selectedOption}?date=${dateFilter}`;
      
      const response = await axios.get(url);
      setData(response.data.data || []);
    } catch (err) {
      setError('Error al cargar los datos');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!dateFilter || !isMinutesTable) return;

    setExporting(true);
    try {
      const response = await axios.get(
        `http://localhost:3001/api/chiller/export/${selectedOption}?date=${dateFilter}`,
        { responseType: 'blob' }
      );

      // Crear URL del blob y link para descarga
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `chiller_data_${selectedOption}_${dateFilter}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Error al exportar los datos');
      console.error('Error:', err);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedOption, dateFilter]);

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
    const headers = Object.keys(data[0])
      .filter(key => key !== 'id' && key !== 'chiller_id');
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
          if (key === 'id' || key === 'chiller_id') return null;
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
    <div className="w-screen h-screen bg-gray-100 flex flex-col">
      <div className="bg-white shadow-lg rounded-lg m-2 flex-1 flex flex-col overflow-hidden">
        {/* Controles superiores */}
        <div className="flex flex-wrap gap-4 p-4 bg-white border-b">
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
              Seleccionar fecha:
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={dateFilter}
              onChange={e => {
                setDateFilter(e.target.value);
              }}
            />
          </div>

          {/* Botones de acciones */}
          <div className="flex items-end gap-2">
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || !dateFilter}
            >
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>

            {isMinutesTable && (
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-400"
                disabled={exporting || !dateFilter || data.length === 0}
              >
                {exporting ? 'Exportando...' : 'Exportar Excel'}
              </button>
            )}
          </div>
        </div>

        {/* Mensaje cuando no hay fecha seleccionada */}
        {!dateFilter && (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Por favor, seleccione una fecha para ver los registros
          </div>
        )}

        {/* Mensaje de error */}
        {error && (
          <div className="m-2 p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {/* Tabla de datos con scroll */}
        {dateFilter && (
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="sticky top-0">
                  {renderTableHeaders()}
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {renderTableRows()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 