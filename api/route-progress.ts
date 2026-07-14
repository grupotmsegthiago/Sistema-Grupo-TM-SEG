import { computeRouteProgressKm } from "../lib/routeDistance.js";

function etaLabelFromMinutes(etaMinutes: number | null): string {
  if (!etaMinutes) return "—";
  const h = Math.floor(etaMinutes / 60);
  const m = etaMinutes % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

/** GET /api/route-progress — progresso via Directions API (Distance Matrix legado desligado). */
export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "method_not_allowed" });
    return;
  }

  const origin = String(req.query?.origin || "").trim();
  const destination = String(req.query?.destination || "").trim();
  const current = String(req.query?.current || "").trim();
  if (!origin || !destination || !current) {
    res.status(400).json({ success: false, error: "origin, destination e current são obrigatórios" });
    return;
  }

  try {
    const result = await computeRouteProgressKm({ origin, destination, current });
    if (!result.success) {
      res.status(200).json({ success: false, error: result.error || "ROTA_TOTAL_INDISPONIVEL" });
      return;
    }

    res.status(200).json({
      success: true,
      progressPct: result.progressPct,
      traveledKm: result.traveledKm,
      totalKm: result.totalKm,
      remainingKm: result.remainingKm,
      etaMinutes: result.etaMinutes,
      etaLabel: etaLabelFromMinutes(result.etaMinutes),
      source: result.source || "directions",
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || "erro" });
  }
}
