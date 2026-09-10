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
const UMA_SKILL_DECK_JS_VERSION = '2026-09-10b';

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

let draftRecord = null;   // { recordId, name, sourceTemplateId, skillIds, candidates, cells } / null = 一覧表示中
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
		<div class="list-card">
			<div class="flex-1 min-w-0">
				<p class="font-semibold text-sm text-slate-800 truncate">${escapeHtml(r.name)}</p>
				<p class="text-xs text-slate-500">元テンプレート：${escapeHtml(getTemplateName(r.sourceTemplateId))}</p>
				<p class="text-xs text-slate-500">候補${r.candidates.length}人・スキル${r.skillIds.length}件・更新 ${escapeHtml((r.updatedAt || '').slice(0, 10))}</p>
			</div>
			<div class="flex gap-1.5 shrink-0">
				<button onclick="openRecordEditor('${r.recordId}')" class="icon-btn" title="開く"><i data-lucide="edit" class="w-4 h-4"></i></button>
				<button onclick="duplicateRecord('${r.recordId}')" class="icon-btn" title="複製"><i data-lucide="copy" class="w-4 h-4"></i></button>
				<button onclick="deleteRecord('${r.recordId}')" class="icon-btn text-red-500" title="削除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
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
	targetRecord.sourceTemplateId = t.templateId;
	targetRecord.skillIds = t.skillIds.slice();
	const keep = new Set(targetRecord.skillIds);
	Object.keys(targetRecord.cells).forEach(sid => { if (!keep.has(sid)) delete targetRecord.cells[sid]; });
	saveUserData();
	renderRecordEditor();
	pushUndo('テンプレートを「' + t.name + '」に切り替えました', () => {
		targetRecord.sourceTemplateId = prevTemplateId;
		targetRecord.skillIds = prevSkillIds;
		targetRecord.cells = prevCells;
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
	targetRecord.skillIds.splice(idx, 1);
	delete targetRecord.cells[skillId];
	targetRecord.updatedAt = nowIso();
	saveUserData();
	renderRecordGrid();
	pushUndo('スキル「' + name + '」を削除しました', () => {
		targetRecord.skillIds.splice(idx, 0, skillId);
		if (cellsBackup) targetRecord.cells[skillId] = cellsBackup;
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

function adjustStar(skillId, candidateId, delta) {
	if (!draftRecord.cells[skillId]) draftRecord.cells[skillId] = {};
	const current = draftRecord.cells[skillId][candidateId] || 0;
	const next = Math.max(STAR_MIN, Math.min(STAR_MAX, current + delta));
	draftRecord.cells[skillId][candidateId] = next;
	persistDraftRecord();
	document.getElementById('star-' + skillId + '-' + candidateId).textContent = next;
	const newSum = computeRowSum(skillId);
	const sumEl = document.getElementById('sum-' + skillId);
	if (sumEl) sumEl.textContent = newSum;
	const rowEl = document.getElementById('row-' + skillId);
	if (rowEl) rowEl.classList.toggle('row-zero', newSum === 0);
	// 行フィルターが「不足のみ」「充足あり」の場合、値の増減でその行が
	// 表示条件から外れることがあるため、その時だけグリッド全体を再描画する。
	if ((recordRowFilter === 'zero' && newSum !== 0) || (recordRowFilter === 'nonzero' && newSum === 0)) {
		renderRecordGrid();
	}
}

function renderRecordGrid() {
	const wrap = document.getElementById('record-grid-wrap');
	const enabledCountEl = document.getElementById('record-enabled-count');
	if (enabledCountEl) enabledCountEl.textContent = '有効な候補：' + countEnabledCandidates() + '/' + MAX_ENABLED_CANDIDATES + '人（候補は' + draftRecord.candidates.length + '人登録中）';
	document.querySelectorAll('.row-filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === recordRowFilter));
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
	let html = '<table class="deck-table"><thead><tr>';
	html += '<th class="sticky-col sticky-header">スキル</th>';
	html += '<th class="sticky-col2 sticky-header" title="有効な候補の★合計">計</th>';
	candidates.forEach(c => {
		html += `<th class="sticky-header candidate-col ${c.enabled ? '' : 'col-disabled'}">
			<div class="cand-header">
				<input type="checkbox" ${c.enabled ? 'checked' : ''} onchange="toggleCandidateEnabled('${c.candidateId}')" title="比較対象（有効）にする"/>
				<button type="button" class="cand-name-btn" data-cand-id="${c.candidateId}" onclick="toggleCandidateNameReveal(this, '${c.candidateId}')">${escapeHtml(c.label.slice(0, 2))}</button>
				<button class="cand-del-btn" onclick="removeCandidate('${c.candidateId}')" aria-label="この候補を削除"><i data-lucide="x" class="w-2.5 h-2.5"></i></button>
			</div>
		</th>`;
	});
	html += '</tr></thead><tbody>';
	if (skillIdsToShow.length === 0) {
		html += '</tbody></table>';
		html += '<p class="text-xs text-slate-400 p-3">条件に一致する行がありません。</p>';
		wrap.innerHTML = html;
		return;
	}
	skillIdsToShow.forEach(skillId => {
		const sum = computeRowSum(skillId);
		html += '<tr id="row-' + escapeHtml(skillId) + '" class="' + (sum === 0 ? 'row-zero' : '') + '">' +
			'<td class="sticky-col" title="' + escapeHtml(getSkillName(skillId)) + '"><div class="flex items-center justify-between gap-1"><span class="truncate">' + escapeHtml(getSkillName(skillId)) + '</span>' +
			'<button onclick="removeSkillFromRecord(\'' + escapeHtml(skillId) + '\')" aria-label="この行を削除"><i data-lucide="x" class="w-3 h-3 text-slate-400"></i></button></div></td>' +
			'<td class="sticky-col2"><span id="sum-' + escapeHtml(skillId) + '" class="sum-badge" title="有効な候補の★合計">' + sum + '</span></td>';
		candidates.forEach(c => {
			const v = (draftRecord.cells[skillId] && draftRecord.cells[skillId][c.candidateId]) || 0;
			html += `<td class="candidate-col ${c.enabled ? '' : 'col-disabled'}"><div class="star-cell">
				<span class="star-value" id="star-${escapeHtml(skillId)}-${c.candidateId}">${v}</span>
				<div class="star-stepper">
					<button onclick="adjustStar('${escapeHtml(skillId)}','${c.candidateId}',1)" aria-label="星を増やす">▲</button>
					<button onclick="adjustStar('${escapeHtml(skillId)}','${c.candidateId}',-1)" aria-label="星を減らす">▼</button>
				</div>
			</div></td>`;
		});
		html += '</tr>';
	});
	html += '</tbody></table>';
	if (candidates.length === 0) {
		html += '<p class="text-xs text-slate-400 p-3">「候補を追加」からまず候補を1人以上追加してください。</p>';
	}
	wrap.innerHTML = html;
	refreshIcons();
}

function openRecordSkillPicker() {
	Core.openSkillPicker(draftRecord.skillIds, (ids) => {
		ids.forEach(id => { if (!draftRecord.skillIds.includes(id)) draftRecord.skillIds.push(id); });
		persistDraftRecord();
		renderRecordGrid();
	});
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
 * 初期化
 * ============================================================ */
function renderAll() {
	templateManager.render();
	renderRecordTab();
	renderDataTab();
}

async function initApp() {
	document.getElementById('js-version-note').textContent = 'js ' + UMA_SKILL_DECK_JS_VERSION + '・core ' + Core.VERSION;
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
	refreshIcons();
}

document.addEventListener('DOMContentLoaded', initApp);
