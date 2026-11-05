/** Tipos do Radar de Parceiros (prospecção). Não misturar com ProviderData. */

export const PARTNER_PROSPECT_STATUSES = [
  'radar',
  'email_enviado',
  'em_negociacao',
  'tabela_recebida',
  'homologacao',
  'ativo',
  'descartado',
] as const;

export type PartnerProspectStatus = (typeof PARTNER_PROSPECT_STATUSES)[number];

export const PARTNER_PROSPECT_SOURCES = [
  'receita_federal',
  'policia_federal',
  'google',
  'csv',
  'manual',
  'robo_24h',
] as const;

export type PartnerProspectSource = (typeof PARTNER_PROSPECT_SOURCES)[number];

export const PARTNER_PF_STATUSES = ['regular', 'pendente', 'nao_verificado'] as const;
export type PartnerPfStatus = (typeof PARTNER_PF_STATUSES)[number];

export const PARTNER_ENRICHMENT_STATUSES = ['pending', 'partial', 'complete', 'failed'] as const;
export type PartnerEnrichmentStatus = (typeof PARTNER_ENRICHMENT_STATUSES)[number];

export interface PartnerProspect {
  id: string;
  /** 14 dígitos ou null = Pendente de CNPJ. */
  cnpj: string | null;
  company_name: string;
  trade_name?: string | null;
  state_uf?: string | null;
  city?: string | null;
  email?: string | null;
  emails?: string[] | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_district?: string | null;
  address_cep?: string | null;
  address_full?: string | null;
  contact_name?: string | null;
  pf_authorization_number?: string | null;
  pf_status: PartnerPfStatus;
  status: PartnerProspectStatus;
  source: PartnerProspectSource;
  notes?: string | null;
  email_sent_at?: string | null;
  email_subject?: string | null;
  document_url?: string | null;
  alvara_validity?: string | null;
  provider_id?: string | null;
  cnpj_verified_at?: string | null;
  enrichment_status?: PartnerEnrichmentStatus | null;
  last_enrichment_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PartnerProspectInput {
  cnpj: string;
  company_name: string;
  trade_name?: string;
  state_uf?: string;
  city?: string;
  email?: string;
  phone?: string;
  website?: string;
  contact_name?: string;
  pf_authorization_number?: string;
  pf_status?: PartnerPfStatus;
  source?: PartnerProspectSource;
  notes?: string;
}

/** Colunas do Kanban (esteira após sair do Radar). */
export const KANBAN_COLUMNS: { id: PartnerProspectStatus; label: string }[] = [
  { id: 'email_enviado', label: 'Apresentação enviada' },
  { id: 'em_negociacao', label: 'Em negociação' },
  { id: 'tabela_recebida', label: 'Tabela recebida' },
  { id: 'homologacao', label: 'Compliance / Homologação' },
];
