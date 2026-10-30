#!/usr/bin/env python3
"""Gera todos os icones do Cadastro Clinico a partir de icon.png.

Fonte unica: icon.png (1080x1080, RGBA). icon.jpg e a mesma arte em JPEG e
fica apenas como referencia; o PNG e o master por preservar alfa e qualidade.

Saidas:
- Android: mipmaps legado/redondo, foreground adaptativo e splash.
- Windows/MSIX: ICO multirresolucao, logos do pacote/Store, splash e variantes
  de escala (100/125/150/200/400%).
- Web: favicon.ico, apple-touch-icon.png e tile 300x300 da listagem.

Uso: python scripts/build-icons.py
Requer Pillow. O script e idempotente e so escreve arquivos de icone.
"""

from __future__ import annotations

import io
import os
import struct
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "icon.png"

CREAM = (247, 243, 234, 255)
BLUE = (11, 58, 102, 255)
GRAY = (91, 107, 124, 255)
YELLOW = (242, 197, 0, 255)

ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
MSIX_ASSETS = ROOT / "msix" / "CadastroClinicoMSIX" / "Assets"
MSIX_LISTING = ROOT / "msix" / "listing"
CLIENT_PUBLIC = ROOT / "client" / "public"
DOCS = ROOT / "docs"


def load_source() -> Image.Image:
    if not SRC.exists():
        raise SystemExit(f"fonte nao encontrada: {SRC}")
    return Image.open(SRC).convert("RGBA")


def fit_square(image: Image.Image, size: int, scale: float = 1.0,
               background: tuple[int, int, int, int] = CREAM) -> Image.Image:
    """Centraliza a imagem num quadrado, com fundo solido."""
    canvas = Image.new("RGBA", (size, size), background)
    side = max(1, round(size * scale))
    resized = image.resize((side, side), Image.Resampling.LANCZOS)
    offset = (size - side) // 2
    canvas.alpha_composite(resized, (offset, offset))
    return canvas


def fit_transparent(image: Image.Image, size: int, scale: float = 1.0) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    side = max(1, round(size * scale))
    resized = image.resize((side, side), Image.Resampling.LANCZOS)
    offset = (size - side) // 2
    canvas.alpha_composite(resized, (offset, offset))
    return canvas


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def mask_image(image: Image.Image, mask: Image.Image) -> Image.Image:
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    out.paste(image, (0, 0), mask)
    return out


def remove_background(image: Image.Image) -> Image.Image:
    """Torna transparente o creme conectado as bordas do mark.

    O cartao original tem uma sombra suave em volta da casa. O flood fill
    remove essa sombra junto com o fundo e preserva as areas claras cercadas
    pelo contorno preto (rostos, janelas etc.).
    """
    rgb = image.convert("RGB")
    pixels = rgb.load()
    width, height = rgb.size

    def is_cream(pixel: tuple[int, int, int]) -> bool:
        return sum(abs(pixel[i] - CREAM[i]) for i in range(3)) < 70

    cream = [[is_cream(pixels[x, y]) for x in range(width)] for y in range(height)]
    visited = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        for y in (0, height - 1):
            if cream[y][x] and not visited[y][x]:
                visited[y][x] = True
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if cream[y][x] and not visited[y][x]:
                visited[y][x] = True
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and cream[ny][nx] and not visited[ny][nx]:
                visited[ny][nx] = True
                queue.append((nx, ny))

    alpha = Image.new("L", (width, height), 255)
    alpha_pixels = alpha.load()
    for y in range(height):
        for x in range(width):
            if visited[y][x]:
                alpha_pixels[x, y] = 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))

    out = image.copy()
    out.putalpha(alpha)
    return out


def build_masters(source: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Devolve (app, mark).

    app  = cartao completo (moldura preta, texto e margem de 4%) para icones
           quadrados, Store, splash e favicon grande.
    mark = casa + pessoas sem moldura e sem texto, com fundo transparente,
           para o adaptativo/redondo e tamanhos pequenos.
    """
    # A borda preta e o elemento mais escuro da arte; o bbox externo e a moldura.
    rgb = source.convert("RGB")
    dark = rgb.point(lambda value: 255 if value < 60 else 0).convert("L")
    bbox = dark.getbbox()
    if not bbox:
        raise SystemExit("nao foi possivel localizar a moldura preta em icon.png")
    left, top, right, bottom = bbox

    framed = source.crop((left, top, right, bottom))
    # O bbox pode variar 1 px entre largura/altura por causa do antialias;
    # completa o lado menor com o mesmo creme antes de aplicar a margem.
    side = max(framed.width, framed.height)
    if framed.size != (side, side):
        square = Image.new("RGBA", (side, side), CREAM)
        square.alpha_composite(framed, ((side - framed.width) // 2, (side - framed.height) // 2))
        framed = square
    margin = max(1, round(framed.width * 0.04))
    app = Image.new("RGBA", (framed.width + 2 * margin, framed.height + 2 * margin), CREAM)
    app.alpha_composite(framed, (margin, margin))

    # Recorte medido no master 1080x1080: a casa/pessoas ocupa y=189..658 e o
    # texto comeca em y=682. O quadrado de 700 px mantem a arte centralizada
    # na vertical, sem incluir texto nem moldura.
    mark_left = left + 77
    mark_right = right - 77
    mark_top = top + 47
    mark_bottom = top + 567
    mark_side = mark_right - mark_left
    mark = Image.new("RGBA", (mark_side, mark_side), CREAM)
    mark.alpha_composite(
        source.crop((mark_left, mark_top, mark_right, mark_bottom)),
        (0, (mark_side - (mark_bottom - mark_top)) // 2),
    )
    mark = remove_background(mark)

    return app, mark


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def make_ico(entries: list[tuple[int, Image.Image]], path: Path) -> None:
    """Grava ICO com entradas PNG (suportado pelo Windows 10/11)."""
    blobs: list[tuple[int, bytes]] = []
    for size, image in entries:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG", optimize=True)
        blobs.append((size, buffer.getvalue()))

    header = struct.pack("<HHH", 0, 1, len(blobs))
    offset = 6 + 16 * len(blobs)
    directory = bytearray()
    for size, blob in blobs:
        if size > 256:
            raise ValueError("ICO aceita no maximo 256 px")
        dimension = 0 if size == 256 else size
        directory += struct.pack(
            "<BBBBHHII",
            dimension, dimension, 0, 0, 1, 32, len(blob), offset,
        )
        offset += len(blob)

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        handle.write(header)
        handle.write(directory)
        for _, blob in blobs:
            handle.write(blob)


def ico_image(size: int, app: Image.Image, mark: Image.Image) -> Image.Image:
    """Ate 32 px usa o mark (sem texto/moldura); acima disso usa o cartao."""
    if size <= 32:
        return fit_square(mark, size, 0.94)
    return fit_square(app, size)


def render_round_icon(mark: Image.Image, size: int, scale: float = 0.96) -> Image.Image:
    """Circulo creme com o mark; 96% reproduz o enquadramento do adaptativo."""
    canvas = Image.new("RGBA", (size, size), CREAM)
    side = max(1, round(size * scale))
    canvas.alpha_composite(
        mark.resize((side, side), Image.Resampling.LANCZOS),
        ((size - side) // 2, (size - side) // 2),
    )
    return mask_image(canvas, circle_mask(size))


def font(path_name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    fonts = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    for name in (path_name, "segoeuib.ttf", "arialbd.ttf"):
        candidate = fonts / name
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def render_wide(width: int, height: int, app: Image.Image) -> Image.Image:
    """Tile largo 310x150 (ou variante) com o icone e o texto de apoio."""
    scale = width / 310.0
    canvas = Image.new("RGBA", (width, height), CREAM)
    icon_size = round(142 * scale)
    icon = fit_square(app, icon_size)
    canvas.alpha_composite(icon, (round(4 * scale), (height - icon_size) // 2))

    draw = ImageDraw.Draw(canvas)
    accent_x = round(156 * scale)
    draw.rectangle(
        (accent_x, round(36 * scale), accent_x + max(2, round(4 * scale)), round(114 * scale)),
        fill=YELLOW,
    )
    text_x = round(170 * scale)
    bold = font("segoeuib.ttf", max(10, round(25 * scale)))
    regular = font("segoeuireg.ttf", max(8, round(13 * scale)))
    draw.text((text_x, round(32 * scale)), "Fichas e", font=bold, fill=BLUE)
    draw.text((text_x, round(63 * scale)), "território", font=bold, fill=BLUE)
    draw.text((text_x, round(104 * scale)), "offline", font=regular, fill=GRAY)
    return canvas


def render_msix_splash(width: int, height: int, app: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), CREAM)
    icon_size = round(min(width, height) * 0.72)
    icon = fit_square(app, icon_size)
    canvas.alpha_composite(icon, ((width - icon_size) // 2, (height - icon_size) // 2))
    return canvas


def render_android_splash(width: int, height: int, app: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), CREAM)
    icon_size = round(min(width, height) * 0.38)
    icon = fit_square(app, icon_size)
    canvas.alpha_composite(icon, ((width - icon_size) // 2, (height - icon_size) // 2))
    return canvas


def main() -> None:
    source = load_source()
    app, mark = build_masters(source)

    # ---------------- Android ----------------
    densities = {
        "mdpi": 1.0,
        "hdpi": 1.5,
        "xhdpi": 2.0,
        "xxhdpi": 3.0,
        "xxxhdpi": 4.0,
    }
    for density, factor in densities.items():
        folder = ANDROID_RES / f"mipmap-{density}"
        legacy = round(48 * factor)
        save_png(fit_square(app, legacy), folder / "ic_launcher.png")

        # Redondo legado: circulo creme com o mark em 96% (mesmo enquadramento
        # aparente do adaptativo, cuja area visivel e 72/108 do canvas).
        save_png(render_round_icon(mark, legacy), folder / "ic_launcher_round.png")

        # Foreground adaptativo: 108 dp, mark em 64% para caber na safe zone
        # de 66 dp. O fundo creme vem de @color/ic_launcher_background.
        foreground = round(108 * factor)
        save_png(
            fit_transparent(mark, foreground, 0.64),
            folder / "ic_launcher_foreground.png",
        )

    splash_sizes = {
        "drawable": (480, 320),
        "drawable-land-mdpi": (480, 320),
        "drawable-land-hdpi": (800, 480),
        "drawable-land-xhdpi": (1280, 720),
        "drawable-land-xxhdpi": (1600, 960),
        "drawable-land-xxxhdpi": (1920, 1280),
        "drawable-port-mdpi": (320, 480),
        "drawable-port-hdpi": (480, 800),
        "drawable-port-xhdpi": (720, 1280),
        "drawable-port-xxhdpi": (960, 1600),
        "drawable-port-xxxhdpi": (1280, 1920),
    }
    for folder, (width, height) in splash_sizes.items():
        save_png(
            render_android_splash(width, height, app),
            ANDROID_RES / folder / "splash.png",
        )

    # ---------------- Windows / MSIX ----------------
    ico_sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    make_ico([(size, ico_image(size, app, mark)) for size in ico_sizes], MSIX_ASSETS / "app-icon.ico")

    square_assets = {
        "StoreLogo": [50, 63, 75, 100, 200],
        "Square44x44Logo": [44, 55, 66, 88, 176],
        "Square150x150Logo": [150, 188, 225, 300, 600],
    }
    for name, sizes in square_assets.items():
        for index, size in enumerate(sizes):
            suffix = "" if index == 0 else f".scale-{[100, 125, 150, 200, 400][index]}"
            save_png(fit_square(app, size), MSIX_ASSETS / f"{name}{suffix}.png")

    wide_sizes = [(310, 150), (388, 188), (465, 225), (620, 300), (1240, 600)]
    for index, (width, height) in enumerate(wide_sizes):
        suffix = "" if index == 0 else f".scale-{[100, 125, 150, 200, 400][index]}"
        save_png(
            render_wide(width, height, app),
            MSIX_ASSETS / f"Wide310x150Logo{suffix}.png",
        )

    splash_sizes = [(620, 300), (775, 375), (930, 450), (1240, 600), (2480, 1200)]
    for index, (width, height) in enumerate(splash_sizes):
        suffix = "" if index == 0 else f".scale-{[100, 125, 150, 200, 400][index]}"
        save_png(
            render_msix_splash(width, height, app),
            MSIX_ASSETS / f"SplashScreen{suffix}.png",
        )

    save_png(fit_square(app, 300), MSIX_LISTING / "store-tile-300x300.png")

    # ---------------- Web ----------------
    favicon_sizes = [16, 24, 32, 48, 64, 128, 192, 256]
    favicon_entries = [(size, ico_image(size, app, mark)) for size in favicon_sizes]
    make_ico(favicon_entries, CLIENT_PUBLIC / "favicon.ico")
    make_ico(favicon_entries, DOCS / "favicon.ico")
    save_png(fit_square(app, 180), CLIENT_PUBLIC / "apple-touch-icon.png")
    save_png(fit_square(app, 180), DOCS / "apple-touch-icon.png")

    print("icones gerados a partir de", SRC)
    print("Android: mipmaps + foreground + splash")
    print("MSIX: ICO, logos, variantes de escala, splash e tile 300x300")
    print("Web: favicon.ico + apple-touch-icon.png")


if __name__ == "__main__":
    main()
