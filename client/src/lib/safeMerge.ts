import type { Patient, TeamAssignment, TerritoryEntry } from "./dataStore";

export const DEMO_PATIENT_VALUES = {
  registration: "975749",
  cpf: "06626492900",
  phones: ["11978831938", "1145890208"],
} as const;

export type ChangeDetail = { field: string; before: string; after: string };
export type ChangePreview = { key: string; label: string; changes: ChangeDetail[] };
export type MergeMetrics = { added: number; filled: number; demoReplaced: number; duplicates: number; skipped: number };
export type MergeResult<T> = { values: T[]; changes: ChangePreview[]; metrics: MergeMetrics };
export type TerritoryPatch = {
  street: string;
  rangeStart?: string;
  rangeEnd?: string;
  numberRule?: TerritoryEntry["numberRule"];
  exclusiveNumbers?: string[];
  team: Partial<TeamAssignment>;
};

const patientFieldLabels: Record<PatientField, string> = {
  name: "Nome", mother: "Nome da mãe", birth: "Nascimento", address: "Endereço", registration: "Cadastro", cpf: "CPF", cns: "CNS",
};
const territoryFieldLabels: Record<TeamField, string> = {
  name: "Equipe", colorName: "Cor", color: "Código da cor", doctor: "Médica(o)", nurse: "Enfermeira(o)", communityAgent: "Agente comunitária(o)",
};
type PatientField = "name" | "mother" | "birth" | "address" | "registration" | "cpf" | "cns";
type TeamField = "name" | "colorName" | "color" | "doctor" | "nurse" | "communityAgent";
const patientFields: PatientField[] = ["name", "mother", "birth", "address", "registration", "cpf", "cns"];
const teamFields: TeamField[] = ["name", "colorName", "color", "doctor", "nurse", "communityAgent"];

const normalize = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const normalizedDigits = (value = "") => String(value).replace(/\D/g, "");
const clean = (value?: string) => String(value ?? "").trim();
const same = (first?: string, second?: string) => normalize(clean(first)) === normalize(clean(second));

function phonesOf(patient: Pick<Patient, "phone" | "phones">) {
  return Array.from(new Set([...(patient.phones ?? []), patient.phone ?? ""].map(normalizedDigits).filter(Boolean)));
}

function isDemoField(field: PatientField, value?: string) {
  const normalized = normalizedDigits(value);
  return (field === "registration" && normalized === DEMO_PATIENT_VALUES.registration)
    || (field === "cpf" && normalized === DEMO_PATIENT_VALUES.cpf);
}

function isDemoPhone(phone: string) {
  return DEMO_PATIENT_VALUES.phones.includes(normalizedDigits(phone) as typeof DEMO_PATIENT_VALUES.phones[number]);
}

function patientLookupKeys(patient: Patient) {
  const keys: string[] = [];
  if (clean(patient.cns)) keys.push(`cns:${normalizedDigits(patient.cns)}`);
  if (clean(patient.registration) && !isDemoField("registration", patient.registration)) keys.push(`registration:${normalizedDigits(patient.registration)}`);
  if (clean(patient.cpf) && !isDemoField("cpf", patient.cpf)) keys.push(`cpf:${normalizedDigits(patient.cpf)}`);
  const name = normalize(patient.name);
  if (name && clean(patient.birth)) keys.push(`name-birth:${name}|${normalize(patient.birth)}`);
  return keys;
}

function patientNameKey(patient: Patient) { return normalize(patient.name); }

function createPatientIndex(patients: Patient[]) {
  const byKey = new Map<string, number>();
  const byName = new Map<string, number[]>();
  patients.forEach((patient, index) => {
    patientLookupKeys(patient).forEach((key) => { if (!byKey.has(key)) byKey.set(key, index); });
    const name = patientNameKey(patient);
    if (name) byName.set(name, [...(byName.get(name) ?? []), index]);
  });
  return { byKey, byName };
}

function matchPatient(index: ReturnType<typeof createPatientIndex>, patient: Patient) {
  const exact = patientLookupKeys(patient).map((key) => index.byKey.get(key)).find((value) => value !== undefined);
  if (exact !== undefined) return exact;
  const candidates = index.byName.get(patientNameKey(patient)) ?? [];
  return candidates.length === 1 ? candidates[0] : candidates.length > 1 ? "ambiguous" : undefined;
}

function mergeOnePatient(current: Patient, incoming: Patient) {
  let proposed = { ...current };
  const changes: ChangeDetail[] = [];
  let filled = 0;
  let demoReplaced = 0;

  patientFields.forEach((field) => {
    const incomingValue = clean(incoming[field]);
    if (!incomingValue) return;
    const currentValue = clean(current[field]);
    if (!currentValue) {
      proposed = { ...proposed, [field]: incomingValue } as Patient;
      filled += 1;
      return;
    }
    if (same(currentValue, incomingValue)) return;
    proposed = { ...proposed, [field]: incomingValue } as Patient;
    if (isDemoField(field, currentValue)) { demoReplaced += 1; return; }
    changes.push({ field: patientFieldLabels[field], before: currentValue, after: incomingValue });
  });

  const currentPhones = phonesOf(current);
  const incomingActualPhones = phonesOf(incoming).filter((phone) => !isDemoPhone(phone));
  if (incomingActualPhones.length) {
    const currentActualPhones = currentPhones.filter((phone) => !isDemoPhone(phone));
    const mergedPhones = Array.from(new Set([...currentActualPhones, ...incomingActualPhones]));
    const phonesChanged = mergedPhones.join("|") !== currentPhones.join("|");
    if (phonesChanged) {
      proposed = { ...proposed, phone: mergedPhones[0], phones: mergedPhones };
      if (!currentActualPhones.length && currentPhones.length) demoReplaced += 1;
      else filled += incomingActualPhones.filter((phone) => !currentActualPhones.includes(phone)).length;
    }
  }
  return { proposed: { ...proposed, id: current.id }, changes, filled, demoReplaced };
}

export function preparePatientMerge(current: Patient[], incoming: Patient[]): MergeResult<Patient> {
  const values = [...current];
  const index = createPatientIndex(values);
  const previews = new Map<string, ChangePreview>();
  const metrics: MergeMetrics = { added: 0, filled: 0, demoReplaced: 0, duplicates: 0, skipped: 0 };

  incoming.forEach((patient) => {
    const foundIndex = matchPatient(index, patient);
    if (foundIndex === "ambiguous") { metrics.skipped += 1; return; }
    if (foundIndex === undefined) {
      values.push(patient);
      const addedIndex = values.length - 1;
      patientLookupKeys(patient).forEach((key) => index.byKey.set(key, addedIndex));
      const name = patientNameKey(patient);
      if (name) index.byName.set(name, [...(index.byName.get(name) ?? []), addedIndex]);
      metrics.added += 1;
      return;
    }
    const currentPatient = values[foundIndex];
    const result = mergeOnePatient(currentPatient, patient);
    values[foundIndex] = result.proposed;
    patientLookupKeys(result.proposed).forEach((key) => index.byKey.set(key, foundIndex));
    const changed = result.changes.length + result.filled + result.demoReplaced;
    if (!changed) { metrics.duplicates += 1; return; }
    metrics.filled += result.filled;
    metrics.demoReplaced += result.demoReplaced;
    if (result.changes.length) {
      const key = currentPatient.id;
      const preview = previews.get(key) ?? { key, label: currentPatient.name, changes: [] };
      preview.changes.push(...result.changes);
      previews.set(key, preview);
    }
  });
  return { values, changes: Array.from(previews.values()), metrics };
}

function territoryIdentity(entry: Pick<TerritoryPatch, "street" | "rangeStart" | "rangeEnd" | "numberRule" | "exclusiveNumbers">) {
  return [normalize(entry.street), normalizedDigits(entry.rangeStart), normalizedDigits(entry.rangeEnd), entry.numberRule ?? "all", ...(entry.exclusiveNumbers ?? []).map(normalizedDigits).sort()].join("|");
}

function territoryLabel(entry: Pick<TerritoryPatch, "street" | "rangeStart" | "rangeEnd" | "numberRule" | "exclusiveNumbers">) {
  const range = entry.numberRule === "exclusive" ? `exclusivos: ${(entry.exclusiveNumbers ?? []).join(", ")}` : entry.rangeStart && entry.rangeEnd ? entry.rangeStart === entry.rangeEnd ? `número ${entry.rangeStart}` : `${entry.rangeStart} — ${entry.rangeEnd}` : entry.rangeStart ? `a partir de ${entry.rangeStart}` : entry.rangeEnd ? `até ${entry.rangeEnd}` : "todos os números";
  return `${entry.street} · ${range}`;
}

function validNewTerritory(entry: TerritoryPatch) {
  return Boolean(entry.team.doctor && entry.team.nurse && entry.team.communityAgent);
}

function mergeOneTerritory(current: TerritoryEntry, incoming: TerritoryPatch) {
  let team = { ...current.team };
  const changes: ChangeDetail[] = [];
  let filled = 0;
  teamFields.forEach((field) => {
    const incomingValue = clean(incoming.team[field]);
    if (!incomingValue) return;
    const currentValue = clean(current.team[field]);
    if (!currentValue) { team = { ...team, [field]: incomingValue }; filled += 1; return; }
    if (same(currentValue, incomingValue)) return;
    team = { ...team, [field]: incomingValue };
    changes.push({ field: territoryFieldLabels[field], before: currentValue, after: incomingValue });
  });
  return { proposed: { ...current, team }, changes, filled };
}

export function prepareTerritoryMerge(current: TerritoryEntry[], incoming: TerritoryPatch[]): MergeResult<TerritoryEntry> {
  const values = [...current];
  const index = new Map(values.map((entry, position) => [territoryIdentity(entry), position]));
  const previews = new Map<string, ChangePreview>();
  const metrics: MergeMetrics = { added: 0, filled: 0, demoReplaced: 0, duplicates: 0, skipped: 0 };
  incoming.forEach((patch) => {
    const key = territoryIdentity(patch);
    const foundIndex = index.get(key);
    if (foundIndex === undefined) {
      if (!validNewTerritory(patch)) { metrics.skipped += 1; return; }
      const entry: TerritoryEntry = { street: patch.street, rangeStart: patch.rangeStart, rangeEnd: patch.rangeEnd, numberRule: patch.numberRule, exclusiveNumbers: patch.exclusiveNumbers, team: patch.team as TeamAssignment };
      values.push(entry); index.set(key, values.length - 1); metrics.added += 1;
      return;
    }
    const currentEntry = values[foundIndex];
    const result = mergeOneTerritory(currentEntry, patch);
    values[foundIndex] = result.proposed;
    if (!result.changes.length && !result.filled) { metrics.duplicates += 1; return; }
    metrics.filled += result.filled;
    if (result.changes.length) {
      const preview = previews.get(key) ?? { key, label: territoryLabel(currentEntry), changes: [] };
      preview.changes.push(...result.changes);
      previews.set(key, preview);
    }
  });
  return { values, changes: Array.from(previews.values()), metrics };
}
