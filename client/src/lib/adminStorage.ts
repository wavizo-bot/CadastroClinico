// Direção visual: Saúde Pública Editorial — persistência local transparente, robusta e exclusiva do administrativo.
import type { ClinicData } from "./dataStore";

const DATABASE_NAME = "cadclinico-admin";
const STORE_NAME = "datasets";
const RECORD_KEY = "current";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadAdminDataset(): Promise<ClinicData | null> {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  try {
    const database = await openDatabase();
    const data = await new Promise<ClinicData | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve((request.result as ClinicData | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return data;
  } catch {
    return null;
  }
}

export async function saveAdminDataset(data: ClinicData) {
  if (typeof window === "undefined" || !window.indexedDB) return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(data, RECORD_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    database.close();
  } catch {
    // O painel continua operacional; o usuário pode exportar o JSON imediatamente.
  }
}
