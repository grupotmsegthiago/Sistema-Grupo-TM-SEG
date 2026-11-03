import { formatTimeBR } from '../dateUtils';
import type { CroquiEtapa, CroquiOcorrencia, OsActionPlanInput } from './types';

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function horaDe(d: OsActionPlanInput, regra: RegExp): string | null {
  const achado = (d.atualizacoes || []).find((a) => regra.test(semAcento(a.texto || '')) && a.quando);
  if (!achado?.quando) return null;
  const hora = formatTimeBR(achado.quando, '');
  return hora || null;
}

function etapa(id: string, titulo: string, legenda: string, classificacao: CroquiEtapa['classificacao'], quando: string | null): CroquiEtapa {
  return { id, titulo, legenda, classificacao, quando };
}

function placaOs(d: OsActionPlanInput): string | null {
  const placa = String(d.placaCarga || '').trim();
  return placa || null;
}

function rotuloVeiculo(d: OsActionPlanInput): string {
  const placa = placaOs(d);
  return placa ? `Veículo da OS ${placa}` : 'Veículo da OS';
}

function croquiPedagio(d: OsActionPlanInput, foco: string): CroquiOcorrencia {
  const veiculo = rotuloVeiculo(d);
  const semelhante = /semelhante|incorreto|confund|outro veiculo|outro caminhao/.test(semAcento(foco));
  const etapas: CroquiEtapa[] = [
    etapa(
      'acompanhamento',
      'Acompanhamento',
      placaOs(d)
        ? `${veiculo} consta no cadastro da OS. A escolta segue esse veículo.`
        : 'O veículo escoltado consta como veículo da OS. Nenhuma placa extra foi criada para o desenho.',
      'confirmado',
      null,
    ),
    etapa(
      'pedagio',
      'Passagem pelo pedágio',
      'Segundo o contexto informado, durante a passagem pelo pedágio houve perda momentânea da identificação visual do veículo escoltado. O desenho não afirma quantos veículos havia no local.',
      'relatado',
      horaDe(d, /pedagio/),
    ),
  ];
  if (semelhante) {
    etapas.push(etapa(
      'semelhante',
      'Veículo semelhante',
      'Após a passagem, a equipe de escolta iniciou temporariamente o acompanhamento de outro veículo. Esta etapa vem do contexto informado. O veículo semelhante não recebe placa.',
      'relatado',
      null,
    ));
  }
  etapas.push(
    etapa(
      'divergencia',
      'Divergência identificada',
      'A divergência é tratada na conferência da placa. Em seguida, a localização do veículo correto.',
      horaDe(d, /localiz|placa|divergenc/) ? 'confirmado' : 'relatado',
      horaDe(d, /localiz|placa|divergenc/),
    ),
    etapa(
      'retomada',
      'Retomada',
      horaDe(d, /reinicio|retomad/)
        ? 'O registro da OS aponta retomada do deslocamento depois da localização.'
        : 'A retomada do veículo correto é o desfecho informado para a apuração. Não há horário próprio desta etapa além do que estiver no registro.',
      horaDe(d, /reinicio|retomad/) ? 'confirmado' : 'relatado',
      horaDe(d, /reinicio|retomad/),
    ),
  );
  return {
    tipo: 'pedagio',
    titulo: 'Croqui da ocorrência',
    subtitulo: 'Perda de identificação visual durante passagem pelo pedágio',
    etapas: etapas.slice(0, 6),
    aprovado: false,
  };
}

function croquiPerda(d: OsActionPlanInput): CroquiOcorrencia {
  const contato = horaDe(d, /contato|acompanh|perdeu|a frente/);
  const retomada = horaDe(d, /reinicio|retomad|localiz/);
  return {
    tipo: 'perda_contato',
    titulo: 'Croqui da ocorrência',
    subtitulo: 'Perda de acompanhamento do veículo escoltado',
    etapas: [
      etapa('normal', 'Acompanhamento', `${rotuloVeiculo(d)} sob escolta da equipe operacional.`, placaOs(d) ? 'confirmado' : 'relatado', null),
      etapa('ruptura', 'Perda de contato', 'A equipe de escolta perde o acompanhamento do veículo escoltado e comunica a ocorrência.', contato ? 'confirmado' : 'relatado', contato),
      etapa('retomada', 'Retomada', 'Localização do veículo correto, confirmação da placa e retomada da escolta.', retomada ? 'confirmado' : 'relatado', retomada),
    ],
    aprovado: false,
  };
}

function croquiDesvio(d: OsActionPlanInput): CroquiOcorrencia {
  return {
    tipo: 'desvio_rota',
    titulo: 'Croqui da ocorrência',
    subtitulo: 'Percurso relacionado à ocorrência diante da rota cadastrada',
    etapas: [
      etapa('prevista', 'Rota cadastrada', `Rota informada: ${d.origem || 'origem não informada'} para ${d.destino || 'destino não informado'}.`, d.origem && d.destino ? 'confirmado' : 'relatado', null),
      etapa('divergente', 'Percurso relacionado', 'Há relato de desvio em relação à rota cadastrada. O desenho não reconstitui coordenada nem distância.', 'relatado', null),
      etapa('retorno', 'Esclarecimento', 'A Central confronta a rota cadastrada com a posição declarada antes de tratar o trecho como retomado.', 'relatado', null),
    ],
    aprovado: false,
  };
}

function croquiParada(d: OsActionPlanInput): CroquiOcorrencia {
  const quando = horaDe(d, /parada/);
  return {
    tipo: 'parada',
    titulo: 'Croqui da ocorrência',
    subtitulo: 'Parada no percurso',
    etapas: [
      etapa('desloca', 'Deslocamento', `${rotuloVeiculo(d)} em deslocamento.`, 'relatado', null),
      etapa('parada', 'Parada', 'Parada relatada no percurso. O motivo permanece o que estiver no registro, sem complemento.', quando ? 'confirmado' : 'relatado', quando),
      etapa('segue', 'Retomada', 'Retomada do deslocamento depois da parada, se houver registro de reinício.', horaDe(d, /reinicio|retomad/) ? 'confirmado' : 'relatado', horaDe(d, /reinicio|retomad/)),
    ],
    aprovado: false,
  };
}

function croquiAcesso(): CroquiOcorrencia {
  return {
    tipo: 'acesso',
    titulo: 'Croqui da ocorrência',
    subtitulo: 'Evento de acesso ou portaria',
    etapas: [
      etapa('chegada', 'Chegada', 'A equipe chega ao ponto de acesso informado no contexto.', 'relatado', null),
      etapa('controle', 'Controle', 'Conferência no acesso. O desenho não cria cancela, documento ou horário que não esteja no registro.', 'relatado', null),
      etapa('evento', 'Evento', 'O fato informado no contexto da apuração ocorre nesse controle.', 'relatado', null),
    ],
    aprovado: false,
  };
}

/** Diagrama da sequência. Sem placa inventada e sem horário que não esteja num registro. */
export function montarCroqui(d: OsActionPlanInput): CroquiOcorrencia | null {
  const foco = [d.problemaPrincipal, d.relatoComplementar].filter(Boolean).join('\n');
  const n = semAcento(foco);
  if (n.trim().length < 20) return null;
  if (/pedagio/.test(n)) return croquiPedagio(d, foco);
  if (/portaria|controle de acesso|no acesso/.test(n)) return croquiAcesso();
  if (/desvio de rota|fora da rota|fora de rota|itinerario diverg/.test(n)) return croquiDesvio(d);
  if (/parada/.test(n) && !/\brf\b|descanso|repouso/.test(n)) return croquiParada(d);
  if (/perda de acompanhamento|perda de contato|perdeu o acompanhamento|identificacao visual|veiculo semelhante|veiculo incorreto/.test(n)) {
    return croquiPerda(d);
  }
  return null;
}

function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function veiculoSvg(rotulo: string, tom: 'os' | 'escolta' | 'outro'): string {
  const cor = tom === 'os' ? '#166534' : tom === 'escolta' ? '#111827' : '#991b1b';
  return `<span class="viatura" style="border-color:${cor};color:${cor}"><svg viewBox="0 0 64 28" aria-hidden="true"><rect x="2" y="8" width="44" height="14" rx="2" fill="none" stroke="${cor}" stroke-width="2"/><rect x="46" y="12" width="14" height="10" rx="1" fill="none" stroke="${cor}" stroke-width="2"/><circle cx="14" cy="24" r="3" fill="${cor}"/><circle cx="36" cy="24" r="3" fill="${cor}"/></svg><small>${esc(rotulo)}</small></span>`;
}

/** HTML do croqui. Entra no documento junto com o relatório. */
export function htmlCroqui(croqui: CroquiOcorrencia, meta: { os: string; cliente: string; data: string; operacao: string }): string {
  const etapas = croqui.etapas.slice(0, 6).map((e, i) => {
    const quando = e.quando ? e.quando : 'Sem horário próprio nesta etapa';
    const selo = e.classificacao === 'confirmado' ? 'Registro' : 'Relato';
    const desenho = croqui.tipo === 'pedagio' && e.id === 'pedagio'
      ? '<span class="pistas"><i>Pista</i><i>Pista</i><i>Pista</i></span>'
      : e.id === 'semelhante'
        ? `${veiculoSvg('Veículo da OS', 'os')}${veiculoSvg('Veículo semelhante', 'outro')}`
        : `${veiculoSvg('Escolta', 'escolta')}${veiculoSvg('Veículo da OS', 'os')}`;
    return `<li class="etapa-croqui">
      <b>${i + 1}</b>
      <div>
        <strong>${esc(e.titulo)}</strong>
        <em>${esc(quando)} · ${selo}</em>
        <div class="frota">${desenho}</div>
        <p>${esc(e.legenda)}</p>
      </div>
    </li>`;
  }).join('');
  return `<section data-secao="croqui">
  <h2>Croqui da ocorrência</h2>
  <div class="croqui">
    <header>
      <div>
        <strong>CROQUI DA OCORRÊNCIA</strong>
        <p>${esc(croqui.subtitulo)}</p>
      </div>
      <ul>
        <li>OS ${esc(meta.os)}</li>
        <li>${esc(meta.cliente)}</li>
        <li>${esc(meta.data)}</li>
        <li>${esc(meta.operacao)}</li>
      </ul>
    </header>
    <ol>${etapas}</ol>
    <p class="aviso-croqui">CROQUI ILUSTRATIVO — representação elaborada com base nos registros e relatos disponíveis. Não representa escala, posição exata dos veículos ou reconstrução pericial da ocorrência.</p>
  </div>
</section>`;
}
