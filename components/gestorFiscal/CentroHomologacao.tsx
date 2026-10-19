import React, { useEffect, useMemo, useState } from 'react';
import {
  ITENS_SIMULADOS,
  PERSISTENCIA,
  REFERENCIA_ETAPA_7,
  aplicarDecisao,
  calcularCenario,
  definirDestino172,
  estadoInicial,
  formatarReais,
  nomeEmpresa,
  rotuloNatureza,
  type Destino172,
  type EstadoHomologacao,
  type ItemSimulado,
  type StatusSimulado,
} from '../../lib/gestorFiscal/centroHomologacao';
import { consultarLancamentosAuditados } from '../../lib/gestorFiscal/consultaHomologacao';
import { rotuloDocumento, type LancamentoConciliado, type LeituraLancamento } from '../../lib/gestorFiscal/lancamentosHomologacao';

type Filtro = 'elegiveis' | 'pendencias' | 'fora' | 'todos';

const FILTROS: { id: Filtro; nome: string }[] = [
  { id: 'elegiveis', nome: 'Podem ser simulados' },
  { id: 'pendencias', nome: 'Pendências bloqueadas' },
  { id: 'fora', nome: 'Fora do operacional' },
  { id: 'todos', nome: 'Todos os itens' },
];

function entraNoFiltro(item: ItemSimulado, filtro: Filtro): boolean {
  const individual = item.parcela === 'lista_seguranca' || item.parcela === 'adicional_outras' || item.parcela === 'ja_reconhecido';
  if (filtro === 'todos') return true;
  if (filtro === 'elegiveis') return item.podeAprovar || individual;
  if (filtro === 'pendencias') return !item.podeAprovar && !individual && item.parcela !== 'fora_do_operacional';
  return item.parcela === 'fora_do_operacional';
}

function rotuloStatus(status: StatusSimulado): string {
  if (status === 'aprovada_simulada') return 'Aprovação simulada';
  if (status === 'rejeitada_simulada') return 'Rejeição simulada';
  if (status === 'documentacao_solicitada') return 'Documentação pedida';
  return 'Pendente';
}

const CentroHomologacao: React.FC<{
  consultar?: typeof consultarLancamentosAuditados;
}> = ({ consultar = consultarLancamentosAuditados }) => {
  const [estado, setEstado] = useState<EstadoHomologacao>(estadoInicial);
  const [filtro, setFiltro] = useState<Filtro>('elegiveis');
  const [aviso, setAviso] = useState('');
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [lancamentos, setLancamentos] = useState<LancamentoConciliado[]>([]);
  const [extras, setExtras] = useState<LeituraLancamento[]>([]);
  const [resumoConsulta, setResumoConsulta] = useState('');
  const cenario = useMemo(() => calcularCenario(estado, lancamentos), [estado, lancamentos]);
  const porBloco = useMemo(() => {
    const mapa = new Map<string, LancamentoConciliado[]>();
    for (const item of lancamentos) {
      const lista = mapa.get(item.auditoria.blocoId) || [];
      lista.push(item);
      mapa.set(item.auditoria.blocoId, lista);
    }
    return mapa;
  }, [lancamentos]);

  useEffect(() => {
    let vivo = true;
    consultar()
      .then((resultado) => {
        if (!vivo) return;
        setLancamentos(resultado.itens);
        setExtras(resultado.extras);
        const lista = resultado.itens.filter((item) => item.auditoria.parcela === 'lista_seguranca');
        const fechados = lista.filter((item) => item.divergencias.length === 0).length;
        const divergentesLista = lista.filter((item) => item.divergencias.length > 0).length;
        setResumoConsulta(`${resultado.itens.length} lançamentos da evidência histórica localizados. ${fechados} de ${lista.length} da lista da TM SEGURANÇA fecharam com a auditoria. Divergências na lista: ${divergentesLista}. Fora da evidência: ${resultado.extras.length}.`);
      })
      .catch((erro: unknown) => {
        if (!vivo) return;
        setResumoConsulta(erro instanceof Error ? erro.message : 'A consulta dos lançamentos falhou. Nenhum item individual foi liberado.');
      });
    return () => { vivo = false; };
  }, [consultar]);
  const visiveis = ITENS_SIMULADOS.filter((item) => entraNoFiltro(item, filtro));

  const agir = (itemId: string, acao: 'aprovar' | 'rejeitar' | 'pedir_documento' | 'reverter', conciliado?: LancamentoConciliado) => {
    const passo = aplicarDecisao(estado, { itemId, acao }, conciliado);
    setEstado(passo.estado);
    setAviso(passo.erro || '');
  };

  const destino = (valor: Destino172) => {
    const passo = definirDestino172(estado, valor);
    setEstado(passo.estado);
    setAviso(passo.erro || '');
  };

  return (
    <section className="space-y-4" data-testid="centro-homologacao" data-persistencia={PERSISTENCIA}>
      <header className="rounded-2xl border border-red-900/20 bg-gradient-to-r from-black via-[#1a0505] to-[#450a0a] p-5 text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200">Diretoria · simulação local</p>
        <h2 className="mt-1 text-xl font-black">Centro de Homologação</h2>
        <p className="mt-2 max-w-3xl text-sm text-gray-200">
          As decisões ficam só nesta tela. Nada é gravado no banco e nenhuma aprovação simulada vira homologação real.
        </p>
      </header>

      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950" data-testid="banner-simulacao">
        SIMULAÇÃO LOCAL — a aprovação por lançamento não é gravada e não é homologação real. A classe A é evidência histórica de 19/10/2026, não uma classificação nova do cadastro. A conta que pagou não escolhe o CNPJ. Os filtros das outras abas não se aplicam aqui.
      </div>
      <p className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-800" data-testid="resumo-consulta">{resumoConsulta || 'Consultando os lançamentos, sem gravar…'}</p>

      <div className="grid gap-3 md:grid-cols-3">
        <Cartao
          teste="parcela-lista"
          titulo="Lista da TM SEGURANÇA"
          valor={formatarReais(REFERENCIA_ETAPA_7.listaSegurancaCentavos)}
          detalhe={`Simulado agora: ${formatarReais(cenario.listaAprovadaCentavos)}. Referência da etapa 7.`}
        />
        <Cartao
          teste="parcela-adicional"
          titulo="Adicional das outras empresas"
          valor={formatarReais(REFERENCIA_ETAPA_7.adicionalOutrasCentavos)}
          detalhe={`TM GESTÃO ${formatarReais(REFERENCIA_ETAPA_7.adicionalGestaoCentavos)} e TM SECURITY ${formatarReais(REFERENCIA_ETAPA_7.adicionalSecurityCentavos)}. Simulado: ${formatarReais(cenario.adicionalAprovadaCentavos)}.`}
        />
        <Cartao
          teste="parcela-reconhecido"
          titulo="Já reconhecido no painel"
          valor={formatarReais(REFERENCIA_ETAPA_7.jaReconhecidoCentavos)}
          detalhe="TM GESTÃO. Não entra de novo pela lista. A conta que pagou não muda a empresa."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Cartao teste="resultado-painel" titulo="Painel, referência" valor={formatarReais(REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos)} detalhe={`Margem ${REFERENCIA_ETAPA_7.grupo.margemPainel.toLocaleString('pt-BR')}%. Antes dos tributos.`} />
        <Cartao teste="resultado-simulado" titulo="Resultado desta simulação" valor={formatarReais(cenario.grupo.resultadoCentavos)} detalhe={`Margem ${cenario.grupo.margem.toLocaleString('pt-BR')}%. Diferença contra o painel: ${formatarReais(cenario.diferencaParaPainelCentavos)}.`} />
        <Cartao teste="resultado-apto" titulo="Apto completo, referência" valor={formatarReais(REFERENCIA_ETAPA_7.grupo.resultadoAptoCentavos)} detalhe={`Margem ${REFERENCIA_ETAPA_7.grupo.margemApto.toLocaleString('pt-BR')}%. Só fecha se as três parcelas entrarem juntas.`} />
        <Cartao teste="resultado-gap" titulo="Distância até o apto" valor={formatarReais(cenario.diferencaParaAptoCentavos)} detalhe={cenario.aptoCompleto ? 'A simulação reproduz o cenário apto. Continua sem gravação.' : 'Ainda falta simular alguma parcela, ou o destino dos R$ 172,97 não é a alternativa A.'} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4" data-testid="decisao-172">
        <h3 className="text-sm font-black uppercase tracking-wide text-gray-800">Decisão simulada dos R$ 172,97</h3>
        <p className="mt-1 text-xs font-semibold text-gray-600">Emissor do cliente: TM GESTÃO. Conta que pagou: TM SEGURANÇA. A conta não atribui a empresa.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <BotaoDestino ativo={estado.destino172 === 'A'} onClick={() => destino('A')} teste="destino-172-a">A. Manter na TM GESTÃO</BotaoDestino>
          <BotaoDestino ativo={estado.destino172 === 'B'} onClick={() => destino('B')} teste="destino-172-b">B. Passar à TM SEGURANÇA</BotaoDestino>
          <BotaoDestino ativo={estado.destino172 === 'C'} onClick={() => destino('C')} teste="destino-172-c">C. Retirar até comprovação</BotaoDestino>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white" data-testid="impacto-empresas">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Empresa</th>
              <th className="px-3 py-2 text-right">Receita de referência</th>
              <th className="px-3 py-2 text-right">Custo canônico da OS</th>
              <th className="px-3 py-2 text-right">Já reconhecido</th>
              <th className="px-3 py-2 text-right">Aprovado na simulação</th>
              <th className="px-3 py-2 text-right">Resultado</th>
              <th className="px-3 py-2 text-right">Margem</th>
            </tr>
          </thead>
          <tbody>
            {cenario.empresas.map((empresa) => (
              <tr key={empresa.empresa} className="border-t border-gray-100">
                <td className="px-3 py-2 font-bold text-gray-800">{nomeEmpresa(empresa.empresa)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatarReais(empresa.receitaCentavos)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatarReais(empresa.custoOsCentavos)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatarReais(empresa.despesaReconhecidaCentavos)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatarReais(empresa.despesaAprovadaSimuladaCentavos)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold">{formatarReais(empresa.resultadoCentavos)}</td>
                <td className="px-3 py-2 text-right font-mono">{empresa.margem.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aviso ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-900" data-testid="aviso-acao">{aviso}</p> : null}

      <div className="flex flex-wrap gap-2" data-testid="filtros-homologacao">
        {FILTROS.map((item) => (
          <button key={item.id} type="button" onClick={() => setFiltro(item.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filtro === item.id ? 'bg-red-700 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}>
            {item.nome}
          </button>
        ))}
      </div>

      <div className="space-y-3" data-testid="lista-itens">
        {visiveis.map((item) => {
          const status = estado.decisoes[item.id] || 'pendente';
          return (
            <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4" data-testid={`item-${item.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-red-800">{item.id} · identificador fictício</p>
                  <h3 className="mt-1 text-sm font-black text-gray-900">{item.categoria} · {nomeEmpresa(item.empresa)}</h3>
                  <p className="mt-1 text-xs font-semibold text-gray-600">{item.descricao}</p>
                </div>
                <p className="font-mono text-lg font-black text-gray-900">{formatarReais(item.valorCentavos)}</p>
              </div>
              <dl className="mt-3 grid gap-2 text-xs text-gray-700 md:grid-cols-4">
                <div><dt className="font-black uppercase tracking-wide text-gray-400">Natureza</dt><dd>{rotuloNatureza(item.natureza)}</dd></div>
                <div><dt className="font-black uppercase tracking-wide text-gray-400">Quantidade do bloco</dt><dd>{item.quantidade == null ? 'Bloco documental' : item.quantidade}</dd></div>
                <div><dt className="font-black uppercase tracking-wide text-gray-400">Conta pagadora</dt><dd>{item.contaPagadora}. Não define a empresa.</dd></div>
                <div><dt className="font-black uppercase tracking-wide text-gray-400">Situação simulada</dt><dd data-testid={`status-${item.id}`}>{rotuloStatus(status)}</dd></div>
              </dl>
              <p className="mt-2 text-xs font-semibold text-gray-700"><span className="font-black">Evidência: </span>{item.evidencia}</p>
              {item.motivoBloqueio ? <p className="mt-1 text-xs font-bold text-amber-900">{item.motivoBloqueio}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-gray-300" disabled={!item.podeAprovar || status === 'aprovada_simulada'} onClick={() => agir(item.id, 'aprovar')} data-testid={`aprovar-${item.id}`}>Simular aprovação</button>
                <button type="button" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-black text-gray-700" onClick={() => agir(item.id, 'rejeitar')} data-testid={`rejeitar-${item.id}`}>Simular rejeição</button>
                <button type="button" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-black text-gray-700" onClick={() => agir(item.id, 'pedir_documento')} data-testid={`documento-${item.id}`}>Pedir documentação</button>
                <button type="button" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-black text-gray-700" onClick={() => agir(item.id, 'reverter')} data-testid={`reverter-${item.id}`}>Desfazer</button>
                {(porBloco.get(item.id) || []).length > 0 ? (
                  <button type="button" className="rounded-lg border border-red-800 bg-white px-3 py-1.5 text-xs font-black text-red-800" onClick={() => setAbertos((atual) => ({ ...atual, [item.id]: !atual[item.id] }))} data-testid={`abrir-${item.id}`}>
                    {abertos[item.id] ? 'Ocultar lançamentos' : `Ver ${(porBloco.get(item.id) || []).length} lançamentos`}
                  </button>
                ) : null}
              </div>
              {abertos[item.id] ? <ListaLancamentos itens={porBloco.get(item.id) || []} decisoes={estado.decisoes} agir={agir} /> : null}
            </article>
          );
        })}
      </div>

      {extras.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4" data-testid="extras-consulta">
          <h3 className="text-sm font-black uppercase tracking-wide text-red-900">Fora da evidência de 19/10/2026</h3>
          <p className="mt-1 text-xs font-semibold text-red-900">Estes lançamentos não têm correspondência com os 161 da lista nem com as parcelas separadas. A simulação de aprovação fica bloqueada. O banco não foi corrigido.</p>
          <ul className="mt-2 space-y-1">
            {extras.map((item) => (
              <li key={item.id} className="text-[11px] font-semibold text-red-950" data-testid={`extra-${item.id}`}>
                {item.id} · {item.categoria} · {item.contaPagadora} · {formatarReais(item.valorCentavos)} · {item.descricaoMascarada}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4" data-testid="historico-simulado">
        <h3 className="text-sm font-black uppercase tracking-wide text-gray-800">Histórico desta simulação</h3>
        {estado.historico.length === 0 ? (
          <p className="mt-2 text-xs font-semibold text-gray-500">Nenhuma decisão simulada ainda. O histórico some ao sair da tela.</p>
        ) : (
          <ol className="mt-2 space-y-1">
            {[...estado.historico].reverse().map((evento) => (
              <li key={evento.sequencia} className="text-xs font-semibold text-gray-700">
                {evento.sequencia}. {evento.itemId} · {nomeEmpresa(evento.empresa)} · {formatarReais(evento.valorCentavos)} · {evento.detalhe}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};

function ListaLancamentos({
  itens,
  decisoes,
  agir,
}: {
  itens: LancamentoConciliado[];
  decisoes: EstadoHomologacao['decisoes'];
  agir: (itemId: string, acao: 'aprovar' | 'rejeitar' | 'pedir_documento' | 'reverter', conciliado?: LancamentoConciliado) => void;
}) {
  return (
    <div className="mt-3 space-y-2" data-testid="lista-lancamentos">
      {itens.map((item) => {
        const status = decisoes[item.auditoria.id] || 'pendente';
        const leitura = item.leitura;
        return (
          <div key={item.auditoria.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3" data-testid={`lancamento-${item.auditoria.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-mono text-[11px] font-bold text-gray-800">{item.auditoria.id}</p>
              <p className="font-mono text-sm font-black">{formatarReais(item.auditoria.valorCentavos)}</p>
            </div>
            <dl className="mt-2 grid gap-2 text-[11px] text-gray-700 md:grid-cols-3">
              <div><dt className="font-black uppercase text-gray-400">Empresa da evidência</dt><dd>{nomeEmpresa(item.auditoria.empresa)}</dd></div>
              <div><dt className="font-black uppercase text-gray-400">Conta pagadora</dt><dd>{leitura?.contaPagadora || item.auditoria.contaPagadora}. Não define o CNPJ.</dd></div>
              <div><dt className="font-black uppercase text-gray-400">Categoria do cadastro</dt><dd>{leitura?.categoria || item.auditoria.categoria}</dd></div>
              <div><dt className="font-black uppercase text-gray-400">Vencimento</dt><dd>{leitura?.vencimento || item.auditoria.vencimento}</dd></div>
              <div><dt className="font-black uppercase text-gray-400">Pagamento</dt><dd>{leitura?.pagamento || item.auditoria.pagamento || 'sem pagamento'}</dd></div>
              <div><dt className="font-black uppercase text-gray-400">Situação documental</dt><dd>{rotuloDocumento(leitura?.documento || item.auditoria.documento)}</dd></div>
              <div><dt className="font-black uppercase text-gray-400">Classe histórica</dt><dd>Classe {item.auditoria.classeHistorica}. Evidência de 19/10/2026, não é dado novo do cadastro.</dd></div>
              <div><dt className="font-black uppercase text-gray-400">Situação simulada</dt><dd data-testid={`status-${item.auditoria.id}`}>{rotuloStatus(status)}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] font-semibold text-gray-700"><span className="font-black">Descrição: </span>{leitura?.descricaoMascarada || item.auditoria.descricaoMascarada}</p>
            <p className="mt-1 text-[11px] font-semibold text-gray-700"><span className="font-black">Evidência histórica: </span>{item.auditoria.evidenciaHistorica}</p>
            {item.divergencias.map((texto) => <p key={texto} className="mt-1 text-[11px] font-bold text-red-800">{texto}</p>)}
            {item.avisos.map((texto) => <p key={texto} className="mt-1 text-[11px] font-bold text-amber-900">{texto}</p>)}
            {item.auditoria.bloqueio ? <p className="mt-1 text-[11px] font-bold text-amber-900">{item.auditoria.bloqueio}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rounded-lg bg-red-700 px-2 py-1 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:bg-gray-300" disabled={!item.podeSimularAprovacao || status === 'aprovada_simulada'} onClick={() => agir(item.auditoria.id, 'aprovar', item)} data-testid={`aprovar-${item.auditoria.id}`}>Simular aprovação</button>
              <button type="button" className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] font-black text-gray-700" onClick={() => agir(item.auditoria.id, 'rejeitar', item)} data-testid={`rejeitar-${item.auditoria.id}`}>Simular rejeição</button>
              <button type="button" className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] font-black text-gray-700" onClick={() => agir(item.auditoria.id, 'pedir_documento', item)} data-testid={`documento-${item.auditoria.id}`}>Pedir documentação</button>
              <button type="button" className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] font-black text-gray-700" onClick={() => agir(item.auditoria.id, 'reverter', item)} data-testid={`reverter-${item.auditoria.id}`}>Desfazer</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cartao({ titulo, valor, detalhe, teste }: { titulo: string; valor: string; detalhe: string; teste: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3" data-testid={teste}>
      <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">{titulo}</p>
      <p className="mt-1 font-mono text-xl font-black text-gray-900">{valor}</p>
      <p className="mt-1 text-[10px] font-bold text-gray-500">{detalhe}</p>
    </div>
  );
}

function BotaoDestino({ ativo, onClick, teste, children }: { ativo: boolean; onClick: () => void; teste: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-testid={teste} className={`rounded-full px-3 py-1.5 text-xs font-bold ${ativo ? 'bg-red-700 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}>
      {children}
    </button>
  );
}

export default CentroHomologacao;
