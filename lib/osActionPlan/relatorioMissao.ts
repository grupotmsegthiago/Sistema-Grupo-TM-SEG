/**
 * Miolo do relatório operacional da missão.
 * O cabeçalho, os cards e a impressão vêm do mesmo HTML do DOC(2).
 */
import { formatDateTimeBR, formatDateBR, formatTimeBR } from '../dateUtils';
import { htmlMapaMissao, htmlQuadroAtualizacoes, resumoOperacional, selecionarAtualizacoes } from './diarioOperacional';
import type { OsActionPlanInput } from './types';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function valor(texto: string | null | undefined): string {
  const t = String(texto || '').trim();
  return t || 'Não informado nesta OS';
}

function quando(iso: string | null | undefined): string {
  if (!iso) return 'Não informado nesta OS';
  const data = formatDateBR(iso);
  const hora = formatTimeBR(iso, '');
  return hora ? `${data} ${hora}` : data;
}

function linha(rotulo: string, conteudo: string): string {
  return `<tr><th>${esc(rotulo)}</th><td>${esc(conteudo)}</td></tr>`;
}

export function htmlRelatorioPadrao(d: OsActionPlanInput): string {
  const { lista } = selecionarAtualizacoes({ ...d, modalidade: 'padrao', escopoAtualizacoes: 'todas' });
  const fotos = lista.reduce((total, item) => total + (item.fotos?.length || 0), 0);
  const posicoes = lista.filter((item) => item.lat != null).length;
  const visto = d.aprovadoCliente
    ? 'Aprovado para envio ao cliente.'
    : 'Espaço para visto. Este documento ainda não foi aprovado.';
  const pacote = { ...d, modalidade: 'padrao' as const, escopoAtualizacoes: 'todas' as const };
  return `<section data-secao="identificacao" data-atualizacoes="${lista.length}" data-fotos="${fotos}" data-posicoes="${posicoes}">
    <h2>Identificação da missão</h2>
    <table>
      ${linha('OS', d.missionId)}
      ${linha('Cliente', valor(d.clientName))}
      ${linha('Operação', valor(d.tipo))}
      ${linha('Data', quando(d.horarioProgramado || d.criadoEm))}
      ${linha('Veículo escoltado', [d.modeloCarga, d.placaCarga].filter(Boolean).join(' · ') || 'Não informado nesta OS')}
      ${linha('Placa', valor(d.placaCarga))}
      ${linha('Motorista', valor(d.motorista))}
      ${linha('Viatura de escolta', [d.modeloViatura, d.placaViatura].filter(Boolean).join(' · ') || 'Não informado nesta OS')}
      ${linha('Agentes', d.equipe?.length ? d.equipe.join(', ') : 'Não informado nesta OS')}
      ${linha('🚩 Origem', valor(d.origem))}
      ${linha('🏁 Destino', valor(d.destino))}
      ${linha('Horário programado', quando(d.horarioProgramado))}
      ${linha('Início registrado', quando(d.linhaDoTempo?.[0]?.quando || d.horarioProgramado))}
      ${linha('Encerramento', quando(d.horarioFim))}
      ${linha('KM inicial', valor(d.kmInicial))}
      ${linha('KM final', valor(d.kmFinal))}
      ${linha('Status', valor(d.status))}
    </table>
  </section>
  <section data-secao="resumo">
    <h2>Resumo operacional</h2>
    <p class="resumo">${esc(resumoOperacional(d, lista.length))}</p>
  </section>
  ${htmlMapaMissao(pacote)}
  ${htmlQuadroAtualizacoes(pacote)}
  <section data-secao="encerramento">
    <h2>Encerramento</h2>
    <p>${esc(resumoOperacional(d, lista.length))}</p>
    <p>Emissão: ${esc(formatDateTimeBR(d.geradoEm))}.</p>
    <p data-campo="visto">${esc(visto)}</p>
  </section>`;
}
