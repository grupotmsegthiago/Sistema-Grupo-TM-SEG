type ReverseResult = {
  success: boolean;
  address?: string;
  fullAddress?: string;
  source?: string;
  error?: string;
};

const PUBLIC_GOOGLE_MAPS_KEY = "AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k";

function formatNominatimAddress(address: any): string {
  if (!address) return "";
  const road = address.road || address.pedestrian || address.footway || address.cycleway || "";
  const number = address.house_number || "";
  const suburb = address.suburb || address.neighbourhood || address.quarter || "";
  const city = address.city || address.town || address.village || address.municipality || "";
  const state = address.state || "";
  const parts = [
    [road, number].filter(Boolean).join(", "),
    suburb,
    city && state ? `${city}/${state}` : city || state,
  ].filter(Boolean);
  return parts.join(" - ");
}

async function reverseWithGoogle(lat: number, lng: number): Promise<ReverseResult | null> {
  const keys = Array.from(new Set([
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    PUBLIC_GOOGLE_MAPS_KEY,
  ].map((key) => String(key || "").trim()).filter(Boolean)));

  for (const key of keys) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data.status === "OK" && data.results?.[0]?.formatted_address) {
      return {
        success: true,
        address: data.results[0].formatted_address,
        fullAddress: data.results[0].formatted_address,
        source: "google",
      };
    }
  }
  return null;
}

async function reverseWithNominatim(lat: number, lng: number): Promise<ReverseResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "TMSEG/1.0 (contato@grupotmseg.com.br)",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  });
  const data: any = await resp.json();
  const formatted = formatNominatimAddress(data.address);
  if (!formatted && !data.display_name) return null;
  return {
    success: true,
    address: formatted || data.display_name,
    fullAddress: data.display_name,
    source: "nominatim",
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "method_not_allowed" });
    return;
  }

  const lat = Number(req.query?.lat);
  const lng = Number(req.query?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ success: false, error: "lat e lng são obrigatórios" });
    return;
  }

  try {
    const result = await reverseWithGoogle(lat, lng) || await reverseWithNominatim(lat, lng);
    if (!result) {
      res.status(404).json({ success: false, error: "Nenhum resultado encontrado" });
      return;
    }
    res.status(200).json(result);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || "Erro ao resolver coordenadas" });
  }
}

