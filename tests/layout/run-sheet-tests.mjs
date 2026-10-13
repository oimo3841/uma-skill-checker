// 下から出るシートが、iPhone の Safari（下のバーが開いた状態）でも画面に収まるかの検査（2026-10-13）。
//
//   node tests/layout/run-sheet-tests.mjs      （npm run test:sheets）
//
// ヘッドレスの Chromium には動的なバーが無いので、ビューポートの高さを 734px（バーが開いて見える高さ＝dvh）にして、
// CSS の「Nvh」だけを「N×8.44px」（バーが縮んだときの大きい画面＝844px基準）に差し替える。dvh はそのまま。実機の iOS と同じ関係。
// 確かめること:
//   (1) バーが開いた状態でも、シートの上端が画面の中（0以上）・下端が画面の下端以内
//   (2) バーが縮んだ状態では、シートの位置・高さが従来と同じ（修正前に測った値と一致）
// スキル名・件数は書かない。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer, REPO_ROOT } from '../visual/lib/serve.mjs';

const OUT = process.argv[2] || 'output/scratch/sheet-tests';
const LARGE = 844, VISIBLE = 734;
fs.mkdirSync(OUT, { recursive: true });
const srv = await startServer();
const browser = await chromium.launch();
const unitFix = (body) => body.replace(/(\d+(?:\.\d+)?)vh/g, (m, n) => 'calc(' + n + ' * ' + (LARGE / 100) + 'px)');

// 進化の選択画面・リセットのシート（段4。special の①）を開くための編成。スキル名・衣装名は書かず、id と実データの決定関数で選ぶ
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
const RACES = readJson('data/upcoming-races.json').races;
const raceOf = (id) => { const r = RACES.find((x) => x.id === id); const { id: rid, ...rest } = r; return Object.assign({ id: rid }, rest); };
const SCENARIO_DOC = readJson('data/scenario-event-skills.json');
const mkRoster = (o) => Object.assign({ rosterId: 'r_sheet', name: '', umaId: '', star: 3, awakeningLevel: 5, cardIds: [null, null, null, null, null, null] }, o);

async function open(file, scheme, simulate, seedRoster) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: simulate ? VISIBLE : LARGE }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	page.setDefaultTimeout(8000);
	if (simulate) {
		await page.route(/\.css(\?|$)|uma-skill-deck-core\.js(\?|$)/, async (route) => {
			const resp = await route.fetch();
			await route.fulfill({ response: resp, body: unitFix(await resp.text()) });
		});
	}
	if (seedRoster) {
		await page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(SCENARIO_DOC) }));
		await page.addInitScript((d) => { try { localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(d)); localStorage.setItem('umaSkillDeck:stepTab', '0'); } catch (e) {} }, seedRoster);
	}
	await page.addInitScript((s) => { try { localStorage.setItem('uma-tools-theme', s); localStorage.setItem('uma-special-ui-mode', 'new'); localStorage.setItem('uma-exam-ui-mode', 'new'); } catch (e) {} }, scheme);
	await page.goto(srv.base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
	for (let i = 0; i < 3; i++) { if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]').catch(() => {}); }
	await page.waitForTimeout(500);
	return { ctx, page };
}

// 開き方の違う3種（骨格 .uma-overlay の一覧・同じ骨格の短い一覧・Deck のスキル選択の小窓 .usd-modal-panel）
const CASES = [
	{ name: 'exam-factor-list', file: 'exam.html', open: 'window.openFactorList()', box: '#factor-list-box' },
	{ name: 'exam-gene-list', file: 'exam.html', open: 'window.openGeneList()', box: '#gene-list-box' },
	{ name: 'deck-picker', file: 'uma-skill-deck.html', clickText: '条件で検索', box: '.usd-modal-panel' }
];
// 進化の選択画面（金スキル3つの衣装・シナリオの候補3つ）とリセットのシート。編成は実データから探す（衣装の金スキルが3つ・3つとも進化の行が出るレースと脚質）
{
	const probeCtx = await browser.newContext({ viewport: { width: 390, height: LARGE } });
	const probe = await probeCtx.newPage();
	await probe.goto(srv.base + '/uma-skill-deck.html', { waitUntil: 'networkidle', timeout: 60000 });
	const found = await probe.evaluate(async ({ races }) => {
		const C = window.UmaSkillDeckCore;
		await C.loadSkillEvolutions(); await C.loadTrainingSources(false); await C.loadSkillPtData(false); await C.loadSkillEffectLevels();
		const umas = ((C.getTrainingSources().trainingUmamusume || {}).entries || []);
		for (const u of umas) {
			if (C.getEvolutionRowsOfUma(u.id).length !== 3) continue;
			const res = C.computeRosterSkills({ umaId: u.id, cardIds: [] }, {});
			for (const race of races) for (const style of ['nige', 'senko', 'sashi', 'oikomi']) {
				const pl = C.computeEvolutionPlan({ umaId: u.id, takenIds: res.skillIds, filter: { distance: race.distanceCategory, surface: race.surface, style: style }, race: race });
				if (pl.a.filter((e) => e.choice !== 'invalid').length === 3) return { id: u.id, race: race.id, style: style };
			}
		}
		return null;
	}, { races: RACES });
	await probeCtx.close();
	if (!found) { console.log('[NG] 進化の画面の検査: 金スキルが3つで3つとも進化の行が出る編成が見つからない'); process.exit(1); }
	CASES.push(
		{ name: 'evo-sheet-a3', file: 'special.html', seed: mkRoster({ umaId: found.id, race: raceOf(found.race), skillFilter: { style: found.style } }), clickSel: '[data-usd-el="evo-btn"]', box: '.usd-info-pop' },
		// シナリオの候補が3つ（uma-0009＋カード6枚＋京都 芝2200m・差し）: 「！」から開く
		{ name: 'evo-sheet-b', file: 'special.html', seed: mkRoster({ umaId: 'uma-0009', cardIds: ['card-0546', 'card-0543', 'card-0295', 'card-0499', 'card-0427', 'card-0518'], skillFilter: { style: 'sashi' }, race: raceOf('race-0001') }), clickSel: '[data-usd-el="evo-bang"]', box: '.usd-info-pop' },
		{ name: 'roster-reset', file: 'special.html', seed: mkRoster({ umaId: found.id, offSkillIds: [] }), clickSel: '[data-usd-el="roster-reset"]', box: '.usd-info-pop' }
	);
}
// バーが縮んだ状態（従来の見た目）の位置・高さの基準（修正前に測った値）
const BASE = { 'exam-factor-list': { top: 87, height: 757 }, 'exam-gene-list': { top: 479, height: 365 }, 'deck-picker': { top: 127, height: 717 } };
let fails = 0;
for (const c of CASES) for (const scheme of ['light', 'dark']) for (const simulate of [false, true]) {
	const { ctx, page } = await open(c.file, scheme, simulate, c.seed);
	if (c.open) await page.evaluate(c.open); else if (c.clickSel) await page.click(c.clickSel); else await page.getByText(c.clickText, { exact: false }).first().click();
	await page.waitForTimeout(600);
	const m = await page.evaluate((sel) => {
		const el = document.querySelector(sel);
		const r = el ? el.getBoundingClientRect() : null;
		return { innerHeight: window.innerHeight, box: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) } : null };
	}, c.box);
	await page.screenshot({ path: `${OUT}/${c.name}-${scheme}-${simulate ? 'barOpen' : 'barSmall'}.png` });
	await ctx.close();
	const label = c.name + '・' + (scheme === 'light' ? 'ライト' : 'ダーク') + '・' + (simulate ? 'バーが開いた状態（模擬）' : 'バーが縮んだ状態');
	const fits = !!m.box && m.box.top >= 0 && m.box.bottom <= m.innerHeight + 1;
	if (!fits) fails++;
	console.log((fits ? '[OK] ' : '[NG] ') + label + ': シートが画面に収まる（画面の高さ ' + m.innerHeight + '）', m.box);
	if (!simulate && BASE[c.name]) {
		const b = BASE[c.name];
		const same = !!m.box && m.box.top === b.top && m.box.height === b.height;
		if (!same) fails++;
		console.log((same ? '[OK] ' : '[NG] ') + label + ': 見た目（位置・高さ）が修正前と同じ', m.box);
	}
}
await browser.close();
await srv.close();
console.log('\n' + (fails === 0 ? '=== シートの検査: 全項目OK ===' : '=== シートの検査: NG ' + fails + '件 ==='));
process.exit(fails === 0 ? 0 : 1);
