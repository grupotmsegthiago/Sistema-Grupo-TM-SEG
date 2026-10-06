import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { explicarTabelaErrada } from '../lib/conferenciaTabelaRota';
import { supabase } from '../lib/supabase';

type Alerta = {
  id: string;
  os: string;
  criador: string;
  tabela: string;
  motivos: string[];
  sugestaoNome: string;
  lado: string;
};

const GUARDADOS = 'tmseg-tabela-errada-lidos';

function nomeAtual(): string {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    return String(user.name || user.full_name || '').trim();
  } catch {
    return '';
  }
}

function mesmoNome(a: string, b: string): boolean {
  const limpa = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  return Boolean(limpa(a) && limpa(a) === limpa(b));
}

function lidos(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(GUARDADOS) || '[]');
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

export default function TabelaRotaAlertaUsuario() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  useEffect(() => {
    const eu = nomeAtual();
    if (!eu) return;
    let cancelado = false;
    void supabase
      .from('system_logs')
      .select('id, user_name, entity_id, details, created_at')
      .eq('action_type', 'TABLE_ROUTE_MISMATCH')
      .order('created_at', { ascending: false })
      .limit(80)
      .then(({ data }) => {
        if (cancelado || !data) return;
        const vistos = lidos();
        const meus = data.flatMap((row) => {
          if (vistos.has(String(row.id))) return [];
          let detalhe: { criador?: string; tabela?: string; motivos?: string[]; sugestaoNome?: string; lado?: string } = {};
          try { detalhe = JSON.parse(String(row.details || '{}')); } catch { detalhe = {}; }
          const criador = String(detalhe.criador || row.user_name || '');
          if (!mesmoNome(criador, eu)) return [];
          return [{
            id: String(row.id),
            os: String(row.entity_id || ''),
            criador,
            tabela: String(detalhe.tabela || ''),
            motivos: Array.isArray(detalhe.motivos) ? detalhe.motivos.map(String) : [],
            sugestaoNome: String(detalhe.sugestaoNome || ''),
            lado: String(detalhe.lado || ''),
          }];
        });
        setAlertas(meus.slice(0, 3));
      });
    return () => { cancelado = true; };
  }, []);

  if (!alertas.length) return null;
  const fechar = (id: string) => {
    const next = lidos();
    next.add(id);
    localStorage.setItem(GUARDADOS, JSON.stringify([...next]));
    setAlertas((atual) => atual.filter((item) => item.id !== id));
  };

  return (
    <div className="mb-3 space-y-2" data-testid="alerta-tabela-errada-usuario">
      {alertas.map((alerta) => (
        <div key={alerta.id} className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-red-950 shadow-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase">OS {alerta.os} aberta com a tabela errada</p>
            <p className="mt-1 text-xs">{explicarTabelaErrada(alerta)}</p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('tmseg:open-billing-mission', { detail: alerta.os }))}
              className="mt-1 text-xs font-black uppercase text-red-800 underline"
              data-testid={`alerta-tabela-errada-auditoria-${alerta.os}`}
            >
              Abrir auditoria de faturamento
            </button>
          </div>
          <button type="button" onClick={() => fechar(alerta.id)} className="rounded-full p-1 hover:bg-red-100" aria-label="Fechar alerta">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
