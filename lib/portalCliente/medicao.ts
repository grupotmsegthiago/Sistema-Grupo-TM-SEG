/** Decisão do cliente sobre a medição da OS. Vale para CEVA, IBL e portal genérico. */

export const ITENS_MEDICAO = [
  'Franquia hora',
  'Franquia km',
  'Km rodado',
  'Km excedente',
  'Horas trabalhadas',
  'Horas excedentes',
  'R$ horas excedentes',
  'R$ km excedente',
  'R$ acionamento',
  'Pedágio',
  'R$ total',
  'Local',
  'Serviço',
] as const;

export const EMAIL_FINANCEIRO_MEDICAO = 'financeiro@grupotmseg.com.br';

export type StatusMedicao = 'aprovado' | 'conferir' | 'modificado';

export type MedicaoCliente = {
  status: StatusMedicao;
  itens: string[];
  justificativa: string | null;
  modificadoEm: string | null;
};

export function itensConferir(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const permitidos = new Set<string>(ITENS_MEDICAO);
  const escolhidos = valor.map((item) => String(item || '').trim()).filter((item) => permitidos.has(item));
  return [...new Set(escolhidos)];
}

export function validarConferir(input: { itens: unknown; justificativa: unknown }): { ok: true; itens: string[]; justificativa: string } | { ok: false; erro: string } {
  const itens = itensConferir(input.itens);
  const justificativa = String(input.justificativa || '').trim();
  if (itens.length === 0) return { ok: false, erro: 'Selecione o que não foi aprovado.' };
  if (justificativa.length < 8) return { ok: false, erro: 'Escreva a justificativa com pelo menos 8 caracteres.' };
  return { ok: true, itens, justificativa };
}

export function medicaoDaLinha(row: { status?: unknown; itens?: unknown; justificativa?: unknown; modificado_em?: unknown } | null | undefined): MedicaoCliente | null {
  const status = String(row?.status || '');
  if (status !== 'aprovado' && status !== 'conferir' && status !== 'modificado') return null;
  return {
    status,
    itens: itensConferir(row?.itens),
    justificativa: String(row?.justificativa || '').trim() || null,
    modificadoEm: row?.modificado_em ? String(row.modificado_em) : null,
  };
}

export function textoEmailConferir(input: {
  os: string;
  cliente: string;
  autor: string;
  itens: string[];
  justificativa: string;
  detalhes: string[];
}): string {
  const linhas = [
    `O cliente pediu para conferir a medição da OS GTM-${input.os}.`,
    `Cliente: ${input.cliente}`,
    `Quem pediu: ${input.autor}`,
    '',
    'Não aprovou:',
    ...input.itens.map((item) => `- ${item}`),
    '',
    'Justificativa:',
    input.justificativa,
    '',
    'Medição apresentada:',
    ...input.detalhes,
  ];
  return linhas.join('\n');
}
