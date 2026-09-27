import type { Patient } from "@/lib/dataStore";

export type OcrCampos = {
  cadastro?: string;
  nome?: string;
  mae?: string;
  nascimento?: string;
  cpf?: string;
  cns?: string;
  telefone?: string;
  endereco?: string;
  data?: string;
  hora?: string;
  local?: string;
  exame?: string;
  profissional?: string;
};

export type OcrMatch = { patient: Patient; via: string };

type OcrRecognizeResult = { data: { text: string } };
type OcrWorkerLike = {
  recognize(image: HTMLCanvasElement): Promise<OcrRecognizeResult>;
  terminate(): Promise<unknown>;
};

const norm = (value: string) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const soDigitos = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const contaLetras = (value: string) => norm(value).replace(/[^a-z]/g, "").length;

/* Extrai os campos de uma guia/comprovante lidos por OCR.
   Núcleo compartilhado com o Acompanha Digital (Acompanha-Digital.html) e validado
   em 48 fotos reais — bancada em ocr_bench/ (não editar aqui sem rodar comparar.js).
   Orientado a rótulo, com múltiplos candidatos: aceita texto bruto do Tesseract
   (português) e devolve { campo: valor }. */

type CamposOcr = {
  cadastro?: string;
  nome?: string;
  mae?: string;
  nascimento?: string;
  cpf?: string;
  cns?: string;
  telefone?: string;
  endereco?: string;
  data?: string;
  hora?: string;
  local?: string;
  exame?: string;
  profissional?: string;
};

const MAP: Record<string, string> = { á:'a', à:'a', â:'a', ã:'a', ä:'a', é:'e', è:'e', ê:'e', ë:'e', í:'i', ì:'i', î:'i', ï:'i', ó:'o', ò:'o', ô:'o', õ:'o', ö:'o', ú:'u', ù:'u', û:'u', ü:'u', ç:'c' };
const n1 = (s: unknown): string => String(s == null ? '' : s).toLowerCase().replace(/[áàâãäéèêëíìîïóòôõöúùûüç]/g, c => MAP[c]);
const temLetra = (s: unknown): boolean => /[a-zA-Z]/.test(String(s || ''));
const nPalavras = (s: unknown): number => String(s || '').trim().split(/\s+/).filter(w => /[a-zA-Z]/.test(w)).length;
const nLetras = (s: unknown): number => (String(s || '').match(/[a-zA-Z]/g) || []).length;

/* busca todas as ocorrencias (linha, fim do rotulo) em texto normalizado */
function achar(linhas: string[], re: RegExp): Array<{ i: number; fim: number }> {
  const out: Array<{ i: number; fim: number }> = [];
  linhas.forEach((l, i) => {
    const nl = n1(l);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(nl)) !== null) {
      out.push({ i, fim: m.index + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  });
  return out;
}

/* limpa o valor: corta em palavras-chave, duplo espaco e barra vertical */
function limpa(vEntrada: unknown, corts?: string[]): string {
  let v = String(vEntrada == null ? '' : vEntrada);
  const nl = n1(v);
  let fim = v.length;
  for (const c of corts || []) {
    const p = nl.indexOf(c);
    if (p > 0 && p < fim) fim = p;
  }
  v = v.slice(0, fim);
  let p = v.search(/\s{2,}/); if (p > 0) v = v.slice(0, p);
  p = v.search(/\s\|\s|\s\|/); if (p > 0) v = v.slice(0, p);
  return v.replace(/^[\s:;|=\-–—.,/]+/, '').replace(/[\s:;|=\-–—.,]+$/, '').trim();
}

const digitos = (v: unknown): string => String(v == null ? '' : v).replace(/\D/g, '');

/* primeiro grupo de digitos de um valor (junta espacos e descarta ruido depois) */
function clusterNum(s: unknown, min: number, max: number): string {
  const OUT = String(s == null ? '' : s).split(/\s+/);
  let d = '';
  for (const t of OUT) {
    const dt = t.replace(/\D/g, '');
    if (!dt) continue;
    if (d.length + dt.length > max) break;
    d += dt;
  }
  return d.length >= min ? d : '';
}

/* data dd/mm/aaaa corrigindo espacos entre digitos */
function acharData(v: unknown): string {
  const s = String(v == null ? '' : v);
  let m = s.match(/\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})\b/);
  if (!m) m = s.replace(/(\d)\s+(?=\d)/g, '$1').match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (!m) return '';
  let ano = +m[3]; if (ano < 100) ano += ano < 70 ? 2000 : 1900;
  return String(+m[1]).padStart(2, '0') + '/' + String(+m[2]).padStart(2, '0') + '/' + ano;
}
function acharHora(v: unknown): string {
  const m = String(v == null ? '' : v).match(/\b(\d{1,2})[:h](\d{2})\b/);
  if (!m) return '';
  return String(+m[1]).padStart(2, '0') + ':' + String(+m[2]).padStart(2, '0');
}

function extrairCamposOcrBase(texto: string): CamposOcr {
  const c: CamposOcr = {};
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  /* ---------- NOME DO MORADOR ---------- */
  {
    const corts = ['prontuario', 'cns', 'cpf', 'nº', 'telefone', 'data', 'nome da', 'nome do', 'especialidade', 'controle', 'local', 'endere', 'bairro', 'municipio', 'sexo', 'nacionalidade'];
    const lixo = /menor de idade|respons[aá]vel|deve ir|dever[aá]o|acompanhad|instruc|orienta|comparecer|jejum|chegar|documento|identidade|procediment|antenatal|informac|agendado|\bsocial\b/;
    const re = [/paciente\s*[:;\-]?\s*/g, /nome\s+completo[^:]*[:;]?\s*/g, /nome\s+social\s*[:;\-]?\s*/g, /no[a-z]?[mnr]e\s*[:;.\-]?\s*(?=\d)/g, /nome\s*[:;\-]\s*/g, /morador\s*[:;\-]?\s*/g, /[a-z]{0,5}\s*ente\s*[:;]\s*/g];
    const valido = (v: string): boolean => !!v && nLetras(v) >= 5 && !lixo.test(n1(v)) && !/^\s*$/.test(v) && !/paciente\s*$|social\s*$|completo/i.test(v);
    let melhor = '';
    re.forEach(rg => {
      for (const h of achar(linhas, rg)) {
        if (/m[ãa]e|\bpai\b/.test(n1(linhas[h.i]))) continue;
        let v = limpa(linhas[h.i].slice(h.fim).replace(/\s*\|\s*/g, ' '), corts);
        if (!valido(v) && linhas[h.i + 1]) v = limpa(linhas[h.i + 1].replace(/\s*\|\s*/g, ' '), corts);
        if (!valido(v)) continue;
        v = v.replace(/\s*\|\s*/g, ' ');
        if (/^[\d.\-\/\s]{6,}/.test(v)) { const d = v.indexOf(' - '); v = d > 0 ? v.slice(d + 3) : v.replace(/^[\d.\-\/\s]+/, ''); }
        v = limpa(v, corts);
        if (!valido(v) || nPalavras(v) < 1) continue;
        const score = nLetras(v) + (nPalavras(v) >= 2 ? 50 : 0);
        const atual = melhor ? nLetras(melhor) + (nPalavras(melhor) >= 2 ? 50 : 0) : -1;
        if (score > atual) melhor = v;
      }
    });
    if (melhor) c.nome = melhor;
  }

  /* ---------- NÚMERO DE CADASTRO ---------- */
  {
    const primeiro = (v: unknown): string => { const m = String(v || '').match(/\d[\d\s]{2,9}/); return m ? m[0].replace(/\D/g, '') : ''; };
    const grupos: Array<(linha: string) => string | null> = [
      linha => { const m = n1(linha).match(/c[a-z]*ad[aã]o\s*[:;.\-]?\s*(?::\s*)?/); return m ? linha.slice((m.index || 0) + m[0].length) : null; },
      linha => { const m = n1(linha).match(/cad\s*(?:do\s+)?paciente[^:;\n]*[:;\-]?\s*/); return m ? linha.slice((m.index || 0) + m[0].length) : null; },
      linha => { const m = n1(linha).match(/no[a-z]*e\s*[:;.\-]?\s*(?=\d)/); return m ? linha.slice((m.index || 0) + m[0].length) : null; },
      linha => { const m = n1(linha).match(/(\d{4,8})\s*n[ºo]?\s*atend/); return m ? m[1] : null; },
      linha => { const m = n1(linha).match(/prontu[áa]rio\s*[:;.\-]\s*/); if (!m) return null; const resto = linha.slice((m.index || 0) + m[0].length).trim(); return /^\d/.test(resto) ? resto : null; },
    ];
    outer:
    for (const g of grupos) {
      for (const linha of linhas) {
        const val = g(linha);
        if (val == null) continue;
        const d = typeof val === 'string' && /^\d+$/.test(val) ? val : primeiro(val);
        if (d.length >= 4 && d.length <= 8) { c.cadastro = d; break outer; }
      }
    }
  }

  /* ---------- CNS ---------- */
  {
    const corts = ['prontuario', 'cpf', 'nº', 'telefone', 'data', 'nome', 'paciente', 'local', 'endere', 'controle', 'especialidade', 'bairro', 'cidadao', 'atendimento', 'profissional', 'identidade'];
    const cands = achar(linhas, /c[\s.]*n[\s.]*[s85][\s.]*[:;\-]?\s*/g)
      .map(h => {
        let d = clusterNum(limpa(linhas[h.i].slice(h.fim), corts), 12, 16);
        const prox = linhas[h.i + 1];
        if (!d && prox && !/cpf|cns|cnpj|nome|data|telefone|espec|prontu|profissional|local|endere|atendimento/.test(n1(prox))) {
          d = clusterNum(limpa(prox, corts), 12, 16);
        }
        return d;
      })
      .filter(Boolean);
    let melhor = '';
    for (const d of cands) if (!melhor || Math.abs(d.length - 15) < Math.abs(melhor.length - 15)) melhor = d;
    if (!melhor) { const m = String(texto).match(/\b\d{15}\b/); if (m) melhor = m[0]; }
    if (melhor) c.cns = melhor;
  }

  /* ---------- CPF ---------- */
  {
    const validaCpf = (d: string): boolean => {
      if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
      let s = 0; for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
      let r = (s * 10) % 11 % 10; if (r !== +d[9]) return false;
      s = 0; for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
      r = (s * 10) % 11 % 10; return r === +d[10];
    };
    /* corrige 1 digito a mais (OCR cola numero) usando o digito verificador */
    const ajusta = (d: string): string => {
      if (d.length === 11) return validaCpf(d) ? d : d;
      if (d.length === 12) for (let i = 0; i < 12; i++) { const c = d.slice(0, i) + d.slice(i + 1); if (validaCpf(c)) return c; }
      return d;
    };
    const corts = ['nº', 'numero', 'telefone', 'prontu', 'data', 'nome', 'paciente', 'cns', 'che', 'cidadao', 'atendimento', 'controle', 'local', 'identidade', 'nacionalidade'];
    const re = [/c[pf][pf][a-z]*\s*[:;.\-]?\s*/g, /c[pf][pf]?[a-z]?\s*[:;]\s*/g];
    const cands: string[] = [];
    re.forEach(rg => {
      for (const h of achar(linhas, rg)) {
        if (/cnpj|cnes|cnh/.test(n1(linhas[h.i]))) continue;
        let d = clusterNum(limpa(linhas[h.i].slice(h.fim), corts), 9, 12);
        const prox = linhas[h.i + 1];
        if (!d && prox && !/cnpj|cnes/.test(n1(prox))) {
          const m = prox.match(/\d[\d.\s-]{7,}\d/);
          if (m) d = clusterNum(digitos(m[0]), 9, 12);
        }
        if (d) cands.push(d);
      }
    });
    const validos = cands.map(ajusta).filter(validaCpf);
    const ok = validos[0] || cands.find(d => d.length === 11) || cands.find(d => d.length === 12) || cands[0];
    if (ok) c.cpf = ok;
  }

  /* ---------- TELEFONE ---------- */
  {
    const corts = ['data', 'cns', 'cpf', 'nº', 'paciente', 'prontu', 'local', 'hora', 'controle', 'especialidade'];
    const re = [/celular\s*[:;.\-]?\s*/g, /cel\s*[:;.\-]?\s*/g, /tel\.?\s*cel\s*[:;.\-]?\s*/g, /telefone\s+principal\s*[:;.\-]?\s*/g, /telefone\s*[:;.\-]?\s*/g, /tele[a-z]*\s*[:;.\-]?\s*/g, /[a-z]*fone\s*[:;.\-]?\s*/g, /pr[a-z]*[nc]ipal\s*[:;.\-]?\s*/g, /tel\.?\s*[:;.\-]?\s*/g];
    let melhor = '';
    const nota = (d: string): number => (!d ? -1 : d.length === 11 && d[2] === '9' ? 3 : d.length === 11 ? 2 : d.length === 10 ? 1 : d.length === 9 ? 0 : -1);
    re.forEach(rg => {
      for (const h of achar(linhas, rg)) {
        if (/marcela|profissional|especialidade/.test(n1(linhas[h.i])) && !/tele|fone|cel/.test(n1(linhas[h.i]))) continue;
        const d = clusterNum(limpa(linhas[h.i].slice(h.fim), corts), 9, 11);
        if (!d) continue;
        if (nota(d) > nota(melhor)) melhor = d;
      }
    });
    if (!melhor) {
      for (const l of linhas) {
        const m = n1(l).match(/\b\d{2}[\s.\-]+\s*9[\s.\-]?\d{4}[\s.\-]*\d{4}\b/);
        if (m) { const d = digitos(m[0]); if (d.length >= 10 && d.length <= 11) { melhor = d; break; } }
      }
    }
    if (melhor) c.telefone = melhor;
  }

  /* ---------- NOME DA MÃE ---------- */
  {
    const corts = ['nome do pai', 'cns', 'cpf', 'prontu', 'nº', 'idade', 'nacionalidade', 'orgao', 'religiao', 'estado civil', 'sexo', 'endere', 'telefone', 'data'];
    const nomeOk = (v: string): boolean => !!v && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]*$/.test(v) && nPalavras(v) >= 2 && nPalavras(v) <= 10 && v.length <= 60;
    const busca = (re: RegExp): string[] => {
      const out = [];
      for (const h of achar(linhas, re)) {
        const cands = [limpa(linhas[h.i].slice(h.fim), corts)];
        if (linhas[h.i + 1]) cands.push(limpa(linhas[h.i + 1], corts));
        const bom = cands.find(nomeOk);
        if (bom) out.push(bom);
      }
      return out;
    };
    const especificas = busca(/nome\s+(?:completo\s+)?da\s+m[ãa]e\s*[:;.\-]?\s*/g);
    const genericas = especificas.length ? [] : busca(/m[ãa]e\s*[:;.\-]\s*/g);
    const lista = especificas.concat(genericas);
    if (lista.length) c.mae = lista.sort((a, b) => nLetras(b) - nLetras(a))[0];
  }

  /* ---------- DATA DE NASCIMENTO ---------- */
  {
    const re = [/dt\.?\s*nasc[a-z]*\s*[:;.\-]?\s*/g, /data\s+de\s+nasc[a-z]*\s*[:;.\-]?\s*/g, /\bnasciment[a-z]*\s*[:;.\-]?\s*/g, /\b(?:t|i)dade\s*[:;.\-]\s*/g];
    for (const rg of re) {
      for (const h of achar(linhas, rg)) {
        let d = acharData(linhas[h.i].slice(h.fim));
        if (!d && linhas[h.i + 1]) d = acharData(linhas[h.i + 1]);
        if (d) { c.nascimento = d; break; }
      }
      if (c.nascimento) break;
    }
    if (!c.nascimento) {
      for (const l of linhas) { const m = n1(l).match(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\s*\(\s*\d+\s*anos/); if (m) { const d = acharData(m[0]); if (d) { c.nascimento = d; break; } } }
    }
  }

  /* ---------- ENDEREÇO ---------- */
  {
    const corts = ['cep', 'municipio', 'bairro', 'cns', 'cpf', 'telefone', 'data', 'cidade', 'unidade'];
    const hs = achar(linhas, /endere[cç]o\s*[:;\-]?\s*/g);
    for (const h of hs) {
      let v = limpa(linhas[h.i].slice(h.fim), corts);
      if (!v && linhas[h.i + 1]) v = limpa(linhas[h.i + 1], corts);
      if (nLetras(v) >= 5) { c.endereco = v; break; }
    }
  }

  /* ---------- DATA DO EXAME / AGENDAMENTO ---------- */
  {
    const re = [
      /data\s*e\s*hora\s*[:;\-]?\s*/g,
      /data\s*\/\s*hora\s*[:;.\-]?\s*/g,
      /\bdata\s*\/?\s*consulta\s*[:;.\-]?\s*/g,
      /data\s+do\s+exame\s*[:;.\-]?\s*/g,
      /[a-z]?ata\s*[=e]?\s*hora\s*[:;.\-]?\s*/g,
      /data\s*[:;\-]\s*/g,
    ];
    for (const rg of re) {
      for (const h of achar(linhas, rg)) {
        const d = acharData(linhas[h.i].slice(h.fim));
        if (d) { c.data = d; break; }
      }
      if (c.data) break;
    }
  }

  /* ---------- HORÁRIO DO EXAME ---------- */
  {
    for (const h of achar(linhas, /\bhor[áa]rio\s*[:;\-]?\s*/g)) {
      const hh = acharHora(linhas[h.i].slice(h.fim));
      if (hh) { c.hora = hh; break; }
    }
    if (!c.hora) {
      const reH = [/data\s*e\s*hora\s*[:;.\-]?\s*/g, /data\s*\/\s*hora\s*[:;.\-]?\s*/g, /[a-z]?ata\s*[=e]?\s*hora\s*[:;.\-]?\s*/g];
      for (const rg of reH) {
        for (const h of achar(linhas, rg)) {
          const hh = acharHora(linhas[h.i].slice(h.fim));
          if (hh) { c.hora = hh; break; }
        }
        if (c.hora) break;
      }
    }
    if (!c.hora) {
      for (const l of linhas) { const m = n1(l).match(/\bas\s+(\d{1,2}[:h]\d{2})\b/); if (m) { const hh = acharHora(m[1]); if (hh) { c.hora = hh; break; } } }
    }
  }

  /* ---------- LOCAL DO EXAME ---------- */
  {
    const corts = ['endere', 'bairro', 'municipio', 'rua:', 'data', 'solicitante', 'profissional', 'especialidade', 'informac', 'cep'];
    const re = [/local\s*\/\s*unidade\s*[:;\-]?\s*/g, /local\s+do\s+exame\s*[:;\-]?\s*/g, /local\s+coleta\s*[:;\-]?\s*/g, /\blocal\s*[:;\-]\s*/g, /\bunidade\s*[:;\-]\s*/g];
    for (const rg of re) {
      let achou = false;
      for (const h of achar(linhas, rg)) {
        let v = limpa(linhas[h.i].slice(h.fim), corts).replace(/^[\d.\-]{2,}\s*[-.–]?\s*/, '');
        if (!v && linhas[h.i + 1]) v = limpa(linhas[h.i + 1], corts);
        if (v && nLetras(v) >= 4 && !/^\d+$/.test(v)) {
          const prox = linhas[h.i + 1];
          if (prox && !/[:;|]/.test(prox) && nLetras(prox) >= 4 && nPalavras(v) <= 6) v = limpa(v + ' ' + limpa(prox, corts), corts);
          c.local = v; achou = true; break;
        }
      }
      if (achou) break;
    }
  }

  /* ---------- EXAME / ESPECIALIDADE ---------- */
  {
    const corts = ['local', 'informac', 'servic', 'profissional', 'controle', 'endere', 'data', 'solicitante', 'che', 'referencia', 'prioridade', 'tipo', 'sala'];
    const re = [/especialidade\s*\/\s*consulta\s*[:;\-]?\s*/g, /especialidade\s*[:;\-]\s*/g, /\bespec(?![a-z])[\s.]*[.:;]?\s*/g, /exame\s*[:;\-]\s*/g];
    for (const rg of re) {
      let achou = false;
      for (const h of achar(linhas, rg)) {
        if (/preparacao|antes do|antecedencia|resultado|anteriore|instruc/.test(n1(linhas[h.i]))) continue;
        const v = limpa(linhas[h.i].slice(h.fim), corts);
        if (nLetras(v) >= 4) { c.exame = v; achou = true; break; }
      }
      if (achou) break;
    }
    if (!c.exame) {
      const idx = linhas.findIndex(l => /mn[eê]monico/.test(n1(l)));
      if (idx >= 0 && linhas[idx + 1]) { const v = limpa(linhas[idx + 1].replace(/^\S{1,5}\s+/, ''), corts); if (nLetras(v) >= 4) c.exame = v; }
    }
    if (!c.exame) {
      const idx = linhas.findIndex(l => /solicitacao\s+procedimento/.test(n1(l)));
      if (idx >= 0 && linhas[idx + 1]) { const v = limpa(linhas[idx + 1], corts); if (nLetras(v) >= 4) c.exame = v; }
    }
  }

  /* ---------- PROFISSIONAL ---------- */
  {
    const corts = ['especialidade', 'local', 'controle', 'endere', 'crm', 'telefone', 'data', 'solicitante'];
    const re = [/profissional\s*(?:solicitante)?\s*[:;\-]?\s*/g, /\bmedico\s*[:;\-]\s*/g];
    for (const rg of re) {
      let achou = false;
      for (const h of achar(linhas, rg)) {
        const v = limpa(linhas[h.i].slice(h.fim), corts);
        if (nLetras(v) >= 6 && nPalavras(v) >= 2) { c.profissional = v; achou = true; break; }
      }
      if (achou) break;
    }
  }

  return c;
}


export function extrairCamposOcr(texto: string): OcrCampos {
  return extrairCamposOcrBase(texto);
}

export function buscarPorOcr(campos: OcrCampos, pacientes: Patient[]): OcrMatch[] {
  const encontrados: OcrMatch[] = [];
  const vistos = new Set<string>();
  const cadastroExato = new Set<string>();
  const adicionar = (patient: Patient, via: string) => {
    if (vistos.has(patient.id)) return;
    vistos.add(patient.id);
    encontrados.push({ patient, via });
  };
  const cad = soDigitos(campos.cadastro);
  const cns = soDigitos(campos.cns);
  const cpf = soDigitos(campos.cpf);
  const fone = soDigitos(campos.telefone);
  const palavras = norm(campos.nome ?? "").split(/\s+/).filter((w) => w.length >= 3);
  const nomeLido = norm(campos.nome ?? "");
  if (cad.length >= 4) {
    const cadastroLimpo = semZeros(cad);
    for (const p of pacientes) {
      const reg = soDigitos(p.registration);
      if (!reg) continue;
      // 1º critério: número de cadastro 100% igual (descontando zeros à esquerda).
      if (reg.length >= 4 && semZeros(reg) === cadastroLimpo) cadastroExato.add(p.id);
      if (reg.includes(cad) || cad.includes(reg.slice(0, 4))) adicionar(p, "Cadastro");
    }
  }
  if (cns.length >= 6) {
    for (const p of pacientes) {
      const c = soDigitos(p.cns);
      if (c && (c.includes(cns) || cns.includes(c.slice(0, 6)))) adicionar(p, "CNS");
    }
  }
  if (cpf.length >= 8) {
    const prefixo = cpf.slice(0, 8);
    for (const p of pacientes) {
      const c = soDigitos(p.cpf);
      if (c && (c.includes(cpf) || c.includes(prefixo))) adicionar(p, "CPF");
    }
  }
  if (fone.length >= 8) {
    const sufixo = fone.slice(-8);
    for (const p of pacientes) {
      const telefones = [...(p.phones ?? []), p.phone ?? ""].map(soDigitos).filter(Boolean);
      if (telefones.some((tel) => tel.includes(sufixo) || sufixo.includes(tel.slice(-8)))) adicionar(p, "Telefone");
    }
  }
  if (palavras.length) {
    for (const p of pacientes) {
      const nome = norm(p.name);
      if (palavras.every((w) => nome.includes(w))) adicionar(p, "Nome");
    }
  }
  const ordem: Record<string, number> = { Cadastro: 0, CNS: 1, CPF: 2, Telefone: 3, Nome: 4 };
  // Ordenação pedida: 1º cadastro com exatidão total; 2º maior aproximação do nome.
  encontrados.sort((a, b) => {
    const exatoA = cadastroExato.has(a.patient.id) ? 0 : 1;
    const exatoB = cadastroExato.has(b.patient.id) ? 0 : 1;
    if (exatoA !== exatoB) return exatoA - exatoB;
    const nomeA = similaridadeNome(nomeLido, norm(a.patient.name));
    const nomeB = similaridadeNome(nomeLido, norm(b.patient.name));
    if (nomeA !== nomeB) return nomeB - nomeA;
    const viaA = ordem[a.via] ?? 9;
    const viaB = ordem[b.via] ?? 9;
    if (viaA !== viaB) return viaA - viaB;
    return a.patient.name.localeCompare(b.patient.name, "pt-BR");
  });
  return encontrados.slice(0, 30);
}

/* Desconsidera zeros à esquerda (o cartão cidadão impresso tem, a base não). */
const semZeros = (value: string) => value.replace(/^0+(?=\d)/, "");

/* Aproximação entre dois nomes: palavras em comum pesadas pelo tamanho e,
   no desempate, similaridade de bigramas (Dice). 0 a 1. */
function similaridadeNome(lido: string, candidato: string): number {
  const a = String(lido ?? "").trim();
  const b = String(candidato ?? "").trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  const palavrasA = a.split(/\s+/).filter(Boolean);
  const palavrasB = new Set(b.split(/\s+/).filter(Boolean));
  const comuns = palavrasA.filter((palavra) => palavrasB.has(palavra));
  if (comuns.length) {
    const pesoComum = comuns.reduce((total, palavra) => total + palavra.length, 0);
    const pesoTotal = Math.max(palavrasA.reduce((total, palavra) => total + palavra.length, 0), 1);
    return 0.6 + 0.4 * (pesoComum / pesoTotal);
  }
  return dice(a, b);
}
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigramas = (texto: string) => { const mapa = new Map<string, number>(); for (let i = 0; i < texto.length - 1; i++) { const g = texto.slice(i, i + 2); mapa.set(g, (mapa.get(g) ?? 0) + 1); } return mapa; };
  const mapaA = bigramas(a); const mapaB = bigramas(b);
  let comuns = 0;
  mapaB.forEach((quantidade, g) => { const disponivel = mapaA.get(g) ?? 0; if (disponivel > 0) { comuns += Math.min(disponivel, quantidade); mapaA.set(g, disponivel - quantidade); } });
  return (2 * comuns) / ((a.length - 1) + (b.length - 1));
}

let workerPromise: Promise<OcrWorkerLike> | null = null;

function getTesseract(): any {
  const global = window as unknown as { Tesseract?: any };
  if (!global.Tesseract) throw new Error("Módulo de leitura não encontrado (ocr/tesseract.min.js não carregou). Verifique a pasta public/ocr e recarregue.");
  if (window.location.protocol === "file:") throw new Error("Abra via servidor (npm run dev) ou app instalado — o navegador bloqueia o leitor com duplo-clique (file://).");
  return global.Tesseract;
}

/* Base do OCR relativa à página atual — funciona em dev (vite),
   build (dist/public) e Capacitor. NÃO funciona via file://
   (Chrome bloqueia importScripts do Worker). Substitui o '/ocr/'
   absoluto que quebrava fora da raiz do servidor. */
function ocrBaseUrl(): string {
  try {
    const u = new URL("ocr/worker.min.js", document.baseURI);
    return u.href.slice(0, u.href.lastIndexOf("/"));
  } catch {
    return "ocr";
  }
}

export type OcrStatus = { status: string; progress: number };

/* Progresso do Tesseract vai para quem chamou a última leitura; quando o worker é
   pré-carregado (sem chamador) os avisos são só para o console. */
let reportarProgresso: ((pct: number, status?: OcrStatus) => void) | null = null;

/* Deixa o leitor pronto ANTES da foto: aquece o worker assim que o usuário abre o
   BUSCADOR ÓPTICO, para a primeira leitura não esperar o carregamento da API. */
export function precarregarOcr(): Promise<void> {
  try {
    if (!workerPromise) workerPromise = criarWorker();
  } catch { return Promise.resolve(); }
  return workerPromise.then(() => undefined, () => undefined);
}

function criarWorker(): Promise<OcrWorkerLike> {
  const Tesseract = getTesseract();
  const base = ocrBaseUrl();
  const mkLogger = (m: { status: string; progress: number }) => {
    if (typeof m.progress === "number") reportarProgresso?.(Math.min(100, Math.round(m.progress * 100)), m);
    else reportarProgresso?.(0, m);
  };
  const criarLocal = () =>
    Tesseract.createWorker("por", 1, {
      workerPath: base + "/worker.min.js",
      corePath: base + "/",
      langPath: base,
      gzip: false,
      logger: mkLogger,
    });
  const criarCdn = () =>
    Tesseract.createWorker("por", 1, {
      workerPath: base + "/worker.min.js",
      corePath: base + "/",
      gzip: true,
      logger: mkLogger,
    });
  return (async () => {
    try {
      return await criarLocal();
    } catch (e1) {
      // APKs antigos renomeiam .gz para sem extensão (aapt):
      // busca o traineddata na CDN oficial (precisa internet 1x).
      try { console.warn("[OCR] langPath local falhou, tentando CDN:", (e1 as Error)?.message || e1); } catch { /* noop */ }
      reportarProgresso?.(0, { status: "Modelo local indisponível, baixando da internet…", progress: 0 });
      return await criarCdn();
    }
  })();
}

export async function reconhecerImagem(
  arquivo: File,
  onProgress: (pct: number, status?: OcrStatus) => void,
): Promise<string> {
  reportarProgresso = onProgress;
  if (!workerPromise) {
    workerPromise = criarWorker();
  }
  try {
    const promessa = workerPromise;
    if (!promessa) throw new Error("Módulo de leitura indisponível.");
    const worker = await promessa;
    const canvas = await comprimirImagem(arquivo);
    const { data } = await worker.recognize(canvas);
    try { console.info("[OCR] texto bruto:", data.text); } catch { /* noop */ }
    return data.text;
  } catch (reason) {
    workerPromise = null;
    try { console.error("[OCR] falha:", reason); } catch { /* noop */ }
    throw reason;
  } finally {
    reportarProgresso = null;
  }
}

function comprimirImagem(arquivo: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 1600;
        const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * sc);
        const h = Math.round(img.naturalHeight * sc);
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        cv.getContext("2d")?.drawImage(img, 0, 0, w, h);
        resolve(cv);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagem inválida"));
    };
    img.src = url;
  });
}