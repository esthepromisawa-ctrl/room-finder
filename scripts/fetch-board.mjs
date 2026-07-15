// りざぶ郎から今日から N 日分の予約表を取得し、暗号化して board.enc.json を生成する。
// GitHub Actions から定期実行される（ローカルでも ROOM_PASSWORD を設定して実行可）。
// 予約者名・件名を含むため、平文の board.json は公開リポジトリに置かない。
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto } from 'node:crypto';
import { RizaburoSession, parseItems, parseSchedules } from './rizaburo-read.mjs';

// 予約表のIDやVIP用URLは公開ソースに置かず、環境変数（GitHub Secrets）から渡す
const BOARD_ID = process.env.BOARD_ID;
const VIP_URL = process.env.VIP_URL || '';
const DAYS = Number(process.env.DAYS || 21); // 取得する日数
const PASSWORD = process.env.ROOM_PASSWORD;
if (!PASSWORD || !BOARD_ID) {
  console.error('環境変数 ROOM_PASSWORD / BOARD_ID が未設定です');
  process.exit(1);
}
const OUT = fileURLToPath(new URL('../board.enc.json', import.meta.url));

// パスワードから鍵を導出して AES-GCM で暗号化する（ブラウザ側のWebCryptoと同じ方式）
async function encrypt(plaintext, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const b64 = buf => Buffer.from(buf).toString('base64');
  return { v: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

function ymd(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

const session = new RizaburoSession(BOARD_ID);
await session.open();
const rooms = parseItems(await session.getItemsRaw()); // 部屋一覧は日によらず共通

const days = {};
const today = new Date();
for (let i = 0; i < DAYS; i++) {
  const d = new Date(today);
  d.setDate(today.getDate() + i);
  const key = ymd(d);
  if (session.curDate !== key) await session.setDate(key);
  if (session.curDate !== key) throw new Error(`日付切替に失敗: 要求${key} 実際${session.curDate}`);
  days[key] = parseSchedules(await session.getSchedulesRaw());
  process.stdout.write(`  ${key}: ${days[key].length}件\n`);
}

const board = { boardId: BOARD_ID, vipUrl: VIP_URL, generatedAt: new Date().toISOString(), rooms, days };
const encrypted = await encrypt(JSON.stringify(board), PASSWORD);
await writeFile(OUT, JSON.stringify(encrypted));
console.log(`board.enc.json を生成しました（${DAYS}日分・部屋${rooms.length}・暗号化済み）`);
