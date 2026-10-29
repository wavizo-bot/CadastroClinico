import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectBiReport, mapBiRows, mergeBiPatients, parseBiCsv } from "./biImport";
import { executarFaxina, FAXINA_GRUPOS } from "./faxina";

const pasta = path.resolve(process.cwd(), "..", "Banco de dados");
const arquivos = ["1cf2a.tsv", "2cf2a.tsv", "3cf2a.tsv", "4cf2a.tsv"];
const disponiveis = arquivos.filter((nome) => fs.existsSync(path.join(pasta, nome)));

describe.skipIf(!disponiveis.length)("Faxina com o banco real do BI", () => {
  it("processa os 15 mil cadastros com achados em todos os grupos", () => {
    const registros = [];
    for (const nome of disponiveis) {
      const texto = fs.readFileSync(path.join(pasta, nome), "latin1");
      const linhas = parseBiCsv(texto);
      const tipo = detectBiReport(nome, linhas);
      if (!tipo || tipo === "equipes") continue;
      registros.push(...mapBiRows(tipo, linhas));
    }
    const pacientes = mergeBiPatients(registros);
    expect(pacientes.length).toBeGreaterThan(10000);

    const inicio = performance.now();
    const resultado = executarFaxina(pacientes);
    const ms = performance.now() - inicio;
    const grupos = FAXINA_GRUPOS.filter((grupo) => resultado.resumo.porGrupo[grupo.id] > 0);
    const severidades = Object.entries(resultado.resumo.porSeveridade)
      .filter(([, total]) => total > 0)
      .map(([severidade, total]) => `${severidade}=${total}`)
      .join(" ");
    console.log(`[faxina real] pacientes=${pacientes.length} achados=${resultado.resumo.totalAchados} ms=${Math.round(ms)}`);
    console.log(`[faxina real] grupos=${grupos.map((grupo) => grupo.numero).join(",")} | ${severidades}`);
    const porRegra = new Map<string, number>();
    for (const achado of resultado.achados) porRegra.set(achado.regra, (porRegra.get(achado.regra) ?? 0) + 1);
    console.log(`[faxina real] regras=${Array.from(porRegra).map(([regra, total]) => `${regra}:${total}`).sort().join(" ")}`);
    for (const achado of resultado.achados.filter((item) => ["9.6", "9.7", "9.8", "9.9"].includes(item.regra))) {
      console.log(`[faxina real] ${achado.regra} -> ${achado.titulo}: ${achado.total} pacientes`);
    }
    expect(ms).toBeLessThan(20000);
    expect(resultado.resumo.totalAchados).toBeGreaterThan(0);
    expect(grupos.length).toBeGreaterThanOrEqual(3);
  }, 120000);
});
