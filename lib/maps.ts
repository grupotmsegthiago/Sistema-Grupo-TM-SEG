
import { Libraries } from '@react-google-maps/api';

/**
 * Bibliotecas essenciais para o funcionamento do TMSEGo
 * Mantido como array constante para evitar re-renderizações e re-loads
 */
export const libraries: Libraries = ['places', 'geometry'];

/**
 * Chave de API do Google Cloud (Maps JavaScript API e Places API).
 */
const STABLE_GOOGLE_MAPS_KEY = 'AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k';
export const googleMapsApiKey = ((import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || STABLE_GOOGLE_MAPS_KEY).trim();

/**
 * Configuração padrão ÚNICA para useLoadScript.
 * O Google Maps falha se houver qualquer divergência nestes campos entre componentes.
 */
export const googleMapsLoadConfig = {
    googleMapsApiKey,
    libraries,
    language: 'pt-BR',
    region: 'BR'
};

if (!googleMapsApiKey) {
  console.error("TMSEGo: API KEY DO MAPA (GOOGLE CLOUD) AUSENTE!");
}
