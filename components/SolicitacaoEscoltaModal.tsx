import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, Image, Loader2, MessageSquare, Send, X } from 'lucide-react';
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
  textoEsperaPorExtenso,
  textoSolicitacaoEscolta,
  type LeituraSolicitacao,
} from '../lib/solicitacaoEscolta/regras';
import { gravarPrefillSolicitacao, horarioParaOs } from '../lib/solicitacaoEscolta/prefill';
import { lerPrintSolicitacao } from '../lib/solicitacaoEscolta/lerPrint';
import { estadoDoAlvo, planejarDespacho, resumirEnvios, ROTULO_ESTADO, envioAposConfirmacao, type AlvoDesktop, type EstadoEnvio } from '../lib/whatsappDesktop/fila';
import { aplicativoLiberado, consultarAplicativo, enviarComandosLocais, LINK_INSTALADOR } from '../lib/whatsappDesktop/clienteLocal';

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
  desktop_autorizado_em?: string | null;
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
  grupo_nome?: string | null;
  envio_status?: string | null;
  envio_comando_id?: string | null;
  envio_erro?: string | null;
}

interface FornecedorLista {
  id: string;
  nome: string;
  custo: number;
  link: string | null;
  grupoNome: string | null;
  uf: string;
  cidade: string;
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
  const [lendoPrint, setLendoPrint] = useState(false);
  const [aplicativo, setAplicativo] = useState<'verificando' | 'liberado' | 'ausente'>('verificando');

  const verificarAplicativo = useCallback(async () => {
    setAplicativo('verificando');
    const pronto = await aplicativoLiberado();
    setAplicativo(pronto ? 'liberado' : 'ausente');
  }, []);

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
    void verificarAplicativo();
  }, [verificarAplicativo]);

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
      const selectProvedor = 'id,name,trading_name,city,state,status,phone,contact_name,auto_calc_enabled,auto_base_value,auto_base_km,auto_region,operating_coverage,whatsapp_group_link,whatsapp_group_id,whatsapp_desktop_group_name,whatsapp_desktop_vinculo';
      let linkColuna = true;
      const provedores = await fetchAllPages<RankingProviderInput & { whatsapp_group_link?: string | null; whatsapp_group_id?: string | null; whatsapp_desktop_group_name?: string | null; whatsapp_desktop_vinculo?: string | null }>(
        (from, size) => supabase.from('providers').select(linkColuna ? selectProvedor : selectProvedor.replace(',whatsapp_group_link', '').replace(',whatsapp_desktop_group_name', '').replace(',whatsapp_desktop_vinculo', '')).order('id').range(from, from + size - 1) as Promise<{ data: any; error: unknown }>,
        1000,
        20000,
      ).catch(async (falha: unknown) => {
        const msg = falha instanceof Error ? falha.message : String(falha);
        if (/whatsapp_group_link|whatsapp_desktop_group_name|whatsapp_desktop_vinculo/i.test(msg)) {
          linkColuna = false;
          if (/whatsapp_group_link/i.test(msg)) setAvisoLista('O link do grupo ainda não está na tabela de fornecedores. A mensagem será copiada, e o WhatsApp só abre depois que o link for cadastrado.');
          const selectSeguro = selectProvedor.replace(',whatsapp_group_link', '').replace(',whatsapp_desktop_group_name', '').replace(',whatsapp_desktop_vinculo', '');
          return fetchAllPages<RankingProviderInput & { whatsapp_group_link?: string | null }>(
            (from, size) => supabase.from('providers').select(selectSeguro).order('id').range(from, from + size - 1) as Promise<{ data: any; error: unknown }>,
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
          grupoNome: cadastro?.whatsapp_desktop_vinculo === 'desativado' ? null : (cadastro?.whatsapp_desktop_group_name || null),
          uf,
          cidade: oferta.city || '',
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

  const aplicarLeitura = (texto: string) => {
    const lida = lerSolicitacao(texto);
    setMensagem(texto);
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

  const ler = () => aplicarLeitura(mensagem);

  const lerArquivo = async (arquivo: File) => {
    if (!arquivo.type.startsWith('image/')) {
      setErro('O print precisa ser uma imagem.');
      return;
    }
    if (arquivo.size > 4_000_000) {
      setErro('O print passou de 4 MB. Envie uma imagem menor.');
      return;
    }
    setLendoPrint(true);
    setErro('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result || '').split(',')[1] || '');
        leitor.onerror = () => reject(new Error('Não foi possível ler o print.'));
        leitor.readAsDataURL(arquivo);
      });
      const texto = await lerPrintSolicitacao(base64, arquivo.type);
      if (!texto.trim()) {
        setErro('Não consegui ler origem e destino nesse print. Escreva ou cole o texto.');
        return;
      }
      aplicarLeitura(texto);
    } catch (falha: any) {
      setErro(falha?.message || 'Não foi possível ler o print.');
    } finally {
      setLendoPrint(false);
    }
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
      grupo_nome: item.grupoNome,
      liberar_em: new Date(horarios[ordem]).toISOString(),
      status: 'na_fila',
    }));
    let gravados = await supabase.from('escolta_solicitacao_alvos').insert(filhos);
    if (gravados.error && /grupo_nome/i.test(gravados.error.message || '')) {
      gravados = await supabase.from('escolta_solicitacao_alvos').insert(filhos.map(({ grupo_nome, ...resto }) => resto));
    }
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

  const paraDesktop = (alvo: AlvoRow): AlvoDesktop => ({
    id: alvo.id,
    status: alvo.status,
    ordem: alvo.ordem,
    providerNome: alvo.provider_nome,
    liberarEmMs: new Date(alvo.liberar_em).getTime(),
    grupoNome: alvo.grupo_nome || null,
    envioStatus: alvo.envio_status || null,
    envioComandoId: alvo.envio_comando_id || null,
  });

  const autorizarDesktop = async (solicitacao: SolicitacaoRow) => {
    if (solicitacao.status !== 'em_andamento') return;
    setAcaoId(solicitacao.id);
    setErro('');
    const marca = await supabase.from('escolta_solicitacoes').update({
      desktop_autorizado_em: new Date().toISOString(),
      desktop_autorizado_por: nomeOperador(),
      updated_at: new Date().toISOString(),
    }).eq('id', solicitacao.id).eq('status', 'em_andamento');
    if (marca.error) {
      setAcaoId('');
      setErro(erroTabelaAusente(marca.error)
        ? 'A fila ainda não existe. Arquivo: migrations/2026_10_20_escolta_solicitacao.sql'
        : 'A autorização no computador precisa da migration migrations/2026_10_20_whatsapp_desktop.sql. Nenhum envio foi marcado.');
      return;
    }
    const filhos = alvos.filter((alvo) => alvo.solicitacao_id === solicitacao.id);
    const aplicativo = await consultarAplicativo();
    const texto = textoSolicitacaoEscolta({
      origem: solicitacao.origem,
      destino: solicitacao.destino,
      imediata: solicitacao.imediata,
      data: solicitacao.data_servico,
      hora: solicitacao.hora_servico,
    });
    const plano = planejarDespacho({
      solicitacaoStatus: solicitacao.status,
      autorizado: true,
      aplicativoConectado: aplicativo.conectado && aplicativo.pareado && !aplicativo.pausado,
      agoraMs: Date.now(),
      texto,
      alvos: filhos.map(paraDesktop),
    });
    if (plano.pendentesSemAplicativo.length > 0) {
      setErro('O computador está sem o aplicativo. A fila ficou pendente e nenhuma mensagem foi marcada como enviada.');
    }
    if (plano.enviar.length === 0) {
      setAcaoId('');
      await recarregar();
      return;
    }
    const sonda = await supabase.from('escolta_solicitacao_alvos').update({
      envio_comando_id: plano.enviar[0].comandoId,
    }).eq('id', plano.enviar[0].alvoId).select('id');
    if (sonda.error) {
      setAcaoId('');
      setErro('A migration migrations/2026_10_20_whatsapp_desktop.sql ainda não está no banco. Nenhum comando foi enviado.');
      return;
    }
    const resposta = await enviarComandosLocais(plano.enviar.map((item) => ({ id: item.comandoId, groupName: item.grupoNome, text: item.texto })));
    if (!resposta.ok) {
      setErro(resposta.motivo || 'O aplicativo não confirmou o lote.');
      setAcaoId('');
      await recarregar();
      return;
    }
    for (const resultado of resposta.resultados) {
      const alvo = plano.enviar.find((item) => item.comandoId === resultado.id);
      if (!alvo) continue;
      await supabase.from('escolta_solicitacao_alvos').update({
        envio_status: resultado.estado,
        envio_em: new Date().toISOString(),
        envio_erro: resultado.motivo || null,
        envio_comando_id: resultado.id,
      }).eq('id', alvo.alvoId);
    }
    setAcaoId('');
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
    const irmaos = alvos.filter((item) => item.solicitacao_id === solicitacao.id);
    for (const item of irmaos) {
      const envio = envioAposConfirmacao(item.envio_status || null, item.id === alvo.id);
      if (!envio) continue;
      await supabase.from('escolta_solicitacao_alvos').update({ envio_status: envio }).eq('id', item.id);
    }
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

        {aplicativo !== 'liberado' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center" data-testid={aplicativo === 'verificando' ? 'painel-aplicativo-verificando' : 'painel-baixar-aplicativo'}>
            {aplicativo === 'verificando' ? (
              <>
                <Loader2 size={28} className="animate-spin text-green-700" />
                <p className="text-sm font-bold text-gray-700">Verificando os aplicativos neste computador.</p>
              </>
            ) : (
              <>
                <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                  <p className="text-base font-black">Você não tem todos os aplicativos.</p>
                  <p className="mt-2 text-sm font-bold">Baixe para instalar. Depois que a instalação terminar, esta tela libera a solicitação.</p>
                </div>
                <a href={LINK_INSTALADOR} download className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-5 py-3 text-xs font-black uppercase text-white" data-testid="link-baixar-instalador">
                  <Download size={16} /> Baixar para instalar
                </a>
                <button type="button" onClick={() => void verificarAplicativo()} className="text-[11px] font-black uppercase text-gray-600 underline" data-testid="button-verificar-aplicativo">
                  Já instalei, verificar de novo
                </button>
              </>
            )}
          </div>
        )}

        {aplicativo === 'liberado' && (
        <div className="grid flex-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4 border-b border-gray-100 p-5 md:border-b-0 md:border-r">
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Texto ou print do cliente</label>
            <textarea
              className="h-36 w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 outline-none focus:border-green-600"
              placeholder={'Escreva, cole o texto ou cole o print.\nOrigem: Rio de Janeiro - RJ\nDestino: São Paulo - SP\nData: 21/10/2026\nHorário: 08:00\nAgendada'}
              value={mensagem}
              onChange={(evento) => setMensagem(evento.target.value)}
              onPaste={(evento) => {
                const item = Array.from(evento.clipboardData.items).find((parte) => parte.type.startsWith('image/'));
                const arquivo = item?.getAsFile();
                if (!arquivo) return;
                evento.preventDefault();
                void lerArquivo(arquivo);
              }}
              data-testid="input-mensagem-solicitacao"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={ler} disabled={!mensagem.trim() || carregandoLista || lendoPrint} className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-40" data-testid="button-ler-solicitacao">
                {carregandoLista || lendoPrint ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Ler solicitação
              </button>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-[11px] font-black uppercase text-gray-700">
                <Image size={14} /> Colar print
                <input type="file" accept="image/*" className="hidden" data-testid="input-print-solicitacao" onChange={(evento) => {
                  const arquivo = evento.target.files?.[0];
                  if (arquivo) void lerArquivo(arquivo);
                  evento.target.value = '';
                }} />
              </label>
            </div>

            {leitura && (
              <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                <label className="block text-[10px] font-black uppercase text-gray-500">Origem</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={leitura.origem} onChange={(evento) => setLeitura({ ...leitura, origem: evento.target.value })} onBlur={(evento) => {
                  const lida = lerSolicitacao(`Origem: ${evento.target.value}\nDestino: ${leitura.destino}`);
                  if (lida.uf && lida.uf !== leitura.uf) {
                    setLeitura({ ...leitura, origem: evento.target.value, cidade: lida.cidade, uf: lida.uf });
                    void buscarFornecedores(lida.uf);
                  }
                }} data-testid="input-origem-solicitacao" />
                <label className="block text-[10px] font-black uppercase text-gray-500">Destino</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={leitura.destino} onChange={(evento) => setLeitura({ ...leitura, destino: evento.target.value })} data-testid="input-destino-solicitacao" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500">Data</label>
                    <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={leitura.data || ''} onChange={(evento) => setLeitura({ ...leitura, data: evento.target.value || null })} data-testid="input-data-solicitacao" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500">Horário</label>
                    <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={leitura.hora || ''} onChange={(evento) => setLeitura({ ...leitura, hora: evento.target.value || null })} data-testid="input-hora-solicitacao" />
                  </div>
                </div>
                <p className="text-[11px] font-bold text-gray-600">Região da fila: {leitura.cidade || 'cidade não lida'} / {leitura.uf || 'UF não lida'}</p>
                {imediata != null && (
                  <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-[11px] text-gray-700" data-testid="text-padrao-solicitacao">{textoSolicitacaoEscolta({
                    origem: leitura.origem,
                    destino: leitura.destino,
                    imediata,
                    data: leitura.data,
                    hora: leitura.hora,
                  })}</pre>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setImediata(true)} className={`rounded-lg border px-3 py-2 text-[11px] font-black uppercase ${imediata === true ? 'border-red-700 bg-red-700 text-white' : 'border-gray-200 text-gray-600'}`} data-testid="button-tipo-imediata">Imediata</button>
                  <button type="button" onClick={() => setImediata(false)} className={`rounded-lg border px-3 py-2 text-[11px] font-black uppercase ${imediata === false ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-200 text-gray-600'}`} data-testid="button-tipo-agendada">Agendada</button>
                </div>
                {imediata === null && <p className="text-[11px] font-bold text-amber-700">A mensagem não diz se é imediata ou agendada. Escolha antes de preparar.</p>}
              </div>
            )}

            {fornecedores.length > 0 && (
              <button type="button" onClick={() => void preparar()} disabled={salvando || imediata == null || selecionados.length === 0} className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-40" data-testid="button-preparar-encaminhamento">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Preparar encaminhamento
              </button>
            )}
            {avisoLista && <p className="text-[11px] font-bold text-amber-700">{avisoLista}</p>}
            {erro && <p className="text-[11px] font-bold text-red-600" data-testid="text-erro-solicitacao">{erro}</p>}
          </div>

          <div className="space-y-3 bg-slate-50 p-5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Fornecedores da região</p>
              {fornecedores.length > 0 && (
                <button type="button" className="text-[10px] font-black uppercase text-green-700" onClick={() => setMarcados(marcados.length === fornecedores.length ? [] : fornecedores.map((item) => item.id))} data-testid="button-selecionar-todos-fornecedores">
                  {marcados.length === fornecedores.length ? 'Limpar' : 'Selecionar mais de um'}
                </button>
              )}
            </div>
            {leitura && <p className="text-[11px] font-bold text-slate-600">{leitura.cidade || 'Cidade'} / {leitura.uf || 'UF'} · {imediata === true ? 'Imediata: todos os marcados juntos' : imediata === false ? 'Agendada: 2 agora e os 2 próximos a cada 5 minutos' : 'Escolha imediata ou agendada'}</p>}
            {fornecedores.length === 0 && <p className="text-xs text-slate-500">Os fornecedores da cidade e da UF aparecem aqui depois da leitura.</p>}
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {fornecedores.map((item, indice) => {
                const posicao = selecionados.findIndex((sel) => sel.id === item.id);
                const previsto = posicao >= 0 ? liberacoesPrevistas[posicao] : undefined;
                const espera = previsto == null ? '' : textoEsperaPorExtenso(previsto, 0);
                const marcado = marcados.includes(item.id);
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
                    <button type="button" onClick={() => setMarcados((atual) => atual.includes(item.id) ? atual.filter((id) => id !== item.id) : [...atual, item.id])} className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${marcado ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600'}`} data-testid={`check-fornecedor-${indice}`}>
                      {marcado ? 'Selecionado' : 'Selecionar'}
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-gray-800">{item.nome}</span>
                      <span className="text-[10px] font-bold text-gray-500">{item.cidade || 'Cidade'} / {item.uf} · {moeda(item.custo)}</span>
                    </span>
                    {marcado && espera && espera !== 'Liberado' && (
                      <span className="rounded-md bg-gray-300 px-2 py-1 text-[10px] font-bold text-gray-600">{espera}</span>
                    )}
                    {marcado && espera === 'Liberado' && (
                      <span className="rounded-md bg-green-700 px-2 py-1 text-[10px] font-black uppercase text-white">Liberado</span>
                    )}
                  </li>
                );
              })}
            </ul>
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
                  {solicitacao.status === 'em_andamento' && (
                    <button type="button" onClick={() => void autorizarDesktop(solicitacao)} disabled={acaoId === solicitacao.id} className="rounded-md bg-red-700 px-2 py-1 text-[10px] font-black uppercase text-white" data-testid={`button-autorizar-desktop-${solicitacao.id}`}>
                      Autorizar lote no computador
                    </button>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[10px]">
                      <thead>
                        <tr className="text-slate-400">
                          <th className="py-1 pr-2">Ordem</th>
                          <th className="py-1 pr-2">Fornecedor</th>
                          <th className="py-1 pr-2">Região</th>
                          <th className="py-1 pr-2">Custo</th>
                          <th className="py-1 pr-2">Grupo WhatsApp</th>
                          <th className="py-1 pr-2">Liberação</th>
                          <th className="py-1">Envio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filhos.map((alvo) => {
                          const estado: EstadoEnvio = estadoDoAlvo(paraDesktop(alvo), solicitacao.status, agora);
                          return (
                            <tr key={`linha-${alvo.id}`} className="border-t border-slate-100">
                              <td className="py-1 pr-2">{alvo.ordem + 1}</td>
                              <td className="py-1 pr-2 font-bold">{alvo.provider_nome}</td>
                              <td className="py-1 pr-2">{solicitacao.uf || '—'}</td>
                              <td className="py-1 pr-2">{alvo.custo_100km == null ? '—' : moeda(Number(alvo.custo_100km))}</td>
                              <td className="py-1 pr-2">{alvo.grupo_nome || 'sem nome exato'}</td>
                              <td className="py-1 pr-2">{estado === 'aguardando_horario' ? textoEsperaPorExtenso(new Date(alvo.liberar_em).getTime(), agora) : 'liberado'}</td>
                              <td className="py-1">{ROTULO_ESTADO[estado]}{alvo.envio_erro ? ` · ${alvo.envio_erro}` : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500">
                    {(() => {
                      const resumo = resumirEnvios(filhos.map((alvo) => estadoDoAlvo(paraDesktop(alvo), solicitacao.status, agora)));
                      return `${resumo.selecionados} fornecedores · ${resumo.executados} comandos executados · ${resumo.pendencias} pendências · ${resumo.erros} erros`;
                    })()}
                  </p>
                  <ul className="space-y-1">
                    {filhos.map((alvo) => {
                      const liberado = podeAbrirWhatsapp(alvo.status, new Date(alvo.liberar_em).getTime(), agora, solicitacao.status);
                      return (
                        <li key={alvo.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2 py-2 text-[11px]">
                          <span className="min-w-0 flex-1 font-bold text-slate-800">{alvo.ordem + 1}. {alvo.provider_nome}</span>
                          {alvo.status === 'bloqueado' && <span className="font-bold text-slate-400">não recebe</span>}
                          {alvo.status === 'confirmado' && <span className="font-bold text-green-700">confirmado</span>}
                          {alvo.status !== 'bloqueado' && alvo.status !== 'confirmado' && !liberado && (
                            <button type="button" disabled className="rounded-md bg-gray-300 px-2 py-1 font-bold text-gray-600" data-testid={`button-espera-${alvo.id}`}>
                              {textoEsperaPorExtenso(new Date(alvo.liberar_em).getTime(), agora)}
                            </button>
                          )}
                          {liberado && (
                            <button type="button" disabled={acaoId === alvo.id} onClick={() => void abrirWhatsapp(solicitacao, alvo)} className="rounded-md bg-green-700 px-2 py-1 font-black uppercase text-white" data-testid={`button-abrir-whatsapp-${alvo.id}`}>
                              Abrir WhatsApp
                            </button>
                          )}
                          {liberado && (
                            <button type="button" disabled={acaoId === alvo.id} onClick={() => void confirmar(solicitacao, alvo)} className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 font-black uppercase text-white" data-testid={`button-fornecedor-confirmado-${alvo.id}`}>
                              <Check size={12} /> Confirmado
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
        )}
      </div>
    </div>
  );
};

export default SolicitacaoEscoltaModal;
