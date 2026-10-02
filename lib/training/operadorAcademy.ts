/**
 * Academia do Operador.
 * A prova libera o sistema com mais de 15 acertos (16 ou mais).
 * A trilha Avançado fica no menu Treinamento e não trava o Operador.
 */

export const NOTA_MINIMA_EXCLUSIVA = 15;

export type TrainingUser = {
  role?: string | null;
  trainingRequired?: boolean | null;
  trainingPassedAt?: string | null;
};

export type LessonSlide = {
  titulo: string;
  texto: string;
  itens?: string[];
};

export type TrainingModule = {
  id: string;
  trilha: 'operador' | 'avancado';
  titulo: string;
  slides: LessonSlide[];
};

export type QuizQuestion = {
  id: string;
  pergunta: string;
  opcoes: string[];
  correta: number;
};

export function normalizarPerfil(role: string | null | undefined): string {
  return String(role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isPerfilOperador(role: string | null | undefined): boolean {
  return normalizarPerfil(role) === 'operador';
}

/** Só o Operador novo, ainda sem aprovação, fica na academia. */
export function operadorBloqueado(user: TrainingUser | null | undefined): boolean {
  if (!user || !isPerfilOperador(user.role)) return false;
  if (!user.trainingRequired) return false;
  if (user.trainingPassedAt) return false;
  return true;
}

export function normalizarModulos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export const MODULOS_OPERADOR = [
  'entrar',
  'menu',
  'painel-os',
  'abrir-os',
  'controle-diario',
  'rede-mapa',
] as const;

export function modulosObrigatoriosConcluidos(concluidos: string[]): boolean {
  return MODULOS_OPERADOR.every((id) => concluidos.includes(id));
}

export const MODULOS: TrainingModule[] = [
  {
    id: 'entrar',
    trilha: 'operador',
    titulo: 'Entrar no sistema',
    slides: [
      {
        titulo: 'Tela Acesso ao Sistema',
        texto: 'Abra o sistema do Grupo TM SEG. A tela pede Identificação Corporativa e Senha de Acesso. Use o e-mail da empresa, não um apelido.',
        itens: ['Identificação Corporativa', 'Senha de Acesso'],
      },
      {
        titulo: 'Senha',
        texto: 'Digite a senha que o administrador passou. O ícone do olho, à direita do campo, mostra ou esconde o que você digitou. Confira antes de entrar.',
      },
      {
        titulo: 'Quando não entra',
        texto: 'E-mail errado, senha errada ou conta inativa. Se a conta estiver inativa, só a administração libera. Não tente várias senhas diferentes sem avisar o responsável.',
      },
      {
        titulo: 'Primeiro acesso',
        texto: 'No primeiro login o sistema pede para trocar a senha. Troque, guarde, e só então começam as aulas. Sem terminar as aulas e a prova, o Operador novo ainda não vê o painel.',
      },
    ],
  },
  {
    id: 'menu',
    trilha: 'operador',
    titulo: 'O menu do Operador',
    slides: [
      {
        titulo: 'O que aparece',
        texto: 'O menu da esquerda é curto de propósito. Página Inicial, Monitoramento, Rede de Apoio e Fornecedor.',
        itens: ['Página Inicial', 'Monitoramento', 'Rede de Apoio (QRF)', 'Fornecedor'],
      },
      {
        titulo: 'Monitoramento',
        texto: 'Dentro de Monitoramento o Operador usa Painel de OS e Controle Diário. É ali que a missão nasce e o dia é acompanhado.',
        itens: ['Painel de OS', 'Controle Diário'],
      },
      {
        titulo: 'Fornecedor',
        texto: 'No grupo Fornecedor o Operador só abre o Mapa de Acionamento. Cadastro de viatura, agente e alvará não aparecem.',
      },
      {
        titulo: 'O que não abre',
        texto: 'Cliente, tabela de preço, financeiro e configurações não são deste perfil. Se faltar cadastro para abrir a OS, chame o Avançado.',
      },
    ],
  },
  {
    id: 'painel-os',
    trilha: 'operador',
    titulo: 'Painel de OS',
    slides: [
      {
        titulo: 'Para que serve',
        texto: 'O Painel de OS é a lista das missões. Cada cartão no topo é um status. Clicar no cartão filtra a lista naquele status.',
      },
      {
        titulo: 'Antes de sair',
        texto: 'Pendente é o que ainda falta informação. Solicitada é o pedido registrado. Documentação é a fase de documento. Agendada já tem horário marcado e ainda não está na origem.',
        itens: ['Pendente', 'Solicitada', 'Documentação', 'Agendada'],
      },
      {
        titulo: 'Na rua e no fim',
        texto: 'Origem é a chegada no ponto de coleta. Em Viagem é a escolta na estrada. Concluída encerrou. Cancelada foi desmarcada. Recusada não foi aceita.',
        itens: ['Origem', 'Em Viagem', 'Concluída', 'Cancelada', 'Recusada'],
      },
      {
        titulo: 'Nova Missão',
        texto: 'O botão laranja Nova Missão abre o formulário da OS. Operador e Avançado usam esse mesmo botão. Sem esse clique, a ordem não começa.',
      },
    ],
  },
  {
    id: 'abrir-os',
    trilha: 'operador',
    titulo: 'Abrir uma OS',
    slides: [
      {
        titulo: 'Seis etapas',
        texto: 'A Nova Missão anda em seis etapas. A de baixo só faz sentido depois da de cima. O botão final fica apagado até o agendamento estar completo.',
      },
      {
        titulo: '1. Tipo de operação',
        texto: 'Caracterizada é a escolta identificada. Velada é a escolta discreta. A lista de fornecedores muda conforme essa escolha.',
        itens: ['Caracterizada', 'Velada'],
      },
      {
        titulo: '2. Cliente',
        texto: 'Selecione o cliente que já está cadastrado e preencha o número da S.E., a Solicitação de Escolta. Cliente novo não se cria nesta tela. Quem cadastra é o Avançado.',
      },
      {
        titulo: '3. Carga e motorista',
        texto: 'Busque a placa do caminhão do cliente e informe nome e telefone do motorista. Se houver dois caminhões, use Adicionar 2° veículo. Esta placa é a carga. Não é a viatura da escolta.',
      },
      {
        titulo: '4. Fornecedor',
        texto: 'Escolha o parceiro da escolta. Se ainda não souber quem vai, use Aguardando informação e pule a etapa. Dá para completar depois.',
      },
      {
        titulo: '5. Rota',
        texto: 'Endereço de origem, o ponto A, e endereço de destino, o ponto B. Os dois são obrigatórios. É essa rota que o Controle Diário vai mostrar.',
      },
      {
        titulo: '6. Gerar a ordem',
        texto: 'Coloque data e hora de início. Se o cliente mandou o print do pedido, cole na evidência. O botão laranja Gerar Ordem de Serviço é o que faz a OS existir no painel.',
        itens: ['Gerar Ordem de Serviço'],
      },
    ],
  },
  {
    id: 'controle-diario',
    trilha: 'operador',
    titulo: 'Controle Diário',
    slides: [
      {
        titulo: 'Para que serve',
        texto: 'O Controle Diário organiza o dia. Os dados saem da OS. A tela não inventa outro cadastro: ela mostra o que está na rua e o que já encerrou.',
      },
      {
        titulo: 'Identificação',
        texto: 'OS é o número da missão. STATUS é a fase, a mesma do painel. DATA INICIAL e HORA AGENDADA são o combinado. HORA ORIGEM é quando chegou na origem.',
        itens: ['OS', 'STATUS', 'DATA INICIAL', 'HORA AGENDADA', 'HORA ORIGEM'],
      },
      {
        titulo: 'Quem e para onde',
        texto: 'CLIENTE, ROTA e FORNECEDOR dizem de quem é a carga, o trajeto e quem faz a escolta.',
        itens: ['CLIENTE', 'ROTA', 'FORNECEDOR'],
      },
      {
        titulo: 'Viatura e carga',
        texto: 'VIATURA é o carro da escolta. VEICULO ESCOLTADO é o caminhão do cliente. Não troque uma coluna pela outra.',
        itens: ['VIATURA', 'VEICULO ESCOLTADO'],
      },
      {
        titulo: 'Fim e quilometragem',
        texto: 'DATA FINAL e HORA FINAL fecham a missão. INICIAL, FINAL e TOTAL KM são a quilometragem. EQUIPE é quem foi. OBSERVAÇÃO é o recado do dia.',
        itens: ['DATA FINAL', 'HORA FINAL', 'INICIAL', 'FINAL', 'TOTAL KM', 'EQUIPE', 'OBSERVAÇÃO'],
      },
    ],
  },
  {
    id: 'rede-mapa',
    trilha: 'operador',
    titulo: 'Rede de Apoio e mapa',
    slides: [
      {
        titulo: 'Rede de Apoio (QRF)',
        texto: 'A Rede de Apoio mostra onde há apoio no mapa. Use quando a missão precisar de um ponto de suporte, não para cadastrar fornecedor.',
      },
      {
        titulo: 'Mapa de Acionamento',
        texto: 'Fica em Fornecedor, no item Mapa de Acionamento. Serve para ver quem pode ser chamado na região. O Operador consulta. Quem cadastra o parceiro é o Avançado.',
      },
      {
        titulo: 'Ordem do dia',
        texto: 'Abriu a OS no Painel, acompanhe no Controle Diário, consulte a Rede de Apoio e o Mapa de Acionamento quando precisar de gente na rua.',
      },
    ],
  },
  {
    id: 'cliente',
    trilha: 'avancado',
    titulo: 'Cadastrar cliente',
    slides: [
      {
        titulo: 'Quem faz',
        texto: 'Esta aula é da trilha Avançado. O Operador não abre esta tela. O caminho é Cliente, Cadastro de Cliente, botão Novo Cliente.',
        itens: ['Novo Cliente'],
      },
      {
        titulo: 'Dados',
        texto: 'Preencha CPF ou CNPJ. A lupa consulta a Receita. Informe a razão social e marque Cliente efetivo ou Prospecção / lead. Salve os dados cadastrais.',
      },
      {
        titulo: 'O que não abre',
        texto: 'Contrato, tabela de preço e cotação não abrem para o Avançado. Preço fica com Diretoria, Administrador ou Comercial.',
      },
    ],
  },
  {
    id: 'veiculo-carga',
    trilha: 'avancado',
    titulo: 'Veículo do cliente',
    slides: [
      {
        titulo: 'Onde cadastrar',
        texto: 'Menu Cliente, Veículos (Carga), botão Novo Veículo. A placa cadastrada aqui é a que aparece na etapa 3 da OS.',
        itens: ['Novo Veículo'],
      },
      {
        titulo: 'Rota que se repete',
        texto: 'Cadastro de Rotas, botão Nova Rota, guarda origem e destino usados de novo. Sem a placa, a etapa da carga fica vazia.',
        itens: ['Nova Rota'],
      },
    ],
  },
  {
    id: 'viatura',
    trilha: 'avancado',
    titulo: 'Viatura do fornecedor',
    slides: [
      {
        titulo: 'Não é a carga',
        texto: 'A VTR é o carro da escolta. Menu Fornecedor, Cadastro de Viaturas, botão Cadastrar Viatura. Placa, marca, modelo e o fornecedor dono.',
        itens: ['Cadastrar Viatura'],
      },
      {
        titulo: 'Rastreador',
        texto: 'Se a viatura não for da TM SEG nem da Ativa, o rastreador é obrigatório. O caminhão do cliente continua em Veículos de Carga.',
      },
    ],
  },
  {
    id: 'tabela-preco',
    trilha: 'avancado',
    titulo: 'Tabela de preço',
    slides: [
      {
        titulo: 'Quem abre',
        texto: 'Operador e Avançado não editam preço. A aba Tabela de Preços, dentro do cliente, abre para Diretoria, Administrador ou Comercial.',
        itens: ['Franquia', 'Km extra', 'Hora extra'],
      },
      {
        titulo: 'Se a OS estiver sem preço',
        texto: 'Não recalcule por fora. O aviso sobe para quem tem acesso à tabela. O Operador segue a missão. O preço não é campo desta prova para preencher.',
      },
    ],
  },
];

export const QUESTOES: QuizQuestion[] = [
  {
    id: 'q1',
    pergunta: 'O que o Operador informa para entrar?',
    opcoes: ['Só o primeiro nome', 'E-mail corporativo e senha', 'Número da OS', 'Placa da viatura'],
    correta: 1,
  },
  {
    id: 'q2',
    pergunta: 'Onde fica o botão que abre uma OS nova?',
    opcoes: ['Controle Diário', 'Painel de OS, botão Nova Missão', 'Rede de Apoio', 'Cadastro de Viaturas'],
    correta: 1,
  },
  {
    id: 'q3',
    pergunta: 'Quantas etapas tem a Nova Missão?',
    opcoes: ['3', '4', '6', '9'],
    correta: 2,
  },
  {
    id: 'q4',
    pergunta: 'Qual é a primeira etapa?',
    opcoes: ['Tipo: caracterizada ou velada', 'Quilometragem final', 'Tabela de preço', 'Alvará'],
    correta: 0,
  },
  {
    id: 'q5',
    pergunta: 'O que se preenche na etapa do cliente?',
    opcoes: ['Só a placa da VTR', 'Cliente já cadastrado e o número da S.E.', 'Franquia e hora extra', 'Rastreador'],
    correta: 1,
  },
  {
    id: 'q6',
    pergunta: 'A placa da etapa 3 é de quem?',
    opcoes: ['Da viatura de escolta', 'Do caminhão do cliente, com o motorista', 'Do alvará', 'Do banco'],
    correta: 1,
  },
  {
    id: 'q7',
    pergunta: 'Se o fornecedor ainda não foi definido, o que fazer?',
    opcoes: ['Cancelar a OS', 'Usar Aguardando informação e completar depois', 'Inventar um parceiro', 'Abrir a tabela de preço'],
    correta: 1,
  },
  {
    id: 'q8',
    pergunta: 'O que a etapa da rota pede?',
    opcoes: ['Origem e destino', 'Só o KM final', 'Senha do cliente', 'Nota fiscal'],
    correta: 0,
  },
  {
    id: 'q9',
    pergunta: 'Qual botão faz a OS passar a existir no painel?',
    opcoes: ['Cancelar', 'Nova Rota', 'Gerar Ordem de Serviço', 'Cadastrar Viatura'],
    correta: 2,
  },
  {
    id: 'q10',
    pergunta: 'Qual status indica a escolta na estrada?',
    opcoes: ['Agendada', 'Em Viagem', 'Recusada', 'Pendente'],
    correta: 1,
  },
  {
    id: 'q11',
    pergunta: 'Qual status já tem horário e ainda não está na origem?',
    opcoes: ['Concluída', 'Agendada', 'Cancelada', 'Em Viagem'],
    correta: 1,
  },
  {
    id: 'q12',
    pergunta: 'No Controle Diário, VEICULO ESCOLTADO é:',
    opcoes: ['O carro da escolta', 'O caminhão do cliente', 'O nome do operador', 'A franquia'],
    correta: 1,
  },
  {
    id: 'q13',
    pergunta: 'No Controle Diário, VIATURA é:',
    opcoes: ['O carro da escolta', 'A razão social', 'A hora extra', 'O destino'],
    correta: 0,
  },
  {
    id: 'q14',
    pergunta: 'HORA AGENDADA e HORA ORIGEM diferem assim:',
    opcoes: [
      'São sempre o mesmo horário',
      'Agendada é o combinado; origem é a chegada no ponto A',
      'Origem é o preço',
      'Agendada é o KM final',
    ],
    correta: 1,
  },
  {
    id: 'q15',
    pergunta: 'Onde ficam INICIAL, FINAL e TOTAL KM?',
    opcoes: ['Na tela de login', 'No Controle Diário', 'Na tabela de preço', 'No alvará'],
    correta: 1,
  },
  {
    id: 'q16',
    pergunta: 'O Operador cadastra cliente e viatura?',
    opcoes: ['Sim, os dois', 'Não. Isso é do Avançado', 'Só a tabela de preço', 'Só o financeiro'],
    correta: 1,
  },
  {
    id: 'q17',
    pergunta: 'Quem abre a aba Tabela de Preços?',
    opcoes: ['Qualquer Operador', 'Diretoria, Administrador ou Comercial', 'O motorista', 'O mapa de acionamento'],
    correta: 1,
  },
  {
    id: 'q18',
    pergunta: 'Para que serve a Rede de Apoio (QRF)?',
    opcoes: ['Emitir nota fiscal', 'Ver apoio no mapa', 'Trocar a senha', 'Cadastrar CNPJ'],
    correta: 1,
  },
  {
    id: 'q19',
    pergunta: 'Onde o Operador abre o Mapa de Acionamento?',
    opcoes: ['Em Fornecedor', 'Em Configurações', 'Na prova de RH', 'No boleto'],
    correta: 0,
  },
  {
    id: 'q20',
    pergunta: 'O botão Novo Veículo cadastra o quê?',
    opcoes: ['A viatura da escolta', 'A placa da carga do cliente', 'O usuário do financeiro', 'A senha do Operador'],
    correta: 1,
  },
];

export function corrigirProva(respostas: Array<number | null | undefined>): {
  acertos: number;
  total: number;
  passou: boolean;
} {
  let acertos = 0;
  QUESTOES.forEach((questao, index) => {
    if (respostas[index] === questao.correta) acertos += 1;
  });
  return {
    acertos,
    total: QUESTOES.length,
    passou: acertos > NOTA_MINIMA_EXCLUSIVA,
  };
}

export function moduloPorId(id: string): TrainingModule | undefined {
  return MODULOS.find((modulo) => modulo.id === id);
}
