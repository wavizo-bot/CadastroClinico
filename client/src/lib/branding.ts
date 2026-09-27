// Imagens institucionais: são reduzidas no navegador e ficam incorporadas ao JSON, sem URL externa.
import type { EmbeddedImage } from "./dataStore";
import { MAX_BRANDING_IMAGE_BYTES } from "./dataStore";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_DIMENSION = 1600;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file); const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir a imagem.")); };
    image.src = url;
  });
}

function createBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível converter a imagem.")), "image/webp", quality));
}

/** Otimiza uma imagem enviada no administrativo para até 300 KB antes da exportação JSON. */
export async function createEmbeddedImage(file: File): Promise<EmbeddedImage> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("Escolha uma imagem PNG, JPG ou WebP.");
  const image = await loadImage(file);
  let scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A otimização de imagem não está disponível neste navegador.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await createBlob(canvas, Math.max(.56, .86 - attempt * .06));
    if (blob.size <= MAX_BRANDING_IMAGE_BYTES || attempt === 5) {
      if (blob.size > MAX_BRANDING_IMAGE_BYTES) throw new Error("A imagem ficou maior que 300 KB mesmo após a otimização. Escolha um arquivo menor.");
      return { mime: "image/webp", data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())), updatedAt: new Date().toISOString() };
    }
    scale *= .72;
  }
  throw new Error("Não foi possível otimizar a imagem.");
}

export function embeddedImageUrl(image?: EmbeddedImage | null) { return image ? `data:${image.mime};base64,${image.data}` : undefined; }
export function embeddedImageSize(image?: EmbeddedImage | null) { return image ? Math.ceil(image.data.length * .75 / 1024) : 0; }
