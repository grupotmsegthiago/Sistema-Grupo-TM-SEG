import type { HealthEndpointDef } from '../types.js';

/** Health checks já existentes — apenas consumir (Fase 2). */
export const EXISTING_HEALTH_ENDPOINTS: HealthEndpointDef[] = [
  { id: 'hc-app', label: 'API Health', path: '/api/health', moduleId: 'mod-infra' },
  { id: 'hc-version', label: 'Versão / Build', path: '/api/version', moduleId: 'mod-infra' },
  { id: 'hc-gemini', label: 'Gemini', path: '/api/gemini/health', moduleId: 'mod-gemini' },
  { id: 'hc-zapi', label: 'Z-API', path: '/api/zapi/health', moduleId: 'mod-whatsapp' },
  { id: 'hc-email', label: 'E-mail SMTP', path: '/api/email/health', moduleId: 'mod-email', requiresAuth: true },
  { id: 'hc-asaas', label: 'Asaas', path: '/api/asaas/status', moduleId: 'mod-asaas', requiresAuth: true },
  { id: 'hc-supabase', label: 'Supabase health-check', path: '/api/supabase/health-check', moduleId: 'mod-infra', requiresAuth: true },
  { id: 'hc-rh', label: 'RH', path: '/api/rh/health', moduleId: 'mod-rh', requiresAuth: true },
  {
    id: 'hc-invest',
    label: 'Gestão Investimento',
    path: '/api/gestao-investimento/health',
    moduleId: 'mod-investimentos',
  },
  {
    id: 'hc-diagnostics',
    label: 'Diagnóstico de integrações',
    path: '/api/system/diagnostics',
    moduleId: 'mod-infra',
    requiresAuth: true,
  },
];
