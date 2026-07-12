import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getZapiMobileEnvCreds,
  hasExplicitZapiMobileEnv,
} from "../server/whatsapp/zapiMobileEnv";

describe("zapiMobileEnv", () => {
  const keys = [
    "ZAPI_MOBILE_ID",
    "ZAPI_MOBILE_TOKEN",
    "ZAPI_MOBILE_INSTANCIA",
    "ZAPI_INSTANCE_ID",
    "ZAPI_TOKEN",
    "ZAPI_CLIENT_TOKEN",
  ] as const;

  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = process.env[k];

  function restore() {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }

  it("hasExplicitZapiMobileEnv exige ZAPI_MOBILE_ID e ZAPI_MOBILE_TOKEN", () => {
    delete process.env.ZAPI_MOBILE_ID;
    delete process.env.ZAPI_MOBILE_TOKEN;
    assert.equal(hasExplicitZapiMobileEnv(), false);
    process.env.ZAPI_MOBILE_ID = "abc";
    process.env.ZAPI_MOBILE_TOKEN = "tok";
    assert.equal(hasExplicitZapiMobileEnv(), true);
    restore();
  });

  it("rótulo padrão é Monitoramento 24h quando ZAPI_MOBILE_INSTANCIA vazio", () => {
    process.env.ZAPI_MOBILE_ID = "MOBILE-ID";
    process.env.ZAPI_MOBILE_TOKEN = "MOBILE-TOK";
    delete process.env.ZAPI_MOBILE_INSTANCIA;
    const c = getZapiMobileEnvCreds();
    assert.ok(c);
    assert.equal(c!.label, "Monitoramento 24h");
    restore();
  });

  it("getZapiMobileEnvCreds prioriza ZAPI_MOBILE_* e rótulo ZAPI_MOBILE_INSTANCIA", () => {
    process.env.ZAPI_MOBILE_ID = "MOBILE-ID";
    process.env.ZAPI_MOBILE_TOKEN = "MOBILE-TOK";
    process.env.ZAPI_MOBILE_INSTANCIA = "Central Torres";
    process.env.ZAPI_INSTANCE_ID = "LEGACY";
    process.env.ZAPI_TOKEN = "LEG-TOK";
    const c = getZapiMobileEnvCreds();
    assert.ok(c);
    assert.equal(c!.instanceId, "MOBILE-ID");
    assert.equal(c!.token, "MOBILE-TOK");
    assert.equal(c!.label, "Central Torres");
    assert.equal(c!.explicitMobileEnv, true);
    restore();
  });

  it("fallback legado ZAPI_INSTANCE_ID quando mobile vazio", () => {
    delete process.env.ZAPI_MOBILE_ID;
    delete process.env.ZAPI_MOBILE_TOKEN;
    process.env.ZAPI_INSTANCE_ID = "LEG-ID";
    process.env.ZAPI_TOKEN = "LEG-TOK";
    const c = getZapiMobileEnvCreds();
    assert.ok(c);
    assert.equal(c!.instanceId, "LEG-ID");
    assert.equal(c!.explicitMobileEnv, false);
    restore();
  });
});
