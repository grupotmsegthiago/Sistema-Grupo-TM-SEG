
export enum MissionStatus {
  SOLICITED = 'Solicitada',
  DOCUMENTATION = 'Documentação',
  SCHEDULED = 'Agendada',
  ORIGIN = 'Origem',
  IN_TRANSIT = 'Em Viagem',
  PENDING = 'Pendente',
  COMPLETED = 'Concluída',
  CANCELLED = 'Cancelada',
  REFUSED = 'Recusada'
}

export interface ClientVehicleData {
  plate: string;
  brand: string;
  model: string;
  year: string;
  color: string;
}

export interface Mission {
  id: string; 
  client: string;
  originalClientName?: string; 
  provider: string;
  origin: string;
  destination: string;
  vehicleType: string;
  vehicleId: string;
  clientVehicle: ClientVehicleData;
  clientVehicle2?: ClientVehicleData;
  vehicle?: Vehicle;
  vehicleData?: Vehicle;
  driver_name?: string; 
  driver_phone?: string; 
  driver_name_2?: string;
  driver_phone_2?: string;
  status: MissionStatus;
  lastUpdate: string;
  updatedBy: string;
  createdAt: string;
  agent1?: string;
  agent2?: string;
  mission_type?: 'Caracterizada' | 'Velada' | 'Pronta Resposta';
  gr_espelhamento?: string;
  mirroring_evidence_url?: string;
  special_operation_type?: string; 
  is_same_os?: boolean;
  parent_mission_id?: string; 

  totalDistance?: number; 
  traveledDistance?: number; 
  progress?: number; 
  currentLocation?: string; 
  mapLink?: string; 

  startKm?: number;
  startTime?: string;
  endKm?: number;
  endTime?: string;
  estimatedTime?: string;

  revenue_value?: number; 
  cost_value?: number;    
  toll_value?: number;
  toll_value_provider?: number;
  displacement_value?: number;
  displacement_value_provider?: number;

  provider_start_km?: number;
  provider_end_km?: number;
  provider_start_time?: string;
  provider_end_time?: string;
  provider_ops_edited?: boolean;

  revenue_edit_reason?: string;
  cost_edit_reason?: string;
  
  billing_approved?: boolean;
  billing_verified_by?: string;

  vendor_os_number?: string;
  invoice_number?: string;
  payment_date?: string;
  verified_by?: string;
  verified_at?: string;

  email_pending_client?: boolean;
  email_pending_provider?: boolean;

  reference_number?: string;
  billing_release?: string;
  dhl_se_number?: string;
  dhl_sm_number?: string;

  // Controles manuais do Boletim de Medição (não afetam o sistema):
  // - billing_period_override: data alternativa usada pelo boletim em vez de start_time.
  // - exclude_from_billing: se true, OS é escondida de TODOS os boletins.
  billing_period_override?: string | null;
  exclude_from_billing?: boolean;
}

export interface MissionHistory {
  id: number;
  mission_id: string;
  changed_at: string;
  changed_by: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
}

export interface AccessProfile {
  id: string;
  name: string;
  description: string;
  permissions?: string[]; 
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  profileId?: string;
  profileName?: string;
  clientId?: string;
  clientName?: string;
  providerId?: string;
  providerName?: string;
  userType?: 'internal' | 'client' | 'provider';
  status: 'Ativo' | 'Inativo';
  lastAccess: string;
  avatarUrl?: string;
  force_password_change?: boolean;
  permissions?: string[];
}

export enum VehicleStatus {
  Ativo = 'Ativo',
  Manutenção = 'Manutenção',
  Inativo = 'Inativo'
}

export interface Vehicle {
  id: string;
  plate: string;
  brand?: string;
  model: string;
  year: string;
  provider: string; 
  status: VehicleStatus;
  type: string;
  color?: string;
  tracker_type?: string; 
  tracker_id?: string;   
}

export interface VehicleTechnology {
  id: string;
  name: string;
  created_at: string;
}

export interface Client {
  id: string;
  name: string; 
  trading_name?: string; 
  cnpj: string;
  rg_ie?: string;
  contactName: string;
  email: string;
  phone: string;
  status: 'Ativo' | 'Inativo';
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  address: string;
  whatsapp_group_id?: string; 
  full_extra_hour_after_16_min?: boolean;
  adjustment_2026_applied?: boolean;
  proposal_2026_sent?: boolean;
  created_at?: string;
  created_by?: string;
  is_prospect?: boolean;
}

export interface ProviderData {
  id: string;
  name: string;
  trading_name?: string; 
  cnpj: string;
  type: 'Escolta Caracterizada' | 'Pronta Resposta' | 'Moto Velada';
  contactName: string;
  status: 'Ativo' | 'Bloqueado' | 'Alvará Vencido';
  vehicleCount?: number;
  agentCount?: number;
  address?: string;
  city?: string;
  state?: string;
  alvaraValidity?: string; 
  alvaraUrl?: string;
  /** Grupo WhatsApp vinculado (mesmo padrão de clients.whatsapp_group_id). */
  whatsapp_group_id?: string;
  dhl_channel_preference?: 'email' | 'whatsapp' | 'both' | null;
  dhl_solicitation_email?: string | null;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  provider: string;
  status: 'Ativo' | 'Inativo' | 'Férias' | 'Bloqueado / Ação Trabalhista';
  cpf?: string;
  rg?: string; 
  phone?: string;
  cnh?: string;
  cnh_validity?: string; 
  cnv?: string;
  cnv_validity?: string;
}

export interface ClientVehicleDB {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  client: string;
  status?: 'Ativo' | 'Inativo';
  client_id?: number;
}

export interface ClientRoute {
  id: string;
  code?: string;
  name: string;
  origin: string;
  destination: string;
  distance: string;
  client: string;
  stops?: string[];
  toll_cost?: number;
}

export interface QuoteItem {
  uf: string;
  price_km: number;
  price_hour_extra: number;
  price_km_extra: number;
}

export interface ClientPriceTable {
  id: string;
  client: string;
  operation_type: string;
  activation_fee: number;
  franchise_hours: number;
  franchise_km: number;
  price_per_extra_km: number;
  price_per_extra_hour: number;
  price_per_preservation_hour?: number;
  cancellation_fee?: number;
  regional_costs?: QuoteItem[];
  previous_activation_fee?: number;
  previous_price_per_extra_km?: number;
  previous_price_per_extra_hour?: number;
  adjustment_status?: boolean;
  last_adjustment_date?: string;
}

export interface ProviderCostTable {
  id: string;
  provider: string;
  operation_type: string;
  activation_cost: number;
  franchise_hours: number;
  franchise_km: number;
  cost_per_extra_km: number;
  cost_per_extra_hour: number;
  cancellation_fee?: number; 
}

export interface Quote {
  id: string;
  client_id: number;
  client_name: string;
  origin: string;
  destination: string;
  total_km: number;
  total_hours: number;
  total_value: number;
  created_at: string;
  created_by: string;
  status: 'Rascunho' | 'Enviada' | 'Aprovada';
  items?: QuoteItem[]; 
  contract_details?: string;
}

export interface MissionLog {
  id: string;
  mission_id: string;
  created_at: string;
  updated_by: string;
  description: string;
  map_link?: string;
}

export interface SystemLog {
  id: string;
  created_at: string;
  user_name: string;
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'HEARTBEAT' | 'OTHER';
  entity: string;
  entity_id: string;
  details: string;
}

export type TransactionType = 'INCOME' | 'EXPENSE';
export type TransactionStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'SCHEDULED' | 'OVERDUE' | 'PARTIALLY_PAID';

export interface FinancialAccount {
  id: string;
  name: string; 
  initial_balance: number; 
  bank_name?: string;
  account_number?: string;
  status: 'Ativo' | 'Inativo';
}

export interface FinancialCategory {
  id: string;
  name: string;
  type: TransactionType;
  is_deduction: boolean; 
  group: 'RECEITA_BRUTA' | 'DEDUCOES' | 'CUSTOS_VARIAVEIS' | 'DESPESAS_FIXAS' | 'INVESTIMENTOS' | 'NAO_OPERACIONAL';
  recurrence_type?: 'FIXA' | 'VARIAVEL' | 'EVENTUAL'; 
  tag?: 'IMPOSTO' | 'CARTAO_CREDITO' | 'INVESTIMENTO' | 'PESSOAL' | 'OPERACIONAL' | 'OUTROS'; 
  scope?: 'EMPRESA' | 'PESSOAL'; 
}

export type FinancialDocStatus = 'empty' | 'pending' | 'ok' | 'issue';

export interface FinancialTransaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
  due_date: string;
  payment_date?: string;
  category_id: string;
  category_name?: string; 
  account_id?: string; 
  account_name?: string; 
  entity_type?: 'Client' | 'Provider' | 'Other' | 'Personal'; 
  entity_id?: string;
  entity_name?: string; 
  created_at: string;
  created_by: string;
  updated_by?: string; 
  notes?: string;
  status_conciliacao?: 'PENDENTE' | 'CONCILIADO' | 'DIVERGENTE';
  payment_method?: 'PIX' | 'BOLETO' | 'TRANSFERENCIA' | null;
  /** Soma dos pagamentos recebidos (Contas a Receber). */
  amount_paid?: number | null;
  /** Saldo em aberto (amount - amount_paid). */
  amount_open?: number | null;
  doc_boleto_url?: string | null;
  doc_boleto_status?: FinancialDocStatus | null;
  doc_nf_url?: string | null;
  doc_nf_status?: FinancialDocStatus | null;
  doc_comprovante_url?: string | null;
  doc_comprovante_status?: FinancialDocStatus | null;
}

export interface BrandIdentity {
  companyName: string;
  mission: string;
  colors: {
    hex: string;
    name: string;
                usage: string;
  }[];
  typography: {
                headerFont: string;
                bodyFont: string;
                reasoning: string;
  };
  logoPrompt: string;
  secondaryMarkPrompt: string;
}

export interface SupportAgent {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  is_armed: boolean;
  is_24h: boolean;
  base_address: string;
  latitude: number;
  longitude: number;
  service_cities: string; 
  status: 'Ativo' | 'Pendente' | 'Bloqueado' | 'Bloqueado / Ação Trabalhista';
  distance?: number; 
  cost_value?: number; 
  pix_key?: string; 
  is_virtual?: boolean; 
  parent_agent_id?: string; 
  created_at?: string; 
}