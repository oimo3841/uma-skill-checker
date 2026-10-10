// C-139（2026-10-10・ツール全体の微調整1）の検査。run-smoke.mjs の末尾から register19() で呼ばれる
// （塊の見出しはすべて「微調整1」で始まる。`npm run test:visual -- --only=微調整1` で回せる。A だけなら「微調整1A」など）。
//
// A: 効率を指定の画面とリスト（リセットボタン・バーの高さ28px・蹄鉄の下の個数・「？」の説明・一覧の効率・効率の高い順・コピーの2列目）
// B: 結合画像の合計（効率を指定だけ。文字・数字の大きさ・コロンのあとの間・数字の左端・帯の高さ）
// C: ヘッダーと文言（exam の冒頭・②の文面・タイトル・ツール切替のボタン・使い方ガイドの削除と画面の色の切り替えボタン）
// D: exam の①②の左右スワイプ
// スキル名・効率の数値は検査の側に書かない（恒久ルール1。データから読む）。

export async function register19(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));

	/** exam.html を開いて①へ。o.w＝幅／o.h＝高さ／o.eff＝「効率を指定」を選ぶ／o.theme＝画面の色（'light'|'dark'）／o.store＝開く前に仕込む保存値 */
	const openExam = async (o = {}) => {
		const r = await openPage(browser, base, 'exam.html', { width: o.w || 1280, height: o.h || 900 });
		const page = r.page;
		await page.evaluate(({ theme, store }) => {
			try {
				if (theme) localStorage.setItem('uma-tools-theme', theme);
				Object.keys(store || {}).forEach((k) => localStorage.setItem(k, store[k]));
			} catch (e) {}
		}, { theme: o.theme || 'light', store: o.store || null });
		if (o.theme || o.store) await page.reload({ waitUntil: 'networkidle' });
		await page.waitForTimeout(400);
		if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
		await page.evaluate(() => selectStepTab(1));
		await page.waitForFunction(() => !!effValueById, null, { timeout: 15000 });
		if (o.eff) {
			await page.click('label[for="scope-mode-efficiency"]');
			await page.waitForFunction(() => !!effData && document.querySelectorAll('.eff-seg').length === 4, null, { timeout: 15000 });
		}
		await page.waitForTimeout(300);
		return r;
	};

	/* ====================================================================
	 * A: 効率を指定の画面とリスト
	 * ==================================================================== */
	await block('微調整1A1 初期値に戻すボタン: 44px以上・バーの右の枠の中・押せない状態にしない／境目と蹄鉄を初期値へ・保存値を消す・小窓なし／すでに初期値なら知らせる', async () => {
		for (const w of [1280, 375]) {
			const { ctx, page, errors } = await openExam({ w, eff: true });
			const geo = await page.evaluate(() => {
				const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
				const btn = document.getElementById('eff-reset-btn');
				return { btn: R(btn), panel: R(document.getElementById('eff-panel')), bar: R(document.getElementById('eff-bar')), inPanel: document.getElementById('eff-panel').contains(btn),
					thumbs: [...document.querySelectorAll('.eff-thumb')].map(R), disabled: btn.disabled, label: btn.getAttribute('aria-label'), vw: document.documentElement.clientWidth,
					sw: document.documentElement.scrollWidth };
			});
			const overlap = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
			assert(geo.inPanel && geo.btn.w >= 44 && geo.btn.h >= 44 && geo.btn.r <= geo.panel.r + 0.5 && geo.btn.x >= geo.bar.r - 1 && !geo.disabled && !!geo.label && geo.sw <= geo.vw,
				'微調整1A1(' + w + 'px): リセットボタンは効率を指定の枠の中・バーの右・44px以上で、押せない状態（disabled）ではない', geo);
			assert(!overlap(geo.btn, geo.bar) && geo.thumbs.every((t) => !overlap(geo.btn, t)),
				'微調整1A1(' + w + 'px): ボタンはバー・つまみに重ならない', geo);
			// 動かす → 戻す
			const moved = await page.evaluate(() => {
				const idx = effBoundIdx();
				setEffBoundStep(0, idx[0] + 5);
				setEffBoundStep(2, idx[2] - 5);
				toggleEffTier(1);
				saveEffSettings();
				refreshAfterTargetChange({ quiet: true });
				return { b: effBounds.slice(), tiers: effTiers.slice(), stored: [localStorage.getItem('uma-exam-eff-bounds'), localStorage.getItem('uma-exam-eff-tiers')],
					count: document.getElementById('scope-count-efficiency').textContent, def: defaultEffBounds(effData) };
			});
			assert(JSON.stringify(moved.b) !== JSON.stringify(moved.def) && moved.tiers[1] === false && moved.stored[0] !== null && moved.stored[1] !== null,
				'微調整1A1(' + w + 'px): 前提: 境目を動かし・区間を1つ外し、保存した', moved);
			let dialogs = 0;
			page.on('dialog', async (d) => { dialogs++; await d.dismiss(); });
			await page.click('#eff-reset-btn');
			const after = await page.evaluate(() => ({ b: effBounds.slice(), tiers: effTiers.slice(), def: defaultEffBounds(effData),
				stored: [localStorage.getItem('uma-exam-eff-bounds'), localStorage.getItem('uma-exam-eff-tiers')],
				count: document.getElementById('scope-count-efficiency').textContent, n: effTargets().length,
				pressed: [...document.querySelectorAll('.eff-shoe')].map((s) => s.getAttribute('aria-pressed')),
				seg: [...document.querySelectorAll('.eff-seg')].map((s) => s.getAttribute('data-on')),
				thumbLeft: [...document.querySelectorAll('.eff-thumb')].map((t) => t.style.left), edges: effEdges().slice(1, 4).map((f) => f * 100 + '%'),
				overlayOpen: [...document.querySelectorAll('.uma-overlay')].some((e) => !e.hidden), disabled: document.getElementById('eff-reset-btn').disabled }));
			assert(JSON.stringify(after.b) === JSON.stringify(after.def) && after.tiers.every(Boolean) && after.pressed.every((p) => p === 'true') && after.seg.every((s) => s === 'true'),
				'微調整1A1(' + w + 'px): 押すと区間の境目はデータの defaultBounds に、蹄鉄の ON/OFF は全部 ON に戻る', after);
			assert(after.stored[0] === null && after.stored[1] === null,
				'微調整1A1(' + w + 'px): 保存値（境目・区間）は消え、初期値を保存し直さない', after.stored);
			assert(dialogs === 0 && !after.overlayOpen && !after.disabled && Number(after.count) === after.n && after.n > 0,
				'微調整1A1(' + w + 'px): 確認の小窓は出ず、押したあとも押せるまま。種数の表示も初期の区間に追随する', after);
			assert(after.thumbLeft.every((l, i) => Math.abs(parseFloat(l) - parseFloat(after.edges[i])) < 0.01),
				'微調整1A1(' + w + 'px): つまみの位置も初期の境目に戻る', after);
			// すでに初期値
			const toastBefore = await page.evaluate(() => { const t = document.getElementById('toast-message'); return t ? t.textContent : ''; });
			await page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
			await page.click('#eff-reset-btn');
			await page.waitForTimeout(100);
			const again = await page.evaluate(() => ({ toast: document.getElementById('toast-message').textContent, b: effBounds.slice(), def: defaultEffBounds(effData), disabled: document.getElementById('eff-reset-btn').disabled,
				stored: [localStorage.getItem('uma-exam-eff-bounds'), localStorage.getItem('uma-exam-eff-tiers')] }));
			assert(again.toast === 'すでに初期値です' && !again.disabled && JSON.stringify(again.b) === JSON.stringify(again.def) && again.stored[0] === null && again.stored[1] === null,
				'微調整1A1(' + w + 'px): すでに初期値のときも押せて、「すでに初期値です」と短く知らせる（何も保存しない）', again);
			// 境目を動かして元の値に戻した（保存値が初期値と同じ）ときも、押すと保存値は消える
			await page.evaluate(() => { saveEffSettings(); });
			const hadStored = await page.evaluate(() => localStorage.getItem('uma-exam-eff-bounds') !== null);
			await page.click('#eff-reset-btn');
			const cleared = await page.evaluate(() => [localStorage.getItem('uma-exam-eff-bounds'), localStorage.getItem('uma-exam-eff-tiers')]);
			assert(hadStored && cleared[0] === null && cleared[1] === null,
				'微調整1A1(' + w + 'px): 保存値が初期値と同じ形で残っていても、押すと消える', { hadStored, cleared });
			// 開き直しても初期値のまま
			await page.reload({ waitUntil: 'networkidle' });
			await page.waitForFunction(() => !!effData, null, { timeout: 15000 });
			const reopened = await page.evaluate(() => ({ b: effBounds.slice(), def: defaultEffBounds(effData), tiers: effTiers.slice() }));
			assert(JSON.stringify(reopened.b) === JSON.stringify(reopened.def) && reopened.tiers.every(Boolean), '微調整1A1(' + w + 'px): 開き直しても初期値のまま', reopened);
			assert(jsErrors(errors).length === 0, '微調整1A1(' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
			void toastBefore;
			await ctx.close();
		}
	});

	await block('微調整1A2 バーの高さ28px（シェブロン柄のタイルと同じ）: 模様が下で切れた断片を出さない（375・1280px／ライト・ダーク／一部の区間をOFF）', async () => {
		/** 区間の中央の列で、行ごとの「模様の画素」（その行の中央値の色より明るい画素）の有無を調べ、模様のある行のまとまり（連続する行）の数を返す */
		const bandRuns = async (page, seg) => {
			const buf = await page.screenshot({ clip: { x: seg.x, y: seg.y, width: seg.w, height: seg.h } });
			return page.evaluate(async ({ b64, w, h }) => {
				const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
				const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
				const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
				const d = cx.getImageData(0, 0, c.width, c.height).data;
				const x0 = 12, x1 = c.width - 12;
				const lit = [];
				for (let y = 0; y < c.height; y++) {
					const med = [0, 1, 2].map((ch) => { const arr = []; for (let x = x0; x < x1; x++) arr.push(d[(y * c.width + x) * 4 + ch]); arr.sort((a, b) => a - b); return arr[arr.length >> 1]; });
					let n = 0;
					for (let x = x0; x < x1; x++) { const o = (y * c.width + x) * 4; if ((d[o] - med[0]) + (d[o + 1] - med[1]) + (d[o + 2] - med[2]) > 24) n++; }
					lit.push(n >= 2);
				}
				// 上下の端の1行（内側の線）は除く
				const rows = lit.slice(1, lit.length - 1);
				let runs = 0, prev = false, firstLit = -1, lastLit = -1;
				rows.forEach((v, i) => { if (v && !prev) runs++; prev = v; if (v) { if (firstLit < 0) firstLit = i + 1; lastLit = i + 1; } });
				return { runs, firstLit, lastLit, height: c.height, litRows: rows.filter(Boolean).length };
			}, { b64: buf.toString('base64'), w: seg.w, h: seg.h });
		};
		for (const [w, theme] of [[375, 'light'], [375, 'dark'], [1280, 'light'], [1280, 'dark']]) {
			for (const off of [null, 1]) {
				const { ctx, page, errors } = await openExam({ w, eff: true, theme });
				if (off !== null) await page.evaluate((k) => { effTiers[k] = false; layoutEffPanel(); }, off);
				await page.evaluate(() => {
					document.getElementById('eff-bar').scrollIntoView({ block: 'center' });
					// 模様だけを調べる: 区間の個数の文字（白）は見えなくする
					const s = document.createElement('style'); s.id = 'probe-hide-n'; s.textContent = '.eff-seg-n { visibility: hidden !important; }'; document.head.appendChild(s);
				});
				await page.waitForTimeout(200);
				const info = await page.evaluate(() => {
					const bar = document.getElementById('eff-bar');
					const cs = getComputedStyle(bar);
					const segs = [...document.querySelectorAll('.eff-seg')].map((s) => { const r = s.getBoundingClientRect(); const c = getComputedStyle(s); return { x: r.x, y: r.y, w: r.width, h: r.height, on: s.getAttribute('data-on') === 'true', size: c.backgroundSize }; });
					const tile = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--exam-eff-chevron').match(/height='(\d+)'/)[1]);
					return { barH: bar.getBoundingClientRect().height, tile, segs, theme: document.documentElement.getAttribute('data-theme') };
				});
				const tag = w + 'px・' + theme + '・' + (off === null ? '全区間ON' : '区間' + off + 'をOFF');
				assert(Math.abs(info.barH - info.tile) < 0.01 && info.barH === 28 && info.theme === theme,
					'微調整1A2(' + tag + '): バーの高さ（' + info.barH + 'px）はシェブロン柄のタイルの高さ（' + info.tile + 'px）と同じ', info);
				const wide = info.segs.map((s, k) => ({ s, k })).filter((x) => x.s.w >= 40);
				assert(wide.length >= 2, '微調整1A2(' + tag + '): 検査できる幅（40px以上）の区間が2つ以上ある（空振りでない）', info.segs.map((s) => Math.round(s.w)));
				for (const { s, k } of wide) {
					const r = await bandRuns(page, s);
					if (s.on) {
						assert(r.runs === 1 && r.litRows >= 8 && r.lastLit >= info.barH - 8,
							'微調整1A2(' + tag + '): 区間' + k + '（ON）の模様は1つのまとまり（途中で切れた断片が下に出ない）', r);
					} else {
						assert(r.litRows === 0, '微調整1A2(' + tag + '): 区間' + k + '（OFF）は灰色のまま・模様なし', r);
					}
				}
				const thumb = await page.evaluate(() => { const b = document.getElementById('eff-bar').getBoundingClientRect(); return [...document.querySelectorAll('.eff-thumb')].map((t) => { const r = t.getBoundingClientRect(); return { h: r.height, up: b.top - r.top, down: r.bottom - b.bottom }; }); });
				assert(thumb.every((t) => t.h === 36 && t.up === 4 && t.down === 4), '微調整1A2(' + tag + '): つまみは上下に4pxはみ出す形のまま（高さ36px）', thumb);
				const fs = await page.evaluate(() => [...document.querySelectorAll('.eff-seg-n')].map((n) => getComputedStyle(n).fontSize));
				assert(fs.every((f) => f === '14px'), '微調整1A2(' + tag + '): 個数の数字は14pxのまま', fs);
				assert(jsErrors(errors).length === 0, '微調整1A2(' + tag + '): コンソールエラーなし', errors.slice(0, 3));
				await ctx.close();
			}
		}
	});

	await block('微調整1A3 バーの中に個数を出せない区間は、蹄鉄の下に個数（どの区間も同じ規則・読める色）／375pxの3段でも隣の蹄鉄に重ならない', async () => {
		const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
		const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
		const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
		for (const [w, theme] of [[375, 'light'], [375, 'dark'], [1280, 'light'], [1280, 'dark']]) {
			const { ctx, page, errors } = await openExam({ w, eff: true, theme });
			const probe = () => page.evaluate(() => {
				const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
				const panel = document.getElementById('eff-panel');
				return {
					bg: getComputedStyle(panel).backgroundColor,
					tiers: [0, 1, 2, 3].map((k) => {
						const seg = document.querySelector('.eff-seg[data-tier="' + k + '"]'), n = seg.querySelector('.eff-seg-n');
						const wasHidden = n.hidden; n.hidden = false; const numW = n.getBoundingClientRect().width; n.hidden = wasHidden;
						const shoe = document.querySelector('.eff-shoe[data-tier="' + k + '"]'), u = shoe.querySelector('.eff-shoe-n'), img = shoe.querySelector('img');
						const cs = getComputedStyle(u);
						return { inBarHidden: n.hidden, inBar: n.textContent, underHidden: u.hidden, under: u.textContent, color: cs.color, weight: cs.fontWeight, size: cs.fontSize,
							segW: seg.getBoundingClientRect().width, numW: numW, shoe: R(shoe), img: R(img), u: u.hidden ? null : R(u), want: effTierCount(k) };
					}),
				};
			});
			const tag = w + 'px・' + theme;
			let p = await probe();
			const rule = (q) => q.tiers.every((t) => t.inBarHidden === !t.underHidden && (t.inBarHidden ? t.under : t.inBar) === String(t.want));
			assert(rule(p), '微調整1A3(' + tag + '・初期): 個数はバーの中か蹄鉄の下のどちらか一方（同じ数字）に出る', p.tiers.map((t) => ({ inBarHidden: t.inBarHidden, underHidden: t.underHidden, want: t.want })));
			assert(p.tiers.every((t) => t.inBarHidden === (t.segW < t.numW + 8)), '微調整1A3(' + tag + '・初期): バーの中に出せないか（区間の幅 < 数字の幅＋8px）は全区間で同じ規則', p.tiers.map((t) => ({ segW: Math.round(t.segW), numW: Math.round(t.numW), inBarHidden: t.inBarHidden })));
			if (w === 375) assert(p.tiers[3].inBarHidden && !p.tiers[3].underHidden, '微調整1A3(' + tag + '・初期): 375px では虹（30種）の個数が蹄鉄の下に出る', p.tiers[3]);
			else assert(p.tiers.every((t) => !t.inBarHidden && t.underHidden), '微調整1A3(' + tag + '・初期): 1280px では4つとも個数はバーの中（蹄鉄の下には出さない）', p.tiers.map((t) => ({ inBarHidden: t.inBarHidden, underHidden: t.underHidden })));
			// 境目を動かして、複数の区間が細くなる形（金と虹・銀と金と虹）でも同じ規則
			const shapes = [['最大の側へ寄せ切り', (n) => [n - 4, n - 3, n - 2]], ['真ん中へ寄せ', (n) => [Math.floor(n / 2) - 1, Math.floor(n / 2), Math.floor(n / 2) + 1]], ['境目1だけ最小', (n) => [0, Math.floor(n / 2), n - 2]]];
			for (const [label, fn] of shapes) {
				await page.evaluate((src) => { const f = eval('(' + src + ')'); effBounds = f(effData.steps.length).map((i) => effData.steps[i]); layoutEffPanel(); }, fn.toString());
				p = await probe();
				const under = p.tiers.filter((t) => !t.underHidden).length;
				assert(rule(p) && p.tiers.every((t) => t.inBarHidden === (t.segW < t.numW + 8)), '微調整1A3(' + tag + '・' + label + '): どの区間も同じ規則（バーの中に出せなければ蹄鉄の下）', p.tiers.map((t) => ({ segW: Math.round(t.segW), inBarHidden: t.inBarHidden, underHidden: t.underHidden })));
				// 数字は蹄鉄の画像の真下・隣の蹄鉄（画像）に重ならない・パネルの枠の中
				const bad = [];
				p.tiers.forEach((t, i) => {
					if (!t.u) return;
					if (t.u.y < t.img.b - 0.5) bad.push('蹄鉄' + i + 'の個数が画像の下にない');
					p.tiers.forEach((o, j) => { if (j !== i && o.img.x < t.u.r && t.u.x < o.img.r && o.img.y < t.u.b && t.u.y < o.img.b) bad.push('蹄鉄' + i + 'の個数が蹄鉄' + j + 'の画像に重なる'); });
				});
				assert(bad.length === 0, '微調整1A3(' + tag + '・' + label + '): 蹄鉄の下の個数は、隣の蹄鉄に重ならない（個数のある段は、その行のぶん間隔が広がる）', { bad, under });
			}
			// 文字色: 白の太字ではなく、パネルの地の上で読める色（コントラスト比 4.5 以上）。太字
			await page.evaluate(() => { effBounds = defaultEffBounds(effData); layoutEffPanel(); });
			p = await probe();
			const shown = p.tiers.filter((t) => !t.underHidden);
			if (w === 375) {
				assert(shown.length >= 1 && shown.every((t) => JSON.stringify(rgb(t.color)) !== '[255,255,255]' && contrast(rgb(t.color), rgb(p.bg)) >= 4.5 && Number(t.weight) >= 700),
					'微調整1A3(' + tag + '): 蹄鉄の下の個数は白ではなく、地の上でコントラスト比 4.5 以上・太字', shown.map((t) => ({ color: t.color, ratio: contrast(rgb(t.color), rgb(p.bg)).toFixed(2), weight: t.weight })));
			}
			assert(jsErrors(errors).length === 0, '微調整1A3(' + tag + '): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});

	await block('微調整1A4 「？」の説明は3行（行頭「・」）で、指定の文面のとおり', async () => {
		const { ctx, page, errors } = await openExam({ eff: false });
		await page.click('#eff-help-btn');
		const r = await page.evaluate(() => { const el = document.getElementById('eff-help-text'); return { text: el.textContent, ws: getComputedStyle(el).whiteSpace, lines: el.getClientRects().length, h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) }; });
		const want = ['・評価点を数値化し、効率（評価点÷消費SP）や評価点の合計を示すモードです。', '・効率はすべての適性がAであるものとして示しています。', '・継承固有・レース因子(スキル)は対象に含まれません。'];
		assert(r.text === want.join('\n') && r.ws === 'pre-line' && r.h >= r.lh * 3 - 1,
			'微調整1A4: 小窓の本文は指定の3行（行頭は「・」）で、1行ずつ改行して出る', r);
		assert(!/βテスト|蹄鉄|つまみ/.test(r.text), '微調整1A4: 古い説明（蹄鉄・つまみ・βテスト）は残っていない', r.text);
		await ctx.close();
		void errors;
	});

	/* 一覧・コピーの期待値を、データから作る（スキル名・効率の数値はここに書かない） */
	const registryExpect = async (page) => page.evaluate(async () => {
		const json = await fetch('data/skill-efficiency.json').then((r) => r.json());
		const byId = new Map(json.entries.map((e) => [String(e.skillId), Math.round(e.efficiency * 1000)]));
		const eff = (name) => { const id = examSkillId(name); const v = id ? byId.get(String(id)) : undefined; return v === undefined ? null : v; };
		return { byId: json.entries.length, eff: Object.fromEntries(skillList.concat(EXPANDED_EXTRA_SKILL_NAMES, EXAM_SKILL_NAMES).map((n) => [n, eff(n)])) };
	});
	const rowsOf = (page) => page.evaluate(() => [...document.querySelectorAll('#skill-registry-list > div')].map((d) => d.textContent.replace(/\s+/g, (m) => (m.includes('　') ? '　' : ' ')).trim()));

	await block('微調整1A5 「対象スキルN種の一覧を確認する」の各行に、「スキル名＋全角スペース＋効率（小数3桁）」。効率が無い行（シナリオ因子・遺伝子など）は出さない（既定・広げる・絞る・効率を指定）', async () => {
		const { ctx, page, errors } = await openExam({ eff: false });
		await page.evaluate(() => { document.querySelector('#skill-registry-list').closest('details').open = true; setScenarioFactorsAll(true); setAptitudeGenesAll(true); });
		const ex = await registryExpect(page);
		const modes = ['default', 'expanded', 'curated', 'efficiency'];
		let withEff = {};
		for (const mode of modes) {
			await page.evaluate((m) => setTargetScopeMode(m), mode);
			if (mode === 'efficiency') await page.waitForFunction(() => !!effData, null, { timeout: 15000 });
			await page.waitForTimeout(150);
			const got = await page.evaluate(() => [...document.querySelectorAll('#skill-registry-list > div')].map((d) => {
				const spans = d.querySelectorAll('.registry-eff');
				const box = d.children[1];   // 印（children[0]）の次＝名前と効率のまとまり
				return { text: box.textContent, eff: spans.length ? spans[0].textContent : null, n: spans.length, name: box.firstElementChild.textContent };
			}));
			const bad = [];
			let nEff = 0, nNone = 0, nFactorGene = 0;
			const factors = await page.evaluate(() => SCENARIO_INHERITANCE_FACTORS.concat(APTITUDE_GENES));
			got.forEach((r) => {
				const name = r.name;
				const milli = ex.eff[name];
				const isFG = factors.includes(name);
				if (isFG) { nFactorGene++; if (r.n !== 0 || r.text !== name) bad.push('因子・遺伝子「' + name + '」に効率が出ている'); return; }
				if (mode === 'efficiency') {
					// 効率を指定の一覧は、効率を指定のデータの行（名前は並びのデータの名前）。値は行の効率
					if (r.n !== 1 || !/^\d+\.\d{3}$/.test(r.eff) || r.text !== name + '　' + r.eff) bad.push('「' + name + '」の効率の形が違う: ' + r.text);
					nEff++;
					return;
				}
				if (milli === null) { nNone++; if (r.n !== 0 || r.text !== name) bad.push('効率の無い「' + name + '」に効率が出ている: ' + r.text); }
				else { nEff++; if (r.n !== 1 || r.text !== name + '　' + (milli / 1000).toFixed(3)) bad.push('「' + name + '」の効率が違う: ' + r.text + ' ≠ ' + (milli / 1000).toFixed(3)); }
			});
			withEff[mode] = { rows: got.length, nEff, nNone, nFactorGene };
			assert(bad.length === 0 && nEff > 0 && nFactorGene === 34, '微調整1A5(' + mode + '): 各行は「名前＋全角スペース＋効率（小数3桁）」。効率の無い行・因子・遺伝子（34行）には出さない', { bad: bad.slice(0, 5), withEff: withEff[mode] });
		}
		// 効率を指定の行の効率は、データの値と一致する（名前ではなく行の独自ID＝データの値）
		const effRows = await page.evaluate(() => { const snap = effSnapshot(); return effTargets().slice(0, 400).every((t) => true) && effTargets().map((t) => t.name + '　' + effFormat(t.milli)); });
		const shown = await page.evaluate(() => [...document.querySelectorAll('#skill-registry-list > div')].map((d) => d.children[1].textContent));
		assert(effRows.every((t) => shown.includes(t)), '微調整1A5(効率を指定): 一覧の効率は対象のデータの効率と同じ', { n: effRows.length });
		assert(jsErrors(errors).length === 0, '微調整1A5: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	await block('微調整1A6 「効率の高い順」ボタン: 初期OFF・保存しない／ONで 効率のあるスキル（降順・同率は元の並び）→ 効率の無いスキル → シナリオ因子 → 遺伝子／「スキル名のコピー」は画面の並びで「名前［タブ］効率」の2列', async () => {
		const { ctx, page, errors } = await openExam({ eff: false });
		await page.evaluate(() => { document.querySelector('#skill-registry-list').closest('details').open = true; setScenarioFactorsAll(true); setAptitudeGenesAll(true); });
		const lsBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
		const btn = await page.evaluate(() => { const b = document.getElementById('registry-sort-btn'); const l = document.getElementById('registry-legend').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { exists: !!b, pressed: b.getAttribute('aria-pressed'), text: b.textContent, sameRow: Math.abs(r.top - l.top) < 40, disabled: b.disabled }; });
		assert(btn.exists && btn.pressed === 'false' && !btn.disabled && btn.text.length > 0, '微調整1A6: 並べ替えのボタンがあり、初期は OFF（aria-pressed=false）', btn);
		const ex = await registryExpect(page);
		const groups = await page.evaluate(() => ({ f: SCENARIO_INHERITANCE_FACTORS.slice(), g: APTITUDE_GENES.slice() }));
		for (const mode of ['default', 'expanded', 'curated', 'efficiency']) {
			await page.evaluate((m) => setTargetScopeMode(m), mode);
			if (mode === 'efficiency') await page.waitForFunction(() => !!effData, null, { timeout: 15000 });
			// OFF のときの並びを控える
			await page.evaluate(() => { if (registrySortByEff) toggleRegistrySort(); });
			const off = await page.evaluate(() => [...document.querySelectorAll('#skill-registry-list > div')].map((d) => { const s = d.querySelector('.registry-eff'); const nm = d.querySelector('span:not(.w-3\\.5) span').textContent; return { name: nm, milli: s ? Math.round(parseFloat(s.textContent) * 1000) : null }; }));
			await page.click('#registry-sort-btn');
			const on = await page.evaluate(() => ({ pressed: document.getElementById('registry-sort-btn').getAttribute('aria-pressed'), rows: [...document.querySelectorAll('#skill-registry-list > div')].map((d) => { const s = d.querySelector('.registry-eff'); const nm = d.querySelector('span:not(.w-3\\.5) span').textContent; return { name: nm, milli: s ? Math.round(parseFloat(s.textContent) * 1000) : null }; }) }));
			// 期待: 元の並びを、(効率あり・降順・安定) → (効率なし) → 因子 → 遺伝子 に
			const grp = (r) => groups.f.includes(r.name) ? 2 : groups.g.includes(r.name) ? 3 : (r.milli === null ? 1 : 0);
			const want = off.map((r, i) => ({ r, i })).sort((a, b) => (grp(a.r) - grp(b.r)) || (grp(a.r) === 0 ? b.r.milli - a.r.milli : 0) || (a.i - b.i)).map((x) => x.r.name);
			const got = on.rows.map((r) => r.name);
			assert(on.pressed === 'true' && JSON.stringify(got) === JSON.stringify(want) && got.length === off.length && new Set(got).size === got.length,
				'微調整1A6(' + mode + '): ON の並びは 効率あり（降順・同率は元の順）→ 効率なし → シナリオ因子 → 遺伝子', { n: got.length, first: got.slice(0, 4), want: want.slice(0, 4) });
			const effRows = on.rows.filter((r) => grp(r) === 0);
			assert(effRows.length > 0 && effRows.every((r, i) => i === 0 || effRows[i - 1].milli >= r.milli) && on.rows.slice(-34).every((r) => groups.f.includes(r.name) || groups.g.includes(r.name))
				&& on.rows.slice(-10).every((r) => groups.g.includes(r.name)), '微調整1A6(' + mode + '): 効率の降順・最後の34行は因子24→遺伝子10', { effRows: effRows.length });
			// 同じ効率が実際に並んでいる（安定の検査が空振りでない）
			const ties = effRows.filter((r, i) => i > 0 && effRows[i - 1].milli === r.milli).length;
			assert(ties > 0, '微調整1A6(' + mode + '): 同じ効率の行があり、安定（元の並びのまま）の検査が空振りでない', { ties });
			// スキル名のコピー（全種）: 画面の並びのとおり・「名前［タブ］効率」・効率の無い行は2列目が空
			await page.evaluate(() => selectCopyList('all133'));
			const copyOn = await page.evaluate(() => document.getElementById('skill-copy-textarea').value.split('\n').map((l) => l.split('\t')));
			const nm = copyOn.map((c) => c[0]);
			const base = await page.evaluate(() => skillList.slice());
			const eff0 = (n) => ex.eff[n];
			const grp0 = (n) => groups.f.includes(n) ? 2 : groups.g.includes(n) ? 3 : (eff0(n) === null ? 1 : 0);
			const wantCopy = base.map((n, i) => ({ n, i })).sort((a, b) => (grp0(a.n) - grp0(b.n)) || (grp0(a.n) === 0 ? eff0(b.n) - eff0(a.n) : 0) || (a.i - b.i)).map((x) => x.n);
			assert(copyOn.every((c) => c.length === 2) && JSON.stringify(nm) === JSON.stringify(wantCopy)
				&& copyOn.every((c) => c[1] === (eff0(c[0]) === null ? '' : (eff0(c[0]) / 1000).toFixed(3))),
				'微調整1A6(' + mode + '): 「スキル名のコピー」（全種）は ON の並びで「名前［タブ］効率」の2列・効率の無い行は2列目が空', { rows: copyOn.length, head: copyOn.slice(0, 2), emptyEff: copyOn.filter((c) => c[1] === '').length });
			// OFF に戻す
			await page.click('#registry-sort-btn');
			const back = await page.evaluate(() => [...document.querySelectorAll('#skill-registry-list > div')].map((d) => d.querySelector('span:not(.w-3\\.5) span').textContent));
			const copyOff = await page.evaluate(() => document.getElementById('skill-copy-textarea').value.split('\n').map((l) => l.split('\t')[0]));
			assert(JSON.stringify(back) === JSON.stringify(off.map((r) => r.name)) && JSON.stringify(copyOff) === JSON.stringify(base),
				'微調整1A6(' + mode + '): OFF に戻すと一覧もコピーも元の並び（コピーの2列目は OFF でも出す）', { n: back.length });
		}
		// 実データでは対象のスキルがすべて効率を持つので、「効率の無いスキル」は仮に3つ外して確かめる（読み込んだ値の表から消し、あとで戻す）
		await page.evaluate(() => setTargetScopeMode('default'));
		const noEff = await page.evaluate(() => {
			const names = EXAM_SKILL_NAMES.filter((_, i) => i % 40 === 3).slice(0, 3);
			const saved = names.map((n) => [examSkillId(n), effValueById.get(String(examSkillId(n)))]);
			saved.forEach(([id]) => effValueById.delete(String(id)));
			window.__effSaved = saved;
			if (registrySortByEff) toggleRegistrySort();
			renderSkillRegistryList(); renderSkillCopyTextarea();
			const offRows = [...document.querySelectorAll('#skill-registry-list > div')].map((d) => d.children[1].firstElementChild.textContent);
			toggleRegistrySort();
			const onRows = [...document.querySelectorAll('#skill-registry-list > div')].map((d) => ({ name: d.children[1].firstElementChild.textContent, has: d.querySelectorAll('.registry-eff').length === 1 }));
			selectCopyList('all133');
			const copy = document.getElementById('skill-copy-textarea').value.split('\n').map((l) => l.split('\t'));
			toggleRegistrySort();
			return { names, offRows, onRows, copy, F: SCENARIO_INHERITANCE_FACTORS.length, G: APTITUDE_GENES.length };
		});
		{
			const k = noEff.onRows.findIndex((r) => !r.has);
			const nSkill = noEff.onRows.length - 34;
			const lastWith = noEff.onRows.map((r) => r.has).lastIndexOf(true);
			const tail = noEff.onRows.slice(lastWith + 1, nSkill);
			const wantTail = noEff.offRows.filter((n) => noEff.names.includes(n));
			assert(noEff.names.length === 3 && k === lastWith + 1 && tail.length === 3 && JSON.stringify(tail.map((r) => r.name)) === JSON.stringify(wantTail) && tail.every((r) => !r.has),
				'微調整1A6(効率の無いスキル): 効率のあるスキルの後ろ・シナリオ因子の前に、元の並びのまま並ぶ', { names: noEff.names, k, lastWith, tail: tail.map((r) => r.name) });
			const cNames = noEff.copy.map((c) => c[0]);
			const cTail = noEff.copy.slice(lastWith + 1, nSkill);
			assert(JSON.stringify(cNames) === JSON.stringify(noEff.onRows.map((r) => r.name)) && cTail.every((c) => c.length === 2 && c[1] === '') && noEff.copy.slice(0, lastWith + 1).every((c) => /^\d+\.\d{3}$/.test(c[1])),
				'微調整1A6(効率の無いスキル): コピーも同じ並びで、効率の無い行は2列目が空', { tail: cTail });
		}
		await page.evaluate(() => { window.__effSaved.forEach(([id, v]) => effValueById.set(String(id), v)); renderSkillRegistryList(); renderSkillCopyTextarea(); });
		// sp70緑・緑59種のコピーも2列（効率のあるものは数字）
		for (const m of ['sp70', 'green59']) {
			await page.evaluate((x) => selectCopyList(x), m);
			const lines = await page.evaluate(() => document.getElementById('skill-copy-textarea').value.split('\n').map((l) => l.split('\t')));
			assert(lines.length > 0 && lines.every((c) => c.length === 2) && lines.every((c) => c[1] === '' || /^\d+\.\d{3}$/.test(c[1])), '微調整1A6(' + m + '): ' + m + ' のコピーも「名前［タブ］効率」の2列', { n: lines.length, head: lines[0] });
		}
		// 保存しない: 保存の鍵は増えず、開き直すと OFF
		const lsAfter = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForFunction(() => !!effValueById, null, { timeout: 15000 });
		const reopened = await page.evaluate(() => ({ pressed: document.getElementById('registry-sort-btn').getAttribute('aria-pressed'), on: registrySortByEff }));
		assert(lsAfter === lsBefore && reopened.pressed === 'false' && reopened.on === false, '微調整1A6: 並べ替えの状態は保存しない（鍵は増えず、開き直すと OFF）', { lsBefore, lsAfter, reopened });
		assert(jsErrors(errors).length === 0, '微調整1A6: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	/* ====================================================================
	 * B: 結合画像の合計（効率を指定だけ）
	 * ==================================================================== */
	/** 帯を1枚描き、fillText の呼び出し（文字・大きさ・位置）を集める。o.lines＝合計の2行（effTotalLines の形） */
	const drawBanner = (page, w, o = {}) => page.evaluate(async ({ w, o }) => {
		const imgs = await loadEffIconImages();
		const b = effBounds.slice();
		const cells = [0, 1, 2, 3].map((k) => ({ img: imgs[k], range: effRangeLabel(k, b), count: 20 + k * 7 }));
		const mk = (n) => ({ items: Array.from({ length: n }, (_, i) => ({ text: 'ABCDEFG' + (i + 1) + '：★' + ((i % 3) + 1) })), more: false });
		const calls = [];
		const orig = CanvasRenderingContext2D.prototype.fillText;
		CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
			calls.push({ text, x, y, px: parseFloat(this.font.replace(/^.*?(\d+(\.\d+)?)px.*$/, '$1')), width: this.measureText(text).width, base: this.textBaseline });
			return orig.apply(this, arguments);
		};
		let c;
		try {
			c = stitchDrawEffPersonBanner(w, '親A', 30, 12, o.purple ? mk(o.purple) : null, null,
				Object.assign({ cards: true, factors: true, effPanel: { cells }, totalLines: o.lines || null }, o.opts || {}));
		} finally { CanvasRenderingContext2D.prototype.fillText = orig; }
		const purpleFs = effPurpleLayout(w, mk(1), null, true).fs;
		return { h: c.height, calls, purpleFs, cardValueFs: Math.round(w * EFF_BANNER.cardValueFont), layout: o.lines ? effTotalLayout(w, o.lines) : null };
	}, { w, o });
	const LINES = ['合計評価点/合計SP:6.220', '合計評価点:18,972'];

	await block('微調整1B1 合計の帯の文字は紫の行と同じくらい・数字は検出数の数字と同じ大きさ／コロンのあとに間・2行の数字の左端をそろえる（列の幅 262・765・1170px）', async () => {
		const { ctx, page, errors } = await openExam({ eff: true });
		for (const w of [262, 765, 1170]) {
			const r = await drawBanner(page, w, { lines: LINES });
			const labels = r.calls.filter((c) => c.text === '合計評価点/合計SP:' || c.text === '合計評価点:');
			const values = r.calls.filter((c) => c.text === '6.220' || c.text === '18,972');
			assert(labels.length === 2 && values.length === 2, '微調整1B1(' + w + 'px): 合計は2行・ラベルと数字を別々に描く', r.calls.map((c) => c.text));
			assert(labels.every((c) => c.px === r.purpleFs),
				'微調整1B1(' + w + 'px): ラベルの文字の大きさ（' + labels.map((c) => c.px) + 'px）は、紫の行（シナリオ因子の行）の文字（' + r.purpleFs + 'px）と同じ', { labels: labels.map((c) => c.px), purple: r.purpleFs });
			assert(values.every((c) => c.px === r.cardValueFs),
				'微調整1B1(' + w + 'px): 数字の大きさ（' + values.map((c) => c.px) + 'px）は、検出数カードの数字（' + r.cardValueFs + 'px）と同じ', { values: values.map((c) => c.px), card: r.cardValueFs });
			// コロンのあと: ラベルの右端と数字の左端のあいだに間（最も長い行でもラベルの文字の大きさの0.4倍以上）。2行の数字の左端は同じ
			const gaps = labels.map((l, i) => values[i].x - (l.x + l.width));
			assert(values[0].x === values[1].x && Math.min.apply(null, gaps) >= r.layout.lab * 0.4 && labels.every((l) => l.text.endsWith(':')),
				'微調整1B1(' + w + 'px): コロンのあとに間（最短 ' + Math.min.apply(null, gaps).toFixed(1) + 'px）を空け、2行の数字の左端をそろえる', { gaps, xs: values.map((c) => c.x) });
			// 数字の位置は、ラベルの幅の大きい方に合わせる（幅の大きいほうの行の間が決めた値・短いほうの行は間が広い）
			const wide = labels[0].width > labels[1].width ? 0 : 1;
			assert(Math.abs(gaps[wide] - r.layout.gap) < 0.6 && gaps[1 - wide] > gaps[wide],
				'微調整1B1(' + w + 'px): 数字の位置は、幅の大きいほうのラベルに合わせて決める', { gaps, gap: r.layout.gap });
			// 同じベースライン（ラベルと数字が同じ行で揃う）
			assert(labels.every((l, i) => l.y === values[i].y && l.base === 'alphabetic'), '微調整1B1(' + w + 'px): 同じ行のラベルと数字は同じベースライン', { l: labels.map((c) => c.y), v: values.map((c) => c.y) });
			// 1行に収まる
			const rowW = labels.map((l, i) => (values[i].x + values[i].width) - labels[i].x);
			assert(rowW.every((x) => x <= r.layout.innerW + 0.5), '微調整1B1(' + w + 'px): 2行とも箱の内側の幅（' + r.layout.innerW + 'px）に収まる', { rowW, innerW: r.layout.innerW });
			// 帯の高さ（列の幅の比で決まる）
			const none = r.h;
			const p1 = (await drawBanner(page, w, { lines: LINES, purple: 1 })).h, p3 = (await drawBanner(page, w, { lines: LINES, purple: 3 })).h;
			const rowH = Math.round(w * 0.093), pad = Math.round(w * 0.016), after = Math.round(w * 0.017);
			const none0 = (await drawBanner(page, w, {})).h;
			assert(none - none0 === rowH * 2 + pad * 2 + after && p1 > none && p3 > p1,
				'微調整1B1(' + w + 'px): 合計の帯の高さは 2行（' + rowH + 'px×2）＋上下の余白（' + pad + 'px×2）＋下の間（' + after + 'px）。帯の高さは 合計なし ' + none0 + ' → あり ' + none + 'px（紫1行 ' + p1 + '・紫3行 ' + p3 + '）', { none0, none, p1, p3 });
			assert(r.layout.lab === r.layout.lab0 && r.layout.num === r.layout.num0, '微調整1B1(' + w + 'px): ふつうの値では縮めない', r.layout);
		}
		assert(jsErrors(errors).length === 0, '微調整1B1: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	await block('微調整1B2 1行に収まらないときは、ラベルと数字を同じ比で縮める（最小 6px）／同じセットの全員の帯の高さはそろう（合計を持たない人も高さだけ確保）', async () => {
		const { ctx, page, errors } = await openExam({ eff: true });
		const BIG = ['合計評価点/合計SP:123456789.123', '合計評価点:123,456,789,012'];
		for (const w of [262, 765, 1170]) {
			const r = await drawBanner(page, w, { lines: BIG });
			const L = r.layout;
			const labels = r.calls.filter((c) => c.text.startsWith('合計評価点') && c.text.endsWith(':'));
			const values = r.calls.filter((c) => /^[\d,.]{9,}$/.test(c.text));
			assert(L.lab < L.lab0 && L.lab >= 6 && L.need <= L.innerW + 0.5, '微調整1B2(' + w + 'px): 収まらない値では文字を縮め（' + L.lab0 + '→' + L.lab + 'px・数字 ' + L.num0 + '→' + L.num + 'px）、1行に収める', L);
			assert(Math.abs(L.num / L.lab - L.num0 / L.lab0) < 0.12, '微調整1B2(' + w + 'px): ラベルと数字は一緒に（同じ比で）縮める', { ratio: L.num / L.lab, want: L.num0 / L.lab0 });
			assert(labels.length === 2 && values.length === 2 && labels.every((c) => c.px === L.lab) && values.every((c) => c.px === L.num),
				'微調整1B2(' + w + 'px): 実際に描いた大きさも縮めた値', { labels: labels.map((c) => c.px), values: values.map((c) => c.px), L });
		}
		// ものすごく長い値: 最小 6px で止まる
		const huge = await page.evaluate(() => { const L = effTotalLayout(262, ['合計評価点/合計SP:' + '9'.repeat(60), '合計評価点:' + '9'.repeat(70)]); return { lab: L.lab, num: L.num }; });
		assert(huge.lab === 6 && huge.num >= 6, '微調整1B2: 極端に長い値でも、ラベルは最小 6px（それ以上は縮めない）', huge);
		// 収まるかは「列の幅 262px」で確かめる（ふつうの値は収まる）
		const norm = await page.evaluate(() => { const L = effTotalLayout(262, ['合計評価点/合計SP:9.999', '合計評価点:9,999,999']); return { need: L.need, innerW: L.innerW, lab: L.lab, lab0: L.lab0 }; });
		assert(norm.need <= norm.innerW && norm.lab === norm.lab0, '微調整1B2: 列の幅262pxで、7桁の評価点でも縮めずに収まる', norm);
		// 帯の高さ: 合計を持たない人も、同じセットに持つ人がいれば高さだけ確保（reserve）して同じ高さ。誰も持たなければ従来どおり箱なし
		const hs = {
			own: (await drawBanner(page, 262, { lines: LINES, purple: 1 })).h,
			reserve: (await drawBanner(page, 262, { purple: 1, opts: { totalReserve: true } })).h,
			none: (await drawBanner(page, 262, { purple: 1 })).h,
		};
		assert(hs.own === hs.reserve && hs.none < hs.own, '微調整1B2: 合計を持たない人の帯も、同じセットで持つ人がいれば同じ高さにそろう（誰も持たなければ箱なし）', hs);
		// 組み立ての流れ（buildStitchedSetImage）: 効率を指定で2人とも同じ高さの帯になる
		const flow = await page.evaluate(async () => {
			const s = melopSheet;
			const b = effBounds.slice();
			const pick = [0, 1, 2, 3].map((k) => effData.targets.find((t) => t.id && effTierOf(t.milli, b) === k && !/\+$/.test(t.name)));
			const names = pick.map((t) => t.name);
			const rows = names.map((n, i) => ({ x: 200 + (i % 2) * 453, y: 300 + Math.floor(i / 2) * 120, w: 200, h: 40, col: i % 2, band: Math.floor(i / 2) }));
			const lines = names.map((n, i) => ({ text: n, stars: 2, starsReliable: true, rowKey: '0:' + i }));
			personGeometry = PERSON_LABELS.map(() => null); personLines = PERSON_LABELS.map(() => null); personMelop = PERSON_LABELS.map(() => null); personResults = PERSON_LABELS.map(() => null);
			[0, 1].forEach((p) => {
				personGeometry[p] = [{ rows, columnXs: [200, 653], scale: 1, naturalW: 1179, naturalH: 2556 }];
				personLines[p] = lines;
				personMelop[p] = { res: matchMelopLines(lines, s), top: { found: true, uniqueStars: 1, blue: null, red: null, extraLines: [] } };
				personResults[p] = matchAllSkillsWithStars(lines, skillList, skillIndex, {});
			});
			const white = async () => { const c = document.createElement('canvas'); c.width = 1179; c.height = 2556; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1179, 2556); return c; };
			const orig = stitchOnePerson; stitchOnePerson = white;
			const calls = [];
			const origB = stitchDrawEffPersonBanner;
			stitchDrawEffPersonBanner = (...a) => { const c = origB(...a); calls.push({ h: c.height, hasTotal: !!(a[6] && a[6].totalLines), reserve: !!(a[6] && a[6].totalReserve) }); return c; };
			const run = Object.assign(captureRun(), { files: PERSON_LABELS.map((_, i) => (i < 2 ? [new File(['x'], 'a.png')] : [])), attrIcons: false });
			try { await buildStitchedSetImage(0, run); } finally { stitchOnePerson = orig; stitchDrawEffPersonBanner = origB; }
			return calls;
		});
		assert(flow.length === 2 && flow[0].h === flow[1].h && flow.every((c) => c.hasTotal),
			'微調整1B2: 組み立ての流れでも、同じセットの2人の帯は同じ高さ・どちらも合計の2行を持つ', flow);
		assert(jsErrors(errors).length === 0, '微調整1B2: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	await block('微調整1B3 効率を指定だけの変更: 拡張モードの合計（1行）と他のモードの帯は従来のまま（合計の2行の配置関数を呼ばない）', async () => {
		const { ctx, page, errors } = await openExam({ eff: false });
		const r = await page.evaluate(async () => {
			const calls = { layout: 0, effBanner: 0, plain: 0, texts: [] };
			const oL = effTotalLayout, oE = stitchDrawEffPersonBanner, oP = stitchDrawPersonBanner;
			effTotalLayout = (...a) => { calls.layout++; return oL(...a); };
			stitchDrawEffPersonBanner = (...a) => { calls.effBanner++; return oE(...a); };
			stitchDrawPersonBanner = (...a) => { calls.plain++; calls.texts.push(a[6] && a[6].totalText); return oP(...a); };
			const s = melopSheet || await loadMelopSheet();
			await loadEffData();
			const names = effData.targets.filter((t) => t.id).slice(0, 4).map((t) => t.name);
			const rows = names.map((n, i) => ({ x: 200 + (i % 2) * 453, y: 300 + Math.floor(i / 2) * 120, w: 200, h: 40, col: i % 2, band: Math.floor(i / 2) }));
			const lines = names.map((n, i) => ({ text: n, stars: 2, starsReliable: true, rowKey: '0:' + i }));
			const setup = () => {
				personGeometry = PERSON_LABELS.map(() => null); personLines = PERSON_LABELS.map(() => null); personMelop = PERSON_LABELS.map(() => null); personResults = PERSON_LABELS.map(() => null);
				personGeometry[0] = [{ rows, columnXs: [200, 653], scale: 1, naturalW: 1179, naturalH: 2556 }];
				personLines[0] = lines;
				personMelop[0] = { res: matchMelopLines(lines, s), top: { found: true, uniqueStars: 1, blue: null, red: null, extraLines: [] } };
				personResults[0] = matchAllSkillsWithStars(lines, skillList, skillIndex, {});
			};
			const white = async () => { const c = document.createElement('canvas'); c.width = 1179; c.height = 2556; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1179, 2556); return c; };
			const orig = stitchOnePerson; stitchOnePerson = white;
			const out = {};
			try {
				const base = Object.assign(captureRun(), { files: PERSON_LABELS.map((_, i) => (i < 1 ? [new File(['x'], 'a.png')] : [])), attrIcons: false });
				for (const [label, patch] of [['既定', { scope: 'default', eff: null }], ['拡張モード（合計あり）', { scope: 'default', eff: null, melop: true }]]) {
					setup();
					calls.layout = calls.effBanner = calls.plain = 0; calls.texts = [];
					await buildStitchedSetImage(0, Object.assign({}, base, patch));
					out[label] = { layout: calls.layout, effBanner: calls.effBanner, plain: calls.plain, texts: calls.texts.slice() };
				}
				// 効率を指定では呼ぶ
				setTargetScopeMode('efficiency');
				setup();
				calls.layout = calls.effBanner = calls.plain = 0;
				await buildStitchedSetImage(0, Object.assign(captureRun(), { files: base.files, attrIcons: false }));
				out['効率を指定'] = { layout: calls.layout, effBanner: calls.effBanner, plain: calls.plain };
			} finally { stitchOnePerson = orig; effTotalLayout = oL; stitchDrawEffPersonBanner = oE; stitchDrawPersonBanner = oP; }
			return out;
		});
		assert(r['既定'].layout === 0 && r['既定'].effBanner === 0 && r['既定'].plain === 1, '微調整1B3: 既定では従来の帯（効率を指定の帯・合計の配置は使わない）', r['既定']);
		assert(r['拡張モード（合計あり）'].layout === 0 && r['拡張モード（合計あり）'].effBanner === 0 && r['拡張モード（合計あり）'].plain === 1 && /^合計 \d+\.\d{3}（評価点\/SP）$/.test(r['拡張モード（合計あり）'].texts[0] || ''),
			'微調整1B3: 拡張モードの合計は1行「合計 N.NNN（評価点/SP）」のまま（2行の配置を使わない）', r['拡張モード（合計あり）']);
		assert(r['効率を指定'].layout >= 1 && r['効率を指定'].effBanner === 1 && r['効率を指定'].plain === 0, '微調整1B3: 効率を指定では専用の帯と合計の配置を使う', r['効率を指定']);
		assert(jsErrors(errors).length === 0, '微調整1B3: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	/* ====================================================================
	 * C: ヘッダーと文言
	 * ==================================================================== */
	const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };

	await block('微調整1C1 exam の文言: 冒頭は「技能試験特化ツール」だけ・見出しに「β版」「新UI」なし・①と②の文面（7）（8）（10）', async () => {
		for (const w of [1280, 375]) {
			const { ctx, page, errors } = await openExam({ w });
			const r = await page.evaluate(() => {
				const h = document.querySelector('header');
				const ps = [...h.querySelector('h1').parentElement.querySelectorAll('p')].map((p) => p.textContent.replace(/\s+/g, ''));   // 見出しの左の欄（メニューの中の文は除く）
				const p1 = document.querySelector('#step-panel-1 > p');
				const p2 = [...document.querySelectorAll('#step-panel-2 > p')].find((p) => p.textContent.includes('親Bセットを追加すると'));
				const foot = [...document.querySelectorAll('#step-panel-2 p')].find((p) => p.textContent.includes('SNS投稿用'));
				return { title: document.title, h1: document.querySelector('header h1').textContent.replace(/\s+/g, ' ').trim(), ps, badge: !!document.getElementById('ui-mode-badge'),
					headerText: h.innerText.replace(/\s+/g, ' ').trim(), p1: p1 && p1.textContent, p2: p2 && p2.innerText, p2html: p2 && p2.innerHTML, foot: foot && foot.textContent,
					body: document.body.innerText };
			});
			assert(r.title === 'UmaExam OCR' && r.h1 === 'UmaExam OCR' && !r.badge && !/β版|新UI/.test(r.headerText),
				'微調整1C1(' + w + 'px): <title>・見出しに「β版」「新UI」が無い（見出しは「UmaExam OCR」）', { title: r.title, h1: r.h1, badge: r.badge });
			assert(r.ps.length === 1 && r.ps[0] === '技能試験特化ツール',
				'微調整1C1(' + w + 'px): 冒頭の説明は「技能試験特化ツール」の1行だけ（4つの文・注意書きの「※」2つは削除）', r.ps);
			assert(['技能試験で有利な登録済み対象スキルに絞って', '親Aセット（+祖A1+祖A2）に加えて', 'OCR・★判定の精度は完全ではありません', 'パソコン版はゲームのウィンドウが小さいと'].every((s) => !r.body.includes(s)),
				'微調整1C1(' + w + 'px): 修正前の冒頭の4つの文は画面のどこにも残っていない', null);
			assert(r.p1 === '既定として登録済みの133種を対象にします。「対象スキルの範囲」で調整可能です。' && !r.body.includes('あらかじめ既定として'),
				'微調整1C1(' + w + 'px): ①の説明は「既定として登録済みの133種を対象にします。「対象スキルの範囲」で調整可能です。」', r.p1);
			await page.evaluate(() => selectStepTab(2));
			const r2 = await page.evaluate(() => {
				const p2 = [...document.querySelectorAll('#step-panel-2 p')].find((p) => p.textContent.includes('親Bセットを追加すると'));
				const foot = [...document.querySelectorAll('#step-panel-2 p')].find((p) => p.textContent.includes('SNS投稿用'));
				return { p2: p2.innerText, html: p2.innerHTML, br: p2.querySelectorAll('br').length, foot: foot.textContent, body: document.body.innerText };
			});
			assert(r2.p2.replace(/\n+/g, '\n') === '親Bセットを追加すると、親Aセットとまとめて照合・比較できます。\nスキルが1-2行重なるように撮影してください。' && r2.br === 1,
				'微調整1C1(' + w + 'px): ②は「親Bセットを追加すると、…比較できます。」に続けて改行し、「スキルが1-2行重なるように撮影してください。」', r2.p2);
			assert(r2.foot === '※親Aセット・親Bセットそれぞれで、親・祖1・祖2を個別にまとめてSNS投稿用に出力します。' && !r2.body.includes('1人につき2枚以上') && !r2.body.includes('1人分が1枚だけのときはエラー'),
				'微調整1C1(' + w + 'px): ②の※は「※親Aセット・親Bセットそれぞれで、親・祖1・祖2を個別にまとめてSNS投稿用に出力します。」に短縮', r2.foot);
			assert(jsErrors(errors).length === 0, '微調整1C1(' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});

	await block('微調整1C2 ツール切替: special のアイコンだけのボタンと同じ見た目・大きさ・メニュー／見出しの行の右端（exam）', async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 });
		await sp.page.waitForTimeout(300);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		const spec = await sp.page.evaluate(() => { const b = document.getElementById('tool-dropdown-btn'); const c = getComputedStyle(b); const r = b.getBoundingClientRect();
			return { w: r.width, h: r.height, pad: c.padding, border: c.border, radius: c.borderRadius, bg: c.backgroundColor, label: getComputedStyle(b.querySelector('.tool-switch-label')).display, chev: getComputedStyle(b.querySelector('.tool-switch-chev')).display }; });
		await sp.ctx.close();
		for (const w of [375, 1280]) {
			const { ctx, page, errors } = await openExam({ w });
			const r = await page.evaluate(() => {
				const b = document.getElementById('tool-dropdown-btn'), c = getComputedStyle(b), t = document.getElementById('theme-cycle-btn');
				const hd = document.querySelector('header'), h1 = document.querySelector('header h1');
				const R = (el) => { const q = el.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, r: q.right, b: q.bottom }; };
				return { btn: R(b), pad: c.padding, border: c.border, radius: c.borderRadius, bg: c.backgroundColor, text: b.textContent.trim(), icons: b.querySelectorAll('svg, i').length, aria: b.getAttribute('aria-label'), title: b.title,
					theme: R(t), hd: R(hd), h1: R(h1), labelEl: !!b.querySelector('.tool-switch-label'), cs: getComputedStyle(hd).paddingRight };
			});
			assert(Math.abs(r.btn.w - spec.w) < 0.6 && Math.abs(r.btn.h - spec.h) < 0.6 && r.pad === spec.pad && r.border === spec.border && r.radius === spec.radius && r.bg === spec.bg,
				'微調整1C2(' + w + 'px): ツール切替は special の375px のアイコンだけのボタンと同じ寸法・枠・角丸・地（' + spec.w + '×' + spec.h + 'px）', { exam: { w: r.btn.w, h: r.btn.h, pad: r.pad, radius: r.radius }, spec });
			assert(r.text === '' && r.icons === 1 && r.aria === 'ツール切替' && r.title === 'ツール切替', '微調整1C2(' + w + 'px): ラベル「ツール切替」と下向きの矢印は外し、読み上げ用の名前は残す', { text: r.text, icons: r.icons, aria: r.aria });
			// 見出しの行の右端: ツール切替 → 画面の色のボタンの順に、ヘッダーの内側の右端にそろう。タイトルと同じ行
			const padR = parseFloat(r.cs);
			assert(Math.abs(r.theme.r - (r.hd.r - padR - 1)) < 2 && r.btn.r <= r.theme.x && Math.abs((r.btn.y + r.btn.h / 2) - (r.h1.y + r.h1.h / 2)) < r.theme.h && r.theme.y < r.h1.b,
				'微調整1C2(' + w + 'px): 見出しの行の右端に置く（タイトルと同じ行・ツール切替の右に画面の色のボタン）', { theme: r.theme, btn: r.btn, hd: r.hd, h1: r.h1, padR });
			// メニュー: 押すと開く・画面の内側に収まる・外を押すと閉じる・メニュー内を押しても閉じない
			await page.click('#tool-dropdown-btn');
			const m1 = await page.evaluate(() => { const m = document.getElementById('tool-dropdown-menu'); const q = m.getBoundingClientRect(); return { open: !m.classList.contains('hidden'), l: q.left, r: q.right, t: q.top, vw: document.documentElement.clientWidth, links: [...m.querySelectorAll('a')].map((a) => a.getAttribute('href')), text: m.innerText.replace(/\s+/g, ' ') }; });
			assert(m1.open && m1.l >= 0 && m1.r <= m1.vw && m1.links.join() === 'special.html' && m1.text.includes('UmaExam OCR') && m1.text.includes('選択中'),
				'微調整1C2(' + w + 'px): 押すとメニューが開き、画面の内側に収まる（UmaStar OCR への行き先と「選択中」の現在のツール）', m1);
			await page.click('#tool-dropdown-menu >> text=選択中');
			assert(await page.evaluate(() => !document.getElementById('tool-dropdown-menu').classList.contains('hidden')), '微調整1C2(' + w + 'px): メニューの中を押しても閉じない', null);
			await page.click('header h1');
			assert(await page.evaluate(() => document.getElementById('tool-dropdown-menu').classList.contains('hidden')), '微調整1C2(' + w + 'px): 外を押すと閉じる', null);
			const before = await page.evaluate(() => document.getElementById('theme-cycle-btn').getAttribute('data-theme-state'));
			await page.click('#tool-dropdown-btn');
			await page.click('#theme-cycle-btn');
			const m2 = await page.evaluate((b) => ({ hidden: document.getElementById('tool-dropdown-menu').classList.contains('hidden'), state: document.getElementById('theme-cycle-btn').getAttribute('data-theme-state'), changed: document.getElementById('theme-cycle-btn').getAttribute('data-theme-state') !== b }), before);
			assert(m2.hidden && m2.changed, '微調整1C2(' + w + 'px): メニューが開いているとき、隣の画面の色のボタンを押すとメニューは閉じて、色は切り替わる', m2);
			await page.click('#tool-dropdown-btn');
			await page.click('#tool-dropdown-btn');
			assert(await page.evaluate(() => document.getElementById('tool-dropdown-menu').classList.contains('hidden')), '微調整1C2(' + w + 'px): もう一度押すと閉じる', null);
			assert(jsErrors(errors).length === 0, '微調整1C2(' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});

	await block('微調整1C3 画面の色の切り替えボタン（special・exam）: 押すたびに 自動→ライト→ダーク→自動／状態はアイコンと読み上げの名前／保存・開き直し・OS への追従／使い方の「？」と小窓は無い', async () => {
		for (const file of ['special.html', 'exam.html']) {
			for (const w of [375, 1280]) {
				const r0 = await openPage(browser, base, file, { width: w, height: 812 });
				const { ctx, page, errors } = r0;
				for (let i = 0; i < 2; i++) { if (await page.isVisible('#ui-notice')) await page.click(file === 'special.html' ? '[data-act="notice-ok"]' : '#ui-notice-ok'); }
				await page.evaluate(() => { try { localStorage.removeItem('uma-tools-theme'); } catch (e) {} });
				await page.reload({ waitUntil: 'networkidle' });
				for (let i = 0; i < 2; i++) { if (await page.isVisible('#ui-notice')) await page.click(file === 'special.html' ? '[data-act="notice-ok"]' : '#ui-notice-ok'); }
				await page.emulateMedia({ colorScheme: 'light' });
				const tag = file + '・' + w + 'px';
				const st = () => page.evaluate(() => {
					const b = document.getElementById('theme-cycle-btn');
					const shown = [...b.querySelectorAll('svg')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.getAttribute('data-theme-icon'));
					return { state: b.getAttribute('data-theme-state'), aria: b.getAttribute('aria-label'), title: b.title, shown, stored: localStorage.getItem('uma-tools-theme'), attr: document.documentElement.getAttribute('data-theme'), api: UmaTheme.get() };
				});
				const g = await page.evaluate(() => { const b = document.getElementById('theme-cycle-btn'); const q = b.getBoundingClientRect(); return { w: q.width, h: q.height, r: q.right, vw: document.documentElement.clientWidth, tag: b.tagName, type: b.type, disabled: b.disabled }; });
				assert(g.w >= 44 && g.h >= 44 && g.r <= g.vw && g.tag === 'BUTTON' && g.type === 'button' && !g.disabled, '微調整1C3(' + tag + '): 44px以上のボタンで、画面の右に収まる', g);
				let s = await st();
				assert(s.state === 'auto' && s.aria === '画面の色：自動' && s.title === s.aria && s.shown.join() === 'auto' && s.stored === null && s.api === 'auto',
					'微調整1C3(' + tag + '): 初期は「自動」（アイコン1つ・読み上げの名前に状態・保存の鍵は無し）', s);
				const order = [['light', 'ライト', 'light'], ['dark', 'ダーク', 'dark'], ['auto', '自動', null]];
				for (const [mode, label, stored] of order) {
					await page.click('#theme-cycle-btn');
					s = await st();
					assert(s.state === mode && s.aria === '画面の色：' + label && s.shown.join() === mode && s.stored === stored && s.api === mode,
						'微調整1C3(' + tag + '): 押すと「' + label + '」（アイコン・読み上げの名前・保存が替わる。「自動」は鍵を消す）', s);
					if (mode !== 'auto') assert(s.attr === mode, '微調整1C3(' + tag + '): 「' + label + '」では画面が ' + mode + ' になる', s);
				}
				// 自動のとき OS の設定に従う
				await page.emulateMedia({ colorScheme: 'dark' });
				await page.waitForTimeout(150);
				const a1 = await st();
				await page.emulateMedia({ colorScheme: 'light' });
				await page.waitForTimeout(150);
				const a2 = await st();
				assert(a1.state === 'auto' && a1.attr === 'dark' && a2.attr === 'light', '微調整1C3(' + tag + '): 「自動」のときは OS の設定（ダーク／ライト）に従う', { a1: a1.attr, a2: a2.attr });
				// 固定のときは OS に追従しない
				await page.click('#theme-cycle-btn');
				await page.emulateMedia({ colorScheme: 'dark' });
				await page.waitForTimeout(150);
				const f1 = await st();
				assert(f1.state === 'light' && f1.attr === 'light', '微調整1C3(' + tag + '): 「ライト」にしたら OS がダークでもライトのまま', f1);
				// 開き直しても続く
				await page.click('#theme-cycle-btn');
				await page.reload({ waitUntil: 'networkidle' });
				for (let i = 0; i < 2; i++) { if (await page.isVisible('#ui-notice')) await page.click(file === 'special.html' ? '[data-act="notice-ok"]' : '#ui-notice-ok'); }
				const re = await st();
				assert(re.state === 'dark' && re.stored === 'dark' && re.attr === 'dark' && re.aria === '画面の色：ダーク' && re.shown.join() === 'dark', '微調整1C3(' + tag + '): 開き直しても選んだ色（ダーク）が続き、ボタンの状態も合っている', re);
				// 他のタブで選び直したとき（storage イベント）に追従する
				await page.evaluate(() => { localStorage.setItem('uma-tools-theme', 'light'); window.dispatchEvent(new StorageEvent('storage', { key: 'uma-tools-theme' })); });
				const sy = await st();
				assert(sy.state === 'light' && sy.aria === '画面の色：ライト', '微調整1C3(' + tag + '): 他のタブで選び直したら、ボタンの状態も追従する', sy);
				// キーボード（フォーカス＋Enter）でも切り替わる
				await page.focus('#theme-cycle-btn');
				await page.keyboard.press('Enter');
				const kb = await st();
				assert(kb.state === 'dark', '微調整1C3(' + tag + '): キーボードの Enter でも切り替わる', kb);
				// 使い方の「？」・ボタン・小窓・「画面の色」の選択は無い
				const gone = await page.evaluate(() => ({ box: !!document.getElementById('help-box'), backdrop: !!document.getElementById('help-backdrop'), open: !!document.querySelector('.help-open-btn'), onclick: !!document.querySelector('button[onclick="toggleHelp()"]'),
					fns: [typeof toggleHelp, typeof openHelp, typeof closeHelp], picker: !!document.querySelector('[data-uma-theme-picker], [data-theme-choice]'), old: !!document.getElementById('old-help-card'), content: !!document.getElementById('help-content'),
					cautions: !!document.getElementById('help-cautions'), text: document.body.innerText.includes('使い方ガイド') || document.body.innerText.includes('使い方・注意') }));
				assert(!gone.box && !gone.backdrop && !gone.open && !gone.onclick && gone.fns.every((f) => f === 'undefined') && !gone.picker && !gone.old && !gone.content && !gone.cautions && !gone.text,
					'微調整1C3(' + tag + '): 使い方ガイド（exam）／「？」（special）のボタンと小窓の本文・「画面の色」の選択は無い', gone);
				await page.keyboard.press('Escape');
				assert(jsErrors(errors).length === 0, '微調整1C3(' + tag + '): Esc を押してもコンソールエラーなし', errors.slice(0, 3));
				await ctx.close();
			}
		}
	});

	await block('微調整1C4 special の375pxのヘッダー: タイトル・ツール切替・画面の色が1行／帯の高さは47pxのまま（①の表の上端などの高さの基準を動かさない）', async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		const r = await sp.page.evaluate(() => {
			const R = (el) => { const q = el.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, r: q.right, b: q.bottom }; };
			return { hd: R(document.querySelector('header')), h1: R(document.querySelector('header h1')), tool: R(document.getElementById('tool-dropdown-btn')), theme: R(document.getElementById('theme-cycle-btn')), vw: document.documentElement.clientWidth };
		});
		const rows = [r.h1, r.tool, r.theme].map((x) => x.y + x.h / 2);
		assert(Math.abs(r.hd.h - 47) <= 1 && r.theme.r <= r.vw && r.tool.r <= r.theme.x && r.h1.r <= r.tool.x && Math.max.apply(null, rows) - Math.min.apply(null, rows) < 8 && r.theme.y >= r.hd.y && r.theme.b <= r.hd.b + 0.5,
			'微調整1C4: special の375pxのヘッダーは高さ47pxのまま・3つが1行に収まり、44px のボタンが帯からはみ出さない', r);
		await sp.ctx.close();
	});
}
