export async function generateContent(options: {
  contents: any;
  config?: any;
  model?: string;
}): Promise<string> {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: options.contents,
      config: options.config,
      model: options.model || 'gemini-2.5-flash',
      stream: false
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Erro de conexão' }));
    throw new Error(err.error || 'Erro ao gerar conteúdo');
  }
  const data = await response.json();
  return data.text || '';
}

export async function generateContentStream(options: {
  contents: any;
  config?: any;
  model?: string;
  onChunk: (text: string) => void;
}): Promise<string> {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: options.contents,
      config: options.config,
      model: options.model || 'gemini-2.5-flash',
      stream: true
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Erro de conexão' }));
    throw new Error(err.error || 'Erro ao gerar conteúdo');
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.error) throw new Error(data.error);
            if (data.text) {
              fullText += data.text;
              options.onChunk(fullText);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('Unexpected')) throw e;
          }
        }
      }
    }
  }
  return fullText;
}

export class GeminiProxy {
  async generateContent(options: { model: string; contents: any; config?: any }) {
    const text = await generateContent({
      contents: options.contents,
      config: options.config,
      model: options.model
    });
    return { text };
  }
}

export const geminiProxy = new GeminiProxy();
