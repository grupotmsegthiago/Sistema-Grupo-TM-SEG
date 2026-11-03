const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export type TrechoRelato = { rotulo: string; texto: string };

export type EntradaRelato = {
  os: string | null;
  status: string | null;
  servico: string | null;
  local: string | null;
  origem: string;
  destino: string;
  dataInicio: string | null;
  dataFim: string | null;
  franquiaHora: string | null;
  franquiaKm: number | null;
  kmInicio: number | null;
  kmFim: number | null;
  kmRodado: number | null;
  kmExcedente: number | null;
  hrsTrabalhada: string | null;
  hrsExcedente: string | null;
  valorHrsExcedente: number | null;
  valorKmExcedente: number | null;
  valorAcionamento: number | null;
  valorTotal: number | null;
  pedagio: number | null;
  tarifaHora: number | null;
  tarifaKm: number | null;
  placa: string | null;
  motorista: string | null;
  telefone: string | null;
  identificacao: string | null;
  solicitante: string | null;
  quemAutorizou: string | null;
  operacao: string | null;
  contrato: string | null;
  atendimentoPgr: string | null;
  tsp: string | null;
  obs: string | null;
};

function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function km(valor: number): string {
  return valor.toLocaleString('pt-BR');
}

function instante(valor: string | null): Date | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function hora(valor: string | null): string {
  const data = instante(valor);
  if (!data) return '';
  return data.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
}

function dia(valor: string | null): string {
  const data = instante(valor);
  if (!data) return '';
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function capitalizar(palavra: string, indice: number): string {
  const semPonto = palavra.replace(/\./g, '');
  const upper = semPonto.toLocaleUpperCase('pt-BR');
  if (UFS.has(upper) && semPonto.length === 2) return upper;
  if (upper === 'AV' || upper === 'AVENIDA') return 'Av.';
  if (upper === 'R') return 'R.';
  if (upper === 'RUA') return 'Rua';
  if (upper === 'ROD' || upper === 'RODOVIA') return 'Rodovia';
  if (upper === 'EST' || upper === 'ESTR' || upper === 'ESTRADA') return 'Estrada';
  if (upper === 'AL' || upper === 'ALAMEDA') return 'Alameda';
  if (upper === 'TV' || upper === 'TRAVESSA') return 'Travessa';
  const lower = palavra.replace(/\.$/, '').toLocaleLowerCase('pt-BR');
  if (indice > 0 && PARTICULAS.has(lower)) return lower;
  if (!lower) return palavra;
  if (/^\d/.test(lower)) return lower;
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

export function lugarLegivel(bruto: string): string {
  let texto = bruto.replace(/\s+/g, ' ').trim();
  texto = texto.replace(/,?\s*(brasil|brazil)\s*$/i, '').trim();
  texto = texto.replace(/,?\s*\d{5}-?\d{3}\s*$/i, '').trim();
  texto = texto.replace(/\s*-\s*([A-Za-z]{2})(?=\s*(?:,|$))/g, (_, uf: string) => {
    const codigo = uf.toLocaleUpperCase('pt-BR');
    return UFS.has(codigo) ? ` (${codigo})` : ` - ${uf}`;
  });
  texto = texto.replace(/\s+-\s+/g, ', ');
  const palavras = texto.split(/\s+/).map((palavra, indice) => {
    const virgula = palavra.endsWith(',');
    const base = virgula ? palavra.slice(0, -1) : palavra;
    if (base.startsWith('(') && base.endsWith(')')) {
      const uf = base.slice(1, -1).toLocaleUpperCase('pt-BR');
      return UFS.has(uf) ? `(${uf})` : palavra;
    }
    const bonito = capitalizar(base, indice);
    return virgula ? `${bonito},` : bonito;
  });
  return palavras.join(' ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s+\(/g, ' (').trim();
}

export function nomeLegivel(bruto: string): string {
  return bruto.trim().split(/\s+/).filter(Boolean).map((parte, indice) => capitalizar(parte, indice)).join(' ');
}

export function telefoneLegivel(bruto: string): string {
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return bruto.trim();
}

function tempoZerado(valor: string | null): boolean {
  if (!valor) return true;
  const partes = valor.split(':').map((parte) => Number(parte));
  return partes.length > 0 && partes.every((parte) => parte === 0);
}

function preenchido(valor: string | null | undefined): string {
  const texto = (valor || '').trim();
  if (!texto || texto === '—' || texto === '-') return '';
  return texto;
}

function juntarFrase(partes: string[]): string {
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

function fraseServico(entrada: EntradaRelato): string {
  const servico = entrada.servico ? nomeLegivel(entrada.servico) : 'Serviço';
  const nome = servico.charAt(0).toLocaleUpperCase('pt-BR') + servico.slice(1).toLocaleLowerCase('pt-BR');
  const status = (entrada.status || '').trim().toLocaleLowerCase('pt-BR');
  const data = dia(entrada.dataInicio);
  const dataFim = dia(entrada.dataFim);
  const inicio = hora(entrada.dataInicio);
  const fim = hora(entrada.dataFim);
  const mesmoDia = !dataFim || dataFim === data;
  const quando = mesmoDia
    ? [data ? `em ${data}` : '', inicio && fim ? `das ${inicio} às ${fim}` : ''].filter(Boolean).join(', ')
    : `de ${[data, inicio].filter(Boolean).join(', ')} até ${[dataFim, fim].filter(Boolean).join(', ')}`;
  const os = preenchido(entrada.os) ? `OS GTM-${preenchido(entrada.os)}. ` : '';
  if (status.startsWith('conclu')) return `${os}${nome}, concluída${quando ? ` ${quando}` : ''}.`;
  if (status && quando) return `${os}${nome} (${status}), ${quando}.`;
  if (status) return `${os}${nome} (${status}).`;
  return `${os}${nome}${quando ? `, ${quando}` : ''}.`;
}

function trechoLegivel(local: string): string {
  const partes = local.split(/\s+x\s+/i).map((parte) => lugarLegivel(parte)).filter(Boolean);
  if (partes.length === 2) return `${partes[0]} a ${partes[1]}`;
  return lugarLegivel(local);
}

function fraseTrajeto(entrada: EntradaRelato): string {
  const origem = entrada.origem ? lugarLegivel(entrada.origem) : '';
  const destino = entrada.destino ? lugarLegivel(entrada.destino) : '';
  const local = preenchido(entrada.local);
  const trecho = local ? trechoLegivel(local) : '';
  const trechoRepeteEndereco = Boolean(
    trecho && entrada.origem && entrada.destino && local.includes(entrada.origem) && local.includes(entrada.destino),
  );
  const complemento = trecho && !trechoRepeteEndereco && trecho.toLocaleLowerCase('pt-BR') !== origem.toLocaleLowerCase('pt-BR')
    ? ` Trecho ${trecho}.`
    : '';
  if (origem && destino && origem.toLocaleLowerCase('pt-BR') === destino.toLocaleLowerCase('pt-BR')) {
    return `O atendimento ocorreu em ${origem}.${complemento ? ` ${complemento.trim()}` : ''}`;
  }
  if (origem && destino) return `Saída em ${origem}, com chegada em ${destino}.${complemento}`;
  if (origem) return `Saída em ${origem}.${complemento}`;
  if (destino) return `Chegada em ${destino}.${complemento}`;
  if (trecho) return `O atendimento ocorreu em ${trecho}.`;
  return '';
}

function fraseMotorista(entrada: EntradaRelato): string {
  const nome = entrada.motorista ? nomeLegivel(entrada.motorista) : '';
  const placa = (entrada.placa || '').trim().toLocaleUpperCase('pt-BR');
  const fone = entrada.telefone ? telefoneLegivel(entrada.telefone) : '';
  const conducao = nome && placa
    ? `${nome} conduziu o veículo ${placa}`
    : nome
      ? `Condução com ${nome}`
      : placa
        ? `Veículo ${placa}`
        : '';
  const identificacao = preenchido(entrada.identificacao);
  const partes = [
    conducao,
    fone ? `Contato ${fone}` : '',
    identificacao ? `Identificação ${identificacao}` : '',
  ].filter(Boolean);
  if (!partes.length) return '';
  return `${partes.join('. ')}.`;
}

function fraseTempo(entrada: EntradaRelato): string {
  if (!entrada.hrsTrabalhada && !entrada.franquiaHora) return '';
  let tempo = entrada.hrsTrabalhada ? `Duração de ${entrada.hrsTrabalhada}` : 'Jornada';
  if (entrada.franquiaHora) tempo += `, dentro da franquia de ${entrada.franquiaHora}`;
  if (entrada.hrsExcedente && !tempoZerado(entrada.hrsExcedente)) {
    tempo += `, com ${entrada.hrsExcedente} de hora extra`;
    if (entrada.valorHrsExcedente != null && entrada.valorHrsExcedente > 0) tempo += ` (${reais(entrada.valorHrsExcedente)})`;
  } else if (entrada.hrsExcedente && entrada.franquiaHora) tempo += ', sem hora extra';
  return `${tempo}.`;
}

function frasePercurso(entrada: EntradaRelato): string {
  if (entrada.kmRodado == null && entrada.kmInicio == null && entrada.kmFim == null && !(entrada.franquiaKm != null && entrada.franquiaKm > 0)) return '';
  const partes: string[] = [];
  if (entrada.kmRodado != null) partes.push(`percorridos ${km(entrada.kmRodado)} km`);
  if (entrada.kmInicio != null && entrada.kmFim != null) partes.push(`hodômetro de ${km(entrada.kmInicio)} a ${km(entrada.kmFim)}`);
  if (entrada.franquiaKm != null && entrada.franquiaKm > 0) partes.push(`franquia de ${km(entrada.franquiaKm)} km`);
  if (entrada.kmExcedente != null && entrada.kmExcedente > 0) {
    let extra = `${km(entrada.kmExcedente)} km excedentes`;
    if (entrada.valorKmExcedente != null && entrada.valorKmExcedente > 0) extra += ` (${reais(entrada.valorKmExcedente)})`;
    partes.push(extra);
  } else if (entrada.kmExcedente === 0) partes.push('sem quilometragem excedente');
  if (!partes.length) return '';
  const texto = juntarFrase(partes);
  return `${texto.charAt(0).toLocaleUpperCase('pt-BR')}${texto.slice(1)}.`;
}

function fraseValores(entrada: EntradaRelato): string {
  const partes = [
    entrada.valorAcionamento != null ? `acionamento de ${reais(entrada.valorAcionamento)}` : '',
    entrada.pedagio != null ? `pedágio de ${reais(entrada.pedagio)}` : '',
    entrada.valorHrsExcedente != null && entrada.valorHrsExcedente > 0 ? `hora extra de ${reais(entrada.valorHrsExcedente)}` : '',
    entrada.valorKmExcedente != null && entrada.valorKmExcedente > 0 ? `km excedente de ${reais(entrada.valorKmExcedente)}` : '',
    entrada.valorTotal != null ? `total de ${reais(entrada.valorTotal)}` : '',
  ].filter((parte): parte is string => Boolean(parte));
  if (!partes.length && !(entrada.tarifaHora != null && entrada.tarifaHora > 0) && !(entrada.tarifaKm != null && entrada.tarifaKm > 0)) return '';
  const texto = juntarFrase(partes);
  const tarifas = [
    entrada.tarifaHora != null && entrada.tarifaHora > 0 ? `hora extra a ${reais(entrada.tarifaHora)}` : '',
    entrada.tarifaKm != null && entrada.tarifaKm > 0 ? `km excedente a ${reais(entrada.tarifaKm)}` : '',
  ].filter((parte): parte is string => Boolean(parte));
  const principal = texto ? `${texto.charAt(0).toLocaleUpperCase('pt-BR')}${texto.slice(1)}.` : '';
  const tarifa = tarifas.length ? `Tarifa de ${juntarFrase(tarifas)}.` : '';
  return [principal, tarifa].filter(Boolean).join(' ');
}

function fraseResponsavel(entrada: EntradaRelato): string {
  const solicitante = preenchido(entrada.solicitante) ? nomeLegivel(preenchido(entrada.solicitante)) : '';
  const autorizou = preenchido(entrada.quemAutorizou) ? nomeLegivel(preenchido(entrada.quemAutorizou)) : '';
  if (solicitante && autorizou) return `Solicitado por ${solicitante} e autorizado por ${autorizou}.`;
  if (solicitante) return `Solicitado por ${solicitante}.`;
  if (autorizou) return `Autorizado por ${autorizou}.`;
  return '';
}

function fraseOperacao(entrada: EntradaRelato): string {
  const partes = [
    preenchido(entrada.operacao) ? `operação ${nomeLegivel(preenchido(entrada.operacao))}` : '',
    preenchido(entrada.contrato) ? `contrato ${nomeLegivel(preenchido(entrada.contrato))}` : '',
    preenchido(entrada.atendimentoPgr) ? `atendimento PGR ${nomeLegivel(preenchido(entrada.atendimentoPgr))}` : '',
    preenchido(entrada.tsp) ? `TSP ${preenchido(entrada.tsp)}` : '',
  ].filter((parte): parte is string => Boolean(parte));
  if (!partes.length) return '';
  const texto = juntarFrase(partes);
  return `${texto.charAt(0).toLocaleUpperCase('pt-BR')}${texto.slice(1)}.`;
}

export function relatoMedicao(entrada: EntradaRelato): TrechoRelato[] {
  const candidatos: Array<[string, string]> = [
    ['Serviço', fraseServico(entrada)],
    ['Trajeto', fraseTrajeto(entrada)],
    ['Motorista', fraseMotorista(entrada)],
    ['Tempo', fraseTempo(entrada)],
    ['Percurso', frasePercurso(entrada)],
    ['Valores', fraseValores(entrada)],
    ['Responsável', fraseResponsavel(entrada)],
    ['Operação', fraseOperacao(entrada)],
  ];
  const itens = candidatos
    .map(([rotulo, texto]) => ({ rotulo, texto: texto.replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.texto && item.texto !== '.');
  if (preenchido(entrada.obs)) itens.push({ rotulo: 'Obs', texto: preenchido(entrada.obs) });
  return itens;
}
