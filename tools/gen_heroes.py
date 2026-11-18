"""
Desenho dos 3 personagens jogáveis (Guerreiro, Arqueiro, Clérigo) para os corpos provisórios do FrixeP.

Dark fantasy em pixel art de 64x64: cada peça tem contorno escuro, luz vinda de cima à esquerda (realce) e sombra embaixo à direita,
paleta apagada (aço escuro, couro, cinza-cinza) com um acento de brasa laranja por personagem. Obra própria, gerada por código.
É usado por tools/gen_placeholder_bodies.py (que monta o atlas); a arte final do dev de arte, em assets/characters/, tem prioridade.
"""
import math

from PIL import Image, ImageChops, ImageDraw, ImageFilter

F = 64
CX, FEET = 32, 52
OL = (8, 6, 14, 255)  # contorno: quase preto, levemente arroxeado


def C(r, g, b):
    return (r, g, b, 255)


def tone(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (255,)


def tint(c, to, t):
    return tuple(int(c[i] * (1 - t) + to[i] * t) for i in range(3)) + (255,)


# ---- paletas (sombra, base, luz)
STEEL = (C(44, 50, 64), C(86, 96, 114), C(150, 162, 182))
STEEL_D = (C(28, 32, 42), C(52, 58, 72), C(96, 106, 124))
BLADE = (C(120, 130, 148), C(186, 198, 214), C(240, 246, 255))
CRIMSON = (C(70, 14, 20), C(124, 28, 32), C(176, 54, 44))
LEATHER = (C(36, 26, 22), C(72, 54, 40), C(118, 90, 62))
WOODC = (C(34, 24, 18), C(74, 52, 34), C(120, 86, 54))
GREEN = (C(18, 30, 28), C(40, 62, 52), C(74, 104, 82))
ASH = (C(96, 92, 90), C(168, 162, 150), C(226, 220, 204))
GOLDC = (C(92, 64, 22), C(176, 130, 52), C(240, 200, 110))
EMBER = (C(150, 40, 10), C(255, 118, 30), C(255, 216, 120))
SKIN = (C(120, 80, 62), C(190, 140, 108), C(226, 182, 146))
CHAR = (C(24, 24, 32), C(48, 48, 60), C(84, 84, 102))


class Canvas:
    def __init__(self):
        self.img = Image.new("RGBA", (F, F), (0, 0, 0, 0))

    def part(self, draw, pal, outline=True, hi=True, sh=True, hi_col=None, sh_col=None):
        """desenha uma peça: draw(d) pinta a máscara com fill=255; pal = (sombra, base, luz)"""
        m = Image.new("L", (F, F), 0)
        draw(ImageDraw.Draw(m))
        m = m.point(lambda v: 255 if v > 127 else 0)
        if outline:
            o = m.filter(ImageFilter.MaxFilter(3))
            self.img.paste(OL, mask=o)
        self.img.paste(pal[1], mask=m)
        if sh:
            sm = ImageChops.subtract(m, ImageChops.offset(m, -1, -1))  # borda de baixo/direita
            self.img.paste(sh_col or pal[0], mask=sm)
        if hi:
            hm = ImageChops.subtract(m, ImageChops.offset(m, 1, 1))  # borda de cima/esquerda
            self.img.paste(hi_col or pal[2], mask=hm)
        return m

    def px(self, x, y, col):
        if 0 <= int(x) < F and 0 <= int(y) < F:
            self.img.putpixel((int(x), int(y)), col)

    def line(self, a, b, col, w=1):
        ImageDraw.Draw(self.img).line([a, b], fill=col, width=w)

    def rect(self, x0, y0, x1, y1, col):
        ImageDraw.Draw(self.img).rectangle([x0, y0, x1, y1], fill=col)

    def ell(self, box, col):
        ImageDraw.Draw(self.img).ellipse(box, fill=col)


def tl(d, pts):
    d.polygon(pts, fill=255)


def thick(d, a, b, w):
    d.line([a, b], fill=255, width=w)
    r = w / 2.0
    for p in (a, b):
        d.ellipse([p[0] - r + 0.5, p[1] - r + 0.5, p[0] + r - 0.5, p[1] + r - 0.5], fill=255)


def pt(x0, y0, ang, length):
    return x0 + math.sin(ang) * length, y0 + math.cos(ang) * length


# ======================================================================== comuns
def legs(cv, cx, hip, by, p, thigh, boot, kind):
    for sgn in (-1, 1):
        sx = cx + sgn * 3 + sgn * p.step * 0.6
        lift = max(0.0, p.step * sgn) * 0.45
        top = (cx + sgn * 2.5, hip + by)
        knee = (cx + sgn * 3 + sgn * p.step * 0.3, (hip + FEET) / 2 + by * 0.5 - lift * 0.4)
        foot = (sx, FEET - 2 - lift)
        cv.part(lambda d, a=top, b=knee: thick(d, a, b, 5), thigh)
        cv.part(lambda d, a=knee, b=foot: thick(d, a, b, 4), boot)
        cv.part(lambda d, f=foot: d.rounded_rectangle([f[0] - 3, f[1] - 1, f[0] + 4, f[1] + 2], radius=1, fill=255), boot)


# ======================================================================== GUERREIRO
def warrior(cv, back, p, anim):
    fx = -1 if back else 1
    cx = CX + p.lean
    by = p.bob + p.crouch + p.sink
    hip = FEET - 12 + p.crouch
    top = hip - 15 + by
    sh_y = top + 3
    sway = math.sin(p.bob * 1.4 + p.step * 0.3) * 2 + p.lean * -0.4

    def cape():
        # capa esfarrapada (atrás do corpo); no ângulo de costas ela cobre tudo
        wob = sway
        hem = FEET - 4
        pts = [(cx - 7, top + 1), (cx + 7, top + 1), (cx + 9 + wob, hem - 4), (cx + 6 + wob, hem), (cx + 3 + wob, hem - 3),
               (cx + 0 + wob, hem + 1), (cx - 3 + wob, hem - 3), (cx - 6 + wob, hem), (cx - 9 + wob, hem - 4)]
        cv.part(lambda d: tl(d, pts), CRIMSON)
        cv.line((cx - 3, top + 4), (cx - 4 + wob * 0.5, hem - 6), CRIMSON[0])
        cv.line((cx + 3, top + 4), (cx + 4 + wob * 0.5, hem - 7), CRIMSON[0])

    if not back:
        cape()
    # escudo visto de costas
    if back:
        sx = cx - 9 * fx
        cv.part(lambda d: d.rounded_rectangle([sx - 5, hip - 22 + by, sx + 5, hip - 2 + by], radius=4, fill=255), WOODC)
        cv.line((sx - 3, hip - 18 + by), (sx - 3, hip - 6 + by), STEEL[1])

    legs(cv, cx, hip, by, p, CHAR, STEEL_D, "warrior")

    # braço de trás (escudo)
    off_a = p.off * -fx
    ox, oy = pt(cx - 7 * fx, top + 3, off_a, 9)
    cv.part(lambda d: thick(d, (cx - 7 * fx, top + 3), (ox, oy), 4), STEEL_D)
    if not back:
        # escudo de brasão escuro
        sx, sy = ox - 1 * fx, oy + 1
        cv.part(lambda d: tl(d, [(sx - 7, sy - 9), (sx + 7, sy - 9), (sx + 7, sy + 1), (sx, sy + 10), (sx - 7, sy + 1)]), WOODC)
        cv.part(lambda d: tl(d, [(sx - 6, sy - 8), (sx + 6, sy - 8), (sx + 6, sy), (sx, sy + 8), (sx - 6, sy)]), STEEL_D, outline=False, hi=False, sh=False)
        cv.part(lambda d: tl(d, [(sx - 3, sy - 5), (sx + 3, sy - 5), (sx + 3, sy - 1), (sx, sy + 3), (sx - 3, sy - 1)]), EMBER, outline=False)
        cv.px(sx, sy - 3, EMBER[2])

    # tronco: peitoral de aço escuro + tabardo carmesim
    tw = 7
    cv.part(lambda d: d.rounded_rectangle([cx - tw, top, cx + tw, hip + by + 1], radius=3, fill=255), STEEL)
    if not back:
        cv.part(lambda d: tl(d, [(cx - 3, top + 7), (cx + 3, top + 7), (cx + 4, hip + by + 7), (cx, hip + by + 9), (cx - 4, hip + by + 7)]), CRIMSON, hi=False)
        cv.line((cx, top + 2), (cx, top + 8), STEEL[2])  # nervura central
        cv.rect(cx - 5, top + 5, cx + 5, top + 5, STEEL[0])
    else:
        cv.line((cx, top + 2), (cx, hip + by - 2), STEEL[0])
    # cinto com fivela de brasa
    cv.rect(cx - tw, hip + by - 3, cx + tw, hip + by - 1, LEATHER[0])
    cv.rect(cx - 1, hip + by - 3, cx + 1, hip + by - 1, EMBER[1])
    # ombreiras (a de trás menor)
    for sgn, big in ((-1, 5), (1, 6)):
        px_ = cx + sgn * 8
        cv.part(lambda d, x=px_, b=big: d.ellipse([x - b, top - 2, x + b, top + b + 1], fill=255), STEEL)
        cv.px(px_ + sgn * 3, top - 3, STEEL[2]) if sgn == fx else None
    # espigão numa ombreira
    sp = cx + fx * 9
    cv.part(lambda d: tl(d, [(sp - 2, top - 1), (sp + 2, top - 1), (sp + fx * 1, top - 6)]), STEEL)

    # cabeça: elmo fechado com fenda de brasa, crina curta
    hy = top - 7
    cv.part(lambda d: d.ellipse([cx - 6, hy - 6, cx + 6, hy + 6], fill=255), STEEL)
    cv.part(lambda d: tl(d, [(cx - 6, hy + 1), (cx + 6, hy + 1), (cx + 5, hy + 7), (cx - 5, hy + 7)]), STEEL_D, hi=False)  # gorjal
    if not back:
        cv.rect(cx - 5, hy - 1, cx + 5, hy, OL)  # visor
        cv.rect(cx - 3, hy - 1, cx - 2, hy - 1, EMBER[2])
        cv.rect(cx + 2, hy - 1, cx + 3, hy - 1, EMBER[2])
        cv.px(cx, hy + 3, STEEL[0]); cv.px(cx, hy + 4, STEEL[0])
    else:
        cv.line((cx, hy - 5), (cx, hy + 3), STEEL[0])
    # crina (rabo de cavalo carmesim)
    cr = cx - fx * 5
    cv.part(lambda d: tl(d, [(cx - fx * 2, hy - 7), (cx + fx * 1, hy - 7), (cr - fx * 3 - sway * 0.4, hy + 3), (cr - fx * 1, hy + 4)]), CRIMSON)
    cv.part(lambda d: tl(d, [(cx - 3, hy - 8), (cx + 3, hy - 8), (cx, hy - 11)]), STEEL)  # cume

    # braço da frente + espada
    a = p.arm * fx
    shx, shy = cx + 7 * fx, top + 3
    hx, hy2 = pt(shx, shy, a, 9)
    cv.part(lambda d: thick(d, (shx, shy), (hx, hy2), 4), STEEL_D)
    wa = a * 0.6 + (-0.5 * fx if anim in ("idle", "walk", "hit", "dodge", "death") else 0)
    if anim == "attack":
        wa = a
    bx, by_ = pt(hx, hy2, wa, 17)
    cv.part(lambda d: thick(d, (hx, hy2), (bx, by_), 3), BLADE)
    cv.line((hx, hy2), (bx, by_), BLADE[2])  # fio
    # guarda e punho
    gx, gy = pt(hx, hy2, wa + math.pi / 2, 3)
    gx2, gy2 = pt(hx, hy2, wa - math.pi / 2, 3)
    cv.line((gx, gy), (gx2, gy2), GOLDC[1], 2)
    cv.ell([hx - 1.5, hy2 - 1.5, hx + 1.5, hy2 + 1.5], STEEL_D[2])
    if p.glow:
        cv.line((hx, hy2), (bx, by_), EMBER[2], 1)
        for k in range(3):
            cv.px(bx + (k - 1) * 3, by_ - 2 - k, EMBER[2])

    if back:
        cape()


# ======================================================================== ARQUEIRO
def archer(cv, back, p, anim):
    fx = -1 if back else 1
    cx = CX + p.lean
    by = p.bob + p.crouch + p.sink
    hip = FEET - 12 + p.crouch
    top = hip - 15 + by
    sh_y = top + 3
    sway = math.sin(p.bob * 1.4 + p.step * 0.3) * 2 + p.lean * -0.4

    # aljava nas costas, flechas com penas claras
    qx = cx - 5 * fx
    cv.part(lambda d: tl(d, [(qx - 3, top + 1), (qx + 3, top - 1), (qx + 5, hip - 3 + by), (qx - 1, hip - 1 + by)]), WOODC)
    for k in range(3):
        cv.line((qx - 1 + k * 2, top - 1 - (k % 2)), (qx - 1 + k * 2 + 0.5, top + 2), ASH[2])

    legs(cv, cx, hip, by, p, LEATHER, tone_pal(LEATHER, 0.8), "archer")
    # faixas nas botas
    for sgn in (-1, 1):
        cv.rect(cx + sgn * 3 + sgn * int(p.step * 0.6) - 2, FEET - 6, cx + sgn * 3 + sgn * int(p.step * 0.6) + 2, FEET - 6, LEATHER[2])

    # capa curta rasgada (atrás no sentido frente; cobre as costas)
    def cloak():
        wob = sway
        hem = hip + 8 + by
        pts = [(cx - 8, top), (cx + 8, top), (cx + 9 + wob, hem - 2), (cx + 6 + wob, hem + 2), (cx + 3 + wob, hem - 1), (cx + wob, hem + 3),
               (cx - 3 + wob, hem - 1), (cx - 6 + wob, hem + 2), (cx - 9 + wob, hem - 2)]
        cv.part(lambda d: tl(d, pts), GREEN)
        cv.line((cx - 2, top + 3), (cx - 3 + wob * 0.5, hem - 3), GREEN[0])
        cv.line((cx + 3, top + 3), (cx + 4 + wob * 0.5, hem - 4), GREEN[0])

    # braço de trás (segura o arco) — ângulo muda no ataque
    oa = p.off * -fx
    ox, oy = pt(cx - 7 * fx, top + 3, oa - 0.9 * fx, 9)
    if anim in ("attack", "skill"):
        ox, oy = cx - 7 * fx + fx * -1 * 6, top + 4
    cv.part(lambda d: thick(d, (cx - 7 * fx, top + 3), (ox, oy), 4), LEATHER)

    # tronco: gibão de couro com tiras cruzadas
    cv.part(lambda d: d.rounded_rectangle([cx - 6, top, cx + 6, hip + by + 1], radius=3, fill=255), LEATHER)
    if not back:
        cv.line((cx - 5, top + 2), (cx + 5, hip + by - 2), LEATHER[0], 2)
        cv.line((cx + 5, top + 2), (cx - 5, hip + by - 2), LEATHER[0], 1)
        cv.rect(cx - 5, hip + by - 3, cx + 5, hip + by - 2, LEATHER[0])
        cv.rect(cx - 1, hip + by - 4, cx + 1, hip + by - 1, GOLDC[1])  # bolsa/fivela
        cv.rect(cx - 6, top, cx - 6, top + 2, GREEN[2])
    if back:
        cloak()
    else:
        # mantelete verde nos ombros
        cv.part(lambda d: tl(d, [(cx - 8, top - 1), (cx + 8, top - 1), (cx + 9, top + 5), (cx - 9, top + 5)]), GREEN)
        cv.line((cx - 8, top + 4), (cx + 8, top + 4), GREEN[0])

    # cabeça: capuz fundo, rosto na sombra, máscara de pano, olhos pálidos
    hy = top - 6
    cv.part(lambda d: d.ellipse([cx - 7, hy - 7, cx + 7, hy + 6], fill=255), GREEN)
    cv.part(lambda d: tl(d, [(cx - 7, hy), (cx + 7, hy), (cx + 8, hy + 9), (cx, hy + 11), (cx - 8, hy + 9)]), GREEN, hi=False)  # gola do capuz
    # ponta do capuz caída
    cv.part(lambda d: tl(d, [(cx - fx * 3, hy - 7), (cx + fx * 2, hy - 7), (cx - fx * 8 - sway * 0.3, hy + 2)]), GREEN)
    if not back:
        cv.part(lambda d: d.ellipse([cx - 4, hy - 4, cx + 5, hy + 4], fill=255), (C(8, 8, 12), C(14, 14, 20), C(14, 14, 20)), outline=False, hi=False, sh=False)
        cv.rect(cx - 3, hy - 1, cx - 2, hy, C(190, 238, 210))
        cv.rect(cx + 2, hy - 1, cx + 3, hy, C(190, 238, 210))
        cv.rect(cx - 3, hy + 2, cx + 3, hy + 3, CHAR[1])  # máscara
    else:
        cv.line((cx, hy - 6), (cx, hy + 2), GREEN[0])

    # braço da frente puxando a corda
    a = p.arm * fx
    shx, shy = cx + 7 * fx, top + 3
    hx, hy2 = pt(shx, shy, a * 0.5, 9)
    if anim in ("attack", "skill"):
        hx, hy2 = cx + 7 * fx - fx * 4, top + 4  # mão junto ao rosto, corda esticada
    cv.part(lambda d: thick(d, (shx, shy), (hx, hy2), 4), LEATHER)
    cv.rect(hx - 1, hy2 - 1, hx + 1, hy2 + 1, SKIN[1])

    # arco longo de osso e madeira escura (na mão de trás)
    bx, by2 = ox, oy
    span = 16
    bow = [(bx + fx * 4 - (k * 0.0), by2 - span + (k * 2 * span / 8.0)) for k in range(9)]
    # arco curvo: pontos numa parábola
    pts = []
    for k in range(9):
        t = k / 8.0 * 2 - 1
        pts.append((bx + fx * (3 - 5 * t * t), by2 + t * span))
    cv.part(lambda d: d.line(pts, fill=255, width=3), WOODC)
    cv.line(pts[0], pts[-1], ASH[2])  # corda
    cv.px(pts[0][0], pts[0][1] - 1, ASH[2]); cv.px(pts[-1][0], pts[-1][1] + 1, ASH[2])
    if anim in ("attack", "skill"):
        # flecha encaixada
        cv.line((hx, hy2), (bx + fx * 12, by2), ASH[2])
        cv.px(bx + fx * 13, by2, STEEL[2]); cv.px(bx + fx * 12, by2 - 1, STEEL[2]); cv.px(bx + fx * 12, by2 + 1, STEEL[2])
    if p.glow:
        for k in range(4):
            cv.px(bx + fx * (4 + k * 3), by2 - 1 + (k % 2), EMBER[2])


def tone_pal(pal, k):
    return tuple(tone(c, k) for c in pal)


# ======================================================================== CLÉRIGO
def cleric(cv, back, p, anim):
    fx = -1 if back else 1
    cx = CX + p.lean
    by = p.bob + p.crouch + p.sink
    hip = FEET - 12 + p.crouch
    top = hip - 15 + by
    sway = math.sin(p.bob * 1.4 + p.step * 0.3) * 1.5 + p.lean * -0.3

    # cajado: haste escura com coroa de ferro e brasa viva
    a = p.arm * fx
    shx, shy = cx + 7 * fx, top + 3
    hx, hy2 = pt(shx, shy, a * 0.5 + 0.7 * fx, 10)  # a mão afasta o cajado do rosto
    cv.part(lambda d: thick(d, (hx, hy2 + 15), (hx, hy2 - 19), 3), WOODC)
    gx, gy = hx, hy2 - 21
    r = 3 + int(p.glow * 0.45)
    if p.glow or True:
        # brilho suave (anel de luz)
        halo = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        ImageDraw.Draw(halo).ellipse([gx - r - 3, gy - r - 3, gx + r + 3, gy + r + 3], fill=(255, 140, 40, 70 + p.glow * 8))
        cv.img.alpha_composite(halo)
    cv.part(lambda d: tl(d, [(gx - 4, gy + 4), (gx - 3, gy - 1), (gx - 5, gy - 4), (gx - 2, gy - 2), (gx, gy - 5), (gx + 2, gy - 2), (gx + 5, gy - 4), (gx + 3, gy - 1), (gx + 4, gy + 4)]), STEEL_D, hi=False)  # coroa de ferro
    cv.part(lambda d: d.ellipse([gx - r, gy - r, gx + r, gy + r], fill=255), EMBER, hi_col=EMBER[2])
    cv.px(gx - 1, gy - 1, C(255, 244, 200))

    # barra da túnica (longa, esfarrapada) + pernas escondidas
    hem = FEET - 2
    wob = sway
    robe = [(cx - 7, top + 6), (cx + 7, top + 6), (cx + 11 + wob, hem - 3), (cx + 8 + wob, hem + 1), (cx + 4 + wob, hem - 2), (cx + wob, hem + 1),
            (cx - 4 + wob, hem - 2), (cx - 8 + wob, hem + 1), (cx - 11 + wob, hem - 3)]
    cv.part(lambda d: tl(d, robe), ASH)
    # pregas
    cv.line((cx - 3, top + 10), (cx - 5 + wob * 0.5, hem - 3), ASH[0])
    cv.line((cx + 3, top + 10), (cx + 5 + wob * 0.5, hem - 3), ASH[0])
    cv.line((cx, top + 12), (cx + wob * 0.5, hem - 2), ASH[0])
    # barra dourada escura
    cv.line((cx - 10 + wob, hem - 2), (cx + 10 + wob, hem - 2), GOLDC[0], 1)
    cv.line((cx - 10 + wob, hem - 3), (cx + 10 + wob, hem - 3), GOLDC[1], 1)
    # pés
    for sgn in (-1, 1):
        sx = cx + sgn * 3 + sgn * p.step * 0.5
        cv.rect(sx - 2, FEET - 1 - max(0.0, p.step * sgn) * 0.4, sx + 2, FEET + 1 - max(0.0, p.step * sgn) * 0.4, OL)

    # braço de trás (livre; no skill ergue)
    oa = p.off * -fx
    ox, oy = pt(cx - 7 * fx, top + 3, oa, 9)
    cv.part(lambda d: thick(d, (cx - 7 * fx, top + 3), (ox, oy), 4), ASH)

    # tronco: manto de carvão sobre os ombros, estola dourada
    cv.part(lambda d: d.rounded_rectangle([cx - 6, top, cx + 6, top + 12], radius=3, fill=255), ASH)
    if not back:
        cv.rect(cx - 1, top + 1, cx + 1, top + 13, GOLDC[1])  # estola
        cv.rect(cx - 1, top + 13, cx + 1, top + 14, GOLDC[0])
        cv.rect(cx - 5, top + 9, cx + 5, top + 9, GOLDC[0])  # cinto de contas
        for k in range(-4, 5, 2):
            cv.px(cx + k, top + 10, GOLDC[2])
    cv.part(lambda d: tl(d, [(cx - 9, top - 1), (cx + 9, top - 1), (cx + 10, top + 6), (cx + 6, top + 7), (cx - 6, top + 7), (cx - 10, top + 6)]), CHAR)
    cv.line((cx - 8, top + 5), (cx + 8, top + 5), CHAR[0])
    if back:
        cv.line((cx, top), (cx, top + 12), ASH[0])

    # cabeça: capuz, máscara de osso com olhos de brasa
    hy = top - 6
    cv.part(lambda d: d.ellipse([cx - 7, hy - 7, cx + 7, hy + 6], fill=255), CHAR)
    cv.part(lambda d: tl(d, [(cx - fx * 3, hy - 7), (cx + fx * 2, hy - 7), (cx - fx * 7 - sway * 0.3, hy + 4)]), CHAR)
    if not back:
        cv.part(lambda d: d.ellipse([cx - 4, hy - 4, cx + 5, hy + 5], fill=255), ASH, hi=False)  # máscara de osso
        cv.rect(cx - 3, hy - 1, cx - 2, hy + 1, EMBER[1])
        cv.rect(cx + 2, hy - 1, cx + 3, hy + 1, EMBER[1])
        cv.px(cx - 3, hy - 1, EMBER[2]); cv.px(cx + 2, hy - 1, EMBER[2])
        cv.line((cx, hy + 2), (cx, hy + 4), ASH[0])
    else:
        cv.line((cx, hy - 6), (cx, hy + 3), CHAR[0])

    # mão da frente no cajado
    cv.part(lambda d: thick(d, (shx, shy), (hx, hy2), 4), ASH)
    cv.rect(hx - 1, hy2 - 1, hx + 1, hy2 + 1, SKIN[1])
    if p.glow:
        for k in range(5):
            ang = k * 1.256 + p.glow * 0.2
            cv.px(gx + math.cos(ang) * (r + 5), gy + math.sin(ang) * (r + 5), EMBER[2])


HEROES = {"warrior": warrior, "archer": archer, "cleric": cleric}


def draw_hero(kind, direction, anim, pose, i, n):
    cv = Canvas()
    HEROES[kind](cv, direction == "ne", pose, anim)
    img = cv.img
    if pose.fall:
        side = -1 if direction != "ne" else 1
        img = img.rotate(side * pose.fall, center=(CX, FEET), resample=Image.NEAREST)
        moved = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        moved.alpha_composite(img, (int(side * 20 * (pose.fall / 90)), 0))
        img = moved
    if pose.white:
        wh = Image.new("RGBA", (F, F), (255, 255, 255, int(255 * pose.white)))
        img = Image.composite(Image.alpha_composite(img, wh), img, img.split()[3])
    return img
