// 「条件で検索」の小窓の直し（2026-10-30・おいもさんの決定）の検査。
// run-smoke.mjs の末尾から register67() で呼ばれる（塊の見出しはすべて「検索の小窓」で始まる。`npm run test:visual -- --only=検索の小窓` で回せる）。
//
// 決め（おいもさん・2026-10-30）:
//  (1) 選択済みのチェックが他の軸にも出る不具合を直す（「その他」で2つ選んだあと、ほかの軸を開くと、選んでいない選択肢に印が透けていた）。
//      原因: 選んでいない軸のパネルは同じマスに重ねて visibility: hidden で隠しているのに、印（input:checked::after）が visibility: visible を
//      書いていて、子が親の hidden を破っていた。同じ形の距離のエラーの文も直した。
//  (2) 軸の説明文: 排他の軸「選んだ制限を持つスキル、または制限なし（OR）」／空を「該当なし」と読む軸「選んだもののいずれかに一致（OR）。」
//  (3) 距離の軸の「入れると、その距離のレースで発動するスキルに絞る（区分は距離から決まる）」を消す
//  (4) スマホ幅: 軸の選択肢を開いても結果が最低3行見える・閉じたら結果が最大限見える。押せる範囲・文字の大きさ・PC 幅の見た目は不変。
// 寸法の固定値は、変更前の commit（22cac86）の見た目を実測したもの（実装の側の値を読んで書いていない）:
//   押せる範囲（スマホ幅）: タブの高さ 42・選択肢のチップ 32・追加のボタン 38・× 28。PC（1280）: タブ 55・チップ 32・追加 38・× 28。最小の文字 11px。
//   PC（1280×900・距離を開く）: 小窓の上端 111・高さ 765・選択肢のパネル 194・結果の箱 537＋280。畳むと結果の箱 343＋474。
//
// T27（2026-10-31・おいもさんの決定）で (1)(4)(5) の期待値を置き換えた（手本は T21 のモック f-ba。C-241 で「不変」とした値を変えた）。
// 変更前（f3d4882）で上の値を実測して一致を確かめたうえで、変更後に実測した値を入れた:
//   押せる範囲: タブ 30（PC の1行のタブは 32、選んだタブは持ち上げ 3px で 35）・選択肢 26・追加 32・× 28（不変）。一覧の行 29 → 25。
//   PC（1280×900）: 小窓の上端 24・高さ 852（画面の上下 24px を残す）。選んでいない軸のパネルは場所を取らないので、軸ごとに選択肢のパネルの高さが変わり、
//   結果の箱が残りを受け取る（下端は 825 で一定）。畳むと結果の箱 168＋657。
//   選び方は地の色（○は出さない。T21 の (a)）。選んだ選択肢は地 --usd-ui-set・枠 --usd-ui-sel の 2px・太字。

import { pickEntry } from './lib/entry-search.mjs';
import { reloadReady } from './lib/page-ready.mjs';

export async function register67(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const AXES = ['distance', 'style', 'surface', 'effect', 'phase', 'coursePos', 'distanceMark', 'scenario'];
	const OTHERS = AXES.filter((a) => a !== 'scenario');
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));

	/** special を開いて、虫眼鏡 → 「条件で検索」で小窓を開く */
	const openPicker = async (w, h, theme) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		await sp.page.evaluate((theme) => { localStorage.setItem('umaSkillDeck:stepTab', '1'); localStorage.setItem('uma-tools-theme', theme); }, theme);
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await pickEntry(sp.page, 'editor-pick');
		await sp.page.waitForSelector('[data-usd-el="results"] .usd-row', { timeout: 20000 });
		await sp.page.waitForTimeout(300);
		return sp;
	};
	/** 軸のタブを押して開く（open=false なら開いたあとにもう一度押して畳む） */
	const showAxis = async (page, axis, open = true) => {
		const st = () => page.evaluate((axis) => ({
			sel: document.querySelector('.usd-tab[data-usd-axis="' + axis + '"]').getAttribute('aria-selected') === 'true',
			open: document.querySelector('[data-usd-el="axis-tabs"]').getAttribute('data-usd-open') === 'true'
		}), axis);
		let s = await st();
		if (!s.sel || !s.open) await page.click('.usd-tab[data-usd-axis="' + axis + '"]');
		s = await st();
		if (!open && s.open) await page.click('.usd-tab[data-usd-axis="' + axis + '"]');
		await page.waitForTimeout(150);
	};
	/** いま出ている軸の選択肢と、ほかの軸の選択済みの印の見え方 */
	const readMarks = (page) => page.evaluate(() => {
		const active = document.querySelector('.usd-tabpanel.is-active');
		const opts = Array.from(active.querySelectorAll('.usd-opt'));
		const base = opts.find((l) => !l.querySelector('input').checked);
		const baseBg = base ? getComputedStyle(base).backgroundColor : null;
		return {
			axis: active.dataset.usdAxis,
			activeChecked: opts.filter((l) => l.querySelector('input').checked).map((l) => l.textContent.trim()),
			// 選んでいない選択肢に、選択済みの色・印・クラスが付いていないか
			activeMarked: opts.filter((l) => {
				const i = l.querySelector('input');
				return i.checked || getComputedStyle(i, '::after').visibility === 'visible' || getComputedStyle(l).backgroundColor !== baseBg || l.className !== 'usd-opt';
			}).map((l) => l.textContent.trim()),
			// ほかの軸のパネルの中の選択済みの印・選択肢の地が、画面に見えていないか（見えていれば重なって透ける）
			leaked: Array.from(document.querySelectorAll('.usd-tabpanel:not(.is-active) .usd-opt')).filter((l) => {
				const i = l.querySelector('input');
				const r = i.getBoundingClientRect();
				const shown = r.width > 0 && r.height > 0;
				return shown && (getComputedStyle(i, '::after').visibility === 'visible' || getComputedStyle(i).visibility === 'visible' || getComputedStyle(l).visibility === 'visible');
			}).map((l) => l.querySelector('input').dataset.axis + ':' + l.querySelector('input').dataset.value),
			hx: document.documentElement.scrollWidth > window.innerWidth + 1
		};
	});

	await block('検索の小窓(1) 「その他」で2つ（シナリオスキル・サポカ外）を選んだあと、各軸（距離・脚質・バ場・効果タイプ・フェーズ・コース位置・距離の目安）を開いても、選んでいない選択肢に選択済みの印（チェック・色・クラス）が付かず、ほかの軸の印も透けない／375×812・1280×900 × ライト・ダーク', async () => {
		for (const [w, h] of [[375, 812], [1280, 900]]) for (const theme of ['light', 'dark']) {
			const tag = '検索の小窓(1) ' + w + 'px ' + theme + ': ';
			const sp = await openPicker(w, h, theme);
			await showAxis(sp.page, 'scenario');
			for (const v of ['scenario', 'non_support']) await sp.page.click('.usd-tabpanel.is-active [data-usd-el="filter-check"][data-value="' + v + '"]', { force: false });
			await sp.page.waitForTimeout(200);
			const sc = await readMarks(sp.page);
			assert(sc.axis === 'scenario' && sc.activeChecked.length === 2, tag + '前提: 「その他」で2つ選んだ（' + sc.activeChecked.join('・') + '）', sc);
			for (const axis of OTHERS) {
				await showAxis(sp.page, axis);
				const r = await readMarks(sp.page);
				assert(r.axis === axis && r.activeChecked.length === 0 && r.activeMarked.length === 0,
					tag + axis + ' を開くと、選んでいない選択肢に選択済みのチェック・色・クラスが無い', r);
				assert(r.leaked.length === 0, tag + axis + ' を開いても、ほかの軸（その他）の選択済みの印が透けて見えない', r.leaked);
				assert(!r.hx, tag + axis + ' 横スクロールなし', r.hx);
			}
			// 「その他」に戻ると、選んだ2つはそのまま印が付いている（直しで見えなくなっていない）
			await showAxis(sp.page, 'scenario');
			// T27: 選び方は地の色（○の印は出さない）。選んだ2つは、選んでいない選択肢と地・枠・太さが違う
			const back = await sp.page.evaluate(() => {
				const opts = Array.from(document.querySelectorAll('.usd-tabpanel.is-active .usd-opt'));
				const sig = (l) => { const c = getComputedStyle(l); return [c.backgroundColor, c.borderTopColor, c.fontWeight, c.boxShadow].join('|'); };
				const on = opts.filter((l) => l.querySelector('input').checked), off = opts.filter((l) => !l.querySelector('input').checked);
				return { on: on.map(sig), off: off.length ? sig(off[0]) : null };
			});
			assert(back.on.length === 2 && back.on.every((v) => v !== back.off && /700/.test(v)), tag + '「その他」に戻ると、選んだ2つは選んだ形（地・枠・太字）で見える', back);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors);
			await sp.ctx.close();
		}
	});

	await block('検索の小窓(2) 距離のエラーの文（目標のレースの距離）も、ほかの軸を開いたときに透けない（同じ原因の別の場所）／1280・375px', async () => {
		for (const [w, h] of [[1280, 900], [375, 812]]) {
			const tag = '検索の小窓(2) ' + w + 'px: ';
			const sp = await openPicker(w, h, 'light');
			await showAxis(sp.page, 'distance');
			await sp.page.fill('[data-usd-el="target-distance"]', 'abc');
			await sp.page.waitForTimeout(200);
			const read = () => sp.page.evaluate(() => { const e = document.querySelector('[data-usd-el="target-distance-error"]'); const r = e.getBoundingClientRect(); return { shown: e.getAttribute('data-shown'), text: e.textContent, vis: getComputedStyle(e).visibility, h: r.height }; });
			const a = await read();
			assert(a.shown === 'true' && a.vis === 'visible' && a.text.length > 0, tag + '前提: 距離の軸ではエラーの文が見える（' + a.text + '）', a);
			for (const axis of ['style', 'phase', 'scenario']) {
				await showAxis(sp.page, axis);
				const b = await read();
				assert(b.vis !== 'visible' || b.h === 0, tag + axis + ' を開くと、距離のエラーの文は見えない', b);
			}
			await sp.ctx.close();
		}
	});

	await block('検索の小窓(3) 軸の説明文: バ場「選んだ制限を持つスキル、または制限なし（OR）」・効果タイプ／フェーズ／コース位置／距離の目安／その他「選んだもののいずれかに一致（OR）。」・距離／脚質は今のまま／距離の軸に「入れると、その距離のレースで…」が無い', async () => {
		const sp = await openPicker(1280, 900, 'light');
		const r = await sp.page.evaluate(() => {
			const hints = {};
			document.querySelectorAll('.usd-tabpanel').forEach((p) => { hints[p.dataset.usdAxis] = p.querySelector('.usd-axis-hint').textContent; });
			const panelText = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel').textContent;
			return { hints, panelText, hintEl: !!document.querySelector('.usd-target-distance-hint'), oldTag: /この軸のタグが無いスキル/.test(panelText), oldDist: /その距離のレースで発動する|区分は距離から決まる/.test(panelText) };
		});
		const want = { distance: '選んだもののいずれかに一致（OR）', style: '選んだもののいずれかに一致（OR）', surface: '選んだ制限を持つスキル、または制限なし（OR）' };
		['effect', 'phase', 'coursePos', 'distanceMark', 'scenario'].forEach((a) => { want[a] = '選んだもののいずれかに一致（OR）。'; });
		assert(JSON.stringify(Object.keys(r.hints).sort()) === JSON.stringify(Object.keys(want).sort()), '検索の小窓(3) 軸は8つ（前提）', Object.keys(r.hints));
		for (const a of Object.keys(want)) assert(r.hints[a] === want[a], '検索の小窓(3) ' + a + ' の説明文は「' + want[a] + '」', r.hints[a]);
		assert(!r.oldTag && !r.oldDist && !r.hintEl, '検索の小窓(3) 小窓に古い文（「この軸のタグが無いスキル」「その距離のレースで発動する…」）が無い', { oldTag: r.oldTag, oldDist: r.oldDist, hintEl: r.hintEl });
		// 距離の軸の入力欄とエラーの場所は残る
		const td = await sp.page.evaluate(() => ({ input: !!document.querySelector('[data-usd-el="target-distance"]'), label: (document.querySelector('.usd-target-distance-label') || {}).textContent, err: !!document.querySelector('[data-usd-el="target-distance-error"]') }));
		assert(td.input && td.label === '目標のレースの距離' && td.err, '検索の小窓(3) 距離の軸の「目標のレースの距離」の入力欄とエラーの文の場所は残る', td);
		await sp.ctx.close();
	});

	/** 結果の箱・下の固定の行・行の位置と、押せる範囲・文字 */
	const readLayout = (page) => page.evaluate(() => {
		const res = document.querySelector('[data-usd-el="results"]').getBoundingClientRect();
		const foot = document.querySelector('[data-usd-el="picker-footer"]').getBoundingClientRect();
		const lim = Math.min(res.bottom - 1, foot.top, window.innerHeight);
		const rows = Array.from(document.querySelectorAll('[data-usd-el="results"] .usd-row')).map((x) => x.getBoundingClientRect());
		const inView = rows.filter((b) => b.top >= res.top - 0.5 && b.bottom <= lim + 0.5);
		const body = document.querySelector('[data-usd-el="picker-body"]');
		const panel = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel');
		const H = (sel) => { const e = panel.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height) : null; };
		return {
			rows: rows.length, first3: rows.slice(0, 3).map((b) => [Math.round(b.top), Math.round(b.bottom)]), inView: inView.length,
			first3In: rows.length >= 3 && rows.slice(0, 3).every((b) => b.top >= res.top - 0.5 && b.bottom <= lim + 0.5),
			resTop: Math.round(res.top), resBottom: Math.round(res.bottom), footTop: Math.round(foot.top), vh: window.innerHeight,
			footBottom: Math.round(foot.bottom), panelTop: Math.round(panel.getBoundingClientRect().top),
			bodyScroll: body.scrollHeight - body.clientHeight,
			tab: H('.usd-tab'), opt: H('.usd-tabpanel.is-active .usd-opt'), commit: H('[data-usd-el="picker-commit"]'), close: H('[data-usd-act="picker-close"]'),
			minFont: Math.min(...Array.from(panel.querySelectorAll('*')).filter((e) => e.offsetParent && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize))),
			hx: document.documentElement.scrollWidth > window.innerWidth + 1
		};
	});

	await block('検索の小窓(4) スマホ幅: 軸の選択肢を開いても結果の最初の3行が見え、閉じると結果が下の固定の行まで広がる（開いたときより多く見える）・下の固定の行が結果を隠さない・押せる範囲は T27 の値・文字は変わらない／375×812・320×568・393×852・393×700 × ライト（393×700 はダークも）', async () => {
		const SIZES = [[375, 812, 'light'], [320, 568, 'light'], [393, 852, 'light'], [393, 700, 'light'], [393, 700, 'dark']];
		for (const [w, h, theme] of SIZES) {
			const tag = '検索の小窓(4) ' + w + '×' + h + ' ' + theme + ': ';
			const sp = await openPicker(w, h, theme);
			let maxOpen = 0;
			for (const axis of AXES) {
				await showAxis(sp.page, axis, true);
				const r = await readLayout(sp.page);
				maxOpen = Math.max(maxOpen, r.inView);
				assert(r.rows >= 20 && r.first3In && r.inView >= 3, tag + axis + ' を開いた状態: 結果の最初の3行が結果の箱と画面の中にあり、下の固定の行に隠れない（見える ' + r.inView + '行）', r);
				assert(r.resBottom <= r.footTop + 0.5 && r.footBottom <= r.vh + 0.5, tag + axis + ' 下の固定の行は結果の箱の下にあり、画面の中', r);
				assert(r.bodyScroll === 0 && !r.hx, tag + axis + ' 小窓の本文はスクロールせず、横スクロールも無い', r);
				assert(r.tab === 30 && r.opt === 26 && r.commit === 32 && r.close === 28, tag + axis + ' 押せる範囲は T27 の値（タブ30・選択肢26・追加32・×28。段7c の基準 24 以上）', { tab: r.tab, opt: r.opt, commit: r.commit, close: r.close });
				assert(r.minFont >= 11, tag + axis + ' いちばん小さい文字は11px以上（変更前の最小）', r.minFont);
			}
			await showAxis(sp.page, 'distance', false);
			const c = await readLayout(sp.page);
			assert(c.first3In && c.inView > maxOpen - 1 && c.inView >= Math.floor((c.resBottom - c.resTop - 2) / 25), tag + '閉じた状態: 結果の箱が下の固定の行の手前まで広がり、入るだけの行が見える（' + c.inView + '行。開いたときの最大は ' + maxOpen + '行）', c);
			assert(c.footTop - c.resBottom <= 12 && c.resBottom <= c.footTop + 0.5, tag + '閉じた状態: 結果の箱の下端は下の固定の行のすぐ上（空きは12px以内）', c);
			assert(c.panelTop <= 12 && c.bodyScroll === 0, tag + '小窓は画面の上 12px まで使い、本文はスクロールしない', c);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors);
			await sp.ctx.close();
		}
	});

	await block('検索の小窓(5) PC 幅（1280×900）の寸法（T27）: 小窓の上端24・高さ852・選択肢のパネルは軸ごと（距離98〜効果タイプ100・脚質ほか68）・結果の箱は残りを受け取り下端825（畳むと 168＋657）・押せる範囲（タブ35・選択肢26・追加32・×28）', async () => {
		const TP = { distance: 98, style: 68, surface: 68, effect: 100, phase: 68, coursePos: 68, distanceMark: 100, scenario: 68 };
		for (const theme of ['light', 'dark']) {
			const tag = '検索の小窓(5) ' + theme + ': ';
			const sp = await openPicker(1280, 900, theme);
			for (const axis of AXES) {
				await showAxis(sp.page, axis, true);
				const r = await sp.page.evaluate(() => {
					const R = (sel) => { const e = document.querySelector(sel); const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; };
					return { panel: R('.usd-modal:not([hidden]) .usd-modal-panel'), tp: R('.usd-tabpanels')[1], res: R('[data-usd-el="results"]'), tab: R('.usd-tab[aria-selected="true"]')[1], opt: R('.usd-tabpanel.is-active .usd-opt')[1], commit: R('[data-usd-el="picker-commit"]')[1], close: R('[data-usd-act="picker-close"]')[1] };
				});
				assert(r.panel[0] === 24 && r.panel[1] === 852 && r.tp === TP[axis] && r.res[0] === 168 + TP[axis] && r.res[0] + r.res[1] === 825 && r.tab === 35 && r.opt === 26 && r.commit === 32 && r.close === 28,
					tag + axis + ' を開いた状態の寸法（T27 の値）', r);
			}
			await showAxis(sp.page, 'distance', false);
			const c = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="results"]').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; });
			assert(c[0] === 168 && c[1] === 657, tag + '畳んだ状態の結果の箱（168＋657。T27）', c);
			await sp.ctx.close();
		}
	});
}
