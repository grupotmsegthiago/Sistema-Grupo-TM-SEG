import { formatDateTimeBR } from '../dateUtils';
import { analisarOcorrencia } from './analisarOcorrencia';
import { htmlMapaMissao, htmlQuadroAtualizacoes } from './diarioOperacional';
import { htmlCroqui, montarCroqui } from './montarCroqui';
import { narrativaAceitaParaCliente, prosaHumana } from './linguagemCliente';
import {
  textoEhRelatorioColado,
  textoEhRotina,
  type LinhaPlano,
  type StatusPlano,
} from './montarPlanos';
import type { OsActionPlanInput } from './types';

export type StatusApuracao = 'Preliminar' | 'Em andamento' | 'Concluída';
export type ClasseInfo = 'registrado' | 'relatado' | 'estimado' | 'pendente';

export interface CampoId {
  rotulo: string;
  valor: string;
}

export interface EventoRelatorio {
  time: string;
  event: string;
  source: string;
  certainty: ClasseInfo;
}

export interface LinhaContencao {
  id: string;
  acao: string;
  responsavel: string;
  data: string;
  status: StatusPlano;
  evidencia: string;
}

export interface LinhaCronograma {
  quando: string;
  id: string;
  descricao: string;
  status: string;
}

export interface LinhaIndicador {
  nome: string;
  meta: string;
  frequencia: string;
  responsavel: string;
  resultado: string;
}

export interface RelatorioOcorrencia {
  documento: {
    titulo: string;
    numero: string;
    os: string;
    se: string;
    cliente: string;
    operacao: string;
    dataOperacao: string;
    emitente: string;
    destinatario: string;
    contato: string;
    classificacao: string;
    dataEmissao: string;
    statusApuracao: StatusApuracao;
  };
  identificacao: CampoId[];
  objetivo: string;
  objetivoIa: boolean;
  resumo: string;
  resumoIa: boolean;
  descricao: string;
  cincoW2H: CampoId[];
  cronologia: EventoRelatorio[];
  registros: Array<CampoId & { quando: string; fonte: string }>;
  telemetria: string;
  evidencias: Array<{ url: string; legenda: string; local: string; quando: string }>;
  anexos: string[];
  analise: {
    fatosConfirmados: string[];
    relatos: string[];
    divergencias: string[];
    limitacoes: string[];
    causa: string;
    hipoteses: string[];
  };
  acoesContencao: LinhaContencao[];
  planoAcao: Array<LinhaPlano & { id: string }>;
  planoMelhoria: Array<LinhaPlano & { id: string }>;
  cronograma: LinhaCronograma[];
  indicadores: LinhaIndicador[];
  pendenciasConclusao: string[];
  encerramento: string;
  procedimento: string[] | null;
  rastreio: Array<{ tipo: string; descricao: string; fonte: string; registroId: string }>;
}

const NAO = 'Não informado';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hora(iso: string | null | undefined): string {
  if (!iso) return 'Horário a confirmar';
  const t = formatDateTimeBR(iso);
  return t && t !== '—' ? t : 'Horário a confirmar';
}

function info(valor: string | null | undefined): string {
  const t = String(valor || '').trim();
  return t && t !== '—' ? t : NAO;
}

function semAcento(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function textoCurtoAceito(texto: string | null | undefined, limite: number): string {
  const t = String(texto || '').trim();
  if (!t || t.length > limite || textoEhRelatorioColado(t) || t.includes('|')) return '';
  return t;
}

function localInformado(texto: string): string {
  return texto.split('|').slice(1).join(' ').replace(/\s+/g, ' ').trim().replace(/,?\s*brasil$/i, '');
}

type TipoRelato = 'inicio' | 'parada' | 'reinicio' | 'entrega' | 'velocidade' | 'repasse' | 'outro';

function lerAtualizacao(texto: string): { tipo: TipoRelato; cartao: string; narrativa: (quando: string, quem: string) => string } | null {
  if (textoEhRelatorioColado(texto)) return null;
  const corpo = texto.split('|')[0].trim();
  const n = semAcento(corpo);
  const local = localInformado(texto);
  const onde = local ? ` O ponto lançado na mensagem é ${local}.` : '';
  const lugar = local ? `, no ponto indicado na mensagem (${local})` : '';
  if (/alta velocidade|saiu a frente|nao atende|tentando contato/.test(n)) {
    return {
      tipo: 'velocidade',
      cartao: `Relato da equipe: o condutor em velocidade alta, à frente da escolta, sem retorno ao contato.${onde} Não há medição neste documento que confirme a velocidade nem a falta de contato.`,
      narrativa: (quando, quem) => `Em ${quando}, ${quem} relatou que o condutor seguia em velocidade alta, tinha saído à frente da escolta e não atendia ao contato${lugar}. Não há medição, aqui, que confirme a velocidade nem essa falta de contato.`,
    };
  }
  if (/passad[oa].{0,50}localiza/.test(n)) {
    return {
      tipo: 'repasse',
      cartao: `A central registrou que a posição foi repassada à equipe.${onde}`,
      narrativa: (quando, quem) => `Em ${quando}, ${quem} registrou que a posição foi repassada à equipe${lugar}.`,
    };
  }
  if (/^inicio de miss/.test(n)) {
    return {
      tipo: 'inicio',
      cartao: `A equipe informou o início da missão.${onde}`,
      narrativa: (quando, quem) => `Em ${quando}, ${quem} informou o início da missão${lugar}.`,
    };
  }
  if (/entregue|fim de miss/.test(n)) {
    return {
      tipo: 'entrega',
      cartao: `A equipe informou a entrega em segurança e o fim operacional da missão. Esse relato não encerra a apuração.${onde}`,
      narrativa: (quando, quem) => `Em ${quando}, ${quem} informou que o veículo foi entregue em segurança e que a missão chegou ao fim operacional${lugar}. Isso encerra o relato da viagem, não a apuração.`,
    };
  }
  if (/reinicio/.test(n)) {
    const seguro = /seguran/.test(n);
    return {
      tipo: 'reinicio',
      cartao: seguro
        ? `A equipe informou o reinício e que o veículo seguia em segurança. É relato.${onde}`
        : `A equipe informou o reinício da viagem.${onde}`,
      narrativa: (quando, quem) => seguro
        ? `Em ${quando}, ${quem} informou o reinício e que o veículo seguia em segurança${lugar}.`
        : `Em ${quando}, ${quem} informou o reinício da viagem${lugar}.`,
    };
  }
  if (/parada|\brf\b|descanso/.test(n)) {
    const descanso = /\brf\b|descanso|repouso/.test(n);
    return {
      tipo: 'parada',
      cartao: descanso
        ? `A equipe informou parada para descanso do condutor. O motivo está no lançamento e segue como relato.${onde}`
        : `A equipe informou uma parada. O texto original não foi copiado, e o motivo segue sem confirmação.${onde}`,
      narrativa: (quando, quem) => descanso
        ? `Em ${quando}, ${quem} informou parada para descanso do condutor${lugar}. O motivo está escrito no lançamento e não há outro documento, aqui, que o confirme.`
        : `Em ${quando}, ${quem} informou uma parada, sem explicar o motivo${lugar}.`,
    };
  }
  if (!corpo || textoEhRotina(texto) || textoEhRotina(corpo)) return null;
  if (corpo.length <= 140) {
    return {
      tipo: 'outro',
      cartao: `${corpo}. O complemento de local, se houver, não comprova a causa.`,
      narrativa: (quando, quem) => `Em ${quando}, ${quem} relatou: “${corpo}”${lugar}.`,
    };
  }
  return {
    tipo: 'outro',
    cartao: `Há um apontamento longo da equipe. O texto integral não foi copiado.${onde}`,
    narrativa: (quando, quem) => `Em ${quando}, ${quem} fez um apontamento longo${lugar}. A cronologia registra a mensagem sem copiar o texto bruto.`,
  };
}

function redigirAtualizacao(texto: string): string | null {
  return lerAtualizacao(texto)?.cartao ?? null;
}

function marco(d: OsActionPlanInput, status: string): string | null {
  const item = [...(d.linhaDoTempo || [])].reverse().find((m) => m.status === status);
  return item?.quando || null;
}

function atrasoTexto(minutos: number | null): string {
  if (minutos == null) return NAO;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h > 0 && m > 0) return `${h} hora${h > 1 ? 's' : ''} e ${m} minuto(s)`;
  if (h > 0) return `${h} hora${h > 1 ? 's' : ''}`;
  return `${m} minuto(s)`;
}

function rosto(tipo: 'robo' | 'equipe'): string {
  if (tipo === 'robo') {
    return `<svg class="rosto" width="36" height="36" viewBox="0 0 64 64" aria-hidden="true"><rect x="18" y="6" width="28" height="10" rx="3" fill="#b91c1c"/><text x="32" y="14" text-anchor="middle" font-size="7" fill="#fff">IA</text><rect x="14" y="18" width="36" height="28" rx="6" fill="#e2e8f0" stroke="#334155"/><circle cx="26" cy="30" r="3" fill="#0f172a"/><circle cx="38" cy="30" r="3" fill="#0f172a"/></svg>`;
  }
  return `<svg class="rosto" width="36" height="36" viewBox="0 0 64 64" aria-hidden="true"><circle cx="34" cy="38" r="15" fill="#f1c7a4"/><path d="M16 32c1-16 36-16 38 0v4H16z" fill="#b91c1c"/><rect x="14" y="30" width="40" height="6" rx="2" fill="#111827"/><text x="34" y="28" text-anchor="middle" font-size="7" fill="#fff">TM</text></svg>`;
}

function lista(itens: string[]): string {
  return `<ul>${itens.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
}

function campos(itens: CampoId[]): string {
  return itens.map((c) => `<p><strong>${esc(c.rotulo)}:</strong> ${esc(c.valor)}</p>`).join('');
}

export function selecionarFotos<T extends { quando?: string | null }>(fotos: T[], maximo = 6): T[] {
  const comHora = fotos.filter((f) => f.quando);
  const semHora = fotos.filter((f) => !f.quando);
  const ordenadas = [...comHora].sort((a, b) => String(a.quando).localeCompare(String(b.quando))).concat(semHora);
  if (ordenadas.length <= maximo) return ordenadas;
  const ultimo = ordenadas.length - 1;
  const escolhidas = new Set<number>([0, ultimo]);
  const meio = maximo - 2;
  for (let i = 1; i <= meio; i += 1) escolhidas.add(Math.round((i * ultimo) / (meio + 1)));
  return [...escolhidas].sort((a, b) => a - b).map((i) => ordenadas[i]);
}

function prosa(texto: string): string {
  return texto.split(/\n\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
}

function quandoProsa(iso: string | null | undefined): string {
  const t = hora(iso);
  if (!iso || t === 'Horário a confirmar') return 'horário ainda a confirmar';
  const [data, hm] = t.split(', ');
  return hm ? `${data}, às ${hm}` : t;
}

function soHora(iso: string | null | undefined): string {
  const t = hora(iso);
  return t.split(', ')[1] || '';
}

function horaComH(iso: string | null | undefined): string {
  const h = soHora(iso);
  const partes = h.split(':');
  if (partes.length < 2) return h;
  return `${partes[0]}h${partes[1]}`;
}

function tituloLocal(texto: string): string {
  const pequenos = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return texto.toLowerCase().split(/\s+/).filter(Boolean).map((parte, i) => {
    if (/^br-\d+/.test(parte)) return parte.toUpperCase();
    if (parte === 'km') return 'km';
    if (i > 0 && pequenos.has(parte)) return parte;
    return parte.charAt(0).toUpperCase() + parte.slice(1);
  }).join(' ');
}

function lugarCurto(bruto: string | null | undefined): string {
  const origem = String(bruto || '').trim();
  if (!origem || origem === NAO) return '';
  const limpo = origem.replace(/,?\s*brasil$/i, '').replace(/\b\d{5}-?\d{3}\b/g, '').replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '');
  const partes = limpo.split(',').map((p) => p.trim()).filter(Boolean);
  let cidade = '';
  let uf = '';
  let cidadeIdx = -1;
  for (let i = 0; i < partes.length; i += 1) {
    const achou = partes[i].match(/^(.*?)\s*-\s*([A-Za-z]{2})$/);
    if (achou && achou[1].trim()) {
      cidade = tituloLocal(achou[1].trim());
      uf = achou[2].toUpperCase();
      cidadeIdx = i;
      break;
    }
  }
  const viaBruta = (partes[0] || '').replace(/\s+\d+$/, '').trim();
  let via = tituloLocal(viaBruta)
    .replace(/^Av\.\s/i, 'Avenida ')
    .replace(/^Rod\.\s/i, 'Rodovia ')
    .replace(/^Estr\.\s/i, 'Estrada ')
    .replace(/^R\.\s/i, 'Rua ');
  const miolo = cidadeIdx > 1 ? partes[cidadeIdx - 1] : '';
  const km = miolo.match(/\bkm\s*\d+\b/i);
  if (km) via = `${via}, ${km[0].toLowerCase()}`;
  const bairroBruto = miolo.replace(/^\d+\s*-\s*/, '').replace(/\bkm\s*\d+\b/i, '').replace(/\s*-\s*[A-Za-z]{2}$/, '').trim();
  const bairro = bairroBruto && !/^\d+$/.test(bairroBruto) ? tituloLocal(bairroBruto) : '';
  if (cidade && via && via.toLowerCase() !== cidade.toLowerCase()) {
    const noBairro = bairro && bairro.toLowerCase() !== cidade.toLowerCase() ? `, ${bairro}` : '';
    return `${via}${noBairro}, em ${cidade}/${uf}`;
  }
  if (cidade) return `${cidade}/${uf}`;
  return tituloLocal(limpo);
}

function paragrafoRelatos(atualizacoes: OsActionPlanInput['atualizacoes']): { texto: string; teveParada: boolean; teveEntrega: boolean; teveVelocidade: boolean } {
  const momentos = (atualizacoes || [])
    .map((a) => ({ ...a, leitura: lerAtualizacao(a.texto) }))
    .filter((a): a is typeof a & { leitura: NonNullable<ReturnType<typeof lerAtualizacao>> } => Boolean(a.leitura));
  if (!momentos.length) return { texto: '', teveParada: false, teveEntrega: false, teveVelocidade: false };
  const visiveis = momentos.length > 8 ? [...momentos.slice(0, 6), ...momentos.slice(-2)] : momentos;
  let anterior = '';
  const frases = visiveis.map((m) => {
    const h = soHora(m.quando);
    const lugar = lugarCurto(localInformado(m.texto));
    const mesmo = Boolean(lugar && lugar === anterior);
    if (lugar) anterior = lugar;
    const onde = !lugar ? '' : mesmo ? ' no mesmo ponto' : `, na ${lugar}`;
    const horaTxt = h ? ` às ${h}` : '';
    if (m.leitura.tipo === 'inicio') return `A viagem começou${horaTxt}${onde}.`;
    if (m.leitura.tipo === 'velocidade') return `${h ? `Por volta das ${h}` : 'No percurso'}, a escolta relatou que o condutor seguia em velocidade alta, à frente da viatura, e não atendia ao contato${onde}. Não há medição neste documento que confirme a velocidade nem a falta de contato.`;
    if (m.leitura.tipo === 'repasse') return 'Na sequência, a posição foi repassada à equipe.';
    if (m.leitura.tipo === 'reinicio') {
      const seguro = /seguran/.test(semAcento(m.texto));
      return `${h ? `Às ${h}` : 'Depois'}, a viagem foi reiniciada${onde}${seguro ? ', com o relato de que o veículo seguia em segurança' : ''}.`;
    }
    if (m.leitura.tipo === 'parada') {
      const descanso = /\brf\b|descanso|repouso/.test(semAcento(m.texto));
      return descanso
        ? `${h ? `Às ${h}` : 'Mais adiante'} houve parada para descanso do condutor${onde}.`
        : `${h ? `Às ${h}` : 'No caminho'} houve uma parada${onde}, sem motivo explicado no lançamento.`;
    }
    if (m.leitura.tipo === 'entrega') return `${h ? `Às ${h}` : 'Ao final'}, a equipe informou a entrega em segurança${onde}.`;
    const curto = m.texto.split('|')[0].trim();
    if (curto.length > 0 && curto.length <= 120) return `${h ? `Às ${h}` : 'No caminho'}, a equipe relatou: “${curto}”${onde}.`;
    return `${h ? `Às ${h}` : 'No caminho'}, houve um apontamento da equipe que a cronologia resume, sem copiar o texto bruto.`;
  });
  const aviso = momentos.some((m) => m.leitura.tipo === 'velocidade')
    ? ' Este trecho é o relato da equipe. Não é leitura de telemetria.'
    : '';
  const resto = momentos.length > 8 ? ' Os demais apontamentos ficam na cronologia.' : '';
  return {
    texto: `${frases.join(' ')}${aviso}${resto}`,
    teveParada: momentos.some((m) => m.leitura.tipo === 'parada'),
    teveEntrega: momentos.some((m) => m.leitura.tipo === 'entrega'),
    teveVelocidade: momentos.some((m) => m.leitura.tipo === 'velocidade'),
  };
}

export function montarRelatorioOcorrencia(d: OsActionPlanInput): RelatorioOcorrencia {
  const cliente = d.clientName || 'Cliente não identificado';
  const nome = cliente.toUpperCase();
  const ocorrenciasUteis = d.ocorrencias.filter((o) => !textoEhRelatorioColado(o.texto));
  const relevantes = (d.atualizacoes || []).filter((a) => redigirAtualizacao(a.texto));
  const rotina = (d.atualizacoes || []).filter((a) => !lerAtualizacao(a.texto) && textoEhRotina(a.texto)).length;
  const colados = [...(d.atualizacoes || []), ...d.ocorrencias.map((o) => ({ texto: o.texto }))]
    .filter((a) => textoEhRelatorioColado(a.texto)).length
    + (d.tratativaTexto && textoEhRelatorioColado(d.tratativaTexto) ? 1 : 0);
  const historicoFalhou = d.historicoEstado === 'ERRO' || d.historicoEstado === 'NÃO CARREGADO' || d.historicoEstado === 'CONSULTA INCOMPLETA';
  const ocorrenciasIncompletas = d.consultaOcorrencias === 'ERRO' || d.consultaOcorrencias === 'CONSULTA INCOMPLETA';
  const aberta = ocorrenciasUteis.some((o) => !o.resolvida) || relevantes.length > 0 || colados > 0 || historicoFalhou;
  const statusApuracao: StatusApuracao = !aberta && ocorrenciasUteis.some((o) => o.resolvida)
    ? 'Concluída'
    : relevantes.length > 0 || ocorrenciasUteis.some((o) => !o.resolvida)
      ? 'Em andamento'
      : 'Preliminar';
  const chegada = marco(d, 'Origem');
  const saida = marco(d, 'Em Viagem');
  const fimMarco = marco(d, 'Concluída');
  const atraso = d.atrasoMinutosOrigem != null
    ? atrasoTexto(d.atrasoMinutosOrigem)
    : chegada && d.horarioProgramado && new Date(chegada).getTime() <= new Date(d.horarioProgramado).getTime()
      ? 'Sem atraso calculado: a chegada registrada é anterior ao horário programado.'
      : NAO;
  const contato = [d.cadastro?.contato, d.cadastro?.telefone].filter(Boolean).join(' · ') || NAO;

  const cronologia: EventoRelatorio[] = [];
  const registros: RelatorioOcorrencia['registros'] = [];
  for (const m of d.linhaDoTempo || []) {
    if (!m.status) continue;
    registros.push({
      rotulo: m.status,
      valor: m.por ? `Lançado por ${m.por}` : 'Lançamento no histórico da OS',
      quando: hora(m.quando),
      fonte: 'Histórico da OS — status',
    });
    if (/origem|em viagem|conclu|cancel|recus/i.test(m.status)) {
      cronologia.push({
        time: hora(m.quando),
        event: `A central lançou o status ${m.status}. O horário é o do registro no sistema.`,
        source: 'Histórico da OS — status',
        certainty: 'registrado',
      });
    }
  }
  for (const o of ocorrenciasUteis) {
    const curto = o.texto.trim().slice(0, 140);
    cronologia.push({
      time: hora(o.quando),
      event: o.resolvida
        ? `Ocorrência formal registrada e marcada como resolvida: ${curto}.`
        : `Ocorrência formal registrada: ${curto}.`,
      source: o.autor ? `Ocorrência da OS · ${o.autor}` : 'Ocorrência da OS',
      certainty: 'registrado',
    });
  }
  const foco = String(d.problemaPrincipal || '').trim();
  const focoN = semAcento(foco);
  for (const a of d.atualizacoes || []) {
    const nAtual = semAcento(a.texto);
    if (foco && /\brf\b|descanso|repouso/.test(nAtual) && !/descanso|repouso|\brf\b/.test(focoN)) continue;
    if (foco && textoEhRotina(a.texto)) continue;
    let evento = redigirAtualizacao(a.texto);
    if (foco && /alta velocidade|velocidade alta|saiu a frente/.test(nAtual) && !/velocidade/.test(focoN)) {
      evento = 'A equipe informou que o veículo estava à frente da escolta e sem retorno ao contato.';
    }
    if (!evento) continue;
    cronologia.push({
      time: hora(a.quando),
      event: evento,
      source: a.por ? `Atualização da missão · ${a.por}` : 'Atualização da missão',
      certainty: 'relatado',
    });
  }

  const fimIso = d.horarioFim || fimMarco;
  const tipo = info(d.tipo).toLowerCase();
  const se = d.seNumber ? `, vinculada à S.E. ${d.seNumber}` : '';
  const relatosEquipe = paragrafoRelatos(d.atualizacoes);
  const cedo = Boolean(
    d.atrasoMinutosOrigem == null
    && chegada
    && d.horarioProgramado
    && new Date(chegada).getTime() <= new Date(d.horarioProgramado).getTime(),
  );
  const dataCurta = hora(d.horarioProgramado).split(', ')[0];
  const horaPrevista = horaComH(d.horarioProgramado);
  const objetivoEscrito = textoCurtoAceito(d.objetivoIa, 900);
  const objetivo = objetivoEscrito || [
    `O presente relatório tem por objetivo apresentar à ${cliente} os registros disponíveis sobre a execução da escolta ${tipo} vinculada à OS ${d.missionId}${se}, prevista para ${dataCurta || 'data a confirmar'}${horaPrevista ? `, às ${horaPrevista}` : ''}, e documentar os pontos que permanecem pendentes de esclarecimento.`,
    d.status === 'Concluída' && statusApuracao !== 'Concluída'
      ? 'Embora a missão conste como encerrada no sistema, a apuração dos fatos relatados durante o percurso continua em andamento.'
      : statusApuracao === 'Concluída'
        ? 'A ocorrência formal consta resolvida no cadastro. O envio ao cliente ainda depende de quem aprova este documento.'
        : `A missão segue ${info(d.status)} e a apuração dos fatos relatados continua em andamento.`,
    'Assim, este documento distingue as informações registradas dos aspectos ainda não confirmados, sem antecipar conclusões ou atribuir responsabilidades que não estejam amparadas pelos elementos disponíveis.',
  ].join(' ');

  const horaProg = soHora(d.horarioProgramado);
  const horaChegada = soHora(chegada);
  const horaSaida = soHora(saida);
  const horaFim = soHora(fimIso);
  const origemCurta = lugarCurto(d.origem) || info(d.origem);
  const destinoCurto = lugarCurto(d.destino) || info(d.destino);
  const tempoViagem = horaChegada && horaSaida
    ? cedo
      ? `A equipe já estava na origem às ${horaChegada}${horaProg ? `, antes das ${horaProg}` : ''}, e a saída se deu às ${horaSaida}.`
      : d.atrasoMinutosOrigem != null
        ? `A chegada na origem foi às ${horaChegada}, com atraso de ${atrasoTexto(d.atrasoMinutosOrigem)} sobre o horário combinado${horaProg ? ` das ${horaProg}` : ''}, e a saída se deu às ${horaSaida}.`
        : `A chegada na origem foi às ${horaChegada} e a saída às ${horaSaida}.`
    : horaProg
      ? `O horário combinado era ${horaProg}.`
      : '';
  const fimFrase = horaFim ? ` O encerramento ficou registrado às ${horaFim}.` : '';
  const fotos = selecionarFotos([...(d.fotos || []), ...(d.fotosTratativa || [])].filter((f) => f.url), 6);
  const totalFotos = [...(d.fotos || []), ...(d.fotosTratativa || [])].filter((f) => f.url).length;
  const fotosTexto = fotos.length === 0
    ? ''
    : ` As imagens que acompanham o documento${totalFotos > 6 ? ', a primeira, a última e pontos do meio,' : ''} devem ser avaliadas apenas pelo que efetivamente mostram.`;
  const historiaBruta = relatosEquipe.texto || `A viagem seguiu de ${origemCurta} para ${destinoCurto}${tempoViagem ? `. ${tempoViagem}` : ''}${fimFrase}`;
  const historia = `Segundo o relato da equipe durante o percurso, ${historiaBruta.charAt(0).toLowerCase()}${historiaBruta.slice(1)}`;
  const formal = ocorrenciasUteis.length
    ? `Houve ocorrência formal no cadastro${ocorrenciasUteis[0].resolvida ? ', marcada como resolvida' : ', ainda em aberto'}: “${ocorrenciasUteis[0].texto.trim().slice(0, 160)}”.`
    : ocorrenciasIncompletas
      ? 'A leitura das ocorrências formais não fechou. Não dá para afirmar que não há ocorrência.'
      : 'Não há ocorrência formal lançada nesta OS.';
  const limite = relatosEquipe.teveVelocidade
    ? 'Como não há elementos independentes suficientes para confirmar a velocidade do caminhão ou reconstituir integralmente a sequência dos contatos e da localização, a ocorrência permanece sujeita à análise dos registros operacionais e das imagens disponíveis.'
    : historicoFalhou
      ? 'O histórico da missão não carregou por completo. A ocorrência permanece sujeita à análise dos registros operacionais e das imagens disponíveis.'
      : 'A ocorrência permanece sujeita à análise dos registros operacionais e das imagens disponíveis.';
  const apontamento = relatosEquipe.teveVelocidade
    ? 'Preliminarmente, o relato aponta perda de acompanhamento, com informação de velocidade alta e de falta de contato com o condutor. Essa circunstância é relatada, mas não determina, por si só, a causa da falha.'
    : relatosEquipe.teveParada
      ? 'Preliminarmente, o relato aponta uma parada no percurso. Essa circunstância é relatada, mas não determina, por si só, a causa de qualquer falha.'
      : 'Preliminarmente, os registros consultados não apontam fato fora da rotina que, por si só, explique uma falha. Uma circunstância apenas relatada não determina, por si só, a causa.';
  const narrativa = textoCurtoAceito(d.narrativaIa, 700);
  const conclusao = statusApuracao === 'Concluída'
    ? 'Preliminarmente, a ocorrência formal está marcada como resolvida no cadastro. Isso não dispensa a leitura de quem aprova o documento antes do envio. O encerramento da missão e o encerramento da apuração são registros distintos.'
    : d.status === 'Concluída'
      ? 'A missão está encerrada no sistema. A apuração segue pendente de confirmação até a análise dos registros e das imagens. Não há data definida para a versão final.'
      : 'A apuração segue pendente de confirmação. A missão ainda não está encerrada, e o que há até aqui não autoriza uma data para a versão final.';
  const resumo = [
    `${historia} ${formal}${fotosTexto}`,
    `${apontamento} ${limite}`,
    narrativa ? `Leitura ainda sem validação humana: ${narrativa}` : '',
    conclusao,
  ].map((p) => p.trim()).filter(Boolean).join('\n\n');

  const tratativa = textoCurtoAceito(d.tratativaTexto, 280);
  const tratativaIa = textoCurtoAceito(d.tratativaIa, 400);
  const relatos = [
    tratativa ? `Relato complementar informado para esta apuração: ${tratativa}` : '',
    foco ? '' : (tratativaIa || ''),
  ].filter(Boolean);

  const analiseAuto = analisarOcorrencia(d);
  const contencao: LinhaContencao[] = [];
  const corretivas = analiseAuto.acao;
  const preventivas = analiseAuto.melhoria.filter((l) => !corretivas.some((c) => c.acao === l.acao));
  const cronograma: LinhaCronograma[] = [...corretivas, ...preventivas].map((l) => ({
    quando: l.prazo || 'A definir',
    id: l.id,
    descricao: l.acao,
    status: l.status,
  }));

  const complementoSe = d.seNumber ? `Número S.E.: ${d.seNumber}` : '';
  const dhl = nome.includes('DHL') ? 'O Plano de Ação DHL da diretoria permanece no botão próprio desta OS.' : '';
  const ceslog = d.referenceNumber && (nome.includes('CESLOG') || nome.includes('CESARI'))
    ? `Número de referência CESLOG/CESARI: ${d.referenceNumber}`
    : '';

  return {
    documento: {
      titulo: String(d.problemaPrincipal || '').trim() ? 'Relatório de Ocorrência e Plano de Ação' : 'Plano de Ação e Justificativa de Ocorrência',
      numero: d.missionId,
      os: d.missionId,
      se: info(d.seNumber),
      cliente,
      operacao: info(d.tipo),
      dataOperacao: hora(d.horarioProgramado),
      emitente: 'Grupo TM SEG — Operações / Gerenciamento de Risco',
      destinatario: cliente,
      contato,
      classificacao: 'Uso operacional — apresentação ao cliente',
      dataEmissao: hora(d.geradoEm),
      statusApuracao,
    },
    identificacao: [
      { rotulo: 'Número da OS', valor: d.missionId },
      { rotulo: 'S.E.', valor: info(d.seNumber) },
      { rotulo: 'Cliente', valor: cliente },
      { rotulo: 'Operação', valor: info(d.tipo) },
      { rotulo: 'Data da operação', valor: hora(d.horarioProgramado) },
      { rotulo: 'Veículo escoltado', valor: [d.placaCarga, d.modeloCarga].filter(Boolean).join(' — ') || NAO },
      { rotulo: 'Viatura de escolta', valor: [d.placaViatura, d.modeloViatura].filter(Boolean).join(' — ') || NAO },
      { rotulo: 'Agentes', valor: d.equipe.length ? d.equipe.join(' / ') : NAO },
      { rotulo: 'Motorista', valor: info(d.motorista) },
      { rotulo: 'Origem', valor: info(d.origem) },
      { rotulo: 'Destino', valor: info(d.destino) },
      { rotulo: 'Horário programado', valor: hora(d.horarioProgramado) },
      { rotulo: 'Chegada na origem', valor: hora(chegada) },
      { rotulo: 'Início / em viagem', valor: hora(saida) },
      { rotulo: 'Encerramento registrado', valor: hora(d.horarioFim || fimMarco) },
      { rotulo: 'Atraso na origem', valor: atraso },
      { rotulo: 'Abertura da OS', valor: hora(d.criadoEm) },
      { rotulo: 'Hodômetro inicial', valor: info(d.kmInicial) },
      { rotulo: 'Hodômetro final', valor: info(d.kmFinal) },
      { rotulo: 'Status da missão', valor: info(d.status) },
      { rotulo: 'Status da apuração', valor: statusApuracao },
      { rotulo: 'Contato do destinatário', valor: contato },
      ...(complementoSe ? [{ rotulo: 'Identificação', valor: complementoSe }] : []),
      ...(dhl ? [{ rotulo: 'Documento DHL', valor: dhl }] : []),
      ...(ceslog ? [{ rotulo: 'Referência', valor: ceslog }] : []),
    ],
    objetivo: foco
      ? `Este relatório trata da OS ${d.missionId}. Problema informado para a apuração: ${foco} Esse texto define o foco e não é, por si só, fato comprovado.`
      : objetivo,
    objetivoIa: Boolean(objetivoEscrito) && !foco,
    resumo: foco ? analiseAuto.conclusao : resumo,
    resumoIa: false,
    descricao: resumo,
    cincoW2H: [
      { rotulo: 'O que', valor: `Operação ${info(d.tipo)} da OS ${d.missionId}.` },
      { rotulo: 'Quando', valor: `Programado ${hora(d.horarioProgramado)}. Fim ${hora(d.horarioFim || fimMarco)}.` },
      { rotulo: 'Onde', valor: `${info(d.origem)} para ${info(d.destino)}.` },
      { rotulo: 'Quem', valor: `Condutor ${info(d.motorista)}. Equipe ${d.equipe.join(' / ') || NAO}.` },
      { rotulo: 'Como', valor: registros.length ? `${registros.length} marco(s) de status no histórico.` : 'Pendente de confirmação.' },
      { rotulo: 'Por que', valor: ocorrenciasUteis.length ? 'Ocorrência formal lançada. Causa em apuração.' : 'Pendente de confirmação.' },
      { rotulo: 'Impacto', valor: atraso === NAO ? 'Pendente de confirmação.' : atraso },
    ],
    cronologia,
    registros,
    telemetria: `Hodômetro inicial ${info(d.kmInicial)} e hodômetro final ${info(d.kmFinal)}, conforme o cadastro da OS. Esses números não identificam a causa de uma parada nem comprovam o que ocorreu entre os pontos.`,
    evidencias: fotos.map((f) => ({
      url: f.url,
      legenda: f.legenda || 'Tela de atualização da missão',
      local: f.local || 'Não informado',
      quando: f.quando ? hora(f.quando) : 'Horário a confirmar',
    })),
    anexos: fotos.map((f, i) => `Anexo ${i + 1}: ${f.legenda || 'sem legenda'}${f.local ? ` — ${f.local}` : ''}`),
    analise: {
      fatosConfirmados: [
        ...analiseAuto.itens.filter((i) => i.tipo === 'fato_confirmado').map((i) => i.descricao),
        `Atraso na origem: ${atraso}.`,
      ],
      relatos: [
        ...analiseAuto.itens.filter((i) => i.tipo === 'relato').map((i) => i.descricao),
        ...relatos,
      ].filter((t) => t.trim()).length
        ? [...analiseAuto.itens.filter((i) => i.tipo === 'relato').map((i) => i.descricao), ...relatos].filter((t) => t.trim())
        : ['Nenhum relato curto foi informado além dos registros do sistema.'],
      divergencias: analiseAuto.itens.some((i) => i.tipo === 'divergencia')
        ? analiseAuto.itens.filter((i) => i.tipo === 'divergencia').map((i) => i.descricao)
        : ['Não há divergência de horário ou de versão apontada entre as fontes lidas.'],
      limitacoes: [
        ...analiseAuto.itens.filter((i) => i.tipo === 'ausencia' || i.tipo === 'hipotese').map((i) => i.descricao),
        rotina && !foco ? `${rotina} atualização(ões) de rotina foram lidas só como contexto.` : '',
        colados ? 'Um texto extenso, com cara de relatório anterior, foi encontrado e não foi copiado para as células do plano.' : '',
        historicoFalhou ? 'Histórico da missão: NÃO CARREGADO. A cronologia pode estar incompleta.' : '',
        ocorrenciasIncompletas ? 'Ocorrências formais: CONSULTA INCOMPLETA.' : '',
        fotos.length ? 'A foto não comprova o que não estiver visível.' : '',
      ].filter(Boolean),
      causa: analiseAuto.causaTexto,
      hipoteses: ['Nenhuma hipótese foi promovida a fato. O que não está no registro permanece pendente de confirmação.'],
    },
    acoesContencao: contencao,
    planoAcao: corretivas,
    planoMelhoria: preventivas,
    procedimento: analiseAuto.procedimento,
    rastreio: analiseAuto.itens.map((i) => ({
      tipo: i.tipo,
      descricao: i.descricao,
      fonte: i.fonte,
      registroId: i.registroId,
    })),
    cronograma,
    indicadores: analiseAuto.indicadores.map((i) => ({
      nome: i.nome,
      meta: i.meta,
      frequencia: i.frequencia,
      responsavel: i.responsavel,
      resultado: i.resultado,
    })),
    pendenciasConclusao: [
      statusApuracao === 'Concluída'
        ? 'Não há pendência de apuração além do que já está marcado como resolvido na OS.'
        : 'Faltam confirmação e evidência para encerrar a apuração. O encerramento da missão, se houver, é outro fato.',
      historicoFalhou ? 'Recarregar o histórico da OS antes de emitir a versão final.' : '',
      !fotos.length ? 'Evidência fotográfica da etapa crítica: não localizada nos registros consultados.' : '',
      colados ? 'Revisar o texto longo somente se a pessoa usuária pedir para reabrir o relatório anterior.' : '',
    ].filter(Boolean),
    encerramento: analiseAuto.conclusao,
  };
}

function linhasDeFotos(fotos: RelatorioOcorrencia['evidencias']): string {
  const colunas = 3;
  const linhas: string[] = [];
  for (let i = 0; i < fotos.length; i += colunas) {
    const fatia = fotos.slice(i, i + colunas);
    const celulas = fatia.map((f) => `<td class="foto-celula"><div class="quadro"><img src="${esc(f.url)}" alt="${esc(f.legenda)}" /></div><p><strong>Descrição:</strong> ${esc(f.legenda)}</p><p><strong>Local:</strong> ${esc(f.local)}</p><p><strong>Quando:</strong> ${esc(f.quando)}</p></td>`).join('');
    const vazias = fatia.length < colunas ? '<td class="foto-celula"></td>'.repeat(colunas - fatia.length) : '';
    linhas.push(`<tr>${celulas}${vazias}</tr>`);
  }
  return linhas.join('');
}

function tabela(colunas: string[], linhas: string[][], modo: string): string {
  const cabeca = colunas.map((c) => `<th>${esc(c)}</th>`).join('');
  const corpo = linhas.map((celulas) => `<tr>${celulas.map((c) => `<td data-campo="celula">${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="grade" data-tabela="${modo}"><thead><tr>${cabeca}</tr></thead><tbody>${corpo}</tbody></table>`;
}

export function renderizarRelatorio(r: RelatorioOcorrencia): string {
  const doc = r.documento;
  const nivel = (c: ClasseInfo) => c === 'registrado' ? 'Registrado' : c === 'relatado' ? 'Relatado' : c === 'estimado' ? 'Estimado' : 'Pendente de confirmação';
  const cartoes = r.cronologia.length
    ? r.cronologia.map((e) => `<article class="cartao"><div class="quem">${rosto(e.certainty === 'registrado' ? 'equipe' : 'robo')}</div><div data-campo="cronologia"><strong>${esc(e.time)}</strong> <span class="nivel">${esc(nivel(e.certainty))}</span><p>${esc(e.event)}</p><small>Fonte: ${esc(e.source)}</small></div></article>`).join('')
    : '<p class="campo" data-campo="cronologia">Não localizado nos registros consultados. Atualizações de rotina não foram convertidas em evento.</p>';
  const galeria = r.evidencias.length
    ? `<table class="grade fotos-pagina" data-tabela="fotos"><tbody>${linhasDeFotos(r.evidencias)}</tbody></table>`
    : '<p>Não há evidência fotográfica localizada nos registros consultados.</p>';
  const avisoIa = (ligado: boolean) => ligado ? '<p class="aviso-plano">Sugestão da leitura automática. Aguarda validação humana antes de salvar.</p>' : '';

  return `<div class="legenda">${rosto('robo')}<span>Ilustração do assistente. Não é participante da ocorrência.</span>${rosto('equipe')}<span>Ilustração da equipe TM SEG. Não substitui foto nem relato.</span></div>
<section data-secao="documento">
  <h2>Identificação documental</h2>
  <div class="campo" data-campo="documento">
    <p><strong>Título:</strong> ${esc(doc.titulo)}</p>
    <p><strong>Documento:</strong> ${esc(doc.numero)}</p>
    <p><strong>OS:</strong> ${esc(doc.os)}</p>
    <p><strong>S.E.:</strong> ${esc(doc.se)}</p>
    <p><strong>Cliente e operação:</strong> ${esc(doc.cliente)} · ${esc(doc.operacao)}</p>
    <p><strong>Data da operação:</strong> ${esc(doc.dataOperacao)}</p>
    <p><strong>Emitente:</strong> ${esc(doc.emitente)}</p>
    <p><strong>Destinatário:</strong> ${esc(doc.destinatario)}</p>
    <p><strong>Contato:</strong> ${esc(doc.contato)}</p>
    <p><strong>Classificação:</strong> ${esc(doc.classificacao)}</p>
    <p><strong>Emissão:</strong> ${esc(doc.dataEmissao)}</p>
    <p><strong>Status da apuração:</strong> ${esc(doc.statusApuracao)}</p>
  </div>
</section>
<section data-secao="identificacao">
  <h2>Identificação da ocorrência</h2>
  <div class="campo" data-campo="identificacao">${campos(r.identificacao)}</div>
</section>
<section data-secao="objetivo">
  <h2>Objetivo do documento</h2>
  ${avisoIa(r.objetivoIa)}
  <div class="campo" data-campo="objetivo">${prosa(r.objetivo)}</div>
</section>
<section data-secao="resumo">
  <h2>Resumo dos fatos e conclusão</h2>
  ${avisoIa(r.resumoIa)}
  <div class="campo" data-campo="resumo">${prosa(r.resumo)}</div>
</section>
<section data-secao="cronologia">
  <h2>Cronologia da ocorrência</h2>
  <div class="trilha">${cartoes}</div>
</section>
<section data-secao="registros">
  <h2>Registros operacionais e evidências</h2>
  <h3>Registros do sistema</h3>
  ${r.registros.length
    ? tabela(['Marco', 'Data e hora', 'Origem', 'Observação'], r.registros.map((item) => [item.rotulo, item.quando, item.fonte, item.valor]), 'registros')
    : '<p class="campo" data-campo="registros">Não localizado nos registros consultados.</p>'}
  <h3>Telemetria e registros técnicos</h3>
  <div class="campo" data-campo="telemetria">${esc(r.telemetria)}</div>
  <h3>Evidências e anexos</h3>
  ${galeria}
</section>
<section data-secao="analise">
  <h2>Análise da ocorrência e causa</h2>
  <h3>Fatos confirmados</h3>
  <div class="campo" data-campo="fatos">${lista(r.analise.fatosConfirmados)}</div>
  <h3>Relatos recebidos</h3>
  <div class="campo" data-campo="relatos">${lista(r.analise.relatos)}</div>
  <h3>Divergências e limitações</h3>
  <div class="campo" data-campo="divergencias">${lista([...r.analise.divergencias, ...r.analise.limitacoes].filter((t) => !/convertida em coordenada|lidas só como contexto|hipótese foi promovida/i.test(t)))}</div>
  <h3>Causa ou fatores contribuintes</h3>
  <div class="campo" data-campo="causa"><p>${esc(r.analise.causa)}</p></div>
  <div hidden data-secao="auditoria-interna">${r.rastreio.map((i) => `<span data-tipo="${esc(i.tipo)}" data-fonte="${esc(i.fonte)}" data-registro="${esc(i.registroId)}">${esc(i.descricao)}</span>`).join('')}</div>
</section>
<section data-secao="contencao">
  <h2>Ações de contenção já executadas</h2>
  ${r.acoesContencao.length
    ? tabela(['ID', 'Ação executada', 'Responsável', 'Data', 'Status', 'Evidência / fonte'], r.acoesContencao.map((l) => [l.id, l.acao, l.responsavel, l.data, l.status, l.evidencia]), 'contencao')
    : '<p>Não localizado nos registros consultados. Nenhuma providência foi marcada como concluída sem comprovante.</p>'}
</section>
<section data-secao="plano-acao">
  <h2>Plano de Ação Corretiva</h2>
  <p class="aviso-plano">Medidas ligadas ao problema informado para esta apuração. Não repetem o que o sistema já lançou.</p>
  ${tabela(['ID', 'Ação', 'Responsável', 'Prazo', 'Status', 'Evidência de conclusão'], r.planoAcao.map((l) => [l.id, l.acao, l.responsavel, l.prazo, l.status, l.evidencia]), 'acao')}
</section>
<section data-secao="plano-melhoria">
  <h2>Plano de Melhoria Preventiva</h2>
  ${tabela(['ID', 'Melhoria preventiva', 'Responsável', 'Prazo', 'Status', 'Indicador de eficácia'], r.planoMelhoria.map((l) => [l.id, l.acao, l.responsavel, l.prazo, l.status, l.evidencia]), 'melhoria')}
</section>
<section data-secao="procedimento">
  <h2>Procedimento preventivo recomendado</h2>
  ${r.procedimento && r.procedimento.length
    ? `<ol class="fluxo">${r.procedimento.map((passo) => `<li>${esc(passo)}</li>`).join('')}</ol>`
    : '<p>Não há fluxo preventivo específico para o risco identificado nesta OS.</p>'}
</section>
<section data-secao="cronograma">
  <h2>Cronograma consolidado</h2>
  ${r.cronograma.length
    ? tabela(['Prazo', 'ID', 'Descrição', 'Status'], r.cronograma.map((l) => [l.quando, l.id, l.descricao, l.status]), 'cronograma')
    : '<p>A definir. Não há ação com prazo para montar o cronograma.</p>'}
</section>
<section data-secao="indicadores">
  <h2>Indicadores de acompanhamento</h2>
  ${tabela(['Indicador', 'Meta', 'Frequência', 'Responsável', 'Resultado atual'], r.indicadores.map((l) => [l.nome, l.meta, l.frequencia, l.responsavel, l.resultado]), 'indicadores')}
</section>
<section data-secao="pendencias">
  <h2>Pendências para conclusão da apuração</h2>
  <div class="campo" data-campo="pendencias">${lista(r.pendenciasConclusao)}</div>
</section>
<section data-secao="encerramento">
  <h2>Conclusão e encaminhamento ao cliente</h2>
  <div class="campo" data-campo="encerramento">${prosa(r.encerramento)}</div>
</section>`;
}

export function htmlCorpoAnalise(d: OsActionPlanInput): string {
  const relatorio = montarRelatorioOcorrencia(d);
  const base = String(d.problemaPrincipal || '').trim()
    ? renderizarExecutivo(d, relatorio)
    : renderizarRelatorio(relatorio);
  if (d.modalidade !== 'ocorrencia' || String(d.problemaPrincipal || '').trim()) return base;
  return `${base}${htmlMapaMissao(d)}${htmlQuadroAtualizacoes(d)}`;
}

function semaforo(status: string): string {
  const n = status.toLowerCase();
  if (/conclu/.test(n)) return 'Concluído';
  if (/implanta|andamento/.test(n)) return 'Em implantação';
  return 'Pendente';
}

function renderizarExecutivo(d: OsActionPlanInput, r: RelatorioOcorrencia): string {
  const analise = analisarOcorrencia(d);
  const foco = String(d.problemaPrincipal || '').trim();
  const cronologia = r.cronologia.filter((e) => !/lançou o status/i.test(e.event));
  const linhas = [...analise.acao, ...analise.melhoria];
  const plano = tabela(
    ['ID', 'Ação', 'Responsável', 'Prazo', 'Status', 'Evidência'],
    linhas.map((l) => [l.id, l.acao, l.responsavel, l.prazo, semaforo(l.status), l.evidencia]),
    'plano',
  );
  const antes = analise.categorias.some((c) => c === 'perda_contato' || c === 'veiculo_incorreto')
    ? 'Perda visual → veículo semelhante, quando for o caso → acompanhamento → divergência identificada.'
    : 'A sequência relatada seguiu sem a barreira que interrompe o fato.';
  const depois = (analise.procedimento || []).filter((p) => p !== analise.procedimento?.[0]);
  const croquiFonte = d.croqui || montarCroqui(d);
  const croqui = croquiFonte
    ? htmlCroqui(croquiFonte, {
      os: d.missionId,
      cliente: d.clientName || 'Cliente',
      data: r.documento.dataOperacao || 'conforme registro',
      operacao: d.tipo || 'Operação',
    })
    : '';
  const textoCliente = prosaHumana(foco, String(d.relatoComplementar || ''));
  const narrativa = narrativaAceitaParaCliente(String(d.narrativaIa || ''), d.fornecedor, d.clientName)
    || textoCliente.analise;
  const analiseEscrita = `<div class="campo" data-campo="analise">${prosa(narrativa.replace(/\n+/g, '\n\n'))}</div>`;

  return `<section data-secao="documento">
  <div class="campo" data-campo="identificacao">
    <p><strong>OS:</strong> ${esc(d.missionId)} · <strong>Cliente:</strong> ${esc(d.clientName || '—')}</p>
    <p><strong>Operação:</strong> ${esc(d.tipo || '—')} · <strong>Data:</strong> ${esc(r.documento.dataOperacao)} · <strong>Status:</strong> ${esc(d.status || '—')}</p>
    <p>🚩 <strong>Origem:</strong> ${esc(d.origem || '—')}</p>
    <p>🏁 <strong>Destino:</strong> ${esc(d.destino || '—')}</p>
  </div>
</section>
<section data-secao="resumo">
  <h2>Resumo executivo</h2>
  <div class="campo" data-campo="resumo">${prosa(textoCliente.resumo)}</div>
</section>
${croqui}
${d.modalidade === 'ocorrencia' ? `${htmlMapaMissao(d)}${htmlQuadroAtualizacoes(d)}` : ''}
<section data-secao="cronologia">
  <h2>Cronologia relevante</h2>
  <div class="trilha">${cronologia.length
    ? cronologia.map((e) => `<article class="cartao"><div class="quem">${rosto(e.certainty === 'registrado' ? 'equipe' : 'robo')}</div><div data-campo="cronologia"><strong>${esc(e.time)}</strong> <span class="nivel">${e.certainty === 'registrado' ? 'Registro' : 'Relato'}</span><p>${esc(e.event)}</p><small>Fonte: registro da operação</small></div></article>`).join('')
    : '<p class="campo" data-campo="cronologia">Não há evento ligado ao problema informado.</p>'}</div>
</section>
<section data-secao="analise">
  <h2>Análise da ocorrência</h2>
  ${analiseEscrita}
  <h3>Causa / fator contribuinte</h3>
  <div class="campo" data-campo="causa"><p>${esc(textoCliente.causa)}</p></div>
  <div hidden data-secao="auditoria-interna">${r.rastreio.map((i) => `<span data-tipo="${esc(i.tipo)}" data-fonte="${esc(i.fonte)}" data-registro="${esc(i.registroId)}">${esc(i.descricao)}</span>`).join('')}</div>
</section>
<section data-secao="barreira">
  <h2>Barreira identificada</h2>
  <div class="campo" data-campo="barreira">${prosa(textoCliente.barreira)}</div>
</section>
<section data-secao="plano-acao">
  <h2>Plano de ação</h2>
  <p class="aviso-plano">Medidas ligadas ao problema informado para esta apuração. Não repetem o que o sistema já lançou.</p>
  ${plano}
</section>
<section data-secao="procedimento">
  <h2>Antes e depois</h2>
  <div class="antes-depois">
    <div><h3>Situação identificada</h3><p>${esc(antes)}</p></div>
    <div><h3>Novo procedimento</h3>${depois.length ? `<ol class="fluxo">${depois.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>` : '<p>Não há procedimento específico para este problema.</p>'}</div>
  </div>
</section>
<section data-secao="indicadores">
  <h2>Indicadores</h2>
  ${tabela(['Indicador', 'Meta', 'Frequência', 'Responsável', 'Resultado atual'], r.indicadores.map((l) => [l.nome, l.meta, l.frequencia, l.responsavel, l.resultado]), 'indicadores')}
</section>
<section data-secao="encerramento">
  <h2>Conclusão</h2>
  <div class="campo" data-campo="encerramento">${prosa(textoCliente.conclusao)}</div>
</section>`;
}
