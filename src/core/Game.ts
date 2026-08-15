import * as THREE from 'three';
import {
  BOARD_INVULN_TIME, CAMERA_FOV, CAMERA_FOV_SPEED_BONUS, CAMERA_LATERAL_FOLLOW, CAMERA_LOOK,
  MAGNET_COIN_RANGE_Z, MULTIPLIER_FACTOR, POWERUP_PICKUP_HALF_Z,
  SCORE_PER_UNIT, SHAKE_DECAY, SHAKE_IMPULSE, SPEED_BASE, SPEED_MAX, SPEED_TAU,
} from '../config';
import { checkCollision, checkNearMiss } from '../player/Collision';
import { Player } from '../player/Player';
import { Post } from '../render/Post';
import { Stage } from '../render/Stage';
import { Hud } from '../ui/Hud';
import { OBSTACLE_SPECS, type ObstacleKind } from '../world/obstacleSpecs';
import { POWER_UP_SPECS, type PowerUpKind } from '../world/powerUpSpecs';
import { Scenery } from '../world/Scenery';
import { Spawner } from '../world/Spawner';
import { Track } from '../world/Track';
import { FIXED_DT } from '../config';
import { AudioBus } from './Audio';
import { Input } from './Input';
import { Loop } from './Loop';

type State = 'ready' | 'playing' | 'dead';

const BEST_KEY = 'endless-runner:best';
const TOTAL_COINS_KEY = 'endless-runner:total-coins';
const REVIVE_COST = 20;
/** Carência após a morte: impede que o swipe que matou já reinicie a partida. */
const RESTART_DELAY = 0.7;

export class Game {
  readonly stage: Stage;
  private readonly post: Post;
  private readonly track: Track;
  private readonly scenery: Scenery;
  private readonly spawner: Spawner;
  private readonly player: Player;
  private readonly hud = new Hud();
  private readonly input = new Input();
  private readonly audio = new AudioBus();
  private readonly loop: Loop;

  private state: State = 'ready';
  private elapsed = 0;
  private distance = 0;
  private speed = SPEED_BASE;
  private coins = 0;
  private totalCoins = Number(localStorage.getItem(TOTAL_COINS_KEY) ?? 0);
  private hasRevivedThisRun = false;
  /** Pontuação como acumulador próprio — nunca deriva de `distance`, que só
   *  dirige velocidade e desbloqueio de tier (ver extensão de power-ups no plano). */
  private scoreValue = 0;
  private deadTimer = 0;
  private best = Number(localStorage.getItem(BEST_KEY) ?? 0);

  private camX = 0;
  private fov = CAMERA_FOV;
  /** Deslocamento restante do tremor de "quase-acerto", decaindo a cada passo. */
  private shake = 0;

  // -------------------------------------------------------------- power-ups
  private magnetTimer = 0;
  private jetpackTimer = 0;
  private multiplierTimer = 0;
  private hasBoard = false;

  constructor(
    canvas: HTMLCanvasElement,
    models: Partial<Record<ObstacleKind, THREE.Object3D>> = {},
    powerUpModels: Partial<Record<PowerUpKind, THREE.Object3D>> = {},
    playerModel?: { scene: THREE.Group; animations: THREE.AnimationClip[] } | null,
  ) {
    this.stage = new Stage(canvas);
    this.post = new Post(this.stage.renderer, this.stage.scene, this.stage.camera);
    this.track = new Track(this.stage.scene);
    this.scenery = new Scenery(this.stage.scene);
    this.spawner = new Spawner(this.stage.scene, 1, models, powerUpModels);
    this.player = new Player(this.stage.scene, playerModel);

    this.input.attach(canvas);
    this.input.onAnyInput = () => this.onAnyInput();
    window.addEventListener('resize', () => {
      this.stage.resize();
      this.post.resize(window.innerWidth, window.innerHeight);
    });

    this.loop = new Loop((dt) => this.step(dt), (alpha) => this.render(alpha));
    this.showReady();
    this.loop.start();
  }

  private get score(): number {
    return this.scoreValue;
  }

  // ------------------------------------------------------ máquina de estados

  private onAnyInput(): void {
    // Mesmo gesto que inicia/reinicia o jogo desbloqueia o áudio — navegadores
    // não deixam tocar som antes de uma interação real do usuário.
    this.audio.unlock();
    if (this.state === 'ready') this.start();
    else if (this.state === 'dead' && this.deadTimer >= RESTART_DELAY) this.start();
  }

  private showReady(): void {
    this.state = 'ready';
    this.player.setIdle();
    this.hud.showOverlay(
      'CORRIDA SEM FIM',
      `<p>Deslize para desviar</p>
       <ul>
         <li><b>←</b> / <b>→</b> &nbsp;trocar de pista</li>
         <li><b>↑</b> &nbsp;pular</li>
         <li><b>↓</b> &nbsp;rolar</li>
       </ul>
       <p style="margin-top:6px; font-size:14px; opacity:.9;">Saldo: ${this.totalCoins} moedas 🟡</p>
       <p class="cta">toque para começar</p>`,
    );
  }

  private start(): void {
    this.state = 'playing';
    this.elapsed = 0;
    this.distance = 0;
    this.speed = SPEED_BASE;
    this.coins = 0;
    this.scoreValue = 0;
    this.deadTimer = 0;
    this.hasRevivedThisRun = false;
    this.magnetTimer = 0;
    this.jetpackTimer = 0;
    this.multiplierTimer = 0;
    this.hasBoard = false;
    this.player.reset();
    this.spawner.reset();
    this.input.clear();
    this.hud.hideOverlay();
  }

  private revive(): void {
    if (this.totalCoins < REVIVE_COST || this.hasRevivedThisRun) return;

    this.totalCoins -= REVIVE_COST;
    localStorage.setItem(TOTAL_COINS_KEY, String(this.totalCoins));
    this.hasRevivedThisRun = true;

    this.state = 'playing';
    this.deadTimer = 0;
    this.player.reset();
    this.player.grantInvulnerability(2.5);
    this.spawner.clearAhead(18);
    this.input.clear();
    this.hud.hideOverlay();
    this.audio.play('powerup');
  }

  /** Vida extra da prancha: absorve uma colisão em vez de matar. */
  private consumeBoard(): void {
    this.hasBoard = false;
    this.player.grantInvulnerability(BOARD_INVULN_TIME);
    this.audio.play('crash', { volume: 0.4 });
  }

  private applyPowerUp(kind: PowerUpKind): void {
    this.audio.play('powerup');
    const duration = POWER_UP_SPECS[kind].duration;
    switch (kind) {
      case 'magnet': this.magnetTimer = duration; break;
      case 'multiplier': this.multiplierTimer = duration; break;
      case 'board': this.hasBoard = true; break;
      case 'jetpack':
        this.jetpackTimer = duration;
        this.player.setFlying(true);
        break;
    }
  }

  /** Decai os 3 timers de efeito e reage à borda de descida do jetpack (desliga o voo). */
  private updatePowerUpTimers(dt: number): void {
    if (this.magnetTimer > 0) this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    if (this.multiplierTimer > 0) this.multiplierTimer = Math.max(0, this.multiplierTimer - dt);
    if (this.jetpackTimer > 0) {
      this.jetpackTimer -= dt;
      if (this.jetpackTimer <= 0) {
        this.jetpackTimer = 0;
        this.player.setFlying(false);
      }
    }
  }

  kill(): void {
    if (this.state !== 'playing') return;
    if (this.hasBoard) { this.consumeBoard(); return; }

    this.state = 'dead';
    this.deadTimer = 0;
    this.player.playHit();
    this.audio.play('crash');

    const final = Math.floor(this.score);
    const record = final > this.best;
    if (record) {
      this.best = final;
      localStorage.setItem(BEST_KEY, String(final));
    }

    const canRevive = !this.hasRevivedThisRun && this.totalCoins >= REVIVE_COST;
    const reviveBtnHtml = canRevive
      ? `<br/><button id="btn-revive" class="overlay-btn"><span>CONTINUAR</span> (${REVIVE_COST} 🟡)</button>`
      : '';

    this.hud.showOverlay(
      record ? 'NOVO RECORDE' : 'FIM DE JOGO',
      `<p class="big">${final}</p>
       <p>recorde ${Math.floor(this.best)} &nbsp;·&nbsp; ${this.coins} moedas nesta corrida</p>
       <p style="margin-top:4px; font-size:14px; opacity:.9;">Saldo total: ${this.totalCoins} moedas 🟡</p>
       ${reviveBtnHtml}
       <p class="cta" style="margin-top:12px;">toque para jogar de novo</p>`,
      canRevive ? () => this.revive() : undefined,
    );
  }

  // -------------------------------------------------------------------- debug

  /**
   * Avança a simulação sem depender de requestAnimationFrame.
   * Existe para verificação automatizada: permite rodar N passos determinísticos
   * e conferir o estado resultante sem depender da aba estar visível.
   */
  debugTick(steps: number): void {
    for (let i = 0; i < steps; i++) this.step(FIXED_DT);
    this.render(0);
  }

  get debugState() {
    const info = this.stage.renderer.info.render;
    return {
      state: this.state,
      fps: this.loop.fps,
      speed: this.speed,
      distance: this.distance,
      score: this.score,
      coins: this.coins,
      best: this.best,
      player: {
        lane: this.player.lane,
        x: this.player.x,
        y: this.player.y,
        state: this.player.state,
      },
      draws: info.calls,
      triangles: info.triangles,
      chunkZs: this.track.debugZs,
      postEnabled: this.post.enabled,
      shake: this.shake,
      powerUps: {
        magnetTimer: this.magnetTimer,
        jetpackTimer: this.jetpackTimer,
        multiplierTimer: this.multiplierTimer,
        hasBoard: this.hasBoard,
        flying: this.player.state === 'fly',
        invulnerable: this.player.invulnerable,
      },
    };
  }

  /** Injeta uma ação como se tivesse vindo de um swipe. */
  debugAction(action: 'left' | 'right' | 'jump' | 'roll'): void {
    this.input.debugPush(action);
  }

  /** Ativa um power-up artificialmente, sem depender de um pickup no mundo — para verificação dirigida por efeito. */
  debugApplyPowerUp(kind: PowerUpKind): void {
    this.applyPowerUp(kind);
  }

  /**
   * Bot reativo para teste de "vencibilidade": olha o obstáculo mais próximo
   * na própria pista e decide pular, rolar ou trocar de pista com folga.
   * Roda inteiramente dentro de um único passo de JS — sem cruzar a
   * fronteira do navegador a cada frame — para poder simular minutos de
   * corrida em segundos.
   */
  debugAutoplay(maxSeconds: number, seed?: number): {
    died: boolean; distanceAtDeath: number; steps: number; finalDistance: number; finalSpeed: number;
  } {
    this.start();
    if (seed !== undefined) this.spawner.reset(seed);
    const maxSteps = Math.round(maxSeconds / FIXED_DT);
    let steps = 0;
    let died = false;
    let distanceAtDeath = -1;

    for (; steps < maxSteps; steps++) {
      if (this.state === 'dead') { died = true; distanceAtDeath = this.distance; break; }

      const decision = this.decideBotAction();
      if (decision) this.input.debugPush(decision);

      this.step(FIXED_DT);
    }

    this.render(0);
    return { died, distanceAtDeath, steps, finalDistance: this.distance, finalSpeed: this.speed };
  }

  /**
   * Z negativo = ainda à frente (não alcançado); Z cresce rumo a 0 conforme
   * o obstáculo se aproxima; Z positivo = já passou. "Mais perto" portanto
   * é o maior Z dentre os que ainda não passaram.
   */
  private decideBotAction(): 'left' | 'right' | 'jump' | 'roll' | null {
    const lookahead = this.speed * 0.55 + 4; // distância de reação com folga
    let closest: { kind: string; lane: number; z: number } | null = null;

    for (const o of this.spawner.nearbyObstacles(lookahead)) {
      if (o.z > 0.3) continue; // já passou
      if (o.lane !== this.player.lane) continue;
      if (!closest || o.z > closest.z) closest = o;
    }
    if (!closest) return this.nearestSafePowerUp(lookahead);

    // O comprimento do próprio obstáculo entra na conta: um trem (halfDepth=7)
    // já é capaz de colidir bem antes de z chegar perto de 0.
    const halfDepth = OBSTACLE_SPECS[closest.kind as keyof typeof OBSTACLE_SPECS].halfDepth;
    const triggerZ = this.speed * 0.22 + 1.2 + halfDepth;
    if (closest.z < -triggerZ) return this.nearestSafePowerUp(lookahead); // ainda longe, espera

    if (closest.kind === 'low') return 'jump';
    if (closest.kind === 'gate') return 'roll';
    // block/train: sai para a pista livre mais próxima do centro
    const order = this.player.lane === 0 ? [1, 2] : this.player.lane === 2 ? [1, 0] : [0, 2];
    for (const lane of order) {
      if (!this.isLaneDangerous(lane, lookahead, triggerZ + 6)) return lane < this.player.lane ? 'left' : 'right';
    }
    return null;
  }

  /**
   * Um obstáculo é perigoso numa pista se sua extensão inteira — não só o
   * centro — ainda cobre ou vai cobrir a posição do jogador em breve. Usar
   * só `o.z` (o centro) subestima obstáculos longos como o trem: o centro
   * já pode ter passado de z=0 enquanto a cauda (halfDepth=7) ainda cobre o
   * jogador — foi exatamente esse o bug que fez o bot desviar para dentro
   * de um trem ao ir atrás de um power-up (ver histórico da extensão).
   */
  private isLaneDangerous(lane: number, range: number, reactionZ: number): boolean {
    return [...this.spawner.nearbyObstacles(range)].some((o) => {
      if (o.lane !== lane || o.kind === 'low' || o.kind === 'gate') return false;
      const h = OBSTACLE_SPECS[o.kind].halfDepth;
      return (o.z - h) <= 0.3 && (o.z + h) >= -reactionZ;
    });
  }

  /**
   * Sem obstáculo urgente à frente, o bot desvia até um power-up próximo em
   * outra pista — uma pista por vez, só se a pista alvo estiver livre de
   * obstáculo perigoso no momento. Existe só para exercitar os 4 efeitos
   * durante a bateria automatizada; não é necessário para sobreviver.
   */
  private nearestSafePowerUp(range: number): 'left' | 'right' | null {
    let best: { lane: number; z: number } | null = null;
    for (const p of this.spawner.nearbyPowerUps(range)) {
      if (p.z > 0.3) continue; // já passou
      if (p.lane === this.player.lane) continue; // já vai coletar sozinho, sem desviar
      if (!best || p.z > best.z) best = p;
    }
    if (!best) return null;

    const targetLane = best.lane > this.player.lane ? this.player.lane + 1 : this.player.lane - 1;
    const reactionZ = this.speed * 0.22 + 1.2 + 6;
    if (this.isLaneDangerous(targetLane, range, reactionZ)) return null;

    return targetLane < this.player.lane ? 'left' : 'right';
  }

  // ---------------------------------------------------------------- simulação

  private step(dt: number): void {
    this.input.advance(dt);

    if (this.state === 'playing') {
      this.elapsed += dt;
      // Curva assintótica: sobe rápido no começo e satura, então a corrida
      // fica tensa sem nunca virar impossível.
      this.speed = SPEED_BASE + (SPEED_MAX - SPEED_BASE) * (1 - Math.exp(-this.elapsed / SPEED_TAU));
      this.player.update(dt, this.input);
      this.distance += this.speed * dt;
      // Acumulador próprio — nunca deriva de `distance`, senão o multiplicador
      // distorceria a curva de velocidade e o desbloqueio de tier junto com a pontuação.
      this.scoreValue += this.speed * dt * SCORE_PER_UNIT * (this.multiplierTimer > 0 ? MULTIPLIER_FACTOR : 1);

      this.updatePowerUpTimers(dt);

      if (this.player.consumeJumpEvent()) this.audio.play('jump');
      if (this.player.consumeRollEvent()) this.audio.play('roll', { volume: 0.6 });

      if (checkCollision(this.player, this.spawner)) {
        this.kill();
      } else {
        // Faixa vertical de coleta: o topo cai um pouco quando rolando, para
        // exigir o mesmo timing que a colisão já exige do obstáculo baixo.
        const yTop = this.player.hitY1 + 0.3;
        const magnetActive = this.magnetTimer > 0;
        const collected = this.spawner.collectCoins(
          this.player.lane,
          magnetActive ? -MAGNET_COIN_RANGE_Z : -0.9,
          magnetActive ? MAGNET_COIN_RANGE_Z : 0.9,
          (y) => magnetActive || (y >= this.player.hitY0 - 0.3 && y <= yTop),
          magnetActive,
        );
        if (collected > 0) {
          this.coins += collected;
          this.totalCoins += collected;
          localStorage.setItem(TOTAL_COINS_KEY, String(this.totalCoins));
          this.audio.play('coin', { rate: 1 + Math.random() * 0.15 });
        }

        const pickedUp = this.spawner.collectPowerUps(
          this.player.lane, -POWERUP_PICKUP_HALF_Z, POWERUP_PICKUP_HALF_Z,
        );
        for (const kind of pickedUp) this.applyPowerUp(kind);

        if (checkNearMiss(this.player, this.spawner)) this.shake = SHAKE_IMPULSE;
      }
    } else if (this.state === 'dead') {
      this.speed = Math.max(0, this.speed - SPEED_MAX * 1.8 * dt);
      this.deadTimer += dt;
    } else {
      this.speed = SPEED_BASE * 0.4; // mundo rolando devagar atrás do menu
    }

    this.shake = Math.max(0, this.shake - SHAKE_DECAY * dt);

    const dz = this.speed * dt;
    this.track.update(dz);
    this.scenery.update(dz);
    this.spawner.update(dz, this.distance);

    // Câmera suavizada aqui, e não no render, para não depender da taxa de quadros.
    const targetCamX = this.player.x * CAMERA_LATERAL_FOLLOW;
    this.camX += (targetCamX - this.camX) * Math.min(1, dt * 9);

    const ramp = THREE.MathUtils.clamp((this.speed - SPEED_BASE) / (SPEED_MAX - SPEED_BASE), 0, 1);
    const targetFov = CAMERA_FOV + CAMERA_FOV_SPEED_BONUS * ramp;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 2);
  }

  // ------------------------------------------------------------------- render

  private render(alpha: number): void {
    this.player.syncVisual(alpha);

    // Tremor de quase-acerto: ruído pequeno e independente por eixo, some em ~150ms.
    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * 2 * this.shake : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * 2 * this.shake : 0;

    const cam = this.stage.camera;
    cam.position.x = this.camX + shakeX;
    if (Math.abs(cam.fov - this.fov) > 0.005) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(this.camX, CAMERA_LOOK[1] + shakeY, CAMERA_LOOK[2]);

    const dt = this.loop.fps > 0 ? 1 / this.loop.fps : FIXED_DT;
    this.post.probe(this.loop.fps, dt);
    this.stage.renderer.info.reset();
    if (this.post.enabled) this.post.render(dt); else this.stage.render();

    this.hud.update(this.score, this.coins);
    this.hud.updatePowerUps({
      magnetTimer: this.magnetTimer,
      jetpackTimer: this.jetpackTimer,
      multiplierTimer: this.multiplierTimer,
      hasBoard: this.hasBoard,
    });

    if (this.hud.debugEnabled) {
      const info = this.stage.renderer.info.render;
      this.hud.setDebug(
        `${this.loop.fps.toFixed(0)} fps · ${info.calls} draws · ` +
        `${(info.triangles / 1000).toFixed(1)}k tris · ${this.speed.toFixed(1)} u/s`,
      );
    }
  }
}
