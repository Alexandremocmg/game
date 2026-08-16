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

  // --- fronteira
  /**
   * Cor do pórtico que marca a entrada **neste** tema. O marco anuncia o que
   * vem, não o que ficou para trás, então quem o pinta é sempre o tema de
   * destino.
   */
  marcoCor: number;

  /**
   * Comprimento próprio do tema, em unidades de mundo. Ausente = usa
   * `THEME_SEGMENT`. Existe porque o túnel não aguenta o mesmo fôlego de um
   * ambiente aberto: um corredor fechado cansa muito antes de uma cidade.
   */
  segmento?: number;

  /**
   * Presente só nos temas **fechados**. A presença deste campo é o que faz o
   * chunk ganhar teto, paredes e luminárias em vez de ser só chão — as cores
   * ficam aqui, as medidas ficam em `Track.ts`, porque elas saem das folgas de
   * colisão do jogo e não da paleta.
   */
  tunel?: {
    parede: number;
    teto: number;
    /** Tira clara rente ao teto. É o bloom que a acende — não há luz nova. */
    luminaria: number;
  };
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
    marcoCor: 0xe0a15f,
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
    // Violeta neon: com o limiar de bloom baixo da noite, o pórtico acende.
    marcoCor: 0x7a5cd6,
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
    marcoCor: 0xd9c9a3,
  },
  {
    nome: 'tunel',
    // Segmento próprio, mais curto que os 700 padrão. Um corredor fechado
    // cansa muito antes de uma cidade aberta, e 700 unidades dariam quase
    // meio minuto no mesmo lugar. 480 ainda deixa 300 de trecho estável antes
    // de a transição de saída (180) começar a clarear o mundo.
    segmento: 480,
    tunel: {
      parede: 0x262b38,
      teto: 0x1b1f29,
      // Quase branca de propósito: é ela que o bloom pega e transforma em
      // luminária. Nenhuma luz de verdade é adicionada.
      luminaria: 0xfff4d6,
    },
    // Dentro do corredor mal se vê céu, mas na boca vê-se — e é ali que uma
    // paleta destoante apareceria. Por isso céu e névoa continuam casados.
    ceuTopo: 0x05070c,
    ceuHorizonte: 0x181d2a,
    fog: 0x161b28,
    // Névoa curta: é o que fecha o fim do corredor e dá a sensação de espaço
    // apertado, em vez de um tubo que se vê até o fim.
    fogNear: 24,
    fogFar: 105,
    // Mesma razão da noite: o personagem é escuro e some sobre preto. O
    // asfalto do túnel é o mais claro que a atmosfera permite.
    estrada: 0x3a4054,
    bordaEstrada: 0x272b36,
    meioFio: 0x6b7692,
    faixa: 0xe6f0ff,
    // Ficam atrás das paredes e nunca aparecem; a paleta escura é só garantia
    // de que um vazamento não vire mancha clara.
    predios: [0x1a1f2b, 0x151922, 0x212636, 0x11141c],
    predioLargura: [4, 10],
    // Baixos de propósito: é o que garante que a parede os esconda. Um prédio
    // alto apareceria por cima do teto no canto da tela.
    predioAltura: [0.5, 2.5],
    // Não há sol dentro de um túnel, mas cortar a luz por realismo deixou o
    // personagem invisível sobre o asfalto escuro — o mesmo erro que a noite
    // já tinha ensinado. Estes valores são a luz de serviço do corredor:
    // suficiente para ler a silhueta do que se controla, que vem antes da
    // atmosfera.
    sol: 0xb8c8ee,
    solIntensidade: 1.25,
    hemiCeu: 0x3d4460,
    hemiChao: 0x1c1f29,
    hemiIntensidade: 1.2,
    // Limiar ainda mais baixo que o da noite: as luminárias são o único ponto
    // de luz do ambiente e precisam mesmo acender.
    bloomIntensidade: 1.3,
    bloomLimiar: 0.45,
    // A vinheta mais fechada do jogo — é o que vende o aperto do corredor.
    // Não passa disto: mais que isso come as pistas laterais.
    vinheta: 0.6,
    saturacao: -0.12,
    brilho: 0.02,
    contraste: 0.12,
    marcoCor: 0x4a5266,
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
 * Comprimento de cada tema e do ciclo completo, resolvidos uma vez só.
 *
 * Enquanto todos os temas mediam o mesmo, um `%` resolvia o mapeamento. Com o
 * túnel medindo menos que os outros isso deixou de valer, e a busca passa a
 * ser numa tabela acumulada. É um laço de 4 posições rodando por passo, então
 * o cache existe menos por custo e mais para não alocar um array por frame —
 * a mesma razão dos rascunhos de `Color` em `Stage.ts`.
 */
let cacheComprimentos: { padrao: number; lista: number[]; ciclo: number } | null = null;

function comprimentos(padrao: number) {
  if (!cacheComprimentos || cacheComprimentos.padrao !== padrao) {
    const lista = TEMAS.map((t) => t.segmento ?? padrao);
    cacheComprimentos = {
      padrao,
      lista,
      ciclo: lista.reduce((soma, n) => soma + n, 0),
    };
  }
  return cacheComprimentos;
}

/** Comprimento do ciclo completo de temas — usado em teste e no HUD de debug. */
export function cicloDeTemas(segmentoPadrao: number): number {
  return comprimentos(segmentoPadrao).ciclo;
}

/**
 * Mapeia distância percorrida para tema. Determinístico de propósito: a mesma
 * distância dá sempre o mesmo resultado, então a bateria do bot continua
 * reproduzível e o tema pode ser conferido em teste.
 *
 * `segmentoPadrao` vale para os temas que não declaram `segmento` próprio.
 * A transição ocupa os últimos `transicao` metros do segmento corrente, seja
 * ele qual for.
 */
export function temaEmDistancia(
  distancia: number,
  segmentoPadrao: number,
  transicao: number,
): ProgressoTema {
  const { lista, ciclo } = comprimentos(segmentoPadrao);
  // O `+ ciclo` extra mantém o resultado correto para distância negativa, que
  // não acontece em jogo mas aparece em teste.
  const noCiclo = ((distancia % ciclo) + ciclo) % ciclo;

  let atual = 0;
  let inicio = 0;
  while (atual < lista.length - 1 && inicio + lista[atual]! <= noCiclo) {
    inicio += lista[atual]!;
    atual++;
  }
  const proximo = (atual + 1) % TEMAS.length;

  const dentroDoSegmento = noCiclo - inicio;
  // Um tema mais curto que a própria transição entraria já transicionando.
  // Não é o caso hoje (o menor é 480 contra 180), mas o clamp evita que um
  // ajuste futuro de comprimento crie um tema que nunca se estabiliza.
  const inicioDaTransicao = Math.max(0, lista[atual]! - transicao);
  if (dentroDoSegmento < inicioDaTransicao) {
    return { atual, proximo: atual, t: 0 };
  }
  return {
    atual,
    proximo,
    t: Math.min(1, (dentroDoSegmento - inicioDaTransicao) / transicao),
  };
}
