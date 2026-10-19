# 15 — Modelo de relatório de execução

Copiar este esqueleto para `RELATORIO_ULTIMA_EXECUCAO.md` ao fim de cada etapa. Não apagar o relatório anterior: substituir o arquivo pelo estado mais recente e manter o bloco de continuação.

```
# RELATÓRIO DA ÚLTIMA EXECUÇÃO

Fase:
Data:
SHA da sessão:
SHA de produção (/api/version):

1. Objetivo e escopo
2. Baseline (git, branch, dev, main, working tree, Supabase ref conferido)
3. Arquivos alterados
4. Regras preservadas
5. Banco (nenhum / leitura / escrita). Projeto e ref.
6. Riscos e rollback
7. Testes executados (comando e resultado). O que não rodou.
8. Homologação (localhost ou motivo de não haver tela)
9. Autorização recebida (citação do pedido)
10. Pendências
11. Próxima fase autorizada (ou nenhuma)
12. BLOCO PARA CONTINUAÇÃO

VEREDITO:
```

Proibido no veredito: “pronto” sem o comando que passou. Build sozinho não fecha tarefa de tela. Publicação só entra no relatório se `publicar.ps1` tiver rodado e `/api/version` tiver sido lido depois.
