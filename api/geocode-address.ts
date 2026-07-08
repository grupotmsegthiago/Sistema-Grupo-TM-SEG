type GeoResult = {
  success: boolean;
  address?: string;
  location?: { lat: number; lng: number };
  source?: string;
  error?: string;
};

const PUBLIC_GOOGLE_MAPS_KEY = "AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k";

async function geocodeWithGoogle(address: string): Promise<GeoResult | null> {
  const keys = Array.from(new Set([
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    PUBLIC_GOOGLE_MAPS_KEY,
  ].map((key) => String(key || "").trim()).filter(Boolean)));

  for (const key of keys) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
      const first = data.results[0];
      return {
        success: true,
        address: first.formatted_address,
        location: first.geometry.location,
        source: "google",
      };
    }
  }
  return null;
}

async function geocodeWithNominatim(address: string): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(address)}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "TMSEG/1.0 (contato@grupotmseg.com.br)",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  });
  const data: any = await resp.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.lat || !first?.lon) return null;
  return {
    success: true,
    address: first.display_name,
    location: { lat: Number(first.lat), lng: Number(first.lon) },
    source: "nominatim",
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "method_not_allowed" });
    return;
  }

  const address = String(req.query?.address || "").trim();
  if (address.length < 3) {
    res.status(400).json({ success: false, error: "address obrigatório" });
    return;
  }

  try {
    const result = await geocodeWithGoogle(address) || await geocodeWithNominatim(address);
    if (!result) {
      res.status(404).json({ success: false, error: "Nenhum resultado encontrado" });
      return;
    }
    res.status(200).json(result);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || "Erro ao geocodificar endereço" });
  }
}

