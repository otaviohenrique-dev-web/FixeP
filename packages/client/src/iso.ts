/**
 * Projeção do chão (fonte única). A câmera olha o chão inclinada a ~45° (estilo Albion):
 * o tile quadrado do mundo vira um losango de 64 x 46 px (a 45° exatos seria 64 x 45,25; 46 deixa a metade inteira e o traço nítido).
 * Antes era 64 x 32 (isométrico 2:1, ~30°). Tudo que desenha no plano do chão (losangos, círculos, sombras, anéis)
 * usa estas constantes, para o ângulo mudar num lugar só.
 *
 * Eixos: +x (grade) aponta para baixo-direita (HX, HY); +y aponta para baixo-esquerda (-HX, HY).
 */
export const TILE_W = 64;
export const TILE_H = 46;
/** meio tile: os vetores de um passo na grade, em pixels de tela */
export const HX = TILE_W / 2;
export const HY = TILE_H / 2;
/** achatamento de um círculo deitado no chão (altura / largura). 2:1 era 0,5 */
export const ISO_K = TILE_H / TILE_W;
/** altura no chão de algo que tem `w` de largura (para elipses, anéis e sombras) */
export const chaoH = (w: number) => w * ISO_K;
