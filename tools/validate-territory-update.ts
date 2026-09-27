import { territorySeed } from "../client/src/lib/territorySeed";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function find(street: string, number?: string) {
  return territorySeed.find((entry) => entry.street === street && (!number || (entry.rangeStart === number && entry.rangeEnd === number)));
}

assert(territorySeed.length === 70, "A base deve conter 70 trechos.");
assert(new Set(territorySeed.map((entry) => entry.street)).size === 47, "A base deve conter 47 ruas distintas.");
assert(find("DO VARJAO", "2960")?.team.communityAgent === "MICHELE", "O número 2960 do Varjão deve pertencer a Michele.");
assert(find("DO VARJAO", "3028")?.team.communityAgent === "MICHELE", "O número 3028 do Varjão deve pertencer a Michele.");
assert(territorySeed.some((entry) => entry.street === "DARIO BOCCHINO" && entry.rangeStart === "3772" && entry.rangeEnd === "3860" && entry.team.communityAgent === "JANAINA"), "O intervalo 3772–3860 de Dario Bocchino deve pertencer a Janaina.");
assert(territorySeed.some((entry) => entry.street === "DOUTOR JOSE MARCUS GNACCARINI THOMAZESKI" && entry.team.name === "Ipê" && entry.team.colorName === "Rosé Gold"), "Doutor José Marcus deve ser identificado pela equipe Ipê em Rosé Gold.");
assert(territorySeed.every((entry) => entry.team.doctor && entry.team.nurse && entry.team.communityAgent), "Todo trecho deve informar médica(o), enfermeira(o) e ACS.");

console.log(`Base territorial validada: ${territorySeed.length} trechos em ${new Set(territorySeed.map((entry) => entry.street)).size} ruas.`);
