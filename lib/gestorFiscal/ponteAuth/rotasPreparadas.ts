/**
 * Rotas preparadas, sem registro HTTP. O token antigo não serve de fallback.
 * CNPJ, perfil e permissões do pedido não autorizam.
 */
import { CLIENTES_ISOLADOS, FORNECEDORES_ISOLADOS } from './catalogoIsolado';
import { projetarGestor } from './consultaGestor';
import type { PonteIsolada } from './ponte';
import type { AcaoPonte } from './tipos';

export const ROTAS_PREPARADAS = [
  'os',
  'painel_operacional',
  'clientes',
  'fornecedores',
  'faturamento',
  'financeiro',
  'portal',
  'gestor_fiscal',
] as const;

export type RotaPreparada = typeof ROTAS_PREPARADAS[number];

const ACAO: Record<RotaPreparada, AcaoPonte> = {
  os: 'ler_os',
  painel_operacional: 'ler_painel',
  clientes: 'ler_clientes',
  fornecedores: 'ler_fornecedores',
  faturamento: 'ler_faturamento',
  financeiro: 'ler_financeiro',
  portal: 'ler_portal',
  gestor_fiscal: 'ler_financeiro',
};

export interface AlegacaoNavegador {
  empresaInformada?: string | null;
  cnpjInformado?: string | null;
  clienteInformado?: string | null;
  perfilInformado?: string | null;
  permissoesInformadas?: readonly string[];
  limite?: number;
}

export interface RespostaRota {
  ok: boolean;
  codigo: string;
  motivo: string;
  homologacaoReal: false;
  dados: readonly Record<string, string | number>[];
}

function vazia(codigo: string, motivo: string): RespostaRota {
  return { ok: false, codigo, motivo, homologacaoReal: false, dados: [] };
}

export async function atenderRotaPreparada(
  ponte: PonteIsolada,
  rota: RotaPreparada,
  token: string,
  alegacao: AlegacaoNavegador = {},
): Promise<RespostaRota> {
  if (!token.trim()) return vazia('sem_autenticacao', 'A rota protegida exige sessão.');
  const consulta = await ponte.consultar(token, {
    acao: ACAO[rota],
    empresaInformada: alegacao.empresaInformada ?? null,
    clienteInformado: alegacao.clienteInformado ?? null,
    perfilInformado: alegacao.perfilInformado ?? null,
    permissoesInformadas: alegacao.permissoesInformadas ?? [],
    limite: alegacao.limite ?? 10,
  });
  if (!consulta.ok) return vazia(consulta.codigo, consulta.motivo);
  const empresas = new Set(consulta.linhas.map((linha) => linha.empresaId));
  if (rota === 'gestor_fiscal' || rota === 'financeiro' || rota === 'faturamento') {
    return {
      ok: true,
      codigo: 'ok',
      motivo: '',
      homologacaoReal: false,
      dados: projetarGestor(consulta.linhas),
    };
  }
  if (rota === 'painel_operacional') {
    return {
      ok: true,
      codigo: 'ok',
      motivo: '',
      homologacaoReal: false,
      dados: projetarGestor(consulta.linhas).map((linha) => ({
        empresaId: linha.empresaId,
        quantidadeOs: linha.quantidadeOs,
      })),
    };
  }
  if (rota === 'os') {
    return {
      ok: true,
      codigo: 'ok',
      motivo: '',
      homologacaoReal: false,
      dados: consulta.linhas.map((linha) => ({
        empresaId: linha.empresaId,
        clienteId: linha.clienteId,
        quantidadeOs: linha.os,
      })),
    };
  }
  if (rota === 'clientes') {
    return {
      ok: true,
      codigo: 'ok',
      motivo: '',
      homologacaoReal: false,
      dados: CLIENTES_ISOLADOS
        .filter((cliente) => empresas.has(cliente.empresaId))
        .map((cliente) => ({ id: cliente.id, empresaId: cliente.empresaId, nome: cliente.nome })),
    };
  }
  if (rota === 'fornecedores') {
    return {
      ok: true,
      codigo: 'ok',
      motivo: '',
      homologacaoReal: false,
      dados: FORNECEDORES_ISOLADOS
        .filter((fornecedor) => empresas.has(fornecedor.empresaId))
        .map((fornecedor) => ({ id: fornecedor.id, empresaId: fornecedor.empresaId, nome: fornecedor.nome })),
    };
  }
  return {
    ok: true,
    codigo: 'ok',
    motivo: '',
    homologacaoReal: false,
    dados: consulta.linhas.map((linha) => ({
      clienteId: linha.clienteId,
      quantidadeOs: linha.os,
    })),
  };
}
