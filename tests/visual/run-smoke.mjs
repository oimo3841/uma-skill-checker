// 外観を変えたあと、操作が壊れていないかを確認する機能スモークテスト。
//
//   npm run test:visual
//
// 特に「JSがクラスを付け外しする箇所」「hidden の付け外し」を通す。
// 見た目の統一作業で最も壊れやすいのがここで、目視では気付きにくい。
import { chromium } from 'playwright';
import { startServer } from './lib/serve.mjs';
import { openPage, seedSpecialResults, COMMON_CSS_VERSION, RECORD_ID, PICK } from './lib/fixtures.mjs';

let fails = 0;
function assert(cond, label, extra) {
	if (!cond) fails++;
	console.log((cond ? '[OK] ' : '[NG] ') + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

const { base, close } = await startServer();
const browser = await chromium.launch();

/* ============================================================
 * special.html（UmaStar OCR）
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');

	assert(await page.evaluate(() => loadedCommonCssVersion()) === COMMON_CSS_VERSION,
		'special: common.css の版を読めている', COMMON_CSS_VERSION);
	assert((await page.getAttribute('html', 'class') || '').includes('uma-tw-ready'),
		'special: Tailwind の読み込みを検出できている');

	// スキルリストの解析（hidden の付け外し・件数バッジ）
	await seedSpecialResults(page);
	assert(await page.isVisible('#skill-count-badge'), 'special: スキル件数バッジが出る');
	assert(await page.isVisible('#result-wrap'), 'special: 結果セクションが出る');
	assert((await page.$$('#result-tbody tr')).length === PICK.length, 'special: 表の行数', (await page.$$('#result-tbody tr')).length);

	// 人物列の色がクラスで当たっているか（インラインstyleから移行済みであることの確認）
	const th = await page.evaluate(() => {
		const el = document.querySelector('#result-thead th.person-col');
		return el ? { cls: el.className, bg: getComputedStyle(el).backgroundColor, hasInline: el.getAttribute('style') !== null } : null;
	});
	assert(th && th.cls.includes('person-col-blue') && !th.hasInline && th.bg !== 'rgba(0, 0, 0, 0)',
		'special: 人物列の色がクラスで当たっている', th);

	// 絞り込み（classList.toggle('active') で共通部品の状態を切り替える）
	await page.click('#filter-not-found');
	await page.waitForTimeout(200);
	const pill = await page.evaluate(() => {
		const el = document.getElementById('filter-not-found');
		return { cls: el.className, bg: getComputedStyle(el).backgroundColor };
	});
	assert(pill.cls.includes('uma-pill') && pill.cls.includes('active') && pill.bg === 'rgb(15, 23, 43)',
		'special: 絞り込みの選択状態が反転する', pill);
	await page.click('#filter-all');
	await page.waitForTimeout(200);

	// 検索
	await page.fill('#table-search', '東京');
	await page.waitForTimeout(300);
	const shown = await page.evaluate(() => [...document.querySelectorAll('#result-tbody tr')].filter((r) => r.style.display !== 'none').length);
	assert(shown === 1, 'special: スキル名で絞り込める', shown);
	await page.fill('#table-search', '');

	// 引き出しパネル（open / closing クラス）
	await page.click('.deck-drawer-trigger');
	await page.waitForTimeout(1200);
	assert(await page.isVisible('#deck-drawer'), 'special: 引き出しが開く');
	await page.click('#deck-drawer-close');
	await page.waitForTimeout(900);
	assert(!(await page.isVisible('#deck-drawer')), 'special: 引き出しが閉じる');

	// 使い方ガイド・親Bセット（hidden の付け外し）
	await page.click('button[onclick="toggleHelp()"]');
	await page.waitForTimeout(200);
	assert(await page.isVisible('#help-box'), 'special: 使い方ガイドが開く');
	await page.click('button[onclick="toggleHelp()"]');
	await page.waitForTimeout(200);
	assert(!(await page.isVisible('#help-box')), 'special: 使い方ガイドが閉じる');
	await page.click('#setb-toggle-btn');
	await page.waitForTimeout(300);
	assert(await page.isVisible('#personset-B-wrap'), 'special: 親Bセットが開く');

	// 375px で横スクロールが出ていないこと
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(500);
	const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
	assert(ov.sw === ov.cw, 'special: 375px で横スクロールが出ない', ov);

	assert(errors.length === 0, 'special: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * uma-skill-deck.html（UmaSkill Deck）
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');

	assert(await page.evaluate(() => loadedCommonCssVersion()) === COMMON_CSS_VERSION,
		'deck: common.css の版を読めている', COMMON_CSS_VERSION);
	assert((await page.getAttribute('html', 'class') || '').includes('uma-tw-ready'),
		'deck: Tailwind の読み込みを検出できている');

	// タブ切り替え
	await page.click('#tab-btn-record');
	await page.waitForTimeout(300);
	assert((await page.getAttribute('#tab-btn-record', 'class')).includes('tab-active'), 'deck: タブが選択状態になる');
	assert(await page.isVisible('#tab-panel-record'), 'deck: 比較シートタブが出る');
	assert(!(await page.isVisible('#tab-panel-template')), 'deck: 他タブが隠れる');

	// 比較シート編集
	await page.evaluate((id) => openRecordEditor(id), RECORD_ID);
	await page.waitForTimeout(800);
	assert(await page.isVisible('#record-editor-view'), 'deck: 比較シート編集が開く');
	assert(!(await page.isVisible('#record-list-view')), 'deck: 一覧が隠れる');

	// 行フィルター（.active の付け外し）
	await page.click('button[data-mode="zero"]');
	await page.waitForTimeout(400);
	const bg = await page.evaluate(() => getComputedStyle(document.querySelector('button[data-mode="zero"]')).backgroundColor);
	assert(bg === 'rgb(15, 23, 43)', 'deck: 選択中のピルが反転色になる', bg);
	await page.click('button[data-mode="all"]');
	await page.waitForTimeout(400);

	// ★タイルのタップ巡回（0→1→2→3→0）。中身は数字ではなく★アイコン。
	const TILE = '#star-1-c_a';
	await page.evaluate(() => setStar('1', 'c_a', 0));
	const cycle = [];
	for (let i = 0; i < 4; i++) {
		await page.click(TILE);
		await page.waitForTimeout(120);
		cycle.push(await page.getAttribute(TILE, 'data-value'));
	}
	assert(cycle.join('') === '1230', 'deck: 値タイルのタップで 0→1→2→3→0 と巡回する', cycle);

	// ★の描画。Lv0=☆1個／Lv1=★1個／Lv2=★2個／Lv3=上1・下2のピラミッド。
	const starShapes = [];
	for (const v of [0, 1, 2, 3]) {
		await page.evaluate((n) => setStar('1', 'c_a', n), v);
		await page.waitForTimeout(80);
		starShapes.push(await page.evaluate((sel) => {
			const el = document.querySelector(sel);
			return {
				off: el.querySelectorAll('.star-off').length,
				on: el.querySelectorAll('.star-on').length,
				pyramid: el.querySelectorAll('.star-pyramid .star-top').length,
			};
		}, TILE));
	}
	assert(starShapes[0].off === 1 && starShapes[0].on === 0
		&& starShapes[1].on === 1 && starShapes[2].on === 2
		&& starShapes[3].on === 3 && starShapes[3].pyramid === 1,
		'deck: Lv0〜3の★の個数と配置', starShapes);

	// ★の色。common.css のトークン（amber-500 / slate-300）を参照していること。
	// 生のhexを書き足していないことの機械確認も兼ねる（F-19）。
	await page.evaluate(() => setStar('1', 'c_a', 2));
	await page.waitForTimeout(200);
	const starColor = await page.evaluate((sel) => {
		const on = document.querySelector(sel + ' .star-on');
		return on ? getComputedStyle(on).color : null;
	}, TILE);
	await page.evaluate(() => setStar('1', 'c_a', 0));
	await page.waitForTimeout(200);
	const emptyColor = await page.evaluate((sel) => {
		const off = document.querySelector(sel + ' .star-off');
		return off ? getComputedStyle(off).color : null;
	}, TILE);
	assert(starColor === 'rgb(254, 154, 0)' && emptyColor === 'rgb(202, 213, 226)',
		'deck: ★の色が --uma-star / --uma-star-empty', { starColor, emptyColor });

	// 「計」バッジが値タイルに連動して再計算・再着色されること。0=グレー／1以上=薄い藍。
	// 切り替えは実色のみ（opacity は sticky の重なり順を壊すので使わない）。
	const totalOf = async () => await page.evaluate(() => {
		const el = document.getElementById('sum-1');
		const s = getComputedStyle(el);
		return { text: el.textContent, bg: s.backgroundColor, opacity: s.opacity, on: el.classList.contains('deck-total--on') };
	});
	await page.evaluate(() => { setStar('1', 'c_a', 0); setStar('1', 'c_b', 0); });
	await page.waitForTimeout(400);
	const totalZero = await totalOf();
	await page.evaluate(() => setStar('1', 'c_a', 2));
	await page.waitForTimeout(400);
	const totalOn = await totalOf();
	assert(totalZero.text === '0' && !totalZero.on && totalZero.opacity === '1',
		'deck: 計バッジが0のとき控えめなグレー', totalZero);
	assert(totalOn.text === '2' && totalOn.on && totalOn.bg !== totalZero.bg,
		'deck: 計バッジが値タイルに連動して再計算・再着色される', totalOn);

	// キーボード操作。<button> なので Tab で到達でき、Enter / Space で巡回する。
	const keyboard = await page.evaluate((sel) => {
		const el = document.querySelector(sel);
		setStar('1', 'c_a', 0);
		el.focus();
		return { focused: document.activeElement === el, tabindex: el.getAttribute('tabindex'), tag: el.tagName };
	}, TILE);
	assert(keyboard.focused && keyboard.tag === 'BUTTON',
		'deck: 値タイルは <button> でフォーカスできる', keyboard);
	await page.keyboard.press('Enter');
	await page.waitForTimeout(120);
	const afterEnter = await page.getAttribute(TILE, 'data-value');
	await page.keyboard.press(' ');
	await page.waitForTimeout(120);
	const afterSpace = await page.getAttribute(TILE, 'data-value');
	assert(afterEnter === '1' && afterSpace === '2',
		'deck: Enter / Space でも巡回する', { afterEnter, afterSpace });

	// aria-label が「スキル名／候補名 Lv2」の形で現在値に追従する。
	const label = await page.getAttribute(TILE, 'aria-label');
	assert(/Lv2$/.test(label) && label.includes('／'), 'deck: aria-label が Lv付きで現在値に追従する', label);
	await page.evaluate(() => setStar('1', 'c_a', 1));

	// div/Grid 構造であること（<table> をやめた）。縦の罫線は引かない。
	const structure = await page.evaluate(() => {
		const grid = document.querySelector('.deck-grid');
		const cells = [...document.querySelectorAll('.deck-cell')].slice(0, 2);
		const s = getComputedStyle(grid);
		return {
			tables: document.querySelectorAll('#record-grid-wrap table').length,
			display: s.display,
			cols: s.gridTemplateColumns.split(' ').length,
			borderRight: getComputedStyle(cells[0]).borderRightWidth,
		};
	});
	assert(structure.tables === 0 && structure.display === 'grid' && structure.borderRight === '0px',
		'deck: table をやめ div/Grid になっている（縦罫線なし）', structure);

	// ゼブラ。行ごとに地色が変わる。
	const zebra = await page.evaluate(() => {
		const a = document.querySelector('.deck-info.deck-row-a');
		const b = document.querySelector('.deck-info.deck-row-b');
		return [getComputedStyle(a).backgroundColor, getComputedStyle(b).backgroundColor];
	});
	assert(zebra[0] !== zebra[1], 'deck: 行がゼブラで区切られている', zebra);

	// sticky。ヘッダー行・情報セル・左上の角が固定され、角が最前面にいること。
	const sticky = await page.evaluate(() => {
		const g = (sel) => {
			const s = getComputedStyle(document.querySelector(sel));
			return { pos: s.position, top: s.top, left: s.left, z: s.zIndex, bg: s.backgroundColor };
		};
		return { head: g('.deck-head:not(.deck-corner)'), info: g('.deck-info'), corner: g('.deck-corner') };
	});
	assert(sticky.head.pos === 'sticky' && sticky.head.top === '0px'
		&& sticky.info.pos === 'sticky' && sticky.info.left === '0px'
		&& sticky.corner.top === '0px' && sticky.corner.left === '0px'
		&& Number(sticky.corner.z) > Number(sticky.head.z)
		&& Number(sticky.head.z) > Number(sticky.info.z),
		'deck: ヘッダー・情報セル・角が sticky で、角が最優先', sticky);
	// 固定セルは地色が透明だと下を通過する要素が透けるため、必ず塗られていること。
	assert(sticky.info.bg !== 'rgba(0, 0, 0, 0)' && sticky.head.bg !== 'rgba(0, 0, 0, 0)'
		&& sticky.corner.bg !== 'rgba(0, 0, 0, 0)',
		'deck: 固定セルに地色が塗られている（透けない）', sticky);

	// スキル名のフェード判定は実測。はみ出す名前だけ .is-truncated が付く。
	const fade = await page.evaluate(() => {
		const wraps = [...document.querySelectorAll('.deck-name-wrap')];
		const rows = wraps.map((w) => {
			const clip = w.querySelector('.deck-name-clip');
			return {
				name: clip.textContent,
				truncated: w.classList.contains('is-truncated'),
				overflows: clip.scrollWidth > clip.clientWidth + 1,
				disabled: clip.disabled,
			};
		});
		return {
			mismatched: rows.filter((r) => r.truncated !== r.overflows).length,
			longEnabled: rows.filter((r) => r.truncated && !r.disabled).length,
			shortDisabled: rows.filter((r) => !r.truncated && r.disabled).length,
			someTruncated: rows.some((r) => r.truncated),
			someNot: rows.some((r) => !r.truncated),
			sample: rows.slice(0, 4),
		};
	});
	assert(fade.mismatched === 0 && fade.someTruncated && fade.someNot
		&& fade.shortDisabled > 0 && fade.longEnabled > 0,
		'deck: はみ出す名前だけフェード＋ツールチップが有効', fade);

	// ツールチップ。はみ出す名前をタップすると全文が出て、他をタップすると閉じる。
	// 値タイルの巡回を誤爆させないこと（伝播を止めているか）も確認する。
	const beforeTip = await page.getAttribute(TILE, 'data-value');
	await page.click('.deck-name-wrap.is-truncated .deck-name-clip');
	await page.waitForTimeout(200);
	const tipOpen = await page.evaluate(() => {
		const t = document.getElementById('name-reveal-tip');
		return { hidden: t.classList.contains('hidden'), text: t.textContent };
	});
	assert(!tipOpen.hidden && tipOpen.text.length > 0, 'deck: スキル名のツールチップが開く', tipOpen);
	assert(await page.getAttribute(TILE, 'data-value') === beforeTip,
		'deck: ツールチップのタップが値タイルを誤爆させない');
	await page.click('#record-enabled-count');
	await page.waitForTimeout(200);
	assert(await page.evaluate(() => document.getElementById('name-reveal-tip').classList.contains('hidden')),
		'deck: 他の場所をタップするとツールチップが閉じる');

	// 候補名チップの×で列を削除できること。
	const delCol = await page.evaluate(() => {
		const before = draftRecord.candidates.length;
		document.querySelectorAll('.deck-cand-x')[1].click();
		return { before, after: draftRecord.candidates.length };
	});
	assert(delCol.after === delCol.before - 1, 'deck: 候補名チップの×で列を削除できる', delCol);
	await page.evaluate(() => performUndo());
	await page.waitForTimeout(300);
	assert(await page.evaluate(() => draftRecord.candidates.length) === delCol.before,
		'deck: 列削除がUndoで元に戻る');

	// ★の増減はUndo対象外のまま（うっかり pushUndo を足すと削除のUndoが押し出される）。
	const undoStar = await page.evaluate(() => {
		const before = UmaSkillDeckCore.undoCount();
		cycleStar('1', 'c_a');
		return { before, after: UmaSkillDeckCore.undoCount() };
	});
	assert(undoStar.before === undoStar.after,
		'deck: ★のタップはUndoスタックを増やさない（従来どおり対象外）', undoStar);

	// 候補の無効化（.col-disabled は色だけで表す。opacity を使うと sticky が壊れる）
	await page.click('#record-grid-wrap input[type=checkbox]');
	await page.waitForTimeout(400);
	const dis = await page.evaluate(() => {
		const cell = document.querySelector('.deck-cell.col-disabled');
		const tile = document.querySelector('.col-disabled .star-tile');
		return {
			count: document.querySelectorAll('.col-disabled').length,
			cellColor: cell ? getComputedStyle(cell).color : null,
			cellOpacity: cell ? getComputedStyle(cell).opacity : null,
			tileOpacity: tile ? getComputedStyle(tile).opacity : null,
		};
	});
	assert(dis.count > 0 && dis.cellOpacity === '1' && dis.tileOpacity === '1'
		&& dis.cellColor === 'rgb(144, 161, 185)',
		'deck: 無効列は実色だけで薄くなる（opacity不使用）', dis);

	// スキル選択モーダル
	await page.click('button[onclick="openRecordSkillPicker()"]');
	await page.waitForTimeout(900);
	assert(await page.isVisible('.usd-modal'), 'deck: スキル選択モーダルが開く');
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);
	assert(!(await page.isVisible('.usd-modal')), 'deck: モーダルが閉じる');

	// データ管理
	await page.click('#tab-btn-data');
	await page.waitForTimeout(300);
	await page.click('button[onclick="exportData()"]');
	await page.waitForTimeout(300);
	const exported = await page.inputValue('#export-textarea');
	assert(exported.includes('templates'), 'deck: エクスポートが動く');

	// 375px
	await page.setViewportSize({ width: 375, height: 812 });
	await page.click('#tab-btn-record');
	await page.waitForTimeout(300);
	await page.evaluate((id) => openRecordEditor(id), RECORD_ID);
	await page.waitForTimeout(600);
	const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
	assert(ov.sw === ov.cw, 'deck: 375px で横スクロールが出ない', ov);

	assert(errors.length === 0, 'deck: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * 失敗時の案内（版ずれ・CDN遮断）が実際に出るか
 * ============================================================ */
{
	// 1) common.css の版がずれている場合
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	const warns = [];
	page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
	const css = await (await fetch(base + '/css/common.css')).text();
	await page.route('**/css/common.css*', (r) => r.fulfill({
		contentType: 'text/css; charset=utf-8',
		body: css.replace(/--common-css-version:\s*"[^"]+"/, '--common-css-version: "0000-00-00z"'),
	}));
	await page.goto(base + '/special.html', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1800);
	assert(warns.some((w) => w.includes('common.css が古い版です')), '版ずれを検出して警告が出る');
	await ctx.close();
}
{
	// 2) Tailwind を読み込めない場合
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	const warns = [];
	page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
	await page.route('**/tailwindcss-browser/**', (r) => r.abort());
	await page.goto(base + '/special.html', { waitUntil: 'domcontentloaded' });
	await page.waitForTimeout(6000);
	assert(warns.some((w) => w.includes('外部ファイルを読み込めませんでした')), 'CDN遮断を検出して案内が出る');
	const hiddenWorks = await page.evaluate(() => {
		const el = document.getElementById('help-box');
		return el ? getComputedStyle(el).display === 'none' : null;
	});
	assert(hiddenWorks === true, 'CDN遮断時も hidden の保険が効いている', hiddenWorks);
	await ctx.close();
}

await browser.close();
await close();
console.log('\n' + (fails === 0 ? '=== スモークテスト: 全項目OK ===' : '=== スモークテスト: ' + fails + '件 NG ==='));
process.exit(fails === 0 ? 0 : 1);
