import type { TerritoryEntry } from "../client/src/lib/dataStore";
import { parseTerritoryRule, territoryNumberMatches, territoryRangeLabel } from "../client/src/lib/territoryRules";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const team = { doctor: "Médica", nurse: "Enfermeira", communityAgent: "ACS" };
const entry = (rule: ReturnType<typeof parseTerritoryRule>): TerritoryEntry => ({ street: "RUA EXEMPLO", ...rule, team });

const wholeStreet = entry(parseTerritoryRule("", ""));
assert(territoryNumberMatches(wholeStreet, 1) && territoryNumberMatches(wholeStreet, 9999), "Rua sem limites deve abranger todos os números.");
const until = entry(parseTerritoryRule("", "62"));
assert(territoryNumberMatches(until, 62) && !territoryNumberMatches(until, 63), "Limite final isolado deve abranger números menores ou iguais.");
const from = entry(parseTerritoryRule("26", ""));
assert(territoryNumberMatches(from, 26) && !territoryNumberMatches(from, 25), "Limite inicial isolado deve abranger números maiores ou iguais.");
const even = entry(parseTerritoryRule("@26", "@62"));
assert(territoryNumberMatches(even, 26) && territoryNumberMatches(even, 62) && !territoryNumberMatches(even, 27), "Operador @ deve abranger somente números pares no intervalo.");
const odd = entry(parseTerritoryRule("#26", "#62"));
assert(territoryNumberMatches(odd, 27) && !territoryNumberMatches(odd, 26) && !territoryNumberMatches(odd, 63), "Operador # deve abranger somente números ímpares no intervalo.");
const exclusive = entry(parseTerritoryRule("!3023!3012!3008", ""));
assert(territoryNumberMatches(exclusive, 3023) && territoryNumberMatches(exclusive, 3008) && !territoryNumberMatches(exclusive, 3024), "Operador ! deve abranger somente os números informados.");
assert(territoryRangeLabel(exclusive).includes("3023") && territoryRangeLabel(even).includes("pares"), "Os rótulos devem explicar a regra ativa.");
console.log("Regras territoriais validadas: rua toda, limites abertos, pares, ímpares e exclusivos.");
