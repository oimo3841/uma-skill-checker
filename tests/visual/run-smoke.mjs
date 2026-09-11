// 外観を変えたあと、操作が壊れていないかを確認する機能スモークテスト。
//
//   npm run test:visual
//
// 特に「JSがクラスを付け外しする箇所」「hidden の付け外し」を通す。
// 見た目の統一作業で最も壊れやすいのがここで、目視では気付きにくい。
import { chromium } from 'playwright';
import { startServer } from './lib/serve.mjs';
import { openPage, seedSpecialResults, COMMON_CSS_VERSION, RECORD_ID, PICK, EDITED_CELLS, USER_DATA } from './lib/fixtures.mjs';

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
	// 結果は引き出しの中にあるので、見えているかではなく「結果があるか」を見る。
	// #result-wrap の hidden が「結果があるか」の印、引き出しの開閉はそれとは別。
	assert(!(await page.evaluate(() => document.getElementById('result-wrap').classList.contains('hidden'))),
		'special: 照合結果が「あり」になる');
	assert(await page.evaluate(() => document.getElementById('result-empty').hidden),
		'special: 結果があるので「まだありません」の案内は消える');
	assert((await page.$$('#result-tbody tr')).length === PICK.length, 'special: 表の行数', (await page.$$('#result-tbody tr')).length);

	// 照合結果が出た直後。まだ引き出しを開いていないので未読、
	// Deck側にも渡し終わっているので「未取り込み」のバッジが立っている。
	assert(await page.isVisible('#fab-dot-result'), 'special: 照合結果に新着バッジが出る');
	assert(!(await page.isVisible('#fab-dot-stitch')), 'special: 画像結合には新着バッジが出ない');
	assert(await page.isVisible('#fab-dot-deck'), 'special: Deckに未取り込みバッジが出る');
	assert(await page.evaluate(() => !document.getElementById('deck-handoff-note').classList.contains('hidden')),
		'special: 結果画面にDeckへの受け渡しの案内が出る');
	assert((await page.textContent('#deck-handoff-title')).includes('取り込めます'),
		'special: 案内が「未取り込み」の文面になる');

	// 以降の絞り込み・検索は引き出しの中の要素を触るので、先に開けておく。
	await page.evaluate(() => openDrawer('result'));
	await page.waitForTimeout(500);
	assert(await page.isVisible('#result-drawer'), 'special: 照合結果の引き出しが開く');
	assert(await page.isVisible('#result-tbody'), 'special: 引き出しの中に結果表が見えている');

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
	await page.evaluate(() => closeDrawer());
	await page.waitForTimeout(600);
	assert(!(await page.isVisible('#result-drawer')), 'special: 照合結果の引き出しが閉じる');

	// 右下の固定ナビ（FAB）。畳んだ状態ではサブボタンが押せないことまで見る。
	assert(await page.isVisible('#fab-toggle'), 'special: 右下ナビのメインボタンが出る');
	assert(await page.evaluate(() => getComputedStyle(document.getElementById('deck-drawer-trigger')).pointerEvents) === 'none',
		'special: 畳んだ状態ではサブボタンが押せない');
	// 一度開いたので照合結果の未読は下りている。Deckはまだ見に行っていないので残る。
	assert(!(await page.isVisible('#fab-dot-result')), 'special: 一度開くと未読バッジが下りる');
	assert(await page.isVisible('#fab-dot-deck'), 'special: Deckを見に行くまではバッジが残る');

	await page.click('#fab-toggle');
	await page.waitForTimeout(400);
	assert(await page.evaluate(() => document.getElementById('fab-nav').classList.contains('open')),
		'special: 右下ナビが開く');

	// Deckの引き出し（iframe）— FAB経由で開く
	await page.click('#deck-drawer-trigger');
	await page.waitForTimeout(1200);
	assert(await page.isVisible('#deck-drawer'), 'special: Deckの引き出しが開く');
	assert(!(await page.evaluate(() => document.getElementById('fab-nav').classList.contains('open'))),
		'special: 遷移すると右下ナビが畳まれる');
	assert(await page.evaluate(() => document.body.style.overflow) === 'hidden',
		'special: 引き出しを開くと本文のスクロールが止まる');
	assert(!(await page.isVisible('#fab-nav')), 'special: 引き出しを開くとFABは隠れる');
	// Deckを開いた時点でバッジは下りる（Deck側のバナーで何を押したかに依存させない）
	assert(await page.evaluate(() => !fabUnseen.deck), 'special: Deckを開くとバッジが下りる');

	// OCR結果のDeckへの受け渡し。special側の保存パネルは廃止し、
	// Deck側の「読み込む」に一本化した（12セッション目）。バナーが出ることを確かめる。
	const deckFrame = page.frameLocator('#deck-drawer-frame');
	await deckFrame.locator('#ocr-handoff-banner').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
	assert(await deckFrame.locator('#ocr-handoff-banner').isVisible(),
		'special: Deck側にOCR結果の取り込みバナーが出る');
	await deckFrame.locator('[data-ocr-act="import"]').click();
	await page.waitForTimeout(700);
	assert(await deckFrame.locator('[data-ocr-el="record-select"]').isVisible(),
		'special: 取り込みダイアログ（保存先の選択）が開く');

	// 実際に取り込むと、Deck側が imported を立てる。それが storage イベントで
	// 親（この画面）に届き、結果画面の案内が「取り込み済み」に変わるところまで見る。
	await deckFrame.locator('[data-ocr-act="apply"]').click();
	await page.waitForTimeout(1200);
	assert((await page.textContent('#deck-handoff-title')).includes('取り込み済み'),
		'special: 案内が「取り込み済み」に変わる');
	assert(await page.evaluate(() => !fabUnseen.deck), 'special: 取り込み済みならバッジは出ない');

	// 判定をやり直すと handoffId が変わるので、Deckのバッジがまた点く
	await page.evaluate(() => renderResults());
	await page.waitForTimeout(400);
	assert(await page.evaluate(() => fabUnseen.deck), 'special: 判定し直すとDeckのバッジがまた点く');
	assert((await page.textContent('#deck-handoff-title')).includes('取り込めます'),
		'special: 案内も「未取り込み」に戻る');

	// 別の引き出しへ乗り換えても、同時に2枚開かない
	await page.evaluate(() => openDrawer('stitch'));
	await page.waitForTimeout(700);
	assert(await page.isVisible('#stitch-drawer'), 'special: 画像結合レビューの引き出しが開く');
	assert(!(await page.evaluate(() => document.getElementById('deck-drawer').classList.contains('open'))),
		'special: 乗り換えると前の引き出しが畳まれる');
	// 結合結果はまだ無いので、行き止まりにせず案内を出す
	assert(await page.isVisible('#stitch-empty'), 'special: 結果が無いときは案内が出る');
	assert(!(await page.isVisible('#stitch-result-content')), 'special: 結果が無いので中身は出ない');

	// 結合結果ができたときの切り替わり（runImageStitching と同じ経路を直接呼ぶ）
	await page.evaluate(() => {
		document.getElementById('stitch-result-content').innerHTML = '<p id="stitch-dummy">結合結果</p>';
		setSectionReady('stitch', true);
		markFabUnseen('stitch');
	});
	await page.waitForTimeout(300);
	assert(!(await page.isVisible('#stitch-empty')), 'special: 結果ができると案内が消える');
	assert(await page.isVisible('#stitch-dummy'), 'special: 結果ができると中身が出る');
	// 元に戻して、案内側の導線を確かめる
	await page.evaluate(() => {
		document.getElementById('stitch-result-content').innerHTML = '';
		setSectionReady('stitch', false);
	});
	await page.waitForTimeout(300);

	// 「入力画面に戻る」で引き出しが閉じる
	await page.click('#stitch-empty button');
	await page.waitForTimeout(700);
	assert(!(await page.isVisible('#stitch-drawer')), 'special: 案内から入力画面に戻れる');
	assert(await page.evaluate(() => document.body.style.overflow) === '',
		'special: 引き出しを閉じると本文のスクロールが戻る');

	// 見に行くと未読バッジが消える（上で markFabUnseen('stitch') を立ててある）
	assert(await page.isVisible('#fab-dot-stitch'), 'special: 画像結合に新着バッジが立っている');
	await page.click('#fab-toggle');
	await page.waitForTimeout(300);
	await page.click('#fab-item-stitch');
	await page.waitForTimeout(600);
	assert(!(await page.isVisible('#fab-dot-stitch')), 'special: 見に行くと新着バッジが消える');
	// Esc は開いているものを1つ閉じる
	await page.keyboard.press('Escape');
	await page.waitForTimeout(600);
	assert(!(await page.isVisible('#stitch-drawer')), 'special: Escで引き出しが閉じる');

	// 本文の下端余白がFAB展開時の高さを吸収できているか（余白はインラインstyleで指定）
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForTimeout(400);
	await page.click('#fab-toggle');
	await page.waitForTimeout(400);
	const bottomFit = await page.evaluate(() => {
		const nav = document.getElementById('fab-nav').getBoundingClientRect();
		const cards = [...document.querySelectorAll('.glass-card')];
		return {
			navTop: Math.round(nav.top),
			lastBottom: Math.round(cards[cards.length - 1].getBoundingClientRect().bottom),
		};
	});
	assert(bottomFit.lastBottom <= bottomFit.navTop, 'special: 最下部で本文がFABに被らない', bottomFit);
	await page.click('#fab-toggle');
	await page.waitForTimeout(300);
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(300);

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
	// 末尾には「（手動修正済み）」が付くことがあるので、Lv の直後までを見る。
	assert(/Lv2(（手動修正済み）)?$/.test(label) && label.includes('／'),
		'deck: aria-label が Lv付きで現在値に追従する', label);
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

	// ---- 手動修正の可視化 ----
	// 判定は「OCRの原本値(ocrCells)と現在値(cells)が食い違うか」だけ。
	// フィクスチャは候補 c_a だけをOCRに通した想定で、そのうち2セルを食い違わせてある。
	// ここまでのテストで値を動かしているので、フィクスチャの状態に戻してから見る。
	await page.evaluate((r) => {
		draftRecord.cells = JSON.parse(JSON.stringify(r.cells));
		draftRecord.ocrCells = JSON.parse(JSON.stringify(r.ocrCells));
		renderRecordGrid();
	}, { cells: USER_DATA.records[0].cells, ocrCells: USER_DATA.records[0].ocrCells });
	await page.waitForTimeout(300);
	const editedState = await page.evaluate((expected) => {
		const marked = [...document.querySelectorAll('.star-tile.is-edited')].map((t) => t.id);
		return {
			marked,
			expected: expected.map((e) => `star-${e.skillId}-${e.candidateId}`),
			// OCRを通していない列（c_b / c_c）には1つも付かないこと
			onUnscanned: marked.filter((id) => id.endsWith('-c_b') || id.endsWith('-c_c')).length,
		};
	}, EDITED_CELLS);
	assert(editedState.marked.slice().sort().join() === editedState.expected.slice().sort().join()
		&& editedState.onUnscanned === 0,
		'deck: 原本値と食い違うセルだけに赤枠が付く', editedState);

	// 値0でも、原本値と違えば枠が付く（依頼の要件）。
	const zeroEdited = await page.evaluate((e) => {
		const t = document.getElementById(`star-${e.skillId}-${e.candidateId}`);
		return { value: t.dataset.value, edited: t.classList.contains('is-edited'), label: t.getAttribute('aria-label') };
	}, EDITED_CELLS[1]);
	assert(zeroEdited.value === '0' && zeroEdited.edited && /手動修正済み/.test(zeroEdited.label),
		'deck: 値0でも原本値と違えば枠が付き、読み上げにも出る', zeroEdited);

	// 枠は色相だけに頼らず「形の違い」で分かること。inset の box-shadow で描き、
	// border ではないこと（borderだとタイルの内寸が変わり★の位置がずれる）。
	const ring = await page.evaluate((e) => {
		const t = document.getElementById(`star-${e.skillId}-${e.candidateId}`);
		const s = getComputedStyle(t);
		return { shadow: s.boxShadow, borderWidth: s.borderTopWidth, w: t.offsetWidth, h: t.offsetHeight };
	}, EDITED_CELLS[0]);
	const plainSize = await page.evaluate(() => {
		const t = document.querySelector('.star-tile:not(.is-edited)');
		return { w: t.offsetWidth, h: t.offsetHeight };
	});
	assert(ring.shadow.includes('inset') && ring.borderWidth === '0px'
		&& ring.w === plainSize.w && ring.h === plainSize.h,
		'deck: 赤枠はinsetの影で描かれ、タイルの寸法を変えない', { ring, plainSize });

	// 元のOCR値に戻すと枠が消え、もう一度動かすと復活する。
	const roundTrip = await page.evaluate((e) => {
		const id = `star-${e.skillId}-${e.candidateId}`;
		const orig = draftRecord.ocrCells[e.skillId][e.candidateId];
		setStar(e.skillId, e.candidateId, orig);
		const backToOrig = document.getElementById(id).classList.contains('is-edited');
		setStar(e.skillId, e.candidateId, (orig + 1) % 4);
		const movedAgain = document.getElementById(id).classList.contains('is-edited');
		return { orig, backToOrig, movedAgain };
	}, EDITED_CELLS[0]);
	assert(roundTrip.backToOrig === false && roundTrip.movedAgain === true,
		'deck: 元のOCR値に戻すと枠が消え、動かすと復活する', roundTrip);

	// ★書き込み（OCR取り込み）が原本値も一緒に記録すること。
	// 手入力（setStar）は原本値に触らない＝ズレが検出できる、という前提の確認でもある。
	const ocrWrite = await page.evaluate((recordId) => {
		const rec = UmaSkillDeckCore.getUserData().records.find((r) => r.recordId === recordId);
		const sid = rec.skillIds[0];
		// 既に値の入っている候補への上書きは確認ダイアログが出る。
		// Playwright は既定でダイアログを打ち消す（=キャンセル扱い）ので、ここだけ通す。
		const realConfirm = window.confirm;
		window.confirm = () => true;
		UmaSkillDeckCore.applyStarAssignments(recordId, [{ candidateId: 'c_b', stars: { [sid]: 3 } }]);
		window.confirm = realConfirm;
		const afterOcr = {
			cur: rec.cells[sid].c_b, orig: rec.ocrCells[sid].c_b,
			edited: UmaSkillDeckCore.isEditedCell(rec, sid, 'c_b'),
			// OCR結果に含まれなかったスキルも0で原本値が入る（列まるごと置き換えのため）
			otherOrig: rec.ocrCells[rec.skillIds[1]].c_b,
		};
		// 手で動かすと原本値はそのまま、現在値だけ変わる
		rec.cells[sid].c_b = 1;
		return { afterOcr, afterManual: { cur: rec.cells[sid].c_b, orig: rec.ocrCells[sid].c_b, edited: UmaSkillDeckCore.isEditedCell(rec, sid, 'c_b') } };
	}, RECORD_ID);
	assert(ocrWrite.afterOcr.cur === 3 && ocrWrite.afterOcr.orig === 3 && ocrWrite.afterOcr.edited === false
		&& ocrWrite.afterOcr.otherOrig === 0,
		'deck: OCR取り込みが原本値も記録し、直後は枠が付かない', ocrWrite.afterOcr);
	assert(ocrWrite.afterManual.orig === 3 && ocrWrite.afterManual.cur === 1 && ocrWrite.afterManual.edited === true,
		'deck: 手入力は原本値に触らないのでズレが検出できる', ocrWrite.afterManual);

	// 原本値を持たない古いデータ（ocrCells なし）でも枠が付かず、落ちないこと。
	const legacy = await page.evaluate(() => {
		const rec = { cells: { s1: { c1: 2 } } };  // ocrCells が無い＝schemaVersion 1 相当
		return {
			noOcr: UmaSkillDeckCore.isEditedCell(rec, 's1', 'c1'),
			unknownCell: UmaSkillDeckCore.isEditedCell({ cells: {}, ocrCells: { s1: {} } }, 's1', 'c1'),
		};
	});
	assert(legacy.noOcr === false && legacy.unknownCell === false,
		'deck: 原本値が無い既存データでも枠が付かない（移行処理が要らない）', legacy);

	// Undo。列を消して戻したとき、現在値だけでなく原本値も一緒に戻ること。
	// 片方だけ戻すと「手動修正済み」の判定だけが壊れる。
	await page.evaluate(() => { UmaSkillDeckCore.clearUndo(); openRecordEditor(draftRecord.recordId); });
	await page.waitForTimeout(300);
	const undoOcr = await page.evaluate((e) => {
		// 復元は元のキー順を保たない（消して足し直すため）ので、順序を正規化して比べる。
		const norm = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, Object.keys(o[k]).sort().map((c) => [c, o[k][c]])]));
		const before = norm(draftRecord.ocrCells);
		removeCandidate(e.candidateId);
		const afterDelete = norm(draftRecord.ocrCells);
		performUndo();
		return { restored: norm(draftRecord.ocrCells) === before, changed: afterDelete !== before };
	}, EDITED_CELLS[0]);
	assert(undoOcr.changed && undoOcr.restored,
		'deck: 列削除→Undoで原本値も一緒に戻る', undoOcr);
	await page.waitForTimeout(300);

	// 候補を全員消して0人にしても表示が崩れないこと。
	// repeat() は0を受け付けないので、候補0人のときは列定義を差し替えている。
	// 列の数と、行ごとに出すセルの数が食い違うと、セルが隣の列へずれて重なる。
	const noCand = await page.evaluate(() => {
		draftRecord.candidates.slice().forEach((c) => removeCandidate(c.candidateId));
		const grid = document.querySelector('.deck-grid');
		const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
		// 1行ぶんのセル数（情報セル ＋ 余り列）
		const perRow = [...grid.children].filter((el) => el.classList.contains('deck-info')
			|| (!el.classList.contains('deck-head') && !el.querySelector('.star-tile'))).length
			/ Math.max(1, document.querySelectorAll('.deck-info').length);
		const infos = [...document.querySelectorAll('.deck-info')];
		return {
			candidates: draftRecord.candidates.length,
			cols,
			perRow,
			noCandClass: grid.classList.contains('deck-grid--no-cand'),
			// 情報セルが全部そろって左端に並んでいること（ずれると x がばらつく）
			distinctLeft: new Set(infos.map((el) => Math.round(el.getBoundingClientRect().left))).size,
			rows: infos.length,
			// 行が重なっていないこと（隣り合う行の上端が単調増加）
			overlapped: infos.slice(1).filter((el, i) =>
				el.getBoundingClientRect().top <= infos[i].getBoundingClientRect().top).length,
		};
	});
	assert(noCand.candidates === 0 && noCand.noCandClass && noCand.cols === 2
		&& noCand.perRow === 2 && noCand.distinctLeft === 1 && noCand.overlapped === 0,
		'deck: 候補0人でも列がずれず、行が重ならない', noCand);

	// 候補を戻すと元の列数に復帰すること。
	await page.evaluate(() => {
		document.getElementById('candidate-label-input').value = '親A';
		addCandidate();
	});
	await page.waitForTimeout(300);
	const backAgain = await page.evaluate(() => {
		const grid = document.querySelector('.deck-grid');
		return {
			cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
			noCandClass: grid.classList.contains('deck-grid--no-cand'),
			tiles: document.querySelectorAll('.star-tile').length,
			rows: document.querySelectorAll('.deck-info').length,
		};
	});
	assert(!backAgain.noCandClass && backAgain.cols === 3 && backAgain.tiles === backAgain.rows,
		'deck: 候補を追加し直すと列が戻る', backAgain);

	// グリッドについての案内は、スクロールボックスの外・上に出ること。
	// 中に置くとスキルが多いときに下へ流れて画面外になり、読まれない。
	const noteWhenEmpty = await page.evaluate(() => {
		draftRecord.candidates.slice().forEach((c) => removeCandidate(c.candidateId));
		const note = document.getElementById('record-grid-note');
		const box = document.getElementById('record-grid-wrap');
		return {
			text: note.textContent,
			visible: !note.classList.contains('hidden') && note.offsetParent !== null,
			insideBox: box.contains(note),
			// 枠より上にあること
			aboveBox: note.getBoundingClientRect().bottom <= box.getBoundingClientRect().top + 1,
			// 枠の中に案内文が残っていないこと
			strayInBox: box.querySelectorAll('p').length,
		};
	});
	assert(noteWhenEmpty.visible && /候補を1人以上/.test(noteWhenEmpty.text)
		&& !noteWhenEmpty.insideBox && noteWhenEmpty.aboveBox && noteWhenEmpty.strayInBox === 0,
		'deck: 候補0人の案内が枠の外・上に出る', noteWhenEmpty);

	// 絞り込みで0件になったときも同じ場所に出て、解除で消えること。
	await page.evaluate(() => {
		document.getElementById('candidate-label-input').value = '親A';
		addCandidate();
	});
	await page.waitForTimeout(300);
	await page.click('button[data-mode="nonzero"]');
	await page.waitForTimeout(400);
	const noteWhenFiltered = await page.evaluate(() => {
		const note = document.getElementById('record-grid-note');
		return { text: note.textContent, visible: !note.classList.contains('hidden') };
	});
	await page.click('button[data-mode="all"]');
	await page.waitForTimeout(400);
	const noteCleared = await page.evaluate(() => {
		const note = document.getElementById('record-grid-note');
		return { text: note.textContent, hidden: note.classList.contains('hidden') };
	});
	assert(noteWhenFiltered.visible && /一致する行がありません/.test(noteWhenFiltered.text)
		&& noteCleared.hidden && noteCleared.text === '',
		'deck: 絞り込み0件の案内が出て、解除すると消える', { noteWhenFiltered, noteCleared });

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
