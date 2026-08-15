import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../render/geometry';

export type ObstacleKind = 'low' | 'gate' | 'block' | 'train';

export interface ObstacleSpec {
  /** Faixa vertical da caixa de colisão. */
  y0: number;
  y1: number;
  halfWidth: number;
  halfDepth: number;
  /** Quantas instâncias no máximo em cena ao mesmo tempo. */
  capacity: number;
  build(): THREE.BufferGeometry;
}

/**
 * A regra de cada obstáculo sai da própria caixa de colisão — não há caso
 * especial no código de colisão:
 *
 *  low   y 0…0.78  → a cápsula em pé (0…1.7) encosta; pulando (1.95…3.65) passa;
 *                    rolando (0…0.85) ainda encosta, então a única saída é pular.
 *  gate  y 1.05…2.4 → em pé encosta; rolando (0…0.85) passa por baixo;
 *                    pulando encosta ainda mais.
 *  block e train    → altos demais para o ápice do pulo (1.95). Só desviando.
 */
export const OBSTACLE_SPECS: Record<ObstacleKind, ObstacleSpec> = {
  low: {
    y0: 0, y1: 0.78, halfWidth: 0.95, halfDepth: 0.45, capacity: 24,
    build: () => mergeGeometries([
      box(1.9, 0.7, 0.8, 0, 0.35, 0, 0xe8562f),
      box(2.02, 0.14, 0.92, 0, 0.72, 0, 0xf5ead6),
      box(0.16, 0.35, 0.16, -0.85, 0.17, 0, 0x2f3440),
      box(0.16, 0.35, 0.16, 0.85, 0.17, 0, 0x2f3440),
    ], false)!,
  },

  gate: {
    y0: 1.05, y1: 2.4, halfWidth: 0.95, halfDepth: 0.32, capacity: 24,
    build: () => mergeGeometries([
      box(1.9, 1.35, 0.55, 0, 1.725, 0, 0x3f7fbf),
      box(2.02, 0.16, 0.62, 0, 1.13, 0, 0xf5ead6),
      box(2.02, 0.14, 0.62, 0, 2.35, 0, 0x2c5a88),
    ], false)!,
  },

  block: {
    // halfDepth reduzido para bater com a proporção do modelo real (M5): uma
    // placa/barreira fina, não um cubo. Só estreita a janela de colisão em Z,
    // nunca a tornando mais dura — a vencibilidade validada com o valor
    // anterior (0.95) continua de pé.
    y0: 0, y1: 2.6, halfWidth: 0.95, halfDepth: 0.45, capacity: 24,
    build: () => mergeGeometries([
      box(1.85, 2.5, 1.85, 0, 1.25, 0, 0x7a5c3e),
      box(1.97, 0.16, 1.97, 0, 2.52, 0, 0xa07f58),
      box(1.9, 0.18, 0.35, 0, 1.7, 0, 0x5e452d),
      box(1.9, 0.18, 0.35, 0, 0.8, 0, 0x5e452d),
    ], false)!,
  },

  train: {
    y0: 0, y1: 2.9, halfWidth: 1.0, halfDepth: 7, capacity: 10,
    build: () => mergeGeometries([
      box(2.0, 2.6, 14, 0, 1.3, 0, 0xd8d3c6),
      box(2.12, 0.28, 14, 0, 2.68, 0, 0x8f9aa8),
      box(2.06, 0.72, 12.4, 0, 1.95, 0, 0x2f4257),
      box(1.92, 0.36, 13.4, 0, 0.18, 0, 0x4a4f58),
      box(2.08, 0.12, 13.6, 0, 1.0, 0, 0xb84b3a),
    ], false)!,
  },
};
