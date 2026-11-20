"""Gera favicon e ícones do PWA a partir da ARTE OFICIAL do emblema (assets/source/favicon_oficial.jpg, 1024x1024,
fundo preto). Nada é redesenhado: só recorte, remoção do fundo e exportação nos tamanhos.

Uso:  python tools/gen_icons.py        (precisa de:  pip install pillow numpy)

Remoção do fundo: flood-fill a partir das bordas sobre os pixels quase pretos (os pretos do interior do emblema,
isolados do fundo, ficam intactos); a borda ganha alfa suave pela luminosidade e a cor é "des-premultiplicada" contra o
preto, o que tira o halo escuro de espadas e chamas.
Saída em packages/client/public/:
  favicon.svg (emblema completo, PNG embutido) · favicon.ico (16/32/48) · favicon-32.png   (estes dois: versão de apoio,
  só o escudo com F/P e chama, mais contraste/nitidez) · apple-touch-icon.png (180, fundo #05080d)
  icon-192.png · icon-512.png · icon-maskable-512.png (emblema dentro da zona segura, fundo #05080d)"""
import base64, io, os
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "assets", "source", "favicon_oficial.jpg")
OUT = os.path.join(HERE, "..", "packages", "client", "public")
NIGHT = (5, 8, 13, 255)


def cutout(im):
    """RGB (fundo preto) -> RGBA com o fundo removido por flood-fill das bordas."""
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    mx = a.max(axis=2)
    dark = Image.fromarray(((mx < 34) * 255).astype(np.uint8)).copy()
    W, H = dark.size
    for x in range(0, W, 8):                       # sementes em toda a borda
        for y in (0, H - 1):
            if dark.getpixel((x, y)) == 255: ImageDraw.floodfill(dark, (x, y), 128)
    for y in range(0, H, 8):
        for x in (0, W - 1):
            if dark.getpixel((x, y)) == 255: ImageDraw.floodfill(dark, (x, y), 128)
    bg = np.asarray(dark) == 128                   # fundo conectado às bordas
    band = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    alpha = np.where(bg, 0.0, 1.0)
    edge = band & ~bg                               # faixa de 2 px junto ao fundo: alfa pela luminosidade
    alpha[edge] = np.clip((mx[edge] - 30) / 60.0, 0.0, 1.0)
    al = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.where(edge[..., None], np.clip(a / al, 0, 255), a)  # tira o halo escuro
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def fit(im, box, size, margin=0.0, bg=None):
    """Recorta `box`, centraliza em quadrado `size` com margem igual nos 4 lados (fração) e fundo opcional."""
    im = im.crop(box)
    w, h = im.size
    s = size * (1 - 2 * margin) / max(w, h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    canvas.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return canvas


def tight(im):
    return im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()


def main():
    os.makedirs(OUT, exist_ok=True)
    full = cutout(Image.open(SRC))
    bb = tight(full)
    p = lambda n: os.path.join(OUT, n)
    fit(full, bb, 512, 0.04).save(p("icon-512.png"))
    fit(full, bb, 192, 0.04).save(p("icon-192.png"))
    fit(full, bb, 180, 0.07, NIGHT).save(p("apple-touch-icon.png"))
    fit(full, bb, 512, 0.17, NIGHT).save(p("icon-maskable-512.png"))  # tudo dentro de ~66%: seguro no recorte circular
    buf = io.BytesIO(); fit(full, bb, 256, 0.02).save(buf, "PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    open(p("favicon.svg"), "w", encoding="utf8").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">'
        f'<title>FrixeP</title><image width="256" height="256" href="data:image/png;base64,{b64}"/></svg>\n')

    # versão de apoio 16/32/48: só o escudo (F, P e chama) da MESMA arte, com mais contraste e nitidez
    sh = fit(full, (215, 175, 795, 835), 512, 0.02)

    def small(n):
        im = sh.resize((n * 4, n * 4), Image.LANCZOS)
        rgb = ImageEnhance.Contrast(im.convert("RGB")).enhance(1.25)
        rgb = ImageEnhance.Color(rgb).enhance(1.3)
        im = Image.merge("RGBA", (*rgb.split(), im.getchannel("A")))
        im = im.resize((n, n), Image.LANCZOS)
        return im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=140, threshold=0))

    small(32).save(p("favicon-32.png"))
    ico = [small(16), small(32), small(48)]
    ico[2].save(p("favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
    old = p("favicon-small.svg")
    if os.path.exists(old): os.remove(old)
    print("ícones gerados em", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
