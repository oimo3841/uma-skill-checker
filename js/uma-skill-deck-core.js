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
	const UMA_SKILL_DECK_CORE_JS_VERSION = '2026-09-11a';

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

	// 一括貼り付けでスキル名を照合するときのしきい値。
	// 実機での使用感しだいで調整できるよう独立した定数にしてある
	// （変更したら UMA_SKILL_DECK_CORE_JS_VERSION を上げるだけで反映される）。
	//
	// MIN_LENGTH_FOR_FUZZY を設けている理由: 短いスキル名ほど1文字違いの
	// 破壊力が大きく、まったく別のスキルに化けやすい。実データ（439件）でも
	// 3文字以下どうしで距離1のペアが複数存在するため、短い名前は完全一致のみ許す。
	const DECK_TEXT_MATCH_MAX_DISTANCE = 1;
	const DECK_TEXT_MATCH_MIN_LENGTH_FOR_FUZZY = 4;

	// ドラフト（保存しない一時的な対象スキルセット）の保存先の接頭辞。
	// scope名を後ろに付けるので、将来 exam 側が合流しても衝突しない。
	const STORAGE_KEY_DRAFT_PREFIX = 'umaSkillDeck:draftScope:';

	// テンプレート一覧の中でドラフトを指すための番号（テンプレートIDと衝突しない形）。
	const DRAFT_SELECTION_ID = '__draft__';

	// 8軸のタグ辞書。フィルターパネル・タグ表示・カスタムスキル入力で共有する。
	const TAG_AXES = [
		{ key: 'distance', label: '①距離', defaultOpen: true, options: [
			{ v: 'short', t: '短距離' }, { v: 'mile', t: 'マイル' }, { v: 'medium', t: '中距離' }, { v: 'long', t: '長距離' }
		]},
		{ key: 'style', label: '②脚質', defaultOpen: true, options: [
			{ v: 'nige', t: '逃げ' }, { v: 'senko', t: '先行' }, { v: 'sashi', t: '差し' }, { v: 'oikomi', t: '追込' }
		]},
		{ key: 'effect', label: '③効果タイプ', defaultOpen: true, options: [
			{ v: 'target_speed_up', t: '速度アップ' }, { v: 'accel_up', t: '加速度アップ' }, { v: 'move_forward', t: '前に出る' }, { v: 'extend', t: '伸び' },
			{ v: 'stamina', t: '持久力回復' }, { v: 'stamina_down', t: '持久力減少' }, { v: 'speed_down', t: '速度ダウン' }, { v: 'start_good', t: 'スタート得意' }, { v: 'course_sense', t: 'コース取り' },
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
		]},
		// 該当/非該当だけの単一フラグ軸。選択肢は1つしかないので、
		// 「条件を持たない＝万能スキル」という他の軸の扱いは当てはめない（flagAxis）。
		{ key: 'scenario', label: '⑧その他3（シナリオスキル）', defaultOpen: false, flagAxis: true, options: [
			{ v: 'scenario', t: 'シナリオスキル' }
		]}
	];

	// フェッチに失敗した場合のみ使うサンプルデータ（uma-skill-deck-skills.json が
	// まだ未公開/未配置の環境でも動作確認できるようにするための最終フォールバック）。
	const SAMPLE_MASTER_SKILLS = { masterVersion: 'embedded-sample', skills: [
		{ id: '1', name: '右回り○', tags: { distance: [], style: [], phase: [], coursePos: [], environment: ['right_turn'], trackVenue: [], effect: ['speed_up'], scenario: [] } },
		{ id: '21', name: '積極策', tags: { distance: ['mile'], style: [], phase: ['mid'], coursePos: [], environment: [], trackVenue: [], effect: ['target_speed_up'], scenario: [] } },
		{ id: '26', name: '集中力', tags: { distance: [], style: [], phase: [], coursePos: [], environment: [], trackVenue: [], effect: ['start_good'], scenario: [] } }
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
		// schemaVersion 2 で record.ocrCells（OCRが書いた原本値）が加わった。
		// ただし読み込み側は分岐しない。ocrCells が無いデータは
		// 「原本値が記録されていない」として扱えば正しく動くため、変換処理は不要。
		return { schemaVersion: 2, templates: [], records: [], customSkills: [] };
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
	 * ドラフト（保存しない一時的な対象スキルセット）
	 *
	 * userData とは別の名前空間に置く。理由:
	 * - userData は「利用者が明示的に保存した資産」（テンプレート・比較シート）で、
	 *   エクスポート／インポートの対象。ドラフトは「今この画面で作業中の一時状態」であり、
	 *   別の端末へ持って行きたいものではない（masterCache と同じ扱い）。
	 * - 混ぜてしまうと、エクスポートしたJSONに作業中のゴミが混じる／
	 *   インポートで他人の作業中状態を上書きする、といった筋の悪いことが起きる。
	 * - キーに scope 名を含めるので、将来 exam 側が合流しても
	 *   umaSkillDeck:draftScope:exam のように衝突せず増やせる。
	 * ============================================================ */
	function draftStorageKey(scopeKey) {
		return STORAGE_KEY_DRAFT_PREFIX + String(scopeKey || 'default');
	}

	function loadDraftScope(scopeKey) {
		try {
			const raw = global.localStorage.getItem(draftStorageKey(scopeKey));
			if (!raw) return { skillIds: [], updatedAt: '' };
			const parsed = JSON.parse(raw);
			if (!parsed || !Array.isArray(parsed.skillIds)) return { skillIds: [], updatedAt: '' };
			return { skillIds: parsed.skillIds.slice(), updatedAt: parsed.updatedAt || '' };
		} catch (e) {
			return { skillIds: [], updatedAt: '' };
		}
	}

	function saveDraftScope(scopeKey, skillIds) {
		const payload = { skillIds: (skillIds || []).slice(), updatedAt: nowIso() };
		try {
			global.localStorage.setItem(draftStorageKey(scopeKey), JSON.stringify(payload));
		} catch (e) {
			toast('一時的な対象スキルセットの保存に失敗しました（ブラウザのストレージ容量を確認してください）');
		}
		return payload;
	}

	function clearDraftScope(scopeKey) {
		try { global.localStorage.removeItem(draftStorageKey(scopeKey)); } catch (e) {}
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
		return s ? s.tags : emptyTagSet();
	}

	// スキルID配列 → [{ id, name }]（順序はID配列のまま）。
	// 呼び出し元（OCRツール）に「照合対象のスキル名」を渡し、結果をIDへ戻すために使う。
	// このモジュールがOCRの都合を知らずに済むよう、名前とIDの対応だけを返す。
	function getSkillEntries(skillIds) {
		return (skillIds || []).map(id => ({ id: id, name: getSkillName(id) }));
	}

	// フィルター一致判定。軸間はAND、軸内はOR。
	// スキルがその軸に条件を持たない（空配列）場合は、その軸のどの選択肢にも一致する扱い（万能スキル）。
	// ただし flagAxis の軸（⑧シナリオスキル）は該当/非該当のフラグなので、
	// 空配列は「非該当」であって「万能」ではない。ここだけ扱いを分ける。
	function matchesFilters(skill, filters) {
		return TAG_AXES.every(axis => {
			const selected = filters[axis.key] || [];
			if (selected.length === 0) return true; // その軸で絞り込みしていない
			const skillValues = (skill.tags && skill.tags[axis.key]) || [];
			if (skillValues.length === 0) return !axis.flagAxis; // 万能スキル（フラグ軸だけは非該当）
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
	 * 一括貼り付けテキストのスキル名マッチング
	 *
	 * スプレッドシートの1列をそのまま貼り付けて、対象スキルセットを
	 * 一気に組み立てるための照合ロジック。
	 *
	 * common.js（OCR側）ではなくこちらに置いている。理由:
	 * - uma-skill-deck.html 単体でもこの機能を使うが、common.js は OCR用の重い
	 *   ファイルで、Deck単体ページには読み込まないという一方向依存を保ちたいため。
	 * - 貼り付けテキストの表記ゆれ（全角/半角、〇と○、末尾の★や数字）は、
	 *   OCR特有の視覚的な誤読（common.js の CHAR_CONFUSION_MAP が扱うもの）とは
	 *   別のドメイン。同じ場所に混ぜると、どちらの調整も相手側への影響を
	 *   気にしながら行うことになる（B節ルール3のレイヤー分離）。
	 * ============================================================ */

	// 表記ゆれの吸収。スキル名そのものは書かない（B節ルール1）。
	// NFKC では統一されない「見た目が同じ記号」だけを対象にする。
	const TEXT_CHAR_VARIANTS = {
		'〇': '○',   // U+3007 漢数字ゼロ。IMEで「まる」と打つとこちらが出やすい
		'◯': '○',   // U+25EF 大きな丸
		'·': '・',   // U+00B7
		'•': '・'    // U+2022
	};

	function normalizeSkillText(input) {
		const src = String(input == null ? '' : input).normalize('NFKC');
		let out = '';
		for (let i = 0; i < src.length; i++) {
			const ch = src[i];
			out += (TEXT_CHAR_VARIANTS[ch] !== undefined) ? TEXT_CHAR_VARIANTS[ch] : ch;
		}
		return out.replace(/[\s\u3000]+/g, ' ').trim();
	}

	// 「◯◯★3」「◯◯(3)」のように、スキル名の後ろに付いた評価表記を落とす。
	// ただしマスターには括弧付きの名前も存在するため、この結果は
	// 「元の表記の代わり」ではなく「もう1つの候補形」として扱うこと。
	function stripSkillTextRank(text) {
		let t = text;
		let prev = null;
		while (prev !== t) {
			prev = t;
			t = t.replace(/\s*[（(\[【][^）)\]】]*[）)\]】]\s*$/, '');
			t = t.replace(/\s*[★☆*＊]+\s*\d*\s*$/, '');
			t = t.replace(/\s*\d+\s*$/, '');
			t = t.trim();
		}
		return t;
	}

	// 1行から照合に使う候補形を作る。先頭が「そのままの表記」。
	function skillTextVariants(rawLine) {
		const base = normalizeSkillText(rawLine);
		const stripped = stripSkillTextRank(base);
		return (stripped && stripped !== base) ? [base, stripped] : [base];
	}

	// 貼り付けテキスト用のレーベンシュタイン距離。
	// common.js にも相当する実装があるが、あちらはOCR照合レイヤーのもの。
	// このモジュールが common.js に依存しないよう、意図的に持ち直している。
	// limit を超えることが確定した時点で打ち切る（439件×行数ぶん回るため）。
	function skillTextDistance(a, b, limit) {
		if (a === b) return 0;
		const la = a.length, lb = b.length;
		if (Math.abs(la - lb) > limit) return limit + 1;
		if (la === 0) return lb;
		if (lb === 0) return la;
		let prev = new Array(lb + 1), cur = new Array(lb + 1);
		for (let j = 0; j <= lb; j++) prev[j] = j;
		for (let i = 1; i <= la; i++) {
			cur[0] = i;
			let rowMin = cur[0];
			const ca = a[i - 1];
			for (let j = 1; j <= lb; j++) {
				const cost = ca === b[j - 1] ? 0 : 1;
				cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
				if (cur[j] < rowMin) rowMin = cur[j];
			}
			if (rowMin > limit) return limit + 1;
			const tmp = prev; prev = cur; cur = tmp;
		}
		return prev[lb];
	}

	// 照合対象のプール（マスター＋カスタムスキル）。
	// スキル選択パネルの一覧と同じ母集団にしておくことで、
	// 「一覧には出ているのに貼り付けでは当たらない」というズレを避ける。
	function buildSkillTextIndex() {
		const pool = masterSkills.map(sk => ({ id: sk.id, name: sk.name }))
			.concat((ensureUserData().customSkills || []).map(c => ({ id: c.customId, name: c.name })));
		return pool.map(p => ({ id: p.id, name: p.name, norm: normalizeSkillText(p.name) }));
	}

	/**
	 * 改行区切りのテキストをスキルIDへ照合する（ツール非依存）。
	 *
	 * 戻り値: { rows, counts }
	 *   rows[i] = {
	 *     raw,                       … 元の行
	 *     norm,                      … 正規化後（そのままの表記）
	 *     kind: 'exact'              … 完全一致。確認不要でそのまま採用してよい
	 *         | 'review'             … 距離1の候補あり。必ず利用者に選ばせる
	 *         | 'none'               … 候補なし
	 *         | 'error',             … 入力として不正（タブを含む等）
	 *     reason,                    … error のときの理由
	 *     matchedId, matchedName,    … exact のとき
	 *     candidates: [{ id, name, distance }]  … review のとき
	 *   }
	 *
	 * 距離1のものを自動採用しないのは、実データに
	 * 「1文字だけ違う別スキル」の組が多数あるため（左右の回り、季節、系統違い等）。
	 */
	function matchPastedSkillText(text) {
		const index = buildSkillTextIndex();
		const rows = [];
		const seenBase = new Set();
		const seenId = new Set();

		String(text == null ? '' : text).split(/\r\n|\r|\n/).forEach(line => {
			if (!line.trim()) return;                                   // 空行はスキップ
			if (line.indexOf('\t') !== -1) {
				rows.push({
					raw: line, norm: '', kind: 'error', candidates: [],
					reason: '複数列が含まれているようです（タブ区切り）。スプレッドシートの1列だけをコピーしてください'
				});
				return;
			}
			const variants = skillTextVariants(line);
			const base = variants[0];
			if (!base) return;                                          // 正規化の結果、空になった行はスキップ
			if (seenBase.has(base)) return;                             // 同じ行の重複は1件にまとめる
			seenBase.add(base);

			// 1) 完全一致（正規化後）。候補提示は不要。
			let exact = null;
			for (let v = 0; v < variants.length && !exact; v++) {
				const want = variants[v];
				exact = index.find(p => p.norm === want) || null;
			}
			if (exact) {
				if (seenId.has(exact.id)) return;                       // 表記違いで同じスキルに当たった行
				seenId.add(exact.id);
				rows.push({ raw: line, norm: base, kind: 'exact', matchedId: exact.id, matchedName: exact.name, candidates: [] });
				return;
			}

			// 2) 距離1の候補。短い名前は完全一致のみ許すのでここでは見ない。
			const hits = {};
			index.forEach(p => {
				if (p.norm.length < DECK_TEXT_MATCH_MIN_LENGTH_FOR_FUZZY) return;
				let best = DECK_TEXT_MATCH_MAX_DISTANCE + 1;
				variants.forEach(v => {
					const d = skillTextDistance(v, p.norm, DECK_TEXT_MATCH_MAX_DISTANCE);
					if (d < best) best = d;
				});
				if (best > 0 && best <= DECK_TEXT_MATCH_MAX_DISTANCE) {
					if (!hits[p.id] || hits[p.id].distance > best) hits[p.id] = { id: p.id, name: p.name, distance: best };
				}
			});
			const candidates = Object.keys(hits).map(k => hits[k])
				.sort((x, y) => (x.distance - y.distance) || x.name.localeCompare(y.name, 'ja'));

			rows.push({ raw: line, norm: base, kind: candidates.length > 0 ? 'review' : 'none', candidates: candidates });
		});

		const counts = { total: rows.length, exact: 0, review: 0, none: 0, error: 0 };
		rows.forEach(r => { counts[r.kind]++; });
		return { rows: rows, counts: counts };
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
		// 見た目の値は css/common.css のトークンから取る。ここに色や寸法を直書きすると、
		// Tailwind v4 のパレット（oklch）と微妙にズレた色が並ぶことになる。
		// ボタン・入力欄そのものの形は共通部品（.uma-btn / .uma-icon-btn / .uma-input）に
		// 任せ、ここにはこのモジュールが生成する要素固有の配置だけを残す。
		// 一覧の行（.usd-list-card）とパネルの下地（.usd-panel）の見た目は
		// css/common.css の .uma-list-row / .glass-card が持つ。
		// 以前はページ側と同じ定義をここにも書いていたが、片方だけ直す事故の元だった。
		'.usd-chip { display: inline-flex; align-items: center; gap: var(--uma-sp-1); padding: var(--uma-sp-1) var(--uma-sp-2-5);',
		'  background: var(--uma-accent-soft); color: var(--uma-accent-soft-text); border-radius: var(--uma-r-full);',
		'  font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); font-weight: 600; }',
		'.usd-pill { display: inline-flex; align-items: center; gap: var(--uma-sp-1); padding: var(--uma-sp-1) var(--uma-sp-2-5);',
		'  border: 1px solid var(--uma-border); border-radius: var(--uma-r-full); font-size: var(--uma-fs-xs);',
		'  line-height: var(--uma-lh-xs); cursor: pointer; background: var(--uma-surface); color: var(--uma-text-muted); }',
		'.usd-pill:hover { border-color: var(--uma-border-strong); background: var(--uma-surface-sunken); }',
		'.usd-row { display: flex; align-items: center; gap: var(--uma-sp-2); padding: var(--uma-sp-1-5) var(--uma-sp-3);',
		'  font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); border-bottom: 1px solid var(--uma-surface-muted); cursor: pointer; }',
		'.usd-row:hover { background: var(--uma-surface-sunken); }',
		'.usd-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
		// 既存の .glass-card 相当（テンプレート編集パネル・モーダルの下地）
		'.usd-modal { position: fixed; inset: 0; background: rgba(15,23,42,.4); z-index: 80; display: flex; align-items: flex-end; justify-content: center; }',
		'.usd-modal[hidden] { display: none !important; }',
		'.usd-modal-panel { background: var(--uma-glass-bg); backdrop-filter: var(--uma-glass-blur); width: 100%; max-width: 42rem;',
		'  border-radius: var(--uma-r-xl) var(--uma-r-xl) 0 0; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; }',
		'@media (min-width: 768px) { .usd-modal-panel { border-radius: var(--uma-r-xl); margin-bottom: var(--uma-sp-6); } }',
		// 一括貼り付けの照合結果
		'.usd-paste-summary { display: flex; flex-wrap: wrap; gap: var(--uma-sp-2); align-items: center; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); margin-bottom: var(--uma-sp-1-5); }',
		'.usd-paste-ok { color: var(--uma-success); font-weight: 600; }',
		'.usd-paste-muted { color: var(--uma-text-faint); }',
		'.usd-paste-warn { color: var(--uma-warn-text); font-weight: 600; }',
		'.usd-paste-err { color: var(--uma-danger-text); font-weight: 600; }',
		'.usd-paste-label { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); margin: var(--uma-sp-2) 0 var(--uma-sp-1); }',
		'.usd-paste-row { border: 1px solid var(--uma-border); border-radius: var(--uma-r-md); background: var(--uma-surface);',
		'  padding: var(--uma-sp-1-5) var(--uma-sp-2); margin-bottom: var(--uma-sp-1); font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); }',
		'.usd-paste-approx { border-color: var(--uma-warn-border); background: var(--uma-warn-bg); }',
		'.usd-paste-error { border-color: var(--uma-danger-border); background: var(--uma-danger-bg); }',
		'.usd-paste-raw { font-family: var(--uma-font-mono); color: var(--uma-text-heading); word-break: break-all; }',
		'.usd-paste-arrow { color: var(--uma-text-faint); margin: 0 var(--uma-sp-1-5); }',
		'.usd-paste-picked { font-weight: 600; color: var(--uma-accent-soft-text); }',
		'.usd-paste-head { display: flex; align-items: center; justify-content: space-between; gap: var(--uma-sp-2); }',
		'.usd-paste-cands { display: flex; flex-wrap: wrap; gap: var(--uma-sp-1); align-items: center; margin-top: var(--uma-sp-1); }',
		'.usd-paste-hint { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-faint); }',
		'.usd-paste-cand { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); padding: var(--uma-sp-0-5) var(--uma-sp-2);',
		'  border-radius: var(--uma-r-full); border: 1px solid var(--uma-accent-border); background: var(--uma-accent-soft);',
		'  color: var(--uma-accent-soft-text); cursor: pointer; }',
		'.usd-paste-cand:hover { background: var(--uma-accent-border); }',
		'.usd-paste-skip { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-faint);',
		'  text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0; }',
		'.usd-paste-skip:hover { color: var(--uma-text-subtle); }',
		'.usd-paste-scroll { max-height: 240px; overflow: auto; }',
		'.usd-draft-badge { display: inline-block; margin-left: var(--uma-sp-1-5); font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs);',
		'  font-weight: 600; padding: var(--uma-sp-0-5) var(--uma-sp-1-5); border-radius: var(--uma-r-full);',
		'  background: var(--uma-warn-bg); color: var(--uma-warn-text); vertical-align: 1px; }'
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
	// 一括貼り付けの照合結果。各行に chosenId（採用したスキルID）を後から書き込む。
	let pasteRows = [];

	function pickerMarkup() {
		return '' +
			'<div class="usd-modal-panel">' +
				'<div class="flex items-center justify-between p-4 border-b border-slate-200" style="flex-shrink:0;">' +
					'<p class="text-sm font-semibold text-slate-700">スキルを選ぶ（軸間はAND・軸内はOR）</p>' +
					'<button type="button" class="usd-icon-btn uma-icon-btn" data-usd-act="picker-close" aria-label="閉じる"><i data-lucide="x" class="w-4 h-4"></i></button>' +
				'</div>' +
				'<div class="p-4" style="overflow:auto;">' +
					// 一括貼り付け。8軸フィルターより上に置く（スプレッドシートからの
					// 移行が主な入口になる想定のため）。既存の絞り込みはそのまま下に残す。
					'<details class="mb-3 rounded-xl border border-slate-200 bg-slate-50" data-usd-el="paste-box" open>' +
						'<summary class="text-xs font-semibold text-slate-600 px-3 py-2 cursor-pointer select-none">スプレッドシートから貼り付けて一括選択</summary>' +
						'<div class="px-3 pb-3">' +
							'<p class="text-[11px] text-slate-500 leading-relaxed mb-2">1列ぶんを改行区切りのまま貼り付けてください。全角/半角の違いや、末尾の「★3」「(3)」のような評価表記は自動で読み替えます。複数列をまとめてコピーした行（タブを含む行）はエラーとしてお知らせします。</p>' +
							'<textarea class="usd-input uma-input" rows="4" style="font-family:var(--uma-font-mono);resize:vertical;" data-usd-el="paste-input" placeholder="1行に1つずつスキル名を貼り付け"></textarea>' +
							'<div class="flex flex-wrap gap-2 mt-2">' +
								'<button type="button" class="uma-btn uma-btn--primary" data-usd-act="paste-run">貼り付けたテキストを照合</button>' +
								'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="paste-clear">クリア</button>' +
							'</div>' +
							'<div data-usd-el="paste-report" class="mt-3"></div>' +
						'</div>' +
					'</details>' +
					'<div data-usd-el="filter-axes" class="grid grid-cols-1 gap-2 mb-3"></div>' +
					'<div class="flex items-center justify-between mb-1">' +
						'<label class="flex items-center gap-1.5 text-xs text-slate-600">' +
							'<input type="checkbox" data-usd-act="picker-select-all"/> 表示中を全て選択' +
						'</label>' +
						'<p class="text-xs text-slate-500">絞り込み結果（<span data-usd-el="result-count">0件</span>）</p>' +
					'</div>' +
					'<div data-usd-el="results" style="border:1px solid #e2e8f0;border-radius:.75rem;max-height:280px;overflow:auto;margin-bottom:10px;"></div>' +
					'<button type="button" class="w-full uma-btn uma-btn--primary mb-4" data-usd-act="picker-add">チェックしたスキルを追加</button>' +
					'<details class="border-t border-slate-200 pt-3">' +
						'<summary class="text-xs font-semibold text-slate-600 cursor-pointer">マスターにないスキルを手入力で追加</summary>' +
						'<div class="mt-3">' +
							'<input type="text" class="usd-input uma-input mb-2" data-usd-el="custom-name" placeholder="スキル名"/>' +
							'<div data-usd-el="custom-tags"></div>' +
							'<button type="button" class="mt-2 uma-btn uma-btn--secondary" data-usd-act="custom-add">カスタムスキルとして追加</button>' +
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
			else if (act === 'paste-run') runPasteMatch();
			else if (act === 'paste-clear') clearPaste();
			else if (act === 'paste-pick') choosePasteCandidate(Number(btn.dataset.row), btn.dataset.skillId);
			else if (act === 'paste-custom') createCustomFromPasteRow(Number(btn.dataset.row));
			else if (act === 'paste-skip') skipPasteRow(Number(btn.dataset.row));
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
		// 貼り付けの照合結果は消さずに残し、「追加済み」として見えるようにする
		// （まだ処理していない要確認の行が消えてしまわないように）。
		renderPasteReport();
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

	function emptyTagSet() {
		const tags = {};
		TAG_AXES.forEach(axis => { tags[axis.key] = []; });
		return tags;
	}

	/**
	 * カスタムスキルを1件作って選択状態に加える（手入力フォーム・一括貼り付けの共通処理）。
	 * 同名が既にあれば、そちらを使うかどうかを尋ねて既存IDを返す。
	 * 戻り値: 追加/採用したスキルID。中止した場合は null。
	 */
	function createCustomSkill(name, tags) {
		const trimmed = String(name || '').trim();
		if (!trimmed) { toast('スキル名を入力してください'); return null; }
		const data = ensureUserData();
		const dupe = (data.customSkills || []).find(c => normalizeForDup(c.name) === normalizeForDup(trimmed));
		if (dupe) {
			if (!confirmDialog('「' + dupe.name + '」という同名のカスタムスキルが既にあります。既存のものを追加対象に使いますか？')) return null;
			picker.checked.add(dupe.customId);
			return dupe.customId;
		}
		if ((data.customSkills || []).length >= CUSTOM_SKILL_SOFT_CAP) {
			if (!confirmDialog('カスタムスキルが' + CUSTOM_SKILL_SOFT_CAP + '件に達しています。それでも追加しますか？（不要なものの整理をおすすめします）')) return null;
		}
		const customId = uid('custom');
		data.customSkills.push({ customId: customId, name: trimmed, tags: tags || emptyTagSet(), createdAt: nowIso() });
		saveUserData();
		picker.checked.add(customId);
		return customId;
	}

	function addCustomSkillFromPicker() {
		const nameInput = q(pickerEl, 'custom-name');
		const name = (nameInput.value || '').trim();
		const tags = {};
		TAG_AXES.forEach(axis => {
			tags[axis.key] = Array.from(pickerEl.querySelectorAll('[data-usd-el="custom-tag"][data-axis="' + axis.key + '"]'))
				.filter(el => el.checked).map(el => el.dataset.value);
		});
		const id = createCustomSkill(name, tags);
		if (!id) { renderPickerResults(); return; }
		nameInput.value = '';
		pickerEl.querySelectorAll('[data-usd-el="custom-tag"]').forEach(el => { el.checked = false; });
		renderPickerResults();
		toast('カスタムスキル「' + name + '」を追加しました');
	}

	/* ------------------------------------------------------------
	 * 一括貼り付けのUI
	 * ------------------------------------------------------------ */
	function runPasteMatch() {
		const input = q(pickerEl, 'paste-input');
		const text = input ? input.value : '';
		if (!text.trim()) { toast('貼り付けたテキストがありません'); return; }
		const result = matchPastedSkillText(text);
		pasteRows = result.rows;
		// 完全一致した行だけ、その場で選択状態に入れる。
		// 距離1の候補は必ず利用者に選ばせる（自動採用しない）。
		pasteRows.forEach(r => {
			if (r.kind !== 'exact') return;
			r.chosenId = r.matchedId;
			if (picker.excludeIds.indexOf(r.matchedId) === -1) picker.checked.add(r.matchedId);
		});
		renderPasteReport();
		renderPickerResults();
		const c = result.counts;
		toast(c.exact + '件が一致しました' + ((c.review + c.none) > 0 ? '／要確認 ' + (c.review + c.none) + '件' : '') + (c.error > 0 ? '／エラー ' + c.error + '件' : ''));
	}

	function clearPaste() {
		const input = q(pickerEl, 'paste-input');
		if (input) input.value = '';
		pasteRows = [];
		renderPasteReport();
	}

	function choosePasteCandidate(rowIndex, skillId) {
		const row = pasteRows[rowIndex];
		if (!row || !skillId) return;
		const prev = row.chosenId;
		row.chosenId = skillId;
		// 選び直した場合、前に選んでいたスキルを他の行も使っていなければ選択から外す
		if (prev && prev !== skillId) releaseIfUnused(prev);
		if (picker.excludeIds.indexOf(skillId) === -1) picker.checked.add(skillId);
		renderPasteReport();
		renderPickerResults();
	}

	// そのスキルを参照している貼り付け行がもう無く、まだ追加もされていなければ選択を外す
	function releaseIfUnused(skillId) {
		if (!skillId) return;
		if (pasteRows.some(o => o.chosenId === skillId)) return;
		if (picker.excludeIds.indexOf(skillId) !== -1) return;
		picker.checked.delete(skillId);
	}

	function createCustomFromPasteRow(rowIndex) {
		const row = pasteRows[rowIndex];
		if (!row) return;
		// 8軸タグは未設定のまま作る（後から埋める運用）。
		const id = createCustomSkill(row.norm, emptyTagSet());
		if (!id) return;
		row.chosenId = id;
		renderPasteReport();
		renderPickerResults();
		toast('カスタムスキル「' + row.norm + '」を追加しました（タグは未設定です）');
	}

	function skipPasteRow(rowIndex) {
		if (rowIndex < 0 || rowIndex >= pasteRows.length) return;
		const removed = pasteRows.splice(rowIndex, 1)[0];
		releaseIfUnused(removed.chosenId);
		renderPasteReport();
		renderPickerResults();
	}

	function renderPasteReport() {
		if (!pickerEl) return;
		const el = q(pickerEl, 'paste-report');
		if (!el) return;
		if (pasteRows.length === 0) { el.innerHTML = ''; return; }

		const excluded = new Set(picker.excludeIds);
		const resolved = pasteRows.filter(r => r.chosenId);
		const pending = pasteRows.filter(r => (r.kind === 'review' || r.kind === 'none') && !r.chosenId);
		const errors = pasteRows.filter(r => r.kind === 'error');
		// 完全一致以外を採用した行は、元のテキストと違うことが分かるよう強調する。
		const approx = resolved.filter(r => r.kind !== 'exact');

		// 件数は「行数」ではなく「実際に選ばれたスキルの数」で数える。
		// 別々の行が同じスキルに行き着くことがあるため（候補選択で、既に
		// 完全一致していたスキルを選んだ場合など）、行数で出すと実際より多く見える。
		const resolvedIds = new Set(resolved.map(r => r.chosenId));
		const alreadyIds = new Set(resolved.filter(r => excluded.has(r.chosenId)).map(r => r.chosenId));

		let html = '<div class="usd-paste-summary">' +
			'<span class="usd-paste-ok">選択 ' + resolvedIds.size + '件</span>' +
			(alreadyIds.size > 0 ? '<span class="usd-paste-muted">（うち追加済み ' + alreadyIds.size + '件）</span>' : '') +
			(pending.length > 0 ? '<span class="usd-paste-warn">要確認 ' + pending.length + '件</span>' : '') +
			(errors.length > 0 ? '<span class="usd-paste-err">エラー ' + errors.length + '件</span>' : '') +
		'</div>';
		if (resolvedIds.size > alreadyIds.size) {
			html += '<p class="usd-paste-hint">下の「チェックしたスキルを追加」を押すと確定します。</p>';
		}

		html += '<div class="usd-paste-scroll">';

		if (approx.length > 0) {
			html += '<p class="usd-paste-label">完全一致ではない行（内容をご確認ください）</p>';
			approx.forEach(r => {
				const i = pasteRows.indexOf(r);
				// 他の行と同じスキルに行き着いた場合は、選び間違いに気づけるよう知らせる
				const sameRow = resolved.find(o => o !== r && o.chosenId === r.chosenId);
				const others = r.candidates.filter(c => c.id !== r.chosenId);
				html += '<div class="usd-paste-row usd-paste-approx">' +
					'<div class="usd-paste-head">' +
						'<span><span class="usd-paste-raw">' + esc(r.raw) + '</span>' +
						'<span class="usd-paste-arrow">→</span>' +
						'<span class="usd-paste-picked">' + esc(getSkillName(r.chosenId)) + '</span></span>' +
						'<button type="button" class="usd-paste-skip" data-usd-act="paste-skip" data-row="' + i + '">取り消す</button>' +
					'</div>' +
					(sameRow ? '<div class="usd-paste-hint">「' + esc(sameRow.raw) + '」と同じスキルです</div>' : '') +
					(others.length > 0
						? '<div class="usd-paste-cands"><span class="usd-paste-hint">選び直す：</span>' +
							others.map(c => '<button type="button" class="usd-paste-cand" data-usd-act="paste-pick" data-row="' + i + '" data-skill-id="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('') +
						'</div>'
						: '') +
				'</div>';
			});
		}

		if (pending.length > 0) {
			html += '<p class="usd-paste-label">要確認（' + pending.length + '件）</p>';
			pending.forEach(r => {
				const i = pasteRows.indexOf(r);
				html += '<div class="usd-paste-row">' +
					'<div class="usd-paste-head">' +
						'<span class="usd-paste-raw">' + esc(r.raw) + '</span>' +
						'<button type="button" class="usd-paste-skip" data-usd-act="paste-skip" data-row="' + i + '">無視する</button>' +
					'</div>';
				if (r.candidates.length > 0) {
					html += '<div class="usd-paste-cands"><span class="usd-paste-hint">近いスキル：</span>' +
						r.candidates.map(c =>
							'<button type="button" class="usd-paste-cand" data-usd-act="paste-pick" data-row="' + i + '" data-skill-id="' + esc(c.id) + '">' + esc(c.name) + '</button>'
						).join('') + '</div>';
				} else {
					html += '<div class="usd-paste-cands">' +
						'<span class="usd-paste-hint">近いスキルが見つかりませんでした。</span>' +
						'<button type="button" class="usd-paste-cand" data-usd-act="paste-custom" data-row="' + i + '">カスタムスキルとして追加</button>' +
					'</div>';
				}
				html += '</div>';
			});
		}

		if (errors.length > 0) {
			html += '<p class="usd-paste-label">エラー（' + errors.length + '件）</p>';
			errors.forEach(r => {
				html += '<div class="usd-paste-row usd-paste-error">' +
					'<div class="usd-paste-raw">' + esc(r.raw) + '</div>' +
					'<div class="usd-paste-hint">' + esc(r.reason) + '</div>' +
				'</div>';
			});
		}

		html += '</div>';
		el.innerHTML = html;
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
		pasteRows = [];
		const pasteInput = q(pickerEl, 'paste-input');
		if (pasteInput) pasteInput.value = '';
		pickerEl.hidden = false;
		renderPickerFilterAxes();
		renderPickerResults();
		renderPasteReport();
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
	 *   selectable        … true にすると各行にラジオが付き、1つを選択できる（OCRツール側で使う）
	 *   draftScopeKey     … 文字列を渡すと「今回だけの対象スキルセット」（保存しないドラフト）を
	 *                       一覧の先頭に出し、その内容を localStorage に永続化する。
	 *                       省略すると従来どおりテンプレートだけを扱う（uma-skill-deck.html はこちら）。
	 *   onSelectionChange … 選択が変わったとき fn(selection|null)。selection は getSelection() と同じ形。
	 *   onChange          … テンプレート/ドラフト/カスタムスキルが変化したとき fn()
	 *   onViewChange      … 一覧⇄編集が切り替わったとき fn('list'|'editor')
	 *
	 * 呼び出し元がテンプレートIDやドラフトの区別を意識しなくて済むよう、
	 * 選択結果は getSelection() が返す { kind, id, name, skillIds } に統一している。
	 */
	function createTemplateManager(container, options) {
		injectStyles();
		const opts = options || {};
		const selectable = !!opts.selectable;
		const draftScopeKey = opts.draftScopeKey || null;

		// 編集中の対象。{ kind: 'template', obj } または { kind: 'draft' }。
		// template のときの obj は userData.templates 内の実体そのもの。
		let editing = null;
		// 選択中のID。テンプレートID または DRAFT_SELECTION_ID。
		let selectedId = null;
		let draftScope = draftScopeKey ? loadDraftScope(draftScopeKey) : null;
		// 前回の続きがある場合は、そのまま使えるよう最初から選択しておく。
		if (draftScope && draftScope.skillIds.length > 0) selectedId = DRAFT_SELECTION_ID;

		container.innerHTML = '' +
			'<div data-usd-el="list-view">' +
				'<div class="flex items-center justify-between mb-3">' +
					'<button type="button" class="uma-btn uma-btn--primary" data-usd-act="template-new">＋ 新規作成</button>' +
					'<span class="text-xs text-slate-500" data-usd-el="count-badge"></span>' +
				'</div>' +
				'<div data-usd-el="list"></div>' +
			'</div>' +
			'<div data-usd-el="editor-view" class="usd-panel glass-card" hidden>' +
				'<div class="flex items-center gap-2 mb-3">' +
					'<button type="button" class="usd-icon-btn uma-icon-btn" data-usd-act="editor-close" aria-label="戻る"><i data-lucide="arrow-left" class="w-4 h-4"></i></button>' +
					'<input type="text" class="usd-input uma-input flex-1" data-usd-el="name-input" placeholder="テンプレート名（例：マイルCS想定）"/>' +
					'<p class="flex-1 text-sm font-semibold text-slate-700" data-usd-el="draft-title" hidden>今回だけの対象スキルセット</p>' +
				'</div>' +
				'<button type="button" class="uma-btn uma-btn--secondary mb-3" data-usd-act="editor-pick">' +
					'<i data-lucide="filter" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> スキルを追加' +
				'</button>' +
				'<p class="text-xs text-slate-500 mb-1">選択済みスキル（<span data-usd-el="selected-count">0</span>）</p>' +
				'<div data-usd-el="selected-list" class="flex flex-wrap gap-2"></div>' +
				'<div class="mt-3" data-usd-el="draft-actions" hidden>' +
					'<button type="button" class="uma-btn uma-btn--primary" data-usd-act="draft-promote">テンプレートとして保存</button>' +
					'<p class="text-[11px] text-slate-400 mt-2">保存すると名前を付けて残せます。保存しない場合も、この端末のブラウザには次回まで残ります。</p>' +
				'</div>' +
				'<p class="text-[11px] text-slate-400 mt-4" data-usd-el="editor-note">変更は自動的に保存されます。</p>' +
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
			else if (act === 'template-skill-remove') removeSkillFromEditing(btn.dataset.skillId);
			else if (act === 'draft-open') openDraftEditor();
			else if (act === 'draft-clear') clearDraft();
			else if (act === 'draft-promote') promoteDraftToTemplate();
		});
		container.addEventListener('change', (e) => {
			if (e.target === nameInput) { onNameChange(); return; }
			if (e.target.dataset.usdEl === 'template-radio') { setSelectedId(e.target.value); return; }
		});

		function fireChange() {
			if (opts.onChange) opts.onChange();
		}

		function fireViewChange(view) {
			if (opts.onViewChange) opts.onViewChange(view);
		}

		function fireSelection() {
			if (opts.onSelectionChange) opts.onSelectionChange(getSelection());
		}

		/* ---------- 編集対象の抽象化（テンプレート／ドラフトを同じUIで扱う） ---------- */
		function editingSkillIds() {
			if (!editing) return [];
			return editing.kind === 'draft' ? draftScope.skillIds : editing.obj.skillIds;
		}

		function persistEditing() {
			if (!editing) return;
			if (editing.kind === 'draft') {
				draftScope = saveDraftScope(draftScopeKey, draftScope.skillIds);
			} else {
				editing.obj.updatedAt = nowIso();
				saveUserData();
			}
		}

		/* ---------- 描画 ---------- */
		function render() {
			const isEditing = !!editing;
			listView.hidden = isEditing;
			editorView.hidden = !isEditing;
			if (isEditing) renderEditor(); else renderList();
			fireViewChange(isEditing ? 'editor' : 'list');
		}

		function draftCardHtml() {
			const n = draftScope.skillIds.length;
			const isSel = selectable && selectedId === DRAFT_SELECTION_ID;
			const radio = selectable
				? '<input type="radio" name="usd-tpl-' + esc(container.id || 'panel') + '" data-usd-el="template-radio" value="' + DRAFT_SELECTION_ID + '"' + (isSel ? ' checked' : '') + (n === 0 ? ' disabled' : '') + ' class="shrink-0"/>'
				: '';
			return '' +
			'<label class="usd-list-card uma-list-row' + (selectable ? ' usd-selectable uma-list-row--selectable' : '') + (isSel ? ' usd-selected uma-list-row--selected' : '') + '">' +
				radio +
				'<div class="flex-1 min-w-0">' +
					'<p class="font-semibold text-sm text-slate-800 usd-truncate">今回だけの対象スキルセット<span class="usd-draft-badge">保存しない</span></p>' +
					'<p class="text-xs text-slate-500">' + (n === 0
						? '「編集」から貼り付け・選択して作ります'
						: 'スキル' + n + '件・この端末のブラウザに残ります') + '</p>' +
				'</div>' +
				'<div class="flex gap-1.5 shrink-0">' +
					'<button type="button" class="usd-icon-btn uma-icon-btn" data-usd-act="draft-open" title="編集"><i data-lucide="edit" class="w-4 h-4"></i></button>' +
					'<button type="button" class="usd-icon-btn uma-icon-btn text-red-500" data-usd-act="draft-clear" title="空にする"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' +
				'</div>' +
			'</label>';
		}

		function renderList() {
			const list = ensureUserData().templates;
			q(container, 'count-badge').textContent = list.length + '/' + TEMPLATE_LIMIT + '件';
			const el = q(container, 'list');

			// 削除済みテンプレートが選ばれたままにならないよう掃除する
			if (selectedId && selectedId !== DRAFT_SELECTION_ID && !list.some(t => t.templateId === selectedId)) {
				selectedId = null;
				fireSelection();
			}
			// ドラフトが空になったら選択も外す
			if (selectedId === DRAFT_SELECTION_ID && (!draftScope || draftScope.skillIds.length === 0)) {
				selectedId = null;
				fireSelection();
			}

			let html = draftScopeKey ? draftCardHtml() : '';
			if (list.length === 0) {
				html += draftScopeKey
					? '<p class="text-sm text-slate-400 p-4">保存済みのテンプレートはまだありません。上の「今回だけの対象スキルセット」で試して、繰り返し使うものだけテンプレートに残せます。</p>'
					: '<p class="text-sm text-slate-400 p-4">まだテンプレートがありません。「新規作成」から始めてください。</p>';
			} else {
				html += list.map(t => {
					const isSel = selectable && t.templateId === selectedId;
					const radio = selectable
						? '<input type="radio" name="usd-tpl-' + esc(container.id || 'panel') + '" data-usd-el="template-radio" value="' + esc(t.templateId) + '"' + (isSel ? ' checked' : '') + ' class="shrink-0"/>'
						: '';
					const tag = selectable ? ' usd-selectable uma-list-row--selectable' + (isSel ? ' usd-selected uma-list-row--selected' : '') : '';
					return '' +
					'<label class="usd-list-card uma-list-row' + tag + '">' +
						radio +
						'<div class="flex-1 min-w-0">' +
							'<p class="font-semibold text-sm text-slate-800 usd-truncate">' + esc(t.name || '（名称未設定）') + '</p>' +
							'<p class="text-xs text-slate-500">スキル' + t.skillIds.length + '件・更新 ' + esc((t.updatedAt || '').slice(0, 10)) + '</p>' +
						'</div>' +
						'<div class="flex gap-1.5 shrink-0">' +
							'<button type="button" class="usd-icon-btn uma-icon-btn" data-usd-act="template-open" data-template-id="' + esc(t.templateId) + '" title="開く"><i data-lucide="edit" class="w-4 h-4"></i></button>' +
							'<button type="button" class="usd-icon-btn uma-icon-btn" data-usd-act="template-duplicate" data-template-id="' + esc(t.templateId) + '" title="複製"><i data-lucide="copy" class="w-4 h-4"></i></button>' +
							'<button type="button" class="usd-icon-btn uma-icon-btn text-red-500" data-usd-act="template-delete" data-template-id="' + esc(t.templateId) + '" title="削除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' +
						'</div>' +
					'</label>';
				}).join('');
			}
			el.innerHTML = html;
			refreshIcons();
		}

		function renderEditor() {
			const isDraft = editing.kind === 'draft';
			nameInput.hidden = isDraft;
			q(container, 'draft-title').hidden = !isDraft;
			q(container, 'draft-actions').hidden = !isDraft;
			q(container, 'editor-note').hidden = isDraft;
			if (!isDraft) nameInput.value = editing.obj.name;
			renderSelectedList();
		}

		function renderSelectedList() {
			const ids = editingSkillIds();
			const el = q(container, 'selected-list');
			q(container, 'selected-count').textContent = String(ids.length);
			if (ids.length === 0) {
				el.innerHTML = '<p class="text-xs text-slate-400">まだスキルが選択されていません。</p>';
				return;
			}
			el.innerHTML = ids.map(id =>
				// 名前と×の間の空白は元の実装（テンプレートリテラルの改行）と同じ見え方にするため意図的
				'<span class="usd-chip">' + esc(getSkillName(id)) + ' ' +
					'<button type="button" class="ml-1" data-usd-act="template-skill-remove" data-skill-id="' + esc(id) + '" aria-label="削除"><i data-lucide="x" class="w-3 h-3"></i></button>' +
				'</span>'
			).join('');
			refreshIcons();
		}

		/* ---------- テンプレートの編集 ---------- */
		function openEditor(templateId) {
			const data = ensureUserData();
			if (templateId) {
				const t = data.templates.find(x => x.templateId === templateId);
				if (!t) return;
				editing = { kind: 'template', obj: t };
			} else {
				if (data.templates.length >= TEMPLATE_LIMIT) {
					toast('テンプレートは最大' + TEMPLATE_LIMIT + '件までです。不要なものを削除してください');
					return;
				}
				// 新規テンプレートはこの時点で即座に配列へ追加し、以降は全操作を自動保存する。
				// 名前もスキルも入力されないまま閉じられた場合のみ、closeEditor側で破棄する。
				const t = { templateId: uid('tpl'), name: '', skillIds: [], createdAt: nowIso(), updatedAt: nowIso() };
				data.templates.push(t);
				editing = { kind: 'template', obj: t };
				saveUserData();
				fireChange();
			}
			render();
		}

		function openDraftEditor() {
			if (!draftScopeKey) return;
			editing = { kind: 'draft' };
			render();
		}

		function closeEditor() {
			// スキルが1件も選ばれていない未完成の下書きは、一覧を汚さないよう自動で破棄する
			// （ドラフトは空でも一覧に常駐するので、この処理はテンプレートだけ）。
			if (editing && editing.kind === 'template' && editing.obj.skillIds.length === 0) {
				const data = ensureUserData();
				const gone = editing.obj;
				data.templates = data.templates.filter(t => t.templateId !== gone.templateId);
				saveUserData();
			}
			editing = null;
			closePicker();
			render();
			fireChange();
		}

		function onNameChange() {
			if (!editing || editing.kind !== 'template') return;
			editing.obj.name = nameInput.value;
			editing.obj.updatedAt = nowIso();
			saveUserData();
			fireChange();
		}

		function openEditorPicker() {
			const target = editing;
			openSkillPicker(editingSkillIds(), (ids) => {
				const list = target.kind === 'draft' ? draftScope.skillIds : target.obj.skillIds;
				ids.forEach(id => { if (!list.includes(id)) list.push(id); });
				persistEditing();
				renderSelectedList();
				// ドラフトに中身ができたら、そのまま使えるよう選択状態にする
				if (target.kind === 'draft' && draftScope.skillIds.length > 0 && selectedId !== DRAFT_SELECTION_ID) {
					selectedId = DRAFT_SELECTION_ID;
					fireSelection();
				} else if (isSelected(target)) {
					fireSelection();
				}
				fireChange();
			});
		}

		// 編集中の対象が、いま選択されているものかどうか
		function isSelected(target) {
			if (!target) return false;
			return target.kind === 'draft'
				? selectedId === DRAFT_SELECTION_ID
				: selectedId === target.obj.templateId;
		}

		function removeSkillFromEditing(skillId) {
			const target = editing;
			if (!target) return;
			const list = target.kind === 'draft' ? draftScope.skillIds : target.obj.skillIds;
			const idx = list.indexOf(skillId);
			if (idx === -1) return;
			const name = getSkillName(skillId);
			list.splice(idx, 1);
			persistEditing();
			picker.excludeIds = picker.excludeIds.filter(id => id !== skillId);
			renderSelectedList();
			renderPickerResults();
			renderPasteReport();
			if (isSelected(target)) fireSelection();
			fireChange();
			pushUndo('スキル「' + name + '」を削除しました', () => {
				list.splice(idx, 0, skillId);
				if (target.kind === 'draft') draftScope = saveDraftScope(draftScopeKey, draftScope.skillIds);
				else saveUserData();
				render();
				if (isSelected(target)) fireSelection();
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

		/* ---------- ドラフト ---------- */
		function clearDraft() {
			if (!draftScope || draftScope.skillIds.length === 0) return;
			const prev = draftScope.skillIds.slice();
			draftScope = saveDraftScope(draftScopeKey, []);
			if (selectedId === DRAFT_SELECTION_ID) selectedId = null;
			render();
			fireSelection();
			fireChange();
			pushUndo('今回だけの対象スキルセットを空にしました', () => {
				draftScope = saveDraftScope(draftScopeKey, prev);
				selectedId = DRAFT_SELECTION_ID;
				render();
				fireSelection();
				fireChange();
			});
		}

		// ドラフトをテンプレートへ昇格する。名前は昇格後の編集画面で付けてもらう
		// （ここで prompt を出すと、他の画面の作法と揃わないため）。
		function promoteDraftToTemplate() {
			if (!draftScope || draftScope.skillIds.length === 0) { toast('スキルを1件以上選んでください'); return; }
			const data = ensureUserData();
			if (data.templates.length >= TEMPLATE_LIMIT) {
				toast('テンプレートは最大' + TEMPLATE_LIMIT + '件までです。不要なものを削除してください');
				return;
			}
			const skillIds = draftScope.skillIds.slice();
			const t = { templateId: uid('tpl'), name: '', skillIds: skillIds, createdAt: nowIso(), updatedAt: nowIso() };
			data.templates.push(t);
			saveUserData();
			// 中身はテンプレートへ移ったので、ドラフトは空にする（二重管理を避ける）
			draftScope = saveDraftScope(draftScopeKey, []);
			editing = { kind: 'template', obj: t };
			selectedId = t.templateId;
			render();
			nameInput.focus();
			fireSelection();
			fireChange();
			toast('テンプレートとして保存しました。名前を入力してください');
		}

		/* ---------- 選択 ---------- */
		function setSelectedId(id) {
			if (id === DRAFT_SELECTION_ID) {
				selectedId = (draftScope && draftScope.skillIds.length > 0) ? DRAFT_SELECTION_ID : null;
			} else {
				selectedId = ensureUserData().templates.some(t => t.templateId === id) ? id : null;
			}
			renderList();
			fireSelection();
		}

		function getSelection() {
			if (selectedId === DRAFT_SELECTION_ID && draftScope && draftScope.skillIds.length > 0) {
				return { kind: 'draft', id: DRAFT_SELECTION_ID, name: '今回だけの対象スキルセット', skillIds: draftScope.skillIds.slice() };
			}
			const t = ensureUserData().templates.find(x => x.templateId === selectedId);
			if (!t) return null;
			return { kind: 'template', id: t.templateId, name: t.name || '（名称未設定）', skillIds: t.skillIds.slice() };
		}

		render();

		return {
			render: render,
			isEditing: function () { return !!editing; },
			openEditor: openEditor,
			closeEditor: closeEditor,
			getSelection: getSelection,
			setSelectedId: setSelectedId,
			// 旧API（テンプレートIDだけを扱う）。呼び出し元の移行が済むまで残す。
			getSelectedTemplateId: function () { return selectedId; }
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

	/**
	 * 比較シートを1件作る（ツール非依存）。
	 *
	 * sourceTemplateId は空でもよい。保存していない一時的な対象スキルセット
	 * （ドラフト）から作った場合、紐づくテンプレートが存在しないため。
	 * その場合でも skillIds は値コピーされるので、シート単体で完結する。
	 */
	function createRecord(spec) {
		const data = ensureUserData();
		if (data.records.length >= RECORD_LIMIT) {
			toast('比較シートは最大' + RECORD_LIMIT + '件までです。不要なものを削除してください');
			return null;
		}
		const skillIds = (spec && spec.skillIds) ? spec.skillIds.slice() : [];
		if (skillIds.length === 0) { toast('対象スキルが空です'); return null; }
		const record = {
			recordId: uid('rec'),
			name: (spec.name && spec.name.trim()) ? spec.name.trim() : '候補比較',
			sourceTemplateId: spec.sourceTemplateId || '',
			skillIds: skillIds, candidates: [], cells: {}, ocrCells: {},
			createdAt: nowIso(), updatedAt: nowIso()
		};
		data.records.push(record);
		saveUserData();
		return record;
	}

	function createRecordFromTemplate(templateId, name) {
		const t = ensureUserData().templates.find(x => x.templateId === templateId);
		if (!t) { toast('テンプレートを選択してください'); return null; }
		return createRecord({
			name: (name && name.trim()) ? name : (t.name + ' 候補比較'),
			skillIds: t.skillIds,
			sourceTemplateId: t.templateId
		});
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
			// 現在値と同時に「OCRが書いた原本値」も ocrCells に控える。
			// この2つのズレが「人が手で直した」の判定になる（isEditedCell 参照）。
			// ここが ocrCells に書き込む唯一の場所で、手入力側（setStar）は絶対に触らない。
			if (!record.ocrCells) record.ocrCells = {};
			record.skillIds.forEach(sid => {
				if (!record.cells[sid]) record.cells[sid] = {};
				if (!record.ocrCells[sid]) record.ocrCells[sid] = {};
				const v = clampStar(stars[sid]);
				record.cells[sid][candidateId] = v;
				record.ocrCells[sid][candidateId] = v;
			});
			written++;
		});

		record.updatedAt = nowIso();
		saveUserData();
		return { ok: true, cancelled: false, written: written, addedLabels: addedLabels, overwrittenLabels: overwrittenLabels, skippedSkillIds: skippedSkillIds };
	}

	/**
	 * そのセルが「OCRの読み取り結果から人が手で変えたもの」かどうか。
	 *
	 * 判定は「原本値（ocrCells）と現在値（cells）が食い違うか」だけ。
	 * 原本値が無いセルは false を返す。これがこの設計の要で、
	 * 次のすべてが特別扱い無しで正しく決まる:
	 *
	 * - 新規シート・手で追加した候補 … 原本値が無いので枠が付かない（真っ赤にならない）
	 * - OCRを通した列           … applyStarAssignments が列の全スキルに書くので、
	 *                              0も含めて原本値が揃う。以後のズレは全部拾える
	 * - 値を0に直した場合        … 原本値2 ≠ 現在値0 なので枠が付く
	 * - 元のOCR値に戻した場合    … 一致するので枠が消える
	 * - OCR後に足したスキル行    … そのセルだけ原本値が無いので誤検知しない
	 * - カスタムスキル           … OCRの照合辞書は対象スキルセットの名前から作られ、
	 *                              マスター由来かカスタムかを区別しない。つまり
	 *                              カスタムスキルもOCRで読まれる。特別扱いはしない
	 *                              （常に手動扱いにすると、OCRが正しく読めた列まで
	 *                                永久に枠が付いてノイズになる）
	 */
	function isEditedCell(record, skillId, candidateId) {
		if (!record || !record.ocrCells) return false;
		const base = record.ocrCells[skillId];
		if (!base || base[candidateId] === undefined) return false;
		const cur = (record.cells && record.cells[skillId]) ? record.cells[skillId][candidateId] : undefined;
		return base[candidateId] !== (cur === undefined ? 0 : cur);
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
		DECK_TEXT_MATCH_MAX_DISTANCE: DECK_TEXT_MATCH_MAX_DISTANCE,
		DECK_TEXT_MATCH_MIN_LENGTH_FOR_FUZZY: DECK_TEXT_MATCH_MIN_LENGTH_FOR_FUZZY,
		DRAFT_SELECTION_ID: DRAFT_SELECTION_ID,

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

		// 一括貼り付けテキストのマッチング（UIを持たない純粋なロジック）
		matchPastedSkillText: matchPastedSkillText,
		normalizeSkillText: normalizeSkillText,
		stripSkillTextRank: stripSkillTextRank,

		// ドラフト（保存しない一時的な対象スキルセット）
		loadDraftScope: loadDraftScope,
		saveDraftScope: saveDraftScope,
		clearDraftScope: clearDraftScope,

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
		createRecord: createRecord,
		createRecordFromTemplate: createRecordFromTemplate,
		listRecordSummaries: listRecordSummaries,
		listCandidateSummaries: listCandidateSummaries,
		normalizeCandidateEnabled: normalizeCandidateEnabled,
		countEnabledCandidates: countEnabledCandidates,
		applyStarAssignments: applyStarAssignments,
		isEditedCell: isEditedCell,

		// Undo
		pushUndo: pushUndo,
		performUndo: performUndo,
		undoCount: function () { return undoStack.length; },
		onUndoChanged: onUndoChanged,
		clearUndo: function () { undoStack = []; notifyUndoChanged(); }
	};
})(window);
