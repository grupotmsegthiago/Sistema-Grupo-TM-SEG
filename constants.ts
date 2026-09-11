

// ==========================================
// VERSÃO DO SISTEMA
// ==========================================
export const APP_VERSION = "3.7.60";

// ==========================================
// CONFIGURAÇÕES DE RETENÇÃO (ESPAÇO EM BANCO)
// ==========================================
export const DATA_RETENTION = {
    LOGS_DAYS: 30,             // Manter logs por 30 dias
    BACKUP_INTERVAL_HRS: 6,    // Backup automático de patrimônio (cron maintenance)
    STORAGE_LIMIT_MB: 500,     // Limite do plano Free Supabase
};

// ==========================================
// CONFIGURAÇÕES DE CUSTOS ESTIMADOS (BRL)
// ==========================================
export const COST_ESTIMATES = {
    WDAPI_PER_CALL: 0.05,        // R$ 0,05 por consulta de placa
    GOOGLE_MAPS_ROUTING: 0.025,  // R$ 0,025 por calculo de rota/distância
    SUPABASE_ROW_STORAGE: 0.0001, // Estimativa por linha (armazenamento + IO)
    AI_GEMINI_FLASH: 0.01,       // Estimativa por prompt simples
    AI_GEMINI_PRO: 0.08,         // Estimativa por prompt complexo/imagem
};

// ==========================================
// CONFIGURAÇÕES DE API (WDAPI / API Placas)
// ==========================================
// Endpoint oficial documentado do provedor: wdapi2.com.br/consulta/{placa}/{token}
// (servidor nginx, sem Cloudflare). NÃO usar apiplacas.com.br/api.php: esse domínio
// fica atrás do Cloudflare e bloqueia chamada servidor→servidor com 403
// ("Just a moment..."). A consulta SEMPRE passa pelo proxy backend
// (/api/placa/lookup) — o navegador não recebe CORS do provedor.
// Use SEMPRE consultaUrl(placa) para montar a URL.
export const API_BRASIL_CONFIG = {
    BASE_URL: 'https://wdapi2.com.br/consulta',
    TOKEN: import.meta.env.VITE_WDAPI_TOKEN ?? '',
    MONTHLY_LIMIT: 20000,
    consultaUrl(placa: string): string {
        const p = encodeURIComponent((placa || '').trim().toUpperCase());
        return `${this.BASE_URL}/${p}/${encodeURIComponent(this.TOKEN)}`;
    }
};

// ==========================================
// CONFIGURAÇÃO API PEDÁGIO (RapidAPI - territorial/pedagio)
// ==========================================
export const TOLL_API_CONFIG = {
    BASE_URL: '/api/toll',
    RAPIDAPI_HOST: 'territorial-pedagio-v1.p.rapidapi.com',
    PROVIDER: 'RapidAPI Pedágio'
};

// ==========================================
// CONFIGURAÇÃO API WHATSAPP (Z-API)
// ==========================================
export const WHATSAPP_API_CONFIG = {
    INSTANCE_ID: import.meta.env.VITE_ZAPI_INSTANCE_ID ?? '',
    TOKEN: import.meta.env.VITE_ZAPI_TOKEN ?? '',
    CLIENT_TOKEN: import.meta.env.VITE_ZAPI_CLIENT_TOKEN ?? '',

    get BASE_URL() {
        return `https://api.z-api.io/instances/${this.INSTANCE_ID}/token/${this.TOKEN}/send-text`;
    },
    get SEND_IMAGE_URL() {
        return `https://api.z-api.io/instances/${this.INSTANCE_ID}/token/${this.TOKEN}/send-image`;
    },
    get GROUPS_URL() {
        return `https://api.z-api.io/instances/${this.INSTANCE_ID}/token/${this.TOKEN}/groups`;
    }
};

// ==========================================
// MENU DE NAVEGAÇÃO
// ==========================================
export type { NavItem } from './lib/navItems';
export { NAV_ITEMS } from './lib/navItems';
