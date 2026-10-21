import { isFinanceProfileRole } from './financeSupervisorAccess';

/** Aviso da Diretoria sobre edição do Financeiro. Fica em system_logs, sem tabela nova. */
export const ENTIDADE_AVISO_EDICAO = 'DiretoriaAvisoEdicao';
export const ACAO_AVISO_EDICAO = 'EDICAO_OS_FINANCEIRO';

const TEXTO_MINIMO = 8;

export type AvisoEdicaoDiretoria = {
  id: string;
  os: string;
  cliente: string;
  quem: string;
  perfil: string;
  quando: string;
  texto: string;
  alteracoes: string[];
  lida: boolean;
  lidaPor?: string;
  lidaEm?: string;
};

export function reaprovacaoExigeConfirmacao(input: {
  aprovar: boolean;
  jaAprovada: boolean;
  perfil: string | null | undefined;
}): boolean {
  return input.aprovar === true && input.jaAprovada === true && isFinanceProfileRole(input.perfil);
}

export function textoReaprovacaoValido(texto: string | null | undefined): boolean {
  return String(texto || '').trim().length >= TEXTO_MINIMO;
}

export function montarDetalhesAviso(input: {
  os: string;
  cliente?: string | null;
  quem: string;
  perfil?: string | null;
  quando: string;
  texto: string;
  alteracoes: string[];
}): string {
  return JSON.stringify({
    os: input.os,
    cliente: String(input.cliente || '').trim(),
    quem: input.quem,
    perfil: String(input.perfil || '').trim(),
    quando: input.quando,
    texto: input.texto.trim(),
    alteracoes: input.alteracoes.filter((item) => String(item || '').trim()),
    lida: false,
  });
}

export function lerAvisoEdicao(id: string, details: string | null | undefined): AvisoEdicaoDiretoria | null {
  try {
    const cru = JSON.parse(String(details || '')) as Partial<AvisoEdicaoDiretoria>;
    if (!cru || typeof cru !== 'object') return null;
    return {
      id,
      os: String(cru.os || ''),
      cliente: String(cru.cliente || ''),
      quem: String(cru.quem || ''),
      perfil: String(cru.perfil || ''),
      quando: String(cru.quando || ''),
      texto: String(cru.texto || ''),
      alteracoes: Array.isArray(cru.alteracoes) ? cru.alteracoes.map((item) => String(item)) : [],
      lida: cru.lida === true,
      lidaPor: cru.lidaPor ? String(cru.lidaPor) : undefined,
      lidaEm: cru.lidaEm ? String(cru.lidaEm) : undefined,
    };
  } catch {
    return null;
  }
}

export function avisoContinuaPendente(aviso: { lida?: boolean } | null | undefined): boolean {
  return !!aviso && aviso.lida !== true;
}

export function detalhesMarcadosComoLidos(
  aviso: AvisoEdicaoDiretoria,
  quem: string,
  quando: string,
): string {
  return JSON.stringify({
    ...aviso,
    id: undefined,
    lida: true,
    lidaPor: quem,
    lidaEm: quando,
  });
}
