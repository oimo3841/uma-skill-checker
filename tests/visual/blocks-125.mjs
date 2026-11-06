// T112（回答 329〜332）: 新しいモードの入口の行。オススメサポを出さず、脚質オススメの右に「条件で検索」「テキストで検索」を出す。
// run-smoke.mjs の末尾から register125() で呼ばれる（塊の見出しはすべて「T112」で始まる。`npm run test:visual -- --only=T112` で回せる）。
//
//  - 並び: デフォルト・レース＝オススメサポ → 脚質オススメ／新しいモード＝脚質オススメ → 条件で検索 → テキストで検索。
//  - 2つのボタンは虫眼鏡の小窓の中の同じボタンと同じものを開く。小窓の中身はどのモードでも同じ。
//  - 幅: 390・360px は1行に収まる／320px は横に送る（続きの見せ方は今の入口と同じ）／1280px は今の大きさ。デフォルトの寸法は変更前の commit の実測値で固定。
// T112_SHOTS=<フォルダ> で 幅-色-状態.png を残す。
import { reloadReady } from './lib/page-ready.mjs';
import { entryItem, ENTRY_SEARCH_BTN, readEntryItems } from './lib/entry-search.mjs';

const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
const R1 = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { style: 'senko' }, outsideOptions: { cards: ['card-0257', 'card-0402'] } };
const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const P = '#deck-template-panel ';
const FILTER = 'noplan-filter', SEARCH = 'noplan-search';
const ORDER_DEFAULT = 'outside-open,style-open';
const ORDER_NOPLAN = 'style-open,' + FILTER + ',' + SEARCH;
const TEXT_NOPLAN = '脚質オススメ,条件で検索,テキストで検索';
const TEXT_DEFAULT = 'オススメサポ,脚質オススメ';
// 変更前の commit（2d6438b）で測ったデフォルトの入口の行（字の大きさ・行の幅）
const BASE_DEFAULT = { 390: { fs: '11px', row: 196 }, 360: { fs: '10px', row: 178 }, 320: { fs: '9px', row: 144 }, 1280: { fs: '11px', row: 196 } };
// PC の新しいモードは今の大きさ（脚質オススメの変更前の幅 95.7・字 11px）
const STYLE_W_1280 = 95.7;

export async function register125(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const SHOTS = process.env.T112_SHOTS || '';
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const closeNotices = async (page) => { for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {}); };
	const races = readJson('data/upcoming-races.json').races.filter((r) => r.selectable !== false);
	const RACE = races.find((r) => r.venue && r.distance) || races[0];

	const open = async ({ w = 390, h = 844, roster = R1, tab = 1, theme = null } = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		await sp.page.evaluate(({ tab, roster, IDS, theme }) => {
			if (theme) localStorage.setItem('uma-tools-theme', theme);
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: IDS, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
		}, { tab, roster, IDS, theme });
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"], ' + P + '.usd-skillgroup-head', { timeout: 20000 });
		await sp.page.waitForTimeout(250);
		return sp;
	};
	const setMode = async (page, mode) => {
		await page.evaluate(({ mode, RACE }) => { const o = UmaSkillDeckCore.outside; if (mode === 'noplan') o.setNoPlan(); else o.setRace(mode === 'race' ? RACE : null); }, { mode, RACE });
		await page.waitForTimeout(300);
	};
	/** 入口の行を読む（見えているボタンの並び・寸法・見た目） */
	const readRow = (page) => page.evaluate(() => {
		const head = document.querySelector('#deck-template-panel .usd-skillgroup-head');
		const row = head.querySelector('.usd-entry-row');
		const vis = [...row.children].filter((b) => getComputedStyle(b).display !== 'none');
		const look = (b) => { const c = getComputedStyle(b); return { cls: b.className, bg: c.backgroundImage, color: c.color, bc: c.borderTopColor, bw: c.borderTopWidth, shadow: c.boxShadow, h: b.getBoundingClientRect().height, lh: c.lineHeight, radius: c.borderTopLeftRadius }; };
		const outside = row.querySelector('[data-usd-el="outside-open"]');
		const tools = head.querySelector('.usd-factor-tools');
		const rr = row.getBoundingClientRect();
		const circle = head.querySelector('[data-usd-el="factor-circle-mode"]');
		return {
			order: vis.map((b) => b.getAttribute('data-usd-el')).join(), texts: vis.map((b) => b.textContent.trim()).join(),
			acts: vis.map((b) => b.getAttribute('data-usd-act')),
			icons: vis.map((b) => (b.querySelector('svg') ? b.querySelector('svg').getAttribute('class') : '')),
			tops: vis.map((b) => Math.round(b.getBoundingClientRect().top)),
			widths: vis.map((b) => b.getBoundingClientRect().width), fs: vis.map((b) => getComputedStyle(b).fontSize),
			looks: vis.map(look), outsideInDom: !!outside, outsideDisabled: !!outside && outside.disabled, outsideW: outside ? outside.getBoundingClientRect().width : -1,
			rowC: row.clientWidth, rowS: row.scrollWidth, rowW: rr.width, rowH: rr.height, fade: row.getAttribute('data-usd-fade'), ox: getComputedStyle(row).overflowX,
			fit: head.getAttribute('data-usd-fit'), toolsW: tools.offsetWidth, toolsR: tools.getBoundingClientRect().right, headR: head.getBoundingClientRect().right,
			toolEls: [...tools.children].map((b) => b.getAttribute('data-usd-el')), circleOff: !!circle && circle.disabled,
			overlap: tools.getBoundingClientRect().left < rr.right - 0.5,
			docOver: document.documentElement.scrollWidth - window.innerWidth, bodyOver: document.body.scrollWidth - window.innerWidth,
			dark: document.documentElement.getAttribute('data-theme') || '',
		};
	});
	/** 開いている検索の画面を読んで閉じる */
	const readPicker = async (page) => {
		await page.waitForSelector('.usd-picker-panel[data-usd-mode]', { state: 'visible', timeout: 5000 });
		const r = await page.evaluate(() => {
			const p = document.querySelector('.usd-picker-panel[data-usd-mode]');
			const t = p.querySelector('.usd-picker-head h2, .usd-picker-head [id], .usd-picker-head');
			return { mode: p.getAttribute('data-usd-mode'), title: t ? t.textContent.trim() : '', popover: (() => { const l = document.querySelector('[data-usd-el="entry-search-list"]'); return !!l && l.getClientRects().length > 0; })() };
		});
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(150);
		return r;
	};

	for (const [w, h] of [[390, 844], [360, 740], [320, 568], [1280, 800]]) {
		for (const theme of ['light', 'dark']) {
			await block('T112 入口の行（' + w + 'px・' + theme + '）: 3通りの状態の中身と並び・幅', async () => {
				const tag = 'T112 ' + w + 'px ' + theme + ' ';
				const sp = await open({ w, h, theme });
				const shot = async (state) => {
					if (!SHOTS) return;
					fs.mkdirSync(SHOTS, { recursive: true });
					const box = await sp.page.locator(P + '[data-usd-el="skill-group"]').boundingBox();
					await sp.page.evaluate(() => document.querySelector('#deck-template-panel .usd-skillgroup-head').scrollIntoView({ block: 'center' }));
					await sp.page.waitForTimeout(100);
					await sp.page.screenshot({ path: path.join(SHOTS, w + '-' + theme + '-' + state + '.png') });
					return box;
				};
				const base0 = BASE_DEFAULT[w];
				const checkDefault = async (label) => {
					const d = await readRow(sp.page);
					assert(d.order === ORDER_DEFAULT && d.texts === TEXT_DEFAULT, tag + label + ': オススメサポ → 脚質オススメ', d.order);
					assert(!d.outsideDisabled, tag + label + ': オススメサポは押せる', d.outsideDisabled);
					assert(d.fs.every((x) => x === base0.fs) && Math.abs(d.rowW - base0.row) < 1, tag + label + ': 字と行の幅は変更前の実測のまま', [d.fs, d.rowW, base0]);
					assert(d.rowS <= d.rowC + 1 && !d.fade, tag + label + ': 横に送らない', [d.rowS, d.rowC, d.fade]);
					assert(d.docOver <= 0, tag + label + ': ページに横スクロールが出ない', d.docOver);
					assert(d.toolEls.join().indexOf('palette-delete,entry-search') === 0, tag + label + ': 右端の塊は今のまま', d.toolEls);
					return d;
				};
				await checkDefault('デフォルト');
				await shot('default');

				await setMode(sp.page, 'noplan');
				const n = await readRow(sp.page);
				assert(n.order === ORDER_NOPLAN && n.texts === TEXT_NOPLAN, tag + '新しいモード: 脚質オススメ → 条件で検索 → テキストで検索', n.order);
				assert(n.outsideW === 0, tag + '新しいモード: オススメサポは出ない（場所も詰める）', n.outsideW);
				assert(n.acts[1] === 'editor-pick' && n.acts[2] === 'editor-pick-search', tag + '新しいモード: 小窓の中のボタンと同じ操作', n.acts);
				const a = n.looks[0];
				for (const i of [1, 2]) {
					const b = n.looks[i];
					assert(b.cls === a.cls && b.bg === a.bg && b.color === a.color && b.bc === a.bc && b.bw === a.bw && b.shadow === a.shadow && Math.abs(b.h - a.h) < 0.5 && b.radius === a.radius,
						tag + '新しいモード: ' + n.texts.split(',')[i] + 'の見た目は脚質オススメと同じ', [a, b]);
				}
				assert(n.tops[0] === n.tops[1] && n.tops[1] === n.tops[2], tag + '新しいモード: 3つは横1列', n.tops);
				assert(!n.overlap && n.toolsR <= n.headR + 0.5, tag + '新しいモード: 右端の塊と重ならない', [n.overlap, n.toolsR, n.headR]);
				assert(n.docOver <= 0 && n.bodyOver <= 0, tag + '新しいモード: ページに横スクロールが出ない', [n.docOver, n.bodyOver]);
				assert(n.circleOff, tag + '新しいモード: ◎は押せないまま（307）', n.circleOff);
				if (w === 320) {
					assert(n.rowS > n.rowC + 1 && n.ox === 'auto' && n.fade === 'right', tag + '新しいモード: 収まらない幅は横に送る・続きの見せ方は今の入口と同じ', [n.rowS, n.rowC, n.ox, n.fade]);
					assert(n.fs.every((x) => x === '9px'), tag + '新しいモード: 送る幅の字は今の入口の一番小さい段（9px）', n.fs);
					const last = await sp.page.evaluate(async () => {
						const row = document.querySelector('#deck-template-panel .usd-entry-row');
						row.scrollLeft = 9999;
						await new Promise((r) => setTimeout(r, 100));
						const b = row.querySelector('[data-usd-el="noplan-search"]').getBoundingClientRect(), rr = row.getBoundingClientRect();
						const out = { inside: b.right <= rr.right + 1, fade: row.getAttribute('data-usd-fade') };
						row.scrollLeft = 0;
						return out;
					});
					assert(last.inside && last.fade === 'left', tag + '新しいモード: 送りきると最後のボタンが全部見える', last);
				} else {
					assert(n.rowS <= n.rowC + 0.5 && !n.fade, tag + '新しいモード: 1行に収まり横に送らない', [n.rowS, n.rowC, n.fade]);
				}
				if (w === 390) assert(n.fs.every((x) => x === '9px'), tag + '新しいモード: 390px の字は 9px', n.fs);
				if (w === 360) assert(n.fs.every((x) => x === '8px'), tag + '新しいモード: 360px の字は 8px', n.fs);
				if (w === 1280) assert(n.fs.every((x) => x === '11px') && !n.fit && Math.abs(n.widths[0] - STYLE_W_1280) < 1, tag + '新しいモード: PC は今の大きさ', [n.fs, n.fit, n.widths]);
				await shot('noplan');

				await setMode(sp.page, 'race');
				await checkDefault('レース');
				await setMode(sp.page, 'default');
				await checkDefault('デフォルトへ戻す');
				assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.page.context().close();
			});
		}
	}

	// かなが字の幅いっぱいの字体（iPhone・Android の日本語の字体に近い）でも 390・360px で1行に収まる。この PC の既定の字体はかなが詰まるので別に見る
	await block('T112 字の幅いっぱいの字体: 390・360px で1行に収まる', async () => {
		for (const [w, h] of [[390, 844], [375, 812], [360, 740]]) {
			const tag = 'T112 全角幅の字体 ' + w + 'px ';
			const sp = await open({ w, h });
			await sp.page.addStyleTag({ content: '#deck-template-panel .usd-entry-row > button { font-family: "Yu Gothic", "Hiragino Sans", "Noto Sans CJK JP", sans-serif !important; }' });
			await setMode(sp.page, 'noplan');
			const n = await readRow(sp.page);
			const em = await sp.page.evaluate(() => {
				const s = document.createElement('span'); s.textContent = 'オススメ'; s.style.cssText = 'font-family:"Yu Gothic","Hiragino Sans","Noto Sans CJK JP",sans-serif;font-size:8px;position:absolute;white-space:nowrap';
				document.body.appendChild(s); const x = s.getBoundingClientRect().width; s.remove(); return x;
			});
			assert(Math.abs(em - 32) < 1, tag + '前提: 字体は全角幅', em);
			assert(n.order === ORDER_NOPLAN && n.rowS <= n.rowC + 0.5 && !n.fade, tag + '1行に収まり横に送らない', [n.rowS, n.rowC, n.fade, n.fit, n.fs, n.widths]);
			assert(n.docOver <= 0 && !n.overlap, tag + 'はみ出さない', [n.docOver, n.overlap]);
			if (SHOTS && w !== 375) {
				fs.mkdirSync(SHOTS, { recursive: true });
				await sp.page.evaluate(() => document.querySelector('#deck-template-panel .usd-skillgroup-head').scrollIntoView({ block: 'center' }));
				await sp.page.waitForTimeout(100);
				await sp.page.screenshot({ path: path.join(SHOTS, w + '-light-noplan-zenkaku.png') });
			}
			await sp.page.context().close();
		}
	});

	await block('T112 2つのボタンは小窓の中のボタンと同じものを開く（小窓を経由しない）', async () => {
		for (const [w, h] of [[390, 844], [1280, 800]]) {
			const tag = 'T112 ' + w + 'px ';
			const sp = await open({ w, h });
			await setMode(sp.page, 'noplan');
			for (const [el, act, mode] of [[FILTER, 'editor-pick', 'filter'], [SEARCH, 'editor-pick-search', 'search']]) {
				await sp.page.click(P + '[data-usd-el="' + el + '"]');
				const fromRow = await readPicker(sp.page);
				assert(fromRow.mode === mode, tag + el + ': ' + mode + ' が開く', fromRow);
				assert(!fromRow.popover, tag + el + ': 小窓を経由しない', fromRow.popover);
				await sp.page.click(ENTRY_SEARCH_BTN);
				await sp.page.click(entryItem(act));
				const fromPop = await readPicker(sp.page);
				assert(fromPop.mode === fromRow.mode && fromPop.title === fromRow.title, tag + el + ': 小窓の中のボタンと同じものが開く', [fromRow, fromPop]);
			}
			// 脚質オススメは今までどおり開く
			await sp.page.click(P + '[data-usd-el="style-open"]');
			await sp.page.waitForSelector('[data-usd-el="style-top"] button', { state: 'visible', timeout: 8000 });
			await sp.page.keyboard.press('Escape');
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.page.context().close();
		}
		// スキルを足すと②に入る（条件で検索の決定の経路が小窓と同じ）。行のボタンから開いたときも保存先は同じ
		const sp = await open({ w: 390, h: 844 });
		await setMode(sp.page, 'noplan');
		const before = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds.length);
		await sp.page.click(P + '[data-usd-el="' + SEARCH + '"]');
		await sp.page.waitForSelector('.usd-picker-panel[data-usd-mode="search"]', { state: 'visible' });
		await sp.page.fill('[data-usd-el="search-input"]', 'の');
		await sp.page.waitForTimeout(300);
		await sp.page.locator('[data-usd-el="search-results"] .usd-tsearch-row:not(.usd-tsearch-row--added):not(.usd-tsearch-row--excluded):not([aria-disabled="true"])').first().click();
		await sp.page.click('[data-usd-el="picker-commit"]');
		await sp.page.waitForTimeout(300);
		const after = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds.length);
		assert(after > before, 'T112 行のテキストで検索から選ぶと②に入る', [before, after]);
		await sp.page.context().close();
	});

	await block('T112 虫眼鏡の小窓の中身はどのモードでも同じ', async () => {
		const sp = await open({ w: 390, h: 844 });
		const items = {};
		for (const mode of ['default', 'noplan', 'race']) {
			await setMode(sp.page, mode);
			items[mode] = await readEntryItems(sp.page);
			await sp.page.waitForTimeout(150);
		}
		const acts = items.default.map((i) => i.act).join();
		assert(acts === 'editor-pick,editor-pick-passive,editor-pick-search,editor-pick-screenshot,editor-pick-text', 'T112 小窓の中の並びは今のまま', acts);
		assert([items.default[0].text, items.default[2].text].join() === '条件で検索,テキストで検索', 'T112 ボタンの名前は小窓の中と同じ', items.default.map((i) => i.text));
		assert(JSON.stringify(items.noplan) === JSON.stringify(items.default) && JSON.stringify(items.race) === JSON.stringify(items.default), 'T112 3通りで同じ', items);
		await sp.page.context().close();
	});

	await block('T112 開き直し・保存の形・タブを開いたときの測り直し', async () => {
		// 新しいモードで開き直しても同じ行
		const sp = await open({ w: 360, h: 740, roster: Object.assign({}, R1, { noPlan: true }) });
		const n = await readRow(sp.page);
		assert(n.order === ORDER_NOPLAN && n.rowS <= n.rowC + 0.5, 'T112 開き直しても同じ並びで1行', [n.order, n.rowS, n.rowC]);
		// 別のタブにいて新しいモードへ切り替え、②を開いて測り直す（隠れている間は測れない）
		await setMode(sp.page, 'default');
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.waitForTimeout(150);
		await setMode(sp.page, 'noplan');
		await sp.page.evaluate(() => selectStepTab(1));
		await sp.page.waitForTimeout(300);
		const m = await readRow(sp.page);
		assert(m.order === ORDER_NOPLAN && m.rowS <= m.rowC + 0.5 && !m.fade, 'T112 隠れている間に切り替えても、開くと1行に収まる', [m.order, m.rowS, m.rowC, m.fade]);
		// 入口の行の変更で保存の形は変わらない
		const keys = await sp.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))).sort().join());
		assert(!/noplan-|entry/i.test(keys), 'T112 保存の形に入口の行のものを足さない', keys);
		// 新しいモードから戻すと、消えた2つのボタンは行に残らない
		await setMode(sp.page, 'default');
		const gone = await sp.page.evaluate(() => [...document.querySelectorAll('#deck-template-panel .usd-entry-row > button')].map((b) => b.getAttribute('data-usd-el')).join());
		assert(gone === ORDER_DEFAULT, 'T112 戻すと行の中は今の2つだけ', gone);
		assert(jsErrors(sp.errors).length === 0, 'T112 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.page.context().close();
	});
}
