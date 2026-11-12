// T175（2026-11-12・決定 709）: 収録データの写し（umaSkillDeck:masterCache・umaSkillDeck:extraCatalogCache）を、中身が変わったときだけ書く。
// 塊の見出しは「T175」で始まる（`npm run test:visual -- --only=T175`）。run-smoke.mjs の末尾から register173() で呼ばれる。
//
// 前は開くたびに2つ合わせて約48万字を書き直していた（T172 の計測）。
// - 中身が同じなら大きな2つの値を書かない。取れた時刻は小さな値（<キー>:fetchedAt）として毎回書く
// - 中身が変わったら大きな値を書く
// - 通信が切れてキャッシュに落ちたときの時刻（Deck の data-master-fetched）は「最後に取れた時刻」＝小さな値。
//   小さな値が無い前の版の写しは、大きな値の fetchedAt を出す（前と同じ）
// - 大きな値の書き込みに失敗しても（容量など）、握りつぶして進む（前と同じ）
//
// 時計を止める検査（setNoticeClock）と並んでも揺れないよう、時刻の前後は「進んだか」で見ずに、
// 大きな値の fetchedAt を古い字（2020年）に書き換えておき、書き直されなかったこと（2020年のまま）で見る。

const BIG = { master: 'umaSkillDeck:masterCache', extra: 'umaSkillDeck:extraCatalogCache' };
const SMALL = { master: BIG.master + ':fetchedAt', extra: BIG.extra + ':fetchedAt' };
const OLD_AT = '2020-01-01T00:00:00.000Z';

// 読み込みの間の localStorage.setItem をキーごとに数える（ページを読み込むたびに数え直し）
function countSets() {
	const C = {};
	window.__t175sets = C;
	const orig = Storage.prototype.setItem;
	Storage.prototype.setItem = function (k, v) {
		if (this === window.localStorage) { const e = C[k] || (C[k] = { n: 0, chars: 0 }); e.n++; e.chars += String(v).length; }
		return orig.call(this, k, v);
	};
}

export async function register173(env) {
	const { block, assert, browser, base, openPage } = env;

	const ready = (page) => page.waitForFunction(() => window.UmaSkillDeckCore && UmaSkillDeckCore.getMasterMeta().source, null, { timeout: 30000 });
	const reload = async (page) => { await page.reload({ waitUntil: 'load' }); await ready(page); };
	const sets = (page) => page.evaluate(() => window.__t175sets || {});
	const n = (s, k) => (s[k] ? s[k].n : 0);
	// 大きな値の fetchedAt だけを書き換える（中身はそのまま）
	const ageBig = (page, at) => page.evaluate(({ BIG, at }) => {
		for (const k of Object.values(BIG)) { const o = JSON.parse(localStorage.getItem(k)); o.fetchedAt = at; localStorage.setItem(k, JSON.stringify(o)); }
	}, { BIG, at });
	const stored = (page) => page.evaluate(({ BIG, SMALL }) => {
		const r = {};
		for (const w of Object.keys(BIG)) {
			const raw = localStorage.getItem(BIG[w]);
			let o = null; try { o = JSON.parse(raw); } catch (e) { /* 無い */ }
			r[w] = { len: raw ? raw.length : 0, at: o ? o.fetchedAt : null, small: localStorage.getItem(SMALL[w]), dataKeys: o && o.data ? Object.keys(o.data).length : 0 };
		}
		r.meta = UmaSkillDeckCore.getMasterMeta();
		return r;
	}, { BIG, SMALL });

	await block('T175 ―― special.html: 収録データの写しは中身が同じなら書かない（取れた時刻だけ小さな値で毎回書く）。中身が変わったら書く', async () => {
		const { ctx, page, errors } = await openPage(browser, base, 'special.html');
		try {
			await ready(page);
			const s0 = await stored(page);
			assert(s0.master.len > 50000 && s0.extra.len > 100000 && s0.master.small && s0.extra.small,
				'前提: 1回目の読み込みで大きな2つの値と、時刻の小さな値が書かれている', s0);

			// 1. 再読み込み（中身は同じ）: 大きな値は書かない。小さな値は1回ずつ書く
			await ageBig(page, OLD_AT);
			await page.addInitScript(countSets);
			await reload(page);
			const w1 = await sets(page);
			const s1 = await stored(page);
			assert(n(w1, BIG.master) === 0 && n(w1, BIG.extra) === 0,
				'2回目の読み込みで、中身が同じなら大きな2つの値（masterCache・extraCatalogCache）を書かない', w1);
			assert(n(w1, SMALL.master) === 1 && n(w1, SMALL.extra) === 1,
				'取れた時刻は小さな値として毎回1回ずつ書く', w1);
			assert(s1.master.at === OLD_AT && s1.extra.at === OLD_AT,
				'大きな値は書き直されていない（fetchedAt は書き換えておいた 2020年のまま）', s1);
			assert(s1.meta.source === 'network' && s1.master.small === s1.meta.fetchedAt && s1.master.small > OLD_AT,
				'小さな値は今回取れた時刻（masterMeta.fetchedAt と同じ）', s1);
			const total1 = Object.values(w1).reduce((a, e) => a + e.chars, 0);
			assert(total1 < 1000, '再読み込みで書く字数は合わせて1000字未満（前は約48万字）', { total1, w1 });

			// 2. 中身が変わったら書く（写しの中身を古いものに変えておく）
			await page.evaluate(({ BIG, OLD_AT }) => {
				const m = JSON.parse(localStorage.getItem(BIG.master));
				m.data.masterVersion = 'T175-古い中身';
				localStorage.setItem(BIG.master, JSON.stringify(m));
				localStorage.setItem(BIG.extra, JSON.stringify({ data: {}, fetchedAt: OLD_AT }));
			}, { BIG, OLD_AT });
			await reload(page);
			const w2 = await sets(page);
			const s2 = await stored(page);
			assert(n(w2, BIG.master) === 1 && n(w2, BIG.extra) === 1,
				'中身が変わったときは大きな2つの値を書く（1回ずつ）', w2);
			assert(s2.master.at === s2.meta.fetchedAt && s2.master.small === s2.meta.fetchedAt && s2.extra.dataKeys > 0
				&& await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).data.masterVersion !== 'T175-古い中身', BIG.master),
				'書いた大きな値は取れた中身で、fetchedAt は今回の時刻', s2);

			assert(errors.length === 0, 'コンソールエラーが出ない', errors.slice(0, 3));
		} finally { await ctx.close(); }
	});

	await block('T175 ―― uma-skill-deck.html: 通信が切れてキャッシュに落ちたとき、時刻は「最後に取れた時刻」（前の版の写しは大きな値の時刻）。書き込みの失敗は握りつぶす', async () => {
		const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
		try {
			await ready(page);
			const shown = () => page.evaluate(() => { renderDataTab(); return document.getElementById('data-master-fetched').textContent; });
			const LAST = '2025-06-01T12:34:56.000Z';

			// 1. 小さな値があるとき: 大きな値の fetchedAt（その中身を書いた時刻）ではなく、小さな値（最後に取れた時刻）を出す
			await ageBig(page, OLD_AT);
			await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: SMALL.master, v: LAST });
			await page.route('**/uma-skill-deck-skills.json*', (r) => r.abort());
			await reload(page);
			const m1 = await page.evaluate(() => UmaSkillDeckCore.getMasterMeta());
			const t1 = await shown();
			assert(m1.source === 'cache' && m1.fetchedAt === LAST && t1 === '2025-06-01 12:34:56',
				'キャッシュに落ちたとき、data-master-fetched は小さな値の「最後に取れた時刻」', { m1, t1 });

			// 2. 前の版の写し（小さな値が無い）: 大きな値の fetchedAt を出す（前と同じ）
			await page.evaluate((k) => localStorage.removeItem(k), SMALL.master);
			await reload(page);
			const m2 = await page.evaluate(() => UmaSkillDeckCore.getMasterMeta());
			const t2 = await shown();
			assert(m2.source === 'cache' && m2.fetchedAt === OLD_AT && t2 === '2020-01-01 00:00:00' && m2.version.endsWith('（キャッシュ）'),
				'小さな値が無い前の版の写しでも、キャッシュに落ちたら大きな値の fetchedAt を出す', { m2, t2 });

			// 3. 写しが無いときは組み込みのサンプルへ（前と同じ）
			await page.evaluate((k) => localStorage.removeItem(k), BIG.master);
			await reload(page);
			const m3 = await page.evaluate(() => UmaSkillDeckCore.getMasterMeta());
			assert(m3.source === 'sample', '写しが無ければ組み込みのサンプルに落ちる（前と同じ）', m3);
			await page.unroute('**/uma-skill-deck-skills.json*');

			// 4. 大きな値の書き込みが失敗しても（容量など）握りつぶして進む。古い中身に新しい時刻を付けない（小さな値も書かない）
			await page.addInitScript((k) => {
				const orig = Storage.prototype.setItem;
				Storage.prototype.setItem = function (key, v) {
					if (this === window.localStorage && key === k) throw new DOMException('T175 の試し', 'QuotaExceededError');
					return orig.call(this, key, v);
				};
			}, BIG.master);
			await page.evaluate((s) => localStorage.setItem(s, 'T175-前の時刻'), SMALL.master);
			await reload(page);
			const m4 = await page.evaluate(({ k, s }) => ({ meta: UmaSkillDeckCore.getMasterMeta(), big: localStorage.getItem(k), small: localStorage.getItem(s) }), { k: BIG.master, s: SMALL.master });
			assert(m4.meta.source === 'network' && m4.big === null && m4.small === 'T175-前の時刻',
				'大きな値を書けなくてもページは取れた中身で進み、時刻の小さな値は書き換えない', m4);

			assert(errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)).length === 0, 'コンソールエラーが出ない（通信を切った読み込みの失敗は除く）', errors.slice(0, 3));
		} finally { await ctx.close(); }
	});
}
