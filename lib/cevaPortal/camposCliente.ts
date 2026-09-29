/** Campos que o cliente preenche no controle de escolta. */

export const CAMPOS_FILTRO = ['solicitante', 'quemAutorizou', 'servico', 'contrato', 'operacao'] as const;
export const CAMPO_PGR = 'atendimentoPgr' as const;
export const SERVICOS_FIXOS = ['Escolta Caracterizada', 'Pronta Resposta'] as const;

export type CampoFiltro = (typeof CAMPOS_FILTRO)[number];
export type CampoCliente = CampoFiltro | typeof CAMPO_PGR;

export type DecisaoCampo =
  | { acao: 'limpar' }
  | { acao: 'aplicar'; valor: string; novoFiltro: boolean }
  | { acao: 'confirmar'; nome: string };

const LIMITE_FILTRO = 120;
const LIMITE_PGR = 2000;

/** Mesma leitura do boletim: velada é Pronta Resposta; o restante é Escolta Caracterizada. */
export function servicoDoSistema(missionType: string | null | undefined): (typeof SERVICOS_FIXOS)[number] {
  const tipo = String(missionType || '').toUpperCase();
  if (tipo.includes('VELAD') || tipo.includes('PRONTA')) return 'Pronta Resposta';
  return 'Escolta Caracterizada';
}

export function nomeParaFiltro(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

export function decidirGravacao(campo: CampoFiltro, valor: string, catalogo: string[]): DecisaoCampo {
  const bruto = valor.trim().replace(/\s+/g, ' ');
  if (!bruto) return { acao: 'limpar' };
  if (bruto.length > LIMITE_FILTRO) return { acao: 'confirmar', nome: nomeParaFiltro(bruto).slice(0, LIMITE_FILTRO) };

  if (campo === 'servico') {
    const fixo = SERVICOS_FIXOS.find((item) => nomeParaFiltro(item) === nomeParaFiltro(bruto));
    if (fixo) return { acao: 'aplicar', valor: fixo, novoFiltro: false };
  }

  const nome = nomeParaFiltro(bruto);
  const existente = catalogo.find((item) => nomeParaFiltro(item) === nome);
  if (existente) return { acao: 'aplicar', valor: existente, novoFiltro: false };
  return { acao: 'confirmar', nome };
}

export function textoPgr(valor: string): string {
  return valor.trim().replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, LIMITE_PGR);
}

export function ehCampoFiltro(campo: string): campo is CampoFiltro {
  return (CAMPOS_FILTRO as readonly string[]).includes(campo);
}
