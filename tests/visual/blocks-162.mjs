// T159（2026-11-09・決定 640）: オススメサポの残りの枠のカードを選ぶ小窓（outsidePickPinned）で、グループのカードのメンバー全員を
// 「同じキャラクター」として扱う直しの検査。run-smoke.mjs の末尾から register162() で呼ばれる
// （塊の見出しはすべて「T159」で始まる。`npm run test:visual -- --only=T159` で回せる）。
//
// 直したこと（js/uma-skill-deck-core.js の outsidePickPinned）: 選べないキャラクターを、指定済みのカードの outsideCharasOfCard（グループのカードは
// メンバー全員・それ以外は charaName の1人）の和にし、②のパネルの pickFactorCard と同じく members: true で小窓を開く。
// 直す前は代表者（charaName）だけで見ていたので、グループのカードを指定したあとでもメンバーの別のカードが選べ、計算で黙って外れていた。
//  (1) グループのカード → メンバー（代表者でない）のカードの順: メンバーのカードは「同じキャラクターが入っています」で選べない。
//      代表者のカードも選べない（今までと同じ）。関係の無いカード・メンバーの重ならないグループのカードは選べる。
//  (2) メンバーのカード → そのメンバーを含むグループのカードの順: グループのカードは選べない。グループのほかのメンバー（指定していない人）の
//      グループでないカードは選べる（グループでないカードの指定は charaName の1人で見るまま）。
//  (3) メンバーの重なるグループのカードどうし（どちらの順でも）: 選べない。
//  (4) グループでないカードどうし: 同じキャラクターの別のカードは選べない・別のキャラクターは選べる・指定済みのカードは「この編成に入っています」（今までと同じ）。
// 壊す確認: 直しを戻すと (1) のメンバーのカード・(2)・(3) が NG になり、(4) は通る（T159 の報告）。
// カード名・キャラクター名は検査の側に書かない（恒久ルール1。データの isGroup・groupMembers・charaName から選ぶ）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register162(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const KEY = 'umaSkillDeck:draftRoster:special';
	const M = '[data-usd-el="outside-modal"] ';
	const H = '[data-usd-el="roster-modal-host"] ';
	const CARDS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8')).entries;
	const byId = (id) => CARDS.find((c) => c.id === id);
	const charasOf = (c) => (c.isGroup === true ? c.groupMembers.slice() : [c.charaName]);
	const ssrOf = (name) => CARDS.filter((c) => c.isGroup !== true && c.rarity === 'SSR' && c.charaName === name).map((c) => c.id);
	// データから選ぶ: メンバーの重なるグループのカード2枚 G1・G2（重なる人 SHARED は、どちらの代表者でもなく、グループでない SSR を持つ）
	const groups = CARDS.filter((c) => c.isGroup === true);
	let G1 = null, G2 = null, SHARED = null;
	for (const a of groups) for (const b of groups) {
		if (G1 || a.id >= b.id) continue;
		const s = a.groupMembers.find((n) => b.groupMembers.includes(n) && n !== a.charaName && n !== b.charaName && ssrOf(n).length > 0);
		if (s) { G1 = a.id; G2 = b.id; SHARED = s; }
	}
	const g1 = G1 ? byId(G1) : null;
	const MEMBER_CARD = SHARED ? ssrOf(SHARED)[0] : null;                       // G1・G2 のメンバー（代表者でない）のグループでない SSR
	const REP_CARD = g1 ? ssrOf(g1.charaName)[0] : null;                         // G1 の代表者のグループでない SSR
	const OTHER_MEMBER = g1 ? g1.groupMembers.find((n) => n !== g1.charaName && n !== SHARED && ssrOf(n).length > 0) : null;
	const OTHER_MEMBER_CARD = OTHER_MEMBER ? ssrOf(OTHER_MEMBER)[0] : null;      // G1 のほかのメンバー（指定していない人）のグループでない SSR
	const used1 = new Set(groups.flatMap((g) => g.groupMembers));
	// グループのメンバーでないキャラクターで、グループでない SSR を2枚以上持つ人（X1・X2）と、別のキャラクターの SSR（Y）
	const freeNames = Array.from(new Set(CARDS.filter((c) => c.isGroup !== true && c.rarity === 'SSR' && !used1.has(c.charaName)).map((c) => c.charaName)));
	const XNAME = freeNames.find((n) => ssrOf(n).length >= 2);
	const X1 = XNAME ? ssrOf(XNAME)[0] : null;
	const X2 = XNAME ? ssrOf(XNAME)[1] : null;
	const Y = (freeNames.find((n) => n !== XNAME) && ssrOf(freeNames.find((n) => n !== XNAME))[0]) || null;
	// メンバーが G1 と重ならないグループのカード（選べる）
	const G3 = (groups.find((g) => g.id !== G1 && !g.groupMembers.some((n) => g1 && g1.groupMembers.includes(n))) || {}).id || null;
	const PICKED = { G1, G2, G3, SHARED_MEMBER: MEMBER_CARD, REP_CARD, OTHER_MEMBER_CARD, X1, X2, Y };

	/** special.html の②を、残りの枠に pinned を指定した下書きで開き、オススメサポの小窓を開く */
	const openWith = async (pinned) => {
		const sp = await openPage(browser, base, 'special.html', { width: 390, height: 900 }, EMPTY);
		sp.errors = sp.errors || [];
		const roster = { rosterId: 'r_t159', name: '', umaId: '', star: 3, awakeningLevel: 5, cardIds: [null, null, null, null, null, null], outsideOptions: { count: 4, pinned } };
		await sp.page.evaluate(({ key, roster }) => {
			localStorage.setItem(key, JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { key: KEY, roster });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		await sp.page.click('#deck-template-panel [data-usd-el="outside-open"]');
		await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
		return sp;
	};
	/** 空いた残りの枠を押して選ぶ小窓を開く */
	const openSlot = async (page) => {
		await page.click(M + '[data-usd-el="outside-slot"]');
		await page.waitForSelector(H + '[data-usd-el="hits"]', { timeout: 5000 });
		await page.waitForTimeout(150);
	};
	/** 選ぶ小窓でカードの二つ名を探し、そのカードの行を返す: { n（当たった行の数）, button（押せるか）, note（選べない理由の文）} */
	const hitOf = async (page, id) => {
		const title = byId(id).title;
		await page.fill(H + '[data-usd-el="find"]', '');
		await page.fill(H + '[data-usd-el="find"]', title);
		await page.waitForTimeout(250);
		return page.evaluate((title) => {
			const rows = Array.from(document.querySelectorAll('[data-usd-el="roster-modal-host"] [data-usd-el="hits"] .usd-name-hit'))
				.filter((h) => { const l = h.querySelector('.usd-name-hit-label'); return !!l && l.textContent.indexOf('[' + title + ']') === 0; });
			return { n: rows.length, button: rows.length === 1 && rows[0].tagName === 'BUTTON', note: rows.length === 1 ? ((rows[0].querySelector('.usd-name-added') || {}).textContent || '') : '',
				cls: rows.length === 1 ? rows[0].className : '' };
		}, title);
	};
	const SAME = '同じキャラクターが入っています';
	const IN = 'この編成に入っています';
	const blocked = (h) => h.n === 1 && !h.button && h.note === SAME && /usd-name-hit--added/.test(h.cls);
	const free = (h) => h.n === 1 && h.button && h.note === '';
	/** 選べるカードを1枚選んで指定に足す（選ぶ小窓が閉じ、計算が終わるまで待つ） */
	const take = async (page, id) => {
		await hitOf(page, id);
		await page.click(H + '[data-usd-act="take"][data-entry-id="' + id + '"]');
		await page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]') && !document.querySelector('[data-usd-el="roster-modal-host"] [data-usd-el="modal"]'); }, null, { timeout: 30000 });
		await page.waitForTimeout(200);
	};
	const pinnedOf = (page) => page.evaluate((key) => ((JSON.parse(localStorage.getItem(key) || '{}').outsideOptions || {}).pinned || []), KEY);

	await block('T159 (0) 前提: データから、メンバーの重なるグループのカード2枚・そのメンバーのカード・代表者のカード・ほかのメンバーのカード・重ならないグループのカード・グループでないカード3枚が選べる', async () => {
		assert(Object.values(PICKED).every(Boolean), 'T159(0) データから選べた', PICKED);
		assert(byId(G1).charaName !== byId(G2).charaName && byId(MEMBER_CARD).charaName !== byId(G1).charaName && byId(MEMBER_CARD).charaName !== byId(G2).charaName,
			'T159(0) G1・G2 の代表者どうし、メンバーのカードと代表者は別のキャラクター（代表者だけで見ると選べてしまう組み合わせ）', PICKED);
	});

	await block('T159 (1) グループのカードを指定 → メンバー（代表者でない）のカードは「同じキャラクターが入っています」で選べない・代表者のカードも選べない・関係の無いカードとメンバーの重ならないグループのカードは選べる', async () => {
		const sp = await openWith([G1]);
		try {
			await openSlot(sp.page);
			const pin = await hitOf(sp.page, G1);
			assert(pin.n === 1 && !pin.button && pin.note === IN, 'T159(1) 指定済みのグループのカードは「' + IN + '」', pin);
			const mem = await hitOf(sp.page, MEMBER_CARD);
			assert(blocked(mem), 'T159(1) 代表者でないメンバーのカード（' + MEMBER_CARD + '）は「' + SAME + '」で選べない（今の「同じキャラクター」と同じ見た目・文）', mem);
			const oth = await hitOf(sp.page, OTHER_MEMBER_CARD);
			assert(blocked(oth), 'T159(1) ほかのメンバーのカード（' + OTHER_MEMBER_CARD + '）も選べない', oth);
			const rep = await hitOf(sp.page, REP_CARD);
			assert(blocked(rep), 'T159(1) 代表者のカード（' + REP_CARD + '）は選べない（今までと同じ）', rep);
			const y = await hitOf(sp.page, Y);
			assert(free(y), 'T159(1) 関係の無いカード（' + Y + '）は選べる', y);
			const g3 = await hitOf(sp.page, G3);
			assert(free(g3), 'T159(1) メンバーの重ならないグループのカード（' + G3 + '）は選べる', g3);
			// 選べる行を選ぶと指定に入る（流れは今までと同じ）
			await take(sp.page, Y);
			const p = await pinnedOf(sp.page);
			assert(p.join() === [G1, Y].join(), 'T159(1) 選べるカードを選ぶと指定に足される', p);
			assert(jsErrors(sp.errors).length === 0, 'T159(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T159 (2) メンバーのカードを指定 → そのメンバーを含むグループのカード（2枚とも）は選べない・グループのほかのメンバーのカードは選べる', async () => {
		const sp = await openWith([MEMBER_CARD]);
		try {
			await openSlot(sp.page);
			const a = await hitOf(sp.page, G1);
			assert(blocked(a), 'T159(2) メンバーのカード（' + MEMBER_CARD + '）の指定のあと、そのメンバーを含むグループのカード ' + G1 + ' は「' + SAME + '」で選べない', a);
			const b = await hitOf(sp.page, G2);
			assert(blocked(b), 'T159(2) 同じく ' + G2 + ' も選べない', b);
			const rep = await hitOf(sp.page, REP_CARD);
			assert(free(rep), 'T159(2) グループの代表者のグループでないカード（' + REP_CARD + '）は選べる（グループでないカードの指定は charaName の1人で見る）', rep);
			const g3 = await hitOf(sp.page, G3);
			assert(free(g3), 'T159(2) メンバーの重ならないグループのカード（' + G3 + '）は選べる', g3);
			assert(jsErrors(sp.errors).length === 0, 'T159(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T159 (3) メンバーの重なるグループのカードどうし: どちらを先に指定しても、もう一方は選べない', async () => {
		for (const [first, second] of [[G1, G2], [G2, G1]]) {
			const sp = await openWith([first]);
			try {
				await openSlot(sp.page);
				const h = await hitOf(sp.page, second);
				assert(blocked(h), 'T159(3) ' + first + ' を指定 → メンバーの重なる ' + second + ' は「' + SAME + '」で選べない', h);
				assert(jsErrors(sp.errors).length === 0, 'T159(3) ' + first + ' 先: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			} finally { await sp.ctx.close(); }
		}
	});

	await block('T159 (4) グループでないカードどうし（今までと同じ）: 同じキャラクターの別のカードは選べない・別のキャラクターは選べる・指定済みは「この編成に入っています」・グループのカードは重なるときだけ選べない', async () => {
		const sp = await openWith([X1]);
		try {
			await openSlot(sp.page);
			const x1 = await hitOf(sp.page, X1);
			assert(x1.n === 1 && !x1.button && x1.note === IN, 'T159(4) 指定済みのカード（' + X1 + '）は「' + IN + '」', x1);
			const x2 = await hitOf(sp.page, X2);
			assert(blocked(x2), 'T159(4) 同じキャラクターの別のカード（' + X2 + '）は「' + SAME + '」で選べない', x2);
			const y = await hitOf(sp.page, Y);
			assert(free(y), 'T159(4) 別のキャラクターのカード（' + Y + '）は選べる', y);
			const g = await hitOf(sp.page, G1);
			assert(free(g), 'T159(4) メンバーと重ならないグループのカード（' + G1 + '）は選べる', g);
			await take(sp.page, Y);
			const p = await pinnedOf(sp.page);
			assert(p.join() === [X1, Y].join(), 'T159(4) 選ぶと指定に足される', p);
			assert(jsErrors(sp.errors).length === 0, 'T159(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});
}
