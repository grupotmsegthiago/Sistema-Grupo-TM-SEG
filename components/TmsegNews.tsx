import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, GraduationCap, Megaphone, Newspaper, Paperclip, Receipt, Users } from 'lucide-react';
import { canAccessScreen } from '../lib/screenAccess';
import { useNotification } from '../lib/NotificationContext';
import { supabase } from '../lib/supabase';
import { MODULOS } from '../lib/training/operadorAcademy';
import { modulosDaSessao } from '../lib/training/trainingStore';
import {
  ACAO_NEWS,
  ACAO_NEWS_VIEW,
  noticiaDoLog,
  nomesQueViram,
  podePublicarNews,
  podeVerNews,
  publicarNews,
  type Noticia,
  type UsuarioNews,
} from '../lib/tmsegNews';

function usuarioAtual(): UsuarioNews & { name?: string } {
  try {
    return JSON.parse(localStorage.getItem('userData') || '{}');
  } catch {
    return {};
  }
}

const ATALHOS = [
  { id: 'escala', titulo: 'Escala de trabalho', texto: 'Folha de ponto e o ritmo do dia.', tela: 'rh-timeclock', icon: CalendarDays },
  { id: 'info', titulo: 'Informações', texto: 'Avisos da diretoria e novidades da equipe.', tela: '', icon: Newspaper },
  { id: 'holerite', titulo: 'Download do holerite', texto: 'O PDF completo fica no Meu Portal.', tela: 'meu-portal', icon: Receipt },
  { id: 'portal', titulo: 'Meu Portal', texto: 'Ponto, escala, holerites, documentos e solicitações.', tela: 'meu-portal', icon: Users },
];

export default function TmsegNews({ compact = false }: { compact?: boolean }) {
  const { showNotification } = useNotification();
  const usuario = useMemo(() => usuarioAtual(), []);
  const publica = podePublicarNews(usuario);
  const ve = podeVerNews(usuario);
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [vistas, setVistas] = useState<Record<string, string[]>>({});
  const [aberto, setAberto] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [anexo, setAnexo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const anexoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const posts = await supabase
      .from('system_logs')
      .select('id, entity_id, user_name, details, created_at')
      .eq('action_type', ACAO_NEWS)
      .order('created_at', { ascending: false })
      .limit(30);
    const lista = (posts.data || []).map(noticiaDoLog).filter((item): item is Noticia => Boolean(item));
    setNoticias(lista);
    const ids = lista.map((item) => item.id).filter(Boolean);
    if (!ids.length) {
      setVistas({});
      return;
    }
    const views = await supabase
      .from('system_logs')
      .select('entity_id, user_name')
      .eq('action_type', ACAO_NEWS_VIEW)
      .in('entity_id', ids)
      .limit(1000);
    const mapa: Record<string, string[]> = {};
    for (const row of views.data || []) {
      const id = String(row.entity_id || '');
      if (!id) continue;
      mapa[id] = nomesQueViram([...(mapa[id] || []), String(row.user_name || '')]);
    }
    setVistas(mapa);
  }, []);

  useEffect(() => {
    if (!ve) return;
    void carregar();
  }, [ve, carregar]);

  useEffect(() => {
    if (!ve) return;
    const eu = String(usuario.name || '').trim();
    if (!eu || !noticias.length) return;
    for (const noticia of noticias) {
      const atuais = vistas[noticia.id] || [];
      const ja = atuais.length > 0 && nomesQueViram([...atuais, eu]).length === atuais.length;
      const chave = `tmseg-news-vista:${noticia.id}:${eu}`;
      if (ja || sessionStorage.getItem(chave)) continue;
      sessionStorage.setItem(chave, '1');
      void supabase.from('system_logs').insert([{
        user_name: eu,
        action_type: ACAO_NEWS_VIEW,
        entity: 'News',
        entity_id: noticia.id,
        details: JSON.stringify({ nome: eu }),
      }]).then(({ error }) => {
        if (error) sessionStorage.removeItem(chave);
      });
    }
  }, [ve, noticias, vistas, usuario.name]);

  useEffect(() => {
    if (!ve) return;
    const onLog = (event: Event) => {
      const payload = (event as CustomEvent).detail as { eventType?: string; new?: { action_type?: string; user_name?: string; details?: string } } | undefined;
      if (payload?.eventType !== 'INSERT' || payload.new?.action_type !== ACAO_NEWS) return;
      const noticia = noticiaDoLog(payload.new);
      void carregar();
      if (!noticia) return;
      if (String(payload.new.user_name || '') === String(usuario.name || '')) return;
      showNotification('TM SEG NEWS', noticia.titulo, noticia.tipo === 'informe' ? 'info' : 'success', `news-${noticia.titulo}`);
    };
    window.addEventListener('supabase:system_logs:realtime', onLog);
    return () => window.removeEventListener('supabase:system_logs:realtime', onLog);
  }, [ve, carregar, showNotification, usuario.name]);

  const publicar = async () => {
    setEnviando(true);
    let anexoNome = '';
    let anexoUrl = '';
    if (anexo) {
      const safe = anexo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `news/${Date.now()}_${safe}`;
      const upload = await supabase.storage.from('mission-evidence').upload(path, anexo, {
        upsert: true,
        contentType: anexo.type || 'application/octet-stream',
      });
      if (upload.error) {
        setEnviando(false);
        showNotification('Anexo', upload.error.message, 'warning');
        return;
      }
      anexoNome = anexo.name;
      anexoUrl = supabase.storage.from('mission-evidence').getPublicUrl(path).data.publicUrl;
    }
    const resultado = await publicarNews({
      titulo,
      texto,
      tipo: 'informe',
      autor: String(usuario.name || 'Diretoria'),
      anexoNome,
      anexoUrl,
    });
    setEnviando(false);
    if (!resultado.ok) {
      showNotification('Não publiquei', resultado.error, 'warning');
      return;
    }
    setTitulo('');
    setTexto('');
    setAnexo(null);
    if (anexoRef.current) anexoRef.current.value = '';
    showNotification('Publicado', 'A equipe já pode ler no TM SEG NEWS.', 'success');
    void carregar();
  };

  const abrirAtalho = (tela: string, tituloAtalho: string) => {
    if (!tela) {
      document.getElementById('tmseg-news-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!canAccessScreen(usuario, tela)) {
      showNotification(tituloAtalho, 'Seu acesso ainda não abre esta tela. Fale com o RH ou com a diretoria.', 'info');
      return;
    }
    window.dispatchEvent(new CustomEvent('tmseg:navigate', { detail: tela }));
  };

  if (!ve) return null;
  const primeiro = String(usuario.name || '').trim().split(' ')[0] || 'equipe';
  const lista = compact ? noticias.slice(0, 3) : noticias;
  const aulas = MODULOS.filter((item) => item.trilha === 'operador');
  const aulasVistas = modulosDaSessao(usuario as { trainingModules?: unknown });

  return (
    <section className="space-y-4" data-testid="tmseg-news">
      <div className="rounded-2xl bg-gray-950 p-5 text-white shadow-xl">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">TM SEG NEWS</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight">Olá, {primeiro}.</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-300">
          Avisos da diretoria, cliente novo e fornecedor novo. Todo mundo lê. A diretoria vê quem visualizou.
        </p>
      </div>

      {!compact && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ATALHOS.map((atalho) => {
            const Icon = atalho.icon;
            return (
              <button
                key={atalho.id}
                type="button"
                onClick={() => abrirAtalho(atalho.tela, atalho.titulo)}
                className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-red-200"
                data-testid={`tmseg-news-atalho-${atalho.id}`}
              >
                <Icon size={18} className="text-red-700" />
                <p className="mt-2 text-sm font-black text-gray-900">{atalho.titulo}</p>
                <p className="mt-1 text-xs text-gray-500">{atalho.texto}</p>
              </button>
            );
          })}
        </div>
      )}

      {!compact && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="tmseg-news-treinamento">
          <p className="flex items-center gap-2 text-xs font-black uppercase text-gray-700">
            <GraduationCap size={14} /> Treinamento
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {aulas.map((aula) => {
              const viu = aulasVistas.includes(aula.id);
              return (
                <button
                  key={aula.id}
                  type="button"
                  onClick={() => abrirAtalho('treinamento', aula.titulo)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${viu ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}
                >
                  {viu ? 'Assistiu' : 'Não assistiu'} · {aula.titulo}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {publica && (
        <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-black uppercase text-red-800">
            <Megaphone size={14} /> Publicar para toda a equipe
          </p>
          <input
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            placeholder="Título"
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            data-testid="tmseg-news-titulo"
          />
          <textarea
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            rows={compact ? 2 : 3}
            placeholder="A informação que todo mundo precisa ler"
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            data-testid="tmseg-news-texto"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-black uppercase text-gray-700">
              <Paperclip size={14} /> Anexar
              <input
                ref={anexoRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                data-testid="tmseg-news-anexo"
                onChange={(event) => setAnexo(event.target.files?.[0] || null)}
              />
            </label>
            {anexo && <span className="text-xs text-gray-500">{anexo.name}</span>}
            <button
              type="button"
              onClick={() => { void publicar(); }}
              disabled={enviando}
              className="rounded-xl bg-red-700 px-3 py-2 text-[11px] font-black uppercase text-white disabled:opacity-60"
              data-testid="tmseg-news-publicar"
            >
              Publicar
            </button>
          </div>
        </div>
      )}

      <div id="tmseg-news-feed" className="space-y-3">
        {lista.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
            Nenhuma notícia ainda. Quando a diretoria publicar, ou quando entrar um cliente ou fornecedor, aparece aqui.
          </p>
        )}
        {lista.map((noticia) => {
          const quemViu = vistas[noticia.id] || [];
          return (
            <article key={noticia.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" data-testid={`tmseg-news-item-${noticia.id}`}>
              <p className="text-[10px] font-black uppercase text-red-700">
                {noticia.tipo === 'cliente' ? 'Cliente novo' : noticia.tipo === 'fornecedor' ? 'Fornecedor novo' : 'Informe'}
                {noticia.quando ? ` · ${noticia.quando}` : ''}
              </p>
              <h3 className="mt-1 text-base font-black text-gray-900">{noticia.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-700">{noticia.texto}</p>
              {noticia.anexoUrl && (
                <a href={noticia.anexoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-black uppercase text-red-700">
                  <Paperclip size={12} /> {noticia.anexoNome || 'Abrir anexo'}
                </a>
              )}
              <p className="mt-2 text-[11px] font-bold text-gray-400">Por {noticia.autor}</p>
              {publica && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setAberto((atual) => atual === noticia.id ? null : noticia.id)}
                    className="text-[11px] font-black uppercase text-gray-600 underline"
                    data-testid={`tmseg-news-vistas-${noticia.id}`}
                  >
                    {quemViu.length} visualizaram
                  </button>
                  {aberto === noticia.id && (
                    <p className="mt-1 text-xs text-gray-600">
                      {quemViu.length ? quemViu.join(', ') : 'Ninguém visualizou ainda.'}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
