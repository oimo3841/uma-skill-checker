// 結合画像の次の直しのモック（作業用。T44 で作り、T49 で作り直した）: special.html（製品のまま）で素材の家系を OCR → 結合し、lab/stitch-next-mock.js で
// 「理論値SP」の欄（T50: 1行目「合計 Pt／N種／状態」を1行に）と遺伝子の表示（G1・「名前：★N」）を差し替えた画像を作る。製品のファイルは変えない。
// T37 の画像づくり（t37-shots.mjs）と同じ流れ: 旧UI で行を入れて OCR → 写しの行・種類・セット名・レース条件・セット（①②のカード・育成ウマ娘・SP）を入れて結合。
// 遺伝子は、data/aptitude-genes.json の10種を OCR の行に足し、因子の照合のガード（完全一致だけ）を効かせて読む（数・表には入れない）。
// 使い方: node scripts/stitch-next-mock-shots.mjs <素材フォルダ> <出力フォルダ> [場合の名前,...]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, REPO_ROOT } from '../tests/visual/lib/serve.mjs';
import { openPage } from '../tests/visual/lib/fixtures.mjs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
if (!SRC || !OUT) { console.error('使い方: node scripts/stitch-next-mock-shots.mjs <素材フォルダ> <出力フォルダ> [場合の名前,...]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

// 表の行（T37 の画像と同じ 38行と種類）
const ROWS = [
	['秋ウマ娘○', 'other'], ['ペースアップ', 'card'], ['垂れウマ回避', 'card'], ['逃げためらい', 'other'], ['先行ためらい', 'other'],
	['差しためらい', 'other'], ['追込ためらい', 'other'], ['尻尾上がり', 'card'], ['遊びはおしまいっ！', 'card'], ['真っ向勝負', 'card'],
	['快速', 'card'], ['狙いを定めて', 'card'], ['中盤巧者', 'card'], ['序盤巧者', 'card'], ['素直な一歩', 'card'],
	['アグレッシブ', 'card'], ['逸る足取り', 'card'], ['熱狂的', 'card'], ['己を信じて', 'card'], ['みなぎる闘志', 'card'],
	['勇気の一歩', 'card'], ['意地っ張り', 'card'], ['勝負を懸けて', 'card'], ['連綿', 'star'], ['遊び心', 'star'],
	['アオハル点火・速', 'other'], ['レースの真髄・速', 'other'], ['レースの真髄・体', 'card'], ['レースの真髄・力', 'other'], ['レースの真髄・賢', 'other'],
	['前だけ見据えて', 'other'], ['陽の加護', 'card'], ['地の加護', 'other'], ['時代を変える者', 'other'], ['本気で休んで、もう一度', 'other'],
	['アメリカンドリーム', 'other'], ['恩返し、召し上がれ', 'other'], ['秋の目覚め', 'other'],
];
const GENES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'aptitude-genes.json'), 'utf8')).entries.map((e) => e.name);
const MAT = ['IMG_4312.PNG', 'IMG_4313.PNG', 'IMG_4314.PNG', 'IMG_4315.PNG', 'IMG_4316.PNG', 'IMG_4317.PNG', 'IMG_4318.PNG', 'IMG_4319.PNG', 'IMG_4320.PNG'];
const mat = (a, b) => MAT.slice(a, b).map((f) => path.join(SRC, f));
const F = [mat(0, 3), mat(3, 6), mat(6, 9)];

// ①②のカード・育成ウマ娘・SP（T37 の top-f6 と同じ）。継承固有の種類・ヒントLv と共通スキルのヒントLv は素材のセットで取れないので見本の値（今の既定 6種・Lv3・Lv5）
const ROSTER = ['card-0553', 'card-0544', 'card-0546', 'card-0565', 'card-0561', 'card-0564'];
const FACTOR6 = ['card-0528', 'card-0517', 'card-0415', 'card-0525', 'card-0531', 'card-0566'];
const SP = { total: 12321, totalKinds: 106, rosterPt: 8655, factorPt: 3666, statusLabel: '切れ者', uniqKinds: 6, uniqLevel: 3, commonLevel: 5 };
const SET = (sp) => ({ umaId: 'uma-0180', rosterCards: ROSTER, factorCards: FACTOR6, sp: Object.assign({}, SP, sp || {}) });

// 遺伝子の色（T49: おいもさんの決定で G1 ラズベリー。枠と字 #BE185D・塗り #FCE7F0）
const GENE_COLOR = { frame: '#BE185D', tint: '#FCE7F0', text: '#BE185D' };

const CASES = [
	{ name: 'kiremono', set: SET(), crop: true },
	{ name: 'benkyouka', set: SET({ statusLabel: '勉強家' }) },
	{ name: 'nostatus', set: SET({ statusLabel: '' }) },
	// いちばん幅の広い見本（T50。合計 99,999・999種・勉強家）
	{ name: 'widest', set: SET({ total: 99999, totalKinds: 999, statusLabel: '勉強家' }) },
].filter((c) => !ONLY || ONLY.includes(c.name));

const toUrl = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const MOCK_JS = fs.readFileSync(path.join(REPO_ROOT, 'lab', 'stitch-next-mock.js'), 'utf8');

const { base, close } = await startServer(0);
const browser = await chromium.launch();
const summary = [];
try {
	for (const cs of CASES) {
		const { ctx, page, errors } = await openPage(browser, base, 'special.html', { width: 1280, height: 900 },
			{ schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] });
		page.setDefaultTimeout(600000);
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]');
		const res = await page.evaluate(async ({ cs, urls, rows, genes, color, mockJs }) => {
			const filesOf = async (list, label) => {
				const out = [];
				for (let i = 0; i < list.length; i++) { const b = await (await fetch(list[i])).blob(); out.push(new File([b], label + '-' + i + '.png', { type: 'image/png' })); }
				return out;
			};
			if (deckMode) exitDeckMode();
			document.getElementById('skill-list').value = rows.map((r) => r[0]).concat(genes).join('\n');
			parseSkillList();
			// 遺伝子は因子として照合する（Deck連携で「遺伝子」のチェックを入れたときと同じガード＝完全一致だけ）
			factorNormSet = new Set(genes.map((n) => normalizeText(n)));
			factorMarkByNorm = new Map(genes.map((n) => [normalizeText(n), 'gene']));
			for (let i = 0; i < 3; i++) persons[i].files = await filesOf(urls[i], 'p' + i);
			for (let i = 3; i < persons.length; i++) persons[i].files = [];
			const judged = await processImages({ keepClosed: true, quiet: true });
			if (!judged || !stitchSnapshot) return { error: 'OCR に失敗' };
			// 人ごとに読めた遺伝子（data の並び）
			const genesByLabel = {};
			[0, 1, 2].forEach((i) => {
				const r = personResults[i];
				// ★は製品の starsFor と同じ読み方（数＝★の数・null＝検出したが★を測れなかった）
				genesByLabel[PERSON_LABELS[i]] = r ? genes.filter((g) => r.detectedSkills.has(g)).map((g) => ({ name: g, stars: starsFor(i, g) })) : [];
			});
			// 写しの中身（T37 と同じ）。表の行は 38行だけ（遺伝子は表・数に入れない）。枠の種類だけ遺伝子に 'gene'
			stitchSnapshot.entries = rows.map((r) => ({ id: r[0], name: r[0] }));
			stitchSnapshot.kindByName = Object.fromEntries(rows.map((r) => [r[0], r[1]]).concat(color ? genes.map((g) => [g, 'gene']) : []));
			stitchSnapshot.setName = 'LoH先行';
			stitchSnapshot.raceLabels = ['長距離', '先行', '芝'];
			stitchSnapshot.set = cs.set;
			window.__T44 = { gene: color, genesByLabel: genesByLabel };
			if (!window.__t44Loaded) { (0, eval)(mockJs); window.__t44Loaded = true; }
			window.__T44.metrics = { sp: null, heads: [], geneBoxes: [] };
			const keepKind = window.deckMarkerKindByName;
			window.deckMarkerKindByName = () => stitchSnapshot.kindByName;
			const canvas = await buildStitchedSetImage(0, null, true);
			window.deckMarkerKindByName = keepKind;
			const lay = canvas._layout;
			const M = window.__T44.metrics;
			// 遺伝子の枠を結合画像の座標へ（人の結合画像 → 両側を削る → 縮小して置く）
			const geneBoxes = [];
			M.geneBoxes.forEach((b) => {
				const p = lay.persons.find((q) => q.k === b.person % 3) || null;
				if (!p) return;
				const L0 = (p.crop && p.crop.ok) ? p.crop.L : 0;
				geneBoxes.push({ k: p.k, x: p.x + (b.left - L0) * p.scale, y: p.y + b.top * p.scale, w: (b.right - b.left) * p.scale, h: (b.bottom - b.top) * p.scale });
			});
			return { png: canvas.toDataURL('image/png'), layout: JSON.parse(JSON.stringify(lay)), sp: M.sp, heads: M.heads, geneBoxes, genesByLabel, mark: canvas._markCount,
				bar: stitchBarText(stitchSnapshot) };
		}, { cs, urls: F.map((l) => l.map(toUrl)), rows: ROWS, genes: GENES, color: GENE_COLOR, mockJs: MOCK_JS });
		if (res.error) { console.log(cs.name, 'NG', res.error); summary.push({ name: cs.name, error: res.error }); await ctx.close(); continue; }
		const file = path.join(OUT, cs.name + '.png');
		fs.writeFileSync(file, Buffer.from(res.png.split(',')[1], 'base64'));
		const L = res.layout;
		console.log(cs.name.padEnd(14), L.width + '×' + L.height, 'top.h=' + (L.top && L.top.h), 'bodyY=' + L.bodyY, 'mark=' + res.mark,
			'genes=' + JSON.stringify(res.genesByLabel), 'geneBoxes=' + res.geneBoxes.length);
		if (res.sp) res.sp.rows.forEach((r) => console.log('   ', JSON.stringify(r)));
		if (res.sp && res.sp.overflow.length) console.log('   overflow', JSON.stringify(res.sp.overflow));
		// 遺伝子の名前と★が隣の人の列にかからないか（右端と、次の人の左端の差）
		const persons = L.persons.slice().sort((a, b) => a.x - b.x);
		const gap = res.heads.filter((h) => h.box).map((h) => {
			const nx = persons.find((p) => p.x > h.x + 1);
			const right = h.box.x + h.box.w;
			return { label: h.label, texts: h.box.texts, widths: h.box.widths, right: Math.ceil(right), nextLeft: nx ? nx.x : L.width - 28, room: Math.floor((nx ? nx.x : L.width - 28) - right) };
		});
		gap.forEach((g) => console.log('   gene', JSON.stringify(g)));
		summary.push({ name: cs.name, width: L.width, height: L.height, topH: L.top && L.top.h, bodyY: L.bodyY, spMetrics: res.sp, geneHeads: gap,
			heads: res.heads, genesByLabel: res.genesByLabel, geneBoxes: res.geneBoxes, legend: L.legend, persons: L.persons.map((p) => ({ k: p.k, x: p.x, y: p.y, w: p.w, h: p.h, scale: p.scale })), mark: res.mark });
		// 上段の左の欄（理論値SP）の等倍の切り出し（欄の左右に 16px ずつ・上段の上下に 10px ずつ）
		if (L.top && L.top.sp) {
			const r = L.top.sp;
			const box = { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 10), w: r.w + 32, h: r.h + 20 };
			const sc = await page.evaluate(async ({ png, b }) => {
				const img = await new Promise((rs) => { const i = new Image(); i.onload = () => rs(i); i.src = png; });
				const c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
				c.getContext('2d').drawImage(img, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
				return c.toDataURL('image/png');
			}, { png: res.png, b: box });
			fs.writeFileSync(path.join(OUT, cs.name + '-sp.png'), Buffer.from(sc.split(',')[1], 'base64'));
		}
		// 色の案の切り出し（等倍）: 遺伝子のある人の見出しの行〜その人の遺伝子の枠の下端
		if (cs.crop && res.geneBoxes.length) {
			const byK = {};
			res.geneBoxes.forEach((b) => { (byK[b.k] = byK[b.k] || []).push(b); });
			const k = Number(Object.keys(byK).sort((a, b) => byK[b].length - byK[a].length)[0]);
			const p = L.persons.find((q) => q.k === k);
			const bx = byK[k];
			const y0 = Math.max(0, p.y - 70 - 10);
			const y1 = Math.min(L.height, Math.ceil(Math.max(...bx.map((b) => b.y + b.h))) + 20);
			const x0 = Math.max(0, p.x - 10), x1 = Math.min(L.width, p.x + p.w + 10);
			const crop = await page.evaluate(async ({ png, x0, y0, x1, y1 }) => {
				const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = png; });
				const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0;
				c.getContext('2d').drawImage(img, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
				return c.toDataURL('image/png');
			}, { png: res.png, x0, y0, x1, y1 });
			fs.writeFileSync(path.join(OUT, cs.name + '-crop.png'), Buffer.from(crop.split(',')[1], 'base64'));
			// 凡例の行も等倍で
			if (L.legend) {
				const lg = await page.evaluate(async ({ png, r }) => {
					const img = await new Promise((rs) => { const i = new Image(); i.onload = () => rs(i); i.src = png; });
					const c = document.createElement('canvas'); c.width = Math.ceil(r.w); c.height = Math.ceil(r.h);
					c.getContext('2d').drawImage(img, r.x, r.y, c.width, c.height, 0, 0, c.width, c.height);
					return c.toDataURL('image/png');
				}, { png: res.png, r: L.legend });
				fs.writeFileSync(path.join(OUT, cs.name + '-legend.png'), Buffer.from(lg.split(',')[1], 'base64'));
			}
		}
		const errs = errors.filter((m) => !/Failed to load resource|status of 404/.test(m));
		if (errs.length) console.log('  page errors:', errs.slice(0, 5));
		await ctx.close();
	}
	fs.writeFileSync(path.join(OUT, 'sizes.json'), JSON.stringify(summary, null, 1));
} finally {
	await browser.close();
	await close();
}
