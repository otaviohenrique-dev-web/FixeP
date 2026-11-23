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


def main():
    for rar in RARITIES:
        src = os.path.join(SRC, f"besta_{rar}_ref.jpg")
        im = Image.open(src).convert("RGBA")
        small = im.resize((SIZE, SIZE), Image.LANCZOS)
        dst = os.path.join(OUT, f"item_besta_{rar}.png")
        small.save(dst)
        print(f"ok: {dst}")


if __name__ == "__main__":
    main()
