/** Identidade visual e rotas do controle de escolta por cliente. */

export type MarcaPortal = {
  id: 'ceva' | 'ibl';
  rotulo: string;
  api: string;
  chaveSessao: string;
  eventoSair: string;
  logo: string;
  logoAlt: string;
  arquivo: string;
  tituloPdf: string;
  /** Enquanto falso, o portal abre o controle sem e-mail e senha. */
  exigeLogin: boolean;
  /** Nomes de coluna do controle que este cliente não exibe. */
  colunasOcultas: readonly string[];
  css: Record<string, string>;
};

const CSS_CEVA: Record<string, string> = {
  '--portal-marca': '#152c54',
  '--portal-acao': '#152c54',
  '--portal-acao-hover': '#1d3b6e',
  '--portal-acao-texto': '#ffffff',
  '--portal-fundo': '#f6f3ef',
  '--portal-painel': '#091426',
  '--portal-destaque': '#c45b5b',
  '--portal-destaque-suave': '#fff6f4',
  '--portal-destaque-glow': 'rgba(196, 91, 91, 0.3)',
  '--portal-brilho': 'rgba(47, 111, 237, 0.2)',
  '--portal-anel': 'rgba(196, 91, 91, 0.15)',
};

/** Paleta do site ibllogistica.com.br: preto, branco e laranja #F7941E. */
const CSS_IBL: Record<string, string> = {
  '--portal-marca': '#111111',
  '--portal-acao': '#F7941E',
  '--portal-acao-hover': '#C46C04',
  '--portal-acao-texto': '#ffffff',
  '--portal-fundo': '#f7f7f7',
  '--portal-painel': '#111111',
  '--portal-destaque': '#F7941E',
  '--portal-destaque-suave': '#fff4e5',
  '--portal-destaque-glow': 'rgba(247, 148, 30, 0.35)',
  '--portal-brilho': 'rgba(247, 148, 30, 0.22)',
  '--portal-anel': 'rgba(247, 148, 30, 0.28)',
};

export const MARCA_CEVA: MarcaPortal = {
  id: 'ceva',
  rotulo: 'CEVA',
  api: '/api/ceva-portal',
  chaveSessao: 'ceva-portal-sessao',
  eventoSair: 'ceva-portal-sair',
  logo: '/logo_ceva_portal.png',
  logoAlt: 'CEVA Logistics',
  arquivo: 'ceva',
  tituloPdf: 'Controle de Escolta CEVA',
  exigeLogin: true,
  colunasOcultas: [],
  css: CSS_CEVA,
};

export const MARCA_IBL: MarcaPortal = {
  id: 'ibl',
  rotulo: 'IBL',
  api: '/api/ibl-portal',
  chaveSessao: 'ibl-portal-sessao',
  eventoSair: 'ibl-portal-sair',
  logo: '/logo_ibl_portal.png',
  logoAlt: 'IBL Logística',
  arquivo: 'ibl',
  tituloPdf: 'Controle de Escolta IBL',
  exigeLogin: false,
  colunasOcultas: ['Solicitante', 'Quem autorizou', 'Atendimento PGR', 'Operação', 'TSP'],
  css: CSS_IBL,
};
