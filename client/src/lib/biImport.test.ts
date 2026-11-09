import { describe, expect, it } from "vitest";
import { detectBiReport, ehArquivoBiTexto, mapBiRows, mergeBiPatients, parseBiCsv } from "./biImport";

// Layout sintético do relatório "Cadastro — Análise Detalhada" (11/2026).
// CPF e Nº CIDADÃO entraram em H/J e deslocaram as colunas seguintes.
const CABECALHO_S1 = [
  "ESTABELECIMENTO",
  "INE",
  "PROFISSIONAL RESPONSÁVEL",
  "DATA LANÇAMENTO",
  "DATA CADASTRO",
  "DATA ALTERAÇÃO",
  "ORIGEM DO CADASTRO",
  "CPF",
  "CNS",
  "Nº CIDADÃO",
  "NOME",
  "DN",
  "IDADE",
  "SEXO",
  "NOME DA MÃE",
  "CEP",
  "TIPO LOGRADOURO",
  "LOGRADOURO",
  "NÚMERO IMÓVEL",
  "COMPLEMENTO",
  "BAIRRO",
  "RESP. FAMILIAR?",
  "RESP. FAMILIAR CNS",
  "TRIA - OS ALIMENTOS ACABARAM ANTES...",
  "TRIA - VOCÊ COMEU APENAS ALGUNS...",
];

const LINHA_S1 = [
  "UNIDADE EXEMPLO",
  "0000000000000",
  "PROFISSIONAL EXEMPLO",
  "01/11/2026",
  "01/11/2026",
  "",
  "TESTE",
  "12345678901",
  "700000000000000",
  "999999",
  "PACIENTE EXEMPLO",
  "10/05/1990",
  "36",
  "F",
  "MAE EXEMPLO",
  "00000000",
  "RUA",
  "RUA DAS FLORES",
  "123",
  "CASA",
  "CENTRO",
  "NAO",
  "",
  "",
  "",
];

function tsv(cabecalho: string[], linha: string[]) {
  return [cabecalho, linha]
    .map((cells) => cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join("\t"))
    .join("\r\n");
}

describe("BI — layout 11/2026 do Cadastro — Análise Detalhada", () => {
  it("reconhece o relatório e lê CPF, Nº CIDADÃO, nome, nascimento, CNS e endereço", () => {
    const rows = parseBiCsv(tsv(CABECALHO_S1, LINHA_S1));
    expect(rows[0]).toHaveLength(25);
    expect(detectBiReport("Relatorio-de-Cadastros-Individuais-Cadastro-Analise-Detalhada.txt", rows)).toBe("s1");

    const [registro] = mapBiRows("s1", rows);
    expect(registro.nome).toBe("PACIENTE EXEMPLO");
    expect(registro.nascimento).toBe("1990-05-10");
    expect(registro.cns).toBe("700000000000000");
    expect(registro.cpf).toBe("12345678901");
    expect(registro.cadastro).toBe("999999");
    expect(registro.mae).toBe("MAE EXEMPLO");
    expect(registro.sexo).toBe("F");
    expect(registro.logradouro).toBe("Das Flores");
    expect(registro.numero).toBe("123");
  });

  it("leva o Nº CIDADÃO e o CPF para o paciente final", () => {
    const rows = parseBiCsv(tsv(CABECALHO_S1, LINHA_S1));
    const [paciente] = mergeBiPatients(mapBiRows("s1", rows));
    expect(paciente.id).toBe("700000000000000");
    expect(paciente.registration).toBe("999999");
    expect(paciente.cpf).toBe("12345678901");
    expect(paciente.address).toMatch(/Flores/i);
  });

  it("reconhece o relatório mesmo sem extensão no nome", () => {
    const rows = parseBiCsv(tsv(CABECALHO_S1, LINHA_S1));
    expect(detectBiReport("Relatorio-de-Cadastros-Individuais-Cadastro-Analise-Detalhada", rows)).toBe("s1");
  });

  it("aceita relatórios sem extensão e com extensões de texto", () => {
    expect(ehArquivoBiTexto("Relatorio-de-Cadastros-Individuais-Cadastro-Analise-Detalhada")).toBe(true);
    expect(ehArquivoBiTexto("Equipes")).toBe(true);
    expect(ehArquivoBiTexto("dados.csv")).toBe(true);
    expect(ehArquivoBiTexto("dados.tsv")).toBe(true);
    expect(ehArquivoBiTexto("dados.txt")).toBe(true);
    expect(ehArquivoBiTexto("dados.rar")).toBe(false);
    expect(ehArquivoBiTexto("dados.zip")).toBe(false);
    expect(ehArquivoBiTexto(".DS_Store")).toBe(false);
  });

  it("não confunde o tipo de logradouro com o número do imóvel", () => {
    const rows = parseBiCsv(tsv(CABECALHO_S1, LINHA_S1));
    const [registro] = mapBiRows("s1", rows);
    expect(registro.numero).not.toBe("RUA");
    expect(registro.numero).toBe("123");
  });
});
