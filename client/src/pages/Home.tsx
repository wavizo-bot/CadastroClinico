// Direção visual: Saúde Pública Editorial — operação ágil, poucos passos, botões claros e leitura de alto contraste.
// Direção visual: Saúde Pública Editorial — informações territoriais diretas, contraste alto e apoio rápido em campo.
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { ArrowLeft, Building2, Camera, ChevronDown, ChevronLeft, ChevronRight, Clipboard, Database, FileUp, KeyRound, MapPin, MessageCircle, Phone, RotateCcw, Search, UsersRound, X } from "lucide-react";
import { ClinicData, emptyData, loadAccessPassword, loadData, loadPersistedData, maisAntiga, mergeData, removeAccessPassword, resetData, saveAccessPassword, saveData, summarizeImport, TerritoryEntry } from "@/lib/dataStore";
import { ACCESS_ALPHABET, isValidAccessPassword } from "@/lib/accessSecurity";
import { territoryNumberMatches, territoryRangeLabel, territorySpecificity } from "@/lib/territoryRules";
import { BI_REPORT_LABELS, detectBiReport, mapBiRows, mapEquipesRows, mergeBiPatients, parseBiCsv, readBiFileText, type BiReportType } from "@/lib/biImport";
import { buscarPorOcr, extrairCamposOcr, precarregarOcr, reconhecerImagem, type OcrCampos, type OcrMatch } from "@/lib/ocr";
import { ehVarjao, VARJAO_ROTULO } from "@/lib/territoryRules";
import pacote from "../../../package.json";

const CLINICA_LOGO = "";
const CITY_LOGO = "";
// Versão vinda do package.json — atualizada automaticamente a cada atualização.
const APP_VERSION = String(pacote.version ?? "0.0.0");
const PATIENT_PAGE_SIZE = 5;
const TERRITORY_PAGE_SIZE = 10;
type View = "home" | "patients" | "patient-detail" | "territory" | "address-detail" | "operations" | "database" | "optical";
const LOGRADOURO_PREFIX = /^\s*(?:rua|avenida|av\.?|estrada|travessa)\s+/i;

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createAccessOptions(requiredCharacter?: string) {
  const characters = shuffled(ACCESS_ALPHABET.split("").filter((character) => character !== requiredCharacter)).slice(0, requiredCharacter ? 11 : 12);
  const correctButton = requiredCharacter ? Math.floor(Math.random() * 4) : -1;
  const correctPosition = requiredCharacter ? Math.floor(Math.random() * 3) : -1;
  let cursor = 0;
  return Array.from({ length: 4 }, (_, buttonIndex) => Array.from({ length: 3 }, (_, characterIndex) => {
    if (buttonIndex === correctButton && characterIndex === correctPosition) return requiredCharacter!;
    return characters[cursor++];
  }).join(""));
}

const normalizeSearch = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const searchWords = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/([a-zA-Z])(\d)/g, "$1 $2").replace(/(\d)([a-zA-Z])/g, "$1 $2").replace(/[^a-zA-Z0-9]+/g, " ").toLowerCase().trim().split(/\s+/).filter(Boolean);

function patientSearchTerm(value: string) {
  const motherCommand = /^\s*m[ãa]e\s+(.+)$/i.exec(value);
  return motherCommand ? motherCommand[1].trim() : value.trim();
}

function isMotherSearch(value: string) { return /^\s*m[ãa]e\s+.+$/i.test(value); }
function numericQuery(value: string) {
  const query = value.trim();
  return /^\d+$/.test(query) ? query : null;
}

function addressQuery(value: string) {
  const match = /^\s*(.+?)\s+(\d{2,})\s*$/.exec(value);
  if (!match) return null;
  const text = match[1].trim();
  const number = match[2];
  return normalizeSearch(text).length >= 3 ? { text, number } : null;
}

function logradouroSearchTerm(value: string) {
  const match = LOGRADOURO_PREFIX.exec(value);
  if (!match) return null;
  const term = value.slice(match[0].length).trim();
  return normalizeSearch(term).length >= 3 ? term : null;
}

function territorySearchQuery(value: string) {
  const match = LOGRADOURO_PREFIX.exec(value);
  if (!match) return value;
  const remainder = value.slice(match[0].length).trim();
  return /\d/.test(remainder) || normalizeSearch(remainder).length >= 3 ? remainder : "";
}

function isPatientSearchReady(value: string) {
  if (LOGRADOURO_PREFIX.test(value)) return Boolean(logradouroSearchTerm(value));
  if (numericQuery(value)) return true;
  if (addressQuery(value)) return true;
  return isMotherSearch(value) ? patientSearchTerm(value).length >= 4 : value.length >= 4;
}

function addressSearchMatches(address: string | undefined, rawQuery: string) {
  const parsedQuery = addressQuery(rawQuery);
  if (!address || !parsedQuery) return false;
  const queryWords = searchWords(parsedQuery.text);
  const addressWords = new Set(searchWords(address));
  return queryWords.every((word) => addressWords.has(word)) && addressWords.has(parsedQuery.number);
}

function parseBirthDate(value?: string) {
  const sanitized = value?.trim() ?? "";
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s.*)?$/.exec(sanitized);
  const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(sanitized);
  if (!isoMatch && !match) return null;
  const yearToken = isoMatch ? isoMatch[1] : match![3];
  const month = Number(isoMatch ? isoMatch[2] : match![1]);
  const day = Number(isoMatch ? isoMatch[3] : match![2]);
  const shortYear = Number(yearToken);
  const year = yearToken.length === 2 ? (shortYear > (new Date().getFullYear() % 100) + 1 ? 1900 + shortYear : 2000 + shortYear) : shortYear;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function formattedBirth(value?: string) {
  const date = parseBirthDate(value);
  return date ? date.toLocaleDateString("pt-BR") : value;
}

function calculatedAge(value?: string) {
  const birth = parseBirthDate(value);
  if (!birth) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayPassed = today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

function ageLabel(value?: string) {
  const age = calculatedAge(value);
  return age === null ? "" : `${age} ${age === 1 ? "ano" : "anos"}`;
}

/* Data de criação do arquivo, no fuso do aparelho, como "aaaa-mm-dd". */
function dataLocalIso(ms: number) {
  const date = new Date(ms);
  const dois = (valor: number) => String(valor).padStart(2, "0");
  return `${date.getFullYear()}-${dois(date.getMonth() + 1)}-${dois(date.getDate())}`;
}

/* Frases do BUSCADOR ÓPTICO: duração fixa de 1,2s, começando por uma aleatória e
   trocando até o processo terminar. Substituem "initializing api 100%...". */
const FRASES_LEITURA = [
  "Arrumando umas coisas aqui...",
  "Procurando um lápis...",
  "Buscando um cafezinho...",
  "Revendo minhas anotações...",
  "Pesquisando no Chat-GPT...",
  "Vendo vídeos de gatinhos no TikTok...",
  "Dando uma olhadinha no Instagram...",
  "O que eu estava fazendo mesmo?...",
  "Só um instante, me perdi nos pensamentos...",
  "Fingindo que estou trabalhando...",
  "Você gosta de pudim?...",
  "Prometo que estou quase lá...",
  "Procurando uma lupa...",
  "Checando os e-mails...",
  "Melhorando no Photoshop...",
  "Isso é uma mancha? Risco? Amassado?...",
  "Estou cansado...",
  "Está um lindo dia...",
  "Será que eu tranquei a porta?...",
  "O tempo é uma ilusão, mas essa barra não...",
  "Pensando no sentido da vida (e do seu documento)...",
  "Ativando o modo turbo (mentira, é o normal)...",
];
const FRASE_LEITURA_LENTA = "Isso está demorando mais do que o esperado...";
const CHAVE_MAX_LEITURA = "ocrMaxSeg";

function lerMaxLeitura(): number {
  try {
    const valor = Number(window.localStorage.getItem(CHAVE_MAX_LEITURA));
    return Number.isFinite(valor) && valor > 0 ? valor : 0;
  } catch { return 0; }
}
/* Guarda o maior tempo já levado para ler uma imagem (a barra alvo é 120% dele). */
function gravarMaxLeitura(segundos: number) {
  try {
    if (!(segundos > 0)) return;
    if (segundos > lerMaxLeitura()) window.localStorage.setItem(CHAVE_MAX_LEITURA, String(segundos));
  } catch { /* sem armazenamento: barra volta ao mínimo de 10s */ }
}
function fraseAleatoria(anterior: string) {
  let frase = anterior;
  for (let tentativa = 0; tentativa < 8 && frase === anterior; tentativa += 1) {
    frase = FRASES_LEITURA[Math.floor(Math.random() * FRASES_LEITURA.length)];
  }
  return frase;
}

function patientPhones(patient: ClinicData["patients"][number]) {
  const source = patient.phones?.length ? patient.phones : patient.phone ? [patient.phone] : [];
  return Array.from(new Set(source.map((phone) => phone.replace(/\D/g, "")).filter(Boolean)));
}

function whatsappLink(phone: string) {
  return phone.length === 11 ? `https://wa.me/55${phone}` : null;
}

function teamTextColor(team?: TerritoryEntry["team"]) {
  if (team?.textColor) return team.textColor;
  return team?.name === "Margarida" || team?.name === "Girassol" || team?.name === "Orquídea" ? "#123b67" : "#ffffff";
}

function territoryMatches(entry: TerritoryEntry, rawQuery: string) {
  const compactQuery = normalizeSearch(territorySearchQuery(rawQuery));
  if (!compactQuery) return true;
  const letterQuery = compactQuery.replace(/\d/g, "");
  const numberQueries = compactQuery.match(/\d+/g)?.map(Number) ?? [];
  const textValues = [entry.street, entry.team.name, entry.team.colorName, entry.team.color, entry.team.doctor, entry.team.nurse, entry.team.communityAgent];
  const streetMatches = !letterQuery || textValues.some((value) => normalizeSearch(value).includes(letterQuery));
  const rangeMatches = numberQueries.every((number) => territoryNumberMatches(entry, number));
  return streetMatches && rangeMatches;
}

function addressNumber(address?: string) {
  const match = /,\s*(\d{1,6})(?:\D|$)/.exec(address ?? "");
  return match ? Number(match[1]) : null;
}

function streetReferences(street: string) {
  const normalized = normalizeSearch(street);
  return Array.from(new Set([normalized, normalized.replace(/^doutor/, "dr")]));
}

function teamForAddress(address: string | undefined, territory: TerritoryEntry[]) {
  if (!address) return null;
  const normalizedAddress = normalizeSearch(address);
  const candidates = territory.filter((entry) => streetReferences(entry.street).some((reference) => normalizedAddress.includes(reference)));
  if (!candidates.length) return null;
  const number = addressNumber(address);
  if (number !== null) {
    const ranged = candidates.filter((entry) => territoryNumberMatches(entry, number)).sort((first, second) => territorySpecificity(second) - territorySpecificity(first));
    if (ranged.length) return ranged[0];
  }
  return candidates.find((entry) => !entry.rangeStart && !entry.rangeEnd) ?? candidates[0];
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <div className="pager"><button aria-label="Página anterior" disabled={page === 0} onClick={() => onChange(page - 1)}><ChevronLeft size={19} /> ANTERIOR</button><span>{page + 1} de {totalPages}</span><button aria-label="Próxima página" disabled={page === totalPages - 1} onClick={() => onChange(page + 1)}>PRÓXIMA <ChevronRight size={19} /></button></div>;
}

function formatarDataBanco(valor?: string) {
  if (!valor) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const date = new Date(valor);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR");
}

function temDados(data: ClinicData) {
  return data.patients.length + data.territory.length + data.unitOperation.length > 0;
}

/* Cabeçalho: as imagens institucionais saíram; no lugar vai o texto (que era do
   rodapé), com a versão automática e a data do arquivo mais antigo do banco.
   Com a mudança deixou de haver rodapé. */
function Header({ data }: { data: ClinicData }) {
  const dataBanco = temDados(data) ? (formatarDataBanco(data.databaseDate) ?? formatarDataBanco(data.updatedAt)) : null;
  return (
    <header className="institutional-header">
      <p className="app-credit">
        Este aplicativo é uma gentileza do Maico.
        <br />
        Sem receber apoio, incentivo ou investimento da PMJ.
        <br />
        Tudo foi feito com meios próprios, aparelhos particulares, proatividade e muita IA.
        <br />
        Contato 11 978831938 - Versão {APP_VERSION}{dataBanco ? ` com dados de ${dataBanco}` : " sem dados importados"}.
      </p>
    </header>
  );
}

function Back({ go }: { go: () => void }) { return <button className="back-link" onClick={go}><ArrowLeft size={19} /> VOLTAR</button>; }

function rangeLabel(entry: TerritoryEntry) {
  return territoryRangeLabel(entry);
}

/* Rótulo da rua no território: o Varjão aparece padronizado em todos os lugares. */
function nomeRua(street: string) {
  return ehVarjao(street) ? VARJAO_ROTULO : street;
}
function rotuloRua(street: string) {
  return ehVarjao(street) ? VARJAO_ROTULO : `RUA ${street}`;
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [data, setData] = useState<ClinicData>(() => loadData());
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [streetQuery, setStreetQuery] = useState("");
  const [patientPage, setPatientPage] = useState(0);
  const [territoryPage, setTerritoryPage] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState<ClinicData["patients"][number] | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<TerritoryEntry | null>(null);
  const [openOperation, setOpenOperation] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ClinicData | null>(null);
  const [importInfo, setImportInfo] = useState<ReturnType<typeof summarizeImport> | null>(null);
  const [importError, setImportError] = useState("");
  type BiFileEntry = { name: string; rows: string[][]; type: BiReportType | null; count: number; lastModified?: number };
  const [biFiles, setBiFiles] = useState<BiFileEntry[]>([]);
  const biInputRef = useRef<HTMLInputElement>(null);
  const [resetMode, setResetMode] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [teamMessage, setTeamMessage] = useState("");
  const [accessPassword, setAccessPassword] = useState<string | null>(loadAccessPassword);
  const [accessStep, setAccessStep] = useState(() => (loadAccessPassword() ? 0 : 4));
  const [accessFailed, setAccessFailed] = useState(false);
  const [accessOptions, setAccessOptions] = useState(() => createAccessOptions(loadAccessPassword() ?? undefined));
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('patientSearchHistory');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const didPush = useRef(false);
  function addToHistory(term: string) {
    if (!term.trim()) return;
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item !== term);
      return [term, ...filtered].slice(0, 3);
    });
  }
  const [ocrPhoto, setOcrPhoto] = useState<File | null>(null);
  const [ocrPreview, setOcrPreview] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProg, setOcrProg] = useState(0);
  const [ocrCampos, setOcrCampos] = useState<OcrCampos | null>(null);
  const [ocrResults, setOcrResults] = useState<OcrMatch[]>([]);
  const [ocrError, setOcrError] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const ocrFileRef = useRef<HTMLInputElement>(null);
  const ocrCameraRef = useRef<HTMLInputElement>(null);
  const ocrInicioRef = useRef(0);
  function aoEscolherFoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (ocrPreview) URL.revokeObjectURL(ocrPreview);
    if (!/^image\//.test(file.type)) { setOcrError("Escolha um arquivo de imagem."); return; }
    setOcrPhoto(file);
    setOcrPreview(URL.createObjectURL(file));
    setOcrCampos(null);
    setOcrResults([]);
    setOcrError("");
    setOcrProg(0);
  }
  async function lerFoto() {
    if (!ocrPhoto) return;
    ocrInicioRef.current = performance.now();
    setOcrBusy(true);
    setOcrError("");
    setOcrCampos(null);
    setOcrResults([]);
    setOcrProg(0);
    try {
      const texto = await reconhecerImagem(ocrPhoto, (pct, m) => {
        // A barra virou contador de tempo: o progresso real fica só no console.
        try { console.debug("[OCR]", Math.round(pct), m?.status ?? ""); } catch { /* noop */ }
      });
      const campos = extrairCamposOcr(texto);
      setOcrCampos(campos);
      setOcrResults(buscarPorOcr(campos, data.patients));
    } catch (reason) {
      setOcrError(reason instanceof Error && reason.message ? `Não foi possível ler a foto. ${reason.message}` : "Não foi possível ler a foto. Tente outra, com mais luz e bem enquadrada.");
    } finally {
      gravarMaxLeitura((performance.now() - ocrInicioRef.current) / 1000);
      setOcrStatus("");
      setOcrBusy(false);
    }
  }
  /* Barra de progresso = contador de tempo que nunca enche: alvo de 10s ou 120%
     do maior tempo já registrado (o que for maior). Passou do alvo: trava em 98%
     com a frase de atraso até o resultado aparecer. Frases trocam a cada 1,2s. */
  useEffect(() => {
    if (!ocrBusy) return;
    const alvo = Math.max(10, lerMaxLeitura() * 1.2);
    setOcrStatus(fraseAleatoria(""));
    const barra = window.setInterval(() => {
      const segundos = (performance.now() - ocrInicioRef.current) / 1000;
      if (segundos >= alvo) { setOcrProg(98); setOcrStatus(FRASE_LEITURA_LENTA); }
      else setOcrProg(Math.min(97, (segundos / alvo) * 100));
    }, 200);
    const frases = window.setInterval(() => {
      setOcrStatus((atual) => (atual === FRASE_LEITURA_LENTA ? atual : fraseAleatoria(atual)));
    }, 1200);
    return () => { window.clearInterval(barra); window.clearInterval(frases); };
  }, [ocrBusy]);
  function limparFoto() {
    if (ocrPreview) URL.revokeObjectURL(ocrPreview);
    setOcrPhoto(null);
    setOcrPreview("");
    setOcrCampos(null);
    setOcrResults([]);
    setOcrError("");
    setOcrStatus("");
    setOcrProg(0);
  }
  function go(next: View) {
    if (next !== "home") window.history.pushState({ clinicView: next }, "");
    setView(next); didPush.current = next !== "home";
  }
  function openProtectedView(next: Exclude<View, "home" | "database">) { go(next); }
  function openDatabase() { go("database"); }
  function back() { window.history.back(); }
  useEffect(() => {
    const onPop = (event: PopStateEvent) => { setView((event.state?.clinicView as View) || "home"); didPush.current = Boolean(event.state?.clinicView); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    let listener: Awaited<ReturnType<typeof NativeApp.addListener>> | undefined;
    const register = async () => { listener = await NativeApp.addListener("backButton", () => { if (view !== "home") window.history.back(); else if (accessStep < 4) void NativeApp.exitApp(); }); };
    void register();
    return () => { void listener?.remove(); };
  }, [view, accessStep]);
  useEffect(() => {
    if (accessStep < 4) return;
    let active = true;
    void loadPersistedData().then((saved) => {
      if (active && saved) setData(saved);
      if (active) setPersistenceReady(true);
    });
    return () => { active = false; };
  }, [accessStep]);
  useEffect(() => { if (persistenceReady) void saveData(data); }, [data, persistenceReady]);
  useEffect(() => {
    setDebouncedQuery("");
    if (!isPatientSearchReady(query)) return;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      addToHistory(query.trim());
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => { setPatientPage(0); }, [debouncedQuery]);
  useEffect(() => { setTerritoryPage(0); }, [streetQuery]);
  // Abre o BUSCADOR ÓPTICO já com o leitor aquecido (o carregamento da API não
  // espera mais a primeira foto).
  useEffect(() => { if (view === "optical") void precarregarOcr(); }, [view]);

  const patientResults = useMemo(() => {
    if (!isPatientSearchReady(debouncedQuery)) return [];
    const numeric = numericQuery(debouncedQuery);
    const normalized = normalizeSearch(patientSearchTerm(debouncedQuery));
    const byName = (patient: ClinicData["patients"][number]) => normalizeSearch(patient.name).includes(normalized);
    if (numeric) {
      return data.patients.filter((patient) => {
        const registrationMatches = String(patient.registration ?? "").replace(/\D/g, "").includes(numeric);
        if (numeric.length < 4) return registrationMatches;
        return registrationMatches || [patient.cpf, patient.cns, ...patientPhones(patient)].some((value) => String(value ?? "").replace(/\D/g, "").includes(numeric));
      }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }
    const logradouro = logradouroSearchTerm(debouncedQuery);
    if (logradouro) {
      const words = searchWords(logradouro);
      return data.patients.filter((patient) => {
        const addressWords = new Set(searchWords(patient.address));
        return words.every((word) => addressWords.has(word));
      }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }
    if (isMotherSearch(debouncedQuery)) return data.patients.filter((patient) => normalizeSearch(patient.mother).includes(normalized)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (addressQuery(debouncedQuery)) return data.patients.filter((patient) => addressSearchMatches(patient.address, debouncedQuery)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return data.patients.filter(byName).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data.patients, debouncedQuery]);
  const territoryResults = useMemo(() => data.territory.filter((entry) => territoryMatches(entry, streetQuery)), [data.territory, streetQuery]);
  const operationItems = useMemo(() => [...data.unitOperation].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")), [data.unitOperation]);
  const patientPages = Math.max(1, Math.ceil(patientResults.length / PATIENT_PAGE_SIZE));
  const territoryPages = Math.max(1, Math.ceil(territoryResults.length / TERRITORY_PAGE_SIZE));
  const visiblePatients = patientResults.slice(patientPage * PATIENT_PAGE_SIZE, (patientPage + 1) * PATIENT_PAGE_SIZE);
  const visibleTerritory = territoryResults.slice(territoryPage * TERRITORY_PAGE_SIZE, (territoryPage + 1) * TERRITORY_PAGE_SIZE);
  const selectedPatientTeam = selectedPatient ? teamForAddress(selectedPatient.address, data.territory) : null;
  const ocrLinhas = ocrCampos ? (([["Cadastro", ocrCampos.cadastro], ["Nome", ocrCampos.nome], ["Mãe", ocrCampos.mae], ["Nascimento", ocrCampos.nascimento], ["CPF", ocrCampos.cpf], ["CNS", ocrCampos.cns], ["Telefone", ocrCampos.telefone], ["Exame", ocrCampos.exame]] as const).filter(([, value]) => value)) : [];

  function openPatient(patient: ClinicData["patients"][number]) { setSelectedPatient(patient); go("patient-detail"); }
  function openAddress(address: TerritoryEntry) { setSelectedAddress(address); go("address-detail"); }
  async function copyPatientDetails() {
    if (!selectedPatient) return;
    const age = calculatedAge(selectedPatient.birth);
    const lines = [
      `Nome: ${selectedPatient.name}`,
      selectedPatient.mother && `Nome da mãe: ${selectedPatient.mother}`,
      selectedPatient.registration && `Cadastro: ${selectedPatient.registration}`,
      selectedPatient.birth && `Nascimento: ${formattedBirth(selectedPatient.birth)}${age !== null ? ` (${ageLabel(selectedPatient.birth)})` : ""}`,
      ...patientPhones(selectedPatient).map((phone, index) => `Telefone${index ? ` ${index + 1}` : ""}: ${phone}`),
      selectedPatient.address && `Endereço: ${selectedPatient.address}`,
      selectedPatient.cns && `CNS: ${selectedPatient.cns}`,
      selectedPatientTeam && `Equipe: ${selectedPatientTeam.team.name ?? "Não informada"}`,
      selectedPatientTeam && `Médica(o): ${selectedPatientTeam.team.doctor}`,
      selectedPatientTeam && `Enfermeira(o): ${selectedPatientTeam.team.nurse}`,
      selectedPatientTeam && `Assistente: ${(selectedPatientTeam.team as any).assistant ?? selectedPatientTeam.team.communityAgent}`,
    ].filter(Boolean).join("\n");
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(lines);
      else {
        const area = document.createElement("textarea");
        area.value = lines;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopyMessage("Informações copiadas.");
    } catch { setCopyMessage("Não foi possível copiar agora."); }
  }
  async function handleBiFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setImportError("");
    try {
      const entries: BiFileEntry[] = [];
      for (const file of files) {
        const rows = parseBiCsv(await readBiFileText(file));
        const type = detectBiReport(file.name, rows);
        const count = !type ? 0 : type === "equipes" ? mapEquipesRows(rows).length : mapBiRows(type, rows).length;
        entries.push({ name: file.name, rows, type, count, lastModified: file.lastModified });
      }
      if (!entries.length) return;
      setBiFiles((prev) => [...prev.filter((old) => !entries.some((a) => a.name === old.name)), ...entries]);
    } catch (reason) { setImportError(reason instanceof Error ? reason.message : "Não foi possível ler os CSVs."); }
  }
  function assignBiType(name: string, type: BiReportType | "") {
    setBiFiles((prev) => prev.map((e) => e.name === name ? { ...e, type: type || null, count: !type ? 0 : type === "equipes" ? mapEquipesRows(e.rows).length : mapBiRows(type as BiReportType, e.rows).length } : e));
  }
  function importBiReports() {
    const recognized = biFiles.filter((e): e is BiFileEntry & { type: BiReportType } => Boolean(e.type));
    if (!recognized.length) { setImportError("Nenhum relatório reconhecido. Escolha os 4 CSVs."); return; }
    const patientTypes: BiReportType[] = ["s1","s2","s3"];
    const patientRecords = recognized.filter((e) => patientTypes.includes(e.type)).flatMap((e) => mapBiRows(e.type as "s1"|"s2"|"s3", e.rows));
    const equipesEntries = recognized.filter((e) => e.type === "equipes").flatMap((e) => mapEquipesRows(e.rows));
    const patients = patientRecords.length ? mergeBiPatients(patientRecords) : [];
    if (!patients.length && !equipesEntries.length) { setImportError("Os arquivos não continham dados válidos."); return; }
    // Data do arquivo mais antigo entre os 3 que podem ser usados como banco de dados.
    const datasCsv = recognized
      .filter((e) => patientTypes.includes(e.type) && typeof e.lastModified === "number" && e.lastModified > 0)
      .map((e) => dataLocalIso(e.lastModified as number));
    const incoming: ClinicData = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      databaseDate: maisAntiga(data.databaseDate, datasCsv.length ? datasCsv.reduce((a, b) => (a <= b ? a : b)) : undefined),
      patients: patients.length ? patients : data.patients,
      territory: equipesEntries.length ? equipesEntries : data.territory,
      unitOperation: data.unitOperation,
      branding: data.branding,
    };
    // Se só equipes, mantém pacientes atuais mas atualiza território; se só pacientes, mantém território
    if (patientRecords.length && equipesEntries.length) {
      incoming.patients = patients;
      incoming.territory = equipesEntries;
    } else if (equipesEntries.length) {
      incoming.patients = data.patients;
      incoming.territory = equipesEntries;
    }
    setBiFiles([]);
    setPendingImport(incoming); setImportInfo(summarizeImport(data, incoming)); setResetMode(false); setImportError("");
  }
  function confirmImport() { if (!pendingImport) return; setData(mergeData(data, pendingImport)); setPendingImport(null); setImportInfo(null); }
  function confirmReset() { if (confirmation.trim().toLocaleLowerCase("pt-BR") !== "confirmar") return; void resetData(); setData({ ...emptyData, updatedAt: new Date().toISOString() }); setConfirmation(""); setResetMode(false); }
  function chooseAccessOption(option: string) {
    if (accessFailed) { setAccessFailed(false); setAccessOptions(createAccessOptions(accessPassword?.[accessStep])); return; }
    const expected = accessPassword?.[accessStep] ?? "";
    if (!expected || !option.includes(expected)) { setAccessFailed(true); setAccessOptions(createAccessOptions()); return; }
    const nextStep = accessStep + 1;
    setAccessStep(nextStep);
    if (nextStep < 4) setAccessOptions(createAccessOptions(accessPassword?.[nextStep]));
  }
  function saveChosenPassword() {
    const value = passwordDraft.trim().toUpperCase();
    if (!isValidAccessPassword(value)) { setPasswordNotice("Use 4 caracteres: letras maiúsculas e números de 1 a 9."); return; }
    saveAccessPassword(value);
    setAccessPassword(value);
    setPasswordDraft("");
    setPasswordEditorOpen(false);
    setPasswordNotice("Senha definida. Ela será pedida na próxima abertura do aplicativo.");
  }
  function removeChosenPassword() {
    removeAccessPassword();
    setAccessPassword(null);
    setPasswordDraft("");
    setPasswordEditorOpen(false);
    setPasswordNotice("Senha removida. O aplicativo abrirá sem senha.");
  }
  if (accessStep < 4) return <div className="app-shell access-shell"><Header data={data} /><main className="main-content access-main"><section className="access-card"><div className="access-options">{accessOptions.map((option, index) => <button key={`${option}-${index}`} onClick={() => chooseAccessOption(option)}>{option}</button>)}</div></section></main></div>;

  return <div className="app-shell"><Header data={data} /><main className="main-content">
    {view === "home" && <section className="home-actions"><button onClick={() => openProtectedView("patients")}><Search size={28} /><span>ENCONTRAR PACIENTE</span><ChevronRight size={24} /></button><button onClick={() => { void precarregarOcr(); openProtectedView("optical"); }}><Camera size={28} /><span>BUSCADOR ÓPTICO</span><ChevronRight size={24} /></button><button onClick={() => openProtectedView("territory")}><MapPin size={28} /><span>NOSSO TERRITÓRIO</span><ChevronRight size={24} /></button><button onClick={() => openProtectedView("operations")}><Building2 size={28} /><span>FUNCIONAMENTO DA UNIDADE</span><ChevronRight size={24} /></button><button onClick={openDatabase}><Database size={28} /><span>BANCO DE DADOS</span><ChevronRight size={24} /></button></section>}

    {view === "patients" && <section className="screen"><Back go={back} /><h1>Encontrar paciente</h1><div className="universal-search"><Search size={22} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, CNS ou endereço" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />{query && <button className="clear-search" aria-label="Limpar busca" onClick={() => { setQuery(""); setDebouncedQuery(""); }}><X size={20} /></button>}</div>{!query && searchHistory.length > 0 && <div className="search-history"><div className="history-title"><RotateCcw size={16} /><span>Buscas recentes</span></div><div className="history-list">{searchHistory.map((term, index) => (<button key={`${term}-${index}`} className="history-item" onClick={() => setQuery(term)}><Search size={16} /><span>{term}</span></button>))}</div></div>}{Boolean(debouncedQuery) && <><Pager page={patientPage} totalPages={patientPages} onChange={setPatientPage} /><div className="result-list">{visiblePatients.map((patient) => { const team = teamForAddress(patient.address, data.territory); return <button className="result-card" key={patient.id} onClick={() => openPatient(patient)}><span className="avatar-letter" style={{ background: team?.team.color ?? "#617787", color: teamTextColor(team?.team), borderColor: team?.team.name === "Margarida" ? "#123b67" : "transparent" }}>{team?.team.name?.charAt(0).toUpperCase() ?? "?"}</span><span><strong>{patient.name}</strong><small>{patient.address}</small></span><ChevronRight size={20} /></button>; })}{patientResults.length === 0 && <div className="empty-line">Nenhum resultado</div>}</div></>}</section>}

    {view === "optical" && <section className="screen narrow"><Back go={back} /><h1>Buscador óptico</h1><div className="ocr-actions"><button onClick={() => ocrFileRef.current?.click()}><FileUp size={20} /> ENVIAR FOTO</button><button onClick={() => ocrCameraRef.current?.click()}><Camera size={20} /> ABRIR CÂMERA</button></div><input ref={ocrFileRef} type="file" accept="image/*" className="visually-hidden" onChange={aoEscolherFoto} /><input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={aoEscolherFoto} />{ocrPreview && <div className="ocr-prev"><img src={ocrPreview} alt="Documento selecionado" /></div>}<button className="ocr-scan" disabled={!ocrPhoto || ocrBusy} onClick={() => void lerFoto()}>{ocrBusy ? "LENDO…" : "🔍 LER TEXTO DA FOTO"}</button>{ocrBusy && <div className="ocr-bar"><span className="ocr-status">{ocrStatus || FRASES_LEITURA[0]}</span><div className="ocr-track"><div className="ocr-fill" style={{ width: `${ocrProg}%` }} /></div></div>}{ocrError && !ocrBusy && <div className="ocr-error">{ocrError}</div>}{ocrCampos && !ocrBusy && (ocrLinhas.length ? <div className="ocr-ok">Reconheceu: {ocrLinhas.map(([label, value]) => `${label} ${value}`).join(" · ")}</div> : <div className="empty-line">Nenhum campo reconhecido. Tente outra foto com mais luz e sem sombras.</div>)}{ocrCampos && !ocrBusy && (ocrResults.length ? <div className="result-list">{ocrResults.map((item) => { const team = teamForAddress(item.patient.address, data.territory); return <button className="result-card" key={item.patient.id} onClick={() => openPatient(item.patient)}><span className="avatar-letter" style={{ background: team?.team.color ?? "#617787", color: teamTextColor(team?.team), borderColor: team?.team.name === "Margarida" ? "#123b67" : "transparent" }}>{team?.team.name?.charAt(0).toUpperCase() ?? "?"}</span><span><strong>{item.patient.name}</strong><small>{[item.patient.address, `achei pelo ${item.via.toLowerCase()}`].filter(Boolean).join(" · ")}</small></span><ChevronRight size={20} /></button>; })}</div> : <div className="empty-line">Nenhum morador encontrado com os dados da foto.</div>)}{ocrError && <div className="tool-message">{ocrError}</div>}{ocrPhoto && <button className="ocr-clear" onClick={limparFoto}>LIMPAR</button>}</section>}

    {view === "patient-detail" && selectedPatient && <section className="screen narrow"><Back go={back} /><h1>{selectedPatient.name}</h1><div className="detail-card">{selectedPatient.mother && <div className="detail-wide"><span>Nome da mãe</span><strong>{selectedPatient.mother}</strong></div>}<div className="paired-detail">{selectedPatient.birth && <div><span>Nascimento</span><strong>{formattedBirth(selectedPatient.birth)}{calculatedAge(selectedPatient.birth) !== null ? ` (${ageLabel(selectedPatient.birth)})` : ""}</strong></div>}{selectedPatient.registration && <div className="detail-right"><span>Cadastro</span><strong>{selectedPatient.registration}</strong></div>}</div>{selectedPatient.address && <div className="detail-wide"><span>Endereço</span><strong>{selectedPatient.address}</strong></div>}<div className="paired-detail">{selectedPatient.cns && <div><span>CNS</span><strong>{selectedPatient.cns}</strong></div>}{selectedPatient.cpf && <div className="detail-right"><span>CPF</span><strong>{selectedPatient.cpf}</strong></div>}</div>{patientPhones(selectedPatient).map((phone, index) => <div className="phone-detail" key={`${phone}-${index}`}><span>Telefone{index ? ` ${index + 1}` : ""}</span><strong><Phone size={17} />{phone}</strong>{whatsappLink(phone) && <a href={whatsappLink(phone) ?? "#"} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp para ${phone}`}><MessageCircle size={19} /></a>}</div>)}</div><div className="patient-tools"><button onClick={() => void copyPatientDetails()}><Clipboard size={20} /> COPIAR</button><button onClick={() => { if (selectedPatientTeam) openAddress(selectedPatientTeam); else setTeamMessage("Equipe não encontrada para este endereço."); }}><UsersRound size={20} /> EQUIPE</button></div>{copyMessage && <div className="tool-message">{copyMessage}</div>}{teamMessage && <div className="tool-message">{teamMessage}</div>}</section>}

    {view === "territory" && <section className="screen"><Back go={back} /><h1>Nosso território</h1><div className="universal-search"><Search size={22} /><input 
  autoFocus 
  value={streetQuery} 
  onChange={(event) => setStreetQuery(event.target.value)} 
  placeholder="Rua ou número" 
  autoComplete="off"
  autoCapitalize="none"
  autoCorrect="off"
  spellCheck={false}
/>{streetQuery && <button className="clear-search" aria-label="Limpar busca" onClick={() => setStreetQuery("")}><X size={20} /></button>}</div><Pager page={territoryPage} totalPages={territoryPages} onChange={setTerritoryPage} /><div className="address-table"><div className="address-head"><span>RUA</span><span>NÚMEROS ATENDIDOS</span></div>{visibleTerritory.map((entry, index) => <button className="address-row" key={`${entry.street}-${entry.rangeStart}-${entry.rangeEnd}-${index}`} onClick={() => openAddress(entry)}><span><MapPin size={18} />{rotuloRua(entry.street)}</span><strong>{rangeLabel(entry)}</strong><ChevronRight size={19} /></button>)}</div></section>}

     {view === "address-detail" && selectedAddress && <section className="screen narrow"><Back go={back} /><h1>{nomeRua(selectedAddress.street)}</h1><div className="team-card"><div className="range-chip"><i style={{ background: selectedAddress.team.color ?? "#617787" }} />{selectedAddress.team.name ?? "Equipe"} · {rangeLabel(selectedAddress)}</div><div><span>MÉDICA(O)</span><strong>{selectedAddress.team.doctor}</strong></div><div><span>ENFERMEIRA(O)</span><strong>{selectedAddress.team.nurse}</strong></div><div><span>ASSISTENTE</span><strong>{(selectedAddress.team as any).assistant ?? selectedAddress.team.communityAgent}</strong></div></div></section>}

    {view === "operations" && <section className="screen narrow"><Back go={back} /><h1>Funcionamento da unidade</h1><div className="accordion-list">{operationItems.map((item) => <div key={item.title} className={openOperation === item.title ? "accordion open" : "accordion"}><button onClick={() => setOpenOperation(openOperation === item.title ? null : item.title)}><span>{item.title}</span><ChevronDown size={22} /></button>{openOperation === item.title && <div className="accordion-content">{item.text}</div>}</div>)}</div></section>}

    {view === "database" && <section className="screen narrow"><Back go={back} /><h1>Banco de dados</h1><div className="data-actions"><label className="import-button"><FileUp size={23} /> IMPORTAR CSVs (4)<input ref={biInputRef} type="file" accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel" multiple className="visually-hidden" onChange={handleBiFiles} /></label><button className="password-button" onClick={() => { setPasswordEditorOpen((value) => !value); setPasswordNotice(""); setPasswordDraft(""); }}><KeyRound size={22} /> {accessPassword ? "TROCAR SENHA" : "DEFINIR SENHA"}</button><button className="reset-button" onClick={() => { setResetMode(true); setPendingImport(null); setImportError(""); }}><RotateCcw size={22} /> REINICIAR</button></div>{biFiles.length > 0 && <div className="status-box"><h2>Arquivos do BI</h2>{biFiles.map((e) => <div key={e.name} style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap",marginTop:"8px"}}><span style={{fontWeight:700}}>{e.type ? "✔" : "?"}</span><strong>{e.name}</strong>{e.type ? <span>{BI_REPORT_LABELS[e.type]} · {e.count} registro(s)</span> : <><span>Não reconhecido</span><select value="" onChange={(ev) => assignBiType(e.name, ev.target.value as BiReportType | "")}><option value="">— escolher tipo —</option>{(Object.keys(BI_REPORT_LABELS) as BiReportType[]).map((k) => <option key={k} value={k}>{BI_REPORT_LABELS[k]}</option>)}</select></>}<button onClick={() => setBiFiles((p) => p.filter((x) => x.name !== e.name))}>Remover</button></div>)}<div style={{marginTop:"10px"}}><button disabled={!biFiles.some((x) => x.type)} onClick={importBiReports}>UNIR E IMPORTAR</button></div></div>}{passwordNotice && <div className="status-box">{passwordNotice}</div>}{passwordEditorOpen && <div className="status-box reset-confirm"><h2>{accessPassword ? "Escolha uma nova senha" : "Escolha uma senha"}</h2><p className="password-setup-help">A senha é opcional: você decide se quer usar. Escolha 4 caracteres (maiúsculas e números de 1 a 9) — serão pedidos na próxima abertura. Enquanto não definir, o aplicativo abre direto.</p><input value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value.toUpperCase().replace(/[^A-Z1-9]/g, "").slice(0, 4))} maxLength={4} placeholder="A1B2" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} /><div className="confirm-actions"><button disabled={!isValidAccessPassword(passwordDraft)} onClick={saveChosenPassword}>SALVAR SENHA</button>{accessPassword && <button onClick={removeChosenPassword}>REMOVER SENHA</button>}<button onClick={() => { setPasswordEditorOpen(false); setPasswordDraft(""); }}>CANCELAR</button></div></div>}{importError && <div className="status-box error">{importError}</div>}{pendingImport && importInfo && <div className="status-box"><h2>Confirmar atualização?</h2><div className="status-grid"><span>Novos pacientes <strong>{importInfo.newPatients}</strong></span><span>Pacientes alterados <strong>{importInfo.changedPatients}</strong></span><span>Novas ruas <strong>{importInfo.newTerritory}</strong></span><span>Ruas alteradas <strong>{importInfo.changedTerritory}</strong></span><span>Duplicidades ignoradas <strong>{importInfo.duplicatePatients + importInfo.duplicateTerritory}</strong></span></div><div className="confirm-actions"><button onClick={confirmImport}>CONFIRMAR ATUALIZAÇÃO</button><button onClick={() => { setPendingImport(null); setImportInfo(null); }}>CANCELAR</button></div></div>}{resetMode && <div className="status-box reset-confirm"><h2>Reiniciar banco de dados?</h2><input 
  value={confirmation} 
  onChange={(event) => setConfirmation(event.target.value)} 
  placeholder="Digite confirmar" 
  autoComplete="off"
  autoCapitalize="none"
  autoCorrect="off"
  spellCheck={false}
/><div className="confirm-actions"><button disabled={confirmation.trim().toLocaleLowerCase("pt-BR") !== "confirmar"} onClick={confirmReset}>REINICIAR</button><button onClick={() => { setResetMode(false); setConfirmation(""); }}>CANCELAR</button></div></div>}</section>}
  </main></div>;
}
