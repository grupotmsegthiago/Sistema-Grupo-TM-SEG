import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock, Copy, Lock, MapPin, MessageCircle, Truck } from 'lucide-react';
import { copyTextAsync } from '../lib/clipboard';
import { formatDateTimeBR } from '../lib/dateUtils';
import { descreverReferencia } from '../lib/dhlReferenciaGeografica';
import {
  abrirAlertaCopiaDhl,
  agruparPorRegiao,
  carregarAlertasDhl,
  confirmarEnvioDhl,
  copiaBloqueadaPara,
  entraNaListaBloqueados,
  marcarCopiadoDhl,
  minutosRestantes,
  montarMensagemDisponibilidadeDhlAoVivo,
  podeAuditarNaoEncaminhados,
  podeVerPainelDhl,
  rotuloRegiao,
  salvarObservacaoDhl,
  textoAlertaJaCopiado,
  textoHaQuantoTempo,
  tomDoBotao,
  visivelNoPainelVivo,
  type AlertaDhl,
} from '../lib/dhlViaturaDisponivel';
import { MISSION_LIVE_WINDOW_EVENT } from '../lib/missionLiveBroadcast';
import { useNotification } from '../lib/NotificationContext';

type SessionUser = { name?: string; role?: string; profileName?: string; permissions?: string[] };

const POLL_MS = 15_000;
const RECONCILE_MS = 60_000;

const FAIXA: Record<string, string> = {
  NORTE: 'border-emerald-300 bg-emerald-50/80',
  NORDESTE: 'border-orange-300 bg-orange-50/80',
  'CENTRO-OESTE': 'border-amber-300 bg-amber-50/80',
  SUDESTE: 'border-sky-300 bg-sky-50/80',
  SUL: 'border-indigo-300 bg-indigo-50/80',
  OUTRAS: 'border-gray-300 bg-gray-50',
};

function readUser(): SessionUser | null {
  try {
    const raw = JSON.parse(localStorage.getItem('userData') || '{}');
    if (!raw?.name && !raw?.role) return null;
    return raw;
  } catch {
    return null;
  }
}

const DhlViaturaDisponivelPanel: React.FC = () => {
  const { showNotification } = useNotification();
  const [user, setUser] = useState<SessionUser | null>(() => readUser());
  const [rows, setRows] = useState<AlertaDhl[]>([]);
  const [tabelaOk, setTabelaOk] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [auditAberta, setAuditAberta] = useState(false);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [salvandoNota, setSalvandoNota] = useState<string | null>(null);

  const load = useCallback(async (reconciliar: boolean) => {
    const current = readUser();
    setUser(current);
    const res = await carregarAlertasDhl({ reconciliar });
    setTabelaOk(res.tabelaOk);
    setRows(res.alertas);
    setNotas((prev) => {
      const next = { ...prev };
      for (const row of res.alertas) {
        if (next[row.mission_id] == null) next[row.mission_id] = row.observacao_diretoria || '';
      }
      return next;
    });
  }, []);

  const podeVer = podeVerPainelDhl(user);

  useEffect(() => {
    if (!podeVer) return;
    void load(true);
    const clock = window.setInterval(() => setNow(new Date()), 15_000);
    const poll = window.setInterval(() => { void load(false); }, POLL_MS);
    const reconcile = window.setInterval(() => { void load(true); }, RECONCILE_MS);
    const onLive = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail?.event !== 'dhl_viatura') return;
      const payload = detail.payload || {};
      const missionId = String(payload.missionId || '');
      if (missionId && payload.status === 'copiado') {
        setRows((prev) => prev.map((item) => (
          item.mission_id === missionId
            ? { ...item, status: 'copiado', copiado_por: String(payload.copiadoPor || item.copiado_por || '') }
            : item
        )));
      }
      if (missionId && payload.status === 'confirmado') {
        setRows((prev) => prev.map((item) => (
          item.mission_id === missionId ? { ...item, status: 'confirmado' } : item
        )));
      }
      void load(false);
    };
    window.addEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
      window.clearInterval(reconcile);
      window.removeEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);
    };
  }, [load, podeVer]);

  const vivas = useMemo(
    () => rows.filter((row) => visivelNoPainelVivo(row, now)),
    [rows, now],
  );
  const grupos = useMemo(() => agruparPorRegiao(vivas), [vivas]);
  const bloqueados = useMemo(
    () => rows.filter((row) => entraNaListaBloqueados(row, now)),
    [rows, now],
  );
  const semConfirmacao = useMemo(
    () => rows.filter((row) => row.status === 'copiado' && minutosRestantes(row.finalizada_em, now) === 0),
    [rows, now],
  );
  const podeAuditar = podeAuditarNaoEncaminhados(user);

  useEffect(() => {
    if (bloqueados.length > 0) setAuditAberta(true);
  }, [bloqueados.length]);

  const nome = user?.name || 'Operador';

  if (!podeVer) return null;

  const comunicar = (row: AlertaDhl) => {
    if (ocupadoId) return;
    if (row.status === 'copiado' && copiaBloqueadaPara(row.copiado_por, nome)) {
      abrirAlertaCopiaDhl({
        missionId: row.mission_id,
        copiadoPor: row.copiado_por || 'Outro operador',
        posicao: row.posicao,
        regiao: row.regiao,
        origem: 'clique',
      });
      return;
    }
    if (tomDoBotao(row.status, row.finalizada_em, new Date()) === 'vermelho') {
      showNotification('Fora do prazo', 'Passou 1 hora. Essa viatura já saiu do painel.', 'warning');
      void load(false);
      return;
    }
    const texto = montarMensagemDisponibilidadeDhlAoVivo({
      regiao: row.regiao,
      posicao: row.posicao,
      uf: row.uf,
      finalizadaEm: row.finalizada_em,
    });
    setOcupadoId(row.mission_id);
    const copia = copyTextAsync(texto);
    void copia.then(async (ok) => {
      if (!ok) {
        setOcupadoId(null);
        showNotification('WhatsApp', 'Não foi possível copiar o texto. Tente de novo.', 'error');
        return;
      }
      const resultado = await marcarCopiadoDhl(row.mission_id, nome);
      setOcupadoId(null);
      if (resultado.resultado === 'ja' && copiaBloqueadaPara(resultado.copiadoPor, nome)) {
        const quem = resultado.copiadoPor || 'Outro operador';
        void copyTextAsync(textoAlertaJaCopiado(quem, row.mission_id, resultado.posicao || row.posicao));
        abrirAlertaCopiaDhl({
          missionId: row.mission_id,
          copiadoPor: quem,
          posicao: resultado.posicao || row.posicao,
          regiao: resultado.regiao || row.regiao,
          origem: 'clique',
        });
        void load(false);
        return;
      }
      if (resultado.resultado === 'bloqueado') {
        showNotification('Fora do prazo', 'Passou 1 hora sem comunicação. A viatura saiu do painel.', 'warning');
        void load(false);
        return;
      }
      if (resultado.resultado === 'erro') {
        showNotification('WhatsApp', 'O texto foi copiado, mas o painel não gravou. Os outros operadores podem não ver o verde claro.', 'warning');
      } else {
        showNotification('WhatsApp', 'Texto copiado. Cole no grupo da DHL e confirme o envio.', 'success');
      }
      setRows((prev) => prev.map((item) => (
        item.mission_id === row.mission_id && item.status === 'pendente'
          ? { ...item, status: 'copiado', copiado_em: new Date().toISOString(), copiado_por: nome }
          : item
      )));
      setConfirmandoId(row.mission_id);
      void load(false);
    });
  };

  const confirmar = async (row: AlertaDhl) => {
    if (ocupadoId) return;
    setOcupadoId(row.mission_id);
    const ok = await confirmarEnvioDhl(row.mission_id, nome);
    setOcupadoId(null);
    if (!ok) {
      showNotification('DHL', 'Não foi possível confirmar o envio. Tente de novo.', 'error');
      return;
    }
    setConfirmandoId(null);
    setRows((prev) => prev.map((item) => (
      item.mission_id === row.mission_id ? { ...item, status: 'confirmado', confirmado_por: nome } : item
    )));
    showNotification('DHL', 'Envio confirmado. A viatura saiu do painel.', 'success');
    void load(false);
  };

  const salvarNota = async (row: AlertaDhl) => {
    setSalvandoNota(row.mission_id);
    const ok = await salvarObservacaoDhl(row.mission_id, notas[row.mission_id] || '');
    setSalvandoNota(null);
    showNotification(
      'Diretoria',
      ok ? 'Motivo gravado.' : 'Não foi possível gravar o motivo.',
      ok ? 'success' : 'error',
    );
  };

  return (
    <section
      className="sticky top-0 z-30 rounded-xl border border-green-900/30 bg-white shadow-md"
      data-testid="painel-dhl-viaturas"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-green-900/10 bg-green-950 px-4 py-3 text-white rounded-t-xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Truck size={16} />
            <h3 className="text-sm font-black uppercase tracking-wide">Viaturas para a DHL</h3>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black">{vivas.length}</span>
          </div>
          <p className="mt-1 text-[11px] font-semibold text-green-100">
            Qualquer cliente. A OS finalizada fora de São Paulo e Rio de Janeiro entra aqui para avisar a DHL que a Escolta TM Segue tem viatura na região. Fornecedor e cliente ficam só neste painel.
          </p>
        </div>
        <p className="text-[10px] font-bold uppercase text-green-200">Some ao confirmar o envio no grupo</p>
      </div>

      {!tabelaOk && (
        <p className="px-4 py-3 text-xs font-bold text-amber-800 bg-amber-50" data-testid="painel-dhl-sem-tabela">
          Falta criar a tabela no banco. Rode a migration <span className="font-mono">2026_10_06_dhl_viatura_disponivel.sql</span> no Supabase.
        </p>
      )}

      <div className="max-h-[42vh] overflow-y-auto p-3 space-y-3">
        {grupos.length === 0 && tabelaOk && (
          <p className="text-xs font-semibold text-gray-500 px-1 py-2" data-testid="painel-dhl-vazio">
            Nenhuma viatura fora de SP e RJ aguardando comunicação.
          </p>
        )}
        {grupos.map((grupo) => (
          <div key={grupo.regiao} className={`rounded-lg border p-2 ${FAIXA[grupo.regiao] || FAIXA.OUTRAS}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-800">
                {rotuloRegiao(grupo.regiao)}
                {grupo.regiao === 'SUDESTE' ? ' · MG e ES' : ''}
              </p>
              <span className="text-[10px] font-black text-gray-600">{grupo.itens.length}</span>
            </div>
            <div className="space-y-2">
              {grupo.itens.map((row) => {
                const tom = tomDoBotao(row.status, row.finalizada_em, now);
                const referencia = descreverReferencia(row.posicao, row.uf);
                const claro = tom === 'claro';
                const restante = minutosRestantes(row.finalizada_em, now);
                return (
                  <article key={row.mission_id} className="rounded-lg border border-white/80 bg-white p-2.5 shadow-sm" data-testid={`dhl-viatura-${row.mission_id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-gray-900">{row.mission_id}</p>
                        <p className="text-[11px] font-bold text-gray-700">Cliente: {row.cliente || '—'}</p>
                        <p className="text-[11px] font-bold text-gray-700">Fornecedor: {row.provider_name || '—'}</p>
                        <p className="mt-0.5 flex items-start gap-1 text-[11px] font-semibold text-gray-600">
                          <MapPin size={12} className="mt-0.5 shrink-0" />
                          <span>{row.posicao}</span>
                        </p>
                        {referencia && (
                          <p className="mt-0.5 text-[10px] font-semibold text-gray-500">{referencia.resumo}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-stretch gap-1 sm:items-end">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => comunicar(row)}
                            disabled={ocupadoId === row.mission_id}
                            data-testid={`button-comunicar-dhl-${row.mission_id}`}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black uppercase shadow-sm disabled:opacity-60 ${
                              claro
                                ? 'bg-green-300 text-green-950 hover:bg-green-200'
                                : 'bg-green-800 text-white hover:bg-green-900'
                            }`}
                          >
                            {claro ? <Check size={13} /> : <MessageCircle size={13} />}
                            Comunicar a DHL
                          </button>
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-gray-700" data-testid={`tempo-dhl-${row.mission_id}`}>
                            <Clock size={12} />
                            finalizada {textoHaQuantoTempo(row.finalizada_em, now)}
                          </span>
                        </div>
                        {claro && !copiaBloqueadaPara(row.copiado_por, nome) && (
                          <button
                            type="button"
                            onClick={() => setConfirmandoId(row.mission_id)}
                            className="text-[10px] font-black uppercase text-green-800 underline"
                          >
                            Confirmar envio no grupo
                          </button>
                        )}
                        {claro && copiaBloqueadaPara(row.copiado_por, nome) && (
                          <p className="text-[10px] font-black text-amber-800">{row.copiado_por} já copiou. Não envie de novo.</p>
                        )}
                        {row.status === 'pendente' && restante > 0 && restante <= 15 && (
                          <p className="text-[10px] font-black text-amber-700">Sai do painel em {restante} min se ninguém comunicar</p>
                        )}
                        {row.copiado_por && (
                          <p className="text-[10px] font-semibold text-gray-500">Copiado por {row.copiado_por}</p>
                        )}
                      </div>
                    </div>
                    {confirmandoId === row.mission_id && (
                      <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2" data-testid={`confirmar-dhl-${row.mission_id}`}>
                        <p className="text-[12px] font-black text-green-950">Confirmar que já enviou essa mensagem no grupo?</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => { void confirmar(row); }}
                            className="rounded-lg bg-green-800 px-3 py-1.5 text-[11px] font-black uppercase text-white"
                            data-testid={`button-confirmar-envio-dhl-${row.mission_id}`}
                          >
                            Sim, já enviei
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmandoId(null)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-black uppercase text-gray-700"
                          >
                            Ainda não
                          </button>
                          <button
                            type="button"
                            onClick={() => comunicar(row)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-gray-600"
                          >
                            <Copy size={12} /> Copiar de novo
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {podeAuditar && (
        <div className="border-t border-gray-200 px-3 py-2">
          <button
            type="button"
            onClick={() => setAuditAberta((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
            data-testid="button-dhl-nao-encaminhadas"
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase text-red-700">
              <Lock size={12} />
              Não encaminhadas à DHL ({bloqueados.length})
            </span>
            <span className="text-[10px] font-bold text-gray-500">{auditAberta ? 'ocultar' : 'ver'}</span>
          </button>
          {auditAberta && (
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto" data-testid="lista-dhl-nao-encaminhadas">
              {bloqueados.length === 0 && semConfirmacao.length === 0 && (
                <p className="text-[11px] font-semibold text-gray-500">Nenhuma comunicação perdida nos últimos 30 dias.</p>
              )}
              {bloqueados.map((row) => (
                <article key={row.mission_id} className="rounded-lg border border-red-300 bg-red-50 p-2" data-testid={`dhl-bloqueada-${row.mission_id}`}>
                  <p className="text-[11px] font-black text-red-900">{row.mission_id} · {rotuloRegiao(row.regiao)} · bloqueada</p>
                  <p className="text-[11px] font-bold text-red-800">Cliente: {row.cliente || '—'} · Fornecedor: {row.provider_name || '—'}</p>
                  <p className="text-[11px] font-semibold text-red-800">{row.posicao}</p>
                  <p className="text-[10px] font-semibold text-red-700">Finalizada em {formatDateTimeBR(row.finalizada_em)} · {textoHaQuantoTempo(row.finalizada_em, now)}</p>
                  <p className="mt-1 text-[11px] font-semibold text-red-900">{row.motivo_bloqueio || 'Passou 1 hora sem clicar em Comunicar a DHL.'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={notas[row.mission_id] ?? ''}
                      onChange={(e) => setNotas((prev) => ({ ...prev, [row.mission_id]: e.target.value }))}
                      placeholder="Por que não foi encaminhada?"
                      className="min-w-[180px] flex-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-800"
                      data-testid={`input-motivo-dhl-${row.mission_id}`}
                    />
                    <button
                      type="button"
                      onClick={() => { void salvarNota(row); }}
                      disabled={salvandoNota === row.mission_id}
                      className="rounded-md bg-red-700 px-2 py-1 text-[10px] font-black uppercase text-white disabled:opacity-60"
                    >
                      Salvar motivo
                    </button>
                  </div>
                </article>
              ))}
              {semConfirmacao.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] font-black uppercase text-amber-800">Copiou e ainda não confirmou o grupo</p>
                  {semConfirmacao.map((row) => (
                    <p key={row.mission_id} className="mt-1 text-[11px] font-semibold text-amber-900">
                      {row.mission_id} · {row.provider_name || '—'} · {row.posicao} · copiado por {row.copiado_por || '—'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default DhlViaturaDisponivelPanel;
