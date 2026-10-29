import { describe, expect, it } from "vitest";
import type { Patient } from "./dataStore";
import { buscaDifusa, criarIndicePacientes, textoBusca } from "./patientSearch";

const pacientes: Patient[] = [
  { id: "1", name: "Caio Augusto do Amaral Conceição", mother: "Marta do Amaral Conceição", address: "Rua das Flores, 100" },
  { id: "2", name: "Maria da Silva", mother: "Joana da Silva", address: "Avenida Brasil, 25" },
  { id: "3", name: "João Pereira", mother: "Ana Pereira", address: "Rua das Flores, 120" },
];

const indice = criarIndicePacientes(pacientes);

describe("textoBusca", () => {
  it("remove acento, pontuação e espaço sobrando", () => {
    expect(textoBusca("  Conceição,  ")).toBe("conceicao");
    expect(textoBusca("RUA DAS  FLORES, 100")).toBe("rua das flores 100");
  });
});

describe("busca difusa por nome", () => {
  it("acha o paciente mesmo com a palavra DO faltando", () => {
    const resultado = buscaDifusa(indice, "CAIO AUGUSTO AMARAL CONCEICAO", "name");
    expect(resultado.map((paciente) => paciente.id)).toContain("1");
  });

  it("acha com acento no termo de busca", () => {
    const resultado = buscaDifusa(indice, "caio augusto conceição", "name");
    expect(resultado.map((paciente) => paciente.id)).toContain("1");
  });

  it("não devolve nada para um nome impossível", () => {
    expect(buscaDifusa(indice, "zzzqqqwwwxxxrrr", "name")).toHaveLength(0);
  });

  it("ordena os resultados do mais parecido para o menos parecido", () => {
    const resultado = buscaDifusa(indice, "maria da silva", "name");
    expect(resultado[0]?.id).toBe("2");
  });
});

describe("busca difusa por mãe e endereço", () => {
  it("acha pelo nome da mãe sem vazar para o nome do paciente", () => {
    const resultado = buscaDifusa(indice, "JOANA SILVA", "mother");
    expect(resultado.map((paciente) => paciente.id)).toEqual(["2"]);
  });

  it("acha pelo endereço sem o número", () => {
    const resultado = buscaDifusa(indice, "AVENIDA BRASIL 25", "address");
    expect(resultado.map((paciente) => paciente.id)).toContain("2");
  });

  it("ignora termos curtos demais", () => {
    expect(buscaDifusa(indice, "ca", "name")).toHaveLength(0);
  });
});
