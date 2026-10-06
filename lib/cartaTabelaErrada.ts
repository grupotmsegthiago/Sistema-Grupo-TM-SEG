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
