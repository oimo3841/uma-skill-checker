// 動画V1-1（T42・2026-10-31）: js/video-frames.js（動画から結合の素材のフレームを選ぶ部品）の検査。
// run-smoke.mjs の末尾から register80() で呼ばれる（塊の見出しはすべて「T42動画」で始まる。`npm run test:visual -- --only=T42動画` で回せる）。
//
// 素材は作り物の画（おいもさんの決定 2026-10-31: 検査は作り物の画のフレームの列を主にする）。ゲームの画面の動画はリポジトリに入れない。
// canvas に描いた作り物の一覧（上の固定部分・区画の頭の青いパネル・模様の行・継承履歴の緑の帯・下の固定部分）を、
// 決めた軌跡（止まり・戻り・速すぎる区間を含む）でずらしたフレームの列として UmaVideoFrames.canvasSource で渡す。
// 動画ファイルを作らないので、復号・シークの差が入らず決定的になる。本物の動画2本は手元だけ（npm run test:video-local）。
//
// 見ること: 区画で3人に分かれる・各人の1枚目が頭から 0.25W 以内・継ぎ目のずれが描いたずれと一致・止まり・戻り・速すぎる区間・
// 真っ白／真っ黒のフレームを捨てる・取り消し・組み立ての高さが stitchOnePerson と同じ。どれも該当が0件でない（空振りでない）ことも見る。
// 部品はどのページからもまだ読み込まない（V1-2 で special.html につなぐ）ので、検査用の空のページに common.js → stitch.js → video-frames.js を読む。

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

// ページの中で作り物の画を作る（文字列で渡して addScriptTag で読む）
const SYNTH = String.raw`
window.__synth = (function () {
	const W = 720, H = 1560, HE = 640, FS = 1360, CH = FS - HE; // スマホ版相当（縦横比 2.17）。本文の帯は 640〜1359
	const ROW = 96, HEAD = 60;
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	// 一覧（縦に長い1枚）。人 i の頭（青いパネル）の y と、最後の人の行の終わり（緑の帯）の y を持つ
	const rowsPer = [18, 14, 10];
	const heads = [];
	let y = 40;
	for (const n of rowsPer) { heads.push(y); y += HEAD + n * ROW; }
	const green = y;
	const docH = green + 50 + 600;
	const doc = document.createElement('canvas'); doc.width = W; doc.height = docH;
	const d = doc.getContext('2d');
	d.fillStyle = 'rgb(222,222,222)'; d.fillRect(0, 0, W, docH);
	const r = rng(42);
	const textRow = (y0, h) => {
		d.fillStyle = 'rgb(236,236,236)'; d.fillRect(0, y0, W, h - 6);
		d.fillStyle = 'rgb(200,200,200)'; d.fillRect(0, y0 + h - 6, W, 6);
		const n = 7 + Math.floor(r() * 5);
		for (let k = 0; k < n; k++) {
			const g = 30 + Math.floor(r() * 90);
			d.fillStyle = 'rgb(' + g + ',' + g + ',' + (g + 10) + ')';
			d.fillRect(Math.floor(r() * (W - 60)), y0 + 6 + Math.floor(r() * (h - 40)), 20 + Math.floor(r() * 110), 12 + Math.floor(r() * 18));
		}
		d.fillStyle = 'rgb(240,150,40)'; d.fillRect(20 + Math.floor(r() * 80), y0 + 10 + Math.floor(r() * 30), 28, 28);
	};
	for (let i = 0; i < heads.length; i++) {
		d.fillStyle = 'rgb(40,170,235)'; d.fillRect(30, heads[i], W - 60, HEAD);
		d.fillStyle = 'rgb(255,255,255)'; d.fillRect(60, heads[i] + 18, 100, 24); d.fillRect(300 + i * 40, heads[i] + 18, 160, 24);
		for (let k = 0; k < rowsPer[i]; k++) textRow(heads[i] + HEAD + k * ROW, ROW);
	}
	d.fillStyle = 'rgb(120,190,40)'; d.fillRect(0, green, W, 50);
	for (let k = 0; k < 6; k++) textRow(green + 50 + k * 100, 100);
	// どの行にも1pxの短い線（x=300〜620。区画の頭を見る列 x=0.3W は避ける）。行どうしが似ず、本文の帯の上端の行でも差が出る
	for (let yy = 0; yy < docH; yy++) {
		for (let k = 0; k < 2; k++) { const g = 40 + Math.floor(r() * 100); d.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; d.fillRect(300 + Math.floor(r() * 260), yy, 30 + Math.floor(r() * 30), 1); }
	}
	// 上と下の固定部分（緑は使わない＝キャラクターの情報の欄の判定に当たらない）
	const fixed = document.createElement('canvas'); fixed.width = W; fixed.height = H;
	const f = fixed.getContext('2d');
	f.fillStyle = 'rgb(205,195,185)'; f.fillRect(0, 0, W, HE); f.fillRect(0, FS, W, H - FS);
	const r2 = rng(7);
	for (let k = 0; k < 60; k++) { const g = 40 + Math.floor(r2() * 120); f.fillStyle = 'rgb(' + g + ',' + (g - 10) + ',' + (g - 20) + ')'; f.fillRect(Math.floor(r2() * 660), Math.floor(r2() * (HE - 40)), 20 + Math.floor(r2() * 80), 10 + Math.floor(r2() * 20)); }
	for (let k = 0; k < 12; k++) { f.fillStyle = 'rgb(90,80,70)'; f.fillRect(Math.floor(r2() * 660), FS + 20 + Math.floor(r2() * 150), 40, 20); }
	const frame = document.createElement('canvas'); frame.width = W; frame.height = H;
	const fx = frame.getContext('2d');
	// 軌跡（時刻 → スクロール量 px）: [時刻, 位置] を線でつなぐ。止まり・戻り・速すぎる区間を含む
	const maxScroll = docH - CH;
	function lerpPath(path) {
		return function (t) {
			if (t <= path[0][0]) return path[0][1];
			for (let k = 1; k < path.length; k++) {
				const [t0, s0] = path[k - 1], [t1, s1] = path[k];
				if (t <= t1) return Math.round(s0 + (s1 - s0) * (t - t0) / (t1 - t0));
			}
			return path[path.length - 1][1];
		};
	}
	const PATHS = {
		// 標準: 0〜0.5秒は止まる・3.0〜3.5秒は止まる・3.5〜4.0秒で 120px 戻る・4.5〜4.75秒は 760px（本文の帯 720px より速い）
		main: [[0, 0], [0.5, 0], [3.0, 900], [3.5, 900], [4.0, 780], [4.5, 780], [4.75, 1540], [10.0, 3115], [13.0, 4015], [13.75, maxScroll], [15.0, maxScroll]],
		// 速すぎる: 1/16 秒刻みでも本文の帯を超える（4.5〜4.75秒に 3200px）。重なりなしでつなぎ、確かでない継ぎ目になる
		jump: [[0, 0], [0.5, 0], [4.5, 1300], [4.75, 1300], [5.0, 4500 > maxScroll ? maxScroll - 200 : 4500], [6.5, maxScroll], [7.5, maxScroll]]
	};
	function make(o) {
		o = o || {};
		const pos = lerpPath(PATHS[o.path || 'main']);
		const duration = o.path === 'jump' ? 8.0 : 15.5;
		const blankAt = new Map(o.blankAt || []); // 時刻 → 'white' | 'black'（調べる画のとき）
		let fullCalls = 0;
		const stat = { fullCalls: 0, blankGrabs: 0, drawn: 0 };
		return {
			stat, pos, W, H, HE, FS, CH, heads, green, docH, maxScroll,
			source: UmaVideoFrames.canvasSource({
				width: W, height: H, duration,
				draw(t, ctx, dw, dh) {
					stat.drawn++;
					const isFull = dw === W;
					const key = Math.round(t * 1000);
					let blank = !isFull ? blankAt.get(key) : null;
					if (isFull) {
						fullCalls++; stat.fullCalls = fullCalls;
						// 取り直しの1回目と4回目は描けていない（シークの直後に描けていない動画のまね）
						if (o.grabBlank && (fullCalls === 1 || fullCalls === 4)) { blank = 'white'; stat.blankGrabs++; }
					}
					if (blank) { ctx.fillStyle = blank === 'white' ? '#fff' : '#000'; ctx.fillRect(0, 0, dw, dh); return; }
					fx.drawImage(fixed, 0, 0);
					// 末尾の 0.5秒は別の画面（コントロールセンターのまね）: 上の帯の色が変わる
					if (t > duration - 0.5) { fx.fillStyle = 'rgb(60,60,70)'; fx.fillRect(0, 0, W, HE); }
					const s = pos(t);
					fx.drawImage(doc, 0, s, W, CH, 0, HE, W, CH);
					// 等倍の画は固定部分の1行が呼ぶたびに少し変わる（動画の圧縮の差のまね。1枚目にそろえる処理で消えるはず）
					if (isFull && o.jitter) { const g = 100 + (fullCalls % 5) * 20; fx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; fx.fillRect(0, 600, W, 3); fx.fillRect(0, 1500, W, 3); }
					ctx.drawImage(frame, 0, 0, dw, dh);
				}
			})
		};
	}
	return { make };
})();
`;

export async function register80(env) {
	const { block, assert, browser, base } = env;

	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(60000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-test.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-test.html');
		await page.addScriptTag({ content: SYNTH });
		return { ctx, page, errors };
	};

	await block('T42動画(1) 作り物の画: 区画で3人に分かれる・1枚目が頭から0.25W以内・継ぎ目のずれ＝描いたずれ・止まり・戻り・速すぎる区間・真っ白／真っ黒を捨てる・固定部分をそろえる', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const s = __synth.make({ blankAt: [[2000, 'white'], [7250, 'white'], [11500, 'black']], grabBlank: true, jitter: true });
			const phases = [];
			const sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'], onProgress: (p) => { if (!phases.length || phases[phases.length - 1].phase !== p.phase) phases.push({ phase: p.phase, ratio: p.ratio }); phases.lastRatio = p.ratio; } });
			// 固定部分（上 0〜HE-32・下 FS+8〜）が1枚目と同じか（JPEG のずれは 2 階調まで許す）
			const readRows = async (file) => {
				const img = await loadImage(file);
				const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
				const x = c.getContext('2d'); x.drawImage(img, 0, 0);
				return { top: x.getImageData(0, 560, c.width, 48).data, bottom: x.getImageData(0, 1490, c.width, 20).data, w: c.width, h: c.height };
			};
			const r0 = await readRows(sel.files[0]);
			let fixedMax = 0;
			for (let i = 1; i < sel.files.length; i++) {
				const ri = await readRows(sel.files[i]);
				for (let k = 0; k < r0.top.length; k += 4) fixedMax = Math.max(fixedMax, Math.abs(r0.top[k] - ri.top[k]));
				for (let k = 0; k < r0.bottom.length; k += 4) fixedMax = Math.max(fixedMax, Math.abs(r0.bottom[k] - ri.bottom[k]));
			}
			// 取り直しの静止画が真っ白でない（真ん中の行が地の色でない）
			let blankFiles = 0;
			for (const f of sel.files) {
				const img = await loadImage(f);
				const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
				const x = c.getContext('2d'); x.drawImage(img, 0, 0);
				const px = x.getImageData(0, 300, c.width, 1).data;
				let white = 0; for (let k = 0; k < px.length; k += 4) if (px[k] > 248 && px[k + 1] > 248) white++;
				if (white > c.width * 0.9) blankFiles++;
			}
			const persons = sel.persons.map((p) => ({
				label: p.label, startT: p.startT, anchorY: p.anchorY, n: p.files.length, times: p.times, shifts: p.shifts,
				drawn: p.times.slice(0, -1).map((t, k) => s.pos(p.times[k + 1]) - s.pos(t)),
				headOffset: s.heads[sel.persons.indexOf(p)] - s.pos(p.times[0]), uncertain: p.uncertain.filter(Boolean).length,
				fileTypes: [...new Set(p.files.map((f) => f.type))]
			}));
			const pickPos = sel.picks.map((t) => s.pos(t));
			return {
				persons, pickPos, picks: sel.picks, stats: sel.stats, header: sel.header, anchors: sel.anchors, phases: phases.map((p) => p.phase), lastRatio: phases.lastRatio,
				fixedMax, blankFiles, fileCount: sel.files.length, W: s.W, CH: s.CH, HE: s.HE, FS: s.FS, blankGrabs: s.stat.blankGrabs,
				fastPicks: sel.picks.filter((t) => t > 4.5 && t < 4.75).length, frameSize: [r0.w, r0.h], seamsChecked: persons.reduce((a, p) => a + p.shifts.length, 0)
			};
		});
		assert(r.header.headerEnd === r.HE && r.header.footer === r.FS, 'T42動画(1) 本文の帯を描いた位置で見つける（' + r.HE + '〜' + r.FS + '）', r.header);
		assert(r.persons.length === 3 && r.anchors.length === 3, 'T42動画(1) 区画の頭で3人に分かれる', r.anchors);
		assert(r.persons.map((p) => p.label).join() === '親,祖1,祖2', 'T42動画(1) 人の名前は labels のとおり', r.persons.map((p) => p.label));
		assert(r.persons.every((p) => p.headOffset >= 8 && p.headOffset <= r.W * 0.25 - 8 && p.headOffset === p.anchorY), 'T42動画(1) 各人の1枚目は区画の頭が本文の帯の上から 0.25W 以内（描いた位置＝見つけた位置）', r.persons.map((p) => [p.headOffset, p.anchorY]));
		assert(r.seamsChecked >= 10 && r.persons.every((p) => p.shifts.length >= 2 && p.shifts.every((v, k) => v === p.drawn[k])), 'T42動画(1) 継ぎ目のずれがすべて描いたずれと一致（継ぎ目 ' + r.seamsChecked + ' か所）', r.persons.map((p) => p.shifts.map((v, k) => v + '/' + p.drawn[k]).join(' ')));
		assert(r.stats.stills > 0 && r.persons.every((p) => p.shifts.every((v) => v >= 20)), 'T42動画(1) 止まっている区間（' + r.stats.stills + '組）のフレームは続けて選ばない（どの継ぎ目も 20px 以上進む）', r.stats.stills);
		assert(r.stats.backs > 0 && r.pickPos.every((v, k) => k === 0 || v > r.pickPos[k - 1]), 'T42動画(1) 戻った区間（' + r.stats.backs + '組）があっても、選んだフレームの位置は下へ進むだけ', { backs: r.stats.backs, pos: r.pickPos });
		assert(r.stats.densified > 0 && r.fastPicks > 0, 'T42動画(1) 速すぎる区間は細かく取り直してつなぐ（取り直し ' + r.stats.densified + '枚・区間の中から ' + r.fastPicks + '枚を選ぶ）', { densified: r.stats.densified, fastPicks: r.fastPicks });
		assert(r.persons.every((p) => p.uncertain === 0), 'T42動画(1) 作り物の画では確かでない継ぎ目が出ない', r.persons.map((p) => p.uncertain));
		assert(r.stats.blankSkipped === 3, 'T42動画(1) 調べる画の真っ白2枚・真っ黒1枚を捨てる', r.stats.blankSkipped);
		assert(r.blankGrabs === 2 && r.stats.grabRetries === 2 && r.blankFiles === 0, 'T42動画(1) 取り直しで描けていない（真っ白）画が2回出ても取り直し、真っ白の静止画を返さない', { blankGrabs: r.blankGrabs, retries: r.stats.grabRetries, blankFiles: r.blankFiles });
		assert(r.stats.dropped > 0, 'T42動画(1) 末尾の別の画面（' + r.stats.dropped + '枚）を外す', r.stats.dropped);
		assert(r.fixedMax <= 2, 'T42動画(1) 固定部分（上と下）は1枚目の画素にそろう（等倍の画の固定部分が呼ぶたびに変わっても）', r.fixedMax);
		assert(r.persons.every((p) => p.fileTypes.join() === 'image/jpeg') && r.frameSize.join() === '720,1560', 'T42動画(1) 取り直しの静止画は等倍の JPEG', { types: r.persons.map((p) => p.fileTypes), size: r.frameSize });
		assert(r.phases.join() === 'read,select,grab' && r.lastRatio === 1, 'T42動画(1) 進捗は 読む → 選ぶ → 取り直す の順に知らせ、最後は 1', { phases: r.phases, last: r.lastRatio });
		assert(errors.length === 0, 'T42動画(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T42動画(2) 組み立て（⑥）: 高さと画素が stitchOnePerson と同じ・描いた一覧の人の高さと同じ・警告なし', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const s = __synth.make({ jitter: true });
			const sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'] });
			const out = [];
			for (let j = 0; j < sel.persons.length; j++) {
				const p = sel.persons[j];
				const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label);
				devGeometry.length = 0;
				const st = await stitchOnePerson(p.files, p.label);
				const reorder = devGeometry.some((l) => /並び替えます/.test(l));
				const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
				const b = st.getContext('2d').getImageData(0, 0, st.width, st.height).data;
				let diff = 0;
				if (a.length === b.length) for (let k = 0; k < a.length; k += 4) if (a[k] !== b[k] || a[k + 1] !== b[k + 1] || a[k + 2] !== b[k + 2]) diff++;
				const expectH = (j + 1 < s.heads.length ? s.heads[j + 1] : s.green) - s.heads[j];
				out.push({ label: p.label, n: p.files.length, h: c.height, w: c.width, stH: st.height, stW: st.width, diff, expectH, reorder,
					warn: c._stitchWarnings.length, stWarn: st._stitchWarnings.length,
					placements: c._sourcePlacements.length, stPlacements: st._sourcePlacements.length, profile: JSON.stringify(c._profileHeader) === JSON.stringify(st._profileHeader) });
			}
			return out;
		});
		assert(r.length === 3, 'T42動画(2) 3人を組み立てる', r.length);
		assert(r.every((p) => p.h === p.stH && p.w === p.stW), 'T42動画(2) 組み立ての高さ・幅が stitchOnePerson と同じ（' + r.map((p) => p.h).join('／') + '）', r.map((p) => [p.h, p.stH]));
		// 最後の人は緑の帯の手前で切る。JPEG で帯の上端の1〜2行の色がにじみ、緑と判定される行が1px下がることがある（stitchOnePerson も同じ）
		assert(r.every((p, j) => (j < r.length - 1 ? p.h === p.expectH : Math.abs(p.h - p.expectH) <= 2)), 'T42動画(2) 高さが描いた一覧の人の高さ（区画の頭から次の頭まで。最後の人は緑の帯まで±2px）と同じ', r.map((p) => [p.h, p.expectH]));
		assert(r.every((p) => p.diff === 0), 'T42動画(2) 画素も stitchOnePerson と同じ', r.map((p) => p.diff));
		assert(r.every((p) => !p.reorder && p.stWarn === 0 && p.warn === 0), 'T42動画(2) stitchOnePerson も並べ替えず警告なし・組み立ても警告なし（比べが成り立つ）', r);
		assert(r.every((p) => p.placements === p.stPlacements && p.profile), 'T42動画(2) _sourcePlacements の数と _profileHeader が stitchOnePerson と同じ形', r.map((p) => [p.placements, p.stPlacements, p.profile]));
		assert(errors.length === 0, 'T42動画(2) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T42動画(3) 1/16秒でもつながらない速さは重なりなしでつなぎ、その継ぎ目を確かでない継ぎ目として警告にする', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const s = __synth.make({ path: 'jump' });
			const sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'] });
			const persons = [];
			for (const p of sel.persons) {
				const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label);
				persons.push({ label: p.label, uncertain: p.uncertain.filter(Boolean).length, weak: p.weak.filter(Boolean).length, warn: c._stitchWarnings, h: c.height });
			}
			return { persons, densified: sel.stats.densified, total: persons.reduce((a, p) => a + p.uncertain, 0) };
		});
		assert(r.densified > 0, 'T42動画(3) 細かく取り直した（' + r.densified + '枚）', r.densified);
		assert(r.total >= 1 && r.persons.every((p) => p.uncertain === p.warn.length), 'T42動画(3) つながらない継ぎ目が確かでない継ぎ目になり、組み立ての警告の数と一致（' + r.persons.map((p) => p.uncertain).join('／') + '）', r.persons.map((p) => [p.uncertain, p.warn.length]));
		assert(r.persons.every((p) => p.warn.every((w) => w.indexOf(p.label + ': ') === 0)), 'T42動画(3) 警告は人の名前で始まる', r.persons.map((p) => p.warn));
		assert(errors.length === 0, 'T42動画(3) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T42動画(4) 取り消し: 選ぶ途中・取り直しの途中・組み立ての前に取り消すと AbortError で止まる・止まるまでが短い', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const run = async (phase) => {
				const s = __synth.make();
				const ac = new AbortController();
				let at = 0;
				const t0 = performance.now();
				try {
					await UmaVideoFrames.selectFrames(s.source, { signal: ac.signal, onProgress: (p) => { if (p.phase === phase && !at) { at = performance.now(); ac.abort(); } } });
					return { phase, threw: false };
				} catch (e) {
					return { phase, threw: true, abort: UmaVideoFrames.isAbortError(e), name: e.name, aborted: at > 0, latencyMs: Math.round(performance.now() - at), drawnAfter: s.stat.drawn, elapsed: Math.round(performance.now() - t0) };
				}
			};
			const out = [await run('read'), await run('select'), await run('grab')];
			// 組み立ての前に取り消す
			const s = __synth.make();
			const sel = await UmaVideoFrames.selectFrames(s.source, {});
			const ac = new AbortController(); ac.abort();
			try { await UmaVideoFrames.composePerson(sel.persons[0].files, sel.persons[0].shifts, sel.persons[0].uncertain, '親', { signal: ac.signal }); out.push({ phase: 'compose', threw: false }); }
			catch (e) { out.push({ phase: 'compose', threw: true, abort: UmaVideoFrames.isAbortError(e), aborted: true, latencyMs: 0 }); }
			return out;
		});
		assert(r.length === 4 && r.every((x) => x.aborted), 'T42動画(4) 4つの場面で取り消しを押せた（空振りでない）', r.map((x) => x.phase + ':' + x.aborted));
		assert(r.every((x) => x.threw && x.abort), 'T42動画(4) どの場面も AbortError で止まる', r);
		assert(r.every((x) => x.latencyMs < 1500), 'T42動画(4) 取り消してから止まるまで 1.5秒未満', r.map((x) => x.phase + ':' + x.latencyMs));
		assert(errors.length === 0, 'T42動画(4) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T42動画(5) 公開するグローバルは UmaVideoFrames の1つ・形・読めない動画は code つきの例外', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const g = window.UmaVideoFrames;
			let bad = null;
			try { await g.videoSource(new Blob([new Uint8Array(64)], { type: 'video/mp4' })); } catch (e) { bad = { code: e.code, msg: e.message }; }
			const fr = (() => { try { g.x = 1; return g.x === 1; } catch (e) { return false; } })();
			return { keys: Object.keys(g).sort(), version: g.VERSION, frozen: Object.isFrozen(g) && !fr, bad, defaults: { xs: g.DEFAULTS.xs, grabType: g.DEFAULTS.grabType, grabQ: g.DEFAULTS.grabQ, verCoarse: g.DEFAULTS.verCoarse, verYs: g.DEFAULTS.verYs } };
		});
		assert(r.keys.join() === 'DEFAULTS,VERSION,canvasSource,composePerson,isAbortError,selectFrames,videoSource' && r.frozen, 'T42動画(5) UmaVideoFrames の中身と、書き換えられないこと', r.keys);
		assert(/^\d{4}-\d{2}-\d{2}[a-z]$/.test(r.version), 'T42動画(5) VERSION が日付＋連番', r.version);
		assert(r.defaults.xs === 6 && r.defaults.grabType === 'image/jpeg' && r.defaults.grabQ === 0.92 && r.defaults.verCoarse === true && r.defaults.verYs === 4, 'T42動画(5) 既定の設定が T39 の最終形（xs=6・verYs=4・verCoarse・JPEG 0.92）', r.defaults);
		assert(r.bad && r.bad.code === 'decode', 'T42動画(5) 読めない動画は code が decode の例外', r.bad);
		assert(errors.filter((m) => !/Failed to load resource|status of 404|MEDIA|DEMUXER|Format error/i.test(m)).length === 0, 'T42動画(5) コンソールのエラーなし（読めない動画の分を除く）', errors);
		await ctx.close();
	});
}
