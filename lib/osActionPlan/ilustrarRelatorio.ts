/**
 * Prepara o relatório para a prévia e para o PDF:
 * a foto entra no próprio HTML e o mapa vira imagem com o arruamento.
 * Mapa geral e miniaturas saem num único pedido, para não prender o servidor.
 * O relatório só fica pronto quando o mapa e as fotos existentes entraram.
 */
import { authFetch } from '../authFetch';
import { agruparPontos } from './diarioOperacional';
import { desenharMapaNoNavegador, embutirFotosNoNavegador } from './mapaNoNavegador';
import type { OsActionPlanInput } from './types';

async function pedirPacoteMapas(
  pedidos: Array<{ id: string; pontos: Array<{ lat: number; lng: number; rotulo: string }>; largura: number; altura: number }>,
): Promise<Record<string, string>> {
  if (!pedidos.length) return {};
  try {
    const resposta = await authFetch('/api/mapa-estatico', {
      method: 'POST',
      body: JSON.stringify({ mapas: pedidos }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) return {};
    const corpo = await resposta.json() as { imagens?: Array<{ id?: string; base64?: string }> };
    const saida: Record<string, string> = {};
    for (const item of corpo.imagens || []) {
      if (item.id && item.base64) saida[item.id] = `data:image/png;base64,${item.base64}`;
    }
    return saida;
  } catch {
    return {};
  }
}

async function embutirFotos(urls: string[]): Promise<{ fotoEmbutida: Record<string, string>; falhas: number }> {
  const remotas = [...new Set(urls.filter((url) => url && !url.startsWith('data:')))];
  if (!remotas.length) return { fotoEmbutida: {}, falhas: 0 };
  try {
    const resposta = await authFetch('/api/evidencia-imagem', {
      method: 'POST',
      body: JSON.stringify({ urls: remotas }),
      signal: AbortSignal.timeout(8000),
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

function faltaImagem(avisos: string[]): boolean {
  return avisos.some((aviso) => /mapa com as ruas não foi gerado|fotos não entraram|Parte das fotos/i.test(aviso));
}

async function ilustrarUmaVez(
  entrada: OsActionPlanInput,
  aoAvancar?: (evento: { tipo: 'foto' | 'mapa'; feitos: number; total: number }) => void,
): Promise<{ entrada: OsActionPlanInput; avisos: string[] }> {
  const avisos: string[] = [];
  const atualizacoes = (entrada.atualizacoes || []).map((item) => ({ ...item }));
  const urls = [
    ...atualizacoes.flatMap((item) => [...(item.fotos || []), ...(item.fotoUrl ? [item.fotoUrl] : [])]),
    ...(entrada.fotos || []).map((foto) => foto.url),
  ];
  const brutos = [
    ...(entrada.origemCoord ? [{ lat: entrada.origemCoord.lat, lng: entrada.origemCoord.lng, rotulo: 'A' }] : []),
    ...atualizacoes
      .filter((item) => item.lat != null && item.lng != null)
      .map((item) => ({ lat: item.lat as number, lng: item.lng as number, rotulo: String(item.numero || '') })),
    ...(entrada.destinoCoord ? [{ lat: entrada.destinoCoord.lat, lng: entrada.destinoCoord.lng, rotulo: 'B' }] : []),
  ];
  const pedidos: Array<{ id: string; pontos: Array<{ lat: number; lng: number; rotulo: string }>; largura: number; altura: number }> = [];
  if (brutos.length) pedidos.push({ id: 'geral', pontos: agruparPontos(brutos), largura: 900, altura: 480 });
  const vistos = new Set<string>();
  for (const item of atualizacoes) {
    if (item.lat == null || item.lng == null) continue;
    const id = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    pedidos.push({ id, pontos: [{ lat: item.lat, lng: item.lng, rotulo: String(item.numero || '') }], largura: 480, altura: 300 });
  }
  aoAvancar?.({ tipo: 'mapa', feitos: 0, total: Math.max(1, pedidos.length) });
  const fotosPromise = embutirFotos(urls).then((fotos) => {
    aoAvancar?.({ tipo: 'foto', feitos: 1, total: 1 });
    return fotos;
  });
  const [fotosServidor, imagensServidor] = await Promise.all([fotosPromise, pedirPacoteMapas(pedidos)]);
  const faltamFoto = [...new Set(urls.filter((url) => url && !url.startsWith('data:') && !fotosServidor.fotoEmbutida[url]))];
  const fotosLocais = await embutirFotosNoNavegador(faltamFoto);
  const fotoEmbutida = { ...fotosServidor.fotoEmbutida, ...fotosLocais };
  const fotos = {
    fotoEmbutida,
    falhas: [...new Set(urls.filter((url) => url && !url.startsWith('data:')))].filter((url) => !fotoEmbutida[url]).length,
  };
  const imagens = { ...imagensServidor };
  const mapasFaltando = pedidos.filter((pedido) => !imagens[pedido.id]);
  let cursorMapa = 0;
  await Promise.all(Array.from({ length: Math.min(3, mapasFaltando.length) }, async () => {
    while (cursorMapa < mapasFaltando.length) {
      const pedido = mapasFaltando[cursorMapa];
      cursorMapa += 1;
      const desenhado = await desenharMapaNoNavegador(pedido.pontos, pedido.largura, pedido.altura);
      if (desenhado) imagens[pedido.id] = desenhado;
    }
  }));
  aoAvancar?.({ tipo: 'mapa', feitos: pedidos.length, total: Math.max(1, pedidos.length) });
  for (const item of atualizacoes) {
    if (item.lat == null || item.lng == null) continue;
    item.miniMapaImagem = imagens[`${item.lat.toFixed(4)},${item.lng.toFixed(4)}`] || null;
  }
  const mapaImagem = imagens.geral || null;
  if (brutos.length && !mapaImagem) {
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
      atualizacoes,
      mapaImagem,
      fotoEmbutida: Object.keys(fotos.fotoEmbutida).length ? fotos.fotoEmbutida : null,
    },
    avisos,
  };
}

export async function ilustrarRelatorio(
  entrada: OsActionPlanInput,
  aoAvancar?: (evento: { tipo: 'foto' | 'mapa'; feitos: number; total: number }) => void,
): Promise<{ entrada: OsActionPlanInput; avisos: string[] }> {
  const primeira = await ilustrarUmaVez(entrada, aoAvancar);
  if (!faltaImagem(primeira.avisos)) return primeira;
  const segunda = await ilustrarUmaVez(entrada, aoAvancar);
  if (!faltaImagem(segunda.avisos)) return segunda;
  if (segunda.entrada.mapaImagem && !primeira.entrada.mapaImagem) return segunda;
  return primeira;
}
