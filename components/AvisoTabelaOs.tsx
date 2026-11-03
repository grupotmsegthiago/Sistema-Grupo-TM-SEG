import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { authFetch } from '../lib/authFetch';
import { conferirTabelaRota, type TabelaConferencia } from '../lib/conferenciaTabelaRota';

const criadorCache = new Map<string, string>();

function useCriadorOs(missionId: string): string {
  const [nome, setNome] = useState(criadorCache.get(missionId) || '');
  useEffect(() => {
    if (!missionId) return;
    const cached = criadorCache.get(missionId);
    if (cached) {
      setNome(cached);
      return;
    }
    let cancelado = false;
    void supabase
      .from('system_logs')
      .select('user_name, created_at')
      .eq('entity', 'Mission')
      .eq('entity_id', missionId)
      .eq('action_type', 'CREATE')
      .order('created_at', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        const achado = String(data?.[0]?.user_name || '').trim();
        if (achado) criadorCache.set(missionId, achado);
        if (!cancelado) setNome(achado);
      });
    return () => { cancelado = true; };
  }, [missionId]);
  return nome;
}

export function AvisoTabelaOs({
  missionId,
  origem,
  destino,
  km,
  lado,
  tabelaId,
  tabelas,
}: {
  missionId: string;
  origem: string;
  destino: string;
  km: number | null;
  lado: 'cliente' | 'fornecedor';
  tabelaId: string;
  tabelas: TabelaConferencia[];
}) {
  const criador = useCriadorOs(missionId);
  const atual = tabelas.find((item) => item.id === String(tabelaId || '')) || null;
  const resultado = conferirTabelaRota(atual, { origem, destino, km }, tabelas);

  useEffect(() => {
    if (!missionId || !tabelaId || resultado.status !== 'ERRADA') return;
    const chave = `${missionId}:${lado}:${tabelaId}`;
    try {
      if (sessionStorage.getItem(`tmseg-tabela-alerta:${chave}`)) return;
      sessionStorage.setItem(`tmseg-tabela-alerta:${chave}`, '1');
    } catch { /* segue o registro mesmo sem sessionStorage */ }
    void authFetch('/api/tabela-rota-alerta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId, lado, tableId: tabelaId }),
    }).catch(() => { sessionStorage.removeItem(`tmseg-tabela-alerta:${chave}`); });
  }, [missionId, lado, tabelaId, resultado.status]);

  return (
    <div className="mt-2 space-y-2">
      <p className="text-[11px] font-black uppercase tracking-wide text-zinc-500" data-testid={`os-aberta-por-${lado}`}>
        Aberto por {criador || 'não identificado'}
      </p>
      {resultado.status === 'ERRADA' && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-[11px] font-bold text-red-900" data-testid={`aviso-tabela-errada-${lado}`}>
          <p className="flex items-center gap-1 uppercase">
            <AlertTriangle size={12} /> Tabela não combina com a rota
          </p>
          {resultado.motivos.map((motivo) => <p key={motivo} className="mt-1 font-semibold normal-case">{motivo}</p>)}
          {resultado.sugestaoNome && (
            <p className="mt-1 normal-case">Use a tabela {resultado.sugestaoNome}.</p>
          )}
        </div>
      )}
    </div>
  );
}
