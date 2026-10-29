import Fuse from "fuse.js";
import type { Patient } from "./dataStore";

export type CampoBusca = "name" | "mother" | "address";

export type PacienteIndexado = { paciente: Patient; name: string; mother: string; address: string };

export type IndicePacientes = Fuse<PacienteIndexado>;

export function textoBusca(valor?: string | null) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function criarIndicePacientes(pacientes: Patient[]): IndicePacientes {
  const registros = pacientes.map((paciente) => ({
    paciente,
    name: textoBusca(paciente.name),
    mother: textoBusca(paciente.mother),
    address: textoBusca(paciente.address),
  }));
  return new Fuse(registros, {
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 3,
    shouldSort: true,
    threshold: 0.4,
    keys: [
      { name: "name", weight: 3 },
      { name: "mother", weight: 2 },
      { name: "address", weight: 1 },
    ],
  });
}

export function buscaDifusa(indice: IndicePacientes, termo: string, campo: CampoBusca, limite = 40): Patient[] {
  const consulta = textoBusca(termo);
  if (consulta.length < 3) return [];
  const vistos = new Set<string>();
  const saida: Patient[] = [];
  for (const resultado of indice.search(consulta)) {
    if (!resultado.matches?.some((match) => match.key === campo)) continue;
    const paciente = resultado.item.paciente;
    if (vistos.has(paciente.id)) continue;
    vistos.add(paciente.id);
    saida.push(paciente);
    if (saida.length >= limite) break;
  }
  return saida;
}
