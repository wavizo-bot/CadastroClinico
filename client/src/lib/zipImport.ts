// Leitura de arquivos .zip, com ou sem senha (@zip.js/zip.js).
// A senha é automática (ver senhaAutomatica.ts): tenta o mês atual e o mês
// anterior; zips sem criptografia abrem direto, com ou sem senha certa.
import { SENHA_DICA_ERRO, senhasAutomaticas } from "@/lib/senhaAutomatica";

type ZipModule = typeof import("@zip.js/zip.js");

let zipModule: ZipModule | null = null;

async function zipLib(): Promise<ZipModule> {
  if (!zipModule) {
    zipModule = await import("@zip.js/zip.js");
    zipModule.configure({ useWebWorkers: false });
  }
  return zipModule;
}

async function lerZip(zip: ZipModule, data: ArrayBuffer, senha: string): Promise<File[]> {
  const reader = new zip.ZipReader(new zip.BlobReader(new Blob([data])), { password: senha });
  try {
    const entradas = await reader.getEntries();
    const files: File[] = [];
    for (const entrada of entradas) {
      if (entrada.directory) continue;
      const bytes = await entrada.getData(new zip.Uint8ArrayWriter(), { password: senha });
      files.push(new File([bytes], entrada.filename));
    }
    return files;
  } finally {
    await reader.close();
  }
}

function senhaInvalidaZip(reason: unknown): boolean {
  const erro = reason as { name?: string; message?: string } | null;
  if (erro?.name === "ERR_INVALID_PASSWORD") return true;
  return /password|senha/i.test(erro?.message ?? "");
}

/** Extrai todos os arquivos do ZIP em memória como File[], com a senha automática. */
export async function extractZipFiles(data: ArrayBuffer): Promise<File[]> {
  const zip = await zipLib();
  let ultimoErro: unknown = null;
  for (const senha of senhasAutomaticas()) {
    try {
      return await lerZip(zip, data, senha);
    } catch (reason) {
      ultimoErro = reason;
      if (!senhaInvalidaZip(reason)) throw reason;
    }
  }
  throw ultimoErro ?? new Error(SENHA_DICA_ERRO);
}

export function zipErrorMessage(reason: unknown): string {
  const erro = reason as { name?: string; message?: string } | null;
  if (erro?.name === "ERR_INVALID_PASSWORD") return SENHA_DICA_ERRO;
  if (erro?.name === "ERR_INVALID_CRC32" || erro?.name === "ERR_INVALID_COMPRESSED_DATA") {
    return "O conteúdo do arquivo ZIP está corrompido.";
  }
  if (erro?.message) return erro.message;
  return "Não foi possível ler o arquivo ZIP.";
}
