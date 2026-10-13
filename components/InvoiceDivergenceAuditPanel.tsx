import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import {
  auditarDivergenciasInvoices,
  candidatasDaMesmaAuditoria,
  filtrarDivergenciasAbertas,
  filtrarDivergenciasDiretoria,
  formatarTagDivergencia,
  gravarVinculoOutraNf,
  marcarDivergenciaVerificada,
  type ItemDivergenciaFinanceira,
} from '../lib/billing/auditarDivergenciasFinanceiras';
import { sincronizarFaturaPorOS } from '../lib/billing/sincronizarFaturaAberta';
import { supabase } from '../lib/supabase';
import {
  divergenciaTemComercialSelecionado,
  listarClientesComercialMatch,
} from '../lib/comissao/sincronizarComissoesFaturas';
import { useNotification } from '../lib/NotificationContext';

function fmtBRL(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type CandidataNf = { id: string; client: string; number: string | null; amount: number };

type Props = {
  onSynced?: () => void;
  /** Na comissão, esconde fatura cujo cliente está sem responsável comercial. */
  somenteComComercial?: boolean;
  /** Financeiro vê a fila e pode juntar outra NF. Diretoria só vê o que continuou divergente. */
  audiencia?: 'financeiro' | 'diretoria';
};

const InvoiceDivergenceAuditPanel: React.FC<Props> = ({ onSynced, somenteComComercial = false, audiencia = 'financeiro' }) => {
  const { showNotification } = useNotification();
  const [items, setItems] = useState<ItemDivergenciaFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [consultaIncompleta, setConsultaIncompleta] = useState(false);
  const [vincularItem, setVincularItem] = useState<ItemDivergenciaFinanceira | null>(null);
  const [candidatas, setCandidatas] = useState<CandidataNf[]>([]);
  const [vinculandoId, setVinculandoId] = useState<string | null>(null);
  const [verificandoId, setVerificandoId] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditarDivergenciasInvoices();
      if (!res.ok) {
        console.warn('[BILLING_AUDIT_DIVERGENCE]', res.error);
        setItems([]);
        return;
      }
      setConsultaIncompleta(!!res.consultaIncompleta);
      let abertas = audiencia === 'diretoria'
        ? filtrarDivergenciasDiretoria(res.items)
        : filtrarDivergenciasAbertas(res.items);
      if (somenteComComercial) {
        const clientes = await listarClientesComercialMatch(supabase);
        if (!clientes.ok) {
          setItems([]);
          return;
        }
        abertas = abertas.filter((item) => divergenciaTemComercialSelecionado(item.cliente, clientes.clients));
      }
      setItems(abertas);
    } catch (e) {
      console.warn('[BILLING_AUDIT_DIVERGENCE] falha fail-soft:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [somenteComComercial, audiencia]);

  useEffect(() => { void loadAudit(); }, [loadAudit]);

  const sincronizar = async (item: ItemDivergenciaFinanceira) => {
    if (!item.podeSincronizar || !item.missionIdSync) return;
    setSyncingId(item.invoiceId);
    try {
      const userName = (() => {
        try {
          return JSON.parse(localStorage.getItem('userData') || '{}').name || 'Diretoria';
        } catch {
          return 'Diretoria';
        }
      })();
      const res = await sincronizarFaturaPorOS(item.missionIdSync, { userName });
      if (!res.ok) throw new Error(res.error || 'Falha ao sincronizar fatura');
      showNotification('Sincronizado', `Fatura ${item.faturaNumero || item.invoiceId} alinhada à soma das OS.`, 'success');
      await loadAudit();
      onSynced?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Falha ao sincronizar valor';
      showNotification('Erro', message, 'error');
    } finally {
      setSyncingId(null);
    }
  };

  const abrirVinculo = (item: ItemDivergenciaFinanceira) => {
    setVincularItem(item);
    setCandidatas(candidatasDaMesmaAuditoria(items, item.invoiceId));
  };

  const verificar = async (item: ItemDivergenciaFinanceira) => {
    setVerificandoId(item.invoiceId);
    try {
      const userName = (() => {
        try {
          return JSON.parse(localStorage.getItem('userData') || '{}').name || 'Financeiro';
        } catch {
          return 'Financeiro';
        }
      })();
      const res = await marcarDivergenciaVerificada(item.invoiceId, userName);
      if (!res.ok) throw new Error(res.error || 'Falha ao marcar como verificado');
      showNotification('Verificado', `Fatura ${item.faturaNumero || item.invoiceId} saiu da auditoria.`, 'success');
      await loadAudit();
      onSynced?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Falha ao marcar como verificado';
      showNotification('Erro', message, 'error');
    } finally {
      setVerificandoId(null);
    }
  };

  const confirmarVinculo = async (outraId: string) => {
    if (!vincularItem) return;
    setVinculandoId(outraId);
    try {
      const res = await gravarVinculoOutraNf(vincularItem.invoiceId, outraId);
      if (!res.ok) throw new Error(res.error || 'Falha ao vincular NF');
      showNotification('NF vinculada', 'A divergência foi recalculada com a outra NF e as OS dela.', 'success');
      setVincularItem(null);
      await loadAudit();
      onSynced?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Falha ao vincular NF';
      showNotification('Erro', message, 'error');
    } finally {
      setVinculandoId(null);
    }
  };

  if (loading && items.length === 0 && !vincularItem) return null;
  if (items.length === 0 && !consultaIncompleta) return null;

  const destaque = items.find((i) => i.estado === 'DIVERGENTE') || items[0];

  return (
    <div
      className="border-2 border-amber-400 bg-amber-50 rounded-xl p-4 shadow-sm"
      data-testid="invoice-divergence-audit-panel"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500 shrink-0">
          <AlertTriangle size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="font-black text-sm uppercase tracking-wide text-amber-900">
            Auditoria de divergências financeiras
          </p>
          {destaque && destaque.estado === 'DIVERGENTE' && (
            <p
              className="text-xs font-bold text-amber-950"
              data-testid="invoice-divergence-tag"
            >
              {formatarTagDivergencia(destaque)}
            </p>
          )}
          <p className="text-[11px] text-amber-800">
            {audiencia === 'diretoria'
              ? `${items.length} divergência(s) que continuaram depois de vincular outra NF do mesmo cliente.`
              : `${items.length} fatura(s) aberta(s) com diferença entre a soma das OS e a NF. Vincule outra fatura desta auditoria, ou marque Verificado para tirá-la da fila.`}
            {consultaIncompleta ? ' Consulta incompleta — a lista pode não ser o universo total.' : ''}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-[10px] font-black text-amber-800 uppercase">
                  <th className="text-left py-1 pr-3">Fatura</th>
                  <th className="text-left py-1 pr-3">Cliente</th>
                  <th className="text-right py-1 pr-3">OS</th>
                  <th className="text-right py-1 pr-3">Fatura</th>
                  <th className="text-right py-1 pr-3">Diferença</th>
                  <th className="text-right py-1">Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.invoiceId} className="border-t border-amber-200" data-testid={`invoice-divergence-row-${item.invoiceId}`}>
                    <td className="py-1.5 pr-3 font-mono">{item.faturaNumero || item.invoiceId.slice(0, 8)}</td>
                    <td className="py-1.5 pr-3">
                      {item.cliente}
                      {item.nfsVinculadas.length > 0 && (
                        <div className="text-[10px] font-bold text-amber-800">NF vinculada: {item.nfsVinculadas.join(', ')}</div>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">{fmtBRL(item.valorOs)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{fmtBRL(item.valorFatura)}</td>
                    <td className="py-1.5 pr-3 text-right font-black text-red-700">{fmtBRL(item.diferencaFatura)}</td>
                    <td className="py-1.5 text-right space-x-1 whitespace-nowrap">
                      {audiencia === 'financeiro' && (
                        <>
                          <button
                            type="button"
                            disabled={verificandoId === item.invoiceId}
                            onClick={() => void verificar(item)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-700 text-emerald-800 text-[10px] font-black uppercase hover:bg-emerald-50 disabled:opacity-50"
                            data-testid={`btn-verificar-divergencia-${item.invoiceId}`}
                          >
                            {verificandoId === item.invoiceId ? <Loader2 size={12} className="animate-spin" /> : null}
                            Verificado
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirVinculo(item)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-700 text-amber-900 text-[10px] font-black uppercase hover:bg-amber-100"
                            data-testid={`btn-vincular-nf-${item.invoiceId}`}
                          >
                            Vincular outra NF
                          </button>
                        </>
                      )}
                      {item.estado === 'CONSULTA_INCOMPLETA' ? (
                        <span className="text-[10px] font-bold text-amber-700 uppercase">Consulta incompleta</span>
                      ) : item.podeSincronizar ? (
                        <button
                          type="button"
                          disabled={syncingId === item.invoiceId}
                          onClick={() => void sincronizar(item)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-700 text-white text-[10px] font-black uppercase hover:bg-red-800 disabled:opacity-50"
                          data-testid={`btn-sync-invoice-${item.invoiceId}`}
                        >
                          {syncingId === item.invoiceId ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          Sincronizar Valor
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {vincularItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="modal-vincular-outra-nf">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-5 space-y-3 shadow-xl">
            <p className="font-black text-sm uppercase text-gray-900">Vincular outra NF</p>
            <p className="text-xs text-gray-600">
              {vincularItem.cliente}. Só aparecem as outras faturas desta auditoria. A conta junta o valor das NFs e as OS vinculadas.
            </p>
            {candidatas.length === 0 ? (
              <p className="text-xs font-bold text-amber-800">Não há outra fatura nesta auditoria.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg">
                {candidatas.map((nf) => (
                  <button
                    key={nf.id}
                    type="button"
                    disabled={vinculandoId === nf.id}
                    onClick={() => void confirmarVinculo(nf.id)}
                    className="w-full text-left px-3 py-2 border-b border-gray-50 hover:bg-amber-50 text-xs"
                    data-testid={`btn-escolher-nf-${nf.id}`}
                  >
                    <span className="font-mono font-bold">{nf.number || nf.id.slice(0, 8)}</span>
                    <span className="ml-2">{nf.client}</span>
                    <span className="float-right font-mono">{fmtBRL(nf.amount)}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setVincularItem(null)} className="w-full py-2 rounded-lg border text-xs font-black uppercase">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceDivergenceAuditPanel;
