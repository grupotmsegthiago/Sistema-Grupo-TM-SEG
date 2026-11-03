import React from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { montarPainel, type Fatia, type LinhaPainel } from '../../lib/cevaPortal/painel';
import { usePortalCliente } from './portalMarca';

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function horas(minutos: number): string {
  const inteiras = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${inteiras.toLocaleString('pt-BR')}h${String(resto).padStart(2, '0')}`;
}

function Cartao({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <article className="rounded-3xl bg-white px-4 py-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-black tracking-tight text-[var(--portal-marca)]">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
    </article>
  );
}

function Barras({ titulo, itens, modo }: { titulo: string; itens: Fatia[]; modo: 'valor' | 'quantidade' }) {
  const maximo = Math.max(...itens.map((item) => (modo === 'valor' ? item.valor : item.quantidade)), 1);
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm">
      <h3 className="text-sm font-black text-[var(--portal-marca)]">{titulo}</h3>
      {itens.length === 0 && <p className="mt-3 text-xs text-slate-500">Ainda sem dados neste recorte.</p>}
      <ul className="mt-3 grid gap-2">
        {itens.map((item) => {
          const medida = modo === 'valor' ? item.valor : item.quantidade;
          return (
            <li key={item.nome}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate font-bold text-slate-700">{item.nome}</span>
                <span className="shrink-0 text-slate-500">{modo === 'valor' ? `${moeda(item.valor)} · ${item.quantidade.toLocaleString('pt-BR')} OS` : `${item.quantidade.toLocaleString('pt-BR')} OS`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[var(--portal-marca)]" style={{ width: `${Math.max(4, (medida / maximo) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const PainelDiretoria: React.FC<{ linhas: LinhaPainel[] }> = ({ linhas }) => {
  const portal = usePortalCliente();
  const painel = montarPainel(linhas);
  const mostrarOperacao = !portal.marca.colunasOcultas.includes('Operação');
  const cancelamento = painel.os ? (painel.canceladas / painel.os) * 100 : 0;
  const composicao = [
    { nome: 'Acionamento', valor: painel.acionamento },
    { nome: 'Km excedente', valor: painel.kmExcedenteValor },
    { nome: 'Horas excedentes', valor: painel.horasExcedenteValor },
    { nome: 'Pedágio', valor: painel.pedagio },
  ];

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao rotulo="OS no recorte" valor={painel.os.toLocaleString('pt-BR')} detalhe={painel.semValor ? `${painel.semValor.toLocaleString('pt-BR')} sem R$ total` : 'Todas com valor do boletim'} />
        <Cartao rotulo="Faturamento" valor={moeda(painel.faturamento)} detalhe="Soma do R$ total do boletim" />
        <Cartao rotulo="Ticket médio" valor={painel.ticketMedio == null ? '—' : moeda(painel.ticketMedio)} detalhe="Só OS com R$ total" />
        <Cartao rotulo="Cancelamento" valor={`${cancelamento.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} detalhe={`${painel.canceladas.toLocaleString('pt-BR')} OS · ${painel.emViagem.toLocaleString('pt-BR')} em viagem`} />
        <Cartao rotulo="Km rodado" valor={painel.kmRodado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} detalhe={`${painel.kmExcedente.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km excedentes`} />
        <Cartao rotulo="Horas trabalhadas" valor={horas(painel.minutosTrabalhados)} detalhe={`${painel.concluidas.toLocaleString('pt-BR')} concluídas`} />
        <Cartao rotulo="Acionamento" valor={moeda(painel.acionamento)} />
        <Cartao rotulo="Excedentes + pedágio" valor={moeda(painel.kmExcedenteValor + painel.horasExcedenteValor + painel.pedagio)} detalhe="Km, horas e pedágio do boletim" />
      </div>

      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black text-[var(--portal-marca)]">Mês a mês</h3>
        <p className="text-xs text-slate-500">Barras são a quantidade de OS. A linha é o faturamento do boletim.</p>
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={painel.meses}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis yAxisId="os" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
              <YAxis yAxisId="rs" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(valor) => `${Math.round(Number(valor) / 1000)} mil`} />
              <Tooltip formatter={(valor, nome) => nome === 'Faturamento' ? moeda(Number(valor)) : Number(valor).toLocaleString('pt-BR')} />
              <Bar yAxisId="os" dataKey="os" name="OS" fill="var(--portal-marca)" radius={[8, 8, 0, 0]} />
              <Line yAxisId="rs" dataKey="faturamento" name="Faturamento" stroke="var(--portal-destaque)" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Barras titulo="Serviço" itens={painel.servicos} modo="valor" />
        <Barras titulo="Situação" itens={painel.status} modo="quantidade" />
        <section className="rounded-3xl bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-black text-[var(--portal-marca)]">Composição do boletim</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {composicao.map((parte) => (
              <div key={parte.nome} className="rounded-2xl bg-[var(--portal-fundo)] px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{parte.nome}</p>
                <p className="mt-1 text-lg font-black text-[var(--portal-marca)]">{moeda(parte.valor)}</p>
              </div>
            ))}
          </div>
        </section>
        <Barras titulo="Motoristas" itens={painel.motoristas} modo="valor" />
        <Barras titulo="Placas" itens={painel.placas} modo="valor" />
        <Barras titulo="Origem" itens={painel.origens} modo="valor" />
        {mostrarOperacao && painel.operacoes.length > 0 && <Barras titulo="Operação" itens={painel.operacoes} modo="valor" />}
      </div>
    </div>
  );
};
