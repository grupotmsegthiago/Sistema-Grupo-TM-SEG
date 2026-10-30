/**
 * Pré-fatura mensal. Regras puras.
 * Não lê missions, não chama o motor da OS e não emite Asaas.
 * O valor mensal do cadastro é copiado no snapshot. Ajuste muda só a linha do mês.
 */
import { roundMoney } from '../comissao/comissaoCalc';
import { isClientAddressComplete, missingClientAddressFields, type ClientAddressLike } from '../clientAddressValidation';
import { addCalendarDaysIso } from './medicaoDueDate';
import { isAmazonBillingClient, resolveMunicipalServiceForClient, type ClientMunicipalNfFields } from './municipalServiceOptions';
import { buildQuinzenaReceivableFromRange } from './receivableDescription';
import { isBankTransferBillingClient, transferBillingDueDays } from './transferBillingClients';

export const MENSAGEM_MIGRACAO_PRE_FATURA =
  'A migration migrations/2026_10_30_pre_fatura_mensal.sql ainda não foi aplicada no banco. Serviços mensais e pré-fatura ficam indisponíveis até essa aplicação.';

export const STATUS_PRE_FATURA = ['RASCUNHO', 'APROVADA', 'FATURADA', 'CANCELADA'] as const;
export type StatusPreFatura = (typeof STATUS_PRE_FATURA)[number];

export const TIPOS_LINHA = ['SERVICO', 'EXTRAORDINARIO', 'REEMBOLSO', 'DESCONTO', 'COMPLEMENTAR'] as const;
export type TipoLinhaPreFatura = (typeof TIPOS_LINHA)[number];

export const ROTULO_TIPO_LINHA: Record<TipoLinhaPreFatura, string> = {
  SERVICO: 'Serviço',
  EXTRAORDINARIO: 'Extraordinário',
  REEMBOLSO: 'Reembolso',
  DESCONTO: 'Desconto',
  COMPLEMENTAR: 'Complementar',
};

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

export type ServicoMensalEntrada = {
  shortName: string;
  description: string;
  postCount: number;
  scheduleType?: string;
  workHours?: string;
  monthlyAmount: number;
  startDate: string;
  endDate?: string | null;
  active?: boolean;
};

export type ServicoVigente = {
  id: string;
  shortName: string;
  description: string;
  monthlyAmount: number;
  startDate: string;
  endDate?: string | null;
  active: boolean;
};

export type LinhaPreFatura = {
  id?: string;
  serviceId?: string | null;
  itemKind: TipoLinhaPreFatura;
  billingReference: string;
  shortName?: string | null;
  description: string;
  serviceStartDate?: string | null;
  contractualAmount: number;
  calculatedAmount: number;
  invoicedAmount: number;
  excluded: boolean;
  sortOrder: number;
};

export type AjusteLinha = {
  previousAmount: number;
  newAmount: number;
  reason: string;
  adjustmentKind: string;
};

export function centavos(valor: number): number {
  return Math.round((Number(valor) || 0) * 100);
}

export function deCentavos(centavosValor: number): number {
  return centavosValor / 100;
}

export function lerValorMonetario(texto: string): number {
  const limpo = String(texto || '').trim().replace(/[^\d,.-]/g, '');
  if (!limpo) return Number.NaN;
  if (limpo.includes(',') && limpo.includes('.')) {
    return Number(limpo.replace(/\./g, '').replace(',', '.'));
  }
  if (limpo.includes(',')) return Number(limpo.replace(',', '.'));
  return Number(limpo);
}

export function formatarMoeda(valor: number): string {
  const cent = centavos(valor);
  const negativo = cent < 0;
  const abs = Math.abs(cent);
  const inteiro = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, '0');
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${milhar},${frac}`;
}

export function formatarDataIso(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '').trim());
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function competenciaValida(valor: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(valor || '').trim());
}

export function competenciaAtual(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(agora);
  const ano = partes.find((p) => p.type === 'year')?.value || '1970';
  const mes = partes.find((p) => p.type === 'month')?.value || '01';
  return `${ano}-${mes}`;
}

export function limitesDoMes(competencia: string): { inicio: string; fim: string } {
  if (!competenciaValida(competencia)) {
    throw new Error('Competência inválida. Use AAAA-MM.');
  }
  const [anoTexto, mesTexto] = competencia.split('-');
  const ano = Number(anoTexto);
  const mes = Number(mesTexto);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return {
    inicio: `${anoTexto}-${mesTexto}-01`,
    fim: `${anoTexto}-${mesTexto}-${String(ultimo).padStart(2, '0')}`,
  };
}

export function nomeCompetencia(competencia: string): string {
  if (!competenciaValida(competencia)) return competencia;
  const [ano, mes] = competencia.split('-');
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

export function colunaCobranca(competencia: string): string {
  if (!competenciaValida(competencia)) return '';
  const [ano, mes] = competencia.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(2)}`;
}

export function fraseMesCompleto(competencia: string): string {
  return `Mês Completo de ${nomeCompetencia(competencia)}`;
}

export function descricaoContasReceber(competencia: string): string {
  const { inicio, fim } = limitesDoMes(competencia);
  return buildQuinzenaReceivableFromRange(inicio, fim) || `Ref. ao mês completo de ${nomeCompetencia(competencia)}`;
}

export function vigenciaCobreMes(servico: ServicoVigente, competencia: string): boolean {
  if (!servico.active) return false;
  if (!competenciaValida(competencia)) return false;
  const { inicio, fim } = limitesDoMes(competencia);
  const comeco = String(servico.startDate || '').slice(0, 10);
  const termino = servico.endDate ? String(servico.endDate).slice(0, 10) : '';
  if (!comeco || comeco > fim) return false;
  if (termino && termino < inicio) return false;
  return true;
}

export function validarServicoMensal(entrada: ServicoMensalEntrada): string | null {
  if (!String(entrada.shortName || '').trim()) return 'Informe o nome curto.';
  if (!String(entrada.description || '').trim()) return 'Informe a descrição da cobrança.';
  if (!Number.isInteger(entrada.postCount) || entrada.postCount < 1) return 'A quantidade de postos precisa ser um inteiro maior que zero.';
  if (!Number.isFinite(entrada.monthlyAmount) || entrada.monthlyAmount < 0) return 'Informe o valor mensal.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entrada.startDate || ''))) return 'Informe o início da vigência.';
  const fim = String(entrada.endDate || '').trim();
  if (fim && !/^\d{4}-\d{2}-\d{2}$/.test(fim)) return 'O fim da vigência está inválido.';
  if (fim && fim < entrada.startDate) return 'O fim da vigência não pode ser anterior ao início.';
  return null;
}

export function montarLinhasDoCadastro(servicos: ServicoVigente[], competencia: string): LinhaPreFatura[] {
  const cobranca = colunaCobranca(competencia);
  return servicos
    .filter((servico) => vigenciaCobreMes(servico, competencia))
    .map((servico, indice) => {
      const mensal = roundMoney(servico.monthlyAmount);
      return {
        serviceId: servico.id,
        itemKind: 'SERVICO' as const,
        billingReference: cobranca,
        shortName: servico.shortName,
        description: servico.description,
        serviceStartDate: String(servico.startDate).slice(0, 10),
        contractualAmount: mensal,
        calculatedAmount: mensal,
        invoicedAmount: mensal,
        excluded: false,
        sortOrder: indice,
      };
    });
}

export function diferencaLinha(linha: Pick<LinhaPreFatura, 'contractualAmount' | 'invoicedAmount' | 'excluded'>): number {
  if (linha.excluded) return 0;
  return deCentavos(centavos(linha.invoicedAmount) - centavos(linha.contractualAmount));
}

export function totaisDaPreFatura(linhas: Array<Pick<LinhaPreFatura, 'contractualAmount' | 'invoicedAmount' | 'excluded'>>): {
  contratual: number;
  faturar: number;
} {
  let contratual = 0;
  let faturar = 0;
  for (const linha of linhas) {
    if (linha.excluded) continue;
    contratual += centavos(linha.contractualAmount);
    faturar += centavos(linha.invoicedAmount);
  }
  return { contratual: deCentavos(contratual), faturar: deCentavos(faturar) };
}

export function podeEditar(status: string): boolean {
  return status === 'RASCUNHO';
}

export function podeAprovar(status: string): boolean {
  return status === 'RASCUNHO';
}

export function podeGerarFatura(status: string, financialInvoiceId: string | null | undefined, emissionRef: string | null | undefined): boolean {
  return status === 'APROVADA' && !String(financialInvoiceId || '').trim() && !String(emissionRef || '').trim();
}

export function podeCancelar(status: string): boolean {
  return status === 'RASCUNHO' || status === 'APROVADA';
}

export function validarJustificativa(motivo: string): string | null {
  if (!String(motivo || '').trim()) return 'Informe a justificativa.';
  return null;
}

export function valorInformadoDaLinha(tipo: TipoLinhaPreFatura, informado: number): number {
  const absoluto = roundMoney(Math.abs(Number(informado) || 0));
  if (tipo === 'DESCONTO') return deCentavos(-centavos(absoluto));
  return absoluto;
}

export function validarNovoValor(tipo: TipoLinhaPreFatura, valor: number): string | null {
  if (!Number.isFinite(valor)) return 'Informe o valor.';
  if (tipo === 'DESCONTO') {
    if (centavos(valor) >= 0) return 'O desconto precisa ser maior que zero.';
    return null;
  }
  if (centavos(valor) < 0) return 'O valor não pode ser negativo.';
  return null;
}

export function prepararAjusteValor(entrada: {
  atual: number;
  novo: number;
  motivo: string;
  tipo: string;
}): { ok: true; ajuste: AjusteLinha } | { ok: false; erro: string } {
  const motivo = validarJustificativa(entrada.motivo);
  if (motivo) return { ok: false, erro: motivo };
  const novo = roundMoney(entrada.novo);
  if (!Number.isFinite(novo)) return { ok: false, erro: 'Informe o valor.' };
  return {
    ok: true,
    ajuste: {
      previousAmount: roundMoney(entrada.atual),
      newAmount: novo,
      reason: entrada.motivo.trim(),
      adjustmentKind: entrada.tipo,
    },
  };
}

export function textoInformacoes(linhas: Array<Pick<LinhaPreFatura, 'itemKind' | 'excluded' | 'shortName' | 'serviceStartDate'>>): string {
  const partes = linhas
    .filter((linha) => linha.itemKind === 'SERVICO' && !linha.excluded && linha.shortName && linha.serviceStartDate)
    .map((linha) => `${linha.shortName} em ${formatarDataIso(linha.serviceStartDate)}`);
  if (partes.length === 0) return 'Sem serviço vigente nesta competência.';
  if (partes.length === 1) return `Início do contrato de ${partes[0]}.`;
  const ultima = partes[partes.length - 1];
  const anteriores = partes.slice(0, -1).join(', ');
  return `Início do contrato de ${anteriores} e de ${ultima}.`;
}

export function situacaoPdf(linhas: Array<Pick<LinhaPreFatura, 'itemKind' | 'excluded'>>): string {
  const ativo = linhas.some((linha) => linha.itemKind === 'SERVICO' && !linha.excluded);
  return ativo ? 'Ativo' : 'Inativo';
}

export function linhasDoPdf(linhas: LinhaPreFatura[]): Array<{
  cobranca: string;
  descricao: string;
  valorMensal: number;
  valor: number;
}> {
  return linhas
    .filter((linha) => !linha.excluded)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((linha) => ({
      cobranca: linha.billingReference,
      descricao: linha.description,
      valorMensal: linha.itemKind === 'SERVICO' ? linha.contractualAmount : 0,
      valor: linha.invoicedAmount,
    }));
}

export function textoDiscriminacao(entrada: {
  descriptionBase: string;
  amazon: boolean;
  competencia: string;
}): string {
  const mes = fraseMesCompleto(entrada.competencia);
  if (entrada.amazon) return `${entrada.descriptionBase} - Referente ao ${mes}`;
  const base = entrada.descriptionBase.replace(/^Ref\.\s*aos\s*/i, 'Referente aos ');
  return `${base} - Referente ao ${mes}`;
}

export function referenciaRastreio(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(agora);
  const ler = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value || '00';
  const sorteio = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TMSEG-${ler('year')}${ler('month')}${ler('day')}-${ler('hour')}${ler('minute')}${ler('second')}-${sorteio}`;
}

export type ClienteCobrancaPreFatura = ClientAddressLike & ClientMunicipalNfFields & {
  id: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  medicao_email?: string | null;
  issuer_company?: string | null;
};

export function enderecoCliente(cliente: ClienteCobrancaPreFatura): string {
  const partes = [
    cliente.street,
    cliente.number ? `nº ${cliente.number}` : '',
    cliente.complement,
    cliente.neighborhood,
    cliente.city && cliente.state ? `${cliente.city} – ${cliente.state}` : cliente.city || cliente.state,
    cliente.zip_code ? `CEP ${cliente.zip_code}` : '',
  ].filter(Boolean);
  return partes.join(', ');
}

export function vencimentoSugerido(cliente: { name?: string | null; trading_name?: string | null }, hojeIso: string): string {
  return addCalendarDaysIso(hojeIso, transferBillingDueDays(cliente.name, cliente.trading_name));
}

export function bloqueioCadastroFiscal(cliente: ClienteCobrancaPreFatura): string | null {
  if (!String(cliente.cnpj || '').replace(/\D/g, '')) return 'O cliente não possui CNPJ. Cadastre o CNPJ antes de gerar a fatura.';
  if (!isClientAddressComplete(cliente)) {
    return `Endereço fiscal incompleto: ${missingClientAddressFields(cliente).join(', ')}.`;
  }
  return null;
}

export function corpoCobrancaPreFatura(entrada: {
  cliente: ClienteCobrancaPreFatura;
  total: number;
  competencia: string;
  vencimento: string;
  email: string;
  rastreio: string;
}): Record<string, unknown> {
  const municipal = resolveMunicipalServiceForClient(entrada.cliente);
  const { inicio, fim } = limitesDoMes(entrada.competencia);
  const texto = textoDiscriminacao({
    descriptionBase: municipal.descriptionBase,
    amazon: isAmazonBillingClient(entrada.cliente.name, entrada.cliente.trading_name),
    competencia: entrada.competencia,
  });
  return {
    clientId: String(entrada.cliente.id),
    clientName: entrada.cliente.trading_name || entrada.cliente.name,
    clientCpfCnpj: String(entrada.cliente.cnpj || '').replace(/\D/g, ''),
    clientEmail: entrada.email,
    value: entrada.total,
    dueDate: entrada.vencimento,
    description: texto,
    observations: `${texto}\n${descricaoContasReceber(entrada.competencia)}`,
    invoiceNumber: entrada.rastreio,
    issuerCompany: entrada.cliente.issuer_company || '',
    skipBoleto: isBankTransferBillingClient(entrada.cliente.name, entrada.cliente.trading_name),
    municipalServiceCode: municipal.code,
    municipalServiceName: municipal.name,
    periodStart: inicio,
    periodEnd: fim,
  };
}

export function tabelaAusente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  const msg = String(erro.message || '');
  return erro.code === '42P01' || erro.code === 'PGRST205' || /does not exist|schema cache|could not find the table/i.test(msg);
}

export function usuarioDoNavegador(): { name: string; id: number | null } {
  try {
    const bruto = globalThis.localStorage?.getItem('userData') || '{}';
    const usuario = JSON.parse(bruto);
    const id = Number(usuario?.id);
    return {
      name: String(usuario?.name || 'Sistema'),
      id: Number.isInteger(id) && id > 0 ? id : null,
    };
  } catch {
    return { name: 'Sistema', id: null };
  }
}
