import * as THREE from 'three';
import { BUILDING_COUNT, CHUNK_RECYCLE_Z, TRACK_SPAN, TRACK_WIDTH } from '../config';
import { TEMAS, type Tema } from './themes';

/**
 * Cenário lateral em InstancedMesh — 1 draw call para o skyline inteiro.
 *
 * Não faz parte dos chunks de propósito: rolando em ciclo próprio, a repetição
 * do cenário deixa de coincidir com a repetição da pista. Cada peça é
 * re-sorteada ao dar a volta, então o skyline nunca se repete — e é essa
 * mesma reciclagem que traz o tema novo, peça por peça, sem troca brusca.
 *
 * As faixas de tamanho vêm do tema, não de constantes fixas: é o que
 * transforma "torres altas e estreitas" da cidade em "formações baixas e
 * largas" do deserto, reaproveitando a mesma caixa.
 */
export class Scenery {
  private readonly mesh: THREE.InstancedMesh;
  private readonly zs = new Float32Array(BUILDING_COUNT);
  private readonly xs = new Float32Array(BUILDING_COUNT);
  private readonly sx = new Float32Array(BUILDING_COUNT);
  private readonly sy = new Float32Array(BUILDING_COUNT);
  private readonly sz = new Float32Array(BUILDING_COUNT);
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private tema: Tema;

  constructor(scene: THREE.Scene) {
    this.tema = TEMAS[0]!;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0); // base na origem, para escalar só a altura

    this.mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshLambertMaterial(),
      BUILDING_COUNT,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // As instâncias se movem todo frame; a esfera envolvente ficaria sempre
    // desatualizada, então o culling é desligado de propósito.
    this.mesh.frustumCulled = false;

    for (let i = 0; i < BUILDING_COUNT; i++) {
      this.randomize(i);
      // Na primeira distribuição espalhamos pelo trecho inteiro.
      this.zs[i] = CHUNK_RECYCLE_Z - Math.random() * TRACK_SPAN;
    }
    this.writeMatrices();

    scene.add(this.mesh);
  }

  /**
   * Define o tema das peças que reciclarem daqui em diante. As já visíveis
   * mantêm a aparência anterior até darem a volta.
   */
  setTema(tema: Tema): void {
    this.tema = tema;
  }

  /** Redistribui tudo já no tema dado — usado ao começar uma partida. */
  reset(tema: Tema): void {
    this.tema = tema;
    for (let i = 0; i < BUILDING_COUNT; i++) {
      this.randomize(i);
      this.zs[i] = CHUNK_RECYCLE_Z - Math.random() * TRACK_SPAN;
    }
    this.writeMatrices();
  }

  update(dz: number): void {
    for (let i = 0; i < BUILDING_COUNT; i++) {
      let z = this.zs[i]! + dz;
      if (z > CHUNK_RECYCLE_Z) {
        z -= TRACK_SPAN;
        this.randomize(i);
      }
      this.zs[i] = z;
    }
    this.writeMatrices();
  }

  /** Sorteia forma, posição lateral e cor a partir do tema. O Z é de quem chama. */
  private randomize(i: number): void {
    const t = this.tema;
    const side = Math.random() < 0.5 ? -1 : 1;
    const margin = TRACK_WIDTH / 2 + 3.5;
    const [largMin, largMax] = t.predioLargura;
    const [altMin, altMax] = t.predioAltura;

    this.xs[i] = side * (margin + Math.random() * 20);
    this.sx[i] = largMin + Math.random() * (largMax - largMin);
    this.sz[i] = largMin + Math.random() * (largMax - largMin);
    this.sy[i] = altMin + Math.random() * (altMax - altMin);

    this.mesh.setColorAt(i, this.color.setHex(pick(t.predios)));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private writeMatrices(): void {
    for (let i = 0; i < BUILDING_COUNT; i++) {
      this.dummy.position.set(this.xs[i]!, -0.35, this.zs[i]!);
      this.dummy.scale.set(this.sx[i]!, this.sy[i]!, this.sz[i]!);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}
