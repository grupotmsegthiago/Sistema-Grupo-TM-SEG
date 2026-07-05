#!/bin/bash
# Runner único dos testes do projeto.
#
# - Testes server-side (e-mails, classificação DHL, etc.): rodam direto no tsx.
# - Testes de componente React (*.test.tsx): precisam do loader de assets
#   (scripts/test-loaders/register.mjs) para que imports de imagem (.png/.svg…)
#   virem stubs, já que o bundler do Vite não está presente em ambiente de teste.
set -e

echo "▶ Testes server-side (*.test.ts)"
npx tsx --test scripts/*.test.ts

echo
echo "▶ Testes de componente React (*.test.tsx)"
node --import tsx --import ./scripts/test-loaders/register.mjs --test scripts/*.test.tsx
