import * as THREE from 'three';
import {
  COLOR_PLAYER, GRAVITY, HITBOX_FORGIVENESS, JETPACK_HEIGHT, JETPACK_TRANSITION_SPEED,
  JUMP_AIRTIME, JUMP_VELOCITY, LANE_CHANGE_TIME, LANE_X, PLAYER_HEIGHT, PLAYER_RADIUS,
  PLAYER_ROLL_HEIGHT, ROLL_TIME,
} from '../config';
import type { Input } from '../core/Input';
import { makeBlobShadowTexture } from '../render/geometry';

export type PlayerState = 'run' | 'jump' | 'roll' | 'fly';

interface ClipeConfig {
  /** Trecho do nome do clipe no GLB. */
  nome: string;
  /** Fração do clipe realmente usada, [início, fim]. Sem isto usa-se o clipe inteiro em loop. */
  janela?: [number, number];
  /** Duração da ação no jogo, em segundos — a janela é esticada/comprimida para caber nela. */
  duracaoNoJogo?: number;
  /** Congela numa fração do clipe em vez de tocar (pose estática). */
  congelarEm?: number;
}

/**
 * Clipes vindos do Mixamo (mocap real). Ver `setupAnimations` para o porquê
 * das janelas — foram medidas pela pose real dos ossos, não estimadas.
 */
const CLIPES: Record<PlayerState, ClipeConfig> = {
  run: { nome: 'run' },
  jump: { nome: 'jump', janela: [0.15, 0.95], duracaoNoJogo: JUMP_AIRTIME },
  // Começa em 22%, já com o corpo descendo: a hitbox encolhe no instante do
  // comando, então entrar pelo agachamento inicial deixaria o visual em pé
  // enquanto a colisão já diz que passa por baixo.
  roll: { nome: 'slide', janela: [0.22, 0.62], duracaoNoJogo: ROLL_TIME },
  // Clipe próprio de queda (Falling Idle), em loop — antes o voo reaproveitava
  // o ápice do pulo congelado, uma pose estática.
  fly: { nome: 'fall' },
};

/**
 * Estado e física do jogador.
 *
 * A simulação anda em passo fixo e guarda a pose anterior; `syncVisual`
 * interpola entre as duas na hora de desenhar, para que o movimento continue
 * suave numa tela de 120Hz sem que a física rode mais vezes.
 */
export class Player {
  readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly shadow: THREE.Mesh;

  lane = 1;
  private laneFrom = 1;
  private laneT = 1;

  x = 0;
  y = 0;
  private prevX = 0;
  private prevY = 0;
  private vy = 0;
  private grounded = true;
  private rollTimer = 0;
  private runCycle = 0;

  state: PlayerState = 'run';
  /** Posição horizontal já interpolada — a câmera segue esta, não `x`. */
  visualX = 0;

  /** Dispara true no frame em que a ação começou de fato — não a cada frame no estado. */
  private jumpEvent = false;
  private rollEvent = false;

  /** Jetpack ativo — física normal (gravidade, pulo, rolamento) fica em pausa. */
  private flying = false;
  /**
   * Descida controlada pós-jetpack (mesma aproximação exponencial da subida,
   * alvo y=0). Sem isto o jogador cairia por gravidade normal desde
   * JETPACK_HEIGHT — uma queda bem mais alta e lenta que um pulo comum, tempo
   * de sobra para um `gate` aparecer no meio do caminho sem chance real de
   * reagir (rolar no ar não muda a hitbox, é regra do design original).
   * Mantém invulnerabilidade até tocar o chão.
   */
  private landing = false;
  /** i-frames pós-prancha, em segundos restantes. */
  private invulnTimer = 0;

  private mixer?: THREE.AnimationMixer;
  private actions: Partial<Record<PlayerState, THREE.AnimationAction>> = {};
  private currentAction?: THREE.AnimationAction;
  private customModel?: THREE.Group;
  /** Escala uniforme calculada uma vez (altura do modelo → PLAYER_HEIGHT) — `syncVisual` parte dela para o squash do rolamento. */
  private baseModelScale = 1;

  constructor(
    scene: THREE.Scene,
    playerModel?: { scene: THREE.Group; animations: THREE.AnimationClip[] } | null,
  ) {
    const capsuleLength = PLAYER_HEIGHT - PLAYER_RADIUS * 2;
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER_RADIUS, capsuleLength, 4, 12),
      new THREE.MeshLambertMaterial({ color: COLOR_PLAYER }),
    );
    this.body.position.y = PLAYER_HEIGHT / 2;
    this.group.add(this.body);

    if (playerModel) {
      this.setCustomModel(playerModel);
    }

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({
        map: makeBlobShadowTexture(),
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.shadow);

    scene.add(this.group);
  }

  setCustomModel(playerModel: { scene: THREE.Group; animations: THREE.AnimationClip[] }): void {
    if (this.customModel) {
      this.group.remove(this.customModel);
    }
    this.body.visible = false;
    this.customModel = playerModel.scene;

    // Ajusta escala e alinhamento do modelo para encaixar na altura do jogador.
    // A escala fica guardada (não só aplicada) porque `syncVisual` a reaplica
    // a cada frame junto com o squash do rolamento.
    const box = new THREE.Box3().setFromObject(this.customModel);
    const size = new THREE.Vector3();
    box.getSize(size);
    this.baseModelScale = size.y > 0 ? PLAYER_HEIGHT / size.y : 1;
    this.customModel.scale.setScalar(this.baseModelScale);
    // O rig do Mixamo encara +Z, então 180° o vira para -Z, que é a direção em
    // que a pista corre — o jogador aparece de costas. (Cada rig tem sua própria
    // convenção: o do Tripo encarava +X e pedia 90°. Conferido renderizando o
    // modelo e olhando de que lado fica o rosto, não deduzido do root motion.)
    this.customModel.rotation.y = Math.PI;
    // A bounding sphere de um SkinnedMesh é calculada uma vez a partir da bind
    // pose e nunca é recalculada conforme os ossos se movem — com culling
    // ligado, a animação de corrida move a malha pra fora dessa esfera
    // desatualizada e o Three.js some com o personagem em certos ângulos de
    // câmera. Sem isto o jogador simplesmente não aparece na maior parte do tempo.
    this.customModel.traverse((o) => { o.frustumCulled = false; });
    this.group.add(this.customModel);

    if (playerModel.animations.length > 0) {
      // O root motion horizontal já sai no preparo do GLB (scripts de Blender):
      // quem posiciona o personagem no mundo é o jogo, não a animação.
      this.mixer = new THREE.AnimationMixer(this.customModel);
      this.setupAnimations(playerModel.animations);
    }
  }

  /**
   * Casa cada clipe do GLB (Mixamo) com um estado do jogo.
   *
   * `janela` recorta a parte útil do clipe. Os clipes do Mixamo são bem mais
   * longos e teatrais que as ações do jogo — o "Big Jump" tem 2,4s de agachada,
   * salto e aterrissagem, enquanto o pulo aqui dura 0,66s. Tocar do início
   * cortaria no meio da agachada, sem nunca chegar à parte no ar. Os limites
   * foram medidos pela pose real dos ossos: no slide o corpo fica abaixo do
   * pórtico entre 20% e 60% do clipe; no pulo o impulso começa em 15% e a
   * aterrissagem termina em 95%.
   */
  private setupAnimations(clips: THREE.AnimationClip[]): void {
    if (!this.mixer) return;

    for (const [state, cfg] of Object.entries(CLIPES) as [PlayerState, ClipeConfig][]) {
      const encontrado = clips.find((c) => c.name.toLowerCase().includes(cfg.nome));
      if (!encontrado) continue;

      // `clipAction` devolve a MESMA action para o mesmo clipe. Como o voo
      // reaproveita o clipe do pulo, sem clonar os dois estados dividiriam uma
      // única action — e a configuração de um sobrescreveria a do outro
      // (o pulo chegou a ficar congelado por causa disso).
      const clip = cfg.congelarEm !== undefined ? encontrado.clone() : encontrado;
      if (clip !== encontrado) clip.name = `${encontrado.name}__${state}`;
      const action = this.mixer.clipAction(clip);

      if (cfg.congelarEm !== undefined) {
        // Pose fixa (jetpack): sem clipe de voo na biblioteca, segura o ápice do pulo.
        action.timeScale = 0;
      } else if (cfg.janela && cfg.duracaoNoJogo) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        const [ini, fim] = cfg.janela;
        action.timeScale = ((fim - ini) * clip.duration) / cfg.duracaoNoJogo;
      }

      this.actions[state] = action;
    }

    if (!this.actions.run && clips[0]) this.actions.run = this.mixer.clipAction(clips[0]);
    this.playStateAnimation('run');
  }

  private playStateAnimation(newState: PlayerState): void {
    if (!this.mixer) return;
    const targetAction = this.actions[newState] ?? this.actions.run;
    if (!targetAction || targetAction === this.currentAction) return;

    // Transição curta: um fade longo deixaria o corpo "no meio do caminho"
    // entre correr e agachar durante boa parte do rolamento, que dura só 0,48s.
    const fade = newState === 'roll' ? 0.05 : 0.12;
    this.currentAction?.fadeOut(fade);
    targetAction.reset();

    // `reset()` volta o tempo para zero; reposiciona no ponto útil do clipe.
    const cfg = CLIPES[newState];
    const duracao = targetAction.getClip().duration;
    if (cfg.congelarEm !== undefined) targetAction.time = duracao * cfg.congelarEm;
    else if (cfg.janela) targetAction.time = duracao * cfg.janela[0];

    targetAction.fadeIn(fade).play();
    this.currentAction = targetAction;
  }

  // ------------------------------------------------------------- simulação

  update(dt: number, input: Input): void {
    this.prevX = this.x;
    this.prevY = this.y;

    this.consumeInput(input);

    if (this.flying) {
      // Aproximação exponencial da altura alvo — sobe suave ao entrar no jetpack.
      this.y += (JETPACK_HEIGHT - this.y) * Math.min(1, dt * JETPACK_TRANSITION_SPEED);
    } else if (this.landing) {
      // Mesma aproximação exponencial, agora com alvo no chão — descida controlada,
      // não queda livre (ver comentário do campo `landing`).
      this.y += (0 - this.y) * Math.min(1, dt * JETPACK_TRANSITION_SPEED);
      if (this.y < 0.03) {
        this.y = 0;
        this.landing = false;
        this.grounded = true;
        this.state = 'run';
      }
    } else if (!this.grounded) {
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        if (this.state === 'jump') this.state = 'run';
      }
    }

    if (this.state === 'roll') {
      this.rollTimer -= dt;
      if (this.rollTimer <= 0 && this.grounded) this.state = 'run';
    }

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    if (this.laneT < 1) this.laneT = Math.min(1, this.laneT + dt / LANE_CHANGE_TIME);
    this.x = THREE.MathUtils.lerp(
      LANE_X[this.laneFrom]!,
      LANE_X[this.lane]!,
      easeOutCubic(this.laneT),
    );

    if (this.grounded && this.state === 'run') this.runCycle += dt * 15;

    if (this.mixer) {
      this.playStateAnimation(this.state);
      this.mixer.update(dt);
    }
  }

  /**
   * Lê o buffer de input. Uma intenção que ainda não pode ser executada é
   * deixada na fila de propósito — é ela que faz o swipe "quase no tempo"
   * ainda valer. Só o que é impossível (parede lateral) é descartado, senão
   * a fila travaria com uma ação que nunca vai acontecer.
   */
  private consumeInput(input: Input): void {
    const action = input.peek();
    if (!action) return;

    if (action === 'left' || action === 'right') {
      if (this.laneT < 1) return;
      const target = this.lane + (action === 'left' ? -1 : 1);
      input.consume();
      if (target < 0 || target >= LANE_X.length) return;
      this.laneFrom = this.lane;
      this.lane = target;
      this.laneT = 0;
      return;
    }

    // Jetpack (voando ou ainda descendo): troca de pista continua livre
    // (acima), mas pulo/rolamento não fazem sentido aqui — a ação fica no
    // buffer e expira sozinha.
    if (this.flying || this.landing) return;

    if (action === 'jump') {
      if (!this.grounded) return;
      input.consume();
      this.vy = JUMP_VELOCITY;
      this.grounded = false;
      this.state = 'jump';
      this.rollTimer = 0;
      this.jumpEvent = true;
      return;
    }

    // roll
    input.consume();
    if (this.grounded) {
      this.state = 'roll';
      this.rollTimer = ROLL_TIME;
      this.rollEvent = true;
    } else {
      // Rolar no ar vira mergulho: corta o pulo e acelera a descida.
      this.vy = Math.min(this.vy, -JUMP_VELOCITY * 0.85);
    }
  }

  // ------------------------------------------------------------- power-ups

  /**
   * Liga/desliga o voo do jetpack. Troca de pista continua livre; pulo e
   * rolamento ficam em pausa enquanto ativo (ver `consumeInput`). Ao
   * desligar, entra em descida controlada (`landing`) até tocar o chão —
   * não em queda livre por gravidade, que levaria tempo demais vindo de
   * JETPACK_HEIGHT e criaria uma janela de colisão impossível de reagir.
   */
  setFlying(active: boolean): void {
    if (active === this.flying) return;
    this.flying = active;
    if (active) {
      this.state = 'fly';
      this.grounded = false;
      this.landing = false;
      this.vy = 0;
      this.rollTimer = 0;
    } else {
      this.landing = true; // state permanece 'fly' até a descida controlada terminar
    }
  }

  /** Invencível durante o voo/descida do jetpack, ou nos i-frames concedidos pela prancha. */
  get invulnerable(): boolean {
    return this.invulnTimer > 0 || this.flying || this.landing;
  }

  /** Concede i-frames por `duration` segundos (não reduz um período já mais longo em curso). */
  grantInvulnerability(duration: number): void {
    this.invulnTimer = Math.max(this.invulnTimer, duration);
  }

  // -------------------------------------------------------------- colisão

  /** Base da caixa lógica em Y, em coordenadas de mundo (soma o pulo atual). */
  get hitY0(): number {
    return this.y;
  }

  /** Topo da caixa lógica, em coordenadas de mundo — encolhe durante o rolamento. */
  get hitY1(): number {
    return this.y + (this.state === 'roll' ? PLAYER_ROLL_HEIGHT : PLAYER_HEIGHT) - HITBOX_FORGIVENESS;
  }

  /** Meia-largura lógica, já com a margem de perdão descontada. */
  get hitHalfWidth(): number {
    return PLAYER_RADIUS - HITBOX_FORGIVENESS;
  }

  /** Meia-profundidade lógica (eixo Z), simétrica à largura. */
  get hitHalfDepth(): number {
    return PLAYER_RADIUS - HITBOX_FORGIVENESS;
  }

  /** Consome (e reseta) o evento de início de pulo deste passo, para o áudio. */
  consumeJumpEvent(): boolean {
    const v = this.jumpEvent;
    this.jumpEvent = false;
    return v;
  }

  /** Consome (e reseta) o evento de início de rolamento deste passo, para o áudio. */
  consumeRollEvent(): boolean {
    const v = this.rollEvent;
    this.rollEvent = false;
    return v;
  }

  // ---------------------------------------------------------------- visual

  syncVisual(alpha: number): void {
    const x = THREE.MathUtils.lerp(this.prevX, this.x, alpha);
    const y = THREE.MathUtils.lerp(this.prevY, this.y, alpha);
    this.visualX = x;

    const rolling = this.state === 'roll';
    const height = rolling ? PLAYER_ROLL_HEIGHT : PLAYER_HEIGHT;

    const squash = height / PLAYER_HEIGHT;
    this.body.scale.set(rolling ? 1.3 : 1, squash, rolling ? 1.3 : 1);
    this.body.position.y = height / 2;
    this.body.rotation.x = rolling ? -0.9 : (this.flying || this.landing) ? -0.25 : 0;

    // O modelo animado não leva nenhuma deformação por código: cada estado tem
    // seu clipe de mocap. No rolamento o "Running Slide" abaixa o corpo sozinho
    // — topo medido em 0.48, bem abaixo da base do pórtico (1.05) — então o
    // agachamento procedural que existia aqui virou dívida e saiu.

    // Bob de corrida e inclinação na troca de pista: é o que dá peso a uma
    // cápsula. Custa dois senos e some assim que o modelo animado entrar.
    const bob = this.grounded && !rolling ? Math.abs(Math.sin(this.runCycle)) * 0.08 : 0;
    const groupY = y + bob;
    this.group.position.set(x, groupY, 0);
    this.group.rotation.z = -THREE.MathUtils.clamp((this.x - this.prevX) * 5, -0.3, 0.3);

    // A sombra fica sempre colada no chão e encolhe conforme o jogador sobe.
    const scale = THREE.MathUtils.clamp(1 - y * 0.13, 0.45, 1);
    this.shadow.position.y = 0.02 - groupY;
    this.shadow.scale.setScalar(scale);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = scale;
  }

  reset(): void {
    this.lane = this.laneFrom = 1;
    this.laneT = 1;
    this.x = this.prevX = 0;
    this.y = this.prevY = 0;
    this.vy = 0;
    this.grounded = true;
    this.state = 'run';
    this.rollTimer = 0;
    this.runCycle = 0;
    this.jumpEvent = false;
    this.rollEvent = false;
    this.flying = false;
    this.landing = false;
    this.invulnTimer = 0;
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

