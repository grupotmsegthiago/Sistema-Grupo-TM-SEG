import { googleMapsApiKey } from "../maps";
import type { PontoMapa } from "./mapaNoturno";

const cache = new Map<string, { expira: number; pontos: PontoMapa[] | null }>();
let emVoo = 0;
const fila: Array<() => void> = [];

function chaveRota(origem: string, destino: string): string {
  return origem.trim().toUpperCase() + "|" + destino.trim().toUpperCase();
}

function carregarGoogleMaps(): Promise<void> {
  const janela = window as unknown as { google?: { maps?: { DirectionsService?: unknown } }; __tmsegMapa?: Promise<void> };
  if (janela.google?.maps?.DirectionsService) return Promise.resolve();
  if (janela.__tmsegMapa) return janela.__tmsegMapa;
  janela.__tmsegMapa = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(googleMapsApiKey) + "&libraries=places,geometry&language=pt-BR&region=BR";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("mapa_indisponivel"));
    document.head.appendChild(script);
  });
  return janela.__tmsegMapa;
}

function agendar<T>(tarefa: () => Promise<T>): Promise<T> {
  if (emVoo >= 3) {
    return new Promise((resolve, reject) => {
      fila.push(() => { agendar(tarefa).then(resolve, reject); });
    });
  }
  emVoo += 1;
  return tarefa().finally(() => {
    emVoo -= 1;
    const proxima = fila.shift();
    if (proxima) proxima();
  });
}

/** Uma consulta de rota por par origem/destino, reaproveitada por todas as OS visíveis. */
export function consultarRotaRodoviaria(origem: string, destino: string): Promise<PontoMapa[] | null> {
  const chave = chaveRota(origem, destino);
  const guardado = cache.get(chave);
  if (guardado && guardado.expira > Date.now()) return Promise.resolve(guardado.pontos);
  return agendar(async () => {
    await carregarGoogleMaps();
    const google = (window as unknown as { google: any }).google;
    const servico = new google.maps.DirectionsService();
    const pontos = await new Promise<PontoMapa[] | null>((resolve) => {
      servico.route({
        origin: origem,
        destination: destino,
        travelMode: google.maps.TravelMode.DRIVING,
        region: "br",
      }, (resultado: any, status: string) => {
        const caminho = resultado?.routes?.[0]?.overview_path;
        if (status !== "OK" || !Array.isArray(caminho) || caminho.length < 2) {
          resolve(null);
          return;
        }
        resolve(caminho.map((ponto: any) => ({ lat: ponto.lat(), lng: ponto.lng() })));
      });
    });
    cache.set(chave, { expira: Date.now() + (pontos ? 30 * 60 * 1000 : 2 * 60 * 1000), pontos });
    return pontos;
  });
}
