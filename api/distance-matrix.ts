import { computeRouteDistanceKm } from '../lib/routeDistance.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'method_not_allowed' });
    return;
  }

  const origin = String(req.query?.origin || '').trim();
  const destination = String(req.query?.destination || '').trim();
  if (!origin || !destination) {
    res.status(400).json({ success: false, error: 'origin e destination são obrigatórios' });
    return;
  }

  try {
    const result = await computeRouteDistanceKm(origin, destination);
    res.status(200).json(result);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'erro' });
  }
}
