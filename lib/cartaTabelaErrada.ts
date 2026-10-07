import { explicarTabelaErrada } from './conferenciaTabelaRota';

export type CartaTabela = {
  id: string;
  os: string;
  para: string;
  assunto: string;
  corpo: string;
  quando: string;
};

export function nomeDeCarta(valor: string): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** A carta só abre para quem tem o mesmo nome de quem abriu a OS. */
export function cartaParaMim(criador: string, eu: string): boolean {
  const dela = nomeDeCarta(criador);
  const meu = nomeDeCarta(eu);
  return Boolean(dela && meu && dela === meu);
}

const LADO_PEDAGIO = { cliente: 'do cliente', fornecedor: 'do fornecedor' } as const;

/** Carta só para quem alterou o pedágio por último. O texto é o que foi escrito. */
export function montarCartaErroPedagio(input: {
  id?: string;
  os?: string | null;
  lado?: string | null;
  destinatario?: string | null;
  autor?: string | null;
  texto?: string | null;
  quando?: string | null;
}): CartaTabela | null {
  const para = String(input.destinatario || '').trim();
  const texto = String(input.texto || '').replace(/\s+/g, ' ').trim();
  const os = String(input.os || '').trim();
  if (!para || texto.length < 5) return null;
  const lado = input.lado === 'fornecedor' ? 'fornecedor' : 'cliente';
  const autor = String(input.autor || '').trim() || 'Quem reportou';
  return {
    id: String(input.id || ''),
    os,
    para,
    assunto: os ? `OS ${os} — erro no pedágio ${LADO_PEDAGIO[lado]}` : `Erro no pedágio ${LADO_PEDAGIO[lado]}`,
    corpo: `${autor} reportou um erro no pedágio ${LADO_PEDAGIO[lado]}. ${texto} Abra a OS e altere o pedágio você mesmo.`,
    quando: String(input.quando || '').trim(),
  };
}

export function montarCartaTabelaErrada(input: {
  id?: string;
  os?: string | null;
  criador?: string | null;
  tabela?: string | null;
  motivos?: string[] | null;
  sugestaoNome?: string | null;
  lado?: string | null;
  quando?: string | null;
}): CartaTabela {
  const para = String(input.criador || '').trim() || 'Quem abriu a OS';
  const os = String(input.os || '').trim();
  return {
    id: String(input.id || ''),
    os,
    para,
    assunto: os ? `OS ${os} — a tabela não combina com a rota` : 'A tabela não combina com a rota',
    corpo: explicarTabelaErrada(input),
    quando: String(input.quando || '').trim(),
  };
}

function quandoDaCarta(iso: string): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type LinhaCarta = {
  id?: string;
  action_type?: string;
  user_name?: string;
  entity_id?: string;
  details?: string;
  created_at?: string;
};

/** Carta da tabela errada ou do erro de pedágio. Cada uma sai só para o destinatário. */
export function cartaDaLinha(row: LinhaCarta): CartaTabela | null {
  let detalhe: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.details || '{}'));
    if (parsed && typeof parsed === 'object') detalhe = parsed as Record<string, unknown>;
  } catch {
    detalhe = {};
  }
  const quando = quandoDaCarta(String(row.created_at || ''));
  if (row.action_type === 'TOLL_ERROR_REPORT') {
    return montarCartaErroPedagio({
      id: row.id,
      os: String(detalhe.os || row.entity_id || ''),
      lado: detalhe.lado === 'fornecedor' ? 'fornecedor' : 'cliente',
      destinatario: String(detalhe.destinatario || ''),
      autor: String(detalhe.autor || row.user_name || ''),
      texto: String(detalhe.texto || ''),
      quando,
    });
  }
  if (row.action_type !== 'TABLE_ROUTE_MISMATCH') return null;
  const para = String(detalhe.criador || row.user_name || '').trim();
  if (!para || nomeDeCarta(para) === 'NAO IDENTIFICADO') return null;
  const motivos = Array.isArray(detalhe.motivos) ? detalhe.motivos.map(String) : [];
  return montarCartaTabelaErrada({
    id: row.id,
    os: row.entity_id,
    criador: para,
    tabela: String(detalhe.tabela || ''),
    motivos,
    sugestaoNome: String(detalhe.sugestaoNome || ''),
    lado: String(detalhe.lado || ''),
    quando,
  });
}
