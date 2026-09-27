import { preparePatientMerge, prepareTerritoryMerge } from "../client/src/lib/safeMerge";
import type { Patient, TerritoryEntry } from "../client/src/lib/dataStore";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const currentPatient: Patient = {
  id: "700123", cns: "700123", name: "ANA DE TESTE", mother: "MARIA DE TESTE", birth: "1990-01-02", address: "RUA EXEMPLO, 10", registration: "975749", cpf: "06626492900", phones: ["11978831938", "1145890208"], phone: "11978831938",
};

const phoneUpdate: Patient = { id: "700123", cns: "700123", name: "ANA DE TESTE", phone: "11999999999", phones: ["11999999999"] };
const phoneResult = preparePatientMerge([currentPatient], [phoneUpdate]);
const completedPatient = phoneResult.values[0];
assert(completedPatient.mother === "MARIA DE TESTE" && completedPatient.address === "RUA EXEMPLO, 10", "Atualização de telefone deve preservar mãe e endereço.");
assert(completedPatient.phones?.join("|") === "11999999999", "Telefone real deve substituir os telefones demonstrativos sem exigir confirmação.");
assert(phoneResult.changes.length === 0 && phoneResult.metrics.demoReplaced === 1, "A troca de telefone demonstrativo deve ser automática.");

const addressUpdate: Patient = { id: "700123", cns: "700123", name: "ANA DE TESTE", address: "RUA NOVA, 20" };
const addressResult = preparePatientMerge([currentPatient], [addressUpdate]);
assert(addressResult.changes.length === 1 && addressResult.changes[0].changes[0].field === "Endereço", "Mudança de endereço deve aparecer na revisão obrigatória.");

const nameOnlyDuplicate = preparePatientMerge([currentPatient, { ...currentPatient, id: "700124", cns: "700124" }], [{ id: "ANA DE TESTE-", name: "ANA DE TESTE", phone: "11999999999" }]);
assert(nameOnlyDuplicate.values.length === 2 && nameOnlyDuplicate.metrics.skipped === 1, "Nome repetido sem identificador confiável não deve criar ou alterar cadastro.");

const currentTerritory: TerritoryEntry = { street: "RUA TESTE", rangeStart: "1", rangeEnd: "99", team: { name: "Margarida", color: "#fff", colorName: "Branca", doctor: "DRA. A", nurse: "ENF. A", communityAgent: "ACS A" } };
const territoryResult = prepareTerritoryMerge([currentTerritory], [{ street: "RUA TESTE", rangeStart: "1", rangeEnd: "99", team: { communityAgent: "ACS B" } }]);
assert(territoryResult.changes.length === 1 && territoryResult.changes[0].changes[0].field === "Agente comunitária(o)", "Mudança de ACS deve aparecer na revisão territorial.");
assert(territoryResult.values[0].team.doctor === "DRA. A", "Atualização parcial do território deve preservar profissionais não enviados.");

const incompleteNew = prepareTerritoryMerge([], [{ street: "RUA NOVA", team: { communityAgent: "ACS" } }]);
assert(incompleteNew.values.length === 0 && incompleteNew.metrics.skipped === 1, "Novo trecho incompleto não deve ser criado.");

console.log("Mesclagem segura validada: complementos preservam dados e substituições são revisadas.");
