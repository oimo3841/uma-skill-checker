// ソートの文言と × の色の直し（T58・2026-11-01。おいもさんの決定 C-262 の追記・C-258 の T57 への回答 4）の検査。
// run-smoke.mjs の末尾から register88() で呼ばれる（塊の見出しはすべて「T58ソートと×」で始まる。`npm run test:visual -- --only=T58ソートと×` で回せる）。
//
// 決め:
//  (1) ①と②の星取表の種類の並べ替えの小窓: 見出し「ソート」・選択肢「回復スキルでソート」「◎と○を切り替えられるスキルでソート」「緑スキルでソート」
//      「デバフスキルでソート」「ソートしない」。入口の title「ソート」・読み上げ名「ソート（今: …）」・小窓の一覧の読み上げ名「ソート」。
//  (2) 画像アップロードの画面のサムネイルの右上の × ボタン（UmaStar・UmaExam）: 地と記号の色のコントラスト 3:1 以上（ライト・ダーク）。
//      大きさ 20×20・サムネイルの外側の右上から 5px（枠 1px＋top-1 right-1 の 4px）は変えない（変更前 4268833 の実測。375・1280px・ライト・ダークで同じ）。
//      地は --uma-control（ページの値）・記号は --uma-control-text（新しい色は足さない）。
//  (3) UmaExam の結合画像の設定の小窓の文「ここで変えた表示は、…」が無い（入れ物の <p> ごと）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register88(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const R = '#deck-roster-panel ';
	// blocks-83 と同じ代表1（①＝uma-0179＋6枚、②＝24種）。スキル名は検査の側に書かない（恒久ルール1。id だけ）
	const CARD_IDS = ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'];
	const REP1 = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417', '125', '124', '6', '27', '33', '230', '16', '23', '147', '117', '118', '145'];
	const R1S = { umaId: 'uma-0179', cardIds: CARD_IDS, outsideOptions: { cards: ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'] } };
	const LABELS = '回復スキルでソート|◎と○を切り替えられるスキルでソート|緑スキルでソート|デバフスキルでソート|ソートしない';
	const NOTE = 'ここで変えた表示は、次の結合から反映されます。';
	const closeNotices = async (page) => {
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
	};

	/** special.html を①の下書き・②の下書きを入れて開く（blocks-83 と同じ作り）。tab: '0'＝①・'1'＝② */
	const openDeck = async (w, tab) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: 900 }, EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		await sp.page.evaluate(({ roster, ids, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', tab);
		}, { roster: R1S, ids: REP1, tab });
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const setView = async (page, want) => {
		for (let i = 0; i < 3 && (await page.getAttribute(T + '[data-usd-el="factor-view"]', 'data-usd-view')) !== want; i++) { await page.click(T + '[data-usd-el="factor-view"]'); await page.waitForTimeout(300); }
	};
	const entryOf = (page, scope) => page.evaluate((sc) => {
		const e = document.querySelector(sc + '[data-usd-el="tone-sort-entry"]');
		return e ? { title: e.getAttribute('title'), label: e.getAttribute('aria-label') } : null;
	}, scope);
	const popOf = (page) => page.evaluate(() => {
		const p = document.querySelector('[data-usd-el="info-pop"]');
		if (!p || p.hidden) return null;
		const t = p.querySelector('.uma-popover-title');
		const list = p.querySelector('[data-usd-el="tone-sort-list"]');
		return { title: t ? t.textContent.trim() : '', listLabel: list ? list.getAttribute('aria-label') : null,
			labels: Array.from(p.querySelectorAll('[data-usd-el="tone-sort-pick"]')).map((i) => i.closest('label').textContent.trim()).join('|'),
			old: /並べ替え|上に寄せる/.test(p.textContent) };
	});
	const closePop = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };

	for (const [where, scope, tab] of [['①', R, '0'], ['②の星取表', T, '1']]) {
		await block('T58ソートと×(1) ' + where + 'のソートの小窓の文言: 見出し「ソート」・5つの選択肢・入口の title と読み上げ名', async () => {
			const sp = await openDeck(375, tab);
			if (tab === '1') await setView(sp.page, 'table');
			const e0 = await entryOf(sp.page, scope);
			assert(!!e0 && e0.title === 'ソート' && e0.label === 'ソート（今: ソートしない）', 'T58(1) ' + where + ': 入口の title は「ソート」・読み上げ名は「ソート（今: ソートしない）」', e0);
			await sp.page.click(scope + '[data-usd-el="tone-sort-entry"]');
			await sp.page.waitForTimeout(200);
			const p = await popOf(sp.page);
			assert(!!p && p.title === 'ソート' && p.listLabel === 'ソート', 'T58(1) ' + where + ': 小窓の見出しと一覧の読み上げ名は「ソート」', p);
			assert(!!p && p.labels === LABELS, 'T58(1) ' + where + ': 選択肢は「（種類）でソート」×4 と「ソートしない」', p && p.labels);
			assert(!!p && !p.old, 'T58(1) ' + where + ': 小窓に「並べ替え」「上に寄せる」が無い', p);
			await sp.page.click('[data-usd-el="info-pop"] [data-usd-el="tone-sort-pick"][data-tone="heal"]');
			await sp.page.waitForTimeout(250);
			const e1 = await entryOf(sp.page, scope);
			assert(!!e1 && e1.title === 'ソート' && e1.label === 'ソート（今: 回復スキルでソート）', 'T58(1) ' + where + ': 回復を選ぶと読み上げ名は「ソート（今: 回復スキルでソート）」', e1);
			await closePop(sp.page);
			assert(jsErrors(sp.errors).length === 0, 'T58(1) ' + where + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	/** 画像アップロードの画面を開き、親A（0番）に画像を2枚入れる。画像は左半分が白・右半分が黒（× の下に明るい所も暗い所もある） */
	const openUpload = async (file, w, theme) => {
		const pg = await openPage(browser, base, file, { width: w, height: w < 641 ? 812 : 800 }, file === 'special.html' ? EMPTY : undefined);
		await closeNotices(pg.page);
		await pg.page.evaluate((t) => { window.UmaTheme.set(t); }, theme);
		await pg.page.evaluate(() => selectStepTab(2));
		await pg.page.waitForTimeout(200);
		await pg.page.evaluate(async () => {
			const mk = async (name) => {
				const c = document.createElement('canvas');
				c.width = 240; c.height = 120;
				const x = c.getContext('2d');
				x.fillStyle = '#ffffff'; x.fillRect(0, 0, 120, 120);
				x.fillStyle = '#000000'; x.fillRect(120, 0, 120, 120);
				const b = await new Promise((r) => c.toBlob(r, 'image/png'));
				return new File([b], name, { type: 'image/png' });
			};
			addPersonFiles(0, [await mk('a.png'), await mk('b.png')]);
		});
		await pg.page.waitForTimeout(400);
		return pg;
	};
	/** × ボタンの地・記号の色（地は白・黒の両方の上に重ねた値）と、サムネイルの中の大きさ・位置 */
	const readRemove = (page) => page.evaluate(() => {
		const cv = document.createElement('canvas');
		cv.width = cv.height = 1;
		const cx = cv.getContext('2d', { willReadFrequently: true });
		const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
		const over = (t, b) => [0, 1, 2].map((i) => t[i] * t[3] + b[i] * (1 - t[3]));
		const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
		const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
		const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
		const btns = Array.from(document.querySelectorAll('.person-image-list[data-person="0"] button'));
		return btns.map((b) => {
			const svg = b.querySelector('svg');
			const cs = getComputedStyle(b);
			const bg = rgba(cs.backgroundColor);
			const fg = rgba(svg ? getComputedStyle(svg).stroke : cs.color);
			const mark = over(fg, over(bg, [255, 255, 255]));
			const onW = over(bg, [255, 255, 255]), onB = over(bg, [0, 0, 0]);
			const r = b.getBoundingClientRect(), p = b.parentElement.getBoundingClientRect();
			return { bg: cs.backgroundColor, fg: svg ? getComputedStyle(svg).stroke : cs.color, alpha: bg[3],
				ratio: Math.min(ratio(over(fg, onW), onW), ratio(over(fg, onB), onB)), w: r.width, h: r.height, top: r.top - p.top, right: p.right - r.right, mark };
		});
	});

	for (const [file, tool] of [['special.html', 'UmaStar'], ['exam.html', 'UmaExam']]) {
		for (const w of [375, 1280]) {
			await block('T58ソートと×(2) ' + tool + '・' + w + 'px: サムネイルの × の地と記号の差（3:1 以上）がライト・ダークとも・大きさ 20×20 と位置（外側の右上から 5px）は不変', async () => {
				for (const theme of ['light', 'dark']) {
					const pg = await openUpload(file, w, theme);
					const t = await pg.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
					const bs = await readRemove(pg.page);
					assert(t === theme && bs.length === 2, 'T58(2) ' + tool + ' ' + w + 'px ' + theme + ': 前提（テーマ・× が2つ）', { t, n: bs.length });
					assert(bs.every((b) => b.ratio >= 3), 'T58(2) ' + tool + ' ' + w + 'px ' + theme + ': × の地と記号のコントラスト 3:1 以上（地は白・黒の上に重ねた両方で）', bs.map((b) => ({ bg: b.bg, fg: b.fg, ratio: +b.ratio.toFixed(2) })));
					assert(bs.every((b) => b.w === 20 && b.h === 20 && Math.abs(b.top - 5) < 0.6 && Math.abs(b.right - 5) < 0.6), 'T58(2) ' + tool + ' ' + w + 'px ' + theme + ': × は 20×20・外側の右上から 5px（変更前と同じ）', bs.map((b) => ({ w: b.w, h: b.h, top: b.top, right: b.right })));
					assert(jsErrors(pg.errors).length === 0, 'T58(2) ' + tool + ' ' + w + 'px ' + theme + ': コンソールのエラー0', jsErrors(pg.errors).slice(0, 3));
					await pg.ctx.close();
				}
			});
		}
	}

	await block('T58ソートと×(3) UmaExam の結合画像の設定の小窓の文「ここで変えた表示は、…」が無い（入れ物ごと）', async () => {
		const ex = await openPage(browser, base, 'exam.html', { width: 375, height: 812 });
		await closeNotices(ex.page);
		const e = await ex.page.evaluate(() => {
			const body = document.querySelector('#stitch-settings-pop .uma-popover-body');
			return { html: document.documentElement.outerHTML, kids: body ? Array.from(body.children).map((c) => c.id || c.tagName) : null,
				notes: document.querySelectorAll('.stitch-show-note').length };
		});
		assert(!e.html.includes(NOTE) && !e.html.includes('「結合画像の表示」の画面で「画像を更新」を押してください'), 'T58(3) UmaExam: 消した文がページに無い', null);
		assert(e.notes === 0 && JSON.stringify(e.kids) === JSON.stringify(['stitch-show-panel-fab']), 'T58(3) UmaExam: 小窓の本文は設定の欄だけ（文の <p> は無い）', { kids: e.kids, notes: e.notes });
		assert(jsErrors(ex.errors).length === 0, 'T58(3) UmaExam: コンソールのエラー0', ex.errors);
		await ex.ctx.close();
	});
}
