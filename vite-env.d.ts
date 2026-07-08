/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_WDAPI_TOKEN?: string;
  readonly VITE_ZAPI_INSTANCE_ID?: string;
  readonly VITE_ZAPI_TOKEN?: string;
  readonly VITE_ZAPI_CLIENT_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __TMSEG_BUILD_ID__: string;
declare const __TMSEG_BUILD_VERSION__: string;
