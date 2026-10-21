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

/** CEVA e IBL continuam na página fixa. Os demais usam o slug do cadastro. */
export function portalDaFicha(cliente: FichaPortal | null | undefined): PortalServidor | null {
  if (!cliente) return null;
  const fixo = portalPorNomeCliente(cliente.name);
  if (fixo) return fixo;
  if (cliente.portal_ativo === true) return portalGenerico(cliente);
  return null;
}
