/** Tipos e checklist do autodeclaração de patrimônio (home office). */

export type PatrimonioComplianceStatus = 'pending' | 'declared' | 'completed';

export interface PatrimonioPhotoSlot {
  key: string;
  label: string;
}

export interface PatrimonioChecklistItem {
  type: string;
  label: string;
  photos: PatrimonioPhotoSlot[];
  fields: Array<'brand' | 'model' | 'serial_number' | 'chip_line' | 'notes'>;
}

export const PATRIMONIO_CHECKLIST: PatrimonioChecklistItem[] = [
  {
    type: 'notebook',
    label: 'Notebook',
    photos: [
      { key: 'device', label: 'Foto do notebook (visão geral)' },
      { key: 'serial', label: 'Foto do número de série' },
    ],
    fields: ['brand', 'model', 'serial_number'],
  },
  {
    type: 'chip',
    label: 'Chip / Linha telefônica',
    photos: [{ key: 'chip', label: 'Foto do chip ou etiqueta com o número' }],
    fields: ['chip_line'],
  },
  {
    type: 'celular',
    label: 'Celular corporativo',
    photos: [
      { key: 'device', label: 'Foto do aparelho' },
      { key: 'serial', label: 'Foto do IMEI / número de série' },
    ],
    fields: ['brand', 'model', 'serial_number'],
  },
  {
    type: 'tablet',
    label: 'Tablet',
    photos: [
      { key: 'device', label: 'Foto do tablet' },
      { key: 'serial', label: 'Foto do número de série' },
    ],
    fields: ['brand', 'model', 'serial_number'],
  },
  {
    type: 'desktop',
    label: 'Desktop / PC',
    photos: [
      { key: 'device', label: 'Foto do computador' },
      { key: 'serial', label: 'Foto do número de série' },
    ],
    fields: ['brand', 'model', 'serial_number'],
  },
  {
    type: 'monitor',
    label: 'Monitor',
    photos: [{ key: 'device', label: 'Foto do monitor' }],
    fields: ['brand', 'model', 'serial_number'],
  },
  {
    type: 'outro',
    label: 'Outro material',
    photos: [{ key: 'device', label: 'Foto do item' }],
    fields: ['brand', 'model', 'notes'],
  },
];

export interface PatrimonioDeclaredItemDraft {
  type: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  chip_line?: string;
  notes?: string;
  photo_urls: string[];
  photo_map?: Record<string, string>;
}

export interface PatrimonioComplianceResponse {
  required: boolean;
  status: PatrimonioComplianceStatus;
  declared_at?: string;
  contract_signed_at?: string;
  items_count: number;
  equipments?: import('./equipmentRecovery').EquipmentRecord[];
}
