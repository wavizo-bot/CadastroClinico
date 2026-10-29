// Senha de descompactação derivada da data do dispositivo — nunca é pedida nem mostrada ao usuário.
// Regra: prefixo + MMAAAA (mês com 2 dígitos + ano com 4) da data atual.
// Ex.: em 10/2026 a senha é "<prefixo>102026".
// O mês anterior também é testado, cobrindo arquivos baixados na virada do mês.
//
// O prefixo fica guardado codificado (XOR) para não aparecer em busca de
// string simples no bundle — ver scripts/obfuscate-build.mjs para o restante
// da ofuscação. Os dois arrays abaixo devem permanecer sincronizados.
const PREFIXO_CODIFICADO = [35, 42, 91, 11, 92, 1, 81, 91, 86];
const CHAVE_XOR = [99, 108, 105, 110, 105, 99, 97, 50, 48];

function prefixo(): string {
  return String.fromCharCode(...PREFIXO_CODIFICADO.map((byte, i) => byte ^ CHAVE_XOR[i]));
}

function sufixo(data: Date): string {
  return `${String(data.getMonth() + 1).padStart(2, "0")}${data.getFullYear()}`;
}

export function senhasAutomaticas(hoje: Date = new Date()): string[] {
  const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return [prefixo() + sufixo(hoje), prefixo() + sufixo(mesAnterior)];
}

export const SENHA_DICA_ERRO =
  "A senha automática não abriu o arquivo. Confira se a data do dispositivo está correta e se o arquivo é do mês atual (ou do mês anterior).";
