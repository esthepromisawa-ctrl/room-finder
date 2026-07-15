// りざぶ郎（r326.com）読み取り専用モジュール（GitHub Actions用）
// 公式APIがないため、Webページと同じ手順（main.aspx→a.aspx）でアクセスする。
const BASE = 'https://www.r326.com/b';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) room-finder/1.0 (internal read-only)';

function parseSetCookies(res) {
  const cookies = [];
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const v of raw) cookies.push(v.split(';')[0]);
  return [...new Set(cookies)];
}

export class RizaburoSession {
  constructor(boardId) {
    this.boardId = boardId;
    this.cookies = [];
    this.statusId = null;
    this.curDate = null;
    this.selItem = null;
  }
  get cookieHeader() { return this.cookies.join('; '); }
  absorbCookies(res) {
    for (const c of parseSetCookies(res)) {
      const name = c.split('=')[0];
      this.cookies = this.cookies.filter(x => x.split('=')[0] !== name);
      this.cookies.push(c);
    }
  }
  parseMainPage(html) {
    const m = html.match(/var statusId="([^"]+)"/);
    if (!m) throw new Error('statusId が見つかりません（りざぶ郎の仕様変更の可能性）');
    this.statusId = m[1];
    const si = html.match(/selItem=(\d+)/);
    if (si) this.selItem = si[1];
    const d = html.match(/curDate=new Date\((\d+),(\d+),(\d+)\)/);
    if (d) {
      const [y, mo, day] = [Number(d[1]), Number(d[2]) + 1, Number(d[3])];
      this.curDate = `${y}${String(mo).padStart(2, '0')}${String(day).padStart(2, '0')}`;
    }
  }
  async open() {
    const res = await fetch(`${BASE}/main.aspx?id=${this.boardId}`, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok) throw new Error(`main.aspx HTTP ${res.status}`);
    this.absorbCookies(res);
    this.parseMainPage(await res.text());
    return this;
  }
  async setDate(yyyymmdd) {
    const y = Number(yyyymmdd.slice(0, 4)), mo = Number(yyyymmdd.slice(4, 6)), d = Number(yyyymmdd.slice(6, 8));
    const body = new URLSearchParams({ date: `${y}/${mo}/${d}`, status: this.statusId, itemid: this.selItem ?? '' });
    const res = await fetch(`${BASE}/main.aspx?id=${this.boardId}`, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': this.cookieHeader },
      body: body.toString(), redirect: 'follow',
    });
    if (!res.ok) throw new Error(`main.aspx(date) HTTP ${res.status}`);
    this.absorbCookies(res);
    this.parseMainPage(await res.text());
    return this;
  }
  async aaspx(params) {
    const body = new URLSearchParams({ status: this.statusId, ...params });
    const res = await fetch(`${BASE}/a.aspx`, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': this.cookieHeader },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`a.aspx(${params.c}) HTTP ${res.status}`);
    return res.text();
  }
  getItemsRaw() { return this.aaspx({ c: 'GetItems' }); }
  getSchedulesRaw() { return this.aaspx({ c: 'GetSchedules', hv: '1' }); }
}

export function parseItems(raw) {
  const rooms = [];
  for (const line of raw.split(/\r?\n/)) {
    const f = line.split('\t');
    if (f[0] !== 'm') continue;
    rooms.push({ id: f[1], name: f[2], active: f[3] !== '0' });
  }
  return rooms;
}

export function parseSchedules(raw) {
  const list = [];
  for (const line of raw.split(/\r?\n/)) {
    const f = line.split('\t');
    if (f[0] !== 's') continue;
    list.push({ id: f[1], roomId: f[2], start: f[3], end: f[4], title: f[5] || '', owner: f[9] || '' });
  }
  return list;
}
