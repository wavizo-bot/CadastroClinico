// Importação da base do BI — MODELO ATUAL do sistema oficial (cabecalhos de 10/2026):
// s1 "Cadastro - Analise detalhada", s2 "Informacoes questionario auto referido",
// s3 "Cadastros detalhados", s4 "Usuario saude - Analise detalhada" + equipes.csv,
// reconhecidos pelo conteudo do cabecalho e unidos cruzando CNS/CPF/nome+nascimento.
// SEM LEGADO: quando o BI mudar de layout, atualizar ASSINATURAS e PINOS para o
// cabecalho novo (tokens e letras atuais) e apagar o que nao existir mais.
// Regras de compreensao: delimitador detectado, BOM/windows-1252, pinos por alias/letra,
// stripTipoLogradouro, caixaTitulo, isSim, ordem CNS > CPF > nome+nascimento.
// equipes.csv — Flor/Cor/Hex/Texto/Enfermeira/Medica/Assistente (ACS) + faixa + rua.
import type { Patient, TerritoryEntry } from "./dataStore";
import { ehVarjao, padronizarEndereco, padronizarLogradouro, parseTerritoryRule, VARJAO_ROTULO } from "./territoryRules";

export type BiReportType = "s1" | "s2" | "s3" | "s4" | "equipes";

export const BI_REPORT_LABELS: Record<BiReportType, string> = {
  s1: "CADASTRO — ANÁLISE DETALHADA",
  s2: "QUESTIONÁRIO AUTO REFERIDO",
  s3: "SAÚDE — CADASTROS DETALHADOS",
  s4: "CADASTRO — ACOMPANHAMENTO INDIVIDUAL",
  equipes: "EQUIPES — TERRITÓRIO",
};

const PALAVRA_ARQ: Record<BiReportType, string> = { s1: "analise detalhada", s2: "auto referido", s3: "cadastros detalhados", s4: "", equipes: "equipes" };

const BI_TIPOS: BiReportType[] = ["s1", "s2", "s3", "s4", "equipes"];

const norm = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

/* CNS — a base traz celulas com varios CNS separados por virgula/espaco e runs de
   15 digitos (validos). Guarda todos os trechos com 10+ digitos, sem repetir. */
export function listaCNS(value: unknown): string[] {
  const partes = String(value ?? "").split(/[^0-9]+/).filter((t) => t.length >= 10);
  const unicos: string[] = [];
  for (const p of partes) if (!unicos.includes(p)) unicos.push(p);
  return unicos;
}
/* Regra do "7": se algum CNS comeca com 7, escolhe o maior desses; se nenhum
   comeca com 7, escolhe o maior de todos. */
export function cnsPrincipal(lista: string[]): string {
  const l = (Array.isArray(lista) ? lista : []).filter(Boolean);
  if (!l.length) return "";
  const com7 = l.filter((c) => String(c).charAt(0) === "7");
  const escopo = com7.length ? com7 : l;
  return escopo.slice().sort((a, b) => (b.length - a.length) || String(b).localeCompare(String(a)))[0];
}

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
// Coluna de detalhe de doença (s2): vazia ou "Não informado" = não tem;
// qualquer resposta ("Outro", "Asma", "Insuficiência Renal", "Não Sabe"...) = tem —
// bate exatamente com a flag SIM do relatório s4 (56 cardíacas, 30 respiratórias, 9 rins).
const isPresenca = (v: unknown) => { const t = norm(v); return t !== "" && t !== "nao informado"; };

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
  s1: ["estabelecimento","profissional responsavel","numero imovel","tipo logradouro","logradouro","bairro","origem do cadastro"],
  s2: ["usuario saude nome","data nascimento","doenca cardiaca","esta domiciliado","esta acamado","esta gestante","usa alcool","usa drogas","fumante","hipertensao","diabetes","cancer","hanseniase","tuberculose","usa planta medicinal"],
  s3: ["cidadao nome","cidadao dn","cartao cidadao","nome do pai","pais de nascimento","equipe nome","tel. residencial","tel. celular","tel. recado","codigo ine"],
  s4: ["situacao de rua","raca/cor","tempo em situacao de rua","orientacao sexual","resp. familiar cns","doenca cardiaca","doenca respiratoria"],
  equipes: ["flor","cor","cor hex","enfermeira","medica","assistente","acs","rua"],
};

function pontuarCabecalho(rows: string[][]) {
  const hits: Record<BiReportType, number> = { s1: 0, s2: 0, s3: 0, s4: 0, equipes: 0 };
  const info: Partial<Record<BiReportType, { line: number; all: Map<string, number> }>> = {};
  const limit = Math.min(8, rows.length);
  for (let i = 0; i < limit; i++) {
    const seen = new Map<string, number>();
    const row = rows[i] || [];
    for (let j = 0; j < row.length; j++) { const token = norm(row[j]); if (token && !seen.has(token)) seen.set(token, j); }
    for (const type of BI_TIPOS) {
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
  for (const type of BI_TIPOS) if (PALAVRA_ARQ[type] && name.includes(PALAVRA_ARQ[type])) scores[type] += 2;
  let best: BiReportType | null = null; let total = 0;
  for (const type of BI_TIPOS) if (scores[type] > total) { total = scores[type]; best = type; }
  return total >= 2 ? best : null;
}

const PINOS: Record<BiReportType, Record<string, { alias: string[]; letra: string }>> = {
  s1: {
    // MODELO ATUAL (10/2026): ESTABELECIMENTO/INE/PROFISSIONAL/DATAS na frente;
    // identificacao em H=CNS, I=NOME, J=DN, L=SEXO e cadastro/endereco a partir de M.
    nome: { alias: ["nome"], letra: "I" },
    nascimento: { alias: ["dn"], letra: "J" },
    mae: { alias: ["nome da mae"], letra: "M" },
    tipoLogr: { alias: ["tipo logradouro"], letra: "O" },
    logradouro: { alias: ["logradouro"], letra: "P" },
    numero: { alias: ["numero imovel"], letra: "Q" },
    complemento: { alias: ["complemento"], letra: "R" },
    bairro: { alias: ["bairro"], letra: "S" },
    cns: { alias: ["cns"], letra: "H" },
    sexo: { alias: ["sexo"], letra: "L" },
  },
  s2: {
    nome: { alias: ["usuario saude nome"], letra: "A" },
    nascimento: { alias: ["data nascimento"], letra: "B" },
    cns: { alias: ["cns"], letra: "D" },
    cpf: { alias: ["cpf"], letra: "E" },
    sexo: { alias: ["sexo"], letra: "F" },
    // Modelo atual: as flags do s2 são colunas "TEM ..." (SIM/NÃO); a cardíaca só
    // vem como detalhe ("DOENÇA CARDÍACA": vazio = não tem) — leitura via isPresenca.
    c_cardiaca: { alias: ["doenca cardiaca"], letra: "G" },
    c_respiratoria: { alias: ["tem doenca respiratoria"], letra: "H" },
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
    c_rins: { alias: ["tem problema rins"], letra: "W" },
    c_avc: { alias: ["avc / derrame"], letra: "AA" },
    c_infarto: { alias: ["infarto"], letra: "AC" },
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
    telCom: { alias: ["tel. comercial","tel comercial"], letra: "Y" },
  },
  s4: {
    nome: { alias: ["cadastro nome"], letra: "C" },
    nascimento: { alias: ["cadastro dn","data nascimento"], letra: "D" },
    mae: { alias: ["nome da mae"], letra: "F" },
    cns: { alias: ["cadastro cns"], letra: "G" },
    sexo: { alias: ["cadastro sexo"], letra: "I" },
    c_respiratoria: { alias: ["doenca respiratoria"], letra: "M" },
    c_cardiaca: { alias: ["doenca cardiaca"], letra: "N" },
    raca: { alias: ["raca/cor"], letra: "O" },
    c_etilista: { alias: ["usa alcool"], letra: "R" },
    c_drogas: { alias: ["usa drogas"], letra: "S" },
    c_gestante: { alias: ["gestante"], letra: "U" },
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

export type BiRecord = { nome: string; nascimento: string; mae?: string; cns?: string; cnsTodos?: string[]; cpf?: string; cadastro?: string; tipoLogr?: string; logradouro?: string; numero?: string; sexo?: string; raca?: string; etnia?: string; pai?: string; pais?: string; telRes?: string; telCel?: string; telRec?: string; telCom?: string; c_cardiaca?: boolean; c_respiratoria?: boolean; c_domiciliado?: boolean; c_acamado?: boolean; c_gestante?: boolean; c_etilista?: boolean; c_drogas?: boolean; c_tabaco?: boolean; c_has?: boolean; c_dm?: boolean; c_cancer?: boolean; c_hanseniase?: boolean; c_tuberculose?: boolean; c_rins?: boolean; c_avc?: boolean; c_infarto?: boolean; };

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
    const guardaCns = () => { const l = listaCNS(colI(row, resolver.idx("cns"))); if (l.length) { record.cnsTodos = l; record.cns = cnsPrincipal(l); } };
    if (type === "s1") {
      record.mae = clean(colI(row, resolver.idx("mae")));
      const logr = colI(row, resolver.idx("logradouro"));
      record.logradouro = clean(caixaTitulo(stripTipoLogradouro(logr)));
      record.numero = clean(colI(row, resolver.idx("numero")));
      guardaCns();
      record.sexo = clean(colI(row, resolver.idx("sexo")));
    } else if (type === "s2") {
      guardaCns();
      record.cpf = cleanDigits(colI(row, resolver.idx("cpf")));
      record.sexo = clean(colI(row, resolver.idx("sexo")));
      record.c_cardiaca = isPresenca(colI(row, resolver.idx("c_cardiaca")));
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
      record.c_rins = isSim(colI(row, resolver.idx("c_rins")));
      record.c_avc = isSim(colI(row, resolver.idx("c_avc")));
      record.c_infarto = isSim(colI(row, resolver.idx("c_infarto")));
    } else if (type === "s4") {
      // s4 atual: cadastro com raça, condições e situação de rua.
      guardaCns();
      record.mae = clean(colI(row, resolver.idx("mae")));
      record.sexo = clean(colI(row, resolver.idx("sexo")));
      record.raca = clean(colI(row, resolver.idx("raca")));
      record.c_respiratoria = isSim(colI(row, resolver.idx("c_respiratoria")));
      record.c_cardiaca = isSim(colI(row, resolver.idx("c_cardiaca")));
      record.c_etilista = isSim(colI(row, resolver.idx("c_etilista")));
      record.c_drogas = isSim(colI(row, resolver.idx("c_drogas")));
      record.c_gestante = isSim(colI(row, resolver.idx("c_gestante")));
    } else {
      record.cpf = cleanDigits(colI(row, resolver.idx("cpf")));
      guardaCns();
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
      record.telCom = cleanDigits(colI(row, resolver.idx("telCom")));
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
    // Faixa do card decide se a regra da Augusta x Dario se aplica.
    const faixaNums = (rule.exclusiveNumbers ?? []).map((value) => parseInt(value, 10)).filter((value) => !isNaN(value));
    const faixaComeco = rule.numberRule === "exclusive" && faixaNums.length ? String(Math.min(...faixaNums)) : rule.rangeStart;
    const faixaFim = rule.numberRule === "exclusive" && faixaNums.length ? String(Math.max(...faixaNums)) : rule.rangeEnd;
    const ruaFinal = (padronizarLogradouro(rua, faixaComeco, faixaFim) ?? rua).toUpperCase();
    out.push({
      street: ruaFinal,
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

const MERGE_FIELDS = ["mae","cpf","cadastro","logradouro","numero","sexo","raca","etnia","pai","pais","telRes","telCel","telRec","telCom"] as const;
const FLAG_FIELDS = ["c_cardiaca","c_respiratoria","c_domiciliado","c_acamado","c_gestante","c_etilista","c_drogas","c_tabaco","c_has","c_dm","c_cancer","c_hanseniase","c_tuberculose","c_rins","c_avc","c_infarto"] as const;

export function mergeBiPatients(records: BiRecord[]): Patient[] {
  /* UNION-FIND: um registro pode trazer 2 CNS e conectar dois perfis que antes
     ficavam separados; cada CNS, cada CPF e cada nome+nascimento liga os registros. */
  const pai: number[] = [];
  const find = (i: number): number => { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; };
  const unir = (a: number, b: number) => { const ra = find(a); const rb = find(b); if (ra !== rb) pai[rb] = ra; };
  const byCns = new Map<string, number>(); const byCpf = new Map<string, number>(); const byNameBirth = new Map<string, number>();
  const listas: string[][] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    pai.push(i);
    const lista = record.cnsTodos && record.cnsTodos.length ? record.cnsTodos : listaCNS(record.cns);
    listas.push(lista);
    for (const cns of lista) { if (byCns.has(cns)) unir(i, byCns.get(cns)!); else byCns.set(cns, i); }
    const cpf = record.cpf ? onlyDigits(record.cpf) : "";
    if (cpf) { if (byCpf.has(cpf)) unir(i, byCpf.get(cpf)!); else byCpf.set(cpf, i); }
    const key = record.nome && record.nascimento ? `${norm(record.nome)}|${record.nascimento}` : "";
    if (key) { if (byNameBirth.has(key)) unir(i, byNameBirth.get(key)!); else byNameBirth.set(key, i); }
  }
  const grupos = new Map<number, number[]>();
  for (let i = 0; i < records.length; i++) {
    const raiz = find(i);
    const g = grupos.get(raiz);
    if (g) g.push(i); else grupos.set(raiz, [i]);
  }
  const profiles: BiRecord[] = [];
  const enderecoPorPerfil = new Map<BiRecord, string>();
  for (const ids of Array.from(grupos.values())) {
    const alvo: BiRecord = { nome: records[ids[0]].nome, nascimento: records[ids[0]].nascimento };
    const cnsTodos: string[] = [];
    const enderecos = new Set<string>();
    for (const i of ids) {
      const record = records[i];
      for (const cns of listas[i]) if (!cnsTodos.includes(cns)) cnsTodos.push(cns);
      if (record.logradouro) {
        const rua = caixaTitulo(stripTipoLogradouro(record.logradouro));
        const bruto = rua + (record.numero ? `, ${record.numero}` : "");
        const rotulo = padronizarEndereco(bruto);
        if (rotulo) enderecos.add(rotulo);
      }
      for (const field of MERGE_FIELDS) { const value = record[field]; if (value && !alvo[field]) (alvo as Record<string, unknown>)[field] = value; }
      for (const flag of FLAG_FIELDS) { const value = record[flag]; if (value && !alvo[flag]) (alvo as unknown as Record<string, boolean>)[flag] = value; }
    }
    alvo.cnsTodos = cnsTodos;
    alvo.cns = cnsPrincipal(cnsTodos) || undefined;
    // Endereços divergentes: desempate alfabético (mesmo depois da regra da rua).
    const listaEnd = Array.from(enderecos).sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (listaEnd.length) enderecoPorPerfil.set(alvo, listaEnd[0]);
    profiles.push(alvo);
  }
  return profiles.filter((profile) => profile.nome).map((profile) => toPatient(profile, enderecoPorPerfil.get(profile)));
}

function toPatient(profile: BiRecord, endereco?: string): Patient {
  const street = profile.logradouro ? caixaTitulo(stripTipoLogradouro(profile.logradouro)) : "";
  const montado = [street, profile.numero].filter(Boolean).join(", ");
  const address = padronizarEndereco(endereco || montado || undefined);
  // Telefone: 8 a 11 dígitos — mesma regra do Acompanha Digital (antes só 10/11,
  // e um telefone fixo curto sumia de um app e aparecia no outro).
  const phones = Array.from(new Set([profile.telCel, profile.telRes, profile.telRec, profile.telCom].map((value) => onlyDigits(value)).filter((value) => value.length >= 8 && value.length <= 11)));
  const id = (profile.cns && onlyDigits(profile.cns)) || (profile.cadastro && onlyDigits(profile.cadastro)) || `${profile.nome}-${profile.nascimento}`;
  const healthFlags: Record<string, boolean> = {};
  for (const k of FLAG_FIELDS) if ((profile as any)[k]) healthFlags[k] = true;
  const cnsTodos = (profile.cnsTodos && profile.cnsTodos.length ? profile.cnsTodos : listaCNS(profile.cns)).filter(Boolean);
  return {
    id,
    registration: profile.cadastro ? onlyDigits(profile.cadastro) : undefined,
    name: sanitizarTexto(profile.nome, 160),
    mother: profile.mae ? sanitizarTexto(profile.mae, 160) : undefined,
    birth: profile.nascimento || undefined,
    address: address || undefined,
    cns: profile.cns ? onlyDigits(profile.cns) : undefined,
    cnsExtra: cnsTodos[1] ? onlyDigits(cnsTodos[1]) : undefined,
    cnsTodos: cnsTodos.length ? cnsTodos.map((value) => onlyDigits(value)).filter(Boolean) : undefined,
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
