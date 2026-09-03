/**
 * Normalização final da discriminação enviada ao Asaas.
 *
 * A API recebe JSON e o próprio Asaas serializa/escapa o XML municipal.
 * Por isso, caracteres reservados como &, < e > devem permanecer como texto
 * normal aqui; pré-escapá-los produziria conteúdo fiscal duplamente escapado.
 */
export const ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH = 250;
export const NFSE_DISCRIMINATION_MAX_LENGTH = 2_000;

export type NormalizedAsaasNfDiscrimination = {
  serviceDescription: string;
  observations?: string;
};

function normalizeLineBreaks(value: string): string {
  return value
    .replace(/\r\n?|\n/g, '|')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function assertXmlTextCompatible(value: string, field: string): void {
  // Controles não permitidos em XML 1.0. CR/LF são tratados antes.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new Error(`${field} contém caractere de controle incompatível com XML.`);
  }
}

function removeDuplicatedDescription(
  serviceDescription: string,
  observations: string,
): string {
  if (observations === serviceDescription) return '';
  if (!observations.startsWith(serviceDescription)) return observations;

  const suffix = observations.slice(serviceDescription.length);
  // Só remove quando a descrição é um bloco completo no início. Evita retirar
  // prefixos coincidentes de uma palavra maior ou de outro conteúdo legítimo.
  if (suffix && !/^[\s|:;,\-–—]/.test(suffix)) return observations;
  return suffix.replace(/^[\s|:;,\-–—]+/, '');
}

function removeRedundantMunicipalServiceLine(observations: string): string {
  return observations
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    // Código e nome do serviço já seguem em campos fiscais próprios.
    .filter((part) => !/^CNAE\/Servi[cç]o municipal:/i.test(part))
    .join('|');
}

export function normalizeAsaasNfDiscrimination(input: {
  serviceDescription: string;
  observations?: string | null;
}): NormalizedAsaasNfDiscrimination {
  const serviceDescription = normalizeLineBreaks(String(input.serviceDescription || ''));
  if (!serviceDescription) {
    throw new Error('Descrição do serviço ausente para emissão da NFS-e.');
  }
  assertXmlTextCompatible(serviceDescription, 'Descrição do serviço');

  const normalizedObservations = normalizeLineBreaks(String(input.observations || ''));
  assertXmlTextCompatible(normalizedObservations, 'Observações da NFS-e');
  const observations = removeRedundantMunicipalServiceLine(
    removeDuplicatedDescription(serviceDescription, normalizedObservations),
  );

  // O Asaas concatena serviceDescription + CR/LF + observations ao gerar o XML.
  // Como tpDiscriminacao exige texto contínuo, enviamos um único campo com pipes.
  const discrimination = [serviceDescription, observations].filter(Boolean).join('|');
  if (discrimination.length > NFSE_DISCRIMINATION_MAX_LENGTH) {
    throw new Error(
      `Discriminação fiscal excede ${NFSE_DISCRIMINATION_MAX_LENGTH} caracteres; ` +
        'a emissão foi bloqueada sem truncar informações.',
    );
  }
  if (discrimination.length > ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `Descrição fiscal final excede ${ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH} caracteres; ` +
        'a emissão foi bloqueada para evitar truncamento fiscal.',
    );
  }

  return { serviceDescription: discrimination };
}
