// Leitura de arquivos .rar — WASM do unrar oficial (node-unrar-js).
// A senha é automática (ver senhaAutomatica.ts): tenta o mês atual e o mês
// anterior da data do dispositivo; nunca é pedida nem mostrada ao usuário.
import wasmUrl from "node-unrar-js/esm/js/unrar.wasm?url";
import { SENHA_DICA_ERRO, senhasAutomaticas } from "@/lib/senhaAutomatica";

let wasmPromise: Promise<ArrayBuffer> | null = null;

function loadWasm(): Promise<ArrayBuffer> {
  if (!wasmPromise) {
    wasmPromise = fetch(wasmUrl).then((response) => {
      if (!response.ok) throw new Error("Não foi possível carregar o leitor de RAR.");
      return response.arrayBuffer();
    });
  }
  return wasmPromise;
}

function senhaPareceErrada(reason: unknown): boolean {
  const code = (reason as { reason?: string } | null)?.reason;
  return code === "ERAR_BAD_PASSWORD" || code === "ERAR_BAD_DATA";
}

/** Extrai todos os arquivos do RAR em memória como File[], usando a senha automática. */
export async function extractRarFiles(data: ArrayBuffer): Promise<File[]> {
  const wasmBinary = await loadWasm();
  const { createExtractorFromData } = await import("node-unrar-js/esm/index.esm.js");
  const senhas = senhasAutomaticas();
  let ultimoErro: unknown = null;
  for (const senha of senhas) {
    try {
      const extractor = await createExtractorFromData({ data, password: senha, wasmBinary });
      const list = extractor.getFileList();
      // Os geradores precisam ser percorridos até o fim (liberação de memória do WASM).
      const headers = Array.from(list.fileHeaders);
      void headers;
      const extracted = extractor.extract();
      const files: File[] = [];
      const entradas = Array.from(extracted.files);
      for (const entry of entradas) {
        if (!entry.fileHeader.flags.directory && entry.extraction) {
          files.push(new File([entry.extraction], entry.fileHeader.name));
        }
      }
      return files;
    } catch (reason) {
      ultimoErro = reason;
      if (!senhaPareceErrada(reason)) throw reason;
    }
  }
  throw ultimoErro ?? new Error(SENHA_DICA_ERRO);
}

const RAR_MENSAGENS: Record<string, string> = {
  ERAR_BAD_PASSWORD: SENHA_DICA_ERRO,
  ERAR_BAD_DATA: `${SENHA_DICA_ERRO} (também pode ser arquivo corrompido.)`,
  ERAR_MISSING_PASSWORD: SENHA_DICA_ERRO,
  ERAR_BAD_ARCHIVE: "O arquivo não é um RAR válido.",
  ERAR_UNKNOWN_FORMAT: "Formato de compactação não suportado.",
  ERAR_EOPEN: "Não foi possível abrir o arquivo.",
  ERAR_NO_MEMORY: "Arquivo grande demais para a memória disponível.",
};

export function rarErrorMessage(reason: unknown): string {
  const code = (reason as { reason?: string } | null)?.reason;
  if (code && RAR_MENSAGENS[code]) return RAR_MENSAGENS[code];
  if (reason instanceof Error && reason.message) return reason.message;
  return "Não foi possível ler o arquivo RAR.";
}
