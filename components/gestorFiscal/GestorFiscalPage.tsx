import React, { useEffect, useMemo, useState } from 'react';
import { EMPRESAS_TMSEG, EMPRESA_LABORATORIO, formatarCnpj } from '../../lib/gestorFiscal/empresas';
import { PREMISSAS_INICIAIS, ROTULOS_PREMISSA, type PremissasFiscais } from '../../lib/gestorFiscal/premissas';
import { HISTORICO_INICIO, clampPeriodoFiscal } from '../../lib/gestorFiscal/periodo';
import { analisarCarga, type AnaliseFiscal, type CargaFiscal, type FiltroFiscal } from '../../lib/gestorFiscal/base';
import { CARGA_LABORATORIO } from '../../lib/gestorFiscal/laboratorio';
import { carregarFontesGestorFiscal } from '../../lib/gestorFiscal/carregarFontes';
import type { EmiteNf } from '../../lib/gestorFiscal/simulacao';
import CentroHomologacao from './CentroHomologacao';

type Aba = 'visao' | 'regimes' | 'fornecedores' | 'clientes' | 'notas' | 'historico' | 'termometro' | 'homologacao';
type Modo = 'leitura' | 'laboratorio';

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'visao', nome: 'Visão Geral Fiscal' },
  { id: 'regimes', nome: 'Simples × Lucro Real' },
  { id: 'fornecedores', nome: 'Reajuste de Fornecedores' },
  { id: 'clientes', nome: 'Reajuste de Clientes' },
  { id: 'notas', nome: 'Gestão de Notas Fiscais' },
  { id: 'historico', nome: 'Análise Histórica Mensal' },
  { id: 'termometro', nome: 'Termômetro de Rentabilidade' },
  { id: 'homologacao', nome: 'Centro de Homologação' },
];

function hojeIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

function brl(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return '—';
  return `${(valor * 100).toFixed(1)}%`;
}

function Termometro({ margem, faixa }: { margem: number | null; faixa: AnaliseFiscal['faixa'] }) {
  const largura = margem == null ? 0 : Math.max(0, Math.min(100, margem * 100));
  const cor = faixa === 'na_meta' ? 'bg-emerald-500' : faixa === 'entre_minimo_e_meta' ? 'bg-amber-400' : faixa === 'abaixo_minimo' ? 'bg-red-600' : 'bg-gray-300';
  const texto = faixa === 'na_meta' ? 'Na meta de 40%' : faixa === 'entre_minimo_e_meta' ? 'Entre 30% e 40%' : faixa === 'abaixo_minimo' ? 'Abaixo do mínimo de 30%' : 'Indeterminado';
  return (
    <div data-testid="termometro-rentabilidade">
      <div className="mb-2 flex items-end justify-between">
        <p className="text-sm font-black text-gray-800">{texto}</p>
        <p className="font-mono text-2xl font-black text-gray-900">{pct(margem)}</p>
      </div>
      <div className="relative h-4 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-4 ${cor}`} style={{ width: `${largura}%` }} />
        <span className="absolute inset-y-0 border-l-2 border-red-800" style={{ left: '30%' }} />
        <span className="absolute inset-y-0 border-l-2 border-emerald-800" style={{ left: '40%' }} />
      </div>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Marcas em 30% e 40%. A barra é a margem operacional, antes do tributo.</p>
    </div>
  );
}

const GestorFiscalPage: React.FC<{
  modoInicial?: Modo;
  abaInicial?: Aba;
  expandido?: boolean;
}> = ({ modoInicial = 'leitura', abaInicial = 'visao', expandido = false }) => {
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [premissas, setPremissas] = useState<PremissasFiscais>(PREMISSAS_INICIAIS);
  const [empresaKey, setEmpresaKey] = useState(modoInicial === 'laboratorio' ? EMPRESA_LABORATORIO.key : '');
  const [inicio, setInicio] = useState(HISTORICO_INICIO);
  const [fim, setFim] = useState(hojeIso());
  const [mes, setMes] = useState('');
  const [cliente, setCliente] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [regiao, setRegiao] = useState('');
  const [escopo, setEscopo] = useState<FiltroFiscal['escopo']>('consolidado');
  const [incluirEstimados, setIncluirEstimados] = useState(false);
  const [carga, setCarga] = useState<CargaFiscal | null>(modoInicial === 'laboratorio' ? CARGA_LABORATORIO : null);
  const [carregando, setCarregando] = useState(false);
  const [emite, setEmite] = useState<Record<string, EmiteNf>>({
    'FORNECEDOR FICTICIO COM NF': 'sim',
    'FORNECEDOR FICTICIO SEM NF': 'nao',
  });
  const [credito, setCredito] = useState<Record<string, boolean>>({});

  const periodo = clampPeriodoFiscal(inicio, fim);

  useEffect(() => {
    if (modo !== 'leitura') return;
    let vivo = true;
    setCarregando(true);
    carregarFontesGestorFiscal(periodo.inicio, periodo.fim)
      .then((lida) => { if (vivo) setCarga(lida); })
      .catch((erro: unknown) => {
        if (!vivo) return;
        setCarga({
          estado: 'ERRO',
          modo: 'leitura',
          mensagens: [erro instanceof Error ? erro.message : 'Falha ao ler as fontes.'],
          fatias: [],
          despesas: [],
          documentos: [],
          tributos: [],
          emiteLido: {},
        });
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [modo, periodo.inicio, periodo.fim]);

  useEffect(() => {
    if (modo !== 'leitura' || !carga) return;
    setEmite((atual) => ({ ...carga.emiteLido, ...atual }));
  }, [carga, modo]);

  const filtro: FiltroFiscal = {
    empresaKey,
    inicio: periodo.inicio,
    fim: periodo.fim,
    mes,
    cliente,
    fornecedor,
    regiao,
    incluirEstimados,
    escopo,
  };

  const analise = useMemo(() => {
    if (!carga || !empresaKey) return null;
    return analisarCarga(carga, filtro, premissas, emite, credito);
  }, [carga, filtro, premissas, emite, credito, empresaKey]);

  const opcoesCliente = useMemo(() => {
    const nomes = new Set((carga?.fatias || []).filter((f) => !empresaKey || f.empresaKey === empresaKey).map((f) => f.cliente));
    return [...nomes].sort();
  }, [carga, empresaKey]);
  const opcoesFornecedor = useMemo(() => {
    const nomes = new Set((carga?.fatias || []).filter((f) => !empresaKey || f.empresaKey === empresaKey).map((f) => f.fornecedor));
    return [...nomes].sort();
  }, [carga, empresaKey]);
  const opcoesRegiao = useMemo(() => {
    const nomes = new Set((carga?.fatias || []).filter((f) => !empresaKey || f.empresaKey === empresaKey).map((f) => f.regiao));
    return [...nomes].sort();
  }, [carga, empresaKey]);

  const empresas = modo === 'laboratorio' ? [EMPRESA_LABORATORIO] : EMPRESAS_TMSEG;
  const mostrar = (id: Aba) => expandido || aba === id;

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-16" data-testid="gestor-fiscal">
      <header className="rounded-2xl border border-red-900/20 bg-gradient-to-r from-black via-[#1a0505] to-[#450a0a] p-5 text-white shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200">Diretoria</p>
        <h1 className="mt-1 text-2xl font-black">Gestor Fiscal</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-200">
          Apoio à transição do Simples Nacional para o Lucro Real em janeiro de 2027.
          A receita e o custo da OS vêm do cálculo canônico já existente. Esta tela só simula.
        </p>
      </header>

      <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${modo === 'laboratorio' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-red-200 bg-red-50 text-red-900'}`} data-testid="banner-modo">
        {modo === 'laboratorio'
          ? 'LABORATÓRIO — valores fictícios. Não são números da empresa e não foram gravados.'
          : 'SIMULAÇÃO — tributo calculado aqui não é lançamento oficial, valor aprovado nem parecer da contabilidade.'}
      </div>

      <section className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-4">
        <label className="text-xs font-bold text-gray-600">Empresa / CNPJ
          <select className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" value={empresaKey} onChange={(e) => setEmpresaKey(e.target.value)} data-testid="filtro-empresa">
            {modo === 'leitura' ? <option value="">Selecione uma empresa</option> : null}
            {empresas.map((e) => <option key={e.key} value={e.key}>{e.nome} — {formatarCnpj(e.cnpj)}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-gray-600">Início
          <input type="date" min={HISTORICO_INICIO} className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="text-xs font-bold text-gray-600">Fim
          <input type="date" min={HISTORICO_INICIO} className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
        <label className="text-xs font-bold text-gray-600">Mês
          <input type="month" min="2026-01" className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
        <label className="text-xs font-bold text-gray-600">Cliente
          <select className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Todos desta empresa</option>
            {opcoesCliente.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-gray-600">Fornecedor
          <select className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
            <option value="">Todos desta empresa</option>
            {opcoesFornecedor.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-gray-600">Região
          <select className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" value={regiao} onChange={(e) => setRegiao(e.target.value)}>
            <option value="">Todas</option>
            {opcoesRegiao.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-gray-600">Escopo
          <select className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm" value={escopo} onChange={(e) => setEscopo(e.target.value as FiltroFiscal['escopo'])}>
            <option value="consolidado">Consolidado da empresa</option>
            <option value="cliente">Individual do cliente</option>
            <option value="fornecedor">Individual do fornecedor</option>
          </select>
        </label>
      </section>

      {periodo.aviso ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{periodo.aviso}</p> : null}
      {carregando ? <p className="text-sm font-bold text-gray-500">Lendo as fontes, sem gravar nada…</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={`rounded-lg px-3 py-2 text-xs font-black uppercase ${modo === 'leitura' ? 'bg-black text-white' : 'bg-white text-gray-600 border'}`} onClick={() => { setModo('leitura'); setEmpresaKey(''); setCarga(null); setEmite({}); }}>Leitura das fontes</button>
        <button type="button" className={`rounded-lg px-3 py-2 text-xs font-black uppercase ${modo === 'laboratorio' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 border'}`} onClick={() => { setModo('laboratorio'); setEmpresaKey(EMPRESA_LABORATORIO.key); setCarga(CARGA_LABORATORIO); setEmite({ 'FORNECEDOR FICTICIO COM NF': 'sim', 'FORNECEDOR FICTICIO SEM NF': 'nao' }); }} data-testid="botao-laboratorio">Laboratório fictício</button>
        <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={incluirEstimados} onChange={(e) => setIncluirEstimados(e.target.checked)} />
          Incluir OS estimadas na base
        </label>
      </div>

      <nav className="flex flex-wrap gap-2">
        {ABAS.map((item) => (
          <button key={item.id} type="button" onClick={() => setAba(item.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${aba === item.id ? 'bg-red-700 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {item.nome}
          </button>
        ))}
      </nav>

      {aba === 'homologacao' ? (
        <CentroHomologacao />
      ) : !empresaKey || !analise ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm font-bold text-gray-600">Selecione uma empresa. Os CNPJs não são somados juntos.</p>
      ) : (
        <Conteudo
          aba={aba}
          mostrar={mostrar}
          analise={analise}
          premissas={premissas}
          setPremissas={setPremissas}
          emite={emite}
          setEmite={setEmite}
          credito={credito}
          setCredito={setCredito}
        />
      )}
    </div>
  );
};

function Card({ titulo, valor, detalhe, teste }: { titulo: string; valor: string; detalhe?: string; teste?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3" data-testid={teste}>
      <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">{titulo}</p>
      <p className="mt-1 font-mono text-xl font-black text-gray-900">{valor}</p>
      {detalhe ? <p className="mt-1 text-[10px] font-bold text-gray-500">{detalhe}</p> : null}
    </div>
  );
}

function Conteudo(props: {
  aba: Aba;
  mostrar: (id: Aba) => boolean;
  analise: AnaliseFiscal;
  premissas: PremissasFiscais;
  setPremissas: React.Dispatch<React.SetStateAction<PremissasFiscais>>;
  emite: Record<string, EmiteNf>;
  setEmite: React.Dispatch<React.SetStateAction<Record<string, EmiteNf>>>;
  credito: Record<string, boolean>;
  setCredito: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const { analise, premissas, setPremissas } = props;
  const base = analise.semCredito;
  const comNf = analise.comCredito;

  return (
    <div className="space-y-4">
      <ul className="space-y-1 rounded-xl border border-gray-200 bg-white p-4 text-xs font-semibold text-gray-700">
        {analise.avisos.map((a) => <li key={a}>{a}</li>)}
        <li>Empresa: {analise.empresaNome} · CNPJ {analise.cnpj}. Outro CNPJ não entra nesta soma.</li>
        <li>OS na base: {analise.osNaBase}. Fora da base por estimativa ou falta de validação: {analise.osFora}. Incompleto: {analise.incompleto ? 'sim' : 'não'}.</li>
      </ul>

      {props.mostrar('visao') ? (
        <section className="space-y-3" data-testid="painel-visao">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-800">Visão Geral Fiscal</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Card titulo="Receita operacional" valor={brl(analise.separacao.receitaOperacional)} detalhe="OS canônica, inclusive cancelada com valor comercial. Não é o valor da nota." teste="kpi-receita" />
            <Card titulo="Faturamento fiscal" valor={brl(analise.separacao.faturamentoFiscal)} detalhe="Notas do CNPJ, com partes do mesmo conjunto de OS somadas uma vez." teste="kpi-faturamento-fiscal" />
            <Card titulo="Recebimento" valor={brl(analise.separacao.recebimento)} detalhe="Só entra com número único de nota no texto do lançamento." teste="kpi-recebimento" />
            <Card titulo="Custo da OS" valor={brl(analise.separacao.custo)} detalhe="Custo canônico. Conta a pagar de fornecedor não entra de novo." teste="kpi-custo" />
            <Card titulo="Despesas com CNPJ" valor={brl(base.despesasOperacionais)} detalhe="Só da empresa selecionada, sem duplicata e sem custo de fornecedor." />
            <Card titulo="Lucro estimado" valor={brl(analise.separacao.lucroEstimado)} detalhe="Simulação: receita operacional − custo da OS − despesas com CNPJ. Não é lucro contábil nem caixa." teste="kpi-lucro-estimado" />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <Termometro margem={base.margem} faixa={analise.faixa} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Card titulo="Receita de outro CNPJ" valor={brl(analise.receitaForaDaEmpresa)} detalhe="Ficou fora desta soma." teste="kpi-outro-cnpj" />
            <Card titulo="Despesa sem empresa" valor={brl(analise.despesaSemEmpresa)} detalhe="Sem emissora identificada. Não entrou no resultado." teste="kpi-despesa-sem-empresa" />
            <Card titulo="Tributo sem empresa" valor={brl(analise.tributoSemEmpresa)} detalhe="Lançamento de imposto sem CNPJ. Não entrou no resultado." />
          </div>
          <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-4" data-testid="painel-canceladas">
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-800">OS canceladas na receita operacional</h3>
            <p className="text-xs font-semibold text-gray-600">
              {analise.canceladas.quantidade} OS · {brl(analise.canceladas.receita)} já inclusos na receita operacional. A regra comercial da OS não é recalculada aqui.
            </p>
            <div className="grid gap-3 md:grid-cols-4">
              <Card titulo="Cancelada faturada" valor={brl(analise.canceladas.faturada.valor)} detalhe={`${analise.canceladas.faturada.quantidade} OS com nota ou vínculo.`} />
              <Card titulo="Cancelada aprovada sem nota" valor={brl(analise.canceladas.aprovadaSemNota.valor)} detalhe={`${analise.canceladas.aprovadaSemNota.quantidade} OS. Aprovação não é nota.`} />
              <Card titulo="Cancelada pendente" valor={brl(analise.canceladas.pendente.valor)} detalhe={`${analise.canceladas.pendente.quantidade} OS com valor, sem aprovação e sem nota.`} />
              <Card titulo="Cancelada sem valor" valor={brl(analise.canceladas.semValor.valor)} detalhe={`${analise.canceladas.semValor.quantidade} OS.`} />
            </div>
          </section>
          <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="painel-pendencias">
            <h3 className="text-xs font-black uppercase tracking-wide text-amber-950">Pendências fora do resultado da empresa</h3>
            <ul className="space-y-1 text-xs font-semibold text-amber-950">
              <li>{analise.pendencias.despesaSemCnpjQuantidade} despesa(s) sem CNPJ: {brl(analise.pendencias.despesaSemCnpj)}.</li>
              <li>Tributo sem empresa: {brl(analise.pendencias.tributoSemEmpresa)}.</li>
              <li>{analise.pendencias.recebimentoSemDocumentoQuantidade} recebimento(s) sem documento único: {brl(analise.pendencias.recebimentoSemDocumento)}.</li>
              <li>Faturamento sem empresa: {brl(analise.pendencias.faturamentoSemEmpresa)}.</li>
              <li>{analise.pendencias.osSemComprovacao} OS sem comprovação de nota: {brl(analise.pendencias.osSemComprovacaoValor)}. Continuam pendentes.</li>
              <li>{analise.pendencias.osNaoDeterminada} OS com vínculo não carregado: {brl(analise.pendencias.osNaoDeterminadaValor)}.</li>
              <li>{analise.pendencias.custoFornecedorEmContasQuantidade} conta(s) de fornecedor: {brl(analise.pendencias.custoFornecedorEmContas)}. Não soma no custo da OS.</li>
            </ul>
          </section>
          <ul className="rounded-xl border border-gray-200 bg-white p-4 text-xs" data-testid="conferencia-regras">
            {analise.conferencia.map((item) => (
              <li key={item.regra} className="border-t border-gray-100 py-2 first:border-t-0">
                <span className="font-black uppercase">{item.estado}</span> — {item.regra}. {item.detalhe}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {props.mostrar('regimes') ? (
        <section className="space-y-3" data-testid="painel-regimes">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-800">Simples Nacional × Lucro Real</h2>
          <PremissasEditor premissas={premissas} setPremissas={setPremissas} />
          <div className="grid gap-3 md:grid-cols-2">
            <Card titulo="Lucro líquido no Simples" valor={brl(base.lucroLiquidoSimples)} detalhe={base.simplesStatus === 'PREMISSA_AUSENTE' ? 'Alíquota não informada. Nada foi inventado.' : 'Simulação com a alíquota digitada.'} teste="kpi-lucro-simples" />
            <Card titulo="Lucro líquido no Lucro Real" valor={brl(base.lucroLiquidoLucroReal)} detalhe="Sem crédito automático." teste="kpi-lucro-real" />
            <Card titulo="Tributo calculado — Simples" valor={brl(base.tributoSimples)} detalhe="Calculado. Não é o tributo pago." />
            <Card titulo="Tributo calculado — Lucro Real" valor={brl(base.tributoLucroReal)} detalhe={`IRPJ ${brl(base.irpj)} · adicional ${brl(base.irpjAdicional)} · CSLL ${brl(base.csll)} · PIS/COFINS ${brl(base.pis + base.cofins)}`} />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Card titulo="Tributo calculado" valor={brl(base.tributoLucroReal)} detalhe="Fórmula do Lucro Real, cenário sem crédito." />
            <Card titulo="Tributo pago" valor={brl(analise.tributoPago)} detalhe="Lançamento com categoria de imposto, status pago. Não abate o calculado." />
            <Card titulo="Tributo pendente" valor={brl(analise.tributoPendente)} detalhe="Lançamento em aberto na mesma categoria." />
            <Card titulo="Tributo compensado" valor={brl(analise.tributoCompensado)} detalhe={analise.compensadoOrigem} />
          </div>
          <p className="text-xs font-semibold text-gray-600">
            Diferença de lucro líquido (Lucro Real − Simples): {base.lucroLiquidoSimples == null ? '—' : brl(base.lucroLiquidoLucroReal - base.lucroLiquidoSimples)}.
            Cenário com crédito marcado: lucro líquido {brl(comNf.lucroLiquidoLucroReal)}, crédito usado {brl(comNf.creditoUsado)}.
          </p>
        </section>
      ) : null}

      {props.mostrar('fornecedores') ? (
        <section className="space-y-3" data-testid="painel-fornecedores">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-800">Simulador de Reajuste de Fornecedores</h2>
          <Card titulo="Teto de reajuste" valor={brl(analise.teto.teto)} detalhe={analise.teto.motivo} teste="kpi-teto" />
          <p className="text-xs font-semibold text-gray-600">Referência de lucro líquido no Simples: {brl(analise.teto.lucroReferencia)}. {analise.teto.formula}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <Card titulo="Exemplo que melhora" valor={analise.teto.exemploMelhora ? brl(analise.teto.exemploMelhora.delta) : '—'} detalhe={analise.teto.exemploMelhora ? `Lucro ${brl(analise.teto.exemploMelhora.lucroLiquidoLucroReal)} · ${analise.teto.exemploMelhora.contraReferencia}` : 'Sem folga para um aumento que ainda melhore o lucro.'} />
            <Card titulo="Exemplo que mantém" valor={analise.teto.exemploMantem ? brl(analise.teto.exemploMantem.delta) : '—'} detalhe={analise.teto.exemploMantem ? `Lucro ${brl(analise.teto.exemploMantem.lucroLiquidoLucroReal)} · ${analise.teto.exemploMantem.contraReferencia}` : 'Sem ponto de equilíbrio no recorte.'} />
            <Card titulo="Exemplo que reduz" valor={analise.teto.exemploReduz ? brl(analise.teto.exemploReduz.delta) : '—'} detalhe={analise.teto.exemploReduz ? `Lucro ${brl(analise.teto.exemploReduz.lucroLiquidoLucroReal)} · ${analise.teto.exemploReduz.contraReferencia}` : 'O teto pesquisado não passou da receita.'} />
          </div>
          <TabelaFornecedores {...props} />
        </section>
      ) : null}

      {props.mostrar('clientes') ? (
        <section className="space-y-3" data-testid="painel-clientes">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-800">Simulador de Reajuste de Clientes</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Card titulo="Reajuste para a margem de 40%" valor={brl(analise.reajusteCliente.reajusteValor)} detalhe={`${analise.reajusteCliente.status} · margem atual ${pct(analise.reajusteCliente.margemAtual)}`} teste="kpi-reajuste-cliente" />
            <Card titulo="Cobrar a mais para preservar o lucro" valor={brl(analise.preservarLucro.aumento)} detalhe={analise.preservarLucro.motivo} teste="kpi-preservar-lucro" />
          </div>
          <p className="text-xs font-semibold text-gray-600">{analise.reajusteCliente.formula}</p>
          <p className="text-xs font-semibold text-gray-600">{analise.preservarLucro.formula}</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 font-black uppercase text-gray-500">
                <tr><th className="p-2">Cliente</th><th className="p-2">Receita</th><th className="p-2">Custo</th><th className="p-2">Reajuste para 40%</th></tr>
              </thead>
              <tbody>
                {analise.clientes.map((c) => (
                  <tr key={c.nome} className="border-t border-gray-100">
                    <td className="p-2 font-bold">{c.nome}</td>
                    <td className="p-2 font-mono">{brl(c.receita)}</td>
                    <td className="p-2 font-mono">{brl(c.custo)}</td>
                    <td className="p-2 font-mono">{c.reajuste.status === 'JA_ATINGE' ? 'Já atinge' : brl(c.reajuste.reajusteValor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {props.mostrar('notas') ? (
        <section className="space-y-3" data-testid="painel-notas">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-800">Gestão de Notas Fiscais</h2>
          <p className="text-xs font-semibold text-gray-600">
            O campo “Emite nota fiscal?” ainda não existe em <span className="font-mono">providers</span>.
            A escolha abaixo vale só nesta simulação. Mapeamento previsto, sem migration: coluna <span className="font-mono">providers.emite_nota_fiscal</span> com Sim, Não ou Não informado.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Card titulo="Com crédito marcado e NF válida" valor={brl(comNf.lucroLiquidoLucroReal)} detalhe={`Crédito usado ${brl(comNf.creditoUsado)}. NF sozinha não gera crédito.`} />
            <Card titulo="Sem crédito" valor={brl(base.lucroLiquidoLucroReal)} detalhe="Fornecedor sem NF, não informado ou não marcado." />
          </div>
          <TabelaFornecedores {...props} />
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white" data-testid="grupos-fatura">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 font-black uppercase text-gray-500">
                <tr><th className="p-2">Conjunto</th><th className="p-2">Partes</th><th className="p-2">OS</th><th className="p-2">Faturamento</th><th className="p-2">Receita das OS</th><th className="p-2">Diferença</th></tr>
              </thead>
              <tbody>
                {analise.gruposFatura.map((g) => (
                  <tr key={g.chave} className="border-t border-gray-100">
                    <td className="p-2">{g.osIds.length ? g.osIds.join(', ') : 'Sem OS vinculada'}</td>
                    <td className="p-2">{g.partes.length}</td>
                    <td className="p-2">{g.osIds.length}</td>
                    <td className="p-2 font-mono">{brl(g.valorFiscal)}</td>
                    <td className="p-2 font-mono">{brl(g.receitaOs)}</td>
                    <td className="p-2 font-mono">{brl(g.diferenca)}</td>
                  </tr>
                ))}
                {analise.gruposFatura.length === 0 ? <tr><td className="p-3 font-bold text-gray-500" colSpan={6}>Nenhuma nota de cliente neste recorte.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 font-black uppercase text-gray-500">
                <tr><th className="p-2">Documento</th><th className="p-2">Quem</th><th className="p-2">Número</th><th className="p-2">Situação</th><th className="p-2">Origem</th></tr>
              </thead>
              <tbody>
                {analise.documentos.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="p-2">{d.tipo === 'nf_fornecedor' ? 'NF fornecedor' : 'Fatura cliente'}</td>
                    <td className="p-2">{d.fornecedor || d.cliente || '—'}</td>
                    <td className="p-2">{d.numero || 'pendente'}</td>
                    <td className="p-2 font-bold">{d.situacao}</td>
                    <td className="p-2">{d.origem}</td>
                  </tr>
                ))}
                {analise.documentos.length === 0 ? <tr><td className="p-3 font-bold text-gray-500" colSpan={5}>Nenhum documento fiscal neste recorte.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {analise.duplicatas.length ? (
            <ul className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-950">
              {analise.duplicatas.map((d) => <li key={d}>{d}</li>)}
            </ul>
          ) : <p className="text-xs font-bold text-gray-500">Nenhuma duplicidade no recorte.</p>}
        </section>
      ) : null}

      {props.mostrar('historico') ? (
        <section className="space-y-3" data-testid="painel-historico">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-800">Análise Histórica Mensal</h2>
          <p className="text-xs font-semibold text-gray-600">A partir de janeiro de 2026. O adicional de IRPJ é calculado dentro de cada mês.</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 font-black uppercase text-gray-500">
                <tr><th className="p-2">Mês</th><th className="p-2">Receita</th><th className="p-2">Custo</th><th className="p-2">Margem</th><th className="p-2">Lucro Simples</th><th className="p-2">Lucro Real</th></tr>
              </thead>
              <tbody>
                {base.meses.map((m) => (
                  <tr key={m.mes} className="border-t border-gray-100">
                    <td className="p-2 font-bold">{m.mes}</td>
                    <td className="p-2 font-mono">{brl(m.receita)}</td>
                    <td className="p-2 font-mono">{brl(m.custoFornecedor)}</td>
                    <td className="p-2 font-mono">{pct(m.margem)}</td>
                    <td className="p-2 font-mono">{brl(m.lucroLiquidoSimples)}</td>
                    <td className="p-2 font-mono">{brl(m.lucroLiquidoLucroReal)}</td>
                  </tr>
                ))}
                {base.meses.length === 0 ? <tr><td className="p-3 font-bold text-gray-500" colSpan={6}>Sem meses na base oficial. Isso não significa lucro zero.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {props.mostrar('termometro') ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid="painel-termometro">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-gray-800">Termômetro de Rentabilidade</h2>
          <Termometro margem={base.margem} faixa={analise.faixa} />
          <p className="mt-3 text-xs font-semibold text-gray-600">Mínimo {pct(premissas.margemMinima)} · meta {pct(premissas.margemIdeal)}. {analise.formulas.margem}</p>
        </section>
      ) : null}

      <details className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-700">
        <summary className="cursor-pointer font-black uppercase tracking-wide text-gray-800">Fórmulas, premissas e origem</summary>
        <ul className="mt-3 space-y-1">
          {Object.values(analise.formulas).map((f) => <li key={f}>{f}</li>)}
          {ROTULOS_PREMISSA.map((r) => <li key={r.chave}>{r.rotulo}: {r.origem}</li>)}
        </ul>
      </details>
    </div>
  );
}

function PremissasEditor({ premissas, setPremissas }: { premissas: PremissasFiscais; setPremissas: React.Dispatch<React.SetStateAction<PremissasFiscais>> }) {
  const aliquota = (chave: keyof PremissasFiscais, rotulo: string) => (
    <label key={chave} className="text-xs font-bold text-gray-600">{rotulo}
      <input type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm" value={Number(((premissas[chave] as number) * 100).toFixed(4))} onChange={(e) => setPremissas({ ...premissas, [chave]: Number(e.target.value) / 100 })} />
    </label>
  );
  return (
    <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-4">
      <label className="text-xs font-bold text-gray-600">Simples (%)
        <input type="number" min="0" step="0.01" placeholder="informar" className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm" value={premissas.simplesAliquotaEfetiva == null ? '' : Number((premissas.simplesAliquotaEfetiva * 100).toFixed(4))} onChange={(e) => {
          const bruto = e.target.value.trim();
          setPremissas({ ...premissas, simplesAliquotaEfetiva: bruto === '' ? null : Number(bruto) / 100 });
        }} data-testid="input-simples" />
      </label>
      {aliquota('irpj', 'IRPJ (%)')}
      {aliquota('irpjAdicional', 'Adicional IRPJ (%)')}
      {aliquota('csll', 'CSLL (%)')}
      {aliquota('pis', 'PIS (%)')}
      {aliquota('cofins', 'COFINS (%)')}
      {aliquota('iss', 'ISS (%)')}
      <label className="text-xs font-bold text-gray-600">Compensado informado (R$)
        <input type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm" value={premissas.compensacaoInformada} onChange={(e) => setPremissas({ ...premissas, compensacaoInformada: Number(e.target.value) })} />
      </label>
    </div>
  );
}

function TabelaFornecedores(props: {
  analise: AnaliseFiscal;
  emite: Record<string, EmiteNf>;
  setEmite: React.Dispatch<React.SetStateAction<Record<string, EmiteNf>>>;
  credito: Record<string, boolean>;
  setCredito: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-gray-50 font-black uppercase text-gray-500">
          <tr>
            <th className="p-2">Fornecedor</th>
            <th className="p-2">Custo</th>
            <th className="p-2">Emite NF</th>
            <th className="p-2">Documento</th>
            <th className="p-2">Marcar crédito</th>
            <th className="p-2">Efeito</th>
          </tr>
        </thead>
        <tbody>
          {props.analise.fornecedores.map((f) => (
            <tr key={f.nome} className="border-t border-gray-100">
              <td className="p-2 font-bold">{f.nome}</td>
              <td className="p-2 font-mono">{brl(f.custo)}</td>
              <td className="p-2">
                <select className="rounded border border-gray-200 px-1 py-1" value={props.emite[f.nome] || 'nao_informado'} onChange={(e) => props.setEmite({ ...props.emite, [f.nome]: e.target.value as EmiteNf })}>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                  <option value="nao_informado">Não informado</option>
                </select>
              </td>
              <td className="p-2">{f.nf}</td>
              <td className="p-2">
                <input type="checkbox" checked={!!props.credito[f.nome]} onChange={(e) => props.setCredito({ ...props.credito, [f.nome]: e.target.checked })} />
              </td>
              <td className="p-2">{f.motivoCredito}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default GestorFiscalPage;
