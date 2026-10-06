/**
 * Diário da missão: atualizações reais, fotos reais e pontos de posição.
 * Não chama mapa pago e não transforma ponto de atualização em telemetria.
 */
import { formatDateBR, formatTimeBR } from '../dateUtils';
import { isImageEvidenceUrl } from '../dhlOccurrenceReport/photoUtils';
import { extractCoordinates } from '../utils';
import type { OsActionPlanAtualizacao, OsActionPlanFoto, OsActionPlanInput } from './types';

export const AVISO_MAPA_PONTOS =
  'Mapa elaborado a partir das posições registradas nas atualizações operacionais. Os pontos apresentados não representam telemetria contínua do veículo.';

const JANELA_FOTO_MS = 20 * 60 * 1000;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function horaDe(iso: string | null | undefined): string {
  if (!iso) return '';
  return formatTimeBR(iso, '');
}

function dataHoraDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = formatDateBR(iso);
  const hora = horaDe(iso);
  return hora ? `${data} ${hora}` : data;
}

function urlsDeImagem(texto: string): string[] {
  const achadas: string[] = [];
  const re = /https?:\/\/[^\s"'<>]+/gi;
  for (const bruto of String(texto || '').match(re) || []) {
    const url = bruto.replace(/[),.;]+$/, '');
    if (!isImageEvidenceUrl(url) || achadas.includes(url)) continue;
    achadas.push(url);
  }
  return achadas;
}

function linkDePosicao(texto: string, link: string | null): string | null {
  const direto = String(link || '').trim();
  if (direto && extractCoordinates(direto)) return direto;
  const noTexto = String(texto || '').match(/https?:\/\/[^\s"'<>]*maps[^\s"'<>]*/i);
  if (noTexto) return noTexto[0].replace(/[),.;]+$/, '');
  if (direto) return direto;
  return null;
}

function statusDe(texto: string): string {
  const cabeca = texto.split('|')[0].replace(/\s+/g, ' ').trim();
  if (cabeca && cabeca.length <= 42 && !/^https?:/i.test(cabeca)) return cabeca;
  return 'Atualização operacional';
}

function localDe(texto: string): string | null {
  const partes = texto.split('|').map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const local = partes.slice(1).join(' ').replace(/,?\s*brasil$/i, '').trim();
  if (!local || /^https?:/i.test(local)) return null;
  return local;
}

function numeroTexto(n: number): string {
  return String(n).padStart(2, '0');
}

export function enriquecerAtualizacoes(
  lista: OsActionPlanAtualizacao[],
  fotos: OsActionPlanFoto[] = [],
): OsActionPlanAtualizacao[] {
  const ordenadas = [...(lista || [])].sort((a, b) => String(a.quando || '').localeCompare(String(b.quando || '')));
  const usadas = new Set<string>();
  return ordenadas.map((item, indice) => {
    const texto = String(item.texto || '').trim();
    const link = linkDePosicao(texto, item.linkMapa || null);
    const coords = extractCoordinates(link || texto);
    const fotosItem = [
      ...(item.fotos || []),
      ...(item.fotoUrl ? [item.fotoUrl] : []),
      ...urlsDeImagem(texto),
    ].filter((url, i, arr) => url && arr.indexOf(url) === i && !usadas.has(url));
    const instante = new Date(item.quando).getTime();
    if (Number.isFinite(instante)) {
      const proximas = fotos
        .map((foto) => ({ url: foto.url, delta: Math.abs(new Date(foto.quando || '').getTime() - instante) }))
        .filter((foto) => foto.url && Number.isFinite(foto.delta) && foto.delta <= JANELA_FOTO_MS && !usadas.has(foto.url) && !fotosItem.includes(foto.url))
        .sort((a, b) => a.delta - b.delta);
      for (const foto of proximas) {
        if (fotosItem.length >= 8) break;
        fotosItem.push(foto.url);
      }
    }
    fotosItem.forEach((url) => usadas.add(url));
    return {
      ...item,
      numero: item.numero || indice + 1,
      status: item.status || statusDe(texto),
      local: item.local || localDe(texto),
      linkMapa: link || item.linkMapa || null,
      lat: coords?.lat ?? item.lat ?? null,
      lng: coords?.lng ?? item.lng ?? null,
      fontePosicao: coords ? 'link' : (item.fontePosicao || (item.lat != null && item.lng != null ? 'registro' : null)),
      fotos: fotosItem,
      fotoUrl: fotosItem[0] || null,
    };
  });
}

export function montarAtualizacoes(args: {
  logs: Array<Record<string, unknown>>;
  historico: Array<Record<string, unknown>>;
  fotos: OsActionPlanFoto[];
}): OsActionPlanAtualizacao[] {
  const logs = [...(args.logs || [])]
    .filter((row) => String(row.description || '').trim())
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  if (logs.length) {
    const itens = logs.map((row) => {
      const extras = [row.photo_url, row.image_url, row.evidence_url]
        .map((url) => String(url || '').trim())
        .filter((url) => url && isImageEvidenceUrl(url));
      return {
        quando: String(row.created_at || ''),
        texto: String(row.description || ''),
        por: String(row.updated_by || '').trim() || null,
        fotoUrl: extras[0] || null,
        fotos: extras,
        linkMapa: String(row.map_link || '').trim() || null,
      };
    });
    return enriquecerAtualizacoes(itens, args.fotos);
  }
  const doHistorico = (args.historico || [])
    .filter((row) => row.field_name === 'current_location' && String(row.new_value || '').trim())
    .map((row) => ({
      quando: String(row.changed_at || ''),
      texto: String(row.new_value || ''),
      por: String(row.changed_by || '').trim() || null,
      fotoUrl: null,
      linkMapa: (String(row.new_value || '').match(/https?:\/\/[^\s"'<>]*maps[^\s"'<>]*/i) || [null])[0],
    }));
  return enriquecerAtualizacoes(doHistorico, args.fotos);
}

export function selecionarAtualizacoes(d: OsActionPlanInput): { lista: OsActionPlanAtualizacao[]; nota: string | null } {
  const todas = enriquecerAtualizacoes(d.atualizacoes || [], d.fotos || []);
  if (d.modalidade !== 'ocorrencia' || d.escopoAtualizacoes !== 'relevantes') {
    return { lista: todas, nota: null };
  }
  const palavras = normalizar(d.problemaPrincipal || '')
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 5)
    .slice(0, 16);
  const marcadas = todas.filter((item) => {
    const texto = normalizar(`${item.texto} ${item.local || ''} ${item.status || ''}`);
    return palavras.some((palavra) => texto.includes(palavra));
  });
  if (!marcadas.length) {
    return {
      lista: todas,
      nota: `Nenhuma atualização foi classificada como exclusiva da ocorrência. O quadro mostra as ${todas.length} atualizações registradas.`,
    };
  }
  const comProva = todas.filter((item) => {
    if (marcadas.includes(item)) return false;
    const temFoto = Boolean(item.fotoUrl || item.fotos?.length);
    const temPonto = item.lat != null && item.lng != null;
    return temFoto || temPonto;
  });
  const lista = [...marcadas, ...comProva].sort((a, b) => (a.numero || 0) - (b.numero || 0));
  if (!comProva.length) {
    return {
      lista: marcadas,
      nota: `O histórico interno tem ${todas.length} atualizações. Este quadro mostra ${marcadas.length} relacionadas ao problema informado.`,
    };
  }
  return {
    lista,
    nota: `O histórico interno tem ${todas.length} atualizações. O quadro mantém as ligadas ao problema e também as que têm foto ou posição, para o mapa e as imagens não sumirem.`,
  };
}

export function inventarioMissao(d: OsActionPlanInput): Array<{ ok: boolean; texto: string }> {
  const lista = enriquecerAtualizacoes(d.atualizacoes || [], d.fotos || []);
  const fotos = lista.reduce((total, item) => total + (item.fotos?.length || 0), 0);
  const posicoes = lista.filter((item) => item.lat != null && item.lng != null).length;
  const semPosicao = lista.length - posicoes;
  const concluida = /conclu/i.test(d.status || '');
  const itens = [
    { ok: Boolean(d.missionId), texto: `OS ${d.missionId}` },
    { ok: Boolean(d.origem && d.destino && d.origem !== '—' && d.destino !== '—'), texto: 'Origem e destino' },
    { ok: lista.length > 0, texto: `${lista.length} atualizações` },
    { ok: fotos > 0, texto: `${fotos} fotos` },
    { ok: posicoes > 0, texto: `${posicoes} posições válidas` },
  ];
  if (semPosicao > 0) itens.push({ ok: false, texto: `${semPosicao} atualização(ões) sem posição` });
  itens.push({ ok: concluida, texto: concluida ? 'Missão concluída' : `Status: ${d.status || 'não informado'}` });
  if (d.consultaDiario === 'CONSULTA INCOMPLETA' || d.historicoEstado === 'CONSULTA INCOMPLETA') {
    itens.push({ ok: false, texto: 'A leitura das atualizações não fechou o universo completo' });
  }
  return itens;
}

export function resumoOperacional(d: OsActionPlanInput, quantidade: number): string {
  const horaInicio = horaDe(d.horarioProgramado) || horaDe(d.linhaDoTempo?.[0]?.quando);
  const horaFim = horaDe(d.horarioFim);
  const inicio = horaInicio
    ? `A operação vinculada à OS ${d.missionId} foi iniciada às ${horaInicio}`
    : `A operação vinculada à OS ${d.missionId} não tem horário de início registrado`;
  const rota = d.origem && d.destino
    ? `, com saída de ${d.origem} e destino a ${d.destino}`
    : '';
  const meio = `. Durante o percurso foram registradas ${quantidade} atualizações operacionais.`;
  const fim = horaFim
    ? ` A missão tem encerramento registrado às ${horaFim}, conforme os registros disponíveis no sistema.`
    : ' O horário de encerramento não está registrado nesta OS.';
  return `${inicio}${rota}${meio}${fim}`;
}

type PontoMapa = { lat: number; lng: number; rotulo: string };

export function svgMapaPontos(pontos: PontoMapa[], largura = 680, altura = 360): string | null {
  const validos = pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!validos.length) return null;
  let minLat = Math.min(...validos.map((p) => p.lat));
  let maxLat = Math.max(...validos.map((p) => p.lat));
  let minLng = Math.min(...validos.map((p) => p.lng));
  let maxLng = Math.max(...validos.map((p) => p.lng));
  if (minLat === maxLat) { minLat -= 0.02; maxLat += 0.02; }
  if (minLng === maxLng) { minLng -= 0.02; maxLng += 0.02; }
  const margem = 40;
  const x = (lng: number) => margem + ((lng - minLng) / (maxLng - minLng)) * (largura - margem * 2);
  const y = (lat: number) => margem + ((maxLat - lat) / (maxLat - minLat)) * (altura - margem * 2);
  const linha = '';
  const marcas = validos.map((p) => {
    const cx = x(p.lng).toFixed(1);
    const cy = y(p.lat).toFixed(1);
    const curto = p.rotulo.length <= 2;
    const dentro = curto
      ? `<text x="${cx}" y="${cy}" dy="4" text-anchor="middle" font-size="10" fill="#ffffff" font-family="Arial, sans-serif">${esc(p.rotulo)}</text>`
      : '';
    const fora = curto
      ? ''
      : `<text x="${cx}" y="${Number(cy) + 22}" text-anchor="middle" font-size="9" fill="#111827" font-family="Arial, sans-serif">${esc(p.rotulo)}</text>`;
    return `<g><circle cx="${cx}" cy="${cy}" r="12" fill="#111827"/>${dentro}${fora}</g>`;
  }).join('');
  return `<svg class="mapa-svg" viewBox="0 0 ${largura} ${altura}" width="100%" role="img" aria-label="Pontos registrados na missão"><rect width="${largura}" height="${altura}" rx="12" fill="#f8fafc" stroke="#e5e7eb"/>${linha}${marcas}</svg>`;
}

export function agruparPontos(pontos: PontoMapa[]): PontoMapa[] {
  const grupos = new Map<string, { lat: number; lng: number; rotulos: string[] }>();
  for (const ponto of pontos) {
    if (!Number.isFinite(ponto.lat) || !Number.isFinite(ponto.lng)) continue;
    const chave = `${ponto.lat.toFixed(4)},${ponto.lng.toFixed(4)}`;
    const grupo = grupos.get(chave);
    if (grupo) grupo.rotulos.push(ponto.rotulo);
    else grupos.set(chave, { lat: ponto.lat, lng: ponto.lng, rotulos: [ponto.rotulo] });
  }
  return [...grupos.values()].map((grupo) => ({
    lat: grupo.lat,
    lng: grupo.lng,
    rotulo: grupo.rotulos.join('·'),
  }));
}

export type DiagnosticoMapa = {
  atualizacoes: number;
  comEndereco: number;
  comLink: number;
  comCoordenadaNoRegistro: number;
  extraidasDoLink: number;
  geocodificadas: number;
  semLocal: number;
};

function chaveEndereco(endereco: string): string {
  return endereco.replace(/\s+/g, ' ').replace(/,?\s*brasil$/i, '').trim().toUpperCase();
}

export async function resolverPosicoes(args: {
  atualizacoes: OsActionPlanAtualizacao[];
  origem?: string | null;
  destino?: string | null;
  linkAtualMissao?: string | null;
  geocodificar: (endereco: string) => Promise<{ lat: number; lng: number } | null>;
  aoAvancar?: (feitos: number, total: number) => void;
}): Promise<{
  atualizacoes: OsActionPlanAtualizacao[];
  origemCoord: { lat: number; lng: number } | null;
  destinoCoord: { lat: number; lng: number } | null;
  diagnostico: DiagnosticoMapa;
}> {
  const lista = enriquecerAtualizacoes(args.atualizacoes || [], []);
  const cache = new Map<string, { lat: number; lng: number } | null>();
  const buscar = async (endereco: string | null | undefined) => {
    const chave = chaveEndereco(String(endereco || ''));
    if (chave.length < 8) return null;
    if (cache.has(chave)) return cache.get(chave) || null;
    const ponto = await args.geocodificar(chave);
    const valido = ponto && Number.isFinite(ponto.lat) && Number.isFinite(ponto.lng) ? ponto : null;
    cache.set(chave, valido);
    return valido;
  };
  const linkMissao = extractCoordinates(String(args.linkAtualMissao || ''));
  const ultimoPrevio = lista.length - 1;
  const pendentes: string[] = [];
  const marcar = (endereco: string | null | undefined) => {
    const chave = chaveEndereco(String(endereco || ''));
    if (chave.length < 8 || pendentes.includes(chave)) return;
    pendentes.push(chave);
  };
  lista.forEach((item, i) => {
    if (item.lat != null && item.lng != null) return;
    if (i === ultimoPrevio && linkMissao) return;
    marcar(item.local);
  });
  marcar(args.origem);
  marcar(args.destino);
  // Várias consultas ao mesmo tempo. Uma trava não segura a fila inteira.
  let cursor = 0;
  let feitos = 0;
  const total = pendentes.length;
  args.aoAvancar?.(0, total);
  await Promise.all(Array.from({ length: Math.min(4, pendentes.length) }, async () => {
    while (cursor < pendentes.length) {
      const chave = pendentes[cursor];
      cursor += 1;
      await buscar(chave);
      feitos += 1;
      args.aoAvancar?.(feitos, total);
    }
  }));
  const comCoordenadaNoRegistro = lista.filter((item) => item.fontePosicao === 'registro' && item.lat != null && item.lng != null).length;
  let extraidasDoLink = lista.filter((item) => item.fontePosicao === 'link' && item.lat != null).length;
  let geocodificadas = 0;
  const ultimo = lista.length - 1;
  for (let i = 0; i < lista.length; i += 1) {
    const item = lista[i];
    if (item.lat != null && item.lng != null) continue;
    if (i === ultimo && linkMissao) {
      item.lat = linkMissao.lat;
      item.lng = linkMissao.lng;
      item.linkMapa = item.linkMapa || args.linkAtualMissao || null;
      item.fontePosicao = 'link';
      extraidasDoLink += 1;
      continue;
    }
    const ponto = await buscar(item.local);
    if (!ponto) continue;
    item.lat = ponto.lat;
    item.lng = ponto.lng;
    item.fontePosicao = 'endereco';
    geocodificadas += 1;
  }
  const origemCoord = await buscar(args.origem);
  const destinoCoord = await buscar(args.destino);
  const diagnostico: DiagnosticoMapa = {
    atualizacoes: lista.length,
    comEndereco: lista.filter((item) => item.local).length,
    comLink: lista.filter((item) => item.linkMapa).length + (args.linkAtualMissao && !lista.some((item) => item.linkMapa === args.linkAtualMissao) ? 1 : 0),
    comCoordenadaNoRegistro,
    extraidasDoLink,
    geocodificadas,
    semLocal: lista.filter((item) => item.lat == null || item.lng == null).length,
  };
  return { atualizacoes: lista, origemCoord, destinoCoord, diagnostico };
}

function fotosHtml(item: OsActionPlanAtualizacao, embutidas?: Record<string, string> | null): string {
  const fotos = item.fotos || [];
  if (!fotos.length) return '';
  const classe = fotos.length <= 1 ? 'galeria n1' : 'galeria n2';
  return `<div class="${classe}">${fotos.map((url, indice) => {
    const visivel = embutidas?.[url] || url;
    return `<a class="foto-link quadro" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(visivel)}" alt="Foto ${indice + 1} da atualização ${esc(numeroTexto(item.numero || indice + 1))}" /><span class="abrir-foto">Abrir foto</span></a>`;
  }).join('')}</div>`;
}

function miniMapaHtml(item: OsActionPlanAtualizacao): string {
  if (item.lat == null || item.lng == null) return '';
  const desenho = item.miniMapaImagem
    ? `<img class="mapa-rua" src="${esc(item.miniMapaImagem)}" alt="Local da atualização ${esc(numeroTexto(item.numero || 0))}" />`
    : (svgMapaPontos([{ lat: item.lat, lng: item.lng, rotulo: String(item.numero || '') }], 220, 220) || '');
  const fonte = item.linkMapa ? ` data-link-posicao="${esc(item.linkMapa)}"` : '';
  const endereco = item.local ? `<span>Endereço: ${esc(item.local)}</span>` : '';
  return `<div class="mini-mapa quadro" data-fonte-posicao="${esc(item.fontePosicao || '')}"${fonte}>${desenho}<p class="selo-mini"><strong>Atualização ${esc(numeroTexto(item.numero || 0))}</strong><span>Data/hora: ${esc(dataHoraDe(item.quando))}</span>${endereco}</p></div>`;
}

export function htmlQuadroAtualizacoes(d: OsActionPlanInput): string {
  const { lista, nota } = selecionarAtualizacoes(d);
  const cartoes = lista.length
    ? lista.map((item) => `<article class="atualizacao" data-atualizacao="${esc(item.numero || '')}">
      <div class="par-visual"><div class="quadros-tempo">${miniMapaHtml(item)}${fotosHtml(item, d.fotoEmbutida)}</div><div class="corpo-atualizacao">
      <header><strong>ATUALIZAÇÃO ${esc(numeroTexto(item.numero || 0))}</strong><span>${esc(dataHoraDe(item.quando))}</span></header>
      <p><strong>Status:</strong> ${esc(item.status || 'Atualização operacional')}</p>
      <p><strong>Local:</strong> ${esc(item.local || 'Local não informado nesta atualização.')}</p>
      <p><strong>Descrição:</strong> ${esc(item.texto || 'Sem descrição registrada.')}</p>
      ${(item.fotos || []).length ? '' : '<p class="sem-foto">Sem registro fotográfico nesta atualização.</p>'}
      <p class="quem">Registrado por: ${esc(item.por || 'Não informado')}</p>
      </div></div>
    </article>`).join('')
    : '<p>Nenhuma atualização operacional foi encontrada nesta OS.</p>';
  return `<section data-secao="diario">
    <h2>Quadro de atualizações da missão</h2>
    ${nota ? `<p class="nota-diario">${esc(nota)}</p>` : ''}
    ${cartoes}
  </section>`;
}

export function cssDiario(): string {
  return `
    .atualizacao { width: 100%; max-width: 100%; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin: 0 0 12px; box-sizing: border-box; }
    .atualizacao header { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #991b1b; margin-bottom: 8px; break-after: avoid; }
    .par-visual { display: flex; width: 100%; gap: 10px; align-items: flex-start; }
    .quadros-tempo { display: flex; flex: 0 0 auto; gap: 6px; align-items: flex-start; }
    .corpo-atualizacao { flex: 1 1 auto; min-width: 0; }
    .quadro { position: relative; width: 32mm; height: 32mm; flex: 0 0 32mm; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 8px; background: #f8fafc; }
    .galeria { display: flex; gap: 6px; }
    .foto-link { display: block; color: #fff; text-decoration: none; }
    .quadro img, .quadro svg { display: block; width: 32mm; height: 32mm; object-fit: cover; object-position: center; }
    .selo-mini, .abrir-foto { position: absolute; left: 0; right: 0; bottom: 0; margin: 0; padding: 2px 4px; background: rgba(17,24,39,.78); color: #fff; font-size: 7pt; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .selo-mini span { display: none; }
    .abrir-foto { position: absolute; font-weight: 700; text-decoration: underline; }
    .mapa-geral { display: block; width: 100%; height: auto; max-height: 68mm; object-fit: contain; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; }
    .sem-foto, .nota-diario, .aviso-mapa { font-size: 9pt; color: #374151; }
    .atualizacao .quem { font-size: 8.5pt; color: #4b5563; }
    .sequencia { margin: 8px 0; padding-left: 18px; }
    .mapa-svg { width: 100%; break-inside: avoid; page-break-inside: avoid; }
    @media print {
      .atualizacao { break-inside: auto; page-break-inside: auto; }
      .atualizacao header, .par-visual, .mapa-svg { break-inside: avoid; page-break-inside: avoid; }
    }
  `;
}

export function htmlMapaMissao(d: OsActionPlanInput): string {
  const { lista } = selecionarAtualizacoes(d);
  const brutos: PontoMapa[] = [];
  if (d.origemCoord && Number.isFinite(d.origemCoord.lat) && Number.isFinite(d.origemCoord.lng)) {
    brutos.push({ lat: d.origemCoord.lat, lng: d.origemCoord.lng, rotulo: 'A' });
  }
  for (const item of lista) {
    if (item.lat == null || item.lng == null) continue;
    brutos.push({ lat: item.lat, lng: item.lng, rotulo: String(item.numero || '') });
  }
  if (d.destinoCoord && Number.isFinite(d.destinoCoord.lat) && Number.isFinite(d.destinoCoord.lng)) {
    brutos.push({ lat: d.destinoCoord.lat, lng: d.destinoCoord.lng, rotulo: 'B' });
  }
  const pontos = agruparPontos(brutos);
  const desenho = d.mapaImagem
    ? `<img class="mapa-rua mapa-geral" src="${esc(d.mapaImagem)}" alt="Mapa da missão com os pontos registrados" />`
    : svgMapaPontos(pontos);
  const legenda = pontos.map((ponto) => {
    const partes = ponto.rotulo.split('·');
    const textos = [
      partes.includes('A') ? `🚩 Origem — ${d.origem || ''}` : '',
      partes.some((parte) => parte !== 'A' && parte !== 'B') ? `Atualização ${partes.filter((parte) => parte !== 'A' && parte !== 'B').join(', ')}` : '',
      partes.includes('B') ? `🏁 Destino — ${d.destino || ''}` : '',
    ].filter(Boolean);
    return `<li><b>${esc(ponto.rotulo)}</b> ${esc(textos.join(' · '))}</li>`;
  }).join('');
  const motivo = d.diagnosticoMapa
    ? `atualizacoes=${d.diagnosticoMapa.atualizacoes}; enderecos=${d.diagnosticoMapa.comEndereco}; links=${d.diagnosticoMapa.comLink}; extraidas=${d.diagnosticoMapa.extraidasDoLink}; geocodificadas=${d.diagnosticoMapa.geocodificadas}; semLocal=${d.diagnosticoMapa.semLocal}`
    : 'sem diagnóstico';
  if (!desenho) {
    return `<section data-secao="mapa-missao">
      <h2>Mapa da missão</h2>
      <p>Mapa da missão indisponível para esta operação.</p>
      <p hidden data-secao="auditoria-mapa">${esc(motivo)}</p>
    </section>`;
  }
  return `<section data-secao="mapa-missao">
    <h2>Mapa da missão</h2>
    ${desenho}
    <ol class="sequencia">${legenda}</ol>
    <p class="aviso-mapa">${esc(AVISO_MAPA_PONTOS)}</p>
    <p hidden data-secao="auditoria-mapa">${esc(motivo)}</p>
  </section>`;
}
