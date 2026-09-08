/**
 * uma-skill-deck.js
 * UmaSkill Deck（対象スキルセットに対する候補比較ツール）の全ロジック。
 *
 * 設計方針:
 * - UmaStar OCR（special.html / common.js）とは完全に独立した新規実装。
 *   OCRロジックは一切持たない。互換性維持も考慮しない。
 * - グローバル状態はこのファイル内に閉じる（common.jsのような「呼び出し元が状態を持つ」方式は取らない。
 *   このツールは単一ページで完結するため、状態を直接持った方がシンプル）。
 * - localStorageキーは umaSkillDeck:userData（エクスポート対象）と
 *   umaSkillDeck:masterCache（再取得可能キャッシュ、エクスポート対象外）の2本のみ。
 */

// このファイルの版。ツール上部の「読み込み状況」に表示し、
// HTML側の ?v= クエリ・このファイル内の定数の3点が一致しているかを納品前に確認する。
const UMA_SKILL_DECK_JS_VERSION = '2026-09-08a';

/* ============================================================
 * 定数
 * ============================================================ */
const STORAGE_KEY_USER = 'umaSkillDeck:userData';
const STORAGE_KEY_MASTER = 'umaSkillDeck:masterCache';
const MASTER_JSON_PATH = 'uma-skill-deck-skills.json';
const TEMPLATE_LIMIT = 10;
const RECORD_LIMIT = 10;
const CUSTOM_SKILL_SOFT_CAP = 50;
const STAR_MIN = 0;
const STAR_MAX = 3;

// 6軸のタグ辞書。フィルターパネル・タグ表示・カスタムスキル入力で共有する。
const TAG_AXES = [
	{ key: 'distance', label: '①距離', defaultOpen: true, options: [
		{ v: 'short', t: '短距離' }, { v: 'mile', t: 'マイル' }, { v: 'medium', t: '中距離' }, { v: 'long', t: '長距離' }
	]},
	{ key: 'style', label: '②脚質', defaultOpen: true, options: [
		{ v: 'nige', t: '逃げ' }, { v: 'senko', t: '先行' }, { v: 'sashi', t: '差し' }, { v: 'oikomi', t: '追込' }
	]},
	{ key: 'effect', label: '③効果タイプ', defaultOpen: true, options: [
		{ v: 'target_speed_up', t: '速度アップ' }, { v: 'accel_up', t: '加速度アップ' }, { v: 'move_forward', t: '前に出る' }, { v: 'extend', t: '伸び' },
		{ v: 'stamina', t: '持久力' }, { v: 'speed_down', t: '速度ダウン' }, { v: 'start_good', t: 'スタート得意' }, { v: 'course_sense', t: 'コース取り' },
		{ v: 'lane_change', t: 'レーン移動' }, { v: 'temptation_time', t: '掛かり時間' }, { v: 'vision', t: '視野' },
		{ v: 'speed_up', t: 'スピードアップ' }, { v: 'stamina_up', t: 'スタミナアップ' }, { v: 'power_up', t: 'パワーアップ' },
		{ v: 'guts_up', t: '根性アップ' }, { v: 'wisdom_up', t: '賢さアップ' }, { v: 'all_up', t: '全てアップ' }
	]},
	{ key: 'phase', label: '④フェーズ', defaultOpen: false, options: [
		{ v: 'early', t: '序盤' }, { v: 'mid', t: '中盤' }, { v: 'late', t: '終盤' }, { v: 'lastspurt', t: 'ラストスパート' }
	]},
	{ key: 'coursePos', label: '⑤コース位置', defaultOpen: false, options: [
		{ v: 'corner', t: 'コーナー' }, { v: 'straight', t: '直線' }, { v: 'uphill', t: '上り坂' }, { v: 'downhill', t: '下り坂' }
	]},
	{ key: 'environment', label: '⑥その他（レース環境）', defaultOpen: false, options: [
		{ v: 'ground_good', t: '良バ場' }, { v: 'ground_bad', t: '道悪' },
		{ v: 'right_turn', t: '右回り' }, { v: 'left_turn', t: '左回り' }, { v: 'small_track', t: '小回り' }, { v: 'straight_course', t: '直線コース' },
		{ v: 'weather_sunny', t: '晴れ' }, { v: 'weather_cloudy', t: '曇り' }, { v: 'weather_rain', t: '雨' }, { v: 'weather_snow', t: '雪' },
		{ v: 'season_spring', t: '春' }, { v: 'season_summer', t: '夏' }, { v: 'season_autumn', t: '秋' }, { v: 'season_winter', t: '冬' },
		{ v: 'time_day', t: '昼' }, { v: 'time_evening', t: '夕方' }, { v: 'time_night', t: 'ナイター' },
		{ v: 'track_tokyo', t: '東京レース場' }, { v: 'distance_basis', t: '根幹距離' }, { v: 'distance_nonbasis', t: '非根幹距離' }
	]}
];

// フェッチに失敗した場合のみ使うサンプルデータ（uma-skill-deck-skills.json が
// まだ未公開/未配置の環境でも動作確認できるようにするための最終フォールバック）。
const SAMPLE_MASTER_SKILLS = { masterVersion: 'embedded-sample', skills: [
	{ id: '1', name: '右回り○', tags: { distance: [], style: [], phase: [], coursePos: [], environment: ['right_turn'], effect: ['speed_up'] } },
	{ id: '21', name: '積極策', tags: { distance: ['mile'], style: [], phase: ['mid'], coursePos: [], environment: [], effect: ['target_speed_up'] } },
	{ id: '26', name: '集中力', tags: { distance: [], style: [], phase: [], coursePos: [], environment: [], effect: ['start_good'] } }
]};

/* ============================================================
 * 状態
 * ============================================================ */
let userData = null;
let masterSkills = [];
let masterMeta = { version: '', fetchedAt: '' };

let draftTemplate = null; // { templateId, name, skillIds } / null = 一覧表示中
let draftRecord = null;   // { recordId, name, sourceTemplateId, skillIds, candidates, cells } / null = 一覧表示中
let recordRowFilter = 'all'; // 比較シート編集画面の行フィルター（'all' | 'zero' | 'nonzero'）

// スキル選択パネル（テンプレート編集・レコードへのスキル追加で共有する）の一時状態。
let picker = { filters: {}, checked: new Set(), onAdd: null, excludeIds: [], axisOpen: {} };
TAG_AXES.forEach(axis => { picker.filters[axis.key] = []; picker.axisOpen[axis.key] = axis.defaultOpen; });

/* ============================================================
 * ユーティリティ
 * ============================================================ */
function uid(prefix) {
	return prefix + '_' + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizeForDup(s) {
	return String(s).normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
}

function refreshIcons() {
	if (window.lucide) lucide.createIcons();
}

function nowIso() {
	return new Date().toISOString();
}

/* ============================================================
 * userData（保存データ）の読み書き
 * ============================================================ */
function createEmptyUserData() {
	return { schemaVersion: 1, templates: [], records: [], customSkills: [] };
}

function loadUserData() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY_USER);
		if (!raw) return createEmptyUserData();
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return createEmptyUserData();
		parsed.templates = parsed.templates || [];
		parsed.records = parsed.records || [];
		parsed.customSkills = parsed.customSkills || [];
		return parsed;
	} catch (e) {
		return createEmptyUserData();
	}
}

function saveUserData() {
	try {
		localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));
	} catch (e) {
		showToast('保存に失敗しました（ブラウザのストレージ容量を確認してください）');
	}
}

/* ============================================================
 * マスターデータ（GitHub上のJSON）の取得・キャッシュ
 * ============================================================ */
async function loadMasterSkills(forceRefresh) {
	const url = forceRefresh ? (MASTER_JSON_PATH + '?t=' + Date.now()) : MASTER_JSON_PATH;
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error('HTTP ' + res.status);
		const data = await res.json();
		masterSkills = data.skills || [];
		masterMeta = { version: data.masterVersion || '', fetchedAt: nowIso() };
		try { localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify({ data: data, fetchedAt: masterMeta.fetchedAt })); } catch (e) {}
		return true;
	} catch (e) {
		// フェッチ失敗時はキャッシュ→組み込みサンプルの順でフォールバックする。
		try {
			const cached = JSON.parse(localStorage.getItem(STORAGE_KEY_MASTER) || 'null');
			if (cached && cached.data) {
				masterSkills = cached.data.skills || [];
				masterMeta = { version: (cached.data.masterVersion || '') + '（キャッシュ）', fetchedAt: cached.fetchedAt || '' };
				return false;
			}
		} catch (e2) {}
		masterSkills = SAMPLE_MASTER_SKILLS.skills;
		masterMeta = { version: SAMPLE_MASTER_SKILLS.masterVersion + '（組み込みサンプル）', fetchedAt: nowIso() };
		return false;
	}
}

/* ============================================================
 * スキル参照ヘルパー（マスター／カスタムを横断）
 * ============================================================ */
function findSkill(skillId) {
	const m = masterSkills.find(s => s.id === skillId);
	if (m) return m;
	const c = (userData.customSkills || []).find(s => s.customId === skillId);
	if (c) return { id: c.customId, name: c.name, tags: c.tags };
	return null;
}

function getSkillName(skillId) {
	const s = findSkill(skillId);
	return s ? s.name : '（不明なスキル：' + skillId + '）';
}

function getSkillTags(skillId) {
	const s = findSkill(skillId);
	return s ? s.tags : { distance: [], style: [], phase: [], coursePos: [], environment: [], effect: [] };
}

// フィルター一致判定。軸間はAND、軸内はOR。
// スキルがその軸に条件を持たない（空配列）場合は、その軸のどの選択肢にも一致する扱い（万能スキル）。
function matchesFilters(skill, filters) {
	return TAG_AXES.every(axis => {
		const selected = filters[axis.key] || [];
		if (selected.length === 0) return true; // その軸で絞り込みしていない
		const skillValues = (skill.tags && skill.tags[axis.key]) || [];
		if (skillValues.length === 0) return true; // 万能スキル
		return skillValues.some(v => selected.includes(v));
	});
}

function tagLabel(axisKey, value) {
	const axis = TAG_AXES.find(a => a.key === axisKey);
	if (!axis) return value;
	const opt = axis.options.find(o => o.v === value);
	return opt ? opt.t : value;
}

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

// 破壊的な操作（削除・切り替え等）は確認ダイアログではなく「即実行＋元に戻す」で統一する。
// 複数回さかのぼれるよう、スタック形式で保持する。
//
// 上限は20件とする。理由:
// - このUndoスタックはページ内メモリのみに保持し、localStorageには保存しない
//   （リロードすれば消える、セッション限定の安全網という位置づけ）。
// - 1件あたりのデータ量はスキルID・候補情報・★の一覧程度で、テンプレート/比較シート
//   の保存上限（各10件・候補や★は数十件程度）を踏まえても数十KB規模に収まらないため、
//   件数上限はメモリ容量ではなくUX上の目安として設定している。
// - 20件あれば「まとめて削除しすぎた／切り替えを何度か試した」程度の作業を十分さかのぼれる。
const UNDO_STACK_LIMIT = 20;
let undoStack = [];

function pushUndo(label, restoreFn) {
	undoStack.push({ label, restore: restoreFn });
	if (undoStack.length > UNDO_STACK_LIMIT) undoStack.shift();
	showToast(label);
	renderUndoButton();
}

function performUndo() {
	const entry = undoStack.pop();
	if (!entry) return;
	entry.restore();
	showToast('元に戻しました：' + entry.label);
	renderUndoButton();
}

function renderUndoButton() {
	const btn = document.getElementById('undo-button');
	if (!btn) return;
	if (undoStack.length === 0) { btn.classList.add('hidden'); return; }
	btn.classList.remove('hidden');
	document.getElementById('undo-count-badge').textContent = undoStack.length;
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
	if (name === 'template') renderTemplateTab();
	if (name === 'record') renderRecordTab();
	if (name === 'data') renderDataTab();
}

/* ============================================================
 * スキル選択パネル（テンプレート編集・レコードへのスキル追加で共有）
 * ============================================================ */
function renderPickerFilterAxes(containerId) {
	const el = document.getElementById(containerId);
	el.innerHTML = TAG_AXES.map(axis => {
		const activeCount = picker.filters[axis.key].length;
		const isOpen = picker.axisOpen[axis.key];
		return `
		<details class="bg-slate-50 rounded-xl border border-slate-200" ${isOpen ? 'open' : ''} ontoggle="picker.axisOpen['${axis.key}']=this.open">
			<summary class="text-[11px] text-slate-500 px-3 py-2 cursor-pointer select-none flex items-center justify-between">
				<span>${axis.label}${activeCount > 0 ? ' <span class="text-indigo-600 font-semibold">(' + activeCount + ')</span>' : ''}</span>
				<i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
			</summary>
			<div class="flex flex-wrap gap-1.5 px-3 pb-3">
				${axis.options.map(o => `
					<label class="picker-pill">
						<input type="checkbox" data-axis="${axis.key}" data-value="${o.v}" onchange="onPickerFilterChange(this)" ${picker.filters[axis.key].includes(o.v) ? 'checked' : ''}/>
						<span>${escapeHtml(o.t)}</span>
					</label>
				`).join('')}
			</div>
		</details>
	`;
	}).join('');
	refreshIcons();
}

function onPickerFilterChange(input) {
	const axis = input.dataset.axis, value = input.dataset.value;
	const arr = picker.filters[axis];
	const idx = arr.indexOf(value);
	if (input.checked && idx === -1) arr.push(value);
	if (!input.checked && idx !== -1) arr.splice(idx, 1);
	renderPickerFilterAxes('picker-filter-axes');
	renderPickerResults();
}

function getFilteredPickerPool() {
	const pool = masterSkills.concat((userData.customSkills || []).map(c => ({ id: c.customId, name: c.name, tags: c.tags })));
	return pool.filter(s => !picker.excludeIds.includes(s.id) && matchesFilters(s, picker.filters));
}

function renderPickerResults() {
	const el = document.getElementById('picker-results');
	if (!el) return;
	const filtered = getFilteredPickerPool();
	document.getElementById('picker-result-count').textContent = filtered.length + '件';
	const selectAllBox = document.getElementById('picker-select-all');
	if (selectAllBox) selectAllBox.checked = filtered.length > 0 && filtered.every(s => picker.checked.has(s.id));
	if (filtered.length === 0) {
		el.innerHTML = '<p class="text-xs text-slate-400 p-3">条件に一致するスキルがありません。</p>';
		return;
	}
	el.innerHTML = filtered.map(s => `
		<label class="picker-row">
			<input type="checkbox" value="${escapeHtml(s.id)}" ${picker.checked.has(s.id) ? 'checked' : ''} onchange="onPickerCheck('${escapeHtml(s.id)}', this.checked)"/>
			<span>${escapeHtml(s.name)}</span>
		</label>
	`).join('');
}

function togglePickerSelectAll(checked) {
	const filtered = getFilteredPickerPool();
	filtered.forEach(s => { if (checked) picker.checked.add(s.id); else picker.checked.delete(s.id); });
	renderPickerResults();
}

function onPickerCheck(skillId, checked) {
	if (checked) picker.checked.add(skillId); else picker.checked.delete(skillId);
}

function addCheckedSkillsToTarget() {
	if (picker.checked.size === 0) { showToast('スキルにチェックを入れてください'); return; }
	const ids = Array.from(picker.checked);
	picker.onAdd(ids);
	picker.excludeIds = picker.excludeIds.concat(ids);
	picker.checked.clear();
	renderPickerResults();
}

function openPicker(existingSkillIds, onAdd) {
	picker.filters = {}; TAG_AXES.forEach(a => { picker.filters[a.key] = []; picker.axisOpen[a.key] = a.defaultOpen; });
	picker.checked = new Set();
	picker.excludeIds = existingSkillIds.slice();
	picker.onAdd = onAdd;
	renderPickerFilterAxes('picker-filter-axes');
	renderPickerResults();
	refreshIcons();
}

function addCustomSkillFromPicker() {
	const nameInput = document.getElementById('custom-skill-name');
	const name = (nameInput.value || '').trim();
	if (!name) { showToast('スキル名を入力してください'); return; }
	const totalCustom = (userData.customSkills || []).length;
	const dupe = (userData.customSkills || []).find(c => normalizeForDup(c.name) === normalizeForDup(name));
	if (dupe) {
		if (!confirm('「' + dupe.name + '」という同名のカスタムスキルが既にあります。既存のものを追加対象に使いますか？')) return;
		picker.checked.add(dupe.customId);
		renderPickerResults();
		return;
	}
	if (totalCustom >= CUSTOM_SKILL_SOFT_CAP) {
		if (!confirm('カスタムスキルが' + CUSTOM_SKILL_SOFT_CAP + '件に達しています。それでも追加しますか？（不要なものの整理をおすすめします）')) return;
	}
	const tags = {};
	TAG_AXES.forEach(axis => {
		tags[axis.key] = Array.from(document.querySelectorAll('#custom-skill-tags input[data-axis="' + axis.key + '"]:checked')).map(el => el.dataset.value);
	});
	const customId = uid('custom');
	userData.customSkills.push({ customId, name, tags, createdAt: nowIso() });
	saveUserData();
	nameInput.value = '';
	document.querySelectorAll('#custom-skill-tags input[type="checkbox"]').forEach(el => { el.checked = false; });
	picker.checked.add(customId);
	renderPickerResults();
	showToast('カスタムスキル「' + name + '」を追加しました');
}

function renderCustomSkillTagInputs() {
	const el = document.getElementById('custom-skill-tags');
	if (!el) return;
	el.innerHTML = TAG_AXES.map(axis => `
		<div class="mb-2">
			<p class="text-[11px] text-slate-500 mb-1">${axis.label}</p>
			<div class="flex flex-wrap gap-1.5">
				${axis.options.map(o => `
					<label class="picker-pill">
						<input type="checkbox" data-axis="${axis.key}" data-value="${o.v}"/>
						<span>${escapeHtml(o.t)}</span>
					</label>
				`).join('')}
			</div>
		</div>
	`).join('');
}

/* ============================================================
 * テンプレート（対象スキルセット）
 * ============================================================ */
function renderTemplateTab() {
	if (draftTemplate) {
		document.getElementById('template-list-view').classList.add('hidden');
		document.getElementById('template-editor-view').classList.remove('hidden');
		renderTemplateEditor();
	} else {
		document.getElementById('template-list-view').classList.remove('hidden');
		document.getElementById('template-editor-view').classList.add('hidden');
		renderTemplateList();
	}
}

function renderTemplateList() {
	const list = userData.templates;
	document.getElementById('template-count-badge').textContent = list.length + '/' + TEMPLATE_LIMIT + '件';
	const el = document.getElementById('template-list');
	if (list.length === 0) {
		el.innerHTML = '<p class="text-sm text-slate-400 p-4">まだテンプレートがありません。「新規作成」から始めてください。</p>';
		return;
	}
	el.innerHTML = list.map(t => `
		<div class="list-card">
			<div class="flex-1 min-w-0">
				<p class="font-semibold text-sm text-slate-800 truncate">${escapeHtml(t.name)}</p>
				<p class="text-xs text-slate-500">スキル${t.skillIds.length}件・更新 ${escapeHtml((t.updatedAt || '').slice(0, 10))}</p>
			</div>
			<div class="flex gap-1.5 shrink-0">
				<button onclick="openTemplateEditor('${t.templateId}')" class="icon-btn" title="開く"><i data-lucide="edit" class="w-4 h-4"></i></button>
				<button onclick="duplicateTemplate('${t.templateId}')" class="icon-btn" title="複製"><i data-lucide="copy" class="w-4 h-4"></i></button>
				<button onclick="deleteTemplate('${t.templateId}')" class="icon-btn text-red-500" title="削除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
			</div>
		</div>
	`).join('');
	refreshIcons();
}

function openTemplateEditor(templateId) {
	if (templateId) {
		draftTemplate = userData.templates.find(x => x.templateId === templateId);
	} else {
		if (userData.templates.length >= TEMPLATE_LIMIT) {
			showToast('テンプレートは最大' + TEMPLATE_LIMIT + '件までです。不要なものを削除してください');
			return;
		}
		// 新規テンプレートはこの時点で即座に配列へ追加し、以降は全操作を自動保存する。
		// 名前もスキルも入力されないまま閉じられた場合のみ、closeTemplateEditor側で破棄する。
		draftTemplate = { templateId: uid('tpl'), name: '', skillIds: [], createdAt: nowIso(), updatedAt: nowIso() };
		userData.templates.push(draftTemplate);
		saveUserData();
	}
	renderTemplateTab();
}

function closeTemplateEditor() {
	// スキルが1件も選ばれていない未完成の下書きは、一覧を汚さないよう自動で破棄する。
	if (draftTemplate && draftTemplate.skillIds.length === 0) {
		userData.templates = userData.templates.filter(t => t.templateId !== draftTemplate.templateId);
		saveUserData();
	}
	draftTemplate = null;
	renderTemplateTab();
}

function renderTemplateEditor() {
	document.getElementById('template-name-input').value = draftTemplate.name;
	renderTemplateSelectedList();
}

function onTemplateNameChange() {
	draftTemplate.name = document.getElementById('template-name-input').value;
	draftTemplate.updatedAt = nowIso();
	saveUserData();
	renderTemplateList();
}

function openTemplateSkillPicker() {
	document.getElementById('skill-picker-modal').classList.remove('hidden');
	openPicker(draftTemplate.skillIds, (ids) => {
		ids.forEach(id => { if (!draftTemplate.skillIds.includes(id)) draftTemplate.skillIds.push(id); });
		draftTemplate.updatedAt = nowIso();
		saveUserData();
		renderTemplateSelectedList();
	});
}

function renderTemplateSelectedList() {
	const el = document.getElementById('template-selected-list');
	document.getElementById('template-selected-count').textContent = draftTemplate.skillIds.length + '';
	if (draftTemplate.skillIds.length === 0) {
		el.innerHTML = '<p class="text-xs text-slate-400">まだスキルが選択されていません。</p>';
		return;
	}
	el.innerHTML = draftTemplate.skillIds.map(id => `
		<span class="chip">${escapeHtml(getSkillName(id))}
			<button onclick="removeSkillFromTemplate('${escapeHtml(id)}')" class="ml-1" aria-label="削除"><i data-lucide="x" class="w-3 h-3"></i></button>
		</span>
	`).join('');
	refreshIcons();
}

function removeSkillFromTemplate(skillId) {
	const idx = draftTemplate.skillIds.indexOf(skillId);
	if (idx === -1) return;
	const name = getSkillName(skillId);
	const targetTemplate = draftTemplate;
	targetTemplate.skillIds.splice(idx, 1);
	targetTemplate.updatedAt = nowIso();
	saveUserData();
	picker.excludeIds = picker.excludeIds.filter(id => id !== skillId);
	renderTemplateSelectedList();
	renderPickerResults();
	pushUndo('スキル「' + name + '」を削除しました', () => {
		targetTemplate.skillIds.splice(idx, 0, skillId);
		saveUserData();
		renderAll();
	});
}

function duplicateTemplate(templateId) {
	if (userData.templates.length >= TEMPLATE_LIMIT) { showToast('テンプレートは最大' + TEMPLATE_LIMIT + '件までです'); return; }
	const t = userData.templates.find(x => x.templateId === templateId);
	userData.templates.push({ templateId: uid('tpl'), name: t.name + '（コピー）', skillIds: t.skillIds.slice(), createdAt: nowIso(), updatedAt: nowIso() });
	saveUserData();
	renderTemplateList();
	showToast('複製しました');
}

function deleteTemplate(templateId) {
	const idx = userData.templates.findIndex(x => x.templateId === templateId);
	if (idx === -1) return;
	const removed = userData.templates[idx];
	userData.templates.splice(idx, 1);
	saveUserData();
	renderTemplateList();
	pushUndo('テンプレート「' + removed.name + '」を削除しました', () => {
		userData.templates.splice(idx, 0, removed);
		saveUserData();
		renderAll();
	});
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
	if (userData.records.length >= RECORD_LIMIT) {
		showToast('比較シートは最大' + RECORD_LIMIT + '件までです。不要なものを削除してください');
		return;
	}
	const templateId = document.getElementById('record-new-template-select').value;
	const t = userData.templates.find(x => x.templateId === templateId);
	if (!t) { showToast('テンプレートを選択してください'); return; }
	const record = {
		recordId: uid('rec'), name: t.name + ' 候補比較', sourceTemplateId: t.templateId,
		skillIds: t.skillIds.slice(), candidates: [], cells: {}, createdAt: nowIso(), updatedAt: nowIso()
	};
	userData.records.push(record);
	saveUserData();
	openRecordEditor(record.recordId);
}

function openRecordEditor(recordId) {
	draftRecord = userData.records.find(x => x.recordId === recordId);
	normalizeCandidateEnabled(draftRecord);
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
	if (!hasCurrent) options.unshift(`<option value="${draftRecord.sourceTemplateId || ''}" disabled selected>（削除済みテンプレート）</option>`);
	sel.innerHTML = options.join('');
	sel.value = draftRecord.sourceTemplateId || '';
	renderRecordGrid();
}

function onRecordNameChange() {
	draftRecord.name = document.getElementById('record-name-input').value;
	persistDraftRecord();
}

const MAX_ENABLED_CANDIDATES = 6;

function countEnabledCandidates() {
	return draftRecord.candidates.filter(c => c.enabled).length;
}

// 既存データ（enabledフィールド導入前に作られた比較シート）を開いた際、
// 7人目以降が全員「有効」扱いにならないよう、先頭から6人までを有効とみなして正規化する。
function normalizeCandidateEnabled(record) {
	let enabledSeen = 0;
	let changed = false;
	record.candidates.forEach(c => {
		if (c.enabled === undefined) { c.enabled = true; changed = true; }
		if (c.enabled) {
			enabledSeen++;
			if (enabledSeen > MAX_ENABLED_CANDIDATES) { c.enabled = false; changed = true; }
		}
	});
	if (changed) saveUserData();
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
		html += `<th class="sticky-header ${c.enabled ? '' : 'col-disabled'}">
			<div class="flex items-center justify-center gap-1">
				<input type="checkbox" ${c.enabled ? 'checked' : ''} onchange="toggleCandidateEnabled('${c.candidateId}')" title="比較対象（有効）にする"/>
				<span class="truncate">${escapeHtml(c.label)}</span>
				<button onclick="removeCandidate('${c.candidateId}')" aria-label="この候補を削除"><i data-lucide="x" class="w-3 h-3"></i></button>
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
			'<td class="sticky-col"><div class="flex items-center justify-between gap-1"><span class="truncate">' + escapeHtml(getSkillName(skillId)) + '</span>' +
			'<button onclick="removeSkillFromRecord(\'' + escapeHtml(skillId) + '\')" aria-label="この行を削除"><i data-lucide="x" class="w-3 h-3 text-slate-400"></i></button></div></td>' +
			'<td class="sticky-col2"><span id="sum-' + escapeHtml(skillId) + '" class="sum-badge" title="有効な候補の★合計">' + sum + '</span></td>';
		candidates.forEach(c => {
			const v = (draftRecord.cells[skillId] && draftRecord.cells[skillId][c.candidateId]) || 0;
			html += `<td class="${c.enabled ? '' : 'col-disabled'}"><div class="star-cell">
				<button onclick="adjustStar('${escapeHtml(skillId)}','${c.candidateId}',-1)" aria-label="星を減らす">-</button>
				<span id="star-${escapeHtml(skillId)}-${c.candidateId}">${v}</span>
				<button onclick="adjustStar('${escapeHtml(skillId)}','${c.candidateId}',1)" aria-label="星を増やす">+</button>
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
	document.getElementById('skill-picker-modal').classList.remove('hidden');
	openPicker(draftRecord.skillIds, (ids) => {
		ids.forEach(id => { if (!draftRecord.skillIds.includes(id)) draftRecord.skillIds.push(id); });
		persistDraftRecord();
		renderRecordGrid();
	});
}

function closeSkillPickerModal() {
	document.getElementById('skill-picker-modal').classList.add('hidden');
}

function duplicateRecord(recordId) {
	if (userData.records.length >= RECORD_LIMIT) { showToast('比較シートは最大' + RECORD_LIMIT + '件までです'); return; }
	const r = userData.records.find(x => x.recordId === recordId);
	const copy = JSON.parse(JSON.stringify(r));
	copy.recordId = uid('rec'); copy.name = r.name + '（コピー）'; copy.createdAt = nowIso(); copy.updatedAt = nowIso();
	normalizeCandidateEnabled(copy);
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
	userData = parsed;
	userData.customSkills = userData.customSkills || [];
	saveUserData();
	draftTemplate = null; draftRecord = null;
	renderAll();
	showToast('インポートしました');
}

async function refreshMasterData() {
	showToast('マスターデータを再取得しています…');
	await loadMasterSkills(true);
	renderDataTab();
	showToast('マスターデータを更新しました（' + masterSkills.length + '件）');
}

/* ============================================================
 * 初期化
 * ============================================================ */
function renderAll() {
	renderTemplateTab();
	renderRecordTab();
	renderDataTab();
}

async function initApp() {
	document.getElementById('js-version-note').textContent = 'js ' + UMA_SKILL_DECK_JS_VERSION;
	userData = loadUserData();
	await loadMasterSkills(false);
	renderCustomSkillTagInputs();
	renderAll();
	refreshIcons();
}

document.addEventListener('DOMContentLoaded', initApp);
