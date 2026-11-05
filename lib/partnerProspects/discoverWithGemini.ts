import { digitosCnpj, cnpjValido14 } from './cnpj';
import { GEMINI_TEXT_MODEL } from '../geminiModels';
import type { GeoTarget, MicroTarget } from './geoMatrix';
import { montarQueriesBusca, montarQueriesMicro, rotuloMicroAlvo } from './geoMatrix';

/** Import dinâmico — evita o Vite puxar o cliente Gemini no bundle do browser. */
async function gerarComBusca(prompt: string) {
  const { generateGeminiContent } = await import('../../server/geminiClient');
  return generateGeminiContent({
    model: GEMINI_TEXT_MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      tools: [{ googleSearch: {} }],
    },
  });
}

export type EmpresaDescobertaWeb = {
  company_name: string;
  trade_name?: string | null;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  state_uf?: string | null;
  notes?: string | null;
};

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
        cnpj: row?.cnpj ? digitosCnpj(row.cnpj) : null,
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
 * Descoberta ativa: Gemini com Google Search grounding.
 * Sem scrape manual nem lista seed. CNPJ sem 14 dígitos fica null (BrasilAPI descarta depois).
 */
export async function descobrirEmpresasPorAlvo(target: GeoTarget): Promise<{
  empresas: EmpresaDescobertaWeb[];
  queries: string[];
  rawText?: string;
}> {
  const queries = montarQueriesBusca(target, 2);
  const prompt = `Você é um analista de prospecção B2B no Brasil, focado em escolta armada e segurança privada.

Use a ferramenta de busca do Google para pesquisar EXATAMENTE estas consultas (uma a uma se necessário):
${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Extraia empresas REAIS de escolta armada, transporte de valores ou vigilância/segurança privada em ${target.estado} (${target.uf}).
Priorize sites institucionais, listas empresariais e páginas de contacto.

Para cada empresa, preencha o JSON. Se o CNPJ aparecer no site/rodapé, inclua só dígitos (14). Se não tiver certeza do CNPJ, use null — NÃO invente CNPJ.
Telefone e WhatsApp: só números brasileiros encontrados. E-mail: preferir domínio próprio da empresa.

Responda APENAS um JSON array (máximo 12 itens) com o formato:
[
  {
    "company_name": "",
    "trade_name": "",
    "cnpj": null,
    "email": null,
    "phone": null,
    "website": null,
    "city": "",
    "state_uf": "${target.uf}",
    "notes": "resumo curto do serviço"
  }
]`;

  const response = await gerarComBusca(prompt);
  const text = String((response as any)?.text || '').trim();
  const empresas = extrairJsonArray(text).map((e) => ({
    ...e,
    state_uf: e.state_uf || target.uf,
    cnpj: e.cnpj && cnpjValido14(e.cnpj) ? digitosCnpj(e.cnpj) : null,
  }));

  return { empresas, queries, rawText: text.slice(0, 2000) };
}

/** Micro-lote contínuo: uma cidade polo por ciclo. */
export async function descobrirEmpresasPorMicro(alvo: MicroTarget): Promise<{
  empresas: EmpresaDescobertaWeb[];
  queries: string[];
  label: string;
}> {
  const queries = montarQueriesMicro(alvo);
  const label = rotuloMicroAlvo(alvo);
  const prompt = `Você é um analista de prospecção B2B no Brasil, focado em escolta armada e segurança privada.

Use a ferramenta de busca do Google para pesquisar:
${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Extraia empresas REAIS de escolta armada, transporte de valores ou vigilância/segurança privada em ${alvo.cidade}/${alvo.uf} (${alvo.estado}).
Priorize sites institucionais e páginas de contacto.

Se o CNPJ aparecer no site/rodapé, inclua só dígitos (14). Se não tiver certeza, use null — NÃO invente CNPJ.

Responda APENAS um JSON array (máximo 8 itens):
[
  {
    "company_name": "",
    "trade_name": "",
    "cnpj": null,
    "email": null,
    "phone": null,
    "website": null,
    "city": "${alvo.cidade}",
    "state_uf": "${alvo.uf}",
    "notes": "resumo curto"
  }
]`;

  const response = await gerarComBusca(prompt);
  const text = String((response as any)?.text || '').trim();
  const empresas = extrairJsonArray(text).map((e) => ({
    ...e,
    state_uf: e.state_uf || alvo.uf,
    city: e.city || alvo.cidade,
    cnpj: e.cnpj && cnpjValido14(e.cnpj) ? digitosCnpj(e.cnpj) : null,
  }));
  return { empresas, queries, label };
}

export { extrairJsonArray };
