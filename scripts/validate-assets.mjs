/**
 * Valida a integridade dos assets binários antes do build/deploy.
 *
 * Por que existe: os 9 GLB do projeto já foram corrompidos por um
 * localizar-e-substituir global que alcançou os binários, trocando o cabeçalho
 * do chunk de `BIN\0` para `BLE\0`. O jogo **não quebrou** — ele degradou em
 * silêncio: o GLTFLoader falhava, tudo caía para a geometria de reserva, e o
 * personagem virava uma cápsula. Passou despercebido até alguém reparar.
 *
 * Falha silenciosa é o pior tipo. Este script transforma isso em erro de build.
 *
 * Uso:  node scripts/validate-assets.mjs
 * Sai com código 1 se algum asset estiver inválido.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELOS = join(RAIZ, 'public/models');
const AUDIO = join(RAIZ, 'public/audio');

const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

const problemas = [];
const ok = [];

/** Percorre a estrutura de um GLB e devolve os erros encontrados. */
function validaGlb(caminho, nome) {
  const buf = readFileSync(caminho);
  const erros = [];

  if (buf.length < 20) return [`arquivo truncado (${buf.length} bytes)`];
  if (buf.subarray(0, 4).toString('latin1') !== 'glTF') {
    return [`assinatura inválida: ${JSON.stringify(buf.subarray(0, 4).toString('latin1'))}`];
  }

  const versao = buf.readUInt32LE(4);
  if (versao !== 2) erros.push(`versão glTF inesperada: ${versao}`);

  const declarado = buf.readUInt32LE(8);
  if (declarado !== buf.length) {
    erros.push(`tamanho declarado (${declarado}) difere do real (${buf.length})`);
  }

  // Percorre os chunks conferindo tipo e limites
  let offset = 12;
  let temJson = false;
  let temBin = false;
  while (offset + 8 <= buf.length) {
    const tamanho = buf.readUInt32LE(offset);
    const tipo = buf.readUInt32LE(offset + 4);
    const inicio = offset + 8;
    const fim = inicio + tamanho;

    if (fim > buf.length) {
      erros.push(`chunk em ${offset} ultrapassa o fim do arquivo`);
      break;
    }

    if (tipo === CHUNK_JSON) {
      temJson = true;
      try {
        JSON.parse(buf.subarray(inicio, fim).toString('utf8'));
      } catch (e) {
        erros.push(`chunk JSON não parseia: ${e.message}`);
      }
    } else if (tipo === CHUNK_BIN) {
      temBin = true;
    } else {
      // É aqui que a corrupção "BLE\0" aparece.
      const comoTexto = buf.subarray(offset + 4, offset + 8).toString('latin1').replace(/\0/g, '\\0');
      erros.push(`tipo de chunk desconhecido em ${offset}: ${JSON.stringify(comoTexto)} — esperado "JSON" ou "BIN\\0"`);
    }

    offset = fim + ((4 - (tamanho % 4)) % 4);
  }

  if (!temJson) erros.push('sem chunk JSON');
  if (!temBin) erros.push('sem chunk BIN — o GLTFLoader não conseguirá resolver o buffer binário');

  return erros;
}

/** Confere só a assinatura do container Ogg. */
function validaOgg(caminho) {
  const buf = readFileSync(caminho);
  if (buf.subarray(0, 4).toString('latin1') !== 'OggS') {
    return [`assinatura Ogg inválida: ${JSON.stringify(buf.subarray(0, 4).toString('latin1'))}`];
  }
  return [];
}

function varre(pasta, extensao, validador, rotulo) {
  let arquivos;
  try {
    arquivos = readdirSync(pasta).filter((n) => n.endsWith(extensao));
  } catch {
    console.log(`  (pasta ${rotulo} ausente — ignorada)`);
    return;
  }
  if (arquivos.length === 0) problemas.push(`nenhum ${extensao} encontrado em ${rotulo}`);

  for (const nome of arquivos) {
    const caminho = join(pasta, nome);
    const erros = validador(caminho, nome);
    const kb = Math.round(statSync(caminho).size / 1024);
    if (erros.length) {
      problemas.push(`${nome}: ${erros.join('; ')}`);
      console.log(`  ✗ ${nome} (${kb} KB)`);
      for (const e of erros) console.log(`      ${e}`);
    } else {
      ok.push(nome);
      console.log(`  ✓ ${nome} (${kb} KB)`);
    }
  }
}

console.log('Validando assets binários…\n');
varre(MODELOS, '.glb', validaGlb, 'public/models');
varre(AUDIO, '.ogg', validaOgg, 'public/audio');

console.log('');
if (problemas.length) {
  console.error(`FALHOU: ${problemas.length} asset(s) inválido(s).`);
  console.error('Se for o cabeçalho de chunk trocado, `node scripts/fix-glb-chunk.mjs` corrige.');
  process.exit(1);
}
console.log(`OK: ${ok.length} asset(s) íntegro(s).`);
