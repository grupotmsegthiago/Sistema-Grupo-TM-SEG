/**
 * Repositório só de memória. Não abre o banco, não grava arquivo e não usa armazenamento do navegador.
 * O histórico é acrescentado. Evento antigo não é reescrito.
 */
import { ORIGEM_DADOS_FASE_2, type EventoDecisao, type TentativaRecusada } from './tipos';

type EventoNovo = Omit<EventoDecisao, 'id' | 'origemDados' | 'homologacaoReal'>;

export class RepositorioMemoria {
  private eventos: EventoDecisao[] = [];
  private porChave = new Map<string, string>();
  private versoes = new Map<string, number>();
  private tentativas: TentativaRecusada[] = [];
  private sequencia = 1;

  versaoAtual(lancamentoId: string): number {
    return this.versoes.get(lancamentoId) ?? 0;
  }

  vigente(lancamentoId: string): EventoDecisao | null {
    const lista = this.eventos.filter((evento) => evento.lancamentoId === lancamentoId);
    return lista.length ? copiar(lista[lista.length - 1]) : null;
  }

  porId(id: string): EventoDecisao | null {
    const evento = this.eventos.find((item) => item.id === id);
    return evento ? copiar(evento) : null;
  }

  buscarChave(chave: string): EventoDecisao | null {
    const id = this.porChave.get(chave);
    return id ? this.porId(id) : null;
  }

  listar(lancamentoId?: string): EventoDecisao[] {
    return this.eventos
      .filter((evento) => !lancamentoId || evento.lancamentoId === lancamentoId)
      .map(copiar);
  }

  anexar(evento: EventoNovo): EventoDecisao {
    const atual = this.versaoAtual(evento.lancamentoId);
    if (evento.versao !== atual + 1) {
      throw new Error('A versão do histórico não confere. O evento não foi acrescentado.');
    }
    if (this.porChave.has(evento.chaveIdempotencia)) {
      throw new Error('A chave de idempotência já existe. O evento não foi acrescentado.');
    }
    const gravado: EventoDecisao = Object.freeze({
      ...evento,
      id: `evt-${this.sequencia++}`,
      evidencias: Object.freeze([...evento.evidencias]),
      origemDados: ORIGEM_DADOS_FASE_2,
      homologacaoReal: false,
    });
    this.eventos.push(gravado);
    this.versoes.set(evento.lancamentoId, evento.versao);
    this.porChave.set(evento.chaveIdempotencia, gravado.id);
    return copiar(gravado);
  }

  registrarTentativa(tentativa: Omit<TentativaRecusada, 'id'>): TentativaRecusada {
    const gravada: TentativaRecusada = Object.freeze({ ...tentativa, id: `rec-${this.sequencia++}` });
    this.tentativas.push(gravada);
    return { ...gravada };
  }

  listarTentativas(): TentativaRecusada[] {
    return this.tentativas.map((item) => ({ ...item }));
  }
}

function copiar(evento: EventoDecisao): EventoDecisao {
  return { ...evento, evidencias: [...evento.evidencias] };
}
