import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mensagemNovaSenhaWhatsapp, normalizarTelefoneWhatsapp } from '../lib/cevaPortal/regrasAcesso';
import { aplicarSenhaNoPortal, lerAcessoPortal } from '../lib/cevaPortal/cadastroSistema';
import { hashSenha, senhaConfere } from '../lib/cevaPortal/acesso';
import { handlePasswordResetRequest } from '../lib/passwordReset';

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
  assert.match(form, /import React/);
});
