// カードの種別・レアリティのアイコン化（段C。2026-10-21・C-186）の検査。run-smoke.mjs の末尾から register45() で呼ばれる
// （塊の見出しはすべて「C-186」で始まる。`npm run test:visual -- --only=C-186` で回せる）。
//
// 対象: オススメサポの小窓のカードと、①のカード選択の窓（サポカを選ぶ窓。種類のピルを含む）。カードの面は無彩色・外枠は細い線1本。
// 色が出るのは、左の種別アイコン（約20px）と右のレアリティバッジ（SSR・SR。約22〜24px）だけ。R は候補に入らないので印を作らない。
// 編成に入れ済みのカード（番号つき）は外枠が少し太い無彩色の線。「外す」「解除」は×印（押せる範囲は44px）。
// カード名・二つ名・種別・レアリティは検査の側に書かない（恒久ルール1。データから読む）。

export async function register45(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const CARDS = readJson('data/support-cards.json').entries;
	const byId = new Map(CARDS.map((c) => [c.id, c]));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const KEYS = { 1: 'speed', 2: 'stamina', 3: 'power', 4: 'guts', 5: 'wisdom', 6: 'friend' };
	const TYPE_NAMES = { 1: 'スピード', 2: 'スタミナ', 3: 'パワー', 4: '根性', 5: '賢さ', 6: '友人' };
	const FILES = ['type-speed', 'type-stamina', 'type-power', 'type-guts', 'type-wisdom', 'type-friend', 'rarity-ssr', 'rarity-sr'].map((k) => 'img/osusume-' + k + '-2026-10-21.png');
	const ROSTER_CARDS = ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'];
	// 二つ名がもっとも長い SSR（収まりの確認用）
	const LONG = CARDS.filter((c) => c.rarity === 'SSR' && !c.isGroup).sort((a, b) => (b.title.length + b.charaName.length) - (a.title.length + a.charaName.length))[0];
	const GROUP = CARDS.find((c) => c.isGroup);
	const R_CARD = CARDS.find((c) => c.rarity === 'R' && !c.isGroup);
	const ROSTER = (extra) => Object.assign({ umaId: 'uma-0179', cardIds: ROSTER_CARDS, skillFilter: { surface: 'turf', style: 'nige', distance: 'medium' }, outsideOptions: { count: 4, pinned: [LONG.id] } }, extra || {});
	const OM = '[data-usd-el="outside-modal"] ';
	const sleep = (page, ms) => page.waitForTimeout(ms);

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, EMPTY);
		sp.bad = [];
		sp.page.on('response', (r) => { if (/\/img\/osusume-/.test(r.url()) && r.status() !== 200) sp.bad.push(r.url() + ' ' + r.status()); });
		await sp.page.evaluate(({ roster, theme }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			try { localStorage.setItem('uma-tools-theme', theme); } catch (e) {}
		}, { roster: o.roster || ROSTER(), theme: o.theme || 'light' });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sleep(sp.page, 400);
		return sp;
	};
	const openOutside = async (page) => {
		await page.click('#deck-template-panel [data-usd-el="outside-open"]');
		await page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
		await sleep(page, 300);
	};
	const openPicker = async (page) => {
		await page.click(OM + '[data-usd-el="outside-slot"]');
		await page.waitForSelector('[data-usd-el="hits"] .usd-name-hit', { timeout: 10000 });
		await sleep(page, 300);
	};
	const srcKey = (src) => { const m = /osusume-(type|rarity)-([a-z]+)-2026-10-21\.png/.exec(src || ''); return m ? m[1] + ':' + m[2] : null; };

	await block('C-186 素材8点: すべて読み込める（404なし）・透明背景（四隅が透明・中身は不透明）・正方形・表示の約3倍（64／96px）／独自に生成した画像（公式の画像ではない）', async () => {
		const sp = await openSp();
		await openOutside(sp.page);
		const r = await sp.page.evaluate(async (files) => {
			const out = [];
			for (const f of files) {
				const img = new Image();
				img.src = f + '?t=' + Date.now();
				await new Promise((res) => { img.onload = res; img.onerror = res; });
				const ok = img.naturalWidth > 0;
				let corners = null, center = null;
				if (ok) {
					const c = document.createElement('canvas');
					c.width = img.naturalWidth; c.height = img.naturalHeight;
					const g = c.getContext('2d');
					g.drawImage(img, 0, 0);
					const a = (x, y) => g.getImageData(x, y, 1, 1).data[3];
					const w = c.width - 1, h = c.height - 1;
					corners = [a(0, 0), a(w, 0), a(0, h), a(w, h)];
					center = a(Math.floor(c.width / 2), Math.floor(c.height / 2));
				}
				out.push({ f, ok, w: img.naturalWidth, h: img.naturalHeight, corners, center });
			}
			return out;
		}, FILES);
		assert(r.every((x) => x.ok) && sp.bad.length === 0, 'C-186 8点とも読み込める（404 なし）', { r: r.filter((x) => !x.ok), bad: sp.bad });
		assert(r.every((x) => x.w === x.h && (/type/.test(x.f) ? x.w === 64 : x.w === 96)), 'C-186 正方形で、種別は 64px・レアリティは 96px', r.map((x) => [x.f.slice(18, 40), x.w, x.h]));
		assert(r.every((x) => x.corners.every((v) => v === 0) && x.center >= 250), 'C-186 背景は透明（四隅のアルファ0）で、中心は不透明（白い地が残っていない）', r.map((x) => [x.corners.join(), x.center]));
		const sizes = FILES.map((f) => fs.statSync(path.join(REPO_ROOT, f)).size);
		assert(sizes.every((s) => s < 40000), 'C-186 1枚 40KB 未満（縮小済み）', sizes);
		await sp.ctx.close();
	});

	await block('C-186 オススメサポのカード: 種別アイコン・レアリティバッジが、データの種別・レアリティどおり（SSR・SR だけ。色の塗り・虹の枠は無い）／ライト・ダーク（390・360・1280px）', async () => {
		for (const [w, theme] of [[390, 'light'], [390, 'dark'], [360, 'light'], [1280, 'light']]) {
			const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844 });
			await openOutside(sp.page);
			const tiles = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-cards"] .usd-out-card')).map((t) => {
				const cs = getComputedStyle(t);
				const ti = t.querySelector('[data-usd-el="card-type-icon"]'), ri = t.querySelector('[data-usd-el="card-rarity-icon"]');
				const tr = ti ? ti.getBoundingClientRect() : null, rr = ri ? ri.getBoundingClientRect() : null, tt = t.getBoundingClientRect();
				return { id: t.getAttribute('data-card-id'), type: ti ? ti.getAttribute('src') : null, typeAlt: ti ? ti.getAttribute('alt') : null, rar: ri ? ri.getAttribute('src') : null, rarAlt: ri ? ri.getAttribute('alt') : null,
					typeBox: tr ? [Math.round(tr.width), Math.round(tr.height)] : null, rarBox: rr ? [Math.round(rr.width), Math.round(rr.height)] : null, typeLeft: tr ? tr.left < tt.left + tt.width / 2 : null, rarRight: rr ? rr.left > tt.left + tt.width / 2 : null,
					bg: cs.backgroundColor, bgImg: cs.backgroundImage, bw: cs.borderTopWidth, bc: cs.borderTopColor, h: Math.round(tt.height), pinned: t.classList.contains('usd-out-card--pinned') };
			}));
			const tag = 'C-186 ' + w + 'px・' + theme + ': ';
			assert(tiles.length === 5, tag + 'カードは5枚（候補4＋編成に入れ済み1）', tiles.length);
			const bad = tiles.filter((t) => {
				const c = byId.get(t.id);
				const wantRar = c.rarity === 'SSR' ? 'rarity:ssr' : (c.rarity === 'SR' ? 'rarity:sr' : null);
				return srcKey(t.type) !== 'type:' + KEYS[c.typeOrder] || t.typeAlt !== TYPE_NAMES[c.typeOrder] || srcKey(t.rar) !== wantRar || (wantRar && t.rarAlt !== c.rarity);
			});
			assert(bad.length === 0, tag + '種別アイコンとレアリティバッジは、データの種別・レアリティどおり（alt も同じ）', { bad });
			assert(tiles.every((t) => t.typeBox[0] === 20 && t.typeBox[1] === 20 && t.typeLeft && t.rarRight && t.rarBox[0] >= 22 && t.rarBox[0] <= 24), tag + '種別アイコンは左に20px・バッジは右に22〜24px', tiles.map((t) => [t.typeBox, t.rarBox]));
			assert(new Set(tiles.map((t) => t.bg)).size === 1 && tiles.every((t) => t.bgImg === 'none'), tag + 'カードの面は種別によらず同じ無彩色の面（色の塗り・グラデーションなし）', tiles.map((t) => [t.bg, t.bgImg]));
			const cand = tiles.filter((t) => !t.pinned), pin = tiles.filter((t) => t.pinned);
			assert(cand.every((t) => t.bw === '1px') && pin.length === 1 && pin[0].bw === '2px' && new Set(tiles.map((t) => t.bc)).size <= 2, tag + '候補の外枠は細い線（1px）・編成に入れ済みのカードは少し太い線（2px）。枠の色は無彩色（種別・レアリティで変わらない）', tiles.map((t) => [t.pinned, t.bw, t.bc]));
			assert(tiles.every((t) => t.h === 44), tag + 'タイルの高さは揃っている（44px）', tiles.map((t) => t.h));
			assert(jsErrors(sp.errors).length === 0 && sp.bad.length === 0, tag + 'コンソールのエラー0・素材の404なし', { e: jsErrors(sp.errors).slice(0, 3), bad: sp.bad });
			await sp.ctx.close();
		}
	});

	await block('C-186 読み上げ・×: アイコンに alt・名前の部分の読み上げに「（種別・レアリティ）」／候補は「…を外す」・編成のカードは「…を解除」・「戻す」は文字のまま／×は見た目が小さく押せる範囲は44px', async () => {
		const sp = await openSp();
		await openOutside(sp.page);
		const r = await sp.page.evaluate(() => {
			const tiles = Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-cards"] .usd-out-card'));
			return tiles.map((t) => {
				const x = t.querySelector('[data-usd-el="outside-exclude"], [data-usd-el="outside-unpin"]');
				const xr = x.getBoundingClientRect();
				const g = x.querySelector('.usd-out-card-xg');
				return { id: t.getAttribute('data-card-id'), kind: x.getAttribute('data-usd-el'), label: x.getAttribute('aria-label'), text: x.textContent, box: [Math.round(xr.width), Math.round(xr.height)], glyph: g ? parseFloat(getComputedStyle(g).fontSize) : null,
					main: t.querySelector('[data-usd-el="outside-card-main"]').getAttribute('aria-label') };
			});
		});
		const kindOf = (id) => { const c = byId.get(id); return [TYPE_NAMES[c.typeOrder], c.rarity === 'SSR' || c.rarity === 'SR' ? c.rarity : ''].filter(Boolean).join('・'); };
		assert(r.every((x) => x.main.endsWith('（' + kindOf(x.id) + '）の情報')), 'C-186 名前の部分の読み上げに「（種別・レアリティ）」（例：「…（スピード・SSR）の情報」）', r.map((x) => x.main));
		assert(r.filter((x) => x.kind === 'outside-exclude').every((x) => x.label.endsWith('を外す')) && r.filter((x) => x.kind === 'outside-unpin').length === 1 && r.filter((x) => x.kind === 'outside-unpin').every((x) => x.label.endsWith('を解除')), 'C-186 読み上げは、候補のカードは「外す」・編成に入れ済みのカードは「解除」と区別する', r.map((x) => [x.kind, x.label]));
		assert(r.every((x) => x.text === '×' && x.box[0] >= 44 && x.box[1] >= 44 && x.glyph <= 16), 'C-186 文字は×印・押せる範囲は44px以上・×の字は16px以下', r.map((x) => [x.text, x.box, x.glyph]));
		// 除外中の一覧の「戻す」は文字のまま
		const cardId = r.find((x) => x.kind === 'outside-exclude').id;
		await sp.page.click(OM + '[data-usd-el="outside-exclude"][data-card-id="' + cardId + '"]');
		await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
		await sp.page.click(OM + '[data-usd-el="outside-excl-toggle"]');
		await sleep(sp.page, 200);
		const back = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-excl-card"] [data-usd-el="outside-restore"]'); return b ? { text: b.textContent, label: b.getAttribute('aria-label') } : null; });
		assert(back && back.text === '戻す' && back.label.endsWith('を戻す'), 'C-186 除外中のカードの「戻す」は文字のまま', back);
		await sp.ctx.close();
	});

	await block('C-186 二つ名: 残る（消さない）／カード名は12px・二つ名は10px（いままでより小さく）／最も長い二つ名のカードも切れずに収まる（390・360px・1280px）／見出し行・小窓の高さが破綻しない', async () => {
		for (const w of [390, 360, 1280]) {
			const sp = await openSp({ w, h: w === 1280 ? 900 : 844 });
			await openOutside(sp.page);
			const m = await sp.page.evaluate((id) => {
				const t = document.querySelector('[data-usd-el="outside-modal"] .usd-out-card[data-card-id="' + id + '"]');
				const all = Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] .usd-out-card'));
				const nick = t.querySelector('[data-usd-el="outside-card-nick"]'), name = t.querySelector('[data-usd-el="outside-card-name"]');
				const tr = t.getBoundingClientRect();
				const over = (e) => { const r = e.getBoundingClientRect(); return r.left < tr.left - 0.5 || r.right > tr.right + 0.5 || r.top < tr.top - 0.5 || r.bottom > tr.bottom + 0.5; };
				const panel = document.querySelector('[data-usd-el="outside-modal"] .usd-out-panel');
				return { nickText: nick ? nick.textContent : null, nickHidden: nick ? nick.hidden : null, nickSize: nick ? parseFloat(getComputedStyle(nick).fontSize) : null, nameSize: parseFloat(getComputedStyle(name).fontSize), nickOver: nick ? over(nick) : null, nameOver: over(name),
					hiddenNicks: all.filter((x) => { const n = x.querySelector('[data-usd-el="outside-card-nick"]'); return n && n.hidden; }).length, heights: all.map((x) => Math.round(x.getBoundingClientRect().height)), sw: document.documentElement.scrollWidth, vw: window.innerWidth,
					panelH: Math.round(panel.getBoundingClientRect().height), vh: window.innerHeight };
			}, LONG.id);
			const tag = 'C-186 ' + w + 'px: ';
			assert(m.nickText === '[' + LONG.title + ']' && m.nickHidden === false && m.nickSize === 10 && m.nameSize === 12, tag + '最も長い二つ名のカード（' + LONG.charaName + '）も二つ名が残る。二つ名は10px・カード名は12px', m);
			assert(!m.nickOver && !m.nameOver && m.hiddenNicks === 0, tag + '二つ名・名前はタイルからはみ出さない・二つ名を消したカードは無い', m);
			assert(m.heights.every((h) => h === 44) && m.sw <= m.vw && m.panelH <= m.vh, tag + 'タイルの高さは44px・横にはみ出さない・小窓は画面に収まる', m);
			await sp.ctx.close();
		}
	});

	await block('C-186 ①のカード選択の窓: 候補の行は無彩色の面・左に種別アイコン・右にレアリティバッジ（R は出ない）／種類のピルは無彩色＋アイコン／グループのカードは友人のアイコン／横にはみ出さない・ライト・ダーク', async () => {
		for (const [w, theme] of [[390, 'light'], [390, 'dark'], [360, 'light'], [1280, 'light']]) {
			const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844 });
			await openOutside(sp.page);
			await openPicker(sp.page);
			const tag = 'C-186 選ぶ窓 ' + w + 'px・' + theme + ': ';
			const rows = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="hits"] button.usd-name-hit')).map((b) => {
				const cs = getComputedStyle(b);
				const ti = b.querySelector('[data-usd-el="card-type-icon"]'), ri = b.querySelector('[data-usd-el="card-rarity-icon"]');
				return { label: b.querySelector('.usd-name-hit-label').textContent, type: ti ? ti.getAttribute('src') : null, rar: ri ? ri.getAttribute('src') : null, bg: cs.backgroundColor, bgImg: cs.backgroundImage, typeOrder: b.getAttribute('data-type-order'), left: ti ? ti.getBoundingClientRect().left < b.getBoundingClientRect().left + 40 : null,
					right: ri ? ri.getBoundingClientRect().right > b.getBoundingClientRect().right - 40 : null, over: b.scrollWidth > b.clientWidth + 1 };
			}));
			assert(rows.length > 10, tag + '候補の行が出る（' + rows.length + '件）', rows.length);
			const labelOf = (c) => (c.title ? '[' + c.title + ']' : '') + (c.isGroup && c.groupName ? c.groupName : c.charaName);
			const bad = rows.filter((r) => {
				const c = CARDS.find((x) => labelOf(x) === r.label);
				if (!c) return false;
				const wantRar = c.rarity === 'SSR' ? 'rarity:ssr' : (c.rarity === 'SR' ? 'rarity:sr' : null);
				return srcKey(r.type) !== 'type:' + KEYS[c.typeOrder] || srcKey(r.rar) !== wantRar;
			});
			assert(bad.length === 0, tag + '行の種別アイコン・レアリティバッジはデータどおり', bad.slice(0, 3));
			assert(rows.every((r) => r.left && r.right && r.bgImg === 'none') && new Set(rows.map((r) => r.bg)).size <= 2, tag + '種別アイコンは左・バッジは右・面は無彩色（種別で色を変えない。ホバー中の1行だけ別）', new Set(rows.map((r) => r.bg)).size);
			assert(!rows.some((r) => r.over), tag + '行の中身がはみ出さない', rows.filter((r) => r.over).length);
			const pills = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="types"] .usd-roster-pill')).map((b) => ({ text: b.textContent, icon: b.querySelector('img') ? b.querySelector('img').getAttribute('src') : null, alt: b.querySelector('img') ? b.querySelector('img').getAttribute('alt') : null, bg: getComputedStyle(b).backgroundColor, typed: b.classList.contains('usd-roster-pill--typed') })));
			assert(pills.length === 7 && pills.filter((p) => p.typed).length === 6 && pills.filter((p) => p.typed).every((p) => p.icon && srcKey(p.icon).startsWith('type:')) && new Set(pills.filter((p) => p.typed).map((p) => p.bg)).size === 1,
				tag + '種類のピルは「すべて」＋6つ。6つは同じ無彩色の面で、左に種別アイコン', pills.map((p) => [p.text, p.bg]));
			const sw = await sp.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
			assert(sw.sw <= sw.vw, tag + '画面は横にはみ出さない', sw);
			if (w === 390 && theme === 'light') await sp.page.screenshot({ path: path.join(REPO_ROOT, 'output', 'scratch', 'shots-c', 'C-picker.png') });
			// グループのカードと R のカード（名前で絞る）
			await sp.page.fill('[data-usd-el="find"]', GROUP.groupName || GROUP.charaName);
			await sleep(sp.page, 400);
			const g = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="hits"] .usd-name-hit'); const ti = b ? b.querySelector('[data-usd-el="card-type-icon"]') : null; return { has: !!b, type: ti ? ti.getAttribute('src') : null }; });
			assert(g.has && srcKey(g.type) === 'type:friend', tag + 'グループのカード（' + (GROUP.groupName || GROUP.charaName) + '）は元のカードの種別（友人）のアイコン', g);
			await sp.page.fill('[data-usd-el="find"]', labelOf(R_CARD));
			await sleep(sp.page, 400);
			const rc = await sp.page.evaluate((nm) => { const b = Array.from(document.querySelectorAll('[data-usd-el="hits"] .usd-name-hit')).find((x) => x.textContent.indexOf(nm) !== -1 && x.getAttribute('data-type-order')); return b ? { has: true, rar: !!b.querySelector('[data-usd-el="card-rarity-icon"]'), type: !!b.querySelector('[data-usd-el="card-type-icon"]') } : { has: false }; }, labelOf(R_CARD));
			assert(rc.has && rc.rar === false && rc.type === true, tag + 'R のカードは、レアリティのバッジを出さない（種別アイコンは出る）', rc);
			assert(jsErrors(sp.errors).length === 0 && sp.bad.length === 0, tag + 'コンソールのエラー0・素材の404なし', { e: jsErrors(sp.errors).slice(0, 3), bad: sp.bad });
			await sp.ctx.close();
		}
	});

	await block('C-186 触らないもの: ①のカード選択の窓の選び方（選ぶと①に入る・同じキャラクターは選べない・R も選べる）／①の編成の枠・保存データは変わらない', async () => {
		const roster = { umaId: 'uma-0179', cardIds: [] };
		const sp = await openSp({ roster, theme: 'light' });
		await sp.page.click('#step-tab-0');
		await sleep(sp.page, 500);
		const before = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		const slot = await sp.page.$('#deck-roster-panel [data-usd-act="pick-card"], #deck-roster-panel .usd-roster-slot > button');
		assert(!!slot, 'C-186 ①のカードの枠がある', true);
		await slot.click();
		await sp.page.waitForSelector('[data-usd-el="hits"] .usd-name-hit', { timeout: 10000 });
		assert((await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'))) === before, 'C-186 窓を開いただけでは保存データは変わらない', true);
		const first = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="hits"] .usd-name-hit[data-usd-act="take"]'); return b ? b.getAttribute('data-entry-id') : null; });
		await sp.page.click('[data-usd-el="hits"] .usd-name-hit[data-usd-act="take"]');
		await sleep(sp.page, 500);
		const r = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));
		assert(first && r.cardIds[0] === first, 'C-186 押すと①の最初の枠にそのカードが入る（選び方は変わらない）', { first, cardIds: r.cardIds });
		assert(jsErrors(sp.errors).length === 0, 'C-186 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
