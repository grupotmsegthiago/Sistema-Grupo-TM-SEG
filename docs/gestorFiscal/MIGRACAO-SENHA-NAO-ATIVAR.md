# NÃO ATIVAR — migração de senha

A migração não está ligada ao login, à ponte nem ao banco. `MIGRACAO_SENHA_LIBERADA` permanece falsa.

## Algoritmo

`crypto.scrypt` do Node, com sal de 16 bytes por senha. O formato novo é `scrypt$v1$16384$8$1$32$<sal>$<hash>`. N, r, p e o tamanho do hash estão no próprio texto. Parâmetros diferentes desses são recusados, para um registro não pedir um custo enorme.

O portal já grava `scrypt$<sal>$<hash>`, com os mesmos números implícitos. A verificação nova aceita os dois. O verificador atual do portal só aceita o formato de três partes, então a senha do cliente não é reescrita.

## Fluxo futuro

1. A pessoa digita a senha na tela que já existe.
2. O servidor confere o texto antigo ou o hash, se ele já existir.
3. O servidor emite a sessão. Se essa emissão falha, a senha não muda.
4. O texto vira hash versionado.
5. O texto só é apagado depois que o hash gravado confere de novo.
6. O login seguinte usa o hash.

Usuário desativado não migra. Falha ao gravar o hash mantém o texto e adia a migração. Falha ao apagar o texto deixa o hash no lugar para a tentativa seguinte.

## Quem ainda depende do texto puro

Estes arquivos não foram alterados nesta fase:

- `components/Login.tsx` compara `password` com `!==`.
- `components/ChangePasswordModal.tsx` grava a senha nova em texto.
- `components/ProfileSettingsModal.tsx` busca a senha atual com igualdade no banco e grava a nova em texto.
- `components/UserForm.tsx` grava e mostra a senha provisória.
- `components/UserList.tsx` pode revelar `password`.
- `lib/passwordReset.ts` e `server/routes.ts` gravam a senha redefinida em texto.
- `lib/toll/pedagioDaOs.ts` procura o usuário pela senha em texto.
- `lib/cevaPortal/equipeInterna.ts` e `lib/cevaPortal/httpHandler.ts` conferem a equipe interna pelo texto de `password`.
- `lib/cevaPortal/cadastroSistema.ts` ainda pode gravar senha provisória em texto no cadastro interno.

O portal do cliente já usa `senha_hash` em `lib/cevaPortal/acesso.ts`. Essa trilha fica como está.

## Rollback

Apagar `lib/gestorFiscal/ponteAuth/hashSenha.ts`, `migracaoSenha.ts`, o teste e o SQL não executado. O login atual não chama esses arquivos.
