import { generateContent } from '../gemini';
import type { AIImagePayload } from '../imageForAI';

export interface SecoesPlanoIa {
  objetivo: string | null;
  descricao: string | null;
  planoAcao: string | null;
  planoMelhoria: string | null;
  conclusao: string | null;
  tratativa: string | null;
}

export function montarPromptContexto(resumoFatos: string, textoUsuario: string): string {
  return [
    'Você é redator sênior de relatórios operacionais da TM SEG.',
    'Escreva em português do Brasil, com acentuação, crase e concordância corretas.',
    'Use somente os fatos da OS e o que estiver visível nas imagens, inclusive prints de WhatsApp.',
    'Não invente causa, atraso, troca de viatura, valor, nome ou horário que não apareça.',
    'A execução é da TM SEG. Não descreva a operação como terceirizada e não cite KM de fornecedor.',
    'Cada tópico precisa conversar com o que aconteceu nesta OS. Se não houver ocorrência, não invente um problema.',
    'Não liste placa, hodômetro, equipe, rota e horário em tópicos. Isso já está na ficha.',
    'Se uma imagem não estiver legível, diga apenas o que não foi possível ler.',
    '',
    'Responda exatamente neste formato:',
    '',
    'OBJETIVO:',
    '(um parágrafo: para que serve este relatório nesta OS)',
    '',
    'DESCRICAO:',
    '(dois ou três parágrafos: o que aconteceu, só o relato)',
    '',
    'PLANO_ACAO:',
    'Uma linha por medida, neste formato, sem outro texto:',
    'Ação | Responsável | Prazo | Status | Evidência/indicador',
    'Status somente: Proposta, Em andamento ou Concluída.',
    'Concluída só se a OS já registrar a resolução. Não apresente proposta como execução.',
    'Responsável ou prazo desconhecido: A definir após validação.',
    'Evidência desconhecida: Pendente de confirmação.',
    'Se a atualização da missão descreve ponto a apurar, não escreva que não houve ocorrência.',
    'Se ocorrência e atualização divergirem, sinalize a divergência e não escolha um lado.',
    'Não gere uma linha para cada atualização. Ignore rotina: sem novidades, equipe na origem, status concluída.',
    'Não copie texto bruto, relato longo nem relatório anterior para dentro da ação. Cada ação tem no máximo 160 caracteres.',
    '',
    'PLANO_MELHORIA:',
    'Medidas preventivas, uma linha no mesmo formato. Status sempre Proposta.',
    'Ação | Responsável | Prazo | Status | Evidência/indicador',
    '',
    'CONCLUSAO:',
    '(um parágrafo que fecha o entendimento desta OS)',
    '',
    'TRATATIVA:',
    '(um ou dois parágrafos: empresa séria, central 24 horas, transparente, acalma o cliente e deixa claro que está acompanhando. Sem promessa de prazo ou valor.)',
    '',
    'FATOS DA OS:',
    resumoFatos || '(sem fatos adicionais)',
    '',
    'TEXTO INFORMADO:',
    textoUsuario.trim() || '(nenhum texto além dos fatos e das imagens)',
  ].join('\n');
}

function chaveSecao(nome: string): string {
  return nome.toUpperCase().replace('Ç', 'C').replace('Ã', 'A').replace('Í', 'I');
}

export function separarRespostaIa(bruto: string): SecoesPlanoIa {
  const texto = String(bruto || '').trim();
  const pedacos = texto.split(/^(OBJETIVO|DESCRI[CÇ][AÃ]O|PLANO_ACAO|PLANO_MELHORIA|CONCLUS[AÃ]O|TRATATIVA):\s*/im);
  const mapa: Record<string, string> = {};
  for (let i = 1; i < pedacos.length; i += 2) {
    mapa[chaveSecao(pedacos[i])] = (pedacos[i + 1] || '').trim();
  }
  const temMarca = Object.keys(mapa).length > 0;
  return {
    objetivo: mapa.OBJETIVO || null,
    descricao: mapa.DESCRICAO || (temMarca ? null : texto),
    planoAcao: mapa.PLANOACAO || mapa.PLANO_ACAO || null,
    planoMelhoria: mapa.PLANOMELHORIA || mapa.PLANO_MELHORIA || null,
    conclusao: mapa.CONCLUSAO || null,
    tratativa: mapa.TRATATIVA || null,
  };
}

export async function redigirContextoOs(input: {
  resumoFatos: string;
  textoUsuario: string;
  imagens: AIImagePayload[];
}): Promise<string> {
  const parts = [
    ...input.imagens.slice(0, 6).map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
    { text: montarPromptContexto(input.resumoFatos, input.textoUsuario) },
  ];
  const texto = await generateContent({
    contents: { parts },
    model: 'gemini-2.5-flash',
    config: { maxOutputTokens: 3072, temperature: 0.2 },
  });
  return String(texto || '').trim();
}
