// 「正解」の案を作り、おいもさんが確認・修正するためのページを書き出す。
//
//   node tests/skillset/build-truth.mjs --set=2026-09-11a [--kind=images]
//   node tests/skillset/build-truth.mjs --set=2026-09-12a --kind=frames --vote-threshold=0.35
//
// 手順（フェーズ0の指示3）:
//   1. 鮮明な切り出し画像のOCR結果（reports/ocr-<セット>-sharp.json の全変種の読み）を、
//      スキル名の辞書（reference/skill-names.json。無ければマスター445種）に照合して案を作る
//   2. 画像をまたいで一覧を**列として継ぎ合わせ**、その1行を単位に**多数決**を取る（下記）
//   3. タブごとに「読めた種類数＝設定数」かを確認する（設定数はバッジをOCRして読む）
//   4. 確定しなかった行だけを一覧にする（切り出し画像を並べて見られるHTML）
//   5. おいもさんが確認して保存したものを truth/<セット>.json に置く
//
// 多数決（19セッション目→20セッション目で実装）:
//   - **投票の単位は「継ぎ合わせた列の1行」**。同じスクロール位置のフレーム群を単位にすると、
//     同じスキルが一覧の別の位置にも並ぶぶんを取りこぼす。
//   - **投票する対象はOCRの生の読みではなく、照合した結果のスキルID**。生のテキストで多数決を
//     取ると、1文字違いの読みがばらけて票が割れる。
//   - 得票率 ＝ 最多得票数 ÷ その行が読まれた回数（読めなかった回も母数に入れる）。
//   - 最多得票が単独で、かつ得票率がしきい値以上なら確定。同点・しきい値未満は確認行き。
//   - **金の地のカードは照合にかけないので投票の対象外**。ただし行としては列に残す
//     （一覧の位置を決める役割があるため）。
//
// 出力: truth/<セット>.draft.json と reports/review-<セット>.html

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetsRoot, assetsDir, relToAssets } from './lib/assets.mjs';
import { openOcr } from './lib/ocr.mjs';
import { fileToDataUrl } from './lib/browser.mjs';
import { loadMaster } from './lib/common-in-node.mjs';
import { buildMatcher } from './lib/match.mjs';
import { combineReads, goldCardIds } from './run-ocr-crops.mjs';
import { toEntries, stitchEntries, mergeDuplicateRows } from './lib/stitch-sequence.mjs';

// 得票率のしきい値。20セッション目に実測の分布から決めた（C-24。根拠は
// reports/vote-effect-*.md）。得票率の分布は**ふた山**になる。
//   ・0〜10% … 何度読んでも一意に決まらなかった行（静止画4行・動画16行）
//   ・50%以上 … 読めた行（静止画48行・動画63行）
// その間はほとんど空で、**30%〜50%の帯は静止画・動画のどちらにも1行も無い**。
// 谷の真ん中に置けば、データが少し動いても判定が入れ替わらない。
// なお 0.1〜0.7 のどこに置いても「得票率が高いのに正解と違う行」は0件だった。
// 正しさを守っているのはしきい値ではなく「最多得票が単独」と「完全一致の票が1つ以上」の
// 2つの条件のほうで、しきい値は当落線上の行を確認へ回すための余裕でしかない。
const DEFAULT_VOTE_THRESHOLD = 0.4;

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

function loadLexicon() {
	const file = path.join(assetsRoot(), 'reference', 'skill-names.json');
	if (!fsSync.existsSync(file)) return null;
	const json = JSON.parse(fsSync.readFileSync(file, 'utf-8'));
	// ◎ のスキルは辞書から外す。◎（○の強化版）は継承できないので画面では**金の地のカード**になり、
	// 金は照合にかける前に外している。つまりラベンダーのカードが ◎ に一致することは無い。
	// 残しておくと、正規化で ◎ が ○ に潰れるため「根幹距離○」と「根幹距離◎」が常に同点になり、
	// ○ のスキルは完全一致の読みでも曖昧、距離1の読みでは票そのものが立たない
	// （実測: 592x1280 の画面収録で、○ のカードが並ぶ冒頭15フレームが1枚も投票できなかった）。
	return json.names.filter((n) => !n.includes('◎')).map((n) => ({ id: `name:${n}`, name: n }));
}

function esc(s) {
	return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * カード1枚が投じる票。**スキルIDが一意に決まったときだけ投票する。**
 * 同点で決められなかった読みや、読めなかった読みは棄権（母数には残る）。
 */
export function voteOf(chosen) {
	if (!chosen) return null;
	if (chosen.skill) return { id: chosen.skill.id, name: chosen.skill.name, exact: true };
	const tops = (chosen.candidates || []).filter((c) => c.distance === chosen.distance);
	if (chosen.topCandidate && tops.length === 1) {
		return { id: chosen.topCandidate.id, name: chosen.topCandidate.name, exact: false };
	}
	return null;
}

/** 1行ぶんの票を数える。 */
export function tallyRow(ids, voteById) {
	const tally = new Map();
	ids.forEach((id) => {
		const v = voteById.get(id);
		if (!v) return;
		if (!tally.has(v.id)) tally.set(v.id, { id: v.id, name: v.name, votes: 0, exactVotes: 0 });
		const t = tally.get(v.id);
		t.votes++;
		if (v.exact) t.exactVotes++;
	});
	const sorted = [...tally.values()].sort((a, b) => b.votes - a.votes || b.exactVotes - a.exactVotes);
	const reads = ids.length;
	const top = sorted[0] || null;
	const runnerUp = sorted[1] || null;
	const tied = !!top && sorted.filter((x) => x.votes === top.votes).length > 1;
	return {
		reads,
		topVotes: top ? top.votes : 0,
		share: top ? top.votes / reads : 0,
		top,
		runnerUp,
		tied,
		all: sorted.slice(0, 5)
	};
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
	const threshold = Number(argValue('vote-threshold', DEFAULT_VOTE_THRESHOLD));
	const cropsDir = path.join(assetsRoot(), 'crops', setName);
	const indexFile = path.join(cropsDir, 'index.json');
	if (!fsSync.existsSync(indexFile)) {
		console.error(`crops/${setName}/index.json がありません。先に run-extract-cards.mjs を実行してください`);
		process.exit(1);
	}
	const index = JSON.parse(await fs.readFile(indexFile, 'utf-8'));
	// 正解の案づくりには、鮮明な条件で取れた読みを**全部**使う（前処理あり・なしの両方）。
	// 精度の実測とは目的が違い、ここでは候補を絞るより多く集めるほうがよい。
	// ※ セット名は完全一致で見る。`includes` だと 2026-09-12a が 2026-09-12a-blurry の
	//   読みまで拾い、フレーム名が重なるぶんだけ票が二重に入る。
	const reportsDir = path.join(assetsRoot(), 'reports');
	const sharpReports = fsSync.existsSync(reportsDir)
		? fsSync.readdirSync(reportsDir).filter((f) => f === `ocr-${setName}-sharp.json` || f === `ocr-${setName}-sharp-raw.json`)
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

	// --- 1枚ずつの照合（ここまでは多数決の材料） ---
	const goldIds = goldCardIds(setName);
	const cards = [];
	const voteById = new Map();
	for (const image of index.images) {
		for (const c of image.cards) {
			if (goldIds.has(c.id)) {
				// 金の地＝継承できないスキル。照合にも投票にもかけない（行としては列に残す）
				cards.push({
					id: c.id, source: image.source, tab: image.activeTab, gold: true,
					readings: [], proposedName: null, status: 'excluded',
					category: 'excluded', reason: '金の地＝継承できないスキル（対象外）',
					candidates: [], topCandidate: null, inMaster: false, skillId: null
				});
				continue;
			}
			const texts = readsById.get(c.id) || [];
			const { chosen } = texts.length
				? combineReads(texts.map((t) => ({ text: t, confidence: 0 })), matcher)
				: { chosen: { category: 'unreadable', reason: '読みが無い', candidates: [] } };
			const vote = voteOf(chosen);
			if (vote) voteById.set(c.id, vote);
			cards.push({
				id: c.id,
				source: image.source,
				tab: image.activeTab,
				gold: false,
				readings: texts,
				proposedName: null, // 多数決のあとで入れる
				status: null,
				category: chosen.category,
				reason: chosen.reason,
				candidates: (chosen.candidates || []).slice(0, 6).map((x) => x.name),
				topCandidate: chosen.topCandidate ? chosen.topCandidate.name : null,
				vote: vote ? vote.name : null,
				voteExact: vote ? vote.exact : null,
				inMaster: false,
				skillId: null
			});
		}
	}
	const cardById = new Map(cards.map((c) => [c.id, c]));

	// --- 継ぎ合わせた列の1行を単位に多数決 ---
	// 継ぎ合わせの照合に使う暫定の名前は「目視で決めた分」＋「1枚ずつの照合で一意に決まった名前」。
	// 名前が分からないカードは null（どちらに来ても継ぎ目の判定材料にしない）。
	const provisional = new Map(cards.map((c) => [c.id, (overrides.cards || {})[c.id] || c.vote || null]));
	const byTab = new Map();
	index.images.forEach((image) => {
		const tab = image.activeTab || '不明';
		if (!byTab.has(tab)) byTab.set(tab, { images: [] });
		byTab.get(tab).images.push(image);
	});

	const rows = [];
	const stitchByTab = new Map();
	for (const [tab, t] of byTab) {
		const seqs = t.images.map((im) => toEntries(im.cards, (id) => provisional.get(id)));
		const st = stitchEntries(seqs);
		const stitched = mergeDuplicateRows(st.rows);
		let lavender = 0, gold = 0, unknown = 0;
		stitched.forEach((r, i) => {
			const isGold = r.goldCount * 2 > r.total;
			const lavIds = r.ids.filter((id) => !(cardById.get(id) || {}).gold);
			const tally = isGold ? null : tallyRow(lavIds, voteById);
			const override = r.ids.map((id) => (overrides.cards || {})[id]).find((v) => v);
			let name = null;
			let status;
			if (isGold) {
				status = 'excluded';
				gold++;
			} else if (override) {
				name = override;
				status = 'override';
				lavender++;
			} else if (tally.top && !tally.tied && tally.top.exactVotes > 0 && tally.share >= threshold) {
				name = tally.top.name;
				status = 'voted';
				lavender++;
			} else {
				name = tally.top ? tally.top.name : null;
				status = 'check';
				if (name) lavender++;
				else unknown++;
			}
			const inMaster = name ? masterByName.has(name) : false;
			rows.push({
				index: `${tab}-${String(i).padStart(3, '0')}`,
				tab,
				ids: r.ids,
				lavenderIds: lavIds,
				gold: isGold,
				name,
				status,
				inMaster,
				skillId: inMaster ? masterByName.get(name).id : null,
				reads: tally ? tally.reads : r.ids.length,
				topVotes: tally ? tally.topVotes : 0,
				topExactVotes: tally && tally.top ? tally.top.exactVotes : 0,
				share: tally ? tally.share : null,
				tied: tally ? tally.tied : false,
				runnerUp: tally && tally.runnerUp ? { name: tally.runnerUp.name, votes: tally.runnerUp.votes } : null,
				tallyAll: tally ? tally.all.map((x) => ({ name: x.name, votes: x.votes, exactVotes: x.exactVotes })) : []
			});
		});
		stitchByTab.set(tab, { total: stitched.length, lavender, gold, unknown, gaps: st.gaps, overlaps: st.overlaps });
	}

	// 行の決定を、その行に重なった全カードへ書き戻す
	rows.forEach((row) => {
		row.ids.forEach((id) => {
			const c = cardById.get(id);
			if (!c || c.gold) return;
			c.proposedName = row.name;
			c.status = row.status;
			c.rowIndex = row.index;
			c.inMaster = row.inMaster;
			c.skillId = row.skillId;
		});
	});
	cards.forEach((c) => { if (!c.status) c.status = 'check'; });

	// --- タブごとの完全性チェック ---
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
	const badgeCounts = {};
	Object.entries(badges).forEach(([src, b]) => {
		if (!b) return;
		const image = index.images.find((i) => i.source === src);
		const tab = (image && image.activeTab) || '不明';
		if (!badgeCounts[tab]) badgeCounts[tab] = [];
		badgeCounts[tab].push(b.count);
	});

	const byStatus = (st) => rows.filter((r) => r.status === st).length;
	const checkRows = rows.filter((r) => r.status === 'check');
	console.log(
		`\n継ぎ合わせた列 ${rows.length}行（カード ${cards.length}枚）  しきい値 ${threshold}\n` +
			`内訳: 多数決で確定 ${byStatus('voted')}行 / 目視 ${byStatus('override')}行 / 対象外の金 ${byStatus('excluded')}行 / **要確認 ${checkRows.length}行**`
	);

	const summaryLines = [];
	for (const [tab] of byTab) {
		const counts = badgeCounts[tab] || [];
		const known = counts.filter((n) => n != null);
		const st = stitchByTab.get(tab) || { total: 0, lavender: 0, gold: 0, unknown: 0, gaps: 0 };
		const expected = known.length ? Math.max(...known) : null;
		const tabRows = rows.filter((r) => r.tab === tab);
		// 撮り漏れの判定は「全色の検出種類数 vs 設定数」。取り込みの成否とは別の話なので分けて出す。
		// 継ぎ目が合わない件数は参考情報（バッジに隠れて落ちたカードがあると、
		// 前後の画像の並びが1枚ぶんずれて合わなくなるが、種類数は正しく出る）。
		const ok = expected != null && expected === st.total;
		const line =
			`タブ ${tab}: 画像 ${byTab.get(tab).images.length}枚 / 検出 ${st.total}種（取り込み対象 ${st.lavender}種・対象外の金 ${st.gold}種` +
			(st.unknown ? `・名前未確定 ${st.unknown}種` : '') +
			`） / 設定数 ${expected == null ? '読めず' : expected}` +
			(st.gaps ? ` / 継ぎ目が合わない箇所 ${st.gaps}件（参考）` : '') +
			` / 要確認 ${tabRows.filter((r) => r.status === 'check').length}行` +
			(expected == null ? '（撮り漏れの判定は省略）' : ok ? ' → 撮り漏れなし' : ' → **撮り漏れの疑い**');
		console.log('  ' + line);
		summaryLines.push({
			tab,
			images: byTab.get(tab).images.length,
			detected: st.total,
			lavender: st.lavender,
			gold: st.gold,
			unknown: st.unknown,
			gaps: st.gaps,
			unique: new Set(tabRows.filter((r) => r.name).map((r) => r.name)).size,
			expected,
			unresolved: tabRows.filter((r) => r.status === 'check').length,
			ok
		});
	}

	const draft = {
		set: setName,
		kind,
		generatedAt: new Date().toISOString(),
		note: '案。おいもさんの確認・修正を経て truth/<セット>.json として保存する。',
		voteThreshold: threshold,
		tabs: summaryLines,
		badges,
		rows,
		cards
	};
	const draftFile = path.join(assetsDir('truth'), `${setName}.draft.json`);
	await fs.writeFile(draftFile, JSON.stringify(draft, null, '\t'), 'utf-8');

	// 確認用ページ（切り出し画像を埋め込んだ自己完結HTML）。1行につき1枚だけ埋め込む。
	const imgData = new Map();
	for (const r of rows) {
		const id = r.lavenderIds[0] || r.ids[0];
		imgData.set(r.index, await fileToDataUrl(path.join(cropsDir, `${id}.png`)));
	}
	const html = renderReview(setName, draft, imgData, lexicon ? lexicon.length : master.length, master.length, cardById);
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
			await fs.writeFile(
				truthFile,
				JSON.stringify(
					{
						set: setName,
						kind,
						confirmedBy: 'claude-proposal（暫定。おいもさんの確認待ち）',
						confirmedAt: new Date().toISOString(),
						voteThreshold: threshold,
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
			console.log(`→ ${relToAssets(truthFile)}（暫定。要確認 ${checkRows.length}行）`);
		}
	}
}

function pct(x) {
	return x == null ? '—' : `${Math.round(x * 100)}%`;
}

function renderReview(setName, draft, imgData, lexiconSize, masterSize, cardById) {
	const rowHtml = (r) => {
		const reads = [];
		r.lavenderIds.slice(0, 8).forEach((id) => {
			const c = cardById.get(id);
			(c ? c.readings : []).slice(0, 2).forEach((t) => { if (!reads.includes(t)) reads.push(t); });
		});
		return `
			<tr data-row="${esc(r.index)}" data-ids="${esc(r.ids.join(','))}" class="${r.status}">
				<td class="thumb"><img src="${imgData.get(r.index)}" alt=""></td>
				<td class="meta"><code>${esc(r.index)}</code><br>${esc(r.tab || '')}<br>重なり ${r.ids.length}枚</td>
				<td class="vote"><b>${pct(r.share)}</b><br><span>${r.topVotes}/${r.reads}票</span>${r.tied ? '<br><span class="ng">同点</span>' : ''}</td>
				<td class="second">${r.runnerUp ? `${esc(r.runnerUp.name)}<br><span>${r.runnerUp.votes}票</span>` : '<span>—</span>'}</td>
				<td class="name"><input type="text" value="${esc(r.name || '')}"></td>
				<td class="cand">${r.tallyAll.map((x) => `<button type="button">${esc(x.name)}</button>`).join(' ')}</td>
				<td class="reads">${reads.slice(0, 6).map((t) => `<span>${esc(t) || '（空）'}</span>`).join('')}</td>
				<td class="flag">${r.inMaster ? 'マスターにある' : '<b>マスターに無い</b>'}</td>
			</tr>`;
	};
	// 確認行きは**得票率の低い順**。上から順に見れば、あやしいものから片付く。
	const checks = draft.rows.filter((r) => r.status === 'check').sort((a, b) => (a.share || 0) - (b.share || 0));
	const decided = draft.rows.filter((r) => r.status === 'voted' || r.status === 'override').sort((a, b) => (b.share || 0) - (a.share || 0));
	const gold = draft.rows.filter((r) => r.status === 'excluded');
	return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>スキルセットOCR 正解の確認 — ${esc(setName)}</title>
<style>
 body { font-family: system-ui, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; margin: 24px; color: #222; background: #fafafa; }
 h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 28px; }
 table { border-collapse: collapse; width: 100%; background: #fff; }
 td, th { border: 1px solid #ddd; padding: 6px 8px; vertical-align: middle; font-size: 13px; }
 .thumb img { height: 34px; display: block; }
 .meta code { font-size: 11px; color: #666; }
 .meta { font-size: 11px; color: #666; white-space: nowrap; }
 .vote { text-align: center; white-space: nowrap; }
 .vote b { font-size: 15px; }
 .vote span, .second span { font-size: 11px; color: #666; }
 .second { white-space: nowrap; font-size: 12px; }
 .name input { width: 100%; font-size: 14px; padding: 4px; }
 .cand button { font-size: 12px; margin: 1px; cursor: pointer; }
 .reads span { display: block; font-size: 11px; color: #555; font-family: ui-monospace, monospace; }
 tr.check { background: #fff7e6; }
 tr.excluded { background: #f4f0e2; color: #777; }
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
 一覧を継ぎ合わせた列 ${draft.rows.length}行（カード ${draft.cards.length}枚）。照合に使った辞書 ${lexiconSize}件（UmaSkill Deck のマスターは ${masterSize}種）。<br>
 <b>1行＝一覧の同じ場所にあるカード</b>です。複数の画像・フレームに写ったぶんをまとめ、
 照合結果のスキルIDで<b>多数決</b>を取っています（しきい値 ${pct(draft.voteThreshold)}）。<br>
 得票率 ＝ 最多得票数 ÷ その行が読まれた回数（読めなかった回も母数に入ります）。<br>
 <b>スキルセット画面には、マスター445種に無いスキルも並びます。</b>右端にどちらかを出しています。<br>
 名前の欄を直接直せます。候補のボタンを押すと名前の欄に入ります。
</p>
<h2>タブごとの完全性</h2>
<ul class="note">
${draft.tabs
	.map(
		(t) =>
			`<li>${esc(t.tab)}: 画像 ${t.images}枚 / 検出 ${t.detected}種（取り込み対象 ${t.lavender}・対象外の金 ${t.gold}） / 設定数 ${t.expected == null ? '読めず' : t.expected}` +
			(t.unresolved ? ` / 要確認 ${t.unresolved}行` : '') +
			(t.expected == null ? '（チェック省略）' : t.ok ? ' → 撮り漏れなし' : ' <span class="ng">→ 撮り漏れの疑い</span>') +
			'</li>'
	)
	.join('\n')}
</ul>
<h2>要確認（${checks.length}行）— 得票率の低い順</h2>
<table><tbody>
${checks.map(rowHtml).join('\n')}
</tbody></table>
<h2>多数決で決まったもの（${decided.length}行）— 得票率の高い順</h2>
<table><tbody>
${decided.map(rowHtml).join('\n')}
</tbody></table>
<h2>対象外の金のカード（${gold.length}行・確認は要りません）</h2>
<table><tbody>
${gold
	.map(
		(r) =>
			`<tr class="excluded" data-row="${esc(r.index)}" data-ids="${esc(r.ids.join(','))}"><td class="thumb"><img src="${imgData.get(r.index)}" alt=""></td>` +
			`<td class="meta"><code>${esc(r.index)}</code><br>${esc(r.tab || '')}<br>重なり ${r.ids.length}枚</td>` +
			`<td colspan="6">金の地＝継承できないスキル（進化・金・◎）。マスター445種には入らないので照合しません。</td></tr>`
	)
	.join('\n')}
</tbody></table>
<script>
 document.querySelectorAll('.cand button').forEach(function (b) {
  b.addEventListener('click', function () {
   b.closest('tr').querySelector('.name input').value = b.textContent;
  });
 });
 document.getElementById('save').addEventListener('click', function () {
  var base = ${JSON.stringify({ set: draft.set, kind: draft.kind, tabs: draft.tabs, badges: draft.badges, voteThreshold: draft.voteThreshold })};
  var meta = ${JSON.stringify(
		Object.fromEntries(draft.cards.map((c) => [c.id, { source: c.source, tab: c.tab, skillId: c.skillId, inMaster: c.inMaster, gold: !!c.gold }]))
	)};
  var cards = [];
  document.querySelectorAll('tr[data-ids]').forEach(function (tr) {
   var input = tr.querySelector('.name input');
   var name = input ? input.value.trim() : '';
   // 1行＝一覧の同じ場所なので、その行に重なったカード全部に同じ名前を書く
   tr.dataset.ids.split(',').forEach(function (id) {
    var m = meta[id];
    if (!m) return;
    cards.push({ id: id, source: m.source, tab: m.tab, skillName: m.gold ? null : name, skillId: m.skillId, inMaster: m.inMaster, gold: m.gold });
   });
  });
  var out = { set: base.set, kind: base.kind, confirmedAt: new Date().toISOString(), voteThreshold: base.voteThreshold, tabs: base.tabs, badges: base.badges, cards: cards };
  var blob = new Blob([JSON.stringify(out, null, '\\t')], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ${JSON.stringify(setName)} + '.json';
  a.click();
 });
</script>
</body></html>`;
}

// lib/replay.mjs が voteOf / tallyRow を import するので、import されたときは main を走らせない
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch((e) => {
		console.error(e.stack || e.message || e);
		process.exit(1);
	});
}
