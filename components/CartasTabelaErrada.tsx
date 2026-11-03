import React, { useCallback, useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';
import { cartaDaLinha, cartaParaMim, type CartaTabela } from '../lib/cartaTabelaErrada';
import { useNotification } from '../lib/NotificationContext';
import { supabase } from '../lib/supabase';

const LIDAS_LOCAL = 'tmseg-cartas-tabela-lidas';
const ABERTA_NA_SESSAO = 'tmseg-carta-tabela-popup';
const LEITURA = 'TABLE_ROUTE_LETTER_READ';

function nomeAtual(): string {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    return String(user.name || user.full_name || '').trim();
  } catch {
    return '';
  }
}

function lidasLocais(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(LIDAS_LOCAL) || '[]');
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

function guardarLidaLocal(id: string) {
  const next = lidasLocais();
  next.add(id);
  localStorage.setItem(LIDAS_LOCAL, JSON.stringify([...next]));
}

function jaAbriuNestaSessao(id: string): boolean {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ABERTA_NA_SESSAO) || '[]');
    return Array.isArray(raw) && raw.map(String).includes(id);
  } catch {
    return false;
  }
}

function marcarAbertaNestaSessao(id: string) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ABERTA_NA_SESSAO) || '[]');
    const ids = new Set(Array.isArray(raw) ? raw.map(String) : []);
    ids.add(id);
    sessionStorage.setItem(ABERTA_NA_SESSAO, JSON.stringify([...ids]));
  } catch {
    /* sem sessionStorage a carta ainda abre nesta renderização */
  }
}

const TIPOS_CARTA = ['TABLE_ROUTE_MISMATCH', 'TOLL_ERROR_REPORT'];

export default function CartasTabelaErrada() {
  const eu = nomeAtual();
  const { showNotification } = useNotification();
  const [cartas, setCartas] = useState<CartaTabela[]>([]);
  const [lidas, setLidas] = useState<Set<string>>(() => lidasLocais());
  const [aberta, setAberta] = useState<CartaTabela | null>(null);
  const [caixa, setCaixa] = useState(false);

  const carregar = useCallback(async () => {
    if (!eu) return;
    const [erros, leituras] = await Promise.all([
      supabase
        .from('system_logs')
        .select('id, action_type, user_name, entity_id, details, created_at')
        .in('action_type', TIPOS_CARTA)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('system_logs')
        .select('entity_id, user_name')
        .eq('action_type', LEITURA)
        .order('created_at', { ascending: false })
        .limit(400),
    ]);
    const lidasAgora = lidasLocais();
    for (const row of leituras.data || []) {
      if (cartaParaMim(String(row.user_name || ''), eu)) lidasAgora.add(String(row.entity_id || ''));
    }
    setLidas(lidasAgora);
    const minhas = (erros.data || [])
      .map((row) => cartaDaLinha(row))
      .filter((carta): carta is CartaTabela => Boolean(carta && cartaParaMim(carta.para, eu)));
    setCartas(minhas);
  }, [eu]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const onLog = (event: Event) => {
      const payload = (event as CustomEvent).detail as { eventType?: string; new?: Record<string, string> } | undefined;
      if (payload?.eventType !== 'INSERT') return;
      const row = payload.new;
      if (!row || !TIPOS_CARTA.includes(String(row.action_type || ''))) return;
      const carta = cartaDaLinha(row);
      if (!carta || !cartaParaMim(carta.para, eu)) return;
      setCartas((atual) => atual.some((item) => item.id === carta.id) ? atual : [carta, ...atual]);
      if (lidasLocais().has(carta.id) || jaAbriuNestaSessao(carta.id)) return;
      marcarAbertaNestaSessao(carta.id);
      setAberta(carta);
      setCaixa(false);
      showNotification('Carta nova', `${carta.assunto}. Só você lê esta carta.`, 'warning', `carta-tabela-${carta.id}`);
    };
    window.addEventListener('supabase:system_logs:realtime', onLog);
    return () => window.removeEventListener('supabase:system_logs:realtime', onLog);
  }, [eu, showNotification]);

  useEffect(() => {
    const pendente = cartas.find((carta) => !lidas.has(carta.id) && !jaAbriuNestaSessao(carta.id));
    if (!pendente) return;
    marcarAbertaNestaSessao(pendente.id);
    setAberta(pendente);
    showNotification('Você tem uma carta', `${pendente.assunto}. Só você lê esta carta.`, 'warning', `carta-tabela-${pendente.id}`);
  }, [cartas, lidas, showNotification]);

  const marcarLida = async (carta: CartaTabela) => {
    guardarLidaLocal(carta.id);
    setLidas((atual) => new Set(atual).add(carta.id));
    setAberta(null);
    const insert = await supabase.from('system_logs').insert([{
      user_name: eu,
      action_type: LEITURA,
      entity: 'TableRouteLetter',
      entity_id: carta.id,
      details: JSON.stringify({ os: carta.os }),
    }]);
    if (insert.error) {
      showNotification('A carta saiu da sua caixa neste aparelho', 'A confirmação de leitura não gravou no histórico.', 'warning');
    }
  };

  if (!eu || !cartas.length) return null;
  const naoLidas = cartas.filter((carta) => !lidas.has(carta.id));

  return (
    <>
      <div className="mb-3 flex justify-end" data-testid="cartas-tabela-errada">
        <button
          type="button"
          onClick={() => setCaixa(true)}
          className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase text-red-800 shadow-sm"
          data-testid="cartas-tabela-abrir"
        >
          <Mail size={14} />
          {naoLidas.length ? `${naoLidas.length} carta${naoLidas.length > 1 ? 's' : ''} para você` : 'Suas cartas'}
        </button>
      </div>
      {caixa && (
        <div className="fixed inset-0 z-[220] flex items-start justify-center bg-black/40 p-4" data-testid="cartas-tabela-caixa">
          <div className="mt-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-black uppercase text-gray-900">Suas cartas</p>
              <button type="button" onClick={() => setCaixa(false)} aria-label="Fechar caixa" className="rounded-full p-1 hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            <ul className="max-h-80 divide-y overflow-y-auto">
              {cartas.map((carta) => (
                <li key={carta.id}>
                  <button
                    type="button"
                    onClick={() => { setCaixa(false); setAberta(carta); }}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-red-50"
                    data-testid={`cartas-tabela-item-${carta.id}`}
                  >
                    <span>
                      <span className="block text-xs font-black text-gray-900">{carta.assunto}</span>
                      <span className="mt-0.5 block text-[11px] text-gray-500">Para {carta.para}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-black uppercase text-red-700">
                      {lidas.has(carta.id) ? 'Lida' : 'Nova'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {aberta && (
        <div className="fixed inset-0 z-[221] flex items-center justify-center bg-black/50 p-4" data-testid="carta-tabela-aberta">
          <article className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between bg-red-700 px-4 py-3 text-white">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                <Mail size={14} /> Carta interna
              </p>
              <button type="button" onClick={() => setAberta(null)} aria-label="Fechar carta" className="rounded-full p-1 hover:bg-red-800">
                <X size={16} />
              </button>
            </header>
            <div className="space-y-1 border-b bg-red-50 px-4 py-3 text-xs text-red-950">
              <p><span className="font-black uppercase">Para:</span> {aberta.para}</p>
              <p><span className="font-black uppercase">De:</span> Auditoria de tabela</p>
              <p><span className="font-black uppercase">Assunto:</span> {aberta.assunto}</p>
              {aberta.quando && <p><span className="font-black uppercase">Quando:</span> {aberta.quando}</p>}
            </div>
            <p className="px-4 py-4 text-sm font-medium leading-relaxed text-gray-900" data-testid="carta-tabela-corpo">
              {aberta.corpo}
            </p>
            <footer className="flex flex-wrap gap-2 border-t px-4 py-3">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('tmseg:open-billing-mission', { detail: aberta.os }))}
                className="rounded-lg border border-red-200 px-3 py-2 text-[11px] font-black uppercase text-red-800"
                data-testid="carta-tabela-auditoria"
              >
                Abrir a OS
              </button>
              {!lidas.has(aberta.id) && (
                <button
                  type="button"
                  onClick={() => { void marcarLida(aberta); }}
                  className="rounded-lg bg-red-700 px-3 py-2 text-[11px] font-black uppercase text-white"
                  data-testid="carta-tabela-li"
                >
                  Li e entendi
                </button>
              )}
            </footer>
          </article>
        </div>
      )}
    </>
  );
}
