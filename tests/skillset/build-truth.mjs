// 「正解」の案を作り、おいもさんが確認・修正するためのページを書き出す。
//
//   node tests/skillset/build-truth.mjs --set=2026-09-11a [--kind=images]
//
// 手順（フェーズ0の指示3）:
//   1. 鮮明な切り出し画像のOCR結果（reports/ocr-<セット>-sharp.json の全変種の読み）を、
//      スキル名の辞書（reference/skill-names.json。無ければマスター445種）に照合して案を作る
//   2. タブごとに「読めた種類数＝設定数」かを確認する（設定数はバッジをOCRして読む）
//   3. 完全一致以外・種類数の食い違いだけを一覧にする（切り出し画像を並べて見られるHTML）
//   4. おいもさんが確認して保存したものを truth/<セット>.json に置く
//
// 出力: truth/<セット>.draft.json と reports/review-<セット>.html

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { assetsRoot, assetsDir, relToAssets } from './lib/assets.mjs';
import { openOcr } from './lib/ocr.mjs';
import { fileToDataUrl } from './lib/browser.mjs';
import { loadMaster } from './lib/common-in-node.mjs';
import { buildMatcher } from './lib/match.mjs';
import { combineReads } from './run-ocr-crops.mjs';
import { toSequence, stitchSequences, countKinds } from './lib/stitch-sequence.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

function loadLexicon() {
	const file = path.join(assetsRoot(), 'reference', 'skill-names.json');
	if (!fsSync.existsSync(file)) return null;
	const json = JSON.parse(fsSync.readFileSync(file, 'utf-8'));
	return json.names.map((n) => ({ id: `name:${n}`, name: n }));
}

function esc(s) {
	return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 「設定数 N / 200」のバッジから N を読む。読めなければ null（処理は止めない）。 */
async function readBadgeCount(ocr, file) {
	if (!fsSync.existsSync(file)) return null;
	const res = await ocr.prepareAndRecognize(await fileToDataUrl(file), { scale: 2, productLike: false });
	for (const r of res.reads) {
		// 丸数字（⑥①）や全角数字で読まれることが多いので NFKC で潰してから拾う。
		// ⑳ は NFKC で "20" に開くため、"⑳0" が "200" になる。
		const m = /(\d{1,3})\s*[/／]\s*(\d{2,3})/.exec(String(r.text).normalize('NFKC'));
		if (m) return { count: Number(m[1]), capacity: Number(m[2]), raw: r.text };
	}
	return { count: null, capacity: null, raw: res.reads.map((r) => r.text).join(' | ') };
}

async function main() {
	const setName = argValue('set', '2026-09-11a');
	const kind = argValue('kind', 'images');
	const cropsDir = path.join(assetsRoot(), 'crops', setName);
	const indexFile = path.join(cropsDir, 'index.json');
	if (!fsSync.existsSync(indexFile)) {
		console.error(`crops/${setName}/index.json がありません。先に run-extract-cards.mjs を実行してください`);
		process.exit(1);
	}
	const index = JSON.parse(await fs.readFile(indexFile, 'utf-8'));
	// 正解の案づくりには、鮮明な条件で取れた読みを**全部**使う（前処理あり・なしの両方）。
	// 精度の実測とは目的が違い、ここでは候補を絞るより多く集めるほうがよい。
	const reportsDir = path.join(assetsRoot(), 'reports');
	const sharpReports = fsSync.existsSync(reportsDir)
		? fsSync.readdirSync(reportsDir).filter((f) => /^ocr-.+-sharp(-raw)?\.json$/.test(f) && f.includes(setName))
		: [];
	if (!sharpReports.length) {
		console.error(`reports/ocr-${setName}-sharp.json がありません。先に run-ocr-crops.mjs --conditions=sharp-raw,sharp を実行してください`);
		process.exit(1);
	}
	const readsById = new Map();
	for (const f of sharpReports) {
		const rep = JSON.parse(await fs.readFile(path.join(reportsDir, f), 'utf-8'));
		rep.rows.forEach((r) => {
			if (!readsById.has(r.id)) readsById.set(r.id, []);
			const list = readsById.get(r.id);
			(r.texts || [r.text]).forEach((t) => {
				if (!list.includes(t)) list.push(t);
			});
		});
	}
	console.log(`読みの取り込み元: ${sharpReports.join(', ')}`);

	const master = loadMaster();
	const masterByName = new Map(master.map((s) => [s.name, s]));
	const lexicon = loadLexicon();
	if (!lexicon) {
		console.log('※ reference/skill-names.json がありません。マスター445種だけで案を作ります');
		console.log('  （スキルセット画面にはマスターに無いスキルも並ぶため、build-name-lexicon.mjs の実行を勧めます）');
	}
	const matcher = buildMatcher(lexicon || master);

	// 目視で決めた分の上書き（あれば）。OCRで決められないカードは必ず残るので、
	// 「誰がどうやって決めたか」を残せる形にしておく。
	const overrideFile = path.join(assetsRoot(), 'truth', `${setName}.overrides.json`);
	const overrides = fsSync.existsSync(overrideFile)
		? JSON.parse(fsSync.readFileSync(overrideFile, 'utf-8'))
		: { cards: {} };
	if (Object.keys(overrides.cards || {}).length) {
		console.log(`目視での上書き ${Object.keys(overrides.cards).length}件（${path.basename(overrideFile)}）`);
	}

	const cards = [];
	for (const image of index.images) {
		for (const c of image.cards) {
			const texts = readsById.get(c.id) || [];
			const { chosen } = combineReads(texts.map((t) => ({ text: t, confidence: 0 })), matcher);
			const override = (overrides.cards || {})[c.id];
			// status: auto=一意に一致 / guess=候補が1つだけ（距離1以上）/ override=目視 / check=要確認
			let name = chosen.skill ? chosen.skill.name : null;
			let status = name ? 'auto' : 'check';
			if (!name && chosen.topCandidate && (chosen.candidates || []).filter((x) => x.distance === chosen.distance).length === 1) {
				name = chosen.topCandidate.name;
				status = 'guess';
			}
			if (override) {
				name = override;
				status = 'override';
			}
			const inMaster = name ? masterByName.has(name) : false;
			cards.push({
				id: c.id,
				source: image.source,
				tab: image.activeTab,
				readings: texts,
				proposedName: name,
				status,
				category: chosen.category,
				reason: chosen.reason,
				candidates: (chosen.candidates || []).slice(0, 6).map((x) => x.name),
				topCandidate: chosen.topCandidate ? chosen.topCandidate.name : null,
				inMaster,
				skillId: inMaster ? masterByName.get(name).id : null
			});
		}
	}

	// タブごとの完全性チェック
	const ocr = await openOcr();
	const badges = {};
	try {
		for (const image of index.images) {
			const badgeFile = path.join(cropsDir, `${path.basename(image.source, path.extname(image.source))}-badge.png`);
			badges[image.source] = await readBadgeCount(ocr, badgeFile);
		}
	} finally {
		await ocr.close();
	}

	const byTab = new Map();
	index.images.forEach((image) => {
		const tab = image.activeTab || '不明';
		if (!byTab.has(tab)) byTab.set(tab, { images: [], names: new Set(), unresolved: 0, capacity: null });
		byTab.get(tab).images.push(image.source);
	});
	cards.forEach((c) => {
		const t = byTab.get(c.tab || '不明');
		if (!t) return;
		if (c.proposedName) t.names.add(c.proposedName);
		else t.unresolved++;
	});
	const badgeCounts = {};
	Object.entries(badges).forEach(([src, b]) => {
		if (!b) return;
		const image = index.images.find((i) => i.source === src);
		const tab = (image && image.activeTab) || '不明';
		if (!badgeCounts[tab]) badgeCounts[tab] = [];
		badgeCounts[tab].push(b.count);
	});

	// 撮り漏れの判定用に、タブごとに画像を継ぎ合わせて「並んでいたカードの種類数」を数える。
	// 金のカードはOCRにかけていないので、名前ではなく並びの一致で重複を消す。
	const nameById = new Map(cards.map((c) => [c.id, c.proposedName]));
	const stitchByTab = new Map();
	for (const [tab, t] of byTab) {
		const seqs = index.images
			.filter((im) => (im.activeTab || '不明') === tab)
			.map((im) => toSequence(im.cards, (id) => nameById.get(id)));
		const st = stitchSequences(seqs);
		stitchByTab.set(tab, { ...countKinds(st.sequence), gaps: st.gaps, overlaps: st.overlaps });
	}

	const autoCount = cards.filter((c) => c.status === 'auto').length;
	const byStatus = (st) => cards.filter((c) => c.status === st).length;
	console.log(`内訳: 一意一致 ${byStatus('auto')} / 候補1つ ${byStatus('guess')} / 目視 ${byStatus('override')} / 要確認 ${byStatus('check')}`);
	console.log(`カード ${cards.length}枚 / 自動で名前が決まった ${autoCount}枚 / 要確認 ${cards.length - autoCount}枚`);
	const summaryLines = [];
	for (const [tab, t] of byTab) {
		const counts = badgeCounts[tab] || [];
		const known = counts.filter((n) => n != null);
		const st = stitchByTab.get(tab) || { total: 0, lavender: 0, gold: 0, unknown: 0, gaps: 0 };
		const expected = known.length ? Math.max(...known) : null;
		// 撮り漏れの判定は「全色の検出種類数 vs 設定数」。取り込みの成否とは別の話なので分けて出す。
		// 撮り漏れの判定は種類数と設定数の突き合わせだけで決める。
		// 継ぎ目が合わない件数は参考情報（バッジに隠れて落ちたカードがあると、
		// 前後の画像の並びが1枚ぶんずれて合わなくなるが、種類数は正しく出る）。
		const ok = expected != null && expected === st.total;
		const line =
			`タブ ${tab}: 画像 ${t.images.length}枚 / 検出 ${st.total}種（取り込み対象 ${st.lavender}種・対象外の金 ${st.gold}種` +
			(st.unknown ? `・名前未確定 ${st.unknown}種` : '') +
			`） / 設定数 ${expected == null ? '読めず' : expected}` +
			(st.gaps ? ` / 継ぎ目が合わない箇所 ${st.gaps}件（参考）` : '') +
			(expected == null ? '（撮り漏れの判定は省略）' : ok ? ' → 撮り漏れなし' : ' → **撮り漏れの疑い**');
		console.log('  ' + line);
		summaryLines.push({
			tab,
			images: t.images.length,
			detected: st.total,
			lavender: st.lavender,
			gold: st.gold,
			unknown: st.unknown,
			gaps: st.gaps,
			unique: t.names.size,
			expected,
			unresolved: t.unresolved,
			ok
		});
	}

	const draft = {
		set: setName,
		kind,
		generatedAt: new Date().toISOString(),
		note: '案。おいもさんの確認・修正を経て truth/<セット>.json として保存する。',
		tabs: summaryLines,
		badges,
		cards
	};
	const draftFile = path.join(assetsDir('truth'), `${setName}.draft.json`);
	await fs.writeFile(draftFile, JSON.stringify(draft, null, '\t'), 'utf-8');

	// 確認用ページ（切り出し画像を埋め込んだ自己完結HTML）
	const imgData = new Map();
	for (const c of cards) {
		imgData.set(c.id, await fileToDataUrl(path.join(cropsDir, `${c.id}.png`)));
	}
	const html = renderReview(setName, draft, imgData, lexicon ? lexicon.length : master.length, master.length);
	const htmlFile = path.join(assetsDir('reports'), `review-${setName}.html`);
	await fs.writeFile(htmlFile, html, 'utf-8');
	console.log(`\n→ ${relToAssets(draftFile)}`);
	console.log(`→ ${relToAssets(htmlFile)}  ← これをブラウザで開いて確認・修正し、truth/${setName}.json として保存`);

	// --write-truth: 案をそのまま truth/<セット>.json に書く。
	// **おいもさんの確認前の暫定値**であることを中に明記する。確認後は上のHTMLから
	// 保存し直したものが同じ場所を上書きする（confirmedBy が human に変わる）。
	if (process.argv.includes('--write-truth')) {
		const truthFile = path.join(assetsDir('truth'), `${setName}.json`);
		if (fsSync.existsSync(truthFile) && !process.argv.includes('--force')) {
			console.log(`\n※ truth/${setName}.json は既にあるので上書きしません（上書きするなら --force）`);
		} else {
			const unresolved = cards.filter((c) => !c.proposedName);
			await fs.writeFile(
				truthFile,
				JSON.stringify(
					{
						set: setName,
						kind,
						confirmedBy: 'claude-proposal（暫定。おいもさんの確認待ち）',
						confirmedAt: new Date().toISOString(),
						tabs: summaryLines,
						badges,
						cards: cards.map((c) => ({
							id: c.id,
							source: c.source,
							tab: c.tab,
							skillName: c.proposedName,
							skillId: c.skillId,
							inMaster: c.inMaster,
							decidedBy: c.status
						}))
					},
					null,
					'\t'
				),
				'utf-8'
			);
			console.log(`→ ${relToAssets(truthFile)}（暫定。未確定 ${unresolved.length}枚）`);
		}
	}
}

/**
 * 同じ中身のカードを1行にまとめる。動画から取ったフレームは同じカードを何度も含むので、
 * まとめないと1000行を超える（画像を埋め込むのでファイルも巨大になる）。
 * まとめた行を直すと、同じ組のカード全部に反映される（行に全部のIDを持たせてある）。
 */
function groupCards(list) {
	const groups = new Map();
	list.forEach((c) => {
		const key = c.proposedName ? `name:${c.proposedName}` : `reads:${c.readings.join('')}`;
		if (!groups.has(key)) groups.set(key, { head: c, ids: [] });
		groups.get(key).ids.push(c.id);
	});
	return [...groups.values()];
}

function renderReview(setName, draft, imgData, lexiconSize, masterSize) {
	const card = (g) => {
		const c = g.head;
		return `
			<tr data-ids="${esc(g.ids.join(','))}" class="${c.status}">
				<td class="thumb"><img src="${imgData.get(c.id)}" alt=""></td>
				<td class="meta"><code>${esc(c.id)}</code><br>${esc(c.tab || '')}${g.ids.length > 1 ? `<br><b>同じもの ${g.ids.length}枚</b>` : ''}</td>
				<td class="name"><input type="text" value="${esc(c.proposedName || c.topCandidate || (c.readings[0] || ''))}"></td>
				<td class="cand">${(c.candidates || []).map((n) => `<button type="button">${esc(n)}</button>`).join(' ')}</td>
				<td class="reads">${c.readings.slice(0, 6).map((r) => `<span>${esc(r) || '（空）'}</span>`).join('')}</td>
				<td class="flag">${c.inMaster ? 'マスターにある' : '<b>マスターに無い</b>'}</td>
			</tr>`;
	};
	const checks = groupCards(draft.cards.filter((c) => c.status !== 'auto'));
	const autos = groupCards(draft.cards.filter((c) => c.status === 'auto'));
	return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>スキルセットOCR 正解の確認 — ${esc(setName)}</title>
<style>
 body { font-family: system-ui, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; margin: 24px; color: #222; background: #fafafa; }
 h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 28px; }
 table { border-collapse: collapse; width: 100%; background: #fff; }
 td, th { border: 1px solid #ddd; padding: 6px 8px; vertical-align: middle; font-size: 13px; }
 .thumb img { height: 34px; display: block; }
 .meta code { font-size: 11px; color: #666; }
 .name input { width: 100%; font-size: 14px; padding: 4px; }
 .cand button { font-size: 12px; margin: 1px; cursor: pointer; }
 .reads span { display: block; font-size: 11px; color: #555; font-family: ui-monospace, monospace; }
 tr.check { background: #fff7e6; }
 .bar { position: sticky; top: 0; background: #fafafa; padding: 10px 0; border-bottom: 1px solid #ddd; z-index: 2; }
 button.save { font-size: 15px; padding: 8px 16px; cursor: pointer; }
 .note { font-size: 13px; color: #444; line-height: 1.7; }
 .ng { color: #b00; font-weight: bold; }
</style></head><body>
<div class="bar">
 <button class="save" type="button" id="save">確定してJSONをダウンロード</button>
 <span class="note">保存したファイルを素材フォルダの <code>truth/${esc(setName)}.json</code> に置いてください。</span>
</div>
<h1>スキルセットOCR 正解の確認 — ${esc(setName)}</h1>
<p class="note">
 カード ${draft.cards.length}枚。照合に使った辞書 ${lexiconSize}件（UmaSkill Deck のマスターは ${masterSize}種）。<br>
 <b>スキルセット画面には、マスター445種に無いスキルも並びます。</b>右端にどちらかを出しています。<br>
 名前の欄を直接直せます。候補のボタンを押すと名前の欄に入ります。
</p>
<h2>タブごとの完全性</h2>
<ul class="note">
${draft.tabs
	.map(
		(t) =>
			`<li>${esc(t.tab)}: 画像 ${t.images}枚 / 読めた種類 ${t.unique} / 設定数 ${t.expected == null ? '読めず' : t.expected}` +
			(t.unresolved ? ` / 未確定 ${t.unresolved}枚` : '') +
			(t.expected == null ? '（チェック省略）' : t.ok ? ' → 一致' : ' <span class="ng">→ 食い違いあり</span>') +
			'</li>'
	)
	.join('\n')}
</ul>
<h2>要確認（${checks.length}組 / ${checks.reduce((n, g) => n + g.ids.length, 0)}枚）</h2>
<table><tbody>
${checks.map(card).join('\n')}
</tbody></table>
<h2>自動で決まったもの（${autos.length}組 / ${autos.reduce((n, g) => n + g.ids.length, 0)}枚）</h2>
<table><tbody>
${autos.map(card).join('\n')}
</tbody></table>
<script>
 document.querySelectorAll('.cand button').forEach(function (b) {
  b.addEventListener('click', function () {
   b.closest('tr').querySelector('.name input').value = b.textContent;
  });
 });
 document.getElementById('save').addEventListener('click', function () {
  var base = ${JSON.stringify(draft)};
  var byId = {};
  base.cards.forEach(function (c) { byId[c.id] = c; });
  var cards = [];
  document.querySelectorAll('tr[data-ids]').forEach(function (tr) {
   var name = tr.querySelector('.name input').value.trim();
   // まとめた行は、同じ組のカード全部に同じ名前を書く
   tr.dataset.ids.split(',').forEach(function (id) {
    var c = byId[id];
    if (!c) return;
    cards.push({ id: c.id, source: c.source, tab: c.tab, skillName: name, skillId: c.skillId, inMaster: c.inMaster });
   });
  });
  var out = { set: base.set, kind: base.kind, confirmedAt: new Date().toISOString(), tabs: base.tabs, badges: base.badges, cards: cards };
  var blob = new Blob([JSON.stringify(out, null, '\\t')], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ${JSON.stringify(setName)} + '.json';
  a.click();
 });
</script>
</body></html>`;
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
