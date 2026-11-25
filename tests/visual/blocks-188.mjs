// T216（2026-11-25・決定 912・913）: 決まりの一覧（tests/visual/design-spec.json）の確かめ。ブラウザは開かない（製品の CSS の文字を読むだけ）。
// run-smoke.mjs の末尾から register188() で呼ばれる（塊の見出しはすべて「T216」で始まる。`npm run test:visual -- --only=T216` で回せる）。
//
// 角の丸みの方針（デ106）は「方針・製品へは未適用」で持つ（corner.applied=false）。未適用の間は、検査は製品に 3px を要求しない。
// 製品へ移す T（違いの一覧 47 以降）が applied を true にすると、(3) が「例外以外で 3px でない宣言」を NG にする。
// 例外の確かめは、一覧の写し（メモリの上で崩したもの）で NG が出ることで示す。製品は変えない。

import { loadSpec, item, value, scanRadii, cornerViolations, roundCounts, isExceptionSelector, hasPart, alignProblem, cornerApplied } from './lib/design-spec.mjs';

export async function register188(env) {
	const { block, assert, REPO_ROOT } = env;
	const clone = (o) => JSON.parse(JSON.stringify(o));

	await block('T216(1) 決まりの一覧: すべての項目に デ○○ の番号・答え・原文があり、値のある項目は読める', async () => {
		const spec = loadSpec();
		const ids = Object.keys(spec.items);
		assert(ids.length >= 20, 'T216(1): 項目が20以上ある', ids.length);
		const bad = ids.filter((id) => { const it = spec.items[id]; return !it.de || !it.answer || !it.quote || !it.topic || !it.kind; });
		assert(bad.length === 0, 'T216(1): 全項目に de・topic・answer・quote・kind がある', bad);
		let ok = true; const miss = [];
		for (const id of ids) { try { if (spec.items[id].value !== undefined) value(spec, id); } catch (e) { ok = false; miss.push(id); } }
		assert(ok, 'T216(1): value のある項目は value() で読める', miss);
		assert(item(spec, 'de60').value.align === 'bottom-left', 'T216(1): デ60「↺ は左下」', item(spec, 'de60').value);
		assert(item(spec, 'toolCorner').value === '3px' && item(spec, 'de62').value === '3px' && item(spec, 'd920').value === '3px', 'T216(1): 道具の部品・帯のボタン・★の表の枠は 3px', null);
		assert(item(spec, 'de105').value === '6px' && item(spec, 'de105').selector === '.stitch-wire-sheet', 'T216(1): デ105「模式図の紙は 6px」', item(spec, 'de105'));
		assert(item(spec, 'd919').value.radius === '0px' && item(spec, 'd919').value.shadow === 'none', 'T216(1): 919「PC の見出しは角なし・影なし」', item(spec, 'd919').value);
		assert(typeof item(spec, 'de106').quote === 'string' && item(spec, 'de106').quote.includes('3px に統一'), 'T216(1): デ106 の原文が入っている', null);
	});

	await block('T216(2) 角の方針は「製品へは未適用」: 未適用の間は検査が製品に 3px を要求しない／円・錠剤形の宣言の数が一覧と同じ', async () => {
		const spec = loadSpec();
		const scan = scanRadii(REPO_ROOT);
		assert(scan.length > 200, 'T216(2): 製品から border-radius の宣言を拾えている（200件以上）', scan.length);
		assert(spec.corner.status === 'policy-unapplied', 'T216(2): 方針の状態は「方針・製品へは未適用」（製品へ移す T が applied を true にするときは、この確かめも直す）', spec.corner.status);
		assert(cornerApplied(spec) === false && cornerViolations(spec, scan).length === 0, 'T216(2): 未適用の間は、決まりと違う宣言の数え（cornerViolations）が 0（要求しない）', cornerViolations(spec, scan).length);
		const have = roundCounts(scan);
		const want = spec.corner.roundDeclCounts;
		const diff = [...new Set([...Object.keys(have), ...Object.keys(want)])].filter((k) => (have[k] || 0) !== (want[k] || 0)).map((k) => k + ': 製品 ' + (have[k] || 0) + '・一覧 ' + (want[k] || 0));
		assert(diff.length === 0, 'T216(2): 円・錠剤形（50%・999px 以上）の宣言のファイルごとの数が、一覧（corner.roundDeclCounts）と同じ。増えたら一覧（roundComponents・roundDeclCounts）に足す', diff);
		const sheet = scan.filter((d) => hasPart(d.selector, '.stitch-wire-sheet'));
		assert(sheet.length >= 1 && sheet.every((d) => d.value === '6px'), 'T216(2): .stitch-wire-sheet は製品で 6px（デ105）', sheet.map((d) => d.file + ':' + d.line + ' ' + d.value));
		const tbl = scan.filter((d) => hasPart(d.selector, '.rc-tbl-wrap'));
		assert(tbl.length >= 1 && tbl.every((d) => d.value === '3px'), 'T216(2): .rc-tbl-wrap は製品で 3px（920）', tbl.map((d) => d.file + ':' + d.line + ' ' + d.value));
	});

	await block('T216(3) 例外の確かめ: 一覧の写しを崩すと NG が出る（模式図の紙の例外を外す・円の例外を外す・紙の値を変える）／適用に切り替えた写しでは 3px でない製品の値が NG', async () => {
		const scan = scanRadii(REPO_ROOT);
		const applied = (mut) => { const s = loadSpec(); s.corner.applied = true; if (mut) mut(s); return cornerViolations(s, scan); };
		const base = applied();
		assert(base.length > 0, '(c) 適用に切り替えた写しでは、3px でない製品の値が NG になる（検査が働く）', base.length);
		assert(base.filter((d) => d.kind === 'round' || hasPart(d.selector, '.stitch-wire-sheet')).length === 0, '(c) 適用でも、円・錠剤形と、値が 6px の模式図の紙は NG にならない', base.filter((d) => d.kind === 'round' || hasPart(d.selector, '.stitch-wire-sheet')).length);
		const noSheet = applied((s) => { s.corner.exceptions.sheet.selectors = []; });
		assert(noSheet.length === base.length + scan.filter((d) => hasPart(d.selector, '.stitch-wire-sheet')).length, '(a) 模式図の紙（.stitch-wire-sheet）の例外を外した写しでは、紙の 6px が NG になる', noSheet.length - base.length);
		const sheet5 = applied((s) => { s.corner.exceptions.sheet.value = '5px'; });
		assert(sheet5.length > base.length, '(a) 例外の部品の角を 6px から 5px に変えた写しでは、紙の 6px が NG になる', sheet5.length - base.length);
		const noRound = applied((s) => { s.corner.exceptions.round.enabled = false; });
		assert(noRound.length === base.length + scan.filter((d) => d.kind === 'round').length, '(a) 円・錠剤形の例外を外した写しでは、円形の部品が NG になる', noRound.length - base.length);
		const tgt2 = applied((s) => { s.corner.target = '2px'; });
		assert(tgt2.length > base.length, '(a) 目標の値を 3px から 2px に変えた写しでは、3px の部品が NG になる', tgt2.length - base.length);
		// 未適用に戻すと、崩した写しでも要求しない（(b)）
		const off = loadSpec(); off.corner.exceptions.round.enabled = false; off.corner.exceptions.sheet.selectors = [];
		assert(cornerViolations(off, scan).length === 0, '(b) 未適用の間は、例外を崩した写しでも製品が OK（要求しない）', cornerViolations(off, scan).length);
		// 例外のセレクタの見分け
		const spec = loadSpec();
		assert(isExceptionSelector(spec, '.stitch-wire-sheet') === 'sheet' && isExceptionSelector(spec, '.stitch-wire-bar') === 'canvas-schema' && isExceptionSelector(spec, '.w2-btn') === 'canvas-schema' && isExceptionSelector(spec, '.hbtn') === null,
			'T216(3): 例外のセレクタの見分け（紙＝sheet・小窓の模式図＝canvas-schema・ふつうの部品＝null）', null);
	});

	await block('T216(4) 置き場所の決まり（デ60）: 左下の部品は右下の決まりで NG・右下の部品は左下の決まりで NG', async () => {
		const bar = { l: 16, r: 316 }, panel = { b: 200 };
		const left = { l: 16, r: 60, b: 190 }, right = { l: 272, r: 316, b: 190 };
		assert(alignProblem('bottom-left', left, bar, panel) === null && alignProblem('bottom-right', right, bar, panel) === null, 'T216(4): 決まりどおりなら通る', null);
		assert(alignProblem('bottom-left', right, bar, panel) !== null && alignProblem('bottom-right', left, bar, panel) !== null, 'T216(4): 逆の端にあれば NG', null);
		assert(alignProblem('bottom-left', { l: 16, r: 60, b: 230 }, bar, panel) !== null, 'T216(4): 下端がパネルの外なら NG', null);
	});
}
