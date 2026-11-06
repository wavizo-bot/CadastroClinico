import { describe, expect, it } from "vitest";
import type { Patient } from "./dataStore";
import { buscaDifusa, buscaRanqueada, criarIndicePacientes, prepararNome, textoBusca } from "./patientSearch";

const pacientes: Patient[] = [
  { id: "1", name: "Caio Augusto do Amaral Conceição", mother: "Marta do Amaral Conceição", address: "Rua das Flores, 100" },
  { id: "2", name: "Maria da Silva", mother: "Joana da Silva", address: "Avenida Brasil, 25" },
  { id: "3", name: "João Pereira", mother: "Ana Pereira", address: "Rua das Flores, 120" },
];

const indice = criarIndicePacientes(pacientes);

const pacientesRanqueados: Patient[] = [
  { id: "alvo", name: "MARCELO ALVES DA COSTA EXEMPLO", mother: "Marta Alves Exemplo", address: "Rua Um, 10" },
  { id: "curto", name: "MARCELO EXEMPLO", mother: "Joana Exemplo", address: "Rua Dois, 20" },
  { id: "variante", name: "MARCELLO ALVES EXEMPLO", mother: "Ana Exemplo", address: "Rua Três, 30" },
  { id: "sufixo", name: "MARCELO ALVES DA COSTA EXEMPLO JUNIOR", mother: "Marta Alves Exemplo", address: "Rua Um, 11" },
  { id: "ruido", name: "GABRIEL MACEDO FICTICIO", mother: "Joana Ficticio", address: "Rua Quatro, 40" },
  { id: "maria", name: "MARIA EXEMPLO", mother: "Ana Exemplo", address: "Rua Cinco, 50" },
];

const indiceRanqueado = criarIndicePacientes(pacientesRanqueados);

describe("textoBusca", () => {
  it("remove acento, pontuação e espaço sobrando", () => {
    expect(textoBusca("  Conceição,  ")).toBe("conceicao");
    expect(textoBusca("RUA DAS  FLORES, 100")).toBe("rua das flores 100");
  });
});

describe("prepararNome", () => {
  it("ignora conectores e trata Júnior como sufixo, não como último sobrenome", () => {
    const preparado = prepararNome("Marcelo Alves da Costa Exemplo Júnior");
    expect(preparado.primeiro).toBe("marcelo");
    expect(preparado.ultimo).toBe("exemplo");
    expect(preparado.tokens).toEqual(["marcelo", "alves", "costa", "exemplo", "junior"]);
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

describe("busca ranqueada por nome", () => {
  it("encontra o nome com nomes do meio sem exigir a frase inteira", () => {
    const resultado = buscaRanqueada(indiceRanqueado, "Marcelo Exemplo");
    expect(resultado.slice(0, 3).map((paciente) => paciente.id)).toContain("alvo");
    expect(resultado.map((paciente) => paciente.id)).not.toContain("ruido");
  });

  it("tolera Marcello sem esconder o alvo e sem subir o nome parecido", () => {
    const resultado = buscaRanqueada(indiceRanqueado, "Marcello Exemplo");
    expect(resultado.slice(0, 3).map((paciente) => paciente.id)).toContain("alvo");
    expect(resultado.map((paciente) => paciente.id)).not.toContain("ruido");
  });

  it("funciona com o primeiro e o último nome invertidos", () => {
    const resultado = buscaRanqueada(indiceRanqueado, "Exemplo Marcelo");
    expect(resultado.slice(0, 3).map((paciente) => paciente.id)).toContain("alvo");
  });

  it("mantém o nome curto exato acima da variante longa", () => {
    const resultado = buscaRanqueada(indiceRanqueado, "Marcelo Exemplo");
    expect(resultado[0]?.id).toBe("curto");
  });

  it("coloca o alvo antes da variante com sufixo Júnior", () => {
    const resultado = buscaRanqueada(indiceRanqueado, "Marcelo Alves da Costa Exemplo");
    const posicaoAlvo = resultado.findIndex((paciente) => paciente.id === "alvo");
    const posicaoSufixo = resultado.findIndex((paciente) => paciente.id === "sufixo");
    expect(posicaoAlvo).toBeGreaterThanOrEqual(0);
    expect(posicaoSufixo).toBeGreaterThan(posicaoAlvo);
  });

  it("aceita prefixo de token", () => {
    const resultado = buscaRanqueada(indiceRanqueado, "Marcel Exempl");
    expect(resultado.map((paciente) => paciente.id)).toContain("alvo");
  });

  it("não devolve nada quando nenhum token bate", () => {
    expect(buscaRanqueada(indiceRanqueado, "zzz qqq")).toHaveLength(0);
  });

  it("não devolve nada quando a consulta só tem conectores", () => {
    expect(buscaRanqueada(indiceRanqueado, "de da")).toHaveLength(0);
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
