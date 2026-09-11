/**
 * uma-skill-deck.js
 * UmaSkill Deck（対象スキルセットに対する候補比較ツール）の画面ロジック。
 *
 * 設計方針:
 * - データ層（localStorage）・テンプレート管理UI・スキル選択パネル・レコードへの
 *   ★書き込みロジック・Undoスタックは js/uma-skill-deck-core.js に切り出し済み。
 *   共有モジュール側は special.html（UmaStar OCRのDeck連携モード）からも読み込まれるため、
 *   どちらの画面でテンプレートを編集しても同じデータを見る。
 * - このファイルに残るのは「UmaSkill Deck本体の画面固有のもの」だけ:
 *   タブ切り替え・比較シート（グリッド）のUI・データ管理タブ・トースト・Undoボタン。
 * - グローバル状態はこのファイル内に閉じる（このツールは単一ページで完結するため、
 *   状態を直接持った方がシンプル）。
 */

// このファイルの版。ツール上部の「読み込み状況」に表示し、
// HTML側の ?v= クエリ・このファイル内の定数の3点が一致しているかを納品前に確認する。
const UMA_SKILL_DECK_JS_VERSION = '2026-09-11c';

// 読み込むべき共通CSS（css/tokens.css / css/common.css）の版。3ファイルで1つの版。
// 古い版がキャッシュに残ったまま新しいHTMLが読まれると、
// 「直したはずなのに直っていない」状態になるため、起動時に照合する。
const EXPECTED_COMMON_CSS_VERSION = '2026-09-11a';
// このページが読む共通CSSと、それぞれが :root に持つ版の印
const COMMON_CSS_FILES = [
	['css/tokens.css', '--common-css-version'],
	['css/common.css', '--uma-components-css-version'],
];

function loadedCssVersion(prop) {
	const raw = getComputedStyle(document.documentElement).getPropertyValue(prop);
	return (raw || '').trim().replace(/^["']|["']$/g, '');
}
// 実際に読み込まれている共通CSSの版（tokens.css の印）を返す。読み込み状況の表示に使う。
function loadedCommonCssVersion() {
	return loadedCssVersion('--common-css-version');
}

	/* ============================================================
	 * 外部スタイル（Tailwind CDN）の読み込み確認
	 *
	 * このページの見た目の大半は Tailwind のユーティリティに依存している。
	 * CDNが落ちている・広告ブロッカーや社内プロキシに遮断されている場合、
	 * 読み込みに失敗して表示が崩れる。利用者が原因を推測できないため、
	 * 検出して案内を出す。
	 *
	 * Tailwind v4 は :root にテーマ変数（--spacing など）を定義するので、
	 * その有無で「読み込めたか」が判定できる。
	 * 生成は非同期なので、すぐには確定しない。少し待って数回試す。
	 * ============================================================ */
	function isTailwindLoaded() {
		return getComputedStyle(document.documentElement).getPropertyValue('--spacing').trim() !== '';
	}

	function verifyTailwindLoaded(remainingTries) {
		if (isTailwindLoaded()) {
			// css/common.css に置いた保険（Tailwindが無いときだけ効く .hidden）を無効化する。
			// これを付けないと、hidden と sm:inline を併記した要素まで隠れてしまう。
			document.documentElement.classList.add('uma-tw-ready');
			return;
		}
		if (remainingTries > 0) {
			setTimeout(function () { verifyTailwindLoaded(remainingTries - 1); }, 800);
			return;
		}
		const msg = '表示に必要な外部ファイルを読み込めませんでした。ページを再読み込みしてください。'
			+ '広告ブロッカーや社内ネットワークが cdnjs.cloudflare.com を遮断している場合は、許可設定が必要です。';
		console.warn('[UmaSkill Deck] ' + msg);
		showToast(msg);
	}

function verifyCommonCssVersion() {
	const bad = COMMON_CSS_FILES
		.map(([file, prop]) => [file, loadedCssVersion(prop)])
		.filter(([, v]) => v !== EXPECTED_COMMON_CSS_VERSION);
	if (bad.length === 0) return true;
	const msg = bad.map(([file, v]) => v
		? file + ' が古い版です（読込:' + v + ' / 期待:' + EXPECTED_COMMON_CSS_VERSION + '）'
		: file + ' を読み込めていません').join('。')
		+ '。キャッシュを消して再読み込みしてください。';
	console.warn('[UmaSkill Deck] ' + msg);
	showToast(msg);
	return false;
}

/* ============================================================
 * 共有モジュールへの参照・そこから借りる定数
 * ============================================================ */
const Core = window.UmaSkillDeckCore;

const TEMPLATE_LIMIT = Core.TEMPLATE_LIMIT;
const RECORD_LIMIT = Core.RECORD_LIMIT;
const CUSTOM_SKILL_SOFT_CAP = Core.CUSTOM_SKILL_SOFT_CAP;
const STAR_MIN = Core.STAR_MIN;
const STAR_MAX = Core.STAR_MAX;
const MAX_ENABLED_CANDIDATES = Core.MAX_ENABLED_CANDIDATES;

/* ============================================================
 * 状態
 * ============================================================ */
let userData = null;
let templateManager = null;

// { recordId, name, sourceTemplateId, skillIds, candidates, cells, ocrCells } / null = 一覧表示中
// cells が現在値、ocrCells が「OCRが書いた原本値」。この2つのズレが
// 「人が手で直した」の判定になる（Core.isEditedCell）。ocrCells が無い
// 古いデータもそのまま動く（原本値が無い＝判定対象外として扱われる）。
let draftRecord = null;
let recordRowFilter = 'all'; // 比較シート編集画面の行フィルター（'all' | 'zero' | 'nonzero'）

/* ============================================================
 * ユーティリティ（共有モジュールの実装をそのまま使う）
 * ============================================================ */
const uid = Core.uid;
const escapeHtml = Core.escapeHtml;
const nowIso = Core.nowIso;
const refreshIcons = Core.refreshIcons;
const getSkillName = Core.getSkillName;
const saveUserData = Core.saveUserData;
const pushUndo = Core.pushUndo;

/* ============================================================
 * トースト通知／Undo
 * ============================================================ */
function showToast(msg) {
	const toast = document.getElementById('toast');
	const msgEl = document.getElementById('toast-message');
	if (!toast || !msgEl) return;
	msgEl.textContent = msg;
	toast.classList.remove('translate-y-16', 'opacity-0', 'pointer-events-none');
	setTimeout(() => { toast.classList.add('translate-y-16', 'opacity-0', 'pointer-events-none'); }, 2500);
}

function performUndo() {
	Core.performUndo();
}

function renderUndoButton(count) {
	const btn = document.getElementById('undo-button');
	if (!btn) return;
	if (count === 0) { btn.classList.add('hidden'); return; }
	btn.classList.remove('hidden');
	document.getElementById('undo-count-badge').textContent = count;
}

/* ============================================================
 * タブ切り替え
 * ============================================================ */
function switchTab(name) {
	['template', 'record', 'data'].forEach(t => {
		document.getElementById('tab-panel-' + t).classList.toggle('hidden', t !== name);
		document.getElementById('tab-btn-' + t).classList.toggle('tab-active', t === name);
	});
	// タブ切り替え時に、切り替え先の内容を必ず最新状態で再描画する
	// （他タブでの変更、例：テンプレート追加が比較シートタブの選択肢に反映されるように）。
	if (name === 'template') templateManager.render();
	if (name === 'record') renderRecordTab();
	if (name === 'data') renderDataTab();
}

/* ============================================================
 * 比較レコード（スプレッドシート）
 * ============================================================ */
function renderRecordTab() {
	if (draftRecord) {
		document.getElementById('record-list-view').classList.add('hidden');
		document.getElementById('record-editor-view').classList.remove('hidden');
		renderRecordEditor();
	} else {
		document.getElementById('record-list-view').classList.remove('hidden');
		document.getElementById('record-editor-view').classList.add('hidden');
		renderRecordList();
	}
}

function renderRecordList() {
	const list = userData.records;
	document.getElementById('record-count-badge').textContent = list.length + '/' + RECORD_LIMIT + '件';
	const templateSelect = document.getElementById('record-new-template-select');
	templateSelect.innerHTML = userData.templates.map(t => `<option value="${t.templateId}">${escapeHtml(t.name)}</option>`).join('');
	document.getElementById('record-new-btn').disabled = userData.templates.length === 0;
	const el = document.getElementById('record-list');
	if (list.length === 0) {
		el.innerHTML = '<p class="text-sm text-slate-400 p-4">まだ比較シートがありません。テンプレートを選んで「新規作成」してください。</p>';
		return;
	}
	el.innerHTML = list.map(r => `
		<div class="list-card uma-list-row">
			<div class="flex-1 min-w-0">
				<p class="font-semibold text-sm text-slate-800 truncate">${escapeHtml(r.name)}</p>
				<p class="text-xs text-slate-500">元テンプレート：${escapeHtml(getTemplateName(r.sourceTemplateId))}</p>
				<p class="text-xs text-slate-500">候補${r.candidates.length}人・スキル${r.skillIds.length}件・更新 ${escapeHtml((r.updatedAt || '').slice(0, 10))}</p>
			</div>
			<div class="flex gap-1.5 shrink-0">
				<button onclick="openRecordEditor('${r.recordId}')" class="icon-btn uma-icon-btn" title="開く"><i data-lucide="edit" class="w-4 h-4"></i></button>
				<button onclick="duplicateRecord('${r.recordId}')" class="icon-btn uma-icon-btn" title="複製"><i data-lucide="copy" class="w-4 h-4"></i></button>
				<button onclick="deleteRecord('${r.recordId}')" class="icon-btn uma-icon-btn text-red-500" title="削除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
			</div>
		</div>
	`).join('');
	refreshIcons();
}

function createRecordFromTemplate() {
	const templateId = document.getElementById('record-new-template-select').value;
	const record = Core.createRecordFromTemplate(templateId);
	if (!record) return;
	openRecordEditor(record.recordId);
}

function openRecordEditor(recordId) {
	draftRecord = userData.records.find(x => x.recordId === recordId);
	Core.normalizeCandidateEnabled(draftRecord);
	recordRowFilter = 'all';
	renderRecordTab();
}

function setRecordRowFilter(mode) {
	recordRowFilter = mode;
	renderRecordGrid();
}

function closeRecordEditor() {
	draftRecord = null;
	renderRecordTab();
}

function getTemplateName(templateId) {
	// UmaStar OCR側で「保存しない一時的な対象スキルセット」から作られたシートは
	// 元テンプレートを持たない。削除済みと区別できる文言にする。
	if (!templateId) return '（テンプレート未保存）';
	const t = userData.templates.find(x => x.templateId === templateId);
	return t ? t.name : '（削除済みテンプレート）';
}

function switchRecordTemplate(newTemplateId) {
	if (newTemplateId === draftRecord.sourceTemplateId) return;
	const t = userData.templates.find(x => x.templateId === newTemplateId);
	if (!t) return;
	const targetRecord = draftRecord;
	const prevTemplateId = targetRecord.sourceTemplateId;
	const prevSkillIds = targetRecord.skillIds.slice();
	const prevCells = JSON.parse(JSON.stringify(targetRecord.cells));
	// 原本値（ocrCells）も現在値と対で退避・剪定する。片方だけ戻すと
	// Undoした瞬間に「手動修正済み」の判定だけが壊れるため。
	const prevOcrCells = JSON.parse(JSON.stringify(targetRecord.ocrCells || {}));
	targetRecord.sourceTemplateId = t.templateId;
	targetRecord.skillIds = t.skillIds.slice();
	const keep = new Set(targetRecord.skillIds);
	Object.keys(targetRecord.cells).forEach(sid => { if (!keep.has(sid)) delete targetRecord.cells[sid]; });
	if (targetRecord.ocrCells) {
		Object.keys(targetRecord.ocrCells).forEach(sid => { if (!keep.has(sid)) delete targetRecord.ocrCells[sid]; });
	}
	saveUserData();
	renderRecordEditor();
	pushUndo('テンプレートを「' + t.name + '」に切り替えました', () => {
		targetRecord.sourceTemplateId = prevTemplateId;
		targetRecord.skillIds = prevSkillIds;
		targetRecord.cells = prevCells;
		targetRecord.ocrCells = prevOcrCells;
		saveUserData();
		renderAll();
	});
}

function persistDraftRecord() {
	draftRecord.updatedAt = nowIso();
	saveUserData();
}

function renderRecordEditor() {
	document.getElementById('record-name-input').value = draftRecord.name;
	const sel = document.getElementById('record-template-select');
	const options = userData.templates.map(t => `<option value="${t.templateId}">${escapeHtml(t.name)}</option>`);
	const hasCurrent = userData.templates.some(t => t.templateId === draftRecord.sourceTemplateId);
	if (!hasCurrent) options.unshift(`<option value="${draftRecord.sourceTemplateId || ''}" disabled selected>${escapeHtml(getTemplateName(draftRecord.sourceTemplateId))}</option>`);
	sel.innerHTML = options.join('');
	sel.value = draftRecord.sourceTemplateId || '';
	renderRecordGrid();
}

function onRecordNameChange() {
	draftRecord.name = document.getElementById('record-name-input').value;
	persistDraftRecord();
}

function countEnabledCandidates() {
	return Core.countEnabledCandidates(draftRecord);
}

function addCandidate() {
	const input = document.getElementById('candidate-label-input');
	const label = (input.value || '').trim();
	if (!label) { showToast('候補の名前を入力してください'); return; }
	// 有効枠に空きがあればデフォルトで有効、埋まっていれば無効で追加する
	// （候補自体は6人を超えて何人でも追加できる。「有効」は比較対象の6人分のみ）。
	const enabled = countEnabledCandidates() < MAX_ENABLED_CANDIDATES;
	draftRecord.candidates.push({ candidateId: uid('c'), label, enabled });
	input.value = '';
	persistDraftRecord();
	renderRecordGrid();
}

function toggleCandidateNameReveal(btn, candidateId) {
	const tip = document.getElementById('name-reveal-tip');
	const c = draftRecord.candidates.find(x => x.candidateId === candidateId);
	if (!c) return;
	if (!tip.classList.contains('hidden') && tip.dataset.forCand === candidateId) {
		tip.classList.add('hidden');
		return;
	}
	const rect = btn.getBoundingClientRect();
	tip.textContent = c.label;
	tip.style.left = Math.max(4, rect.left - 4) + 'px';
	tip.style.top = Math.max(4, rect.top - 30) + 'px';
	tip.dataset.forCand = candidateId;
	// 同じ吹き出しをスキル名の全文表示とも共有しているので、相手の印は消しておく。
	delete tip.dataset.forSkill;
	tip.classList.remove('hidden');
	clearTimeout(toggleCandidateNameReveal._timer);
	toggleCandidateNameReveal._timer = setTimeout(() => tip.classList.add('hidden'), 3000);
}

function toggleCandidateEnabled(candidateId) {
	const c = draftRecord.candidates.find(x => x.candidateId === candidateId);
	if (!c) return;
	if (!c.enabled && countEnabledCandidates() >= MAX_ENABLED_CANDIDATES) {
		showToast('有効にできるのは最大' + MAX_ENABLED_CANDIDATES + '人までです。他の候補を無効にしてください');
		renderRecordGrid();
		return;
	}
	c.enabled = !c.enabled;
	persistDraftRecord();
	renderRecordGrid();
}

function removeCandidate(candidateId) {
	const idx = draftRecord.candidates.findIndex(c => c.candidateId === candidateId);
	if (idx === -1) return;
	const targetRecord = draftRecord;
	const removed = targetRecord.candidates[idx];
	const cellBackups = {};
	Object.keys(targetRecord.cells).forEach(skillId => {
		if (targetRecord.cells[skillId][candidateId] !== undefined) cellBackups[skillId] = targetRecord.cells[skillId][candidateId];
		delete targetRecord.cells[skillId][candidateId];
	});
	// 原本値も対で退避する（片方だけ戻すと手動修正済みの判定が壊れる）。
	const ocrBackups = {};
	Object.keys(targetRecord.ocrCells || {}).forEach(skillId => {
		if (targetRecord.ocrCells[skillId][candidateId] !== undefined) ocrBackups[skillId] = targetRecord.ocrCells[skillId][candidateId];
		delete targetRecord.ocrCells[skillId][candidateId];
	});
	targetRecord.candidates.splice(idx, 1);
	targetRecord.updatedAt = nowIso();
	saveUserData();
	renderRecordGrid();
	pushUndo('候補「' + removed.label + '」を削除しました', () => {
		targetRecord.candidates.splice(idx, 0, removed);
		Object.keys(cellBackups).forEach(skillId => {
			if (!targetRecord.cells[skillId]) targetRecord.cells[skillId] = {};
			targetRecord.cells[skillId][candidateId] = cellBackups[skillId];
		});
		if (!targetRecord.ocrCells) targetRecord.ocrCells = {};
		Object.keys(ocrBackups).forEach(skillId => {
			if (!targetRecord.ocrCells[skillId]) targetRecord.ocrCells[skillId] = {};
			targetRecord.ocrCells[skillId][candidateId] = ocrBackups[skillId];
		});
		saveUserData();
		renderAll();
	});
}

function removeSkillFromRecord(skillId) {
	const idx = draftRecord.skillIds.indexOf(skillId);
	if (idx === -1) return;
	const targetRecord = draftRecord;
	const name = getSkillName(skillId);
	const cellsBackup = targetRecord.cells[skillId];
	// 原本値も対で退避する（片方だけ戻すと手動修正済みの判定が壊れる）。
	const ocrBackup = targetRecord.ocrCells && targetRecord.ocrCells[skillId];
	targetRecord.skillIds.splice(idx, 1);
	delete targetRecord.cells[skillId];
	if (targetRecord.ocrCells) delete targetRecord.ocrCells[skillId];
	targetRecord.updatedAt = nowIso();
	saveUserData();
	renderRecordGrid();
	pushUndo('スキル「' + name + '」を削除しました', () => {
		targetRecord.skillIds.splice(idx, 0, skillId);
		if (cellsBackup) targetRecord.cells[skillId] = cellsBackup;
		if (ocrBackup) {
			if (!targetRecord.ocrCells) targetRecord.ocrCells = {};
			targetRecord.ocrCells[skillId] = ocrBackup;
		}
		saveUserData();
		renderAll();
	});
}

// 有効な候補だけを対象にした、そのスキル行の★合計。
function computeRowSum(skillId) {
	return draftRecord.candidates.filter(c => c.enabled).reduce((acc, c) => {
		const v = (draftRecord.cells[skillId] && draftRecord.cells[skillId][c.candidateId]) || 0;
		return acc + v;
	}, 0);
}

// そのセルの現在値。未設定は0。
function getStar(skillId, candidateId) {
	return (draftRecord.cells[skillId] && draftRecord.cells[skillId][candidateId]) || 0;
}

// 値バッジ1タップ分の巡回先。0→1→2→3→0 の一方向で、逆回転は仕様として持たない
// （3から下げたいときは0を経由する、というのが確定した仕様）。
function nextStarValue(current) {
	return current >= STAR_MAX ? STAR_MIN : current + 1;
}

// 値バッジのクリック／Enter／Space から呼ばれる入口。1回の呼び出し＝1回の値変更。
function cycleStar(skillId, candidateId) {
	setStar(skillId, candidateId, nextStarValue(getStar(skillId, candidateId)));
}

// 値タイルの中身。値は0〜3の整数のままで、表示だけを★に変える。
// Lv0=控えめな☆1個 / Lv1=★1個 / Lv2=★2個の横並び / Lv3=上1・下2のピラミッド。
function starsMarkup(v) {
	if (v <= 0) return '<span class="star-off">☆</span>';
	if (v === 1) return '<span class="star-single star-on">★</span>';
	if (v === 2) return '<span class="star-pair"><span class="star-on">★</span><span class="star-on">★</span></span>';
	return '<span class="star-pyramid">'
		+ '<span class="star-top star-on">★</span>'
		+ '<span class="star-bottom"><span class="star-on">★</span><span class="star-on">★</span></span>'
		+ '</span>';
}

// ★の書き込みと、それに連動する表示更新。
//
// Undoについて: ★の増減は以前から Undo スタックに積んでいない（取り消し対象外）。
// 理由は Core.pushUndo() が必ずトーストを出すこと、スタック上限20件を★の連打で
// 埋めると「候補を誤って削除した」のUndoが押し出されること。タップ巡回にしても
// 「1操作＝1回の値変更」という粒度は変わっていない。
function setStar(skillId, candidateId, next) {
	if (!draftRecord.cells[skillId]) draftRecord.cells[skillId] = {};
	draftRecord.cells[skillId][candidateId] = next;
	persistDraftRecord();
	const tile = document.getElementById('star-' + skillId + '-' + candidateId);
	if (tile) {
		tile.innerHTML = starsMarkup(next);
		tile.dataset.value = next;
		// OCRの読み取り結果から動かしたかどうか。元の値に戻せば自動的に外れる。
		const edited = Core.isEditedCell(draftRecord, skillId, candidateId);
		tile.classList.toggle('is-edited', edited);
		// スクリーンリーダー向け。★も赤いリングも見た目でしか情報を伝えないので、
		// 「スキル名／候補名 Lv2（手動修正済み）」の形で読み上げられるようにする。
		// 文脈部分は data-star-label に持たせておいて毎回組み直す。
		tile.setAttribute('aria-label', tile.dataset.starLabel + ' Lv' + next + (edited ? '（手動修正済み）' : ''));
	}
	const newSum = computeRowSum(skillId);
	const sumEl = document.getElementById('sum-' + skillId);
	if (sumEl) {
		sumEl.textContent = newSum;
		// 0=控えめなグレー / 1以上=薄い藍。切り替えは実色のみで行う
		// （sticky を使うグリッド内で opacity を使うと重なり順が壊れるため）。
		sumEl.classList.toggle('deck-total--on', newSum > 0);
	}
	const rowEl = document.getElementById('row-' + skillId);
	if (rowEl) rowEl.classList.toggle('row-zero', newSum === 0);
	// 行フィルターが「不足のみ」「充足あり」の場合、値の増減でその行が
	// 表示条件から外れることがあるため、その時だけグリッド全体を再描画する。
	if ((recordRowFilter === 'zero' && newSum !== 0) || (recordRowFilter === 'nonzero' && newSum === 0)) {
		renderRecordGrid();
	}
}

/* ------------------------------------------------------------
 * スキル名のフェード表示と全文ツールチップ
 *
 * 表示幅は約6文字ぶんに固定してあるが、はみ出しているかどうかは
 * 文字数では決めない（フォントや文字種で実幅が変わるため）。
 * 描画のたびに scrollWidth と clientWidth を実測して .is-truncated を付ける。
 *
 * ツールチップは position:fixed の共有要素 #name-reveal-tip を使い回す。
 * グリッドは overflow:auto なので、セル内に absolute で置くと
 * 最上行のツールチップが枠に切られてしまう。
 * ------------------------------------------------------------ */
function markTruncatedSkillNames() {
	document.querySelectorAll('#record-grid-wrap .deck-name-wrap').forEach(wrap => {
		const clip = wrap.querySelector('.deck-name-clip');
		if (!clip) return;
		const truncated = clip.scrollWidth > clip.clientWidth + 1;
		wrap.classList.toggle('is-truncated', truncated);
		// はみ出していない名前は押しても何も起きない（ツールチップも出さない）。
		clip.disabled = !truncated;
	});
}

// スキル名のツールチップを開閉する。値タイルの巡回を誤爆させないよう、
// 呼び出し元の onclick 側で event.stopPropagation() してから呼ぶ。
function toggleSkillNameTip(btn, skillId) {
	const tip = document.getElementById('name-reveal-tip');
	if (!tip) return;
	const name = getSkillName(skillId);
	if (!tip.classList.contains('hidden') && tip.dataset.forSkill === skillId) {
		hideNameRevealTip();
		return;
	}
	const rect = btn.getBoundingClientRect();
	tip.textContent = name;
	tip.style.left = Math.max(4, rect.left - 4) + 'px';
	tip.style.top = Math.max(4, rect.top - 30) + 'px';
	tip.dataset.forSkill = skillId;
	delete tip.dataset.forCand;
	tip.classList.remove('hidden');
}

function hideNameRevealTip() {
	const tip = document.getElementById('name-reveal-tip');
	if (!tip) return;
	tip.classList.add('hidden');
	delete tip.dataset.forSkill;
	delete tip.dataset.forCand;
}

// 他の場所をタップしたら閉じる。描画のたびに増やさないよう、1回だけ登録する。
document.addEventListener('click', hideNameRevealTip);

// グリッドについての案内文。スクロールボックスの外・上に出す
// （中に置くとスキルが多いときに下へ流れて画面外になり、読まれない）。
// 表示の切り替えは .hidden の付け外しで行う。このページの .hidden は
// Tailwind の有無によらず常に効く定義を持っており（先頭の <style> 参照）、
// この要素は hidden と併記されるユーティリティを持たないため事故が起きない。
function setRecordGridNote(msg) {
	const el = document.getElementById('record-grid-note');
	if (!el) return;
	el.textContent = msg || '';
	el.classList.toggle('hidden', !msg);
}

function renderRecordGrid() {
	const wrap = document.getElementById('record-grid-wrap');
	const enabledCountEl = document.getElementById('record-enabled-count');
	if (enabledCountEl) enabledCountEl.textContent = '有効な候補：' + countEnabledCandidates() + '/' + MAX_ENABLED_CANDIDATES + '人（候補は' + draftRecord.candidates.length + '人登録中）';
	document.querySelectorAll('.row-filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === recordRowFilter));
	hideNameRevealTip();
	setRecordGridNote('');
	if (draftRecord.skillIds.length === 0) {
		wrap.innerHTML = '<p class="text-xs text-slate-400 p-4">「スキルを追加」からスキルを選んでください。</p>';
		return;
	}
	const candidates = draftRecord.candidates;
	const skillIdsToShow = draftRecord.skillIds.filter(skillId => {
		const sum = computeRowSum(skillId);
		if (recordRowFilter === 'zero') return sum === 0;
		if (recordRowFilter === 'nonzero') return sum > 0;
		return true;
	});

	// 列数はCSSの grid-template-columns が読む。
	// 候補0人のときは repeat(0, ...) が無効になるため、専用クラスで列定義ごと差し替える。
	// 変数側も最低1にしておかないと基本の宣言まで無効になる。
	// このとき各行が出すセルも「情報セル＋余り列」の2つになる。列とセルの数が
	// 食い違うと、セルが1つずつ隣の列へずれて重なって見える。
	let html = '<div class="deck-grid' + (candidates.length === 0 ? ' deck-grid--no-cand' : '')
		+ '" style="--deck-cand-count:' + Math.max(1, candidates.length) + '">';
	html += '<div class="deck-cell deck-head deck-corner">スキル / 計</div>';
	candidates.forEach(c => {
		html += '<div class="deck-cell deck-head' + (c.enabled ? '' : ' col-disabled') + '">'
			+ '<span class="deck-cand-pill">'
			+ '<input type="checkbox" ' + (c.enabled ? 'checked' : '') + ' onchange="toggleCandidateEnabled(\'' + c.candidateId + '\')" title="比較対象（有効）にする" aria-label="' + escapeHtml(c.label) + ' を比較対象にする"/>'
			// 候補名の全文表示も同じ #name-reveal-tip を使う。document のクリックで
			// 閉じる仕掛けを入れたので、開いた直後に自分で閉じないよう伝播を止める。
			+ `<button type="button" class="deck-cand-name" data-cand-id="${c.candidateId}" onclick="event.stopPropagation(); toggleCandidateNameReveal(this, '${c.candidateId}')">${escapeHtml(c.label.slice(0, 2))}</button>`
			+ '<button type="button" class="deck-cand-x" onclick="removeCandidate(\'' + c.candidateId + '\')" aria-label="候補「' + escapeHtml(c.label) + '」を削除">×</button>'
			+ '</span></div>';
	});
	// 末尾の余り列（grid-template-columns の 1fr）。候補が少ないときに
	// 行の地色を右端まで届かせるためだけの空セル。
	html += '<div class="deck-cell deck-head"></div>';

	if (skillIdsToShow.length === 0) {
		html += '</div>';
		wrap.innerHTML = html;
		setRecordGridNote('条件に一致する行がありません。');
		return;
	}

	skillIdsToShow.forEach((skillId, idx) => {
		const sum = computeRowSum(skillId);
		// tr が無いので、行の地色（ゼブラ）は行の全セルに同じクラスで付ける。
		const zebra = idx % 2 === 0 ? 'deck-row-a' : 'deck-row-b';
		const name = escapeHtml(getSkillName(skillId));
		html += '<div class="deck-cell deck-info ' + zebra + ' ' + (sum === 0 ? 'row-zero' : '') + '" id="row-' + escapeHtml(skillId) + '">'
			+ '<span class="deck-name">'
			// 効果タイプのドット。色分けは別フェーズなので今は1色のプレースホルダー。
			+ '<span class="deck-cat-dot"></span>'
			+ '<span class="deck-name-wrap">'
			+ '<button type="button" class="deck-name-clip" title="' + name + '"'
			+ ' onclick="event.stopPropagation(); toggleSkillNameTip(this, \'' + escapeHtml(skillId) + '\')">' + name + '</button>'
			+ '</span></span>'
			+ '<span id="sum-' + escapeHtml(skillId) + '" class="deck-total' + (sum > 0 ? ' deck-total--on' : '') + '" title="有効な候補の★合計">' + sum + '</span>'
			+ '<button type="button" class="deck-name-del" onclick="removeSkillFromRecord(\'' + escapeHtml(skillId) + '\')" aria-label="この行を削除"><i data-lucide="x" class="w-3 h-3"></i></button>'
			+ '</div>';
		candidates.forEach(c => {
			const v = getStar(skillId, c.candidateId);
			// タイルは <button>。<div onclick> にしないのは、Tab移動と
			// Enter/Space での操作を素で効かせるため。
			const starLabel = escapeHtml(getSkillName(skillId) + '／' + c.label);
			// OCRが読んだ値から人が動かしたセルは、★の色ではなくタイルの枠線で示す。
			// 色相の変化（黄→赤）だけに頼ると判別しづらい人がいるため、
			// 「枠があるか無いか」という形の違いで分かるようにしている。
			const edited = Core.isEditedCell(draftRecord, skillId, c.candidateId);
			html += '<div class="deck-cell ' + zebra + (c.enabled ? '' : ' col-disabled') + '">'
				+ '<button type="button" class="star-tile' + (edited ? ' is-edited' : '') + '"'
				+ ` id="star-${escapeHtml(skillId)}-${c.candidateId}"`
				+ ' data-value="' + v + '"'
				+ ' data-star-label="' + starLabel + '"'
				+ ' aria-label="' + starLabel + ' Lv' + v + (edited ? '（手動修正済み）' : '') + '"'
				+ ' title="' + starLabel + (edited ? '（手動修正済み）' : '') + '：押すたびに 0→1→2→3→0 と変わります"'
				+ ' onclick="cycleStar(\'' + escapeHtml(skillId) + '\',\'' + c.candidateId + '\')">'
				+ starsMarkup(v) + '</button></div>';
		});
		html += '<div class="deck-cell ' + zebra + '"></div>';
	});
	html += '</div>';
	if (candidates.length === 0) {
		setRecordGridNote('「候補を追加」からまず候補を1人以上追加してください。');
	}
	wrap.innerHTML = html;
	// はみ出し判定は描画後にしかできない（実測が要るため）。
	markTruncatedSkillNames();
	refreshIcons();
}

// スキルを足す3つの入口。どれも「選んだIDを比較シートへ足す」処理へ合流する。
function addSkillsToRecord(ids) {
	ids.forEach(id => { if (!draftRecord.skillIds.includes(id)) draftRecord.skillIds.push(id); });
	persistDraftRecord();
	renderRecordGrid();
}

function openRecordSkillPicker() {
	Core.openSkillPicker(draftRecord.skillIds, addSkillsToRecord);
}

function openRecordTextPicker() {
	Core.openTextSkillPicker(draftRecord.skillIds, addSkillsToRecord);
}

function openRecordCustomSkill() {
	Core.openCustomSkillPicker(draftRecord.skillIds, addSkillsToRecord);
}

function duplicateRecord(recordId) {
	if (userData.records.length >= RECORD_LIMIT) { showToast('比較シートは最大' + RECORD_LIMIT + '件までです'); return; }
	const r = userData.records.find(x => x.recordId === recordId);
	const copy = JSON.parse(JSON.stringify(r));
	copy.recordId = uid('rec'); copy.name = r.name + '（コピー）'; copy.createdAt = nowIso(); copy.updatedAt = nowIso();
	Core.normalizeCandidateEnabled(copy);
	userData.records.push(copy);
	saveUserData();
	renderRecordList();
	showToast('複製しました');
}

function deleteRecord(recordId) {
	const idx = userData.records.findIndex(x => x.recordId === recordId);
	if (idx === -1) return;
	const removed = userData.records[idx];
	userData.records.splice(idx, 1);
	saveUserData();
	renderRecordList();
	pushUndo('比較シート「' + removed.name + '」を削除しました', () => {
		userData.records.splice(idx, 0, removed);
		saveUserData();
		renderAll();
	});
}

/* ============================================================
 * データ管理（インポート／エクスポート・マスター更新）
 * ============================================================ */
function renderDataTab() {
	const masterMeta = Core.getMasterMeta();
	document.getElementById('data-template-count').textContent = userData.templates.length + '/' + TEMPLATE_LIMIT;
	document.getElementById('data-record-count').textContent = userData.records.length + '/' + RECORD_LIMIT;
	document.getElementById('data-custom-count').textContent = (userData.customSkills || []).length + '/' + CUSTOM_SKILL_SOFT_CAP;
	document.getElementById('data-master-version').textContent = masterMeta.version || '(未取得)';
	document.getElementById('data-master-fetched').textContent = masterMeta.fetchedAt ? masterMeta.fetchedAt.replace('T', ' ').slice(0, 19) : '-';
}

function exportData() {
	document.getElementById('export-textarea').value = JSON.stringify(userData, null, 2);
	showToast('エクスポート用データを表示しました');
}

async function copyExportData() {
	const ta = document.getElementById('export-textarea');
	if (!ta.value) exportData();
	try {
		await navigator.clipboard.writeText(document.getElementById('export-textarea').value);
		showToast('コピーしました');
	} catch (e) {
		showToast('コピーに失敗しました。テキストを選択して手動でコピーしてください');
	}
}

function importData() {
	const raw = document.getElementById('import-textarea').value.trim();
	if (!raw) { showToast('貼り付けるデータがありません'); return; }
	let parsed;
	try { parsed = JSON.parse(raw); } catch (e) { showToast('JSONの形式が正しくありません'); return; }
	if (!parsed || !Array.isArray(parsed.templates) || !Array.isArray(parsed.records)) {
		showToast('UmaSkill Deckのエクスポートデータではないようです');
		return;
	}
	if (!confirm('現在保存されているデータをすべて置き換えます。よろしいですか？')) return;
	Core.replaceUserData(parsed);
	userData = Core.getUserData();
	draftRecord = null;
	templateManager.closeEditor();
	renderAll();
	showToast('インポートしました');
}

async function refreshMasterData() {
	showToast('マスターデータを再取得しています…');
	await Core.loadMasterSkills(true);
	renderDataTab();
	showToast('マスターデータを更新しました（' + Core.getMasterSkills().length + '件）');
}

/* ============================================================
 * OCRツールからの受け取り口（付加機能）
 *
 * OCRツール（special.html = UmaStar OCR、exam.html = UmaExam OCR）が判定結果を
 * ツールごとの localStorage キーへ書き出す。ここではそれを見つけたらバナーを出し、
 * 利用者が「読み込む」を押したときだけ取り込む。自動では反映しない。
 *
 * 設計上の約束:
 * - この節は既存のテンプレート／比較シート／インポート・エクスポートのロジックに
 *   一切手を入れない。書き込みは共有モジュールの applyStarAssignments() を
 *   そのまま呼ぶだけで、新しい書き込み処理は作らない（上書き確認もそちらに任せる）。
 * - uma-skill-deck.html は変更しないため、バナーとダイアログのDOMは
 *   このファイルが実行時に生成して差し込む。
 * - OCRツールの引き出しパネル（iframe）越しでも、このページを単独で
 *   開いたときでも、同じように動く。
 * - 受け渡しデータはツールごとに別のキーで持つ（書く側のツールを変えずに済ませるため）。
 *   両方に未取り込みの結果があるときは createdAt が新しい方を先に1件だけ出し、
 *   それを読み込む／閉じると、もう一方がまだ未取り込みなら続けて出る。
 * ============================================================ */

// ※ 各キー名は書き出し側（special.html / exam.html）にも同じ文字列がある。
//    片方を変えるときは必ず両方を直すこと。
//    label は payload.source → バナー・ダイアログに出すツール名。
//    source が未知・欠落のときは 'OCR' とだけ出す。
const OCR_HANDOFF_SOURCES = [
	{ source: 'special', key: 'umaSkillDeck:ocrHandoff:special', label: 'UmaStar OCR' },
	{ source: 'exam', key: 'umaSkillDeck:ocrHandoff:exam', label: 'UmaExam OCR' },
];
const OCR_HANDOFF_STORAGE_KEYS = OCR_HANDOFF_SOURCES.map(s => s.key);

function ocrSourceLabel(source) {
	const hit = OCR_HANDOFF_SOURCES.find(s => s.source === source);
	return hit ? hit.label : 'OCR';
}

// 「今回は読まない」と閉じられた受け渡しデータのID（キーごと・メモリのみ。再読込で戻る）
const dismissedHandoffIds = {};
let ocrImportModal = null;

/** 1つのキーを読む。戻り値は { key, payload }。無い・壊れているときは null */
function readOcrHandoffEntry(key) {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || !Array.isArray(parsed.persons) || !Array.isArray(parsed.skillNames)) return null;
		return { key: key, payload: parsed };
	} catch (e) {
		return null;
	}
}

/**
 * いま画面に出すべき受け渡しデータ（未取り込み・閉じられていない）を1件返す。
 * 複数あれば createdAt が新しい方。無ければ null。
 */
function pendingOcrHandoff() {
	const pending = OCR_HANDOFF_STORAGE_KEYS
		.map(readOcrHandoffEntry)
		.filter(e => e && !e.payload.imported && e.payload.handoffId !== dismissedHandoffIds[e.key]);
	if (pending.length === 0) return null;
	pending.sort((a, b) => String(b.payload.createdAt || '').localeCompare(String(a.payload.createdAt || '')));
	return pending[0];
}

function markOcrHandoffImported(entry) {
	entry.payload.imported = true;
	entry.payload.importedAt = nowIso();
	try { localStorage.setItem(entry.key, JSON.stringify(entry.payload)); } catch (e) {}
}

function injectOcrHandoffStyles() {
	if (document.getElementById('ocr-handoff-styles')) return;
	const style = document.createElement('style');
	style.id = 'ocr-handoff-styles';
	// 見た目の値は css/common.css のトークンから取る。ここに色や寸法を直書きすると、
	// Tailwind v4 のパレット（oklch）と微妙にズレた色が並ぶことになる。
	// ボタンと入力欄そのものの形は共通部品（.uma-btn / .uma-input）に任せ、
	// ここには「OCR受け渡しバナー固有の配置」だけを残す。
	style.textContent = [
		'.ocr-banner { display: flex; align-items: center; justify-content: space-between; gap: var(--uma-sp-3); flex-wrap: wrap;',
		'  border: 1px solid var(--uma-accent-border); background: var(--uma-accent-soft); border-radius: var(--uma-r-lg);',
		'  padding: var(--uma-sp-2-5) var(--uma-sp-3-5); margin-bottom: var(--uma-sp-4); }',
		'.ocr-banner[hidden] { display: none !important; }',
		'.ocr-banner-title { font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; color: var(--uma-accent-soft-text); }',
		'.ocr-banner-sub { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); }',
		'.ocr-banner-actions { display: flex; gap: var(--uma-sp-1-5); flex-shrink: 0; }',
		'.ocr-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-2); padding: var(--uma-sp-2) var(--uma-sp-2-5);',
		'  border: 1px solid var(--uma-border); border-radius: var(--uma-r-lg); background: var(--uma-surface); margin-bottom: var(--uma-sp-1-5); }',
		'.ocr-row-label { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); font-weight: 700; padding: var(--uma-sp-0-5) var(--uma-sp-2);',
		'  border-radius: var(--uma-r-md); background: var(--uma-accent-soft); color: var(--uma-accent-soft-text); flex-shrink: 0; }',
		'.ocr-row-note { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); flex-shrink: 0; }',
		'.ocr-select { flex: 1; min-width: 180px; }',
		'.ocr-label-input { width: 110px; }',
		'.ocr-warn { border: 1px solid var(--uma-warn-border); background: var(--uma-warn-bg); color: var(--uma-warn-text);',
		'  font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); border-radius: var(--uma-r-lg);',
		'  padding: var(--uma-sp-2) var(--uma-sp-2-5); margin-top: var(--uma-sp-2-5); white-space: pre-line; }'
	].join('\n');
	document.head.appendChild(style);
}

function ensureOcrHandoffBanner() {
	let el = document.getElementById('ocr-handoff-banner');
	if (el) return el;
	injectOcrHandoffStyles();
	el = document.createElement('div');
	el.id = 'ocr-handoff-banner';
	el.className = 'ocr-banner';
	el.hidden = true;
	el.innerHTML = '' +
		'<div class="flex items-center gap-2.5 min-w-0">' +
			'<i data-lucide="download" class="w-4 h-4 text-indigo-600 shrink-0"></i>' +
			'<div class="min-w-0">' +
				'<p class="ocr-banner-title" data-ocr-el="title"></p>' +
				'<p class="ocr-banner-sub" data-ocr-el="summary"></p>' +
			'</div>' +
		'</div>' +
		'<div class="ocr-banner-actions">' +
			'<button type="button" class="ocr-btn-primary uma-btn uma-btn--primary" data-ocr-act="import">読み込む</button>' +
			'<button type="button" class="ocr-btn-ghost uma-btn uma-btn--secondary" data-ocr-act="dismiss">閉じる</button>' +
		'</div>';
	// タブ切り替えの直下（どのタブを開いていても見える位置）に差し込む
	const nav = document.getElementById('tab-btn-template').closest('nav');
	nav.insertAdjacentElement('afterend', el);
	el.addEventListener('click', (e) => {
		const btn = e.target.closest('[data-ocr-act]');
		if (!btn) return;
		if (btn.dataset.ocrAct === 'import') openOcrImportDialog();
		else if (btn.dataset.ocrAct === 'dismiss') {
			// いま出しているものだけを閉じる。もう一方のツールの結果が残っていれば次に出る
			const entry = pendingOcrHandoff();
			if (entry) dismissedHandoffIds[entry.key] = entry.payload.handoffId;
			renderOcrHandoffBanner();
		}
	});
	return el;
}

function renderOcrHandoffBanner() {
	const el = ensureOcrHandoffBanner();
	const entry = pendingOcrHandoff();
	if (!entry) { el.hidden = true; return; }
	const p = entry.payload;
	const when = String(p.createdAt || '').replace('T', ' ').slice(0, 16);
	const who = p.persons.map(x => x.label).join('・');
	const scopeName = (p.scope && p.scope.name) ? p.scope.name : '';
	el.querySelector('[data-ocr-el="title"]').textContent = ocrSourceLabel(p.source) + 'の判定結果があります';
	el.querySelector('[data-ocr-el="summary"]').textContent =
		who + ' の' + p.persons.length + '人分・' + when + (scopeName ? '（対象：' + scopeName + '）' : '');
	el.hidden = false;
	refreshIcons();
}

/**
 * 受け渡しデータのスキル名を、このツールのスキルIDへ解決する。
 * 共有モジュールの一括貼り付け用マッチングをそのまま使い、
 * **完全一致したものだけ**を採用する（曖昧なものを黙って当てはめない）。
 */
function resolveHandoffSkills(payload) {
	const res = Core.matchPastedSkillText(payload.skillNames.join('\n'));
	const idByNorm = {};
	res.rows.forEach(r => {
		if (r.kind === 'exact') idByNorm[Core.normalizeSkillText(r.raw)] = r.matchedId;
	});
	const resolved = [];
	const unresolved = [];
	payload.skillNames.forEach(name => {
		const id = idByNorm[Core.normalizeSkillText(name)];
		if (id) resolved.push({ name: name, id: id });
		else unresolved.push(name);
	});
	return { resolved: resolved, unresolved: unresolved };
}

function openOcrImportDialog() {
	const entry = pendingOcrHandoff();
	if (!entry) { showToast('読み込めるデータがありません'); return; }
	const payload = entry.payload;
	const skills = resolveHandoffSkills(payload);
	if (skills.resolved.length === 0) {
		showToast('このツールに登録されているスキルと一致しませんでした');
		return;
	}

	injectOcrHandoffStyles();
	if (!ocrImportModal) {
		ocrImportModal = document.createElement('div');
		ocrImportModal.className = 'usd-modal';
		ocrImportModal.hidden = true;
		document.body.appendChild(ocrImportModal);
		ocrImportModal.addEventListener('click', (e) => {
			if (e.target === ocrImportModal) { closeOcrImportDialog(); return; }
			const btn = e.target.closest('[data-ocr-act]');
			if (!btn) return;
			if (btn.dataset.ocrAct === 'close') closeOcrImportDialog();
			else if (btn.dataset.ocrAct === 'apply') applyOcrImport();
		});
		ocrImportModal.addEventListener('change', (e) => {
			if (e.target.dataset.ocrEl === 'record-select') renderOcrImportRows();
			else if (e.target.dataset.ocrEl === 'person-select') {
				const input = ocrImportModal.querySelector('[data-ocr-el="person-label"][data-person="' + e.target.dataset.person + '"]');
				if (input) input.hidden = e.target.value !== '__new__';
			}
		});
	}
	ocrImportModal._entry = entry;      // 取り込み後に imported を書き戻すキーを覚えておく
	ocrImportModal._payload = payload;
	ocrImportModal._skills = skills;

	const warn = skills.unresolved.length > 0
		? '<div class="ocr-warn">次の' + skills.unresolved.length + '件は、このツールのスキル一覧に見つからなかったため取り込みません。\n・'
			+ skills.unresolved.map(escapeHtml).join('\n・') + '</div>'
		: '';

	ocrImportModal.innerHTML = '' +
		'<div class="usd-modal-panel">' +
			'<div class="flex items-center justify-between p-4 border-b border-slate-200" style="flex-shrink:0;">' +
				'<p class="text-sm font-semibold text-slate-700" data-ocr-el="dialog-title">' + escapeHtml(ocrSourceLabel(payload.source)) + 'の結果を読み込む</p>' +
				'<button type="button" class="usd-icon-btn" data-ocr-act="close" aria-label="閉じる"><i data-lucide="x" class="w-4 h-4"></i></button>' +
			'</div>' +
			'<div class="p-4" style="overflow:auto;">' +
				'<p class="text-xs text-slate-500 mb-3">' + escapeHtml(payload.persons.map(x => x.label).join('・')) +
					' の' + payload.persons.length + '人分・スキル' + skills.resolved.length + '件を取り込みます。' +
					'保存は1人＝1候補まるごとです（選んだ候補の★は、対象スキルぶん置き換わります）。</p>' +
				'<label class="block text-xs font-semibold text-slate-700 mb-1.5">取り込み先の比較シート</label>' +
				'<select class="ocr-select uma-input" style="width:100%;" data-ocr-el="record-select"></select>' +
				'<input type="text" class="ocr-label-input uma-input" style="width:100%;margin-top:6px;" data-ocr-el="record-name" placeholder="新しい比較シートの名前" hidden />' +
				'<label class="block text-xs font-semibold text-slate-700 mt-4 mb-1.5">それぞれの取り込み先の候補</label>' +
				'<div data-ocr-el="rows"></div>' +
				warn +
				'<button type="button" class="ocr-btn-primary uma-btn uma-btn--primary" style="width:100%;margin-top:14px;padding:10px;" data-ocr-act="apply">この内容で取り込む</button>' +
			'</div>' +
		'</div>';

	// 取り込み先シートの選択肢
	const sel = ocrImportModal.querySelector('[data-ocr-el="record-select"]');
	const summaries = Core.listRecordSummaries();
	const opts = ['<option value="__new__">＋ 新しい比較シートを作成する</option>'];
	summaries.forEach(r => {
		opts.push('<option value="' + escapeHtml(r.recordId) + '">' + escapeHtml(r.name + '（候補' + r.candidateCount + '人・スキル' + r.skillCount + '件）') + '</option>');
	});
	sel.innerHTML = opts.join('');
	// 送り元がテンプレートなら、そこから作られたシートを既定にする
	const same = (payload.scope && payload.scope.id)
		? summaries.find(r => r.sourceTemplateId === payload.scope.id) : null;
	sel.value = same ? same.recordId : '__new__';

	renderOcrImportRows();
	ocrImportModal.hidden = false;
	refreshIcons();
}

function renderOcrImportRows() {
	const payload = ocrImportModal._payload;
	const recordId = ocrImportModal.querySelector('[data-ocr-el="record-select"]').value;
	const isNew = recordId === '__new__';

	const nameInput = ocrImportModal.querySelector('[data-ocr-el="record-name"]');
	nameInput.hidden = !isNew;
	if (isNew && !nameInput.value) {
		nameInput.value = ((payload.scope && payload.scope.name) ? payload.scope.name : 'OCR結果') + ' 候補比較';
	}

	const candidates = isNew ? [] : Core.listCandidateSummaries(recordId);
	const rows = ocrImportModal.querySelector('[data-ocr-el="rows"]');
	rows.innerHTML = payload.persons.map(p => {
		const match = candidates.find(c => c.label === p.label);
		const def = match ? match.candidateId : '__new__';
		const opts = ['<option value="__skip__">取り込まない</option>',
			'<option value="__new__"' + (def === '__new__' ? ' selected' : '') + '>＋ 新しい候補として追加</option>']
			.concat(candidates.map(c =>
				'<option value="' + escapeHtml(c.candidateId) + '"' + (def === c.candidateId ? ' selected' : '') + '>'
				+ escapeHtml(c.label + '（現在★' + c.filledCount + '件）に上書き') + '</option>'));
		const detected = Object.keys(p.stars || {}).length;
		const unknown = (p.unknownStars || []).length;
		return '' +
		'<div class="ocr-row">' +
			'<span class="ocr-row-label">' + escapeHtml(p.label) + '</span>' +
			'<span class="ocr-row-note">検出' + (detected + unknown) + '件'
				+ (unknown > 0 ? ' / <span style="color:#b45309;font-weight:600;">★不明' + unknown + '件</span>' : '') + '</span>' +
			'<select class="ocr-select uma-input" data-ocr-el="person-select" data-person="' + p.index + '">' + opts.join('') + '</select>' +
			'<input type="text" class="ocr-label-input uma-input" data-ocr-el="person-label" data-person="' + p.index + '" value="' + escapeHtml(p.label) + '" placeholder="候補名"' + (def === '__new__' ? '' : ' hidden') + ' />' +
		'</div>';
	}).join('');
}

function closeOcrImportDialog() {
	if (ocrImportModal) ocrImportModal.hidden = true;
}

function applyOcrImport() {
	const payload = ocrImportModal._payload;
	const skills = ocrImportModal._skills;

	// 先に「何を書くか」を作る。取り込む人が0人なら、比較シートを作る前に止める。
	const specs = [];
	payload.persons.forEach(p => {
		const sel = ocrImportModal.querySelector('[data-ocr-el="person-select"][data-person="' + p.index + '"]');
		if (!sel || sel.value === '__skip__') return;
		const stars = {};
		skills.resolved.forEach(x => {
			const v = (p.stars || {})[x.name];
			// ★を確定できなかったスキル（unknownStars）と未検出はどちらも0。
			// 0で保存されることは取り込み画面の注意書きで知らせている。
			stars[x.id] = (typeof v === 'number') ? v : 0;
		});
		if (sel.value === '__new__') {
			const input = ocrImportModal.querySelector('[data-ocr-el="person-label"][data-person="' + p.index + '"]');
			const label = ((input && input.value) || '').trim() || p.label;
			specs.push({ newLabel: label, stars: stars });
		} else {
			specs.push({ candidateId: sel.value, stars: stars });
		}
	});
	if (specs.length === 0) { showToast('取り込む人を1人以上選んでください'); return; }
	// 同じ候補を2人に割り当てると先の人の★が黙って消えるため、保存せずに知らせる。
	const usedIds = specs.map(x => x.candidateId).filter(Boolean);
	if (new Set(usedIds).size !== usedIds.length) {
		showToast('同じ候補が複数の人に指定されています。別々の候補を選んでください');
		return;
	}

	let recordId = ocrImportModal.querySelector('[data-ocr-el="record-select"]').value;
	if (recordId === '__new__') {
		if (!Core.canCreateRecord()) {
			showToast('比較シートは最大' + RECORD_LIMIT + '件までです。不要なものを削除してください');
			return;
		}
		const rec = Core.createRecord({
			name: ocrImportModal.querySelector('[data-ocr-el="record-name"]').value,
			skillIds: skills.resolved.map(x => x.id),
			sourceTemplateId: (payload.scope && payload.scope.kind === 'template') ? payload.scope.id : ''
		});
		if (!rec) return;
		recordId = rec.recordId;
	}

	const res = Core.applyStarAssignments(recordId, specs);
	if (!res.ok) {
		showToast(res.cancelled ? '取り込みを中止しました（データは変更していません）' : '取り込めませんでした');
		return;
	}

	markOcrHandoffImported(ocrImportModal._entry);
	closeOcrImportDialog();
	userData = Core.getUserData();
	draftRecord = null;
	renderAll();
	renderOcrHandoffBanner();
	switchTab('record');
	const parts = [res.written + '人分を取り込みました'];
	if (res.skippedSkillIds.length > 0) parts.push('（' + res.skippedSkillIds.length + '件はシートに無いスキルのため対象外）');
	showToast(parts.join(''));
}

function initOcrHandoff() {
	renderOcrHandoffBanner();
	// 同一オリジンの別ウィンドウ（OCRツールの引き出しパネルの親側）で
	// 書き込みがあると、このイベントが飛んでくる。ポーリングは不要。
	// e.key は localStorage.clear() のとき null になるので、その場合も描き直す。
	window.addEventListener('storage', (e) => {
		if (e.key && OCR_HANDOFF_STORAGE_KEYS.indexOf(e.key) === -1) return;
		renderOcrHandoffBanner();
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && ocrImportModal && !ocrImportModal.hidden) closeOcrImportDialog();
	});
}

/* ============================================================
 * 初期化
 * ============================================================ */
function renderAll() {
	templateManager.render();
	renderRecordTab();
	renderDataTab();
}

async function initApp() {
	document.getElementById('js-version-note').textContent =
		'js ' + UMA_SKILL_DECK_JS_VERSION + '・core ' + Core.VERSION + '・css ' + (loadedCommonCssVersion() || '(未読込)');
	verifyTailwindLoaded(5);
	verifyCommonCssVersion();
	Core.configure({ toast: showToast });
	Core.onUndoChanged(renderUndoButton);
	userData = Core.getUserData();
	await Core.loadMasterSkills(false);
	templateManager = Core.createTemplateManager(document.getElementById('template-panel-root'), {
		// テンプレートの追加・削除・改名は比較シートタブの選択肢にも影響するため、
		// 変更があったら他タブも描き直す。
		onChange: () => { renderRecordTab(); renderDataTab(); }
	});
	renderAll();
	initOcrHandoff();
	refreshIcons();
}

document.addEventListener('DOMContentLoaded', initApp);
