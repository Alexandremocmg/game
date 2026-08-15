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

const draco = new DRACOLoader();
draco.setDecoderPath('draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

function loadModel(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

export async function loadPlayerModel(): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null> {
  try {
    // Mocap do Mixamo (aprovado clipe a clipe na página /animacoes.html).
    // Substituiu os presets do Tripo, que retargetavam este personagem com o
    // corpo deformado tanto no rig v1.0 quanto no v2.5.
    const gltf = await loader.loadAsync('models/player_mixamo.glb');
    return { scene: gltf.scene, animations: gltf.animations };
  } catch {
    return null;
  }
}

/**
 * Carrega os 4 modelos de obstáculo antes do jogo começar. Feito uma vez no
 * bootstrap — o `Spawner` clona esses templates para cada slot do seu pool
 * (clone() do Three.js compartilha geometria/material, não duplica dados).
 */
export async function preloadObstacleModels(): Promise<Record<ObstacleKind, THREE.Object3D>> {
  const entries = await Promise.all(
    (Object.keys(MODEL_URLS) as ObstacleKind[]).map(
      async (kind) => [kind, await loadModel(MODEL_URLS[kind])] as const,
    ),
  );
  return Object.fromEntries(entries) as unknown as Record<ObstacleKind, THREE.Object3D>;
}

/** Mesma lógica de `preloadObstacleModels`, para os 4 pickups de power-up. */
export async function preloadPowerUpModels(): Promise<Record<PowerUpKind, THREE.Object3D>> {
  const entries = await Promise.all(
    POWER_UP_KINDS.map(
      async (kind) => [kind, await loadModel(POWER_UP_SPECS[kind].modelUrl)] as const,
    ),
  );
  return Object.fromEntries(entries) as unknown as Record<PowerUpKind, THREE.Object3D>;
}
