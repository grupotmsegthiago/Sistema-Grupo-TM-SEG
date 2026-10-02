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
  historicoEstado?: 'ENCONTRADO' | 'NÃO CARREGADO' | 'ERRO';
  linhaDoTempo: OsActionPlanMarco[];
  atualizacoes: OsActionPlanAtualizacao[];
  historicoCliente: OsActionPlanHistoricoCliente[];
  contaCliente: OsActionPlanContaCliente;
  ocorrencias: OsActionPlanOcorrencia[];
  fotos: OsActionPlanFoto[];
  tratativaTexto: string | null;
  objetivoIa?: string | null;
  narrativaIa: string | null;
  planoAcaoIa?: string | null;
  planoMelhoriaIa?: string | null;
  conclusaoIa?: string | null;
  tratativaIa: string | null;
  fotosTratativa: OsActionPlanFoto[];
  geradoEm: string;
}
