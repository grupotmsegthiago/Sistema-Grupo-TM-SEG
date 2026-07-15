import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { credsFromRow } from "../lib/whatsappLiteApi.js";
import type { InstanceRow } from "../lib/whatsappLiteApi.js";

describe("credsFromRow", () => {
  const keys = [
    "ZAPI_MOBILE_ID",
    "ZAPI_MOBILE_TOKEN",
    "ZAPI_INSTANCE_ID",
    "ZAPI_TOKEN",
    "ZAPI_INSTANCE_TYPE",
    "ZAPI_CLIENT_TOKEN",
    "VITE_ZAPI_CLIENT_TOKEN",
  ] as const;

  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = process.env[k];

  function restore() {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }

  const baseRow = {
    id: "row-1",
    slug: "central",
    label: "Monitoramento 24h",
    provider: "zapi",
    instance_type: "mobile",
    zapi_instance_id: "OLD-DB-ID",
    zapi_token: "OLD-DB-TOK",
    zapi_client_token: "DB-CLIENT",
    meta_phone_number_id: null,
    meta_access_token: null,
    meta_api_version: null,
    official_ddi: "55",
    official_phone: "11926839456",
    is_default: true,
    enabled: true,
    last_checked_at: null,
    last_connected: null,
    last_connected_phone: null,
    phone_matches_official: null,
    last_error: null,
    last_heartbeat_at: null,
    last_qr_base64: null,
    last_connected_at: null,
    last_status_raw: null,
    created_at: "",
    updated_at: "",
  } satisfies InstanceRow;

  it("WEB explícito na Vercel vence sobre credenciais mobile antigas no Supabase", () => {
    delete process.env.ZAPI_MOBILE_ID;
    delete process.env.ZAPI_MOBILE_TOKEN;
    process.env.ZAPI_INSTANCE_ID = "WEB-ENV-ID";
    process.env.ZAPI_TOKEN = "WEB-ENV-TOK";
    process.env.ZAPI_INSTANCE_TYPE = "web";
    delete process.env.ZAPI_CLIENT_TOKEN;

    const creds = credsFromRow(baseRow);
    assert.ok(creds);
    assert.equal(creds!.instance, "WEB-ENV-ID");
    assert.equal(creds!.token, "WEB-ENV-TOK");
    assert.equal(creds!.type, "web");
    assert.equal(creds!.clientToken, "DB-CLIENT");
    restore();
  });

  it("prioriza ZAPI_CLIENT_TOKEN do env sobre banco", () => {
    delete process.env.ZAPI_MOBILE_ID;
    delete process.env.ZAPI_MOBILE_TOKEN;
    process.env.ZAPI_INSTANCE_ID = "WEB-ENV-ID";
    process.env.ZAPI_TOKEN = "WEB-ENV-TOK";
    process.env.ZAPI_INSTANCE_TYPE = "web";
    process.env.ZAPI_CLIENT_TOKEN = "ENV-CLIENT";

    const creds = credsFromRow(baseRow);
    assert.equal(creds?.clientToken, "ENV-CLIENT");
    restore();
  });

  it("aceita VITE_ZAPI_CLIENT_TOKEN como fallback no servidor", () => {
    delete process.env.ZAPI_MOBILE_ID;
    delete process.env.ZAPI_MOBILE_TOKEN;
    process.env.ZAPI_INSTANCE_ID = "WEB-ENV-ID";
    process.env.ZAPI_TOKEN = "WEB-ENV-TOK";
    process.env.ZAPI_INSTANCE_TYPE = "web";
    delete process.env.ZAPI_CLIENT_TOKEN;
    process.env.VITE_ZAPI_CLIENT_TOKEN = "VITE-CLIENT";

    const creds = credsFromRow(baseRow);
    assert.equal(creds?.clientToken, "VITE-CLIENT");
    restore();
  });
});
