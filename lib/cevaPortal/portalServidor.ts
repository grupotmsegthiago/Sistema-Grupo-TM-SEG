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

const PORTAIS_CLIENTE = [PORTAL_CEVA, PORTAL_IBL];

/** Cliente com portal de escolta. Os demais clientes não ganham esta liberação. */
export function portalPorNomeCliente(nome: string | null | undefined): PortalServidor | null {
  const texto = String(nome || '').trim().toUpperCase();
  if (!texto) return null;
  const exato = PORTAIS_CLIENTE.find((portal) => portal.clienteNome.toUpperCase() === texto);
  if (exato) return exato;
  if (texto.includes('CEVA')) return PORTAL_CEVA;
  if (texto.includes('INTERMODAL')) return PORTAL_IBL;
  return null;
}
