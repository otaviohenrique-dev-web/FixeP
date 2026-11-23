"""
Converte os desenhos da BESTA (arqueiro) em ícones de item 48 x 48 para as raridades com equipamento do jogo.

Entrada: assets/source/besta/besta_<raridade>_ref.jpg (arte aprovada pelo dev, 1024 x 1024, moldura na cor da raridade).
Saída:   assets/items/item_besta_<raridade>.png (48 x 48 RGBA), que é o nome que o cliente espera (`item_<id>.png`).

Só as raridades de RARITIES (common ... mythic) entram; junk e ancestral ficam em assets/source/besta/ para uso futuro.
Uso (na raiz do repositório):  python tools/gen_besta_icons.py      (precisa de Pillow)
"""
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SRC = os.path.join(ROOT, "assets", "source", "besta")
OUT = os.path.join(ROOT, "assets", "items")
RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"]
SIZE = 48
# area interna de cada arte (sem a moldura colorida) e limiar do fundo escuro (brilhos fortes pedem limiar maior)
CROP = {
    "common": ((110, 110, 914, 914), 34),
    "uncommon": ((110, 110, 914, 914), 34),
    "rare": ((110, 110, 914, 914), 34),
    "epic": ((170, 160, 860, 870), 70),
    "legendary": ((100, 100, 940, 920), 80),
    "mythic": ((160, 160, 870, 850), 50),
}


def main():
    for rar in RARITIES:
        src = os.path.join(SRC, f"besta_{rar}_ref.jpg")
        im = Image.open(src).convert("RGBA")
        # corta a moldura colorida da arte (o jogo ja desenha a propria borda por raridade)
        caixa, limiar = CROP[rar]
        im = im.crop(caixa)
        # fundo escuro vira transparente (chave por luminosidade, com rampa suave nas bordas)
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, _ = px[x, y]
                lum = max(r, g, b)
                a = 0 if lum < limiar else min(255, (lum - limiar) * 12)
                px[x, y] = (r, g, b, a)
        box = im.getbbox()
        if box:
            im = im.crop(box)
        w, h = im.size
        esc = (SIZE - 4) / max(w, h)
        im = im.resize((max(1, round(w * esc)), max(1, round(h * esc))), Image.LANCZOS)
        small = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        small.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
        dst = os.path.join(OUT, f"item_besta_{rar}.png")
        small.save(dst)
        print(f"ok: {dst}")


if __name__ == "__main__":
    main()
