// GUARDA ANTI-REGRESSÃO: hooks do React usados sem `import ... from 'react'`.
//
// Contexto (incidente real já registrado no projeto): com o Automatic JSX
// Runtime (Vite + @vitejs/plugin-react) o JSX compila SEM `import React`, mas os
// HOOKS (useState/useEffect/...) continuam sendo funções que PRECISAM ser
// importadas explicitamente. Se o import some, o `vite build` passa, mas a tela
// quebra em produção com "useState is not defined", derrubando toda a árvore de
// componentes daquela página (React 18 desmonta a raiz em erro de render).
//
// Este teste varre o código-fonte ATIVO (components/, lib/, src/, App.tsx,
// index.tsx) e falha se algum arquivo usar um hook do React sem importar de
// 'react'. Assim o erro é barrado no `scripts/run-tests.sh` antes do deploy.
//
// Rodar:  npx tsx --test scripts/react-hooks-import.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Apenas o código que realmente vai para o bundle/produção.
const ACTIVE_DIRS = ['components', 'lib', 'src'];
const ACTIVE_ROOT_FILES = ['App.tsx', 'index.tsx'];
// Cópias/backups e áreas fora do build principal.
const EXCLUDED_SEGMENTS = [
  'attached_assets',
  'motor-calculo-padrao',
  'export_relatorio',
  'artifacts',
  'node_modules',
  'dist',
  'dist-reports',
];

// Hooks embutidos do React (chamados como função). Não inclui hooks custom
// (useAlgumaCoisa) para evitar falsos positivos com hooks importados de libs.
const HOOK_CALL = /\buse(State|Effect|Ref|Callback|Memo|Reducer|LayoutEffect|Context|ImperativeHandle|Transition|DeferredValue|Id|SyncExternalStore|InsertionEffect)\s*\(/;
const REACT_IMPORT = /from\s+['"]react['"]/;

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (EXCLUDED_SEGMENTS.some((seg) => full.includes(`/${seg}/`) || full.endsWith(`/${seg}`))) {
      continue;
    }
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, out);
    } else if (name.endsWith('.tsx') || name.endsWith('.ts')) {
      out.push(full);
    }
  }
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const d of ACTIVE_DIRS) {
    const base = join(ROOT, d);
    if (existsSync(base)) walk(base, files);
  }
  for (const f of ACTIVE_ROOT_FILES) {
    const p = join(ROOT, f);
    if (existsSync(p)) files.push(p);
  }
  return files;
}

test('nenhum componente ativo usa hooks do React sem importar de "react"', () => {
  const offenders: string[] = [];
  for (const file of collectFiles()) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (HOOK_CALL.test(src) && !REACT_IMPORT.test(src)) {
      offenders.push(relative(ROOT, file));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Arquivos usam hooks do React sem "import ... from 'react'" ` +
      `(quebra em produção com "useState is not defined"):\n  - ${offenders.join('\n  - ')}\n` +
      `Adicione o import (ex.: import React, { useState, useEffect } from 'react';).`,
  );
});
