# RELATÓRIO DA ÚLTIMA EXECUÇÃO

# Próxima Execução Proposta

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. A unificação autorizada em 26/10/2026 (Tabela 2027, rota Salvador, Nova Rota, fuso de Brasília e o gate de fluxo) é a execução desta entrega. A branch da tarifa duplicada do portal não entrou. Não há outro plano de código aberto. A próxima alteração de código ou de tabela substitui este plano, reapresenta no chat e espera nova aprovação expressa.

## Gate de aprovação prévia (26/10/2026)

Autorizado na mesma mensagem pelo pedido de gravar o complemento. Não altera código de aplicação nem tabela.

- **Objetivo da Tarefa:** consolidar o gate de desenho e aprovação antes de qualquer alteração de código ou de tabela.
- **Passo a Passo Sequencial:** 1. Ler o protocolo, o estado atual e este relatório. 2. Incluir a cláusula no protocolo. 3. Registrar a nota no topo do estado atual. 4. Registrar este plano nesta seção. 5. Conferir o texto gravado.
- **Ficheiros Afetados:** `.cursor/rules/protocolo-alteracao-tmseg.mdc`, `docs/governanca/ESTADO-ATUAL.md`, `RELATORIO_ULTIMA_EXECUCAO.md`.
- **Garantias de Não Impacto:** não altera `lib/financialUtils.ts`, não altera os contratos DHL e IBL, não mexe no limite de 50 funções da Vercel e não muda o padrão de Brasília em 24 horas.

## Fuso de Brasília e smoke check (26/10/2026)

O padrão temporal oficial fica em `America/Sao_Paulo`, hora em 24h (`HH:mm`, sem AM/PM) e data em `DD/MM/AAAA`, na constituição e no artigo 2. O checklist de entrega exige `GET /api/health`, `npm run build`, os testes do escopo e, em notificação ou faturamento, `scripts/email-health-check.ts`. `calculateMissionFinancials` não foi alterado.

## Nova Rota sem tipo e região (26/10/2026)

Baseline `ad3074fa`. A tela Nova Rota pedia Tipo da rota (Fixa ou Esporádica) e mostrava Região só leitura. Os dois campos saíram. Sem tipo escolhido, o salvamento grava só código, nome, cliente, origem, destino, km e pedágio. Se a rota já estava classificada, a edição regrava o tipo que veio do banco, para não apagar fixa ou esporádica. `consumirRotaEsporadica` e `calculateMissionFinancials` não foram alterados. Sem migration.

## Rota Salvador–São Paulo sem ZERO_RESULTS (26/10/2026)

O texto "Salvador, BA" para "São Paulo, SP" não fecha no Directions. Com ", Brasil", a mesma rota responde cerca de 1.986 km e 1.609 min. A cotação passa a pedir placeId ou coordenada, com pedágio, rodovia e balsa liberados, e repete em texto com o país quando o status é ZERO_RESULTS ou NOT_FOUND. O km gravado na tela continua liberando Gerar proposta. Sem migration e sem alteração em calculateMissionFinancials.

## Prioridade da Tabela 2027 na cotação (26/10/2026)

Baseline `ad3074fa`. Fluxo aprovado com o ajuste do seletor: Tabela 2027 começa selecionada e tem prioridade; se o operador muda para Tabela 2026, valem as tarifas 2026 daquele cliente. A vigência continua no prefixo do nome da operação, sem coluna nova e sem migration. Linha antiga de R$ 10,00 não cobre a `TABELA 2027 - NORDESTE`. Sem linha 2027, usa a 2026 do cliente; sem as duas, a faixa de `tabela2027.ts`. O snapshot grava `vigencia` 2027 ou 2026 conforme o que foi usado. Cotação antiga sem marca permanece em 2026. DHL e IBL não entram. `calculateMissionFinancials` não foi alterado.

## Ações do histórico e painel do mapa (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Thiago validou no localhost as colunas, o menu e o painel do mapa. Baseline `882cd3c1`. O histórico passa a mostrar o km e a hora extra gravados na cotação. O menu inativa na hora, pede confirmação para excluir, devolve origem, destino e paradas ao formulário e envia o PDF pelo SMTP que já existe. Não há coluna deleted_at e a migration não foi criada. Administrador, diretoria e o autor inativam e excluem; o servidor grava system_logs. O mapa usa o painel Informações da Rota com a cidade, a distância e o tempo da rota calculada, e o caminhão 3D fica sobre o traçado. O PDF preview não insere cotação. Sem função nova na Vercel e sem alteração em calculateMissionFinancials. Rollback: reverter este commit.

## Rota, mapa e caminhão da cotação (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Baseline `8fb79794`. Thiago validou Salvador, BA → São Paulo, SP: traçado, botão e PDF com mapa e caminhão. A cotação deixava de fechar quando o lugar não vinha da lista ou quando a leitura da polilinha quebrava o km já calculado. O campo agora guarda a coordenada do `place_changed` e, no Enter ou ao sair, consulta o Geocoder no Brasil. O Directions recebe a coordenada. Falha de rota longa mostra o motivo e não apaga um km que já fechou. O mapa ao vivo abre no tema escuro, com pinos A e B e a carreta 3D do cliente (CEVA usa a pintura e o logotipo da CEVA). O PDF não captura o canvas do Google: POST /api/proposta-escolta/mapa, na rota Express já existente, baixa o Static Maps em 640×360 scale 2 e devolve Base64. Rota longa demais para `enc:` segue por pontos. A tela de rota administrativa não envia origem, destino ou km vazio. Não grava `duration_minutes`. Sem migration, sem função nova na Vercel e sem alteração em `calculateMissionFinancials`. Rollback: reverter este commit.

## Express da Vercel responde de novo (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Depois que o bundle passou a iniciar, a função esperava um evento Lambda e não fechava a resposta. A Vercel entrega req e res do Node, então api/index.ts chama o Express direto. O motor calculateMissionFinancials não foi alterado.

## Express da Vercel voltou a iniciar (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. O bundle CJS carregava api/dados-protegidos.ts, e o createRequire(import.meta.url) desse arquivo recebia endereço vazio. O Express inteiro respondia 503, inclusive a rota da vigência. A rota /api/dados-protegidos do Express passou a chamar atenderDadosProtegidos direto. A função solta da Vercel continua no arquivo api/dados-protegidos.ts. O motor calculateMissionFinancials não foi alterado.

## Vigência da tabela regional sem RLS no navegador (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Baseline `24da7d9b`. Thiago validou o botão Aplicar valor por região na Tabela 2027, sem o erro de RLS. O clique fazia upsert de system_settings com a chave anon e o Postgres recusava a linha nova. A gravação passou para POST /api/pricing/tabela-regional-vigente, no Express que já existe, sem função nova na Vercel. O servidor exige o perfil diretoria, administrador ou admin em system_users e grava com createSupabaseAdminClient. Linhas de preço, rotas e regional_rates continuam no fluxo que já existia. migrations/2026_10_26_fix_system_settings_rls.sql ficou só no repositório: não consulta users, não abre todas as chaves e não foi executada. O motor calculateMissionFinancials não foi alterado. Rollback: voltar o botão ao upsert do navegador e remover a rota.

## Publicação de 26/10/2026

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Entram o histórico de cotações do portal, o filtro exclusivo Tabela 2026 / Tabela 2027, a região da cotação pela origem e a redefinição de senha por e-mail e WhatsApp. O motor calculateMissionFinancials não foi alterado.

## Região da cotação pela origem (26/10/2026)

Publicado nesta entrega. Na tela de cotação, Guarulhos, SP acende o botão SUDESTE e o card superior mostra Sudeste SP/RJ. Uma cidade do Sul acende SUL. DHL e IBL continuam na tabela contratual, sem essa troca. No card Origem, destino e km, Horas mostra só o valor faturado e Total mostra só o valor. Saíram o texto do corte de minutos e a legenda de acionamento mínimo e hora extra. O motor calculateMissionFinancials não foi alterado.

## Filtro exclusivo Tabela 2026 / Tabela 2027 (26/10/2026)

Publicado nesta entrega. Na tabela de preços do cliente, Tabela 2027 mostra só as linhas com nome TABELA 2027. Tabela 2026 mostra o restante, inclusive rota de cidade, e esconde a 2027. A seleção em massa e a proposta comercial usam só as linhas visíveis. No histórico do portal e na aba de cotações, o mesmo seletor lista só a vigência escolhida. Cotação nova grava vigencia dentro do snapshot. Cotação antiga, sem essa marca, permanece na 2026. Não foi criada coluna nem migration. O motor calculateMissionFinancials não foi alterado.

## Histórico de cotações no portal (26/10/2026)

Publicado nesta entrega. Abaixo de Gerar proposta, o cliente vê as 10 cotações mais recentes: data, solicitante, origem, destino, distância e tempo de viagem, região com franquia, valor, validade de 30 dias e o botão Ver PDF. O PDF reabre a proposta com o snapshot gravado em quotes.contract_details. Criar OS só abre a solicitação já existente, com origem e destino, sem gravar missão e sem marcar a cotação como convertida. A lista usa a rota de cotação que já existia. Rota acordada e cliente DHL/IBL continuam com a conta de antes; a linha do histórico é só o registro. O motor calculateMissionFinancials não foi alterado.

## Senha por e-mail e WhatsApp do usuário de cliente (26/10/2026)

Publicado nesta entrega. O clique em Enviar nova senha por e-mail respondia texto puro 500 porque a função da Vercel importava o módulo sem extensão e caía antes do SMTP. As três rotas carregam api/_password-reset-core.cjs. Na ficha do usuário de cliente, Redefinir senha e enviar no WhatsApp gera a senha, envia no número informado e só então grava. Se o bot estiver desconectado, a senha atual permanece. Quem entra pelo portal recebe a senha nova com troca obrigatória.

## Cotação, edição regional e imagens (26/10/2026)

Publicado nesta entrega. Thiago aplicou migrations/2026_10_26_cotacoes_validade.sql no banco. Cotação sem converted_to_order_id e com mais de 30 dias recebe is_active = false e status expirada na listagem, no painel da Diretoria e no cron de manutenção. Cotação já ligada a uma OS não expira e não volta para seleção. Com as colunas no banco, a rotina grava a expiração de verdade. Diretoria ou Administrador edita KM, hora extra e franquia da linha TABELA 2026/2027 pelo PATCH /api/clients/:clientId/pricing-tables/:id, gravando só aquele cliente e deixando rastro em system_logs. DHL e IBL não recebem essa linha. O cartão QuoteCalculatorCard aparece na tabela de preços e no portal. Rota acordada e cliente contratual continuam na conta que já existia. Os demais usam calculateTripCost. Antes do PDF e da impressão da proposta, as imagens viram data URL. O motor calculateMissionFinancials não foi alterado.

## Tabela 2027 e rota esporádica (26/10/2026)

Publicado nesta entrega. Thiago aplicou migrations/2026_10_26_tabela_2027_rotas.sql no banco. A rota ganhou tipo Fixa ou Esporádica, região e o vínculo com a OS que consumiu a esporádica. A conta nova é calculateTripCost: até 100 km cobra 100 km e 3 horas; acima disso o km inteiro usa o valor da região e a hora segue o corte de 40 minutos, sem ficar abaixo de 3 horas. DHL e IBL não recebem essa tabela. Guarulhos/SP cai em Sudeste SP/RJ e Belo Horizonte/MG em Sudeste MG/ES. O botão Aplicar valor por região fica só para Diretoria e Administrador, grava a vigência em system_settings e só mexe nas linhas TABELA 2026/2027. O motor calculateMissionFinancials não foi alterado. Com as colunas no banco, a rota esporádica passa a ser consumida de verdade na OS.


## Tabela da mesma rota (22/10/2026)

Publicado nesta entrega. A criação olhava as últimas OS do cliente, de qualquer rota. Guarulhos–Serra acabava em Guarulhos–Aparecida de Goiânia e o fornecedor caía na faixa de 1000KM. A consulta do histórico pedia `original_client_name`, coluna que não existe, e voltava vazia. Agora entram as 10 mais recentes da mesma cidade de origem e de destino. A tabela que mais se repetiu é a selecionada, no cliente e no fornecedor daquela OS. No localhost, DHL Guarulhos–Serra com a TORRES ficou em SUDESTE - GUARULHOS-SERRA 758KM e 800KM. Vale para a OS nova, o portal e a auditoria sem valor gravado. OS aprovada ou já faturada não muda.

## Ceslog sem as tabelas auxiliares (22/10/2026)

Publicado nesta entrega. O Controle da Ceslog respondia “Não foi possível carregar as OS da CESLOG” porque `portal_cliente_catalogo` e `portal_cliente_os_campos` não existem no banco. Só `portal_cliente_usuarios` foi criada. As OS da Ceslog estão em `missions`. Quando essas tabelas auxiliares faltam, a lista e o Ao vivo seguem só com as OS. As tabelas não foram criadas.

## Ao vivo nos portais (22/10/2026)

Publicado nesta entrega. O botão Ao vivo marcava a opção, mas a solicitação aberta continuava na tela e escondia as missões. Agora Cotação, Controle, Ao vivo e Diretoria fecham a solicitação. Na IBL, o painel abriu com as missões em andamento. Na CEVA, o painel abriu e informou que não há missão em andamento. No Ceslog, a tela de entrada deixou de responder “Portal não encontrado”: a consulta de acesso e o login enviam o slug do portal. A rota Ao vivo do Ceslog responde e exige login.

## Tabela da Cassiane (22/10/2026)

Gravado no banco. Cassiane Garcia, usuário 26, perfil Avançado, passou a ter `client-prices` e `provider-costs` só no cadastro dela. O perfil dos demais não mudou. A sessão antiga não enxerga a chave: ela precisa sair e entrar de novo. No cliente, a mesma chave também abre contratos, cancelamento, veículos, rotas, cotações e o simulador. No fornecedor, abre a tabela de custos e os contratos.

## Cotação no portal (22/10/2026)

Publicado nesta entrega. O logotipo oficial do cliente fica sobre o baú da carreta na cotação e na proposta. O número de operações da proposta acompanha a quantidade real de OS e aparece só em milhar, sem o valor exato. O mapa da cotação continua o do Google. A foto estática não substitui mais esse mapa. O caminhão só aparece depois que origem e destino foram escolhidos na lista, para a pessoa conseguir completar o endereço. Ao gerar a proposta, o logotipo vetorizado da TM SEG, com fundo transparente, percorre a rota da origem ao destino, sem girar. Depois que a rota real fecha, a tela mostra Preparando a proposta e troca o mapa pela foto dessa rota no Google, com a carreta do cliente. A imagem da carreta é pedida uma vez, sem marca desenhada, e o logotipo oficial fica por cima. Se a geração não estiver disponível, continua a carreta já gravada. A tela Cotação do portal ganhou o visual da referência, com mapa Google real e a carreta já gravada do cliente. O PDF imprime a mesma proposta da tela, com as fotos. O cadastro do cliente, na aba Cotações, usa esse mesmo modelo. A proposta usa as fotos, os números, os diferenciais e os clientes publicados em www.grupotmseg.com.br. A proposta é uma apresentação da empresa, com os serviços do site, as condições da rota e o aviso de pedágio à parte. O PDF segue esse mesmo material. A proposta mostra o valor do km extra, o valor da hora extra e o aviso de que o pedágio é cobrado à parte. CEVA, IBL e o portal por slug têm o botão Cotação. A região, por exemplo NORTE, mostra o valor por km daquela região. As rotas já cadastradas não aparecem. Origem, parada e destino são escolhidos no Google. O mapa soma o km da rota. A franquia da cotação é o km da rota e as horas dessa divisão por 40. 23,75 h conta como 24 h. Abaixo de 100 km e 3 h, a conta usa esse mínimo. O acionamento continua o valor de acionamento da região. O km acima da franquia usa o valor por km da região. O km da rota também sobe a fração. O valor por km não aparece na tela. Ao gerar, a animação termina numa proposta do Grupo TM SEG, com PDF e e-mail. A gravação na tabela do cliente só acontece no clique de salvar. Rota já cadastrada abre a proposta acordada, sem esse clique.

## Parceria e conta alinhada (22/10/2026)

Ainda não publicado. A análise cabe em uma tela, sem barra de rolagem. No lugar da parceria, o cliente lê um relato de até cinco linhas com o que aconteceu na OS: serviço, rota, motorista, jornada, quilometragem e total. O relato fica por último na coluna esquerda, na faixa cinza, depois dos dados da OS. A análise também mostra as fotos de origem, fim, km inicial e km final. Fim e km final vêm das fotos já gravadas na OS. Origem só aparece quando existe o print de início. Km inicial não tem foto gravada no sistema, então o espaço fica vazio. A evidência da solicitação não entra no lugar da origem. As linhas cobrem serviço e número da OS, trajeto e trecho, motorista, tempo, percurso com a franquia de quilometragem, valores e tarifas. Solicitante, autorização, operação, contrato, PGR, TSP, identificação e observação só aparecem quando estão gravados. Hora extra e km excedente, com o valor, só entram quando são maiores que zero.

## Conta da medição (22/10/2026)

Ainda não publicado. A análise mostra a conta nesta ordem: acionamento, hora inicial / hora final = total = hora extra, km inicial / km final = km extra, pedágio e total. Os números continuam os gravados na OS.

## Aprovar só com De acordo (22/10/2026)

Ainda não publicado. O botão Aprovar abre a análise. A gravação só acontece depois do termo De acordo. O administrador interno vê Voltar para verificar numa OS já aprovada e a linha deixa de ficar verde. O administrador do cliente não desfaz a aprovação.

## Medição só depois da validação (22/10/2026)

Ainda não publicado. Na lista do portal, Analisar, Aprovar e Conferir ficam na última coluna, na mesma linha. Enquanto a OS mostra Aguardando validação, esses botões não aparecem e o servidor recusa a gravação. A análise aberta mostra os dados da OS e o mapa com o ponto A na origem e o ponto B no destino.

## Primeiro acesso do portal novo (22/10/2026)

Ainda não publicado. Ao salvar um cliente ativo com portal, nasce o administrador `portal@domínio` do site, com senha igual ao CNPJ e perfil administrador. No primeiro acesso ele troca o e-mail e a senha. A equipe interna continua entrando com o usuário do sistema. Quem o administrador cadastra no portal também entra no Cadastro de Usuário do cliente. O botão Ler prefere SVG e descarta o retângulo branco de fundo. A cor escura vira a marca e a cor viva vira o botão. CEVA e IBL não recebem esse e-mail automático.

## Medição do portal do cliente (22/10/2026)

Ainda não publicado. CEVA, IBL e o portal por slug usam a mesma lista. Cada OS ganhou Analisar medição, Aprovar e Conferir. Aprovar grava a decisão e a linha fica verde. Conferir pede os itens recusados, justificativa e anexo opcional; a linha fica amarela e o e-mail vai para financeiro@grupotmseg.com.br. Quando a equipe grava a OS depois desse pedido, a linha mostra Modificação realizada e o cliente pode aprovar. A tabela é `portal_medicao_cliente`. O gatilho na OS engole o próprio erro, então uma falha dessa tabela não impede salvar a OS. O cálculo da OS não mudou.

## Salvamento do cliente com site e logotipo (22/10/2026)

O botão Finalizar e salvar respondia “Erro desconhecido”. O PostgREST devolve o erro como objeto simples, e o código só lia `instanceof Error`. Sem as colunas, o banco responde `PGRST204`, e o formulário só tentava de novo no código `42703`, então o cadastro inteiro era recusado. As colunas `portal_ativo`, `portal_slug`, `portal_site`, `portal_logo_url`, `portal_cor` e `portal_cor_acao` foram criadas em `clients`, com índice único do slug. O restante de `migrations/2026_10_21_portal_cliente.sql` não foi executado. Publicado nesta entrega.

## Leitura do site no cadastro do cliente (22/10/2026)

O botão Ler respondia “Portal não encontrado” no localhost. O Express 5 recalcula `req.query` a cada leitura, então a marca da operação sumia e a rota procurava um portal sem slug. O endereço `/api/cliente-portal/...` agora entra no mesmo leitor. Na ficha da IBL, `https://ibllogistica.com.br/` devolveu o ícone do site e a cor `#f7941e`. A ficha ainda precisa ser salva para gravar. Publicado nesta entrega.

---

## Abertura da Auditoria sem leitura morta (22/10/2026)

A Auditoria deixou de disparar a busca que pedia `original_client_name`. Essa consulta já falhava e não trocava tabela. Na primeira abertura, se a OS recebida já tem receita, custo, pedágio e status, a modal não baixa essa linha de novo. Um Controle Diário incompleto continua buscando a OS. Salvar, tempo real e o recarregar depois de gravar continuam lendo o banco. Na GTM-8765, fora do Cockpit, a abertura marcou reutilização, mostrou 2.398,00 e 700,00, e o aviso Sincronizando Dados ficou em cerca de 3,2 s. A linha dessa OS tem 722 bytes. Publicado nesta entrega.

---

## Informar Pedágio na Auditoria (22/10/2026)

Os campos Pedágio Cliente e Pedágio Fornecedor da Auditoria de Faturamento ficaram bloqueados para digitação. O botão Informar Pedágio, logo acima, recebe o valor real: ele entra no fornecedor e o cliente é calculado pela regra que já existia (faixas, DHL sem acréscimo). A criação da OS já gravava assim. Deslocamento não mudou. Na GTM-8765, R$ 100 virou fornecedor R$ 100,00 e cliente R$ 120,00; em seguida os campos voltaram a R$ 0,00, sem Salvar. Sem mudança de fórmula. Publicado nesta entrega.

---

## Cockpit local quebrava o JSON (22/10/2026)

O navegador não consulta as tabelas financeiras direto. Ele manda `POST /api/dados-protegidos` e espera JSON. Na Vercel essa função existe. No Express local a rota não estava ligada, então a resposta era a página HTML (`<!DOCTYPE`) e o Cockpit mostrava `Unexpected token '<'`. A rota local agora chama o mesmo handler. Sem sessão o teste devolveu JSON `sessao_invalida`, não HTML. Sem mudança de fórmula, de permissão ou de banco. Publicado nesta entrega.

---

## Rolagem da Auditoria de Faturamento (22/10/2026)

A publicação de 21/10 trocou a área que rola da auditoria por um `fieldset`, para travar os campos enquanto salva. Nesse elemento o navegador não desce a rolagem, então o restante da OS ficava cortado para quem abre a tela, não só para a Ana e a Giovanna. A rolagem voltou para o div de antes, sem mudar `min-height`. O fieldset continua só para desabilitar os campos durante o Salvando. A suíte agora recusa `overflow` na abertura de um `fieldset`, e o Cursor bloqueia essa edição. Sem mudança de valor, de gravação ou de permissão.

---

## Cockpit lê, zero gravado vale e boletim fecha (21/10/2026)

O Atualizar do Cockpit deixou de chamar o recálculo de hora extra. Ele só busca de novo o que já está no banco. Receita e custo gravados, inclusive 0, entram no Cockpit e no relatório de OS mesmo sem a OS estar conferida. Estimativa só quando a coluna está NULL. Deslocamento 0 também permanece 0. No boletim, se a fórmula de km extra e hora extra não soma o valor gravado, o serviço inteiro fica no valor da OS e os extras de dinheiro zeram, para a linha fechar. A rota `/api/recalculate-open` continua no servidor, fora do botão. Sem mudança da fórmula do motor e sem migration.

---

## Relatório de OS: pagamento ao fornecedor em vermelho claro (21/10/2026, não publicado)

No relatório de OS, Custo, Ped. Pago, Desl. Pago e Total Pago ficaram com fundo vermelho claro, no mesmo bloco do verde da receita. Cabeçalho e totais seguem o vermelho mais forte. Os números não mudaram. Sem publicação.

---

## Auditoria não fecha no meio do salvamento (21/10/2026, não publicado)

A varredura da tela de auditoria achou gravações que seguiam sem a linha de volta do banco: dados operacionais do fornecedor, recálculo, tabela oficial, rota, vínculo de mesma OS, boletim e referência da VS. Essas gravações agora usam a mesma confirmação do Salvar. Se o banco não devolver a OS, a tela mostra o erro e não diz que salvou. Durante o envio o botão de fechar não sai, os campos ficam desabilitados e o painel Salvando cobre a tela. Ao reabrir, a OS é lida de novo no servidor. Sem mudança de fórmula e sem publicação.

---

## Tabela mestre genérica fora do preço (21/10/2026, não publicado)

O recálculo escolhia a linha `__AUTO_MASTER__ SUDESTE` como se fosse a tabela da OS. Na FLASH, essa linha vale R$ 800 e substituía a tabela `SUDESTE - FLASH - 30 DIAS - BARUERI` (R$ 650). Agora essa linha não entra na escolha, nem quando o id salvo é o dela. Se a OS já tem a tabela contratual, ela permanece. Se não houver correspondência, o preço fica zerado e o aviso é “Tabela não encontrada”. O cadastro do cliente deixou de gravar linha nova com esse nome. Nada foi apagado nem desativado no banco. Sem publicação e sem mudança da fórmula de km, hora, pedágio e deslocamento.

---

## Auditoria grava o que a tela mostra (21/10/2026, não publicado)

O Salvar da auditoria envia os seis valores que estão na tela, inclusive zero, sem depender de marca de campo alterado. A chamada pede a linha de volta com `.select()`. Se o banco devolver erro ou nenhuma linha, a tela mostra o erro e não diz que salvou. A lista da auditoria recebe a linha devolvida e busca de novo. No projeto Grupo TMSEG, a política `public_access_missions` permite UPDATE. Sem mudança de fórmula e sem publicação.

---

## E-mail da fatura com NF, boleto e boletim (21/10/2026, não publicado)

O aviso da Asaas de “fatura gerada” ia para o cliente sem a cópia do financeiro e sem os documentos. Na próxima cobrança, o cliente da Asaas recebe `financeiro@grupotmseg.com.br` nas cópias e o e-mail vazio de fatura criada deixa de ir ao cliente. Os lembretes de vencimento continuam. O e-mail do sistema, que já saía quando a NF e o boleto existiam, agora anexa o PDF da NF, o PDF do boleto quando o link é um PDF, e a planilha do boletim com as OS vinculadas. O boletim usa só os valores já gravados na OS. O texto do e-mail aponta para o financeiro, com cópia para o financeiro e para o Thiago. Sem mudança de fórmula, sem migration e sem publicação.

---

## Aviso da alteração já feita (21/10/2026, não publicado)

O aviso da Diretoria só nascia na reaprovação com senha. O Salvar de uma OS já aprovada ficava só no histórico da OS, então a alteração da Giovanna não aparecia. A Diretoria agora também lê esse histórico (perfil Diretoria ou Thiago Moreira / Thiago Santos). Salvar daqui para a frente grava o aviso na hora. Marcar como lida continua valendo. Sem mudança de fórmula e sem publicação.

---

## Senha da reaprovação (21/10/2026, não publicado)

Na OS já aprovada, o botão Reaprovar ficava cinza até o texto ter 8 caracteres, mesmo com a senha digitada. Agora ele libera quando a senha de quem está logado é preenchida. A conferência continua sendo a senha de acesso dessa pessoa: Giovanna com a dela, Ana com a dela. O texto da alteração segue obrigatório no clique. Sem mudança de fórmula e sem publicação.

---

## Segredo da sessão no localhost (21/10/2026, não publicado)

A Vercel não exporta `SESSION_SECRET`: a variável é Secret e o pull grava `[SENSITIVE]`. Foi criado um segredo só deste computador, no `.env` da raiz, que o Git ignora. O servidor local foi reiniciado. O login deixou de responder “o segredo da sessão não está configurado” e passou a responder que a fonte confiável não está disponível, porque `SUPABASE_SERVICE_ROLE_KEY` também é Secret na Vercel e não veio no pull. Sem inventar a chave do banco e sem publicação.

---

## Colunas do relatório de OS (21/10/2026, não publicado)

No relatório de OS, o que é receita ficou lado a lado, com fundo verde: Receita, Ped. Recebido, Desl. Recebido e Total Recebido. Depois vêm Custo, Ped. Pago, Desl. Pago e Total Pago. O deslocamento recebido entra no verde porque faz parte do total recebido. Os totais são a soma que o rodapé já usava. Resultado, % lucro, auditoria e faturamento continuam no mesmo lugar. O aviso do pedágio saiu de dentro da célula e ficou num “i”: o texto só aparece com o mouse em cima. A fórmula da OS não foi alterada. Sem commit e sem publicação.

---

## Tabela na criação da OS (21/10/2026, não publicado)

Na criação interna e no portal, a tabela sai das últimas OS do mesmo cliente. Mesma origem e mesmo destino vencem. Se houver tabelas diferentes, fica a do km mais próximo. Sem fornecedor, só a tabela do cliente é gravada. O portal nasce com a receita calculada pelo motor da OS e o valor não vai no e-mail nem na resposta ao cliente. A marca `origemTabela: criacao` não substitui o snapshot da aprovação. Edição manual na auditoria continua gravando só o campo alterado.

---

## Salvamento só do campo editado (21/10/2026, não publicado)

Na auditoria de faturamento, Salvar grava apenas o que foi alterado. Pedágio do cliente grava `toll_value`. Pedágio do fornecedor grava `toll_value_provider` e não mexe no custo. Receita, custo e deslocamento seguem a mesma regra. O snapshot existente troca só a chave correspondente e o total do cliente, e conserva franquia e km extra. A fórmula `calculateMissionFinancials` não foi alterada. Sem migration e sem publicação.

Teste: `npx tsx --test scripts/gravar-somente-alterado.test.ts` — 7 passaram.

---

## Edição do Financeiro na auditoria (21/10/2026, não publicado)

O perfil Financeiro edita a auditoria de faturamento. Ao reaprovar uma OS já aprovada, a tela pede a senha e um texto da alteração. A Diretoria recebe um aviso com OS, quem, hora, texto e mudanças. Marcar como lida grava em `system_logs` e o aviso some. Deixar pendente mantém o aviso. Prejuízo analisado e fatura paga continuam travados. GTM-8763 está Agendada, então a senha só aparece depois da primeira aprovação. Sem migration e sem publicação.

---

# RELATÓRIO ANTERIOR

Fase: equivalência de acesso ANA.FERNANDES e Giovanna Marsili
Data: 2026-10-21
SHA da sessão: `dev` em `640e24b1`, working tree suja, sem commit
SHA de produção (/api/version): não consultado. Não houve publicação.

1. Objetivo e escopo
Fazer o usuário da Ana ter a mesma supervisão financeira da Giovanna. As duas já estão no perfil Financeiro. A diferença era a regra por nome, que reconhecia Giovanna e não reconhecia o cadastro `ANA.FERNANDES`.

2. Baseline
Branch `dev`, alinhada com `origin/dev` em `640e24b1` antes desta alteração. Supabase do app `ajhmmjuewdsukecaimik`. A leitura do cadastro foi só consulta. Nenhum SQL de escrita.

3. Arquivos alterados
- `lib/financeSupervisorAccess.ts` — `isAnaFernandes` e inclusão em `isFinanceSupervisorName`
- `lib/missionAccess.ts`, `lib/missionReportAccess.ts`, `lib/missingTableAccess.ts`, `lib/missionOpsIncomplete.ts`
- `lib/osAnalysisAccess.ts`, `lib/controleDiario.ts`
- `components/RequestOsAnalysisModal.tsx`
- `scripts/finance-supervisor-access.test.ts`, `scripts/mission-access.test.ts`, `scripts/controle-diario.test.ts`
- `scripts/acessos-financeiro-ana.test.ts`
- `docs/governanca/ESTADO-ATUAL.md`, `RELATORIO_ULTIMA_EXECUCAO.md`

4. Regras preservadas
Motor de OS, Asaas, NF, TORRES, comissão e WhatsApp não foram alterados. A trava de prejuízo continua só com Giovanna Marsili, Beatriz Rocha e Thiago Moreira. “Ana” sozinho, “Ana Comercial” e outro sobrenome não entram. O restante do PR #339 (tela inicial de orçamento) não voltou. Nenhuma permissão foi gravada no banco.

5. Banco
Consulta de leitura em `system_users` + `profiles`. ANA.FERNANDES e Giovanna Marsili estão ativas, internas, perfil Financeiro, com a mesma lista do perfil. Giovanna tem no usuário `client-prices` e `provider-costs`. Ana não tem permissão extra no usuário. Essas duas chaves não mudam a tela de tabela, porque o perfil Financeiro já abre preço de cliente e custo de fornecedor. Nada foi gravado.

6. Riscos e rollback
Ana passa a editar OS concluída, ver a lista completa, o card de prejuízo, o alerta de OS sem tabela, reaprovar no estágio financeiro e abrir a auditoria pelo controle diário, como a Giovanna. Rollback: descartar estes arquivos na working tree. Sem migration.

7. Testes executados
`npx tsx --test scripts/finance-supervisor-access.test.ts scripts/mission-access.test.ts scripts/controle-diario.test.ts scripts/acessos-financeiro-ana.test.ts scripts/mission-ops-incomplete.test.ts scripts/missing-table-access.test.ts scripts/fase3-p0-financial-integrity.test.ts`
53 passaram. 1 falhou fora deste escopo: `scripts/fase3-p0-financial-integrity.test.ts` exige o texto `canAccessMissionReport` em `components/Sidebar.tsx`. O menu usa `canAccessScreen`, que chama essa função. O arquivo não foi alterado nesta tarefa. `App.tsx` continua chamando `canAccessMissionReport`.
`npm run build` terminou sem erro. O HTML injeta `__TMSEG_SUPABASE__` do projeto `ajhmmjuewdsukecaimik`.
`GET http://localhost:5000/api/health` retornou `{"status":"ok"}`.

8. Autorização
Pedido explícito de igualar a regra das duas. Não publicar até o proprietário validar no localhost e pedir publicar.

9. Próximo passo
Entrar com o usuário ANA.FERNANDES em `http://localhost:5000/` e conferir a lista de OS, o card de prejuízo e a edição de OS concluída. Se a trava de prejuízo também tiver de ser da Ana, isso é outra regra e precisa de pedido separado.
