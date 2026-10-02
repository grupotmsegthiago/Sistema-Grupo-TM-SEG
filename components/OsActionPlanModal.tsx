import React, { useEffect, useState } from 'react';
import { X, Printer, ImagePlus, Sparkles, Bold, Italic, AlignLeft, AlignCenter, AlignRight, AlignJustify, Save, Pencil } from 'lucide-react';
import { buildOsActionPlanHtml, montarRelatoOs } from '../lib/osActionPlan/buildOsActionPlanHtml';
import { coletarPlanoAcaoOs } from '../lib/osActionPlan/abrirPlanoAcaoOs';
import { lerPlanoSalvo, salvarPlanoAcaoOs } from '../lib/osActionPlan/salvarPlanoAcao';
import { redigirContextoOs, separarRespostaIa } from '../lib/osActionPlan/redigirContexto';
import { textoEhRelatorioColado, textoEhRotina } from '../lib/osActionPlan/montarPlanos';
import { optimizeImageForAI } from '../lib/imageForAI';
import { formatDateTimeBR } from '../lib/dateUtils';
import type { OsActionPlanInput } from '../lib/osActionPlan/types';

interface OsActionPlanModalProps {
  missionId: string;
  onClose: () => void;
}

interface FotoLocal {
  nome: string;
  preview: string;
  file: File;
}

const OsActionPlanModal: React.FC<OsActionPlanModalProps> = ({ missionId, onClose }) => {
  const [dados, setDados] = useState<OsActionPlanInput | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [gerando, setGerando] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setDados(null);
    setErro(null);
    setHtml(null);
    setEditando(false);
    void Promise.all([coletarPlanoAcaoOs(missionId), lerPlanoSalvo(missionId)]).then(([lido, salvo]) => {
      if (!ativo) return;
      if (!lido && !salvo) setErro('Não foi possível ler os dados desta OS.');
      if (lido) setDados(lido);
      if (salvo && salvo.includes('data-secao="resumo"')) setHtml(salvo);
      else if (salvo) setAvisoIa('Há uma versão antiga salva, com o texto misturado na tabela. Gere o relatório de novo para substituir. A versão antiga não foi apagada.');
    });
    return () => { ativo = false; };
  }, [missionId]);

  const escolherFotos = (lista: FileList | null) => {
    const novas = Array.from(lista || []).filter((f) => f.type.startsWith('image/')).slice(0, 6);
    setFotos((atual) => {
      const juntas = [...atual, ...novas.map((file) => ({ nome: file.name, file, preview: URL.createObjectURL(file) }))];
      return juntas.slice(0, 6);
    });
  };

  const gerar = async (usarIa: boolean) => {
    if (!dados || gerando) return;
    setGerando(true);
    setAvisoIa(null);
    let narrativa: string | null = null;
    let objetivoIa: string | null = null;
    let planoAcaoIa: string | null = null;
    let planoMelhoriaIa: string | null = null;
    let conclusaoIa: string | null = null;
    let tratativaIa: string | null = null;
    try {
      const imagens = [];
      if (usarIa) {
        for (const foto of fotos) imagens.push(await optimizeImageForAI(foto.file));
      }
      const resumo = [
        ...montarRelatoOs(dados),
        ...dados.atualizacoes
          .filter((a) => !textoEhRotina(a.texto) && !textoEhRelatorioColado(a.texto))
          .slice(0, 8)
          .map((a) => `Atualização relevante em ${a.quando || 'horário a confirmar'}: ${a.texto.slice(0, 180)}`),
        ...dados.ocorrencias
          .filter((o) => !textoEhRelatorioColado(o.texto))
          .slice(0, 4)
          .map((o) => `Ocorrência: ${o.texto.slice(0, 180)}`),
      ].join('\n');
      const textoLimpo = textoEhRelatorioColado(texto) ? '' : texto;
      const bruto = await redigirContextoOs({
        resumoFatos: resumo,
        textoUsuario: usarIa ? textoLimpo : '',
        imagens,
      });
      const partes = separarRespostaIa(bruto);
      objetivoIa = partes.objetivo;
      narrativa = partes.descricao;
      planoAcaoIa = partes.planoAcao;
      planoMelhoriaIa = partes.planoMelhoria;
      conclusaoIa = partes.conclusao;
      tratativaIa = partes.tratativa;
    } catch {
      setAvisoIa('A leitura automática não entrou nesta geração. O objetivo e o resumo foram escritos com os registros desta OS e seguem para revisão antes de salvar.');
    }
    const fotosTratativa = await Promise.all(fotos.map(async (f) => {
      const dataUrl = await new Promise<string>((resolve) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result || ''));
        leitor.onerror = () => resolve(f.preview);
        leitor.readAsDataURL(f.file);
      });
      return { legenda: `Tratativa — ${f.nome}`, url: dataUrl || f.preview };
    }));
    setHtml(buildOsActionPlanHtml({
      ...dados,
      tratativaTexto: textoEhRelatorioColado(texto) ? null : (texto.trim() || null),
      objetivoIa,
      narrativaIa: narrativa,
      planoAcaoIa,
      planoMelhoriaIa,
      conclusaoIa,
      tratativaIa,
      fotosTratativa,
      geradoEm: new Date().toISOString(),
    }));
    setGerando(false);
  };

  const quadro = () => document.getElementById('os-action-plan-frame') as HTMLIFrameElement | null;

  const imprimir = () => {
    const frame = quadro();
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
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
    let autor: string | null = null;
    try {
      const bruto = localStorage.getItem('userData');
      if (bruto) {
        const usuario = JSON.parse(bruto) as { name?: string; nome?: string };
        autor = usuario.name || usuario.nome || null;
      }
    } catch { autor = null; }
    const vivo = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
    if (/apurar a atualiza[cç][aã]o registrada/i.test(vivo) || /<td[^>]*>[^<]{400,}/i.test(vivo)) {
      setAvisoIa('Esta versão ainda copia texto bruto para o plano. Gere o relatório visual de novo antes de salvar.');
      setSalvando(false);
      return;
    }
    const resultado = await salvarPlanoAcaoOs(missionId, vivo, autor);
    setAvisoIa(resultado.aviso);
    setHtml(vivo);
    setEditando(false);
    setSalvando(false);
  };

  return (
    <div className="fixed inset-0 z-[260] bg-black/75 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-[#f7f4f2] rounded-3xl w-full max-w-6xl h-[92vh] flex flex-col shadow-[0_24px_60px_rgba(0,0,0,.35)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 bg-gradient-to-r from-[#14080c] to-[#9f1239] text-white flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide">Plano de Ação desta OS</h3>
            <p className="text-[12px] text-rose-100">{missionId}{dados ? ` · ${dados.clientName}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {html && (
              <>
                <button type="button" onClick={() => { setHtml(null); setEditando(false); }} className="rounded-xl bg-white/15 px-3 py-2 text-[11px] font-black uppercase">Voltar ao formulário</button>
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
          {dados && !html && (
            <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
              <form className="bg-white rounded-2xl p-4 shadow-[0_12px_28px_rgba(17,24,39,.08)] space-y-3" onSubmit={(e) => { e.preventDefault(); void gerar(true); }}>
                <h4 className="text-[12px] font-black uppercase tracking-wide text-rose-900">Formulário da tratativa</h4>
                <p className="text-[12px] text-gray-500">Escreva o que aconteceu e anexe os prints do WhatsApp. A IA lê as fotos e reescreve o contexto com base nelas e nos dados desta OS.</p>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={7}
                  placeholder="Descreva a tratativa, o que o cliente ou a equipe informou, e o que deve constar no plano..."
                  className="w-full rounded-xl border border-rose-100 bg-rose-50/40 px-3 py-2 text-sm"
                  data-testid="input-os-action-context"
                />
                <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-rose-200 px-3 py-4 text-[12px] font-bold text-rose-900 cursor-pointer">
                  <ImagePlus size={16} /> Anexar prints da tratativa (até 6)
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => escolherFotos(e.target.files)} data-testid="input-os-action-photos" />
                </label>
                {fotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {fotos.map((f) => <img key={f.preview} src={f.preview} alt={f.nome} className="h-20 w-full object-cover rounded-lg" />)}
                  </div>
                )}
                {avisoIa && <p className="text-[12px] font-bold text-amber-700">{avisoIa}</p>}
                <button type="submit" disabled={gerando} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#9f1239] to-[#e11d2e] text-white px-4 py-3 text-[12px] font-black uppercase shadow-lg disabled:opacity-60" data-testid="button-generate-os-action-plan">
                  <Sparkles size={16} /> {gerando ? 'Lendo a tratativa...' : 'Gerar relatório visual'}
                </button>
                <button type="button" disabled={gerando} onClick={() => void gerar(false)} className="w-full rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-700">
                  Gerar só com os dados da OS
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
              {avisoIa && <p className="px-4 py-2 text-[12px] font-bold text-amber-800 bg-amber-50">{avisoIa}</p>}
              <iframe id="os-action-plan-frame" title={`Plano de Ação ${missionId}`} className="w-full flex-1 bg-white" srcDoc={html} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OsActionPlanModal;
