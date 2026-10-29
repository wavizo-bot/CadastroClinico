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

/* REGRA — Avenida Augusta Teixeira Rodrigues x Rua Dario Bocchino: duas grafias do
   MESMO trecho. Os números de 1 a 3499 (e os sem número) aparecem como "Augusta
   Teixeira Rodrigues" na base e como "Dario Bocchino" no território; a partir de
   3500 é outro trecho e continua com a grafia original.
   - Sem número converte em qualquer lugar;
   - Com número converte só quando o número é menor que 3500;
   - Em faixa (território): converte só quando a faixa termina antes de 3500
     (ou, sem fim, quando começa antes de 3500). */
export const DARIO_ROTULO = "Dario Bocchino";
const AUGUSTA_NOME = "augusta teixeira rodrigues";

/* Nome da rua sem acento/caixa, sem tipo (rua, av…) e sem números. */
function nomeRua(value: unknown): string {
  const bruto = semAcento(value);
  if (!bruto) return "";
  const semNum = bruto.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
    .split(" ").filter((word) => !/^\d/.test(word)).join(" ");
  return semNum.replace(TIPO_LOGRADOURO, "").replace(/\s+/g, " ").trim();
}

export function ehDarioBocchino(rua: unknown, comeco?: unknown, fim?: unknown): boolean {
  if (nomeRua(rua) !== AUGUSTA_NOME) return false;
  const num = (value: unknown) => { const raw = String(value ?? "").replace(/\D/g, ""); return raw === "" ? null : parseInt(raw, 10); };
  const inicio = num(comeco); const termino = num(fim);
  if (inicio === null && termino === null) return true;   // sem número em nada → converte
  if (termino !== null) return termino < 3500;            // com fim: converte só se terminar antes de 3500
  return (inicio ?? Infinity) < 3500;                     // só começo: converte só se começar antes de 3500
}

/* Logradouro (sem número): devolve o rótulo padronizado ou o texto original.
   rangeStart/rangeEnd (quando existem) definem se a faixa cai na regra da rua. */
export function padronizarLogradouro(value?: string, rangeStart?: unknown, rangeEnd?: unknown): string | undefined {
  if (!value) return value;
  if (ehVarjao(value)) return VARJAO_ROTULO;
  if (ehDarioBocchino(value, rangeStart, rangeEnd)) return DARIO_ROTULO;
  return value;
}

/* Endereço completo "logradouro, número": devolve "Varjao, 3000" (ou "Dario Bocchino, 200"). */
export function padronizarEndereco(value?: string): string | undefined {
  if (!value) return value;
  const virgula = value.indexOf(",");
  const cabeca = virgula >= 0 ? value.slice(0, virgula) : value;
  const semNumero = virgula >= 0 ? "" : (/\s(\d{1,6})\s*$/.exec(value)?.[1] ?? "");
  const numero = virgula >= 0 ? value.slice(virgula + 1).trim().replace(/\s{2,}/g, " ") : semNumero;
  if (!ehVarjao(cabeca)) {
    if (!ehDarioBocchino(cabeca, numero, "")) return value;
    return numero ? `${DARIO_ROTULO}, ${numero}` : DARIO_ROTULO;
  }
  return numero ? `${VARJAO_ROTULO}, ${numero}` : VARJAO_ROTULO;
}

