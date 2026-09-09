/**
 * uma-skill-deck-core.js
 * UmaSkill Deck のデータ層・テンプレート管理UI・レコード書き込みロジックの共有モジュール。
 *
 * 設計方針:
 * - uma-skill-deck.html（UmaSkill Deck本体）と special.html（UmaStar OCRのDeck連携モード）の
 *   両方から読み込まれる。どちらの画面からテンプレートを編集しても同じ localStorage を見るため、
 *   変更は常に双方へ反映される。
 * - **ツール非依存**: このモジュールはOCRのことも「親A/祖A1」といった家系の概念も知らない。
 *   呼び出し元からは「候補ラベル」と「スキルID→★」の対応だけを受け取る。
 *   将来 exam.html から使う場合も、このAPIをそのまま再利用できるようにするための制約。
 * - グローバルを1つ（UmaSkillDeckCore）だけ公開する。special.html / common.js には
 *   escapeHtml・showToast など同名の関数が既にあるため、名前の衝突を避ける必要がある。
 * - このモジュールが生成するHTMLにはインラインの onclick を書かない
 *   （呼び出し元ページのグローバル関数に依存しないようにするため）。
 *   代わりに data-usd-act 属性 + イベント委譲で処理する。
 */
(function (global) {
	'use strict';

	// このファイルの版。HTML側の ?v= クエリとの3点一致を納品前にgrepで確認する（B節ルール4）。
	// common.js・uma-skill-deck.js とは独立した番台。
	const UMA_SKILL_DECK_CORE_JS_VERSION = '2026-09-10a';

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
	const MAX_ENABLED_CANDIDATES = 6;
	const UNDO_STACK_LIMIT = 20;

	// 7軸のタグ辞書。フィルターパネル・タグ表示・カスタムスキル入力で共有する。
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
		{ key: 'environment', label: '⑥その他1（レース環境）', defaultOpen: false, options: [
			{ v: 'ground_good', t: '良バ場' }, { v: 'ground_bad', t: '道悪' },
			{ v: 'surface_turf', t: '芝' }, { v: 'surface_dirt', t: 'ダート' },
			{ v: 'right_turn', t: '右回り' }, { v: 'left_turn', t: '左回り' }, { v: 'small_track', t: '小回り' }, { v: 'straight_course', t: '直線コース' },
			{ v: 'weather_sunny', t: '晴れ' }, { v: 'weather_cloudy', t: '曇り' }, { v: 'weather_rain', t: '雨' }, { v: 'weather_snow', t: '雪' },
			{ v: 'season_spring', t: '春' }, { v: 'season_summer', t: '夏' }, { v: 'season_autumn', t: '秋' }, { v: 'season_winter', t: '冬' },
			{ v: 'time_day', t: '昼' }, { v: 'time_evening', t: '夕方' }, { v: 'time_night', t: 'ナイター' },
			{ v: 'distance_basis', t: '根幹距離' }, { v: 'distance_nonbasis', t: '非根幹距離' }
		]},
		{ key: 'trackVenue', label: '⑦その他2（レース場）', defaultOpen: false, options: [
			{ v: 'track_sapporo', t: '札幌' }, { v: 'track_hakodate', t: '函館' }, { v: 'track_fukushima', t: '福島' }, { v: 'track_niigata', t: '新潟' },
			{ v: 'track_nakayama', t: '中山' }, { v: 'track_tokyo', t: '東京' }, { v: 'track_chukyo', t: '中京' }, { v: 'track_kyoto', t: '京都' },
			{ v: 'track_hanshin', t: '阪神' }, { v: 'track_kokura', t: '小倉' },
			{ v: 'track_oi', t: '大井' }, { v: 'track_kawasaki', t: '川崎' }, { v: 'track_funabashi', t: '船橋' }, { v: 'track_morioka', t: '盛岡' },
			{ v: 'track_longchamp', t: 'ロンシャン' }, { v: 'track_santaanita', t: 'サンタアニタパーク' }, { v: 'track_delmar', t: 'デルマー' }
		]}
	];

	// フェッチに失敗した場合のみ使うサンプルデータ（uma-skill-deck-skills.json が
	// まだ未公開/未配置の環境でも動作確認できるようにするための最終フォールバック）。
	const SAMPLE_MASTER_SKILLS = { masterVersion: 'embedded-sample', skills: [
		{ id: '1', name: '右回り○', tags: { distance: [], style: [], phase: [], coursePos: [], environment: ['right_turn'], trackVenue: [], effect: ['speed_up'] } },
		{ id: '21', name: '積極策', tags: { distance: ['mile'], style: [], phase: ['mid'], coursePos: [], environment: [], trackVenue: [], effect: ['target_speed_up'] } },
		{ id: '26', name: '集中力', tags: { distance: [], style: [], phase: [], coursePos: [], environment: [], trackVenue: [], effect: ['start_good'] } }
	]};

	/* ============================================================
	 * 状態
	 * ============================================================ */
	let userData = null;
	let masterSkills = [];
	let masterMeta = { version: '', fetchedAt: '' };

	// 呼び出し元ページから差し込む入出力（トースト・確認ダイアログ）。
	// 既定値を持たせておくことで、設定し忘れても動作は壊れない。
	let config = {
		toast: function () { /* 呼び出し元が configure() で差し込む */ },
		confirm: function (msg) { return global.confirm(msg); }
	};

	/* ============================================================
	 * ユーティリティ
	 * ============================================================ */
	function uid(prefix) {
		return prefix + '_' + Math.random().toString(36).slice(2, 8);
	}

	function esc(s) {
		return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	}

	function normalizeForDup(s) {
		return String(s).normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
	}

	function nowIso() {
		return new Date().toISOString();
	}

	function refreshIcons() {
		if (global.lucide) global.lucide.createIcons();
	}

	function toast(msg) {
		config.toast(msg);
	}

	function confirmDialog(msg) {
		return config.confirm(msg);
	}

	/* ============================================================
	 * userData（保存データ）の読み書き
	 * ============================================================ */
	function createEmptyUserData() {
		return { schemaVersion: 1, templates: [], records: [], customSkills: [] };
	}

	function loadUserData() {
		try {
			const raw = global.localStorage.getItem(STORAGE_KEY_USER);
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
			global.localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));
		} catch (e) {
			toast('保存に失敗しました（ブラウザのストレージ容量を確認してください）');
		}
	}

	function ensureUserData() {
		if (!userData) userData = loadUserData();
		return userData;
	}

	function replaceUserData(next) {
		userData = next || createEmptyUserData();
		userData.templates = userData.templates || [];
		userData.records = userData.records || [];
		userData.customSkills = userData.customSkills || [];
		saveUserData();
	}

	/* ============================================================
	 * マスターデータの取得・キャッシュ
	 * ============================================================ */
	// 実体は common.js の汎用フェッチ関数（fetchSkillMasterJson）に委譲する。
	// uma-skill-deck.html は common.js（OCR用の重いファイル）を読み込まないため、
	// 未ロードのときだけ同等の最小実装にフォールバックする。
	async function fetchMasterJson(url, cacheBust) {
		if (typeof global.fetchSkillMasterJson === 'function') {
			return await global.fetchSkillMasterJson(url, { cacheBust: cacheBust });
		}
		const res = await global.fetch(cacheBust ? (url + '?t=' + Date.now()) : url);
		if (!res.ok) throw new Error('HTTP ' + res.status);
		return await res.json();
	}

	async function loadMasterSkills(forceRefresh, masterJsonPath) {
		const url = masterJsonPath || MASTER_JSON_PATH;
		try {
			const data = await fetchMasterJson(url, !!forceRefresh);
			masterSkills = data.skills || [];
			masterMeta = { version: data.masterVersion || '', fetchedAt: nowIso() };
			try { global.localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify({ data: data, fetchedAt: masterMeta.fetchedAt })); } catch (e) {}
			return true;
		} catch (e) {
			// フェッチ失敗時はキャッシュ→組み込みサンプルの順でフォールバックする。
			try {
				const cached = JSON.parse(global.localStorage.getItem(STORAGE_KEY_MASTER) || 'null');
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
		const c = (ensureUserData().customSkills || []).find(s => s.customId === skillId);
		if (c) return { id: c.customId, name: c.name, tags: c.tags };
		return null;
	}

	function getSkillName(skillId) {
		const s = findSkill(skillId);
		return s ? s.name : '（不明なスキル：' + skillId + '）';
	}

	function getSkillTags(skillId) {
		const s = findSkill(skillId);
		return s ? s.tags : { distance: [], style: [], phase: [], coursePos: [], environment: [], trackVenue: [], effect: [] };
	}

	// スキルID配列 → [{ id, name }]（順序はID配列のまま）。
	// 呼び出し元（OCRツール）に「照合対象のスキル名」を渡し、結果をIDへ戻すために使う。
	// このモジュールがOCRの都合を知らずに済むよう、名前とIDの対応だけを返す。
	function getSkillEntries(skillIds) {
		return (skillIds || []).map(id => ({ id: id, name: getSkillName(id) }));
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
	 * Undo
	 * ============================================================ */
	// 破壊的な操作（削除・切り替え等）は確認ダイアログではなく「即実行＋元に戻す」で統一する。
	// 複数回さかのぼれるよう、スタック形式で保持する。
	//
	// 上限は20件とする。理由:
	// - このUndoスタックはページ内メモリのみに保持し、localStorageには保存しない
	//   （リロードすれば消える、セッション限定の安全網という位置づけ）。
	// - 20件あれば「まとめて削除しすぎた／切り替えを何度か試した」程度の作業を十分さかのぼれる。
	let undoStack = [];
	const undoListeners = [];

	function notifyUndoChanged() {
		undoListeners.forEach(fn => { try { fn(undoStack.length); } catch (e) {} });
	}

	function pushUndo(label, restoreFn) {
		undoStack.push({ label: label, restore: restoreFn });
		if (undoStack.length > UNDO_STACK_LIMIT) undoStack.shift();
		toast(label);
		notifyUndoChanged();
	}

	function performUndo() {
		const entry = undoStack.pop();
		if (!entry) return false;
		entry.restore();
		toast('元に戻しました：' + entry.label);
		notifyUndoChanged();
		return true;
	}

	function onUndoChanged(fn) {
		undoListeners.push(fn);
		fn(undoStack.length);
	}

	/* ============================================================
	 * スタイル（1回だけ<head>へ注入する）
	 * ============================================================ */
	// このモジュールが生成するマークアップ専用のクラス。既存ページのクラス名
	// （.list-card / .chip 等）と衝突させないため usd- を接頭辞にする。
	// 見た目は uma-skill-deck.html の既存デザインと同一。
	const CORE_STYLES = [
		// uma-skill-deck.html の既存デザインと同じ宣言。クラス名だけ usd- 接頭辞に変えて、
		// 読み込み先ページのクラス（.list-card / .chip 等）と衝突しないようにしている。
		'.usd-list-card { display: flex; align-items: center; gap: .75rem; padding: .75rem 1rem; border: 1px solid #e2e8f0; border-radius: .75rem; background: #fff; margin-bottom: .5rem; }',
		'.usd-list-card.usd-selectable { cursor: pointer; }',
		'.usd-list-card.usd-selected { border-color: #a5b4fc; background: #eef2ff; }',
		'.usd-icon-btn { padding: .375rem; border-radius: .5rem; color: #64748b; cursor: pointer; }',
		'.usd-icon-btn:hover { background: #f1f5f9; }',
		'.usd-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; background: #eef2ff; color: #4338ca; border-radius: 999px; font-size: 12px; }',
		'.usd-pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border: 1px solid #e2e8f0; border-radius: 999px; font-size: 11px; cursor: pointer; background: #fff; }',
		'.usd-row { display: flex; align-items: center; gap: 8px; padding: 6px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; cursor: pointer; }',
		'.usd-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
		// uma-skill-deck.html では input の見た目がページ側CSSで一括指定されているが、
		// special.html にはその指定がないため、モジュール側にも同じものを用意しておく。
		'.usd-input { border: 1px solid #e2e8f0; border-radius: .5rem; padding: .5rem .75rem; font-size: .875rem; width: 100%; background: #fff; }',
		// 既存の .glass-card 相当（テンプレート編集パネル・モーダルの下地）
		'.usd-panel { background: rgba(255,255,255,0.9); backdrop-filter: blur(14px); }',
		'.usd-modal { position: fixed; inset: 0; background: rgba(15,23,42,.4); z-index: 80; display: flex; align-items: flex-end; justify-content: center; }',
		'.usd-modal[hidden] { display: none !important; }',
		'.usd-modal-panel { background: rgba(255,255,255,.9); backdrop-filter: blur(14px); width: 100%; max-width: 42rem; border-radius: 1rem 1rem 0 0; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; }',
		'@media (min-width: 768px) { .usd-modal-panel { border-radius: 1rem; margin-bottom: 1.5rem; } }'
	].join('\n');

	let stylesInjected = false;
	function injectStyles() {
		if (stylesInjected) return;
		stylesInjected = true;
		const style = document.createElement('style');
		style.setAttribute('data-usd-styles', '');
		style.textContent = CORE_STYLES;
		document.head.appendChild(style);
	}

	/* ============================================================
	 * スキル選択パネル（モーダル。テンプレート編集・比較シートへのスキル追加で共有）
	 * ============================================================ */
	// モーダルはページに1つだけ生成し、開くたびに状態を作り直す。
	let pickerEl = null;
	let picker = { filters: {}, checked: new Set(), onAdd: null, excludeIds: [], axisOpen: {} };

	function pickerMarkup() {
		return '' +
			'<div class="usd-modal-panel">' +
				'<div class="flex items-center justify-between p-4 border-b border-slate-200" style="flex-shrink:0;">' +
					'<p class="text-sm font-semibold text-slate-700">スキルを選ぶ（軸間はAND・軸内はOR）</p>' +
					'<button type="button" class="usd-icon-btn" data-usd-act="picker-close" aria-label="閉じる"><i data-lucide="x" class="w-4 h-4"></i></button>' +
				'</div>' +
				'<div class="p-4" style="overflow:auto;">' +
					'<div data-usd-el="filter-axes" class="grid grid-cols-1 gap-2 mb-3"></div>' +
					'<div class="flex items-center justify-between mb-1">' +
						'<label class="flex items-center gap-1.5 text-xs text-slate-600">' +
							'<input type="checkbox" data-usd-act="picker-select-all"/> 表示中を全て選択' +
						'</label>' +
						'<p class="text-xs text-slate-500">絞り込み結果（<span data-usd-el="result-count">0件</span>）</p>' +
					'</div>' +
					'<div data-usd-el="results" style="border:1px solid #e2e8f0;border-radius:.75rem;max-height:280px;overflow:auto;margin-bottom:10px;"></div>' +
					'<button type="button" class="w-full px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold mb-4" data-usd-act="picker-add">チェックしたスキルを追加</button>' +
					'<details class="border-t border-slate-200 pt-3">' +
						'<summary class="text-xs font-semibold text-slate-600 cursor-pointer">マスターにないスキルを手入力で追加</summary>' +
						'<div class="mt-3">' +
							'<input type="text" class="usd-input mb-2" data-usd-el="custom-name" placeholder="スキル名"/>' +
							'<div data-usd-el="custom-tags"></div>' +
							'<button type="button" class="mt-2 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold" data-usd-act="custom-add">カスタムスキルとして追加</button>' +
						'</div>' +
					'</details>' +
				'</div>' +
			'</div>';
	}

	function ensurePicker() {
		if (pickerEl) return pickerEl;
		injectStyles();
		pickerEl = document.createElement('div');
		pickerEl.className = 'usd-modal';
		pickerEl.hidden = true;
		pickerEl.innerHTML = pickerMarkup();
		document.body.appendChild(pickerEl);

		pickerEl.addEventListener('click', (e) => {
			// 背景（パネル外）のクリックで閉じる
			if (e.target === pickerEl) { closePicker(); return; }
			const btn = e.target.closest('[data-usd-act]');
			if (!btn || !pickerEl.contains(btn)) return;
			const act = btn.dataset.usdAct;
			if (act === 'picker-close') closePicker();
			else if (act === 'picker-add') addCheckedSkills();
			else if (act === 'custom-add') addCustomSkillFromPicker();
		});
		pickerEl.addEventListener('change', (e) => {
			const el = e.target;
			if (el.dataset.usdAct === 'picker-select-all') { togglePickerSelectAll(el.checked); return; }
			if (el.dataset.usdEl === 'filter-check') { onPickerFilterChange(el); return; }
			if (el.dataset.usdEl === 'skill-check') { onPickerCheck(el.value, el.checked); return; }
		});
		renderCustomSkillTagInputs();
		return pickerEl;
	}

	function q(root, name) {
		return root.querySelector('[data-usd-el="' + name + '"]');
	}

	function renderPickerFilterAxes() {
		const el = q(pickerEl, 'filter-axes');
		el.innerHTML = TAG_AXES.map(axis => {
			const activeCount = picker.filters[axis.key].length;
			const isOpen = picker.axisOpen[axis.key];
			return '' +
			'<details class="bg-slate-50 rounded-xl border border-slate-200" data-usd-axis="' + axis.key + '"' + (isOpen ? ' open' : '') + '>' +
				'<summary class="text-[11px] text-slate-500 px-3 py-2 cursor-pointer select-none flex items-center justify-between">' +
					'<span>' + axis.label + (activeCount > 0 ? ' <span class="text-indigo-600 font-semibold">(' + activeCount + ')</span>' : '') + '</span>' +
					'<i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>' +
				'</summary>' +
				'<div class="flex flex-wrap gap-1.5 px-3 pb-3">' +
					axis.options.map(o =>
						'<label class="usd-pill">' +
							'<input type="checkbox" data-usd-el="filter-check" data-axis="' + axis.key + '" data-value="' + esc(o.v) + '"' + (picker.filters[axis.key].includes(o.v) ? ' checked' : '') + '/>' +
							'<span>' + esc(o.t) + '</span>' +
						'</label>'
					).join('') +
				'</div>' +
			'</details>';
		}).join('');
		// toggle イベントはバブリングしないため、委譲ではなく個別に張る。
		el.querySelectorAll('details[data-usd-axis]').forEach(d => {
			d.addEventListener('toggle', () => { picker.axisOpen[d.dataset.usdAxis] = d.open; });
		});
		refreshIcons();
	}

	function onPickerFilterChange(input) {
		const axis = input.dataset.axis, value = input.dataset.value;
		const arr = picker.filters[axis];
		const idx = arr.indexOf(value);
		if (input.checked && idx === -1) arr.push(value);
		if (!input.checked && idx !== -1) arr.splice(idx, 1);
		renderPickerFilterAxes();
		renderPickerResults();
	}

	function getFilteredPickerPool() {
		const pool = masterSkills.concat((ensureUserData().customSkills || []).map(c => ({ id: c.customId, name: c.name, tags: c.tags })));
		return pool.filter(s => !picker.excludeIds.includes(s.id) && matchesFilters(s, picker.filters));
	}

	function renderPickerResults() {
		if (!pickerEl) return;
		const el = q(pickerEl, 'results');
		if (!el) return;
		const filtered = getFilteredPickerPool();
		q(pickerEl, 'result-count').textContent = filtered.length + '件';
		const selectAllBox = pickerEl.querySelector('[data-usd-act="picker-select-all"]');
		if (selectAllBox) selectAllBox.checked = filtered.length > 0 && filtered.every(s => picker.checked.has(s.id));
		if (filtered.length === 0) {
			el.innerHTML = '<p class="text-xs text-slate-400 p-3">条件に一致するスキルがありません。</p>';
			return;
		}
		el.innerHTML = filtered.map(s =>
			'<label class="usd-row">' +
				'<input type="checkbox" data-usd-el="skill-check" value="' + esc(s.id) + '"' + (picker.checked.has(s.id) ? ' checked' : '') + '/>' +
				'<span>' + esc(s.name) + '</span>' +
			'</label>'
		).join('');
	}

	function togglePickerSelectAll(checked) {
		const filtered = getFilteredPickerPool();
		filtered.forEach(s => { if (checked) picker.checked.add(s.id); else picker.checked.delete(s.id); });
		renderPickerResults();
	}

	function onPickerCheck(skillId, checked) {
		if (checked) picker.checked.add(skillId); else picker.checked.delete(skillId);
	}

	function addCheckedSkills() {
		if (picker.checked.size === 0) { toast('スキルにチェックを入れてください'); return; }
		const ids = Array.from(picker.checked);
		if (picker.onAdd) picker.onAdd(ids);
		picker.excludeIds = picker.excludeIds.concat(ids);
		picker.checked.clear();
		renderPickerResults();
	}

	function renderCustomSkillTagInputs() {
		const el = q(pickerEl, 'custom-tags');
		if (!el) return;
		el.innerHTML = TAG_AXES.map(axis =>
			'<div class="mb-2">' +
				'<p class="text-[11px] text-slate-500 mb-1">' + axis.label + '</p>' +
				'<div class="flex flex-wrap gap-1.5">' +
					axis.options.map(o =>
						'<label class="usd-pill">' +
							'<input type="checkbox" data-usd-el="custom-tag" data-axis="' + axis.key + '" data-value="' + esc(o.v) + '"/>' +
							'<span>' + esc(o.t) + '</span>' +
						'</label>'
					).join('') +
				'</div>' +
			'</div>'
		).join('');
	}

	function addCustomSkillFromPicker() {
		const nameInput = q(pickerEl, 'custom-name');
		const name = (nameInput.value || '').trim();
		if (!name) { toast('スキル名を入力してください'); return; }
		const data = ensureUserData();
		const totalCustom = (data.customSkills || []).length;
		const dupe = (data.customSkills || []).find(c => normalizeForDup(c.name) === normalizeForDup(name));
		if (dupe) {
			if (!confirmDialog('「' + dupe.name + '」という同名のカスタムスキルが既にあります。既存のものを追加対象に使いますか？')) return;
			picker.checked.add(dupe.customId);
			renderPickerResults();
			return;
		}
		if (totalCustom >= CUSTOM_SKILL_SOFT_CAP) {
			if (!confirmDialog('カスタムスキルが' + CUSTOM_SKILL_SOFT_CAP + '件に達しています。それでも追加しますか？（不要なものの整理をおすすめします）')) return;
		}
		const tags = {};
		TAG_AXES.forEach(axis => {
			tags[axis.key] = Array.from(pickerEl.querySelectorAll('[data-usd-el="custom-tag"][data-axis="' + axis.key + '"]'))
				.filter(el => el.checked).map(el => el.dataset.value);
		});
		const customId = uid('custom');
		data.customSkills.push({ customId: customId, name: name, tags: tags, createdAt: nowIso() });
		saveUserData();
		nameInput.value = '';
		pickerEl.querySelectorAll('[data-usd-el="custom-tag"]').forEach(el => { el.checked = false; });
		picker.checked.add(customId);
		renderPickerResults();
		toast('カスタムスキル「' + name + '」を追加しました');
	}

	/**
	 * スキル選択モーダルを開く（ツール非依存）。
	 * existingSkillIds: 既に選択済みで一覧から除外したいID
	 * onAdd: 追加が押されたときに呼ばれる。引数は追加されたIDの配列。
	 */
	function openSkillPicker(existingSkillIds, onAdd) {
		ensurePicker();
		picker.filters = {};
		picker.axisOpen = {};
		TAG_AXES.forEach(a => { picker.filters[a.key] = []; picker.axisOpen[a.key] = a.defaultOpen; });
		picker.checked = new Set();
		picker.excludeIds = (existingSkillIds || []).slice();
		picker.onAdd = onAdd;
		pickerEl.hidden = false;
		renderPickerFilterAxes();
		renderPickerResults();
		refreshIcons();
	}

	function closePicker() {
		if (pickerEl) pickerEl.hidden = true;
	}

	/* ============================================================
	 * テンプレート管理UI（一覧・作成・編集・削除）
	 *
	 * 呼び出し元は「空のコンテナ要素」を1つ渡すだけでよい。中身の描画・
	 * イベント処理はすべてこのモジュールが持つため、uma-skill-deck.html と
	 * special.html で同じ挙動・同じ見た目になる。
	 * ============================================================ */

	/**
	 * options:
	 *   selectable        … true にすると各テンプレートにラジオが付き、1つを選択できる（special.html用）
	 *   onSelectionChange … 選択が変わったとき fn(templateId|null)
	 *   onChange          … テンプレート/カスタムスキルが変化したとき fn()
	 *   onViewChange      … 一覧⇄編集が切り替わったとき fn('list'|'editor')
	 */
	function createTemplateManager(container, options) {
		injectStyles();
		const opts = options || {};
		const selectable = !!opts.selectable;
		let draftTemplate = null;  // 編集中のテンプレート（userData.templates内の実体を指す）
		let selectedTemplateId = null;

		container.innerHTML = '' +
			'<div data-usd-el="list-view">' +
				'<div class="flex items-center justify-between mb-3">' +
					'<button type="button" class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold" data-usd-act="template-new">＋ 新規作成</button>' +
					'<span class="text-xs text-slate-500" data-usd-el="count-badge"></span>' +
				'</div>' +
				'<div data-usd-el="list"></div>' +
			'</div>' +
			'<div data-usd-el="editor-view" class="usd-panel rounded-2xl border border-slate-200 p-4" hidden>' +
				'<div class="flex items-center gap-2 mb-3">' +
					'<button type="button" class="usd-icon-btn" data-usd-act="editor-close" aria-label="戻る"><i data-lucide="arrow-left" class="w-4 h-4"></i></button>' +
					'<input type="text" class="usd-input flex-1" data-usd-el="name-input" placeholder="テンプレート名（例：マイルCS想定）"/>' +
				'</div>' +
				'<button type="button" class="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold mb-3" data-usd-act="editor-pick">' +
					'<i data-lucide="filter" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> スキルを追加' +
				'</button>' +
				'<p class="text-xs text-slate-500 mb-1">選択済みスキル（<span data-usd-el="selected-count">0</span>）</p>' +
				'<div data-usd-el="selected-list" class="flex flex-wrap gap-2"></div>' +
				'<p class="text-[11px] text-slate-400 mt-4">変更は自動的に保存されます。</p>' +
			'</div>';

		const listView = q(container, 'list-view');
		const editorView = q(container, 'editor-view');
		const nameInput = q(container, 'name-input');

		container.addEventListener('click', (e) => {
			const btn = e.target.closest('[data-usd-act]');
			if (!btn || !container.contains(btn)) return;
			const act = btn.dataset.usdAct;
			if (act === 'template-new') openEditor(null);
			else if (act === 'editor-close') closeEditor();
			else if (act === 'editor-pick') openEditorPicker();
			else if (act === 'template-open') openEditor(btn.dataset.templateId);
			else if (act === 'template-duplicate') duplicateTemplate(btn.dataset.templateId);
			else if (act === 'template-delete') deleteTemplate(btn.dataset.templateId);
			else if (act === 'template-skill-remove') removeSkillFromTemplate(btn.dataset.skillId);
		});
		container.addEventListener('change', (e) => {
			if (e.target === nameInput) { onNameChange(); return; }
			if (e.target.dataset.usdEl === 'template-radio') { setSelectedTemplateId(e.target.value); return; }
		});

		function fireChange() {
			if (opts.onChange) opts.onChange();
		}

		function fireViewChange(view) {
			if (opts.onViewChange) opts.onViewChange(view);
		}

		function render() {
			const editing = !!draftTemplate;
			listView.hidden = editing;
			editorView.hidden = !editing;
			if (editing) renderEditor(); else renderList();
			fireViewChange(editing ? 'editor' : 'list');
		}

		function renderList() {
			const list = ensureUserData().templates;
			q(container, 'count-badge').textContent = list.length + '/' + TEMPLATE_LIMIT + '件';
			const el = q(container, 'list');
			if (list.length === 0) {
				el.innerHTML = '<p class="text-sm text-slate-400 p-4">まだテンプレートがありません。「新規作成」から始めてください。</p>';
				return;
			}
			// 削除済みテンプレートが選ばれたままにならないよう掃除する
			if (selectedTemplateId && !list.some(t => t.templateId === selectedTemplateId)) {
				selectedTemplateId = null;
				if (opts.onSelectionChange) opts.onSelectionChange(null);
			}
			el.innerHTML = list.map(t => {
				const isSel = selectable && t.templateId === selectedTemplateId;
				const radio = selectable
					? '<input type="radio" name="usd-tpl-' + esc(container.id || 'panel') + '" data-usd-el="template-radio" value="' + esc(t.templateId) + '"' + (isSel ? ' checked' : '') + ' class="shrink-0"/>'
					: '';
				const tag = selectable ? ' usd-selectable' + (isSel ? ' usd-selected' : '') : '';
				return '' +
				'<label class="usd-list-card' + tag + '">' +
					radio +
					'<div class="flex-1 min-w-0">' +
						'<p class="font-semibold text-sm text-slate-800 usd-truncate">' + esc(t.name || '（名称未設定）') + '</p>' +
						'<p class="text-xs text-slate-500">スキル' + t.skillIds.length + '件・更新 ' + esc((t.updatedAt || '').slice(0, 10)) + '</p>' +
					'</div>' +
					'<div class="flex gap-1.5 shrink-0">' +
						'<button type="button" class="usd-icon-btn" data-usd-act="template-open" data-template-id="' + esc(t.templateId) + '" title="開く"><i data-lucide="edit" class="w-4 h-4"></i></button>' +
						'<button type="button" class="usd-icon-btn" data-usd-act="template-duplicate" data-template-id="' + esc(t.templateId) + '" title="複製"><i data-lucide="copy" class="w-4 h-4"></i></button>' +
						'<button type="button" class="usd-icon-btn text-red-500" data-usd-act="template-delete" data-template-id="' + esc(t.templateId) + '" title="削除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' +
					'</div>' +
				'</label>';
			}).join('');
			refreshIcons();
		}

		function renderEditor() {
			nameInput.value = draftTemplate.name;
			renderSelectedList();
		}

		function renderSelectedList() {
			const el = q(container, 'selected-list');
			q(container, 'selected-count').textContent = String(draftTemplate.skillIds.length);
			if (draftTemplate.skillIds.length === 0) {
				el.innerHTML = '<p class="text-xs text-slate-400">まだスキルが選択されていません。</p>';
				return;
			}
			el.innerHTML = draftTemplate.skillIds.map(id =>
				// 名前と×の間の空白は元の実装（テンプレートリテラルの改行）と同じ見え方にするため意図的
				'<span class="usd-chip">' + esc(getSkillName(id)) + ' ' +
					'<button type="button" class="ml-1" data-usd-act="template-skill-remove" data-skill-id="' + esc(id) + '" aria-label="削除"><i data-lucide="x" class="w-3 h-3"></i></button>' +
				'</span>'
			).join('');
			refreshIcons();
		}

		function openEditor(templateId) {
			const data = ensureUserData();
			if (templateId) {
				draftTemplate = data.templates.find(x => x.templateId === templateId);
				if (!draftTemplate) return;
			} else {
				if (data.templates.length >= TEMPLATE_LIMIT) {
					toast('テンプレートは最大' + TEMPLATE_LIMIT + '件までです。不要なものを削除してください');
					return;
				}
				// 新規テンプレートはこの時点で即座に配列へ追加し、以降は全操作を自動保存する。
				// 名前もスキルも入力されないまま閉じられた場合のみ、closeEditor側で破棄する。
				draftTemplate = { templateId: uid('tpl'), name: '', skillIds: [], createdAt: nowIso(), updatedAt: nowIso() };
				data.templates.push(draftTemplate);
				saveUserData();
				fireChange();
			}
			render();
		}

		function closeEditor() {
			// スキルが1件も選ばれていない未完成の下書きは、一覧を汚さないよう自動で破棄する。
			const data = ensureUserData();
			if (draftTemplate && draftTemplate.skillIds.length === 0) {
				data.templates = data.templates.filter(t => t.templateId !== draftTemplate.templateId);
				saveUserData();
			}
			draftTemplate = null;
			closePicker();
			render();
			fireChange();
		}

		function onNameChange() {
			if (!draftTemplate) return;
			draftTemplate.name = nameInput.value;
			draftTemplate.updatedAt = nowIso();
			saveUserData();
			fireChange();
		}

		function openEditorPicker() {
			openSkillPicker(draftTemplate.skillIds, (ids) => {
				ids.forEach(id => { if (!draftTemplate.skillIds.includes(id)) draftTemplate.skillIds.push(id); });
				draftTemplate.updatedAt = nowIso();
				saveUserData();
				renderSelectedList();
				fireChange();
			});
		}

		function removeSkillFromTemplate(skillId) {
			const idx = draftTemplate.skillIds.indexOf(skillId);
			if (idx === -1) return;
			const name = getSkillName(skillId);
			const target = draftTemplate;
			target.skillIds.splice(idx, 1);
			target.updatedAt = nowIso();
			saveUserData();
			picker.excludeIds = picker.excludeIds.filter(id => id !== skillId);
			renderSelectedList();
			renderPickerResults();
			fireChange();
			pushUndo('スキル「' + name + '」を削除しました', () => {
				target.skillIds.splice(idx, 0, skillId);
				saveUserData();
				if (draftTemplate === target) renderSelectedList();
				render();
				fireChange();
			});
		}

		function duplicateTemplate(templateId) {
			const data = ensureUserData();
			if (data.templates.length >= TEMPLATE_LIMIT) { toast('テンプレートは最大' + TEMPLATE_LIMIT + '件までです'); return; }
			const t = data.templates.find(x => x.templateId === templateId);
			if (!t) return;
			data.templates.push({ templateId: uid('tpl'), name: t.name + '（コピー）', skillIds: t.skillIds.slice(), createdAt: nowIso(), updatedAt: nowIso() });
			saveUserData();
			renderList();
			fireChange();
			toast('複製しました');
		}

		function deleteTemplate(templateId) {
			const data = ensureUserData();
			const idx = data.templates.findIndex(x => x.templateId === templateId);
			if (idx === -1) return;
			const removed = data.templates[idx];
			data.templates.splice(idx, 1);
			saveUserData();
			renderList();
			fireChange();
			pushUndo('テンプレート「' + (removed.name || '（名称未設定）') + '」を削除しました', () => {
				data.templates.splice(idx, 0, removed);
				saveUserData();
				render();
				fireChange();
			});
		}

		function setSelectedTemplateId(templateId) {
			const data = ensureUserData();
			const exists = data.templates.some(t => t.templateId === templateId);
			selectedTemplateId = exists ? templateId : null;
			renderList();
			if (opts.onSelectionChange) opts.onSelectionChange(selectedTemplateId);
		}

		render();

		return {
			render: render,
			isEditing: function () { return !!draftTemplate; },
			openEditor: openEditor,
			closeEditor: closeEditor,
			getSelectedTemplateId: function () { return selectedTemplateId; },
			setSelectedTemplateId: setSelectedTemplateId
		};
	}

	/* ============================================================
	 * 比較レコード（比較シート）の管理ロジック
	 *
	 * ここにはUIを持たない。呼び出し元（Deck本体／OCRツール）は
	 * 「どのレコードのどの候補へ、どのスキルIDに★いくつを書くか」だけを渡す。
	 * ============================================================ */

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
		return record;
	}

	function countEnabledCandidates(record) {
		return record.candidates.filter(c => c.enabled).length;
	}

	function findRecord(recordId) {
		return ensureUserData().records.find(r => r.recordId === recordId) || null;
	}

	function canCreateRecord() {
		return ensureUserData().records.length < RECORD_LIMIT;
	}

	function createRecordFromTemplate(templateId, name) {
		const data = ensureUserData();
		if (data.records.length >= RECORD_LIMIT) {
			toast('比較シートは最大' + RECORD_LIMIT + '件までです。不要なものを削除してください');
			return null;
		}
		const t = data.templates.find(x => x.templateId === templateId);
		if (!t) { toast('テンプレートを選択してください'); return null; }
		const record = {
			recordId: uid('rec'),
			name: (name && name.trim()) ? name.trim() : (t.name + ' 候補比較'),
			sourceTemplateId: t.templateId,
			skillIds: t.skillIds.slice(), candidates: [], cells: {},
			createdAt: nowIso(), updatedAt: nowIso()
		};
		data.records.push(record);
		saveUserData();
		return record;
	}

	// 保存先選択UIを組み立てるための、レコード一覧の要約（ツール非依存）。
	function listRecordSummaries() {
		return ensureUserData().records.map(r => ({
			recordId: r.recordId,
			name: r.name,
			sourceTemplateId: r.sourceTemplateId,
			skillCount: r.skillIds.length,
			candidateCount: r.candidates.length,
			enabledCount: r.candidates.filter(c => c.enabled).length
		}));
	}

	// 指定レコードの候補一覧。filledCount は「★1以上が入っているセルの数」で、
	// 上書き確認ダイアログに出す「置き換えられる★の件数」に使う。
	function listCandidateSummaries(recordId) {
		const r = findRecord(recordId);
		if (!r) return [];
		return r.candidates.map(c => {
			let filled = 0;
			r.skillIds.forEach(sid => {
				const v = r.cells[sid] && r.cells[sid][c.candidateId];
				if (v) filled++;
			});
			return { candidateId: c.candidateId, label: c.label, enabled: !!c.enabled, filledCount: filled };
		});
	}

	function clampStar(v) {
		const n = Math.round(Number(v) || 0);
		return Math.max(STAR_MIN, Math.min(STAR_MAX, n));
	}

	/**
	 * 1候補ぶんの★をまとめて書き込む（ツール非依存の中心API）。
	 *
	 * recordId: 書き込み先レコード
	 * assignments: [{
	 *   candidateId: '既存候補へ書く場合のID',   // どちらか一方
	 *   newLabel:    '新規候補として追加する場合のラベル',
	 *   stars:       { skillId: 0..3, ... }      // レコードに無いスキルIDは無視される
	 * }, ...]
	 *
	 * 「1候補＝1体丸ごと」の原則に従い、対象候補の列はレコードの全スキルについて
	 * 上書きする（stars に無いスキルは0）。既存候補に★が入っている場合は
	 * 呼び出し元ではなくこのモジュールが確認ダイアログを出す。
	 *
	 * 戻り値: { ok, cancelled, written, addedLabels, overwrittenLabels, skippedSkillIds }
	 */
	function applyStarAssignments(recordId, assignments) {
		const record = findRecord(recordId);
		if (!record) return { ok: false, cancelled: false, written: 0, addedLabels: [], overwrittenLabels: [], skippedSkillIds: [] };
		const list = (assignments || []).filter(a => a && (a.candidateId || (a.newLabel && a.newLabel.trim())));
		if (list.length === 0) return { ok: false, cancelled: false, written: 0, addedLabels: [], overwrittenLabels: [], skippedSkillIds: [] };

		// 既存候補への上書きになるものを先に洗い出し、まとめて1回だけ確認する。
		const summaries = listCandidateSummaries(recordId);
		const overwriteTargets = [];
		list.forEach(a => {
			if (!a.candidateId) return;
			const s = summaries.find(x => x.candidateId === a.candidateId);
			if (s && s.filledCount > 0) overwriteTargets.push(s);
		});
		if (overwriteTargets.length > 0 && !confirmDialog(buildOverwriteMessage(overwriteTargets))) {
			return { ok: false, cancelled: true, written: 0, addedLabels: [], overwrittenLabels: [], skippedSkillIds: [] };
		}

		const skillIdSet = new Set(record.skillIds);
		const skippedSkillIds = [];
		const addedLabels = [];
		const overwrittenLabels = [];
		let written = 0;

		list.forEach(a => {
			let candidateId = a.candidateId;
			if (!candidateId) {
				const label = a.newLabel.trim();
				const enabled = countEnabledCandidates(record) < MAX_ENABLED_CANDIDATES;
				candidateId = uid('c');
				record.candidates.push({ candidateId: candidateId, label: label, enabled: enabled });
				addedLabels.push(label);
			} else {
				const c = record.candidates.find(x => x.candidateId === candidateId);
				if (!c) return;
				if (overwriteTargets.some(t => t.candidateId === candidateId)) overwrittenLabels.push(c.label);
			}
			const stars = a.stars || {};
			Object.keys(stars).forEach(sid => { if (!skillIdSet.has(sid) && skippedSkillIds.indexOf(sid) === -1) skippedSkillIds.push(sid); });
			// 候補の列をレコードの全スキルについて置き換える（部分保存はしない）。
			record.skillIds.forEach(sid => {
				if (!record.cells[sid]) record.cells[sid] = {};
				record.cells[sid][candidateId] = clampStar(stars[sid]);
			});
			written++;
		});

		record.updatedAt = nowIso();
		saveUserData();
		return { ok: true, cancelled: false, written: written, addedLabels: addedLabels, overwrittenLabels: overwrittenLabels, skippedSkillIds: skippedSkillIds };
	}

	function buildOverwriteMessage(targets) {
		if (targets.length === 1) {
			const t = targets[0];
			return '候補「' + t.label + '」の★を上書きします。\n'
				+ 'この候補に現在入っている★ ' + t.filledCount + '件は置き換えられます。\n\nよろしいですか？';
		}
		return '次の' + targets.length + '件の候補の★を上書きします。\n'
			+ '現在入っている★は置き換えられます。\n\n'
			+ targets.map(t => '・' + t.label + '（★' + t.filledCount + '件）').join('\n')
			+ '\n\nよろしいですか？';
	}

	/* ============================================================
	 * 公開API
	 * ============================================================ */
	global.UmaSkillDeckCore = {
		VERSION: UMA_SKILL_DECK_CORE_JS_VERSION,

		// 定数
		STORAGE_KEY_USER: STORAGE_KEY_USER,
		STORAGE_KEY_MASTER: STORAGE_KEY_MASTER,
		MASTER_JSON_PATH: MASTER_JSON_PATH,
		TEMPLATE_LIMIT: TEMPLATE_LIMIT,
		RECORD_LIMIT: RECORD_LIMIT,
		CUSTOM_SKILL_SOFT_CAP: CUSTOM_SKILL_SOFT_CAP,
		STAR_MIN: STAR_MIN,
		STAR_MAX: STAR_MAX,
		MAX_ENABLED_CANDIDATES: MAX_ENABLED_CANDIDATES,
		TAG_AXES: TAG_AXES,

		// 設定
		configure: function (next) { config = Object.assign({}, config, next || {}); },

		// ユーティリティ（呼び出し元でも同じ実装を使いたいもの）
		uid: uid,
		escapeHtml: esc,
		nowIso: nowIso,
		refreshIcons: refreshIcons,

		// データ層
		getUserData: ensureUserData,
		reloadUserData: function () { userData = loadUserData(); return userData; },
		saveUserData: saveUserData,
		replaceUserData: replaceUserData,
		createEmptyUserData: createEmptyUserData,

		// マスターデータ
		loadMasterSkills: loadMasterSkills,
		getMasterSkills: function () { return masterSkills; },
		getMasterMeta: function () { return masterMeta; },

		// スキル参照
		findSkill: findSkill,
		getSkillName: getSkillName,
		getSkillTags: getSkillTags,
		getSkillEntries: getSkillEntries,
		matchesFilters: matchesFilters,
		tagLabel: tagLabel,

		// テンプレート
		getTemplates: function () { return ensureUserData().templates; },
		findTemplate: function (templateId) { return ensureUserData().templates.find(t => t.templateId === templateId) || null; },
		createTemplateManager: createTemplateManager,

		// スキル選択モーダル
		openSkillPicker: openSkillPicker,
		closeSkillPicker: closePicker,
		renderPickerResults: renderPickerResults,

		// レコード
		getRecords: function () { return ensureUserData().records; },
		findRecord: findRecord,
		canCreateRecord: canCreateRecord,
		createRecordFromTemplate: createRecordFromTemplate,
		listRecordSummaries: listRecordSummaries,
		listCandidateSummaries: listCandidateSummaries,
		normalizeCandidateEnabled: normalizeCandidateEnabled,
		countEnabledCandidates: countEnabledCandidates,
		applyStarAssignments: applyStarAssignments,

		// Undo
		pushUndo: pushUndo,
		performUndo: performUndo,
		undoCount: function () { return undoStack.length; },
		onUndoChanged: onUndoChanged,
		clearUndo: function () { undoStack = []; notifyUndoChanged(); }
	};
})(window);
