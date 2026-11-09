// 空の集まりで判定した検査を拾う仕掛け（T155・決定 621〜623。T149 の試作 empty-probe.mjs を元にした）
//
// 何を拾うか（案B）:
//   検査のコードが、Math.min() / Math.max() を引数0個で呼んだ（Math.min(...[]) を含む）、または長さ0の配列で .every(...) を呼んだこと。
//   どちらも「何も確かめないまま真（または ±Infinity）」になる形（C-340 の段7 の iconMin と同じ形）。
//   ・Node の側: 呼んだ所（包んだ関数のすぐ外の行）が tests/ の中のときだけ数える（Playwright・製品のコードの中の呼び出しは数えない）。
//   ・ページの中: 検査が page.evaluate などで渡した関数の中だけを数える。呼んだ所が製品のスクリプト（http(s):// file:// の URL を持つ）なら数えない。
//     知らせは console.debug で Node の側へ送る（検査はコンソールの error・warning しか見ないので、結果に響かない）。
// いつ動くか（決定 623）: --only の無い全体の実行のときだけ（run-smoke.mjs 単独の全体・test:visual:parallel の全体）。
//   部分実行では読み込まない。環境変数 UMA_EMPTY_PROBE=1 で強制的に入れ、0 で切る（確かめ用）。
// 鳴ったとき（決定 622）: 塊ごとに [空] の行を出し、最後に件数をまとめるだけ。NG にはしない。
//   空でよい所は「許す一覧」（lib/empty-allow.mjs。塊の見出しと検査の行の中身で持つ）に足す。許す一覧に当たった分は行を出さず、件数だけ数える。
// 子プロセス（spawnSync で回す check:catalog など）には入らない。
import fs from 'node:fs';
import path from 'node:path';
import { EMPTY_ALLOW } from './empty-allow.mjs';

const SELF = /[\\/]lib[\\/]empty-probe\.mjs/;
const TAG = '[uma-empty-probe] ';

/** ページの中に入れる初期化のスクリプト（context ごと）。検査が速さを比べるときにも使う（export）。
 *  呼んだ所を見るためのスタックは、上の4段だけ取る。包みは引数1つ・2つの Math.min／max を元の関数へそのまま渡す
 *  （arguments と apply を通すと素の呼び出しの数倍かかり、製品の描き直しが重い所〔Deck α のスワイプの惰性。離す直前の動きから 80ms 以内に
 *  touchend を処理できないと惰性を付けない〕で、全体の並列の実行の負荷の下では判定に響いた。T155） */
export const EMPTY_PROBE_PAGE_INIT = `(() => {
	const K = Symbol.for('umaEmptyProbe'); if (window[K]) return; window[K] = 1;
	const omin = Math.min, omax = Math.max, oevery = Array.prototype.every, dbg = console.debug.bind(console);
	let busy = false;
	const rep = (kind) => {
		if (busy) return; busy = true;
		const lim = Error.stackTraceLimit;
		try {
			Error.stackTraceLimit = 4;
			const st = String(new Error().stack).split('\\n');
			// 0: Error  1: rep  2: 包んだ関数  3: 呼んだ所
			const f = (st[3] || '').trim();
			if (!/https?:\\/\\/|file:\\/\\/|chrome-extension:|data:|blob:/.test(f)) dbg(${JSON.stringify(TAG)} + kind + ' ' + f);
		} catch (e) {} finally { Error.stackTraceLimit = lim; busy = false; }
	};
	Math.min = function min(a, b) { const n = arguments.length; if (n === 2) return omin(a, b); if (n === 1) return omin(a); if (n === 0) { rep('min'); return Infinity; } return omin.apply(Math, arguments); };
	Math.max = function max(a, b) { const n = arguments.length; if (n === 2) return omax(a, b); if (n === 1) return omax(a); if (n === 0) { rep('max'); return -Infinity; } return omax.apply(Math, arguments); };
	Object.defineProperty(Array.prototype, 'every', { value: function every(fn, t) { if (this.length === 0) rep('every'); return oevery.call(this, fn, t); }, writable: true, configurable: true, enumerable: false });
})();`;

/** 全体の実行のときだけ true（UMA_EMPTY_PROBE=1 で強制・0 で切る）。 */
export function emptyProbeWanted({ only, shard, listOnly }) {
	const env = process.env.UMA_EMPTY_PROBE;
	if (listOnly) return false;
	if (env === '1') return true;
	if (env === '0') return false;
	return only.length === 0 && !shard;
}

/** スタックの1行から「tests/…:行」を取り出す（tests/ の外なら null）。 */
function testsLoc(frame) {
	const m = /([\\/]tests[\\/][^:)]*?\.m?js):(\d+)(?::\d+)?/.exec(frame || '');
	if (!m) return null;
	return { file: m[1].replace(/\\/g, '/').replace(/^.*\/tests\//, 'tests/'), line: Number(m[2]) };
}

/**
 * 仕掛けを入れる。playwright の chromium（など）の launch を包むので、chromium.launch より前に呼ぶ。
 * 戻り値: { beginBlock(no, title), endBlock(), noteAssert(label, ok), finish() }
 */
export function installEmptyProbe({ repoRoot, browserTypes, log = (s) => console.log(s) }) {
	const srcCache = new Map();
	const srcLine = (file, line) => {
		try {
			if (!srcCache.has(file)) srcCache.set(file, fs.readFileSync(path.join(repoRoot, file), 'utf8').split(/\r?\n/));
			const ls = srcCache.get(file);
			return ls[line - 1] !== undefined ? ls[line - 1] : null;
		} catch (e) { return null; }
	};
	// ページの中の関数の行（evaluate に渡した関数の n 行目）を、検査のファイルの行に読み替える。
	// 関数が evaluate を呼んだ行から始まる書き方（page.evaluate(() => { …）を前提にし、その行に当たる語が無ければ前後を探す。
	const KIND_RE = { every: /\.every\s*\(/, min: /Math\.min\b/, max: /Math\.max\b/ };
	const resolvePageLine = (caller, fnLine, kind) => {
		if (!caller || !fnLine) return caller ? caller.line : null;
		const want = caller.line + fnLine - 1;
		const re = KIND_RE[kind];
		for (const d of [0, 1, -1, 2, -2, 3, -3]) {
			const t = srcLine(caller.file, want + d);
			if (t !== null && re.test(t)) return want + d;
		}
		return want;
	};

	let cur = null;            // いまの塊 { no, title, hits: Map }
	const outside = new Map(); // 塊の外で鳴った分
	let lastCaller = null;     // ページの中の知らせを結びつける、最後に evaluate を呼んだ検査の行
	const total = { warn: 0, allowed: 0, warnBlocks: new Set(), allowedBlocks: new Set(), warnSites: new Set(), allowedSites: new Set(), list: [] };

	function note(side, kind, loc, fnPos) {
		const bucket = cur ? cur.hits : outside;
		const key = side + '|' + kind + '|' + (loc ? loc.file + ':' + loc.line : '?') + '|' + (fnPos || '');
		let r = bucket.get(key);
		if (!r) { r = { side, kind, loc, fnPos: fnPos || '', n: 0, next: null }; bucket.set(key, r); }
		r.n++;
	}

	// ---- Node の側 ----
	let busy = false;
	const stat = { nodeEmpty: 0, nodeCounted: 0 };   // 空で呼ばれた回数（数えなかった分を含む）と、検査のコードからで数えた回数
	const nodeReport = (kind) => {
		if (busy) return;
		busy = true;
		stat.nodeEmpty++;
		// スタックは上の4段だけ取る（Playwright の中で空の every が多いと、全部の段を取る重さで検査の時間の取り方に響くため。ページの側と同じ。T155）
		const lim = Error.stackTraceLimit;
		try {
			Error.stackTraceLimit = 4;
			const frames = String(new Error().stack).split('\n').slice(1);
			// 包んだ関数（この file の中）を飛ばした、すぐ外の1行が tests/ の中なら数える
			const outer = frames.find((l) => !SELF.test(l));
			const loc = testsLoc(outer);
			if (loc) { stat.nodeCounted++; note('node', kind, loc, ''); }
		} catch (e) { /* 記録に失敗しても検査は続ける */ } finally { Error.stackTraceLimit = lim; busy = false; }
	};
	const omin = Math.min, omax = Math.max, oevery = Array.prototype.every;
	Math.min = function min() { if (arguments.length === 0) nodeReport('min'); return omin.apply(Math, arguments); };
	Math.max = function max() { if (arguments.length === 0) nodeReport('max'); return omax.apply(Math, arguments); };
	Object.defineProperty(Array.prototype, 'every', {
		value: function every(fn, t) { if (this.length === 0) nodeReport('every'); return oevery.call(this, fn, t); },
		writable: true, configurable: true, enumerable: false
	});

	// ---- ページの側 ----
	const INIT = EMPTY_PROBE_PAGE_INIT;

	const patched = new WeakSet();
	const EVAL_NAMES = ['evaluate', 'evaluateHandle', '$eval', '$$eval', 'evaluateAll', 'waitForFunction'];
	function wrapEval(proto) {
		if (!proto || patched.has(proto)) return;
		patched.add(proto);
		for (const nm of EVAL_NAMES) {
			if (!Object.prototype.hasOwnProperty.call(proto, nm)) continue;
			const f = proto[nm];
			if (typeof f !== 'function') continue;
			proto[nm] = function (...args) {
				try {
					const frames = String(new Error().stack).split('\n').slice(1).filter((l) => !SELF.test(l));
					for (const l of frames) { const loc = testsLoc(l); if (loc) { lastCaller = loc; break; } }
				} catch (e) { /* 何もしない */ }
				return f.apply(this, args);
			};
		}
	}
	const wrapChain = (obj) => { let p = obj ? Object.getPrototypeOf(obj) : null; for (let i = 0; p && p !== Object.prototype && i < 4; i++, p = Object.getPrototypeOf(p)) wrapEval(p); };
	let handleDone = false;
	function onPage(p) {
		try {
			wrapChain(p);
			wrapChain(p.mainFrame());
			wrapChain(p.locator('html'));
			if (!handleDone) { handleDone = true; p.$('html').then((h) => { if (h) { wrapChain(h); h.dispose().catch(() => {}); } }).catch(() => { handleDone = false; }); }
		} catch (e) { /* 何もしない */ }
		p.on('console', (m) => {
			try {
				if (m.type() !== 'debug') return;
				const t = m.text();
				if (!t.startsWith(TAG)) return;
				const rest = t.slice(TAG.length);
				const sp = rest.indexOf(' ');
				const kind = rest.slice(0, sp);
				const where = rest.slice(sp + 1).replace(/^at /, '');
				const pm = /:(\d+):(\d+)\)?$/.exec(where);
				const fnPos = pm ? pm[1] + ':' + pm[2] : where.slice(0, 60);
				const caller = lastCaller;
				const line = caller ? resolvePageLine(caller, pm ? Number(pm[1]) : 0, kind) : null;
				note('page', kind, caller ? { file: caller.file, line } : null, fnPos);
			} catch (e) { /* 何もしない */ }
		});
	}
	async function onContext(ctx) {
		try { await ctx.addInitScript({ content: INIT }); } catch (e) { /* 何もしない */ }
		ctx.on('page', onPage);
		for (const p of ctx.pages()) onPage(p);
	}
	const patchedBrowsers = new WeakSet();
	function patchBrowser(b) {
		const proto = Object.getPrototypeOf(b);
		if (patchedBrowsers.has(proto)) return;
		patchedBrowsers.add(proto);
		const nc = proto.newContext;
		proto.newContext = async function (...a) { const ctx = await nc.apply(this, a); await onContext(ctx); return ctx; };
	}
	for (const bt of browserTypes || []) {
		if (!bt) continue;
		const launch = bt.launch;
		bt.launch = async function (...a) { const b = await launch.apply(this, a); patchBrowser(b); return b; };
		const lpc = bt.launchPersistentContext;
		if (lpc) bt.launchPersistentContext = async function (...a) { const ctx = await lpc.apply(this, a); await onContext(ctx); return ctx; };
	}

	// ---- 許す一覧 ----
	const allowedBy = (title, r) => {
		const text = r.loc ? srcLine(r.loc.file, r.loc.line) : null;
		return EMPTY_ALLOW.find((a) => (!a.title || String(title || '').includes(a.title))
			&& (!a.file || (r.loc && r.loc.file === a.file))
			&& (text !== null && String(text).includes(a.line))) || null;
	};
	const describe = (r) => {
		const where = r.loc ? r.loc.file + ':' + r.loc.line : '（場所不明）';
		const text = r.loc ? srcLine(r.loc.file, r.loc.line) : null;
		const kindText = r.kind === 'every' ? '長さ0の every' : 'Math.' + r.kind + '()（引数0個）';
		return where + (r.side === 'page' ? '（ページの中・関数の ' + r.fnPos + '）' : '') + ' ' + kindText + ' ×' + r.n
			+ (text ? '  「' + String(text).trim().slice(0, 140) + '」' : '')
			+ (r.next ? '  → 次の確かめ [' + (r.next.ok ? 'OK' : 'NG') + '] ' + r.next.label.slice(0, 100) : '');
	};
	function flush(hits, no, title) {
		for (const r of hits.values()) {
			const siteKey = r.loc ? r.loc.file + ':' + r.loc.line + '|' + r.kind : '?|' + r.kind + '|' + r.fnPos;
			const allow = allowedBy(title, r);
			if (allow) {
				total.allowed++; total.allowedSites.add(siteKey); if (no != null) total.allowedBlocks.add(no);
				continue;
			}
			total.warn++; total.warnSites.add(siteKey); if (no != null) total.warnBlocks.add(no);
			total.list.push({ no, title, site: siteKey });
			log('[空] ' + (no != null ? '#' + no + ' ' : '（塊の外）') + describe(r));
		}
		hits.clear();
	}

	return {
		beginBlock(no, title) { cur = { no, title, hits: new Map() }; lastCaller = null; },
		endBlock() { if (!cur) return; const c = cur; cur = null; flush(c.hits, c.no, c.title); },
		noteAssert(label, ok) {
			const bucket = cur ? cur.hits : outside;
			for (const r of bucket.values()) if (r.next === null) r.next = { label: String(label), ok: !!ok };
		},
		/** 最後のまとめ。EMPTY_SUMMARY の1行（並列の起動側が足し合わせる）も出す。 */
		finish() {
			flush(outside, null, '');
			const s = { warn: total.warn, warnSites: [...total.warnSites], warnBlocks: total.warnBlocks.size, allowed: total.allowed, allowedSites: [...total.allowedSites], allowedBlocks: total.allowedBlocks.size, nodeEmpty: stat.nodeEmpty, nodeCounted: stat.nodeCounted };
			log('空の判定: 許す一覧の外 ' + s.warnSites.length + 'か所（' + s.warnBlocks + '塊・' + s.warn + '件）・許す一覧に当たった分 ' + s.allowedSites.length + 'か所（' + s.allowedBlocks + '塊）');
			log('EMPTY_SUMMARY ' + JSON.stringify(s));
			return s;
		}
	};
}
