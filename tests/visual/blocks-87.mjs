// セット名と文言の直し（T57・2026-11-01。おいもさんの決定 C-258 の (1)〔T46 の案C〕と、T56 の報告への回答 1〜4・C-260 の T55 への回答 2）の検査。
// run-smoke.mjs の末尾から register87() で呼ばれる（塊の見出しはすべて「T57セット名と文言」で始まる。`npm run test:visual -- --only=T57セット名と文言` で回せる）。
//
// 決め（UmaStar＝special.html・UmaExam＝exam.html）:
//  (1) js/stitch.js の結合の失敗の文（1人の画像が1枚だけ）の「読み取りだけなら「OCR処理を開始する」で行えます。」は UmaStar では出さない（文を足さない）。UmaExam は今のまま。
//  (2) UmaStar の「OCR処理＋画像結合を開始する」は、②のスキルが1つ以上あり画像が1枚以上のときだけ押せる（遺伝子はいつも辞書に入るが、それでは押せない）。
//      ②が空のときの案内は今までどおり（③の「②で因子周回を選ぶと、種類の枠を付けられるようになります。」）。「画像を結合する（OCRしない）」は画像があれば押せる（今のまま）。
//  (3) 文言4か所（special・exam の結合の注記・exam の結合画像の設定の欄の下の文〔消す〕・exam のめろっぷの行）。
//  (4) セット名: 下線なし・名前の右に丸 28px（線 --uma-border-strong・地 --uma-surface-muted）の中の鉛筆 16px・N/10 は 12px の薄い字（--uma-text-subtle）・押せる高さ 44px・帯の高さ不変。
//  (5) 外したお知らせだけが使っていた CSS（.notice-catalog*・.notice-new*・.notice-deck-name・.notice-icon・.notice-title）が製品のファイルに残っていない。
// 寸法はモック（lab/upload-mock.html?tool=special&scene=new&sn=c。名前「LoHトプロ」・3/10）を同じ測り方で測った値。帯の高さは変更前の製品（a4832be）の値。
import { reloadReady } from './lib/page-ready.mjs';

export async function register87(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const T = (id, name) => ({ templateId: id, name, skillIds: ['1', '2'], createdAt: 'x', updatedAt: 'x' });
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const SETS3 = { schemaVersion: 7, records: [], customSkills: [], rosters: [], templates: [T('t1', 'LoHトプロ'), T('t2', 'B'), T('t3', 'C')] };
	const SENT = '読み取りだけなら「OCR処理を開始する」で行えます。';
	const closeNotices = async (page) => {
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
	};
	/** special を新UI・③で開く。o.ids … ②のスキル（下書きのセット）・o.ud … 保存データ */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.w && o.w < 641 ? 812 : 800 }, o.ud || EMPTY);
		await sp.page.evaluate(({ ids }) => {
			if (ids) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '2');
		}, { ids: o.ids || null });
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.waitForTimeout(500);
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.waitForTimeout(200);
		return sp;
	};
	const openEx = async (w = 1280) => {
		const ex = await openPage(browser, base, 'exam.html', { width: w, height: w < 641 ? 812 : 800 });
		await closeNotices(ex.page);
		await ex.page.evaluate(() => selectStepTab(2));
		await ex.page.waitForTimeout(200);
		return ex;
	};

	await block('T57セット名と文言(1) 結合の失敗の文（1人1枚）: UmaStar は「読み取りだけなら…」を出さない・UmaExam は今のまま', async () => {
		const sp = await openSp();
		const s = await sp.page.evaluate(() => stitchBuildAbortNotice('single', '親A', ['a.png']));
		assert(!s.includes(SENT) && s === '親A は画像が1枚だけです。結合には、少しずつスクロールして撮った2枚以上の画像が必要です。',
			'T57(1) UmaStar: 1人1枚の失敗の文に「読み取りだけなら…」が無く、前の2文だけ（文を足さない）', s);
		assert(!(await sp.page.$('#process-btn')), 'T57(1) UmaStar には「OCR処理を開始する」（#process-btn）が無い', null);
		assert(jsErrors(sp.errors).length === 0, 'T57(1) UmaStar: コンソールのエラー0', sp.errors);
		await sp.ctx.close();
		const ex = await openEx();
		const e = await ex.page.evaluate(() => stitchBuildAbortNotice('single', '親A', ['a.png']));
		assert(e === '親A は画像が1枚だけです。結合には、少しずつスクロールして撮った2枚以上の画像が必要です。' + SENT,
			'T57(1) UmaExam: 1人1枚の失敗の文は今のまま（「読み取りだけなら「OCR処理を開始する」で行えます。」で終わる）', e);
		assert(jsErrors(ex.errors).length === 0, 'T57(1) UmaExam: コンソールのエラー0', ex.errors);
		await ex.ctx.close();
	});

	for (const w of [375, 1280]) {
		await block(`T57セット名と文言(2) ${w}px UmaStar の一体のボタン: ②のスキルが無いと押せず案内が出る・1つ以上で押せる`, async () => {
			const read = (page) => page.evaluate(() => {
				persons.forEach((p) => { p.files = []; });
				persons[0].files = [new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })];
				updateProcessBtn();
				const b = document.getElementById('process-stitch-btn'), st = document.getElementById('stitch-btn'), msg = document.getElementById('tier-marks-status');
				return { dis: b.disabled, stitchDis: st.disabled, msg: msg ? msg.textContent : null, tone: msg ? msg.getAttribute('data-tone') : null, dict: skillList.length,
					sw: document.documentElement.scrollWidth, iw: window.innerWidth };
			});
			// ②は「選んであるが中身が空」（保存したセットの skillIds が空。遺伝子だけが照合の辞書に入る）。下書きが空のときは選択が無い（deckScope が null）ので、保存したセットを選ぶ
			const none = await openSp({ w, ud: { schemaVersion: 7, records: [], customSkills: [], rosters: [], templates: [{ templateId: 't1', name: '空', skillIds: [], createdAt: 'x', updatedAt: 'x' }] } });
			await none.page.click('#deck-set-bar [data-usd-el="set-name"]');
			await none.page.locator('[data-usd-el="set-radio"]').nth(1).check();
			await none.page.waitForTimeout(400);
			await none.page.keyboard.press('Escape');
			await none.page.evaluate(() => selectStepTab(2));
			await none.page.waitForTimeout(200);
			const a = await read(none.page);
			assert(a.dict > 0, `T57(2) ${w}px: ②が空でも照合の辞書には遺伝子が入っている（前提）`, a.dict);
			assert(a.dis === true, `T57(2) ${w}px: ②のスキルが無いと「OCR処理＋画像結合を開始する」は押せない`, a);
			assert(a.msg === '②で因子周回を選ぶと、種類の枠を付けられるようになります。' && a.tone === 'warn', `T57(2) ${w}px: ②が空のときの案内は今までどおり`, a);
			assert(a.stitchDis === false, `T57(2) ${w}px: 「画像を結合する（OCRしない）」は画像があれば押せる（今のまま）`, a);
			assert(a.sw <= a.iw, `T57(2) ${w}px: 横スクロールなし`, a);
			// 画像が無ければ押せない（今のまま）
			const noImg = await none.page.evaluate(() => { persons.forEach((p) => { p.files = []; }); updateProcessBtn(); return document.getElementById('process-stitch-btn').disabled; });
			assert(noImg === true, `T57(2) ${w}px: 画像が無いときも押せない`, noImg);
			assert(jsErrors(none.errors).length === 0, `T57(2) ${w}px: コンソールのエラー0（②が空）`, none.errors);
			await none.ctx.close();
			const one = await openSp({ w, ids: ['1'] });
			const b = await read(one.page);
			assert(b.dis === false, `T57(2) ${w}px: ②のスキルが1つ以上で画像があれば押せる`, b);
			assert(b.msg === '' && b.tone === 'none', `T57(2) ${w}px: ②にスキルがあれば案内は出ない`, b);
			assert(jsErrors(one.errors).length === 0, `T57(2) ${w}px: コンソールのエラー0（②あり）`, one.errors);
			await one.ctx.close();
		});
	}

	await block('T57セット名と文言(3) 文言4か所（結合の注記・結合画像の設定の欄の下の文を消す・めろっぷの行）', async () => {
		const NOTE = '※親Aセット・親Bセットそれぞれで1枚にまとめて結合画像を生成します。';
		const sp = await openSp({ w: 375 });
		const s = await sp.page.evaluate(() => {
			const p = document.getElementById('stitch-btn').nextElementSibling;
			return { note: p ? p.textContent : null, html: document.body.innerHTML };
		});
		assert(s.note === NOTE, 'T57(3) UmaStar: 結合の注記は「※親Aセット・親Bセットそれぞれで1枚にまとめて結合画像を生成します。」', s.note);
		assert(!/1人分が1枚だけのときはエラー|SNS投稿用に出力/.test(s.html), 'T57(3) UmaStar: 前の注記の文（「1人分が1枚だけのときはエラー」「SNS投稿用に出力」）が無い', null);
		await sp.ctx.close();
		const ex = await openEx(375);
		const e = await ex.page.evaluate(() => {
			const p = document.getElementById('process-stitch-btn').nextElementSibling;
			const melop = document.querySelector('#melop-mode-wrap p');
			const panel = document.getElementById('stitch-show-panel');
			return { note: p && p.tagName === 'P' ? p.textContent : null, melop: melop ? melop.textContent : null,
				panelNotes: panel.querySelectorAll('.stitch-show-note').length, panelList: !!panel.querySelector('.stitch-show-list'),
				fabNote: (document.getElementById('stitch-show-panel-fab').parentElement.querySelector('.stitch-show-note') || {}).textContent || null,
				html: document.body.innerHTML };
		});
		assert(e.note === NOTE, 'T57(3) UmaExam: 結合の注記は UmaStar と同じ文', e.note);
		assert(e.melop === 'めろっぷ！【LTC】さんの因子管理シートへ★数の判定結果を貼り付けるためのボタンが出ます。', 'T57(3) UmaExam: めろっぷの行は決めた文', e.melop);
		assert(e.panelNotes === 0 && e.panelList, 'T57(3) UmaExam: 結合画像の設定の欄の下の文（.stitch-show-note）は入れ物ごと無い（チェックの一覧は今のまま）', e);
		assert(!e.html.includes('次に「OCR処理＋画像結合を開始する」を押したときに反映されます') && !e.html.includes('SNS投稿用に出力') && !e.html.includes('入れてから判定すると'),
			'T57(3) UmaExam: 消した・変えた前の文が無い', null);
		// T58（C-258 の T57 への回答 4）: 右下の「結合画像の設定」の小窓の文も消した（T57 では「今のまま」を確かめていた）
		assert(e.fabNote === null, 'T57(3) UmaExam: 右下の「結合画像の設定」の小窓の文は無い（T58 で消した）', e.fabNote);
		assert(jsErrors(ex.errors).length === 0, 'T57(3) UmaExam: コンソールのエラー0', ex.errors);
		await ex.ctx.close();
	});

	for (const w of [375, 1280]) {
		await block(`T57セット名と文言(4) ${w}px セット名: 下線なし・丸 28px の中の鉛筆 16px・N/10 12px・押せる高さ 44px・帯の高さ不変`, async () => {
			const sp = await openSp({ w, ud: SETS3 });
			const page = sp.page;
			await page.click('#deck-set-bar [data-usd-el="set-name"]');
			await page.locator('[data-usd-el="set-radio"]').nth(1).check();
			await page.waitForTimeout(400);
			await page.keyboard.press('Escape');
			await page.mouse.move(0, 0);
			await page.waitForTimeout(200);
			const m = await page.evaluate(() => {
				const bar = document.querySelector('#deck-set-bar [data-usd-el="setbar"]');
				const btn = document.querySelector('#deck-set-bar [data-usd-el="set-name"]');
				const nm = btn.querySelector('[data-usd-el="set-name-text"]'), pen = btn.querySelector('[data-usd-el="set-name-pen"]'), cnt = btn.querySelector('[data-usd-el="set-name-count"]');
				const svg = pen ? pen.querySelector('svg') : null;
				const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
				const b = btn.getBoundingClientRect();
				const cx = b.left + Math.min(b.width / 2, 20), cy = b.top + b.height / 2;
				let hit = 0;
				for (let y = Math.floor(b.top) - 20; y <= b.bottom + 20; y++) { const e = document.elementFromPoint(cx, y); if (e && btn.contains(e)) hit++; }
				// トークンの色（検査の側に色の値を書かない）
				const probe = document.createElement('span');
				probe.style.cssText = 'border:1px solid var(--uma-border-strong);background:var(--uma-surface-muted);color:var(--uma-text-subtle)';
				document.body.appendChild(probe);
				const pc = getComputedStyle(probe); const tok = { line: pc.borderTopColor, bg: pc.backgroundColor, subtle: pc.color };
				probe.style.color = 'var(--uma-text-heading)'; tok.heading = getComputedStyle(probe).color; probe.remove();
				const cs = (e) => e ? getComputedStyle(e) : {};
				return { barH: +bar.getBoundingClientRect().height.toFixed(1), btn: r(btn), hit, pen: r(pen), svg: r(svg), penLine: cs(pen).borderTopColor, penBg: cs(pen).backgroundColor,
					penRadius: cs(pen).borderTopLeftRadius, penFg: cs(pen).color, cntFs: cs(cnt).fontSize, cntFg: cs(cnt).color, cntText: cnt ? cnt.textContent : null,
					nameText: nm ? nm.textContent : null, nameFs: cs(nm).fontSize, deco: cs(btn).textDecorationLine + '/' + cs(nm).textDecorationLine,
					order: [nm, pen, cnt].map((e) => e ? Math.round(e.getBoundingClientRect().left) : null), aria: btn.getAttribute('aria-label'), title: btn.title,
					snap: captureStitchSnapshot().setName, tok, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
			});
			assert(m.nameText === 'LoHトプロ' && m.nameFs === '16px' && m.deco === 'none/none', `T57(4) ${w}px: 名前は 16px・下線なし`, m);
			assert(m.pen && m.pen.w === 28 && m.pen.h === 28 && m.penRadius === '999px' && m.penLine === m.tok.line && m.penBg === m.tok.bg && m.penFg === m.tok.heading,
				`T57(4) ${w}px: 名前の右に丸 28×28（線 --uma-border-strong・地 --uma-surface-muted・鉛筆は --uma-text-heading）`, m);
			assert(m.svg && m.svg.w === 16 && m.svg.h === 16, `T57(4) ${w}px: 丸の中の鉛筆は 16×16`, m.svg);
			assert(m.cntText === '3/10' && m.cntFs === '12px' && m.cntFg === m.tok.subtle, `T57(4) ${w}px: N/10 は「3/10」・12px・薄い字（--uma-text-subtle）`, m);
			assert(m.order[0] < m.order[1] && m.order[1] < m.order[2], `T57(4) ${w}px: 並びは 名前 → 鉛筆 → N/10`, m.order);
			assert(m.hit === 44 && m.btn.h === 44 && Math.abs(m.btn.w - 132.3) <= 0.5, `T57(4) ${w}px: 押せる高さ 44px・ボタンの幅はモックと同じ 132.3px（±0.5）`, m);
			assert(m.barH === 36, `T57(4) ${w}px: 帯の高さは変更前と同じ 36px`, m.barH);
			assert(m.aria === 'セットの一覧（3／10件）' && m.title === 'LoHトプロ' && m.snap === 'LoHトプロ', `T57(4) ${w}px: 読み上げの名前・title・結合画像の写しのセット名は今のまま`, m);
			assert(m.sw <= m.iw, `T57(4) ${w}px: 横スクロールなし`, m);
			// 鉛筆・N/10 を押しても同じ小窓が開く（1つのボタン）
			for (const part of ['set-name-pen', 'set-name-count']) {
				await page.click(`#deck-set-bar [data-usd-el="${part}"]`);
				await page.waitForTimeout(200);
				const open = await page.evaluate(() => ({ exp: document.querySelector('#deck-set-bar [data-usd-el="set-name"]').getAttribute('aria-expanded'),
					title: (document.querySelector('[data-usd-el="info-pop"] .uma-popover-title') || {}).textContent || null }));
				assert(open.exp === 'true' && open.title === '編成セット3/10', `T57(4) ${w}px: ${part === 'set-name-pen' ? '鉛筆' : 'N/10'} を押しても「編成セット 3/10」の小窓が開く`, open);
				await page.keyboard.press('Escape');
				await page.waitForTimeout(150);
			}
			assert(jsErrors(sp.errors).length === 0, `T57(4) ${w}px: コンソールのエラー0`, sp.errors);
			await sp.ctx.close();
		});
	}

	await block('T57セット名と文言(5) 外したお知らせだけが使っていた CSS の名前が製品のファイルに残っていない', async () => {
		const files = ['special.html', 'exam.html', 'uma-skill-deck.html', 'card-event-input.html', 'index.html', 'css/tokens.css', 'css/common.css', 'css/shell.css', 'css/styleguide.html',
			...fs.readdirSync(path.join(REPO_ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
		const gone = ['notice-catalog', 'notice-new', 'notice-deck-name', 'notice-icon', 'notice-title'];
		// 「notice-title」は id の「ui-notice-title-…」と重なるので、class の名前（. の後ろ・class 属性の中）として探す
		const hits = [];
		for (const f of files) {
			const src = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
			for (const g of gone) {
				const re = new RegExp('(\\.|class="[^"]*\\b|[\'" ])' + g + '(?:-[\\w-]*)?(?![\\w])', 'g');
				if (re.test(src.replace(/ui-notice-title(-[\w-]+)?/g, ''))) hits.push(f + ': ' + g);
			}
		}
		assert(hits.length === 0, 'T57(5) 消した CSS の名前（.notice-catalog*・.notice-new*・.notice-deck-name・.notice-icon・.notice-title）がどこにも残っていない', hits);
		// 使われているので残したもの（.notice-text は UmaExam の「効率を指定」の説明で使う）
		const shell = fs.readFileSync(path.join(REPO_ROOT, 'css/shell.css'), 'utf8');
		const exam = fs.readFileSync(path.join(REPO_ROOT, 'exam.html'), 'utf8');
		assert(/\.notice-text \{/.test(shell) && /class="notice-text"/.test(exam), 'T57(5) 使われている .notice-text は残っている', null);
	});
}
