import type { PowerUpKind } from '../world/powerUpSpecs';

interface PowerUpHudState {
  magnetTimer: number;
  jetpackTimer: number;
  multiplierTimer: number;
  hasBoard: boolean;
}

/** Duração de cada efeito, só para calcular a fração da barra — não é fonte de verdade de gameplay. */
const FULL_DURATION: Record<Exclude<PowerUpKind, 'board'>, number> = {
  magnet: 9,
  jetpack: 7,
  multiplier: 10,
};

/** HUD em DOM sobre o canvas — muito mais barato que desenhar texto em WebGL. */
export class Hud {
  private readonly score = must('hud-score');
  private readonly coins = must('hud-coins');
  private readonly debug = must('hud-debug');
  private readonly overlay = must('overlay');
  private readonly overlayTitle = must('overlay-title');
  private readonly overlayBody = must('overlay-body');

  private readonly puMagnet = powerUpChip('pu-magnet');
  private readonly puJetpack = powerUpChip('pu-jetpack');
  private readonly puMultiplier = powerUpChip('pu-multiplier');
  private readonly puBoard = must('pu-board');

  /** Ligado por `?debug` na URL. */
  readonly debugEnabled = new URLSearchParams(location.search).has('debug');

  constructor() {
    this.debug.style.display = this.debugEnabled ? 'block' : 'none';
  }

  update(score: number, coins: number): void {
    this.score.textContent = String(Math.floor(score));
    this.coins.textContent = String(coins);
  }

  /** Mostra/esconde cada chip e anima a barra proporcional ao tempo restante. */
  updatePowerUps(state: PowerUpHudState): void {
    setChip(this.puMagnet, state.magnetTimer, FULL_DURATION.magnet);
    setChip(this.puJetpack, state.jetpackTimer, FULL_DURATION.jetpack);
    setChip(this.puMultiplier, state.multiplierTimer, FULL_DURATION.multiplier);
    this.puBoard.classList.toggle('active', state.hasBoard);
  }

  setDebug(text: string): void {
    if (this.debugEnabled) this.debug.textContent = text;
  }

  showOverlay(title: string, body: string): void {
    this.overlayTitle.textContent = title;
    this.overlayBody.innerHTML = body;
    this.overlay.classList.remove('hidden');
  }

  hideOverlay(): void {
    this.overlay.classList.add('hidden');
  }
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} não encontrado no HTML`);
  return el;
}

function powerUpChip(id: string): { root: HTMLElement; fill: HTMLElement } {
  const root = must(id);
  const fill = root.querySelector<HTMLElement>('.pu-fill');
  if (!fill) throw new Error(`chip #${id} sem .pu-fill`);
  return { root, fill };
}

function setChip(chip: { root: HTMLElement; fill: HTMLElement }, timer: number, fullDuration: number): void {
  const active = timer > 0;
  chip.root.classList.toggle('active', active);
  if (active) chip.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, timer / fullDuration))})`;
}
