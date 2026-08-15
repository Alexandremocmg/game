import { FIXED_DT, MAX_FRAME_TIME } from '../config';

/**
 * Laço com passo fixo e acumulador.
 *
 * A simulação sempre avança em fatias de FIXED_DT, independente da taxa de
 * atualização da tela. Sem isto o mesmo jogo fica mensuravelmente mais difícil
 * num aparelho de 120Hz do que num de 60Hz. O render recebe `alpha`, a fração
 * de passo restante no acumulador, para interpolar a pose desenhada.
 */
export class Loop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  /** Média móvel do FPS, exposta para o HUD de debug. */
  fps = 0;

  constructor(
    private readonly step: (dt: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now() / 1000;
    this.acc = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const now = nowMs / 1000;
    let frame = now - this.last;
    this.last = now;

    if (frame > 0) this.fps += (1 / frame - this.fps) * 0.1;
    if (frame > MAX_FRAME_TIME) frame = MAX_FRAME_TIME;

    this.acc += frame;
    while (this.acc >= FIXED_DT) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
    }

    this.render(this.acc / FIXED_DT);
  };
}
