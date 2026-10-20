export type TemaCaminhao = 'dhl' | 'ceva' | 'ibl' | 'tmseg';

export interface VisualCaminhao {
  tema: TemaCaminhao;
  logo: string | null;
  rotulo: string;
}

/** Escolhe só a marca visual. Não inventa placa, modelo nem identificação de veículo. */
export function resolverVisualCaminhao(cliente: string): VisualCaminhao {
  const nome = (cliente || '').toUpperCase();
  if (nome.includes('DHL')) {
    return { tema: 'dhl', logo: '/logo-dhl.svg', rotulo: 'DHL' };
  }
  if (nome.includes('CEVA')) {
    return { tema: 'ceva', logo: '/logo_ceva_portal.png', rotulo: 'CEVA' };
  }
  if (nome.includes('IBL')) {
    return { tema: 'ibl', logo: '/logo_ibl_portal.png', rotulo: 'IBL' };
  }
  return { tema: 'tmseg', logo: null, rotulo: 'TM SEG' };
}