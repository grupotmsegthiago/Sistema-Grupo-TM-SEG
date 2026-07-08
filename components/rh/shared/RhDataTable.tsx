import React, { useMemo, useState } from 'react';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';

export interface RhColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface RhDataTableProps<T extends Record<string, any>> {
  data: T[];
  columns: RhColumn<T>[];
  searchKeys?: string[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

function RhDataTable<T extends Record<string, any>>({
  data,
  columns,
  searchKeys = [],
  onRowClick,
  emptyMessage = 'Nenhum registro encontrado.',
}: RhDataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    let rows = [...data];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((row) =>
        searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      rows.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, search, searchKeys, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider ${col.className || ''}`}>
                  {col.sortable !== false ? (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-gray-800" onClick={() => toggleSort(col.key)}>
                      {col.label}
                      {sortKey === col.key && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </button>
                  ) : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400">{emptyMessage}</td></tr>
            ) : filtered.map((row, idx) => (
              <tr
                key={row.id || idx}
                className={`border-t border-gray-50 ${onRowClick ? 'cursor-pointer hover:bg-red-50/40' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 text-gray-700 ${col.className || ''}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
        {filtered.length} registro(s)
      </div>
    </div>
  );
}

export default RhDataTable;
