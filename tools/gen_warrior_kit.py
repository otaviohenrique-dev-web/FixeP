"""
Gera o KIT DE ARTE PROVISÓRIO do Guerreiro nas duas variações de equipamento da referência
(assets/source/warrior_ref_2h.jpg): (A) espada de duas mãos e (B) espada de uma mão + escudo.

Saída (por variação):
  assets/characters/warrior_2h.png + warrior_2h.json   (arma de duas mãos)
  assets/characters/warrior_1h.png + warrior_1h.json   (espada de uma mão + escudo)

Formato: quadro 64x64, pivô nos pés (32, 52), PNG com transparência e JSON json-array no formato do Aseprite/Phaser,
com uma tag por animação+direção (ex.: walk_se). Direções: SE e NE; o jogo espelha SW e NW.

ATENÇÃO: é um PLACEHOLDER feito por código, para o pipeline de atlas já ter o formato certo. Não é a arte final.
O dev de arte redesenha à mão (ver docs/ARTE_GUERREIRO_KIT.md). Nenhum código do cliente carrega estes arquivos
ainda: o jogo continua usando assets/placeholder/warrior.* até que a integração seja feita.

Uso (na raiz do repositório):  python tools/gen_warrior_kit.py      (precisa de Python e Pillow)
"""
import json
import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "characters")
PREVIEW = os.environ.get("WARRIOR_PREVIEW")  # opcional: caminho de uma folha de conferência

F = 64
CX, FEET = 32, 52

# ---- paleta (ver docs/ARTE_GUERREIRO_KIT.md, seção 3)
OL = (14, 8, 16, 255)
STEEL_D = (74, 82, 96, 255)
STEEL = (132, 144, 158, 255)
STEEL_L = (196, 206, 216, 255)
CRIMSON_D = (90, 20, 38, 255)
CRIMSON = (151, 42, 69, 255)
CHAIN_D = (56, 52, 75, 255)
CHAIN = (79, 76, 103, 255)
CHAIN_L = (124, 120, 146, 255)
CAPE = (27, 19, 40, 255)
CAPE_L = (52, 40, 68, 255)
CALCA = (133, 122, 130, 255)
CALCA_D = (96, 88, 98, 255)
BANDAGE = (200, 192, 200, 255)
LEATHER = (91, 67, 48, 255)
LEATHER_D = (52, 38, 30, 255)
BOOT = (110, 74, 50, 255)
SKIN = (222, 160, 128, 255)
SKIN_D = (176, 116, 96, 255)
BLADE = (230, 236, 246, 255)
BLADE_D = (150, 162, 184, 255)
EMBER = (255, 140, 60, 255)

ANIMS = [("idle", 4, 167), ("walk", 6, 100), ("attack", 5, 83), ("skill", 5, 83),
         ("dodge", 3, 83), ("hit", 2, 83), ("death", 5, 125)]
DIRS = ["se", "ne"]  # 4 diagonais: SW e NW são espelhados pelo jogo

ATTACK_TH = [-2.4, -1.4, 0.2, 1.6, 2.2]   # 2 mãos: arco do golpe, de cima para baixo
SKILL_TH = [-2.7, -2.9, -2.9, -1.0, -0.5]  # 2 mãos: levanta sobre a cabeça e desce


def lerp(a, b, t):
    return a + (b - a) * t


def pose(variant, anim, i, n):
    """Parâmetros de uma pose, em pixels e radianos (0 rad = arma apontando para cima)."""
    t = i / n
    k = i / max(1, n - 1)
    p = dict(dy=0.0, lean=0.0, step=0.0, th=0.5 if variant == "2h" else 0.3, flash=False, glow=0, fall=0.0)
    if anim == "idle":
        p["dy"] = math.sin(2 * math.pi * t) * 1.0
        p["th"] += math.sin(2 * math.pi * t) * 0.05
    elif anim == "walk":
        p["dy"] = -abs(math.sin(2 * math.pi * t)) * 2.0
        p["step"] = math.sin(2 * math.pi * t) * 4.0
    elif anim == "attack":
        idx = min(i, len(ATTACK_TH) - 1)
        p["th"] = ATTACK_TH[idx]
        p["lean"] = 2.0 if i in (2, 3) else 0.0
        p["dy"] = 1.0 if i in (2, 3) else 0.0
    elif anim == "skill":
        idx = min(i, len(SKILL_TH) - 1)
        p["th"] = SKILL_TH[idx]
        p["glow"] = int(3 + k * 6)
        p["dy"] = -1.0
    elif anim == "dodge":
        p["lean"] = [-2.0, -6.0, -3.0][min(i, 2)]
        p["dy"] = 1.0
    elif anim == "hit":
        p["flash"] = i == 0
        p["lean"] = -2.0 if i == 0 else -1.0
    elif anim == "death":
        p["fall"] = min(90.0, 20.0 + i * 22.0)
    return p


def pts_line(d, a, b, col, w):
    d.line([a, b], fill=col, width=w)
    r = w / 2
    for x, y in (a, b):
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)


def tip_from(hilt, th, length, fx):
    """Ponta da lâmina: th = 0 aponta para cima; positivo gira para o lado da frente (fx)."""
    return (hilt[0] + math.sin(th) * length * fx, hilt[1] - math.cos(th) * length)


def draw_blade(d, hilt, th, length, fx, width=3):
    tip = tip_from(hilt, th, length, fx)
    # corpo da lâmina (duas faixas: sombra e luz) + ponta afiada
    nx, ny = -math.cos(th) * (width / 2), -math.sin(th) * (width / 2) * fx
    base1 = (hilt[0] + nx, hilt[1] + ny)
    base2 = (hilt[0] - nx, hilt[1] - ny)
    d.polygon([base1, base2, tip], fill=BLADE_D)
    d.line([hilt, tip], fill=BLADE, width=1)
    # guarda e punho
    gx, gy = -math.cos(th) * 3, -math.sin(th) * 3 * fx
    pts_line(d, (hilt[0] + gx, hilt[1] + gy), (hilt[0] - gx, hilt[1] - gy), STEEL_L, 2)
    grip_end = (hilt[0] - math.sin(th) * 3 * fx, hilt[1] + math.cos(th) * 3)
    pts_line(d, hilt, grip_end, LEATHER_D, 2)


def draw_char(variant, view, anim, i, n):
    img = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    p = pose(variant, anim, i, n)
    fx = 1 if view == "se" else -1
    back = view == "ne"
    cx = CX + p["lean"]
    dy = p["dy"]
    hip = FEET - 12 + dy
    top = hip - 15 + dy
    sh_y = top + 3
    head_y = top - 8

    # ---- 2 mãos: espada nas costas (só em repouso/andar/sofrer dano); em golpes ela vai para a frente
    two_h = variant == "2h"
    sheathed = two_h and back and anim in ("idle", "walk", "dodge", "hit", "death")
    if sheathed:
        hilt = (cx + 7, top - 2)
        tip = (cx - 9, hip + 12)
        pts_line(d, hilt, tip, BLADE_D, 3)
        d.line([hilt, tip], fill=BLADE, width=1)
        pts_line(d, (hilt[0] - 1, hilt[1] - 2), (hilt[0] + 2, hilt[1] + 2), LEATHER_D, 2)

    # ---- capa (atrás do corpo na frente; por cima do corpo nas costas)
    def cape():
        hem = FEET - 4 + dy
        sway = math.sin(p["step"] * 0.3) * 1.5
        pts = [(cx - 7, top + 1), (cx + 7, top + 1), (cx + 9 + sway, hem - 4), (cx + 5 + sway, hem),
               (cx + 2, hem - 3), (cx - 1, hem + 1), (cx - 4 + sway, hem - 3), (cx - 7 + sway, hem), (cx - 9, hem - 4)]
        d.polygon(pts, fill=CAPE)
        d.line([(cx - 3, top + 4), (cx - 4, hem - 6)], fill=CAPE_L, width=1)
        d.line([(cx + 3, top + 4), (cx + 4, hem - 7)], fill=CAPE_L, width=1)

    if not back:
        cape()

    # ---- pernas: calça cinza + bandagens + botas
    for s in (-1, 1):
        ax = cx + s * 4
        foot_x = cx + s * 4 + p["step"] * s
        knee = ((ax + foot_x) / 2, hip + 9)
        foot = (foot_x, FEET - 2 + dy)
        pts_line(d, (ax, hip), knee, CALCA, 5)
        pts_line(d, knee, foot, CALCA_D, 4)
        for yy in range(int(knee[1]) + 2, int(foot[1]) - 1, 3):
            t = (yy - knee[1]) / max(1, foot[1] - knee[1])
            xx = lerp(knee[0], foot[0], t)
            d.line([(xx - 2, yy), (xx + 2, yy - 1)], fill=BANDAGE, width=1)
        d.rectangle([foot[0] - 3, foot[1] - 2, foot[0] + 3, foot[1] + 2], fill=BOOT)

    # ---- tronco: cota de malha (xadrez) ou túnica escura nas costas, com cinto e faixa vermelha
    for yy in range(int(top + 2), int(hip) + 1):
        t = (yy - (top + 2)) / max(1, hip - top - 2)
        half = 7 - t * 1.0
        for xx in range(int(cx - half), int(cx + half) + 1):
            if back:
                col = CAPE_L if (xx + yy) % 3 == 0 else (CHAIN_D if (xx + yy) % 2 == 0 else CHAIN)
            else:
                col = CHAIN_L if (xx + yy) % 3 == 0 else (CHAIN_D if (xx + yy) % 2 == 0 else CHAIN)
            img.putpixel((xx, yy), col)
    d.line([(cx - 7, top + 2), (cx - 6, hip)], fill=STEEL_D, width=1)
    d.line([(cx + 7, top + 2), (cx + 6, hip)], fill=STEEL_D, width=1)
    d.rectangle([cx - 7, hip - 3, cx + 7, hip - 1], fill=LEATHER)  # cinto
    d.rectangle([cx - 1, hip - 3, cx + 1, hip - 1], fill=STEEL_L)  # fivela
    d.rectangle([cx + fx * 6 - 2, hip - 1, cx + fx * 6 + 2, hip + 3], fill=LEATHER_D)  # bolsa
    if not back:  # faixa vermelha pendurada na frente
        d.polygon([(cx - 4, hip - 1), (cx + 4, hip - 1), (cx + 5, hip + 9), (cx + 1, hip + 7), (cx - 3, hip + 10), (cx - 5, hip + 6)], fill=CRIMSON)
    else:  # faixa vermelha na cintura, vista de costas
        d.rectangle([cx - 6, hip - 5, cx + 6, hip - 4], fill=CRIMSON)
    if two_h and back and sheathed:  # tira de couro da bainha cruzando as costas
        d.line([(cx + 6, top + 1), (cx - 6, hip - 4)], fill=LEATHER, width=1)

    if back:
        cape()

    # ---- escudo (1 mão): preso ao braço de trás; de costas fica atrás do corpo
    one_h = variant == "1h"
    if one_h and back:
        sx, sy = cx - 9, top + 9
        d.ellipse([sx - 5, sy - 6, sx + 5, sy + 7], fill=STEEL, outline=STEEL_D)
        d.line([(sx, sy - 4), (sx, sy + 5)], fill=CRIMSON, width=2)

    # ---- cabeça: elmo de aço com crista vermelha
    hc = (cx, head_y)
    if not back:
        d.ellipse([hc[0] - 6, hc[1] - 6, hc[0] + 6, hc[1] + 6], fill=STEEL, outline=STEEL_D)
        d.rectangle([hc[0] - 4, hc[1] - 1, hc[0] + 4, hc[1] + 3], fill=SKIN)  # rosto sob a viseira
        d.line([(hc[0] - 4, hc[1] - 1), (hc[0] + 4, hc[1] - 1)], fill=STEEL_D, width=1)  # viseira
        d.line([(hc[0] - 3, hc[1] + 1), (hc[0] + 3, hc[1] + 1)], fill=SKIN_D, width=1)
        d.line([(hc[0] - 4, hc[1] - 3), (hc[0] - 4, hc[1] + 5)], fill=STEEL_L, width=1)
    else:
        d.ellipse([hc[0] - 6, hc[1] - 6, hc[0] + 6, hc[1] + 6], fill=STEEL_D, outline=STEEL_D)
        d.polygon([(hc[0] - 5, hc[1] + 2), (hc[0] + 5, hc[1] + 2), (hc[0] + 6, top + 4), (hc[0] - 6, top + 4)], fill=CAPE)  # capuz/gola
    # crista vermelha (no topo, em arco)
    d.polygon([(hc[0] - 3, hc[1] - 5), (hc[0] + 3, hc[1] - 5), (hc[0] + 2, hc[1] - 10), (hc[0] + 6, hc[1] - 12),
               (hc[0] + 1, hc[1] - 13), (hc[0] - 3, hc[1] - 11)], fill=CRIMSON)
    d.line([(hc[0] - 1, hc[1] - 11), (hc[0] + 3, hc[1] - 12)], fill=CRIMSON_D, width=1)

    # ---- braço de trás (com escudo, se 1 mão) e braço da frente (com arma)
    back_sh = (cx - fx * 7, sh_y)
    front_sh = (cx + fx * 7, sh_y)

    if two_h:
        hands = (cx + fx * 2, sh_y + 10)
        for sh in (back_sh, front_sh):
            pts_line(d, sh, (lerp(sh[0], hands[0], 0.6), lerp(sh[1], hands[1], 0.6) + 2), CHAIN, 4)
            pts_line(d, (lerp(sh[0], hands[0], 0.6), lerp(sh[1], hands[1], 0.6) + 2), hands, CHAIN_L, 3)
        d.ellipse([hands[0] - 2, hands[1] - 2, hands[0] + 2, hands[1] + 2], fill=SKIN)
        if not sheathed:
            draw_blade(d, hands, p["th"], 22, fx, width=3)
    else:  # 1 mão: espada na mão da frente, escudo no braço de trás
        ang_sw = p["th"] * 0.4
        hand_f = (front_sh[0] + fx * 8 * math.sin(ang_sw) * 0.3, front_sh[1] + 9)
        pts_line(d, front_sh, hand_f, CHAIN, 4)
        d.ellipse([hand_f[0] - 2, hand_f[1] - 2, hand_f[0] + 2, hand_f[1] + 2], fill=SKIN)
        draw_blade(d, hand_f, p["th"], 15, fx, width=2)
        if not back:  # escudo visto de frente, na frente do corpo
            sx, sy = cx - fx * 9, sh_y + 8
            d.ellipse([sx - 5, sy - 6, sx + 5, sy + 7], fill=STEEL, outline=STEEL_D)
            d.ellipse([sx - 2, sy - 2, sx + 2, sy + 2], fill=CRIMSON)
            pts_line(d, back_sh, (sx, sy - 2), CHAIN, 4)

    # ---- brilho de habilidade (brasa)
    if p["glow"]:
        g = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse([cx - 12, hip - 14, cx + 12, hip + 12], outline=(EMBER[0], EMBER[1], EMBER[2], min(255, p["glow"] * 14)), width=2)
        img = Image.alpha_composite(g, img)

    # ---- morte: tomba em torno dos pés
    if p["fall"]:
        img = img.rotate(-p["fall"], resample=Image.NEAREST, center=(CX, FEET))

    # ---- dano: clarão branco
    if p["flash"]:
        white = Image.new("RGBA", (F, F), (255, 255, 255, 0))
        alpha = img.split()[3]
        white.putalpha(alpha.point(lambda v: 150 if v else 0))
        img = Image.alpha_composite(img, white)

    # ---- contorno escuro ao redor da silhueta
    alpha = img.split()[3].point(lambda v: 255 if v > 0 else 0)
    outline = ImageChops.subtract(alpha.filter(ImageFilter.MaxFilter(3)), alpha)
    base = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    base.paste(OL, mask=outline)
    return Image.alpha_composite(base, img)


def build_atlas(variant):
    cols = max(a[1] + 1 for a in ANIMS)
    rows = len(ANIMS) * len(DIRS)
    sheet = Image.new("RGBA", (cols * F, rows * F), (0, 0, 0, 0))
    json_frames = []
    tags = []
    row = 0
    for anim, count, dur in ANIMS:
        for dr in DIRS:
            tag = f"{anim}_{dr}"
            start = len(json_frames)
            for i in range(count):
                img = draw_char(variant, dr, anim, i, count)
                x, y = i * F, row * F
                sheet.paste(img, (x, y))
                name = f"{tag}_{i:02d}"
                json_frames.append({
                    "filename": name,
                    "frame": {"x": x, "y": y, "w": F, "h": F},
                    "rotated": False, "trimmed": False,
                    "spriteSourceSize": {"x": 0, "y": 0, "w": F, "h": F},
                    "sourceSize": {"w": F, "h": F},
                    "duration": dur,
                })
            tags.append({"name": tag, "from": start, "to": len(json_frames) - 1, "direction": "forward"})
            row += 1
    meta = {
        "app": "tools/gen_warrior_kit.py (placeholder)",
        "version": "1.0",
        "image": f"warrior_{variant}.png",
        "format": "RGBA8888",
        "size": {"w": cols * F, "h": rows * F},
        "scale": "1",
        "frameTags": tags,
    }
    return sheet, {"frames": json_frames, "meta": meta}


def main():
    os.makedirs(OUT, exist_ok=True)
    for variant in ("2h", "1h"):
        sheet, atlas = build_atlas(variant)
        png = os.path.join(OUT, f"warrior_{variant}.png")
        js = os.path.join(OUT, f"warrior_{variant}.json")
        sheet.save(png)
        with open(js, "w", encoding="utf-8") as fh:
            json.dump(atlas, fh, ensure_ascii=False, indent=1)
        print(f"ok: {png} ({sheet.size[0]}x{sheet.size[1]}) e {js}")
        if PREVIEW:
            sheet.resize((sheet.size[0] * 2, sheet.size[1] * 2), Image.NEAREST).save(PREVIEW.replace(".png", f"_{variant}.png"))


if __name__ == "__main__":
    main()
