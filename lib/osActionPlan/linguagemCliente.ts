/** Texto do cliente: a operação é da TM SEG. Não transfere a falha ao parceiro e não confessa culpa jurídica. */
export function textoParaCliente(texto: string, fornecedor?: string | null, cliente?: string | null): string {
  let s = String(texto || '');
  const trocas: Array<[RegExp, string]> = [
    [/erro do fornecedor/gi, 'ocorrência operacional da equipe de escolta'],
    [/falha do terceirizado/gi, 'ocorrência operacional da equipe de escolta'],
    [/falha da empresa subcontratada/gi, 'ocorrência operacional da equipe de escolta'],
    [/responsabilidade da empresa parceira/gi, 'gestão da ocorrência pelo Grupo TM SEG'],
    [/o fornecedor perdeu o veículo/gi, 'a equipe de escolta perdeu momentaneamente o acompanhamento do veículo'],
    [/o fornecedor perdeu/gi, 'a equipe de escolta perdeu'],
    [/fornecedor confundiu/gi, 'houve confusão na identificação visual'],
    [/o parceiro cometeu o erro/gi, 'houve falha operacional na identificação'],
    [/terceirizado confundiu o caminhão/gi, 'houve confusão na identificação visual do veículo'],
    [/terceirizado confundiu/gi, 'houve confusão na identificação visual'],
    [/a tm seg foi culpada pelo ocorrido/gi, 'O Grupo TM SEG conduz a tratativa da ocorrência'],
    [/a tm seg assume integralmente a culpa/gi, 'O Grupo TM SEG conduz a gestão da ocorrência'],
    [/assume integralmente a culpa/gi, 'conduz a gestão da ocorrência'],
    [/foi negligente/gi, 'segue em apuração'],
  ];
  for (const [de, para] of trocas) s = s.replace(de, para);

  const nome = String(fornecedor || '').trim();
  const nomeCliente = String(cliente || '').trim();
  if (nome && nome !== '—' && nome.length > 3 && nome.toUpperCase() !== nomeCliente.toUpperCase()) {
    const re = new RegExp(nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    s = s.replace(re, 'a equipe de escolta');
  }

  s = s.replace(/\bterceirizados?\b/gi, 'equipe operacional');
  s = s.replace(/\bempresa parceira\b/gi, 'operação');
  s = s.replace(/\bempresa subcontratada\b/gi, 'operação');
  s = s.replace(/\bfornecedor(?:es)?\b/gi, 'equipe de escolta');
  s = s.replace(/a equipe de escolta errou/gi, 'houve falha operacional na identificação');
  return s;
}

function semAcento(texto: string): string {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Quatro trechos em prosa, como quem redige o documento.
 * O foco manda no assunto. O relato longo só esclarece; não é copiado.
 */
export function prosaHumana(foco: string, relato: string): { resumo: string; analise: string; causa: string; barreira: string; conclusao: string } {
  const nf = semAcento(foco);
  const nr = semAcento(relato);
  const perda = /perdeu o veiculo|perdemos o veiculo|perda de contato|perdeu o contato|contato visual|identificacao visual|perda de acompanhamento|perdeu de vista/.test(nf)
    || /perdeu o veiculo|identificacao visual|perda de acompanhamento/.test(nr);
  const pedagio = /pedagio/.test(nf) || (perda && /pedagio/.test(nr));
  const semelhante = /semelh|parecid|outro caminh|caminhao errad|veiculo errad|divergenc/.test(`${nf}\n${nr}`);
  const onde = pedagio ? 'na passagem pelo pedágio' : 'durante o deslocamento';

  if (pedagio || perda) {
    const resumo = semelhante
      ? `Na escolta, ${onde}, a equipe perdeu por um momento a identificação visual do veículo da OS. Havia um veículo de aparência parecida no local. A equipe conferiu a placa, voltou para o veículo cadastrado e retomou o acompanhamento.`
      : `Na escolta, ${onde}, a equipe perdeu o veículo de vista por um momento. Em seguida conferiu a placa, localizou o veículo cadastrado na OS e retomou a escolta.`;
    const analise = semelhante
      ? `${onde.charAt(0).toUpperCase()}${onde.slice(1)}, a equipe vinha com o veículo da OS e perdeu a identificação visual. Nesse intervalo surgiu a dúvida com um veículo de aparência parecida. A conferência da placa encerrou a dúvida, e a escolta voltou para o veículo que consta na OS.`
      : `${onde.charAt(0).toUpperCase()}${onde.slice(1)}, a equipe de escolta perdeu de vista o veículo que acompanhava. Os registros não separam um horário só desse instante. O desfecho está no que a equipe fez em seguida: localizou o veículo da OS, conferiu a placa e voltou a escoltá-lo.`;
    const barreira = pedagio
      ? 'No pedágio a identificação visual se perde com facilidade. O que faltou nesse instante foi confirmar a placa antes de continuar. Sem essa conferência, a equipe não tem certeza de que ainda está com o veículo da OS.'
      : 'Quando a equipe perde o veículo de vista, seguir sem uma nova conferência da placa deixa a escolta sem saber se ainda está com o veículo da OS.';
    const causa = semelhante
      ? 'O que pesou foi a perda da identificação visual diante de um veículo de aparência parecida. A placa é o que separou um do outro.'
      : pedagio
        ? 'O que pesou foi a perda da identificação visual na passagem pelo pedágio, antes da equipe conferir a placa.'
        : 'O que pesou foi a perda da identificação visual durante o deslocamento, antes da nova conferência da placa.';
    const conclusao = 'A escolta do veículo cadastrado foi restabelecida. Fica o combinado com a equipe: se perder o veículo de vista de novo, avisa a Central de Monitoramento e só continua depois de confirmar a placa.';
    return { resumo, analise, causa, barreira, conclusao };
  }

  if (/desvio de rota|fora da rota|fora de rota|itinerario diverg/.test(nf)) {
    return {
      resumo: 'A equipe informou um desvio em relação à rota cadastrada na OS. A Central confronta esse relato com o itinerário antes de tratar o trecho como retomado.',
      analise: 'O apontamento fala em saída da rota prevista. Este documento não reconstrói o caminho por coordenada. O que dá para registrar é o confronto entre a rota da OS e o que a equipe declarou, até a Central confirmar a retomada.',
      barreira: 'Faltou, no momento do desvio, confrontar a rota cadastrada com a posição que a equipe declarou.',
      causa: 'O fator em aberto é a diferença entre a rota cadastrada e o trecho que a equipe declarou.',
      conclusao: 'O desvio fica registrado nesta OS. A escolta segue na rota cadastrada assim que a Central confirma que o veículo voltou ao itinerário.',
    };
  }

  if (/parada/.test(nf) && !/\brf\b|descanso|repouso/.test(nf)) {
    return {
      resumo: 'Houve uma parada no percurso, além do deslocamento normal da escolta. O motivo permanece o que estiver escrito no registro da OS.',
      analise: 'A parada aparece no relato da operação. A causa não foi além do que está escrito. O que está documentado é a interrupção do deslocamento e, quando houver lançamento, a retomada.',
      barreira: 'A parada foi lançada sem separar, no mesmo momento, o motivo do simples fato de ter parado.',
      causa: 'A parada está no relato. O motivo dela continua o que a OS tiver escrito, sem uma causa extra.',
      conclusao: 'A parada fica no histórico da OS. A escolta retoma o deslocamento quando o registro mostra o reinício, sem transformar a parada em causa de outra falha.',
    };
  }

  if (/(?<!sem\s)atraso/.test(nf)) {
    return {
      resumo: 'O horário de chegada na origem ficou depois do que estava combinado. O motivo desse atraso continua o que a equipe registrar, sem uma causa fechada neste documento.',
      analise: 'O horário programado e o lançamento da origem mostram a diferença. Essa diferença está no cadastro. O porquê operacional não foi completado além do relato.',
      barreira: 'O atraso ficou visível no horário, mas o aviso à Central e o motivo ainda dependem do que foi escrito na OS.',
      causa: 'O horário de chegada passou do combinado. O motivo operacional dessa diferença não está fechado.',
      conclusao: 'A chegada fora do horário combinado fica registrada. A apuração do motivo segue com o relato da equipe, sem antecipar uma causa que o sistema não confirma.',
    };
  }

  const curto = String(foco || '').trim().replace(/\s+/g, ' ');
  const dito = curto.length > 0 && curto.length <= 180 && !curto.includes('|')
    ? textoParaCliente(curto).replace(/\.$/, '')
    : '';
  return {
    resumo: dito
      ? `O que motivou este relatório foi o seguinte: ${dito}. Os registros da OS foram conferidos, e o texto fica só no que está documentado.`
      : 'Este relatório reúne o que a operação registrou nesta OS. O que não está no sistema não foi completado.',
    analise: 'O apontamento e os registros da missão foram lidos juntos. Não há, neste material, uma sequência que permita descrever o fato com mais detalhe do que o diário da operação já mostra.',
    barreira: 'Não há uma barreira única para este apontamento. O controle segue o que a equipe já lança: posição, horário e evidência de cada atualização.',
    causa: 'Não há, nos registros lidos, um fator único que explique o apontamento além do que a equipe já lançou.',
    conclusao: 'A OS permanece com o status do cadastro. O acompanhamento continua pelos registros da operação, sem conclusão além do que esses registros sustentam.',
  };
}

/** Resumo curto para o cliente. O texto interno longo não é copiado e não vira confissão. */
export function resumoInstitucional(foco: string, relato: string): string {
  const n = `${foco}\n${relato}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pedagio = /pedagio/.test(n);
  const visual = /identific|visual|acompanh|contato/.test(n);
  const placa = /placa/.test(n);
  const semelhante = /semelh|parecid|outro caminh|caminhao errad|veiculo errad|divergenc/.test(n);
  const onde = pedagio ? 'na passagem pelo pedágio' : 'durante a operação';
  const primeiro = visual
    ? `Durante a operação, ${onde}, a equipe de escolta perdeu momentaneamente a identificação visual do veículo escoltado. O Grupo TM SEG retomou o acompanhamento do veículo cadastrado na OS${placa ? ', depois da conferência da placa' : ''}.`
    : 'O Grupo TM SEG registra o apontamento desta OS e conduz a tratativa. O material interno da apuração foi considerado e não é reproduzido neste documento.';
  const segundo = semelhante
    ? 'Houve dúvida de identificação diante de um veículo de aparência parecida. A escolta foi restabelecida sobre o veículo da OS. Este documento não atribui culpa e não cita pessoas.'
    : 'A sequência registrada na OS permanece como contexto operacional. Circunstância relatada não é, por si só, causa confirmada nem reconhecimento de falha.';
  return `${primeiro}\n\n${segundo}`;
}

export function narrativaAceitaParaCliente(texto: string, fornecedor?: string | null, cliente?: string | null): string {
  const limpo = textoParaCliente(texto, fornecedor, cliente)
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '')
    .replace(/\(\d{2}\)\s*\d{4,5}-?\d{4}/g, '')
    .trim();
  if (!limpo || limpo.length > 1100 || limpo.length < 40 || limpo.includes('|')) return '';
  if (/cnpj|uso restrito|km\/h|telemetria|relat[oó]rio de ocorr[eê]ncia operacional|outro caminh/i.test(limpo)) return '';
  const frases = limpo.split(/(?<=[.!?])\s+/).filter((frase) => !/cnpj|cpf|km\/h|uso restrito|telemetria|agente 0\d|relat[oó]rio de ocorr[eê]ncia operacional/i.test(frase));
  const saida = frases.join(' ').replace(/[ \t]+/g, ' ').trim();
  if (saida.length < 40) return '';
  return saida;
}
