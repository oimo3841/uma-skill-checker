// 外観を変えたあと、操作が壊れていないかを確認する機能スモークテスト。
//
//   npm run test:visual                       … 41塊すべて（commit の前はこれ）
//   npm run test:visual -- --list             … 番号と見出しの一覧だけを出す
//   npm run test:visual -- --only=段11        … 見出しに「段11」を含む塊だけ
//   npm run test:visual -- --only=6,段11      … 番号と見出しを混ぜてよい（カンマ区切り。--only を並べてもよい）
//
// 特に「JSがクラスを付け外しする箇所」「hidden の付け外し」を通す。
// 見た目の統一作業で最も壊れやすいのがここで、目視では気付きにくい。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer, REPO_ROOT } from './lib/serve.mjs';
import { openPage, seedSpecialResults, COMMON_CSS_VERSION, RECORD_ID, TEMPLATE_ID, PICK, EDITED_CELLS, USER_DATA } from './lib/fixtures.mjs';
// スクリーンショットの画素から**実際に描かれている色**を読む（段11 ⑨。半透明の重なりの結果を見るため）
import { avgColor, deltaE, contrastRatio, hexOf } from './lib/pixels.mjs';
import { buildEventFixture, buildCharacterFixture } from './lib/event-fixture.mjs';
import { buildDraftFixture } from './lib/draft-fixture.mjs';
// 段7c（2026-10-03・C-115）の検査は別ファイル（塊の見出しはすべて「段7c」を含む）
import { register7c } from './blocks-7c.mjs';
// 段7d（2026-10-03・C-116）の検査
import { register7d } from './blocks-7d.mjs';
import { register7f } from './blocks-7f.mjs';
import { register7e } from './blocks-7e.mjs';
import { register8 } from './blocks-8.mjs';
import { register9 } from './blocks-9.mjs';
import { register10 } from './blocks-10.mjs';
import { register11 } from './blocks-11.mjs';
import { register12 } from './blocks-12.mjs';
import { register13 } from './blocks-13.mjs';
import { register14 } from './blocks-14.mjs';
import { register15 } from './blocks-15.mjs';
import { register16 } from './blocks-16.mjs';

let fails = 0;
function assert(cond, label, extra) {
	if (!cond) fails++;
	console.log((cond ? '[OK] ' : '[NG] ') + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

/* ------------------------------------------------------------
 * 塊（見出しごとのまとまり）の回し方
 *
 * **塊は互いに何も引き継がない。** モジュール直下にあるのは fails / assert / base,close /
 * browser だけで、各塊が自前で openPage して ctx.close() する。だからどれを選んでも単独で成り立つ。
 *
 * ■ --only（73セッション目）
 *   実装中と破壊確認では、触っている塊だけを回す。全部で9分かかるものが10〜30秒で済む。
 *   **部分実行のときは最後の行に「N塊中M塊のみ」を必ず出す**（「全項目OK」だけを見て
 *   全部通ったと誤解しないため）。**--only に当たる塊が1つも無いときは NG にして止める**
 *   （0塊で「全項目OK」と出ると、綴りを間違えただけで通ったことになってしまう）。
 *
 * ■ try/catch（73セッション目）
 *   **投げてもその塊だけを [NG] にして次へ進む。** ここで握らないと、例外で全体が止まり
 *   [NG] が1件も出ないまま終わるので、破壊確認のときに「壊したのに素通りした」のか
 *   「途中で死んだ」のかが区別できない。実際に「入口を既定で閉じる」に壊したときが
 *   これで、1番目の塊のクリックが30秒待って投げ、39番目にある本命の項目まで届かなかった。
 * ------------------------------------------------------------ */
const ARGV = process.argv.slice(2);
const LIST_ONLY = ARGV.includes('--list');
const ONLY = ARGV.filter((a) => a.startsWith('--only='))
	.flatMap((a) => a.slice('--only='.length).split(','))
	.map((s) => s.trim())
	.filter(Boolean);

let blockCount = 0;
let ranCount = 0;
const listed = [];

/** 見出しごとのまとまりを1つ回す。番号でも見出しの部分一致でも選べる。 */
async function block(title, fn) {
	blockCount++;
	const no = blockCount;
	if (LIST_ONLY) { listed.push(no + '\t' + title); return; }
	if (ONLY.length > 0 && !ONLY.some((t) => t === String(no) || title.includes(t))) return;
	ranCount++;
	try {
		await fn();
	} catch (e) {
		fails++;
		// 段8: 止まった場所（検査のファイルと行）も出す。「どの操作で止まったか」が分からないと、直す場所を探すのに時間がかかる
		const at = ((e && e.stack) || '').match(/(run-smoke|blocks-[\w-]+)\.mjs:\d+/);
		const sel = /waiting for (locator\([^)]*\)|[^\n]+)/.exec(String((e && e.message) || ''));
		console.log('[NG] ' + title + ': 例外で止まった  ' + String((e && e.message) || e).split('\n')[0] + (at ? '  @' + at[0] : '') + (sel ? '  ' + sel[1].slice(0, 120) : ''));
	}
}

if (ONLY.length > 0) console.log('--only=' + ONLY.join(',') + ' に当たる塊だけを回す\n');

const { base, close } = await startServer();
const browser = await chromium.launch();
// 前回開いていたタブ（段7d の ③）。special は保存値が無いと①「本育成編成」を開くようになったが、段7c より前の検査は
// 「開いたら②（因子周回）が見えている」ことを前提に書かれている。openPage を通さず自前で context を作る検査も含めて、
// どの context でも、最初の読み込みに限って保存値を②にしておく（sessionStorage の印で1回だけ。再読み込みでは仕込み直さない。
// 段7d の検査は、この保存値を消して・書き換えて、再読み込みの動きを見る）
{
	const newContext = browser.newContext.bind(browser);
	browser.newContext = async (o) => {
		const ctx = await newContext(o);
		await ctx.addInitScript(() => {
			try {
				if (!sessionStorage.getItem('__fxStepTab')) {
					sessionStorage.setItem('__fxStepTab', '1');
					if (localStorage.getItem('umaSkillDeck:stepTab') === null) localStorage.setItem('umaSkillDeck:stepTab', '1');
				}
			} catch (e) {}
		});
		return ctx;
	};
}

/* ============================================================
 * special.html（UmaStar OCR）
 * ============================================================ */
await block('special.html（UmaStar OCR）', async () => {
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
	// 段8（C-120）で②のタブの帯を無くした。ドラフトの呼び名と「選ばれている」ことは、共通の見出しの帯（#deck-set-bar）のセット名で見る
	// （新しい仕様は blocks-8.mjs の段8(B)）
	const draftTab = await page.evaluate(() => {
		const p = document.getElementById('deck-template-panel');
		const nameEl = document.querySelector('#deck-set-bar [data-usd-el="set-name"]');
		return {
			label: nameEl ? nameEl.textContent : null, selected: String([null, '__draft__'].includes(deckTemplateManager.getSelectedTemplateId())),
			tabs: p.querySelectorAll('.uma-subtab').length,
			hasOld: !!p.querySelector('[data-usd-act="template-open"], [data-usd-act="draft-open"], [data-usd-el="template-radio"]'),
			// 段7b の ⑫: 名前の入力欄・保存・リセット・セットを削除は無くなった（名前・保存・削除はタブの ✎ ✓ ↩ ×）。残るのは「複製」の行だけ（保存済みのときだけ出る）
			nameInput: !!p.querySelector('[data-usd-el="name-input"]'), delBtn: !!p.querySelector('[data-usd-el="del-btn"]'),
			actionsHidden: !p.querySelector('[data-usd-el="tm-actions"]'),   // 段7d の ⑮：「複製」の行ごと無い
			// 最下段の注記は C-62 の (7) で削除した。要素ごと無いことを見る
			note: !!p.querySelector('[data-usd-el="editor-note"]')
		};
	});
	assert(draftTab.label === '＋新規' && draftTab.selected === 'true' && draftTab.tabs === 0,
		'special: 帯のセット名は「＋新規」で、最初はそれが選ばれている（②のタブの帯は無い）', draftTab);
	assert(!draftTab.hasOld, 'special: 「開く」・ラジオ・ドラフトの行は無い（タブで選んでその場で編集する）', draftTab);
	// 名前欄の呼び名は core の setLabel（C-1）。special は「因子セット」、Deck 単体ページは「スキルセット」。
	// **ここが「スキルセット」に戻ったら、core の文字列を一律置換してしまった印。**
	// （段7b の ⑫で、名前欄の呼び名「新しい因子セットの名前」の検査は、タブの ✎ の入力欄（プレースホルダ「因子周回の名前」）へ移った。新しい塊で見ている）
	assert(!draftTab.nameInput && !draftTab.delBtn && draftTab.actionsHidden,
		'special: 名前の入力欄・「セットを削除」・「複製」の行は無い（段7d の ⑮ で「複製」を削除）', draftTab);
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
			// **出っ張りだけを見る**（.uma-section-row の直下）。72セッション目・段11 ⑩ で
			// 入口の並びにも畳むための .uma-section-head（button）が増えたので、
			// ただの .uma-section-head ではそちらを拾ってしまう。
			secAHead: secA && secA.querySelector('.uma-section-row > .uma-section-head') ? secA.querySelector('.uma-section-row > .uma-section-head').textContent : null,
			// 囲んだだけで、中身の data-usd-el は section-a の下に全部そろっている
			// **73セッション目に clear-skills（リセット）をここから外した** ―― 名前の行へ移したので、
			// A の中に在ってはいけない（下の resetOutsideA で「外に在る」ことを見る）。
			// 段8（C-120）で「追加済みスキル（N種）」の行（selected-count）を無くしたので、並びから外した
			inA: secA ? ['tier-row', 'selected-list']
				.every(k => !!secA.querySelector('[data-usd-el="' + k + '"]')) : false,
			noClearBtn: !p.querySelector('[data-usd-el="clear-skills"]'),
			entryInA: !!(secA && secA.querySelector('.usd-entry-row')),
			bodyGap: body ? getComputedStyle(body).rowGap : null,
			headGap: secA ? getComputedStyle(secA).rowGap : null,
			// 段K: A は枠で囲い、見出しはその枠の左上に接する出っ張りにする
			framed: !!(secA && secA.classList.contains('uma-section--framed')),
			// 名前の行（保存・複製・削除）は A の外＝セット全体の操作
			nameRowOutside: !p.querySelector('.usd-tm-name-row')   // 段7d の ⑮：名前の行には「複製」しか残っていなかったので、行ごと無くなった（A の外にも中にも無い）
		};
	});
	// 段7b の ⑫：②の見出し「因子セット（N／N件）」は無くした。
	// 段8（C-120）で②のタブの帯（呼び名「因子周回」）と A の見出し「スキルセット」を無くしたので、それらの検査は外した（新しい仕様は blocks-8.mjs の段8(D)）
	assert(c1.head === null && c1.tabsAria === null && c1.secAHead === null,
		'C-1→段8: ②の見出し「因子セット（N／N件）」・タブの帯・A の見出し「スキルセット」は無い', c1);
	assert(c1.inA && c1.entryInA && c1.nameRowOutside,
		'C-1: 入口・分類・スキルパネルは [data-usd-el="section-a"] の中。名前の行は無い（段7d の ⑮ で「複製」を削除）', c1);
	// 73 の「リセット」の置き場所の検査は、段7b の ⑫で「リセット」ボタン自体が無くなった（「＋新規」の × が確認つきで同じことをする）ので、下の検査へ差し替えた
	assert(c1.noClearBtn, '段7b(⑫): ②に「リセット」のボタンは無い（「＋新規」の × → 確認の小窓 → OK が、同じく中身を空に戻す）', c1);
	/* **差し替えた検査（段K）**: それまでは
	     「C-1: 見出しと中身の間（8px）は、中身どうしの間（12px）より詰まっている」
	     （`c1.headGap === '8px' && c1.bodyGap === '12px'`）
	   を見ていた。**段K で見出しが枠に接する出っ張りになり、間は 0px になった**ので成り立たない。
	   ただし**検査の意図（見出しと中身の結びつきを、中身どうしより強く見せる）は 0px のほうが
	   強く満たす**ので、外すのではなく「0px・枠で囲っている」に差し替える。
	   **枠をやめて見出しを普通の <p> に戻すなら、上の 8px の検査へ戻すこと。** */
	// 段8（C-120）で②の枠（.uma-section--framed）と見出しの出っ張りを無くしたので、上の段K の検査は外した（新しい仕様は blocks-8.mjs の段8(D)）
	assert(!c1.framed, '段8: ②の A は枠で囲わない（.uma-section--framed が無い）', c1);
	// 段7b の ⑫: 名前の行の「保存」「リセット」「セットを削除」は無くなった（C-3・73・段1(⑪) の「リセット」の検査はここで置き換えた。
	// 中身を空にする操作は「＋新規」の × に、削除は保存済みタブの × に移り、新しい塊「本育成パネルの追加修正（段7b…）」が見ている）。
	const clearBtn = await page.evaluate(() => {
		const nameRow = document.querySelector('#deck-template-panel .usd-tm-name-row');
		// 段8（C-120）で「追加済みスキル（N種）」を無くしたので、種類数は分類のタブの数の合計（同じ kindCountsOf の値）で見る
		const n = document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length;
		const del = document.querySelector('#deck-template-panel [data-usd-el="mode-delete"]');
		const reclass = document.querySelector('#deck-template-panel [data-usd-el="mode-reclass"]');
		return { exists: !!document.querySelector('#deck-template-panel [data-usd-el="clear-skills"]'), count: n,
			行: nameRow ? [...nameRow.querySelectorAll('button')].map((b) => b.textContent.trim()) : null,
			modes: !!del && !!reclass, modesOff: del && reclass && del.getAttribute('aria-pressed') === 'false' && reclass.getAttribute('aria-pressed') === 'false',
			modesDisabled: del && reclass && del.disabled && reclass.disabled };
	});
	assert(!clearBtn.exists && clearBtn.行 === null, '段7b(⑫)→段7d(⑮): 名前の行は無い（保存・リセット・セットを削除に加えて、「複製」も削除した。Deck 単体ページには残る）', clearBtn);
	// 段9（C-121）: 「再分類」「削除」のモードのボタンは無くした（超優先／優先／通常はアイコンに置き換わり、削除は各行の × になった。新しい仕様は blocks-9.mjs の段9(D)）
	assert(!clearBtn.modes, 'special: 段9 で「再分類」「削除」のモードのボタンは無い（行ごとに × がある）', clearBtn);
	/* 73セッション目の「下段のモードの『削除』『再分類』はそのまま」の検査は、段9（C-121）でモードのボタンを無くしたので外した */
	assert(clearBtn.count === 0,
		'C-3→段9: 0種のときは一覧に行が無い', clearBtn);

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
	// 段8（C-120）で見出し「追加済みスキル（N種）」を無くしたので、その検査は外し、数は分類のタブの数の合計と比べる
	const draftFoot = await page.evaluate(() => ({
		label: document.querySelector('[data-usd-el="picker-commit"]').textContent,
		n: String(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length)
	}));
	assert(draftFoot.n === '1' && draftFoot.label === 'チェックしたスキルを追加（' + draftFoot.n + '種追加済み）',
		'special: ボタンの「XX種追加済み」が背後の見出しと同じ数', draftFoot);
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);
	const draftPicked = await page.evaluate(() => ({
		count: String(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length),
		// 選択の注記（#deck-selected-note）は68セッション目に削除した。「そのまま照合対象になる」ことは
		// **照合に使う実体**（skillOnlyList）と②のタブのバッジで見る（文言ではなく効果で見る）。
		skills: skillOnlyList.length,
		badge: document.getElementById('skill-count-badge').textContent,
		selName: (deckTemplateManager.getSelection() || {}).name
	}));
	assert(draftPicked.count === '1', 'special: 貼り付けたスキルがドラフトに入る', draftPicked);
	// 段8・D（C-120）: ②のタブの「N種」は②の先頭の N（ON のランクの種＋継承固有の種類数。既定 6）。1種＋6＝7種
	assert(draftPicked.skills === 1 && draftPicked.badge === '7種' && draftPicked.selName === '新規（ドラフト）',
		'special: 中身ができたドラフトはそのまま照合対象になり、②のタブにも N（1種＋継承固有6）が出る', draftPicked);
	// 段8（C-120）で②のタブの帯（「＋ 新規（ドラフト）1種」のタブ）を無くしたので、タブの件数の検査は外した

	/* --- 段9 「緑スキルを追加」（72セッション目） -------------------------------------
	   段8 で `poolExcluded` の軸に値を持つスキル（＝パッシブ＝ゲーム内の緑スキル）を
	   「条件で検索」の母集団から外したので、**この入口が唯一の選び方**になった。

	   **件数も軸のキーもここに書かない。** 並ぶべき顔ぶれは製品の `getPoolExcludedSkills()`
	   （TAG_AXES の印から作られる）から取り、母集団に残っているスキルが混ざっていないことは
	   「印を持たないスキルが1件も並んでいない」で見る。マスターが増減しても落ちない。

	   ここに入る時点で、ドラフトには「右回り○」が1件入っている（上の貼り付けの検査）。
	   **これはパッシブなので、開いた時点でチェックが1つ付いている**はずで、
	   「チェックは現在のセットから作る」ことがそのまま確かめられる。 */
	{
		const passiveState = () => page.evaluate(() => {
			const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
			const rows = [...document.querySelectorAll('[data-usd-el="passive-check"]')];
			return {
				title: el('picker-title').textContent,
				mode: { filter: !el('mode-filter').hidden, paste: !el('mode-paste').hidden,
					custom: !!el('mode-custom'), passive: !el('mode-passive').hidden },
				footH: el('picker-footer').getBoundingClientRect().height,
				ids: rows.map((r) => r.value),
				checked: rows.filter((r) => r.checked).map((r) => r.value),
				// 背後のセット（＝チェックの正解）。**保存されたものを読む**ので、
				// 画面だけ動いて保存されていない場合はここで食い違う。
				saved: JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}').skillIds || [],
				// 段8（C-120）で「追加済みスキル（N種）」を無くしたので、分類のタブの数の合計で見る
				panelCount: String(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length),
				note: el('passive-note').textContent,
				noteCount: el('passive-count').textContent,
			};
		});

		// (1) 入口の位置 ―― 「条件で検索」と「テキストで検索」の間
		//     ラベルは**件数の脇（passive-added）を抜いた本体**で見る（件数は下で別に見る）
		const entryOrder = await page.evaluate(() =>
			[...document.querySelectorAll('#deck-template-panel .usd-entry-row button')].map((b) => {
				const added = b.querySelector('[data-usd-el="passive-added"]');
				return { act: b.dataset.usdAct, label: b.textContent.replace(added ? added.textContent : '', '').trim() };
			}));
		const iFilter = entryOrder.findIndex((b) => b.act === 'editor-pick');
		const iPassive = entryOrder.findIndex((b) => b.act === 'editor-pick-passive');
		const iText = entryOrder.findIndex((b) => b.act === 'editor-pick-text');
		assert(iFilter >= 0 && iPassive === iFilter + 1 && iText === iPassive + 1
			&& entryOrder[iPassive].label === '緑スキル',
			'段9: 入口は「条件で検索」と「テキストで検索」の間に「緑スキル」',
			entryOrder.map((b) => b.label));

		/* (1b) **色で名乗るのは草の芽のアイコンだけ**（段9 の追加のやり直し）。
		   いったん面・枠・文字を緑で塗ったが、実機で他のボタンより大きく見えたので取りやめた。
		   見るのは2つ ――
		   - ボタンの地・枠・文字が**隣の「テキストで検索」とまったく同じ**（黒系統に戻っている）
		   - **アイコン（svg）だけ**が `--uma-green-skill` の緑
		   **色の値は検査に書かず、:root から同じページで解決する**（段1 で赤い「リセット」に
		   対して行ったのと同じ形）。**空振り防止**として、アイコンの緑が
		   **ボタンの文字の色と違う**ことも見る（トークンが黒と同じ値になったら落ちる）。 */
		const passiveColor = await page.evaluate(() => {
			const btn = document.querySelector('#deck-template-panel [data-usd-act="editor-pick-passive"]');
			const plain = document.querySelector('#deck-template-panel [data-usd-act="editor-pick-text"]');
			const probe = document.createElement('span');
			probe.style.cssText = 'position:absolute;left:-9999px';
			document.body.appendChild(probe);
			const resolve = (v) => { probe.style.color = 'var(' + v + ')'; return getComputedStyle(probe).color; };
			const want = resolve('--uma-green-skill');
			probe.remove();
			const read = (el) => { const cs = getComputedStyle(el); return { text: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor }; };
			const icon = btn.querySelector('svg, i');
			return {
				disabled: btn.disabled, got: read(btn), 隣: read(plain),
				アイコン: { 色: getComputedStyle(icon).color, 印: icon.getAttribute('data-lucide') || icon.getAttribute('class') },
				緑: want,
			};
		});
		assert(!passiveColor.disabled
			&& passiveColor.got.text === passiveColor.隣.text
			&& passiveColor.got.bg === passiveColor.隣.bg
			&& passiveColor.got.border === passiveColor.隣.border,
			'段9: 「緑スキル」の地・枠・文字は隣の入口と同じ（面を塗る形はやめた）', passiveColor);
		assert(passiveColor.アイコン.色 === passiveColor.緑
			&& passiveColor.アイコン.色 !== passiveColor.got.text
			&& /sprout/.test(passiveColor.アイコン.印),
			'段9: 草の芽のアイコンだけが --uma-green-skill の緑（ボタンの文字の色とは違う）', passiveColor);

		// (2) 開いたときの姿
		await page.click('#deck-template-panel [data-usd-act="editor-pick-passive"]');
		await page.waitForTimeout(700);
		const p0 = await passiveState();
		assert(p0.mode.passive && !p0.mode.filter && !p0.mode.paste && !p0.mode.custom,
			'段9: 「緑スキルを追加」は緑スキルの一覧だけを出す', p0.mode);
		assert(p0.title === '緑スキルを追加', '段9: 見出しが「緑スキルを追加」', p0.title);
		assert(p0.footH === 0,
			'段9: 確定ボタン（フッター）は出さない（チェックがその場で効くため）', p0.footH);

		// (3) 並ぶ顔ぶれ ―― 製品の印から作った一覧と、順序まで同じ。母集団のスキルは1件も出ない
		const expect = await page.evaluate(() => {
			const axes = UmaSkillDeckCore.TAG_AXES.filter((a) => a.poolExcluded).map((a) => a.key);
			const has = (s) => axes.some((k) => ((s.tags && s.tags[k]) || []).length > 0);
			return {
				axes,
				listed: UmaSkillDeckCore.getPoolExcludedSkills().map((s) => String(s.id)),
				pool: UmaSkillDeckCore.getMasterSkills().filter((s) => !has(s)).map((s) => String(s.id)),
			};
		});
		assert(expect.axes.length > 0 && expect.listed.length > 0 && expect.pool.length > 0,
			'段9: 母集団から外す印を持つ軸・外したスキル・残ったスキルがどれも実在する（空振りの検査ではない）',
			{ 軸: expect.axes, 外した: expect.listed.length, 母集団: expect.pool.length });
		assert(p0.ids.join() === expect.listed.join(),
			'段9: 一覧に並ぶのは「母集団から外した」スキルだけ（順序も含めて一致）',
			{ 画面: p0.ids.length, 期待: expect.listed.length });
		const leaked = p0.ids.filter((id) => expect.pool.includes(id));
		assert(leaked.length === 0,
			'段9: 「条件で検索」の母集団に残っているスキルは、この一覧に1件も出ない', leaked.slice(0, 5));

		// (4) チェックは「いまセットに入っているか」から作る（独立した状態を持たない）
		const already = p0.ids.filter((id) => p0.saved.includes(id));
		assert(already.length > 0 && p0.checked.join() === already.join(),
			'段9: 開いた時点のチェックは、いまセットに入っている緑スキルと一致する',
			{ チェック: p0.checked, セット: p0.saved });
		/* 注記の数え方 ―― **単位は背後の見出し（追加済みスキル（N種））と同じ「種」**。
		   「絞り込み結果（N件）」の「件」に引きずられていないことも一緒に見る。 */
		assert(p0.noteCount === already.length + '種'
			&& p0.note === 'チェックするとその場で追加済みスキルに入り、外すと抜けます（このうち'
				+ already.length + '種が追加済み）',
			'段9: 注記は「このうちN種が追加済み」で、単位は追加済みスキルの見出しと揃っている', p0.note);

		// (5) チェックするとその場でセットへ入る（確定ボタンを押さない）
		const target = p0.ids.find((id) => !p0.checked.includes(id));
		await page.click('[data-usd-el="passive-check"][value="' + target + '"]');
		await page.waitForTimeout(400);
		const p1 = await passiveState();
		assert(p1.saved.includes(target) && p1.saved.length === p0.saved.length + 1
			&& p1.checked.includes(target) && p1.panelCount === String(p0.saved.length + 1),
			'段9: チェックするとその場で追加済みスキルに入り、保存される',
			{ 前: p0.saved, 後: p1.saved, 見出し: p1.panelCount });

		// (6) 外すとその場でセットから抜ける
		await page.click('[data-usd-el="passive-check"][value="' + target + '"]');
		await page.waitForTimeout(400);
		const p2 = await passiveState();
		assert(!p2.saved.includes(target) && p2.saved.join() === p0.saved.join()
			&& !p2.checked.includes(target),
			'段9: チェックを外すとその場で追加済みスキルから抜ける', { 後: p2.saved });

		// (7) 閉じて開き直しても、チェックは現在のセットのまま
		await page.click('[data-usd-el="passive-check"][value="' + target + '"]');
		await page.waitForTimeout(400);
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(400);
		await page.click('#deck-template-panel [data-usd-act="editor-pick-passive"]');
		await page.waitForTimeout(700);
		const p3 = await passiveState();
		assert(p3.checked.join() === p3.ids.filter((id) => p3.saved.includes(id)).join()
			&& p3.checked.includes(target) && p3.checked.length === already.length + 1,
			'段9: 開き直してもチェックは現在のセットと一致する', { チェック: p3.checked, セット: p3.saved });

		/* (8) **追加済みスキルから消したら、次に開いたときチェックも外れている。**
		   消すのはモーダルの外（追加済みスキルのパネルの×）なので、モーダルを閉じてから行う。
		   × は削除モードのときだけ出る（C-57 の (9)）。 */
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(400);
		await page.evaluate((id) => {
			const del = document.querySelector('#deck-template-panel [data-usd-el="mode-delete"]');
			if (del && del.getAttribute('aria-pressed') !== 'true') del.click();   // 段9: special の② は × が常に出る（削除モードは無い）
			document.querySelector('#deck-template-panel [data-usd-act="template-skill-remove"][data-skill-id="' + id + '"]').click();
		}, target);
		await page.waitForTimeout(400);
		await page.click('#deck-template-panel [data-usd-act="editor-pick-passive"]');
		await page.waitForTimeout(700);
		const p4 = await passiveState();
		assert(!p4.saved.includes(target) && !p4.checked.includes(target)
			&& p4.checked.join() === already.join(),
			'段9: 追加済みスキルから消すと、次に開いたときチェックも外れている',
			{ 消したもの: target, チェック: p4.checked, セット: p4.saved });

		/* (9) 入口のボタンの「（N種追加済み）」（段9 の追加）。
		   **期待値は実データから導く** ―― いまセットに入っているIDのうち、
		   (3) で `TAG_AXES` の印から作った「緑スキルの顔ぶれ」に居るものの数。
		   **件数も軸のキーも検査に書かない。**

		   **先にパッシブでないスキルを1件足す。** ここまでのセットは「右回り○」1件だけで、
		   それがパッシブなので、**「緑スキルの数」と「セット全体の種数」が同じ 1 になる**
		   ―― その状態だと、数え方を全体の種数に取り違えても検査が素通りする
		   （段9 の破壊確認で実際に素通りした）。**母集団の先頭の1件**を足せば2つの数が割れる
		   （「条件で検索」の一覧にはパッシブが出ないので、何を選んでも必ずパッシブでない）。 */
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(400);
		await page.click('#deck-template-panel [data-usd-act="editor-pick"]');
		await page.waitForTimeout(700);
		await page.click('[data-usd-el="results"] .usd-row input');
		await page.waitForTimeout(300);
		await page.click('[data-usd-act="picker-add"]');
		await page.waitForTimeout(400);
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(400);
		/* 件数は**タブと同じ数字バッジ**（段9 のやり直し。括弧書きはボタンを横へ広げすぎた）。
		   **「同じバッジ」であること自体を見る** ―― 見た目は `.usd-tab-count` と1か所で
		   定義してあるので、片方だけ色や大きさが変われば食い違う。
		   軸のタブのバッジを実際に1つ出し（`filter-check` を1つ押す）、**描かれた値どうし**を比べる。 */
		const addedLabel = () => page.evaluate(() => {
			const el = document.querySelector('#deck-template-panel [data-usd-el="passive-added"]');
			const cs = getComputedStyle(el);
			return {
				text: el.textContent, hidden: el.hidden, cls: el.className,
				見た目: { bg: cs.backgroundColor, color: cs.color, r: cs.borderTopLeftRadius, h: cs.height, fs: cs.fontSize, w: cs.fontWeight },
				セット: JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}').skillIds || [],
			};
		});
		const lab1 = await addedLabel();
		const want1 = lab1.セット.filter((id) => expect.listed.includes(id)).length;
		assert(want1 > 0 && lab1.セット.length > want1,
			'段9: セットの中に緑スキルとそうでないものが混ざっている（件数の検査が空振りしない形）',
			{ セット: lab1.セット, 緑: want1 });
		assert(lab1.text === String(want1) && !lab1.hidden,
			'段9: 入口に件数が出て、数は追加済みスキルのうち緑スキルの数と一致する',
			{ 出ている: lab1.text, 期待: want1, セット: lab1.セット });

		/* (9b) **「条件で検索」のタブに出るのと同じバッジ**であること（段9 のやり直しの指示）。
		   軸のタブのバッジを実際に1つ出して、**描かれた見た目どうし**を突き合わせる
		   ―― クラス名の一致ではなく計算後の値で見るので、
		   片方だけ色や大きさを変えたら落ちる。 */
		const badgeSame = await page.evaluate(() => {
			const read = (el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color, r: cs.borderTopLeftRadius, h: cs.height, fs: cs.fontSize, w: cs.fontWeight }; };
			const axis = UmaSkillDeckCore.pickableAxes()[0];
			const tabBadge = document.querySelector('[data-usd-el="axis-count"][data-usd-axis="' + axis.key + '"]');
			return { タブ: read(tabBadge), 入口: read(document.querySelector('#deck-template-panel [data-usd-el="passive-added"]')) };
		});
		assert(JSON.stringify(badgeSame.タブ) === JSON.stringify(badgeSame.入口)
			&& badgeSame.入口.bg !== 'rgba(0, 0, 0, 0)',
			'段9: 件数は「条件で検索」のタブに出るのと同じ数字バッジの形（地・文字色・角・高さ・字）', badgeSame);

		/* (10) **0種のときは出さない。**「リセット」でセットごと空にして見る。
		   **`hidden` 属性で見る** ―― 中身が空文字かどうかではなく、実際に消えているか。 */
		// （段7b の ⑫：「リセット」ボタンは無くなったので、「＋新規」の × → 確認の小窓 → OK で空にする）
		// 段8（C-120）で②のタブの × を無くしたので、共通の見出しの帯の一覧 → 削除 → 確認の小窓 → OK で空にする
		await page.click('#deck-set-bar [data-usd-act="set-list"]');
		await page.click('[data-usd-el="set-delete"]');
		await page.click('button[data-usd-act="confirm-ok"]');
		await page.waitForTimeout(400);
		const lab0 = await addedLabel();
		const shown0 = await page.evaluate(() =>
			document.querySelector('#deck-template-panel [data-usd-el="passive-added"]').offsetParent !== null);
		assert(lab0.セット.length === 0 && lab0.hidden && !shown0,
			'段9: 緑スキルが0種のときは件数のバッジを出さない', { ...lab0, 見えている: shown0 });

		// 片付け（このあとの検査は「ドラフトに右回り○が1件」「Undo は空」を前提にする）
		await page.click('#deck-template-panel [data-usd-act="editor-pick-passive"]');
		await page.waitForTimeout(700);
		await page.click('[data-usd-el="passive-check"][value="' + already[0] + '"]');
		await page.waitForTimeout(400);
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(400);
		const back = await addedLabel();
		assert(back.セット.join() === p0.saved.join() && !back.hidden && back.text === String(want1),
			'段9: 入れ直すと件数も元に戻る（0種の検査が「いつも消えている」ではないことの担保）', back);
		await page.evaluate(() => UmaSkillDeckCore.clearUndo());
		await page.waitForTimeout(300);
	}

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
		// 「新UI」のバッジは段7b の ⓪で無くした。新UIかどうかは、新UIだけに出る①のステップのタブで見る
		badge: !document.getElementById('step-tab-0').hidden,
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
	assert(newUi.title === '因子周回', 'special: 新UIの①の見出しが短縮されている', newUi.title);
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
});

/* ============================================================
 * special.html — 「画像から読み取る」の口（openSkillRowsPicker。スキルセットOCR フェーズa コミット3）
 *
 * 外で照合を済ませた行（ID付きの候補一覧）を core に渡し、「テキストで検索」と同じ報告
 * （候補チップ・取り消し・確定）が動くことを見る。入口のボタンはコミット4なので、ここでは口を直接呼ぶ。
 * 行の形は matchPastedSkillText() と同じ。autoAccepted:true の review 行は最初から選択に入る（決定 B-2）。
 * ============================================================ */
await block('special.html — 「画像から読み取る」の口（openSkillRowsPicker。スキルセットOCR フェーズa コミット3）', async () => {
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
			paste: !el('mode-paste').hidden, filter: !el('mode-filter').hidden, custom: !!el('mode-custom'),
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
});

/* ============================================================
 * special.html — ステップ①の入口「スキルセット画面のスクショから読み取る」（スキルセットOCR フェーズa コミット4）
 *
 * OCR そのものは回さない（Tesseract の言語データと実画像が要る）。読み取りの結果（runSkillsetOcr の戻り値の形）を
 * showSkillsetScreenshotResult に直接渡し、押す → ピッカーが ocr モードで開く → 追加が対象スキルセット（ドラフト）に入る
 * → 「元に戻す」で戻る、を見る。文面は Chat が確定したもの（HANDOFF C-24「確定した文面4件」）と一字一句同じであること。
 * ============================================================ */
await block('special.html — ステップ①の入口「スキルセット画面のスクショから読み取る」（スキルセットOCR フェーズa コミット4）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	await page.waitForTimeout(2500);
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	await page.waitForFunction(() => UmaSkillDeckCore.matchPastedSkillText('右回り○').rows[0].kind === 'exact', null, { timeout: 15000 });

	// 入口は編集画面の入口の並びに出る（改訂: 「テキストで検索」と「未収録スキルを追加」の間。
	// ラベル「スクショで追加」、アイコンはアップロード枠と同じ upload-cloud、隣に「?」＝撮影ガイド）。
	// 71セッション目・段6: special が渡していたラベルを外し、core の既定「スクショで追加」を使う形にした。
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
	// 72セッション目・段9 で2番目に「緑スキル」（editor-pick-passive）が入り、
	// 73セッション目に末尾の「リセット」（editor-clear-skills）が名前の行へ抜けた
	// 2026-09-27（C-100）に末尾の「未収録スキルを追加」（editor-pick-custom）を廃止した
	assert(entry.order.join(',') === 'outside-open,editor-pick,editor-pick-passive,editor-pick-text,editor-pick-screenshot'
		&& entry.label === 'スクショで追加' && entry.cls.includes('uma-btn--secondary') && entry.noHelp,
		'special/ocr入口: 「テキストで検索」の後ろ（並びの最後）に、同じ見た目で「スクショで追加」が出る（「?」は無い）', { order: entry.order, label: entry.label });
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
		// 選択の注記は68セッション目に削除。照合対象になったことは skillOnlyList とタブのバッジで見る
		skills: skillOnlyList.length,
		badge: document.getElementById('skill-count-badge').textContent
	}));
	assert(added.selection && added.selection.kind === 'draft' && added.selection.skillIds.length === 2 && added.ids.every((i) => added.selection.skillIds.includes(i)),
		'special/ocr入口: 追加した2種がドラフト（対象スキルセット）に入り、選択される', added.selection);
	// 段8・D（C-120）: ②のタブの「N種」は②の先頭の N（ON のランクの種＋継承固有の種類数。既定 6）と同じ値。2種＋6＝8種
	assert(added.undo === 'inline-flex' && added.undoCount === '1' && added.skills === 2 && added.badge === '8種',
		'special/ocr入口: 「元に戻す」が出て、追加した2種がそのまま照合対象になる',
		{ undo: added.undo, count: added.undoCount, skills: added.skills, badge: added.badge });

	// 「元に戻す」で追加が取り消され、因子セットが空に戻る
	await page.click('[data-usd-act="picker-close"]');
	await page.click('#deck-undo-btn');
	await page.waitForTimeout(500);
	const undone = await page.evaluate(() => ({
		selection: deckTemplateManager.getSelection(),
		undo: document.getElementById('deck-undo-btn').style.display,
		// 「因子セットを1つ選んでください」の文言も注記ごと消えた（68セッション目）。
		// **未選択であることの印**は、②のタブの件数バッジが出ないことと、照合対象が空になること。
		skills: skillOnlyList.length,
		badgeHidden: document.getElementById('skill-count-badge').classList.contains('hidden')
	}));
	assert(undone.selection === null && undone.undo === 'none' && undone.skills === 0 && undone.badgeHidden,
		'special/ocr入口: 「元に戻す」で追加が取り消され、因子セットが空に戻る（タブの件数バッジも消える）', undone);

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
		&& empty.goldOnly.summary === '金スキル（約3種）が見つかりましたが、白スキルはありませんでした。\n金スキルは対象外です。金スキルに対応する白スキルを探す機能は、まだありません。\n白スキルは「テキストで検索」または「条件で検索」から追加してください。',
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
		&& panels.note === 'すでに追加済みのものが含まれることがあります。必要なものは「テキストで検索」または「条件で検索」から追加してください。'
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
		&& finder.none.customLabel === null && finder.none.customIsChip === false,
		'special/ocr入口: 打ち間違いでは候補が出ず（あいまい照合なし）、確定文面だけが出る（C-100: 「収録されていないスキルとして追加」は廃止）', finder.none);

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
});

/* ============================================================
 * special.html — 既定は新UI／切り替えの告知モーダル
 *
 * 「どちらのUIで開くか」と「モーダルを既読にしたか」が localStorage に残るので、
 * まっさらな文脈を使って通しで見る。閉じ方が4通りあり、どれで閉じても既読に
 * なることが仕様の肝なので、そこは文脈を分けて1通りずつ確かめる。
 * ============================================================ */
await block('special.html — 既定は新UI／切り替えの告知モーダル', async () => {
{
	// 画面の状態をまとめて読む。どのUIで開いたかは①の見出しで判る。
	const uiState = (page) => page.evaluate(() => ({
		notice: !document.getElementById('ui-notice').hidden,
		backdrop: !document.getElementById('ui-notice-backdrop').hidden,
		badge: !document.getElementById('step-tab-0').hidden,
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
		assert(first.title === '因子周回' && first.badge && first.label === '旧UIへ',
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
		assert(again.title === '因子周回' && !again.notice,
			'special: 既読なら新UIのままで、モーダルは繰り返さない', again);

		// 6. 読み直せる（既読のまま）。右上の「新UI」バッジは段7b の ⓪で無くしたので、読み直しの関数を直接呼ぶ
		await page.evaluate(() => reopenUiNotice());
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
		assert(exited.title === '因子周回' && exited.mode === 'new' && !exited.btnShown && !exited.endNote,
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
		assert(s.title === '因子周回' && s.notice,
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
});

/* ============================================================
 * exam.html（UmaExam OCR）— 最小ブロック
 *
 * 第2段階（exam×Deck）の着手にあたり、それまで exam を見る項目が 0 件だった
 * ところに受け皿を作った。読み込める・コンソールエラー0・375px で横スクロール無し、
 * に加えて「組み込み133種が登録されて見えている」ことだけを見る。
 * ============================================================ */
await block('exam.html（UmaExam OCR）— 最小ブロック', async () => {
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
	/* --- 段I: 一覧の凡例と一覧が一対一 ---
	   凡例は renderSkillRegistryList() が**一覧と同じ材料**から組み立てる。
	   見るのは2方向:
	     ① 一覧のどの行にも、印か（下線／取り消し線）のどちらかが付いている
	        ―― 段H まで 'plain'（その他の対象スキル）に印が無く、74行が裸だった
	     ② 凡例に、一覧に出ていない区分の説明が残っていない
	   設定を変えるたびに両方を見る（区分の出入りが設定で変わるため）。 */
	const readLegendPair = () => page.evaluate(() => {
		const rows = [...document.querySelectorAll('#skill-registry-list > div')];
		const bare = rows.filter((d) => {
			const mark = d.firstElementChild;
			const hasMark = !!(mark.textContent.trim() || mark.querySelector('svg'));
			return !hasMark && !d.querySelector('.registry-added, .registry-removed');
		});
		const legend = document.getElementById('registry-legend');
		const text = legend.textContent.replace(/\s+/g, ' ').trim();
		// 凡例が名乗っている区分（listTitle の文字列で引く）
		const named = Object.keys(SCREEN_MARK).filter((k) => text.includes(SCREEN_MARK[k].listTitle));
		// 一覧に実際に出ている区分
		const present = new Set();
		rows.forEach((d) => {
			const k = skillMarkKind(d.lastElementChild.textContent);
			if (k && SCREEN_MARK[k]) present.add(k);
		});
		return {
			rows: rows.length, bare: bare.length,
			bareSample: bare.slice(0, 3).map((d) => d.textContent.trim()),
			named: named.sort(), present: [...present].sort(),
			// 並びは MARK_KIND_ORDER と同じ（結合画像の凡例と揃える）
			order: MARK_KIND_ORDER.filter((k) => named.includes(k)).join(',')
				=== named.slice().sort((x, y) => MARK_KIND_ORDER.indexOf(x) - MARK_KIND_ORDER.indexOf(y)).join(','),
			underline: text.includes('下線'), strike: text.includes('取り消し線'),
			text: text,
		};
	});
	for (const [label, setup] of [
		['既定', () => { setScenarioFactorsAll(false); setAptitudeGenesAll(false); setTargetScopeMode('default'); }],
		['因子＋遺伝子', () => { setScenarioFactorsAll(true); setAptitudeGenesAll(true); setTargetScopeMode('default'); }],
		['対象を広げる', () => { setScenarioFactorsAll(true); setAptitudeGenesAll(true); setTargetScopeMode('expanded'); }],
		['対象を絞る', () => { setScenarioFactorsAll(false); setAptitudeGenesAll(false); setTargetScopeMode('curated'); }],
	]) {
		await page.evaluate(setup);
		await page.waitForTimeout(150);
		const p = await readLegendPair();
		assert(p.bare === 0, '段I(' + label + '): 一覧に印も線も無い行が残っていない', p);
		assert(p.named.join(',') === p.present.join(','),
			'段I(' + label + '): 凡例が名乗る区分と一覧に出ている区分が一致する', { 凡例: p.named, 一覧: p.present });
		assert(p.order, '段I(' + label + '): 凡例の並びが MARK_KIND_ORDER と同じ', p.text);
		assert(p.underline === (label === '対象を広げる') && p.strike === (label === '対象を絞る'),
			'段I(' + label + '): 下線／取り消し線の説明は、その行が実際に出ているときだけ', p);
	}
	// 'plain' の黒丸そのもの。一覧と判定結果の表の**両方**に出て、緑の ● とは色が違う
	const plainMark = await page.evaluate(() => {
		setScenarioFactorsAll(false); setAptitudeGenesAll(false); setTargetScopeMode('default');
		const mk = matchAllSkillsWithStars(
			skillList.map((s, i) => ({ text: s, stars: (i % 3) + 1, starsReliable: true, rowKey: 'r' + i })),
			skillList, skillIndex, {});
		personResults = PERSON_LABELS.map(() => null);
		personResults[0] = mk;
		renderResults();
		const title = SCREEN_MARK.plain.listTitle;
		const inList = document.querySelector('#skill-registry-list [title="' + title + '"]');
		const inTable = document.querySelector('#result-tbody [title="' + title + '"]');
		const green = document.querySelector('#skill-registry-list [title="' + SCREEN_MARK.green.listTitle + '"]');
		const root = getComputedStyle(document.documentElement);
		const toRgb = (x) => 'rgb(' + [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)).join(', ') + ')';
		return {
			title: title,
			listGlyph: inList ? inList.textContent : null, tableGlyph: inTable ? inTable.textContent : null,
			listColor: inList ? getComputedStyle(inList).color : null,
			tableColor: inTable ? getComputedStyle(inTable).color : null,
			greenColor: green ? getComputedStyle(green).color : null,
			want: toRgb(root.getPropertyValue('--uma-text').trim()),
			// 結合画像が使うトークンと同じものを指しているか
			stitchToken: ATTR_MARK_TOKEN.plain,
		};
	});
	assert(plainMark.listGlyph === '●' && plainMark.tableGlyph === '●',
		'段I: その他の対象スキルの黒丸が一覧と判定結果の表の両方に出る', plainMark);
	assert(plainMark.listColor === plainMark.want && plainMark.tableColor === plainMark.want
		&& plainMark.listColor !== plainMark.greenColor && plainMark.stitchToken === '--uma-text',
		'段I: 黒丸の色は結合画像と同じ --uma-text で、緑の ● とは違う色', plainMark);
	assert(/^その他の対象スキル（\d+種）$/.test(plainMark.title),
		'段I: 呼び名に種数が付く（数は定数から出す）', plainMark.title);
	// この先の検査は「対象を絞る」のまま続く（上の段I の掃きで一時的に動かしたので戻す）
	await page.evaluate(() => setTargetScopeMode('curated'));

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

	/* --- 遺伝子の1行（段F） ---
	   シナリオ因子とまったく同じ形。件数は正本の写しから取る（テストに数字を書かない）。
	   **αの注記（#genes-alpha）は段H で消した**ので、無いことを見る（C-70 の段H）。
	   ミニウィンドウが .glass-card（backdrop-filter を持つ）の子孫に入っていないことも見る
	   ―― 入ると position: fixed の基準が画面ではなくカードになり、箱が画面の外へ出る（F-61）。 */
	const GENE_COUNT = await page.evaluate(() => APTITUDE_GENES.length);
	await page.evaluate(() => setAptitudeGenesAll(true));
	const geneRow = await page.evaluate(() => {
		const row = document.getElementById('genes-all').closest('.uma-checkrow');
		const badge = document.getElementById('genes-badge');
		return {
			row: !!row, height: row ? Math.round(row.getBoundingClientRect().height) : null,
			label: row ? row.querySelector('.uma-checkrow-label span').textContent : null,
			badge: badge ? badge.textContent : null,
			accent: badge ? badge.classList.contains('uma-badge--accent') : null,
			help: !!document.getElementById('gene-list-btn'),
			// 段H: αの注記は消した。箱そのものも、αを名乗る文言も残っていないこと。
			alphaGone: !document.getElementById('genes-alpha'),
			noAlphaBox: !document.querySelector('.uma-help-box--alpha'),
			noAlphaText: document.body.textContent.indexOf('結合画像には反映されません') === -1,
			// Special 側と違い、exam には α を名乗る文言がもう無い
			noAlphaWord: document.getElementById('step-panel-1').textContent.indexOf('αテスト') === -1,
		};
	});
	assert(geneRow.row && geneRow.label === '遺伝子' && geneRow.height <= 40 && geneRow.help,
		'段F(exam): 遺伝子は1行（☑ 遺伝子 N種 ?）', geneRow);
	assert(geneRow.badge === GENE_COUNT + '種' && geneRow.accent === true,
		'段F(exam): 件数のバッジが出て、ON のあいだは色が変わる', geneRow);
	assert(geneRow.alphaGone && geneRow.noAlphaBox && geneRow.noAlphaText && geneRow.noAlphaWord,
		'段H(exam): αの注記は消えている（結合画像に反映したので用が済んだ）', geneRow);
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
	await page.evaluate(() => { setScenarioFactorsAll(false); setAptitudeGenesAll(false); setTargetScopeMode('default'); });
	assert(await page.textContent('#step1-skill-badge') === '133種', 'exam: 調整を戻すとバッジも「133種」に戻る');
	assert(await page.evaluate(() => ['badge-scope-added', 'badge-scope-removed', 'badge-scenario-factors', 'badge-genes']
		.every((id) => document.getElementById(id).classList.contains('hidden'))),
		'exam: 既定に戻すと4つの追加バッジは出ない');

	/* --- 段I: 遺伝子のバッジ（段F の積み残し）---
	   シナリオ因子のバッジと同じ形で、**その右隣**に置く。数は合算せず並記（C-70 の13節）。
	   色は印と同じ系統（因子＝--uma-catalog-*／遺伝子＝--uma-gene-*）で、
	   帯を見ただけでどちらの話かが分かること。 */
	const geneBadge = await page.evaluate(() => {
		setScenarioFactorsAll(true); setAptitudeGenesAll(true);
		const strip = document.getElementById('badge-sp70-count').closest('.flex-wrap');
		const shown = [...strip.children].filter((e) => !e.classList.contains('hidden'));
		const el = document.getElementById('badge-genes');
		const fac = document.getElementById('badge-scenario-factors');
		const cs = getComputedStyle(el), csf = getComputedStyle(fac);
		const root = getComputedStyle(document.documentElement);
		const toRgb = (x) => 'rgb(' + [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)).join(', ') + ')';
		return {
			text: document.getElementById('badge-genes-text').textContent,
			order: shown.map((e) => e.id || 'static'),
			// シナリオ因子のすぐ右
			afterFactor: el.previousElementSibling === fac,
			bg: cs.backgroundColor, color: cs.color,
			wantBg: toRgb(root.getPropertyValue('--uma-gene-soft').trim()),
			wantColor: toRgb(root.getPropertyValue('--uma-gene-text').trim()),
			// 因子のバッジとは別の色（帯の中で区別が付く）
			differsFromFactor: cs.backgroundColor !== csf.backgroundColor && cs.color !== csf.color,
			icon: el.querySelector('svg') ? el.querySelector('svg').classList.contains('lucide-dna') : null,
		};
	});
	assert(geneBadge.text === '遺伝子：10種' && geneBadge.afterFactor,
		'段I: 遺伝子のバッジがシナリオ因子の右隣に出る（数は並記）', geneBadge);
	assert(geneBadge.bg === geneBadge.wantBg && geneBadge.color === geneBadge.wantColor && geneBadge.differsFromFactor,
		'段I: 遺伝子のバッジの色が --uma-gene-* から当たり、因子のバッジと区別できる', geneBadge);
	assert(await page.evaluate(() => { setAptitudeGenesAll(false); return document.getElementById('badge-genes').classList.contains('hidden'); }),
		'段I: 遺伝子を外すとバッジも消える');
	await page.evaluate(() => { setScenarioFactorsAll(false); setAptitudeGenesAll(false); });

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
	// Deck は追加カタログ（data/）から引くので、警告を出さずに取り込める。
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

	/* --- 検出数は**遺伝子も ON にしたうえで**もスキルだけ（68セッション目に追加）---
	   すぐ上の factorSplit は「シナリオ因子だけ ON・遺伝子 OFF」の状態で走っているので、
	   **遺伝子が検出数に混ざる回帰は、これまでどの検査でも捕まらなかった**
	   （68セッション目の下見で判明。実装は正しかったが、正しさを固定する検査が無かった）。
	   ここでは遺伝子も ON にし、**skillList の全部を検出した状態**を作る ――
	   それでも検出数が skillOnlyList の数のままなら、因子も遺伝子も数えていないと言い切れる。
	   件数はこのファイルに書かず、製品側の3本立て（skillOnlyList / factorOnlyList /
	   geneOnlyList）から取る（収録データが増えても直さなくてよい）。 */
	await page.evaluate(() => setAptitudeGenesAll(true));
	await seedExam();
	await page.waitForTimeout(400);
	const geneCountSplit = await page.evaluate(() => ({
		skillOnly: skillOnlyList.length, factorOnly: factorOnlyList.length, geneOnly: geneOnlyList.length,
		all: skillList.length,
		statTotal: document.getElementById('stat-total').textContent,
		statFound1: document.getElementById('stat-found-1').textContent,
		statFactor: document.getElementById('stat-total-factor').textContent,
		detected0: countDetected(0),
		// 親Aは skillList を丸ごと検出させてある（因子・遺伝子の行も含めて全部）
		detectedAll: skillList.filter((s) => personResults[0].detectedSkills.has(s)).length
	}));
	assert(geneCountSplit.geneOnly === GENE_COUNT && geneCountSplit.factorOnly > 0
		&& geneCountSplit.all === geneCountSplit.skillOnly + geneCountSplit.factorOnly + geneCountSplit.geneOnly
		&& geneCountSplit.detectedAll === geneCountSplit.all
		&& geneCountSplit.detected0 === geneCountSplit.skillOnly
		&& geneCountSplit.statFound1 === String(geneCountSplit.skillOnly)
		&& geneCountSplit.statTotal === String(geneCountSplit.skillOnly)
		&& geneCountSplit.statFactor === '＋シナリオ因子' + geneCountSplit.factorOnly + '種＋遺伝子' + geneCountSplit.geneOnly + '種',
		'exam: 遺伝子も ON にして全部検出しても、検出数と対象スキル数はスキルだけ（遺伝子込みなら skillList の数になるところ）',
		geneCountSplit);

	// 遺伝子もここで戻す（上の検査で ON にしたため）
	await page.evaluate(() => { setScenarioFactorsAll(false); setAptitudeGenesAll(false); setTargetScopeMode('default'); });

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
	/* --- 段H: 遺伝子の印は**画面にも結合画像にも**出す ---
	   段F のあいだは stitchMarkKind() が 'gene' を null に落としていて、この検査は
	   「結合画像には焼かない」ことを見ていた。段H で落とすのをやめたので、**意図のほうを**
	   書き換えてある ―― いまは「画面と結合画像で区分が一致する」ことを見る。
	   凡例は「実際に描いた区分」から作る（drawAttrIconsOnPerson の戻り値 kinds）ので、
	   区分が返るということは**凡例の行も増える**ということ。そこは下の凡例の検査で見る。
	   ここが落ちるのは「また落とし始めた」「スキルまで落ちた」のどちらか。 */
	const geneMark = await page.evaluate(() => {
		const g = APTITUDE_GENES[0], s = EXAM_SKILL_NAMES[0];
		const kinds = [g, s].concat(SCENARIO_INHERITANCE_FACTORS.slice(0, 1));
		return {
			画面の区分: skillMarkKind(g), 結合画像の区分: stitchMarkKind(g),
			記号: SCREEN_MARK.gene ? (SCREEN_MARK.gene.svg ? 'svg' : SCREEN_MARK.gene.glyph) : null,
			呼び名: SCREEN_MARK.gene ? SCREEN_MARK.gene.tableTitle : null,
			// どの区分でも画面と結合画像が食い違わない（遺伝子だけでなく全部を見る）
			一致: kinds.every((n) => skillMarkKind(n) === stitchMarkKind(n)),
			スキルの画面: skillMarkKind(s), スキルの結合画像: stitchMarkKind(s),
			// 結合画像に焼く色（Canvas は CSS が効かないので実行時にトークンから引く）
			印の色: (attrMarkColors() || {}).gene || null,
			凡例の呼び名: MARK_LEGEND_LABEL.gene,
		};
	});
	assert(geneMark.画面の区分 === 'gene' && geneMark.記号 === 'svg' && geneMark.呼び名 === '遺伝子',
		'段I-5(exam): 遺伝子は画面では白抜きの菱形の SVG（区分は gene・呼び名は「遺伝子」）', geneMark);
	assert(geneMark.結合画像の区分 === 'gene' && geneMark.一致 === true
		&& geneMark.スキルの画面 === geneMark.スキルの結合画像,
		'段H(exam): 結合画像にも遺伝子の印を焼く（画面と結合画像の区分が一致する）', geneMark);
	assert(!!geneMark.印の色 && geneMark.凡例の呼び名 === '遺伝子',
		'段H(exam): 結合画像の印の色と凡例の呼び名が引ける（凡例に「遺伝子」の行が出る条件）', geneMark);

	/* ------------------------------------------------------------
	 * 段I-4／段I-5: 印の輪郭そのものを見る3本
	 *
	 * **なぜ足したか。** F-63 は「画面と結合画像が同じ形であることを、作りとして
	 * 保証する」と書いたが、**それを確かめる検査は無かった** ―― あったのは
	 * 「画面の SVG の d が共有の定数と同じ文字列か」と「Deck の写しが同じ文字列か」の
	 * 2本で、**どちらも SVG どうしの突き合わせ**。Canvas は1度も比べられていなかった。
	 * 66セッション目に「結合画像だけ形が違って見える」と疑われたとき、
	 * 検査は何も言えなかった（実測した結果、形は一致していて原因は輪郭の粗だった）。
	 *
	 * **段I-5 で印がハートから菱形になったが、この3本はそのまま意味を持つ。**
	 * (1) Canvas と SVG を**同じ大きさで実際に描いて画素で突き合わせる**。
	 *     文字列ではなく塗りを比べるので、出口のどちらかが壊れれば落ちる。
	 * (2) 頂点が**上・右・下・左の4つで左右対称**。
	 *     ―― special は因子の菱形を横 0.82 に潰していて、exam・画面の ◆ と
	 *     形が食い違っていた（段I-5 で揃えた）。潰し直したらここで落ちる。
	 * (3) 輪郭が**外接円にちょうど接する**。段I-4 の前の輪郭は「収まる」と書きながら
	 *     1.109 倍まで出ていた（倍率を手で置いていたため、誰も気づかなかった）。
	 * ------------------------------------------------------------ */
	const outline = await page.evaluate(async () => {
		const S = 400, CX = 200, CY = 200, R = 150;
		// Canvas 側（製品の関数をそのまま呼ぶ）
		const c1 = document.createElement('canvas'); c1.width = S; c1.height = S;
		const x1 = c1.getContext('2d');
		stitchDiamondPath(x1, CX, CY, R);
		x1.fillStyle = '#000'; x1.fill();
		// SVG 側（製品の関数が返す d を、同じ座標系でラスタライズ）
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + S + '" height="' + S + '"'
			+ ' viewBox="0 0 ' + S + ' ' + S + '"><path d="' + stitchDiamondPathD(CX, CY, R) + '" fill="#000"/></svg>';
		const img = new Image();
		img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
		await img.decode();
		const c2 = document.createElement('canvas'); c2.width = S; c2.height = S;
		c2.getContext('2d').drawImage(img, 0, 0);
		const mask = (c) => {
			const d = c.getContext('2d').getImageData(0, 0, S, S).data;
			const m = new Uint8Array(S * S);
			for (let i = 0, j = 0; i < d.length; i += 4, j++) m[j] = d[i + 3] > 127 ? 1 : 0;
			return m;
		};
		const m1 = mask(c1), m2 = mask(c2);
		let inter = 0, uni = 0, onlyCanvas = 0, onlySvg = 0;
		for (let i = 0; i < m1.length; i++) {
			if (m1[i] & m2[i]) inter++;
			if (m1[i] | m2[i]) uni++;
			if (m1[i] && !m2[i]) onlyCanvas++;
			if (!m1[i] && m2[i]) onlySvg++;
		}
		const pts = stitchDiamondPoints(CX, CY, R);
		const rel = pts.map((p) => [Math.round((p[0] - CX) * 1000) / 1000, Math.round((p[1] - CY) * 1000) / 1000]);
		return {
			iou: inter / uni, onlyCanvas, onlySvg, ink: inter,
			頂点: rel,
			外接円に対する最大半径: Math.max(...rel.map(([x, y]) => Math.hypot(x, y))) / R,
			左右対称: Math.abs(rel[1][0] + rel[3][0]) < 1e-9 && rel[1][1] === 0 && rel[3][1] === 0,
			上下対称: Math.abs(rel[0][1] + rel[2][1]) < 1e-9 && rel[0][0] === 0 && rel[2][0] === 0,
			// 白抜きの線の太さ（段I-5 で決めた値。18px でも中が空いて見えること）
			線の太さ: { d18: stitchOutlineWidth(18), d26: stitchOutlineWidth(26), d38: stitchOutlineWidth(38) },
		};
	});
	/* **ぴったり0画素にはしない。** SVG の d は座標を小数第2位で丸めて文字列にするので
	   （stitchDiamondPathD の n()）、輪郭上の画素が1つ2つ入れ替わりうる。
	   **形が違えば数千画素の単位で食い違う**ので、塗りの 0.1% までを丸めの許容とする。
	   0 に固定すると丸めのせいで落ち続ける。 */
	const outlineSlack = Math.max(4, Math.round(outline.ink * 0.001));
	assert(outline.ink > 1000 && outline.iou > 0.999
		&& (outline.onlyCanvas + outline.onlySvg) <= outlineSlack,
		'段I-4: 印の輪郭は Canvas（結合画像）と SVG（画面）で一致する（差は d の丸めぶんだけ。'
		+ 'F-63 の「作りとして保証する」の実地の裏づけ）',
		Object.assign({ 許容: outlineSlack }, outline));
	assert(outline.頂点.length === 4 && outline.左右対称 && outline.上下対称,
		'段I-5: 菱形の頂点は上・右・下・左の4つで、縦にも横にも対称（潰した菱形を持ち込まない）', outline.頂点);
	assert(outline.外接円に対する最大半径 <= 1.001 && outline.外接円に対する最大半径 >= 0.999,
		'段I-4: 輪郭が外接円にちょうど接する（はみ出さない・縮みすぎない）', outline.外接円に対する最大半径);

	/* 段I-5: **白抜きが 18px でも「中が空いている」と分かるか**を画素で見る。
	   線の太さは stitchOutlineWidth(d) が決める。太すぎると中が潰れ、細すぎると
	   塗りの ◆ と見分けがつかなくなる ―― どちらに転んでもここで落ちる。
	   地は**パネルの濃い地**（#dcdeee）にして、「中が地に溶けないか」も同時に見る
	   （製品は中を白で塗るので、地の色に関わらず白く残るはず）。 */
	const hollow = await page.evaluate(() => {
		const colors = attrMarkColors();
		const out = {};
		for (const d of [18, 26, 38]) {
			const S = Math.ceil(d * 3);
			const c = document.createElement('canvas'); c.width = S; c.height = S;
			const ctx = c.getContext('2d');
			ctx.fillStyle = '#dcdeee'; ctx.fillRect(0, 0, S, S);   // パネルのいちばん濃い地
			drawSkillMark(ctx, 'gene', S / 2, S / 2, d, colors);
			const data = ctx.getImageData(0, 0, S, S).data;
			const at = (x, y) => { const p = ((y * S) + x) * 4; return [data[p], data[p + 1], data[p + 2]]; };
			const mid = at(Math.round(S / 2), Math.round(S / 2));
			// 中央から上へ走査して、白 → 線 → 地 の順に変わるか（＝中が空いている）
			let white = 0, ink = 0;
			for (let y = Math.round(S / 2); y >= 0; y--) {
				const [r, g, b] = at(Math.round(S / 2), y);
				if (r > 245 && g > 245 && b > 245) white++;
				else if (r < 160 && b > 100) ink++;         // 紫の線
			}
			out['d' + d] = { 中央の色: mid, 中の白い画素: white, 線の画素: ink, 線の太さ: stitchOutlineWidth(d) };
		}
		// 比較のため、塗りの ◆ の中央も取る（白抜きと明確に違うこと）
		const S = 54;
		const c = document.createElement('canvas'); c.width = S; c.height = S;
		const ctx = c.getContext('2d');
		ctx.fillStyle = '#dcdeee'; ctx.fillRect(0, 0, S, S);
		drawSkillMark(ctx, 'factor', S / 2, S / 2, 18, colors);
		const dd = ctx.getImageData(Math.round(S / 2), Math.round(S / 2), 1, 1).data;
		out.塗りの中央 = [dd[0], dd[1], dd[2]];
		return out;
	});
	const isWhite = (c) => c[0] > 245 && c[1] > 245 && c[2] > 245;
	assert([18, 26, 38].every((d) => isWhite(hollow['d' + d].中央の色) && hollow['d' + d].中の白い画素 >= 2
		&& hollow['d' + d].線の画素 >= 1),
		'段I-5: 白抜きの ◇ は 18/26/38px のどれでも中が白く残る（パネルの濃い地の上でも溶けない）', hollow);
	assert(!isWhite(hollow.塗りの中央),
		'段I-5: 塗りの ◆ は中まで色が入っている（白抜きと取り違えない）', hollow.塗りの中央);

	/* ------------------------------------------------------------
	 * 段J-2(exam): **スキルの検出が0件でも、因子・遺伝子の印は付く**
	 *
	 * 因子と遺伝子はスキルとは別勘定（並記して数える）なので、
	 * 印を付けるかどうかがスキルの検出数に左右されてはいけない。
	 * 実素材で OCR を回すのは遅いので、**印を置くのに必要な材料だけ**を組んで
	 * 製品の drawAttrIconsOnPerson() をそのまま呼び、置いた数を数える。
	 * ------------------------------------------------------------ */
	const zeroSkill = await page.evaluate(() => {
		setScenarioFactorsAll(true); setAptitudeGenesAll(true); setAttrIcons(true);
		const factor = SCENARIO_INHERITANCE_FACTORS[0], gene = APTITUDE_GENES[0];
		const skill = EXAM_SKILL_NAMES[0];
		// 印を置くのに要るのは「対応が分かっている画面サイズ」「列が2本」「行」だけ
		const geo = [{ naturalW: 900, naturalH: 1530, scale: 1, columnXs: [100, 300],
			rows: [{ y: 10, h: 24, col: 0 }, { y: 50, h: 24, col: 1 }, { y: 90, h: 24, col: 0 }] }];
		const lines = [{ text: factor, rowKey: '0:0' }, { text: gene, rowKey: '0:1' }, { text: skill, rowKey: '0:2' }];
		const mk = (names) => ({
			detectedSkills: new Set(names),
			skillSources: Object.fromEntries(names.map((n) => [n, [lines.findIndex((l) => l.text === n)]])),
			skillStars: {}, matchReasons: {},
		});
		const prev = { g: personGeometry[0], l: personLines[0], r: personResults[0] };
		personGeometry[0] = geo; personLines[0] = lines;
		const run = captureRun();
		const count = (names) => {
			personResults[0] = mk(names);
			const c = document.createElement('canvas');
			c.width = 600; c.height = 400;
			c._sourcePlacements = [];
			const out = drawAttrIconsOnPerson(c, 0, run);
			return { kinds: out.kinds.slice().sort(), suppressed: out.suppressed, drawn: out.drawn };
		};
		const both = count([factor, gene, skill]);
		const zero = count([factor, gene]);          // スキルの検出0件
		const onlySkill = count([skill]);
		personGeometry[0] = prev.g; personLines[0] = prev.l; personResults[0] = prev.r;
		return { both, zero, onlySkill };
	});
	assert(zeroSkill.zero.kinds.join(',') === 'factor,gene' && zeroSkill.zero.suppressed === null,
		'段J-2(exam): スキルの検出が0件でも、因子と遺伝子の印は付く（別勘定なので検出数に左右されない）', zeroSkill);
	assert(zeroSkill.both.kinds.join(',').includes('factor') && zeroSkill.both.kinds.join(',').includes('gene'),
		'段J-2(exam): スキルも検出しているときも、因子と遺伝子の印は付く', zeroSkill.both);
	assert(!zeroSkill.onlySkill.kinds.includes('factor') && !zeroSkill.onlySkill.kinds.includes('gene'),
		'段J-2(exam): 逆に、因子・遺伝子を検出していなければ、その印は出ない', zeroSkill.onlySkill);

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
});

/* ============================================================
 * uma-skill-deck.html（UmaSkill Deck）
 * ============================================================ */
await block('uma-skill-deck.html（UmaSkill Deck）', async () => {
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
	/* 切り替え先の軸は**製品が出している並びの最後**から取る（71セッション目・段8）。
	   以前は 'trackVenue' を名指ししていたが、その軸は段8 で絞り込みから隠したので押せない。
	   **軸のキーを検査に書かない**ようにしておけば、次に軸が入れ替わっても直さずに済む。 */
	const otherAxis = await page.evaluate(() => {
		const keys = UmaSkillDeckCore.pickableAxes().map((a) => a.key);
		return keys[keys.length - 1];
	});
	assert(await panelShown('distance') && !(await panelShown(otherAxis)),
		'deck: 初期表示は①のパネルだけが見えている', otherAxis);

	await page.click('.usd-tab[data-usd-axis="' + otherAxis + '"]');
	await page.waitForTimeout(300);
	assert(!(await panelShown('distance')) && await panelShown(otherAxis),
		'deck: タブを押すと表示パネルが入れ替わる', otherAxis);

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

	/* --- 目標のレースの距離（C-96・C-97・2026-09-26）。距離のタブの中の入力欄 ---
	   件数の突き合わせと判定の規則は `test:master` が持つ。ここでは**配線と見た目**だけ ――
	   入力欄が距離のパネルの中にあって、エラーの文が入力欄の下に出て、「すべて解除」で消えること。 */
	const targetState = () => page.evaluate(() => {
		const panels = document.querySelector('[data-usd-el="tabpanels"]');
		const box = document.querySelector('[data-usd-el="target-distance-box"]');
		const input = document.querySelector('[data-usd-el="target-distance"]');
		const err = document.querySelector('[data-usd-el="target-distance-error"]');
		if (!box || !input || !err) return null;
		const pr = panels.getBoundingClientRect(), br = box.getBoundingClientRect(), ir = input.getBoundingClientRect(), er = err.getBoundingClientRect();
		return {
			axis: box.dataset.usdAxis, disabled: input.disabled, value: input.value,
			inPanel: br.top >= pr.top - 1 && br.bottom <= pr.bottom + 1 && br.left >= pr.left - 1 && br.right <= pr.right + 1,
			errBelowInput: er.top >= ir.bottom - 1,
			errShown: err.getAttribute('data-shown') === 'true' && getComputedStyle(err).visibility === 'visible', errText: err.textContent,
			badge: (() => { const b = document.querySelector('[data-usd-el="axis-count"][data-usd-axis="distance"]'); return b.hidden ? '' : b.textContent; })(),
			count: document.querySelector('[data-usd-el="result-count"]').textContent,
		};
	});
	// 距離のタブを「選ばれていて、開いている」状態にする（下で定義する ensureAxisOpen と同じ判定。ここはその前なので直に書く）
	await page.evaluate(() => {
		const tab = document.querySelector('.usd-tab[data-usd-axis="distance"]');
		const box = document.querySelector('[data-usd-el="axis-tabs"]');
		if (!(tab.getAttribute('aria-selected') === 'true' && box.getAttribute('data-usd-open') === 'true')) tab.click();
	});
	await page.waitForTimeout(200);
	const t0 = await targetState();
	assert(t0 && t0.axis === 'distance' && !t0.disabled && t0.inPanel && !t0.errShown,
		'deck(C-97): 目標のレースの距離の入力欄が距離のパネルの中にあり、使える状態（レースの一覧を読めている）', t0);
	await page.fill('[data-usd-el="target-distance"]', '1350');
	await page.waitForTimeout(300);
	const t1 = await targetState();
	assert(t1.errShown && t1.errText.length > 0 && t1.errBelowInput && t1.inPanel && t1.badge === '' && t1.count === t0.count,
		'deck(C-97): レースの無い距離を入れると、入力欄の下にエラーの文が出て、絞り込みには使われない', t1);
	await page.fill('[data-usd-el="target-distance"]', '2400');
	await page.waitForTimeout(300);
	const t2 = await targetState();
	assert(!t2.errShown && t2.badge === '1' && t2.count !== t0.count && await page.isVisible('[data-usd-act="filter-jump"][data-usd-axis="distance"]'),
		'deck(C-97): 実在する距離を入れると、エラーが消えてバッジが1になり、絞り込まれる', t2);
	await page.click('[data-usd-act="filter-clear-all"]');
	await page.waitForTimeout(300);
	const t3 = await targetState();
	assert(t3.value === '' && t3.badge === '' && t3.count === t0.count, 'deck(C-97): 「すべて解除」で目標の距離も消える', t3);

	/* --- 全部の軸が常に見えていること（横スクロールも「端へ」操作も要らない） ---
	   1行に収まるかどうかはJSが実測して data-usd-rows を切り替える。
	   **軸の本数はここに書かない**（70セッション目・段3 で 8→10 になった）。
	   製品の `TAG_AXES` から取る ―― 数を決め打ちすると、軸を足したこと自体で落ちてしまい、
	   「1枚も欠けずに全部見えているか」という狙いが果たせない。 */
	// 71セッション目・段8: 隠す軸ができたので、数えるのは pickableAxes()（＝画面に出る軸）。
	const axisCount = await page.evaluate(() => UmaSkillDeckCore.pickableAxes().length);
	const tabLayout = () => page.evaluate(() => {
		const bar = document.querySelector('.usd-tablist');
		const tabs = [...document.querySelectorAll('.usd-tab')];
		const box = bar.getBoundingClientRect();
		return {
			rows: document.querySelector('[data-usd-el="tabbar"]').getAttribute('data-usd-rows'),
			count: tabs.length,
			// 段数は**下端**の種類で数える。1行のときは選択中だけ上端が持ち上がる（--usd-tab-lift）
			// ので、上端で数えると1行でも2になる。行は下ぞろえなので下端は揃う。
			bandRows: new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().bottom))).size,
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
	assert(pcTabs.rows === '1' && pcTabs.count === axisCount && pcTabs.clipped === 0 && !pcTabs.hScroll,
		'deck: PC幅では全' + axisCount + '軸のタブが1行に収まり、どれも欠けない', pcTabs);

	/* **「1行に収まっている」ことを、属性だけでなく実際の並びからも見る**（70セッション目・段3）。
	   軸を足したりラベルを長くしたりして入りきらなくなると、製品側が
	   `data-usd-rows="multi"`（角丸ボタンの格子）へ落とすので、上の `rows === '1'` が落ちる。
	   ここではさらに**下端が1種類しか無い＝本当に1段**であることも見る
	   （属性だけ '1' のまま折り返している、という食い違いを捕まえるため）。
	   **幅の px はこの検査に1つも書かない。** モーダルの幅も、タブのラベルの長さも、
	   軸の本数も変わりうるので、書き写すと必ず古くなる。見るのは「いま画面がどう並んでいるか」だけ。
	   ―― 段3 で `max-width` を 42rem から広げたのは、まさにこれを保つため。
	   Step 0 の見立て（45rem）では 13px 足りず、実測して 47rem にした経緯がある。 */
	assert(pcTabs.bandRows === 1,
		'deck: PC幅のタブは本当に1段に並んでいる（下端が1種類）', pcTabs);

	// --- 375px：1行に入らないので角丸ボタンの多段へ切り替わる ---
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(600);
	const narrowTabs = await tabLayout();
	assert(narrowTabs.rows === 'multi', 'deck: 375px では多段レイアウトに切り替わる', narrowTabs);
	assert(narrowTabs.count === axisCount && narrowTabs.clipped === 0 && !narrowTabs.hScroll,
		'deck: 375px でも全' + axisCount + '軸のタブが見えていて横スクロールしない', narrowTabs);
	assert(narrowTabs.bandRows > 1, 'deck: 375px では実際に複数段になっている', narrowTabs);
	assert(narrowTabs.pageSw === narrowTabs.pageCw,
		'deck: 375px でモーダルを開いてもページは横スクロールしない', narrowTabs);
	// 多段でもタブとして機能する
	await page.click('.usd-tab[data-usd-axis="' + otherAxis + '"]');
	await page.waitForTimeout(300);
	assert(await panelShown(otherAxis), 'deck: 375px の多段タブでも切り替えられる', otherAxis);

	await page.setViewportSize({ width: 1280, height: 900 });
	await page.waitForTimeout(600);
	assert((await tabLayout()).rows === '1', 'deck: PC幅へ戻すと1行レイアウトに戻る');

	/* --- 選択肢は**3段**で頭打ち。続きは**箱の外**の「▼ ほか N件」で示す（70セッション目・段4） ---

	   それまでは「2行＋3行目が4分の3ほど覗く」高さで、続きは**箱の下端に重なる半透明の帯**
	   （data-more-below のフェード）で示していた。**覗いている 24px のうち 20px がその帯の下**にあり、
	   素の色で見えていたのは上から 4px だけで、いちばん下の選択肢が読めなかった。
	   段4 で (1) 高さを3段ちょうどにし (2) 合図を箱の外へ出した。
	   **ここで見るのは「高さが何 px か」ではなく「読める状態か」**
	   ―― px を書き写すと、チップの余白を触った瞬間に嘘になる。 */
	const optState = (axis) => page.evaluate((a) => {
		const panel = document.querySelector('.usd-tabpanel[data-usd-axis="' + a + '"]');
		const opts = panel.querySelector('.usd-opts');
		const box = panel.querySelector('[data-usd-el="opts-more"]');
		const btn = box.querySelector('.usd-opts-more-btn');
		const optsRect = opts.getBoundingClientRect();
		const rowTop = (c) => Math.round(c.offsetTop);
		const bottom = opts.scrollTop + opts.clientHeight;
		// いま「丸ごと」見えている段（上にも下にもはみ出していないもの）
		const shown = [...opts.children].filter((c) =>
			c.offsetTop >= opts.scrollTop - 1 && c.offsetTop + c.offsetHeight <= bottom + 1);
		// いちばん下に見えている段のチップが、箱の矩形からはみ出していないか（切れて読めないか）
		const lastTop = shown.length ? Math.max(...shown.map(rowTop)) : null;
		const lastRow = shown.filter((c) => rowTop(c) === lastTop);
		const clippedAtBottom = lastRow.filter((c) =>
			c.getBoundingClientRect().bottom > optsRect.bottom + 1).length;
		// 最下段のチップに何かが重なっていないか（真ん中の点を拾って、自分自身か中の要素であること）。
		const overlapped = lastRow.filter((c) => {
			const r = c.getBoundingClientRect();
			const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.bottom - 4));
			return !(el === c || c.contains(el));
		}).length;
		/* **重なりの検査はこれだけでは足りない。** もとの不具合（段4 で直したもの）は
		   `.usd-opts-wrap::after` の半透明の帯で、`pointer-events: none` だったので
		   `elementFromPoint` には**引っかからない**（実際、この検査だけでは当時の状態を捕まえられない）。
		   擬似要素は DOM から引けないので、箱とその親の ::before / ::after を直接見て、
		   「見えている中身を持つ擬似要素が無いこと」を確かめる。 */
		const overlay = [[opts, '::before'], [opts, '::after'], [opts.parentElement, '::before'], [opts.parentElement, '::after']]
			.filter(([el, sel]) => {
				const cs = getComputedStyle(el, sel);
				return cs.content !== 'none' && cs.visibility !== 'hidden'
					&& cs.display !== 'none' && parseFloat(cs.height || '0') > 0;
			})
			.map(([el, sel]) => (el === opts ? '.usd-opts' : '.usd-opts-wrap') + sel);
		return {
			totalRows: new Set([...opts.children].map(rowTop)).size,
			visibleRows: new Set(shown.map(rowTop)).size,
			hiddenBelow: [...opts.children].filter((c) => c.offsetTop + c.offsetHeight > bottom + 1).length,
			moreState: box.getAttribute('data-more'),
			moreVisible: getComputedStyle(box).visibility === 'visible',
			moreText: btn.textContent.trim(),
			clippedAtBottom, overlapped, overlay,
		};
	}, axis);

	/* **その軸のタブを「選ばれていて、かつ開いている」状態にする。**
	   選択中のタブをもう一度押すと選択肢パネルが閉じるので、無条件に押すと
	   「開いている軸を押して閉じ、見えない選択肢を測る」ことになる（実際にそれで落ちた）。
	   押すのは「まだ選ばれていない」か「閉じている」ときだけ。判定は製品の属性をそのまま読む。 */
	const ensureAxisOpen = async (axis) => {
		const st = await page.evaluate((a) => {
			const tab = document.querySelector('.usd-tab[data-usd-axis="' + a + '"]');
			const box = document.querySelector('[data-usd-el="axis-tabs"]');
			return { selected: tab.getAttribute('aria-selected') === 'true', open: box.getAttribute('data-usd-open') === 'true' };
		}, axis);
		if (st.selected && st.open) return;
		await page.click('.usd-tab[data-usd-axis="' + axis + '"]');
		await page.waitForTimeout(150);
	};

	/* 軸ごとの選択肢の数は **TAG_AXES から取る**（件数を検査に書き写さない）。
	   選択肢が3段に入りきらない軸＝合図が出るはずの軸、を実測で割り出して突き合わせる。 */
	const perAxis = await page.evaluate(() => UmaSkillDeckCore.pickableAxes().map((a) => a.key));
	const optsAll = [];
	for (const key of perAxis) {
		await ensureAxisOpen(key);
		optsAll.push({ key, ...(await optState(key)) });
	}
	// (1) どの軸も、3段までは丸ごと見えている（3段に満たない軸はその段数ぶん全部）
	const rowsOk = optsAll.filter((o) => o.visibleRows !== Math.min(3, o.totalRows));
	assert(rowsOk.length === 0, 'deck(段4): どの軸も3段（それ未満の軸は全段）が丸ごと見えている',
		optsAll.map((o) => o.key + ':' + o.visibleRows + '/' + o.totalRows));
	// (2) いちばん下に見えている段が、切れても何かに重なられてもいない
	const unreadable = optsAll.filter((o) => o.clippedAtBottom > 0 || o.overlapped > 0 || o.overlay.length > 0);
	assert(unreadable.length === 0, 'deck(段4): 最下段の選択肢が切れず、何にも重なられていない',
		unreadable.map((o) => o.key + ' 切れ' + o.clippedAtBottom + ' 重なり' + o.overlapped + ' 覆い' + o.overlay.join(',')));
	// (3) 続きがある軸にだけ合図が出る（出る／出ないを実測の「隠れ件数」と突き合わせる）
	const signalWrong = optsAll.filter((o) => (o.hiddenBelow > 0) !== o.moreVisible);
	assert(signalWrong.length === 0, 'deck(段4): 続きがある軸にだけ「▼ ほか N件」が出る',
		optsAll.map((o) => o.key + ':隠れ' + o.hiddenBelow + (o.moreVisible ? '→' + o.moreText : '→出ない')));
	// (4) 合図の N は、実際に隠れている件数と一致する
	const countWrong = optsAll.filter((o) => o.moreVisible && o.moreText !== '▼ ほか ' + o.hiddenBelow + '件');
	assert(countWrong.length === 0, 'deck(段4): 合図の件数が実際に隠れている数と一致する',
		optsAll.filter((o) => o.moreVisible).map((o) => o.key + ':' + o.moreText + '（実測' + o.hiddenBelow + '）'));

	// パネルの高さは軸をまたいで一定（切り替えても下のスキル一覧が跳ねない）。
	// **合図は場所を取ったまま見えなくなる**ので、出る軸と出ない軸で高さが変わらない。
	const heightOnVenue = await page.evaluate(() => Math.round(document.querySelector('.usd-tabpanels').getBoundingClientRect().height));
	await page.click('.usd-tab[data-usd-axis="distance"]');
	await page.waitForTimeout(300);
	const heightOnDistance = await page.evaluate(() => Math.round(document.querySelector('.usd-tabpanels').getBoundingClientRect().height));
	assert(heightOnVenue === heightOnDistance, 'deck: 軸を替えてもパネルの高さは変わらない', { heightOnVenue, heightOnDistance });

	/* --- 375px：ここで初めて3段に入りきらない軸が出るので、合図の出方と押したときの動きを見る ---
	   **PC幅では合図が1つも出ない**（3段に全部収まる）ので、上の (3)(4) は広い幅では
	   「出ないことの確認」しかしていない。**出る側**は狭い幅でしか通らない。 */
	await page.setViewportSize({ width: 375, height: 812 });
	await page.waitForTimeout(700);
	const narrowOpts = [];
	for (const key of perAxis) {
		await ensureAxisOpen(key);
		narrowOpts.push({ key, ...(await optState(key)) });
	}
	const narrowSignal = narrowOpts.filter((o) => o.moreVisible);
	assert(narrowSignal.length > 0, 'deck(段4): 375px では合図が出る軸が実際にある',
		narrowSignal.map((o) => o.key + ':' + o.moreText));
	const narrowRowsNg = narrowOpts.filter((o) => o.visibleRows !== Math.min(3, o.totalRows));
	assert(narrowRowsNg.length === 0, 'deck(段4): 375px でも3段（それ未満の軸は全段）が丸ごと見えている',
		narrowOpts.map((o) => o.key + ':' + o.visibleRows + '/' + o.totalRows));
	const narrowUnreadable = narrowOpts.filter((o) => o.clippedAtBottom > 0 || o.overlapped > 0 || o.overlay.length > 0);
	assert(narrowUnreadable.length === 0, 'deck(段4): 375px でも最下段が切れず、何にも重なられていない',
		narrowUnreadable.map((o) => o.key + ' 切れ' + o.clippedAtBottom + ' 重なり' + o.overlapped + ' 覆い' + o.overlay.join(',')));
	const narrowWrong = narrowOpts.filter((o) => (o.hiddenBelow > 0) !== o.moreVisible);
	assert(narrowWrong.length === 0, 'deck(段4): 375px でも続きがある軸にだけ合図が出る',
		narrowOpts.map((o) => o.key + ':隠れ' + o.hiddenBelow + (o.moreVisible ? '→' + o.moreText : '→出ない')));

	// 合図を押すと1段ぶん送られて、残りの件数が減る。最後まで送ると合図が消える（場所は残る）。
	// **隠れている数がいちばん多い軸**を選ぶ ―― 1回押しただけで残り0になる軸だと
	// 「押すたびに1段ずつ送られる」ことを確かめられない（選択肢の数は検査に書かないので、実測で選ぶ）。
	// **合図が1つも出ていないときは、ここから先は確かめようがない**ので飛ばす
	// （上の「合図が出る軸が実際にある」が既に落ちている。ここで落ちるのではなく
	//   例外で止まると、後続の検査がまとめて走らなくなる）。
	if (narrowSignal.length === 0) {
		console.log('     （合図が1つも出ていないので、押したときの動きの検査は飛ばした）');
	} else {
	const signalAxis = narrowSignal.slice().sort((a, b) => b.hiddenBelow - a.hiddenBelow)[0].key;
	await ensureAxisOpen(signalAxis);
	const before = await optState(signalAxis);
	await page.click('[data-usd-act="opts-more"][data-usd-axis="' + signalAxis + '"]');
	await page.waitForTimeout(300);
	const after = await optState(signalAxis);
	/* **「残り0にならない」は、もう前提にできない**（71セッション目・段8）。
	   段5 までは選択肢が21個（レース環境）・17個（レース場）の軸があり、1回送っても必ず残った。
	   段8 でその2軸を絞り込みから隠し、いちばん多い軸でも11個（効果タイプ）になったので、
	   **375px では1回の送りで残り0になる**。見るのは「減ること」と「表示が実測と合うこと」。 */
	assert(after.hiddenBelow < before.hiddenBelow,
		'deck(段4): 合図を押すと1段ぶん送られ、残りが減る', { 軸: signalAxis, 前: before.moreText, 後: after.moreText });
	assert(after.hiddenBelow > 0
		? after.moreText === '▼ ほか ' + after.hiddenBelow + '件'
		: !after.moreVisible,
		'deck(段4): 送ったあとも表示が実測と合っている（残り0なら合図が消える）',
		{ 残り: after.hiddenBelow, 文字: after.moreText, 見えている: after.moreVisible });
	assert(after.clippedAtBottom === 0 && after.overlapped === 0 && after.overlay.length === 0,
		'deck(段4): 送った先でも最下段が切れず、何にも重なられていない', after);
	const moreBox = () => page.evaluate((a) => {
		const box = document.querySelector('.usd-tabpanel[data-usd-axis="' + a + '"] [data-usd-el="opts-more"]');
		const r = box.getBoundingClientRect();
		return { visibility: getComputedStyle(box).visibility, height: Math.round(r.height) };
	}, signalAxis);
	const boxBefore = await moreBox();
	await page.evaluate((a) => {
		const opts = document.querySelector('.usd-tabpanel[data-usd-axis="' + a + '"] .usd-opts');
		opts.scrollTop = opts.scrollHeight;
	}, signalAxis);
	await page.waitForTimeout(300);
	const end = await optState(signalAxis);
	const boxAfter = await moreBox();
	assert(end.hiddenBelow === 0 && !end.moreVisible,
		'deck(段4): 下まで送ると合図が消える', end);
	assert(boxAfter.height === boxBefore.height && boxAfter.height > 0,
		'deck(段4): 合図が消えても場所は残る（下の一覧が跳ねない）', { boxBefore, boxAfter });
	}

	/* --- 選択中のタブをもう一度押すと、選択肢パネルが畳める（70セッション目・段4 の続き） ---
	   段4 で選択肢を3段にしたぶん、狭い画面で下のスキル一覧が押し下げられるので畳めるようにした。
	   見るのは4つ ―― 閉じる／別のタブで開く／閉じている間も条件が効いたまま／開き直して復元される。
	   **閉じている間も「どの軸に何が入っているか」が読めること**（タブの件数バッジと
	   「絞り込み中」の行）も、選択肢が見えなくなるぶん一緒に見る。 */
	const panelState = () => page.evaluate(() => {
		const box = document.querySelector('[data-usd-el="axis-tabs"]');
		const panels = document.querySelector('[data-usd-el="tabpanels"]');
		const tab = document.querySelector('.usd-tab[aria-selected="true"]');
		const results = document.querySelector('[data-usd-el="results"]');
		const body = document.querySelector('[data-usd-el="picker-body"]');
		const modal = document.querySelector('.usd-modal-panel');
		const rr = results.getBoundingClientRect(), br = body.getBoundingClientRect(), mr = modal.getBoundingClientRect();
		/* **見えている行を数える。** 高さの px ではなく「一度に何件見えるか」がこの機能の目的
		   （選択肢パネルを畳んで、スキルを一度に多く見られるようにする）。
		   一覧の箱にも、本文のスクロール域にも、丸ごと収まっている行だけを数える。 */
		const rows = [...results.querySelectorAll('.usd-row')];
		const top = Math.max(rr.top, br.top), bottom = Math.min(rr.bottom, br.bottom);
		const visibleRows = rows.filter((r) => {
			const q = r.getBoundingClientRect();
			return q.top >= top - 1 && q.bottom <= bottom + 1;
		}).length;
		return {
			open: box.getAttribute('data-usd-open'),
			expanded: tab.getAttribute('aria-expanded'),
			panelsH: Math.round(panels.getBoundingClientRect().height),
			axis: tab.dataset.usdAxis,
			count: document.querySelector('[data-usd-el="result-count"]').textContent,
			// 閉じている間も見えていてほしいもの
			badges: [...document.querySelectorAll('[data-usd-el="axis-count"]')].filter((b) => !b.hidden)
				.map((b) => b.dataset.usdAxis + ':' + b.textContent),
			summary: document.querySelector('[data-usd-el="filter-summary"]').textContent.replace(/\s+/g, ' ').trim(),
			summaryH: Math.round(document.querySelector('[data-usd-el="filter-summary"]').getBoundingClientRect().height),
			// 一覧のうち、本文のスクロール域の中で実際に見えている高さ／見えている行数／箱そのものの高さ
			listVisible: Math.max(0, Math.round(bottom - top)),
			listBoxH: Math.round(rr.height),
			visibleRows,
			rowCount: rows.length,
			// モーダルが動いていないか（押すたびに上下すると落ち着かない）
			modal: { top: Math.round(mr.top), bottom: Math.round(mr.bottom), h: Math.round(mr.height) },
		};
	});
	// 条件を1つ入れてから畳む（閉じても効いたままかを見る）。距離は既定で開いている軸
	await ensureAxisOpen('distance');
	await page.click('[data-usd-el="filter-check"][data-axis="distance"][data-value="long"]');
	await page.waitForTimeout(400);
	const panelOpen375 = await panelState();
	// (1) 選択中のタブをもう一度押すと閉じる
	await page.click('.usd-tab[data-usd-axis="distance"]');
	await page.waitForTimeout(400);
	const panelClosed375 = await panelState();
	assert(panelClosed375.open === 'false' && panelClosed375.panelsH === 0 && panelClosed375.expanded === 'false',
		'deck(畳み): 選択中のタブをもう一度押すと選択肢パネルが閉じる', panelClosed375);
	// (3) 閉じても条件は効いたまま。件数・バッジ・「絞り込み中」の行が変わらない
	assert(panelClosed375.count === panelOpen375.count && panelOpen375.count !== '445件',
		'deck(畳み): 閉じても絞り込みの結果は変わらない', { 開: panelOpen375.count, 閉: panelClosed375.count });
	assert(JSON.stringify(panelClosed375.badges) === JSON.stringify(panelOpen375.badges) && panelClosed375.badges.length > 0,
		'deck(畳み): 閉じてもタブの件数バッジは見えている', panelClosed375.badges);
	assert(panelClosed375.summary === panelOpen375.summary && panelClosed375.summaryH > 0,
		'deck(畳み): 閉じても「絞り込み中」の行は見えている', panelClosed375.summary);
	/* **閉じたら「一度に見えるスキルの件数」が増えること。**
	   これがこの機能の目的なので、高さの px ではなく**行数**で見る。
	   px は検査に書かない（開く前と閉じたあとの実測どうしを比べる）。 */
	assert(panelClosed375.visibleRows > panelOpen375.visibleRows && panelClosed375.listBoxH > panelOpen375.listBoxH,
		'deck(畳み): 375px では閉じると一覧が広がり、一度に見える件数が増える',
		{ 開: panelOpen375.visibleRows + '行', 閉: panelClosed375.visibleRows + '行',
			箱: panelOpen375.listBoxH + '→' + panelClosed375.listBoxH });
	/* **モーダルの高さと位置が動かないこと。**
	   素の作りではモーダルは下ぞろえで中身の量で高さが決まるので、選択肢パネルが消えたぶん
	   **モーダルが縮むだけ**で一覧は広がらなかった（最初の実装がそれで、実機で分かった）。
	   いまは消えたぶんを一覧の上限へ足しているので、中身の合計が変わらず、上端も下端も動かない。 */
	assert(panelClosed375.modal.h === panelOpen375.modal.h
		&& panelClosed375.modal.top === panelOpen375.modal.top
		&& panelClosed375.modal.bottom === panelOpen375.modal.bottom,
		'deck(畳み): 375px で閉じてもモーダルの高さと上下の位置が動かない',
		{ 開: panelOpen375.modal, 閉: panelClosed375.modal });
	// (2) 閉じた状態から別のタブを押すと、そのタブが選ばれて開く
	await page.click('.usd-tab[data-usd-axis="style"]');
	await page.waitForTimeout(400);
	const panelReopen = await panelState();
	assert(panelReopen.open === 'true' && panelReopen.axis === 'style' && panelReopen.panelsH > 0,
		'deck(畳み): 閉じた状態から別のタブを押すと、そのタブが選ばれて開く', panelReopen);
	// 開いたときに「▼ ほか N件」が正しい状態へ戻る（畳んでいる間は測れないので測り直している）
	// **合図が出る軸を実測から選ぶ**（軸の名前を検査に決め打ちしない）。出る軸が無ければ飛ばす。
	const reopenAxis = narrowSignal.length
		? narrowSignal.slice().sort((a, b) => b.hiddenBelow - a.hiddenBelow)[0].key
		: panelReopen.axis;
	await ensureAxisOpen(reopenAxis);
	if (narrowSignal.length) {
		// この軸は上の検査で下まで送ってあるので、先頭へ戻してから見る
		// （「開き直したときに測り直せているか」を見たいのであって、送った先の状態を見たいのではない）
		await page.evaluate((a) => {
			document.querySelector('.usd-tabpanel[data-usd-axis="' + a + '"] .usd-opts').scrollTop = 0;
		}, reopenAxis);
		await page.waitForTimeout(300);
		const moreAfterReopen = await optState(reopenAxis);
		assert(moreAfterReopen.moreVisible && moreAfterReopen.moreText === '▼ ほか ' + moreAfterReopen.hiddenBelow + '件',
			'deck(畳み): 開き直したあとも合図の件数が実測と合う', moreAfterReopen);
	}
	// (4) 閉じたままモーダルを閉じて開き直すと、閉じた状態が復元される
	await page.click('.usd-tab[data-usd-axis="' + reopenAxis + '"]');   // 選択中を押して閉じる
	await page.waitForTimeout(300);
	await page.evaluate(() => UmaSkillDeckCore.closeSkillPicker());
	await page.waitForTimeout(300);
	// **開き直しは呼び出し元の入口から**（`openSkillPicker([], …)` を直に呼ぶと、
	// 比較シートが渡している除外IDが消えて、このあとの「総数がボタンに出る」検査が狂う）。
	await page.click('button[onclick="openRecordSkillPicker()"]');
	await page.waitForTimeout(900);
	const panelAfterReopenModal = await panelState();
	assert(panelAfterReopenModal.open === 'false' && panelAfterReopenModal.panelsH === 0,
		'deck(畳み): 閉じた状態はモーダルを開き直しても復元される', panelAfterReopenModal);
	// 開いた状態に戻して先へ進む（このあとの検査は開いている前提）
	await page.click('.usd-tab[data-usd-axis="distance"]');
	await page.waitForTimeout(400);
	assert((await panelState()).open === 'true', 'deck(畳み): もう一度押すと開き直せる');

	await page.setViewportSize({ width: 1280, height: 900 });
	await page.waitForTimeout(600);
	const panelOpen1280 = await panelState();
	await page.click('.usd-tab[data-usd-axis="' + panelOpen1280.axis + '"]');
	await page.waitForTimeout(400);
	const panelClosed1280 = await panelState();
	assert(panelClosed1280.open === 'false' && panelClosed1280.panelsH === 0,
		'deck(畳み): 1280px でも閉じられる', panelClosed1280);
	// PC幅でも同じ ―― 一度に見える件数が増え、モーダルの高さと位置は動かない
	assert(panelClosed1280.visibleRows > panelOpen1280.visibleRows && panelClosed1280.listBoxH > panelOpen1280.listBoxH,
		'deck(畳み): 1280px でも閉じると一覧が広がり、一度に見える件数が増える',
		{ 開: panelOpen1280.visibleRows + '行', 閉: panelClosed1280.visibleRows + '行',
			箱: panelOpen1280.listBoxH + '→' + panelClosed1280.listBoxH });
	assert(panelClosed1280.modal.h === panelOpen1280.modal.h
		&& panelClosed1280.modal.top === panelOpen1280.modal.top
		&& panelClosed1280.modal.bottom === panelOpen1280.modal.bottom,
		'deck(畳み): 1280px で閉じてもモーダルの高さと上下の位置が動かない',
		{ 開: panelOpen1280.modal, 閉: panelClosed1280.modal });
	// 開いた状態に戻して先へ進む（このあとの検査は開いている前提）。
	// **絞り込みの条件は (4) でモーダルを開き直した時点で消えている**ので、ここでは何も解除しない。
	await page.click('.usd-tab[data-usd-axis="' + panelClosed1280.axis + '"]');
	await page.waitForTimeout(400);
	await ensureAxisOpen('distance');

	/* --- 段6【3】絞り込み結果が少なくても、モーダルの縦幅が動かない（71セッション目） ---

	   直す前は `.usd-results` が `max-height` だったので、**中身が上限より短いと箱ごと縮み、
	   モーダルは下ぞろえなので上端だけがせり上がった**（実測: 1280px で 445件 757px → 1件 508px）。
	   件数が変わるたびに窓の大きさが変わるのが読みにくい、という指摘を受けて `height` にした。

	   **件数は検査に書かない。** いま一覧に出ているものを「追加済み」として人工的に減らし、
	   **減らす前と後の実測どうし**を比べる（マスターが増減しても落ちない）。
	   減らす件数は「1行の高さ × これ」より確実に短くなるところまで下げれば足りる。

	   【2026-09-30・段3b で手段を替えた】これまでは `setPickerHiddenIds`（「本育成スキルを除外する」で隠すID）で減らしていた。
	   段3b で、除外中の行は**一覧から消えずにグレーアウトで残る**ようになり、隠しても行が減らなくなった。
	   この検査の目的は「行数が変わっても窓の大きさが動かない」ことなので、**行数を実際に減らせる別の手段**
	   （`openSkillPicker` に渡す「追加済みのID」。追加済みは一覧から消える）に替えた。目的は変わらない。 */
	{
		/* 一覧の先頭 n 件だけを残して、残りを「追加済み」として渡す（追加済みのものは一覧から消える）。
		   毎回いったん全件を描き直してから読むので、前回の結果には引きずられない。
		   受け皿は呼び出し元（deck.js）の `recordSkillSink()` をそのまま使う。 */
		const shrinkTo = async (n) => {
			await page.evaluate((k) => {
				const listed = () => [...document.querySelectorAll('[data-usd-el="results"] [data-usd-el="skill-check"]')]
					.map((e) => e.value);
				UmaSkillDeckCore.setPickerHiddenIds([]);
				openRecordSkillPicker();          // 母集団を全件描き直す
				const all = listed();
				UmaSkillDeckCore.openSkillPicker(draftRecord.skillIds.concat(all.slice(k)), recordSkillSink());   // 残す k 件で描き直す
			}, n);
			await page.waitForTimeout(400);
		};
		const restore = async () => {
			await page.evaluate(() => { UmaSkillDeckCore.setPickerHiddenIds([]); openRecordSkillPicker(); });
			await page.waitForTimeout(400);
		};

		for (const width of [1280, 375]) {
			await page.setViewportSize({ width, height: 900 });
			await page.waitForTimeout(400);
			await restore();
			await ensureAxisOpen('distance');
			const full = await panelState();
			assert(full.rowCount > 20, 'deck(段6【3】): ' + width + 'px の基準は一覧が上限まで埋まっている状態', full.rowCount + '行');

			// 6件・1件・0件のどれでも、モーダルの高さ・上端・下端と、一覧の箱の高さが基準と同じ
			for (const n of [6, 1, 0]) {
				await shrinkTo(n);
				const few = await panelState();
				assert(few.rowCount === n, 'deck(段6【3】): ' + width + 'px で一覧を ' + n + '件まで減らせた', few.rowCount);
				assert(few.modal.h === full.modal.h && few.modal.top === full.modal.top && few.modal.bottom === full.modal.bottom,
					'deck(段6【3】): ' + width + 'px で結果が ' + n + '件でもモーダルの高さと上下の位置が動かない',
					{ 基準: full.modal, 件数を減らした後: few.modal });
				assert(few.listBoxH === full.listBoxH,
					'deck(段6【3】): ' + width + 'px で結果が ' + n + '件でも一覧の箱の高さが動かない',
					{ 基準: full.listBoxH, 減らした後: few.listBoxH });

				/* 0件のときは「条件に一致するスキルがありません。」を**箱の中央**に置く（段7・案ア）。
				   高さを固定したぶん、文が上端に張り付くと下に 240px の空白が残るため。
				   **px は書かない** ―― 文の中心と箱の中心のズレで見る（フォントが変わっても成り立つ）。 */
				if (n === 0) {
					const empty = await page.evaluate(() => {
						const box = document.querySelector('[data-usd-el="results"]');
						const msg = box.querySelector('p');
						if (!msg) return null;
						const b = box.getBoundingClientRect(), m = msg.getBoundingClientRect();
						return {
							text: msg.textContent.trim(),
							ズレ: Math.round(Math.abs((m.top + m.bottom) / 2 - (b.top + b.bottom) / 2)),
							上の空き: Math.round(m.top - b.top),
							下の空き: Math.round(b.bottom - m.bottom),
							箱: Math.round(b.height),
						};
					});
					assert(empty && empty.text.length > 0, 'deck(段7 案ア): ' + width + 'px で0件のときは文が1つだけ出る', empty);
					assert(empty && empty.ズレ <= 2,
						'deck(段7 案ア): ' + width + 'px で0件の文が箱の中央にある', empty);
					assert(empty && empty.上の空き > 20 && empty.下の空き > 20,
						'deck(段7 案ア): ' + width + 'px で空白が上下に分かれている（上端に張り付いていない）', empty);
				}
			}

			/* **段4 の「畳んだぶんを一覧が受け取る」仕組みと競合しないこと。**
			   `--usd-results-extra` の足し算は残したままなので、**結果が少なくても畳めば箱は広がり、
			   モーダルは動かない**。ここが崩れると、高さを固定した副作用で畳みの意味が消える。 */
			await shrinkTo(1);
			const fewOpen = await panelState();
			await page.click('.usd-tab[data-usd-axis="' + fewOpen.axis + '"]');   // 選択中を押して畳む
			await page.waitForTimeout(400);
			const fewClosed = await panelState();
			assert(fewClosed.open === 'false' && fewClosed.listBoxH > fewOpen.listBoxH,
				'deck(段6【3】): ' + width + 'px で結果が1件でも、畳めば一覧の箱は広がる（--usd-results-extra が効いている）',
				{ 箱: fewOpen.listBoxH + '→' + fewClosed.listBoxH });
			assert(fewClosed.modal.h === fewOpen.modal.h && fewClosed.modal.top === fewOpen.modal.top,
				'deck(段6【3】): ' + width + 'px で結果が1件でも、畳んでモーダルは動かない',
				{ 開: fewOpen.modal, 閉: fewClosed.modal });
			await page.click('.usd-tab[data-usd-axis="' + fewClosed.axis + '"]');   // 開き直す
			await page.waitForTimeout(400);
		}

		// 片付け（このあとの検査は 1280px・隠しなし・開いている前提）
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.waitForTimeout(400);
		await restore();
		await ensureAxisOpen('distance');
	}

	/* --- 段8 絞り込みの規則が効いていること ---
	   件数の突き合わせは `npm run test:master` が持つ（マスターの生データから期待値を組み立てる）。
	   ここでは**性質だけ**を見る ―― `test:master` は pre-push の関門に入っていないので、
	   規則が丸ごと外れたことにはこちらでも気づけるようにしておく。
	   **軸のキーも値も検査に書かない。** 製品の `TAG_AXES` の印から取る。

	   **ここには 70セッション目・段5 の⑤（オプトイン）の検査があった。**
	   71セッション目・段8 で門番の仕組みごと廃したので外した（黙って消さず記録を残す）。 */
	{
		const marks = await page.evaluate(() => UmaSkillDeckCore.TAG_AXES.map((a) => ({
			key: a.key, label: a.label, emptyNone: !!a.emptyMeansNone,
			exclusive: !!a.exclusive, hidden: !!a.hiddenAxis, poolExcluded: !!a.poolExcluded,
			opts: a.options.map((o) => o.v),
		})));
		assert(marks.every((a) => a.optIn === undefined), 'deck(段8): optIn（段5 の門番）の印はもう無い');
		// 隠すのと母集団から外すのは別物（印を1つにまとめたら落ちる）
		const hidden = marks.filter((a) => a.hidden);
		const excluded = marks.filter((a) => a.poolExcluded);
		assert(hidden.length > excluded.length && excluded.every((a) => a.hidden),
			'deck(段8): 母集団から外す軸は隠す軸の一部（両者は別の印）',
			{ 隠す: hidden.map((a) => a.key), 外す: excluded.map((a) => a.key) });

		// 隠す軸はタブにもチェックにも出ない
		const shownKeys = await page.evaluate(() =>
			[...document.querySelectorAll('.usd-tab')].map((t) => t.dataset.usdAxis));
		assert(hidden.every((a) => !shownKeys.includes(a.key)),
			'deck(段8): 隠す軸はタブに出ない', { 隠す: hidden.map((a) => a.key), 出ている: shownKeys });

		// 一覧に並んでいるスキルのタグを、製品の getSkillTags() から引いて性質を見る
		// **第2回の段3: タグ付きの拡張スキルも母集団に入った**ので、名前はマスターと拡張スキルの両方から引く。
		// マスターだけから引いていたときは、拡張スキルが「タグが空」に見えて (b) が誤って落ち、
		// 逆に (a) は拡張スキルのパッシブを素通りしていた。引けない名前は `found: false` で返して (c) で落とす。
		const listedTags = (key) => page.evaluate((k) => {
			const names = [...document.querySelectorAll('[data-usd-el="results"] .usd-row span')].map((el) => el.textContent);
			const byName = new Map(UmaSkillDeckCore.getMasterSkills().map((s) => [s.name, s]));
			for (const x of UmaSkillDeckCore.getExtraCatalog()) if (x.tags && !byName.has(x.name)) byName.set(x.name, x);
			return names.map((n) => {
				const s = byName.get(n);
				return { name: n, found: !!s, vals: s ? (UmaSkillDeckCore.getSkillTags(s.id)[k] || []) : [] };
			});
		}, key);
		/* (c) 一覧のスキルは、どれもマスターかタグ付きの拡張スキルとして引ける（引けないと (a)(b) が空振りする） */
		{
			const notFound = (await listedTags('passive')).filter((r) => !r.found).map((r) => r.name);
			assert(notFound.length === 0, 'deck(段8): 「条件で検索」の一覧のスキルは、どれもタグを引ける', notFound.slice(0, 5));
		}

		/* (a) 母集団から外した軸のスキルは、条件を何も入れていなくても1件も出ない */
		for (const ex of excluded) {
			const leaked = (await listedTags(ex.key)).filter((r) => r.vals.length > 0).map((r) => r.name);
			assert(leaked.length === 0,
				'deck(段8): ' + ex.label + ' のスキルは「条件で検索」に1件も出ない', leaked.slice(0, 5));
		}
		const excludedCount = await page.evaluate(() => UmaSkillDeckCore.getPoolExcludedSkills().length);
		assert(excludedCount > 0, 'deck(段8): 母集団から外したスキルが実在する（空振りの検査ではない）', excludedCount);

		/* (b) ③④ 空を「該当なし」と読む軸を1つ選ぶと、その軸が空のスキルは出ない。
		   **2026-09-25（C-89）: 印の付いた軸を全部回す形にした**（効果タイプ・フェーズ・コース位置・その他）。
		   それまでは最初の1本（フェーズ）しか見ておらず、効果タイプに印を足すと見る軸が入れ替わるだけだった。
		   **回す軸は製品の印ではなく、ここに持つ名簿から選ぶ**（`test:master` の `EMPTY_NONE_AXES` と同じ理由）。
		   製品の印から選ぶと、印を外して壊したときにその軸が回す対象から消えるだけで、検査が空振りする
		   （実際、フェーズの印を外しても落ちなかった）。この塊で軸のキーを書くのはここだけ。 */
		// 2026-09-26（C-94・C-95）: 距離の目安を足した。
		const EMPTY_NONE_KEYS = ['effect', 'phase', 'coursePos', 'distanceMark', 'scenario'];
		const flaggedKeys = marks.filter((a) => a.emptyNone).map((a) => a.key);
		assert(EMPTY_NONE_KEYS.slice().sort().join() === flaggedKeys.slice().sort().join(),
			'deck(段8③④): 空を「該当なし」と読む印が付いた軸が名簿と一致', { 名簿: EMPTY_NONE_KEYS, 製品: flaggedKeys });
		const emptyNoneAxes = marks.filter((a) => EMPTY_NONE_KEYS.includes(a.key) && !a.hidden);
		assert(emptyNoneAxes.length === EMPTY_NONE_KEYS.length,
			'deck(段8③④): 名簿の軸がどれも画面に出ている（空振りの検査ではない）', emptyNoneAxes.map((a) => a.key));
		for (const emptyNoneAxis of emptyNoneAxes) {
			await ensureAxisOpen(emptyNoneAxis.key);
			/* **2026-09-25（C-90）: 選ぶ値を `opts[0]` 固定から「一覧に1件以上出る最初の値」に変えた。**
			   足したばかりでデータにまだ当たりが無い値が先頭に来ると、`rows.length > 0` が落ちていた。
			   画面にチェックボックスが無い値（利用者に選ばせない値）は飛ばす。並び順と検査を切り離す。 */
			let picked = null;
			let rows = [];
			for (const v of emptyNoneAxis.opts) {
				const sel = '[data-usd-el="filter-check"][data-axis="' + emptyNoneAxis.key + '"][data-value="' + v + '"]';
				if (!(await page.$(sel))) continue;
				await page.click(sel);
				await page.waitForTimeout(400);
				rows = await listedTags(emptyNoneAxis.key);
				if (rows.length > 0) { picked = sel; break; }
				await page.click(sel);
				await page.waitForTimeout(400);
			}
			const blank = rows.filter((r) => r.vals.length === 0).map((r) => r.name);
			assert(picked !== null && rows.length > 0 && blank.length === 0,
				'deck(段8③④): ' + emptyNoneAxis.label + ' を選ぶと、その軸のタグが空のスキルは出ない',
				{ 選んだ: picked && picked.replace(/.*data-value="([^"]+)".*/, '$1'), 出た件数: rows.length, 空のまま出たもの: blank.slice(0, 5) });
			if (picked) {
				await page.click(picked);
				await page.waitForTimeout(400);
			}
		}

		/* (c) バ場の排他 ―― 片方を選ぶと、もう片方の値を持つスキルが1件も出ない。
		   その軸のタグが**無い**スキルは出る（空を「該当なし」と読む軸との違い）。 */
		/* **空振りにしないための見張り。** 排他の軸を隠してしまうと下のループが0周になり、
		   壊れていても素通りする（段8 の破壊確認で実際にそうなった）。 */
		const exclusiveShown = marks.filter((a) => a.exclusive && !a.hidden);
		assert(exclusiveShown.length > 0, 'deck(段8): 排他の軸が画面に出ている（空振りの検査ではない）',
			marks.filter((a) => a.exclusive).map((a) => a.key + (a.hidden ? '（隠れている）' : '')));
		for (const ex of exclusiveShown) {
			assert(ex.opts.length >= 2, 'deck(段8): 排他の軸に選択肢が2つ以上ある', ex);
			for (const pick of ex.opts) {
				await ensureAxisOpen(ex.key);
				await page.click('[data-usd-el="filter-check"][data-axis="' + ex.key + '"][data-value="' + pick + '"]');
				await page.waitForTimeout(400);
				const rows = await listedTags(ex.key);
				const others = ex.opts.filter((v) => v !== pick);
				const leaked = rows.filter((r) => r.vals.some((v) => others.includes(v))).map((r) => r.name);
				assert(leaked.length === 0,
					'deck(段8排他): ' + ex.label + '＝' + pick + ' を選ぶと、それ以外の値を持つスキルは出ない',
					leaked.slice(0, 5));
				assert(rows.some((r) => r.vals.length === 0),
					'deck(段8排他): ' + ex.label + ' のタグが無いスキルは出る（' + pick + '）', rows.length);
				await page.click('[data-usd-el="filter-check"][data-axis="' + ex.key + '"][data-value="' + pick + '"]');
				await page.waitForTimeout(400);
			}
		}
		await ensureAxisOpen('distance');
	}

	/* --- 「条件でスキルを検索」のときは8軸フィルターだけが出ている --- */
	const modeState = () => page.evaluate(() => {
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		return {
			title: el('picker-title').textContent,
			filter: !el('mode-filter').hidden,
			paste: !el('mode-paste').hidden,
			custom: !!el('mode-custom'),
			commit: !el('picker-commit').hidden
		};
	});
	const filterMode = await modeState();
	assert(filterMode.filter && !filterMode.paste && !filterMode.custom && filterMode.commit,
		'deck: 条件で検索のときは8軸フィルターだけが出る', filterMode);
	assert(/^条件で検索/.test(filterMode.title), 'deck: 見出しが「条件で検索」', filterMode.title);

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

	/* --- スキルを足す入口は3つ（2026-09-27 に「未収録スキルを追加」を廃止）。それぞれ別のモードでモーダルが開く ---
	   **この並びは uma-skill-deck.html が自前で持っている**（core の .usd-entry-row を通らない）ので、
	   文言を変えるときに core 側だけ直すと、ここで気づける（71セッション目・段6 で実際に両方直した）。
	   72セッション目・段9 で「緑スキルを追加」が2番目に入った（core の並びと同じ位置）。

	   **拾い方を「入口の行に居るボタン」に変えた。** それまでは文字列の当てはめ（/検索|未収録/）で
	   拾っていたので、**「緑スキルを追加」を足しても1つも引っかからず、検査は3件のまま通った**
	   ―― 新しい入口を足したことに気づけない形だった（段9 で実際にそうなった）。 */
	const entries = await page.evaluate(() =>
		[...document.querySelectorAll('#record-editor-view .uma-btn.deck-pill-btn')].map((b) => {
			// 件数の脇（#record-passive-added）は抜いた本体で見る（件数は下で別に見る）
			const added = b.querySelector('#record-passive-added');
			return b.textContent.replace(added ? added.textContent : '', '').trim();
		}));
	// 2026-09-27（C-100）に4つ目の「未収録スキルを追加」を廃止した（core の並びと同時に）
	assert(entries.join(',') === '条件で検索,緑スキル,テキストで検索',
		'deck: 比較シート編集に3つの入口ボタンが並ぶ（core の .usd-entry-row と同じ顔ぶれ・同じ順）', entries);

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

	/* 段9: 比較シート編集の「緑スキルを追加」も同じモードで開き、その場でシートへ入る。
	   **入口は uma-skill-deck.html の自前の並び**なので、core 側に足しただけでは動かない。 */
	await page.click('button[onclick="openRecordPassivePicker()"]');
	await page.waitForTimeout(700);
	/* **チェックの前後は別の呼び出しに分ける。** 1つの evaluate の中で押して読むと、
	   その間にレイアウトが走らないので**スクロール位置が崩れていても崩れて見えない**
	   （実際、段9 の破壊確認で「スクロールを戻す1行を消しても素通り」した）。 */
	const deckSheet = () => page.evaluate(() => UmaSkillDeckCore.findRecord(draftRecord.recordId).skillIds.slice());
	const passiveBox = () => page.evaluate(() => ({
		scroll: document.querySelector('[data-usd-el="passive-results"]').scrollTop,
		listed: document.querySelectorAll('[data-usd-el="passive-check"]').length,
		expect: UmaSkillDeckCore.getPoolExcludedSkills().length,
		title: document.querySelector('[data-usd-el="picker-title"]').textContent,
	}));
	// 一覧の下端まで送ってから、そこに居るスキルを押す（67件あるので、先頭へ戻ると実害が大きい）
	const passiveTarget = await page.evaluate(() => {
		const box = document.querySelector('[data-usd-el="passive-results"]');
		box.scrollTop = box.scrollHeight;
		const rows = [...document.querySelectorAll('[data-usd-el="passive-check"]')];
		return (rows.reverse().find((r) => !r.checked) || {}).value;
	});
	const deckBefore = await deckSheet();
	const boxBefore = await passiveBox();
	await page.click('[data-usd-el="passive-check"][value="' + passiveTarget + '"]');
	await page.waitForTimeout(400);
	const deckAdded = await deckSheet();
	// **押すたびに一覧を作り直す**ので、外すときは要素を引き直す（掴んだままだと2度目が効かない）
	await page.click('[data-usd-el="passive-check"][value="' + passiveTarget + '"]');
	await page.waitForTimeout(400);
	const deckRemoved = await deckSheet();
	assert(boxBefore.title === '緑スキルを追加' && boxBefore.listed === boxBefore.expect
		&& deckAdded.length === deckBefore.length + 1 && deckAdded.includes(passiveTarget)
		&& deckRemoved.join() === deckBefore.join(),
		'deck(段9): 比較シート編集の「緑スキルを追加」でも、チェックがその場でシートへ効く',
		{ 一覧: boxBefore, 前: deckBefore.length, 後: deckAdded.length, 戻し: deckRemoved.length });
	/* **スクロール位置の検査はここに置かない。**
	   押しても位置が保たれることは実測したが（1405px のまま）、**壊しても落ちない**
	   ―― Chrome は「同じ高さの中身で innerHTML を入れ替えただけ」では scrollTop を動かさないので、
	   core 側で位置を戻す2行を消しても結果が変わらない（`output/scratch/step9-scroll-probe.mjs`）。
	   **通るだけの検査になるので足さない。** 事情は core の renderPassiveList のコメント。 */
	await page.click('[data-usd-act="picker-close"]');
	await page.waitForTimeout(400);

	/* 【INTENTIONALLY_REMOVED・2026-09-27（C-100）】ここには「未収録スキルを追加」（手入力でカスタムスキルを作る）
	   の検査があった（手入力欄だけを出す・見出し・確定ボタンとフッターを出さない・出す軸ぶんのタグ入力・隠す軸は出ない）。
	   入口ごと廃止した。廃止したこと（ボタンも手入力の枠も無いこと）は、上の入口の並びと「カスタムスキルの廃止」の塊が見る。 */
	assert(!(await page.$('button[onclick="openRecordCustomSkill()"]')) && !(await page.$('[data-usd-el="mode-custom"]')),
		'deck(C-100): 「未収録スキルを追加」のボタンも、手入力の枠も無い');

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
});

/* ============================================================
 * exam.html — 既定は新UI／切り替えの告知モーダル／旧UIとの往復
 *
 * special の C-16 と同じ作法。exam の旧UI／新UIは「画面構成そのもの」の切り替えで、
 * 中身の要素（①②のパネル・結果・結果画像・ガイドの本文）は placeSections() で
 * 置き場の間を移る。「どちらのUIで開くか」と「既読か」が localStorage に残るので、
 * まっさらな文脈を使って通しで見る。閉じ方4通りは文脈を分けて1通りずつ確かめる。
 * ============================================================ */
await block('exam.html — 既定は新UI／切り替えの告知モーダル／旧UIとの往復', async () => {
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
});

/* ============================================================
 * exam.html — 最後に使ったステップのタブを覚える
 *
 * ①（対象スキル）は一度整えたら触らず、以降はほぼ②（画像アップロード）から
 * 操作するので、次に開いたときは最後のタブから始める。
 * 保存が残るかどうかを見るので、まっさらな文脈を使う。
 * ============================================================ */
await block('exam.html — 最後に使ったステップのタブを覚える', async () => {
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
});

/* ============================================================
 * uma-skill-deck.html — OCR受け取り口（2ソース: special / exam）
 *
 * 受け渡しデータはツールごとに別のキー（:special / :exam）。Deck 単独ページで
 * キーに直接 payload を書き、バナーの見出しがツール名で出ること・取り込めること・
 * imported が元のキーへ書き戻ることを見る。両方に未取り込みがあるときは
 * createdAt が新しい方が先に出て、読み込む／閉じるともう一方が続けて出る。
 * special からの受け渡しそのものは special のブロックで見ている。
 * ============================================================ */
await block('uma-skill-deck.html — OCR受け取り口（2ソース: special / exam）', async () => {
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
});

/* ============================================================
 * 失敗時の案内（版ずれ・CDN遮断）が実際に出るか
 * ============================================================ */
await block('失敗時の案内（版ずれ・CDN遮断）が実際に出るか', async () => {
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
});

/* ============================================================
 * 画質の警告帯の文面（common.js の buildImageQualityNotice）
 *
 * 実機で「正当なスクリーンショットが丸ごと足切りされる」不具合を出したあと、
 * 足切りと警告を分け、文面を common.js に集約した経緯がある（2026-09-12）。
 * 文面そのものが利用者への対処方法（ウィンドウを大きくする）を運んでいるので、
 * 崩れても例外が出ず気付けない。ここで本文の作られ方を直接押さえる。
 * ============================================================ */
await block('画質の警告帯の文面（common.js の buildImageQualityNotice）', async () => {
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
});

/* ============================================================
 * 画像結合の中止文（js/stitch.js の stitchBuildAbortNotice / stitchClassifyScreenshotMismatch）
 *
 * 以前はどの理由でも「…標準的なスクリーンショットのサイズ範囲外です。結合済み画像や
 * 加工済み画像がアップロードされた可能性があるため処理を中止します」の1文だけを出していた。
 * ゲーム画面をそのまま撮っただけの人（例: 592x1280）にも身に覚えのない理由を名指しし、
 * どうすれば直るかも書いていなかった（2026-09-13・25セッション目に分岐させた）。
 * 文面そのものが対処方法を運んでいて、崩れても例外が出ないので、ここで直接押さえる。
 * ============================================================ */
await block('画像結合の中止文（js/stitch.js の stitchBuildAbortNotice / stitchClassifyScreenshotMismatch）', async () => {
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
});

/* ============================================================
 * 画像結合の結末の伝え方（special.html）
 *
 * special は anyOutput（エラーの帯を出した場合も true）だけを見て
 * 「画像を結合しました」のトーストを出し、未読の印を立て、引き出しを開いていた。
 * **1枚も結合できていなくても「結合しました」と言う**状態だったので、
 * 成功・全滅・一部成功で出し分けるようにした（2026-09-13・25セッション目）。
 * 引き出しはどの結末でも開く（中止の理由を読めるように）が、未読の印は成功したときだけ。
 * ============================================================ */
await block('画像結合の結末の伝え方（special.html）', async () => {
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
});

/* ============================================================
 * 「元に戻す」の契約（special.html のドラフト／uma-skill-deck.html の各操作）
 *
 * 実機で一括削除（当時は「すべて外す」）→「元に戻す」が復元されない事故があった。原因は、ドラフトの保存
 * （saveDraftScope）が skillIds の配列ごと差し替えるのに、復元処理が古い配列へ書いていたこと。
 * ここでは Undo 対象の各操作について「実行 → 元に戻す → 実行前と一致」の往復と永続化、
 * そして「戻せなかったときに成功を名乗らない・スタックを減らさない」ことを見る。
 * ============================================================ */
await block('「元に戻す」の契約（special.html のドラフト／uma-skill-deck.html の各操作）', async () => {
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
	// 段8（C-120）で②のタブの帯を無くしたので、ドラフトは deckTemplateManager.setSelectedId で選ぶ
	await page.evaluate(() => deckTemplateManager.setSelectedId('__draft__'));
	await page.waitForTimeout(400);

	const storedDraft = () => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds);
	const undoUi = () => page.evaluate(() => ({
		// 段8（C-120）で「追加済みスキル（N種）」を無くしたので、分類のタブの数の合計で見る
		count: document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length,
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
		if (b && b.getAttribute('aria-pressed') !== 'true') b.click();   // 段9: special の② は × が常に出る（モードのボタンは無い）
	});

	// 1) 追加済みスキルを全て削除 → 元に戻す。件数・保存先・ボタンの3つが揃って戻ること
	// 段7b の ⑫：special の②から「リセット」ボタンが無くなったので、まとめて外す操作は removeSkillsFromSelection（①の編成から使う口。同じく「即実行＋元に戻す」）で見る
	const clearAll = () => page.evaluate(() => deckTemplateManager.removeSkillsFromSelection(deckTemplateManager.getSelection().skillIds));
	await clearAll();
	await page.waitForTimeout(200);
	const cleared = await undoUi();
	assert(cleared.count === 0 && (await storedDraft()).length === 0,
		'undo: 一括削除で0種になり、保存先も空になる', cleared);
	assert(cleared.btn && cleared.badge === '1' && cleared.stack === 1 && cleared.scope === 'list',
		'undo: 「元に戻す ①」が出る（scope は list）', cleared);
	/* 73セッション目に文面を変えた ―― 消す対象がスキル・分類・B・C にまたがるので、
	   「N種」だけでは B・C が消えたことが伝わらない。**数えずに言い、名前が残ることを添える。** */
	assert(cleared.toast === '本育成スキル' + PICK.length + '種をスキルセットから外しました',
		'undo: 実行時のトーストは doneLabel', cleared.toast);
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
	assert(restored.toast === '外した' + PICK.length + '種をスキルセットに戻しました',
		'undo: 戻したときのトーストは undoneLabel', restored.toast);

	// 2) 永続化。リロードしても戻した状態のまま
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(2500);
	// 段8（C-120）で②のタブ（「＋ 新規（ドラフト）12種」）を無くしたので、分類のタブの数の合計で見る
	await page.evaluate(() => deckTemplateManager.setSelectedId('__draft__'));
	await page.waitForTimeout(400);
	const afterReload = await page.evaluate(() =>
		document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length + '種');
	assert(/12種/.test(afterReload), 'undo: リロードしても戻した12種が保たれている', afterReload);

	// 3) 個別に外す → 元に戻す。位置も含めて実行前と一致すること
	const single = await page.evaluate(() => {
		const read = () => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds;
		const before = read();
		const del = document.querySelector('#deck-template-panel [data-usd-el="mode-delete"]');
		if (del && del.getAttribute('aria-pressed') !== 'true') del.click();   // × は削除モードのときだけ出る（C-57）。段9: special の② は常に出る
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
	await clearAll();
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
	// 段8（C-120）で②のタブの帯を無くしたので、ドラフトは deckTemplateManager.setSelectedId で選ぶ
	await page.evaluate(() => deckTemplateManager.setSelectedId('__draft__'));
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
	// 段8（C-120）で「追加済みスキル（N種）」を無くしたので、分類のタブの数の合計で見る
	const draftCount = () => page.evaluate(() =>
		document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length);

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
			// A のまとまりは Deck にもできるが、**見出しも枠も出さない**（opts.sectionGrouping を渡さない）。
			// Deck は A しか無く入れ物も「スキルセット」なので、出すと二重に見える。
			// **段K で「枠と出っ張り」も同じフラグで出るようになった**ので、それが Deck に
			// 漏れていないことも見る（.uma-section--framed と .uma-section-row が無いこと）
			secA: !!p.querySelector('[data-usd-el="section-a"]'),
			// 同上 ―― 出っ張り（.uma-section-row の直下の見出し）だけを見る。
			// 段11 ⑩ の入口の畳む見出しは Deck 単体ページにも出るので、ここで拾うと常に true になる。
			secAHead: !!p.querySelector('[data-usd-el="section-a"] .uma-section-row > .uma-section-head'),
			secAFramed: !!p.querySelector('[data-usd-el="section-a"].uma-section--framed'),
			secARow: !!p.querySelector('[data-usd-el="section-a"] .uma-section-row'),
			// B・C は special だけ（opts.extraScopes を渡さない画面には出ない）
			scopes: p.querySelectorAll('[data-usd-scope-section]').length
		};
	});
	assert(deckLabel.tab === 'スキルセット' && deckLabel.head === 'スキルセット（N／N件）'
		&& deckLabel.placeholder === '新しいスキルセットの名前' && deckLabel.tabsAria === 'スキルセット',
		'C-1(deck): Deck 単体ページの呼び名は「スキルセット」のまま（special だけ setLabel で「因子セット」）', deckLabel);
	assert(deckLabel.secA && !deckLabel.secAHead,
		'C-1(deck): A のまとまりはあるが見出しは出さない（A しか無い画面で「スキルセット」が二重に見えるため）', deckLabel);
	assert(!deckLabel.secAFramed && !deckLabel.secARow,
		'段K(deck): 枠も出っ張りも並びの行も出ない（Deck 単体ページの見た目を段K で動かさない）', deckLabel);
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
});

/* ============================================================
 * 結合画像を保存するときのファイル名（special / exam 共通・js/stitch.js）
 *
 * 形式は `YYMMDD_NNN_指定名称.png`。
 * 組み立てそのもの（純粋な関数）と、実際の保存リンクに付く名前の両方を見る。
 * 通し番号は全ツール共通の1キー（uma-shared-save-seq）で、指定名称はツールごと。
 * ============================================================ */
await block('結合画像を保存するときのファイル名（special / exam 共通・js/stitch.js）', async () => {
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
});

/* ============================================================
 * exam.html — 「結合画像の表示」（集計バナー／印／凡例／集計条件）の設定パネルと合成の分岐
 *
 * パネルは JS が作る（renderStitchShowPanel）。見るのは次の4点。
 *   1. 既定（保存値なし）: バナー・凡例・集計条件は ON、印は OFF、印が OFF の間は凡例が選べない
 *   2. 切り替えが localStorage に保存され、開き直しても戻る
 *   3. 模式図の帯がチェックに追従する（印 OFF なら凡例の帯も消える／両方 OFF なら区切り線ごと消える）
 *   4. 合成の分岐: 列見出しだけの帯 / 補足欄の行の出し分け（OCR は回さず、描画関数を直接呼ぶ）
 * ============================================================ */
await block('exam.html — 「結合画像の表示」（集計バナー／印／凡例／集計条件）の設定パネルと合成の分岐', async () => {
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
			// 段H: 1つのチェックが因子と遺伝子の両方を持つので、呼び名も両方を名乗る
			scenarioLabel: q('scenario').closest('.stitch-show-item').querySelector('.stitch-show-text').textContent,
			marksLabel: q('marks').closest('.stitch-show-item').querySelector('.stitch-show-text').textContent,
			// 模式図の帯は因子・遺伝子の2本
			scenarioBars: Array.from(document.querySelectorAll('#stitch-show-panel [data-stitch-part="scenario"] .stitch-wire-factor'))
				.map((el) => getComputedStyle(el).backgroundColor),
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
	assert(s.order === 'banner,scenario,marks,legend,conditions', '結合画像の表示: 並びは 検出数カード → シナリオ因子・遺伝子 → 印 → 凡例 → 集計条件', s.order);
	assert(s.banner && s.scenario && !s.marks && s.legend && s.conditions, '結合画像の表示: 既定は検出数カード・シナリオ因子・凡例・集計条件が ON、印が OFF', s);
	assert(s.scenarioDisabled && s.scenarioGrey && s.eff.scenario === false && s.wire.scenario.every((h) => h),
		'結合画像の表示: シナリオ因子も遺伝子も1件も選んでいなければ、チェックは灰色で選べず、模式図の帯も出ない', s);
	/* 段H: 項目の呼び名。1つのチェックが因子と遺伝子の両方を持つので、呼び名も両方を名乗る。
	   印の記号の並びにも白抜きの菱形が入る（★●◆◇✕）。模式図の帯は区分ごとに2本。 */
	assert(s.scenarioLabel.startsWith('シナリオ因子・遺伝子'), '段H: 項目の呼び名が「シナリオ因子・遺伝子」になっている', s.scenarioLabel);
	assert(s.marksLabel.indexOf('◇') !== -1 && s.marksLabel.indexOf('◆') !== -1,
		'段I-5: 印の項目の記号の並びに ◆ と ◇ が並ぶ', s.marksLabel);
	assert(s.scenarioBars.length === 2 && s.scenarioBars[0] !== s.scenarioBars[1],
		'段H: 模式図の「シナリオ因子・遺伝子」の帯は2本で、色が違う', s.scenarioBars);
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

	// 段H: **遺伝子だけ**でも選べるようになる（1つのチェックが両方を持つため）
	await page.evaluate(() => setAptitudeGenesAll(true));
	await page.waitForTimeout(200);
	s = await stateOf();
	assert(!s.scenarioDisabled && !s.scenarioGrey && s.eff.scenario === true,
		'段H: 遺伝子だけを選んでも「シナリオ因子・遺伝子」が選べるようになる', s);
	await page.evaluate(() => setAptitudeGenesAll(false));
	await page.waitForTimeout(200);
	s = await stateOf();
	assert(s.scenarioDisabled && s.eff.scenario === false,
		'段H: どちらも外すとまた選べなくなる', s);

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
		const withCards = stitchDrawPersonBanner(600, '親A', 12, 3, null, null);
		const headerOnly = stitchDrawPersonBanner(600, '親A', 12, 3, null, null, { cards: false });
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
		const h = (opts, genes) => stitchDrawPersonBanner(600, '親A', 12, 3, factors, genes || null, opts).height;
		const full = h(undefined), noCards = h({ cards: false }), noFactors = h({ factors: false }), none = h({ cards: false, factors: false });
		// 因子を渡さなければ（1件も選んでいない）、因子 ON でも見出し＋カードだけ
		const noneSelected = stitchDrawPersonBanner(600, '親A', 12, 3, null, null, { cards: true, factors: true }).height;
		return { full, noCards, noFactors, none, noneSelected, factorBlockSame: (full - noFactors) === (noCards - none) };
	});
	assert(band.full > band.noCards && band.noCards > band.none && band.full > band.noFactors && band.noFactors > band.none,
		'結合画像の表示: 列見出しの帯はカード・因子の行を個別に省ける', band);
	assert(band.factorBlockSame && band.noneSelected === band.noFactors,
		'結合画像の表示: カード OFF でも因子の行の高さは同じで、因子を1件も選んでいなければ行は出ない', band);

	/* --- 段H: 帯には遺伝子の行も焼く（因子の行の下に続く） ---
	   行が増えたぶん帯が高くなること、因子だけ・遺伝子だけ・両方の高さが噛み合うこと、
	   そして**色が区分ごとに違う**（因子＝--uma-catalog-text／遺伝子＝--uma-gene-text）ことを見る。
	   色は焼いた画素から読む（トークンを引き直すだけだと「描くとき使った」ことの確認にならない）。 */
	const geneBand = await page.evaluate(() => {
		const factors = { items: [{ text: 'URAシナリオ：★2' }, { text: 'アオハル杯シナリオ：★1' }], more: false };
		const genes = { items: [{ text: '芝の遺伝子：★3' }], more: true };
		const h = (f, g) => stitchDrawPersonBanner(600, '親A', 12, 3, f, g, undefined).height;
		const only = h(factors, null), both = h(factors, genes), geneOnly = h(null, genes), neither = h(null, null);
		// 行1本ぶんの高さ。**まとまりの手前に余白が1つ入る**ので、「行が1本増えたときの差」で測る
		// （高さ ＝ 見出し＋カード ＋ 余白1つ ＋ 行数 × 行の高さ。行数で割ると余白のぶんずれる）。
		const perLine = both - only;
		// OFF（factors: false）にすると遺伝子の行も消える（1つのチェックが両方を持つ）
		const off = stitchDrawPersonBanner(600, '親A', 12, 3, factors, genes, { factors: false }).height;
		// 焼いた画素の色。因子の行と遺伝子の行の帯から、それぞれ濃い画素を1つ拾う
		const c = stitchDrawPersonBanner(600, '親A', 12, 3, factors, genes, { cards: false });
		const ctx = c.getContext('2d');
		const px = c.width * 4;
		const rowInk = (y0, y1) => {
			const d = ctx.getImageData(0, y0, c.width, y1 - y0).data;
			const seen = {};
			for (let i = 0; i < d.length; i += 4) {
				if (d[i + 3] < 200) continue;
				const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
				if (k === '255,255,255') continue;
				seen[k] = (seen[k] || 0) + 1;
			}
			return Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
		};
		const lineH = perLine;
		const top = neither - 0; // 見出しだけの帯の高さ＝1行目の上端のおおよそ
		const hex = (t) => getComputedStyle(document.documentElement).getPropertyValue(t).trim();
		const toRgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)).join(',');
		return {
			only, both, geneOnly, neither, off, perLine,
			// 遺伝子1行ぶん増えていること
			gainOne: both - only,
			factorInk: rowInk(Math.round(c.height - lineH * 3), Math.round(c.height - lineH * 2)),
			geneInk: rowInk(Math.round(c.height - lineH), c.height - 1),
			wantFactor: toRgb(hex('--uma-catalog-text')), wantGene: toRgb(hex('--uma-gene-text')),
			px: px,
		};
	});
	assert(geneBand.both > geneBand.only && geneBand.perLine > 0,
		'段H: 帯に遺伝子の行が1本増える', geneBand);
	assert(geneBand.only - geneBand.geneOnly === geneBand.perLine,
		'段H: 行1本ぶんの高さは因子でも遺伝子でも同じ（同じ組み立てを共有している）', geneBand);
	assert(geneBand.geneOnly > geneBand.neither,
		'段H: 遺伝子だけでも帯に行が出る（因子を1件も選んでいなくてよい）', geneBand);
	assert(geneBand.off === geneBand.neither,
		'段H: 「シナリオ因子・遺伝子」を OFF にすると、遺伝子の行も一緒に消える', geneBand);
	assert(geneBand.factorInk.includes(geneBand.wantFactor) && geneBand.geneInk.includes(geneBand.wantGene)
		&& geneBand.wantFactor !== geneBand.wantGene,
		'段H: 帯の因子の行と遺伝子の行が別の色で焼かれている（トークンの値そのもの）', geneBand);

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
});

/* ============================================================
 * exam.html — 結果画像の引き出しからの「画像を更新」（③）: 状態の判定
 *
 * OCR は回さず、stitchOnePerson を差し替えて「OCR が済んだ状態」（lastOcrRun）を作る。
 * 見るのは stitchRefreshState() の遷移:
 *   same（表示設定が同じ）→ ready（違う）→ same（戻した）／
 *   stale（画像の足し引き・範囲・シナリオ因子・集計モード・親Bセットの開閉・OCR だけ回した）→ 戻せば same
 * と、refreshStitchedImages() が OCR を回さずに作り直し、未読の印を立てないこと。
 * ============================================================ */
await block('exam.html — 結果画像の引き出しからの「画像を更新」（③）: 状態の判定', async () => {
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
});

/* ============================================================
 * exam.html — 結果画像の引き出しの「表示を変更」（③）: 引き出しのUI
 *
 *   出し入れは setSectionReady('stitch') に乗る（#stitch-empty / #stitch-name-wrap と同じタイミング）／
 *   中身は②と同じパネル（模式図・注記なし・id は drawer-）で、どちらで変えても両方と保存に映る／
 *   「画像を更新」は表示設定が違うときだけ押せ、作り直せないときは案内が出る／
 *   375px で崩れず横スクロールが出ない／旧UIには出ない
 * ============================================================ */
await block('exam.html — 結果画像の引き出しの「表示を変更」（③）: 引き出しのUI', async () => {
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
	/* 本文をスクロールしても丸ボタンの画面上の位置は変わらない
	 *
	 * **73セッション目に3か所を直した。** この項目は72セッション目に**1回だけ落ちて、同条件の
	 * 再実行で通った**（以後は再発せず）。原因は特定できなかったが、**落ち方のほうを潰した。**
	 *
	 * (1) **引き出しからの相対で測る。** 以前は画面上の絶対座標どうしを比べていた。丸ボタンは
	 *     引き出し（position:fixed）の中の position:absolute なので、**引き出しごと動けば
	 *     スクロールと関係なく絶対座標が変わる**（画面の縦スクロールバーが出入りすれば
	 *     right:0 の引き出しは横にずれる）。相対なら引き出しが動いても影響を受けない。
	 * (2) **実際にスクロールできたことを判定に入れる。** 以前は scrolled を戻り値に入れるだけで
	 *     見ていなかったので、**本文がまだ伸びておらず scrollTop が 0 のままでも通っていた**
	 *     ＝何も確かめないまま [OK] が出る穴があった。
	 * (3) **結合画像が入って本文が伸びきるのを待ってから測る**（(2) を空振りさせないため）。 */
	await page.waitForFunction(() => {
		const body = document.querySelector('#result-drawer .uma-drawer-body');
		if (!body) return false;
		if ([...body.querySelectorAll('img')].some((i) => !i.complete)) return false;
		return body.scrollHeight > body.clientHeight + 200;
	});
	const pinned = await page.evaluate(async () => {
		const body = document.querySelector('#result-drawer .uma-drawer-body');
		const drawer = document.getElementById('result-drawer');
		// 引き出しの左上を原点にした丸ボタンの位置
		const rel = () => {
			const f = document.getElementById('stitch-drawer-fab').getBoundingClientRect();
			const d = drawer.getBoundingClientRect();
			return { top: f.top - d.top, left: f.left - d.left };
		};
		const before = rel();
		body.scrollTop = 200;
		await new Promise((r) => requestAnimationFrame(r));
		const after = rel();
		const scrolled = body.scrollTop;
		body.scrollTop = 0;
		return { same: before.top === after.top && before.left === after.left, scrolled, before, after };
	});
	assert(pinned.same && pinned.scrolled > 0,
		'表示を変更: 引き出しの本文をスクロールしても丸ボタンの位置は変わらない（本文が実際にスクロールしたことも見る）', pinned);
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
});

/* ============================================================
 * exam.html — 右下のボタン群の「結合画像の設定」
 *   並びは 照合結果 → 結合画像の表示 → 結合画像の設定 → Deck／展開の遅延は下から 0/.03/.06/.09 秒／
 *   押すと暗転つきの小さなパネルが FAB の上に開き、結合画像が無くても開ける／「画像を更新」は無い／
 *   ここで変えた設定は②と引き出しのパネル・保存に映る／✕・暗転・Esc で閉じ、フォーカスはメインボタンへ戻る／
 *   375px では下からのシート（高さは画面の半分まで）で、横スクロールが出ない
 * ============================================================ */
await block('exam.html — 右下のボタン群の「結合画像の設定」', async () => {
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
});

/* ============================================================
 * トーストと「結合画像の設定」のパネルの重なり（2026-09-15・43セッション目）
 *
 * 「画像を更新」の直後のトーストが、引き出しの中のパネルの下端に重なっていた。
 * パネルが開いている間だけ、トーストをパネルの上辺より上へ逃がす（--uma-toast-lift）。
 * 閉じたら元の位置へ戻す。あわせて、パネルの見出しが1つだけであることも見る。
 * ============================================================ */
await block('トーストと「結合画像の設定」のパネルの重なり（2026-09-15・43セッション目）', async () => {
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
});

/* ============================================================
 * 未読の丸（2026-09-15・43セッション目）
 *
 * ・子項目・引き出しのタブ・Deck の取り込み案内の丸は、行き先を問わず1色の赤
 *   （--uma-notify #c53030）。白い縁取りと脈動が付く。
 * ・畳んだメインボタンの未読は、右上に赤丸を1つだけ（未読がいくつでも1つ）。
 *   回る動きは付けない。開いたら隠し、閉じたら（未読が残っていれば）出す。
 * ・reduced-motion では脈動しない。
 * ============================================================ */
await block('未読の丸（2026-09-15・43セッション目）', async () => {
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
});


/* ============================================================
 * 緑スキルの数え方の切り替え（2026-09-15・43セッション目）
 *
 * 「操作できる部品は黒」の例外。何を数えるのか（＝緑スキル）を色が示すので緑で塗る。
 * 選択中＝緑の地に白い文字（白とのコントラスト 5.36）、未選択＝緑の文字、枠も緑。
 * ============================================================ */
await block('緑スキルの数え方の切り替え（2026-09-15・43セッション目）', async () => {
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
});


/* ============================================================
 * シナリオ因子の色＝紫／遺伝子の色＝赤（2026-09-15・44セッション目。段G で遺伝子を追加）
 *
 * 場所ごとに別の値（sky-50〜900・canvas の直書き）だったものを、4つの役割に
 * まとめた。**どの箇所もトークンと同じ値で描かれている**ことを見る。
 * 因子の総括チェックだけは「操作できる部品は黒」の例外ではなく原則どおり黒。
 * **段G で印の色を #b02aa8 → #a42fb8 へ微調整し、遺伝子の4本組を新設した。**
 * 遺伝子の♥がシナリオ因子の◆と同じ色に戻っていないことも、ここで見張る。
 * ============================================================ */
await block('シナリオ因子の色＝紫／遺伝子の色＝赤（2026-09-15・44セッション目。段G で遺伝子を追加）', async () => {
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
	const MARK = 'rgb(176, 42, 168)';   // --uma-mark-catalog  #b02aa8（段G-2 で元へ戻した）
	const GENE = 'rgb(88, 28, 135)';    // --uma-mark-gene     #581c87（段G-2・紫の濃いほう）
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
			// 遺伝子の印は SVG（段G-2）。文字ではないので textContent は空になる
			listGeneSvg: listGene ? !!listGene.querySelector('svg path') : null,
			listGeneD: listGene ? (listGene.querySelector('svg path') || {}).getAttribute
				? listGene.querySelector('svg path').getAttribute('d') : null : null,
			listGeneCls: listGene ? listGene.className : null,
			listMarkGlyph: listMark ? listMark.textContent : null,
			// 凡例の行にも同じ SVG が入る（段I で凡例そのものを JS が組み立てるようになった）
			legendGeneSvg: !!document.querySelector('#registry-legend svg path'),
			// 大きさと縦位置が ◆ とそろっているか（.uma-glyph-mark の役目）。
			// **箱の寸法そのものは一致しない** ―― 文字の記号の箱は行の高さ（16px）と
			// 字送り（12px）で決まり、SVG の箱は 1.2em の正方形（14.4px）だから。
			// 見比べるべきなのは「**隣の名前の文字と、上下の中心がそろっているか**」。
			// ここがずれると、印だけが一段高い／低い位置に浮いて見える。
			geneBox: listGene ? (() => {
				const r = listGene.getBoundingClientRect();
				const name = listGene.closest('div').querySelector('span:last-child').getBoundingClientRect();
				return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
					名前との中心差: Math.round((r.top + r.height / 2 - (name.top + name.height / 2)) * 10) / 10 };
			})() : null,
			markBox: listMark ? (() => {
				const r = listMark.getBoundingClientRect();
				const name = listMark.closest('div').querySelector('span:last-child').getBoundingClientRect();
				return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
					名前との中心差: Math.round((r.top + r.height / 2 - (name.top + name.height / 2)) * 10) / 10 };
			})() : null,
			// 画面の SVG と結合画像の Canvas が同じ元から形を取っているか
			wantD: STITCH_DIAMOND_PATH_D_24,
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
	assert(c.tokens.mark === '#b02aa8' && c.tokens.text === '#76136f'
		&& c.tokens.soft === '#fbe7f8' && c.tokens.border === '#f0abe8',
		'シナリオ因子の色: 4つの役割のトークンが紫の確定値（4本とも据え置き）', c.tokens);
	assert(c.geneTokens.mark === '#581c87' && c.geneTokens.text === '#451270'
		&& c.geneTokens.soft === '#f4ecfd' && c.geneTokens.border === '#d3bcf0',
		'段G-2: 遺伝子の色も4つの役割のトークンを持つ（紫の濃いほうの確定値）', c.geneTokens);
	assert(c.geneTokens.mark !== c.tokens.mark,
		'段G-2: 遺伝子の印とシナリオ因子の印が同じ色に戻っていない', { gene: c.geneTokens.mark, factor: c.tokens.mark });
	assert(c.listMark === MARK && c.tableMark === MARK && c.cardMore === MARK && c.wireBar === MARK,
		'シナリオ因子の色: 一覧と表の◆・ハイライトの「他」・模式図の帯が印の色', c);
	assert(c.badgeText === TEXT && c.cardHead === TEXT && c.cardLine === TEXT,
		'シナリオ因子の色: バッジの文字・カードの見出しと行が文字の色', c);
	assert(c.badgeBg === SOFT && c.cardBorder === BORDER,
		'シナリオ因子の色: バッジの地が淡い地、カードの枠が枠の色', c);
	assert(c.stitchText === '#76136f' && c.stitchMore === '#b02aa8',
		'シナリオ因子の色: 結合画像が読むトークンも文字と印の色', c);
	assert(c.listGene === GENE && c.tableGene === GENE,
		'段G: 一覧と表の遺伝子の印が遺伝子の色', { listGene: c.listGene, tableGene: c.tableGene, want: GENE });
	assert(c.listGeneSvg && c.legendGeneSvg && c.listMarkGlyph === '◆',
		'段I-5: 遺伝子は白抜きの菱形の SVG・シナリオ因子は◆の文字（塗り方で分かれている）',
		{ svg: c.listGeneSvg, legend: c.legendGeneSvg, factor: c.listMarkGlyph });
	assert(c.listGeneD === c.wantD,
		'段G-2: 画面の SVG と結合画像の Canvas が同じ輪郭（js/stitch.js の1か所から出ている）',
		{ 画面: c.listGeneD, 期待: c.wantD });
	assert(c.listGeneCls.includes('uma-glyph-mark'),
		'段G-2: 遺伝子の印に .uma-glyph-mark が付いている（大きさとベースラインを揃える）', c.listGeneCls);
	assert(Math.abs(c.geneBox.名前との中心差) <= 0.5 && Math.abs(c.markBox.名前との中心差) <= 0.5,
		'段G-2: SVG の印が、文字の記号と同じく名前と上下の中心でそろっている',
		{ gene: c.geneBox, factor: c.markBox });
	assert(c.geneBox.w <= c.markBox.w + 3 && c.geneBox.h <= c.markBox.h + 1,
		'段G-2: SVG の印が文字の記号より大きくなりすぎていない（行の高さを押し広げない）',
		{ gene: c.geneBox, factor: c.markBox });
	assert(c.check === CONTROL,
		'シナリオ因子の色: 因子の総括チェックだけは操作の色（黒）', c.check);
	assert(errors.length === 0, 'シナリオ因子の色: コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}
});


/* ============================================================
 * ハイライトの人物ごとのまとまり（2026-09-16・45セッション目）
 *
 * カード単位で並べていたものを、人物ごとのまとまり（見出し＋その人のカード）に
 * 組み直した。スマホ幅で「親Aのシナリオ因子の隣に祖A1のsp70緑」のように
 * 人物の区切りが行の途中に入るのを無くすのが目的。
 * 区切りの幅は sm（640px）＝まとまりの中を3枚横並びに、lg（1024px）＝まとまりを2列に。
 * ============================================================ */
await block('ハイライトの人物ごとのまとまり（2026-09-16・45セッション目）', async () => {
{
	// ハイライトを引き出しごと開いて、人物ごとのまとまりを作る
	// factorsOn … シナリオ因子の総括チェック（ON なら24種すべてが対象）。
	// detectFactors … 因子を検出したことにするか。false なら「対象にしたが1種も出なかった」状態。
	// genesOn … 遺伝子の総括チェック（段H で4枚目のカードが増えた）。既定は OFF＝従来の3枚。
	// 戻り値の longest は「いちばん長い因子名」。**名前をこのファイルに書かず**に
	// 「長い名前が省略される／広い幅では全部出る」を確かめるために返す。
	const seedHighlight = (page, factorsOn, detectFactors = true, genesOn = false) => page.evaluate((o) => {
		if (typeof closeUiNotice === 'function') closeUiNotice();
		document.querySelectorAll('.uma-overlay-backdrop, .uma-overlay').forEach((el) => { el.hidden = true; });
		setScenarioFactorsAll(o.on);
		setAptitudeGenesAll(o.genes);
		const mk = (names, offset) => matchAllSkillsWithStars(
			names.map((s, i) => ({ text: s, stars: ((i + offset) % 3) + 1, starsReliable: true, rowKey: 'r' + i })),
			skillList, skillIndex, {});
		// 64セッション目（段E）から、帯に出るのは**検出したものだけ**。上位3種＋「他」を
		// 出すために**4種**検出したことにする。**いちばん長い名前を必ず混ぜ**、★を決め打ち
		// （3,3,2,1）にして、その名前が必ず上位3行に入るようにする（省略の検査が効く）。
		const longest = factorOnlyList.slice().sort((a, b) => b.length - a.length)[0] || null;
		const hit = (o.detect && longest)
			? [longest].concat(factorOnlyList.filter((n) => n !== longest).slice(0, 3)) : [];
		// 遺伝子も同じ作り方（段H）。4種検出＝上位3種＋「他」。
		const longestGene = geneOnlyList.slice().sort((a, b) => b.length - a.length)[0] || null;
		const geneHit = (o.detect && longestGene)
			? [longestGene].concat(geneOnlyList.filter((n) => n !== longestGene).slice(0, 3)) : [];
		const STARS = [3, 3, 2, 1];
		personResults = PERSON_LABELS.map(() => null);
		for (let p = 0; p < 3; p++) {
			personResults[p] = mk(skillList.slice(0, 120 - p * 10).concat(hit, geneHit), p);
			hit.forEach((n, i) => { personResults[p].skillStars[n] = STARS[i]; });
			geneHit.forEach((n, i) => { personResults[p].skillStars[n] = STARS[i]; });
		}
		renderResults();
		openDrawer('result');
		return { longest: longest, hit: hit, longestGene: longestGene, geneHit: geneHit };
	}, { on: factorsOn, detect: detectFactors, genes: genesOn });
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
	const readFactorRows = (page, kind = 'factor') => page.evaluate((k) => {
		const wrap = document.querySelector('#exam-highlight-grid [data-person-group] [data-hl-card="' + k + '"]');
		const card = wrap ? wrap.querySelector('div.grid') : null;
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
			heading: card.parentElement.querySelector(':scope > p:first-child').textContent,
			// 文字の色は区分ごとに違う（因子＝--uma-catalog-text／遺伝子＝--uma-gene-text）
			color: getComputedStyle(card).color,
			moreColor: moreEl ? getComputedStyle(moreEl).color : null,
			// 「他」は格子の外・カードの右下
			moreText: moreEl ? moreEl.textContent : null,
			moreBelowGrid: moreEl ? moreEl.getBoundingClientRect().top >= card.getBoundingClientRect().bottom - 1 : null
		};
	}, kind);

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

	/* ------------------------------------------------------------
	 * 段H: 遺伝子のカード（4枚目）
	 *
	 * 規則は因子と同じ（検出したものだけ・上位3種・4種以上は「他」）。
	 * **4枚のときはどの幅でも 2列 × 2段**にしてある ―― 横に4枚並べると、
	 * 1024px 以上でまとまりが半分の幅になり、いちばん長い因子名と遺伝子名の
	 * 両方が入る比率が存在しない（実測）。640px 未満と 1024px 以上では
	 * sp70緑・緑の見出しも2行に折り返す。ここではその形と、
	 * 「名前が省略されない・見出しが折り返さない」ことを幅ごとに見る。
	 * ------------------------------------------------------------ */
	for (const [w, h] of [[375, 1800], [640, 1800], [1280, 1800]]) {
		const { ctx, page, errors } = await openPage(browser, base, 'exam.html', { width: w, height: h });
		const seeded = await seedHighlight(page, true, true, true);
		await page.waitForTimeout(700);
		const g = await readGroups(page);
		const tag = '段H: ' + w + 'px ';
		assert(g.cardCounts.every((n) => n === 4), tag + 'まとまりの中は4枚（sp70緑・緑・シナリオ因子・遺伝子）', g.cardCounts);
		assert(g.cardHeads.every((x) => x[2] === 'シナリオ因子' && x[3] === '遺伝子'),
			tag + '4枚目の見出しは「遺伝子」', g.cardHeads[0]);
		// 2列 × 2段。1段目の2枚と2段目の2枚がそれぞれ同じ上端で、2段目は下にある
		assert(g.innerTops.every((t) => t[0] === t[1] && t[2] === t[3] && t[2] > t[1]),
			tag + '2列 × 2段（1段目 sp70緑・緑／2段目 シナリオ因子・遺伝子）', g.innerTops[0]);
		assert(g.innerWidths.every((x) => new Set(x).size === 1),
			tag + '4枚とも同じ幅', g.innerWidths[0]);
		assert(!g.overflow && !g.docOverflow, tag + '横スクロールが出ない', g);

		const gr = await readFactorRows(page, 'gene');
		assert(gr && gr.rows.length === 3 && gr.moreText === '他' && gr.moreBelowGrid,
			tag + '遺伝子の行は検出分の上位3種＋「他」（因子と同じ規則）', gr && gr.rows.length);
		assert(gr.rows.every((r) => r.height <= r.lineHeight + 1) && gr.rows.every((r) => !r.starsClipped),
			tag + '遺伝子の各行が1行に収まり、「：★N」も切れない', gr.rows.map((r) => [r.height, r.lineHeight]));
		assert(new Set(gr.rows.map((r) => r.starsLeft)).size === 1,
			tag + '遺伝子でも「：★N」の左端が全行で揃う', gr.rows.map((r) => r.starsLeft));
		// 色は区分ごとに違う（色＝どのカテゴリか。F-62）
		const fr2 = await readFactorRows(page, 'factor');
		assert(fr2.color !== gr.color && fr2.moreColor !== gr.moreColor,
			tag + 'シナリオ因子と遺伝子でカードの文字色・「他」の色が違う',
			{ factor: [fr2.color, fr2.moreColor], gene: [gr.color, gr.moreColor] });
		// 名前の省略。4枚でも 640px 以上なら遺伝子名は省略されない。
		// 375px で長い因子名が省略されるのは3枚のときと同じ（段H で悪くなった点ではない）。
		assert(gr.rows.every((r) => !r.clipped) && gr.rows.some((r) => r.name === seeded.longestGene),
			tag + '遺伝子の名前は省略されない', gr.rows.map((r) => r.name));
		if (w >= 640) {
			assert(fr2.rows.every((r) => !r.clipped),
				tag + '4枚でも因子の名前は省略されない', fr2.rows.map((r) => r.name));
			// sp70緑・緑の見出しが1行に収まる（横に4枚並べると折り返していた）
			const heads = await page.evaluate(() => {
				const g0 = document.querySelector('#exam-highlight-grid [data-person-group] .hl-cards');
				return [...g0.children].slice(0, 2).map((d) => {
					const p = d.querySelector('p');
					return [Math.round(p.getBoundingClientRect().height), Math.round(parseFloat(getComputedStyle(p).lineHeight))];
				});
			});
			assert(heads.every(([hh, lh]) => hh <= lh + 1), tag + 'sp70緑・緑の見出しが1行に収まる', heads);
		}
		assert(errors.length === 0, tag + 'コンソールエラーが出ない', errors.slice(0, 3));
		await ctx.close();
	}

	// --- 段H: 遺伝子だけ（3枚）のときは 640px 以上で横並びの3列 ---
	{
		const { ctx, page } = await openPage(browser, base, 'exam.html', { width: 1280, height: 1400 });
		const seeded = await seedHighlight(page, false, true, true);
		await page.waitForTimeout(700);
		const g = await readGroups(page);
		assert(g.cardCounts.every((n) => n === 3) && g.cardHeads.every((x) => x[2] === '遺伝子'),
			'段H: 遺伝子だけなら3枚目が遺伝子', g.cardHeads[0]);
		assert(g.innerTops.every((t) => t[0] === t[1] && t[1] === t[2]),
			'段H: 遺伝子だけの3枚は 1280px で横並び', g.innerTops[0]);
		const gr = await readFactorRows(page, 'gene');
		assert(gr.rows.every((r) => !r.clipped) && gr.rows.some((r) => r.name === seeded.longestGene),
			'段H: 遺伝子だけの3枚（等分の3列）でも名前が省略されない', gr.rows.map((r) => r.name));
		await ctx.close();
	}
}
});


/* ============================================================
 * 右下のボタン群の幅（2026-09-15・43セッション目）
 *
 * いちばん長いラベルのボタンに、ほかのボタンの幅が揃う（ピクセルでは固定しない）。
 * ラベルは左揃え、アイコンの丸は右端。PC と 375px の両方で見る。
 * ============================================================ */
await block('右下のボタン群の幅（2026-09-15・43セッション目）', async () => {
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
});

/* ============================================================
 * スキルセットの分類（超優先／優先／通常。C-57）
 *   - tiers を持たない既存のデータ（fixtures は schemaVersion 2）を開くと、全部「優先」に入る
 *   - 開いて分類のタブを切り替えただけでは、保存データに tiers が書き足されない（C-51 の知見）
 *   - 再分類 → tiers が書かれ schemaVersion が 4 に → 「元に戻す」で tiers が消える（分類は Undo に積む）
 *   - モード（再分類／削除）は同時に ON にならず、× と移動先ボタンはモードのときだけ出る
 *   - Deck の書き出しに tiers が入り、取り込み直しても残る。tiers の無いデータを取り込んでも壊れない
 * ============================================================ */
await block('スキルセットの分類（超優先／優先／通常。C-57）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	const stored = () => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
	const before = await stored();
	// 段8（C-120）で②のタブの帯を無くしたので、セットは deckTemplateManager.setSelectedId で選ぶ
	await page.evaluate((id) => deckTemplateManager.setSelectedId(id), TEMPLATE_ID);
	await page.waitForTimeout(400);
	/* 段9（C-121）: special の②は、超優先／優先／通常の分類のタブ・再分類・削除のモードをやめ、スキルごとのアイコン（◎○△◇★✕）に置き換えた。
	   tiers は Deck・結合画像の印のために残り、アイコンから導く（新しい仕様は blocks-9.mjs の段9(A)(B)）。
	   ここに残すのは、tiers を持たない既存のデータを開いても保存データが変わらないことと、スキルパネルの質感・列数（Deck と共通）。 */
	const ui = () => page.evaluate(() => {
		const r = '#deck-template-panel';
		const q = (s) => document.querySelector(r + ' ' + s);
		return {
			panels: document.querySelectorAll(r + ' .usd-panel').length,
			icons: Array.from(document.querySelectorAll(r + ' .usd-panel [data-usd-act="skill-icon"]')).map(b => b.dataset.icon || '').join(''),
			tabs: document.querySelectorAll(r + ' .usd-tier-tab').length,
			modes: !!q('[data-usd-el="mode-reclass"]') || !!q('[data-usd-el="mode-delete"]'),
			dels: document.querySelectorAll(r + ' .usd-panel-del').length,
			cols: getComputedStyle(q('[data-usd-el="selected-list"]')).gridTemplateColumns.split(' ').length,
		};
	});
	const t0 = await ui();
	assert(t0.panels === PICK.length && t0.icons === 'b'.repeat(PICK.length),
		'tiers→段9: tiers を持たないデータのスキルは全部「優先」＝○のアイコンで出る', t0);
	assert(t0.tabs === 0 && !t0.modes && t0.dels === PICK.length, '段9: 分類のタブと再分類・削除のモードは無い。各行に × がある', t0);
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
	assert(t0.cols > 2, 'tiers: 1280px ではパネルの列が画面幅に合わせて増える', t0.cols);
	assert((await stored()) === before, 'tiers: 開いてセットを選んだだけでは保存データは変わらない（tiers も skillIcons も書き足されない）');
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
		return { schema: d.schemaVersion, tiers: d.templates[0].tiers, icons: d.templates[0].skillIcons };
	}, exported);
	// 段9（C-121）: tiers を持つ書き出しの取り込みは、schemaVersion 7 へ移行して skillIcons を写す（tiers はそのまま残る）
	assert(roundtrip.schema === 7 && JSON.stringify(roundtrip.tiers) === JSON.stringify({ [PICK[0].id]: 3 }),
		'tiers(deck): 取り込み直しても tiers が残る（schemaVersion は 7 へ移行）', roundtrip);
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
});

/* ============================================================
 * ②の B・C ―― シナリオ因子と遺伝子を対象に含める（C-2a）
 *
 *   - 1行（☑ 呼び名 ?）。C-2c で1行に畳み、**段K で件数バッジを外した**
 *   - 「?」は**見るだけ**の一覧をミニウィンドウで開く（チェックは付かない）
 *   - 種数は「?」の一覧の見出しに出る。カタログから数える（ソースに数字を書かない）
 *   - scopes を持たない既存のデータ（fixtures は schemaVersion 2）は両方 OFF で読める
 *   - ON にすると template.scopes が書かれ schemaVersion が 5 に上がる。OFF に戻すと項目ごと消える
 *   - 複製で写り、書き出し・取り込みで残る
 * ============================================================ */
await block('②の B・C ―― シナリオ因子と遺伝子を対象に含める（C-2a）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	// 段8（C-120）で②のタブの帯を無くし、シナリオ因子／遺伝子のチェックを③の先頭の1行（#deck-scopes-bar）へ移した。
	// セットは deckTemplateManager.setSelectedId で選び、チェックは③のタブで見る（新しい置き場所の仕様は blocks-8.mjs の段8(E)）
	await page.evaluate((id) => { deckTemplateManager.setSelectedId(id); selectStepTab(2, { noSave: true }); }, TEMPLATE_ID);
	await page.waitForTimeout(400);
	const sc = () => page.evaluate(() => {
		const r = '#deck-scopes-bar';
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
		'C-2c: 1行（チェック・呼び名・?）だけ。折りたたみの見出しも入れ子のカードも無い', s0.secs);
	assert(s0.secs.every(x => x.height <= 40),
		'C-2c: 1行に収まっている（高さが2行ぶんを超えない）', s0.secs.map(x => x.height));
	/* **差し替えた検査（段K・その1）**: それまでは
	     「C-2a: 種数が見える（数はカタログから数える）」
	     （`s0.secs[0].badge === … + '種'` ほか）
	   を見ていた。**段K で件数バッジを外した**（375px で「スキルセット・シナリオ因子・遺伝子」を
	   1行に収めるため。バッジ2つで 101px あり、字を小さくしても埋まらなかった）。
	   **種数が見えること自体は失っていない** ―― 「?」の一覧の見出しが「シナリオ因子（24種）」と
	   出しており、それは下の `C-2c: 「?」で一覧のミニウィンドウが開く（件数はカタログから）` が
	   見張っている。ここではバッジが**無いこと**を固定する（戻ってきたら 1行に収まらなくなる）。
	   **バッジを復活させるなら、上の文言の検査も戻すこと。** */
	assert(s0.secs.every(x => x.badge === null),
		'段K: 1行に件数のバッジを出さない（種数は「?」の一覧の見出しが出す）', s0.secs.map(x => x.badge));
	assert(s0.scopes === undefined && s0.schema === USER_DATA.schemaVersion,
		'C-2a: scopes を持たない既存のデータは、開いただけでは姿が変わらない', { scopes: s0.scopes, schema: s0.schema });
	// 「?」＝見るだけの一覧（チェックは付かない）
	await page.click('#deck-scopes-bar [data-usd-act="scope-help"][data-scope="scenarioFactors"]');
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
	await page.click('#deck-scopes-bar [data-usd-act="scope-check"][data-scope="scenarioFactors"]');
	await page.waitForTimeout(300);
	const s2 = await sc();
	assert(s2.secs[0].checked && JSON.stringify(s2.scopes) === JSON.stringify({ scenarioFactors: true }) && s2.schema === 5,
		'C-2a: ON にすると scopes が書かれ、schemaVersion が 5 に上がる', { scopes: s2.scopes, schema: s2.schema });
	/* **差し替えた検査（段K・その2）**: それまでは
	     「C-2c: ON のあいだはバッジの色が変わる（件数の文言は変えない）」
	     （`s2.secs[0].badgeAccent === true`）
	   を見ていた。**段K でバッジごと外した**ので、ON の手がかりは**チェックの四角そのもの**だけになる。
	   ON/OFF が画面から読めること自体は失わないよう、ここでチェックの状態を固定する。
	   **exam の同じ1行にはバッジが残っている**（段K では exam を触らないと決めたため。
	   `C-2c(exam):` の検査はそのまま生きている）。 */
	assert(s2.secs[0].checked === true && s2.secs[0].badge === null && s2.secs[1].checked === false,
		'段K: ON かどうかはチェックの四角で読む（バッジは無い）', s2.secs.map(x => x.key + ':' + x.checked));
	// （段7d の ⑮：special の②から「複製」のボタンを削除したので、「複製すると scopes も写る」の検査は外した。複製の処理そのものは Deck 単体ページのために core に残っている）
	// OFF に戻すと項目ごと消える（全部 OFF のセットは scopes を持たない＝旧データと同じ姿）
	await page.click('#deck-scopes-bar [data-usd-act="scope-check"][data-scope="scenarioFactors"]');
	await page.waitForTimeout(300);
	const off = await page.evaluate((tid) => {
		const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
		const t = d.templates.find((x) => x.templateId === tid);
		return { scopes: t.scopes, has: Object.prototype.hasOwnProperty.call(t, 'scopes') };
	}, TEMPLATE_ID);
	assert(!off.has, 'C-2a: 全部 OFF に戻すと scopes は項目ごと消える', off);
	// B を ON に戻し、C も ON にして、保存された JSON を取っておく
	await page.click('#deck-scopes-bar [data-usd-act="scope-check"][data-scope="scenarioFactors"]');
	await page.waitForTimeout(300);
	await page.click('#deck-scopes-bar [data-usd-act="scope-check"][data-scope="genes"]');
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
	// 段8（C-120）: セットは setSelectedId で選び、チェックは③の先頭の1行（#deck-scopes-bar）で見る
	await page2.evaluate((id) => { deckTemplateManager.setSelectedId(id); selectStepTab(2, { noSave: true }); }, TEMPLATE_ID);
	await page2.waitForTimeout(400);
	const back = await page2.evaluate(() => {
		const r = '#deck-scopes-bar';
		const s = document.querySelector(r + ' [data-usd-scope-section="genes"]');
		const b = document.querySelector(r + ' [data-usd-scope-section="scenarioFactors"]');
		return { checked: s ? s.querySelector('input[type="checkbox"]').checked : null,
			// 段K: 件数バッジは無い（ON の手がかりはチェックの四角そのもの）
			noBadge: s ? !s.querySelector('[data-usd-scope-badge]') : null,
			// 「?」の一覧は開いていない（開閉は保存しない）
			helpOpen: s ? s.querySelector('[data-usd-act="scope-help"]').getAttribute('aria-expanded') : null,
			modal: !!document.querySelector('[data-usd-el="scope-list-modal"]:not([hidden])'),
			otherChecked: b ? b.querySelector('input[type="checkbox"]').checked : null,
			// 呼び出し元へ渡す選択にも scopes が乗る（C-2b の照合はこれを見る）
			sel: deckTemplateManager ? deckTemplateManager.getSelection().scopes : null };
	});
	// 元のセットは B・C とも ON のまま
	assert(back.checked === true && back.noBadge === true && back.otherChecked === true,
		'C-2a: 開き直しても ON のまま（段K: 件数バッジは無い。以前は accent の色で見ていた）', back);
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
});
/* **外した検査（C-2c）**: 「『◯◯はスキルではないので、対象スキル数・検出数には含めず、
   別に数えます。』の1文が exam.html と special.html の両方にある」（C-2a で足した）。
   C-2c で**この説明文そのものを両方から消した**ため（冗長という判断。おいもさん）、
   見張る対象が無くなった。**文言が食い違ったのではなく、文言が無くなったので外した。**
   説明を復活させるなら、この検査も一緒に戻すこと。 */

/* ============================================================
 * 段K ―― ②の画面構成（スキルセット／シナリオ因子／遺伝子を同じ層の選択肢として並べる）
 *
 *   - 3つが**同じ行**に並び、**文字の高さがそろう**（中心のずれ 1px 以内）
 *   - 「スキルセット」は枠の左上に**接する**（隙間 0）
 *   - **セットを切り替えた直後に、チェックの状態が画面内にある**（段K の目的そのもの）
 *     40種のセットで測る ―― 小さいセットだと組み替えなくても見えてしまう（C-71 の10節）
 *   - 枠を足しても**入口の折り返しとスキルパネルの列数は変わらない**
 * ============================================================ */
await block('段K ―― ②の画面構成（スキルセット／シナリオ因子／遺伝子を同じ層の選択肢として並べる）', async () => {
{
	// 実用的な大きさのセットを2つ作る（A は B・C とも ON、B は scopes を持たない）。
	// **切り替えるとチェックが外れる**のは C-2a で決めた仕様で、それが見えることを確かめる。
	const bigData = {
		schemaVersion: 5,
		templates: [
			{ templateId: 'tpl_k_a', name: '周回セットA', skillIds: PICK.map(p => p.id), tiers: {},
				scopes: { scenarioFactors: true, genes: true },
				createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z' },
			{ templateId: 'tpl_k_b', name: '周回セットB', skillIds: PICK.map(p => p.id), tiers: {},
				createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z' },
		],
		records: [], customSkills: [],
	};
	// 代表データ（12件）だけだと一覧が短く、組み替えなくても画面に入ってしまうので、
	// **マスターから40件**に膨らませる（数はここに書かず、下で ids から取る）。
	for (const w of [1280, 375]) {
		const ctx = await browser.newContext({ viewport: { width: w, height: w === 1280 ? 900 : 812 } });
		const page = await ctx.newPage();
		const errs = [];
		page.on('pageerror', (e) => errs.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
		await page.addInitScript((d) => localStorage.setItem('umaSkillDeck:userData', JSON.stringify(d)), bigData);
		await page.goto(base + '/special.html', { waitUntil: 'networkidle', timeout: 60000 });
		await page.waitForTimeout(1500);
		if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await page.waitForTimeout(300);
		// マスターの先頭40件に入れ替える（代表データの12件では一覧が短すぎる）
		await page.evaluate(() => {
			const ids = UmaSkillDeckCore.getMasterSkills().slice(0, 40).map(s => s.id);
			const d = UmaSkillDeckCore.getUserData();
			d.templates.forEach(t => { t.skillIds = ids.slice(); });
			UmaSkillDeckCore.saveUserData();
		});
		await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
		await page.waitForTimeout(1500);
		if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await page.waitForTimeout(300);
		/* 段8（C-120）で②の枠・見出し「スキルセット」を無くし、シナリオ因子／遺伝子のチェックを③の先頭の1行（#deck-scopes-bar）へ移した。
		   「3つが同じ行に並び文字の高さがそろう」「『スキルセット』が枠の左上に接する」の検査は、見張る対象が無くなったので外した
		   （新しい仕様は blocks-8.mjs の段8(D)(E)）。残すのは段K の目的そのもの ――
		   **セットを切り替えた直後に、チェックの状態が画面内にある**（いまは③のタブで、帯の一覧から切り替える）―― と、
		   ②の入口が1段で、スキルパネルの列数が切り替えで変わらないこと。 */
		await page.evaluate(() => { deckTemplateManager.setSelectedId('tpl_k_a'); selectStepTab(2, { noSave: true }); scrollTo(0, 0); });
		await page.waitForTimeout(500);

		const read = async () => {
			const s = await page.evaluate(() => {
				const secs = Array.from(document.querySelectorAll('#deck-scopes-bar [data-usd-scope-section]'));
				const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; };
				return {
					n: secs.length,
					// チェックが画面内にあるか
					checksInView: secs.length > 0 && secs.every(inView),
					checked: secs.map(s => s.querySelector('input[type="checkbox"]').checked),
				};
			});
			// 入口と列数は②のタブで測る（測ったら③へ戻す）
			await page.evaluate(() => selectStepTab(1, { noSave: true }));
			await page.waitForTimeout(200);
			const e = await page.evaluate(() => {
				const p = document.getElementById('deck-template-panel');
				const panels = Array.from(p.querySelectorAll('[data-usd-el="selected-list"] > *'));
				const firstY = panels.length ? Math.round(panels[0].getBoundingClientRect().top) : null;
				return {
					entryLines: new Set(Array.from(p.querySelectorAll('.usd-entry-row > button'))
						.map(e => Math.round(e.getBoundingClientRect().top))).size,
					cols: panels.filter(x => Math.round(x.getBoundingClientRect().top) === firstY).length,
				};
			});
			await page.evaluate(() => { selectStepTab(2, { noSave: true }); scrollTo(0, 0); });
			await page.waitForTimeout(200);
			return Object.assign(s, e);
		};

		const before = await read();
		assert(before.n === 2 && before.checked.every(Boolean) && before.checksInView,
			'段K(' + w + 'px): ON のチェックが画面内にある（③の先頭の1行）', before);

		// **セットを切り替える。** B は scopes を持たないのでチェックが外れる（C-2a の仕様）。
		// その変化が**画面に入っていること**が段K の目的。段8: 切り替えは共通の見出しの帯の一覧から
		await page.click('#deck-set-bar [data-usd-act="set-list"]');
		await page.click('[data-usd-el="set-list"] input[value="tpl_k_b"]');
		await page.waitForTimeout(600);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
		const after = await read();
		assert(after.checked.every(v => v === false) && after.checksInView,
			'段K(' + w + 'px): セットを切り替えた直後、外れたチェックが画面内で見える', after);
		/* **73セッション目に言い方を変えた。** 入口の並びは折り返さなくなった（横に送る形）ので、
		   「切り替えで段数が変わらない」は**どう転んでも通る検査**になった。
		   段数は**常に1**であることを直接言う形にして、意味を持たせている。 */
		assert(before.entryLines === 1 && after.entryLines === 1 && after.cols === before.cols && after.cols >= 1,   // 段9: 375px の一覧は1列（アイコンと × が入るので。2列から変えた）
		
			'段K(' + w + 'px): 入口は常に1段（折り返さない）で、スキルパネルの列数は切り替えで変わらない', { before, after });
		assert(errs.length === 0, '段K(' + w + 'px): コンソールエラーが出ない', errs.slice(0, 3));
		await ctx.close();
	}
}
});

/* ============================================================
 * 追加済みスキルの一括削除（C-3）
 *
 *   - A の入口の並びに常時見えている（削除モードに入らなくても押せる）
 *   - 消すのは**スキルと分類だけ**。セットの名前も B・C（節の ON/OFF）も残る
 *   - 保存済みの因子セットでも同じように使える
 *   - 「元に戻す」で戻る
 * ============================================================ */
// 「追加済みスキルの一括削除（C-3）」の塊は、段7b（2026-10-03）の ⑫で取り除いた。special の②から「リセット」ボタン（editor-clear-skills）が無くなった
// （名前の入力欄・保存・リセット・セットを削除は、タブの ✎ ✓ ↩ × に統合した）。中身を空にするのは「＋新規」の × → 確認の小窓 → OK で、
// 新しい塊「本育成パネルの追加修正（段7b…）」が見ている。Deck 単体ページの「リセット」は変えていないので、同じ塊の中で今のまま動くことを見る。

/* ============================================================
 * 因子を照合の対象に含める（C-2b）
 *
 *   - OFF のときは、3本立ても辞書も検出も**今までどおり**（因子が1つも混ざらない）
 *   - ON にすると辞書に因子の名前が入り、対象スキル数・検出数には**含めず別に数える**
 *   - 誤マッチのガード: 遺伝子は完全一致のみ（最小距離1）、シナリオ因子は距離1まで
 *   - 結果の表では因子の行に◆が付く（分類の◎○▲ とは別）
 *   - コピー用データには因子の行も入る
 * ============================================================ */
await block('因子を照合の対象に含める（C-2b）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	// 段8（C-120）で②のタブの帯を無くし、シナリオ因子／遺伝子のチェックを③の先頭（#deck-scopes-bar）へ移したので、
	// セットは setSelectedId で選び、③のタブを開いてチェックを押す
	await page.evaluate((id) => { deckTemplateManager.setSelectedId(id); selectStepTab(2, { noSave: true }); }, TEMPLATE_ID);
	await page.waitForTimeout(500);

	// 段8・D（C-120）: ②のタブの「N種」は②の先頭の N（ON のランクの種＋継承固有の種類数）。スキルの数そのものではなくなったので、
	// 期待値は製品の getSetSummary().factorKinds から取る（因子を含めないことは、ON にしても変わらないことで見る）
	const lists = () => page.evaluate(() => ({
		all: skillList.length, skills: skillOnlyList.length, factors: factorOnlyList.length,
		badge: document.getElementById('skill-count-badge').textContent,
		n: (deckTemplateManager.getSetSummary() || {}).factorKinds
	}));
	const off = await lists();
	assert(off.all === off.skills && off.factors === 0 && off.badge === off.n + '種',
		'C-2b: OFF のときは因子が1つも混ざらない（今までどおり）', off);

	// B（シナリオ因子）を ON にする（C-2c で1行になったので、そのままチェックを押せる）
	await page.click('#deck-scopes-bar [data-usd-act="scope-check"][data-scope="scenarioFactors"]');
	await page.waitForTimeout(400);
	const nFactor = await page.evaluate(() => UmaSkillDeckCore.getCatalogEntries('scenarioFactor').length);
	const on = await lists();
	assert(on.skills === off.skills && on.factors === nFactor && on.all === off.skills + nFactor,
		'C-2b: ON にすると辞書に因子が入り、スキルの数は変わらない', { off, on, nFactor });
	assert(on.badge === off.badge && on.n === off.n,
		'C-2b: ②のタブのバッジは因子を数えない（ON にしても変わらない）', { on: on.badge, off: off.badge });
	// 呼び名は製品側（FACTOR_SCOPES の label）から取る。検査にスキル名・呼び名を書かない（恒久ルール1）
	const scopeLabel = await page.evaluate(() => Object.fromEntries(FACTOR_SCOPES.map(s => [s.key, s.label])));
	// 段F-2 の並記をどこで見るか: **②の下の選択の注記は68セッション目に削除した**ので、
	// 見る先は統計カードの2行目だけになった（下の res の検査）。
	// 「片方だけ ON なら出ている側だけ書く」も、そこで一緒に見ている。

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
			// ◆（シナリオ因子）／◇（遺伝子）が付いている行と、◎○△ が付いている行
			// **段G で印を分け、段I-5 で「同じ菱形の塗りと白抜き」に落ち着いた。**
			diamond: rows.filter(r => r.querySelector('td .text-\\[var\\(--uma-mark-catalog\\)\\]'))
				.map(r => r.querySelector('td').textContent.replace(/^◆\s*/, '').trim()),
			heart: rows.filter(r => r.querySelector('td .text-\\[var\\(--uma-mark-gene\\)\\]'))
				.map(r => r.querySelector('td').textContent.trim()),
			diamondGlyphs: rows.filter(r => r.querySelector('td .text-\\[var\\(--uma-mark-catalog\\)\\]'))
				.map(r => r.querySelector('td .text-\\[var\\(--uma-mark-catalog\\)\\]').textContent),
			// 遺伝子は SVG なので、文字ではなく中身の path の d で見る（段G-2・段I-5）
			heartGlyphs: rows.filter(r => r.querySelector('td .text-\\[var\\(--uma-mark-gene\\)\\]'))
				.map(r => { const el = r.querySelector('td .text-\\[var\\(--uma-mark-gene\\)\\] svg path');
					return el ? el.getAttribute('d') : '(svg なし)'; }),
			wantHeartD: STITCH_DIAMOND_PATH_D_24,
			tierMarked: rows.filter(r => r.querySelector('td .uma-tier-mark')).length,
			copyLines: document.getElementById('copy-data').value.split('\n').length,
			kept: [names[0], names[1]].filter(n => factorSet.has(n)),
			detected: Array.from(personResults[0].detectedSkills).filter(n => factorSet.has(n)).sort(),
			expectKept: [names[0], names[1]].sort(), dropped: names[2]
		};
	});
	// ここはシナリオ因子だけを ON にした状態なので、**片方だけ ON なら出ている側だけ書く**
	// （遺伝子の呼び名は出てこない）ことも同時に見ている。
	assert(res.total === String(off.skills) && !res.totalFactorHidden
		&& res.totalFactor === '＋' + scopeLabel.scenarioFactors + nFactor + '種'
		&& !res.totalFactor.includes(scopeLabel.genes),
		'段F-2: 対象スキル数はスキルだけ。因子は別の行に節ごとに並べて書く（片方だけ ON ならその片方だけ）',
		{ total: res.total, totalFactor: res.totalFactor, hidden: res.totalFactorHidden });
	assert(res.detected.join() === res.expectKept.join(),
		'C-2b: 完全一致と「距離1で一意」の因子は残り、距離2の崩れは落ちる', { detected: res.detected, expect: res.expectKept, dropped: res.dropped });
	assert(res.found === '4' && res.foundFactor === '＋' + scopeLabel.scenarioFactors + '2',
		'段F-2: 検出数もスキルと因子で分けて数え、因子は節ごとに並べて書く（「種」は付かない）',
		{ found: res.found, foundFactor: res.foundFactor });
	// 段G: 印は節ごとに分かれた（段I-5 から ◆＝シナリオ因子／◇＝遺伝子）。
	// **この検査で見ているのはシナリオ因子だけを ON にした状態**（上の scopes の作り方による）。
	// 合計が因子の数と合い、遺伝子の◇は1つも出ていないこと。
	assert(res.diamond.length + res.heart.length === nFactor && res.tierMarked > 0,
		'C-2b: 因子の行には印、スキルの行には◎○▲（左の同じ欄）',
		{ diamond: res.diamond.length, heart: res.heart.length, tier: res.tierMarked });
	assert(res.diamondGlyphs.every(g => g === '◆') && res.heartGlyphs.every(g => g === res.wantHeartD),
		'段I-5(special): シナリオ因子は◆の文字・遺伝子は白抜きの菱形の SVG（塗り方で分かれている）',
		{ diamond: res.diamondGlyphs.slice(0, 3), heart: res.heartGlyphs.slice(0, 1) });
	assert(res.copyLines === off.skills + nFactor,
		'C-2b: コピー用データには因子の行も入る（表と同じ並び）', { copyLines: res.copyLines, expect: off.skills + nFactor });

	/* --- 段I(special): 判定結果の表に「印の無い行」が出ない ---
	   exam では 'plain'（その他の対象スキル）に印が無く、74行が裸だった（段I で直した）。
	   special は `tiers.of()` が既定（○）を返すので**セットに入っている行には必ず ◎○▲ が付く**。
	   ここはその前提が崩れていないかを見る番人 ―― 崩れたら exam と同じ症状が出る。
	   印の形は区分でばらばら（◆＝文字／♡と◎○▲＝SVG）なので、
	   **名前の前に <span> が置かれているか**で数える。 */
	const spBare = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('#result-tbody tr')].filter(r => r.querySelector('td'));
		const bare = rows.filter(r => {
			const first = r.querySelector('td').firstElementChild;
			return !first || first.tagName !== 'SPAN';
		});
		return {
			rows: rows.length, bare: bare.length,
			sample: bare.slice(0, 3).map(r => r.querySelector('td').textContent.replace(/\s+/g, ' ').trim().slice(0, 24)),
			// セットに入っているスキルは全部 deckTierByName を持つ（既定が返るので抜けない）
			tierNames: Object.keys(deckTierByName).length,
			tierMissing: skillOnlyList.filter(n => !deckTierByName[n]).length,
		};
	});
	assert(spBare.bare === 0 && spBare.tierMissing === 0,
		'段I(special): 判定結果の表に印の無い行が無い（tiers.of() が既定を返すので抜けない）', spBare);


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
	await page.click('#deck-scopes-bar [data-usd-act="scope-check"][data-scope="genes"]');
	await page.waitForTimeout(400);
	const both = await page.evaluate(() => {
		const names = UmaSkillDeckCore.getCatalogEntries('scenarioFactor').map(e => e.name);
		const genes = UmaSkillDeckCore.getCatalogEntries('geneFactor').map(e => e.name);
		const hitSkills = skillOnlyList.slice(0, 3);
		const lines = hitSkills.concat([names[0], genes[0], genes[1]])
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
			// 遺伝子は SVG（段G-2）。文字ではないので、中身の有無で数える
			hearts: rows.map(r => r.querySelector('td .text-\\[var\\(--uma-mark-gene\\)\\] svg path'))
				.filter(Boolean).map(el => el.getAttribute('d')),
			wantHeartD: STITCH_DIAMOND_PATH_D_24,
			// 検出したのは 因子1種＋遺伝子2種
			detectedGenes: genes.filter(n => personResults[0].detectedSkills.has(n)).length,
			// **スキルの検出数**（遺伝子が混ざっていないか。68セッション目に追加）。
			// 期待値はこのファイルに書かず、仕込んだスキルの数から取る。
			found: document.getElementById('stat-found-1').textContent,
			wantFound: hitSkills.length,
			twoScopes, oneScope,
			// 段F-2: 2つの節が並んで書かれるか。数え分けの合計が factorOnlyList と合うか。
			nFactor: names.length, nGene: genes.length,
			totalFactor: document.getElementById('stat-total-factor').textContent,
			foundFactor: document.getElementById('stat-found-factor-1').textContent,
			// 選択の注記（#deck-selected-note）は68セッション目に削除したので、並記を見るのは統計カードだけ
			scopeSum: Object.values(countFactorsByScope(factorOnlyList)).reduce((a, b) => a + b, 0),
			factorOnly: factorOnlyList.length,
			// 段F-2: 節ごとが「折り返さないまとまり」になっているか（数と単位が行をまたがないように）
			scopeSpans: [...document.getElementById('stat-total-factor').querySelectorAll('span')]
				.map(s => ({ text: s.textContent, ws: getComputedStyle(s).whiteSpace })),
		};
	});
	assert(both.diamonds.every(g => g === '◆') && both.hearts.every(g => g === both.wantHeartD)
		&& both.diamonds.length > 0 && both.hearts.length > 0,
		'段I-5(special): ◆と白抜きの◇が同じ表に並び、塗り方が混ざらない',
		{ diamonds: both.diamonds.length, hearts: both.hearts.length });
	/* --- 段F-2: 両方 ON なら**2つとも並ぶ**（合算しない） ---
	   ここが「＋ 因子 34種」に戻ったら落ちる。呼び名は製品の FACTOR_SCOPES から取っているので、
	   ②の行のラベルを変えたのに数え分けの文言を直し忘れれば、ここも落ちる。 */
	const wantTotal = '＋' + scopeLabel.scenarioFactors + both.nFactor + '種'
		+ '＋' + scopeLabel.genes + both.nGene + '種';
	assert(both.totalFactor === wantTotal,
		'段F-2: 両方 ON なら対象スキル数の下に2つを並べて書く（合算しない）',
		{ totalFactor: both.totalFactor, want: wantTotal });
	// 検出は 因子1種＋遺伝子2種。**「種」は付かない**（検出数は元からそう書いている）
	assert(both.foundFactor === '＋' + scopeLabel.scenarioFactors + '1＋' + scopeLabel.genes + '2',
		'段F-2: 検出数も2つを並べて書く', both.foundFactor);
	/* 数え分けの合計は factorOnlyList と必ず一致する。
	   一致しないと「どの節にも数えられない因子」が出て、画面の数だけが静かに減る
	   （印は付いているのに数に入らない、という食い違い）。**約束は検査にする**（F-65）。 */
	assert(both.scopeSum === both.factorOnly,
		'段F-2: 節ごとの数え分けの合計が、選んでいる因子の数と一致する',
		{ 節ごとの合計: both.scopeSum, factorOnlyList: both.factorOnly });
	/* 節ごとを「折り返さないまとまり」にしてある（factorCountHtml）。
	   素の文字のまま入れると、狭いカードで「＋遺伝子10 ／ 種」と**数と単位が行をまたぐ**
	   （1024px で6人ぶんを7列に並べたときに実際に起きた）。**約束は検査にする**（F-65）。 */
	assert(both.scopeSpans.length === 2 && both.scopeSpans.every(s => s.ws === 'nowrap')
		&& both.scopeSpans.map(s => s.text).join('') === wantTotal,
		'段F-2: 2行目は節ごとに折り返さないまとまりになっている（数と単位が行をまたがない）',
		both.scopeSpans);
	/* --- 段F-2: **対象に含めているのに1件も検出できなかった節は「0」と書く** ---
	   書かずに省くと「＋シナリオ因子1」だけが出て、**遺伝子を対象に入れていないように読める**。
	   「対象に入れたが0件だった」と「そもそも入れていない」は別のことなので、書き分ける。
	   （「出ている側だけ書く」が効くのは**節を ON にしているかどうか**で、検出数ではない。）
	   F-56 の型を避けるため、**実際に0件になる状態を1つ作って**確かめる。 */
	const zeroGene = await page.evaluate(() => {
		const keep = { r: personResults[0], l: personLines[0] };
		const names = UmaSkillDeckCore.getCatalogEntries('scenarioFactor').map(e => e.name);
		const lines = skillOnlyList.slice(0, 2).concat([names[0]])
			.map((t, i) => ({ text: t, stars: 1, starsReliable: true, rowKey: 'z' + i }));
		personResults[0] = applyFactorStrictMatch(
			matchAllSkillsWithStars(lines, skillList, skillIndex, {}), lines);
		personLines[0] = lines;
		renderResults();
		const out = { foundFactor: document.getElementById('stat-found-factor-1').textContent,
			hidden: document.getElementById('stat-found-factor-1').hidden };
		personResults[0] = keep.r; personLines[0] = keep.l; renderResults();
		return out;
	});
	assert(zeroGene.foundFactor === '＋' + scopeLabel.scenarioFactors + '1＋' + scopeLabel.genes + '0'
		&& !zeroGene.hidden,
		'段F-2: 対象に含めた節は、その人が0件でも「0」と書く（節ごと消さない）', zeroGene);
	/* ------------------------------------------------------------
	 * 段J-2(special): **スキルの検出が0件でも、因子・遺伝子の印は付く**
	 *
	 * exam 側と同じ考え方。印を置くのに要る材料だけを組んで、製品の
	 * drawTierMarksOnPerson() をそのまま呼び、置いた数を数える。
	 * special は tierCircleMetrics() が「列がちょうど2本」を要求するので、
	 * columnXs を2本だけ持たせる。
	 * ------------------------------------------------------------ */
	const spZero = await page.evaluate(() => {
		const factor = factorOnlyList.find((n) => factorMarkByNorm.get(normalizeText(n)) === 'factor');
		const gene = factorOnlyList.find((n) => factorMarkByNorm.get(normalizeText(n)) === 'gene');
		const skill = skillOnlyList.find((n) => deckTierByName[n]);
		const geo = [{ scale: 1, columnXs: [100, 300],
			rows: [{ y: 10, h: 24, col: 0 }, { y: 50, h: 24, col: 1 }, { y: 90, h: 24, col: 0 }] }];
		const lines = [{ text: factor, rowKey: '0:0' }, { text: gene, rowKey: '0:1' }, { text: skill, rowKey: '0:2' }];
		const mk = (names) => ({
			detectedSkills: new Set(names.filter(Boolean)),
			skillSources: Object.fromEntries(names.filter(Boolean).map((n) => [n, [lines.findIndex((l) => l.text === n)]])),
			skillStars: {}, matchReasons: {},
		});
		const prev = { g: personGeometry[0], l: personLines[0], r: personResults[0], t: tierMarksEnabled };
		personGeometry[0] = geo; personLines[0] = lines; tierMarksEnabled = true;
		const count = (names) => {
			personResults[0] = mk(names);
			const c = document.createElement('canvas');
			c.width = 600; c.height = 400;
			c._sourcePlacements = [];
			return drawTierMarksOnPerson(c, 0);
		};
		const both = count([factor, gene, skill]);
		const zero = count([factor, gene]);
		const onlySkill = count([skill]);
		personGeometry[0] = prev.g; personLines[0] = prev.l; personResults[0] = prev.r; tierMarksEnabled = prev.t;
		return { both, zero, onlySkill, 使った名前: { factor, gene, skill } };
	});
	assert(spZero.zero === 2,
		'段J-2(special): スキルの検出が0件でも、因子と遺伝子の印は付く（別勘定なので検出数に左右されない）', spZero);
	assert(spZero.both === 3 && spZero.onlySkill === 1,
		'段J-2(special): スキルも一緒に検出していれば3つとも付き、スキルだけなら1つ', spZero);
	/* **Deck が持つ菱形の写しが、stitch.js の計算と同じか**（段G-2・段I-5）。
	   Deck は stitch.js を読まないので js/uma-skill-deck.js に同じ文字列を写してある。
	   片方だけ直すと、Deck の比較シートだけ形が違う印になる。 */
	const deckHeart = fs.readFileSync(path.join(REPO_ROOT, 'js/uma-skill-deck.js'), 'utf-8')
		.match(/const DIAMOND_PATH_D_24 = '([^']+)'/);
	assert(deckHeart && deckHeart[1] === both.wantHeartD,
		'段I-5: Deck が持つ菱形の写しが js/stitch.js の計算と一致',
		{ deck: deckHeart ? deckHeart[1] : '(見つからない)', stitch: both.wantHeartD });
	assert(both.detectedGenes === 2,
		'段G(special): 遺伝子は完全一致で検出できている（印の分離が検出に影響していない）', both.detectedGenes);
	/* **スキルの検出数に遺伝子が混ざらない**（68セッション目に追加）。
	   ここまで遺伝子 ON で見ていたのは並記のほう（stat-found-factor-1）だけで、
	   **スキルの検出数そのもの（stat-found-1）は遺伝子 ON の状態で一度も見ていなかった** ――
	   「遺伝子が検出数に混ざる」回帰を捕まえる検査がどこにも無かった（68セッション目の下見で判明）。
	   仕込みは スキル3種＋シナリオ因子1種＋遺伝子2種 なので、混ざれば 3 が 5 や 6 になる。 */
	assert(both.found === String(both.wantFound) && both.detectedGenes > 0,
		'段F-2(special): 遺伝子を検出していても、スキルの検出数には入らない（別勘定）',
		{ found: both.found, want: both.wantFound, 検出した遺伝子: both.detectedGenes });
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
});

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
await block('special と exam の操作感を揃える（59セッション目・C-59 の段0〜段3）', async () => {
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

	// 段0-1) 因子周回を選んでいない（新UI。段7b の ⑪で「周回因子セット」を「因子周回」にした）
	// **C-63 の (7) で「このまま結合すると印は入りません」の後半を落とした** ―― 印が付くのは
	// 一体のボタンからだけになったので、「このまま結合すると」が指すものが無くなった。
	const s0 = await status();
	assert(s0.shown && s0.tone === 'warn' && s0.text === '②で因子周回を選ぶと、分類の印を付けられるようになります。',
		'段0: セット未選択のときは「②で選ぶと付けられる」と出る', s0);

	// 段0-2) セットを選ぶと**何も言わなくなる**（status() が③へ移しているので②へ戻してから押す）。
	// 60セッション目（C-61）は「一体のボタンなら印も焼ける」と案内していたが、
	// 61セッション目（C-62 の (8)-6）に**文面ごと削除した** ―― どのボタンを押すかは
	// すぐ上のボタンの並びが言っているので、言葉で重ねない。
	await page.evaluate(() => selectStepTab(1));
	await page.waitForTimeout(200);
	await page.evaluate((id) => deckTemplateManager.setSelectedId(id), TEMPLATE_ID);   // 段8（C-120）で②のタブの帯を無くしたので、セットは setSelectedId で選ぶ
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
});

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
await block('special の「OCR処理＋画像結合を開始する（高負荷）」（60セッション目・C-61）', async () => {
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
	await page.evaluate((id) => deckTemplateManager.setSelectedId(id), TEMPLATE_ID);   // 段8（C-120）で②のタブの帯を無くしたので、セットは setSelectedId で選ぶ
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
});

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
await block('C-62（61セッション目）: 棚卸しで挙がった11件', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	// 改修中の告知（C-62 の (11)）も既読にしてから先へ進む
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);

	/* --- (4) αテストの見せ方 --- */
	// 段7b の ⓪：タイトルの脇の「新UI」「一部αテスト中」のバッジは無くした（①のタブの中の赤い注意書きは残す。次の検査）
	assert((await page.$('#alpha-badge')) === null && (await page.$('#ui-mode-badge')) === null,
		'段7b(⓪): タイトルの脇の「一部αテスト中」「新UI」のバッジは無い');
	assert((await page.$('#deck-roster-alpha-btn')) === null,
		'C-62 (4): ①のタブの「αテスト」の開閉ボタンは無い');
	// (3) 「?」（説明）は入口ごと削除した（C-63 の (3)）
	assert((await page.$('#deck-roster-help-btn')) === null && (await page.$('#deck-roster-help')) === null,
		'C-63 (3): ①の「?」と、その中の説明文は無い');
	await page.evaluate(() => selectStepTab(0));
	await page.waitForTimeout(400);
	// 段7c（L）: ①のタブの赤い注意書き（αテスト中の機能です…）は削除した（C-115）。「一部αテスト中」のバッジ・開閉ボタンと同じく、もう無い
	assert((await page.$('#deck-roster-alpha')) === null && !(await page.textContent('#step-panel-0')).includes('結果が正しくないことがあります'),
		'段7c(L): ①のタブに赤い注意書き（αテスト中の機能です…）は出ない');

	/* --- (5)/(2) 除外N種。**①のタブの中**（②の件数バッジと同じ並び）へ移した（C-63 の (2)） --- */
	// 段7（2026-10-03）: 「除外N種」→「N種」（表に出ている●の数。編成が空なら 0種）
	assert(await page.isVisible('#deck-roster-excluded') && (await page.textContent('#deck-roster-excluded')).trim() === '0種',
		'C-62 (5)→段7: 編成が空のときも「0種」と出す', await page.textContent('#deck-roster-excluded'));
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
		'C-63 (2): 「N種」は①のタブの中の、ラベルの右にある', exclWhere);
	assert(exclWhere.cls.includes('step-tab-badge') && exclWhere.color === 'rgb(193, 0, 7)',
		'C-63 (2): 他のタブの件数バッジと同じ形で、色だけ赤（--uma-danger-text）', exclWhere);

	/* --- (1) ミニウィンドウの候補の色 --- */
	await page.click('#deck-roster-panel [data-usd-act="pick-card"][data-index="0"]');
	await page.waitForTimeout(400);

	/* --- F-61: ミニウィンドウは画面を基準に出る（69セッション目に直した）---
	   パネルの中に置くと、special の②を包む `.glass-card` の `backdrop-filter` のせいで
	   `position: fixed` の基準が「画面」ではなく「そのカード」になり、箱が画面の上へはみ出す
	   （直す前の実測: 上端が 375px で -210px、1280px で -52px）。**置き場所を body 直下へ移した**
	   ので、覆う矩形が画面とぴったり重なる。**箱の大きさではなく置き場所の問題**なので、
	   「いまは小さいから収まっている」では確かめたことにならない ―― 覆いの矩形そのものを測る。 */
	const modalBox = await page.evaluate(() => {
		const host = document.querySelector('[data-usd-el="roster-modal-host"]');
		const back = host && host.querySelector('.usd-roster-modal');
		const box = host && host.querySelector('.usd-roster-modal-box');
		if (!back || !box) return { missing: true };
		const r = back.getBoundingClientRect(), b = box.getBoundingClientRect();
		return {
			hostIsBodyChild: host.parentElement === document.body,
			inPanel: !!document.querySelector('#deck-roster-panel .usd-roster-modal'),
			覆い: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
			箱の上端: Math.round(b.top),
			画面: { w: window.innerWidth, h: window.innerHeight },
		};
	});
	assert(!modalBox.missing && modalBox.hostIsBodyChild && !modalBox.inPanel
		&& modalBox.覆い.top === 0 && modalBox.覆い.left === 0
		&& modalBox.覆い.w === modalBox.画面.w && modalBox.覆い.h === modalBox.画面.h
		&& modalBox.箱の上端 >= 0,
		'F-61: 編成のミニウィンドウは body 直下に出て、覆いが画面とぴったり重なる（カードを基準にしない）',
		modalBox);

	const pills = await page.evaluate(() => {
		const list = Array.from(document.querySelectorAll('[data-usd-el="roster-modal-host"] .usd-roster-pill'));
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
		const rows = [...document.querySelectorAll('[data-usd-el="roster-modal-host"] .usd-name-hit')];
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
	await page.click('[data-usd-el="roster-modal-host"] .usd-roster-pill:nth-of-type(2)');
	await page.waitForTimeout(400);
	// マウスが候補の上に乗っていると hover の地色が混ざるので、端へ逃がしてから読む
	await page.mouse.move(1, 1);
	await page.waitForTimeout(200);
	const filtered = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('[data-usd-el="roster-modal-host"] .usd-name-hit')];
		return [...new Set(rows.map((b) => getComputedStyle(b).backgroundColor))];
	});
	assert(filtered.length === 1 && filtered[0] !== 'rgba(0, 0, 0, 0)',
		'C-62 (1): 絞り込んだ後も色は残り、その種類の1色になる', filtered);
	await page.click('[data-usd-el="roster-modal-host"] .usd-roster-pill:nth-of-type(1)');
	await page.waitForTimeout(400);

	// 別々の種類のカードを2枚選ぶ（1枠目＝いちばん小さい番号、2枠目＝その次）
	const takeCard = async (slot, pillIndex) => {
		await page.click('#deck-roster-panel [data-usd-act="pick-card"][data-index="' + slot + '"]');
		await page.waitForTimeout(300);
		await page.click('[data-usd-el="roster-modal-host"] .usd-roster-pill:nth-of-type(' + (pillIndex + 1) + ')');
		await page.waitForTimeout(300);
		await page.click('[data-usd-el="roster-modal-host"] [data-usd-act="take"]');
		await page.waitForTimeout(500);
	};
	// 開いているミニウィンドウは×（閉じる）で閉じてから次へ（背景が押下を遮るため）
	await page.click('[data-usd-el="roster-modal-host"] .usd-roster-modal-head .uma-icon-btn');
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

	/* --- (5)→段7: カードを選ぶと「N種」が増える（「除外」の操作は段7で廃止。②の「本育成編成」は段7の塊で見る） --- */
	await page.evaluate(() => selectStepTab(0));
	await page.waitForTimeout(300);
	const after = (await page.textContent('#deck-roster-excluded')).trim();
	assert(/^[1-9]\d*種$/.test(after), 'C-62 (5)→段7: カードを選ぶと「N種」（表に出ている●の数）に変わる', { after });
	assert(errors.length === 0, 'C-62 (1)〜(6): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}
});

/* ============================================================
 * C-62 の (9): 結合画像への導線（引き出しの中のタブ）
 *
 * **引き出しは2つのまま**で、タブは「もう一方の引き出しへ行く」導線。
 * 段5（1引き出し＋タブへ統合）は引き続き見送り中なので、
 * #result-drawer と #stitch-drawer が両方あることも一緒に見ておく。
 * ============================================================ */
await block('C-62 の (9): 結合画像への導線（引き出しの中のタブ）', async () => {
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
});

/* ============================================================
 * C-62 の (11): 改修中の告知
 *
 * 画面の切り替えの告知（layout）とは**別のキー**で持つので、
 *   - 初めて開く人 … layout だけ出て、改修中のほうは「見たこと」になる
 *   - layout を既読の人 … 改修中のほうが1度だけ出る
 *   - 閉じたあと … もう出ない
 * ============================================================ */
await block('C-62 の (11): 改修中の告知', async () => {
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

	// 読み直し（右上の「新UI」バッジは段7b の ⓪で無くしたので、読み直しの関数を直接呼ぶ）は、これまでどおり layout のほう
	await page.evaluate(() => reopenUiNotice());
	await page.waitForTimeout(300);
	assert(await page.evaluate(() => !document.getElementById('ui-notice-body-layout').hidden
		&& document.getElementById('ui-notice-body-alpha').hidden),
		'C-62 (11): バッジからの読み直しは「画面の切り替え」のほう');
	await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(200);

	assert(errors.length === 0, 'C-62 (11): コンソールエラーが出ない', errors.slice(0, 3));
	await ctx.close();
}
});

/* ============================================================
 * C-62 の (11・裏）: 初めて開く人には layout だけ
 * ============================================================ */
await block('C-62 の (11・裏）: 初めて開く人には layout だけ', async () => {
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
});


/* ============================================================
 * 段7【5】収録スキルデータ（マスター）の取り回し（71セッション目）
 *
 * 70セッション目にレース場のタグを足した直後、実機で「福島を選ぶと0件」になり F5 で直った。
 * 原因は公開先の HTTP キャッシュ（Cache-Control: max-age=600）で、**更新から10分間は
 * 古い本文が再検証なしで返る**。版を ?v= に付けて避ける。あわせて、取りに行けなかったときに
 * **黙って古い写しで動かない**ようにした（それまで追加カタログ側にだけ知らせがあった）。
 *
 * **版の値は検査に書かない。** 画面から MASTER_JSON_VERSION と masterVersion を読んで突き合わせる。
 * ============================================================ */
await block('段7【5】収録スキルデータ（マスター）の取り回し（71セッション目）', async () => {
{
	const { ctx, page } = await openPage(browser, base, 'uma-skill-deck.html');

	// (a) 取得URLに ?v= が付いていて、値がマスターの masterVersion と同じ
	const urls = [];
	page.on('request', (r) => { if (r.url().includes('uma-skill-deck-skills.json')) urls.push(r.url()); });
	const first = await page.evaluate(() => UmaSkillDeckCore.loadMasterSkills(false));
	await page.waitForTimeout(300);
	const vers = await page.evaluate(() => ({
		定数: UmaSkillDeckCore.MASTER_JSON_VERSION,
		読んだ版: UmaSkillDeckCore.getMasterMeta().version,
		source: UmaSkillDeckCore.getMasterMeta().source,
	}));
	assert(first.ok && first.source === 'network', '段7: ふだんの取得はネットワークから成功する', first);
	assert(vers.定数 === vers.読んだ版,
		'段7: core の MASTER_JSON_VERSION が、実際に読めた masterVersion と同じ', vers);
	assert(urls.length > 0 && urls.every((u) => u.includes('v=' + vers.定数)),
		'段7: マスターの取得URLに ?v=<masterVersion> が付いている', urls.slice(0, 2));
	assert(!urls.some((u) => /\?[^?]*\?/.test(u)),
		'段7: 取得URLに「?」が2つ現れない（?v= と ?t= が衝突していない）', urls.slice(0, 2));

	// forceRefresh のときは ?v= に加えて &t= が付く（? を2つにしない）
	urls.length = 0;
	await page.evaluate(() => UmaSkillDeckCore.loadMasterSkills(true));
	await page.waitForTimeout(300);
	assert(urls.length > 0 && urls.every((u) => u.includes('v=' + vers.定数) && u.includes('&t=')),
		'段7: 再取得のときは ?v= の後ろに &t= が付く', urls.slice(0, 2));

	/* (a-2) data/ の6ファイルにも ?v= が付いている（71セッション目・段7の続き）。
	   マスターとまったく同じ理屈（公開先が max-age=600 で返すので、版を付けないと
	   更新から10分間は古い本文が返る）。**版は検査に書かない** ―― 製品が持つ
	   DATA_JSON_VERSIONS（パス → 版の表）を画面から読んで、取得URLと突き合わせる。
	   表そのものが各 JSON の dataVersion と合っているかは run-verify が見る。 */
	{
		const dataUrls = [];
		page.on('request', (r) => { if (/\/data\/[a-z0-9-]+\.json/.test(r.url())) dataUrls.push(r.url()); });
		const table = await page.evaluate(() => UmaSkillDeckCore.DATA_JSON_VERSIONS);
		// 追加カタログ（3本）と収録データ（3本）は入口が別なので、両方を読ませる
		await page.evaluate(() => UmaSkillDeckCore.loadMasterSkills(false));
		await page.evaluate(() => UmaSkillDeckCore.loadTrainingSources(true));
		// スキルPt の割引率の表（2026-09-30・段1）も入口が別（必要な画面が呼ぶ）。表に載る data/ の JSON は、これも含めて読ませる
		await page.evaluate(() => UmaSkillDeckCore.loadSkillPtData(true));
		await page.waitForTimeout(500);

		const paths = Object.keys(table);
		// **本数は data/ の実ファイルから数える**（2026-09-26・C-97 でレースの距離の一覧が7本目に入ったとき、
		// ここが「6」の決め打ちで落ちた。顔ぶれの一致そのものは run-verify §1 が見る）
		// **exam.html だけが読むもの**（めろっぷ用の行の並び。C-101）は exam の EXAM_DATA_JSON_VERSIONS が版を持ち、
		// core は読まないので、core の表の本数からは除く（両方の表で data/ を網羅していることは run-verify §1 が見る）
		const examOnly = (() => {
			const m = /const EXAM_DATA_JSON_VERSIONS = \{([\s\S]*?)\};/.exec(fs.readFileSync(path.join(REPO_ROOT, 'exam.html'), 'utf8'));
			return m ? [...m[1].matchAll(/'(data\/[a-z0-9-]+\.json)'/g)].map((x) => x[1]) : [];
		})();
		const dataFileCount = fs.readdirSync(path.join(REPO_ROOT, 'data')).filter((f) => f.endsWith('.json') && !examOnly.includes('data/' + f)).length;
		assert(examOnly.length > 0 && !paths.some((k) => examOnly.includes(k)),
			'段7の続き: exam だけが読む data/ のファイル（' + examOnly.join('・') + '）は core の表に載っていない', examOnly);
		assert(paths.length === dataFileCount, '段7の続き: 版の表が data/ の' + dataFileCount + 'ファイル（exam だけが読むものを除く）ぶんある', paths);
		// 必要になったときだけ読む data/（ⓘ・長押しを開いたとき。段6・2026-10-02）。ここ（ページの読み込みと各入口の呼び出し）では
		// 取りに行かないのが正しい。**ほかの全ファイルが取得されること**と、**これらが取得されていないこと**を別々に見る。
		// シナリオの固定イベント（段7c）は special が編成パネルを作るときにだけ読む。効果量の段階（C-129）は「低効果を除外」・オススメサポの「低効果」で初めて読む。
		// ②にまとめて追加するスキルのグループ（C-130）は、レースを選んだとき・②のパレットの行が見えたとき（脚質があるとき）に初めて読む
		const 遅延 = ['data/skill-descriptions.json', 'data/scenario-event-skills.json', 'data/skill-effect-levels.json', 'data/recommended-skills.json'];
		const 取れた = paths.filter((k) => dataUrls.some((u) => u.includes('/' + k)));
		const 対象 = paths.filter((k) => !遅延.includes(k));
		assert(遅延.every((k) => paths.includes(k)) && !遅延.some((k) => 取れた.includes(k)),
			'段7の続き: 必要になったときだけ読む data/（' + 遅延.join('・') + '）は、ページの読み込みや各入口の呼び出しでは取得されない', { 遅延, 取れた: 取れた.filter((k) => 遅延.includes(k)) });
		assert(対象.every((k) => 取れた.includes(k)),
			'段7の続き: ' + 対象.length + 'ファイル（必要になったときだけ読むものを除く）とも実際に取得された（検査が空振りでない）',
			{ 取れた: 取れた.length, 表: paths.length, 未取得: 対象.filter((k) => !取れた.includes(k)) });
		const 版が無い = paths.filter((k) =>
			dataUrls.filter((u) => u.includes('/' + k)).some((u) => !u.includes('v=' + table[k])));
		assert(版が無い.length === 0,
			'段7の続き: data/ の6ファイルの取得URLに ?v=<dataVersion> が付いている',
			{ 付いていない: 版が無い, 例: dataUrls.slice(0, 3) });
		assert(!dataUrls.some((u) => /\?[^?]*\?/.test(u)),
			'段7の続き: data/ の取得URLに「?」が2つ現れない（?v= と ?t= が衝突していない）', dataUrls.slice(0, 3));
		// forceRefresh を通した収録データ（3本）は ?v= の後ろに &t= が付く
		const 収録 = dataUrls.filter((u) => /training-umamusume|support-cards|support-card-event-skills/.test(u));
		assert(収録.length > 0 && 収録.every((u) => u.includes('v=') && u.includes('&t=')),
			'段7の続き: 再取得のときは data/ でも ?v= の後ろに &t= が付く', 収録.slice(0, 3));
	}

	/* (a-3) 追加カタログが古い写しへ落ちたときも知らせる（71セッション目・段7の続き）。
	   **ここが抜けていた** ―― 既存の知らせは「1件も読めなかったカテゴリ」しか見ておらず、
	   組み込みの写し（シナリオ因子・遺伝子）や localStorage の写し（拡張スキル）で
	   件数が埋まると、黙って古いもので動いていた。 */
	{
		const toastNow = () => page.evaluate(() => document.getElementById('toast-message').textContent.trim());
		await page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
		await page.route('**/data/*.json*', (route) => route.abort());
		const meta = await page.evaluate(() => UmaSkillDeckCore.loadExtraCatalog(true));
		await page.waitForTimeout(300);
		const 落ちた = (meta.sources || []).filter((x) => x.from !== '取得');
		assert(落ちた.length === (meta.sources || []).length && 落ちた.length > 0,
			'段7の続き: 通信を塞ぐと追加カタログは全カテゴリが写しへ落ちる', meta.sources);
		assert((meta.sources || []).every((x) => x.count > 0),
			'段7の続き: 写しへ落ちても件数は埋まる（＝黙って通ってしまう形だった）', meta.sources);
		const t = await toastNow();
		assert(t.length > 0, '段7の続き: 写しへ落ちたことを利用者に知らせる', t);
		await page.unroute('**/data/*.json*');
		// 通信を戻せば知らせは出ない（上の検査が「常に出る」ではないことの担保）
		await page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
		await page.evaluate(() => UmaSkillDeckCore.loadExtraCatalog(true));
		await page.waitForTimeout(400);
		assert((await toastNow()) === '', '段7の続き: ふつうに取れたときは知らせを出さない', await toastNow());
	}

	/* (b) 取りに行けなかったら、古い写しを使ったことを知らせる。
	   ここまでの取得で localStorage に写しが入っているので、通信だけを塞ぐ。 */
	const toastState = () => page.evaluate(() => {
		const t = document.getElementById('toast');
		return {
			text: document.getElementById('toast-message').textContent.trim(),
			見えている: !t.classList.contains('opacity-0'),
		};
	});
	await page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
	await page.route('**/uma-skill-deck-skills.json*', (route) => route.abort());
	const fell = await page.evaluate(() => UmaSkillDeckCore.loadMasterSkills(true));
	await page.waitForTimeout(300);
	const fellToast = await toastState();
	assert(fell.ok === false && fell.source === 'cache',
		'段7: 取りに行けないときは localStorage の写しへ落ちる', fell);
	assert(fellToast.見えている && fellToast.text.length > 0,
		'段7: 写しへ落ちたことを利用者に知らせる（黙って古いデータで動かない）', fellToast);
	assert(/（キャッシュ）$/.test(await page.evaluate(() => UmaSkillDeckCore.getMasterMeta().version)),
		'段7: データ管理タブに出る版にも「（キャッシュ）」が付く');
	assert(fell.count > 0, '段7: 写しへ落ちてもスキルは読めている（件数が0にならない）', fell.count);

	/* (c) 「再取得」は、取れなかったときに「更新しました」と言わない。
	   それまでは戻り値を見ていなかったので、通信できなくても成功の文だけが出ていた。 */
	await page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
	await page.evaluate(() => refreshMasterData());
	await page.waitForTimeout(400);
	const ngToast = await toastState();
	assert(!/更新しました/.test(ngToast.text),
		'段7: 再取得に失敗したときは「更新しました」と出ない', ngToast);
	assert(ngToast.見えている && ngToast.text.length > 0,
		'段7: 失敗したときも、何が起きたかは知らせる', ngToast);

	// 通信を戻せば、ふつうに「更新しました」と出る（上の検査が「常に出ない」ではないことの担保）
	await page.unroute('**/uma-skill-deck-skills.json*');
	await page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
	await page.evaluate(() => refreshMasterData());
	await page.waitForTimeout(600);
	const okToast = await toastState();
	assert(/更新しました/.test(okToast.text),
		'段7: 取れたときは「更新しました」と出る（失敗の検査が空振りでない）', okToast);
	assert((await page.evaluate(() => UmaSkillDeckCore.getMasterMeta().source)) === 'network',
		'段7: 再取得に成功するとネットワークの版に戻る');

	await ctx.close();
}
});

/* ============================================================
 * 段10（⑦）― 「条件で検索」のチェックを、モーダルを閉じても維持する（72セッション目）
 *
 * 段10 の前は `openPicker()` が `picker.filters` を毎回作り直していたので、
 * **閉じて開き直すたびに条件が白紙**になっていた（3件足して閉じると入れ直し）。
 * いまは `pickerFilters`（モジュールの変数）に持たせ、
 * **選択肢パネルの開閉（`pickerAxisPanelOpen`）と同じ寿命**にしてある
 * ―― どちらも**そのページを開いている間だけ**で、リロードで白紙に戻る。
 *
 * **このページだけを開く独立した塊にしてある。** 途中で `reload()` して
 * 「寿命がページ内だけ」を確かめるので、他の検査の状態を壊さないため。
 * ============================================================ */
await block('段10（⑦）― 「条件で検索」のチェックを、モーダルを閉じても維持する（72セッション目）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	await page.waitForTimeout(1500);
	await page.evaluate((id) => templateManager.openEditor(id), TEMPLATE_ID);
	await page.waitForTimeout(400);

	const openFilter = async () => {
		await page.click('#template-panel-root [data-usd-act="editor-pick"]');
		await page.waitForTimeout(700);
	};
	const closeModal = async () => {
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(400);
	};
	/* 見るのは4つ。**軸のキーも値も件数も検査に書かない**（製品の pickableAxes から取る）。
	   - checked … いま入っているチェック（軸.値 の組）
	   - count   … 絞り込み結果の件数（チェックが本当に効いているかは、これが動くことで見る）
	   - open    … 選択肢パネルが開いているか（段4 の続き。寿命を揃えた相手）
	   - keys    … localStorage の顔ぶれ（新しい保存先を作っていないことの確認） */
	const filterState = () => page.evaluate(() => ({
		checked: [...document.querySelectorAll('[data-usd-el="filter-check"]')]
			.filter((el) => el.checked).map((el) => el.dataset.axis + '.' + el.dataset.value),
		count: document.querySelector('[data-usd-el="result-count"]').textContent,
		open: document.querySelector('[data-usd-el="axis-tabs"]').getAttribute('data-usd-open'),
		summary: document.querySelector('[data-usd-el="filter-summary"]').textContent.trim(),
		keys: Object.keys(localStorage).sort().join(','),
	}));

	await openFilter();
	const bare = await filterState();
	// 1つ目の軸の1つ目の選択肢を押す（値は製品から取る）
	const pick = await page.evaluate(() => {
		const a = UmaSkillDeckCore.pickableAxes()[0];
		return { axis: a.key, value: UmaSkillDeckCore.pickableOptions(a)[0].v };
	});
	await page.click('[data-usd-el="filter-check"][data-axis="' + pick.axis + '"][data-value="' + pick.value + '"]');
	await page.waitForTimeout(400);
	const picked = await filterState();
	/* **空振り防止。** チェックしても件数が動かない値を選んでいたら、
	   このあとの「維持されている」は何も守らない（件数が同じままでも通ってしまう）。 */
	assert(picked.checked.length === 1 && picked.count !== bare.count,
		'段10: 検査で選んだ条件は、実際に絞り込み結果を動かしている（空振りの検査ではない）',
		{ 条件: pick, 件数: bare.count + '→' + picked.count });

	// (1) 閉じて開き直しても、チェックも件数も残る
	await closeModal();
	await openFilter();
	const again = await filterState();
	assert(again.checked.join() === picked.checked.join() && again.count === picked.count
		&& again.summary === picked.summary,
		'段10: モーダルを閉じて開き直しても「条件で検索」のチェックが残る',
		{ 前: picked, 後: again });

	// (2) 選択肢パネルの開閉と**同じ寿命**。畳んで閉じて開き直すと、両方そのまま
	await page.click('.usd-tab[data-usd-axis="' + pick.axis + '"]');   // 選択中を押して畳む
	await page.waitForTimeout(400);
	const folded = await filterState();
	assert(folded.open === 'false' && folded.checked.join() === picked.checked.join(),
		'段10: 畳んでもチェックは消えない（閉じるのは表示だけ）', folded);
	await closeModal();
	await openFilter();
	const both = await filterState();
	assert(both.open === 'false' && both.checked.join() === picked.checked.join(),
		'段10: 開き直したとき、チェックも選択肢パネルの開閉もそのまま（寿命が揃っている）',
		{ 畳み: both.open, チェック: both.checked });

	// (3) 「すべて解除」で消え、消えたまま開き直る（残り続けて困らない逃げ道がある）
	await page.click('[data-usd-act="filter-clear-all"]');
	await page.waitForTimeout(400);
	await closeModal();
	await openFilter();
	const cleared = await filterState();
	assert(cleared.checked.length === 0 && cleared.count === bare.count,
		'段10: 「すべて解除」で消え、開き直しても消えたまま', cleared);

	/* (4) **寿命はそのページを開いている間だけ。** リロードすると
	   **チェックも選択肢パネルの開閉も、そろって初期状態へ戻る**（これが「揃っている」の裏側）。
	   新しい保存先（localStorage のキー）を作っていないことも見る。 */
	/* **チェックを押す前に選択肢パネルを開く。** (3) のあとは畳んだままなので、
	   畳んだ状態の checkbox は見えず、そのまま押しにいくと待ちきれずに落ちる（実際に落ちた）。 */
	if ((await filterState()).open === 'false') {
		await page.click('.usd-tab[data-usd-axis="' + pick.axis + '"]');
		await page.waitForTimeout(300);
	}
	await page.click('[data-usd-el="filter-check"][data-axis="' + pick.axis + '"][data-value="' + pick.value + '"]');
	await page.waitForTimeout(300);
	await page.click('.usd-tab[data-usd-axis="' + pick.axis + '"]');   // 畳んだ状態にしてから
	await page.waitForTimeout(300);
	const beforeReload = await filterState();
	assert(beforeReload.checked.length === 1 && beforeReload.open === 'false',
		'段10: リロードの前は、チェックが入っていて選択肢パネルは畳んである', beforeReload);
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(2000);
	await page.evaluate((id) => templateManager.openEditor(id), TEMPLATE_ID);
	await page.waitForTimeout(400);
	await openFilter();
	const afterReload = await filterState();
	assert(afterReload.checked.length === 0 && afterReload.open === 'true'
		&& afterReload.count === bare.count,
		'段10: リロードするとチェックも開閉もそろって初期状態に戻る（寿命はページ内だけ）', afterReload);
	/* **比べる相手は「条件を1つも入れていなかったとき」の顔ぶれ**（`bare`）。
	   リロードの直前と比べると、**保存先を増やす壊し方をしても両方に同じキーが在って素通りする**
	   （段10 の破壊確認で実際に素通りした）。 */
	assert(afterReload.keys === bare.keys,
		'段10: 絞り込みの状態のために localStorage のキーを増やしていない',
		{ 条件を入れる前: bare.keys, リロード後: afterReload.keys });

	assert(errors.length === 0, '段10: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});

/* ============================================================
 * 段11（⑨）― A の地色と枠 ／ 入口の並びが常に見えている（72→73セッション目）
 *
 * ⑨ 「スキルセット」の枠を**わずかなグレーの面**に変え、**枠線を無くした**。
 *    出っ張り（札）も同じ色にして、線ではなく**色の一致**で一体に見せる。
 * ⑩（廃止）入口の並びを畳む見出し「スキルの追加」は、**73セッション目に外した**。
 *    入れた理由（375px で3段・130px を占める）が、並びを横に送る形にして1段（30px）に
 *    収めたことで消えたため。**いまは入口が常に見えている**ことを見る。
 *
 * **このページだけを開く独立した塊にしてある**（途中で reload するため）。
 * ============================================================ */
await block('段11（⑨）― A の地色と枠 ／ 入口の並びが常に見えている（72→73セッション目）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(500);

	/* ---- ⑨ 地色と枠 ----
	   **色の値は検査に書かず、:root から同じページで解決する**（段1・段9 と同じ形）。 */
	/* **段8（C-120）で外した。** ②は①と同じ白いパネルになり、A の枠（.uma-section--framed）・グレーの面・出っ張り（札）を無くしたので、
	   「A の中身と札が --uma-surface-group の面で塗られている」と、下の「パネルと周りの色差が ΔE 5.0 以上」は見張る対象が無くなった
	   （新しい仕様は blocks-8.mjs の段8(D)）。⑩（入口の並びが常に見えている）は残す。 */
	const look = await page.evaluate(() => ({ framed: document.querySelector('#deck-template-panel [data-usd-el="section-a"]').classList.contains('uma-section--framed') }));
	assert(!look.framed, '段8: ②の A は枠で囲わない（段11(⑨) のグレーの面と札は無くなった）', look);

	/* **「色は変わっているのに、変わったと分からない」を捕まえる**（72セッション目・段11 ⑨ のやり直し）。
	 *
	 * 上の2本は「札と本体が同じ値」「素の白ではない」しか見ていないので、
	 * **薄すぎて領域として読めない**状態を素通りした（実機で指摘を受けたのがこれ）。
	 * ここでは**スクリーンショットの画素**を読んで、パネルと**その周り**の色差を見る。
	 * `getComputedStyle` の値では足りない ―― `.glass-card` は `rgba(255,255,255,.9)` ＋
	 * `backdrop-filter` で、その下にページの地（グラデーション）があり、
	 * **周りの実際の色は真っ白ではない**（測ると #fbfbfa〜#ffffff）。
	 *
	 * **物差しは ΔE（CIE76）。** WCAG のコントラスト比は文字の読みやすさ用で、
	 * 明るい色どうしでは鈍い（今回の候補はどれも 1.01〜1.23 の範囲に潰れる）。
	 * ΔE は「並べたときに違って見えるか」の目安がはっきりしている:
	 *   〜2.3 … 見分けが付かない ／ 3〜5 … 近くで見れば分かる ／ 5〜 … はっきり違う
	 *
	 * **閾値は 5.0。** 実測で
	 *   slate-50（最初の版・薄すぎると言われた） … 1.72〜2.21
	 *   slate-100                                … 3.66〜4.40
	 *   slate-200（いまの --uma-surface-group）  … 8.50〜9.43
	 * なので、**「薄すぎる」と言われた値と、選んだ値のあいだ**に閾値が入る。
	 * いまの値には 1.7倍の余裕があり、周りの地を多少動かしても落ちない。
	 *
	 * 測る点は**文字もボタンも載っていない余白**を2つ ―― パネルの左の内側の余白と、
	 * 札の行のすぐ上の帯（カードの地がそのまま出ているところ）。**悪いほうで判定する。** */
	// （段8（C-120）で、ここにあった「パネルと周りの色差が ΔE 5.0 以上」の画素の検査を外した。理由は上の注記）

	/* ---- ⑩（廃止）入口の並びは常に見えている ----
	   **73セッション目に、畳む見出し「スキルの追加」を外した。**
	   入れた理由（375px で3段・130px）が、横に送る形にして1段（30px）に収めたことで消えたため。
	   **「開く操作をしなくても最初から4つある」**ことを見る（2026-09-27・C-100 で「未収録スキルを追加」を廃止して5→4）。 */
	const entryState = () => page.evaluate(() => {
		const p = document.getElementById('deck-template-panel');
		const row = p.querySelector('.usd-entry-row');
		return {
			見えている: row.offsetParent !== null,
			高さ: Math.round(row.getBoundingClientRect().height),
			ボタン数: row.querySelectorAll('button').length,
			// 畳む仕掛けの名残が1つも残っていないこと
			畳む見出し: !!p.querySelector('[data-usd-el="entry-toggle"]'),
			畳む入れ物: !!p.querySelector('[data-usd-el="entry-body"]'),
			見出しの文字: /スキルの追加/.test(p.textContent),
			向きの印: !!p.querySelector('.usd-entry-row .uma-section-caret'),
		};
	});
	const e0 = await entryState();
	/* **数そのものを見る**（73セッション目に「6つ」→「5つ」へ直した。段9 で「緑スキル」を
	   足したときに数え直さず 6 と書いたままで、判定が `> 1` だったので落ちずに残っていた）。 */
	assert(e0.見えている && e0.高さ > 0 && e0.ボタン数 === 5,
		'段11(⑩): 入口の並びは、開く操作をしなくても最初から見えている（4つ＋先頭の「オススメサポ」＝5つ）', e0);
	assert(!e0.畳む見出し && !e0.畳む入れ物 && !e0.見出しの文字 && !e0.向きの印,
		'段11(⑩): 畳む見出し「スキルの追加」と開閉の仕掛けは残っていない', e0);

	/* **描き直しをまたいでも消えない。** 別のセットのタブへ移って戻る（`render()` が走る）。 */
	await page.evaluate((id) => deckTemplateManager.setSelectedId(id), TEMPLATE_ID);   // 段8（C-120）で②のタブの帯を無くしたので、セットは setSelectedId で選ぶ
	await page.waitForTimeout(400);
	const e2 = await entryState();
	await page.evaluate(() => deckTemplateManager.setSelectedId('__draft__'));   // 段8（C-120）: 帯のタブの代わりに setSelectedId
	await page.waitForTimeout(400);
	const e3 = await entryState();
	assert(e2.見えている && e2.ボタン数 === 5 && e3.見えている && e3.ボタン数 === 5,
		'段11(⑩): 因子セットを切り替えても入口は見えたまま', { 移った先: e2, 戻った: e3 });

	/* **開き直しても同じ。** 状態を持たなくなったので、リロードで変わるものが無い。
	   `localStorage` に保存先を増やしていないことも、そのまま見張り続ける。 */
	const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort().join(','));
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForTimeout(2500);
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(400);
	const e5 = await entryState();
	const keysAfter = await page.evaluate(() => Object.keys(localStorage).sort().join(','));
	assert(e5.見えている && e5.ボタン数 === 5 && e5.高さ === e0.高さ,
		'段11(⑩): リロードしても入口は最初から4つ見えていて、高さも同じ', { 前: e0, 後: e5 });
	assert(keysAfter === keysBefore,
		'段11(⑩): 入口の並びのために localStorage のキーを増やしていない', { 前: keysBefore, 後: keysAfter });

	assert(errors.length === 0, '段11: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});

/* ============================================================
 * 73セッション目 ― 「リセット」の押せる条件（消すものが1つも無いときだけ押せない）
 *
 * 消す対象が**スキル・分類・B・C**に広がったので、
 * **スキルが0種でも B か C にチェックが入っていれば押せる**。
 * ここはドラフト（保存していないセット）で見る ―― C-3 の塊は保存済みのセットを見ているので、
 * **ドラフトと保存済みで動きが分かれていない**ことも一緒に確かめられる。
 * ============================================================ */
// 「73セッション目 ― 「リセット」の押せる条件」の塊は、段7b（2026-10-03）の ⑫で取り除いた（special の②に「リセット」ボタンが無くなったため。上の注記を参照）。

/* ============================================================
 * 【INTENTIONALLY_REMOVED・2026-09-24（74セッション目・第2回の段1）】
 * 「73セッション目 ― card-event-input.html の軸のルールの注記」の塊（7項目）を消した。
 *
 * **`card-event-input.html` の「スキルのタグ付け」の画面を撤去したので、見る対象そのものが無くなった。**
 * タグの正本は外部データの取得・整形の専用フォルダにあるマスターのブックで、説明文から規則で作る
 * （C-75・C-76）。ツール側で手でタグを付ける画面を残すと正本が2つになるため、画面ごとやめた。
 *
 * **消した塊が見ていたもの**: タグ編集欄の軸ごとの注記が `core` の印（`axisHasSpecialRule` /
 * `axisRuleHint`）から作られていること／先頭の注記が本数を書かないこと／排他の軸にも注記が出ること／
 * 文がモーダル側とまったく同じであること。
 *
 * **失っていない検査**: `axisRuleHint()` / `axisHasSpecialRule()` そのものは
 * 「条件で検索」のモーダル側（`renderPickerFilterAxes`）でも使っており、
 * **同じ文が出ることは `test:master` の軸の印の検査と、モーダルの注記で引き続き見ている。**
 * `card-event-input.html` が構文エラー無しで読めることは `test:verify` の §5 が見る。
 * ============================================================ */

/* ============================================================
 * 73セッション目 ― 入口の並びを狭い幅で横1行にする（スワイプ）
 *
 * **幅の px を期待値に書かない。** 「その幅で収まっているか」（scrollWidth と clientWidth の関係）を
 * 先に読み、収まっているとき／いないときで見るものを変える。幅は**標本にすぎない**。
 *
 * **空振り防止**（71セッション目の申し送り）―― 試した幅の中に**収まる幅と収まらない幅が両方あること**を
 * 見る。片側しか起きていなければ、条件分岐のどちらかが一度も通っていない。
 *
 * **手直し（73セッション目・実機の指摘を受けて）**
 *   実機で「次の入口があることに気づけない幅」が見つかった。ボタンの境目と表示範囲の右端が
 *   **ぴったり一致する幅が、境目の数だけ現れる**（320〜1280px を 2px 刻みで測ると、あふれる幅の1割強）。
 *   ① 切り詰め（`--usd-entry-trim`）で、その幅では直前のボタンが必ず切れて見えるようにした。
 *   ② 隠れている側にだけフェードを出す（`data-usd-fade`）。
 *   そのため、**前にあった「端に霞みを付けていない」は仕様と逆になったので作り直した。**
 * ============================================================ */
await block('73セッション目 ― 入口の並びを狭い幅で横1行にする（スワイプ）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(400);

	const SEL = '#deck-template-panel .usd-entry-row';
	// 幅を変えたあと、ResizeObserver と resize の後始末が済むまで待つ
	const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

	const read = (sel) => page.evaluate((s) => {
		const row = document.querySelector(s);
		if (!row) return null;
		const btns = [...row.children].filter((c) => c.tagName === 'BUTTON');
		const cs = getComputedStyle(row);
		const rect = row.getBoundingClientRect();
		// 右端をまたいでいる＝途中で切れて見えているボタン
		let 見えている幅 = 0, 隠れている幅 = 0, 切れているボタン = null;
		for (const b of btns) {
			const r = b.getBoundingClientRect();
			if (r.left < rect.right - 0.5 && r.right > rect.right + 0.5) {
				見えている幅 = Math.round((rect.right - r.left) * 10) / 10;
				隠れている幅 = Math.round((r.right - rect.right) * 10) / 10;
				切れているボタン = b.textContent.trim();
				break;
			}
		}
		return {
			段数: new Set(btns.map((b) => Math.round(b.offsetTop))).size,
			ボタン数: btns.length,
			子の顔ぶれ: [...new Set([...row.children].map((c) => c.tagName))],
			収まっている: row.scrollWidth <= row.clientWidth + 1,
			あふれ: Math.round(row.scrollWidth - row.clientWidth),
			見えている幅, 隠れている幅, 切れているボタン,
			折り返し: cs.flexWrap,
			横: cs.overflowX,
			// **スクロールバーは「描かれていないこと」ではなく「隠す指定が効いていること」で見る。**
			// ヘッドレスの Chrome は既定でバーを描かないので、厚みだけ見ても何も確かめたことにならない。
			バーを隠す指定: cs.scrollbarWidth,
			バーの厚み: row.offsetHeight - row.clientHeight,
			フェード: row.getAttribute('data-usd-fade'),
			マスク: (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none'),
			切り詰め: Math.round(parseFloat(cs.getPropertyValue('--usd-entry-trim')) || 0),
			高さ: Math.round(rect.height),
			ボタンの高さ: btns[0] ? Math.round(btns[0].getBoundingClientRect().height) : 0,
		};
	}, sel);

	const sweep = async (sel, widths) => {
		const out = [];
		for (const [w, h] of widths) {
			await page.setViewportSize({ width: w, height: h });
			await settle();
			out.push({ 幅: w, ...(await read(sel)) });
		}
		return out;
	};

	const WIDTHS = [[1280, 900], [768, 1024], [375, 812]];

	for (const バッジ of ['無し', '有り']) {
		if (バッジ === '有り') {
			// 緑スキルを4件足して件数バッジを出す（本物の経路で）
			await page.setViewportSize({ width: 1280, height: 900 });
			await page.waitForTimeout(300);
			await page.click('#deck-template-panel [data-usd-act="editor-pick-passive"]');
			await page.waitForTimeout(700);
			const ids = await page.evaluate(() =>
				[...document.querySelectorAll('[data-usd-el="passive-check"]')].filter((c) => !c.checked).slice(0, 4).map((c) => c.value));
			for (const id of ids) {
				await page.click('[data-usd-el="passive-check"][value="' + id + '"]');
				await page.waitForTimeout(150);
			}
			await page.click('[data-usd-act="picker-close"]');
			await page.waitForTimeout(500);
			assert(await page.evaluate(() => !document.querySelector('#deck-template-panel [data-usd-el="passive-added"]').hidden),
				'横1行(バッジ有り): 緑スキルの件数バッジが出ている状態を作れた');
		}

		const got = await sweep(SEL, WIDTHS);
		const 収まる = got.filter((g) => g.収まっている);
		const 収まらない = got.filter((g) => !g.収まっている);

		// (1) どの幅でも1段。折り返さない。＝バッジの有無で段が増えない（前は 768px で 1→2段になった）
		assert(got.every((g) => g.段数 === 1 && g.折り返し === 'nowrap'),
			'横1行(バッジ' + バッジ + '): どの幅でも入口は1段で、折り返さない',
			got.map((g) => ({ 幅: g.幅, 段数: g.段数, 高さ: g.高さ })));
		assert(new Set(got.map((g) => g.高さ)).size === 1,
			'横1行(バッジ' + バッジ + '): 行の高さが幅によって変わらない', got.map((g) => ({ 幅: g.幅, 高さ: g.高さ })));
		// **ボタンの大きさは幅で切り替えない**（境目の幅で揺れないように、どの幅でも同じ寸法）
		assert(new Set(got.map((g) => g.ボタンの高さ)).size === 1,
			'横1行(バッジ' + バッジ + '): ボタンの大きさは幅で切り替えない（狭いときだけ詰める形にしない）',
			got.map((g) => ({ 幅: g.幅, ボタンの高さ: g.ボタンの高さ })));

		// (2) 空振り防止 ―― 収まる幅と収まらない幅が両方あること
		assert(収まる.length > 0 && 収まらない.length > 0,
			'横1行(バッジ' + バッジ + '): 試した幅に「収まる」と「収まらない」が両方ある（片側だけなら下の判定が空振り）',
			{ 収まる: 収まる.map((g) => g.幅), 収まらない: 収まらない.map((g) => g.幅) });

		// (3) 収まるときは、いままでどおりの普通の1行（送るものが無い・切れない・フェードも出ない）
		assert(収まる.every((g) => g.あふれ === 0 && g.切れているボタン === null && g.切り詰め === 0),
			'横1行(バッジ' + バッジ + '): 収まる幅では普通の1行のまま（あふれ0・切れているボタン無し・切り詰め0）',
			収まる.map((g) => ({ 幅: g.幅, あふれ: g.あふれ, 切れ: g.切れているボタン, 切り詰め: g.切り詰め })));
		assert(収まる.every((g) => !g.フェード && !g.マスク),
			'横1行(バッジ' + バッジ + '): 収まる幅ではどちらの端にもフェードを出さない',
			収まる.map((g) => ({ 幅: g.幅, フェード: g.フェード, マスク: g.マスク })));

		// (4) 収まらないときは横に送れて、端でボタンが切れて見える（＝続きがある合図）
		assert(収まらない.every((g) => g.あふれ > 0 && g.切れているボタン !== null),
			'横1行(バッジ' + バッジ + '): 収まらない幅では横に送れて、端でボタンが切れて見える',
			収まらない.map((g) => ({ 幅: g.幅, あふれ: g.あふれ, 切れ: g.切れているボタン })));
		// **初期状態（左端）では右だけにフェード。** 隠れているのは右側だけだから。
		assert(収まらない.every((g) => g.フェード === 'right' && g.マスク),
			'横1行(バッジ' + バッジ + '): 収まらない幅の初期状態では、隠れている右側にだけフェードが出る',
			収まらない.map((g) => ({ 幅: g.幅, フェード: g.フェード })));

		// (5) 矢印・「端へ移動」は足さない／スクロールバーは**隠す指定**が効いている
		assert(got.every((g) => g.バーを隠す指定 === 'none'),
			'横1行(バッジ' + バッジ + '): スクロールバーを隠す指定（scrollbar-width: none）が効いている',
			got.map((g) => ({ 幅: g.幅, 指定: g.バーを隠す指定, 厚み: g.バーの厚み })));
		assert(got.every((g) => g.子の顔ぶれ.length === 1 && g.子の顔ぶれ[0] === 'BUTTON' && g.ボタン数 === 5),
			'横1行(バッジ' + バッジ + '): 並びの中身は入口のボタン5つだけ（矢印や「端へ移動」を足していない。C-100 で5→4、段5 で先頭に「オススメサポ」を足して5）',
			got.map((g) => ({ 幅: g.幅, 子: g.子の顔ぶれ, 数: g.ボタン数 })));
	}

	/* (6) **幅を細かく変えても、右端で必ずボタンが切れて見える。**
	   ここが今回の手直しの本体。**ぴったり一致する幅を作らない**ことを、
	   細かい刻みで実際に確かめる（幅は標本で、期待値には使わない）。
	   刻みは、切り詰めが働く幅の並び（20px ほど続く）を跨げる程度に細かく取る。 */
	const MIN見え = 12;    // 切れているボタンが、これだけは見えていること
	const MIN隠れ = 6;     // かつ、これだけは隠れていること（＝切れているとはっきり分かる）
	const 細かい = [];
	for (let w = 320; w <= 700; w += 7) {
		await page.setViewportSize({ width: w, height: 812 });
		await settle();
		細かい.push({ 幅: w, ...(await read(SEL)) });
	}
	const あふれた = 細かい.filter((g) => !g.収まっている);
	const 気づけない = あふれた.filter((g) => g.切れているボタン === null || g.見えている幅 < MIN見え || g.隠れている幅 < MIN隠れ);
	assert(あふれた.length > 10,
		'横1行: 細かく測った幅のうち、あふれる幅が十分な数ある（空振り防止）', { 測った: 細かい.length, あふれた: あふれた.length });
	assert(気づけない.length === 0,
		'横1行: 幅を細かく変えても、初期状態で右端のボタンが必ず切れて見える（続きがあると分かる）',
		気づけない.slice(0, 6).map((g) => ({ 幅: g.幅, 見え: g.見えている幅, 隠れ: g.隠れている幅, 切り詰め: g.切り詰め })));
	// 切り詰めは「必要なときだけ」働く（いつも入っていたら、ただの余白になってしまう）
	assert(あふれた.some((g) => g.切り詰め > 0) && あふれた.some((g) => g.切り詰め === 0),
		'横1行: 切り詰めは必要な幅でだけ働く（いつも入っている／一度も入らない のどちらでもない）',
		{ 働いた: あふれた.filter((g) => g.切り詰め > 0).length, 働かない: あふれた.filter((g) => g.切り詰め === 0).length });

	// (7) フェードは「隠れている側だけ」。送るにつれて右→両側→左と変わる
	await page.setViewportSize({ width: 375, height: 812 });
	await settle();
	const フェードの動き = await page.evaluate(async (s) => {
		const row = document.querySelector(s);
		const wait = () => new Promise((r) => setTimeout(r, 150));
		const out = {};
		row.scrollLeft = 0; await wait(); out.初期 = row.getAttribute('data-usd-fade');
		row.scrollLeft = Math.round((row.scrollWidth - row.clientWidth) / 2); await wait(); out.途中 = row.getAttribute('data-usd-fade');
		row.scrollLeft = row.scrollWidth; await wait(); out.末尾 = row.getAttribute('data-usd-fade');
		const last = row.querySelector('button:last-child').getBoundingClientRect();
		const rect = row.getBoundingClientRect();
		out.末尾で最後の入口が丸ごと見える = last.left >= rect.left - 0.5 && last.right <= rect.right + 0.5;
		row.scrollLeft = 0; await wait();
		return out;
	}, SEL);
	assert(フェードの動き.初期 === 'right' && フェードの動き.途中 === 'both' && フェードの動き.末尾 === 'left',
		'横1行: フェードは隠れている側にだけ出る（初期＝右／途中＝両側／末尾＝左）', フェードの動き);
	assert(フェードの動き.末尾で最後の入口が丸ごと見える,
		'横1行: 横に送ると末尾まで行けて、最後の入口が丸ごと見える（切り詰めは末尾では邪魔をしない）', フェードの動き);

	// (8) ボタンを詰めた ―― 同じ画面の他の .uma-btn より小さい（px は書かない）
	const 大きさ = await page.evaluate((s) => {
		const e = document.querySelector(s + ' .uma-btn');
		// 段7b の ⑫：「保存」ボタンは無くなったので、既定の大きさの .uma-btn を一時的に置いて比べる
		const o = document.createElement('button'); o.type = 'button'; o.className = 'uma-btn uma-btn--secondary'; o.textContent = '比べる'; document.querySelector('#deck-template-panel').appendChild(o);
		const r = (x) => { const c = getComputedStyle(x); return { 高さ: Math.round(x.getBoundingClientRect().height), 文字: parseFloat(c.fontSize), 左右の余白: parseFloat(c.paddingLeft) }; };
		const res = { 入口: r(e), ほかのボタン: r(o) };
		o.remove();
		return res;
	}, SEL);
	assert(大きさ.入口.高さ < 大きさ.ほかのボタン.高さ
		&& 大きさ.入口.文字 < 大きさ.ほかのボタン.文字
		&& 大きさ.入口.左右の余白 < 大きさ.ほかのボタン.左右の余白,
		'横1行: 入口のボタンは、同じ画面の他のボタンより縦も横も文字も小さい', 大きさ);

	// (9) 並び順は変えていない（使用頻度の高いものが先頭）
	const 並び = await page.evaluate((s) =>
		[...document.querySelectorAll(s + ' button')].map((b) => b.dataset.usdAct), SEL);
	// 2026-09-27（C-100）に末尾の「未収録スキルを追加」（editor-pick-custom）を廃止した。残りの順は変えていない
	assert(並び.join(',') === 'outside-open,editor-pick,editor-pick-passive,editor-pick-text,editor-pick-screenshot',
		'横1行: 入口の並び順は変えていない', 並び);

	assert(errors.length === 0, '横1行: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}

/* --- Deck の比較シート編集の入口（uma-skill-deck.html が自前で持っている並び） ---
   **core の .usd-entry-row を通らない**ので、core 側だけ直すと画面の中で振る舞いが割れる
   （71セッション目・段6 で文言のときに実際に踏んだ）。同じ形になっていることを見る。 */
{
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	await page.waitForTimeout(400);
	await page.click('#tab-btn-record');
	await page.waitForTimeout(400);
	await page.evaluate((id) => openRecordEditor(id), RECORD_ID);
	await page.waitForTimeout(800);

	const SEL = '#record-editor-view .usd-entry-row';
	const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
	assert(await page.evaluate((s) => !!document.querySelector(s), SEL),
		'横1行(deck): 比較シート編集の入口にも .usd-entry-row が当たっている（core 側だけ直していない）');

	const got = [];
	for (const [w, h] of [[1280, 900], [375, 812]]) {
		await page.setViewportSize({ width: w, height: h });
		await settle();
		got.push({ 幅: w, ...(await page.evaluate((s) => {
			const row = document.querySelector(s);
			const btns = [...row.children].filter((c) => c.tagName === 'BUTTON');
			const rect = row.getBoundingClientRect();
			const cs = getComputedStyle(row);
			let 見えている幅 = 0, 隠れている幅 = 0, 切れ = null;
			for (const b of btns) {
				const r = b.getBoundingClientRect();
				if (r.left < rect.right - 0.5 && r.right > rect.right + 0.5) {
					見えている幅 = Math.round((rect.right - r.left) * 10) / 10;
					隠れている幅 = Math.round((r.right - rect.right) * 10) / 10;
					切れ = b.textContent.trim(); break;
				}
			}
			return {
				段数: new Set(btns.map((b) => Math.round(b.offsetTop))).size,
				収まっている: row.scrollWidth <= row.clientWidth + 1,
				あふれ: Math.round(row.scrollWidth - row.clientWidth),
				見えている幅, 隠れている幅, 切れ,
				折り返し: cs.flexWrap,
				バーを隠す指定: cs.scrollbarWidth,
				フェード: row.getAttribute('data-usd-fade'),
				マスク: (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none'),
				下の余白: cs.marginBottom,
				ボタンの高さ: btns[0] ? Math.round(btns[0].getBoundingClientRect().height) : 0,
			};
		}, SEL)) });
	}
	assert(got.every((g) => g.段数 === 1 && g.折り返し === 'nowrap' && g.バーを隠す指定 === 'none'),
		'横1行(deck): 比較シート編集の入口も1段・折り返さない・スクロールバーを隠す指定が効いている', got);
	assert(got.some((g) => g.収まっている) && got.some((g) => !g.収まっている),
		'横1行(deck): 収まる幅と収まらない幅が両方ある（空振り防止）', got.map((g) => ({ 幅: g.幅, 収まっている: g.収まっている })));
	assert(got.filter((g) => !g.収まっている).every((g) => g.あふれ > 0 && g.切れ !== null && g.フェード === 'right' && g.マスク),
		'横1行(deck): 収まらない幅では端でボタンが切れ、右側にだけフェードが出る', got);
	assert(got.filter((g) => g.収まっている).every((g) => !g.フェード && !g.マスク),
		'横1行(deck): 収まる幅ではフェードを出さない', got);
	assert(new Set(got.map((g) => g.ボタンの高さ)).size === 1,
		'横1行(deck): ボタンの大きさは幅で切り替えない', got.map((g) => ({ 幅: g.幅, 高さ: g.ボタンの高さ })));
	/* **下の余白は元のまま（8px）。** core の既定（12px）をそのまま当てると、
	   この画面だけ余白が広がってしまうので `--inline` で戻している。 */
	assert(got.every((g) => g.下の余白 === '8px'),
		'横1行(deck): 下の余白は元の 8px のまま（--inline が効いている）', got.map((g) => g.下の余白));

	assert(errors.length === 0, '横1行(deck): コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});

/* ============================================================
 * カスタムスキルの廃止（2026-09-27・C-100）
 *
 * 作る手段は無くしたが、**保存済みのカスタムスキルは消さず・書き換えず、入っている場所でだけ使える**。
 * 検索の一覧（条件で検索・緑スキル・テキストで検索・入力して探す）からは外す。
 * 利用者への知らせは出さない（おいもさんの決定）。
 *
 * 保存データにカスタムスキル2件と、それを含むスキルセット・比較シートを仕込んで、次を見る:
 *   - スキルセット（Deck・special の周回因子セット）と比較シートに、同じ名前・同じ分け方で出る
 *   - special の照合の辞書に入る
 *   - Deck の読み取り結果の受け取り口（名前 → id）では今までどおり引ける（外すと、カスタムスキルの
 *     入ったセットで読み取った結果を Deck へ渡したとき、その行だけ落ちる）
 *   - 条件で検索・緑スキル・テキストで検索・入力して探すには出ない
 *   - 書き出しに customSkills が含まれる／古いバックアップを読み込める
 *   - 起動しても保存データが書き換わらない
 * ============================================================ */
await block('カスタムスキルの廃止 ―― 保存済みのものは入っている場所でだけ使える（C-100）', async () => {
{
	const C1 = { customId: 'custom_c100a', name: '検査用の自作スキル（中距離）', tags: { distance: ['medium'], effect: ['target_speed_up'] }, createdAt: '2026-09-01T00:00:00.000Z' };
	const C2 = { customId: 'custom_c100b', name: '検査用の自作スキル（タグなし）', tags: {}, createdAt: '2026-09-02T00:00:00.000Z' };
	const TPL = 'tpl_c100';
	const REC = 'rec_c100';
	const SEED = {
		schemaVersion: 5,
		templates: [
			{ templateId: TPL, name: '自作スキル入りのセット', skillIds: [PICK[0].id, C1.customId, PICK[1].id, C2.customId],
				tiers: { [C1.customId]: 1 }, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' },
		],
		records: [
			{ recordId: REC, name: '自作スキル入りの比較', sourceTemplateId: TPL,
				skillIds: [PICK[0].id, C1.customId, PICK[1].id, C2.customId],
				candidates: [{ candidateId: 'c_a', label: '親A', enabled: true }, { candidateId: 'c_b', label: '親B', enabled: true }],
				cells: { [PICK[0].id]: { c_a: 1 }, [C1.customId]: { c_a: 3, c_b: 2 } }, ocrCells: {},
				createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z' },
		],
		customSkills: [C1, C2],
	};
	const SEED_TEXT = JSON.stringify(SEED);
	const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	/* 段9（C-121）: この SEED は tiers を持つ（schemaVersion 5）ので、読み込み時の移行（tiers → skillIcons。schemaVersion 7）が1回だけ走って保存し直される。
	   「起動しても1バイトも書き換わらない」は、**移行で足されるもの（skillIcons・schemaVersion）を除いて**、自作スキル・比較シート・tiers がそのまま、として見る。 */
	const unmigrate = (text) => { const d = JSON.parse(text); d.schemaVersion = 5; d.templates.forEach((t) => { delete t.skillIcons; }); return JSON.stringify(d); };
	const stored = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData')).then((t) => (t === null ? t : unmigrate(t)));

	/* ---- Deck ---- */
	{
		const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html', undefined, SEED);
		await page.waitForTimeout(300);
		assert(await stored(page) === SEED_TEXT, 'C-100 deck: 起動しても保存データは1バイトも書き換わらない');

		// スキルセット: 名前・分類（超優先）がそのまま
		await page.click('#template-panel-root .uma-subtab[data-tab-id="' + TPL + '"]');
		await page.waitForTimeout(400);
		const tier = (t) => page.evaluate((x) => document.querySelector('#template-panel-root [data-usd-el="tier-count-' + x + '"]').textContent, t);
		const panelsOf = async (t) => {
			await page.click('#template-panel-root [data-usd-act="tier-tab"][data-tier="' + t + '"]');
			await page.waitForTimeout(250);
			return page.evaluate(() => [...document.querySelectorAll('#template-panel-root .usd-panel')].map((p) => ({
				id: p.dataset.skillId, name: p.querySelector('.usd-panel-name').textContent,
				tier: (p.querySelector('.uma-tier-mark') || {}).dataset ? p.querySelector('.uma-tier-mark').dataset.tier : null })));
		};
		const counts = [await tier(1), await tier(2), await tier(3)];
		const t1 = await panelsOf(1);
		const t2 = await panelsOf(2);
		assert(counts.join() === '1,3,0', 'C-100 deck: スキルセットの分け方が変わらない（超優先1・優先3）', counts);
		assert(t1.length === 1 && t1[0].id === C1.customId && t1[0].name === C1.name && t1[0].tier === '1',
			'C-100 deck: 超優先に入れた自作スキルが、同じ名前で超優先に出る', t1);
		assert(eq(t2.map((p) => p.name), [PICK[0].name, PICK[1].name, C2.name]),
			'C-100 deck: 優先の並びはセットの中の順のまま、タグなしの自作スキルも同じ名前で出る', t2.map((p) => p.name));
		assert(!t1.concat(t2).some((p) => /不明なスキル/.test(p.name)), 'C-100 deck: 「不明なスキル」にならない');

		// 検索の一覧には出ない（条件で検索・緑スキル）
		const inSearch = await page.evaluate(([a, b]) => {
			const C = UmaSkillDeckCore;
			C.openSkillPicker([], () => {});
			const listed = [...document.querySelectorAll('[data-usd-el="results"] .usd-row span')].map((el) => el.textContent);
			const green = C.getPoolExcludedSkills().map((s) => s.id);
			C.closeSkillPicker();
			return { filter: listed.filter((n) => n === a.name || n === b.name), listed: listed.length,
				green: green.filter((id) => id === a.customId || id === b.customId) };
		}, [C1, C2]);
		assert(inSearch.listed > 0 && inSearch.filter.length === 0,
			'C-100 deck: 条件で検索（条件なし）の一覧に自作スキルは出ない', inSearch);
		assert(inSearch.green.length === 0, 'C-100 deck: 緑スキルの一覧にも出ない', inSearch.green);

		// テキストで検索・入力して探す（どちらも searchableOnly で引く）には出ない。
		// 受け取り口（既定の呼び方）では今までどおり引ける。
		const byName = await page.evaluate(([a]) => {
			const C = UmaSkillDeckCore;
			const s = C.matchPastedSkillText(a.name, { searchableOnly: true }).rows[0];
			const d = C.matchPastedSkillText(a.name).rows[0];
			const f = C.findSkillsByNameFragment(a.name.slice(0, 6), { searchableOnly: true });
			return { search: { kind: s.kind, id: s.matchedId || null }, handoff: { kind: d.kind, id: d.matchedId || null },
				finder: f.hits.map((h) => h.id) };
		}, [C1]);
		assert(!(byName.search.kind === 'exact' && byName.search.id === C1.customId) && byName.finder.length === 0,
			'C-100 deck: テキストで検索・入力して探すの母集団に自作スキルは入らない', byName);
		assert(byName.handoff.kind === 'exact' && byName.handoff.id === C1.customId,
			'C-100 deck: 読み取り結果の受け取り口（名前 → id）では今までどおり引ける', byName.handoff);

		// 画面の「テキストで検索」でも、貼った名前は確定しない。「入力して探す」でも候補に出ない
		await page.click('#template-panel-root [data-usd-act="editor-pick-text"]');
		await page.waitForTimeout(500);
		await page.fill('[data-usd-el="paste-input"]', C1.name);
		await page.click('[data-usd-act="paste-run"]');
		await page.waitForTimeout(400);
		const pasteUi = await page.evaluate(() => ({
			count: document.querySelector('[data-usd-el="picker-checked-count"]').textContent,
			finders: document.querySelectorAll('[data-usd-el="paste-report"] [data-usd-act="paste-find"]').length,
		}));
		assert(pasteUi.count === '0種選択' && pasteUi.finders === 1,
			'C-100 deck: 画面のテキストで検索で自作スキルの名前を貼っても確定せず、要確認の行になる', pasteUi);
		await page.click('[data-usd-el="paste-report"] [data-usd-act="paste-find"]');
		await page.waitForTimeout(300);
		await page.fill('[data-usd-el="find-input"]', C1.name);
		await page.waitForTimeout(400);
		const finderUi = await page.evaluate((name) => ({
			hits: [...document.querySelectorAll('.usd-name-hit')].map((e) => e.textContent).filter((t) => t.includes(name)),
			none: !!document.querySelector('.usd-name-none'),
			button: !!document.querySelector('[data-usd-act="name-custom"]'),
		}), C1.name);
		assert(finderUi.hits.length === 0 && finderUi.none && !finderUi.button,
			'C-100 deck: 入力して探すでも自作スキルは候補に出ず、0件の文だけが出る（作るボタンは無い）', finderUi);
		await page.evaluate(() => UmaSkillDeckCore.closeSkillPicker());
		await page.waitForTimeout(300);

		// 比較シート: 同じ名前・★もそのまま
		await page.click('#tab-btn-record');
		await page.waitForTimeout(300);
		await page.evaluate((id) => openRecordEditor(id), REC);
		await page.waitForTimeout(500);
		const sheet = await page.evaluate((ids) => ids.map((id) => {
			const row = document.getElementById('row-' + id);
			const sum = document.getElementById('sum-' + id);
			return { id, name: row ? row.textContent.trim() : null, sum: sum ? sum.textContent.trim() : null };
		}), [C1.customId, C2.customId]);
		assert(sheet[0].name && sheet[0].name.includes(C1.name) && sheet[0].sum === '5',
			'C-100 deck: 比較シートに自作スキルが同じ名前で出て、★（3＋2）もそのまま', sheet[0]);
		assert(sheet[1].name && sheet[1].name.includes(C2.name), 'C-100 deck: タグなしの自作スキルも比較シートに出る', sheet[1]);

		// データ管理タブ: 「カスタムスキル：N/50」は出ない（スキルセット・比較シートの件数は残る）。commit 3
		await page.click('#tab-btn-data');
		await page.waitForTimeout(300);
		const dataTab = await page.evaluate(() => ({
			el: !!document.getElementById('data-custom-count'),
			text: document.getElementById('data-template-count').closest('p').textContent,
		}));
		assert(!dataTab.el && !/カスタムスキル/.test(dataTab.text) && dataTab.text === 'スキルセット：1/10／比較シート：1/10',
			'C-100 deck: データ管理タブにカスタムスキルの件数は出ない（スキルセット・比較シートの件数は残る）', dataTab);

		// 書き出し: customSkills を含む
		await page.click('button[onclick="exportData()"]');
		await page.waitForTimeout(200);
		const exported = JSON.parse(await page.inputValue('#export-textarea'));
		assert(eq(exported.customSkills, SEED.customSkills), 'C-100 deck: 書き出しに customSkills がそのまま含まれる', exported.customSkills);
		assert(await stored(page) === SEED_TEXT, 'C-100 deck: 見て回っただけでは保存データは書き換わらない');

		// 古いバックアップ（schemaVersion 2・自作スキル入り）を読み込める
		const OLD = { schemaVersion: 2,
			templates: [{ templateId: 'tpl_old', name: '古いバックアップのセット', skillIds: [PICK[2].id, 'custom_old01'], createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
			records: [], customSkills: [{ customId: 'custom_old01', name: '古いバックアップの自作スキル', tags: { effect: ['speed_up'] }, createdAt: '2026-08-01T00:00:00.000Z' }] };
		await page.fill('#import-textarea', JSON.stringify(OLD));
		page.once('dialog', (d) => d.accept());
		await page.click('button[onclick="importData()"]');
		await page.waitForTimeout(500);
		const afterImport = await page.evaluate(() => ({
			custom: UmaSkillDeckCore.getUserData().customSkills.map((c) => c.customId),
			name: UmaSkillDeckCore.getSkillName('custom_old01'),
			templates: UmaSkillDeckCore.getUserData().templates.map((t) => t.templateId),
		}));
		assert(eq(afterImport.custom, ['custom_old01']) && afterImport.name === '古いバックアップの自作スキル' && eq(afterImport.templates, ['tpl_old']),
			'C-100 deck: 古いバックアップ（自作スキル入り）を読み込め、名前も引ける', afterImport);
		const oldStored = JSON.parse(await stored(page));
		assert(eq(oldStored.customSkills, OLD.customSkills), 'C-100 deck: 読み込んだ自作スキルは旧値のタグも含めて書き換えずに保存される', oldStored.customSkills);

		assert(errors.length === 0, 'C-100 deck: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	}

	/* ---- Deck のスキルセット編集の入口の並び（ボタンが3つになったあとの測り直し）----
	   **340px 以上では3つが1行に収まり、横に送らない**（フェードも付かない）。
	   **320px ではまだ 9px あふれる**ので、73セッション目の「覗かせ」（`measureEntryRowTrim()`）が働いて
	   右端のボタンが「12px 以上見えて 8px 以上隠れている」状態になっていること（規則は core の ENTRY_MIN_PEEK / ENTRY_MIN_CUT）。
	   **新しい仕掛けは足していない** ―― 既存の切り詰めとフェードの分担のまま、幅だけが変わった。 */
	{
		const rowAt = async (width) => {
			const { ctx, page } = await openPage(browser, base, 'uma-skill-deck.html', { width, height: 900 });
			await page.waitForTimeout(300);
			const r = await page.evaluate(() => {
				const row = document.querySelector('#template-panel-root .usd-entry-row');
				const rect = row.getBoundingClientRect();
				const btns = [...row.children].filter((c) => c.tagName === 'BUTTON');
				let peek = null;
				for (const b of btns) {
					const x = b.getBoundingClientRect();
					if (x.left < rect.right - 0.5 && x.right > rect.right + 0.5) { peek = { 見えている: rect.right - x.left, 隠れている: x.right - rect.right }; break; }
				}
				return { ボタン数: btns.length, あふれ: Math.round(row.scrollWidth - row.clientWidth), fade: row.getAttribute('data-usd-fade'), peek };
			});
			await ctx.close();
			return r;
		};
		const narrow = await rowAt(320);
		assert(narrow.ボタン数 === 3 && narrow.あふれ > 0 && narrow.fade === 'right' && narrow.peek
			&& narrow.peek.見えている >= 12 && narrow.peek.隠れている >= 8,
			'C-100 deck(320px): 3つでもあふれ、右端のボタンは12px以上見えて8px以上隠れている（覗かせが働く）', narrow);
		const fits = [];
		for (const w of [340, 375, 430]) fits.push(Object.assign({ 幅: w }, await rowAt(w)));
		assert(fits.every((f) => f.ボタン数 === 3 && f.あふれ === 0 && f.fade === null && f.peek === null),
			'C-100 deck(340〜430px): 3つが1行に収まり、横に送らない（フェードも付かない）', fits);
	}

	/* ---- special（周回因子セット・照合の辞書） ---- */
	{
		const { ctx, page, errors } = await openPage(browser, base, 'special.html', undefined, SEED);
		if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await page.waitForTimeout(300);
		assert(await stored(page) === SEED_TEXT, 'C-100 special: 起動しても保存データは1バイトも書き換わらない');
		await page.evaluate((id) => deckTemplateManager.setSelectedId(id), TPL);   // 段8（C-120）で②のタブの帯を無くしたので、セットは setSelectedId で選ぶ
		await page.waitForTimeout(500);
		const sp = await page.evaluate(([a, b]) => ({
			dict: skillList.filter((n) => n === a.name || n === b.name),
			total: skillList.length,
			tier1: ((document.querySelector('#deck-template-panel [data-usd-act="skill-icon"][data-skill-id="custom_c100a"]') || {}).dataset || {}).icon || null,
		}), [C1, C2]);
		assert(eq(sp.dict.slice().sort(), [C1.name, C2.name].sort()) && sp.total === 4,
			'C-100 special: 自作スキル入りのセットを選ぶと、照合の辞書に自作スキルが同じ名前で入る', sp);
		assert(sp.tier1 === 'a', 'C-100 special: 周回因子セットでも分け方が変わらない（超優先 → ◎のアイコン）', sp.tier1);
		const panel = await page.evaluate((id) => {
			const p = document.querySelector('#deck-template-panel .usd-panel[data-skill-id="' + id + '"]');
			return p ? p.querySelector('.usd-panel-namebtn').textContent : null;   // 段7d の ⑬：名前は button（Pt を添えた span の中）
		}, C1.customId);
		assert(panel === C1.name, 'C-100 special: 周回因子セットに自作スキルが同じ名前で出る', panel);
		assert(!(await page.$('#deck-template-panel [data-usd-act="editor-pick-custom"]')),
			'C-100 special: 周回因子セットに「未収録スキルを追加」は無い');
		assert(await stored(page) === SEED_TEXT, 'C-100 special: セットを選んだだけでは保存データは書き換わらない');
		assert(errors.length === 0, 'C-100 special: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	}
}
});

/* ============================================================
 * 収録の告知（2026-09-27・C-100 の追加の指示）
 *
 * special を開いたときのお知らせのモーダルに「最新のスキルまで収録しました（2026年9月27日時点）。」を足した。
 * **special だけ**（exam と Deck には出さない）。既読の印は layout・alpha とは別のキー（uma-special-catalog-notice）。
 * モーダルは1回の読み込みで1枚だけなので、layout か alpha を出す読み込みでは同じモーダルの下に並べ、
 * それ以外の読み込みでは1枚で出す。見るのは:
 *   (1) 初めて開いたときに、この文が出る（layout の下に並ぶ）
 *   (2) 閉じたあとにもう一度開くと出ない
 *   (3) 前のお知らせ（layout・alpha）を閉じた状態の保存データで開くと、この1件だけが出る
 *   (3b) alpha だけ未読なら、alpha の下に並ぶ
 *   (4) exam を開いても出ない
 * ============================================================ */
await block('収録の告知 ―― special のお知らせのモーダルにだけ1度出る（C-100）', async () => {
{
	const TEXT = '最新のスキルまで収録しました（2026年9月27日時点）。';
	const KEYS = { layout: ['uma-special-ui-notice', '2026-09-new-ui-default'], alpha: ['uma-special-alpha-notice', '2026-09-18-alpha-rework'],
		catalog: ['uma-special-catalog-notice', '2026-09-27-skills-up-to-date'] };
	const state = (page) => page.evaluate((text) => {
		const d = document.getElementById('ui-notice');
		const vis = (id) => { const el = document.getElementById(id); return !!el && !el.hidden && el.offsetParent !== null; };
		return {
			出ている: !!d && !d.hidden,
			layout: vis('ui-notice-body-layout'), alpha: vis('ui-notice-body-alpha'), catalog: vis('ui-notice-body-catalog'),
			文: !!d && !d.hidden && d.innerText.includes(text),
			並べ: !!document.querySelector('#ui-notice-body-catalog.notice-catalog--with'),
			印: (() => { const i = document.querySelector('#ui-notice-body-catalog .notice-icon'); return !!i && i.offsetParent !== null; })(),
			見出し: d ? d.getAttribute('aria-labelledby') : null,
			既読: localStorage.getItem('uma-special-catalog-notice'),
		};
	}, TEXT);
	const reopen = async (page) => {
		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForTimeout(1200);
	};

	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	await page.waitForTimeout(600);
	// (1) 初めて開いた（告知の既読が1つも無い）→ layout の下に並んで出る
	const s1 = await state(page);
	assert(s1.出ている && s1.layout && !s1.alpha && s1.catalog && s1.文 && s1.並べ && !s1.印 && s1.見出し === 'ui-notice-title' && s1.既読 === null,
		'収録の告知(1): 初めて開くと、layout の下に並んで「' + TEXT + '」が出る（1枚だけ・印は出さない）', s1);
	await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	const afterClose = await page.evaluate((k) => ({ 収録: localStorage.getItem(k.catalog[0]), 画面: localStorage.getItem(k.layout[0]),
		次のモーダル: !document.getElementById('ui-notice').hidden }), KEYS);
	assert(afterClose.収録 === KEYS.catalog[1] && afterClose.画面 === KEYS.layout[1] && !afterClose.次のモーダル,
		'収録の告知(1): OK で閉じると収録の告知も既読になり、2枚目のモーダルは出ない', afterClose);

	// (2) もう一度開くと出ない
	await reopen(page);
	const s2 = await state(page);
	assert(!s2.出ている && !s2.文, '収録の告知(2): 閉じたあとにもう一度開くと出ない', s2);

	// (3) 前のお知らせ（layout・alpha）を閉じた保存データ・収録の告知だけ未読 → これだけが1枚で出る
	await page.evaluate((k) => { localStorage.setItem(k.layout[0], k.layout[1]); localStorage.setItem(k.alpha[0], k.alpha[1]); localStorage.removeItem(k.catalog[0]); }, KEYS);
	await reopen(page);
	const s3 = await state(page);
	assert(s3.出ている && !s3.layout && !s3.alpha && s3.catalog && s3.文 && !s3.並べ && s3.印 && s3.見出し === 'ui-notice-title-catalog',
		'収録の告知(3): 前のお知らせを閉じた人にも、この1件だけが1枚で出る', s3);
	await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	await reopen(page);
	const s3b = await state(page);
	assert(!s3b.出ている && s3b.既読 === KEYS.catalog[1], '収録の告知(3): 閉じたあとは出ない', s3b);

	// (3b) alpha だけ未読 → alpha の下に並ぶ（2枚目は出さない）
	await page.evaluate((k) => { localStorage.removeItem(k.alpha[0]); localStorage.removeItem(k.catalog[0]); }, KEYS);
	await reopen(page);
	const s4 = await state(page);
	assert(s4.出ている && !s4.layout && s4.alpha && s4.catalog && s4.並べ && s4.見出し === 'ui-notice-title-alpha',
		'収録の告知(3b): 改修中の告知が未読なら、その下に並んで出る', s4);
	await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	const s4after = await page.evaluate((k) => ({ alpha: localStorage.getItem(k.alpha[0]), 収録: localStorage.getItem(k.catalog[0]),
		次のモーダル: !document.getElementById('ui-notice').hidden }), KEYS);
	assert(s4after.alpha === KEYS.alpha[1] && s4after.収録 === KEYS.catalog[1] && !s4after.次のモーダル,
		'収録の告知(3b): 閉じると両方とも既読になる', s4after);

	// 読み直しでは、収録の告知は並べない（読み直すのは画面の切り替えの告知だけ。バッジは段7b の ⓪で無くしたので、関数を直接呼ぶ）
	await page.evaluate(() => reopenUiNotice());
	await page.waitForTimeout(300);
	const s5 = await state(page);
	assert(s5.出ている && s5.layout && !s5.catalog, '収録の告知: 「新UI」バッジからの読み直しには並ばない', s5);
	await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(200);
	assert(errors.length === 0, '収録の告知: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();

	// (4) exam を開いても出ない（初めて開いた状態で）
	{
		const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
		await page.waitForTimeout(600);
		const ex = await page.evaluate((text) => ({
			文: document.body.innerText.includes(text) || document.documentElement.outerHTML.includes(text),
			節: !!document.getElementById('ui-notice-body-catalog'),
			キー: localStorage.getItem('uma-special-catalog-notice'),
		}), TEXT);
		assert(!ex.文 && !ex.節 && ex.キー === null, '収録の告知(4): exam を開いても出ない（文も節も無い）', ex);
		assert(errors.length === 0, '収録の告知(4): exam のコンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	}
}
});

/* ============================================================
 * exam.html — めろっぷ！【LTC】専用拡張モード（βテスト・C-101）
 *
 * OCR は回さない。行は並びのデータ（data/melop-sheet-rows.json）の名前から作り、本物の照合関数
 * （matchMelopLines）と本物の出力（buildMelopCopyText）に通す。**スキル名はここに書かない**
 * （どの行を使うかはデータから選ぶ）。いちばん上の段の読み取りそのもの（実画像）は
 * tests/ocr/run-melop-tests.mjs（npm run test:ocr から回る）が見る。
 * ============================================================ */
await block('exam.html — めろっぷ！【LTC】専用拡張モード（C-101）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'exam.html');
	await page.waitForTimeout(600);
	if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
	await page.waitForTimeout(200);

	// (1) 入口: チェックボックスの文言・既定はオフ・ブラウザに覚える
	const entry = await page.evaluate(() => ({
		label: document.querySelector('#melop-mode-wrap label span').textContent,
		checked: document.getElementById('opt-melop').checked,
		afterStitchPanel: document.getElementById('stitch-show-panel').nextElementSibling === document.getElementById('melop-mode-wrap'),
		btnA: document.getElementById('melop-copy-btn-A').textContent.trim(),
		btnB: document.getElementById('melop-copy-btn-B').textContent.trim(),
	}));
	assert(entry.label === 'めろっぷ！【LTC】専用拡張モード（βテスト）' && !entry.checked && entry.afterStitchPanel,
		'めろっぷ(1): 「結合画像の設定」の下にチェックボックスがあり、既定はオフ', entry);
	assert(entry.btnA === 'めろっぷ用に★をコピー（親Aセット）' && entry.btnB === 'めろっぷ用に★をコピー（親Bセット）',
		'めろっぷ(1): ボタンの文言', entry);
	// チェックボックスは②（画像の入力）のタブにある
	await page.evaluate(() => selectStepTab(2));
	await page.check('#opt-melop');
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	await page.evaluate(() => selectStepTab(2));
	const kept = await page.evaluate(() => ({ checked: document.getElementById('opt-melop').checked, stored: localStorage.getItem('uma-exam-melop-mode'), mode: melopModeEnabled }));
	assert(kept.checked && kept.stored === '1' && kept.mode === true, 'めろっぷ(1): 入れた状態は開き直しても残る', kept);
	await page.uncheck('#opt-melop');
	assert(await page.evaluate(() => localStorage.getItem('uma-exam-melop-mode') === '0' && melopModeEnabled === false),
		'めろっぷ(1): 外すと保存値も「0」になる');

	// (2) 並びのデータを読み、照合の辞書に正規化で潰れる名前が無い
	const sheet = await page.evaluate(async () => {
		const s = await loadMelopSheet();
		const listRows = s.rows.filter((r) => !r.slot);
		const plusRows = listRows.filter((r) => /\+$/.test(r.name));
		return {
			version: s.dataVersion, table: EXAM_DATA_JSON_VERSIONS['data/melop-sheet-rows.json'],
			rows: s.rows.length, listRows: listRows.length, dict: s.listDict.list.length,
			markSurvives: normalizeText('a' + MELOP_PLUS_MARK) === 'a' + MELOP_PLUS_MARK,
			plusPairs: plusRows.map((r) => ({ plus: r.row, base: (listRows.find((b) => b.name === r.name.replace(/\+$/, '')) || {}).row })),
		};
	});
	assert(sheet.rows === 562 && sheet.version === sheet.table, 'めろっぷ(2): 562行を読める・版が exam の表と一致', sheet);
	assert(sheet.dict === sheet.listRows, 'めろっぷ(2): いちばん上の段以外の ' + sheet.listRows + '行の名前が、照合の辞書で1つも潰れない（「+」の有無も区別できる）',
		{ 辞書: sheet.dict, 行: sheet.listRows });
	assert(sheet.markSurvives && sheet.plusPairs.length > 0 && sheet.plusPairs.every((p) => p.base),
		'めろっぷ(2): 「+」の印は正規化で消えず、「+」の付く行にはどれも付かない行がある', sheet.plusPairs);

	// (3) 「+」の付く行と付かない行を、OCR の行の末尾の「+」「＋」「十」で振り分ける
	const plus = await page.evaluate((pair) => {
		const s = melopSheet;
		const byRow = (n) => s.rows.find((r) => r.row === n);
		const base = byRow(pair.base).name, plusName = byRow(pair.plus).name;
		const hit = (text) => {
			const res = matchMelopLines([{ text: text, stars: 2, starsReliable: true, rowKey: 'x:0' }], s);
			return Array.from(res.detectedSkills).map((n) => s.rowByDictName[n].row);
		};
		return {
			plusAscii: hit(plusName), plusFull: hit(base + '＋'), plusKanji: hit(base + '十 _'), base: hit(base),
			want: pair,
		};
	}, sheet.plusPairs[0]);
	assert(JSON.stringify(plus.plusAscii) === JSON.stringify([plus.want.plus]) && JSON.stringify(plus.plusFull) === JSON.stringify([plus.want.plus])
		&& JSON.stringify(plus.plusKanji) === JSON.stringify([plus.want.plus]) && JSON.stringify(plus.base) === JSON.stringify([plus.want.base]),
		'めろっぷ(3): 末尾の「+」「＋」「十」は「+」の行へ、付かないものは付かない行へ入る', plus);

	// (4) 出力の形: 562行 × 3列・空欄・「?」・継承固有の斜めの置き方・いちばん上の段
	const out = await page.evaluate(() => {
		const s = melopSheet;
		const list = s.rows.filter((r) => !r.slot);
		// 人ごとに、データの並びから違う行を選ぶ（i 番目の人は i, i+7, i+14 … の行）
		const seed = (p, withTop) => {
			const picked = list.filter((_, k) => k % 7 === p).slice(0, 12);
			const lines = picked.map((r, k) => ({ text: r.name, stars: (k % 3) + 1, starsReliable: true, rowKey: 'r' + p + ':' + k }));
			const res = matchMelopLines(lines, s);
			// 1件目は「名前は読めたが★が読めなかった」
			res.skillStars[melopMarkPlusName(picked[0].name)] = null;
			personMelop[p] = {
				res: res,
				top: withTop ? { found: true, blue: { name: s.blueRows[p % s.blueRows.length].name, stars: 2 },
					red: { name: s.redRows[p % s.redRows.length].name, stars: p === 1 ? 0 : 3 }, uniqueStars: (p % 3) + 1, extraLines: [] }
					: { found: false, blue: null, red: null, uniqueStars: null, extraLines: [] },
			};
			return picked.map((r, k) => ({ row: r.row, want: k === 0 ? '?' : String((k % 3) + 1) }));
		};
		const want = [0, 1, 2, 3, 4].map((p) => seed(p, p !== 4));
		personMelop[5] = null;
		const a = buildMelopCopyText(0, s).split('\n'), b = buildMelopCopyText(1, s).split('\n');
		const cell = (lines, row, col) => lines[s.rows.findIndex((r) => r.row === row)].split('\t')[col];
		const listOk = want.every((w, p) => w.every((x) => cell(p < 3 ? a : b, x.row, p % 3) === x.want));
		const u = s.uniqueRows;
		return {
			linesA: a.length, linesB: b.length,
			tabsOk: a.concat(b).every((l) => l.split('\t').length === 3),
			listOk: listOk,
			blankOk: cell(a, list[6].row, 0) === '' && cell(b, list[5].row, 2) === '',
			uniqueA: u.map((r) => [0, 1, 2].map((c) => cell(a, r.row, c)).join(',')),
			uniqueB: u.map((r) => [0, 1, 2].map((c) => cell(b, r.row, c)).join(',')),
			blueA0: cell(a, s.blueRows[0].row, 0), redA1: cell(a, s.redRows[1].row, 1),
			blueB1: cell(b, s.blueRows[4 % s.blueRows.length].row, 1), redB1: cell(b, s.redRows[4 % s.redRows.length].row, 1),
			noName: a.concat(b).every((l) => /^[123?]?\t[123?]?\t[123?]?$/.test(l)),
		};
	});
	assert(out.linesA === 562 && out.linesB === 562 && out.tabsOk && out.noName,
		'めろっぷ(4): A・B それぞれ562行 × 3列（タブ区切り・スキル名は含まない・値は 1〜3 か「?」か空欄）', out);
	assert(out.listOk, 'めろっぷ(4): 読めた行はその人の列に★の数、★が読めなかった行は「?」', out);
	assert(out.blankOk, 'めろっぷ(4): 持っていない行は空欄', out);
	assert(JSON.stringify(out.uniqueA) === JSON.stringify(['1,,', ',2,', ',,3']),
		'めろっぷ(4): 継承固有は親の行は親の列、祖1の行は祖1の列、祖2の行は祖2の列にだけ入る（親Aセット）', out.uniqueA);
	assert(JSON.stringify(out.uniqueB) === JSON.stringify(['1,,', ',,', ',,']),
		'めろっぷ(4): 親Bセットも同じ（いちばん上の段が見つからなかった祖B1・結果の無い祖B2は空欄）', out.uniqueB);
	assert(out.blueA0 === '2' && out.redA1 === '?' && out.blueB1 === '' && out.redB1 === '',
		'めろっぷ(4): 青・赤はその名前の行のその人の列（★が0なら「?」・段が見つからなければ空欄）', out);

	// (5) ボタン: 拡張モードで判定したときだけ。親Bセットのボタンは親Bセットの結果があるときだけ
	const buttons = await page.evaluate(() => {
		const st = () => ({ A: !document.getElementById('melop-copy-btn-A').hidden, B: !document.getElementById('melop-copy-btn-B').hidden,
			note: document.getElementById('melop-copy-note').hidden ? '' : document.getElementById('melop-copy-note').textContent });
		const mk = () => matchAllSkillsWithStars([{ text: skillList[0], stars: 1, starsReliable: true, rowKey: 'z:0' }], skillList, skillIndex, {});
		personResults = PERSON_LABELS.map(() => null);
		personResults[0] = mk();
		setMelopMode(true);
		lastOcrRun = captureRun();
		renderResults();
		const onlyA = st();
		personResults[3] = mk();
		renderResults();
		const withB = st();
		lastOcrRun = Object.assign({}, lastOcrRun, { melop: false });
		renderResults();
		const off = st();
		setMelopMode(false);
		return { onlyA, withB, off };
	});
	assert(buttons.onlyA.A && !buttons.onlyA.B, 'めろっぷ(5): 親Bセットの結果が無いときは親Aセットのボタンだけ', buttons.onlyA);
	assert(buttons.withB.A && buttons.withB.B, 'めろっぷ(5): 親Bセットの結果があれば親Bセットのボタンも出る', buttons.withB);
	assert(!buttons.off.A && !buttons.off.B && buttons.off.note === '', 'めろっぷ(5): 拡張モードなしで判定した結果にはボタンも注意も出ない', buttons.off);
	// 見えるボタンの並び（左から A → B → いつもの「★の数をコピー」）
	assert(await page.evaluate(() => [...document.querySelectorAll('#result-copy-slot > button')].map((b) => b.id).join(',')
		=== 'melop-copy-btn-A,melop-copy-btn-B,result-copy-btn'), 'めろっぷ(5): ボタンはいつもの「★の数をコピー」の左に並ぶ');

	// (6) 判定の流れ: オフでは拡張モードの処理を1つも通らず、オンでもいつもの結果・コピーは同じ
	const flow = await page.evaluate(async () => {
		const calls = { load: 0, top: 0, match: 0 };
		const orig = { load: loadMelopSheet, top: readMelopTopRow, match: matchMelopLines, ppi: processPersonImages, tess: window.Tesseract };
		loadMelopSheet = async () => { calls.load++; return orig.load(); };
		readMelopTopRow = async () => { calls.top++; return { found: true, file: 'a.png', blue: { name: melopSheet.blueRows[0].name, text: '', stars: 3 },
			red: { name: melopSheet.redRows[0].name, text: '', stars: 1 }, uniqueStars: 2, extraLines: [] }; };
		matchMelopLines = (lines, s) => { calls.match++; return orig.match(lines, s); };
		// OCR の代わり: いつもの判定に渡る行を固定する（対象スキルの先頭10件）
		processPersonImages = async () => ({
			lines: skillList.slice(0, 10).map((n, i) => ({ text: n, stars: (i % 3) + 1, starsReliable: true, rowKey: '0:' + i })),
			skipped: [], warned: [], geometry: [null],
		});
		window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {},
			recognize: async () => ({ data: { text: '', lines: [] } }), terminate: async () => {} }) };
		persons.forEach((p) => { p.files = []; });
		persons[0].files = [new File(['x'], 'a.png', { type: 'image/png' })];
		const snap = () => ({
			copy: document.getElementById('copy-data').value,
			table: document.getElementById('result-tbody').innerText,
			stats: document.getElementById('stat-grid').innerText,
			detected: Array.from(personResults[0].detectedSkills).sort().join('|'),
		});
		setMelopMode(false);
		await processImages({ keepClosed: true });
		const off = { calls: Object.assign({}, calls), snap: snap(), melop: personMelop.every((m) => m === null),
			btn: !document.getElementById('melop-copy-btn-A').hidden, log: devGeometry.some((l) => l.startsWith('【めろっぷ')) };
		setMelopMode(true);
		await processImages({ keepClosed: true });
		const on = { calls: Object.assign({}, calls), snap: snap(), melop: !!personMelop[0], btn: !document.getElementById('melop-copy-btn-A').hidden };
		setMelopMode(false);
		loadMelopSheet = orig.load; readMelopTopRow = orig.top; matchMelopLines = orig.match; processPersonImages = orig.ppi; window.Tesseract = orig.tess;
		return { off, on };
	});
	assert(flow.off.calls.load === 0 && flow.off.calls.top === 0 && flow.off.calls.match === 0 && flow.off.melop && !flow.off.btn && !flow.off.log,
		'めろっぷ(6): オフで判定すると、並びのデータの読み込み・いちばん上の段・562行の照合を1つも通らない',
		{ calls: flow.off.calls, melop: flow.off.melop, btn: flow.off.btn, log: flow.off.log });
	assert(flow.on.calls.top === 1 && flow.on.calls.match === 1 && flow.on.melop && flow.on.btn,
		'めろっぷ(6): オンで判定すると、1人につき1回ずつ読み取りと照合を通り、ボタンが出る', flow.on.calls);
	assert(JSON.stringify(flow.on.snap) === JSON.stringify(flow.off.snap) && flow.off.snap.copy.length > 0,
		'めろっぷ(6): オンでも、いつもの判定・表・集計・「★の数をコピー」の中身はオフと1文字も変わらない',
		{ 同じ: JSON.stringify(flow.on.snap) === JSON.stringify(flow.off.snap) });

	// (7) ほかの名前の中にそっくり含まれる名前（C-101 の追記。マイルCS ⊂ マイルCS南部杯 など）。
	//     組は並びのデータから作る。実際の OCR の行の形（前後の余計な文字・1文字の読み違い・「+」の読み違い）で、
	//     「長いほうだけ」「両方」「短いほうだけ」の3通りを見る。
	const nested = await page.evaluate(() => {
		const s = melopSheet;
		const rowOf = (dictName) => s.rowByDictName[dictName].row;
		const detect = (lines) => {
			const res = matchMelopLines(lines.map((l, i) => ({ text: l.text, stars: l.stars, starsReliable: true, rowKey: 'n:' + i })), s);
			const out = {};
			res.detectedSkills.forEach((n) => { out[rowOf(n)] = res.skillStars[n]; });
			return out;
		};
		const plain = (dictName) => dictName.replace(new RegExp(MELOP_PLUS_MARK + '$'), '+');
		const swapChar = (str, idx, ch) => { const a = Array.from(str); a[idx] = ch; return a.join(''); };
		const pairs = [];
		const problems = [];
		s.containedBy.forEach(({ short, longer }) => longer.forEach((long) => {
			const shortName = plain(short.raw), longName = plain(long.raw);
			const isPlus = long.raw.endsWith(MELOP_PLUS_MARK);
			const at = Array.from(longName).length - Array.from(longName.replace(shortName, '')).length; // 使わない（読みやすさのため）
			void at;
			const shortPos = longName.indexOf(shortName);
			const outside = longName.slice(0, shortPos) + longName.slice(shortPos + shortName.length);
			// 長いほう: そのまま／前後に余計な文字／長い名前だけにある部分の読み違い／共通の部分の読み違い
			const longForms = [longName, '[' + longName + ' _'];
			if (isPlus) longForms.push(shortName + ' + ]', shortName + '十', '・' + shortName + '＋', swapChar(shortName, 1, '祀') + '+');
			else {
				const outChars = Array.from(outside);
				const misOutside = outChars.length >= 2
					? longName.replace(outside.slice(-1), '祀')                       // 例: マイルCS南部杯 → マイルCS南部祀
					: longName.replace(outside, '韭');                                 // 例: 非根幹距離〇 → 韭根幹距離〇（1文字なら同じ種類の読み違い）
				longForms.push(misOutside, swapChar(longName, shortPos + (Array.from(shortName).length > 2 ? 1 : 0), '祀'));
			}
			// 前に付く余計な文字は「|」（正規化で「ー」）。「を」は common.js が「左」に読み替える（左回り〇の読み違い）ので使わない
			const shortForms = [shortName, '[' + shortName + ' _', '| ' + shortName];
			const L = rowOf(long.raw), S = rowOf(short.raw);
			const res = { short: shortName, long: longName, S: S, L: L, ok: true };
			longForms.forEach((t) => {
				const got = detect([{ text: t, stars: 3 }]);
				if (JSON.stringify(got) !== JSON.stringify({ [L]: 3 })) { res.ok = false; problems.push({ 形: '長いほうだけ', 行: t, 読み: got, 期待: { [L]: 3 } }); }
			});
			shortForms.forEach((t) => {
				const got = detect([{ text: t, stars: 1 }]);
				if (JSON.stringify(got) !== JSON.stringify({ [S]: 1 })) { res.ok = false; problems.push({ 形: '短いほうだけ', 行: t, 読み: got, 期待: { [S]: 1 } }); }
			});
			// 両方: 長いほうは読み違いのある形、短いほうは余計な文字の付いた形
			const both = detect([{ text: longForms[2], stars: 3 }, { text: shortForms[1], stars: 1 }]);
			const wantBoth = { [S]: 1, [L]: 3 };
			if (JSON.stringify(Object.keys(both).sort()) !== JSON.stringify(Object.keys(wantBoth).sort()) || both[S] !== 1 || both[L] !== 3) {
				res.ok = false; problems.push({ 形: '両方', 行: [longForms[2], shortForms[1]], 読み: both, 期待: wantBoth });
			}
			pairs.push(res);
		}));
		return { count: pairs.length, pairs: pairs.map((p) => p.S + '⊂' + p.L + (p.ok ? '' : '（NG）')), problems };
	});
	assert(nested.count === 16, 'めろっぷ(7): 並びのデータの「ほかの名前の中にそっくり含まれる名前」は16組', nested.pairs);
	assert(nested.problems.length === 0,
		'めろっぷ(7): 16組とも、長いほうだけ→長い行だけ・短いほうだけ→短い行だけ・両方→それぞれの行にそれぞれの★（前後の余計な文字・1文字の読み違い・「+」の読み違いを含む）',
		nested.problems.length ? nested.problems.slice(0, 6) : nested.pairs);

	// (8) いちばん上の段の15語は、下の段の照合に紛れ込まない
	const topWords = await page.evaluate(() => {
		const s = melopSheet;
		const slotNames = s.rows.filter((r) => r.slot).map((r) => r.name);
		const inDict = s.listDict.list.filter((n) => slotNames.map((x) => normalizeText(x)).includes(normalizeText(n)));
		const words = s.blueRows.concat(s.redRows).map((r) => r.name);
		const res = matchMelopLines(words.map((w, i) => ({ text: w, stars: 2, starsReliable: true, rowKey: 'w:' + i })), s);
		// 15語を含む下の段の名前（例: 〜の遺伝子・〜の目覚め）は、その名前の行に入る
		const containing = s.rows.filter((r) => !r.slot && words.some((w) => r.name.includes(w)));
		const res2 = matchMelopLines(containing.map((r, i) => ({ text: r.name, stars: 2, starsReliable: true, rowKey: 'c:' + i })), s);
		const got2 = Array.from(res2.detectedSkills).map((n) => s.rowByDictName[n].row).sort((a, b) => a - b);
		return {
			inDict: inDict, wordHits: Array.from(res.detectedSkills),
			containing: containing.length, sameRows: JSON.stringify(got2) === JSON.stringify(containing.map((r) => r.row).sort((a, b) => a - b)),
			slotHit: got2.some((row) => s.rows.find((r) => r.row === row).slot),
		};
	});
	assert(topWords.inDict.length === 0 && topWords.wordHits.length === 0,
		'めろっぷ(8): いちばん上の段の15語は下の段の辞書に無く、15語だけの行はどの行にも入らない', topWords);
	assert(topWords.containing > 0 && topWords.sameRows && !topWords.slotHit,
		'めろっぷ(8): 15語を含む下の段の名前（' + topWords.containing + '件）は、それぞれ自分の行にだけ入る', topWords);

	assert(errors.length === 0, 'めろっぷ: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});

/* ============================================================
 * 編成パネル ―― サポートカードのイベントの●・△（C-102・区切り1）
 *
 * 本物のイベントのデータは行が0件なので、`tests/visual/lib/event-fixture.mjs` の仕込みを
 * 取得の途中で差し替えて読ませる（カード名・スキル名は書かず、実データから id で拾う）。
 * 見ること：
 *   - 選択肢が1つのイベントは成功側が●（確定・結果が3通りの先頭）
 *   - 選択肢が2つ以上（選ぶ仕組みはまだ無い＝いつも「選んでいない」）は△。すべての選択肢に入っているものだけ●
 *   - 失敗側（results の2番目以降）にだけあるスキルは出ない
 *   - 同じスキルが別のカードで●なら、全体では●（その列ごとの印は列ごと）
 *   - seeded は△、none は何も出ない、行の無いカードだけ「未確認」
 *   - 「本育成スキルを除外する」と「隠す」に渡るのは●だけ（special.html との接点は同じ）
 *   - △があるときだけ、表の下に△の説明が出る
 * ============================================================ */
await block('編成パネル ―― サポートカードのイベントの●・△（C-102・区切り1）', async () => {
{
	const fx = buildEventFixture();
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	await page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill({
		status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fx.doc) }));
	// 【2026-09-30】キャラクター共通のイベントの実データが入ったので、この塊では空にする（連続イベントの●・△だけを見るため。
	// 共通イベントの当てはめは次の塊が仕込みで見る）
	await page.route('**/data/character-event-skills.json*', (route) => route.fulfill({
		status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] }) }));

	const res = await page.evaluate(async ({ cardIds }) => {
		const Core = window.UmaSkillDeckCore;
		await Core.loadTrainingSources(true);
		const r = Core.computeRosterSkills({ umaId: '', cardIds: cardIds });
		return {
			entries: (Core.getTrainingSources().supportCardEventSkill || {}).entries.length,
			skillIds: r.skillIds,
			items: r.items.map((it) => ({ id: it.skillId, members: it.members, sureMembers: it.sureMembers, sure: it.sure })),
			unconfirmed: r.unconfirmed.map((u) => u.cardId + ':' + u.what),
			missing: r.missing,
		};
	}, { cardIds: fx.cardIds });
	assert(res.entries === fx.doc.entries.length, 'イベント(0): 仕込んだイベントのデータが読まれている', res.entries);

	const S = fx.S;
	const item = (i) => res.items.find((it) => it.id === S[i]) || null;
	const sure = (i) => res.skillIds.includes(S[i]);
	// 列の key は 0＝育成ウマ娘、1〜＝カードの枠（A=1, B=2, C=3, D=4）
	assert(sure(0) && sure(1), 'イベント(1): 選択肢の無い確定のイベントのスキルは●（除外の対象）', { s0: item(0), s1: item(1) });
	assert(item(2) && item(3) && !sure(3) && sure(4),
		'イベント(2): 2択のイベントは△で、両方の選択肢に入っているスキルだけ●', { s2: item(2), s3: item(3), s4: item(4) });
	assert(sure(5) && !item(6) && !item(7),
		'イベント(3): 結果が3通りのイベントは先頭（成功）だけが●で、失敗側のスキルは表に出ない', { s5: item(5), s6: item(6), s7: item(7) });
	assert(item(8) && !sure(8) && !item(9),
		'イベント(4): 2択の片方が成否ありのとき、成功側は△・失敗側は出ない', { s8: item(8), s9: item(9) });
	assert(sure(2) && item(2).sureMembers.join() === '3' && item(2).members.slice().sort().join() === '2,3',
		'イベント(5): 同じスキルが別のカードで確定なら全体では●で、列ごとの印はその列の強さ（B は△・C は●）', item(2));
	assert(item(10) && !sure(10) && item(10).sureMembers.length === 0,
		'イベント(6): シートから取り込んだまま（seeded）のスキルは△', item(10));
	// 連続イベントの未確認だけを見る（キャラクター共通のイベントの未確認は、区切り3 の塊で見る）
	const chainUnconfirmed = res.unconfirmed.filter((u) => u.endsWith(':イベント'));
	assert(chainUnconfirmed.length === 1 && chainUnconfirmed[0] === fx.cardIds[5] + ':イベント',
		'イベント(7): イベントが「未確認」になるのは行の無いカードだけ（seeded・none は未確認に数えない）', chainUnconfirmed);
	assert(res.missing.length === 0, 'イベント(8): 引けないスキルは無い', res.missing);

	/* 表の印と、除外で渡る id（パネルを実際に描いて押す） */
	const panel = await page.evaluate(async ({ cardIds, S }) => {
		const Core = window.UmaSkillDeckCore;
		localStorage.setItem('umaSkillDeck:draftRoster:smoke-event', JSON.stringify({ umaId: '', cardIds: cardIds }));
		const host = document.createElement('div');
		host.id = 'smoke-event-roster';
		document.body.appendChild(host);
		const api = Core.createRosterPanel(host, { draftKey: 'smoke-event' });
		const grid = host.querySelector('.usd-roster-grid');
		const rows = Array.from(grid.querySelectorAll('.usd-roster-grow')).slice(1);
		const nameOf = (id) => (Core.findSkill(id) || {}).name;
		const marks = (i) => {
			const row = rows.find((r) => r.querySelector('.usd-roster-skillname').textContent === nameOf(S[i]));
			if (!row) return null;
			return Array.from(row.querySelectorAll('[role="cell"]')).map((c) =>
				c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '△' : '');
		};
		const out = { marks: {}, note: '' };
		[0, 1, 2, 3, 4, 5, 6, 8, 9, 10].forEach((i) => { out.marks[i] = marks(i); });
		const maybe = host.querySelector('.usd-roster-maybe');
		const got = host.querySelector('.usd-roster-got');
		const ms = maybe ? getComputedStyle(maybe) : null;
		const r = maybe ? maybe.getBoundingClientRect() : null;
		out.look = ms ? {
			w: r.width, h: r.height,
			mask: ms.webkitMaskImage || ms.maskImage || 'none',
			color: ms.backgroundColor,
			gotColor: got ? getComputedStyle(got).borderTopColor : '',
		} : null;
		out.sure = api.getSkillIds();
		host.remove();
		return out;
	}, { cardIds: fx.cardIds, S: S });
	// 列は 育成ウマ娘・1〜6。A=1, B=2, C=3, D=4
	const m = panel.marks;
	assert(m[0] && m[0][1] === '●' && m[1] && m[1][1] === '●', 'イベント(9): 確定のスキルは A の列に●', { m0: m[0], m1: m[1] });
	assert(m[3] && m[3][2] === '△' && m[4] && m[4][2] === '●', 'イベント(10): 2択は B の列に△、両方にあるスキルは●', { m3: m[3], m4: m[4] });
	assert(m[2] && m[2][2] === '△' && m[2][3] === '●', 'イベント(11): 同じスキルでも列ごとに印が違う（B は△・C は●）', m[2]);
	assert(m[5] && m[5][2] === '●' && m[6] === null && m[9] === null, 'イベント(12): 結果の先頭は●、失敗側の行は表に無い', { m5: m[5], m6: m[6], m9: m[9] });
	// 段7: C の1回目は「スキルを持つ選択肢が1つだけ」なので、パネルでは既定で選ばれて S8 は●（関数を直に呼ぶ上の検査は従来どおり△）
	assert(m[8] && m[8][3] === '●' && m[10] && m[10][4] === '△', 'イベント(13)→段7: 成否ありの選択肢の成功側は、パネルでは既定で選ばれて●。取り込んだままのスキルは△', { m8: m[8], m10: m[10] });
	const look = panel.look || {};
	assert(look.w >= 10 && look.w <= 16 && look.h >= 10 && look.h <= 16 && look.mask.includes('svg') && look.color && look.color === look.gotColor,
		'イベント(18・見た目): △の印は●とほぼ同じ大きさで、SVG のマスクで描き、色は●の線と同じ', look);
	// 段7: パネルが②へ渡す（本育成編成の対象になる）のは●だけ。既定で選ばれた S8 を加えた顔ぶれ
	assert(Array.isArray(panel.sure) && panel.sure.slice().sort().join() === res.skillIds.concat([S[8]]).sort().join() && !panel.sure.includes(S[3]) && !panel.sure.includes(S[10]),
		'イベント(15)(16)→段7: パネルの getSkillIds() は●だけ（△は入らない。既定で選ばれた S8 は入る）', panel.sure);

	/* △が無い編成では説明を出さない（確定のカード1枚だけ） */
	const noMaybe = await page.evaluate(async ({ cardId }) => {
		const Core = window.UmaSkillDeckCore;
		localStorage.setItem('umaSkillDeck:draftRoster:smoke-event2', JSON.stringify({ umaId: '', cardIds: [cardId] }));
		const host = document.createElement('div');
		document.body.appendChild(host);
		Core.createRosterPanel(host, { draftKey: 'smoke-event2' });
		const out = { maybe: host.querySelectorAll('.usd-roster-maybe').length };
		host.remove();
		return out;
	}, { cardId: fx.cardIds[0] });
	assert(noMaybe.maybe === 0, 'イベント(17): △が無い編成では△の印が出ない（△の説明文は段7で廃止）', noMaybe);

	assert(errors.length === 0, 'イベント: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});
/* ============================================================
 * 編成パネル ―― キャラクター共通のイベントの当てはめ（C-102・区切り3）
 *
 * 仕込みは tests/visual/lib/event-fixture.mjs の buildCharacterFixture()（カード名・スキル名は書かない）。
 * 見ること：
 *   - グループでないカードには、その charaName の共通イベント
 *   - グループのカードには、groupMembers の全員ぶん（代表者でないメンバーの分も当たる）
 *   - 同じキャラクターが2枚（グループのカードとそのメンバーのカード）から当たるとき、スキルは1行で、印は両方の列
 *   - ●・△の決まりは連続イベントと同じ（2択は△、確定・結果の先頭は●）
 *   - 共通イベントが未入力のキャラクターは「未確認」に出る（none は出ない）
 * ============================================================ */
await block('編成パネル ―― キャラクター共通のイベントの当てはめ（C-102・区切り3）', async () => {
{
	const fx = buildCharacterFixture();
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	await page.route('**/data/character-event-skills.json*', (route) => route.fulfill({
		status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fx.doc) }));
	const res = await page.evaluate(async ({ cardIds }) => {
		const Core = window.UmaSkillDeckCore;
		await Core.loadTrainingSources(true);
		const r = Core.computeRosterSkills({ umaId: '', cardIds: cardIds });
		const cards = Core.getTrainingSources().supportCard.entries;
		return {
			entries: (Core.getTrainingSources().characterEventSkill || {}).entries.length,
			charsOfGroup: Core.charactersOfCard(cards.find((c) => c.id === cardIds[1])),
			charsWithoutMark: Core.charactersOfCard(Object.assign({}, cards.find((c) => c.id === cardIds[0]), { isGroup: undefined })),
			skillIds: r.skillIds,
			items: r.items.map((it) => ({ id: it.skillId, members: it.members.slice().sort(), sureMembers: it.sureMembers.slice().sort() })),
			unconfirmed: r.unconfirmed.map((u) => u.cardId + ':' + u.what),
		};
	}, { cardIds: fx.cardIds });
	assert(res.entries === fx.doc.entries.length, '共通(0): 仕込んだ共通イベントのデータが読まれている', res.entries);
	const T = fx.T;
	const item = (i) => res.items.find((it) => it.id === T[i]) || null;
	const sure = (i) => res.skillIds.includes(T[i]);
	// 列の key：1=A（グループでない）、2=G（グループ）、3=N（G のメンバー M のカード）、4=D（none）
	assert(item(0) && sure(0) && item(0).members.join() === '1',
		'共通(1): グループでないカードには、その charaName の共通イベントが当たる（A の列に●）', item(0));
	assert(JSON.stringify(res.charsOfGroup) === JSON.stringify(fx.group.members) && item(4) && sure(4) && item(4).members.join() === '2',
		'共通(2): グループのカードには groupMembers の全員ぶんが当たる（代表者でないメンバーの分も G の列に●）', { chars: res.charsOfGroup, t4: item(4) });
	assert(item(3) && sure(3) && item(3).members.join() === '2,3' && item(3).sureMembers.join() === '2,3',
		'共通(3): 同じキャラクターが2枚から当たるとき、スキルは1行で、G と N の両方の列に●', item(3));
	assert(item(1) && item(2) && !sure(1) && !sure(2) && item(1).members.join() === '2,3' && item(1).sureMembers.length === 0,
		'共通(4): 2択の共通イベントは△（どちらの列も△。除外には入らない）', { t1: item(1), t2: item(2) });
	const charaUnconf = res.unconfirmed.filter((u) => u.includes('共通イベント'));
	assert(charaUnconf.includes(fx.cardIds[1] + ':共通イベント（' + fx.group.representative + '）')
		&& !charaUnconf.some((u) => u.includes('（' + fx.M + '）') || u.includes('（' + fx.M2 + '）') || u.includes('（' + fx.C + '）') || u.includes('（' + fx.D + '）')),
		'共通(5): 共通イベントが未入力のキャラクターは「未確認」に出て、入力済み・none のキャラクターは出ない', charaUnconf);
	assert(res.charsWithoutMark.length === 0, '共通(6): グループかどうかの印（isGroup）が無いカードには当てはめない', res.charsWithoutMark);

	/* 表の印（グループのカードとメンバーのカードの両方の列） */
	const marks = await page.evaluate(async ({ cardIds, T }) => {
		const Core = window.UmaSkillDeckCore;
		localStorage.setItem('umaSkillDeck:draftRoster:smoke-chara', JSON.stringify({ umaId: '', cardIds: cardIds }));
		const host = document.createElement('div');
		document.body.appendChild(host);
		Core.createRosterPanel(host, { draftKey: 'smoke-chara' });
		const rows = Array.from(host.querySelectorAll('.usd-roster-grow')).slice(1);
		const nameOf = (id) => (Core.findSkill(id) || {}).name;
		const out = {};
		T.forEach((id, i) => {
			const row = rows.find((r) => r.querySelector('.usd-roster-skillname').textContent === nameOf(id));
			out[i] = row ? Array.from(row.querySelectorAll('[role="cell"]')).map((c) =>
				c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '△' : '').join('|') : null;
		});
		host.remove();
		return out;
	}, { cardIds: fx.cardIds, T: T });
	// 並びは 育成ウマ娘|1|2|3|4|5|6
	assert(marks[3] === '||●|●|||' && marks[1] === '||△|△|||' && marks[4] === '||●||||' && marks[0] === '|●|||||',
		'共通(7): 表では、同じ共通イベントがグループのカードとメンバーのカードの両方の列に出る', marks);
	assert(errors.length === 0, '共通: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});
/* ============================================================
 * card-event-input.html ―― 回の箱を最初から並べる入力と出力 A（C-102・区切り1。2026-09-27 に画面を作り直した）
 *
 * 作業用ページだが、出力 A はそのまま data/ に貼るものなので、**出力が check:catalog を通る**ことまで見る
 * （出力を一時フォルダの support-card-event-skills.json にして `check:catalog --dir=` に通す）。
 * カード名・スキル名は書かない（実データから拾う）。
 * 見ること：
 *   - 開くと「1回目・2回目・3回目」の箱が最初から並ぶ（回の番号を打つ欄は無い）。空の回は「スキルなし」
 *   - 2回目の箱の「＋ スキル」で足したスキルは2回目に入る（前の画面では3回目に入ってしまっていた）。Lv は 1 が入る
 *   - 形の切り替え（確定／選択肢で分かれる／結果で分かれる）・選択肢の中の成功・失敗・結果3・4回目を足す
 *   - 要約の1行・スキルの無い回は出力に書かない・出力が check:catalog を通る
 *   - 前の画面の途中経過（回の番号が空・同じ番号が2つ）を黙って捨てずに「回が決まっていないスキル」に出し、回へ移せる
 *   - 「イベント無しにする」「このカードの入力をやめる」は確かめてから
 * ============================================================ */
await block('card-event-input.html ―― 回の箱を最初から並べる入力と出力 A（C-102・区切り1）', async () => {
{
	const cardsDoc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8'));
	const extDoc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/extended-skills.json'), 'utf8'));
	const masterDoc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'uma-skill-deck-skills.json'), 'utf8'));
	// **ファイルにまだ入っていないカード**を使う（入っているカードは「入力する」ではなく「直す」が出る）。
	// 最初は「最後のカード」で決め打ちにしていて、そのカードが実際にファイルに入った日に検査が落ちた（2026-09-27）。
	const realEventDoc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-card-event-skills.json'), 'utf8'));
	// 「SSR だけ」が既定で効く（2026-09-27 にカードのデータへレアリティが入った）ので、グループでない SSR のカードを使う。
	// 【2026-09-30】実データに SSR の入力がほぼ全部入ったので、「ファイルにまだ入っていないカード」が無くなる日がある。
	// そこで、使うカードの行をファイルから外した写しを取得の途中で渡す（ページから見て必ず未確認になる）。
	// キャラクター共通のイベントのファイルも、空の写しを渡す（実データで「入力済み」になった人がいても、この塊は未入力から始める）。
	const card = cardsDoc.entries.slice().reverse().find((c) => c.rarity === 'SSR' && !c.isGroup && !realEventDoc.entries.some((e) => e.cardId === c.id))
		|| cardsDoc.entries.slice().reverse().find((c) => c.rarity === 'SSR' && !c.isGroup);
	// 【2026-09-30・実データの入力状況に依存しない作りへ】この塊が使うカード（SSR・SR・R・グループのメンバーの1枚）は、
	// **どれも実データの行を外した写しを渡して、ページから見て必ず未確認にする**。以前は SR・R・N を「実データで行が無いカード」から選んでいたので、
	// SR や R が実データに入った日に落ちた（今後もデータを受け入れるたびに落ちる作りだった）。
	// これで、実データに行の無いカードが残っていても（受け入れ前）、すべてのカードに行があっても（将来）、同じように通る。
	const G = cardsDoc.entries.find((c) => c.isGroup === true);
	const M = G.groupMembers.slice(1).find((n) => cardsDoc.entries.some((c) => c.isGroup === false && c.charaName === n));
	const N = cardsDoc.entries.find((c) => c.isGroup === false && c.charaName === M);
	const SR = cardsDoc.entries.find((c) => c.rarity === 'SR' && !c.isGroup);
	const R = cardsDoc.entries.find((c) => c.rarity === 'R' && !c.isGroup);
	const blanked = new Set([card.id, SR.id, R.id, N.id, G.id]);
	const eventDoc = Object.assign({}, realEventDoc, { entries: realEventDoc.entries.filter((e) => !blanked.has(e.cardId)) });
	const charaEventDoc = Object.assign({}, JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/character-event-skills.json'), 'utf8')), { entries: [] });
	const inFile = new Set(eventDoc.entries.map((e) => e.cardId));
	// 名前の一部で探して1件に絞れるスキルを3つ（拡張スキル1・マスター2）。名前はデータから拾う
	const allNames = masterDoc.skills.map((s) => s.name).concat(extDoc.entries.map((e) => e.name));
	const unique = (s) => allNames.filter((n) => n.includes(s.name)).length === 1;
	const exSkill = extDoc.entries.find((e) => !e.tagsPending && unique(e)) || extDoc.entries.find(unique);
	const [m1, m2] = masterDoc.skills.filter(unique).slice(0, 2);
	const ref = (s, lv) => ({ skillId: s.id, name: s.name, hintLevel: lv });

	const openCei = async (draft) => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(5000);
		const errors = [];
		const warns = [];
		const dialogs = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
		// 確かめのダイアログは、既定では「はい」。page.__dismissNext を立てたときだけ「いいえ」
		page.__dismissNext = false;
		page.on('dialog', (dlg) => { dialogs.push(dlg.message()); if (page.__dismissNext) { page.__dismissNext = false; dlg.dismiss(); } else dlg.accept(); });
		await page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(eventDoc) }));
		await page.route('**/data/character-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(charaEventDoc) }));
		await page.addInitScript((d) => {
			if (sessionStorage.getItem('smoke-cei-init')) return;
			sessionStorage.setItem('smoke-cei-init', '1');
			// 前の形（C-102 の前）の途中経過が残っている利用者
			localStorage.setItem('umaCardEventInput:draft', JSON.stringify({ 'card-0001': { status: 'done', skillIds: ['1'] } }));
			if (d) localStorage.setItem('umaCardEventInput:draft2', JSON.stringify(d));
		}, draft || null);
		await page.goto(base + '/card-event-input.html', { waitUntil: 'networkidle' });
		await page.waitForFunction(() => /全\d+枚/.test(document.getElementById('cei-counts').textContent));
		return { ctx, page, errors, warns, dialogs };
	};
	const row = '.cei-row[data-card-id="' + card.id + '"]';
	const round = (step) => row + ' .cei-round[data-step="' + step + '"]';
	const outOf = async (page) => JSON.parse(await page.inputValue('#cei-out'));
	// 出力の中の、このカードの行（ファイルにすでに入っている行は前に並ぶので、位置では探さない）
	const mine = (out) => out.entries.find((e) => e.cardId === card.id) || null;
	const openCard = async (page) => { await page.fill('#cei-q', card.title); await page.click(row + ' [data-act="open"]'); };
	/** 枠の「＋ スキル」→ 名前で探して選ぶ → Lv を直す（lv を渡したときだけ）→ 探す欄を閉じる */
	const addSkill = async (page, frameSel, skill, lv) => {
		const btn = frameSel + ' [data-act="find-open"]';
		await page.click(btn);
		// 検索欄は同時に1つしか開かない（カードの行でもキャラクターの行でも）ので、ページ全体から探す
		await page.fill('[data-act="find"]', skill.name);
		await page.waitForSelector('[data-act="pick"]');
		await page.click('[data-act="pick"]:not([disabled])');
		if (lv) {
			const inputs = await page.$$(frameSel + ' [data-act="lv"]');
			const last = inputs[inputs.length - 1];
			await last.fill(String(lv));
			await last.dispatchEvent('change');
		}
		await page.click(btn); // 探す欄を閉じる
	};

	/* --- 1枚目：何も無いところから --- */
	{
		const { ctx, page, errors, warns, dialogs } = await openCei(null);
		assert(warns.some((w) => w.includes('前の形の途中経過')) && await page.evaluate(() => localStorage.getItem('umaCardEventInput:draft') !== null),
			'入力(0): 前の形の途中経過は消さずに、起動時に知らせる', warns);
		// レアリティがカードのデータに入ったので、「SSR だけ」が効く（効かないという注記は出ない）
		const focus = await page.evaluate(() => ({
			note: !document.getElementById('cei-focus-note').hidden,
			rows: document.querySelectorAll('.cei-row').length,
		}));
		const ssrPending = cardsDoc.entries.filter((c) => c.rarity === 'SSR' && !inFile.has(c.id)).length;
		assert(!focus.note && focus.rows === ssrPending, '入力(1): 「SSR だけ」が既定で効き、未確認の SSR のカードだけが並ぶ', { focus, ssrPending });

		await openCard(page);
		const first = await page.evaluate((r) => {
			const rows = Array.from(document.querySelectorAll(r + ' .cei-round'));
			return {
				titles: rows.map((x) => x.querySelector('.cei-round-title').textContent),
				empty: rows.map((x) => x.textContent.includes('スキルなし')),
				active: rows.map((x) => (x.querySelector('.cei-form.active') || {}).textContent),
				stepInputs: document.querySelectorAll(r + ' input[data-act="step"]').length,
			};
		}, row);
		assert(first.titles.join() === '1回目,2回目,3回目' && first.empty.every(Boolean) && first.stepInputs === 0
			&& first.active.every((t) => t && t.startsWith('確定')),
			'入力(2): 開くと1〜3回目の箱が最初から並び、形は「確定」、空の回は「スキルなし」。回の番号を打つ欄は無い', first);

		// 【2026-09-28】開いて形だけ触り、スキルを入れずに閉じても「入力あり」にならず、途中経過にも出力にも残らない
		await page.click(round(1) + ' [data-act="form"][data-form="choice"]');
		// 開いたまま（閉じるときの片づけより前）でも、保存と出力 A には出ない
		const whileOpenAll = await page.evaluate(({ r, id }) => ({
			badge: document.querySelector(r + ' .uma-badge').textContent,
			saved: Object.keys(JSON.parse(localStorage.getItem('umaCardEventInput:draft2') || '{}')).includes(id),
			out: JSON.parse(document.getElementById('cei-out').value).entries.some((e) => e.cardId === id),
			warn: document.getElementById('cei-out-warn').hidden ? '' : document.getElementById('cei-out-warn').textContent,
		}), { r: row, id: card.id });
		assert(!whileOpenAll.saved && !whileOpenAll.out && whileOpenAll.warn === '',
			'入力(2a): 開いて形だけ触った（スキルを入れていない）カードは、開いたままでも保存・出力 A に出ない', whileOpenAll);
		const whileOpen = whileOpenAll.badge;
		await page.click(row + ' [data-act="open"]');
		const closed = await page.evaluate(({ r, id }) => ({
			badge: document.querySelector(r + ' .uma-badge').textContent,
			summary: !!document.querySelector(r + ' .cei-summary'),
			saved: Object.keys(JSON.parse(localStorage.getItem('umaCardEventInput:draft2') || '{}')).includes(id),
			out: JSON.parse(document.getElementById('cei-out').value).entries.some((e) => e.cardId === id),
			warn: document.getElementById('cei-out-warn').hidden ? '' : document.getElementById('cei-out-warn').textContent,
		}), { r: row, id: card.id });
		assert(whileOpen === '未確認' && closed.badge === '未確認' && !closed.summary && !closed.saved && !closed.out && closed.warn === '',
			'入力(2b): 開いて何も入れずに閉じたカードは未確認のままで、途中経過・出力 A に残らない', { whileOpen, closed });
		await openCard(page);
		// 1回目の形を切り替えて戻す（空の回がデータにできる。それでも出力には書かない）
		await page.click(round(1) + ' [data-act="form"][data-form="choice"]');
		await page.click(round(1) + ' [data-act="form"][data-form="fixed"]');
		// 2回目の箱の「＋ スキル」で足したスキルは2回目に入る。Lv は 1 が入っている
		await addSkill(page, round(2), m1);
		const lv1 = await page.inputValue(round(2) + ' [data-act="lv"]');
		// 3回目：確定で2つ（Lv を直す）
		await addSkill(page, round(3), exSkill, 2);
		await addSkill(page, round(3), m2);
		const sum1 = await page.textContent(row + ' .cei-summary');
		let out = await outOf(page);
		assert(lv1 === '1' && JSON.stringify(mine(out)) === JSON.stringify({ cardId: card.id, status: 'done', chain: [
			{ step: 2, choices: [{ skills: [ref(m1, 1)] }] },
			{ step: 3, choices: [{ skills: [ref(exSkill, 2), ref(m2, 1)] }] }] }),
			'入力(3): 2回目の箱に足したスキルは2回目に入り、Lv は最初から 1。スキルの無い1回目は出力に書かない', { lv1, entry: mine(out) });
		assert(sum1 === '2回目：' + m1.name + ' Lv1 ／ 3回目：' + exSkill.name + ' Lv2・' + m2.name + ' Lv1',
			'入力(4): カードの見出しの下に、いま入っている内容の要約が1行で出る', sum1);

		// 1回目：選択肢で分かれる → 選択肢1は成功・失敗に分けて成功に m2、選択肢2 はスキル無し
		await page.click(round(1) + ' [data-act="form"][data-form="choice"]');
		const choices = await page.$$eval(round(1) + ' .cei-choice-title', (x) => x.map((e) => e.textContent));
		await page.click(round(1) + ' [data-act="split"][data-c="0"]');
		const frames = await page.$$eval(round(1) + ' .cei-frame-title', (x) => x.map((e) => e.textContent));
		await addSkill(page, round(1) + ' .cei-frame[data-c="0"][data-r="0"]', m2);
		assert(choices.join() === '選択肢1,選択肢2' && frames.join() === '成功,失敗',
			'入力(5): 「選択肢で分かれる」で選択肢1・2の枠が並び、選択肢の中は「成功」「失敗」に分けられる（どの枠にも見出し）', { choices, frames });

		// 4回目を足して「結果で分かれる」：結果1〜3
		await page.click(row + ' [data-act="add-row"]');
		await page.click(round(4) + ' [data-act="form"][data-form="result"]');
		await page.click(round(4) + ' [data-act="add-result"]');
		const rTitles = await page.$$eval(round(4) + ' .cei-frame-title', (x) => x.map((e) => e.textContent));
		await addSkill(page, round(4) + ' .cei-frame[data-r="0"]', exSkill, 3);
		await addSkill(page, round(4) + ' .cei-frame[data-r="1"]', exSkill, 2);
		await addSkill(page, round(4) + ' .cei-frame[data-r="2"]', m1);
		assert(rTitles.join() === '結果1（いちばん良い＝成功）,結果2,結果3',
			'入力(6): 「＋ 4回目を足す」で箱が増え、「結果で分かれる」は結果1（いちばん良い＝成功）から並ぶ', rTitles);

		out = await outOf(page);
		const want = { cardId: card.id, status: 'done', chain: [
			{ step: 1, choices: [{ results: [[ref(m2, 1)], []] }, { skills: [] }] },
			{ step: 2, choices: [{ skills: [ref(m1, 1)] }] },
			{ step: 3, choices: [{ skills: [ref(exSkill, 2), ref(m2, 1)] }] },
			{ step: 4, choices: [{ results: [[ref(exSkill, 3)], [ref(exSkill, 2)], [ref(m1, 1)]] }] }] };
		assert(out.entries.length === eventDoc.entries.length + 1 && JSON.stringify(mine(out)) === JSON.stringify(want),
			'入力(7): 出力 A は「回 → 選択肢 → 結果」の形で、空の選択肢も残り、結果の並び（先頭が成功）とレベルが入る', { got: mine(out), want });
		assert(out.category === 'supportCardEventSkill' && /^\d{4}-\d{2}-\d{2}[a-z]$/.test(out.dataVersion) && typeof out.note === 'string',
			'入力(8): 出力 A はファイル全体（category・dataVersion・note を引き継ぐ）', { category: out.category, dataVersion: out.dataVersion });
		// 出力をそのまま貼ったと見なして check:catalog に通す
		{
			const tmp = path.join(REPO_ROOT, 'output', 'scratch', 'smoke-cei-catalog');
			fs.rmSync(tmp, { recursive: true, force: true });
			fs.cpSync(path.join(REPO_ROOT, 'data'), tmp, { recursive: true });
			fs.writeFileSync(path.join(tmp, 'support-card-event-skills.json'), await page.inputValue('#cei-out'));
			const { spawnSync } = await import('node:child_process');
			const r = spawnSync(process.execPath, ['tests/catalog/check-catalog.mjs', '--dir=' + path.relative(REPO_ROOT, tmp).split(path.sep).join('/')],
				{ cwd: REPO_ROOT, encoding: 'utf8' });
			fs.rmSync(tmp, { recursive: true, force: true });
			assert(r.status === 0, '入力(9): 出力 A を貼ると check:catalog が通る', (r.stdout || '').split('\n').filter((l) => l.startsWith('[NG]')));
		}

		// 開き直しても同じ出力（入力中のカードは「未確認・入力中だけ」でも一覧に残る）
		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForFunction(() => /全\d+枚/.test(document.getElementById('cei-counts').textContent));
		assert(JSON.stringify((await outOf(page)).entries) === JSON.stringify(out.entries),
			'入力(10): 開き直しても途中経過から同じ出力になる');
		await openCard(page);

		// 形を「確定」に戻す：いちばん上の枠（成功）のスキルは残り、ほかが消えるときは確かめる
		dialogs.length = 0;
		await page.click(round(4) + ' [data-act="form"][data-form="fixed"]');
		out = await outOf(page);
		assert(dialogs.length === 1 && JSON.stringify(mine(out).chain[3]) === JSON.stringify({ step: 4, choices: [{ skills: [ref(exSkill, 3)] }] }),
			'入力(11): 形を「確定」に戻すと、いちばん上の枠のスキルを残し、消えるスキルがあれば先に確かめる', { dialogs, ev: mine(out).chain[3] });

		// 「このカードの入力をやめる」は確かめる（いいえなら何も消えない）。「イベント無しにする」も確かめてから
		page.__dismissNext = true;
		await page.click(row + ' [data-act="reset"]');
		const kept = mine(await outOf(page)) ? 1 : 0;
		await page.click(row + ' [data-act="none"]');
		const none = mine(await outOf(page));
		assert(kept === 1 && JSON.stringify(none) === JSON.stringify({ cardId: card.id, status: 'none' }),
			'入力(12): 「入力をやめる」は「いいえ」なら消えない。「イベント無しにする」は chain を持たない行になる', { kept, none });
		assert(errors.length === 0, '入力: コンソールエラーなし（1枚目）', errors.slice(0, 3));
		await ctx.close();
	}

	/* --- 前の画面の途中経過（回の番号が空・同じ番号が2つ）を読む --- */
	{
		const old = { [card.id]: { status: 'done', chain: [
			{ step: null, choices: [{ skills: [{ skillId: m1.id, hintLevel: 1 }] }] },
			{ step: 3, choices: [{ skills: [{ skillId: exSkill.id, hintLevel: 1 }] }] },
			{ step: 3, choices: [{ skills: [{ skillId: m2.id, hintLevel: 2 }] }] }] } };
		const { ctx, page, errors } = await openCei(old);
		await openCard(page);
		const st = await page.evaluate((r) => ({
			stray: Array.from(document.querySelectorAll(r + ' .cei-stray .cei-chip')).map((c) => c.textContent),
			problems: Array.from(document.querySelectorAll(r + ' .cei-problems li')).map((li) => li.textContent),
		}), row);
		const held = mine(await outOf(page)) ? 1 : 0;
		assert(st.stray.length === 1 && st.stray[0].includes(m1.name) && st.problems.some((p) => p.includes('回が決まっていない')) && held === 0,
			'入力(13): 回の番号が空のスキルは捨てずに「回が決まっていないスキル」に出し、回へ移すまで出力に入れない', { st, held });
		await page.click(row + ' .cei-stray [data-act="stray-move"][data-step="2"]');
		const moved = mine(await outOf(page));
		assert(JSON.stringify(moved) === JSON.stringify({ cardId: card.id, status: 'done', chain: [
			{ step: 2, choices: [{ skills: [ref(m1, 1)] }] },
			{ step: 3, choices: [{ skills: [ref(exSkill, 1), ref(m2, 2)] }] }] }),
			'入力(14): 「2回目へ」で回へ移せる。同じ番号の「確定」の回が2つあったものは1つにまとめる', moved);
		assert(errors.length === 0, '入力: コンソールエラーなし（前の途中経過）', errors.slice(0, 3));
		await ctx.close();
	}

	/* --- キャラクター共通のイベント（C-102・区切り3）：キャラクターのタブ・出力 B・カードのタブの表示・最初に並べる回の数 --- */
	{
		const charaCount = new Set(cardsDoc.entries.flatMap((c) => c.isGroup ? c.groupMembers : [c.charaName])).size;
		const { ctx, page, errors } = await openCei(null);
		// 最初に並べる回の数：SSR 3・SR 2・R 1・グループ 3
		await page.uncheck('#cei-only-focus');
		const boxesOf = async (c) => {
			await page.fill('#cei-q', c.title);
			const sel = '.cei-row[data-card-id="' + c.id + '"]';
			await page.click(sel + ' [data-act="open"]');
			const n = await page.$$eval(sel + ' .cei-round', (x) => x.length);
			const links = await page.$$eval(sel + ' [data-act="goto-chara"]', (x) => x.map((b) => b.getAttribute('data-name') + '|' + b.textContent));
			await page.click(sel + ' [data-act="open"]');
			return { n, links };
		};
		const bSSR = await boxesOf(card), bSR = await boxesOf(SR), bR = await boxesOf(R), bG = await boxesOf(G);
		assert(bSSR.n === 3 && bSR.n === 2 && bR.n === 1 && bG.n === 3,
			'共通入力(1): 最初に並べる回の数は SSR 3・SR 2・R 1・グループのカード 3', { ssr: bSSR.n, sr: bSR.n, r: bR.n, group: bG.n });
		assert(bG.links.map((l) => l.split('|')[0]).join() === G.groupMembers.join() && bG.links.every((l) => l.includes('（未入力）'))
			&& bSSR.links.length === 1 && bSSR.links[0].startsWith(card.charaName + '|'),
			'共通入力(2): カードを開くと当てはまる共通イベントのキャラクターが出る（グループのカードはメンバー全員・未入力）', { group: bG.links, ssr: bSSR.links });

		// カードのタブの「共通イベント：M（未入力）」を押すと、キャラクターのタブのその人の入力へ移る
		await page.fill('#cei-q', N.title);
		const nSel = '.cei-row[data-card-id="' + N.id + '"]';
		await page.click(nSel + ' [data-act="open"]');
		await page.click(nSel + ' [data-act="goto-chara"][data-name="' + M + '"]');
		const cSel = '.cei-row[data-chara="' + M + '"]';
		const moved = await page.evaluate((s) => ({
			tab: (document.querySelector('[data-act="tab"].active') || {}).getAttribute('data-tab'),
			open: !!document.querySelector(s + ' .cei-round'),
			boxes: Array.from(document.querySelectorAll(s + ' .cei-round-title')).map((e) => e.textContent),
			cards: (document.querySelector(s + ' .cei-summary--cards') || {}).textContent,
			counts: document.getElementById('cei-counts').textContent,
		}), cSel);
		assert(moved.tab === 'chara' && moved.open && moved.boxes.join() === '共通イベント1'
			&& moved.cards.includes('グループのカードのメンバー：［' + G.title + '］') && moved.counts.startsWith('全' + charaCount + '人'),
			'共通入力(3): 押すとキャラクターのタブに移り、その人の「共通イベント1」の箱が開く（カードの枚数・グループのメンバーであることも出る）', moved);

		// 共通イベント1：確定で m1／共通イベント2：選択肢で分かれる（選択肢1 に m2・選択肢2 はなし）
		await addSkill(page, cSel + ' .cei-round[data-step="1"]', m1, 2);
		await page.click(cSel + ' [data-act="add-row"]');
		await page.click(cSel + ' .cei-round[data-step="2"] [data-act="form"][data-form="choice"]');
		await addSkill(page, cSel + ' .cei-round[data-step="2"] .cei-frame[data-c="0"]', m2);
		const outB = JSON.parse(await page.inputValue('#cei-out-b'));
		const mineB = outB.entries.find((e) => e.charaName === M);
		assert(outB.category === 'characterEventSkill' && typeof outB.note === 'string' && JSON.stringify(mineB) === JSON.stringify({ charaName: M, status: 'done', events: [
			{ choices: [{ skills: [ref(m1, 2)] }] },
			{ choices: [{ skills: [ref(m2, 1)] }, { skills: [] }] }] }),
			'共通入力(4): 出力 B は { charaName, status, events: [{ choices }] }（回の番号を持たない）', mineB);
		{
			const tmp = path.join(REPO_ROOT, 'output', 'scratch', 'smoke-cei-catalog-b');
			fs.rmSync(tmp, { recursive: true, force: true });
			fs.cpSync(path.join(REPO_ROOT, 'data'), tmp, { recursive: true });
			fs.writeFileSync(path.join(tmp, 'character-event-skills.json'), await page.inputValue('#cei-out-b'));
			const { spawnSync } = await import('node:child_process');
			const r = spawnSync(process.execPath, ['tests/catalog/check-catalog.mjs', '--dir=' + path.relative(REPO_ROOT, tmp).split(path.sep).join('/')],
				{ cwd: REPO_ROOT, encoding: 'utf8' });
			fs.rmSync(tmp, { recursive: true, force: true });
			assert(r.status === 0, '共通入力(5): 出力 B を貼ると check:catalog が通る', (r.stdout || '').split('\n').filter((l) => l.startsWith('[NG]')));
		}

		// カードのタブへ戻ると、M のカードでは「入力済み」になる（1回入力すれば、同じキャラクターのほかのカードでも入力済み）
		await page.click('[data-act="tab"][data-tab="card"]');
		await page.fill('#cei-q', N.title);
		const after = await page.$$eval(nSel + ' [data-act="goto-chara"]', (x) => x.map((b) => b.textContent));
		assert(after.length === 1 && after[0] === M + '（入力済み）',
			'共通入力(6): キャラクターに入力すると、そのキャラクターのカードでは「入力済み」と出る', after);
		assert(errors.length === 0, '共通入力: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();

		// グループのカードは5枚とも SSR なので、実データでは「グループは3つ」と「SSR は3つ」を見分けられない。
		// 取得するカードのデータでグループのカードを SR に差し替えて、それでも3つ並ぶことを見る
		{
			const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
			const page2 = await ctx2.newPage();
			page2.setDefaultTimeout(5000);
			const altered = JSON.parse(JSON.stringify(cardsDoc));
			altered.entries.find((c) => c.id === G.id).rarity = 'SR';
			await page2.route('**/data/support-cards.json*', (route) => route.fulfill({
				status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(altered) }));
			await page2.goto(base + '/card-event-input.html', { waitUntil: 'networkidle' });
			await page2.waitForFunction(() => /全\d+枚/.test(document.getElementById('cei-counts').textContent));
			await page2.uncheck('#cei-only-focus');
			await page2.fill('#cei-q', G.title);
			await page2.click('.cei-row[data-card-id="' + G.id + '"] [data-act="open"]');
			const n = await page2.$$eval('.cei-row[data-card-id="' + G.id + '"] .cei-round', (x) => x.length);
			assert(n === 3, '共通入力(7): グループのカードは、レアリティが SR でも3つ並べる', n);
			await ctx2.close();
		}

		// 見た目：375px の幅で、キャラクターのタブが横にはみ出さない（件数の1行が長いので折り返す）
		{
			const ctx3 = await browser.newContext({ viewport: { width: 375, height: 800 } });
			const page3 = await ctx3.newPage();
			page3.setDefaultTimeout(5000);
			await page3.goto(base + '/card-event-input.html', { waitUntil: 'networkidle' });
			await page3.waitForFunction(() => /全\d+枚/.test(document.getElementById('cei-counts').textContent));
			await page3.click('[data-act="tab"][data-tab="chara"]');
			await page3.waitForTimeout(400); // 色の切り替え（.uma-pill の transition）が終わってから測る
			const look = await page3.evaluate(() => ({
				scrollW: document.documentElement.scrollWidth,
				tabActive: getComputedStyle(document.querySelector('[data-act="tab"].active')).backgroundColor,
				tabIdle: getComputedStyle(document.querySelector('[data-act="tab"]:not(.active)')).backgroundColor,
			}));
			assert(look.scrollW <= 375 && look.tabActive !== look.tabIdle,
				'共通入力(8・見た目): 375px でキャラクターのタブが横にはみ出さず、選んでいるタブが見分けられる', look);
			await ctx3.close();
		}
	}
}
});

/* ============================================================
 * card-event-input.html ―― 下書きの読み込み（C-104。2026-09-29）
 *
 * 本物の下書きは Git に入らないので、tests/visual/lib/draft-fixture.mjs で形だけを写した仮の下書きを組み、
 * ファイル選択の欄に setInputFiles で渡す（ディスクに置かない）。イベントスキルのファイルも仮のもの（P4 の行だけ）に差し替える。
 * カード名・スキル名は書かない（仕込みが実データから id で拾う）。
 * 見ること（Step 0 の 8-2）：
 *   - 読んだだけ・直しただけでは「入力あり」が増えず、出力 A・B がバイト単位で変わらない
 *   - 下書きのあるカードは「下書き（未確認）」。スキルの無い下書きは下書きが無いのと同じ（イベント無しにしない）
 *   - 一覧に無い名前があるあいだは「見比べた」を押せない。「ほかから選ぶ」はその名前を入れて検索を開き、同じ場所・同じ Lv で置き換える
 *   - レベルの無いスキルは「レベルが入っていません」。直すと押せる
 *   - 「見比べた」のあとだけ出力 A に入る。ファイルにあるカードは下書きで上書きし、見比べるまでファイルの行が出力に残る
 *   - 目で確定するものに印。文から番号を外す。見比べるときに念を押す（いいえなら下書きのまま）
 *   - 手の入力があるカードは置き換えない。読み直したとき、手を入れた下書きは残し、手を入れていない下書きは置き換える
 *   - 公開データに無いカード・キャラクターは飛ばし、公開データに入ったあとの起動で当てはめる（後片付けで消えない）
 *   - 共通イベント：自身の行を使い、グループの欄の行があることを1行出す／グループの欄の行だけのときはそれを使う
 *   - umaSkillDeck: のキーに書かない・読み込みの間に通信しない・控えに許可していない項目が入らない
 *   - 「下書きを消す」で見比べていない下書きと控えが消え、見比べたものは残る
 *   - 375px ではみ出さない
 * ============================================================ */
await block('card-event-input.html ―― 下書きの読み込み（C-104）', async () => {
{
	const fx = buildDraftFixture();
	const { P1, P2, P3, P4, P5, P6, P7, U } = fx.cards;
	const { C1, C2, C3, CU } = fx.charas;
	const S = fx.S;
	const cardsDoc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8'));
	const fileOf = (v) => ({ name: 'draft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fx.draft(v)), 'utf8') });
	let withU = false; // true にすると、公開データに U のカードが入った形で返す

	const setup = async (ctx) => {
		await ctx.route('**/data/support-card-event-skills.json*', (r) => r.fulfill({
			status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fx.file) }));
		// 【2026-09-30】共通イベントの実データが入ったので空にする（C2 が「ファイルに入っている」で一覧から消えないように）
		await ctx.route('**/data/character-event-skills.json*', (r) => r.fulfill({
			status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] }) }));
		await ctx.route('**/data/support-cards.json*', (r) => {
			if (!withU) return r.continue();
			const doc = JSON.parse(JSON.stringify(cardsDoc));
			const like = doc.entries.find((c) => c.id === P1);
			doc.entries.push(Object.assign({}, like, { id: U, title: '（検査用）' + like.title }));
			return r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(doc) });
		});
	};
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await setup(ctx);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	const errors = [];
	const dialogs = [];
	let dismissNext = false;
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	page.on('dialog', (d) => { dialogs.push(d.message()); if (dismissNext) { dismissNext = false; d.dismiss(); } else d.accept(); });
	// P6 には手の入力を入れておく（下書きで置き換えないこと）
	await page.addInitScript((d) => {
		if (sessionStorage.getItem('smoke-cei-import-init')) return;
		sessionStorage.setItem('smoke-cei-import-init', '1');
		localStorage.setItem('umaCardEventInput:draft2', JSON.stringify(d));
	}, { [P6]: { status: 'done', chain: [{ step: 1, choices: [{ skills: [{ skillId: S[7], hintLevel: 1 }] }] }] } });
	await page.goto(base + '/card-event-input.html', { waitUntil: 'networkidle' });
	await page.waitForFunction(() => /全\d+枚/.test(document.getElementById('cei-counts').textContent));

	const doneCount = async () => Number((await page.textContent('#cei-counts')).match(/入力あり (\d+)/)[1]);
	const stateOf = (id) => page.evaluate((i) => { const r = document.querySelector('.cei-row[data-card-id="' + i + '"]'); return r ? r.getAttribute('data-state') : null; }, id);
	const charaState = (n) => page.evaluate((i) => { const r = Array.from(document.querySelectorAll('.cei-row[data-chara]')).find((x) => x.getAttribute('data-chara') === i); return r ? r.getAttribute('data-state') : null; }, n);
	const outA = async () => JSON.parse(await page.inputValue('#cei-out'));
	const rowA = async (id) => (await outA()).entries.find((e) => e.cardId === id) || null;
	const openCard = async (id) => {
		await page.fill('#cei-q', '');
		await page.click('.cei-row[data-card-id="' + id + '"] [data-act="open"]');
	};
	const rowSel = (id) => '.cei-row[data-card-id="' + id + '"]';

	const before = { outA: await page.inputValue('#cei-out'), outB: await page.inputValue('#cei-out-b'), done: await doneCount(),
		deck: await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('umaSkillDeck:')).sort()) };
	const requests = [];
	page.on('request', (r) => requests.push(r.url()));
	await page.setInputFiles('#cei-import-file', fileOf(1));
	await page.waitForFunction(() => !document.getElementById('cei-import-result').hidden);
	const netDuringImport = requests.slice();

	/* --- 1・2 読んだだけでは入力ありにならない・出力は変わらない・状態 --- */
	assert(await page.inputValue('#cei-out') === before.outA && await page.inputValue('#cei-out-b') === before.outB,
		'下書き(1): 読んだだけでは出力 A・B がバイト単位で変わらない');
	assert(await doneCount() === before.done - 2,
		'下書き(1): 読んだだけでは「入力あり」が増えない（ファイルにだけあった P4・P7 は下書きで上書きされて2つ減る）', { before: before.done, after: await doneCount() });
	const st = { P1: await stateOf(P1), P2: await stateOf(P2), P3: await stateOf(P3), P4: await stateOf(P4), P5: await stateOf(P5), P6: await stateOf(P6), P7: await stateOf(P7), U: await stateOf(U) };
	assert(st.P1 === 'imported' && st.P2 === 'imported' && st.P3 === 'imported' && st.P4 === 'imported' && st.P7 === 'imported',
		'下書き(2): 下書きのあるカードは「下書き（未確認）」（ファイルにある P4・P7 も、中身が同じでも上書き）', st);
	assert(st.P5 === 'pending' && st.P6 === 'done' && st.U === null,
		'下書き(2): スキルの無い下書きは未確認のまま（イベント無しにしない）／手の入力は置き換えない／公開データに無いカードは出ない', st);
	const result = await page.textContent('#cei-import-result');
	assert(result.includes(U) && result.includes('公開データにまだ無い') && result.includes('2件') && result.includes('スキルの無い下書き（カード 1枚・キャラクター 1人）'),
		'下書き(2): 読み込んだときに、公開データに無いもの（カード・キャラクター 2件）とスキルの無い下書きを1回知らせる', result);
	assert((await page.textContent(rowSel(P1) + ' .uma-badge')).trim() === '下書き（未確認）', '下書き(2): 一覧のしるしは「下書き（未確認）」');

	/* --- 11 置き場・通信 --- */
	const store = await page.evaluate(() => localStorage.getItem('umaCardEventInput:importDraft') || '');
	const deckAfter = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('umaSkillDeck:')).sort());
	assert(store.length > 0 && !store.includes('検査用の仮の下書き') && !store.includes('許可していない項目') && JSON.stringify(deckAfter) === JSON.stringify(before.deck),
		'下書き(11): 控えは umaCardEventInput:importDraft にあり、説明文や許可していない項目は入らない。umaSkillDeck: のキーは増えない', { deckAfter, before: before.deck });
	assert(netDuringImport.length === 0, '下書き(11): 読み込みの間に通信が起きない', netDuringImport);

	/* --- 3・4 一覧に無い名前とレベルの無いスキル（P2） --- */
	await openCard(P2);
	const p2 = await page.$eval(rowSel(P2), (el) => ({
		unlisted: Array.from(el.querySelectorAll('[data-unlisted]')).map((c) => c.textContent),
		problems: Array.from(el.querySelectorAll('.cei-problems li')).map((l) => l.textContent),
		disabled: el.querySelector('[data-act="check"]').disabled,
		lead: (el.querySelector('.cei-imported-lead') || {}).textContent || '',
	}));
	assert(p2.unlisted.length === 1 && p2.unlisted[0].includes(fx.unlisted) && p2.unlisted[0].includes('一覧に無い名前') && p2.disabled
		&& p2.problems.some((t) => t.includes(fx.unlisted) && t.includes('一覧に無い名前')) && p2.problems.some((t) => t.includes('レベル')),
		'下書き(3・4): 一覧に無い名前とレベルの無いスキルは赤字の不足に出て、そのあいだは「見比べた」を押せない', p2);
	assert(p2.lead.includes('ゲーム画面と見比べた'), '下書き(3): 開くと、下書きから入れた内容だという説明が出る', p2.lead);
	await page.click(rowSel(P2) + ' [data-act="find-replace"]');
	await page.waitForTimeout(300);
	const findQ = await page.inputValue('[data-act="find"]');
	const hitIds = await page.$$eval('[data-act="pick"]', (bs) => bs.map((b) => b.getAttribute('data-skill')));
	assert(findQ === fx.unlisted && hitIds.includes(fx.X.id), '下書き(3): 「ほかから選ぶ」は、その名前を入れた状態で検索を開く', { findQ, hitIds });
	await page.click('[data-act="pick"][data-skill="' + fx.X.id + '"]');
	const r1 = await page.$eval(rowSel(P2) + ' .cei-round[data-step="1"]', (el) => ({
		unlisted: el.querySelectorAll('[data-unlisted]').length,
		chips: Array.from(el.querySelectorAll('.cei-chip')).map((c) => c.firstChild.textContent),
		lv: (el.querySelector('.cei-lv-input') || {}).value,
	}));
	assert(r1.unlisted === 0 && r1.chips.join() === fx.X.name && r1.lv === '2',
		'下書き(3): 選ぶと、同じ場所に同じレベル（Lv2）で入る', r1);
	await page.fill(rowSel(P2) + ' .cei-round[data-step="2"] .cei-lv-input', '3');
	await page.dispatchEvent(rowSel(P2) + ' .cei-round[data-step="2"] .cei-lv-input', 'change');
	const p2b = await page.$eval(rowSel(P2), (el) => ({ disabled: el.querySelector('[data-act="check"]').disabled,
		edited: Array.from(el.querySelectorAll('.cei-imported .cei-note')).some((p) => p.textContent.includes('直したところ')) }));
	assert(!p2b.disabled && p2b.edited && await stateOf(P2) === 'imported' && await page.inputValue('#cei-out') === before.outA,
		'下書き(4): 直すと押せるようになるが、直しただけでは「下書き（未確認）」のままで出力も変わらない', p2b);

	/* --- 5 見比べた（P1）→ 出力 A に入る --- */
	await openCard(P1);
	await page.click(rowSel(P1) + ' [data-act="check"]');
	const n = fx.nameOf;
	const r = (i, lv) => ({ skillId: S[i], name: n(S[i]), hintLevel: lv || 1 });
	const wantP1 = { cardId: P1, status: 'done', chain: [
		{ step: 1, choices: [{ skills: [r(0)] }] },
		{ step: 2, choices: [{ skills: [r(1)] }, { skills: [] }] },
		{ step: 3, choices: [{ results: [[r(2, 3)], [r(2, 2)]] }] },
		{ step: 4, choices: [{ results: [[r(3)], []] }, { skills: [r(4)] }] }] };
	assert(await stateOf(P1) === 'done' && JSON.stringify(await rowA(P1)) === JSON.stringify(wantP1),
		'下書き(5): 「見比べた」のあとだけ「入力あり」になり、出力 A に下書きの形のまま入る（4つの形・名前は引き直し）', await rowA(P1));

	/* --- 6 ファイルにあるカード（P4）: 見比べるまでファイルの行が残る --- */
	await openCard(P4);
	const p4note = await page.$eval(rowSel(P4), (el) => Array.from(el.querySelectorAll('.cei-imported .cei-note')).map((p) => p.textContent).join('|'));
	assert(JSON.stringify(await rowA(P4)) === JSON.stringify(fx.file.entries[0]) && p4note.includes('ファイルに入っている内容'),
		'下書き(6): ファイルにあるカードは下書きで上書きされるが、見比べるまで出力 A にはファイルの行が残る', { row: await rowA(P4), p4note });

	/* --- 10 読み直し：手を入れた P2 は残し、手を入れていない P3 は置き換える。見比べた P1・手の入力の P6 は触らない --- */
	await page.setInputFiles('#cei-import-file', fileOf(2));
	await page.waitForTimeout(400);
	const sum = (id) => page.$eval(rowSel(id) + ' .cei-summary', (el) => el.textContent);
	const re = { p2: await sum(P2), p3: await sum(P3), p1: await stateOf(P1), p6: await stateOf(P6), text: await page.textContent('#cei-import-result') };
	assert(!re.p2.includes(n(S[9])) && re.p2.includes(fx.X.name) && re.p3.includes(n(S[8])) && !re.p3.includes(n(S[6]))
		&& re.p1 === 'done' && re.p6 === 'done' && re.text.includes('置き換えていません'),
		'下書き(10): 読み直すと、手を入れた下書きは残り、手を入れていない下書きは新しい中身になる（見比べたもの・手の入力はそのまま）', re);

	/* --- 7 目で確定するもの（P3） --- */
	await openCard(P3);
	const eye = await page.$eval(rowSel(P3), (el) => ({ badge: (el.querySelector('.cei-eye') || {}).textContent || '', note: (el.querySelector('.cei-eye-note') || {}).textContent || '' }));
	assert(eye.badge === '目で確定' && eye.note.includes('検査用の目で確定の文') && !eye.note.includes('(3)'),
		'下書き(7): 目で確定するものに印が付き、文から番号を外して出す', eye);
	dismissNext = true;
	await page.click(rowSel(P3) + ' [data-act="check"]');
	const askedEye = dialogs[dialogs.length - 1] || '';
	assert(askedEye.includes('目で確定するものです') && askedEye.includes('ゲーム画面の形と同じですか') && await stateOf(P3) === 'imported',
		'下書き(7): 見比べるときに念を押し、「いいえ」なら下書き（未確認）のまま', askedEye);
	await page.click(rowSel(P3) + ' [data-act="check"]');
	assert(await stateOf(P3) === 'done', '下書き(7): 「はい」で入力ありになる');

	/* --- 6 の続き：P4 を見比べると、出力 A の行が下書きの中身に入れ替わる --- */
	await openCard(P4);
	await page.click(rowSel(P4) + ' [data-act="check"]');
	assert(JSON.stringify(((await rowA(P4)) || {}).chain) === JSON.stringify([{ step: 1, choices: [{ skills: [r(8)] }] }]),
		'下書き(6): 見比べると、ファイルの行が下書きの中身に入れ替わる', await rowA(P4));

	/* --- 共通イベント・9 空の下書き --- */
	await page.click('[data-act="tab"][data-tab="chara"]');
	await page.fill('#cei-q', '');
	const cs = { C1: await charaState(C1), C2: await charaState(C2), C3: await charaState(C3), CU: await charaState(CU) };
	assert(cs.C1 === 'imported' && cs.C3 === 'imported' && cs.C2 === 'pending' && cs.CU === null,
		'下書き(9): 共通イベントも「下書き（未確認）」。空の下書きは未入力のまま（イベント無しにしない）。公開データにいない人は出ない', cs);
	const charaNotes = async (name) => {
		await page.evaluate((nm) => { const b = Array.from(document.querySelectorAll('[data-act="open"][data-kind="chara"]')).find((x) => x.getAttribute('data-card') === nm); b.click(); }, name);
		return page.evaluate((nm) => { const r = Array.from(document.querySelectorAll('.cei-row[data-chara]')).find((x) => x.getAttribute('data-chara') === nm);
			return Array.from(r.querySelectorAll('.cei-imported .cei-note')).map((p) => p.textContent).join('|') + '|' + r.querySelector('.cei-summary:not(.cei-summary--cards)').textContent; }, name);
	};
	const c1 = await charaNotes(C1);
	assert(c1.includes('の欄にも') && c1.includes('自身の欄') && c1.includes(n(S[0])) && !c1.includes(n(S[1])),
		'下書き(共通): 同じ人の行が2つあるときは自身の行を使い、グループのカードの欄にもあったことを1行出す', c1);
	const c3 = await charaNotes(C3);
	assert(c3.includes('の欄から取った') && c3.includes(n(S[2])), '下書き(共通): グループのカードの欄の行だけのときは、それを使ったことを出す', c3);
	assert(await page.inputValue('#cei-out-b') === before.outB, '下書き(共通): 見比べるまで出力 B は変わらない');
	await page.click('[data-act="tab"][data-tab="card"]');

	/* --- 8 公開データに入ったあとの起動で当てはめる。後片付けで下書きが消えない --- */
	withU = true;
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => /全\d+枚/.test(document.getElementById('cei-counts').textContent));
	const afterReload = { U: await stateOf(U), P2: await stateOf(P2), P1: await stateOf(P1), P7: await stateOf(P7), rowP7: await rowA(P7) };
	assert(afterReload.U === 'imported' && afterReload.P2 === 'imported' && afterReload.P1 === 'done',
		'下書き(8): 公開データに入ったカードは、次の起動で「下書き（未確認）」になる。開き直しても下書き・入力は消えない', afterReload);
	assert(afterReload.P7 === 'imported' && JSON.stringify(afterReload.rowP7) === JSON.stringify(fx.file.entries[1]),
		'下書き(8): ファイルの行と同じ中身の下書きも、開き直したときの後片付けで消えない（出力 A にはファイルの行が残る）', afterReload);

	/* --- 12 375px ではみ出さない --- */
	{
		const ctx3 = await browser.newContext({ viewport: { width: 375, height: 800 } });
		await setup(ctx3);
		const page3 = await ctx3.newPage();
		page3.setDefaultTimeout(5000);
		await page3.goto(base + '/card-event-input.html', { waitUntil: 'networkidle' });
		await page3.waitForFunction(() => /全\d+枚/.test(document.getElementById('cei-counts').textContent));
		await page3.setInputFiles('#cei-import-file', fileOf(1));
		await page3.waitForFunction(() => !document.getElementById('cei-import-result').hidden);
		await page3.click(rowSel(P2) + ' [data-act="open"]');
		const w = await page3.evaluate(() => document.documentElement.scrollWidth);
		assert(w <= 375, '下書き(12・見た目): 375px で、読み込みの欄と一覧に無い名前のチップが横にはみ出さない', w);
		await ctx3.close();
	}

	/* --- 「下書きを消す」 --- */
	await page.click('#cei-import-clear');
	const cleared = { dialog: dialogs[dialogs.length - 1] || '', U: await stateOf(U), P2: await stateOf(P2), P1: await stateOf(P1), P6: await stateOf(P6),
		store: await page.evaluate(() => localStorage.getItem('umaCardEventInput:importDraft')) };
	assert(cleared.dialog.includes('まだ見比べていない下書き') && cleared.U === 'pending' && cleared.P2 === 'pending' && cleared.P1 === 'done' && cleared.P6 === 'done' && cleared.store === null,
		'下書き: 「下書きを消す」で見比べていない下書き（手を入れたものも）と控えが消え、見比べたもの・手の入力は残る', cleared);

	assert(errors.length === 0, '下書き: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});

/* ============================================================
 * グループのサポートカードの名前（2026-09-30）
 *
 * グループのカードの正式な名称はキャラクター名ではなくグループのサポートカード名（data の groupName）。
 * 見ること：
 *   - core：groupName のあるグループのカードは「[二つ名]groupName」と「groupName」。グループでないカードは今までどおり
 *     「[二つ名]charaName」と「charaName」。groupName の無いグループのカード・グループでないのに groupName を持つ行は今までどおり
 *   - charaName（代表者）の使い方は変わらない（共通イベントが当てはまるのは今までどおり groupMembers の全員）
 *   - special の編成パネル：カードを選ぶ画面の候補・選んだ枠・表の列の見出し・凡例
 *   - 入力のページの一覧の見出し
 * カード名・グループ名は書かない（データから拾う）。
 * ============================================================ */
await block('グループのサポートカードの名前（2026-09-30）', async () => {
{
	const cardsDoc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8'));
	const groups = cardsDoc.entries.filter((c) => c.isGroup === true && typeof c.groupName === 'string' && c.groupName);
	const G = groups[0];
	const N = cardsDoc.entries.find((c) => c.isGroup === false && c.rarity === 'SSR');
	assert(groups.length > 0 && G && N, '名前(0): groupName のあるグループのカードと、グループでない SSR のカードがデータにある', { groups: groups.length });

	/* --- core --- */
	{
		const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
		const res = await page.evaluate(async () => {
			const Core = window.UmaSkillDeckCore;
			await Core.loadTrainingSources(false);
			const cards = Core.getTrainingSources().supportCard.entries;
			const bad = [];
			// 短い名前（formatEntryShortLabel）は公開していないので、下の編成パネルの画面で見る
			cards.forEach((c) => {
				const name = c.isGroup === true && c.groupName ? c.groupName : c.charaName;
				const wantLabel = '[' + c.title + ']' + name;
				if (Core.formatEntryLabel(c) !== wantLabel) bad.push({ id: c.id, label: Core.formatEntryLabel(c), want: wantLabel });
			});
			const g = cards.find((c) => c.isGroup === true && c.groupName);
			const noName = Object.assign({}, g); delete noName.groupName;
			const fakeSolo = Object.assign({}, cards.find((c) => c.isGroup === false), { groupName: '（検査用）グループ名' });
			return {
				bad, groups: cards.filter((c) => c.isGroup === true && c.groupName).length,
				noName: [Core.formatEntryLabel(noName), '[' + g.title + ']' + g.charaName],
				fakeSolo: [Core.formatEntryLabel(fakeSolo), '[' + fakeSolo.title + ']' + fakeSolo.charaName],
				members: [Core.charactersOfCard(g).join(), g.groupMembers.join()],
			};
		});
		assert(res.bad.length === 0 && res.groups === groups.length,
			'名前(1): グループのカードは「[二つ名]groupName」、グループでないカードは今までどおり「[二つ名]charaName」（全' + cardsDoc.entries.length + '枚）', res.bad.slice(0, 3));
		assert(res.noName[0] === res.noName[1],
			'名前(2): groupName の無いグループのカードは、今までどおり代表者の名前で出る', res.noName);
		assert(res.fakeSolo[0] === res.fakeSolo[1],
			'名前(2): グループでないカードは、groupName を持っていても使わない', res.fakeSolo);
		assert(res.members[0] === res.members[1], '名前(3): 共通イベントが当てはまるキャラクターは今までどおり groupMembers の全員', res.members);
		assert(errors.length === 0, '名前: コンソールエラーなし（core）', errors.slice(0, 3));
		await ctx.close();
	}

	/* --- special の編成パネル ---
	   2枚目のグループのカード（G2）だけ groupName を外した写しを取得の途中で渡し、名前の無いグループのカードが
	   今までどおり代表者の名前で出ることも画面で見る */
	const G2 = groups[1];
	{
		const { ctx, page, errors } = await openPage(browser, base, 'special.html');
		const altered = JSON.parse(JSON.stringify(cardsDoc));
		delete altered.entries.find((c) => c.id === G2.id).groupName;
		await page.route('**/data/support-cards.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(altered) }));
		await page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice')) { await page.click('[data-act="notice-ok"]'); await page.waitForTimeout(300); }
		await page.evaluate(() => selectStepTab(0));
		await page.waitForTimeout(400);
		const take = async (slot, c) => {
			await page.click('#deck-roster-panel [data-usd-act="pick-card"][data-index="' + slot + '"]');
			await page.waitForTimeout(300);
			await page.fill('[data-usd-el="roster-modal-host"] [data-usd-el="find"]', c.title);
			await page.waitForTimeout(300);
			const btn = '[data-usd-el="roster-modal-host"] [data-usd-act="take"][data-entry-id="' + c.id + '"]';
			const text = (await page.textContent(btn)).trim();
			await page.click(btn);
			await page.waitForTimeout(500);
			return text;
		};
		const hitG = await take(0, G);
		const hitN = await take(1, N);
		const hitG2 = await take(2, G2);
		const look = await page.evaluate(() => {
			const panel = document.getElementById('deck-roster-panel');
			const slot = (i) => panel.querySelector('[data-usd-act="pick-card"][data-index="' + i + '"]').textContent.trim();
			return { slot0: slot(0), slot1: slot(1), slot2: slot(2),
				heads: Array.from(panel.querySelectorAll('.usd-roster-gh-name')).map((e) => e.textContent), text: panel.textContent,
				titles: Array.from(panel.querySelectorAll('[data-usd-act="pick-card"]')).map((b) => b.title) };
		});
		assert(hitG2 === '[' + G2.title + ']' + G2.charaName && look.slot2.includes(G2.charaName) && look.heads.includes(G2.charaName),
			'名前(2): groupName の無いグループのカードは、候補・選んだ枠・列の見出しとも今までどおり代表者の名前', { hitG2, slot2: look.slot2 });
		assert(hitG === '[' + G.title + ']' + G.groupName && hitN === '[' + N.title + ']' + N.charaName,
			'名前(4): カードを選ぶ画面の候補は、グループのカードが「[二つ名]groupName」、ほかは今までどおり', { hitG, hitN });
		assert(look.slot0.includes(G.groupName) && !look.slot0.includes(G.charaName) && look.slot1.includes(N.charaName),
			'名前(5): 選んだ枠は、グループのカードが groupName（代表者の名前は出ない）', { slot0: look.slot0, slot1: look.slot1 });
		assert(look.heads.includes(G.groupName) && look.heads.includes(N.charaName) && !look.heads.includes(G.charaName),
			'名前(6): 表の列の見出しは、グループのカードが groupName', look.heads);
		// 段7c(L): 表の最下段の凡例は削除した。正式な名称（[二つ名]groupName）は、選んだ枠の title（全文）に出る
		assert(look.titles.includes('[' + G.title + ']' + G.groupName),
			'名前(7)→段7c: 選んだ枠の title（全文）に「[二つ名]groupName」で出る（凡例は削除した）', look.titles);
		assert(errors.length === 0, '名前: コンソールエラーなし（special）', errors.slice(0, 3));
		await ctx.close();
	}

	/* --- 入力のページの一覧 --- */
	{
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(5000);
		await page.goto(base + '/card-event-input.html', { waitUntil: 'networkidle' });
		await page.waitForFunction(() => /全\d+枚/.test(document.getElementById('cei-counts').textContent));
		await page.uncheck('#cei-only-pending');
		const labels = await page.evaluate((ids) => ids.map((id) => {
			const r = document.querySelector('.cei-row[data-card-id="' + id + '"] .cei-label');
			return r ? r.firstChild.textContent : null;
		}), groups.map((c) => c.id).concat([N.id]));
		const want = groups.map((c) => '[' + c.title + ']' + c.groupName).concat(['[' + N.title + ']' + N.charaName]);
		assert(labels.every((l, i) => l && l.trim() === want[i]), '名前(8): 入力のページの一覧で、グループのカードは「[二つ名]groupName」（ほかは今までどおり）', { labels, want });
		await ctx.close();
	}
}
});
/* ============================================================
 * 段3b ―― 「本育成スキルを除外する」を押している間の、追加の一覧（2026-09-30）
 *
 * 除外中（＝編成で得られる●のスキル）は、一覧から**消さずにグレーアウトで残し、チェックできず、理由を添える**。
 * 除外を解除すると、グレーアウトはすべて消えて通常の行に戻る。
 * 見ること：
 *   ① 「条件で検索」: 除外中の行が残る（並びは元のまま）・チェックできない・理由が出る
 *   ② 「N件」に除外中を含めず、「除外中 M件」が別に出る（M が0のときは出さない）
 *   ③ 「表示中を全て選択」が除外中の行を選ばず、追加しても除外中は足されない
 *   ④ 除外を解除するとグレーアウトが消える
 *   ⑤ 「名前を入れて探す」の候補の文言が、②の理由と揃っている
 *   ⑥ 375px でも理由と「除外中 M件」がはみ出さない
 *   ⑦ 「緑スキルを追加」の一覧にも同じ扱い（追加済みのものは普通の行のまま）
 *   ⑧ 実際の編成パネルで「本育成スキルを除外する」を押した経路（隠す対象は●だけ）でも同じ
 *   ⑨ 追加できる行が0件でも、除外中の行は残り「追加できるスキルがありません。」が出る
 * **スキル名・件数は書かない**（一覧に出ている id から位置で拾う。恒久ルール1）。
 * ============================================================ */
await block('段3b ― 除外中の追加の一覧（グレーアウトで残す・追加できない・理由。2026-09-30）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	await page.waitForTimeout(600);
	await page.evaluate(() => {
		window.__smokeAdded = [];
		window.__smokeSink = { scope: 'smoke-3b', add: (ids) => { window.__smokeAdded.push(...ids); return ids.slice(); }, remove: () => true, probe: () => String(window.__smokeAdded.length) };
	});
	const openFilter = async (existing) => {
		await page.evaluate((ex) => { UmaSkillDeckCore.closeSkillPicker(); UmaSkillDeckCore.openSkillPicker(ex || [], window.__smokeSink); }, existing || []);
		await page.waitForTimeout(350);
	};
	const listState = () => page.evaluate(() => {
		const box = document.querySelector('[data-usd-el="results"]');
		const active = [...box.querySelectorAll('[data-usd-el="skill-check"]')];
		const grey = [...box.querySelectorAll('[data-usd-excluded="1"]')];
		const ex = document.querySelector('[data-usd-el="result-excluded"]');
		const sa = document.querySelector('[data-usd-act="picker-select-all"]');
		const order = [...box.querySelectorAll('.usd-row input')].map((e) => e.value);
		const br = box.getBoundingClientRect();
		return {
			activeIds: active.map((e) => e.value),
			activeChecked: active.filter((e) => e.checked).length,
			greyIds: grey.map((r) => r.querySelector('input').value),
			greyDisabled: grey.every((r) => r.querySelector('input').disabled),
			greyChecked: grey.some((r) => r.querySelector('input').checked),
			reasons: grey.map((r) => (r.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || ''),
			count: document.querySelector('[data-usd-el="result-count"]').textContent,
			excludedLabel: ex ? (ex.hidden ? null : ex.textContent) : undefined,
			selectAll: sa.checked,
			order,
			lead: !!box.querySelector('[data-usd-el="results-none-addable"]'),
			checkedCount: document.querySelector('[data-usd-el="picker-checked-count"]').textContent,
			boxOverflow: box.scrollWidth - box.clientWidth,
			reasonsOutside: grey.filter((r) => { const q = r.querySelector('[data-usd-el="excluded-reason"]').getBoundingClientRect(); return q.right > br.right + 1 || q.left < br.left - 1; }).length,
			labelInView: ex && !ex.hidden ? (() => { const q = ex.getBoundingClientRect(); return q.left >= 0 && q.right <= window.innerWidth + 1; })() : null,
		};
	});

	/* --- 基準：除外なし。グレーアウトも「除外中」も出ない --- */
	await page.evaluate(() => UmaSkillDeckCore.setPickerHiddenIds([]));
	await openFilter();
	const base0 = await listState();
	assert(base0.activeIds.length > 20 && base0.greyIds.length === 0 && base0.excludedLabel === null && base0.count === base0.activeIds.length + '件',
		'段3b(基準): 除外なしのときはグレーアウトも「除外中」も出ない', { active: base0.activeIds.length, grey: base0.greyIds.length, label: base0.excludedLabel, count: base0.count });

	/* --- ① 除外中の行が残る（並びは元のまま）・チェックできない・理由が出る --- */
	const hide = [base0.activeIds[0], base0.activeIds[2], base0.activeIds[5]];
	await page.evaluate((ids) => UmaSkillDeckCore.setPickerHiddenIds(ids), hide);
	await openFilter();
	const s1 = await listState();
	assert(s1.greyIds.length === 3 && hide.every((id) => s1.greyIds.includes(id)),
		'段3b①: 除外中の3件が一覧に残っている（消えていない）', { grey: s1.greyIds, hide });
	assert(s1.order.join() === base0.order.join(),
		'段3b①: 並びは元のまま（除外中の行を末尾へ動かさない）', { before: base0.order.slice(0, 8), after: s1.order.slice(0, 8) });
	assert(s1.greyDisabled && !s1.greyChecked,
		'段3b①: 除外中の行のチェックは無効で、チェックが入っていない', { disabled: s1.greyDisabled, checked: s1.greyChecked });
	assert(s1.reasons.length === 3 && s1.reasons.every((t) => t.trim().length > 0) && new Set(s1.reasons).size === 1,
		'段3b①: 除外中の行には理由の文言が添えられている（3行とも同じ文言）', s1.reasons);
	// 実際に押しても足されない（無効なチェックのラベルを押す）
	await page.click('[data-usd-excluded="1"] >> nth=0', { force: true });
	await page.waitForTimeout(150);
	const afterClick = await listState();
	assert(afterClick.checkedCount === '0種選択' && afterClick.greyChecked === false,
		'段3b①: 除外中の行を押しても選択に入らない', { checkedCount: afterClick.checkedCount });

	/* 見た目（commit 2）: グレーアウトは**色**で表す（opacity は使わない。恒久ルール9）。理由は名前より濃い補助色 */
	assert(s1.reasons[0] === '本育成で得るため選べません', '段3b①: 理由の文言は「本育成で得るため選べません」（段7で「除外」の語をやめた）', s1.reasons[0]);
	const look = await page.evaluate(() => {
		const grey = document.querySelector('[data-usd-el="results"] [data-usd-excluded="1"]');
		const normal = document.querySelector('[data-usd-el="results"] label.usd-row:not([data-usd-excluded])');
		const cs = (e) => getComputedStyle(e);
		const reason = grey.querySelector('[data-usd-el="excluded-reason"]');
		return { greyColor: cs(grey).color, normalColor: cs(normal).color, greyOpacity: cs(grey).opacity, inputOpacity: cs(grey.querySelector('input')).opacity, reasonOpacity: cs(reason).opacity,
			reasonColor: cs(reason).color, cursor: cs(grey).cursor, normalCursor: cs(normal).cursor };
	});
	assert(look.greyColor !== look.normalColor && look.reasonColor !== look.greyColor && look.greyColor !== look.reasonColor,
		'段3b見た目: 除外中の行は名前の色が通常と違い（グレーアウト）、理由は名前とも違う色', look);
	assert(look.greyOpacity === '1' && look.inputOpacity === '1' && look.reasonOpacity === '1',
		'段3b見た目: グレーアウトは opacity を使わない（色だけで表す。sticky を使う表と同じ規則）', look);
	assert(look.cursor === 'default' && look.normalCursor === 'pointer', '段3b見た目: 除外中の行はカーソルが押せる形にならない', look);

	/* --- ② 「N件」に除外中を含めず、「除外中 M件」が別に出る --- */
	assert(s1.count === (base0.activeIds.length - 3) + '件' && s1.activeIds.length === base0.activeIds.length - 3,
		'段3b②: 「N件」は除外中の行を含めない', { count: s1.count, active: s1.activeIds.length, base: base0.activeIds.length });
	assert(s1.excludedLabel === '本育成編成のため選べない 3件', '段3b②: 「本育成編成のため選べない 3件」が別に出る（段7の文言）', s1.excludedLabel);

	/* --- ③ 「表示中を全て選択」が除外中の行を選ばない。追加しても除外中は足されない --- */
	await page.click('[data-usd-act="picker-select-all"]');
	await page.waitForTimeout(250);
	const s3 = await listState();
	assert(s3.activeChecked === s3.activeIds.length && !s3.greyChecked && s3.checkedCount === s3.activeIds.length + '種選択',
		'段3b③: 「表示中を全て選択」は追加できる行だけを選ぶ（除外中は選ばない）', { checked: s3.activeChecked, active: s3.activeIds.length, label: s3.checkedCount });
	await page.click('[data-usd-el="picker-commit"]');
	await page.waitForTimeout(250);
	const added = await page.evaluate(() => window.__smokeAdded.slice());
	assert(added.length === base0.activeIds.length - 3 && hide.every((id) => !added.includes(id)),
		'段3b③: 追加を押しても除外中のスキルは足されない', { added: added.length, hidden添えられた: hide.filter((id) => added.includes(id)) });

	/* --- ④ 除外を解除するとグレーアウトがすべて消える --- */
	await page.evaluate(() => { window.__smokeAdded = []; UmaSkillDeckCore.setPickerHiddenIds([]); });
	await openFilter();
	const s4 = await listState();
	assert(s4.greyIds.length === 0 && s4.excludedLabel === null && s4.activeIds.length === base0.activeIds.length && s4.count === base0.count,
		'段3b④: 除外を解除するとグレーアウトも「除外中」も消えて、元の一覧に戻る', { grey: s4.greyIds.length, label: s4.excludedLabel, count: s4.count });

	/* --- ⑤ 「名前を入れて探す」の候補の文言が、②の理由と揃っている --- */
	await page.evaluate((ids) => UmaSkillDeckCore.setPickerHiddenIds(ids), hide);
	const finderReason = await page.evaluate(async (id) => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		const name = UmaSkillDeckCore.findSkill(id).name;
		UmaSkillDeckCore.closeSkillPicker();
		UmaSkillDeckCore.openSkillRowsPicker([], window.__smokeSink, [{ raw: '謎の読み', norm: '謎の読み', kind: 'none', matchedId: null, matchedName: null, distance: 3, candidates: [], reason: '' }], { white: 0, gold: 0 }, {});
		await wait(250);
		const btn = document.querySelector('[data-usd-el="paste-report"] [data-usd-act="paste-find"]');
		if (!btn) return { error: 'paste-find が無い' };
		btn.click();
		const input = el('find-input');
		input.value = name;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await wait(300);
		const hit = [...document.querySelectorAll('.usd-name-hit--added')].find((h) => h.textContent.startsWith(name));
		const out = { reason: hit ? (hit.querySelector('.usd-name-added') || {}).textContent : null };
		UmaSkillDeckCore.closeSkillPicker();
		return out;
	}, hide[0]);
	assert(finderReason.reason && finderReason.reason === s1.reasons[0],
		'段3b⑤: 「名前を入れて探す」の候補の文言が、一覧の理由と同じ', { 名前で探す: finderReason.reason, 一覧: s1.reasons[0] });

	/* --- ⑨ 追加できる行が0件でも、除外中の行は残り、「追加できるスキルがありません。」が出る --- */
	await page.evaluate((ids) => UmaSkillDeckCore.setPickerHiddenIds(ids), base0.activeIds);
	await openFilter();
	const s9 = await listState();
	assert(s9.activeIds.length === 0 && s9.greyIds.length === base0.activeIds.length && s9.count === '0件' && s9.lead
		&& s9.excludedLabel === '本育成編成のため選べない ' + base0.activeIds.length + '件',
		'段3b⑨: 全部が除外中でも行は残り、「0件」と「追加できるスキルがありません。」が出る', { active: s9.activeIds.length, grey: s9.greyIds.length, count: s9.count, lead: s9.lead, label: s9.excludedLabel });
	await page.click('[data-usd-act="picker-select-all"]');
	await page.waitForTimeout(200);
	assert((await listState()).checkedCount === '0種選択', '段3b⑨: 追加できる行が無いときの「表示中を全て選択」は何も選ばない');

	/* --- ⑥ 375px でも、理由と「除外中 M件」がはみ出さない --- */
	await page.evaluate((ids) => UmaSkillDeckCore.setPickerHiddenIds(ids), hide);
	await page.setViewportSize({ width: 375, height: 800 });
	await page.waitForTimeout(400);
	await openFilter();
	const s6 = await listState();
	assert(s6.greyIds.length === 3 && s6.boxOverflow <= 1 && s6.reasonsOutside === 0 && s6.labelInView === true,
		'段3b⑥: 375px で、理由と「除外中 M件」が一覧の箱と画面からはみ出さない', { grey: s6.greyIds.length, overflow: s6.boxOverflow, reasonsOutside: s6.reasonsOutside, labelInView: s6.labelInView });
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.waitForTimeout(300);

	/* --- ⑦ 「緑スキルを追加」の一覧。追加済みのものは普通の行のまま --- */
	const passive = await page.evaluate(() => UmaSkillDeckCore.getPoolExcludedSkills().map((s) => s.id));
	assert(passive.length >= 6, '段3b⑦(基準): 緑スキルの一覧の母集団がある', passive.length);
	const ph = [passive[0], passive[1], passive[3]];
	const passiveState = () => page.evaluate(() => {
		const box = document.querySelector('[data-usd-el="passive-results"]');
		const grey = [...box.querySelectorAll('[data-usd-excluded="1"]')];
		const ex = document.querySelector('[data-usd-el="passive-excluded"]');
		const br = box.getBoundingClientRect();
		return {
			total: box.querySelectorAll('.usd-row').length,
			normal: box.querySelectorAll('[data-usd-el="passive-check"]').length,
			greyIds: grey.map((r) => r.querySelector('input').value),
			greyDisabled: grey.every((r) => r.querySelector('input').disabled),
			reasons: grey.map((r) => (r.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || ''),
			label: ex ? (ex.hidden ? null : ex.textContent) : undefined,
			checkedNormal: [...box.querySelectorAll('[data-usd-el="passive-check"]')].filter((e) => e.checked).map((e) => e.value),
			boxOverflow: box.scrollWidth - box.clientWidth,
			reasonsOutside: grey.filter((r) => { const q = r.querySelector('[data-usd-el="excluded-reason"]').getBoundingClientRect(); return q.right > br.right + 1; }).length,
		};
	});
	const openPassive = async (existing) => {
		await page.evaluate((ex) => { UmaSkillDeckCore.closeSkillPicker(); UmaSkillDeckCore.openPassiveSkillPicker(ex || [], window.__smokeSink); }, existing || []);
		await page.waitForTimeout(350);
	};
	await page.evaluate(() => UmaSkillDeckCore.setPickerHiddenIds([]));
	await openPassive();
	const p0 = await passiveState();
	assert(p0.total === passive.length && p0.greyIds.length === 0 && p0.label === null,
		'段3b⑦: 除外なしのときは、緑スキルの一覧にグレーアウトも「除外中」も出ない', { total: p0.total, grey: p0.greyIds.length, label: p0.label });
	await page.evaluate((ids) => UmaSkillDeckCore.setPickerHiddenIds(ids), ph);
	await openPassive();
	const p1 = await passiveState();
	assert(p1.total === passive.length && p1.greyIds.length === 3 && ph.every((id) => p1.greyIds.includes(id)) && p1.greyDisabled
		&& p1.label === '本育成編成のため選べない 3件' && p1.reasons.every((t) => t === s1.reasons[0]),
		'段3b⑦: 緑スキルの一覧でも消えずにグレーアウト・チェック不可・同じ理由で、「本育成編成のため選べない 3件」が出る（段7の旧3: 行の数なので「件」）', p1);
	await page.click('[data-usd-el="passive-results"] [data-usd-excluded="1"] >> nth=0', { force: true });
	await page.waitForTimeout(200);
	assert((await page.evaluate(() => window.__smokeAdded.length)) === 0,
		'段3b⑦: 除外中の緑スキルを押しても追加されない');
	// 追加済み（チェックが入っている）ものは、除外中でも普通の行のまま（外せなくならない）
	await openPassive([ph[0]]);
	const p2 = await passiveState();
	assert(!p2.greyIds.includes(ph[0]) && p2.checkedNormal.includes(ph[0]) && p2.greyIds.length === 2 && p2.label === '本育成編成のため選べない 2件',
		'段3b⑦: 追加済みの緑スキルは、選べないものでも普通の行のまま（外せる）。選べない行は2件に減る', p2);
	await page.setViewportSize({ width: 375, height: 800 });
	await page.waitForTimeout(300);
	await openPassive();
	const p3 = await passiveState();
	assert(p3.greyIds.length === 3 && p3.boxOverflow <= 1 && p3.reasonsOutside === 0,
		'段3b⑦⑥: 375px でも、緑スキルの一覧の理由がはみ出さない', p3);
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.waitForTimeout(300);

	/* --- ⑧ は段7（2026-10-03）で廃止: 「本育成スキルを除外する」の経路そのものが無くなった。実際の経路（②の「本育成編成」）は段7の塊が見る --- */
	assert(errors.length === 0, '段3b: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});
/* ============================================================
 * スキルPt ―― 段1（純粋な計算・データの受け取り口）（2026-09-30）
 *
 * **画面を開かず、関数を直に呼ぶ**（DOM も保存も special も知らない関数なので）。スキル名は書かない
 * （仮のスキルは id だけ。恒久ルール1）。期待値は Step 0 第4版の 0-S の表と 2-1 の例（手で決めた値）。
 *   - 計算の表（基礎90＝○・基礎110＝◎の2段の系列。状態なし。切り捨て・1件ごと）。◎が○の L を援用する。金は独立
 *   - 浮動小数点の罠（基礎90・L=3 が 63。62 ではない）と、1件ごとに丸める理由（基礎130・150・L=4 → 181。合計後なら182）
 *   - 状態（勉強家4％・切れ者10％。排他）と、ヒントレベルの割引との加算（L=5＋切れ者＝50％）
 *   - ヒントレベル: P があれば5／E の別イベントは加算／同じイベントの重なりは最大／U は既定3・選べば5／T・F／上限5
 *   - pt:0 は合計に0を足す。Pt が未収録（行が無い）は合計に入れず、件数に出す
 *   - 受け取り口: 割引率の表を読む。skill-pt.json・skill-step-up.json は載っていなければ取りに行かない（404 を出さない）
 *   - 割引率の表が読めない・使えない形のときは、計算せず ok:false（既定値で黙って続けない）
 * ============================================================ */
await block('スキルPt ―― 段1: 純粋な計算とデータの受け取り口（2026-09-30）', async () => {
{
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	const requested = [];
	const failedRes = [];
	page.on('request', (r) => { if (/\/data\/skill-/.test(r.url())) requested.push(r.url().replace(/^.*\/data\//, '')); });
	page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/data/')) failedRes.push(r.status() + ' ' + r.url().replace(/^.*\/uma-skill-checker\//, '')); });
	await page.waitForTimeout(500);
	const meta = await page.evaluate(async () => {
		const m = await UmaSkillDeckCore.loadSkillPtData(true);
		const d = UmaSkillDeckCore.getSkillPtData();
		return { meta: m, hasRules: !!d.rules, valid: UmaSkillDeckCore.isValidSkillPtRules(d.rules), skillPtSize: d.skillPt ? d.skillPt.size : null, stepUp: d.stepUp, stepUpFns: !!(d.stepUp && typeof d.stepUp.rootOf === 'function' && typeof d.stepUp.prevOf === 'function'), rules: d.rules };
	});
	assert(meta.meta.loaded && meta.meta.rules === 'ok' && meta.hasRules && meta.valid,
		'Pt(受け取り口1): 割引率の表を読めて、使える形', meta.meta);
	// 【2026-09-30】skill-pt.json が届いて DATA_JSON_VERSIONS に載ったので、読まれる。【2026-10-02】skill-step-up.json も届いて載ったので、読まれる。
	// この2つの検査は、届いた順に合わせて期待を替えた（目的は同じ：載っているものは読み、404 などの失敗は出さない）
	assert(meta.meta.skillPt === 'ok' && meta.skillPtSize > 1000 && meta.meta.stepUp === 'ok' && meta.stepUpFns,
		'Pt(受け取り口2): 載っている skill-pt.json・skill-step-up.json は読まれ、前段の索引（rootOf・prevOf）ができる', { meta: meta.meta, rows: meta.skillPtSize });
	assert(requested.length === 3 && requested.some((u) => u.startsWith('skill-pt-rules.json')) && requested.some((u) => u.startsWith('skill-pt.json'))
		&& requested.some((u) => u.startsWith('skill-step-up.json')) && failedRes.length === 0,
		'Pt(受け取り口3): 取りに行くのは載っているもの（割引率の表・skill-pt.json・skill-step-up.json）だけで、404 などの失敗は出ない', { requested, failedRes });
	assert(meta.rules.hintDiscountPercent.join() === '10,20,30,35,40' && meta.rules.hintLevelMax === 5 && meta.rules.rounding === 'floor'
		&& meta.rules.statuses.map((s) => s.id + ':' + s.percent).join() === 'none:0,benkyo:4,kire:10',
		'Pt(規則): 割引率は整数の百分率で 10・20・30・35・40。状態はなし0・勉強家4・切れ者10。丸めは切り捨て', meta.rules);

	const R = await page.evaluate(() => {
		const C = window.UmaSkillDeckCore;
		const rules = C.getSkillPtData().rules;
		const idx = (rows) => C.buildSkillPtIndex({ entries: rows.map(([skillId, pt, rarity]) => ({ skillId, pt, rarity })) });
		const skillPt = idx([['probe-o', 90, 'white'], ['probe-d', 110, 'white'], ['probe-g', 200, 'gold'], ['probe-a', 130, 'white'], ['probe-b', 150, 'white'], ['probe-u', 0, 'unique']]);
		const stepUp = C.buildStepUpIndex({ entries: [
			{ skillId: 'probe-d', prevSkillIds: ['probe-o'], hintRootSkillId: 'probe-o' },
			{ skillId: 'probe-g', prevSkillIds: ['probe-d'] }] });
		const src = (id, kind, lv, key, sure) => ({ skillId: id, kind: kind, sure: sure !== false, memberKey: 1, hintLevel: lv, eventKey: key || null, part: null });
		const ev = (id, lv, key, sure) => src(id, 'event', lv, key, sure);
		const run = (sources, extra) => C.computeRosterPt(Object.assign({ sources, rules, skillPt, stepUp }, extra || {}));
		const lvOf = (r, id) => (r.items.find((i) => i.skillId === id) || {}).hintLevel;
		const out = {};
		// (1) 計算の表：○と◎が同じ L。◎は○の L を援用する
		out.table = [0, 1, 2, 3, 4, 5].map((L) => {
			const r = run([ev('probe-o', L, 'e1'), ev('probe-d', L, 'e1')]);
			const it = (id) => r.items.find((i) => i.skillId === id);
			return { L, o: it('probe-o').pt, d: it('probe-d').pt, total: r.total };
		});
		// 援用：◎自身の由来にはレベルが無く（null）、○の由来だけがレベルを持つ。前段データがあれば◎も同じ L、無ければ◎は L=0
		const borrow = (withStep) => {
			const r = C.computeRosterPt({ sources: [ev('probe-o', 3, 'e1'), ev('probe-d', null, 'e2')], rules, skillPt, stepUp: withStep ? stepUp : null });
			return { d: lvOf(r, 'probe-d'), o: lvOf(r, 'probe-o'), dPt: r.items.find((i) => i.skillId === 'probe-d').pt };
		};
		out.borrowWith = borrow(true); out.borrowWithout = borrow(false);
		// 金は独立：○が L=5 でも、金は金自身の由来（Lv1）だけで決まる
		const g = run([ev('probe-o', 5, 'e1'), ev('probe-g', 1, 'g1')]);
		out.gold = { o: lvOf(g, 'probe-o'), g: lvOf(g, 'probe-g'), gPt: g.items.find((i) => i.skillId === 'probe-g').pt };
		// (2) 1件ごとに丸める
		const e = run([ev('probe-a', 4, 'x'), ev('probe-b', 4, 'y')]);
		out.each = { a: e.items[0].pt, b: e.items[1].pt, total: e.total, totalFirst: Math.floor((130 + 150) * 65 / 100) };
		// 浮動小数点の罠
		out.trap = { l3: C.computeSkillPt(90, 3, 'none', rules), naive: Math.floor(90 * (1 - 0.3)), l4a: C.computeSkillPt(90, 4, 'none', rules), l4b: C.computeSkillPt(110, 4, 'none', rules) };
		// (3) 状態（排他）と割引の加算
		out.status = {
			pct: { none: C.statusPercentOf('none', rules), benkyo: C.statusPercentOf('benkyo', rules), kire: C.statusPercentOf('kire', rules), both: C.statusPercentOf('kire+benkyo', rules), unset: C.statusPercentOf(undefined, rules) },
			benkyo0: C.computeSkillPt(100, 0, 'benkyo', rules), kire0: C.computeSkillPt(100, 0, 'kire', rules),
			kire5: C.computeSkillPt(180, 5, 'kire', rules), benkyo5: C.computeSkillPt(100, 5, 'benkyo', rules), none5: C.computeSkillPt(100, 5, 'none', rules),
			l4benkyo: [C.computeSkillPt(90, 4, 'benkyo', rules), C.computeSkillPt(110, 4, 'benkyo', rules)],
			unknown: C.computeSkillPt(100, 5, 'kire+benkyo', rules),
			maxSaving: Math.max.apply(null, rules.statuses.map((s) => 100 - C.computeSkillPt(100, 5, s.id, rules))),
		};
		// (4) ヒントレベル
		const L = (sources, extra) => lvOf(run(sources, extra), sources[0].skillId);
		out.levels = {
			practice: L([src('probe-a', 'hint', null, null), ev('probe-a', 1, 'e1')]),
			practiceOnly: L([src('probe-a', 'hint', null, null)]),
			addEvents: L([ev('probe-a', 1, 'e1'), ev('probe-a', 2, 'e2')]),
			sameEventMax: L([ev('probe-a', 3, 'e1'), ev('probe-a', 1, 'e1')]),
			capEvents: L([ev('probe-a', 3, 'e1'), ev('probe-a', 3, 'e2')]),
			uma: L([src('probe-a', 'uma', null, null)]),
			umaChoice5: L([src('probe-a', 'uma', null, null)], { umaHintLevel: 5 }),
			umaPlusEvent: L([src('probe-a', 'uma', null, null), ev('probe-a', 1, 'e1')]),
			umaCap: L([src('probe-a', 'uma', null, null), ev('probe-a', 3, 'e1')]),
			// T：有効にした△は、出てくるイベントのうち最大のレベルを1回ぶん。有効にしていなければ足さない・含まれない
			tOff: L([ev('probe-b', 1, 'ok', true), ev('probe-b', 2, 't1', false), ev('probe-b', 4, 't2', false)]),
			tOn: L([ev('probe-b', 1, 'ok', true), ev('probe-b', 2, 't1', false), ev('probe-b', 4, 't2', false)], { enabledSkillIds: ['probe-b'] }),
			tOnlyOff: run([ev('probe-b', 2, 't1', false)]).items.length,
			tOnlyOn: (() => { const r = run([ev('probe-b', 2, 't1', false)], { enabledSkillIds: ['probe-b'] }); return { n: r.items.length, lv: r.items[0].hintLevel, enabled: r.items[0].enabled }; })(),
			// F：親由来。既定5・4〜1。本育成の由来と足して上限5
			fCap: L([ev('probe-a', 1, 'e1')], { parentHintLevels: { 'probe-a': 4 } }),
			fSum: L([ev('probe-a', 1, 'e1')], { parentHintLevels: { 'probe-a': 2 } }),
			// レベルが無い（null）イベントの由来は0として足し、件数に出す
			unknownLevel: (() => { const r = run([ev('probe-a', null, 'e1')]); return { lv: r.items[0].hintLevel, n: r.unknownLevelCount }; })(),
		};
		// (5) pt:0 と Pt 未収録
		const z = run([ev('probe-a', 2, 'e1'), ev('probe-u', 1, 'u1'), ev('probe-nope', 1, 'n1')]);
		out.zero = { total: z.total, u: z.items.find((i) => i.skillId === 'probe-u').pt, unpriced: z.unpriced, unpricedCount: z.unpricedCount,
			nopePt: z.items.find((i) => i.skillId === 'probe-nope').pt, aPt: z.items.find((i) => i.skillId === 'probe-a').pt,
			subSum: Object.values(z.subtotals).reduce((s, v) => s + v, 0) };
		// 表が無い／使えない形
		out.noTable = (() => { const r = C.computeRosterPt({ sources: [ev('probe-a', 1, 'e1')], rules, skillPt: null, stepUp: null }); return { total: r.total, unpriced: r.unpricedCount, ok: r.ok }; })();
		out.noRules = C.computeRosterPt({ sources: [ev('probe-a', 1, 'e1')], rules: null, skillPt, stepUp });
		out.floatRules = C.isValidSkillPtRules(Object.assign({}, rules, { hintDiscountPercent: [10.5, 20, 30, 35, 40] }));
		out.sumParts = C.sumHintLevel({ practice: false, eventLevels: [1, 1], enabledLevel: 0, umaLevel: 3, parentLevel: 0 }, rules);
		out.choices = { normal: C.umaHintLevelChoices(5, rules), lv7: C.umaHintLevelChoices(7, rules) };
		return out;
	});
	// 計算の表（Step 0 の 0-S）
	const want = [[0, 90, 110, 200], [1, 81, 99, 180], [2, 72, 88, 160], [3, 63, 77, 140], [4, 58, 71, 129], [5, 54, 66, 120]];
	assert(JSON.stringify(R.table.map((t) => [t.L, t.o, t.d, t.total])) === JSON.stringify(want),
		'Pt(1): 基礎90（○）・基礎110（◎）の表：L=0 → 90・110・200／1 → 81・99・180／2 → 72・88・160／3 → 63・77・140／4 → 58・71・129／5 → 54・66・120', R.table);
	assert(R.borrowWith.d === 3 && R.borrowWith.o === 3 && R.borrowWith.dPt === 77 && R.borrowWithout.d === 0 && R.borrowWithout.o === 3,
		'Pt(1): ◎は前段データの根（○）の L を援用する（前段データが無ければ各スキルが自分自身を根とするので、◎は L=0）', { with: R.borrowWith, without: R.borrowWithout });
	assert(R.gold.o === 5 && R.gold.g === 1 && R.gold.gPt === 180,
		'Pt(1): 金は別の系列で、○が L=5 でも金自身の由来（Lv1）だけで L が決まる（基礎200 → 180）', R.gold);
	assert(R.trap.l3 === 63 && R.trap.naive === 62,
		'Pt(2): 基礎90・L=3 は 63（浮動小数点の `90 * (1 - 0.3)` を切り捨てると 62 になる。整数の百分率で計算している）', R.trap);
	assert(R.trap.l4a === 58 && R.trap.l4b === 71, 'Pt(2): ゲームの表示と同じ：右回り○ 基礎90・L=4 → 58／右回り◎ 基礎110・L=4 → 71', R.trap);
	assert(R.each.a === 84 && R.each.b === 97 && R.each.total === 181 && R.each.totalFirst === 182,
		'Pt(2): 1件ごとに丸めてから足す：基礎130・150・L=4 → 84・97・合計181（合計してから切り捨てると182）', R.each);
	assert(R.status.pct.none === 0 && R.status.pct.benkyo === 4 && R.status.pct.kire === 10 && R.status.pct.unset === 0 && R.status.pct.both === null,
		'Pt(3): 状態は勉強家4％・切れ者10％の排他（「両方」という状態は無い＝知らない状態は null）', R.status.pct);
	assert(R.status.benkyo0 === 96 && R.status.kire0 === 90 && R.status.kire5 === 90 && R.status.benkyo5 === 56 && R.status.none5 === 60,
		'Pt(3): 勉強家 L=0 で基礎100→96／切れ者 L=0 で→90／L=5＋切れ者＝50％で基礎180→90（半額）／L=5＋勉強家＝44％で→56', R.status);
	assert(R.status.maxSaving === 50 && R.status.unknown === 60,
		'Pt(3): 同時に付く組み合わせは無い（割引は最大でも 40＋10＝50％）。知らない状態は「なし」として計算する', R.status);
	assert(R.status.l4benkyo.join() === '54,67', 'Pt(3): L=4＋勉強家（39％）で基礎90・110 → 54・67（1件ごと）', R.status.l4benkyo);
	const lv = R.levels;
	assert(lv.practice === 5 && lv.practiceOnly === 5, 'Pt(4): 練習のヒントがあれば L=5（ほかの由来は関係ない）', { a: lv.practice, b: lv.practiceOnly });
	assert(lv.addEvents === 3 && lv.capEvents === 5, 'Pt(4): 別のイベントは加算する（1＋2＝3）。上限5で止まる（3＋3→5）', { add: lv.addEvents, cap: lv.capEvents });
	assert(lv.sameEventMax === 3, 'Pt(4): 同じイベントの中の重なりは最大の1つ（3と1 → 3。加算して4にしない）', lv.sameEventMax);
	assert(lv.uma === 3 && lv.umaChoice5 === 5 && lv.umaPlusEvent === 4 && lv.umaCap === 5,
		'Pt(4): 育成ウマ娘は既定3（Lv5 を選べば5）。ほかの由来と加算（3＋1＝4）・上限5（3＋3→5）', lv);
	assert(lv.tOff === 1 && lv.tOn === 5 && lv.tOnlyOff === 0 && lv.tOnlyOn.n === 1 && lv.tOnlyOn.lv === 2 && lv.tOnlyOn.enabled === true,
		'Pt(4): 有効にした△は、出てくるイベントのうち最大のレベルを1回ぶん足す（2と4 → 4。●の1と足して5）。有効にしていない△は含めない・足さない', lv);
	assert(lv.fCap === 5 && lv.fSum === 3, 'Pt(4): 親由来 F は本育成の由来と足して上限5（4＋1→5、2＋1＝3）', { cap: lv.fCap, sum: lv.fSum });
	assert(lv.unknownLevel.lv === 0 && lv.unknownLevel.n === 1, 'Pt(4): レベルを持たないイベントの由来は0として足し、件数に出す（黙って捨てない）', lv.unknownLevel);
	assert(R.sumParts === 5 && R.choices.normal.join() === '3' && R.choices.lv7.join() === '3,5',
		'Pt(4): レベルの合計は上限5。育成ウマ娘のレベルの選択肢は、覚醒 Lv7 まであるウマ娘だけ 3・5', { sum: R.sumParts, choices: R.choices });
	assert(R.zero.u === 0 && R.zero.aPt === 104 && R.zero.total === 104 && R.zero.unpricedCount === 1 && R.zero.unpriced.join() === 'probe-nope' && R.zero.nopePt === null && R.zero.subSum === R.zero.total,
		'Pt(5): pt:0 は合計に0を足す。Pt 未収録（行が無い）は合計に入れず、「未収録 N種」として数える（0として足さない）。小計の和は合計と一致', R.zero);
	assert(R.noTable.ok && R.noTable.total === 0 && R.noTable.unpriced === 1 && R.noRules.ok === false && R.floatRules === false,
		'Pt(受け取り口): skill-pt.json が無い間は全部「未収録」。割引率の表が使えない形（小数・欠け）なら計算せず ok:false', { noTable: R.noTable, noRules: R.noRules, float: R.floatRules });

	// 割引率の表が読めない／使えない形のとき（既定値で黙って続けない）
	for (const [label, handler, want2] of [
		['404', (route) => route.fulfill({ status: 404, body: 'not found' }), 'failed'],
		['小数の割引率', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ dataVersion: '2026-09-30a', category: 'skillPtRules', hintDiscountPercent: [0.1, 0.2, 0.3, 0.35, 0.4], hintLevelMax: 5, practiceHintLevel: 5, umaHintLevelDefault: 3, parentHintLevelDefault: 5, statuses: [{ id: 'none', label: 'なし', percent: 0 }], rounding: 'floor' }) }), 'invalid'],
	]) {
		const c2 = await browser.newContext();
		const p2 = await c2.newPage();
		await p2.route('**/data/skill-pt-rules.json*', handler);
		await p2.goto(base + '/uma-skill-deck.html', { waitUntil: 'networkidle' });
		const r2 = await p2.evaluate(async () => {
			const m = await UmaSkillDeckCore.loadSkillPtData(true);
			const d = UmaSkillDeckCore.getSkillPtData();
			return { meta: m, rules: d.rules, calc: UmaSkillDeckCore.computeRosterPt({ sources: [], rules: d.rules }) };
		});
		assert(r2.meta.rules === want2 && r2.rules === null && r2.calc.ok === false,
			'Pt(受け取り口): 割引率の表が「' + label + '」のとき、読めなかったことが分かり（meta）、計算しない', r2);
		await c2.close();
	}
	assert(errors.length === 0, 'Pt(段1): コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});

/* ============================================================
 * スキルPt ―― 段2: computeRosterSkills の sources（由来の機械可読化）（2026-09-30）
 *
 * 既存の項目（skillIds・items・members・unconfirmed・missing）は変えない（既存の●・△の塊が通ること）。
 * 足した sources で見ること：
 *   - 由来の種類（hint／event／commonEvent／uma）・イベントごとの hintLevel・sure・memberKey・eventKey
 *   - 同じイベントの中の複数の選択肢に同じスキルがあっても、出現は1つ（hintLevel は最大）
 *   - 別のイベントに同じスキルがあれば、別の出現（加算の元）
 *   - 失敗側（結果の2番目以降）にだけあるスキルは載らない（items と同じ）
 * 仕込みは tests/visual/lib/event-fixture.mjs（カード名・スキル名は書かない。実データから id で拾う）と、
 * 選択肢のレベルが違う例をこの塊で足す。
 * ============================================================ */
await block('スキルPt ―― 段2: sources（由来の機械可読化。2026-09-30）', async () => {
{
	const fx = buildEventFixture();
	const cardsDoc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8'));
	const masterDoc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'uma-skill-deck-skills.json'), 'utf8'));
	// レベルの違う選択肢の例：SR でも SSR でもよい、グループでないカード2枚と、ヒントに入っていないスキル
	const [cx, cy] = cardsDoc.entries.filter((c) => !c.isGroup).slice(20, 22);
	const hinted = new Set([cx, cy].flatMap((c) => (c.hintSkills || []).map((s) => s.skillId)));
	const [sk, sk2] = masterDoc.skills.filter((s) => !hinted.has(s.id)).slice(30, 32);
	const ref = (s, lv) => ({ skillId: s.id, name: s.name, hintLevel: lv });
	const doc = JSON.parse(JSON.stringify(fx.doc));
	doc.entries.push(
		// 2択で、同じスキルがどちらの選択肢にもある（レベルは3と1）→ ●で、出現は1つ・レベルは最大の3
		{ cardId: cx.id, status: 'done', chain: [{ step: 1, choices: [{ skills: [ref(sk, 3)] }, { skills: [ref(sk, 1)] }] }] },
		// 別のカードの別のイベントにも同じスキル（Lv2）→ 別の出現
		{ cardId: cy.id, status: 'done', chain: [{ step: 2, choices: [{ skills: [ref(sk, 2), ref(sk2, 1)] }] }] });
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	await page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(doc) }));
	await page.route('**/data/character-event-skills.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] }) }));
	const res = await page.evaluate(async ({ cardIds, cx, cy, sk, sk2 }) => {
		const C = window.UmaSkillDeckCore;
		await C.loadTrainingSources(true);
		const r = C.computeRosterSkills({ umaId: '', cardIds: cardIds });
		const r2 = C.computeRosterSkills({ umaId: '', cardIds: [cx, cy] });
		// 育成ウマ娘だけの編成
		const uma = (C.getTrainingSources().trainingUmamusume || {}).entries[0];
		const r3 = C.computeRosterSkills({ umaId: uma.id, cardIds: [] });
		const pack = (x) => x.sources.map((s) => Object.assign({}, s));
		return { keys: Object.keys(r), sources: pack(r), sources2: pack(r2), items2: r2.items.map((i) => i.skillId), uma: pack(r3), umaItems: r3.items.map((i) => i.skillId),
			skillIds: r.skillIds, itemIds: r.items.map((i) => i.skillId) };
	}, { cardIds: fx.cardIds, cx: cx.id, cy: cy.id, sk: sk.id, sk2: sk2.id });
	assert(['skillIds', 'items', 'members', 'unconfirmed', 'missing', 'sources'].every((k) => res.keys.includes(k)),
		'sources(1): 返り値に sources が足されて、既存の項目（skillIds・items・members・unconfirmed・missing）は残っている', res.keys);
	const S = fx.S; const [A, B, Cc, D] = fx.cardIds;
	const of = (id) => res.sources.filter((s) => s.skillId === id);
	const kindsOk = res.sources.every((s) => ['hint', 'event', 'commonEvent', 'uma'].includes(s.kind) && typeof s.sure === 'boolean' && Number.isInteger(s.memberKey)
		&& (s.kind === 'event' || s.kind === 'commonEvent' ? typeof s.eventKey === 'string' : s.eventKey === null));
	assert(kindsOk, 'sources(2): 由来の種類・sure・memberKey・eventKey（イベントだけが文字列）の形', res.sources.slice(0, 3));
	assert(of(S[0]).length === 1 && of(S[0])[0].kind === 'event' && of(S[0])[0].hintLevel === 1 && of(S[0])[0].sure === true && of(S[0])[0].eventKey === 'card:' + A + '#0'
		&& of(S[1])[0].hintLevel === 2 && of(S[1])[0].eventKey === 'card:' + A + '#0',
		'sources(3): イベントごとの hintLevel が読める（確定のイベントの2つのスキル：Lv1・Lv2。同じイベント A の1回目）', { s0: of(S[0]), s1: of(S[1]) });
	assert(of(S[4]).length === 1 && of(S[4])[0].sure === true && of(S[4])[0].eventKey === 'card:' + B + '#0',
		'sources(4): 同じイベントの2つの選択肢に同じスキルがあっても、出現は1つ（●）', of(S[4]));
	assert(of(S[2]).length === 2 && of(S[2]).filter((s) => s.sure).length === 1 && of(S[2]).filter((s) => !s.sure).length === 1
		&& new Set(of(S[2]).map((s) => s.eventKey)).size === 2,
		'sources(5): 別のカードの別のイベントに同じスキルがあれば、別の出現（B の1回目は△・C の3回目は●）', of(S[2]));
	assert(of(S[5]).length === 1 && of(S[5])[0].hintLevel === 3 && of(S[6]).length === 0 && of(S[7]).length === 0,
		'sources(6): 結果が3通りのイベントは先頭（成功）のレベル3だけ。失敗側にだけあるスキルは載らない（items と同じ）', { s5: of(S[5]), s6: of(S[6]), s7: of(S[7]) });
	assert(of(S[10]).length === 1 && of(S[10])[0].sure === false && of(S[10])[0].hintLevel === null && of(S[10])[0].eventKey === 'card:' + D + '#seeded',
		'sources(7): シートから取り込んだまま（seeded）のスキルは△で、レベルは null', of(S[10]));
	// レベルの違う選択肢
	const sx = res.sources2.filter((s) => s.skillId === sk.id);
	assert(sx.length === 2 && sx.map((s) => s.hintLevel).sort().join() === '2,3' && sx.every((s) => s.sure) && new Set(sx.map((s) => s.eventKey)).size === 2,
		'sources(8): 選択肢のレベルが違う（3と1）ときは最大の3で1つ。別のカードの別のイベント（2）は別の出現（＝加算の元）', sx);
	// 既存の項目と sources の対応
	assert(res.sources.every((s) => res.itemIds.includes(s.skillId)) && res.itemIds.every((id) => res.sources.some((s) => s.skillId === id)),
		'sources(9): sources の skillId と items の skillId は同じ顔ぶれ（由来の無い行も、由来だけある行も無い）', { items: res.itemIds.length });
	assert(res.uma.length > 0 && res.uma.every((s) => s.kind === 'uma' && s.sure === true && s.memberKey === 0 && s.hintLevel === null && s.eventKey === null && ['initial', 'awakening'].includes(s.part))
		&& res.uma.some((s) => s.part === 'initial') && res.uma.some((s) => s.part === 'awakening') && new Set(res.uma.map((s) => s.skillId)).size <= res.umaItems.length,
		'sources(10): 育成ウマ娘の初期・覚醒スキルは kind が uma・●・memberKey 0（part で初期／覚醒を分ける）', res.uma.slice(0, 3));
	// 練習のヒント
	const hint = await page.evaluate(async () => {
		const C = window.UmaSkillDeckCore;
		const card = ((C.getTrainingSources().supportCard || {}).entries || []).find((c) => c.dataStatus && c.dataStatus.hint === 'done' && (c.hintSkills || []).length >= 3);
		const r = C.computeRosterSkills({ umaId: '', cardIds: [card.id] });
		return { n: card.hintSkills.length, hint: r.sources.filter((s) => s.kind === 'hint').map((s) => s.skillId), want: card.hintSkills.map((s) => s.skillId),
			ok: r.sources.filter((s) => s.kind === 'hint').every((s) => s.sure === true && s.hintLevel === null && s.eventKey === null && s.memberKey === 1) };
	});
	assert(hint.ok && hint.hint.slice().sort().join() === hint.want.slice().sort().join(),
		'sources(11): 練習のヒントは kind が hint・●・memberKey はカードの枠（レベルは持たない。5 は計算側が rules から当てる）', hint);
	assert(errors.length === 0, 'sources: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();
}
});

/* ============================================================
 * スキルPt ―― check:catalog の §11（段1）。実ファイルが届いたときの検査を、仮のファイルで確かめる（2026-09-30）
 *
 * 実ファイル（skill-pt.json・skill-step-up.json）はまだ無いので、`data/` の写しに仮のファイルを置いて
 * `check:catalog --dir=` に通す。正しい形は通り、壊した形はそれぞれ落ちることを見る（値もキーも実データから拾う）。
 * ============================================================ */
await block('スキルPt ―― check:catalog の §11（届いたときの検査を仮のファイルで確かめる。2026-09-30）', async () => {
{
	const { spawnSync } = await import('node:child_process');
	const master = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'uma-skill-deck-skills.json'), 'utf8')).skills;
	const ext = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/extended-skills.json'), 'utf8')).entries;
	const [m1, m2, m3] = master.slice(0, 3).map((s) => s.id);
	const e1 = ext[0].id;
	const rules = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/skill-pt-rules.json'), 'utf8'));
	const ptDoc = (rows) => ({ dataVersion: '2026-09-30a', category: 'skillPt', entries: rows });
	const stepDoc = (rows) => ({ dataVersion: '2026-09-30a', category: 'skillStepUp', entries: rows });
	const goodPt = ptDoc([{ skillId: m1, pt: 90, rarity: 'white' }, { skillId: e1, pt: 110, rarity: 'white' }, { skillId: m2, pt: 0, rarity: 'unique' }]);
	const goodStep = stepDoc([{ skillId: e1, prevSkillIds: [m1], hintRootSkillId: m1 }, { skillId: m3, prevSkillIds: [e1] }]);
	const run = (files) => {
		const tmp = path.join(REPO_ROOT, 'output', 'scratch', 'smoke-pt-catalog');
		fs.rmSync(tmp, { recursive: true, force: true });
		fs.cpSync(path.join(REPO_ROOT, 'data'), tmp, { recursive: true });
		// 効果量の段階（C-129）は skillId が skill-pt.json に全部あることを見るので、仮の skill-pt.json とは合わない。この塊は §11 の Pt の検査だけを見るので外す
		fs.rmSync(path.join(tmp, 'skill-effect-levels.json'), { force: true });
		Object.entries(files).forEach(([name, doc]) => fs.writeFileSync(path.join(tmp, name), JSON.stringify(doc, null, '\t')));
		const r = spawnSync(process.execPath, ['tests/catalog/check-catalog.mjs', '--dir=' + path.relative(REPO_ROOT, tmp).split(path.sep).join('/')], { cwd: REPO_ROOT, encoding: 'utf8' });
		fs.rmSync(tmp, { recursive: true, force: true });
		const lines = (r.stdout || '').split('\n');
		return { status: r.status, ng: lines.filter((l) => l.startsWith('[NG]')).map((l) => l.slice(0, 120)), warn: lines.filter((l) => l.startsWith('[警告]')).map((l) => l.slice(0, 120)) };
	};
	const r0 = run({});
	assert(r0.status === 0, 'Pt/catalog(0): 実ファイルが無い（いま）ときは、§11 は割引率の表だけを見て通る', r0.ng);
	const r1 = run({ 'skill-pt.json': goodPt, 'skill-step-up.json': goodStep });
	assert(r1.status === 0, 'Pt/catalog(1): 正しい形の skill-pt.json・skill-step-up.json が届いたら通る', r1.ng);
	const cases = [
		['rules: 小数の割引率', { 'skill-pt-rules.json': Object.assign({}, rules, { hintDiscountPercent: [10.5, 20, 30, 35, 40] }) }],
		['rules: 割引率が100を超える', { 'skill-pt-rules.json': Object.assign({}, rules, { hintDiscountPercent: [10, 20, 30, 35, 140] }) }],
		['rules: 長さと hintLevelMax が違う', { 'skill-pt-rules.json': Object.assign({}, rules, { hintDiscountPercent: [10, 20, 30, 35] }) }],
		['rules: 状態の割引率が小数', { 'skill-pt-rules.json': Object.assign({}, rules, { statuses: [{ id: 'none', label: 'なし', percent: 0 }, { id: 'kire', label: '切れ者', percent: 0.1 }] }) }],
		['rules: 丸めの向きが知らない値', { 'skill-pt-rules.json': Object.assign({}, rules, { rounding: 'banker' }) }],
		['rules: 知らないキー', { 'skill-pt-rules.json': Object.assign({}, rules, { extra: 1 }) }],
		['pt: skillId の重複', { 'skill-pt.json': ptDoc([{ skillId: m1, pt: 90, rarity: 'white' }, { skillId: m1, pt: 91, rarity: 'white' }]) }],
		['pt: pt が小数', { 'skill-pt.json': ptDoc([{ skillId: m1, pt: 90.5, rarity: 'white' }]) }],
		['pt: 知らない rarity', { 'skill-pt.json': ptDoc([{ skillId: m1, pt: 90, rarity: 'rare' }]) }],
		['pt: 登録されていない skillId', { 'skill-pt.json': ptDoc([{ skillId: 'nope-0000', pt: 90, rarity: 'white' }]) }],
		['step: 自分自身を前段にする', { 'skill-step-up.json': stepDoc([{ skillId: m1, prevSkillIds: [m1] }]) }],
		['step: 循環する', { 'skill-step-up.json': stepDoc([{ skillId: m1, prevSkillIds: [m2] }, { skillId: m2, prevSkillIds: [m1] }]) }],
		['step: skillId の重複', { 'skill-step-up.json': stepDoc([{ skillId: m1, prevSkillIds: [m2] }, { skillId: m1, prevSkillIds: [m3] }]) }],
		['step: 前段に重複', { 'skill-step-up.json': stepDoc([{ skillId: m1, prevSkillIds: [m2, m2] }]) }],
		['step: 根が祖先でない', { 'skill-step-up.json': stepDoc([{ skillId: m1, prevSkillIds: [m2], hintRootSkillId: m3 }]) }],
		['step: 根自身が別の根を指す', { 'skill-step-up.json': stepDoc([{ skillId: m1, prevSkillIds: [m2], hintRootSkillId: m2 }, { skillId: m2, prevSkillIds: [m3], hintRootSkillId: m3 }]) }],
		['step: 前段が空', { 'skill-step-up.json': stepDoc([{ skillId: m1, prevSkillIds: [] }]) }],
	];
	for (const [label, files] of cases) {
		const r = run(files);
		assert(r.status !== 0 && r.ng.length > 0, 'Pt/catalog(2): 「' + label + '」は落ちる', r);
	}
	const multi = run({ 'skill-step-up.json': stepDoc([{ skillId: m1, prevSkillIds: [m2, m3] }]) });
	assert(multi.status === 0 && multi.warn.some((w) => w.includes('前段が2個以上')), 'Pt/catalog(3): 前段が2個以上のスキルは落とさず警告に出す', multi);
	const uncovered = run({ 'skill-pt.json': ptDoc([{ skillId: m1, pt: 90, rarity: 'white' }]) });
	assert(uncovered.status === 0 && uncovered.warn.some((w) => w.includes('行が無いもの')),
		'Pt/catalog(4): 編成で参照されるスキルのうち行が無いものは、落とさず警告→件数に出す', uncovered.warn);
	const uniq = run({ 'skill-pt.json': ptDoc([{ skillId: m1, pt: 50, rarity: 'unique' }]) });
	assert(uniq.status === 0 && uniq.warn.some((w) => w.includes('unique')), 'Pt/catalog(5): rarity が unique なのに pt が0でない行は警告に出す', uniq.warn);
}
});
/* ============================================================
 * 編成パネル ―― スキルPt（段3・2026-10-01。設計は skill-pt-calculation-step0.md の 2-10）
 *
 * 実データのスキル名・基礎値に依存しない。イベントの仕込み（event-fixture）と、**仮の skill-pt.json**
 * を取得の途中で差し替えて読ませる。期待値は、この塊の中で**独立に**（整数だけで）計算する:
 * 割引率の表（10・20・30・35・40。状態は0・4・10）を直に書き、コア側の計算式は使わない。
 *   ①  既定（なし・3）の●の行の Pt・合計・由来ごとの小計。小計の合計が合計と合う
 *   ②  状態を替えると合計が変わる／排他（同時には選べない）
 *   ③  覚醒レベル7のウマ娘だけ「5」を選べる。ほかは無効で理由が出る／ウマ娘が未選択なら行が無い
 *   ④  保存して開き直しても残る（未保存のドラフト・保存した編成）。設定を触らなければ pt は保存されない。
 *      選べなくなった 5 ・知らない状態は「なし」／3 として計算し、保存データは書き換えない
 *   ⑤  Pt が未収録のスキルは合計に入れず件数を出す／pt:0 は「Pt 不要」で合計に0を足す
 *   ⑥  △の行には Pt を出さない
 *   ⑦  「理論値」のバッジと「?」。開くと説明の全文が出る
 *   ⑧  データの読み込みに失敗してもパネルは壊れず、知らせが出る
 *   ⑩  1280px と 375px で横にはみ出さない・コンソールのエラーが0件
 * ============================================================ */
await block('編成パネル ―― スキルPt（段3）', async () => {
{
	/* 【段7（2026-10-03）で画面に合わせて書き直した】育成の設定の箱（ラジオ）は、合計の1行のボタン（勉強家・切れ者・ヒントLv3・ヒントLv5）に、
	   名前セルの2行目「基礎 B → P Pt（LvL）」は名前の右の「P Pt」に、「理論値」のバッジと由来ごとの小計は（?）の小窓に移った。
	   「保存」ボタンは無くなり、名前の ✓ で保存する。見る中身（期待値の計算・保存の形・読み込みの失敗）は段3 のまま。 */
	const fx = buildEventFixture();
	const S = fx.S;
	const DISC = [10, 20, 30, 35, 40];          // ヒントLv1〜5の割引率（％）
	const STATUS = { none: 0, benkyo: 4, kire: 10 };
	const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const routeEvents = async (page) => {
		await page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill({
			status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fx.doc) }));
		await page.route('**/data/character-event-skills.json*', (route) => route.fulfill({
			status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] }) }));
	};
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
	await routeEvents(page);

	// 育成ウマ娘を実データから拾う（名前は書かない）: 覚醒レベルが 7 まであるもの／7 に届かないもの
	// 由来は、編成パネルと同じ既定（autoChoose: スキルを持つ選択肢が1つだけのイベントは自動で選ぶ）で求める（段7）
	const facts = await page.evaluate(async ({ cardIds }) => {
		const Core = window.UmaSkillDeckCore;
		await Core.loadTrainingSources(true);
		const umas = (Core.getTrainingSources().trainingUmamusume || {}).entries || [];
		const maxLv = (u) => (u.awakeningSkills || []).reduce((m, r) => (typeof r.level === 'number' && r.level > m ? r.level : m), 0);
		const u7 = umas.find((u) => maxLv(u) >= 7);
		const u5 = umas.find((u) => maxLv(u) < 7);
		const r7 = Core.computeRosterSkills({ umaId: u7.id, cardIds: cardIds }, { autoChoose: true });
		return {
			u7: u7.id, u5: u5.id,
			sources7: r7.sources.map((s) => ({ skillId: s.skillId, kind: s.kind, sure: s.sure, hintLevel: s.hintLevel, eventKey: s.eventKey })),
			items7: r7.items.map((it) => ({ skillId: it.skillId, name: it.name, sure: it.sure })),
			names: Object.fromEntries(r7.items.map((it) => [it.skillId, it.name])),
		};
	}, { cardIds: fx.cardIds });
	assert(facts.u7 && facts.u5 && facts.u7 !== facts.u5, 'Pt(0): 覚醒レベル7のウマ娘と、届かないウマ娘が実データから拾えた', { u7: facts.u7, u5: facts.u5 });

	// 仮の skill-pt.json。S[0] は行を作らない（未収録）、S[1] は pt:0（固有と同じ「Pt 不要」）、ほかは 90〜240 を巡回
	const BASES = [90, 110, 130, 150, 180, 200, 240];
	const sureIds = [...new Set(facts.sources7.filter((s) => s.sure).map((s) => s.skillId))].sort();
	const allIds = facts.items7.map((it) => it.skillId).sort();
	const baseOf = new Map();
	let k = 0;
	allIds.forEach((id) => {
		if (id === S[0]) return;
		baseOf.set(id, id === S[1] ? 0 : BASES[k++ % BASES.length]);
	});
	const ptDoc = { dataVersion: '2026-10-01a', category: 'skillPt', note: 'テスト用の仕込み',
		entries: Array.from(baseOf.entries()).map(([skillId, pt]) => ({ skillId: skillId, pt: pt, rarity: pt === 0 ? 'unique' : 'white' })) };
	await page.route('**/data/skill-pt.json*', (route) => route.fulfill({
		status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(ptDoc) }));
	// 前段データは空に差し替える（段4b 以降、実データの前段が本育成の「前段として必要」に出るため。ここは前段を含めない段3 の期待値を見る塊）
	await page.route('**/data/skill-step-up.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ dataVersion: '2026-10-02a', category: 'skillStepUp', note: 'テスト用の仕込み（前段なし）', entries: [] }) }));

	// 独立の期待値（整数だけ）。umaLv は育成ウマ娘のレベル、status は状態の id
	const expected = (umaLv, status) => {
		const by = new Map();
		facts.sources7.forEach((s) => {
			if (!s.sure) return;
			const e = by.get(s.skillId) || { P: false, U: false, ev: new Map() };
			if (s.kind === 'hint') e.P = true;
			else if (s.kind === 'uma') e.U = true;
			else e.ev.set(s.eventKey, Math.max(e.ev.get(s.eventKey) || 0, s.hintLevel || 0));
			by.set(s.skillId, e);
		});
		const rows = {}; const sub = { hint: 0, event: 0, uma: 0 }; let total = 0; let unpriced = 0;
		by.forEach((e, id) => {
			const evSum = Array.from(e.ev.values()).reduce((a, b) => a + b, 0);
			const L = Math.min(5, (e.P ? 5 : 0) + evSum + (e.U ? umaLv : 0));
			const primary = e.P ? 'hint' : evSum > 0 ? 'event' : 'uma';
			if (!baseOf.has(id)) { rows[id] = 'Pt 未収録'; unpriced++; return; }
			const base = baseOf.get(id);
			if (base === 0) { rows[id] = 'Pt 不要'; return; }
			const pt = Math.floor(base * (100 - DISC[L - 1] - STATUS[status]) / 100);
			rows[id] = pt + ' Pt';
			total += pt; sub[primary] += pt;
		});
		return { rows, sub, total, unpriced, count: by.size, L: (id) => { const e = by.get(id); return Math.min(5, (e.P ? 5 : 0) + Array.from(e.ev.values()).reduce((a, b) => a + b, 0) + (e.U ? umaLv : 0)); } };
	};

	const mount = async (hostId, roster, draftKey) => page.evaluate(async ({ hostId, roster, draftKey }) => {
		localStorage.setItem('umaSkillDeck:draftRoster:' + draftKey, JSON.stringify(roster));
		const host = document.createElement('div');
		host.id = hostId; host.style.padding = '0 16px';
		document.body.appendChild(host);
		window.UmaSkillDeckCore.createRosterPanel(host, { draftKey: draftKey });
		// 元データを読み終えるまで待つ（読み込み中は何も出さない）
		for (let i = 0; i < 50 && !host.querySelector('[data-usd-el="pt-sum"],[data-usd-el="pt-error"]'); i++) await new Promise((r) => setTimeout(r, 50));
	}, { hostId, roster, draftKey });
	const read = (hostId) => page.evaluate((hostId) => {
		const host = document.getElementById(hostId);
		const t = (id) => { const e = host.querySelector('[data-usd-el="' + id + '"]'); return e ? e.textContent : null; };
		const rows = Array.from(host.querySelectorAll('.usd-roster-grow[data-skill-id]')).map((r) => ({
			name: r.querySelector('.usd-roster-skillname').textContent,
			pt: (r.querySelector('.usd-roster-pt') || {}).textContent || null,
			ref: !!r.querySelector('.usd-roster-pt--ref'),
		}));
		const btns = (act) => Array.from(host.querySelectorAll('button[data-usd-act="' + act + '"]')).map((b) => ({ v: b.getAttribute('data-value'), disabled: b.disabled, pressed: b.getAttribute('aria-pressed') === 'true', label: b.textContent.trim(), title: b.title }));
		const pressed = (act) => btns(act).filter((b) => b.pressed).map((b) => b.v);
		return { rows, total: t('pt-total'), count: t('pt-count'), error: t('pt-error'), sumrow: !!host.querySelector('[data-usd-el="pt-sumrow"]'),
			statusChecked: pressed('pt-status').length ? pressed('pt-status') : ['none'], umaChecked: pressed('pt-uma'), statusBtns: btns('pt-status'), umaBtns: btns('pt-uma'),
			labels: btns('pt-status').map((b) => b.label).concat(btns('pt-uma').map((b) => b.label)),
			ptLineCount: host.querySelectorAll('.usd-roster-pt').length, helpBtn: !!host.querySelector('[data-usd-el="pt-help-btn"]') };
	}, hostId);
	// （?）の小窓の中身（理論値・小計・未収録・ヒントLv5 の理由）。開いて読んで閉じる
	const readHelp = async (hostId) => {
		await page.click('#' + hostId + ' [data-usd-el="pt-help-btn"]');
		await page.waitForTimeout(100);
		const out = await page.evaluate((hostId) => {
			const pop = document.querySelector('[data-usd-el="info-pop"]');
			const t = (i) => { const e = pop.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent : null; };
			return { open: pop && !pop.hidden, theory: t('info-theory'), sub: t('info-subtotals'), unpriced: t('info-unpriced'), umaReason: t('info-uma-reason'),
				expanded: document.querySelector('#' + hostId + ' [data-usd-el="pt-help-btn"]').getAttribute('aria-expanded') };
		}, hostId);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(80);
		return out;
	};
	const rowText = (view, id) => (view.rows.find((r) => r.name === facts.names[id]) || {}).pt;
	const clickStatus = (hostId, st) => page.click('#' + hostId + ' button[data-usd-act="pt-status"][data-value="' + st + '"]');

	/* ① 既定（なし・3）。ウマ娘は覚醒レベル7のもの（5 も選べる） */
	await mount('pt-a', { umaId: facts.u7, cardIds: fx.cardIds }, 'pt-a');
	let v = await read('pt-a');
	let e = expected(3, 'none');
	const sureRows = sureIds.filter((id) => baseOf.has(id));
	const mismatch = sureRows.filter((id) => rowText(v, id) !== e.rows[id]).map((id) => ({ name: facts.names[id], got: rowText(v, id), want: e.rows[id] }));
	assert(sureRows.length >= 5 && mismatch.length === 0,
		'Pt(1): 既定（なし・3）で、●の行すべて（' + sureRows.length + '行）の Pt が独立の期待値と一致する（名前の右の「P Pt」）', mismatch.slice(0, 3));
	let help = await readHelp('pt-a');
	assert(v.total === fmt(e.total) && v.count === String(e.count) && help.sub === 'ヒント ' + fmt(e.sub.hint) + ' Pt／イベント ' + fmt(e.sub.event) + ' Pt／育成ウマ娘 ' + fmt(e.sub.uma) + ' Pt',
		'Pt(1): 「XXX Pt/XX種」の合計と種数、（?）の由来ごとの小計「ヒント n Pt／イベント n Pt／育成ウマ娘 n Pt」（3つとも出す）が期待値と一致する', { got: [v.total, v.count, help.sub], want: [fmt(e.total), e.count, e.sub] });
	assert(e.sub.hint + e.sub.event + e.sub.uma === e.total && e.sub.hint > 0 && e.sub.event > 0 && e.sub.uma > 0,
		'Pt(1): 期待値の側で、小計の合計が合計と合い、3つとも0でない（空振りでない）', e);
	const lvOf = (id) => e.L(id);
	assert(lvOf(S[1]) === 2 && lvOf(S[5]) === 3 && lvOf(S[4]) === 1 && lvOf(S[2]) === 1,
		'Pt(1): 仕込みのイベントのレベルが設計どおり（S1＝2・S5＝3・S4＝1 〔両方の選択肢に入っていても同じイベントは最大の1回〕・S2＝1）', { s1: lvOf(S[1]), s5: lvOf(S[5]), s4: lvOf(S[4]), s2: lvOf(S[2]) });
	assert(v.labels.join('|') === ['勉強家', '切れ者', '覚醒Lv5'].join('|') && v.statusChecked.join() === 'none' && v.umaChecked.join() === ''
		&& v.statusBtns.map((b) => b.title).join('|') === '勉強家 −4%|切れ者 −10%',
		'Pt(1): 状態のボタンは「勉強家」「切れ者」（割引率は title。割引率の表から作る）・育成ウマ娘は「覚醒ヒントLv5」だけ（押していない＝Lv3＝既定。段7b の ⑤）・状態は「なし」', { labels: v.labels, s: v.statusChecked, u: v.umaChecked });

	/* ② 状態 */
	const totals = {};
	for (const st of ['benkyo', 'kire']) {
		await clickStatus('pt-a', st);
		v = await read('pt-a'); e = expected(3, st); totals[st] = v.total;
		const mm = sureRows.filter((id) => rowText(v, id) !== e.rows[id]);
		assert(v.total === fmt(e.total) && mm.length === 0 && v.statusChecked.join() === st,
			'Pt(2): 状態「' + st + '」で、各行の Pt と合計が期待値どおりに変わる（合計 ' + e.total + '）', { got: v.total, want: fmt(e.total), mm: mm.length });
	}
	assert(totals.benkyo !== totals.kire && totals.kire !== fmt(expected(3, 'none').total), 'Pt(2): 状態ごとに合計が違う（空振りでない）', totals);
	assert(v.statusChecked.length === 1 && v.statusBtns.filter((r) => r.pressed).length === 1, 'Pt(2): 状態は排他（同時に選べるのは1つだけ。切れ者を選ぶと勉強家は外れる）', v.statusBtns);
	await clickStatus('pt-a', 'kire');   // もう一度押すと「なし」
	v = await read('pt-a');
	assert(v.statusChecked.join() === 'none' && v.total === fmt(expected(3, 'none').total), 'Pt(2): 選んでいる状態をもう一度押すと「なし」に戻る', { s: v.statusChecked, total: v.total });

	/* ③ 育成ウマ娘のヒントLv */
	assert(v.umaBtns.length === 1 && v.umaBtns.every((r) => !r.disabled), 'Pt(3): 覚醒レベル7のウマ娘では「覚醒ヒントLv5」が押せる（「ヒントLv3」のボタンは無い）', { r: v.umaBtns });
	const before5 = expected(3, 'none');
	await page.click('#pt-a button[data-usd-act="pt-uma"][data-value="5"]');
	v = await read('pt-a'); e = expected(5, 'none');
	const mm5 = sureRows.filter((id) => rowText(v, id) !== e.rows[id]);
	assert(v.umaChecked.join() === '5' && v.total === fmt(e.total) && mm5.length === 0 && v.total !== fmt(before5.total),
		'Pt(3): 「ヒントLv5」を選ぶと、育成ウマ娘の初期・覚醒スキルの Pt と合計が変わる', { got: v.total, want: fmt(e.total), before: fmt(before5.total), mm: mm5.length });
	await mount('pt-b', { umaId: facts.u5, cardIds: fx.cardIds }, 'pt-b');
	const vb = await read('pt-b');
	const helpB = await readHelp('pt-b');
	assert(vb.umaBtns.length === 1 && vb.umaBtns.find((r) => r.v === '5').disabled && vb.umaChecked.join() === ''
		&& vb.umaBtns.find((r) => r.v === '5').title === '覚醒ヒントLv5は覚醒レベル7のウマ娘のみ選べます' && helpB.umaReason === '覚醒ヒントLv5は覚醒レベル7のウマ娘のみ選べます',
		'Pt(3): 覚醒レベルが7に届かないウマ娘では「ヒントLv5」が押せず、理由「覚醒ヒントLv5は覚醒レベル7のウマ娘のみ選べます」が title と（?）に出る', { r: vb.umaBtns, reason: helpB.umaReason });
	await mount('pt-c', { umaId: '', cardIds: fx.cardIds }, 'pt-c');
	const vc = await read('pt-c');
	assert(vc.umaBtns.length === 1 && vc.umaBtns.find((r) => r.v === '5').disabled && vc.statusBtns.length === 2,
		'Pt(3): 育成ウマ娘が未選択のときも、ボタンは出て「ヒントLv5」は押せない（状態のボタンは出る）', { u: vc.umaBtns, s: vc.statusBtns.length });

	/* ④ 保存 */
	// 未保存（ドラフト）: 設定を替えると localStorage のドラフトに pt が入る。同じ draftKey で作り直しても残る
	await clickStatus('pt-a', 'kire');
	const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:pt-a')).pt);
	assert(draft && draft.status === 'kire' && draft.umaHintLevel === 5, 'Pt(4): 未保存の編成のドラフトに pt: { umaHintLevel, status } が保存される', draft);
	await page.evaluate(() => document.getElementById('pt-a').remove());
	await mount('pt-a2', JSON.parse(await page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:pt-a'))), 'pt-a');
	v = await read('pt-a2'); e = expected(5, 'kire');
	assert(v.statusChecked.join() === 'kire' && v.umaChecked.join() === '5' && v.total === fmt(e.total), 'Pt(4): 未保存の編成を開き直しても設定が残る（合計も同じ）', { s: v.statusChecked, u: v.umaChecked, total: v.total });
	// 保存した編成（名前を入れて ✓。段7）
	// 段7b の ①：名前の欄は無い。「＋新規」のタブの ✎ → 入力 → ✓
	await page.click('#pt-a2 [data-usd-el="name-edit"]');
	await page.fill('#pt-a2 [data-usd-el="name"]', '段3');
	await page.click('#pt-a2 [data-usd-el="name-commit"]');
	const saved = await page.evaluate(() => window.UmaSkillDeckCore.listRosters().map((r) => ({ id: r.rosterId, pt: r.pt })));
	assert(saved.length === 1 && saved[0].pt && saved[0].pt.status === 'kire' && saved[0].pt.umaHintLevel === 5, 'Pt(4): 保存した編成（userData.rosters）に pt が入る', saved);
	await page.evaluate(() => document.getElementById('pt-a2').remove());
	await mount('pt-d', { umaId: '', cardIds: new Array(6).fill(null) }, 'pt-d');
	await page.click('#pt-d [data-usd-act="select-roster"][data-tab-id="' + saved[0].id + '"]');
	v = await read('pt-d');
	assert(v.statusChecked.join() === 'kire' && v.umaChecked.join() === '5' && v.total === fmt(e.total), 'Pt(4): 保存した編成を選び直しても設定が残る（合計も同じ）', { s: v.statusChecked, u: v.umaChecked, total: v.total });
	// 設定を触らない編成には pt を足さない（読み込み時に補わない・保存データを勝手に変えない）
	await mount('pt-g', { umaId: facts.u5, cardIds: fx.cardIds, name: '段3g' }, 'pt-g');
	await page.click('#pt-g [data-usd-el="name-edit"]');
	await page.fill('#pt-g [data-usd-el="name"]', '段3g');
	await page.click('#pt-g [data-usd-el="name-commit"]');
	const untouched = await page.evaluate(() => { const l = window.UmaSkillDeckCore.listRosters(); return { n: l.length, hasPt: 'pt' in l[l.length - 1] }; });
	assert(untouched.n === 2 && untouched.hasPt === false, 'Pt(4): 設定を1度も触っていない編成を保存しても pt は足さない（既定は使うところで補う）', untouched);
	await page.evaluate(() => document.getElementById('pt-g').remove());
	// 選べなくなった 5・知らない状態は、計算は 3・「なし」、保存データはそのまま
	await page.evaluate(() => document.getElementById('pt-d').remove());
	await mount('pt-e', { umaId: facts.u5, cardIds: fx.cardIds, pt: { umaHintLevel: 5, status: 'zzz' } }, 'pt-e');
	v = await read('pt-e');
	// 同じウマ娘・同じ編成を「設定なし」で開いた基準（別のウマ娘なので、u7 の期待値ではなく、こちらと突き合わせる）
	await mount('pt-h', { umaId: facts.u5, cardIds: fx.cardIds }, 'pt-h');
	const vh = await read('pt-h');
	const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:pt-e')).pt);
	assert(v.umaChecked.join() === '' && v.statusChecked.join() === 'none' && v.total === vh.total && JSON.stringify(v.rows) === JSON.stringify(vh.rows) && vh.ptLineCount > 0,
		'Pt(4): 保存してある 5（覚醒 Lv が足りないウマ娘）と、知らない状態の値は、計算では 3・「なし」として扱う（設定の無い同じ編成と、各行・合計が同じ）', { u: v.umaChecked, s: v.statusChecked });
	assert(kept.umaHintLevel === 5 && kept.status === 'zzz', 'Pt(4): その保存データは書き換えない（開いて描いただけでは変わらない）', kept);
	await clickStatus('pt-e', 'benkyo');
	const kept2 = await page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:pt-e')).pt);
	assert(kept2.status === 'benkyo' && kept2.umaHintLevel === 5, 'Pt(4): 状態だけ替えたとき、もう一方の保存値（5）は書き換えない', kept2);
	await page.evaluate(() => { document.getElementById('pt-e').remove(); document.getElementById('pt-h').remove(); });

	/* ⑤ 未収録・Pt 不要 ／ ⑥ △ ／ ⑦ 理論値 */
	await mount('pt-f', { umaId: facts.u7, cardIds: fx.cardIds }, 'pt-f');
	v = await read('pt-f'); e = expected(3, 'none');
	help = await readHelp('pt-f');
	assert(e.unpriced === 1 && help.unpriced === '（Pt未収録1種は含めていません）' && rowText(v, S[0]) === 'Pt 未収録',
		'Pt(5): Pt が未収録のスキル（S0）は行に「Pt 未収録」と出て、合計に入れず（?）に「（Pt未収録1種は含めていません）」が出る', { unpriced: help.unpriced, row: rowText(v, S[0]) });
	assert(rowText(v, S[1]) === 'Pt 不要' && v.total === fmt(e.total),
		'Pt(5): pt:0 の行（S1）は「Pt 不要」で、合計には0が足される（合計が期待値のまま）', { row: rowText(v, S[1]), total: v.total });
	const maybeIds = facts.items7.filter((it) => !it.sure).map((it) => it.skillId);
	// 段7: △の行の Pt は薄い色の参考値（そのイベントで選んだときの値）。合計には入らない
	assert(maybeIds.length >= 2 && maybeIds.every((id) => baseOf.has(id) && v.rows.find((r) => r.name === facts.names[id]) && v.rows.find((r) => r.name === facts.names[id]).ref && /^\d+ Pt$/.test(rowText(v, id) || ''))
		&& sureRows.every((id) => !v.rows.find((r) => r.name === facts.names[id]).ref),
		'Pt(6): △だけの行（' + maybeIds.length + '行。Pt の行は仕込んである）の Pt は薄い色の参考値で、●の行は通常の色', maybeIds.map((id) => ({ id: id, pt: rowText(v, id) })));
	assert(help.open && help.theory === '理論値（各スキルを最大のヒントレベルで得た場合のスキルPt）' && help.expanded === 'true' && v.helpBtn,
		'Pt(7): 合計の行の「?」を押すと小窓が開き、理論値の説明の全文が出る（ホバーに依存しない）', help);
	assert((await page.evaluate(() => document.querySelector('#pt-f [data-usd-el="pt-help-btn"]').getAttribute('aria-expanded'))) === 'false', 'Pt(7): 閉じると aria-expanded が false に戻る');

	/* ⑩ 幅 ―― 1280px と 375px。横にはみ出さない（名前と Pt はセルの中を横に送れる。段7） */
	const overflow = async (label) => {
		const m = await page.evaluate(() => {
			const host = document.getElementById('pt-f');
			const wrap = host.querySelector('.usd-roster-grid-wrap');
			const lines = Array.from(host.querySelectorAll('.usd-roster-pt'));
			return { page: document.documentElement.scrollWidth - window.innerWidth, wrap: wrap.scrollWidth - wrap.clientWidth,
				multiLine: lines.filter((l) => l.getBoundingClientRect().height > 20).length, lines: lines.length,
				sum: (() => { const s = host.querySelector('[data-usd-el="pt-sum"]'); return s.scrollWidth - s.clientWidth; })() };
		});
		assert(m.page <= 0 && m.wrap <= 0 && m.sum <= 0 && m.lines > 0,
			'Pt(10): ' + label + ' で、横にはみ出さない（ページ・表・合計）', m);
		assert(m.multiLine === 0, 'Pt(10): ' + label + ' で、Pt（' + m.lines + '行）はすべて1行に収まる', { multiLine: m.multiLine });
	};
	await overflow('1280px');
	await page.setViewportSize({ width: 375, height: 800 });
	await overflow('375px');
	await page.setViewportSize({ width: 1280, height: 900 });
	assert(errors.length === 0, 'Pt: コンソールエラーなし', errors.slice(0, 3));
	await ctx.close();

	/* ⑩の続き ―― 実際の special.html の①タブ。はみ出さず、Pt が1行に収まることを見る */
	for (const [w, h] of [[1280, 1000], [375, 900]]) {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h });
		await sp.page.evaluate(({ cardIds, umaId }) => localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ umaId: umaId, cardIds: cardIds })), { cardIds: fx.cardIds, umaId: facts.u7 });
		await sp.page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fx.doc) }));
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(() => selectStepTab(0));
		await sp.page.waitForSelector('#deck-roster-panel [data-usd-el="pt-sum"]');
		const g = await sp.page.evaluate(() => {
			const host = document.getElementById('deck-roster-panel');
			const wrap = host.querySelector('.usd-roster-grid-wrap');
			const lines = Array.from(host.querySelectorAll('.usd-roster-pt'));
			return { page: document.documentElement.scrollWidth - window.innerWidth, wrap: wrap.scrollWidth - wrap.clientWidth, lines: lines.length,
				maxLinesPerPt: Math.max(...lines.map((l) => Math.round(l.getBoundingClientRect().height / 14))) };
		});
		assert(g.page <= 0 && g.wrap <= 0 && g.lines > 0 && g.maxLinesPerPt === 1,
			'Pt(10): 実際の special.html の①タブ（' + w + 'px）で、横にはみ出さず、Pt（' + g.lines + '行）はすべて1行に収まる', g);
		const other = sp.errors.filter((m) => !/Failed to load resource|status of 404/.test(m));
		assert(other.length === 0, 'Pt(10): special.html の①タブ（' + w + 'px）でコンソールエラーなし', other.slice(0, 3));
		await sp.ctx.close();
	}

	/* ⑧ 読み込みの失敗。割引率の表・skill-pt.json のどちらが失敗してもパネルは壊れず、知らせが出て Pt は出ない */
	for (const failing of ['skill-pt-rules.json', 'skill-pt.json']) {
		const p2 = await openPage(browser, base, 'uma-skill-deck.html');
		await routeEvents(p2.page);
		await p2.page.route('**/data/skill-pt.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(ptDoc) }));
		await p2.page.route('**/data/' + failing + '*', (route) => route.fulfill({ status: 500, body: 'error' }));
		await p2.page.evaluate(async () => { await window.UmaSkillDeckCore.loadTrainingSources(true); });
		await p2.page.evaluate(({ u7, cardIds }) => { localStorage.setItem('umaSkillDeck:draftRoster:pt-x2', JSON.stringify({ umaId: u7, cardIds: cardIds })); }, { u7: facts.u7, cardIds: fx.cardIds });
		await p2.page.evaluate(async () => {
			const host = document.createElement('div'); host.id = 'pt-y'; document.body.appendChild(host);
			window.UmaSkillDeckCore.createRosterPanel(host, { draftKey: 'pt-x2' });
			for (let i = 0; i < 50 && !host.querySelector('[data-usd-el="pt-error"]'); i++) await new Promise((r) => setTimeout(r, 50));
		});
		const f = await p2.page.evaluate(() => {
			const host = document.getElementById('pt-y');
			return { error: (host.querySelector('[data-usd-el="pt-error"]') || {}).textContent || null, ptLines: host.querySelectorAll('.usd-roster-pt').length,
				sum: !!host.querySelector('[data-usd-el="pt-sum"]'), sumrow: !!host.querySelector('[data-usd-el="pt-sumrow"]'),
				rows: host.querySelectorAll('.usd-roster-grow').length, marks: host.querySelectorAll('.usd-roster-got').length };
		});
		const other = p2.errors.filter((m) => !/Failed to load resource|status of 500/.test(m));
		assert(f.error === 'Pt のデータを読み込めませんでした' && f.ptLines === 0 && !f.sum && !f.sumrow && f.rows > 5 && f.marks > 0 && other.length === 0,
			'Pt(8): ' + failing + ' を読めなくても、パネルは壊れず（表は出る）、知らせが出て Pt は出ない（例外なし）', { f, other: other.slice(0, 2) });
		await p2.ctx.close();
	}
}
});

/* 【段7（2026-10-03）で削除】「編成パネル ―― △を有効にする（段4）」の塊。△を1つずつ「有効にする」仕組みは廃止し、
   列見出しの▼で開く「イベントを選ぶ」小窓（選択肢を選ぶ）に置き換えた（C-113）。その検査は末尾の「本育成パネルの見直しとイベントの選択（段7）」の塊。 */

/* ============================================================
 * 周回因子セットの必要スキルPt（段5・2026-10-01。設計は skill-pt-calculation-step0.md の 0節・2-5・2-10）
 *
 * 実際の special.html の②タブ。実データに依存しない: カードは実データから id だけ拾い、イベント・スキルPt・因子セットは仮のデータ
 * （スキルは、そのカードの練習ヒントに入っていないものを master から id で拾う。名前は書かない）。
 * 期待値はこの塊の中で、整数だけで独立に計算する（割引率 10・20・30・35・40・状態 0・4・10 を直に書く）。
 *   仮のイベント: カードA … step1（3択: X0 Lv2・X1 Lv1／X0 Lv3／空）／step2（2択: X0 Lv1／X2 Lv2）／step3（確定: X3 Lv4）／step4（確定: X6 Lv2）
 *                 カードB … step1（2択: X3 Lv3／空）／step2（確定: X4 Lv1）／step3（2択: X4 Lv1／空）　カードC … seeded で X5
 *   仮の因子セット: Y0（超優先）・Y1（優先）・Y2・Y3（通常）・Y4（優先。Pt の行なし＝未収録）・Y5（超優先。Pt 不要＝pt:0）・X6（優先。本育成の●と重なる）
 *   ①  3つの合計が期待値と一致し、累積（超優先だけ ＜ 優先まで ＜ 通常まで）。分類を変えると変わる
 *   ②  因子セットだけのスキルは F の割引（既定5＝40%）。F を替えると変わる。保存して開き直しても残る（未保存・保存した因子セット）
 *   ③  本育成と因子セットの両方にあるスキルは1回だけ・L = min(5, 本育成の由来 + F)（イベント Lv2・F 3 → 5／F 1 → 3）
 *       → 段8（C-120）で「①で得るスキルは②に数えない（①で取得）」に差し替えた。⑧ のバッジと ⑬ の補足文も段8 で外した
 *   ④  状態を本育成パネルで替えると、因子セットのスキルの Pt も変わる
 *   ⑤  △を有効にすると本育成のぶんが増える／除外中に有効にして自動で外れたスキルは因子セットのぶんから減る
 *   ⑥  Pt 未収録は合計に入れず件数／pt:0 は0を足す
 *   ⑦  Deck 単体ページには出ない
 *   ⑧  「理論値」のバッジと「?」　⑨ 読み込みの失敗　⑩ 本育成が0のとき「うち本育成」が出ない
 *   ⑪  1280px と 375px で横にはみ出さない・コンソールエラー0件
 * ============================================================ */
await block('周回因子セットの必要スキルPt（段5）', async () => {
{
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const cardsAll = readJson('data/support-cards.json').entries;
	const master = readJson('uma-skill-deck-skills.json').skills;
	const [cA, cB, cC] = [cardsAll[0], cardsAll[1], cardsAll[2]];
	const hinted = new Set([cA, cB, cC].flatMap((c) => (c.hintSkills || []).map((s) => s.skillId)));
	const pool = master.filter((s) => !hinted.has(s.id));
	const X = pool.slice(0, 7).map((s) => ({ skillId: s.id, name: s.name }));
	const Y = pool.slice(7, 13).map((s) => ({ skillId: s.id, name: s.name }));
	const ref = (i, lv) => ({ skillId: X[i].skillId, name: X[i].name, hintLevel: lv });
	const evDoc = { dataVersion: '2026-10-01a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries: [
		{ cardId: cA.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(0, 2), ref(1, 1)] }, { skills: [ref(0, 3)] }, { skills: [] }] },
			{ step: 2, choices: [{ skills: [ref(0, 1)] }, { skills: [ref(2, 2)] }] },
			{ step: 3, choices: [{ skills: [ref(3, 4)] }] },
			{ step: 4, choices: [{ skills: [ref(6, 2)] }] }] },
		{ cardId: cB.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(3, 3)] }, { skills: [] }] },
			{ step: 2, choices: [{ skills: [ref(4, 1)] }] },
			{ step: 3, choices: [{ skills: [ref(4, 1)] }, { skills: [] }] }] },
		{ cardId: cC.id, status: 'seeded', unplaced: [{ skillId: X[5].skillId, name: X[5].name }] },
	] };
	const cardIds = [cA.id, cB.id, cC.id, null, null, null];
	const x = (i) => X[i].skillId;
	const y = (i) => Y[i].skillId;
	const DISC = [10, 20, 30, 35, 40];
	const STATUS = { none: 0, benkyo: 4, kire: 10 };
	const UQ = (st) => 6 * Math.floor(200 * (100 - DISC[2] - STATUS[st || 'none']) / 100);   // 継承固有 6種×基礎200・Lv3
	const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const routes = async (page, ptDoc, rulesFail) => {
		await page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(evDoc) }));
		await page.route('**/data/character-event-skills.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8',
			body: JSON.stringify({ dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] }) }));
		if (ptDoc) await page.route('**/data/skill-pt.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(ptDoc) }));
		if (rulesFail) await page.route('**/data/skill-pt-rules.json*', (route) => route.fulfill({ status: 500, body: 'error' }));
		await page.route('**/data/skill-step-up.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ dataVersion: '2026-10-02a', category: 'skillStepUp', note: 'テスト用の仕込み（前段なし）', entries: [] }) }));   // 前段なし（段4b 以降の実データの前段に左右されない）
	};

	// 本育成の由来（sources）を先に求める（Deck 単体ページで。panel は作らない）
	const first = await openPage(browser, base, 'uma-skill-deck.html');
	await routes(first.page, null);
	const facts = await first.page.evaluate(async ({ cardIds }) => {
		const Core = window.UmaSkillDeckCore;
		await Core.loadTrainingSources(true);
		// 段7: 編成パネルと同じ既定の選択（スキルを持つ選択肢が1つだけのイベントは自動で選ぶ）で由来を求める
		const r = Core.computeRosterSkills({ umaId: '', cardIds: cardIds }, { autoChoose: true });
		return { sources: r.sources.map((s) => ({ skillId: s.skillId, kind: s.kind, sure: s.sure, hintLevel: s.hintLevel, eventKey: s.eventKey })), ids: r.items.map((it) => it.skillId) };
	}, { cardIds: cardIds });
	await first.ctx.close();

	// 仮の skill-pt.json: Y4 は行なし（未収録）、Y5 は pt:0、ほかは 90〜240 を巡回
	const BASES = [90, 110, 130, 150, 180, 200, 240];
	const baseOf = new Map();
	[...new Set(facts.ids.concat([y(0), y(1), y(2), y(3), y(5), x(6)]))].sort().forEach((sid, k) => baseOf.set(sid, sid === y(5) ? 0 : BASES[k % BASES.length]));
	const ptDoc = { dataVersion: '2026-10-01a', category: 'skillPt', note: 'テスト用の仕込み',
		entries: Array.from(baseOf.entries()).map(([skillId, pt]) => ({ skillId, pt, rarity: pt === 0 ? 'unique' : 'white' })) };
	const SCOPE_IDS = [y(0), y(1), y(2), y(3), y(4), y(5), x(6)];
	const SCOPE_TIERS = { [y(0)]: 1, [y(5)]: 1, [y(2)]: 3, [y(3)]: 3 };

	// 独立の期待値。st = { on: 有効な△の id, status, F, ids: 因子セットの id, tiers }
	const expectedNeed = (st) => {
		const by = new Map();
		facts.sources.forEach((s) => {
			const e = by.get(s.skillId) || { P: false, ev: new Map(), unsure: [] };
			if (s.sure) { if (s.kind === 'hint') e.P = true; else e.ev.set(s.eventKey, Math.max(e.ev.get(s.eventKey) || 0, s.hintLevel || 0)); }
			else e.unsure.push(s.hintLevel === null ? 0 : s.hintLevel);
			by.set(s.skillId, e);
		});
		const tierOf = (sid) => (st.tiers && [1, 2, 3].includes(st.tiers[sid])) ? st.tiers[sid] : 2;
		// 段8・D（C-120）: ①で得るスキル（確定の由来＝●でオン）は②の因子セットから除いて計算する（②に数えない）
		const factorIds = (st.ids || []).filter((sid) => { const e = by.get(sid); return !(e && (e.P || e.ev.size > 0)); });
		const calc = (cut) => {
			const ids = new Set(by.keys());
			factorIds.forEach((sid) => { if (tierOf(sid) <= cut) ids.add(sid); });
			let total = 0; let unpriced = 0; const levels = {};
			ids.forEach((sid) => {
				const e = by.get(sid);
				const inFactor = factorIds.includes(sid) && tierOf(sid) <= cut;
				const roster = e && (e.P || e.ev.size > 0 || ((st.on || []).includes(sid) && e.unsure.length > 0));
				if (!roster && !inFactor) return;
				const E = e ? Array.from(e.ev.values()).reduce((a, b) => a + b, 0) : 0;
				const T = e && (st.on || []).includes(sid) && e.unsure.length > 0 ? Math.max(...e.unsure) : 0;
				const L = Math.min(5, (e && e.P ? 5 : 0) + E + T + (inFactor ? st.F : 0));
				levels[sid] = L;
				if (!baseOf.has(sid)) { unpriced++; return; }
				total += Math.floor(baseOf.get(sid) * (100 - (L > 0 ? DISC[L - 1] : 0) - STATUS[st.status || 'none']) / 100);
			});
			return { total: total + UQ(st.status), unpriced, levels };
		};
		const rosterOnly = calc(0);
		const cuts = [1, 2, 3].map(calc);
		return { A: cuts[0].total, B: cuts[1].total, C: cuts[2].total, unpriced: cuts[2].unpriced, roster: rosterOnly.total, levels: cuts[2].levels, rosterCount: Array.from(by.keys()).filter((sid) => { const e = by.get(sid); return e.P || e.ev.size > 0 || ((st.on || []).includes(sid) && e.unsure.length > 0); }).length };
	};

	/* special を開く（①の編成と、②の因子セットのドラフトを仕込む） */
	const openSpecial = async (o) => {
		const rosterObj = o.roster === undefined ? { umaId: '', cardIds: cardIds } : o.roster;
		const saved = Object.assign({ rosterId: 'r5', name: '本育成', umaId: '', star: 0, awakeningLevel: 0, createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z' }, rosterObj);
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 1000 }, Object.assign({}, o.userData || USER_DATA, { rosters: [saved] }));
		await routes(sp.page, ptDoc, o.rulesFail);
		const scopeObj = o.scope === undefined ? { skillIds: SCOPE_IDS, name: '', tiers: SCOPE_TIERS, updatedAt: '' } : o.scope;
		await sp.page.evaluate(({ roster, scope }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope));
		}, { roster: rosterObj, scope: scopeObj ? Object.assign({ baseRosterId: 'r5' }, scopeObj) : scopeObj });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(() => selectStepTab(0));
		await sp.page.waitForSelector('#deck-roster-panel [data-usd-el="pt-sum"],#deck-roster-panel [data-usd-el="pt-error"]', { timeout: 10000 }).catch(() => {});
		// 段8（C-120）で①の編成のタブ（select-roster）を無くした。＋新規（ドラフト）のセットの①は下書きの編成（中身は r5 と同じ rosterObj）で、
		// ①で状態などを替えると同じセットの②に効く
		await sp.page.waitForTimeout(150);
		return sp;
	};
	const readNeed = (page) => page.evaluate(() => {
		const el = document.querySelector('[data-usd-el="pt-need"]');
		const num = (s) => Number((s || '').replace(/[^0-9]/g, ''));
		// 段9（C-121）: ランクごとのチップは無くなった。分類（アイコンから導いた tiers）ごとの累計は、帯の data-cuts（検査用。画面には出さない）から読む
		const band = el.querySelector('[data-usd-el="set-head"]');
		const cuts = band ? JSON.parse(band.getAttribute('data-cuts')) : null;
		const chip = (n) => (cuts ? { label: '', n: cuts[n - 1].total } : null);
		const t = (i) => { const e = el.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent : null; };
		// 段8・D（C-120）: 親由来のレベル（「共通スキルのヒントLv」）の選択は、pt-need の外の②の2行目（roster-link-row）へ移った
		const sel = document.querySelector('#deck-template-panel [data-usd-el="pt-parent-level"]');
		return { hidden: el.hidden, empty: el.innerHTML === '', chips: [chip(1), chip(2), chip(3)], roster: t('pt-need-roster'), unpriced: t('pt-need-unpriced'), error: t('pt-need-error'),
			theory: t('pt-need-theory'), F: sel ? Number(sel.value) : null, options: sel ? Array.from(sel.options).map((o) => o.value) : [] };
	});
	const readScope = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{"skillIds":[]}'));
	const sameNeed = (v, e) => v.chips[0] && v.chips[0].n === e.A && v.chips[1].n === e.B && v.chips[2].n === e.C;
	const base0 = { on: [], status: 'none', F: 5, ids: SCOPE_IDS, tiers: SCOPE_TIERS };

	/* ① 3つの合計・累積・分類の変更 ／ ⑧ ／ ⑥ */
	let sp = await openSpecial({});
	let v = await readNeed(sp.page);
	let e = expectedNeed(base0);
	assert(!v.hidden && sameNeed(v, e), '段5(1): 3つの合計（超優先だけ・優先まで・通常まで）が、独立の期待値と一致する', { got: v.chips.map((c) => c && c.n), want: [e.A, e.B, e.C] });
	// 段8・D（C-120）: チップの表示はそのランク自身の Pt（「＋超優先： N Pt」。1280px では「：」のあとに空白）。累積は data-cum で見る
	assert(e.A < e.B && e.B < e.C && v.chips[0].n < v.chips[1].n && v.chips[1].n < v.chips[2].n,
		'段5(1)→段9: 分類ごとの累計（画面には出さず、帯の data-cuts が持つ検査用の値）は 超優先だけ＜優先まで＜通常まで（期待値の側でも3つとも増える＝空振りでない）', { chips: v.chips, e: [e.A, e.B, e.C] });
	// 段8（C-120）で「理論値」のバッジ（pt-need-theory）と説明の箱（pt-need-help-box）を無くしたので、バッジの検査は外した。
	// 「理論値」の説明は「?」の小窓の1行目（factor-help-theory）に移ったので、そちらを見る（新しい仕様は blocks-8.mjs の段8(D)）
	await sp.page.evaluate(() => selectStepTab(1));
	await sp.page.click('#deck-template-panel [data-usd-act="pt-need-help"]');
	const help = await sp.page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-act="pt-need-help"]'); const x = document.querySelector('[data-usd-el="factor-help-theory"]');
		const u = document.querySelector('[data-usd-el="factor-help-unpriced"]');
		return b ? { expanded: b.getAttribute('aria-expanded'), text: x ? x.textContent : null, unpriced: u ? u.textContent : null } : null; });
	assert(help && help.expanded === 'true' && help.text && help.text.startsWith('理論値です。'),
		'段5(8)→段8: 「?」を押すと、小窓に「理論値です。…」の説明が出る', help);
	await sp.page.keyboard.press('Escape');
	// 段8・D（C-120）: 未収録の知らせは②の「?」の小窓の1行（factor-help-unpriced）へ移った
	assert(help.unpriced === 'Pt 未収録のスキル 1種は数えていません' && e.unpriced === 1,
		'段5(6): Pt が未収録のスキル（Y4）は合計に入れず、「?」の小窓に「Pt 未収録のスキル 1種は数えていません」が出る（pt:0 の Y5 は未収録に数えない）', { unpriced: help.unpriced });
	assert(v.roster === null && e.roster > 0, '段5(1)→段7c(O): 「（うち本育成 X）」の行は削除した（表示だけ。X の計算は変えていない）', { got: v.roster, want: e.roster });
	// 分類を変える（優先の Y1 を超優先へ）→ 超優先だけ・優先までが増え、通常までは変わらない
	// 段9: 再分類のモードは無い。パレットで ◎ を選び、その行のアイコンを押すと超優先（tiers が 1）になる
	await sp.page.click('#deck-template-panel [data-usd-el="palette-a"]');
	await sp.page.click('#deck-template-panel .usd-panel[data-skill-id="' + y(1) + '"] [data-usd-act="skill-icon"]');
	v = await readNeed(sp.page);
	const tiers2 = Object.assign({}, SCOPE_TIERS, { [y(1)]: 1 });
	e = expectedNeed(Object.assign({}, base0, { tiers: tiers2 }));
	assert(sameNeed(v, e) && e.A > expectedNeed(base0).A && e.C === expectedNeed(base0).C && (await readScope(sp.page)).tiers[y(1)] === 1,
		'段5(1): 分類を変える（Y1 を超優先へ）と、超優先だけが増え、通常までは変わらない', { got: v.chips.map((c) => c.n), want: [e.A, e.B, e.C] });

	/* ② F ・保存 ／ ④ 状態 */
	assert(v.F === 5 && v.options.join() === '5,4,3,2,1', '段5(2): 親由来のレベルは 5・4・3・2・1 から選べ、既定は 5（0 は無い）', { F: v.F, options: v.options });
	await sp.page.selectOption('[data-usd-el="pt-parent-level"]', '3');
	v = await readNeed(sp.page);
	const ex3 = expectedNeed(Object.assign({}, base0, { tiers: tiers2, F: 3 }));
	assert(sameNeed(v, ex3) && ex3.C !== e.C && v.F === 3, '段5(2): F を 3 に替えると、因子セットだけのスキルは L=3（35%引き）で計算され、合計が変わる', { got: v.chips.map((c) => c.n), want: [ex3.A, ex3.B, ex3.C] });
	const draft = await readScope(sp.page);
	assert(draft.parentHintLevel === 3, '段5(2): 未保存の因子セットのドラフトに parentHintLevel が保存される', draft.parentHintLevel);
	// 状態（①の本育成パネル）。因子セットだけのスキルの Pt も変わる
	await sp.page.evaluate(() => selectStepTab(0));
	await sp.page.click('#deck-roster-panel button[data-usd-act="pt-status"][data-value="kire"]');
	v = await readNeed(sp.page);
	const exK = expectedNeed(Object.assign({}, base0, { tiers: tiers2, F: 3, status: 'kire' }));
	assert(sameNeed(v, exK) && exK.A < ex3.A, '段5(4): 状態（切れ者）を本育成パネルで替えると、因子セットだけのスキルを含めて合計が変わる（10%引きが加わる）', { got: v.chips.map((c) => c.n), want: [exK.A, exK.B, exK.C] });
	await sp.page.click('#deck-roster-panel button[data-usd-act="pt-status"][data-value="kire"]');   // もう一度押すと「なし」
	// 開き直し（未保存）
	await sp.page.reload({ waitUntil: 'networkidle' });
	for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
	await sp.page.evaluate(() => selectStepTab(1));   // 段7d の ③：再読み込みすると前回のタブ（①）が開くので、②へ移ってから待つ
	await sp.page.waitForSelector('[data-usd-el="pt-need"]:not([hidden])');
	v = await readNeed(sp.page);
	assert(v.F === 3 && sameNeed(v, ex3), '段5(2): 未保存の因子セットを開き直しても F が残る（合計も同じ）', { F: v.F, got: v.chips.map((c) => c.n) });
	// 保存した因子セット
	await sp.page.evaluate(() => selectStepTab(1));
	// 段7b の ⑫：名前の入力欄・保存ボタンは無い。「＋新規」のタブの ✎ → 入力 → Enter で保存する
	// 段8（C-120）で②のタブの帯を無くしたので、✎ は共通の見出しの帯（#deck-set-bar）のもの
	await sp.page.click('#deck-set-bar [data-usd-act="name-edit"]');
	await sp.page.keyboard.type('段5の検査');
	await sp.page.keyboard.press('Enter');
	await sp.page.waitForTimeout(250);
	const savedRaw = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData')).templates.map((t) => ({ id: t.templateId, F: t.parentHintLevel, tiers: t.tiers })));
	assert(savedRaw.length >= 1 && savedRaw[savedRaw.length - 1].F === 3, '段5(2): 保存した因子セット（template）に parentHintLevel が入る', savedRaw);
	// 開き直し: 保存した因子セット（userData の template。parentHintLevel を持つ）を別のページで開いて選ぶ
	// （openPage は読み込みのたびに userData を仕込み直すので、同じページの reload では保存が消える。保存の形は上で見た）
	await sp.ctx.close();
	const UD = Object.assign({}, USER_DATA, { templates: USER_DATA.templates.concat([{ templateId: 'tpl_s5', name: '段5', skillIds: SCOPE_IDS, tiers: tiers2, parentHintLevel: 3, baseRosterId: 'r5',
		createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }]) });
	sp = await openSpecial({ userData: UD, scope: { skillIds: [], name: '', updatedAt: '' } });
	await sp.page.evaluate(() => selectStepTab(1));
	// 段8（C-120）で②のタブの帯を無くしたので、セットは setSelectedId で選ぶ（tpl_s5 の①は baseRosterId の r5）
	await sp.page.evaluate(() => deckTemplateManager.setSelectedId('tpl_s5'));
	v = await readNeed(sp.page);
	assert(v.F === 3 && sameNeed(v, ex3), '段5(2): 保存した因子セットを選ぶと、保存してある F（3）で表示・計算される（合計も同じ）', { F: v.F, got: v.chips.map((c) => c.n), want: [ex3.A, ex3.B, ex3.C] });
	await sp.page.evaluate(() => deckTemplateManager.setSelectedId('tpl_demo01'));
	await sp.page.evaluate(() => deckTemplateManager.setSelectedId('tpl_s5'));
	v = await readNeed(sp.page);
	assert(v.F === 3, '段5(2): ほかのセットへ移って戻っても F が残る', v.F);
	// 設定を触らない因子セットには parentHintLevel を足さない（既定は使うところで補う）
	const noF = await openSpecial({});
	const rawScope = await readScope(noF.page);
	assert(!('parentHintLevel' in rawScope), '段5(2): F を1度も触っていない因子セットのドラフトに parentHintLevel を足さない（読み込み時に補わない）', rawScope);
	// 知らない値は 5 として計算し、保存データは書き換えない
	await noF.page.evaluate((ids) => localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', parentHintLevel: 9, baseRosterId: 'r5', updatedAt: '' })), SCOPE_IDS);
	await noF.page.reload({ waitUntil: 'networkidle' });
	for (let i = 0; i < 2; i++) if (await noF.page.isVisible('#ui-notice')) await noF.page.click('[data-act="notice-ok"]');
	await noF.page.evaluate(() => selectStepTab(1));   // 段7d の ③（同上）
	await noF.page.waitForSelector('[data-usd-el="pt-need"]:not([hidden])');
	v = await readNeed(noF.page);
	const keep = await readScope(noF.page);
	assert(v.F === 5 && sameNeed(v, expectedNeed({ on: [], status: 'none', F: 5, ids: SCOPE_IDS, tiers: {} })) && keep.parentHintLevel === 9,
		'段5(2): 知らない値（9）は 5 として計算し、保存データは書き換えない', { F: v.F, kept: keep.parentHintLevel });
	await noF.ctx.close();

	/* ⑤ は段7（2026-10-03）で廃止: △の有効化と、除外中の自動の取り外しは無くなった（イベントの選択と②の「本育成編成」に置き換え。段7の塊が見る） */
	await sp.ctx.close();

	/* ③ 重なったスキルは1回だけ・L = min(5, 本育成の由来 + F)。因子セットは X6（本育成のイベント Lv2 の●）だけ */
	const roster0 = expectedNeed({ on: [], status: 'none', F: 5, ids: [], tiers: {} });
	const lvTotal = (sid, L) => Math.floor(baseOf.get(sid) * (100 - DISC[L - 1]) / 100);
	/* 段8・D（C-120）で、①で得るスキル（●でオン）は②の Pt と種に数えなくなった。それまでの「L = min(5, 本育成の由来 + F)」で
	   ②に親のぶんを足す検査（F 5／3／1）は成り立たないので、「X6 は②に数えず（①で取得）、F を替えても3つの累計は①だけのまま」に差し替えた */
	sp = await openSpecial({ scope: { skillIds: [x(6)], name: '', updatedAt: '' } });
	await sp.page.evaluate(() => selectStepTab(1));
	v = await readNeed(sp.page);
	const takenText = await sp.page.evaluate((id) => { const p = document.querySelector('#deck-template-panel .usd-panel[data-skill-id="' + id + '"]');
		return p ? { taken: p.classList.contains('usd-panel--taken'), pt: (p.querySelector('[data-usd-el="panel-pt"]') || {}).textContent || null } : null; }, x(6));
	assert(v.chips.every((c) => c.n === roster0.C) && roster0.levels[x(6)] === 2 && takenText && takenText.taken && takenText.pt === '①で取得',
		'段5(3)→段8(D): 本育成のイベント（Lv2）で得る X6 は②に数えない（3つの累計は①だけ・②の行は「①で取得」）', { got: v.chips.map((c) => c.n), rosterOnly: roster0.C, takenText });
	await sp.page.selectOption('[data-usd-el="pt-parent-level"]', '1');
	v = await readNeed(sp.page);
	assert(v.chips.every((c) => c.n === roster0.C) && lvTotal(x(6), 3) !== lvTotal(x(6), 5), '段5(3)→段8(D): F を替えても、①で得る X6 の Pt は変わらない（親のぶんを足さない）', { got: v.chips.map((c) => c.n), rosterOnly: roster0.C });
	await sp.ctx.close();

	/* ⑩ 本育成のスキルが0のとき、「うち本育成」の行が出ない（因子セットだけの合計）／両方空なら出ない */
	sp = await openSpecial({ roster: { umaId: '', cardIds: new Array(6).fill(null) } });
	v = await readNeed(sp.page);
	e = expectedNeed({ on: [], status: 'none', F: 5, ids: [], tiers: {} });
	const factorOnly = (cut) => UQ('none') + SCOPE_IDS.filter((sid) => (SCOPE_TIERS[sid] || 2) <= cut && baseOf.has(sid)).reduce((a, sid) => a + Math.floor(baseOf.get(sid) * 60 / 100), 0);
	assert(!v.hidden && v.roster === null && v.chips[0].n === factorOnly(1) && v.chips[1].n === factorOnly(2) && v.chips[2].n === factorOnly(3),
		'段5(10): 本育成のスキルが0のときは「うち本育成」の行が出ず、合計は因子セットだけのスキル（L=F=5）の Pt', { roster: v.roster, got: v.chips.map((c) => c && c.n) });
	await sp.ctx.close();
	sp = await openSpecial({ roster: { umaId: '', cardIds: new Array(6).fill(null) }, scope: { skillIds: [], name: '', updatedAt: '' } });
	v = await readNeed(sp.page);
	// 段8・D（C-120）: ②の先頭は「X Pt/N種」を常に出す（X ＝ 継承固有 ＋ ON のランクの Pt）。空のセットでも継承固有のぶんだけが出る
	// （それまでの「必要スキルPt を出さない」は、②の先頭が常に出るようになったので成り立たない）
	assert(!v.hidden && v.chips.every((c) => c && c.n === UQ('none')),
		'段5(10)→段9: 本育成も因子セットも空のときは、3つの累計（検査用の data-cuts）は継承固有のぶんだけ', v);
	await sp.ctx.close();

	/* ⑨ 読み込みの失敗 */
	sp = await openSpecial({ rulesFail: true });
	v = await readNeed(sp.page);
	const brokenRows = await sp.page.evaluate(() => document.querySelectorAll('#deck-roster-panel .usd-roster-grow').length);
	const failErrs = sp.errors.filter((m) => !/Failed to load resource|status of 500|404/.test(m));
	assert(!v.hidden && v.error === 'Pt のデータを読み込めませんでした' && v.chips.every((c) => c === null) && v.F === null && brokenRows > 3 && failErrs.length === 0,
		'段5(9): Pt のデータを読み込めなくても、パネルは壊れず（①の表は出る）、②に知らせが出て、必要Ptは出さない（例外なし）', { v, brokenRows, failErrs: failErrs.slice(0, 2) });
	await sp.ctx.close();

	/* ⑦ Deck 単体ページには出ない */
	const dk = await openPage(browser, base, 'uma-skill-deck.html');
	const dkReqs = []; dk.page.on('request', (r) => { if (/skill-pt|skill-step-up/.test(r.url())) dkReqs.push(r.url()); });
	await routes(dk.page, ptDoc);
	const dkv = await dk.page.evaluate(async ({ cardIds }) => {
		await window.UmaSkillDeckCore.loadTrainingSources(true);
		const host = document.createElement('div'); document.body.appendChild(host);
		localStorage.setItem('umaSkillDeck:draftRoster:dk', JSON.stringify({ umaId: '', cardIds: cardIds }));
		window.UmaSkillDeckCore.createRosterPanel(host, { draftKey: 'dk' });
		for (let i = 0; i < 40 && !host.querySelector('[data-usd-el="pt-sum"]'); i++) await new Promise((r) => setTimeout(r, 50));
		const el = document.querySelector('[data-usd-el="pt-need"]');
		return { has: !!el, hidden: el ? el.hidden : null, empty: el ? el.innerHTML === '' : null, select: !!document.querySelector('[data-usd-el="pt-parent-level"]'),
			tierRow: !!document.querySelector('[data-usd-el="tier-row"]') };
	}, { cardIds: cardIds });
	assert(dkv.hidden === true && dkv.empty === true && !dkv.select && dkv.tierRow,
		'段5(7): Deck 単体ページには、必要スキルPt も親由来のレベルの選択も出ない（編成パネルを置いても。分類の行は従来どおり出る）', dkv);
	await dk.ctx.close();
	const dk2 = await openPage(browser, base, 'uma-skill-deck.html');
	const dk2Reqs = []; dk2.page.on('request', (r) => { if (/skill-pt|skill-step-up/.test(r.url())) dk2Reqs.push(r.url()); });
	await dk2.page.reload({ waitUntil: 'networkidle' });
	assert(dk2Reqs.length === 0, '段5(7): Deck 単体ページの読み込みでは skill-pt.json を取りに行かない', dk2Reqs);
	await dk2.ctx.close();

	/* ⑬ 「うち本育成」の補足文: 本育成と因子セットの両方にあるスキルのうち、本育成の由来だけの L が 5 未満のものが1つ以上あるときだけ出る */
	/* 段8（C-120）で外した。①で得るスキルは②に数えなくなった（重なりが起きない）ので、重なるスキルの補足文（pt-need-overlap）と
	   それを入れていた説明の箱（pt-need-help-box）を無くした。(1)〜(6) は見張る対象が無い（①で取得の扱いは上の段5(3) と blocks-8.mjs の段8(D)） */

	/* ⑪ 幅 */
	for (const [w, h] of [[1280, 1000], [375, 900]]) {
		sp = await openSpecial({ w, h });
		await sp.page.evaluate(() => selectStepTab(1));
		const g = await sp.page.evaluate(() => {
			const el = document.querySelector('[data-usd-el="pt-need"]');
			const chips = Array.from(el.querySelectorAll('.usd-band-tag'));   // 段9: ランクのチップはタグ2つ［継承固有］［共通スキル］に置き換わった
			return { hidden: el.hidden, page: document.documentElement.scrollWidth - window.innerWidth, box: el.scrollWidth - el.clientWidth,
				tops: new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top))).size, chips: chips.length };
		});
		assert(!g.hidden && g.page <= 0 && g.box <= 0 && g.tops === 1 && g.chips === 2, '段5(11)→段7d の追加(A): ' + w + 'px の②タブで、必要スキルPt（継承固有と3つのチップは1行〔収まらないときはその行だけ横に送る〕・親由来のレベル）が、ページも箱も横にはみ出さない', g);
		const other = sp.errors.filter((m) => !/Failed to load resource|status of 404/.test(m));
		assert(other.length === 0, '段5(11): ' + w + 'px でコンソールエラーなし', other.slice(0, 3));
		await sp.ctx.close();
	}
}
});

/* ============================================================
 * 前段の必要Pt（段4b・2026-10-02。設計は skill-pt-calculation-step0.md の 2-3・2-4・2-5・0-S）
 *
 * 実データに依存しない。カードは実データから id だけ拾い、イベント・スキルPt・**前段データ**は仮のデータを取得の途中で差し替える
 * （スキルは、そのカードの練習ヒントに入っていないものを master から id で拾う。名前は書かない）。期待値はこの塊の中で整数だけで独立に計算する。
 *   仮の前段: ○→◎（Z0→Z1）／○→◎→金（Z3→Z2→Z4）／○→金（Z6→Z5。因子セット）／○→金（Z9→Z8。因子セット）／○→金が4組（Z14〜17→Z10〜13）
 *   ①  0-S の表（基礎90の○・基礎110の◎・L=0〜5 → 必要Pt 200・180・160・140・129・120）＝純粋関数で。◎を本育成にもつと、前段の○が○の L で出る
 *   ②  金を本育成にもつと、直前の◎・その前の○がさかのぼって全部出る（3段）。L は系列の根の L・金は金自身の L
 *   ③  前段が本育成の表にあるときは数えない（「（本育成）」の添え書き）
 *   ④  因子セットのスキルの前段が、その分類の合計から含まれる。重なる前段は1回だけ
 *   ⑤  前段の行が無いスキルは前段なし／前段が無いときは「前段として必要」「前段を含む合計」が出ない
 *   ⑥  前段データを読み込めないとき、前段を含めず知らせが出る
 *   ⑦  Pt が未収録の前段は合計に入れず、未収録の件数に含まれる
 *   ⑧  前段は除外の対象に入らない
 *   ⑨  「前段を含む合計」・「うち本育成」が前段を含む値に揃う
 *   ⑩  一覧は最大5つ（ほか N 種）・1280px と 375px で横にはみ出さない・コンソールエラー0件
 * ============================================================ */
await block('前段の必要Pt（段4b）', async () => {
{
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const cardsAll = readJson('data/support-cards.json').entries;
	const master = readJson('uma-skill-deck-skills.json').skills;
	const [cA, cB, cC, cD] = [cardsAll[0], cardsAll[1], cardsAll[2], cardsAll[3]];
	const hinted = new Set([cA, cB, cC, cD].flatMap((c) => (c.hintSkills || []).map((s) => s.skillId)));
	const pool = master.filter((s) => !hinted.has(s.id));
	const Z = pool.slice(0, 18).map((s) => ({ skillId: s.id, name: s.name }));
	const z = (i) => Z[i].skillId;
	const ref = (i, lv) => ({ skillId: Z[i].skillId, name: Z[i].name, hintLevel: lv });
	const evDoc = { dataVersion: '2026-10-02a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries: [
		{ cardId: cA.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(1, 2)] }] },     // ◎ Z1 ●（L=2）
			{ step: 2, choices: [{ skills: [ref(4, 1)] }] },     // 金 Z4 ●（L=1）
			{ step: 3, choices: [{ skills: [ref(7, 1)] }] }] },  // 前段の行の無い Z7 ●
		{ cardId: cB.id, status: 'done', chain: [{ step: 1, choices: [{ skills: [ref(3, 3)] }] }] },   // ○ Z3 ●（L=3）
		{ cardId: cD.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(10, 1)] }] }, { step: 2, choices: [{ skills: [ref(11, 1)] }] },
			{ step: 3, choices: [{ skills: [ref(12, 1)] }] }, { step: 4, choices: [{ skills: [ref(13, 1)] }] }] },
	] };
	// 仮の前段データ（行が無い＝前段の無い単独のスキル）
	const stepRows = [
		{ skillId: z(1), prevSkillIds: [z(0)], hintRootSkillId: z(0) },
		{ skillId: z(2), prevSkillIds: [z(3)], hintRootSkillId: z(3) },
		{ skillId: z(4), prevSkillIds: [z(2)] },
		{ skillId: z(5), prevSkillIds: [z(6)] },
		{ skillId: z(8), prevSkillIds: [z(9)] },
		{ skillId: z(10), prevSkillIds: [z(14)] }, { skillId: z(11), prevSkillIds: [z(15)] },
		{ skillId: z(12), prevSkillIds: [z(16)] }, { skillId: z(13), prevSkillIds: [z(17)] },
	];
	const stepDoc = { dataVersion: '2026-10-02a', category: 'skillStepUp', note: 'テスト用の仕込み', entries: stepRows };
	const BASE = { [z(0)]: 90, [z(1)]: 110, [z(2)]: 150, [z(3)]: 130, [z(4)]: 240, [z(5)]: 200, [z(6)]: 100, [z(7)]: 120, [z(8)]: 180, [z(9)]: 120,
		[z(10)]: 230, [z(11)]: 230, [z(12)]: 230, [z(13)]: 230, [z(14)]: 100, [z(15)]: 110, [z(16)]: 120, [z(17)]: 130 };
	const DISC = [10, 20, 30, 35, 40];
	const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const EMPTY_STEP = { dataVersion: '2026-10-02a', category: 'skillStepUp', note: 'テスト用の仕込み（前段なし）', entries: [] };

	const routes = async (page, o) => {
		o = o || {};
		await page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(evDoc) }));
		await page.route('**/data/character-event-skills.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8',
			body: JSON.stringify({ dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] }) }));
		const ptEntries = (o.ptBase || BASE);
		await page.route('**/data/skill-pt.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8',
			body: JSON.stringify({ dataVersion: '2026-10-02a', category: 'skillPt', note: 'テスト用の仕込み', entries: Object.keys(ptEntries).map((skillId) => ({ skillId, pt: ptEntries[skillId], rarity: 'white' })) }) }));
		await page.route('**/data/skill-step-up.json*', (route) => o.stepFail ? route.fulfill({ status: 500, body: 'error' })
			: route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(o.stepDoc || stepDoc) }));
	};

	/* 本育成の由来（sources）を先に求める（Deck 単体ページで）。名前も取る */
	const sourcesOf = async (cardIds) => {
		const first = await openPage(browser, base, 'uma-skill-deck.html');
		await routes(first.page);
		const f = await first.page.evaluate(async ({ cardIds }) => {
			const Core = window.UmaSkillDeckCore;
			await Core.loadTrainingSources(true);
			const r = Core.computeRosterSkills({ umaId: '', cardIds: cardIds });
			return { sources: r.sources.map((s) => ({ skillId: s.skillId, kind: s.kind, sure: s.sure, hintLevel: s.hintLevel, eventKey: s.eventKey })), names: Object.fromEntries(r.items.map((it) => [it.skillId, it.name])) };
		}, { cardIds });
		await first.ctx.close();
		return f;
	};

	/* ① 0-S の表（純粋関数。基礎90の○・基礎110の◎・状態なし）。◎の L は系列の根の○の L を援用する */
	{
		const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');
		const t = await page.evaluate(async () => {
			const C = window.UmaSkillDeckCore;
			const rules = await fetch('data/skill-pt-rules.json').then((r) => r.json());
			const idx = new Map([['o', { pt: 90, rarity: 'white' }], ['g', { pt: 110, rarity: 'white' }]]);
			const step = C.buildStepUpIndex({ entries: [{ skillId: 'g', prevSkillIds: ['o'], hintRootSkillId: 'o' }] });
			const out = [];
			// L=0（△を有効にしたがヒントレベルが無い）・1〜4（イベント）・5（練習のヒント）
			const run = (sources, enabled) => C.computeRosterPt({ sources, rules, skillPt: idx, stepUp: step, statusId: 'none', enabledSkillIds: enabled || [] });
			const r0 = run([{ skillId: 'g', kind: 'event', sure: false, hintLevel: null, eventKey: 'e' }], ['g']);
			out.push({ L: r0.items[0].hintLevel, own: r0.total, prev: r0.prevTotal, all: r0.totalWithPrev, prevIds: r0.prevItems.map((x) => x.skillId) });
			[1, 2, 3, 4].forEach((lv) => { const r = run([{ skillId: 'g', kind: 'event', sure: true, hintLevel: lv, eventKey: 'e' }]); out.push({ L: r.items[0].hintLevel, own: r.total, prev: r.prevTotal, all: r.totalWithPrev }); });
			const r5 = run([{ skillId: 'g', kind: 'hint', sure: true, hintLevel: null, eventKey: null }]); out.push({ L: r5.items[0].hintLevel, own: r5.total, prev: r5.prevTotal, all: r5.totalWithPrev });
			const none = C.computeRosterPt({ sources: [{ skillId: 'g', kind: 'hint', sure: true, hintLevel: null, eventKey: null }], rules, skillPt: idx, stepUp: null, statusId: 'none' });
			return { out, noStep: { total: none.total, prev: none.prevTotal, all: none.totalWithPrev, n: none.prevItems.length } };
		});
		assert(t.out.map((o) => o.L).join() === '0,1,2,3,4,5' && t.out.map((o) => o.all).join() === '200,180,160,140,129,120' && t.out.every((o) => o.all === o.own + o.prev),
			'段4b(1): 0-S の表（基礎90の○・基礎110の◎・L=0〜5）で、前段の○を含めた必要Ptが 200・180・160・140・129・120（◎と○は同じ L を共有。前段を含まない値 own と前段 prev の和）', t.out);
		const t3 = await page.evaluate(async () => {
			const C = window.UmaSkillDeckCore;
			const rules = await fetch('data/skill-pt-rules.json').then((r) => r.json());
			const idx = new Map([['o', { pt: 90, rarity: 'white' }], ['g', { pt: 110, rarity: 'white' }], ['k', { pt: 240, rarity: 'gold' }]]);
			const step = C.buildStepUpIndex({ entries: [{ skillId: 'g', prevSkillIds: ['o'], hintRootSkillId: 'o' }, { skillId: 'k', prevSkillIds: ['g'] }] });
			// 本育成: ○（o）が練習のヒント以外のイベントで L3・金（k）が L1。前段として必要なのは◎（g）だけ（○は本育成の表にある）
			const r = C.computeRosterPt({ sources: [{ skillId: 'o', kind: 'event', sure: true, hintLevel: 3, eventKey: 'e1' }, { skillId: 'k', kind: 'event', sure: true, hintLevel: 1, eventKey: 'e2' }],
				rules, skillPt: idx, stepUp: step, statusId: 'none' });
			return { prevIds: r.prevItems.map((x) => x.skillId), prevLevel: r.prevItems.map((x) => x.hintLevel), prevPt: r.prevTotal, chain: r.chains.map((c) => c.skillId + ':' + c.ancestors.map((a) => a.skillId + (a.inTable ? '*' : '')).join('>')) };
		});
		assert(t3.prevIds.join() === 'g' && t3.prevLevel.join() === '3' && t3.prevPt === Math.floor(110 * 70 / 100) && t3.chain.includes('k:o*>g'),
			'段4b(1): ◎（g）が前段になるとき、◎の Pt は系列の根の○の L（3）で計算される（110 の 30%引き = 77）。○は本育成の表にあるので前段に数えない（chains に印だけ残る）', t3);
		assert(t.out[0].prevIds.join() === 'o' && t.noStep.n === 0 && t.noStep.all === t.noStep.total,
			'段4b(1): 前段データが無い（stepUp なし）ときは、前段を含めず、合計は前段なしのまま', t.noStep);
		assert(errors.length === 0, '段4b(1): コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	}

	/* 独立の期待値。cards の由来（sources）・因子セット（ids・tiers・F）から、前段を含めた合計を整数だけで求める */
	const need = (sources, opt) => {
		opt = opt || {};
		const rows = new Map((opt.stepRows === undefined ? stepRows : opt.stepRows).map((r) => [r.skillId, r]));
		const base = opt.base || BASE;
		const rootOf = (id) => (rows.get(id) && rows.get(id).hintRootSkillId) || id;
		const tierOf = (id) => ((opt.tiers || {})[id]) || 2;
		const calc = (cut) => {
			const roster = new Set(sources.filter((s) => s.sure).map((s) => s.skillId));
			const factor = new Set((opt.ids || []).filter((id) => tierOf(id) <= cut));
			const included = new Set([...roster, ...factor]);
			const agg = new Map();
			included.forEach((id) => {
				const e = agg.get(rootOf(id)) || { P: false, ev: new Map(), F: 0 };
				sources.filter((s) => s.skillId === id && s.sure).forEach((s) => { if (s.kind === 'hint') e.P = true; else e.ev.set(s.eventKey, Math.max(e.ev.get(s.eventKey) || 0, s.hintLevel || 0)); });
				if (factor.has(id)) e.F = Math.max(e.F, opt.F || 5);
				agg.set(rootOf(id), e);
			});
			const L = (id) => { const e = agg.get(rootOf(id)); if (!e) return 0; return Math.min(5, (e.P ? 5 : 0) + Array.from(e.ev.values()).reduce((a, b) => a + b, 0) + e.F); };
			const ptOf = (id) => Math.floor(base[id] * (100 - (L(id) > 0 ? DISC[L(id) - 1] : 0)) / 100);
			let own = 0; let prev = 0; const prevIds = []; const unpriced = [];
			included.forEach((id) => { if (base[id] === undefined) unpriced.push(id); else own += ptOf(id); });
			const anc = (id) => { const out = []; const seen = new Set([id]); const walk = (x) => ((rows.get(x) || {}).prevSkillIds || []).forEach((p) => { if (seen.has(p)) return; seen.add(p); walk(p); out.push(p); }); walk(id); return out; };
			included.forEach((id) => anc(id).forEach((p) => { if (included.has(p) || prevIds.includes(p)) return; prevIds.push(p); if (base[p] === undefined) unpriced.push(p); else prev += ptOf(p); }));
			return { own, prev, all: own + prev, prevIds, unpriced: new Set(unpriced).size, inTable: (id) => included.has(id) };
		};
		const roster0 = calc(0);
		// 継承固有（段7d の ⑪。既定 6種・Lv3・状態なし）= 6 × floor(200 × 70 / 100) = 840 が3つの合計に足される
		return { roster: roster0, A: calc(1).all + 840, B: calc(2).all + 840, C: calc(3).all + 840, unpricedC: calc(3).unpriced, cut3: calc(3) };
	};

	const openSpecial = async (o) => {
		const cardIds4 = o.cards.concat(new Array(6 - o.cards.length).fill(null));
		const saved4 = { rosterId: 'r4b', name: '本育成', umaId: '', star: 0, awakeningLevel: 0, cardIds: cardIds4, createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z' };
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 1000 }, Object.assign({}, USER_DATA, { rosters: [saved4] }));
		await routes(sp.page, o);
		await sp.page.evaluate(({ roster, scope }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope));
		}, { roster: { umaId: '', cardIds: cardIds4 }, scope: Object.assign({ baseRosterId: 'r4b' }, o.scope || { skillIds: [], name: '', updatedAt: '' }) });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(() => selectStepTab(0));
		await sp.page.waitForSelector('#deck-roster-panel [data-usd-el="pt-sum"],#deck-roster-panel [data-usd-el="pt-error"]', { timeout: 10000 }).catch(() => {});
		return sp;
	};
	const readPanel = (page) => page.evaluate(() => {
		const h = document.getElementById('deck-roster-panel');
		const t = (i) => { const e = h.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent : null; };
		const n = (s) => (s === null ? null : Number(s.replace(/[^0-9]/g, '')));
		// 段7d の ②: 前段は「ヒントLv0：名前 Pt・名前 Pt／ヒントLv2：…」の1行。合計（pt-total）は前段を含む額。
		// ここでは従来の見方に直す: prevCount＝行の件数、prevTotal＝行の Pt の和、withPrev＝表示の合計、total＝前段を含めない合計（表示の合計 − prevTotal）
		const line = t('pt-prev');
		const entries = line ? line.split('／').flatMap((g) => g.replace(/^ヒントLv\d+：/, '').split('・')) : [];
		const prevTotal = entries.reduce((s, x) => s + (/ (\d+)$/.test(x) ? Number(/ (\d+)$/.exec(x)[1]) : 0), 0);
		const shown = n(t('pt-total'));
		return { total: shown - prevTotal, prevCount: line ? entries.length : null, prevTotal: line ? prevTotal : null, list: line, withPrev: line ? shown : null,
			hasPrevRow: !!line, hasWithPrev: !!line, unpriced: t('pt-unpriced'), prevError: t('pt-prev-error'), theory: h.querySelector('[data-usd-el="pt-help-btn"]') ? '理論値' : null };
	});
	const readNeed = (page) => page.evaluate(() => {
		const el = document.querySelector('[data-usd-el="pt-need"]');
		const num = (s) => Number((s || '').replace(/[^0-9]/g, ''));
		const t = (i) => { const e = el.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent : null; };
		const band = el.querySelector('[data-usd-el="set-head"]');   // 段9: 分類ごとの累計は帯の data-cuts（検査用）から読む
		const cuts = band ? JSON.parse(band.getAttribute('data-cuts')) : null;
		return { hidden: el.hidden, chips: [1, 2, 3].map((k) => (cuts ? cuts[k - 1].total : null)),
			roster: t('pt-need-roster'), unpriced: t('pt-need-unpriced'), prevError: t('pt-need-prev-error') };
	});

	/* ② 3段（○→◎→金）と ①の画面（◎の前段の○）。roster [cA]: ◎ Z1（L2）・金 Z4（L1）・Z7（前段なし） */
	const fA = await sourcesOf([cA.id]);
	let sp = await openSpecial({ cards: [cA.id] });
	let v = await readPanel(sp.page);
	let e = need(fA.sources);
	assert(e.roster.prevIds.length === 3 && v.prevCount === 3 && v.prevTotal === e.roster.prev && v.withPrev === e.roster.all && v.total === e.roster.own,
		'段4b(2): ◎を本育成にもつと前段の○が、金を本育成にもつと直前の◎・その前の○が、さかのぼって全部「前段として必要」に出る（3種）。Pt は期待値のとおり（○の L2 は系列の根の L・金は金自身の L1）', { got: [v.prevCount, v.prevTotal, v.withPrev, v.total], want: [3, e.roster.prev, e.roster.all, e.roster.own] });
	assert(v.hasPrevRow && v.hasWithPrev && v.withPrev === v.total + v.prevTotal && v.theory === '理論値',
		'段4b(9)→段7d(②): 前段は「ヒントLv0：名前 Pt」の1行で出て、合計の「X Pt/N種」は前段を含む額（本育成の合計 + 前段）。理論値の説明は合計の行の（?）にある', v);
	// 一覧に、各スキルの名前と Pt が出る（名前は実データのスキル名。Z0＝右下の○ など。連鎖は「→」）
	const nm = async (id) => sp.page.evaluate((id) => window.UmaSkillDeckCore.getSkillName(id), id);
	const n0 = await nm(z(0)); const n3 = await nm(z(3)); const n2 = await nm(z(2));
	assert(v.list.includes(n0) && v.list.includes(n3) && v.list.includes(n2) && v.list.startsWith('ヒントLv') && !v.list.includes(' → ') && !v.list.includes('（'),
		'段4b(2)→段7d(②): 1行に、前段のスキルの名前と Pt が並ぶ（ヒントレベルごとに「ヒントLv0：…」。連鎖の「→」と括弧は無い）', v.list);
	// ⑧→段7: 前段は②の「本育成編成」の対象（追加の一覧で選べなくするもの）に入らない。渡す id は●だけ
	// 段8（C-120）で①の名前の編集と②の「本育成編成」のボタン・小窓を無くした。②の相手は常に同じセットの①（ここでは＋新規の下書きの編成）なので、
	// 保存して選ぶ手順は要らない。②へ移ってそのまま見る
	await sp.page.evaluate(() => selectStepTab(1));
	await sp.page.waitForTimeout(250);
	const hidden = await sp.page.evaluate(() => window.UmaSkillDeckCore.getPickerHiddenIds());
	assert(hidden.length > 0 && hidden.includes(z(1)) && hidden.includes(z(4)) && ![z(0), z(2), z(3)].some((id) => hidden.includes(id)),
		'段4b(8)→段8: 同じセットの①があっても、前段（Z0・Z2・Z3）は選べなくする対象に入らない。本育成のスキル（Z1・Z4）は入る', { n: hidden.length });
	await sp.page.evaluate(() => selectStepTab(0));
	v = await readPanel(sp.page);
	assert(v.prevCount === 3, '段4b(8): ②へ移って戻っても「前段として必要」はそのまま', v.prevCount);
	await sp.ctx.close();

	/* ③ 前段が本育成の表にあるとき（Z3＝○が card B の●）: 数えず「（本育成）」 */
	const fAB = await sourcesOf([cA.id, cB.id]);
	sp = await openSpecial({ cards: [cA.id, cB.id] });
	v = await readPanel(sp.page);
	e = need(fAB.sources);
	const n3b = await sp.page.evaluate((id) => window.UmaSkillDeckCore.getSkillName(id), z(3));
	assert(e.roster.prevIds.join() === [z(0), z(2)].join() && e.roster.inTable(z(3)) && v.prevCount === 2 && v.prevTotal === e.roster.prev && v.withPrev === e.roster.all && v.total === e.roster.own,
		'段4b(3): 前段（Z3＝○）がほかの由来ですでに本育成の表にあるときは、前段として数えず（2種）、二重にならない。◎ Z2 は系列の根（Z3）の L3 で計算される', { got: [v.prevCount, v.prevTotal, v.withPrev], want: [2, e.roster.prev, e.roster.all] });
	assert(!v.list.includes(n3b) && !v.list.includes('（本育成）'), '段4b(3)→段7d(②): 本育成の表にあるスキル（Z3）は、前段の1行に出さない（「（本育成）」の添え書きはやめた。Pt は数えない）', v.list);
	await sp.ctx.close();

	/* ④ 因子セットの前段（roster [cA]。因子セット: Z3＝超優先・Z5＝優先（金。前段 Z6）・Z8＝通常（金。前段 Z9）。F 5） */
	const ids4 = [z(3), z(5), z(8)]; const tiers4 = { [z(3)]: 1, [z(8)]: 3 };
	sp = await openSpecial({ cards: [cA.id], scope: { skillIds: ids4, name: '', tiers: tiers4, updatedAt: '' } });
	await sp.page.evaluate(() => selectStepTab(1));
	v = await readNeed(sp.page);
	e = need(fA.sources, { ids: ids4, tiers: tiers4, F: 5 });
	const rp = await readPanel(sp.page);
	assert(v.chips[0] === e.A && v.chips[1] === e.B && v.chips[2] === e.C && e.A < e.B && e.B < e.C,
		'段4b(4): 因子セットのスキルの前段が、そのスキルの分類まで進んだ合計から含まれる（Z5 の前段 Z6 は「優先まで」から、Z8 の前段 Z9 は「通常まで」から）。3つの合計が期待値と一致する', { got: v.chips, want: [e.A, e.B, e.C] });
	assert(e.cut3.prevIds.filter((id) => id === z(3)).length === 0 && e.cut3.inTable(z(3)),
		'段4b(4): 本育成の金 Z4 の前段 Z3 は、因子セットにも入っている（重なる）ので1回だけ数える（前段としては数えず、F を足した L で計算される）', e.cut3.prevIds);
	assert(v.roster === null && rp.withPrev === need(fA.sources).roster.all,
		'段4b(9): 「うち本育成」は、本育成パネルの「前段を含む合計」と同じ値（前段が無いときは本育成の合計のまま）', { roster: v.roster, withPrev: rp.withPrev });
	await sp.ctx.close();

	/* ⑤ 前段の行が無いスキルだけ（card B の○ Z3。行が無い）→ 前段の行が出ない */
	const fB = await sourcesOf([cB.id]);
	sp = await openSpecial({ cards: [cB.id] });
	v = await readPanel(sp.page);
	e = need(fB.sources);
	assert(!v.hasPrevRow && !v.hasWithPrev && v.total === e.roster.own && e.roster.prevIds.length === 0,
		'段4b(5): 前段の行が無いスキルだけのときは、「前段として必要」も「前段を含む合計」も出ない', v);
	await sp.ctx.close();

	/* ⑥ 前段データを読み込めない → 前段を含めず、知らせが出る（段5 までの動き）。②のパネルにも */
	sp = await openSpecial({ cards: [cA.id], stepFail: true, scope: { skillIds: ids4, name: '', tiers: tiers4, updatedAt: '' } });
	v = await readPanel(sp.page);
	await sp.page.evaluate(() => selectStepTab(1));
	const vn = await readNeed(sp.page);
	// 段8・D（C-120）: ②の知らせは「?」の小窓の1行（factor-help-prev-error）へ移った
	await sp.page.click('#deck-template-panel [data-usd-act="pt-need-help"]');
	vn.prevError = await sp.page.evaluate(() => { const e = document.querySelector('[data-usd-el="factor-help-prev-error"]'); return e ? e.textContent : null; });
	await sp.page.keyboard.press('Escape');
	const eN = need(fA.sources, { ids: ids4, tiers: tiers4, F: 5, stepRows: [] });
	assert(!v.hasPrevRow && !v.hasWithPrev && v.prevError === '前段のデータを読み込めませんでした' && v.total === eN.roster.own
		&& vn.chips[0] === eN.A && vn.chips[1] === eN.B && vn.chips[2] === eN.C && vn.prevError === '前段のデータを読み込めませんでした',
		'段4b(6): 前段データを読み込めないときは、前段を含めず（段5 までの動き）、本育成パネルと因子セットのパネルに「前段のデータを読み込めませんでした」が出る', { v, vn, want: [eN.A, eN.B, eN.C] });
	const stepErr = sp.errors.filter((m) => !/Failed to load resource|status of 500|404/.test(m));
	assert(stepErr.length === 0, '段4b(6): 例外は出ない', stepErr.slice(0, 2));
	await sp.ctx.close();

	/* ⑦ Pt が未収録の前段（Z0 の行を外す） → 合計に入らず、未収録の件数に含まれる */
	const baseNo0 = Object.assign({}, BASE); delete baseNo0[z(0)];
	sp = await openSpecial({ cards: [cA.id], ptBase: baseNo0 });
	v = await readPanel(sp.page);
	// 未収録の件数は（?）の小窓の中（段7）
	await sp.page.click('#deck-roster-panel [data-usd-el="pt-help-btn"]');
	await sp.page.waitForTimeout(100);
	v.unpriced = await sp.page.evaluate(() => { const e = document.querySelector('[data-usd-el="info-pop"] [data-usd-el="info-unpriced"]'); return e ? e.textContent : null; });
	await sp.page.keyboard.press('Escape');
	e = need(fA.sources, { base: baseNo0 });
	const eFull = need(fA.sources);
	assert(v.prevCount === 3 && v.prevTotal === e.roster.prev && v.withPrev === e.roster.all && e.roster.prev < eFull.roster.prev
		&& e.roster.unpriced === eFull.roster.unpriced + 1 && v.unpriced === '（Pt未収録' + e.roster.unpriced + '種は含めていません）' && v.list.includes(n0 + ' Pt未収録'),
		'段4b(7): Pt が未収録の前段（Z0）は合計に入れず、「Pt 未収録」と一覧に出て、未収録の件数に含まれる（本育成の未収録と重複を除いて合算。Z0 を未収録にすると件数が1つ増える）', { v, want: [e.roster.prev, e.roster.all, e.roster.unpriced] });
	await sp.ctx.close();

	/* ⑩ 一覧は最大5つ（残りは「ほか N 種」）。roster [cA, cD]: 前段 3 + 4 = 7種 → 5つ + ほか 2種。1280px と 375px */
	const fAD = await sourcesOf([cA.id, cD.id]);
	for (const [w, h] of [[1280, 1000], [375, 900]]) {
		sp = await openSpecial({ cards: [cA.id, cD.id], w, h });
		v = await readPanel(sp.page);
		e = need(fAD.sources);
		const g = await sp.page.evaluate(() => {
			const host = document.getElementById('deck-roster-panel');
			const p = host.querySelector('[data-usd-el="pt-prev"]');   // 前段の1行（段7d の ②）は、長いときその行だけ横に送るので、行そのものの横幅は測らない
			const sum = host.querySelector('[data-usd-el="pt-sum"]');
			return { page: document.documentElement.scrollWidth - window.innerWidth, list: 0, prev: p.getBoundingClientRect().right - host.getBoundingClientRect().right, sum: sum.scrollWidth - sum.clientWidth };
		});
		assert(e.roster.prevIds.length === 7 && v.prevCount === 7 && v.withPrev === e.roster.all && g.page <= 0 && g.list <= 0 && g.prev <= 0 && g.sum <= 0,
			'段4b(10)→段7d: ' + w + 'px で、前段が7種あるとき、7種とも1行に並び（長いときはその行だけ横に送る）、横にはみ出さない', { v: v.list, g });
		const other = sp.errors.filter((m) => !/Failed to load resource|status of 404/.test(m));
		assert(other.length === 0, '段4b(10): ' + w + 'px でコンソールエラーなし', other.slice(0, 3));
		await sp.ctx.close();
	}
}
});

/* ============================================================
 * スキルの説明（ⓘ と名前の長押し。段6・2026-10-02。設計は skill-pt-calculation-step0.md の 2-6・2-9・2-10）
 * 【段7（2026-10-03）で書き直した】①の本育成パネルの表では、ⓘ をやめて**名前（button）を押すと開く**形になり、長押しも外した。
 * 「◎と共有」「○のレベル」の行の注記は、小窓の系列の欄だけに出す。②の周回因子セットの行は ⓘ と長押しのまま。
 *
 * 実際の special.html。実データに依存しない: カードは実データから id だけ拾い、イベント・スキルPt・前段・説明文は仮のデータ
 * （スキルは、そのカードの練習ヒントに入っていないものを master から id で拾う。名前は書かない＝名前は master から読む）。
 * 期待値はこの塊の中で、整数だけで独立に計算する（割引率 10・20・30・35・40 を直に書く）。
 *   仮のイベント: カードA … X0（Lv2）・X1（Lv1）・X6（Lv1）・X3（Lv3）・X4（Lv1）・X5（Lv1）が確定、X2（Lv1）／X7（Lv1）の2択（△）
 *                 カードB … Y1（Lv2）が確定
 *   仮の前段: X1 は X0 の次（ヒントレベルは X0 のもの）、X6（金）は X1 の次、Y1 は Y0 の次（Y0 は編成に居ない）
 *   仮の Pt: X3 は pt:0（固有）、X4 は行なし（未収録）、ほかは 100〜200。仮の説明文: X5・Y 以外にある。X0 のものは HTML の記号と改行を含む
 *   ①  名前を押すと名前・レアリティ・説明文・基礎Pt・（本育成の行では）いまの設定が出る。周回因子セットの行（ⓘ）では基礎Pt だけ
 *   ②  周回因子セットの行では名前の長押し（0.5秒）でも開く。本育成の表の名前は押せば開く（button）
 *   ③  Escape で閉じ、フォーカスが戻る。Enter／Space で開く。aria-expanded が開閉で変わる
 *   ④  Pt 不要・Pt 未収録・説明文が無い
 *   ⑤  系列と「Lv は …のものです」。○と◎が同じパネルにあるときだけ、小窓の系列の欄に注記（行には出ない）
 *   ⑥  説明文の読み込みは最初に開いたときだけ1回。失敗しても基礎Pt が出て「説明文は準備中です」
 *   ⑦  説明文の HTML の記号はそのまま文字として見える
 *   ⑧  シナリオ因子・遺伝子には出ない。Deck 単体・exam・index・card-event-input には ⓘ も説明文の読み込みも出ない
 *   ⑨  375px はボトムシート・1280px も、はみ出さない・コンソールエラー0件
 * ============================================================ */
await block('スキルの説明（ⓘ・長押し。段6）', async () => {
{
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const cardsAll = readJson('data/support-cards.json').entries;
	const master = readJson('uma-skill-deck-skills.json').skills;
	const nameOf = new Map(master.map((s) => [s.id, s.name]));
	const [cA, cB] = [cardsAll[0], cardsAll[1]];
	const hinted = new Set([cA, cB].flatMap((c) => (c.hintSkills || []).map((s) => s.skillId)));
	const pool = master.filter((s) => !hinted.has(s.id));
	const X = pool.slice(0, 8).map((s) => s.id);
	const Y = pool.slice(8, 10).map((s) => s.id);
	const ref = (id, lv) => ({ skillId: id, name: nameOf.get(id), hintLevel: lv });
	const evDoc = { dataVersion: '2026-10-02a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries: [
		{ cardId: cA.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(X[0], 2)] }] },
			{ step: 2, choices: [{ skills: [ref(X[1], 1)] }] },
			{ step: 3, choices: [{ skills: [ref(X[6], 1)] }] },
			// 2択で両方にスキルがある → 既定では未選択（△）。段7で「空の選択肢」から変えた（空だと自動で選ばれて●になるため）
			{ step: 4, choices: [{ skills: [ref(X[2], 1)] }, { skills: [ref(X[7], 1)] }] },
			{ step: 5, choices: [{ skills: [ref(X[3], 3)] }] },
			{ step: 6, choices: [{ skills: [ref(X[4], 1)] }] },
			{ step: 7, choices: [{ skills: [ref(X[5], 1)] }] }] },
		{ cardId: cB.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(Y[1], 2)] }] }] },
	] };
	const BASE_PT = { [X[0]]: 100, [X[1]]: 120, [X[2]]: 140, [X[3]]: 0, [X[5]]: 150, [X[6]]: 200, [X[7]]: 160, [Y[0]]: 90, [Y[1]]: 130 };
	const RARITY = { [X[3]]: 'unique', [X[6]]: 'gold' };
	const RARITY_LABEL = { white: '白スキル', gold: '金スキル', unique: '固有スキル', evolved: '進化スキル' };
	const rarityOf = (id) => RARITY[id] || 'white';
	const ptDoc = { dataVersion: '2026-10-02a', category: 'skillPt', note: 'テスト用の仕込み',
		entries: Object.entries(BASE_PT).map(([skillId, pt]) => ({ skillId, pt, rarity: rarityOf(skillId) })) };
	const stepDoc = { dataVersion: '2026-10-02b', category: 'skillStepUp', note: 'テスト用の仕込み', entries: [
		{ skillId: X[1], prevSkillIds: [X[0]], hintRootSkillId: X[0] },
		{ skillId: X[6], prevSkillIds: [X[1]] },
		{ skillId: Y[1], prevSkillIds: [Y[0]], hintRootSkillId: Y[0] }] };
	const HTML_TEXT = 'テスト<b>太字</b> & <script>x</script>\n二行目';
	const descText = (id) => id === X[0] ? HTML_TEXT : '説明 ' + id;
	const descDoc = { dataVersion: '2026-10-02a', category: 'skillDescription', note: 'テスト用の仕込み',
		entries: [X[0], X[1], X[2], X[3], X[4], X[6], X[7], Y[0]].map((skillId) => ({ skillId, text: descText(skillId) })) };
	const DISC = [10, 20, 30, 35, 40];
	const payPt = (base, L) => Math.floor(base * (100 - (L > 0 ? DISC[L - 1] : 0)) / 100);
	// X0 と X1 は系列を共有する: ヒントレベルは X0 に集まる（X0 の Lv2 ＋ X1 の Lv1 ＝ 3）。X6（金）は自分の由来だけ（Lv1）
	const L_X0 = Math.min(5, 2 + 1);
	const NOW = { [X[0]]: 'いまの設定：' + payPt(100, L_X0) + ' Pt（Lv' + L_X0 + '）', [X[1]]: 'いまの設定：' + payPt(120, L_X0) + ' Pt（Lv' + L_X0 + '）',
		[X[6]]: 'いまの設定：' + payPt(200, 1) + ' Pt（Lv1）' };
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });

	const open = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 });
		const descReqs = [];
		sp.page.on('request', (r) => { if (r.url().includes('skill-descriptions.json')) descReqs.push(r.url()); });
		await sp.page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill(json(evDoc)));
		await sp.page.route('**/data/character-event-skills.json*', (route) => route.fulfill(json({ dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] })));
		await sp.page.route('**/data/skill-pt.json*', (route) => route.fulfill(json(ptDoc)));
		await sp.page.route('**/data/skill-step-up.json*', (route) => route.fulfill(json(stepDoc)));
		if (o.descFail) await sp.page.route('**/data/skill-descriptions.json*', (route) => route.fulfill({ status: 500, body: 'error' }));
		else await sp.page.route('**/data/skill-descriptions.json*', (route) => route.fulfill(json(descDoc)));
		await sp.page.evaluate(({ roster, scope }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope));
		}, { roster: { umaId: '', cardIds: [o.card || cA.id, null, null, null, null, null] }, scope: { skillIds: [X[7], X[3]], name: '', tiers: {}, updatedAt: '' } });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(() => { selectStepTab(0); document.body.style.paddingBottom = '2400px'; });
		await sp.page.waitForSelector('#deck-roster-panel [data-usd-el="pt-sum"]', { timeout: 10000 });
		sp.descReqs = descReqs;
		return sp;
	};
	const btnSel = (id) => '[data-usd-el="skill-info-btn"][data-skill-id="' + id + '"]';
	const rosterBtn = (id) => '#deck-roster-panel ' + btnSel(id);
	const read = (page) => page.evaluate(() => {
		const pop = document.querySelector('[data-usd-el="info-pop"]');
		if (!pop) return { exists: false, open: false };
		const t = (s) => { const e = pop.querySelector('[data-usd-el="' + s + '"]'); return e ? e.textContent : null; };
		const d = pop.querySelector('[data-usd-el="info-desc"]');
		const r = pop.getBoundingClientRect();
		const order = Array.from(pop.querySelectorAll('[data-usd-el]')).map((e) => e.getAttribute('data-usd-el')).filter((n) => n.startsWith('info-') && n !== 'info-pop' && n !== 'info-body' && n !== 'info-close');
		return { exists: true, open: !pop.hidden, title: pop.querySelector('.uma-popover-title').textContent, rarity: t('info-rarity'), desc: d ? d.textContent : null,
			descHasChildEl: d ? d.children.length : null, pt: t('info-pt'), now: t('info-pt-now'), series: t('info-series'), root: t('info-root'), share: t('info-share'), order,
			active: document.activeElement ? (document.activeElement.getAttribute('data-usd-el') || document.activeElement.tagName) + ':' + (document.activeElement.getAttribute('data-skill-id') || '') : '',
			rect: { l: r.left, r: r.right, t: r.top, b: r.bottom }, vw: window.innerWidth, vh: window.innerHeight, hscroll: document.documentElement.scrollWidth - window.innerWidth };
	});
	const press = async (page, sel, o) => {
		await page.locator(sel).scrollIntoViewIfNeeded();
		await page.waitForTimeout(350);
		const box = await page.locator(sel).boundingBox();
		assert(box.y >= 0 && box.y + box.height <= page.viewportSize().height, '段6(2): 押す場所（' + sel.slice(-24) + '）は画面の中にある（検査が空振りでない）', box);
		const x = box.x + 2, y = box.y + box.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		if (o.move) await page.mouse.move(x + o.move, y, { steps: 3 });
		if (o.scroll) await page.evaluate(() => window.scrollBy(0, 40));
		if (o.scrollEvent) await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
		await page.waitForTimeout(o.hold);
		await page.mouse.up();
		await page.waitForTimeout(o.after === undefined ? 350 : o.after);
	};
	const closeIt = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(80); };
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));

	/* ① 名前を押すと出る内容（本育成の行） ／ ⑦ HTML の記号 ／ ⑥ 読み込みは最初に開いたとき1回 */
	let sp = await open();
	assert(sp.descReqs.length === 0, '段6(6): ページの読み込みでは説明文を取りに行かない（名前を押す前）', sp.descReqs);
	const btnCount = await sp.page.$$eval('#deck-roster-panel [data-usd-el="skill-info-btn"]', (bs) => bs.length);
	const nameCount = await sp.page.$$eval('#deck-roster-panel .usd-roster-grow[data-skill-id]', (bs) => bs.length);
	assert(btnCount > 0 && btnCount === nameCount, '段6(1)→段7: 本育成の表のスキルの名前そのものが押せる（行の数と同じ。ⓘ の別ボタンは無い。空振りでない）', { btnCount, nameCount });
	const labelOk = await sp.page.evaluate((id) => { const b = document.querySelector('#deck-roster-panel [data-usd-el="skill-info-btn"][data-skill-id="' + id + '"]'); return b ? { label: b.getAttribute('aria-label'), tag: b.tagName, type: b.type, exp: b.getAttribute('aria-expanded'), underline: getComputedStyle(b).textDecorationLine, isName: b.classList.contains('usd-roster-skillname'), extra: document.querySelectorAll('#deck-roster-panel .usd-info-btn').length } : null; }, X[0]);
	assert(labelOk && labelOk.label === nameOf.get(X[0]) + 'の説明を開く' && labelOk.tag === 'BUTTON' && labelOk.exp === 'false' && labelOk.underline.includes('underline') && labelOk.isName && labelOk.extra === 1,
		'段6(3)→段7(14): 名前は button で下線が付き、aria-label は「{スキル名}の説明を開く」・閉じているときの aria-expanded は false。①の表に ⓘ は無い（（i）は育成ウマ娘の1つだけ）', labelOk);
	await sp.page.click(rosterBtn(X[0]));
	await sp.page.waitForFunction(() => { const e = document.querySelector('[data-usd-el="info-desc"]'); return e && !/読み込み中/.test(e.textContent); });
	let v = await read(sp.page);
	assert(v.open && v.title === nameOf.get(X[0]) && v.rarity === RARITY_LABEL.white && v.desc === descText(X[0]) && v.pt === '基礎 100 Pt' && v.now === NOW[X[0]],
		'段6(1): 名前を押すと、名前・レアリティの表示名・説明文・基礎Pt・いまの設定（全角の「：」）が出る（本育成の行）', { v, want: { now: NOW[X[0]] } });
	assert(v.order.join('|').startsWith('info-rarity|info-desc|info-pt|info-pt-now'), '段6(1): 並びは 名前（見出し）→レアリティ→説明文→基礎Pt→いまの設定→系列', v.order);
	assert(v.descHasChildEl === 0 && v.desc.includes('<b>太字</b>') && v.desc.includes('<script>x</script>') && v.desc.includes('&') && v.desc.includes('\n'),
		'段6(7): 説明文の < > & はそのまま文字として見える（HTML として解釈されない）。改行も残る', { has: v.descHasChildEl, desc: v.desc });
	const wrap = await sp.page.evaluate(() => getComputedStyle(document.querySelector('[data-usd-el="info-desc"]')).whiteSpace);
	assert(wrap === 'pre-line', '段6(1): 説明文の改行（\\n）は改行として見せる（white-space: pre-line）', wrap);
	// 版は直書きしない（2026-10-05・C-128 で説明文の版が上がって落ちた）。正本は data/skill-descriptions.json の dataVersion
	const descVer = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/skill-descriptions.json'), 'utf8')).dataVersion;
	assert(sp.descReqs.length === 1 && sp.descReqs[0].includes('v=' + descVer), '段6(6): 説明文の読み込みは最初に開いたときの1回で、?v=<版> が付く', { reqs: sp.descReqs, descVer });
	await closeIt(sp.page);
	await sp.page.click(rosterBtn(X[1]));
	await sp.page.waitForTimeout(150);
	v = await read(sp.page);
	assert(v.open && v.desc === descText(X[1]) && sp.descReqs.length === 1, '段6(6): 2つ目を開いても説明文は読み直さない（まだ1回）', { desc: v.desc, reqs: sp.descReqs.length });
	await closeIt(sp.page);

	/* ③ Escape・フォーカス・aria-expanded・Enter／Space */
	await sp.page.focus(rosterBtn(X[0]));
	await sp.page.keyboard.press('Enter');
	await sp.page.waitForTimeout(100);
	v = await read(sp.page);
	let ex = await sp.page.getAttribute(rosterBtn(X[0]), 'aria-expanded');
	assert(v.open && ex === 'true', '段6(3): 名前に Enter で開き、aria-expanded が true になる', { open: v.open, ex });
	await sp.page.keyboard.press('Escape');
	await sp.page.waitForTimeout(100);
	v = await read(sp.page);
	ex = await sp.page.getAttribute(rosterBtn(X[0]), 'aria-expanded');
	assert(!v.open && ex === 'false' && v.active === 'skill-info-btn:' + X[0], '段6(3): Escape で閉じ、aria-expanded が false に戻り、開いたきっかけの名前にフォーカスが戻る', { open: v.open, ex, active: v.active });
	await sp.page.keyboard.press('Space');
	await sp.page.waitForTimeout(100);
	v = await read(sp.page);
	assert(v.open, '段6(3): 名前に Space でも開く', v.open);
	await sp.page.click('[data-usd-el="info-close"]');
	await sp.page.waitForTimeout(100);
	v = await read(sp.page);
	assert(!v.open && v.active === 'skill-info-btn:' + X[0], '段6(3): 閉じるボタンでも閉じ、フォーカスが戻る', v.active);

	/* ④ Pt 不要・Pt 未収録・説明文なし ／ ⑤ 系列 */
	const cases = [];
	for (const id of [X[3], X[4], X[5], X[1], X[0], X[6], X[2]]) {
		await sp.page.click(rosterBtn(id));
		await sp.page.waitForTimeout(120);
		cases.push(Object.assign({ id }, await read(sp.page)));
		await closeIt(sp.page);
	}
	const by = (id) => cases.find((c) => c.id === id);
	assert(by(X[3]).pt === 'Pt 不要' && by(X[3]).rarity === RARITY_LABEL.unique && by(X[3]).now === null && by(X[3]).desc === descText(X[3]),
		'段6(4): pt が 0 のスキルは「Pt 不要」（レアリティは固有スキル。いまの設定の行は出ない）', by(X[3]));
	assert(by(X[4]).pt === 'Pt 未収録' && by(X[4]).rarity === null && by(X[4]).now === null,
		'段6(4): Pt が未収録のスキルは「Pt 未収録」（行が無いのでレアリティも出さない）', by(X[4]));
	assert(by(X[5]).desc === null && by(X[5]).pt === '基礎 150 Pt' && by(X[5]).open === true,
		'段6(4): 説明文の行が無いスキルは説明文の欄が出ない（基礎Pt は出る）', by(X[5]));
	assert(by(X[3]).series === null && by(X[3]).root === null && by(X[5]).series === null, '段6(5): 系列に関係が無いスキルには「系列：」も「Lv は」も出ない', { a: by(X[3]).series, b: by(X[5]).series });
	const chain = [X[0], X[1], X[6]].map((i) => nameOf.get(i)).join(' → ');
	assert(by(X[0]).series === '系列：' + chain && by(X[0]).root === null && by(X[0]).share === '◎と共有', '段6(5)→段7: ○（持ち主）は「系列：○ → ◎ → 金」で、「Lv は」は出ず、同じ表に◎が居るので系列の欄に「◎と共有」', { s: by(X[0]).series, r: by(X[0]).root, share: by(X[0]).share });
	assert(by(X[1]).series === '系列：' + chain && by(X[1]).root === 'Lv は ' + nameOf.get(X[0]) + ' のものです' && by(X[1]).share === '○のレベル', '段6(5)→段7: ◎は同じ系列と、「Lv は {持ち主の名前} のものです」と、同じ表に○が居るので「○のレベル」が系列の欄に出る', { s: by(X[1]).series, r: by(X[1]).root, share: by(X[1]).share });
	assert(by(X[6]).series === '系列：' + chain && by(X[6]).root === null && by(X[6]).share === null && by(X[6]).rarity === RARITY_LABEL.gold && by(X[6]).now === NOW[X[6]],
		'段6(5): 金は系列を前段までさかのぼって出し、持ち主は自分自身なので「Lv は」も注記も出ない（金スキル・自分のレベルのいまの設定）', by(X[6]));
	const strong = await sp.page.evaluate(async (id) => { document.querySelector('#deck-roster-panel [data-usd-el="skill-info-btn"][data-skill-id="' + id + '"]').click(); await new Promise((r) => setTimeout(r, 120));
		const s = document.querySelector('[data-usd-el="info-series"] strong'); const t = s ? s.textContent : null; document.querySelector('[data-usd-el="info-close"]').click(); return t; }, X[1]);
	assert(strong === nameOf.get(X[1]), '段6(5): 系列の中の、このスキルの位置に印（強調）が付く', strong);
	const refRow = by(X[2]);
	assert(refRow.now === 'このイベントで選ぶと：' + payPt(140, 1) + ' Pt（Lv1）' && refRow.pt === '基礎 140 Pt', '段6(1)→段7(14): △の行は「このイベントで選ぶと：P Pt（LvL）」を添える', refRow);
	// 行には注記が出ない（段7）
	const rowNotes = await sp.page.evaluate(() => document.querySelectorAll('#deck-roster-panel [data-usd-el="share-note"]').length);
	assert(rowNotes === 0, '段6(5)→段7: 行には「◎と共有」「○のレベル」の注記を出さない（小窓の系列の欄だけ）', rowNotes);
	await sp.ctx.close();

	/* ⑤ ◎だけが居る編成（持ち主の○は居ない）では注記が出ない ／ ⑧ 周回因子セットの行（ⓘ と長押しのまま） */
	sp = await open({ card: cB.id });
	await sp.page.click(rosterBtn(Y[1]));
	await sp.page.waitForTimeout(120);
	v = await read(sp.page);
	assert(v.root === 'Lv は ' + nameOf.get(Y[0]) + ' のものです' && v.series === '系列：' + nameOf.get(Y[0]) + ' → ' + nameOf.get(Y[1]) && v.share === null,
		'段6(5): 相手（持ち主の○）が同じ表に居ないときは注記を出さないが、系列と「Lv は …」は出る', { s: v.series, r: v.root, share: v.share });
	await closeIt(sp.page);
	await sp.page.evaluate(() => selectStepTab(1));
	await sp.page.waitForSelector('.usd-panel[data-skill-id="' + X[7] + '"]');
	// 段7d の ⑬：②の行も①と同じく、名前（button）を押すと開く。ⓘ と長押しはやめた（以前はここで ⓘ・長押し・取り消し・user-select を見ていた）
	const panelBtns = await sp.page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('.usd-panel[data-skill-id]'));
		return { rows: rows.length, withName: rows.filter((r) => r.querySelector('button.usd-panel-namebtn[data-usd-el="skill-info-btn"][data-skill-id]')).length,
			withInfoBtn: rows.filter((r) => r.querySelector('.usd-info-btn')).length,
			stray: Array.from(document.querySelectorAll('[data-usd-el="skill-info-btn"]')).filter((b) => !b.closest('.usd-panel') && !b.closest('#deck-roster-panel')).length };
	});
	assert(panelBtns.rows === 2 && panelBtns.withName === 2 && panelBtns.withInfoBtn === 0 && panelBtns.stray === 0, '段6(1)(8)→段7d(⑬): 周回因子セットの各スキルの行は、名前（button）を押して開く（行の数と同じ）。ⓘ は付かない。それ以外の場所には付かない', panelBtns);
	await sp.page.click('.usd-panel[data-skill-id="' + X[7] + '"] button.usd-panel-namebtn');
	await sp.page.waitForTimeout(150);
	v = await read(sp.page);
	assert(v.open && v.title === nameOf.get(X[7]) && v.rarity === RARITY_LABEL.white && v.desc === descText(X[7]) && v.pt === '基礎 160 Pt' && v.now === null,
		'段6(1): 周回因子セットの行では、名前・レアリティ・説明文・基礎Pt だけが出る（いまの設定は出ない）', v);
	await closeIt(sp.page);
	// 長押しでは開かない（押している間は閉じたまま。離したときのクリックで開く）
	await sp.page.locator('.usd-panel[data-skill-id="' + X[7] + '"] button.usd-panel-namebtn').scrollIntoViewIfNeeded();
	const nb = await sp.page.locator('.usd-panel[data-skill-id="' + X[7] + '"] button.usd-panel-namebtn').boundingBox();
	await sp.page.mouse.move(nb.x + 2, nb.y + nb.height / 2);
	await sp.page.mouse.down();
	await sp.page.waitForTimeout(800);
	v = await read(sp.page);
	assert(!v.open, '段7d(⑬): 名前を押し続けても（0.8秒）、押している間は開かない（長押しはやめた）', v.open);
	await sp.page.mouse.up();
	await sp.page.waitForTimeout(150);
	await closeIt(sp.page);
	const sections = await sp.page.evaluate(() => {
		const sec = Array.from(document.querySelectorAll('[data-usd-scope-section]'));
		return { n: sec.length, keys: sec.map((e) => e.getAttribute('data-usd-scope-section')), btns: sec.reduce((a, e) => a + e.querySelectorAll('[data-usd-el="skill-info-btn"],[data-usd-info]').length, 0) };
	});
	assert(sections.n >= 2 && sections.btns === 0, '段6(8): シナリオ因子・遺伝子の節（' + sections.n + '個。空振りでない）には ⓘ も長押しの対象も無い', sections);
	const lists = [];
	// 段8（C-120）でシナリオ因子／遺伝子のチェックと「?」を③の先頭の1行へ移したので、③のタブを開いてから押す
	await sp.page.evaluate(() => selectStepTab(2, { noSave: true }));
	await sp.page.waitForTimeout(200);
	for (const key of sections.keys) {
		await sp.page.click('[data-usd-act="scope-help"][data-scope="' + key + '"]');
		await sp.page.waitForTimeout(150);
		lists.push(await sp.page.evaluate(() => { const m = Array.from(document.querySelectorAll('.usd-roster-modal')).filter((e) => !e.hidden)[0];
			return m ? { text: m.textContent.length, btns: m.querySelectorAll('[data-usd-el="skill-info-btn"],[data-usd-info]').length } : null; }));
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(100);
	}
	assert(lists.length >= 2 && lists.every((l) => l && l.text > 0 && l.btns === 0), '段6(8): 「?」で開くシナリオ因子・遺伝子の一覧（名前が並んでいる）にも、ⓘ も長押しの対象も無い', lists);
	await sp.ctx.close();

	/* ⑥ 読み込みの失敗 */
	sp = await open({ descFail: true });
	await sp.page.click(rosterBtn(X[0]));
	await sp.page.waitForFunction(() => { const e = document.querySelector('[data-usd-el="info-desc"]'); return e && !/読み込み中/.test(e.textContent); });
	v = await read(sp.page);
	assert(v.open && v.desc === '説明文は準備中です' && v.pt === '基礎 100 Pt' && v.now === NOW[X[0]] && v.rarity === RARITY_LABEL.white && v.title === nameOf.get(X[0]),
		'段6(6): 説明文を読み込めなくても開いて、名前・レアリティ・基礎Pt・いまの設定を出し、説明文の欄に「説明文は準備中です」を出す', v);
	assert(jsErrors(sp.errors).length === 0, '段6(6): 読み込みに失敗してもコンソールに例外は出ない', jsErrors(sp.errors).slice(0, 3));
	await sp.ctx.close();

	/* ⑨ 画面の幅 */
	for (const [w, h] of [[1280, 900], [375, 700]]) {
		sp = await open({ w, h });
		await sp.page.click(rosterBtn(X[1]));
		await sp.page.waitForFunction(() => { const e = document.querySelector('[data-usd-el="info-desc"]'); return e && !/読み込み中/.test(e.textContent); });
		v = await read(sp.page);
		const geo = await sp.page.evaluate(() => { const r = document.querySelector('[data-usd-el="info-pop"]').getBoundingClientRect(); const bs = document.querySelector('[data-usd-el="info-body"]'); return { bottomGap: window.innerHeight - r.bottom, width: r.width, vw: window.innerWidth, bodyOver: bs.scrollWidth - bs.clientWidth }; });
		const inView = v.rect.l >= -0.5 && v.rect.r <= v.vw + 0.5 && v.rect.t >= -0.5 && v.rect.b <= v.vh + 0.5;
		if (w <= 640) assert(Math.abs(geo.bottomGap) <= 1.5 && Math.abs(geo.width - geo.vw) <= 1.5, '段6(9): ' + w + 'px では下端に固定されたボトムシートで開く', geo);
		else assert(geo.bottomGap > 1.5 && geo.width <= 381, '段6(9): ' + w + 'px では中央のポップオーバーで開く（幅 380px まで）', geo);
		assert(inView && v.hscroll <= 0 && geo.bodyOver <= 0, '段6(9): ' + w + 'px で、説明は画面に収まり、横にはみ出さない', { rect: v.rect, hscroll: v.hscroll, bodyOver: geo.bodyOver });
		await closeIt(sp.page);
		const row = await sp.page.evaluate((id) => { const n = document.querySelector('#deck-roster-panel [data-usd-el="skill-info-btn"][data-skill-id="' + id + '"]'); const cell = n.closest('.usd-roster-namescroll'); const pt = cell.querySelector('.usd-roster-pt'); const a = n.getBoundingClientRect(); const c = pt.getBoundingClientRect();
			return { inCell: !!cell, sameLine: Math.abs((a.top + a.bottom) / 2 - (c.top + c.bottom) / 2) < 8, right: c.left >= a.right - 1, page: document.documentElement.scrollWidth - window.innerWidth }; }, X[0]);
		assert(row.inCell && row.sameLine && row.right && row.page <= 0, '段6(9)→段7(14): ' + w + 'px で、名前と Pt は同じ1行（名前の右に Pt）で、ページが横にはみ出さない', row);
		assert(jsErrors(sp.errors).length === 0, '段6(9): ' + w + 'px でコンソールエラーなし', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	}

	/* ⑧ ほかのページには出ない・説明文も取りに行かない */
	for (const file of ['uma-skill-deck.html', 'exam.html', 'index.html', 'card-event-input.html']) {
		const reqs = [];
		const pg = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await pg.newPage();
		page.setDefaultTimeout(5000);
		page.on('request', (r) => { if (r.url().includes('skill-descriptions.json')) reqs.push(r.url()); });
		await page.goto(base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
		await page.waitForTimeout(600);
		const n = await page.evaluate(() => ({ btns: document.querySelectorAll('[data-usd-el="skill-info-btn"]').length, targets: document.querySelectorAll('[data-usd-info]').length, pop: !!document.querySelector('[data-usd-el="info-pop"]') }));
		assert(n.btns === 0 && n.targets === 0 && !n.pop && reqs.length === 0, '段6(8): ' + file + ' には ⓘ も長押しの対象も説明の器も無く、説明文の読み込みも出ない', { n, reqs });
		await pg.close();
	}
}
});

/* ============================================================
 * 本育成パネルの見直しとイベントの選択（段7・2026-10-03。C-113）
 *
 * 実際の special.html。実データに依存しない: カードは実データから id だけ拾い、イベント・スキルPt・前段・説明文は仮のデータ
 * （スキルは、タグの中身で master から拾う。名前は書かない）。期待値はこの塊の中で独立に作る。
 *   仮のイベント: カードA … step1（2択: W0〔距離=短距離〕Lv2／W1〔距離=長距離〕Lv1）→ 未選択・両方△。絞り込み（短距離）で自動で選択肢1
 *                            step2（2択: W2 Lv3／空）→ 自動で選択肢1（●）／ step3（確定: W3〔金〕Lv1）
 *                 カードB … step1（2択: W4 Lv2／W5 Lv1）／ step2（確定: W6〔タグ未設定の拡張スキル〕Lv1）／ step3（確定: W7〔距離なし＝万能〕Lv1）
 *   ①  375px と 1280px で横はみ出し0・コンソールのエラー0
 *   ②  編成10件・タブは1行の横スクロール・10件目で「＋新規」が使えない（知らせ）
 *   ③  名前の編集（✎→✓／↩／Enter／Esc）・「＋新規」の✓（保存）・×の確認（リセット・削除）
 *   ④  育成ウマ娘と各カードの ×（選択欄の中の右端）・375px で3列×2行
 *   ⑤  合計の1行（「XXX Pt/XX種」・4つのボタンの排他・ヒントLv5 の条件）・（?）の小窓
 *   ⑥  絞り込み（表の行・合計・種数の変化。タグの無いスキルが残る。設定の保存）
 *   ⑦  並べ替え（↕。安定ソート・もう一度で戻る）
 *   ⑧  金スキルの行の色
 *   ⑨  イベントの選択（既定・保存・選ばなかった側が消える・未選択は従来どおり・▼の点）
 *   ⑩  「本育成編成」の ON/OFF（外す・グレーアウト・貼り付けで追加されない・Undo・重なりの数）
 *   ⑪  画面の文言に「除外」「有効にする」が残っていない／ほかのページに今回の変更が出ない／②の ⓘ と長押しが変わっていない
 * ============================================================ */
await block('本育成パネルの見直しとイベントの選択（段7）', async () => {
{
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const cardsAll = readJson('data/support-cards.json').entries;
	const master = readJson('uma-skill-deck-skills.json').skills;
	const ext = readJson('data/extended-skills.json').entries;
	const umas = readJson('data/training-umamusume.json').entries;
	// カードは、練習のヒントが入力済みで、そのヒントのスキルがすべて master にあり raceDistance を持たないものの先頭2枚
	// （絞り込みの期待値をこの塊の中で作れるように。名前は書かない）
	const byId = new Map(master.map((s) => [s.id, s]));
	const hintOk = cardsAll.filter((c) => c.dataStatus && c.dataStatus.hint === 'done' && (c.hintSkills || []).length > 0 && c.hintSkills.every((h) => byId.has(h.skillId) && !byId.get(h.skillId).raceDistance));
	const [cA, cB] = [hintOk[0], hintOk[1]];
	const hintIds = [...new Set([cA, cB].flatMap((c) => c.hintSkills.map((s) => s.skillId)))];
	const hinted = new Set(hintIds);
	const plain = (s) => !hinted.has(s.id) && s.tags && (s.tags.style || []).length === 0 && (s.tags.surface || []).length === 0 && (s.tags.passive || []).length === 0;
	const only = (axis, v) => (s) => plain(s) && (s.tags.distance || []).join() === v;
	const wShort = master.find(only('distance', 'short'));
	const wLong = master.find((s) => s !== wShort && only('distance', 'long')(s));
	const wAny = master.filter((s) => plain(s) && (s.tags.distance || []).length === 0);
	// 絞り込み（距離=短距離）に当たるか（matchesFilters と同じ決まり: 距離は空なら万能・値があればその値を含むか。脚質・バ場は選んでいない）
	const wantedShort = (id) => { const s = byId.get(id); return !s || !s.tags || (s.tags.distance || []).length === 0 || (s.tags.distance || []).includes('short'); };
	const wPending = ext.find((s) => s.tagsPending && !hinted.has(s.id));
	const used = new Set([wShort, wLong, wPending].map((s) => s.id));
	const anyPick = wAny.filter((s) => !used.has(s.id)).slice(0, 6);
	// W0 短距離／W1 長距離／W2・W3・W4・W5・W7・W8 万能／W6 タグ未設定
	const W = [wShort.id, wLong.id, anyPick[0].id, anyPick[1].id, anyPick[2].id, anyPick[3].id, wPending.id, anyPick[4].id, anyPick[5].id];
	const nameOf = (id) => (master.find((s) => s.id === id) || ext.find((s) => s.id === id)).name;
	const ref = (id, lv) => ({ skillId: id, name: nameOf(id), hintLevel: lv });
	const evDoc = { dataVersion: '2026-10-03a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries: [
		{ cardId: cA.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(W[0], 2)] }, { skills: [ref(W[1], 1)] }] },
			{ step: 2, choices: [{ skills: [ref(W[2], 3)] }, { skills: [] }] },
			{ step: 3, choices: [{ skills: [ref(W[3], 1)] }] }] },
		{ cardId: cB.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(W[4], 2)] }, { skills: [ref(W[5], 1)] }] },
			{ step: 2, choices: [{ skills: [ref(W[6], 1)] }] },
			{ step: 3, choices: [{ skills: [ref(W[7], 1)] }] }] },
	] };
	const BASE = { [W[0]]: 100, [W[1]]: 120, [W[2]]: 140, [W[3]]: 200, [W[4]]: 160, [W[5]]: 180, [W[6]]: 90, [W[7]]: 110, [W[8]]: 130 };
	hintIds.forEach((id) => { BASE[id] = 50; });   // 練習のヒント（Lv5）は 50 → 30 Pt ずつ
	const RARITY = { [W[3]]: 'gold' };
	const ptDoc = { dataVersion: '2026-10-03a', category: 'skillPt', note: 'テスト用の仕込み', entries: Object.keys(BASE).map((skillId) => ({ skillId, pt: BASE[skillId], rarity: RARITY[skillId] || 'white' })) };
	const stepDoc = { dataVersion: '2026-10-03a', category: 'skillStepUp', note: 'テスト用の仕込み', entries: [] };
	const descDoc = { dataVersion: '2026-10-03a', category: 'skillDescription', note: 'テスト用の仕込み', entries: Object.keys(BASE).map((skillId) => ({ skillId, text: '説明 ' + skillId })) };
	const DISC = [10, 20, 30, 35, 40];
	const pay = (base, L, st) => Math.floor(base * (100 - (L > 0 ? DISC[L - 1] : 0) - (st || 0)) / 100);
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const umaLv7 = umas.find((u) => (u.awakeningSkills || []).some((r) => r.level >= 7));
	const umaLv5 = umas.find((u) => !(u.awakeningSkills || []).some((r) => r.level >= 7));

	const routes = async (page) => {
		await page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill(json(evDoc)));
		await page.route('**/data/character-event-skills.json*', (route) => route.fulfill(json({ dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] })));
		await page.route('**/data/skill-pt.json*', (route) => route.fulfill(json(ptDoc)));
		await page.route('**/data/skill-step-up.json*', (route) => route.fulfill(json(stepDoc)));
		await page.route('**/data/skill-descriptions.json*', (route) => route.fulfill(json(descDoc)));
	};
	const open = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, o.userData);
		await routes(sp.page);
		await sp.page.evaluate(({ roster, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
		}, { roster: o.roster === undefined ? { umaId: '', cardIds: [cA.id, cB.id, null, null, null, null] } : o.roster, scope: o.scope === undefined ? { skillIds: [W[8]], name: '', tiers: {}, updatedAt: '' } : o.scope });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(() => selectStepTab(0));
		await sp.page.waitForSelector('#deck-roster-panel [data-usd-el="pt-sum"],#deck-roster-panel [data-usd-el="pt-error"]', { timeout: 10000 }).catch(() => {});
		return sp;
	};
	const P = '#deck-roster-panel ';
	const readPanel = (page) => page.evaluate(() => {
		const h = document.getElementById('deck-roster-panel');
		const t = (i) => { const e = h.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent.trim() : null; };
		const num = (s) => (s === null ? null : Number(s.replace(/[^0-9]/g, '')));
		const rows = Array.from(h.querySelectorAll('.usd-roster-grow[data-skill-id]')).map((r) => ({
			id: r.getAttribute('data-skill-id'), gold: r.classList.contains('usd-roster-grow--gold'),
			pt: (r.querySelector('.usd-roster-pt') || {}).textContent || null, ref: !!r.querySelector('.usd-roster-pt--ref'),
			marks: Array.from(r.querySelectorAll('[role="cell"]')).map((c) => c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '△' : ''),
		}));
		const btns = (act) => Array.from(h.querySelectorAll('button[data-usd-act="' + act + '"]')).map((b) => ({ v: b.getAttribute('data-value'), key: b.getAttribute('data-member-key'), disabled: b.disabled, pressed: b.getAttribute('aria-pressed'), label: b.textContent.trim(), title: b.title, unselected: b.getAttribute('data-unselected'), dot: b.textContent.trim() === '!' }));
		return { total: num(t('pt-total')), count: num(t('pt-count')), rows, ids: rows.map((r) => r.id), filtering: t('pt-filtering'),
			status: btns('pt-status'), uma: btns('pt-uma'), sort: btns('sort'), events: btns('events'), badge: (document.getElementById('deck-roster-excluded') || {}).textContent,
			tabs: Array.from(h.querySelectorAll('[data-usd-el="roster-tabs"] .uma-subtab')).map((b) => ({ id: b.getAttribute('data-tab-id'), label: b.textContent.trim(), selected: b.getAttribute('aria-selected') === 'true', full: b.classList.contains('usd-roster-tab--full'), top: b.getBoundingClientRect().top })),
			nameText: t('name-text'), nameInput: (h.querySelector('[data-usd-el="name"]') || {}).value, hasEdit: !!h.querySelector('[data-usd-el="name-edit"]'), hasCommit: !!h.querySelector('[data-usd-el="name-commit"]'),
			commitDisabled: (h.querySelector('[data-usd-el="name-commit"]') || {}).disabled, hasCancel: !!h.querySelector('[data-usd-el="name-cancel"]'), hasReset: !!h.querySelector('[data-usd-el="name-reset"]'),
			limit: t('limit-notice'), none: t('rows-none'), hscroll: document.documentElement.scrollWidth - window.innerWidth,
			filters: Array.from(h.querySelectorAll('select[data-usd-act="filter"]')).map((s) => ({ axis: s.getAttribute('data-axis'), value: s.value, options: s.options.length })) };
	});
	const popover = (page) => page.evaluate(() => {
		const pop = document.querySelector('[data-usd-el="info-pop"]');
		if (!pop || pop.hidden) return { open: false };
		const t = (i) => { const e = pop.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent.trim() : null; };
		return { open: true, title: pop.querySelector('.uma-popover-title').textContent, theory: t('info-theory'), subtotals: t('info-subtotals'), filter: t('info-filter'), unpriced: t('info-unpriced'), umaReason: t('info-uma-reason'),
			umaNote: t('info-uma-note'), unselected: t('events-unselected'), none: t('events-none'),
			events: Array.from(pop.querySelectorAll('[data-usd-el="event"]')).map((e) => ({ key: e.getAttribute('data-event-key'), auto: !!e.querySelector('[data-usd-el="event-auto"]'),
				choices: Array.from(e.querySelectorAll('[data-usd-el="event-choice"]')).map((c) => ({ i: Number(c.getAttribute('data-choice')), on: c.getAttribute('aria-checked') === 'true', dim: c.querySelectorAll('[data-usd-dim]').length, text: c.textContent.trim() })) })) };
	});
	const esc = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(80); };
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'));

	/* ⑤ 合計の1行・既定の状態 ／ ⑨ 既定の選択（自動）・未選択 ／ ⑧ 金の行 */
	let sp = await open();
	let v = await readPanel(sp.page);
	// 既定: A step1 未選択（W0・W1 は△）、A step2 は自動（W2 ●）、A step3 W3 ●、B step1 未選択（W4・W5 △）、B step2 W6 ●、B step3 W7 ●
	const sureIds = [W[2], W[3], W[6], W[7]];
	const allSure = sureIds.concat(hintIds);
	const hintTotal = hintIds.length * pay(50, 5);
	const eventTotal = pay(140, 3) + pay(200, 1) + pay(90, 1) + pay(110, 1);
	const expectTotal = eventTotal + hintTotal;
	const COUNT0 = 4 + hintIds.length;
	assert(v.total === expectTotal && v.count === COUNT0 && allSure.every((id) => v.ids.includes(id)) && [W[0], W[1], W[4], W[5]].every((id) => v.ids.includes(id)),
		'段7(5)(9): 「XXX Pt/XX種」は表に出ている●の Pt の合計と数（選択肢が1つだけスキルを持つイベントは自動で選ばれて●、2つとも持つイベントは未選択で△。練習のヒント' + hintIds.length + '種を含む）', { total: v.total, want: expectTotal, count: v.count, ids: v.ids });
	assert(v.badge === COUNT0 + '種', '段7(2): ①のタブの脇の数は「X種」で、合計の行の「XX種」と同じ値', v.badge);
	const row = (id) => v.rows.find((r) => r.id === id);
	assert(row(W[3]).gold && !row(W[2]).gold && row(W[3]).pt === pay(200, 1) + ' Pt' && !row(W[3]).ref && row(W[0]).ref && row(W[0]).pt === pay(100, 2) + ' Pt',
		'段7(8)(14): 金スキルの行に金の印（クラス）が付き、名前の右の Pt は「P Pt」。△の行は薄い色の参考値', { gold: row(W[3]), white: row(W[2]), maybe: row(W[0]) });
	const goldLook = await sp.page.evaluate((id) => { const r = document.querySelector('#deck-roster-panel .usd-roster-grow[data-skill-id="' + id + '"] .usd-roster-gc'); const w = document.querySelector('#deck-roster-panel .usd-roster-grow:not(.usd-roster-grow--gold) .usd-roster-gc'); return { gold: getComputedStyle(r).backgroundColor, white: getComputedStyle(w).backgroundColor }; }, W[3]);
	assert(goldLook.gold !== goldLook.white, '段7(18): 金スキルの行の地の色が、ほかの行と違う', goldLook);
	assert(v.status.map((b) => b.label).join('|') === '勉強家|切れ者' && v.status.every((b) => b.pressed === 'false') && v.uma.map((b) => b.label).join('|') === '覚醒Lv5' && v.uma[0].pressed === 'false' && v.uma[0].disabled,
		'段7(12)(13)→段7b(⑤): ［勉強家］［切れ者］は押していない、［覚醒ヒントLv5］は押していない（＝Lv3）で、育成ウマ娘が居ないので押せない', { status: v.status, uma: v.uma });
	await sp.page.click(P + 'button[data-usd-act="pt-status"][data-value="kire"]');
	v = await readPanel(sp.page);
	assert(v.status.find((b) => b.v === 'kire').pressed === 'true' && v.total === pay(140, 3, 10) + pay(200, 1, 10) + pay(90, 1, 10) + pay(110, 1, 10) + hintIds.length * pay(50, 5, 10), '段7(12): ［切れ者］を押すと選ばれ、合計が 10% 引きになる', { total: v.total });
	await sp.page.click(P + 'button[data-usd-act="pt-status"][data-value="benkyo"]');
	v = await readPanel(sp.page);
	assert(v.status.find((b) => b.v === 'benkyo').pressed === 'true' && v.status.find((b) => b.v === 'kire').pressed === 'false', '段7(12): ［勉強家］を押すと切れ者は外れる（排他）', v.status);
	await sp.page.click(P + 'button[data-usd-act="pt-status"][data-value="benkyo"]');
	v = await readPanel(sp.page);
	const d0 = await draft(sp.page);
	assert(v.status.every((b) => b.pressed === 'false') && v.total === expectTotal && d0.pt && d0.pt.status === 'none', '段7(12): 同じものをもう一度押すと「なし」に戻る（保存の値は none）', { status: v.status, saved: d0.pt });
	// （?）の小窓
	await sp.page.click(P + '[data-usd-el="pt-help-btn"]');
	let pv = await popover(sp.page);
	const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	assert(pv.open && pv.theory === '理論値（各スキルを最大のヒントレベルで得た場合のスキルPt）' && pv.subtotals === 'ヒント ' + fmt(hintTotal) + ' Pt／イベント ' + fmt(eventTotal) + ' Pt／育成ウマ娘 0 Pt' && pv.filter === null && pv.unpriced === null && pv.umaReason === null,
		'段7(13): （?）は小窓で開き、理論値の説明と由来ごとの小計が出る（条件・未収録・ヒントLv5 の理由は無いので出ない）', pv);
	await esc(sp.page);
	assert((await popover(sp.page)).open === false && (await sp.page.getAttribute(P + '[data-usd-el="pt-help-btn"]', 'aria-expanded')) === 'false', '段7(13): Escape で閉じ、aria-expanded が false に戻る');
	// 合計の1行が 375px で収まるか（実測して報告。収まらないときはボタン4つが2行目）
	await sp.ctx.close();
	for (const [w, h] of [[375, 760], [1280, 900]]) {
		sp = await open({ w, h });
		const g = await sp.page.evaluate(() => {
			const panel = document.getElementById('deck-roster-panel');
			const head = panel.querySelector('.usd-roster-sumhead'); const btns = panel.querySelector('.usd-roster-sumbtns');
			const names = Array.from(panel.querySelectorAll('.usd-roster-namescroll'));
			const slots = Array.from(panel.querySelectorAll('.usd-roster-slot')).map((s) => Math.round(s.getBoundingClientRect().top));
			const grid = panel.querySelector('.usd-roster-grid'); const nameCol = panel.querySelector('.usd-roster-gc--name');
			const fs = Math.min(...Array.from(panel.querySelectorAll('.usd-roster-togglebtn')).map((b) => parseFloat(getComputedStyle(b).fontSize)));
			const ghbtns = Array.from(panel.querySelectorAll('.usd-roster-ghbtn:not(.usd-roster-ghbtn--blank)')).map((b) => b.getBoundingClientRect());
			const icons = Array.from(panel.querySelectorAll('.usd-ntab-btn, .usd-roster-clearbtn')).map((b) => b.getBoundingClientRect());
			return { oneLine: Math.abs(head.getBoundingClientRect().top - btns.getBoundingClientRect().top) < 4, headW: head.getBoundingClientRect().width, btnsW: btns.getBoundingClientRect().width, rowW: head.parentElement.getBoundingClientRect().width,
				page: document.documentElement.scrollWidth - window.innerWidth, overflowRows: names.filter((n) => n.scrollWidth > n.clientWidth + 1).length, rows: names.length,
				slotRows: new Set(slots).size, slotsPerRow: slots.filter((t) => t === slots[0]).length, nameRatio: nameCol.getBoundingClientRect().width / grid.getBoundingClientRect().width,
				fontMin: fs, ghMin: Math.min(...ghbtns.map((r) => Math.min(r.width, r.height))), iconMin: Math.min(...icons.map((r) => Math.min(r.width, r.height))) };
		});
		assert(g.page <= 0, '段7(1): ' + w + 'px で横にはみ出さない', { page: g.page });
		assert(g.fontMin >= 11 && g.ghMin >= (w <= 640 ? 24 : 28) && g.iconMin >= 28, '段7(13)(16)(6)→段7b→段7c: ' + w + 'px で、合計の行のボタンの文字は 11px 以上・列見出しの漏斗は ' + (w <= 640 ? 24 : 28) + 'px 以上（スマホはアイコンなので 24px を許す。段7c）・タブの ✎ ✓ ↩ ×とカードの × は 28px 以上', g);
		if (w === 375) {
			assert(g.slotRows === 2 && g.slotsPerRow === 3, '段7(10): 375px でサポートカードの欄は3列×2行', { rows: g.slotRows, perRow: g.slotsPerRow });
			assert(g.nameRatio > 0.3 && g.nameRatio < 0.37, '段7(15): 375px でスキル名の列は表の幅の約 1/3（メンバーの列の全体が約 2/3）', { ratio: g.nameRatio });
			console.log('     [実測] 375px の合計の1行: ' + (g.oneLine ? '1行に収まった' : '収まらず2行（合計＋? が1行目、ボタン4つが2行目）') + '（行の幅 ' + Math.round(g.rowW) + 'px・合計と? ' + Math.round(g.headW) + 'px・ボタン4つ ' + Math.round(g.btnsW) + 'px）');
			console.log('     [実測] 375px で名前と Pt が収まらない行: ' + g.overflowRows + ' / ' + g.rows + '（' + Math.round(100 * g.overflowRows / Math.max(1, g.rows)) + '%）。収まらない行はセルの中を横に送れる');
		} else {
			assert(g.oneLine, '段7(11): 1280px では合計の1行（合計・?・ボタン4つ）が1行に収まる', g);
		}
		assert(jsErrors(sp.errors).length === 0, '段7(1): ' + w + 'px でコンソールエラーなし', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	}

	/* ⑨ イベントの選択（小窓・保存・選ばなかった側が消える・▼の点） */
	sp = await open();
	v = await readPanel(sp.page);
	const evA = v.events.find((b) => b.key === '1');
	assert(v.events.length === 2 && evA && evA.unselected === '1' && evA.dot && v.events.find((b) => b.key === '2').dot, '段7(19)→段7b(⑨): 選ぶ必要のあるイベントがあるカードの列（2枚）にだけ、押せるバッジが出て、未選択が1件以上なので「!」になる', v.events);
	await sp.page.click(P + '[data-usd-act="events"][data-member-key="1"]');
	pv = await popover(sp.page);
	assert(pv.open && pv.unselected === '未選択1件' && pv.events.length === 2 && pv.events[0].key === 'card:' + cA.id + '#0' && pv.events[0].choices.every((c) => !c.on) && pv.events[1].auto && pv.events[1].choices[0].on,
		'段7(19): 小窓に、選択肢が2つ以上あるイベントが並び（確定のイベントは出ない）、自動で選ばれたものは「自動」で選択済み', pv);
	assert(pv.events[0].choices[0].text.includes(nameOf(W[0]) + ' Lv2') && pv.events[0].choices[1].text.includes(nameOf(W[1]) + ' Lv1'), '段7(19): 選択肢ごとに成功側のスキル名とヒントレベルが並ぶ', pv.events[0].choices.map((c) => c.text));
	await sp.page.click('[data-usd-el="event-choice"][data-event-key="card:' + cA.id + '#0"][data-choice="0"]');
	await sp.page.waitForTimeout(150);
	pv = await popover(sp.page);
	v = await readPanel(sp.page);
	const d1 = await draft(sp.page);
	assert(pv.open && pv.events[0].choices[0].on && !pv.events[0].choices[1].on && pv.unselected === '未選択0件', '段7(19): 選択肢1を押すと選ばれ、小窓は開いたまま中身が更新される', pv);
	assert(v.ids.includes(W[0]) && !v.ids.includes(W[1]) && v.rows.find((r) => r.id === W[0]).marks[1] === '●' && v.count === COUNT0 + 1 && v.total === expectTotal + pay(100, 2),
		'段7(19): 選んだ選択肢のスキルは●になり、選ばなかった選択肢だけのスキルは表から消え、合計と種数が増える', { ids: v.ids, count: v.count, total: v.total });
	assert(d1.eventChoices && d1.eventChoices['card:' + cA.id + '#0'] === 0 && !('card:' + cA.id + '#1' in d1.eventChoices), '段7(19): 保存するのは利用者が選んだものだけ（自動で選ばれたものは保存しない）', d1.eventChoices);
	assert(!v.events.find((b) => b.key === '1').dot, '段7(19)→段7b(⑨): 未選択が無くなると「!」が番号のバッジに変わる', v.events);
	await sp.page.click('[data-usd-el="event-choice"][data-event-key="card:' + cA.id + '#0"][data-choice="0"]');
	await sp.page.waitForTimeout(150);
	v = await readPanel(sp.page);
	const d2 = await draft(sp.page);
	assert(v.ids.includes(W[1]) && v.count === COUNT0 && !(d2.eventChoices && ('card:' + cA.id + '#0' in d2.eventChoices)), '段7(19): 選んだ選択肢をもう一度押すと未選択に戻る（保存からも消え、両方の△が戻る）', { count: v.count, saved: d2.eventChoices });
	await esc(sp.page);
	assert((await popover(sp.page)).open === false && (await sp.page.evaluate(() => document.activeElement.getAttribute('data-usd-act'))) === 'events', '段7(19): Escape で閉じ、▼にフォーカスが戻る');
	// 自動で選ばれたものを押すと保存される／開き直しても残る
	await sp.page.click(P + '[data-usd-act="events"][data-member-key="1"]');
	await sp.page.click('[data-usd-el="event-choice"][data-event-key="card:' + cA.id + '#1"][data-choice="0"]');
	await sp.page.waitForTimeout(150);
	const d3 = await draft(sp.page);
	assert(d3.eventChoices && d3.eventChoices['card:' + cA.id + '#1'] === 0, '段7(19): 自動で選ばれていた選択肢を押すと、その選択が保存される', d3.eventChoices);
	await esc(sp.page);
	await sp.page.reload({ waitUntil: 'networkidle' });
	for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
	await sp.page.evaluate(() => selectStepTab(0));
	await sp.page.waitForSelector(P + '[data-usd-el="pt-sum"]');
	await sp.page.click(P + '[data-usd-act="events"][data-member-key="1"]');
	pv = await popover(sp.page);
	assert(pv.events[1].choices[0].on && !pv.events[1].auto, '段7(19): 開き直しても選択が残り、「自動」ではなく選んだものとして出る', pv.events[1]);
	await esc(sp.page);
	// 指す先が無い値は無効として扱い、保存値は書き換えない
	await sp.page.evaluate((cardId) => { const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')); r.eventChoices = { ['card:' + cardId + '#0']: 7, 'card:nope#0': 1 }; localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(r)); }, cA.id);
	await sp.page.reload({ waitUntil: 'networkidle' });
	for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
	await sp.page.evaluate(() => selectStepTab(0));
	await sp.page.waitForSelector(P + '[data-usd-el="pt-sum"]');
	v = await readPanel(sp.page);
	await sp.page.click(P + 'button[data-usd-act="pt-status"][data-value="kire"]');
	const d4 = await draft(sp.page);
	assert(v.ids.includes(W[0]) && v.ids.includes(W[1]) && v.count === COUNT0 && d4.eventChoices['card:' + cA.id + '#0'] === 7 && d4.eventChoices['card:nope#0'] === 1,
		'段7(19): 指す先が無い値（選択肢の位置が範囲外・無いイベント）は無効として扱い（未選択のまま）、別の設定を替えても保存値を書き換えない', { count: v.count, saved: d4.eventChoices });
	await sp.ctx.close();

	/* ⑥ 絞り込み ／ ⑦ 並べ替え */
	sp = await open();
	v = await readPanel(sp.page);
	assert(v.filters.map((f) => f.axis).join('|') === 'distance|style|surface' && v.filters.every((f) => f.value === '' && f.options >= 3) && v.filtering === null,
		'段7(17): 距離・脚質・バ場の3つのセレクト（「指定なし」と TAG_AXES の値）があり、既定は指定なし', v.filters);
	await sp.page.selectOption(P + 'select[data-usd-act="filter"][data-axis="distance"]', 'short');
	await sp.page.waitForTimeout(150);
	v = await readPanel(sp.page);
	const d5 = await draft(sp.page);
	const hintShort = hintIds.filter(wantedShort);
	assert(v.ids.includes(W[0]) && !v.ids.includes(W[1]) && v.ids.includes(W[6]) && v.ids.includes(W[2]) && v.filtering === null && hintIds.every((id) => v.ids.includes(id) === wantedShort(id)),
		'段7(17): 距離を短距離にすると、長距離のスキルが消え、短距離・万能・タグ未設定のスキルは残る（練習のヒントも同じ決まり）。「絞り込み中」の印は出ない（段7c の L。条件は（?）の中）', { ids: v.ids, filtering: v.filtering });
	const COUNT_SHORT = 5 + hintShort.length;
	const TOTAL_SHORT = eventTotal + pay(100, 2) + hintShort.length * pay(50, 5);
	assert(v.rows.find((r) => r.id === W[0]).marks[1] === '●' && v.count === COUNT_SHORT && v.total === TOTAL_SHORT && v.badge === COUNT_SHORT + '種',
		'段7(17)(19): 絞り込みで残るスキルを持つ選択肢が1つだけになったイベント（A の1回目）は自動で選ばれ、W0 が●になって合計・種数・①の数に反映される', { count: v.count, total: v.total, badge: v.badge, want: [COUNT_SHORT, TOTAL_SHORT] });
	assert(d5.skillFilter && d5.skillFilter.distance === 'short' && !('style' in d5.skillFilter), '段7(17): 絞り込みは編成に skillFilter として保存される（触っていない軸は足さない）', d5.skillFilter);
	await sp.page.click(P + '[data-usd-el="pt-help-btn"]');
	pv = await popover(sp.page);
	assert(pv.filter === '絞り込み中：距離 短距離', '段7(17): （?）の中に絞り込みの条件が出る', pv.filter);
	await esc(sp.page);
	await sp.page.click(P + '[data-usd-act="events"][data-member-key="1"]');
	pv = await popover(sp.page);
	assert(pv.events[0].auto && pv.events[0].choices[0].on && pv.events[0].choices[1].dim === 1, '段7(19): 絞り込みで外れるスキルは、小窓の中で灰色のまま残る', pv.events[0]);
	await esc(sp.page);
	// ②に渡す値（本育成編成の対象）は絞り込みなしの●（長距離のヒントを除いても変わらない）
	// 段8（C-120）で①の名前の編集と②の「本育成編成」のボタン・小窓を無くした。②の相手は常に同じセットの①（ここでは＋新規の下書きの編成）なので、
	// 保存して選ぶ手順は要らない
	await sp.page.evaluate(() => selectStepTab(1));
	await sp.page.waitForTimeout(300);
	const hiddenWhileFiltered = await sp.page.evaluate(() => window.UmaSkillDeckCore.getPickerHiddenIds());
	// 段7d の ⑥：②に渡す本育成のスキルは、①の表に出ている●（絞り込みに当たるもの。取得しないスキルを除く）と同じ。絞り込みなしの全件ではない（段7 の決めを置き換えた）
	const visibleSure = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')).filter((r) => r.querySelector('.usd-roster-got') && !r.hasAttribute('data-usd-off')).map((r) => r.getAttribute('data-skill-id')));
	assert(visibleSure.length > 0 && visibleSure.length < allSure.length + 1 && hiddenWhileFiltered.slice().sort().join() === visibleSure.slice().sort().join(),
		'段7(17)→段7d(⑥): 絞り込み中は、②に渡す本育成のスキル（本育成編成の対象）も、①の表に出ている●だけ（絞り込みなしの全件ではない）', { n: hiddenWhileFiltered.length, visible: visibleSure.length, all: allSure.length + 1 });
	await sp.page.evaluate(() => selectStepTab(0));   // 段8: 保存していないので「＋新規」（ドラフト）のまま（①の編成のタブは無い）
	await sp.page.waitForTimeout(200);
	await sp.page.selectOption(P + 'select[data-usd-act="filter"][data-axis="distance"]', '');
	await sp.page.waitForTimeout(150);
	v = await readPanel(sp.page);
	const d6 = await draft(sp.page);
	assert(v.ids.includes(W[1]) && v.count === COUNT0 && v.filtering === null && !('skillFilter' in d6), '段7(17): 指定なしに戻すと元に戻り、skillFilter は消える', { count: v.count, saved: d6.skillFilter });
	// 並べ替え（B の列）
	const before = v.ids.slice();
	await sp.page.click(P + '[data-usd-act="sort"][data-member-key="2"]');
	v = await readPanel(sp.page);
	const bIds = v.rows.filter((r) => r.marks[2] !== '').map((r) => r.id);
	const firstNonB = v.rows.findIndex((r) => r.marks[2] === '');
	assert(v.sort.find((b) => b.key === '2').pressed === 'true' && bIds.length >= 3 && v.rows.slice(0, bIds.length).every((r) => r.marks[2] !== '') && firstNonB === bIds.length,
		'段7(16): ↕を押すと、その列のメンバーが得るスキルが上に寄り、押した列が分かる（aria-pressed）', { order: v.ids, bCount: bIds.length });
	const topOrder = v.ids.slice(0, bIds.length); const restOrder = v.ids.slice(bIds.length);
	assert(topOrder.join() === before.filter((id) => bIds.includes(id)).join() && restOrder.join() === before.filter((id) => !bIds.includes(id)).join(), '段7(16): それ以外の並びは元の順を保つ（安定ソート）', { topOrder, restOrder });
	await sp.page.click(P + '[data-usd-act="sort"][data-member-key="1"]');
	v = await readPanel(sp.page);
	assert(v.sort.filter((b) => b.pressed === 'true').length === 1 && v.sort.find((b) => b.key === '1').pressed === 'true', '段7(16): 同時に有効な並べ替えは1つ', v.sort);
	await sp.page.click(P + '[data-usd-act="sort"][data-member-key="1"]');
	v = await readPanel(sp.page);
	assert(v.sort.every((b) => b.pressed === 'false') && v.ids.join() === before.join(), '段7(16): もう一度押すと元の並びに戻る', v.ids);
	await sp.ctx.close();

	/* ③ 名前の編集・保存・リセット／② 10件の検査は、段7b の ①②⑫（編成と因子周回で共有のタブ）で、新しい塊「本育成パネルの追加修正（段7b…）」へ移した。
	   ここに残すのは、育成ウマ娘とカードの × ・（i）・覚醒ヒントLv5 の検査 */
	sp = await open({ roster: { umaId: umaLv7.id, cardIds: [cA.id, cB.id, null, null, null, null] } });
	const boxes = await sp.page.evaluate(() => {
		const h = document.getElementById('deck-roster-panel');
		const umaBox = h.querySelector('.usd-roster-umabox');
		const slots = Array.from(h.querySelectorAll('.usd-roster-slot'));
		const inside = (box, btn) => { const b = box.getBoundingClientRect(); const r = btn.getBoundingClientRect(); return r.right <= b.right + 1 && r.left >= b.left - 1 && r.right > b.right - 48; };
		return { umaClear: !!umaBox.querySelector('[data-usd-act="clear-uma"]') && inside(umaBox, umaBox.querySelector('[data-usd-act="clear-uma"]')),
			cardClears: slots.map((s) => { const b = s.querySelector('[data-usd-act="clear-card"]'); return b ? inside(s, b) : null; }),
			labels: slots.map((s) => s.querySelector('.usd-roster-pickname').textContent.trim()), titles: slots.map((s) => s.querySelector('.usd-roster-pickbtn').title),
			ellipsis: slots.map((s) => getComputedStyle(s.querySelector('.usd-roster-pickname')).textOverflow), heading: !!Array.from(h.querySelectorAll('.usd-roster-h')).find((e) => e.textContent.trim() === 'サポートカード'),
			umaNote: h.textContent.includes('覚醒レベル最大として扱います') };
	});
	assert(boxes.umaClear && boxes.cardClears[0] === true && boxes.cardClears[1] === true && boxes.cardClears[2] === null && boxes.labels[2] === 'サポカを選ぶ' && boxes.ellipsis.every((e) => e === 'ellipsis') && boxes.titles[0].length > 0 && !boxes.heading && !boxes.umaNote,
		'段7(7)〜(10): 育成ウマ娘とカードの × は選択欄の中の右端。空きは「サポカを選ぶ」。長い名前は省略記号（全文は title）。見出し「サポートカード」と注記の行は無い', boxes);
	await sp.page.click(P + '[data-usd-el="uma-info-btn"]');
	pv = await popover(sp.page);
	assert(pv.open && pv.umaNote === '★3・覚醒レベル最大として扱います。', '段7(7): 育成ウマ娘の（i）で、扱いの説明が小窓で開く', pv.umaNote);
	await esc(sp.page);
	v = await readPanel(sp.page);
	assert(v.uma.length === 1 && v.uma[0].disabled === false && v.uma[0].pressed === 'false', '段7(13)→段7b(⑤): 覚醒レベル7のウマ娘では［覚醒ヒントLv5］が押せる（既定は押していない＝Lv3）', v.uma);
	await sp.page.click(P + 'button[data-usd-act="pt-uma"][data-value="5"]');
	v = await readPanel(sp.page);
	assert(v.uma[0].pressed === 'true' && (await draft(sp.page)).pt.umaHintLevel === 5, '段7(13)→段7b(⑤): ［覚醒ヒントLv5］を押すと選ばれ、保存される', v.uma);
	await sp.page.click(P + '[data-usd-act="clear-uma"]');
	v = await readPanel(sp.page);
	assert(!(await draft(sp.page)).umaId && v.uma[0].disabled, '段7(8): 育成ウマ娘の × で外れる（覚醒ヒントLv5 は押せなくなる）', v.uma);
	await sp.page.click(P + '[data-usd-act="clear-card"][data-index="0"]');
	v = await readPanel(sp.page);
	assert((await draft(sp.page)).cardIds[0] === null && v.events.length === 1, '段7(10): カードの × で外れる（列の「!」・番号のボタンも減る）', v.events);
	await sp.ctx.close();
	sp = await open({ roster: { umaId: umaLv5.id, cardIds: [cA.id, null, null, null, null, null] } });
	v = await readPanel(sp.page);
	assert(v.uma[0].disabled && v.uma[0].title === '覚醒ヒントLv5は覚醒レベル7のウマ娘のみ選べます', '段7(13)→段7b(⑤): 覚醒レベルが7に届かないウマ娘では［覚醒ヒントLv5］が押せず、title に理由が出る', v.uma[0]);
	await sp.page.click(P + '[data-usd-el="pt-help-btn"]');
	pv = await popover(sp.page);
	assert(pv.umaReason === '覚醒ヒントLv5は覚醒レベル7のウマ娘のみ選べます', '段7(13)→段7b(⑤): （?）の中にも理由が出る', pv.umaReason);
	await esc(sp.page);
	await sp.ctx.close();

	/* ⑩ 「本育成編成」（②。段7b の ⑬で、対象は「選んだ編成」＝保存した編成になり、ボタンは一覧の小窓を開く形になった） */
	/* 段8（C-120）で②の「本育成編成」のボタンと小窓（roster-link-btn・link-list・重なりの数・外した知らせ）を無くした。②の相手は常に同じセットの①で、
	   ①で得るスキルはセットから自動では外さず、②に数えないだけ（行は「①で取得」。blocks-8.mjs の段8(D)）。
	   編成を選ぶ・「なし」にする・選んだときに●を外して Undo に積む、の検査は見張る対象が無くなったので外した。
	   残すのは、同じセットの①で得るスキルが追加の一覧で選べなくなること（旧3・旧4・旧5）と、保存したセットに①の編成が付くこと。
	   ①は open() の既定の下書きの編成（カード A・B。それまでの「編成AB」と同じ中身） */
	sp = await open({ scope: { skillIds: [W[8], W[2], W[3]], name: '', tiers: {}, updatedAt: '' } });
	const readLink = (page) => page.evaluate(() => ({
		scope: JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}'), hidden2: window.UmaSkillDeckCore.getPickerHiddenIds(),
		taken: Array.from(document.querySelectorAll('#deck-template-panel .usd-panel--taken[data-skill-id]')).map((p) => p.getAttribute('data-skill-id')) }));
	await sp.page.evaluate(() => selectStepTab(1));
	await sp.page.waitForTimeout(200);
	let lk = await readLink(sp.page);
	assert(lk.scope.skillIds.join() === [W[8], W[2], W[3]].join() && lk.hidden2.slice().sort().join() === allSure.slice().sort().join() && lk.taken.slice().sort().join() === [W[2], W[3]].sort().join(),
		'段7(E)→段8(D): 同じセットの①で得るスキル（●）はセットから自動では外さず「①で取得」になり、追加の一覧で選べなくする対象になる（●の全件・絞り込みなし）', lk);
	// 追加の一覧（条件で検索）: グレーアウト・理由・件数
	await sp.page.click('[data-usd-act="editor-pick"]');
	await sp.page.waitForTimeout(400);
	const pick = await sp.page.evaluate(() => {
		const box = document.querySelector('[data-usd-el="results"]');
		const grey = [...box.querySelectorAll('[data-usd-excluded="1"]')];
		const ex = document.querySelector('[data-usd-el="result-excluded"]');
		return { greyIds: grey.map((r) => r.querySelector('input').value), reasons: [...new Set(grey.map((r) => r.querySelector('[data-usd-el="excluded-reason"]').textContent))], label: ex && !ex.hidden ? ex.textContent : null };
	});
	// 段8: W2・W3 はセットに入ったまま（自動では外さない）なので一覧には出ない。「W2 がグレーアウトで並ぶ」の確認は外し、
	// グレーアウトがあり、どれも①の●であることで見る
	assert(pick.greyIds.length >= 1 && pick.greyIds.every((id) => allSure.includes(id)) && pick.reasons.join() === '本育成で得るため選べません' && pick.label === '本育成編成のため選べない ' + pick.greyIds.length + '件',
		'段7(E)(旧3): 対象があるあいだ、「条件で検索」で本育成で得るスキルはグレーアウトで残り、理由「本育成で得るため選べません」と「本育成編成のため選べない M件」が出る', pick);
	// 旧5: モーダルを開いたまま、選んだ編成（AB）が変わる（カード A を外す）と、一覧が描き直される
	await sp.page.evaluate(() => { document.querySelector('#deck-roster-panel [data-usd-act="clear-card"][data-index="0"]').click(); });
	await sp.page.waitForTimeout(300);
	const hintsB = cB.hintSkills.map((s) => s.skillId);
	const pick2 = await sp.page.evaluate(() => ({ open: !document.querySelector('.usd-modal').hidden, greyIds: [...document.querySelectorAll('[data-usd-el="results"] [data-usd-excluded="1"]')].map((r) => r.querySelector('input').value) }));
	assert(pick2.open && pick2.greyIds.every((id) => [W[6], W[7]].concat(hintsB).includes(id)) && !pick2.greyIds.includes(W[2]) && !pick2.greyIds.includes(W[3]), '段7(旧5): 選択モーダルを開いたまま、選んだ編成が変わると、グレーアウトが描き直される（外したカードのスキルは選べるようになる）', pick2);
	// 旧4: 貼り付けで、本育成で得るスキルと一致した行は追加されない
	await sp.page.evaluate(() => window.UmaSkillDeckCore.closeSkillPicker());
	await sp.page.click('[data-usd-act="editor-pick-text"]');
	await sp.page.waitForTimeout(300);
	await sp.page.fill('[data-usd-el="paste-input"]', nameOf(W[7]) + '\n' + nameOf(W[4]));
	await sp.page.click('[data-usd-act="paste-run"]');
	await sp.page.waitForTimeout(400);
	const paste = await sp.page.evaluate(() => ({ blocked: (document.querySelector('[data-usd-el="paste-blocked"]') || {}).textContent || null, checked: document.querySelector('[data-usd-el="picker-checked-count"]').textContent, summary: document.querySelector('.usd-paste-ok').textContent }));
	assert(paste.blocked === '本育成編成のため追加しなかったもの 1種' && paste.checked === '1種選択' && paste.summary === '選択 1件', '段7(旧4): 貼り付けで一致した行のうち本育成で得るものは選択に入らず、「本育成編成のため追加しなかったもの N種」が出る', paste);
	await sp.page.click('[data-usd-el="picker-commit"]');
	await sp.page.waitForTimeout(300);
	lk = await readLink(sp.page);
	assert(lk.scope.skillIds.includes(W[4]) && !lk.scope.skillIds.includes(W[7]), '段7(旧4): 追加を押しても、本育成で得るスキルは足されない', lk.scope.skillIds);
	await sp.page.evaluate(() => window.UmaSkillDeckCore.closeSkillPicker());
	// （段8（C-120）で、「なし」→ もう一度選ぶ・1種のときも外れる・「元に戻す」で戻る・「なし」で保存から消える、の検査は外した。理由は上の注記）
	// 保存したセットには、①の下書きの編成の写しが baseRosterId で付く（段8: ✎ は共通の見出しの帯）
	const draftRosterNow = await draft(sp.page);
	await sp.page.click('#deck-set-bar [data-usd-act="name-edit"]');
	await sp.page.keyboard.type('段7のセット');
	await sp.page.keyboard.press('Enter');
	await sp.page.waitForTimeout(250);
	const saved7 = await sp.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData')); const t = d.templates[d.templates.length - 1]; return { tpl: t, roster: (d.rosters || []).find((r) => r.rosterId === t.baseRosterId) || null }; });
	assert(saved7.tpl.baseRosterId && saved7.roster && saved7.roster.cardIds.join() === draftRosterNow.cardIds.join() && saved7.tpl.name === '段7のセット' && !('withRoster' in saved7.tpl),
		'段7(E)→段8: 保存した因子周回（template）に、①の下書きの編成の写しが baseRosterId で付く（段7 の withRoster は書かない）', saved7);
	await sp.ctx.close();
	// Deck 単体ページには出ない
	const dk = await openPage(browser, base, 'uma-skill-deck.html');
	const dkv = await dk.page.evaluate(() => ({ link: (() => { const e = document.querySelector('[data-usd-el="roster-link"]'); return e ? e.hidden : 'none'; })(), panel: !!document.querySelector('.usd-roster'), filter: !!document.querySelector('[data-usd-el="filter-row"]') }));
	assert(dkv.link === true && !dkv.panel && !dkv.filter, '段7(E)(11): Deck 単体ページには「本育成編成」も本育成パネルも絞り込みも出ない', dkv);
	await dk.ctx.close();

	/* ⑪ 文言・ほかのページ・②の ⓘ */
	sp = await open();
	const words = await sp.page.evaluate(() => {
		// C-129: ボタン「低効果を除外」（①の列見出し・②のパレット）は、おいもさんが文言を指定したもの。この語だけは免除する
		const LOWFX = /低効果\s*を除外/g;
		const text = document.body.innerText.replace(LOWFX, '');
		const attrs = Array.from(document.querySelectorAll('#deck-roster-panel [title], #deck-roster-panel [aria-label], #deck-template-panel [title], #deck-template-panel [aria-label]')).map((e) => (e.title || '') + ' ' + (e.getAttribute('aria-label') || '')).join(' ').replace(LOWFX, '');
		return { jogai: text.includes('除外') || attrs.includes('除外'), yuko: text.includes('有効にする') || text.includes('有効を外す'), badge: document.getElementById('deck-roster-excluded').textContent, head: !!document.querySelector('.deck-panel-head'), help: document.querySelector('header').innerText + ' ' + document.querySelector('.help-open-btn').getAttribute('aria-label') };
	});
	assert(!words.jogai && !words.yuko && words.head === false && /^\d+種$/.test(words.badge) && words.help.includes('使い方・注意') && !words.help.includes('精度は完全'),
		'段7(旧3)(1)(2)(20)→段7b(⓪): 画面の文言に「除外」「有効にする」が無く、①の見出しの行は無く、ヘッダーの「？」は「使い方・注意」（aria-label）で注意の3行は無い', words);
	await sp.page.click('.help-open-btn');
	await sp.page.waitForTimeout(200);
	const help = await sp.page.evaluate(() => ({ open: !document.getElementById('help-box').hidden, caution: (document.getElementById('help-cautions') || {}).innerText || '', title: document.querySelector('#help-box .help-title').innerText }));
	assert(help.open && help.caution.includes('OCR・★判定の精度は完全ではありません') && help.caution.includes('解像度不足') && help.caution.includes('加工された画像'), '段7(1): 「使い方・注意」のポップアップの「注意」の欄に3行がある', help);
	await sp.page.keyboard.press('Escape');
	await sp.page.evaluate(() => selectStepTab(1));
	const row2 = await sp.page.evaluate(() => { const r = document.querySelector('.usd-panel[data-skill-id]'); const b = r && r.querySelector('[data-usd-el="skill-info-btn"]'); return { btn: !!b, isInfo: b && b.classList.contains('usd-info-btn'), nameIsBtn: r && r.querySelector('.usd-panel-namebtn').tagName }; });   // 段9（C-121）: 行は「アイコン／名前（button）／Pt／×」で、名前を包む span は無い
	assert(row2.btn && !row2.isInfo && row2.nameIsBtn === 'BUTTON', '段7(14)→段7d(⑬)→段9: ②の行も、名前（button）を押して開く形になった（ⓘ の別ボタンは無い）', row2);
	await sp.ctx.close();
	for (const file of ['exam.html', 'index.html', 'card-event-input.html']) {
		const pg = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await pg.newPage();
		await page.goto(base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
		await page.waitForTimeout(500);
		const n = await page.evaluate(() => ({ panel: !!document.querySelector('.usd-roster'), link: !!document.querySelector('[data-usd-el="roster-link"]:not([hidden])'), filter: !!document.querySelector('[data-usd-el="filter-row"]') }));
		assert(!n.panel && !n.link && !n.filter, '段7(11): ' + file + ' には今回の変更（本育成パネル・本育成編成・絞り込み）が出ない', n);
		await pg.close();
	}
}
});

await block('本育成パネルの追加修正（段7b。ヘッダー・タブ・上部・列見出し・イベントの小窓・本育成編成）', async () => {
{
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const cardsAll = readJson('data/support-cards.json').entries;
	const master = readJson('uma-skill-deck-skills.json').skills;
	const ext = readJson('data/extended-skills.json').entries;
	const umas = readJson('data/training-umamusume.json').entries;
	// カードは、練習のヒントが入力済みで、そのヒントのスキルがすべて master にあり raceDistance を持たないものの先頭2枚
	// （絞り込みの期待値をこの塊の中で作れるように。名前は書かない）
	const byId = new Map(master.map((s) => [s.id, s]));
	const hintOk = cardsAll.filter((c) => c.dataStatus && c.dataStatus.hint === 'done' && (c.hintSkills || []).length > 0 && c.hintSkills.every((h) => byId.has(h.skillId) && !byId.get(h.skillId).raceDistance));
	const [cA, cB] = [hintOk[0], hintOk[1]];
	const hintIds = [...new Set([cA, cB].flatMap((c) => c.hintSkills.map((s) => s.skillId)))];
	const hinted = new Set(hintIds);
	const plain = (s) => !hinted.has(s.id) && s.tags && (s.tags.style || []).length === 0 && (s.tags.surface || []).length === 0 && (s.tags.passive || []).length === 0;
	const only = (axis, v) => (s) => plain(s) && (s.tags.distance || []).join() === v;
	const wShort = master.find(only('distance', 'short'));
	const wLong = master.find((s) => s !== wShort && only('distance', 'long')(s));
	const wAny = master.filter((s) => plain(s) && (s.tags.distance || []).length === 0);
	// 絞り込み（距離=短距離）に当たるか（matchesFilters と同じ決まり: 距離は空なら万能・値があればその値を含むか。脚質・バ場は選んでいない）
	const wantedShort = (id) => { const s = byId.get(id); return !s || !s.tags || (s.tags.distance || []).length === 0 || (s.tags.distance || []).includes('short'); };
	const wPending = ext.find((s) => s.tagsPending && !hinted.has(s.id));
	const used = new Set([wShort, wLong, wPending].map((s) => s.id));
	const anyPick = wAny.filter((s) => !used.has(s.id)).slice(0, 6);
	// W0 短距離／W1 長距離／W2・W3・W4・W5・W7・W8 万能／W6 タグ未設定
	const W = [wShort.id, wLong.id, anyPick[0].id, anyPick[1].id, anyPick[2].id, anyPick[3].id, wPending.id, anyPick[4].id, anyPick[5].id];
	const nameOf = (id) => (master.find((s) => s.id === id) || ext.find((s) => s.id === id)).name;
	const ref = (id, lv) => ({ skillId: id, name: nameOf(id), hintLevel: lv });
	const evDoc = { dataVersion: '2026-10-03a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries: [
		{ cardId: cA.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(W[0], 2)] }, { skills: [ref(W[1], 1)] }] },
			{ step: 2, choices: [{ skills: [ref(W[2], 3)] }, { skills: [] }] },
			{ step: 3, choices: [{ skills: [ref(W[3], 1)] }] }] },
		{ cardId: cB.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(W[4], 2)] }, { skills: [ref(W[5], 1)] }] },
			{ step: 2, choices: [{ skills: [ref(W[6], 1)] }] },
			{ step: 3, choices: [{ skills: [ref(W[7], 1)] }] }] },
	] };
	const BASE = { [W[0]]: 100, [W[1]]: 120, [W[2]]: 140, [W[3]]: 200, [W[4]]: 160, [W[5]]: 180, [W[6]]: 90, [W[7]]: 110, [W[8]]: 130 };
	hintIds.forEach((id) => { BASE[id] = 50; });   // 練習のヒント（Lv5）は 50 → 30 Pt ずつ
	const RARITY = { [W[3]]: 'gold' };
	const ptDoc = { dataVersion: '2026-10-03a', category: 'skillPt', note: 'テスト用の仕込み', entries: Object.keys(BASE).map((skillId) => ({ skillId, pt: BASE[skillId], rarity: RARITY[skillId] || 'white' })) };
	const stepDoc = { dataVersion: '2026-10-03a', category: 'skillStepUp', note: 'テスト用の仕込み', entries: [] };
	const descDoc = { dataVersion: '2026-10-03a', category: 'skillDescription', note: 'テスト用の仕込み', entries: Object.keys(BASE).map((skillId) => ({ skillId, text: (skillId === W[2] ? '長い説明 '.repeat(40) : '説明 ' + skillId) })) };
	const DISC = [10, 20, 30, 35, 40];
	const pay = (base, L, st) => Math.floor(base * (100 - (L > 0 ? DISC[L - 1] : 0) - (st || 0)) / 100);
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const umaLv7 = umas.find((u) => (u.awakeningSkills || []).some((r) => r.level >= 7));
	const umaLv5 = umas.find((u) => !(u.awakeningSkills || []).some((r) => r.level >= 7));

	const routes = async (page) => {
		await page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill(json(evDoc)));
		await page.route('**/data/character-event-skills.json*', (route) => route.fulfill(json({ dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] })));
		await page.route('**/data/skill-pt.json*', (route) => route.fulfill(json(ptDoc)));
		await page.route('**/data/skill-step-up.json*', (route) => route.fulfill(json(stepDoc)));
		await page.route('**/data/skill-descriptions.json*', (route) => route.fulfill(json(descDoc)));
	};
	const open = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, o.userData);
		await routes(sp.page);
		await sp.page.evaluate(({ roster, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
		}, { roster: o.roster === undefined ? { umaId: '', cardIds: [cA.id, cB.id, null, null, null, null] } : o.roster, scope: o.scope === undefined ? { skillIds: [W[8]], name: '', tiers: {}, updatedAt: '' } : o.scope });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(() => selectStepTab(0));
		await sp.page.waitForSelector('#deck-roster-panel [data-usd-el="pt-sum"],#deck-roster-panel [data-usd-el="pt-error"]', { timeout: 10000 }).catch(() => {});
		return sp;
	};
	const P = '#deck-roster-panel ';
	const readPanel = (page) => page.evaluate(() => {
		const h = document.getElementById('deck-roster-panel');
		const t = (i) => { const e = h.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent.trim() : null; };
		const num = (s) => (s === null ? null : Number(s.replace(/[^0-9]/g, '')));
		const rows = Array.from(h.querySelectorAll('.usd-roster-grow[data-skill-id]')).map((r) => ({
			id: r.getAttribute('data-skill-id'), gold: r.classList.contains('usd-roster-grow--gold'),
			pt: (r.querySelector('.usd-roster-pt') || {}).textContent || null, ref: !!r.querySelector('.usd-roster-pt--ref'),
			marks: Array.from(r.querySelectorAll('[role="cell"]')).map((c) => c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '△' : ''),
		}));
		const btns = (act) => Array.from(h.querySelectorAll('button[data-usd-act="' + act + '"]')).map((b) => ({ v: b.getAttribute('data-value'), key: b.getAttribute('data-member-key'), disabled: b.disabled, pressed: b.getAttribute('aria-pressed'), label: b.textContent.trim(), title: b.title, unselected: b.getAttribute('data-unselected'), dot: b.textContent.trim() === '!' }));
		return { total: num(t('pt-total')), count: num(t('pt-count')), rows, ids: rows.map((r) => r.id), filtering: t('pt-filtering'),
			status: btns('pt-status'), uma: btns('pt-uma'), sort: btns('sort'), events: btns('events'), badge: (document.getElementById('deck-roster-excluded') || {}).textContent,
			tabs: Array.from(h.querySelectorAll('[data-usd-el="roster-tabs"] .uma-subtab')).map((b) => ({ id: b.getAttribute('data-tab-id'), label: b.textContent.trim(), selected: b.getAttribute('aria-selected') === 'true', full: b.classList.contains('usd-roster-tab--full'), top: b.getBoundingClientRect().top })),
			nameText: t('name-text'), nameInput: (h.querySelector('[data-usd-el="name"]') || {}).value, hasEdit: !!h.querySelector('[data-usd-el="name-edit"]'), hasCommit: !!h.querySelector('[data-usd-el="name-commit"]'),
			commitDisabled: (h.querySelector('[data-usd-el="name-commit"]') || {}).disabled, hasCancel: !!h.querySelector('[data-usd-el="name-cancel"]'), hasReset: !!h.querySelector('[data-usd-el="name-reset"]'),
			limit: t('limit-notice'), none: t('rows-none'), hscroll: document.documentElement.scrollWidth - window.innerWidth,
			filters: Array.from(h.querySelectorAll('select[data-usd-act="filter"]')).map((s) => ({ axis: s.getAttribute('data-axis'), value: s.value, options: s.options.length })) };
	});
	const popover = (page) => page.evaluate(() => {
		const pop = document.querySelector('[data-usd-el="info-pop"]');
		if (!pop || pop.hidden) return { open: false };
		const t = (i) => { const e = pop.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent.trim() : null; };
		return { open: true, title: pop.querySelector('.uma-popover-title').textContent, theory: t('info-theory'), subtotals: t('info-subtotals'), filter: t('info-filter'), unpriced: t('info-unpriced'), umaReason: t('info-uma-reason'),
			umaNote: t('info-uma-note'), unselected: t('events-unselected'), none: t('events-none'),
			events: Array.from(pop.querySelectorAll('[data-usd-el="event"]')).map((e) => ({ key: e.getAttribute('data-event-key'), auto: !!e.querySelector('[data-usd-el="event-auto"]'),
				choices: Array.from(e.querySelectorAll('[data-usd-el="event-choice"]')).map((c) => ({ i: Number(c.getAttribute('data-choice')), on: c.getAttribute('aria-checked') === 'true', dim: c.querySelectorAll('[data-usd-dim]').length, text: c.textContent.trim() })) })) };
	});
	const esc = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(80); };
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'));

	const cC = hintOk[2];
	const popoverOpen = async (page) => (await popover(page)).open;
	const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
	const lumOf = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
	const cr = (a, b) => { const l1 = lumOf(a), l2 = lumOf(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
	// ───── ここから段7b（2026-10-03）の検査 ─────
	const SP = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, y: window.scrollY }));
	const rect = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; }, sel);
	const stored = (page) => page.evaluate(() => {
		const u = JSON.parse(localStorage.getItem('umaSkillDeck:userData') || '{}');
		return { rosters: (u.rosters || []).map((r) => ({ id: r.rosterId, name: r.name, cards: (r.cardIds || []).filter(Boolean).length })), templates: (u.templates || []).map((t) => ({ id: t.templateId, name: t.name, n: t.skillIds.length })),
			draftRoster: JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'), draftScope: JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') };
	});
	const mkRoster = (i, cards) => ({ rosterId: 'r_b' + i, name: '編成' + (i + 1), umaId: '', star: 0, awakeningLevel: 0, cardIds: cards || [cA.id, null, null, null, null, null], createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z' });
	const baseUser = (o) => Object.assign({}, USER_DATA, o);
	const openTab = async (o) => { const sp = await open(o); if (o && o.tab) { await sp.page.evaluate((t) => selectStepTab(t), o.tab); await sp.page.waitForTimeout(300); } return sp; };

	/* ───── ①② 名前つきのタブ ─────
	   段8（C-120）で外した。①の編成のタブと②の因子周回のタブ（✎ ✓ ↩ ×・確認の小窓・10件の知らせ）を無くし、
	   セットの名前・一覧・削除は共通の見出しの帯（#deck-set-bar）に1つにまとめた（新しい仕様は blocks-8.mjs の段8(B)）。 */

	/* ───── ⓪ ヘッダー（special。375px でも1行・「？」から使い方・注意） ───── */
	for (const w of [375, 1280]) {
		const sp = await openTab({ w, h: 900, tab: 0 });
		const tag = '段7b(⓪) ' + w + 'px: ';
		const hd = await sp.page.evaluate(() => {
			const hd = document.querySelector('header');
			const r = (e) => { const b = e.getBoundingClientRect(); return { t: b.top, h: b.height, l: b.left, r: b.right, w: b.width }; };
			const label = document.querySelector('#tool-dropdown-btn .tool-switch-label');
			return { text: hd.textContent.replace(/\s+/g, ' '), h1: document.querySelector('header h1').textContent.replace(/\s+/g, ' ').trim(), title: document.title,
				h1r: r(document.querySelector('header h1')), toolr: r(document.getElementById('tool-dropdown-btn')), helpr: r(document.querySelector('.help-open-btn')), hdr: r(hd),
				labelShown: label ? getComputedStyle(label).display !== 'none' : null, toolAria: document.getElementById('tool-dropdown-btn').getAttribute('aria-label'),
				helpAria: document.querySelector('.help-open-btn').getAttribute('aria-label'), helpTitle: document.querySelector('.help-open-btn').title, helpText: document.querySelector('.help-open-btn').textContent.trim(),
				badges: [!!document.getElementById('ui-mode-badge'), !!document.getElementById('alpha-badge')], alphaNote: !!document.getElementById('deck-roster-alpha'), helpBtns: document.querySelectorAll('[onclick="toggleHelp()"]').length };
		});
		assert(!hd.text.includes('ゲーム画面のスクリーンショットから') && hd.h1.endsWith('β版') && !hd.h1.includes('α') && hd.title.includes('2nd Edition') && !hd.badges[0] && !hd.badges[1] && !hd.alphaNote,
			tag + '副題が無い・「β版」＋ピル「2nd Edition」（段7d の追加・B。h1 は「β版」で終わる）・「新UI」「一部αテスト中」のバッジが無い・①の中の赤い注意書きも無い', { h1: hd.h1, title: hd.title, badges: hd.badges, alphaNote: hd.alphaNote });
		assert(hd.helpText === '?' && hd.helpAria === '使い方・注意' && hd.helpTitle === '使い方・注意' && hd.helpr.w <= 36 && hd.helpBtns === 1, tag + '「使い方・注意」は「？」だけの丸いボタン（aria-label と title が「使い方・注意」。横幅は最小）', { w: hd.helpr.w, aria: hd.helpAria });
		const oneRow = Math.abs(hd.h1r.t + hd.h1r.h / 2 - (hd.toolr.t + hd.toolr.h / 2)) < 12 && Math.abs(hd.toolr.t + hd.toolr.h / 2 - (hd.helpr.t + hd.helpr.h / 2)) < 12 && hd.h1r.h < 50;
		assert(oneRow, tag + 'タイトル・ツール切替・？ が1行に並ぶ（タイトルは1行）', { h1: hd.h1r, tool: hd.toolr, help: hd.helpr });
		assert(hd.toolAria === 'ツール切替' && (w === 375 ? hd.labelShown === false : hd.labelShown === true), tag + (w === 375 ? '375px ではツール切替をアイコンだけ（aria-label 付き）にして収める' : '1280px ではツール切替の文字が出ている'), { shown: hd.labelShown, aria: hd.toolAria });
		await sp.page.click('.help-open-btn');
		await sp.page.waitForTimeout(250);
		assert(await sp.page.isVisible('#help-box') && (await sp.page.textContent('#help-box')).includes('注意'), tag + '「？」を押すと使い方・注意が開く（注意の欄つき）');
		await sp.page.keyboard.press('Escape');
		const sz = await SP(sp.page);
		assert(sz.sw <= sz.iw && jsErrors(sp.errors).length === 0, tag + '横はみ出し0・コンソールのエラー0', { sz, errors: jsErrors(sp.errors) });
		await sp.ctx.close();
	}

	/* ───── ③④⑤⑦⑧(1) 本育成パネルの上部 ───── */
	for (const w of [375, 1280]) {
		const sp = await openTab({ w, h: 900, tab: 0, roster: { umaId: umaLv7.id, cardIds: [cA.id, cB.id, cC.id, null, null, null] } });
		const tag = '段7b(③④⑤⑦⑧) ' + w + 'px: ';
		const top = await sp.page.evaluate(() => {
			const h = document.getElementById('deck-roster-panel');
			const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, w: b.width, h: b.height }; };
			const uma = h.querySelector('.usd-roster-umabox');
			const pickbtn = h.querySelector('[data-usd-el="pick-uma"]');
			const cs = getComputedStyle(uma);
			const selects = Array.from(h.querySelectorAll('select[data-usd-act="filter"]'));
			const legend = h.querySelector('.usd-roster-legend');
			const slots = Array.from(h.querySelectorAll('[data-usd-el="card-slots"] .usd-roster-slot'));
			return {
				subHeads: h.querySelectorAll('.usd-roster-h--sub').length, infoBtn: r(h.querySelector('[data-usd-el="uma-info-btn"]')), umaBox: r(uma), clearBtn: r(uma.querySelector('.usd-roster-clearbtn')),
				umaBg: cs.backgroundColor, umaFg: getComputedStyle(pickbtn).color, umaBadge: !!uma.querySelector('.usd-roster-umamark'), umaTitle: pickbtn.title, umaAria: pickbtn.getAttribute('aria-label'), umaName: uma.querySelector('.usd-roster-pickname').textContent.trim(),
				filterLabels: h.querySelectorAll('.usd-roster-filterlabel').length, selects: selects.map((s) => ({ axis: s.getAttribute('data-axis'), first: s.options[0].textContent, top: s.getBoundingClientRect().top, w: s.getBoundingClientRect().width })),
				legendShown: legend ? getComputedStyle(legend).display !== 'none' : null, legendItems: legend ? legend.querySelectorAll('li').length : 0,
				slots: slots.map((s) => { const b = s.querySelector('[data-usd-el="badge"]'); const nm = s.querySelector('.usd-roster-pickname'); const btn = s.querySelector('.usd-roster-pickbtn'); const cl = s.querySelector('.usd-roster-clearbtn');
					return { badge: b ? b.textContent.trim() : null, name: nm.textContent.trim(), title: btn.title, aria: btn.getAttribute('aria-label'), ellipsis: getComputedStyle(nm).textOverflow, clear: cl ? r(cl) : null, box: r(s) }; }),
				umaToggles: Array.from(h.querySelectorAll('button[data-usd-act="pt-uma"]')).map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), disabled: b.disabled, title: b.title })),
				statusToggles: Array.from(h.querySelectorAll('button[data-usd-act="pt-status"]')).map((b) => b.textContent.trim()), total: (h.querySelector('[data-usd-el="pt-sumrow"]') || { getBoundingClientRect: () => null }).getBoundingClientRect().height
			};
		});
		assert(top.subHeads === 0 && top.infoBtn && top.umaBox && top.infoBtn.l >= top.umaBox.r - 1 && Math.abs((top.infoBtn.t + top.infoBtn.h / 2) - (top.umaBox.t + top.umaBox.h / 2)) < 8,
			tag + '育成ウマ娘のパネル名の行（名前＋（i））は無く、（i）は選択欄の右隣', { info: top.infoBtn, box: top.umaBox, subHeads: top.subHeads });
		assert(top.filterLabels === 0 && top.selects.map((s) => s.first).join('|') === '距離指定なし|脚質指定なし|バ場指定なし' && new Set(top.selects.map((s) => Math.round(s.top))).size === 1,
			tag + '距離・脚質・バ場のラベルの行は無く、セレクトの「指定なし」は「距離指定なし」「脚質指定なし」「バ場指定なし」で、1行のまま', top.selects);
		assert(cr(rgb(top.umaFg), rgb(top.umaBg)) >= 7 && lumOf(rgb(top.umaBg)) < 0.1 && lumOf(rgb(top.umaFg)) > 0.9, tag + '育成ウマ娘を選んだ欄は文字が白・背景が黒（選んでいるタブと同じ暗い色）', { fg: top.umaFg, bg: top.umaBg });
		assert(top.clearBtn && top.clearBtn.r <= top.umaBox.r + 1 && top.clearBtn.r >= top.umaBox.r - 2 && top.clearBtn.l > top.umaBox.l + top.umaBox.w / 2, tag + '× は欄の中の右端のまま', { clear: top.clearBtn, box: top.umaBox });
		assert(top.umaBadge && top.umaTitle.includes(top.umaName) && top.umaAria === '育成ウマ娘：' + top.umaTitle, tag + '育成ウマ娘の欄の名前の前に ◇ のバッジ。全文は title と aria-label', { title: top.umaTitle, aria: top.umaAria });
		assert(top.slots.length === 6 && top.slots.slice(0, 3).every((s, i) => s.badge === String(i + 1) && s.title.length >= s.name.length && s.aria === (i + 1) + '枚目：' + s.title && s.ellipsis === 'ellipsis' && s.clear)
			&& top.slots.slice(3).every((s, i) => s.badge === String(i + 4) && s.name === 'サポカを選ぶ'),
			tag + 'カードの欄の名前の前に 1〜6 のバッジ（空きは「サポカを選ぶ」）。名前は省略記号で切り、全文は title と aria-label', top.slots.map((s) => [s.badge, s.name]));
		assert(top.umaToggles.length === 1 && top.umaToggles[0].text === '覚醒Lv5' && top.statusToggles.join('|') === '勉強家|切れ者' && !top.umaToggles[0].disabled && top.umaToggles[0].pressed === 'false',
			tag + '「ヒントLv3」のボタンは無く、「覚醒ヒントLv5」だけ（覚醒レベル7のウマ娘なので押せる・既定は押していない＝Lv3）。「勉強家」「切れ者」はそのまま', top.umaToggles);
		assert(top.legendShown === null, tag + '表の最下段の凡例（育成ウマ娘・カード名の一覧）は、どの幅でも出さない（段7c の L。段7b の「広い幅は残す」を置き換え）', { legendShown: top.legendShown });
		// 覚醒ヒントLv5 の入れ替え
		await sp.page.click(P + 'button[data-usd-act="pt-uma"]');
		let st = await sp.page.evaluate(() => ({ pressed: document.querySelector('#deck-roster-panel button[data-usd-act="pt-uma"]').getAttribute('aria-pressed'), draft: JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')) }));
		assert(st.pressed === 'true' && st.draft.pt && st.draft.pt.umaHintLevel === 5, tag + '押すと Lv5（保存の値 umaHintLevel は 5）', st.draft.pt);
		await sp.page.click(P + 'button[data-usd-act="pt-uma"]');
		st = await sp.page.evaluate(() => ({ pressed: document.querySelector('#deck-roster-panel button[data-usd-act="pt-uma"]').getAttribute('aria-pressed'), draft: JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')) }));
		assert(st.pressed === 'false' && st.draft.pt && st.draft.pt.umaHintLevel === 3, tag + 'もう一度押すと Lv3（既定）に戻る', st.draft.pt);
		const sz = await SP(sp.page);
		assert(sz.sw <= sz.iw && jsErrors(sp.errors).length === 0, tag + '横はみ出し0・コンソールのエラー0', { sz, errors: jsErrors(sp.errors) });
		await sp.ctx.close();
	}
	{
		// 覚醒レベルが足りないウマ娘: 押せない（title と（?）の説明は新しい文言）
		const sp = await openTab({ w: 1280, h: 900, tab: 0, roster: { umaId: umaLv5.id, cardIds: [cA.id, null, null, null, null, null] } });
		const b = await sp.page.evaluate(() => { const e = document.querySelector('#deck-roster-panel button[data-usd-act="pt-uma"]'); return { disabled: e.disabled, title: e.title, text: e.textContent.trim() }; });
		await sp.page.click(P + '[data-usd-el="pt-help-btn"]');
		const pp = await popover(sp.page);
		assert(b.disabled && b.title === '覚醒ヒントLv5は覚醒レベル7のウマ娘のみ選べます' && pp.umaReason === '覚醒ヒントLv5は覚醒レベル7のウマ娘のみ選べます', '段7b(⑤): 覚醒レベル7でないウマ娘では「覚醒ヒントLv5」は押せず、title と（?）の説明は「覚醒ヒントLv5は覚醒レベル7のウマ娘のみ選べます」', { b, reason: pp.umaReason });
		await sp.ctx.close();
	}

	/* ───── ⑧⑨ 列見出し（2行。バッジ／！と漏斗）・押せるバッジ・小窓への再入場 ───── */
	for (const w of [375, 1280]) {
		const sp = await openTab({ w, h: 900, tab: 0 });
		const tag = '段7b(⑧⑨) ' + w + 'px: ';
		const hd = async () => sp.page.evaluate(() => {
			const h = document.getElementById('deck-roster-panel');
			return Array.from(h.querySelectorAll('.usd-roster-gh[role="columnheader"]')).slice(1).map((c) => {
				const g = c.querySelector('.usd-roster-ghbtns');
				const ev = c.querySelector('[data-usd-el="events-btn"]');
				const sort = c.querySelector('[data-usd-el="sort-btn"]');
				const first = g.firstElementChild;
				const sr = sort.getBoundingClientRect(); const fr = first.getBoundingClientRect();
				const path = sort.querySelector('svg path');
				return { ev: ev ? { text: ev.textContent.trim(), aria: ev.getAttribute('aria-label'), un: ev.getAttribute('data-unselected'), tag: ev.tagName, w: ev.getBoundingClientRect().width, shadow: getComputedStyle(ev).boxShadow, expanded: ev.getAttribute('aria-expanded') } : null,
					firstTag: first.tagName, firstText: first.textContent.trim(), twoRows: sr.top >= fr.bottom - 1, sortW: Math.round(sr.width), sortH: Math.round(sr.height), svg: !!path, fill: path ? getComputedStyle(path).fill : null, pressed: sort.getAttribute('aria-pressed'), sortText: sort.textContent.trim(),
					triangle: c.textContent.includes('▼') };
			});
		});
		let cols = await hd();
		// 並び: ◇（育成ウマ娘）／1（A: 未選択のイベントあり）／2（B: 未選択のイベントあり）／3（C: 選ぶ必要のあるイベント無し）／4〜6（空き）
		const [colU, c1, c2, c3, c4] = cols;
		assert(cols.every((c) => c.twoRows && !c.triangle && c.svg && c.sortW >= 24 && c.sortH >= 24 && (w > 640 ? c.sortH >= 28 : true) && c.sortText === ''), tag + '列見出しは2行（上＝バッジ／！、下＝漏斗）。「▼」は無く、漏斗は SVG で 28px 以上（スマホは高さ 24px 以上を許す。段7c）', cols.map((c) => [c.twoRows, c.sortW, c.sortH]));
		assert(c1.ev && c1.ev.tag === 'BUTTON' && c1.ev.text === '!' && c1.ev.aria === '1番のカードのイベントを選ぶ（未選択1件）' && c2.ev && c2.ev.text === '!' && c2.ev.aria === '2番のカードのイベントを選ぶ（未選択1件）',
			tag + '選ぶ必要のあるイベントがあり未選択が残るカードの列は、バッジの代わりに「!」のボタン（aria-label「N番のカードのイベントを選ぶ（未選択M件）」）', { c1: c1.ev, c2: c2.ev });
		assert(!colU.ev && colU.firstTag === 'SPAN' && !c3.ev && c3.firstTag === 'SPAN' && c3.firstText === '3' && !c4.ev && c4.firstText === '4',
			tag + '◇（育成ウマ娘）と、選ぶ必要のあるイベントが無いカードの番号と空きは、ボタンにしない（今までのバッジのまま）', { u: colU.firstTag, c3: [c3.firstTag, c3.firstText], c4: c4.firstText });
		assert(c1.ev.w >= 18 && /rgba?\(\d+, \d+, \d+, 0?\.\d+\) 0px 1px 2px/.test(c1.ev.shadow), tag + '押せるバッジは「!」の角丸の四角で、枠と軽い影（ボタンだとひと目で分かる）', { w: c1.ev.w, shadow: c1.ev.shadow });
		// 漏斗: 押していない＝輪郭、押している＝塗りつぶし
		assert(c1.fill === 'none' && c1.pressed === 'false', tag + '漏斗は押していないときは輪郭だけ（fill なし）', { fill: c1.fill });
		await sp.page.click(P + '[data-usd-el="sort-btn"][data-member-key="1"]');
		cols = await hd();
		assert(cols[1].pressed === 'true' && cols[1].fill !== 'none' && cols[0].fill === 'none', tag + '押している漏斗は塗りつぶし（aria-pressed=true。同時に1つだけ）', { fill: cols[1].fill });
		await sp.page.click(P + '[data-usd-el="sort-btn"][data-member-key="1"]');
		// 「!」を押す → 小窓。すべて選ぶと番号のバッジに変わり、押すと小窓にもう一度入れる
		await sp.page.click(P + '[data-usd-el="events-btn"][data-member-key="1"]');
		await sp.page.waitForTimeout(300);
		let pp = await popover(sp.page);
		assert(pp.open && pp.unselected === '未選択1件' && pp.events.length === 2 && pp.events[0].choices.every((c) => !c.on), tag + '「!」を押すと、イベントの選択の小窓が開く（未選択1件）', { unselected: pp.unselected, events: pp.events.length });
		const titleBadge = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="info-pop"] .uma-popover-title .usd-roster-legend-no'); return b ? b.textContent.trim() : null; });
		assert(titleBadge === '1', tag + '小窓の見出しに、カード名の前の番号のバッジ（1）', { titleBadge });
		await sp.page.click('[data-usd-el="info-pop"] [data-usd-el="event-choice"][data-event-key$="#0"][data-choice="0"]');
		await sp.page.waitForTimeout(250);
		pp = await popover(sp.page);
		assert(pp.open && pp.unselected === '未選択0件', tag + '選択肢を選ぶと小窓は開いたまま、未選択0件になる', { unselected: pp.unselected });
		await esc(sp.page);
		cols = await hd();
		assert(cols[1].ev && cols[1].ev.text === '1' && cols[1].ev.aria === '1番のカードのイベントを選ぶ' && cols[1].ev.tag === 'BUTTON', tag + 'すべて選ぶと、「!」が番号のバッジ（押せるボタンのまま）に変わる', cols[1].ev);
		await sp.page.click(P + '[data-usd-el="events-btn"][data-member-key="1"]');
		await sp.page.waitForTimeout(250);
		pp = await popover(sp.page);
		assert(pp.open && pp.unselected === '未選択0件', tag + '番号のバッジを押すと、イベントの選択の小窓にもう一度入れる', { open: pp.open });
		await esc(sp.page);
		const sz = await SP(sp.page);
		assert(sz.sw <= sz.iw && jsErrors(sp.errors).length === 0, tag + '横はみ出し0・コンソールのエラー0', { sz, errors: jsErrors(sp.errors) });
		await sp.ctx.close();
	}

	/* ───── ⑩ イベントの小窓（広い幅は2カラム／スマホは1カラムでスワイプ） ───── */
	{
		const sp = await openTab({ w: 1280, h: 900, tab: 0 });
		const tag = '段7b(⑩) 1280px: ';
		await sp.page.click(P + '[data-usd-el="events-btn"][data-member-key="1"]');
		await sp.page.waitForTimeout(400);
		const g = await sp.page.evaluate(() => {
			const pop = document.querySelector('[data-usd-el="info-pop"]');
			const l = pop.querySelector('[data-usd-el="events-pane-events"]'); const r = pop.querySelector('[data-usd-el="events-pane-skills"]');
			const lb = l.getBoundingClientRect(); const rb = r.getBoundingClientRect(); const pb = pop.getBoundingClientRect();
			const items = Array.from(r.querySelectorAll('[data-usd-el="ev-skill"]')).map((li) => ({ id: li.getAttribute('data-skill-id'), maybe: li.hasAttribute('data-usd-maybe'), dim: li.hasAttribute('data-usd-dim'),
				tag: (li.querySelector('[data-usd-el="ev-skill-tag"]') || {}).textContent || null, rows: li.children.length, name: li.children[0].firstChild.textContent.trim(), pt: (li.querySelector('[data-usd-el="ev-skill-pt"]') || {}).textContent || null,
				desc: (li.querySelector('[data-usd-el="ev-skill-desc"]') || {}).textContent || null }));
			const sw = pop.querySelector('[data-usd-el="events-switch"]');
			const d = r.querySelector('[data-usd-el="ev-skill-desc"]');
			return { popW: pb.width, left: { l: lb.left, r: lb.right }, right: { l: rb.left, r: rb.right }, items, switchShown: sw ? getComputedStyle(sw).display !== 'none' : null,
				descScroll: d ? { sw: d.scrollWidth, cw: d.clientWidth, bar: getComputedStyle(d).scrollbarWidth, ox: getComputedStyle(d).overflowX, ws: getComputedStyle(d).whiteSpace } : null,
				title: pop.querySelector('.uma-popover-title').textContent.trim(), heading: (pop.querySelector('[data-usd-el="ev-skills-title"]') || {}).textContent };
		});
		assert(g.popW > 700 && g.right.l >= g.left.r - 1 && g.right.l > g.left.l + 300 && g.switchShown === false, tag + '2カラム（左＝イベント／右＝取得できるスキル）。小窓は広がり、切り替えのボタンは出ない', { popW: g.popW, left: g.left, right: g.right });
		assert(g.heading === '取得できるスキル' && g.items.length > 0, tag + '右の一覧は「取得できるスキル」', { heading: g.heading, n: g.items.length });
		// 並び: いまの選択（自動を含む）で得る●が先、未選択のイベントしだいのもの（△）が薄く「未選択」の印つきで後ろ
		const firstMaybe = g.items.findIndex((x) => x.maybe);
		assert(firstMaybe > 0 && g.items.slice(0, firstMaybe).every((x) => !x.maybe && x.tag === null) && g.items.slice(firstMaybe).every((x) => x.maybe && x.tag === '未選択'), tag + '右の一覧は、いまの選択で得る●のスキルが先、未選択のイベントしだいのスキルが後ろで「未選択」の印つき', g.items.map((x) => [x.id === W[2] ? 'W2' : x.id, x.maybe]));
		const w0 = g.items.find((x) => x.id === W[0]);
		assert(w0 && w0.rows === 3 && w0.pt === '基礎 ' + BASE[W[0]] + ' Pt' && w0.desc === '説明 ' + W[0], tag + '1つのスキルは3行（スキル名／「基礎 B Pt」／公式の説明文）', w0);
		// 段13 の仕上げ（C-127）: 説明文は「1行・横に送る」をやめ、小窓の幅で折り返して全文を出す
		assert(g.descScroll && g.descScroll.ws === 'normal' && g.descScroll.sw <= g.descScroll.cw + 1, tag + '説明文は小窓の幅で折り返す（横にはみ出さない）', g.descScroll);
		const longId = W[2];
		const longDesc = await sp.page.evaluate((id) => { const d = document.querySelector('[data-usd-el="ev-skill-desc"][data-skill-id="' + id + '"]'); return d ? { sw: d.scrollWidth, cw: d.clientWidth, h: d.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(d).lineHeight), text: d.textContent.length } : null; }, longId);
		assert(longDesc && longDesc.sw <= longDesc.cw + 1 && longDesc.h > longDesc.lh * 1.5, tag + '長い説明文は折り返して2行以上になり、全文が見える（段13 の仕上げ）', longDesc);
		// 選択を変えると右も描き直される（W0 を選ぶと W0 が●の側へ）
		await sp.page.click('[data-usd-el="info-pop"] [data-usd-el="event-choice"][data-event-key$="#0"][data-choice="0"]');
		await sp.page.waitForTimeout(300);
		const after = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-pop"] [data-usd-el="ev-skill"]')).map((li) => [li.getAttribute('data-skill-id'), li.hasAttribute('data-usd-maybe')]));
		assert(after.find((x) => x[0] === W[0]) && after.find((x) => x[0] === W[0])[1] === false && !after.find((x) => x[0] === W[1]), tag + '選択を変えると右も描き直される（選んだ側のスキルが●の側に、選ばなかった側は消える）', after.map((x) => x.join(':')));
		await esc(sp.page);
		// 絞り込み（距離＝短距離）で外れるスキルは、灰色で残る
		await sp.page.selectOption(P + 'select[data-axis="distance"]', 'short');
		await sp.page.click(P + '[data-usd-el="events-btn"][data-member-key="1"]');
		await sp.page.waitForTimeout(300);
		const dims = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-pop"] [data-usd-el="ev-skill"]')).map((li) => ({ id: li.getAttribute('data-skill-id'), dim: li.hasAttribute('data-usd-dim'), color: getComputedStyle(li.querySelector('.usd-ev-skill-name')).color })));
		assert(dims.some((x) => x.dim) && dims.some((x) => !x.dim) && dims.filter((x) => x.dim).every((x) => wantedShort(x.id) === false) && dims.filter((x) => !x.dim).every((x) => wantedShort(x.id) === true) && new Set(dims.filter((x) => x.dim).map((x) => x.color)).size === 1 && dims.find((x) => x.dim).color !== dims.find((x) => !x.dim).color,
			tag + '絞り込み（距離）で外れるスキルは灰色で残る', dims.map((x) => [x.id === W[1] ? 'W1' : x.id, x.dim]));
		await esc(sp.page);
		const sz = await SP(sp.page);
		assert(sz.sw <= sz.iw && jsErrors(sp.errors).length === 0, tag + '横はみ出し0・コンソールのエラー0', { sz, errors: jsErrors(sp.errors) });
		await sp.ctx.close();
	}
	{
		const sp = await openTab({ w: 375, h: 800, tab: 0 });
		const tag = '段7b(⑩) 375px: ';
		await sp.page.click(P + '[data-usd-el="events-btn"][data-member-key="1"]');
		await sp.page.waitForTimeout(400);
		const g = await sp.page.evaluate(() => {
			const pop = document.querySelector('[data-usd-el="info-pop"]');
			const panes = pop.querySelector('[data-usd-el="events-panes"]');
			const sw = pop.querySelector('[data-usd-el="events-switch"]');
			const pb = pop.getBoundingClientRect();
			return { popW: pb.width, popBottom: pb.bottom, ih: window.innerHeight, snap: getComputedStyle(panes).scrollSnapType, ox: getComputedStyle(panes).overflowX, sw: sw ? { text: sw.textContent.trim(), aria: sw.getAttribute('aria-label'), shown: getComputedStyle(sw).display !== 'none', w: sw.getBoundingClientRect().width, inHead: !!sw.closest('.uma-popover-head') } : null,
				scrollW: panes.scrollWidth, clientW: panes.clientWidth, paneW: pop.querySelector('[data-usd-el="events-pane-skills"]').getBoundingClientRect().width };
		});
		assert(g.popW === 375 && Math.abs(g.popBottom - g.ih) < 2 && g.snap.startsWith('x') && g.ox === 'auto' && g.scrollW >= g.clientW * 1.9, tag + '1カラム（ボトムシート）。2つのペインを横に並べて scroll-snap でスワイプ', g);
		assert(g.sw && g.sw.shown && g.sw.inHead && g.sw.text === 'スキル ›' && g.sw.aria === '取得できるスキルを見る', tag + '見出しの右に切り替えのボタン「スキル ›」（aria-label つき）', g.sw);
		await sp.page.click('[data-usd-el="events-switch"]');
		await sp.page.waitForTimeout(800);
		const g2 = await sp.page.evaluate(() => { const pop = document.querySelector('[data-usd-el="info-pop"]'); const panes = pop.querySelector('[data-usd-el="events-panes"]'); const sw = pop.querySelector('[data-usd-el="events-switch"]');
			return { left: panes.scrollLeft, cw: panes.clientWidth, text: sw.textContent.trim(), aria: sw.getAttribute('aria-label'), n: pop.querySelectorAll('[data-usd-el="ev-skill"]').length }; });
		assert(Math.abs(g2.left - g2.cw) <= 2 && g2.text === '‹ イベント' && g2.aria === 'イベントの選択に戻る' && g2.n > 0, tag + '押すと「取得できるスキル」のペインへ（ボタンは「‹ イベント」に変わる）', g2);
		await sp.page.click('[data-usd-el="events-switch"]');
		await sp.page.waitForTimeout(800);
		const g3 = await sp.page.evaluate(() => { const panes = document.querySelector('[data-usd-el="info-pop"] [data-usd-el="events-panes"]'); return { left: panes.scrollLeft, text: document.querySelector('[data-usd-el="events-switch"]').textContent.trim() }; });
		assert(g3.left <= 2 && g3.text === 'スキル ›', tag + 'もう一度押すとイベントのペインに戻る', g3);
		// 説明文が読めなければ「説明文は準備中です」
		await esc(sp.page);
		await sp.ctx.close();
	}
	{
		// 説明文が読めなければ、各スキルの3行目は「説明文は準備中です」（小窓を開いたときに1回だけ読む。読めなければ次に開いたときにもう一度試す）
		const sp = await openTab({ w: 1280, h: 900, tab: 0 });
		await sp.page.unroute('**/data/skill-descriptions.json*');
		await sp.page.route('**/data/skill-descriptions.json*', (route) => route.fulfill({ status: 500, body: 'x' }));
		await sp.page.click(P + '[data-usd-el="events-btn"][data-member-key="1"]');
		await sp.page.waitForTimeout(600);
		const d = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-pop"] [data-usd-el="ev-skill-desc"]')).map((e) => e.textContent.trim()));
		assert(d.length > 0 && d.every((t) => t === '説明文は準備中です'), '段7b(⑩): 説明文を読めなければ、各スキルの3行目は「説明文は準備中です」', d.slice(0, 3));
		await esc(sp.page);
		await sp.ctx.close();
	}

	/* ───── ⑥ 操作しても画面の表示位置が変わらない（375px。ページをスクロールして表を画面の途中に置き、各ボタンを押す前後を測る） ───── */
	{
		const rosterB = mkRoster(0, [cA.id, cB.id, cC.id, null, null, null]);
		const scopeB = { skillIds: [W[8], hintIds[0], hintIds[1]], name: '', tiers: {}, updatedAt: '' };
		const sp = await openTab({ w: 375, h: 760, tab: 0, userData: baseUser({ rosters: [rosterB] }), roster: { umaId: umaLv7.id, cardIds: [cA.id, cB.id, cC.id, null, null, null] }, scope: scopeB });
		const rows = [];
		const meas = (sel) => sp.page.evaluate((sel) => { const e = document.querySelector(sel); return e ? { y: window.scrollY, top: e.getBoundingClientRect().top } : null; }, sel);
		const mid = async (sel) => { await sp.page.evaluate((sel) => { const e = document.querySelector(sel); window.scrollTo(0, Math.max(0, e.getBoundingClientRect().top + window.scrollY - 330)); }, sel); await sp.page.waitForTimeout(120); };
		const run = async (label, sel, act, o = {}) => {
			if (!o.noMid) await mid(sel);
			const b = await meas(sel);
			await act();
			await sp.page.waitForTimeout(260);
			const a = await meas(o.after || sel);
			const row = { label, dy: a ? Math.round((a.y - b.y) * 10) / 10 : null, dtop: a ? Math.round((a.top - b.top) * 10) / 10 : null };
			row.ok = !!a && Math.abs(row.dy) <= 2 && Math.abs(row.dtop) <= 2;
			rows.push(row);
		};
		const click = (sel) => () => sp.page.click(sel);
		const S = (a) => P + a;
		// 表の列見出し・合計の行・絞り込み
		await run('並べ替え（漏斗）', S('[data-usd-el="sort-btn"][data-member-key="2"]'), click(S('[data-usd-el="sort-btn"][data-member-key="2"]')));
		await run('並べ替え（もう一度）', S('[data-usd-el="sort-btn"][data-member-key="2"]'), click(S('[data-usd-el="sort-btn"][data-member-key="2"]')));
		await run('勉強家', S('button[data-usd-act="pt-status"][data-value="benkyo"]'), click(S('button[data-usd-act="pt-status"][data-value="benkyo"]')));
		await run('切れ者', S('button[data-usd-act="pt-status"][data-value="kire"]'), click(S('button[data-usd-act="pt-status"][data-value="kire"]')));
		await run('覚醒ヒントLv5', S('button[data-usd-act="pt-uma"]'), click(S('button[data-usd-act="pt-uma"]')));
		await run('距離の絞り込み', S('select[data-axis="distance"]'), () => sp.page.selectOption(S('select[data-axis="distance"]'), 'short'));
		await run('距離の絞り込み（解除）', S('select[data-axis="distance"]'), () => sp.page.selectOption(S('select[data-axis="distance"]'), ''));
		// 小窓を開く／閉じる（閉じて戻るときもページの位置を変えない）
		await run('！／番号（イベントの小窓を開く）', S('[data-usd-el="events-btn"][data-member-key="1"]'), click(S('[data-usd-el="events-btn"][data-member-key="1"]')));
		// 小窓の中の選択肢（小窓の中のスクロール位置が変わらない）
		const yBefore = await sp.page.evaluate(() => { const l = document.querySelector('[data-usd-el="info-pop"] [data-usd-el="events-pane-events"]'); const w = l.parentElement.parentElement; return { y: window.scrollY, l: l.scrollTop, wrap: document.querySelector('[data-usd-el="info-pop"] .uma-popover-body').scrollTop }; });
		await sp.page.click('[data-usd-el="info-pop"] [data-usd-el="event-choice"][data-event-key$="#0"][data-choice="1"]');
		await sp.page.waitForTimeout(250);
		const yAfter = await sp.page.evaluate(() => { const l = document.querySelector('[data-usd-el="info-pop"] [data-usd-el="events-pane-events"]'); return { y: window.scrollY, l: l.scrollTop, wrap: document.querySelector('[data-usd-el="info-pop"] .uma-popover-body').scrollTop }; });
		rows.push({ label: '小窓の中の選択肢（ページ・小窓の中の位置）', dy: yAfter.y - yBefore.y, dtop: (yAfter.l - yBefore.l) + (yAfter.wrap - yBefore.wrap), ok: yAfter.y === yBefore.y && yAfter.l === yBefore.l && yAfter.wrap === yBefore.wrap });
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		const afterClose = await meas(S('[data-usd-el="events-btn"][data-member-key="1"]'));
		rows.push({ label: '小窓を閉じて戻る', dy: afterClose.y - yBefore.y, dtop: 0, ok: afterClose.y === yBefore.y });
		await run('合計の（?）を開く', S('[data-usd-el="pt-help-btn"]'), click(S('[data-usd-el="pt-help-btn"]')));
		await sp.page.keyboard.press('Escape');
		await run('育成ウマ娘の（i）を開く', S('[data-usd-el="uma-info-btn"]'), click(S('[data-usd-el="uma-info-btn"]')));
		await sp.page.keyboard.press('Escape');
		await run('スキル名（説明の小窓を開く）', S('.usd-roster-grow[data-skill-id] [data-usd-info]'), click(S('.usd-roster-grow[data-skill-id] [data-usd-info]')));
		await sp.page.keyboard.press('Escape');
		// 段8（C-120）で①の編成のタブ（✎ ✓ ↩ ×・タブの選び直し）と②のタブ・「本育成編成」のボタンと小窓を無くしたので、それらの操作の行は外した
		// （帯の操作は blocks-8.mjs の段8(B)）。残るのは②の「再分類」
		await sp.page.evaluate(() => selectStepTab(1));
		await sp.page.waitForTimeout(300);
		const T = '#deck-template-panel ';
		// 段9（C-121）: ②の再分類のモードは無くなった。代わりにアイコンのパレット（選択を替えるだけで、ページは動かない）
		await run('②パレット（○）', T + '[data-usd-el="palette-b"]', click(T + '[data-usd-el="palette-b"]'));
		await run('②パレット（◎）', T + '[data-usd-el="palette-a"]', click(T + '[data-usd-el="palette-a"]'));
		const table = rows.map((r) => r.label + ': Δスクロール ' + r.dy + 'px・Δボタン位置 ' + r.dtop + 'px' + (r.ok ? '' : '  ← NG')).join('\n');
		console.log('段7b(⑥) 操作前後の差（375px）:\n' + table);
		assert(rows.length >= 15 && rows.every((r) => r.ok), '段7b(⑥): 375px で表を画面の途中に置いて各ボタンを押しても、ページの位置（window.scrollY）と押したボタンの画面上の位置の差が 2px 以内（小窓の中の位置も変わらない）。' + rows.length + '件', rows.filter((r) => !r.ok));
		assert(jsErrors(sp.errors).length === 0, '段7b(⑥): コンソールのエラー0', jsErrors(sp.errors));
		await sp.ctx.close();
	}

	/* ───── ⑬ 本育成編成（因子周回のパネル） ─────
	   段8（C-120）で外した。②の「本育成編成」のボタンと一覧の小窓を無くし、②の相手は常に同じセットの①になった
	   （①で得るスキルは自動では外さず、②に数えないだけ）。ボタンの見え方・小窓・選ぶと外す・Undo・「なし」・保存と開き直し・
	   指す編成が無くなったとき、はどれも見張る対象が無い（新しい仕様は blocks-8.mjs の段8(A)(D)。追加の一覧のグレーアウトは段7 の塊が見る）。 */

	/* ───── ⑪ 画面の文言の「周回因子セット」は「因子周回」（コード内の名前・保存キーは変えない） ───── */
	{
		const sp = await openTab({ w: 1280, h: 900, tab: 1 });
		const texts = await sp.page.evaluate(() => {
			const out = [];
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
			while (walker.nextNode()) out.push(walker.currentNode.nodeValue);
			const attrs = Array.from(document.querySelectorAll('[aria-label],[title],[placeholder]')).map((e) => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('placeholder')].filter(Boolean).join(' '));
			return { text: out.join(' ').replace(/\s+/g, ' '), attrs: attrs.join(' '), step1: document.getElementById('step1-title').textContent.trim(), tabAria: document.querySelector('#deck-template-panel [data-usd-el="tabs"]') ? document.querySelector('#deck-template-panel [data-usd-el="tabs"]').getAttribute('aria-label') : undefined };
		});
		// 段8（C-120）で②のタブの帯（aria-label「因子周回」）を無くしたので、帯の呼び名の検査は外した（帯が無いことだけ見る）
		assert(!texts.text.includes('周回因子セット') && !texts.attrs.includes('周回因子セット') && texts.step1 === '因子周回' && texts.tabAria === undefined,
			'段7b(⑪): 画面の文言（見出し・タブ・説明・aria-label・title）に「周回因子セット」が残っていない。ステップのタブの名前は「因子周回」', { step1: texts.step1, tabAria: texts.tabAria });
		assert(texts.text.includes('タブ②で因子周回を1つ選びます'), '段7b(⑪): 使い方の文も「因子周回」', null);
		await sp.ctx.close();
		// 画面に出る文字列のリテラル（コメントを除く）にも残っていない
		const src = fs.readFileSync(path.join(REPO_ROOT, 'js/uma-skill-deck-core.js'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
		const html = fs.readFileSync(path.join(REPO_ROOT, 'special.html'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|<!--|-->)/.test(l));
		const left = src.concat(html).filter((l) => l.includes('周回因子セット') && /['"`>][^'"`<]*周回因子セット/.test(l));
		assert(left.length === 0, '段7b(⑪): core と special.html の、コメントでない行に「周回因子セット」が残っていない', left.slice(0, 3));
	}

	/* ───── 今回の変更が Deck 単体・exam・index・card-event-input に現れない ───── */
	{
		const sp = await openPage(browser, base, 'uma-skill-deck.html', { width: 375, height: 800 });
		await sp.page.waitForTimeout(600);
		const d = await sp.page.evaluate(() => ({ ntabs: document.querySelectorAll('.usd-ntabs, .usd-roster-evbtn, .usd-roster-linkbtn, .usd-ntab').length, nameInput: !!document.querySelector('[data-usd-el="name-input"]'), save: !!document.querySelector('[data-usd-act="template-save"]'),
			clear: !!document.querySelector('[data-usd-el="clear-skills"]'), count: !!document.querySelector('[data-usd-el="count-badge"]'), head: (document.querySelector('.usd-roster-h--top') || {}).textContent || '' }));
		assert(d.ntabs === 0 && d.nameInput && d.save && d.clear && d.count && /^スキルセット（\d+／10件）$/.test(d.head.trim()), '段7b: Deck 単体ページのスキルセットは今までのまま（名前の入力欄・保存・リセット・「スキルセット（N／10件）」の見出し。新しいタブの部品は出ない）', d);
		assert(jsErrors(sp.errors).length === 0, '段7b: Deck 単体ページのコンソールのエラー0', jsErrors(sp.errors));
		await sp.ctx.close();
		const plain = async (file) => { const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } }); const page = await ctx.newPage(); const errors = []; page.on('pageerror', (er) => errors.push(String(er))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); await page.goto(base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(600); return { ctx, page, errors }; };
		const ex = await plain('exam.html');
		const e = await ex.page.evaluate(() => ({ title: document.title, h1: document.querySelector('header h1').textContent.replace(/\s+/g, ' ').trim(), ntabs: document.querySelectorAll('.usd-ntabs, .usd-ntab').length, help: !!document.querySelector('.help-open-btn') }));
		assert(e.title.includes('β版') && e.h1.endsWith('β版') && e.ntabs === 0 && !e.help, '段7b: exam.html のヘッダー（β版）は変わらない', e);
		await ex.ctx.close();
		const ix = await plain('index.html');
		const i = await ix.page.evaluate(() => ({ title: document.title, h1: document.querySelector('header h1').textContent.replace(/\s+/g, ' ').trim(), help: !!document.querySelector('.help-open-btn') }));
		assert(i.title.includes('β版') && i.h1.endsWith('β版') && !i.help, '段7b: index.html のヘッダー（β版）は変わらない', i);
		await ix.ctx.close();
		const ce = await plain('card-event-input.html');
		const c = await ce.page.evaluate(() => ({ ntabs: document.querySelectorAll('.usd-ntabs, .usd-ntab, .usd-roster-evbtn').length }));
		assert(c.ntabs === 0 && jsErrors(ce.errors).length === 0, '段7b: card-event-input.html に今回の部品は出ない・コンソールのエラー0', { c, errors: jsErrors(ce.errors) });
		await ce.ctx.close();
	}
}
});

await register7c({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register7d({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register7f({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register7e({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register8({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register9({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register10({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register11({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register12({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register13({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register14({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register15({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });
await register16({ block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA });

await browser.close();
await close();

if (LIST_ONLY) {
	console.log('塊は ' + blockCount + '個。--only=<番号> か --only=<見出しの一部> で選ぶ（カンマ区切りで複数可）。\n');
	console.log(listed.join('\n'));
	process.exit(0);
}
// 綴りを間違えて0塊になったときに「全項目OK」と出すと、通ったことになってしまう。
if (ONLY.length > 0 && ranCount === 0) {
	console.log('\n=== スモークテスト: --only=' + ONLY.join(',') + ' に当たる塊が1つも無い（--list で見出しを確認する） ===');
	process.exit(1);
}
// **部分実行のときは必ず範囲を出す。**「全項目OK」だけを見て全部通ったと誤解しないため。
const scope = ranCount === blockCount ? '' : '（' + blockCount + '塊中' + ranCount + '塊のみ）';
console.log('\n' + (fails === 0
	? '=== スモークテスト' + scope + ': 全項目OK ==='
	: '=== スモークテスト' + scope + ': ' + fails + '件 NG ==='));
process.exit(fails === 0 ? 0 : 1);
