/**
 * Migração de senha com credenciais fictícias. Não consulta produção.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { hashSenha, senhaConfere } from '../lib/cevaPortal/acesso';
import { INTEGRACAO_HTTP_LIBERADA } from '../lib/gestorFiscal/ponteAuth/flag';
import { gerarHashVersionado, identificarFormatoHash, verificarSenhaArmazenada } from '../lib/gestorFiscal/ponteAuth/hashSenha';
import { atenderPonteHttp } from '../lib/gestorFiscal/ponteAuth/httpPonte';
import {
  MIGRACAO_SENHA_LIBERADA,
  autenticarEMigrar,
  respostaPublica,
  type LogMigracao,
  type RegistroSenha,
  type RepositorioSenha,
} from '../lib/gestorFiscal/ponteAuth/migracaoSenha';

const SENHA = 'senha-ficticia-correta';

class RepoMemoria implements RepositorioSenha {
  itens = new Map<string, RegistroSenha>();
  falharLer = false;
  falharGravar = false;
  falharApagar = false;
  gravacoes = 0;
  barreira: Promise<void> | null = null;

  por(id: string, extra: Partial<RegistroSenha> = {}): RegistroSenha {
    const registro: RegistroSenha = {
      id,
      status: 'Ativo',
      origem: 'funcionario',
      texto: SENHA,
      hash: null,
      geracao: 0,
      sessaoLegada: `legada-${id}`,
      ...extra,
    };
    this.itens.set(id, registro);
    return registro;
  }

  async ler(id: string): Promise<RegistroSenha | null> {
    if (this.falharLer) throw new Error('banco fora');
    const item = this.itens.get(id);
    return item ? { ...item } : null;
  }

  async gravarHash(id: string, hash: string, geracao: number): Promise<'ok' | 'conflito' | 'falha'> {
    if (this.falharGravar) return 'falha';
    if (this.barreira) await this.barreira;
    const item = this.itens.get(id);
    if (!item || item.geracao !== geracao || item.hash) return 'conflito';
    item.hash = hash;
    item.geracao += 1;
    this.gravacoes += 1;
    return 'ok';
  }

  async apagarTexto(id: string, geracao: number): Promise<'ok' | 'falha' | 'conflito'> {
    if (this.falharApagar) return 'falha';
    const item = this.itens.get(id);
    if (!item || item.geracao !== geracao || !item.hash) return 'conflito';
    item.texto = null;
    return 'ok';
  }
}

function entrar(repo: RepoMemoria, id: string, senha: string, logs?: LogMigracao[]) {
  return autenticarEMigrar(repo, { usuarioId: id, senha }, {
    testeLocal: true,
    logs,
    emissor: {
      async emitir(usuarioId: string) {
        return `sessao-${usuarioId}`;
      },
    },
  });
}

test('hash versionado, sal individual e compatibilidade com o portal', () => {
  const primeiro = gerarHashVersionado(SENHA);
  const segundo = gerarHashVersionado(SENHA);
  assert.notEqual(primeiro, segundo);
  assert.equal(identificarFormatoHash(primeiro), 'scrypt_v1');
  assert.equal(verificarSenhaArmazenada(SENHA, primeiro), true);
  assert.equal(verificarSenhaArmazenada('senha-ficticia-errada', primeiro), false);
  assert.equal(verificarSenhaArmazenada(SENHA, `${primeiro.slice(0, -1)}0`), false);
  const portal = hashSenha(SENHA);
  assert.equal(identificarFormatoHash(portal), 'scrypt_portal');
  assert.equal(verificarSenhaArmazenada(SENHA, portal), true);
  assert.equal(senhaConfere(SENHA, portal), true);
  assert.equal(senhaConfere(SENHA, primeiro), false);
  assert.equal(identificarFormatoHash('$2b$10$isto-nao-e-texto'), 'outro');
  assert.equal(verificarSenhaArmazenada('$2b$10$isto-nao-e-texto', '$2b$10$isto-nao-e-texto'), false);
});

test('migra texto puro, recusa senha errada e não mexe em desativado nem no portal', async () => {
  const repo = new RepoMemoria();
  repo.por('fun');
  repo.por('errado');
  repo.por('inativo', { status: 'Inativo' });
  repo.por('interno', { origem: 'portal_interno' });
  const hashPortal = hashSenha('senha-ficticia-portal');
  repo.por('cliente', { origem: 'portal_cliente', texto: null, hash: hashPortal });
  const logs: LogMigracao[] = [];

  const ok = await entrar(repo, 'fun', SENHA, logs);
  assert.equal(ok.ok, true);
  assert.equal(ok.migracao, 'concluida');
  assert.equal(ok.sessao, 'sessao-fun');
  const fun = repo.itens.get('fun');
  assert.equal(fun?.texto, null);
  assert.equal(identificarFormatoHash(fun?.hash), 'scrypt_v1');
  assert.equal(verificarSenhaArmazenada(SENHA, fun?.hash), true);
  assert.equal(fun?.sessaoLegada, 'legada-fun');
  const gravadas = repo.gravacoes;

  const deNovo = await entrar(repo, 'fun', SENHA, logs);
  assert.equal(deNovo.migracao, 'nao_necessaria');
  assert.equal(repo.gravacoes, gravadas);
  assert.equal(repo.itens.get('fun')?.hash, fun?.hash);

  assert.equal((await entrar(repo, 'errado', 'senha-ficticia-errada', logs)).codigo, 'credenciais_invalidas');
  assert.equal(repo.itens.get('errado')?.texto, SENHA);
  assert.equal(repo.itens.get('errado')?.hash, null);
  assert.equal((await entrar(repo, 'inativo', SENHA, logs)).codigo, 'usuario_desativado');
  assert.equal(repo.itens.get('inativo')?.hash, null);
  assert.equal(repo.itens.get('inativo')?.sessaoLegada, 'legada-inativo');

  const interno = await entrar(repo, 'interno', SENHA, logs);
  assert.equal(interno.migracao, 'concluida');
  assert.equal(repo.itens.get('interno')?.texto, null);
  const cliente = await entrar(repo, 'cliente', 'senha-ficticia-portal', logs);
  assert.equal(cliente.migracao, 'preservada');
  assert.equal(repo.itens.get('cliente')?.hash, hashPortal);

  const publica = JSON.stringify(respostaPublica(ok));
  const textoLogs = JSON.stringify(logs);
  assert.equal(publica.includes(SENHA), false);
  assert.equal(publica.includes(String(fun?.hash)), false);
  assert.equal(publica.includes('sessao-fun'), false);
  assert.equal(textoLogs.includes(SENHA), false);
  assert.equal(textoLogs.includes(String(fun?.hash)), false);
});

test('falha de banco, concorrência, ponte desligada e login atual', async () => {
  const repo = new RepoMemoria();
  repo.por('falha');
  repo.falharLer = true;
  assert.equal((await entrar(repo, 'falha', SENHA)).codigo, 'fonte_indisponivel');
  repo.falharLer = false;
  repo.falharGravar = true;
  const adiada = await entrar(repo, 'falha', SENHA);
  assert.equal(adiada.ok, true);
  assert.equal(adiada.migracao, 'adiada');
  assert.equal(repo.itens.get('falha')?.texto, SENHA);
  assert.equal(repo.itens.get('falha')?.hash, null);
  repo.falharGravar = false;
  repo.falharApagar = true;
  const pendente = await entrar(repo, 'falha', SENHA);
  assert.equal(pendente.migracao, 'texto_pendente');
  assert.equal(verificarSenhaArmazenada(SENHA, repo.itens.get('falha')?.hash), true);
  assert.equal(repo.itens.get('falha')?.texto, SENHA);
  repo.falharApagar = false;
  assert.equal((await entrar(repo, 'falha', SENHA)).migracao, 'concluida');
  assert.equal(repo.itens.get('falha')?.texto, null);

  const corrida = new RepoMemoria();
  corrida.por('corrida');
  let chegaram = 0;
  let liberar = () => {};
  corrida.barreira = new Promise((resolve) => {
    liberar = () => resolve();
  });
  const primeira = entrar(corrida, 'corrida', SENHA);
  const segunda = entrar(corrida, 'corrida', SENHA);
  await new Promise((resolve) => setTimeout(resolve, 30));
  chegaram = corrida.gravacoes;
  liberar();
  const resultados = await Promise.all([primeira, segunda]);
  assert.equal(resultados.every((item) => item.ok), true);
  assert.equal(corrida.gravacoes, 1);
  assert.equal(corrida.itens.get('corrida')?.texto, null);
  assert.equal(verificarSenhaArmazenada(SENHA, corrida.itens.get('corrida')?.hash), true);
  assert.equal(chegaram, 0);

  const desligada = await autenticarEMigrar(repo, { usuarioId: 'falha', senha: SENHA });
  assert.equal(desligada.codigo, 'migracao_desligada');
  assert.equal(MIGRACAO_SENHA_LIBERADA, false);
  assert.equal(INTEGRACAO_HTTP_LIBERADA, false);
  const ponte = await atenderPonteHttp({
    acao: 'login',
    method: 'POST',
    cookie: null,
    csrf: null,
    authorization: null,
    body: { email: 'a', senha: SENHA },
    consulta: {},
  }, { env: {} });
  assert.equal(ponte.body.codigo, 'ponte_desligada');
  assert.equal(JSON.stringify(ponte.body).includes(SENHA), false);

  const login = fs.readFileSync('components/Login.tsx', 'utf8');
  assert.equal(login.includes('userCheck.password !== cleanPassword'), true);
  assert.equal(login.includes('migracaoSenha'), false);
  for (const arquivo of [
    'components/ChangePasswordModal.tsx',
    'components/ProfileSettingsModal.tsx',
    'components/UserForm.tsx',
    'components/UserList.tsx',
    'lib/passwordReset.ts',
    'lib/toll/pedagioDaOs.ts',
    'lib/cevaPortal/equipeInterna.ts',
  ]) {
    assert.equal(fs.readFileSync(arquivo, 'utf8').includes('migracaoSenha'), false);
  }
  const modulo = fs.readFileSync('lib/gestorFiscal/ponteAuth/migracaoSenha.ts', 'utf8')
    + fs.readFileSync('lib/gestorFiscal/ponteAuth/hashSenha.ts', 'utf8');
  assert.equal(modulo.includes('system_users'), false);
  assert.equal(modulo.includes('.from(\''), false);
  assert.equal(modulo.includes('.from("'), false);
  const sql = fs.readFileSync('docs/gestorFiscal/sql/2026_10_19_password_hash.NAO_EXECUTAR.sql', 'utf8');
  assert.match(sql, /NÃO EXECUTAR/);
  assert.equal(sql.includes('UPDATE'), false);
  assert.equal(sql.includes('DROP COLUMN'), false);
});
