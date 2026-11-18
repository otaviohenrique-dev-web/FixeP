"""Gera os icones das moedas do FrixeP (pixel art, 48x48) por codigo. Mesmo estilo de gen_item_icons.py.

  item_coin_iron.png  Tostoes de Ferro: disco de ferro escuro e fosco, com marca gasta
  item_coin_obol.png  Obolos de Sangue: moeda antiga de bronze escuro com runa vermelha brilhante
  item_coin_bag.png   sacola de tostoes (o que cai no chao)

Saida: assets/items/.  Precisa de Pillow.  Uso: python tools/gen_coin_icons.py
"""
from pathlib import Path

from gen_item_icons import Icon, C, OUT


def iron():
    i = Icon()
    # borda grossa de ferro (sombra por baixo), face fosca, marca em cruz gasta
    i.ellipse([3, 3, 21, 21], C("#2b2f38"))
    i.ellipse([3, 3, 21, 20], C("#454b57"))
    i.ellipse([4, 4, 20, 19], C("#5d6471"))
    i.ellipse([6, 6, 18, 17], C("#4a505c"))
    i.ellipse([7, 7, 17, 16], C("#555c69"))
    for x, y in ((11, 8), (12, 8), (11, 15), (12, 15)):
        i.dot(x, y, C("#2f343e"))
    i.rect(8, 11, 15, 12, C("#2f343e"))
    i.rect(11, 8, 12, 15, C("#2f343e"))
    i.dot(10, 10, C("#7b8290"))  # reflexo fosco
    i.dot(9, 11, C("#6b7280"))
    i.dot(5, 8, C("#7b8290"))
    i.dot(6, 6, C("#7b8290"))
    return i.finish()


def obol():
    i = Icon()
    i.ellipse([3, 3, 21, 21], C("#2a1b12"))
    i.ellipse([3, 3, 21, 20], C("#5b3b22"))
    i.ellipse([4, 4, 20, 19], C("#7a5230"))
    i.ellipse([6, 6, 18, 17], C("#241812"))  # face escura (a runa se destaca)
    # runa vermelha: haste, ramos e brilho
    red, hot, glow = C("#e0261c"), C("#ff9a82"), C("#a3150f")
    for y in range(7, 17):
        i.dot(11, y, red)
        i.dot(12, y, red)
    i.line((8, 9), (11, 12), red, 1)
    i.line((15, 9), (12, 12), red, 1)
    i.line((9, 15), (11, 13), red, 1)
    i.line((14, 15), (12, 13), red, 1)
    for y in range(9, 15):
        i.dot(11, y, hot)
    i.dot(12, 11, hot)
    for p in ((10, 7), (13, 7), (7, 12), (16, 12), (10, 17), (13, 17)):
        i.dot(p[0], p[1], glow)
    i.dot(6, 6, C("#b98a58"))
    i.dot(5, 8, C("#b98a58"))
    return i.finish()


def bag():
    i = Icon()
    brown = [C("#3d2a1a"), C("#6b4a2c"), C("#97703f")]
    # corpo da sacola
    i.ellipse([4, 8, 20, 22], brown[0])
    i.ellipse([4, 8, 20, 21], brown[1])
    i.ellipse([6, 9, 17, 18], brown[2])
    # pescoco e amarracao
    i.poly([(8, 9), (16, 9), (15, 5), (9, 5)], brown[1])
    i.rect(8, 8, 15, 9, C("#c7b27a"))
    i.poly([(9, 5), (7, 3), (9, 4)], brown[2])
    i.poly([(15, 5), (17, 3), (15, 4)], brown[2])
    # moedas de ferro aparecendo no alto e um brilho
    i.ellipse([9, 3, 15, 6], C("#5d6471"))
    i.rect(10, 4, 13, 4, C("#7b8290"))
    i.rect(10, 13, 13, 17, C("#2b2f38"))  # marca de moeda na sacola
    i.dot(11, 15, C("#8a909c"))
    i.dot(8, 12, C("#c2a06a"))
    return i.finish()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    made = {"coin_iron": iron, "coin_obol": obol, "coin_bag": bag}
    for name, make in made.items():
        make().save(OUT / f"item_{name}.png")
    print(f"{len(made)} icones de moeda em {OUT}")


if __name__ == "__main__":
    main()
