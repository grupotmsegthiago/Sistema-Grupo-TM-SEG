import { useEffect, useMemo, useState } from 'react';
import { Sparkles, CheckCircle2 } from 'lucide-react';

interface MotivationGateProps {
    userId: string;
    userName?: string;
    onAcknowledge: () => void;
}

interface MotivationCard {
    title: string;
    subtitle: string;
    bullets: string[];
    footer?: string;
}

const ALL_CARDS: MotivationCard[] = [
    {
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
        title: 'COMO TER 8 HORAS DE TRABALHO TERMINADAS EM 4',
        subtitle: 'Foco profundo, prazos curtos, ritmo consistente.',
        bullets: [
            'Bloqueie seu dia: foque em UMA tarefa por bloco, agrupe atividades similares.',
            'Defina prazos artificiais: prazos menores forçam foco e cortam procrastinação.',
            'Encontre seu estilo: planejador, priorizador, organizador ou visualizador.',
            'Lei de Parkinson: o trabalho se expande para preencher o tempo disponível — encurte o tempo.',
        ],
        footer: 'Nada disso importa se você estiver constantemente distraído. Desligue notificações.',
    },
    {
        title: 'COMO ORGANIZAR SUAS IDEIAS — MÉTODO P.A.R.A.',
        subtitle: 'Construa seu segundo cérebro.',
        bullets: [
            'Projetos: conjuntos de tarefas com objetivo e prazo definidos.',
            'Áreas: aspectos da vida que precisam de manutenção contínua (saúde, finanças).',
            'Recursos: coleções de informações temáticas do seu interesse.',
            'Arquivos: tudo que já cumpriu sua função, mas vale guardar.',
        ],
        footer: 'Capture, organize, destile e expresse. Reveja toda semana.',
    },
    {
        title: 'AS 8 REGRAS DE STEVE JOBS PARA EXCELÊNCIA EM VENDAS',
        subtitle: 'Venda experiência, não recurso.',
        bullets: [
            'Crie proposta de valor única — diferencie e comunique com paixão.',
            'Foque em benefícios, não em recursos: traduza especificações em vantagens reais.',
            'Mantenha a mensagem simples — destile ideias complexas em mensagens claras.',
            'Conte uma história envolvente e conheça profundamente seu público.',
            'Persistência diante da rejeição: use a rejeição como aprendizado.',
        ],
        footer: 'Metade do que separa empreendedores bem-sucedidos é pura perseverança.',
    },
    {
        title: 'COMO ENTRAR NO ESTADO DE FLOW',
        subtitle: 'A zona onde corpo e mente trabalham sem esforço.',
        bullets: [
            'PLENITUDE: alcance objetivos sem esforço, com profundo senso de propósito.',
            'FELICIDADE: imersão no presente, alegria e atemporalidade.',
            'CLAREZA: metas e objetivos claros, consciência aguçada do que importa.',
            'PERSISTÊNCIA: foco e determinação contínuos, energizado para superar obstáculos.',
        ],
        footer: 'Flow nasce em: algo que você se importa + é bom + é desafiador + é de longo prazo.',
    },
    {
        title: 'A REGRA DOS 2 MINUTOS',
        subtitle: 'Pequenas ações compostas constroem grandes resultados.',
        bullets: [
            'Se uma tarefa leva menos de 2 minutos, faça AGORA — não anote, não adie.',
            'Transforme hábitos em versões de 2 minutos: "ler 1 página" em vez de "ler 1 hora".',
            'A entrada é o que importa: aparecer todo dia, mesmo em pouco tempo, vence motivação.',
            'O composto de 1% por dia gera 37x em um ano. Constância > intensidade.',
        ],
        footer: 'Você não sobe ao nível dos seus objetivos. Você cai ao nível dos seus sistemas. — James Clear',
    },
    {
        title: 'A MATRIZ DE EISENHOWER',
        subtitle: 'Separe o urgente do importante.',
        bullets: [
            'Urgente + Importante: faça agora, sem desculpa.',
            'Importante + Não Urgente: agende e proteja esse tempo — é onde o crescimento mora.',
            'Urgente + Não Importante: delegue ou automatize.',
            'Não Urgente + Não Importante: elimine. Sem culpa.',
        ],
        footer: 'O que é importante raramente é urgente — e o que é urgente raramente é importante. — Eisenhower',
    },
    {
        title: 'AS 5 LEIS DA PRODUTIVIDADE',
        subtitle: 'Trabalhe com inteligência, não com força bruta.',
        bullets: [
            'Lei de Pareto: 20% do esforço gera 80% do resultado — identifique e dobre nisso.',
            'Lei de Parkinson: encurte prazos para forçar foco.',
            'Lei de Hofstadter: sempre leva mais tempo do que você pensa — adicione margem.',
            'Lei do Esforço Mínimo: remova fricção do que é bom, adicione fricção ao que é ruim.',
            'Lei do Foco: uma tarefa por vez. Multitarefa é mentira do cérebro.',
        ],
        footer: 'A diferença entre comum e extraordinário é aquela pequena coisa extra. — Jimmy Johnson',
    },
    {
        title: 'COMO DECIDIR RÁPIDO E BEM',
        subtitle: 'Decisões reversíveis × decisões irreversíveis.',
        bullets: [
            'Porta-de-2-vias (reversível): decida em minutos, ajuste depois.',
            'Porta-de-1-via (irreversível): pense devagar, consulte, escreva os prós/contras.',
            'Se 70% das informações estão na mesa, decida. Esperar 100% é tarde demais.',
            'O custo da indecisão quase sempre é maior que o custo de uma decisão errada.',
        ],
        footer: 'Velocidade importa nos negócios. — Jeff Bezos',
    },
    {
        title: 'O QUE FAZER QUANDO TUDO PARECE TRAVADO',
        subtitle: 'Quebre o ciclo com micro-ações.',
        bullets: [
            'Escreva tudo numa folha: cérebro não foi feito pra guardar, foi feito pra pensar.',
            'Identifique a próxima ação física e concreta — não "resolver o problema", mas "ligar pro X".',
            'Mude o estado: levante, beba água, ande 5 minutos. Corpo movimenta a mente.',
            'Faça a tarefa mais feia primeiro. O resto do dia fica leve.',
        ],
        footer: 'Coma o sapo na primeira hora da manhã. — Mark Twain',
    },
    {
        title: 'COMO LIDERAR PESSOAS DE VERDADE',
        subtitle: 'Liderança é serviço, não cargo.',
        bullets: [
            'Defina expectativas com clareza absoluta: o time não lê pensamento.',
            'Dê feedback no calor — elogie em público, corrija em privado, sempre rápido.',
            'Proteja seu time de distrações, política e interrupções desnecessárias.',
            'Faça as perguntas certas em vez de dar todas as respostas.',
        ],
        footer: 'Líder não é quem tem mais seguidores. É quem forma mais líderes. — Tom Peters',
    },
    {
        title: 'O HÁBITO DE FECHAR LOOPS',
        subtitle: 'Cada coisa em aberto consome energia mental.',
        bullets: [
            'Termine o que começou — ou abandone formalmente. Meio-aberto é o pior estado.',
            'Responda mensagens em lote, não interrompendo o foco.',
            'No fim do dia, faça uma varredura: o que ficou aberto? Anote e durma em paz.',
            'O cérebro confia em sistemas externos — escreva, agende, esqueça.',
        ],
        footer: 'Sua cabeça foi feita para ter ideias, não para guardá-las. — David Allen',
    },
    {
        title: 'COMO CONSTRUIR DISCIPLINA QUANDO A MOTIVAÇÃO ACABA',
        subtitle: 'Motivação é emoção. Disciplina é estrutura.',
        bullets: [
            'Não negocie com você mesmo na hora — decida antes, execute depois.',
            'Ambiente vence força de vontade: remova tentações, crie atalhos para o bom.',
            'Compromisso público: avise alguém. Vergonha de falhar > vontade de desistir.',
            'Comemore micro-vitórias. Cérebro repete o que recompensa.',
        ],
        footer: 'Disciplina é a ponte entre metas e realizações. — Jim Rohn',
    },
    {
        title: 'A REGRA 80/20 APLICADA AO DIA',
        subtitle: 'Não trabalhe mais. Trabalhe certo.',
        bullets: [
            'Liste suas 10 atividades de hoje. Marque as 2 que geram 80% do resultado.',
            'Faça essas 2 antes do almoço. O resto, faça ou delegue depois.',
            'Pergunte: "se eu pudesse fazer só uma coisa hoje, qual seria?" Essa é a sua prioridade.',
            'Cuidado com o falso trabalho: e-mail e reunião costumam ser fuga, não execução.',
        ],
        footer: 'Atividade não é produtividade. Movimento não é progresso.',
    },
    {
        title: 'COMO TER CONVERSAS DIFÍCEIS',
        subtitle: 'O que você não fala hoje vira problema amanhã.',
        bullets: [
            'Comece pelos fatos, não pelas conclusões: "vi X acontecer" antes de "você é Y".',
            'Diga o impacto: como aquilo afetou o trabalho, o time, o cliente.',
            'Pergunte e ouça. A outra pessoa quase sempre tem contexto que você desconhece.',
            'Termine com um acordo: o que muda a partir de agora, quem faz o quê.',
        ],
        footer: 'A qualidade da sua vida é a qualidade das suas conversas. — Tony Robbins',
    },
    {
        title: 'COMO PARAR DE PROCRASTINAR DE VERDADE',
        subtitle: 'Procrastinação não é preguiça, é desconforto emocional.',
        bullets: [
            'Identifique a emoção por trás: medo, tédio, perfeccionismo? Cada uma tem antídoto.',
            'Reduza a tarefa ao mínimo: "abrir o arquivo" é mais fácil que "terminar o relatório".',
            'Use um timer de 25 minutos. Comece sabendo que pode parar quando tocar.',
            'Aceite que a primeira versão será ruim — e mesmo assim será melhor que zero.',
        ],
        footer: 'Comece. O resto se ajeita no caminho.',
    },
    {
        title: 'A REGRA DOS 10.000 PASSOS',
        subtitle: 'Mente e corpo são um só sistema.',
        bullets: [
            'Caminhada diária destrava criatividade — as melhores ideias vêm em movimento.',
            'Sono é a vantagem competitiva mais subestimada. Dormir mal anula 1 dia inteiro.',
            'Hidratação antes de cafeína. Água acorda o cérebro mais rápido que café.',
            'Pausa de 5 minutos a cada 90 minutos: sustenta o foco o dia todo.',
        ],
        footer: 'Cuide do corpo. É o único lugar onde você tem que morar. — Jim Rohn',
    },
    {
        title: 'COMO ESCREVER PARA SER LIDO',
        subtitle: 'Comunicação clara é vantagem competitiva.',
        bullets: [
            'Escreva como você fala. Frases curtas. Palavras simples.',
            'Coloque a conclusão no começo — leitor não tem paciência para suspense.',
            'Corte 30% do texto na revisão. Sempre dá. Sempre melhora.',
            'Use exemplos concretos. Abstrato não convence, concreto convence.',
        ],
        footer: 'Se você não consegue explicar de forma simples, não entendeu bem. — Einstein',
    },
    {
        title: 'O PODER DE DIZER NÃO',
        subtitle: 'Toda sim é um não para outra coisa.',
        bullets: [
            'Antes de aceitar, pergunte: o que vou ter que largar para fazer isso?',
            'Compromissos vagos são piores que não-compromissos. Seja específico.',
            '"Não, mas..." é mais útil que "talvez" ou "vamos ver".',
            'Proteja sua agenda como protege sua conta bancária.',
        ],
        footer: 'O foco é dizer NÃO a 1.000 coisas boas. — Steve Jobs',
    },
    {
        title: 'COMO APRENDER QUALQUER COISA RÁPIDO',
        subtitle: 'A regra dos primeiros 20 horas.',
        bullets: [
            'Decomponha a habilidade nos seus 3-5 componentes essenciais.',
            'Pratique deliberadamente: foque no que você ERRA, não no que já sabe.',
            'Busque feedback imediato — sem retorno, prática vira repetição cega.',
            'Ensine o que aprende. Explicar para outro força entendimento real.',
        ],
        footer: 'Você não aprende fazendo. Aprende refletindo sobre o que fez. — John Dewey',
    },
    {
        title: 'A REUNIÃO QUE VALE A PENA',
        subtitle: 'Reunião sem decisão é roubo de tempo coletivo.',
        bullets: [
            'Toda reunião precisa de uma pergunta a ser respondida — sem isso, é e-mail.',
            'Convide só quem decide ou executa. Plateia não é necessária.',
            'Comece 5 minutos atrasado, termine 5 minutos antes. Tempo de fôlego.',
            'Saia com 3 coisas: o que foi decidido, quem faz, até quando.',
        ],
        footer: 'Reunião deve ser o último recurso, não o primeiro.',
    },
    {
        title: 'COMO NEGOCIAR SEM DAR DESCONTO',
        subtitle: 'Valor não se justifica, se demonstra.',
        bullets: [
            'Pergunte antes de propor: o que ele realmente quer resolver?',
            'Ancore com um número alto primeiro. O resto da conversa orbita ali.',
            'Silêncio é técnica. Quem fala depois de ouvir o preço, cede.',
            'Saiba sua melhor alternativa. Quem não tem plano B, aceita qualquer coisa.',
        ],
        footer: 'Você não recebe o que merece. Recebe o que negocia. — Chester Karrass',
    },
    {
        title: 'O JOGO DE LONGO PRAZO',
        subtitle: 'Atalhos são caminhos longos disfarçados.',
        bullets: [
            'Reputação leva 20 anos para construir e 5 minutos para destruir.',
            'Escolha sócios, clientes e colegas como escolhe vizinhos: convivência é tudo.',
            'O dinheiro fácil costuma vir com custo escondido. Devagar e limpo dura mais.',
            'O que você faz quando ninguém está olhando define quem você é.',
        ],
        footer: 'Pessoas comuns pensam em como matar o tempo. Pessoas grandes pensam em como usá-lo. — Schopenhauer',
    },
    {
        title: 'A DISCIPLINA DAS PEQUENAS COISAS',
        subtitle: 'O profissional faz quando não está com vontade.',
        bullets: [
            'Cama arrumada. Mesa limpa. E-mail respondido. Pequenas vitórias dão tração.',
            'A forma como você faz uma coisa é a forma como faz tudo.',
            'Disciplina visível inspira time. Disciplina invisível constrói caráter.',
            'Excelência é hábito, não evento. — Aristóteles',
        ],
        footer: 'O que é fácil de fazer também é fácil de não fazer. — Jim Rohn',
    },
    {
        title: 'COMO CONSTRUIR CONFIANÇA EM 30 DIAS',
        subtitle: 'Confiança é depósito; cada falha é saque.',
        bullets: [
            'Cumpra o combinado, sempre. Pequenos compromissos > grandes promessas.',
            'Avise antes do prazo se algo vai atrasar. Surpresa ruim destrói credibilidade.',
            'Assuma o erro inteiro. Desculpa parcial é pior que ausência de desculpa.',
            'Faça mais do que prometeu. Sempre que possível. Sem alarde.',
        ],
        footer: 'Confiança chega devagar e vai embora num átimo. — Warren Buffett',
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
    '"Pessoas comuns pensam em como matar o tempo. Pessoas grandes em como usá-lo." — Schopenhauer',
    '"1% melhor todos os dias = 37x melhor em um ano." — James Clear',
    '"Comece. O resto se ajeita no caminho."',
    '"A qualidade da sua vida é a qualidade das suas conversas." — Tony Robbins',
    '"Atividade não é produtividade. Movimento não é progresso."',
    '"Reputação leva 20 anos pra construir e 5 minutos pra destruir." — Warren Buffett',
    '"Você não recebe o que merece. Recebe o que negocia." — Chester Karrass',
    '"Cuide do corpo. É o único lugar onde você tem que morar." — Jim Rohn',
    '"O custo da indecisão quase sempre é maior que o custo da decisão errada."',
    '"Excelência é hábito, não evento." — Aristóteles',
    '"Coma o sapo na primeira hora da manhã." — Mark Twain',
    '"Velocidade importa nos negócios." — Jeff Bezos',
    '"Líder não é quem tem mais seguidores. É quem forma mais líderes." — Tom Peters',
    '"Se você não consegue explicar de forma simples, não entendeu bem." — Einstein',
    '"Sua cabeça foi feita para ter ideias, não para guardá-las." — David Allen',
    '"O comprometimento transforma uma promessa em realidade."',
    '"Constância vence intensidade."',
    '"O profissional é quem aparece quando não está com vontade."',
];

const HISTORY_KEY = 'motivation-history-v2';
const ACK_KEY = 'motivation-ack';
const COOLDOWN_DAYS = 30;

function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysSince(dateStr: string): number {
    try {
        const then = new Date(dateStr + 'T00:00:00').getTime();
        const now = new Date(todayKey() + 'T00:00:00').getTime();
        return Math.floor((now - then) / (1000 * 60 * 60 * 24));
    } catch { return 9999; }
}

export function shouldShowMotivation(userId: string): boolean {
    try {
        const raw = localStorage.getItem(ACK_KEY);
        if (!raw) return true;
        const data = JSON.parse(raw);
        return !(data[userId] && data[userId] === todayKey());
    } catch {
        return true;
    }
}

function markAcknowledged(userId: string) {
    try {
        const raw = localStorage.getItem(ACK_KEY);
        const data = raw ? JSON.parse(raw) : {};
        data[userId] = todayKey();
        localStorage.setItem(ACK_KEY, JSON.stringify(data));
    } catch (e) { console.error(e); }
}

type HistoryEntry = { cardIdx: number; quoteIdx: number; date: string };
type HistoryMap = Record<string, HistoryEntry[]>;

function loadHistory(): HistoryMap {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveHistory(map: HistoryMap) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(map)); } catch (e) { console.error(e); }
}

function pickIndex(total: number, recent: number[]): number {
    const available = Array.from({ length: total }, (_, i) => i).filter(i => !recent.includes(i));
    if (available.length === 0) {
        return Math.floor(Math.random() * total);
    }
    return available[Math.floor(Math.random() * available.length)];
}

function pickForUser(userId: string): { cardIdx: number; quoteIdx: number } {
    const history = loadHistory();
    const userHist = (history[userId] || []).filter(h => daysSince(h.date) <= COOLDOWN_DAYS);
    const recentCards = userHist.map(h => h.cardIdx);
    const recentQuotes = userHist.map(h => h.quoteIdx);
    const cardIdx = pickIndex(ALL_CARDS.length, recentCards);
    const quoteIdx = pickIndex(QUOTES.length, recentQuotes);
    return { cardIdx, quoteIdx };
}

function recordShown(userId: string, cardIdx: number, quoteIdx: number) {
    const history = loadHistory();
    const userHist = (history[userId] || []).filter(h => daysSince(h.date) <= COOLDOWN_DAYS);
    userHist.push({ cardIdx, quoteIdx, date: todayKey() });
    history[userId] = userHist;
    saveHistory(history);
}

export default function MotivationGate({ userId, userName, onAcknowledge }: MotivationGateProps) {
    const [checked, setChecked] = useState(false);

    const { card, quote } = useMemo(() => {
        const { cardIdx, quoteIdx } = pickForUser(userId);
        recordShown(userId, cardIdx, quoteIdx);
        return { card: ALL_CARDS[cardIdx], quote: QUOTES[quoteIdx] };
    }, [userId]);

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
            <div className="bg-gradient-to-br from-black via-zinc-950 to-black rounded-2xl max-w-2xl w-full max-h-[95vh] overflow-y-auto shadow-2xl border border-red-900/40">
                <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-red-900/30 flex items-center gap-3 bg-gradient-to-r from-red-950/40 to-transparent">
                    <div className="w-10 h-10 rounded-full bg-red-900/30 border border-red-700/50 flex items-center justify-center shrink-0">
                        <Sparkles className="text-red-500" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-white font-black text-base sm:text-lg leading-tight">Bom dia, <span className="text-red-500">{firstName}</span>.</h2>
                        <p className="text-zinc-400 text-xs sm:text-sm">Antes de começar, 1 minuto para subir o nível.</p>
                    </div>
                </div>

                <div className="px-5 sm:px-8 pt-5 pb-3">
                    <h3 className="text-white font-black text-xl sm:text-2xl mb-2 leading-tight" data-testid="text-title">{card.title}</h3>
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

                    <div className="bg-black/60 border border-red-900/40 rounded-lg px-4 py-3 mt-4 text-center">
                        <p className="text-red-500 text-xs font-bold uppercase tracking-wider mb-1">Pensamento do dia</p>
                        <p className="text-white text-sm italic">{quote}</p>
                    </div>
                </div>

                <div className="px-5 sm:px-8 py-4 border-t border-red-900/30 bg-black/60 sticky bottom-0">
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
                </div>
            </div>
        </div>
    );
}
