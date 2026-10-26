import React, { useEffect, useRef, useState } from 'react';
import { Autocomplete, useLoadScript } from '@react-google-maps/api';
import { Calendar, Loader2 } from 'lucide-react';
import { googleMapsLoadConfig } from '../../lib/maps';
import type { CampoListaSolicitacao } from '../../lib/cevaPortal/camposCliente';
import { ListaCatalogo } from './ListaCatalogo';
import { usePortalCliente } from './portalMarca';

type Props = {
  onFechar: () => void;
  onCriada: () => void;
  /** Tela local. Não chama a API e não abre OS. */
  somenteVisualizacao?: boolean;
};

const CAMPO = 'h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-[var(--portal-acao)] focus:ring-4 focus:ring-[var(--portal-anel)]';

const Secao: React.FC<{ passo: string; titulo: string; texto: string; children: React.ReactNode }> = ({ passo, titulo, texto, children }) => (
  <section className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.65)]">
    <div className="mb-3 flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--portal-marca)] text-sm font-black text-white shadow-lg">{passo}</span>
      <div>
        <h3 className="text-sm font-black text-slate-800">{titulo}</h3>
        <p className="text-xs leading-5 text-slate-500">{texto}</p>
      </div>
    </div>
    {children}
  </section>
);

const Escolha: React.FC<{ ativo: boolean; onClick: () => void; titulo: string; texto: string }> = ({ ativo, onClick, titulo, texto }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={ativo}
    className={`relative rounded-2xl border px-4 py-4 text-left transition ${ativo ? 'border-[#0B2545] bg-[#0B2545] text-white shadow-[0_16px_30px_-18px_rgba(11,37,69,0.9)]' : 'border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:bg-white hover:shadow-md'}`}
  >
    {ativo && (
      <span className="absolute -top-2 right-3 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#0B2545] shadow-md [clip-path:polygon(8px_0,100%_0,100%_100%,8px_100%,0_50%)]">
        Selecionado
      </span>
    )}
    <span className={`block text-sm font-black ${ativo ? 'text-white' : 'text-slate-800'}`}>{titulo}</span>
    <span className={`mt-0.5 block text-xs font-semibold ${ativo ? 'text-white/75' : 'text-slate-500'}`}>{texto}</span>
  </button>
);

const EXEMPLO_MOTORISTAS = [
  { nome: 'JOÃO SILVA', telefone: '(11) 98888-7777' },
  { nome: 'JOAO SILVA', telefone: '11988887777' },
  { nome: 'CARLOS SOUZA', telefone: '(11) 97777-6666' },
];
const EXEMPLO_VEICULOS = [
  { placa: 'ABC1D23', modelo: 'SCANIA' },
  { placa: 'QWE2R34', modelo: 'VOLVO' },
];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function mascaraDia(bruto: string): string {
  const digits = bruto.replace(/\D/g, '').slice(0, 8);
  let texto = digits.slice(0, 2);
  if (digits.length > 2) texto += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) texto += `/${digits.slice(4, 8)}`;
  return texto;
}

function partirDataHora(valor: string): { dia: string; hora: string; minuto: string } {
  const completo = String(valor || '').match(/^(\d{2}\/\d{2}\/\d{4})(?: (\d{2}))?(?::(\d{2}))?$/);
  if (completo) return { dia: completo[1], hora: completo[2] || '', minuto: completo[3] || '' };
  return { dia: mascaraDia(valor), hora: '', minuto: '' };
}

function juntarDataHora(dia: string, hora: string, minuto: string): string {
  if (dia.length < 10) return dia;
  if (!hora) return dia;
  if (!minuto) return `${dia} ${hora}`;
  return `${dia} ${hora}:${minuto}`;
}

function aplicarHoraDigitada(bruto: string): { hora: string; minuto: string } {
  const digits = bruto.replace(/\D/g, '').slice(0, 4);
  if (!digits) return { hora: '', minuto: '' };
  if (digits.length <= 2 && Number(digits) <= 23) return { hora: digits, minuto: '' };
  const horaBruta = digits.slice(0, 2);
  const hora = Number(horaBruta) <= 23 ? horaBruta : digits.slice(0, 1);
  let minuto = Number(horaBruta) <= 23 ? digits.slice(2, 4) : digits.slice(1, 3);
  if (minuto.length === 2 && Number(minuto) > 59) minuto = '59';
  return { hora: hora.padStart(2, '0'), minuto };
}

function textoHora(hora: string, minuto: string): string {
  if (!hora) return '';
  if (!minuto) return hora.length === 2 ? `${hora}:` : hora;
  return `${hora}:${minuto}`;
}

function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function nomeCombina(nome: string, termo: string): boolean {
  const partes = normalizarBusca(termo).split(/\s+/).filter(Boolean);
  if (!partes.length) return false;
  const base = normalizarBusca(nome);
  return partes.every((parte) => base.includes(parte));
}

function chaveMotorista(item: { nome: string; telefone: string }): string {
  return `${normalizarBusca(item.nome)}|${item.telefone.replace(/\D/g, '')}`;
}

function motoristasUnicos<T extends { nome: string; telefone: string }>(lista: T[]): T[] {
  const mapa = new Map<string, T>();
  for (const item of lista) {
    const chave = chaveMotorista(item);
    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, item);
      continue;
    }
    const atualTemAcento = /[^\u0000-\u007f]/.test(atual.nome);
    const novoTemAcento = /[^\u0000-\u007f]/.test(item.nome);
    if (novoTemAcento && !atualTemAcento) mapa.set(chave, item);
  }
  return [...mapa.values()];
}

function dataDoTexto(dia: string): { ano: number; mes: number; dia: number } | null {
  const match = dia.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const diaNum = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3]);
  const data = new Date(ano, mes - 1, diaNum);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== diaNum) return null;
  return { ano, mes: mes - 1, dia: diaNum };
}

function diaAntesDeHoje(ano: number, mes: number, dia: number, hoje: Date): boolean {
  const escolhido = new Date(ano, mes, dia).setHours(0, 0, 0, 0);
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).setHours(0, 0, 0, 0);
  return escolhido < inicioHoje;
}

function dataDeHojeOuFutura(valor: string): boolean {
  const lida = dataDoTexto(partirDataHora(valor).dia);
  if (!lida) return false;
  return !diaAntesDeHoje(lida.ano, lida.mes, lida.dia, new Date());
}

const CampoData: React.FC<{ rotulo: string; valor: string; onChange: (valor: string) => void; obrigatorio?: boolean }> = ({ rotulo, valor, onChange, obrigatorio = false }) => {
  const caixa = useRef<HTMLDivElement>(null);
  const horaRef = useRef<HTMLInputElement>(null);
  const partes = partirDataHora(valor);
  const { dia } = partes;
  const diaPronto = dataDoTexto(dia) !== null;
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState('');
  const [hora, setHora] = useState(partes.hora);
  const [minuto, setMinuto] = useState(partes.minuto);
  const hoje = new Date();
  const marcada = dataDoTexto(dia);
  const [ano, setAno] = useState(marcada?.ano ?? hoje.getFullYear());
  const [mes, setMes] = useState(marcada?.mes ?? hoje.getMonth());

  useEffect(() => {
    if (!valor) {
      setHora('');
      setMinuto('');
      return;
    }
    if (partes.hora) {
      setHora(partes.hora);
      setMinuto(partes.minuto);
    }
  }, [valor, partes.hora, partes.minuto]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (event: MouseEvent) => {
      if (!caixa.current?.contains(event.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  const escolherDia = (proximo: string) => {
    const lida = dataDoTexto(proximo);
    if (lida && diaAntesDeHoje(lida.ano, lida.mes, lida.dia, hoje)) {
      setAviso('Escolha hoje ou um dia à frente.');
      return;
    }
    setAviso('');
    onChange(juntarDataHora(proximo, hora, minuto));
  };
  const abrirCalendario = () => {
    const atual = dataDoTexto(dia);
    const base = atual && !diaAntesDeHoje(atual.ano, atual.mes, atual.dia, hoje)
      ? atual
      : { ano: hoje.getFullYear(), mes: hoje.getMonth(), dia: hoje.getDate() };
    setAno(base.ano);
    setMes(base.mes);
    setAberto((esta) => !esta);
  };
  const mesAnteriorTravado = ano < hoje.getFullYear() || (ano === hoje.getFullYear() && mes <= hoje.getMonth());
  const mudarMes = (delta: number) => {
    if (delta < 0 && mesAnteriorTravado) return;
    const data = new Date(ano, mes + delta, 1);
    setAno(data.getFullYear());
    setMes(data.getMonth());
  };
  const marcarDia = (numero: number, anoAlvo = ano, mesAlvo = mes) => {
    if (diaAntesDeHoje(anoAlvo, mesAlvo, numero, hoje)) return;
    escolherDia(`${String(numero).padStart(2, '0')}/${String(mesAlvo + 1).padStart(2, '0')}/${anoAlvo}`);
    setAberto(false);
    window.setTimeout(() => horaRef.current?.focus(), 0);
  };
  const primeiro = new Date(ano, mes, 1).getDay();
  const total = new Date(ano, mes + 1, 0).getDate();
  const casas = [...Array(primeiro).fill(0), ...Array.from({ length: total }, (_, indice) => indice + 1)];
  const ehHoje = (numero: number) => numero === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();

  return (
    <div ref={caixa} className={`relative rounded-2xl border border-slate-200 bg-slate-50 p-3 md:col-span-2 ${aberto ? 'z-20' : ''}`}>
      <p className="text-sm font-bold text-slate-700">{rotulo}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="relative min-w-0">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">Data
            <span className="mt-1 flex gap-2">
              <input
                type="text"
                required={obrigatorio}
                inputMode="numeric"
                autoComplete="off"
                placeholder="dd/mm/aaaa"
                value={dia}
                onChange={(event) => escolherDia(mascaraDia(event.target.value))}
                className={`${CAMPO} min-w-0`}
              />
              <button type="button" onClick={abrirCalendario} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B2545] text-white shadow-sm" title="Abrir calendário" aria-expanded={aberto}>
                <Calendar size={16} />
              </button>
            </span>
          </label>
          {aberto && (
            <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_40px_-18px_rgba(11,37,69,0.45)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <button type="button" onClick={() => mudarMes(-1)} disabled={mesAnteriorTravado} className="h-8 w-8 rounded-xl text-sm font-black text-[#0B2545] hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300" aria-label="Mês anterior">‹</button>
                <p className="text-sm font-black capitalize text-[#0B2545]">{MESES[mes]} {ano}</p>
                <button type="button" onClick={() => mudarMes(1)} className="h-8 w-8 rounded-xl text-sm font-black text-[#0B2545] hover:bg-slate-100" aria-label="Próximo mês">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">
                {SEMANA.map((nome, indice) => <span key={`${nome}-${indice}`}>{nome}</span>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {casas.map((numero, indice) => numero === 0 ? <span key={`vazio-${indice}`} /> : (
                  <button
                    key={numero}
                    type="button"
                    disabled={diaAntesDeHoje(ano, mes, numero, hoje)}
                    onClick={() => marcarDia(numero)}
                    className={`h-8 rounded-lg text-xs font-bold ${diaAntesDeHoje(ano, mes, numero, hoje) ? 'cursor-not-allowed text-slate-300' : marcada?.dia === numero && marcada.mes === mes && marcada.ano === ano ? 'bg-[#0B2545] text-white' : ehHoje(numero) ? 'bg-slate-100 text-[#0B2545] ring-1 ring-[#0B2545]' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    {numero}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => marcarDia(hoje.getDate(), hoje.getFullYear(), hoje.getMonth())}
                className="mt-2 w-full rounded-xl py-1.5 text-xs font-bold text-[#0B2545] hover:bg-slate-50"
              >
                Hoje
              </button>
            </div>
          )}
        </div>
        <label className="block min-w-0 text-[11px] font-bold uppercase tracking-wide text-slate-400">Hora
          <input
            ref={horaRef}
            type="text"
            required={obrigatorio}
            inputMode="numeric"
            autoComplete="off"
            placeholder="hh:mm"
            aria-label={`${rotulo} hora`}
            value={textoHora(hora, minuto)}
            onChange={(event) => {
              const digitada = aplicarHoraDigitada(event.target.value);
              setHora(digitada.hora);
              setMinuto(digitada.minuto);
              if (dia.length >= 10) onChange(juntarDataHora(dia, digitada.hora, digitada.minuto));
            }}
            className={`${CAMPO} mt-1`}
          />
        </label>
      </div>
      {aviso && <span className="mt-2 block text-xs font-bold text-red-700">{aviso}</span>}
      {rotulo === 'Início' && hora.length === 2 && minuto.length === 2 && diaPronto && !aviso && (
        <span className="mt-2 block text-xs font-bold text-[#0B2545]">
          A OS abre com início em {dia} às {hora}:{minuto}.
        </span>
      )}
    </div>
  );
};
const LISTA_VAZIA: Record<CampoListaSolicitacao, string[]> = {
  operacao: [],
  quemAutorizou: [],
  contrato: [],
  tsp: [],
  atendimentoPgr: [],
};
function enderecoVindoDaCotacao(campo: 'origem' | 'destino'): string {
  try {
    const bruto = sessionStorage.getItem('tmseg-cotacao-os');
    if (!bruto) return '';
    const dados = JSON.parse(bruto) as { origem?: string; destino?: string };
    return String(dados[campo] || '');
  } catch {
    return '';
  }
}

const LISTA_EXEMPLO: Record<CampoListaSolicitacao, string[]> = {
  operacao: ['DEDICADO', 'SPOT'],
  quemAutorizou: ['JOÃO SILVA'],
  contrato: ['CONTRATO 2026'],
  tsp: ['TRANSPORTADORA EXEMPLO'],
  atendimentoPgr: ['PGR PADRÃO'],
};

export const SolicitarEscolta: React.FC<Props> = ({ onFechar, onCriada, somenteVisualizacao = false }) => {
  const portal = usePortalCliente();
  const ceva = portal.marca.id === 'ceva';
  const { isLoaded } = useLoadScript(googleMapsLoadConfig);
  const origemRef = useRef<google.maps.places.Autocomplete | null>(null);
  const destinoRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [origem, setOrigem] = useState(() => enderecoVindoDaCotacao('origem'));
  const [destino, setDestino] = useState(() => enderecoVindoDaCotacao('destino'));
  useEffect(() => {
    const timer = window.setTimeout(() => sessionStorage.removeItem('tmseg-cotacao-os'), 400);
    return () => window.clearTimeout(timer);
  }, []);
  const [pedido, setPedido] = useState('');
  const [agentes, setAgentes] = useState<1 | 2 | 0>(0);
  const [dataInicio, setDataInicio] = useState('');
  const [operacao, setOperacao] = useState(somenteVisualizacao ? 'DEDICADO' : '');
  const [identificacao, setIdentificacao] = useState('');
  const [motorista, setMotorista] = useState('');
  const [motoristaEscolhido, setMotoristaEscolhido] = useState('');
  const [placa, setPlaca] = useState('');
  const [telefone, setTelefone] = useState('');
  const [telefoneSugerido, setTelefoneSugerido] = useState('');
  const [telefoneConfirmado, setTelefoneConfirmado] = useState(false);
  const [motoristas, setMotoristas] = useState(somenteVisualizacao ? EXEMPLO_MOTORISTAS : [] as { nome: string; telefone: string }[]);
  const [veiculos, setVeiculos] = useState(somenteVisualizacao ? EXEMPLO_VEICULOS : [] as { placa: string; modelo: string }[]);
  const [quemAutorizou, setQuemAutorizou] = useState(somenteVisualizacao ? 'JOÃO SILVA' : '');
  const [atendimentoPgr, setAtendimentoPgr] = useState(somenteVisualizacao ? 'PGR PADRÃO' : '');
  const [tsp, setTsp] = useState(somenteVisualizacao ? 'TRANSPORTADORA EXEMPLO' : '');
  const [contrato, setContrato] = useState(somenteVisualizacao ? 'CONTRATO 2026' : '');
  const [quantidade, setQuantidade] = useState(1);
  const [listas, setListas] = useState(somenteVisualizacao ? LISTA_EXEMPLO : LISTA_VAZIA);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const podeRemover = somenteVisualizacao || portal.ler()?.user.perfil === 'administrador';

  useEffect(() => {
    if (somenteVisualizacao) return;
    let ativo = true;
    fetch(portal.url('/catalogo'), { headers: portal.cabecalhos() })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) portal.sair();
        if (!response.ok || !ativo) return;
        const catalogo = data.catalogo || {};
        setListas({
          operacao: Array.isArray(catalogo.operacao) ? catalogo.operacao : [],
          quemAutorizou: Array.isArray(catalogo.quemAutorizou) ? catalogo.quemAutorizou : [],
          contrato: Array.isArray(catalogo.contrato) ? catalogo.contrato : [],
          tsp: Array.isArray(catalogo.tsp) ? catalogo.tsp : [],
          atendimentoPgr: Array.isArray(catalogo.atendimentoPgr) ? catalogo.atendimentoPgr : [],
        });
      })
      .catch(() => undefined);
    fetch(portal.url('/frota'), { headers: portal.cabecalhos() })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !ativo) return;
        if (Array.isArray(data.motoristas)) setMotoristas(data.motoristas);
        if (Array.isArray(data.veiculos)) setVeiculos(data.veiculos);
      })
      .catch(() => undefined);
    return () => { ativo = false; };
  }, [portal, somenteVisualizacao]);

  const definirLista = (campo: CampoListaSolicitacao, opcoes: string[]) => {
    setListas((atual) => ({ ...atual, [campo]: opcoes }));
  };

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro('');
    setOk('');
    setEnviando(true);
    try {
      const copias = Math.min(20, Math.max(1, quantidade));
      if (dataInicio.length < 16) {
        setErro('Informe a data e digite a hora. Exemplo: 22/10/2026 08:30.');
        return;
      }
      if (telefoneSugerido && !telefoneConfirmado) {
        setErro('Confirme se o telefone do motorista está correto.');
        return;
      }
      if (somenteVisualizacao) {
        setOk(copias === 1
          ? 'OS GTM-0000 aberta como SOLICITADA. Nesta visualização nada foi gravado. O valor só aparece depois da validação.'
          : `${copias} OS abertas como SOLICITADA, com a mesma situação. Nesta visualização nada foi gravado.`);
        onCriada();
        return;
      }
      const response = await fetch(portal.url('/solicitacoes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...portal.cabecalhos() },
        body: JSON.stringify({
          pedido,
          agentes: pedido === 'Escolta Velada' ? agentes : null,
          dataInicio,
          dataFim: null,
          origem,
          destino,
          operacao,
          identificacao,
          motorista,
          placa,
          telefone,
          quemAutorizou,
          atendimentoPgr,
          tsp,
          contrato,
          quantidade: copias,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar a solicitação.');
      const numeros = Array.isArray(data.oss) && data.oss.length ? data.oss.join(', ') : String(data.os || '');
      const aviso = data.incompleto ? ' Nem todas as cópias entraram.' : '';
      setOk(`OS ${numeros} aberta como SOLICITADA.${aviso} O valor só aparece depois da validação.`);
      onCriada();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível registrar a solicitação.');
    } finally {
      setEnviando(false);
    }
  };

  const endereco = (rotulo: string, valor: string, setValor: (texto: string) => void, ref: React.MutableRefObject<google.maps.places.Autocomplete | null>) => (
    <label className="block text-sm font-bold text-slate-600">{rotulo}
      {isLoaded ? (
        <Autocomplete
          onLoad={(ac) => { ref.current = ac; }}
          onPlaceChanged={() => {
            const place = ref.current?.getPlace();
            if (place?.formatted_address) setValor(place.formatted_address);
          }}
          options={{ componentRestrictions: { country: 'br' } }}
        >
          <input defaultValue={valor} onChange={(event) => setValor(event.target.value)} className={`${CAMPO} mt-1 uppercase`} required />
        </Autocomplete>
      ) : (
        <input value={valor} onChange={(event) => setValor(event.target.value)} className={`${CAMPO} mt-1 uppercase`} required />
      )}
    </label>
  );

  const escoltaVelada = pedido === 'Escolta Velada';
  const servicoDefinido = pedido === 'Escolta Caracterizada' || (escoltaVelada && (agentes === 1 || agentes === 2));
  const placaLimpa = placa.replace(/[^A-Z0-9]/g, '');
  const veiculoPronto = placaLimpa.length >= 7;
  const motoristaPronto = motoristaEscolhido.length > 0
    && telefone.replace(/\D/g, '').length >= 8
    && !(telefoneSugerido && !telefoneConfirmado);
  const operacaoPronta = operacao.trim().length >= 2;
  const ondeDefinido = servicoDefinido && dataInicio.length >= 16 && dataDeHojeOuFutura(dataInicio) && origem.trim().length >= 3 && destino.trim().length >= 3;
  const viagemDefinida = ondeDefinido && operacaoPronta && motoristaPronto && veiculoPronto;
  const faltasViagem = [
    !operacaoPronta ? 'a operação' : '',
    !motoristaPronto ? 'o motorista com o telefone confirmado' : '',
    !veiculoPronto ? 'o veículo' : '',
  ].filter(Boolean);
  const faltasTexto = faltasViagem.length <= 1
    ? (faltasViagem[0] || '')
    : `${faltasViagem.slice(0, -1).join(', ')} e ${faltasViagem[faltasViagem.length - 1]}`;
  const avisoParada = faltasViagem.length
    ? `Não avança porque falta ${faltasTexto}. A próxima etapa fica fechada até ${faltasViagem.length > 1 ? 'esses dados entrarem' : 'esse dado entrar'}.${operacaoPronta ? '' : ' Clique em Novo, ao lado de Operação, escreva o nome e confirme.'}`
    : '';
  const etapas = [
    { titulo: 'Tipo de escolta', pronta: pedido === 'Escolta Caracterizada' || pedido === 'Escolta Velada' },
    ...(escoltaVelada ? [{ titulo: 'Agentes', pronta: agentes === 1 || agentes === 2 }] : []),
    { titulo: 'Quando e onde', pronta: ondeDefinido },
    { titulo: 'A viagem', pronta: viagemDefinida },
    ...(ceva ? [{ titulo: 'Dados da CEVA', pronta: viagemDefinida }] : []),
  ];
  const etapasProntas = etapas.filter((etapa) => etapa.pronta).length;
  const percentual = Math.round((etapasProntas / etapas.length) * 100);
  const etapaAtual = etapas.findIndex((etapa) => !etapa.pronta);
  const passoOnde = escoltaVelada ? '3' : '2';
  const passoViagem = escoltaVelada ? '4' : '3';
  const passoCeva = escoltaVelada ? '5' : '4';
  const escolherPedido = (valor: string) => {
    setPedido(valor);
    setAgentes(0);
  };
  const ajustarQuantidade = (proxima: number) => setQuantidade(Math.min(20, Math.max(1, proxima)));
  const motoristasBase = motoristasUnicos(motoristas);
  const motoristasAchados = motorista.trim() ? motoristasBase.filter((item) => nomeCombina(item.nome, motorista)) : [];
  const motoristasVisiveis = motoristaEscolhido
    ? motoristasAchados.filter((item) => chaveMotorista(item) === motoristaEscolhido)
    : motoristasAchados;
  const veiculosAchados = placa.trim() ? veiculos.filter((item) => nomeCombina(`${item.placa} ${item.modelo}`, placa)) : [];

  return (
    <form onSubmit={enviar} className="mb-4 space-y-3" data-testid="form-solicitar-escolta">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-xl font-black text-[var(--portal-marca)]">Solicitar escolta</h2>
          <p className="text-xs text-slate-500">Uma etapa de cada vez. O preço não entra aqui.</p>
        </div>
        <button type="button" onClick={onFechar} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 shadow-sm">Fechar</button>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Processo</p>
          <p className="text-sm font-black text-blue-700">{percentual}% concluído</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percentual}%` }} />
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-4">
          <p className="px-2 pb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">Etapas</p>
          <ol className="space-y-1">
            {etapas.map((etapa, indice) => {
              const agora = indice === etapaAtual;
              return (
                <li key={etapa.titulo} className={`flex items-center gap-2 rounded-2xl px-2 py-2 ${etapa.pronta ? 'bg-blue-50' : agora ? 'bg-slate-50' : ''}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${etapa.pronta ? 'bg-blue-600 text-white' : agora ? 'border-2 border-blue-600 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{etapa.pronta ? '✓' : indice + 1}</span>
                  <span>
                    <span className={`block text-xs font-black ${etapa.pronta || agora ? 'text-slate-800' : 'text-slate-400'}`}>{etapa.titulo}</span>
                    <span className={`block text-[10px] font-bold ${etapa.pronta ? 'text-blue-700' : 'text-slate-400'}`}>{etapa.pronta ? 'Concluída' : agora ? 'Agora' : 'Pendente'}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>
        <div className="space-y-3">
      <Secao passo="1" titulo="O que você precisa" texto="Escolha escolta caracterizada ou escolta velada.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Escolha ativo={pedido === 'Escolta Caracterizada'} onClick={() => escolherPedido('Escolta Caracterizada')} titulo="Escolta Caracterizada" texto="Identificação visível" />
          <Escolha ativo={pedido === 'Escolta Velada'} onClick={() => escolherPedido('Escolta Velada')} titulo="Escolta Velada" texto="Sem identificação aparente" />
        </div>
      </Secao>
      {escoltaVelada && (
        <Secao passo="2" titulo="Quantos agentes" texto="Na escolta velada, informe um ou dois agentes.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Escolha ativo={agentes === 1} onClick={() => setAgentes(1)} titulo="1 agente" texto="Uma pessoa na escolta" />
            <Escolha ativo={agentes === 2} onClick={() => setAgentes(2)} titulo="2 agentes" texto="Duas pessoas na escolta" />
          </div>
        </Secao>
      )}
      {servicoDefinido && (
      <Secao passo={passoOnde} titulo="Quando e onde" texto="A data é hoje ou um dia à frente. A hora fica ao lado e entra na OS.">
        <div className="grid gap-3 md:grid-cols-2">
          <CampoData rotulo="Início" valor={dataInicio} onChange={setDataInicio} obrigatorio />
          {endereco('Origem', origem, setOrigem, origemRef)}
          {endereco('Destino', destino, setDestino, destinoRef)}
        </div>
      </Secao>
      )}
      {ondeDefinido && (
      <Secao passo={passoViagem} titulo="A viagem" texto="Operação, motorista e veículo saem do cadastro. Ao escolher o motorista, confira o telefone.">
        <div className="grid gap-3 md:grid-cols-2">
          <ListaCatalogo
            rotulo="Operação"
            campo="operacao"
            valor={operacao}
            opcoes={listas.operacao}
            obrigatorio
            avisoVazio="Falta este nome. Sem ele o formulário não avança. Clique em Novo, escreva o nome e confirme."
            podeRemover={podeRemover}
            somenteVisualizacao={somenteVisualizacao}
            onChange={setOperacao}
            onOpcoes={(opcoes) => definirLista('operacao', opcoes)}
          />
          <label className="block text-sm font-bold text-slate-600">Controle Interno da OS
            <span className="mt-0.5 block text-xs font-semibold text-slate-500">Se quiser, inclua um número de identificação interna, como NF, processo, SM etc.</span>
            <input value={identificacao} onChange={(event) => setIdentificacao(event.target.value)} className={`${CAMPO} mt-1 uppercase`} placeholder="NF, processo, SM..." />
          </label>
          <div className="block text-sm font-bold text-slate-600 md:col-span-2">Motorista
            <input required value={motorista} onChange={(event) => { setMotorista(event.target.value.toUpperCase()); setMotoristaEscolhido(''); setTelefone(''); setTelefoneSugerido(''); setTelefoneConfirmado(false); }} className={`${CAMPO} mt-1 uppercase`} placeholder="Digite o nome para filtrar" />
            {motorista.trim() ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {motoristasVisiveis.slice(0, 24).map((item) => {
                  const chave = chaveMotorista(item);
                  const ativo = motoristaEscolhido === chave;
                  return (
                    <button key={chave} type="button" onClick={() => { setMotorista(item.nome); setMotoristaEscolhido(chave); setTelefone(item.telefone); setTelefoneSugerido(item.telefone); setTelefoneConfirmado(false); }} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-black ${ativo ? 'border-[#0B2545] bg-[#0B2545] text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                      {item.nome}
                      {ativo && <span className="rounded-sm bg-white px-1.5 py-0.5 text-[9px] font-black uppercase text-[#0B2545]">Selecionado</span>}
                    </button>
                  );
                })}
                {!motoristaEscolhido && motoristasAchados.length > 24 && (
                  <p className="w-full text-xs font-semibold text-slate-500">Há mais nomes. Continue digitando para reduzir.</p>
                )}
                {motoristasVisiveis.length === 0 && (
                  <p className="text-xs font-semibold text-slate-500">Nenhum motorista com esse nome. Escolha um nome da lista para o telefone aparecer.</p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs font-semibold text-slate-500">A lista fica oculta até você digitar. Só aparecem os nomes que tiverem essa palavra.</p>
            )}
            {motoristaEscolhido && (
              <div className="mt-3 rounded-2xl border border-[#0B2545]/20 bg-[#0B2545]/5 p-3">
                <label className="block text-sm font-bold text-slate-600">Telefone de {motorista}
                  <input required value={telefone} onChange={(event) => { setTelefone(event.target.value); setTelefoneConfirmado(false); }} className={`${CAMPO} mt-1`} placeholder="(11) 99999-8888" />
                </label>
                {telefoneSugerido && (
                  <div className="mt-3">
                    <p className="text-sm font-bold text-[#0B2545]">O telefone de {motorista} no cadastro é {telefoneSugerido}. Está correto?</p>
                    <button type="button" onClick={() => setTelefoneConfirmado(true)} className={`mt-2 rounded-full px-4 py-2 text-xs font-black ${telefoneConfirmado ? 'bg-[#0B2545] text-white' : 'bg-white text-[#0B2545]'}`}>
                      {telefoneConfirmado ? 'Número confirmado' : 'Sim, o número está correto'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="block text-sm font-bold text-slate-600 md:col-span-2">Veículo
            <input required value={placa} onChange={(event) => setPlaca(event.target.value.toUpperCase())} className={`${CAMPO} mt-1 uppercase`} placeholder="Digite a placa para filtrar" />
            {placa.trim() ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {veiculosAchados.slice(0, 24).map((item) => {
                  const ativo = placa === item.placa;
                  return (
                    <button key={item.placa} type="button" onClick={() => setPlaca(item.placa)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-black ${ativo ? 'border-[#0B2545] bg-[#0B2545] text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                      {item.placa}{item.modelo ? ` · ${item.modelo}` : ''}
                      {ativo && <span className="rounded-sm bg-white px-1.5 py-0.5 text-[9px] font-black uppercase text-[#0B2545]">Selecionado</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-1 text-xs font-semibold text-slate-500">A lista de placas fica oculta até você digitar.</p>
            )}
            {avisoParada && (
              <div role="status" className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
                {avisoParada}
              </div>
            )}
          </div>
        </div>
      </Secao>
      )}
      {viagemDefinida && ceva && (
        <Secao passo={passoCeva} titulo="Dados da CEVA" texto="Os mesmos nomes do controle. Toque para escolher ou cadastre com Novo.">
          <div className="grid gap-3 md:grid-cols-2">
            <ListaCatalogo rotulo="Quem autorizou" campo="quemAutorizou" valor={quemAutorizou} opcoes={listas.quemAutorizou} podeRemover={podeRemover} somenteVisualizacao={somenteVisualizacao} onChange={setQuemAutorizou} onOpcoes={(opcoes) => definirLista('quemAutorizou', opcoes)} />
            <ListaCatalogo rotulo="Contrato" campo="contrato" valor={contrato} opcoes={listas.contrato} podeRemover={podeRemover} somenteVisualizacao={somenteVisualizacao} onChange={setContrato} onOpcoes={(opcoes) => definirLista('contrato', opcoes)} />
            <ListaCatalogo rotulo="TSP (Transportadora)" campo="tsp" valor={tsp} opcoes={listas.tsp} podeRemover={podeRemover} somenteVisualizacao={somenteVisualizacao} onChange={setTsp} onOpcoes={(opcoes) => definirLista('tsp', opcoes)} />
            <ListaCatalogo rotulo="Atendimento PGR" campo="atendimentoPgr" valor={atendimentoPgr} opcoes={listas.atendimentoPgr} podeRemover={podeRemover} somenteVisualizacao={somenteVisualizacao} onChange={setAtendimentoPgr} onOpcoes={(opcoes) => definirLista('atendimentoPgr', opcoes)} />
          </div>
        </Secao>
      )}
      {erro && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</p>}
      {ok && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{ok}</p>}
      {viagemDefinida && (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[var(--portal-marca)] p-4 text-white shadow-[0_22px_40px_-24px_rgba(15,23,42,0.8)]">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white/70">Quantas OS iguais</p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => ajustarQuantidade(quantidade - 1)} className="h-10 w-10 rounded-2xl bg-white/15 text-lg font-black">−</button>
            <span className="w-8 text-center text-2xl font-black">{quantidade}</span>
            <button type="button" onClick={() => ajustarQuantidade(quantidade + 1)} className="h-10 w-10 rounded-2xl bg-white/15 text-lg font-black">+</button>
            {[1, 2, 3].map((numero) => (
              <button key={numero} type="button" onClick={() => ajustarQuantidade(numero)} className={`h-10 rounded-2xl px-3 text-sm font-black ${quantidade === numero ? 'bg-white text-[var(--portal-marca)]' : 'bg-white/10'}`}>{numero}</button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={enviando} className="h-12 rounded-2xl bg-[var(--portal-acao)] px-5 text-sm font-black text-[var(--portal-acao-texto)] shadow-lg disabled:opacity-50">
          {enviando ? <Loader2 className="animate-spin" size={16} /> : quantidade > 1 ? `Criar ${quantidade} OS` : 'Enviar solicitação'}
        </button>
      </div>
      )}
        </div>
      </div>
    </form>
  );
};
