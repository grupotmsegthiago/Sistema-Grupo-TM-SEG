import { haversineMeters } from "../liveTrack/pure";

export interface PontoMapa {
  lat: number;
  lng: number;
}

export type SituacaoEscolta = "indisponivel" | "atras" | "frente" | "distante";

const LIMITE_URL = 7000;

export function normalizarEndereco(valor: string): string {
  return (valor || "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function origemIgualDestino(origem: string, destino: string): boolean {
  const a = normalizarEndereco(origem);
  const b = normalizarEndereco(destino);
  return a.length > 0 && a === b;
}

export function simplificarRota(pontos: PontoMapa[], maximo = 40): PontoMapa[] {
  if (pontos.length <= maximo) return pontos.slice();
  const passo = (pontos.length - 1) / (maximo - 1);
  const saida: PontoMapa[] = [];
  for (let i = 0; i < maximo; i++) saida.push(pontos[Math.round(i * passo)]);
  return saida;
}

export function indiceMaisProximo(pontos: PontoMapa[], alvo: PontoMapa): number {
  let melhor = 0;
  let menor = Number.POSITIVE_INFINITY;
  pontos.forEach((ponto, indice) => {
    const distancia = haversineMeters(ponto, alvo);
    if (distancia < menor) {
      menor = distancia;
      melhor = indice;
    }
  });
  return melhor;
}

/** A escolta só entra no mapa quando existe coordenada própria. Nunca é colocada atrás do caminhão por enfeite. */
export function situacaoEscolta(
  rota: PontoMapa[],
  caminhao: PontoMapa | null,
  escolta: PontoMapa | null,
): SituacaoEscolta {
  if (!escolta || !caminhao || rota.length < 2) return "indisponivel";
  const indiceEscolta = indiceMaisProximo(rota, escolta);
  const afastamento = haversineMeters(rota[indiceEscolta], escolta);
  if (afastamento > 15000) return "distante";
  const indiceCaminhao = indiceMaisProximo(rota, caminhao);
  if (indiceEscolta > indiceCaminhao + 1) return "frente";
  return "atras";
}

export function projetarNoRetangulo(pontos: PontoMapa[], largura: number, altura: number, margem = 16) {
  if (!pontos.length) return [];
  const lats = pontos.map((p) => p.lat);
  const lngs = pontos.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const faixaLat = maxLat - minLat || 0.01;
  const faixaLng = maxLng - minLng || 0.01;
  return pontos.map((ponto) => ({
    x: margem + ((ponto.lng - minLng) / faixaLng) * (largura - margem * 2),
    y: altura - margem - ((ponto.lat - minLat) / faixaLat) * (altura - margem * 2),
  }));
}

function estiloNoturno(): string {
  const estilos = [
    "element:geometry|color:0x0b1220",
    "element:labels.text.fill|color:0x9fb3c8",
    "element:labels.text.stroke|color:0x0b1220",
    "feature:road|element:geometry|color:0x1e293b",
    "feature:road.highway|element:geometry|color:0x334155",
    "feature:water|element:geometry|color:0x0f172a",
    "feature:landscape|element:geometry|color:0x111827",
    "feature:poi|visibility:off",
    "feature:transit|visibility:off",
  ];
  return estilos.map((item) => "style=" + encodeURIComponent(item)).join("&");
}

/** Miniatura do Google Static Maps com a polilinha já calculada. Sem pontos, não há URL. */
export function montarUrlMapaEstatico(params: {
  chave: string;
  pontos: PontoMapa[];
  atual?: PontoMapa | null;
  escolta?: PontoMapa | null;
  largura?: number;
  altura?: number;
}): string | null {
  const pontos = simplificarRota(params.pontos, 36);
  if (!params.chave || pontos.length < 2) return null;
  const largura = params.largura || 360;
  const altura = params.altura || 160;
  const caminho = pontos.map((p) => p.lat.toFixed(5) + "," + p.lng.toFixed(5)).join("|");
  const quadro = enquadrarRota(pontos, largura, altura);
  const partes = [
    "https://maps.googleapis.com/maps/api/staticmap?size=" + largura + "x" + altura,
    "scale=1",
    "maptype=roadmap",
    "center=" + quadro.centro.lat.toFixed(5) + "," + quadro.centro.lng.toFixed(5),
    "zoom=" + quadro.zoom,
    estiloNoturno(),
    "path=" + encodeURIComponent("color:0xf59e0b|weight:5|" + caminho),
    "key=" + encodeURIComponent(params.chave),
  ];
  const url = partes.join("&");
  return url.length > LIMITE_URL ? null : url;
}

export function rotuloCidade(endereco: string): string {
  const texto = (endereco || "").replace(/\s+/g, " ").trim();
  const achados = [...texto.matchAll(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .']{1,40}?)\s*-\s*([A-Za-z]{2})\b/g)];
  const cidadeUf = achados[achados.length - 1];
  if (cidadeUf) return (cidadeUf[1].trim() + " - " + cidadeUf[2]).toUpperCase();
  const partes = texto.split(",").map((item) => item.trim()).filter(Boolean);
  return (partes[partes.length - 1] || texto || "—").toUpperCase().slice(0, 32);
}

export function horarioCurto(valor: string): string {
  const hora = (valor || "").match(/(\d{2}:\d{2})/);
  return hora ? hora[1] : "";
}

function mundo(lat: number, lng: number) {
  const seno = Math.sin((lat * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI),
  };
}

export function pixelNoMapa(ponto: PontoMapa, centro: PontoMapa, zoom: number, largura: number, altura: number) {
  const escala = 256 * Math.pow(2, zoom);
  const c = mundo(centro.lat, centro.lng);
  const p = mundo(ponto.lat, ponto.lng);
  return {
    x: (p.x - c.x) * escala + largura / 2,
    y: (p.y - c.y) * escala + altura / 2,
  };
}

export function enquadrarRota(pontos: PontoMapa[], largura: number, altura: number) {
  const minLat = Math.min(...pontos.map((p) => p.lat));
  const maxLat = Math.max(...pontos.map((p) => p.lat));
  const minLng = Math.min(...pontos.map((p) => p.lng));
  const maxLng = Math.max(...pontos.map((p) => p.lng));
  const centro = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  let zoom = 4;
  for (let candidato = 15; candidato >= 4; candidato--) {
    const pixels = pontos.map((ponto) => pixelNoMapa(ponto, centro, candidato, largura, altura));
    const cabe = pixels.every((pixel) => pixel.x >= 36 && pixel.x <= largura - 36 && pixel.y >= 28 && pixel.y <= altura - 24);
    if (cabe) {
      zoom = candidato;
      break;
    }
  }
  return { centro, zoom, largura, altura };
}

export function indiceAoLongo(pontos: PontoMapa[], atual: PontoMapa | null, fracao: number) {
  if (atual) return indiceMaisProximo(pontos, atual);
  const limite = Math.max(0, pontos.length - 1);
  return Math.round(Math.min(1, Math.max(0, fracao)) * limite);
}

export function indiceAtras(pontos: PontoMapa[], indice: number, metros = 4000) {
  let percorrido = 0;
  for (let i = indice; i > 0; i--) {
    percorrido += haversineMeters(pontos[i], pontos[i - 1]);
    if (percorrido >= metros) return i - 1;
  }
  return 0;
}
