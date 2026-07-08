

// ==========================================
// VERSÃO DO SISTEMA
// ==========================================
export const APP_VERSION = "3.7.31";

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
export interface NavItem {
  name: string;
  icon: string;
  id: string;
  children?: { name: string; id: string }[];
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'Página Inicial', icon: 'LayoutDashboard', id: 'dashboard' },
  { 
    name: 'Monitoramento', 
    icon: 'MapPin', 
    id: 'monitoring-group',
    children: [
      { name: 'Painel de OS', id: 'missions' },
      { name: 'Passagem de Plantão', id: 'shift-handover' },
      { name: 'Relatório de OS', id: 'mission-report' },
      { name: 'Ranking DHL', id: 'ranking-dhl' },
    ]
  },
  { name: 'Rede de Apoio (QRF)', icon: 'Map', id: 'support-network' },
  {
    name: 'Financeiro',
    icon: 'Wallet', 
    id: 'finance-group',
    children: [
      { name: 'Dashboard Financeiro', id: 'fin-dashboard' },
      { name: 'Boletim de Medição', id: 'fin-billing' },
      { name: 'Movimento Diário', id: 'fin-daily-movement' },
      { name: 'Controle de Faturas / NF', id: 'fin-invoices' },
      { name: 'Contas a Pagar / Receber', id: 'fin-transactions' },
      { name: 'Relatório Geral (Diretoria)', id: 'fin-report' },
      { name: 'DRE Gerencial', id: 'fin-dre' },
      { name: 'Gerenciar Contas (Bancos)', id: 'fin-accounts' },
      { name: 'Categorias Financeiras', id: 'fin-categories' },
      { name: 'Controle OS Fornecedor', id: 'fin-vendor-verification' },
      { name: 'Tabelas DHL Fora do Padrão', id: 'fin-dhl-noncompliant' },
    ]
  },
  { 
    name: 'Cliente', 
    icon: 'Users', 
    id: 'clients-group',
    children: [
      { name: 'Cadastro de Cliente', id: 'clients' },
      { name: 'Gestão de Contratos', id: 'contract-manager' },
      { name: 'Cadastro de Usuário', id: 'client-users' },
      { name: 'Veículos (Carga)', id: 'client-vehicles' }, 
      { name: 'Cadastro de Rotas', id: 'client-routes' },
      { name: 'Propostas Comerciais', id: 'quotes' },
    ]
  },
  { 
    name: 'Fornecedor', 
    icon: 'Briefcase', 
    id: 'providers-group',
    children: [
      { name: 'Cadastro de Fornecedor', id: 'providers' },
      { name: 'Gestão de Alvarás', id: 'alvara-control' },
      { name: 'Cadastro de Usuário', id: 'provider-users' },
      { name: 'Cadastro de Viaturas', id: 'provider-vehicles' },
      { name: 'Cadastro de Agentes', id: 'provider-agents' },
      { name: 'Tecnologias (Rastreador)', id: 'provider-technologies' },
    ]
  },
  { name: 'Jurídico', icon: 'Scale', id: 'legal-dashboard' },
  {
    name: 'RH',
    icon: 'UserCog',
    id: 'rh-group',
    children: [
      { name: 'Dashboard', id: 'rh-dashboard' },
      { name: 'Funcionários', id: 'rh-employees' },
      { name: 'Folha de Ponto', id: 'rh-timeclock' },
    ],
  },
  { name: 'Relatórios', icon: 'FileBarChart', id: 'reports' },
  { 
    name: 'Configurações', 
    icon: 'Settings', 
    id: 'settings-group',
    children: [
      { name: 'Backup & Manutenção', id: 'db-maintenance' },
      { name: 'Otimização de Custos', id: 'cost-optimization' }, 
      { name: 'Equipe Interna', id: 'internal-users' },
      { name: 'Patrimônio & Equipamentos', id: 'equipment-manager' },
      { name: 'Perfis de Acesso', id: 'profiles' },
      { name: 'Configurações do Sistema', id: 'system-settings' },
      { name: 'Auditoria & Logs', id: 'system-logs' },
      { name: 'Status do Servidor', id: 'server-stats' },
    ]
  },
];
