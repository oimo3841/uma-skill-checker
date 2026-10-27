// 段F0（2026-10-22）の検査。run-smoke.mjs の末尾から register48() で呼ばれる（塊の見出しはすべて「段F0」で始まる。`npm run test:visual -- --only=段F0` で回せる）。
//
// 背景: 段D（C-187）で、入口の「オススメサポ」の見た目が、おいもさんの指示（既存のオススメサポの見た目は変えない）に反して変わっていた。取り消した。
// 今後、見た目の指示で基準とされた既存の部品は変更禁止とし、**変更前の見た目との同一性を検査に入れる**。
// (a) オススメサポのボタンは、コミット 0530272 で測った値（tests/visual/lib/f0-baseline-0530272.json。計算された見た目と、切り出しの画素のハッシュ）と同一
//     ―― 1280・390・360px × ライト・ダーク。**この値は実装の側から読んで作らない（0530272 の画面を測った固定値）**
// (b) 脚質オススメは同じクラス・同じ計算された見た目（違いはアイコンと文字だけ）。内側の3色は黒く見えない・文字とのコントラストは 4.5:1 以上
// (c) 虹色の縁の定義（usd-rainbow-*）は残っていない

import crypto from 'node:crypto';
import { decodePng } from './lib/pixels.mjs';

export async function register48(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const BASE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests/visual/lib/f0-baseline-0530272.json'), 'utf8')).conditions;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const SAME_IDS = ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'];
	const FILTER = { surface: 'turf', style: 'nige', distance: 'medium' };
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const CONDS = [[1280, 900, 'light'], [1280, 900, 'dark'], [390, 844, 'light'], [390, 844, 'dark'], [360, 844, 'light'], [360, 844, 'dark']];
	const SEL = { outside: '#deck-template-panel [data-usd-el="outside-open"]', style: '#deck-template-panel [data-usd-el="style-open"]' };
	const rgb = (c) => (/rgba?\((\d+), (\d+), (\d+)/.exec(c || '') || []).slice(1, 4).map(Number);
	const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const FIELDS = ['cls', 'text', 'border', 'radius', 'bgColor', 'bgImage', 'bgClip', 'bgOrigin', 'color', 'boxShadow', 'filter', 'pad', 'fontSize', 'fontWeight', 'lineHeight', 'gap', 'icon'];

	const openSp = async (w, h, theme) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		await sp.page.evaluate(({ roster, theme }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			try { localStorage.setItem('uma-tools-theme', theme); } catch (e) {}
		}, { roster: { umaId: 'uma-0179', cardIds: SAME_IDS, skillFilter: FILTER }, theme });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector('#deck-template-panel .usd-entry-row', { timeout: 15000 });
		await sp.page.waitForTimeout(600);
		return sp;
	};
	// 計算された見た目（tests の外の測定スクリプトと同じ項目）
	const measure = (page, sel) => page.evaluate((sel) => {
		const b = document.querySelector(sel);
		if (!b) return null;
		const cs = getComputedStyle(b), rc = b.getBoundingClientRect();
		const ic = b.querySelector('svg, i');
		const ics = ic ? getComputedStyle(ic) : null, icr = ic ? ic.getBoundingClientRect() : null;
		return {
			cls: b.className, text: b.textContent.trim(),
			border: ['Top', 'Right', 'Bottom', 'Left'].map((s) => cs['border' + s + 'Width'] + ' ' + cs['border' + s + 'Style'] + ' ' + cs['border' + s + 'Color']),
			radius: cs.borderTopLeftRadius, bgColor: cs.backgroundColor, bgImage: cs.backgroundImage, bgClip: cs.backgroundClip, bgOrigin: cs.backgroundOrigin,
			color: cs.color, boxShadow: cs.boxShadow, filter: cs.filter,
			pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '), fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, gap: cs.gap,
			w: rc.width, h: rc.height, icon: ic ? { w: icr.width, h: icr.height, color: ics.color, stroke: ics.stroke } : null
		};
	}, sel);
	const cropHash = async (page, sel) => {
		const el = await page.$(sel);
		await el.scrollIntoViewIfNeeded();
		await page.waitForTimeout(150);
		const rc = await el.boundingBox();
		const clip = { x: Math.max(0, Math.floor(rc.x) - 6), y: Math.max(0, Math.floor(rc.y) - 6), width: Math.ceil(rc.width) + 12, height: Math.ceil(rc.height) + 12 };
		const p = decodePng(await page.screenshot({ clip }));
		return { y: rc.y, crop: { w: p.w, h: p.h, bpp: p.bpp }, sha: crypto.createHash('sha256').update(String(p.w) + 'x' + String(p.h) + 'x' + String(p.bpp) + ':').update(p.px).digest('hex') };
	};

	await block('段F0(a) 入口のオススメサポは 0530272 の見た目と同一: 計算された見た目（枠・背景・文字色・高さ・角丸・アイコン）が固定値と一致し、切り出しの画素のハッシュも一致する（1280・390・360px × ライト・ダーク）', async () => {
		for (const [w, h, theme] of CONDS) {
			const sp = await openSp(w, h, theme);
			const k = w + '-' + theme, want = BASE[k], tag = '段F0(a) ' + w + 'px・' + theme + ': ';
			const m = await measure(sp.page, SEL.outside);
			assert(!!m && !!want, tag + 'オススメサポのボタンがある', !!m);
			const bad = FIELDS.filter((f) => JSON.stringify(m[f]) !== JSON.stringify(want[f]));
			assert(bad.length === 0 && m.w === want.w && m.h === want.h, tag + '計算された見た目が 0530272 と同一（枠 ' + (m && m.border[0]) + '・高さ ' + (m && m.h) + '・角丸 ' + (m && m.radius) + '）', bad.map((f) => [f, m[f], want[f]]));
			const ph = await cropHash(sp.page, SEL.outside);
			// ②因子周回 段1（2026-10-27）: ボタンの上端が整数の位置にあるときは、0530272 で上端を整数の位置にそろえて測った値（pixelSha256IntY）と比べる
			// （0530272 の 390・360px は上端が小数の位置で、にじみの分だけ画素が違う。値の出どころは f0-baseline-0530272.json の _noteIntY）
			const wantSha = Number.isInteger(ph.y) && want.pixelSha256IntY ? want.pixelSha256IntY : want.pixelSha256;
			assert(ph.sha === wantSha && ph.crop.w === want.crop.w && ph.crop.h === want.crop.h, tag + '切り出し（ボタンの周り6px込み）の全画素が 0530272 と同一（ハッシュ一致）', [ph.crop, ph.sha.slice(0, 12), wantSha.slice(0, 12), ph.y]);
			assert(await sp.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('段F0(b) 脚質オススメはオススメサポと同じクラス・同じ計算された見た目（違いはアイコンと文字だけ）／内側の淡い3色は黒く見えず、文字とのコントラストは 4.5:1 以上（ライト・ダーク × 390・360・1280px）', async () => {
		for (const [w, h, theme] of CONDS) {
			const sp = await openSp(w, h, theme);
			const tag = '段F0(b) ' + w + 'px・' + theme + ': ';
			const a = await measure(sp.page, SEL.outside), b = await measure(sp.page, SEL.style);
			assert(!!a && !!b, tag + '2つのボタンがある', [!!a, !!b]);
			const diff = FIELDS.filter((f) => f !== 'text' && JSON.stringify(a[f]) !== JSON.stringify(b[f]));
			assert(diff.length === 0 && a.h === b.h && /usd-outside-entry/.test(b.cls), tag + '脚質オススメはオススメサポと同じクラスで、計算された見た目（枠・内側・文字色・高さ・角丸・アイコンの大きさと色）が同じ', diff.map((f) => [f, a[f], b[f]]));
			assert(a.text.indexOf('オススメサポ') !== -1 && b.text.indexOf('脚質オススメ') !== -1 && !!b.icon, tag + '違いは文字とアイコン（図柄）', [a.text, b.text]);
			const stops = (b.bgImage.match(/rgb\([^)]*\)/g) || []);
			assert(stops.length === 3, tag + '内側は3色のグラデーション（淡い虹色）', b.bgImage);
			const chroma = stops.map((c) => { const v = rgb(c); return Math.max.apply(null, v) - Math.min.apply(null, v); });
			const mixes = [];
			for (let i = 0; i < stops.length - 1; i++) for (const t of [0.25, 0.5, 0.75]) { const x = rgb(stops[i]), y = rgb(stops[i + 1]); mixes.push(x.map((v, kk) => Math.round(v + (y[kk] - v) * t))); }
			const txt = rgb(b.color);
			const worst = Math.min.apply(null, stops.map((c) => ratio(txt, rgb(c))).concat(mixes.map((c) => ratio(txt, c))));
			assert(worst >= 4.5, tag + '文字と内側（3色と間の色）のコントラスト比は最小 ' + worst.toFixed(2) + '（4.5:1 以上）', { text: b.color, stops });
			// 「黒く見えない」: 3色とも純黒ではなく色味（最大チャンネル−最小チャンネル）があり、3色は互いに違う
			assert(chroma.every((c) => c >= 15) && new Set(stops).size === 3, tag + '内側の3色は黒ではなく色味がある（色味 ' + chroma.join('・') + '）', { stops, chroma });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('段F0(c) 取り消した C-187 の虹色の縁の定義（usd-rainbow-*）が、ページの CSS にもマークアップにも残っていない', async () => {
		const sp = await openSp(390, 844, 'light');
		const r = await sp.page.evaluate(() => ({
			css: Array.from(document.querySelectorAll('style')).some((s) => /usd-rainbow/.test(s.textContent || '')),
			html: /usd-rainbow/.test(document.documentElement.outerHTML),
			vars: ['--usd-rainbow-from', '--usd-rainbow-mid', '--usd-rainbow-to'].map((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim())
		}));
		assert(!r.css && !r.html && r.vars.every((v) => v === ''), '段F0(c) usd-rainbow-* の定義もクラスも変数も無い', r);
		await sp.ctx.close();
	});
}
