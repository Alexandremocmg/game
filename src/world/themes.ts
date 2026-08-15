/**
 * Temas de cenário — a variedade visual do jogo.
 *
 * Cada tema reúne tudo que muda de ambiente para ambiente: céu, névoa, cores
 * da pista, paleta e proporções do cenário lateral, e luz. Nada aqui afeta
 * física, colisão ou dificuldade — trocar de tema é puramente visual.
 *
 * **Invariante:** `fog` precisa ficar próximo de `ceuHorizonte`. É a névoa que
 * esconde o surgimento dos chunks distantes; se as duas cores destoarem,
 * aparece uma parede de cor no fim da pista em vez de um horizonte.
 */

export interface Tema {
  nome: string;

  // --- céu e névoa
  ceuTopo: number;
  ceuHorizonte: number;
  fog: number;
  fogNear: number;
  fogFar: number;

  // --- pista (assadas como cor por vértice na geometria do chunk)
  estrada: number;
  bordaEstrada: number;
  meioFio: number;
  faixa: number;

  // --- cenário lateral
  predios: readonly number[];
  /** Faixas [mín, máx] de largura/profundidade e altura. É o que separa
   *  "torres altas e estreitas" de "formações baixas e largas". */
  predioLargura: readonly [number, number];
  predioAltura: readonly [number, number];

  // --- luz
  sol: number;
  solIntensidade: number;
  hemiCeu: number;
  hemiChao: number;
  hemiIntensidade: number;

  // --- pós-processamento
  /** Força do brilho. A noite quer bloom forte (neon, faixas); o deserto, fraco. */
  bloomIntensidade: number;
  /** Acima de que luminância o pixel começa a brilhar. Cena clara pede limiar alto,
   *  senão o quadro inteiro estoura. */
  bloomLimiar: number;
  vinheta: number;
  /** -1 a 1. Positivo satura (deserto), negativo lava a cor (noite). */
  saturacao: number;
  brilho: number;
  contraste: number;
}

export const TEMAS: readonly Tema[] = [
  {
    nome: 'entardecer',
    ceuTopo: 0x2f6ea8,
    ceuHorizonte: 0xf0b782,
    fog: 0xe3b189,
    fogNear: 45,
    fogFar: 140,
    estrada: 0x474d58,
    bordaEstrada: 0x3a3f49,
    meioFio: 0xcfc9ba,
    faixa: 0xefe4c4,
    predios: [0x6b7a8f, 0x8a94a6, 0x55606f, 0x7d8598],
    predioLargura: [3, 7.5],
    predioAltura: [5, 29],
    sol: 0xfff1de,
    solIntensidade: 2.1,
    hemiCeu: 0x2f6ea8,
    hemiChao: 0x50463c,
    hemiIntensidade: 1.15,
    bloomIntensidade: 0.65,
    bloomLimiar: 0.7,
    vinheta: 0.5,
    saturacao: 0,
    brilho: 0.015,
    contraste: 0.06,
  },
  {
    nome: 'noite',
    ceuTopo: 0x0a0a18,
    ceuHorizonte: 0x3b2358,
    fog: 0x352050,
    fogNear: 35,
    fogFar: 125,
    // O asfalto não pode ser tão escuro quanto a noite pediria: o personagem
    // é escuro, e sobre preto ele some. Este tom mantém a leitura da silhueta
    // — legibilidade do que o jogador controla vem antes da atmosfera.
    estrada: 0x2f3444,
    bordaEstrada: 0x20242f,
    meioFio: 0x5a678a,
    // A faixa quase branca sustenta a leitura das pistas no escuro, e é ela
    // que o bloom pega.
    faixa: 0xe8f4ff,
    predios: [0x141a2c, 0x1d2440, 0x101423, 0x25305a],
    predioLargura: [3, 7],
    predioAltura: [8, 34],
    // Luz de lua fria, forte o bastante para os acentos neon da jaqueta
    // aparecerem e o personagem não virar uma mancha preta.
    sol: 0x9fb4ff,
    solIntensidade: 1.5,
    hemiCeu: 0x3a2a70,
    hemiChao: 0x14161f,
    hemiIntensidade: 1.0,
    // Limiar baixo e intensidade alta: é o que faz faixas, moedas e acentos
    // neon brilharem de verdade no escuro — o efeito que define a noite.
    bloomIntensidade: 1.15,
    bloomLimiar: 0.5,
    vinheta: 0.62,
    // Levemente lavado: à noite o olho perde saturação, e o contraste faz o
    // que sobra de cor (o neon) saltar mais.
    saturacao: -0.08,
    brilho: 0,
    contraste: 0.12,
  },
  {
    nome: 'deserto',
    ceuTopo: 0x6a86c4,
    ceuHorizonte: 0xf6c48a,
    fog: 0xf0bd8a,
    fogNear: 55,
    fogFar: 150,
    estrada: 0xbfa079,
    bordaEstrada: 0xa88a64,
    meioFio: 0xe6d3b3,
    faixa: 0xfff3dc,
    predios: [0xb08356, 0xc99a68, 0x966f47, 0xd8b183],
    // Baixas e largas: viram formações rochosas, não prédios.
    predioLargura: [5, 13],
    predioAltura: [2, 9],
    sol: 0xffe3b8,
    solIntensidade: 2.4,
    hemiCeu: 0x9fb6e0,
    hemiChao: 0x8a6a45,
    hemiIntensidade: 1.3,
    // Cena clara pede limiar alto e bloom fraco: com os valores da noite o
    // quadro inteiro estouraria de branco.
    bloomIntensidade: 0.4,
    bloomLimiar: 0.82,
    vinheta: 0.36,
    saturacao: 0.12,
    brilho: 0.01,
    contraste: 0.04,
  },
];

/** Estado da progressão de temas numa dada distância. */
export interface ProgressoTema {
  /** Índice do tema de origem. */
  atual: number;
  /** Índice do tema de destino — igual a `atual` fora da transição. */
  proximo: number;
  /** 0 = totalmente no tema atual, 1 = totalmente no próximo. */
  t: number;
}

/**
 * Mapeia distância percorrida para tema. Determinístico de propósito: a mesma
 * distância dá sempre o mesmo resultado, então a bateria do bot continua
 * reproduzível e o tema pode ser conferido em teste.
 *
 * A transição ocupa os últimos `transicao` metros de cada segmento.
 */
export function temaEmDistancia(
  distancia: number,
  segmento: number,
  transicao: number,
): ProgressoTema {
  const indice = Math.floor(distancia / segmento);
  const atual = ((indice % TEMAS.length) + TEMAS.length) % TEMAS.length;
  const proximo = (atual + 1) % TEMAS.length;

  const dentroDoSegmento = distancia - indice * segmento;
  const inicioDaTransicao = segmento - transicao;
  if (dentroDoSegmento < inicioDaTransicao) {
    return { atual, proximo: atual, t: 0 };
  }
  return {
    atual,
    proximo,
    t: Math.min(1, (dentroDoSegmento - inicioDaTransicao) / transicao),
  };
}
