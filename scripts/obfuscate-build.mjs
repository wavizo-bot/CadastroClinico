// Ofusca os bundles JS do build de produção (dist/public/assets/*.js).
// Presença moderada de propósito: levanta a barreira de engenharia reversa
// (string array + base64 + self-defending) sem penalizar dispositivos fracos
// (sem control flow flattening nem dead code injection, que dobram/triplam o
// custo de CPU em runtime). Roda entre `vite build` e o build do servidor.
import pkg from "javascript-obfuscator";
import fs from "node:fs";
import path from "node:path";

const { obfuscate } = pkg;

// Diretório opcional (padrão: build Android/web em dist/public/assets).
// O build do GitHub Pages passa docs/app/assets explicitamente.
const DIR = path.resolve(process.argv[2] || path.join("dist", "public", "assets"));
if (!fs.existsSync(DIR)) {
  console.error("dist/public/assets não existe — rode `vite build` antes.");
  process.exit(1);
}

const OPCOES = {
  compact: true,
  controlFlowFlattening: false,
  controlFlowFlatteningThreshold: 0,
  deadCodeInjection: false,
  deadCodeInjectionThreshold: 0,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: "function",
  stringArrayThreshold: 1,
  numbersToExpressions: true,
  simplify: true,
  selfDefending: true,
  splitStrings: false,
  debugProtection: false,
  disableConsoleOutput: false,
  sourceMap: false,
  target: "browser",
  transformObjectKeys: false,
};

let total = 0;
for (const nome of fs.readdirSync(DIR)) {
  if (!nome.endsWith(".js")) continue;
  const arquivo = path.join(DIR, nome);
  const antes = fs.statSync(arquivo).size;
  const codigo = fs.readFileSync(arquivo, "utf8");
  const saida = obfuscate(codigo, OPCOES).getObfuscatedCode();
  fs.writeFileSync(arquivo, saida, "utf8");
  const depois = fs.statSync(arquivo).size;
  total += depois - antes;
  console.log(`  ${nome}: ${(antes / 1024).toFixed(0)} KB -> ${(depois / 1024).toFixed(0)} KB`);
}
console.log(`Ofuscação concluída (+${(total / 1024).toFixed(0)} KB no total).`);
