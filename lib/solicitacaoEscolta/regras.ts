// Solicitação de escolta: leitura da mensagem, fila do mais barato ao mais caro
// e abertura do WhatsApp do operador. Nada aqui envia mensagem sozinho.

import { UF_LABEL, normKey } from '../providerActivationRanking';

export const ONDA_INICIAL = 2;
export const INTERVALO_FILA_MS = 10 * 60 * 1000;

const UFS = Object.keys(UF_LABEL);

const CIDADES_EXTRAS: Array<[string, string]> = [
  ['RIO DE JANEIRO', 'RJ'],
  ['SAO PAULO', 'SP'],
  ['BELO HORIZONTE', 'MG'],
  ['DUQUE DE CAXIAS', 'RJ'],
  ['NOVA IGUACU', 'RJ'],
  ['SAO GONCALO', 'RJ'],
  ['NITEROI', 'RJ'],
  ['CAMPINAS', 'SP'],
  ['GUARULHOS', 'SP'],
  ['SANTOS', 'SP'],
  ['SAO JOSE DOS CAMPOS', 'SP'],
  ['JUNDIAI', 'SP'],
  ['CAJAMAR', 'SP'],
  ['CONTAGEM', 'MG'],
  ['BETIM', 'MG'],
  ['CURITIBA', 'PR'],
  ['PORTO ALEGRE', 'RS'],
  ['FLORIANOPOLIS', 'SC'],
  ['JOINVILLE', 'SC'],
  ['ITAJAI', 'SC'],
  ['BRASILIA', 'DF'],
  ['GOIANIA', 'GO'],
  ['CAMPO GRANDE', 'MS'],
  ['CUIABA', 'MT'],
  ['SALVADOR', 'BA'],
  ['RECIFE', 'PE'],
  ['FORTALEZA', 'CE'],
  ['MANAUS', 'AM'],
];

const CIDADES: Array<{ chave: string; uf: string; rotulo: string }> = [
  ...Object.entries(UF_LABEL).map(([uf, nome]) => ({ chave: normKey(nome), uf, rotulo: nome })),
  ...CIDADES_EXTRAS.map(([chave, uf]) => ({
    chave,
    uf,
    rotulo: chave.replace(/\b\w/g, (letra) => letra.toUpperCase()),
  })),
].sort((a, b) => b.chave.length - a.chave.length);

export interface LeituraSolicitacao {
  origem: string;
  destino: string;
  cidade: string;
  uf: string;
  /** null = a mensagem não diz se é imediata ou agendada. O operador escolhe. */
  imediata: boolean | null;
  data: string | null;
  hora: string | null;
}

export interface AlvoFila {
  id: string;
  status: 'na_fila' | 'aberto' | 'bloqueado' | 'confirmado';
}

function linhaCampo(texto: string, campo: RegExp): string {
  const linhas = texto.split(/\r?\n/);
  for (const linha of linhas) {
    const match = linha.match(campo);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function acharCidade(trecho: string): { cidade: string; uf: string } {
  const n = normKey(trecho);
  if (!n) return { cidade: '', uf: '' };
  const ufSolta = n.match(new RegExp(`(?:^|[^A-Z])(${UFS.join('|')})(?:[^A-Z]|$)`));
  for (const cidade of CIDADES) {
    if (n.includes(cidade.chave)) {
      return { cidade: cidade.rotulo, uf: ufSolta?.[1] || cidade.uf };
    }
  }
  return { cidade: '', uf: ufSolta?.[1] || '' };
}

function parseData(trecho: string): string | null {
  const match = trecho.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (!match) return null;
  const dia = match[1].padStart(2, '0');
  const mes = match[2].padStart(2, '0');
  let ano = match[3] || '';
  if (!ano) ano = String(new Date().getFullYear());
  if (ano.length === 2) ano = `20${ano}`;
  const iso = `${ano}-${mes}-${dia}`;
  const conferida = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(conferida.getTime())) return null;
  return iso;
}

function parseHora(trecho: string): string | null {
  const match = trecho.match(/(\d{1,2})\s*(?::|h)\s*(\d{2})?/i);
  if (!match) return null;
  const hora = Number(match[1]);
  const minuto = Number(match[2] || '0');
  if (hora > 23 || minuto > 59) return null;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

export function lerSolicitacao(texto: string): LeituraSolicitacao {
  const bruto = String(texto || '');
  const origem = linhaCampo(bruto, /^\s*origem\s*[:\-]\s*(.+)$/i);
  const destino = linhaCampo(bruto, /^\s*destino\s*[:\-]\s*(.+)$/i);
  const dataLinha = linhaCampo(bruto, /^\s*data\s*[:\-]\s*(.+)$/i);
  const horaLinha = linhaCampo(bruto, /^\s*hor[aá]rio\s*[:\-]\s*(.+)$/i) || linhaCampo(bruto, /^\s*hora\s*[:\-]\s*(.+)$/i);
  const cidadeOrigem = acharCidade(origem || bruto);
  const temImediata = /\b(imediat[ao]s?|urgente|agora)\b/i.test(bruto) || /\b(pra|para)\s+j[aá]\b/i.test(bruto);
  const temAgendada = /\bagendad[ao]s?\b/i.test(bruto);
  const data = parseData(dataLinha || bruto);
  const hora = parseHora(horaLinha || bruto);

  let imediata: boolean | null = null;
  if (temAgendada && !temImediata) imediata = false;
  else if (temImediata && !temAgendada) imediata = true;
  else if (temAgendada && temImediata) imediata = false;
  else if (data) imediata = false;

  return {
    origem: origem || cidadeOrigem.cidade,
    destino,
    cidade: cidadeOrigem.cidade,
    uf: cidadeOrigem.uf,
    imediata,
    data,
    hora,
  };
}

/** Horário em que cada fornecedor da fila pode ser aberto. A ordem já vem do mais barato ao mais caro. */
export function montarLiberacoes(quantidade: number, imediata: boolean, inicioMs: number): number[] {
  return Array.from({ length: Math.max(0, quantidade) }, (_, ordem) => {
    if (imediata) return inicioMs;
    return inicioMs + Math.max(0, ordem - (ONDA_INICIAL - 1)) * INTERVALO_FILA_MS;
  });
}

export function podeAbrirWhatsapp(
  status: AlvoFila['status'],
  liberarEmMs: number,
  agoraMs: number,
  solicitacaoStatus: string,
): boolean {
  if (solicitacaoStatus !== 'em_andamento') return false;
  if (status === 'bloqueado' || status === 'confirmado') return false;
  return agoraMs >= liberarEmMs;
}

export function statusAposConfirmacao(ehOConfirmado: boolean): 'confirmado' | 'bloqueado' {
  return ehOConfirmado ? 'confirmado' : 'bloqueado';
}

export function textoEspera(liberarEmMs: number, agoraMs: number): string {
  const falta = Math.max(0, liberarEmMs - agoraMs);
  const min = Math.floor(falta / 60000);
  const seg = Math.floor((falta % 60000) / 1000);
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

export function textoSolicitacaoEscolta(dados: {
  origem: string;
  destino: string;
  imediata: boolean;
  data: string | null;
  hora: string | null;
}): string {
  const quando = dados.imediata
    ? 'Imediata'
    : [dados.data ? dados.data.split('-').reverse().join('/') : '', dados.hora || ''].filter(Boolean).join(' às ') || 'Agendada';
  return [
    '*SOLICITAÇÃO DE ESCOLTA*',
    `Origem: ${dados.origem || '—'}`,
    `Destino: ${dados.destino || '—'}`,
    `Horário: ${quando}`,
    'Favor confirmar disponibilidade.',
  ].join('\n');
}

/** Link que abre o WhatsApp do operador. O ID interno do grupo não abre o aparelho dele. */
export function linkGrupoOperador(valor: string | null | undefined): string | null {
  const link = String(valor || '').trim();
  if (/^https:\/\/(chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com)\//i.test(link)) return link;
  return null;
}

export function erroTabelaAusente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = `${error.code || ''} ${error.message || ''}`;
  return /PGRST205|42P01|does not exist|schema cache|escolta_solicitacoes|escolta_solicitacao_alvos/i.test(msg);
}
