import { INPUT_BUFFER_TIME, SWIPE_MIN_DISTANCE, SWIPE_MAX_TIME } from '../config';

export type Action = 'left' | 'right' | 'jump' | 'roll';

interface Buffered {
  action: Action;
  age: number;
}

/**
 * Swipe por pointer events + teclado, com buffer de perdão.
 *
 * O buffer é a peça que faz o controle parecer justo: um swipe disparado
 * pouco antes de o jogador poder agir (ainda no ar, ou no meio de uma troca
 * de pista) não é descartado — fica guardado por INPUT_BUFFER_TIME e é
 * consumido assim que a ação vira possível.
 */
export class Input {
  private queue: Buffered[] = [];
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private tracking = false;
  private detached: Array<() => void> = [];

  /** Disparado por qualquer toque ou tecla — usado para iniciar/reiniciar o jogo. */
  onAnyInput: (() => void) | null = null;

  attach(target: HTMLElement): void {
    const down = (e: PointerEvent) => {
      this.tracking = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startTime = performance.now() / 1000;
      this.onAnyInput?.();
    };

    const up = (e: PointerEvent) => {
      if (!this.tracking) return;
      this.tracking = false;

      const elapsed = performance.now() / 1000 - this.startTime;
      if (elapsed > SWIPE_MAX_TIME) return;

      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.max(absX, absY) < SWIPE_MIN_DISTANCE) return;

      // O eixo dominante vence — evita que um swipe diagonal dispare duas ações.
      if (absX > absY) this.push(dx > 0 ? 'right' : 'left');
      else this.push(dy > 0 ? 'roll' : 'jump');
    };

    const cancel = () => {
      this.tracking = false;
    };

    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const action = KEY_MAP[e.code];
      this.onAnyInput?.();
      if (!action) return;
      e.preventDefault();
      this.push(action);
    };

    target.addEventListener('pointerdown', down);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);

    this.detached = [
      () => target.removeEventListener('pointerdown', down),
      () => target.removeEventListener('pointerup', up),
      () => target.removeEventListener('pointercancel', cancel),
      () => window.removeEventListener('keydown', key),
    ];
  }

  dispose(): void {
    for (const off of this.detached) off();
    this.detached = [];
  }

  private push(action: Action): void {
    // Fila curta: guardar mais de duas intenções vira controle "fantasma".
    if (this.queue.length >= 2) this.queue.shift();
    this.queue.push({ action, age: 0 });
  }

  /** Envelhece o buffer e descarta o que expirou. Chamar uma vez por passo fixo. */
  advance(dt: number): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const entry = this.queue[i]!;
      entry.age += dt;
      if (entry.age > INPUT_BUFFER_TIME) this.queue.splice(i, 1);
    }
  }

  /** Retira e devolve a intenção mais antiga ainda válida. */
  consume(): Action | null {
    return this.queue.shift()?.action ?? null;
  }

  /** Devolve a intenção mais antiga sem retirá-la da fila. */
  peek(): Action | null {
    return this.queue[0]?.action ?? null;
  }

  clear(): void {
    this.queue.length = 0;
  }

  /** Injeta uma ação direto na fila. Usado pela verificação automatizada. */
  debugPush(action: Action): void {
    this.push(action);
  }
}

const KEY_MAP: Record<string, Action | undefined> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'roll',
  KeyS: 'roll',
};
