/**
 * Conferência individual da evidência histórica da etapa 4.
 * Não grava, não escolhe CNPJ pela conta e não trata a classe A como homologação.
 */
import auditoriaJson from './auditoriaClasseA.json';

export type EmpresaAuditada = 'TM GESTAO' | 'TM SEGURANCA' | 'TM SECURITY' | 'INDEFINIDA';
export type ParcelaAuditada = 'lista_seguranca' | 'adicional_outras' | 'ja_reconhecido' | 'indefinido';

export interface LancamentoAuditado {
  id: string;
  valorCentavos: number;
  categoria: string;
  contaPagadora: string;
  empresa: EmpresaAuditada;
  classeHistorica: 'A';
  parcela: ParcelaAuditada;
  blocoId: string;
  podeAprovar: boolean;
  bloqueio: string;
  evidenciaHistorica: string;
  vencimento: string;
  pagamento: string;
  documento: string;
  descricaoMascarada: string;
}

export interface LeituraLancamento {
  id: string;
  valorCentavos: number;
  categoria: string;
  contaPagadora: string;
  vencimento: string;
  pagamento: string;
  documento: string;
  descricaoMascarada: string;
  status: string;
  cancelado: boolean;
}

export interface LancamentoConciliado {
  auditoria: LancamentoAuditado;
  leitura: LeituraLancamento | null;
  divergencias: string[];
  avisos: string[];
  podeSimularAprovacao: boolean;
}

export const AUDITORIA_CLASSE_A = auditoriaJson as LancamentoAuditado[];

const PARADAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'PARA', 'COM', 'REF', 'MES', 'MENSAL', 'PIX', 'BANCO', 'FINAL', 'VENC', 'ORIGINAL', 'LTDA', 'ME', 'EPP', 'A', 'O', 'OS', 'NO', 'NA', 'UM', 'UMA', 'QUE', 'POR', 'AO', 'SE', 'JA', 'MAIS', 'VALOR', 'LANCADO', 'REFERENTE']);
const TERMOS = ['SALARIO', 'COMISSAO', 'BONUS', 'PREMIO', 'DAS', 'CARTAO', 'CREDITO', 'FATURA', 'INVESTIMENTO', 'APTO', 'APARTAMENTO', 'CARRO', 'BYD', 'CONSORCIO', 'FINANCIAMENTO', 'EMPRESTIMO', 'AQUISICAO', 'PARCELA', 'EMPRESA', 'BUSINESS', 'MERCADO', 'PAGO', 'ITAU', 'BRADESCO', 'PORTO', 'SEGURO', 'LATAM', 'DEBITO', 'AUTOMATICO', 'MISSAO', 'FOLHA', 'FERIAS', 'RESCISAO', 'RESCIS', 'ADIANT', 'FUNCIONARIO', 'FUNCIONARIA', 'QUITACAO', 'CONTABIL', 'HONORAR', 'REEMBOLSO', 'PEDAGIO', 'COMBUST', 'MANUTEN', 'OFICINA', 'IPVA', 'FROTA', 'VEICULO', 'TRANSFER', 'APLICAC', 'RESGATE', 'FORNECEDOR', 'SEGURANCA', 'SECURITY', 'GESTAO', 'CESTA', 'BASICA', 'VIVO', 'TARIFA', 'MENSALIDADE', 'CONSUMO', 'ADVOG', 'PROCESSO', 'REABILIT', 'ENTRADA', 'SINAL', 'IMOVEL', 'CASA', 'PF', 'XP', 'TM'];

export function mascararDescricao(bruto: string): string {
  let m = bruto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  m = m.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '[CNPJ]');
  m = m.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[CPF]');
  m = m.replace(/\b\d[\d./-]*\b/g, '[N]');
  const partes = m.split(' ').map((p) => {
    if (!p || p.startsWith('[')) return p;
    if (PARADAS.has(p) || TERMOS.some((t) => p.includes(t))) return p;
    return '[pessoa]';
  });
  return partes.join(' ').replace(/(\[pessoa\]\s+){1,}/g, '[pessoa] ').trim().slice(0, 160) || '(vazia)';
}

export function rotuloDocumento(status: string): string {
  const s = status.toUpperCase();
  if (!s || s === 'EMPTY' || s === '(VAZIO)' || s === 'OK' || s === 'VAZIO') return 'Documento vazio ou ok. Isso não é nota fiscal.';
  if (['AUTHORIZED', 'AUTORIZADA', 'EMITIDA', 'CONCLUIDA'].includes(s)) return `Documento ${status}. Nota autorizada nesta leitura.`;
  return `Documento ${status}. Não entra como nota autorizada.`;
}

export function conciliarLancamentos(leituras: LeituraLancamento[]): {
  itens: LancamentoConciliado[];
  extras: LeituraLancamento[];
  listaConciliada: number;
  listaCentavos: number;
  divergentes: number;
} {
  const porId = new Map<string, LeituraLancamento[]>();
  for (const leitura of leituras) {
    const lista = porId.get(leitura.id) || [];
    lista.push(leitura);
    porId.set(leitura.id, lista);
  }
  const conhecidos = new Set(AUDITORIA_CLASSE_A.map((item) => item.id));
  const itens = AUDITORIA_CLASSE_A.map((auditoria) => {
    const grupo = porId.get(auditoria.id) || [];
    const leitura = grupo[0] || null;
    const divergencias: string[] = [];
    const avisos: string[] = [];
    if (grupo.length > 1) divergencias.push('O identificador apareceu mais de uma vez na consulta.');
    if (!leitura) divergencias.push('A auditoria de 19/10/2026 tem este identificador e a consulta atual não o encontrou.');
    if (leitura?.cancelado) divergencias.push('O lançamento está cancelado na consulta atual.');
    if (leitura && leitura.valorCentavos !== auditoria.valorCentavos) divergencias.push('O valor atual difere da evidência histórica.');
    if (leitura && leitura.categoria !== auditoria.categoria) divergencias.push('A categoria atual difere da evidência histórica.');
    if (leitura && leitura.contaPagadora !== auditoria.contaPagadora) divergencias.push('A conta pagadora atual difere da evidência histórica. A conta não escolhe o CNPJ.');
    if (leitura && leitura.vencimento !== auditoria.vencimento) avisos.push('O vencimento atual difere da leitura de 19/10/2026.');
    if (leitura && leitura.pagamento !== auditoria.pagamento) avisos.push('A data de pagamento atual difere da leitura de 19/10/2026.');
    if (leitura && leitura.documento !== auditoria.documento) avisos.push('A situação documental atual difere da leitura de 19/10/2026.');
    return {
      auditoria,
      leitura,
      divergencias,
      avisos,
      podeSimularAprovacao: auditoria.podeAprovar && divergencias.length === 0,
    };
  });
  const extras = leituras.filter((leitura) => !conhecidos.has(leitura.id));
  const lista = itens.filter((item) => item.auditoria.parcela === 'lista_seguranca' && item.divergencias.length === 0);
  return {
    itens,
    extras,
    listaConciliada: lista.length,
    listaCentavos: lista.reduce((total, item) => total + item.auditoria.valorCentavos, 0),
    divergentes: itens.filter((item) => item.divergencias.length > 0).length + extras.length,
  };
}
