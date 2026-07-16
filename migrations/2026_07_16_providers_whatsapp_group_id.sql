-- Grupo de WhatsApp do fornecedor (mesmo padrão de clients.whatsapp_group_id).
-- Usado pelo comando: @monitoramento cadastra este grupo no fornecedor NOME
ALTER TABLE providers ADD COLUMN IF NOT EXISTS whatsapp_group_id TEXT;
