import * as THREE from 'three';
import {
  BUILDING_COLORS, BUILDING_COUNT, CHUNK_RECYCLE_Z, TRACK_SPAN, TRACK_WIDTH,
} from '../config';

/**
 * Prédios laterais em InstancedMesh — 1 draw call para o cenário inteiro.
 *
 * Não fazem parte dos chunks de propósito: rolando em ciclo próprio, a
 * repetição do cenário deixa de coincidir com a repetição da pista. Cada
 * prédio é re-sorteado ao dar a volta, então o skyline nunca se repete.
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

  constructor(scene: THREE.Scene) {
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
      this.mesh.setColorAt(i, this.color.setHex(pick(BUILDING_COLORS)));
    }
    this.writeMatrices();

    scene.add(this.mesh);
  }

  update(dz: number): void {
    for (let i = 0; i < BUILDING_COUNT; i++) {
      let z = this.zs[i]! + dz;
      if (z > CHUNK_RECYCLE_Z) {
        z -= TRACK_SPAN;
        this.randomize(i);
        this.mesh.setColorAt(i, this.color.setHex(pick(BUILDING_COLORS)));
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      }
      this.zs[i] = z;
    }
    this.writeMatrices();
  }

  /** Sorteia forma e posição lateral. O Z é tratado por quem chama. */
  private randomize(i: number): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const margin = TRACK_WIDTH / 2 + 3.5;
    this.xs[i] = side * (margin + Math.random() * 20);
    this.sx[i] = 3 + Math.random() * 4.5;
    this.sz[i] = 3 + Math.random() * 4.5;
    this.sy[i] = 5 + Math.random() * 24;
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
