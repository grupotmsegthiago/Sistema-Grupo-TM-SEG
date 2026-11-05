import type { PartnerProspectStatus } from './types';

const TRANSICOES: Record<PartnerProspectStatus, PartnerProspectStatus[]> = {
  radar: ['email_enviado', 'descartado'],
  email_enviado: ['em_negociacao', 'tabela_recebida', 'homologacao', 'descartado'],
  em_negociacao: ['email_enviado', 'tabela_recebida', 'homologacao', 'descartado'],
  tabela_recebida: ['em_negociacao', 'homologacao', 'descartado'],
  homologacao: ['tabela_recebida', 'ativo', 'descartado'],
  ativo: [],
  descartado: ['radar'],
};

export function podeTransicionar(
  de: PartnerProspectStatus,
  para: PartnerProspectStatus,
): boolean {
  if (de === para) return true;
  return (TRANSICOES[de] || []).includes(para);
}

export function rotuloStatus(status: PartnerProspectStatus): string {
  switch (status) {
    case 'radar':
      return 'Radar';
    case 'email_enviado':
      return 'Apresentação enviada';
    case 'em_negociacao':
      return 'Em negociação';
    case 'tabela_recebida':
      return 'Tabela recebida';
    case 'homologacao':
      return 'Homologação';
    case 'ativo':
      return 'Ativo (homologado)';
    case 'descartado':
      return 'Descartado';
    default:
      return status;
  }
}
