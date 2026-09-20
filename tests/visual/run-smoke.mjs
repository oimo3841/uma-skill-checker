// 外観を変えたあと、操作が壊れていないかを確認する機能スモークテスト。
//
//   npm run test:visual
//
// 特に「JSがクラスを付け外しする箇所」「hidden の付け外し」を通す。
// 見た目の統一作業で最も壊れやすいのがここで、目視では気付きにくい。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer, REPO_ROOT } from './lib/serve.mjs';
import { openPage, seedSpecialResults, COMMON_CSS_VERSION, RECORD_ID, TEMPLATE_ID, PICK, EDITED_CELLS, USER_DATA } from './lib/fixtures.mjs';

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
	// 片道化（2026-09-15・C-32）で新UIに「旧UIへ」は出なくなったので、旧UIへは
	// 保存値 'old' を直接セットして開き直す（モーダルを閉じて既読になった後なら保存値が効く）。
	await page.waitForTimeout(2500);
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	await page.evaluate(() => localStorage.setItem('uma-special-ui-mode', 'old'));
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForTimeout(2000);

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
	// 展開の遅延は下（メインボタンに近い側）から 0 / .03 / .06 秒。exam が4項目になっても special の3項目はこのまま
	const fabDelays = await page.evaluate(() => {
		const nav = document.getElementById('fab-nav');
		nav.classList.add('open');
		const d = Array.from(nav.querySelectorAll('.uma-fab-item')).map((b) => getComputedStyle(b).transitionDelay);
		nav.classList.remove('open');
		return d;
	});
	assert(fabDelays.join(',') === '0.06s,0.03s,0s', 'special: 右下ナビの3項目の展開の遅延が従来どおり', fabDelays);
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

	/* --- 新UIのスキルセット：帯のタブ（先頭の「＋ 新規（ドラフト）」）と、その場の編集（C-53） ---
	   呼び名は core の DRAFT_LABEL 1か所から来る（C-66）。②のタブと①の「除外する周回
	   スキルセットを選ぶ」で「新規」と「ドラフト」に食い違っていたのを揃えた。 */
	const draftTab = await page.evaluate(() => {
		const p = document.getElementById('deck-template-panel');
		const tab = p.querySelector('.uma-subtab[data-tab-id="__draft__"]');
		return {
			label: tab.querySelector('.uma-subtab-label').textContent, selected: tab.getAttribute('aria-selected'),
			tabs: p.querySelectorAll('.uma-subtab').length,
			hasOld: !!p.querySelector('[data-usd-act="template-open"], [data-usd-act="draft-open"], [data-usd-el="template-radio"]'),
			placeholder: p.querySelector('[data-usd-el="name-input"]').placeholder,
			dupHidden: p.querySelector('[data-usd-el="dup-btn"]').hidden, delHidden: p.querySelector('[data-usd-el="del-btn"]').hidden,
			// 最下段の注記は C-62 の (7) で削除した。要素ごと無いことを見る
			note: !!p.querySelector('[data-usd-el="editor-note"]')
		};
	});
	assert(draftTab.label === '＋ 新規（ドラフト）' && draftTab.selected === 'true',
		'special: 先頭のタブは「＋ 新規（ドラフト）」で、最初はそれが選ばれている', draftTab);
	assert(!draftTab.hasOld, 'special: 「開く」・ラジオ・ドラフトの行は無い（タブで選んでその場で編集する）', draftTab);
	// 名前欄の呼び名は core の setLabel（C-1）。special は「因子セット」、Deck 単体ページは「スキルセット」。
	// **ここが「スキルセット」に戻ったら、core の文字列を一律置換してしまった印。**
	assert(draftTab.placeholder === '新しい因子セットの名前' && draftTab.dupHidden && draftTab.delHidden,
		'special: 「＋ 新規（ドラフト）」では名前欄が「新しい因子セットの名前」で、複製・削除は出ない', draftTab);
	assert(draftTab.note === false, 'special: ②のパネル最下段の注記は無い（C-62 の (7) で削除）', draftTab.note);

	/* --- C-1: 改称と枠組み（②＝「因子セット」／その中の A＝「スキルセット」） ---
	   入れ子の呼び名を検査で固定する。**②の見出しが「スキルセット（…）」に戻っていたら、
	   core の setLabel を通していない**（＝一律置換してしまった）印。 */
	const c1 = await page.evaluate(() => {
		const p = document.getElementById('deck-template-panel');
		const head = p.querySelector('[data-usd-el="head"] .usd-roster-h--top');
		const secA = p.querySelector('[data-usd-el="section-a"]');
		const body = secA && secA.querySelector('.uma-section-body');
		return {
			// 件数は代表データの件数に依るので、呼び名だけを見る（数字は N に潰す）
			head: head ? head.textContent.replace(/\s+/g, '').replace(/\d+/g, 'N') : null,
			tabsAria: p.querySelector('.uma-subtabs') ? p.querySelector('.uma-subtabs').getAttribute('aria-label') : null,
			// A の見出しは setLabel を通さない（special でも「スキルセット」のまま）
			secAHead: secA ? secA.querySelector('.uma-section-head').textContent : null,
			// 囲んだだけで、中身の data-usd-el は section-a の下に全部そろっている
			inA: secA ? ['tier-row', 'selected-list', 'mode-delete', 'mode-reclass', 'selected-count', 'clear-skills']
				.every(k => !!secA.querySelector('[data-usd-el="' + k + '"]')) : false,
			entryInA: !!(secA && secA.querySelector('.usd-entry-row')),
			bodyGap: body ? getComputedStyle(body).rowGap : null,
			headGap: secA ? getComputedStyle(secA).rowGap : null,
			// 名前の行（保存・複製・削除）は A の外＝セット全体の操作
			nameRowOutside: !!p.querySelector('.usd-tm-name-row') && !(secA && secA.querySelector('.usd-tm-name-row'))
		};
	});
	assert(c1.head === '因子セット（N／N件）' && c1.tabsAria === '因子セット',
		'C-1: ②の見出しと帯のタブが「因子セット」（core の setLabel 経由）', c1);
	assert(c1.secAHead === 'スキルセット',
		'C-1: ②の中の A の見出しは「スキルセット」（入れ物の呼び名とは別。setLabel を通さない）', c1.secAHead);
	assert(c1.inA && c1.entryInA && c1.nameRowOutside,
		'C-1: 入口・分類・スキルパネルは [data-usd-el="section-a"] の中、名前の行はその外', c1);
	assert(c1.headGap === '8px' && c1.bodyGap === '12px',
		'C-1: 見出しと中身の間（8px）は、中身どうしの間（12px）より詰まっている', c1);
	const clearBtn = await page.evaluate(() => {
		const btn = document.querySelector('#deck-template-panel [data-usd-el="clear-skills"]');
		const entryRow = document.querySelector('#deck-template-panel .usd-entry-row');
		const n = Number(document.querySelector('#deck-template-panel [data-usd-el="selected-count"]').textContent);
		const del = document.querySelector('#deck-template-panel [data-usd-el="mode-delete"]');
		const reclass = document.querySelector('#deck-template-panel [data-usd-el="mode-reclass"]');
		return { exists: !!btn, hidden: btn ? btn.hidden : null, disabled: btn ? btn.disabled : null, count: n,
			label: btn ? btn.textContent.trim() : null,
			inEntryRow: !!(btn && entryRow && entryRow.contains(btn)),
			modes: !!del && !!reclass, modesOff: del && reclass && del.getAttribute('aria-pressed') === 'false' && reclass.getAttribute('aria-pressed') === 'false',
			modesDisabled: del && reclass && del.disabled && reclass.disabled };
	});
	// C-3: 「− 追加済みスキルを全て削除」は A の入口の並びに**常時見えている**（削除モードに入らない）
	assert(clearBtn.exists && !clearBtn.hidden && clearBtn.label === '追加済みスキルを全て削除' && clearBtn.inEntryRow,
		'C-3: 一括削除は A の入口の並びに常時見えている', clearBtn);
	assert(clearBtn.modes && clearBtn.modesOff, 'special: 「再分類」「削除」のモードのボタンがあり、既定は両方 OFF', clearBtn);
	assert(clearBtn.count === 0 && clearBtn.modesDisabled && clearBtn.disabled,
		'C-3: 0種のときはモードのボタンも一括削除も押せない', clearBtn);

	/* 選んだときに出る名前（getSelection().name）もタブと揃っていること。
	   ドラフトは空だと選べないので、「テキストで検索」で実際に1件入れてから確かめる
	   （ついでに、貼り付け→追加の一連が通ることも見ている）。 */
	await page.click('#deck-template-panel [data-usd-act="editor-pick-text"]');
	await page.waitForTimeout(700);
	await page.fill('[data-usd-el="paste-input"]', '右回り○');
	await page.click('[data-usd-act="paste-run"]');
	await page.waitForTimeout(500);
	await page.click('[data-usd-act="picker-add"]');
	await page.waitForTimeout(500);
	// ボタンの中の「XX種追加済み」は編集中のセットの総数なので、
	// 背後の「追加済みスキル（XX種）」と必ず同じ数になる（スマホでは片方しか見えない）
	const draftFoot = await page.evaluate(() => {
		const count = document.querySelector('#deck-template-panel [data-usd-el="selected-count"]');
		return {
			label: document.querySelector('[data-usd-el="picker-commit"]').textContent,
			heading: count.parentElement.textContent.trim(),
			n: count.textContent
		};
	});
	assert(draftFoot.heading === '追加済みスキル（1種）',
		'special: 見出しが「追加済みスキル（N種）」', draftFoot.heading);
	assert(draftFoot.label === 'チェックしたスキルを追加（' + draftFoot.n + '種追加済み）',
		'special: ボタンの「XX種追加済み」が背後の見出しと同じ数', draftFoot);
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);
	const draftPicked = await page.evaluate(() => ({
		count: document.querySelector('#deck-template-panel [data-usd-el="selected-count"]').textContent,
		note: document.getElementById('deck-selected-note').textContent,
		tab: document.querySelector('#deck-template-panel .uma-subtab[data-tab-id="__draft__"]').textContent.trim()
	}));
	assert(draftPicked.count === '1', 'special: 貼り付けたスキルがドラフトに入る', draftPicked);
	assert(draftPicked.note === '✓ 「新規（ドラフト）」の1種を照合します',
		'special: 中身ができたドラフトはそのまま照合対象になり、案内にも同じ呼び名が出る', draftPicked);
	assert(draftPicked.tab === '＋ 新規（ドラフト）1種', 'special: 「＋ 新規（ドラフト）」のタブに件数が出る', draftPicked);

	// Deck まわりはここまで。以降は旧UIに戻して確かめる。
	// 片道化（C-32）で新UIから旧UIへは入れないので、保存値 'old' で開き直す
	// （ここから先の検査は仕込んだ結果に依存しない）。
	await page.evaluate(() => localStorage.setItem('uma-special-ui-mode', 'old'));
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForTimeout(2000);

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

	// 親A／親Bセットは帯のタブで切り替える（C-54）。B のタブを押すと B のパネルだけが見える
	const setTabs = await page.evaluate(() => [...document.querySelectorAll('#personset-tabs .uma-subtab')].map(t => ({
		label: t.querySelector('.uma-subtab-label').textContent, selected: t.getAttribute('aria-selected'), tinted: t.classList.contains('uma-subtab--tinted') })));
	assert(setTabs.length === 2 && setTabs[0].label === '親Aセット' && setTabs[0].selected === 'true' && setTabs[1].label === '親Bセット' && setTabs.every(t => t.tinted),
		'special: ③に親A／親Bセットのタブがあり、既定は親A', setTabs);
	await page.click('#personset-tabs .uma-subtab[data-tab-id="1"]');
	await page.waitForTimeout(300);
	assert(await page.isVisible('#personset-B-wrap') && !(await page.isVisible('#personset-A-wrap')), 'special: 親Bセットのタブで B のパネルだけが見える');
	// 隠れている側の状況が分かるよう、②のタブにアップロード枚数を出す
	const imgBadge = await page.evaluate(() => {
		const el = document.getElementById('image-count-badge');
		return { hidden: el.hidden, text: el.textContent };
	});
	assert(imgBadge.hidden === true, 'special: 画像が無いうちは②の枚数バッジを出さない', imgBadge);

	/* --- 新UI／旧UIの切り替え表示 ---
	 * 片道化（2026-09-15・C-32）: 新UIに「旧UIへ」は出さない。旧UIには「新UIへ」（出口）と
	 * 更新終了の注記 #old-ui-end-note を常時出す。旧UIの DOM・ロジックは残っている（削除は未実施）。
	 *
	 * 【片道化で書き換えた検査の記録】（run-verify.mjs の INTENTIONALLY_REMOVED と同じ要領で残す）
	 *   新UIから「旧UIへ」を押す手順を含んでいた検査は、保存値 'old' を直接セットして開き直す形に
	 *   書き換えた。書き換えで通らず外した検査は無い。
	 *   - special 本体（上）: 仕込み前に旧UIへ入る手順 → 保存値 'old' ＋ reload
	 *   - special 本体（ここ）: 「旧UIへ戻ると表示も元に戻る」「Deckの入口も引っ込む」の往復 → 保存値 'old' ＋ reload で同じ表示を見る
	 *   - special 告知ブロック: 「旧UIへ切り替え → 選んだUIが保存される」 → 保存値 'old' ＋ reload。
	 *     保存のほうは逆向き（旧UI →「新UIへ」で 'new' が保存される）で見る
	 *   - exam 告知ブロック: 「旧UIへ：中身が本文のカードへ移る」 → 保存値 'old' ＋ reload ＋ 結果の仕込み
	 *   - exam タブの記憶: 「旧UI → 新UIへ戻しても覚えたタブを開く」 → 保存値 'old' ＋ reload →「新UIへ」
	 *   - run-capture.mjs: special の仕込み・旧UIの撮影も同じ手
	 *   exitNewUi() / exitDeckMode() を直接呼ぶ検査（結合画像の保存名。C-25）は落ちないのでそのまま。
	 * 【方針】旧UIの検査はカナリアとして残すが、今後、共有部分の変更で旧UIの検査が落ちたときの既定は
	 *   「検査を外して記録に残す」（旧UIは動作保証の範囲外）。新UI向けの新しい検査を旧UIにも足すことはしない。
	 */
	const uiState = () => page.evaluate(() => ({
		label: document.getElementById('deck-mode-btn-label').textContent,
		badge: !document.getElementById('ui-mode-badge').hidden,
		title: document.getElementById('step1-title').textContent,
		btnShown: !document.getElementById('deck-mode-btn').hidden,
		note: !document.getElementById('old-ui-end-note').hidden
	}));
	const oldUi = await uiState();
	assert(oldUi.label === '新UIへ' && oldUi.badge === false && oldUi.btnShown,
		'special: 保存値 old で開くと旧UIで、ボタンは「新UIへ」として出る・バッジは出さない', oldUi);
	assert(oldUi.note, 'special: 旧UIでは更新終了の注記が出る', oldUi);
	const noteText = await page.evaluate(() => ({
		text: document.getElementById('old-ui-end-note').textContent.replace(/\s+/g, ''),
		closeBtn: !!document.querySelector('#old-ui-end-note button'),
		visible: document.getElementById('old-ui-end-note').getClientRects().length > 0,
		bg: getComputedStyle(document.getElementById('old-ui-end-note')).backgroundColor,
		opacity: getComputedStyle(document.getElementById('old-ui-end-note')).opacity
	}));
	assert(noteText.text.includes('この画面は更新を終了しました')
		&& noteText.text.includes('今後、新しい機能はこの画面には追加されません。画面上部の「新UIへ」から、最新の画面に切り替えられます。'),
		'special: 注記の文面が決めたとおり', noteText);
	assert(!noteText.closeBtn && noteText.visible, 'special: 注記に閉じるボタンは無く、実際に描画されている', noteText);
	assert(noteText.bg === 'rgb(255, 251, 235)' && noteText.opacity === '1',
		'special: 注記の地は警告の色（不透明）で opacity を使っていない', noteText);

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
		'special: 新UIに入るとボタンのラベルが「旧UIへ」になり「新UI」バッジが出る', newUi);
	assert(!newUi.btnShown && !newUi.note,
		'special: 新UIでは「旧UIへ」を出さず、更新終了の注記も出ない（片道化）', newUi);
	assert(!(await page.isVisible('#deck-mode-btn')), 'special: 隠した「旧UIへ」は実際に描画されない（F-13）');
	assert(newUi.title === '周回因子セット', 'special: 新UIの①の見出しが短縮されている', newUi.title);
	assert((await stepState()).panel1, 'special: 新UIへ切り替えると①が開いた状態になる');
	// 往復（新UI →「旧UIへ」）は片道化で無くなった。保存値 'old' で開き直して同じ表示を見る
	await page.evaluate(() => localStorage.setItem('uma-special-ui-mode', 'old'));
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForTimeout(2000);
	const backUi = await uiState();
	assert(backUi.label === '新UIへ' && backUi.badge === false && backUi.title === 'スキルリストを入力' && backUi.btnShown && backUi.note,
		'special: 保存値 old で開き直すと旧UIの表示に戻る（「新UIへ」と注記が出る）', backUi);
	const backEntry = await deckEntry();
	assert(backEntry.fab === false && backEntry.note === false,
		'special: 旧UIで開き直すとDeckの入口（FAB・取り込み案内）も出ない', backEntry);

	// 375px で横スクロールが出ていないこと
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(500);
	const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
	assert(ov.sw === ov.cw, 'special: 375px で横スクロールが出ない', ov);

	/* ①のタブに「除外N種」のバッジが入ったので（C-63 の (2)）、375px でタブの名前が
	   潰れていないことを見る。3等分（flex: 1 1 0）のままだと**ラベルが1文字まで削られた**ので、
	   中身を基準に縮める形（flex: 1 1 auto）＋狭い画面での余白の詰めを入れてある。
	   ここでは①のタブが他より広く取れていること（＝バッジのぶんを取り戻していること）と、
	   ラベルに文字が残っていることを見る。 */
	const narrowTabs = await page.evaluate(() => {
		// バッジが出るのは新UIだけなので、いったん新UIへ戻して測る
		localStorage.setItem('uma-special-ui-mode', 'new');
		return null;
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForTimeout(2500);
	const tabW = await page.evaluate(() => {
		// ②にも件数バッジが出ている状態（いちばん幅が苦しい）で見る
		const b = document.getElementById('skill-count-badge');
		b.textContent = '12種'; b.classList.remove('hidden');
		const tabs = [...document.querySelectorAll('.step-tab')].filter((t) => !t.hidden);
		return {
			n: tabs.length,
			badgeShown: !document.getElementById('deck-roster-excluded').hidden,
			// ラベルが省略（…）されていないこと。scrollWidth > clientWidth なら切れている
			clipped: tabs.map((t) => {
				const l = t.querySelector('.step-tab-label');
				return l.scrollWidth > l.clientWidth + 1;
			}),
			labels: tabs.map((t) => t.querySelector('.step-tab-label').textContent),
			overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
		};
	});
	assert(tabW.n === 3 && tabW.badgeShown, 'special(375px): ①②③の3つのタブと「除外N種」が出ている', tabW);
	// ①（「除外N種」を持つタブ）の名前が「…」で切れないことが、この直しの眼目。
	// ③はもともといちばん長い名前で、バッジが無くても切れることがある（ここでは見ない）。
	assert(tabW.clipped[0] === false && tabW.clipped[1] === false,
		'special(375px): バッジを持つ①②の名前が「…」で切れない（バッジは名前の下へ回る）', tabW);
	assert(!tabW.overflow, 'special(375px): タブを折り返しても横スクロールは出ない', tabW);
	await page.evaluate(() => localStorage.setItem('uma-special-ui-mode', 'old'));

	assert(errors.length === 0, 'special: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * special.html — 「画像から読み取る」の口（openSkillRowsPicker。スキルセットOCR フェーズa コミット3）
 *
 * 外で照合を済ませた行（ID付きの候補一覧）を core に渡し、「テキストで検索」と同じ報告
 * （候補チップ・取り消し・確定）が動くことを見る。入口のボタンはコミット4なので、ここでは口を直接呼ぶ。
 * 行の形は matchPastedSkillText() と同じ。autoAccepted:true の review 行は最初から選択に入る（決定 B-2）。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	await page.waitForTimeout(2500);
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	// マスター445種が読めてから（名前→ID の解決に使う）
	await page.waitForFunction(() => UmaSkillDeckCore.matchPastedSkillText('右回り○').rows[0].kind === 'exact', null, { timeout: 15000 });

	const opened = await page.evaluate(() => {
		const m = UmaSkillDeckCore.matchPastedSkillText('右回り○\n左回り○\n春ウマ娘○\n夏ウマ娘○\n秋ウマ娘○');
		const id = (i) => m.rows[i].matchedId;
		const name = (i) => m.rows[i].matchedName;
		window.__rowsAdded = null;
		const rows = [
			// 完全一致 → 最初から選択に入る
			{ raw: name(0), norm: name(0), kind: 'exact', matchedId: id(0), matchedName: name(0), candidates: [{ id: id(0), name: name(0), distance: 0 }] },
			// 距離1で一意 → autoAccepted:true。選択に入った状態で「完全一致ではない行」に並ぶ
			{ raw: '左回りO', norm: '左回りO', kind: 'review', matchedId: id(1), matchedName: name(1), distance: 1, autoAccepted: true, reason: '距離1（完全一致ではない）',
				candidates: [{ id: id(1), name: name(1), distance: 1 }, { id: id(0), name: name(0), distance: 2 }] },
			// 同点3件 → 要確認。チップで選ぶ
			{ raw: '種ウマ娩○', norm: '種ウマ娩○', kind: 'review', matchedId: null, matchedName: null, distance: 1, autoAccepted: false, reason: '距離1で同点3件',
				candidates: [2, 3, 4].map((i) => ({ id: id(i), name: name(i), distance: 1 })) },
			// 候補なし → 要確認（カスタムスキルとして追加／無視）
			{ raw: '謎の読み', norm: '謎の読み', kind: 'none', matchedId: null, matchedName: null, distance: 3, candidates: [], reason: '距離3 > 許容1' }
		];
		UmaSkillDeckCore.openSkillRowsPicker([], (ids) => { window.__rowsAdded = ids.slice(); }, rows,
			{ white: 3, gold: 2, unreadable: 0 });
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		return {
			title: el('picker-title').textContent,
			paste: !el('mode-paste').hidden, filter: !el('mode-filter').hidden, custom: !el('mode-custom').hidden,
			inputHidden: el('paste-input-wrap').hidden,
			summary: el('paste-summary').hidden ? null : el('paste-summary').textContent,
			// 注記（paste-note）は 31セッション目に撤去した。枠ごと無いことを見る
			noteEl: !!el('paste-note'),
			footer: !el('picker-footer').hidden,
			count: el('picker-checked-count').textContent,
			approx: [...document.querySelectorAll('.usd-paste-approx .usd-paste-picked')].map((e) => e.textContent),
			pendingLabel: (document.querySelector('[data-usd-el="paste-report"] .usd-paste-warn') || {}).textContent || null,
			chips: [...document.querySelectorAll('.usd-paste-row:not(.usd-paste-approx) .usd-paste-cand')].map((e) => e.textContent),
			// 32セッション目: 「カスタムスキルとして追加」のチップは廃止し、行からは「入力して探す」だけになった
			finders: [...document.querySelectorAll('.usd-paste-row:not(.usd-paste-approx) [data-usd-act="paste-find"]')].map((e) => e.textContent),
			ids: { pick: id(2), exact: id(0), near: id(1) }
		};
	});
	assert(opened.title === '画像から読み取る' && opened.paste && !opened.filter && !opened.custom && opened.inputHidden && opened.footer,
		'special/ocr口: 「画像から読み取る」は貼り付けの枠を借り、貼り付け欄だけを隠してフッターを出す', opened);
	// 要約は Chat が確定した文面1（通常時）。タブの内訳・設定数は利用者向けには出さない（コミット4）。
	// 注記「※白スキルは「〇〇の目覚め」等を含みます」は 31セッション目に撤去（目覚め6種はこの画面に出ない）
	assert(opened.summary === '白スキル 3種を読み取りました。金スキル（約2種）は対象外です。' && opened.noteEl === false,
		'special/ocr口: (e) 要約（確定した文面1）が報告の先頭に出る。注記の枠は無い', { summary: opened.summary, noteEl: opened.noteEl });
	assert(opened.count === '2種選択' && opened.approx.length === 1 && opened.approx[0] === '左回り○',
		'special/ocr口: (a) 完全一致と autoAccepted の行が最初から選択済み、後者は「完全一致ではない行」に並ぶ', { count: opened.count, approx: opened.approx });
	// 32セッション目: 「近いスキルが見つかりませんでした」＋「カスタムスキルとして追加」の組み合わせを廃止し、
	// どの要確認の行にも「入力して探す」（画像を持つ行は「画像を見て入力」）を出す
	assert(opened.pendingLabel === '要確認 2件' && opened.chips.includes('春ウマ娘○')
		&& !opened.chips.includes('カスタムスキルとして追加') && opened.finders.length === 2,
		'special/ocr口: 要確認の行に候補チップは出るが「カスタムスキルとして追加」は出ず、各行に入力の入口が出る', { pending: opened.pendingLabel, chips: opened.chips, finders: opened.finders });

	// (b) 候補チップを押すと選び直せる（同点3件から1つを選ぶ → 3種選択）
	await page.click('.usd-paste-row:not(.usd-paste-approx) .usd-paste-cand[data-skill-id="' + opened.ids.pick + '"]');
	await page.waitForTimeout(300);
	const picked = await page.evaluate(() => ({
		count: document.querySelector('[data-usd-el="picker-checked-count"]').textContent,
		approx: [...document.querySelectorAll('.usd-paste-approx .usd-paste-picked')].map((e) => e.textContent)
	}));
	assert(picked.count === '3種選択' && picked.approx.includes('春ウマ娘○'),
		'special/ocr口: (b) 候補チップを押すと選び直せて、選択の数が増える', picked);

	// (c) 「取り消す」で autoAccepted の行の選択が外れる（3 → 2）
	await page.evaluate(() => {
		const row = [...document.querySelectorAll('.usd-paste-approx')].find((r) => r.querySelector('.usd-paste-picked').textContent === '左回り○');
		row.querySelector('[data-usd-act="paste-skip"]').click();
	});
	await page.waitForTimeout(300);
	const skipped = await page.evaluate(() => ({
		count: document.querySelector('[data-usd-el="picker-checked-count"]').textContent,
		approx: [...document.querySelectorAll('.usd-paste-approx .usd-paste-picked')].map((e) => e.textContent)
	}));
	assert(skipped.count === '2種選択' && !skipped.approx.includes('左回り○'),
		'special/ocr口: (c) 「取り消す」で自動採用の行の選択が外れる', skipped);

	// (d) 「チェックしたスキルを追加」で onAdd が呼ばれる（完全一致＋選び直した1件＝2件）
	await page.click('[data-usd-act="picker-add"]');
	await page.waitForTimeout(400);
	const added = await page.evaluate(() => window.__rowsAdded);
	assert(Array.isArray(added) && added.length === 2 && added.includes(opened.ids.exact) && added.includes(opened.ids.pick) && !added.includes(opened.ids.near),
		'special/ocr口: (d) 確定で onAdd に選んだIDだけが渡る', added);

	// 「テキストで検索」を開き直すと貼り付け欄が戻り、要約が消える（モードの後始末）
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(300);
	const back = await page.evaluate(() => {
		UmaSkillDeckCore.openTextSkillPicker([], () => {});
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		return { title: el('picker-title').textContent, inputHidden: el('paste-input-wrap').hidden, summaryHidden: el('paste-summary').hidden, report: el('paste-report').innerHTML.length };
	});
	assert(back.title === 'テキストで検索' && !back.inputHidden && back.summaryHidden && back.report === 0,
		'special/ocr口: 「テキストで検索」を開き直すと貼り付け欄が戻り、要約と前の報告が消える', back);
	await page.click('[data-usd-act="picker-close"]');

	/* ------------------------------------------------------------
	 * 候補を選んでもスクロール位置が飛ばないこと（31セッション目・実機で見つかった不具合）
	 *
	 * 報告（paste-report）は総入れ替えで描き直すので、その中のスクロール領域（.usd-paste-scroll）が
	 * 作り直されて scrollTop が 0 に戻っていた。要確認が複数あるとき、上から順に判断していく操作が
	 * できなくなる。要確認の行を12本作って下までスクロールしてから候補チップを押す。
	 * ---------------------------------------------------------- */
	const manyRows = () => {
		const master = UmaSkillDeckCore.getMasterSkills();
		const rows = [];
		for (let i = 0; i < 12; i++) {
			const a = master[i * 2], b = master[i * 2 + 1];
			rows.push({
				raw: 'あいまい' + i, norm: 'あいまい' + i, kind: 'review', matchedId: null, matchedName: null,
				distance: 1, autoAccepted: false, reason: '距離1で同点2件',
				candidates: [{ id: String(a.id), name: a.name, distance: 1 }, { id: String(b.id), name: b.name, distance: 1 }]
			});
		}
		return rows;
	};
	const scrollKept = await page.evaluate((src) => {
		const build = new Function('return ' + src)();
		UmaSkillDeckCore.openSkillRowsPicker([], () => {}, build(), { white: 0, gold: 0, unreadable: 0 });
		const area = () => document.querySelector('[data-usd-el="paste-report"] .usd-paste-scroll');
		const scrollable = area().scrollHeight - area().clientHeight;
		area().scrollTop = Math.round(scrollable / 2);
		const before = area().scrollTop;
		// いま見えている位置にある行の候補チップを押す（上端の行ではなく、スクロールした先の行）
		const rows = [...document.querySelectorAll('[data-usd-el="paste-report"] .usd-paste-row')];
		const target = rows.find((r) => r.offsetTop >= before) || rows[rows.length - 1];
		target.querySelector('[data-usd-act="paste-pick"]').click();
		const afterPick = area().scrollTop;
		// 「取り消す」でも同じ
		area().scrollTop = before;
		const approx = document.querySelector('[data-usd-el="paste-report"] .usd-paste-approx [data-usd-act="paste-skip"]');
		if (approx) approx.click();
		return { scrollable: scrollable, before: before, afterPick: afterPick, afterSkip: area().scrollTop };
	}, manyRows.toString());
	assert(scrollKept.scrollable > 0 && scrollKept.before > 0,
		'special/ocr口: 要確認が多いとき報告の中がスクロールする（検査の前提）', scrollKept);
	assert(scrollKept.afterPick === scrollKept.before,
		'special/ocr口: 候補チップを押してもスクロール位置が変わらない（上から順に判断できる）', scrollKept);
	assert(scrollKept.afterSkip === scrollKept.before,
		'special/ocr口: 「取り消す」でもスクロール位置が変わらない', scrollKept);
	await page.click('[data-usd-act="picker-close"]');

	// 「テキストで検索」（貼り付け）の要確認の行でも同じこと。core の同じ描画を通るため。
	// マスターの名前の末尾に1文字足して距離1にし、候補チップが出る要確認の行を作る
	const scrollKeptPaste = await page.evaluate(() => {
		const names = UmaSkillDeckCore.getMasterSkills().map((s) => s.name).filter((n) => n.length >= 4).slice(0, 12);
		UmaSkillDeckCore.openTextSkillPicker([], () => {});
		document.querySelector('[data-usd-el="paste-input"]').value = names.map((n) => n + 'ヌ').join('\n');
		document.querySelector('[data-usd-act="paste-run"]').click();
		const area = () => document.querySelector('[data-usd-el="paste-report"] .usd-paste-scroll');
		if (!area()) return { skipped: '報告にスクロール領域が無い' };
		const scrollable = area().scrollHeight - area().clientHeight;
		area().scrollTop = Math.round(scrollable / 2);
		const before = area().scrollTop;
		const chip = [...document.querySelectorAll('[data-usd-el="paste-report"] [data-usd-act="paste-pick"]')]
			.find((b) => b.offsetTop >= before);
		if (!chip) return { skipped: '押せる候補チップが見えていない', scrollable: scrollable, before: before };
		chip.click();
		return { scrollable: scrollable, before: before, after: area().scrollTop };
	});
	assert(!scrollKeptPaste.skipped && scrollKeptPaste.before > 0 && scrollKeptPaste.after === scrollKeptPaste.before,
		'special/テキストで検索: 候補チップを押してもスクロール位置が変わらない（core の同じ描画を通る）', scrollKeptPaste);
	await page.click('[data-usd-act="picker-close"]');

	/* ------------------------------------------------------------
	 * (B)「テキストで検索」側でも同じ「名前を入れて探す」が使える（32セッション目）
	 * 画像が無いので、ボタンの名前は「入力して探す」・サブ画面に画像は出ない。
	 * ---------------------------------------------------------- */
	const finderPaste = await page.evaluate(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		UmaSkillDeckCore.openTextSkillPicker([], () => {});
		el('paste-input').value = 'まったく当たらない文字列';
		document.querySelector('[data-usd-act="paste-run"]').click();
		const btn = document.querySelector('[data-usd-el="paste-report"] [data-usd-act="paste-find"]');
		const label = btn ? btn.textContent : null;
		const noCustomChip = !document.querySelector('[data-usd-el="paste-report"] [data-usd-act="paste-custom"]');
		const noHint = !/近いスキルが見つかりませんでした/.test(el('paste-report').textContent);
		if (btn) btn.click();
		const target = UmaSkillDeckCore.getMasterSkills().find((s) => s.name.length >= 4);
		const input = el('find-input');
		input.value = target.name.slice(0, 2);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await wait(260);
		const out = {
			label: label, noCustomChip: noCustomChip, noHint: noHint,
			hasImg: !!el('find-img'), inputWrapHidden: el('paste-input-wrap').hidden,
			hits: document.querySelectorAll('.usd-name-hit').length
		};
		UmaSkillDeckCore.closeSkillPicker();
		return out;
	});
	assert(finderPaste.label === '入力して探す' && finderPaste.noCustomChip && finderPaste.noHint,
		'special/テキストで検索: 要確認の行から「カスタムスキルとして追加」と「近いスキルが…」が消え、「入力して探す」になった', finderPaste);
	assert(finderPaste.hasImg === false && finderPaste.inputWrapHidden === true && finderPaste.hits > 0,
		'special/テキストで検索: 画像なしの形で同じ入力欄が開き、部分一致の候補が出る', finderPaste);

	assert(errors.length === 0, 'special/ocr口: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * special.html — ステップ①の入口「スキルセット画面のスクショから読み取る」（スキルセットOCR フェーズa コミット4）
 *
 * OCR そのものは回さない（Tesseract の言語データと実画像が要る）。読み取りの結果（runSkillsetOcr の戻り値の形）を
 * showSkillsetScreenshotResult に直接渡し、押す → ピッカーが ocr モードで開く → 追加が対象スキルセット（ドラフト）に入る
 * → 「元に戻す」で戻る、を見る。文面は Chat が確定したもの（HANDOFF C-24「確定した文面4件」）と一字一句同じであること。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	await page.waitForTimeout(2500);
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	await page.waitForFunction(() => UmaSkillDeckCore.matchPastedSkillText('右回り○').rows[0].kind === 'exact', null, { timeout: 15000 });

	// 入口は編集画面の入口の並びに出る（改訂: 「テキストで検索」と「収録されていないスキルを追加」の間。
	// ラベル「スキルセットのスクショで追加」、アイコンはアップロード枠と同じ upload-cloud、隣に「?」＝撮影ガイド）。
	// 一覧の画面には無い。ドラフトの編集を開いてから見る。
	// 編集画面のマークアップは一覧と同じコンテナに hidden で同居するので、「見えているか」で見る
	// 入口は常に見えている（C-53: 別画面の編集ビューは無く、タブで選んだものをその場で編集する）
	assert(await page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-act="editor-pick-screenshot"]'); return !!b && b.offsetParent !== null; }),
		'special/ocr入口: 入口が入口の並びに見えている');
	const entry = await page.evaluate(() => {
		const row = document.querySelector('#deck-template-panel .usd-entry-row');
		const buttons = [...row.querySelectorAll('button')].map((b) => ({ act: b.dataset.usdAct, label: b.textContent.trim(), cls: b.className, icon: (b.querySelector('svg, i') || {}).getAttribute ? (b.querySelector('svg, i').getAttribute('data-lucide') || b.querySelector('svg, i').getAttribute('class')) : null }));
		const btn = row.querySelector('[data-usd-act="editor-pick-screenshot"]');
		const input = document.getElementById('deck-ocr-files');
		window.__filePickerOpened = 0;
		input.click = () => { window.__filePickerOpened++; };
		const guide = () => !document.getElementById('skillset-guide-box').hidden;
		const before = guide();
		btn.click();                                  // 入口 → 撮影ガイド（アップロードの画面）が開く。ファイル選択はまだ
		const opened = guide();
		const openedWithoutPicker = window.__filePickerOpened;
		const guideText = document.querySelector('#skillset-guide-box .help-body p').textContent;
		const img = document.getElementById('skillset-guide-img');
		document.getElementById('skillset-guide-pick').click(); // 「スクショを選ぶ」→ ガイドが閉じてファイル選択が開く
		const afterPick = { guide: guide(), picker: window.__filePickerOpened };
		btn.click();                                  // もう一度押せば毎回ガイドが出る（初回だけにしない）
		const helpOpened = guide();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // Esc で閉じる
		const afterEsc = guide();
		return {
			order: buttons.map((b) => b.act),
			label: btn.textContent.trim(), cls: btn.className,
			icon: buttons.find((b) => b.act === 'editor-pick-screenshot').icon,
			noHelp: !row.querySelector('[data-usd-act="editor-pick-screenshot-help"]'),
			// 参考画像は SKILLSET_GUIDE_IMAGE が空のあいだは出さない（src も付けない＝404 を出さない）。パスが入れば src が付いて見える
			before, opened, openedWithoutPicker, guideText, imgAlt: img.getAttribute('alt'),
			imgOk: SKILLSET_GUIDE_IMAGE ? (img.getAttribute('src') === SKILLSET_GUIDE_IMAGE && !img.hidden) : (!img.getAttribute('src') && img.hidden),
			afterPick, helpOpened, afterEsc,
			input: { hidden: input.hidden, multiple: input.multiple, accept: input.accept },
			progressHidden: document.getElementById('deck-ocr-progress').hidden,
			warnHidden: document.getElementById('deck-ocr-warn').classList.contains('hidden')
		};
	});
	// 「?」は外した（入口を押せば必ずガイドが出るので情報を足さず、スマホ幅で並びが崩れたため）
	// C-3 で末尾に一括削除（editor-clear-skills）が並んだ
	assert(entry.order.join(',') === 'editor-pick,editor-pick-text,editor-pick-screenshot,editor-pick-custom,editor-clear-skills'
		&& entry.label === 'スキルセットのスクショで追加' && entry.cls.includes('uma-btn--secondary') && entry.noHelp,
		'special/ocr入口: 「テキストで検索」と「収録されていないスキルを追加」の間に、同じ見た目で「スキルセットのスクショで追加」が出る（「?」は無い）', { order: entry.order, label: entry.label });
	assert(entry.icon === 'upload-cloud' || String(entry.icon).includes('lucide-upload-cloud'),
		'special/ocr入口: アイコンはアップロード枠と同じ upload-cloud（雲＋上矢印）', entry.icon);
	assert(!entry.before && entry.opened && entry.openedWithoutPicker === 0
		&& entry.guideText.includes('「スキルセット詳細」画面') && entry.imgOk && entry.imgAlt,
		'special/ocr入口: 押すと撮影ガイド（スキルセット詳細画面の例＋説明）が先に開き、ファイル選択はまだ開かない', { text: entry.guideText, imgOk: entry.imgOk });
	assert(!entry.afterPick.guide && entry.afterPick.picker === 1 && entry.input.hidden && entry.input.multiple && entry.input.accept === 'image/*',
		'special/ocr入口: ガイドの「スクショを選ぶ」でガイドが閉じ、画像のファイル選択（複数）が開く', { afterPick: entry.afterPick, input: entry.input });
	assert(entry.helpOpened && !entry.afterEsc && entry.progressHidden && entry.warnHidden,
		'special/ocr入口: 入口を押すたびにガイドが出て（初回だけにしない）、Esc で閉じる。進捗と知らせの枠は閉じたまま', { again: entry.helpOpened, afterEsc: entry.afterEsc });

	// 読み取りの結果（合成）: 完全一致1・自動採用1・要確認1、金2種、読めない1枚、小さすぎる画像1、カードが見つからない画像1
	const shown = await page.evaluate(() => {
		const m = UmaSkillDeckCore.matchPastedSkillText('右回り○\n左回り○\n春ウマ娘○');
		const id = (i) => m.rows[i].matchedId, name = (i) => m.rows[i].matchedName;
		const rows = [
			{ raw: name(0), norm: name(0), kind: 'exact', matchedId: id(0), matchedName: name(0), candidates: [{ id: id(0), name: name(0), distance: 0 }] },
			{ raw: '左回りO', norm: '左回りO', kind: 'review', matchedId: id(1), matchedName: name(1), distance: 1, autoAccepted: true, reason: '距離1（完全一致ではない）', candidates: [{ id: id(1), name: name(1), distance: 1 }] },
			{ raw: '謎の読み', norm: '謎の読み', kind: 'none', matchedId: null, matchedName: null, distance: 3, candidates: [], reason: '距離3 > 許容1' }
		];
		window.__ocrIds = [id(0), id(1)];
		showSkillsetScreenshotResult({
			rows: rows, white: { accepted: 2, review: 1, unreadable: 1, ids: [id(0), id(1)] }, gold: { kinds: 2, cards: 3 }, unknown: 0,
			tabs: [{ index: 0, images: 3, detected: 6, lavender: 4, gold: 2, unknown: 0, badgeCount: 61 }],
			quality: { skipped: [{ name: 'small.png', kinds: ['too-small'] }], warned: [] },
			inkHeight: { median: 23 }, log: ['a.png 1179x2556 / 画質 OK'],
			perImage: [
				{ name: 'a.png', quality: { ok: true }, kindCounts: { lavender: 4, gold: 2, unknown: 0 } },
				{ name: 'other.png', quality: { ok: true }, kindCounts: { lavender: 0, gold: 0, unknown: 0 } },
				{ name: 'small.png', quality: { ok: false }, kindCounts: { lavender: 0, gold: 0, unknown: 0 } }
			]
		});
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		return {
			open: !el('picker-title').closest('.usd-modal').hidden,
			title: el('picker-title').textContent,
			summary: el('paste-summary').hidden ? null : el('paste-summary').textContent,
			noteEl: !!el('paste-note'),
			count: el('picker-checked-count').textContent,
			warn: document.getElementById('deck-ocr-warn').classList.contains('hidden') ? null : document.getElementById('deck-ocr-warn-content').textContent,
			panelsHidden: document.getElementById('deck-ocr-panels').classList.contains('hidden'),
			selection: deckTemplateManager.getSelection(),
			undo: document.getElementById('deck-undo-btn').style.display,
			devLog: skillsetOcrDevLog.join('\n')
		};
	});
	assert(shown.open && shown.title === '画像から読み取る' && shown.count === '2種選択',
		'special/ocr入口: 結果を渡すとピッカーが ocr モードで開き、完全一致と自動採用の2種が選択済み', { open: shown.open, title: shown.title, count: shown.count });
	// 確定文面4a は 31セッション目に廃止（読み取れなかったパネルは数ではなく画像で見せる）。要約は文面1だけ
	assert(shown.summary === '白スキル 2種を読み取りました。金スキル（約2種）は対象外です。' && shown.noteEl === false,
		'special/ocr入口: 要約は文面1だけ（4aは廃止・注記の枠も無い。タブの内訳・設定数も出ない）', { summary: shown.summary, noteEl: shown.noteEl });
	assert(shown.panelsHidden === true,
		'special/ocr入口: unreadableRows が無いときは「読み取れなかったスキルパネル」の区画を出さない', shown.panelsHidden);
	assert(shown.warn !== null
		&& shown.warn.includes('次の画像は、ゲーム画面が小さすぎて読み取れませんでした。\n・スキルセット画面: small.png')
		&& shown.warn.includes('次の画像からは、スキルセット画面のスキルが見つかりませんでした。\n・other.png\nスキルセット画面のスクリーンショットかどうか、ご確認ください。'),
		'special/ocr入口: 画像単位の知らせ（4b-1 は既存の文・4b-2 は専用の文）が入口の下に出る', shown.warn);
	assert(shown.devLog.includes('設定数61') && shown.devLog.includes('タブ1') && shown.devLog.includes('読めない1枚'),
		'special/ocr入口: タブの内訳・設定数は開発ログにだけ残る', shown.devLog);
	assert(shown.selection === null && shown.undo === 'none',
		'special/ocr入口: 追加する前は対象スキルセットが空で「元に戻す」も出ていない', { selection: shown.selection, undo: shown.undo });

	// 「チェックしたスキルを追加」→ ドラフト（対象スキルセット）に入って選択され、「元に戻す」が出る
	await page.click('[data-usd-act="picker-add"]');
	await page.waitForTimeout(500);
	const added = await page.evaluate(() => ({
		ids: window.__ocrIds,
		selection: deckTemplateManager.getSelection(),
		undo: document.getElementById('deck-undo-btn').style.display,
		undoCount: document.getElementById('deck-undo-count').textContent,
		note: document.getElementById('deck-selected-note').textContent
	}));
	assert(added.selection && added.selection.kind === 'draft' && added.selection.skillIds.length === 2 && added.ids.every((i) => added.selection.skillIds.includes(i)),
		'special/ocr入口: 追加した2種がドラフト（対象スキルセット）に入り、選択される', added.selection);
	assert(added.undo === 'inline-flex' && added.undoCount === '1' && added.note === '✓ 「新規（ドラフト）」の2種を照合します',
		'special/ocr入口: 「元に戻す」が出て、①の案内が「新規（ドラフト）」の2種になる', { undo: added.undo, count: added.undoCount, note: added.note });

	// 「元に戻す」で追加が取り消され、因子セットが空に戻る
	await page.click('[data-usd-act="picker-close"]');
	await page.click('#deck-undo-btn');
	await page.waitForTimeout(500);
	const undone = await page.evaluate(() => ({
		selection: deckTemplateManager.getSelection(),
		undo: document.getElementById('deck-undo-btn').style.display,
		note: document.getElementById('deck-selected-note').textContent
	}));
	assert(undone.selection === null && undone.undo === 'none' && undone.note === '因子セットを1つ選んでください',
		'special/ocr入口: 「元に戻す」で追加が取り消され、因子セットが空に戻る', undone);

	// 白0件＋金N件 → 文面3。読み取った白も金も無い → ピッカーを開かない（4a は廃止したので枠にも出ない）
	const empty = await page.evaluate(() => {
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		const base = { rows: [], white: { accepted: 0, review: 0, unreadable: 0, ids: [] }, gold: { kinds: 0, cards: 0 }, unknown: 0, tabs: [], quality: { skipped: [], warned: [] }, inkHeight: { median: 23 }, log: [] };
		showSkillsetScreenshotResult(Object.assign({}, base, { gold: { kinds: 3, cards: 3 }, perImage: [{ name: 'g.png', quality: { ok: true }, kindCounts: { lavender: 0, gold: 3, unknown: 0 } }] }));
		const goldOnly = { open: !el('picker-title').closest('.usd-modal').hidden, summary: el('paste-summary').textContent, noteEl: !!el('paste-note'), warnHidden: document.getElementById('deck-ocr-warn').classList.contains('hidden') };
		UmaSkillDeckCore.closeSkillPicker();
		showSkillsetScreenshotResult(Object.assign({}, base, { white: { accepted: 0, review: 0, unreadable: 2, ids: [] }, perImage: [{ name: 'u.png', quality: { ok: true }, kindCounts: { lavender: 2, gold: 0, unknown: 0 } }] }));
		const nothing = { open: !el('picker-title').closest('.usd-modal').hidden, warn: document.getElementById('deck-ocr-warn').classList.contains('hidden') ? null : document.getElementById('deck-ocr-warn-content').textContent };
		return { goldOnly, nothing };
	});
	assert(empty.goldOnly.open && empty.goldOnly.noteEl === false && empty.goldOnly.warnHidden
		&& empty.goldOnly.summary === '金スキル（約3種）が見つかりましたが、白スキルはありませんでした。\n金スキルは対象外です。金スキルに対応する白スキルを探す機能は、まだありません。\n白スキルは「テキストで検索」または「条件でスキルを検索」から追加してください。',
		'special/ocr入口: 白0件＋金N件は文面3で、注記の枠は無い', empty.goldOnly);
	assert(!empty.nothing.open && empty.nothing.warn === null,
		'special/ocr入口: 読み取った白も金も無いときはピッカーを開かず、廃止した4aも枠に出ない', empty.nothing);

	/* ------------------------------------------------------------
	 * 「文字を読み取れなかったスキルパネル」の区画と、画像のオーバーレイ（31セッション目・コミットC）
	 *
	 * 区画は merged.unreadableRows を受けて入口の下に出る（ピッカーの開閉とは独立）。
	 * 見出しと注意書きは新しい確定文面なので、一字一句そのままであることを見る。
	 * 画像が取れなかった行は、画像の代わりに枠を出す（区画が空にならないためのフォールバック）。
	 * ---------------------------------------------------------- */
	const PANEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
	const panels = await page.evaluate((png) => {
		const base = { rows: [], white: { accepted: 0, review: 0, unreadable: 0, ids: [] }, gold: { kinds: 0, cards: 0 }, unknown: 0, tabs: [], quality: { skipped: [], warned: [] }, inkHeight: { median: 23 }, log: [], perImage: [{ name: 'u.png', quality: { ok: true }, kindCounts: { lavender: 3, gold: 0, unknown: 0 } }] };
		// 2件は画像あり、1件は画像なし（フォールバック）
		const unreadableRows = [
			{ raw: '', norm: '', kind: 'none', matchedId: null, matchedName: null, candidates: [], reason: '文字が取れなかった', panelImage: png },
			{ raw: '', norm: '', kind: 'none', matchedId: null, matchedName: null, candidates: [], reason: '文字が取れなかった', panelImage: png },
			{ raw: '', norm: '', kind: 'none', matchedId: null, matchedName: null, candidates: [], reason: '文字が取れなかった' }
		];
		showSkillsetScreenshotResult(Object.assign({}, base, { white: { accepted: 0, review: 0, unreadable: 3, ids: [] }, unreadableRows: unreadableRows }));
		const wrap = document.getElementById('deck-ocr-panels');
		const list = document.getElementById('deck-ocr-panels-list');
		return {
			hidden: wrap.classList.contains('hidden'),
			heading: wrap.querySelector('p').textContent,
			note: wrap.querySelectorAll('p')[1].textContent,
			images: list.querySelectorAll('button img').length,
			fallbacks: [...list.querySelectorAll('p')].map((p) => p.textContent),
			// 数字は出さない（決定2＝手1。4a を廃止した理由）
			hasCount: /\d/.test(wrap.querySelectorAll('p')[0].textContent + wrap.querySelectorAll('p')[1].textContent)
		};
	}, PANEL_PNG);
	assert(panels.hidden === false && panels.images === 2 && panels.fallbacks.length === 1,
		'special/ocr入口: 読み取れなかった行があると区画が出て、画像2つと画像なし1件の枠が並ぶ', panels);
	assert(panels.heading === '文字を読み取れなかったスキルパネル'
		&& panels.note === 'すでに追加済みのものが含まれることがあります。必要なものは「テキストで検索」または「条件でスキルを検索」から追加してください。'
		&& panels.hasCount === false,
		'special/ocr入口: 区画の見出しと注意書きは確定文面のとおりで、数は出さない', { heading: panels.heading, note: panels.note, hasCount: panels.hasCount });
	assert(panels.fallbacks[0] === '3つ目のスキルパネル（画像を用意できませんでした）',
		'special/ocr入口: 画像を用意できなかった行も枠として残す（区画が空にならない）', panels.fallbacks);

	// 画像を押すとオーバーレイが開き、✕・背景・Esc のどれでも閉じる。本文のスクロール止めは元の値に戻る
	const overlay = await page.evaluate(async () => {
		const box = document.getElementById('skillset-panel-box');
		const backdrop = document.getElementById('skillset-panel-backdrop');
		const before = document.body.style.overflow;
		document.querySelector('#deck-ocr-panels-list button').click();
		const opened = { boxHidden: box.hidden, backdropHidden: backdrop.hidden, overflow: document.body.style.overflow, caption: document.getElementById('skillset-panel-caption').textContent, hasSrc: !!document.getElementById('skillset-panel-img').getAttribute('src') };
		document.getElementById('skillset-panel-close').click();
		const byClose = { boxHidden: box.hidden, overflow: document.body.style.overflow, hasSrc: !!document.getElementById('skillset-panel-img').getAttribute('src') };
		document.querySelector('#deck-ocr-panels-list button').click();
		backdrop.click();
		const byBackdrop = { boxHidden: box.hidden };
		document.querySelector('#deck-ocr-panels-list button').click();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		const byEsc = { boxHidden: box.hidden };
		return { before, opened, byClose, byBackdrop, byEsc };
	});
	assert(overlay.opened.boxHidden === false && overlay.opened.backdropHidden === false && overlay.opened.hasSrc
		&& overlay.opened.overflow === 'hidden' && overlay.opened.caption === '文字を読み取れませんでした（1つ目のスキルパネル）',
		'special/ocr入口: 区画の画像を押すとオーバーレイが開き、本文のスクロールが止まる', overlay.opened);
	assert(overlay.byClose.boxHidden === true && overlay.byClose.overflow === overlay.before && !overlay.byClose.hasSrc,
		'special/ocr入口: ✕で閉じるとスクロール止めが元の値に戻り、画像の参照も外れる', { byClose: overlay.byClose, before: overlay.before });
	assert(overlay.byBackdrop.boxHidden === true && overlay.byEsc.boxHidden === true,
		'special/ocr入口: 背景タップと Esc でも閉じる', { backdrop: overlay.byBackdrop, esc: overlay.byEsc });

	/* ------------------------------------------------------------
	 * 「完全一致ではない行」にも画像が出る（32セッション目）
	 *
	 * 距離1で一意に当たって自動採用された行は、Deck 側の「完全一致ではない行（内容をご確認ください）」
	 * の区画に並ぶ。利用者が「この判定で合っているか」を確かめたい行なので、画像を出す。
	 * 「選び直す」の候補チップはそのまま残す（入力に一本化しない）。
	 * ---------------------------------------------------------- */
	const approxRow = await page.evaluate(async (png) => {
		const m = UmaSkillDeckCore.matchPastedSkillText('右回り○\n左回り○\n春ウマ娘○');
		const id = (i) => m.rows[i].matchedId, name = (i) => m.rows[i].matchedName;
		const rows = [
			// 距離1で一意＝自動採用。画像を持つ（32セッション目に条件を広げた）
			{ raw: '左回りO', norm: '左回りO', kind: 'review', matchedId: id(1), matchedName: name(1), distance: 1, autoAccepted: true,
				reason: '距離1（完全一致ではない）', panelImage: png,
				candidates: [{ id: id(1), name: name(1), distance: 1 }, { id: id(2), name: name(2), distance: 2 }] },
			// 完全一致は確かめる必要が無いので画像を持たない
			{ raw: name(0), norm: name(0), kind: 'exact', matchedId: id(0), matchedName: name(0), candidates: [] }
		];
		showSkillsetScreenshotResult({
			rows: rows, white: { accepted: 2, review: 0, unreadable: 0, ids: [id(0), id(1)] }, gold: { kinds: 0, cards: 0 }, unknown: 0,
			tabs: [], quality: { skipped: [], warned: [] }, inkHeight: { median: 23 }, log: [], unreadableRows: [],
			perImage: [{ name: 'a.png', quality: { ok: true }, kindCounts: { lavender: 2, gold: 0, unknown: 0 } }]
		});
		const approx = document.querySelector('.usd-paste-approx');
		const out = {
			label: (approx.querySelector('[data-usd-act="paste-find"]') || {}).textContent || null,
			// 「選び直す」の候補チップは残っている
			cands: [...approx.querySelectorAll('[data-usd-act="paste-pick"]')].map((b) => b.textContent),
			// 完全一致の行はそもそも一覧に出ない（選択数に数えられるだけ）
			rowCount: document.querySelectorAll('.usd-paste-row').length
		};
		approx.querySelector('[data-usd-act="paste-find"]').click();
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		out.imgShown = !!el('find-img') && el('find-img').getAttribute('src') === png;
		out.read = (document.querySelector('.usd-name-read') || {}).textContent || null;
		document.querySelector('[data-usd-act="name-back"]').click();
		UmaSkillDeckCore.closeSkillPicker();
		return out;
	}, PANEL_PNG);
	assert(approxRow.label === '画像を見て入力' && approxRow.rowCount === 1,
		'special/ocr入口: 「完全一致ではない行」にも画像があり、ボタンは「画像を見て入力」になる', approxRow);
	assert(approxRow.cands.length === 1 && approxRow.cands[0] === '春ウマ娘○',
		'special/ocr入口: 「完全一致ではない行」の「選び直す」の候補チップはそのまま残る', approxRow.cands);
	assert(approxRow.imgShown === true && approxRow.read === '読み取った文字：「左回りO」',
		'special/ocr入口: 押すとサブ画面にその行の切り出し画像が出る', { imgShown: approxRow.imgShown, read: approxRow.read });

	/* ------------------------------------------------------------
	 * 「名前を入れて探す」のサブ画面（32セッション目・(A) スキルセットOCR側）
	 *
	 * 画像を持つ行のボタンは「画像を見て入力」で、押すと報告と入れ替わって画像＋入力欄＋候補一覧が出る。
	 * 絞り込みは部分一致だけ（あいまい照合は入れない）。追加済みは一覧から消さず選べない形で出す。
	 * 候補0件でもカスタム登録へ自動で進まない。
	 * ---------------------------------------------------------- */
	const finder = await page.evaluate(async (png) => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		// 実際の入力と同じ道を通す（絞り込みは遅延つき・変換中は走らせない作りなので、イベントで動かす）
		const type = async (value) => {
			const input = el('find-input');
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			await wait(260);
		};
		const master = UmaSkillDeckCore.getMasterSkills();
		const target = master.find((s) => s.name.length >= 4);
		const rows = [
			{ raw: '謎の読み', norm: '謎の読み', kind: 'none', matchedId: null, matchedName: null, distance: 3, candidates: [], reason: '距離3 > 許容1', panelImage: png }
		];
		showSkillsetScreenshotResult({
			rows: rows, white: { accepted: 0, review: 1, unreadable: 0, ids: [] }, gold: { kinds: 0, cards: 0 }, unknown: 0,
			tabs: [], quality: { skipped: [], warned: [] }, inkHeight: { median: 23 }, log: [], unreadableRows: [],
			perImage: [{ name: 'a.png', quality: { ok: true }, kindCounts: { lavender: 1, gold: 0, unknown: 0 } }]
		});
		const btn = document.querySelector('[data-usd-el="paste-report"] [data-usd-act="paste-find"]');
		const label = btn ? btn.textContent : null;
		btn.click();
		const opened = {
			nameHidden: el('paste-name').hidden, reportHidden: el('paste-report').hidden,
			footerHidden: el('picker-footer').hidden,
			hasImg: !!el('find-img'), read: (document.querySelector('.usd-name-read') || {}).textContent || null,
			results: el('find-results').innerHTML.length
		};
		// 日本語入力の変換中は絞り込まない。確定（compositionend）で初めて走る
		const input = el('find-input');
		input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		await type(target.name.slice(0, 2));
		const whileComposing = document.querySelectorAll('.usd-name-hit').length;
		input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
		await wait(260);
		const afterCompose = document.querySelectorAll('.usd-name-hit').length;

		const hits = [...document.querySelectorAll('.usd-name-hit')].map((e) => e.textContent.replace('追加済み', ''));
		// あいまい照合は入れていない＝打ち間違えたら候補は出ない
		await type('ゑゐ' + target.name.slice(0, 2));
		const none = {
			hits: document.querySelectorAll('.usd-name-hit').length,
			message: (document.querySelector('.usd-name-none') || {}).textContent || null,
			customLabel: (document.querySelector('[data-usd-act="name-custom"]') || {}).textContent || null,
			customIsChip: !!document.querySelector('[data-usd-act="name-custom"].usd-paste-cand')
		};
		// 入力を空に戻すと候補も消える
		await type('');
		const emptied = el('find-results').innerHTML.length;
		return { label, opened, targetName: target.name, hits, none, whileComposing, afterCompose, emptied };
	}, PANEL_PNG);
	assert(finder.whileComposing === 0 && finder.afterCompose > 0,
		'special/ocr入口: 日本語入力の変換中は絞り込まず、確定してから候補が出る', { whileComposing: finder.whileComposing, afterCompose: finder.afterCompose });
	assert(finder.emptied === 0, 'special/ocr入口: 入力を空に戻すと候補を出さない', finder.emptied);
	assert(finder.label === '画像を見て入力',
		'special/ocr入口: 画像を持つ行のボタンは「画像を見て入力」', finder.label);
	assert(finder.opened.nameHidden === false && finder.opened.reportHidden === true
		&& finder.opened.hasImg && finder.opened.footerHidden === true && finder.opened.results === 0
		&& finder.opened.read === '読み取った文字：「謎の読み」',
		'special/ocr入口: 押すと報告と入れ替わり、画像・読み取った文字・入力欄が出る（入力が空なら候補なし）', finder.opened);
	assert(finder.hits.length > 0 && finder.hits.some((n) => n === finder.targetName),
		'special/ocr入口: 名前の一部を入れると部分一致で候補が出る', { hits: finder.hits.slice(0, 5), target: finder.targetName });
	assert(finder.none.hits === 0
		&& finder.none.message === '一致するスキルがありません。入力に誤りがないかご確認ください。新しく追加されたスキルなど、このツールに収録されていないスキルの可能性もあります。'
		&& finder.none.customLabel === '収録されていないスキルとして追加' && finder.none.customIsChip === false,
		'special/ocr入口: 打ち間違いでは候補が出ず（あいまい照合なし）、確定文面と控えめな登録の導線だけが出る', finder.none);

	/* ------------------------------------------------------------
	 * サブ画面を開いている間の閉じる手段（32セッション目・実機で見つかった不具合）
	 *
	 * ×でモーダルごと閉じると読み取った結果が全部消える。開いている間は×を隠し、
	 * 背景タップと Esc は「一覧へ戻る」と同じ動きにする（モーダルは閉じない）。
	 * ---------------------------------------------------------- */
	const closing = await page.evaluate(() => {
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		const closeBtn = () => document.querySelector('[data-usd-act="picker-close"]');
		const modal = () => el('picker-title').closest('.usd-modal');
		const opened = { xHidden: closeBtn().hidden, xVisible: closeBtn().offsetParent !== null };
		// 背景タップ → 一覧へ戻るだけ
		modal().dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const byBackdrop = { modalOpen: !modal().hidden, nameHidden: el('paste-name').hidden, reportHidden: el('paste-report').hidden, xHidden: closeBtn().hidden };
		// 開き直して Esc → 同じ
		document.querySelector('[data-usd-el="paste-report"] [data-usd-act="paste-find"]').click();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		const byEsc = { modalOpen: !modal().hidden, nameHidden: el('paste-name').hidden, reportHidden: el('paste-report').hidden };
		// 一覧の状態なら×は出ていて、押せばモーダルが閉じる
		const backOnList = { xHidden: closeBtn().hidden };
		return { opened, byBackdrop, byEsc, backOnList };
	});
	assert(closing.opened.xHidden === true && closing.opened.xVisible === false,
		'special/ocr入口: サブ画面を開いている間はモーダルの×を隠す（押すと結果が全部消えるため）', closing.opened);
	assert(closing.byBackdrop.modalOpen && closing.byBackdrop.nameHidden === true && closing.byBackdrop.reportHidden === false
		&& closing.byBackdrop.xHidden === false,
		'special/ocr入口: サブ画面を開いている間の背景タップは一覧へ戻るだけ（モーダルは閉じない・×が戻る）', closing.byBackdrop);
	assert(closing.byEsc.modalOpen && closing.byEsc.nameHidden === true && closing.byEsc.reportHidden === false,
		'special/ocr入口: サブ画面を開いている間の Esc も一覧へ戻るだけ（モーダルは閉じない）', closing.byEsc);
	assert(closing.backOnList.xHidden === false,
		'special/ocr入口: 一覧の状態に戻れば×は出ている（閉じる手段は無くさない）', closing.backOnList);

	// 候補を選ぶと行が確定し、報告へ戻る
	const finderPick = await page.evaluate(async () => {
		document.querySelector('[data-usd-el="paste-report"] [data-usd-act="paste-find"]').click();
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		const master = UmaSkillDeckCore.getMasterSkills();
		const target = master.find((s) => s.name.length >= 4);
		const input = el('find-input');
		input.value = target.name.slice(0, 2);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await wait(260);
		const pick = document.querySelector('.usd-name-hit[data-usd-act="name-pick"]');
		const name = pick.textContent;
		pick.click();
		return {
			name: name,
			nameHidden: el('paste-name').hidden, reportHidden: el('paste-report').hidden,
			count: el('picker-checked-count').textContent,
			approx: [...document.querySelectorAll('.usd-paste-approx .usd-paste-picked')].map((e) => e.textContent)
		};
	});
	assert(finderPick.nameHidden === true && finderPick.reportHidden === false
		&& finderPick.count === '1種選択' && finderPick.approx.includes(finderPick.name),
		'special/ocr入口: 候補を選ぶと報告へ戻り、その行が「完全一致ではない行」として選択に入る', finderPick);

	// 追加済みのスキルは一覧に出るが選べない
	const finderAdded = await page.evaluate(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		// いま選んだスキルを「追加済み」に見立てて開き直す
		const picked = document.querySelector('.usd-paste-approx .usd-paste-picked').textContent;
		const id = UmaSkillDeckCore.getMasterSkills().find((s) => s.name === picked).id;
		UmaSkillDeckCore.closeSkillPicker();
		UmaSkillDeckCore.openSkillRowsPicker([String(id)], () => {},
			[{ raw: '謎の読み', norm: '謎の読み', kind: 'none', matchedId: null, matchedName: null, candidates: [], reason: '' }],
			{ white: 0, gold: 0 });
		document.querySelector('[data-usd-el="paste-report"] [data-usd-act="paste-find"]').click();
		const input = el('find-input');
		input.value = picked.slice(0, 2);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await wait(260);
		const added = document.querySelector('.usd-name-hit--added');
		const out = {
			shown: !!added, text: added ? added.textContent : null,
			pickable: !!(added && added.getAttribute('data-usd-act')),
			hasImg: !!el('find-img')
		};
		UmaSkillDeckCore.closeSkillPicker();
		return out;
	});
	assert(finderAdded.shown && /追加済み$/.test(finderAdded.text) && finderAdded.pickable === false,
		'special/ocr入口: 追加済みのスキルは一覧から消さず、「追加済み」と示して選べなくする', finderAdded);

	assert(errors.length === 0, 'special/ocr入口: コンソールエラーなし', errors.slice(0, 3));
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
		btnShown: !document.getElementById('deck-mode-btn').hidden,
		endNote: !document.getElementById('old-ui-end-note').hidden,
		noticeText: document.getElementById('ui-notice').textContent.replace(/\s+/g, ''),
		scrollLocked: document.body.style.overflow === 'hidden',
		seen: localStorage.getItem('uma-special-ui-notice'),
		mode: localStorage.getItem('uma-special-ui-mode')
	}));

	// 1. 初回訪問：新UIで開き、モーダルが出る
	{
		const { ctx, page, errors } = await openPage(browser, base, 'special.html');
		await page.waitForTimeout(2500);
		const first = await uiState(page);
		assert(first.title === '周回因子セット' && first.badge && first.label === '旧UIへ',
			'special: 初回は新UIで開く', first);
		assert(!first.btnShown && !first.endNote, 'special: 初回（新UI）では「旧UIへ」も更新終了の注記も出ない（片道化）', first);
		// 片道化で「右上の『旧UIへ』から、いつでも元の画面に戻せます。」は削った（新UIから旧UIへは行けない）
		assert(first.noticeText.includes('スキルの選び方が新しくなりました') && !first.noticeText.includes('旧UIへ'),
			'special: 告知の文面に「旧UIへ」の案内が残っていない', first.noticeText);
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
		assert(again.title === '周回因子セット' && !again.notice,
			'special: 既読なら新UIのままで、モーダルは繰り返さない', again);

		// 6. 右上のバッジから読み直せる（既読のまま）
		await page.click('#ui-mode-badge');
		await page.waitForTimeout(300);
		const reopened = await uiState(page);
		assert(reopened.notice && reopened.seen === '2026-09-new-ui-default',
			'special: 右上のバッジから読み直せて、既読のまま変わらない', reopened);
		await page.click('[data-act="notice-ok"]');
		await page.waitForTimeout(300);

		// 4. 保存値 'old'（以前に旧UIを選んだ人）→ 再読み込み → 旧UIで開く・告知は出ない
		//    片道化（C-32）で新UIから旧UIへ入る手順は無くなったので、保存値を直接セットする
		await page.evaluate(() => localStorage.setItem('uma-special-ui-mode', 'old'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);
		const old = await uiState(page);
		assert(old.title === 'スキルリストを入力' && old.label === '新UIへ' && !old.badge,
			'special: 既読なら最後に選んだ旧UIで開く', old);
		assert(old.btnShown && old.endNote, 'special: 旧UIでは「新UIへ」（出口）と更新終了の注記が出る', old);
		assert(!old.notice, 'special: 旧UIで開いてもモーダルは出ない', old);
		// 出口は生きている：「新UIへ」で新UIへ移り、選んだUIが保存される
		await page.click('#deck-mode-btn');
		await page.waitForTimeout(1500);
		const exited = await uiState(page);
		assert(exited.title === '周回因子セット' && exited.mode === 'new' && !exited.btnShown && !exited.endNote,
			'special: 旧UIから「新UIへ」で新UIへ移り、選んだUIが保存される', exited);
		await page.evaluate(() => localStorage.setItem('uma-special-ui-mode', 'old'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);
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
		assert(s.title === '周回因子セット' && s.notice,
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
		// ヘッダーの見出しからは種数を外した（範囲を選べるので、見出しの数が
		// 利用者の選択で変わるのを避けるため）。いまの種数は一覧の見出しが出す。
		total: document.getElementById('registry-skill-count').textContent,
		header: document.querySelector('header p').textContent
	}));
	assert(registry.rows === 133 && registry.total === '133' && registry.badge === '133種',
		'exam: 組み込みの133種が登録されている（①のタブのバッジは「133種」）', registry);
	assert(/技能試験で有利な登録済み対象スキル/.test(registry.header) && !/種・登録済み/.test(registry.header),
		'exam: ヘッダーの見出しに種数を書かない', registry.header.slice(0, 40));
	assert(registry.sp70 === 'sp70緑：17種' && registry.green === '緑59種（実質53種）',
		'exam: sp70緑17・緑59（実質53）のバッジが出る', registry);
	// 59セッション目（段1）から common.css も読む（ボタンを共通部品にするため）。
	// 食い違う .glass-card の余白は exam の <style> で戻してある
	assert(await page.evaluate(() => loadedCssVersion('--common-css-version')) === COMMON_CSS_VERSION
		&& await page.evaluate(() => loadedCssVersion('--uma-shell-css-version')) === COMMON_CSS_VERSION
		&& await page.evaluate(() => loadedCssVersion('--uma-components-css-version')) === COMMON_CSS_VERSION,
		'exam: 共通CSSの3つとも版を読めている', COMMON_CSS_VERSION);
	// .glass-card の余白は、common.css の --uma-card-pad ではなく従来どおり（1280px なら 24px）
	assert(await page.evaluate(() => getComputedStyle(document.getElementById('new-step-card')).padding) === '24px',
		'exam: common.css を読んでも .glass-card の余白は従来どおり');

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
	// 選んでいるタブの下線は「操作の色」＝3ツール共通の黒（#1c1917）。ページの色ではない
	// （2026-09-15・43セッション目に、押せる部品を黒へ揃えた）
	assert(step0.underline === 'rgb(28, 25, 23)', 'exam: 選択中のタブの下線が操作の色（黒）', step0.underline);
	await page.click('#step-tab-2');
	await page.waitForTimeout(300);
	const step2 = await stepState();
	assert(step2.tab2 === 'true' && !step2.panel1 && step2.panel2, 'exam: ②のタブを押すとパネルが入れ替わる', step2);
	assert(await page.isVisible('#process-btn') && await page.isVisible('#setb-toggle-btn'),
		'exam: ②に実行ボタンと「親Bセットも追加する」がある');  // exam は据え置き（C-54 は special だけ）
	await page.keyboard.press('ArrowLeft');
	await page.waitForTimeout(300);
	assert((await stepState()).panel1, 'exam: ←キーで①へ戻る');
	// 対象の範囲を既定から動かすとバッジに「（調整あり）」が付き、戻せば消える
	await page.evaluate(() => setTargetScopeMode('expanded'));
	assert(await page.textContent('#step1-skill-badge') === '138種（調整あり）', 'exam: 対象を広げると①のバッジに（調整あり）が付く');
	assert(await page.evaluate(() => !document.getElementById('badge-scope-added').classList.contains('hidden')
		&& document.getElementById('badge-scope-added-text').textContent === '追加5種'),
		'exam: 対象を広げると「追加5種」のバッジが出る');
	await page.evaluate(() => setTargetScopeMode('curated'));
	assert(await page.textContent('#step1-skill-badge') === '121種（調整あり）', 'exam: 対象を絞ると「121種（調整あり）」になる');
	assert(await page.evaluate(() => !document.getElementById('badge-scope-removed').classList.contains('hidden')
		&& document.getElementById('badge-scope-removed-text').textContent === '除外12種'
		&& document.querySelectorAll('#skill-registry-list .registry-removed').length === 12),
		'exam: 対象を絞ると「除外12種」のバッジが出て、一覧には取り消し線で残る');
	// 64セッション目（段D）に、24種の個別選択から**総括チェック1つ**へ変えた。
	// ON にすると24種すべてが対象に入る（内部の Set は「24種全部」か「空」の2択）。
	await page.evaluate(() => setScenarioFactorsAll(true));
	assert(await page.evaluate(() => document.getElementById('badge-scenario-factors-text').textContent) === 'シナリオ因子：24種',
		'exam: シナリオ因子を ON にすると「シナリオ因子：24種」のバッジが出る');
	// 件数は正本から取る（テストに数字を書かない）
	const SCENARIO_FACTOR_COUNT = await page.evaluate(() => SCENARIO_INHERITANCE_FACTORS.length);
	/* C-2c: exam のシナリオ因子も special の②と同じ1行の形（☑ シナリオ因子 24種 ?）。
	   白いカードも「因子はスキルではないので別に数える」の説明文も置かない。
	   「?」は**見るだけ**の一覧をミニウィンドウで開く（チェックは付かない）。 */
	const examRow = await page.evaluate(() => {
		const row = document.getElementById('scenario-factors-all').closest('.uma-checkrow');
		const badge = document.getElementById('scenario-factors-badge');
		const btn = document.getElementById('factor-list-btn');
		return {
			row: !!row, height: row ? Math.round(row.getBoundingClientRect().height) : null,
			label: row ? row.querySelector('.uma-checkrow-label span').textContent : null,
			badge: badge ? badge.textContent : null,
			accent: badge ? badge.classList.contains('uma-badge--accent') : null,
			help: !!btn, helpOpen: btn ? btn.getAttribute('aria-expanded') : null,
			// 説明文（白いカードの中にあったもの）はもう無い
			noCard: !document.querySelector('.uma-checkcard'),
			noNote: !document.body.textContent.includes('はスキルではないので、対象スキル数・検出数には含めず')
		};
	});
	assert(examRow.row && examRow.label === 'シナリオ因子' && examRow.height <= 40 && examRow.help,
		'C-2c(exam): シナリオ因子は1行（☑ 呼び名 N種 ?）', examRow);
	assert(examRow.badge === SCENARIO_FACTOR_COUNT + '種' && examRow.accent === true,
		'C-2c(exam): 件数のバッジが出て、ON のあいだは色が変わる', examRow);
	assert(examRow.noCard && examRow.noNote,
		'C-2c(exam): 白いカードも「因子はスキルではない」の説明文も無い', examRow);
	await page.click('#factor-list-btn');
	await page.waitForTimeout(400);
	const examList = await page.evaluate(() => ({
		open: !document.getElementById('factor-list-box').hidden,
		backdrop: !document.getElementById('factor-list-backdrop').hidden,
		count: document.getElementById('factor-list-count').textContent,
		names: Array.from(document.querySelectorAll('#factor-list-names > li')).map(li => li.textContent),
		helpOpen: document.getElementById('factor-list-btn').getAttribute('aria-expanded'),
		checked: document.getElementById('scenario-factors-all').checked
	}));
	assert(examList.open && examList.backdrop && examList.helpOpen === 'true'
		&& examList.names.length === SCENARIO_FACTOR_COUNT && examList.count === String(SCENARIO_FACTOR_COUNT),
		'C-2c(exam): 「?」で一覧のミニウィンドウが開く（件数は正本から）', { n: examList.names.length, count: examList.count });
	assert(examList.checked === true,
		'C-2c(exam): 一覧は見るだけ（開いてもチェックの状態は変わらない）', examList.checked);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(300);
	const examClosed = await page.evaluate(() => ({
		open: !document.getElementById('factor-list-box').hidden,
		helpOpen: document.getElementById('factor-list-btn').getAttribute('aria-expanded')
	}));
	assert(!examClosed.open && examClosed.helpOpen === 'false',
		'C-2c(exam): Esc で一覧が閉じる', examClosed);

	/* --- 遺伝子の1行（段F。**αテスト中**） ---
	   シナリオ因子とまったく同じ形。件数は正本の写しから取る（テストに数字を書かない）。
	   ミニウィンドウが .glass-card（backdrop-filter を持つ）の子孫に入っていないことも見る
	   ―― 入ると position: fixed の基準が画面ではなくカードになり、箱が画面の外へ出る（F-61）。 */
	const GENE_COUNT = await page.evaluate(() => APTITUDE_GENES.length);
	await page.evaluate(() => setAptitudeGenesAll(true));
	const geneRow = await page.evaluate(() => {
		const row = document.getElementById('genes-all').closest('.uma-checkrow');
		const badge = document.getElementById('genes-badge');
		const alpha = document.getElementById('genes-alpha');
		return {
			row: !!row, height: row ? Math.round(row.getBoundingClientRect().height) : null,
			label: row ? row.querySelector('.uma-checkrow-label span').textContent : null,
			badge: badge ? badge.textContent : null,
			accent: badge ? badge.classList.contains('uma-badge--accent') : null,
			help: !!document.getElementById('gene-list-btn'),
			// αの注記は**常時表示**（hidden も開閉のボタンも無い）。共通CSSの修飾子から色が当たる。
			alphaShown: !!alpha && !alpha.hidden,
			alphaCls: alpha ? alpha.className : null,
			alphaColor: alpha ? getComputedStyle(alpha).backgroundColor : null,
			alphaText: alpha ? alpha.textContent : null,
			// 注記は遺伝子の行の直下（3択やシナリオ因子にはかからない）
			alphaAfterRow: !!alpha && alpha.previousElementSibling === row,
		};
	});
	assert(geneRow.row && geneRow.label === '遺伝子' && geneRow.height <= 40 && geneRow.help,
		'段F(exam): 遺伝子は1行（☑ 遺伝子 N種 ?）', geneRow);
	assert(geneRow.badge === GENE_COUNT + '種' && geneRow.accent === true,
		'段F(exam): 件数のバッジが出て、ON のあいだは色が変わる', geneRow);
	assert(geneRow.alphaShown && geneRow.alphaAfterRow
		&& geneRow.alphaCls.includes('uma-help-box--alpha')
		&& geneRow.alphaText.includes('αテスト中')
		&& geneRow.alphaText.includes('結合画像には反映されません'),
		'段F(exam): αテスト中の注記が遺伝子の行の直下に常時出ている', geneRow);
	// 共通CSS（css/common.css の .uma-help-box--alpha）から色が当たっているか。
	// 当たらないと注記がただの薄い箱になり、αであることが目立たない。
	assert(geneRow.alphaColor === 'rgb(254, 242, 242)',
		'段F(exam): αの注記の色が共通CSSから当たっている（--uma-danger-bg）', geneRow.alphaColor);
	await page.click('#gene-list-btn');
	await page.waitForTimeout(400);
	const geneList = await page.evaluate(() => {
		const box = document.getElementById('gene-list-box');
		const r = box.getBoundingClientRect();
		// 祖先に包含ブロックを作るもの（F-61）が無いこと
		let anc = box.parentElement, blockers = [];
		while (anc && anc !== document.documentElement) {
			const cs = getComputedStyle(anc);
			if ([cs.transform, cs.filter, cs.backdropFilter, cs.perspective, cs.contain]
				.some((v) => v && v !== 'none')) blockers.push(anc.id || anc.className);
			anc = anc.parentElement;
		}
		return {
			open: !box.hidden,
			backdrop: !document.getElementById('gene-list-backdrop').hidden,
			count: document.getElementById('gene-list-count').textContent,
			names: Array.from(document.querySelectorAll('#gene-list-names > li')).map((li) => li.textContent),
			helpOpen: document.getElementById('gene-list-btn').getAttribute('aria-expanded'),
			checked: document.getElementById('genes-all').checked,
			top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
			blockers: blockers,
		};
	});
	assert(geneList.open && geneList.backdrop && geneList.helpOpen === 'true'
		&& geneList.names.length === GENE_COUNT && geneList.count === String(GENE_COUNT),
		'段F(exam): 「?」で遺伝子の一覧が開く（件数は写しから）', { n: geneList.names.length, count: geneList.count });
	assert(geneList.checked === true,
		'段F(exam): 一覧は見るだけ（開いてもチェックの状態は変わらない）', geneList.checked);
	assert(geneList.blockers.length === 0 && geneList.top >= 0 && geneList.bottom <= geneList.vh,
		'段F(exam): 一覧の箱が画面に収まる（.glass-card の子孫に置いていない。F-61）',
		{ top: geneList.top, bottom: geneList.bottom, vh: geneList.vh, blockers: geneList.blockers });
	await page.keyboard.press('Escape');
	await page.waitForTimeout(300);
	assert(await page.evaluate(() => document.getElementById('gene-list-box').hidden
		&& document.getElementById('gene-list-btn').getAttribute('aria-expanded') === 'false'),
		'段F(exam): Esc で遺伝子の一覧が閉じる');
	// 数え分けは**並記**（合算しない）。片方だけ ON のときはその片方だけを書く。
	const geneSplit = await page.evaluate(() => {
		const read = () => ({ note: extraCountNote(), all: skillList.length,
			skill: skillOnlyList.length, factor: factorOnlyList.length, gene: geneOnlyList.length });
		const both = read();
		setAptitudeGenesAll(false);
		const factorOnly = read();
		setScenarioFactorsAll(false); setAptitudeGenesAll(true);
		const geneOnly = read();
		setAptitudeGenesAll(false);
		const none = read();
		setScenarioFactorsAll(true); setAptitudeGenesAll(true);
		return { both, factorOnly, geneOnly, none };
	});
	assert(geneSplit.both.note === '＋シナリオ因子24種＋遺伝子10種'
		&& geneSplit.both.skill === 121 && geneSplit.both.factor === 24 && geneSplit.both.gene === 10
		&& geneSplit.both.all === 155,
		'段F(exam): 両方 ON なら「＋シナリオ因子24種＋遺伝子10種」と並記する（合算しない）', geneSplit.both);
	assert(geneSplit.factorOnly.note === '＋シナリオ因子24種' && geneSplit.geneOnly.note === '＋遺伝子10種'
		&& geneSplit.none.note === '',
		'段F(exam): 片方だけ ON ならその片方だけ／どちらも OFF なら何も足さない', geneSplit);
	await page.evaluate(() => setAptitudeGenesAll(false));

	// シナリオ因子はスキルではないので、「スキル」と付く数には入れない。
	// 並び（照合・一覧・表）には従来どおり入る＝skillList は 121+24 のまま。
	const splitCounts = await page.evaluate(() => {
		selectCopyList('all133');
		return {
			skillOnly: skillOnlyList.length, factorOnly: factorOnlyList.length, all: skillList.length,
			badge: document.getElementById('step1-skill-badge').textContent,
			registry: document.getElementById('registry-skill-count').textContent,
			copylist: document.getElementById('copylist-all133-count').textContent,
			rows: document.querySelectorAll('#skill-registry-list > div').length,
			// 表記（＋シナリオ因子N種）
			registryHead: document.getElementById('registry-skill-count').parentElement.textContent,
			copyBtn: document.getElementById('copylist-all133').textContent,
			copyHint: document.getElementById('skill-copy-hint').textContent,
			copyLines: document.getElementById('skill-copy-textarea').value.split('\n').length
		};
	});
	assert(splitCounts.skillOnly === 121 && splitCounts.factorOnly === 24 && splitCounts.all === 145,
		'exam: シナリオ因子を ON にすると、数える配列はスキル121・因子24に分かれる（並びの skillList は145のまま）', splitCounts);
	assert(splitCounts.badge === '121種（調整あり）' && splitCounts.registry === '121' && splitCounts.copylist === '121',
		'exam: ①のバッジ・一覧の見出し・コピーの「全◯種」は、因子を足してもスキルだけの数（121）', splitCounts);
	// 一覧は「外した12種」も取り消し線で残すので 133＋因子24＝157行。数だけがスキルの121になる。
	assert(splitCounts.rows === 157,
		'exam: 一覧の行そのものにはシナリオ因子も並ぶ（133＋因子24＝157行）', splitCounts);
	// 表記: 因子も並ぶ／書き出される場所には「＋シナリオ因子N種」を添える
	assert(splitCounts.registryHead === '対象スキル121種＋シナリオ因子24種の一覧を確認する',
		'exam: 一覧の見出しは「対象スキル121種＋シナリオ因子24種の一覧を確認する」', splitCounts.registryHead);
	assert(splitCounts.copyBtn === '全121種＋シナリオ因子24種',
		'exam: コピーの全種ボタンも「全121種＋シナリオ因子24種」', splitCounts.copyBtn);
	assert(splitCounts.copyHint === '対象スキル全121種＋シナリオ因子24種（登録順・範囲とカスタム設定を反映） ・ 145行'
		&& splitCounts.copyLines === 145,
		'exam: スキル名のコピーの見出しは種数を分けて書き、行数は実際の145行のまま', splitCounts);
	await page.evaluate(() => { setScenarioFactorsAll(false); setTargetScopeMode('default'); });
	assert(await page.textContent('#step1-skill-badge') === '133種', 'exam: 調整を戻すとバッジも「133種」に戻る');
	assert(await page.evaluate(() => ['badge-scope-added', 'badge-scope-removed', 'badge-scenario-factors']
		.every((id) => document.getElementById(id).classList.contains('hidden'))),
		'exam: 既定に戻すと3つの追加バッジは出ない');

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
		probe('#step-panel-1 > details:last-of-type summary');
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
	// 取り込み案内の色は Deck の色（.deck-accent → --uma-deck-accent-soft）。ページの青ではない
	const noteColor = await page.evaluate(() => ({
		box: getComputedStyle(document.getElementById('deck-handoff-box')).backgroundColor,
		btn: getComputedStyle(document.getElementById('deck-handoff-btn')).backgroundColor,
		deckSoft: getComputedStyle(document.documentElement).getPropertyValue('--uma-deck-accent-soft').trim()
	}));
	// Deck の色は暖灰（stone）。案内の枠と地は Deck の色、押せるボタンは操作の色（黒）
	// （2026-09-15・43セッション目。赤紫を試したが戻した）
	assert(noteColor.deckSoft === '#e7e5e4' && noteColor.box === 'rgb(231, 229, 228)' && noteColor.btn === 'rgb(28, 25, 23)',
		'exam: 取り込み案内は Deck の色（暖灰）、ボタンは黒', noteColor);

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

	// 既定から動かした人は scope の名前が「技能試験（調整あり）」。
	// 対象を広げ、シナリオ因子も足す。シナリオ因子は白スキル445種のマスターには無いが、
	// Deck は追加カタログ（catalog-data/）から引くので、警告を出さずに取り込める。
	await page.evaluate(() => { setTargetScopeMode('expanded'); setScenarioFactorsAll(true); });
	await seedExam();
	await page.waitForTimeout(400);
	p = await readExam();
	// Deck へ渡す skillNames は**因子を含めたまま**（Deck 側はカタログの◆として取り込む）。
	// 138種＋シナリオ因子24種＝162件。この162は「渡した行数」であって「スキル数」ではない。
	assert(p && !p.imported && p.scope.name === '技能試験（調整あり）' && p.skillNames.length === 162,
		'exam: 判定し直すと新しい payload（調整あり・162件＝スキル138＋シナリオ因子24）になり未取り込みに戻る', p && { imported: p.imported, scope: p.scope, n: p.skillNames.length });
	assert(await page.evaluate(() => {
		const f = new Set(SCENARIO_INHERITANCE_FACTORS);
		const pay = JSON.parse(localStorage.getItem('umaSkillDeck:ocrHandoff:exam'));
		return pay.skillNames.filter((x) => !f.has(x)).length === 138 && pay.skillNames.filter((x) => f.has(x)).length === 24;
	}), 'exam: 渡した162件の内訳はスキル138件・シナリオ因子24件');
	// 「スキル」と付く数からは因子を外す。検出数もスキルだけを数える（因子は全員が検出済みの種でも増えない）。
	const factorSplit = await page.evaluate(() => ({
		skillOnly: skillOnlyList.length, factorOnly: factorOnlyList.length, all: skillList.length,
		badge: document.getElementById('step1-skill-badge').textContent,
		registry: document.getElementById('registry-skill-count').textContent,
		statTotal: document.getElementById('stat-total').textContent,
		statFound1: document.getElementById('stat-found-1').textContent,
		statFound4: document.getElementById('stat-found-4').textContent,
		statFactor: document.getElementById('stat-total-factor').textContent,
		statFactorHidden: document.getElementById('stat-total-factor').hidden,
		detected0: countDetected(0),
		detectedWithFactors: skillList.filter((s) => personResults[0].detectedSkills.has(s)).length
	}));
	assert(factorSplit.skillOnly === 138 && factorSplit.factorOnly === 24 && factorSplit.all === 162
		&& factorSplit.badge === '138種（調整あり）' && factorSplit.registry === '138' && factorSplit.statTotal === '138',
		'exam: ①のバッジ・一覧の見出し・「対象スキル数」カードは、因子を除いた138', factorSplit);
	assert(factorSplit.detected0 === 138 && factorSplit.detectedWithFactors === 162 && factorSplit.statFound1 === '138',
		'exam: 検出数はスキルだけを数える（因子込みなら162になるところを138）', factorSplit);
	assert(!factorSplit.statFactorHidden && factorSplit.statFactor === '＋シナリオ因子24種',
		'exam: 「対象スキル数」カードの下に「＋シナリオ因子24種」が出る', factorSplit);
	n = await noteState();
	assert(n.title.includes('取り込めます') && n.detail.includes('（対象：技能試験（調整あり））') && n.dot,
		'exam: 案内も「取り込めます」に戻り、対象名に（調整あり）が付く', n);
	assert(n.detail.startsWith('親A・親B の2人分・スキル138件・シナリオ因子24件を渡しました'),
		'exam: 取り込み案内は「スキル138件・シナリオ因子24件」と分けて書く', n.detail);
	assert(await page.evaluate(() => fabUnseen.deck), 'exam: 判定し直すと Deck のバッジがまた点く');
	await deckFrame.locator('#ocr-handoff-banner').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
	const factorResolve = await frame.evaluate(() => {
		const r = resolveHandoffSkills(pendingOcrHandoff().payload);
		const hit = r.resolved.find((x) => x.name === 'URAシナリオ');
		return { resolved: r.resolved.length, unresolved: r.unresolved, uraId: hit ? hit.id : null,
			kind: hit ? UmaSkillDeckCore.skillCatalogKind(hit.id) : null };
	});
	assert(factorResolve.resolved === 162 && factorResolve.unresolved.length === 0
		&& factorResolve.uraId === 'sf-ura' && factorResolve.kind === 'scenarioFactor',
		'exam: シナリオ因子も含めて162件すべてが解決し、URAシナリオはカタログの sf-ura に着く', factorResolve);
	await deckFrame.locator('[data-ocr-act="import"]').click();
	await page.waitForTimeout(600);
	const warn = await frame.evaluate(() => {
		const el = document.querySelector('.usd-modal-panel .ocr-warn');
		return el ? el.textContent : null;
	});
	assert(warn === null, 'exam: シナリオ因子を混ぜても「見つからなかった」警告は出ない', warn);
	const factorDlg = await frame.evaluate(() =>
		document.querySelector('.usd-modal-panel .text-xs.text-slate-500').textContent);
	assert(factorDlg.includes('スキル138件・シナリオ因子24件を取り込みます'),
		'deck: 取り込みダイアログも「スキル138件・シナリオ因子24件」と分けて書く', factorDlg);
	// 取り込んだシートで、カタログ由来の行に◆が付き、名前が「（不明なスキル）」にならないこと。
	// 行の格子はシートを開いている間だけ描かれるので、取り込んだシートを開いてから見る。
	await deckFrame.locator('[data-ocr-act="apply"]').click();
	await page.waitForTimeout(1200);
	await frame.evaluate(() => {
		const recs = UmaSkillDeckCore.getUserData().records;
		openRecordEditor(recs[recs.length - 1].recordId);
	});
	await page.waitForTimeout(600);
	const factorRow = await frame.evaluate(() => {
		const row = document.getElementById('row-sf-ura');
		const plain = document.getElementById('row-1');
		return {
			exists: !!row,
			name: row ? row.querySelector('.deck-name-clip').textContent : null,
			mark: row ? !!row.querySelector('.deck-catalog-mark') : false,
			markTitle: row ? (row.querySelector('.deck-catalog-mark') || {}).title : null,
			markOutsideClip: row ? !row.querySelector('.deck-name-clip .deck-catalog-mark') : false,
			plainExists: !!plain,
			plainHasMark: plain ? !!plain.querySelector('.deck-catalog-mark') : null
		};
	});
	assert(factorRow.exists && factorRow.name === 'URAシナリオ' && factorRow.mark
		&& factorRow.markTitle === 'シナリオ因子' && factorRow.markOutsideClip
		&& factorRow.plainExists && factorRow.plainHasMark === false,
		'deck: 取り込んだシートでカタログ由来の行に◆が付き、白スキルの行には付かない', factorRow);
	await frame.evaluate(() => closeRecordEditor());
	await page.waitForTimeout(300);
	await page.evaluate(() => { setScenarioFactorsAll(false); setTargetScopeMode('default'); });

	/* --- シナリオ因子の絞り込み（applyScenarioFactorStrictMatch。47セッション目） ---
	   完全一致に加えて「カタログの中で1つに絞れる1文字違い」も採る。
	   試す文字列は**カタログから組み立てる**（シナリオ名をこのファイルに書かない）。
	   実際の距離も一緒に返して、前提（距離1／距離2／同点）が本当に成立しているかを検査する。 */
	const strict = await page.evaluate(() => {
		const N = SCENARIO_FACTOR_NORMS;
		const d = (a, b) => levenshtein(a, b);
		// 近い名前がいちばん遠い因子（＝1文字変えても他と紛れない）を選ぶ
		let far = null, farNn = -1;
		for (const a of N) {
			let nn = Infinity;
			for (const b of N) if (b !== a) nn = Math.min(nn, d(a.norm, b.norm));
			if (nn > farNn) { farNn = nn; far = a; }
		}
		// 置き換えに使う文字は、別の因子の1文字目から借りる（元の文字と違うもの）
		const swap = (norm, k) => {
			for (const b of N) { const c = b.norm[0]; if (c && c !== norm[k]) return norm.slice(0, k) + c + norm.slice(k + 1); }
			return norm;
		};
		const one = swap(far.norm, 0);           // 距離1・一意のはず
		const two = swap(swap(far.norm, 0), 1);  // 距離2・一意のはず
		// 距離2で長さが同じ組を探し、その中間（両方から距離1）を作る
		let tie = null, tiePair = null;
		for (let i = 0; i < N.length && !tie; i++) {
			for (let j = i + 1; j < N.length && !tie; j++) {
				const a = N[i].norm, b = N[j].norm;
				if (a.length !== b.length || d(a, b) !== 2) continue;
				const k = [...a].findIndex((ch, idx) => ch !== b[idx]);
				if (k < 0) continue;
				tie = a.slice(0, k) + b[k] + a.slice(k + 1);
				tiePair = [N[i].raw, N[j].raw];
			}
		}
		// 「その因子だけが検出されている」状態を作って絞り込みを通す（採用されれば残る）
		const keep = (lineText, factorName) => {
			const res = { detectedSkills: new Set([factorName]), matchReasons: {}, skillSources: {}, skillStars: {} };
			applyScenarioFactorStrictMatch(res, [{ text: lineText }], { factors: new Set(SCENARIO_INHERITANCE_FACTORS) });
			return res.detectedSkills.has(factorName);
		};
		return {
			min: SCENARIO_FACTOR_MIN_DISTANCE,
			limit: SCENARIO_FACTOR_NEAR_LIMIT,
			far: far.raw, farNn: farNn,
			dOne: d(normalizeText(one), far.norm), keepOne: keep(one, far.raw),
			dTwo: d(normalizeText(two), far.norm), keepTwo: keep(two, far.raw),
			tiePair: tiePair,
			dTieA: tie ? d(normalizeText(tie), N.find((x) => x.raw === tiePair[0]).norm) : null,
			dTieB: tie ? d(normalizeText(tie), N.find((x) => x.raw === tiePair[1]).norm) : null,
			keepTie: tie ? keep(tie, tiePair[0]) : null,
			keepExact: keep(far.raw, far.raw)
		};
	});
	assert(strict.min === 2 && strict.limit === 1,
		'exam: シナリオ因子24種の最小距離は2・許す「ずれ」の上限は1（カタログが増えて近づいたら落ちる）', strict);
	assert(strict.dOne === 1 && strict.keepOne === true,
		'exam: 1文字違いで候補が一意なら採用する', strict);
	assert(strict.dTieA === 1 && strict.dTieB === 1 && strict.keepTie === false,
		'exam: 距離1で2つ以上並ぶなら採用しない（選んでいない因子と並んだ場合も）', strict);
	assert(strict.dTwo === 2 && strict.keepTwo === false,
		'exam: 距離2は候補が一意でも採用しない', strict);
	assert(strict.keepExact === true,
		'exam: 完全一致は従来どおり採用する', strict);

	/* --- 遺伝子10種の誤マッチのガード（段F） ---
	   上限は数値で書かず**カタログから毎回計算する**ので、収録データが増えて名前どうしが
	   近づけば上限が変わる。いまは「短距離の遺伝子」と「中距離の遺伝子」が距離1しか離れて
	   いないため、上限は 0 ＝ **完全一致のみ**になる。ここが変わったら前提が崩れているので落とす。
	   （special 側の同じ検査は C-2b のところにある。exam は core を読まないので実体が別） */
	const geneStrict = await page.evaluate(() => {
		const d = (a, b) => levenshtein(a, b);
		const N = APTITUDE_GENES.map((n) => ({ raw: n, norm: normalizeText(n) }));
		// 「その遺伝子だけが検出されている」状態を作って絞り込みを通す（採用されれば残る）
		const keep = (lineText, geneName) => {
			const res = { detectedSkills: new Set([geneName]), matchReasons: {}, skillSources: {}, skillStars: {} };
			applyAptitudeGeneStrictMatch(res, [{ text: lineText }], { genes: new Set(APTITUDE_GENES) });
			return res.detectedSkills.has(geneName);
		};
		// 1文字崩した行（2文字目を別の字に替える）
		const target = N[0];
		const broken = target.raw.slice(0, 1) + 'ヌ' + target.raw.slice(2);
		// 距離1の組（短距離／中距離のような組）が実在することも見る
		let nearPair = null;
		for (let i = 0; i < N.length && !nearPair; i++) {
			for (let j = i + 1; j < N.length && !nearPair; j++) {
				if (d(N[i].norm, N[j].norm) === APTITUDE_GENE_MIN_DISTANCE) nearPair = [N[i].raw, N[j].raw];
			}
		}
		return {
			size: APTITUDE_GENES.length,
			min: APTITUDE_GENE_MIN_DISTANCE,
			limit: APTITUDE_GENE_NEAR_LIMIT,
			nearPair: nearPair,
			dBroken: d(normalizeText(broken), target.norm),
			keepBroken: keep(broken, target.raw),
			keepExact: keep(target.raw, target.raw),
			// 距離1で並ぶ2つを、それぞれ自分の名前そのままで採れること（取り違えないこと）
			keepPairA: nearPair ? keep(nearPair[0], nearPair[0]) : null,
			keepPairB: nearPair ? keep(nearPair[1], nearPair[1]) : null,
			// 片方の行に対して、もう片方の名前は採らない
			crossAB: nearPair ? keep(nearPair[0], nearPair[1]) : null,
		};
	});
	assert(geneStrict.min === 1 && geneStrict.limit === 0,
		'exam: 遺伝子10種の最小距離は1・許す「ずれ」の上限は0＝完全一致のみ（カタログが増えて離れたら落ちる）', geneStrict);
	assert(geneStrict.keepExact === true, 'exam: 遺伝子は完全一致なら採用する', geneStrict);
	assert(geneStrict.dBroken === 1 && geneStrict.keepBroken === false,
		'exam: 遺伝子は1文字違いでも採用しない（上限が0のため）', geneStrict);
	assert(geneStrict.keepPairA === true && geneStrict.keepPairB === true && geneStrict.crossAB === false,
		'exam: 距離1で並ぶ2つ（短距離／中距離）を取り違えない', geneStrict);
	/* **画面には ◆ を出すが、結合画像には焼かない**（段F。示し方を決めていないので描かない）。
	   印を描く側は stitchMarkKind() を通すので、そこが null を返すことが「描かれない」の実体。
	   凡例も「実際に描いた区分」から作るので、null なら凡例の行も出ない。
	   決めたら stitchMarkKind() の1行を外すことになる ―― そのとき**この検査が落ちる**ので、
	   外し忘れ・外しっぱなしのどちらにも気づける。 */
	const geneMark = await page.evaluate(() => {
		const g = APTITUDE_GENES[0], s = EXAM_SKILL_NAMES[0];
		return {
			画面の区分: skillMarkKind(g), 結合画像の区分: stitchMarkKind(g),
			記号: SCREEN_MARK.gene ? SCREEN_MARK.gene.glyph : null,
			呼び名: SCREEN_MARK.gene ? SCREEN_MARK.gene.tableTitle : null,
			// スキルのほうは画面でも結合画像でも同じ区分のまま（遺伝子だけを落としている）
			スキルの画面: skillMarkKind(s), スキルの結合画像: stitchMarkKind(s),
		};
	});
	assert(geneMark.画面の区分 === 'gene' && geneMark.記号 === '♥' && geneMark.呼び名 === '遺伝子',
		'段G(exam): 遺伝子は画面では ♥（区分は gene・呼び名は「遺伝子」）', geneMark);
	assert(geneMark.結合画像の区分 === null && geneMark.スキルの画面 === geneMark.スキルの結合画像,
		'段F(exam): 結合画像には遺伝子の印を焼かない（落とすのは遺伝子だけ。スキルは素通り）', geneMark);

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

	// 引き出しの中のタブの CSS は css/shell.css へ移した（C-62 の (9)。special も使うようになったため）。
	// exam の <style> から消えているので、**共通CSSから当たっているか**をここで見る（当たらないと
	// タブが裸のボタンになる）。値は shell.css の .drawer-tab と、選択中の下線 --uma-control。
	const tabCss = await page.evaluate(() => {
		const on = getComputedStyle(document.getElementById('result-tab-result'));
		const off = getComputedStyle(document.getElementById('result-tab-stitch'));
		return { onLine: on.borderBottomColor, onWeight: on.fontWeight, offLine: off.borderBottomColor,
			strip: getComputedStyle(document.querySelector('.drawer-tabs')).display };
	});
	assert(tabCss.strip === 'flex' && tabCss.onWeight === '600' && tabCss.onLine === 'rgb(28, 25, 23)'
		&& tabCss.offLine === 'rgba(0, 0, 0, 0)',
		'exam: 引き出しの中のタブの見た目が共通CSS（shell.css）から当たっている', tabCss);

	// 結果画像がまだ無いときは、そのタブへ「切り替えられない」（押せないことはラベルでも分かる）
	await page.evaluate(() => fabGoTo('result'));
	await page.waitForTimeout(700);
	let t2 = await tabState2();
	const wideWidth = t2.width;
	assert(t2.drawer && t2.resultSel === 'true' && t2.stitchSel === 'false', 'exam: 「OCRの照合結果」からは照合結果のタブで開く', t2);
	assert(t2.stitchDisabled && t2.stitchLabel === '結合画像の表示（なし）', 'exam: 結合画像がまだ無いタブは押せず、ラベルでもそれが分かる', t2);

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
	// ボタンの中の数は「編集中のセットに入っている総数」なので、
	// 開いた時点で（まだ1つも足していなくても）もう入っているぶんが出る
	const startCount = await page.evaluate(() => draftRecord.skillIds.length);
	assert(startCount > 0 && foot0.label === 'チェックしたスキルを追加（' + startCount + '種追加済み）',
		'deck: 開いた時点でセットに入っている総数がボタンに出る', { label: foot0.label, startCount });
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

	// 実際に押すと、足したぶんだけ総数が増える。
	// 押すとチェックは外れて一覧からも消えるので、これが無いと足した実感が画面に残らない。
	await page.click('[data-usd-el="results"] .usd-row:first-child input');
	await page.click('[data-usd-el="results"] .usd-row:nth-child(2) input');
	await page.waitForTimeout(200);
	await page.click('[data-usd-el="picker-commit"]');
	await page.waitForTimeout(500);
	const footAdded = await footState();
	assert(footAdded.label === 'チェックしたスキルを追加（' + (startCount + 2) + '種追加済み）'
		&& footAdded.count === '0種選択' && footAdded.disabled === true,
		'deck: 2種足すと総数が2つ増え、選択は0種へ戻る', footAdded);
	assert(await page.evaluate(() => draftRecord.skillIds.length) === startCount + 2,
		'deck: ボタンの数が比較シートの実際のスキル数と一致する');

	// もう1件足すと積み上がる（押すたびに上書きではない）
	await page.click('[data-usd-el="results"] .usd-row:first-child input');
	await page.waitForTimeout(200);
	await page.click('[data-usd-el="picker-commit"]');
	await page.waitForTimeout(500);
	assert((await footState()).label === 'チェックしたスキルを追加（' + (startCount + 3) + '種追加済み）',
		'deck: 続けて足すと総数が積み上がる');

	// 開き直しても総数は残る（モーダルを開いている間だけの数ではない）
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);
	await page.click('button[onclick="openRecordSkillPicker()"]');
	await page.waitForTimeout(700);
	assert((await footState()).label === 'チェックしたスキルを追加（' + (startCount + 3) + '種追加済み）',
		'deck: 開き直しても総数はそのまま（セットの中身を数えているため）');

	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);
	assert(!(await page.isVisible('.usd-modal')), 'deck: モーダルが閉じる');

	/* --- スキルを足す入口は3つ。それぞれ別のモードでモーダルが開く --- */
	const entries = await page.evaluate(() =>
		[...document.querySelectorAll('#record-editor-view .uma-btn')]
			.map((b) => b.textContent.trim()).filter((t) => /検索|収録されていない/.test(t)));
	assert(entries.length === 3 && entries[0] === '条件でスキルを検索'
		&& entries[1] === 'テキストで検索' && entries[2] === '収録されていないスキルを追加',
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

	// Deck 単体ページにも「名前を入れて探す」がある（32セッション目）。OCR が無いので画像なしの形だけ
	const deckFinder = await page.evaluate(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		el('paste-input').value = 'まったく当たらない文字列';
		document.querySelector('[data-usd-act="paste-run"]').click();
		const btn = document.querySelector('[data-usd-el="paste-report"] [data-usd-act="paste-find"]');
		const label = btn ? btn.textContent : null;
		const noCustomChip = !document.querySelector('[data-usd-el="paste-report"] [data-usd-act="paste-custom"]');
		if (btn) btn.click();
		const target = UmaSkillDeckCore.getMasterSkills().find((s) => s.name.length >= 4);
		const input = el('find-input');
		input.value = target.name.slice(0, 2);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await wait(260);
		const out = {
			label: label, noCustomChip: noCustomChip,
			hasImg: !!el('find-img'), reportHidden: el('paste-report').hidden,
			hits: document.querySelectorAll('.usd-name-hit').length,
			// 開いている間は×が隠れる（32セッション目。Deck 単体ページでも同じ）
			xHidden: document.querySelector('[data-usd-act="picker-close"]').hidden
		};
		// Esc で一覧へ戻る。モーダルは閉じない
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		out.afterEsc = { modalOpen: !el('picker-title').closest('.usd-modal').hidden, nameHidden: el('paste-name').hidden, xHidden: document.querySelector('[data-usd-act="picker-close"]').hidden };
		return out;
	});
	assert(deckFinder.label === '入力して探す' && deckFinder.noCustomChip && deckFinder.hasImg === false
		&& deckFinder.reportHidden === true && deckFinder.hits > 0,
		'deck: Deck 単体ページでも「入力して探す」が開き、画像なしで部分一致の候補が出る', deckFinder);
	assert(deckFinder.xHidden === true && deckFinder.afterEsc.modalOpen && deckFinder.afterEsc.nameHidden === true
		&& deckFinder.afterEsc.xHidden === false,
		'deck: Deck 単体ページでもサブ画面を開いている間は×が隠れ、Esc は一覧へ戻るだけ', { xHidden: deckFinder.xHidden, afterEsc: deckFinder.afterEsc });

	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);

	await page.click('button[onclick="openRecordCustomSkill()"]');
	await page.waitForTimeout(700);
	const customMode = await modeState();
	assert(!customMode.filter && !customMode.paste && customMode.custom,
		'deck: 「収録されていないスキルを追加」は手入力欄だけを出す', customMode);
	assert(customMode.title === '収録されていないスキルを追加', 'deck: 見出しが「収録されていないスキルを追加」', customMode.title);
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
		btnShown: !document.getElementById('deck-mode-btn').hidden,
		// 更新終了の注記は #old-step1-card の中にあるので、カードごと見えるか（描画されているか）で見る
		endNote: document.getElementById('old-ui-end-note').getClientRects().length > 0,
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
		assert(!first.btnShown && !first.endNote, 'exam: 初回（新UI）では「旧UIへ」も更新終了の注記も出ない（片道化）', first);
		assert(!(await page.isVisible('#deck-mode-btn')), 'exam: 隠した「旧UIへ」は実際に描画されない（inline-flex に負けない。F-13）');
		assert(first.panel1In === 'new-step-slot' && first.resultIn === 'result-drawer-slot' && first.helpIn === 'help-dialog-slot' && first.copyIn === 'result-copy-slot'
			&& first.devIn === 'new-devlog-slot',
			'exam: 新UIでは中身がタブ・引き出し・ダイアログの中にある', first);
		assert(first.notice && first.backdrop && first.scrollLocked,
			'exam: 初回は切り替えの告知モーダルが出て、本文のスクロールが止まる', first);
		assert(await page.evaluate(() => document.activeElement === document.getElementById('ui-notice-ok')),
			'exam: 開いた時点でOKにフォーカスが移る');
		assert(first.seen === null, 'exam: 開いただけではまだ既読にしない', first.seen);
		// 文面は固定。＜新機能＞の段は Deck の色の枠。
		// 告知は2種類あり、枠は共有で中身だけ差し替わるので、出している方の中身だけを見る。
		const text = await page.evaluate(() => ({
			title: document.getElementById('ui-notice-title').textContent,
			body: document.getElementById('ui-notice-body-layout').textContent.replace(/\s+/g, ''),
			targetHidden: document.getElementById('ui-notice-body-target').hidden,
			newBox: getComputedStyle(document.querySelector('#ui-notice .notice-new')).backgroundColor
		}));
		assert(text.targetHidden, 'exam: 初回は対象スキルの告知は出さない（画面の告知だけ）', text.targetHidden);
		assert(text.title === '画面が新しくなりました'
			&& text.body.includes('対象スキル（133種）はそのままです。')
			&& text.body.includes('照合結果と結合画像の表示は、右下の＋ボタンから開く引き出しに表示されます。')
			// 片道化で「右上の『旧UIへ』から、いつでも元の画面に戻せます。」は削った（新UIから旧UIへは行けない）
			&& !text.body.includes('旧UIへ')
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

		/* 対象スキルの告知（2026-09-14）。画面の告知を既に読んでいる人にだけ、1度だけ出る。
		   画面の告知が未読の人（＝初めて開く人）には出さない（上で targetHidden を見ている）。 */
		await page.evaluate(() => localStorage.removeItem('uma-exam-target-notice'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(1500);
		const tgt = await page.evaluate(() => ({
			notice: !document.getElementById('ui-notice').hidden,
			layoutHidden: document.getElementById('ui-notice-body-layout').hidden,
			title: document.getElementById('ui-notice-title-target').textContent,
			body: document.getElementById('ui-notice-body-target').textContent.replace(/\s+/g, ''),
			labelledby: document.getElementById('ui-notice').getAttribute('aria-labelledby'),
			seen: localStorage.getItem('uma-exam-target-notice')
		}));
		assert(tgt.notice && tgt.layoutHidden && tgt.labelledby === 'ui-notice-title-target',
			'exam: 画面の告知が既読なら、対象スキルの告知が代わりに出る', tgt);
		assert(tgt.title === '対象スキルの選択方法がアップデートされました'
			&& tgt.body.includes('「対象スキルの範囲」から、既定133種／拡張138種／絞り込み121種を選べるようになりました。')
			&& tgt.body.includes('新たに「シナリオ因子」も対象に追加できます。'),
			'exam: 対象スキルの告知の文面が決めたとおり', tgt);
		assert(tgt.seen === null, 'exam: 対象スキルの告知も、開いただけではまだ既読にしない', tgt.seen);
		await page.click('#ui-notice-ok');
		await page.waitForTimeout(300);
		const tgtClosed = await page.evaluate(() => ({
			notice: !document.getElementById('ui-notice').hidden,
			seen: localStorage.getItem('uma-exam-target-notice')
		}));
		assert(!tgtClosed.notice && tgtClosed.seen === '2026-09-14-target-scope',
			'exam: 閉じると対象スキルの告知の既読の印が残る', tgtClosed);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(1500);
		assert(!(await page.evaluate(() => !document.getElementById('ui-notice').hidden)),
			'exam: 対象スキルの告知は繰り返さない');

		// 右上のバッジから読み直せる（既読のまま）
		await page.click('#ui-mode-badge');
		await page.waitForTimeout(300);
		const reopened = await uiState(page);
		assert(reopened.notice && reopened.seen === '2026-09-exam-drawer-layout', 'exam: 右上のバッジから読み直せて、既読のまま変わらない', reopened);
		await page.click('#ui-notice-ok');
		await page.waitForTimeout(300);

		// 旧UI：中身が本文のカードにあり、FAB と Deck の入口が無い。受け渡しの書き込みは続く。
		// 片道化（C-32）で新UIから旧UIへは入れないので、保存値 'old' で開き直してから結果を仕込む
		await page.evaluate(() => localStorage.setItem('uma-exam-ui-mode', 'old'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(1500);
		await page.evaluate(() => {
			const mk = (names, offset) => matchAllSkillsWithStars(
				names.map((n, i) => ({ text: n, stars: ((i + offset) % 3) + 1, starsReliable: true, rowKey: 'r' + i })),
				skillList, skillIndex, {});
			personResults = PERSON_LABELS.map(() => null);
			personResults[0] = mk(skillList, 0);
			renderResults();
			writeOcrHandoff();
		});
		await page.waitForTimeout(300);
		const old = await uiState(page);
		assert(old.mode === 'old' && old.label === '新UIへ' && !old.badge, 'exam: 保存値 old で開くと旧UIで、ラベルが「新UIへ」になる', old);
		assert(old.btnShown && old.endNote, 'exam: 旧UIでは「新UIへ」（出口）と更新終了の注記が出る', old);
		const endNote = await page.evaluate(() => {
			const el = document.getElementById('old-ui-end-note');
			return {
				text: el.textContent.replace(/\s+/g, ''),
				closeBtn: !!el.querySelector('button'),
				inOldCard: document.getElementById('old-step1-card').contains(el) && !document.getElementById('old-step1-slot').contains(el),
				first: document.getElementById('old-step1-card').firstElementChild === el,
				bg: getComputedStyle(el).backgroundColor, opacity: getComputedStyle(el).opacity
			};
		});
		assert(endNote.text.includes('この画面は更新を終了しました')
			&& endNote.text.includes('今後、新しい機能はこの画面には追加されません。画面上部の「新UIへ」から、最新の画面に切り替えられます。'),
			'exam: 注記の文面が決めたとおり', endNote);
		assert(!endNote.closeBtn && endNote.inOldCard && endNote.first,
			'exam: 注記に閉じるボタンは無く、#old-step1-card の先頭に直接置かれている（移動対象の外）', endNote);
		assert(endNote.bg === 'rgb(255, 251, 235)' && endNote.opacity === '1',
			'exam: 注記の地は警告の色（不透明）で opacity を使っていない', endNote);
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
		assert(back.mode === 'new' && !back.btnShown && !back.endNote,
			'exam: 新UIへ戻ると選んだUIが保存され、「旧UIへ」と注記は出ない（片道化）', back);
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
		// （片道化（C-32）で新UIから旧UIへは入れないので、保存値 'old' で開き直してから「新UIへ」を押す）
		await page.evaluate(() => localStorage.setItem('uma-exam-ui-mode', 'old'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(1500);
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

	/* --- 1b) 既存の比較シートの候補（親A）へ上書きで取り込む → 元に戻す。新しいシートへの取り込みは積まない --- */
	{
		const { ctx, page, errors } = await openWithHandoffs([[KEY_SPECIAL, mkPayload('special', 'ho_special_ow', '2026-09-11T10:00:00.000Z')]]);
		const shape = () => page.evaluate((rid) => {
			const r = UmaSkillDeckCore.getUserData().records.find((x) => x.recordId === rid);
			return UmaSkillDeckCore.probeOf({ candidates: r.candidates, cells: r.cells, ocrCells: r.ocrCells });
		}, RECORD_ID);
		const before = await shape();
		await page.click('[data-ocr-act="import"]');
		await page.waitForTimeout(600);
		await page.selectOption('[data-ocr-el="record-select"]', RECORD_ID);
		await page.waitForTimeout(300);
		const target = await page.evaluate(() => document.querySelector('[data-ocr-el="person-select"]').value);
		assert(target === 'c_a', 'deck: 同じ名前の候補（親A）が既定の取り込み先になる', target);
		const applied = await page.evaluate(() => {
			const realConfirm = window.confirm;
			window.confirm = () => true;
			document.querySelector('[data-ocr-act="apply"]').click();
			window.confirm = realConfirm;
			return { toast: document.getElementById('toast-message').textContent, scope: UmaSkillDeckCore.getUndoScope(), stack: UmaSkillDeckCore.undoCount(),
				// 表示は hidden 属性（共通部品 .uma-undo-fab。C-55）。属性と実際の描画の両方で見る
				shown: !document.getElementById('undo-button').hidden && getComputedStyle(document.getElementById('undo-button')).display !== 'none' };
		});
		await page.waitForTimeout(300);
		const after = await shape();
		assert(after !== before, 'deck: 既存の候補へ取り込むと★が上書きされる');
		assert(applied.toast === '1人分を取り込みました' && applied.scope === 'list' && applied.stack === 1 && applied.shown,
			'deck: 上書きの取り込みは「元に戻す」に1件積まれ、一覧に出る', applied);
		const undone = await page.evaluate(() => ({ ok: performUndo(), toast: document.getElementById('toast-message').textContent, stack: UmaSkillDeckCore.undoCount() }));
		await page.waitForTimeout(300);
		assert(undone.ok && undone.toast === '取り込む前の★に戻しました' && undone.stack === 0 && (await shape()) === before,
			'deck: 取り込み→元に戻すで、候補・★・原本値が取り込む前と一致', undone);
		assert(errors.length === 0, 'deck: 上書き取り込みの往復でコンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	}
	{
		const { ctx, page } = await openWithHandoffs([[KEY_SPECIAL, mkPayload('special', 'ho_special_new', '2026-09-11T10:00:00.000Z')]]);
		await page.click('[data-ocr-act="import"]');
		await page.waitForTimeout(600);
		await page.click('[data-ocr-act="apply"]');
		await page.waitForTimeout(600);
		const n = await page.evaluate(() => ({ stack: UmaSkillDeckCore.undoCount(), records: UmaSkillDeckCore.getUserData().records.length }));
		assert(n.records === 2 && n.stack === 0, 'deck: 新しいシートへの取り込みは足すだけなので「元に戻す」に積まない', n);
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

/* ============================================================
 * 画質の警告帯の文面（common.js の buildImageQualityNotice）
 *
 * 実機で「正当なスクリーンショットが丸ごと足切りされる」不具合を出したあと、
 * 足切りと警告を分け、文面を common.js に集約した経緯がある（2026-09-12）。
 * 文面そのものが利用者への対処方法（ウィンドウを大きくする）を運んでいるので、
 * 崩れても例外が出ず気付けない。ここで本文の作られ方を直接押さえる。
 * ============================================================ */
{
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(base + '/exam.html', { waitUntil: 'networkidle' });
	await page.waitForTimeout(500);

	const warn3 = (label) => ({ label: label, name: label + '.png', kinds: ['narrow'] });

	// 1) 警告のみ3枚 … 本文は1回だけ／SNSの一文は出さない
	const onlyWarn = await page.evaluate(() =>
		buildImageQualityNotice([], [
			{ label: '親A', name: 'a.png', kinds: ['narrow'] },
			{ label: '親A', name: 'b.png', kinds: ['narrow'] },
			{ label: '祖A1', name: 'c.png', kinds: ['narrow'] },
		]));
	const countOf = (s, needle) => s.split(needle).length - 1;
	assert(countOf(onlyWarn, 'ゲーム画面が小さめに写っているため') === 1,
		'警告のみ3枚: 本文は1回だけ（枚数でまとめる）', onlyWarn);
	assert(onlyWarn.includes('（3枚）'), '警告のみ3枚: 枚数が入る');
	assert(!onlyWarn.includes('SNS'), '警告のみ3枚: SNSの一文は付けない');
	assert(!/\d{3}px/.test(onlyWarn), '警告のみ3枚: px値は本文に出さない（開発ログ行き）', onlyWarn);
	assert(!onlyWarn.includes('a.png') && !onlyWarn.includes('c.png'),
		'警告のみ3枚: 個別のファイル名は並べない');
	assert(onlyWarn.includes('ウィンドウを大きく'), '警告のみ3枚: 対処方法で締める');

	// 2) 足切りあり … SNSの一文を付け、どの画像かファイル名で示す
	const withSkip = await page.evaluate(() =>
		buildImageQualityNotice(
			[{ label: '親A', name: 'tiny.png', kinds: ['too-small'] }],
			[{ label: '親B', name: 'd.png', kinds: ['narrow'] }]));
	assert(withSkip.includes('SNS'), '足切りあり: SNSの一文を付ける');
	assert(withSkip.includes('・親A: tiny.png'), '足切りあり: 足切りした画像はファイル名で示す');
	assert(withSkip.includes('ゲーム画面が小さめに写っているため'),
		'足切りと警告の混在: 両方を出す', withSkip);
	assert(withSkip.includes('ウィンドウを大きく'), '足切りあり: 対処方法で締める');

	// 3) ぼやけによる足切り … 小ささとは別の言い回しにする
	const blurry = await page.evaluate(() =>
		buildImageQualityNotice([{ label: '親B', name: 'blur.jpg', kinds: ['blurry'] }], []));
	assert(blurry.includes('ぼやけていて'), 'ぼやけ: 小ささとは別の文面になる', blurry);
	assert(!blurry.includes('小さすぎて'), 'ぼやけ: 小ささの文面は混ぜない');

	// 4) 何も問題が無ければ空文字（＝帯を出さない）
	const none = await page.evaluate(() => buildImageQualityNotice([], []));
	assert(none === '', '問題なし: 空文字を返す（帯を出さない）', none);

	// 5) しきい値の定数が、実測で決めた値から動いていないか
	const th = await page.evaluate(() => ({
		min: MIN_BASE_WIDTH_PX, rec: RECOMMENDED_BASE_WIDTH_PX,
	}));
	assert(th.min === 400 && th.rec === 700,
		'画質しきい値が実測値のまま（足切り400 / 推奨700）', th);

	await ctx.close();
}

/* ============================================================
 * 画像結合の中止文（js/stitch.js の stitchBuildAbortNotice / stitchClassifyScreenshotMismatch）
 *
 * 以前はどの理由でも「…標準的なスクリーンショットのサイズ範囲外です。結合済み画像や
 * 加工済み画像がアップロードされた可能性があるため処理を中止します」の1文だけを出していた。
 * ゲーム画面をそのまま撮っただけの人（例: 592x1280）にも身に覚えのない理由を名指しし、
 * どうすれば直るかも書いていなかった（2026-09-13・25セッション目に分岐させた）。
 * 文面そのものが対処方法を運んでいて、崩れても例外が出ないので、ここで直接押さえる。
 * ============================================================ */
{
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(base + '/exam.html', { waitUntil: 'networkidle' });
	await page.waitForTimeout(500);

	const notice = (kind, label, names) =>
		page.evaluate(([k, l, n]) => stitchBuildAbortNotice(k, l, n), [kind, label, names]);
	const classify = (w, aspect) =>
		page.evaluate(([a, b]) => stitchClassifyScreenshotMismatch(a, b), [w, aspect]);

	// 1) 分類 … 幅だけ足りない／幅だけ大きい／縦横比が外れた を取り違えない
	assert(await classify(592, 1280 / 592) === 'too-small',
		'分類: 592x1280（スマホの縦横比・幅だけ足りない）は too-small');
	assert(await classify(490, 870 / 490) === 'too-small',
		'分類: DMMの縦横比で幅だけ足りないものも too-small');
	assert(await classify(1920, 3413 / 1920) === 'too-large',
		'分類: 大きなDMMウィンドウ（縦横比1.78）は too-large');
	assert(await classify(1180, 6000 / 1180) === 'aspect',
		'分類: 縦につないだ画像（縦横比5前後）は aspect');
	assert(await classify(2360, 2556 / 2360) === 'aspect',
		'分類: 横に並べた画像（縦横比1.08）は aspect');
	assert(await classify(1640, 2360 / 1640) === 'aspect',
		'分類: タブレット（4:3相当）は aspect に落ちる（既知。文面で断ってある）');

	// 2) 幅が足りない … OCR が別に動いていることを伝え、対処方法で締める
	const small = await notice('too-small', '祖A1', ['02.png']);
	assert(small.includes('02.png'), '幅不足: どの画像かファイル名で示す', small);
	assert(small.includes('読み取りは別に行っている'),
		'幅不足: OCR は動いていることを伝える（「全部失敗した」と読ませない）', small);
	assert(small.includes('ウィンドウを大きく'), '幅不足: 対処方法で締める', small);
	assert(!small.includes('加工'), '幅不足: 加工の疑いは書かない', small);
	assert(!small.includes('SNS'), '幅不足: SNSの一文は付けない（対処方法を薄めない）', small);

	// 3) 幅が大きい … 加工の疑いは出すが、大きなウィンドウの可能性も併記する
	const large = await notice('too-large', '親A', ['01.png']);
	assert(large.includes('ウィンドウがとても大きい場合も同じ状態になる'),
		'幅超過: 正当な大きいウィンドウの可能性も書く', large);

	// 4) 縦横比 … ここだけは加工の疑いを強く出す。タブレットの断りも入れる
	const aspect = await notice('aspect', '親B', ['03.png']);
	assert(aspect.includes('加工をした画像の可能性'), '縦横比: 加工の疑いはここで出す', aspect);
	assert(aspect.includes('タブレット'), '縦横比: タブレットの断りを入れる', aspect);

	// 5) 残り3種も、それぞれ別の対処方法で締める
	const single = await notice('single', '祖A1', []);
	assert(single.includes('2枚以上') && single.includes('OCR処理を開始する'),
		'1枚だけ: 必要な枚数と、読み取りだけする方法を書く', single);
	const mismatch = await notice('width-mismatch', '親A', ['02.png']);
	assert(mismatch.includes('横幅がそろっていません') && mismatch.includes('同じ端末'),
		'幅不揃い: そろえ方を書く', mismatch);
	const noScroll = await notice('no-scroll', '親A', []);
	assert(noScroll.includes('重なりが残る'), 'スクロール未検出: 撮り方を書く', noScroll);

	// 6) どの文面にも px 値・縦横比の数値を出さない（開発ログ行き）
	for (const [name, text] of [['幅不足', small], ['幅超過', large], ['縦横比', aspect],
		['1枚だけ', single], ['幅不揃い', mismatch], ['スクロール未検出', noScroll]]) {
		assert(!/\d{3,4}\s*[x×]\s*\d{3,4}/.test(text) && !/縦横比\s*\d/.test(text),
			name + ': px値・縦横比の数値を本文に出さない', text);
		assert(!text.includes('処理を中止します'), name + ': 内部向けの言い回しを残さない', text);
	}

	// 7) 6種の文面がすべて違う（分岐が実際に効いている）
	const all = [small, large, aspect, single, mismatch, noScroll];
	assert(new Set(all).size === 6, '6種の中止文がすべて異なる', all.map((s) => s.slice(0, 20)));

	// 8) 呼び出し側の前置き「<セット名>の画像結合に失敗しました: 」に続けて読める形か
	assert(all.every((s) => /^(親A|親B|祖A1) /.test(s)),
		'中止文は「だれの画像か」から始まる（前置きの続きとして読める）', all.map((s) => s.slice(0, 8)));

	// 9) 結合がエラーだけで終わったとき、FAB の未読の印を立てない（exam）。
	//    印を頼りに「結果画像」を開いた人が空振りすると、印そのものの意味が壊れる。
	const badges = await page.evaluate(async () => {
		const orig = buildStitchedSetImage;
		persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
		const run = async (impl) => {
			buildStitchedSetImage = impl;
			fabUnseen.stitch = false;
			const made = await runImageStitching();
			return {
				made: made,
				dot: !document.getElementById('fab-dot-stitch').hidden,
				tab: !document.getElementById('result-tab-stitch').disabled,
				text: document.getElementById('stitch-result-content').textContent
			};
		};
		const failed = await run(async () => { throw new Error('祖A1 の画像「02.png」は、ゲーム画面が小さく写っています。'); });
		const ok = await run(async () => {
			const c = document.createElement('canvas');
			c.width = 100; c.height = 100;
			c._personMeta = []; c._stitchWarnings = [];
			return c;
		});
		buildStitchedSetImage = orig;
		persons[0].files = [];
		return { failed: failed, ok: ok };
	});
	assert(badges.failed.dot === false,
		'結合がエラーだけ: FAB の未読の印を立てない', badges.failed);
	assert(badges.failed.tab === true,
		'結合がエラーだけ: 「結果画像」タブは開ける（理由を読めるように）', badges.failed);
	assert(badges.failed.text.includes('小さく写っています'),
		'結合がエラーだけ: 中止文がタブの中に出る', badges.failed.text.slice(0, 80));
	assert(badges.ok.dot === true,
		'結合が成功: FAB の未読の印を立てる', badges.ok);

	await ctx.close();
}

/* ============================================================
 * 画像結合の結末の伝え方（special.html）
 *
 * special は anyOutput（エラーの帯を出した場合も true）だけを見て
 * 「画像を結合しました」のトーストを出し、未読の印を立て、引き出しを開いていた。
 * **1枚も結合できていなくても「結合しました」と言う**状態だったので、
 * 成功・全滅・一部成功で出し分けるようにした（2026-09-13・25セッション目）。
 * 引き出しはどの結末でも開く（中止の理由を読めるように）が、未読の印は成功したときだけ。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	await page.waitForTimeout(1500);

	// special は結合が終わると引き出しを自動で開き、openDrawer() が開いた時点で
	// その引き出しの未読の印を消す。そのため「印が画面に残るか」では検証できない。
	// markFabUnseen() の呼ばれ方を記録して、成功したときだけ呼ばれることを見る。
	const runStitch = (okSets) => page.evaluate(async (ok) => {
		const origBuild = buildStitchedSetImage;
		const origMark = markFabUnseen;
		const marked = [];
		const makeCanvas = () => {
			const c = document.createElement('canvas');
			c.width = 80; c.height = 80;
			c._personMeta = []; c._stitchWarnings = [];
			return c;
		};
		// 親Aセット・親Bセットの両方を対象にする（一部成功を作れるように）
		selectPersonSet(1);   // タブ化（C-54）で非表示の概念は無いが、B を見ている状態で回す
		persons[0].files = [{ name: 'a1.png' }, { name: 'a2.png' }];
		persons[3].files = [{ name: 'b1.png' }, { name: 'b2.png' }];
		buildStitchedSetImage = async (setIdx) => {
			if (ok.indexOf(setIdx) === -1) throw new Error('親A の画像「a1.png」は、ゲーム画面が小さく写っています。');
			return makeCanvas();
		};
		markFabUnseen = (k) => { marked.push(k); return origMark(k); };
		document.getElementById('toast-message').textContent = '';
		await runImageStitching();
		const out = {
			toast: document.getElementById('toast-message').textContent,
			marked: marked,
			drawerOpen: !document.getElementById('stitch-drawer').hidden,
			text: document.getElementById('stitch-result-content').textContent
		};
		buildStitchedSetImage = origBuild;
		markFabUnseen = origMark;
		persons[0].files = [];
		persons[3].files = [];
		selectPersonSet(0);
		closeDrawer();
		return out;
	}, okSets);

	// 1) 両方とも成功 … これまでどおり「結合しました」
	const allOk = await runStitch([0, 1]);
	assert(allOk.toast === '画像を結合しました', '両方成功: 「画像を結合しました」', allOk);
	assert(allOk.marked.includes('stitch'), '両方成功: 未読の印を立てる', allOk);
	assert(allOk.drawerOpen === true, '両方成功: 引き出しを開く', allOk);

	// 2) 両方とも失敗 … 「結合しました」と言わない。印も立てない
	const allNg = await runStitch([]);
	assert(allNg.toast === '画像を結合できませんでした',
		'両方失敗: 事実に合ったトーストを出す', allNg);
	assert(!allNg.toast.includes('結合しました'), '両方失敗: 成功を名乗らない', allNg.toast);
	assert(allNg.marked.length === 0, '両方失敗: 未読の印を立てない', allNg);
	assert(allNg.drawerOpen === true, '両方失敗: 引き出しは開く（中止の理由を読めるように）', allNg);
	assert(allNg.text.includes('小さく写っています'), '両方失敗: 中止文が引き出しの中に出る',
		allNg.text.slice(0, 60));

	// 3) 片方だけ成功 … 失敗があったことが分かる文面にする
	const partial = await runStitch([0]);
	assert(partial.toast === '一部のセットは結合できませんでした',
		'一部成功: 失敗があったことを伝える', partial);
	assert(partial.marked.includes('stitch'), '一部成功: 結合できたぶんがあるので未読の印は立てる', partial);
	assert(partial.drawerOpen === true, '一部成功: 引き出しを開く', partial);
	assert(partial.text.includes('小さく写っています'), '一部成功: 失敗したセットの理由も並べる',
		partial.text.slice(0, 60));

	// わざと起こした結合の失敗は console.error に出る（既存の作り）。それ以外は出ないこと
	const unexpected = errors.filter((e) => !String(e).includes('ゲーム画面が小さく写っています'));
	assert(unexpected.length === 0, 'special 結合の結末: 想定外のコンソールエラーが出ない', unexpected);
	await ctx.close();
}

/* ============================================================
 * 「元に戻す」の契約（special.html のドラフト／uma-skill-deck.html の各操作）
 *
 * 実機で一括削除（当時は「すべて外す」）→「元に戻す」が復元されない事故があった。原因は、ドラフトの保存
 * （saveDraftScope）が skillIds の配列ごと差し替えるのに、復元処理が古い配列へ書いていたこと。
 * ここでは Undo 対象の各操作について「実行 → 元に戻す → 実行前と一致」の往復と永続化、
 * そして「戻せなかったときに成功を名乗らない・スタックを減らさない」ことを見る。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	await page.waitForTimeout(2500);
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	// ドラフトに12種を仕込んで読み直す（実機の再現手順「条件で検索→94種追加」の代わり）
	await page.evaluate((ids) => localStorage.setItem('umaSkillDeck:draftScope:special',
		JSON.stringify({ skillIds: ids, updatedAt: '' })), PICK.map((s) => s.id));
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(2500);
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="__draft__"]');
	await page.waitForTimeout(400);

	const storedDraft = () => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds);
	const undoUi = () => page.evaluate(() => ({
		count: Number(document.querySelector('#deck-template-panel [data-usd-el="selected-count"]').textContent),
		btn: getComputedStyle(document.getElementById('deck-undo-btn')).display !== 'none',
		badge: document.getElementById('deck-undo-count').textContent,
		toast: document.getElementById('toast-message').textContent,
		stack: UmaSkillDeckCore.undoCount(),
		scope: UmaSkillDeckCore.getUndoScope(),
	}));

	// 各パネルの × は削除モードのときだけ出る（C-57 の (9)）。押した状態なら触らない（押すと OFF になる）
	// 一括削除（C-3）は削除モードに関係なく押せる
	const ensureDeleteMode = () => page.evaluate(() => {
		const b = document.querySelector('#deck-template-panel [data-usd-el="mode-delete"]');
		if (b.getAttribute('aria-pressed') !== 'true') b.click();
	});

	// 1) 追加済みスキルを全て削除 → 元に戻す。件数・保存先・ボタンの3つが揃って戻ること
	await ensureDeleteMode();
	await page.click('#deck-template-panel [data-usd-el="clear-skills"]');
	await page.waitForTimeout(200);
	const cleared = await undoUi();
	assert(cleared.count === 0 && (await storedDraft()).length === 0,
		'undo: 一括削除で0種になり、保存先も空になる', cleared);
	assert(cleared.btn && cleared.badge === '1' && cleared.stack === 1 && cleared.scope === 'list',
		'undo: 「元に戻す ①」が出る（scope は list）', cleared);
	assert(cleared.toast === '追加済みスキル' + PICK.length + '種を削除しました',
		'undo: 実行時のトーストは doneLabel（単位は「種」・C-3 で「削除」に）', cleared.toast);
	// 1') 「元に戻す」は画面左下に固定（css/shell.css の .uma-undo-fab。C-55 の (4)(5)）。
	//     ②のパネルの中ではないので、①のタブへ移っても同じ場所に見える。引き出しを開いている間は隠れる。
	await page.click('#step-tab-0');
	await page.waitForTimeout(200);
	const fixedUndo = await page.evaluate(() => {
		const b = document.getElementById('deck-undo-btn');
		const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
		return { position: cs.position, shownOnTab1: cs.display !== 'none' && !b.hidden, inside: r.left >= 0 && r.bottom <= innerHeight && r.top > innerHeight / 2,
			leftHalf: r.right < innerWidth / 2 };
	});
	assert(fixedUndo.position === 'fixed' && fixedUndo.shownOnTab1 && fixedUndo.inside && fixedUndo.leftHalf,
		'undo: 「元に戻す」は左下に固定され、①のタブでも見える', fixedUndo);
	const drawerUndo = await page.evaluate(async () => {
		openDrawer('result');
		await new Promise(r => setTimeout(r, 450));
		const whileOpen = document.getElementById('deck-undo-btn').hidden;
		closeDrawer();
		await new Promise(r => setTimeout(r, 450));
		return { whileOpen, afterClose: document.getElementById('deck-undo-btn').hidden };
	});
	assert(drawerUndo.whileOpen === true && drawerUndo.afterClose === false,
		'undo: 引き出しを開いている間は隠れ、閉じると戻る', drawerUndo);
	await page.click('#step-tab-1');
	await page.waitForTimeout(200);
	await page.click('#deck-undo-btn');
	await page.waitForTimeout(200);
	const restored = await undoUi();
	assert(restored.count === PICK.length, 'undo: 「元に戻す」でスキルの数が元に戻る', restored);
	assert((await storedDraft()).join() === PICK.map((s) => s.id).join(),
		'undo: 保存先（localStorage）にも元の12種が同じ順で戻る');
	assert(!restored.btn && restored.stack === 0, 'undo: 戻せたのでボタンが消える', restored);
	assert(restored.toast === '削除した追加済みスキル' + PICK.length + '種を戻しました',
		'undo: 戻したときのトーストは undoneLabel（削除した追加済みスキルN種を戻しました）', restored.toast);

	// 2) 永続化。リロードしても戻した状態のまま
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(2500);
	const afterReload = await page.evaluate(() =>
		document.querySelector('#deck-template-panel .uma-subtab[data-tab-id="__draft__"]').textContent);
	assert(/12種/.test(afterReload), 'undo: リロードしても戻した12種が保たれている', afterReload);

	// 3) 個別に外す → 元に戻す。位置も含めて実行前と一致すること
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="__draft__"]');
	await page.waitForTimeout(400);
	const single = await page.evaluate(() => {
		const read = () => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds;
		const before = read();
		const del = document.querySelector('#deck-template-panel [data-usd-el="mode-delete"]');
		if (del.getAttribute('aria-pressed') !== 'true') del.click();   // × は削除モードのときだけ出る（C-57）
		document.querySelectorAll('#deck-template-panel [data-usd-act="template-skill-remove"]')[3].click();
		const removedLen = read().length;
		const ok = UmaSkillDeckCore.performUndo();
		return { ok, removedLen, same: read().join() === before.join(), stack: UmaSkillDeckCore.undoCount(),
			toast: document.getElementById('toast-message').textContent };
	});
	assert(single.removedLen === PICK.length - 1 && single.ok && single.same && single.stack === 0,
		'undo: 個別に外す→元に戻すで、順序も含めて実行前と一致する', single);
	assert(single.toast === '外したスキル「' + PICK[3].name + '」を戻しました',
		'undo: 個別に外したものを戻すトーストは「外したスキル「○○」を戻しました」', single.toast);

	// 3b) 別画面の編集ビューは無くなった（C-53）。一括削除のあと、①のタブへ移って戻っても「元に戻す」は残り、戻せる
	await ensureDeleteMode();
	await page.click('#deck-template-panel [data-usd-el="clear-skills"]');
	await page.waitForTimeout(200);
	const beforeSwitch = await undoUi();
	await page.evaluate(() => { selectStepTab(0); selectStepTab(1); });
	await page.waitForTimeout(300);
	const afterSwitch = await undoUi();
	assert(beforeSwitch.stack === 1 && afterSwitch.stack === 1 && afterSwitch.btn && afterSwitch.scope === 'list',
		'undo: タブを移って戻っても「元に戻す」は残る（scope は list）', { beforeSwitch, afterSwitch });
	assert(await page.evaluate(() => UmaSkillDeckCore.performUndo()) && (await storedDraft()).length === PICK.length,
		'undo: 残っている「元に戻す」で12種が戻る');

	// 4) 成功を名乗る前の検証。apply() が false／状態が変わらない／積んだ時点の状態に戻らない、はどれも失敗扱い
	for (const [how, entry] of [
		['apply が false を返す', 'return false'],
		['apply が true でも状態が変わらない', 'return true'],
	]) {
		const r = await page.evaluate((body) => {
			const before = UmaSkillDeckCore.undoCount();
			UmaSkillDeckCore.pushUndo({ scope: UmaSkillDeckCore.getUndoScope(), doneLabel: 'テスト用の操作', undoneLabel: 'テスト用の操作を戻しました',
				probe: () => 'same', apply: new Function(body) });
			const pushed = UmaSkillDeckCore.undoCount();
			const ok = UmaSkillDeckCore.performUndo();
			return { before, pushed, ok, after: UmaSkillDeckCore.undoCount(), toast: document.getElementById('toast-message').textContent };
		}, entry);
		assert(r.pushed === r.before + 1 && r.ok === false && r.after === r.pushed,
			'undo: ' + how + ' → 失敗扱いでスタックを消費しない', r);
		assert(r.toast === '元に戻せませんでした', 'undo: ' + how + ' → 成功メッセージを出さない', r.toast);
		await page.evaluate(() => UmaSkillDeckCore.dropUndoScope(UmaSkillDeckCore.getUndoScope()));
	}
	const notBack = await page.evaluate(() => {
		let v = 'before';
		UmaSkillDeckCore.pushUndo({ scope: UmaSkillDeckCore.getUndoScope(), doneLabel: 'テスト用の操作', undoneLabel: 'テスト用の操作を戻しました',
			probe: () => v, apply: () => { v = 'somewhere-else'; return true; } });
		v = 'changed';
		const ok = UmaSkillDeckCore.performUndo();
		return { ok, stack: UmaSkillDeckCore.undoCount(), toast: document.getElementById('toast-message').textContent };
	});
	assert(!notBack.ok && notBack.stack === 1 && notBack.toast === '元に戻せませんでした',
		'undo: 変わりはしたが積んだ時点の状態に戻らない → 失敗扱い', notBack);
	await page.evaluate(() => UmaSkillDeckCore.dropUndoScope(UmaSkillDeckCore.getUndoScope()));

	// 5) 契約に欠けがあれば積まない（旧形式「ラベル＋関数」は例外になる）
	const rejected = await page.evaluate(() => {
		try { UmaSkillDeckCore.pushUndo('ラベル', () => {}); return 'no-throw'; } catch (e) { return String(e.message); }
	});
	assert(rejected !== 'no-throw' && rejected.startsWith('pushUndo:'), 'undo: 旧形式（ラベル＋関数）は例外にして積まない', rejected);
	const partial = await page.evaluate(() => {
		try { UmaSkillDeckCore.pushUndo({ scope: 'editor', doneLabel: 'x', apply: () => true, probe: () => '' }); return 'no-throw'; } catch (e) { return String(e.message); }
	});
	assert(partial.includes('undoneLabel'), 'undo: undoneLabel の無いエントリは例外にして積まない', partial);
	assert(await page.evaluate(() => UmaSkillDeckCore.undoCount()) === 0, 'undo: 例外になったエントリは積まれていない');

	// 6) スナップショットは独立したコピー（元の配列を空にしても残る）
	const cloned = await page.evaluate(() => {
		const src = { ids: ['a', 'b'] };
		const s = UmaSkillDeckCore.snapshot(src);
		src.ids.length = 0;
		return s.ids.length;
	});
	assert(cloned === 2, 'undo: snapshot() は元の配列への参照を持たない', cloned);

	/* ---- 一度に2種以上足したときだけ「元に戻す」に積む（線引きの固定） ----
	   「94種を追加 → 一括削除 → 元に戻す」は戻せるのに「94種を追加 → 元に戻す」は
	   できない、という非対称をなくすために足した。1種だけの追加はチップの×で消せるので積まない。 */
	// 下ごしらえ: ドラフトを空にしてから、条件で絞らずに一覧から選ぶ
	await page.evaluate(() => { localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: [], updatedAt: '' })); });
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(2500);
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="__draft__"]');
	await page.waitForTimeout(400);

	// ピッカーを開いて、指定した数だけチェックして追加する
	const bulkAdd = async (n) => {
		await page.click('#deck-template-panel [data-usd-act="editor-pick"]');
		await page.waitForTimeout(700);
		const r = await page.evaluate((count) => {
			const boxes = [...document.querySelectorAll('[data-usd-el="skill-check"]')].slice(0, count);
			boxes.forEach((b) => { b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); });
			const before = UmaSkillDeckCore.undoCount();
			document.querySelector('[data-usd-act="picker-add"]').click();
			return { before, after: UmaSkillDeckCore.undoCount(), toast: document.getElementById('toast-message').textContent };
		}, n);
		await page.evaluate(() => UmaSkillDeckCore.closeSkillPicker());
		await page.waitForTimeout(400);
		return r;
	};
	const draftCount = () => page.evaluate(() =>
		Number(document.querySelector('#deck-template-panel [data-usd-el="selected-count"]').textContent));

	// 1) 複数種の追加 → 元に戻す → 追加前の件数に戻る
	const before3 = await draftCount();
	const add3 = await bulkAdd(3);
	const after3 = await draftCount();
	assert(after3 === before3 + 3 && add3.after === add3.before + 1,
		'undo: 3種まとめて追加すると「元に戻す」に1件積まれる', { before3, after3, ...add3 });
	assert(add3.toast === '3種を追加しました', 'undo: 追加のトーストは doneLabel（N種を追加しました）', add3.toast);
	const undone = await page.evaluate(() => ({ ok: UmaSkillDeckCore.performUndo(), toast: document.getElementById('toast-message').textContent }));
	await page.waitForTimeout(300);
	assert(undone.ok && (await draftCount()) === before3,
		'undo: 追加を元に戻すと追加前の件数に戻る', { undone, now: await draftCount() });
	assert(undone.toast === '追加した3種を取り消しました',
		'undo: 追加の取り消しは「取り消しました」（削除系の「戻しました」とは別の型）', undone.toast);
	assert((await page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds.length)) === before3,
		'undo: 保存先（localStorage）も追加前に戻る');

	// 2) 1種だけの追加は積まない。トーストも出ない（文面が直前のまま動かないことで見る）
	const toastBefore1 = await page.evaluate(() => document.getElementById('toast-message').textContent);
	const add1 = await bulkAdd(1);
	assert(add1.after === add1.before, 'undo: 1種だけの追加は「元に戻す」に積まない', add1);
	assert(add1.toast === toastBefore1,
		'undo: 1種だけの追加ではトーストも出ない（文面が直前のまま）', { toastBefore1, after: add1.toast });

	// 3) 追加済みを含む追加は、実際に足った分だけを戻す
	//    いま1種入っているので、その1種＋新しい2種をチェックして足す → 足るのは2種
	const withDupe = await page.evaluate(async () => {
		const cur = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds;
		return { cur };
	});
	await page.click('#deck-template-panel [data-usd-act="editor-pick-text"]');
	await page.waitForTimeout(700);
	const dupeRun = await page.evaluate(async (already) => {
		// すでに入っている1種＋未追加の2種を、テキスト照合で同時に採用する
		const names = UmaSkillDeckCore.getSkillEntries(already).map((s) => s.name);
		const master = UmaSkillDeckCore.getMasterSkills().filter((s) => !already.includes(s.id)).slice(0, 2).map((s) => s.name);
		document.querySelector('[data-usd-el="paste-input"]').value = names.concat(master).join('\n');
		document.querySelector('[data-usd-act="paste-run"]').click();
		return { pasted: names.length + master.length, already: names.length };
	}, withDupe.cur);
	await page.waitForTimeout(600);
	const dupeAdd = await page.evaluate(() => {
		const before = UmaSkillDeckCore.undoCount();
		const beforeIds = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds.slice();
		document.querySelector('[data-usd-act="picker-add"]').click();
		const afterIds = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds.slice();
		return { before, after: UmaSkillDeckCore.undoCount(), beforeIds, afterIds, toast: document.getElementById('toast-message').textContent };
	});
	await page.evaluate(() => UmaSkillDeckCore.closeSkillPicker());
	await page.waitForTimeout(400);
	assert(dupeRun.pasted === 3 && dupeRun.already === 1 && dupeAdd.afterIds.length === dupeAdd.beforeIds.length + 2,
		'undo: 3件照合のうち1件は追加済みなので、足るのは2種', { ...dupeRun, added: dupeAdd.afterIds.length - dupeAdd.beforeIds.length });
	assert(dupeAdd.toast === '2種を追加しました',
		'undo: 文言が数えるのも「実際に足った数」（チェック数ではない）', dupeAdd.toast);
	const dupeUndo = await page.evaluate(() => {
		const ok = UmaSkillDeckCore.performUndo();
		return { ok, ids: JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds };
	});
	await page.waitForTimeout(300);
	assert(dupeUndo.ok && dupeUndo.ids.join() === dupeAdd.beforeIds.join(),
		'undo: 取り消すのは実際に足った2種だけで、元から入っていた1種は巻き込まない', dupeUndo.ids.length);

	// 4) 追加1回につきトーストは1回だけ（pushUndo が出す1回に一本化されている）
	const toastCount = await page.evaluate(async () => {
		let n = 0;
		const real = window.showToast;
		window.showToast = (m) => { n++; return real(m); };
		UmaSkillDeckCore.configure({ toast: window.showToast });
		document.querySelector('#deck-template-panel [data-usd-act="editor-pick"]').click();
		await new Promise((r) => setTimeout(r, 500));
		[...document.querySelectorAll('[data-usd-el="skill-check"]')].slice(0, 2)
			.forEach((b) => { b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); });
		document.querySelector('[data-usd-act="picker-add"]').click();
		UmaSkillDeckCore.closeSkillPicker();
		window.showToast = real;
		UmaSkillDeckCore.configure({ toast: real });
		return n;
	});
	assert(toastCount === 1, 'undo: 追加1回につきトーストは1回だけ', toastCount);

	assert(errors.length === 0, 'undo: special でコンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

{
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	// 保存データの姿（updatedAt は復元時に打ち直すので除く）。メモリ上と localStorage の両方を見る
	const state = () => page.evaluate(() => {
		const shape = (d) => UmaSkillDeckCore.probeOf(JSON.parse(JSON.stringify(d, (k, v) => (k === 'updatedAt' ? undefined : v))));
		return JSON.stringify({
			mem: shape(UmaSkillDeckCore.getUserData()),
			stored: shape(JSON.parse(localStorage.getItem('umaSkillDeck:userData'))),
		});
	});
	const undoBtn = () => page.evaluate(() => ({
		shown: !document.getElementById('undo-button').hidden && getComputedStyle(document.getElementById('undo-button')).display !== 'none',
		badge: document.getElementById('undo-count-badge').textContent,
		scope: UmaSkillDeckCore.getUndoScope(),
		stack: UmaSkillDeckCore.undoCount(),
	}));
	// 「実行 → 元に戻す → 実行前と一致」の往復を1操作ずつ
	async function roundTrip(label, run, expectScope, expectToast) {
		const before = await state();
		await page.evaluate(run);
		await page.waitForTimeout(200);
		const mid = await state();
		const btn = await undoBtn();
		const ok = await page.evaluate(() => performUndo());
		const toast = await page.evaluate(() => document.getElementById('toast-message').textContent);
		await page.waitForTimeout(300);
		const after = await state();
		assert(toast === expectToast, 'undo(deck): ' + label + ' を戻したトーストが undoneLabel', toast);
		assert(mid !== before, 'undo(deck): ' + label + ' で保存データが変わる');
		assert(btn.shown && btn.scope === expectScope && btn.stack === 1,
			'undo(deck): ' + label + ' で「元に戻す」が ' + expectScope + ' に1件出る', btn);
		assert(ok && after === before, 'undo(deck): ' + label + ' → 元に戻すで、メモリと保存先が実行前と一致', { ok });
		assert((await undoBtn()).shown === false, 'undo(deck): ' + label + ' を戻すとボタンが消える');
	}

	// 削除は「選んでいるタブのスキルセット」に効く（C-53）。先にそのタブを選ぶ
	await page.evaluate((id) => templateManager.openEditor(id), USER_DATA.templates[0].templateId);
	await page.waitForTimeout(200);
	await roundTrip('スキルセット削除', () => { document.querySelector('[data-usd-act="template-delete"]').click(); }, 'list',
		'削除したスキルセット「' + USER_DATA.templates[0].name + '」を戻しました');

	await page.click('#tab-btn-record');
	await page.waitForTimeout(300);
	await roundTrip('比較シート削除', () => { document.querySelector('#record-list button[title="削除"]').click(); }, 'list',
		'削除した比較シート「' + USER_DATA.records[0].name + '」を戻しました');

	await page.evaluate((id) => openRecordEditor(id), RECORD_ID);
	await page.waitForTimeout(500);
	const other = USER_DATA.templates[1].templateId;
	// 63セッション目（第2波）: Deck の画面に出る語を「テンプレート」→「スキルセット」に統一した（C-54）。
	await roundTrip('元のスキルセットの切り替え', new Function(`switchRecordTemplate(${JSON.stringify(other)})`), 'sheet',
		'スキルセットを「' + USER_DATA.templates[0].name + '」に戻しました');
	await roundTrip('候補の削除', () => { removeCandidate('c_a'); }, 'sheet', '削除した候補「親A」を戻しました');
	await roundTrip('スキル行の削除', new Function(`removeSkillFromRecord(${JSON.stringify(PICK[2].id)})`), 'sheet',
		'削除したスキル「' + PICK[2].name + '」の行を戻しました');

	// 多段：3つ続けて実行し、3回続けて戻せること
	const multi = await state();
	await page.evaluate(([sid, tid]) => { removeCandidate('c_b'); removeSkillFromRecord(sid); switchRecordTemplate(tid); }, [PICK[0].id, other]);
	await page.waitForTimeout(200);
	const stacked = await undoBtn();
	await page.evaluate(() => { performUndo(); performUndo(); performUndo(); });
	await page.waitForTimeout(300);
	assert(stacked.stack === 3 && stacked.badge === '3' && (await state()) === multi && (await undoBtn()).stack === 0,
		'undo(deck): 3操作を続けて戻すと、実行前と一致する', stacked);

	// シートを閉じるとシートのぶんは捨てられ、一覧の scope になる。開き直しても復活しない
	await page.evaluate(() => removeCandidate('c_b'));
	await page.waitForTimeout(200);
	const sheetStack = (await undoBtn()).stack;
	await page.evaluate(() => closeRecordEditor());
	await page.waitForTimeout(200);
	const closedSheet = await undoBtn();
	assert(sheetStack === 1 && closedSheet.scope === 'list' && closedSheet.stack === 0 && !closedSheet.shown,
		'undo(deck): シートを閉じるとシートのぶんは捨てられ、一覧の scope になる', closedSheet);
	await page.evaluate((id) => openRecordEditor(id), RECORD_ID);
	await page.waitForTimeout(300);
	assert((await undoBtn()).stack === 0, 'undo(deck): シートを開き直しても前のぶんは復活しない');
	await page.evaluate(() => closeRecordEditor());
	await page.waitForTimeout(200);

	// 比較シートへの一括追加も、編集画面と同じ受け皿の約束で動く（scope は 'sheet'）
	await page.evaluate((id) => openRecordEditor(id), RECORD_ID);
	await page.waitForTimeout(400);
	const sheetAdd = await page.evaluate(async () => {
		const before = draftRecord.skillIds.slice();
		openRecordSkillPicker();
		await new Promise((r) => setTimeout(r, 500));
		[...document.querySelectorAll('[data-usd-el="skill-check"]')].slice(0, 3)
			.forEach((b) => { b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); });
		document.querySelector('[data-usd-act="picker-add"]').click();
		UmaSkillDeckCore.closeSkillPicker();
		const after = draftRecord.skillIds.slice();
		return {
			added: after.length - before.length, before,
			toast: document.getElementById('toast-message').textContent,
			scope: UmaSkillDeckCore.getUndoScope(), stack: UmaSkillDeckCore.undoCount(),
		};
	});
	await page.waitForTimeout(300);
	assert(sheetAdd.added === 3 && sheetAdd.stack === 1 && sheetAdd.scope === 'sheet' && sheetAdd.toast === '3種を追加しました',
		'undo(deck): 比較シートへの一括追加が sheet の scope に1件積まれる', sheetAdd);
	const sheetUndo = await page.evaluate(() => ({
		ok: performUndo(), ids: draftRecord.skillIds.slice(),
		toast: document.getElementById('toast-message').textContent,
	}));
	await page.waitForTimeout(300);
	assert(sheetUndo.ok && sheetUndo.ids.join() === sheetAdd.before.join() && sheetUndo.toast === '追加した3種を取り消しました',
		'undo(deck): 取り消すと比較シートの行が追加前と一致', { ok: sheetUndo.ok, toast: sheetUndo.toast });
	await page.evaluate(() => closeRecordEditor());
	await page.waitForTimeout(200);

	// 一覧で積んだもの（比較シート削除）は、シートを開いている間は隠れ、閉じると戻る
	// 代表データの比較シートは1件なので、複製して2件にしてから片方を消す（開くシートを残すため）
	await page.evaluate((id) => { duplicateRecord(id); document.querySelector('#record-list button[title="削除"]').click(); }, RECORD_ID);
	await page.waitForTimeout(200);
	const listEntry = await undoBtn();
	await page.evaluate(() => openRecordEditor(UmaSkillDeckCore.getUserData().records[0].recordId));
	await page.waitForTimeout(300);
	const hiddenInSheet = await undoBtn();
	await page.evaluate(() => closeRecordEditor());
	await page.waitForTimeout(200);
	const backInList = await undoBtn();
	assert(listEntry.shown && listEntry.scope === 'list' && !hiddenInSheet.shown && hiddenInSheet.scope === 'sheet'
		&& backInList.shown && backInList.stack === 1,
		'undo(deck): 一覧のぶんはシートを開いている間だけ隠れ、閉じると数ごと戻る', { listEntry, hiddenInSheet, backInList });
	assert(await page.evaluate(() => performUndo()), 'undo(deck): 一覧に戻ってから比較シート削除を元に戻せる');

	// スキルセットの編集：チップの×で外す → 別のタブへ移っても「元に戻す」は残り、戻せる（C-53。
	// 別画面の編集ビューは無くなったので、閉じて捨てる動きも無い）
	await page.click('#tab-btn-template');
	await page.waitForTimeout(300);

	/* --- C-1: Deck 単体ページの呼び名は「スキルセット」のまま ---
	   special の②だけを「因子セット」にしたので（core の opts.setLabel）、**こちらは据え置き**。
	   ここが「因子セット」になったら、setLabel を通さず core の文字列を直接書き換えた印。
	   Deck の語を「テンプレート」から「スキルセット」に揃えたのは C-66 の5節。 */
	const deckLabel = await page.evaluate(() => {
		const p = document.getElementById('template-panel-root');
		const head = p.querySelector('[data-usd-el="head"] .usd-roster-h--top');
		return {
			tab: document.getElementById('tab-btn-template').textContent.trim(),
			head: head ? head.textContent.replace(/\s+/g, '').replace(/\d+/g, 'N') : null,
			placeholder: p.querySelector('[data-usd-el="name-input"]').placeholder,
			tabsAria: p.querySelector('.uma-subtabs').getAttribute('aria-label'),
			// A の枠は Deck にもできるが、**見出しは出さない**（opts.sectionHeadings）。
			// Deck は A しか無く入れ物も「スキルセット」なので、出すと二重に見える
			secA: !!p.querySelector('[data-usd-el="section-a"]'),
			secAHead: !!p.querySelector('[data-usd-el="section-a"] .uma-section-head'),
			// B・C は special だけ（opts.extraScopes を渡さない画面には出ない）
			scopes: p.querySelectorAll('[data-usd-scope-section]').length
		};
	});
	assert(deckLabel.tab === 'スキルセット' && deckLabel.head === 'スキルセット（N／N件）'
		&& deckLabel.placeholder === '新しいスキルセットの名前' && deckLabel.tabsAria === 'スキルセット',
		'C-1(deck): Deck 単体ページの呼び名は「スキルセット」のまま（special だけ setLabel で「因子セット」）', deckLabel);
	assert(deckLabel.secA && !deckLabel.secAHead,
		'C-1(deck): A の枠はあるが見出しは出さない（A しか無い画面で「スキルセット」が二重に見えるため）', deckLabel);
	assert(deckLabel.scopes === 0,
		'C-2a(deck): B・C の節は出ない（opts.extraScopes を渡していないため）', deckLabel.scopes);
	await page.evaluate((id) => templateManager.openEditor(id), USER_DATA.templates[0].templateId);
	await page.waitForTimeout(300);
	// × は削除モードのときだけ出る（C-57 の (9)）
	await page.evaluate(() => { const b = document.querySelector('#template-panel-root [data-usd-el="mode-delete"]'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); });
	await page.click('[data-usd-act="template-skill-remove"]');
	await page.waitForTimeout(200);
	const editorEntry = await undoBtn();
	await page.evaluate((id) => templateManager.openEditor(id), USER_DATA.templates[1].templateId);
	await page.waitForTimeout(300);
	const afterSwitch = await undoBtn();
	const undoneAcross = await page.evaluate(() => performUndo());
	assert(editorEntry.scope === 'list' && editorEntry.stack === 1 && afterSwitch.stack === 1 && undoneAcross,
		'undo(deck): スキルセットのタブを切り替えても「元に戻す」は残り、戻せる', { editorEntry, afterSwitch, undoneAcross });

	// インポート（全データの置き換え）→ 元に戻す。確認ダイアログは Playwright が打ち消すので差し替える（F-25）
	await page.click('#tab-btn-data');
	await page.waitForTimeout(300);
	const importBefore = await state();
	const imported = await page.evaluate(() => {
		const next = JSON.parse(JSON.stringify(UmaSkillDeckCore.getUserData()));
		next.templates = next.templates.slice(0, 1);
		next.templates[0].name = 'インポートで入れ替えたテンプレート';
		next.records = [];
		document.getElementById('import-textarea').value = JSON.stringify(next);
		const realConfirm = window.confirm;
		window.confirm = () => true;
		importData();
		window.confirm = realConfirm;
		return { toast: document.getElementById('toast-message').textContent, templates: UmaSkillDeckCore.getUserData().templates.length, records: UmaSkillDeckCore.getUserData().records.length };
	});
	const importBtn = await undoBtn();
	assert(imported.templates === 1 && imported.records === 0 && imported.toast === 'インポートしました',
		'undo(deck): インポートで全データが置き換わる', imported);
	assert(importBtn.shown && importBtn.stack === 1 && importBtn.scope === 'list', 'undo(deck): インポートが「元に戻す」に1件積まれる', importBtn);
	const importUndo = await page.evaluate(() => ({ ok: performUndo(), toast: document.getElementById('toast-message').textContent }));
	await page.waitForTimeout(300);
	assert(importUndo.ok && importUndo.toast === 'インポート前のデータに戻しました' && (await state()) === importBefore,
		'undo(deck): インポート→元に戻すで、メモリと保存先がインポート前と一致', importUndo);

	assert(errors.length === 0, 'undo(deck): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();

	// 「元に戻しました：」＋実行時の文、という連結はやめた（「戻した結果、外れた」とも読めるため）。
	// 画面は上で見ているので、ここではソースに残っていないことを見る。
	const leftover = ['js/uma-skill-deck-core.js', 'js/uma-skill-deck.js', 'special.html', 'uma-skill-deck.html', 'exam.html']
		.filter((p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8').includes('元に戻しました：'));
	assert(leftover.length === 0, 'undo: 「元に戻しました：」という接頭辞がソースに残っていない', leftover);
}

/* ============================================================
 * 結合画像を保存するときのファイル名（special / exam 共通・js/stitch.js）
 *
 * 形式は `YYMMDD_NNN_指定名称.png`。
 * 組み立てそのもの（純粋な関数）と、実際の保存リンクに付く名前の両方を見る。
 * 通し番号は全ツール共通の1キー（uma-shared-save-seq）で、指定名称はツールごと。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);

	// --- 組み立て（純粋な関数）---
	const f = await page.evaluate(() => ({
		// 現地時間で取る。この時刻は協定世界時だと前日（2026-09-11T15:30Z）になる
		localDate: stitchTodayStamp(new Date(2026, 8, 12, 0, 30)),
		utcWouldBe: new Date(2026, 8, 12, 0, 30).toISOString().slice(0, 10),
		empty: stitchFormatSaveName('260912', 1, ''),
		named: stitchFormatSaveName('260912', 1, '9月因子'),
		underscore: stitchFormatSaveName('260912', 1, '先行_A'),
		hyphen: stitchFormatSaveName('260912', 1, '先行-A'),
		trimmed: stitchFormatSaveName('260912', 1, '　先行 . '),
		over999: stitchFormatSaveName('260912', 1000, 'x'),
		at999: stitchFormatSaveName('260912', 999, 'x'),
		forbidden: stitchSanitizeSaveNameInput('先行/差し\\逃げ:A*B?C"D<E>F|G'),
		control: stitchSanitizeSaveNameInput('先\u0000行\u001f差\u007fし'),
		tooLong: stitchSanitizeSaveNameInput('あ'.repeat(60)).length,
	}));
	assert(f.localDate === '260912', 'ファイル名: 日付を現地時間で取る（協定世界時なら前日になる時刻）',
		{ 現地: f.localDate, 協定世界時: f.utcWouldBe });
	assert(f.empty === '260912_001', 'ファイル名: 名前が空欄なら末尾にアンダーバーを残さない', f.empty);
	assert(f.named === '260912_001_9月因子', 'ファイル名: 名前を入れると YYMMDD_NNN_名前 になる', f.named);
	assert(f.underscore === '260912_001_先行_A', 'ファイル名: 名前の中のアンダーバーは置き換えない', f.underscore);
	assert(f.hyphen === '260912_001_先行-A', 'ファイル名: 名前の中のハイフンはそのまま残る', f.hyphen);
	assert(f.trimmed === '260912_001_先行', 'ファイル名: 前後の空白と末尾のピリオドは落とす', f.trimmed);
	assert(f.at999 === '260912_999_x' && f.over999 === '260912_1000_x',
		'ファイル名: 999までは3桁ゼロ埋め、超えたら4桁へ伸びる', { at999: f.at999, over999: f.over999 });
	assert(f.forbidden === '先行／差し＼逃げ：A＊B？C”D＜E＞F｜G',
		'ファイル名: 使えない文字は全角へ置き換わる', f.forbidden);
	assert(f.control === '先行差し', 'ファイル名: 制御文字は落とす', f.control);
	assert(f.tooLong === 40, 'ファイル名: 指定名称は40文字で止まる', f.tooLong);

	// --- 通し番号（全ツール共通の1キー・日付が変わったら001へ）---
	const seq = await page.evaluate(() => {
		const KEY = 'uma-shared-save-seq';
		const today = stitchTodayStamp();
		const out = {};
		localStorage.removeItem(KEY);
		out.noRecord = stitchPeekSaveSeq();
		localStorage.setItem(KEY, JSON.stringify({ date: today, n: 7 }));
		out.sameDay = stitchPeekSaveSeq();
		localStorage.setItem(KEY, JSON.stringify({ date: '260911', n: 42 }));
		out.otherDay = stitchPeekSaveSeq();
		localStorage.setItem(KEY, '壊れた値');
		out.broken = stitchPeekSaveSeq();
		localStorage.removeItem(KEY);
		out.consumed = [stitchConsumeSaveSeq(), stitchConsumeSaveSeq(), stitchConsumeSaveSeq()];
		out.stored = JSON.parse(localStorage.getItem(KEY));
		out.storedKey = KEY;
		localStorage.removeItem(KEY);
		return out;
	});
	assert(seq.noRecord === 1, '通し番号: 記録が無ければ001から', seq.noRecord);
	assert(seq.sameDay === 8, '通し番号: 同じ日なら続きから', seq.sameDay);
	assert(seq.otherDay === 1, '通し番号: 日付が変わったら001に戻る', seq.otherDay);
	assert(seq.broken === 1, '通し番号: 保存領域が壊れていても001から（落ちない）', seq.broken);
	assert(JSON.stringify(seq.consumed) === '[1,2,3]', '通し番号: 保存のたびに1つ進む', seq.consumed);
	assert(seq.stored.date === (await page.evaluate(() => stitchTodayStamp())) && seq.stored.n === 3,
		'通し番号: 日付と番号が保存領域に残る', seq.stored);

	// --- 実際の保存リンクに付く名前（special）---
	// 結合の中身は通さず、結果ブロックの組み立てだけを本物の関数で作る。
	const mkBlocks = async (n) => await page.evaluate((count) => {
		const container = document.getElementById('stitch-result-content');
		container.innerHTML = '';
		for (let i = 0; i < count; i++) {
			const c = document.createElement('canvas');
			c.width = 8; c.height = 8;
			c.getContext('2d').fillRect(0, 0, 8, 8);
			appendStitchResultBlock(container, { id: i === 0 ? 'A' : 'B', label: i === 0 ? '親Aセット' : '親Bセット' }, c);
		}
		setSectionReady('stitch', true);
		return container.querySelectorAll('a[download]').length;
	}, n);

	// 押したときに本当のダウンロードが始まらないよう、既定の動作だけ止める。
	// 名前を入れ直す処理は先に登録されているので、こちらが後から止めても効き方は変わらない。
	const saveNth = async (i, type) => await page.evaluate(([idx, kind]) => {
		const link = document.querySelectorAll('#stitch-result-content a[download]')[idx];
		link.addEventListener('click', (e) => e.preventDefault());
		link.addEventListener('dragstart', (e) => e.preventDefault());
		link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		const beforePress = link.download;
		link.dispatchEvent(new (kind === 'click' ? MouseEvent : Event)(kind, { bubbles: true, cancelable: true }));
		return { beforePress: beforePress, saved: link.download };
	}, [i, type]);

	await page.evaluate(() => { localStorage.removeItem('uma-shared-save-seq'); });
	const stamp = await page.evaluate(() => stitchTodayStamp());
	// 名前の欄は結果と同じ引き出しの中にあるので、結果を作って開いてからでないと触れない
	const made = await mkBlocks(2);
	assert(made === 2, 'ファイル名(special): 2セットぶんの保存リンクができる', made);
	await page.evaluate(() => openDrawer('stitch'));
	await page.waitForTimeout(500);
	assert(await page.isVisible('#stitch-save-name'), 'ファイル名(special): 名前の欄が引き出しの先頭に出る');
	await page.fill('#stitch-save-name', '9月因子');
	await page.waitForTimeout(150);

	const first = await saveNth(0, 'click');
	assert(first.saved === stamp + '_001_9月因子.png',
		'ファイル名(special): 名前を入れて保存すると YYMMDD_001_名前.png になる', first.saved);
	const second = await saveNth(1, 'click');
	assert(second.saved === stamp + '_002_9月因子.png',
		'ファイル名(special): 2枚目を保存すると番号が002へ進む', second.saved);

	// 長押し／右クリックからの保存では click が飛ばない（Chromium実測）。
	// pointerdown で名前を入れ直し、contextmenu で番号を進める作りになっている。
	const longPress = await saveNth(0, 'contextmenu');
	assert(longPress.beforePress === stamp + '_003_9月因子.png' && longPress.saved === stamp + '_003_9月因子.png',
		'ファイル名(special): 長押し（contextmenu）での保存でも番号が進む', longPress);

	// 名前を空にすると、リンクの名前からも末尾のアンダーバーが消える
	await page.fill('#stitch-save-name', '');
	await page.waitForTimeout(150);
	const emptyName = await page.evaluate(() => document.querySelector('#stitch-result-content a[download]').download);
	assert(emptyName === stamp + '_004.png',
		'ファイル名(special): 名前を消すと YYMMDD_NNN.png になる（末尾のアンダーバーなし）', emptyName);

	// 入力欄そのもの: 使えない文字は打った時点で全角になり、注意書きが出る
	await page.fill('#stitch-save-name', '先行/差し');
	await page.waitForTimeout(150);
	const typed = await page.evaluate(() => ({
		value: document.getElementById('stitch-save-name').value,
		note: !document.getElementById('stitch-save-name-note').hidden,
		preview: document.getElementById('stitch-save-name-preview').textContent,
		max: document.getElementById('stitch-save-name').getAttribute('maxlength'),
		saved: localStorage.getItem('uma-special-save-name'),
	}));
	assert(typed.value === '先行／差し', 'ファイル名(special): 入力欄の使えない文字がその場で全角になる', typed.value);
	assert(typed.note, 'ファイル名(special): 置き換えたことを知らせる注意書きが出る');
	assert(typed.preview === stamp + '_004_先行／差し', 'ファイル名(special): 見本が今の名前と番号を映す', typed.preview);
	assert(typed.max === '40', 'ファイル名(special): 入力欄が40文字で止まる', typed.max);
	assert(typed.saved === '先行／差し', 'ファイル名(special): 入力した名前はツールごとのキーに覚える', typed.saved);

	// 開き直しても名前が戻る
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(1200);
	const restored = await page.evaluate(() => document.getElementById('stitch-save-name').value);
	assert(restored === '先行／差し', 'ファイル名(special): 開き直しても名前が戻る', restored);

	assert(errors.length === 0, 'ファイル名(special): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

{
	// exam 側。番号のキーは special と同じ1つ、名前のキーはツールごとに別。
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.waitForTimeout(800);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.waitForTimeout(300);

	const keys = await page.evaluate(() => ({
		seq: STITCH_SEQ_STORAGE_KEY,
		name: STITCH_SAVE_NAME_STORAGE_KEY,
	}));
	assert(keys.seq === 'uma-shared-save-seq', 'ファイル名(exam): 通し番号のキーは全ツール共通', keys.seq);
	assert(keys.name === 'uma-exam-save-name', 'ファイル名(exam): 指定名称のキーはツールごと', keys.name);

	// 結果画像がまだ無いときは名前の欄も出さない（案内だけ読ませる）
	assert(await page.evaluate(() => document.getElementById('stitch-name-wrap').hidden),
		'ファイル名(exam): 結果画像が無いうちは名前の欄を出さない');

	const stamp = await page.evaluate(() => {
		localStorage.removeItem('uma-shared-save-seq');
		return stitchTodayStamp();
	});
	await page.evaluate(() => {
		const container = document.getElementById('stitch-result-content');
		container.innerHTML = '';
		const c = document.createElement('canvas');
		c.width = 8; c.height = 8;
		c.getContext('2d').fillRect(0, 0, 8, 8);
		c._personMeta = [];
		appendStitchResultBlock(container, { id: 'A', label: '親Aセット' }, c);
		setSectionReady('stitch', true);
	});
	assert(!(await page.evaluate(() => document.getElementById('stitch-name-wrap').hidden)),
		'ファイル名(exam): 結果画像ができると名前の欄が出る');

	// 名前の欄は「判定の結果」の引き出しの、結果画像のタブの中にある
	await page.evaluate(() => { selectResultTab('stitch'); openDrawer('result'); });
	await page.waitForTimeout(500);
	assert(await page.isVisible('#stitch-save-name'), 'ファイル名(exam): 名前の欄が結果画像のタブの先頭に出る');
	await page.fill('#stitch-save-name', '技能試験');
	await page.waitForTimeout(150);
	const examSave = await page.evaluate(() => {
		const link = document.querySelector('#stitch-result-content a[download]');
		link.addEventListener('click', (e) => e.preventDefault());
		link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		return link.download;
	});
	assert(examSave === stamp + '_001_技能試験.png', 'ファイル名(exam): exam でも同じ形式で名前が付く', examSave);

	// 旧UIには名前の欄を置かない。旧UIで保存したものは指定名称なしになる。
	await page.evaluate(() => exitNewUi());
	await page.waitForTimeout(400);
	const oldUi = await page.evaluate(() => {
		const link = document.querySelector('#stitch-result-content a[download]');
		link.addEventListener('click', (e) => e.preventDefault());
		link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		return {
			download: link.download,
			nameWrapInOldSlot: document.getElementById('old-stitch-slot').contains(document.getElementById('stitch-name-wrap')),
		};
	});
	assert(oldUi.download === stamp + '_002.png', 'ファイル名(exam): 旧UIでの保存は指定名称なしになる', oldUi.download);
	assert(!oldUi.nameWrapInOldSlot, 'ファイル名(exam): 名前の欄は旧UIへ移動しない');

	// 新UIへ戻せば、また名前が付く
	await page.evaluate(() => enterNewUi());
	await page.waitForTimeout(400);
	const backToNew = await page.evaluate(() => document.querySelector('#stitch-result-content a[download]').download);
	assert(backToNew === stamp + '_003_技能試験.png', 'ファイル名(exam): 新UIへ戻すと名前が付き直す', backToNew);

	assert(errors.length === 0, 'ファイル名(exam): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * exam.html — 「結合画像の表示」（集計バナー／印／凡例／集計条件）の設定パネルと合成の分岐
 *
 * パネルは JS が作る（renderStitchShowPanel）。見るのは次の4点。
 *   1. 既定（保存値なし）: バナー・凡例・集計条件は ON、印は OFF、印が OFF の間は凡例が選べない
 *   2. 切り替えが localStorage に保存され、開き直しても戻る
 *   3. 模式図の帯がチェックに追従する（印 OFF なら凡例の帯も消える／両方 OFF なら区切り線ごと消える）
 *   4. 合成の分岐: 列見出しだけの帯 / 補足欄の行の出し分け（OCR は回さず、描画関数を直接呼ぶ）
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.waitForTimeout(800);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.waitForTimeout(300);
	await page.evaluate(() => selectStepTab(2));
	await page.waitForTimeout(300);

	const stateOf = () => page.evaluate(() => {
		const q = (k) => document.querySelector('#stitch-show-panel input[data-stitch-show="' + k + '"]');
		const hiddenOf = (part) => Array.from(document.querySelectorAll('#stitch-show-panel [data-stitch-part="' + part + '"]')).map((el) => el.hidden);
		return {
			inPanel2: document.getElementById('step-panel-2').contains(document.getElementById('stitch-show-panel')),
			inputs: document.querySelectorAll('#stitch-show-panel input[data-stitch-show]').length,
			marksIsOptAttrIcons: q('marks') === document.getElementById('opt-attr-icons'),
			banner: q('banner').checked, marks: q('marks').checked, legend: q('legend').checked, conditions: q('conditions').checked,
			scenario: q('scenario').checked, scenarioDisabled: q('scenario').disabled,
			scenarioGrey: q('scenario').closest('.stitch-show-item').classList.contains('is-off'),
			order: Array.from(document.querySelectorAll('#stitch-show-panel input[data-stitch-show]')).map((i) => i.getAttribute('data-stitch-show')).join(','),
			legendDisabled: q('legend').disabled,
			legendGrey: q('legend').closest('.stitch-show-item').classList.contains('is-off'),
			eff: stitchShowEffective(),
			wire: { banner: hiddenOf('banner'), scenario: hiddenOf('scenario'), legend: hiddenOf('legend'), conditions: hiddenOf('conditions'), notebar: hiddenOf('notebar'), header: hiddenOf('header') },
			marksOn: Array.from(document.querySelectorAll('#stitch-show-panel [data-stitch-part="marks"]')).map((el) => el.classList.contains('is-on')),
			stored: ['uma-exam-attr-icons', 'uma-exam-stitch-banner', 'uma-exam-stitch-legend', 'uma-exam-stitch-conditions', 'uma-exam-stitch-scenario'].map((k) => localStorage.getItem(k))
		};
	});

	let s = await stateOf();
	assert(s.inPanel2 && s.inputs === 5 && s.marksIsOptAttrIcons, '結合画像の表示: ②にチェック5つのパネルがあり、印は既存の #opt-attr-icons のまま', s);
	assert(s.order === 'banner,scenario,marks,legend,conditions', '結合画像の表示: 並びは 検出数カード → シナリオ因子 → 印 → 凡例 → 集計条件', s.order);
	assert(s.banner && s.scenario && !s.marks && s.legend && s.conditions, '結合画像の表示: 既定は検出数カード・シナリオ因子・凡例・集計条件が ON、印が OFF', s);
	assert(s.scenarioDisabled && s.scenarioGrey && s.eff.scenario === false && s.wire.scenario.every((h) => h),
		'結合画像の表示: シナリオ因子を1件も選んでいなければ、チェックは灰色で選べず、模式図の帯も出ない', s);
	assert(s.legendDisabled && s.legendGrey && s.eff.legend === false, '結合画像の表示: 印が OFF の間、凡例は選べず灰色になり、合成にも効かない', s);
	assert(s.wire.header.every((h) => !h) && s.wire.banner.every((h) => !h) && s.wire.legend.every((h) => h) && s.wire.conditions.every((h) => !h) && s.wire.notebar.every((h) => !h),
		'結合画像の表示: 模式図は列見出し・バナー・集計条件が出て、凡例だけ消えている', s.wire);
	assert(s.marksOn.length > 0 && s.marksOn.every((v) => !v), '結合画像の表示: 印が OFF なら模式図の〇は灰色', s.marksOn);

	// シナリオ因子を1件選ぶと選べるようになり、模式図の帯が出る。OFF にすると帯が消え、保存される。
	// 検出数カード（banner）と目覚めの脚注は影響を受けない
	await page.evaluate(() => setScenarioFactorsAll(true));
	await page.waitForTimeout(200);
	s = await stateOf();
	assert(!s.scenarioDisabled && !s.scenarioGrey && s.eff.scenario === true && s.wire.scenario.every((h) => !h),
		'結合画像の表示: シナリオ因子を選ぶとチェックが選べるようになり、模式図の帯が出る', s);
	await page.click('#stitch-show-scenario');
	await page.waitForTimeout(200);
	s = await stateOf();
	assert(!s.scenario && s.stored[4] === '0' && s.wire.scenario.every((h) => h) && s.wire.banner.every((h) => !h),
		'結合画像の表示: シナリオ因子を OFF にすると uma-exam-stitch-scenario に保存され、帯だけ消える（カードと脚注は残る）', s);
	await page.click('#stitch-show-scenario');
	await page.evaluate(() => setScenarioFactorsAll(false));
	await page.waitForTimeout(200);
	s = await stateOf();
	assert(s.scenario && s.scenarioDisabled && s.stored[4] === '1', '結合画像の表示: 因子を全部外すとまた灰色になるが、チェックの状態は保たれる', s);

	// 印を ON にすると凡例が選べるようになり、模式図の〇に色が付き、凡例の帯が出る
	await page.click('#opt-attr-icons');
	await page.waitForTimeout(200);
	s = await stateOf();
	assert(s.marks && !s.legendDisabled && !s.legendGrey && s.eff.legend === true, '結合画像の表示: 印を ON にすると凡例が選べるようになる', s);
	assert(s.marksOn.every((v) => v) && s.wire.legend.every((h) => !h), '結合画像の表示: 印を ON にすると模式図の〇に色が付き、凡例の帯が出る', s.wire);
	assert(s.stored[0] === '1', '結合画像の表示: 印の保存キーは従来のまま（uma-exam-attr-icons）', s.stored);

	// バナーと集計条件を OFF にする → 保存される・模式図の帯が消える。両方 OFF でも補足欄は凡例のぶん残る
	await page.click('#stitch-show-banner');
	await page.click('#stitch-show-conditions');
	await page.waitForTimeout(200);
	s = await stateOf();
	assert(!s.banner && !s.conditions && s.stored[1] === '0' && s.stored[3] === '0', '結合画像の表示: バナー・集計条件の OFF が uma-exam-stitch-* に保存される', s.stored);
	assert(s.wire.banner.every((h) => h) && s.wire.conditions.every((h) => h) && s.wire.notebar.every((h) => !h) && s.wire.header.every((h) => !h),
		'結合画像の表示: バナー・集計条件の帯が消え、列見出しと凡例（補足欄）は残る', s.wire);

	// 凡例も OFF → 補足欄は区切り線ごと消える
	await page.click('#stitch-show-legend');
	await page.waitForTimeout(200);
	s = await stateOf();
	assert(!s.legend && s.stored[2] === '0' && s.wire.notebar.every((h) => h), '結合画像の表示: 凡例も OFF にすると補足欄が区切り線ごと消える', s.wire);

	// チェックに触れると模式図の対応する帯が強調される
	const hot = await page.evaluate(() => {
		const label = document.querySelector('#stitch-show-panel [data-stitch-hot="banner"]');
		label.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const on = Array.from(document.querySelectorAll('#stitch-show-panel [data-stitch-part="banner"]')).map((el) => el.classList.contains('is-hot'));
		label.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
		const off = Array.from(document.querySelectorAll('#stitch-show-panel [data-stitch-part="banner"]')).map((el) => el.classList.contains('is-hot'));
		return { on, off };
	});
	assert(hot.on.every((v) => v) && hot.off.every((v) => !v), '結合画像の表示: チェックに触れている間だけ模式図の帯が強調される', hot);

	// 開き直しても戻る（印 ON・バナー OFF・凡例 OFF・集計条件 OFF）
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.evaluate(() => selectStepTab(2));
	await page.waitForTimeout(300);
	s = await stateOf();
	assert(s.marks && !s.banner && !s.legend && !s.conditions && s.eff.banner === false && s.eff.legend === false && s.eff.conditions === false,
		'結合画像の表示: 開き直しても切り替えが戻る', s);
	assert(s.scenario === true && s.stored[4] === '1', '結合画像の表示: シナリオ因子の保存値があればそれが戻る', s);

	// 保存キーの移行: uma-exam-stitch-banner が '0' で uma-exam-stitch-scenario が無ければ、シナリオ因子も OFF で開く
	await page.evaluate(() => { localStorage.setItem('uma-exam-stitch-banner', '0'); localStorage.removeItem('uma-exam-stitch-scenario'); });
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.evaluate(() => selectStepTab(2));
	await page.waitForTimeout(300);
	s = await stateOf();
	assert(!s.banner && !s.scenario && s.stored[4] === null, '結合画像の表示: 保存の移行＝バナー OFF・シナリオ因子の保存無しで開くと、シナリオ因子も OFF（保存は書かない）', s);
	await page.evaluate(() => { localStorage.setItem('uma-exam-stitch-banner', '1'); localStorage.removeItem('uma-exam-stitch-scenario'); });
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.evaluate(() => selectStepTab(2));
	await page.waitForTimeout(300);
	s = await stateOf();
	assert(s.banner && s.scenario, '結合画像の表示: 保存の移行＝バナー ON なら シナリオ因子も ON で開く', s);

	// 合成の分岐（OCR は回さず、描画関数を直接呼ぶ）
	const draw = await page.evaluate(() => {
		const withCards = stitchDrawPersonBanner(600, '親A', 12, 3, null);
		const headerOnly = stitchDrawPersonBanner(600, '親A', 12, 3, null, { cards: false });
		// 補足欄。集計条件の行が出る状態（対象を絞る＝除外スキル12種）で見る
		const prevScope = targetScopeMode;
		setTargetScopeMode('curated');
		const info = { kinds: ['sp70', 'green'], suppressed: ['size'] };
		const both = stitchDrawSharedNoteBar(600, 600, info);
		const legendOnly = stitchDrawSharedNoteBar(600, 600, info, { legend: true, conditions: false });
		const condOnly = stitchDrawSharedNoteBar(600, 600, info, { legend: false, conditions: true });
		const none = stitchDrawSharedNoteBar(600, 600, info, { legend: false, conditions: false });
		setTargetScopeMode('default');
		const condOnlyNoRows = stitchDrawSharedNoteBar(600, 600, info, { legend: false, conditions: true });
		setTargetScopeMode(prevScope);
		return {
			withCardsH: withCards.height, headerOnlyH: headerOnly.height, sameW: withCards.width === headerOnly.width,
			bothH: both ? both.height : 0, legendOnlyH: legendOnly ? legendOnly.height : 0, condOnlyH: condOnly ? condOnly.height : 0,
			none: none === null, condOnlyNoRows: condOnlyNoRows === null
		};
	});
	assert(draw.headerOnlyH > 0 && draw.headerOnlyH < draw.withCardsH && draw.sameW, '結合画像の表示: バナー OFF は列見出しだけの帯になる（幅は同じ・高さは低い）', draw);
	assert(draw.bothH > draw.legendOnlyH && draw.bothH > draw.condOnlyH && draw.legendOnlyH > 0 && draw.condOnlyH > 0,
		'結合画像の表示: 補足欄は凡例・集計条件をそれぞれ省ける', draw);
	assert(draw.none && draw.condOnlyNoRows, '結合画像の表示: 補足欄に出す行が無ければ欄ごと置かない（null）', draw);

	// 列見出しの帯: 検出数カードとシナリオ因子の行を個別に省ける。カード OFF・因子 ON なら見出しの下に因子の行を詰める
	const band = await page.evaluate(() => {
		const factors = { items: [{ text: 'URAシナリオ：★2' }, { text: 'アオハル杯シナリオ：−' }], more: false };
		const h = (opts) => stitchDrawPersonBanner(600, '親A', 12, 3, factors, opts).height;
		const full = h(undefined), noCards = h({ cards: false }), noFactors = h({ factors: false }), none = h({ cards: false, factors: false });
		// 因子を渡さなければ（1件も選んでいない）、因子 ON でも見出し＋カードだけ
		const noneSelected = stitchDrawPersonBanner(600, '親A', 12, 3, null, { cards: true, factors: true }).height;
		return { full, noCards, noFactors, none, noneSelected, factorBlockSame: (full - noFactors) === (noCards - none) };
	});
	assert(band.full > band.noCards && band.noCards > band.none && band.full > band.noFactors && band.noFactors > band.none,
		'結合画像の表示: 列見出しの帯はカード・因子の行を個別に省ける', band);
	assert(band.factorBlockSame && band.noneSelected === band.noFactors,
		'結合画像の表示: カード OFF でも因子の行の高さは同じで、因子を1件も選んでいなければ行は出ない', band);

	/* --- 帯と脚注は「検出したものだけ」（64セッション目・段E） ---
	   帯（人ごと）＝検出の上位3種＋「他」／脚注（画像全体）＝全検出分、の役割分担。
	   因子名はデータから取り、このファイルには書かない。 */
	const factorOnly = await page.evaluate(() => {
		const prevResults = personResults;
		const prevFactors = selectedScenarioFactors.size > 0;
		setScenarioFactorsAll(true);
		const all = activeScenarioFactors();
		// 検出の有無だけを作る（starsFor / scenarioFactorHighlight / buildTargetAdjustmentNotes が読むのは
		// detectedSkills と skillStars だけ）。描画は呼ばない。
		const seed = (names) => {
			personResults = PERSON_LABELS.map(() => null);
			personResults[0] = { detectedSkills: new Set(names), skillStars: {} };
			names.forEach((n, i) => { personResults[0].skillStars[n] = (i % 3) + 1; });
		};
		const read = () => {
			const h = scenarioFactorHighlight(0);
			return h ? { n: h.items.length, more: h.more, texts: h.items.map((x) => x.text) } : null;
		};
		const note = () => buildTargetAdjustmentNotes(null, [0]).filter((t) => t.indexOf('シナリオ因子') !== -1);
		seed([]);              const none = { band: read(), note: note() };
		seed(all.slice(0, 2)); const two = { band: read(), note: note() };
		seed(all.slice(0, 4)); const four = { band: read(), note: note() };
		seed(all);             const full = { band: read(), note: note() };
		personResults = prevResults;
		setScenarioFactorsAll(prevFactors);
		return { total: all.length, none: none, two: two, four: four, full: full,
			firstFour: all.slice(0, 4) };
	});
	assert(factorOnly.total === 24, '段E: 総括チェック ON で24種が対象', factorOnly.total);
	assert(factorOnly.none.band === null && factorOnly.none.note.length === 0,
		'段E: 1種も検出していなければ、帯も脚注も出さない（24種を対象にしていても）', factorOnly.none);
	assert(factorOnly.two.band.n === 2 && factorOnly.two.band.more === false
		&& factorOnly.two.band.texts.every((t) => t.indexOf('−') === -1),
		'段E: 検出2種なら2行だけ。残り枠が「−」で埋まらない', factorOnly.two.band);
	assert(factorOnly.four.band.n === 3 && factorOnly.four.band.more === true
		&& factorOnly.four.band.texts.every((t) => t.indexOf('−') === -1),
		'段E: 検出4種なら上位3種＋「他」', factorOnly.four.band);
	assert(factorOnly.full.band.n === 3 && factorOnly.full.band.more === true,
		'段E: 24種すべて検出しても帯は上位3種＋「他」', factorOnly.full.band);
	assert(factorOnly.two.note.length === 1 && /^検出したシナリオ因子（2種）：/.test(factorOnly.two.note[0]),
		'段E: 脚注は検出分だけを数えて並べる（2種）', factorOnly.two.note);
	assert(factorOnly.four.note[0] === '検出したシナリオ因子（4種）：' + factorOnly.firstFour.join('・'),
		'段E: 脚注は検出した因子の名前を全部並べる（帯の上位3種とは別）', factorOnly.four.note);
	assert(/^検出したシナリオ因子（24種）：/.test(factorOnly.full.note[0]),
		'段E: 24種すべて検出すれば脚注には24種が並ぶ', factorOnly.full.note[0].slice(0, 30));

	// 押した時点の設定の固定（run）。処理中に「結合画像の表示」を変えても、その回の出力は押した時点の設定になる。
	// OCR は回さず、stitchOnePerson と processImages を差し替えて経路だけ通す。
	const frozen = await page.evaluate(async () => {
		const origStitch = stitchOnePerson;
		const origProcess = processImages;
		const fakeCanvas = () => {
			const c = document.createElement('canvas');
			c.width = 600; c.height = 400;
			c._stitchWarnings = []; c._sourcePlacements = [];
			return c;
		};
		stitchOnePerson = async () => fakeCanvas();
		persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
		setStitchShow('banner', true);
		setStitchShow('conditions', true);
		setAttrIcons(false);
		const out = {};
		try {
			// (1) run を控えてから設定を変えても、合成は控えた値を使う
			const run = captureRun();
			setStitchShow('banner', false);
			const fromRun = await buildStitchedSetImage(0, run);
			const fromNow = await buildStitchedSetImage(0, captureRun());
			out.runH = fromRun.height; out.nowH = fromNow.height;
			out.runSnapshotKept = run.show.banner === true && stitchShow.banner === false;
			out.uiSaved = localStorage.getItem('uma-exam-stitch-banner') === '0';
			// (2) 「OCR処理＋画像結合」の経路。処理中（processImages の最中）に切り替える
			setStitchShow('banner', true);
			processImages = async (o) => { await new Promise((r) => setTimeout(r, 60)); return false; };
			const p = processImagesAndStitch();
			await new Promise((r) => setTimeout(r, 10));
			setStitchShow('banner', false);
			await p;
			const img = document.querySelector('#stitch-result-content img');
			if (img) { try { await img.decode(); } catch (e) {} }
			out.flowH = img ? img.naturalHeight : 0;
			out.flowStitchRunBanner = lastStitchRun ? lastStitchRun.show.banner : null;
			out.bannerNow = stitchShow.banner;
			// (3) 画像（files）も押した時点で固定される。処理中に足しても、その回には入らない
			setStitchShow('banner', true);
			const run3 = captureRun();
			persons[0].files.push({ name: 'c.png' });
			out.runFiles = run3.files[0].length; out.nowFiles = persons[0].files.length;
		} finally {
			stitchOnePerson = origStitch;
			processImages = origProcess;
			persons[0].files = [];
			setStitchShow('banner', true);
			document.getElementById('stitch-result-content').innerHTML = '';
			setSectionReady('stitch', false);
			fabUnseen.stitch = false; updateFabBadges();
			if (typeof closeDrawer === 'function') closeDrawer();
		}
		return out;
	});
	assert(frozen.runH > frozen.nowH && frozen.runSnapshotKept && frozen.uiSaved,
		'設定の固定: 控えた run で合成するとバナーが残り、画面のチェックと保存は変えたとおりになる', frozen);
	assert(frozen.flowH === frozen.runH && frozen.flowStitchRunBanner === true && frozen.bannerNow === false,
		'設定の固定: 「OCR処理＋画像結合」の処理中に変えても、その回の出力は押した時点の設定', frozen);
	assert(frozen.runFiles === 2 && frozen.nowFiles === 3, '設定の固定: 画像の枚数・並びも押した時点で固定される', frozen);

	// 375px: 模式図がチェックの下に回り、横スクロールが出ない
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(500);
	const narrow = await page.evaluate(() => {
		const body = document.querySelector('#stitch-show-panel .stitch-show-body').getBoundingClientRect();
		const wire = document.querySelector('#stitch-show-panel .stitch-wire').getBoundingClientRect();
		return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wireBelow: wire.top >= body.bottom - 1, wireW: wire.width };
	});
	assert(narrow.sw === narrow.cw && narrow.wireBelow && narrow.wireW < 200, '結合画像の表示: 375px では模式図がチェックの下に小さく並び、横スクロールが出ない', narrow);

	assert(errors.length === 0, '結合画像の表示: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * exam.html — 結果画像の引き出しからの「画像を更新」（③）: 状態の判定
 *
 * OCR は回さず、stitchOnePerson を差し替えて「OCR が済んだ状態」（lastOcrRun）を作る。
 * 見るのは stitchRefreshState() の遷移:
 *   same（表示設定が同じ）→ ready（違う）→ same（戻した）／
 *   stale（画像の足し引き・範囲・シナリオ因子・集計モード・親Bセットの開閉・OCR だけ回した）→ 戻せば same
 * と、refreshStitchedImages() が OCR を回さずに作り直し、未読の印を立てないこと。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.waitForTimeout(800);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.waitForTimeout(300);

	const flow = await page.evaluate(async () => {
		const origStitch = stitchOnePerson;
		const origProcess = processImages;
		let stitchCalls = 0;
		let processCalls = 0;
		stitchOnePerson = async () => {
			stitchCalls++;
			const c = document.createElement('canvas');
			c.width = 600; c.height = 400;
			c._stitchWarnings = []; c._sourcePlacements = [];
			return c;
		};
		processImages = async () => { processCalls++; return true; };
		const out = { states: {} };
		const imgH = async () => {
			const img = document.querySelector('#stitch-result-content img');
			if (!img) return 0;
			try { await img.decode(); } catch (e) {}
			return img.naturalHeight;
		};
		try {
			setStitchShow('banner', true); setStitchShow('scenario', true); setStitchShow('legend', true); setStitchShow('conditions', true);
			setAttrIcons(false);
			// シナリオ因子を1件選んだ状態で OCR したことにする（因子の行の ON/OFF が効く状態）
			setTargetScopeMode('default'); setScenarioFactorsAll(true); setCountMode('equivalence');
			persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
			out.states.beforeAny = stitchRefreshState();
			// 「OCR が済んで結合画像ができた」状態を作る
			const run = captureRun();
			lastOcrRun = run;
			await runImageStitching(run);
			out.firstH = await imgH();
			out.states.afterStitch = stitchRefreshState();
			// 表示設定を変える → ready、戻す → same
			setStitchShow('banner', false);
			out.states.bannerOff = stitchRefreshState();
			setStitchShow('banner', true);
			out.states.bannerBack = stitchRefreshState();
			// シナリオ因子の行だけ OFF → ready、戻す → same
			setStitchShow('scenario', false);
			out.states.scenarioOff = stitchRefreshState();
			setStitchShow('scenario', true);
			out.states.scenarioBack = stitchRefreshState();
			// 印を ON にして「画像を更新」→ OCR は回らず、合成だけやり直る。未読の印は立たない
			setAttrIcons(true);
			setStitchShow('banner', false);
			out.states.readyForRefresh = stitchRefreshState();
			fabUnseen.stitch = false; updateFabBadges();
			const beforeCalls = stitchCalls;
			await refreshStitchedImages();
			out.refreshStitched = stitchCalls > beforeCalls;
			out.refreshProcessCalls = processCalls;
			out.refreshedH = await imgH();
			out.states.afterRefresh = stitchRefreshState();
			out.unseenAfterRefresh = fabUnseen.stitch;
			out.shownAttrIcons = lastStitchRun.attrIcons;
			out.shownBanner = lastStitchRun.show.banner;
			out.storedBanner = localStorage.getItem('uma-exam-stitch-banner');
			out.panelBanner = document.querySelector('#stitch-show-panel input[data-stitch-show="banner"]').checked;
			// 画像の足し引き → stale、戻す → same
			persons[0].files.push({ name: 'c.png' });
			updateProcessBtn();
			out.states.fileAdded = stitchRefreshState();
			persons[0].files.pop();
			updateProcessBtn();
			out.states.fileBack = stitchRefreshState();
			// 範囲 → stale → 戻す
			setTargetScopeMode('curated');
			out.states.scopeChanged = stitchRefreshState();
			setTargetScopeMode('default');
			out.states.scopeBack = stitchRefreshState();
			// シナリオ因子の ON/OFF → stale → 戻す（総括チェック1つになったので、OFF にして戻す）
			setScenarioFactorsAll(false);
			out.states.factorOn = stitchRefreshState();
			setScenarioFactorsAll(true);
			out.states.factorOff = stitchRefreshState();
			// 集計モード → stale → 戻す
			setCountMode('individual');
			out.states.countMode = stitchRefreshState();
			setCountMode('equivalence');
			out.states.countModeBack = stitchRefreshState();
			// 親Bセットの開閉 → stale → 戻す
			toggleSetB();
			out.states.setB = stitchRefreshState();
			toggleSetB();
			out.states.setBBack = stitchRefreshState();
			// 結果画像より後に OCR だけ回した → stale（表示設定を変えても押せない）
			lastOcrRun = captureRun();
			setStitchShow('banner', true);
			out.states.ocrOnlyAfter = stitchRefreshState();
			// stale のときは refreshStitchedImages が何もしない
			const callsBefore = stitchCalls;
			await refreshStitchedImages();
			out.staleRefreshIgnored = stitchCalls === callsBefore;
		} finally {
			stitchOnePerson = origStitch;
			processImages = origProcess;
			persons[0].files = [];
			setAttrIcons(false);
			setStitchShow('banner', true);
			setScenarioFactorsAll(false);
			lastOcrRun = null; lastStitchRun = null;
			document.getElementById('stitch-result-content').innerHTML = '';
			setSectionReady('stitch', false);
			fabUnseen.stitch = false; updateFabBadges();
			if (typeof closeDrawer === 'function') closeDrawer();
		}
		return out;
	});
	const st = flow.states;
	assert(st.beforeAny === 'none' && st.afterStitch === 'same', '画像を更新: 結果画像が無ければ none、できた直後は same', st);
	assert(st.bannerOff === 'ready' && st.bannerBack === 'same', '画像を更新: 表示設定を変えると ready、戻すと same', st);
	assert(st.scenarioOff === 'ready' && st.scenarioBack === 'same', '画像を更新: シナリオ因子の行だけ変えても ready、戻すと same', st);
	assert(flow.refreshStitched && flow.refreshProcessCalls === 0 && flow.refreshedH < flow.firstH && st.afterRefresh === 'same',
		'画像を更新: OCR を回さず合成だけやり直し、更新後は same に戻る（バナー無しで低くなる）', flow);
	assert(flow.unseenAfterRefresh === false, '画像を更新: 見ている最中の更新では未読の印を立てない', flow.unseenAfterRefresh);
	assert(flow.shownAttrIcons === true && flow.shownBanner === false && flow.storedBanner === '0' && flow.panelBanner === false,
		'画像を更新: 更新した画像の表示設定は今の値で、②のパネルと保存も同じ', flow);
	assert(st.fileAdded === 'stale' && st.fileBack === 'same', '画像を更新: 画像を足すと stale、戻すと same', st);
	assert(st.scopeChanged === 'stale' && st.scopeBack === 'same', '画像を更新: 範囲を変えると stale、戻すと same', st);
	assert(st.factorOn === 'stale' && st.factorOff === 'same', '画像を更新: シナリオ因子を変えると stale、戻すと same', st);
	assert(st.countMode === 'stale' && st.countModeBack === 'same', '画像を更新: 集計モードを変えると stale、戻すと same', st);
	assert(st.setB === 'stale' && st.setBBack === 'same', '画像を更新: 親Bセットの開閉で stale、戻すと same', st);
	assert(st.ocrOnlyAfter === 'stale' && flow.staleRefreshIgnored, '画像を更新: 結果画像より後に OCR だけ回したら stale で、更新は何もしない', flow);
	assert(errors.length === 0, '画像を更新: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * exam.html — 結果画像の引き出しの「表示を変更」（③）: 引き出しのUI
 *
 *   出し入れは setSectionReady('stitch') に乗る（#stitch-empty / #stitch-name-wrap と同じタイミング）／
 *   中身は②と同じパネル（模式図・注記なし・id は drawer-）で、どちらで変えても両方と保存に映る／
 *   「画像を更新」は表示設定が違うときだけ押せ、作り直せないときは案内が出る／
 *   375px で崩れず横スクロールが出ない／旧UIには出ない
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.waitForTimeout(800);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.waitForTimeout(300);

	const shape = await page.evaluate(() => {
		const fab = document.getElementById('stitch-drawer-fab');
		const pop = document.getElementById('stitch-drawer-pop');
		const panel = document.getElementById('stitch-show-panel-drawer');
		const drawer = document.getElementById('result-drawer');
		return {
			hiddenAtStart: fab.hidden && pop.hidden,
			inDrawer: drawer.contains(fab) && drawer.contains(pop),
			outsideBody: !drawer.querySelector('.uma-drawer-body').contains(fab) && !drawer.querySelector('.uma-drawer-body').contains(pop),
			outsideResultWrap: !document.getElementById('stitch-result-wrap').contains(pop),
			looksLikeFab: fab.classList.contains('uma-fab-toggle') && getComputedStyle(fab).position === 'absolute',
			oldFoldGone: !document.getElementById('stitch-show-drawer-wrap') && !document.getElementById('stitch-show-drawer'),
			inputs: Array.from(panel.querySelectorAll('input[data-stitch-show]')).map((i) => i.id),
			noWire: !panel.querySelector('.stitch-wire'),
			noNote: !panel.querySelector('.stitch-show-note'),
			step2Note: document.querySelector('#stitch-show-panel .stitch-show-note').textContent,
			btnDisabled: document.getElementById('stitch-refresh-btn').disabled,
			noteHidden: document.getElementById('stitch-refresh-note').hidden,
			drawerScenarioDisabled: document.getElementById('drawer-stitch-show-scenario').disabled,
			dupIds: ['opt-attr-icons', 'stitch-show-banner', 'stitch-show-scenario', 'stitch-show-legend', 'stitch-show-conditions']
				.filter((id) => document.querySelectorAll('#' + id).length !== 1)
		};
	});
	assert(shape.drawerScenarioDisabled, '表示を変更: 引き出し側のシナリオ因子も、1件も選んでいなければ灰色', shape);
	assert(shape.hiddenAtStart && shape.inDrawer && shape.outsideBody && shape.outsideResultWrap && shape.looksLikeFab,
		'表示を変更: 丸ボタンとパネルは引き出しの内側（本文の外）にあり、結果が無いうちは隠れている', shape);
	assert(shape.oldFoldGone && shape.noWire && shape.noNote, '表示を変更: 「表示を変更」の折りたたみは無くなり、パネルに模式図と②の注記は出さない', shape);
	assert(shape.inputs.join(',') === 'drawer-stitch-show-banner,drawer-stitch-show-scenario,drawer-opt-attr-icons,drawer-stitch-show-legend,drawer-stitch-show-conditions' && shape.dupIds.length === 0,
		'表示を変更: チェック5つの id は drawer- で分かれ、②の id と重複しない', shape);
	assert(shape.step2Note.includes('「結合画像の表示」の画面からも表示を変えて更新できます'), '表示を変更: ②の注記が③の道も示す', shape.step2Note);
	assert(shape.btnDisabled && shape.noteHidden, '表示を変更: 結果が無いうちは「画像を更新」は押せず、案内も出ない', shape);

	// 結果ができると出る（setSectionReady に乗っている）／消えると隠れる。「照合結果」のタブでは出ない
	const ready = await page.evaluate(() => {
		const fabShown = () => !document.getElementById('stitch-drawer-fab').hidden;
		selectResultTab('stitch');
		document.getElementById('stitch-result-content').innerHTML = '<p id="stitch-dummy">結果画像</p>';
		setSectionReady('stitch', true);
		const on = { fab: fabShown(), name: !document.getElementById('stitch-name-wrap').hidden, empty: document.getElementById('stitch-empty').hidden };
		selectResultTab('result');
		const onResultTab = { fabHidden: !fabShown() };
		selectResultTab('stitch');
		const backOnStitchTab = { fab: fabShown() };
		document.getElementById('stitch-result-content').innerHTML = '';
		setSectionReady('stitch', false);
		const off = { fab: !fabShown(), name: document.getElementById('stitch-name-wrap').hidden, empty: !document.getElementById('stitch-empty').hidden };
		selectResultTab('result');
		return { on, onResultTab, backOnStitchTab, off };
	});
	assert(Object.values(ready.on).every(Boolean) && Object.values(ready.off).every(Boolean),
		'表示を変更: 丸ボタンは #stitch-name-wrap・#stitch-empty と同じタイミングで出入りする', ready);
	assert(ready.onResultTab.fabHidden && ready.backOnStitchTab.fab, '表示を変更: 丸ボタンは「照合結果」のタブでは出ず、「結合画像の表示」のタブに戻ると出る', ready);

	// 「OCR が済んで結合画像ができた」状態を作り、引き出しで操作する
	await page.evaluate(async () => {
		window.__origStitch = stitchOnePerson;
		stitchOnePerson = async () => {
			const c = document.createElement('canvas');
			c.width = 600; c.height = 400;
			c._stitchWarnings = []; c._sourcePlacements = [];
			return c;
		};
		setStitchShow('banner', true); setStitchShow('legend', true); setStitchShow('conditions', true);
		setAttrIcons(false);
		persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
		const run = captureRun();
		lastOcrRun = run;
		await runImageStitching(run);
		selectResultTab('stitch');
		openDrawer('result');
	});
	await page.waitForTimeout(500);
	// 丸ボタンだけが見え、パネルは押すまで見えない。押すと丸ボタンの真上に開き、✕にフォーカスが移る
	assert(await page.isVisible('#stitch-drawer-fab') && !(await page.isVisible('#stitch-drawer-pop')) && !(await page.isVisible('#stitch-refresh-btn')),
		'表示を変更: 結合画像ができると引き出しの右下に丸ボタンが出る（パネルは閉じている）');
	// 本文をスクロールしても丸ボタンの画面上の位置は変わらない
	const pinned = await page.evaluate(async () => {
		const body = document.querySelector('#result-drawer .uma-drawer-body');
		const before = document.getElementById('stitch-drawer-fab').getBoundingClientRect();
		body.scrollTop = 200;
		await new Promise((r) => requestAnimationFrame(r));
		const after = document.getElementById('stitch-drawer-fab').getBoundingClientRect();
		const scrolled = body.scrollTop;
		body.scrollTop = 0;
		return { same: before.top === after.top && before.left === after.left, scrolled };
	});
	assert(pinned.same, '表示を変更: 引き出しの本文をスクロールしても丸ボタンの位置は変わらない', pinned);
	await page.click('#stitch-drawer-fab');
	await page.waitForTimeout(300);
	const opened = await page.evaluate(() => {
		const p = document.getElementById('stitch-drawer-pop').getBoundingClientRect();
		const f = document.getElementById('stitch-drawer-fab').getBoundingClientRect();
		const d = document.getElementById('result-drawer').getBoundingClientRect();
		return {
			visible: !document.getElementById('stitch-drawer-pop').hidden,
			focus: document.activeElement && document.activeElement.id,
			expanded: document.getElementById('stitch-drawer-fab').getAttribute('aria-expanded'),
			aboveFab: p.bottom <= f.top + 1, rightAligned: Math.abs(p.right - f.right) < 2,
			insideDrawer: p.left >= d.left - 1 && p.right <= d.right + 1,
			backdropHidden: document.getElementById('stitch-settings-backdrop').hidden,
			smallEnough: p.height <= d.height * 0.6 + 1
		};
	});
	assert(opened.visible && opened.focus === 'stitch-drawer-pop-close' && opened.expanded === 'true', '表示を変更: 丸ボタンを押すとパネルが開き、✕にフォーカスが移る', opened);
	assert(opened.aboveFab && opened.rightAligned && opened.insideDrawer && opened.backdropHidden && opened.smallEnough,
		'表示を変更: パネルは引き出しの内側で丸ボタンの真上に浮き、暗転は付かず、画像の大半を隠さない', opened);
	assert(await page.isVisible('#drawer-stitch-show-banner'), '表示を変更: パネルの中にチェックが出る');

	// 引き出しで変える → ②にも映り、保存され、ボタンが押せる。戻す → 押せない
	await page.click('#drawer-stitch-show-banner');
	await page.waitForTimeout(200);
	let ui = await page.evaluate(() => ({
		drawer: document.getElementById('drawer-stitch-show-banner').checked,
		step2: document.getElementById('stitch-show-banner').checked,
		stored: localStorage.getItem('uma-exam-stitch-banner'),
		btn: document.getElementById('stitch-refresh-btn').disabled,
		state: document.getElementById('stitch-refresh-btn').getAttribute('data-state'),
		note: document.getElementById('stitch-refresh-note').hidden
	}));
	assert(!ui.drawer && !ui.step2 && ui.stored === '0', '表示を変更: 引き出しで変えると②のパネルと保存にも映る', ui);
	assert(!ui.btn && ui.state === 'ready' && ui.note, '表示を変更: 表示設定が違うと「画像を更新」が押せる（案内は出ない）', ui);
	await page.click('#drawer-stitch-show-banner');
	await page.waitForTimeout(200);
	ui = await page.evaluate(() => ({ btn: document.getElementById('stitch-refresh-btn').disabled, state: document.getElementById('stitch-refresh-btn').getAttribute('data-state') }));
	assert(ui.btn && ui.state === 'same', '表示を変更: 表示設定を元に戻すとボタンが無効に戻る', ui);

	// 引き出しの印のチェック → ②の #opt-attr-icons にも映る。押して更新 → 画像が変わり、ボタンは無効に戻る
	await page.click('#drawer-opt-attr-icons');
	await page.click('#drawer-stitch-show-banner');
	await page.waitForTimeout(200);
	const before = await page.evaluate(async () => {
		const img = document.querySelector('#stitch-result-content img');
		try { await img.decode(); } catch (e) {}
		const body = document.querySelector('#result-drawer .uma-drawer-body');
		body.scrollTop = 40;
		return { h: img.naturalHeight, src: img.src, marks: document.getElementById('opt-attr-icons').checked, scroll: body.scrollTop, links: document.querySelectorAll('#stitch-result-content a[download]').length };
	});
	assert(before.marks === true, '表示を変更: 引き出しの印のチェックは②の #opt-attr-icons にも映る', before);
	await page.click('#stitch-refresh-btn');
	await page.waitForTimeout(600);
	const after = await page.evaluate(async () => {
		const img = document.querySelector('#stitch-result-content img');
		try { await img.decode(); } catch (e) {}
		const link = document.querySelector('#stitch-result-content a[download]');
		const body = document.querySelector('#result-drawer .uma-drawer-body');
		return {
			h: img.naturalHeight, src: img.src, linkMatchesImg: link && link.href === img.src,
			links: document.querySelectorAll('#stitch-result-content a[download]').length,
			copyBtns: document.querySelectorAll('#stitch-result-content button').length,
			btn: document.getElementById('stitch-refresh-btn').disabled,
			state: document.getElementById('stitch-refresh-btn').getAttribute('data-state'),
			label: document.getElementById('stitch-refresh-label').textContent,
			unseen: fabUnseen.stitch,
			drawerOpen: document.getElementById('result-drawer').classList.contains('open'),
			scroll: body.scrollTop,
			inProgress: stitchInProgress,
			popOpen: !document.getElementById('stitch-drawer-pop').hidden
		};
	});
	assert(after.popOpen, '表示を変更: 「画像を更新」を押したあともパネルは開いたまま', after.popOpen);
	assert(after.h < before.h && after.src !== before.src, '表示を変更: 「画像を更新」で画像が作り直る（バナー無しで低くなる）', { before: before.h, after: after.h });
	assert(after.linkMatchesImg && after.links === 1, '表示を変更: ダウンロードリンクは更新後の画像を指し、古いリンクは残らない', after);
	assert(after.btn && after.state === 'same' && after.label === '画像を更新' && !after.inProgress, '表示を変更: 更新後はボタンが無効に戻り、文言も戻る', after);
	assert(after.unseen === false && after.drawerOpen, '表示を変更: 更新しても未読の印は立たず、引き出しは開いたまま', after);
	assert(after.scroll === before.scroll, '表示を変更: 更新後も引き出しのスクロール位置を保つ', { before: before.scroll, after: after.scroll });

	// 画像を足す → 押せず、案内が出る。戻す → 案内が消える
	const staleUi = await page.evaluate(() => {
		persons[0].files.push({ name: 'c.png' });
		updateProcessBtn();
		setStitchShow('banner', true);
		const stale = { btn: document.getElementById('stitch-refresh-btn').disabled, note: !document.getElementById('stitch-refresh-note').hidden, text: document.getElementById('stitch-refresh-note').textContent };
		persons[0].files.pop();
		updateProcessBtn();
		const back = { btn: document.getElementById('stitch-refresh-btn').disabled, note: !document.getElementById('stitch-refresh-note').hidden };
		setStitchShow('banner', false);
		return { stale, back };
	});
	assert(staleUi.stale.btn && staleUi.stale.note && staleUi.stale.text.includes('OCR処理＋画像結合を開始する'),
		'表示を変更: OCR 後に画像を足すとボタンが無効になり、やり直しの案内が出る', staleUi.stale);
	assert(!staleUi.back.btn && !staleUi.back.note, '表示を変更: 画像を元に戻すと案内が消えて押せるようになる', staleUi.back);

	// パネルの外（引き出しの本文）を押すと閉じる。もう一度開いて Esc → パネルだけ閉じて引き出しは残り、
	// フォーカスは丸ボタンへ。もう一度 Esc で引き出しが閉じる
	await page.evaluate(() => document.getElementById('stitch-name-wrap').dispatchEvent(new MouseEvent('click', { bubbles: true })));
	await page.waitForTimeout(200);
	assert(await page.evaluate(() => document.getElementById('stitch-drawer-pop').hidden), '表示を変更: パネルの外（引き出しの本文）を押すと閉じる');
	await page.click('#stitch-drawer-fab');
	await page.waitForTimeout(300);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(300);
	const esc1 = await page.evaluate(() => ({
		popHidden: document.getElementById('stitch-drawer-pop').hidden,
		drawerOpen: document.getElementById('result-drawer').classList.contains('open'),
		focus: document.activeElement && document.activeElement.id,
		expanded: document.getElementById('stitch-drawer-fab').getAttribute('aria-expanded')
	}));
	assert(esc1.popHidden && esc1.drawerOpen && esc1.focus === 'stitch-drawer-fab' && esc1.expanded === 'false',
		'表示を変更: Esc はまずパネルを閉じ、引き出しは残り、フォーカスは丸ボタンへ戻る', esc1);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(600);
	assert(!(await page.isVisible('#result-drawer')), '表示を変更: もう一度 Esc で引き出しが閉じる');
	// 引き出しを開き直してパネルを開いたまま「照合結果」へ切り替えると、丸ボタンもパネルも消える
	await page.evaluate(() => { selectResultTab('stitch'); openDrawer('result'); });
	await page.waitForTimeout(500);
	await page.click('#stitch-drawer-fab');
	await page.waitForTimeout(300);
	await page.click('#result-tab-result');
	await page.waitForTimeout(300);
	const switched = await page.evaluate(() => ({ fabHidden: document.getElementById('stitch-drawer-fab').hidden, popHidden: document.getElementById('stitch-drawer-pop').hidden }));
	assert(switched.fabHidden && switched.popHidden, '表示を変更: 「照合結果」のタブに切り替えると丸ボタンとパネルが消える', switched);
	await page.click('#result-tab-stitch');
	await page.waitForTimeout(300);
	await page.click('#stitch-drawer-fab');
	await page.waitForTimeout(300);

	// 375px: 引き出しの下辺からのシート（高さは引き出しの半分まで＝上側で画像が見える）で、横スクロールが出ない
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(500);
	const narrow = await page.evaluate(() => {
		const drawer = document.getElementById('result-drawer');
		const d = drawer.getBoundingClientRect();
		const p = document.getElementById('stitch-drawer-pop').getBoundingClientRect();
		return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, drawerSw: drawer.scrollWidth, drawerCw: drawer.clientWidth,
			open: !document.getElementById('stitch-drawer-pop').hidden, left: p.left - d.left, right: d.right - p.right, bottom: d.bottom - p.bottom, height: p.height, drawerH: d.height };
	});
	assert(narrow.sw === narrow.cw && narrow.drawerSw <= narrow.drawerCw && narrow.open && Math.abs(narrow.left) < 1 && Math.abs(narrow.right) < 1 && Math.abs(narrow.bottom) < 1 && narrow.height <= narrow.drawerH / 2 + 1,
		'表示を変更: 375px では引き出しの下辺からのシートになり、高さは半分まで、横スクロールが出ない', narrow);

	// 旧UIには出ない（#stitch-name-wrap と同じ扱い。#stitch-result-wrap だけが旧UIへ移る）
	const oldUi = await page.evaluate(() => {
		closeDrawer();
		placeSections('old');
		const r = {
			wrapInOldSlot: document.getElementById('old-stitch-slot').contains(document.getElementById('stitch-drawer-fab')) || document.getElementById('old-stitch-slot').contains(document.getElementById('stitch-drawer-pop')),
			resultInOldSlot: document.getElementById('old-stitch-slot').contains(document.getElementById('stitch-result-wrap')),
			oldCardShown: !document.getElementById('old-stitch-card').hidden
		};
		placeSections('new');
		return r;
	});
	assert(!oldUi.wrapInOldSlot && oldUi.resultInOldSlot, '表示を変更: 丸ボタンとパネルは旧UIへ移動しない（結合画像だけが移る）', oldUi);

	await page.evaluate(() => {
		stitchOnePerson = window.__origStitch;
		persons[0].files = [];
		setAttrIcons(false); setStitchShow('banner', true);
		lastOcrRun = null; lastStitchRun = null;
		document.getElementById('stitch-result-content').innerHTML = '';
		setSectionReady('stitch', false);
		fabUnseen.stitch = false; updateFabBadges();
	});
	assert(errors.length === 0, '表示を変更: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * exam.html — 右下のボタン群の「結合画像の設定」
 *   並びは 照合結果 → 結合画像の表示 → 結合画像の設定 → Deck／展開の遅延は下から 0/.03/.06/.09 秒／
 *   押すと暗転つきの小さなパネルが FAB の上に開き、結合画像が無くても開ける／「画像を更新」は無い／
 *   ここで変えた設定は②と引き出しのパネル・保存に映る／✕・暗転・Esc で閉じ、フォーカスはメインボタンへ戻る／
 *   375px では下からのシート（高さは画面の半分まで）で、横スクロールが出ない
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.waitForTimeout(800);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.waitForTimeout(300);

	const nav = await page.evaluate(() => {
		const el = document.getElementById('fab-nav');
		const items = Array.from(el.querySelectorAll('.uma-fab-item'));
		el.classList.add('open');
		const delays = items.map((b) => getComputedStyle(b).transitionDelay);
		el.classList.remove('open');
		return {
			order: items.map((b) => b.id).join(','),
			label: document.querySelector('#fab-item-settings > span').textContent,
			delays,
			popHidden: document.getElementById('stitch-settings-pop').hidden,
			hasStitch: !document.getElementById('stitch-result-wrap').classList.contains('hidden')
		};
	});
	assert(nav.order === 'fab-item-result,fab-item-stitch,fab-item-settings,deck-drawer-trigger', '結合画像の設定: 右下のボタン群の並び', nav.order);
	assert(nav.label === '結合画像の設定' && nav.popHidden, '結合画像の設定: 項目のラベルと、初期はパネルが閉じていること', nav);
	assert(nav.delays.join(',') === '0.09s,0.06s,0.03s,0s', '結合画像の設定: 4項目の展開の遅延は下から 0/.03/.06/.09 秒', nav.delays);

	// 結合画像が無い状態で、メインボタン → 項目 の順に押して開く
	assert(!nav.hasStitch, '結合画像の設定: 結合画像が無い状態から始める');
	await page.click('#fab-toggle');
	await page.waitForTimeout(400);
	await page.click('#fab-item-settings');
	await page.waitForTimeout(400);
	let st = await page.evaluate(() => ({
		popVisible: !document.getElementById('stitch-settings-pop').hidden,
		backdropVisible: !document.getElementById('stitch-settings-backdrop').hidden,
		navOpen: document.getElementById('fab-nav').classList.contains('open'),
		hasRefresh: !!document.querySelector('#stitch-settings-pop #stitch-refresh-btn'),
		inputs: Array.from(document.querySelectorAll('#stitch-settings-pop input[data-stitch-show]')).map((i) => i.id).join(','),
		title: document.getElementById('stitch-settings-title').textContent.trim(),
		innerTitle: !!document.querySelector('#stitch-settings-pop .stitch-show-title'),
		note: document.querySelector('#stitch-settings-pop .stitch-show-note').textContent,
		focus: document.activeElement && document.activeElement.id,
		expanded: document.getElementById('fab-item-settings').getAttribute('aria-expanded'),
		bodyOverflow: document.body.style.overflow
	}));
	assert(st.popVisible && st.backdropVisible && !st.navOpen, '結合画像の設定: 項目を押すと暗転つきのパネルが開き、ボタン群は畳まれる', st);
	assert(!st.hasRefresh && st.note.includes('「結合画像の表示」の画面で「画像を更新」'), '結合画像の設定: 「画像を更新」は無く、更新の道を案内で示す', st);
	assert(st.inputs === 'fab-stitch-show-banner,fab-stitch-show-scenario,fab-opt-attr-icons,fab-stitch-show-legend,fab-stitch-show-conditions' && st.title === '結合画像の設定' && !st.innerTitle,
		'結合画像の設定: 5項目の id は fab- で分かれ、見出しはパネルの頭に1つだけ', st);
	assert(st.focus === 'stitch-settings-close' && st.expanded === 'true' && st.bodyOverflow === 'hidden', '結合画像の設定: 開いたら ✕ にフォーカスが移り、本文のスクロールが止まる', st);

	// 変えた設定が②と引き出しのパネル・保存に映る
	await page.click('#fab-stitch-show-banner');
	await page.waitForTimeout(200);
	const mirrored = await page.evaluate(() => ({
		fab: document.getElementById('fab-stitch-show-banner').checked,
		step2: document.getElementById('stitch-show-banner').checked,
		drawer: document.getElementById('drawer-stitch-show-banner').checked,
		stored: localStorage.getItem('uma-exam-stitch-banner')
	}));
	assert(!mirrored.fab && !mirrored.step2 && !mirrored.drawer && mirrored.stored === '0', '結合画像の設定: ここで変えた設定が②と引き出しのパネルと保存に映る', mirrored);

	// Esc で閉じ、フォーカスはメインボタンへ
	await page.keyboard.press('Escape');
	await page.waitForTimeout(300);
	st = await page.evaluate(() => ({
		popHidden: document.getElementById('stitch-settings-pop').hidden,
		backdropHidden: document.getElementById('stitch-settings-backdrop').hidden,
		focus: document.activeElement && document.activeElement.id,
		bodyOverflow: document.body.style.overflow,
		expanded: document.getElementById('fab-item-settings').getAttribute('aria-expanded')
	}));
	assert(st.popHidden && st.backdropHidden && st.focus === 'fab-toggle' && st.bodyOverflow === '' && st.expanded === 'false',
		'結合画像の設定: Esc で閉じ、フォーカスはメインボタンへ戻り、スクロールの固定も解ける', st);

	// 暗転のクリックでも閉じる（fabGoTo から開く経路）
	await page.evaluate(() => fabGoTo('settings'));
	await page.waitForTimeout(300);
	assert(await page.isVisible('#stitch-settings-pop'), '結合画像の設定: fabGoTo からも開く');
	await page.mouse.click(10, 10);
	await page.waitForTimeout(300);
	assert(await page.evaluate(() => document.getElementById('stitch-settings-pop').hidden), '結合画像の設定: 暗転を押すと閉じる');

	// PC 幅ではメインボタンの真上に右揃えで浮く
	await page.evaluate(() => fabGoTo('settings'));
	await page.waitForTimeout(300);
	const pc = await page.evaluate(() => {
		const p = document.getElementById('stitch-settings-pop').getBoundingClientRect();
		const t = document.getElementById('fab-toggle').getBoundingClientRect();
		return { popRight: p.right, toggleRight: t.right, popBottom: p.bottom, toggleTop: t.top, popW: p.width };
	});
	assert(Math.abs(pc.popRight - pc.toggleRight) < 2 && pc.popBottom <= pc.toggleTop && pc.popW <= 380, '結合画像の設定: PC 幅ではメインボタンの真上に右揃えで浮く', pc);
	await page.keyboard.press('Escape');

	// 375px: 下からのシート（画面の半分まで）で、横スクロールが出ない
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(400);
	await page.evaluate(() => fabGoTo('settings'));
	await page.waitForTimeout(400);
	const sp = await page.evaluate(() => {
		const p = document.getElementById('stitch-settings-pop').getBoundingClientRect();
		return { left: p.left, right: p.right, bottom: p.bottom, height: p.height, vw: window.innerWidth, vh: window.innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
	});
	assert(sp.left === 0 && Math.abs(sp.right - sp.vw) < 1 && Math.abs(sp.bottom - sp.vh) < 1 && sp.height <= sp.vh / 2 + 1 && sp.sw === sp.cw,
		'結合画像の設定: 375px では下からのシートになり、高さは画面の半分まで、横スクロールが出ない', sp);
	await page.keyboard.press('Escape');
	await page.evaluate(() => setStitchShow('banner', true));

	assert(errors.length === 0, '結合画像の設定: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * トーストと「結合画像の設定」のパネルの重なり（2026-09-15・43セッション目）
 *
 * 「画像を更新」の直後のトーストが、引き出しの中のパネルの下端に重なっていた。
 * パネルが開いている間だけ、トーストをパネルの上辺より上へ逃がす（--uma-toast-lift）。
 * 閉じたら元の位置へ戻す。あわせて、パネルの見出しが1つだけであることも見る。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.evaluate(() => { if (typeof closeUiNotice === 'function') closeUiNotice(); });
	await page.evaluate(() => {
		selectResultTab('stitch');
		document.getElementById('stitch-result-content').innerHTML = '<p id="stitch-dummy">結果画像</p>';
		setSectionReady('stitch', true);
		openDrawer('result');
	});
	await page.waitForTimeout(400);

	// パネルの見出しは1つだけ（上の見出しと内側の枠の見出しが二重に出ない）
	await page.click('#stitch-drawer-fab');
	await page.waitForTimeout(300);
	const heads = await page.evaluate(() => [...document.querySelectorAll('#stitch-drawer-pop .uma-popover-title, #stitch-drawer-pop .stitch-show-title')].map((n) => n.textContent.trim()));
	assert(heads.length === 1 && heads[0] === '結合画像の設定', '重なり: 引き出しのパネルの見出しは1つだけ', heads);

	const overlap = async (popId) => page.evaluate((id) => {
		const toast = document.getElementById('toast');
		const t = toast.getBoundingClientRect();
		const el = document.getElementById(id);
		const p = el && !el.hidden ? el.getBoundingClientRect() : null;
		return {
			hidden: toast.className.includes('translate-y-16'),
			lift: toast.style.getPropertyValue('--uma-toast-lift') || '',
			hit: !!(p && !(t.bottom < p.top || t.top > p.bottom || t.right < p.left || t.left > p.right)),
		};
	}, popId);

	await page.evaluate(() => showToast('結合画像を更新しました'));
	await page.waitForTimeout(600);
	let ov = await overlap('stitch-drawer-pop');
	assert(!ov.hidden && !ov.hit && ov.lift, '重なり: パネルが開いている間、トーストはパネルに重ならない', ov);

	// 閉じると逃がしを解いて元の位置へ戻る
	await page.evaluate(() => closeStitchSettings());
	await page.waitForTimeout(2700);           // 前のトーストが引っ込むのを待つ
	await page.evaluate(() => showToast('コピーしました'));
	await page.waitForTimeout(600);
	ov = await overlap('stitch-drawer-pop');
	assert(!ov.hidden && ov.lift === '', '重なり: パネルを閉じるとトーストは元の位置へ戻る', ov);

	// 375px（引き出しの下辺からのシート）でも重ならない
	await page.waitForTimeout(2700);
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(400);
	await page.click('#stitch-drawer-fab');
	await page.waitForTimeout(400);
	await page.evaluate(() => showToast('結合画像を更新しました'));
	await page.waitForTimeout(600);
	ov = await overlap('stitch-drawer-pop');
	assert(!ov.hidden && !ov.hit, '重なり: 375px のシートでもトーストは重ならない', ov);

	// 右下のボタン群から開くパネルでも同じ
	await page.waitForTimeout(2700);
	await page.evaluate(() => { closeStitchSettings(); closeDrawer(); });
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.waitForTimeout(500);
	await page.evaluate(() => { fabGoTo('settings'); showToast('保存しました'); });
	await page.waitForTimeout(600);
	ov = await overlap('stitch-settings-pop');
	assert(!ov.hidden && !ov.hit, '重なり: 右下から開くパネルでもトーストは重ならない', ov);

	assert(errors.length === 0, '重なり: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * 未読の丸（2026-09-15・43セッション目）
 *
 * ・子項目・引き出しのタブ・Deck の取り込み案内の丸は、行き先を問わず1色の赤
 *   （--uma-notify #c53030）。白い縁取りと脈動が付く。
 * ・畳んだメインボタンの未読は、右上に赤丸を1つだけ（未読がいくつでも1つ）。
 *   回る動きは付けない。開いたら隠し、閉じたら（未読が残っていれば）出す。
 * ・reduced-motion では脈動しない。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.evaluate(() => { if (typeof closeUiNotice === 'function') closeUiNotice(); });
	await page.waitForTimeout(300);
	const RED = 'rgb(197, 48, 48)';

	// 未読0では出ない
	assert(await page.evaluate(() => document.getElementById('fab-unseen-dot').hidden),
		'未読の丸: 未読が無いときは畳んだボタンに丸を出さない');

	// 1つでも未読が立てば、赤丸が1つだけ出る（脈動あり・白い縁取り・回らない）
	const one = await page.evaluate(() => {
		markFabUnseen('result');
		const dot = document.getElementById('fab-unseen-dot');
		const st = getComputedStyle(dot);
		return {
			hidden: dot.hidden, bg: st.backgroundColor, border: st.borderTopWidth,
			anim: st.animationName, transform: st.transform,
			count: document.querySelectorAll('.uma-fab-main .uma-fab-dot:not([hidden])').length,
		};
	});
	assert(!one.hidden && one.count === 1 && one.bg === RED && one.border === '2px',
		'未読の丸: 未読が1つ以上あれば赤い丸が1つだけ出る', one);
	assert(one.anim === 'uma-fab-pulse' && one.transform === 'none',
		'未読の丸: 脈動はするが回らない', one);

	// 未読が増えても丸は1つのまま
	const many = await page.evaluate(() => {
		markFabUnseen('stitch'); markFabUnseen('deck');
		return document.querySelectorAll('.uma-fab-main .uma-fab-dot:not([hidden])').length;
	});
	assert(many === 1, '未読の丸: 未読が増えても畳んだボタンの丸は1つのまま', many);

	// 開くと隠れ、閉じると（未読が残っていれば）また出る
	await page.evaluate(() => setFabOpen(true));
	await page.waitForTimeout(200);
	assert(await page.evaluate(() => document.getElementById('fab-unseen-dot').hidden),
		'未読の丸: 開いている間は畳んだボタンの丸を出さない');
	await page.evaluate(() => setFabOpen(false));
	await page.waitForTimeout(200);
	assert(!(await page.evaluate(() => document.getElementById('fab-unseen-dot').hidden)),
		'未読の丸: 閉じると未読が残っているぶんだけまた出る');

	// 子項目・タブ・取り込み案内の丸も同じ赤
	const dots = await page.evaluate(() => {
		const bg = (id) => getComputedStyle(document.getElementById(id)).backgroundColor;
		return {
			result: bg('fab-dot-result'), stitch: bg('fab-dot-stitch'), deck: bg('fab-dot-deck'),
			tabResult: bg('result-tab-dot-result'), tabStitch: bg('result-tab-dot-stitch'),
			handoff: bg('deck-handoff-dot'),
		};
	});
	assert(Object.values(dots).every((c) => c === RED),
		'未読の丸: 子項目・引き出しのタブ・取り込み案内の丸はすべて同じ赤', dots);

	assert(errors.length === 0, '未読の丸: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

// reduced-motion では脈動しない（丸は出したまま）
{
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
	const page = await ctx.newPage();
	await page.goto(base + '/exam.html', { waitUntil: 'networkidle', timeout: 60000 });
	await page.waitForTimeout(1800);
	await page.evaluate(() => { if (typeof closeUiNotice === 'function') closeUiNotice(); });
	const rm = await page.evaluate(() => {
		markFabUnseen('result');
		const dot = document.getElementById('fab-unseen-dot');
		return { hidden: dot.hidden, anim: getComputedStyle(dot).animationName };
	});
	assert(!rm.hidden && rm.anim === 'none', '未読の丸: reduced-motion では脈動しない（丸は出す）', rm);
	await ctx.close();
}

// special にも同じ見た目が乗っている
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	const sp = await page.evaluate(() => {
		markFabUnseen('result'); markFabUnseen('stitch');
		const bg = (id) => getComputedStyle(document.getElementById(id)).backgroundColor;
		const dot = document.getElementById('fab-unseen-dot');
		return {
			result: bg('fab-dot-result'), stitch: bg('fab-dot-stitch'),
			mainHidden: dot.hidden, mainBg: getComputedStyle(dot).backgroundColor,
			count: document.querySelectorAll('.uma-fab-main .uma-fab-dot:not([hidden])').length,
		};
	});
	assert(sp.result === 'rgb(197, 48, 48)' && sp.stitch === 'rgb(197, 48, 48)',
		'未読の丸: special の子項目の丸も同じ赤', sp);
	assert(!sp.mainHidden && sp.count === 1 && sp.mainBg === 'rgb(197, 48, 48)',
		'未読の丸: special でも畳んだボタンの丸は1つ', sp);
	// 旧UIでは Deck の項目を出さないので、その未読は畳んだボタンの丸にも数えない
	const noDeck = await page.evaluate(() => {
		fabUnseen.result = false; fabUnseen.stitch = false; updateFabBadges();
		const trigger = document.getElementById('deck-drawer-trigger');
		const was = trigger.hidden;
		trigger.hidden = true;
		markFabUnseen('deck');
		const hiddenWhileOldUi = document.getElementById('fab-unseen-dot').hidden;
		trigger.hidden = was; updateFabBadges();
		return { hiddenWhileOldUi, shownAfter: !document.getElementById('fab-unseen-dot').hidden };
	});
	assert(noDeck.hiddenWhileOldUi && noDeck.shownAfter,
		'未読の丸: special の旧UIでは Deck の未読を畳んだボタンの丸に数えない', noDeck);
	assert(errors.length === 0, '未読の丸: special でコンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}


/* ============================================================
 * 緑スキルの数え方の切り替え（2026-09-15・43セッション目）
 *
 * 「操作できる部品は黒」の例外。何を数えるのか（＝緑スキル）を色が示すので緑で塗る。
 * 選択中＝緑の地に白い文字（白とのコントラスト 5.36）、未選択＝緑の文字、枠も緑。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.evaluate(() => { if (typeof closeUiNotice === 'function') closeUiNotice(); });
	await page.waitForTimeout(300);
	const GREEN = 'rgb(0, 122, 85)';      // emerald-700 #007a55
	const modes = await page.evaluate(() => {
		setCountMode('equivalence');
		const on = document.getElementById('mode-equivalence');
		const off = document.getElementById('mode-individual');
		const cs = (el) => getComputedStyle(el);
		return {
			onBg: cs(on).backgroundColor, onColor: cs(on).color,
			offColor: cs(off).color, offBg: cs(off).backgroundColor,
			frame: cs(off.parentElement).borderTopColor,
			token: getComputedStyle(document.documentElement).getPropertyValue('--uma-green-skill').trim(),
		};
	});
	assert(modes.onBg === GREEN && modes.onColor === 'rgb(255, 255, 255)',
		'数え方の切り替え: 選んでいる側は緑の地に白い文字', modes);
	assert(modes.offColor === GREEN && modes.frame === 'rgb(164, 244, 207)',
		'数え方の切り替え: 選んでいない側は緑の文字で、枠も緑', modes);
	assert(modes.token === '#007a55', '数え方の切り替え: 緑は --uma-green-skill（emerald-700）', modes.token);
	// 反対側を選ぶと入れ替わる
	const swapped = await page.evaluate(() => {
		setCountMode('individual');
		return {
			eq: getComputedStyle(document.getElementById('mode-equivalence')).backgroundColor,
			ind: getComputedStyle(document.getElementById('mode-individual')).backgroundColor,
		};
	});
	assert(swapped.ind === GREEN && swapped.eq !== GREEN, '数え方の切り替え: 押すと緑の地が入れ替わる', swapped);
	await page.evaluate(() => setCountMode('equivalence'));
	assert(errors.length === 0, '数え方の切り替え: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}


/* ============================================================
 * シナリオ因子の色＝紫／遺伝子の色＝赤（2026-09-15・44セッション目。段G で遺伝子を追加）
 *
 * 場所ごとに別の値（sky-50〜900・canvas の直書き）だったものを、4つの役割に
 * まとめた。**どの箇所もトークンと同じ値で描かれている**ことを見る。
 * 因子の総括チェックだけは「操作できる部品は黒」の例外ではなく原則どおり黒。
 * **段G で印の色を #b02aa8 → #a42fb8 へ微調整し、遺伝子の4本組を新設した。**
 * 遺伝子の♥がシナリオ因子の◆と同じ色に戻っていないことも、ここで見張る。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.evaluate(() => {
		if (typeof closeUiNotice === 'function') closeUiNotice();
		document.querySelectorAll('.uma-overlay-backdrop, .uma-overlay').forEach((el) => { el.hidden = true; });
		// 因子を ON にする（24種。3種以下だとハイライトの「他」が出ない）
		setScenarioFactorsAll(true);
		// 遺伝子も ON にする（段G。◆と♥が同じ画面に並ぶ状態で色と形を見る）
		setAptitudeGenesAll(true);
		const mk = (names, offset) => matchAllSkillsWithStars(
			names.map((n, i) => ({ text: n, stars: ((i + offset) % 3) + 1, starsReliable: true, rowKey: 'r' + i })),
			skillList, skillIndex, {});
		personResults = PERSON_LABELS.map(() => null);
		personResults[0] = mk(skillList, 0);
		renderResults();
		document.querySelectorAll('#step-panel-1 details').forEach((d) => { d.open = true; });
	});
	await page.waitForTimeout(400);
	const MARK = 'rgb(164, 47, 184)';   // --uma-mark-catalog  #a42fb8（段G で微調整）
	const GENE = 'rgb(200, 30, 78)';    // --uma-mark-gene     #c81e4e（段G で新設）
	const TEXT = 'rgb(118, 19, 111)';   // --uma-catalog-text  #76136f
	const SOFT = 'rgb(251, 231, 248)';  // --uma-catalog-soft  #fbe7f8
	const BORDER = 'rgb(240, 171, 232)';// --uma-catalog-border #f0abe8
	const CONTROL = 'rgb(28, 25, 23)';  // --uma-control       #1c1917
	const c = await page.evaluate(() => {
		const cs = (el, prop) => (el ? getComputedStyle(el)[prop] : '(要素なし)');
		const root = getComputedStyle(document.documentElement);
		const listMark = document.querySelector('#skill-registry-list [title="シナリオ因子"]');
		const tableMark = document.querySelector('#result-tbody [title="シナリオ因子"]');
		const listGene = document.querySelector('#skill-registry-list [title="遺伝子"]');
		const tableGene = document.querySelector('#result-tbody [title="遺伝子"]');
		const card = [...document.querySelectorAll('#exam-highlight-grid div')]
			.find((d) => d.className.includes('--uma-catalog-border'));
		// カードの中は 見出しの<p> → 因子の行の格子（<div class="grid">）→「他」の<p>
		const cardHead = card ? card.querySelector('p') : null;
		const cardLine = card ? card.querySelector('div.grid span') : null;
		const cardMore = card ? card.querySelector(':scope > p.text-right') : null;
		return {
			tokens: {
				mark: root.getPropertyValue('--uma-mark-catalog').trim(),
				text: root.getPropertyValue('--uma-catalog-text').trim(),
				soft: root.getPropertyValue('--uma-catalog-soft').trim(),
				border: root.getPropertyValue('--uma-catalog-border').trim()
			},
			geneTokens: {
				mark: root.getPropertyValue('--uma-mark-gene').trim(),
				text: root.getPropertyValue('--uma-gene-text').trim(),
				soft: root.getPropertyValue('--uma-gene-soft').trim(),
				border: root.getPropertyValue('--uma-gene-border').trim()
			},
			listGene: cs(listGene, 'color'),
			tableGene: cs(tableGene, 'color'),
			listGeneGlyph: listGene ? listGene.textContent : null,
			listMarkGlyph: listMark ? listMark.textContent : null,
			badgeBg: cs(document.getElementById('badge-scenario-factors'), 'backgroundColor'),
			badgeText: cs(document.getElementById('badge-scenario-factors'), 'color'),
			listMark: cs(listMark, 'color'),
			tableMark: cs(tableMark, 'color'),
			check: cs(document.getElementById('scenario-factors-all'), 'accentColor'),
			cardBorder: cs(card, 'borderTopColor'),
			cardHead: cs(cardHead, 'color'),
			cardLine: cs(cardLine, 'color'),
			cardMore: cs(cardMore, 'color'),
			wireBar: cs(document.querySelector('.stitch-wire-factor'), 'backgroundColor'),
			// 結合画像が実行時に読むトークン（canvas に CSS は効かないので名前で引く）
			stitchText: stitchTokenColor(STITCH_FACTOR_TEXT_TOKEN),
			stitchMore: stitchTokenColor(STITCH_FACTOR_MORE_TOKEN)
		};
	});
	assert(c.tokens.mark === '#a42fb8' && c.tokens.text === '#76136f'
		&& c.tokens.soft === '#fbe7f8' && c.tokens.border === '#f0abe8',
		'シナリオ因子の色: 4つの役割のトークンが紫の確定値（印は段G で微調整）', c.tokens);
	assert(c.geneTokens.mark === '#c81e4e' && c.geneTokens.text === '#7d0f33'
		&& c.geneTokens.soft === '#fff0f3' && c.geneTokens.border === '#f7aebe',
		'段G: 遺伝子の色も4つの役割のトークンを持つ（赤の確定値）', c.geneTokens);
	assert(c.geneTokens.mark !== c.tokens.mark,
		'段G: 遺伝子の印とシナリオ因子の印が同じ色に戻っていない', { gene: c.geneTokens.mark, factor: c.tokens.mark });
	assert(c.listMark === MARK && c.tableMark === MARK && c.cardMore === MARK && c.wireBar === MARK,
		'シナリオ因子の色: 一覧と表の◆・ハイライトの「他」・模式図の帯が印の色', c);
	assert(c.badgeText === TEXT && c.cardHead === TEXT && c.cardLine === TEXT,
		'シナリオ因子の色: バッジの文字・カードの見出しと行が文字の色', c);
	assert(c.badgeBg === SOFT && c.cardBorder === BORDER,
		'シナリオ因子の色: バッジの地が淡い地、カードの枠が枠の色', c);
	assert(c.stitchText === '#76136f' && c.stitchMore === '#a42fb8',
		'シナリオ因子の色: 結合画像が読むトークンも文字と印の色', c);
	assert(c.listGene === GENE && c.tableGene === GENE,
		'段G: 一覧と表の遺伝子の印が遺伝子の色', { listGene: c.listGene, tableGene: c.tableGene, want: GENE });
	assert(c.listGeneGlyph === '♥' && c.listMarkGlyph === '◆',
		'段G: 遺伝子は♥・シナリオ因子は◆（形も分かれている）',
		{ gene: c.listGeneGlyph, factor: c.listMarkGlyph });
	assert(c.check === CONTROL,
		'シナリオ因子の色: 因子の総括チェックだけは操作の色（黒）', c.check);
	assert(errors.length === 0, 'シナリオ因子の色: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}


/* ============================================================
 * ハイライトの人物ごとのまとまり（2026-09-16・45セッション目）
 *
 * カード単位で並べていたものを、人物ごとのまとまり（見出し＋その人のカード）に
 * 組み直した。スマホ幅で「親Aのシナリオ因子の隣に祖A1のsp70緑」のように
 * 人物の区切りが行の途中に入るのを無くすのが目的。
 * 区切りの幅は sm（640px）＝まとまりの中を3枚横並びに、lg（1024px）＝まとまりを2列に。
 * ============================================================ */
{
	// ハイライトを引き出しごと開いて、人物ごとのまとまりを作る
	// factorsOn … シナリオ因子の総括チェック（ON なら24種すべてが対象）。
	// detectFactors … 因子を検出したことにするか。false なら「対象にしたが1種も出なかった」状態。
	// 戻り値の longest は「いちばん長い因子名」。**名前をこのファイルに書かず**に
	// 「長い名前が省略される／広い幅では全部出る」を確かめるために返す。
	const seedHighlight = (page, factorsOn, detectFactors = true) => page.evaluate((o) => {
		if (typeof closeUiNotice === 'function') closeUiNotice();
		document.querySelectorAll('.uma-overlay-backdrop, .uma-overlay').forEach((el) => { el.hidden = true; });
		setScenarioFactorsAll(o.on);
		const mk = (names, offset) => matchAllSkillsWithStars(
			names.map((s, i) => ({ text: s, stars: ((i + offset) % 3) + 1, starsReliable: true, rowKey: 'r' + i })),
			skillList, skillIndex, {});
		// 64セッション目（段E）から、帯に出るのは**検出したものだけ**。上位3種＋「他」を
		// 出すために**4種**検出したことにする。**いちばん長い名前を必ず混ぜ**、★を決め打ち
		// （3,3,2,1）にして、その名前が必ず上位3行に入るようにする（省略の検査が効く）。
		const longest = factorOnlyList.slice().sort((a, b) => b.length - a.length)[0] || null;
		const hit = (o.detect && longest)
			? [longest].concat(factorOnlyList.filter((n) => n !== longest).slice(0, 3)) : [];
		const STARS = [3, 3, 2, 1];
		personResults = PERSON_LABELS.map(() => null);
		for (let p = 0; p < 3; p++) {
			personResults[p] = mk(skillList.slice(0, 120 - p * 10).concat(hit), p);
			hit.forEach((n, i) => { personResults[p].skillStars[n] = STARS[i]; });
		}
		renderResults();
		openDrawer('result');
		return { longest: longest, hit: hit };
	}, { on: factorsOn, detect: detectFactors });
	const readGroups = (page) => page.evaluate(() => {
		const groups = [...document.querySelectorAll('#exam-highlight-grid [data-person-group]')];
		const box = document.getElementById('exam-highlight');
		return {
			count: groups.length,
			labels: groups.map((g) => g.querySelector('p').textContent),
			// まとまりごとのカードの見出し（人物名は入らない）
			cardHeads: groups.map((g) => [...g.querySelectorAll(':scope > div > div > p:first-child')].map((p) => p.textContent)),
			cardCounts: groups.map((g) => g.querySelectorAll(':scope > div > div').length),
			// 段組み: 同じ行かどうかは実際の矩形の上端で見る
			tops: groups.map((g) => Math.round(g.getBoundingClientRect().top)),
			// まとまりの中のカードの上端（sp70緑・緑・因子の順）
			innerTops: groups.map((g) => [...g.querySelectorAll(':scope > div > div')].map((d) => Math.round(d.getBoundingClientRect().top))),
			innerWidths: groups.map((g) => [...g.querySelectorAll(':scope > div > div')].map((d) => Math.round(d.getBoundingClientRect().width))),
			innerLefts: groups.map((g) => [...g.querySelectorAll(':scope > div > div')].map((d) => Math.round(d.getBoundingClientRect().left))),
			gridWidth: Math.round(groups[0].querySelector(':scope > div').getBoundingClientRect().width),
			overflow: box.scrollWidth > box.clientWidth,
			docOverflow: document.documentElement.scrollWidth > window.innerWidth
		};
	});

	/* シナリオ因子のカードの行を読む。
	   名前の升目（title 付き）と「：★N」の升目が交互に並ぶ1つの grid なので、
	   2つずつ組にして1行として見る。★の縦位置は「：★N」の升目の左端で確かめる。 */
	const readFactorRows = (page) => page.evaluate(() => {
		const card = document.querySelector('#exam-highlight-grid [data-person-group] div.grid[style*="minmax"]');
		if (!card) return null;
		const cells = [...card.children];
		const rows = [];
		for (let i = 0; i + 1 < cells.length; i += 2) {
			const name = cells[i], stars = cells[i + 1];
			rows.push({
				name: name.textContent,
				title: name.getAttribute('title'),
				// 中身が幅に入りきらない＝末尾が「…」で省略されている
				clipped: name.scrollWidth > name.clientWidth + 1,
				stars: stars.textContent,
				// 「：★N」が切れていないこと
				starsClipped: stars.scrollWidth > stars.clientWidth + 1,
				starsLeft: Math.round(stars.getBoundingClientRect().left),
				height: Math.round(name.getBoundingClientRect().height),
				lineHeight: Math.round(parseFloat(getComputedStyle(name).lineHeight))
			});
		}
		const moreEl = card.parentElement.querySelector(':scope > p.text-right');
		return {
			rows,
			// 「他」は格子の外・カードの右下
			moreText: moreEl ? moreEl.textContent : null,
			moreBelowGrid: moreEl ? moreEl.getBoundingClientRect().top >= card.getBoundingClientRect().bottom - 1 : null
		};
	});

	// --- 375px（スマホ幅）・シナリオ因子あり ---
	{
		const { ctx, page, errors } = await openPage(browser, base, 'exam.html', { width: 375, height: 1400 });
		const seeded = await seedHighlight(page, true);
		await page.waitForTimeout(700);
		const g = await readGroups(page);
		assert(g.count === 3 && g.labels.join('・') === '親A・祖A1・祖A2',
			'ハイライト: 人物ごとのまとまりが3つあり、見出しは親A・祖A1・祖A2', g.labels);
		assert(g.cardHeads.every((h) => h.join('|') === 'sp70緑|緑（実質53種）|シナリオ因子'),
			'ハイライト: カードの見出しに人物名は入らない（sp70緑／緑（実質53種）／シナリオ因子）', g.cardHeads[0]);
		assert(g.cardCounts.every((n) => n === 3), 'ハイライト: まとまりの中は3枚', g.cardCounts);
		assert(g.tops[0] < g.tops[1] && g.tops[1] < g.tops[2],
			'ハイライト: 375px ではまとまりが縦に積まれる', g.tops);
		assert(g.innerTops.every((t) => t[0] === t[1] && t[2] > t[1]),
			'ハイライト: 375px では sp70緑と緑が同じ行、シナリオ因子はその下', g.innerTops);
		// 2列の格子に固定。因子は2行目の**左の列**で、幅は sp70緑・緑と同じ。右の列は空けたまま
		// （将来の4枚目のパネルの置き場所。因子だけに幅の指定を持たせない）
		assert(g.innerWidths.every((w) => Math.abs(w[2] - w[0]) <= 1 && Math.abs(w[2] - w[1]) <= 1),
			'ハイライト: 375px でシナリオ因子のカードは sp70緑・緑と同じ幅', { widths: g.innerWidths[0] });
		assert(g.innerWidths.every((w) => w[2] < g.gridWidth - 10),
			'ハイライト: 375px でシナリオ因子のカードは全幅ではない（右の列が空く）', { widths: g.innerWidths[0], grid: g.gridWidth });
		assert(g.innerLefts.every((l) => l[2] === l[0]),
			'ハイライト: 375px でシナリオ因子は2行目の左の列にある', g.innerLefts);
		assert(!g.overflow && !g.docOverflow, 'ハイライト: 375px で横スクロールが出ない', g);

		// 因子の行: 1行に収まる／「：★N」は切れない／★の左端が全行で揃う／長い名前は省略して title で全文
		const f = await readFactorRows(page);
		assert(f && f.rows.length === 3, 'ハイライト: 因子の行は検出分の上位3種ぶん出る', f && f.rows.length);
		assert(f.rows.every((r) => r.height <= r.lineHeight + 1),
			'ハイライト: 375px で因子の各行が1行に収まる（折り返さない）', f.rows.map((r) => [r.height, r.lineHeight]));
		assert(f.rows.every((r) => !r.starsClipped) && f.rows.every((r) => r.stars.startsWith('：★')),
			'ハイライト: 「：★N」は切れずに全部出る', f.rows.map((r) => r.stars));
		// 64セッション目（段E）: 未検出（「：−」U+2212）はもう並べない。
		// 検出したものだけを出すので、残り枠が「−」で埋まることが無い。
		assert(f.rows.every((r) => !r.stars.includes('−')),
			'ハイライト: 未検出の「−」の行は出ない（検出したものだけを並べる）', f.rows.map((r) => r.stars));
		assert(new Set(f.rows.map((r) => r.starsLeft)).size === 1,
			'ハイライト: 「：★N」の左端が全行で揃う（★の縦位置が揃う）', f.rows.map((r) => r.starsLeft));
		const clipped = f.rows.filter((r) => r.clipped);
		assert(clipped.length > 0 && clipped.every((r) => r.title && r.title.length > r.name.length)
			// title は行の全文（「名前：★N」）なので、名前で始まっていることを見る
			&& clipped.some((r) => r.title.startsWith(seeded.longest)),
			'ハイライト: 375px で長い因子名は省略され、全文が title で分かる', clipped.map((r) => [r.name, r.title]));
		assert(f.moreText === '他' && f.moreBelowGrid,
			'ハイライト: 「他」は格子の外・カードの右下にあり、★の列と重ならない', { more: f.moreText, below: f.moreBelowGrid });
		assert(errors.length === 0, 'ハイライト: 375px でコンソールエラーが出ない', errors.slice(0, 3));
		await ctx.close();
	}

	// --- 375px・シナリオ因子なし ---
	{
		const { ctx, page } = await openPage(browser, base, 'exam.html', { width: 375, height: 1400 });
		await seedHighlight(page, false);
		await page.waitForTimeout(700);
		const g = await readGroups(page);
		assert(g.cardCounts.every((n) => n === 2) && g.cardHeads.every((h) => h.join('|') === 'sp70緑|緑（実質53種）'),
			'ハイライト: シナリオ因子を選んでいなければ、まとまりの中は2枚', g.cardHeads[0]);
		assert(g.innerTops.every((t) => t[0] === t[1]),
			'ハイライト: 375px でも2枚は横並び1行に収まる', g.innerTops);
		assert(!g.overflow && !g.docOverflow, 'ハイライト: 375px・因子なしでも横スクロールが出ない', g);
		await ctx.close();
	}

	// --- 768px（中間）: まとまりの中は3枚横並び、まとまりは縦に積む ---
	{
		const { ctx, page } = await openPage(browser, base, 'exam.html', { width: 768, height: 1200 });
		await seedHighlight(page, true);
		await page.waitForTimeout(700);
		const g = await readGroups(page);
		assert(g.innerTops.every((t) => t[0] === t[1] && t[1] === t[2]),
			'ハイライト: 768px ではまとまりの中の3枚が横並び', g.innerTops);
		assert(g.tops[0] < g.tops[1] && g.tops[1] < g.tops[2],
			'ハイライト: 768px ではまとまりはまだ縦に積む', g.tops);
		await ctx.close();
	}

	// --- 1280px（PC幅）: まとまりを横に2つずつ ---
	{
		const { ctx, page } = await openPage(browser, base, 'exam.html', { width: 1280, height: 1000 });
		const seeded1280 = await seedHighlight(page, true);
		await page.waitForTimeout(700);
		const g = await readGroups(page);
		assert(g.innerTops.every((t) => t[0] === t[1] && t[1] === t[2]),
			'ハイライト: 1280px でもまとまりの中の3枚は横並び', g.innerTops);
		assert(g.tops[0] === g.tops[1] && g.tops[2] > g.tops[1],
			'ハイライト: 1280px ではまとまりが横に2つずつ並ぶ', g.tops);
		// 広い幅では名前が全部出る。★の左端が揃うのは幅を問わない
		const f = await readFactorRows(page);
		assert(f.rows.every((r) => !r.clipped) && f.rows.some((r) => r.name === seeded1280.longest),
			'ハイライト: 1280px では因子の名前が省略されずに出る', f.rows.map((r) => r.name));
		assert(new Set(f.rows.map((r) => r.starsLeft)).size === 1 && f.rows.every((r) => !r.starsClipped),
			'ハイライト: 1280px でも「：★N」の左端が全行で揃う', f.rows.map((r) => [r.stars, r.starsLeft]));
		// 数え方を切り替えると緑の見出しが追従する（既存の挙動）
		const swapped = await page.evaluate(() => {
			setCountMode('individual');
			const g0 = document.querySelector('#exam-highlight-grid [data-person-group]');
			return [...g0.querySelectorAll(':scope > div > div > p:first-child')].map((p) => p.textContent);
		});
		assert(swapped.join('|') === 'sp70緑|緑（59種個別）|シナリオ因子',
			'ハイライト: 数え方を切り替えると緑のカードの見出しも変わる', swapped);
		await ctx.close();
	}
}


/* ============================================================
 * 右下のボタン群の幅（2026-09-15・43セッション目）
 *
 * いちばん長いラベルのボタンに、ほかのボタンの幅が揃う（ピクセルでは固定しない）。
 * ラベルは左揃え、アイコンの丸は右端。PC と 375px の両方で見る。
 * ============================================================ */
for (const [file, w, h] of [['exam.html', 1280, 900], ['exam.html', 375, 812], ['special.html', 1280, 900]]) {
	const { ctx, page, errors } = await openPage(browser, base, file, { width: w, height: h });
	await page.evaluate(() => { if (typeof closeUiNotice === 'function') closeUiNotice(); });
	await page.waitForTimeout(200);
	// special の Deck の項目は新UIのときだけ出る。4項目そろった状態で測る
	if (file === 'special.html') await page.evaluate(() => { deckMode = true; updateDeckEntryVisibility(); });
	await page.evaluate(() => setFabOpen(true));
	await page.waitForTimeout(400);
	const fab = await page.evaluate(() => {
		const items = [...document.querySelectorAll('.uma-fab-item')].filter((e) => !e.hidden);
		const r = items.map((e) => e.getBoundingClientRect());
		return {
			n: items.length,
			widths: r.map((x) => Math.round(x.width)),
			labelLefts: items.map((e) => Math.round(e.firstElementChild.getBoundingClientRect().left)),
			iconRights: items.map((e) => Math.round(e.lastElementChild.getBoundingClientRect().right)),
			toggleRight: Math.round(document.getElementById('fab-toggle').getBoundingClientRect().right),
			navRight: Math.round(document.getElementById('fab-nav').getBoundingClientRect().right),
			overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
		};
	});
	const label = file + ' ' + w + 'px';
	assert(fab.n >= 3 && new Set(fab.widths).size === 1, 'ボタン群の幅: ' + label + ' で全部同じ幅', fab.widths);
	assert(new Set(fab.labelLefts).size === 1, 'ボタン群の幅: ' + label + ' でラベルが左で揃う', fab.labelLefts);
	assert(new Set(fab.iconRights).size === 1, 'ボタン群の幅: ' + label + ' でアイコンの丸が右で揃う', fab.iconRights);
	assert(fab.toggleRight === fab.navRight && !fab.overflow,
		'ボタン群の幅: ' + label + ' でメインボタンは右端のまま、横スクロールも出ない', fab);
	assert(errors.length === 0, 'ボタン群の幅: ' + label + ' でコンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * スキルセットの分類（超優先／優先／通常。C-57）
 *   - tiers を持たない既存のデータ（fixtures は schemaVersion 2）を開くと、全部「優先」に入る
 *   - 開いて分類のタブを切り替えただけでは、保存データに tiers が書き足されない（C-51 の知見）
 *   - 再分類 → tiers が書かれ schemaVersion が 4 に → 「元に戻す」で tiers が消える（分類は Undo に積む）
 *   - モード（再分類／削除）は同時に ON にならず、× と移動先ボタンはモードのときだけ出る
 *   - Deck の書き出しに tiers が入り、取り込み直しても残る。tiers の無いデータを取り込んでも壊れない
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	const stored = () => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
	const before = await stored();
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(400);
	const ui = () => page.evaluate(() => {
		const r = '#deck-template-panel';
		const q = (s) => document.querySelector(r + ' ' + s);
		return {
			counts: [1, 2, 3].map(t => q('[data-usd-el="tier-count-' + t + '"]').textContent),
			total: q('[data-usd-el="tier-total"]').textContent,
			panels: document.querySelectorAll(r + ' .usd-panel').length,
			marks: Array.from(document.querySelectorAll(r + ' .usd-panel .uma-tier-mark')).map(m => m.dataset.tier).join(''),
			dels: document.querySelectorAll(r + ' .usd-panel-del').length,
			moves: document.querySelectorAll(r + ' .usd-panel-move').length,
			reclass: q('[data-usd-el="mode-reclass"]').getAttribute('aria-pressed'),
			del: q('[data-usd-el="mode-delete"]').getAttribute('aria-pressed'),
			// C-3: 一括削除は常時見えている（削除モードとは関わらない）。0種でないので押せる
			clearDisabled: q('[data-usd-el="clear-skills"]').disabled,
			cols: getComputedStyle(q('[data-usd-el="selected-list"]')).gridTemplateColumns.split(' ').length,
			schema: JSON.parse(localStorage.getItem('umaSkillDeck:userData')).schemaVersion,
			tiers: JSON.parse(localStorage.getItem('umaSkillDeck:userData')).templates[0].tiers,
		};
	});
	const t0 = await ui();
	assert(t0.counts.join() === '0,' + PICK.length + ',0' && t0.total === String(PICK.length) && t0.panels === PICK.length && t0.marks === '2'.repeat(PICK.length),
		'tiers: tiers を持たないデータのスキルは全部「優先」に入る', t0);
	// 印は競馬の印（◎○▲）を**線で**描いた SVG（C-58 の作業B）。塗りつぶさないので fill は none
	const markShape = await page.evaluate(() => {
		const one = (t) => {
			const el = document.createElement('div');
			el.innerHTML = UmaSkillDeckCore.tiers.markHtml(t);
			const svg = el.querySelector('svg');
			const mark = el.querySelector('.uma-tier-mark');
			return { tier: mark.dataset.tier, fill: svg.getAttribute('fill'), stroke: svg.getAttribute('stroke'),
				shapes: Array.from(svg.children).map(c => c.tagName).join('+') };
		};
		return [1, 2, 3].map(one);
	});
	assert(markShape[0].shapes === 'circle+circle' && markShape[1].shapes === 'circle' && markShape[2].shapes === 'path',
		'tiers: 印は 超優先＝◎（二重の輪）／優先＝○／通常＝▲（三角）', markShape.map(m => m.shapes));
	assert(markShape.every(m => m.fill === 'none' && m.stroke === 'currentColor'),
		'tiers: 印は線で描き、塗りつぶさない（色は data-tier から currentColor で拾う）', markShape);
	// スキルパネルはゲームの板の質感（C-58 の作業A）。地はグラデーション、影は3つ重なる
	const panelLook = await page.evaluate(() => {
		const cs = getComputedStyle(document.querySelector('#deck-template-panel .usd-panel'));
		return { bg: cs.backgroundImage, shadows: cs.boxShadow.split(/,(?![^(]*\))/).length, border: cs.borderTopWidth };
	});
	assert(panelLook.bg.startsWith('linear-gradient(') && panelLook.shadows === 3,
		'tiers: スキルパネルは横方向のグラデーション＋影3つ（板の質感。C-58 の作業A）', panelLook);
	assert(t0.dels === 0 && t0.moves === 0 && t0.reclass === 'false' && t0.del === 'false',
		'tiers: 既定は両方のモードが OFF（× も移動先も出ない）', t0);
	assert(t0.cols > 2, 'tiers: 1280px ではパネルの列が画面幅に合わせて増える', t0.cols);
	await page.click('#deck-template-panel [data-usd-act="tier-tab"][data-tier="1"]');
	await page.waitForTimeout(200);
	const t1 = await ui();
	assert(t1.panels === 0 && (await stored()) === before, 'tiers: 分類のタブを切り替えても保存データは変わらない（tiers は書き足されない）', t1);
	await page.click('#deck-template-panel [data-usd-act="tier-tab"][data-tier="2"]');
	await page.click('#deck-template-panel [data-usd-el="mode-reclass"]');
	await page.waitForTimeout(200);
	const t2 = await ui();
	assert(t2.reclass === 'true' && t2.del === 'false' && t2.moves === PICK.length * 2 && t2.dels === 0,
		'tiers: 再分類モードでは各パネルに移動先の2つ（超優先・通常）が出て、× は出ない', t2);
	await page.click('#deck-template-panel [data-usd-el="mode-delete"]');
	await page.waitForTimeout(200);
	const t3 = await ui();
	assert(t3.reclass === 'false' && t3.del === 'true' && t3.dels === PICK.length && t3.moves === 0,
		'tiers: 削除モードにすると再分類は OFF になり、× が出る', t3);
	await page.click('#deck-template-panel [data-usd-el="mode-reclass"]');
	await page.waitForTimeout(200);
	await page.click('#deck-template-panel .usd-panel .usd-panel-move[data-tier="1"]');
	await page.waitForTimeout(300);
	const t4 = await ui();
	assert(t4.counts.join() === '1,' + (PICK.length - 1) + ',0' && t4.schema === 4 && JSON.stringify(t4.tiers) === JSON.stringify({ [PICK[0].id]: 1 }),
		'tiers: 再分類で tiers が書かれ、schemaVersion が 4 に上がる', t4);
	assert((await page.evaluate(() => document.getElementById('toast-message').textContent)) === '「' + PICK[0].name + '」を超優先へ移しました'
		&& (await page.evaluate(() => UmaSkillDeckCore.undoCount())) === 1,
		'tiers: 再分類は「元に戻す」に積まれ、トーストが出る');
	await page.click('#deck-template-panel [data-usd-act="tier-tab"][data-tier="1"]');
	await page.waitForTimeout(200);
	const t5 = await ui();
	assert(t5.panels === 1 && t5.marks === '1', 'tiers: 超優先のタブに移したスキルが金の★で出る', t5);
	await page.click('#deck-undo-btn');
	await page.waitForTimeout(300);
	const t6 = await ui();
	assert(t6.tiers === undefined && t6.counts.join() === '0,' + PICK.length + ',0' && (await page.evaluate(() => UmaSkillDeckCore.undoCount())) === 0,
		'tiers: 「元に戻す」で分類が元に戻り、tiers は消える', t6);
	assert(errors.length === 0, 'tiers: special でコンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}
{
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	await page.click('#template-panel-root .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(300);
	await page.click('#template-panel-root [data-usd-el="mode-reclass"]');
	await page.click('#template-panel-root .usd-panel .usd-panel-move[data-tier="3"]');
	await page.waitForTimeout(300);
	await page.click('#tab-btn-data');
	await page.waitForTimeout(300);
	await page.click('button[onclick="exportData()"]');
	await page.waitForTimeout(300);
	const exported = await page.inputValue('#export-textarea');
	const exp = JSON.parse(exported);
	assert(exp.schemaVersion === 4 && JSON.stringify(exp.templates[0].tiers) === JSON.stringify({ [PICK[0].id]: 3 }),
		'tiers(deck): 書き出しに tiers と schemaVersion 4 が入る', { schema: exp.schemaVersion, tiers: exp.templates[0].tiers });
	const roundtrip = await page.evaluate((json) => {
		document.getElementById('import-textarea').value = json;
		const realConfirm = window.confirm; window.confirm = () => true; importData(); window.confirm = realConfirm;
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		return { schema: d.schemaVersion, tiers: d.templates[0].tiers };
	}, exported);
	assert(roundtrip.schema === 4 && JSON.stringify(roundtrip.tiers) === JSON.stringify({ [PICK[0].id]: 3 }),
		'tiers(deck): 取り込み直しても tiers が残る', roundtrip);
	const legacy = await page.evaluate((json) => {
		document.getElementById('import-textarea').value = json;
		const realConfirm = window.confirm; window.confirm = () => true; importData(); window.confirm = realConfirm;
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		return { schema: d.schemaVersion, tiers: d.templates[0].tiers, n: d.templates.length };
	}, JSON.stringify(USER_DATA));
	assert(legacy.schema === USER_DATA.schemaVersion && legacy.tiers === undefined && legacy.n === USER_DATA.templates.length,
		'tiers(deck): tiers の無いデータを取り込んでも壊れず、tiers は補われない', legacy);
	await page.click('#tab-btn-template');
	await page.waitForTimeout(300);
	await page.click('#template-panel-root .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(300);
	const counts = await page.evaluate(() => [1, 2, 3].map(t => document.querySelector('#template-panel-root [data-usd-el="tier-count-' + t + '"]').textContent));
	assert(counts.join() === '0,' + PICK.length + ',0', 'tiers(deck): 取り込んだ古いデータのスキルは全部「優先」に入る', counts);
	assert(errors.length === 0, 'tiers(deck): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * ②の B・C ―― シナリオ因子と遺伝子を対象に含める（C-2a）
 *
 *   - 1行（☑ 呼び名 N種 ?）。ON のあいだはバッジの色が変わる（C-2c で1行に畳んだ）
 *   - 「?」は**見るだけ**の一覧をミニウィンドウで開く（チェックは付かない）
 *   - 種数はカタログから数える（ソースに数字を書かない）
 *   - scopes を持たない既存のデータ（fixtures は schemaVersion 2）は両方 OFF で読める
 *   - ON にすると template.scopes が書かれ schemaVersion が 5 に上がる。OFF に戻すと項目ごと消える
 *   - 複製で写り、書き出し・取り込みで残る
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(400);
	const sc = () => page.evaluate(() => {
		const r = '#deck-template-panel';
		const secs = Array.from(document.querySelectorAll(r + ' [data-usd-scope-section]')).map(s => {
			const badge = s.querySelector('[data-usd-scope-badge]');
			const help = s.querySelector('[data-usd-act="scope-help"]');
			return {
				key: s.getAttribute('data-usd-scope-section'),
				row: s.className,
				label: s.querySelector('.uma-checkrow-label span').textContent,
				badge: badge ? badge.textContent : null, badgeAccent: badge ? badge.classList.contains('uma-badge--accent') : null,
				checked: s.querySelector('input[type="checkbox"]').checked,
				help: !!help, helpOpen: help ? help.getAttribute('aria-expanded') : null,
				// C-2c: 折りたたみの見出しも、入れ子のカードも、説明文も置かない
				noHead: !s.querySelector('.uma-section-head'), noCard: !s.querySelector('.uma-checkcard'),
				height: Math.round(s.getBoundingClientRect().height)
			};
		});
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		return { secs, schema: d.schemaVersion, scopes: d.templates[0].scopes,
			// ミニウィンドウは body 直下（.glass-card の backdrop-filter が fixed を殺すため。C-2c）
			modal: !!document.querySelector('[data-usd-el="scope-list-modal"]:not([hidden])'),
			names: Array.from(document.querySelectorAll('[data-usd-el="scope-list-modal"] .uma-namelist > li')).map(li => li.textContent),
			modalTitle: (document.querySelector('[data-usd-el="scope-list-modal"] .usd-roster-h') || {}).textContent || null };
	});
	// 種数はカタログから数えた値と突き合わせる（期待値をここに書かない）
	const catalogCounts = await page.evaluate(() => ({
		scenarioFactors: UmaSkillDeckCore.getCatalogEntries('scenarioFactor').length,
		genes: UmaSkillDeckCore.getCatalogEntries('geneFactor').length
	}));
	const s0 = await sc();
	assert(s0.secs.length === 2 && s0.secs[0].key === 'scenarioFactors' && s0.secs[1].key === 'genes'
		&& s0.secs[0].label === 'シナリオ因子' && s0.secs[1].label === '遺伝子',
		'C-2a: ②に B（シナリオ因子）と C（遺伝子）が並ぶ。呼び名に「〜を対象」を付けない', s0.secs.map(x => x.key + '/' + x.label));
	assert(s0.secs.every(x => x.checked === false && x.row === 'uma-checkrow' && x.noHead && x.noCard && x.help),
		'C-2c: 1行（チェック・呼び名・件数・?）だけ。折りたたみの見出しも入れ子のカードも無い', s0.secs);
	assert(s0.secs.every(x => x.height <= 40),
		'C-2c: 1行に収まっている（高さが2行ぶんを超えない）', s0.secs.map(x => x.height));
	assert(s0.secs[0].badge === catalogCounts.scenarioFactors + '種' && s0.secs[1].badge === catalogCounts.genes + '種'
		&& s0.secs.every(x => x.badgeAccent === false),
		'C-2a: 種数が見える（数はカタログから数える）', { badges: s0.secs.map(x => x.badge), catalogCounts });
	assert(s0.scopes === undefined && s0.schema === USER_DATA.schemaVersion,
		'C-2a: scopes を持たない既存のデータは、開いただけでは姿が変わらない', { scopes: s0.scopes, schema: s0.schema });
	// 「?」＝見るだけの一覧（チェックは付かない）
	await page.click('#deck-template-panel [data-usd-act="scope-help"][data-scope="scenarioFactors"]');
	await page.waitForTimeout(300);
	const help = await sc();
	assert(help.modal && help.names.length === catalogCounts.scenarioFactors
		&& help.modalTitle === 'シナリオ因子（' + catalogCounts.scenarioFactors + '種）'
		&& help.secs[0].helpOpen === 'true',
		'C-2c: 「?」で一覧のミニウィンドウが開く（件数はカタログから）', { n: help.names.length, title: help.modalTitle });
	assert(help.names.every(n => n && n.length > 0) && help.secs.every(x => x.checked === false),
		'C-2c: 一覧は見るだけ（開いてもチェックは付かない）', { first: help.names[0], checked: help.secs.map(x => x.checked) });
	// 閉じる口は2つある（背景と×）。背景は箱の下に敷いてあるので、×のほうを押す
	await page.click('[data-usd-el="scope-list-close"]');
	await page.waitForTimeout(250);
	const closed = await sc();
	assert(!closed.modal && closed.secs[0].helpOpen === 'false', 'C-2c: 「?」の一覧は閉じられる', closed.modal);
	await page.click('#deck-template-panel [data-usd-act="scope-check"][data-scope="scenarioFactors"]');
	await page.waitForTimeout(300);
	const s2 = await sc();
	assert(s2.secs[0].checked && JSON.stringify(s2.scopes) === JSON.stringify({ scenarioFactors: true }) && s2.schema === 5,
		'C-2a: ON にすると scopes が書かれ、schemaVersion が 5 に上がる', { scopes: s2.scopes, schema: s2.schema });
	assert(s2.secs[0].badge === catalogCounts.scenarioFactors + '種' && s2.secs[0].badgeAccent === true,
		'C-2c: ON のあいだはバッジの色が変わる（件数の文言は変えない）', s2.secs[0]);
	// 複製すると写る
	await page.click('#deck-template-panel [data-usd-act="template-duplicate"]');
	await page.waitForTimeout(400);
	const dup = await page.evaluate(() => {
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		const last = d.templates[d.templates.length - 1];
		return { name: last.name, scopes: last.scopes, tiers: last.tiers };
	});
	assert(JSON.stringify(dup.scopes) === JSON.stringify({ scenarioFactors: true }),
		'C-2a: 複製すると scopes も写る（tiers と同じ）', dup);
	// OFF に戻すと項目ごと消える（全部 OFF のセットは scopes を持たない＝旧データと同じ姿）
	await page.click('#deck-template-panel [data-usd-act="scope-check"][data-scope="scenarioFactors"]');
	await page.waitForTimeout(300);
	const off = await page.evaluate(() => {
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		const last = d.templates[d.templates.length - 1];
		return { scopes: last.scopes, has: Object.prototype.hasOwnProperty.call(last, 'scopes') };
	});
	assert(!off.has, 'C-2a: 全部 OFF に戻すと scopes は項目ごと消える', off);
	// **元のセットのタブに戻してから** C を ON にして、保存された JSON を取っておく
	// （複製したときに選択が複製側へ移っている）
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(300);
	await page.click('#deck-template-panel [data-usd-act="scope-check"][data-scope="genes"]');
	await page.waitForTimeout(300);
	const savedJson = await page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
	assert(JSON.stringify(JSON.parse(savedJson).templates.find(t => t.templateId === TEMPLATE_ID).scopes)
			=== JSON.stringify({ scenarioFactors: true, genes: true }),
		'C-2a: 元のセットの scopes に B・C が書かれている', JSON.parse(savedJson).templates.find(t => t.templateId === TEMPLATE_ID).scopes);
	assert(errors.length === 0, 'C-2a: special でコンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();

	/* 保存したものを**まっさらな画面で開き直す**。openPage は addInitScript で毎回
	   代表データを書き戻すので、ここだけ自前で文脈を作って保存済みの JSON を入れる。 */
	const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const page2 = await ctx2.newPage();
	const errors2 = [];
	page2.on('pageerror', (e) => errors2.push(String(e)));
	page2.on('console', (m) => { if (m.type() === 'error') errors2.push(m.text()); });
	await page2.addInitScript((json) => localStorage.setItem('umaSkillDeck:userData', json), savedJson);
	await page2.goto(base + '/special.html', { waitUntil: 'networkidle', timeout: 60000 });
	await page2.waitForTimeout(1500);
	if (await page2.isVisible('#ui-notice')) await page2.click('[data-act="notice-ok"]');
	await page2.waitForTimeout(300);
	await page2.click('#deck-template-panel .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page2.waitForTimeout(400);
	const back = await page2.evaluate(() => {
		const r = '#deck-template-panel';
		const s = document.querySelector(r + ' [data-usd-scope-section="genes"]');
		const b = document.querySelector(r + ' [data-usd-scope-section="scenarioFactors"]');
		return { checked: s ? s.querySelector('input[type="checkbox"]').checked : null,
			accent: s ? s.querySelector('[data-usd-scope-badge]').classList.contains('uma-badge--accent') : null,
			// 「?」の一覧は開いていない（開閉は保存しない）
			helpOpen: s ? s.querySelector('[data-usd-act="scope-help"]').getAttribute('aria-expanded') : null,
			modal: !!document.querySelector('[data-usd-el="scope-list-modal"]:not([hidden])'),
			otherChecked: b ? b.querySelector('input[type="checkbox"]').checked : null,
			// 呼び出し元へ渡す選択にも scopes が乗る（C-2b の照合はこれを見る）
			sel: deckTemplateManager ? deckTemplateManager.getSelection().scopes : null };
	});
	// 元のセットは B を ON にしたあと複製しているので、B・C とも ON のまま
	// （OFF に戻したのは複製したほうで、そちらは scopes ごと消えている）
	assert(back.checked === true && back.accent === true && back.otherChecked === true,
		'C-2a: 開き直しても ON のまま', back);
	assert(back.helpOpen === 'false' && !back.modal,
		'C-2c: 「?」の一覧は開いた状態を保存しない', { helpOpen: back.helpOpen, modal: back.modal });
	assert(JSON.stringify(back.sel) === JSON.stringify({ scenarioFactors: true, genes: true }),
		'C-2a: getSelection() の戻り値に scopes が入る', back.sel);
	assert(errors2.length === 0, 'C-2a: 開き直した special でコンソールエラーが出ない', errors2.slice(0, 3));
	await ctx2.close();
}
{
	// 書き出し・取り込みで scopes が残る（Deck 単体ページのデータ管理から）
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	await page.evaluate(() => {
		const d = UmaSkillDeckCore.getUserData();
		d.templates[0].scopes = { genes: true };
		d.schemaVersion = 5;
		UmaSkillDeckCore.saveUserData();
	});
	await page.click('#tab-btn-data');
	await page.waitForTimeout(300);
	await page.click('button[onclick="exportData()"]');
	await page.waitForTimeout(300);
	const exported = await page.inputValue('#export-textarea');
	const exp = JSON.parse(exported);
	assert(exp.schemaVersion === 5 && JSON.stringify(exp.templates[0].scopes) === JSON.stringify({ genes: true }),
		'C-2a(deck): 書き出しに scopes と schemaVersion 5 が入る', { schema: exp.schemaVersion, scopes: exp.templates[0].scopes });
	const roundtrip = await page.evaluate((json) => {
		document.getElementById('import-textarea').value = json;
		const realConfirm = window.confirm; window.confirm = () => true; importData(); window.confirm = realConfirm;
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		return { schema: d.schemaVersion, scopes: d.templates[0].scopes };
	}, exported);
	assert(roundtrip.schema === 5 && JSON.stringify(roundtrip.scopes) === JSON.stringify({ genes: true }),
		'C-2a(deck): 取り込み直しても scopes が残る', roundtrip);
	const legacy = await page.evaluate((json) => {
		document.getElementById('import-textarea').value = json;
		const realConfirm = window.confirm; window.confirm = () => true; importData(); window.confirm = realConfirm;
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		return { schema: d.schemaVersion, has: Object.prototype.hasOwnProperty.call(d.templates[0], 'scopes') };
	}, JSON.stringify(USER_DATA));
	assert(legacy.schema === USER_DATA.schemaVersion && !legacy.has,
		'C-2a(deck): scopes の無いデータを取り込んでも壊れず、scopes は補われない', legacy);
	assert(errors.length === 0, 'C-2a(deck): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}
/* **外した検査（C-2c）**: 「『◯◯はスキルではないので、対象スキル数・検出数には含めず、
   別に数えます。』の1文が exam.html と special.html の両方にある」（C-2a で足した）。
   C-2c で**この説明文そのものを両方から消した**ため（冗長という判断。おいもさん）、
   見張る対象が無くなった。**文言が食い違ったのではなく、文言が無くなったので外した。**
   説明を復活させるなら、この検査も一緒に戻すこと。 */

/* ============================================================
 * 追加済みスキルの一括削除（C-3）
 *
 *   - A の入口の並びに常時見えている（削除モードに入らなくても押せる）
 *   - 消すのは**スキルと分類だけ**。セットの名前も B・C（節の ON/OFF）も残る
 *   - 保存済みの因子セットでも同じように使える
 *   - 「元に戻す」で戻る
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	// 保存済みのセットを選び、名前を入れ、B・C を ON にしてから一括削除する
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(400);
	await page.click('#deck-template-panel [data-usd-act="scope-check"][data-scope="scenarioFactors"]');
	await page.waitForTimeout(300);
	const before = await page.evaluate((tid) => {
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		const t = d.templates.find(x => x.templateId === tid) || d.templates[0];
		const btn = document.querySelector('#deck-template-panel [data-usd-el="clear-skills"]');
		return { name: t.name, n: t.skillIds.length, tiers: t.tiers, scopes: t.scopes,
			disabled: btn.disabled, nameInput: document.querySelector('#deck-template-panel [data-usd-el="name-input"]').value };
	}, TEMPLATE_ID);
	assert(before.n > 0 && !before.disabled && JSON.stringify(before.scopes) === JSON.stringify({ scenarioFactors: true }),
		'C-3: 中身のある保存済みのセットでは一括削除が押せる', before);
	await page.click('#deck-template-panel [data-usd-el="clear-skills"]');
	await page.waitForTimeout(400);
	const after = await page.evaluate((tid) => {
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		const t = d.templates.find(x => x.templateId === tid) || d.templates[0];
		const btn = document.querySelector('#deck-template-panel [data-usd-el="clear-skills"]');
		return { name: t.name, n: t.skillIds.length, tiers: t.tiers, scopes: t.scopes,
			disabled: btn.disabled, count: document.querySelector('#deck-template-panel [data-usd-el="selected-count"]').textContent,
			checked: document.querySelector('#deck-template-panel [data-usd-act="scope-check"][data-scope="scenarioFactors"]').checked,
			nameInput: document.querySelector('#deck-template-panel [data-usd-el="name-input"]').value,
			toast: document.getElementById('toast-message').textContent,
			undo: UmaSkillDeckCore.undoCount() };
	}, TEMPLATE_ID);
	assert(after.n === 0 && after.count === '0' && after.tiers === undefined,
		'C-3: 保存済みのセットでもスキルと分類が消える', after);
	assert(after.name === before.name && after.nameInput === before.nameInput
		&& JSON.stringify(after.scopes) === JSON.stringify(before.scopes) && after.checked === true,
		'C-3: **名前と B・C は消えない**（消すのはスキルだけ）', { name: after.name, scopes: after.scopes, checked: after.checked });
	assert(after.disabled && after.undo === 1
		&& after.toast === '追加済みスキル' + before.n + '種を削除しました',
		'C-3: 0種になると押せなくなり、「元に戻す」に1件積まれる', after);
	await page.click('#deck-undo-btn');
	await page.waitForTimeout(400);
	const back = await page.evaluate((tid) => {
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		const t = d.templates.find(x => x.templateId === tid) || d.templates[0];
		return { n: t.skillIds.length, name: t.name, scopes: t.scopes,
			toast: document.getElementById('toast-message').textContent,
			undo: UmaSkillDeckCore.undoCount() };
	}, TEMPLATE_ID);
	assert(back.n === before.n && back.undo === 0
		&& back.toast === '削除した追加済みスキル' + before.n + '種を戻しました',
		'C-3: 「元に戻す」でスキルが戻る', back);
	assert(back.name === before.name && JSON.stringify(back.scopes) === JSON.stringify(before.scopes),
		'C-3: 戻したあとも名前と B・C はそのまま', back);
	assert(errors.length === 0, 'C-3: special でコンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * 因子を照合の対象に含める（C-2b）
 *
 *   - OFF のときは、3本立ても辞書も検出も**今までどおり**（因子が1つも混ざらない）
 *   - ON にすると辞書に因子の名前が入り、対象スキル数・検出数には**含めず別に数える**
 *   - 誤マッチのガード: 遺伝子は完全一致のみ（最小距離1）、シナリオ因子は距離1まで
 *   - 結果の表では因子の行に◆が付く（分類の◎○▲ とは別）
 *   - コピー用データには因子の行も入る
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(500);

	const lists = () => page.evaluate(() => ({
		all: skillList.length, skills: skillOnlyList.length, factors: factorOnlyList.length,
		badge: document.getElementById('skill-count-badge').textContent,
		note: document.getElementById('deck-selected-note').textContent
	}));
	const off = await lists();
	assert(off.all === off.skills && off.factors === 0 && off.badge === off.skills + '種'
		&& off.note.indexOf('因子') === -1,
		'C-2b: OFF のときは因子が1つも混ざらない（今までどおり）', off);

	// B（シナリオ因子）を ON にする（C-2c で1行になったので、そのままチェックを押せる）
	await page.click('#deck-template-panel [data-usd-act="scope-check"][data-scope="scenarioFactors"]');
	await page.waitForTimeout(400);
	const nFactor = await page.evaluate(() => UmaSkillDeckCore.getCatalogEntries('scenarioFactor').length);
	const on = await lists();
	assert(on.skills === off.skills && on.factors === nFactor && on.all === off.skills + nFactor,
		'C-2b: ON にすると辞書に因子が入り、スキルの数は変わらない', { off, on, nFactor });
	assert(on.badge === off.skills + '種',
		'C-2b: ②のタブのバッジはスキルの数のまま（375px の折り返しを動かさない）', on.badge);
	assert(on.note.includes('の' + off.skills + '種＋因子' + nFactor + '種を照合します'),
		'C-2b: 選択の注記はスキルの数と因子の数を分けて書く', on.note);

	// 照合を通す。因子2種が写っている行を混ぜ、「言い切れない1文字崩れ」も入れる
	const res = await page.evaluate(() => {
		const names = UmaSkillDeckCore.getCatalogEntries('scenarioFactor').map(e => e.name);
		const broken = names[1].slice(0, 1) + '※' + names[1].slice(2);   // 距離1（一意）→ 残る
		const far = names[2].slice(0, 1) + '※※' + names[2].slice(3);     // 距離2 → 落ちる
		const mk = (texts) => texts.map((t, i) => ({ text: t, stars: (i % 3) + 1, starsReliable: true, rowKey: 'r' + i }));
		const lines = mk(skillOnlyList.slice(0, 4).concat([names[0], broken, far]));
		personResults[0] = applyFactorStrictMatch(
			matchAllSkillsWithStars(lines, skillList, skillIndex, {}), lines);
		personLines[0] = lines;
		renderResults();
		const rows = Array.from(document.querySelectorAll('#result-tbody tr'));
		const factorSet = new Set(factorOnlyList);
		return {
			total: document.getElementById('stat-total').textContent,
			totalFactor: document.getElementById('stat-total-factor').textContent,
			totalFactorHidden: document.getElementById('stat-total-factor').hidden,
			found: document.getElementById('stat-found-1').textContent,
			foundFactor: document.getElementById('stat-found-factor-1').textContent,
			rowCount: rows.length,
			// ◆（シナリオ因子）／♡（遺伝子）が付いている行と、◎○▲ が付いている行
			// **段G で印を分けた。** 以前はどちらも ◆（--uma-mark-catalog）だった。
			diamond: rows.filter(r => r.querySelector('td .text-\\[var\\(--uma-mark-catalog\\)\\]'))
				.map(r => r.querySelector('td').textContent.replace(/^◆\s*/, '').trim()),
			heart: rows.filter(r => r.querySelector('td .text-\\[var\\(--uma-mark-gene\\)\\]'))
				.map(r => r.querySelector('td').textContent.replace(/^♡\s*/, '').trim()),
			diamondGlyphs: rows.filter(r => r.querySelector('td .text-\\[var\\(--uma-mark-catalog\\)\\]'))
				.map(r => r.querySelector('td .text-\\[var\\(--uma-mark-catalog\\)\\]').textContent),
			heartGlyphs: rows.filter(r => r.querySelector('td .text-\\[var\\(--uma-mark-gene\\)\\]'))
				.map(r => r.querySelector('td .text-\\[var\\(--uma-mark-gene\\)\\]').textContent),
			tierMarked: rows.filter(r => r.querySelector('td .uma-tier-mark')).length,
			copyLines: document.getElementById('copy-data').value.split('\n').length,
			kept: [names[0], names[1]].filter(n => factorSet.has(n)),
			detected: Array.from(personResults[0].detectedSkills).filter(n => factorSet.has(n)).sort(),
			expectKept: [names[0], names[1]].sort(), dropped: names[2]
		};
	});
	assert(res.total === String(off.skills) && !res.totalFactorHidden && res.totalFactor === '＋ 因子 ' + nFactor + '種',
		'C-2b: 対象スキル数はスキルだけ。因子は別の行で数える', res);
	assert(res.detected.join() === res.expectKept.join(),
		'C-2b: 完全一致と「距離1で一意」の因子は残り、距離2の崩れは落ちる', { detected: res.detected, expect: res.expectKept, dropped: res.dropped });
	assert(res.found === '4' && res.foundFactor === '＋ 因子 2',
		'C-2b: 検出数もスキルと因子で分けて数える', { found: res.found, foundFactor: res.foundFactor });
	// 段G: 印は節ごとに分かれた（◆＝シナリオ因子／♡＝遺伝子）。
	// **この検査で見ているのはシナリオ因子だけを ON にした状態**（上の scopes の作り方による）。
	// 合計が因子の数と合い、遺伝子の♡は1つも出ていないこと。
	assert(res.diamond.length + res.heart.length === nFactor && res.tierMarked > 0,
		'C-2b: 因子の行には印、スキルの行には◎○▲（左の同じ欄）',
		{ diamond: res.diamond.length, heart: res.heart.length, tier: res.tierMarked });
	assert(res.diamondGlyphs.every(g => g === '◆') && res.heartGlyphs.every(g => g === '♡'),
		'段G(special): シナリオ因子は◆・遺伝子は♡（形が混ざらない）',
		{ diamond: res.diamondGlyphs.slice(0, 3), heart: res.heartGlyphs.slice(0, 3) });
	assert(res.copyLines === off.skills + nFactor,
		'C-2b: コピー用データには因子の行も入る（表と同じ並び）', { copyLines: res.copyLines, expect: off.skills + nFactor });

	// 結合画像の凡例に◆の行が増える
	const legend = await page.evaluate(() => {
		const rowsOf = () => {
			const bar = buildTierLegendBar(600, 600, true);
			return bar ? bar.height : 0;
		};
		const withFactor = rowsOf();
		const keep = factorOnlyList;
		factorOnlyList = [];
		const withoutFactor = rowsOf();
		factorOnlyList = keep;
		return { withFactor, withoutFactor };
	});
	assert(legend.withFactor > legend.withoutFactor,
		'C-2b: 因子を含めているときは、凡例の帯に◆の行が増える', legend);

	/* --- 段G: 遺伝子も ON にして、◆と♡が**同時に**出ることを見る ---
	   C-2b の段では節が1つしか ON になっていないので、2つの印が混ざらないことは確かめられない。
	   凡例は「含めている節のぶんだけ」行が増えるので、2節 ON なら1節 ON より高くなる。 */
	await page.click('#deck-template-panel [data-usd-act="scope-check"][data-scope="genes"]');
	await page.waitForTimeout(400);
	const both = await page.evaluate(() => {
		const names = UmaSkillDeckCore.getCatalogEntries('scenarioFactor').map(e => e.name);
		const genes = UmaSkillDeckCore.getCatalogEntries('geneFactor').map(e => e.name);
		const lines = skillOnlyList.slice(0, 3).concat([names[0], genes[0], genes[1]])
			.map((t, i) => ({ text: t, stars: (i % 3) + 1, starsReliable: true, rowKey: 'r' + i }));
		personResults[0] = applyFactorStrictMatch(
			matchAllSkillsWithStars(lines, skillList, skillIndex, {}), lines);
		personLines[0] = lines;
		renderResults();
		const rows = Array.from(document.querySelectorAll('#result-tbody tr'));
		const glyphs = (sel) => rows.map(r => r.querySelector('td ' + sel))
			.filter(Boolean).map(el => el.textContent);
		const legendH = () => { const b = buildTierLegendBar(600, 600, true); return b ? b.height : 0; };
		const twoScopes = legendH();
		const keep = factorMarkByNorm;
		// 遺伝子の印を引けなくすると、凡例は◆の行だけになる（＝行数が減る）
		factorMarkByNorm = new Map([...keep].filter(([, v]) => v === 'factor'));
		const oneScope = legendH();
		factorMarkByNorm = keep;
		return {
			diamonds: glyphs('.text-\\[var\\(--uma-mark-catalog\\)\\]'),
			hearts: glyphs('.text-\\[var\\(--uma-mark-gene\\)\\]'),
			// 検出したのは 因子1種＋遺伝子2種
			detectedGenes: genes.filter(n => personResults[0].detectedSkills.has(n)).length,
			twoScopes, oneScope
		};
	});
	assert(both.diamonds.every(g => g === '◆') && both.hearts.every(g => g === '♡')
		&& both.diamonds.length > 0 && both.hearts.length > 0,
		'段G(special): ◆と♡が同じ表に並び、形が混ざらない',
		{ diamonds: both.diamonds.length, hearts: both.hearts.length });
	assert(both.detectedGenes === 2,
		'段G(special): 遺伝子は完全一致で検出できている（印の分離が検出に影響していない）', both.detectedGenes);
	assert(both.twoScopes > both.oneScope,
		'段G(special): 凡例の帯は、含めている節のぶんだけ印の行が増える', both);
	assert(errors.length === 0, 'C-2b: special でコンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}
{
	// 誤マッチのガード: 遺伝子は完全一致のみ（「短距離の遺伝子」と「中距離の遺伝子」が距離1のため）
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	const g = await page.evaluate(() => {
		const genes = UmaSkillDeckCore.getCatalogEntries('geneFactor').map(e => e.name);
		const factors = UmaSkillDeckCore.getCatalogEntries('scenarioFactor').map(e => e.name);
		// 上限は**カタログから計算**した値。ここに数字を書かず、計算結果そのものを見る
		const limits = {};
		factorGuards().forEach(x => { limits[x.key] = x.limit; });
		// 最小距離（上限の根拠）
		const minOf = (names) => {
			const ns = names.map(normalizeText);
			let m = Infinity;
			for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) m = Math.min(m, levenshtein(ns[i], ns[j]));
			return m;
		};
		skillList = []; skillIndex = [];
		const dict = buildSkillDictionary(genes.concat(factors));
		skillList = dict.list; skillIndex = dict.index;
		factorOnlyList = genes.concat(factors);
		factorNormSet = new Set(factorOnlyList.map(normalizeText));
		const run = (texts) => {
			const lines = texts.map((t, i) => ({ text: t, stars: 1, starsReliable: true, rowKey: 'r' + i }));
			return Array.from(applyFactorStrictMatch(
				matchAllSkillsWithStars(lines, skillList, skillIndex, {}), lines).detectedSkills).sort();
		};
		// 「短距離の遺伝子」と「中距離の遺伝子」を探す（名前は書かず、距離1のペアとして取る）
		const gn = genes.map(n => ({ raw: n, n: normalizeText(n) }));
		let pair = null;
		for (let i = 0; i < gn.length && !pair; i++)
			for (let j = i + 1; j < gn.length && !pair; j++)
				if (levenshtein(gn[i].n, gn[j].n) === 1) pair = [gn[i].raw, gn[j].raw];
		// その1文字違いのペアを、両方そのまま／片方だけ／1文字崩して、の3通り
		const broken = pair ? pair[0].slice(0, pair[0].length - 2) + '※' + pair[0].slice(pair[0].length - 1) : '';
		return {
			limits, minGene: minOf(genes), minFactor: minOf(factors), pair,
			both: run(pair || []), onlyFirst: run(pair ? [pair[0]] : []), brokenHit: run([broken])
		};
	});
	assert(g.minGene === 1 && g.limits.genes === 0,
		'C-2b: 遺伝子は最小距離1なので、上限は0（完全一致のみ）', { min: g.minGene, limit: g.limits.genes });
	assert(g.minFactor === 2 && g.limits.scenarioFactors === 1,
		'C-2b: シナリオ因子は最小距離2なので、上限は1', { min: g.minFactor, limit: g.limits.scenarioFactors });
	assert(g.pair && g.both.join() === g.pair.slice().sort().join(),
		'C-2b: 1文字しか違わない遺伝子2つが同じ画像にあっても、両方そのまま検出できる', g);
	assert(g.onlyFirst.length === 1 && g.onlyFirst[0] === g.pair[0],
		'C-2b: 片方だけ写っているとき、もう片方は出てこない', g.onlyFirst);
	assert(g.brokenHit.length === 0,
		'C-2b: 遺伝子が1文字崩れたら採らない（相手方に化けるより出さないほうを採る）', g.brokenHit);
	assert(errors.length === 0, 'C-2b: ガードの確認でコンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * special と exam の操作感を揃える（59セッション目・C-59 の段0〜段3）
 *
 * 段0 … 結合ボタンの下の状態表示。OCR を回さずに結合すると印が黙って出ない状態があり、
 *        その3通り（旧UI／周回因子セット未選択／OCR未実行）を押す前に知らせる。
 * 段1 … exam のボタンが共通部品（.uma-btn）になり、common.css を読むようになった。
 *        注記の文言と結果の見出しが両ツールで揃っている。
 * 段2 … exam に結合の進捗バーが付いた。
 * 段3 … special の結合画像に凡例の帯。骨格は js/stitch.js（exam と共通）。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	// 状態表示は③（画像をアップロード）のタブの中にあるので、見えるところへ連れて行ってから読む
	const status = () => page.evaluate(() => {
		selectStepTab(2);
		const el = document.getElementById('tier-marks-status');
		return { text: el.textContent, tone: el.dataset.tone, shown: el.getClientRects().length > 0 };
	});

	// 段0-1) 周回因子セットを選んでいない（新UI）
	// **C-63 の (7) で「このまま結合すると印は入りません」の後半を落とした** ―― 印が付くのは
	// 一体のボタンからだけになったので、「このまま結合すると」が指すものが無くなった。
	const s0 = await status();
	assert(s0.shown && s0.tone === 'warn' && s0.text === '②で周回因子セットを選ぶと、分類の印を付けられるようになります。',
		'段0: セット未選択のときは「②で選ぶと付けられる」と出る', s0);

	// 段0-2) セットを選ぶと**何も言わなくなる**（status() が③へ移しているので②へ戻してから押す）。
	// 60セッション目（C-61）は「一体のボタンなら印も焼ける」と案内していたが、
	// 61セッション目（C-62 の (8)-6）に**文面ごと削除した** ―― どのボタンを押すかは
	// すぐ上のボタンの並びが言っているので、言葉で重ねない。
	await page.evaluate(() => selectStepTab(1));
	await page.waitForTimeout(200);
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(400);
	const s1 = await status();
	assert(s1.tone === 'none' && s1.text === '',
		'段0: セットを選んで OCR 未実行のときは何も言わない（C-62 の (8)-6）', s1);

	// 段0-3) OCR の結果ができても**何も言わない**（C-63 の (7)-2）。
	// それまでは「OCRの結果があるので印も焼きます」と出していたが、印が付くのは
	// 一体のボタンからだけになったので、**その文は嘘になった**（OCR 済みでも
	// 「画像を結合する（OCRしない）」からは付かない）。材料が揃っているときは何も言わない。
	await page.evaluate(() => {
		personResults[0] = matchAllSkillsWithStars(
			skillList.map((name, i) => ({ text: name, stars: (i % 3) + 1, starsReliable: true, rowKey: '0:' + i })),
			skillList, skillIndex, {});
	});
	await page.evaluate(() => updateTierMarksStatus());
	const s2 = await status();
	assert(s2.tone === 'none' && s2.text === '',
		'段0: OCR の結果があっても何も言わない（C-63 の (7)-2）', s2);
	assert(!(await page.evaluate(() => document.body.innerText)).includes('OCRの結果があるので'),
		'段0: 「OCRの結果があるので…」は画面に出ない（コード内のコメントは対象外）');

	// 段0-4) 印を付けない設定のときは、その旨だけを出す（OCR の有無に関わらず）
	await page.uncheck('#opt-tier-marks');
	await page.waitForTimeout(200);
	const s3 = await status();
	assert(s3.tone === 'off' && s3.text === '分類の印は付けません（上のチェックを入れると付きます）。',
		'段0: 印 OFF のときは「付けません」', s3);
	await page.check('#opt-tier-marks');
	await page.waitForTimeout(200);
	assert((await status()).tone === 'none', '段0: 印を戻すと元の判定に戻る');
	// 「焼く」という言い方はやめた（C-63 の (7)-4）。利用者に見える文字列に残っていないこと
	assert(!/焼[きくかけい]/.test(await page.evaluate(() => document.body.innerText)),
		'C-63 (7): 画面に出る文字列に「焼く」の言い回しが残っていない');

	// 段3) 凡例の帯。印を1つも焼いていなければ置かない（＝これまでどおりスキルパネルだけ）
	const legend = await page.evaluate(() => {
		const off = buildTierLegendBar(1200, 1200, false);
		const on = buildTierLegendBar(1200, 1200, true);
		const ctx2 = on.getContext('2d');
		const d = ctx2.getImageData(0, 0, on.width, on.height).data;
		let white = 0, note = 0, red = 0;
		for (let i = 0; i < d.length; i += 4) {
			if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) white++;
			if (d[i] === 0x55 && d[i + 1] === 0x55 && d[i + 2] === 0x55) note++;
			if (d[i] === 0xd8 && d[i + 1] === 0x1f && d[i + 2] === 0x26) red++;   // --uma-mark-tier-1
		}
		return { off: off, w: on.width, h: on.height, white: white, note: note, red: red, total: d.length / 4 };
	});
	assert(legend.off === null, '段3: 印を1つも付けていなければ凡例の帯を置かない', legend.off);
	assert(legend.w === 1200 && legend.h > 0, '段3: 帯は結合画像と同じ幅で作られる', { w: legend.w, h: legend.h });
	assert(legend.white > legend.total * 0.8, '段3: 帯の地は白', legend);
	assert(legend.note > 100, '段3: 説明文が補助テキストの色（#555555）で入っている', legend.note);
	assert(legend.red > 0, '段3: 超優先の印が赤（--uma-mark-tier-1）で入っている', legend.red);

	/* C-63 の (7): 分類の印が付くのは「OCR処理＋画像結合を開始する」からだけ。
	   buildStitchedSetImage() の3つ目の引数（withMarks）が false なら1つも描かない。
	   実際に結合させるのは重いので、**印を描く関数が呼ばれるかどうか**を差し替えて数える。 */
	const marksRoute = await page.evaluate(async () => {
		const calls = [];
		const orig = window.drawTierMarksOnPerson;
		window.drawTierMarksOnPerson = function (canvas, idx) { calls.push(idx); return 0; };
		const origBuild = window.stitchOnePerson;
		// 1人分の結合はダミーのCanvasで済ませる（印の経路だけを見る）
		window.stitchOnePerson = async () => { const c = document.createElement('canvas'); c.width = 10; c.height = 10; return c; };
		persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
		await buildStitchedSetImage(0, null, false);
		const off = calls.length;
		calls.length = 0;
		await buildStitchedSetImage(0, null, true);
		const on = calls.length;
		persons[0].files = [];
		window.drawTierMarksOnPerson = orig;
		window.stitchOnePerson = origBuild;
		return { off: off, on: on };
	});
	assert(marksRoute.off === 0, 'C-63 (7): withMarks が false なら印を1つも描かない（「画像を結合する（OCRしない）」）', marksRoute);
	assert(marksRoute.on === 1, 'C-63 (7): withMarks が true なら印を描きに行く（「OCR処理＋画像結合」）', marksRoute);
	// 呼び出し側: 個別のボタンは引数なし＝印なし、一体のボタンは withMarks: true
	const src = await page.evaluate(() => document.documentElement.outerHTML);
	assert(src.includes('onclick="runImageStitching()"'),
		'C-63 (7): 「画像を結合する（OCRしない）」は引数なしで呼ぶ（＝印なし）');
	assert(src.includes("runImageStitching({ keepClosed: true, quiet: true, withMarks: true })"),
		'C-63 (7): 一体のボタンだけが withMarks: true で呼ぶ');

	// 段3) 帯の骨格は js/stitch.js（exam と共通）。special 側に作り直しが残っていないこと
	const shared = await page.evaluate(() => ({
		metrics: typeof stitchNoteMetrics, draw: typeof stitchDrawNoteBar,
		wrap: typeof stitchWrapText, row: typeof stitchNoteTextRow, color: STITCH_NOTE_COLOR,
	}));
	assert(shared.metrics === 'function' && shared.draw === 'function' && shared.wrap === 'function'
		&& shared.row === 'function' && shared.color === '#555555',
		'段3: 帯の骨格が js/stitch.js から使える（special 側に写しを持たない）', shared);

	assert(errors.length === 0, '段0〜3(special): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * special の「OCR処理＋画像結合を開始する（高負荷）」（60セッション目・C-61）
 *
 * C-59 では案(c) として挙げながら採らなかったものを、**exam と同じ連続した体験を
 * special でも作るほうが、ボタンの数を抑えることより大事**という判断で入れた。
 * 見るのは4点。
 *   - 3つのボタンの主従（一体＝黒塗り・大／個別2つ＝白地・標準）と並び
 *   - 押せる条件が **special の前提**（対象スキルセットが空でなく、画像が1枚以上）に合っていること。
 *     とくに「画像を結合する」は、セットが空でも押せたまま（退行させていない）
 *   - 一体の処理の間は3つとも押せないこと（途中で個別のボタンが復活しない）
 *   - 知らせがまとめて1回になること（combinedOutcomeText の場合分け）
 * OCR そのものは回さない（Tesseract の言語データと実画像が要る）。実素材での通しは
 * output/scratch の使い捨てスクリプトで別に確認している。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);

	const look = () => page.evaluate(() => {
		selectStepTab(2);
		const one = (id) => {
			const b = document.getElementById(id);
			const r = b.getBoundingClientRect();
			return { cls: b.className, disabled: b.disabled, top: Math.round(r.top), h: Math.round(r.height) };
		};
		return { combo: one('process-stitch-btn'), ocr: one('process-btn'), stitch: one('stitch-btn') };
	});

	let L = await look();
	// C-62 の (8): **並び・大きさ・色を exam.html と同じにした**（C-61 で special だけ
	// 一体を先頭に置いていたのを戻した）。3つ目の「画像を結合する」は special だけの操作。
	assert(L.ocr.top < L.combo.top && L.combo.top < L.stitch.top,
		'C-62 (8): 並びは exam と同じ「OCR単独 → 一体 → 結合だけ」', { ocr: L.ocr.top, combo: L.combo.top, stitch: L.stitch.top });
	assert(L.ocr.cls.includes('uma-btn--primary') && L.ocr.cls.includes('uma-btn--lg'),
		'C-62 (8): OCR単独は黒塗り・大（exam と同じ）', L.ocr.cls);
	assert(L.combo.cls.includes('uma-btn--accent-outline') && L.combo.cls.includes('uma-btn--lg'),
		'C-62 (8): 一体は枠線・大（exam と同じ）', L.combo.cls);
	assert(L.stitch.cls.includes('uma-btn--secondary') && !L.stitch.cls.includes('uma-btn--lg'),
		'C-62 (8): 「画像を結合する」だけは標準の大きさのまま', L.stitch.cls);
	assert(L.ocr.h === L.combo.h && L.combo.h > L.stitch.h,
		'C-62 (8): 上の2つは同じ高さで、3つ目だけ低い', { ocr: L.ocr.h, combo: L.combo.h, stitch: L.stitch.h });
	assert((await page.textContent('#process-stitch-btn')).trim() === 'OCR処理＋画像結合を開始する（高負荷）',
		'C-61: 文言は exam と同じ');
	assert((await page.textContent('#stitch-btn')).trim() === '画像を結合する（OCRしない）',
		'C-62 (8): 3つ目は「画像を結合する（OCRしない）」（「（SNS投稿用）」から変えた）');
	// 「個別に実行することもできます」の説明は C-62 の (8)-4 で削除した
	assert(!(await page.content()).includes('個別に実行することもできます'),
		'C-62 (8): 「個別に実行することもできます」は無い');
	assert((await page.textContent('#tier-marks-row')).trim() === '分類の印（◎超優先・○優先・▲通常）を付ける',
		'C-62 (8) → C-63 (7): 印のチェックの文言（短いまま、動詞を「付ける」に）');

	// 押せる条件。画像を足す前・足したあと・セットを外したあとの3通り
	assert(L.combo.disabled && L.ocr.disabled && L.stitch.disabled,
		'C-61: 画像が無ければ3つとも押せない', L);
	const setFiles = (n) => page.evaluate((k) => {
		persons[0].files = Array.from({ length: k }, (_, i) => ({ name: 'a' + i + '.png' }));
		updateProcessBtn();
	}, n);
	// look() が③のタブへ移しているので、②へ戻してから周回因子セットを選ぶ
	await page.evaluate(() => selectStepTab(1));
	await page.waitForTimeout(200);
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(400);
	await setFiles(2);
	L = await look();
	assert(!L.combo.disabled && !L.ocr.disabled && !L.stitch.disabled,
		'C-61: セット＋画像がそろえば3つとも押せる', L);
	// セットを外す（＝対象スキルが空）と、一体と OCR は押せず、「画像を結合する」だけ残る
	await page.evaluate(() => { onDeckScopeSelected(null); });
	await page.waitForTimeout(300);
	L = await look();
	assert(L.combo.disabled && L.ocr.disabled && !L.stitch.disabled,
		'C-61: セットが空でも「画像を結合する」だけは押せる（special が保ってきた仕様）', L);

	// 一体の処理の間は3つとも押せないまま（updateProcessBtn が早期 return する）
	const busy = await page.evaluate(() => {
		combinedInProgress = true;
		['process-btn', 'process-stitch-btn', 'stitch-btn'].forEach((id) => { document.getElementById(id).disabled = true; });
		updateProcessBtn();   // 途中で呼ばれても戻さない
		const during = ['process-btn', 'process-stitch-btn', 'stitch-btn'].map((id) => document.getElementById(id).disabled);
		combinedInProgress = false;
		updateProcessBtn();
		return during;
	});
	assert(busy.every((d) => d === true),
		'C-61: 一体の処理中は updateProcessBtn() を呼んでも3つとも無効のまま', busy);

	// 知らせはまとめて1回。OCR と結合の結末の組み合わせで文面が変わる
	const texts = await page.evaluate(() => {
		const mk = (judged, anyOutput, anySuccess, anyFailure) =>
			combinedOutcomeText(judged, { anyOutput: anyOutput, anySuccess: anySuccess, anyFailure: anyFailure });
		return {
			bothOk: mk(true, true, true, false),
			partial: mk(true, true, true, true),
			stitchNg: mk(true, true, false, true),
			noStitch: mk(true, false, false, false),
			ocrNg: mk(false, true, true, false),
		};
	});
	assert(texts.bothOk === '照合と画像結合が完了しました', 'C-61: 両方成功なら1文でまとめて知らせる', texts.bothOk);
	assert(texts.partial === '照合が完了しました。一部のセットは結合できませんでした', 'C-61: 一部だけ失敗', texts.partial);
	assert(texts.stitchNg === '照合が完了しました。画像は結合できませんでした', 'C-61: 結合が全滅', texts.stitchNg);
	assert(texts.noStitch === '照合が完了しました', 'C-61: 結合するものが無ければ照合の結末だけ', texts.noStitch);
	assert(texts.ocrNg === '画像を結合しました',
		'C-61: OCR が駄目なら（理由は赤い枠に出るので）結合の結末だけを言う', texts.ocrNg);
	assert(new Set(Object.values(texts)).size === 5, 'C-61: 5通りの文面がすべて違う', texts);

	// 個別の2つの結末の文面は、一体のほうと同じ関数から出る（二重管理にしない）
	const solo = await page.evaluate(() => [
		stitchOutcomeText(true, false), stitchOutcomeText(true, true), stitchOutcomeText(false, true),
	]);
	assert(solo.join('|') === '画像を結合しました|一部のセットは結合できませんでした|画像を結合できませんでした',
		'C-61: 「画像を結合する」だけのときの文面は従来どおり', solo);

	await page.evaluate(() => { persons[0].files = []; updateProcessBtn(); });
	assert(errors.length === 0, 'C-61: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * C-62（61セッション目）: 棚卸しで挙がった11件
 *
 * 見るのは、この回で入れたものだけ。
 *   (1) カードを選ぶミニウィンドウの候補が種類ごとの色／「すべて」は黒と白
 *   (2) ★取り表の見出しと凡例の番号も同じ種類の色
 *   (3) 表の列が1列おきに薄い灰（育成ウマ娘の列は縞に入れない）
 *   (4) 「αテスト」の注記が常時表示／開閉ボタンは無い／タイトル脇に「一部αテスト中」
 *   (5) ①の項目名の脇に「除外N種」（0種でも出す）
 *   (6) ①のパネル最下段の説明が無い
 *   (9) 引き出しの中のタブで、照合結果と結合画像を行き来できる
 * (7)(8) は上のブロック（②のパネル・③のボタン）で見ている。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	// 改修中の告知（C-62 の (11)）も既読にしてから先へ進む
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);

	/* --- (4) αテストの見せ方 --- */
	assert(await page.isVisible('#alpha-badge') && (await page.textContent('#alpha-badge')).trim() === '一部αテスト中',
		'C-62 (4): タイトルの脇に「一部αテスト中」のタグが出る');
	assert((await page.$('#alpha-badge')) !== null && (await page.evaluate(() => document.getElementById('alpha-badge').tagName)) === 'SPAN',
		'C-62 (4): タグは押せない（button ではない）');
	assert((await page.$('#deck-roster-alpha-btn')) === null,
		'C-62 (4): ①のタブの「αテスト」の開閉ボタンは無い');
	// (3) 「?」（説明）は入口ごと削除した（C-63 の (3)）
	assert((await page.$('#deck-roster-help-btn')) === null && (await page.$('#deck-roster-help')) === null,
		'C-63 (3): ①の「?」と、その中の説明文は無い');
	await page.evaluate(() => selectStepTab(0));
	await page.waitForTimeout(400);
	assert(await page.isVisible('#deck-roster-alpha'),
		'C-62 (4): αテスト中の注記は（押さなくても）常時出ている');
	assert((await page.textContent('#deck-roster-alpha')).includes('結果が正しくないことがあります'),
		'C-62 (4): 注記の文面は据え置き');

	/* --- (5)/(2) 除外N種。**①のタブの中**（②の件数バッジと同じ並び）へ移した（C-63 の (2)） --- */
	assert(await page.isVisible('#deck-roster-excluded') && (await page.textContent('#deck-roster-excluded')).trim() === '除外0種',
		'C-62 (5): 除外していないときも「除外0種」と出す', await page.textContent('#deck-roster-excluded'));
	const exclWhere = await page.evaluate(() => {
		const el = document.getElementById('deck-roster-excluded');
		const tab = document.getElementById('step-tab-0');
		const label = tab.querySelector('.step-tab-label');
		return {
			inTab: tab.contains(el),
			cls: el.className,
			color: getComputedStyle(el).color,
			// ラベルより右にある（②の件数バッジと同じ並び）
			rightOfLabel: el.getBoundingClientRect().left >= label.getBoundingClientRect().right,
		};
	});
	assert(exclWhere.inTab && exclWhere.rightOfLabel,
		'C-63 (2): 「除外N種」は①のタブの中の、ラベルの右にある', exclWhere);
	assert(exclWhere.cls.includes('step-tab-badge') && exclWhere.color === 'rgb(193, 0, 7)',
		'C-63 (2): 他のタブの件数バッジと同じ形で、色だけ赤（--uma-danger-text）', exclWhere);

	/* --- (1) ミニウィンドウの候補の色 --- */
	await page.click('#deck-roster-panel [data-usd-act="pick-card"][data-index="0"]');
	await page.waitForTimeout(400);
	const pills = await page.evaluate(() => {
		const list = Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-pill'));
		return list.map((b) => ({
			all: b.classList.contains('usd-roster-pill--all'),
			typed: b.classList.contains('usd-roster-pill--typed'),
			order: b.dataset.typeOrder || null,
			bg: getComputedStyle(b).backgroundColor,
			fg: getComputedStyle(b).color,
			pressed: b.getAttribute('aria-pressed'),
		}));
	});
	assert(pills.length >= 3 && pills[0].all && pills.slice(1).every((p) => p.typed),
		'C-62 (1): 先頭が「すべて」で、あとは種類ごとの色が付いた候補', { n: pills.length });
	assert(pills[0].pressed === 'true' && pills[0].bg === 'rgb(15, 23, 43)' && pills[0].fg === 'rgb(255, 255, 255)',
		'C-62 (1): 「すべて」は選択中で黒地に白', pills[0]);
	const typedBg = pills.slice(1).map((p) => p.bg);
	assert(new Set(typedBg).size === typedBg.length,
		'C-62 (1): 種類ごとに違う色（緑一色ではない）', typedBg);
	assert(pills.slice(1).every((p) => p.order && Number(p.order) >= 1),
		'C-62 (1): 色は typeOrder の番号で引いている（名前ではない）', pills.slice(1).map((p) => p.order));

	/* --- (1) 候補の**行**も種類ごとの色（緑一色ではない）。絞り込みを押した後も同じ --- */
	const cardHits = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('#deck-roster-panel .usd-name-hit')];
		return rows.slice(0, 10).map((b) => ({
			typed: b.classList.contains('usd-name-hit--typed'),
			order: b.dataset.typeOrder || null,
			bg: getComputedStyle(b).backgroundColor,
		}));
	});
	assert(cardHits.length > 0 && cardHits.every((h) => h.typed && h.order),
		'C-62 (1): サポートカードの候補の行は種類ごとの色（typeOrder の番号で引く）', cardHits.slice(0, 3));
	assert(new Set(cardHits.map((h) => h.bg)).size >= 3,
		'C-62 (1): 候補の行が緑一色ではない（種類ぶんの色が混ざる）', [...new Set(cardHits.map((h) => h.bg))]);
	// 絞り込みを1つ押すと、その種類の色だけになる
	await page.click('#deck-roster-panel .usd-roster-pill:nth-of-type(2)');
	await page.waitForTimeout(400);
	// マウスが候補の上に乗っていると hover の地色が混ざるので、端へ逃がしてから読む
	await page.mouse.move(1, 1);
	await page.waitForTimeout(200);
	const filtered = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('#deck-roster-panel .usd-name-hit')];
		return [...new Set(rows.map((b) => getComputedStyle(b).backgroundColor))];
	});
	assert(filtered.length === 1 && filtered[0] !== 'rgba(0, 0, 0, 0)',
		'C-62 (1): 絞り込んだ後も色は残り、その種類の1色になる', filtered);
	await page.click('#deck-roster-panel .usd-roster-pill:nth-of-type(1)');
	await page.waitForTimeout(400);

	// 別々の種類のカードを2枚選ぶ（1枠目＝いちばん小さい番号、2枠目＝その次）
	const takeCard = async (slot, pillIndex) => {
		await page.click('#deck-roster-panel [data-usd-act="pick-card"][data-index="' + slot + '"]');
		await page.waitForTimeout(300);
		await page.click('#deck-roster-panel .usd-roster-pill:nth-of-type(' + (pillIndex + 1) + ')');
		await page.waitForTimeout(300);
		await page.click('#deck-roster-panel [data-usd-act="take"]');
		await page.waitForTimeout(500);
	};
	// 開いているミニウィンドウは×（閉じる）で閉じてから次へ（背景が押下を遮るため）
	await page.click('#deck-roster-panel .usd-roster-modal-head .uma-icon-btn');
	await page.waitForTimeout(300);
	await takeCard(0, 1);
	await takeCard(1, 2);

	/* --- (2)(3) 表の見出し・凡例の番号・1列おきの灰 --- */
	const table = await page.evaluate(() => {
		const grid = document.querySelector('#deck-roster-panel .usd-roster-grid');
		if (!grid) return null;
		const heads = Array.from(grid.querySelectorAll('.usd-roster-gh'));
		const cards = heads.filter((h) => h.classList.contains('usd-roster-typed'));
		const uma = heads.find((h) => h.classList.contains('usd-roster-gc--uma'));
		// 本体（見出しでない）のセルを、1行目から拾う
		const rows = Array.from(grid.querySelectorAll('.usd-roster-grow'));
		const body = rows.length > 1 ? Array.from(rows[1].querySelectorAll('.usd-roster-gc')) : [];
		const legend = Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-legend-no'));
		return {
			typedHeads: cards.map((h) => ({ order: h.dataset.typeOrder, bg: getComputedStyle(h).backgroundColor })),
			umaHeadBg: uma ? getComputedStyle(uma).backgroundColor : null,
			// 本体のセル: 育成ウマ娘の列と、1列おきの灰
			bodyAlt: body.map((c) => ({
				uma: c.classList.contains('usd-roster-gc--uma'),
				alt: c.classList.contains('usd-roster-gc--alt'),
				bg: getComputedStyle(c).backgroundColor,
			})),
			legend: legend.map((n) => ({ typed: n.classList.contains('usd-roster-typed'), order: n.dataset.typeOrder, bg: getComputedStyle(n).backgroundColor })),
			note: document.querySelector('#deck-roster-panel .usd-roster-sec:last-child').textContent,
		};
	});
	assert(table !== null && table.typedHeads.length >= 2,
		'C-62 (2): 表の見出しに、種類の色が付いたサポートカードの列がある', table && table.typedHeads);
	assert(new Set(table.typedHeads.map((h) => h.bg)).size >= 2,
		'C-62 (2): 種類が違えば見出しの色も違う', table.typedHeads);
	assert(table.umaHeadBg === 'rgb(68, 64, 59)',
		'C-62 (3): 育成ウマ娘の列は見出しの濃い地のまま（扱いを変えていない）', table.umaHeadBg);
	// (4) 育成ウマ娘の列は、本体のセルにも地を敷く（C-63 の (4)）。1列おきの灰（slate-50）とは
	// 別の値（slate-100）にして、縞の一部に見えないようにしてある。
	const umaBody = table.bodyAlt.filter((c) => c.uma);
	assert(umaBody.length === 1 && umaBody[0].bg === 'rgb(241, 245, 249)',
		'C-63 (4): 育成ウマ娘の列の本体のセルは薄い灰（--uma-table-col-key）', umaBody);
	assert(umaBody[0].bg !== 'rgb(248, 250, 252)',
		'C-63 (4): 1列おきの灰（--uma-table-col-alt）とは別の値', umaBody);
	const alt = table.bodyAlt.filter((c) => c.alt);
	assert(alt.length >= 2 && alt.every((c) => c.bg === 'rgb(248, 250, 252)'),
		'C-62 (3): 1列おきの列は薄い灰（--uma-table-col-alt）', alt.slice(0, 3));
	const plain = table.bodyAlt.filter((c) => !c.alt && !c.uma && c.bg);
	assert(plain.some((c) => c.bg === 'rgb(255, 255, 255)'),
		'C-62 (3): もう一方の列は白のまま（交互になっている）', plain.slice(0, 3));
	const legendTyped = table.legend.filter((n) => n.typed);
	assert(legendTyped.length >= 2,
		'C-62 (2): 凡例の番号にも種類の色が付く', table.legend);
	assert(legendTyped.every((n) => table.typedHeads.some((h) => h.order === n.order && h.bg === n.bg)),
		'C-62 (2): 凡例の番号の色は、同じ番号の見出しと同じ', { heads: table.typedHeads, legend: legendTyped });

	/* --- (6) ①のパネル最下段の説明を削除 --- */
	assert(!table.note.includes('ここに出ていないスキルが'),
		'C-62 (6): ①のパネル最下段の「ここに出ていないスキルが…」は無い');
	/* --- C-63 の (5) 凡例の上の1行も削除（下に実際の一覧が並んでいるので冗長） --- */
	assert(!table.note.includes('＝サポートカード（枠の順）'),
		'C-63 (5): 「◆＝育成ウマ娘、1〜N＝サポートカード」の1行は無い');

	/* --- (5) 実際に除外すると数が変わる --- */
	await page.evaluate(() => selectStepTab(1));
	await page.waitForTimeout(200);
	await page.click('#deck-template-panel .uma-subtab[data-tab-id="' + TEMPLATE_ID + '"]');
	await page.waitForTimeout(400);
	await page.evaluate(() => selectStepTab(0));
	await page.waitForTimeout(300);
	const before = (await page.textContent('#deck-roster-excluded')).trim();
	await page.click('#deck-roster-panel [data-usd-act="exclude"]');
	await page.waitForTimeout(600);
	// 除外先を選ぶミニウィンドウが出たら、いま選んでいるほうを選ぶ
	if (await page.isVisible('#deck-roster-panel [data-usd-el="scope-modal"]')) {
		await page.click('#deck-roster-panel [data-usd-act="exclude-into"]');
		await page.waitForTimeout(600);
	}
	const after = (await page.textContent('#deck-roster-excluded')).trim();
	assert(before === '除外0種' && /^除外[1-9]\d*種$/.test(after),
		'C-62 (5): 除外すると「除外N種」に変わる', { before, after });
	await page.click('#deck-roster-panel [data-usd-act="exclude"]');
	await page.waitForTimeout(600);
	assert((await page.textContent('#deck-roster-excluded')).trim() === '除外0種',
		'C-62 (5): 解除すると「除外0種」に戻る（0でも消さない）');

	assert(errors.length === 0, 'C-62 (1)〜(6): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * C-62 の (9): 結合画像への導線（引き出しの中のタブ）
 *
 * **引き出しは2つのまま**で、タブは「もう一方の引き出しへ行く」導線。
 * 段5（1引き出し＋タブへ統合）は引き続き見送り中なので、
 * #result-drawer と #stitch-drawer が両方あることも一緒に見ておく。
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);

	assert((await page.$('#result-drawer')) !== null && (await page.$('#stitch-drawer')) !== null,
		'C-62 (9): 引き出しは2つのまま（段5 は見送り中）');
	const strips = await page.$$eval('.drawer-tabs', (els) => els.length);
	assert(strips === 2, 'C-62 (9): タブ帯は2つの引き出しに1本ずつ', strips);
	// CSS は css/shell.css から当たる（special の <style> には置いていない）
	const tabCss = await page.evaluate(() => {
		const on = getComputedStyle(document.getElementById('result-tab-result'));
		const off = getComputedStyle(document.getElementById('result-tab-stitch'));
		return { onLine: on.borderBottomColor, onWeight: on.fontWeight, offLine: off.borderBottomColor,
			strip: getComputedStyle(document.querySelector('.drawer-tabs')).display };
	});
	assert(tabCss.strip === 'flex' && tabCss.onWeight === '600' && tabCss.onLine === 'rgb(28, 25, 23)'
		&& tabCss.offLine === 'rgba(0, 0, 0, 0)',
		'C-62 (9): タブ帯の見た目が共通CSS（shell.css）から当たっている', tabCss);

	// 何も無いうちは、どちらも「（なし）」で、いま開いていない側は押せない
	const tabsEmpty = await page.evaluate(() => ({
		resultLabel: document.getElementById('result-tab-result-label').textContent,
		stitchLabel: document.getElementById('result-tab-stitch-label').textContent,
		stitchDisabled: document.getElementById('result-tab-stitch').disabled,
		resultSelected: document.getElementById('result-tab-result').getAttribute('aria-selected'),
	}));
	assert(tabsEmpty.resultLabel === '照合結果（なし）' && tabsEmpty.stitchLabel === '結合画像（なし）',
		'C-62 (9): 中身が無い行き先はラベルに「（なし）」が付く', tabsEmpty);
	assert(tabsEmpty.stitchDisabled && tabsEmpty.resultSelected === 'true',
		'C-62 (9): 中身が無い行き先へは押して行けない／自分のタブが選択中', tabsEmpty);

	// 両方に結果があることにして、行き来を確かめる
	await page.evaluate(() => { setSectionReady('result', true); setSectionReady('stitch', true); });
	await page.waitForTimeout(200);
	const tabsReady = await page.evaluate(() => ({
		resultLabel: document.getElementById('result-tab-result-label').textContent,
		stitchLabel: document.getElementById('result-tab-stitch-label').textContent,
		stitchDisabled: document.getElementById('result-tab-stitch').disabled,
	}));
	assert(tabsReady.resultLabel === '照合結果' && tabsReady.stitchLabel === '結合画像' && !tabsReady.stitchDisabled,
		'C-62 (9): 中身ができると「（なし）」が消えて押せるようになる', tabsReady);

	// 結合画像に未読を立ててから照合結果を開く（OCR＋結合を1回で走らせたときと同じ形）
	await page.evaluate(() => { markFabUnseen('stitch'); openDrawer('result'); });
	await page.waitForTimeout(600);
	const openedResult = await page.evaluate(() => ({
		result: !document.getElementById('result-drawer').hidden,
		stitch: !document.getElementById('stitch-drawer').hidden,
		dot: !document.getElementById('result-tab-stitch-dot').hidden,
		selfDot: !document.getElementById('result-tab-result-dot').hidden,
	}));
	assert(openedResult.result && openedResult.dot && !openedResult.selfDot,
		'C-62 (9): 照合結果を開くと、結合画像のタブに未読の点が見える', openedResult);

	// タブを押すともう一方の引き出しへ移る
	await page.click('#result-tab-stitch');
	await page.waitForTimeout(700);
	const movedToStitch = await page.evaluate(() => ({
		open: openDrawerKey,
		stitchShown: !document.getElementById('stitch-drawer').hidden,
		selected: document.getElementById('stitch-tab-stitch').getAttribute('aria-selected'),
		dot: !document.getElementById('stitch-tab-stitch-dot').hidden,
	}));
	assert(movedToStitch.open === 'stitch' && movedToStitch.stitchShown && movedToStitch.selected === 'true' && !movedToStitch.dot,
		'C-62 (9): タブを押すと結合画像の引き出しへ移り、未読も下りる', movedToStitch);

	// 戻れる
	await page.click('#stitch-tab-result');
	await page.waitForTimeout(700);
	assert(await page.evaluate(() => openDrawerKey) === 'result',
		'C-62 (9): 結合画像から照合結果へも戻れる');

	await page.evaluate(() => closeDrawer());
	await page.waitForTimeout(500);
	assert(errors.length === 0, 'C-62 (9): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * C-62 の (11): 改修中の告知
 *
 * 画面の切り替えの告知（layout）とは**別のキー**で持つので、
 *   - 初めて開く人 … layout だけ出て、改修中のほうは「見たこと」になる
 *   - layout を既読の人 … 改修中のほうが1度だけ出る
 *   - 閉じたあと … もう出ない
 * ============================================================ */
{
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	// layout の告知だけ既読にして開く＝改修中の告知が出るはずの状態
	await ctx.addInitScript(() => {
		localStorage.setItem('uma-special-ui-notice', '2026-09-new-ui-default');
	});
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	await page.goto(base + '/special.html', { waitUntil: 'networkidle', timeout: 60000 });
	await page.waitForTimeout(2000);

	const shown = await page.evaluate(() => ({
		open: !document.getElementById('ui-notice').hidden,
		layoutHidden: document.getElementById('ui-notice-body-layout').hidden,
		alphaHidden: document.getElementById('ui-notice-body-alpha').hidden,
		title: document.getElementById('ui-notice-title-alpha').textContent,
		labelled: document.getElementById('ui-notice').getAttribute('aria-labelledby'),
	}));
	assert(shown.open && shown.layoutHidden && !shown.alphaHidden,
		'C-62 (11): 既読の人には改修中の告知だけが出る（出すのは一方だけ）', shown);
	assert(shown.title === '機能を大幅に改修中です' && shown.labelled === 'ui-notice-title-alpha',
		'C-62 (11): 見出しと読み上げの向き先も改修中のほう', shown);
	assert((await page.textContent('#ui-notice-body-alpha')).includes('αテスト中'),
		'C-62 (11): 文面にαテスト中であることが入っている');

	// 閉じると既読になり、開き直しても出ない
	await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	const key = await page.evaluate(() => localStorage.getItem('uma-special-alpha-notice'));
	assert(key === '2026-09-18-alpha-rework', 'C-62 (11): 閉じると既読の印が付く', key);
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(2000);
	assert(await page.evaluate(() => document.getElementById('ui-notice').hidden),
		'C-62 (11): 一度閉じれば次からは出ない');

	// 右上の「新UI」バッジからの読み直しは、これまでどおり layout のほう
	await page.click('#ui-mode-badge');
	await page.waitForTimeout(300);
	assert(await page.evaluate(() => !document.getElementById('ui-notice-body-layout').hidden
		&& document.getElementById('ui-notice-body-alpha').hidden),
		'C-62 (11): バッジからの読み直しは「画面の切り替え」のほう');
	await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(200);

	assert(errors.length === 0, 'C-62 (11): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

/* ============================================================
 * C-62 の (11・裏）: 初めて開く人には layout だけ
 * ============================================================ */
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	await page.waitForTimeout(500);
	const first = await page.evaluate(() => ({
		open: !document.getElementById('ui-notice').hidden,
		layoutHidden: document.getElementById('ui-notice-body-layout').hidden,
		alphaSeen: localStorage.getItem('uma-special-alpha-notice'),
	}));
	assert(first.open && !first.layoutHidden && first.alphaSeen === '2026-09-18-alpha-rework',
		'C-62 (11): 初めて開く人には layout だけを出し、改修中のほうは「見たこと」にする', first);
	await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	assert(await page.evaluate(() => document.getElementById('ui-notice').hidden),
		'C-62 (11): 初回の告知を閉じると、続けてもう1枚は出ない');
	assert(errors.length === 0, 'C-62 (11・裏): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}

{
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await ctx.addInitScript(() => {
		localStorage.setItem('uma-exam-ui-notice', '2026-09-exam-drawer-layout');
		localStorage.setItem('uma-exam-target-notice', '2026-09-14-target-scope');
	});
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	await page.goto(base + '/exam.html', { waitUntil: 'networkidle', timeout: 60000 });
	await page.waitForTimeout(1500);

	// 段1) ボタンが共通部品になっている。common.css も読んでいる（読まないと素の <button> になる）
	const btns = await page.evaluate(() => {
		const one = (id) => {
			const b = document.getElementById(id);
			const cs = getComputedStyle(b);
			return { cls: b.className, radius: cs.borderTopLeftRadius, weight: cs.fontWeight, display: cs.display };
		};
		return {
			ocr: one('process-btn'), stitch: one('process-stitch-btn'),
			css: getComputedStyle(document.documentElement).getPropertyValue('--uma-components-css-version').trim(),
			twReady: document.documentElement.classList.contains('uma-tw-ready'),
		};
	});
	assert(btns.ocr.cls === 'uma-btn uma-btn--primary uma-btn--lg w-full'
		&& btns.stitch.cls === 'uma-btn uma-btn--accent-outline uma-btn--lg w-full mt-2',
		'段1: exam の2つのボタンが special と同じ共通部品になっている', { ocr: btns.ocr.cls, stitch: btns.stitch.cls });
	assert(btns.ocr.display === 'inline-flex' && btns.ocr.weight === '700' && btns.ocr.radius === '12px',
		'段1: 共通部品の指定が実際に効いている（common.css を読めている）', btns.ocr);
	assert(btns.css !== '', '段1: exam が common.css を読んでいる（版の印が取れる）', btns.css);
	assert(btns.twReady === true,
		'段1: .uma-tw-ready が付く（common.css の「Tailwind を読めなかったときの保険」を無効にする）', btns.twReady);

	// 段2) 結合の進捗バー。OCR のバーと同じ作りで、既定は隠れている
	const bar = await page.evaluate(() => {
		const w = document.getElementById('stitch-progress-wrap');
		const before = w.classList.contains('hidden');
		setStitchProgress(0.5, '親A 祖A1を結合中…');
		w.classList.remove('hidden');
		const shown = {
			pct: document.getElementById('stitch-progress-pct').textContent,
			label: document.getElementById('stitch-progress-label').querySelector('span').textContent,
			width: document.getElementById('stitch-progress-bar').style.width,
		};
		w.classList.add('hidden');
		return { before: before, shown: shown };
	});
	assert(bar.before === true, '段2: 結合の進捗バーは既定では隠れている', bar.before);
	assert(bar.shown.pct === '50%' && bar.shown.width === '50%' && bar.shown.label === '親A 祖A1を結合中…',
		'段2: setStitchProgress が割合と「だれを結合中か」を出す', bar.shown);

	// 段2) 結合中は出て、終わったら隠れる。結合そのものは差し替えて速く回す
	const flow = await page.evaluate(async () => {
		const orig = buildStitchedSetImage;
		const seen = [];
		const w = document.getElementById('stitch-progress-wrap');
		persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
		buildStitchedSetImage = async (setIdx, run, onPersonStart) => {
			if (onPersonStart) onPersonStart('親A');
			seen.push({ hidden: w.classList.contains('hidden'), label: document.getElementById('stitch-progress-label').querySelector('span').textContent });
			const c = document.createElement('canvas');
			c.width = 60; c.height = 60; c._personMeta = []; c._stitchWarnings = [];
			return c;
		};
		await runImageStitching();
		const during = seen.slice();
		const after = w.classList.contains('hidden');
		// 「画像を更新」（引き出しの中）はバーを出さない
		seen.length = 0;
		await runImageStitching(captureRun(), { quiet: true, progress: false });
		const quiet = seen.map((s) => s.hidden);
		buildStitchedSetImage = orig;
		persons[0].files = [];
		return { during: during, after: after, quiet: quiet };
	});
	assert(flow.during.length > 0 && flow.during.every((s) => s.hidden === false),
		'段2: 1人分の結合に入るとき、バーは見えている', flow.during);
	assert(flow.during[0].label.includes('を結合中…'), '段2: バーに「だれを結合中か」が出る', flow.during[0].label);
	assert(flow.after === true, '段2: 結合が終わるとバーは隠れる', flow.after);
	assert(flow.quiet.every((h) => h === true),
		'段2: 引き出しの中からの「画像を更新」ではバーを出さない（引き出しの裏に隠れるため）', flow.quiet);

	// 段1) 結果の見出しは「親Aセット」だけ（special と同じ）
	const head = await page.evaluate(() => {
		const c = document.createElement('div');
		const canvas = document.createElement('canvas');
		canvas.width = 40; canvas.height = 40; canvas._personMeta = []; canvas._stitchWarnings = [];
		appendStitchResultBlock(c, PERSON_SETS[0], canvas);
		return { title: c.querySelector('p').textContent, dl: c.querySelector('a[download]').className };
	});
	assert(head.title === '親Aセット', '段1: 結果の見出しは「親Aセット」（special と同じ）', head.title);
	assert(head.dl === 'uma-btn uma-btn--primary', '段1: ダウンロードのボタンも共通部品', head.dl);

	assert(errors.length === 0, '段1〜2(exam): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}


await browser.close();
await close();
console.log('\n' + (fails === 0 ? '=== スモークテスト: 全項目OK ===' : '=== スモークテスト: ' + fails + '件 NG ==='));
process.exit(fails === 0 ? 0 : 1);
