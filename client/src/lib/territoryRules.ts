// Abrangência territorial: traduz !, @ e # da planilha em regras locais pesquisáveis no APK.
import type { TerritoryEntry, TerritoryRule } from "./dataStore";

const clean = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, "");

export function parseTerritoryRule(startValue: unknown, endValue: unknown): Pick<TerritoryEntry, "numberRule" | "exclusiveNumbers" | "rangeStart" | "rangeEnd"> {
  const startRaw = clean(startValue); const endRaw = clean(endValue);
  if (startRaw.startsWith("!")) {
    const exclusiveNumbers = Array.from(new Set(startRaw.split("!").map(digits).filter(Boolean)));
    return { numberRule: "exclusive", exclusiveNumbers };
  }
  const marker = [startRaw, endRaw].map((value) => value.charAt(0)).find((value) => value === "@" || value === "#");
  const numberRule: TerritoryRule = marker === "@" ? "even" : marker === "#" ? "odd" : "all";
  return { numberRule, rangeStart: digits(startRaw) || undefined, rangeEnd: digits(endRaw) || undefined };
}

export function territoryNumberMatches(entry: TerritoryEntry, number: number) {
  if (entry.numberRule === "exclusive") return (entry.exclusiveNumbers ?? []).some((value) => Number(value) === number);
  if (entry.numberRule === "even" && number % 2 !== 0) return false;
  if (entry.numberRule === "odd" && number % 2 === 0) return false;
  const start = entry.rangeStart ? Number(entry.rangeStart) : null;
  const end = entry.rangeEnd ? Number(entry.rangeEnd) : null;
  return (start === null || number >= start) && (end === null || number <= end);
}

export function territorySpecificity(entry: TerritoryEntry) {
  if (entry.numberRule === "exclusive") return 4;
  if (entry.rangeStart || entry.rangeEnd) return entry.numberRule === "even" || entry.numberRule === "odd" ? 3 : 2;
  return entry.numberRule === "even" || entry.numberRule === "odd" ? 1 : 0;
}

export function territoryRangeLabel(entry: TerritoryEntry) {
  if (entry.numberRule === "exclusive") return `Somente: ${(entry.exclusiveNumbers ?? []).join(", ")}`;
  const qualifier = entry.numberRule === "even" ? "Números pares" : entry.numberRule === "odd" ? "Números ímpares" : "";
  if (!entry.rangeStart && !entry.rangeEnd) return qualifier || "Todos os números";
  if (entry.rangeStart && entry.rangeEnd) return `${qualifier ? `${qualifier}: ` : ""}${entry.rangeStart} — ${entry.rangeEnd}`;
  return entry.rangeStart ? `${qualifier ? `${qualifier} a partir de` : `A partir de`} ${entry.rangeStart}` : `${qualifier ? `${qualifier} até` : `Até`} ${entry.rangeEnd}`;
}

/* REGRA EXCLUSIVA — ESTRADA MUNICIPAL DO VARJÃO.
   A base foi montada por muitas pessoas ao longo dos anos e o logradouro aparece
   como "ESTRADA MUNICIPAL DO VARJÃO", "MUNICIPAL DO VARJÃO", "DO VARJÃO" ou só
   "VARJÃO" (com/sem acento, caixa alta/baixa). Todas são o MESMO endereço e a
   exibição padronizada de todas é Varjao. */
const semAcento = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const VARJAO_ROTULO = "Varjao";
const VARJAO_FORMAS = ["estrada municipal do varjao", "municipal do varjao", "do varjao", "varjao"];
const TIPO_LOGRADOURO = /^(?:rua|r\.?|avenida|av\.?|aven\.?|estrada|est\.?|travessa|tv\.?|alameda|al\.?|praca|pca\.?|beco|viela|rodovia|rod\.?|via|caminho)\s+/;

export function ehVarjao(value: unknown): boolean {
  const base = semAcento(value).replace(TIPO_LOGRADOURO, "");
  return VARJAO_FORMAS.includes(base);
}

/* Logradouro (sem número): devolve o rótulo padronizado ou o texto original. */
export function padronizarLogradouro(value?: string): string | undefined {
  if (!value) return value;
  return ehVarjao(value) ? VARJAO_ROTULO : value;
}

/* Endereço completo "logradouro, número": devolve "Varjao, 3000". */
export function padronizarEndereco(value?: string): string | undefined {
  if (!value) return value;
  const virgula = value.indexOf(",");
  const cabeca = virgula >= 0 ? value.slice(0, virgula) : value;
  const semNumero = virgula >= 0 ? "" : (/\s(\d{1,6})\s*$/.exec(value)?.[1] ?? "");
  if (!ehVarjao(cabeca)) return value;
  const numero = virgula >= 0 ? value.slice(virgula + 1).trim().replace(/\s{2,}/g, " ") : semNumero;
  return numero ? `${VARJAO_ROTULO}, ${numero}` : VARJAO_ROTULO;
}

