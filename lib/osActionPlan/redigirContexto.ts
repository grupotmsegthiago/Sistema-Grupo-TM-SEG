import { generateContent } from '../gemini';
import type { AIImagePayload } from '../imageForAI';
import { narrativaAceitaParaCliente } from './linguagemCliente';
import type { OsActionPlanInput } from './types';

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
    'Escreva o plano somente em cima do OBJETIVO e da DESCRICAO acima.',
    'Não transforme KM, hodômetro, status, chegada, saída, foto ou atualização já lançada no sistema em ação.',
    'Cada linha é uma medida futura para o problema classificado, com prazo sugerido. Não copie o que o sistema já lançou.',
    'Não promova hipótese a fato. Não escreva que o agente errou, que o motorista causou a ocorrência ou que a central falhou.',
    'Uma linha por medida, neste formato, sem outro texto:',
    'Ação | Responsável | Prazo | Status | Evidência/indicador',
    'Status somente: Proposta ou Em andamento. Não use Concluída.',
    'Responsável ou prazo desconhecido: A definir após validação.',
    'Evidência desconhecida: Pendente de confirmação.',
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

export function montarPromptAnalise(foco: string, diario: string, relato: string): string {
  return [
    'Você redige a seção Análise da ocorrência de um relatório da TM SEG para o cliente.',
    'O relato complementar pode ser um texto interno longo. Entenda o que aconteceu e escreva só o resumo. Não copie o texto.',
    'Escreva em português do Brasil, em dois parágrafos corridos, separados por uma linha em branco. No máximo 900 caracteres.',
    'O primeiro parágrafo diz o que a apuração trata, em linguagem institucional.',
    'O segundo diz como a operação foi restabelecida, sem nomear culpado e sem transferir a falha a fornecedor ou terceirizado.',
    'Não cite nome de pessoa, CPF, telefone, CNPJ, velocidade em km/h, telemetria nem a expressão uso restrito.',
    'Não escreva que a equipe seguiu o veículo errado, que alguém errou ou que a empresa é culpada.',
    'Se houve perda de identificação no pedágio, diga que a identificação visual foi perdida momentaneamente e que o acompanhamento do veículo da OS foi retomado após a conferência da placa.',
    'Não invente placa, horário, telemetria, velocidade medida, ligação ou trajeto ausente do material.',
    'Não escreva Trajeto realizado. Não liste atualização sem posição.',
    'Não use o slogan de identificação positiva.',
    'Parada para descanso ou RF não é o problema quando o foco é perda de identificação.',
    'Velocidade apenas relatada, sem medição, não é a causa.',
    'Não copie o histórico inteiro. Não use tópicos nem títulos. Responda só os parágrafos.',
    '',
    'FOCO INFORMADO:',
    foco,
    '',
    'RELATO COMPLEMENTAR:',
    relato || '(nenhum)',
    '',
    'REGISTROS DA OPERAÇÃO:',
    diario || '(sem atualizações)',
  ].join('\n');
}

export function diarioParaAnalise(entrada: OsActionPlanInput): string {
  return (entrada.atualizacoes || []).map((item) => {
    const status = String(item.status || item.texto || '').split('|')[0].replace(/\s+/g, ' ').trim();
    const curto = status.length > 80 ? 'Atualização operacional' : status;
    const local = item.local ? ` | ${item.local}` : '';
    return `${item.numero || ''} | ${item.quando} | ${curto}${local}`;
  }).join('\n');
}

export async function redigirAnaliseOcorrencia(entrada: OsActionPlanInput): Promise<string> {
  const texto = await generateContent({
    contents: montarPromptAnalise(
      String(entrada.problemaPrincipal || '').trim(),
      diarioParaAnalise(entrada),
      String(entrada.relatoComplementar || '').trim(),
    ),
    model: 'gemini-2.5-flash',
    config: { maxOutputTokens: 1200, temperature: 0.2 },
  });
  return narrativaAceitaParaCliente(String(texto || '').trim(), entrada.fornecedor, entrada.clientName);
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
