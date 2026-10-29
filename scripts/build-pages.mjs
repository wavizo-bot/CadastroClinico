// Gera o build de produção do app para o GitHub Pages em docs/app/.
//
// - Usa base /CadastroClinico/app/ para que assets, favicon, OCR e o WASM do
//   RAR resolvam dentro do subdiretório do Pages.
// - O build Android continua sendo gerado por `pnpm build` com base "/".
// - O resultado é o MESMO commit publicado (regra GH8.2); não editar à mão.
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const outDir = path.resolve(root, "docs", "app");
// O outDir do Vite é relativo ao `root` do config (client/). Passar caminho
// absoluto com espaço quebra no shell do Windows (CMD).
const outDirArg = path.relative(path.resolve(root, "client"), outDir);
const base = "/CadastroClinico/app/";

console.log(`[pages] vite build -> ${outDir} (base ${base})`);
execFileSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "vite", "build", `--base=${base}`, `--outDir=${outDirArg}`],
  { stdio: "inherit", cwd: root, shell: process.platform === "win32" },
);

console.log("[pages] ofuscando bundles de docs/app/assets");
execFileSync(
  process.execPath,
  [path.resolve(root, "scripts", "obfuscate-build.mjs"), path.join("docs", "app", "assets")],
  { stdio: "inherit", cwd: root },
);

console.log("[pages] concluído: docs/app/");
