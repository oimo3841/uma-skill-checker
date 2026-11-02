// 画像アップロードの画面の直し（T56・2026-11-01。おいもさんの決定 C-258 の (2)。モック T43・T46 の lab/upload-mock.html の ?scene=new&badge=a）の検査。
// run-smoke.mjs の末尾から register86() で呼ばれる（塊の見出しはすべて「T56画像アップロード」で始まる。`npm run test:visual -- --only=T56画像アップロード` で回せる）。
//
// 決め（UmaStar＝special.html・UmaExam＝exam.html）:
//  (2)-1 UmaStar: シナリオ因子・遺伝子の行（チェックと「?」）を出さない。遺伝子はいつも OCR の対象・シナリオ因子は対象外（セットに保存した scopes は読まない・書き換えない）。
//        結合画像は、③のチェック無しで、読めた遺伝子に枠と人の見出しの行の「名前：★N」・「枠の見かた」の「遺伝子」（C-261 の回答 2: いつも出す）。
//  (2)-2・(2)-5 セットの見出し（「親Aセット（1人分だけでもOK）」／「親Aセット（親A＋祖A1＋祖A2）」）を消し、「セットをクリア」はパネルの右上（上 10px・右 14px）。
//  (2)-3 人の欄の見出しは (ア) 文字だけの「親A」「祖A1」「祖A2」（丸の印なし・高さ 24px）。
//  (2)-4・(2)-7 UmaExam の上の文3つと「＋ 親Bセットも追加する」を消し、UmaStar と同じタブ（親Aセット／＋親Bセット）。結合は画像のあるセット（タブに関係なし）。
//  (2)-6 「＋親Bセット」（親B に画像が1枚でも入ると「親Bセット」）。
//  (2)-8 「高度な解析オプション」はパネルのいちばん下の左の「!」（丸の線 --uma-border-strong・灰の字 --uma-text-faint・22px の丸・押せる 44px）。押すとすぐ下に今の2つ。
//  (2)-9 UmaStar: 「OCR処理を開始する」を消し、「OCR処理＋画像結合を開始する」（（高負荷）なし）を黒塗りの主なボタン（uma-btn--primary）に。「画像を結合する（OCRしない）」は残す。
//        UmaExam: 「OCR処理を開始する」は今のまま・一体のボタンは名前だけ「OCR処理＋画像結合を開始する」。
// 寸法はモック（?scene=new&badge=a）を同じ測り方で測った値（T56 の報告の表）。special のモックは (3) の動画のアイコン（今回はしない）でタブの行が 2px 高いので、
// 縦の位置はパネルの中の相対で見る。遺伝子・シナリオ因子の名前は検査の側に書かない（data と core のカタログから読む。恒久ルール1）。
import { reloadReady } from './lib/page-ready.mjs';

export async function register86(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
	const GENES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'aptitude-genes.json'), 'utf8')).entries.map((e) => e.name);

	const WIDTHS = [375, 1280];
	const FILE = { special: 'special.html', exam: 'exam.html' };

	const closeNotices = async (page) => {
		// special は [data-act="notice-ok"]・exam は #ui-notice-ok
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
	};
	/** special を新UI・③で開く。o.scope … 下書きのセットに足す項目（scopes など）・o.ids … ②のスキル */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ scope }) => {
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '2');
		}, { scope: o.ids ? Object.assign({ skillIds: o.ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }, o.scope || {}) : null });
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.waitForTimeout(500);
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.waitForTimeout(200);
		return sp;
	};
	const openEx = async (o = {}) => {
		const ex = await openPage(browser, base, 'exam.html', { width: o.w || 1280, height: o.h || 900 });
		await closeNotices(ex.page);
		await ex.page.evaluate(() => selectStepTab(2));
		await ex.page.waitForTimeout(200);
		return ex;
	};
	const openTool = (tool, w) => tool === 'special' ? openSp({ w, h: w < 641 ? 812 : 800 }) : openEx({ w, h: w < 641 ? 812 : 800 });

	// 画面の寸法（パネルの中の相対）。押せる範囲は中心を通る縦・横の線で elementFromPoint がそのボタンの中を返す幅
	const MEASURE = () => {
		const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
		const panel2 = document.getElementById('step-panel-2');
		const wrap = (id) => document.getElementById('personset-' + id + '-wrap');
		// T76: 人の欄は枠の無い列（.upload-col）になった（前は枠つきの .rounded-xl.border）
		const cardsOf = (w) => w ? [...w.querySelectorAll('.upload-col')].filter((c) => c.querySelector('.person-drop-zone')) : [];
		const headsOf = (w) => cardsOf(w).map((c) => { const p = c.querySelector('p.text-xs.font-bold'); return { text: p.textContent.trim(), spans: p.querySelectorAll('span').length, h: Math.round(p.getBoundingClientRect().height) }; });
		const setPanel = wrap('A').firstElementChild;
		const clear = [...wrap('A').querySelectorAll('button')].find((b) => b.textContent.trim() === 'セットをクリア');
		const tabs = [...document.querySelectorAll('#personset-tabs .uma-subtab')].map((t) => { const l = t.querySelector('.uma-subtab-label'); const c = t.querySelector('.uma-subtab-count');
			return { label: l.textContent, count: c ? c.textContent : null, sel: t.getAttribute('aria-selected'), w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height), cut: l.scrollWidth > l.clientWidth, cls: t.className }; });
		const adv = document.getElementById('adv-opts-btn');
		const advSpan = adv ? adv.querySelector('span') : null;
		const cards = cardsOf(wrap('A')).map(r);
		// T76: 処理のボタンは画面の下に固定した欄（#upload-bar・body の直下）へ移った。欄のボタンを先に数える
		const lg = [...document.querySelectorAll('#upload-bar button.uma-btn'), ...panel2.querySelectorAll('button.uma-btn')].filter((b) => b.offsetParent);
		// T76: 画面の下に固定した欄（#upload-bar）の中のボタンは流れの外なので、「!」の下の見えるものには数えない
		const visibleBottoms = [...panel2.querySelectorAll('*')].filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0 && !e.closest('#upload-bar')).map((e) => Math.round(e.getBoundingClientRect().bottom));
		const tokens = getComputedStyle(document.documentElement);
		const probe = (cls) => { const b = document.createElement('button'); b.className = cls; document.body.appendChild(b); const c = getComputedStyle(b); const v = { bg: c.backgroundColor, fg: c.color }; b.remove(); return v; };
		const hit = (el) => {
			if (!el) return null;
			el.scrollIntoView({ block: 'center' });
			const b = el.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
			let w = 0, h = 0;
			for (let x = Math.floor(b.left) - 10; x <= b.right + 10; x++) { const e = document.elementFromPoint(x, cy); if (e && el.contains(e)) w++; }
			for (let y = Math.floor(b.top) - 10; y <= b.bottom + 10; y++) { const e = document.elementFromPoint(cx, y); if (e && el.contains(e)) h++; }
			window.scrollTo(0, 0);
			return { w, h };
		};
		const out = {
			setPanel: r(setPanel), clear: r(clear), tabs, tabsH: r(document.getElementById('personset-tabs')).h,
			cards, headsA: headsOf(wrap('A')), headsB: headsOf(wrap('B')),
			setPanelTexts: [...document.querySelectorAll('#personset-A-wrap p, #personset-B-wrap p')].map((p) => p.textContent.trim()).filter((t) => /セット/.test(t)),
			lgInBar: lg.length > 0 && lg.every((b) => !!b.closest('#upload-bar')),
			lg: lg.map((b) => ({ id: b.id, text: b.textContent.trim(), cls: b.className, r: r(b), bg: getComputedStyle(b).backgroundColor, fg: getComputedStyle(b).color })),
			primary: probe('uma-btn uma-btn--primary uma-btn--lg'),
			adv: r(adv), advSpan: r(advSpan), advStyle: advSpan ? { border: getComputedStyle(advSpan).borderTopColor, bw: getComputedStyle(advSpan).borderTopWidth, color: getComputedStyle(advSpan).color, radius: getComputedStyle(advSpan).borderTopLeftRadius, text: advSpan.textContent } : null,
			tokBorderStrong: (() => { const d = document.createElement('div'); d.style.color = 'var(--uma-border-strong)'; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; })(),
			tokFaint: (() => { const d = document.createElement('div'); d.style.color = 'var(--uma-text-faint)'; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; })(),
			advBelow: adv ? Math.max(...visibleBottoms) - Math.round(adv.getBoundingClientRect().bottom) : null,
			advLabel: adv ? adv.getAttribute('aria-label') : null, advExpanded: adv ? adv.getAttribute('aria-expanded') : null,
			advPanelHidden: (() => { const p = document.getElementById('adv-opts-panel'); return p ? p.hidden : null; })(),
			optsIn: (() => { const p = document.getElementById('adv-opts-panel'); return !!p && p.contains(document.getElementById('opt-devlog')) && p.contains(document.getElementById('opt-preview')); })(),
			detailsAdv: [...panel2.querySelectorAll('details')].some((d) => /高度な解析オプション/.test(d.textContent)),
			stepLeft: Math.round(panel2.getBoundingClientRect().left),
			scopesShown: (() => { const s = document.getElementById('deck-scopes-bar'); return !!(s && s.offsetParent); })(),
			scopeControls: [...panel2.querySelectorAll('[data-usd-act="scope-check"], [data-usd-act="scope-help"]')].filter((e) => e.offsetParent).length,
			hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
		};
		out.advHit = hit(adv);
		return out;
	};

	// モック（?scene=new&badge=a）の実測（T56 で測った値。special のモックは縦の位置がタブの行で 2px 下がるだけ。相対の値は同じ）
	const MOCK = {
		special: { 375: { cardTop: 17, cardH: [116, 116, 116] }, 1280: { cardTop: 17, cardH: [116, 116, 116] } },  // T76: 3列・家系の図なし・人の欄の枠なし（前は cardTop 97・cardH 143 前後・firstFromCard 481／172）
		exam: { 375: { cardTop: 9, cardH: [116, 116, 116] }, 1280: { cardTop: 17, cardH: [116, 116, 116] } },  // T76: 同上（前は 375 が 89・123 前後・401、1280 が 97・143・176）
		tabs: { 375: { a: 59, b: 69 }, 1280: { a: 63, b: 74 } },
	};

	for (const tool of ['special', 'exam']) {
		const name = tool === 'special' ? 'UmaStar' : 'UmaExam';
		await block('T56画像アップロード(1) ' + name + ' の画面の寸法（375・1280px。モックと同じ）: タブ 30px・「親Aセット」' + MOCK.tabs[375].a + '／「＋親Bセット」' + MOCK.tabs[375].b + 'px（切れない）・セットの見出しなし・「セットをクリア」は右上（上 11・右 15＝枠の 1px を含む）・人の欄の見出しは文字だけ 24px・欄の位置と高さ・「!」は 44×44（丸 22px）でいちばん下の左・横スクロールなし', async () => {
			for (const w of WIDTHS) {
				const { ctx, page, errors } = await openTool(tool, w);
				const m = await page.evaluate(MEASURE);
				const mk = MOCK[tool][w];
				const tag = 'T56(1) ' + name + ' ' + w + 'px';
				assert(m.tabs.length === 2 && m.tabs[0].label === '親Aセット' && m.tabs[1].label === '＋親Bセット' && m.tabs[0].sel === 'true' && m.tabs[1].sel === 'false'
					&& m.tabs.every((t) => !t.cut && t.h === 30) && m.tabs[0].w === MOCK.tabs[w].a && m.tabs[1].w === MOCK.tabs[w].b && m.tabsH === 30
					&& /person-col-blue/.test(m.tabs[0].cls) && /person-col-red/.test(m.tabs[1].cls) && m.tabs.every((t) => /uma-subtab--tinted/.test(t.cls)),
					tag + ': タブは「親Aセット」（選択・青）「＋親Bセット」（赤）・高さ 30・幅はモックと同じ・字が「…」で切れない', { tabs: m.tabs, h: m.tabsH });
				assert(m.setPanelTexts.length === 0, tag + ': セットの見出し（「親Aセット（…）」）が無い', m.setPanelTexts);
				assert(m.clear && m.clear.w === 57 && m.clear.h === 17 && m.clear.y - m.setPanel.y === 11 && m.setPanel.r - m.clear.r === 15,
					tag + ': 「セットをクリア」はパネルの右上（上 11・右 15）・57×17', { clear: m.clear, panel: m.setPanel });
				assert(m.headsA.map((h) => h.text).join(',') === '親A,祖A1,祖A2' && m.headsB.map((h) => h.text).join(',') === '親B,祖B1,祖B2' && m.headsA.every((h) => h.spans === 0 && h.h === 24),
					tag + ': 人の欄の見出しは文字だけ（丸の印なし）・高さ 24', { a: m.headsA, b: m.headsB });
				assert(m.cards.length === 3 && m.cards[0].y - m.setPanel.y === mk.cardTop && m.cards.every((c, i) => Math.abs(c.h - mk.cardH[i]) <= 1),
					tag + ': 人の欄の位置（パネルの上端から ' + mk.cardTop + '）と高さ（' + mk.cardH.join('・') + ' ±1）がモックと同じ', { cards: m.cards, panel: m.setPanel });
				// T76: ボタンは画面の下に固定した欄へ移ったので、「親A の欄の上端からの距離」は測らない（欄の位置は blocks-96 の T76(2)）
				assert(m.lg.length === 2 && m.lgInBar, tag + ': ボタン2つは画面の下に固定した欄（#upload-bar）の中', { lg: m.lg.map((b) => b.id), inBar: m.lgInBar });
				assert(m.adv && m.adv.w === 44 && m.adv.h === 44 && m.advSpan.w === 22 && m.advSpan.h === 22 && m.advHit.w >= 44 && m.advHit.h >= 44 && m.adv.x - m.setPanel.x === -11 && m.advBelow === 0,
					tag + ': 「!」は 44×44（丸 22px・押せる 44 以上）・パネルの左端から -11（いちばん下の左）・その下に見えるものが無い', { adv: m.adv, span: m.advSpan, hit: m.advHit, below: m.advBelow, panel: m.setPanel });
				assert(m.advStyle.text === '!' && m.advStyle.border === m.tokBorderStrong && m.advStyle.bw === '1px' && m.advStyle.color === m.tokFaint && m.advStyle.radius === '999px',
					tag + ': 「!」は丸の線（--uma-border-strong 1px）の中の灰の字（--uma-text-faint）', { style: m.advStyle, border: m.tokBorderStrong, faint: m.tokFaint });
				assert(!m.hscroll, tag + ': 横スクロールなし');
				assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
				await ctx.close();
			}
		});
	}

	await block('T56画像アップロード(2) 「!」（高度な解析オプション）: 両方のツールで <details> は無く、押すとすぐ下に今の2つ（開発用ログ出力・切り出し画像のプレビュー。id は今のまま）が開く・もう一度で閉じる・読み上げ名「高度な解析オプション」・チェックは今までどおり効く', async () => {
		for (const tool of ['special', 'exam']) {
			const { ctx, page, errors } = await openTool(tool, 375);
			const m0 = await page.evaluate(MEASURE);
			const tag = 'T56(2) ' + tool;
			assert(!m0.detailsAdv && m0.advLabel === '高度な解析オプション' && m0.advExpanded === 'false' && m0.advPanelHidden === true && m0.optsIn,
				tag + ': <details> は無い・「!」は閉じている（aria-expanded=false）・2つのチェックは「!」の中', m0);
			await page.click('#adv-opts-btn');
			const m1 = await page.evaluate(() => { const p = document.getElementById('adv-opts-panel'); const b = document.getElementById('adv-opts-btn');
				return { hidden: p.hidden, exp: b.getAttribute('aria-expanded'), title: p.querySelector('.adv-opts-title').textContent, below: Math.round(p.getBoundingClientRect().top - b.getBoundingClientRect().bottom),
					dev: !!document.getElementById('opt-devlog').offsetParent, pre: !!document.getElementById('opt-preview').offsetParent,
					labels: [...p.querySelectorAll('label .font-semibold')].map((s) => s.textContent.trim()) }; });
			assert(!m1.hidden && m1.exp === 'true' && m1.title === '高度な解析オプション' && m1.below === 4 && m1.dev && m1.pre && m1.labels.join(',') === '開発用ログ出力,切り出し画像のプレビュー',
				tag + ': 押すと「!」のすぐ下（4px）に見出しと2つのチェックが開く', m1);
			await page.check('#opt-devlog');
			const checked = await page.evaluate(() => document.getElementById('opt-devlog').checked);
			await page.click('#adv-opts-btn');
			const m2 = await page.evaluate(() => ({ hidden: document.getElementById('adv-opts-panel').hidden, exp: document.getElementById('adv-opts-btn').getAttribute('aria-expanded'), dev: document.getElementById('opt-devlog').checked }));
			assert(checked && m2.hidden && m2.exp === 'false' && m2.dev, tag + ': もう一度押すと閉じる（チェックは残る）', m2);
			assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
			await ctx.close();
		}
	});

	await block('T56画像アップロード(3) ボタン: UmaStar は「OCR処理を開始する」が無く、先頭が「OCR処理＋画像結合を開始する」（黒塗りの主なボタン・（高負荷）なし）→「画像を結合する（OCRしない）」／UmaExam は「OCR処理を開始する」（今のまま）→「OCR処理＋画像結合を開始する」（名前だけ）・照合結果が空のときの案内とその「入力画面に戻る」は今あるボタンを指す', async () => {
		const sp = await openTool('special', 375);
		const s = await sp.page.evaluate(MEASURE);
		const sx = await sp.page.evaluate(() => ({ ocr: !!document.getElementById('process-btn'), empty: document.querySelector('#result-empty p.text-xs').textContent.trim(),
			back: document.querySelector('#result-empty button').getAttribute('onclick') }));
		assert(!sx.ocr && s.lg.map((b) => b.id + ':' + b.text).join('|') === 'process-stitch-btn:OCR処理＋画像結合を開始する|stitch-btn:画像を結合する（OCRしない）',
			'T56(3) UmaStar: ボタンは「OCR処理＋画像結合を開始する」→「画像を結合する（OCRしない）」の2つ（「OCR処理を開始する」なし）', { lg: s.lg.map((b) => b.id + ':' + b.text), ocr: sx.ocr });
		assert(/uma-btn--primary/.test(s.lg[0].cls) && /uma-btn--lg/.test(s.lg[0].cls) && !/accent-outline/.test(s.lg[0].cls) && s.lg[0].bg === s.primary.bg && s.lg[0].fg === s.primary.fg,
			'T56(3) UmaStar: 一体のボタンは黒塗りの主なボタン（uma-btn--primary・大）', { btn: s.lg[0], primary: s.primary });
		assert(sx.empty.includes('「OCR処理＋画像結合を開始する」') && !sx.empty.includes('「OCR処理を開始する」') && sx.back === "backToInput('process-stitch-btn')",
			'T56(3) UmaStar: 照合結果が空のときの案内は今あるボタンの名前・「入力画面に戻る」はそのボタンへ', sx);
		assert(jsErrors(sp.errors).length === 0, 'T56(3) UmaStar: コンソールエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		const ex = await openTool('exam', 375);
		const e = await ex.page.evaluate(MEASURE);
		assert(e.lg.map((b) => b.id + ':' + b.text).join('|') === 'process-btn:OCR処理を開始する|process-stitch-btn:OCR処理＋画像結合を開始する'
			&& /uma-btn--primary/.test(e.lg[0].cls) && /uma-btn--accent-outline/.test(e.lg[1].cls),
			'T56(3) UmaExam: 「OCR処理を開始する」（黒塗り）→「OCR処理＋画像結合を開始する」（枠線・（高負荷）なし）', e.lg.map((b) => b.id + ':' + b.text + ':' + b.cls));
		assert(jsErrors(ex.errors).length === 0, 'T56(3) UmaExam: コンソールエラー0', jsErrors(ex.errors).slice(0, 3));
		await ex.ctx.close();
	});

	await block('T56画像アップロード(4) タブ: 両方のツールで、親B に画像が1枚入ると「親Bセット」＋「1枚」・押すと親Bセットのパネルに切り替わる（画像は保持）・←→でも切り替わりフォーカスはタブ・UmaExam は上の文3つと「＋ 親Bセットも追加する」が無い', async () => {
		for (const tool of ['special', 'exam']) {
			const { ctx, page, errors } = await openTool(tool, 375);
			const tag = 'T56(4) ' + tool;
			const label = () => page.evaluate(() => [...document.querySelectorAll('#personset-tabs .uma-subtab')].map((t) => t.querySelector('.uma-subtab-label').textContent + (t.querySelector('.uma-subtab-count') ? '+' + t.querySelector('.uma-subtab-count').textContent : '')
				+ (t.getAttribute('aria-selected') === 'true' ? '*' : '')).join(','));
			const vis = () => page.evaluate(() => ({ A: !document.getElementById('personset-A-wrap').hidden && !!document.getElementById('personset-A-wrap').offsetParent, B: !document.getElementById('personset-B-wrap').hidden && !!document.getElementById('personset-B-wrap').offsetParent }));
			const l0 = await label();
			await page.evaluate(() => { addPersonFiles(3, [new File([new Uint8Array([137, 80, 78, 71])], 'b.png', { type: 'image/png' })]); });
			const l1 = await label();
			assert(l0 === '親Aセット*,＋親Bセット' && l1 === '親Aセット*,親Bセット+1枚', tag + ': 親B に画像が入ると「＋親Bセット」→「親Bセット」＋「1枚」', { l0, l1 });
			await page.click('#personset-tabs [data-tab-id="1"]');
			const v1 = await vis(); const l2 = await label();
			const kept = await page.evaluate(() => persons[3].files.length);
			assert(!v1.A && v1.B && l2 === '親Aセット,親Bセット+1枚*' && kept === 1, tag + ': 押すと親Bセットのパネル（画像は保持）', { v1, l2, kept });
			await page.focus('#personset-tabs [data-tab-id="1"]');
			await page.keyboard.press('ArrowLeft');
			const v2 = await vis();
			const foc = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-tab-id'));
			assert(v2.A && !v2.B && foc === '0', tag + ': ←で親Aセットへ・フォーカスは親Aセットのタブ', { v2, foc });
			if (tool === 'exam') {
				const gone = await page.evaluate(() => ({ btn: !!document.getElementById('setb-toggle-btn'), texts: ['親Aセットのみでも判定できます', '親Bセットを追加すると', '1-2行重なるように'].filter((t) => document.getElementById('step-panel-2').textContent.includes(t)) }));
				assert(!gone.btn && gone.texts.length === 0, tag + ': 上の文3つと「＋ 親Bセットも追加する」が無い', gone);
			}
			assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
			await ctx.close();
		}
	});

	await block('T56画像アップロード(5) UmaExam の結合は画像のあるセット: 親Aセットのタブを見たままでも、親B に画像があれば親Bセットも結合する（タブを親B にしても同じ）・押した時点の控え（captureRun）に親Bの開閉は無い', async () => {
		const { ctx, page, errors } = await openTool('exam', 1280);
		const r = await page.evaluate(async () => {
			const keep = buildStitchedSetImage;
			const calls = [];
			buildStitchedSetImage = async (setIdx) => { calls.push(setIdx); return null; };
			const f = () => new File([new Uint8Array([137, 80, 78, 71])], 'x.png', { type: 'image/png' });
			persons.forEach((p) => { p.files = []; });
			persons[0].files = [f()]; persons[3].files = [f()];
			selectPersonSet(0);
			await runImageStitching(captureRun(), { progress: false });
			const a = calls.slice(); calls.length = 0;
			selectPersonSet(1);
			await runImageStitching(captureRun(), { progress: false });
			const b = calls.slice(); calls.length = 0;
			persons[3].files = [];
			await runImageStitching(captureRun(), { progress: false });
			const c = calls.slice();
			buildStitchedSetImage = keep;
			persons.forEach((p) => { p.files = []; });
			return { a, b, c, hasSetB: Object.prototype.hasOwnProperty.call(captureRun(), 'setB') };
		});
		assert(r.a.join(',') === '0,1' && r.b.join(',') === '0,1' && r.c.join(',') === '0' && !r.hasSetB,
			'T56(5): 結合するセットは画像のあるセット（タブに関係なし）・控えに setB は無い', r);
		assert(jsErrors(errors).length === 0, 'T56(5): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T56画像アップロード(6) UmaStar のシナリオ因子・遺伝子: 行（チェック・「?」）を出さない・保存したセットの scopes に関係なく、照合の対象は遺伝子（data の全部）だけでシナリオ因子は入らない・保存の scopes は書き換えない（375・1280px）', async () => {
		const CASES = [{ label: 'scopes なし', scope: {} }, { label: 'シナリオ因子だけ ON', scope: { scopes: { scenarioFactors: true } } }, { label: '両方 ON', scope: { scopes: { scenarioFactors: true, genes: true } } }];
		for (const w of WIDTHS) {
			for (const cs of CASES) {
				const { ctx, page, errors } = await openSp({ w, h: w < 641 ? 812 : 800, ids: IDS, scope: cs.scope });
				await page.waitForFunction(() => typeof deckScope !== 'undefined' && deckScope && skillList.length > 0, null, { timeout: 15000 }).catch(() => {});
				const r = await page.evaluate(() => {
					const sf = UmaSkillDeckCore.getCatalogEntries('scenarioFactor').map((e) => e.name);
					const gf = UmaSkillDeckCore.getCatalogEntries('geneFactor').map((e) => e.name);
					const raw = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null');
					return { genesIn: gf.filter((n) => skillList.includes(n)), sfIn: sf.filter((n) => skillList.includes(n)).length, sfN: sf.length, geneNames: currentGeneNames(), factorOnly: factorOnlyList.slice(),
						skillOnly: skillOnlyList.length, saved: raw && raw.scopes ? raw.scopes : null, shown: !!document.getElementById('deck-scopes-bar').offsetParent,
						controls: [...document.querySelectorAll('[data-usd-act="scope-check"], [data-usd-act="scope-help"]')].filter((e) => e.offsetParent).length };
				});
				const tag = 'T56(6) ' + w + 'px ' + cs.label;
				assert(!r.shown && r.controls === 0, tag + ': シナリオ因子・遺伝子の行（チェック・「?」）は見えない', { shown: r.shown, controls: r.controls });
				assert(JSON.stringify(r.genesIn) === JSON.stringify(GENES) && JSON.stringify(r.geneNames) === JSON.stringify(GENES) && JSON.stringify(r.factorOnly) === JSON.stringify(GENES) && r.sfIn === 0 && r.sfN > 0 && r.skillOnly === IDS.length,
					tag + ': 照合の対象は ②のスキル＋遺伝子（data の全部・並びも data の順）。シナリオ因子は入らない', r);
				assert(JSON.stringify(r.saved || {}) === JSON.stringify(cs.scope.scopes || {}), tag + ': 保存したセットの scopes はそのまま（書き換えない）', { saved: r.saved, want: cs.scope.scopes || null });
				assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
				await ctx.close();
			}
		}
	});

	await block('T56画像アップロード(7) UmaStar の遺伝子は③のチェック無しで OCR の対象: OCR の行に遺伝子とシナリオ因子があると、遺伝子だけ検出（★も）・シナリオ因子は検出しない・写しの遺伝子は data の全部・結合画像に遺伝子の枠と人の見出しの行の「名前：★N」・「枠の見かた」に「遺伝子」（375・1280px）', async () => {
		for (const w of WIDTHS) {
			const { ctx, page, errors } = await openSp({ w, h: w < 641 ? 812 : 800, ids: IDS });
			await page.waitForFunction(() => typeof deckScope !== 'undefined' && deckScope && skillList.length > 0, null, { timeout: 15000 }).catch(() => {});
			const r = await page.evaluate(async (G) => {
				const sf = UmaSkillDeckCore.getCatalogEntries('scenarioFactor').map((e) => e.name);
				const keep = { ppi: processPersonImages, tess: window.Tesseract, s: window.stitchOnePerson, t: tierMarksEnabled };
				// OCR の代わり: 親A の画像1枚の行に、遺伝子2つ（★3・★1）とシナリオ因子1つ（★2）を固定で返す。行の位置は 1179×2342 の合成の1人分（左の列の 3段目・4段目・5段目）
				const W = 1179, H = 2342;
				const rows = []; for (let y = 10; y < H - 60; y += 80) { rows.push({ y: y, h: 60, col: 0 }); rows.push({ y: y, h: 60, col: 1 }); }
				const geo = { rows: rows, columnXs: [Math.round(W * 0.19) + 50, Math.round(W * 0.60) + 50], scale: 1, naturalW: W, naturalH: H };
				processPersonImages = async () => ({
					lines: [{ text: G[0], stars: 3, starsReliable: true, rowKey: '0:4' }, { text: G[1], stars: 1, starsReliable: true, rowKey: '0:6' }, { text: sf[0], stars: 2, starsReliable: true, rowKey: '0:8' }],
					skipped: [], warned: [], geometry: [geo] });
				window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, recognize: async () => ({ data: { text: '', lines: [] } }), terminate: async () => {} }) };
				persons.forEach((p) => { p.files = []; });
				persons[0].files = [new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })];
				const judged = await processImages({ keepClosed: true, quiet: true });
				const res = personResults[0];
				const det = { g0: res && res.detectedSkills.has(G[0]), g1: res && res.detectedSkills.has(G[1]), sf: res && res.detectedSkills.has(sf[0]), s0: starsFor(0, G[0]), s1: starsFor(0, G[1]) };
				const snapGenes = stitchSnapshot ? stitchSnapshot.geneNames.slice() : null;
				// 結合（印つき＝一体のボタンから来たとき）。人の画像は合成の1人分（1179×2342）
				const mkPerson = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, H);
					[[Math.round(W * 0.19), Math.round(W * 0.58)], [Math.round(W * 0.60), Math.round(W * 0.98)]].forEach(([a, b]) => { for (let y = 10; y < H - 60; y += 80) { g.fillStyle = 'rgb(226,226,226)'; g.fillRect(a, y, b - a, 60); } });
					c._sourcePlacements = []; c._profileHeader = { kept: false, ratio: 0.31, height: 0 }; return c; };
				window.stitchOnePerson = async () => mkPerson();
				tierMarksEnabled = true;
				const texts = []; const o = CanvasRenderingContext2D.prototype.fillText;
				CanvasRenderingContext2D.prototype.fillText = function (s) { texts.push(String(s)); return o.apply(this, arguments); };
				let c = null, err = null;
				try { c = await buildStitchedSetImage(0, null, true); } catch (e) { err = String(e); } finally { CanvasRenderingContext2D.prototype.fillText = o; }
				const L = c ? c._layout : null;
				processPersonImages = keep.ppi; window.Tesseract = keep.tess; window.stitchOnePerson = keep.s; tierMarksEnabled = keep.t;
				persons.forEach((p) => { p.files = []; });
				return { judged, det, snapGenes, err, gene: c ? c._geneFrameCount : null, head: L && L.heads[0] ? (L.heads[0].genes || null) : null,
					gTexts: texts.filter((s) => /：★/.test(s)), legendGene: texts.includes(' 遺伝子'), sfDrawn: texts.some((s) => s.includes(sf[0])) };
			}, GENES);
			const tag = 'T56(7) ' + w + 'px';
			assert(r.judged && r.det.g0 && r.det.g1 && !r.det.sf && r.det.s0 === 3 && r.det.s1 === 1, tag + ': 遺伝子は③のチェック無しで検出（★3・★1）・シナリオ因子は検出しない', r.det);
			assert(JSON.stringify(r.snapGenes) === JSON.stringify(GENES), tag + ': 写しの遺伝子は data の全部', r.snapGenes);
			assert(!r.err && r.gene === 2 && r.head && JSON.stringify(r.head.texts) === JSON.stringify([GENES[0] + '：★3', GENES[1] + '：★1']) && r.legendGene && !r.sfDrawn,
				tag + ': 結合画像に遺伝子の枠2つ・人の見出しの行に「名前：★3」「名前：★1」（★の多い順）・「枠の見かた」に「遺伝子」・シナリオ因子は描かない', r);
			assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
			await ctx.close();
		}
	});
}
