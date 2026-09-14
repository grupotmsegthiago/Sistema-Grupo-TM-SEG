/** Catálogo de telas do menu — sem deps de Vite/env (seguro p/ testes Node). */

export interface NavItem {
  name: string;
  icon: string;
  id: string;
  children?: { name: string; id: string }[];
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'Página Inicial', icon: 'LayoutDashboard', id: 'dashboard' },
  {
    name: 'Diretoria',
    icon: 'Crown',
    id: 'diretoria-group',
    children: [
      { name: 'Cockpit Executivo', id: 'diretoria-cockpit' },
      { name: 'Faturamento', id: 'diretoria-faturamento' },
      { name: 'Comissões Comerciais', id: 'comissoes-comerciais' },
      { name: 'Gestão Investimento', id: 'gestao-investimento' },
      { name: 'Pendências de OS', id: 'os-analysis-pending' },
      { name: 'Relatório Geral', id: 'fin-report' },
    ],
  },
  { 
    name: 'Monitoramento', 
    icon: 'MapPin', 
    id: 'monitoring-group',
    children: [
      { name: 'Painel de OS', id: 'missions' },
      { name: 'Passagem de Plantão', id: 'shift-handover' },
      { name: 'Relatório de OS', id: 'mission-report' },
      { name: 'Ranking DHL', id: 'ranking-dhl' },
      { name: 'Fornecedor', id: 'provider-activation-map' },
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
      { name: 'Mapa de Acionamento', id: 'provider-activation-map' },
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
