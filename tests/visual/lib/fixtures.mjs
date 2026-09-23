// テスト用の代表データ。
//
// UmaSkill Deck は保存データが無いと画面がほぼ空になり、比較シートやテンプレート編集を
// 確認できない。実際のマスタースキルから先頭12件を借りて、テンプレート2件・比較シート1件・
// 候補3人（うち1人は無効）・★入力済みという「一通り埋まった状態」を作る。
//
// UmaStar OCR 側は、OCRを通さずに結果表だけを描画したいので、
// 合成した「OCRの行」を matchAllSkillsWithStars() に渡して結果オブジェクトを作る。
// 照合ロジック自体は本物を通るため、表示だけを作った張りぼてにはならない。
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './serve.mjs';

const master = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'uma-skill-deck-skills.json'), 'utf8'));

/** 代表スキル12件（テンプレート・比較シート・OCR照合リストで共通に使う） */
export const PICK = master.skills.slice(0, 12).map((s) => ({ id: s.id, name: s.name }));

export const TEMPLATE_ID = 'tpl_demo01';
export const RECORD_ID = 'rec_demo01';

/** 共通CSSが名乗っている版数（tokens.css / common.css / shell.css で1つ。テスト側に版数を直書きしないため） */
export const COMMON_CSS_VERSION =
	/--common-css-version:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(REPO_ROOT, 'css/tokens.css'), 'utf8'))[1];

function buildCells() {
	const cells = {};
	PICK.forEach((s, i) => {
		cells[s.id] = {};
		if (i % 3 !== 2) cells[s.id].c_a = (i % 3) + 1;
		if (i % 2 === 0) cells[s.id].c_b = 1;
	});
	return cells;
}

/**
 * OCRが書いた原本値。現在値（cells）とのズレが「手動修正済み」の判定になる。
 *
 * 候補 c_a だけをOCRに通した想定にする。applyStarAssignments は列の全スキルへ
 * 書き込むので、0も含めて全行に原本値が入る。そのうえで2行だけ食い違わせる:
 *   - PICK[1]: 原本1 → 現在2（手で上げた）
 *   - PICK[2]: 原本2 → 現在0（手で0に落とした。値が0でも枠は付く）
 * c_b / c_c は原本値を持たない＝OCR未実施の列で、枠は1つも付かない。
 */
function buildOcrCells() {
	const ocr = {};
	PICK.forEach((s, i) => {
		ocr[s.id] = { c_a: (i % 3 !== 2) ? (i % 3) + 1 : 0 };
	});
	ocr[PICK[1].id].c_a = 1;
	ocr[PICK[2].id].c_a = 2;
	return ocr;
}

/** 上の仕込みで枠が付くはずのセル（テスト側から参照する） */
export const EDITED_CELLS = [
	{ skillId: PICK[1].id, candidateId: 'c_a' },
	{ skillId: PICK[2].id, candidateId: 'c_a' },
];

/** localStorage の umaSkillDeck:userData に入れる中身 */
export const USER_DATA = {
	schemaVersion: 2,
	templates: [
		{ templateId: TEMPLATE_ID, name: '中距離・差し 想定', skillIds: PICK.map((s) => s.id), createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z' },
		{ templateId: 'tpl_demo02', name: 'ダート短距離 想定', skillIds: PICK.slice(0, 5).map((s) => s.id), createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z' },
	],
	records: [
		{
			recordId: RECORD_ID, name: '中距離・差し 想定 候補比較', sourceTemplateId: TEMPLATE_ID,
			skillIds: PICK.map((s) => s.id),
			candidates: [
				{ candidateId: 'c_a', label: '親A', enabled: true },
				{ candidateId: 'c_b', label: '親B', enabled: true },
				{ candidateId: 'c_c', label: '祖A1', enabled: false },
			],
			cells: buildCells(),
			ocrCells: buildOcrCells(),
			createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z',
		},
	],
	customSkills: [],
};

/** 保存データを仕込んだページを開く */
export async function openPage(browser, base, file, viewport = { width: 1280, height: 900 }) {
	const ctx = await browser.newContext({ viewport });
	const page = await ctx.newPage();
	// **Playwright の既定は30秒。** 在るはずの要素は5秒あれば必ず揃うので、そこまで待つ意味は無い。
	// 一方、壊して「在るはずのものが無い」状態を作ったときは、30秒待たれると破壊確認が進まない
	// （実際に「入口を既定で閉じる」に壊したとき、1番目の塊で30秒待って例外になった）。
	page.setDefaultTimeout(5000);
	// ページの読み込みだけは別枠にする（実測で 0.7〜1.3秒だが、ここは待ちを縮める話ではない）。
	page.setDefaultNavigationTimeout(30000);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	await page.addInitScript((d) => localStorage.setItem('umaSkillDeck:userData', JSON.stringify(d)), USER_DATA);
	await page.goto(base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
	/* **時間ではなく「整ったこと」で待つ。**（73セッション目）
	 *
	 * ここは長く 1.5秒の固定待ちだった。51回開くので**それだけで76.5秒**、スモーク全体の14%。
	 * 何を待っているのかを実測したところ、**networkidle の時点ですでに整っていた** ――
	 * `.uma-tw-ready` は 0ms で付いており（Tailwind の生成は読み込みの中で終わっている）、
	 * **networkidle のあと3秒間、DOM の変化は0回**（4ページ×3回とも）。
	 * そこで、待つ理由を条件として書き、落ち着くぶんだけを短く取る形にした。
	 *
	 * lucide は合図に使えない（生成した <svg> にも data-lucide が残るので、
	 * 「data-lucide が消える」では永久に待つことになる）。 */
	await page.waitForFunction(() => {
		if (document.readyState !== 'complete') return false;
		// Tailwind を読むページだけ、生成が済んだ印を待つ（card-event-input.html は読まない）
		const needsTw = !!document.querySelector('script[src*="tailwindcss-browser"]');
		return !needsTw || document.documentElement.classList.contains('uma-tw-ready');
	}, null, { timeout: 15000 });
	await page.waitForTimeout(200);
	return { ctx, page, errors };
}

/**
 * UmaStar OCR に「OCRが終わった状態」を作る。
 * 実際の操作と同じく、スキルリストを貼って解析ボタンを押してから、
 * 合成した行を本物の照合関数に通して結果表を描く。
 */
export async function seedSpecialResults(page) {
	await page.fill('#skill-list', PICK.map((s) => s.name).join('\n'));
	await page.click('button[onclick="parseSkillList()"]');
	await page.waitForTimeout(300);
	await page.evaluate((picked) => {
		const mk = (offset, missing) => {
			const lines = [];
			picked.forEach((s, i) => {
				if (missing.includes(i)) return;
				// i===4 だけ「★の計測が不確か」にして、?表示の経路も通す
				lines.push({ text: s.name, stars: ((i + offset) % 3) + 1, starsReliable: !(i === 4), rowKey: 'r' + i });
			});
			return matchAllSkillsWithStars(lines, skillList, skillIndex, {});
		};
		personResults[0] = mk(0, [7]);
		personResults[1] = mk(1, [2, 9]);
		personResults[2] = mk(2, [1, 5, 10]);
		renderResults();
	}, PICK);
	await page.waitForTimeout(600);
}
