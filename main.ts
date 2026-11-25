// Tiny stack VM for make.fun's ISA v1: 32-bit wrapping ints, a 256-value
// stack, 64-deep calls, 256 words of memory, input/output, ten traps, and
// a 1,000,000-step and 65,536-byte output limit. Written from the ISA spec;
// every trap code and edge case follows the reference VM exactly.
// Driver: reads /input/<id>/{program,input}.bin, writes
// /output/<id>/{stdout.bin,exit.txt} for every instance id.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// Pops / pushes per opcode byte (0..83); unknown opcodes read 0.
const PP = '000112230000000022222221222122202220000000000000011000000000000012000000000000001101';
const QQ = '011022330000000011111111111111101110000000000000000000000000000010000000000000000010';
// Decode tables built once at load: the hot loop used to re-run
// charCodeAt on these strings plus a ternary for the immediate length
// on every step. Typed-array loads are cheaper and branch-free, and
// entries past 83 stay 0, so unknown opcodes behave exactly as before.
const IMM = new Uint8Array(256), POPS = new Uint8Array(256), PUSH = new Uint8Array(256);
for (let i = 0; i < 84; i++) { POPS[i] = PP.charCodeAt(i) - 48; PUSH[i] = QQ.charCodeAt(i) - 48; }
IMM[1] = 1; IMM[2] = 4; IMM[48] = IMM[49] = IMM[50] = IMM[51] = 2;

function run(p, inp) {
  const D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256);
  const out = new Uint8Array(65536);
  const n = p.length;
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, st = 0;
  const done = (e) => [out.slice(0, ol), e];
  for (;;) {
    if (st === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    const im = IMM[op];
    if (pc + im >= n) return done(9);
    st++;
    const nx = pc + 1 + im;
    const po = POPS[op], pu = PUSH[op];
    if (sp < po) return done(2);
    if (sp - po + pu > 256) return done(3);
    pc = nx;
    switch (op) {
      case 0: return done(0);
      case 1: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 23: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32: case 33: case 34: {
        const b = D[sp - 1], a = D[sp - 2];
        let r;
        switch (op) {
          case 16: r = (a + b) | 0; break;
          case 17: r = (a - b) | 0; break;
          case 18: r = Math.imul(a, b); break;
          case 19: if (b === 0) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
          case 20: if (b === 0) return done(4); r = b === -1 ? 0 : (a % b) | 0; break;
          case 21: if (b === 0) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 22: if (b === 0) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; break;
          case 24: r = a & b; break;
          case 25: r = a | b; break;
          case 26: r = a ^ b; break;
          case 28: r = a << (b & 31); break;
          case 29: r = a >> (b & 31); break;
          case 30: r = (a >>> (b & 31)) | 0; break;
          case 32: r = a === b ? 1 : 0; break;
          case 33: r = a < b ? 1 : 0; break;
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        }
        sp -= 2; D[sp++] = r; break;
      }
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let t = true;
        if (op !== 48) { const v = D[--sp]; t = op === 49 ? v === 0 : v !== 0; }
        if (t) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return done(7);
        C[cp++] = nx; pc = p[nx - 2] | (p[nx - 1] << 8); break;
      case 52:
        if (cp === 0) return done(8);
        pc = C[--cp]; break;
      case 64: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return done(6);
        D[sp - 1] = M[a]; break;
      }
      case 65: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a > 255) return done(6);
        sp -= 2; M[a] = v; break;
      }
      case 80: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 81:
        if (ol + 1 > 65536) return done(11);
        out[ol++] = D[--sp] & 255; break;
      case 82: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83: return done(D[--sp] & 255);
      default: return done(5);
    }
  }
}

for (const e of readdirSync(I, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
  if (!e.isDirectory()) continue;
  const d = join(I, e.name);
  const [o, code] = run(readFileSync(join(d, 'program.bin')), readFileSync(join(d, 'input.bin')));
  mkdirSync(join(O, e.name), { recursive: true });
  writeFileSync(join(O, e.name, 'stdout.bin'), o);
  writeFileSync(join(O, e.name, 'exit.txt'), code + '\n');
}
