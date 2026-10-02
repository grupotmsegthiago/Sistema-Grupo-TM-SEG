import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/pc/AppData/Local/Temp/aula-tmseg/package.json');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const ffmpegPath = require('ffmpeg-static');

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saidaDir = path.join(raiz, 'public', 'treinamento');
const shots = 'C:/Users/pc/AppData/Local/Temp/cursor/screenshots';
const mascote = 'C:/Users/pc/.cursor/projects/c-Users-pc-Sistema-Grupo-TM-SEG/assets/apresentador-tmseg.jpg';
const tmp = path.join(os.tmpdir(), 'aula-reais-v4');
const soPreview = process.argv.includes('--preview');

fs.mkdirSync(saidaDir, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });

type Corte = 'cheio' | 'formulario' | 'painel' | 'esquerda' | 'direita' | 'topo' | 'login';
type Quadro = { arquivo: string; fala: string; corte: Corte };

const aulas: Array<{ id: string; quadros: Quadro[] }> = [
  {
    id: 'entrar',
    quadros: [
      {
        arquivo: 'tela-login.png',
        corte: 'cheio',
        fala: 'O primeiro passo é a tela Acesso ao Sistema. Ela pede Identificação Corporativa e Senha de Acesso. Use o e-mail da empresa, não um apelido.',
      },
      {
        arquivo: 'tela-login.png',
        corte: 'login',
        fala: 'Digite o e-mail no campo Identificação Corporativa. No campo de baixo, digite a senha que o administrador passou. O olho, à direita, mostra ou esconde o que você digitou. Confira antes de seguir.',
      },
      {
        arquivo: 'tela-login.png',
        corte: 'login',
        fala: 'O botão vermelho Acessar Sistema é o último clique da entrada. Se a senha não passar, não fique tentando. Chame quem administra os usuários.',
      },
      {
        arquivo: 'cd-01-inicio.png',
        corte: 'topo',
        fala: 'Entrou. O sistema abre na operação do dia. Daqui o Operador segue para o menu, o Painel de OS e o Controle Diário.',
      },
    ],
  },
  {
    id: 'menu',
    quadros: [
      {
        arquivo: 'menu-monitoramento.png',
        corte: 'topo',
        fala: 'O menu da esquerda abre por cima da tela. No Operador ele é curto. Dentro de Monitoramento ficam Painel de OS e Controle Diário. É ali que a missão nasce e o dia é acompanhado.',
      },
      {
        arquivo: 'menu-mapa.png',
        corte: 'topo',
        fala: 'Mais abaixo, em Fornecedor, o Operador abre o Mapa de Acionamento. Cadastro de viatura, de agente e de alvará não são deste perfil. Cliente, tabela de preço, financeiro e configurações também não. Se faltar cadastro para abrir a OS, chame o Avançado.',
      },
    ],
  },
  {
    id: 'painel-os',
    quadros: [
      {
        arquivo: 'painel-status.png',
        corte: 'painel',
        fala: 'O Painel de OS é a lista das missões. Cada cartão é um status. Clicar no cartão filtra a lista. Pendente ainda falta informação. Solicitada é o pedido registrado. Documentação é a fase de documento. Agendada já tem horário e ainda não está na origem. Origem é a chegada no ponto de coleta. Em Viagem é a escolta na estrada. Concluída encerrou. Cancelada foi desmarcada. Recusada não foi aceita.',
      },
      {
        arquivo: 'painel-viagem.png',
        corte: 'topo',
        fala: 'Abrindo a faixa Em Viagem, cada cartão é uma escolta que está na rua. Dá para ver a OS, o cliente, a placa da carga, a rota e a última atualização. As outras faixas separam prioridade, solicitadas e as demais.',
      },
      {
        arquivo: 'os-01-tipo.png',
        corte: 'formulario',
        fala: 'O botão laranja Nova Missão abre esta tela, Nova Ordem de Serviço. Operador e Avançado usam o mesmo botão. Sem esse clique, a ordem não começa.',
      },
    ],
  },
  {
    id: 'abrir-os',
    quadros: [
      {
        arquivo: 'os-01-tipo.png',
        corte: 'formulario',
        fala: 'Abrir a OS anda em etapas, e a de baixo só abre depois da de cima. Esta é a etapa 1, Tipo de Operação. Caracterizada é a escolta com a viatura identificada. Velada é a escolta discreta. A lista de fornecedores muda conforme essa escolha.',
      },
      {
        arquivo: 'os-02-cliente.png',
        corte: 'formulario',
        fala: 'Caracterizada ficou marcada em verde. A etapa 2 pede o cliente que já está cadastrado. Escolha na lista. Cliente novo não se cria nesta tela. Quem cadastra é o Avançado. Quando o cliente exige, preencha também o número da S.E., a Solicitação de Escolta.',
      },
      {
        arquivo: 'os-03-veiculo.png',
        corte: 'formulario',
        fala: 'Etapa 3, veículo do cliente. Digite a placa e clique na linha da lista. Esta placa é o caminhão da carga. Não é a viatura da escolta. A viatura fica no cadastro do fornecedor.',
      },
      {
        arquivo: 'os-04-motorista.png',
        corte: 'formulario',
        fala: 'Com a placa escolhida, o sistema pergunta se você já tem o nome e o telefone do motorista. Se tiver, clique em Sim, preencher. Se ainda não tiver, clique em Não, pular. O motorista pode ser informado depois. Se a missão levar dois caminhões, use Adicionar 2º veículo.',
      },
      {
        arquivo: 'os-05-fornecedor.png',
        corte: 'formulario',
        fala: 'Etapa 4, o fornecedor, que é o parceiro da escolta. Se já souber quem vai, filtre e selecione. Se ainda não souber, use o botão amarelo Aguardando informação, pular etapa. Dá para completar o parceiro depois, sem travar a abertura.',
      },
      {
        arquivo: 'os-06-rota.png',
        corte: 'formulario',
        fala: 'Etapa 5, a rota. Origem é o ponto A e destino é o ponto B. Os dois são obrigatórios. Se a rota já existe, busque em rota cadastrada e clique nela. A tela mostra a distância e o tempo estimado. É essa rota que o Controle Diário vai mostrar.',
      },
      {
        arquivo: 'os-07-agenda.png',
        corte: 'formulario',
        fala: 'Etapa 6, o agendamento. Imediata significa saída agora. Agendada pede a data e a hora. Embaixo, o resumo mostra o tipo, a distância e a rota para você conferir antes de gravar.',
      },
      {
        arquivo: 'os-08-data.png',
        corte: 'formulario',
        fala: 'Na opção agendada, preencha a data e o horário. A etapa fica verde quando a data está correta. Olhe o resumo outra vez: tipo, quilometragem e rota. Se algo estiver errado, volte na etapa e ajuste antes de gravar.',
      },
      {
        arquivo: 'os-09-gerar.png',
        corte: 'formulario',
        fala: 'O último passo é o botão laranja Gerar Ordem de Serviço. É esse clique que grava a OS no painel. Se o cliente mandou o print do pedido, cole na evidência antes. O botão Cancelar descarta. Nesta aula a gente para neste botão, com ele pronto, para não abrir uma ordem de verdade no sistema.',
      },
    ],
  },
  {
    id: 'controle-diario',
    quadros: [
      {
        arquivo: 'cd-01-inicio.png',
        corte: 'topo',
        fala: 'O Controle Diário é a folha do dia. Cada linha é uma OS. No começo da folha estão o número, o status, a data inicial, a hora agendada, a hora de origem e o cliente. Hora agendada é o combinado. Hora de origem é quando a equipe chegou de fato.',
      },
      {
        arquivo: 'cd-02-meio.png',
        corte: 'topo',
        fala: 'Rolando a folha, aparecem a rota e o fornecedor. A rota é o caminho de origem e destino. O fornecedor é quem faz a escolta. Em seguida, viatura é o carro da escolta e veículo escoltado é o caminhão do cliente. Não troque os dois.',
      },
      {
        arquivo: 'cd-03-fim.png',
        corte: 'topo',
        fala: 'No fim da linha estão data final, hora final, KM inicial, KM final e o total. Equipe é quem foi. Observação é o recado do dia. A folha acompanha o banco: placa, rota, equipe, KM e status.',
      },
    ],
  },
  {
    id: 'rede-mapa',
    quadros: [
      {
        arquivo: 'rede-01-mapa.png',
        corte: 'topo',
        fala: 'A Rede de Apoio, o QRF, abre o mapa do Brasil. Use quando a missão precisar de um ponto de suporte. A busca por cidade fica à esquerda. Esta tela consulta. Não cadastra fornecedor.',
      },
      {
        arquivo: 'tela-mapa-acionamento.png',
        corte: 'topo',
        fala: 'O Mapa de Acionamento fica em Fornecedor. O mapa mostra os estados. Passe o mouse ou clique no estado para ver a ordem de quem pode ser chamado.',
      },
      {
        arquivo: 'mapa-sp.png',
        corte: 'topo',
        fala: 'Com o estado aberto, a lista à direita mostra os fornecedores e a prioridade. Prioridade zero é o primeiro a acionar. O Operador consulta. Quem cadastra o parceiro é o Avançado.',
      },
    ],
  },
  {
    id: 'cliente',
    quadros: [
      {
        arquivo: 'tela-clientes.png',
        corte: 'topo',
        fala: 'Esta aula é da trilha Avançado. O Operador não abre esta tela. O caminho é Cliente, Cadastro de Cliente. A lista mostra quem já existe. O botão Novo Cliente começa o cadastro.',
      },
      {
        arquivo: 'cli-01-novo.png',
        corte: 'topo',
        fala: 'No formulário, a aba Dados Cadastrais pede CPF ou CNPJ. A lupa consulta a Receita. Preencha a razão social, o nome fantasia e o contato. Marque Cliente efetivo ou Prospecção, lead.',
      },
      {
        arquivo: 'cli-02-salvar.png',
        corte: 'formulario',
        fala: 'Desça até localização e contato: e-mail operacional, telefone e endereço. O botão vermelho Finalizar e Salvar Cliente grava o cadastro. Nesta aula a gente para neste botão, para não criar um cliente de verdade.',
      },
    ],
  },
  {
    id: 'veiculo-carga',
    quadros: [
      {
        arquivo: 'tela-veiculos-carga.png',
        corte: 'topo',
        fala: 'O caminhão do cliente fica em Cliente, Veículos de Carga. A lista mostra placa, modelo e o cliente dono. O botão Novo Veículo abre o cadastro. A placa daqui é a que aparece na etapa 3 da OS.',
      },
      {
        arquivo: 'vei-01-novo.png',
        corte: 'formulario',
        fala: 'No formulário, escolha o cliente proprietário e a placa. Preencha marca, modelo, ano, cor e o estado. O botão Salvar Veículo grava. Sem essa placa, a etapa da carga na OS fica vazia. Nesta aula a gente não salva.',
      },
      {
        arquivo: 'rota-01-nova.png',
        corte: 'formulario',
        fala: 'Rota que se repete fica em Cadastro de Rotas, Nova Rota. Escolha o cliente, o endereço de saída e o de chegada. A tela calcula a distância. Salvar Rota guarda origem e destino para usar de novo na OS. O botão fica desligado até o nome da rota existir. Aqui também não gravamos.',
      },
    ],
  },
  {
    id: 'viatura',
    quadros: [
      {
        arquivo: 'tela-viaturas.png',
        corte: 'topo',
        fala: 'A viatura não é a carga. É o carro da escolta. O caminho é Fornecedor, Cadastro de Viaturas. A lista mostra placa, fornecedor e rastreador. O botão Cadastrar Viatura começa o processo.',
      },
      {
        arquivo: 'vtr-01-nova.png',
        corte: 'topo',
        fala: 'Na Nova Viatura, informe a placa. A ficha pede marca, modelo, ano, cor e o tipo, por exemplo escolta leve. Em seguida, o fornecedor responsável, que é o dono da viatura.',
      },
      {
        arquivo: 'vtr-02-fim.png',
        corte: 'formulario',
        fala: 'Se a viatura não for da TM SEG nem da Ativa, tecnologia e o ID do rastreador são obrigatórios. O botão Finalizar Cadastro grava. O caminhão do cliente continua em Veículos de Carga. Nesta aula a gente para antes de finalizar, para não cadastrar uma viatura de verdade.',
      },
    ],
  },
  {
    id: 'tabela-preco',
    quadros: [
      {
        arquivo: 'tela-clientes.png',
        corte: 'topo',
        fala: 'Operador e Avançado não editam preço. O caminho de quem pode é o Cadastro de Cliente. Abra o cliente e procure a aba Tabela de Preços. Ela abre para Diretoria, Administrador ou Comercial.',
      },
      {
        arquivo: 'cli-01-novo.png',
        corte: 'topo',
        fala: 'As abas ficam no topo do cliente: Dados Cadastrais, Tabela de Preços, Cancelamento, Veículos e Rotas. A aba de preço não é campo do Operador nem do Avançado.',
      },
      {
        arquivo: 'tela-tabela-preco.png',
        corte: 'topo',
        fala: 'Dentro da aba, a tabela liga região, franquia e a rota. Se a OS estiver sem preço, não recalcule por fora. O aviso sobe para quem tem acesso. O Operador segue a missão. Nesta aula nada é alterado e nada é salvo.',
      },
    ],
  },
];

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-1600)))));
  });
}

function preparo(corte: Corte) {
  if (corte === 'formulario') return 'crop=iw*0.82:ih*0.70:0:0,';
  if (corte === 'painel') return 'crop=iw:ih*0.74:0:ih*0.10,';
  if (corte === 'esquerda') return 'crop=iw*0.62:ih*0.92:0:0,';
  if (corte === 'direita') return 'crop=iw*0.62:ih*0.92:iw*0.38:0,';
  if (corte === 'topo') return 'crop=iw:ih*0.70:0:0,';
  if (corte === 'login') return 'crop=iw*0.46:ih:0:0,';
  return '';
}

function filtro(corte: Corte) {
  return [
    `[0:v]${preparo(corte)}scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1[bg]`,
    '[1:v]scale=-1:420,colorkey=0x00FF00:0.30:0.08,format=yuva420p[m]',
    '[bg][m]overlay=W-w-36:H-h-24:format=auto[out]',
  ].join(';');
}

async function quadro(origem: string, destino: string, corte: Corte) {
  await run([
    '-y', '-i', origem, '-i', mascote,
    '-filter_complex', filtro(corte),
    '-map', '[out]', '-frames:v', '1', destino,
  ]);
}

if (soPreview) {
  const amostra = aulas.find((aula) => aula.id === 'abrir-os');
  if (!amostra) process.exit(1);
  for (let i = 0; i < amostra.quadros.length; i++) {
    const item = amostra.quadros[i];
    const destino = path.join(tmp, `preview-abrir-${i}.png`);
    await quadro(path.join(shots, item.arquivo), destino, item.corte);
    process.stdout.write(`PREVIEW ${destino}\n`);
  }
  process.exit(0);
}

const tts = new MsEdgeTTS();
await tts.setMetadata('pt-BR-AntonioNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

for (const aula of aulas) {
  const segmentos: string[] = [];
  for (let i = 0; i < aula.quadros.length; i++) {
    const item = aula.quadros[i];
    const id = `${aula.id}-${String(i).padStart(2, '0')}`;
    const png = path.join(tmp, `${id}.png`);
    await quadro(path.join(shots, item.arquivo), png, item.corte);
    const vozDir = path.join(tmp, `voz-${id}`);
    fs.mkdirSync(vozDir, { recursive: true });
    const { audioFilePath } = await tts.toFile(vozDir, item.fala, { rate: 0.94 });
    const seg = path.join(tmp, `${id}.mp4`);
    await run([
      '-y', '-loop', '1', '-i', png, '-i', audioFilePath,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '25',
      '-c:a', 'aac', '-b:a', '160k', '-af', 'apad=pad_dur=0.7', '-shortest',
      '-movflags', '+faststart', seg,
    ]);
    segmentos.push(seg);
    process.stdout.write(`${aula.id} ${i + 1}/${aula.quadros.length}\n`);
  }
  const lista = path.join(tmp, `${aula.id}.txt`);
  fs.writeFileSync(lista, segmentos.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  const destino = path.join(saidaDir, `${aula.id}.mp4`);
  await run(['-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', destino]);
  process.stdout.write(`VIDEO ${destino}\n`);
}

tts.close();
