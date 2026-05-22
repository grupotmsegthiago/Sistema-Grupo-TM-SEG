import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Pencil, RefreshCw, Search, Loader2, X, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { ClientPriceTable } from '../types';
import {
  DHL_AUTO_CLIENT_NAMES,
  isDhlSupplyClient,
  validateDhlTableName,
} from '../lib/dhlAutoTableSelector';
import ClientPriceForm from './ClientPriceForm';

interface Props {
  onBack?: () => void;
}

interface RowItem {
  table: ClientPriceTable;
  reason: string;
}

const DhlNonCompliantTables: React.FC<Props> = ({ onBack }) => {
  const [tables, setTables] = useState<ClientPriceTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [canViewValues, setCanViewValues] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('userData');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        const role = (u.role || '').toLowerCase();
        const nameUpper = (u.name || '').toUpperCase();
        if (['diretoria', 'administrador'].includes(role) ||
            u.permissions?.includes('*') ||
            ['MICKAEL', 'BARBARA', 'MICHELLE'].some(n => nameUpper.includes(n))) {
          setCanViewValues(true);
        }
      } catch {}
    }
    fetchTables();
  }, []);

  useRealtimeRefresh('client_price_tables', () => fetchTables());

  const fetchTables = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('client_price_tables')
        .select('*')
        .in('client', DHL_AUTO_CLIENT_NAMES as unknown as string[])
        .order('client')
        .order('operation_type');
      if (error) throw error;
      setTables((data || []) as ClientPriceTable[]);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar tabelas DHL.');
    } finally {
      setIsLoading(false);
    }
  };

  const nonCompliant = useMemo<RowItem[]>(() => {
    const rows: RowItem[] = [];
    for (const t of tables) {
      if (!isDhlSupplyClient(t.client)) continue;
      const v = validateDhlTableName(t.operation_type);
      if (!v.valid) rows.push({ table: t, reason: v.reason });
    }
    return rows;
  }, [tables]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return nonCompliant;
    return nonCompliant.filter(r =>
      (r.table.operation_type || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q)
    );
  }, [nonCompliant, searchTerm]);

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-6 animate-fade-in p-4 md:p-6" data-testid="page-dhl-non-compliant">
      {editingId && (
        <div className="fixed inset-0 z-[60] flex items-start md:items-center justify-center bg-black/70 backdrop-blur-sm p-2 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl border border-gray-200 my-4">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10">
              <h3 className="text-sm md:text-base font-bold text-gray-900 flex items-center gap-2">
                <Pencil size={16} className="text-blue-600" /> Editar Tabela DHL
              </h3>
              <button
                onClick={() => setEditingId(null)}
                className="p-2 hover:bg-gray-200 rounded-full"
                data-testid="button-close-edit-dhl"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-2 md:p-4">
              <ClientPriceForm
                id={editingId}
                onBack={() => setEditingId(null)}
                onSuccess={() => { setEditingId(null); fetchTables(); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span>
            Tabelas DHL Fora do Padrão
          </h2>
          <p className="text-xs text-gray-500 mt-1 ml-4.5">
            Tabelas do cliente DHL SUPPLY CHAIN cujo nome falha na validação
            <code className="mx-1 px-1 py-0.5 bg-gray-100 rounded">REGIÃO - ... NNNKM</code>
            e que não estão sendo sugeridas automaticamente pelo motor.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTables}
            className="p-2.5 border rounded-lg hover:bg-gray-50 text-gray-500"
            title="Atualizar"
            data-testid="button-refresh-dhl-noncompliant"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2.5 border rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              Voltar
            </button>
          )}
        </div>
      </div>

      {/* COUNTER BANNER */}
      <div
        className={`p-5 rounded-xl border flex items-start gap-4 ${
          nonCompliant.length > 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-emerald-50 border-emerald-200'
        }`}
        data-testid="banner-dhl-noncompliant-count"
      >
        <div className={`p-3 rounded-full ${nonCompliant.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
          <AlertTriangle size={22} />
        </div>
        <div className="flex-1">
          <p
            className={`text-base font-black uppercase tracking-tight ${
              nonCompliant.length > 0 ? 'text-amber-900' : 'text-emerald-900'
            }`}
            data-testid="text-dhl-noncompliant-count"
          >
            {isLoading
              ? 'Carregando tabelas DHL...'
              : nonCompliant.length === 0
                ? 'Nenhuma tabela DHL fora do padrão. O motor automático consegue sugerir todas as tabelas atuais.'
                : `${nonCompliant.length} ${nonCompliant.length === 1 ? 'tabela DHL precisa' : 'tabelas DHL precisam'} de ajuste para voltar a ser ${nonCompliant.length === 1 ? 'sugerida' : 'sugeridas'} automaticamente.`}
          </p>
          <p className="text-[11px] text-gray-600 mt-1">
            Total de tabelas DHL SUPPLY CHAIN carregadas: <b>{tables.filter(t => isDhlSupplyClient(t.client)).length}</b>.
            Padrão exigido: <code className="px-1 bg-white/60 rounded">REGIÃO - {`{SUDESTE|SUL|CENTRO-OESTE|NORDESTE|NORTE|BRASIL}`} - DESCRIÇÃO NNNKM</code>.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm" data-testid="error-dhl-noncompliant">
          {error}
        </div>
      )}

      {/* LIST */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="relative max-w-md w-full">
            <input
              type="text"
              placeholder="Buscar por operação ou motivo..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-dhl-noncompliant"
            />
            <Search size={18} className="absolute left-3.5 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="px-4 py-4">Operação (Nome da Tabela)</th>
                <th className="px-4 py-4">Motivo</th>
                <th className="px-4 py-4 text-center">Franquias</th>
                <th className="px-4 py-4 text-right">Acionamento</th>
                <th className="px-4 py-4 text-right w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-[12px] text-gray-500">
                    <Loader2 size={16} className="inline animate-spin mr-2" /> Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-gray-500 text-[12px]">
                    {nonCompliant.length === 0
                      ? 'Nenhuma tabela DHL fora do padrão encontrada.'
                      : 'Nenhuma tabela corresponde à busca.'}
                  </td>
                </tr>
              ) : (
                filtered.map(({ table, reason }) => (
                  <tr key={table.id} className="text-[12px] hover:bg-amber-50/30" data-testid={`row-dhl-noncompliant-${table.id}`}>
                    <td className="px-4 py-3 font-bold text-gray-800 uppercase" data-testid={`text-operation-${table.id}`}>
                      {table.operation_type || <i className="text-red-500">(vazio)</i>}
                    </td>
                    <td className="px-4 py-3 text-amber-800" data-testid={`text-reason-${table.id}`}>
                      {reason}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap text-gray-600 font-medium">
                      {table.franchise_km}km / {table.franchise_hours}h
                    </td>
                    <td className="px-4 py-3 text-right font-black text-gray-800 whitespace-nowrap">
                      {canViewValues ? formatCurrency(table.activation_fee) : (
                        <span className="text-gray-400 font-normal italic flex items-center justify-end gap-1">
                          <Lock size={10} /> Restrito
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditingId(String(table.id))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold uppercase transition-all"
                        data-testid={`button-edit-${table.id}`}
                      >
                        <Pencil size={12} /> Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DhlNonCompliantTables;
