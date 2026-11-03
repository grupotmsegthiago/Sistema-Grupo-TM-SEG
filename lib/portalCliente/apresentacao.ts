import { numerosDaTela, rotulosSemAno, type PropostaPortal } from './cotacao.js';
import { conferirTrechosGravados } from './trechosProposta.js';

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

export const CONDICAO_PAGAMENTO = '15 dias após o término da quinzena, com nota fiscal e boleto.';

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tabela da proposta no e-mail. Pernoite só entra quando a proposta traz o valor. */
export function linhasDaTabelaEmail(proposta: PropostaPortal): Array<{ rotulo: string; valor: string }> {
  const tela = numerosDaTela(proposta);
  const minutos = proposta.duracaoMin != null && proposta.duracaoMin > 0 ? Math.round(proposta.duracaoMin) : 0;
  const horasViagem = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const tempo = minutos <= 0 ? '' : horasViagem <= 0 ? `${resto} min` : `${horasViagem}h ${String(resto).padStart(2, '0')}min`;
  const linhas: Array<{ rotulo: string; valor: string }> = [
    { rotulo: 'Origem', valor: proposta.origem || '—' },
    { rotulo: 'Destino', valor: proposta.destino || '—' },
    { rotulo: 'Distância estimada', valor: proposta.kmRota != null && proposta.kmRota > 0 ? `${quantidade(proposta.kmRota)} km` : '—' },
  ];
  if (tempo) linhas.push({ rotulo: 'Tempo de viagem', valor: tempo });
  linhas.push(
    { rotulo: 'Região', valor: proposta.regiao || '—' },
    { rotulo: 'Franquia de km incluída', valor: `${quantidade(tela.franquiaKm)} km` },
    { rotulo: 'Franquia de horas incluída', valor: `${quantidade(tela.franquiaHoras)} h` },
    { rotulo: 'Valor do km extra', valor: moeda(tela.kmExtra) },
    { rotulo: 'Valor da hora extra', valor: moeda(tela.horaExtra) },
  );
  if (proposta.kmFaturado != null && proposta.kmFaturado > 0) {
    linhas.push({ rotulo: 'Km faturado', valor: `${quantidade(proposta.kmFaturado)} km` });
  }
  if (proposta.horasContadas != null && proposta.horasContadas > 0) {
    linhas.push({ rotulo: 'Horas consideradas', valor: `${quantidade(proposta.horasContadas)} h` });
  }
  if (tela.pernoite != null) linhas.push({ rotulo: 'Pernoite', valor: moeda(tela.pernoite) });
  linhas.push(
    { rotulo: 'Valor total da cotação', valor: moeda(tela.total) },
    { rotulo: 'Validade da proposta', valor: '10 dias' },
    { rotulo: 'Condições de pagamento', valor: CONDICAO_PAGAMENTO },
    { rotulo: 'Pedágio', valor: AVISO_PEDAGIO },
  );
  return linhas;
}

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
    rotulosSemAno(proposta.origem, proposta.destino).tabela,
    rotulosSemAno(proposta.origem, proposta.destino).rota,
    AVISO_PEDAGIO,
  ].filter(Boolean);
}

export function cartaDaProposta(proposta: PropostaPortal, operacoes?: string | null, link?: string | null): string {
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
    ...(proposta.trechos && proposta.trechos.length > 1
      ? [
        'Trechos',
        ...proposta.trechos.map((trecho, indice) => (
          `${indice + 1}. ${trecho.origem} → ${trecho.destino}: ${moeda(trecho.valor)}. Excedente ${quantidade(trecho.kmExcedente)} km e ${quantidade(trecho.horasExcedentes)} h.`
        )),
        `Total dos trechos: ${moeda(proposta.trechos.reduce((soma, trecho) => soma + trecho.valor, 0))}.`,
        '',
      ]
      : []),
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
    link ? `Acessar Proposta Comercial: ${link}` : 'A proposta completa segue em anexo, com o mapa da rota.',
    '',
    'Acionamento da rota',
    ...linhasDaTabelaEmail(proposta).map((item) => `${item.rotulo}: ${item.valor}`),
    '',
    MARCA_TMSEG.telefone,
    MARCA_TMSEG.endereco,
    MARCA_TMSEG.sitio,
  ].join('\n');
}

/** Aceita a proposta enviada pela tela quando os números fecham. */
export function propostaRecebida(bruto: unknown): PropostaPortal | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const item = bruto as Record<string, unknown>;
  const numeros = [item.acionamento, item.kmFranquia, item.horasFranquia, item.kmExtra, item.horaExtra].map(Number);
  if (numeros.some((valor) => !Number.isFinite(valor))) return null;
  const kmFaturado = Number(item.kmFaturado);
  const horasContadas = Number(item.horasContadas);
  const kmRota = Number(item.kmRota);
  const pernoite = Number(item.pernoite);
  const vigencia = item.vigencia === '2027' ? '2027' : '2026';
  const varios = Array.isArray(item.trechos) && item.trechos.length > 1
    ? conferirTrechosGravados(item.trechos, '', vigencia)
    : null;
  if (varios && !varios.ok) return null;
  return {
    acordada: Boolean(item.acordada),
    regiao: String(item.regiao || '').slice(0, 80),
    origem: String(item.origem || '').slice(0, 300),
    destino: String(item.destino || '').slice(0, 300),
    paradas: Array.isArray(item.paradas) ? item.paradas.map((parada) => String(parada || '')).slice(0, 8) : [],
    acionamento: numeros[0],
    kmFranquia: numeros[1],
    horasFranquia: numeros[2],
    kmExtra: numeros[3],
    horaExtra: numeros[4],
    operacao: String(item.operacao || 'escolta').slice(0, 160),
    vigencia,
    ...(varios && varios.ok ? { trechos: varios.trechos, acionamento: varios.total } : {}),
    kmRota: Number.isFinite(kmRota) && kmRota > 0 ? kmRota : null,
    duracaoMin: Number(item.duracaoMin) > 0 ? Number(item.duracaoMin) : null,
    kmFaturado: Number.isFinite(kmFaturado) && kmFaturado > 0 ? kmFaturado : null,
    horasContadas: Number.isFinite(horasContadas) && horasContadas > 0 ? horasContadas : null,
    pernoite: Number.isFinite(pernoite) && pernoite > 0 ? pernoite : null,
    numero: Number.isInteger(Number(item.numero)) && Number(item.numero) > 0 ? Number(item.numero) : null,
  };
}

/** O mesmo texto da carta, em HTML, com a tabela do acionamento. */
export function htmlDaProposta(proposta: PropostaPortal, operacoes?: string | null, link?: string | null): string {
  const linhas = linhasDaTabelaEmail(proposta).map((item) => (
    `<tr><td style="padding:8px 10px;border-bottom:1px solid #e7e1d6;color:#5c564e;">${escaparHtml(item.rotulo)}</td><td style="padding:8px 10px;border-bottom:1px solid #e7e1d6;font-weight:700;color:#161513;">${escaparHtml(item.valor)}</td></tr>`
  )).join('');
  const texto = escaparHtml(cartaDaProposta(proposta, operacoes, link)).replace(/\n/g, '<br>');
  const botao = link
    ? `<p style="margin:20px 0;"><a href="${escaparHtml(link)}" style="display:inline-block;background:#d0121a;color:#ffffff;padding:12px 18px;border-radius:999px;font-weight:700;text-decoration:none;">Acessar Proposta Comercial</a></p>`
    : '';
  return [
    '<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;background:#f7f5f2;color:#161513;">',
    '<div style="max-width:640px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;">',
    `<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#d0121a;">${escaparHtml(MARCA_TMSEG.nome)}</p>`,
    '<h1 style="margin:0 0 16px;font-size:22px;">Proposta comercial de escolta</h1>',
    botao,
    '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;">',
    linhas,
    '</table>',
    `<div style="margin-top:20px;font-size:14px;line-height:1.5;">${texto}</div>`,
    '</div></body></html>',
  ].join('');
}
