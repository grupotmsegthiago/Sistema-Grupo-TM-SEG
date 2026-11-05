import type { SearchHit } from './multiEngineSearch';
import type { EmpresaDescobertaWeb } from './discoverWithGemini';
import { digitosCnpj, cnpjValido14 } from './cnpj';
import { GEMINI_TEXT_MODEL } from '../geminiModels';

const GEMINI_TIMEOUT_MS = Number(process.env.PARTNER_RADAR_GEMINI_TIMEOUT_MS || 40_000);

function extrairJsonArray(text: string): EmpresaDescobertaWeb[] {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] || raw).trim();
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: any) => ({
        company_name: String(row?.company_name || row?.razao_social || '').trim(),
        trade_name: String(row?.trade_name || row?.nome_fantasia || '').trim() || null,
        cnpj: row?.cnpj && cnpjValido14(row.cnpj) ? digitosCnpj(row.cnpj) : null,
        email: String(row?.email || '').trim().toLowerCase() || null,
        phone: String(row?.phone || row?.telefone || row?.whatsapp || '').trim() || null,
        website: String(row?.website || row?.site || '').trim() || null,
        city: String(row?.city || row?.cidade || '').trim() || null,
        state_uf: String(row?.state_uf || row?.uf || '').trim().toUpperCase().slice(0, 2) || null,
        notes: String(row?.notes || row?.resumo || '').trim() || null,
      }))
      .filter((r) => r.company_name.length >= 3);
  } catch {
    return [];
  }
}

/**
 * Extrai empresas a partir dos hits multimotor.
 * Tenta Gemini com timeout; se falhar, devolve [] (heurística fica no worker).
 */
export async function extrairEmpresasComGeminiDosHits(
  hits: SearchHit[],
  alvo: { cidade: string; uf: string; estado?: string },
): Promise<{ empresas: EmpresaDescobertaWeb[]; usedGemini: boolean; error?: string }> {
  if (!hits.length) return { empresas: [], usedGemini: false };

  const { isGeminiConfigured } = await import('../../server/geminiClient');
  if (!isGeminiConfigured()) {
    return { empresas: [], usedGemini: false, error: 'gemini_nao_configurado' };
  }

  const bloco = hits
    .slice(0, 20)
    .map(
      (h, i) =>
        `${i + 1}. [${h.engine}] ${h.title}\nURL: ${h.url}\nTrecho: ${h.snippet}`,
    )
    .join('\n\n');

  const prompt = `Você analisa resultados de busca sobre escolta armada / segurança privada em ${alvo.cidade}/${alvo.uf}.

A partir dos resultados abaixo, extraia empresas REAIS (não portais genéricos como Google, Facebook, Wikipedia, Reclame Aqui).
Para cada uma: nome, telefone/WhatsApp se houver, e-mail se houver, site se houver, CNPJ só se aparecer com 14 dígitos (senão null).
NÃO invente CNPJ nem telefone.

Resultados:
${bloco}

Responda APENAS JSON array (máx. 10):
[{"company_name":"","trade_name":null,"cnpj":null,"email":null,"phone":null,"website":null,"city":"${alvo.cidade}","state_uf":"${alvo.uf}","notes":""}]`;

  try {
    const { generateGeminiContent } = await import('../../server/geminiClient');
    const response = await Promise.race([
      generateGeminiContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: { temperature: 0.1, maxOutputTokens: 3072 },
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`gemini_timeout_${GEMINI_TIMEOUT_MS}ms`)), GEMINI_TIMEOUT_MS),
      ),
    ]);
    const text = String((response as any)?.text || '');
    const empresas = extrairJsonArray(text).map((e) => ({
      ...e,
      city: e.city || alvo.cidade,
      state_uf: e.state_uf || alvo.uf,
    }));
    return { empresas, usedGemini: true };
  } catch (e: any) {
    return { empresas: [], usedGemini: false, error: e?.message || 'gemini_falhou' };
  }
}

export { extrairJsonArray };
