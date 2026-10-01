import React, { useEffect, useState } from 'react';
import type { SessaoCeva } from '../../lib/cevaPortal/sessaoCliente';
import { LogoCeva } from './LogoCeva';
import { usePortalCliente } from './portalMarca';

const CAMPO = 'mt-4 block text-sm font-semibold text-slate-600';
const CONTROLE = 'mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[var(--portal-destaque)] focus:ring-4 focus:ring-[var(--portal-anel)]';

export const AcessoCeva: React.FC<{ onEntrar: (sessao: SessaoCeva) => void }> = ({ onEntrar }) => {
  const portal = usePortalCliente();
  const [modo, setModo] = useState<'escolha' | 'login' | 'primeiro'>('escolha');
  const [temAdministrador, setTemAdministrador] = useState<boolean | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 20000);
    fetch(portal.url('/acesso'), { signal: ac.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível abrir o acesso.');
        setTemAdministrador(data.temAdministrador === true);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') {
          setErro('O servidor demorou demais para responder. Atualize a página.');
          return;
        }
        setErro(err.message || 'Falha de comunicação.');
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [portal]);

  function voltar() {
    setModo('escolha');
    setErro('');
    setSenha('');
    setConfirmacao('');
    setMostrarSenha(false);
  }

  async function enviar(event: React.FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro('');
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 25000);
    try {
      const primeiro = modo === 'primeiro';
      const response = await fetch(primeiro ? portal.url('/primeiro-acesso') : portal.url('/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(primeiro ? { nome, email, senha, confirmacao } : { email, senha }),
        signal: ac.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
      const sessao = { token: String(data.token || ''), user: data.user } as SessaoCeva;
      if (!sessao.token || (sessao.user?.perfil !== 'administrador' && sessao.user?.perfil !== 'analista')) {
        throw new Error('Resposta de acesso incompleta.');
      }
      portal.gravar(sessao);
      onEntrar(sessao);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setErro('O login demorou demais. Tente de novo em instantes.');
      } else {
        setErro(err instanceof Error ? err.message : 'Falha de comunicação.');
      }
    } finally {
      window.clearTimeout(timer);
      setEnviando(false);
    }
  }

  const titulo = modo === 'login' ? 'Bem-vindo de volta' : modo === 'primeiro' ? 'Primeiro acesso' : 'Como você entra?';
  const texto = modo === 'login'
    ? 'Use o e-mail liberado e a sua senha.'
    : modo === 'primeiro' && temAdministrador === false
      ? 'Ainda não há administrador. Este cadastro passa a cuidar do portal e a liberar as outras pessoas.'
      : modo === 'primeiro'
        ? 'A senha temporária chega no e-mail quando o administrador libera o acesso. No primeiro login a troca é obrigatória.'
        : 'Entre com a senha. Se o administrador acabou de liberar, use a senha do e-mail e troque no primeiro acesso.';

  return (
    <div className="min-h-screen bg-[var(--portal-painel)] text-white lg:grid lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative overflow-hidden px-6 py-10 sm:px-10 lg:px-16 lg:py-14">
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[var(--portal-destaque-glow)] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[var(--portal-brilho)] blur-3xl" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" viewBox="0 0 800 700" fill="none" aria-hidden="true">
          <path d="M80 540 C 180 460, 220 300, 340 250 S 520 180, 700 120" stroke="url(#rota)" strokeWidth="3" strokeDasharray="8 10" />
          <circle cx="80" cy="540" r="7" fill="#ffb4b4" />
          <circle cx="700" cy="120" r="7" fill="#ffffff" />
          <defs>
            <linearGradient id="rota" x1="80" y1="540" x2="700" y2="120">
              <stop stopColor="#ffb4b4" />
              <stop offset="1" stopColor="#ffffff" />
            </linearGradient>
          </defs>
        </svg>
        <div className="relative flex h-full flex-col justify-between gap-10">
          <img src="/logo.png" alt="Grupo TM SEG" className="h-20 w-auto self-start" />
          <div>
            <span className="inline-flex rounded-2xl bg-white px-4 py-2 shadow-lg shadow-black/20">
              <LogoCeva tamanho="destaque" />
            </span>
            <h1 className="mt-5 max-w-xl text-4xl font-black leading-tight sm:text-5xl">Controle de Escolta</h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">Os números reais do boletim de medição, da origem ao destino, em uma tela só.</p>
            <div className="mt-8 flex flex-wrap gap-2">
              {['Boletim real', 'Origem x destino', 'Em viagem em destaque'].map((item) => (
                <span key={item} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-slate-200">{item}</span>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">Grupo TM SEG · Serviços em segurança</p>
        </div>
      </section>

      <section className="relative flex items-center bg-[var(--portal-fundo)] px-5 py-10 text-slate-800 sm:px-10 lg:rounded-l-[3rem] lg:px-14">
        <div className="mx-auto w-full max-w-md">
          {modo !== 'escolha' && (
            <button type="button" onClick={voltar} className="mb-4 text-sm font-semibold text-slate-500">← Voltar</button>
          )}
          <h2 className="text-3xl font-black tracking-tight text-[var(--portal-marca)]">{titulo}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{texto}</p>

          {modo === 'escolha' && (
            <div className="mt-8 grid gap-3">
              <button type="button" onClick={() => { setModo('login'); setErro(''); }} className="group flex items-center justify-between rounded-3xl bg-[var(--portal-acao)] px-5 py-4 text-left text-white shadow-lg shadow-black/20 transition hover:-translate-y-0.5">
                <span>
                  <span className="block text-base font-bold">Entrar</span>
                  <span className="mt-0.5 block text-xs text-slate-300">Já tenho senha</span>
                </span>
                <span className="text-xl transition group-hover:translate-x-1">→</span>
              </button>
              <button type="button" onClick={() => { setModo('primeiro'); setErro(''); }} className="group flex items-center justify-between rounded-3xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--portal-destaque)]">
                <span>
                  <span className="block text-base font-bold text-[var(--portal-marca)]">Primeiro acesso</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Recebi a senha por e-mail</span>
                </span>
                <span className="text-xl text-[var(--portal-destaque)] transition group-hover:translate-x-1">→</span>
              </button>
              {erro && <p className="text-sm text-red-700">{erro}</p>}
            </div>
          )}

          {modo === 'primeiro' && temAdministrador !== false && (
            <button type="button" onClick={() => { setModo('login'); setErro(''); }} className="mt-6 h-12 w-full rounded-2xl bg-[var(--portal-acao)] text-sm font-bold text-white">Entrar com a senha do e-mail</button>
          )}

          {modo !== 'escolha' && !(modo === 'primeiro' && temAdministrador !== false) && (
            <form onSubmit={(event) => void enviar(event)} className="mt-2">
              {modo === 'primeiro' && temAdministrador === false && (
                <label className={CAMPO}>Nome
                  <input value={nome} onChange={(event) => setNome(event.target.value)} className={CONTROLE} autoComplete="name" required />
                </label>
              )}
              <label className={CAMPO}>E-mail
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={CONTROLE} autoComplete="username" required />
              </label>
              <label className={CAMPO}>Senha
                <span className="relative mt-1.5 block">
                  <input type={mostrarSenha ? 'text' : 'password'} value={senha} onChange={(event) => setSenha(event.target.value)} className={`${CONTROLE} mt-0 pr-20`} autoComplete={modo === 'login' ? 'current-password' : 'new-password'} required />
                  <button type="button" onClick={() => setMostrarSenha((atual) => !atual)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">{mostrarSenha ? 'Ocultar' : 'Mostrar'}</button>
                </span>
              </label>
              {modo === 'primeiro' && (
                <label className={CAMPO}>Confirmar senha
                  <input type={mostrarSenha ? 'text' : 'password'} value={confirmacao} onChange={(event) => setConfirmacao(event.target.value)} className={CONTROLE} autoComplete="new-password" required />
                </label>
              )}
              {erro && <p className="mt-4 text-sm text-red-700">{erro}</p>}
              <button type="submit" disabled={enviando} className="mt-6 h-12 w-full rounded-2xl bg-[var(--portal-acao)] text-sm font-bold text-white shadow-lg shadow-black/25 transition hover:bg-[var(--portal-acao-hover)] disabled:opacity-60">
                {enviando ? 'Aguarde...' : modo === 'login' ? 'Entrar no controle' : temAdministrador === false ? 'Criar administrador' : 'Criar minha senha'}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
};
