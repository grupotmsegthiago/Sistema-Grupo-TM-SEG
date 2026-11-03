// O print vira o mesmo texto que a leitura da mensagem já entende.
// A fila continua em lerSolicitacao. Aqui não há origem, destino nem horário inventados.

export function textoEstruturado(entrada: {
  origem?: string | null;
  destino?: string | null;
  imediata?: boolean | null;
  data?: string | null;
  hora?: string | null;
}): string {
  const linhas = [
    entrada.origem ? `Origem: ${entrada.origem}` : '',
    entrada.destino ? `Destino: ${entrada.destino}` : '',
    entrada.data ? `Data: ${entrada.data}` : '',
    entrada.hora ? `Horário: ${entrada.hora}` : '',
    entrada.imediata === true ? 'Imediata' : entrada.imediata === false ? 'Agendada' : '',
  ].filter(Boolean);
  return linhas.join('\n');
}

export function interpretarRespostaPrint(bruto: string): string {
  const match = String(bruto || '').match(/\{[\s\S]*\}/);
  if (!match) return '';
  try {
    const json = JSON.parse(match[0]) as { origem?: unknown; destino?: unknown; imediata?: unknown; data?: unknown; hora?: unknown };
    const imediata = json.imediata === true ? true : json.imediata === false ? false : null;
    return textoEstruturado({
      origem: String(json.origem || '').trim(),
      destino: String(json.destino || '').trim(),
      imediata,
      data: json.data ? String(json.data).trim() : null,
      hora: json.hora ? String(json.hora).trim() : null,
    });
  } catch {
    return '';
  }
}

export async function lerPrintSolicitacao(base64: string, mime: string): Promise<string> {
  const { generateContent } = await import('../gemini');
  const texto = await generateContent({
    contents: {
      parts: [
        {
          text: [
            'Leia o print de uma solicitação de escolta.',
            'Responda só com JSON: {"origem":"","destino":"","imediata":null,"data":null,"hora":null}.',
            'origem e destino com cidade e UF quando aparecerem.',
            'imediata true se for para agora, false se tiver data ou horário marcado, null se o print não disser.',
            'data no formato DD/MM/AAAA e hora HH:MM, ou null.',
            'Não invente cidade, UF, data nem hora que não estejam no print.',
          ].join(' '),
        },
        { inlineData: { mimeType: mime, data: base64 } },
      ],
    },
    config: { temperature: 0, maxOutputTokens: 800 },
  });
  return interpretarRespostaPrint(texto);
}
