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

	// ★のタップ巡回（0→1→2→3→0）。値バッジは <button> で、セル幅いっぱい。
	const BADGE = '#star-1-c_a';
	await page.evaluate(() => setStar('1', 'c_a', 0));
	const cycle = [];
	for (let i = 0; i < 4; i++) {
		await page.click(BADGE);
		await page.waitForTimeout(120);
		cycle.push(await page.textContent(BADGE));
	}
	assert(cycle.join('') === '1230', 'deck: 値バッジのタップで 0→1→2→3→0 と巡回する', cycle);

	// 値バッジの配色。0は薄いグレー、1以上は濃紺の塗り＋白文字。
	// （opacity ではなく実色で差を付けていることも同時に確認する）
	// 注意: バッジは background-color に transition を掛けている。値を変えた直後に
	// getComputedStyle すると遷移前の色が返るので、設定と読み取りは分けて待つ。
	// カーソルもバッジ上に残っていると hover 色を測ってしまうので先に外す。
	const badgeColorAt = async (v) => {
		await page.mouse.move(0, 0);
		await page.evaluate((n) => setStar('1', 'c_a', n), v);
		await page.waitForTimeout(400);
		return await page.evaluate((sel) => {
			const s = getComputedStyle(document.querySelector(sel));
			return { bg: s.backgroundColor, color: s.color, opacity: s.opacity, cls: document.querySelector(sel).className };
		}, BADGE);
	};
	const badgeOff = await badgeColorAt(0);
	const badgeOn = await badgeColorAt(2);
	assert(badgeOff.bg === 'rgb(227, 232, 239)' && badgeOff.opacity === '1',
		'deck: 値0のバッジは薄いグレー（opacityではなく実色）', badgeOff);
	assert(badgeOn.bg === 'rgb(49, 44, 133)' && badgeOn.color === 'rgb(255, 255, 255)',
		'deck: 値1以上のバッジは濃紺の塗り＋白文字', badgeOn);

	// hover色も0/1以上で別。同じ詳細度の2本を記述順に頼って並べると
	// 「0のhover色」が「1以上」に勝つ事故が起きるため、退行を機械で見張る。
	await page.hover(BADGE);
	await page.waitForTimeout(400);
	const onHover = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).backgroundColor, BADGE);
	assert(onHover === 'rgb(67, 45, 215)', 'deck: 値1以上のバッジのhoverが0側の色に負けない', onHover);
	await page.mouse.move(0, 0);
	await page.evaluate(() => setStar('1', 'c_a', 0));

	// キーボード操作。<button> なので Tab で到達でき、Enter / Space で巡回する。
	const keyboard = await page.evaluate((sel) => {
		const el = document.querySelector(sel);
		setStar('1', 'c_a', 0);
		el.focus();
		return { focused: document.activeElement === el, tabindex: el.getAttribute('tabindex'), tag: el.tagName };
	}, BADGE);
	assert(keyboard.focused && keyboard.tag === 'BUTTON',
		'deck: 値バッジは <button> でフォーカスできる', keyboard);
	await page.keyboard.press('Enter');
	await page.waitForTimeout(120);
	const afterEnter = await page.textContent(BADGE);
	await page.keyboard.press(' ');
	await page.waitForTimeout(120);
	const afterSpace = await page.textContent(BADGE);
	assert(afterEnter === '1' && afterSpace === '2',
		'deck: Enter / Space でも巡回する', { afterEnter, afterSpace });

	// スクリーンリーダー向けラベルが現在値に追従する。
	const label = await page.evaluate((sel) => {
		const el = document.querySelector(sel);
		setStar('1', 'c_a', 3);
		return el.getAttribute('aria-label');
	}, BADGE);
	assert(/★3$/.test(label) && label.includes('／'), 'deck: aria-label が現在値に追従する', label);
	await page.evaluate(() => setStar('1', 'c_a', 1));

	// 罫線を廃止し、ゼブラ（交互の背景色）で行を区切っている。
	const zebra = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('.deck-table tbody tr')].slice(0, 2);
		const cell = (tr) => getComputedStyle(tr.querySelector('td:not(.col-disabled)'));
		return {
			bg: rows.map((tr) => cell(tr).backgroundColor),
			borderBottom: cell(rows[0]).borderBottomWidth,
			borderRight: cell(rows[0]).borderRightWidth,
		};
	});
	assert(zebra.bg[0] !== zebra.bg[1] && zebra.borderBottom === '0px' && zebra.borderRight === '0px',
		'deck: 罫線が無く、行がゼブラで区切られている', zebra);

	// 候補の無効化（.col-disabled は色だけで表す。opacity を使うと sticky が壊れる）
	await page.click('#record-grid-wrap input[type=checkbox]');
	await page.waitForTimeout(400);
	const dis = await page.evaluate(() => {
		const cell = document.querySelector('.col-disabled');
		const badge = document.querySelector('.col-disabled .star-badge');
		return {
			count: document.querySelectorAll('.col-disabled').length,
			cellColor: cell ? getComputedStyle(cell).color : null,
			cellOpacity: cell ? getComputedStyle(cell).opacity : null,
			badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
			badgeOpacity: badge ? getComputedStyle(badge).opacity : null,
		};
	});
	assert(dis.count > 0 && dis.cellOpacity === '1' && dis.badgeOpacity === '1'
		&& dis.badgeBg !== 'rgb(49, 44, 133)',
		'deck: 無効列は値バッジまで含めて彩度が落ちる（opacity不使用）', dis);

	// Undo。新UIでも巻き戻しが効くことを確認する。
	// 注: ★の増減は以前から Undo 対象外（js/uma-skill-deck.js の setStar のコメント参照）。
	//     タップ巡回に変えても粒度は「1操作＝1回の値変更・Undoには積まない」で変わらない。
	const undoFlow = await page.evaluate(async () => {
		const before = draftRecord.candidates.length;
		const undoBefore = UmaSkillDeckCore.undoCount();
		removeCandidate('c_b');
		const afterDelete = draftRecord.candidates.length;
		const undoAfterDelete = UmaSkillDeckCore.undoCount();
		// ★を1回巡回させても Undo スタックは増えない（＝取り消し対象外のまま）
		cycleStar('1', 'c_a');
		const undoAfterStar = UmaSkillDeckCore.undoCount();
		performUndo();
		return {
			before, afterDelete, undoBefore, undoAfterDelete, undoAfterStar,
			afterUndo: draftRecord.candidates.length,
			labels: draftRecord.candidates.map((c) => c.label),
			undoAfterUndo: UmaSkillDeckCore.undoCount(),
		};
	});
	assert(undoFlow.afterDelete === undoFlow.before - 1 && undoFlow.afterUndo === undoFlow.before
		&& undoFlow.labels.includes('親B') && undoFlow.undoAfterUndo === undoFlow.undoBefore,
		'deck: 新UIでも候補削除→Undoで元に戻る', undoFlow);
	assert(undoFlow.undoAfterStar === undoFlow.undoAfterDelete,
		'deck: ★のタップはUndoスタックを増やさない（従来どおり対象外）', undoFlow);
	await page.waitForTimeout(300);

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
