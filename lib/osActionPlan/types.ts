export interface OsActionPlanCadastro {
  razao: string | null;
  fantasia: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  contato: string | null;
  telefone: string | null;
}

export interface OsActionPlanMarco {
  quando: string;
  status: string;
  por: string | null;
}

export interface OsActionPlanOcorrencia {
  quando: string;
  texto: string;
  autor: string | null;
  resolvida: boolean;
}

export interface OsActionPlanFoto {
  legenda: string;
  url: string;
  quando?: string | null;
  local?: string | null;
}

export interface OsActionPlanAtualizacao {
  quando: string;
  texto: string;
  por: string | null;
  fotoUrl: string | null;
  status?: string | null;
  local?: string | null;
  fotos?: string[];
  lat?: number | null;
  lng?: number | null;
  linkMapa?: string | null;
  /** Imagem do arruamento deste ponto, pronta para o PDF. */
  miniMapaImagem?: string | null;
  /** De onde saiu a coordenada: registro já gravado, link de posição ou endereço geocodificado. */
  fontePosicao?: 'registro' | 'link' | 'endereco' | null;
  /** Número da atualização na missão, o mesmo do mapa e do quadro. */
  numero?: number;
}

export interface OsActionPlanHistoricoCliente {
  missionId: string;
  quando: string | null;
  status: string;
  origem: string;
  destino: string;
  tipo: string | null;
}

/** Contagem da conta do cliente. Zero só vale quando o estado é ENCONTRADO. */
export interface OsActionPlanContaCliente {
  estado: 'ENCONTRADO' | 'NÃO CARREGADO' | 'ERRO';
  total: number | null;
  caracterizada: number | null;
  velada: number | null;
  desde: string | null;
}

export interface CroquiEtapa {
  id: string;
  titulo: string;
  legenda: string;
  classificacao: 'confirmado' | 'relatado';
  quando: string | null;
}

export interface CroquiOcorrencia {
  tipo: 'pedagio' | 'perda_contato' | 'desvio_rota' | 'parada' | 'acesso';
  titulo: string;
  subtitulo: string;
  etapas: CroquiEtapa[];
  aprovado: boolean;
}

/** Dados operacionais de UMA ordem de serviço. Sem valores financeiros. */
export interface OsActionPlanInput {
  missionId: string;
  clientName: string;
  cadastro: OsActionPlanCadastro | null;
  status: string;
  tipo: string | null;
  operacaoEspecial: string | null;
  fornecedor: string;
  origem: string;
  destino: string;
  placaCarga: string | null;
  modeloCarga: string | null;
  placaViatura: string | null;
  modeloViatura: string | null;
  motorista: string | null;
  equipe: string[];
  grEspelhamento: string | null;
  seNumber: string | null;
  smNumber: string | null;
  referenceNumber: string | null;
  horarioProgramado: string | null;
  horarioFim: string | null;
  kmInicial: string | null;
  kmFinal: string | null;
  criadoEm: string | null;
  atrasoMinutosOrigem: number | null;
  horaInicialFornecedor: string | null;
  horaFinalFornecedor: string | null;
  kmInicialFornecedor: string | null;
  kmFinalFornecedor: string | null;
  historicoEstado?: 'ENCONTRADO' | 'NÃO CARREGADO' | 'ERRO' | 'CONSULTA INCOMPLETA';
  consultaOcorrencias?: 'ENCONTRADO' | 'ERRO' | 'CONSULTA INCOMPLETA';
  consultaLogs?: 'ENCONTRADO' | 'ERRO' | 'CONSULTA INCOMPLETA';
  consultaEvidencias?: 'ENCONTRADO' | 'ERRO' | 'CONSULTA INCOMPLETA';
  linhaDoTempo: OsActionPlanMarco[];
  atualizacoes: OsActionPlanAtualizacao[];
  historicoCliente: OsActionPlanHistoricoCliente[];
  contaCliente: OsActionPlanContaCliente;
  ocorrencias: OsActionPlanOcorrencia[];
  fotos: OsActionPlanFoto[];
  tratativaTexto: string | null;
  problemaPrincipal?: string | null;
  relatoComplementar?: string | null;
  aprovadoCliente?: boolean;
  evidenciasApuracao?: Array<{
    tipo: string;
    descricao: string;
    origem: string | null;
    quando: string | null;
    principal: boolean;
    url: string | null;
  }>;
  croqui?: CroquiOcorrencia | null;
  objetivoIa?: string | null;
  narrativaIa: string | null;
  planoAcaoIa?: string | null;
  planoMelhoriaIa?: string | null;
  conclusaoIa?: string | null;
  tratativaIa: string | null;
  fotosTratativa: OsActionPlanFoto[];
  geradoEm: string;
  /** padrao = missão sem ocorrência. ocorrencia = relatório com plano de ação. */
  modalidade?: 'padrao' | 'ocorrencia';
  /** No relatório com ocorrência, o quadro pode ficar só no que conversa com o problema. */
  escopoAtualizacoes?: 'todas' | 'relevantes';
  consultaDiario?: 'ENCONTRADO' | 'ERRO' | 'CONSULTA INCOMPLETA';
  origemCoord?: { lat: number; lng: number } | null;
  destinoCoord?: { lat: number; lng: number } | null;
  /** Imagem do mapa com arruamento, pronta para a prévia e para o PDF. */
  mapaImagem?: string | null;
  /** Cópia da foto já dentro do HTML. A chave é o endereço original, que continua no link Abrir foto. */
  fotoEmbutida?: Record<string, string> | null;
  diagnosticoMapa?: {
    atualizacoes: number;
    comEndereco: number;
    comLink: number;
    comCoordenadaNoRegistro: number;
    extraidasDoLink: number;
    geocodificadas: number;
    semLocal: number;
  };
}
