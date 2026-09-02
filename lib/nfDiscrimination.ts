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
  return value.replace(/\r\n?|\n/g, '|').trim();
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

export function normalizeAsaasNfDiscrimination(input: {
  serviceDescription: string;
  observations?: string | null;
}): NormalizedAsaasNfDiscrimination {
  const serviceDescription = normalizeLineBreaks(String(input.serviceDescription || ''));
  if (!serviceDescription) {
    throw new Error('Descrição do serviço ausente para emissão da NFS-e.');
  }
  assertXmlTextCompatible(serviceDescription, 'Descrição do serviço');

  if (serviceDescription.length > ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `Descrição do serviço excede ${ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH} caracteres; ` +
        'a emissão foi bloqueada para evitar truncamento fiscal.',
    );
  }

  const normalizedObservations = normalizeLineBreaks(String(input.observations || ''));
  assertXmlTextCompatible(normalizedObservations, 'Observações da NFS-e');
  const observations = removeDuplicatedDescription(
    serviceDescription,
    normalizedObservations,
  );

  // A Prefeitura de São Paulo define tpDiscriminacao com até 2.000 caracteres.
  // Considera também o separador que o integrador pode inserir entre os campos.
  const combinedLength =
    serviceDescription.length + (observations ? 1 + observations.length : 0);
  if (combinedLength > NFSE_DISCRIMINATION_MAX_LENGTH) {
    throw new Error(
      `Discriminação fiscal excede ${NFSE_DISCRIMINATION_MAX_LENGTH} caracteres; ` +
        'a emissão foi bloqueada sem truncar informações.',
    );
  }

  return observations
    ? { serviceDescription, observations }
    : { serviceDescription };
}
