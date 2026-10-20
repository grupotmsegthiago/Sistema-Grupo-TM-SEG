import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock, Copy, Loader2, MessageSquare, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/supabasePaging';
import { buildActivationOffers, rankOffers, type RankingProviderInput, type RankingTableInput } from '../lib/providerActivationRanking';
import {
  erroTabelaAusente,
  lerSolicitacao,
  linkGrupoOperador,
  montarLiberacoes,
  podeAbrirWhatsapp,
  statusAposConfirmacao,
  textoEspera,
  textoSolicitacaoEscolta,
  type LeituraSolicitacao,
} from '../lib/solicitacaoEscolta/regras';
import { gravarPrefillSolicitacao, horarioParaOs } from '../lib/solicitacaoEscolta/prefill';

interface Props {
  onClose: () => void;
  onAbrirOs: () => void;
}

interface SolicitacaoRow {
  id: string;
  mensagem: string;
  origem: string;
  destino: string;
  cidade: string | null;
  uf: string | null;
  imediata: boolean;
  data_servico: string | null;
  hora_servico: string | null;
  status: 'em_andamento' | 'confirmada' | 'cancelada';
  fornecedor_confirmado_nome: string | null;
  confirmado_por: string | null;
  criado_por: string | null;
  created_at: string;
}

interface AlvoRow {
  id: string;
  solicitacao_id: string;
  provider_id: string | null;
  provider_nome: string;
  custo_100km: number | null;
  ordem: number;
  grupo_link: string | null;
  liberar_em: string;
  aberto_em: string | null;
  aberto_por: string | null;
  status: 'na_fila' | 'aberto' | 'bloqueado' | 'confirmado';
}

interface FornecedorLista {
  id: string;
  nome: string;
  custo: number;
  link: string | null;
  uf: string;
}

function nomeOperador(): string {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    return String(user.name || user.full_name || 'Operador');
  } catch {
    return 'Operador';
  }
}

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const SolicitacaoEscoltaModal: React.FC<Props> = ({ onClose, onAbrirOs }) => {
  const [mensagem, setMensagem] = useState('');
  const [leitura, setLeitura] = useState<LeituraSolicitacao | null>(null);
  const [imediata, setImediata] = useState<boolean | null>(null);
  const [fornecedores, setFornecedores] = useState<FornecedorLista[]>([]);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [avisoLista, setAvisoLista] = useState('');
  const [tabelaAusente, setTabelaAusente] = useState(false);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoRow[]>([]);
  const [alvos, setAlvos] = useState<AlvoRow[]>([]);
  const [agora, setAgora] = useState(() => Date.now());
  const [acaoId, setAcaoId] = useState('');

  const recarregar = useCallback(async () => {
    const cabecas = await supabase
      .from('escolta_solicitacoes')
      .select('*')
      .in('status', ['em_andamento', 'confirmada'])
      .order('created_at', { ascending: false })
      .limit(40);
    if (cabecas.error) {
      if (erroTabelaAusente(cabecas.error)) setTabelaAusente(true);
      return;
    }
    setTabelaAusente(false);
    const rows = (cabecas.data || []) as SolicitacaoRow[];
    setSolicitacoes(rows);
    if (rows.length === 0) {
      setAlvos([]);
      return;
    }
    const filhos = await supabase
      .from('escolta_solicitacao_alvos')
      .select('*')
      .in('solicitacao_id', rows.map((row) => row.id))
      .order('ordem', { ascending: true });
    if (!filhos.error) setAlvos((filhos.data || []) as AlvoRow[]);
  }, []);

  useEffect(() => {
    void recarregar();
    const canal = supabase
      .channel('escolta-solicitacao-ao-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escolta_solicitacoes' }, () => { void recarregar(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escolta_solicitacao_alvos' }, () => { void recarregar(); })
      .subscribe();
    const relogio = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      window.clearInterval(relogio);
      void supabase.removeChannel(canal);
    };
  }, [recarregar]);

  const buscarFornecedores = async (uf: string) => {
    setCarregandoLista(true);
    setErro('');
    setAvisoLista('');
    setFornecedores([]);
    try {
      const selectProvedor = 'id,name,trading_name,city,state,status,phone,contact_name,auto_calc_enabled,auto_base_value,auto_base_km,auto_region,operating_coverage,whatsapp_group_link,whatsapp_group_id';
      let linkColuna = true;
      const provedores = await fetchAllPages<RankingProviderInput & { whatsapp_group_link?: string | null; whatsapp_group_id?: string | null }>(
        (from, size) => supabase.from('providers').select(linkColuna ? selectProvedor : selectProvedor.replace(',whatsapp_group_link', '')).order('id').range(from, from + size - 1) as Promise<{ data: any; error: unknown }>,
        1000,
        20000,
      ).catch(async (falha: unknown) => {
        const msg = falha instanceof Error ? falha.message : String(falha);
        if (/whatsapp_group_link/i.test(msg)) {
          linkColuna = false;
          setAvisoLista('O link do grupo ainda não está na tabela de fornecedores. A mensagem será copiada, e o WhatsApp só abre depois que o link for cadastrado.');
          return fetchAllPages<RankingProviderInput & { whatsapp_group_link?: string | null }>(
            (from, size) => supabase.from('providers').select(selectProvedor.replace(',whatsapp_group_link', '')).order('id').range(from, from + size - 1) as Promise<{ data: any; error: unknown }>,
            1000,
            20000,
          );
        }
        throw falha;
      });
      if (provedores.truncated) {
        setAvisoLista('A lista de fornecedores não veio completa. A fila não foi montada.');
        return;
      }
      const tabelas = await fetchAllPages<RankingTableInput>(
        (from, size) => supabase.from('provider_cost_tables').select('provider,operation_type,activation_cost,franchise_km').order('provider').range(from, from + size - 1) as Promise<{ data: any; error: unknown }>,
        1000,
        20000,
      );
      if (tabelas.truncated) {
        setAvisoLista('As tabelas de custo não vieram completas. A fila não foi montada.');
        return;
      }
      const ofertas = buildActivationOffers(provedores.rows, tabelas.rows).filter((oferta) => oferta.marketUf === uf);
      const ordem = rankOffers(ofertas, uf);
      const porId = new Map(provedores.rows.map((row) => [String(row.id || ''), row]));
      const lista: FornecedorLista[] = ordem.map((oferta) => {
        const cadastro = oferta.providerId ? porId.get(String(oferta.providerId)) : undefined;
        return {
          id: String(oferta.providerId || oferta.provider),
          nome: oferta.provider,
          custo: oferta.cost,
          link: linkGrupoOperador(cadastro?.whatsapp_group_link || null),
          uf,
        };
      });
      setFornecedores(lista);
      setMarcados(lista.map((item) => item.id));
      if (lista.length === 0) setAvisoLista(`Nenhum fornecedor com valor de 100 km na UF ${uf}.`);
    } catch (falha: any) {
      setErro(falha?.message || 'Não foi possível ler os fornecedores.');
    } finally {
      setCarregandoLista(false);
    }
  };

  const ler = () => {
    const lida = lerSolicitacao(mensagem);
    setLeitura(lida);
    setImediata(lida.imediata);
    setFornecedores([]);
    setMarcados([]);
    if (!lida.uf) {
      setErro('Não encontrei a UF da origem. Ajuste a origem, por exemplo Rio de Janeiro - RJ.');
      return;
    }
    setErro('');
    void buscarFornecedores(lida.uf);
  };

  const selecionados = useMemo(
    () => fornecedores.filter((item) => marcados.includes(item.id)),
    [fornecedores, marcados],
  );
  const liberacoesPrevistas = useMemo(
    () => (imediata == null ? [] : montarLiberacoes(selecionados.length, imediata, 0)),
    [selecionados.length, imediata],
  );

  const preparar = async () => {
    if (!leitura || imediata == null) {
      setErro('Diga se a solicitação é imediata ou agendada.');
      return;
    }
    if (!leitura.origem.trim() || !leitura.destino.trim()) {
      setErro('Origem e destino precisam estar preenchidos.');
      return;
    }
    if (selecionados.length === 0) {
      setErro('Marque ao menos um fornecedor.');
      return;
    }
    setSalvando(true);
    setErro('');
    const inicio = new Date();
    const horarios = montarLiberacoes(selecionados.length, imediata, inicio.getTime());
    const { data, error } = await supabase.from('escolta_solicitacoes').insert([{
      mensagem: mensagem.trim(),
      origem: leitura.origem.trim(),
      destino: leitura.destino.trim(),
      cidade: leitura.cidade || null,
      uf: leitura.uf || null,
      imediata,
      data_servico: leitura.data,
      hora_servico: leitura.hora,
      status: 'em_andamento',
      criado_por: nomeOperador(),
    }]).select('id').single();
    if (error || !data?.id) {
      setSalvando(false);
      if (erroTabelaAusente(error)) setTabelaAusente(true);
      setErro(error?.message || 'Não foi possível gravar a solicitação.');
      return;
    }
    const filhos = selecionados.map((item, ordem) => ({
      solicitacao_id: data.id,
      provider_id: item.id,
      provider_nome: item.nome,
      custo_100km: item.custo,
      ordem,
      grupo_link: item.link,
      liberar_em: new Date(horarios[ordem]).toISOString(),
      status: 'na_fila',
    }));
    const gravados = await supabase.from('escolta_solicitacao_alvos').insert(filhos);
    if (gravados.error) {
      await supabase.from('escolta_solicitacoes').delete().eq('id', data.id);
      setSalvando(false);
      setErro(gravados.error.message);
      return;
    }
    setMensagem('');
    setLeitura(null);
    setFornecedores([]);
    setMarcados([]);
    setSalvando(false);
    await recarregar();
  };

  const abrirWhatsapp = async (solicitacao: SolicitacaoRow, alvo: AlvoRow) => {
    if (!podeAbrirWhatsapp(alvo.status, new Date(alvo.liberar_em).getTime(), Date.now(), solicitacao.status)) return;
    const texto = textoSolicitacaoEscolta({
      origem: solicitacao.origem,
      destino: solicitacao.destino,
      imediata: solicitacao.imediata,
      data: solicitacao.data_servico,
      hora: solicitacao.hora_servico,
    });
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      setErro('O navegador não deixou copiar a mensagem.');
      return;
    }
    setAcaoId(alvo.id);
    await supabase.from('escolta_solicitacao_alvos').update({
      status: 'aberto',
      aberto_em: new Date().toISOString(),
      aberto_por: nomeOperador(),
    }).eq('id', alvo.id).in('status', ['na_fila', 'aberto']);
    setAcaoId('');
    const link = linkGrupoOperador(alvo.grupo_link);
    if (!link) {
      setErro(`Mensagem de ${alvo.provider_nome} copiada. Cadastre o link chat.whatsapp.com no fornecedor para abrir o grupo.`);
      await recarregar();
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
    await recarregar();
  };

  const confirmar = async (solicitacao: SolicitacaoRow, alvo: AlvoRow) => {
    if (solicitacao.status !== 'em_andamento') return;
    setAcaoId(alvo.id);
    setErro('');
    const agoraIso = new Date().toISOString();
    const trava = await supabase.from('escolta_solicitacoes').update({
      status: 'confirmada',
      fornecedor_confirmado_id: alvo.provider_id,
      fornecedor_confirmado_nome: alvo.provider_nome,
      confirmado_por: nomeOperador(),
      confirmado_em: agoraIso,
      updated_at: agoraIso,
    }).eq('id', solicitacao.id).eq('status', 'em_andamento').select('id');
    if (trava.error || !trava.data?.length) {
      setAcaoId('');
      setErro(trava.error?.message || 'Outro operador já confirmou esta solicitação.');
      await recarregar();
      return;
    }
    await supabase.from('escolta_solicitacao_alvos').update({
      status: statusAposConfirmacao(false),
    }).eq('solicitacao_id', solicitacao.id).neq('id', alvo.id);
    await supabase.from('escolta_solicitacao_alvos').update({
      status: statusAposConfirmacao(true),
    }).eq('id', alvo.id);
    const horario = horarioParaOs(solicitacao.imediata, solicitacao.data_servico, solicitacao.hora_servico);
    gravarPrefillSolicitacao({
      solicitacaoId: solicitacao.id,
      provider: alvo.provider_nome,
      origin: solicitacao.origem,
      destination: solicitacao.destino,
      imediata: solicitacao.imediata,
      scheduledDate: horario.scheduledDate,
      scheduledTime: horario.scheduledTime,
    });
    setAcaoId('');
    onAbrirOs();
  };

  const cancelar = async (solicitacao: SolicitacaoRow) => {
    const agoraIso = new Date().toISOString();
    const trava = await supabase.from('escolta_solicitacoes').update({
      status: 'cancelada',
      updated_at: agoraIso,
    }).eq('id', solicitacao.id).eq('status', 'em_andamento').select('id');
    if (!trava.error && trava.data?.length) {
      await supabase.from('escolta_solicitacao_alvos').update({ status: 'bloqueado' }).eq('solicitacao_id', solicitacao.id).neq('status', 'confirmado');
    }
    await recarregar();
  };

  const abrirOsConfirmada = (solicitacao: SolicitacaoRow) => {
    if (!solicitacao.fornecedor_confirmado_nome) return;
    const horario = horarioParaOs(solicitacao.imediata, solicitacao.data_servico, solicitacao.hora_servico);
    gravarPrefillSolicitacao({
      solicitacaoId: solicitacao.id,
      provider: solicitacao.fornecedor_confirmado_nome,
      origin: solicitacao.origem,
      destination: solicitacao.destino,
      imediata: solicitacao.imediata,
      scheduledDate: horario.scheduledDate,
      scheduledTime: horario.scheduledTime,
    });
    onAbrirOs();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" data-testid="modal-solicitacao-escolta">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-700 p-2 text-white"><MessageSquare size={16} /></div>
            <div>
              <h2 className="text-sm font-black uppercase text-gray-900">Solicitação de escolta</h2>
              <p className="text-[10px] font-bold text-gray-400">A mensagem abre no WhatsApp de quem clica. Ela não sai sozinha.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-200" data-testid="button-fechar-solicitacao-escolta"><X size={18} /></button>
        </div>

        <div className="grid flex-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4 border-b border-gray-100 p-5 md:border-b-0 md:border-r">
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Mensagem do cliente</label>
            <textarea
              className="h-36 w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 outline-none focus:border-green-600"
              placeholder={'Origem: Rio de Janeiro - RJ\nDestino: São Paulo - SP\nData: 21/10/2026\nHorário: 08:00\nAgendada'}
              value={mensagem}
              onChange={(evento) => setMensagem(evento.target.value)}
              data-testid="input-mensagem-solicitacao"
            />
            <button type="button" onClick={ler} disabled={!mensagem.trim() || carregandoLista} className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-40" data-testid="button-ler-solicitacao">
              {carregandoLista ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Ler solicitação
            </button>

            {leitura && (
              <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                <label className="block text-[10px] font-black uppercase text-gray-500">Origem</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={leitura.origem} onChange={(evento) => setLeitura({ ...leitura, origem: evento.target.value })} data-testid="input-origem-solicitacao" />
                <label className="block text-[10px] font-black uppercase text-gray-500">Destino</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={leitura.destino} onChange={(evento) => setLeitura({ ...leitura, destino: evento.target.value })} data-testid="input-destino-solicitacao" />
                <p className="text-[11px] font-bold text-gray-600">UF da fila: {leitura.uf || 'não lida'}{leitura.cidade ? ` · ${leitura.cidade}` : ''}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setImediata(true)} className={`rounded-lg border px-3 py-2 text-[11px] font-black uppercase ${imediata === true ? 'border-red-700 bg-red-700 text-white' : 'border-gray-200 text-gray-600'}`} data-testid="button-tipo-imediata">Imediata</button>
                  <button type="button" onClick={() => setImediata(false)} className={`rounded-lg border px-3 py-2 text-[11px] font-black uppercase ${imediata === false ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-200 text-gray-600'}`} data-testid="button-tipo-agendada">Agendada</button>
                </div>
                {imediata === null && <p className="text-[11px] font-bold text-amber-700">A mensagem não diz se é imediata ou agendada. Escolha antes de preparar.</p>}
              </div>
            )}

            {fornecedores.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase text-gray-500">Fornecedores, do mais barato ao mais caro</p>
                  <button type="button" className="text-[10px] font-black uppercase text-green-700" onClick={() => setMarcados(marcados.length === fornecedores.length ? [] : fornecedores.map((item) => item.id))} data-testid="button-selecionar-todos-fornecedores">
                    {marcados.length === fornecedores.length ? 'Limpar' : 'Selecionar todos'}
                  </button>
                </div>
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {fornecedores.map((item, indice) => {
                    const previsto = liberacoesPrevistas[selecionados.findIndex((sel) => sel.id === item.id)];
                    return (
                      <li key={item.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-2 text-xs">
                        <input type="checkbox" checked={marcados.includes(item.id)} onChange={() => setMarcados((atual) => atual.includes(item.id) ? atual.filter((id) => id !== item.id) : [...atual, item.id])} data-testid={`check-fornecedor-${indice}`} />
                        <span className="flex-1 font-bold text-gray-800">{item.nome}</span>
                        <span className="font-mono text-[10px] text-gray-500">{moeda(item.custo)}</span>
                        <span className="text-[10px] font-bold text-gray-400">{item.link ? 'link ok' : 'sem link'}</span>
                        {imediata === false && previsto != null && marcados.includes(item.id) && (
                          <span className="text-[10px] font-bold text-blue-700">{textoEspera(previsto, 0) === '00:00' ? 'agora' : textoEspera(previsto, 0)}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={() => void preparar()} disabled={salvando || imediata == null} className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-40" data-testid="button-preparar-encaminhamento">
                  {salvando ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Preparar encaminhamento
                </button>
              </div>
            )}
            {avisoLista && <p className="text-[11px] font-bold text-amber-700">{avisoLista}</p>}
            {erro && <p className="text-[11px] font-bold text-red-600" data-testid="text-erro-solicitacao">{erro}</p>}
          </div>

          <div className="space-y-3 bg-slate-50 p-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ao vivo para todos os operadores</p>
            {tabelaAusente && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] font-bold text-amber-800" data-testid="text-tabela-ausente">
                A tabela da solicitação ainda não existe neste banco. O arquivo é migrations/2026_10_20_escolta_solicitacao.sql, no projeto ajhmmjuewdsukecaimik.
              </p>
            )}
            {solicitacoes.length === 0 && !tabelaAusente && <p className="text-xs text-slate-500">Nenhuma solicitação em andamento.</p>}
            {solicitacoes.map((solicitacao) => {
              const filhos = alvos.filter((alvo) => alvo.solicitacao_id === solicitacao.id).sort((a, b) => a.ordem - b.ordem);
              return (
                <article key={solicitacao.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`card-solicitacao-${solicitacao.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-black uppercase text-slate-900">{solicitacao.imediata ? 'Imediata' : 'Agendada'} · {solicitacao.uf || 'UF'}</p>
                      <p className="text-xs text-slate-600">{solicitacao.origem} → {solicitacao.destino}</p>
                      <p className="text-[10px] text-slate-400">{solicitacao.criado_por || 'Operador'} · {solicitacao.status === 'confirmada' ? `Confirmada: ${solicitacao.fornecedor_confirmado_nome}` : 'Em andamento'}</p>
                    </div>
                    {solicitacao.status === 'em_andamento' && (
                      <button type="button" onClick={() => void cancelar(solicitacao)} className="text-[10px] font-bold uppercase text-slate-400 hover:text-red-600">Cancelar</button>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {filhos.map((alvo) => {
                      const liberado = podeAbrirWhatsapp(alvo.status, new Date(alvo.liberar_em).getTime(), agora, solicitacao.status);
                      return (
                        <li key={alvo.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2 py-2 text-[11px]">
                          <span className="min-w-0 flex-1 font-bold text-slate-800">{alvo.ordem + 1}. {alvo.provider_nome}</span>
                          {alvo.status === 'bloqueado' && <span className="font-bold text-slate-400">não recebe</span>}
                          {alvo.status === 'confirmado' && <span className="font-bold text-green-700">confirmado</span>}
                          {alvo.status !== 'bloqueado' && alvo.status !== 'confirmado' && !liberado && (
                            <span className="flex items-center gap-1 font-bold text-blue-700"><Clock size={12} /> {textoEspera(new Date(alvo.liberar_em).getTime(), agora)}</span>
                          )}
                          {liberado && (
                            <button type="button" disabled={acaoId === alvo.id} onClick={() => void abrirWhatsapp(solicitacao, alvo)} className="rounded-md bg-green-700 px-2 py-1 font-black uppercase text-white" data-testid={`button-abrir-whatsapp-${alvo.id}`}>
                              Abrir WhatsApp
                            </button>
                          )}
                          {liberado && (
                            <button type="button" disabled={acaoId === alvo.id} onClick={() => void confirmar(solicitacao, alvo)} className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 font-black uppercase text-white" data-testid={`button-fornecedor-confirmado-${alvo.id}`}>
                              <Check size={12} /> Fornecedor confirmado
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {solicitacao.status === 'confirmada' && (
                    <button type="button" onClick={() => abrirOsConfirmada(solicitacao)} className="text-[11px] font-black uppercase text-orange-700" data-testid={`button-abrir-os-${solicitacao.id}`}>Abrir OS</button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SolicitacaoEscoltaModal;
