export type PowerUpKind = 'magnet' | 'jetpack' | 'multiplier' | 'board';

export interface PowerUpSpec {
  /** Duração do efeito em segundos. 0 = instantâneo/sem timer (caso da prancha, que dura até quebrar). */
  duration: number;
  /** Cor de fallback/emissive — usada até o modelo carregar e no material do pickup no mundo. */
  color: number;
  modelUrl: string;
}

export const POWER_UP_SPECS: Record<PowerUpKind, PowerUpSpec> = {
  magnet: { duration: 9, color: 0x3f7fbf, modelUrl: 'models/magnet.glb' },
  jetpack: { duration: 7, color: 0x4ade80, modelUrl: 'models/jetpack.glb' },
  multiplier: { duration: 10, color: 0xffd35c, modelUrl: 'models/star.glb' },
  board: { duration: 0, color: 0xff9a4d, modelUrl: 'models/hoverboard.glb' },
};

export const POWER_UP_KINDS = Object.keys(POWER_UP_SPECS) as PowerUpKind[];
