// UmaExam の結合画像の2列（T154・2026-11-09・決定 583〜588・596〜620）の検査。
// run-smoke.mjs の末尾から register157() で呼ばれる（塊の見出しはすべて「T154」で始まる。`npm run test:visual -- --only=T154` で回せる）。
//
//  - 586: 「結合画像の設定」に「3列｜2列」。既定は3列。選んだ形は保存し、開き直しても残る。
//  - 604: 2列の間は「集計条件」のチェックを隠す（3列に戻すと元の状態で出る）。596: 2列では集計条件を描かない。
//  - 603・613: 通常・めろっぷ拡張の「検出」「sp70緑」のカードは、ラベルの右に数字（カードの右の内側に右寄せ）・高さは元の 0.72 倍（3列・2列とも）。
//  - 619: 3列の帯の下の線は3モードとも無い。620: 2列の3列目の人と人の間（親・祖1 の帯の下）の線は残す。
//  - 2列の組み立て（UmaStar の T98 と同じ）: 親は1枚目の上の欄つき・小窓の左右の端で切る・祖2人は同じ縮小率で親の高さにそろえる・
//    3列目は人の上端から・親の列と同じ幅・列の間 8px・画素数が 1,600万を超えたら全体を縮める・小窓の帯が無い人は切らず上の欄も足さない。
//  - 596・605・615・618: 見出し（帯）は通常・めろっぷ拡張では検出数カードかシナリオ因子・遺伝子が ON のときだけ・効率を指定ではいつも／
//    3列目に描くものが無ければ置かない／印＋凡例だけなら凡例を1・2列目の下に幅いっぱいで（3列の補助の帯と同じ関数）。
//  - 612: 効率を指定の2列では3人の帯の高さをそろえない。606・616: 脚注は左詰め・上の線なし・凡例との間は行の高さの半分。
// 人の画像は作り物（Canvas。小窓の上端の緑の帯と、小窓の外の濃い灰を描く）。OCR の結果も作り物に差し替える（数え方の関数を置き換える）。
// スキル名は検査の側に書かない（恒久ルール1）。因子・遺伝子の行は作り物の文字。

export async function register157(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const open = async (viewport) => {
		const sp = await openPage(browser, base, 'exam.html', viewport || { width: 1280, height: 900 }, EMPTY);
		sp.page.setDefaultTimeout(60000);
		await sp.page.evaluate(() => {
			const W = 1179;
			window.__t154 = {
				W,
				GREEN: [110, 200, 60], OUT: [70, 70, 70], IN: [235, 235, 235],
				// 1人分。src＝1枚目の画（小窓の上端の緑の帯が y=100・左右の端 L=40・R=W-40）。content＝結合画像（描き始めは 1枚目の y=400 から）
				person(h, o) {
					const opt = o || {};
					const L = 40, R = W - 40;
					const src = document.createElement('canvas'); src.width = W; src.height = 2400;
					const g = src.getContext('2d');
					g.fillStyle = 'rgb(70,70,70)'; g.fillRect(0, 0, W, src.height);
					g.fillStyle = 'rgb(235,235,235)'; g.fillRect(L, 100, R - L, src.height - 100);
					if (!opt.noBand) { g.fillStyle = 'rgb(110,200,60)'; g.fillRect(L, 100, R - L, 60); }
					const c = document.createElement('canvas'); c.width = opt.w || W; c.height = h;
					const x = c.getContext('2d');
					x.fillStyle = 'rgb(70,70,70)'; x.fillRect(0, 0, c.width, h);
					x.fillStyle = 'rgb(235,235,235)'; x.fillRect(L, 0, R - L, h);
					x.fillStyle = 'rgb(200,120,40)'; for (let y = 60; y + 40 < h; y += 120) x.fillRect(L + 100, y, 300, 40);
					c._sourcePlacements = [{ fileIndex: 0, srcY0: 400, srcY1: 2400, outY0: 0 }];
					return { src, c };
				},
				async fileOf(canvas, name) { const b = await new Promise((r) => canvas.toBlob(r, 'image/png')); return new File([b], name, { type: 'image/png' }); },
				px(c, x, y) { return Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)); },
				// 行 y の [x0, x1) のうち、帯の下の線の色（#e2e2e2）の画素の割合
				ruleShare(c, y, x0, x1) {
					const d = c.getContext('2d').getImageData(x0, y, x1 - x0, 1).data;
					let n = 0;
					for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 226) <= 3 && Math.abs(d[i + 1] - 226) <= 3 && Math.abs(d[i + 2] - 226) <= 3) n++;
					return n / (x1 - x0);
				},
				// [y0, y1) の行のうち、[x0, x1) の 60% 以上が灰色（#d0d0d0〜#e2e2e2 あたり）の行
				grayRows(c, x0, x1, y0, y1) {
					const out = [];
					const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
					const w = x1 - x0;
					for (let y = 0; y < y1 - y0; y++) {
						let n = 0;
						for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i] >= 195 && d[i] <= 232 && Math.abs(d[i] - d[i + 1]) <= 4 && Math.abs(d[i] - d[i + 2]) <= 4) n++; }
						if (n >= w * 0.6) out.push(y0 + y);
					}
					return out;
				},
				// [x0, x1)×[y0, y1) で白でない画素の左端の x（無ければ -1）
				inkLeft(c, x0, x1, y0, y1) {
					const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
					const w = x1 - x0;
					let best = -1;
					for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) { if (best < 0 || x < best) best = x; break; } }
					return best < 0 ? -1 : x0 + best;
				},
				inkRight(c, x0, x1, y0, y1) {
					const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
					const w = x1 - x0;
					let best = -1;
					for (let y = 0; y < y1 - y0; y++) for (let x = w - 1; x >= 0; x--) { const i = (y * w + x) * 4; if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) { if (x > best) best = x; break; } }
					return best < 0 ? -1 : x0 + best;
				},
				saved: null,
				// OCR の結果と人の画像を作り物に差し替える。heights … 6人ぶんの結合画像の高さ（0 はその人なし）。o.noBand … 小窓の帯の無い人の番号の並び
				async install(heights, o) {
					const opt = o || {};
					const T = this;
					const made = {};
					const files = [];
					for (let i = 0; i < 6; i++) {
						if (!heights[i]) { files.push([]); continue; }
						const p = T.person(heights[i], { noBand: (opt.noBand || []).includes(i), w: opt.w });
						made[PERSON_LABELS[i]] = p.c;
						files.push([await T.fileOf(p.src, 'p' + i + '.png')]);
					}
					if (!T.saved) T.saved = { stitchPersonCanvas, countDetected, countCategory, scenarioFactorHighlight, aptitudeGeneHighlight, drawAttrIconsOnPerson,
						drawEffIconsOnPerson, effPersonItems, effTotals, buildTargetAdjustmentNotes, stitchDrawEffPersonBanner, stitchDrawPersonBanner };
					T.calls = { adjust: 0, eff: [], plain: [] };
					const S = T.saved;
					const clone = (c) => { const o2 = document.createElement('canvas'); o2.width = c.width; o2.height = c.height; o2.getContext('2d').drawImage(c, 0, 0); o2._sourcePlacements = c._sourcePlacements; return o2; };
					stitchPersonCanvas = async (fs, video, label) => (made[label] ? clone(made[label]) : null);
					countDetected = (idx) => 31 - idx;
					countCategory = () => 7;
					// 因子は全員1行・遺伝子は人ごとに 1・2・0 行（帯の高さが人ごとに違う＝3列で線が階段になっていた形）
					scenarioFactorHighlight = () => ({ items: [{ text: '因子X：★2' }], more: false });
					aptitudeGeneHighlight = (idx) => { const n = [1, 2, 0][idx % 3]; return n ? { items: Array.from({ length: n }, (_, k) => ({ text: '遺伝子' + k + '：★1' })), more: false } : null; };
					drawAttrIconsOnPerson = (c, idx, run) => ({ kinds: run.attrIcons ? ['sp70', 'green'] : [], suppressed: null });
					drawEffIconsOnPerson = () => ({ placed: 0, wanted: 0, sizes: [], suppressed: null });
					effPersonItems = () => [];
					effTotals = () => null;
					buildTargetAdjustmentNotes = (...a) => { T.calls.adjust++; return ['作り物の集計条件の行']; };
					stitchDrawEffPersonBanner = (...a) => { T.calls.eff.push(Object.assign({}, a[6] || {})); return S.stitchDrawEffPersonBanner(...a); };
					stitchDrawPersonBanner = (...a) => { T.calls.plain.push(Object.assign({}, a[6] || {})); return S.stitchDrawPersonBanner(...a); };
					return files;
				},
				uninstall() { if (this.saved) Object.entries(this.saved).forEach(([k, f]) => { window[k] = f; }); this.saved = null; },
				// 押した時点の写し（captureRun）を作り物の画像・設定で上書き
				run(files, o) {
					const opt = Object.assign({ mode: 'normal', cols: 3, banner: true, scenario: true, marks: true, legend: true, conditions: true }, o || {});
					const r = Object.assign(captureRun(), {
						files, videos: files.map(() => null), deck: false, cols: opt.cols, attrIcons: opt.marks, effShoes: opt.marks,
						show: { banner: opt.banner, scenario: opt.scenario, legend: opt.legend, conditions: opt.conditions },
						factors: new Set(['作り物']), genes: new Set(['作り物']),
						scope: opt.mode === 'eff' ? 'efficiency' : 'default', melop: opt.mode === 'melop',
						eff: opt.mode === 'eff' ? { bounds: effBounds.slice(), tiers: [true, true, true, true] } : null
					});
					return r;
				}
			};
		});
		return sp;
	};
	// ページの中で作り物を入れて fn を回し、必ず元に戻す
	const withFakes = (page, heights, o, fnSrc, args) => page.evaluate(async ({ heights, o, fnSrc, args }) => {
		const T = window.__t154;
		if (o && o.eff) await loadEffData();
		const files = await T.install(heights, o);
		try { return await (eval('(' + fnSrc + ')'))(T, files, args); }
		finally { T.uninstall(); }
	}, { heights, o, fnSrc: fnSrc.toString(), args: args || null });

	await block('T154 (1) 「結合画像の設定」の「3列｜2列」: 既定は3列・選んだ形を保存して開き直しても残る・2列の間は「集計条件」のチェックを隠し、3列に戻すと元の状態で出る', async () => {
		const sp = await open({ width: 375, height: 812 });
		try {
			const { page } = sp;
			await page.evaluate(() => selectStepTab(2));
			const st = () => page.evaluate(() => {
				const p = document.getElementById('stitch-show-panel');
				const cond = p.querySelector('[data-stitch-hot="conditions"]');
				return {
					cols: stitchCols, stored: localStorage.getItem('uma-exam-stitch-cols'),
					btns: [...p.querySelectorAll('[data-stitch-cols]')].map((b) => b.textContent.trim() + ':' + b.getAttribute('aria-pressed')),
					drawerBtns: document.querySelectorAll('#stitch-show-panel-drawer [data-stitch-cols]').length,
					condHidden: cond.hidden, condShown: !!(cond.offsetWidth || cond.offsetHeight), condChecked: p.querySelector('#stitch-show-conditions').checked,
					condStored: localStorage.getItem('uma-exam-stitch-conditions'),
					wire: [...p.querySelectorAll('[data-stitch-wire-cols]')].filter((s) => !s.hidden).map((s) => s.getAttribute('data-stitch-wire-cols')),
					effCond: stitchShowEffective().conditions, effCols: stitchShowEffective().cols,
					wide: document.documentElement.scrollWidth > window.innerWidth
				};
			});
			const s0 = await st();
			assert(s0.cols === 3 && s0.stored === null && s0.btns.join('|') === '3列:true|2列:false' && s0.wire.join() === '3' && s0.drawerBtns === 2,
				'T154(1) 既定は3列（保存値なし）。ボタンは「3列」「2列」で3列が押された状態・模式図は3列の形・引き出しのパネルにも同じ2択', s0);
			// 3列で「集計条件」を OFF にしてから2列へ
			await page.evaluate(() => setStitchShow('conditions', false));
			await page.evaluate(() => document.querySelector('#stitch-show-panel [data-stitch-cols="2"]').click());
			const s1 = await st();
			assert(s1.cols === 2 && s1.stored === '2' && s1.btns.join('|') === '3列:false|2列:true' && s1.wire.join() === '2',
				'T154(1) 「2列」を押すと2列になり保存される（uma-exam-stitch-cols＝2）・模式図は2列の形', s1);
			assert(s1.condHidden && !s1.condShown && s1.condStored === '0' && s1.effCond === false && !s1.wide,
				'T154(1) 2列の間は「集計条件」のチェックを隠す（薄くせずに隠す・保存値は残す）・合成には効かない・横にはみ出さない', s1);
			// 2列の間に「集計条件」を ON に戻しても（保存値は変わる）、2列の合成には効かない
			await page.evaluate(() => setStitchShow('conditions', true));
			const s1b = await st();
			assert(s1b.condHidden && s1b.condStored === '1' && s1b.effCond === false, 'T154(1) 2列の間は集計条件の保存値が ON でも合成には出さない', s1b);
			await page.evaluate(() => setStitchShow('conditions', false));
			// 開き直す
			await page.reload();
			await page.waitForFunction(() => typeof stitchCols !== 'undefined' && document.querySelector('#stitch-show-panel [data-stitch-cols]'));
			await page.waitForTimeout(300);
			await page.evaluate(() => selectStepTab(2));
			const s2 = await st();
			assert(s2.cols === 2 && s2.btns.join('|') === '3列:false|2列:true' && s2.condHidden, 'T154(1) 開き直しても2列のまま（チェックも隠れたまま）', s2);
			await page.evaluate(() => document.querySelector('#stitch-show-panel [data-stitch-cols="3"]').click());
			const s3 = await st();
			assert(s3.cols === 3 && s3.stored === '3' && !s3.condHidden && s3.condShown && s3.condChecked === false && s3.effCond === false,
				'T154(1) 3列に戻すと「集計条件」のチェックが元の状態（OFF）で出る', s3);
			await page.evaluate(() => setStitchShow('conditions', true));
			const s4 = await st();
			assert(s4.condChecked && s4.effCond === true, 'T154(1) 3列で ON に戻すと集計条件を描く', s4);
			// 壊れた保存値は3列
			await page.evaluate(() => { localStorage.setItem('uma-exam-stitch-cols', 'x'); restoreStitchShow(); });
			const s5 = await st();
			assert(s5.cols === 3, 'T154(1) 保存値が壊れていれば3列', s5);
			// 古い形の run（cols が無い）は3列。画像を更新の比べ方に形が入る
			const r = await page.evaluate(() => {
				const run = captureRun();
				delete run.cols;
				return { old: stitchShowEffective(run).cols, two: stitchShowEffective(Object.assign({}, run, { cols: 2 })).cols };
			});
			assert(r.old === 3 && r.two === 2, 'T154(1) cols の無い run は3列・cols＝2 の run は2列', r);
			assert(sp.errors.length === 0, 'T154(1) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});

	await block('T154 (2) 帯: 通常・めろっぷ拡張のカードはラベルの右に数字（右寄せ）・高さは元の 0.72 倍／帯の下の線は opts.rule のときだけ（3モード）', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(async () => {
				await loadEffData();
				const T = window.__t154, W = T.W;
				const pad = Math.round(W * 0.03), titleH = Math.round(W * 0.065), cardH = Math.round(W * 0.185), gapY = Math.round(W * 0.02);
				const cardBox = Math.round(cardH * 0.72);
				const plain = stitchDrawPersonBanner(W, '親A', 31, 7, null, null, { cards: true, factors: true });
				const plainRule = stitchDrawPersonBanner(W, '親A', 31, 7, null, null, { cards: true, factors: true, rule: true });
				const head = stitchDrawPersonBanner(W, '親A', 31, 7, null, null, { cards: false, factors: false });
				const eff = stitchDrawEffPersonBanner(W, '親A', 31, 7, null, null, { cards: true, factors: true });
				const effRule = stitchDrawEffPersonBanner(W, '親A', 31, 7, null, null, { cards: true, factors: true, rule: true });
				const bottom = (c) => [c.height - 1, c.height - 2].map((y) => T.ruleShare(c, y, 0, c.width));
				// カードの中の字: 左のカード（x: pad 〜 pad+cardW）。ラベルは左の 45% に、数字の右端はカードの 92% 付近
				const cardW = (W - pad * 2 - Math.round(W * 0.03)) / 2;
				const y0 = pad + titleH + gapY, y1 = y0 + cardBox;
				const labelL = T.inkLeft(plain, pad + 4, pad + Math.round(cardW * 0.45), y0 + 4, y1 - 4);
				const valueR = T.inkRight(plain, pad + Math.round(cardW * 0.5), pad + Math.round(cardW) - 4, y0 + 4, y1 - 4);
				const valueL = T.inkLeft(plain, pad + Math.round(cardW * 0.5), pad + Math.round(cardW) - 4, y0 + 4, y1 - 4);
				const labelR = T.inkRight(plain, pad + 4, pad + Math.round(cardW * 0.5), y0 + 4, y1 - 4);
				return {
					h: plain.height, want: pad * 2 + titleH + gapY + cardBox, headH: head.height,
					labelL, labelR, labelWant: Math.round(pad + cardW * 0.08), valueR, valueL, valueWant: Math.round(pad + cardW * 0.92), mid: Math.round(pad + cardW * 0.5),
					plainBottom: bottom(plain), plainRuleBottom: bottom(plainRule), headBottom: bottom(head), effBottom: bottom(eff), effRuleBottom: bottom(effRule)
				};
			});
			assert(r.h === r.want, 'T154(2) カードの段の高さは元の cardH（幅の 0.185）の 0.72 倍（帯の高さ＝余白×2＋見出し＋間＋カード）', r);
			assert(Math.abs(r.labelL - r.labelWant) <= 5 && r.valueR <= r.valueWant && r.valueR >= r.valueWant - 20 && r.labelR < r.mid && r.valueL > r.mid + 20,
				'T154(2) カードのラベルは左（カードの幅の 8%）・数字はカードの右の内側に右寄せ（右端がカードの幅の 92%）', r);
			assert(r.plainBottom.every((s) => s === 0) && r.headBottom.every((s) => s === 0) && r.effBottom.every((s) => s === 0),
				'T154(2) 帯の下の線は既定では引かない（通常・見出しだけ・効率を指定）', r);
			assert(r.plainRuleBottom[0] > 0.95 && r.effRuleBottom[0] > 0.95, 'T154(2) opts.rule のときは帯の下に線（#e2e2e2）を引く（検査の線の見つけ方が効く印）', r);
			assert(sp.errors.length === 0, 'T154(2) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});

	await block('T154 (3) 3列の結合画像: 人ごとに帯の高さが違っても帯の下に線が無い（3モード）・カードは横並び・集計条件は今のまま描く', async () => {
		const sp = await open();
		try {
			for (const mode of ['normal', 'melop', 'eff']) {
				const r = await withFakes(sp.page, [2000, 1700, 2200, 0, 0, 0], { eff: mode === 'eff' }, async (T, files, mode) => {
					const run = T.run(files, { mode, cols: 3 });
					const c = await buildStitchedSetImage(0, run);
					// 帯の行の高さ＝いちばん高い帯（人の画像の上端の上まで）
					const opts = mode === 'eff' ? T.calls.eff : T.calls.plain;
					const W = T.W;
					const bannerRowH = c.height - 0; // 上から人の画像の灰の始まりまでを探す
					let top = -1;
					for (let y = 0; y < c.height; y++) { const p = T.px(c, 5, y); if (p[0] === 70 && p[1] === 70 && p[2] === 70) { top = y; break; } }
					const lines = [0, 1, 2].map((k) => T.grayRows(c, k * (W + 8) + 10, k * (W + 8) + W - 10, 0, top));
					return { mode, w: c.width, h: c.height, top, lines, adjust: T.calls.adjust, rules: opts.map((o) => !!o.rule), n: opts.length, layout: !!c._layout };
				}, mode);
				assert(r.top > 0 && r.lines.every((l) => l.length === 0), 'T154(3) ' + r.mode + ' 3列: 帯の行（人の画像の上）に横の灰色の線が無い（人ごとに遺伝子の行の数が違う＝帯の高さが違う組）', r);
				assert(r.n === 3 && r.rules.every((x) => !x) && !r.layout && r.w === 1179 * 3 + 16, 'T154(3) ' + r.mode + ' 3列: 帯は線なしで描く・幅は3人＋間 8px×2（今の3列のまま）', r);
				if (r.mode !== 'eff') assert(r.adjust > 0, 'T154(3) ' + r.mode + ' 3列: 集計条件は今のまま描く', r);
			}
			assert(sp.errors.length === 0, 'T154(3) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});

	await block('T154 (4) 2列の組み立て（通常・全部入り）: 親は上の欄つき・小窓の端で切る・祖は同じ縮小率で親の高さに・3列目は親の列と同じ幅・人の間の線・脚注は左詰めで上の線なし・集計条件は描かない', async () => {
		const sp = await open();
		try {
			const r = await withFakes(sp.page, [2000, 1700, 2200, 0, 0, 0], {}, async (T, files) => {
				const run = T.run(files, { cols: 2 });
				const c = await buildStitchedSetImage(0, run);
				const L = c._layout;
				const x3 = L.col3.x;
				const parts = L.col3.parts;
				// 帯の下端の行（1・2人目は線・3人目は無し）
				const ruleAt = parts.slice(0, 3).map((p) => T.ruleShare(c, p.y + p.h - 1, x3, x3 + L.col3.w));
				// 脚注（4つ目の部品）の中: 横の灰色の線が無い・字の左端
				const n = parts[3];
				const noteGray = T.grayRows(c, x3 + 5, x3 + L.col3.w - 5, n.y, n.y + n.h);
				const noteLeft = T.inkLeft(c, x3, x3 + L.col3.w, n.y, n.y + n.h);
				return {
					w: c.width, h: c.height, L, ruleAt, noteGray, noteLeft, noteWant: x3 + Math.round(L.col3.w * 0.03), adjust: T.calls.adjust,
					fontWant: stitchNoteMetrics(document.createElement('canvas').getContext('2d'), L.col3.w, L.col3.w, STITCH_COUNT_NOTE).fontSize,
					rules: T.calls.plain.map((o) => !!o.rule), widths: null,
					topPx: T.px(c, 5, 5), bodyPx: T.px(c, 3, L.parent.topH + 20), grandPx: T.px(c, L.grands[0].x + 3, 30), personMeta: (c._personMeta || []).map((p) => p.label)
				};
			});
			const L = r.L;
			assert(L.cols === 2 && L.parent && L.parent.topH === 300 && L.parent.band && L.parent.w === 1179 - 80,
				'T154(4) 1列目＝親: 1枚目の上の欄（小窓の上端の帯〜描き始めの行＝300px）を先頭に足し、左右は小窓の端で切る（幅 1179−80）', L.parent);
			assert(r.topPx.join() === '110,200,60' && r.bodyPx.join() === '235,235,235' && r.grandPx.join() === '235,235,235',
				'T154(4) 切ったあとの画: 左上は小窓の上端の緑の帯・小窓の外の濃い灰は残らない（親・祖）', { top: r.topPx, body: r.bodyPx, grand: r.grandPx });
			const sumG = L.grands.reduce((s, g) => s + g.h, 0);
			assert(L.grands.length === 2 && sumG === L.colH && L.colH === 2300 && Math.abs(L.grandScale - 2300 / 3900) < 1e-9 && L.grands[1].y === L.grands[0].h && L.grands[0].x === L.parent.w + 8,
				'T154(4) 2列目＝祖1 の下に祖2: 同じ縮小率で2人の高さの合計を1列目の高さにそろえる（間は空けない）・列の間 8px', { grands: L.grands, colH: L.colH, scale: L.grandScale });
			const col2W = Math.max(...L.grands.map((g) => g.w));
			assert(L.col3.x === L.parent.w + 8 + col2W + 8 && L.col3.w === L.parent.w && L.col3.y === 0 && r.w === L.col3.x + L.col3.w && r.h === Math.max(L.colH, L.col3.h) && L.scale === 1,
				'T154(4) 3列目: 人の上端から・幅は親の列と同じ・列の間 8px・外の余白なし・高さは長いほうの列', { col3: L.col3, w: r.w, h: r.h });
			assert(L.col3.parts.length === 4 && L.headings === true && r.rules.join() === 'true,true,false',
				'T154(4) 3列目は帯（親→祖1→祖2）＋補助の帯。線は人と人の間だけ（親・祖1 の帯の下）', { parts: L.col3.parts, rules: r.rules });
			assert(r.ruleAt[0] > 0.95 && r.ruleAt[1] > 0.95 && r.ruleAt[2] === 0, 'T154(4) 画の中でも、親・祖1 の帯の下に線があり、祖2 の帯の下には無い', r.ruleAt);
			assert(r.noteGray.length === 0 && Math.abs(r.noteLeft - r.noteWant) <= 6, 'T154(4) 脚注は左詰め（帯の字と同じ左の余白）・上に区切り線なし', { gray: r.noteGray, left: r.noteLeft, want: r.noteWant });
			// T160（決定 656・662）: 補助の帯の字は「脚注の1行が3列目の幅に入る大きさ」（599）から 40px の固定（列の幅で折り返す）に変えた。詳しくは blocks-163
			assert(r.adjust === 0 && L.noteFont === 40, 'T154(4) 2列では集計条件を描かない（集計条件の行を作らない）・補助の帯の字は 40px（T160・決定 662）', { adjust: r.adjust, font: L.noteFont, was599: r.fontWant });
			assert(r.personMeta.join() === '親A,祖A1,祖A2', 'T154(4) コピーの行のための人の並びは今のまま', r.personMeta);
			assert(sp.errors.length === 0, 'T154(4) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});

	await block('T154 (5) 2列の見出しと3列目: 検出数カードとシナリオ因子・遺伝子が両方 OFF なら見出しなし／印＋凡例だけなら凡例を1・2列目の下に（3列目なし）／印も OFF なら3列目なし／効率を指定はいつも見出し・帯の高さをそろえない', async () => {
		const sp = await open();
		try {
			const r = await withFakes(sp.page, [2000, 1700, 2200, 0, 0, 0], { eff: true }, async (T, files) => {
				const out = {};
				const lay = async (o) => { T.calls.plain = []; T.calls.eff = []; T.calls.adjust = 0; const c = await buildStitchedSetImage(0, T.run(files, Object.assign({ cols: 2 }, o))); return { c, L: c._layout, plain: T.calls.plain.slice(), eff: T.calls.eff.slice() }; };
				for (const mode of ['normal', 'melop']) {
					const noCard = await lay({ mode, banner: false });
					const noScen = await lay({ mode, scenario: false });
					const legendOnly = await lay({ mode, banner: false, scenario: false });
					const nothing = await lay({ mode, banner: false, scenario: false, marks: false });
					const legendOff = await lay({ mode, banner: false, scenario: false, legend: false });
					// 3列のときの補助の帯（同じ関数・人の幅 1179）と同じ高さ・字の大きさ
					const spanW = legendOnly.L.under ? legendOnly.L.under.w : 0;
					const ref = stitchDrawSharedNoteBar(spanW, T.W, { kinds: ['sp70', 'green'], suppressed: [], effNote: false }, { legend: true, conditions: false }, null, [0, 1, 2]);
					const fs = stitchNoteMetrics(document.createElement('canvas').getContext('2d'), spanW, T.W, STITCH_COUNT_NOTE).fontSize;
					const u = legendOnly.L.under;
					out[mode] = {
						noCard: { col3: !!noCard.L.col3, heads: noCard.L.headings, n: noCard.plain.length },
						noScen: { col3: !!noScen.L.col3, heads: noScen.L.headings },
						legendOnly: { col3: !!legendOnly.L.col3, under: u, spanW: legendOnly.L.grands[0].x + Math.max(...legendOnly.L.grands.map((g) => g.w)), colH: legendOnly.L.colH, h: legendOnly.c.height, w: legendOnly.c.width, refH: ref ? ref.height : 0, font: fs, n: legendOnly.plain.length,
							ink: u ? T.inkLeft(legendOnly.c, 0, 400, u.y + Math.round(u.h * 0.4), u.y + u.h) : -1 },
						nothing: { col3: !!nothing.L.col3, under: !!nothing.L.under, w: nothing.c.width, h: nothing.c.height, colH: nothing.L.colH },
						legendOff: { col3: !!legendOff.L.col3, under: !!legendOff.L.under }
					};
				}
				// 効率を指定: 両方 OFF でも見出し（帯）は出す。3人の帯の高さはそろえない（紫の行数・合計の箱をそろえる値を渡さない）
				const effAll = await lay({ mode: 'eff' });
				const effNone = await lay({ mode: 'eff', banner: false, scenario: false, marks: false });
				const hs = effAll.L.col3.parts.slice(0, 3).map((p) => p.h);
				out.eff = {
					all: { col3: !!effAll.L.col3, n: effAll.L.col3.parts.length, hs, opts: effAll.eff.map((o) => ({ min: o.purpleMinLines, res: o.totalReserve, rule: !!o.rule })) },
					none: { col3: !!effNone.L.col3, heads: effNone.L.headings, n: effNone.L.col3 ? effNone.L.col3.parts.length : 0, adjust: T.calls.adjust }
				};
				return out;
			});
			for (const mode of ['normal', 'melop']) {
				const m = r[mode];
				assert(m.noCard.col3 && m.noCard.heads && m.noCard.n === 3 && m.noScen.col3 && m.noScen.heads,
					'T154(5) ' + mode + ': 検出数カードかシナリオ因子・遺伝子の一方が ON なら見出し（帯）を3列目に出す', { noCard: m.noCard, noScen: m.noScen });
				const lo = m.legendOnly;
				assert(!lo.col3 && lo.n === 0 && lo.under && lo.under.x === 0 && lo.under.y === lo.colH && lo.under.w === lo.spanW && lo.w === lo.spanW && lo.h === lo.colH + lo.under.h,
					'T154(5) ' + mode + ': 両方 OFF で印＋凡例なら、3列目を置かず、凡例を1・2列目の下に幅いっぱい（1・2列目の幅）で置く（決定 618）', lo);
				// T160（決定 647・656・662）: その帯は上の区切り線なし・字は3列目の補助の帯と同じ 40px（3列の補助の帯の関数はやめた）。左の余白 35px は今のまま（618）。詳しくは blocks-163
				assert(lo.under.fontSize === 40 && lo.under.h < lo.refH && Math.abs(lo.ink - Math.round(1179 * 0.03)) <= 6,
					'T154(5) ' + mode + ': その凡例は字 40px・左の余白 35px（T160。3列の補助の帯より低い＝区切り線とその上の余白が無い）', lo);
				assert(!m.nothing.col3 && !m.nothing.under && m.nothing.w === lo.spanW && m.nothing.h === m.nothing.colH,
					'T154(5) ' + mode + ': 見出しも印も OFF なら3列目を置かない（画は1・2列目だけ。決定 615）', m.nothing);
				assert(!m.legendOff.col3 && !m.legendOff.under, 'T154(5) ' + mode + ': 両方 OFF・凡例 OFF なら3列目も下の帯も無い', m.legendOff);
			}
			const e = r.eff;
			assert(e.none.col3 && e.none.heads && e.none.n === 4 && e.none.adjust === 0, 'T154(5) 効率を指定: 両方 OFF でも見出し（帯）と脚注を3列目に出す（決定 605）', e.none);
			assert(e.all.opts.every((o) => o.min === undefined && o.res === undefined) && e.all.opts.map((o) => o.rule).join() === 'true,true,false' && new Set(e.all.hs).size > 1,
				'T154(5) 効率を指定の2列: 3人の帯の高さをそろえない（紫の行数・合計の箱をそろえる値を渡さない。遺伝子の行の数で高さが違う。決定 612）', e.all);
			assert(sp.errors.length === 0, 'T154(5) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});

	await block('T154 (6) 2列: 小窓の帯が見つからない人は切らず上の欄も足さない／人が欠けたセット（祖1 なし・親なし）／親B のセット／画素数が 1,600万を超えたら全体を縮める', async () => {
		const sp = await open();
		try {
			const r = await withFakes(sp.page, [2000, 1700, 0, 0, 0, 0], { noBand: [0] }, async (T, files) => {
				const c = await buildStitchedSetImage(0, T.run(files, { cols: 2 }));
				return { L: c._layout, w: c.width };
			});
			assert(r.L.parent.topH === 0 && !r.L.parent.band && r.L.parent.w === 1179 && r.L.grands.length === 1 && r.L.grands[0].w === 1179 - 80 && r.L.col3.w === 1179,
				'T154(6) 小窓の帯が無い親は切らず・上の欄も足さない（幅 1179 のまま）。祖2 のいないセットは祖1 だけ（3列目は親の列の幅）', r.L);
			const g = await withFakes(sp.page, [0, 1700, 2200, 0, 0, 0], {}, async (T, files) => {
				const c = await buildStitchedSetImage(0, T.run(files, { cols: 2 }));
				return { L: c._layout, w: c.width, h: c.height };
			});
			// T160（決定 646）: 親のいないセットは祖1｜祖2 を横に並べる形に変えた（前は1列目に積んでいた）。詳しくは blocks-163
			assert(!g.L.parent && g.L.grandScale === 1 && g.L.grands.length === 2 && g.L.grands[0].x === 0 && g.L.grands[1].x === 1099 + 8 && g.L.colH === 2200 && g.L.col3.x === (1099 + 8) * 2 && g.L.col3.w === 1099,
				'T154(6) 親のいないセット: 祖は縮めず（拡大もしない）横に並べる（T160）・上の欄は足さない・3列目は最初の人の列の幅', g.L);
			const b = await withFakes(sp.page, [0, 0, 0, 1800, 1500, 1500], {}, async (T, files) => {
				const c = await buildStitchedSetImage(1, T.run(files, { cols: 2 }));
				return { L: c._layout, meta: (c._personMeta || []).map((p) => p.label), labels: T.calls.plain.length };
			});
			assert(b.L.parent && b.L.parent.topH === 300 && b.meta.join() === '親B,祖B1,祖B2' && b.L.grands.length === 2,
				'T154(6) 親B のセット: 親B に上の欄・祖B1 の下に祖B2', b);
			const big = await withFakes(sp.page, [9000, 4500, 4500, 0, 0, 0], {}, async (T, files) => {
				const c = await buildStitchedSetImage(0, T.run(files, { cols: 2 }));
				return { L: c._layout, w: c.width, h: c.height };
			});
			assert(big.L.scale < 1 && big.w * big.h <= 16000000 && Math.abs(big.w - Math.floor(big.L.logical.width * big.L.scale)) <= 1,
				'T154(6) 画素数が 1,600万を超えるときは全体を同じ割合で縮める', { scale: big.L.scale, w: big.w, h: big.h, logical: big.L.logical });
			assert(sp.errors.length === 0, 'T154(6) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});

	await block('T154 (7) OCR の前の②の結合画像（動画の取り込みのあと）も「3列｜2列」に従う: 2列は見出しなし・3列目なし／画像を更新の比べる設定に形が入る', async () => {
		const sp = await open();
		try {
			const r = await withFakes(sp.page, [2000, 1700, 2200, 0, 0, 0], {}, async (T, files) => {
				const keep = stitchCols;
				try {
					stitchCols = 2;
					const two = await buildVideoPreviewSetImage(0, files.slice(0, 3));
					const p2 = videoPreviewParts();
					stitchCols = 3;
					const three = await buildVideoPreviewSetImage(0, files.slice(0, 3));
					const p3 = videoPreviewParts();
					return { two: { w: two.width, h: two.height, L: two._layout }, three: { w: three.width, h: three.height, layout: !!three._layout }, p2, p3, same: sameVideoPreviewParts(p2, p3) };
				} finally { stitchCols = keep; }
			});
			assert(r.two.L && r.two.L.cols === 2 && !r.two.L.col3 && r.two.L.parent.topH === 300 && r.two.w === r.two.L.grands[0].x + Math.max(...r.two.L.grands.map((g) => g.w)) && r.two.h === 2300,
				'T154(7) 2列: 親（上の欄つき）｜祖1 の下に祖2 だけ（見出し・3列目なし）', r.two);
			assert(!r.three.layout && r.three.w === 1179 * 3 + 16, 'T154(7) 3列: 今のまま（見出しの帯＋3人の横並び）', r.three);
			assert(r.p2.cols === 2 && r.p3.cols === 3 && !r.same, 'T154(7) ②の「画像を更新」が比べる設定に形が入る', r);
			assert(sp.errors.length === 0, 'T154(7) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});
}
