import { sendDhlIntakeSubmittedEmail, sendDhlSupplierIntakeEmail } from '../server/emailService';

async function main() {
  const baseInfo = {
    providerName: '[TESTE] FORNECEDOR SIMULADO LTDA',
    osNumber: 'GTM-TESTE-DHL-001',
    seNumber: 'SE-2026-TESTE-12345',
    origin: 'CD DHL Louveira/SP — Av. Industrial, 1000',
    destination: 'Cliente Final — Rua das Palmeiras, 250 — Campinas/SP',
    scheduledAt: '18/05/2026 22:00',
  };

  console.log('[TESTE] Enviando 1/2 — convite ao fornecedor...');
  await sendDhlSupplierIntakeEmail({
    to: 'operacional@grupotmseg.com.br',
    providerName: baseInfo.providerName,
    osNumber: baseInfo.osNumber,
    seNumber: baseInfo.seNumber,
    origin: baseInfo.origin,
    destination: baseInfo.destination,
    scheduledAt: baseInfo.scheduledAt,
    link: 'https://app.grupotmseg.com.br/fornecedor/dhl?token=SIMULACAO_TOKEN_TESTE',
  });
  console.log('[TESTE] 1/2 enviado.');

  console.log('[TESTE] Enviando 2/2 — notificação de preenchimento...');
  await sendDhlIntakeSubmittedEmail({
    to: 'operacional@grupotmseg.com.br',
    providerName: baseInfo.providerName,
    osNumber: baseInfo.osNumber,
    seNumber: baseInfo.seNumber,
    origin: baseInfo.origin,
    destination: baseInfo.destination,
    scheduledAt: baseInfo.scheduledAt,
    agent1: {
      nome: 'JOÃO DA SILVA SIMULADO',
      cpf: '123.456.789-00',
      rg: '12.345.678-9',
      orgao_emissor: 'SSP/SP',
      cnh: '01234567890',
      cnh_categoria: 'AB',
      cnh_vencimento: '2028-03-15',
      cnv_numero: 'CNV-998877',
      cnv_validade: '2027-06-30',
      rua: 'Rua das Acácias',
      numero: '123',
      complemento: 'Apto 45',
      bairro: 'Centro',
      cidade: 'Campinas',
      uf: 'SP',
      cep: '13010-001',
      celular: '(19) 98765-4321',
      admissao: '2023-02-01',
    },
    agent2: {
      nome: 'MARIA APARECIDA SIMULADA',
      cpf: '987.654.321-00',
      rg: '98.765.432-1',
      orgao_emissor: 'SSP/SP',
      cnh: '09876543210',
      cnh_categoria: 'B',
      cnh_vencimento: '2027-11-20',
      cnv_numero: 'CNV-112233',
      cnv_validade: '2027-12-31',
      rua: 'Av. Brasil',
      numero: '500',
      complemento: '',
      bairro: 'Jardim Europa',
      cidade: 'Valinhos',
      uf: 'SP',
      cep: '13270-100',
      celular: '(19) 99876-5432',
      admissao: '2022-08-15',
    },
    vehicle: {
      placa: 'BRA2E19',
      renavam: '12345678901',
      marca: 'Chevrolet',
      modelo: 'Onix Plus',
      ano: '2023',
      cor: 'Prata',
      tecnologia: 'OMNILINK',
      id_rastreador: 'OMN-998877',
      comunicacao: 'Satelital + GPRS',
    },
  });
  console.log('[TESTE] 2/2 enviado.');
  console.log('[TESTE] ✔ Simulação concluída — verifique a caixa de operacional@grupotmseg.com.br');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('[TESTE] ERRO:', e);
  process.exit(1);
});
