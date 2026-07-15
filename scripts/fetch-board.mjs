// りざぶ郎から今日から N 日分の予約表を取得し、board.js を生成する。
// GitHub Actions から定期実行される（ローカルでも node scripts/fetch-board.mjs で実行可）。
//
// 【方針】社内PCの環境が WebCrypto（暗号解除）と fetch を封じているため、暗号は使わない。
// 代わりに、公開しても差し支えないよう「予約者名・件名は載せず、空き/予約ありの時間帯だけ」を出力する。
// データは <script src="board.js"> で読み込めるよう window.__BOARD = {...} 形式で書き出す。
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { RizaburoSession, parseItems, parseSchedules } from './rizaburo-read.mjs';

const BOARD_ID = process.env.BOARD_ID;
const VIP_URL = process.env.VIP_URL || '';
const DAYS = Number(process.env.DAYS || 21);
if (!BOARD_ID) {
  console.error('環境変数 BOARD_ID が未設定です');
  process.exit(1);
}
const OUT = fileURLToPath(new URL('../board.js', import.meta.url));

function ymd(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

const session = new RizaburoSession(BOARD_ID);
await session.open();
const rooms = parseItems(await session.getItemsRaw());

const days = {};
const today = new Date();
for (let i = 0; i < DAYS; i++) {
  const d = new Date(today);
  d.setDate(today.getDate() + i);
  const key = ymd(d);
  if (session.curDate !== key) await session.setDate(key);
  if (session.curDate !== key) throw new Error(`日付切替に失敗: 要求${key} 実際${session.curDate}`);
  // 予約者名(owner)・件名(title)は公開データに含めない。時間帯と部屋だけ残す。
  days[key] = parseSchedules(await session.getSchedulesRaw())
    .map(x => ({ roomId: x.roomId, start: x.start, end: x.end }));
  process.stdout.write(`  ${key}: ${days[key].length}件\n`);
}

const board = { boardId: BOARD_ID, vipUrl: VIP_URL, generatedAt: new Date().toISOString(), rooms, days };
await writeFile(OUT, 'window.__BOARD=' + JSON.stringify(board) + ';');
console.log(`board.js を生成しました（${DAYS}日分・部屋${rooms.length}・名前/件名なし）`);
