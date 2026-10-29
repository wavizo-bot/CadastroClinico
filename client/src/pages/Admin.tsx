// Direção visual: Saúde Pública Editorial — painel administrativo em coluna de controle, legível no desktop e focado em operações de dados.
// Direção visual: Saúde Pública Editorial — conferência administrativa objetiva, legível e consistente com o aplicativo de campo.
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, Check, ChevronRight, CircleHelp, ClipboardPaste, Database, Download, FileSpreadsheet, Flower2, ImageIcon, Info, MapPinned, Plus, RotateCcw, Save, Settings2, Upload, Users, X } from "lucide-react";
import type { ClinicData, EmbeddedImage, Patient, TeamAssignment, TerritoryEntry, UnitOperationEntry } from "@/lib/dataStore";
import { loadAdminDataset, saveAdminDataset } from "@/lib/adminStorage";
import { ChangePreview, MergeMetrics, preparePatientMerge, prepareTerritoryMerge, TerritoryPatch } from "@/lib/safeMerge";
import { BI_REPORT_LABELS, detectBiReport, mapBiRows, mergeBiPatients, parseBiCsv, readBiFileText, type BiReportType } from "@/lib/biImport";
import { createEmbeddedImage, embeddedImageSize, embeddedImageUrl } from "@/lib/branding";
import { parseTerritoryRule } from "@/lib/territoryRules";

type AdminTab = "patients" | "territory" | "operations" | "branding" | "export";
type SheetRow = Record<string, unknown>;
type PendingMerge = { kind: "patients" | "territory"; values: Patient[] | TerritoryEntry[]; changes: ChangePreview[]; metrics: MergeMetrics; incoming: number };
type BrandingSlot = "clinicLogo" | "cityLogo" | "centralImage";
type PendingBranding = { slot: BrandingSlot; image: EmbeddedImage | null };
type BiFileEntry = { name: string; rows: string[][]; type: BiReportType | null; count: number };
const COLUMN_GUIDES = {
  patients: [["A", "Nome completo"], ["B", "Nome da mãe"], ["C", "Nascimento (DD/MM/AAAA)"], ["D", "Cadastro"], ["E", "Rua/endereço"], ["F", "Número do endereço"], ["G", "CNS"], ["H", "CPF"], ["I", "Telefone 1"], ["J", "Telefone 2"]],
  territory: [["K", "Cor HEX"], ["L", "Flor/equipe"], ["M", "Médica"], ["N", "Enfermeira"], ["O", "ACS"], ["P", "Rua"], ["Q", "Número inicial"], ["R", "Número final"]],
  operations: [["S", "Nome do setor"], ["T", "Texto do setor"]],
} as const;
const REQUIRED_COLUMNS: Record<"patients" | "territory" | "operations", string[]> = { patients: ["A"], territory: ["K", "L", "M", "N", "O", "P"], operations: ["S", "T"] };

const CLINICA_LOGO = "";
const CITY_LOGO = "";
const NEW_DATA: ClinicData = { schemaVersion: 1, updatedAt: new Date().toISOString(), patients: [], territory: [], unitOperation: [], branding: {} };
const FLOWER_COLORS: Record<string, string> = { "branca": "#ffffff", "azul": "#2f93c7", "lilas": "#7b55a3", "violeta": "#7b55a3", "amarela": "#f2c91f", "rosegold": "#9c5a64", "colorido": "#1780bf" };

const normalize = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const cleanText = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
const compactPhone = (value: unknown) => cleanText(value).replace(/\D/g, "");
const patientKey = (patient: Patient) => normalize(patient.cns || patient.id || `${patient.name}|${patient.birth || ""}|${patient.mother || ""}`);
const territoryKey = (entry: TerritoryEntry) => [normalize(entry.street), normalize(entry.rangeStart), normalize(entry.rangeEnd), normalize(entry.team.communityAgent)].join("|");
const operationKey = (entry: UnitOperationEntry) => normalize(entry.title);

function readColumn(row: SheetRow, letter: string) { const key = Object.keys(row).find((candidate) => candidate.trim().toUpperCase() === letter); return key ? row[key] : ""; }

function normalizeBirth(value: unknown) {
  const raw = cleanText(value).replace(/\s+00:00:00$/, "");
  if (!raw) return "";
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const br = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(raw);
  if (!br) return raw;
  const year = br[3].length === 2 ? `19${br[3]}` : br[3];
  return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
}

function toPatient(row: SheetRow): Patient | null {
  const name = cleanText(readColumn(row, "A"));
  if (!name) return null;
  const birth = normalizeBirth(readColumn(row, "C"));
  const cns = cleanText(readColumn(row, "G"));
  const registration = cleanText(readColumn(row, "D"));
  const id = cns || registration || `${name}-${birth}`;
  const phones = [compactPhone(readColumn(row, "I")), compactPhone(readColumn(row, "J"))].filter((phone) => phone.length >= 8 && phone.length <= 11);
  const street = cleanText(readColumn(row, "E")); const number = cleanText(readColumn(row, "F"));
  return {
    id,
    registration: registration || undefined,
    name,
    mother: cleanText(readColumn(row, "B")) || undefined,
    birth,
    address: [street, number].filter(Boolean).join(", ") || undefined,
    cns: cns || undefined,
    cpf: cleanText(readColumn(row, "H")) || undefined,
    phone: phones[0],
    phones: phones.length ? phones : undefined,
  };
}

function toTerritory(row: SheetRow): TerritoryPatch | null {
  const street = cleanText(readColumn(row, "P"));
  const doctor = cleanText(readColumn(row, "M"));
  const nurse = cleanText(readColumn(row, "N"));
  const communityAgent = cleanText(readColumn(row, "O"));
  if (!street) return null;
  const colorName = cleanText(readColumn(row, "K"));
  const flower = cleanText(readColumn(row, "L"));
  const rule = parseTerritoryRule(readColumn(row, "Q"), readColumn(row, "R"));
  const team = { name: flower || undefined, colorName: colorName || undefined, doctor: doctor || undefined, nurse: nurse || undefined, communityAgent: communityAgent || undefined };
  return { street: street.toUpperCase(), ...rule, team: { ...team, ...(colorName ? { color: /^#[0-9A-Fa-f]{6}$/.test(colorName) ? colorName : FLOWER_COLORS[normalize(colorName)] || "#617787" } : {}) } };
}

function toOperation(row: SheetRow): UnitOperationEntry | null {
  const title = cleanText(readColumn(row, "S"));
  const text = cleanText(readColumn(row, "T"));
  return title && text ? { title, text } : null;
}

function mergeBy<T>(current: T[], incoming: T[], keyFor: (item: T) => string) {
  const map = new Map(current.map((item) => [keyFor(item), item]));
  let added = 0;
  let changed = 0;
  let duplicates = 0;
  incoming.forEach((item) => {
    const key = keyFor(item);
    const old = map.get(key);
    if (!old) { map.set(key, item); added += 1; return; }
    if (JSON.stringify(old) === JSON.stringify(item)) { duplicates += 1; return; }
    map.set(key, item); changed += 1;
  });
  return { values: Array.from(map.values()), added, changed, duplicates };
}

function parseRows(raw: string) {
  const workbook = XLSX.read(raw, { type: "string", raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<SheetRow>(firstSheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
}

function parseFile(file: File) {
  return new Promise<SheetRow[]>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: "array", raw: false, cellDates: false });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json<SheetRow>(firstSheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" }));
      } catch { reject(new Error("O arquivo não parece ser uma planilha ou CSV válido.")); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function downloadJson(data: ClinicData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `cadastro-clinico-${data.updatedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatPhoneIssue(patient: Patient) {
  const phones = patient.phones ?? (patient.phone ? [patient.phone] : []);
  return phones.some((phone) => phone.length !== 10 && phone.length !== 11) ? "Formato inválido" : "";
}

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("secao") === "imagens" ? "branding" : "patients");
  const [data, setData] = useState<ClinicData>(NEW_DATA);
  const [ready, setReady] = useState(false);
  const [paste, setPaste] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [patientFilter, setPatientFilter] = useState("");
  const [territoryForm, setTerritoryForm] = useState({ street: "", rangeStart: "", rangeEnd: "", flower: "", colorName: "", doctor: "", nurse: "", communityAgent: "" });
  const [operationForm, setOperationForm] = useState({ title: "", text: "" });
  const [pendingMerge, setPendingMerge] = useState<PendingMerge | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [showReplacements, setShowReplacements] = useState(false);
  const [biFiles, setBiFiles] = useState<BiFileEntry[]>([]);
  const [pendingBranding, setPendingBranding] = useState<PendingBranding | null>(null);
  const [brandingConfirmation, setBrandingConfirmation] = useState("");
  const [brandingWorking, setBrandingWorking] = useState<BrandingSlot | null>(null);
  const [showColumnGuide, setShowColumnGuide] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const biInputRef = useRef<HTMLInputElement>(null);
  const clinicLogoRef = useRef<HTMLInputElement>(null);
  const cityLogoRef = useRef<HTMLInputElement>(null);
  const centralImageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void loadAdminDataset().then((saved) => { if (active && saved) setData(saved); if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (ready) void saveAdminDataset(data); }, [data, ready]);

  const validPhones = useMemo(() => data.patients.reduce((count, patient) => count + (formatPhoneIssue(patient) ? 1 : 0), 0), [data.patients]);
  const filteredPatients = useMemo(() => data.patients.filter((patient) => normalize(`${patient.name} ${patient.cns || ""} ${patient.address || ""}`).includes(normalize(patientFilter))).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).slice(0, 12), [data.patients, patientFilter]);
  const jsonSizeKb = useMemo(() => Math.ceil(new Blob([JSON.stringify(data)]).size / 1024), [data]);
  const brandingDate = useMemo(() => [data.branding?.clinicLogo?.updatedAt, data.branding?.cityLogo?.updatedAt, data.branding?.centralImage?.updatedAt].filter((value): value is string => Boolean(value)).sort().at(-1), [data.branding]);

  function announce(message: string) { setError(""); setNotice(message); window.setTimeout(() => setNotice(""), 4200); }
  function replaceData(next: ClinicData) { setData({ ...next, updatedAt: new Date().toISOString() }); }

  function applyMerge(pending: PendingMerge) {
    if (pending.kind === "patients") replaceData({ ...data, patients: pending.values as Patient[] });
    else replaceData({ ...data, territory: pending.values as TerritoryEntry[] });
    const { added, filled, demoReplaced, duplicates, skipped } = pending.metrics;
    const parts = [`${pending.incoming} linhas lidas`, `${added} incluídos`, `${filled} campos preenchidos`];
    if (demoReplaced) parts.push(`${demoReplaced} dados demonstrativos substituídos`);
    if (duplicates) parts.push(`${duplicates} duplicidades ignoradas`);
    if (skipped) parts.push(`${skipped} linhas não incluídas por segurança`);
    announce(parts.join(" · "));
    setPendingMerge(null); setConfirmation(""); setShowReplacements(false);
  }
  function stageMerge(kind: "patients" | "territory", incoming: Patient[] | TerritoryPatch[]) {
    const result = kind === "patients"
      ? preparePatientMerge(data.patients, incoming as Patient[])
      : prepareTerritoryMerge(data.territory, incoming as TerritoryPatch[]);
    const pending: PendingMerge = { kind, values: result.values, changes: result.changes, metrics: result.metrics, incoming: incoming.length };
    if (pending.changes.length) {
      setPendingMerge(pending); setConfirmation(""); setShowReplacements(false);
      announce(`${pending.changes.length} ${kind === "patients" ? "pessoas terão" : "trechos terão"} informações substituídas. Revise e escreva CONFIRMO para aplicar.`);
      return;
    }
    applyMerge(pending);
  }
  function importRows(kind: AdminTab, rows: SheetRow[]) {
    if (kind === "patients" || kind === "territory" || kind === "operations") {
      const headers = new Set(Object.keys(rows[0] ?? {}).map((header) => header.trim().toUpperCase()));
      const missing = REQUIRED_COLUMNS[kind].filter((letter) => !headers.has(letter));
      if (missing.length) { setError(`A primeira linha deve conter as letras ${REQUIRED_COLUMNS[kind].join(", ")}. Faltam: ${missing.join(", ")}.`); return; }
    }
    if (kind === "patients") {
      const incoming = rows.map(toPatient).filter((patient): patient is Patient => Boolean(patient));
      stageMerge("patients", incoming);
    }
    if (kind === "territory") {
      const incoming = rows.map(toTerritory).filter((entry): entry is TerritoryPatch => Boolean(entry));
      stageMerge("territory", incoming);
    }
    if (kind === "operations") {
      const incoming = rows.map(toOperation).filter((entry): entry is UnitOperationEntry => Boolean(entry));
      const result = mergeBy(data.unitOperation, incoming, operationKey);
      replaceData({ ...data, unitOperation: result.values.sort((a, b) => a.title.localeCompare(b.title, "pt-BR")) });
      announce(`${incoming.length} linhas lidas: ${result.added} setores incluídos, ${result.changed} atualizados e ${result.duplicates} duplicidades ignoradas.`);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    try { importRows(tab, await parseFile(file)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível importar o arquivo."); }
    event.target.value = "";
  }
  function handlePaste() {
    setError("");
    try {
      const rows = parseRows(paste);
      if (!rows.length) throw new Error("Nenhuma linha de dados foi encontrada.");
      importRows(tab, rows);
      setPaste("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível ler o conteúdo colado."); }
  }
  async function handleBiFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    try {
      const entries: BiFileEntry[] = [];
      for (const file of files) {
        const rows = parseBiCsv(await readBiFileText(file));
        const type = detectBiReport(file.name, rows);
        entries.push({ name: file.name, rows, type, count: type ? mapBiRows(type, rows).length : 0 });
      }
      if (!entries.length) return;
      setBiFiles((previous) => [...previous.filter((old) => !entries.some((added) => added.name === old.name)), ...entries]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível ler os arquivos CSV do BI."); }
  }
  function assignBiType(name: string, type: BiReportType | "") {
    setBiFiles((previous) => previous.map((entry) => entry.name === name ? { ...entry, type: type || null, count: type ? mapBiRows(type, entry.rows).length : 0 } : entry));
  }
  function importBiReports() {
    const recognized = biFiles.filter((entry): entry is BiFileEntry & { type: BiReportType } => Boolean(entry.type));
    if (!recognized.length) { setError("Nenhum relatório foi reconhecido. Escolha os CSVs exportados do BI."); return; }
    const records = recognized.flatMap((entry) => mapBiRows(entry.type, entry.rows));
    const patients = mergeBiPatients(records);
    if (!patients.length) { setError("Os arquivos não continham pacientes válidos."); return; }
    setBiFiles([]);
    stageMerge("patients", patients);
  }
  function addTerritory() {
    const rule = parseTerritoryRule(territoryForm.rangeStart, territoryForm.rangeEnd);
    const entry: TerritoryEntry = { street: territoryForm.street.trim().toUpperCase(), ...rule, team: { name: territoryForm.flower.trim() || undefined, colorName: territoryForm.colorName.trim() || undefined, color: /^#[0-9A-Fa-f]{6}$/.test(territoryForm.colorName) ? territoryForm.colorName : FLOWER_COLORS[normalize(territoryForm.colorName)] || "#617787", doctor: territoryForm.doctor.trim(), nurse: territoryForm.nurse.trim(), communityAgent: territoryForm.communityAgent.trim() } };
    if (!entry.street || !entry.team.doctor || !entry.team.nurse || !entry.team.communityAgent) { setError("Preencha rua, médica(o), enfermeira(o) e agente comunitária(o)."); return; }
    stageMerge("territory", [entry]);
    setTerritoryForm({ street: "", rangeStart: "", rangeEnd: "", flower: "", colorName: "", doctor: "", nurse: "", communityAgent: "" });
  }
  function addOperation() {
    const entry: UnitOperationEntry = { title: operationForm.title.trim(), text: operationForm.text.trim() };
    if (!entry.title || !entry.text) { setError("Preencha o setor e as informações." ); return; }
    const result = mergeBy(data.unitOperation, [entry], operationKey);
    replaceData({ ...data, unitOperation: result.values.sort((a, b) => a.title.localeCompare(b.title, "pt-BR")) });
    setOperationForm({ title: "", text: "" });
    announce(result.added ? "Setor incluído." : result.changed ? "Setor atualizado." : "Esse setor já estava cadastrado.");
  }

  function applyBranding(slot: BrandingSlot, image: EmbeddedImage | null) {
    replaceData({ ...data, branding: { ...(data.branding ?? {}), [slot]: image } });
    setPendingBranding(null); setBrandingConfirmation("");
    announce(image ? "Imagem institucional atualizada. Ela será incluída no próximo JSON." : "Logo restaurado para a imagem interna do aplicativo.");
  }
  async function handleBrandingFile(slot: BrandingSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setError(""); setBrandingWorking(slot);
    try {
      const image = await createEmbeddedImage(file);
      if (data.branding?.[slot]) { setPendingBranding({ slot, image }); setBrandingConfirmation(""); announce("Revise a nova imagem e escreva CONFIRMO para substituir a imagem anterior."); }
      else applyBranding(slot, image);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível preparar a imagem."); }
    finally { setBrandingWorking(null); }
  }
  function requestBrandingRestore(slot: BrandingSlot) {
    if (!data.branding?.[slot]) { announce("Este logo já usa a imagem interna do aplicativo."); return; }
    setPendingBranding({ slot, image: null }); setBrandingConfirmation(""); announce("Escreva CONFIRMO para restaurar o logo interno do aplicativo.");
  }
  function setBrandingMode(displayMode: "pair" | "single") {
    if (displayMode === "single" && !data.branding?.centralImage) announce("Escolha primeiro a imagem única centralizada; os dois logos continuarão visíveis até ela ser adicionada.");
    replaceData({ ...data, branding: { ...(data.branding ?? {}), displayMode } });
  }

  const importDescription = tab === "patients" ? "Aceita Excel, CSV ou texto copiado. A primeira linha deve conter as letras A–J; a ordem física das colunas não importa." : tab === "territory" ? "Aceita Excel, CSV ou texto copiado. A primeira linha deve conter as letras K–R; a rua deve estar preenchida em cada linha territorial." : "Aceita Excel, CSV ou texto copiado. A primeira linha deve conter S e T.";

  return <main className="admin-page">
    <header className="admin-header"><div className="admin-brand"><span>Cadastro Clínico</span><small>Administrativo</small></div><a href="/" className="employee-link">Abrir aplicativo da equipe <ChevronRight size={18} /></a></header>
    <section className="admin-intro"><span>ADMINISTRATIVO</span><h1>Base de atualização</h1><p>Reúna os dados, revise as inconsistências e gere um único JSON para compartilhar com a equipe.</p></section>
    <nav className="admin-tabs" aria-label="Seções administrativas">
      <button className={tab === "patients" ? "active" : ""} onClick={() => setTab("patients")}><Users size={19} /> Pacientes <b>{data.patients.length}</b></button>
      <button className={tab === "territory" ? "active" : ""} onClick={() => setTab("territory")}><MapPinned size={19} /> Território <b>{data.territory.length}</b></button>
      <button className={tab === "operations" ? "active" : ""} onClick={() => setTab("operations")}><Settings2 size={19} /> Funcionamento <b>{data.unitOperation.length}</b></button>
      <button className={tab === "branding" ? "active" : ""} onClick={() => setTab("branding")}><ImageIcon size={19} /> Imagens</button>
      <button className={tab === "export" ? "active" : ""} onClick={() => setTab("export")}><Database size={19} /> Exportar</button>
    </nav>
    {(notice || error) && <div className={error ? "admin-alert error" : "admin-alert"}>{error ? <AlertTriangle size={20} /> : <Check size={20} />}{error || notice}</div>}

    {tab === "patients" && <section className="admin-import-card">
      <div className="admin-section-heading"><div><span>IMPORTAÇÃO DO BI — MODELO ACS DIGITAL</span><h2>Relatórios em CSV</h2></div><FileSpreadsheet size={30} /></div>
      <p>Escolha os relatórios exportados do BI. O aplicativo reconhece cada arquivo pelo conteúdo — a ordem não importa — e une tudo em uma base só, cruzando CNS, CPF e nome com nascimento. Se algum arquivo não for reconhecido, escolha o tipo dele na lista.</p>
      <div className="admin-import-actions">
        <button disabled={Boolean(pendingMerge)} onClick={() => biInputRef.current?.click()}><Upload size={19} /> Escolher CSVs do BI…</button>
        <input ref={biInputRef} className="visually-hidden" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" multiple onChange={(event) => void handleBiFiles(event)} />
        {biFiles.length > 0 && <button disabled={Boolean(pendingMerge)} onClick={importBiReports}>UNIR E IMPORTAR</button>}
      </div>
      {biFiles.map((entry) => <div className="bi-file-row" key={entry.name}>
        <span className={entry.type ? "bi-ok" : "bi-unknown"}>{entry.type ? "✔" : "?"}</span>
        <strong>{entry.name}</strong>
        {entry.type ? <span>{BI_REPORT_LABELS[entry.type]} · {entry.count} registro(s)</span> : <><span>Não reconhecido</span><select value="" disabled={Boolean(pendingMerge)} onChange={(event) => assignBiType(entry.name, event.target.value as BiReportType | "")}><option value="">— escolher tipo —</option>{(Object.keys(BI_REPORT_LABELS) as BiReportType[]).map((key) => <option key={key} value={key}>{BI_REPORT_LABELS[key]}</option>)}</select></>}
        <button className="bi-remove" disabled={Boolean(pendingMerge)} onClick={() => setBiFiles((previous) => previous.filter((old) => old.name !== entry.name))}>Remover</button>
      </div>)}
    </section>}

    {["patients", "territory", "operations"].includes(tab) && <section className="admin-import-card"><div className="admin-section-heading"><div><span>IMPORTAÇÃO ACUMULATIVA</span><h2>{tab === "patients" ? "Pacientes" : tab === "territory" ? "Ruas e equipes" : "Funcionamento da unidade"}</h2></div><FileSpreadsheet size={30} /></div><p>{importDescription}</p><button className="import-guide-button" onClick={() => setShowColumnGuide((value) => !value)}><CircleHelp size={18} /> {showColumnGuide ? "Ocultar padrão" : "Ver padrão da planilha"}</button>{showColumnGuide && (tab === "patients" || tab === "territory" || tab === "operations") && <div className="column-guide"><strong>Primeira linha: letras que identificam os campos</strong><div>{COLUMN_GUIDES[tab].map(([letter, meaning]) => <span key={letter}><b>{letter}</b>{meaning}</span>)}</div>{tab === "territory" && <small><b>Q e R:</b> vazios = rua toda; só R = até o final; só Q = a partir do início; <b>@</b> = pares; <b>#</b> = ímpares; <b>!3023!3012</b> em Q = apenas esses números.</small>}</div>}<div className="admin-import-actions"><button disabled={Boolean(pendingMerge)} onClick={() => fileRef.current?.click()}><Upload size={19} /> Escolher arquivo</button><input ref={fileRef} className="visually-hidden" type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFile} /></div><textarea disabled={Boolean(pendingMerge)} value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Cole aqui os dados incluindo a primeira linha com as letras dos campos." /><button className="paste-button" disabled={!paste.trim() || Boolean(pendingMerge)} onClick={handlePaste}><ClipboardPaste size={19} /> Importar dados colados</button></section>}

    {pendingMerge && <section className="admin-review-card"><div className="admin-section-heading"><div><span>CONFIRMAÇÃO NECESSÁRIA</span><h2>Revisar substituições</h2></div><AlertTriangle size={30} /></div><p><strong>{pendingMerge.changes.length}</strong> {pendingMerge.kind === "patients" ? "pessoas terão campos substituídos" : "trechos territoriais terão campos substituídos"}. Campos vazios não apagam dados; CPF, cadastro e telefones demonstrativos são trocados automaticamente quando houver valores reais.</p><div className="review-metrics"><span><b>{pendingMerge.metrics.added}</b> incluídos</span><span><b>{pendingMerge.metrics.filled}</b> campos preenchidos</span><span><b>{pendingMerge.metrics.demoReplaced}</b> dados demonstrativos trocados</span><span><b>{pendingMerge.changes.reduce((count, item) => count + item.changes.length, 0)}</b> substituições para confirmar</span></div><button className="review-list-toggle" onClick={() => setShowReplacements((value) => !value)}>{showReplacements ? "Ocultar lista" : `Ver lista de ${pendingMerge.changes.length} ${pendingMerge.kind === "patients" ? "pessoas" : "trechos"}`}</button>{showReplacements && <div className="replacement-list">{pendingMerge.changes.map((item) => <article key={item.key}><strong>{item.label}</strong>{item.changes.map((change, index) => <p key={`${change.field}-${index}`}><b>{change.field}:</b> <span>{change.before}</span><i>→</i><em>{change.after}</em></p>)}</article>)}</div>}<label className="review-confirmation">Para aplicar as substituições, escreva <b>CONFIRMO</b><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="CONFIRMO" autoComplete="off" /></label><div className="review-actions"><button className="review-cancel" onClick={() => { setPendingMerge(null); setConfirmation(""); setShowReplacements(false); announce("Importação cancelada. Nenhum dado foi alterado."); }}>Cancelar</button><button className="review-apply" disabled={confirmation.trim().toLocaleUpperCase("pt-BR") !== "CONFIRMO"} onClick={() => applyMerge(pendingMerge)}>Aplicar atualização</button></div></section>}

    {tab === "patients" && <section className="admin-data-card"><div className="admin-section-heading"><div><span>CONFERÊNCIA</span><h2>Pacientes acumulados</h2></div><div className="admin-warning">{validPhones ? <><AlertTriangle size={17} /> {validPhones} telefone(s) inválido(s)</> : <><Check size={17} /> Telefones válidos</>}</div></div><input className="admin-filter" value={patientFilter} onChange={(event) => setPatientFilter(event.target.value)} placeholder="Filtrar por nome, CNS ou endereço" /><div className="admin-patient-list">{filteredPatients.map((patient) => <button type="button" key={patientKey(patient)} onClick={() => setSelectedPatient(patient)}><strong>{patient.name}</strong><span>{patient.address || "Endereço não informado"}</span><small>{patient.cns ? `CNS ${patient.cns}` : "Sem CNS"}{(patient.phones?.length || patient.phone) ? ` · ${(patient.phones ?? [patient.phone]).join(" · ")}` : ""}</small></button>)}{!filteredPatients.length && <p className="admin-empty">Nenhum paciente acumulado ainda.</p>}</div>{selectedPatient && <article className="patient-conference"><div><span>LINHA COMPLETA</span><button onClick={() => setSelectedPatient(null)} aria-label="Fechar conferência"><X size={18} /></button></div><h3>{selectedPatient.name}</h3><dl><dt>Nome da mãe</dt><dd>{selectedPatient.mother || "—"}</dd><dt>Nascimento</dt><dd>{selectedPatient.birth || "—"}</dd><dt>Cadastro</dt><dd>{selectedPatient.registration || "—"}</dd><dt>Endereço</dt><dd>{selectedPatient.address || "—"}</dd><dt>CNS</dt><dd>{selectedPatient.cns || "—"}</dd><dt>CPF</dt><dd>{selectedPatient.cpf || "—"}</dd><dt>Telefones</dt><dd>{(selectedPatient.phones ?? (selectedPatient.phone ? [selectedPatient.phone] : [])).join(" · ") || "—"}</dd></dl></article>}</section>}

    {tab === "territory" && <section className="admin-data-card"><div className="admin-section-heading"><div><span>INCLUSÃO MANUAL</span><h2>Trecho de rua e equipe</h2></div><Flower2 size={28} /></div><div className="admin-form-grid"><input value={territoryForm.street} onChange={(event) => setTerritoryForm({ ...territoryForm, street: event.target.value })} placeholder="Rua, avenida ou estrada" /><input value={territoryForm.rangeStart} onChange={(event) => setTerritoryForm({ ...territoryForm, rangeStart: event.target.value })} placeholder="Número inicial" /><input value={territoryForm.rangeEnd} onChange={(event) => setTerritoryForm({ ...territoryForm, rangeEnd: event.target.value })} placeholder="Número final" /><input value={territoryForm.flower} onChange={(event) => setTerritoryForm({ ...territoryForm, flower: event.target.value })} placeholder="Nome da flor/equipe" /><input value={territoryForm.colorName} onChange={(event) => setTerritoryForm({ ...territoryForm, colorName: event.target.value })} placeholder="Cor da equipe" /><input value={territoryForm.doctor} onChange={(event) => setTerritoryForm({ ...territoryForm, doctor: event.target.value })} placeholder="Médica(o)" /><input value={territoryForm.nurse} onChange={(event) => setTerritoryForm({ ...territoryForm, nurse: event.target.value })} placeholder="Enfermeira(o)" /><input value={territoryForm.communityAgent} onChange={(event) => setTerritoryForm({ ...territoryForm, communityAgent: event.target.value })} placeholder="Agente comunitária(o)" /></div><button className="admin-primary" onClick={addTerritory}><Plus size={18} /> Adicionar trecho</button></section>}

    {tab === "operations" && <section className="admin-data-card"><div className="admin-section-heading"><div><span>INCLUSÃO MANUAL</span><h2>Setor e informações</h2></div><Info size={28} /></div><div className="admin-operation-form"><input value={operationForm.title} onChange={(event) => setOperationForm({ ...operationForm, title: event.target.value })} placeholder="Nome do setor" /><textarea value={operationForm.text} onChange={(event) => setOperationForm({ ...operationForm, text: event.target.value })} placeholder="Informações que aparecerão ao abrir esse setor no APK." /></div><button className="admin-primary" onClick={addOperation}><Plus size={18} /> Adicionar setor</button><div className="operation-preview">{[...data.unitOperation].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")).map((item) => <div key={operationKey(item)}><strong>{item.title}</strong><span>{item.text}</span></div>)}</div></section>}

    {tab === "branding" && <section className="admin-branding-card"><div className="admin-section-heading"><div><span>IMAGENS INSTITUCIONAIS</span><h2>Logotipos no JSON</h2></div><ImageIcon size={30} /></div><p>Escolha imagens PNG, JPG ou WebP. O administrativo reduz cada arquivo para até 300 KB, inclui os dados no JSON e permite que o APK use as imagens sem internet. Se nenhuma imagem estiver configurada, nenhum logo será exibido — o cabeçalho ficará limpo e neutro.</p><div className="branding-mode"><strong>Modo visual do cabeçalho</strong><div><button className={(data.branding?.displayMode ?? "pair") === "pair" ? "active" : ""} onClick={() => setBrandingMode("pair")}>LOGOS LADO A LADO</button><button className={(data.branding?.displayMode ?? "pair") === "single" ? "active" : ""} onClick={() => setBrandingMode("single")}>IMAGEM ÚNICA CENTRALIZADA</button></div></div><div className="branding-grid">{([{ slot: "clinicLogo" as const, label: "Logo institucional (esquerda)", fallback: CLINICA_LOGO, inputRef: clinicLogoRef }, { slot: "cityLogo" as const, label: "Logo institucional (direita)", fallback: CITY_LOGO, inputRef: cityLogoRef }, { slot: "centralImage" as const, label: "Imagem única centralizada", fallback: CLINICA_LOGO, inputRef: centralImageRef }]).map(({ slot, label, fallback, inputRef }) => { const image = data.branding?.[slot]; const preview = embeddedImageUrl(image) ?? (fallback || undefined); return <article className={`branding-slot ${slot === "centralImage" ? "branding-central-slot" : ""}`} key={slot}><span>{label}</span><div className="branding-preview">{preview ? <img src={preview} alt={label} /> : <span className="branding-empty">Sem imagem</span>}</div><small>{image ? `Imagem incorporada · ${embeddedImageSize(image)} KB` : slot === "centralImage" ? "Configure para usar o modo centralizado" : "Nenhuma imagem — cabeçalho sem logo"}</small><input className="visually-hidden" ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleBrandingFile(slot, event)} /><div className="branding-actions"><button disabled={brandingWorking === slot} onClick={() => inputRef.current?.click()}><Upload size={17} /> {brandingWorking === slot ? "PREPARANDO" : "TROCAR"}</button><button disabled={!image} onClick={() => requestBrandingRestore(slot)}><RotateCcw size={17} /> RESTAURAR</button></div></article>; })}</div>{pendingBranding && <div className="branding-confirm"><strong>{pendingBranding.image ? "Substituir imagem institucional?" : "Restaurar imagem interna?"}</strong><p>{pendingBranding.image ? "A imagem anterior será substituída no próximo JSON." : "O APK voltará a usar a imagem interna disponível."}</p><label>Para confirmar, escreva <b>CONFIRMO</b><input value={brandingConfirmation} onChange={(event) => setBrandingConfirmation(event.target.value)} placeholder="CONFIRMO" autoComplete="off" /></label><div><button onClick={() => { setPendingBranding(null); setBrandingConfirmation(""); }}>CANCELAR</button><button disabled={brandingConfirmation.trim().toLocaleUpperCase("pt-BR") !== "CONFIRMO"} onClick={() => applyBranding(pendingBranding.slot, pendingBranding.image)}>APLICAR</button></div></div>}</section>}


    {tab === "export" && <section className="admin-export"><div><span>ARQUIVO PARA O APK</span><h2>Gerar JSON de atualização</h2><p>O arquivo contém todos os dados acumulados nesta tela: pacientes, território, funcionamento e imagens institucionais. Após baixar, envie-o ao Google Drive e compartilhe com a equipe para importação no aplicativo.</p></div><div className="export-metrics"><span><b>{data.patients.length}</b> pacientes</span><span><b>{data.territory.length}</b> trechos de território</span><span><b>{data.unitOperation.length}</b> setores</span><span><b>{Number(Boolean(data.branding?.clinicLogo)) + Number(Boolean(data.branding?.cityLogo)) + Number(Boolean(data.branding?.centralImage))}</b> imagens</span><span><b>{jsonSizeKb} KB</b> tamanho estimado</span>{brandingDate && <span><b>{new Date(brandingDate).toLocaleDateString("pt-BR")}</b> última imagem</span>}</div><button onClick={() => downloadJson(data)}><Download size={21} /> Baixar JSON único</button><button className="admin-reset" onClick={() => { if (window.confirm("Apagar todos os dados acumulados neste computador?")) { setData({ ...NEW_DATA, updatedAt: new Date().toISOString() }); announce("Base administrativa reiniciada."); } }}><RotateCcw size={18} /> Reiniciar base administrativa</button></section>}
    <footer className="admin-footer"><Save size={17} /> Os dados são mantidos neste navegador enquanto você trabalha. Exporte o JSON antes de trocar de computador.</footer>
  </main>;
}
