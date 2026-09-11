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

	// 既定は新UIで、初回は切り替えの告知モーダルが出る。ここから先は旧UI側の
	// 入力欄（#skill-list）を使うので、モーダルを閉じてから旧UIへ移る。
	// 告知そのものの出方は、この後ろの専用ブロックでまとめて見ている。
	await page.waitForTimeout(2500);
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	await page.click('#deck-mode-btn');
	await page.waitForTimeout(600);

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

	// ここから先は Deck への受け渡しを見る。Deck の入口は新UIにしか出さないので、
	// 新UIへ切り替えてから進む（切り替えの表示そのものは、後半でまとめて確かめる）。
	// リストの入力欄は旧UIにしか無いため、seedSpecialResults は旧UIのうちに済ませてある。
	await page.click('#deck-mode-btn');
	await page.waitForTimeout(1800);

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

	/* --- 「高度な解析オプション」で出るもの（切り出しプレビュー・開発ログ）の置き場 ---
	   結果の引き出しの下から②タブの処理ボタンの下へ移した。オプションとの連動は今までどおり。 */
	const devPlaceS = await page.evaluate(() => {
		document.getElementById('opt-devlog').checked = true;
		renderDevLog();
		return {
			inPanel2: document.getElementById('step-panel-2').contains(document.getElementById('dev-wrap')),
			previewInPanel2: document.getElementById('step-panel-2').contains(document.getElementById('preview-wrap')),
			devShown: !document.getElementById('dev-wrap').classList.contains('hidden')
		};
	});
	assert(devPlaceS.inPanel2 && devPlaceS.previewInPanel2, 'special: プレビューと開発ログは②タブの処理ボタンの下にある', devPlaceS);
	assert(devPlaceS.devShown, 'special: オプションを入れると開発ログが出る', devPlaceS);
	assert(await page.evaluate(() => {
		document.getElementById('opt-devlog').checked = false;
		renderDevLog();
		return document.getElementById('dev-wrap').classList.contains('hidden');
	}), 'special: オプションを切ると開発ログが隠れる');
	// 右下の固定ナビ（FAB）。畳んだ状態ではサブボタンが押せないことまで見る。
	assert(await page.isVisible('#fab-toggle'), 'special: 右下ナビのメインボタンが出る');
	assert(await page.evaluate(() => getComputedStyle(document.getElementById('deck-drawer-trigger')).pointerEvents) === 'none',
		'special: 畳んだ状態ではサブボタンが押せない');
	// 畳んだナビの外枠（透明な箱）が、その下にある要素のクリックを吸わないこと。
	// 以前はテンプレート行の編集／複製／削除が、スクロール位置によって押せなくなっていた。
	const fabBlocks = await page.evaluate(() => {
		const nav = document.getElementById('fab-nav');
		const r = nav.getBoundingClientRect();
		// ナビの箱の中で、メインボタンの外（畳んだサブボタンの位置）を突く
		const hit = document.elementFromPoint(r.left + 4, r.top + 4);
		return { navPointer: getComputedStyle(nav).pointerEvents, hitIsNav: hit === nav };
	});
	assert(fabBlocks.navPointer === 'none' && !fabBlocks.hitIsNav,
		'special: 畳んだナビの外枠が下の要素のクリックを吸わない', fabBlocks);
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

	// 判定をやり直すと handoffId が変わるので、Deckのバッジがまた点く。
	// 新UIへ切り替えた時点で照合対象は空に戻っている（対象スキルセットを選び直す画面なので）。
	// 実際の新UIではテンプレートを選んだ時点で入るものなので、ここでも入れ直してから判定し直す。
	await page.evaluate((names) => { skillList = names; }, PICK.map((s) => s.name));
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

	/* --- 新UIの対象スキルセット一覧：ドラフトの行と、編集画面の「すべて外す」 --- */
	const draftRow = await page.evaluate(() => {
		const card = document.querySelector('#deck-template-panel [data-usd-act="draft-open"]').closest('label');
		return {
			title: card.querySelector('p').textContent,
			sub: card.querySelectorAll('p')[1].textContent,
			hasTrash: !!card.querySelector('[data-usd-act="draft-clear"]'),
			icons: card.querySelectorAll('button').length
		};
	});
	assert(draftRow.title.startsWith('ドラフト') && /\d+種/.test(draftRow.title),
		'special: ドラフトの行に名前と件数が出る', draftRow.title);
	assert(draftRow.sub.startsWith('※次回開いた際も復元されます'),
		'special: ドラフトの行に復元の案内が出る', draftRow.sub);
	assert(draftRow.hasTrash === false && draftRow.icons === 1,
		'special: ドラフトの行にごみ箱ボタンは無く、編集だけが残る', draftRow);

	await page.click('#deck-template-panel [data-usd-act="draft-open"]');
	await page.waitForTimeout(400);
	const clearBtn = await page.evaluate(() => {
		const btn = document.querySelector('#deck-template-panel [data-usd-el="clear-skills"]');
		const n = Number(document.querySelector('#deck-template-panel [data-usd-el="selected-count"]').textContent);
		return { exists: !!btn, disabled: btn ? btn.disabled : null, count: n };
	});
	assert(clearBtn.exists, 'special: 編集画面に「すべて外す」がある', clearBtn);
	assert(clearBtn.disabled === (clearBtn.count === 0),
		'special: 「すべて外す」は選択が無いときだけ押せない', clearBtn);
	// 編集画面の見出しも一覧の行と同じ呼び方にしてある（名前の食い違いを作らない）
	assert(await page.evaluate(() =>
		document.querySelector('#deck-template-panel [data-usd-el="draft-title"]').textContent) === 'ドラフト',
		'special: ドラフトの編集画面の見出しも「ドラフト」');
	await page.click('#deck-template-panel [data-usd-act="editor-close"]');
	await page.waitForTimeout(400);

	/* 選んだときに出る名前（getSelection().name）も一覧の行と揃っていること。
	   ドラフトは空だと選べないので、「テキストで検索」で実際に1件入れてから確かめる
	   （ついでに、編集画面からの貼り付け→追加の一連が通ることも見ている）。 */
	await page.click('#deck-template-panel [data-usd-act="draft-open"]');
	await page.waitForTimeout(400);
	await page.click('#deck-template-panel [data-usd-act="editor-pick-text"]');
	await page.waitForTimeout(700);
	await page.fill('[data-usd-el="paste-input"]', '右回り○');
	await page.click('[data-usd-act="paste-run"]');
	await page.waitForTimeout(500);
	await page.click('[data-usd-act="picker-add"]');
	await page.waitForTimeout(500);
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);
	assert(await page.evaluate(() =>
		document.querySelector('#deck-template-panel [data-usd-el="selected-count"]').textContent) === '1',
		'special: 貼り付けたスキルがドラフトに入る');
	await page.click('#deck-template-panel [data-usd-act="editor-close"]');
	await page.waitForTimeout(400);

	const draftPicked = await page.evaluate(() => {
		const radio = document.querySelector('#deck-template-panel [data-usd-el="template-radio"][value="__draft__"]');
		radio.click();
		return {
			note: document.getElementById('deck-selected-note').textContent,
			row: document.querySelector('#deck-template-panel [data-usd-act="draft-open"]').closest('label').querySelector('p').textContent
		};
	});
	await page.waitForTimeout(300);
	assert(draftPicked.note === '✓ 「ドラフト」の1種を照合します',
		'special: 選択中の案内にも一覧と同じ「ドラフト」が出る', draftPicked);
	assert(draftPicked.row.startsWith('ドラフト'), 'special: 一覧の行の呼び方と一致している', draftPicked);

	// Deck まわりはここまで。以降は旧UI（既定の姿）に戻して確かめる。
	await page.click('#deck-mode-btn');
	await page.waitForTimeout(800);

	// 使い方ガイド（手前に重ねるオーバーレイ）。閉じる手段が4つあることまで見る。
	await page.click('button[onclick="toggleHelp()"]');
	await page.waitForTimeout(200);
	assert(await page.isVisible('#help-box'), 'special: 使い方ガイドが開く');
	const helpOpened = await page.evaluate(() => ({
		dialog: document.getElementById('help-box').getAttribute('role'),
		backdrop: !document.getElementById('help-backdrop').hidden,
		scrollLocked: document.body.style.overflow === 'hidden',
		focusOnClose: document.activeElement === document.getElementById('help-close'),
		// 旧UIなので①の説明は旧UI向けだけが出ている
		oldText: [...document.querySelectorAll('[data-help-mode="old"]')].every((el) => !el.hidden),
		newText: [...document.querySelectorAll('[data-help-mode="new"]')].every((el) => el.hidden)
	}));
	assert(helpOpened.dialog === 'dialog' && helpOpened.backdrop && helpOpened.scrollLocked,
		'special: ガイドは背景を暗くして手前に重なり、本文のスクロールが止まる', helpOpened);
	assert(helpOpened.focusOnClose, 'special: 開いた時点で✕にフォーカスが移る', helpOpened);
	assert(helpOpened.oldText && helpOpened.newText, 'special: ガイドの①の説明が旧UI向けだけ出る', helpOpened);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);
	assert(!(await page.isVisible('#help-box')), 'special: Escでガイドが閉じる');
	assert(await page.evaluate(() => document.body.style.overflow === ''), 'special: 閉じると本文のスクロールが戻る');
	await page.click('button[onclick="toggleHelp()"]');
	await page.waitForTimeout(200);
	await page.click('#help-close');
	await page.waitForTimeout(200);
	assert(!(await page.isVisible('#help-box')), 'special: ✕でガイドが閉じる');
	await page.click('button[onclick="toggleHelp()"]');
	await page.waitForTimeout(200);
	await page.mouse.click(8, 8); // 背景（左上の隅）
	await page.waitForTimeout(200);
	assert(!(await page.isVisible('#help-box')), 'special: 背景タップでガイドが閉じる');
	/* --- ステップ1・2のタブ（1枚のカードに重ねて切り替える） --- */
	const stepState = () => page.evaluate(() => ({
		tab1: document.getElementById('step-tab-1').getAttribute('aria-selected'),
		tab2: document.getElementById('step-tab-2').getAttribute('aria-selected'),
		panel1: !document.getElementById('step-panel-1').hidden,
		panel2: !document.getElementById('step-panel-2').hidden,
		title: document.getElementById('step1-title').textContent
	}));
	const step0 = await stepState();
	assert(step0.tab1 === 'true' && step0.panel1 && !step0.panel2,
		'special: 初期表示は①のパネルだけが出ている', step0);
	assert(step0.title === 'スキルリストを入力', 'special: ①の見出しが短縮されている', step0.title);

	await page.click('#step-tab-2');
	await page.waitForTimeout(300);
	const step2 = await stepState();
	assert(step2.tab2 === 'true' && !step2.panel1 && step2.panel2,
		'special: ②のタブを押すとパネルが入れ替わる', step2);
	// ←キーでも戻れる（WAI-ARIA のタブの作法）
	await page.keyboard.press('ArrowLeft');
	await page.waitForTimeout(300);
	assert((await stepState()).panel1, 'special: ←キーで①へ戻る');
	await page.click('#step-tab-2');
	await page.waitForTimeout(300);

	await page.click('#setb-toggle-btn');
	await page.waitForTimeout(300);
	assert(await page.isVisible('#personset-B-wrap'), 'special: 親Bセットが開く');
	// 隠れている側の状況が分かるよう、②のタブにアップロード枚数を出す
	const imgBadge = await page.evaluate(() => {
		const el = document.getElementById('image-count-badge');
		return { hidden: el.hidden, text: el.textContent };
	});
	assert(imgBadge.hidden === true, 'special: 画像が無いうちは②の枚数バッジを出さない', imgBadge);

	/* --- 新UI／旧UIの切り替え表示 --- */
	const uiState = () => page.evaluate(() => ({
		label: document.getElementById('deck-mode-btn-label').textContent,
		badge: !document.getElementById('ui-mode-badge').hidden,
		title: document.getElementById('step1-title').textContent
	}));
	const oldUi = await uiState();
	assert(oldUi.label === '新UIへ' && oldUi.badge === false,
		'special: 既定は旧UIで、ボタンは「新UIへ」・バッジは出さない', oldUi);

	// 旧UIはいずれ廃止するので、そちらにDeckの入口は残さない。
	// FABの項目と、結果引き出しの取り込み案内の2か所だけが入口。
	const deckEntry = () => page.evaluate(() => ({
		fab: !document.getElementById('deck-drawer-trigger').hidden,
		note: !document.getElementById('deck-handoff-note').classList.contains('hidden')
	}));
	assert((await deckEntry()).fab === false, 'special: 旧UIではFABにDeckの項目を出さない');
	// hidden 属性が効いていること自体も見る（display:flex に負けないか。F-13）
	assert(!(await page.isVisible('#deck-drawer-trigger')), 'special: 旧UIのDeck項目は実際に描画されない');

	await page.click('#deck-mode-btn');
	await page.waitForTimeout(1500);
	assert((await deckEntry()).fab === true, 'special: 新UIではFABにDeckの項目が出る');
	const newUi = await uiState();
	assert(newUi.label === '旧UIへ' && newUi.badge === true,
		'special: 新UIに入るとボタンが「旧UIへ」になり「新UI」バッジが出る', newUi);
	assert(newUi.title === '対象スキル', 'special: 新UIの①の見出しが短縮されている', newUi.title);
	assert((await stepState()).panel1, 'special: 新UIへ切り替えると①が開いた状態になる');
	await page.click('#deck-mode-btn');
	await page.waitForTimeout(600);
	const backUi = await uiState();
	assert(backUi.label === '新UIへ' && backUi.badge === false && backUi.title === 'スキルリストを入力',
		'special: 旧UIへ戻ると表示も元に戻る', backUi);
	const backEntry = await deckEntry();
	assert(backEntry.fab === false && backEntry.note === false,
		'special: 旧UIへ戻すとDeckの入口（FAB・取り込み案内）も引っ込む', backEntry);

	// 375px で横スクロールが出ていないこと
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(500);
	const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
	assert(ov.sw === ov.cw, 'special: 375px で横スクロールが出ない', ov);

	assert(errors.length === 0, 'special: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * special.html — 既定は新UI／切り替えの告知モーダル
 *
 * 「どちらのUIで開くか」と「モーダルを既読にしたか」が localStorage に残るので、
 * まっさらな文脈を使って通しで見る。閉じ方が4通りあり、どれで閉じても既読に
 * なることが仕様の肝なので、そこは文脈を分けて1通りずつ確かめる。
 * ============================================================ */
{
	// 画面の状態をまとめて読む。どのUIで開いたかは①の見出しで判る。
	const uiState = (page) => page.evaluate(() => ({
		notice: !document.getElementById('ui-notice').hidden,
		backdrop: !document.getElementById('ui-notice-backdrop').hidden,
		badge: !document.getElementById('ui-mode-badge').hidden,
		title: document.getElementById('step1-title').textContent,
		label: document.getElementById('deck-mode-btn-label').textContent,
		scrollLocked: document.body.style.overflow === 'hidden',
		seen: localStorage.getItem('uma-special-ui-notice'),
		mode: localStorage.getItem('uma-special-ui-mode')
	}));

	// 1. 初回訪問：新UIで開き、モーダルが出る
	{
		const { ctx, page, errors } = await openPage(browser, base, 'special.html');
		await page.waitForTimeout(2500);
		const first = await uiState(page);
		assert(first.title === '対象スキル' && first.badge && first.label === '旧UIへ',
			'special: 初回は新UIで開く', first);
		assert(first.notice && first.backdrop && first.scrollLocked,
			'special: 初回は切り替えの告知モーダルが出て、本文のスクロールが止まる', first);
		assert(await page.evaluate(() => ({
			role: document.getElementById('ui-notice').getAttribute('role'),
			modal: document.getElementById('ui-notice').getAttribute('aria-modal'),
			labelled: document.getElementById('ui-notice').getAttribute('aria-labelledby')
		})).then((a) => a.role === 'dialog' && a.modal === 'true' && a.labelledby !== ''),
			'special: モーダルがダイアログとして印付けされている');
		assert(await page.evaluate(() => document.activeElement === document.getElementById('ui-notice-ok')),
			'special: 開いた時点でOKにフォーカスが移る');
		assert(first.seen === null, 'special: 開いただけではまだ既読にしない', first.seen);

		// 「OK」で閉じる → 既読になる
		await page.click('[data-act="notice-ok"]');
		await page.waitForTimeout(300);
		const closed = await uiState(page);
		assert(!closed.notice && !closed.backdrop && !closed.scrollLocked,
			'special: OKでモーダルが閉じ、スクロールが戻る', closed);
		assert(closed.seen === '2026-09-new-ui-default', 'special: 閉じると既読の印が残る', closed.seen);

		// 3. 再読み込み → 新UIのまま・モーダルは出ない
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2500);
		const again = await uiState(page);
		assert(again.title === '対象スキル' && !again.notice,
			'special: 既読なら新UIのままで、モーダルは繰り返さない', again);

		// 6. 右上のバッジから読み直せる（既読のまま）
		await page.click('#ui-mode-badge');
		await page.waitForTimeout(300);
		const reopened = await uiState(page);
		assert(reopened.notice && reopened.seen === '2026-09-new-ui-default',
			'special: 右上のバッジから読み直せて、既読のまま変わらない', reopened);
		await page.click('[data-act="notice-ok"]');
		await page.waitForTimeout(300);

		// 4. 旧UIへ切り替え → 再読み込み → 旧UIで開く・告知は出ない
		await page.click('#deck-mode-btn');
		await page.waitForTimeout(600);
		assert((await uiState(page)).mode === 'old', 'special: 選んだUIが保存される');
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);
		const old = await uiState(page);
		assert(old.title === 'スキルリストを入力' && old.label === '新UIへ' && !old.badge,
			'special: 既読なら最後に選んだ旧UIで開く', old);
		assert(!old.notice, 'special: 旧UIで開いてもモーダルは出ない', old);
		// 5節で撤去した旧告知が復活していないこと
		assert(await page.evaluate(() => !document.getElementById('deck-mode-new-badge')
			&& !document.getElementById('new-ui-coach') && !document.getElementById('new-ui-welcome')),
			'special: 旧UIの告知一式（NEWバッジ・吹き出し・ようこそ枠）は残っていない');

		assert(errors.length === 0, 'special: 告知まわりでコンソールエラーが出ない', errors.slice(0, 3));
		await ctx.close();
	}

	// 5. 「旧UI」の保存値だけを持つ人（既読の印なし）は、一度だけ新UIへ寄せる
	{
		const { ctx, page } = await openPage(browser, base, 'special.html');
		await page.evaluate(() => localStorage.setItem('uma-special-ui-mode', 'old'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2500);
		const s = await uiState(page);
		assert(s.title === '対象スキル' && s.notice,
			'special: 既読の印が無ければ、保存が「旧UI」でも新UIで開いてモーダルを出す', s);
		await ctx.close();
	}

	// 2. 閉じ方は4通り。どれで閉じても既読になる（✕・背景・Esc。OKは上で確認済み）
	for (const [how, act] of [['✕', async (page) => page.click('[data-act="notice-close"]')],
		['背景', async (page) => page.click('#ui-notice-backdrop', { position: { x: 5, y: 5 } })],
		['Esc', async (page) => page.keyboard.press('Escape')]]) {
		const { ctx, page } = await openPage(browser, base, 'special.html');
		await page.waitForTimeout(2500);
		assert(await page.isVisible('#ui-notice'), 'special: ' + how + 'で閉じる前にモーダルが出ている');
		await act(page);
		await page.waitForTimeout(300);
		const s = await uiState(page);
		assert(!s.notice && s.seen === '2026-09-new-ui-default',
			'special: ' + how + 'で閉じても既読になる', s);
		await ctx.close();
	}
}

/* ============================================================
 * exam.html（UmaExam OCR）— 最小ブロック
 *
 * 第2段階（exam×Deck）の着手にあたり、それまで exam を見る項目が 0 件だった
 * ところに受け皿を作った。読み込める・コンソールエラー0・375px で横スクロール無し、
 * に加えて「組み込み133種が登録されて見えている」ことだけを見る。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');

	assert((await page.title()).includes('UmaExam OCR'), 'exam: HTTP で読み込める', await page.title());
	// 既定は新UIで、初回は切り替えの告知モーダルが出る。このブロックは新UI（タブ・引き出し）を
	// 前提に進むので、モーダルを閉じてから「新UIにいる」ことを明示しておく（F-29③。告知そのものの
	// 出方は、この後ろの専用ブロックでまとめて見ている）。
	await page.waitForTimeout(800);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.waitForTimeout(300);
	assert(await page.evaluate(() => newUi === true && !document.getElementById('new-step-card').hidden
		&& document.getElementById('old-step1-card').hidden && !document.getElementById('fab-nav').hidden),
		'exam: 新UI（タブ・引き出し・FAB）で開いている');

	const registry = await page.evaluate(() => ({
		rows: document.querySelectorAll('#skill-registry-list > div').length,
		badge: document.getElementById('step1-skill-badge').textContent,
		sp70: document.getElementById('badge-sp70-count').textContent,
		green: document.getElementById('badge-green59-count').textContent,
		total: document.getElementById('header-skill-count').textContent
	}));
	assert(registry.rows === 133 && registry.total === '133' && registry.badge === '133種',
		'exam: 組み込みの133種が登録されている（①のタブのバッジは「133種」）', registry);
	assert(registry.sp70 === 'sp70緑：17種' && registry.green === '緑59種（実質53種）',
		'exam: sp70緑17・緑59（実質53）のバッジが出る', registry);
	assert(await page.evaluate(() => loadedCssVersion('--common-css-version')) === COMMON_CSS_VERSION
		&& await page.evaluate(() => loadedCssVersion('--uma-shell-css-version')) === COMMON_CSS_VERSION,
		'exam: tokens.css と shell.css の版を読めている', COMMON_CSS_VERSION);
	// 共通部品（common.css）は読まない。読むと .glass-card の余白など既存の見た目が変わる
	assert(await page.evaluate(() => loadedCssVersion('--uma-components-css-version')) === '',
		'exam: common.css は読んでいない');

	/* --- ステップ1・2のタブ（special と同じ骨格。①は登録済みなので既定で①を開く） --- */
	const stepState = () => page.evaluate(() => ({
		tab1: document.getElementById('step-tab-1').getAttribute('aria-selected'),
		tab2: document.getElementById('step-tab-2').getAttribute('aria-selected'),
		panel1: !document.getElementById('step-panel-1').hidden,
		panel2: !document.getElementById('step-panel-2').hidden,
		imageBadge: document.getElementById('image-count-badge').hidden,
		underline: getComputedStyle(document.getElementById('step-tab-1')).borderBottomColor
	}));
	const step0 = await stepState();
	assert(step0.tab1 === 'true' && step0.panel1 && !step0.panel2, 'exam: 初期表示は①のパネルだけが出ている', step0);
	assert(step0.imageBadge === true, 'exam: 画像が無いうちは②の枚数バッジを出さない', step0);
	// タブの下線はこのページの藍（v3 の #4f46e5 = rgb(79, 70, 229)）。special の緑や v4 の藍ではない
	assert(step0.underline === 'rgb(79, 70, 229)', 'exam: 選択中のタブの下線が exam の藍', step0.underline);
	await page.click('#step-tab-2');
	await page.waitForTimeout(300);
	const step2 = await stepState();
	assert(step2.tab2 === 'true' && !step2.panel1 && step2.panel2, 'exam: ②のタブを押すとパネルが入れ替わる', step2);
	assert(await page.isVisible('#process-btn') && await page.isVisible('#setb-toggle-btn'),
		'exam: ②に実行ボタンと「親Bセットも追加する」がある');
	await page.keyboard.press('ArrowLeft');
	await page.waitForTimeout(300);
	assert((await stepState()).panel1, 'exam: ←キーで①へ戻る');
	// 除外・追加があるとバッジに「（調整あり）」が付き、無くなれば戻る
	await page.evaluate(() => { customAddedSkills.push('テスト追加'); refreshAfterCustomSkillsChange(); });
	assert(await page.textContent('#step1-skill-badge') === '134種（調整あり）', 'exam: 追加があると①のバッジに（調整あり）が付く');
	await page.evaluate(() => { customAddedSkills = []; refreshAfterCustomSkillsChange(); });
	assert(await page.textContent('#step1-skill-badge') === '133種', 'exam: 調整を戻すとバッジも「133種」に戻る');

	/* --- UmaSkill Deck への受け渡し（手順3）---
	   OCRを回さずに、合成した行を本物の照合関数に通して結果を作る（special と同じ考え方）。
	   親Aは133種すべて検出（うち1件は★不明）、親Bは先頭20件だけ検出。 */
	const seedExam = (extraNames) => page.evaluate((extra) => {
		const mk = (names, offset) => matchAllSkillsWithStars(
			names.map((n, i) => ({ text: n, stars: ((i + offset) % 3) + 1, starsReliable: i !== 4, rowKey: 'r' + i })),
			skillList, skillIndex, {});
		personResults = PERSON_LABELS.map(() => null);
		personResults[0] = mk(skillList.concat(extra || []), 0);
		// 5件目（阪神レース場〇）は「検出したが★を確定できなかった」（starsFor が null を返す経路）
		personResults[0].skillStars[skillList[4]] = null;
		personResults[3] = mk(skillList.slice(0, 20), 1);
		renderResults();
		writeOcrHandoff();
	}, extraNames || []);
	await seedExam();
	await page.waitForTimeout(400);
	const KEY_EXAM = 'umaSkillDeck:ocrHandoff:exam';
	const readExam = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY_EXAM);
	const noteState = () => page.evaluate(() => ({
		visible: !document.getElementById('deck-handoff-note').classList.contains('hidden'),
		title: document.getElementById('deck-handoff-title').textContent,
		detail: document.getElementById('deck-handoff-detail').textContent,
		dot: !document.getElementById('deck-handoff-dot').hidden,
		btn: document.getElementById('deck-handoff-btn-label').textContent
	}));
	let p = await readExam();
	assert(p && p.source === 'exam' && p.scope.kind === 'manual' && p.scope.name === '技能試験' && p.skillNames.length === 133,
		'exam: 判定が終わると :exam キーへ payload が書かれる（source=exam・scope=manual「技能試験」・133件）',
		p && { source: p.source, scope: p.scope, n: p.skillNames.length });
	assert(p && p.persons.length === 2 && p.persons[0].label === '親A' && p.persons[1].label === '親B'
		&& Object.keys(p.persons[0].stars).length === 132 && p.persons[0].unknownStars.length === 1
		&& Object.keys(p.persons[1].stars).length === 20,
		'exam: persons は special と同じ形（親A 132件＋★不明1件・親B 20件）', p && p.persons.map((x) => [x.label, Object.keys(x.stars).length, x.unknownStars.length]));
	let n = await noteState();
	assert(n.visible && n.title.includes('取り込めます') && n.detail.startsWith('親A・親B の2人分・スキル133件を渡しました（対象：技能試験）') && n.dot,
		'exam: 結果カードの先頭に「取り込めます」の案内と新着の印が出る', n);
	assert(await page.evaluate(() => {
		const wrap = document.getElementById('result-wrap');
		return wrap.querySelector('#deck-handoff-note').compareDocumentPosition(wrap.querySelector('#stat-grid')) & Node.DOCUMENT_POSITION_FOLLOWING;
	}), 'exam: 案内は結果カードの中でサマリーより前にある');

	/* --- 「高度な解析オプション」で出るもの（切り出しプレビュー・開発ログ）の置き場 ---
	   結果の下から②タブの処理ボタンの下へ移した。オプションとの連動は今までどおり。 */
	const devPlace = await page.evaluate(() => {
		document.getElementById('opt-devlog').checked = true;
		renderDevLog();
		return {
			devIn: document.getElementById('dev-wrap').parentElement.id,
			previewIn: document.getElementById('preview-wrap').parentElement.id,
			devShown: !document.getElementById('dev-wrap').classList.contains('hidden'),
			inPanel2: document.getElementById('step-panel-2').contains(document.getElementById('dev-wrap'))
		};
	});
	assert(devPlace.devIn === 'new-devlog-slot' && devPlace.previewIn === 'new-devlog-slot' && devPlace.inPanel2,
		'exam: プレビューと開発ログは②タブの処理ボタンの下にある', devPlace);
	assert(devPlace.devShown, 'exam: オプションを入れると開発ログが出る', devPlace);
	assert(await page.evaluate(() => {
		document.getElementById('opt-devlog').checked = false;
		renderDevLog();
		return document.getElementById('dev-wrap').classList.contains('hidden');
	}), 'exam: オプションを切ると開発ログが隠れる');
	/* --- 引き出しと右下の FAB（special と同じ骨格。css/shell.css） ---
	   合成結果は renderResults() を直接呼んで作っているので、引き出しはまだ開いていない。
	   （実際の判定では processImages() の末尾で照合結果の引き出しが自動で開く。
	     「OCR＋結合」のときは結合が終わった時点で結果画像の方が開く。この2つは実機で確認する） */
	assert(await page.evaluate(() => document.getElementById('result-empty').hidden),
		'exam: 結果があるので「まだありません」の案内は消える');
	assert(!(await page.isVisible('#result-drawer')), 'exam: 合成しただけでは引き出しは開いていない');
	assert(await page.isVisible('#fab-toggle'), 'exam: 右下ナビのメインボタンが出る');
	assert(await page.isVisible('#fab-dot-deck') && !(await page.isVisible('#fab-dot-result')),
		'exam: 渡し終わった直後は Deck の項目に新着バッジが立ち、照合結果には（見に行く前でも）立てない');
	assert(await page.evaluate(() => getComputedStyle(document.getElementById('deck-drawer-trigger')).pointerEvents) === 'none',
		'exam: 畳んだ状態ではサブボタンが押せない');
	// 畳んだナビの外枠（透明な箱）が、その下にある要素のクリックを吸わないこと（F-30）
	const fabBlocks = await page.evaluate(() => {
		const nav = document.getElementById('fab-nav');
		const r = nav.getBoundingClientRect();
		const hit = document.elementFromPoint(r.left + 4, r.top + 4);
		return { navPointer: getComputedStyle(nav).pointerEvents, hitIsNav: hit === nav };
	});
	assert(fabBlocks.navPointer === 'none' && !fabBlocks.hitIsNav, 'exam: 畳んだナビの外枠が下の要素のクリックを吸わない', fabBlocks);
	// ①の <details> の見出しと ②のアップロード欄が、畳んだナビに隠れて押せなくなっていないこと
	const hitTargets = await page.evaluate(() => {
		const out = [];
		const probe = (sel) => {
			const el = document.querySelector(sel);
			el.scrollIntoView({ block: 'center' });
			const r = el.getBoundingClientRect();
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			out.push({ sel, ok: el === hit || el.contains(hit) });
		};
		probe('#step-panel-1 details:nth-of-type(3) summary');
		selectStepTab(2);
		probe('#personset-A-wrap .person-drop-zone');
		selectStepTab(1);
		window.scrollTo(0, 0);
		return out;
	});
	assert(hitTargets.every((h) => h.ok), 'exam: ①の見出しと②のアップロード欄のクリックがナビに吸われない', hitTargets);

	// 照合結果の引き出し。案内が先頭（サマリーより前）にある
	await page.click('#fab-toggle');
	await page.waitForTimeout(400);
	assert(await page.evaluate(() => document.getElementById('fab-nav').classList.contains('open')), 'exam: 右下ナビが開く');
	await page.click('#fab-item-result');
	await page.waitForTimeout(900);
	assert(await page.isVisible('#result-drawer') && await page.isVisible('#result-tbody'), 'exam: 照合結果の引き出しが開き、中に結果表が見える');
	assert(await page.evaluate(() => document.body.style.overflow) === 'hidden', 'exam: 引き出しを開くと本文のスクロールが止まる');
	assert(!(await page.isVisible('#fab-nav')), 'exam: 引き出しを開くとFABは隠れる');
	assert(await page.evaluate(() => {
		const wrap = document.getElementById('result-wrap');
		return wrap.querySelector('#deck-handoff-note').compareDocumentPosition(wrap.querySelector('#stat-grid')) & Node.DOCUMENT_POSITION_FOLLOWING;
	}), 'exam: 案内は結果の中でサマリーより前にある');
	assert(await page.isVisible('#exam-highlight') && await page.isVisible('#copy-btn-label'), 'exam: 緑スキルハイライトと「★の数をコピー」が引き出しの中にある');

	/* --- ★の数のコピー: 窓は出さず、ボタンを結果の一覧のすぐ上に置く（追加修正⑦） --- */
	const copyPlace = await page.evaluate(() => {
		const btn = document.getElementById('result-copy-btn');
		const table = document.getElementById('result-table-el');
		return {
			inResult: document.getElementById('result-wrap').contains(btn),
			slot: btn.parentElement.id,
			aboveTable: !!(btn.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING),
			label: document.getElementById('copy-btn-label').textContent,
			title: btn.title,
			windowShown: !document.getElementById('copy-data-wrap').classList.contains('copy-source-hidden'),
			value: document.getElementById('copy-data').value.split(String.fromCharCode(10))[0],
		};
	});
	assert(copyPlace.inResult && copyPlace.slot === 'result-copy-slot' && copyPlace.aboveTable,
		'exam: 「★の数をコピー」は結果の中の、一覧のすぐ上にある', copyPlace);
	assert(copyPlace.label === '★の数をコピー（2列）' && copyPlace.title.includes('スキル名は含みません'),
		'exam: ラベルは何をコピーするかを言い切り、詳しい説明は title に入る', copyPlace);
	assert(!copyPlace.windowShown, 'exam: 新UIでは「スプレッドシート貼り付け用データ」の窓を出さない', copyPlace);
	assert(/^\d+\t\d+$/.test(copyPlace.value), 'exam: コピーされる中身（タブ区切りの★の数）は変えていない', copyPlace.value);
	// 取り込み案内の色は Deck の色（.deck-accent → --uma-deck-accent-soft）。ページの藍ではない
	const noteColor = await page.evaluate(() => ({
		box: getComputedStyle(document.getElementById('deck-handoff-box')).backgroundColor,
		btn: getComputedStyle(document.getElementById('deck-handoff-btn')).backgroundColor,
		deckSoft: getComputedStyle(document.documentElement).getPropertyValue('--uma-deck-accent-soft').trim()
	}));
	assert(noteColor.deckSoft === '#e7e5e4' && noteColor.box === 'rgb(231, 229, 228)' && noteColor.btn === 'rgb(68, 64, 59)',
		'exam: 取り込み案内は Deck の色（暖灰）で描かれる', noteColor);

	// 「UmaSkill Deck を開いて取り込む」→ Deck の引き出し（iframe）が開く。開いた時点で新着の印は下りる
	await page.click('#deck-handoff-btn');
	await page.waitForTimeout(1500);
	assert(await page.isVisible('#deck-drawer'), 'exam: 案内のボタンで Deck の引き出しが開く');
	assert(!(await page.evaluate(() => document.getElementById('result-drawer').classList.contains('open'))),
		'exam: 乗り換えると照合結果の引き出しは畳まれる');
	n = await noteState();
	assert(!n.dot && n.title.includes('取り込めます'), 'exam: 一度開きに行ったら新着の印は消える（案内は未取り込みのまま）', n);
	assert(await page.evaluate(() => !fabUnseen.deck), 'exam: Deck を開くとバッジが下りる');

	// Deck 側（iframe）: 「UmaExam OCR」のバナー → 133件すべて解決 → 取り込み → 比較シートに★
	const deckErrors = [];
	page.on('console', (m) => { if (m.type() === 'error') deckErrors.push(m.text()); });
	const deckFrame = page.frameLocator('#deck-drawer-frame');
	await deckFrame.locator('#ocr-handoff-banner').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
	const frame = page.frames().find((f) => f.url().includes('uma-skill-deck.html'));
	assert(!!frame, 'exam: 引き出しの iframe が uma-skill-deck.html を読んでいる', page.frames().map((f) => f.url()));
	assert(await frame.evaluate(() => document.querySelector('#ocr-handoff-banner [data-ocr-el="title"]').textContent) === 'UmaExam OCRの判定結果があります',
		'exam: Deck 側に「UmaExam OCR」のバナーが出る');
	const resolved = await frame.evaluate(() => {
		const r = resolveHandoffSkills(pendingOcrHandoff().payload);
		return { resolved: r.resolved.length, unresolved: r.unresolved, ids: new Set(r.resolved.map((x) => x.id)).size };
	});
	assert(resolved.resolved === 133 && resolved.ids === 133 && resolved.unresolved.length === 0,
		'exam: exam の表記（〇・半角括弧）のまま133件すべてが Deck 側で別々の ID に解決する', resolved);
	await deckFrame.locator('[data-ocr-act="import"]').click();
	await page.waitForTimeout(600);
	const dlg = await frame.evaluate(() => ({
		title: document.querySelector('[data-ocr-el="dialog-title"]').textContent,
		lead: document.querySelector('.usd-modal-panel .text-xs.text-slate-500').textContent,
		record: document.querySelector('[data-ocr-el="record-select"]').value,
		name: document.querySelector('[data-ocr-el="record-name"]').value,
		warn: !!document.querySelector('.usd-modal-panel .ocr-warn')
	}));
	assert(dlg.title === 'UmaExam OCRの結果を読み込む' && dlg.lead.includes('スキル133件') && !dlg.warn,
		'exam: 取り込みダイアログは「UmaExam OCR」・133件・未解決の警告なし', dlg);
	assert(dlg.record === '__new__' && dlg.name === '技能試験 候補比較',
		'exam: 取り込み先の既定は新しい比較シート「技能試験 候補比較」', dlg);
	await deckFrame.locator('[data-ocr-act="apply"]').click();
	await page.waitForTimeout(1200);
	const rec = await frame.evaluate(() => {
		const r = Core.getUserData().records.find((x) => x.name === '技能試験 候補比較');
		if (!r) return null;
		const byLabel = {};
		r.candidates.forEach((c) => { byLabel[c.label] = c.candidateId; });
		const v = (skillId, label) => ((r.cells[skillId] || {})[byLabel[label]] || 0);
		return {
			skills: r.skillIds.length, labels: r.candidates.map((c) => c.label),
			a1: v('1', '親A'),      // 右回り〇 = ID 1、親A は i=0 → ★1
			a5: v('5', '親A'),      // 阪神レース場〇 = ID 5、i=4 は★不明 → 0
			a70: v('70', '親A'),    // トリック(前) = ID 70（半角括弧の表記ゆれ）、i=33 → ★1
			b1: v('1', '親B'),      // 親B は offset 1 → ★2
			b445: v('445', '親B'),  // 親B は先頭20件だけ → 未検出 0
		};
	});
	assert(rec && rec.skills === 133 && rec.labels.join('・') === '親A・親B',
		'exam: 比較シートが133件・親A/親B の2候補で作られる', rec);
	assert(rec && rec.a1 === 1 && rec.a5 === 0 && rec.a70 === 1 && rec.b1 === 2 && rec.b445 === 0,
		'exam: 比較シートに★が入る（★不明は0・表記ゆれの名前も正しい ID に入る）', rec);
	const ex = await readExam();
	assert(ex && ex.imported === true, 'exam: imported が :exam キーへ書き戻る');
	n = await noteState();
	assert(n.title.includes('取り込み済み') && n.btn === 'UmaSkill Deckを開く' && !n.dot,
		'exam: iframe からの storage イベントで案内が「取り込み済み」に変わる', n);
	assert(deckErrors.length === 0, 'exam: Deck 側にコンソールエラーなし', deckErrors.slice(0, 3));

	// 除外／追加がある人は scope の名前が「技能試験（調整あり）」。マスターに無い追加名は
	// Deck 側で「見つからなかったため取り込みません」と一覧で知らされる（既存の挙動）
	await page.evaluate(() => { customAddedSkills.push('マスターに無いスキル'); refreshAfterCustomSkillsChange(); });
	await seedExam();
	await page.waitForTimeout(400);
	p = await readExam();
	assert(p && !p.imported && p.scope.name === '技能試験（調整あり）' && p.skillNames.length === 134,
		'exam: 判定し直すと新しい payload（調整あり・134件）になり未取り込みに戻る', p && { imported: p.imported, scope: p.scope, n: p.skillNames.length });
	n = await noteState();
	assert(n.title.includes('取り込めます') && n.detail.includes('（対象：技能試験（調整あり））') && n.dot,
		'exam: 案内も「取り込めます」に戻り、対象名に（調整あり）が付く', n);
	assert(await page.evaluate(() => fabUnseen.deck), 'exam: 判定し直すと Deck のバッジがまた点く');
	await deckFrame.locator('#ocr-handoff-banner').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
	await deckFrame.locator('[data-ocr-act="import"]').click();
	await page.waitForTimeout(600);
	const warn = await frame.evaluate(() => {
		const el = document.querySelector('.usd-modal-panel .ocr-warn');
		return el ? el.textContent : null;
	});
	assert(warn && warn.includes('マスターに無いスキル') && warn.includes('取り込みません'),
		'exam: マスターに無い追加名は取り込みダイアログで利用者に見える', warn);
	await deckFrame.locator('[data-ocr-act="close"]').click();
	await page.evaluate(() => { customAddedSkills = []; refreshAfterCustomSkillsChange(); });

	// Esc は開いているものを1つ閉じる（引き出し → FAB の順）。
	// 直前まで iframe の中を操作していたので、キーは親の文書に戻してから送る
	// （iframe の中で押した Esc は親には届かない。special の Deck 引き出しも同じ）。
	await page.focus('#deck-drawer-close');
	await page.keyboard.press('Escape');
	await page.waitForTimeout(600);
	assert(!(await page.isVisible('#deck-drawer')), 'exam: Esc で引き出しが閉じる');
	assert(await page.evaluate(() => document.body.style.overflow) === '', 'exam: 引き出しを閉じると本文のスクロールが戻る');
	assert(await page.isVisible('#fab-nav'), 'exam: 引き出しを閉じるとFABが戻る');

	/* --- 照合結果と結果画像は1枚の引き出し。中のタブで切り替える（追加修正⑤） ---
	   FAB の項目は2つのままで、どちらを押しても同じ引き出しが開き、押した方のタブが表になる。
	   未読の印は「そのタブを実際に表示したとき」だけ外す。 */
	const tabState2 = () => page.evaluate(() => ({
		drawer: !document.getElementById('result-drawer').hidden,
		stitchDrawerGone: !document.getElementById('stitch-drawer'),
		resultSel: document.getElementById('result-tab-result').getAttribute('aria-selected'),
		stitchSel: document.getElementById('result-tab-stitch').getAttribute('aria-selected'),
		stitchDisabled: document.getElementById('result-tab-stitch').disabled,
		stitchLabel: document.getElementById('result-tab-stitch-label').textContent,
		width: getComputedStyle(document.getElementById('result-drawer')).width,
	}));
	assert((await tabState2()).stitchDrawerGone, 'exam: 結果画像だけの引き出しは無くなった');

	// 結果画像がまだ無いときは、そのタブへ「切り替えられない」（押せないことはラベルでも分かる）
	await page.evaluate(() => fabGoTo('result'));
	await page.waitForTimeout(700);
	let t2 = await tabState2();
	const wideWidth = t2.width;
	assert(t2.drawer && t2.resultSel === 'true' && t2.stitchSel === 'false', 'exam: 「OCRの照合結果」からは照合結果のタブで開く', t2);
	assert(t2.stitchDisabled && t2.stitchLabel === '結果画像（なし）', 'exam: 結果画像がまだ無いタブは押せず、ラベルでもそれが分かる', t2);

	// FAB の「結果画像」からは、結果が無くてもそのタブを表にして案内を読ませる（行き止まりを作らない）
	await page.evaluate(() => fabGoTo('stitch'));
	await page.waitForTimeout(500);
	t2 = await tabState2();
	assert(t2.stitchSel === 'true' && await page.isVisible('#stitch-empty'), 'exam: 「結果画像」からは結果画像のタブで開き、案内が出る', t2);
	assert(t2.width === wideWidth, 'exam: タブを切り替えても引き出しの幅は変わらない', { wide: wideWidth, now: t2.width });
	await page.click('#stitch-empty button');
	await page.waitForTimeout(700);
	assert(!(await page.isVisible('#result-drawer')), 'exam: 案内から入力画面に戻れる');
	assert(await page.evaluate(() => document.getElementById('step-tab-2').getAttribute('aria-selected') === 'true'),
		'exam: 「入力画面に戻る」は②のタブを開く（実行ボタンはそこにある）');

	// 結合結果ができたときの切り替わり（runImageStitching と同じ経路）
	await page.evaluate(() => {
		document.getElementById('stitch-result-content').innerHTML = '<p id="stitch-dummy">結果画像</p>';
		setSectionReady('stitch', true);
		markFabUnseen('stitch');
	});
	await page.waitForTimeout(300);
	assert(await page.isVisible('#fab-dot-stitch'), 'exam: 結果画像ができると新着バッジが立つ');
	assert(!(await tabState2()).stitchDisabled, 'exam: 結果画像ができるとそのタブが押せるようになる');
	/* 引き出しを「照合結果」で開いただけでは、結果画像の未読は残る。
	   引き出しを開くと FAB ごと隠れるので、見えているかではなく印の状態そのものを見る。 */
	const unseen = () => page.evaluate(() => ({
		stitch: fabUnseen.stitch,
		result: fabUnseen.result,
		fabDot: !document.getElementById('fab-dot-stitch').hidden,
		tabDot: !document.getElementById('result-tab-dot-stitch').hidden,
	}));
	await page.evaluate(() => fabGoTo('result'));
	await page.waitForTimeout(700);
	let u = await unseen();
	assert(u.stitch && u.fabDot, 'exam: 引き出しを開いただけでは結果画像の未読は残る', u);
	assert(u.tabDot, 'exam: 未読のタブには印が出る', u);
	// タブを押して実際に表示したときに外れる
	await page.click('#result-tab-stitch');
	await page.waitForTimeout(500);
	assert(await page.isVisible('#stitch-dummy') && !(await page.isVisible('#stitch-empty')), 'exam: 結果画像のタブに中身が出る');
	u = await unseen();
	assert(!u.stitch && !u.fabDot, 'exam: タブを表示すると未読の印が外れる', u);
	assert(!u.tabDot, 'exam: タブ側の印も外れる', u);
	// ←→ でも切り替わる
	await page.keyboard.press('ArrowLeft');
	await page.waitForTimeout(300);
	assert((await tabState2()).resultSel === 'true', 'exam: ←キーで照合結果のタブへ戻る');
	await page.evaluate(() => { closeDrawer(); document.getElementById('stitch-result-content').innerHTML = ''; setSectionReady('stitch', false); selectResultTab('result'); });
	await page.waitForTimeout(600);

	// 本文の下端余白がFAB展開時の高さを吸収できているか
	await page.evaluate(() => { selectStepTab(2); window.scrollTo(0, document.body.scrollHeight); });
	await page.waitForTimeout(400);
	await page.click('#fab-toggle');
	await page.waitForTimeout(400);
	const bottomFit = await page.evaluate(() => {
		const nav = document.getElementById('fab-nav').getBoundingClientRect();
		const cards = [...document.querySelectorAll('.glass-card')];
		return { navTop: Math.round(nav.top), lastBottom: Math.round(cards[cards.length - 1].getBoundingClientRect().bottom) };
	});
	assert(bottomFit.lastBottom <= bottomFit.navTop, 'exam: 最下部で本文がFABに被らない', bottomFit);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(300);
	assert(!(await page.evaluate(() => document.getElementById('fab-nav').classList.contains('open'))), 'exam: Esc でFABが畳まれる');
	await page.evaluate(() => { selectStepTab(1); window.scrollTo(0, 0); });

	/* --- 使い方ガイド（手前に重ねるダイアログ）。閉じる手段が4つあることまで見る --- */
	await page.click('button[onclick="toggleHelp()"]');
	await page.waitForTimeout(200);
	assert(await page.isVisible('#help-box'), 'exam: 使い方ガイドが開く');
	const helpOpened = await page.evaluate(() => ({
		dialog: document.getElementById('help-box').getAttribute('role'),
		backdrop: !document.getElementById('help-backdrop').hidden,
		scrollLocked: document.body.style.overflow === 'hidden',
		focusOnClose: document.activeElement === document.getElementById('help-close'),
		steps: document.querySelectorAll('#help-box .help-steps > li').length,
		step3: document.querySelectorAll('#help-box .help-step-text')[2].textContent,
		tips: document.querySelectorAll('#help-box .help-tips li').length
	}));
	assert(helpOpened.dialog === 'dialog' && helpOpened.backdrop && helpOpened.scrollLocked,
		'exam: ガイドは背景を暗くして手前に重なり、本文のスクロールが止まる', helpOpened);
	assert(helpOpened.focusOnClose, 'exam: 開いた時点で✕にフォーカスが移る', helpOpened);
	assert(helpOpened.steps === 4 && helpOpened.tips === 2 && helpOpened.step3.includes('右下の') && helpOpened.step3.includes('引き出し'),
		'exam: 文面は4ステップ＋撮影の注意2点のまま。STEP3 に引き出しの案内が足されている', helpOpened);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);
	assert(!(await page.isVisible('#help-box')), 'exam: Escでガイドが閉じる');
	assert(await page.evaluate(() => document.body.style.overflow === ''), 'exam: 閉じると本文のスクロールが戻る');
	await page.click('button[onclick="toggleHelp()"]');
	await page.waitForTimeout(200);
	await page.click('#help-close');
	await page.waitForTimeout(200);
	assert(!(await page.isVisible('#help-box')), 'exam: ✕でガイドが閉じる');
	await page.click('button[onclick="toggleHelp()"]');
	await page.waitForTimeout(200);
	await page.click('#help-box .help-foot button');
	await page.waitForTimeout(200);
	assert(!(await page.isVisible('#help-box')), 'exam: 「閉じる」でガイドが閉じる');
	await page.click('button[onclick="toggleHelp()"]');
	await page.waitForTimeout(200);
	await page.mouse.click(8, 8); // 背景（左上の隅）
	await page.waitForTimeout(200);
	assert(!(await page.isVisible('#help-box')), 'exam: 背景タップでガイドが閉じる');
	// Esc の優先順位: ガイド → 引き出し。引き出しの上でガイドを開き、Esc を2回
	await page.evaluate(() => fabGoTo('result'));
	await page.waitForTimeout(500);
	await page.evaluate(() => openHelp());
	await page.waitForTimeout(200);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(300);
	assert(!(await page.isVisible('#help-box')) && await page.isVisible('#result-drawer'), 'exam: Esc はガイドを先に閉じ、引き出しは残る');
	await page.keyboard.press('Escape');
	await page.waitForTimeout(600);
	assert(!(await page.isVisible('#result-drawer')), 'exam: もう一度 Esc で引き出しが閉じる');

	// 375px で横スクロールが出ていないこと（結果カードと案内が出ている状態で）
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(500);
	const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
	assert(ov.sw === ov.cw, 'exam: 375px で横スクロールが出ない', ov);

	assert(errors.length === 0, 'exam: コンソールエラーなし', errors.slice(0, 3));
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

	/* --- 8軸フィルターのタブ切り替え ---
	   パネルの出し分けは .is-active の付け外し＋visibility で、Tailwind の hidden は使わない（F-13）。
	   タブ化で他の軸に入れた条件が視界から消えるため、バッジと「絞り込み中」で補えているかも見る。 */
	const panelShown = (axis) => page.isVisible('.usd-tabpanel[data-usd-axis="' + axis + '"]');
	assert(await panelShown('distance') && !(await panelShown('trackVenue')),
		'deck: 初期表示は①のパネルだけが見えている');

	await page.click('.usd-tab[data-usd-axis="trackVenue"]');
	await page.waitForTimeout(300);
	assert(!(await panelShown('distance')) && await panelShown('trackVenue'),
		'deck: タブを押すと表示パネルが入れ替わる');

	// パネルの高さは全軸で共通（切り替えても下のスキル一覧が上下に跳ねない）
	const panelHeights = await page.evaluate(() => {
		const h = [...document.querySelectorAll('.usd-tabpanels')].map((el) => el.getBoundingClientRect().height);
		return h[0];
	});
	await page.click('.usd-tab[data-usd-axis="distance"]');
	await page.waitForTimeout(300);
	const panelHeightAfter = await page.evaluate(() => document.querySelector('.usd-tabpanels').getBoundingClientRect().height);
	assert(Math.abs(panelHeights - panelHeightAfter) < 1,
		'deck: タブを切り替えてもパネルの高さが変わらない', { panelHeights, panelHeightAfter });

	// 件数バッジ
	await page.click('[data-usd-el="filter-check"][data-axis="distance"][data-value="long"]');
	await page.waitForTimeout(300);
	const badge = await page.evaluate(() => {
		const el = document.querySelector('[data-usd-el="axis-count"][data-usd-axis="distance"]');
		return { hidden: el.hidden, text: el.textContent };
	});
	assert(badge.hidden === false && badge.text === '1', 'deck: 条件を入れた軸のタブに件数バッジが出る', badge);

	// 別のタブへ移っても「絞り込み中」に残り、押すとその軸のタブへ戻れる
	await page.click('.usd-tab[data-usd-axis="scenario"]');
	await page.waitForTimeout(300);
	assert(await page.isVisible('[data-usd-act="filter-jump"][data-usd-axis="distance"]'),
		'deck: 他のタブに移っても「絞り込み中」に条件が残る');
	await page.click('[data-usd-act="filter-jump"][data-usd-axis="distance"]');
	await page.waitForTimeout(300);
	assert(await panelShown('distance'), 'deck: 「絞り込み中」を押すとその軸のタブへ移動する');

	// キーボード（←→・Home・End で移動と同時に切り替わる）
	await page.keyboard.press('ArrowRight');
	await page.waitForTimeout(250);
	assert(await panelShown('style'), 'deck: →キーで隣のタブへ移動する');
	await page.keyboard.press('End');
	await page.waitForTimeout(250);
	assert(await panelShown('scenario'), 'deck: Endキーで最後のタブへ移動する');
	await page.keyboard.press('Home');
	await page.waitForTimeout(250);
	assert(await panelShown('distance'), 'deck: Homeキーで最初のタブへ移動する');

	// すべて解除
	await page.click('[data-usd-act="filter-clear-all"]');
	await page.waitForTimeout(300);
	assert(await page.evaluate(() =>
		document.querySelector('[data-usd-el="axis-count"][data-usd-axis="distance"]').hidden === true
		&& !document.querySelector('[data-usd-act="filter-jump"]')),
		'deck: 「すべて解除」でバッジと「絞り込み中」が消える');

	/* --- 8軸すべてが常に見えていること（横スクロールも「端へ」操作も要らない） ---
	   1行に収まるかどうかはJSが実測して data-usd-rows を切り替える。 */
	const tabLayout = () => page.evaluate(() => {
		const bar = document.querySelector('.usd-tablist');
		const tabs = [...document.querySelectorAll('.usd-tab')];
		const box = bar.getBoundingClientRect();
		return {
			rows: document.querySelector('[data-usd-el="tabbar"]').getAttribute('data-usd-rows'),
			count: tabs.length,
			// 1枚でも枠から食み出していたら「全部は見えていない」
			clipped: tabs.filter((t) => {
				const r = t.getBoundingClientRect();
				return r.width < 1 || r.left < box.left - 1 || r.right > box.right + 1;
			}).length,
			hScroll: bar.scrollWidth > bar.clientWidth + 1,
			pageSw: document.documentElement.scrollWidth, pageCw: document.documentElement.clientWidth
		};
	});
	const pcTabs = await tabLayout();
	assert(pcTabs.rows === '1' && pcTabs.count === 8 && pcTabs.clipped === 0 && !pcTabs.hScroll,
		'deck: PC幅では8タブが1行に収まり、どれも欠けない', pcTabs);

	// --- 375px：1行に入らないので角丸ボタンの多段へ切り替わる ---
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(600);
	const narrowTabs = await tabLayout();
	assert(narrowTabs.rows === 'multi', 'deck: 375px では多段レイアウトに切り替わる', narrowTabs);
	assert(narrowTabs.count === 8 && narrowTabs.clipped === 0 && !narrowTabs.hScroll,
		'deck: 375px でも8タブすべてが見えていて横スクロールしない', narrowTabs);
	assert(narrowTabs.pageSw === narrowTabs.pageCw,
		'deck: 375px でモーダルを開いてもページは横スクロールしない', narrowTabs);
	// 多段でもタブとして機能する
	await page.click('.usd-tab[data-usd-axis="trackVenue"]');
	await page.waitForTimeout(300);
	assert(await panelShown('trackVenue'), 'deck: 375px の多段タブでも切り替えられる');

	await page.setViewportSize({ width: 1280, height: 900 });
	await page.waitForTimeout(600);
	assert((await tabLayout()).rows === '1', 'deck: PC幅へ戻すと1行レイアウトに戻る');

	/* --- 選択肢は2行で頭打ち。続きがあることをフェードで示し、スクロールで読める --- */
	const optState = (axis) => page.evaluate((a) => {
		const opts = document.querySelector('.usd-tabpanel[data-usd-axis="' + a + '"] .usd-opts');
		const rowTop = (c) => Math.round(c.offsetTop);
		return {
			more: opts.parentElement.hasAttribute('data-more-below'),
			clipped: Math.round(opts.clientHeight), full: Math.round(opts.scrollHeight),
			totalRows: new Set([...opts.children].map(rowTop)).size,
			// 枠の中に丸ごと収まっている行だけを数える
			visibleRows: new Set([...opts.children]
				.filter((c) => c.offsetTop + c.offsetHeight <= opts.clientHeight + 1).map(rowTop)).size
		};
	}, axis);
	const venue = await optState('trackVenue');
	assert(venue.visibleRows === 2 && venue.totalRows > 2 && venue.full > venue.clipped + 2,
		'deck: 選択肢の多い軸は2行までに抑えられ、続きは隠れている', venue);
	assert(venue.more === true, 'deck: 続きがある軸は下端にフェードが出る', venue);

	const distance = await optState('distance');
	assert(distance.more === false, 'deck: 1行で収まる軸にはフェードが出ない', distance);

	// パネルの高さは2行ぶんで一定（切り替えても下のスキル一覧が跳ねない）
	const heightOnVenue = await page.evaluate(() => Math.round(document.querySelector('.usd-tabpanels').getBoundingClientRect().height));
	await page.click('.usd-tab[data-usd-axis="distance"]');
	await page.waitForTimeout(300);
	const heightOnDistance = await page.evaluate(() => Math.round(document.querySelector('.usd-tabpanels').getBoundingClientRect().height));
	assert(heightOnVenue === heightOnDistance, 'deck: 軸を替えてもパネルの高さは変わらない', { heightOnVenue, heightOnDistance });

	// 下までスクロールするとフェードが消える
	await page.evaluate(() => {
		const opts = document.querySelector('.usd-tabpanel[data-usd-axis="trackVenue"] .usd-opts');
		opts.scrollTop = opts.scrollHeight;
	});
	await page.waitForTimeout(300);
	assert((await optState('trackVenue')).more === false,
		'deck: 下までスクロールするとフェードが消える');

	/* --- 「条件でスキルを検索」のときは8軸フィルターだけが出ている --- */
	const modeState = () => page.evaluate(() => {
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		return {
			title: el('picker-title').textContent,
			filter: !el('mode-filter').hidden,
			paste: !el('mode-paste').hidden,
			custom: !el('mode-custom').hidden,
			commit: !el('picker-commit').hidden
		};
	});
	const filterMode = await modeState();
	assert(filterMode.filter && !filterMode.paste && !filterMode.custom && filterMode.commit,
		'deck: 条件で検索のときは8軸フィルターだけが出る', filterMode);
	assert(/条件でスキルを検索/.test(filterMode.title), 'deck: 見出しが「条件でスキルを検索」', filterMode.title);

	/* --- 追加ボタンはスクロール領域の外（フッター）に置き、脇に選択数を出す ---
	   一覧をいくら下まで見にいってもボタンが画面外へ出ず、最後の行も隠れないこと。 */
	const footState = () => page.evaluate(() => {
		const foot = document.querySelector('[data-usd-el="picker-footer"]');
		const body = document.querySelector('[data-usd-el="picker-body"]');
		const st = getComputedStyle(foot);
		return {
			hidden: foot.hidden,
			count: document.querySelector('[data-usd-el="picker-checked-count"]').textContent,
			disabled: document.querySelector('[data-usd-el="picker-commit"]').disabled,
			label: document.querySelector('[data-usd-el="picker-commit"]').textContent,
			bg: st.backgroundColor,
			opacity: st.opacity,
			// スクロール領域の下端がフッターの上端を越えていない＝重なっていない
			overlap: Math.round(body.getBoundingClientRect().bottom - foot.getBoundingClientRect().top)
		};
	});
	const foot0 = await footState();
	assert(foot0.hidden === false && foot0.count === '0種選択' && foot0.disabled === true,
		'deck: 何もチェックしていなければ「0種選択」でボタンは押せない', foot0);
	assert(foot0.label === 'チェックしたスキルを追加',
		'deck: まだ何も足していないうちは「追加済み」を出さない', foot0.label);
	assert(foot0.opacity === '1' && /^rgb\(\d+, \d+, \d+\)$/.test(foot0.bg),
		'deck: フッターの地は不透明で塗ってある（opacity を使わない）', foot0);
	assert(foot0.overlap <= 0, 'deck: フッターがスクロール領域に重ならない（最後の行を隠さない）', foot0);

	await page.click('[data-usd-el="results"] .usd-row:first-child input');
	await page.waitForTimeout(200);
	const foot1 = await footState();
	assert(foot1.count === '1種選択' && foot1.disabled === false,
		'deck: チェックを入れると「1種選択」になりボタンが押せる', foot1);

	// 「表示中を全て選択」の隣の件数（絞り込み結果の総数）と、フッターの選択数は別のもの。
	// 全部チェックしたときだけ一致するので、それをそのまま検査にしている。
	await page.click('[data-usd-act="picker-select-all"]');
	await page.waitForTimeout(300);
	const footAll = await page.evaluate(() => ({
		count: document.querySelector('[data-usd-el="picker-checked-count"]').textContent,
		result: document.querySelector('[data-usd-el="result-count"]').textContent
	}));
	assert(footAll.count === parseInt(footAll.result, 10) + '種選択',
		'deck: 「表示中を全て選択」で選択数が絞り込み結果の件数に揃う', footAll);

	// 一覧を下端までスクロールしてもフッターの位置は動かない（画面外へ出ない）
	const footScroll = await page.evaluate(() => {
		const foot = document.querySelector('[data-usd-el="picker-footer"]');
		const body = document.querySelector('[data-usd-el="picker-body"]');
		const before = foot.getBoundingClientRect().top;
		body.scrollTop = body.scrollHeight;
		return { before: Math.round(before), after: Math.round(foot.getBoundingClientRect().top),
			scrolled: body.scrollTop > 0 };
	});
	assert(footScroll.before === footScroll.after,
		'deck: 一覧を下までスクロールしてもフッターの位置が変わらない', footScroll);

	await page.click('[data-usd-act="picker-select-all"]');
	await page.waitForTimeout(300);
	const footNone = await footState();
	assert(footNone.count === '0種選択' && footNone.disabled === true,
		'deck: 全て解除すると「0種選択」へ戻りボタンも止まる', footNone);

	// 実際に押すと、足したぶんがボタンの中に累計で残る。
	// 押すとチェックは外れて一覧からも消えるので、これが無いと足した実感が画面に残らない。
	await page.click('[data-usd-el="results"] .usd-row:first-child input');
	await page.click('[data-usd-el="results"] .usd-row:nth-child(2) input');
	await page.waitForTimeout(200);
	await page.click('[data-usd-el="picker-commit"]');
	await page.waitForTimeout(500);
	const footAdded = await footState();
	assert(footAdded.label === 'チェックしたスキルを追加（2種追加済み）'
		&& footAdded.count === '0種選択' && footAdded.disabled === true,
		'deck: 追加すると「2種追加済み」がボタンに出て、選択は0種へ戻る', footAdded);

	// もう1件足すと累計で数える（押すたびに上書きではない）
	await page.click('[data-usd-el="results"] .usd-row:first-child input');
	await page.waitForTimeout(200);
	await page.click('[data-usd-el="picker-commit"]');
	await page.waitForTimeout(500);
	assert((await footState()).label === 'チェックしたスキルを追加（3種追加済み）',
		'deck: 続けて足すと累計になる');

	// 開き直すと0に戻る（モーダルを開いている間だけの数）
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);
	await page.click('button[onclick="openRecordSkillPicker()"]');
	await page.waitForTimeout(700);
	assert((await footState()).label === 'チェックしたスキルを追加',
		'deck: 開き直すと「追加済み」は0に戻る');

	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);
	assert(!(await page.isVisible('.usd-modal')), 'deck: モーダルが閉じる');

	/* --- スキルを足す入口は3つ。それぞれ別のモードでモーダルが開く --- */
	const entries = await page.evaluate(() =>
		[...document.querySelectorAll('#record-editor-view .uma-btn')]
			.map((b) => b.textContent.trim()).filter((t) => /検索|マスターにない/.test(t)));
	assert(entries.length === 3 && entries[0] === '条件でスキルを検索'
		&& entries[1] === 'テキストで検索' && entries[2] === 'マスターにないスキルを追加',
		'deck: 比較シート編集に3つの入口ボタンが並ぶ', entries);

	await page.click('button[onclick="openRecordTextPicker()"]');
	await page.waitForTimeout(700);
	const pasteMode = await modeState();
	assert(!pasteMode.filter && pasteMode.paste && !pasteMode.custom && pasteMode.commit,
		'deck: 「テキストで検索」は貼り付け欄だけを出す', pasteMode);
	assert(pasteMode.title === 'テキストで検索', 'deck: 見出しが「テキストで検索」', pasteMode.title);
	const pasteInput = await page.evaluate(() => {
		const el = document.querySelector('[data-usd-el="paste-input"]');
		return { placeholder: el.placeholder, focused: document.activeElement === el };
	});
	assert(pasteInput.placeholder === '1行に1つずつスキル名を貼り付けるか、スプレッドシートの1列をそのまま貼り付け',
		'deck: 貼り付けのプレースホルダーがスプレッドシート限定に読めない文言になっている', pasteInput.placeholder);
	assert(pasteInput.focused, 'deck: 開いた時点で貼り付け欄にカーソルが入る', pasteInput);
	// 実際に照合が動く（マスターに在る名前を2件）。
	// 1件目はこの比較シートに既に入っているもの、2件目は入っていないものにしてある
	// （フッターの「XX種選択」が、押したら実際に足される数だけを数えることを見るため）。
	// 2件目は、上のフッターの検査で実際に足した3件（マスターの12〜14番目）より後ろの
	// ものを選んでいる。手前のものにすると「追加済み」になって1件目と区別が付かなくなる。
	await page.fill('[data-usd-el="paste-input"]', '右回り○\n道悪○');
	await page.click('[data-usd-act="paste-run"]');
	await page.waitForTimeout(500);
	// 完全一致した行は一覧には出さない仕様（要確認の行だけを並べる）ので、件数サマリーで見る
	const matched = await page.evaluate(() => {
		const ok = document.querySelector('[data-usd-el="paste-report"] .usd-paste-ok');
		return { text: ok ? ok.textContent : null, warn: !document.querySelector('.usd-paste-warn') };
	});
	assert(matched.text === '選択 2件' && matched.warn,
		'deck: 貼り付けたテキストが照合されて2件が選択に入る', matched);
	// フッターは「条件で検索」と同じものを使う。数えるのは「押したら実際に足される数」なので、
	// 照合で2件そろっても、片方が追加済みなら1種選択になる。
	const pasteFoot = await page.evaluate(() => {
		const rep = document.querySelector('[data-usd-el="paste-report"]');
		const already = rep.querySelector('.usd-paste-muted');
		return {
			hidden: document.querySelector('[data-usd-el="picker-footer"]').hidden,
			count: document.querySelector('[data-usd-el="picker-checked-count"]').textContent,
			disabled: document.querySelector('[data-usd-el="picker-commit"]').disabled,
			already: already ? already.textContent : null
		};
	});
	assert(pasteFoot.hidden === false && pasteFoot.count === '1種選択' && pasteFoot.disabled === false
		&& /追加済み 1件/.test(pasteFoot.already || ''),
		'deck: テキストで検索でも同じフッターが出て、追加済みを除いた数が出る', pasteFoot);
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);

	await page.click('button[onclick="openRecordCustomSkill()"]');
	await page.waitForTimeout(700);
	const customMode = await modeState();
	assert(!customMode.filter && !customMode.paste && customMode.custom,
		'deck: 「マスターにないスキルを追加」は手入力欄だけを出す', customMode);
	assert(customMode.title === 'マスターにないスキルを追加', 'deck: 見出しが「マスターにないスキルを追加」', customMode.title);
	// 作ったその場で対象セットへ入るので、下の確定ボタンは出さない（フッターごと畳む）
	assert(customMode.commit === false, 'deck: 手入力のときは下の確定ボタンを出さない', customMode);
	assert((await page.evaluate(() =>
		document.querySelector('[data-usd-el="picker-footer"]').getBoundingClientRect().height)) === 0,
		'deck: 手入力のときはフッターごと出さない');
	const customAxes = await page.evaluate(() =>
		new Set([...document.querySelectorAll('[data-usd-el="custom-tag"]')].map((el) => el.dataset.axis)).size);
	assert(customAxes === 8, 'deck: 手入力にも8軸ぶんのタグ入力が出る', customAxes);
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);

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

	// 375px でも、一覧を下まで見たあとにフッターが画面内へ収まっている
	await page.click('button[onclick="openRecordSkillPicker()"]');
	await page.waitForTimeout(700);
	const footNarrow = await page.evaluate(() => {
		const body = document.querySelector('[data-usd-el="picker-body"]');
		body.scrollTop = body.scrollHeight;
		const fr = document.querySelector('[data-usd-el="picker-footer"]').getBoundingClientRect();
		return { top: Math.round(fr.top), bottom: Math.round(fr.bottom), vh: window.innerHeight,
			overlap: Math.round(body.getBoundingClientRect().bottom - fr.top) };
	});
	assert(footNarrow.bottom <= footNarrow.vh && footNarrow.top >= 0 && footNarrow.overlap <= 0,
		'deck: 375px でも一覧を下まで見たときフッターが画面内に収まり、一覧と重ならない', footNarrow);
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);

	assert(errors.length === 0, 'deck: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * exam.html — 既定は新UI／切り替えの告知モーダル／旧UIとの往復
 *
 * special の C-16 と同じ作法。exam の旧UI／新UIは「画面構成そのもの」の切り替えで、
 * 中身の要素（①②のパネル・結果・結果画像・ガイドの本文）は placeSections() で
 * 置き場の間を移る。「どちらのUIで開くか」と「既読か」が localStorage に残るので、
 * まっさらな文脈を使って通しで見る。閉じ方4通りは文脈を分けて1通りずつ確かめる。
 * ============================================================ */
{
	const uiState = (page) => page.evaluate(() => ({
		notice: !document.getElementById('ui-notice').hidden,
		backdrop: !document.getElementById('ui-notice-backdrop').hidden,
		badge: !document.getElementById('ui-mode-badge').hidden,
		newCard: !document.getElementById('new-step-card').hidden,
		oldCards: [!document.getElementById('old-step1-card').hidden, !document.getElementById('old-step2-card').hidden],
		fab: !document.getElementById('fab-nav').hidden,
		label: document.getElementById('deck-mode-btn-label').textContent,
		scrollLocked: document.body.style.overflow === 'hidden',
		seen: localStorage.getItem('uma-exam-ui-notice'),
		mode: localStorage.getItem('uma-exam-ui-mode'),
		// 中身の置き場（どの箱の中にいるか）
		panel1In: document.getElementById('step-panel-1').parentElement.id,
		resultIn: document.getElementById('result-wrap').parentElement.id,
		helpIn: document.getElementById('help-content').parentElement.id,
		copyIn: document.getElementById('result-copy-btn').parentElement.id,
		devIn: document.getElementById('dev-wrap').parentElement.id
	}));

	// 1. 初回訪問：新UIで開き、モーダルが出る
	{
		const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
		await page.waitForTimeout(800);
		const first = await uiState(page);
		assert(first.newCard && !first.oldCards[0] && !first.oldCards[1] && first.fab && first.badge && first.label === '旧UIへ',
			'exam: 初回は新UI（タブ・FAB）で開き、旧UIのカードは出ない', first);
		assert(first.panel1In === 'new-step-slot' && first.resultIn === 'result-drawer-slot' && first.helpIn === 'help-dialog-slot' && first.copyIn === 'result-copy-slot'
			&& first.devIn === 'new-devlog-slot',
			'exam: 新UIでは中身がタブ・引き出し・ダイアログの中にある', first);
		assert(first.notice && first.backdrop && first.scrollLocked,
			'exam: 初回は切り替えの告知モーダルが出て、本文のスクロールが止まる', first);
		assert(await page.evaluate(() => document.activeElement === document.getElementById('ui-notice-ok')),
			'exam: 開いた時点でOKにフォーカスが移る');
		assert(first.seen === null, 'exam: 開いただけではまだ既読にしない', first.seen);
		// 文面は固定。＜新機能＞の段は Deck の色の枠
		const text = await page.evaluate(() => ({
			title: document.getElementById('ui-notice-title').textContent,
			body: document.querySelector('#ui-notice .notice-body').textContent.replace(/\s+/g, ''),
			newBox: getComputedStyle(document.querySelector('#ui-notice .notice-new')).backgroundColor
		}));
		assert(text.title === '画面が新しくなりました'
			&& text.body.includes('対象スキル（133種）や除外・追加の設定はそのままです。')
			&& text.body.includes('照合結果と結果画像は、右下の＋ボタンから開く引き出しに表示されます。')
			&& text.body.includes('右上の「旧UIへ」から、いつでも元の画面に戻せます。')
			&& text.body.includes('＜新機能＞')
			&& text.body.includes('OCRの結果を保存して、候補同士を見比べられる「UmaSkillDeck」が追加されました。')
			&& text.body.includes('UmaSkillDeckは、右下の＋ボタンから開く引き出しに表示されます。')
			&& text.body.includes('照合結果はUmaSkillDeckに直接追加できます。'),
			'exam: 告知の文面が決めたとおり', text);
		// ツール名は太字で強調する（枠の中の本文と同じ色）
		assert(await page.evaluate(() => {
			const el = document.querySelector('#ui-notice .notice-deck-name');
			return el ? getComputedStyle(el).fontWeight : null;
		}) === '700', 'exam: 告知の「UmaSkill Deck」が太字で強調されている');
		assert(text.newBox === 'rgb(231, 229, 228)', 'exam: ＜新機能＞の段は Deck の色（暖灰）の枠', text.newBox);
		// 語の途中で折れていないこと（.nb で括った文節は1行に収まる）
		const broken = await page.evaluate(() => [...document.querySelectorAll('#ui-notice .nb')]
			.filter((el) => el.getClientRects().length > 1).map((el) => el.textContent));
		assert(broken.length === 0, 'exam: 告知の文節が途中で折り返されていない（PC幅）', broken);

		await page.click('#ui-notice-ok');
		await page.waitForTimeout(300);
		const closed = await uiState(page);
		assert(!closed.notice && !closed.backdrop && !closed.scrollLocked, 'exam: OKでモーダルが閉じ、スクロールが戻る', closed);
		assert(closed.seen === '2026-09-exam-drawer-layout', 'exam: 閉じると既読の印が残る', closed.seen);

		// 再読み込み → 新UIのまま・モーダルは出ない
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(1500);
		const again = await uiState(page);
		assert(again.newCard && !again.notice, 'exam: 既読なら新UIのままで、モーダルは繰り返さない', again);

		// 右上のバッジから読み直せる（既読のまま）
		await page.click('#ui-mode-badge');
		await page.waitForTimeout(300);
		const reopened = await uiState(page);
		assert(reopened.notice && reopened.seen === '2026-09-exam-drawer-layout', 'exam: 右上のバッジから読み直せて、既読のまま変わらない', reopened);
		await page.click('#ui-notice-ok');
		await page.waitForTimeout(300);

		// 旧UIへ：中身が本文のカードへ移り、FAB と Deck の入口が消える。受け渡しの書き込みは続く
		await page.evaluate(() => {
			const mk = (names, offset) => matchAllSkillsWithStars(
				names.map((n, i) => ({ text: n, stars: ((i + offset) % 3) + 1, starsReliable: true, rowKey: 'r' + i })),
				skillList, skillIndex, {});
			personResults = PERSON_LABELS.map(() => null);
			personResults[0] = mk(skillList, 0);
			renderResults();
			writeOcrHandoff();
		});
		await page.click('#deck-mode-btn');
		await page.waitForTimeout(600);
		const old = await uiState(page);
		assert(old.mode === 'old' && old.label === '新UIへ' && !old.badge, 'exam: 選んだUIが保存され、ラベルが「新UIへ」になる', old);
		assert(!old.newCard && old.oldCards[0] && old.oldCards[1] && !old.fab, 'exam: 旧UIでは①②が別々のカードで縦に並び、FABは出ない', old);
		assert(old.panel1In === 'old-step1-slot' && old.resultIn === 'old-result-slot' && old.helpIn === 'old-help-slot' && old.copyIn === 'old-copy-slot'
			&& old.devIn === 'old-devlog-slot',
			'exam: 旧UIでは中身が本文のカードとアコーディオンの中へ移る', old);
		assert(await page.evaluate(() => ({
			window: !document.getElementById('copy-data-wrap').classList.contains('copy-source-hidden'),
			newSlotHidden: document.getElementById('result-copy-slot').hidden,
		})).then((x) => x.window && x.newSlotHidden),
			'exam: 旧UIでは窓を今までどおり出し、新UI用のボタンの置き場は畳む');
		assert(await page.isVisible('#old-result-card') && await page.isVisible('#result-tbody') && await page.isVisible('#result-copy-btn'),
			'exam: 旧UIでは照合結果が本文のカードとして出て、「まとめてコピー」も見出しにある');
		assert(await page.evaluate(() => document.getElementById('deck-handoff-note').classList.contains('hidden')),
			'exam: 旧UIでは Deck の入口（取り込み案内）を出さない（F-29②）');
		assert(await page.evaluate(() => !!JSON.parse(localStorage.getItem('umaSkillDeck:ocrHandoff:exam') || 'null')),
			'exam: 受け渡しの書き込み自体は旧UIでも続いている');
		// 旧UIのガイドはアコーディオン
		await page.click('button[onclick="toggleHelp()"]');
		await page.waitForTimeout(200);
		assert(await page.isVisible('#old-help-card') && await page.evaluate(() => document.getElementById('help-box').hidden),
			'exam: 旧UIではガイドが本文のアコーディオンで開き、ダイアログは使わない');
		await page.click('button[onclick="toggleHelp()"]');
		await page.waitForTimeout(200);
		assert(!(await page.isVisible('#old-help-card')), 'exam: 旧UIのアコーディオンはもう一度押すと閉じる');

		// 再読み込み → 旧UIで開く・告知は出ない
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(1500);
		const old2 = await uiState(page);
		assert(!old2.newCard && old2.oldCards[0] && old2.label === '新UIへ' && !old2.badge && !old2.notice,
			'exam: 既読なら最後に選んだ旧UIで開き、モーダルは出ない', old2);

		// 新UIへ戻る：中身がタブ・引き出しへ戻り、①のタブが開いている
		await page.click('#deck-mode-btn');
		await page.waitForTimeout(600);
		const back = await uiState(page);
		assert(back.newCard && back.fab && back.badge && back.panel1In === 'new-step-slot' && back.resultIn === 'result-drawer-slot',
			'exam: 新UIへ戻ると中身もタブ・引き出しへ戻る', back);
		assert(await page.evaluate(() => document.getElementById('step-tab-1').getAttribute('aria-selected') === 'true' && document.getElementById('step-panel-2').hidden),
			'exam: 新UIへ戻ったときは①のタブが開いている');
		assert(errors.length === 0, 'exam: 切り替え・告知まわりでコンソールエラーが出ない', errors.slice(0, 3));
		await ctx.close();
	}

	// 2. 「旧UI」の保存値だけを持つ人（既読の印なし）は、一度だけ新UIへ寄せる
	{
		const { ctx, page } = await openPage(browser, base, 'exam.html');
		await page.evaluate(() => { localStorage.setItem('uma-exam-ui-mode', 'old'); localStorage.removeItem('uma-exam-ui-notice'); });
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(1500);
		const s = await uiState(page);
		assert(s.newCard && s.notice, 'exam: 既読の印が無ければ、保存が「旧UI」でも新UIで開いてモーダルを出す', s);
		await ctx.close();
	}

	// 3. 閉じ方は4通り。どれで閉じても既読になる（✕・背景・Esc。OKは上で確認済み）
	for (const [how, act] of [['✕', async (page) => page.click('#ui-notice .notice-close')],
		['背景', async (page) => page.click('#ui-notice-backdrop', { position: { x: 5, y: 5 } })],
		['Esc', async (page) => page.keyboard.press('Escape')]]) {
		const { ctx, page } = await openPage(browser, base, 'exam.html');
		await page.waitForTimeout(800);
		assert(await page.isVisible('#ui-notice'), 'exam: ' + how + 'で閉じる前にモーダルが出ている');
		await act(page);
		await page.waitForTimeout(300);
		const s = await uiState(page);
		assert(!s.notice && s.seen === '2026-09-exam-drawer-layout', 'exam: ' + how + 'で閉じても既読になる', s);
		await ctx.close();
	}

	// 4. 375px でも告知の文節が途中で折り返されない
	{
		const { ctx, page } = await openPage(browser, base, 'exam.html', { width: 375, height: 812 });
		await page.waitForTimeout(800);
		assert(await page.isVisible('#ui-notice'), 'exam: 375px でも初回はモーダルが出る');
		const broken = await page.evaluate(() => [...document.querySelectorAll('#ui-notice .nb')]
			.filter((el) => el.getClientRects().length > 1).map((el) => el.textContent));
		assert(broken.length === 0, 'exam: 告知の文節が途中で折り返されていない（375px）', broken);
		const ov = await page.evaluate(() => { const d = document.getElementById('ui-notice'); return { sw: d.scrollWidth, cw: d.clientWidth }; });
		assert(ov.sw <= ov.cw, 'exam: 375px で告知が横にはみ出さない', ov);
		await ctx.close();
	}
}

/* ============================================================
 * exam.html — 最後に使ったステップのタブを覚える
 *
 * ①（対象スキル）は一度整えたら触らず、以降はほぼ②（画像アップロード）から
 * 操作するので、次に開いたときは最後のタブから始める。
 * 保存が残るかどうかを見るので、まっさらな文脈を使う。
 * ============================================================ */
{
	const tabState = (page) => page.evaluate(() => ({
		tab1: document.getElementById('step-tab-1').getAttribute('aria-selected'),
		tab2: document.getElementById('step-tab-2').getAttribute('aria-selected'),
		saved: localStorage.getItem('uma-exam-last-step')
	}));
	{
		const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
		await page.waitForTimeout(800);
		if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
		await page.waitForTimeout(300);
		assert((await tabState(page)).tab1 === 'true', 'exam: 保存が無ければ①から始まる（今までどおり）');

		await page.click('#step-tab-2');
		await page.waitForTimeout(300);
		assert((await tabState(page)).saved === '2', 'exam: タブを切り替えると覚える');
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(1500);
		const after = await tabState(page);
		assert(after.tab2 === 'true' && after.tab1 === 'false', 'exam: 次に開いたときは最後のタブ（②）から始まる', after);

		// 旧UIにはタブが無い。旧UIから新UIへ戻したときも、覚えたタブを開く
		await page.click('#deck-mode-btn');
		await page.waitForTimeout(600);
		await page.click('#deck-mode-btn');
		await page.waitForTimeout(600);
		assert((await tabState(page)).tab2 === 'true', 'exam: 旧UIから新UIへ戻しても、覚えたタブを開く');

		// 壊れた値は①として扱う（読めない値でも画面が止まらない）
		await page.evaluate(() => localStorage.setItem('uma-exam-last-step', '{壊れた値}'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(1500);
		assert((await tabState(page)).tab1 === 'true', 'exam: 保存が壊れた値なら①から始まる');
		assert(errors.length === 0, 'exam: タブの記憶でコンソールエラーが出ない', errors.slice(0, 3));
		await ctx.close();
	}
}

/* ============================================================
 * uma-skill-deck.html — OCR受け取り口（2ソース: special / exam）
 *
 * 受け渡しデータはツールごとに別のキー（:special / :exam）。Deck 単独ページで
 * キーに直接 payload を書き、バナーの見出しがツール名で出ること・取り込めること・
 * imported が元のキーへ書き戻ることを見る。両方に未取り込みがあるときは
 * createdAt が新しい方が先に出て、読み込む／閉じるともう一方が続けて出る。
 * special からの受け渡しそのものは special のブロックで見ている。
 * ============================================================ */
{
	const KEY_SPECIAL = 'umaSkillDeck:ocrHandoff:special';
	const KEY_EXAM = 'umaSkillDeck:ocrHandoff:exam';
	const mkPayload = (source, handoffId, createdAt) => ({
		schemaVersion: 1, handoffId, createdAt, source,
		scope: { kind: 'manual', id: '', name: source === 'exam' ? '技能試験の対象スキル' : '手入力のスキルリスト' },
		skillNames: PICK.map((s) => s.name),
		persons: [{ index: 0, label: '親A', stars: Object.fromEntries(PICK.map((s, i) => [s.name, (i % 3) + 1])), unknownStars: [] }],
	});
	const openWithHandoffs = async (seeds) => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await ctx.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.addInitScript(({ d, seeds }) => {
			localStorage.setItem('umaSkillDeck:userData', JSON.stringify(d));
			seeds.forEach(([k, p]) => localStorage.setItem(k, JSON.stringify(p)));
		}, { d: USER_DATA, seeds });
		await page.goto(base + '/uma-skill-deck.html', { waitUntil: 'networkidle', timeout: 60000 });
		await page.waitForTimeout(1500);
		return { ctx, page, errors };
	};
	const bannerState = (page) => page.evaluate(() => {
		const el = document.getElementById('ocr-handoff-banner');
		return { visible: !!el && !el.hidden, title: el ? el.querySelector('[data-ocr-el="title"]').textContent : null };
	});
	const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);

	/* --- 1) exam のキーだけに未取り込みがある --- */
	{
		const { ctx, page, errors } = await openWithHandoffs([[KEY_EXAM, mkPayload('exam', 'ho_exam_1', '2026-09-11T10:00:00.000Z')]]);
		const b = await bannerState(page);
		assert(b.visible && b.title === 'UmaExam OCRの判定結果があります', 'deck: examキーの結果はバナーが「UmaExam OCR」で出る', b);
		await page.click('[data-ocr-act="import"]');
		await page.waitForTimeout(600);
		assert(await page.textContent('[data-ocr-el="dialog-title"]') === 'UmaExam OCRの結果を読み込む',
			'deck: ダイアログの見出しも「UmaExam OCR」');
		await page.click('[data-ocr-act="apply"]');
		await page.waitForTimeout(800);
		const afterExam = await stored(page, KEY_EXAM);
		assert(afterExam && afterExam.imported === true && afterExam.handoffId === 'ho_exam_1',
			'deck: 取り込むと imported が examキーへ書き戻る', afterExam && { imported: afterExam.imported, id: afterExam.handoffId });
		assert((await stored(page, KEY_SPECIAL)) === null, 'deck: specialキーには何も書かない');
		assert(!(await bannerState(page)).visible, 'deck: 取り込み後はバナーが消える');
		const recs = await page.evaluate(() => Core.listRecordSummaries().map((r) => ({ name: r.name, candidates: r.candidateCount })));
		assert(recs.length === 2 && recs.some((r) => r.name === '技能試験の対象スキル 候補比較' && r.candidates === 1),
			'deck: 取り込みで比較シートが1件増え、候補が1人入る', recs);
		assert(errors.length === 0, 'deck: examキーの取り込みでコンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	}

	/* --- 2) 両キーに未取り込み。新しい方（exam）→ 閉じる → もう一方（special）→ 取り込み --- */
	{
		const { ctx, page, errors } = await openWithHandoffs([
			[KEY_SPECIAL, mkPayload('special', 'ho_special_1', '2026-09-11T09:00:00.000Z')],
			[KEY_EXAM, mkPayload('exam', 'ho_exam_2', '2026-09-11T10:00:00.000Z')],
		]);
		let b = await bannerState(page);
		assert(b.visible && b.title === 'UmaExam OCRの判定結果があります', 'deck: 両方あるときは createdAt が新しい方（exam）が先に出る', b);
		await page.click('[data-ocr-act="dismiss"]');
		await page.waitForTimeout(300);
		b = await bannerState(page);
		assert(b.visible && b.title === 'UmaStar OCRの判定結果があります', 'deck: 閉じると、もう一方（special）が続けて出る', b);
		await page.click('[data-ocr-act="import"]');
		await page.waitForTimeout(600);
		assert(await page.textContent('[data-ocr-el="dialog-title"]') === 'UmaStar OCRの結果を読み込む',
			'deck: 続けて出た方のダイアログは「UmaStar OCR」');
		await page.click('[data-ocr-act="apply"]');
		await page.waitForTimeout(800);
		const sp = await stored(page, KEY_SPECIAL);
		const ex = await stored(page, KEY_EXAM);
		assert(sp && sp.imported === true, 'deck: imported は取り込んだ special のキーへ書き戻る', sp && sp.imported);
		assert(ex && !ex.imported, 'deck: 閉じただけの exam のキーは未取り込みのまま', ex && ex.imported);
		assert(!(await bannerState(page)).visible, 'deck: 両方さばいたのでバナーは消える');

		// storage リスナが :exam も通すこと。同一オリジンの別ページから書く（storage イベントは他の文書に飛ぶ）
		const page2 = await ctx.newPage();
		await page2.goto(base + '/css/styleguide.html', { waitUntil: 'load' });
		await page2.evaluate(({ k, p }) => localStorage.setItem(k, JSON.stringify(p)), { k: KEY_EXAM, p: mkPayload('exam', 'ho_exam_3', '2026-09-11T11:00:00.000Z') });
		await page.waitForTimeout(500);
		b = await bannerState(page);
		assert(b.visible && b.title === 'UmaExam OCRの判定結果があります', 'deck: 別ページが examキーへ書くと storage イベントでバナーが出る', b);
		assert(errors.length === 0, 'deck: 2ソースの受け取りでコンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	}

	/* --- 3) special の方が新しい／source が欠けた payload --- */
	{
		const noSource = mkPayload('exam', 'ho_unknown_1', '2026-09-11T09:00:00.000Z');
		delete noSource.source;
		const { ctx, page, errors } = await openWithHandoffs([
			[KEY_SPECIAL, mkPayload('special', 'ho_special_2', '2026-09-11T10:00:00.000Z')],
			[KEY_EXAM, noSource],
		]);
		let b = await bannerState(page);
		assert(b.visible && b.title === 'UmaStar OCRの判定結果があります', 'deck: special の方が新しければ special が先', b);
		await page.click('[data-ocr-act="dismiss"]');
		await page.waitForTimeout(300);
		b = await bannerState(page);
		assert(b.visible && b.title === 'OCRの判定結果があります', 'deck: source が欠けた payload は「OCR」とだけ出る', b);
		assert(errors.length === 0, 'deck: コンソールエラーなし（3）', errors.slice(0, 3));
		await ctx.close();
	}
}

/* ============================================================
 * 失敗時の案内（版ずれ・CDN遮断）が実際に出るか
 * ============================================================ */
{
	// 1) 共通CSSの版がずれている場合（3ファイルのうち shell.css だけが古い、という取り残しも捕まえる）
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	const warns = [];
	page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
	const css = await (await fetch(base + '/css/shell.css')).text();
	await page.route('**/css/shell.css*', (r) => r.fulfill({
		contentType: 'text/css; charset=utf-8',
		body: css.replace(/--uma-shell-css-version:\s*"[^"]+"/, '--uma-shell-css-version: "0000-00-00z"'),
	}));
	await page.goto(base + '/special.html', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1800);
	assert(warns.some((w) => w.includes('shell.css が古い版です')), '版ずれを検出して警告が出る（shell.css だけ古い）');
	assert(!warns.some((w) => w.includes('tokens.css が古い版です')), '版が合っている tokens.css は警告に含めない');
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
