# WhatsApp Desktop na solicitação de escolta

O aplicativo fica só neste computador. Ele usa o WhatsApp Desktop já autenticado. Não abre o WhatsApp Web e não usa o link `chat.whatsapp.com` para enviar.

## Instalar

1. Em Configurações, abra **Integração WhatsApp Desktop**.
2. Clique em **Instalar aplicativo TM SEG**.
3. Se o arquivo ainda não foi gerado neste ambiente, na pasta do sistema execute `npx tsx desktop/whatsapp-desktop/servidor.ts` e abra `http://127.0.0.1:47321/`.
4. Siga o assistente: Boas-vindas, Windows, WhatsApp, Instalar, Vincular, Teste e Concluir.
5. Cole o código no sistema e clique em **Vincular este computador**. O indicador fica **Computador conectado**.

O assistente não é um arquivo BAT. A assinatura digital só entra quando houver certificado.

## Operar a solicitação

1. No monitoramento, clique em **Solicitação**.
2. Cole a mensagem do cliente e leia a fila. A ordem e a TORRES em São Paulo continuam as do PR 350.
3. Confira o nome exato do grupo no cadastro do fornecedor. Sem esse nome, o aplicativo não envia.
4. Clique em **Autorizar lote no computador**.
5. Imediata: todos os selecionados já liberados entram juntos. Agendada: os dois primeiros agora e o próximo a cada 10 minutos.
6. **Fornecedor confirmado** trava o restante e abre a OS como **Solicitada**. Uma mensagem que o WhatsApp já recebeu o comando não é descrita como cancelada.

Se o aplicativo estiver fechado, a fila fica pendente. O sistema não marca a mensagem como enviada.

O estado **Comando executado no WhatsApp** não significa mensagem entregue ou lida.

## Banco

A migration `migrations/2026_10_20_whatsapp_desktop.sql` ainda não foi aplicada no projeto Grupo TMSEG (`ajhmmjuewdsukecaimik`). O rollback está em `migrations/rollback/2026_10_20_whatsapp_desktop.sql`. Não aplicar no projeto TORRES.

Enquanto a migration da solicitação `2026_10_20_escolta_solicitacao.sql` não existir no banco, o botão Solicitação avisa o arquivo e não grava a fila.
