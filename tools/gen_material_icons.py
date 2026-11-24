"""Gera os icones dos materiais de craft (pixel art, 48x48) por codigo. Mesmo estilo de gen_coin_icons.py.

  item_mat_ferro_bruto.png     Ferro Bruto: pedra de minerio cinza-ferro com veios de ferrugem
  item_mat_couro_curtido.png   Couro Curtido: rolo de couro marrom com costura e tira de amarrar
  item_mat_essencia_arcana.png Essencia Arcana: frasco de vidro com essencia roxa brilhante

Saida: assets/items/ (so cria estes tres arquivos; os outros icones nao sao tocados).
Precisa de Pillow.  Uso (na raiz do repositorio): python tools/gen_material_icons.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_item_icons import Icon, C, OUT  # noqa: E402


def ferro_bruto():
    i = Icon()
    # bloco irregular de minerio: contorno escuro, face cinza-ferro, lascas claras
    i.poly([(8, 14), (14, 7), (24, 6), (34, 9), (40, 16), (39, 28), (34, 37), (22, 40), (11, 36), (7, 26)], C("#2b2f38"))
    i.poly([(9, 14), (15, 8), (24, 7), (33, 10), (38, 16), (37, 27), (33, 35), (22, 38), (12, 34), (8, 26)], C("#5d6471"))
    i.poly([(12, 13), (18, 9), (26, 9), (31, 13), (28, 19), (17, 20)], C("#7b8290"))  # lasca clara no topo
    i.poly([(18, 24), (27, 22), (33, 27), (30, 33), (20, 34), (15, 29)], C("#4a505c"))  # sombra da face
    for x, y in ((20, 27), (21, 28), (25, 29), (26, 28), (22, 31)):  # veio de ferrugem
        i.dot(x, y, C("#b5562a"))
    i.dot(19, 12, C("#c8cdd6"))
    i.dot(23, 10, C("#c8cdd6"))
    return i.finish()


def couro_curtido():
    i = Icon()
    # rolo de couro: corpo marrom, extremidades curvadas e costura
    i.rect(8, 12, 36, 34, C("#3d2a1a"))
    i.rect(9, 13, 35, 33, C("#7a5230"))
    i.ellipse([30, 10, 42, 38], C("#3d2a1a"))
    i.ellipse([31, 11, 41, 37], C("#97703f"))
    i.ellipse([34, 17, 38, 31], C("#5b3b22"))  # miolo do rolo
    for y in range(15, 33, 4):  # costura / fios do couro
        i.dot(14, y, C("#5b3b22"))
        i.dot(20, y + 2, C("#5b3b22"))
        i.dot(26, y, C("#5b3b22"))
    i.rect(12, 22, 33, 23, C("#a8794a"))  # tira de amarrar
    i.dot(13, 21, C("#c9965f"))
    i.dot(15, 19, C("#b98a58"))
    return i.finish()


def essencia_arcana():
    i = Icon()
    # frasco: gargalo, rolha e corpo de vidro com essencia roxa brilhante
    i.rect(19, 6, 28, 11, C("#4a3320"))  # rolha
    i.rect(20, 11, 27, 15, C("#3b4a5c"))  # gargalo
    i.ellipse([9, 16, 38, 42], C("#24303f"))  # corpo (contorno)
    i.ellipse([10, 17, 37, 41], C("#3b4a5c"))
    i.ellipse([11, 22, 36, 40], C("#5a2a8a"))  # essencia
    i.ellipse([14, 27, 33, 39], C("#7a3fb8"))
    i.ellipse([15, 29, 26, 35], C("#a86ef0"))  # brilho
    i.dot(13, 26, C("#e3c8ff"))
    i.dot(31, 25, C("#c79bff"))
    i.dot(22, 20, C("#c79bff"))
    return i.finish()


ICONS = {
    "mat_ferro_bruto": ferro_bruto,
    "mat_couro_curtido": couro_curtido,
    "mat_essencia_arcana": essencia_arcana,
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in ICONS.items():
        make().save(OUT / f"item_{name}.png")
    print(f"{len(ICONS)} icones de material em {OUT}")


if __name__ == "__main__":
    main()
