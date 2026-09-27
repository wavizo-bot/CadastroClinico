// Segurança de dados: o IndexedDB é cifrado com AES-GCM usando a chave local do app.
import { padronizarEndereco, padronizarLogradouro } from "./territoryRules";

export const TERRITORY_SEED_REVISION = 2;
export type Patient = { id: string; registration?: string; name: string; mother?: string; phone?: string; phones?: string[]; address?: string; cpf?: string; cns?: string; cnsExtra?: string; birth?: string; sexo?: string; raca?: string; etnia?: string; pai?: string; pais?: string; tags?: string[]; healthFlags?: Record<string, boolean> };
export type TeamAssignment = { name?: string; color?: string; colorName?: string; textColor?: string; doctor: string; nurse: string; communityAgent: string; assistant?: string };
export type TerritoryRule = "all" | "exclusive" | "even" | "odd";
export type TerritoryEntry = { street: string; rangeStart?: string; rangeEnd?: string; numberRule?: TerritoryRule; exclusiveNumbers?: string[]; team: TeamAssignment };
export type UnitOperationEntry = { title: string; text: string };
export type EmbeddedImage = { mime: "image/png" | "image/jpeg" | "image/webp"; data: string; updatedAt: string };
export type InstitutionalBranding = { displayMode?: "pair" | "single"; clinicLogo?: EmbeddedImage | null; cityLogo?: EmbeddedImage | null; centralImage?: EmbeddedImage | null };
export type ClinicData = { schemaVersion: 1; updatedAt: string; databaseDate?: string; territorySeedRevision?: number; patients: Patient[]; territory: TerritoryEntry[]; unitOperation: UnitOperationEntry[]; branding?: InstitutionalBranding };
export const MAX_BRANDING_IMAGE_BYTES = 300 * 1024;

export const STORAGE_KEY = "cadclinico-local-data-encrypted";
const LEGACY_STORAGE_KEY = "cadclinico-local-data-legacy";
const ACCESS_PASSWORD_KEY = "cadclinico-access-password";
// Chave local de cifragem dos dados — não é a senha do usuário; a senha opcional só controla a tela de abertura.
const LOCAL_DATA_KEY = "cadclinico-local-v1";
const DATABASE_NAME = "cadclinico";
const DATABASE_STORE = "clinic-data";
const PBKDF2_ITERATIONS = 120000;

type EncryptedRecord = { version: 1; salt: string; iv: string; ciphertext: string };

export const emptyData: ClinicData = { schemaVersion: 1, updatedAt: new Date().toISOString(), territorySeedRevision: TERRITORY_SEED_REVISION, patients: [], territory: [], unitOperation: [], branding: {} };
export const initialData = emptyData;

const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const territoryKey = (entry: TerritoryEntry) => [normalize(entry.street), normalize(entry.rangeStart), normalize(entry.rangeEnd), entry.numberRule ?? "all", ...(entry.exclusiveNumbers ?? []).map(normalize).sort()].join("|");
const fullTerritoryKey = (entry: TerritoryEntry) => [territoryKey(entry), normalize(entry.team.doctor), normalize(entry.team.nurse), normalize(entry.team.communityAgent)].join("|");

function cloneEmptyData(): ClinicData { return { ...emptyData, updatedAt: new Date().toISOString(), patients: [], territory: [], unitOperation: [], branding: {} }; }
function base64ToBytes(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
function bytesToBase64(value: Uint8Array) { let result = ""; value.forEach((byte) => { result += String.fromCharCode(byte); }); return btoa(result); }

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage[]) {
  if (!globalThis.crypto?.subtle) throw new Error("Criptografia local indisponível neste aparelho.");
  const material = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return globalThis.crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, usage);
}

async function decryptRecord(record: EncryptedRecord, password: string) {
  const salt = base64ToBytes(record.salt); const iv = base64ToBytes(record.iv);
  const key = await deriveKey(password, salt, ["decrypt"]);
  const clear = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(record.ciphertext));
  return sanitizeData(JSON.parse(new TextDecoder().decode(clear)));
}

async function encryptRecord(data: ClinicData, password: string): Promise<EncryptedRecord> {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Criptografia local indisponível neste aparelho.");
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16)); const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ["encrypt"]);
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data))));
  return { version: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

function isEncryptedRecord(value: unknown): value is EncryptedRecord {
  const record = value as Partial<EncryptedRecord>;
  return Boolean(record && record.version === 1 && typeof record.salt === "string" && typeof record.iv === "string" && typeof record.ciphertext === "string");
}

export function loadData(): ClinicData { return cloneEmptyData(); }
export function loadAccessPassword(): string | null { if (typeof window === "undefined") return null; const stored = window.localStorage.getItem(ACCESS_PASSWORD_KEY); return /^[A-Z1-9]{4}$/.test(stored ?? "") ? stored : null; }
export function saveAccessPassword(password: string) { if (typeof window === "undefined" || !/^[A-Z1-9]{4}$/.test(password)) return; window.localStorage.setItem(ACCESS_PASSWORD_KEY, password); }
export function removeAccessPassword() { if (typeof window === "undefined") return; window.localStorage.removeItem(ACCESS_PASSWORD_KEY); }

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DATABASE_STORE)) request.result.createObjectStore(DATABASE_STORE); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}

async function getRecord(key: string) {
  const database = await openDatabase();
  try { return await new Promise<unknown>((resolve, reject) => { const request = database.transaction(DATABASE_STORE, "readonly").objectStore(DATABASE_STORE).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  finally { database.close(); }
}

export async function loadPersistedData(): Promise<ClinicData | null> {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  try {
    const encrypted = await getRecord(STORAGE_KEY);
    if (isEncryptedRecord(encrypted)) return decryptRecord(encrypted, LOCAL_DATA_KEY);
    const legacy = await getRecord(LEGACY_STORAGE_KEY);
    return legacy ? sanitizeData(legacy) : null;
  } catch { return null; }
}

export async function saveData(data: ClinicData) {
  if (typeof window === "undefined" || !window.indexedDB) return;
  try {
    const encrypted = await encryptRecord(data, LOCAL_DATA_KEY); const database = await openDatabase();
    await new Promise<void>((resolve, reject) => { const request = database.transaction(DATABASE_STORE, "readwrite").objectStore(DATABASE_STORE).put(encrypted, STORAGE_KEY); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
    database.close();
  } catch { /* O aplicativo segue aberto; a próxima utilização pedirá nova leitura. */ }
}

export async function resetData() {
  if (typeof window === "undefined" || !window.indexedDB) return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => { const store = database.transaction(DATABASE_STORE, "readwrite").objectStore(DATABASE_STORE); const request = store.delete(STORAGE_KEY); store.delete(LEGACY_STORAGE_KEY); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
    database.close();
  } catch { /* O estado visual continua consistente mesmo se o navegador recusar a operação. */ }
}


function uniqueBy<T>(items: T[], keyFor: (item: T) => string) { const seen = new Set<string>(); return items.filter((item) => { const key = keyFor(item); if (seen.has(key)) return false; seen.add(key); return true; }); }
/* Menor (mais antiga) entre duas datas ISO — usada na data do banco de dados. */
export function maisAntiga(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(a); const tb = Date.parse(b);
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return ta <= tb ? a : b;
}
function validEmbeddedImage(value: unknown): value is EmbeddedImage {
  const image = value as Partial<EmbeddedImage>;
  return Boolean(image && (image.mime === "image/png" || image.mime === "image/jpeg" || image.mime === "image/webp") && typeof image.data === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(image.data) && Math.floor(image.data.length * 0.75) <= MAX_BRANDING_IMAGE_BYTES && typeof image.updatedAt === "string");
}
function sanitizeBranding(value: unknown): InstitutionalBranding {
  const source = value && typeof value === "object" ? value as InstitutionalBranding : {};
  return {
    ...(source.displayMode === "pair" || source.displayMode === "single" ? { displayMode: source.displayMode } : {}),
    ...(source.clinicLogo === null ? { clinicLogo: null } : validEmbeddedImage(source.clinicLogo) ? { clinicLogo: source.clinicLogo } : {}),
    ...(source.cityLogo === null ? { cityLogo: null } : validEmbeddedImage(source.cityLogo) ? { cityLogo: source.cityLogo } : {}),
    ...(source.centralImage === null ? { centralImage: null } : validEmbeddedImage(source.centralImage) ? { centralImage: source.centralImage } : {}),
  };
}
export function sanitizeData(raw: unknown): ClinicData {
  const source = raw && typeof raw === "object" ? raw as Partial<ClinicData> : {};
  const territory = Array.isArray(source.territory) ? uniqueBy(source.territory.filter(validTerritory).map(higienizarTerritorio), fullTerritoryKey) : [];
  const patients = Array.isArray(source.patients) ? uniqueBy(source.patients.filter((patient): patient is Patient => Boolean(patient && patient.id && patient.name)).map(higienizarPaciente), (patient) => normalize(patient.id)) : [];
  const unitOperation = Array.isArray(source.unitOperation) ? uniqueBy(source.unitOperation.filter((row): row is UnitOperationEntry => Boolean(row && row.title && typeof row.text === "string")), (entry) => normalize(entry.title)) : [];
  return { schemaVersion: 1, updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(), databaseDate: typeof source.databaseDate === "string" ? source.databaseDate : undefined, territorySeedRevision: typeof source.territorySeedRevision === "number" ? source.territorySeedRevision : 0, patients, territory, unitOperation, branding: sanitizeBranding(source.branding) };
}
// REGRA EXCLUSIVA DO VARJÃO aplicada aos dados já gravados (aparece em bases antigas
// com as mais variantes) — endereço vira "Varjao, 3000" e a rua do território vira "VARJAO".
function higienizarPaciente(patient: Patient): Patient {
  const address = padronizarEndereco(patient.address);
  return address === patient.address ? patient : { ...patient, address };
}
function higienizarTerritorio(entry: TerritoryEntry): TerritoryEntry {
  const street = (padronizarLogradouro(entry.street) ?? entry.street).toUpperCase();
  return street === entry.street ? entry : { ...entry, street };
}
function validTerritory(entry: unknown): entry is TerritoryEntry {
  const row = entry as TerritoryEntry;
  const validRule = !row?.numberRule || ["all", "exclusive", "even", "odd"].includes(row.numberRule);
  const validExclusive = !row?.exclusiveNumbers || (Array.isArray(row.exclusiveNumbers) && row.exclusiveNumbers.every((number) => typeof number === "string" && /^\d+$/.test(number)));
  const hasAssistant = Boolean(row?.team?.communityAgent || (row?.team as any)?.assistant);
  return Boolean(row?.street && row?.team?.doctor && row?.team?.nurse && hasAssistant && validRule && validExclusive);
}
export function summarizeImport(current: ClinicData, incoming: ClinicData) {
  const oldPatients = new Map(current.patients.map((item) => [normalize(item.id), JSON.stringify(item)])); const oldTerritory = new Map(current.territory.map((item) => [territoryKey(item), JSON.stringify(item)]));
  const newPatients = incoming.patients.filter((item) => !oldPatients.has(normalize(item.id))).length; const changedPatients = incoming.patients.filter((item) => oldPatients.has(normalize(item.id)) && oldPatients.get(normalize(item.id)) !== JSON.stringify(item)).length;
  const newTerritory = incoming.territory.filter((item) => !oldTerritory.has(territoryKey(item))).length; const changedTerritory = incoming.territory.filter((item) => oldTerritory.has(territoryKey(item)) && oldTerritory.get(territoryKey(item)) !== JSON.stringify(item)).length;
  return { newPatients, changedPatients, newTerritory, changedTerritory, duplicatePatients: incoming.patients.length - newPatients - changedPatients, duplicateTerritory: incoming.territory.length - newTerritory - changedTerritory };
}
export function mergeData(current: ClinicData, incoming: ClinicData): ClinicData {
  const patients = new Map(current.patients.map((item) => [normalize(item.id), item])); incoming.patients.forEach((item) => patients.set(normalize(item.id), item));
  const territory = new Map(current.territory.map((item) => [territoryKey(item), item])); incoming.territory.forEach((item) => territory.set(territoryKey(item), item));
  const incomingBranding = incoming.branding ?? {};
  const currentBranding = current.branding ?? {};
  return {
    schemaVersion: 1,
    updatedAt: incoming.updatedAt || new Date().toISOString(),
    // Data do arquivo mais antigo já usado como banco de dados (nunca "anda para frente").
    databaseDate: maisAntiga(current.databaseDate, incoming.databaseDate),
    territorySeedRevision: Math.max(current.territorySeedRevision ?? 0, incoming.territorySeedRevision ?? 0),
    patients: Array.from(patients.values()), territory: Array.from(territory.values()), unitOperation: incoming.unitOperation,
    branding: {
      ...(Object.prototype.hasOwnProperty.call(incomingBranding, "displayMode") ? { displayMode: incomingBranding.displayMode } : Object.prototype.hasOwnProperty.call(currentBranding, "displayMode") ? { displayMode: currentBranding.displayMode } : {}),
      ...(Object.prototype.hasOwnProperty.call(incomingBranding, "clinicLogo") ? { clinicLogo: incomingBranding.clinicLogo } : Object.prototype.hasOwnProperty.call(currentBranding, "clinicLogo") ? { clinicLogo: currentBranding.clinicLogo } : {}),
      ...(Object.prototype.hasOwnProperty.call(incomingBranding, "cityLogo") ? { cityLogo: incomingBranding.cityLogo } : Object.prototype.hasOwnProperty.call(currentBranding, "cityLogo") ? { cityLogo: currentBranding.cityLogo } : {}),
      ...(Object.prototype.hasOwnProperty.call(incomingBranding, "centralImage") ? { centralImage: incomingBranding.centralImage } : Object.prototype.hasOwnProperty.call(currentBranding, "centralImage") ? { centralImage: currentBranding.centralImage } : {}),
    },
  };
}
