type MatrixResult = {
  success: boolean;
  distanceKm?: number;
  durationMin?: number | null;
  source?: string;
  error?: string;
};

const PUBLIC_GOOGLE_MAPS_KEY = "AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k";

function googleMapsKeys(): string[] {
  return Array.from(new Set([
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    PUBLIC_GOOGLE_MAPS_KEY,
  ].map((key) => String(key || "").trim()).filter(Boolean)));
}

async function queryDistanceMatrix(origin: string, destination: string): Promise<MatrixResult | null> {
  let lastError = "NO_RESULT";
  for (const key of googleMapsKeys()) {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&units=metric&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data?.error_message || data?.status) {
      lastError = data?.error_message || data?.status;
    }
    const el = data?.rows?.[0]?.elements?.[0];
    if (el?.status && el.status !== "OK") lastError = el.status;
    if (data?.status === "OK" && el?.status === "OK" && el.distance?.value) {
      return {
        success: true,
        distanceKm: Math.round((el.distance.value / 1000) * 100) / 100,
        durationMin: el.duration?.value ? Math.round(el.duration.value / 60) : null,
        source: "google",
      };
    }
  }
  return { success: false, error: lastError };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "method_not_allowed" });
    return;
  }

  const origin = String(req.query?.origin || "").trim();
  const destination = String(req.query?.destination || "").trim();
  if (!origin || !destination) {
    res.status(400).json({ success: false, error: "origin e destination são obrigatórios" });
    return;
  }

  try {
    const result = await queryDistanceMatrix(origin, destination);
    res.status(200).json(result);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || "erro" });
  }
}

