import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, loadPersistedData, sanitizeData } from "./dataStore";

describe("dataStore — conversões e carga", () => {
  it("base64 ida e volta preserva bytes de tamanhos diferentes", () => {
    for (const tamanho of [0, 1, 64, 0x8000 - 1, 0x8000, 0x8000 + 1, 3 * 0x8000 + 7, 1_500_000]) {
      const original = new Uint8Array(tamanho);
      for (let i = 0; i < tamanho; i += 1) original[i] = (i * 31 + 7) % 256;
      const texto = bytesToBase64(original);
      const volta = base64ToBytes(texto);
      expect(volta.length).toBe(tamanho);
      expect(bytesToBase64(volta)).toBe(texto);
      if (tamanho <= 0x10000) expect(Array.from(volta)).toEqual(Array.from(original));
    }
  });

  it("bytesToBase64 bate com o btoa clássico byte a byte", () => {
    const original = new Uint8Array(200_000);
    for (let i = 0; i < original.length; i += 1) original[i] = (i * 17 + 3) % 256;
    let classico = "";
    original.forEach((byte) => { classico += String.fromCharCode(byte); });
    expect(bytesToBase64(original)).toBe(btoa(classico));
  });

  it("loadPersistedData sem IndexedDB devolve sem erro e sem dados", async () => {
    const resultado = await loadPersistedData();
    expect(resultado.erro).toBeNull();
    expect(resultado.dados).toBeNull();
  });

  it("sanitizeData mantém os pacientes e descarta os inválidos", () => {
    const limpo = sanitizeData({
      patients: [
        { id: "a", name: "MARIA LIMA" },
        { id: "", name: "SEM ID" },
        { id: "b", name: "" },
      ],
      territory: [],
      unitOperation: [],
    });
    expect(limpo.patients.map((patient) => patient.id)).toEqual(["a"]);
  });
});
