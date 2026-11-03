/**
 * Conciliação do Gestor Fiscal.
 * Não recalcula OS, não grava banco e não trata nota do mesmo cliente e mês como faturamento.
 * Faturas divididas do mesmo conjunto de OS somam uma vez. A receita da OS continua uma vez.
 */

import { osEstaFaturada } from '../comissao/coberturaOsPeriodo';

export type ComprovacaoOs = 'comprovada' | 'pendente' | 'nao_determinada';

export interface ParteFaturaConsolidavel {
  id: string;
  numero: string;
  valor: number;
  osIds?: readonly string[] | null;
  empresaKey?: string;
  cliente?: string;
}

export interface GrupoFaturaConsolidado {
  chave: string;
  osIds: string[];
  partes: { id: string; numero: string; valor: number }[];
  valorFiscal: number;
  empresaKey: string;
  cliente: string;
}

export interface NotaParaRecebimento {
  id: string;
  numero: string;
  empresaKey: string;
}

export interface RecebimentoAtribuido {
  vinculado: boolean;
  empresaKey: string;
  numero: string;
  faturaId: string;
}

function centavos(valor: number): number {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function idsLimpos(osIds: readonly string[] | null | undefined): string[] {
  if (!osIds || osIds.length === 0) return [];
  return [...new Set(osIds.map((id) => String(id || '').trim()).filter(Boolean))].sort();
}

/**
 * Comprovação documental: número da nota na OS ou vínculo fatura–OS.
 * Nota do mesmo cliente no mesmo mês não comprova.
 */
export function osComprovadamenteFaturada(args: {
  invoiceNumber?: string | null;
  missionId?: string | null;
  idsVinculados?: Set<string> | null;
  notaDoMesmoClienteNoMes?: boolean;
}): boolean {
  void args.notaDoMesmoClienteNoMes;
  return osEstaFaturada({
    invoiceNumber: args.invoiceNumber,
    missionId: args.missionId,
    idsVinculados: args.idsVinculados,
  });
}

export function consolidarFaturasPorConjuntoDeOs(partes: ParteFaturaConsolidavel[]): GrupoFaturaConsolidado[] {
  const grupos = new Map<string, GrupoFaturaConsolidado>();
  const ordenadas = [...partes].sort((a, b) => a.id.localeCompare(b.id));
  for (const parte of ordenadas) {
    const osIds = idsLimpos(parte.osIds);
    const chave = osIds.length > 0 ? `os|${osIds.join('|')}` : `avulsa|${parte.id}`;
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        osIds,
        partes: [],
        valorFiscal: 0,
        empresaKey: parte.empresaKey || '',
        cliente: parte.cliente || '',
      };
      grupos.set(chave, grupo);
    }
    grupo.partes.push({ id: parte.id, numero: parte.numero, valor: parte.valor });
    grupo.valorFiscal = centavos(grupo.valorFiscal + parte.valor);
  }
  return [...grupos.values()];
}

function ocorrenciaExata(texto: string, numero: string): boolean {
  const esc = numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z0-9])${esc}(?:[^A-Za-z0-9]|$)`).test(texto);
}

/**
 * Recebimento só entra numa empresa quando o texto cita um único número de nota
 * com 4 ou mais caracteres, e esse número aponta para uma única fatura.
 * Nome de cliente, mês ou valor parecido não atribuem CNPJ.
 */
export function atribuirRecebimentoPorDocumento(
  descricao: string,
  notas: NotaParaRecebimento[],
): RecebimentoAtribuido {
  const semVinculo: RecebimentoAtribuido = { vinculado: false, empresaKey: 'SEM_EMISSORA', numero: '', faturaId: '' };
  const porNumero = new Map<string, NotaParaRecebimento[]>();
  for (const nota of notas) {
    const numero = String(nota.numero || '').trim();
    if (numero.length < 4) continue;
    const lista = porNumero.get(numero) || [];
    lista.push(nota);
    porNumero.set(numero, lista);
  }
  const unicos = [...porNumero.entries()]
    .filter(([, lista]) => lista.length === 1)
    .sort((a, b) => b[0].length - a[0].length);
  let restante = String(descricao || '');
  const achados: NotaParaRecebimento[] = [];
  for (const [numero, lista] of unicos) {
    if (!ocorrenciaExata(restante, numero)) continue;
    achados.push(lista[0]);
    restante = restante.replace(numero, ' ');
  }
  const ids = new Set(achados.map((nota) => nota.id));
  if (ids.size !== 1) return semVinculo;
  const nota = achados[0];
  return {
    vinculado: true,
    empresaKey: nota.empresaKey || 'SEM_EMISSORA',
    numero: nota.numero,
    faturaId: nota.id,
  };
}
