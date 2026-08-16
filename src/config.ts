/**
 * Todas as constantes de tuning do jogo vivem aqui.
 * Regra: nenhum número mágico espalhado pelo resto do código.
 */

// ---------------------------------------------------------------- pistas
export const LANE_WIDTH = 2.2;
export const LANE_X = [-LANE_WIDTH, 0, LANE_WIDTH] as const;
export const TRACK_WIDTH = LANE_WIDTH * 3 + 1.2;

// ---------------------------------------------------------------- trilha
export const CHUNK_LENGTH = 24;
export const CHUNK_POOL_SIZE = 8;
/** Um chunk é reciclado quando passa deste Z (já está atrás da câmera). */
export const CHUNK_RECYCLE_Z = CHUNK_LENGTH * 1.5;
export const TRACK_SPAN = CHUNK_LENGTH * CHUNK_POOL_SIZE;

// ---------------------------------------------------------------- tempo
/** Passo fixo de simulação. Sem isto o jogo fica mais difícil num aparelho de 120Hz. */
export const FIXED_DT = 1 / 60;
/** Teto por frame: evita espiral de morte quando a aba volta do background. */
export const MAX_FRAME_TIME = 0.25;

// ------------------------------------------------------------ velocidade
export const SPEED_BASE = 14;
export const SPEED_MAX = 34;
/** Constante de tempo da curva assintótica, em segundos. */
export const SPEED_TAU = 75;

// ---------------------------------------------------------------- jogador
export const LANE_CHANGE_TIME = 0.14;
export const GRAVITY = -38;
export const JUMP_VELOCITY = 12.5;
export const ROLL_TIME = 0.48;

/**
 * Tempo total no ar num pulo, derivado da física (sobe e desce): 2·v/|g|.
 * Usado para encaixar a duração do clipe de animação na janela real da ação —
 * por isso é derivado, e não um número solto que sairia de sincronia se a
 * gravidade ou o impulso do pulo forem ajustados.
 */
export const JUMP_AIRTIME = (2 * JUMP_VELOCITY) / Math.abs(GRAVITY);

/**
 * Liga o modelo 3D animado do personagem. Desligado = cápsula procedural.
 *
 * Ligado com os clipes de mocap do Mixamo, aprovados um a um na página de
 * inspeção (`/animacoes.html`). Os presets do Tripo, que saíam deformados,
 * foram descartados.
 */
export const USE_CHARACTER_MODEL = true;

export const PLAYER_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.36;
export const PLAYER_ROLL_HEIGHT = 0.85;
/** Margem de perdão da colisão: a caixa lógica é menor que a visual. */
export const HITBOX_FORGIVENESS = 0.12;

// ---------------------------------------------------------------- input
/** Um swipe disparado até este tempo antes de poder agir ainda conta. */
export const INPUT_BUFFER_TIME = 0.12;
export const SWIPE_MIN_DISTANCE = 24;
export const SWIPE_MAX_TIME = 0.4;

// ---------------------------------------------------------------- câmera
export const CAMERA_POS = [0, 4.3, 8.5] as const;
export const CAMERA_LOOK = [0, 1.4, -8] as const;
export const CAMERA_FOV = 62;
/** Quanto o FOV abre entre velocidade mínima e máxima. Vende a sensação de velocidade. */
export const CAMERA_FOV_SPEED_BONUS = 9;
/** Quanto a câmera acompanha lateralmente a troca de pista (0 = fixa, 1 = colada). */
export const CAMERA_LATERAL_FOLLOW = 0.35;
/** Deslocamento máximo do tremor de câmera num quase-acerto, em unidades de mundo. */
export const SHAKE_IMPULSE = 0.09;
/** Quanto o tremor decai por segundo — some em ~150ms. */
export const SHAKE_DECAY = 0.6;

// ---------------------------------------------------------------- visual
/** Cor da cápsula de reserva, usada quando o modelo do personagem não carrega. */
export const COLOR_PLAYER = 0xff7a4d;

/**
 * Peças de cenário lateral. Subiu de 64 para 96 quando o cenário passou a ter
 * duas faixas de profundidade: a de trás precisa de população própria, senão
 * a da frente rareia para pagá-la. Não custa draw call — são as mesmas 4
 * `InstancedMesh`, só com mais instâncias.
 */
export const BUILDING_COUNT = 96;

// ---------------------------------------------------------------- temas
// As paletas vivem em `world/themes.ts`; aqui fica só a cadência da troca.

/** Distância percorrida por tema, em unidades de mundo. */
export const THEME_SEGMENT = 700;
/**
 * Trecho final de cada segmento em que céu, névoa e luz migram para o próximo
 * tema. A pista e o cenário trocam por reciclagem, então já chegam prontos
 * vindos de além da névoa — este valor governa só a parte interpolada.
 */
export const THEME_TRANSITION = 180;

// ---------------------------------------------------------------- pontuação
/** Pontos por unidade de distância percorrida. */
export const SCORE_PER_UNIT = 1.2;

// ---------------------------------------------------------------- power-ups
/** Distância média entre pickups (metros), com jitter — não ligado aos Patterns de obstáculo. */
export const POWERUP_SPAWN_DISTANCE_MIN = 90;
export const POWERUP_SPAWN_DISTANCE_MAX = 160;
/** Altura de flutuação do pickup no mundo e raio de coleta (mais generoso que o da moeda). */
export const POWERUP_FLOAT_Y = 1.1;
export const POWERUP_PICKUP_HALF_Z = 1.1;

/** Alcance frente/trás de coleta de moeda com o ímã ativo (padrão sem ímã: 0.9, ver Game.ts). */
export const MAGNET_COIN_RANGE_Z = 14;

/** Altura alvo do voo e velocidade de aproximação exponencial (unidades/s). */
export const JETPACK_HEIGHT = 3.1;
export const JETPACK_TRANSITION_SPEED = 6;

export const MULTIPLIER_FACTOR = 2;

/** Invencibilidade temporária após a prancha absorver uma colisão — evita dano duplo no mesmo obstáculo longo. */
export const BOARD_INVULN_TIME = 1.2;
