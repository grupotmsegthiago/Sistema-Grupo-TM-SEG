import React, { useEffect, useRef, useState } from 'react';
import { X, Printer, ImagePlus, Sparkles, Bold, Italic, AlignLeft, AlignCenter, AlignRight, AlignJustify, Save, Pencil } from 'lucide-react';
import { buildOsActionPlanHtml } from '../lib/osActionPlan/buildOsActionPlanHtml';
import { coletarPlanoAcaoOs, completarPosicoes } from '../lib/osActionPlan/abrirPlanoAcaoOs';
import { lerPlanoSalvo, planoSalvoCompativel, salvarContextoLocal, salvarPlanoAcaoOs } from '../lib/osActionPlan/salvarPlanoAcao';
import { inventarioMissao } from '../lib/osActionPlan/diarioOperacional';
import { aguardarImagensDoRelatorio } from '../lib/osActionPlan/prontoParaPdf';
import { montarCroqui } from '../lib/osActionPlan/montarCroqui';
import { redigirAnaliseOcorrencia } from '../lib/osActionPlan/redigirContexto';
import { ilustrarRelatorio } from '../lib/osActionPlan/ilustrarRelatorio';
import { textoEhRelatorioColado } from '../lib/osActionPlan/montarPlanos';
import type { CroquiOcorrencia, OsActionPlanInput } from '../lib/osActionPlan/types';
import { formatDateTimeBR } from '../lib/dateUtils';

interface OsActionPlanModalProps {
  missionId: string;
  onClose: () => void;
}

interface EvidenciaLocal {
  id: string;
  nome: string;
  preview: string;
  file: File;
  tipo: string;
  descricao: string;
  origem: string;
  principal: boolean;
}

function BarraCarga({ pct, texto, segundos }: { pct: number; texto: string; segundos: number }) {
  const valor = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-rose-900">
        <span>{texto}</span>
        <span className="shrink-0">{valor}% · {segundos}s</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-rose-100">
        <div className="h-full bg-gradient-to-r from-[#9f1239] to-[#e11d2e] transition-[width] duration-300" style={{ width: `${valor}%` }} />
      </div>
    </div>
  );
}

const OsActionPlanModal: React.FC<OsActionPlanModalProps> = ({ missionId, onClose }) => {
  const [dados, setDados] = useState<OsActionPlanInput | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [problema, setProblema] = useState('');
  const [relato, setRelato] = useState('');
  const [evidencias, setEvidencias] = useState<EvidenciaLocal[]>([]);
  const [emissao, setEmissao] = useState<OsActionPlanInput | null>(null);
  const [aprovado, setAprovado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [ultimaVersao, setUltimaVersao] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [etapa, setEtapa] = useState<'escolha' | 'apuracao'>('escolha');
  const [tipoEscolha, setTipoEscolha] = useState<'padrao' | 'ocorrencia'>('padrao');
  const [escopo, setEscopo] = useState<'todas' | 'relevantes'>('relevantes');
  const [carga, setCarga] = useState<{ pct: number; texto: string } | null>(null);
  const [segundos, setSegundos] = useState(0);
  const hidratado = useRef(false);
  const pctRef = useRef(0);

  useEffect(() => {
    let ativo = true;
    hidratado.current = false;
    setDados(null);
    setErro(null);
    setHtml(null);
    setUltimaVersao(null);
    setEditando(false);
    void Promise.all([coletarPlanoAcaoOs(missionId), lerPlanoSalvo(missionId)]).then(([lido, salvo]) => {
      if (!ativo) return;
      if (!lido && !salvo) setErro('Não foi possível ler os dados desta OS.');
      if (lido) setDados(lido);
      if (salvo) setUltimaVersao(salvo);
      if (lido && salvo && planoSalvoCompativel(salvo)) {
        setHtml(salvo);
      } else if (salvo) {
        setAvisoIa('Há uma versão salva anterior. Ela continua disponível para abrir.');
      }
      hidratado.current = true;
    });
    return () => { ativo = false; };
  }, [missionId]);

  useEffect(() => {
    if (!hidratado.current) return;
    salvarContextoLocal(missionId, { problema, relato });
  }, [missionId, problema, relato]);

  useEffect(() => {
    if (!gerando) {
      setSegundos(0);
      return;
    }
    const id = window.setInterval(() => setSegundos((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [gerando]);

  const marcarCarga = (pct: number, texto: string) => {
    const proximo = Math.max(pctRef.current, Math.min(100, Math.round(pct)));
    pctRef.current = proximo;
    setCarga({ pct: proximo, texto });
  };

  const escolherFotos = (lista: FileList | null) => {
    const novas = Array.from(lista || []).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf').slice(0, 8);
    setEvidencias((atual) => {
      const juntas = [...atual, ...novas.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        nome: file.name,
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        tipo: 'WhatsApp',
        descricao: '',
        origem: '',
        principal: false,
      }))];
      return juntas.slice(0, 8);
    });
  };

  const gerar = async () => {
    if (!dados || gerando) return;
    const foco = problema.trim();
    if (foco.length < 20) {
      setAvisoIa('Descreva o problema principal antes de gerar. Esse texto define o foco do relatório.');
      return;
    }
    setGerando(true);
    pctRef.current = 0;
    marcarCarga(4, 'Preparando o relatório');
    setAvisoIa(null);
    setAprovado(false);
    const fotosTratativa = await Promise.all(evidencias.filter((e) => e.preview).map(async (f) => {
      const dataUrl = await new Promise<string>((resolve) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result || ''));
        leitor.onerror = () => resolve(f.preview);
        leitor.readAsDataURL(f.file);
      });
      return { legenda: `${f.principal ? 'Evidência principal' : f.tipo} — ${f.descricao || f.nome}`, url: dataUrl || f.preview };
    }));
    const pacote: OsActionPlanInput = {
      ...dados,
      tratativaTexto: textoEhRelatorioColado(relato) ? null : (relato.trim() || null),
      problemaPrincipal: foco,
      relatoComplementar: relato.trim() || null,
      evidenciasApuracao: evidencias.map((e) => ({
        tipo: e.tipo,
        descricao: e.descricao || e.nome,
        origem: e.origem || null,
        quando: null,
        principal: e.principal,
        url: e.preview || null,
      })),
      modalidade: 'ocorrencia',
      escopoAtualizacoes: escopo,
      objetivoIa: null,
      narrativaIa: null,
      planoAcaoIa: null,
      planoMelhoriaIa: null,
      conclusaoIa: null,
      tratativaIa: null,
      fotosTratativa,
      aprovadoCliente: false,
      geradoEm: new Date().toISOString(),
    };
    try {
      marcarCarga(8, 'Localizando os endereços');
      const comPosicao = await completarPosicoes(pacote, (feitos, total) => {
        const pct = total > 0 ? 8 + Math.round((feitos / total) * 32) : 40;
        marcarCarga(pct, total > 0 ? `Localizando endereços ${feitos} de ${total}` : 'Endereços já localizados');
      });
      comPosicao.croqui = montarCroqui(comPosicao);
      const mostrar = (base: OsActionPlanInput, htmlPronto: string) => {
        setEmissao(base);
        setHtml(htmlPronto);
        setUltimaVersao(htmlPronto);
      };
      marcarCarga(45, 'Montando o texto do relatório');
      // O relatório abre antes do mapa e da IA. Esses passos não podem deixar a tela parada.
      mostrar(comPosicao, buildOsActionPlanHtml(comPosicao));
      marcarCarga(52, 'Buscando o mapa e as fotos');
      const ilustrado = await ilustrarRelatorio(comPosicao, (evento) => {
        if (evento.tipo === 'foto') {
          marcarCarga(78, 'Fotos copiadas para o documento');
          return;
        }
        const pct = 52 + Math.round((evento.feitos / Math.max(1, evento.total)) * 24);
        marcarCarga(pct, `Mapa ${evento.feitos} de ${evento.total}`);
      });
      const enriquecido = ilustrado.entrada;
      marcarCarga(88, 'Escrevendo a análise');
      let narrativa = '';
      let avisoFalha = '';
      let limiteIa: ReturnType<typeof setTimeout> | undefined;
      const pedidoIa = redigirAnaliseOcorrencia(enriquecido);
      void pedidoIa.catch(() => undefined);
      try {
        narrativa = await Promise.race([
          pedidoIa,
          new Promise<string>((_, rejeitar) => {
            limiteIa = setTimeout(() => rejeitar(new Error('tempo esgotado')), 12000);
          }),
        ]);
      } catch (erroIa) {
        const mensagem = erroIa instanceof Error ? erroIa.message : 'falha ao consultar a IA';
        avisoFalha = /tempo esgotado/i.test(mensagem)
          ? 'A análise automática demorou. O relatório ficou com o texto já escrito para o cliente.'
          : `A IA não respondeu (${/403|blocked|referer/i.test(mensagem) ? 'a chave do Google bloqueou a consulta' : mensagem.slice(0, 160)}). O documento leva o resumo para o cliente, sem copiar o texto interno e sem atribuir culpa.`;
      } finally {
        if (limiteIa) clearTimeout(limiteIa);
      }
      if (!narrativa.trim() && !avisoFalha) {
        avisoFalha = 'A IA não devolveu o resumo. O documento leva o resumo para o cliente, sem copiar o texto interno e sem atribuir culpa.';
      }
      enriquecido.narrativaIa = narrativa.trim() || null;
      enriquecido.croqui = comPosicao.croqui;
      const pronto = buildOsActionPlanHtml(enriquecido);
      salvarContextoLocal(missionId, { problema: foco, relato: relato.trim() });
      mostrar(enriquecido, pronto);
      marcarCarga(96, 'Gravando o relatório');
      await gravarHtml(pronto);
      marcarCarga(100, 'Relatório pronto');
      const avisoFinal = [avisoFalha, ...ilustrado.avisos].filter(Boolean).join(' ');
      if (avisoFinal) setAvisoIa(avisoFinal);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'falha ao montar o relatório';
      setAvisoIa(`Não foi possível montar o relatório (${mensagem}).`);
    } finally {
      setGerando(false);
      setCarga(null);
      pctRef.current = 0;
    }
  };

  const gerarPadrao = async () => {
    if (!dados || gerando) return;
    setGerando(true);
    pctRef.current = 0;
    marcarCarga(4, 'Preparando o relatório');
    setAvisoIa(null);
    setAprovado(false);
    const pacote: OsActionPlanInput = {
      ...dados,
      modalidade: 'padrao',
      escopoAtualizacoes: 'todas',
      problemaPrincipal: null,
      croqui: null,
      geradoEm: new Date().toISOString(),
    };
    try {
      marcarCarga(8, 'Localizando os endereços');
      const comPosicao = await completarPosicoes(pacote, (feitos, total) => {
        const pct = total > 0 ? 8 + Math.round((feitos / total) * 32) : 40;
        marcarCarga(pct, total > 0 ? `Localizando endereços ${feitos} de ${total}` : 'Endereços já localizados');
      });
      marcarCarga(45, 'Montando o texto do relatório');
      setEmissao(comPosicao);
      setHtml(buildOsActionPlanHtml(comPosicao));
      marcarCarga(52, 'Buscando o mapa e as fotos');
      const ilustrado = await ilustrarRelatorio(comPosicao, (evento) => {
        if (evento.tipo === 'foto') {
          marcarCarga(78, 'Fotos copiadas para o documento');
          return;
        }
        const pct = 52 + Math.round((evento.feitos / Math.max(1, evento.total)) * 30);
        marcarCarga(pct, `Mapa ${evento.feitos} de ${evento.total}`);
      });
      const enriquecido = ilustrado.entrada;
      const pronto = buildOsActionPlanHtml(enriquecido);
      setEmissao(enriquecido);
      setHtml(pronto);
      setUltimaVersao(pronto);
      marcarCarga(96, 'Gravando o relatório');
      await gravarHtml(pronto);
      marcarCarga(100, 'Relatório pronto');
      if (ilustrado.avisos.length) setAvisoIa(ilustrado.avisos.join(' '));
    } finally {
      setGerando(false);
      setCarga(null);
      pctRef.current = 0;
    }
  };

  const autorAtual = () => {
    try {
      const bruto = localStorage.getItem('userData');
      if (!bruto) return null;
      const usuario = JSON.parse(bruto) as { name?: string; nome?: string };
      return usuario.name || usuario.nome || null;
    } catch {
      return null;
    }
  };

  const gravarHtml = async (vivo: string) => {
    const resultado = await salvarPlanoAcaoOs(missionId, vivo, autorAtual());
    setAvisoIa(resultado.aviso === 'Plano salvo.' ? 'Versão gravada. Ela reabre nesta OS.' : resultado.aviso);
    setUltimaVersao(vivo);
  };

  const aprovar = () => {
    if (!emissao) return;
    const pacote = { ...emissao, aprovadoCliente: true, geradoEm: new Date().toISOString() };
    const pronto = buildOsActionPlanHtml(pacote);
    setEmissao(pacote);
    setAprovado(true);
    setHtml(pronto);
    void gravarHtml(pronto);
  };

  const aplicarCroqui = (croqui: CroquiOcorrencia | null) => {
    if (!emissao) return;
    const pacote = { ...emissao, croqui };
    setEmissao(pacote);
    setHtml(buildOsActionPlanHtml(pacote));
  };

  const quadro = () => document.getElementById('os-action-plan-frame') as HTMLIFrameElement | null;

  const imprimir = async () => {
    const frame = quadro();
    const doc = frame?.contentDocument;
    const janela = frame?.contentWindow;
    if (!doc || !janela) return;
    const pronto = await aguardarImagensDoRelatorio(doc);
    if (!pronto.ok) {
      setAvisoIa(pronto.aviso);
      return;
    }
    janela.focus();
    janela.print();
  };

  const comando = (cmd: string) => {
    const frame = quadro();
    frame?.contentWindow?.focus();
    frame?.contentDocument?.execCommand(cmd, false);
  };

  const alternarEdicao = () => {
    const frame = quadro();
    const doc = frame?.contentDocument;
    if (!doc) return;
    const ligado = !editando;
    doc.querySelectorAll<HTMLElement>('[data-campo]').forEach((campo) => {
      campo.contentEditable = ligado ? 'true' : 'false';
    });
    setEditando(ligado);
  };

  const salvar = async () => {
    const frame = quadro();
    const doc = frame?.contentDocument;
    if (!doc || salvando) return;
    setSalvando(true);
    const vivo = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
    if (/apurar a atualiza[cç][aã]o registrada/i.test(vivo) || /<td[^>]*>[^<]{400,}/i.test(vivo)) {
      setAvisoIa('Esta versão ainda copia texto bruto para o plano. Gere o relatório visual de novo antes de salvar.');
      setSalvando(false);
      return;
    }
    const resultado = await salvarPlanoAcaoOs(missionId, vivo, autorAtual());
    salvarContextoLocal(missionId, { problema, relato });
    setAvisoIa(resultado.aviso);
    setHtml(vivo);
    setUltimaVersao(vivo);
    setEditando(false);
    setSalvando(false);
  };

  return (
    <div className="fixed inset-0 z-[260] bg-black/75 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-[#f7f4f2] rounded-3xl w-full max-w-6xl h-[92vh] flex flex-col shadow-[0_24px_60px_rgba(0,0,0,.35)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 bg-gradient-to-r from-[#14080c] to-[#9f1239] text-white flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide">Relatórios operacionais</h3>
            <p className="text-[12px] text-rose-100">{missionId}{dados ? ` · ${dados.clientName}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {html && (
              <>
                <button type="button" onClick={() => { setHtml(null); setEditando(false); setEtapa('escolha'); }} className="rounded-xl bg-white/15 px-3 py-2 text-[11px] font-black uppercase">Nova versão</button>
                {!aprovado && (
                  <button type="button" onClick={aprovar} className="rounded-xl bg-white text-slate-900 px-3 py-2 text-[11px] font-black uppercase" data-testid="button-approve-os-action-plan">Aprovar</button>
                )}
                <button type="button" onClick={alternarEdicao} className="inline-flex items-center gap-1 rounded-xl bg-white/15 px-3 py-2 text-[11px] font-black uppercase" data-testid="button-edit-os-action-plan">
                  <Pencil size={14} /> {editando ? 'Concluir edição' : 'Editar'}
                </button>
                <button type="button" onClick={() => void salvar()} disabled={salvando} className="inline-flex items-center gap-1 rounded-xl bg-white text-slate-900 px-3 py-2 text-[11px] font-black uppercase disabled:opacity-60" data-testid="button-save-os-action-plan">
                  <Save size={14} /> {salvando ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" onClick={imprimir} className="inline-flex items-center gap-2 rounded-xl bg-white text-slate-900 px-3 py-2 text-[11px] font-black uppercase" data-testid="button-print-os-action-plan">
                  <Printer size={14} /> Imprimir / PDF
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10" data-testid="button-close-os-action-plan">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {erro && <p className="p-6 text-sm font-bold text-red-700">{erro}</p>}
          {!erro && !dados && <p className="p-6 text-sm font-bold text-gray-500">Lendo KM, horários, timeline e histórico do cliente...</p>}
          {dados && !html && etapa === 'escolha' && (
            <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
              <form className="bg-white rounded-2xl p-4 shadow-[0_12px_28px_rgba(17,24,39,.08)] space-y-3" onSubmit={(e) => { e.preventDefault(); if (tipoEscolha === 'padrao') gerarPadrao(); else setEtapa('apuracao'); }}>
                <h4 className="text-[12px] font-black uppercase tracking-wide text-rose-900">Qual relatório deseja gerar?</h4>
                {ultimaVersao && (
                  <button type="button" onClick={() => setHtml(ultimaVersao)} className="w-full rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-black uppercase text-rose-900">
                    Abrir a última versão salva
                  </button>
                )}
                <label className="flex gap-2 items-start rounded-xl border border-rose-100 p-3">
                  <input type="radio" name="tipo-relatorio" checked={tipoEscolha === 'padrao'} onChange={() => setTipoEscolha('padrao')} />
                  <span><strong className="block text-[12px] uppercase">Relatório padrão da missão</strong><span className="text-[12px] text-gray-500">Missão sem ocorrência. Gera o histórico operacional completo.</span></span>
                </label>
                <label className="flex gap-2 items-start rounded-xl border border-rose-100 p-3">
                  <input type="radio" name="tipo-relatorio" checked={tipoEscolha === 'ocorrencia'} onChange={() => setTipoEscolha('ocorrencia')} />
                  <span><strong className="block text-[12px] uppercase">Relatório da missão com ocorrência</strong><span className="text-[12px] text-gray-500">Houve ocorrência ou situação que pede análise e plano de ação.</span></span>
                </label>
                {tipoEscolha === 'ocorrencia' && (
                  <div className="space-y-2 text-[12px]">
                    <label className="flex gap-2"><input type="radio" name="escopo" checked={escopo === 'relevantes'} onChange={() => setEscopo('relevantes')} /> Somente atualizações relacionadas ao problema</label>
                    <label className="flex gap-2"><input type="radio" name="escopo" checked={escopo === 'todas'} onChange={() => setEscopo('todas')} /> Todas as atualizações</label>
                  </div>
                )}
                {avisoIa && <p className="text-[12px] font-bold text-amber-700">{avisoIa}</p>}
                {gerando && carga && <BarraCarga pct={carga.pct} texto={carga.texto} segundos={segundos} />}
                <button type="submit" disabled={gerando} className="w-full rounded-xl bg-gradient-to-r from-[#9f1239] to-[#e11d2e] text-white px-4 py-3 text-[12px] font-black uppercase disabled:opacity-60" data-testid="button-choose-os-report">
                  {tipoEscolha === 'padrao' ? (gerando ? `${carga?.pct ?? 0}% carregando` : 'Gerar relatório da missão') : 'Continuar para a apuração'}
                </button>
              </form>
              <div className="bg-white rounded-2xl p-4 shadow-[0_12px_28px_rgba(17,24,39,.08)] text-sm space-y-2">
                <h4 className="text-[12px] font-black uppercase tracking-wide text-rose-900">Dados encontrados</h4>
                {inventarioMissao(dados).map((item) => (
                  <p key={item.texto}>{item.ok ? '✓' : '⚠'} {item.texto}</p>
                ))}
              </div>
            </div>
          )}
          {dados && !html && etapa === 'apuracao' && (
            <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
              <form className="bg-white rounded-2xl p-4 shadow-[0_12px_28px_rgba(17,24,39,.08)] space-y-3" onSubmit={(e) => { e.preventDefault(); void gerar(); }}>
                <h4 className="text-[12px] font-black uppercase tracking-wide text-rose-900">Contexto da apuração</h4>
                <button type="button" onClick={() => setEtapa('escolha')} className="w-full rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-black uppercase text-rose-900">Voltar à escolha do relatório</button>
                {ultimaVersao && (
                  <button type="button" onClick={() => setHtml(ultimaVersao)} className="w-full rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-black uppercase text-rose-900">
                    Voltar à última versão salva
                  </button>
                )}
                <p className="text-[12px] text-gray-500">O texto abaixo define o foco do relatório. Ele não vira fato comprovado sozinho. O sistema cruza esse foco com a OS e com as provas anexadas.</p>
                <label className="block text-[11px] font-black uppercase text-slate-600">Qual é o problema principal?</label>
                <textarea
                  value={problema}
                  onChange={(e) => setProblema(e.target.value)}
                  rows={5}
                  placeholder="Ex.: Durante a passagem pelo pedágio, a equipe perdeu a identificação visual do veículo escoltado, confundiu-o com outro caminhão semelhante e depois retomou o veículo correto pela placa."
                  className="w-full rounded-xl border border-rose-100 bg-rose-50/40 px-3 py-2 text-sm"
                  data-testid="input-os-action-context"
                />
                <label className="block text-[11px] font-black uppercase text-slate-600">Relato complementar</label>
                <textarea
                  value={relato}
                  onChange={(e) => setRelato(e.target.value)}
                  rows={3}
                  placeholder="Relatos da equipe, da Central, do motorista ou do cliente."
                  className="w-full rounded-xl border border-rose-100 px-3 py-2 text-sm"
                />
                <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-rose-200 px-3 py-4 text-[12px] font-bold text-rose-900 cursor-pointer">
                  <ImagePlus size={16} /> Anexar provas (imagem ou PDF, até 8)
                  <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => escolherFotos(e.target.files)} data-testid="input-os-action-photos" />
                </label>
                {evidencias.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-rose-100 p-2 space-y-2">
                    <div className="flex gap-2 items-center">
                      {ev.preview ? <img src={ev.preview} alt={ev.nome} className="h-14 w-14 object-cover rounded-lg" /> : <span className="text-[11px] font-bold">{ev.nome}</span>}
                      <select value={ev.tipo} onChange={(e) => setEvidencias((lista) => lista.map((item) => item.id === ev.id ? { ...item, tipo: e.target.value } : item))} className="rounded-lg border px-2 py-1 text-[12px]">
                        {['WhatsApp', 'Foto', 'Documento', 'Telemetria', 'E-mail', 'Outro'].map((op) => <option key={op}>{op}</option>)}
                      </select>
                      <label className="text-[11px] font-bold flex items-center gap-1">
                        <input type="checkbox" checked={ev.principal} onChange={(e) => setEvidencias((lista) => lista.map((item) => item.id === ev.id ? { ...item, principal: e.target.checked } : item))} />
                        Evidência principal
                      </label>
                    </div>
                    <input value={ev.descricao} onChange={(e) => setEvidencias((lista) => lista.map((item) => item.id === ev.id ? { ...item, descricao: e.target.value } : item))} placeholder="O que esta prova mostra. Ex.: mensagem em que a equipe informa a perda do caminhão." className="w-full rounded-lg border px-2 py-1 text-[12px]" />
                    <input value={ev.origem} onChange={(e) => setEvidencias((lista) => lista.map((item) => item.id === ev.id ? { ...item, origem: e.target.value } : item))} placeholder="Origem: grupo, agente, central..." className="w-full rounded-lg border px-2 py-1 text-[12px]" />
                  </div>
                ))}
                {avisoIa && <p className="text-[12px] font-bold text-amber-700">{avisoIa}</p>}
                {gerando && carga && <BarraCarga pct={carga.pct} texto={carga.texto} segundos={segundos} />}
                <button type="submit" disabled={gerando} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#9f1239] to-[#e11d2e] text-white px-4 py-3 text-[12px] font-black uppercase shadow-lg disabled:opacity-60" data-testid="button-generate-os-action-plan">
                  <Sparkles size={16} /> {gerando ? `${carga?.pct ?? 0}% carregando` : 'Analisar e gerar relatório'}
                </button>
              </form>
              <div className="bg-white rounded-2xl p-4 shadow-[0_12px_28px_rgba(17,24,39,.08)] text-sm space-y-2">
                <h4 className="text-[12px] font-black uppercase tracking-wide text-rose-900">Já entra no plano</h4>
                <p><strong>Cliente:</strong> {dados.clientName}</p>
                <p><strong>Rota:</strong> {dados.origem} → {dados.destino}</p>
                <p><strong>KM inicial / final:</strong> {dados.kmInicial || '—'} / {dados.kmFinal || '—'}</p>
                <p><strong>Programado / fim:</strong> {dados.horarioProgramado ? formatDateTimeBR(dados.horarioProgramado) : '—'} / {dados.horarioFim ? formatDateTimeBR(dados.horarioFim) : '—'}</p>
                <p><strong>Atualizações na timeline:</strong> {dados.atualizacoes.length}</p>
                <p><strong>Fotos da missão:</strong> {dados.fotos.length}</p>
                <p><strong>Conta:</strong> {dados.contaCliente.estado === 'ENCONTRADO' ? `${dados.contaCliente.total} missões · ${dados.contaCliente.caracterizada} caracterizada · ${dados.contaCliente.velada} velada` : 'não carregada'}</p>
                <p><strong>Ocorrências:</strong> {dados.ocorrencias.length}</p>
              </div>
            </div>
          )}
          {html && (
            <div className="h-full flex flex-col">
              {editando && (
                <div className="flex flex-wrap items-center gap-1 px-3 py-2 bg-white border-b border-rose-100">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => comando('bold')} className="p-2 rounded-lg hover:bg-rose-50" title="Negrito"><Bold size={16} /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => comando('italic')} className="p-2 rounded-lg hover:bg-rose-50" title="Itálico"><Italic size={16} /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => comando('justifyLeft')} className="p-2 rounded-lg hover:bg-rose-50" title="Alinhar à esquerda"><AlignLeft size={16} /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => comando('justifyCenter')} className="p-2 rounded-lg hover:bg-rose-50" title="Centralizar"><AlignCenter size={16} /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => comando('justifyRight')} className="p-2 rounded-lg hover:bg-rose-50" title="Alinhar à direita"><AlignRight size={16} /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => comando('justifyFull')} className="p-2 rounded-lg hover:bg-rose-50" title="Justificar"><AlignJustify size={16} /></button>
                </div>
              )}
              <p className="px-4 py-2 text-[12px] text-slate-700 bg-white border-b border-rose-100">Revise e edite o plano de ação e o plano de melhoria antes de salvar. O documento só é gravado no botão Salvar.</p>
              {gerando && carga && <div className="px-4 py-2 bg-white border-b border-rose-100"><BarraCarga pct={carga.pct} texto={carga.texto} segundos={segundos} /></div>}
              {avisoIa && <p className="px-4 py-2 text-[12px] font-bold text-amber-800 bg-amber-50">{avisoIa}</p>}
              {html && !aprovado && <p className="px-4 py-2 text-[12px] font-bold text-amber-800 bg-amber-50">Rascunho na tela. O PDF ainda não marca aprovação. Use Aprovar antes de enviar ao cliente.</p>}
              {emissao?.modalidade === 'ocorrencia' && emissao.croqui && (
                <details className="bg-white border-b border-rose-100">
                <summary className="cursor-pointer px-4 py-2 text-[12px] font-bold text-rose-900">Ajustar o texto do croqui</summary>
                <div className="max-h-56 overflow-y-auto px-3 py-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-[11px] uppercase text-rose-900">Croqui no documento</strong>
                    <span className="text-[11px] text-slate-500">Já entra no relatório. Ajuste o texto se precisar.</span>
                    <button type="button" className="rounded-lg border px-2 py-1 text-[11px] font-bold" onClick={() => aplicarCroqui(montarCroqui(emissao))}>Regerar croqui</button>
                  </div>
                  <input className="w-full rounded border px-2 py-1 text-[12px]" value={emissao.croqui.subtitulo} onChange={(e) => emissao.croqui && aplicarCroqui({ ...emissao.croqui, aprovado: false, subtitulo: e.target.value })} />
                  {emissao.croqui.etapas.map((etapa, indice) => (
                    <div key={etapa.id} className="grid grid-cols-[1fr_auto] gap-1">
                      <textarea className="rounded border px-2 py-1 text-[12px]" rows={2} value={etapa.legenda} onChange={(e) => {
                        if (!emissao.croqui) return;
                        const etapas = emissao.croqui.etapas.map((item, i) => i === indice ? { ...item, legenda: e.target.value } : item);
                        aplicarCroqui({ ...emissao.croqui, aprovado: false, etapas });
                      }} />
                      <div className="flex flex-col gap-1">
                        <button type="button" className="text-[10px] font-bold" onClick={() => {
                          if (!emissao.croqui || indice === 0) return;
                          const etapas = [...emissao.croqui.etapas];
                          const [item] = etapas.splice(indice, 1);
                          etapas.splice(indice - 1, 0, item);
                          aplicarCroqui({ ...emissao.croqui, aprovado: false, etapas });
                        }}>Subir</button>
                        <button type="button" className="text-[10px] font-bold" onClick={() => {
                          if (!emissao.croqui) return;
                          aplicarCroqui({ ...emissao.croqui, aprovado: false, etapas: emissao.croqui.etapas.filter((_, i) => i !== indice) });
                        }}>Remover</button>
                      </div>
                    </div>
                  ))}
                  {emissao.croqui.etapas.length < 6 && (
                    <button type="button" className="text-[11px] font-bold text-rose-900" onClick={() => emissao.croqui && aplicarCroqui({
                      ...emissao.croqui,
                      aprovado: false,
                      etapas: [...emissao.croqui.etapas, { id: `extra-${emissao.croqui.etapas.length + 1}`, titulo: 'Etapa complementar', legenda: '', classificacao: 'relatado', quando: null }],
                    })}>Adicionar etapa</button>
                  )}
                </div>
                </details>
              )}
              {emissao?.modalidade === 'ocorrencia' && !emissao.croqui && <p className="px-4 py-2 text-[12px] text-slate-600 bg-white border-b">Não há croqui: a sequência não tem elementos suficientes para um desenho sem inventar o fato.</p>}
              <iframe
                id="os-action-plan-frame"
                title={`Plano de Ação ${missionId}`}
                className="w-full flex-1 bg-white"
                srcDoc={html}
                onLoad={(evento) => {
                  const doc = evento.currentTarget.contentDocument;
                  if (!doc || doc.documentElement.dataset.abrirFoto === '1') return;
                  doc.documentElement.dataset.abrirFoto = '1';
                  doc.addEventListener('click', (clique) => {
                    const alvo = (clique.target as Element | null)?.closest?.('a.foto-link');
                    if (!alvo) return;
                    const endereco = alvo.getAttribute('href');
                    if (!endereco || endereco.startsWith('data:')) return;
                    clique.preventDefault();
                    window.open(endereco, '_blank', 'noopener');
                  });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OsActionPlanModal;
