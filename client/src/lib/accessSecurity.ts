// Senha de acesso opcional — decidida pelo usuário, 4 caracteres.
// Modelo do ACS Digital: quem quer proteger o app escolhe a senha quando quiser;
// sem senha escolhida, o aplicativo abre direto (sem tela de bloqueio).
export const ACCESS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";

/** Regra do ACS Digital: exatamente 4 caracteres — letras maiúsculas e números de 1 a 9. */
export function isValidAccessPassword(value: string) {
  return /^[A-Z1-9]{4}$/.test(value.trim().toUpperCase());
}