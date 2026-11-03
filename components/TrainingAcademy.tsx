import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, GraduationCap, LogOut } from 'lucide-react';
import {
  MODULOS,
  QUESTOES,
  corrigirProva,
  modulosObrigatoriosConcluidos,
  moduloPorId,
} from '../lib/training/operadorAcademy';
import { gravarModuloAssistido, gravarProva, modulosDaSessao } from '../lib/training/trainingStore';

type Props = {
  mode: 'obrigatorio' | 'revisao';
  onPassed?: () => void;
  onLogout?: () => void;
};

function lerUsuario() {
  try {
    return JSON.parse(localStorage.getItem('userData') || '{}');
  } catch {
    return {};
  }
}

const TrainingAcademy: React.FC<Props> = ({ mode, onPassed, onLogout }) => {
  const usuario = lerUsuario();
  const [concluidos, setConcluidos] = useState<string[]>(() => modulosDaSessao(usuario));
  const [moduloId, setModuloId] = useState(MODULOS[0].id);
  const [provaAberta, setProvaAberta] = useState(false);
  const [respostas, setRespostas] = useState<Array<number | null>>(QUESTOES.map(() => null));
  const [resultado, setResultado] = useState<{ acertos: number; passou: boolean } | null>(null);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const [videoPronto, setVideoPronto] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const maxVisto = useRef(0);

  const modulo = moduloPorId(moduloId) || MODULOS[0];
  const obrigatorioOk = modulosObrigatoriosConcluidos(concluidos);
  const jaConcluido = concluidos.includes(modulo.id);
  const podeConcluir = videoPronto && !jaConcluido;

  const trilhas = useMemo(() => ([
    { id: 'operador' as const, nome: 'Trilha do Operador' },
    { id: 'avancado' as const, nome: 'Trilha do Avançado' },
  ]), []);

  const abrirModulo = (id: string) => {
    setProvaAberta(false);
    setResultado(null);
    setModuloId(id);
    setVideoPronto(false);
    maxVisto.current = 0;
    setErro('');
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || provaAberta) return;
    const tocar = () => { video.play().catch(() => {}); };
    if (video.readyState >= 2) tocar();
    else video.addEventListener('loadeddata', tocar, { once: true });
    return () => video.removeEventListener('loadeddata', tocar);
  }, [modulo.id, provaAberta]);

  const travarAvanco = () => {
    const video = videoRef.current;
    if (!video || jaConcluido || videoPronto) return;
    if (video.currentTime > maxVisto.current + 0.8) video.currentTime = maxVisto.current;
    else maxVisto.current = Math.max(maxVisto.current, video.currentTime);
  };

  const concluirModulo = async (forcar = false) => {
    if (!usuario.id || jaConcluido) return;
    if (!forcar && !videoPronto) return;
    setGravando(true);
    setErro('');
    try {
      const next = await gravarModuloAssistido(usuario.id, modulo.id, concluidos);
      setConcluidos(next);
    } catch (e: any) {
      setErro(e?.message || 'Não consegui gravar esta aula.');
    } finally {
      setGravando(false);
    }
  };

  const enviarProva = async () => {
    if (respostas.some((item) => item === null)) {
      setErro('Responda as 20 questões.');
      return;
    }
    const correcao = corrigirProva(respostas);
    setResultado({ acertos: correcao.acertos, passou: correcao.passou });
    setErro('');
    if (!usuario.id) return;
    setGravando(true);
    try {
      await gravarProva(usuario.id, correcao.acertos, correcao.passou);
      if (correcao.passou && mode === 'obrigatorio') onPassed?.();
    } catch (e: any) {
      setErro(e?.message || 'Não consegui gravar a prova.');
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className={mode === 'obrigatorio' ? 'min-h-screen bg-[#f4f5f7] text-gray-900' : 'text-gray-900'}>
      <header className="flex items-center justify-between bg-black px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <GraduationCap className="text-red-500" />
          <div>
            <p className="text-xs tracking-[0.2em] text-gray-400">GRUPO TMSEG</p>
            <h1 className="text-lg font-black">Treinamento</h1>
          </div>
        </div>
        {mode === 'obrigatorio' && onLogout && (
          <button type="button" onClick={onLogout} className="flex items-center gap-2 text-sm text-gray-300">
            <LogOut size={16} /> Sair
          </button>
        )}
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          {mode === 'obrigatorio' && (
            <p className="rounded-xl bg-red-50 px-3 py-3 text-sm font-semibold text-red-800">
              Assista os seis vídeos do Operador até o fim. A prova pede mais de 15 acertos para abrir o sistema.
            </p>
          )}
          {trilhas.map((trilha) => (
            <div key={trilha.id}>
              <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500">{trilha.nome}</p>
              <div className="space-y-1">
                {MODULOS.filter((item) => item.trilha === trilha.id).map((item) => {
                  const feito = concluidos.includes(item.id);
                  const ativo = !provaAberta && item.id === modulo.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => abrirModulo(item.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${ativo ? 'bg-black text-white' : 'bg-white text-gray-800'}`}
                    >
                      <span>{item.titulo}</span>
                      {feito && <Check size={14} className={ativo ? 'text-green-300' : 'text-green-600'} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={!obrigatorioOk}
            onClick={() => { setProvaAberta(true); setErro(''); }}
            className="w-full rounded-lg bg-orange-500 px-3 py-3 text-sm font-black uppercase text-black disabled:opacity-40"
          >
            Prova · 20 questões
          </button>
          {!obrigatorioOk && (
            <p className="text-xs text-gray-500">A prova abre quando os seis vídeos do Operador terminarem. A trilha Avançado não trava a entrada.</p>
          )}
        </aside>

        <main className="rounded-2xl border border-gray-200 bg-white p-6">
          {erro && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

          {!provaAberta && (
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-red-600">
                {modulo.trilha === 'operador' ? 'Operador' : 'Avançado'}
              </p>
              <h2 className="mt-2 text-2xl font-black">{modulo.titulo}</h2>
              <video
                key={modulo.id}
                ref={videoRef}
                className="mt-4 aspect-video w-full rounded-xl bg-black"
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
                preload="auto"
                src={`/treinamento/${modulo.id}.mp4?v=4`}
                onTimeUpdate={travarAvanco}
                onSeeking={travarAvanco}
                onEnded={() => {
                  setVideoPronto(true);
                  if (!jaConcluido) concluirModulo(true);
                }}
              />
              {jaConcluido ? (
                <p className="mt-3 text-sm font-bold text-green-700">Aula concluída. Pode rever o vídeo.</p>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  {gravando ? 'Gravando a aula...' : 'Assista até o fim. O avanço rápido fica travado até a aula terminar.'}
                </p>
              )}
              {podeConcluir && (
                <button type="button" disabled={gravando} onClick={concluirModulo} className="mt-3 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white">
                  Concluir aula
                </button>
              )}
            </div>
          )}

          {provaAberta && (
            <div className="space-y-6">
              <h2 className="text-2xl font-black">Prova do Operador</h2>
              <p className="text-sm text-gray-600">20 questões. Passa quem acerta mais de 15. Abaixo disso, revise a trilha e tente de novo.</p>
              {QUESTOES.map((questao, index) => (
                <fieldset key={questao.id} className="space-y-2">
                  <legend className="text-sm font-bold">{index + 1}. {questao.pergunta}</legend>
                  {questao.opcoes.map((opcao, opcaoIndex) => {
                    const marcada = respostas[index] === opcaoIndex;
                    const revelar = resultado && questao.correta === opcaoIndex;
                    return (
                      <label key={opcao} className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 text-sm ${revelar ? 'border-green-600 bg-green-50' : marcada ? 'border-black' : 'border-gray-200'}`}>
                        <input
                          type="radio"
                          name={questao.id}
                          checked={marcada}
                          onChange={() => {
                            setRespostas((lista) => lista.map((item, i) => (i === index ? opcaoIndex : item)));
                            setResultado(null);
                          }}
                        />
                        {opcao}
                      </label>
                    );
                  })}
                </fieldset>
              ))}
              <button type="button" disabled={gravando} onClick={enviarProva} className="rounded-lg bg-orange-500 px-5 py-3 text-sm font-black uppercase text-black">
                {gravando ? 'Gravando...' : 'Enviar prova'}
              </button>
              {resultado && (
                <p className={`text-sm font-bold ${resultado.passou ? 'text-green-700' : 'text-red-700'}`}>
                  {resultado.acertos} de 20. {resultado.passou ? 'Aprovado. O sistema está liberado.' : 'Ainda não. Revise as aulas e envie de novo.'}
                </p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default TrainingAcademy;
