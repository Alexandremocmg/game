import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ObstacleKind } from '../world/obstacleSpecs';
import { POWER_UP_KINDS, POWER_UP_SPECS, type PowerUpKind } from '../world/powerUpSpecs';

const MODEL_URLS: Record<ObstacleKind, string> = {
  low: 'models/cone.glb',
  gate: 'models/gate.glb',
  block: 'models/block.glb',
  train: 'models/train.glb',
};

/**
 * Sem a subpasta `gltf/`: ela existe dentro do pacote npm do three.js, mas não
 * no CDN — lá os arquivos ficam na raiz da versão. Com o caminho errado o
 * decodificador dá 404, e aí **nenhum** modelo carrega: personagem, obstáculos
 * e power-ups caem todos para a geometria de reserva.
 */
const DRACO_CDN = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

const draco = new DRACOLoader();
draco.setDecoderPath(DRACO_CDN);
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

export type ProgressCallback = (ratio: number) => void;

function loadModelWithProgress(
  url: string,
  onFileProgress?: (loadedRatio: number) => void,
): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        onFileProgress?.(1.0);
        resolve(gltf.scene);
      },
      (xhr) => {
        if (xhr.lengthComputable && xhr.total > 0) {
          onFileProgress?.(xhr.loaded / xhr.total);
        }
      },
      reject,
    );
  });
}

export async function loadPlayerModel(
  onProgress?: (ratio: number) => void,
): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null> {
  try {
    const gltf = await loader.loadAsync('models/player_mixamo.glb', (xhr) => {
      if (xhr.lengthComputable && xhr.total > 0) {
        onProgress?.(xhr.loaded / xhr.total);
      }
    });
    onProgress?.(1.0);
    return { scene: gltf.scene, animations: gltf.animations };
  } catch (err) {
    // Engolir o erro em silêncio já custou caro: o personagem virava cápsula
    // sem nenhuma pista do motivo. O jogo segue jogável com a reserva, mas o
    // motivo real precisa aparecer.
    console.error('Falha ao carregar o modelo do personagem:', err);
    return null;
  }
}

export async function preloadObstacleModels(
  onProgressMap?: Record<string, (ratio: number) => void>,
): Promise<Record<ObstacleKind, THREE.Object3D>> {
  const entries = await Promise.all(
    (Object.keys(MODEL_URLS) as ObstacleKind[]).map(
      async (kind) => [kind, await loadModelWithProgress(MODEL_URLS[kind], onProgressMap?.[kind])] as const,
    ),
  );
  return Object.fromEntries(entries) as unknown as Record<ObstacleKind, THREE.Object3D>;
}

export async function preloadPowerUpModels(
  onProgressMap?: Record<string, (ratio: number) => void>,
): Promise<Record<PowerUpKind, THREE.Object3D>> {
  const entries = await Promise.all(
    POWER_UP_KINDS.map(
      async (kind) => [
        kind,
        await loadModelWithProgress(POWER_UP_SPECS[kind].modelUrl, onProgressMap?.[kind]),
      ] as const,
    ),
  );
  return Object.fromEntries(entries) as unknown as Record<PowerUpKind, THREE.Object3D>;
}

