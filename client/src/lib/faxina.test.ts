import { describe, expect, it } from "vitest";
import type { Patient } from "./dataStore";
import { executarFaxina, FAXINA_GRUPOS, ORDEM_SEVERIDADE, type FaxinaAchado, type FaxinaResultado } from "./faxina";

function paciente(id: string, extra: Partial<Patient> = {}): Patient {
  return { id, name: `PACIENTE ${id}`, ...extra };
}

function porRegra(resultado: FaxinaResultado, regra: string): FaxinaAchado[] {
  return resultado.achados.filter((achado) => achado.regra === regra);
}

function temRegra(resultado: FaxinaResultado, regra: string) {
  return resultado.achados.some((achado) => achado.regra === regra);
}

function cnsDe14(base: string) {
  let soma = 0;
  for (let indice = 0; indice < 14; indice += 1) soma += Number(base[indice]) * (15 - indice);
  const resto = soma % 11;
  let dv = 11 - resto;
  if (dv === 11) dv = 0;
  if (dv === 10) return null;
  return base + String(dv);
}

const CPF_VALIDO = "52998224725";
const CNS_VALIDO = cnsDe14("70075636534001") ?? "";

describe("Faxina — grupo 1: CPF", () => {
  it("marca CPF com dígito inválido (1.2)", () => {
    const r = executarFaxina([paciente("a", { cpf: "12345678901", name: "JOAO SOUZA" })]);
    const achados = porRegra(r, "1.2");
    expect(achados).toHaveLength(1);
    expect(achados[0].severidade).toBe("erro");
    expect(achados[0].ids).toEqual(["a"]);
  });

  it("marca CPF com todos os dígitos iguais (1.7)", () => {
    const r = executarFaxina([paciente("a", { cpf: "11111111111" })]);
    expect(temRegra(r, "1.7")).toBe(true);
    expect(temRegra(r, "1.2")).toBe(false);
  });

  it("marca mesmo CPF com nomes diferentes como fraude (1.3)", () => {
    const r = executarFaxina([
      paciente("a", { cpf: CPF_VALIDO, name: "JOAO SOUZA", birth: "1990-05-10" }),
      paciente("b", { cpf: CPF_VALIDO, name: "MARIA SOUZA", birth: "1988-02-02" }),
    ]);
    const achados = porRegra(r, "1.3");
    expect(achados).toHaveLength(1);
    expect(achados[0].severidade).toBe("fraude");
    expect(achados[0].ids).toEqual(["a", "b"]);
  });

  it("marca mesmo CPF com nascimento divergente (1.4)", () => {
    const r = executarFaxina([
      paciente("a", { cpf: CPF_VALIDO, name: "JOAO SOUZA", birth: "1990-05-10" }),
      paciente("b", { cpf: CPF_VALIDO, name: "JOAO SOUZA", birth: "1991-05-10" }),
    ]);
    expect(temRegra(r, "1.4")).toBe(true);
  });

  it("marca mesmo CPF em cadastros idênticos como duplicidade (1.8)", () => {
    const r = executarFaxina([
      paciente("a", { cpf: CPF_VALIDO, name: "JOAO SOUZA", mother: "ANA SOUZA", birth: "1990-05-10", address: "RUA A, 10" }),
      paciente("b", { cpf: CPF_VALIDO, name: "JOAO SOUZA", mother: "ANA SOUZA", birth: "1990-05-10", address: "RUA A, 10" }),
    ]);
    const achados = porRegra(r, "1.8");
    expect(achados).toHaveLength(1);
    expect(achados[0].severidade).toBe("duplicata");
  });

  it("marca mesmo CPF em três pacientes (1.6)", () => {
    const r = executarFaxina([
      paciente("a", { cpf: CPF_VALIDO, name: "JOAO SOUZA" }),
      paciente("b", { cpf: CPF_VALIDO, name: "MARIA SOUZA" }),
      paciente("c", { cpf: CPF_VALIDO, name: "PAULO SOUZA" }),
    ]);
    expect(temRegra(r, "1.6")).toBe(true);
    expect(porRegra(r, "1.6")[0].ids).toHaveLength(3);
  });
});

describe("Faxina — grupo 2: CNS", () => {
  it("marca CNS com tamanho errado (2.1)", () => {
    const r = executarFaxina([paciente("a", { cns: "12345" })]);
    expect(temRegra(r, "2.1")).toBe(true);
  });

  it("marca CNS com dígito inválido (2.2)", () => {
    const invalido = CNS_VALIDO.slice(0, 14) + String((Number(CNS_VALIDO[14]) + 1) % 10);
    const r = executarFaxina([paciente("a", { cns: invalido })]);
    expect(temRegra(r, "2.2")).toBe(true);
    const valido = executarFaxina([paciente("b", { cns: CNS_VALIDO })]);
    expect(temRegra(valido, "2.2")).toBe(false);
  });

  it("marca mesmo CNS com nomes diferentes (2.3)", () => {
    const r = executarFaxina([
      paciente("a", { cns: CNS_VALIDO, name: "JOAO SOUZA" }),
      paciente("b", { cns: CNS_VALIDO, name: "MARIA LIMA" }),
    ]);
    expect(porRegra(r, "2.3")[0]?.severidade).toBe("fraude");
  });

  it("marca paciente com dois CNS (2.7)", () => {
    const segundo = cnsDe14("70075636534002") ?? CNS_VALIDO;
    const r = executarFaxina([paciente("a", { cns: CNS_VALIDO, cnsTodos: [CNS_VALIDO, segundo] })]);
    expect(temRegra(r, "2.7")).toBe(true);
  });
});

describe("Faxina — grupo 3: cadastro", () => {
  it("marca cadastro com letra (3.1)", () => {
    const r = executarFaxina([paciente("a", { registration: "AB123" })]);
    expect(temRegra(r, "3.1")).toBe(true);
  });

  it("marca mesmo cadastro com nomes diferentes (3.2)", () => {
    const r = executarFaxina([
      paciente("a", { registration: "12345", name: "JOAO SOUZA" }),
      paciente("b", { registration: "12345", name: "MARIA LIMA" }),
    ]);
    expect(porRegra(r, "3.2")[0]?.severidade).toBe("fraude");
  });

  it("marca mesmo cadastro idêntico como duplicidade (3.4)", () => {
    const r = executarFaxina([
      paciente("a", { registration: "12345", name: "JOAO SOUZA", mother: "ANA SOUZA", birth: "1990-01-01" }),
      paciente("b", { registration: "12345", name: "JOAO SOUZA", mother: "ANA SOUZA", birth: "1990-01-01" }),
    ]);
    expect(temRegra(r, "3.4")).toBe(true);
  });
});

describe("Faxina — grupo 4: cruzamentos", () => {
  it("marca CPF repetido no campo CNS (4.1)", () => {
    const r = executarFaxina([paciente("a", { cpf: CPF_VALIDO, cns: CPF_VALIDO })]);
    expect(temRegra(r, "4.1")).toBe(true);
    expect(temRegra(r, "2.1")).toBe(true);
  });

  it("marca mesmo telefone em três pacientes de endereços diferentes (4.8)", () => {
    const r = executarFaxina([
      paciente("a", { phone: "11999990001", name: "JOAO SOUZA", address: "RUA A, 10" }),
      paciente("b", { phone: "11999990001", name: "MARIA LIMA", address: "RUA B, 20" }),
      paciente("c", { phone: "11999990001", name: "PAULO SILVA", address: "RUA C, 30" }),
    ]);
    const achados = porRegra(r, "4.8");
    expect(achados).toHaveLength(1);
    expect(achados[0].severidade).toBe("coincidencia");
  });

  it("não marca telefone da mesma família no mesmo endereço (4.8)", () => {
    const r = executarFaxina([
      paciente("a", { phone: "11999990001", name: "JOAO SOUZA", address: "RUA A, 10" }),
      paciente("b", { phone: "11999990001", name: "MARIA SOUZA", address: "RUA A, 10" }),
      paciente("c", { phone: "11999990001", name: "PAULO SOUZA", address: "RUA A, 10" }),
    ]);
    expect(temRegra(r, "4.8")).toBe(false);
  });

  it("marca mesmo nome, mãe e endereço com documentos diferentes (4.6)", () => {
    const r = executarFaxina([
      paciente("a", { name: "JOAO SOUZA", mother: "ANA SOUZA", address: "RUA A, 10", cpf: "52998224725" }),
      paciente("b", { name: "JOAO SOUZA", mother: "ANA SOUZA", address: "RUA A, 10", cpf: "11144477735" }),
    ]);
    expect(temRegra(r, "4.6")).toBe(true);
  });
});

describe("Faxina — grupo 5: identificador + demografia", () => {
  it("marca mesmo CPF com mãe divergente (5.1)", () => {
    const r = executarFaxina([
      paciente("a", { cpf: CPF_VALIDO, name: "JOAO SOUZA", mother: "ANA SOUZA", address: "RUA A, 10", birth: "1990-01-01" }),
      paciente("b", { cpf: CPF_VALIDO, name: "JOAO SOUZA", mother: "MARIA LIMA", address: "RUA A, 10", birth: "1990-01-01" }),
    ]);
    expect(temRegra(r, "5.1")).toBe(true);
  });

  it("marca mesmo CPF com endereços diferentes (5.3)", () => {
    const r = executarFaxina([
      paciente("a", { cpf: CPF_VALIDO, name: "JOAO SOUZA", mother: "ANA SOUZA", address: "RUA A, 10", birth: "1990-01-01" }),
      paciente("b", { cpf: CPF_VALIDO, name: "JOAO SOUZA", mother: "ANA SOUZA", address: "RUA B, 20", birth: "1990-01-01" }),
    ]);
    const achados = porRegra(r, "5.3");
    expect(achados).toHaveLength(1);
    expect(achados[0].severidade).toBe("coincidencia");
  });
});

describe("Faxina — grupo 6: similaridade", () => {
  it("marca mesmo nome com nascimento de 1 dia de diferença (6.1)", () => {
    const r = executarFaxina([
      paciente("a", { name: "JOAO SOUZA", birth: "1990-05-10" }),
      paciente("b", { name: "JOAO SOUZA", birth: "1990-05-11" }),
    ]);
    expect(temRegra(r, "6.1")).toBe(true);
  });

  it("marca CPF com 1 dígito diferente e mesmo nome (6.6)", () => {
    const r = executarFaxina([
      paciente("a", { name: "JOAO SOUZA", cpf: "52998224725", address: "RUA A, 10" }),
      paciente("b", { name: "JOAO SOUZA", cpf: "52998224726", address: "RUA B, 20" }),
    ]);
    const achados = porRegra(r, "6.6");
    expect(achados).toHaveLength(1);
    expect(achados[0].severidade).toBe("erro");
  });

  it("marca nomes parecidos com CPF de 1 dígito diferente como fraude (6.7)", () => {
    const r = executarFaxina([
      paciente("a", { name: "JOAO SOUZA", cpf: "52998224725", address: "RUA A, 10" }),
      paciente("b", { name: "JOAO SOUZ", cpf: "52998224726", address: "RUA B, 20" }),
    ]);
    expect(porRegra(r, "6.7")[0]?.severidade).toBe("fraude");
  });
});

describe("Faxina — grupo 7: fonética", () => {
  it("marca VITOR e VICTOR com a mesma data (7.1)", () => {
    const r = executarFaxina([
      paciente("a", { name: "VITOR DA SILVA", birth: "1990-05-10", address: "RUA A, 10" }),
      paciente("b", { name: "VICTOR DA SILVA", birth: "1990-05-10", address: "RUA B, 20" }),
    ]);
    expect(temRegra(r, "7.1")).toBe(true);
  });

  it("marca SILVA e SYLVA no mesmo endereço (7.2)", () => {
    const r = executarFaxina([
      paciente("a", { name: "MARIA SILVA", birth: "1990-05-10", address: "RUA A, 10" }),
      paciente("b", { name: "MARIA SYLVA", birth: "1991-06-11", address: "RUA A, 10" }),
    ]);
    expect(temRegra(r, "7.2")).toBe(true);
  });
});

describe("Faxina — grupo 8: inversão e fragmentação", () => {
  it("marca nome com as palavras invertidas (8.1)", () => {
    const r = executarFaxina([
      paciente("a", { name: "JOAO PEDRO", mother: "ANA SOUZA", birth: "1990-05-10" }),
      paciente("b", { name: "PEDRO JOAO", mother: "ANA SOUZA", birth: "1991-06-11" }),
    ]);
    expect(temRegra(r, "8.1")).toBe(true);
  });

  it("marca nome cortado no mesmo endereço (8.2)", () => {
    const r = executarFaxina([
      paciente("a", { name: "JOAO PEDRO SOUZA", address: "RUA A, 10", birth: "1990-05-10" }),
      paciente("b", { name: "JOAO PEDRO", address: "RUA A, 10", birth: "1990-05-10" }),
    ]);
    expect(temRegra(r, "8.2")).toBe(true);
  });

  it("marca CPF e CNS trocados de campo (8.5)", () => {
    const r = executarFaxina([paciente("a", { cpf: CNS_VALIDO, cns: CPF_VALIDO })]);
    expect(temRegra(r, "8.5")).toBe(true);
  });

  it("marca o próprio nome repetido no campo da mãe (8.4)", () => {
    const r = executarFaxina([paciente("a", { name: "MARIA LIMA", mother: "MARIA LIMA" })]);
    const achados = porRegra(r, "8.4");
    expect(achados).toHaveLength(1);
    expect(achados[0].ids).toEqual(["a"]);
  });

  it("marca mãe e paciente trocados entre dois cadastros (8.4)", () => {
    const r = executarFaxina([
      paciente("a", { name: "ANA LIMA", mother: "BIA SOUZA", address: "RUA A, 10" }),
      paciente("b", { name: "BIA SOUZA", mother: "ANA LIMA", address: "RUA A, 10" }),
    ]);
    const achados = porRegra(r, "8.4");
    expect(achados).toHaveLength(1);
    expect(achados[0].ids).toEqual(["a", "b"]);
  });
});

describe("Faxina — grupo 9: estatísticas", () => {
  it("marca nascimento no futuro (9.1)", () => {
    const r = executarFaxina([paciente("a", { birth: "2999-01-01" })]);
    expect(temRegra(r, "9.1")).toBe(true);
  });

  it("agrupa cadastros sem CPF em um só achado (9.7)", () => {
    const r = executarFaxina([paciente("a"), paciente("b"), paciente("c")]);
    const achados = porRegra(r, "9.7");
    expect(achados).toHaveLength(1);
    expect(achados[0].severidade).toBe("incompleto");
    expect(achados[0].total).toBe(3);
    expect(achados[0].ids).toHaveLength(3);
  });

  it("marca homônimos (9.10)", () => {
    const r = executarFaxina([
      paciente("a", { name: "MARIA LIMA", birth: "1990-01-01" }),
      paciente("b", { name: "MARIA LIMA", birth: "1975-07-07" }),
    ]);
    const achados = porRegra(r, "9.10");
    expect(achados).toHaveLength(1);
    expect(achados[0].ids).toEqual(["a", "b"]);
  });
});

describe("Faxina — pipeline e resumo", () => {
  it("ordena os achados por severidade", () => {
    const r = executarFaxina([
      paciente("a", { cpf: "12345678901", name: "JOAO SOUZA" }),
      paciente("b", { cpf: CPF_VALIDO, name: "MARIA LIMA" }),
      paciente("c", { cpf: CPF_VALIDO, name: "PAULO SILVA" }),
    ]);
    const ordens = r.achados.map((achado) => ORDEM_SEVERIDADE.indexOf(achado.severidade));
    expect(ordens).toEqual([...ordens].sort((x, y) => x - y));
    expect(r.achados[0].severidade).toBe("fraude");
  });

  it("soma os grupos e as severidades no resumo", () => {
    const r = executarFaxina([
      paciente("a", { cpf: CPF_VALIDO, name: "JOAO SOUZA", mother: "ANA SOUZA", birth: "1990-05-10", address: "RUA A, 10" }),
      paciente("b", { cpf: CPF_VALIDO, name: "MARIA LIMA", mother: "JOSE LIMA", birth: "1988-02-02", address: "RUA B, 20" }),
    ]);
    const somaGrupos = FAXINA_GRUPOS.reduce((total, grupo) => total + r.resumo.porGrupo[grupo.id], 0);
    const somaSeveridades = ORDEM_SEVERIDADE.reduce((total, severidade) => total + r.resumo.porSeveridade[severidade], 0);
    expect(somaGrupos).toBe(r.resumo.totalAchados);
    expect(somaSeveridades).toBe(r.resumo.totalAchados);
    expect(r.resumo.totalPacientes).toBe(2);
    expect(r.resumo.ordemPipeline.reduce((total, item) => total + item.total, 0)).toBe(r.resumo.totalAchados);
  });

  it("não quebra com banco vazio", () => {
    const r = executarFaxina([]);
    expect(r.achados).toHaveLength(0);
    expect(r.resumo.totalAchados).toBe(0);
  });

  it("processa 15 mil cadastros em tempo hábil", () => {
    const pacientes: Patient[] = Array.from({ length: 15000 }, (_, indice) => ({
      id: `p${indice}`,
      name: `NOME${indice % 9000} SOBRENOME${indice % 700}`,
      mother: `MAE${indice % 8000} SOBRENOME${indice % 500}`,
      address: `RUA DAS FLORES, ${indice}`,
      birth: `19${50 + (indice % 50)}-${String(1 + (indice % 12)).padStart(2, "0")}-${String(1 + (indice % 28)).padStart(2, "0")}`,
      registration: String(100000 + indice),
      cpf: String(10000000000 + indice),
    }));
    const inicio = performance.now();
    const r = executarFaxina(pacientes);
    const ms = performance.now() - inicio;
    console.log(`[faxina sintético] pacientes=${pacientes.length} achados=${r.resumo.totalAchados} ms=${Math.round(ms)}`);
    expect(r.resumo.totalPacientes).toBe(15000);
    expect(ms).toBeLessThan(15000);
  }, 60000);
});
