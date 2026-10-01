import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Linha = {
  id: string;
  os: string;
  criador: string;
  tabela: string;
  quando: string;
};

export default function CockpitTabelaErrada() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [incompleta, setIncompleta] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void supabase
      .from('system_logs')
      .select('id, user_name, entity_id, details, created_at', { count: 'exact' })
      .eq('action_type', 'TABLE_ROUTE_MISMATCH')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error: queryError, count }) => {
        if (cancelado) return;
        if (queryError) {
          setError(queryError.message);
          setLinhas([]);
          setLoading(false);
          return;
        }
        const rows = data || [];
        setIncompleta(count != null && count > rows.length);
        setLinhas(rows.map((row) => {
          let detalhe: { criador?: string; tabela?: string } = {};
          try { detalhe = JSON.parse(String(row.details || '{}')); } catch { detalhe = {}; }
          const quando = row.created_at
            ? new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '';
          return {
            id: String(row.id),
            os: String(row.entity_id || ''),
            criador: String(detalhe.criador || row.user_name || 'não identificado'),
            tabela: String(detalhe.tabela || ''),
            quando,
          };
        }));
        setLoading(false);
      });
    return () => { cancelado = true; };
  }, []);

  const porPessoa = new Map<string, number>();
  for (const linha of linhas) porPessoa.set(linha.criador, (porPessoa.get(linha.criador) || 0) + 1);
  const ranking = [...porPessoa.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-white border border-red-200 rounded-2xl p-4 shadow-sm" data-testid="cockpit-tabela-errada">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-600" /> Tabelas que não combinam com a rota
          </h3>
          <p className="text-xs text-gray-500 mt-1">Quem abriu a OS com estado, UF ou KM fora da tabela aplicada.</p>
        </div>
        <p className="text-2xl font-black text-red-700" data-testid="cockpit-tabela-errada-count">{loading ? '…' : linhas.length}</p>
      </div>
      {loading && <p className="mt-3 text-xs text-gray-500"><Loader2 size={12} className="inline animate-spin" /> Carregando...</p>}
      {error && <p className="mt-3 text-xs font-bold text-red-600">ERRO — {error}</p>}
      {incompleta && !error && <p className="mt-3 text-xs font-bold text-amber-800">CONSULTA INCOMPLETA — atualize antes de usar este levantamento.</p>}
      {!loading && !error && linhas.length === 0 && <p className="mt-3 text-xs text-gray-500">Nenhuma tabela errada registrada.</p>}
      {ranking.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {ranking.map(([nome, total]) => (
            <span key={nome} className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-800">
              {nome}: {total}
            </span>
          ))}
        </div>
      )}
      {linhas.length > 0 && (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {linhas.map((linha) => (
            <li key={linha.id} className="rounded-xl bg-red-50/70 px-3 py-2 text-xs">
              <span className="font-black text-red-900">OS {linha.os}</span>
              <span className="mx-1 text-gray-400">·</span>
              <span className="font-bold uppercase">{linha.criador}</span>
              <span className="mx-1 text-gray-400">·</span>
              <span>{linha.tabela}</span>
              {linha.quando && <span className="ml-2 text-gray-500">{linha.quando}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
