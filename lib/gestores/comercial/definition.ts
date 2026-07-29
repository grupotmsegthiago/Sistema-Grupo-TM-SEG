import type { GestorDefinition } from '../types';

/** Definição do Gestor Comercial — screens do menu Diretoria */
export const GESTOR_COMERCIAL_DEF: GestorDefinition = {
  key: 'comercial',
  name: 'Gestor Comercial IA',
  description: 'Centro de Inteligência Comercial do Grupo TM SEG',
  screenPrefix: 'gc-',
  homeScreen: 'gc-dashboard',
  screens: [
    { id: 'gc-dashboard', name: 'Gestor Comercial IA' },
    { id: 'gc-intelligence', name: 'Inteligência Comercial' },
    { id: 'gc-goals', name: 'Metas' },
    { id: 'gc-commissions', name: 'Comissões' },
    { id: 'gc-ranking', name: 'Ranking Comercial', diretoriaOnly: true },
    { id: 'gc-client-health', name: 'Saúde dos Clientes' },
    { id: 'gc-pipeline', name: 'Pipeline Inteligente' },
    { id: 'gc-agenda', name: 'Agenda Inteligente' },
    { id: 'gc-meetings', name: 'Reuniões' },
    { id: 'gc-reps', name: 'Cadastro Comercial', diretoriaOnly: true },
    { id: 'gc-settings', name: 'Configurações Comerciais', diretoriaOnly: true },
    { id: 'gc-permissions', name: 'Controle de Permissões', diretoriaOnly: true },
    { id: 'gc-client-card', name: 'Ficha do Cliente' },
  ],
};

export const GC_NAV_CHILDREN = GESTOR_COMERCIAL_DEF.screens
  .filter((s) =>
    [
      'gc-dashboard',
      'gc-intelligence',
      'gc-goals',
      'gc-commissions',
      'gc-ranking',
      'gc-client-health',
      'gc-settings',
      'gc-permissions',
    ].includes(s.id),
  )
  .map((s) => ({ name: s.name, id: s.id }));

/** Screens acessíveis ao perfil comercial (escopado) */
export const GC_COMERCIAL_ALLOWED_SCREENS = new Set([
  'gc-dashboard',
  'gc-intelligence',
  'gc-goals',
  'gc-commissions',
  'gc-client-health',
  'gc-pipeline',
  'gc-agenda',
  'gc-meetings',
  'gc-client-card',
]);
