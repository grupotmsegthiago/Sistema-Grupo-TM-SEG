/**
 * Centro de Homologação — simulação local.
 * Identificadores SIM-* são fictícios. Os valores de referência vêm do
 * relatório da etapa 7 e não são uma leitura nova do banco.
 * Esta função não grava, não chama o banco e não altera o motor canônico.
 */

export const PERSISTENCIA = 'nenhuma' as const;

export type EmpresaSimulada = 'TM GESTAO' | 'TM SEGURANCA' | 'TM SECURITY' | 'INDEFINIDA';

export type NaturezaSimulada =
  | 'gerencial'
  | 'contabil'
  | 'tributaria'
  | 'pendente'
  | 'investimento'
  | 'transferencia'
  | 'tributo'
  | 'custo_os';

export type ParcelaSimulada =
  | 'lista_seguranca'
  | 'adicional_outras'
  | 'ja_reconhecido'
  | 'indefinido'
  | 'provavel'
  | 'velada'
  | 'classe_e'
  | 'fora_do_operacional';

export type StatusSimulado =
  | 'pendente'
  | 'aprovada_simulada'
  | 'rejeitada_simulada'
  | 'documentacao_solicitada';

export type Destino172 = 'A' | 'B' | 'C';

export interface ItemSimulado {
  id: string;
  empresa: EmpresaSimulada;
  contaPagadora: string;
  categoria: string;
  descricao: string;
  quantidade: number | null;
  valorCentavos: number;
  natureza: NaturezaSimulada;
  parcela: ParcelaSimulada;
  evidencia: string;
  podeAprovar: boolean;
  motivoBloqueio: string;
}

export interface EventoSimulado {
  sequencia: number;
  itemId: string;
  acao: 'aprovar' | 'rejeitar' | 'pedir_documento' | 'reverter' | 'destino_172';
  detalhe: string;
  valorCentavos: number;
  empresa: EmpresaSimulada | 'GRUPO';
}

export interface EstadoHomologacao {
  decisoes: Record<string, StatusSimulado>;
  destino172: Destino172;
  historico: EventoSimulado[];
  proximaSequencia: number;
}

export interface ReferenciaEmpresa {
  receitaCentavos: number;
  custoOsCentavos: number;
  resultadoPainelCentavos: number;
}

export const REFERENCIA_ETAPA_7 = {
  rotulo: 'Referência documental da etapa 7. Não é leitura nova do banco.',
  empresas: {
    'TM GESTAO': { receitaCentavos: 131_632_287, custoOsCentavos: 75_242_953, resultadoPainelCentavos: 56_372_037 },
    'TM SEGURANCA': { receitaCentavos: 846_227_309, custoOsCentavos: 476_053_899, resultadoPainelCentavos: 370_173_410 },
    'TM SECURITY': { receitaCentavos: 110_854_382, custoOsCentavos: 55_809_691, resultadoPainelCentavos: 55_044_691 },
  } satisfies Record<Exclude<EmpresaSimulada, 'INDEFINIDA'>, ReferenciaEmpresa>,
  grupo: {
    receitaCentavos: 1_088_713_978,
    custoOsCentavos: 607_106_543,
    resultadoPainelCentavos: 481_590_138,
    resultadoAptoCentavos: 447_850_905,
    margemPainel: 44.23,
    margemApto: 41.14,
  },
  listaSegurancaCentavos: 33_656_211,
  adicionalGestaoCentavos: 12_643,
  adicionalSecurityCentavos: 70_379,
  adicionalOutrasCentavos: 83_022,
  jaReconhecidoCentavos: 17_297,
} as const;

const bloqueioNatureza = 'Esta natureza não entra como despesa operacional. A simulação não a homologa.';

export const ITENS_SIMULADOS: ItemSimulado[] = [
  item('SIM-SEG-COMISSAO', 'TM SEGURANCA', 'TM SEGURANÇA', 'Comissão', 48, 16_715_794, 'gerencial', 'lista_seguranca', 'Texto de comissão e pagamento feito.', true, ''),
  item('SIM-SEG-SALARIO', 'TM SEGURANCA', 'TM SEGURANÇA', 'Salário', 54, 12_711_884, 'gerencial', 'lista_seguranca', 'Texto de salário e pagamento feito.', true, ''),
  item('SIM-SEG-BONUS', 'TM SEGURANCA', 'TM SEGURANÇA', 'Bônus', 14, 1_680_619, 'gerencial', 'lista_seguranca', 'Texto de bônus na própria categoria.', true, ''),
  item('SIM-SEG-ADVOGADO', 'TM SEGURANCA', 'TM SEGURANÇA', 'Advogado', 5, 822_645, 'gerencial', 'lista_seguranca', 'Categoria específica, integralmente na lista.', true, ''),
  item('SIM-SEG-PENSAO', 'TM SEGURANCA', 'TM SEGURANÇA', 'Pensão', 9, 660_000, 'gerencial', 'lista_seguranca', 'Categoria específica, integralmente na lista.', true, ''),
  item('SIM-SEG-CONTABILIDADE', 'TM SEGURANCA', 'TM SEGURANÇA', 'Contabilidade', 8, 628_000, 'gerencial', 'lista_seguranca', 'Honorário contábil, sem DAS.', true, ''),
  item('SIM-SEG-CONSUMO', 'TM SEGURANCA', 'TM SEGURANÇA', 'Consumo', 6, 211_353, 'gerencial', 'lista_seguranca', 'Categoria específica, integralmente na lista.', true, ''),
  item('SIM-SEG-CESTA', 'TM SEGURANCA', 'TM SEGURANÇA', 'Cesta básica', 2, 79_010, 'gerencial', 'lista_seguranca', 'Categoria específica, integralmente na lista.', true, ''),
  item('SIM-SEG-VIVO', 'TM SEGURANCA', 'TM SEGURANÇA', 'Vivo', 5, 36_199, 'gerencial', 'lista_seguranca', 'Categoria específica, integralmente na lista.', true, ''),
  item('SIM-SEG-VT', 'TM SEGURANCA', 'TM SEGURANÇA', 'VT', 1, 33_200, 'gerencial', 'lista_seguranca', 'Categoria específica, integralmente na lista.', true, ''),
  item('SIM-SEG-FOLHA', 'TM SEGURANCA', 'TM SEGURANÇA', 'Pessoal com texto de folha', 1, 25_000, 'gerencial', 'lista_seguranca', 'Descrição de folha dentro de pessoal.', true, ''),
  item('SIM-SEG-MENSALIDADE', 'TM SEGURANCA', 'TM SEGURANÇA', 'Mensalidade', 1, 20_000, 'gerencial', 'lista_seguranca', 'Descrição compatível com a categoria.', true, ''),
  item('SIM-SEG-SEGURO', 'TM SEGURANCA', 'TM SEGURANÇA', 'Seguro', 2, 19_064, 'gerencial', 'lista_seguranca', 'Categoria específica, integralmente na lista.', true, ''),
  item('SIM-SEG-TARIFAS', 'TM SEGURANCA', 'TM SEGURANÇA', 'Tarifas', 5, 13_443, 'gerencial', 'lista_seguranca', 'Tarifa da própria conta, sem outra empresa no texto.', true, ''),
  item('SIM-GEST-TARIFAS', 'TM GESTAO', 'TM GESTÃO', 'Tarifas', null, 12_643, 'gerencial', 'adicional_outras', 'Tarifas da própria conta TM GESTÃO, empresa identificada.', true, ''),
  item('SIM-SEC-CONTABILIDADE', 'TM SECURITY', 'TM SECURITY', 'Contabilidade', null, 65_000, 'gerencial', 'adicional_outras', 'Contabilidade da própria conta TM SECURITY.', true, ''),
  item('SIM-SEC-TARIFAS', 'TM SECURITY', 'TM SECURITY', 'Tarifas', null, 5_379, 'gerencial', 'adicional_outras', 'Tarifas da própria conta TM SECURITY.', true, ''),
  item('SIM-GEST-RECONHECIDO', 'TM GESTAO', 'TM SEGURANÇA', 'Comissão', 1, 17_297, 'gerencial', 'ja_reconhecido', 'Já está no painel da TM GESTÃO. Emissor do cliente: TM GESTÃO. Conta que pagou: TM SEGURANÇA.', false, 'Já reconhecido no painel. Aprovar de novo contaria duas vezes. Use a decisão A, B ou C.'),
  item('SIM-INDEF-CNPJ', 'INDEFINIDA', 'TM SEGURANÇA', 'Contabilidade e tarifas', 5, 110_863, 'pendente', 'indefinido', 'Cinco lançamentos citam outra empresa. A conta pagadora foi a TM SEGURANÇA.', false, 'CNPJ indefinido. A conta que pagou não escolhe a empresa.'),
  item('SIM-SEG-PROVAVEL', 'TM SEGURANCA', 'TM SEGURANÇA', 'Despesas prováveis', 54, 9_929_906, 'pendente', 'provavel', 'Débito sem detalhe, reembolso sem OS e bônus em categoria trocada.', false, 'Ainda é despesa pendente. A simulação não trata como homologada.'),
  item('SIM-SEG-VELADA', 'TM SEGURANCA', 'TM SEGURANÇA', 'Operação velada', 140, 9_408_507, 'pendente', 'velada', 'Nenhum lançamento traz número de OS. Pode já estar no custo da missão.', false, 'Sem vínculo com OS. Não entra no resultado operacional.'),
  item('SIM-SEG-CLASSE-E', 'TM SEGURANCA', 'TM SEGURANÇA', 'Sem evidência suficiente', 98, 51_754_236, 'pendente', 'classe_e', 'A descrição não diz o que foi pago. Desses, 79 são pessoal sem texto de folha.', false, 'Evidência insuficiente. Não entra no resultado operacional.'),
  item('SIM-REF-CONTABIL', 'INDEFINIDA', 'Referência, sem conta atribuída', 'Ajustes de saldo', 45, 158_528_572, 'contabil', 'fora_do_operacional', 'Atualização de investimento e conciliação. Referência da etapa 7.', false, bloqueioNatureza),
  item('SIM-REF-TRIBUTARIA', 'INDEFINIDA', 'Referência, sem conta atribuída', 'DAS', 22, 46_045_976, 'tributaria', 'fora_do_operacional', 'Guias ainda sem CNPJ confirmado pela contabilidade. Sem alíquota.', false, bloqueioNatureza),
  item('SIM-REF-INVESTIMENTO', 'INDEFINIDA', 'Referência, sem conta atribuída', 'Investimento', 213, 1_379_945_610, 'investimento', 'fora_do_operacional', 'Referência da etapa 3. Fica fora do resultado operacional.', false, bloqueioNatureza),
  item('SIM-REF-TRANSFERENCIA', 'INDEFINIDA', 'Referência, sem conta atribuída', 'Transferência', 21, 83_623_102, 'transferencia', 'fora_do_operacional', 'Referência da etapa 3. Fica fora do resultado operacional.', false, bloqueioNatureza),
  item('SIM-REF-TRIBUTO', 'INDEFINIDA', 'Referência, sem conta atribuída', 'Tributo no livro', 42, 57_009_178, 'tributo', 'fora_do_operacional', 'Referência da etapa 3. Não abate o resultado de novo.', false, bloqueioNatureza),
  item('SIM-REF-FORNECEDOR', 'INDEFINIDA', 'Referência, sem conta atribuída', 'Fornecedor', 451, 535_101_257, 'custo_os', 'fora_do_operacional', 'Já está no custo canônico da OS. Referência da etapa 3.', false, 'Fornecedor já compõe o custo canônico da OS. Descontar de novo seria dupla contagem.'),
];

const POR_ID = new Map(ITENS_SIMULADOS.map((item) => [item.id, item]));

export function estadoInicial(): EstadoHomologacao {
  const decisoes: Record<string, StatusSimulado> = {};
  for (const item of ITENS_SIMULADOS) decisoes[item.id] = 'pendente';
  return { decisoes, destino172: 'A', historico: [], proximaSequencia: 1 };
}

export function aplicarDecisao(
  estado: EstadoHomologacao,
  pedido: { itemId: string; acao: 'aprovar' | 'rejeitar' | 'pedir_documento' | 'reverter' },
): { estado: EstadoHomologacao; erro: string | null } {
  const item = POR_ID.get(pedido.itemId);
  if (!item) return { estado, erro: 'Item simulado não encontrado.' };
  const atual = estado.decisoes[item.id] || 'pendente';
  if (pedido.acao === 'reverter') {
    if (atual === 'pendente') return { estado, erro: 'Não há decisão simulada para desfazer.' };
    return { estado: comStatus(estado, item, 'pendente', 'reverter', 'Decisão simulada desfeita. O item voltou a pendente.'), erro: null };
  }
  if (pedido.acao === 'aprovar') {
    if (!item.podeAprovar) return { estado, erro: item.motivoBloqueio };
    if (atual === 'aprovada_simulada') return { estado, erro: 'Este item já está na simulação. Aprovar de novo contaria duas vezes.' };
    return { estado: comStatus(estado, item, 'aprovada_simulada', 'aprovar', 'Aprovação simulada. Não foi gravada e não é homologação real.'), erro: null };
  }
  if (pedido.acao === 'rejeitar') {
    if (atual === 'rejeitada_simulada') return { estado, erro: 'Este item já está rejeitado na simulação.' };
    return { estado: comStatus(estado, item, 'rejeitada_simulada', 'rejeitar', 'Rejeição simulada. O valor não entra no resultado.'), erro: null };
  }
  if (atual === 'documentacao_solicitada') return { estado, erro: 'A documentação deste item já foi pedida na simulação.' };
  return { estado: comStatus(estado, item, 'documentacao_solicitada', 'pedir_documento', 'Pedido simulado de documentação. O valor continua fora do resultado.'), erro: null };
}

export function definirDestino172(
  estado: EstadoHomologacao,
  destino: Destino172,
): { estado: EstadoHomologacao; erro: string | null } {
  if (estado.destino172 === destino) return { estado, erro: 'Essa alternativa já está selecionada na simulação.' };
  const detalhe = destino === 'A'
    ? 'Simulação: manter os R$ 172,97 na TM GESTÃO.'
    : destino === 'B'
      ? 'Simulação: reatribuir os R$ 172,97 à TM SEGURANÇA.'
      : 'Simulação: retirar os R$ 172,97 até comprovação.';
  const historico = estado.historico.concat({
    sequencia: estado.proximaSequencia,
    itemId: 'SIM-GEST-RECONHECIDO',
    acao: 'destino_172',
    detalhe,
    valorCentavos: REFERENCIA_ETAPA_7.jaReconhecidoCentavos,
    empresa: destino === 'B' ? 'TM SEGURANCA' : destino === 'C' ? 'GRUPO' : 'TM GESTAO',
  });
  return {
    estado: { ...estado, destino172: destino, historico, proximaSequencia: estado.proximaSequencia + 1 },
    erro: null,
  };
}

export interface ResultadoCalculado {
  receitaCentavos: number;
  custoOsCentavos: number;
  despesaReconhecidaCentavos: number;
  despesaAprovadaSimuladaCentavos: number;
  resultadoCentavos: number;
  margem: number;
}

export interface ResultadoEmpresa extends ResultadoCalculado {
  empresa: Exclude<EmpresaSimulada, 'INDEFINIDA'>;
}

export interface CenarioSimulado {
  empresas: ResultadoEmpresa[];
  grupo: ResultadoCalculado;
  listaAprovadaCentavos: number;
  adicionalAprovadaCentavos: number;
  reconhecidoDestino: Destino172;
  aptoCompleto: boolean;
  diferencaParaAptoCentavos: number;
  diferencaParaPainelCentavos: number;
  fornecedorNoOperacionalCentavos: number;
  naturezaForaNoOperacionalCentavos: number;
}

export function calcularCenario(estado: EstadoHomologacao): CenarioSimulado {
  const aprovada = (id: string) => estado.decisoes[id] === 'aprovada_simulada';
  const somaParcela = (parcela: ParcelaSimulada, empresa?: EmpresaSimulada) => ITENS_SIMULADOS
    .filter((item) => item.podeAprovar && item.parcela === parcela && (!empresa || item.empresa === empresa) && aprovada(item.id))
    .reduce((total, item) => total + item.valorCentavos, 0);

  const reconhecido = REFERENCIA_ETAPA_7.jaReconhecidoCentavos;
  const reconhecidoPorEmpresa: Record<Exclude<EmpresaSimulada, 'INDEFINIDA'>, number> = {
    'TM GESTAO': estado.destino172 === 'A' ? reconhecido : 0,
    'TM SEGURANCA': estado.destino172 === 'B' ? reconhecido : 0,
    'TM SECURITY': 0,
  };

  const empresas = (Object.keys(REFERENCIA_ETAPA_7.empresas) as Array<Exclude<EmpresaSimulada, 'INDEFINIDA'>>).map((empresa) => {
    const base = REFERENCIA_ETAPA_7.empresas[empresa];
    const despesaAprovada = ITENS_SIMULADOS
      .filter((item) => item.podeAprovar && item.empresa === empresa && item.natureza === 'gerencial' && aprovada(item.id))
      .reduce((total, item) => total + item.valorCentavos, 0);
    const despesaReconhecida = reconhecidoPorEmpresa[empresa];
    const resultado = base.receitaCentavos - base.custoOsCentavos - despesaReconhecida - despesaAprovada;
    return {
      empresa,
      receitaCentavos: base.receitaCentavos,
      custoOsCentavos: base.custoOsCentavos,
      despesaReconhecidaCentavos: despesaReconhecida,
      despesaAprovadaSimuladaCentavos: despesaAprovada,
      resultadoCentavos: resultado,
      margem: margemPercentual(resultado, base.receitaCentavos),
    };
  });

  const grupoReceita = REFERENCIA_ETAPA_7.grupo.receitaCentavos;
  const grupoCusto = REFERENCIA_ETAPA_7.grupo.custoOsCentavos;
  const grupoReconhecida = empresas.reduce((total, empresa) => total + empresa.despesaReconhecidaCentavos, 0);
  const grupoAprovada = empresas.reduce((total, empresa) => total + empresa.despesaAprovadaSimuladaCentavos, 0);
  const grupoResultado = grupoReceita - grupoCusto - grupoReconhecida - grupoAprovada;
  const listaAprovada = somaParcela('lista_seguranca');
  const adicionalAprovada = somaParcela('adicional_outras');
  const aptoCompleto = listaAprovada === REFERENCIA_ETAPA_7.listaSegurancaCentavos
    && adicionalAprovada === REFERENCIA_ETAPA_7.adicionalOutrasCentavos
    && estado.destino172 === 'A'
    && grupoResultado === REFERENCIA_ETAPA_7.grupo.resultadoAptoCentavos;

  return {
    empresas,
    grupo: {
      receitaCentavos: grupoReceita,
      custoOsCentavos: grupoCusto,
      despesaReconhecidaCentavos: grupoReconhecida,
      despesaAprovadaSimuladaCentavos: grupoAprovada,
      resultadoCentavos: grupoResultado,
      margem: margemPercentual(grupoResultado, grupoReceita),
    },
    listaAprovadaCentavos: listaAprovada,
    adicionalAprovadaCentavos: adicionalAprovada,
    reconhecidoDestino: estado.destino172,
    aptoCompleto,
    diferencaParaAptoCentavos: grupoResultado - REFERENCIA_ETAPA_7.grupo.resultadoAptoCentavos,
    diferencaParaPainelCentavos: grupoResultado - REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos,
    fornecedorNoOperacionalCentavos: somaForcada(estado, 'custo_os'),
    naturezaForaNoOperacionalCentavos: somaForcada(estado, 'contabil')
      + somaForcada(estado, 'tributaria')
      + somaForcada(estado, 'investimento')
      + somaForcada(estado, 'transferencia')
      + somaForcada(estado, 'tributo')
      + somaForcada(estado, 'pendente'),
  };
}

export function aprovarTudoElegivel(estado: EstadoHomologacao): EstadoHomologacao {
  let atual = estado;
  for (const item of ITENS_SIMULADOS) {
    if (!item.podeAprovar) continue;
    const passo = aplicarDecisao(atual, { itemId: item.id, acao: 'aprovar' });
    atual = passo.estado;
  }
  return atual;
}

export function margemPercentual(resultadoCentavos: number, receitaCentavos: number): number {
  if (!(receitaCentavos > 0)) return 0;
  return Math.round((resultadoCentavos / receitaCentavos) * 10000) / 100;
}

export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function nomeEmpresa(empresa: EmpresaSimulada | 'GRUPO'): string {
  if (empresa === 'TM GESTAO') return 'TM GESTÃO';
  if (empresa === 'TM SEGURANCA') return 'TM SEGURANÇA';
  if (empresa === 'TM SECURITY') return 'TM SECURITY';
  if (empresa === 'GRUPO') return 'Grupo';
  return 'CNPJ indefinido';
}

export function rotuloNatureza(natureza: NaturezaSimulada): string {
  const rotulos: Record<NaturezaSimulada, string> = {
    gerencial: 'Despesa gerencial',
    contabil: 'Despesa contábil',
    tributaria: 'Despesa tributária',
    pendente: 'Despesa pendente',
    investimento: 'Investimento',
    transferencia: 'Transferência',
    tributo: 'Tributo',
    custo_os: 'Custo canônico da OS',
  };
  return rotulos[natureza];
}

export function itemPorId(id: string): ItemSimulado | null {
  return POR_ID.get(id) || null;
}

function item(
  id: string,
  empresa: EmpresaSimulada,
  contaPagadora: string,
  categoria: string,
  quantidade: number | null,
  valorCentavos: number,
  natureza: NaturezaSimulada,
  parcela: ParcelaSimulada,
  evidencia: string,
  podeAprovar: boolean,
  motivoBloqueio: string,
): ItemSimulado {
  return {
    id,
    empresa,
    contaPagadora,
    categoria,
    descricao: `Item simulado ${id}. Representa o bloco documental. Não é lançamento do banco.`,
    quantidade,
    valorCentavos,
    natureza,
    parcela,
    evidencia,
    podeAprovar,
    motivoBloqueio,
  };
}

function comStatus(
  estado: EstadoHomologacao,
  item: ItemSimulado,
  status: StatusSimulado,
  acao: EventoSimulado['acao'],
  detalhe: string,
): EstadoHomologacao {
  return {
    ...estado,
    decisoes: { ...estado.decisoes, [item.id]: status },
    historico: estado.historico.concat({
      sequencia: estado.proximaSequencia,
      itemId: item.id,
      acao,
      detalhe,
      valorCentavos: item.valorCentavos,
      empresa: item.empresa,
    }),
    proximaSequencia: estado.proximaSequencia + 1,
  };
}

function somaForcada(estado: EstadoHomologacao, natureza: NaturezaSimulada): number {
  return ITENS_SIMULADOS
    .filter((item) => item.natureza === natureza && item.podeAprovar && estado.decisoes[item.id] === 'aprovada_simulada')
    .reduce((total, item) => total + item.valorCentavos, 0);
}
