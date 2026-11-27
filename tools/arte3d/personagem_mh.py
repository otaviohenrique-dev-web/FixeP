"""FrixeP: personagem natural (MakeHuman/MPFB, CC0) para o paper-doll pré-renderizado.
Corpo contínuo que deforma com o esqueleto (game_engine), roupa de baixo, cabelo curto; Couraça e Espada como camadas.
Uso: blender -b -P personagem_mh.py -- --saida <pasta> [--anims idle,walk] [--dirs se,ne] [--salvar-blend]
Saída: <pasta>/<camada>/<anim>_<dir>_<NN>.png  (camadas: corpo | couraca | couraca_acento | espada | espada_acento)
"""
import bpy, sys, os, math, mathutils
from mathutils import Vector, Euler, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(n, p=None): return argv[argv.index(n) + 1] if n in argv else p
SAIDA = arg("--saida", os.path.join(os.path.dirname(os.path.abspath(__file__)), "render"))
ANIMS = arg("--anims", "idle,walk").split(",")
DIRS = arg("--dirs", "se,ne").split(",")

bpy.ops.wm.read_factory_settings(use_empty=True)
import addon_utils
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services import LocationService
cena = bpy.context.scene

COLECOES = {}
def colecao(nome):
    if nome not in COLECOES:
        c = bpy.data.collections.new(nome); cena.collection.children.link(c); COLECOES[nome] = c
    return COLECOES[nome]
def mover_para(o, nome):
    for c in list(o.users_collection): c.objects.unlink(o)
    colecao(nome).objects.link(o)

# ------------------------------------------------------------------ corpo (robusto, como a referência do Albion)
macro = TargetService.get_default_macro_info_dict()
macro.update({"gender": 1.0, "age": 0.45, "muscle": 0.9, "weight": 0.62, "proportions": 0.85, "height": 0.72})
corpo = HumanService.create_human(macro_detail_dict=macro)
rig = HumanService.add_builtin_rig(corpo, "game_engine")
# cabelo curto do pacote CC0
dados = LocationService.get_user_data()
cab = HumanService.add_mhclo_asset(os.path.join(dados, "hair", "short02", "short02.mhclo"), corpo, asset_type="Hair", subdiv_levels=0, material_type="MAKESKIN")

def mat(nome, cor, metal=0.0, rug=0.75):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*cor, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rug
    return m
PELE = mat("pele", (0.60, 0.39, 0.29))
CABELO = mat("cabelo", (0.13, 0.08, 0.05), rug=0.9)
ROUPA = mat("roupa_baixo", (0.07, 0.08, 0.12), rug=0.9)   # cinza-azulado escuro: não se confunde com a sombra da pele em 128 px
# SET COMUM DO GUERREIRO: cores do desenho do usuário (27/11/2026). Aço escuro quase preto com brilho cinza, capa
# vermelho-vinho com forro mais escuro, couro marrom (cabo, sola das botas), lâmina clara. Só o ACENTO fica de fora
# (laranja das referências: o jogo pinta com a cor da raridade). Valores em linear (o desenho em sRGB).
ACO = mat("aco", (0.13, 0.13, 0.14), 0.6, 0.33)        # placas: cinza-chumbo escuro (desenho ~#3c3c3e)
ACO_CLARO = mat("aco_claro", (0.21, 0.21, 0.22), 0.6, 0.30)   # ombreiras, aros, guarda: um tom acima
ACO_ESCURO = mat("aco_escuro", (0.05, 0.05, 0.055), 0.5, 0.55)  # manoplas, pomo: quase preto
TECIDO = mat("tecido", (0.24, 0.018, 0.024), rug=0.9)      # capa: vermelho-vinho (desenho ~#842c32)
TECIDO_ESC = mat("tecido_esc", (0.075, 0.010, 0.014), rug=0.95)   # forro da capa
FENDA = mat("fenda", (0.0, 0.0, 0.0), rug=1.0)
COURO = mat("couro", (0.17, 0.075, 0.035))                 # cabo da espada, alças do escudo (desenho ~#7b4c35)
COURO_BOTA = mat("couro_bota", (0.050, 0.025, 0.014), rug=0.8)   # pé das botas: couro marrom escuro
LAMINA = mat("lamina", (0.46, 0.45, 0.44), 0.75, 0.26)     # lâmina clara (desenho ~#b5b3b2)
ACENTO = mat("acento", (0.75, 0.75, 0.75), 0.4, 0.45)

corpo.data.materials.clear(); corpo.data.materials.append(PELE)
cab.data.materials.clear(); cab.data.materials.append(CABELO)
for p in corpo.data.polygons: p.use_smooth = True
ALTURA = max((corpo.matrix_world @ v.co).z for v in corpo.data.vertices)
print("altura do corpo:", round(ALTURA, 3))

# roupa de baixo: faixa do quadril do próprio corpo, um pouco inflada (deforma junto: mantém os grupos de vértices)
roupa = corpo.copy(); roupa.data = corpo.data.copy(); roupa.name = "roupa_baixo"
cena.collection.objects.link(roupa)
lo, hi = 0.455 * ALTURA, 0.565 * ALTURA
import bmesh
bm = bmesh.new(); bm.from_mesh(roupa.data)
dl_r = bm.verts.layers.deform.active; gi_b = corpo.vertex_groups["body"].index
fora = [f for f in bm.faces if not (lo <= f.calc_center_median().z <= hi and abs(f.calc_center_median().x) < 0.19 and all(v[dl_r].get(gi_b, 0.0) > 0 for v in f.verts))]
bmesh.ops.delete(bm, geom=fora, context="FACES")
for v in bm.verts: v.co += v.normal * 0.006
bm.to_mesh(roupa.data); bm.free()
for m in list(roupa.modifiers):
    if m.type == "MASK": roupa.modifiers.remove(m)
roupa.data.materials.clear(); roupa.data.materials.append(ROUPA)
sol_mod = roupa.modifiers.new("espessura", "SOLIDIFY"); sol_mod.thickness = 0.004
for o in (corpo, roupa): mover_para(o, "corpo")
mover_para(cab, "cabelo")   # camada própria: o jogo esconde o cabelo quando há elmo
mover_para(rig, "corpo")
rig.hide_render = True

# ------------------------------------------------------------------ pose por rotações no MUNDO (independe do eixo de cada osso)
P = rig.pose.bones
def zerar():
    for b in P: b.rotation_mode = "QUATERNION"; b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0)
    bpy.context.view_layer.update()
def girar(osso, eixo, graus):
    """gira o osso em torno do eixo do MUNDO que passa pela cabeça dele"""
    eixo = Vector(eixo)
    if not (eixo.length > 1e-6) or not math.isfinite(graus): return   # eixo indefinido (NaN/zero): não gira (evita vértices "explodindo")
    eixo.normalize()
    pb = P[osso]; bpy.context.view_layer.update()
    m = pb.matrix.copy(); cabeca = m.to_translation()
    R = Matrix.Translation(cabeca) @ Matrix.Rotation(math.radians(graus), 4, Vector(eixo)) @ Matrix.Translation(-cabeca)
    pb.matrix = R @ m; bpy.context.view_layer.update()
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)

def base_parada():
    """braços para baixo (o modelo vem em pose A) e mãos relaxadas"""
    zerar()
    girar("upperarm_l", Y, 40); girar("upperarm_r", Y, -40 if SEM_ARMA else -33)   # 40° (antes 48°): o braço passa por fora da couraça, que é ~3 cm maior que o corpo
    girar("lowerarm_l", X, -3); girar("lowerarm_r", X, -3)
    if SEM_ARMA:   # sem arma: as duas mãos relaxadas, iguais (corpo simétrico)
        mao_empunhadura("r", 0.45, polegar=False); mao_empunhadura("l", 0.45, polegar=False); return
    endireitar_antebraco("r", 12)   # o antebraço pende quase reto (no repouso do modelo ele aponta ~50° para a frente)
    ajustar_pegada("r")   # pulso reto: só gira o antebraço no próprio eixo e deixa a mão cair de leve para o lado do mindinho
    mao_empunhadura("r", 1.0); mao_empunhadura("l", 0.45, polegar=False)
SEM_ARMA = "--sem-arma" in argv

def cabeca_mundo(n): return rig.matrix_world @ P[n].head
def cauda_mundo(n): return rig.matrix_world @ P[n].tail
DEDOS = ("index", "middle", "ring", "pinky")
def eixos_mao(lado):
    """a = através do punho (mindinho -> indicador); f = sentido dos dedos; n = normal da palma (lado do polegar/palma)"""
    a = (cabeca_mundo(f"index_01_{lado}") - cabeca_mundo(f"pinky_01_{lado}")).normalized()
    f = (cauda_mundo(f"middle_01_{lado}") - cabeca_mundo(f"middle_01_{lado}")).normalized()
    f = (f - a * f.dot(a)).normalized()
    n = a.cross(f).normalized()
    pol = cabeca_mundo(f"thumb_02_{lado}") - cabeca_mundo(f"hand_{lado}")
    if pol.dot(n) < 0: n = -n
    return a, f, n
# ---- EMPUNHADURA: o cabo fica na DIAGONAL da palma (do indicador para a base do mindinho, como numa espada de verdade),
# então a lâmina sai do punho já inclinada para baixo; quem aponta a espada é o giro do antebraço (pronação), não o pulso.
ANG_DIAGONAL = 24          # graus entre o eixo do punho e o cabo (cabo deitado na palma)
DESVIO_MAX = 14            # desvio do pulso para o lado do mindinho, natural de quem relaxa a mão (pulso nunca dobra)
DIR_ALVO = Vector((-0.30, -0.70, -0.65)).normalized()   # mão direita: para a frente, para baixo e um pouco para fora (longe das pernas)
def dir_espada(lado):
    """sentido da lâmina saindo da mão: eixo do punho (a) inclinado pela diagonal da palma para o lado dos dedos/pulso"""
    a = (cabeca_mundo(f"index_01_{lado}") - cabeca_mundo(f"pinky_01_{lado}")).normalized()
    h = (cauda_mundo(f"hand_{lado}") - cabeca_mundo(f"hand_{lado}")).normalized()   # pulso -> dedos
    h = (h - a * h.dot(a)).normalized()
    return (a * math.cos(math.radians(ANG_DIAGONAL)) + h * math.sin(math.radians(ANG_DIAGONAL))).normalized()
def endireitar_antebraco(lado, dobra):
    """deixa o antebraço na linha do braço, com o cotovelo dobrado só 'dobra' graus para a frente (braço relaxado)"""
    u = (cauda_mundo(f"upperarm_{lado}") - cabeca_mundo(f"upperarm_{lado}")).normalized()
    fa = (cauda_mundo(f"lowerarm_{lado}") - cabeca_mundo(f"lowerarm_{lado}")).normalized()
    eixo = u.cross(Vector((0, -1, 0)))
    if eixo.length < 1e-4: return
    alvo = (Matrix.Rotation(math.radians(dobra), 3, eixo.normalized()) @ u).normalized()   # u inclinado para a frente
    q = fa.rotation_difference(alvo)
    if math.degrees(q.angle) > 0.5: girar(f"lowerarm_{lado}", tuple(q.axis), math.degrees(q.angle))
PEGADA = {}
def _girar_pegada(lado, tw, dv):
    eixo_ab = (cauda_mundo(f"lowerarm_{lado}") - cabeca_mundo(f"lowerarm_{lado}")).normalized()
    girar(f"lowerarm_{lado}", tuple(eixo_ab), tw)                  # pronação/supinação: o antebraço gira no próprio eixo
    a = (cabeca_mundo(f"index_01_{lado}") - cabeca_mundo(f"pinky_01_{lado}")).normalized()
    h = (cauda_mundo(f"hand_{lado}") - cabeca_mundo(f"hand_{lado}")).normalized()
    n = a.cross(h).normalized()                                     # normal da palma: eixo do desvio lateral do pulso
    girar(f"hand_{lado}", tuple(n), dv)
def ajustar_pegada(lado):
    if lado in PEGADA: _girar_pegada(lado, *PEGADA[lado]); return
    base = {b: P[b].matrix.copy() for b in (f"lowerarm_{lado}", f"hand_{lado}")}
    def repor():
        for b in (f"lowerarm_{lado}", f"hand_{lado}"): P[b].matrix = base[b]; bpy.context.view_layer.update()
    melhor = (9e9, 0, 0)
    for tw in range(-180, 180, 6):
        for dv in range(-DESVIO_MAX, DESVIO_MAX + 1, 2):
            repor(); _girar_pegada(lado, tw, dv)
            erro = math.degrees(dir_espada(lado).angle(DIR_ALVO)) + 0.15 * abs(dv) + 0.02 * abs(tw)   # prefere pulso neutro
            if erro < melhor[0]: melhor = (erro, tw, dv)
    repor(); PEGADA[lado] = melhor[1:]; _girar_pegada(lado, *PEGADA[lado])
    print("pegada: erro", round(melhor[0], 1), "giro do antebraço", melhor[1], "desvio do pulso", melhor[2])
def mirar_pulso(lado, alvo, limite=65):
    """gira o pulso para o eixo do punho (a) apontar para 'alvo' (até 'limite' graus): a arma aponta sem sair da mão"""
    a, f, n = eixos_mao(lado)
    q = a.rotation_difference(alvo); ang = math.degrees(q.angle)
    if ang < 0.5: return
    girar(f"hand_{lado}", tuple(q.axis), min(ang, limite))
def mao_empunhadura(lado, fechamento=1.0, polegar=True):
    """pose padrão de quem segura um cabo de ~3,5 cm: dedos em volta do cabo, polegar fechando por cima do indicador"""
    a, f, n = eixos_mao(lado)
    # sentido do dobrar: o que leva a ponta do dedo médio para o lado da palma (n)
    ponta0 = cauda_mundo(f"middle_03_{lado}").dot(n)
    girar(f"middle_01_{lado}", tuple(a), 20); sg = 1 if cauda_mundo(f"middle_03_{lado}").dot(n) > ponta0 else -1
    girar(f"middle_01_{lado}", tuple(a), -20)
    for d in DEDOS:
        for seg, ang in (("01", 58), ("02", 80), ("03", 52)):
            girar(f"{d}_{seg}_{lado}", tuple(a), sg * ang * fechamento)
    if not polegar: return
    if lado in POLEGAR:  # já calculado no primeiro frame: reaplica a mesma pose do polegar (rápido e igual em todos)
        _, r1, r2, c = POLEGAR[lado]
        girar(f"thumb_01_{lado}", tuple(f), r1); girar(f"thumb_01_{lado}", tuple(n), r2)
        td = (cauda_mundo(f"thumb_02_{lado}") - cabeca_mundo(f"thumb_02_{lado}")).normalized(); eixo_c = td.cross(n).normalized()
        girar(f"thumb_02_{lado}", tuple(eixo_c), c * 0.5); girar(f"thumb_03_{lado}", tuple(eixo_c), c)
        return
    # polegar: busca a rotação que leva a ponta para cima da 2ª falange do indicador (sem "joinha")
    alvo = cabeca_mundo(f"index_02_{lado}") + n * 0.012 + f * 0.01
    melhor = (1e9, 0, 0, 0)
    base = {b: P[b].matrix.copy() for b in (f"thumb_01_{lado}", f"thumb_02_{lado}", f"thumb_03_{lado}")}
    def repor():
        for b, m in base.items(): P[b].matrix = m; bpy.context.view_layer.update()
    for r1 in range(-70, 71, 14):
        for r2 in range(-50, 51, 10):
            for c in (20, 45, 70):
                repor()
                girar(f"thumb_01_{lado}", tuple(f), r1); girar(f"thumb_01_{lado}", tuple(n), r2)
                td = (cauda_mundo(f"thumb_02_{lado}") - cabeca_mundo(f"thumb_02_{lado}")).normalized()
                eixo_c = td.cross(n).normalized()
                girar(f"thumb_02_{lado}", tuple(eixo_c), c * 0.5); girar(f"thumb_03_{lado}", tuple(eixo_c), c)
                dist = (cauda_mundo(f"thumb_03_{lado}") - alvo).length
                if dist < melhor[0]: melhor = (dist, r1, r2, c)
    repor()
    _, r1, r2, c = melhor
    girar(f"thumb_01_{lado}", tuple(f), r1); girar(f"thumb_01_{lado}", tuple(n), r2)
    td = (cauda_mundo(f"thumb_02_{lado}") - cabeca_mundo(f"thumb_02_{lado}")).normalized(); eixo_c = td.cross(n).normalized()
    girar(f"thumb_02_{lado}", tuple(eixo_c), c * 0.5); girar(f"thumb_03_{lado}", tuple(eixo_c), c)
    POLEGAR[lado] = melhor
POLEGAR = {}
def encaixe_mao(lado):
    """ponto de encaixe da arma: centro do punho fechado, eixo Z = através do punho (lado do polegar)"""
    a, f, n = eixos_mao(lado)
    f1 = sum((cabeca_mundo(f"{d}_01_{lado}") for d in DEDOS), Vector()) / 4
    f2 = sum((cauda_mundo(f"{d}_02_{lado}") for d in DEDOS), Vector()) / 4
    c = (f1 + f2) / 2
    m = Matrix((f, n, a)).transposed().to_4x4(); m.translation = c   # X = dedos, Y = palma, Z = cabo
    return m

def pose(fase=None, respira=0.0, sobe=0.0, peso=0.0, golpe=None):
    """fase (0..1) = ciclo da caminhada (0 = contato do pé direito à frente); sem fase = parado (respiração e peso)"""
    base_parada()
    if golpe is not None: pose_golpe(golpe); return
    if fase is None:   # PARADO: respiração. Quadril, pernas e pés NÃO se mexem (nada desliza); só o peito abre e os ombros sobem
        girar("spine_02", X, -2)                                  # postura
        girar("spine_03", X, -2.5 * respira)                      # peito sobe/abre ao inspirar
        girar("clavicle_l", Y, -5 * respira); girar("clavicle_r", Y, 5 * respira)   # ombros sobem (~1 px no sprite)
        girar("head", X, 2.5 * respira)                           # a cabeça continua nivelada
        return
    # CAMINHADA simétrica (referência: trote do Albion): os dois lados fazem exatamente o mesmo, meio ciclo defasados
    c, s2 = math.cos(2 * math.pi * fase), math.sin(2 * math.pi * fase)
    cD, cE = c, -c                                     # perna direita à frente em fase 0, esquerda em 0,5
    def joelho(f):   # flexão: um pouco no apoio (amortece) e bastante quando a perna passa à frente
        a = math.sin(2 * math.pi * f)
        return 6 + 12 * max(0.0, a) + 50 * max(0.0, -a) ** 1.3
    jD, jE = joelho(fase), joelho(fase + 0.5)
    mover_pelvis(0, 0, 0.014 * (1 - math.cos(4 * math.pi * fase)))   # sobe no meio do apoio, desce no contato
    girar("pelvis", Z, 5 * c)                           # quadril gira: o lado da perna da frente avança
    girar("spine_02", Z, -4 * c); girar("spine_03", Z, -4 * c)   # ombros giram contra o quadril
    girar("spine_02", X, 4)                             # tronco levemente à frente (positivo = à frente)
    girar("head", Z, 3 * c); girar("head", X, -3)       # a cabeça compensa e continua olhando à frente
    girar("thigh_r", X, -26 * cD); girar("thigh_l", X, -26 * cE)
    girar("calf_r", X, jD); girar("calf_l", X, jE)
    # pé: calcanhar no contato, ponta no impulso (rola do calcanhar para a ponta)
    girar("foot_r", X, 26 * cD * 0.5 - jD * 0.35 + 10 * max(0.0, math.sin(2 * math.pi * (fase - 0.35))) ** 2)
    girar("foot_l", X, 26 * cE * 0.5 - jE * 0.35 + 10 * max(0.0, math.sin(2 * math.pi * (fase + 0.15))) ** 2)
    # braços soltos, em oposição às pernas, IGUAIS dos dois lados: o ombro leva o braço e o antebraço vem atrasado
    # (cotovelo dobra mais quando o braço vai à frente e abre quando vai para trás, como um pêndulo)
    for lado, cb, fb in (("l", cD, fase), ("r", cE, fase + 0.5)):
        atraso = math.cos(2 * math.pi * (fb - 0.08))    # o antebraço segue o braço com um pequeno atraso
        sx = 1 if lado == "l" else -1
        armado = lado == "r" and not SEM_ARMA            # o braço da espada (peso na mão) balança menos e o pulso fica firme
        k = 0.45 if armado else 1.0
        girar(f"clavicle_{lado}", Z, -4 * cb * sx * k)  # o ombro acompanha: vai à frente e volta para trás com o braço
        girar(f"upperarm_{lado}", X, -k * (18 * cb if cb > 0 else 34 * cb))   # para trás vai MAIS longe que para a frente
        if armado:
            girar(f"lowerarm_{lado}", X, -(8 + 4 * (0.5 + 0.5 * atraso)))   # cotovelo quase parado: a lâmina mantém o ângulo
        else:
            girar(f"lowerarm_{lado}", X, -(6 + 34 * (0.5 + 0.5 * atraso) ** 1.6))   # atrás: braço quase reto; à frente: dobra
            girar(f"hand_{lado}", X, 6 * atraso)        # o pulso acompanha, solto

# ---- ATAQUE BÁSICO (espada de uma mão): corte diagonal de cima/direita para baixo/esquerda. Pés fixos no chão; o tronco
# gira (prepara para a direita, corta para a esquerda). Braço por DIREÇÕES no mundo (braço, antebraço, lâmina) em
# quadros-chave; a lâmina é apontada pelo giro do antebraço + desvio pequeno do pulso (o pulso nunca dobra).
# personagem olha para -Y; direita = -X. Torção (graus, + = ombro direito vai à frente); inclinação (+ = à frente).
# AUTO ATAQUE = 3 golpes simples em sequência (referência do usuário: autoAtack.gif do Albion), 5 quadros cada:
#   attack1: corte horizontal da direita para a esquerda | attack2: golpe vertical de cima para baixo |
#   attack3: golpe baixo para a frente (estocada). O escudo abre para o lado esquerdo durante o golpe.
GOLPE_CHAVES = {
    "h_prep": dict(braco=(-0.85, 0.30, -0.10), antebraco=(-0.55, 0.55, 0.25), lamina=(-0.20, 0.85, -0.20), torcao=-26, inclina=-2, escudo=0.4),
    "h_imp":  dict(braco=(-0.20, -0.95, -0.20), antebraco=(0.30, -0.95, -0.05), lamina=(0.85, -0.45, -0.10), torcao=20, inclina=8, escudo=0.9),
    "h_seg":  dict(braco=(0.35, -0.85, -0.30), antebraco=(0.75, -0.50, -0.30), lamina=(0.75, 0.60, -0.20), torcao=32, inclina=10, escudo=0.8),
    "v_prep": dict(braco=(-0.35, 0.05, 0.93), antebraco=(-0.10, 0.15, 0.98), lamina=(0.25, 0.65, 0.72), torcao=-10, inclina=-6, escudo=0.7),
    "v_imp":  dict(braco=(-0.20, -0.85, -0.45), antebraco=(-0.05, -0.85, -0.52), lamina=(0.35, -0.45, -0.82), torcao=12, inclina=14, escudo=0.9),
    "v_seg":  dict(braco=(-0.15, -0.50, -0.85), antebraco=(0.05, -0.60, -0.80), lamina=(0.40, -0.10, -0.90), torcao=14, inclina=16, escudo=0.8),
    "e_prep": dict(braco=(-0.35, 0.45, -0.82), antebraco=(-0.20, 0.00, -0.98), lamina=(0.00, -0.85, -0.50), torcao=-18, inclina=0, escudo=0.5),
    "e_imp":  dict(braco=(-0.15, -0.90, -0.40), antebraco=(0.00, -0.90, -0.43), lamina=(0.60, -0.60, -0.52), torcao=18, inclina=16, escudo=0.9),
}
# quadros de cada golpe: (chave A, chave B, mistura); "base" = guarda parada
GOLPES = {
    "attack1": [("base", "h_prep", 0.6), ("h_prep", "h_prep", 0.0), ("h_imp", "h_imp", 0.0), ("h_seg", "h_seg", 0.0), ("h_seg", "base", 0.6)],
    "attack2": [("base", "v_prep", 0.6), ("v_prep", "v_prep", 0.0), ("v_imp", "v_imp", 0.0), ("v_seg", "v_seg", 0.0), ("v_seg", "base", 0.6)],
    "attack3": [("base", "e_prep", 0.6), ("e_prep", "e_prep", 0.0), ("e_imp", "e_imp", 0.0), ("e_imp", "base", 0.3), ("e_imp", "base", 0.7)],
}
def direcao(osso): return (cauda_mundo(osso) - cabeca_mundo(osso)).normalized()
def apontar(osso, alvo):
    atual, alvo = direcao(osso), Vector(alvo).normalized()
    if atual.dot(alvo) < -0.999:   # quase oposto: o eixo da diferença fica indefinido; gira 90° por um eixo perpendicular antes
        perp = atual.cross(Vector((1, 0, 0)) if abs(atual.x) < 0.9 else Vector((0, 1, 0))).normalized()
        girar(osso, tuple(perp), 90); atual = direcao(osso)
    q = atual.rotation_difference(alvo)
    if math.degrees(q.angle) > 0.3: girar(osso, tuple(q.axis), math.degrees(q.angle))
def mirar_lamina(lado, alvo, desvio_max=30):   # no golpe o pulso desvia mais para o lado do mindinho (natural ao cortar)
    """gira o antebraço no próprio eixo e desvia o pulso de leve (<= desvio_max) para a lâmina apontar para 'alvo'"""
    alvo = Vector(alvo).normalized()
    base = {b: P[b].matrix.copy() for b in (f"lowerarm_{lado}", f"hand_{lado}")}
    def repor():
        for b in (f"lowerarm_{lado}", f"hand_{lado}"): P[b].matrix = base[b]; bpy.context.view_layer.update()
    melhor = (9e9, 0, 0)
    for tw in range(-180, 180, 10):
        for dv in range(-desvio_max, desvio_max + 1, 6):
            repor(); _girar_pegada(lado, tw, dv)
            e = math.degrees(dir_espada(lado).angle(alvo)) + 0.1 * abs(dv)
            if e < melhor[0]: melhor = (e, tw, dv)
    _, tw, dv = melhor
    for t2 in range(tw - 8, tw + 9, 2):   # refina
        for d2 in range(max(-desvio_max, dv - 5), min(desvio_max, dv + 5) + 1):
            repor(); _girar_pegada(lado, t2, d2)
            e = math.degrees(dir_espada(lado).angle(alvo)) + 0.1 * abs(d2)
            if e < melhor[0]: melhor = (e, t2, d2)
    repor(); _girar_pegada(lado, melhor[1], melhor[2]); return melhor[0]
def chave_golpe(nome):
    if nome != "base": return GOLPE_CHAVES[nome]
    return dict(braco=tuple(BASE_GOLPE["braco"]), antebraco=tuple(BASE_GOLPE["antebraco"]), lamina=tuple(BASE_GOLPE["lamina"]), torcao=0, inclina=0, escudo=0.0)
BASE_GOLPE = {}
def pose_golpe(i):
    base_parada()
    if not BASE_GOLPE:   # direções da guarda parada (ponto de partida e de volta do golpe)
        BASE_GOLPE.update(braco=direcao("upperarm_r"), antebraco=direcao("lowerarm_r"), lamina=dir_espada("r"))
    nome_golpe, i = i
    ka, kb, t = GOLPES[nome_golpe][i]
    A, B = chave_golpe(ka), chave_golpe(kb)
    t = t * t * (3 - 2 * t)   # suaviza
    mix = lambda k: Vector(A[k]).normalized().slerp(Vector(B[k]).normalized(), t) if A[k] != B[k] else Vector(A[k]).normalized()
    num = lambda k: A[k] + (B[k] - A[k]) * t
    tor, inc = num("torcao"), num("inclina")
    # tronco: torção dividida entre as 3 vértebras (quadril e pernas ficam parados: os pés não deslizam)
    for o in ("spine_01", "spine_02", "spine_03"): girar(o, Z, tor / 3)   # Z+ leva o ombro direito (-X) para a frente (-Y)
    girar("spine_02", X, -2 + inc * 0.6); girar("spine_03", X, inc * 0.4)
    girar("head", Z, -tor * 0.8); girar("head", X, -inc * 0.7)   # a cabeça continua olhando o alvo, à frente
    # joelhos levemente dobrados na base de combate
    for l in ("l", "r"): girar(f"thigh_{l}", X, -6); girar(f"calf_{l}", X, 10); girar(f"foot_{l}", X, -4)
    mover_pelvis(0, 0, -0.012)
    # braço da espada
    apontar("upperarm_r", mix("braco")); apontar("lowerarm_r", mix("antebraco"))
    erro = mirar_lamina("r", mix("lamina"))
    # braço do escudo: traz o escudo um pouco à frente durante o golpe (guarda)
    e = num("escudo"); girar("upperarm_l", Y, -35 * e); girar("upperarm_l", X, -15 * e); girar("lowerarm_l", X, -25 * e)   # abre o escudo para o lado
    print("golpe", nome_golpe, "quadro", i, "erro da lâmina", round(erro, 1))

def mover_pelvis(dx, dy, dz):
    pm = P["pelvis"].matrix.copy(); pm.translation += Vector((dx, dy, dz)); P["pelvis"].matrix = pm; bpy.context.view_layer.update()

N_WALK, N_IDLE = 8, 6
WALK = [dict(fase=i / N_WALK) for i in range(N_WALK)]
IDLE = [dict(respira=0.5 * (1 - math.cos(2 * math.pi * i / N_IDLE))) for i in range(N_IDLE)]   # 0 (expira) .. 1 (inspira) .. 0
POSES = {"walk": WALK, "idle": IDLE, **{g: [dict(golpe=(g, i)) for i in range(len(q))] for g, q in GOLPES.items()}}

# ------------------------------------------------------------------ equipamento criado na pose parada e preso aos ossos
pose()
def mundo_osso(n): return rig.matrix_world @ P[n].matrix
def peca(nome, prim, loc, esc, material, osso, rot=(0, 0, 0), bevel=0.01, colecao_nome="couraca", **kw):
    getattr(bpy.ops.mesh, prim)(location=loc, rotation=rot, **kw)
    o = bpy.context.object; o.name = nome; o.scale = esc; bpy.ops.object.transform_apply(scale=True)
    for p in o.data.polygons: p.use_smooth = True
    if bevel: m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 2
    o.data.materials.append(material)
    mw = o.matrix_world.copy(); o.parent = rig; o.parent_type = "BONE"; o.parent_bone = osso
    bpy.context.view_layer.update(); o.matrix_world = mw
    mover_para(o, colecao_nome); return o

# ------------------------------------------------------------------ EQUIPAMENTOS COMUNS (referências do usuário, 27/11/2026)
# Cada peça numa coleção (= camada). O laranja das referências é o ACENTO (a parte que recebe a cor da raridade).
GRUPOS = {g.index: g.name for g in corpo.vertex_groups}
OSSOS_VALIDOS = {b.name for b in rig.data.bones}
def casca(nome, ossos, z_min, z_max, infla, material, espessura=0.012, facetado=0.0, colecao_nome="couraca", juntar=False):
    """copia do próprio corpo as faces movidas por 'ossos' entre z_min e z_max (fração da altura), infla e dá espessura"""
    o = corpo.copy(); o.data = corpo.data.copy(); o.name = nome; cena.collection.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    dl = bm.verts.layers.deform.active
    gi_body = corpo.vertex_groups["body"].index if "body" in corpo.vertex_groups else None
    def ok_v(v):
        z = (corpo.matrix_world @ v.co).z
        if not (z_min * ALTURA <= z <= z_max * ALTURA): return False
        if gi_body is not None and v[dl].get(gi_body, 0.0) <= 0.0: return False   # malha auxiliar do MakeHuman: fora
        melhor, peso = None, 0.0
        for gi, w in v[dl].items():
            n = GRUPOS.get(gi, "")
            if n in OSSOS_VALIDOS and w > peso: melhor, peso = n, w
        return melhor in ossos
    # juntar: a face entra se QUALQUER vértice for da peça (as peças vizinhas se sobrepõem em vez de deixar
    # um buraco nas faces da divisa, como atrás dos ombros entre o peitoral e os braços)
    teste = any if juntar else all
    fora = [f for f in bm.faces if not teste(ok_v(v) for v in f.verts)]
    bmesh.ops.delete(bm, geom=fora, context="FACES")
    for v in bm.verts: v.co += v.normal * infla
    bm.to_mesh(o.data); bm.free()
    for m in list(o.modifiers):
        if m.type == "MASK": o.modifiers.remove(m)
    o.data.materials.clear(); o.data.materials.append(material)
    if facetado:
        d = o.modifiers.new("placas", "DECIMATE"); d.ratio = facetado
        for p in o.data.polygons: p.use_smooth = False
    sl = o.modifiers.new("espessura", "SOLIDIFY"); sl.thickness = espessura; sl.offset = 1
    mover_para(o, colecao_nome); return o

def pontos(ossos, z_min=0.0, z_max=1.0):
    """vértices do corpo (no mundo, em repouso) movidos pelos ossos dados"""
    out = []
    for v in corpo.data.vertices:
        z = (corpo.matrix_world @ v.co).z
        if not (z_min * ALTURA <= z <= z_max * ALTURA): continue
        melhor, peso = None, 0.0
        for g in v.groups:
            n = GRUPOS.get(g.group, "")
            if n in OSSOS_VALIDOS and g.weight > peso: melhor, peso = n, g.weight
        if melhor in ossos: out.append(corpo.matrix_world @ v.co)
    return out

def peca_em(nome, prim, local, esc, material, ref, osso, colecao_nome, bevel=0.006, liso=False, **kw):
    """cria a peça no referencial 'ref' (matriz no mundo) e prende ao osso"""
    getattr(bpy.ops.mesh, prim)(location=(0, 0, 0), **kw)
    o = bpy.context.object; o.name = nome; o.scale = esc; bpy.ops.object.transform_apply(scale=True)
    o.location = local; bpy.ops.object.transform_apply(location=True)
    for p in o.data.polygons: p.use_smooth = liso
    if bevel: m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 2 if liso else 1
    o.data.materials.append(material)
    o.matrix_world = ref @ o.matrix_world
    mw = o.matrix_world.copy(); o.parent = rig; o.parent_type = "BONE"; o.parent_bone = osso
    bpy.context.view_layer.update(); o.matrix_world = mw
    mover_para(o, colecao_nome); return o

# ---- ARMADURA (slot do peito): cobre o corpo todo, menos a cabeça (elmo) e os pés (botas), como no Albion
TRONCO = {"spine_01", "spine_02", "spine_03", "pelvis", "clavicle_l", "clavicle_r"}
MAOS = {f"{d}_{k}_{l}" for d in ("index", "middle", "ring", "pinky", "thumb") for k in ("01", "02", "03") for l in ("l", "r")} | {"hand_l", "hand_r"}
casca("peitoral", TRONCO | {"neck_01"}, 0.50, 0.885, 0.028, ACO, facetado=0.7, juntar=True)   # sobe pelo pescoço até por baixo do elmo (sem buraco na nuca)
for lado, s_ in (("D", "r"), ("E", "l")):
    casca(f"ombreira_{lado}", {f"upperarm_{s_}", f"clavicle_{s_}"}, 0.74, 0.86, 0.045, ACO_CLARO, facetado=0.7, juntar=True)
    casca(f"braco_{lado}", {f"upperarm_{s_}", f"lowerarm_{s_}"}, 0.0, 0.80, 0.016, ACO, facetado=0.8, juntar=True)
casca("manoplas", MAOS, 0.0, 1.0, 0.005, ACO_ESCURO, espessura=0.006)
casca("faldas", {"pelvis", "thigh_l", "thigh_r", "spine_01"}, 0.42, 0.56, 0.03, ACO, facetado=0.7)
casca("pernas", {"thigh_l", "thigh_r", "calf_l", "calf_r"}, 0.065, 0.53, 0.014, ACO, facetado=0.8)
casca("cinto", TRONCO, 0.548, 0.588, 0.042, ACENTO, espessura=0.012)

# ---- BOTAS (slot dos pés): calçado de placa até o tornozelo, faixa laranja no cano
PES = {"foot_l", "foot_r", "ball_l", "ball_r", "calf_l", "calf_r"}
# o cano sobe até a canela (logo abaixo do joelho) e fica POR CIMA da armadura das pernas (infla maior que o 0.014 dela)
casca("sapatos", {"foot_l", "foot_r", "ball_l", "ball_r"}, 0.0, 0.235, 0.028, COURO_BOTA, facetado=0.85, espessura=0.01, colecao_nome="botas")   # pé de couro
casca("botas_cano", {"calf_l", "calf_r"}, 0.0, 0.235, 0.028, ACO, facetado=0.85, espessura=0.01, colecao_nome="botas", juntar=True)   # cano de placa
casca("botas_aro", {"calf_l", "calf_r"}, 0.215, 0.245, 0.036, ACENTO, espessura=0.008, colecao_nome="botas")

# ---- ELMO: esfera moldada à cabeça (envoltória lisa da pele: sem nariz/orelhas), justa, desce até o pescoço e cobre a
# nuca; fenda do visor na altura dos olhos, aro na borda e crista (acento) de frente para trás. Pesos copiados da pele
# (cabeça/pescoço): deforma junto. Medidas no corpo em repouso já com as formas do MakeHuman (as da malha base não servem).
from mathutils.kdtree import KDTree
def pele_repouso():
    """posições da pele (grupo body) no repouso com as formas aplicadas, e os pesos head/neck_01 de cada vértice"""
    masks = [m for m in corpo.modifiers if m.type == "MASK"]
    for m in masks: m.show_viewport = False
    rig.data.pose_position = "REST"; bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = corpo.evaluated_get(dg); me = ev.to_mesh()
    gi_b = corpo.vertex_groups["body"].index
    gh, gn = corpo.vertex_groups["head"].index, corpo.vertex_groups["neck_01"].index
    out = []
    for v, v0 in zip(me.vertices, corpo.data.vertices):
        g = {x.group: x.weight for x in v0.groups}
        if g.get(gi_b, 0.0) <= 0.0: continue
        wh, wn = g.get(gh, 0.0), g.get(gn, 0.0)
        if wh + wn < 0.5: continue
        out.append((corpo.matrix_world @ v.co, wh, wn))
    ev.to_mesh_clear()
    rig.data.pose_position = "POSE"
    for m in masks: m.show_viewport = True
    bpy.context.view_layer.update(); return out
PELE_CAB = pele_repouso()
cab_pts = [p for p, wh, wn in PELE_CAB if wh >= wn]; pesc_pts = [p for p, wh, wn in PELE_CAB if wn > wh]
Z_QUEIXO = min(p.z for p in cab_pts); Z_PESC = min(p.z for p in pesc_pts)
z_topo = max(p.z for p in cab_pts)
z_corte = Z_PESC + 0.45 * (Z_QUEIXO - Z_PESC)          # o elmo termina no pescoço (acima da gola da couraça)
cx = sum(p.x for p in cab_pts) / len(cab_pts); cy = sum(p.y for p in cab_pts) / len(cab_pts)
z_olho = z_topo - 0.47 * (z_topo - Z_QUEIXO)
CENTRO_CAB = Vector((cx, cy, Z_QUEIXO + 0.45 * (z_topo - Z_QUEIXO)))
_pele = [p - CENTRO_CAB for p, wh, wn in PELE_CAB if p.z >= z_corte - 0.01]
PELE_DIR = [d.normalized() for d in _pele]; PELE_R = [d.length for d in _pele]
KD_CAB = KDTree(len(PELE_DIR))
for i, d in enumerate(PELE_DIR): KD_CAB.insert(d, i)
KD_CAB.balance()
KD_PESO = KDTree(len(PELE_CAB))
for i, (p, wh, wn) in enumerate(PELE_CAB): KD_PESO.insert(p, i)
KD_PESO.balance()
print("elmo: queixo", round(Z_QUEIXO, 3), "pescoço", round(Z_PESC, 3), "topo", round(z_topo, 3), "olho", round(z_olho, 3))

def casca_cabeca(nome, infla, material, faixa=None, suaviza=6, espessura=0.008, mat_fenda=None, janela=0.40):
    """esfera em volta da cabeça levada até a envoltória da pele + 'infla'; corta no pescoço; 'faixa(c)' filtra faces"""
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=0.1)
    for v in bm.verts:
        u = v.co.normalized(); alc = 0.0
        for _, k, _d in KD_CAB.find_range(u, janela):
            alc = max(alc, PELE_R[k] * u.dot(PELE_DIR[k]))
        v.co = CENTRO_CAB + u * (alc + infla)
    for _ in range(suaviza):
        bmesh.ops.smooth_vert(bm, verts=list(bm.verts), factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    fora = [f for f in bm.faces if f.calc_center_median().z < z_corte or (faixa and not faixa(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=fora, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nome, me); cena.collection.objects.link(o)
    vh, vn = o.vertex_groups.new(name="head"), o.vertex_groups.new(name="neck_01")
    for v in me.vertices:   # peso da pele mais próxima: a borda do pescoço acompanha o pescoço, o resto a cabeça
        _, k, _d = KD_PESO.find(v.co); _, wh, wn = PELE_CAB[k]; t = wh + wn
        vh.add([v.index], wh / t, "REPLACE"); vn.add([v.index], wn / t, "REPLACE")
    am = o.modifiers.new("esqueleto", "ARMATURE"); am.object = rig
    me.materials.append(material)
    if mat_fenda:
        me.materials.append(mat_fenda)
        for p in me.polygons:
            c = p.center
            if c.y < cy - 0.045 and abs(c.z - z_olho) < 0.014: p.material_index = 1
    for p in me.polygons: p.use_smooth = True
    sl = o.modifiers.new("espessura", "SOLIDIFY"); sl.thickness = espessura; sl.offset = 1
    mover_para(o, "elmo"); return o
casca_cabeca("elmo", 0.020, ACO, mat_fenda=FENDA)
casca_cabeca("elmo_aro", 0.026, ACO_CLARO, faixa=lambda c: c.z < z_corte + 0.022, suaviza=4)          # aro na borda do pescoço
casca_cabeca("elmo_crista", 0.032, ACENTO, faixa=lambda c: abs(abs(math.degrees(math.atan2(c.y - cy, c.x - cx))) - 90) < 7.6 and c.z > z_olho + 0.02 - 0.5 * max(0.0, c.y - cy), suaviza=4, espessura=0.01)

# ---- CAPA: tecido cinza-amarronzado atrás, forro escuro, faixas laranja nos ombros, fecho de metal
# Medidas no corpo em REPOUSO com as formas do MakeHuman (a malha base é mais baixa: a capa ficava no meio das costas).
# Nasce em cima dos ombros (por cima das ombreiras), rente à nuca, e desce até o meio das coxas.
def pts_repouso(ossos):
    masks = [m for m in corpo.modifiers if m.type == "MASK"]
    for m in masks: m.show_viewport = False
    rig.data.pose_position = "REST"; bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = corpo.evaluated_get(dg); me = ev.to_mesh()
    gi_b = corpo.vertex_groups["body"].index; out = []
    for v, v0 in zip(me.vertices, corpo.data.vertices):
        melhor, peso, corpo_ok = None, 0.0, False
        for g in v0.groups:
            if g.group == gi_b and g.weight > 0: corpo_ok = True
            n = GRUPOS.get(g.group, "")
            if n in OSSOS_VALIDOS and g.weight > peso: melhor, peso = n, g.weight
        if corpo_ok and melhor in ossos: out.append(corpo.matrix_world @ v.co)
    ev.to_mesh_clear(); rig.data.pose_position = "POSE"
    for m in masks: m.show_viewport = True
    bpy.context.view_layer.update(); return out
H_REAL = max(p.z for p in pts_repouso({"head"}))
clav = pts_repouso({"clavicle_l", "clavicle_r", "spine_03"})
z_ombro = max(p.z for p in clav) + 0.03                       # topo dos ombros + couraça
costas = [p for p in pts_repouso({"spine_02", "spine_03"}) if p.z > 0.62 * H_REAL]
y_costas = max(p.y for p in costas) + 0.04                     # atrás das costas + couraça
larg = max(abs(p.x) for p in pts_repouso({"clavicle_l", "clavicle_r"})) * 1.30   # cobre as ombreiras
pesc = pts_repouso({"neck_01"}); y_nuca = max(p.y for p in pesc) + 0.02; y_frente = min(p.y for p in pesc) - 0.03
coxa = pts_repouso({"thigh_l", "thigh_r"}); z_barra = min(p.z for p in coxa) + 0.55 * (max(p.z for p in coxa) - min(p.z for p in coxa))
print("capa: ombro", round(z_ombro, 3), "barra", round(z_barra, 3), "costas y", round(y_costas, 3), "larg", round(larg, 3))
T_DOBRA = 0.90                                                  # acima disto a capa vira por cima do ombro até a nuca
def ponto_capa(u, t, sobra=0.0):
    """u: de um lado ao outro (0..1); t: 0 = barra, 1 = gola na nuca; 'sobra' afasta para fora (faixa por cima)"""
    th = (u - 0.5) * math.pi * 0.70                            # curva em volta das costas (as bordas vêm para a frente)
    if t <= T_DOBRA:
        k = t / T_DOBRA
        largura = larg * (1 + (1 - k) * 0.30)                  # abre um pouco para baixo
        z = z_barra + k * (z_ombro - 0.045 - z_barra)
        y = y_costas - (1 - math.cos(th)) * largura * 0.5 + (1 - k) ** 1.5 * 0.14   # cai atrás, afastada das pernas
        y += 0.014 * math.sin(u * math.pi * 7) * (1 - k) + sobra
    else:                                                       # gola: sobe e vai para a frente até a nuca, por cima do ombro
        k = (t - T_DOBRA) / (1 - T_DOBRA)
        largura = larg * (1 - 0.25 * k)
        z = z_ombro - 0.045 + 0.045 * math.sin(k * math.pi / 2) + sobra
        y = y_costas + (y_nuca - y_costas) * k - (1 - math.cos(th)) * largura * 0.5 * (1 - k) + sobra * (1 - k)
    return Vector((math.sin(th) * largura, y, z))
def kd_armadura(nomes):
    """vértices (na pose atual, já deformados) das peças da couraça que a capa não pode atravessar"""
    dg = bpy.context.evaluated_depsgraph_get(); pts = []
    for n in nomes:
        ev = bpy.data.objects[n].evaluated_get(dg); me = ev.to_mesh()
        pts += [ev.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
    kd = KDTree(len(pts))
    for i, q in enumerate(pts): kd.insert(q, i)
    kd.balance(); return kd
KD_ARMADURA = kd_armadura(("peitoral", "ombreira_D", "ombreira_E", corpo.name))
def malha_capa(nome, t0, t1, materiais, sobra=0.0, espessura=0.014):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=12, y_subdivisions=max(3, round(20 * (t1 - t0))), size=1)
    o = bpy.context.object; o.name = nome
    for v in o.data.vertices:
        t = t0 + (v.co.y + 0.5) * (t1 - t0); q = ponto_capa(v.co.x + 0.5, t, sobra)
        # folga da armadura: afasta para trás (e para cima, na gola) até ficar a >= 2,5 cm da couraça/ombreiras
        sai = Vector((0, 1, 1.2 if t > T_DOBRA - 0.05 else 0.15)).normalized()
        for _ in range(40):
            _, _, dist = KD_ARMADURA.find(q)
            if dist >= 0.025 + sobra: break
            q += sai * 0.003
        v.co = q
    for p in o.data.polygons: p.use_smooth = True
    for m in materiais: o.data.materials.append(m)
    sl = o.modifiers.new("espessura", "SOLIDIFY"); sl.thickness = espessura; sl.material_offset = 1
    mw = o.matrix_world.copy(); o.parent = rig; o.parent_type = "BONE"; o.parent_bone = "spine_03"
    bpy.context.view_layer.update(); o.matrix_world = mw; mover_para(o, "capa"); return o
capa = malha_capa("capa_m", 0.0, 1.0, (TECIDO, TECIDO_ESC))
malha_capa("capa_gola", 0.955, 1.0, (ACENTO,), sobra=0.004, espessura=0.006)   # faixa laranja na gola, por cima dos ombros
peca_em("capa_fecho", "primitive_cube_add", (0, 0, 0), (0.07, 0.025, 0.045), ACO_CLARO, Matrix.Translation(Vector((0, y_frente, z_ombro - 0.03))), "spine_03", "capa", size=1)

# ---- ESPADA DE UMA MÃO: lâmina clara, guarda com acabamento laranja (acento), cabo de couro, pomo escuro
# referencial da espada: local -Z = sentido da lâmina (diagonal da palma); local X = largura da lâmina no plano vertical
# que contém a lâmina (faces chatas para os lados, fios para a frente/trás: nada de fio virado para cima)
_D = dir_espada("r"); _W = (Vector((0, 0, 1)) - _D * _D.z).normalized()
REF = Matrix((_W, (-_D).cross(_W), -_D)).transposed().to_4x4(); REF.translation = encaixe_mao("r").translation
COMP = 0.74   # lâmina leve de uma mão: estreita, afinando até uma ponta simétrica no eixo
def lamina_espada(nome, ref, osso, z0=-0.10):
    """lâmina numa malha só, seção em losango (fio dos dois lados, nervura no meio), afinando de forma contínua até a
    ponta, que fica exatamente no eixo da lâmina (sem peça separada: nada de 'seta' deslocada)"""
    # (fração do comprimento, meia-largura, meia-espessura da nervura)
    perfil = [(0.0, 0.031, 0.0085), (0.10, 0.030, 0.0082), (0.55, 0.026, 0.0072), (0.80, 0.022, 0.0062),
              (0.90, 0.016, 0.0050), (0.96, 0.008, 0.0032)]
    bm = bmesh.new(); aneis = []
    for fr, w, t in perfil:
        z = z0 - fr * COMP
        aneis.append([bm.verts.new((w, 0, z)), bm.verts.new((0, t, z)), bm.verts.new((-w, 0, z)), bm.verts.new((0, -t, z))])
    ponta = bm.verts.new((0, 0, z0 - COMP))
    for a, b in zip(aneis, aneis[1:]):
        for k in range(4): bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    for k in range(4): bm.faces.new((aneis[-1][k], aneis[-1][(k + 1) % 4], ponta))
    bm.faces.new(list(reversed(aneis[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    for f in me.polygons: f.use_smooth = False   # faces planas: o brilho marca a nervura e os fios
    o = bpy.data.objects.new(nome, me); cena.collection.objects.link(o); me.materials.append(LAMINA)
    o.matrix_world = ref
    mw = o.matrix_world.copy(); o.parent = rig; o.parent_type = "BONE"; o.parent_bone = osso
    bpy.context.view_layer.update(); o.matrix_world = mw
    mover_para(o, "espada"); return o
peca_em("cabo", "primitive_cylinder_add", (0, 0, 0.0), (1, 1, 1), COURO, REF, "hand_r", "espada", vertices=10, radius=0.018, depth=0.15)
peca_em("pomo", "primitive_uv_sphere_add", (0, 0, 0.088), (1, 1, 1), ACO_ESCURO, REF, "hand_r", "espada", bevel=0, segments=12, ring_count=8, radius=0.026)
peca_em("guarda", "primitive_cube_add", (0, 0, -0.088), (0.15, 0.026, 0.022), ACO_CLARO, REF, "hand_r", "espada", bevel=0.006, size=1)
peca_em("guarda_acab", "primitive_cube_add", (0, 0, -0.088), (0.158, 0.03, 0.009), ACENTO, REF, "hand_r", "espada", bevel=0, size=1)
lamina_espada("lamina", REF, "hand_r", z0=-0.099)

# ---- ESCUDO REDONDO no antebraço esquerdo: face de aço claro, umbo, aro, 4 placas laranja na borda; costas com alças de couro
ab0, ab1 = cabeca_mundo("lowerarm_l"), cabeca_mundo("hand_l")
fora_ = Vector((1, -0.55, 0)).normalized()                    # a face olha para fora e um pouco para a frente
centro_esc = ab0.lerp(ab1, 0.55) + fora_ * 0.075
zz_ = fora_; xx_ = Vector((0, 0, 1)).cross(zz_).normalized(); yy_ = zz_.cross(xx_)
REF_ESC = Matrix((xx_, yy_, zz_)).transposed().to_4x4(); REF_ESC.translation = centro_esc
RE = 0.27
peca_em("escudo_face", "primitive_cylinder_add", (0, 0, 0), (1, 1, 1), ACO, REF_ESC, "lowerarm_l", "escudo", vertices=28, radius=RE, depth=0.03)
peca_em("escudo_aro", "primitive_cylinder_add", (0, 0, 0.004), (1, 1, 1), ACO_CLARO, REF_ESC, "lowerarm_l", "escudo", vertices=28, radius=RE * 1.04, depth=0.026)
peca_em("escudo_umbo", "primitive_uv_sphere_add", (0, 0, 0.022), (1, 1, 0.55), ACO_CLARO, REF_ESC, "lowerarm_l", "escudo", bevel=0, liso=True, segments=16, ring_count=8, radius=0.07)
for k in range(4):
    a_ = k * math.pi / 2
    peca_em(f"escudo_placa_{k}", "primitive_cube_add", (math.cos(a_) * RE * 0.99, math.sin(a_) * RE * 0.99, 0.006), (0.05, 0.05, 0.036), ACENTO, REF_ESC @ Matrix.Rotation(a_, 4, "Z"), "lowerarm_l", "escudo", size=1)
for k, a_ in enumerate((0, math.pi / 2)):
    peca_em(f"escudo_alca_{k}", "primitive_cube_add", (0, 0, -0.024), (RE * 1.5, 0.045, 0.012), COURO, REF_ESC @ Matrix.Rotation(a_, 4, "Z"), "lowerarm_l", "escudo", size=1)

# ------------------------------------------------------------------ luz, câmera 45°, render
bpy.ops.object.light_add(type="SUN"); sol = bpy.context.object; sol.data.energy = 3.4
bpy.ops.object.light_add(type="SUN"); contra = bpy.context.object; contra.data.energy = 1.3
w = bpy.data.worlds.new("mundo"); cena.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.30, 0.30, 0.33, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.85
bpy.ops.object.camera_add(); cam = bpy.context.object; cena.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.4
for o in (sol, contra, cam): mover_para(o, "cena")
ALVO = Vector((0, 0, 0.5 * ALTURA + 0.05)); ELEV = math.radians(45)
AZIMUTE = {"se": -45, "ne": -135, "s": 0, "e": -90, "n": 180, "sw": 45, "w": 90, "nw": 135}  # personagem olha para -Y; SE = descendo para a direita da tela
def camera(d):
    a = math.radians(AZIMUTE[d])
    cam.location = ALVO + Vector((math.sin(a) * math.cos(ELEV) * 10, -math.cos(a) * math.cos(ELEV) * 10, math.sin(ELEV) * 10))
    cam.rotation_euler = (ALVO - cam.location).to_track_quat("-Z", "Y").to_euler()
    sol.rotation_euler = Euler((math.radians(48), 0, a - math.radians(35)), "XYZ")
    contra.rotation_euler = Euler((math.radians(-55), 0, a + math.radians(160)), "XYZ")
r = cena.render
motores = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
r.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in motores else "BLENDER_EEVEE_NEXT"
r.resolution_x = r.resolution_y = 512; r.film_transparent = True; r.filter_size = 0.6
cena.view_settings.view_transform = "Standard"

HOLD = bpy.data.materials.new("holdout"); HOLD.use_nodes = True; nt = HOLD.node_tree; nt.nodes.clear()
nt.links.new(nt.nodes.new("ShaderNodeHoldout").outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
BRANCO = bpy.data.materials.new("branco"); BRANCO.use_nodes = True; nt = BRANCO.node_tree; nt.nodes.clear()
em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (1, 1, 1, 1)
nt.links.new(em.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
ORIG = {o.name: [s.material for s in o.material_slots] for o in bpy.data.objects if o.type == "MESH"}
def restaurar():
    for o in bpy.data.objects:
        if o.name in ORIG:
            for s, m in zip(o.material_slots, ORIG[o.name]): s.material = m
def preparar(camada):
    restaurar()
    pc, acento = camada.replace("_acento", ""), camada.endswith("_acento")
    for nome in COLECOES:
        if nome == "cena": continue
        lc = bpy.context.view_layer.layer_collection.children[nome]
        if camada == "corpo": lc.exclude = nome != "corpo"; lc.holdout = False
        elif camada == "cabelo": lc.exclude = nome not in ("corpo", "cabelo"); lc.holdout = nome == "corpo"
        else: lc.exclude = nome not in ("corpo", pc); lc.holdout = nome == "corpo"
    if acento:
        for o in COLECOES[pc].objects:
            if o.type == "MESH":
                for s in o.material_slots: s.material = BRANCO if ORIG[o.name][0] is ACENTO else HOLD

PECAS = ["botas", "couraca", "capa", "elmo", "espada", "escudo"]
CAMADAS = ["corpo", "cabelo"] + [c for p_ in PECAS for c in (p_, p_ + "_acento")]
if "--exemplo" in argv:   # exemplo isolado para aprovação: volta de 360° na cabeça + corpo inteiro SE/NE (cor de acento laranja)
    restaurar()
    ACENTO.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (1.0, 0.33, 0.07, 1)
    mostrar = arg("--mostrar", "corpo,couraca,botas,escudo,elmo").split(",")
    for nome in COLECOES:
        if nome != "cena": lc = bpy.context.view_layer.layer_collection.children[nome]; lc.exclude = nome not in mostrar; lc.holdout = False
    os.makedirs(SAIDA, exist_ok=True)
    if arg("--anim"):   # quadros de uma ou mais animações (separadas por vírgula), cor cheia, nas direções pedidas
        for an in arg("--anim").split(","):
            for d in DIRS:
                camera(d)
                for i, pp in enumerate(POSES[an]):
                    pose(**pp); r.filepath = os.path.join(SAIDA, f"{an}_{d}_{i:02d}.png"); bpy.ops.render.render(write_still=True)
        print("ok exemplo"); sys.exit(0)
    pose(**IDLE[0])
    alvo_cab = (cabeca_mundo("head") + cauda_mundo("head")) / 2 + Vector((0, 0, -0.06))
    zoom_volta = 0.75
    if arg("--volta", "cabeca") == "corpo": alvo_cab = ALVO + Vector((0, 0, 0.10)); zoom_volta = 2.4
    if arg("--volta", "cabeca") == "espada":   # a espada sozinha, de perto, girando em volta do centro dela
        alvo_cab = REF @ Vector((0, 0, -0.30)); zoom_volta = 1.15
    if arg("--volta", "cabeca") == "mao": alvo_cab = cabeca_mundo("hand_r") + Vector((0, -0.12, -0.12)); zoom_volta = 1.0
    for k, az in enumerate(range(0, 360, 30)):
        a_ = math.radians(-45 - az); cam.data.ortho_scale = zoom_volta
        cam.location = alvo_cab + Vector((math.sin(a_) * math.cos(ELEV) * 6, -math.cos(a_) * math.cos(ELEV) * 6, math.sin(ELEV) * 6))
        cam.rotation_euler = (alvo_cab - cam.location).to_track_quat("-Z", "Y").to_euler()
        sol.rotation_euler = Euler((math.radians(48), 0, a_ - math.radians(35)), "XYZ")
        r.filepath = os.path.join(SAIDA, f"volta_{k:02d}.png"); bpy.ops.render.render(write_still=True)
    cam.data.ortho_scale = 2.4
    for d in ("se", "ne"):
        camera(d); r.filepath = os.path.join(SAIDA, f"corpo_{d}.png"); bpy.ops.render.render(write_still=True)
    print("ok exemplo"); sys.exit(0)
if "--close" in argv:
    restaurar()
    for nome in COLECOES:
        if nome != "cena": lc = bpy.context.view_layer.layer_collection.children[nome]; lc.exclude = False; lc.holdout = False
    os.makedirs(SAIDA, exist_ok=True)
    print("polegar (dist, r1, r2, curl):", POLEGAR.get("r"))
    for nome_pose, pp in (("idle", IDLE[0]), ("walk1", WALK[0]), ("walk4", WALK[3])):  # walk4 = fase 3/8
        pose(**pp)
        for az in (-45, -90, 0, -135):
            for zoom, centro in ((0.55, cabeca_mundo("hand_r")), (1.1, cabeca_mundo("upperarm_r")), (2.5, ALVO)):
                a_ = math.radians(az); cam.data.ortho_scale = zoom
                cam.location = centro + Vector((math.sin(a_) * math.cos(ELEV) * 6, -math.cos(a_) * math.cos(ELEV) * 6, math.sin(ELEV) * 6))
                cam.rotation_euler = (centro - cam.location).to_track_quat("-Z", "Y").to_euler()
                sol.rotation_euler = Euler((math.radians(48), 0, a_ - math.radians(35)), "XYZ")
                r.filepath = os.path.join(SAIDA, f"close_{nome_pose}_az{az}_{'mao' if zoom < 1 else ('braco' if zoom < 2 else 'corpo')}.png"); bpy.ops.render.render(write_still=True)
    print("ok close"); sys.exit(0)
for d in DIRS:
    camera(d)
    for anim in ANIMS:
        for i, p in enumerate(POSES[anim]):
            pose(**p)
            for cm in CAMADAS:
                preparar(cm); os.makedirs(os.path.join(SAIDA, cm), exist_ok=True)
                r.filepath = os.path.join(SAIDA, cm, f"{anim}_{d}_{i + 1:02d}.png"); bpy.ops.render.render(write_still=True)
            print("frame", d, anim, i + 1, flush=True)
restaurar()
if "--salvar-blend" in argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), "personagem_mh.blend"))
print("ok")
