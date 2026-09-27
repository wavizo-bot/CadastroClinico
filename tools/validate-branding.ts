import { mergeData, sanitizeData } from "../client/src/lib/dataStore";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const image = { mime: "image/webp" as const, data: "QUJDRA==", updatedAt: "2026-08-22T00:00:00.000Z" };

const incoming = sanitizeData({ schemaVersion: 1, updatedAt: "2026-08-22T00:00:00.000Z", patients: [], territory: [], unitOperation: [], branding: { clinicLogo: image, centralImage: image, displayMode: "single" } });
assert(incoming.branding?.clinicLogo?.data === image.data, "A imagem incorporada válida deve ser preservada no JSON.");
assert(incoming.branding?.centralImage?.data === image.data && incoming.branding?.displayMode === "single", "A imagem única e seu modo de exibição devem ser preservados.");
const invalid = sanitizeData({ schemaVersion: 1, patients: [], territory: [], unitOperation: [], branding: { cityLogo: { ...image, data: "?" } } });
assert(!invalid.branding?.cityLogo, "Dados de imagem inválidos não podem ser aceitos.");
const current = sanitizeData({ schemaVersion: 1, updatedAt: "2026-08-21T00:00:00.000Z", patients: [], territory: [], unitOperation: [], branding: { cityLogo: image } });
const merged = mergeData(current, incoming);
assert(merged.branding?.clinicLogo?.data === image.data && merged.branding?.cityLogo?.data === image.data && merged.branding?.displayMode === "single", "Uma importação parcial deve preservar os outros logos e o modo visual.");
const restored = mergeData(merged, sanitizeData({ schemaVersion: 1, patients: [], territory: [], unitOperation: [], branding: { clinicLogo: null } }));
assert(restored.branding?.clinicLogo === null && restored.branding?.cityLogo?.data === image.data, "A restauração deve remover somente o logo selecionado.");
console.log("Branding validado: JSON incorporado, sanitização, fusão parcial e restauração.");
