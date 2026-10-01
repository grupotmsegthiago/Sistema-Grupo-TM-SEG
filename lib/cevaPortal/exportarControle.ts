/** Linhas do controle de escolta no mesmo texto que a tela, sem a coluna Contrato. */

export const CABECALHOS_CONTROLE = [
  'OS',
  'Status',
  'Nº solicitação',
  'Data início',
  'Data fim',
  'Solicitante',
  'Quem autorizou',
  'Serviço',
  'Atendimento PGR',
  'Operação',
  'TSP',
  'Placa',
  'Motorista',
  'Franquia hora',
  'Franquia km',
  'Km início',
  'Km fim',
  'Km rodado',
  'Km excedente',
  'Horas trabalhadas',
  'Horas excedentes',
  'R$ horas excedentes',
  'R$ km excedente',
  'R$ acionamento',
  'R$ total',
  'Pedágio',
  'R$ km excedente (tarifa)',
  'R$ hora excedente (tarifa)',
  'Local',
  'Obs',
] as const;

const AGUARDANDO_CONFERENCIA = 'Aguardando Conferência';
const AGUARDANDO_VALIDACAO = 'Aguardando validação';

export type LinhaControleExportavel = {
  os: string;
  status: string;
  dataInicio: string | null;
  dataFim: string | null;
  solicitante: string | null;
  quemAutorizou: string | null;
  servico: string | null;
  atendimentoPgr: string | null;
  operacao: string | null;
  tsp: string | null;
  placa: string | null;
  motorista: string | null;
  franquiaHora: string | null;
  franquiaKm: number | null;
  kmInicio: number | null;
  kmFim: number | null;
  kmRodado: number | null;
  kmExcedente: number | null;
  hrsTrabalhada: string | null;
  hrsExcedente: string | null;
  valorHrsExcedente: number | null;
  valorKmExcedente: number | null;
  valorAcionamento: number | null;
  valorTotal: number | null;
  pedagio: number | null;
  tarifaKm: number | null;
  tarifaHora: number | null;
  local: string | null;
  obs: string | null;
  valores?: 'APROVADO' | 'AGUARDANDO';
};

function quando(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dinheiro(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function quantidade(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR');
}

function texto(value: string | null): string {
  return value || '—';
}

function sistema(valor: string | number | null, exibicao: string): string {
  if (valor == null || exibicao === '—') return AGUARDANDO_CONFERENCIA;
  return exibicao;
}

function valorCliente(item: LinhaControleExportavel, value: number | null): string {
  if (item.valores === 'AGUARDANDO') return AGUARDANDO_VALIDACAO;
  if (value == null) return AGUARDANDO_CONFERENCIA;
  return dinheiro(value);
}

/** Tira colunas do Excel/PDF sem mudar a ordem das que ficam. Lista vazia devolve o controle completo. */
export function recortarColunasControle(linhas: string[][], ocultas: readonly string[]): { cabecalhos: string[]; linhas: string[][] } {
  const fora = new Set(ocultas);
  const indices = CABECALHOS_CONTROLE
    .map((nome, indice) => (fora.has(nome) ? -1 : indice))
    .filter((indice) => indice >= 0);
  return {
    cabecalhos: indices.map((indice) => CABECALHOS_CONTROLE[indice]),
    linhas: linhas.map((linha) => indices.map((indice) => linha[indice] ?? '')),
  };
}

export function linhaControleExportavel(item: LinhaControleExportavel, numero: number | undefined): string[] {
  const obs = item.valores === 'APROVADO' && item.valorTotal != null
    ? (item.obs || '')
    : sistema(item.obs, texto(item.obs));
  return [
    item.os,
    texto(item.status),
    numero == null ? '' : String(numero),
    quando(item.dataInicio),
    quando(item.dataFim),
    texto(item.solicitante),
    texto(item.quemAutorizou),
    texto(item.servico),
    texto(item.atendimentoPgr),
    texto(item.operacao),
    texto(item.tsp),
    texto(item.placa),
    texto(item.motorista),
    texto(item.franquiaHora),
    quantidade(item.franquiaKm),
    sistema(item.kmInicio, quantidade(item.kmInicio)),
    sistema(item.kmFim, quantidade(item.kmFim)),
    sistema(item.kmRodado, quantidade(item.kmRodado)),
    sistema(item.kmExcedente, quantidade(item.kmExcedente)),
    sistema(item.hrsTrabalhada, texto(item.hrsTrabalhada)),
    sistema(item.hrsExcedente, texto(item.hrsExcedente)),
    valorCliente(item, item.valorHrsExcedente),
    valorCliente(item, item.valorKmExcedente),
    valorCliente(item, item.valorAcionamento),
    valorCliente(item, item.valorTotal),
    valorCliente(item, item.pedagio),
    valorCliente(item, item.tarifaKm),
    valorCliente(item, item.tarifaHora),
    sistema(item.local, texto(item.local)),
    obs,
  ];
}

export function nomeArquivoControle(extensao: 'xlsx' | 'pdf', agora = new Date(), prefixo = 'ceva'): string {
  const dia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
  return `controle-escolta-${prefixo}-${dia}.${extensao}`;
}
