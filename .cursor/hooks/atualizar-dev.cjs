const { execFileSync } = require('child_process');

function respond(payload) {
  process.stdout.write(JSON.stringify(payload));
}

function allow() {
  respond({ permission: 'allow' });
  process.exit(0);
}

function deny(userMessage, agentMessage) {
  respond({
    permission: 'deny',
    user_message: userMessage,
    agent_message: agentMessage,
  });
  process.exit(0);
}

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function countsAgainstOriginDev() {
  const raw = git(['rev-list', '--left-right', '--count', 'HEAD...origin/dev']);
  const parts = raw.split(/\s+/).map(Number);
  return { ahead: parts[0] || 0, behind: parts[1] || 0 };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  await readStdin();

  let branch = '';
  try {
    branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    allow();
  }

  if (branch !== 'dev') allow();

  let mergeHead = '';
  try {
    mergeHead = git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
  } catch {
    mergeHead = '';
  }
  if (mergeHead) {
    deny(
      'A dev está no meio de um merge. A alteração foi interrompida.',
      'Existe MERGE_HEAD. Não edite, não use reset --hard e não publique. Pare e avise o usuário.'
    );
  }

  try {
    git(['fetch', 'origin', '+refs/heads/dev:refs/remotes/origin/dev']);
  } catch {
    deny(
      'Não consegui atualizar a dev com o GitHub. A alteração foi interrompida para não editar uma cópia velha.',
      'git fetch da origin/dev falhou. Não edite arquivos, não use reset --hard e não publique. Pare e avise o usuário.'
    );
  }

  const head = git(['rev-parse', 'HEAD']);
  const remote = git(['rev-parse', 'origin/dev']);
  if (head === remote) allow();

  const { ahead, behind } = countsAgainstOriginDev();

  if (ahead === 0 && behind > 0) {
    try {
      git(['merge', '--ff-only', 'origin/dev']);
    } catch {
      deny(
        'A dev publicada andou e esta cópia não pôde avançar sem risco. A alteração foi interrompida.',
        'merge --ff-only origin/dev falhou. Não use reset --hard, não apague commit e não publique. Pare e avise o usuário.'
      );
    }
    deny(
      'Atualizei a dev com o commit que já está publicado. A edição parou para ser refeita em cima dessa versão.',
      'A dev avançou com merge --ff-only até origin/dev. Descarte o patch da versão antiga, releia os arquivos e aplique a alteração de novo.'
    );
  }

  if (ahead > 0 && behind === 0) allow();

  deny(
    'A dev desta máquina divergiu da dev publicada. A alteração foi interrompida para não perder o que já está no ar.',
    'HEAD e origin/dev divergiram. Não edite, não use reset --hard, não apague commit e não publique. Pare e explique a divergência ao usuário.'
  );
}

main().catch((error) => {
  respond({
    permission: 'deny',
    user_message: 'A checagem da dev falhou. A alteração foi interrompida.',
    agent_message:
      'O hook atualizar-dev falhou: ' +
      (error && error.message ? error.message : String(error)) +
      '. Não edite arquivos.',
  });
  process.exit(0);
});