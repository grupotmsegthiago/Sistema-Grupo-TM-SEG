import React, { useEffect, useState } from 'react';
import { LogoCeva } from './LogoCeva';
import { usePortalCliente } from './portalMarca';

type Pessoa = {
  id: string;
  nome: string;
  email: string;
  perfil: 'administrador' | 'analista';
  status: 'pendente' | 'ativo' | 'inativo';
  trocarSenha?: boolean;
};

function situacao(pessoa: Pessoa): string {
  if (pessoa.status === 'inativo') return 'Bloqueado';
  if (pessoa.trocarSenha) return 'Senha enviada · troca obrigatória';
  if (pessoa.status === 'pendente') return 'Aguardando';
  return 'Ativo';
}

const SELO: Record<Pessoa['status'], string> = {
  pendente: 'bg-amber-100 text-amber-900',
  ativo: 'bg-emerald-100 text-emerald-900',
  inativo: 'bg-slate-200 text-slate-600',
};

const CAMPO = 'block text-sm font-semibold text-slate-600';
const CONTROLE = 'mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[var(--portal-destaque)] focus:ring-4 focus:ring-[var(--portal-anel)]';

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

export const PessoasCeva: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const portal = usePortalCliente();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState<'administrador' | 'analista'>('analista');
  const [confirmarAdmin, setConfirmarAdmin] = useState(false);
  const [bloqueio, setBloqueio] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    const response = await fetch(portal.url('/pessoas'), { headers: portal.cabecalhos() });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      portal.sair();
      return;
    }
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as pessoas.');
    setPessoas(Array.isArray(data.pessoas) ? data.pessoas : []);
  }

  useEffect(() => {
    carregar().catch((err: Error) => setErro(err.message));
  }, []);

  function escolherPerfil(proximo: 'administrador' | 'analista') {
    setPerfil(proximo);
    setConfirmarAdmin(false);
  }

  async function liberar(event: React.FormEvent) {
    event.preventDefault();
    if (perfil === 'administrador' && !confirmarAdmin) {
      setConfirmarAdmin(true);
      setAviso('');
      return;
    }
    setEnviando(true);
    setErro('');
    setAviso('');
    try {
      const response = await fetch(portal.url('/pessoas'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...portal.cabecalhos() },
        body: JSON.stringify({ nome, email, perfil }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        portal.sair();
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Não foi possível liberar o acesso.');
      setNome('');
      setEmail('');
      setPerfil('analista');
      setConfirmarAdmin(false);
      setAviso(`Senha enviada para ${data.pessoa?.email || email}. No primeiro acesso a troca é obrigatória.`);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha de comunicação.');
    } finally {
      setEnviando(false);
    }
  }

  async function alterar(pessoa: Pessoa, status: 'ativo' | 'inativo') {
    setErro('');
    const response = await fetch(portal.url(`/pessoas/${pessoa.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...portal.cabecalhos() },
      body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      portal.sair();
      return;
    }
    if (!response.ok) {
      setErro(data.error || 'Não foi possível alterar a pessoa.');
      return;
    }
    setBloqueio(null);
    await carregar();
  }

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-[#091426]">
      <div className="min-h-screen lg:grid lg:grid-cols-[0.78fr_1.22fr]">
        <section className="relative overflow-hidden px-6 py-8 text-white sm:px-10 lg:px-12 lg:py-12">
          <div className="pointer-events-none absolute -left-16 top-8 h-64 w-64 rounded-full bg-[var(--portal-destaque-glow)] blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[#2f6fed]/20 blur-3xl" />
          <div className="relative flex flex-col gap-8">
            <div>
              <img src="/logo.png" alt="Grupo TM SEG" className="h-16 w-auto" />
              <span className="mt-6 inline-flex rounded-2xl bg-white px-4 py-2">
                <LogoCeva tamanho="destaque" />
              </span>
              <p className="mt-8 text-xs font-bold uppercase tracking-[0.28em] text-[#ffb4b4]">Acessos</p>
              <h2 className="mt-3 max-w-sm text-4xl font-black leading-tight">Quem entra no controle</h2>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">Só o administrador libera pessoas. A senha temporária vai por e-mail, e no primeiro acesso a troca é obrigatória.</p>
            </div>
            <ul className="grid gap-3 text-sm">
              {[
                ['Senha por e-mail', 'O e-mail só sai na liberação, com a senha temporária.'],
                ['Dois perfis', 'Analista consulta e preenche. Administrador também cuida dos acessos.'],
                ['Último administrador', 'O portal não deixa bloquear o único administrador ativo.'],
              ].map(([titulo, detalhe]) => (
                <li key={titulo} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="block font-bold">{titulo}</span>
                  <span className="mt-0.5 block text-xs text-slate-300">{detalhe}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-[var(--portal-fundo)] px-5 py-8 text-slate-800 sm:px-8 lg:rounded-l-[3rem] lg:px-10">
          <div className="mx-auto flex max-w-3xl items-start justify-between gap-4">
            <div>
              <h3 className="text-3xl font-black tracking-tight text-[var(--portal-marca)]">Liberar uma pessoa</h3>
              <p className="mt-1 text-sm text-slate-600">Nome, e-mail e o que essa pessoa pode fazer.</p>
            </div>
            <button type="button" onClick={onFechar} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[var(--portal-marca)]">Fechar</button>
          </div>

          <form onSubmit={(event) => void liberar(event)} className="mx-auto mt-6 max-w-3xl rounded-[2rem] bg-white p-5 shadow-xl shadow-slate-300/40 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={CAMPO}>Nome
                <input value={nome} onChange={(event) => setNome(event.target.value)} className={CONTROLE} required />
              </label>
              <label className={CAMPO}>E-mail
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={CONTROLE} required />
              </label>
            </div>
            <p className="mb-2 mt-5 text-sm font-semibold text-slate-600">Perfil</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => escolherPerfil('analista')} className={`rounded-3xl border px-4 py-4 text-left transition ${perfil === 'analista' ? 'border-[var(--portal-acao)] bg-[var(--portal-acao)] text-white shadow-lg' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
                <span className="block text-base font-bold">Analista</span>
                <span className={`mt-1 block text-xs ${perfil === 'analista' ? 'text-slate-300' : 'text-slate-500'}`}>Entra no controle e preenche a escolta. Não cadastra pessoas.</span>
              </button>
              <button type="button" onClick={() => escolherPerfil('administrador')} className={`rounded-3xl border px-4 py-4 text-left transition ${perfil === 'administrador' ? 'border-[var(--portal-destaque)] bg-[var(--portal-destaque-suave)] shadow-lg' : 'border-slate-200 bg-slate-50'}`}>
                <span className="block text-base font-bold text-[var(--portal-marca)]">Administrador</span>
                <span className="mt-1 block text-xs text-slate-500">Libera, bloqueia e também entra no controle. Peça só para quem precisa.</span>
              </button>
            </div>
            {confirmarAdmin && (
              <p className="mt-4 rounded-2xl bg-[var(--portal-destaque-suave)] px-4 py-3 text-sm text-[#8a3030]">Esta pessoa vai poder cadastrar e bloquear acessos. Confirme se é isso mesmo.</p>
            )}
            {aviso && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{aviso}</p>}
            {erro && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</p>}
            <button type="submit" disabled={enviando} className="mt-5 h-12 w-full rounded-2xl bg-[var(--portal-acao)] text-sm font-bold text-white shadow-lg shadow-black/20 disabled:opacity-60">
              {enviando ? 'Liberando...' : confirmarAdmin ? 'Confirmar administrador' : 'Liberar acesso'}
            </button>
          </form>

          <div className="mx-auto mt-6 grid max-w-3xl gap-3">
            {pessoas.map((pessoa) => (
              <article key={pessoa.id} className="flex flex-wrap items-center gap-3 rounded-3xl bg-white px-4 py-3 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--portal-acao)] text-sm font-black text-white">{iniciais(pessoa.nome)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[var(--portal-marca)]">{pessoa.nome}</p>
                  <p className="truncate text-xs text-slate-500">{pessoa.email}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-600">{pessoa.perfil}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${pessoa.trocarSenha ? 'bg-amber-100 text-amber-900' : SELO[pessoa.status]}`}>{situacao(pessoa)}</span>
                {pessoa.status === 'inativo' ? (
                  <button type="button" onClick={() => void alterar(pessoa, 'ativo')} className="rounded-full bg-[var(--portal-acao)] px-3 py-1.5 text-xs font-bold text-white">Reativar</button>
                ) : bloqueio === pessoa.id ? (
                  <span className="flex gap-2">
                    <button type="button" onClick={() => void alterar(pessoa, 'inativo')} className="rounded-full bg-[#8a3030] px-3 py-1.5 text-xs font-bold text-white">Confirmar bloqueio</button>
                    <button type="button" onClick={() => setBloqueio(null)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">Cancelar</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setBloqueio(pessoa.id)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">Bloquear</button>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
