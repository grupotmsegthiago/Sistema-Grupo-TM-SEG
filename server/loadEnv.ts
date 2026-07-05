import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  try {
    loadEnvFile(envPath);
  } catch {
    // .env ausente ou inválido — segue com variáveis do ambiente
  }
}
