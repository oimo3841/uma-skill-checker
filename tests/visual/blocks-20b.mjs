// C-140（2026-10-10・ツール全体の微調整2）B の検査: 効率を指定のバーと蹄鉄の操作。run-smoke.mjs の末尾から register20b() で呼ばれる
// （塊の見出しはすべて「微調整2B」で始まる。`npm run test:visual -- --only=微調整2B` で回せる）。
//
// B1 矢印の柄が上下対称／B2 蹄鉄のドラッグとタップ／B3 区間のタップでON/OFF・最後の1区間／B4 吹き出し（ドラッグ中・タップで常時表示・8文字の名前）／
// B5 蹄鉄の配置（重ならない・虹を押し出さない・リセットが下）／B6 目印は触れない・touch-action／B7 区間のエリアは最低24px／B8 キー操作と読み上げの名前
// スキル名・効率の数値は検査の側に書かない（恒久ルール1。データから読む）。

import { reloadReady } from './lib/page-ready.mjs';
export async function register20b(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));

	const openExam = async (o = {}) => {
		const r = await openPage(browser, base, 'exam.html', { width: o.w || 1280, height: o.h || 900 });
		const page = r.page;
		await page.evaluate(({ theme, store }) => {
			try {
				if (theme) localStorage.setItem('uma-tools-theme', theme);
				Object.keys(store || {}).forEach((k) => localStorage.setItem(k, store[k]));
			} catch (e) {}
		}, { theme: o.theme || 'light', store: o.store || null });
		if (o.theme || o.store) await reloadReady(page);
		await page.waitForTimeout(400);
		if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
		await page.evaluate(() => selectStepTab(1));
		await page.waitForFunction(() => !!effValueById, null, { timeout: 15000 });
		await page.click('label[for="scope-mode-efficiency"]', { position: { x: 6, y: 6 } });
		await page.waitForFunction(() => !!effData && document.querySelectorAll('.eff-seg').length === 4, null, { timeout: 15000 });
		await page.waitForTimeout(300);
		return r;
	};
	/** 境目を段の番号で置く（保存はしない） */
	const setBounds = (page, idxs) => page.evaluate((ix) => { effBounds = ix ? ix.map((i) => effData.steps[i]) : defaultEffBounds(effData); effPinned = [false, false, false]; layoutEffPanel(); }, idxs || null);
	const shapesOf = (n) => [['初期', null], ['最小の側へ寄せ切り', [0, 1, 2]], ['最大の側へ寄せ切り', [n - 4, n - 3, n - 2]], ['真ん中へ寄せ', [Math.floor(n / 2) - 1, Math.floor(n / 2), Math.floor(n / 2) + 1]], ['境目1だけ最小', [0, Math.floor(n / 2), n - 2]]];
	const nSteps = (page) => page.evaluate(() => effData.steps.length);

	/* ====================================================================
	 * B1: 矢印の柄が上下対称（柄の上端の余白と下端の余白の差が1px以内・上下で切れない）
	 * ==================================================================== */
	await block('微調整2B1 バーの矢印の柄は上下対称（上端の余白と下端の余白の差が1px以内・柄が途中で切れない）／375・393・1280px／ライト・ダーク／一部の区間をOFF', async () => {
		const bandRuns = async (page, seg) => {
			const buf = await page.screenshot({ clip: { x: seg.x, y: seg.y, width: seg.w, height: seg.h } });
			return page.evaluate(async ({ b64 }) => {
				const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
				const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
				const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
				const d = cx.getImageData(0, 0, c.width, c.height).data;
				const x0 = 12, x1 = c.width - 12;
				const lit = [];
				for (let y = 0; y < c.height; y++) {
					const med = [0, 1, 2].map((ch) => { const arr = []; for (let x = x0; x < x1; x++) arr.push(d[(y * c.width + x) * 4 + ch]); arr.sort((a, b) => a - b); return arr[arr.length >> 1]; });
					let n = 0;
					for (let x = x0; x < x1; x++) { const o = (y * c.width + x) * 4; if ((d[o] - med[0]) + (d[o + 1] - med[1]) + (d[o + 2] - med[2]) > 20) n++; }
					lit.push(n >= 2);
				}
				// 上下の端の1行（内側の線）は除く
				const rows = lit.slice(1, lit.length - 1);
				let runs = 0, prev = false, first = -1, last = -1;
				rows.forEach((v, i) => { if (v && !prev) runs++; prev = v; if (v) { if (first < 0) first = i; last = i; } });
				return { runs, topMargin: first, bottomMargin: rows.length - 1 - last, litRows: rows.filter(Boolean).length, rowsN: rows.length };
			}, { b64: buf.toString('base64') });
		};
		for (const [w, theme] of [[375, 'light'], [375, 'dark'], [393, 'light'], [1280, 'light'], [1280, 'dark']]) {
			for (const off of [null, 1]) {
				const { ctx, page, errors } = await openExam({ w, theme });
				if (off !== null) await page.evaluate((k) => { effTiers[k] = false; layoutEffPanel(); }, off);
				await page.evaluate(() => {
					document.getElementById('eff-bar').scrollIntoView({ block: 'center' });
					const s = document.createElement('style'); s.id = 'probe-hide'; s.textContent = '.eff-seg-n, .eff-mark { visibility: hidden !important; }'; document.head.appendChild(s);
				});
				await page.waitForTimeout(200);
				const segs = await page.evaluate(() => [...document.querySelectorAll('.eff-seg')].map((s) => { const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, on: s.getAttribute('data-on') === 'true' }; }));
				const tag = w + 'px・' + theme + '・' + (off === null ? '全区間ON' : '区間' + off + 'をOFF');
				const wide = segs.map((s, k) => ({ s, k })).filter((x) => x.s.w >= 40 && x.k < 3);   // 虹は横に色が変わるので、柄の上下の判定には使わない
				assert(wide.length >= 2, '微調整2B1(' + tag + '): 検査できる幅（40px以上）の区間が2つ以上ある（空振りでない）', segs.map((s) => Math.round(s.w)));
				for (const { s, k } of wide) {
					const r = await bandRuns(page, s);
					if (s.on) {
						assert(r.runs === 1 && r.litRows >= 10 && Math.abs(r.topMargin - r.bottomMargin) <= 1 && r.topMargin >= 1 && r.bottomMargin >= 1,
							'微調整2B1(' + tag + '): 区間' + k + '（ON）の柄は1つのまとまりで、上端の余白（' + r.topMargin + 'px）と下端の余白（' + r.bottomMargin + 'px）の差が1px以内・上下で切れていない', r);
					} else {
						assert(r.litRows === 0, '微調整2B1(' + tag + '): 区間' + k + '（OFF）は灰色のまま・柄なし', r);
					}
				}
				assert(jsErrors(errors).length === 0, '微調整2B1(' + tag + '): コンソールエラーなし', errors.slice(0, 3));
				await ctx.close();
			}
		}
		// 柄のタイルは縦の中央に置く（頂点の組と背景の縦位置の指定）
		const { ctx, page } = await openExam({ w: 375 });
		const tile = await page.evaluate(() => ({ tile: getComputedStyle(document.documentElement).getPropertyValue('--exam-eff-chevron'), pos: getComputedStyle(document.querySelector('.eff-seg--0')).backgroundPositionY }));
		const m = /points='([\d.]+),([\d.]+) ([\d.]+),([\d.]+) ([\d.]+),([\d.]+)'/.exec(tile.tile);
		assert(m && Math.abs((Number(m[2]) + Number(m[6])) / 2 - 14) < 0.01 && Number(m[4]) === 14 && /50%|14px/.test(tile.pos.split(',')[1]),
			'微調整2B1: 柄の頂点の組は上下対称（上下の頂点の中点も先端も、タイルの縦の中央14px）で、背景の縦位置も中央', tile);
		await ctx.close();
	});

	/* ====================================================================
	 * B2: 蹄鉄のドラッグとタップ（銅＝左・銀＝中央・金＝右の境目。虹は固定）
	 * ==================================================================== */
	await block('微調整2B2 蹄鉄を横にドラッグすると、担当する境目が動く（銅＝左・銀＝中央・金＝右）／しきい値未満の動きはタップ（境目は動かない）／ドラッグでは区間のON/OFFが切り替わらない', async () => {
		for (const w of [1280, 375]) {
			const { ctx, page, errors } = await openExam({ w });
			const info = () => page.evaluate(() => ({ b: effBounds.slice(), tiers: effTiers.slice(), stored: localStorage.getItem('uma-exam-eff-bounds'), pinned: effPinned.slice(),
				W: document.getElementById('eff-bar').getBoundingClientRect().width, edges: effEdges(), n: effData.steps.length }));
			const shoeC = (i) => page.evaluate((k) => { const r = document.querySelector('.eff-shoe[data-tier="' + k + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
			const base0 = await info();
			// 各蹄鉄を右へ・左へドラッグ: 担当する境目だけが動き、動いた向きが合う
			for (const [i, name] of [[0, '銅'], [1, '銀'], [2, '金']]) {
				await setBounds(page, null);
				const before = await info();
				const dxPx = Math.min(before.W * 0.06, 30);
				let c = await shoeC(i);
				await page.mouse.move(c.x, c.y); await page.mouse.down();
				await page.mouse.move(c.x - dxPx * 2, c.y, { steps: 5 });
				await page.mouse.up();
				const left = await info();
				assert(left.b[i] < before.b[i] && left.b.every((v, j) => j === i || v === before.b[j]),
					'微調整2B2(' + w + 'px): ' + name + 'の蹄鉄を左へドラッグすると、' + name + 'が担当する境目（' + (i + 1) + '番目）だけが小さくなる', { before: before.b, after: left.b });
				c = await shoeC(i);
				await page.mouse.move(c.x, c.y); await page.mouse.down();
				await page.mouse.move(c.x + dxPx * 3, c.y, { steps: 5 });
				await page.mouse.up();
				const right = await info();
				assert(right.b[i] > left.b[i] && right.b.every((v, j) => j === i || v === left.b[j]) && right.stored === JSON.stringify(right.b.map((m) => m / 1000)) && right.tiers.every(Boolean),
					'微調整2B2(' + w + 'px): ' + name + 'の蹄鉄を右へドラッグすると境目が大きくなり、保存される。区間のON/OFFは切り替わらない', { left: left.b, right: right.b, stored: right.stored });
			}
			// ドラッグの量→境目の位置: 境目の位置（個数の積み上げ）は、ドラッグを始めた時点の位置＋動いた距離に最も近い段
			await setBounds(page, null);
			{
				const before = await info();
				const dx = -Math.round(before.W * 0.2);
				const c = await shoeC(2);
				await page.mouse.move(c.x, c.y); await page.mouse.down();
				await page.mouse.move(c.x + dx, c.y, { steps: 8 });
				await page.mouse.up();
				const after = await info();
				const want = await page.evaluate(([pos0, dxp, W]) => {
					const f = (pos0 + dxp) / W;
					const idx = effBoundIdx();
					const lo = idx[1] + 1, hi = effData.steps.length - 2;
					return Math.min(hi, Math.max(lo, effNearestStepByPos(f, effData)));
				}, [before.edges[3] * before.W, dx, before.W]);
				const gotIdx = await page.evaluate(() => effData.steps.indexOf(effBounds[2]));
				assert(gotIdx === want, '微調整2B2(' + w + 'px): 金の蹄鉄を ' + dx + 'px ドラッグすると、境目は「始めた位置＋動いた距離」に最も近い段（段の値）に吸い付く', { gotIdx, want });
			}
			// しきい値未満（6px未満）の動きはタップ: 境目は動かず、吹き出しの常時表示が切り替わる（保存しない）
			await setBounds(page, null);
			{
				const before = await info();
				const c = await shoeC(1);
				await page.mouse.move(c.x, c.y); await page.mouse.down();
				await page.mouse.move(c.x + 3, c.y, { steps: 2 });
				await page.mouse.up();
				const after = await info();
				assert(JSON.stringify(after.b) === JSON.stringify(before.b) && after.pinned[1] === true && after.stored === before.stored,
					'微調整2B2(' + w + 'px): 3px の動きはタップ（境目は動かず、吹き出しの常時表示が入る。何も保存しない）', { before: before.b, after: after.b, pinned: after.pinned });
				await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 5, c.y); await page.mouse.up();
				const again = await info();
				assert(JSON.stringify(again.b) === JSON.stringify(before.b) && again.pinned[1] === false, '微調整2B2(' + w + 'px): 5px の動き（6px未満）もタップ。もう一度のタップで常時表示は切れる', again);
				await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 30, c.y, { steps: 3 }); await page.mouse.up();
				const over = await info();
				assert(over.b[1] !== before.b[1] && over.pinned[1] === false, '微調整2B2(' + w + 'px): 6px 以上（ここでは30px）動かすとドラッグ（境目が動き、常時表示は切り替わらない）', { before: before.b, after: over.b, pinned: over.pinned });
			}
			// 両端: 銅を左へ引ききると最小の段まで・金を右へ引ききると最大の1つ下の段まで・銀は両隣の1段手前で止まる
			await setBounds(page, null);
			{
				const W = (await info()).W;
				let c = await shoeC(0);
				await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x - W, c.y, { steps: 6 }); await page.mouse.up();
				c = await shoeC(2);
				await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + W, c.y, { steps: 6 }); await page.mouse.up();
				c = await shoeC(1);
				await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + W, c.y, { steps: 6 }); await page.mouse.up();
				const e = await page.evaluate(() => ({ idx: effBoundIdx(), n: effData.steps.length }));
				assert(e.idx[0] === 0 && e.idx[2] === e.n - 2 && e.idx[1] === e.idx[2] - 1,
					'微調整2B2(' + w + 'px): 引ききると、銅は最小の段・金は最大の1つ下・銀は金の1段手前で止まる（4つの区間のどれも1種以上）', e);
			}
			// 虹の蹄鉄は動かない（ドラッグしてもタップしても何も起きない）
			await setBounds(page, null);
			{
				const before = await info();
				const c = await shoeC(3);
				const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return { isShoe: !!(el && el.closest && el.closest('.eff-shoe--3')), pe: getComputedStyle(document.querySelector('.eff-shoe--3')).pointerEvents, role: document.querySelector('.eff-shoe--3').getAttribute('role'), hidden: document.querySelector('.eff-shoe--3').getAttribute('aria-hidden'), tag: document.querySelector('.eff-shoe--3').tagName }; }, [c.x, c.y]);
				await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x - 60, c.y, { steps: 4 }); await page.mouse.up();
				const after = await info();
				assert(JSON.stringify(after.b) === JSON.stringify(before.b) && after.pinned.every((p) => !p) && after.tiers.every(Boolean) && !hit.isShoe && hit.pe === 'none' && hit.role === null && hit.hidden === 'true' && hit.tag !== 'BUTTON',
					'微調整2B2(' + w + 'px): 虹の蹄鉄は飾り（ボタン・スライダーではなく、触れない）。ドラッグしてもタップしても何も起きない', { hit, before: before.b, after: after.b });
			}
			assert(jsErrors(errors).length === 0, '微調整2B2(' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
			void base0;
			await ctx.close();
		}
		// タッチ（ポインタの種類が touch）でも同じ: 合成のポインタイベントで横の動きを送る
		{
			const { ctx, page } = await openExam({ w: 375 });
			const r = await page.evaluate(() => {
				const shoe = document.querySelector('.eff-shoe[data-idx="1"]');
				const rc = shoe.getBoundingClientRect();
				const x = rc.x + rc.width / 2, y = rc.y + rc.height / 2;
				const ev = (type, dx) => shoe.dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y, bubbles: true, button: 0 }));
				const b0 = effBounds[1];
				ev('pointerdown', 0); ev('pointermove', -10); ev('pointermove', -40); ev('pointermove', -50); ev('pointerup', -50);
				const b1 = effBounds[1];
				return { b0, b1, pinned: effPinned.slice(), dragging: effDragIdx };
			});
			assert(r.b1 < r.b0 && r.dragging === null && r.pinned.every((p) => !p), '微調整2B2(375px・touch): タッチのポインタでも横にドラッグすると境目が動き、終わると操作の状態が残らない', r);
			await ctx.close();
		}
	});

	/* ====================================================================
	 * B3: 区間のタップでON/OFF・蹄鉄では切り替わらない・最後の1区間は外せない
	 * ==================================================================== */
	await block('微調整2B3 バーの各区間のエリアをタップすると、その区間を対象に入れる／外す（aria-pressed）／蹄鉄のタップでは切り替わらない／最後の1区間は外せない（知らせが出る・押せないままにはしない）', async () => {
		for (const w of [1280, 375]) {
			const { ctx, page, errors } = await openExam({ w });
			const st = () => page.evaluate(() => ({ tiers: effTiers.slice(), pressed: [...document.querySelectorAll('.eff-hit')].map((h) => h.getAttribute('aria-pressed')), on: [...document.querySelectorAll('.eff-seg')].map((s) => s.getAttribute('data-on')),
				shoeOff: [...document.querySelectorAll('.eff-shoe')].map((s) => s.getAttribute('data-off')), count: Number(document.getElementById('scope-count-efficiency').textContent), n: effTargets().length,
				stored: localStorage.getItem('uma-exam-eff-tiers'), disabled: [...document.querySelectorAll('.eff-hit')].map((h) => h.disabled), pinned: effPinned.slice() }));
			// 各区間をタップ（区間の見えている中央あたり）
			for (let k = 0; k < 4; k++) {
				const before = await st();
				const pt = await page.evaluate((kk) => { const r = document.querySelector('.eff-hit[data-tier="' + kk + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, k);
				await page.mouse.click(pt.x, pt.y);
				const a = await st();
				assert(a.tiers[k] === false && a.pressed[k] === 'false' && a.on[k] === 'false' && a.shoeOff[k] === 'true' && a.count < before.count && a.count === a.n && a.stored === JSON.stringify(a.tiers)
					&& a.tiers.every((v, j) => j === k || v === true),
					'微調整2B3(' + w + 'px): 区間' + k + 'のエリアをタップすると外れる（aria-pressed が false・バーは灰色・蹄鉄も灰色・種数が減る・保存される）', { before, after: a });
				await page.mouse.click(pt.x, pt.y);
				const b = await st();
				assert(b.tiers.every(Boolean) && b.pressed.every((p) => p === 'true') && b.count === before.count, '微調整2B3(' + w + 'px): もう一度タップすると戻る（区間' + k + '）', b);
			}
			// 蹄鉄のタップでは ON/OFF は切り替わらない（吹き出しの常時表示が切り替わるだけ）
			{
				const before = await st();
				for (const i of [0, 1, 2]) {
					const c = await page.evaluate((k) => { const r = document.querySelector('.eff-shoe[data-idx="' + k + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
					await page.mouse.click(c.x, c.y);
				}
				const a = await st();
				assert(JSON.stringify(a.tiers) === JSON.stringify(before.tiers) && a.count === before.count && a.pinned.every(Boolean),
					'微調整2B3(' + w + 'px): 蹄鉄をタップしても区間の ON/OFF は切り替わらない（役割が変わった）。切り替わるのは吹き出しの常時表示', { before, a });
				await setBounds(page, null);
			}
			// 最後の1区間は外せない
			{
				await page.evaluate(() => { effTiers = [true, true, true, true]; layoutEffPanel(); });
				const tap = async (k) => { const pt = await page.evaluate((kk) => { const r = document.querySelector('.eff-hit[data-tier="' + kk + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, k); await page.mouse.click(pt.x, pt.y); };
				await tap(0); await tap(1); await tap(2);
				const before = await st();
				await page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
				await tap(3);
				await page.waitForTimeout(100);
				const a = await st();
				const toast = await page.evaluate(() => document.getElementById('toast-message').textContent);
				assert(JSON.stringify(before.tiers) === JSON.stringify([false, false, false, true]) && JSON.stringify(a.tiers) === JSON.stringify(before.tiers) && a.pressed[3] === 'true' && toast === '最後の1区間は外せません'
					&& a.disabled.every((d) => !d) && a.count === before.count && a.count > 0,
					'微調整2B3(' + w + 'px): 最後の1区間は外せない（外す操作は受け付けず、「最後の1区間は外せません」と知らせる。押せない状態〔disabled〕にはしない）', { before, a, toast });
				// 外している区間は、最後の1つでなければ戻せる／最後の1つ以外を押す（入れる）のは常にできる
				await tap(0);
				const c = await st();
				assert(c.tiers[0] === true && c.tiers[3] === true, '微調整2B3(' + w + 'px): 外した区間は、残りが1つでもタップで入れ直せる', c);
				await page.evaluate(() => { effTiers = [true, true, true, true]; saveEffSettings(); layoutEffPanel(); });
			}
			// キーボード: 区間のエリアは Tab で届き、Enter・Space で切り替わる
			{
				await page.focus('.eff-hit[data-tier="2"]');
				await page.keyboard.press('Enter');
				const a = await st();
				await page.keyboard.press('Space');
				const b = await st();
				const role = await page.evaluate(() => { const h = document.querySelector('.eff-hit[data-tier="2"]'); return { tag: h.tagName, label: h.getAttribute('aria-label') }; });
				assert(a.tiers[2] === false && b.tiers[2] === true && role.tag === 'BUTTON' && /金|銅|銀|虹/.test(role.label) && /\d+種/.test(role.label) && /\d\.\d{3}〜\d\.\d{3}/.test(role.label),
					'微調整2B3(' + w + 'px): 区間のエリアは読み上げ用のボタン（aria-pressed・名前に区間・範囲・個数を含む）で、Enter と Space で切り替わる', { a: a.tiers, b: b.tiers, role });
			}
			assert(jsErrors(errors).length === 0, '微調整2B3(' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});

	/* ====================================================================
	 * B4: 吹き出し（ドラッグ中だけ・蹄鉄のタップで常時表示／非表示・8文字の名前は全文）
	 * ==================================================================== */
	await block('微調整2B4 吹き出し: 規定はドラッグ中だけ／蹄鉄のタップで常時表示と非表示が切り替わる（保存しない）／重なるときは上へずらす／8文字のスキル名は全文（375・393・320px）', async () => {
		for (const w of [1280, 375]) {
			const { ctx, page } = await openExam({ w });
			const vis = () => page.evaluate(() => [0, 1, 2].map((i) => !document.getElementById('eff-tip-' + i).hidden));
			assert((await vis()).every((v) => !v), '微調整2B4(' + w + 'px): 規定では吹き出しは出ていない（ドラッグ中だけ出す）', await vis());
			const c = await page.evaluate(() => { const r = document.querySelector('.eff-shoe[data-idx="1"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
			await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x - 20, c.y, { steps: 4 });
			const during = await vis();
			const content = await page.evaluate(() => { const t = document.getElementById('eff-tip-1'); const v = effBounds[1]; const rep = effData.targets.find((x) => x.milli === v); return { name: t.querySelector('.eff-tip-name').textContent, want: rep.name, nums: [...t.querySelectorAll('.eff-tip-num')].map((e) => e.textContent), wantNums: [effFormat(v), String(rep.score), String(rep.sp)] }; });
			await page.mouse.up();
			const after = await vis();
			assert(JSON.stringify(during) === JSON.stringify([false, true, false]) && after.every((v) => !v) && content.name === content.want && JSON.stringify(content.nums) === JSON.stringify(content.wantNums),
				'微調整2B4(' + w + 'px): 銀の蹄鉄をドラッグしている間だけ、その境目の吹き出し（スキル名・効率・評価点・消費sp）が出て、離すと消える', { during, after, content });
			// タップで常時表示 → もう一度で非表示。ほかの蹄鉄の吹き出しとは独立
			const tapShoe = async (i) => { const p = await page.evaluate((k) => { const r = document.querySelector('.eff-shoe[data-idx="' + k + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i); await page.mouse.click(p.x, p.y); };
			await tapShoe(0);
			const t1 = await vis();
			await tapShoe(2);
			const t2 = await vis();
			await tapShoe(0);
			const t3 = await vis();
			assert(JSON.stringify(t1) === JSON.stringify([true, false, false]) && JSON.stringify(t2) === JSON.stringify([true, false, true]) && JSON.stringify(t3) === JSON.stringify([false, false, true]),
				'微調整2B4(' + w + 'px): 蹄鉄のタップで、その境目の吹き出しが常時表示／非表示に切り替わる（ほかの蹄鉄とは独立）', { t1, t2, t3 });
			// 常時表示の状態は保存しない: 開き直すと規定（出ていない）に戻る
			const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /eff/i.test(k)).map((k) => k + '=' + localStorage.getItem(k)));
			await reloadReady(page);
			await page.waitForFunction(() => !!effData, null, { timeout: 15000 });
			await page.waitForTimeout(300);
			const reopened = await vis();
			assert(reopened.every((v) => !v) && !stored.some((s) => /pin|tip/i.test(s)), '微調整2B4(' + w + 'px): 常時表示の状態は保存されない（開き直すと規定に戻る）', { reopened, stored });
			// 複数を常時表示にして重なるときは上へずらす。どれも帯の枠と画面の内側
			await page.evaluate(() => { effPinned = [true, true, true]; layoutEffPanel(); });
			const g = await page.evaluate(() => {
				const p = document.getElementById('eff-panel').getBoundingClientRect(), vw = document.documentElement.clientWidth;
				return [0, 1, 2].map((i) => { const r = document.getElementById('eff-tip-' + i).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, pl: p.left, pr: p.right, vw }; });
			});
			let overlaps = 0;
			for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (g[i].l < g[j].r && g[j].l < g[i].r && g[i].t < g[j].b && g[j].t < g[i].b) overlaps++;
			assert(overlaps === 0 && g.every((r) => r.l >= r.pl - 0.5 && r.r <= r.pr + 0.5 && r.l >= 0 && r.r <= r.vw && r.r > r.l),
				'微調整2B4(' + w + 'px): 3つとも常時表示にしても吹き出しは重ならず（重なるときは上へずらす）、帯の枠と画面の内側に収まる', g);
			await ctx.close();
		}
		// 8文字のスキル名は省略されない（375・393・320px）。8文字を超える名前は、収まらないときだけ「…」で詰める。実データの最長の名前も確かめる
		for (const w of [375, 393, 320]) {
			const { ctx, page } = await openExam({ w });
			const names = await page.evaluate(() => {
				const len = (s) => [...s].length;
				const steps = effData.steps;
				// 境目として置ける段（最小の段・最大の段の1つ下まで）のうち、代表の名前が8文字ちょうど／最長のもの
				const cand = [];
				for (let i = 0; i < steps.length - 1; i++) { const rep = effRepresentative(steps[i]); if (rep) cand.push({ i, name: rep.name, len: len(rep.name) }); }
				const eight = cand.filter((c) => c.len === 8);
				const longest = cand.slice().sort((a, b) => b.len - a.len)[0];
				const allLongest = Math.max(...effData.targets.map((t) => len(t.name)));
				return { eight: eight.map((c) => c.i), eightCount: eight.length, longest, allLongest, n: steps.length };
			});
			assert(names.eightCount >= 1, '微調整2B4(' + w + 'px): 8文字の名前を代表に持つ境目の候補がある（空振りでない）', { eightCount: names.eightCount, allLongest: names.allLongest });
			const measure = async (stepIdx, slot, synth) => page.evaluate(({ stepIdx, slot, synth }) => {
				// 境目 slot を段 stepIdx へ（ほかの境目は区間が1種以上になるよう寄せる）
				const n = effData.steps.length;
				const idx = [0, 1, 2].map((j) => j === slot ? stepIdx : null);
				const cur = [Math.max(1, Math.floor(n * 0.25)), Math.floor(n * 0.5), Math.floor(n * 0.75)];
				cur[slot] = stepIdx;
				// 昇順・間隔1以上に直す
				for (let j = 1; j < 3; j++) if (cur[j] <= cur[j - 1]) cur[j] = cur[j - 1] + 1;
				for (let j = 1; j >= 0; j--) if (cur[j] >= cur[j + 1]) cur[j] = cur[j + 1] - 1;
				effBounds = cur.map((i) => effData.steps[i]);
				effPinned = [false, false, false]; effPinned[slot] = true;
				const repS = effRepresentative(effData.steps[stepIdx]), oldName = repS.name;
				if (synth) repS.name = synth;
				layoutEffPanel();
				const tip = document.getElementById('eff-tip-' + slot), nm = tip.querySelector('.eff-tip-name');
				const p = document.getElementById('eff-panel').getBoundingClientRect();
				const out = { ok: effBounds[slot] === effData.steps[stepIdx], name: nm.textContent, cut: nm.scrollWidth > nm.clientWidth + 0.5, tipW: tip.getBoundingClientRect().width, panelW: p.width, text: nm.textContent };
				repS.name = oldName; layoutEffPanel();
				return out;
			}, { stepIdx, slot, synth: synth || null });
			let eightOk = 0, eightBad = [];
			for (const si of names.eight) {
				for (const slot of [0, 1, 2]) {
					const r = await measure(si, slot);
					if (!r.ok) continue;
					eightOk++;
					if (r.cut) eightBad.push({ si, slot, name: r.name, tipW: r.tipW, panelW: r.panelW });
				}
			}
			assert(eightOk >= 3 && eightBad.length === 0, '微調整2B4(' + w + 'px): 実データの8文字のスキル名は省略されず全文で出る（' + eightOk + '通りを確認）', { eightOk, eightBad });
			// 8文字の名前が全角の8文字（最も幅をとる）でも省略されない: 境目の位置（両端・真ん中）×3つの境目で、代表の名前を全角8文字に差し替えて測る
			const synthName = 'あ'.repeat(8);
			const nn = names.n;
			let synthOk = 0; const synthBad = [];
			for (const si of [1, 2, Math.floor(nn / 4), Math.floor(nn / 2), Math.floor(nn * 3 / 4), nn - 3, nn - 2]) {
				for (const slot of [0, 1, 2]) {
					const r = await measure(si, slot, synthName);
					if (!r.ok) continue;
					synthOk++;
					if (r.cut || r.name !== synthName) synthBad.push({ si, slot, tipW: r.tipW, panelW: r.panelW });
				}
			}
			assert(synthOk >= 8 && synthBad.length === 0, '微調整2B4(' + w + 'px): 全角8文字の名前（最も幅をとる）は、どの境目・どの位置でも省略されず全文で出る（' + synthOk + '通りを確認）', { synthOk, synthBad });
			const lg = await measure(Math.floor(names.n / 2), 1, 'あ'.repeat(names.allLongest));
			const maxTip = lg.panelW - 8;
			assert(!lg.cut || lg.tipW >= maxTip - 1.5, '微調整2B4(' + w + 'px): 8文字を超える名前（実データ全体で最長 ' + names.allLongest + '文字を、全角に差し替えて）は、収まらないときだけ末尾を省略する（省略したなら吹き出しは使える幅いっぱい）', { lg, maxTip, longest: names.longest, allLongest: names.allLongest });
			await ctx.close();
		}
	});

	/* ====================================================================
	 * B5: 蹄鉄の配置（重ならない・虹を下へ押し出さない・順番を保つ・リセットは蹄鉄の下）
	 * ==================================================================== */
	await block('微調整2B5 蹄鉄は1段の行に 銅・銀・金・虹 の順で並び、重ならない（375・393・320px。境目を両端に寄せても）／虹を下へ押し出さない／リセットは蹄鉄の行の下の右下', async () => {
		for (const w of [375, 393, 320]) {
			const { ctx, page, errors } = await openExam({ w });
			const n = await nSteps(page);
			for (const [label, idxs] of shapesOf(n)) {
				await setBounds(page, idxs);
				const g = await page.evaluate(() => {
					const R = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
					const bar = R(document.getElementById('eff-bar'));
					return { bar, shoes: [...document.querySelectorAll('.eff-shoe')].map(R), reset: R(document.getElementById('eff-reset-btn')), panel: R(document.getElementById('eff-panel')),
						marks: [...document.querySelectorAll('.eff-mark')].map(R), sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
				});
				const bad = [];
				const tops = new Set(g.shoes.map((s) => Math.round(s.t * 10)));
				if (tops.size !== 1) bad.push('蹄鉄が1段の行に並んでいない（虹が下へ押し出されている）');
				for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (g.shoes[i].l < g.shoes[j].r && g.shoes[j].l < g.shoes[i].r) bad.push('蹄鉄' + i + 'と' + j + 'の箱が重なる');
				for (let k = 0; k < 3; k++) if (!(g.shoes[k].l < g.shoes[k + 1].l)) bad.push('順番が入れ替わっている ' + k);
				g.shoes.forEach((s, k) => { if (s.l < g.bar.l - 0.5 || s.r > g.bar.r + 0.5) bad.push('蹄鉄' + k + 'がバーの幅の外'); });
				if (Math.abs(g.shoes[3].r - g.bar.r) > 1) bad.push('虹が右端にない');
				if (g.reset.t < Math.max(...g.shoes.map((s) => s.b)) - 0.5) bad.push('リセットが蹄鉄の行の下にない');
				if (Math.abs(g.reset.r - g.bar.r) > 1.5 || g.reset.b > g.panel.b + 0.5) bad.push('リセットが右下にない');
				if (g.sw > g.vw) bad.push('横にはみ出す');
				assert(bad.length === 0, '微調整2B5(' + w + 'px・' + label + '): 蹄鉄は1段・順番どおり・重ならない・バーの内側／虹は右端／リセットは行の下の右下／横にはみ出さない', bad);
			}
			assert(jsErrors(errors).length === 0, '微調整2B5(' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
		// 高さの増減（旧→新）: 旧（微調整1の先端）の効率を指定の枠の高さは 375px→218.8px・393px→202.8px・1280px→120.8px。新は余裕領域（リセットの置き場）を足した形
		for (const w of [375, 393, 1280]) {
			const { ctx, page } = await openExam({ w });
			const h = await page.evaluate(() => document.getElementById('eff-panel').getBoundingClientRect().height);
			assert(h > 100 && h < 260, '微調整2B5(' + w + 'px): 効率を指定の枠の高さは妥当な範囲（' + h.toFixed(1) + 'px）', h);
			await ctx.close();
		}
	});

	/* ====================================================================
	 * B6: 目印は触れない・蹄鉄の touch-action
	 * ==================================================================== */
	await block('微調整2B6 境目の目印は触れない表示だけ（ポインタイベントが来ない）／蹄鉄の上のドラッグは縦のスクロールを妨げない（touch-action: pan-y）／銅・銀・金はスライダー', async () => {
		for (const w of [1280, 375]) {
			const { ctx, page } = await openExam({ w });
			const r = await page.evaluate(() => {
				const marks = [...document.querySelectorAll('.eff-mark')];
				const hits = marks.map((m) => {
					const rc = m.getBoundingClientRect();
					const x = rc.x + rc.width / 2, y = rc.y + rc.height / 2;
					const el = document.elementFromPoint(x, y);
					return { pe: getComputedStyle(m).pointerEvents, isMark: !!(el && el.classList.contains('eff-mark')), tab: m.getAttribute('tabindex'), role: m.getAttribute('role'), hidden: m.getAttribute('aria-hidden'), thumbCount: document.querySelectorAll('.eff-thumb').length };
				});
				const shoes = [...document.querySelectorAll('.eff-shoe[data-idx]')].map((s) => ({ ta: getComputedStyle(s).touchAction, role: s.getAttribute('role'), tab: s.getAttribute('tabindex'), label: s.getAttribute('aria-label') }));
				return { hits, shoes };
			});
			assert(r.hits.length === 3 && r.hits.every((h) => h.pe === 'none' && !h.isMark && h.tab === null && h.role === null && h.hidden === 'true' && h.thumbCount === 0),
				'微調整2B6(' + w + 'px): 境目の目印は触れない（pointer-events: none・押せる要素の上に重なっていない・フォーカスもされない・つまみの要素は無い）', r.hits);
			assert(r.shoes.length === 3 && r.shoes.every((s) => s.ta === 'pan-y' && s.role === 'slider' && s.tab === '0'),
				'微調整2B6(' + w + 'px): 銅・銀・金の蹄鉄は touch-action: pan-y（横の動きだけ止め、縦のスクロールは妨げない）のスライダー', r.shoes);
			// 目印の上で押しても区間のエリアのタップになるだけで、境目は動かない
			const before = await page.evaluate(() => effBounds.slice());
			const p = await page.evaluate(() => { const rc = document.querySelector('.eff-mark[data-idx="1"]').getBoundingClientRect(); return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2 }; });
			await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x - 40, p.y, { steps: 5 }); await page.mouse.up();
			const after = await page.evaluate(() => ({ b: effBounds.slice(), tiers: effTiers.slice() }));
			assert(JSON.stringify(after.b) === JSON.stringify(before), '微調整2B6(' + w + 'px): 目印をドラッグしても境目は動かない（バーを直接ドラッグする操作は無い）', { before, after: after.b });
			await ctx.close();
		}
	});

	/* ====================================================================
	 * B7: 区間のエリアは最低24px（足りないぶんは隣から削る。隣も24pxを下回らない）
	 * ==================================================================== */
	await block('微調整2B7 区間のエリア（押せる範囲）は最低24px。細い区間（虹など）は隣から削って確保し、隣も24pxを下回らない（375・393・320px。境目を両端に寄せても）', async () => {
		for (const w of [375, 393, 320]) {
			const { ctx, page } = await openExam({ w });
			const n = await nSteps(page);
			for (const [label, idxs] of shapesOf(n)) {
				await setBounds(page, idxs);
				const g = await page.evaluate(() => {
					const bar = document.getElementById('eff-bar').getBoundingClientRect();
					return { W: bar.width, hits: [...document.querySelectorAll('.eff-hit')].map((h) => { const r = h.getBoundingClientRect(); return { l: r.left - bar.left, r: r.right - bar.left, w: r.width, h: r.height }; }),
						segs: [...document.querySelectorAll('.eff-seg')].map((s) => s.getBoundingClientRect().width) };
				});
				const bad = [];
				g.hits.forEach((h, k) => { if (h.w < 24 - 0.5) bad.push('区間' + k + 'のエリアが ' + h.w.toFixed(1) + 'px'); if (h.h < 24) bad.push('区間' + k + 'の高さ ' + h.h); });
				for (let k = 0; k < 3; k++) if (Math.abs(g.hits[k].r - g.hits[k + 1].l) > 0.6) bad.push('区間' + k + 'と' + (k + 1) + 'のエリアの間にすき間か重なり');
				if (Math.abs(g.hits[0].l) > 0.6 || Math.abs(g.hits[3].r - g.W) > 0.6) bad.push('両端がバーの端でない');
				assert(bad.length === 0, '微調整2B7(' + w + 'px・' + label + '): 4つの区間のエリアは最低24px・すき間なく並び、両端はバーの端（細い区間の見た目の幅 ' + g.segs.map((s) => Math.round(s)).join('/') + '）', bad);
			}
			// 細い区間（虹）は、見た目の幅が24px未満でも押せる: 虹の見た目の中央をタップ → 虹が切り替わる
			await setBounds(page, null);
			const thin = await page.evaluate(() => { const s = document.querySelector('.eff-seg--3').getBoundingClientRect(); return { w: s.width, x: s.x + s.width / 2, y: s.y + s.height / 2 }; });
			if (thin.w < 24) {
				await page.mouse.click(thin.x, thin.y);
				const t = await page.evaluate(() => effTiers.slice());
				assert(t[3] === false && t.slice(0, 3).every(Boolean), '微調整2B7(' + w + 'px): 虹（見た目 ' + thin.w.toFixed(1) + 'px）の見た目の中央をタップすると、虹が切り替わる（隣の区間にならない）', t);
			}
			await ctx.close();
		}
	});

	/* ====================================================================
	 * B8: キー操作と読み上げの名前
	 * ==================================================================== */
	await block('微調整2B8 蹄鉄にフォーカスして ←→ で1段・Shift＋←→ で5段／Enter・Space で吹き出しの常時表示／読み上げの名前は「（銅・銀・金）の境界・現在の値」', async () => {
		const { ctx, page, errors } = await openExam({ w: 375 });
		const names = await page.evaluate(() => [...document.querySelectorAll('.eff-shoe[data-idx]')].map((s) => ({ label: s.getAttribute('aria-label'), now: s.getAttribute('aria-valuenow'), text: s.getAttribute('aria-valuetext'), role: s.getAttribute('role') })));
		const want = await page.evaluate(() => effBounds.map((v) => effFormat(v)));
		assert(names[0].label === '銅の境界 ' + want[0] && names[1].label === '銀の境界 ' + want[1] && names[2].label === '金の境界 ' + want[2] && names.every((x, i) => x.now === want[i] && x.text.startsWith(want[i]) && x.role === 'slider'),
			'微調整2B8: 読み上げの名前は「銅の境界 3.779」の形（銅・銀・金・現在の値）。aria-valuenow・aria-valuetext（値とスキル名）も入る', names);
		await page.focus('.eff-shoe[data-idx="1"]');
		const i0 = await page.evaluate(() => effData.steps.indexOf(effBounds[1]));
		await page.keyboard.press('ArrowLeft');
		const i1 = await page.evaluate(() => effData.steps.indexOf(effBounds[1]));
		await page.keyboard.press('Shift+ArrowLeft');
		const i2 = await page.evaluate(() => effData.steps.indexOf(effBounds[1]));
		const label2 = await page.evaluate(() => document.querySelector('.eff-shoe[data-idx="1"]').getAttribute('aria-label'));
		assert(i1 === i0 - 1 && i2 === i1 - 5 && label2 === '銀の境界 ' + (await page.evaluate(() => effFormat(effBounds[1]))), '微調整2B8: ← は1段・Shift＋← は5段ずつ動き、読み上げの名前の値も追随する', { i0, i1, i2, label2 });
		await page.keyboard.press('Enter');
		const p1 = await page.evaluate(() => effPinned.slice());
		await page.keyboard.press('Space');
		const p2 = await page.evaluate(() => effPinned.slice());
		assert(JSON.stringify(p1) === JSON.stringify([false, true, false]) && JSON.stringify(p2) === JSON.stringify([false, false, false]), '微調整2B8: Enter・Space で吹き出しの常時表示が切り替わる（蹄鉄のタップと同じ）', { p1, p2 });
		assert(jsErrors(errors).length === 0, '微調整2B8: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});
}
