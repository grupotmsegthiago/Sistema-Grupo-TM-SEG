#!/usr/bin/env python3
"""Converte Markdown em PDF com estilo profissional."""

import sys
from pathlib import Path

import markdown
from weasyprint import CSS, HTML

CSS_TEXT = """
@page {
  size: A4;
  margin: 2cm 2.2cm 2.2cm 2.2cm;
}
body {
  font-family: 'DejaVu Sans', Arial, Helvetica, sans-serif;
  font-size: 10.5pt;
  line-height: 1.45;
  color: #1a1a1a;
}
h1 {
  font-size: 16pt;
  color: #0d3b66;
  border-bottom: 2px solid #0d3b66;
  padding-bottom: 6px;
  margin-top: 0;
}
h2 {
  font-size: 12pt;
  color: #0d3b66;
  margin-top: 18px;
  border-bottom: 1px solid #ccc;
  padding-bottom: 4px;
}
h3 { font-size: 11pt; color: #333; margin-top: 14px; }
table {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0 14px;
  font-size: 9.5pt;
}
th, td {
  border: 1px solid #bbb;
  padding: 5px 8px;
  text-align: left;
  vertical-align: top;
}
th { background: #e8eef4; font-weight: bold; }
tr:nth-child(even) td { background: #f8f9fa; }
blockquote {
  border-left: 4px solid #0d3b66;
  margin: 10px 0;
  padding: 8px 14px;
  background: #f4f7fa;
  font-style: italic;
}
pre, code {
  font-family: 'DejaVu Sans Mono', monospace;
  font-size: 8.5pt;
  background: #f4f4f4;
}
pre {
  padding: 10px;
  border: 1px solid #ddd;
  white-space: pre-wrap;
}
hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
strong { color: #111; }
em { color: #444; }
"""

def main() -> int:
    if len(sys.argv) < 3:
        print("Uso: md-to-pdf.py <entrada.md> <saida.pdf>", file=sys.stderr)
        return 1

    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    if not src.exists():
        print(f"Arquivo não encontrado: {src}", file=sys.stderr)
        return 1

    md_text = src.read_text(encoding="utf-8")
    html_body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "nl2br"],
    )
    html_doc = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>{src.stem}</title></head>
<body>{html_body}</body>
</html>"""

    HTML(string=html_doc, base_url=str(src.parent)).write_pdf(
        str(dst),
        stylesheets=[CSS(string=CSS_TEXT)],
    )
    print(f"PDF gerado: {dst} ({dst.stat().st_size:,} bytes)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
