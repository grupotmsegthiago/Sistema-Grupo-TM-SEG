import { emailDeAcesso } from '../cevaPortal/acesso';
import { urlDeSitePublico } from './marcaSite';

/** portal@domínio do site, sem www. */
export function emailPortalDoSite(site: string | null | undefined): string | null {
  const url = urlDeSitePublico(site);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  return emailDeAcesso(`portal@${host}`);
}

/** A senha inicial é o CNPJ, só com os números. CPF não entra. */
export function senhaInicialDoCnpj(documento: string | null | undefined): string | null {
  const digitos = String(documento || '').replace(/\D/g, '');
  if (digitos.length !== 14) return null;
  return digitos;
}
