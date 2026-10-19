/**
 * Integração local da ponte. Não há rota HTTP e a entrada de produção fica desligada.
 * A tela de login atual não importa este arquivo.
 */
import { consultarGestorProducao } from './consultaGestor';
import { entrarIsolado, type LogEntrada } from './loginSeguro';
import { ponteAuthHabilitada } from './flag';
import { criarPonteIsolada, type PonteIsolada } from './ponte';
import { criarRepositorioIsolado, type RepositorioIsolado } from './repositorioIsolado';
import { atenderRotaPreparada, ROTAS_PREPARADAS, type AlegacaoNavegador, type RespostaRota, type RotaPreparada } from './rotasPreparadas';
import { SessoesMemoria } from './sessao';

export interface IntegracaoIsolada {
  entrar(email: string, senha: string): Promise<Awaited<ReturnType<typeof entrarIsolado>>>;
  revogar(token: string): boolean;
  rota(rota: RotaPreparada, token: string, alegacao?: AlegacaoNavegador): Promise<RespostaRota>;
  repositorio: RepositorioIsolado;
  sessoes: SessoesMemoria;
  logs(): readonly LogEntrada[];
}

export async function criarIntegracaoIsolada(
  opcoes: { agora?: () => number; sessoes?: SessoesMemoria } = {},
): Promise<IntegracaoIsolada> {
  const repositorio = await criarRepositorioIsolado();
  const sessoes = opcoes.sessoes ?? new SessoesMemoria();
  const ponte: PonteIsolada = criarPonteIsolada(repositorio, { agora: opcoes.agora, sessoes });
  const registros: LogEntrada[] = [];
  return {
    entrar(email, senha) {
      return entrarIsolado(repositorio, ponte, email, senha, registros);
    },
    revogar(token) {
      return ponte.revogar(token);
    },
    rota(rota, token, alegacao) {
      return atenderRotaPreparada(ponte, rota, token, alegacao);
    },
    repositorio,
    sessoes,
    logs() {
      return registros.map((item) => ({ ...item }));
    },
  };
}

export function entrarProducao(env?: Record<string, string | undefined>): { ok: false; codigo: string; motivo: string } {
  if (!ponteAuthHabilitada(env)) {
    return { ok: false, codigo: 'ponte_desligada', motivo: 'A ponte de autenticação está desligada. Nenhuma senha foi conferida.' };
  }
  return { ok: false, codigo: 'sem_adaptador', motivo: 'Mesmo com a flag, esta fase não autentica produção.' };
}

export { ROTAS_PREPARADAS, consultarGestorProducao };
