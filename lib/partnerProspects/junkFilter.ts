/** Filtro anti-lixo: títulos/hosts que não são empresa de escolta/vigilância. */

const LIXO_NOME =
  /\b(dicion[aá]rio|wikipedia|conceito\.de|prefeitura|c[aâ]mara municipal|vigil[aâ]ncia sanit[aá]ria|blog\b|not[ií]cias?|jornal|artigo acad|tcc\b|monografia|youtube|facebook|instagram photos|reclame\s*aqui|glassdoor|linkedin|gov\.br|tribunal|minist[eé]rio|como escolher|o que [eé]|defini[cç][aã]o|as melhores \d|lista de empresas|guia de)\b/i;

const LIXO_HOST =
  /(?:wikipedia\.|dicio\.|conceito\.de|reclameaqui|facebook\.|instagram\.|linkedin\.|youtube\.|blogspot\.|wordpress\.|wixsite\.|play\.google|\.gov\.br$|\.jus\.br$|glassdoor|indeed\.|infojobs)/i;

export function pareceLixoProspecto(input: {
  company_name?: string | null;
  website?: string | null;
  notes?: string | null;
}): boolean {
  const nome = String(input.company_name || '');
  if (LIXO_NOME.test(nome)) return true;
  const site = String(input.website || '');
  if (site && LIXO_HOST.test(site)) return true;
  try {
    if (site) {
      const host = new URL(site.startsWith('http') ? site : `https://${site}`).hostname;
      if (LIXO_HOST.test(host)) return true;
    }
  } catch {
    /* ignore */
  }
  const notes = String(input.notes || '');
  if (/dicion[aá]rio|wikipedia|sanit[aá]ria|prefeitura/i.test(notes) && !/escolta|transporte de valores/i.test(nome)) {
    return true;
  }
  return false;
}

export function pareceEmpresaSeguranca(nome: string, snippet?: string | null): boolean {
  const blob = `${nome} ${snippet || ''}`;
  return /escolta|vigil[aâ]ncia|seguran[cç]a|transporte de valores|pronta resposta|blindad/i.test(blob);
}

export { LIXO_NOME, LIXO_HOST };
