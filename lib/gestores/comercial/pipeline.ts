import type { GcPipelineStage } from './types';
import { GC_DEFAULT_SETTINGS } from './settings';

export const GC_PIPELINE_STAGES: Array<{ key: GcPipelineStage; label: string }> = [
  { key: 'lead', label: 'Lead' },
  { key: 'contato', label: 'Contato' },
  { key: 'qualificacao', label: 'Qualificação' },
  { key: 'reuniao', label: 'Reunião' },
  { key: 'proposta', label: 'Proposta' },
  { key: 'negociacao', label: 'Negociação' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'cliente_ativo', label: 'Cliente Ativo' },
];

export function defaultProbabilityForStage(
  stage: string,
  probs: Record<string, number> = GC_DEFAULT_SETTINGS.pipeline_probabilities,
): number {
  const v = probs[stage];
  return Number.isFinite(v) ? Number(v) : 10;
}

/**
 * Ajuste heurístico da probabilidade com base em comportamento
 * (sem chamar IA — usado como baseline; IA pode sobrescrever).
 */
export function adjustProbability(opts: {
  stage: string;
  daysInStage: number;
  hasRecentMeeting: boolean;
  hasOpenQuote: boolean;
  revenueTrendPct: number;
  probs?: Record<string, number>;
}): number {
  let base = defaultProbabilityForStage(opts.stage, opts.probs);
  if (opts.hasRecentMeeting) base += 5;
  if (opts.hasOpenQuote) base += 8;
  if (opts.revenueTrendPct > 10) base += 5;
  if (opts.revenueTrendPct < -20) base -= 10;
  if (opts.daysInStage > 45) base -= 15;
  else if (opts.daysInStage > 21) base -= 5;
  return Math.max(5, Math.min(100, Math.round(base)));
}
