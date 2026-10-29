// Segurança de dados: o IndexedDB é cifrado com AES-GCM usando a chave local do app.
import { padronizarEndereco, padronizarLogradouro } from "./territoryRules";

export const TERRITORY_SEED_REVISION = 2;
export type Patient = { id: string; registration?: string; name: string; mother?: string; phone?: string; phones?: string[]; address?: string; cpf?: string; cns?: string; cnsExtra?: string; cnsTodos?: string[]; birth?: string; sexo?: string; raca?: string; etnia?: string; pai?: string; pais?: string; tags?: string[]; healthFlags?: Record<string, boolean> };
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
// Usada somente na migração do registro v1 (PBKDF2 desta constante).
const LOCAL_DATA_KEY = "cadclinico-local-v1";
// Chave AES-GCM aleatória, gerada uma única vez e guardada AO LADO dos dados (localStorage).
// Escolha do usuário: protege contra cópia offline dos arquivos do banco. Se a chave se
// perder, o banco zera — aceitável porque os dados são sempre espelho da fonte original.
const LOCAL_DATA_KEY_STORAGE = "cadclinico-db-key";
const DATABASE_NAME = "cadclinico";
const DATABASE_STORE = "clinic-data";
const PBKDF2_ITERATIONS = 120000;

type EncryptedRecord = { version: 1; salt: string; iv: string; ciphertext: string };
type CifraLocal = { version: 2; iv: string; ciphertext: string };

export const emptyData: ClinicData = { schemaVersion: 1, updatedAt: new Date().toISOString(), territorySeedRevision: TERRITORY_SEED_REVISION, patients: [], territory: [], unitOperation: [], branding: {} };
export const initialData = emptyData;

const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const territoryKey = (entry: TerritoryEntry) => [normalize(entry.street), normalize(entry.rangeStart), normalize(entry.rangeEnd), entry.numberRule ?? "all", ...(entry.exclusiveNumbers ?? []).map(normalize).sort()].join("|");
const fullTerritoryKey = (entry: TerritoryEntry) => [territoryKey(entry), normalize(entry.team.doctor), normalize(entry.team.nurse), normalize(entry.team.communityAgent)].join("|");

function cloneEmptyData(): ClinicData { return { ...emptyData, updatedAt: new Date().toISOString(), patients: [], territory: [], unitOperation: [], branding: {} }; }
// Conversões por bloco: o banco de 15 mil pacientes tem ~5,6 MB e a versão byte a
// byte travava a tela por segundos (437 ms de leitura e 316 ms de gravação; agora
// 18 ms e 201 ms) — mesma string de saída, só a montagem que mudou.
export function base64ToBytes(value: string) { const texto = atob(value); const bytes = new Uint8Array(texto.length); for (let indice = 0; indice < texto.length; indice += 1) bytes[indice] = texto.charCodeAt(indice); return bytes; }
export function bytesToBase64(value: Uint8Array) { let result = ""; const BLOCO = 0x8000; for (let inicio = 0; inicio < value.length; inicio += BLOCO) result += String.fromCharCode.apply(null, Array.from(value.subarray(inicio, inicio + BLOCO))); return btoa(result); }

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

function isEncryptedRecord(value: unknown): value is EncryptedRecord {
  const record = value as Partial<EncryptedRecord>;
  return Boolean(record && record.version === 1 && typeof record.salt === "string" && typeof record.iv === "string" && typeof record.ciphertext === "string");
}

// Formato atual (v2): chave aleatória ao lado dos dados, sem PBKDF2 no caminho de
// carga/gravação — o AES-GCM nativo direto custa dezenas de ms onde o PBKDF2 custava
// centenas em aparelhos fracos.
let chaveLocalCache: CryptoKey | null = null;
async function obterChaveLocal(): Promise<CryptoKey> {
  if (chaveLocalCache) return chaveLocalCache;
  if (!globalThis.crypto?.subtle) throw new Error("Criptografia local indisponível neste aparelho.");
  let salvo = window.localStorage.getItem(LOCAL_DATA_KEY_STORAGE);
  if (!salvo) {
    const nova = await globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    salvo = bytesToBase64(new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", nova)));
    window.localStorage.setItem(LOCAL_DATA_KEY_STORAGE, salvo);
  }
  chaveLocalCache = await globalThis.crypto.subtle.importKey("raw", base64ToBytes(salvo), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  return chaveLocalCache;
}

async function cifrarLocal(data: ClinicData): Promise<CifraLocal> {
  const chave = await obterChaveLocal();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(JSON.stringify(data))));
  return { version: 2, iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function decifrarLocal(record: CifraLocal): Promise<ClinicData> {
  const chave = await obterChaveLocal();
  const clear = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(record.iv) }, chave, base64ToBytes(record.ciphertext));
  return sanitizeData(JSON.parse(new TextDecoder().decode(clear)));
}

function isCifraLocal(value: unknown): value is CifraLocal {
  const record = value as Partial<CifraLocal>;
  return Boolean(record && record.version === 2 && typeof record.iv === "string" && typeof record.ciphertext === "string");
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

async function gravarRegistro(registro: CifraLocal) {
  const database = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const request = database.transaction(DATABASE_STORE, "readwrite").objectStore(DATABASE_STORE).put(registro, STORAGE_KEY); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
  finally { database.close(); }
}

async function apagarRegistro() {
  try { const database = await openDatabase(); await new Promise<void>((resolve, reject) => { const request = database.transaction(DATABASE_STORE, "readwrite").objectStore(DATABASE_STORE).delete(STORAGE_KEY); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); database.close(); } catch { /* melhor esforço */ }
}

export async function loadPersistedData(): Promise<{ dados: ClinicData | null; erro: string | null }> {
  if (typeof window === "undefined" || !window.indexedDB) return { dados: null, erro: null };
  try {
    const encrypted = await getRecord(STORAGE_KEY);
    if (isCifraLocal(encrypted)) {
      // É espelho: chave ausente ou registro corrompido => banco zera em silêncio
      // e o usuário reimporta da fonte quando quiser.
      try { return { dados: await decifrarLocal(encrypted), erro: null }; }
      catch { await apagarRegistro(); return { dados: null, erro: null }; }
    }
    if (isEncryptedRecord(encrypted)) {
      // Migração v1 (PBKDF2 da constante) -> v2 (chave aleatória ao lado dos dados).
      try {
        const dados = await decryptRecord(encrypted, LOCAL_DATA_KEY);
        await gravarRegistro(await cifrarLocal(dados));
        return { dados, erro: null };
      } catch { await apagarRegistro(); return { dados: null, erro: null }; }
    }
    const legacy = await getRecord(LEGACY_STORAGE_KEY);
    return { dados: legacy ? sanitizeData(legacy) : null, erro: null };
  } catch (erro) {
    // Antes o erro virava null em silêncio: a tela abria vazia sem nenhum aviso.
    return { dados: null, erro: erro instanceof Error && erro.message ? erro.message : "Falha ao abrir o banco salvo." };
  }
}

export async function saveData(data: ClinicData) {
  if (typeof window === "undefined" || !window.indexedDB) return;
  try { await gravarRegistro(await cifrarLocal(data)); } catch { /* O aplicativo segue aberto; é espelho — reimportável da fonte. */ }
}

export async function resetData() {
  if (typeof window === "undefined" || !window.indexedDB) return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => { const store = database.transaction(DATABASE_STORE, "readwrite").objectStore(DATABASE_STORE); const request = store.delete(STORAGE_KEY); store.delete(LEGACY_STORAGE_KEY); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
    database.close();
    window.localStorage.removeItem(LOCAL_DATA_KEY_STORAGE);
    chaveLocalCache = null;
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
  // Faixa do card decide se a regra da Augusta x Dario se aplica.
  const nums = (entry.exclusiveNumbers ?? []).map((value) => parseInt(value, 10)).filter((value) => !isNaN(value));
  const comeco = entry.numberRule === "exclusive" && nums.length ? String(Math.min(...nums)) : entry.rangeStart;
  const fim = entry.numberRule === "exclusive" && nums.length ? String(Math.max(...nums)) : entry.rangeEnd;
  const street = (padronizarLogradouro(entry.street, comeco, fim) ?? entry.street).toUpperCase();
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
// Valor "tem conteúdo" para juntar campo a campo: string com texto, array com
// item ou objeto com chave. undefined/null/vazio => o import não trouxe nada.
function valorPreenchido(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return Boolean(value);
}
// Reimportar um CSV que NÃO traz endereço/cadastro/telefone não pode apagar o
// que já estava gravado (antes o registro inteiro era substituído e o campo
// sumia aqui, enquanto o Acompanha Digital continuava mostrando — divergência
// de "endereço completo num app e vazio no outro"). Agora junta campo a campo:
// só o que veio preenchido sobrescreve.
export function mergePaciente(atual: Patient, novo: Patient): Patient {
  const saida: Patient = { ...atual };
  for (const chave of Object.keys(novo) as (keyof Patient)[]) {
    if (chave === "id") continue;
    const value = novo[chave];
    if (!valorPreenchido(value)) continue;
    if (chave === "healthFlags") {
      saida.healthFlags = { ...(atual.healthFlags ?? {}), ...(value as Record<string, boolean>) };
      continue;
    }
    (saida as Record<string, unknown>)[chave] = value;
  }
  saida.id = atual.id;
  return saida;
}
export function mergeData(current: ClinicData, incoming: ClinicData): ClinicData {
  const patients = new Map(current.patients.map((item) => [normalize(item.id), item]));
  incoming.patients.forEach((item) => {
    const key = normalize(item.id);
    const existente = patients.get(key);
    patients.set(key, existente ? mergePaciente(existente, item) : item);
  });
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
