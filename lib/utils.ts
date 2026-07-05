
export const extractCoordinates = (url: string): { lat: number; lng: number } | null => {
  if (!url) return null;

  // 1. Formato Padrão: @-23.5505,-46.6333
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }

  // 2. Formato Search/Place: /search/-23.5505,-46.6333
  const searchMatch = url.match(/search\/(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (searchMatch) {
    return { lat: parseFloat(searchMatch[1]), lng: parseFloat(searchMatch[2]) };
  }

  // 3. Formato Embed/Preview: !3d-23.5505!4d-46.6333
  const embedMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (embedMatch) {
    return { lat: parseFloat(embedMatch[1]), lng: parseFloat(embedMatch[2]) };
  }

  // 4. Formato Query param: ?q=-23.5505,-46.6333
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  }

  // 5. Formato LL param: &ll=-23.5505,-46.6333
  const llMatch = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (llMatch) {
    return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
  }

  return null;
};

export const isCoordsFallback = (text: string): boolean => {
  return /^LAT\s*-?\d+\.\d+,?\s*LNG\s*-?\d+\.\d+$/i.test(text.trim());
};

export const resolveLocationDisplay = (currentLocation: string, mapLink?: string): { displayText: string; isLink: boolean; needsGeocode: boolean; coords: { lat: number; lng: number } | null } => {
  const loc = (currentLocation || '').trim();
  const isGoogleLink = /^https?:\/\/(www\.)?google\.com\/maps/i.test(loc) || /maps\?q=/i.test(loc);
  
  if (isGoogleLink) {
    const coords = extractCoordinates(loc);
    return { displayText: '', isLink: true, needsGeocode: true, coords };
  }

  if (!loc && mapLink) {
    const coords = extractCoordinates(mapLink);
    if (coords) {
      return { displayText: '', isLink: true, needsGeocode: true, coords };
    }
  }

  const parts = loc.split('|');
  const locationPart = parts.length > 1 ? parts[parts.length - 1].trim() : loc.trim();
  
  if (!locationPart || locationPart === 'Solicitação Criada' || locationPart === 'AUTO CARGA BLOQUEADO') {
    return { displayText: '', isLink: false, needsGeocode: false, coords: null };
  }

  if (isCoordsFallback(locationPart)) {
    const latMatch = locationPart.match(/LAT\s*(-?\d+\.\d+)/i);
    const lngMatch = locationPart.match(/LNG\s*(-?\d+\.\d+)/i);
    if (latMatch && lngMatch) {
      return { displayText: '', isLink: true, needsGeocode: true, coords: { lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1]) } };
    }
  }

  const isAlsoLink = /^https?:\/\//i.test(locationPart);
  if (isAlsoLink) {
    const coords = extractCoordinates(locationPart);
    return { displayText: '', isLink: true, needsGeocode: true, coords };
  }

  const cleaned = locationPart.replace(/\s*-?\s*BRASIL$/i, '').replace(/,\s*$/, '').trim();
  return { displayText: cleaned, isLink: false, needsGeocode: false, coords: null };
};

// Fórmula de Haversine para calcular distância em KM entre dois pontos
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Raio da Terra em km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distância em km
  return distance;
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

// Nova função de normalização de nomes de fornecedores (Nome Fantasia)
export const formatProviderName = (rawName: string, tradingName?: string): string => {
  // Se já tiver Nome Fantasia no banco, usa ele direto
  if (tradingName && tradingName.trim().length > 0 && tradingName.trim() !== 'null') {
      return tradingName.toUpperCase().trim();
  }
  
  if (!rawName) return '';

  let clean = rawName.toUpperCase();

  // Lista de sufixos e termos para remover
  const termsToRemove = [
    ' LTDA', ' S/A', ' S.A.', ' ME', ' EPP', ' EIRELI',
    ' SEGURANÇA', ' SEGURANCA', 
    ' VIGILANCIA', ' VIGILÂNCIA',
    ' PATRIMONIAL', 
    ' SERVIÇOS', ' SERVICOS', 
    ' PRIVADA', 
    ' TRANSPORTES', ' TRANSPORTE'
  ];

  termsToRemove.forEach(term => {
    // Remove todas as ocorrências
    clean = clean.split(term).join('');
  });

  // Formata estado: " - MG" para " (MG)"
  clean = clean.replace(/\s-\s([A-Z]{2})$/, ' ($1)');

  // Remove pontuação final e espaços extras
  return clean.replace(/[.,-]$/, '').trim();
};
