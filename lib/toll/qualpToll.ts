import { computeRouteDistanceKm, normalizeRouteAddress } from '../routeDistance.js';

const QUALP_ROUTE_URL = 'https://api.qualp.com.br/rotas/v4';

export type QualpTollResult = {
  success: boolean;
  tollValue: number;
  tollCount: number;
  tolls: Array<{ name: string; value: number; road: string }>;
  distance?: number;
  provider: 'qualp';
  apiError?: string;
};

function parseQualpDistanceKm(data: any): number | undefined {
  const d = data?.distancia;
  if (!d) return undefined;
  if (typeof d.valor === 'number' && d.valor > 0) {
    return d.valor > 500 ? Math.round((d.valor / 1000) * 100) / 100 : d.valor;
  }
  if (typeof d.km === 'number' && d.km > 0) return d.km;
  if (typeof d.texto === 'string') {
    const m = d.texto.match(/([\d.,]+)/);
    if (m) return parseFloat(m[1].replace(',', '.'));
  }
  return undefined;
}

/** Consulta pedágio via QualP (rotas v4). Usado pelo handler Vercel dedicado. */
export async function fetchQualpToll(
  origin: string,
  destination: string,
  axis = 2,
): Promise<QualpTollResult> {
  const token = String(process.env.QUALP_API_TOKEN || '').trim();
  if (!token) {
    return { success: false, tollValue: 0, tollCount: 0, tolls: [], provider: 'qualp', apiError: 'QUALP_API_TOKEN não configurada no servidor' };
  }

  const originNorm = normalizeRouteAddress(origin);
  const destinationNorm = normalizeRouteAddress(destination);
  if (!originNorm || !destinationNorm) {
    return { success: false, tollValue: 0, tollCount: 0, tolls: [], provider: 'qualp', apiError: 'Origem e destino são obrigatórios' };
  }

  const eixos = Number(axis) >= 2 ? Number(axis) : 2;

  const response = await fetch(QUALP_ROUTE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Access-Token': token,
    },
    body: JSON.stringify({
      locations: [originNorm, destinationNorm],
      config: {
        route: { type_route: 'efficient', calculate_return: false },
        vehicle: { type: 'car', axis: eixos },
      },
      show: { tolls: true },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[qualpToll] HTTP', response.status, errText.slice(0, 200));
    return { success: false, tollValue: 0, tollCount: 0, tolls: [], provider: 'qualp', apiError: `API QualP retornou erro ${response.status}` };
  }

  const data = await response.json();
  const pedagios = Array.isArray(data?.pedagios) ? data.pedagios : [];

  const tolls = pedagios.map((p: any) => {
    let v = 0;
    const tar = p?.tarifa;
    if (tar && typeof tar === 'object') {
      if (tar[String(eixos)] !== undefined) {
        v = parseFloat(tar[String(eixos)]) || 0;
      } else {
        const vals = Object.values(tar).map((x: any) => parseFloat(x)).filter((n: number) => !isNaN(n));
        v = vals.length ? Math.min(...vals) : 0;
      }
    } else if (tar !== undefined) {
      v = parseFloat(tar) || 0;
    }
    return {
      name: p?.nome || p?.concessionaria || 'Praça de Pedágio',
      value: v,
      road: p?.rodovia || '',
    };
  });

  const tollValue = parseFloat(tolls.reduce((sum: number, t: any) => sum + t.value, 0).toFixed(2));
  let distance = parseQualpDistanceKm(data);

  if (distance === undefined) {
    const fallback = await computeRouteDistanceKm(originNorm, destinationNorm);
    if (fallback.success && fallback.distanceKm) distance = fallback.distanceKm;
  }

  const routeComputed = typeof distance === 'number' && distance > 0;

  return {
    success: routeComputed,
    tollValue,
    tollCount: tolls.length,
    tolls,
    distance,
    provider: 'qualp',
  };
}
