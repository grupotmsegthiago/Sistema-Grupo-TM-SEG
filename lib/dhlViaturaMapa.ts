/**
 * Mapa público das viaturas disponíveis para o cliente.
 * O ponto sai só com cidade, região e horário. Sem fornecedor, cliente, OS ou placa.
 */
import { acharCidade, distanciaKm } from './dhlReferenciaGeografica';

export const CAMINHO_MAPA_VIATURAS = '/dhl';
export const JANELA_MAPA_MS = 60 * 60 * 1000;
export const RAIO_MAX_KM = 1000;

const STATUS_NO_MAPA = new Set(['pendente', 'copiado', 'confirmado']);

export type LinhaMapaViatura = {
  mission_id: string;
  posicao: string;
  uf: string;
  regiao: string;
  finalizada_em: string;
  status: string;
};

export type PontoMapaPublico = {
  id: string;
  posicao: string;
  uf: string;
  regiao: string;
  lat: number;
  lng: number;
  finalizadaEm: string;
};

export function urlMapaViaturas(origin?: string): string {
  const base = String(
    origin
    || (typeof window !== 'undefined' ? window.location.origin : 'https://sistema.grupotmseg.com.br'),
  ).replace(/\/$/, '');
  return `${base}${CAMINHO_MAPA_VIATURAS}`;
}

/** Identificador opaco. O cliente não vê o número da OS. */
export function idPublicoViatura(missionId: string): string {
  let h = 2166136261;
  const texto = String(missionId || '');
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `tm${(h >>> 0).toString(36)}`;
}

function deslocar(lat: number, lng: number, id: string): { lat: number; lng: number } {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i)) % 360;
  const ang = (n * Math.PI) / 180;
  return {
    lat: lat + Math.cos(ang) * 0.004,
    lng: lng + Math.sin(ang) * 0.004,
  };
}

export function linhaVisivelNoMapa(row: Pick<LinhaMapaViatura, 'status' | 'uf' | 'finalizada_em'>, now = new Date()): boolean {
  const uf = String(row.uf || '').toUpperCase();
  if (uf === 'SP' || uf === 'RJ') return false;
  if (!STATUS_NO_MAPA.has(String(row.status || ''))) return false;
  const fim = new Date(row.finalizada_em).getTime();
  if (!Number.isFinite(fim)) return false;
  const idade = now.getTime() - fim;
  return idade >= -60_000 && idade < JANELA_MAPA_MS;
}

export function pontoDeCoordenada(
  row: LinhaMapaViatura,
  coord: { lat: number; lng: number },
): PontoMapaPublico | null {
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lng)) return null;
  const id = idPublicoViatura(row.mission_id);
  const pos = deslocar(coord.lat, coord.lng, id);
  return {
    id,
    posicao: String(row.posicao || '').replace(/\s+/g, ' ').trim(),
    uf: String(row.uf || '').toUpperCase(),
    regiao: String(row.regiao || ''),
    lat: pos.lat,
    lng: pos.lng,
    finalizadaEm: row.finalizada_em,
  };
}

export function montarPontosPublicos(rows: LinhaMapaViatura[], now = new Date()): PontoMapaPublico[] {
  const pontos: PontoMapaPublico[] = [];
  for (const row of rows) {
    if (!linhaVisivelNoMapa(row, now)) continue;
    const cidade = acharCidade(row.posicao, row.uf);
    if (!cidade) continue;
    const ponto = pontoDeCoordenada(row, cidade);
    if (ponto) pontos.push(ponto);
  }
  return pontos;
}

export type PontoComDistancia = PontoMapaPublico & { distanciaKm: number | null };

export function filtrarViaturasPorRaio(
  pontos: PontoMapaPublico[],
  origem: { lat: number; lng: number } | null,
  raioKm: number,
): PontoComDistancia[] {
  const raio = Math.min(RAIO_MAX_KM, Math.max(0, Number(raioKm) || 0));
  const comDistancia = pontos.map((ponto) => ({
    ...ponto,
    distanciaKm: origem ? distanciaKm(origem, ponto) : null,
  }));
  if (!origem) {
    return comDistancia.sort((a, b) => new Date(b.finalizadaEm).getTime() - new Date(a.finalizadaEm).getTime());
  }
  if (raio <= 0) return [];
  return comDistancia
    .filter((ponto) => ponto.distanciaKm != null && ponto.distanciaKm <= raio)
    .sort((a, b) => (a.distanciaKm || 0) - (b.distanciaKm || 0));
}
