import { describe, expect, it } from "vitest";
import type { Patient } from "./dataStore";
import { executarFaxina, executarFaxinaComProgresso, type FaxinaProgresso } from "./faxina";

function paciente(id: string, extra: Partial<Patient> = {}): Patient {
  return { id, name: `PACIENTE ${id}`, ...extra };
}

const AMOSTRA: Patient[] = [
  paciente("a", { cpf: "52998224725", name: "JOAO SOUZA", mother: "MARIA SOUZA" }),
  paciente("b", { cpf: "52998224725", name: "JOAO SILVA", mother: "MARIA SOUZA" }),
  paciente("c", { name: "ANA LIMA", mother: "ROSA LIMA" }),
  paciente("d", { name: "ANA LIMA", mother: "ROSA LIMA" }),
];

describe("Faxina com progresso", () => {
  it("devolve o mesmo resultado da versão síncrona", async () => {
    const sincrono = executarFaxina(AMOSTRA);
    const avancos: FaxinaProgresso[] = [];
    const assincrono = await executarFaxinaComProgresso(AMOSTRA, (progresso) => avancos.push(progresso));
    expect(assincrono).not.toBeNull();
    expect(assincrono?.achados).toEqual(sincrono.achados);
    expect(assincrono?.resumo.porGrupo).toEqual(sincrono.resumo.porGrupo);
    expect(assincrono?.resumo.porSeveridade).toEqual(sincrono.resumo.porSeveridade);
    expect(avancos.length).toBeGreaterThan(0);
  });

  it("reporta etapas com porcentagem crescente", async () => {
    const avancos: FaxinaProgresso[] = [];
    const resultado = await executarFaxinaComProgresso(AMOSTRA, (progresso) => avancos.push(progresso));
    expect(resultado).not.toBeNull();
    expect(avancos.length).toBeGreaterThanOrEqual(3);
    expect(avancos.every((item) => item.etapa.trim().length > 0)).toBe(true);
    for (let indice = 1; indice < avancos.length; indice += 1) {
      expect(avancos[indice].pct).toBeGreaterThanOrEqual(avancos[indice - 1].pct);
    }
    expect(avancos[0].pct).toBeLessThan(50);
    expect(avancos[avancos.length - 1].pct).toBeGreaterThanOrEqual(90);
  });

  it("para de rodar quando o cancelamento é pedido", async () => {
    const avancos: FaxinaProgresso[] = [];
    const resultado = await executarFaxinaComProgresso(AMOSTRA, (progresso) => avancos.push(progresso), () => true);
    expect(resultado).toBeNull();
    expect(avancos.length).toBe(0);
  });

  it("processa um banco grande sem travar a chamada", async () => {
    const pacientes: Patient[] = [];
    for (let indice = 0; indice < 12000; indice += 1) {
      pacientes.push(paciente(`p${indice}`, { name: `NOME ${indice % 400}`, mother: `MAE ${indice % 250}` }));
    }
    const avancos: FaxinaProgresso[] = [];
    const resultado = await executarFaxinaComProgresso(pacientes, (progresso) => avancos.push(progresso));
    expect(resultado).not.toBeNull();
    expect(avancos.length).toBeGreaterThanOrEqual(5);
    expect(avancos[avancos.length - 1].pct).toBeGreaterThanOrEqual(90);
  }, 60000);
});
