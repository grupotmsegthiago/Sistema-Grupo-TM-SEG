import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import {
  auditarDivergenciasInvoices,
  filtrarDivergenciasAbertas,
  formatarTagDivergencia,
  type ItemDivergenciaFinanceira,
} from '../lib/billing/auditarDivergenciasFinanceiras';
import { sincronizarFaturaPorOS } from '../lib/billing/sincronizarFaturaAberta';
import { useNotification } from '../lib/NotificationContext';

function fmtBRL(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Props = {
  onSynced?: () => void;
};

const InvoiceDivergenceAuditPanel: React.FC<Props> = ({ onSynced }) => {
  const { showNotification } = useNotification();
  const [items, setItems] = useState<ItemDivergenciaFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [consultaIncompleta, setConsultaIncompleta] = useState(false);

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
      setItems(filtrarDivergenciasAbertas(res.items));
    } catch (e) {
      console.warn('[BILLING_AUDIT_DIVERGENCE] falha fail-soft:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (loading && items.length === 0) return null;
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
            {items.length} fatura(s) aberta(s) com diferença acima de R$ 0,01 entre a soma das OS e o valor da fatura/comissão.
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
                    <td className="py-1.5 pr-3">{item.cliente}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{fmtBRL(item.valorOs)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{fmtBRL(item.valorFatura)}</td>
                    <td className="py-1.5 pr-3 text-right font-black text-red-700">{fmtBRL(item.diferencaFatura)}</td>
                    <td className="py-1.5 text-right">
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
    </div>
  );
};

export default InvoiceDivergenceAuditPanel;
