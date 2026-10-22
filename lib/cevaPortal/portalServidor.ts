/** Configuração de servidor do controle de escolta. A CEVA permanece o padrão. */

export type PortalServidor = {
  rotulo: string;
  clienteNome: string;
  tokenPrefix: string;
  headerSessao: string;
  logPrefix: string;
  caminho: string;
  exigeLogin: boolean;
  /** Trecho do nome oficial em clients.name. A CEVA segue o nome exato. */
  clienteBusca?: string;
  /** Portal genérico. CEVA e IBL ficam sem este id e usam a tabela própria. */
  clientId?: number;
  tabelas: {
    usuarios: string;
    osCampos: string;
    catalogo: string;
    pgrHistorico: string;
    solicitacoes: string;
  };
};

export const PORTAL_CEVA: PortalServidor = {
  rotulo: 'CEVA',
  clienteNome: 'CEVA LOGISTICS LTDA',
  tokenPrefix: 'ceva-portal',
  headerSessao: 'x-ceva-portal',
  logPrefix: 'ceva-portal',
  caminho: '/ceva',
  exigeLogin: true,
  tabelas: {
    usuarios: 'ceva_portal_usuarios',
    osCampos: 'ceva_portal_os_campos',
    catalogo: 'ceva_portal_catalogo',
    pgrHistorico: 'ceva_portal_pgr_historico',
    solicitacoes: 'ceva_escolta_solicitacoes',
  },
};

export const PORTAL_IBL: PortalServidor = {
  rotulo: 'IBL',
  clienteNome: 'INTERMODAL BRASIL LOGISTICA S.A.',
  clienteBusca: 'INTERMODAL',
  tokenPrefix: 'ibl-portal',
  headerSessao: 'x-ibl-portal',
  logPrefix: 'ibl-portal',
  caminho: '/ibl',
  exigeLogin: true,
  tabelas: {
    usuarios: 'ibl_portal_usuarios',
    osCampos: 'ibl_portal_os_campos',
    catalogo: 'ibl_portal_catalogo',
    pgrHistorico: 'ibl_portal_pgr_historico',
    solicitacoes: 'ibl_escolta_solicitacoes',
  },
};

export const TABELAS_PORTAL_GENERICO = {
  usuarios: 'portal_cliente_usuarios',
  osCampos: 'portal_cliente_os_campos',
  catalogo: 'portal_cliente_catalogo',
  pgrHistorico: 'portal_cliente_pgr_historico',
  solicitacoes: 'portal_cliente_solicitacoes',
} as const;

const PORTAIS_CLIENTE = [PORTAL_CEVA, PORTAL_IBL];

export type FichaPortal = {
  id?: number | string | null;
  name?: string | null;
  trading_name?: string | null;
  portal_ativo?: boolean | null;
  portal_slug?: string | null;
};

/** Cópia do IBL para cliente que ligou o portal no cadastro. */
export function portalGenerico(cliente: FichaPortal): PortalServidor | null {
  const slug = String(cliente.portal_slug || '').trim().toLowerCase();
  const id = Number(cliente.id);
  const nome = String(cliente.name || '').trim();
  if (!slug || !nome || !Number.isFinite(id)) return null;
  const fantasia = String(cliente.trading_name || '').trim();
  return {
    rotulo: fantasia || nome,
    clienteNome: nome,
    clientId: id,
    tokenPrefix: `portal-${slug}`,
    headerSessao: 'x-portal-cliente',
    logPrefix: `portal-${slug}`,
    caminho: `/${slug}`,
    exigeLogin: true,
    tabelas: { ...TABELAS_PORTAL_GENERICO },
  };
}

/** Página fixa da CEVA ou da IBL. Cliente novo entra por portalDaFicha. */
export function portalPorNomeCliente(nome: string | null | undefined): PortalServidor | null {
  const texto = String(nome || '').trim().toUpperCase();
  if (!texto) return null;
  const exato = PORTAIS_CLIENTE.find((portal) => portal.clienteNome.toUpperCase() === texto);
  if (exato) return exato;
  if (texto.includes('CEVA')) return PORTAL_CEVA;
  if (texto.includes('INTERMODAL')) return PORTAL_IBL;
  return null;
}

/** O PostgREST devolve objeto simples, não `Error`. A tela lia só `instanceof Error` e mostrava "Erro desconhecido". */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error && erro.message) return erro.message;
  if (erro && typeof erro === 'object' && 'message' in erro && (erro as { message?: unknown }).message) {
    return String((erro as { message: unknown }).message);
  }
  return 'Erro desconhecido';
}

/** Coluna que o cadastro enviou e o banco ainda não tem. O código novo do PostgREST é PGRST204, não só 42703. */
export function colunaAusenteNoBanco(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  const codigo = String(erro.code || '');
  const mensagem = String(erro.message || '');
  return codigo === '42703' || codigo === 'PGRST204' || /schema cache|does not exist|Could not find/i.test(mensagem);
}

export function erroMencionaColunaPortal(erro: { message?: string } | null | undefined): boolean {
  return /portal_/i.test(String(erro?.message || ''));
}

/** Tira só site, logotipo e cores. O restante do cliente continua no payload. */
export function semColunasDePortal<T extends Record<string, unknown>>(payload: T): T {
  const copia = { ...payload };
  delete copia.portal_ativo;
  delete copia.portal_slug;
  delete copia.portal_site;
  delete copia.portal_logo_url;
  delete copia.portal_cor;
  delete copia.portal_cor_acao;
  return copia;
}

/** CEVA e IBL continuam na página fixa. Os demais usam o slug do cadastro. */
export function portalDaFicha(cliente: FichaPortal | null | undefined): PortalServidor | null {
  if (!cliente) return null;
  const fixo = portalPorNomeCliente(cliente.name);
  if (fixo) return fixo;
  if (cliente.portal_ativo === true) return portalGenerico(cliente);
  return null;
}
