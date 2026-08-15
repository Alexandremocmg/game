/**
 * Conserta GLBs cujo cabeçalho do chunk binário foi trocado de `BIN\0` para
 * `BLE\0`.
 *
 * De onde vem o problema: um localizar-e-substituir global de "BIN" por "BLE"
 * rodou sobre o repositório inteiro e alcançou os arquivos binários. Nos GLB a
 * palavra "BIN" aparece uma única vez — no cabeçalho do segundo chunk — então
 * o estrago é exatamente esses 4 bytes. O JSON e a malha continuam íntegros.
 *
 * Sintoma que isso causa: o GLTFLoader não encontra o buffer binário, toda
 * textura falha com "Cannot read properties of null (reading 'slice')", o
 * carregamento inteiro rejeita e o jogo cai para a geometria de reserva — o
 * personagem vira uma cápsula e os obstáculos viram caixas.
 *
 * Uso:  node scripts/fix-glb-chunk.mjs [--dry]
 */
import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(RAIZ, 'public/models');
const BACKUP = join(RAIZ, 'assets-src/glb-antes-do-conserto');

const ERRADO = Buffer.from('BLE\0', 'latin1');
const CERTO = Buffer.from('BIN\0', 'latin1');
const dry = process.argv.includes('--dry');

if (!dry && !existsSync(BACKUP)) mkdirSync(BACKUP, { recursive: true });

let corrigidos = 0;
let jaOk = 0;

for (const nome of readdirSync(PASTA).filter((n) => n.endsWith('.glb'))) {
  const caminho = join(PASTA, nome);
  const buf = readFileSync(caminho);

  if (buf.subarray(0, 4).toString('latin1') !== 'glTF') {
    console.log(`  ${nome}: não é um GLB — ignorado`);
    continue;
  }

  // header: magic(4) version(4) length(4), depois chunk1: length(4) type(4) dados
  const jsonLen = buf.readUInt32LE(12);
  const posTipo = 12 + 8 + jsonLen + 4;
  const tipoAtual = buf.subarray(posTipo, posTipo + 4);

  if (tipoAtual.equals(CERTO)) {
    console.log(`  ${nome}: já está correto`);
    jaOk++;
    continue;
  }
  if (!tipoAtual.equals(ERRADO)) {
    console.log(`  ${nome}: tipo inesperado ${JSON.stringify(tipoAtual.toString('latin1'))} — NÃO alterado`);
    continue;
  }

  if (!dry) {
    copyFileSync(caminho, join(BACKUP, nome)); // rede de segurança
    CERTO.copy(buf, posTipo);
    writeFileSync(caminho, buf);
  }
  console.log(`  ${nome}: BLE\\0 -> BIN\\0${dry ? ' (simulação)' : ''}`);
  corrigidos++;
}

console.log(`\n${corrigidos} corrigido(s), ${jaOk} já ok.${dry ? ' Nada foi escrito.' : ''}`);
