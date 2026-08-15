import * as THREE from 'three';
import {
  CHUNK_RECYCLE_Z, LANE_X,
  POWERUP_FLOAT_Y, POWERUP_SPAWN_DISTANCE_MAX, POWERUP_SPAWN_DISTANCE_MIN,
} from '../config';
import { OBSTACLE_SPECS, type ObstacleKind } from './obstacleSpecs';
import { pickPattern, type Pattern } from './patterns';
import { POWER_UP_KINDS, POWER_UP_SPECS, type PowerUpKind } from './powerUpSpecs';

interface ActiveObstacle {
  kind: ObstacleKind;
  lane: number;
  z: number;
  mesh: THREE.Object3D;
  alive: boolean;
  /** Já disparou o tremor de câmera de "quase-acerto" desde que nasceu? */
  nearMissDone: boolean;
}

/**
 * Ajuste por tipo entre o modelo baixado do Sketchfab e o spec de colisão
 * numérico (que não muda). `scaleY` compensa modelos rasos demais para a
 * faixa vertical esperada; `offsetY` eleva a base do modelo do chão — usado
 * pelo `gate`, cujo modelo real é uma barreira baixa apoiada no chão, não um
 * pórtico suspenso.
 */
const MODEL_ADJUST: Partial<Record<ObstacleKind, { scaleY?: number; offsetY?: number }>> = {
  gate: { scaleY: 2.9, offsetY: 1.05 },
};

/** Quantos clones do template lado a lado formam o obstáculo "low". */
const LOW_CONE_COUNT = 2;
const LOW_CONE_SPACING = 0.75;

interface ActiveCoin {
  lane: number;
  z: number;
  y: number;
  alive: boolean;
}

const COIN_STEP_DEFAULT = 1.6;
const COIN_Y_GROUND = 0.9;
const COIN_Y_ARC_PEAK = 2.05; // abaixo do ápice do pulo (1.95 + folga), força o timing

interface ActivePowerUp {
  kind: PowerUpKind;
  lane: number;
  z: number;
  mesh: THREE.Object3D;
  alive: boolean;
}

/** Poucas instâncias por tipo bastam — é raro ter mais de um pickup do mesmo tipo vivo ao mesmo tempo. */
const POWERUP_CAPACITY_PER_KIND = 2;
/** Onde, à frente do jogador, o próximo pickup aparece — fixo, independente dos Patterns. */
const POWERUP_SPAWN_Z_MIN = 30;
const POWERUP_SPAWN_Z_MAX = 50;
/** Margem mínima (na mesma pista) para não nascer em cima de um obstáculo. */
const POWERUP_OBSTACLE_CLEARANCE = 4;

/**
 * Duas contagens deliberadamente separadas guiam a geração:
 *
 * `aheadBuffer` é quanta trilha já gerada ainda resta entre o fim do último
 * padrão e o jogador. Encolhe a cada frame por `dz` (o jogador consome
 * terreno) e cresce quando um novo padrão é anexado. Enquanto ela ficar
 * abaixo de SPAWN_START_BUFFER, gera-se mais.
 *
 * `generatedLength` é só um marcador monotônico de "quantos metros de
 * conteúdo já foram desenhados desde o início" — nunca encolhe, serve
 * unicamente para calcular a posição de mundo do próximo padrão como
 * `-(generatedLength + offset)` (negativo = ainda à frente, não alcançado).
 *
 * Misturar as duas num único contador foi o bug da primeira versão: como o
 * mesmo valor crescia tanto por `dz` quanto por `pattern.length`, ele nunca
 * voltava a cair abaixo do limiar depois da primeira leva, e a geração
 * simplesmente parava — o jogo ficava sem obstáculos após poucos segundos.
 */
const SPAWN_START_BUFFER = 40;

/**
 * Gera obstáculos e moedas encadeando `Pattern`s ao longo da trilha e
 * reciclando cada peça pelo mesmo pool que os chunks — nenhuma alocação em
 * runtime.
 */
export class Spawner {
  private readonly obstacles: ActiveObstacle[] = [];
  private readonly coins: ActiveCoin[] = [];
  private readonly coinMesh: THREE.InstancedMesh;
  private readonly coinDummy = new THREE.Object3D();
  private readonly powerUps: ActivePowerUp[] = [];

  private aheadBuffer = 0;
  private generatedLength = 0;
  private distanceAtSpawn = 0;
  private nextPowerUpDistance = 0;
  private rand: () => number;

  constructor(
    scene: THREE.Scene,
    seed = 1,
    models: Partial<Record<ObstacleKind, THREE.Object3D>> = {},
    powerUpModels: Partial<Record<PowerUpKind, THREE.Object3D>> = {},
  ) {
    this.rand = mulberry32(seed);
    this.nextPowerUpDistance = POWERUP_SPAWN_DISTANCE_MIN
      + this.rand() * (POWERUP_SPAWN_DISTANCE_MAX - POWERUP_SPAWN_DISTANCE_MIN);

    for (const kind of Object.keys(OBSTACLE_SPECS) as ObstacleKind[]) {
      const spec = OBSTACLE_SPECS[kind];
      const template = models[kind];
      // template ausente = fallback para a caixa procedural (ex.: modelos
      // ainda não carregados, ou build local sem os assets do Sketchfab).
      const geometry = template ? null : spec.build();
      const material = geometry ? new THREE.MeshLambertMaterial({ vertexColors: true }) : null;

      for (let i = 0; i < spec.capacity; i++) {
        const mesh = template ? buildFromTemplate(kind, template) : new THREE.Mesh(geometry!, material!);
        mesh.visible = false;
        scene.add(mesh);
        this.obstacles.push({ kind, lane: 0, z: 0, mesh, alive: false, nearMissDone: false });
      }
    }

    const coinGeo = new THREE.OctahedronGeometry(0.22, 0);
    this.coinMesh = new THREE.InstancedMesh(
      coinGeo,
      // emissive garante que o bloom (M6) pegue a moeda de forma consistente,
      // independente de como a luz da cena incide sobre ela.
      new THREE.MeshStandardMaterial({
        color: 0xffd35c, metalness: 0.65, roughness: 0.3,
        emissive: 0xffb020, emissiveIntensity: 0.55,
      }),
      160,
    );
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.count = 0;
    scene.add(this.coinMesh);
    for (let i = 0; i < 160; i++) this.coins.push({ lane: 0, z: 0, y: 0, alive: false });

    for (const kind of POWER_UP_KINDS) {
      const template = powerUpModels[kind];
      for (let i = 0; i < POWERUP_CAPACITY_PER_KIND; i++) {
        // Fallback visual (modelo ainda não carregado): esfera colorida com
        // a mesma cor/emissive do spec — mesmo padrão de fallback dos obstáculos.
        const mesh = template ? template.clone(true) : new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 12, 8),
          new THREE.MeshStandardMaterial({
            color: POWER_UP_SPECS[kind].color, emissive: POWER_UP_SPECS[kind].color, emissiveIntensity: 0.5,
          }),
        );
        mesh.visible = false;
        scene.add(mesh);
        this.powerUps.push({ kind, lane: 0, z: 0, mesh, alive: false });
      }
    }
  }

  reset(seed = Date.now()): void {
    this.rand = mulberry32(seed >>> 0);
    this.distanceAtSpawn = 0;
    this.aheadBuffer = 0;
    this.generatedLength = 0;
    this.nextPowerUpDistance = POWERUP_SPAWN_DISTANCE_MIN
      + this.rand() * (POWERUP_SPAWN_DISTANCE_MAX - POWERUP_SPAWN_DISTANCE_MIN);
    for (const o of this.obstacles) { o.alive = false; o.mesh.visible = false; }
    for (const c of this.coins) c.alive = false;
    for (const p of this.powerUps) { p.alive = false; p.mesh.visible = false; }
    this.coinMesh.count = 0;
  }

  /** @param dz avanço deste passo · @param distance distância total percorrida, para o sorteio de dificuldade */
  update(dz: number, distance: number): void {
    this.distanceAtSpawn = distance;

    for (const o of this.obstacles) {
      if (!o.alive) continue;
      o.z += dz;
      if (o.z > CHUNK_RECYCLE_Z) { o.alive = false; o.mesh.visible = false; continue; }
      o.mesh.position.set(LANE_X[o.lane]!, 0, o.z);
    }

    let coinTouched = false;
    for (const c of this.coins) {
      if (!c.alive) continue;
      c.z += dz;
      if (c.z > CHUNK_RECYCLE_Z) { c.alive = false; continue; }
      coinTouched = true;
    }
    if (coinTouched || this.coinMesh.count > 0) this.writeCoinMatrices();

    for (const p of this.powerUps) {
      if (!p.alive) continue;
      p.z += dz;
      if (p.z > CHUNK_RECYCLE_Z) { p.alive = false; p.mesh.visible = false; continue; }
      p.mesh.position.set(LANE_X[p.lane]!, POWERUP_FLOAT_Y, p.z);
      p.mesh.rotation.y += 0.03; // giro lento — só cosmético, chama atenção sem parecer moeda
    }

    // O jogador consome buffer a cada frame; repõe gerando mais padrões
    // sempre que a reserva à frente cair abaixo do mínimo.
    this.aheadBuffer -= dz;
    while (this.aheadBuffer < SPAWN_START_BUFFER) this.spawnPattern();

    // Spawn de power-up é independente dos Patterns de obstáculo — dirigido
    // só por distância percorrida, com jitter, para não reautorar conteúdo
    // já validado (ver plano de extensão).
    if (distance >= this.nextPowerUpDistance) this.trySpawnPowerUp();
  }

  private trySpawnPowerUp(): void {
    // Sempre reagenda, mesmo se este spawn específico falhar por sobreposição —
    // evita tentar de novo a cada frame e travar a cadência.
    this.nextPowerUpDistance += POWERUP_SPAWN_DISTANCE_MIN
      + this.rand() * (POWERUP_SPAWN_DISTANCE_MAX - POWERUP_SPAWN_DISTANCE_MIN);

    const z = -(POWERUP_SPAWN_Z_MIN + this.rand() * (POWERUP_SPAWN_Z_MAX - POWERUP_SPAWN_Z_MIN));
    const laneOrder = shuffledLanes(this.rand);
    const lane = laneOrder.find((l) => !this.obstacles.some(
      (o) => o.alive && o.lane === l && Math.abs(o.z - z) < POWERUP_OBSTACLE_CLEARANCE,
    ));
    if (lane === undefined) return; // as 3 pistas ocupadas nesse Z — pula esta rodada

    const kind = POWER_UP_KINDS[Math.floor(this.rand() * POWER_UP_KINDS.length)]!;
    const slot = this.powerUps.find((p) => !p.alive && p.kind === kind);
    if (!slot) return; // pool esgotado (raro): melhor pular que alocar

    slot.alive = true;
    slot.lane = lane;
    slot.z = z;
    slot.mesh.visible = true;
    slot.mesh.position.set(LANE_X[lane]!, POWERUP_FLOAT_Y, z);
  }

  private spawnPattern(): void {
    const pattern: Pattern = pickPattern(this.distanceAtSpawn, this.rand);
    const base = this.generatedLength;

    for (const p of pattern.obstacles) {
      const slot = this.obstacles.find((o) => !o.alive && o.kind === p.kind);
      if (!slot) continue; // pool esgotado: preferível pular a alocar
      slot.alive = true;
      slot.nearMissDone = false;
      slot.lane = p.lane;
      slot.z = -(base + p.z);
      slot.mesh.visible = true;
      slot.mesh.position.set(LANE_X[p.lane]!, 0, slot.z);
    }

    for (const run of pattern.coins) {
      const step = run.step ?? COIN_STEP_DEFAULT;
      for (let i = 0; i < run.count; i++) {
        const slot = this.coins.find((c) => !c.alive);
        if (!slot) break;
        slot.alive = true;
        slot.lane = run.lane;
        slot.z = -(base + run.z + i * step);
        slot.y = run.arc
          ? COIN_Y_GROUND + Math.sin((i / (run.count - 1 || 1)) * Math.PI) * (COIN_Y_ARC_PEAK - COIN_Y_GROUND)
          : COIN_Y_GROUND;
      }
    }

    this.generatedLength += pattern.length;
    this.aheadBuffer += pattern.length;
  }

  private writeCoinMatrices(): void {
    let n = 0;
    for (const c of this.coins) {
      if (!c.alive) continue;
      this.coinDummy.position.set(LANE_X[c.lane]!, c.y, c.z);
      this.coinDummy.rotation.y = c.z * 0.6;
      this.coinDummy.updateMatrix();
      this.coinMesh.setMatrixAt(n, this.coinDummy.matrix);
      n++;
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ consultas

  /** Obstáculos "vivos" perto o bastante do jogador para valer a pena testar colisão. */
  *nearbyObstacles(range: number): IterableIterator<ActiveObstacle> {
    for (const o of this.obstacles) {
      if (o.alive && Math.abs(o.z) < range) yield o;
    }
  }

  /** Pickups de power-up vivos dentro do alcance — usado pela colisão de coleta e pelo bot de teste. */
  *nearbyPowerUps(range: number): IterableIterator<ActivePowerUp> {
    for (const p of this.powerUps) {
      if (p.alive && Math.abs(p.z) < range) yield p;
    }
  }

  /**
   * Coleta moedas na faixa dada; devolve quantas foram pegas e as remove.
   * `anyLane` (efeito do ímã ativo) ignora `lane` — o chamador já passa um
   * zMin/zMax bem mais largo nesse caso.
   */
  collectCoins(
    lane: number, zMin: number, zMax: number, yTest: (y: number) => boolean, anyLane = false,
  ): number {
    let collected = 0;
    for (const c of this.coins) {
      if (!c.alive) continue;
      if (!anyLane && c.lane !== lane) continue;
      if (c.z < zMin || c.z > zMax) continue;
      if (!yTest(c.y)) continue;
      c.alive = false;
      collected++;
    }
    if (collected > 0) this.writeCoinMatrices();
    return collected;
  }

  /** Coleta pickups de power-up na pista do jogador; devolve os tipos coletados. */
  collectPowerUps(lane: number, zMin: number, zMax: number): PowerUpKind[] {
    const collected: PowerUpKind[] = [];
    for (const p of this.powerUps) {
      if (!p.alive || p.lane !== lane) continue;
      if (p.z < zMin || p.z > zMax) continue;
      p.alive = false;
      p.mesh.visible = false;
      collected.push(p.kind);
    }
    return collected;
  }

  /** Desativa obstáculos vivos que estejam num raio de `distance` metros à frente (usado no revive). */
  clearAhead(distance: number): void {
    for (const o of this.obstacles) {
      if (o.alive && o.z < 0 && o.z > -distance) {
        o.alive = false;
        o.mesh.visible = false;
      }
    }
  }
}

/**
 * Constrói o Object3D visual de um slot a partir do modelo carregado.
 * `clone()` do Three.js duplica a hierarquia de Object3D mas compartilha
 * geometria e material por referência — barato mesmo com dezenas de slots.
 */
function buildFromTemplate(kind: ObstacleKind, template: THREE.Object3D): THREE.Object3D {
  if (kind === 'low') {
    const group = new THREE.Group();
    for (let i = 0; i < LOW_CONE_COUNT; i++) {
      const cone = template.clone(true);
      const offset = (i - (LOW_CONE_COUNT - 1) / 2) * LOW_CONE_SPACING;
      cone.position.x = offset;
      group.add(cone);
    }
    return group;
  }

  const adjust = MODEL_ADJUST[kind];
  const clone = template.clone(true);
  if (adjust?.scaleY) clone.scale.y *= adjust.scaleY;
  if (!adjust?.offsetY) return clone;

  // Envolve num grupo: o slot controla a posição do grupo a cada frame
  // (position.set sobrescreve x/y/z inteiros), então o deslocamento vertical
  // do modelo precisa viver no clone interno, não no objeto que o slot move.
  clone.position.y = adjust.offsetY;
  const wrapper = new THREE.Group();
  wrapper.add(clone);
  return wrapper;
}

/** As 3 pistas (0,1,2) em ordem embaralhada — usado para sortear onde um power-up nasce. */
function shuffledLanes(rand: () => number): number[] {
  const lanes = [0, 1, 2];
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j]!, lanes[i]!];
  }
  return lanes;
}

/** PRNG determinístico e leve — permite reproduzir uma corrida a partir de uma seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
