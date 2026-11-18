/** true quando o foco está num campo de texto (chat): os atalhos do jogo (I, B, F3, Q, W, E, R...) não podem agir. */
export function isTypingTarget(): boolean {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a.isContentEditable);
}
