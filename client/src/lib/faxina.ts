import type { Patient } from "./dataStore";

export type FaxinaGrupoId = "cpf" | "cns" | "cadastro" | "cruzamento" | "demografia" | "similaridade" | "fonetico" | "inversao" | "estatistica";

export type FaxinaSeveridade = "fraude" | "duplicata" | "erro" | "incompleto" | "coincidencia";

export type FaxinaAchado = {
  id: string;
  grupo: FaxinaGrupoId;
  regra: string;
  severidade: FaxinaSeveridade;
  titulo: string;
  motivo: string;
  ids: string[];
  total: number;
};

export type FaxinaGrupo = { id: FaxinaGrupoId; numero: number; titulo: string; descricao: string };

export const FAXINA_GRUPOS: FaxinaGrupo[] = [
  { id: "cpf", numero: 1, titulo: "CPF", descricao: "Formato, dígito verificador e CPF reutilizado em cadastros diferentes." },
  { id: "cns", numero: 2, titulo: "CNS", descricao: "Cartão Nacional de Saúde com dígito errado ou repetido em várias pessoas." },
  { id: "cadastro", numero: 3, titulo: "Cadastro", descricao: "Número de cadastro escrito errado ou usado por mais de um paciente." },
  { id: "cruzamento", numero: 4, titulo: "Cruzamentos", descricao: "Campos de um paciente batendo com campos de outro: CPF, CNS, cadastro, telefone." },
  { id: "demografia", numero: 5, titulo: "Identificador + demografia", descricao: "Mesmo CPF, CNS ou cadastro com mãe, nascimento, sexo ou endereço divergentes." },
  { id: "similaridade", numero: 6, titulo: "Similaridade", descricao: "Nomes, mães e documentos quase idênticos: 1 dígito de diferença ou letra trocada." },
  { id: "fonetico", numero: 7, titulo: "Fonética", descricao: "Nomes e mães com o mesmo som, escritos de maneiras diferentes." },
  { id: "inversao", numero: 8, titulo: "Inversão e fragmentação", descricao: "Nomes trocados, invertidos, cortados e campos CPF/CNS trocados de lugar." },
  { id: "estatistica", numero: 9, titulo: "Estatísticas", descricao: "Quantidades fora do padrão: datas impossíveis, registros incompletos, homônimos." },
];

export const ORDEM_SEVERIDADE: FaxinaSeveridade[] = ["fraude", "duplicata", "erro", "incompleto", "coincidencia"];

export const ROTULO_SEVERIDADE: Record<FaxinaSeveridade, string> = {
  fraude: "Possível fraude",
  duplicata: "Duplicidade",
  erro: "Erro de digitação",
  incompleto: "Cadastro incompleto",
  coincidencia: "Coincidência",
};

export type FaxinaResumo = {
  totalPacientes: number;
  totalAchados: number;
  porGrupo: Record<FaxinaGrupoId, number>;
  porSeveridade: Record<FaxinaSeveridade, number>;
  ordemPipeline: { severidade: FaxinaSeveridade; total: number }[];
  ms: number;
};

export type FaxinaResultado = { achados: FaxinaAchado[]; resumo: FaxinaResumo };

export type FaxinaProgresso = { etapa: string; pct: number };

type Registro = {
  paciente: Patient;
  id: string;
  nome: string;
  nomeNorm: string;
  nomeTokens: string[];
  mae: string;
  maeNorm: string;
  endereco: string;
  enderecoNorm: string;
  nascimento: string;
  nascimentoMs: number | null;
  cadastro: string;
  cpf: string;
  cns: string;
  cnsTodos: string[];
  sexo: string;
  telefones: string[];
  soundexNome: string;
  soundexMae: string;
};

const UM_DIA_MS = 86400000;
const LIMITE_IDS = 200;
const LIMITE_ACHADOS = 20000;
const LIMITE_BLOCO = 40;
const LIMITE_BLOCO_ID = 30;
const LIMITE_BLOCO_NOME_DATA = 100;

function semAcentos(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function norm(valor?: string | null) {
  return semAcentos(String(valor ?? "")).replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
}

function listaTokens(valor?: string | null) {
  const texto = norm(valor);
  return texto ? texto.split(" ") : [];
}

function digitos(valor?: unknown) {
  return String(valor ?? "").replace(/\D/g, "");
}

function dataMs(valor?: string | null): number | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(texto);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const brasileiro = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/.exec(texto);
  if (brasileiro) {
    const curto = Number(brasileiro[3]);
    const ano = brasileiro[3].length === 2 ? (curto > (new Date().getUTCFullYear() % 100) + 1 ? 1900 + curto : 2000 + curto) : curto;
    return Date.UTC(ano, Number(brasileiro[2]) - 1, Number(brasileiro[1]));
  }
  return null;
}

function mesmoDia(primeiro: number | null, segundo: number | null, toleranciaDias = 0) {
  if (primeiro === null || segundo === null) return false;
  return Math.abs(primeiro - segundo) <= toleranciaDias * UM_DIA_MS;
}

function levenshtein(primeiro: string, segundo: string) {
  if (primeiro === segundo) return 0;
  if (!primeiro.length) return segundo.length;
  if (!segundo.length) return primeiro.length;
  let anterior = new Array<number>(segundo.length + 1);
  let atual = new Array<number>(segundo.length + 1);
  for (let coluna = 0; coluna <= segundo.length; coluna += 1) anterior[coluna] = coluna;
  for (let linha = 1; linha <= primeiro.length; linha += 1) {
    atual[0] = linha;
    for (let coluna = 1; coluna <= segundo.length; coluna += 1) {
      const custo = primeiro[linha - 1] === segundo[coluna - 1] ? 0 : 1;
      atual[coluna] = Math.min(anterior[coluna] + 1, atual[coluna - 1] + 1, anterior[coluna - 1] + custo);
    }
    const troca = anterior;
    anterior = atual;
    atual = troca;
  }
  return anterior[segundo.length];
}

function similaridade(primeiro: string, segundo: string) {
  const maior = Math.max(primeiro.length, segundo.length);
  if (!maior) return 1;
  return 1 - levenshtein(primeiro, segundo) / maior;
}

const INICIAL_EQUIVALENTE: Record<string, string> = {
  c: "c", k: "c", q: "c", g: "g", j: "g", v: "v", w: "v", s: "s", z: "s", x: "s",
  f: "f", p: "p", b: "p", t: "t", d: "t", m: "m", n: "m", l: "l", r: "r",
  a: "a", e: "e", i: "i", o: "o", u: "u",
};

const CODIGO_LETRA: Record<string, string> = {
  b: "1", f: "1", p: "1", v: "1", w: "1",
  c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2",
  t: "3", d: "3",
  l: "4",
  m: "5", n: "5",
  r: "6",
};

function soundexPT(valor?: string | null) {
  let texto = norm(valor).replace(/\s+/g, "");
  if (!texto) return "";
  texto = texto
    .replace(/ph/g, "f")
    .replace(/ch/g, "c")
    .replace(/lh/g, "l")
    .replace(/nh/g, "n")
    .replace(/rr/g, "r")
    .replace(/ss/g, "s")
    .replace(/c(?=t)/g, "")
    .replace(/h/g, "");
  if (!texto) return "";
  const inicial = INICIAL_EQUIVALENTE[texto[0]] ?? texto[0];
  const corpo: string[] = [];
  for (let indice = 1; indice < texto.length; indice += 1) {
    const codigo = CODIGO_LETRA[texto[indice]];
    if (!codigo) continue;
    if (corpo[corpo.length - 1] === codigo) continue;
    corpo.push(codigo);
  }
  return (inicial + corpo.join("")).padEnd(4, "0").slice(0, 4);
}

function chaveFonetica(valor?: string | null) {
  const palavras = norm(valor).split(" ").filter(Boolean);
  if (!palavras.length) return "";
  if (palavras.length === 1) return soundexPT(palavras[0]);
  return `${soundexPT(palavras[0])}|${soundexPT(palavras[palavras.length - 1])}`;
}

function cpfValido(cpf: string) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let indice = 0; indice < 9; indice += 1) soma += Number(cpf[indice]) * (10 - indice);
  let primeiro = (soma * 10) % 11;
  if (primeiro === 10) primeiro = 0;
  if (primeiro !== Number(cpf[9])) return false;
  soma = 0;
  for (let indice = 0; indice < 10; indice += 1) soma += Number(cpf[indice]) * (11 - indice);
  let segundo = (soma * 10) % 11;
  if (segundo === 10) segundo = 0;
  return segundo === Number(cpf[10]);
}

function cnsValido(cns: string) {
  if (cns.length !== 15 || !/^\d{15}$/.test(cns)) return false;
  let soma = 0;
  for (let indice = 0; indice < 14; indice += 1) soma += Number(cns[indice]) * (15 - indice);
  const resto = soma % 11;
  let dv = 11 - resto;
  if (dv === 11) dv = 0;
  if (dv === 10) return false;
  return dv === Number(cns[14]);
}

function mascara(valor: string, posicao: number) {
  return `${valor.slice(0, posicao)}*${valor.slice(posicao + 1)}`;
}

function telefonesDe(paciente: Patient) {
  const fonte = paciente.phones?.length ? paciente.phones : paciente.phone ? [paciente.phone] : [];
  return Array.from(new Set(fonte.map((telefone) => digitos(telefone)).filter(Boolean)));
}

function montarRegistro(paciente: Patient): Registro {
  const nome = paciente.name ?? "";
  const mae = paciente.mother ?? "";
  const endereco = paciente.address ?? "";
  const cnsTodos = Array.from(new Set(
    [paciente.cns, paciente.cnsExtra, ...(paciente.cnsTodos ?? [])]
      .map((valor) => digitos(valor))
      .filter((valor) => valor.length >= 11),
  ));
  return {
    paciente,
    id: paciente.id,
    nome,
    nomeNorm: norm(nome),
    nomeTokens: listaTokens(nome),
    mae,
    maeNorm: norm(mae),
    endereco,
    enderecoNorm: norm(endereco),
    nascimento: paciente.birth ?? "",
    nascimentoMs: dataMs(paciente.birth),
    cadastro: digitos(paciente.registration),
    cpf: digitos(paciente.cpf),
    cns: digitos(paciente.cns),
    cnsTodos,
    sexo: norm(paciente.sexo),
    telefones: telefonesDe(paciente),
    soundexNome: chaveFonetica(nome),
    soundexMae: chaveFonetica(mae),
  };
}

function identificar(registro: Registro) {
  const partes = [registro.nome || "(sem nome)"];
  if (registro.cadastro) partes.push(`cadastro ${registro.cadastro}`);
  if (registro.nascimentoMs !== null) partes.push(`nasc. ${registro.nascimento.slice(0, 10)}`);
  return partes.join(" · ");
}

function agrupar(registros: Registro[], chaveDe: (registro: Registro) => string | null) {
  const mapa = new Map<string, Registro[]>();
  for (const registro of registros) {
    const chave = chaveDe(registro);
    if (!chave) continue;
    const lista = mapa.get(chave);
    if (lista) lista.push(registro);
    else mapa.set(chave, [registro]);
  }
  return mapa;
}

function porPares(registros: Registro[], chaveDe: (registro: Registro) => string | null, teste: (primeiro: Registro, segundo: Registro) => void, limite = LIMITE_BLOCO) {
  for (const bloco of Array.from(agrupar(registros, chaveDe).values())) {
    if (bloco.length < 2 || bloco.length > limite) continue;
    for (let externo = 0; externo < bloco.length - 1; externo += 1) {
      for (let interno = externo + 1; interno < bloco.length; interno += 1) {
        teste(bloco[externo], bloco[interno]);
      }
    }
  }
}

function porMascara(registros: Registro[], valorDe: (registro: Registro) => string | null, teste: (primeiro: Registro, segundo: Registro) => void) {
  const mascaras = new Map<string, Registro[]>();
  for (const registro of registros) {
    const valor = valorDe(registro);
    if (!valor) continue;
    for (let posicao = 0; posicao < valor.length; posicao += 1) {
      const chave = mascara(valor, posicao);
      const lista = mascaras.get(chave);
      if (lista) lista.push(registro);
      else mascaras.set(chave, [registro]);
    }
  }
  for (const bloco of Array.from(mascaras.values())) {
    if (bloco.length < 2 || bloco.length > LIMITE_BLOCO_ID) continue;
    for (let externo = 0; externo < bloco.length - 1; externo += 1) {
      for (let interno = externo + 1; interno < bloco.length; interno += 1) {
        teste(bloco[externo], bloco[interno]);
      }
    }
  }
}

function subconjuntoEstrito(primeiro: Registro, segundo: Registro) {
  const menor = primeiro.nomeTokens.length <= segundo.nomeTokens.length ? primeiro : segundo;
  const maior = menor === primeiro ? segundo : primeiro;
  if (!menor.nomeTokens.length || menor.nomeTokens.length === maior.nomeTokens.length) return false;
  return menor.nomeTokens.every((token) => maior.nomeTokens.includes(token));
}

type ItemAvulso = { grupo: FaxinaGrupoId; severidade: FaxinaSeveridade; titulo: string; motivo: string; exemplos: string[]; ids: string[] };

function* executarRegras(registros: Registro[], emitir: (item: { grupo: FaxinaGrupoId; regra: string; severidade: FaxinaSeveridade; titulo: string; motivo: string; ids: string[] }) => void): Generator<FaxinaProgresso, void, void> {
  const avulsos = new Map<string, ItemAvulso>();
  const avulso = (regra: string, dados: { grupo: FaxinaGrupoId; severidade: FaxinaSeveridade; titulo: string; motivo: string }, registro: Registro) => {
    const existente = avulsos.get(regra);
    if (!existente) {
      avulsos.set(regra, { ...dados, exemplos: [identificar(registro)], ids: [registro.id] });
      return;
    }
    existente.ids.push(registro.id);
    if (existente.exemplos.length < 3) existente.exemplos.push(identificar(registro));
  };

  const comCpf = registros.filter((registro) => registro.cpf.length === 11);
  const comCns = registros.filter((registro) => registro.cns.length === 15);
  const porNome = agrupar(registros, (registro) => registro.nomeNorm || null);
  const porEndereco = agrupar(registros, (registro) => registro.enderecoNorm || null);
  yield { etapa: "Conferindo cadastro por cadastro", pct: 15 };

  for (const registro of registros) {
    if (registro.cpf) {
      if (registro.cpf.length !== 11) avulso("1.1", { grupo: "cpf", severidade: "erro", titulo: "CPF com quantidade de dígitos errada", motivo: "Campos CPF fora do padrão de 11 dígitos.", }, registro);
      else if (/^(\d)\1{10}$/.test(registro.cpf)) avulso("1.7", { grupo: "cpf", severidade: "erro", titulo: "CPF com todos os dígitos iguais", motivo: "CPF repetido de ponta a ponta, que não é um CPF real." }, registro);
      else if (!cpfValido(registro.cpf)) avulso("1.2", { grupo: "cpf", severidade: "erro", titulo: "CPF com dígito verificador inválido", motivo: "CPF cujos dígitos verificadores não fecham no cálculo." }, registro);
    }
    if (registro.cns && registro.cns.length !== 15) avulso("2.1", { grupo: "cns", severidade: "erro", titulo: "CNS com quantidade de dígitos errada", motivo: "Campos CNS fora do padrão de 15 dígitos." }, registro);
    else if (registro.cns && !cnsValido(registro.cns)) avulso("2.2", { grupo: "cns", severidade: "erro", titulo: "CNS com dígito verificador inválido", motivo: "CNS cujo dígito verificador não fecha no cálculo." }, registro);
    if (registro.cnsTodos.length > 1) avulso("2.7", { grupo: "cns", severidade: "coincidencia", titulo: "Paciente com mais de um CNS", motivo: `Pacientes com dois ou mais CNS no cadastro.` }, registro);
    if (registro.cadastro && !/^\d{4,12}$/.test(registro.cadastro)) avulso("3.1", { grupo: "cadastro", severidade: "erro", titulo: "Cadastro fora do formato esperado", motivo: "Cadastros com letra, símbolo ou tamanho fora de 4 a 12 dígitos." }, registro);
    if (registro.nascimentoMs !== null) {
      const data = new Date(registro.nascimentoMs);
      if (data.getTime() > Date.now()) avulso("9.1", { grupo: "estatistica", severidade: "erro", titulo: "Nascimento no futuro", motivo: "Datas de nascimento posteriores a hoje." }, registro);
      else if (data.getUTCFullYear() < 1900) avulso("9.2", { grupo: "estatistica", severidade: "erro", titulo: "Nascimento anterior a 1900", motivo: "Datas de nascimento anteriores a 1900." }, registro);
    }
    if (registro.nomeNorm.replace(/\s/g, "").length < 3) avulso("9.3", { grupo: "estatistica", severidade: "erro", titulo: "Nome muito curto", motivo: "Nomes com menos de 3 letras." }, registro);
    if (/\d/.test(registro.nome)) avulso("9.4", { grupo: "estatistica", severidade: "erro", titulo: "Nome com números", motivo: "Nomes com dígito numérico dentro." }, registro);
    if (registro.nome.includes(",") || /\.$/.test(registro.nome.trim())) avulso("9.5", { grupo: "estatistica", severidade: "erro", titulo: "Nome abreviado com vírgula", motivo: "Nomes no formato SOBRENOME, NOME." }, registro);
    if (!registro.enderecoNorm) avulso("9.6", { grupo: "estatistica", severidade: "incompleto", titulo: "Cadastro sem endereço", motivo: "Pacientes sem nenhum endereço preenchido." }, registro);
    if (!registro.cpf) avulso("9.7", { grupo: "estatistica", severidade: "incompleto", titulo: "Cadastro sem CPF", motivo: "Pacientes sem CPF preenchido." }, registro);
    if (!registro.cns) avulso("9.8", { grupo: "estatistica", severidade: "incompleto", titulo: "Cadastro sem CNS", motivo: "Pacientes sem CNS preenchido." }, registro);
    if (registro.nascimentoMs === null) avulso("9.9", { grupo: "estatistica", severidade: "incompleto", titulo: "Cadastro sem data de nascimento", motivo: "Pacientes sem data de nascimento preenchida." }, registro);
    if (registro.maeNorm && registro.maeNorm === registro.nomeNorm) avulso("8.4", { grupo: "inversao", severidade: "erro", titulo: "Nome do paciente repetido no campo da mãe", motivo: "Pacientes cujo campo da mãe tem o próprio nome." }, registro);
    if (registro.cns && registro.cns.length === 11 && registro.cpf.length === 15) avulso("8.5", { grupo: "inversao", severidade: "erro", titulo: "CPF e CNS trocados de campo", motivo: "Pacientes com o CNS escrito no campo CPF e o CPF escrito no campo CNS." }, registro);
    if (registro.cpf.length === 11 && registro.cns === registro.cpf) avulso("4.1", { grupo: "cruzamento", severidade: "erro", titulo: "CPF repetido no campo CNS", motivo: "Pacientes com o próprio CPF escrito também como CNS." }, registro);
  }

  yield { etapa: "Conferindo CPF repetido", pct: 32 };
  for (const [chave, bloco] of Array.from(agrupar(comCpf, (registro) => registro.cpf))) {
    if (bloco.length < 2) continue;
    const ids = bloco.map((registro) => registro.id);
    const nomes = new Set(bloco.map((registro) => registro.nomeNorm));
    const nascimentos = new Set(bloco.map((registro) => registro.nascimento));
    const maes = new Set(bloco.map((registro) => registro.maeNorm));
    const enderecos = new Set(bloco.map((registro) => registro.enderecoNorm));
    const relacao = bloco.map(identificar).join(" | ");
    if (bloco.length >= 3) emitir({ grupo: "cpf", regra: "1.6", severidade: "fraude", titulo: `Mesmo CPF em ${bloco.length} pacientes`, motivo: `CPF ${chave} usado por: ${relacao}.`, ids });
    if (nomes.size > 1) emitir({ grupo: "cpf", regra: "1.3", severidade: "fraude", titulo: "Mesmo CPF com nomes diferentes", motivo: `CPF ${chave} aparece como: ${relacao}.`, ids });
    if (nomes.size === 1 && nascimentos.size > 1) emitir({ grupo: "cpf", regra: "1.4", severidade: "erro", titulo: "Mesmo CPF com nascimento divergente", motivo: `CPF ${chave}: ${relacao}.`, ids });
    if (nomes.size === 1 && maes.size > 1) emitir({ grupo: "cpf", regra: "1.5", severidade: "erro", titulo: "Mesmo CPF com nome da mãe divergente", motivo: `CPF ${chave}: ${relacao}.`, ids });
    if (nomes.size === 1 && nascimentos.size === 1 && maes.size === 1 && enderecos.size === 1) emitir({ grupo: "cpf", regra: "1.8", severidade: "duplicata", titulo: "Mesmo CPF em cadastros idênticos", motivo: `CPF ${chave}: ${relacao}.`, ids });
  }

  yield { etapa: "Conferindo CNS repetido", pct: 37 };
  for (const [chave, bloco] of Array.from(agrupar(comCns, (registro) => registro.cns))) {
    if (bloco.length < 2) continue;
    const ids = bloco.map((registro) => registro.id);
    const nomes = new Set(bloco.map((registro) => registro.nomeNorm));
    const nascimentos = new Set(bloco.map((registro) => registro.nascimento));
    const maes = new Set(bloco.map((registro) => registro.maeNorm));
    const enderecos = new Set(bloco.map((registro) => registro.enderecoNorm));
    const relacao = bloco.map(identificar).join(" | ");
    if (bloco.length >= 3) emitir({ grupo: "cns", regra: "2.6", severidade: "fraude", titulo: `Mesmo CNS em ${bloco.length} pacientes`, motivo: `CNS ${chave} usado por: ${relacao}.`, ids });
    if (nomes.size > 1) emitir({ grupo: "cns", regra: "2.3", severidade: "fraude", titulo: "Mesmo CNS com nomes diferentes", motivo: `CNS ${chave} aparece como: ${relacao}.`, ids });
    if (nomes.size === 1 && nascimentos.size > 1) emitir({ grupo: "cns", regra: "2.8", severidade: "erro", titulo: "Mesmo CNS com nascimento divergente", motivo: `CNS ${chave}: ${relacao}.`, ids });
    if (nomes.size === 1 && (maes.size > 1 || enderecos.size > 1)) emitir({ grupo: "cns", regra: "2.4", severidade: "erro", titulo: "Mesmo CNS com dados divergentes", motivo: `CNS ${chave}: ${relacao}.`, ids });
    if (nomes.size === 1 && nascimentos.size === 1 && maes.size === 1 && enderecos.size === 1) emitir({ grupo: "cns", regra: "2.5", severidade: "duplicata", titulo: "Mesmo CNS em cadastros idênticos", motivo: `CNS ${chave}: ${relacao}.`, ids });
  }

  yield { etapa: "Conferindo cadastro repetido", pct: 42 };
  for (const [chave, bloco] of Array.from(agrupar(registros, (registro) => registro.cadastro || null))) {
    if (bloco.length < 2 || chave.length < 4) continue;
    const ids = bloco.map((registro) => registro.id);
    const nomes = new Set(bloco.map((registro) => registro.nomeNorm));
    const nascimentos = new Set(bloco.map((registro) => registro.nascimento));
    const maes = new Set(bloco.map((registro) => registro.maeNorm));
    const relacao = bloco.map(identificar).join(" | ");
    if (bloco.length >= 3) emitir({ grupo: "cadastro", regra: "3.5", severidade: "fraude", titulo: `Mesmo cadastro em ${bloco.length} pacientes`, motivo: `Cadastro ${chave} usado por: ${relacao}.`, ids });
    if (nomes.size > 1) emitir({ grupo: "cadastro", regra: "3.2", severidade: "fraude", titulo: "Mesmo cadastro com nomes diferentes", motivo: `Cadastro ${chave} aparece como: ${relacao}.`, ids });
    if (nomes.size === 1 && (nascimentos.size > 1 || maes.size > 1)) emitir({ grupo: "cadastro", regra: "3.3", severidade: "erro", titulo: "Mesmo cadastro com dados divergentes", motivo: `Cadastro ${chave}: ${relacao}.`, ids });
    if (nomes.size === 1 && nascimentos.size === 1 && maes.size === 1) emitir({ grupo: "cadastro", regra: "3.4", severidade: "duplicata", titulo: "Mesmo cadastro em cadastros idênticos", motivo: `Cadastro ${chave}: ${relacao}.`, ids });
  }

  yield { etapa: "Cruzando documentos entre pacientes", pct: 47 };
  const documentosPorValor = agrupar(registros, (registro) => {
    if (registro.cpf.length === 11) return registro.cpf;
    if (registro.cns.length === 11) return registro.cns;
    if (registro.cns.length === 15) return registro.cns;
    return null;
  });
  const cnsPorValor = agrupar(registros, (registro) => registro.cns.length === 15 ? registro.cns : null);

  for (const registro of registros) {
    if (registro.cns.length === 11 && registro.cns !== registro.cpf) {
      const outros = (documentosPorValor.get(registro.cns) ?? []).filter((dono) => dono.id !== registro.id);
      if (outros.length) {
        emitir({ grupo: "cruzamento", regra: "4.2", severidade: "erro", titulo: "CPF de outro paciente no campo CNS", motivo: `${identificar(registro)} tem no CNS o documento de ${outros.map(identificar).join(" | ")}.`, ids: [registro.id, ...outros.map((dono) => dono.id)] });
        for (const dono of outros) {
          if (dono.cns.length === 11 && dono.cns === registro.cpf) emitir({ grupo: "cruzamento", regra: "4.3", severidade: "fraude", titulo: "CPF e CNS trocados entre dois pacientes", motivo: `${identificar(registro)} e ${identificar(dono)} trocaram CPF e CNS entre si.`, ids: [registro.id, dono.id] });
        }
      }
    }
    if (registro.cadastro.length >= 11) {
      const outros = (documentosPorValor.get(registro.cadastro) ?? []).filter((dono) => dono.id !== registro.id);
      if (outros.length) emitir({ grupo: "cruzamento", regra: "4.4", severidade: "erro", titulo: "Documento de outro paciente no campo cadastro", motivo: `${identificar(registro)} usa como cadastro o documento de ${outros.map(identificar).join(" | ")}.`, ids: [registro.id, ...outros.map((dono) => dono.id)] });
    }
    if (registro.cadastro.length === 15) {
      const outros = (cnsPorValor.get(registro.cadastro) ?? []).filter((dono) => dono.id !== registro.id);
      if (outros.length) emitir({ grupo: "cruzamento", regra: "4.5", severidade: "erro", titulo: "CNS de outro paciente no campo cadastro", motivo: `${identificar(registro)} usa como cadastro o CNS de ${outros.map(identificar).join(" | ")}.`, ids: [registro.id, ...outros.map((dono) => dono.id)] });
    }
  }

  yield { etapa: "Cruzando nomes, mães e endereços", pct: 52 };
  porPares(registros, (registro) => (registro.nomeNorm && registro.maeNorm ? `${registro.nomeNorm}|${registro.maeNorm}|${registro.enderecoNorm}` : null), (primeiro, segundo) => {
    if (!primeiro.enderecoNorm || primeiro.enderecoNorm !== segundo.enderecoNorm) return;
    if (primeiro.cpf === segundo.cpf && primeiro.cpf) return;
    emitir({ grupo: "cruzamento", regra: "4.6", severidade: "duplicata", titulo: "Mesmo nome, mãe e endereço com documentos diferentes", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  });

  porPares(registros, (registro) => (registro.nomeNorm && registro.maeNorm && registro.nascimentoMs !== null ? `${registro.nomeNorm}|${registro.maeNorm}|${registro.nascimentoMs}` : null), (primeiro, segundo) => {
    if (primeiro.cpf === segundo.cpf && primeiro.cpf) return;
    emitir({ grupo: "cruzamento", regra: "4.7", severidade: "duplicata", titulo: "Mesmo nome, mãe e nascimento com documentos diferentes", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  });

  yield { etapa: "Cruzando telefones", pct: 57 };
  const porTelefone = new Map<string, Registro[]>();
  for (const registro of registros) {
    for (const telefone of registro.telefones) {
      const lista = porTelefone.get(telefone);
      if (lista) lista.push(registro);
      else porTelefone.set(telefone, [registro]);
    }
  }
  for (const [telefone, bloco] of Array.from(porTelefone)) {
    if (bloco.length < 3) continue;
    const nomes = new Set(bloco.map((registro) => registro.nomeNorm));
    if (nomes.size < 2) continue;
    const enderecos = new Set(bloco.map((registro) => registro.enderecoNorm).filter(Boolean));
    if (enderecos.size < 2) continue;
    const sobrenomes = new Set(bloco.map((registro) => registro.nomeTokens[registro.nomeTokens.length - 1]).filter(Boolean));
    if (sobrenomes.size < 2) continue;
    emitir({ grupo: "cruzamento", regra: "4.8", severidade: "coincidencia", titulo: `Telefone compartilhado por ${bloco.length} pacientes`, motivo: `Telefone ${telefone} usado por: ${bloco.map(identificar).join(" | ")}.`, ids: bloco.map((registro) => registro.id) });
  }

  porPares(registros, (registro) => (registro.enderecoNorm && registro.maeNorm && registro.nascimentoMs !== null ? `${registro.enderecoNorm}|${registro.maeNorm}|${registro.nascimentoMs}` : null), (primeiro, segundo) => {
    if (primeiro.nomeNorm === segundo.nomeNorm) return;
    emitir({ grupo: "cruzamento", regra: "4.9", severidade: "duplicata", titulo: "Mesma mãe, endereço e nascimento com nomes diferentes", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  });

  yield { etapa: "Cruzando mães e nascimentos", pct: 62 };
  const regrasDemografia = {
    "1": { grupo: "demografia" as FaxinaGrupoId, maeDiferente: "5.1", nascimentoDiferente: "5.2", enderecoDiferente: "5.3", parecidoMesmoDia: "5.9", parecidoDiaDiferente: "5.10", sexo: "5.4" },
    "2": { grupo: "demografia" as FaxinaGrupoId, maeDiferente: "5.5", nascimentoDiferente: "5.6", enderecoDiferente: "", parecidoMesmoDia: "", parecidoDiaDiferente: "", sexo: "" },
    "3": { grupo: "demografia" as FaxinaGrupoId, maeDiferente: "5.7", nascimentoDiferente: "5.8", enderecoDiferente: "", parecidoMesmoDia: "", parecidoDiaDiferente: "", sexo: "" },
  };
  const identificadores: [string, Map<string, Registro[]>][] = [
    ["1", agrupar(registros, (registro) => (registro.cpf.length === 11 ? registro.cpf : null))],
    ["2", agrupar(registros, (registro) => (registro.cns.length === 15 ? registro.cns : null))],
    ["3", agrupar(registros, (registro) => registro.cadastro || null)],
  ];
  for (const [tipo, blocos] of identificadores) {
    const regras = regrasDemografia[tipo as keyof typeof regrasDemografia];
    for (const bloco of Array.from(blocos.values())) {
      if (bloco.length < 2 || bloco.length > LIMITE_BLOCO_ID) continue;
      for (let externo = 0; externo < bloco.length - 1; externo += 1) {
        for (let interno = externo + 1; interno < bloco.length; interno += 1) {
          const primeiro = bloco[externo];
          const segundo = bloco[interno];
          const relacao = `${identificar(primeiro)} | ${identificar(segundo)}`;
          const mesmoNome = Boolean(primeiro.nomeNorm) && primeiro.nomeNorm === segundo.nomeNorm;
          const parecido = Boolean(primeiro.nomeNorm && segundo.nomeNorm) && primeiro.nomeNorm !== segundo.nomeNorm && similaridade(primeiro.nomeNorm, segundo.nomeNorm) >= 0.8;
          if (mesmoNome) {
            if (primeiro.maeNorm && segundo.maeNorm && primeiro.maeNorm !== segundo.maeNorm) emitir({ grupo: regras.grupo, regra: regras.maeDiferente, severidade: "erro", titulo: "Mesmo identificador com nome da mãe divergente", motivo: relacao, ids: [primeiro.id, segundo.id] });
            if (primeiro.nascimento && segundo.nascimento && primeiro.nascimento !== segundo.nascimento) emitir({ grupo: regras.grupo, regra: regras.nascimentoDiferente, severidade: "erro", titulo: "Mesmo identificador com nascimento divergente", motivo: relacao, ids: [primeiro.id, segundo.id] });
            if (regras.enderecoDiferente && primeiro.enderecoNorm && segundo.enderecoNorm && primeiro.enderecoNorm !== segundo.enderecoNorm) emitir({ grupo: regras.grupo, regra: regras.enderecoDiferente, severidade: "coincidencia", titulo: "Mesmo identificador com endereços diferentes", motivo: relacao, ids: [primeiro.id, segundo.id] });
            if (regras.sexo && primeiro.sexo && segundo.sexo && primeiro.sexo !== segundo.sexo) emitir({ grupo: regras.grupo, regra: regras.sexo, severidade: "erro", titulo: "Mesmo CPF com sexo divergente", motivo: relacao, ids: [primeiro.id, segundo.id] });
          }
          if (regras.parecidoMesmoDia && parecido && mesmoDia(primeiro.nascimentoMs, segundo.nascimentoMs, 0)) emitir({ grupo: regras.grupo, regra: regras.parecidoMesmoDia, severidade: "duplicata", titulo: "Mesmo identificador com nomes parecidos e mesmo nascimento", motivo: relacao, ids: [primeiro.id, segundo.id] });
          if (regras.parecidoDiaDiferente && parecido && primeiro.nascimentoMs !== null && segundo.nascimentoMs !== null && !mesmoDia(primeiro.nascimentoMs, segundo.nascimentoMs, 0)) emitir({ grupo: regras.grupo, regra: regras.parecidoDiaDiferente, severidade: "fraude", titulo: "Mesmo CPF com nomes parecidos e nascimentos diferentes", motivo: relacao, ids: [primeiro.id, segundo.id] });
        }
      }
    }
  }

  yield { etapa: "Conferindo demografia", pct: 67 };
  const indiceNomeData = new Map<string, Registro[]>();
  for (const registro of registros) {
    if (!registro.nomeNorm || registro.nascimentoMs === null) continue;
    for (const deslocamento of [-1, 0, 1]) {
      const chave = `${registro.nomeNorm}|${registro.nascimentoMs + deslocamento * UM_DIA_MS}`;
      const lista = indiceNomeData.get(chave);
      if (lista) lista.push(registro);
      else indiceNomeData.set(chave, [registro]);
    }
  }
  for (const bloco of Array.from(indiceNomeData.values())) {
    if (bloco.length < 2 || bloco.length > LIMITE_BLOCO_NOME_DATA) continue;
    for (let externo = 0; externo < bloco.length - 1; externo += 1) {
      for (let interno = externo + 1; interno < bloco.length; interno += 1) {
        const primeiro = bloco[externo];
        const segundo = bloco[interno];
        if (!mesmoDia(primeiro.nascimentoMs, segundo.nascimentoMs, 1)) continue;
        emitir({ grupo: "similaridade", regra: "6.1", severidade: "duplicata", titulo: "Mesmo nome com nascimento de 1 dia de diferença", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
      }
    }
  }

  yield { etapa: "Comparando nomes parecidos", pct: 73 };
  porPares(registros, (registro) => (registro.nomeNorm && registro.maeNorm ? `${registro.nomeNorm}|${registro.maeNorm}` : null), (primeiro, segundo) => {
    if (!primeiro.enderecoNorm || !segundo.enderecoNorm || primeiro.enderecoNorm === segundo.enderecoNorm) return;
    emitir({ grupo: "similaridade", regra: "6.2", severidade: "duplicata", titulo: "Mesmo nome e mãe com endereços diferentes", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_NOME_DATA);

  porPares(registros, (registro) => (registro.nomeNorm && registro.enderecoNorm ? `${registro.nomeNorm}|${registro.enderecoNorm}` : null), (primeiro, segundo) => {
    if (!primeiro.maeNorm || !segundo.maeNorm || primeiro.maeNorm === segundo.maeNorm) return;
    emitir({ grupo: "similaridade", regra: "6.3", severidade: "erro", titulo: "Mesmo nome e endereço com mães diferentes", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_NOME_DATA);

  porPares(registros, (registro) => (registro.nomeNorm && registro.nascimentoMs !== null ? `${registro.nomeNorm}|${registro.nascimentoMs}` : null), (primeiro, segundo) => {
    if (!primeiro.maeNorm || !segundo.maeNorm || primeiro.maeNorm === segundo.maeNorm) return;
    if (similaridade(primeiro.maeNorm, segundo.maeNorm) < 0.8) return;
    emitir({ grupo: "similaridade", regra: "6.4", severidade: "duplicata", titulo: "Mesmo nome e nascimento com mães parecidas", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_NOME_DATA);

  porPares(registros, (registro) => (registro.nomeNorm && registro.enderecoNorm ? `${registro.nomeNorm}|${registro.enderecoNorm}` : null), (primeiro, segundo) => {
    if (primeiro.nascimentoMs === null || segundo.nascimentoMs === null) return;
    if (!mesmoDia(primeiro.nascimentoMs, segundo.nascimentoMs, 1)) return;
    emitir({ grupo: "similaridade", regra: "6.5", severidade: "duplicata", titulo: "Mesmo nome e endereço com nascimento de 1 dia de diferença", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_NOME_DATA);

  yield { etapa: "Procurando dígitos trocados", pct: 79 };
  porMascara(comCpf, (registro) => registro.cpf, (primeiro, segundo) => {
    const relacao = `${identificar(primeiro)} | ${identificar(segundo)}`;
    if (primeiro.nomeNorm && primeiro.nomeNorm === segundo.nomeNorm) emitir({ grupo: "similaridade", regra: "6.6", severidade: "erro", titulo: "CPF do mesmo paciente com 1 dígito diferente", motivo: `CPFs ${primeiro.cpf} e ${segundo.cpf} — ${relacao}.`, ids: [primeiro.id, segundo.id] });
    else if (similaridade(primeiro.nomeNorm, segundo.nomeNorm) >= 0.8) emitir({ grupo: "similaridade", regra: "6.7", severidade: "fraude", titulo: "Nomes parecidos com CPF de 1 dígito diferente", motivo: `CPFs ${primeiro.cpf} e ${segundo.cpf} — ${relacao}.`, ids: [primeiro.id, segundo.id] });
  });

  porMascara(comCns, (registro) => registro.cns, (primeiro, segundo) => {
    if (!primeiro.nomeNorm || primeiro.nomeNorm !== segundo.nomeNorm) return;
    emitir({ grupo: "similaridade", regra: "6.8", severidade: "erro", titulo: "CNS do mesmo paciente com 1 dígito diferente", motivo: `CNSs ${primeiro.cns} e ${segundo.cns} — ${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  });

  porMascara(registros, (registro) => (registro.cadastro.length >= 6 ? registro.cadastro : null), (primeiro, segundo) => {
    if (!primeiro.nomeNorm || primeiro.nomeNorm !== segundo.nomeNorm) return;
    emitir({ grupo: "similaridade", regra: "6.9", severidade: "erro", titulo: "Cadastro do mesmo paciente com 1 dígito diferente", motivo: `Cadastros ${primeiro.cadastro} e ${segundo.cadastro} — ${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  });

  porPares(registros, (registro) => (registro.nascimentoMs !== null && registro.enderecoNorm ? `${registro.nascimentoMs}|${registro.enderecoNorm}` : null), (primeiro, segundo) => {
    if (!primeiro.nomeNorm || !segundo.nomeNorm || primeiro.nomeNorm === segundo.nomeNorm) return;
    if (similaridade(primeiro.nomeNorm, segundo.nomeNorm) < 0.8) return;
    emitir({ grupo: "similaridade", regra: "6.10", severidade: "duplicata", titulo: "Nomes parecidos com mesmo nascimento e endereço", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  });

  yield { etapa: "Conferindo sons parecidos", pct: 85 };
  porPares(registros, (registro) => (registro.soundexNome && registro.nascimentoMs !== null ? `${registro.soundexNome}|${registro.nascimentoMs}` : null), (primeiro, segundo) => {
    if (primeiro.nomeNorm === segundo.nomeNorm) return;
    emitir({ grupo: "fonetico", regra: "7.1", severidade: "duplicata", titulo: "Nomes com o mesmo som e mesma data de nascimento", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_NOME_DATA);

  porPares(registros, (registro) => (registro.soundexNome && registro.enderecoNorm ? `${registro.soundexNome}|${registro.enderecoNorm}` : null), (primeiro, segundo) => {
    if (primeiro.nomeNorm === segundo.nomeNorm) return;
    emitir({ grupo: "fonetico", regra: "7.2", severidade: "coincidencia", titulo: "Nomes com o mesmo som no mesmo endereço", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_NOME_DATA);

  porPares(registros, (registro) => (registro.soundexMae && registro.nascimentoMs !== null ? `${registro.soundexMae}|${registro.nascimentoMs}` : null), (primeiro, segundo) => {
    if (!primeiro.maeNorm || !segundo.maeNorm || primeiro.maeNorm === segundo.maeNorm) return;
    emitir({ grupo: "fonetico", regra: "7.3", severidade: "coincidencia", titulo: "Nome da mãe com o mesmo som e mesma data de nascimento", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_NOME_DATA);

  porPares(registros, (registro) => (registro.soundexNome && registro.soundexMae ? `${registro.soundexNome}|${registro.soundexMae}` : null), (primeiro, segundo) => {
    if (!primeiro.enderecoNorm || primeiro.enderecoNorm !== segundo.enderecoNorm) return;
    emitir({ grupo: "fonetico", regra: "7.4", severidade: "duplicata", titulo: "Nome e mãe com o mesmo som no mesmo endereço", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
    if (primeiro.nomeNorm === segundo.nomeNorm || primeiro.nascimentoMs === null || segundo.nascimentoMs === null) return;
    if (!mesmoDia(primeiro.nascimentoMs, segundo.nascimentoMs, 1)) return;
    emitir({ grupo: "fonetico", regra: "7.5", severidade: "duplicata", titulo: "Nome e mãe com o mesmo som e nascimento de 1 dia de diferença", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_NOME_DATA);

  yield { etapa: "Conferindo nomes invertidos", pct: 90 };
  porPares(registros, (registro) => (registro.nomeTokens.length >= 2 ? [...registro.nomeTokens].sort().join(" ") : null), (primeiro, segundo) => {
    if (primeiro.nomeNorm === segundo.nomeNorm) return;
    const mesmoNascimento = mesmoDia(primeiro.nascimentoMs, segundo.nascimentoMs, 1);
    const mesmaMae = Boolean(primeiro.maeNorm) && primeiro.maeNorm === segundo.maeNorm;
    if (!mesmoNascimento && !mesmaMae) return;
    emitir({ grupo: "inversao", regra: "8.1", severidade: "duplicata", titulo: "Nome com as palavras invertidas", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_NOME_DATA);

  for (const bloco of Array.from(porEndereco.values())) {
    if (bloco.length < 2 || bloco.length > LIMITE_BLOCO) continue;
    for (let externo = 0; externo < bloco.length - 1; externo += 1) {
      for (let interno = externo + 1; interno < bloco.length; interno += 1) {
        const primeiro = bloco[externo];
        const segundo = bloco[interno];
        if (primeiro.nomeNorm === segundo.nomeNorm) continue;
        if (!subconjuntoEstrito(primeiro, segundo)) continue;
        emitir({ grupo: "inversao", regra: "8.2", severidade: "duplicata", titulo: "Nome cortado no mesmo endereço", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
      }
    }
  }

  porPares(registros, (registro) => (registro.cpf.length === 11 ? registro.cpf : null), (primeiro, segundo) => {
    if (primeiro.nomeNorm === segundo.nomeNorm) return;
    if (!subconjuntoEstrito(primeiro, segundo)) return;
    emitir({ grupo: "inversao", regra: "8.3", severidade: "duplicata", titulo: "Nome cortado com o mesmo CPF", motivo: `${identificar(primeiro)} | ${identificar(segundo)}.`, ids: [primeiro.id, segundo.id] });
  }, LIMITE_BLOCO_ID);

  for (const registro of registros) {
    if (!registro.maeNorm) continue;
    const donos = porNome.get(registro.maeNorm);
    if (!donos) continue;
    for (const dono of donos) {
      if (dono.id === registro.id) continue;
      if (!dono.maeNorm || dono.maeNorm !== registro.nomeNorm) continue;
      emitir({ grupo: "inversao", regra: "8.4", severidade: "erro", titulo: "Nome da mãe trocado entre dois pacientes", motivo: `${identificar(registro)} e ${identificar(dono)} estão como mãe um do outro.`, ids: [registro.id, dono.id] });
    }
  }

  yield { etapa: "Conferindo homônimos e pendências", pct: 95 };
  for (const [nome, bloco] of Array.from(porNome)) {
    if (bloco.length < 2) continue;
    emitir({ grupo: "estatistica", regra: "9.10", severidade: "coincidencia", titulo: `Homônimos: ${nome}`, motivo: `${bloco.length} pacientes com exatamente o mesmo nome.`, ids: bloco.map((registro) => registro.id) });
  }

  for (const [regra, item] of Array.from(avulsos)) {
    emitir({ regra, grupo: item.grupo, severidade: item.severidade, titulo: item.titulo, motivo: `${item.motivo} Exemplos: ${item.exemplos.join(" | ")}.`, ids: item.ids });
  }
}

function aplicarPipeline(mapa: Map<string, FaxinaAchado>, registros: Registro[]) {
  const porId = new Map(registros.map((registro) => [registro.id, registro]));
  const achados = Array.from(mapa.values());
  for (const achado of achados) {
    if (achado.ids.length < 2 || achado.severidade === "fraude") continue;
    const alvos = achado.ids.map((id) => porId.get(id)).filter((registro): registro is Registro => Boolean(registro));
    if (alvos.length < 2) continue;
    const primeiro = alvos[0];
    const identicos = alvos.every((registro) =>
      registro.nomeNorm === primeiro.nomeNorm
      && registro.maeNorm === primeiro.maeNorm
      && registro.nascimento === primeiro.nascimento
      && registro.enderecoNorm === primeiro.enderecoNorm,
    );
    if (identicos) achado.severidade = "duplicata";
  }
  const numeroGrupo = new Map(FAXINA_GRUPOS.map((grupo) => [grupo.id, grupo.numero]));
  achados.sort((primeiro, segundo) =>
    ORDEM_SEVERIDADE.indexOf(primeiro.severidade) - ORDEM_SEVERIDADE.indexOf(segundo.severidade)
    || (numeroGrupo.get(primeiro.grupo) ?? 99) - (numeroGrupo.get(segundo.grupo) ?? 99)
    || primeiro.regra.localeCompare(segundo.regra)
    || primeiro.titulo.localeCompare(segundo.titulo, "pt-BR"));
  return achados;
}

function* gerarFaxina(pacientes: Patient[]): Generator<FaxinaProgresso, FaxinaResultado, void> {
  const inicio = Date.now();
  const registros: Registro[] = [];
  const PASSO = 2000;
  for (let inicioPasso = 0; inicioPasso < pacientes.length; inicioPasso += PASSO) {
    const limite = Math.min(inicioPasso + PASSO, pacientes.length);
    for (let indice = inicioPasso; indice < limite; indice += 1) registros.push(montarRegistro(pacientes[indice]));
    yield { etapa: "Lendo os cadastros", pct: pacientes.length ? Math.min(10, Math.round((limite / pacientes.length) * 10)) : 10 };
  }
  const mapa = new Map<string, FaxinaAchado>();
  const emitir = (item: { grupo: FaxinaGrupoId; regra: string; severidade: FaxinaSeveridade; titulo: string; motivo: string; ids: string[] }) => {
    if (mapa.size >= LIMITE_ACHADOS) return;
    const ids = Array.from(new Set(item.ids.filter(Boolean))).sort();
    if (!ids.length) return;
    const chave = `${item.regra}|${ids.join(",")}`;
    if (mapa.has(chave)) return;
    const truncados = ids.length > LIMITE_IDS ? ids.slice(0, LIMITE_IDS) : ids;
    mapa.set(chave, {
      id: chave,
      grupo: item.grupo,
      regra: item.regra,
      severidade: item.severidade,
      titulo: item.titulo,
      motivo: item.motivo,
      ids: truncados,
      total: ids.length,
    });
  };
  const fluxoRegras = executarRegras(registros, emitir);
  let passoRegra = fluxoRegras.next();
  while (!passoRegra.done) {
    yield passoRegra.value;
    passoRegra = fluxoRegras.next();
  }
  yield { etapa: "Organizando os achados", pct: 98 };
  const achados = aplicarPipeline(mapa, registros);
  const porGrupo = Object.fromEntries(FAXINA_GRUPOS.map((grupo) => [grupo.id, 0])) as Record<FaxinaGrupoId, number>;
  const porSeveridade = Object.fromEntries(ORDEM_SEVERIDADE.map((severidade) => [severidade, 0])) as Record<FaxinaSeveridade, number>;
  for (const achado of achados) {
    porGrupo[achado.grupo] += 1;
    porSeveridade[achado.severidade] += 1;
  }
  return {
    achados,
    resumo: {
      totalPacientes: pacientes.length,
      totalAchados: achados.length,
      porGrupo,
      porSeveridade,
      ordemPipeline: ORDEM_SEVERIDADE.map((severidade) => ({ severidade, total: porSeveridade[severidade] })),
      ms: Date.now() - inicio,
    },
  };
}

function ceder() {
  return new Promise<void>((resolver) => { setTimeout(resolver, 0); });
}

export function executarFaxina(pacientes: Patient[]): FaxinaResultado {
  const fluxo = gerarFaxina(pacientes);
  let passo = fluxo.next();
  while (!passo.done) passo = fluxo.next();
  return passo.value;
}

export async function executarFaxinaComProgresso(
  pacientes: Patient[],
  aoAvancar: (progresso: FaxinaProgresso) => void,
  cancelado?: () => boolean,
): Promise<FaxinaResultado | null> {
  const fluxo = gerarFaxina(pacientes);
  let passo = fluxo.next();
  while (!passo.done) {
    if (cancelado?.()) return null;
    aoAvancar(passo.value);
    await ceder();
    passo = fluxo.next();
  }
  return passo.value;
}
