import { generateContent } from '../../gemini';
import type { GcClientHealth, GcInsight, GcSettingsMap } from './types';

/** Insights determinísticos (regras) — sempre disponíveis sem IA */
export function buildRuleInsights(opts: {
  health: GcClientHealth[];
  settings: GcSettingsMap;
  hideStrategic?: boolean;
  max?: number;
}): GcInsight[] {
  const out: GcInsight[] = [];
  const max = opts.max ?? 40;

  for (const h of opts.health) {
    if (h.daysWithoutRevenue >= opts.settings.days_without_revenue) {
      out.push({
        scope: 'client',
        client_id: h.clientId,
        severity: 'critical',
        title: `${h.clientName} está há ${h.daysWithoutRevenue} dias sem faturar`,
        detail: 'Risco de churn / carteira inativa.',
        suggested_actions: [
          'Agendar visita ou call de relacionamento',
          'Revisar contrato e SLA',
          'Oferecer pronta resposta ou escolta sob demanda',
        ],
        source: 'rules',
      });
    }

    if (h.trend === 'down' && h.trendPct <= -20) {
      out.push({
        scope: 'client',
        client_id: h.clientId,
        severity: 'warning',
        title: `${h.clientName} reduziu ${Math.abs(h.trendPct).toFixed(0)}% o faturamento no período`,
        detail: 'Queda relevante de volume operacional.',
        suggested_actions: [
          'Agendar visita',
          'Revisar contrato',
          'Oferecer pronta resposta',
          'Oferecer escolta',
          'Oferecer novos serviços',
        ],
        source: 'rules',
      });
    }

    if (h.trend === 'up' && h.trendPct >= 30) {
      out.push({
        scope: 'client',
        client_id: h.clientId,
        severity: 'positive',
        title: `${h.clientName} aumentou ${h.trendPct.toFixed(0)}% o faturamento`,
        detail: 'Oportunidade de expansão de serviços.',
        suggested_actions: [
          'Propor pacote de serviços complementares',
          'Apresentar cobertura em novas rotas',
          'Revisar tabela com volume maior',
        ],
        source: 'rules',
      });
    }

    if (!opts.hideStrategic && h.marginPct > 0 && h.marginPct < opts.settings.min_margin_pct && h.yearlyRevenue > 0) {
      out.push({
        scope: 'client',
        client_id: h.clientId,
        severity: 'warning',
        title: `${h.clientName} com margem ${h.marginPct.toFixed(1)}% abaixo do mínimo (${opts.settings.min_margin_pct}%)`,
        detail: 'Rentabilidade pressionada — revisar precificação e custo operacional.',
        suggested_actions: [
          'Revisar tabela de preços',
          'Analisar custo do fornecedor nas rotas principais',
          'Negociar reajuste ou escopo',
        ],
        source: 'rules',
      });
    }

    if (!h.nextContactAt) {
      out.push({
        scope: 'client',
        client_id: h.clientId,
        severity: 'info',
        title: `${h.clientName} sem próximo contato agendado`,
        detail: 'Incluir na agenda inteligente para evitar esquecimento.',
        suggested_actions: ['Criar follow-up na agenda', 'Registrar reunião de check-in'],
        source: 'rules',
      });
    }

    if (out.length >= max) break;
  }

  return out.slice(0, max);
}

/**
 * Enriquece insights com Gemini — respeita escopo (não envia dados estratégicos se hideStrategic).
 */
export async function enrichInsightsWithAi(
  insights: GcInsight[],
  opts: { hideStrategic?: boolean; userName?: string },
): Promise<GcInsight[]> {
  if (!insights.length) return insights;
  const sample = insights.slice(0, 12).map((i) => ({
    title: i.title,
    detail: i.detail,
    actions: i.suggested_actions,
    severity: i.severity,
  }));

  const guard = opts.hideStrategic
    ? 'NÃO mencione lucro global, margem global nem dados de outros vendedores. Foque só na carteira do comercial.'
    : 'Pode sugerir análises de margem e rentabilidade por cliente.';

  const prompt = `Você é o Gestor Comercial IA do Grupo TM SEG (segurança patrimonial / escolta / pronta resposta).
Usuário: ${opts.userName || 'comercial'}.
${guard}
Com base nestes alertas JSON, reescreva cada um com 1 frase de diagnóstico + 3 ações práticas e específicas (serviços TM SEG).
Responda APENAS JSON array: [{"title":"...","detail":"...","suggested_actions":["...","...","..."]}].

Alertas:
${JSON.stringify(sample)}`;

  try {
    const text = await generateContent({
      contents: prompt,
      config: { maxOutputTokens: 2048, temperature: 0.3 },
    });
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return insights;
    const parsed = JSON.parse(match[0]) as Array<{
      title?: string;
      detail?: string;
      suggested_actions?: string[];
    }>;
    return insights.map((orig, idx) => {
      const p = parsed[idx];
      if (!p) return orig;
      return {
        ...orig,
        title: p.title || orig.title,
        detail: p.detail || orig.detail,
        suggested_actions: Array.isArray(p.suggested_actions) && p.suggested_actions.length
          ? p.suggested_actions
          : orig.suggested_actions,
        source: 'ai' as const,
      };
    });
  } catch {
    return insights;
  }
}

export async function summarizeMeetingWithAi(notes: string): Promise<{
  summary: string;
  decisions: string[];
  tasks: string[];
  score: number;
}> {
  const prompt = `Analise a ata/notas de reunião comercial da TM SEG.
Extraia: resumo (2-3 frases), decisões (lista), tarefas/follow-ups (lista), score 0-100 da evolução da negociação.
Responda JSON: {"summary":"...","decisions":[],"tasks":[],"score":0}

Notas:
${notes.slice(0, 8000)}`;

  try {
    const text = await generateContent({
      contents: prompt,
      config: { maxOutputTokens: 1500, temperature: 0.2 },
    });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no json');
    const parsed = JSON.parse(match[0]);
    return {
      summary: String(parsed.summary || ''),
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String) : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map(String) : [],
      score: Number(parsed.score) || 50,
    };
  } catch {
    return {
      summary: notes.slice(0, 280),
      decisions: [],
      tasks: ['Registrar follow-up manualmente'],
      score: 50,
    };
  }
}
