/**
 * Prepara o relatório para a prévia e para o PDF:
 * a foto entra no próprio HTML e o mapa vira imagem com o arruamento.
 * O mapa não espera a foto. Se a foto demorar, o relatório ainda sai com o link original.
 */
import { authFetch } from '../authFetch';
import { optimizeImageForAI } from '../imageForAI';
import { agruparPontos } from './diarioOperacional';
import type { OsActionPlanInput } from './types';

async function lerComoDataUrl(blob: Blob): Promise<string> {
  const otimo = await optimizeImageForAI(blob, { maxDim: 1400, quality: 0.82 });
  return `data:${otimo.mimeType};base64,${otimo.data}`;
}

async function pedirMapa(pontos: Array<{ lat: number; lng: number; rotulo: string }>, largura: number, altura: number): Promise<string | null> {
  try {
    const resposta = await authFetch('/api/mapa-estatico', {
      method: 'POST',
      body: JSON.stringify({ pontos, largura, altura }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resposta.ok) return null;
    return await lerComoDataUrl(await resposta.blob());
  } catch {
    return null;
  }
}

async function emSerie<T>(itens: T[], limite: number, tarefa: (item: T) => Promise<void>): Promise<void> {
  let indice = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (indice < itens.length) {
      const atual = itens[indice];
      indice += 1;
      await tarefa(atual);
    }
  });
  await Promise.all(trabalhadores);
}

async function embutirFotos(urls: string[]): Promise<{ fotoEmbutida: Record<string, string>; falhas: number }> {
  const remotas = [...new Set(urls.filter((url) => url && !url.startsWith('data:')))];
  if (!remotas.length) return { fotoEmbutida: {}, falhas: 0 };
  try {
    const resposta = await authFetch('/api/evidencia-imagem', {
      method: 'POST',
      body: JSON.stringify({ urls: remotas }),
      signal: AbortSignal.timeout(50000),
    });
    if (!resposta.ok) return { fotoEmbutida: {}, falhas: remotas.length };
    const corpo = await resposta.json() as { imagens?: Array<{ url?: string; dataUrl?: string | null }> };
    const fotoEmbutida: Record<string, string> = {};
    for (const item of corpo.imagens || []) {
      if (item.url && item.dataUrl) fotoEmbutida[item.url] = item.dataUrl;
    }
    return { fotoEmbutida, falhas: remotas.filter((url) => !fotoEmbutida[url]).length };
  } catch {
    return { fotoEmbutida: {}, falhas: remotas.length };
  }
}

export async function ilustrarRelatorio(entrada: OsActionPlanInput): Promise<{ entrada: OsActionPlanInput; avisos: string[] }> {
  const avisos: string[] = [];
  const atualizacoes = entrada.atualizacoes || [];
  const urls = atualizacoes.flatMap((item) => [...(item.fotos || []), ...(item.fotoUrl ? [item.fotoUrl] : [])]);
  const brutos = [
    ...(entrada.origemCoord ? [{ lat: entrada.origemCoord.lat, lng: entrada.origemCoord.lng, rotulo: 'A' }] : []),
    ...atualizacoes
      .filter((item) => item.lat != null && item.lng != null)
      .map((item) => ({ lat: item.lat as number, lng: item.lng as number, rotulo: String(item.numero || '') })),
    ...(entrada.destinoCoord ? [{ lat: entrada.destinoCoord.lat, lng: entrada.destinoCoord.lng, rotulo: 'B' }] : []),
  ];
  const fotosPromise = embutirFotos(urls);
  const mapaPromise = (async () => {
    const comMini = atualizacoes.map((item) => ({ ...item }));
    const cache = new Map<string, Promise<string | null>>();
    const pedirUmaVez = (lat: number, lng: number, rotulo: string) => {
      const chave = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (!cache.has(chave)) {
        cache.set(chave, pedirMapa([{ lat, lng, rotulo }], 480, 300));
      }
      return cache.get(chave) as Promise<string | null>;
    };
    const [mapaImagem] = await Promise.all([
      brutos.length ? pedirMapa(agruparPontos(brutos), 900, 480) : Promise.resolve(null),
      emSerie(comMini.filter((item) => item.lat != null && item.lng != null), 3, async (item) => {
        item.miniMapaImagem = await pedirUmaVez(item.lat as number, item.lng as number, String(item.numero || '')) || null;
      }),
    ]);
    return { mapaImagem, atualizacoes: comMini };
  })();
  const [fotos, mapa] = await Promise.all([fotosPromise, mapaPromise]);
  if (brutos.length && !mapa.mapaImagem) {
    avisos.push('O mapa com as ruas não foi gerado. O relatório ficou só com os pontos.');
  }
  if (fotos.falhas > 0) {
    avisos.push(fotos.fotoEmbutida && Object.keys(fotos.fotoEmbutida).length
      ? 'Parte das fotos não entrou no documento. O link Abrir foto continua no arquivo original.'
      : 'As fotos não entraram no documento. O link Abrir foto continua no arquivo original.');
  }
  return {
    entrada: {
      ...entrada,
      atualizacoes: mapa.atualizacoes,
      mapaImagem: mapa.mapaImagem,
      fotoEmbutida: Object.keys(fotos.fotoEmbutida).length ? fotos.fotoEmbutida : null,
    },
    avisos,
  };
}
