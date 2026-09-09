import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Copy, Loader2, Save, Pencil, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { copyTextAsync } from '../lib/clipboard';
import { canAccessComissoesComerciais } from '../lib/diretoriaAccess';
import {
  calcularCotacaoRapida,
  formatBRL,
  montarPayloadQuoteRapida,
  montarResumoCotacao,
  type RegiaoPrecoPiso,
} from '../lib/comercial/tabelaPrecosRegionais';

type Props = {
  clientName?: string;
  clientId?: string | number | null;
  onSaved?: () => void;
};

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500';

const CotacaoRapidaRegional: React.FC<Props> = ({ clientName, clientId, onSaved }) => {
  const { showNotification } = useNotification();
  const [regioes, setRegioes] = useState<RegiaoPrecoPiso[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [km, setKm] = useState('0');
  const [horas, setHoras] = useState('0');
  const [prospecto, setProspecto] = useState(clientName || '');
  const [drafts, setDrafts] = useState<Record<string, Partial<RegiaoPrecoPiso>>>({});

  const storedUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; }
  }, []);
  const canEditPiso = canAccessComissoesComerciais(storedUser);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tabela_precos_regioes')
        .select('id, codigo, regiao, estados, valor_acionamento, valor_km_extra, valor_hora_extra, ativo, ordem')
        .eq('ativo', true)
        .order('ordem', { ascending: true });
      if (error) throw error;
      const rows = (data || []) as RegiaoPrecoPiso[];
      setRegioes(rows);
      setCodigo((prev) => prev || rows[0]?.codigo || '');
    } catch (e: any) {
      showNotification('Tabela regional', e?.message || 'Falha ao carregar piso regional.', 'error');
      setRegioes([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (clientName) setProspecto(clientName); }, [clientName]);

  const selecionada = regioes.find((r) => r.codigo === codigo) || regioes[0] || null;
  const resultado = useMemo(() => {
    if (!selecionada) return null;
    return calcularCotacaoRapida({
      regiao: selecionada,
      kmEstimado: Number(km),
      horasExtrasEstimadas: Number(horas),
    });
  }, [selecionada, km, horas]);

  const gravarCotacao = async () => {
    if (!resultado) return;
    const nome = String(prospecto || '').trim();
    if (!nome) {
      showNotification('Cliente', 'Informe o nome do cliente ou prospect.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const parsedId = clientId != null && String(clientId) !== '0' ? Number(clientId) : NaN;
      const payload = montarPayloadQuoteRapida({
        resultado,
        clienteNome: nome,
        clientId: Number.isFinite(parsedId) ? parsedId : null,
        createdBy: storedUser?.name || 'SISTEMA',
      });
      const { error } = await supabase.from('quotes').insert([payload]);
      if (error) throw error;
      showNotification('Cotação salva', 'Registro gravado em Propostas Comerciais. Faturamento só após fechar a proposta.', 'success');
      onSaved?.();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao gravar cotação.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copiarResumo = () => {
    if (!resultado) return;
    void copyTextAsync(montarResumoCotacao(resultado, prospecto)).then((ok) => {
      showNotification(ok ? 'Copiado' : 'Falha', ok ? 'Resumo copiado.' : 'Não foi possível copiar.', ok ? 'success' : 'error');
    });
  };

  const salvarPiso = async (row: RegiaoPrecoPiso) => {
    const draft = drafts[row.id] || {};
    setSavingTable(true);
    try {
      const { error } = await supabase.from('tabela_precos_regioes').update({
        valor_acionamento: Number(draft.valor_acionamento ?? row.valor_acionamento),
        valor_km_extra: Number(draft.valor_km_extra ?? row.valor_km_extra),
        valor_hora_extra: Number(draft.valor_hora_extra ?? row.valor_hora_extra),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      if (error) throw error;
      showNotification('Piso atualizado', `${row.regiao} salvo. Cotações e tabelas de cliente já fechadas não mudam.`, 'success');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao salvar piso.', 'error');
    } finally {
      setSavingTable(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-5" data-testid="cotacao-rapida-regional">
      <div>
        <h3 className="text-sm font-black uppercase tracking-tight text-gray-900 flex items-center gap-2">
          <Calculator size={16} className="text-red-600" /> Cotação rápida regional (piso mínimo)
        </h3>
        <p className="text-[11px] text-gray-500 font-medium mt-1">
          Base para prospect/novo cliente. Não substitui a tabela real de faturamento. Ao fechar a proposta, o piso vira `client_price_tables`.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
              <th className="text-left px-3 py-2">Região</th>
              <th className="text-left px-3 py-2">Estados</th>
              <th className="text-right px-3 py-2">Acionamento</th>
              <th className="text-right px-3 py-2">KM extra</th>
              <th className="text-right px-3 py-2">Hora extra</th>
              {canEditPiso && <th className="text-center px-3 py-2">Editar</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-gray-400 text-xs"><Loader2 size={14} className="inline animate-spin" /> Carregando piso…</td></tr>
            ) : regioes.map((r) => {
              const d = drafts[r.id] || {};
              return (
                <tr key={r.id} className={`border-t border-gray-50 ${codigo === r.codigo ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-2 font-black text-xs uppercase text-gray-800">{r.regiao}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.estados}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {canEditPiso ? (
                      <input type="number" step="0.01" className="w-24 text-right border rounded px-2 py-1"
                        value={d.valor_acionamento ?? r.valor_acionamento}
                        onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], valor_acionamento: Number(e.target.value) } }))}
                      />
                    ) : formatBRL(Number(r.valor_acionamento))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {canEditPiso ? (
                      <input type="number" step="0.01" className="w-24 text-right border rounded px-2 py-1"
                        value={d.valor_km_extra ?? r.valor_km_extra}
                        onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], valor_km_extra: Number(e.target.value) } }))}
                      />
                    ) : formatBRL(Number(r.valor_km_extra))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {canEditPiso ? (
                      <input type="number" step="0.01" className="w-24 text-right border rounded px-2 py-1"
                        value={d.valor_hora_extra ?? r.valor_hora_extra}
                        onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], valor_hora_extra: Number(e.target.value) } }))}
                      />
                    ) : formatBRL(Number(r.valor_hora_extra))}
                  </td>
                  {canEditPiso && (
                    <td className="px-3 py-2 text-center">
                      <button type="button" disabled={savingTable} onClick={() => void salvarPiso(r)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-900 text-white text-[10px] font-black uppercase disabled:opacity-50">
                        <Pencil size={10} /> Salvar
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <label className="text-[10px] font-black text-gray-400 uppercase">Cliente / Prospect
          <input className={`${INPUT} mt-1`} value={prospecto} onChange={(e) => setProspecto(e.target.value)} placeholder="Nome para gravar na cotação" data-testid="input-prospecto-cotacao" disabled={!!clientName} />
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Região
          <select className={`${INPUT} mt-1`} value={codigo} onChange={(e) => setCodigo(e.target.value)} data-testid="select-regiao-cotacao">
            {regioes.map((r) => (
              <option key={r.codigo} value={r.codigo}>{r.regiao} ({r.estados})</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">KM estimado
          <input type="number" min="0" step="0.1" className={`${INPUT} mt-1`} value={km} onChange={(e) => setKm(e.target.value)} data-testid="input-km-cotacao" />
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Horas extras
          <input type="number" min="0" step="0.1" className={`${INPUT} mt-1`} value={horas} onChange={(e) => setHoras(e.target.value)} data-testid="input-horas-cotacao" />
        </label>
      </div>

      {resultado && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="resumo-cotacao-rapida">
          <div><p className="text-[10px] font-black text-gray-400 uppercase">Acionamento</p><p className="font-black text-gray-900">{formatBRL(resultado.valorAcionamento)}</p></div>
          <div><p className="text-[10px] font-black text-gray-400 uppercase">Total KM</p><p className="font-black text-gray-900">{formatBRL(resultado.valorTotalKm)}</p></div>
          <div><p className="text-[10px] font-black text-gray-400 uppercase">Total horas</p><p className="font-black text-gray-900">{formatBRL(resultado.valorTotalHoras)}</p></div>
          <div><p className="text-[10px] font-black text-red-600 uppercase">Total estimado</p><p className="text-lg font-black text-gray-900">{formatBRL(resultado.valorTotalEstimado)}</p></div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving || !resultado} onClick={() => void gravarCotacao()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-black uppercase disabled:opacity-50" data-testid="btn-gravar-cotacao-rapida">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Gravar cotação
        </button>
        <button type="button" disabled={!resultado} onClick={copiarResumo}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700" data-testid="btn-copiar-resumo-cotacao">
          <Copy size={14} /> Copiar resumo
        </button>
        <span className="text-[10px] text-gray-400 self-center font-medium flex items-center gap-1">
          <Check size={12} /> Depois de fechada, use “Fechar proposta” na lista para gerar a tabela real do cliente.
        </span>
      </div>
    </div>
  );
};

export default CotacaoRapidaRegional;
