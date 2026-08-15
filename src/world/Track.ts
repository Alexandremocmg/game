import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CHUNK_LENGTH, CHUNK_POOL_SIZE, CHUNK_RECYCLE_Z,
  COLOR_CURB, COLOR_ROAD, COLOR_ROAD_EDGE, COLOR_STRIPE,
  LANE_WIDTH, TRACK_SPAN, TRACK_WIDTH,
} from '../config';
import { box } from '../render/geometry';

/**
 * Trilha infinita por reciclagem de chunks.
 *
 * O jogador nunca sai de z = 0 — é o mundo que vem em direção a ele. Isso
 * evita perda de precisão de float numa corrida que pode durar quilômetros e
 * mantém o culling trivial. Quando um chunk passa da câmera, ele volta para
 * o fim da fila; nada é criado nem destruído durante a partida.
 */
export class Track {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly zs: number[] = [];

  constructor(scene: THREE.Scene) {
    const geometry = buildChunkGeometry();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });

    for (let i = 0; i < CHUNK_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      const z = CHUNK_LENGTH * (1 - i);
      mesh.position.z = z;
      this.zs.push(z);
      this.meshes.push(mesh);
      scene.add(mesh);
    }
  }

  /** Posições em Z dos chunks — usado para verificar a reciclagem. */
  get debugZs(): number[] {
    return [...this.zs];
  }

  update(dz: number): void {
    for (let i = 0; i < this.meshes.length; i++) {
      let z = this.zs[i]! + dz;
      if (z > CHUNK_RECYCLE_Z) z -= TRACK_SPAN;
      this.zs[i] = z;
      this.meshes[i]!.position.z = z;
    }
  }
}

/**
 * Todas as peças do chunk fundidas numa geometria só, com cor por vértice.
 * Resultado: 1 draw call por chunk em vez de um por peça.
 */
function buildChunkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const half = TRACK_WIDTH / 2;

  // Chão lateral largo — sem ele o horizonte mostra o vazio nas bordas.
  parts.push(box(90, 0.4, CHUNK_LENGTH, 0, -0.55, 0, COLOR_ROAD_EDGE));

  // Superfície da pista, com o topo exatamente em y = 0.
  parts.push(box(TRACK_WIDTH, 0.5, CHUNK_LENGTH, 0, -0.25, 0, COLOR_ROAD));

  for (const sign of [-1, 1]) {
    parts.push(box(0.5, 0.6, CHUNK_LENGTH, sign * (half + 0.25), -0.05, 0, COLOR_CURB));
  }

  // Faixas tracejadas nos limites entre as pistas: a referência visual que
  // deixa claro para onde o swipe leva.
  const dash = 2.4;
  const stride = dash * 2;
  const dashes = Math.round(CHUNK_LENGTH / stride);
  for (const sign of [-1, 1]) {
    for (let i = 0; i < dashes; i++) {
      const z = -CHUNK_LENGTH / 2 + stride * (i + 0.5);
      parts.push(box(0.16, 0.04, dash, sign * (LANE_WIDTH / 2), 0.01, z, COLOR_STRIPE));
    }
  }

  return mergeGeometries(parts, false)!;
}
