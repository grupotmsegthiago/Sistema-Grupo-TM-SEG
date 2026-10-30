import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { dadosEmissorPadrao, gerarPdfPreFatura } from '../lib/billing/preFaturaPdf';
import {
  bloqueioCadastroFiscal,
  colunaCobranca,
  competenciaAtual,
  corpoCobrancaPreFatura,
  diferencaLinha,
  enderecoCliente,
  formatarDataIso,
  formatarMoeda,
  lerValorMonetario,
  nomeCompetencia,
  podeAprovar,
  podeCancelar,
  podeEditar,
  podeGerarFatura,
  ROTULO_TIPO_LINHA,
  totaisDaPreFatura,
  vencimentoSugerido,
  type TipoLinhaPreFatura,
} from '../lib/billing/preFaturaMensal';
import {
  ajustarValorLinha,
  aprovarPreFatura,
  cancelarPreFatura,
  carregarPreFatura,
  excluirLinha,
  incluirLinhaExtra,
  liberarEmissao,
  ligarFatura,
  listarClientesPreFatura,
  montarPreFatura,
  reincluirLinha,
  reservarEmissao,
  type AjusteRow,
  type ClientePreFatura,
  type ItemRow,
  type PreFaturaRow,
} from '../lib/billing/preFaturaStore';

const LABEL = 'text-[10px] font-black text-gray-500 uppercase mb-1 block tracking-wider';
const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500';

function hojeBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function horaBrasilia(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(data);
}

const PreFaturaMensal: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const [clientes, setClientes] = useState<ClientePreFatura[]>([]);
  const [clientId, setClientId] = useState('');
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [fatura, setFatura] = useState<PreFaturaRow | null>(null);
  const [itens, setItens] = useState<ItemRow[]>([]);
  const [ajustes, setAjustes] = useState<AjusteRow[]>([]);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [ajusteItem, setAjusteItem] = useState<ItemRow | null>(null);
  const [ajusteValor, setAjusteValor] = useState('');
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [ajusteTipo, setAjusteTipo] = useState('PROPORCIONAL');
  const [extraTipo, setExtraTipo] = useState<Exclude<TipoLinhaPreFatura, 'SERVICO'>>('EXTRAORDINARIO');
  const [extraDescricao, setExtraDescricao] = useState('');
  const [extraValor, setExtraValor] = useState('');
  const [extraMotivo, setExtraMotivo] = useState('');
  const [mostrarGerar, setMostrarGerar] = useState(false);
  const [vencimento, setVencimento] = useState('');
  const [email, setEmail] = useState('');
  const [linhaHistorico, setLinhaHistorico] = useState<string | null>(null);

  const cliente = clientes.find((c) => String(c.id) === clientId) || null;
  const editavel = fatura ? podeEditar(fatura.status) : false;
  const totais = useMemo(() => totaisDaPreFatura(itens.map((item) => ({
    contractualAmount: Number(item.contractual_amount) || 0,
    invoicedAmount: Number(item.invoiced_amount) || 0,
    excluded: item.excluded === true,
  }))), [itens]);

  useEffect(() => {
    void listarClientesPreFatura().then(setClientes).catch((e) => {
      setAviso(e instanceof Error ? e.message : 'Não foi possível listar os clientes.');
    });
  }, []);

  const aplicarPacote = (pacote: { fatura: PreFaturaRow; itens: ItemRow[]; ajustes: AjusteRow[] }) => {
    setFatura(pacote.fatura);
    setItens(pacote.itens);
    setAjustes(pacote.ajustes);
  };

  const montar = async () => {
    if (!clientId) { setAviso('Selecione o cliente.'); return; }
    setOcupado(true);
    setAviso('');
    setFatura(null);
    try {
      aplicarPacote(await montarPreFatura(clientId, competencia));
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível montar a pré-fatura.');
    } finally {
      setOcupado(false);
    }
  };

  const recarregar = async (id: string) => {
    aplicarPacote(await carregarPreFatura(id));
  };

  const numero = (texto: string) => lerValorMonetario(texto);

  const confirmarAjuste = async () => {
    if (!ajusteItem) return;
    setOcupado(true);
    setAviso('');
    try {
      await ajustarValorLinha(ajusteItem.id, numero(ajusteValor), ajusteMotivo, ajusteTipo);
      setAjusteItem(null);
      if (fatura) await recarregar(fatura.id);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível ajustar.');
    } finally {
      setOcupado(false);
    }
  };

  const confirmarExtra = async () => {
    if (!fatura) return;
    setOcupado(true);
    setAviso('');
    try {
      await incluirLinhaExtra(fatura.id, {
        tipo: extraTipo,
        description: extraDescricao,
        valor: numero(extraValor),
        motivo: extraMotivo,
      });
      setExtraDescricao('');
      setExtraValor('');
      setExtraMotivo('');
      await recarregar(fatura.id);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível incluir a linha.');
    } finally {
      setOcupado(false);
    }
  };

  const pedirMotivo = async (acao: (motivo: string) => Promise<void>) => {
    const motivo = window.prompt('Justificativa') || '';
    if (!motivo.trim()) return;
    setOcupado(true);
    setAviso('');
    try {
      await acao(motivo);
      if (fatura) await recarregar(fatura.id);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  };

  const aprovar = async () => {
    if (!fatura) return;
    if (!window.confirm(`Aprovar a pré-fatura de ${nomeCompetencia(competencia)} no valor de R$ ${formatarMoeda(totais.faturar)}? A edição trava. O boleto não é emitido neste clique.`)) return;
    setOcupado(true);
    setAviso('');
    try {
      const atualizada = await aprovarPreFatura(fatura.id);
      setFatura(atualizada);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível aprovar.');
    } finally {
      setOcupado(false);
    }
  };

  const baixarPdf = () => {
    if (!fatura || !cliente) return;
    const emissor = dadosEmissorPadrao();
    const bytes = gerarPdfPreFatura({
      rascunho: fatura.status === 'RASCUNHO',
      competencia: String(fatura.competence).trim(),
      emissorNome: emissor.nome,
      emissorCnpj: emissor.cnpj,
      clienteFantasia: cliente.trading_name || cliente.name,
      clienteRazao: cliente.name,
      clienteCnpj: cliente.cnpj || '',
      clienteEndereco: enderecoCliente(cliente),
      clienteTelefone: cliente.phone || '',
      clienteEmail: cliente.medicao_email || cliente.email || '',
      linhas: itens.map((item) => ({
        itemKind: item.item_kind,
        billingReference: item.billing_reference,
        shortName: item.short_name,
        description: item.description,
        serviceStartDate: item.service_start_date,
        contractualAmount: Number(item.contractual_amount) || 0,
        calculatedAmount: Number(item.calculated_amount) || 0,
        invoicedAmount: Number(item.invoiced_amount) || 0,
        excluded: item.excluded === true,
        sortOrder: Number(item.sort_order) || 0,
      })),
    });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Pre-fatura ${cliente.trading_name || cliente.name} ${String(fatura.competence).trim()}${fatura.status === 'RASCUNHO' ? ' rascunho' : ''}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const abrirGerar = () => {
    if (!cliente || !fatura) return;
    const bloqueio = bloqueioCadastroFiscal(cliente);
    if (bloqueio) { setAviso(bloqueio); return; }
    setVencimento(vencimentoSugerido(cliente, hojeBrasilia()));
    const lista = String(cliente.medicao_email || cliente.email || '').split(',').map((e) => e.trim()).filter(Boolean);
    setEmail(lista[0] || '');
    setMostrarGerar(true);
  };

  const gerarFatura = async () => {
    if (!cliente || !fatura) return;
    if (!email.includes('@')) { setAviso('Informe o e-mail do financeiro.'); return; }
    setOcupado(true);
    setAviso('');
    let ref = '';
    try {
      ref = await reservarEmissao(fatura.id);
      const corpo = corpoCobrancaPreFatura({
        cliente,
        total: totais.faturar,
        competencia: String(fatura.competence).trim(),
        vencimento,
        email,
        rastreio: ref,
      });
      const res = await authFetch('/api/asaas/create-charge', {
        method: 'POST',
        body: JSON.stringify(corpo),
      });
      const data = await res.json().catch(() => ({}));
      const invoiceId = data?.persisted?.invoiceId ? String(data.persisted.invoiceId) : '';
      if ((!res.ok && res.status !== 207) || !invoiceId) {
        const cobrancaCriada = Boolean(data?.payment?.id || data?.paymentId);
        if (!cobrancaCriada) await liberarEmissao(fatura.id, ref);
        throw new Error(data?.error || `Cobrança pode ter sido criada. Ref. ${ref}. Confira o Controle de Faturas antes de emitir de novo.`);
      }
      await ligarFatura(fatura.id, invoiceId);
      setMostrarGerar(false);
      if (onNavigate) onNavigate('fin-invoices');
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível gerar a fatura.');
      if (fatura) {
        try { await recarregar(fatura.id); } catch { /* mantém o aviso */ }
      }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="tela-pre-fatura">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide text-gray-800">Pré-fatura</h1>
        <p className="text-sm text-gray-500">Mensalidade do cliente. O boletim de medição continua só com as viagens.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <label className="block md:col-span-2">
          <span className={LABEL}>Cliente</span>
          <select className={INPUT} data-testid="select-cliente-pre-fatura" value={clientId} onChange={(e) => { setClientId(e.target.value); setFatura(null); }}>
            <option value="">Selecione</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.trading_name || c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Competência</span>
          <input type="month" className={INPUT} data-testid="input-competencia" value={competencia} onChange={(e) => { setCompetencia(e.target.value); setFatura(null); }} />
        </label>
        <button type="button" data-testid="button-montar-pre-fatura" disabled={ocupado} onClick={() => void montar()} className="px-3 py-2 bg-black text-white rounded-lg text-xs font-bold uppercase">
          {ocupado ? 'Aguarde' : 'Montar'}
        </button>
      </div>

      {aviso && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="aviso-pre-fatura">{aviso}</p>}

      {fatura && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">{nomeCompetencia(String(fatura.competence).trim())} · cobrança {colunaCobranca(String(fatura.competence).trim())}</p>
              <p className="font-black text-gray-800" data-testid="status-pre-fatura">{fatura.status}{fatura.approved_by ? ` · ${fatura.approved_by}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="button-pdf-pre-fatura" onClick={baixarPdf} className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold uppercase inline-flex items-center gap-2"><FileText size={14} /> {fatura.status === 'RASCUNHO' ? 'Ver PDF' : 'Baixar PDF'}</button>
              {podeAprovar(fatura.status) && <button type="button" data-testid="button-aprovar-pre-fatura" disabled={ocupado} onClick={() => void aprovar()} className="px-3 py-2 bg-red-700 text-white rounded-lg text-xs font-bold uppercase">Aprovar pré-fatura</button>}
              {podeGerarFatura(fatura.status, fatura.financial_invoice_id, fatura.emission_ref) && <button type="button" data-testid="button-gerar-fatura-pre" disabled={ocupado} onClick={abrirGerar} className="px-3 py-2 bg-black text-white rounded-lg text-xs font-bold uppercase">Gerar fatura</button>}
              {fatura.status === 'FATURADA' && <button type="button" onClick={() => onNavigate?.('fin-invoices')} className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold uppercase">Abrir controle de faturas</button>}
              {podeCancelar(fatura.status) && <button type="button" onClick={() => void pedirMotivo((motivo) => cancelarPreFatura(fatura.id, motivo))} className="px-3 py-2 text-xs font-bold uppercase text-gray-500">Cancelar</button>}
            </div>
          </div>
          {fatura.emission_ref && fatura.status === 'APROVADA' && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Emissão iniciada, ref. {fatura.emission_ref}. Confira o Controle de Faturas antes de tentar de novo.</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b">
                  <th className="py-2 pr-2">Cobrança</th>
                  <th className="py-2 pr-2">Descrição</th>
                  <th className="py-2 pr-2 text-right">Valor mensal</th>
                  <th className="py-2 pr-2 text-right">Calculado</th>
                  <th className="py-2 pr-2 text-right">A faturar</th>
                  <th className="py-2 pr-2 text-right">Diferença</th>
                  <th className="py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => {
                  const linha = {
                    contractualAmount: Number(item.contractual_amount) || 0,
                    invoicedAmount: Number(item.invoiced_amount) || 0,
                    excluded: item.excluded === true,
                  };
                  return (
                    <tr key={item.id} className={`border-b border-gray-100 ${item.excluded ? 'opacity-50' : ''}`} data-testid={`linha-pre-fatura-${item.id}`}>
                      <td className="py-2 pr-2">{item.billing_reference}</td>
                      <td className="py-2 pr-2">
                        <div className="text-[10px] uppercase text-gray-400">{ROTULO_TIPO_LINHA[item.item_kind]}{item.excluded ? ' · excluída' : ''}</div>
                        {item.description}
                      </td>
                      <td className="py-2 pr-2 text-right font-mono">R$ {formatarMoeda(linha.contractualAmount)}</td>
                      <td className="py-2 pr-2 text-right font-mono">R$ {formatarMoeda(Number(item.calculated_amount) || 0)}</td>
                      <td className="py-2 pr-2 text-right font-mono">R$ {formatarMoeda(linha.invoicedAmount)}</td>
                      <td className="py-2 pr-2 text-right font-mono">R$ {formatarMoeda(diferencaLinha(linha))}</td>
                      <td className="py-2 whitespace-nowrap">
                        <button type="button" className="text-xs font-bold uppercase text-gray-600 mr-2" onClick={() => setLinhaHistorico(linhaHistorico === item.id ? null : item.id)}>Histórico</button>
                        {editavel && !item.excluded && <button type="button" className="text-xs font-bold uppercase text-blue-700 mr-2" onClick={() => { setAjusteItem(item); setAjusteValor(''); setAjusteMotivo(''); setAjusteTipo(item.item_kind === 'DESCONTO' ? 'DESCONTO' : 'PROPORCIONAL'); }}>Alterar valor</button>}
                        {editavel && !item.excluded && <button type="button" className="text-xs font-bold uppercase text-red-700 mr-2" onClick={() => void pedirMotivo((motivo) => excluirLinha(item.id, motivo))}>Excluir</button>}
                        {editavel && item.excluded && <button type="button" className="text-xs font-bold uppercase text-blue-700" onClick={() => void pedirMotivo((motivo) => reincluirLinha(item.id, motivo))}>Reincluir</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-black">
                  <td colSpan={4} className="py-3">Total</td>
                  <td className="py-3 text-right font-mono" data-testid="total-pre-fatura">R$ {formatarMoeda(totais.faturar)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {linhaHistorico && (
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Histórico da linha</p>
              {ajustes.filter((a) => a.item_id === linhaHistorico).map((a) => (
                <p key={a.id} className="text-xs text-gray-700 mb-1">
                  {horaBrasilia(a.created_at)} · {a.user_name} · {a.adjustment_kind} · R$ {formatarMoeda(Number(a.previous_amount))} para R$ {formatarMoeda(Number(a.new_amount))} · {a.reason}
                </p>
              ))}
              {ajustes.filter((a) => a.item_id === linhaHistorico).length === 0 && <p className="text-xs text-gray-400">Sem ajuste nesta linha.</p>}
            </div>
          )}

          {editavel && ajusteItem && (
            <div className="border border-gray-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <label className="block"><span className={LABEL}>Tipo do ajuste</span>
                <select className={INPUT} value={ajusteTipo} onChange={(e) => setAjusteTipo(e.target.value)}>
                  <option value="PROPORCIONAL">Proporcional</option>
                  <option value="DESCONTO">Desconto</option>
                  <option value="AJUSTE">Ajuste</option>
                </select>
              </label>
              <label className="block"><span className={LABEL}>{ajusteItem.item_kind === 'DESCONTO' ? 'Valor do desconto' : 'Valor a faturar'}</span>
                <input className={INPUT} data-testid="input-valor-ajuste" value={ajusteValor} onChange={(e) => setAjusteValor(e.target.value)} />
              </label>
              <label className="block md:col-span-2"><span className={LABEL}>Justificativa</span>
                <input className={INPUT} data-testid="input-motivo-ajuste" value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)} />
              </label>
              <button type="button" data-testid="button-confirmar-ajuste" disabled={ocupado} onClick={() => void confirmarAjuste()} className="px-3 py-2 bg-red-700 text-white rounded-lg text-xs font-bold uppercase">Gravar ajuste</button>
            </div>
          )}

          {editavel && (
            <div className="border border-dashed border-gray-300 rounded-lg p-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <label className="block"><span className={LABEL}>Incluir linha</span>
                <select className={INPUT} value={extraTipo} onChange={(e) => setExtraTipo(e.target.value as Exclude<TipoLinhaPreFatura, 'SERVICO'>)}>
                  <option value="EXTRAORDINARIO">Extraordinário</option>
                  <option value="REEMBOLSO">Reembolso</option>
                  <option value="DESCONTO">Desconto</option>
                  <option value="COMPLEMENTAR">Complementar</option>
                </select>
              </label>
              <label className="block md:col-span-2"><span className={LABEL}>Descrição</span>
                <input className={INPUT} value={extraDescricao} onChange={(e) => setExtraDescricao(e.target.value)} />
              </label>
              <label className="block"><span className={LABEL}>Valor</span>
                <input className={INPUT} value={extraValor} onChange={(e) => setExtraValor(e.target.value)} />
              </label>
              <label className="block md:col-span-3"><span className={LABEL}>Justificativa</span>
                <input className={INPUT} value={extraMotivo} onChange={(e) => setExtraMotivo(e.target.value)} />
              </label>
              <button type="button" data-testid="button-incluir-linha" disabled={ocupado} onClick={() => void confirmarExtra()} className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold uppercase">Incluir</button>
            </div>
          )}
        </div>
      )}

      {mostrarGerar && cliente && fatura && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3" data-testid="painel-gerar-fatura">
          <h2 className="font-black text-xs uppercase tracking-widest text-gray-700">Gerar fatura</h2>
          <p className="text-sm text-gray-600">Valor travado em R$ {formatarMoeda(totais.faturar)}. Este clique usa a emissão que já existe. A nota segue o Controle.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block"><span className={LABEL}>Vencimento</span><input type="date" className={INPUT} data-testid="input-vencimento-pre-fatura" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></label>
            <label className="block"><span className={LABEL}>E-mail</span><input className={INPUT} data-testid="input-email-pre-fatura" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          </div>
          <p className="text-xs text-gray-500">Vencimento em {formatarDataIso(vencimento) || '—'}. {ocupado && <Loader2 size={12} className="inline animate-spin" />}</p>
          <div className="flex gap-2">
            <button type="button" data-testid="button-confirmar-gerar-fatura" disabled={ocupado} onClick={() => void gerarFatura()} className="px-3 py-2 bg-black text-white rounded-lg text-xs font-bold uppercase">Confirmar emissão</button>
            <button type="button" onClick={() => setMostrarGerar(false)} className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold uppercase">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreFaturaMensal;
