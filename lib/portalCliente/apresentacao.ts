import { nomesDaVigencia, type PropostaPortal } from './cotacao.js';

export const MARCA_TMSEG = {
  nome: 'Grupo TM SEG',
  chamada: 'A carga protegida em cada quilômetro.',
  sitio: 'www.grupotmseg.com.br',
  telefone: '+55 11 91689-3018',
  endereco: 'Av. Parada Pinto, 737, Vila Nova Cachoeirinha, São Paulo, SP',
  quem: 'O Grupo TM SEG intermedia escolta armada, consultoria de GR, regulação e acompanhamento logístico em todo o território nacional. A execução em campo fica com empresas homologadas, com alvará ativo na Polícia Federal.',
  missao: 'A missão é ligar o cliente a profissionais e empresas do setor, com eficiência, confiabilidade e o padrão de segurança da operação.',
} as const;

export const FOTO_SALA = '/proposta-tmseg/about-team-original.webp';

export const NUMEROS_TMSEG = [
  { valor: '500+', rotulo: 'Operações realizadas' },
  { valor: '24/7', rotulo: 'Atendimento' },
  { valor: '100%', rotulo: 'Compromisso' },
  { valor: '50+', rotulo: 'Parceiros ativos' },
] as const;

/** Milhar da quantidade real de OS, sem o número exato. 8120 vira "8 mil+". */
export function marcoDeOperacoes(total: number): string | null {
  if (!Number.isFinite(total) || total < 1000) return null;
  const mil = Math.floor(total / 1000);
  if (mil < 1) return null;
  return total === mil * 1000 ? `${mil} mil` : `${mil} mil+`;
}

export function numerosDaProposta(operacoes?: string | null) {
  if (!operacoes) return NUMEROS_TMSEG;
  return NUMEROS_TMSEG.map((item) => (
    item.rotulo === 'Operações realizadas' ? { valor: operacoes, rotulo: item.rotulo } : item
  ));
}

export const SERVICOS_TMSEG = [
  { titulo: 'Fiscal de rota', foto: '/proposta-tmseg/service-fiscal-rota.png', texto: 'Monitoramento e inspeção contínua das rotas de transporte, com conformidade, segurança e controle da operação logística.' },
  { titulo: 'Intermediação de escolta armada', foto: '/proposta-tmseg/service-escolta.png', texto: 'Intermediação de escolta armada com empresas homologadas e com alvará ativo na Polícia Federal, para o transporte de cargas.' },
  { titulo: 'Acompanhamento logístico', foto: '/proposta-tmseg/service-acompanhamento.png', texto: 'Monitoramento da operação, com rastreamento e gestão do transporte por equipe especializada.' },
  { titulo: 'Guincho', foto: '/proposta-tmseg/service-guincho.png', texto: 'Guincho para situações emergenciais, com remoção e transporte de veículos e cargas.' },
] as const;

export const DIFERENCIAIS_TMSEG = [
  { titulo: 'Compromisso com a segurança', texto: 'A prioridade é a proteção dos ativos e a tranquilidade da operação, com solução adequada a cada carga.' },
  { titulo: 'Fiscal de rota personalizado', texto: 'Inspeção e fiscalização do trajeto, com acompanhamento de cada etapa do transporte.' },
  { titulo: 'Caracterização e rastreamento', texto: 'Caracterização e rastreamento para monitoramento da carga em cada etapa.' },
  { titulo: 'Escolta especializada', texto: 'Intermediação com empresas de escolta armada homologadas e com alvará ativo na Polícia Federal.' },
] as const;

export const CLIENTES_TMSEG = [
  { nome: 'Claro', logo: '/proposta-tmseg/clientes/claro.png' },
  { nome: 'HP', logo: '/proposta-tmseg/clientes/hp.png' },
  { nome: 'Amazon Transportes', logo: '/proposta-tmseg/clientes/amazon-transportes.png' },
  { nome: 'DHL', logo: '/proposta-tmseg/clientes/dhl.png' },
  { nome: 'CEVA', logo: '/proposta-tmseg/clientes/ceva.png' },
  { nome: 'Kodex', logo: '/proposta-tmseg/clientes/kodex.png' },
  { nome: 'Trans Pacheco', logo: '/proposta-tmseg/clientes/transpacheco.png' },
  { nome: 'Techtrans', logo: '/proposta-tmseg/clientes/techtrans.png' },
  { nome: 'Luft', logo: '/proposta-tmseg/clientes/luft.png' },
  { nome: 'IBL', logo: '/proposta-tmseg/clientes/ibl.png' },
  { nome: 'Ceslog', logo: '/proposta-tmseg/clientes/ceslog.png' },
  { nome: 'Comolatti', logo: '/proposta-tmseg/clientes/comolatti.png' },
  { nome: 'Mercado Livre', logo: '/proposta-tmseg/clientes/mercadolivre.png' },
] as const;

export const AVISO_PEDAGIO = 'O custo do pedágio será cobrado à parte, conforme o percurso realizado.';

export function regiaoLegivel(regiao: string): string {
  const nome = regiao.trim().toLowerCase();
  if (nome === 'sudeste') return 'Sudeste';
  if (nome === 'nordeste') return 'Nordeste';
  if (nome === 'norte') return 'Norte';
  if (nome === 'sul') return 'Sul';
  if (nome === 'centro-oeste') return 'Centro-Oeste';
  return regiao.trim();
}

export function caminhoDaProposta(proposta: Pick<PropostaPortal, 'origem' | 'destino' | 'paradas'>): string {
  return [proposta.origem, ...proposta.paradas, proposta.destino].filter(Boolean).join(' → ');
}

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function quantidade(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

export function condicoesDaProposta(proposta: PropostaPortal): string[] {
  return [
    proposta.acordada
      ? 'Esta rota já está acordada na tabela do cliente.'
      : `Região ${regiaoLegivel(proposta.regiao)}.`,
    `Acionamento: ${moeda(proposta.acionamento)}.`,
    `A franquia contempla ${quantidade(proposta.kmFranquia)} km e ${quantidade(proposta.horasFranquia)} horas.`,
    `Acima da franquia, o quilômetro extra custa ${moeda(proposta.kmExtra)} e a hora extra custa ${moeda(proposta.horaExtra)}.`,
    proposta.kmRota != null && proposta.kmRota > 0 ? `Km da rota: ${quantidade(proposta.kmRota)} km.` : '',
    proposta.duracaoMin != null && proposta.duracaoMin > 0 ? `Tempo: ${Math.round(proposta.duracaoMin)} min.` : '',
    nomesDaVigencia(proposta.origem, proposta.destino, proposta.vigencia).tabela,
    nomesDaVigencia(proposta.origem, proposta.destino, proposta.vigencia).rota,
    AVISO_PEDAGIO,
  ].filter(Boolean);
}

export function cartaDaProposta(proposta: PropostaPortal, operacoes?: string | null): string {
  const servicos = SERVICOS_TMSEG.map((item) => `${item.titulo}. ${item.texto}`).join('\n');
  return [
    MARCA_TMSEG.nome,
    'Proposta comercial de escolta',
    MARCA_TMSEG.chamada,
    '',
    MARCA_TMSEG.quem,
    MARCA_TMSEG.missao,
    '',
    'Rota',
    caminhoDaProposta(proposta),
    '',
    ...condicoesDaProposta(proposta),
    '',
    'Serviços',
    servicos,
    '',
    'Números do site',
    numerosDaProposta(operacoes).map((item) => `${item.valor} ${item.rotulo}`).join('\n'),
    '',
    'Diferenciais',
    DIFERENCIAIS_TMSEG.map((item) => `${item.titulo}. ${item.texto}`).join('\n'),
    '',
    'Empresas que operam com a TM SEG',
    CLIENTES_TMSEG.map((item) => item.nome).join(', '),
    '',
    MARCA_TMSEG.telefone,
    MARCA_TMSEG.endereco,
    MARCA_TMSEG.sitio,
  ].join('\n');
}
