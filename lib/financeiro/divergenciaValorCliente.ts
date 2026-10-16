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

function motivoDeDesconto(valor: unknown): boolean {
  const motivo = texto(valor);
  return motivo.includes('desconto') || motivo.includes('estorno');
}

export function compensacaoArtificial(partes: PartesValorOs): boolean {
  const custo = centavos(partes.custoServico);
  if (custo >= 0) return false;
  if (motivoDeDesconto(partes.motivoCusto) || motivoDeDesconto(partes.motivoReceita)) return false;
  const deslocamento = centavos(partes.deslocamentoFornecedor);
  const fornecedor = centavos(totalFornecedor(partes));
  return deslocamento > 0 && Math.abs(fornecedor) <= 1;
}
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
  if (compensacaoArtificial(partes)) {
    return {
      bloqueia: true,
      totalCliente: cliente,
      totalFornecedor: fornecedor,
      mensagem: `O serviço do fornecedor está negativo (${reais(partes.custoServico)}) só para anular o deslocamento. A gravação foi impedida. Desconto ou estorno legítimo precisa dessa palavra na justificativa.`,
    };
  }
  return { bloqueia: false, totalCliente: cliente, totalFornecedor: fornecedor, mensagem: '' };
}

export function divergenciaSnapshot(input: {
  receitaServico: number;
  pedagioCliente: number;
  deslocamentoCliente: number;
  snapshot?: { revenueServiceOnly?: unknown; displacementVal?: unknown; totalGeral?: unknown; tollVal?: unknown } | null;
}): { diverge: boolean; mensagem: string } {
  const cliente = centavos(input.receitaServico + input.pedagioCliente + input.deslocamentoCliente) / 100;
  const snap = input.snapshot;
  if (!snap) return { diverge: false, mensagem: '' };
  const totalSnap = centavos(Number(snap.totalGeral || 0)) / 100;
  const receitaSnap = centavos(Number(snap.revenueServiceOnly || 0)) / 100;
  const deslocSnap = centavos(Number(snap.displacementVal || 0)) / 100;
  if (Math.abs(centavos(totalSnap) - centavos(cliente)) > 1
    || Math.abs(centavos(receitaSnap) - centavos(input.receitaServico)) > 1
    || Math.abs(centavos(deslocSnap) - centavos(input.deslocamentoCliente)) > 1) {
    return {
      diverge: true,
      mensagem: `O snapshot (${reais(totalSnap)}) não confere com o valor salvo (${reais(cliente)}). A aprovação não propaga essa divergência.`,
    };
  }
  return { diverge: false, mensagem: '' };
}
