# WhatsApp Desktop na solicitação de escolta

O aplicativo fica só neste computador. Ele usa o WhatsApp Desktop já autenticado. Não abre o WhatsApp Web e não usa o link `chat.whatsapp.com` para enviar.

## Instalar

1. Dê duplo clique em `desktop/whatsapp-desktop/Abrir instalador.vbs`. O atalho sobe o conector e abre o assistente. Não há comando para digitar.
2. Siga as telas: Boas-vindas, Verificação do computador, Instalação dos componentes, Configuração do WhatsApp, Conexão com TM SEG, Teste de funcionamento e Instalação concluída.
3. Em **Instalação dos componentes**, Avançar instala o que faltar: Node.js, Python e WhatsApp oficial, e configura a pasta local do conector. A conta do WhatsApp entra pelo QR Code do próprio aplicativo. Nenhuma senha é pedida.
4. No teste, marque a autorização. O envio só ocorre se o chat aberto for exatamente **GRUPO TM SEG - ADM**. Se a janela não mostrar esse nome, nada é enviado.
5. Na primeira conclusão, o TM SEG grava o computador. Nas próximas aberturas o conector identifica o dispositivo. Instalação, QR Code e mensagem de teste não se repetem. O QR Code volta somente se o WhatsApp perder a conta. O código manual fica só para a primeira vez, se a identificação automática não ocorrer.

O assistente não é um arquivo BAT. A assinatura digital só entra quando houver certificado. Neste computador, a inspeção de 19/10/2026 viu o WhatsApp aberto, mas a árvore de acessibilidade não expôs o nome do grupo. O teste real não foi enviado.

## Operar a solicitação

1. No monitoramento, clique em **Solicitação**.
2. Cole a mensagem do cliente e leia a fila. A ordem e a TORRES em São Paulo continuam as do PR 350.
3. Confira o nome exato do grupo no cadastro do fornecedor. Sem esse nome, o aplicativo não envia.
4. Clique em **Autorizar lote no computador**.
5. Imediata: todos os selecionados já liberados entram juntos. Agendada: os dois mais baratos agora e os dois próximos a cada 5 minutos.
6. **Fornecedor confirmado** trava o restante e abre a OS como **Solicitada**. Uma mensagem que o WhatsApp já recebeu o comando não é descrita como cancelada.

Se o aplicativo estiver fechado, a fila fica pendente. O sistema não marca a mensagem como enviada.

O estado **Comando executado no WhatsApp** não significa mensagem entregue ou lida.

## Banco

A migration `migrations/2026_10_20_whatsapp_desktop.sql` ainda não foi aplicada no projeto Grupo TMSEG (`ajhmmjuewdsukecaimik`). O rollback está em `migrations/rollback/2026_10_20_whatsapp_desktop.sql`. Não aplicar no projeto TORRES.

Enquanto a migration da solicitação `2026_10_20_escolta_solicitacao.sql` não existir no banco, o botão Solicitação avisa o arquivo e não grava a fila.
