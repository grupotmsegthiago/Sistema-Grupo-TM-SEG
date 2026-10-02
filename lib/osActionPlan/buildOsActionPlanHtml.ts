import { formatDateBR, formatDateTimeBR, formatTimeBR } from '../dateUtils';
import { htmlCorpoAnalise } from './montarRelatorio';
import type { OsActionPlanInput } from './types';

export type PerfilClienteOs = 'dhl' | 'ceva' | 'ceslog' | 'vtc' | 'geral';

export function perfilClienteOs(nome: string | null | undefined): PerfilClienteOs {
  const n = String(nome || '').toUpperCase();
  if (n.includes('DHL')) return 'dhl';
  if (n.includes('CEVA')) return 'ceva';
  if (n.includes('CESLOG') || n.includes('CESARI')) return 'ceslog';
  if (n.includes('VTC')) return 'vtc';
  return 'geral';
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function texto(value: string | null | undefined, vazio = 'Não informado nesta OS'): string {
  const t = String(value || '').trim();
  return t || vazio;
}

function quando(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = formatDateBR(iso);
  const hora = formatTimeBR(iso, '');
  return hora ? `${data} ${hora}` : data;
}

function especificacao(d: OsActionPlanInput): { titulo: string; linhas: Array<[string, string]> } {
  const perfil = perfilClienteOs(d.clientName);
  const linhas: Array<[string, string]> = [
    ['Cliente nesta OS', texto(d.clientName, '—')],
  ];
  const c = d.cadastro;
  if (c) {
    if (c.razao) linhas.push(['Razão social', c.razao]);
    if (c.fantasia) linhas.push(['Nome fantasia', c.fantasia]);
    if (c.cnpj) linhas.push(['CNPJ', c.cnpj]);
    const local = [c.cidade, c.uf].filter(Boolean).join(' / ');
    if (local) linhas.push(['Cidade', local]);
    if (c.contato) linhas.push(['Contato do cadastro', c.contato]);
    if (c.telefone) linhas.push(['Telefone do cadastro', c.telefone]);
  }

  if (perfil === 'dhl') {
    linhas.push(['Número S.E.', texto(d.seNumber)]);
    if (d.smNumber) linhas.push(['Número S.M.', d.smNumber]);
    linhas.push(['Espelhamento / GR', texto(d.grEspelhamento)]);
    linhas.push([
      'Documento oficial DHL',
      'O Plano de Ação DHL da diretoria permanece no botão próprio desta OS. Este documento só descreve o que está registrado aqui.',
    ]);
  } else if (perfil === 'ceslog') {
    linhas.push(['Número de referência CESLOG/CESARI', texto(d.referenceNumber)]);
    linhas.push(['Espelhamento / GR', texto(d.grEspelhamento)]);
  } else if (perfil === 'ceva') {
    linhas.push(['Identificação CEVA', 'Esta OS usa o cadastro CEVA. Não há número S.E. da DHL.']);
    if (d.referenceNumber) linhas.push(['Referência registrada', d.referenceNumber]);
    linhas.push(['Espelhamento / GR', texto(d.grEspelhamento)]);
  } else if (perfil === 'vtc') {
    linhas.push(['Identificação VTC', 'Esta OS usa o cadastro VTC. A identificação operacional é o número da OS.']);
    if (d.referenceNumber) linhas.push(['Referência registrada', d.referenceNumber]);
    linhas.push(['Espelhamento / GR', texto(d.grEspelhamento)]);
  } else {
    linhas.push(['Identificação', 'Esta OS não usa número S.E. da DHL. A identificação é o número da ordem e o cadastro do cliente.']);
    if (d.referenceNumber) linhas.push(['Referência registrada', d.referenceNumber]);
    linhas.push(['Espelhamento / GR', texto(d.grEspelhamento)]);
  }

  if (d.tipo) linhas.push(['Tipo de operação', d.tipo]);
  if (d.operacaoEspecial) linhas.push(['Operação especial', d.operacaoEspecial]);
  return { titulo: 'Especificação deste cliente nesta OS', linhas };
}

export function montarRelatoOs(d: OsActionPlanInput): string[] {
  const frases = [
    `A ordem de serviço ${d.missionId} é do cliente ${texto(d.clientName, 'não identificado')}.`,
  ];
  if (d.tipo) frases.push(`O tipo de operação registrado é ${d.tipo}.`);
  if (d.operacaoEspecial) frases.push(`A operação especial registrada é ${d.operacaoEspecial}.`);
  frases.push(`A rota informada sai de ${texto(d.origem)} e segue para ${texto(d.destino)}, conduzida pela operação da TM SEG.`);
  if (d.horarioProgramado) frases.push(`O horário programado na origem é ${quando(d.horarioProgramado)}.`);
  if (d.atrasoMinutosOrigem != null && d.atrasoMinutosOrigem > 0) {
    frases.push(`A chegada registrada na origem ocorreu ${d.atrasoMinutosOrigem} minuto(s) depois do horário programado.`);
  }
  if (d.placaCarga) {
    frases.push(`O veículo escoltado registrado é ${d.placaCarga}${d.modeloCarga ? ` (${d.modeloCarga})` : ''}.`);
  }
  if (d.placaViatura) {
    frases.push(`A viatura da escolta registrada é ${d.placaViatura}${d.modeloViatura ? ` (${d.modeloViatura})` : ''}.`);
  }
  if (d.equipe.length > 0) frases.push(`A equipe registrada é ${d.equipe.join(' e ')}.`);
  if (d.motorista) frases.push(`O condutor da carga registrado é ${d.motorista}.`);
  if (d.kmInicial || d.kmFinal) {
    frases.push(`O hodômetro registrado é inicial ${texto(d.kmInicial, '—')} e final ${texto(d.kmFinal, '—')}.`);
  }
  frases.push(`O status atual desta OS é ${texto(d.status, '—')}.`);
  return frases;
}

function ultimoStatus(d: OsActionPlanInput, status: string): string | null {
  const achados = d.linhaDoTempo.filter((m) => m.status === status && m.quando);
  return achados.length ? achados[achados.length - 1].quando : null;
}

function atrasoHumano(minutos: number | null): string {
  if (minutos == null || minutos <= 0) return 'Sem atraso registrado na origem.';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h > 0 && m > 0) return `${h} hora${h > 1 ? 's' : ''} e ${m} minuto(s)`;
  if (h > 0) return `${h} hora${h > 1 ? 's' : ''}`;
  return `${m} minuto(s)`;
}

function placa(plate: string | null, model: string | null): string {
  const p = String(plate || '').trim();
  const m = String(model || '').trim();
  if (p && m) return `${p} — ${m}`;
  return p || m || '—';
}

function valor(v: string | null | undefined): string {
  const t = String(v || '').trim();
  if (!t || t === '—') return 'não registrado nesta emissão';
  return t;
}

function objetivoLocal(d: OsActionPlanInput): string {
  const fato = d.ocorrencias.length
    ? 'registrar o que ocorreu, o encaminhamento e o que a TM SEG passa a acompanhar'
    : 'registrar o andamento desta operação, a linha do tempo e o acompanhamento da central';
  return `Formalizar a ordem de serviço ${d.missionId} do cliente ${texto(d.clientName)}, para ${fato}. O documento descreve somente o que está lançado nesta OS.`;
}

function estilosRelatorio(): string {
  return `
    @page { size: A4; margin: 14mm 14mm 16mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 10pt; line-height: 1.45; margin: 0; background: #fff; }
    .header {
      display: flex; align-items: center; gap: 16px;
      background: linear-gradient(135deg, #111827 0%, #991b1b 55%, #dc2626 100%);
      border-bottom: 3px solid #111827;
      padding: 14px 16px; margin: 0 0 16px; border-radius: 0 0 8px 8px;
    }
    .header img { height: 52px; width: auto; max-width: 180px; object-fit: contain; }
    .cover-title h1 { margin: 0; font-size: 15pt; color: #fff; text-transform: uppercase; letter-spacing: 0.03em; }
    .cover-title p { margin: 4px 0 0; color: #fecaca; font-size: 10pt; }
    h2 { font-size: 11pt; color: #991b1b; border-bottom: 2px solid #dc2626; padding-bottom: 4px; margin: 16px 0 8px; break-after: avoid-page; page-break-after: avoid; }
    h3 { font-size: 10pt; color: #111827; margin: 12px 0 6px; break-after: avoid-page; page-break-after: avoid; }
    h2 + p, h2 + div, h2 + table, h3 + p, h3 + table { break-before: avoid-page; page-break-before: avoid; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: linear-gradient(180deg, #fee2e2 0%, #fecaca 100%); color: #111827; font-weight: 700; }
    .meta td:first-child { font-weight: 800; width: 34%; background: #fafafa; text-transform: uppercase; letter-spacing: 0.04em; font-size: 8pt; color: #111827; }
    .meta td:last-child, .meta td:last-child strong { font-weight: 400; text-transform: lowercase; }
    .summary, .quote { background: linear-gradient(90deg, #fef2f2 0%, #fff 100%); border-left: 4px solid #dc2626; padding: 10px 12px; margin: 8px 0; }
    .timeline td:first-child { width: 28%; font-weight: 600; }
    .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .photo-card { border: 1px solid #fca5a5; border-radius: 6px; padding: 8px; background: linear-gradient(180deg, #fff 0%, #fef2f2 100%); break-inside: avoid; page-break-inside: avoid; }
    .photo-card img { width: 100%; max-height: 200px; object-fit: contain; border-radius: 4px; background: #fff; }
    .photo-missing { min-height: 64px; display: flex; align-items: center; justify-content: center; background: #f3f4f6; color: #6b7280; font-size: 8.5pt; text-align: center; padding: 8px; border-radius: 4px; }
    .cronograma { font-family: ui-monospace, monospace; font-size: 8.5pt; background: #fef2f2; padding: 10px; border-radius: 6px; white-space: pre-line; border-left: 3px solid #dc2626; }
    .signature { margin-top: 20px; border-top: 2px solid #111827; padding-top: 8px; }
    .visto { font-size: 13pt; font-weight: 700; color: #991b1b; letter-spacing: 0.08em; }
    .footer { margin-top: 16px; font-size: 8.5pt; color: #6b7280; text-align: center; }
    .no-print { margin-top: 10px; padding: 8px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; font-size: 8.5pt; }
    ul.compact { margin: 6px 0 6px 18px; padding: 0; }
    .campo p { margin: 0 0 10px; text-align: justify; }
    .campo p:last-child { margin-bottom: 0; }
    ul.compact li { margin-bottom: 4px; }
    @media print {
      .no-print { display: none !important; }
      .header, th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

export function buildOsActionPlanHtml(d: OsActionPlanInput): string {
  const cliente = texto(d.clientName, 'Cliente');
  const emissao = formatDateBR(d.geradoEm);
  const gerado = formatDateTimeBR(d.geradoEm);
  const atraso = atrasoHumano(d.atrasoMinutosOrigem);
  const origemChegada = ultimoStatus(d, 'Origem');
  const emViagem = ultimoStatus(d, 'Em Viagem');
  const concluida = ultimoStatus(d, 'Concluída');
  const codigo = d.missionId;

  const conta = d.contaCliente || { estado: 'NÃO CARREGADO' as const, total: null, caracterizada: null, velada: null, desde: null };
  const barra = (rotulo: string, valor: number, base: number) => {
    const pct = base > 0 ? Math.max(4, Math.round((valor / base) * 100)) : 0;
    return `<div class="barra"><b>${esc(rotulo)}</b><div class="trilho-barra"><span style="width:${valor === 0 ? 0 : pct}%"></span></div><em>${valor}</em></div>`;
  };
  const blocoConta = conta.estado === 'ENCONTRADO' && conta.total != null && conta.caracterizada != null && conta.velada != null
    ? `<p class="desde">Histórico da conta ${conta.desde ? `desde ${esc(quando(conta.desde))}` : 'desde a primeira OS encontrada'}.</p>${barra('Total de missões', conta.total, conta.total || 1)}${barra('Caracterizada', conta.caracterizada, conta.total || 1)}${barra('Velada', conta.velada, conta.total || 1)}`
    : '<p>O histórico da conta não foi carregado.</p>';
  const corpo = htmlCorpoAnalise(d);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Plano de Ação — ${esc(d.missionId)} — ${esc(cliente)}</title>
  <style>${estilosRelatorio()}
    .faixa { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0 16px 12px; }
    .selo { background: linear-gradient(160deg, #1f2937 0%, #7f1d1d 100%); color: #fff; border-radius: 16px; padding: 10px 12px; box-shadow: 0 14px 28px rgba(17,24,39,.22); }
    .selo span { display: block; font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: #fecaca; font-weight: 800; }
    .selo strong { display: block; margin-top: 4px; font-size: 11pt; }
    .painel { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 8px 16px 12px; }
    .metrica { background: linear-gradient(180deg, #fff 0%, #fff7f7 100%); border-radius: 14px; padding: 10px 12px; box-shadow: 0 12px 24px rgba(17,24,39,.1), inset 0 1px 0 #fff; border: 1px solid #fee2e2; }
    .metrica span { display: block; font-size: 8pt; letter-spacing: .06em; text-transform: uppercase; color: #9f1239; font-weight: 800; }
    .metrica strong { display: block; margin-top: 4px; font-size: 13pt; font-weight: 400; text-transform: lowercase; }
    .trilha { margin: 4px 0 12px; }
    .cartao { display: grid; grid-template-columns: 44px 1fr; gap: 8px; border: 1px solid #fee2e2; border-radius: 12px; padding: 8px; margin: 0 0 8px; break-inside: avoid; page-break-inside: avoid; }
    .nivel { display: inline-block; margin-left: 8px; font-size: 8pt; font-weight: 800; color: #9f1239; text-transform: uppercase; }
    .legenda { display: flex; gap: 8px; align-items: center; font-size: 8pt; margin: 8px 0 12px; }
    .foto-card { break-inside: avoid; page-break-inside: avoid; }
    .fotos-pagina { table-layout: fixed; page-break-inside: avoid; break-inside: avoid; margin-top: 8px; }
    .fotos-pagina tr, .fotos-pagina td { break-inside: avoid; page-break-inside: avoid; }
    .foto-celula { width: 33.33%; vertical-align: top; padding: 6px; }
    .quadro { width: 42mm; height: 42mm; margin: 0 auto 6px; overflow: hidden; background: #f3f4f6; border: 1px solid #e5e7eb; }
    .quadro img { width: 42mm; height: 42mm; object-fit: cover; object-position: center; display: block; }
    .foto-celula p { margin: 0 0 3px; font-size: 8pt; line-height: 1.3; }
    .grade thead { display: table-header-group; }
    .grade tr { break-inside: avoid; page-break-inside: avoid; }
    .linha { display: grid; grid-template-columns: 36px 128px 108px 1fr; gap: 8px; align-items: center; padding: 5px 2px; border-bottom: 1px solid #f3f4f6; }
    .linha .quando { font-size: 9pt; font-weight: 400; }
    .linha .tipo { font-size: 8pt; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #9f1239; }
    .linha .texto { font-size: 9pt; font-weight: 400; }
    .rosto { width: 32px; height: 32px; }
    .conta .desde { margin: 0 0 8px; font-size: 9pt; }
    .barra { display: grid; grid-template-columns: 150px 1fr 42px; gap: 8px; align-items: center; margin: 6px 0; }
    .barra b { font-size: 8pt; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .barra em { font-style: normal; font-weight: 400; text-align: right; }
    .trilho-barra { height: 12px; background: #f3f4f6; border-radius: 999px; overflow: hidden; }
    .trilho-barra span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #111827, #dc2626); }
    .grade th { text-transform: uppercase; font-weight: 800; font-size: 8pt; }
    .grade td { font-weight: 400; text-transform: none; }
    .aviso-plano { font-size: 8.5pt; color: #7f1d1d; margin: 0 0 6px; }
  </style>
</head>
<body>
  <header class="header">
    <img src="/logo.png" alt="Grupo TM SEG" />
    <div class="cover-title">
      <h1>Plano de Ação e Justificativa de Ocorrência</h1>
      <p>${esc(cliente)} — OS ${esc(d.missionId)}</p>
    </div>
  </header>

  <div class="faixa">
    <div class="selo"><span>Status</span><strong>${esc(texto(d.status, '—'))}</strong></div>
    <div class="selo"><span>Operação</span><strong>${esc(texto(d.tipo, '—'))}</strong></div>
    <div class="selo"><span>Atraso na origem</span><strong>${esc(atraso)}</strong></div>
    <div class="selo"><span>Documento</span><strong>${esc(codigo)}</strong></div>
  </div>
  <div class="painel">
    <div class="metrica"><span>KM inicial</span><strong>${esc(valor(d.kmInicial))}</strong></div>
    <div class="metrica"><span>KM final</span><strong>${esc(valor(d.kmFinal))}</strong></div>
    <div class="metrica"><span>Hora programada</span><strong>${esc(valor(quando(d.horarioProgramado)))}</strong></div>
    <div class="metrica"><span>Hora final</span><strong>${esc(valor(quando(d.horarioFim || concluida)))}</strong></div>
    <div class="metrica"><span>Chegada na origem</span><strong>${esc(valor(quando(origemChegada)))}</strong></div>
    <div class="metrica"><span>Saída / em viagem</span><strong>${esc(valor(quando(emViagem)))}</strong></div>
  </div>

  ${corpo}

  <h2>Histórico da conta</h2>
  <div class="conta">${blocoConta}</div>

  <h2>Aprovação</h2>
  <table>
    <thead><tr><th>Função</th><th>Nome</th><th>Assinatura</th><th>Data</th></tr></thead>
    <tbody>
      <tr><td>Direção / Operações</td><td>Diretoria — Grupo TM SEG</td><td>Visto eletrônico</td><td>${esc(emissao)}</td></tr>
      <tr><td>Coordenação operacional</td><td>Central de monitoramento TM SEG</td><td>Acompanhamento desta OS</td><td>${esc(emissao)}</td></tr>
    </tbody>
  </table>
  <div class="signature">
    <div class="visto">VISTO</div>
    <strong>Diretoria — Grupo TM SEG</strong><br />
    ${esc(gerado)}
  </div>
  <p class="footer">Documento gerado eletronicamente pelo Sistema Grupo TM SEG em ${esc(gerado)} (horário de Brasília).<br />
  contato: thiago@grupotmseg.com.br | sistema.grupotmseg.com.br</p>
  <p class="no-print">Para salvar em PDF: use <strong>Imprimir / PDF</strong> e escolha <strong>Salvar como PDF</strong>.</p>
</body>
</html>`;
}
