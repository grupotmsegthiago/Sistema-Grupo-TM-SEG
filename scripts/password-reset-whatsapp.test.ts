import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mensagemNovaSenhaWhatsapp, normalizarTelefoneWhatsapp } from '../lib/cevaPortal/regrasAcesso';
import { aplicarSenhaNoPortal, lerAcessoPortal } from '../lib/cevaPortal/cadastroSistema';
import { hashSenha, senhaConfere } from '../lib/cevaPortal/acesso';
import { handlePasswordResetRequest, redefinirComTextoDeCriacao } from '../lib/passwordReset';

test('telefone do WhatsApp ganha DDI e recusa grupo', () => {
  assert.equal(normalizarTelefoneWhatsapp('(11) 98888-7777'), '5511988887777');
  assert.equal(normalizarTelefoneWhatsapp('11988887777'), '5511988887777');
  assert.equal(normalizarTelefoneWhatsapp('5511988887777'), '5511988887777');
  assert.equal(normalizarTelefoneWhatsapp('123'), null);
  assert.equal(normalizarTelefoneWhatsapp('120363123456789012@g.us'), null);
  assert.equal(normalizarTelefoneWhatsapp(''), null);
});

test('mensagem de nova senha pede a troca no próximo acesso', () => {
  const texto = mensagemNovaSenhaWhatsapp({
    nome: 'Priscilla',
    email: 'priscilla@cliente.com',
    senha: 'temporaria12',
    link: 'https://sistema.grupotmseg.com.br/ceva',
  });
  assert.match(texto, /Priscilla/);
  assert.match(texto, /priscilla@cliente.com/);
  assert.match(texto, /temporaria12/);
  assert.match(texto, /\/ceva/);
  assert.match(texto, /Assim que acessar novamente, troque esta senha/);
});

test('redefinição explícita troca o hash do portal e exige a troca', async () => {
  const antiga = hashSenha('senha-antiga');
  const linha = { id: 14, email: 'pessoa@cliente.com', senha_hash: antiga, trocar_senha: false };
  const sb = {
    from(tabela: string) {
      assert.equal(tabela, 'ceva_portal_usuarios');
      const cadeia: Record<string, any> = {
        select() { return cadeia; },
        eq() { return cadeia; },
        ilike() { return cadeia; },
        maybeSingle: async () => ({ data: { id: linha.id, email: linha.email }, error: null }),
        update(dados: Record<string, unknown>) {
          Object.assign(linha, dados);
          return cadeia;
        },
        single: async () => ({ data: { id: linha.id }, error: null }),
      };
      return cadeia;
    },
  };
  const antes = await lerAcessoPortal(sb, { tabela: 'ceva_portal_usuarios', email: 'pessoa@cliente.com' });
  assert.equal(antes.ok && antes.id, 14);
  const resultado = await aplicarSenhaNoPortal(sb, {
    tabela: 'ceva_portal_usuarios',
    email: 'pessoa@cliente.com',
    senha: 'nova-senha-12',
    trocarSenha: true,
  });
  assert.equal(resultado.ok, true);
  if (resultado.ok) assert.equal(resultado.atualizado, true);
  assert.equal(linha.trocar_senha, true);
  assert.equal(senhaConfere('nova-senha-12', String(linha.senha_hash)), true);
  assert.equal(senhaConfere('senha-antiga', String(linha.senha_hash)), false);
});

test('coluna senha_alterada_em ausente não impede a nova senha', async () => {
  const linha: Record<string, unknown> = { id: 3, senha_hash: 'antiga', trocar_senha: false };
  const sb = {
    from() {
      const cadeia: Record<string, any> = {
        select() { return cadeia; },
        eq() { return cadeia; },
        ilike() { return cadeia; },
        maybeSingle: async () => ({ data: { id: 3 }, error: null }),
        update(dados: Record<string, unknown>) {
          if ('senha_alterada_em' in dados) {
            return {
              eq() {
                return { select() { return { single: async () => ({ data: null, error: { code: '42703', message: 'column senha_alterada_em does not exist' } }) }; } };
              },
            };
          }
          Object.assign(linha, dados);
          return { eq() { return { select() { return { single: async () => ({ data: { id: 3 }, error: null }) }; } }; } };
        },
      };
      return cadeia;
    },
  };
  const resultado = await aplicarSenhaNoPortal(sb, {
    tabela: 'ceva_portal_usuarios',
    email: 'pessoa@cliente.com',
    senha: 'nova-senha-12',
    trocarSenha: true,
  });
  assert.equal(resultado.ok, true);
  if (resultado.ok) assert.equal(resultado.atualizado, true);
  assert.equal(linha.trocar_senha, true);
  assert.equal(senhaConfere('nova-senha-12', String(linha.senha_hash)), true);
});

test('pedido sem usuário ou sem telefone não consulta o banco', async () => {
  const semUsuario = await handlePasswordResetRequest({});
  assert.equal(semUsuario.status, 400);
  const semTelefone = await handlePasswordResetRequest({ userId: '9', canal: 'whatsapp', telefone: '123' });
  assert.equal(semTelefone.status, 400);
  assert.match(String(semTelefone.body.error), /WhatsApp/);
});

test('a função da Vercel usa o bundle e a tela do cliente tem o botão', () => {
  const api = readFileSync('api/password-reset-request.ts', 'utf8');
  const form = readFileSync('components/UserForm.tsx', 'utf8');
  assert.match(api, /require\('\.\/_password-reset-core\.cjs'\)/);
  assert.doesNotMatch(api, /from ['"][^'"]*passwordReset/);
  assert.match(form, /button-reset-password-whatsapp/);
  assert.match(form, /canal: 'whatsapp'/);
  assert.match(form, /button-reset-password-copy/);
  assert.match(form, /canal: 'texto'/);
  assert.match(form, /textoDaMensagem\(createdCredentials\)/);
  assert.match(form, /foi criado com sucesso/);
  assert.match(form, /import React/);
});

function clienteDeTeste(
  usuario: Record<string, unknown> | null,
  cliente: Record<string, unknown> | null,
  temPortal: boolean,
) {
  const gravacoes: { tabela: string; dados: Record<string, unknown> }[] = [];
  const portal = { id: 14, senha_hash: 'antiga', trocar_senha: false };
  const sb = {
    from(tabela: string) {
      const cadeia = {
        select() { return cadeia; },
        eq() { return cadeia; },
        ilike() { return cadeia; },
        update(dados: Record<string, unknown>) {
          gravacoes.push({ tabela, dados: { ...dados } });
          if (tabela !== 'system_users') Object.assign(portal, dados);
          const resposta = Promise.resolve({ error: null });
          return {
            eq() {
              return Object.assign(resposta, {
                select() {
                  return { single: async () => ({ data: { id: portal.id }, error: null }) };
                },
              });
            },
          };
        },
        async single() {
          if (tabela !== 'system_users') return { data: null, error: { message: 'tabela inesperada' } };
          if (!usuario) return { data: null, error: { message: 'ausente' } };
          return { data: usuario, error: null };
        },
        async maybeSingle() {
          if (tabela === 'clients') return { data: cliente, error: null };
          if (tabela === 'ceva_portal_usuarios') return { data: temPortal ? { id: portal.id } : null, error: null };
          return { data: null, error: null };
        },
      };
      return cadeia;
    },
  };
  return { sb, gravacoes, portal };
}

test('redefinir senha em texto grava a senha nova e não envia mensagem', async () => {
  const { sb, gravacoes } = clienteDeTeste({
    id: '9',
    name: 'Ana',
    email: 'ana@tmseg.com',
    user_type: 'internal',
    client_id: null,
    permissions: [],
  }, null, false);
  const resultado = await redefinirComTextoDeCriacao(sb as never, '9');
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.success, true);
  assert.equal(resultado.body.portal, false);
  assert.equal(typeof resultado.body.senha, 'string');
  assert.ok(String(resultado.body.senha).length >= 8);
  const sistema = gravacoes.filter((item) => item.tabela === 'system_users');
  assert.ok(sistema.some((item) => item.dados.force_password_change === true && typeof item.dados.password_hash === 'string'));
  assert.equal(sistema.some((item) => item.tabela !== 'system_users'), false);
});

test('redefinir senha em texto do portal usa a mesma senha e pede a troca', async () => {
  const { sb, portal } = clienteDeTeste({
    id: '9',
    name: 'Priscilla',
    email: 'priscilla@cliente.com',
    user_type: 'client',
    client_id: 3,
    permissions: ['portal-only'],
  }, { id: 3, name: 'CEVA LOGISTICS LTDA' }, true);
  const resultado = await redefinirComTextoDeCriacao(sb as never, '9');
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.portal, true);
  assert.equal(resultado.body.rotulo, 'CEVA');
  assert.equal(resultado.body.caminho, '/ceva');
  assert.equal(portal.trocar_senha, true);
  assert.equal(senhaConfere(String(resultado.body.senha), portal.senha_hash), true);
});

test('portal sem cadastro não troca a senha do sistema', async () => {
  const { sb, gravacoes } = clienteDeTeste({
    id: '9',
    name: 'Priscilla',
    email: 'priscilla@cliente.com',
    user_type: 'client',
    client_id: 3,
    permissions: ['portal-only'],
  }, { id: 3, name: 'CEVA LOGISTICS LTDA' }, false);
  const resultado = await redefinirComTextoDeCriacao(sb as never, '9');
  assert.equal(resultado.status, 409);
  assert.equal(gravacoes.length, 0);
});

test('usuário ausente não gera senha', async () => {
  const { sb, gravacoes } = clienteDeTeste(null, null, false);
  const resultado = await redefinirComTextoDeCriacao(sb as never, '9');
  assert.equal(resultado.status, 404);
  assert.equal(gravacoes.length, 0);
});
