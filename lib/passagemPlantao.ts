/** Resumo da passagem de plantão no formato enviado no grupo. */

export const PASSAGEM_LINHAS = [
  { status: 'NA ORIGEM', label: 'NA ORIGEM', icon: '📍' },
  { status: 'EM VIAGEM', label: 'EM VIAGEM', icon: '🚛' },
  { status: 'CANCELADA', label: 'CANCELADAS', icon: '🚫' },
  { status: 'RECUSADA', label: 'RECUSADAS', icon: '❌' },
  { status: 'PERNOITE', label: 'PERNOITE', icon: '🌙' },
  { status: 'FINALIZADO', label: 'FINALIZADAS', icon: '✅' },
  { status: 'AGENDADA', label: 'AGENDADAS', icon: '📅' },
] as const;

export type PassagemLinha = {
  status: string;
  label: string;
  icon: string;
  total: number;
};

export type PassagemPlantao = {
  linhas: PassagemLinha[];
  outros: number;
  total: number;
  texto: string;
};

export function buildPassagemPlantao(
  rows: { status?: string | null }[],
  dayLabel: string,
  author?: string,
): PassagemPlantao {
  const tally = new Map<string, number>();
  for (const row of rows) {
    const status = String(row.status || '').trim() || '—';
    tally.set(status, (tally.get(status) || 0) + 1);
  }

  const linhas = PASSAGEM_LINHAS.map((line) => ({
    status: line.status,
    label: line.label,
    icon: line.icon,
    total: tally.get(line.status) || 0,
  }));
  const known = new Set(PASSAGEM_LINHAS.map((line) => line.status));
  let outros = 0;
  for (const [status, total] of tally) {
    if (!known.has(status)) outros += total;
  }
  const total = linhas.reduce((sum, line) => sum + line.total, 0) + outros;

  const body = linhas.map((line) => `${line.icon} *${line.label}:* ${line.total}`);
  if (outros > 0) body.push(`📌 *OUTROS:* ${outros}`);
  const who = String(author || '').trim();
  const texto = [
    '*PASSAGEM DE PLANTÃO*',
    `*Grupo TM SEG* · ${dayLabel}${who ? ` · ${who}` : ''}`,
    '',
    ...body,
    '',
    `📊 *TOTAL:* ${total}`,
  ].join('\n');

  return { linhas, outros, total, texto };
}
