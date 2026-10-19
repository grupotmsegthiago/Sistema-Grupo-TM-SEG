# Reversão da fase 2

A fase 2 só acrescenta arquivos. O Centro de Homologação, a correção dos R$ 650,00 e as permissões atuais ficam como estavam.

Para desfazer só esta fase, remover:

- `lib/gestorFiscal/homologacaoReal/`
- `docs/gestorFiscal/HOMOLOGACAO-REAL-NAO-EXECUTAR.md`
- `docs/gestorFiscal/HOMOLOGACAO-REAL-REVERSAO.md`
- `scripts/homologacao-real-preparacao.test.ts`

Não é preciso migration de volta porque nenhuma tabela foi criada. Não apagar `lib/gestorFiscal/centroHomologacao.ts` nem `auditoriaClasseA.json`.
