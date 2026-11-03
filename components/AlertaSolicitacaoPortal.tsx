import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CHAVE = 'tmseg.portal.alertas.lidos';
const PAPEL = ['operador', 'avançado', 'avancado', 'administrador', 'admin', 'diretoria'];

type Aviso = {
  id: string;
  client: string;
  origin: string | null;
  destination: string | null;
  mission_type: string | null;
  reference_number: string | null;
};

function lidos(): Set<string> {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE) || '[]');
    return new Set(Array.isArray(lista) ? lista.map(String) : []);
  } catch {
    return new Set();
  }
}

function papelInterno(): boolean {
  try {
    const usuario = JSON.parse(localStorage.getItem('userData') || '{}');
    const tipo = String(usuario.userType || usuario.user_type || '').toLowerCase();
    if (tipo === 'client' || tipo === 'provider') return false;
    const papel = String(usuario.role || '').toLowerCase();
    return PAPEL.includes(papel);
  } catch {
    return false;
  }
}

/** Aviso interno quando o portal abre uma OS Solicitada sem fornecedor. */
const AlertaSolicitacaoPortal: React.FC = () => {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [ativo] = useState(papelInterno);

  const carregar = useCallback(async () => {
    if (!ativo) return;
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('missions')
      .select('id, client, origin, destination, mission_type, reference_number, created_at')
      .eq('status', 'Solicitada')
      .ilike('current_location', 'Solicitação do portal%')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(20);
    const vistos = lidos();
    setAvisos((data || []).filter((row) => row.id && !vistos.has(String(row.id))) as Aviso[]);
  }, [ativo]);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => { void carregar(); }, 20000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const dispensar = (id: string) => {
    const proximos = lidos();
    proximos.add(id);
    localStorage.setItem(CHAVE, JSON.stringify([...proximos].slice(-200)));
    setAvisos((lista) => lista.filter((item) => item.id !== id));
  };

  const abrir = (id: string) => {
    dispensar(id);
    window.dispatchEvent(new CustomEvent('tmseg:navigate', { detail: 'missions' }));
  };

  if (!ativo || avisos.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[min(100vw-2rem,24rem)] space-y-2" data-testid="alerta-solicitacao-portal">
      {avisos.slice(0, 3).map((aviso) => (
        <div key={aviso.id} className="rounded-2xl border border-orange-200 bg-white p-4 shadow-xl">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-orange-600">
            <Bell size={14} /> Solicitação do portal
          </p>
          <p className="mt-1 text-sm font-black text-slate-900">{aviso.id} · {aviso.client}</p>
          <p className="mt-1 text-xs text-slate-600">
            {aviso.mission_type || 'Escolta'} · {aviso.reference_number || 'sem código do cliente'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{aviso.origin || '—'} → {aviso.destination || '—'}</p>
          <p className="mt-2 text-xs font-bold text-slate-700">Status SOLICITADA. Buscar fornecedor. O preço ainda não foi validado.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => abrir(aviso.id)} className="h-8 rounded-full bg-orange-500 px-3 text-xs font-black text-white">Abrir OS</button>
            <button type="button" onClick={() => dispensar(aviso.id)} className="h-8 rounded-full border border-slate-200 px-3 text-xs font-bold text-slate-500">Dispensar</button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AlertaSolicitacaoPortal;
