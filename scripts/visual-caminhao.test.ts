import assert from "node:assert/strict";
import test from "node:test";
import { resolverLogoCliente, resolverVisualCaminhao } from "../lib/os/visualCaminhao.ts";

test("marca DHL, CEVA e IBL pelo nome do cliente", () => {
  assert.equal(resolverVisualCaminhao("DHL SUPPLY CHAIN").tema, "dhl");
  assert.equal(resolverVisualCaminhao("CEVA Logistics").tema, "ceva");
  assert.equal(resolverVisualCaminhao("IBL Logistica").tema, "ibl");
  assert.equal(resolverVisualCaminhao("DHL").logo, "/logo-dhl.svg");
});

test("cliente sem marca autorizada usa o caminhão genérico, sem placa", () => {
  const visual = resolverVisualCaminhao("INTERMODAL BRASIL LOGISTICA S.A.");
  assert.equal(visual.tema, "tmseg");
  assert.equal(visual.logo, null);
  assert.equal("placa" in visual, false);
});
test("troca o nome do cliente pelo logotipo conhecido", () => {
  assert.equal(resolverLogoCliente("DHL SUPPLY CHAIN (BRAZIL) LTDA"), "/logo-dhl.svg");
  assert.equal(resolverLogoCliente("CEVA LOGISTICS LTDA"), "/logo-ceva.png");
  assert.equal(resolverLogoCliente("COMOLLATI | BR AUTOPARTS"), "/logos-clientes/brautoparts-sem-fundo.png");
  assert.equal(resolverLogoCliente("FLASH COURIER"), "/logos-clientes/flash-sem-fundo.png");
  assert.equal(resolverLogoCliente("CESLOG"), "/logos-clientes/ceslog-sem-fundo.png");
  assert.equal(resolverLogoCliente("INTERMODAL BRASIL LOGISTICA S.A."), null);
});
