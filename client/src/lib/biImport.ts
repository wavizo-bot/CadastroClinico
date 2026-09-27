// Importação da base do BI — modelo ACS Digital idêntico: 3 relatórios CSV + equipes, reconhecidos pelo conteúdo do cabeçalho e unidos cruzando CNS/CPF/nome+nascimento.
// Regras de compreensão copiadas do ACS Digital (ACS-Digital.html): delimitador detectado, BOM/windows-1252, pinos por alias/letra, stripTipoLogradouro, caixaTitulo, isSim, ordem CNS > CPF > nome+nascimento.
// 4º CSV: equipes.csv — Flor/Cor/Hex/Texto/Enfermeira/Médica/Assistente (ACS) + faixa + rua — sem sigla governamental.
import type { Patient, TerritoryEntry } from "./dataStore";
import { ehVarjao, parseTerritoryRule, VARJAO_ROTULO } from "./territoryRules";

export type BiReportType = "s1" | "s2" | "s3" | "equipes";

export const BI_REPORT_LABELS: Record<BiReportType, string> = {
  s1: "CADASTRO — ANÁLISE DETALHADA",
  s2: "QUESTIONÁRIO AUTO REFERIDO",
  s3: "SAÚDE — CADASTROS DETALHADOS",
  equipes: "EQUIPES — TERRITÓRIO",
};

const PALAVRA_ARQ: Record<BiReportType, string> = { s1: "analise detalhada", s2: "auto referido", s3: "cadastros detalhados", equipes: "equipes" };

const norm = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export function sanitizarTexto(value: unknown, maxLen?: number) {
  let text = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[<>]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (maxLen && text.length > maxLen) text = text.slice(0, maxLen);
  return text;
}

const TIPO_LOGR = ["rua","r","avenida","av","aven","estrada","est","travessa","tv","alameda","al","praca","praça","pca","beco","viela","rodovia","rod","via","caminho"];
function stripTipoLogradouro(s: string) {
  let out = String(s ?? "").trim();
  for (let g = 0; g < 3; g++) {
    const t = out.split(/\s+/);
    if (t.length > 1 && TIPO_LOGR.includes(norm(t[0]).replace(/\.$/,""))) out = t.slice(1).join(" ");
    else break;
  }
  out = out.trim();
  // REGRA EXCLUSIVA DO VARJÃO: todas as variantes são o mesmo endereço.
  return ehVarjao(out) ? VARJAO_ROTULO : out;
}
const CONECTIVOS = new Set(["de","da","do","das","dos","e"]);
function caixaTitulo(s: unknown) {
  return String(s ?? "").toLowerCase().split(/\s+/).filter(Boolean).map((w,i) => (i>0 && CONECTIVOS.has(w)) ? w : w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
}
const isSim = (v: unknown) => ["SIM","S","X","TRUE","VERDADEIRO","1","YES","OK"].includes(String(v ?? "").trim().toUpperCase());

export async function readBiFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buffer);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buffer);
  let text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if ((text.match(/\uFFFD/g) || []).length > 0) text = new TextDecoder("windows-1252").decode(buffer);
  return text;
}

function detectDelim(text: string): string {
  const line = text.split(/\r?\n/).find((row) => row.trim()) || "";
  let inQuote = false; let semis = 0; let commas = 0; let tabs = 0;
  for (const char of line) {
    if (char === "\"") inQuote = !inQuote;
    else if (!inQuote) { if (char === ";") semis++; else if (char === ",") commas++; else if (char === "\t") tabs++; }
  }
  const max = Math.max(semis, commas, tabs);
  if (max === 0) return ",";
  return max === semis ? ";" : (max === commas ? "," : "\t");
}

export function parseBiCsv(raw: string): string[][] {
  const text = String(raw ?? "").replace(/^\uFEFF/, "");
  const delim = detectDelim(text);
  const rows: string[][] = []; let row: string[] = []; let field = ""; let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuote) {
      if (char === "\"") { if (text[i + 1] === "\"") { field += "\""; i++; } else inQuote = false; }
      else field += char;
    } else if (char === "\"") inQuote = true;
    else if (char === delim) { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char === "\r") { /* ignora CR */ }
    else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((entry) => entry.some((cell) => String(cell).trim() !== ""));
}

const HEADER_WORDS = ["nome","nome completo","nome do morador","data de nascimento","nascimento","nome da mãe","nome da mae","cadastro nome","cidadao nome","usuario saude nome","usuário saúde nome"];
function ehCabecalho(value: string) { return HEADER_WORDS.includes(norm(value)) || ["sexo","cns","cpf","mãe","mae","endereço","endereco","número","numero","unidade","idade"].includes(norm(value)); }

const ASSINATURAS: Record<BiReportType, string[]> = {
  s1: ["cadastro nome","cadastro dn","numero imovel","cadastro cns","cadastro sexo","tipo logradouro","logradouro"],
  s2: ["usuario saude nome","data nascimento","doenca cardiaca","esta domiciliado","esta acamado","esta gestante","usa alcool","usa drogas","fumante","hipertensao","diabetes","cancer","hanseniase","tuberculose","planta medicinal"],
  s3: ["cidadao nome","cidadao dn","cartao cidadao","nome do pai","pais de nascimento","equipe nome","tel residencial","tel celular","tel recado","codigo ine"],
  equipes: ["flor","cor","cor hex","enfermeira","medica","assistente","acs","rua"],
};

function pontuarCabecalho(rows: string[][]) {
  const hits: Record<BiReportType, number> = { s1: 0, s2: 0, s3: 0, equipes: 0 };
  const info: Partial<Record<BiReportType, { line: number; all: Map<string, number> }>> = {};
  const limit = Math.min(8, rows.length);
  for (let i = 0; i < limit; i++) {
    const seen = new Map<string, number>();
    const row = rows[i] || [];
    for (let j = 0; j < row.length; j++) { const token = norm(row[j]); if (token && !seen.has(token)) seen.set(token, j); }
    for (const type of ["s1","s2","s3","equipes"] as BiReportType[]) {
      let hit = 0;
      for (const token of ASSINATURAS[type]) if (seen.has(token)) hit += 1;
      if (hit > hits[type]) { hits[type] = hit; if (hit >= 2) info[type] = { line: i, all: seen }; }
    }
  }
  return { hits, info };
}

export function detectBiReport(fileName: string, rows: string[][]): BiReportType | null {
  const { hits } = pontuarCabecalho(rows);
  const name = norm(fileName);
  const scores: Record<BiReportType, number> = { ...hits };
  for (const type of ["s1","s2","s3","equipes"] as BiReportType[]) if (name.includes(PALAVRA_ARQ[type])) scores[type] += 2;
  let best: BiReportType | null = null; let total = 0;
  for (const type of ["s1","s2","s3","equipes"] as BiReportType[]) if (scores[type] > total) { total = scores[type]; best = type; }
  return total >= 2 ? best : null;
}

const PINOS: Record<BiReportType, Record<string, { alias: string[]; letra: string }>> = {
  s1: {
    nome: { alias: ["cadastro nome"], letra: "E" },
    nascimento: { alias: ["cadastro dn","data nascimento"], letra: "F" },
    mae: { alias: ["nome da mae"], letra: "H" },
    tipoLogr: { alias: ["tipo logradouro"], letra: "I" },
    logradouro: { alias: ["logradouro"], letra: "J" },
    numero: { alias: ["numero imovel"], letra: "K" },
    complemento: { alias: ["complemento"], letra: "L" },
    bairro: { alias: ["bairro"], letra: "M" },
    cns: { alias: ["cadastro cns"], letra: "O" },
    sexo: { alias: ["cadastro sexo"], letra: "P" },
  },
  s2: {
    nome: { alias: ["usuario saude nome"], letra: "A" },
    nascimento: { alias: ["data nascimento"], letra: "B" },
    cns: { alias: ["cns"], letra: "D" },
    cpf: { alias: ["cpf"], letra: "E" },
    sexo: { alias: ["sexo"], letra: "F" },
    c_cardiaca: { alias: ["doenca cardiaca"], letra: "G" },
    c_respiratoria: { alias: ["doenca respiratoria"], letra: "I" },
    c_domiciliado: { alias: ["esta domiciliado"], letra: "J" },
    c_acamado: { alias: ["esta acamado"], letra: "K" },
    c_gestante: { alias: ["esta gestante"], letra: "L" },
    c_etilista: { alias: ["usa alcool"], letra: "M" },
    c_drogas: { alias: ["usa drogas"], letra: "N" },
    c_tabaco: { alias: ["fumante"], letra: "O" },
    c_has: { alias: ["hipertensao"], letra: "P" },
    c_dm: { alias: ["diabetes"], letra: "Y" },
    c_cancer: { alias: ["cancer"], letra: "Z" },
    c_hanseniase: { alias: ["hanseniase"], letra: "AB" },
    c_tuberculose: { alias: ["tuberculose"], letra: "AD" },
  },
  s3: {
    nome: { alias: ["cidadao nome"], letra: "B" },
    nascimento: { alias: ["cidadao dn"], letra: "C" },
    sexo: { alias: ["sexo"], letra: "E" },
    raca: { alias: ["raca"], letra: "F" },
    etnia: { alias: ["etnia"], letra: "G" },
    cpf: { alias: ["cpf"], letra: "H" },
    cns: { alias: ["cns"], letra: "I" },
    cadastro: { alias: ["cartao cidadao"], letra: "J" },
    mae: { alias: ["nome da mae"], letra: "K" },
    pai: { alias: ["nome do pai"], letra: "L" },
    pais: { alias: ["pais de nascimento"], letra: "M" },
    telRes: { alias: ["tel. residencial","tel residencial"], letra: "V" },
    telCel: { alias: ["tel. celular","tel celular"], letra: "W" },
    telRec: { alias: ["tel. recado","tel recado"], letra: "X" },
  },
  equipes: {
    flor: { alias: ["flor"], letra: "A" },
    cor: { alias: ["cor"], letra: "B" },
    corHex: { alias: ["cor hex"], letra: "C" },
    corTexto: { alias: ["cor do texto para contraste","cor do texto"], letra: "D" },
    enfermeira: { alias: ["enfermeira"], letra: "E" },
    medica: { alias: ["medica","médica"], letra: "F" },
    assistente: { alias: ["acs","assistente","agente"], letra: "G" },
    inicio: { alias: [">","inicio","início","de"], letra: "H" },
    fim: { alias: ["<","fim","ate","até"], letra: "I" },
    rua: { alias: ["rua","rua, avenida ou estrada","rua avenida ou estrada"], letra: "J" },
  },
};

function colIdx(letter: string) { let n = 0; for (const ch of String(letter).toUpperCase()) n = n*26 + (ch.charCodeAt(0)-64); return n-1; }
const colI = (row: string[] | undefined, index: number) => (row && row[index] !== undefined) ? String(row[index]).trim() : "";

function criarResolutor(rows: string[][], type: BiReportType) {
  const pinos = PINOS[type];
  const { info } = pontuarCabecalho(rows);
  const found = info[type];
  const all = found?.all ?? null;
  const cache = new Map<string, number>();
  const idx = (field: string): number => {
    const cached = cache.get(field);
    if (cached !== undefined) return cached;
    let index = -1;
    const pin = pinos[field];
    if (pin && all) { for (const alias of pin.alias) { if (all.has(alias)) { index = all.get(alias)!; break; } } }
    if (index < 0 && pin) index = colIdx(pin.letra);
    cache.set(field, index);
    return index;
  };
  return { idx, start: found ? found.line + 1 : 0 };
}

function parseDateCell(value: unknown): string {
  const raw = String(value ?? "").trim(); if (!raw) return "";
  let match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (match) {
    let day = +match[1]; let month = +match[2]; let year = +match[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month > 12 && day <= 12) { const swap = day; day = month; month = swap; }
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return "";
  }
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const year = +match[1]; const month = +match[2]; const day = +match[3];
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }
  return "";
}

export type BiRecord = { nome: string; nascimento: string; mae?: string; cns?: string; cpf?: string; cadastro?: string; tipoLogr?: string; logradouro?: string; numero?: string; sexo?: string; raca?: string; etnia?: string; pai?: string; pais?: string; telRes?: string; telCel?: string; telRec?: string; c_cardiaca?: boolean; c_respiratoria?: boolean; c_domiciliado?: boolean; c_acamado?: boolean; c_gestante?: boolean; c_etilista?: boolean; c_drogas?: boolean; c_tabaco?: boolean; c_has?: boolean; c_dm?: boolean; c_cancer?: boolean; c_hanseniase?: boolean; c_tuberculose?: boolean; };

const clean = (value: unknown) => sanitizarTexto(value, 200) || undefined;
const cleanDigits = (value: unknown) => onlyDigits(value) || undefined;

export function mapBiRows(type: BiReportType, rows: string[][]): BiRecord[] {
  if (type === "equipes") return []; // equipes usa mapEquipesRows
  const resolver = criarResolutor(rows, type);
  const out: BiRecord[] = [];
  for (let i = resolver.start; i < rows.length; i++) {
    const row = rows[i];
    const name = colI(row, resolver.idx("nome"));
    if (!name || ehCabecalho(name)) continue;
    const record: BiRecord = { nome: sanitizarTexto(name, 160), nascimento: parseDateCell(colI(row, resolver.idx("nascimento"))) };
    if (type === "s1") {
      record.mae = clean(colI(row, resolver.idx("mae")));
      const logr = colI(row, resolver.idx("logradouro"));
      record.logradouro = clean(caixaTitulo(stripTipoLogradouro(logr)));
      record.numero = clean(colI(row, resolver.idx("numero")));
      record.cns = cleanDigits(colI(row, resolver.idx("cns")));
      record.sexo = clean(colI(row, resolver.idx("sexo")));
    } else if (type === "s2") {
      record.cns = cleanDigits(colI(row, resolver.idx("cns")));
      record.cpf = cleanDigits(colI(row, resolver.idx("cpf")));
      record.sexo = clean(colI(row, resolver.idx("sexo")));
      record.c_cardiaca = isSim(colI(row, resolver.idx("c_cardiaca")));
      record.c_respiratoria = isSim(colI(row, resolver.idx("c_respiratoria")));
      record.c_domiciliado = isSim(colI(row, resolver.idx("c_domiciliado")));
      record.c_acamado = isSim(colI(row, resolver.idx("c_acamado")));
      record.c_gestante = isSim(colI(row, resolver.idx("c_gestante")));
      record.c_etilista = isSim(colI(row, resolver.idx("c_etilista")));
      record.c_drogas = isSim(colI(row, resolver.idx("c_drogas")));
      record.c_tabaco = isSim(colI(row, resolver.idx("c_tabaco")));
      record.c_has = isSim(colI(row, resolver.idx("c_has")));
      record.c_dm = isSim(colI(row, resolver.idx("c_dm")));
      record.c_cancer = isSim(colI(row, resolver.idx("c_cancer")));
      record.c_hanseniase = isSim(colI(row, resolver.idx("c_hanseniase")));
      record.c_tuberculose = isSim(colI(row, resolver.idx("c_tuberculose")));
    } else {
      record.cpf = cleanDigits(colI(row, resolver.idx("cpf")));
      record.cns = cleanDigits(colI(row, resolver.idx("cns")));
      record.cadastro = cleanDigits(colI(row, resolver.idx("cadastro")));
      record.mae = clean(colI(row, resolver.idx("mae")));
      record.sexo = clean(colI(row, resolver.idx("sexo")));
      record.raca = clean(colI(row, resolver.idx("raca")));
      record.etnia = clean(colI(row, resolver.idx("etnia")));
      record.pai = clean(colI(row, resolver.idx("pai")));
      record.pais = clean(colI(row, resolver.idx("pais")));
      record.telRes = cleanDigits(colI(row, resolver.idx("telRes")));
      record.telCel = cleanDigits(colI(row, resolver.idx("telCel")));
      record.telRec = cleanDigits(colI(row, resolver.idx("telRec")));
    }
    out.push(record);
  }
  return out;
}

// 4º CSV — equipes / território. Coluna A=Flor (inicial), B=Cor, C=Hex, D=Texto contraste, E=Enfermeira, F=Médica, G=Assistente (ACS), H=> inicio, I=< fim, J=rua
export function mapEquipesRows(rows: string[][]): TerritoryEntry[] {
  const resolver = criarResolutor(rows, "equipes");
  const out: TerritoryEntry[] = [];
  for (let i = resolver.start; i < rows.length; i++) {
    const row = rows[i];
    const florRaw = colI(row, resolver.idx("flor"));
    if (!florRaw || norm(florRaw) === "flor") continue;
    const ruaRaw = colI(row, resolver.idx("rua"));
    if (!ruaRaw) continue;
    // Rua pode conter ", apenas 2960 e 3028" — extrai parte antes da vírgula como rua e números como exclusivos
    let rua = ruaRaw;
    let exclusiveFromRua: string[] | null = null;
    const apenasIdx = ruaRaw.toLowerCase().indexOf("apenas");
    if (apenasIdx >= 0) {
      rua = ruaRaw.slice(0, ruaRaw.indexOf(",") >=0 ? ruaRaw.indexOf(",") : apenasIdx).trim();
      const nums = ruaRaw.slice(apenasIdx).match(/\d+/g);
      if (nums && nums.length) exclusiveFromRua = nums;
    }
    rua = caixaTitulo(stripTipoLogradouro(rua));
    if (!rua) continue;
    const flor = sanitizarTexto(florRaw, 40);
    const cor = sanitizarTexto(colI(row, resolver.idx("cor")), 40);
    const corHex = sanitizarTexto(colI(row, resolver.idx("corHex")), 20);
    const corTexto = sanitizarTexto(colI(row, resolver.idx("corTexto")), 20);
    const enfermeira = sanitizarTexto(colI(row, resolver.idx("enfermeira")), 80);
    const medica = sanitizarTexto(colI(row, resolver.idx("medica")), 80);
    const assistente = sanitizarTexto(colI(row, resolver.idx("assistente")), 80);
    if (!enfermeira || !medica || !assistente) continue;
    // Normaliza hex
    let hex = corHex.trim();
    if (hex && !hex.startsWith("#")) hex = "#" + hex;
    hex = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : (hex || "#617787");
    const inicioRaw = colI(row, resolver.idx("inicio"));
    const fimRaw = colI(row, resolver.idx("fim"));
    let rule: ReturnType<typeof parseTerritoryRule>;
    if (exclusiveFromRua) {
      rule = { numberRule: "exclusive", exclusiveNumbers: exclusiveFromRua };
    } else {
      rule = parseTerritoryRule(inicioRaw, fimRaw);
    }
    out.push({
      street: rua.toUpperCase(),
      ...rule,
      team: {
        name: flor,
        color: hex,
        colorName: cor || undefined,
        textColor: corTexto || undefined,
        doctor: medica,
        nurse: enfermeira,
        communityAgent: assistente,
        assistant: assistente,
      },
    });
  }
  return out;
}

const MERGE_FIELDS = ["mae","cns","cpf","cadastro","logradouro","numero","sexo","raca","etnia","pai","pais","telRes","telCel","telRec"] as const;

export function mergeBiPatients(records: BiRecord[]): Patient[] {
  const profiles: BiRecord[] = [];
  const byCns = new Map<string, BiRecord>(); const byCpf = new Map<string, BiRecord>(); const byNameBirth = new Map<string, BiRecord>();
  for (const record of records) {
    const cns = record.cns ? onlyDigits(record.cns) : ""; const cpf = record.cpf ? onlyDigits(record.cpf) : "";
    const key = record.nome && record.nascimento ? `${norm(record.nome)}|${record.nascimento}` : "";
    let target: BiRecord | undefined;
    if (cns && byCns.has(cns)) target = byCns.get(cns);
    else if (cpf && byCpf.has(cpf)) target = byCpf.get(cpf);
    else if (key && byNameBirth.has(key)) target = byNameBirth.get(key);
    if (!target) {
      target = { nome: record.nome, nascimento: record.nascimento };
      profiles.push(target);
      if (cns) { byCns.set(cns, target); (target as any).cnsVistos = [cns]; }
      if (cpf) byCpf.set(cpf, target);
      if (key) byNameBirth.set(key, target);
    } else {
      if (cns && !byCns.has(cns)) { byCns.set(cns, target); const v: string[] = (target as any).cnsVistos || []; v.push(cns); (target as any).cnsVistos = v; if (v.length>1) (target as any).cnsExtra = v[1]; }
      if (cpf && !byCpf.has(cpf)) byCpf.set(cpf, target);
      if (key && !byNameBirth.has(key)) byNameBirth.set(key, target);
    }
    for (const field of MERGE_FIELDS) { const value = (record as any)[field]; if (value && !(target as any)[field]) (target as any)[field] = value; }
    for (const flag of ["c_cardiaca","c_respiratoria","c_domiciliado","c_acamado","c_gestante","c_etilista","c_drogas","c_tabaco","c_has","c_dm","c_cancer","c_hanseniase","c_tuberculose"]) {
      const v = (record as any)[flag];
      if (v && !(target as any)[flag]) (target as any)[flag] = v;
    }
  }
  return profiles.filter((profile) => profile.nome).map(toPatient);
}

function toPatient(profile: BiRecord): Patient {
  const street = profile.logradouro ? caixaTitulo(stripTipoLogradouro(profile.logradouro)) : "";
  const address = [street, profile.numero].filter(Boolean).join(", ");
  const phones = Array.from(new Set([profile.telCel, profile.telRes, profile.telRec].map((value) => onlyDigits(value)).filter((value) => value.length === 10 || value.length === 11)));
  const id = (profile.cns && onlyDigits(profile.cns)) || (profile.cadastro && onlyDigits(profile.cadastro)) || `${profile.nome}-${profile.nascimento}`;
  const healthFlags: Record<string, boolean> = {};
  for (const k of ["c_cardiaca","c_respiratoria","c_domiciliado","c_acamado","c_gestante","c_etilista","c_drogas","c_tabaco","c_has","c_dm","c_cancer","c_hanseniase","c_tuberculose"]) if ((profile as any)[k]) healthFlags[k]=true;
  return {
    id,
    registration: profile.cadastro ? onlyDigits(profile.cadastro) : undefined,
    name: sanitizarTexto(profile.nome, 160),
    mother: profile.mae ? sanitizarTexto(profile.mae, 160) : undefined,
    birth: profile.nascimento || undefined,
    address: address || undefined,
    cns: profile.cns ? onlyDigits(profile.cns) : undefined,
    cnsExtra: (profile as any).cnsExtra ? onlyDigits((profile as any).cnsExtra) : undefined,
    cpf: profile.cpf ? onlyDigits(profile.cpf) : undefined,
    sexo: profile.sexo || undefined,
    raca: profile.raca || undefined,
    etnia: profile.etnia || undefined,
    pai: profile.pai || undefined,
    pais: profile.pais || undefined,
    phone: phones[0],
    phones: phones.length ? phones : undefined,
    healthFlags: Object.keys(healthFlags).length ? healthFlags : undefined,
  };
}
