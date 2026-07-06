const PUBLIC_GOOGLE_MAPS_KEY = "AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k";

function googleMapsKeys(): string[] {
  return Array.from(new Set([
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    PUBLIC_GOOGLE_MAPS_KEY,
  ].map((key) => String(key || "").trim()).filter(Boolean)));
}

async function fetchMatrix(key: string, origins: string, destinations: string) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=driving&units=metric&language=pt-BR&region=br&departure_time=now&key=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  return resp.json();
}

function etaLabelFromMinutes(etaMinutes: number | null): string {
  if (!etaMinutes) return "—";
  const h = Math.floor(etaMinutes / 60);
  const m = etaMinutes % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

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
    let lastError = "ROTA_TOTAL_INDISPONIVEL";
    for (const key of googleMapsKeys()) {
      const [legAC, legBC] = await Promise.all([
        fetchMatrix(key, origin, `${current}|${destination}`),
        fetchMatrix(key, current, destination),
      ]);

      const elAB = legAC?.rows?.[0]?.elements?.[0];
      const elAC = legAC?.rows?.[0]?.elements?.[1];
      const elBC = legBC?.rows?.[0]?.elements?.[0];
      if (legAC?.error_message || legAC?.status) lastError = legAC?.error_message || legAC?.status;
      if (legBC?.error_message || legBC?.status) lastError = legBC?.error_message || legBC?.status;
      if (elAC?.status && elAC.status !== "OK") lastError = elAC.status;
      if (legAC?.status !== "OK" || elAC?.status !== "OK" || !elAC.distance?.value) continue;

      const totalKm = Math.round((elAC.distance.value / 1000) * 10) / 10;
      let traveledKm = 0;
      let remainingKm = totalKm;
      let etaMinutes: number | null = null;

      if (elAB?.status === "OK" && elAB.distance?.value != null) {
        traveledKm = Math.round((elAB.distance.value / 1000) * 10) / 10;
      }
      if (elBC?.status === "OK" && elBC.distance?.value != null) {
        remainingKm = Math.round((elBC.distance.value / 1000) * 10) / 10;
        const durSec = elBC.duration_in_traffic?.value ?? elBC.duration?.value;
        if (durSec) etaMinutes = Math.max(1, Math.round(durSec / 60));
      } else if (totalKm > traveledKm) {
        remainingKm = Math.round((totalKm - traveledKm) * 10) / 10;
      }

      traveledKm = Math.min(traveledKm, totalKm);
      const progressPct = totalKm > 0 ? Math.min(100, Math.max(0, Math.round((traveledKm / totalKm) * 100))) : 0;
      res.status(200).json({
        success: true,
        progressPct,
        traveledKm,
        totalKm,
        remainingKm,
        etaMinutes,
        etaLabel: etaLabelFromMinutes(etaMinutes),
        source: "google",
      });
      return;
    }

    res.status(200).json({ success: false, error: lastError });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || "erro" });
  }
}

