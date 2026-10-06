import type { LinhaPlano } from './montarPlanos';
import type { OsActionPlanInput } from './types';

export type TipoAnalise = 'fato_confirmado' | 'relato' | 'hipotese' | 'divergencia' | 'ausencia';

export type CategoriaOcorrencia =
  | 'perda_contato'
  | 'veiculo_incorreto'
  | 'atraso_origem'
  | 'desvio_rota'
  | 'ausencia_evidencia'
  | 'falha_comunicacao'
  | 'parada'
  | 'falha_checklist'
  | 'problema_sistema';

export interface ItemAnalise {
  tipo: TipoAnalise;
  descricao: string;
  fonte: string;
  registroId: string;
  timestamp: string | null;
}

export interface IndicadorSugerido {
  nome: string;
  meta: string;
  frequencia: string;
  responsavel: string;
  resultado: 'Não medido';
}

export interface AnaliseOcorrencia {
  itens: ItemAnalise[];
  categorias: CategoriaOcorrencia[];
  causaEstado: 'confirmada' | 'em_apuracao' | 'indeterminada';
  causaTexto: string;
  procedimento: string[] | null;
  acao: Array<LinhaPlano & { id: string }>;
  melhoria: Array<LinhaPlano & { id: string }>;
  indicadores: IndicadorSugerido[];
  conclusao: string;
  barreira: string | null;
}

const CRITICO = 'Imediato / até 24h';
const ALTO = 'até 48h';
const MEDIO = 'até 5 dias úteis';
const PREVENTIVO = 'até 7 dias';
const TREINO = 'até 30 dias';
const SISTEMA = 'Prazo sugerido conforme complexidade, sem data prometida';

const COORD = 'Coordenação Operacional';
const CENTRAL = 'Central de Monitoramento';
const QUALIDADE = 'Qualidade';
const TI = 'TI/Sistema';
const GERENCIA = 'Gerência Operacional';

const ORDEM: CategoriaOcorrencia[] = [
  'veiculo_incorreto',
  'perda_contato',
  'desvio_rota',
  'falha_comunicacao',
  'atraso_origem',
  'parada',
  'falha_checklist',
  'problema_sistema',
  'ausencia_evidencia',
];

function semAcento(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function placaNorm(valor: string | null | undefined): string {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function linha(acao: string, responsavel: string, prazo: string, evidencia: string): LinhaPlano {
  return { acao, responsavel, prazo, status: 'Proposta', evidencia };
}

function item(
  tipo: TipoAnalise,
  descricao: string,
  fonte: string,
  registroId: string,
  timestamp: string | null = null,
): ItemAnalise {
  return { tipo, descricao, fonte, registroId, timestamp };
}

function textoLivre(d: OsActionPlanInput): string {
  const foco = String(d.problemaPrincipal || '').trim();
  const principais = (d.evidenciasApuracao || []).filter((e) => e.principal).map((e) => e.descricao);
  if (foco) {
    return [foco, d.relatoComplementar || '', d.tratativaTexto || '', ...principais].filter(Boolean).join('\n');
  }
  return [
    ...d.ocorrencias.map((o) => o.texto),
    ...d.atualizacoes.map((a) => a.texto),
    d.tratativaTexto || '',
    d.narrativaIa || '',
    d.objetivoIa || '',
    d.tratativaIa || '',
  ].join('\n');
}

function temAtrasoNoTexto(normalizado: string): boolean {
  return /(?<!sem\s)atraso/.test(normalizado);
}

function placasCitadas(bruto: string): string[] {
  const achadas = bruto.toUpperCase().match(/\b[A-Z]{3}\d[A-Z0-9]\d{2}\b/g) || [];
  return [...new Set(achadas.map((p) => placaNorm(p)))];
}

const FLUXO_IDENTIFICACAO = [
  'Regra: perdeu contato visual = perdeu a identificação positiva.',
  'Perda visual',
  'Confirmar placa, modelo e motorista',
  'Placa confirmada com a OS?',
  'Sim: continuar a escolta',
  'Não: comunicar a Central de Monitoramento',
  'Tentar contato com motorista ou transportadora, só com o que estiver registrado',
  'Obter a localização declarada. Posição escrita não é GPS',
  'Reencontrar o veículo',
  'Confirmar a placa de novo',
  'Só então retomar a escolta',
];

const FLUXO_IDENTIFICACAO_CURTO = [
  'Em caso de perda de contato visual com o veículo escoltado, a equipe deverá realizar nova identificação positiva do veículo antes da retomada do acompanhamento.',
  'Pedágio ou perda visual',
  'Localizar o veículo',
  'Conferir a placa',
  'A placa confere com a OS?',
  'Sim: continuar a escolta',
  'Não: não acompanhar, comunicar a Central e localizar o veículo correto',
];

const FLUXO_ROTA = [
  'Desvio de rota relatado',
  'Confrontar a rota cadastrada com as posições escritas na OS',
  'Comunicar a Central',
  'Pedir a posição declarada',
  'Não tratar texto de localização como telemetria',
  'Retomar somente com a rota esclarecida no registro',
];

const FLUXO_ATRASO = [
  'Horário programado comparado com a chegada registrada',
  'Atraso identificado nos horários da OS',
  'Comunicar a Central sem concluir o motivo',
  'Pedir o relato da equipe e manter o motivo em apuração',
  'Anexar a evidência que existir. Se não existir, registrar a ausência',
];

const FLUXO_COMUNICACAO = [
  'Fato que exigia comunicação com a Central',
  'Localizar nos registros o horário do aviso',
  'Se não houver aviso, registrar a ausência',
  'Definir canal e tempo máximo para o próximo evento do mesmo tipo',
  'Conferir o cumprimento na auditoria seguinte',
];

const FLUXO_EVIDENCIA = [
  'Etapa crítica sem evidência localizada',
  'Solicitar o anexo que falta',
  'Recebeu evidência objetiva?',
  'Sim: juntar ao registro e seguir a apuração',
  'Não: manter a ausência explícita e não concluir a causa',
];

const FLUXO_PARADA = [
  'Parada relatada no percurso',
  'Separar parada programada de parada não explicada',
  'Comunicar a Central',
  'Manter o motivo como relato até haver evidência',
  'Retomar com o registro do reinício, se existir',
];

function planoIdentificacao(enxuto: boolean): { acao: LinhaPlano[]; melhoria: LinhaPlano[] } {
  if (enxuto) {
    return {
      acao: [
        linha('Orientar formalmente a equipe envolvida sobre identificação positiva após perda de contato visual.', COORD, 'Imediato', 'Registro da orientação.'),
      ],
      melhoria: [
        linha('Reconfirmar a placa após pedágio, ultrapassagem ou perda visual, antes de continuar o acompanhamento.', GERENCIA, 'Imediato', 'Registro da conferência da placa.'),
        linha('Se a placa não puder ser confirmada, comunicar a Central e localizar o veículo correto antes de retomar a escolta.', CENTRAL, 'Imediato', 'Histórico da comunicação com a Central.'),
        linha('Auditar as operações seguintes e reforçar o procedimento com as equipes.', QUALIDADE, '30 dias', '% de operações auditadas conformes. Resultado atual: Não medido.'),
      ],
    };
  }
  return {
    acao: [
      linha('Concluir a apuração com o relato formal dos agentes e a leitura das comunicações da Central.', COORD, '48 horas', 'Relatório de apuração assinado.'),
      linha('Orientar a equipe envolvida no procedimento de identificação positiva do veículo escoltado.', COORD, 'Imediato', 'Registro da orientação. Resultado atual: Não medido.'),
      linha('Publicar a regra: após perda de contato visual, não tratar veículo semelhante como o escoltado sem confirmar a placa.', GERENCIA, '5 dias', 'POP publicado.'),
    ],
    melhoria: [
      linha('Tornar obrigatória, no início da missão, a confirmação de placa, modelo, motorista e veículo, com registro no sistema.', TI, '7 dias', 'Checklist eletrônico. Resultado atual: Não medido.'),
      linha('Reconfirmar a placa após ultrapassagem, pedágio, parada ou perda momentânea de contato, antes de prosseguir.', GERENCIA, 'Imediato', 'Auditoria das OS. Resultado atual: Não medido.'),
      linha('Criar no sistema o status de perda de contato com o veículo escoltado, com alerta imediato para a Central.', TI, '15 dias — sugestão, conforme complexidade', 'Funcionalidade implantada. Resultado atual: Não medido.'),
      linha('Na perda de contato, a Central tenta contato com motorista ou transportadora e obtém a localização declarada antes da retomada.', CENTRAL, 'Imediato', 'Histórico da ocorrência na OS.'),
      linha('Incluir foto do veículo ou da placa no checklist de início, quando a operação permitir.', COORD, '7 dias', 'Foto vinculada à OS, se a operação permitir. Resultado atual: Não medido.'),
      linha('Criar alerta quando uma ocorrência ficar sem atualização por período definido durante missão ativa.', TI, '15 dias — sugestão, conforme complexidade', 'Alerta automatizado. Resultado atual: Não medido.'),
      linha('Reciclar os agentes em identificação, perda de contato, comunicação e retomada do acompanhamento.', COORD, '30 dias', '% de colaboradores reciclados. Resultado atual: Não medido.'),
      linha('Auditar as operações seguintes do mesmo cliente para verificar o cumprimento do novo procedimento.', QUALIDADE, '30 dias', '% de operações auditadas conformes. Resultado atual: Não medido.'),
    ],
  };
}

function catalogo(categoria: CategoriaOcorrencia): { acao: LinhaPlano[]; melhoria: LinhaPlano[] } {
  switch (categoria) {
    case 'veiculo_incorreto':
    case 'perda_contato':
      return { acao: [], melhoria: [] };
    case 'desvio_rota':
      return {
        acao: [
          linha('Confrontar a rota cadastrada com as posições escritas nas atualizações desta OS.', CENTRAL, ALTO, 'Registro da rota e das posições já lançadas.'),
          linha('Comunicar a Central o desvio relatado e pedir a posição atual declarada.', CENTRAL, ALTO, 'Horário do aviso no histórico.'),
        ],
        melhoria: [
          linha('Exigir dupla conferência da rota antes da saída e após desvio relatado.', QUALIDADE, PREVENTIVO, 'Quantidade de divergências de rota. Resultado atual: Não medido.'),
          linha('Avaliar bloqueio de encerramento quando a rota relatada divergir da cadastrada.', TI, SISTEMA, 'Existência do bloqueio. Resultado atual: Não medido.'),
        ],
      };
    case 'falha_comunicacao':
      return {
        acao: [
          linha('Reconstituir pelos registros o horário em que a Central foi comunicada.', CENTRAL, ALTO, 'Lançamento do aviso ou registro de que ele não existe.'),
          linha('Se o aviso não estiver na OS, registrar a ausência em vez de supor o contato.', COORD, ALTO, 'Campo de comunicação vazio nos registros consultados.'),
        ],
        melhoria: [
          linha('Definir canal e tempo máximo para comunicar este tipo de fato à Central.', GERENCIA, PREVENTIVO, 'Tempo médio de comunicação. Resultado atual: Não medido.'),
          linha('Medir o percentual de ocorrências comunicadas dentro do prazo combinado.', QUALIDADE, PREVENTIVO, '% de ocorrências comunicadas no prazo. Resultado atual: Não medido.'),
        ],
      };
    case 'atraso_origem':
      return {
        acao: [
          linha('Registrar a diferença entre o horário programado e a chegada já lançada na OS.', CENTRAL, MEDIO, 'Horários de programação e de status Origem.'),
          linha('Comunicar à Central o atraso dos horários, sem concluir o motivo.', COORD, MEDIO, 'Registro do aviso. O motivo segue em apuração.'),
          linha('Pedir o relato da equipe sobre o atraso e mantê-lo como ponto em apuração.', CENTRAL, MEDIO, 'Relato arquivado, sem promoção a causa.'),
        ],
        melhoria: [
          linha('Padronizar o aviso à Central quando a chegada na origem passar do horário.', GERENCIA, PREVENTIVO, 'Tempo médio entre o atraso e o aviso. Resultado atual: Não medido.'),
          linha('Auditar OS com atraso na origem e a presença do comunicado correspondente.', QUALIDADE, PREVENTIVO, 'Reincidência de atraso na origem. Resultado atual: Não medido.'),
        ],
      };
    case 'parada':
      return {
        acao: [
          linha('Esclarecer a parada relatada no percurso, sem transformar o relato em causa.', CENTRAL, MEDIO, 'Registro da parada e do que foi possível confirmar.'),
          linha('Separar, no registro, parada programada de parada ainda sem motivo comprovado.', COORD, MEDIO, 'Classificação da parada nesta OS.'),
        ],
        melhoria: [
          linha('Exigir comunicação da parada não programada à Central no momento do fato.', GERENCIA, PREVENTIVO, '% de paradas comunicadas. Resultado atual: Não medido.'),
          linha('Auditar paradas sem motivo comprovado nas operações seguintes.', QUALIDADE, PREVENTIVO, 'Quantidade de paradas sem evidência. Resultado atual: Não medido.'),
        ],
      };
    case 'falha_checklist':
      return {
        acao: [
          linha('Verificar se o checklist da etapa envolvida consta na OS. Se não constar, registrar a ausência.', QUALIDADE, ALTO, 'Checklist localizado ou ausência registrada.'),
        ],
        melhoria: [
          linha('Tornar o checklist da saída obrigatório para liberar o início da escolta.', TI, SISTEMA, '% de OS com checklist completo. Resultado atual: Não medido.'),
        ],
      };
    case 'problema_sistema':
      return {
        acao: [
          linha('Registrar somente a falha de sistema que estiver escrita na OS e encaminhar à TI.', TI, ALTO, 'Texto do registro que descreve a falha. Sem supor GPS.'),
        ],
        melhoria: [
          linha('Avaliar alerta interno para a falha relatada, sem prometer data de desenvolvimento.', TI, SISTEMA, 'Registro da avaliação. Resultado atual: Não medido.'),
        ],
      };
    case 'ausencia_evidencia':
      return {
        acao: [
          linha('Reunir a evidência faltante da etapa crítica. O que não está no cadastro permanece ausência.', COORD, ALTO, 'Anexo localizado ou registro de que não foi encontrado.'),
          linha('Não encerrar a apuração enquanto a evidência desta ocorrência não for localizada ou dispensada por escrito.', GERENCIA, ALTO, 'Decisão humana registrada na revisão do documento.'),
        ],
        melhoria: [
          linha('Avaliar bloqueio de encerramento quando faltar a evidência obrigatória da etapa.', TI, SISTEMA, 'Quantidade de OS sem evidência obrigatória. Resultado atual: Não medido.'),
        ],
      };
    default:
      return { acao: [], melhoria: [] };
  }
}

function indicadoresDe(categorias: CategoriaOcorrencia[], enxuto: boolean): IndicadorSugerido[] {
  if (categorias.includes('perda_contato') || categorias.includes('veiculo_incorreto')) {
    if (enxuto) {
      return [
        { nome: '% de perdas de acompanhamento com nova confirmação da placa', meta: '100%', frequencia: 'Mensal', responsavel: QUALIDADE, resultado: 'Não medido' },
        { nome: '% de perdas de acompanhamento comunicadas à Central', meta: '100%', frequencia: 'Mensal', responsavel: CENTRAL, resultado: 'Não medido' },
      ];
    }
    const lista: IndicadorSugerido[] = [
      { nome: '% de missões com identificação positiva no início', meta: '100%', frequencia: 'Mensal', responsavel: QUALIDADE, resultado: 'Não medido' },
      { nome: '% de perdas de contato comunicadas à Central', meta: '100%', frequencia: 'Mensal', responsavel: CENTRAL, resultado: 'Não medido' },
      { nome: '% de conformidade nas auditorias das operações seguintes', meta: '95% ou mais', frequencia: 'Mensal', responsavel: QUALIDADE, resultado: 'Não medido' },
      { nome: '% da equipe operacional reciclada', meta: '100% em até 30 dias', frequencia: 'Mensal', responsavel: COORD, resultado: 'Não medido' },
    ];
    if (categorias.includes('veiculo_incorreto')) {
      lista.push({ nome: 'Recorrência de acompanhamento de veículo incorreto', meta: 'Zero nos próximos 90 dias', frequencia: 'Mensal', responsavel: QUALIDADE, resultado: 'Não medido' });
    }
    return lista;
  }
  const mapa: Partial<Record<CategoriaOcorrencia, IndicadorSugerido>> = {
    perda_contato: { nome: 'Reincidência de perda de acompanhamento', meta: 'Reduzir a repetição do mesmo fato', frequencia: 'Mensal', responsavel: QUALIDADE, resultado: 'Não medido' },
    veiculo_incorreto: { nome: '% de OS com identificação positiva antes da saída', meta: 'Checklist completo na saída', frequencia: 'Mensal', responsavel: QUALIDADE, resultado: 'Não medido' },
    atraso_origem: { nome: 'Reincidência de atraso na origem', meta: 'Acompanhar a repetição', frequencia: 'Mensal', responsavel: GERENCIA, resultado: 'Não medido' },
    desvio_rota: { nome: 'Quantidade de divergências de rota', meta: 'Acompanhar a repetição', frequencia: 'Mensal', responsavel: CENTRAL, resultado: 'Não medido' },
    falha_comunicacao: { nome: '% de ocorrências comunicadas dentro do prazo combinado', meta: 'Acompanhar o cumprimento do aviso', frequencia: 'Mensal', responsavel: CENTRAL, resultado: 'Não medido' },
    ausencia_evidencia: { nome: 'Quantidade de OS sem evidência obrigatória', meta: 'Acompanhar a ausência', frequencia: 'Mensal', responsavel: QUALIDADE, resultado: 'Não medido' },
    parada: { nome: 'Quantidade de paradas sem evidência', meta: 'Acompanhar a repetição', frequencia: 'Mensal', responsavel: QUALIDADE, resultado: 'Não medido' },
    falha_checklist: { nome: '% de OS com checklist completo', meta: 'Checklist presente na saída', frequencia: 'Mensal', responsavel: QUALIDADE, resultado: 'Não medido' },
    problema_sistema: { nome: 'Falhas de sistema relatadas e encaminhadas', meta: 'Todo relato de sistema com registro', frequencia: 'Mensal', responsavel: TI, resultado: 'Não medido' },
  };
  const lista = categorias.map((c) => mapa[c]).filter((i): i is IndicadorSugerido => Boolean(i));
  return lista.length ? lista.slice(0, 4) : [{
    nome: 'Reincidência de ocorrência relevante',
    meta: 'Acompanhar somente se uma categoria passar a aparecer',
    frequencia: 'Mensal',
    responsavel: QUALIDADE,
    resultado: 'Não medido',
  }];
}

function procedimentoDe(categorias: CategoriaOcorrencia[], enxuto: boolean): string[] | null {
  if (categorias.includes('perda_contato') || categorias.includes('veiculo_incorreto')) {
    const titulo = categorias.includes('veiculo_incorreto') && categorias.includes('perda_contato')
      ? 'Perda de contato ou divergência de veículo'
      : categorias.includes('veiculo_incorreto')
        ? 'Divergência de identificação do veículo'
        : 'Perda de contato visual';
    return [titulo, ...(enxuto ? FLUXO_IDENTIFICACAO_CURTO : FLUXO_IDENTIFICACAO)];
  }
  if (categorias.includes('desvio_rota')) return FLUXO_ROTA;
  if (categorias.includes('falha_comunicacao')) return FLUXO_COMUNICACAO;
  if (categorias.includes('atraso_origem')) return FLUXO_ATRASO;
  if (categorias.includes('ausencia_evidencia')) return FLUXO_EVIDENCIA;
  if (categorias.includes('parada')) return FLUXO_PARADA;
  return null;
}

function nomeCategoria(categoria: CategoriaOcorrencia): string {
  const nomes: Record<CategoriaOcorrencia, string> = {
    perda_contato: 'perda de acompanhamento ou de contato',
    veiculo_incorreto: 'divergência de identificação do veículo',
    atraso_origem: 'atraso na origem',
    desvio_rota: 'desvio de rota',
    ausencia_evidencia: 'ausência de evidência',
    falha_comunicacao: 'falha de comunicação com a Central',
    parada: 'parada no percurso',
    falha_checklist: 'checklist insuficiente',
    problema_sistema: 'falha de sistema relatada',
  };
  return nomes[categoria];
}

function montarPlanos(categorias: CategoriaOcorrencia[], enxuto: boolean): { acao: Array<LinhaPlano & { id: string }>; melhoria: Array<LinhaPlano & { id: string }> } {
  if (!categorias.length) {
    return {
      acao: [{
        ...linha(
          'Nenhuma medida corretiva específica: os registros consultados não identificaram ocorrência relevante.',
          COORD,
          'Não se aplica',
          'Não identificado nos registros consultados.',
        ),
        id: 'AC-01',
      }],
      melhoria: [{
        ...linha(
          'Nenhuma melhoria preventiva específica: não há risco operacional identificado para alterar o processo.',
          QUALIDADE,
          'Não se aplica',
          'Não medido.',
        ),
        id: 'MP-01',
      }],
    };
  }
  const acao: LinhaPlano[] = [];
  const melhoria: LinhaPlano[] = [];
  if (categorias.some((c) => c === 'perda_contato' || c === 'veiculo_incorreto')) {
    const bloco = planoIdentificacao(enxuto);
    acao.push(...bloco.acao);
    melhoria.push(...bloco.melhoria);
  }
  for (const categoria of categorias) {
    if (categoria === 'perda_contato' || categoria === 'veiculo_incorreto') continue;
    const bloco = catalogo(categoria);
    for (const l of bloco.acao) {
      if (acao.length >= 8) break;
      if (!acao.some((a) => a.acao === l.acao)) acao.push(l);
    }
    for (const l of bloco.melhoria) {
      if (melhoria.length >= 8) break;
      if (!melhoria.some((a) => a.acao === l.acao)) melhoria.push(l);
    }
  }
  return {
    acao: acao.map((l, i) => ({ ...l, id: `AC-${String(i + 1).padStart(2, '0')}` })),
    melhoria: melhoria.map((l, i) => ({ ...l, id: `MP-${String(i + 1).padStart(2, '0')}` })),
  };
}

function barreiraDe(categorias: CategoriaOcorrencia[]): string | null {
  if (categorias.includes('perda_contato') || categorias.includes('veiculo_incorreto')) {
    return 'Após perda momentânea de contato visual, a continuidade do acompanhamento ocorreu sem nova confirmação positiva da placa do veículo escoltado.';
  }
  if (categorias.includes('desvio_rota')) {
    return 'O percurso relacionado à ocorrência seguiu sem confronto entre a rota cadastrada e a posição declarada.';
  }
  if (categorias.includes('parada')) {
    return 'A parada relatada não teve o motivo separado do deslocamento antes da retomada.';
  }
  if (categorias.includes('falha_comunicacao')) {
    return 'O fato seguiu sem comunicação imediata à Central de Monitoramento.';
  }
  if (categorias.includes('atraso_origem')) {
    return 'O atraso na origem está no horário registrado. O motivo operacional continua sem causa confirmada.';
  }
  return null;
}

function causaDe(d: OsActionPlanInput, categorias: CategoriaOcorrencia[], atrasoConfirmado: boolean): { estado: AnaliseOcorrencia['causaEstado']; texto: string } {
  if (!categorias.length) {
    return {
      estado: 'indeterminada',
      texto: 'Não foi possível determinar a causa raiz com os dados disponíveis. Os registros consultados não identificaram ocorrência relevante.',
    };
  }
  if (atrasoConfirmado && categorias.includes('atraso_origem') && categorias.length === 1) {
    const minutos = d.atrasoMinutosOrigem;
    return {
      estado: 'confirmada',
      texto: `Causa confirmada do atraso: a chegada registrada na origem ocorreu depois do horário programado${minutos != null ? `, em ${minutos} minuto(s)` : ''}. O motivo operacional desse atraso permanece em apuração. Não foi possível determinar a causa raiz desse motivo com os dados disponíveis.`,
    };
  }
  const riscos = categorias.map(nomeCategoria).join('; ');
  return {
    estado: 'em_apuracao',
    texto: `A causa permanece em apuração. Foi identificado risco operacional relacionado a ${riscos}. Não foi possível determinar a causa raiz com os dados disponíveis.`,
  };
}

export function analisarOcorrencia(d: OsActionPlanInput): AnaliseOcorrencia {
  const foco = String(d.problemaPrincipal || '').trim();
  const focoN = semAcento(foco);
  const bruto = textoLivre(d);
  const n = semAcento(bruto);
  const itens: ItemAnalise[] = [];
  const categorias = new Set<CategoriaOcorrencia>();

  itens.push(item('fato_confirmado', `Status da missão: ${d.status || 'não informado'}.`, 'missions', d.missionId, null));
  itens.push(item('fato_confirmado', `Rota cadastrada: ${d.origem || 'não informada'} para ${d.destino || 'não informado'}.`, 'missions', d.missionId, null));
  if (d.placaCarga || d.placaViatura) {
    itens.push(item(
      'fato_confirmado',
      `Veículo escoltado ${d.placaCarga || 'não identificado'} e viatura ${d.placaViatura || 'não identificada'}, conforme o cadastro da OS.`,
      'missions',
      d.missionId,
      null,
    ));
  } else {
    itens.push(item('ausencia', 'Placa do veículo escoltado: não identificada nos registros consultados.', 'missions', d.missionId, null));
  }
  for (const ev of d.evidenciasApuracao || []) {
    const descricao = String(ev.descricao || '').trim();
    if (!ev.principal || !descricao) continue;
    const origem = ev.origem ? `, ${ev.origem}` : '';
    itens.push(item(
      'relato',
      `Evidência marcada como principal (${ev.tipo || 'anexo'}${origem}): ${descricao}. O anexo documenta o que foi informado e não comprova, sozinho, toda circunstância descrita.`,
      'evidencia_apuracao',
      `${d.missionId}:evidencia-principal`,
      ev.quando,
    ));
  }

  const consultaOcorrenciaIncompleta = d.consultaOcorrencias === 'ERRO' || d.consultaOcorrencias === 'CONSULTA INCOMPLETA';
  if (consultaOcorrenciaIncompleta) {
    itens.push(item('ausencia', 'Ocorrências formais: consulta incompleta. Não dá para afirmar que a lista está fechada.', 'mission_occurrences', d.missionId, null));
  } else if (d.ocorrencias.length) {
    itens.push(item('fato_confirmado', 'Existe ocorrência formal no cadastro desta OS.', 'mission_occurrences', d.missionId, d.ocorrencias[0]?.quando || null));
  } else {
    itens.push(item('fato_confirmado', 'Não existe ocorrência formal no cadastro desta OS.', 'mission_occurrences', d.missionId, null));
  }

  const atrasoConfirmado = !foco && d.atrasoMinutosOrigem != null && d.atrasoMinutosOrigem > 0;
  if (atrasoConfirmado || (foco && /(?<!sem\s)atraso/.test(focoN) && d.atrasoMinutosOrigem != null && d.atrasoMinutosOrigem > 0)) {
    categorias.add('atraso_origem');
    itens.push(item(
      'fato_confirmado',
      `Atraso na origem calculado entre o horário programado e o status Origem: ${d.atrasoMinutosOrigem} minuto(s).`,
      'mission_history',
      `${d.missionId}:atraso`,
      d.horarioProgramado,
    ));
  }
  if (/(?<!sem\s)atraso/.test(n) && !atrasoConfirmado) {
    categorias.add('atraso_origem');
    itens.push(item('relato', 'Há relato de atraso. Os horários da OS não confirmaram a diferença.', 'mission_occurrences', d.missionId, null));
  }
  if (/sem atraso|no horario|chegada no horario/.test(n) && atrasoConfirmado) {
    itens.push(item(
      'divergencia',
      'O texto operacional fala em ausência de atraso, mas o horário programado e o status Origem mostram atraso. Nenhuma versão foi escolhida como causa.',
      'mission_history',
      `${d.missionId}:divergencia-atraso`,
      null,
    ));
  }

  if (/perda de contato|perdeu o contato|perdeu o veiculo|contato visual|perda de acompanhamento|identificacao visual|perda momentanea|rompimento|saiu a frente|nao atende|tentando contato|alta velocidade|perdemos o veiculo|sumiu/.test(n)) {
    categorias.add('perda_contato');
    itens.push(item(
      'relato',
      foco
        ? 'Foi registrada perda de acompanhamento do veículo escoltado.'
        : 'Há relato de perda de acompanhamento ou de contato. Não há medição, neste documento, que confirme velocidade, ligação ou posição de GPS.',
      foco ? 'contexto_apuracao' : 'mission_history',
      `${d.missionId}:perda-contato`,
      null,
    ));
  }
  if (/veiculo incorreto|veiculo errado|placa diverg|placa incorreta|caminhao errado|nao era o veiculo|modelo diverg|acompanhamento de veiculo incorreto|escolta do veiculo errado|outro caminhao|veiculo semelhante|divergencia pela placa|divergencia de placa|perdeu a identificacao|acompanhou outro|caminhao diferente|nao era o caminhao|placa diferente/.test(n)) {
    categorias.add('veiculo_incorreto');
    itens.push(item('relato', 'Há divergência de veículo relatada. O relato não comprova a causa nem atribui culpa.', 'mission_occurrences', `${d.missionId}:veiculo`, null));
  }

  const carga = placaNorm(d.placaCarga);
  const viatura = placaNorm(d.placaViatura);
  const outras = placasCitadas(bruto).filter((p) => p && p !== carga && p !== viatura);
  if (outras.length && carga) {
    categorias.add('veiculo_incorreto');
    itens.push(item(
      'divergencia',
      'Uma placa citada no texto não coincide com a placa do veículo escoltado nem com a da viatura. A divergência fica em apuração.',
      'missions',
      `${d.missionId}:placa`,
      null,
    ));
  }

  if (/desvio de rota|fora da rota|fora de rota|itinerario diverg/.test(n)) {
    categorias.add('desvio_rota');
    itens.push(item('relato', 'Há relato de desvio de rota. Posição escrita na atualização não foi tratada como GPS.', 'mission_history', `${d.missionId}:rota`, null));
  }
  if (/falha de comunic|sem comunicacao com a central|nao comunicou|nao avisou a central|central nao foi/.test(n)) {
    categorias.add('falha_comunicacao');
    itens.push(item('relato', 'Há relato de falha ou ausência de comunicação com a Central. O contato não foi inventado.', 'mission_history', `${d.missionId}:comunicacao`, null));
  }
  if (/parada/.test(n) && !/\brf\b|descanso|repouso/.test(n) && (!foco || /parada/.test(focoN))) {
    categorias.add('parada');
    itens.push(item('relato', 'Há relato de parada no percurso. O motivo permanece em apuração.', 'mission_history', `${d.missionId}:parada`, null));
  } else if (/\brf\b|descanso|repouso/.test(n)) {
    itens.push(item('relato', 'Há relato de parada para descanso. O lançamento não foi convertido em ocorrência corretiva.', 'mission_history', `${d.missionId}:descanso`, null));
  }
  if (/checklist incompleto|sem checklist|falha de checklist|nao conferiu o checklist/.test(n)) {
    categorias.add('falha_checklist');
    itens.push(item('relato', 'Há relato de checklist ausente ou incompleto.', 'mission_occurrences', `${d.missionId}:checklist`, null));
  }
  if (/sistema fora|falha do sistema|falha de sistema|rastreador sem sinal|sem sinal do rastreador/.test(n)) {
    categorias.add('problema_sistema');
    itens.push(item('relato', 'Há relato de falha de sistema. Não foi atribuída posição de GPS que não esteja no cadastro.', 'system_logs', `${d.missionId}:sistema`, null));
  }
  if (/sem evidencia|sem foto|sem print|faltou a evidencia|falta de evidencia|ausencia de evidencia/.test(n)) {
    categorias.add('ausencia_evidencia');
    itens.push(item('ausencia', 'O texto registra ausência de evidência. Nenhuma imagem foi criada para preencher essa lacuna.', 'mission-evidence', d.missionId, null));
  }

  const precisaFoto = !foco && (categorias.has('perda_contato') || categorias.has('veiculo_incorreto') || d.ocorrencias.length > 0);
  const fotos = [...(d.fotos || []), ...(d.fotosTratativa || [])].filter((f) => f.url);
  if (precisaFoto && fotos.length === 0 && !consultaOcorrenciaIncompleta) {
    categorias.add('ausencia_evidencia');
    itens.push(item('ausencia', 'Não há evidência fotográfica localizada para o fato em apuração.', 'mission-evidence', d.missionId, null));
  }
  if (!d.kmInicial && !d.kmFinal) {
    itens.push(item('ausencia', 'Hodômetro: não identificado nos registros consultados.', 'missions', `${d.missionId}:km`, null));
  }
  if (!foco) {
    itens.push(item('ausencia', 'Telemetria de GPS: não identificada nos registros consultados. Posição escrita não foi convertida em coordenada.', 'missions', `${d.missionId}:gps`, null));
  }

  if (d.historicoEstado === 'ERRO' || d.historicoEstado === 'NÃO CARREGADO' || d.historicoEstado === 'CONSULTA INCOMPLETA') {
    itens.push(item('ausencia', 'Histórico da OS incompleto ou não carregado. A análise não trata a página lida como o conjunto total.', 'mission_history', d.missionId, null));
  }

  const ordenadas = ORDEM.filter((c) => categorias.has(c));
  const enxuto = Boolean(foco);
  const planos = montarPlanos(ordenadas, enxuto);
  const causa = causaDe(d, ordenadas, atrasoConfirmado);
  const riscos = ordenadas.length ? ordenadas.map(nomeCategoria).join('; ') : 'nenhum risco específico identificado nos registros';
  const corretivas = planos.acao.map((l) => l.id).join(', ');
  const preventivas = planos.melhoria.map((l) => l.id).join(', ');
  const identificacao = ordenadas.includes('perda_contato') || ordenadas.includes('veiculo_incorreto');
  const conclusao = identificacao
    ? (enxuto
      ? [
        `Durante a execução da OS ${d.missionId} foi registrada perda de acompanhamento do veículo escoltado durante parte do trajeto.`,
        'Como medida corretiva e preventiva, o Grupo TM SEG reforçará junto às equipes o procedimento de identificação positiva do veículo e o protocolo para situações de perda de contato visual.',
        'A partir deste procedimento, eventual perda de acompanhamento deverá ser imediatamente comunicada à Central, sendo necessária nova confirmação positiva do veículo antes da retomada da escolta.',
        'As medidas têm como objetivo ampliar a segurança operacional, a rastreabilidade e reduzir o risco de recorrência em operações futuras.',
      ].join('\n\n')
      : [
        `Após análise preliminar dos registros disponíveis da OS ${d.missionId}, o Grupo TM SEG identificou oportunidade de fortalecimento dos procedimentos de identificação positiva e de manutenção do contato com o veículo escoltado. ${causa.texto} A apuração segue pendente de confirmação.`,
        'Foram propostas medidas corretivas e preventivas para reduzir o risco de recorrência: conferência de placa e identificação do veículo, protocolo para perda de contato visual, comunicação imediata com a Central, reciclagem das equipes e auditoria das próximas operações.',
        'O objetivo é elevar a rastreabilidade da operação e criar barreiras de controle no processo e no sistema, para que uma perda de contato seja identificada, comunicada e corrigida antes da continuidade da missão. Nenhum responsável individual foi apontado. Esta versão é rascunho e não está aprovada para o cliente.',
        `Medidas corretivas: ${corretivas}. Medidas preventivas: ${preventivas}. Indicadores desta emissão: resultado atual Não medido.`,
      ].join('\n\n'))
    : [
      `Situação analisada: a OS ${d.missionId} foi lida pelos registros de status, ocorrências, atualizações e evidências disponíveis. O que não está nesses registros não foi completado por suposição.`,
      `Estágio da apuração: ${causa.texto} A apuração segue pendente de confirmação.`,
      `Risco ou processo identificado: ${riscos}.`,
      `Medidas corretivas propostas: ${corretivas}.`,
      `Medidas preventivas propostas: ${preventivas}.`,
      'Monitoramento: os indicadores desta emissão estão como Não medido. Nenhum percentual ou quantidade atual foi inventado.',
      'Compromisso: a TM SEG submete esta versão à revisão humana antes do envio ao cliente. A apuração segue pendente de confirmação.',
    ].join('\n\n');

  return {
    itens,
    categorias: ordenadas,
    causaEstado: causa.estado,
    causaTexto: causa.texto,
    procedimento: procedimentoDe(ordenadas, enxuto),
    acao: planos.acao,
    melhoria: planos.melhoria,
    indicadores: indicadoresDe(ordenadas, enxuto),
    conclusao,
    barreira: barreiraDe(ordenadas),
  };
}

export function textoContextoIa(d: OsActionPlanInput): string {
  const analise = analisarOcorrencia(d);
  const fatos = analise.itens.map((i) => `${i.tipo} | ${i.fonte} | ${i.registroId} | ${i.descricao}`);
  const corte = fatos.slice(0, 80);
  const aviso = fatos.length > 80
    ? `CONSULTA INCOMPLETA DO PROMPT: ${fatos.length} itens classificados; seguem os primeiros 80, em ordem de análise.`
    : 'Conjunto classificado enviado por inteiro ao texto.';
  return [
    `OS ${d.missionId}. Status ${d.status}. Origem ${d.origem}. Destino ${d.destino}.`,
    `Categorias: ${analise.categorias.join(', ') || 'nenhuma'}.`,
    `Causa: ${analise.causaTexto}`,
    aviso,
    ...corte,
  ].join('\n');
}
