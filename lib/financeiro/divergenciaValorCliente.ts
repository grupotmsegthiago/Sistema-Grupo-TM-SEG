/**
 * Impede que um "valor zero" grave deslocamento ou pedágio no cliente
 * sem uma justificativa de quem conferiu. Não altera OS já gravada.
 */

const MOTIVOS_AUTOMATICOS = [
  'valor zero confirmado',
  'zerado automaticamente',
  'aguardando definicao',
];

export type PartesValorOs = {
  status?: string | null;
  receitaServico: number;
  custoServico: number;
  pedagioCliente: number;
  pedagioFornecedor: number;
  deslocamentoCliente: number;
  deslocamentoFornecedor: number;
  motivoReceita?: string | null;
  motivoCusto?: string | null;
};

export type DivergenciaValorCliente = {
  bloqueia: boolean;
  totalCliente: number;
  totalFornecedor: number;
  mensagem: string;
};

function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function centavos(valor: number): number {
  return Math.round((Number(valor) || 0) * 100);
}

function texto(valor: unknown): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function totalCliente(partes: PartesValorOs): number {
  return centavos(partes.receitaServico + partes.pedagioCliente + partes.deslocamentoCliente) / 100;
}

export function totalFornecedor(partes: PartesValorOs): number {
  return centavos(partes.custoServico + partes.pedagioFornecedor + partes.deslocamentoFornecedor) / 100;
}

function motivoAutomatico(valor: unknown): boolean {
  const motivo = texto(valor).trim();
  if (!motivo) return true;
  return MOTIVOS_AUTOMATICOS.some((trecho) => motivo.includes(trecho));
}

/** Justificativa escrita por uma pessoa, diferente do carimbo automático de zero. */
export function conferenciaAutorizada(partes: PartesValorOs): boolean {
  const motivo = String(partes.motivoReceita || '').trim();
  return motivo.length >= 8 && !motivoAutomatico(motivo);
}

export function avaliarPropagacaoValorCliente(partes: PartesValorOs): DivergenciaValorCliente {
  const cliente = totalCliente(partes);
  const fornecedor = totalFornecedor(partes);
  const servicoZerado = centavos(partes.receitaServico) === 0;
  const temAdicional = centavos(partes.deslocamentoCliente) > 0 || centavos(partes.pedagioCliente) > 0;
  const zeroSemConferencia = motivoAutomatico(partes.motivoReceita) && motivoAutomatico(partes.motivoCusto);
  if (servicoZerado && temAdicional && cliente > 0 && zeroSemConferencia && !conferenciaAutorizada(partes)) {
    const fornecedorZerado = Math.abs(centavos(fornecedor)) === 0 && centavos(partes.custoServico) < 0;
    const complemento = fornecedorZerado
      ? ` O fornecedor aparece zerado porque o serviço ficou ${reais(partes.custoServico)}.`
      : '';
    return {
      bloqueia: true,
      totalCliente: cliente,
      totalFornecedor: fornecedor,
      mensagem: `O serviço do cliente está zerado, mas o total do cliente fica ${reais(cliente)} por causa do deslocamento ou do pedágio. A gravação foi impedida.${complemento} Zere esse adicional ou registre a justificativa da cobrança antes de aprovar.`,
    };
  }
  return { bloqueia: false, totalCliente: cliente, totalFornecedor: fornecedor, mensagem: '' };
}
