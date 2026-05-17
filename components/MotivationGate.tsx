import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, CheckCircle2 } from 'lucide-react';
const img1 = '/motivation/m1.jpg';
const img2 = '/motivation/m2.jpg';
const img3 = '/motivation/m3.jpg';
const img4 = '/motivation/m4.jpg';
const img5 = '/motivation/m5.jpg';

interface MotivationGateProps {
    userId: string;
    userName?: string;
    onAcknowledge: () => void;
}

interface MotivationCard {
    image: string;
    title: string;
    subtitle: string;
    bullets: string[];
    footer?: string;
}

const ALL_CARDS: MotivationCard[] = [
    {
        image: img1,
        title: 'COMO FICAR À FRENTE DE 99% DAS PESSOAS',
        subtitle: 'Assuma o controle. Crie uma visão. Elimine o que não importa.',
        bullets: [
            'Crie sua Anti-Visão: escreva tudo o que você NÃO quer na sua vida — use isso como combustível.',
            'Desapareça por 6 meses: corte distrações, redes tóxicas e hábitos que drenam energia.',
            'Domine os fundamentos: o sucesso vem de ações repetitivas que constroem maestria.',
            'Abrace tentativas e erros: trate a vida como um projeto que exige ajuste constante.',
        ],
        footer: 'Mude a chave dentro de você — construa uma base que te levará à vida que deseja.',
    },
    {
        image: img2,
        title: 'COMO TER 8 HORAS DE TRABALHO TERMINADAS EM 4',
        subtitle: 'Foco profundo, prazos curtos, ritmo consistente.',
        bullets: [
            'Bloqueie seu dia: foque em UMA tarefa por bloco, agrupe atividades similares.',
            'Defina prazos artificiais: prazos menores forçam foco e cortam procrastinação.',
            'Encontre seu estilo de trabalho ideal: planejador, priorizador, organizador ou visualizador.',
            'Lei de Parkinson: o trabalho se expande para preencher o tempo disponível — encurte o tempo.',
        ],
        footer: 'Nada disso importa se você estiver constantemente distraído. Desligue notificações.',
    },
    {
        image: img3,
        title: 'COMO ORGANIZAR SUAS IDEIAS — MÉTODO P.A.R.A.',
        subtitle: 'Construa seu segundo cérebro.',
        bullets: [
            'Projetos: conjuntos de tarefas com objetivo e prazo definidos.',
            'Áreas: aspectos da sua vida que precisam de manutenção contínua (saúde, finanças).',
            'Recursos: coleções de informações temáticas do seu interesse.',
            'Arquivos: tudo que já cumpriu sua função, mas vale guardar.',
        ],
        footer: 'Capture, organize, destile e expresse. Reveja toda semana.',
    },
    {
        image: img4,
        title: 'AS 8 REGRAS DE STEVE JOBS PARA EXCELÊNCIA EM VENDAS',
        subtitle: 'Venda experiência, não recurso.',
        bullets: [
            'Crie proposta de valor única — diferencie e comunique com paixão.',
            'Foque em benefícios, não em recursos: traduza especificações em vantagens reais.',
            'Mantenha a mensagem simples — destile ideias complexas em mensagens claras.',
            'Conte uma história envolvente e conheça profundamente seu público.',
            'Persistência diante da rejeição: use a rejeição como aprendizado.',
        ],
        footer: 'Estou convencido de que metade do que separa empreendedores bem-sucedidos dos não-sucedidos é a pura perseverança.',
    },
    {
        image: img5,
        title: 'COMO ENTRAR NO ESTADO DE FLOW',
        subtitle: 'A zona onde corpo e mente trabalham sem esforço.',
        bullets: [
            'PLENITUDE: alcance objetivos sem esforço, com profundo senso de propósito.',
            'FELICIDADE: imersão no presente, alegria e atemporalidade.',
            'CLAREZA: metas e objetivos claros, consciência aguçada do que importa.',
            'PERSISTÊNCIA: foco e determinação contínuos, energizado para superar obstáculos.',
        ],
        footer: 'O Estado de Flow nasce em: algo com que você se importa + algo em que é bom + algo desafiador + algo de longo prazo.',
    },
];

const QUOTES = [
    '"O sucesso é a soma de pequenos esforços repetidos dia após dia." — Robert Collier',
    '"A disciplina é a ponte entre metas e realizações." — Jim Rohn',
    '"Você não precisa ser grande para começar, mas precisa começar para ser grande." — Zig Ziglar',
    '"O foco é dizer NÃO a 1.000 coisas boas." — Steve Jobs',
    '"Não importa o quanto devagar você vá, desde que não pare." — Confúcio',
    '"A diferença entre comum e extraordinário é aquela pequena coisa extra." — Jimmy Johnson',
    '"O que é fácil de fazer também é fácil de não fazer." — Jim Rohn',
    '"Pessoas comuns pensam em como matar o tempo. Pessoas grandes pensam em como usá-lo." — Schopenhauer',
    '"O comprometimento transforma uma promessa em realidade."',
    '"1% melhor todos os dias = 37x melhor em um ano." — James Clear',
];

const STORAGE_KEY = 'motivation-ack';

function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shouldShowMotivation(userId: string): boolean {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return true;
        const data = JSON.parse(raw);
        return !(data[userId] && data[userId] === todayKey());
    } catch {
        return true;
    }
}

function markAcknowledged(userId: string) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : {};
        data[userId] = todayKey();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { console.error(e); }
}

export default function MotivationGate({ userId, userName, onAcknowledge }: MotivationGateProps) {
    const [index, setIndex] = useState(0);
    const [checked, setChecked] = useState(false);

    const sessionCards = useMemo(() => {
        const shuffled = [...ALL_CARDS].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, 3);
    }, [userId]);

    const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], [userId]);

    const card = sessionCards[index];
    const isLast = index === sessionCards.length - 1;

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const handleConfirm = () => {
        if (!checked) return;
        markAcknowledged(userId);
        onAcknowledge();
    };

    const firstName = (userName || '').split(' ')[0] || 'você';

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6" data-testid="motivation-gate">
            <div className="bg-gradient-to-br from-black via-zinc-950 to-black rounded-2xl max-w-3xl w-full max-h-[95vh] overflow-y-auto shadow-2xl border border-red-900/40">
                <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-red-900/30 flex items-center gap-3 bg-gradient-to-r from-red-950/40 to-transparent">
                    <div className="w-10 h-10 rounded-full bg-red-900/30 border border-red-700/50 flex items-center justify-center shrink-0">
                        <Sparkles className="text-red-500" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-white font-black text-base sm:text-lg leading-tight">Bom dia, <span className="text-red-500">{firstName}</span>.</h2>
                        <p className="text-zinc-400 text-xs sm:text-sm">Antes de começar, 1 minuto para subir o nível.</p>
                    </div>
                    <span className="text-red-500/80 text-xs font-bold whitespace-nowrap">{index + 1}/{sessionCards.length}</span>
                </div>

                <div className="px-5 sm:px-8 pt-5 pb-3">
                    <div className="relative rounded-xl overflow-hidden bg-black border border-red-900/30 mb-4">
                        <img src={card.image} alt={card.title} className="w-full h-auto block max-h-[60vh] object-contain bg-white" data-testid={`img-motivation-${index}`} />
                    </div>

                    <h3 className="text-white font-black text-lg sm:text-xl mb-1 leading-tight" data-testid={`text-title-${index}`}>{card.title}</h3>
                    <p className="text-red-400/90 text-sm mb-4 italic">{card.subtitle}</p>

                    <ul className="space-y-2 mb-4">
                        {card.bullets.map((b, i) => (
                            <li key={i} className="flex gap-2 text-zinc-200 text-sm leading-relaxed">
                                <span className="text-red-500 font-black shrink-0">→</span>
                                <span>{b}</span>
                            </li>
                        ))}
                    </ul>

                    {card.footer && (
                        <div className="bg-red-950/30 border-l-4 border-red-600 px-4 py-3 rounded text-red-100 text-sm italic mb-4">
                            {card.footer}
                        </div>
                    )}

                    {isLast && (
                        <div className="bg-black/60 border border-red-900/40 rounded-lg px-4 py-3 mt-4 text-center">
                            <p className="text-red-500 text-xs font-bold uppercase tracking-wider mb-1">Pensamento do dia</p>
                            <p className="text-white text-sm italic">{quote}</p>
                        </div>
                    )}
                </div>

                <div className="px-5 sm:px-8 py-4 border-t border-red-900/30 bg-black/60 sticky bottom-0">
                    {!isLast ? (
                        <div className="flex items-center justify-between gap-3">
                            <button
                                onClick={() => setIndex(i => Math.max(0, i - 1))}
                                disabled={index === 0}
                                className="px-4 py-2.5 rounded-lg bg-zinc-900 text-zinc-300 font-bold text-sm flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-800 border border-zinc-800"
                                data-testid="button-prev"
                            >
                                <ChevronLeft size={16} /> Anterior
                            </button>
                            <div className="flex gap-1.5">
                                {sessionCards.map((_, i) => (
                                    <div key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-red-500' : 'w-1.5 bg-zinc-700'}`} />
                                ))}
                            </div>
                            <button
                                onClick={() => setIndex(i => Math.min(sessionCards.length - 1, i + 1))}
                                className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-700 via-red-600 to-red-700 hover:from-red-600 hover:via-red-500 hover:to-red-600 text-white font-black text-sm flex items-center gap-1 shadow-lg shadow-red-900/40 uppercase tracking-wider"
                                data-testid="button-next"
                            >
                                Próximo <ChevronRight size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <label className="flex items-start gap-3 cursor-pointer group" data-testid="label-acknowledge">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => setChecked(e.target.checked)}
                                    className="mt-1 w-5 h-5 rounded accent-red-600 cursor-pointer"
                                    data-testid="checkbox-acknowledge"
                                />
                                <span className="text-white text-sm sm:text-base font-bold leading-snug group-hover:text-red-100">
                                    Li, e vou tentar melhorar 1% todos os dias.
                                </span>
                            </label>
                            <button
                                onClick={handleConfirm}
                                disabled={!checked}
                                className={`w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all ${checked ? 'bg-gradient-to-r from-red-700 via-red-600 to-red-700 hover:from-red-600 hover:via-red-500 hover:to-red-600 text-white shadow-lg shadow-red-900/40 active:scale-[0.98]' : 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'}`}
                                data-testid="button-confirm"
                            >
                                <CheckCircle2 size={18} />
                                {checked ? 'Vamos lá. Bora trabalhar.' : 'Marque a frase acima para continuar'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
