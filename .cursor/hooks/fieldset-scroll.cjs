const { aberturaFieldsetComRolagem } = require('../../scripts/fieldsetScrollGuard.cjs');

function respond(payload) {
  process.stdout.write(JSON.stringify(payload));
}

function allow() {
  respond({ permission: 'allow' });
  process.exit(0);
}

function textoDaEdicao(input) {
  const tool = input.tool_input || input.arguments || input.input || {};
  const caminho = String(tool.path || tool.file_path || input.path || '');
  const pedacos = [tool.contents, tool.new_string, tool.content].filter((parte) => typeof parte === 'string');
  return { caminho, texto: pedacos.join('\n') };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let input = {};
  try {
    const raw = await readStdin();
    input = raw ? JSON.parse(raw) : {};
  } catch {
    allow();
  }

  const { caminho, texto } = textoDaEdicao(input);
  if (!/\.(tsx|jsx)$/i.test(caminho)) allow();
  const tags = aberturaFieldsetComRolagem(texto);
  if (tags.length === 0) allow();

  respond({
    permission: 'deny',
    user_message: 'A rolagem ficou num fieldset. O navegador não desce essa área. A alteração foi interrompida.',
    agent_message:
      'Mantenha overflow-y-auto no div, main ou section. O <fieldset disabled> envolve só os campos, sem overflow, height, min-height nem display flex/grid no container de rolagem.',
  });
  process.exit(0);
}

main().catch(() => allow());
