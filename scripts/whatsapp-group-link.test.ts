import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isGroupLinkCommand,
  parseGroupLinkCommand,
  payloadAddressesBot,
  resolveInboundGroupId,
} from "../server/whatsapp/groupLinkCommand";

describe("comando vínculo de grupo WhatsApp", () => {
  it("parseia cadastra este grupo no cliente", () => {
    const p = parseGroupLinkCommand("@monitoramento cadastra este grupo no cliente INTERMODAL BRASIL");
    assert.deepEqual(p, { kind: "client", name: "INTERMODAL BRASIL" });
    assert.equal(isGroupLinkCommand("@monitoramento cadastra este grupo no cliente IBL"), true);
  });

  it("parseia vincula grupo no fornecedor", () => {
    const p = parseGroupLinkCommand("@5511926839456 vincula grupo no fornecedor CTS");
    assert.deepEqual(p, { kind: "provider", name: "CTS" });
  });

  it("parseia padrão invertido", () => {
    const p = parseGroupLinkCommand("cliente CESARI cadastra este grupo");
    assert.deepEqual(p, { kind: "client", name: "CESARI" });
  });

  it("ignora texto sem comando", () => {
    assert.equal(parseGroupLinkCommand("resumo operacional"), null);
    assert.equal(isGroupLinkCommand("bom dia pessoal"), false);
  });

  it("exige menção ao bot", () => {
    assert.equal(
      payloadAddressesBot({ isGroup: true }, "cadastra este grupo no cliente IBL"),
      false,
    );
    assert.equal(
      payloadAddressesBot({ isGroup: true }, "@monitoramento cadastra este grupo no cliente IBL"),
      true,
    );
    assert.equal(
      payloadAddressesBot({ mentionedMe: true }, "cadastra este grupo no cliente IBL"),
      true,
    );
    assert.equal(
      payloadAddressesBot({ mentioned: ["5511926839456"] }, "cadastra este grupo no cliente IBL"),
      true,
    );
  });

  it("resolve ID do grupo Z-API", () => {
    assert.equal(
      resolveInboundGroupId({ isGroup: true, phone: "120363378396715076-group" }),
      "120363378396715076-group",
    );
    assert.equal(
      resolveInboundGroupId({ isGroup: true, phone: "120363378396715076@g.us" }),
      "120363378396715076-group",
    );
  });
});
