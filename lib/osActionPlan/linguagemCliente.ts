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
