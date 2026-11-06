import Fuse from "fuse.js";
import type { Patient } from "./dataStore";

export type CampoBusca = "name" | "mother" | "address";

const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e", "d"]);
const SUFIXOS = new Set(["junior", "filho", "neto", "sobrinho"]);

export type NomePreparado = {
  normalizado: string;
  tokens: string[];
  primeiro: string | null;
  ultimo: string | null;
};

export type PacienteIndexado = {
  paciente: Patient;
  name: string;
  mother: string;
  address: string;
  nomePreparado: NomePreparado;
};

export type IndicePacientes = {
  fuse: Fuse<PacienteIndexado>;
  registros: PacienteIndexado[];
};

export function textoBusca(valor?: string | null) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function prepararNomeDeTexto(normalizado: string): NomePreparado {
  const tokens = normalizado ? normalizado.split(" ").filter((token) => token && !CONECTORES.has(token)) : [];
  let ultimo: string | null = null;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (!SUFIXOS.has(tokens[index])) {
      ultimo = tokens[index];
      break;
    }
  }
  return {
    normalizado,
    tokens,
    primeiro: tokens[0] ?? null,
    ultimo: ultimo ?? tokens[tokens.length - 1] ?? null,
  };
}

export function prepararNome(valor?: string | null): NomePreparado {
  return prepararNomeDeTexto(textoBusca(valor));
}

function distanciaLevenshtein(primeiro: string, segundo: string) {
  if (primeiro === segundo) return 0;
  const anterior = Array.from({ length: segundo.length + 1 }, (_, index) => index);
  for (let linha = 1; linha <= primeiro.length; linha += 1) {
    let diagonal = anterior[0];
    anterior[0] = linha;
    for (let coluna = 1; coluna <= segundo.length; coluna += 1) {
      const anteriorColuna = anterior[coluna];
      anterior[coluna] = Math.min(
        anterior[coluna] + 1,
        anterior[coluna - 1] + 1,
        diagonal + (primeiro[linha - 1] === segundo[coluna - 1] ? 0 : 1),
      );
      diagonal = anteriorColuna;
    }
  }
  return anterior[segundo.length];
}

function pontuarToken(consulta: string, nome: string) {
  if (consulta === nome) return 1;
  if (consulta.length >= 3 && nome.startsWith(consulta)) return 0.88;
  if (nome.length >= 3 && consulta.startsWith(nome)) return 0.72;
  if (consulta.length >= 4 && consulta[0] === nome[0]) {
    const limite = consulta.length >= 8 ? 2 : 1;
    const distancia = distanciaLevenshtein(consulta, nome);
    if (distancia <= limite) return 1 - distancia / Math.max(consulta.length, nome.length);
  }
  return 0;
}

function pesosConsulta(tokens: string[]) {
  if (tokens.length === 1) return [1];
  return tokens.map((_, index) => index === 0 ? 1.2 : index === tokens.length - 1 ? 1.3 : 1);
}

type AvaliacaoNome = { score: number; exato: boolean; diferencaTokens: number };

function avaliarNome(nome: NomePreparado, consulta: NomePreparado): AvaliacaoNome | null {
  if (!nome.tokens.length || !consulta.tokens.length) return null;
  const pesos = pesosConsulta(consulta.tokens);
  let total = 0;
  let encontrados = 0;
  for (let index = 0; index < consulta.tokens.length; index += 1) {
    const tokenConsulta = consulta.tokens[index];
    let melhor = 0;
    for (const tokenNome of nome.tokens) {
      const pontuacao = pontuarToken(tokenConsulta, tokenNome);
      if (pontuacao > melhor) melhor = pontuacao;
      if (melhor === 1) break;
    }
    if (melhor <= 0) continue;
    encontrados += 1;
    total += melhor * pesos[index];
  }
  if (encontrados < consulta.tokens.length) return null;

  let score = total / pesos.reduce((soma, peso) => soma + peso, 0);
  const primeiroExato = nome.primeiro !== null && consulta.tokens.includes(nome.primeiro);
  const ultimoExato = nome.ultimo !== null && consulta.tokens.includes(nome.ultimo);
  if (primeiroExato) score += 0.12;
  if (ultimoExato) score += 0.18;
  if (primeiroExato && ultimoExato) score += 0.1;
  const exato = nome.normalizado === consulta.normalizado;
  if (exato) score += 0.25;
  const diferencaTokens = Math.abs(nome.tokens.length - consulta.tokens.length);
  score += Math.max(0, 0.03 - diferencaTokens * 0.006);
  return { score, exato, diferencaTokens };
}

export function buscaRanqueada(indice: IndicePacientes, termo: string, limite = 40): Patient[] {
  const consulta = prepararNome(termo);
  if (consulta.normalizado.length < 3 || !consulta.tokens.length || limite <= 0) return [];
  const resultados: Array<{ registro: PacienteIndexado; avaliacao: AvaliacaoNome }> = [];
  for (const registro of indice.registros) {
    const avaliacao = avaliarNome(registro.nomePreparado, consulta);
    if (avaliacao) resultados.push({ registro, avaliacao });
  }
  resultados.sort((primeiro, segundo) =>
    segundo.avaliacao.score - primeiro.avaliacao.score
    || Number(segundo.avaliacao.exato) - Number(primeiro.avaliacao.exato)
    || primeiro.avaliacao.diferencaTokens - segundo.avaliacao.diferencaTokens
    || primeiro.registro.paciente.name.localeCompare(segundo.registro.paciente.name, "pt-BR")
    || primeiro.registro.paciente.id.localeCompare(segundo.registro.paciente.id),
  );
  const vistos = new Set<string>();
  const saida: Patient[] = [];
  for (const resultado of resultados) {
    const paciente = resultado.registro.paciente;
    if (vistos.has(paciente.id)) continue;
    vistos.add(paciente.id);
    saida.push(paciente);
    if (saida.length >= limite) break;
  }
  return saida;
}

export function criarIndicePacientes(pacientes: Patient[]): IndicePacientes {
  const registros = pacientes.map((paciente) => {
    const name = textoBusca(paciente.name);
    return {
      paciente,
      name,
      mother: textoBusca(paciente.mother),
      address: textoBusca(paciente.address),
      nomePreparado: prepararNomeDeTexto(name),
    };
  });
  const fuse = new Fuse(registros, {
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
  return { fuse, registros };
}

export function buscaDifusa(indice: IndicePacientes, termo: string, campo: CampoBusca, limite = 40): Patient[] {
  const consulta = textoBusca(termo);
  if (consulta.length < 3) return [];
  const vistos = new Set<string>();
  const saida: Patient[] = [];
  for (const resultado of indice.fuse.search(consulta)) {
    if (!resultado.matches?.some((match) => match.key === campo)) continue;
    const paciente = resultado.item.paciente;
    if (vistos.has(paciente.id)) continue;
    vistos.add(paciente.id);
    saida.push(paciente);
    if (saida.length >= limite) break;
  }
  return saida;
}
