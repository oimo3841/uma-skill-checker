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
	const UMA_SKILL_DECK_CORE_JS_VERSION = '2026-09-18d';

	/* ============================================================
	 * 定数
	 * ============================================================ */
	const STORAGE_KEY_USER = 'umaSkillDeck:userData';
	const STORAGE_KEY_MASTER = 'umaSkillDeck:masterCache';
	const MASTER_JSON_PATH = 'uma-skill-deck-skills.json';

	/* ------------------------------------------------------------
	 * 追加カタログ（マスター445種の外にある、比較の対象にできるもの）
	 *
	 * マスターは「白スキル445種」だけを載せる決まりなので、そこに無いもの
	 * （シナリオ因子など）はマスターには足せない。かといって利用者の
	 * カスタムスキルにすると、利用者の枠を食い・消せてしまい・書き出しにも混ざる。
	 * そこで「配布物として用意する、マスターとは別のカタログ」をここに持つ。
	 *
	 * **特定のカテゴリ専用の仕組みにしないこと。** 1ファイル＝1カテゴリで、
	 * カテゴリを増やすときは同じ形のJSONをもう1つ作ってこの配列に並べるだけにする
	 * （読み込み・キャッシュ・組み込みの写しは、どのカテゴリでも同じ経路を通る）。
	 *
	 * ファイルの形（catalog-data/*.json）:
	 *   { dataVersion, category, entries: [{ id, name }] }
	 * category はファイル単位。読み込んだ各エントリに category を押して、
	 * findSkill() が返すオブジェクトの kind になる。
	 *
	 * id はマスターの id（1〜445 の数字）と衝突しない接頭辞を付けること
	 * （保存済みの比較シートは id で行を指すため、衝突すると別物にすり替わる）。
	 * ------------------------------------------------------------ */
	const STORAGE_KEY_EXTRA_CATALOG = 'umaSkillDeck:extraCatalogCache';
	const EXTRA_CATALOG_SOURCES = [
		{ category: 'scenarioFactor', path: 'catalog-data/scenario-inheritance-factors.json' },
		// マスター445種の外にあるスキル（C-48・C-49）。件数が多いので EMBEDDED_EXTRA_CATALOG に
		// 写しは持たない（取得もキャッシュも駄目だったときは、黙って劣化させず知らせる）。
		{ category: 'extendedSkill', path: 'catalog-data/extended-skills.json' }
		// 育成ウマ娘・サポートカードはここに入れない。スキルではないので、入れると
		// findSkill() と名前の索引にカード名・ウマ娘名が混ざる（C-49）。
	];
	const TEMPLATE_LIMIT = 10;
	// 編成（育成ウマ娘1人＋サポートカード6枚）。テンプレート・比較シートと同じく
	// 「利用者が作ったもの」なので userData に置き、書き出し／取り込みの対象にする（C-51）。
	const ROSTER_LIMIT = 5;
	const ROSTER_CARD_SLOTS = 6;
	const RECORD_LIMIT = 10;
	const CUSTOM_SKILL_SOFT_CAP = 50;
	const STAR_MIN = 0;
	const STAR_MAX = 3;
	const MAX_ENABLED_CANDIDATES = 6;
	const UNDO_STACK_LIMIT = 20;

	// 一度にこの数以上のスキルを足したときだけ「元に戻す」に積む。
	// 1種だけの追加はチップの×で消せるのでUndoの出番が薄く、スタックを埋める害のほうが大きい。
	// （手入力の「マスターにないスキルを追加」は構造上つねに1種ずつなので、この線引きで自動的に外れる。
	//   ただしカスタムスキルそのものは×で外してもマスターに残り続ける。削除UIが無い点はD節の課題）
	const UNDO_MIN_BULK_ADD = 2;

	// 一括貼り付けでスキル名を照合するときのしきい値。
	// 実機での使用感しだいで調整できるよう独立した定数にしてある
	// （変更したら UMA_SKILL_DECK_CORE_JS_VERSION を上げるだけで反映される）。
	//
	// MIN_LENGTH_FOR_FUZZY を設けている理由: 短いスキル名ほど1文字違いの
	// 破壊力が大きく、まったく別のスキルに化けやすい。実データ（439件）でも
	// 3文字以下どうしで距離1のペアが複数存在するため、短い名前は完全一致のみ許す。
	const DECK_TEXT_MATCH_MAX_DISTANCE = 1;
	const DECK_TEXT_MATCH_MIN_LENGTH_FOR_FUZZY = 4;

	// 要確認の行から開く「名前を入れて探す」の一覧に出す上限（32セッション目）。
	// 20 にした理由: 1文字だけ入れた時点では数十件当たることがあり、全部出すと一覧が長くなって
	// 「絞り込む」という操作の意味が伝わらない。20 なら狭い画面でも数回のスクロールで見渡せ、
	// かつ 2文字入れればほとんどの場合これを下回るので、上限に当たること自体が
	// 「もう少し入力してください」の合図になる。超えたぶんは件数だけ知らせる。
	const NAME_FIND_LIMIT = 20;
	// 絞り込みを走らせるまでの待ち（ms）。1文字ごとに 445 件を走査して描き直すのを避ける。
	const NAME_FIND_DEBOUNCE_MS = 120;
	// 編成のミニウィンドウに一度に出す候補の上限（C-51 の修正）。
	// 559枚を一度に描くと重く、目でも追えないので切る。絞り込めば必ず届く。
	const PICK_LIST_LIMIT = 60;

	// ドラフト（保存しない一時的な対象スキルセット）の保存先の接頭辞。
	// scope名を後ろに付けるので、将来 exam 側が合流しても衝突しない。
	const STORAGE_KEY_DRAFT_PREFIX = 'umaSkillDeck:draftScope:';

	// テンプレート一覧の中でドラフトを指すための番号（テンプレートIDと衝突しない形）。
	const DRAFT_SELECTION_ID = '__draft__';

	// 8軸のタグ辞書。フィルターパネル・タグ表示・カスタムスキル入力で共有する。
	const TAG_AXES = [
		{ key: 'distance', label: '①距離', options: [
			{ v: 'short', t: '短距離' }, { v: 'mile', t: 'マイル' }, { v: 'medium', t: '中距離' }, { v: 'long', t: '長距離' }
		]},
		{ key: 'style', label: '②脚質', options: [
			{ v: 'nige', t: '逃げ' }, { v: 'senko', t: '先行' }, { v: 'sashi', t: '差し' }, { v: 'oikomi', t: '追込' }
		]},
		{ key: 'effect', label: '③効果タイプ', options: [
			{ v: 'target_speed_up', t: '速度アップ' }, { v: 'accel_up', t: '加速度アップ' }, { v: 'move_forward', t: '前に出る' }, { v: 'extend', t: '伸び' },
			{ v: 'stamina', t: '持久力回復' }, { v: 'stamina_down', t: '持久力減少' }, { v: 'speed_down', t: '速度ダウン' }, { v: 'start_good', t: 'スタート得意' }, { v: 'course_sense', t: 'コース取り' },
			{ v: 'lane_change', t: 'レーン移動' }, { v: 'temptation_time', t: '掛かり時間' }, { v: 'vision', t: '視野' },
			{ v: 'speed_up', t: 'スピードアップ' }, { v: 'stamina_up', t: 'スタミナアップ' }, { v: 'power_up', t: 'パワーアップ' },
			{ v: 'guts_up', t: '根性アップ' }, { v: 'wisdom_up', t: '賢さアップ' }, { v: 'all_up', t: '全てアップ' }
		]},
		{ key: 'phase', label: '④フェーズ', options: [
			{ v: 'early', t: '序盤' }, { v: 'mid', t: '中盤' }, { v: 'late', t: '終盤' }, { v: 'lastspurt', t: 'ラストスパート' }
		]},
		{ key: 'coursePos', label: '⑤コース位置', options: [
			{ v: 'corner', t: 'コーナー' }, { v: 'straight', t: '直線' }, { v: 'uphill', t: '上り坂' }, { v: 'downhill', t: '下り坂' }
		]},
		{ key: 'environment', label: '⑥その他1（レース環境）', options: [
			{ v: 'ground_good', t: '良バ場' }, { v: 'ground_bad', t: '道悪' },
			{ v: 'surface_turf', t: '芝' }, { v: 'surface_dirt', t: 'ダート' },
			{ v: 'right_turn', t: '右回り' }, { v: 'left_turn', t: '左回り' }, { v: 'small_track', t: '小回り' }, { v: 'straight_course', t: '直線コース' },
			{ v: 'weather_sunny', t: '晴れ' }, { v: 'weather_cloudy', t: '曇り' }, { v: 'weather_rain', t: '雨' }, { v: 'weather_snow', t: '雪' },
			{ v: 'season_spring', t: '春' }, { v: 'season_summer', t: '夏' }, { v: 'season_autumn', t: '秋' }, { v: 'season_winter', t: '冬' },
			{ v: 'time_day', t: '昼' }, { v: 'time_evening', t: '夕方' }, { v: 'time_night', t: 'ナイター' },
			{ v: 'distance_basis', t: '根幹距離' }, { v: 'distance_nonbasis', t: '非根幹距離' }
		]},
		{ key: 'trackVenue', label: '⑦その他2（レース場）', options: [
			{ v: 'track_sapporo', t: '札幌' }, { v: 'track_hakodate', t: '函館' }, { v: 'track_fukushima', t: '福島' }, { v: 'track_niigata', t: '新潟' },
			{ v: 'track_nakayama', t: '中山' }, { v: 'track_tokyo', t: '東京' }, { v: 'track_chukyo', t: '中京' }, { v: 'track_kyoto', t: '京都' },
			{ v: 'track_hanshin', t: '阪神' }, { v: 'track_kokura', t: '小倉' },
			{ v: 'track_oi', t: '大井' }, { v: 'track_kawasaki', t: '川崎' }, { v: 'track_funabashi', t: '船橋' }, { v: 'track_morioka', t: '盛岡' },
			{ v: 'track_longchamp', t: 'ロンシャン' }, { v: 'track_santaanita', t: 'サンタアニタパーク' }, { v: 'track_delmar', t: 'デルマー' }
		]},
		// 該当/非該当だけの単一フラグ軸。選択肢は1つしかないので、
		// 「条件を持たない＝万能スキル」という他の軸の扱いは当てはめない（flagAxis）。
		{ key: 'scenario', label: '⑧その他3（シナリオスキル）', flagAxis: true, options: [
			{ v: 'scenario', t: 'シナリオスキル' }
		]}
	];

	/* フェッチもキャッシュも駄目だったときに使う、追加カタログの組み込みの写し。
	   カタログが1件も無いと、保存済みの比較シートの行が「（不明なスキル：…）」に化けるので、
	   マスターのサンプルと違ってこちらは**全件**を持つ。
	   正本は catalog-data/ の各JSON。写しとの食い違いは npm run test:norm が見張る。 */
	const EMBEDDED_EXTRA_CATALOG = {
		scenarioFactor: [
			{ id: 'sf-ura', name: 'URAシナリオ' },
			{ id: 'sf-aoharu', name: 'アオハル杯シナリオ' },
			{ id: 'sf-climax', name: 'クライマックスシナリオ' },
			{ id: 'sf-grandlive', name: 'グランドライブシナリオ' },
			{ id: 'sf-grandmasters', name: 'グランドマスターズシナリオ' },
			{ id: 'sf-larc', name: "L'Arcシナリオ" },
			{ id: 'sf-uaf-sphere', name: 'U.A.F.シナリオ・スフィア' },
			{ id: 'sf-uaf-fight', name: 'U.A.F.シナリオ・ファイト' },
			{ id: 'sf-uaf-free', name: 'U.A.F.シナリオ・フリー' },
			{ id: 'sf-housyoku-carrot', name: '豊食祭シナリオ・にんじん' },
			{ id: 'sf-housyoku-garlic', name: '豊食祭シナリオ・にんにく' },
			{ id: 'sf-housyoku-potato', name: '豊食祭シナリオ・じゃがいも' },
			{ id: 'sf-housyoku-chili', name: '豊食祭シナリオ・唐辛子' },
			{ id: 'sf-housyoku-strawberry', name: '豊食祭シナリオ・いちご' },
			{ id: 'sf-mecha-spd', name: 'メカウマ娘シナリオ・SPD' },
			{ id: 'sf-mecha-stm', name: 'メカウマ娘シナリオ・STM' },
			{ id: 'sf-mecha-pow', name: 'メカウマ娘シナリオ・POW' },
			{ id: 'sf-mecha-guts', name: 'メカウマ娘シナリオ・GUTS' },
			{ id: 'sf-mecha-wit', name: 'メカウマ娘シナリオ・WIT' },
			{ id: 'sf-legends', name: 'Legendsシナリオ' },
			{ id: 'sf-island', name: '無人島シナリオ' },
			{ id: 'sf-onsen', name: '温泉郷シナリオ' },
			{ id: 'sf-dreams', name: 'Dreamsシナリオ' },
			{ id: 'sf-tresen', name: 'トレセン軒シナリオ' }
		]
	};

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
	// 追加カタログ（全カテゴリを1本の配列にまとめたもの）。各要素は { id, name, category }。
	let extraCatalog = [];
	let extraCatalogMeta = { entryCount: 0, sources: [] };
	let trainingSources = { };
	let trainingMeta = { loaded: false, sources: [] };

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
		// schemaVersion 3 で rosters（編成）が加わった。これも読み込み側は分岐しない
		// （rosters が無いデータは「編成が1件も無い」として扱えば正しく動く。C-51）。
		// 既存のデータに rosters を**後から足すことはしない**。足すのは編成を保存したときだけ。
		return { schemaVersion: 3, templates: [], records: [], customSkills: [], rosters: [] };
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
			// **rosters はここで補わない。** 補うと、編成を1件も作っていない人でも
			// ページを開いただけで保存データの姿が変わってしまう（次の保存で
			// localStorage に rosters: [] が書き足される）。読む側が毎回 `|| []` で
			// 受けるので、持たない古い形（schemaVersion 2 以前）のままで正しく動く。
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
		// rosters は loadUserData() と同じ理由で補わない（保存データの姿を勝手に変えない）。
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

	/* ------------------------------------------------------------
	 * 追加カタログの読み込み（fetch → キャッシュ → 組み込みの写し）
	 *
	 * マスターと同じ3段のフォールバック。カテゴリ名で分岐しない
	 * （EXTRA_CATALOG_SOURCES に並べたぶんだけ同じ処理を回す）。
	 * 1カテゴリが落ちても他のカテゴリは読めたぶんだけ使う。
	 * ------------------------------------------------------------ */
	function normalizeCatalogEntries(data, category) {
		const list = (data && Array.isArray(data.entries)) ? data.entries : [];
		return list
			.filter(e => e && e.id && e.name)
			.map(e => ({ id: String(e.id), name: String(e.name), category: category }));
	}

	async function loadExtraCatalog(forceRefresh) {
		let cached = null;
		try { cached = JSON.parse(global.localStorage.getItem(STORAGE_KEY_EXTRA_CATALOG) || 'null'); } catch (e) {}
		const nextCache = {};
		const entries = [];
		const sources = [];

		for (let i = 0; i < EXTRA_CATALOG_SOURCES.length; i++) {
			const src = EXTRA_CATALOG_SOURCES[i];
			let data = null, from = '';
			try {
				data = await fetchMasterJson(src.path, !!forceRefresh);
				from = '取得';
			} catch (e) {
				if (cached && cached.data && cached.data[src.category]) { data = cached.data[src.category]; from = 'キャッシュ'; }
			}
			let list = normalizeCatalogEntries(data, src.category);
			if (list.length === 0) {
				// 組み込みの写し。ここまで来ても空なら、そのカテゴリは今回は無いものとして進む。
				list = (EMBEDDED_EXTRA_CATALOG[src.category] || [])
					.map(e => ({ id: e.id, name: e.name, category: src.category }));
				data = null;
				from = '組み込み';
			}
			if (data) nextCache[src.category] = data;
			list.forEach(e => entries.push(e));
			sources.push({ category: src.category, count: list.length, from: from, version: (data && data.dataVersion) || '' });
		}

		extraCatalog = entries;
		extraCatalogMeta = { entryCount: entries.length, sources: sources };

		// 1件も読めなかったカテゴリは**黙って進めない**（C-49）。
		// 組み込みの写しを持たないカテゴリ（拡張スキル）では、取得にもキャッシュにも
		// 失敗すると中身が丸ごと空になる。そのまま進むと、保存済みの比較シートの行が
		// 「（不明なスキル：…）」に化けた理由が利用者にも開発者にも分からなくなる。
		const emptyCategories = sources.filter(s => s.count === 0).map(s => s.category);
		if (emptyCategories.length > 0) {
			const msg = '収録データを読み込めませんでした（' + emptyCategories.join('・') + '）。'
				+ '通信できないときは、ページを開き直すと直ることがあります。';
			try { global.console.warn('[UmaSkillDeck] ' + msg); } catch (e) {}
			toast(msg);
		}
		try {
			global.localStorage.setItem(STORAGE_KEY_EXTRA_CATALOG, JSON.stringify({ data: nextCache, fetchedAt: nowIso() }));
		} catch (e) {}
		return extraCatalogMeta;
	}

	/**
	 * 収録スキルデータの読み込み。
	 * 追加カタログ（EXTRA_CATALOG_SOURCES）もここで一緒に読む。呼び出し側が
	 * 別々に呼ぶ形にすると、片方を呼び忘れたページだけ保存済みシートの行が
	 * 「（不明なスキル：…）」に化けるため、入口を1つに寄せてある。
	 */
	async function loadMasterSkills(forceRefresh, masterJsonPath) {
		await loadExtraCatalog(forceRefresh);
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
	 * 収録データ（育成ウマ娘・サポートカード・イベントスキル）
	 *
	 * 追加カタログ（EXTRA_CATALOG_SOURCES）とは別に扱う。あちらは
	 * 「比較シートの行になりうるもの＝スキル」で、こちらは「スキルを供給する側」。
	 * 一緒にすると findSkill() と名前の索引にカード名・ウマ娘名が混ざる（C-49）。
	 *
	 * **起動時には読まない。** これを必要とする画面が loadTrainingSources() を
	 * 呼んだときだけ読む（比較シートの行にはならないので、読み忘れても
	 * 保存済みのデータが化けることはない）。
	 * ============================================================ */
	const TRAINING_SOURCES = [
		{ key: 'trainingUmamusume', path: 'catalog-data/training-umamusume.json' },
		{ key: 'supportCard', path: 'catalog-data/support-cards.json' },
		{ key: 'supportCardEventSkill', path: 'catalog-data/support-card-event-skills.json' }
	];

	/**
	 * 収録データを読む。キャッシュも組み込みの写しも持たない（件数が多く、
	 * 保存済みのデータが化ける類のものでもないため）。読めなければそのキーは空のまま返し、
	 * 呼び出し側が「読み込めませんでした」と出せるように meta に残す。
	 */
	async function loadTrainingSources(forceRefresh) {
		const next = {};
		const sources = [];
		for (let i = 0; i < TRAINING_SOURCES.length; i++) {
			const src = TRAINING_SOURCES[i];
			try {
				const data = await fetchMasterJson(src.path, !!forceRefresh);
				next[src.key] = data;
				sources.push({ key: src.key, count: (data && data.entries ? data.entries.length : 0), version: (data && data.dataVersion) || '', ok: true });
			} catch (e) {
				next[src.key] = null;
				sources.push({ key: src.key, count: 0, version: '', ok: false });
			}
		}
		trainingSources = next;
		trainingMeta = { loaded: true, sources: sources };
		const failed = sources.filter(s => !s.ok).map(s => s.key);
		if (failed.length > 0) {
			const msg = '収録データを読み込めませんでした（' + failed.join('・') + '）。';
			try { global.console.warn('[UmaSkillDeck] ' + msg); } catch (e) {}
			toast(msg);
		}
		return trainingMeta;
	}

	/**
	 * 画面に出す名前。二つ名には重複があるので（同じ二つ名の別のウマ娘がいる）、
	 * **必ず二つ名とウマ娘名の両方**を出す。育成ウマ娘・サポートカードで共通。
	 */
	function formatEntryLabel(entry) {
		if (!entry) return '';
		const title = entry.title ? '[' + entry.title + ']' : '';
		return title + (entry.charaName || '');
	}

	/** イベントスキルの状態。'done'（ある）/ 'none'（無い）/ 'pending'（未確認＝行が無い） */
	function eventStatusOf(cardId) {
		const doc = trainingSources.supportCardEventSkill;
		const rows = (doc && doc.entries) || [];
		const row = rows.find(r => r && r.cardId === cardId);
		return row ? row.status : 'pending';
	}

	/** そのカードのイベントスキルの参照（[{skillId, name}]）。未確認・無しなら空配列。 */
	function getEventSkillsOf(cardId) {
		const doc = trainingSources.supportCardEventSkill;
		const rows = (doc && doc.entries) || [];
		const row = rows.find(r => r && r.cardId === cardId);
		return (row && row.skills) ? row.skills.slice() : [];
	}

	/**
	 * 収録データ（育成ウマ娘・サポートカード）から参照してよいスキルか。
	 * 参照先はマスターのスキルと拡張スキルだけで、シナリオ因子や
	 * 利用者のカスタムスキルは対象外（check:catalog の判定と同じ範囲）。
	 * カテゴリ名を呼び出し側に書かせないよう、判定はここに置く。
	 */
	const REFERABLE_CATALOG_CATEGORY = 'extendedSkill';
	function isReferableSkillId(skillId) {
		if (masterSkills.some(s => s.id === skillId)) return true;
		return skillCatalogKind(skillId) === REFERABLE_CATALOG_CATEGORY;
	}

	/* ============================================================
	 * 編成（育成ウマ娘1人＋サポートカード6枚）
	 *
	 * 「この編成のカードと覚醒で得られるスキル」を割り出すためのデータ層。
	 * 画面は createRosterPanel()（呼び出し元に依存しないパネル）。
	 *
	 * **保存するのは id だけ**（名前もスキルも持たない）。収録データが更新されたら
	 * 自動で追随させるため。id が引けなくなった行は、消さずに「読み込めません」と出す。
	 * ============================================================ */
	function findUma(umaId) {
		const src = trainingSources.trainingUmamusume;
		const list = (src && src.entries) || [];
		return list.find(e => e && e.id === umaId) || null;
	}
	function findCard(cardId) {
		const src = trainingSources.supportCard;
		const list = (src && src.entries) || [];
		return list.find(e => e && e.id === cardId) || null;
	}
	function listUmas() {
		const src = trainingSources.trainingUmamusume;
		return ((src && src.entries) || []).slice();
	}
	function listCards() {
		const src = trainingSources.supportCard;
		return ((src && src.entries) || []).slice();
	}

	/**
	 * サポートカードの種類（スピード・スタミナ…）。**値も並び順もデータに従う** ――
	 * 種類の名前をこのファイルに書かない（恒久ルール1の精神）。
	 * データにまだ `type` が無ければ空配列を返し、呼び出し側は絞り込みを出さない。
	 */
	function listCardTypes() {
		const out = [];
		listCards().forEach(c => {
			const t = c && c.type;
			if (t && out.indexOf(t) === -1) out.push(t);
		});
		return out;
	}
	function cardTypeOf(card) { return (card && card.type) || ''; }

	/** そのウマ娘で選べる★（initialSkills のしきい値）。データが無ければ空。 */
	function starChoicesOf(uma) {
		const rows = (uma && uma.initialSkills) || [];
		return rows.map(r => r.minStar).filter(n => typeof n === 'number').sort((a, b) => a - b);
	}
	/**
	 * そのウマ娘の覚醒レベルの上限。**コードに数を書かない** ―― データにある
	 * level の最大値から決める（ゲーム側で上限が変わっても直さずに済む。C-48）。
	 * level 0 は「覚醒のレベルに紐づかない枠」なので上限には数えない。
	 */
	function maxAwakeningLevelOf(uma) {
		const rows = (uma && uma.awakeningSkills) || [];
		return rows.reduce((max, r) => (typeof r.level === 'number' && r.level > max ? r.level : max), 0);
	}

	/**
	 * 編成で得られるスキルを割り出す。
	 *
	 * 返り値:
	 *   skillIds        … 得られると分かっているスキルのID（重複なし）
	 *   items           … [{ skillId, name, origins: [由来の文言] }]（表示用）
	 *   unconfirmed     … [{ cardId, label, what }] まだ調べていないもの
	 *   missing         … [{ kind, id }] id を引けなかったもの（行は消さずに知らせる）
	 *
	 * **未確認のものは得られる側に入れない。** 除外しすぎて対象スキルセットから
	 * 必要なスキルが落ちるほうが痛いので、「得られると分かっているもの」だけを返す。
	 */
	function computeRosterSkills(roster) {
		const items = new Map();   // skillId → { skillId, name, origins: [] }
		const unconfirmed = [];
		const missing = [];
		const add = (ref, origin) => {
			if (!ref || !ref.skillId) return;
			const sk = findSkill(ref.skillId);
			if (!sk) { missing.push({ kind: 'skill', id: ref.skillId }); return; }
			const cur = items.get(ref.skillId) || { skillId: ref.skillId, name: sk.name, origins: [] };
			if (cur.origins.indexOf(origin) === -1) cur.origins.push(origin);
			items.set(ref.skillId, cur);
		};

		const r = roster || {};
		// ── 育成ウマ娘 ──
		if (r.umaId) {
			const uma = findUma(r.umaId);
			if (!uma) missing.push({ kind: 'uma', id: r.umaId });
			else {
				// 初期スキル: minStar が選んだ★以下の行のうち、minStar が最大のものだけを使う。
				// 各行はその★での「全部」であって差分ではない（C-48）。
				const rows = (uma.initialSkills || []).filter(x => typeof x.minStar === 'number' && x.minStar <= r.star);
				const use = rows.reduce((best, x) => (best === null || x.minStar > best.minStar ? x : best), null);
				if (use) (use.skills || []).forEach(s => add(s, '初期（★' + r.star + '）'));
				// 覚醒スキル: level 0 は「覚醒のレベルに紐づかない枠」なので、
				// 選んだ覚醒レベルにかかわらず**常に含める**（画面では「最初から」と出す）。
				(uma.awakeningSkills || []).forEach(row => {
					if (row.level === 0) (row.skills || []).forEach(s => add(s, '最初から'));
					else if (typeof row.level === 'number' && row.level <= r.awakeningLevel) {
						(row.skills || []).forEach(s => add(s, '覚醒 Lv' + row.level));
					}
				});
			}
		}
		// ── サポートカード ──
		(r.cardIds || []).forEach(cardId => {
			if (!cardId) return;
			const card = findCard(cardId);
			if (!card) { missing.push({ kind: 'card', id: cardId }); return; }
			const label = formatEntryLabel(card);
			const hintStatus = (card.dataStatus && card.dataStatus.hint) || 'pending';
			if (hintStatus === 'done') (card.hintSkills || []).forEach(s => add(s, label + ' のヒント'));
			else if (hintStatus === 'pending') unconfirmed.push({ cardId: cardId, label: label, what: 'ヒント' });

			const evStatus = eventStatusOf(cardId);
			if (evStatus === 'done') getEventSkillsOf(cardId).forEach(s => add(s, label + ' のイベント'));
			else if (evStatus === 'pending') unconfirmed.push({ cardId: cardId, label: label, what: 'イベント' });
		});

		const list = Array.from(items.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
		return { skillIds: list.map(x => x.skillId), items: list, unconfirmed: unconfirmed, missing: missing };
	}

	/* ---- 保存（userData.rosters） ---- */
	function listRosters() { return (ensureUserData().rosters || []).slice(); }
	function findRoster(rosterId) { return (ensureUserData().rosters || []).find(x => x.rosterId === rosterId) || null; }
	function emptyRoster() {
		return {
			rosterId: uid('roster'), name: '', umaId: '', star: 0, awakeningLevel: 0,
			cardIds: new Array(ROSTER_CARD_SLOTS).fill(null),
			createdAt: nowIso(), updatedAt: nowIso()
		};
	}
	function saveRoster(roster) {
		const data = ensureUserData();
		data.rosters = data.rosters || [];
		const i = data.rosters.findIndex(x => x.rosterId === roster.rosterId);
		if (i >= 0) {
			roster.updatedAt = nowIso();
			data.rosters[i] = roster;
		} else {
			if (data.rosters.length >= ROSTER_LIMIT) { toast('編成は' + ROSTER_LIMIT + '件までです'); return false; }
			data.rosters.push(roster);
		}
		saveUserData();
		return true;
	}
	function deleteRoster(rosterId) {
		const data = ensureUserData();
		data.rosters = (data.rosters || []).filter(x => x.rosterId !== rosterId);
		saveUserData();
	}

	/* ============================================================
	 * スキル参照ヘルパー（マスター／カスタムを横断）
	 * ============================================================ */
	function findSkill(skillId) {
		const m = masterSkills.find(s => s.id === skillId);
		if (m) return m;
		const c = (ensureUserData().customSkills || []).find(s => s.customId === skillId);
		if (c) return { id: c.customId, name: c.name, tags: c.tags };
		// 追加カタログ（シナリオ因子など）。タグは持たないので空のタグ集合を返す。
		// kind にカテゴリが入るので、呼び出し側は「カタログ由来か」を見分けられる。
		const x = extraCatalog.find(s => s.id === skillId);
		if (x) return { id: x.id, name: x.name, tags: emptyTagSet(), kind: x.category };
		return null;
	}

	// そのスキルIDが追加カタログのものなら、そのカテゴリ名を返す（違えば空文字）。
	// 行の印など「カタログ由来かどうか」で見せ方を変えたいときに使う。
	function skillCatalogKind(skillId) {
		const x = extraCatalog.find(s => s.id === skillId);
		return x ? x.category : '';
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
	// 名前で引くための索引。母集団は「マスター＋利用者のカスタムスキル＋追加カタログ」。
	// カタログを入れているのは、OCRツールから渡ってきた名前（シナリオ因子など）を
	// 解決できるようにするため。「条件でスキルを検索」の母集団（getFilteredPickerPool）には
	// 入れない — カタログのエントリはタグを持たず、条件検索では「万能スキル」として
	// どの条件にも当たってしまうため。
	function buildSkillTextIndex() {
		const pool = masterSkills.map(sk => ({ id: sk.id, name: sk.name }))
			.concat((ensureUserData().customSkills || []).map(c => ({ id: c.customId, name: c.name })))
			.concat(extraCatalog.map(x => ({ id: x.id, name: x.name })));
		return pool.map(p => ({ id: p.id, name: p.name, norm: normalizeSkillText(p.name) }));
	}

	/**
	 * 「名前を入れて探す」の絞り込み（32セッション目・新設）。
	 *
	 * **`matchPastedSkillText()` とは別の仕組み。流用しない。** あちらは「貼り付けた行を一括で照合する」もので、
	 * 完全一致＋距離1のあいまい照合が入っている。こちらは**人が1文字ずつ打ちながら探す**ための絞り込みで、
	 * 規則が違う（決定・32セッション目）:
	 *
	 * - **部分一致だけ。あいまい照合（距離1）は入れない。** 打ち間違えても候補が出てしまうと、
	 *   利用者が**自分の入力ミスに気づく機会を失う**。「打ち間違えたら候補が出ない」ことがこの方式の狙いの一部。
	 * - 照合は**正規化後の文字列どうし**（入力側も `normalizeSkillText` を通す）。
	 * - **`CHAR_CONFUSION_MAP` は通さない**。人が打った文字に誤読の補正を当てると、意図しない変換が起きる
	 *   （`normalizeSkillText` はもともと common.js の読み替えを持っていないので、そのまま使えばよい）。
	 * - 並びは**前方一致を先に、それ以外の部分一致を後に**。同じ組の中では短い名前を先に（入力に近い順）。
	 * - 入力が空なら何も返さない。
	 *
	 * 母集団は `buildSkillTextIndex()`＝**マスター＋利用者のカスタムスキル**。「条件でスキルを検索」の一覧と同じ
	 * 顔ぶれにしてある（過去に登録したカスタムスキルを二重に作らずに済む）。
	 * **ただし「条件で検索」と違い、追加済みのものも落とさずに返す**（呼び出し側で「追加済み」と示して選べなくする。
	 * 一覧から消すと利用者が「打ち間違えたのか」と迷うため）。
	 *
	 * @returns {{ query:string, hits:Array<{id,name,norm}>, total:number, more:number }}
	 */
	function findSkillsByNameFragment(text) {
		const query = normalizeSkillText(text);
		if (!query) return { query: '', hits: [], total: 0, more: 0 };
		const starts = [], contains = [];
		buildSkillTextIndex().forEach(p => {
			if (!p.norm) return;
			const at = p.norm.indexOf(query);
			if (at === 0) starts.push(p);
			else if (at > 0) contains.push(p);
		});
		const byCloseness = (a, b) => (a.norm.length - b.norm.length) || a.name.localeCompare(b.name, 'ja');
		starts.sort(byCloseness);
		contains.sort(byCloseness);
		const all = starts.concat(contains);
		return { query: query, hits: all.slice(0, NAME_FIND_LIMIT), total: all.length, more: Math.max(0, all.length - NAME_FIND_LIMIT) };
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
	// 破壊的な操作（削除・全消し・上書き）は確認ダイアログではなく「即実行＋元に戻す」で統一する。
	// 複数回さかのぼれるよう、スタック形式で保持する。
	//
	// ■ エントリの契約（pushUndo に渡すもの。欠けていれば例外にし、黙って積ませない）
	//   apply()     … 復元処理。保存先への書き込みと再描画まで済ませ、復元できたら true を返す。
	//                 復元先は呼び出し時に探し直す。捕まえておいた参照は、保存のたびに
	//                 差し替わるもの（ドラフトの skillIds など）だと保存先に届かない。
	//   probe()     … 復元対象の状態を表す比較可能な文字列。成否の検証に使う。
	//                 復元で変わるものだけを表す（他の操作で変わり得るものを混ぜると、
	//                 正しく戻せても「戻っていない」と判定してしまう）。
	//   doneLabel   … 操作を実行した直後に出すトースト文。
	//   undoneLabel … 元に戻せたときに出すトースト文。
	//   scope       … このエントリが属する画面（'list' / 'editor' / 'sheet'）。
	//   baseline    … 省略可。操作の前に取っておいた probe() の値。操作が途中で中止され得る
	//                 （確認ダイアログを挟む等）ために push を操作の後へ回す場合だけ渡す。
	//
	// ■ 守ること
	//   - pushUndo は状態を変更する前に呼ぶ（baseline を渡す場合を除く）。
	//   - スナップショットは snapshot() で独立したコピーにする。元の配列・オブジェクトへの
	//     参照を抱えると、直後のクリア処理（length=0 や splice）でスタックの中身も一緒に消える。
	//   - 対で扱う状態（cells と ocrCells 等）はまとめて1つのエントリに含める。
	//
	// ■ 成功の検証
	//   元に戻すときは probe() を apply() の前後で取り、apply() が true を返し、値が変化し、
	//   かつ積んだ時点の値（baseline）に戻ったときだけ成功とする。それ以外は undoneLabel を
	//   出さず、スタックも消費しない。「何もしていないのに成功したと言う」ことを構造的に起こさないため。
	//
	// ■ 寿命
	//   スタックは scope ごとに持つ。ボタンに出す数は「いまの scope」（setUndoScope で
	//   呼び出し元ページが決める）のエントリ数。画面を閉じた／編集対象を切り替えたときは
	//   dropUndoScope(scope) で捨てる。ページ内メモリのみに保持し localStorage には保存しない
	//   （リロードすれば消える、セッション限定の安全網という位置づけ）。上限は scope ごとに20件。
	let undoStacks = {};
	let undoScope = 'list';
	const undoListeners = [];

	function undoStackFor(scope) {
		if (!undoStacks[scope]) undoStacks[scope] = [];
		return undoStacks[scope];
	}

	function undoCount() {
		return undoStackFor(undoScope).length;
	}

	function notifyUndoChanged() {
		const n = undoCount();
		undoListeners.forEach(fn => { try { fn(n); } catch (e) {} });
	}

	// スナップショット用。元のデータへの参照を一切持たない独立したコピーを返す。
	function snapshot(value) {
		if (value === undefined) return undefined;
		if (typeof global.structuredClone === 'function') return global.structuredClone(value);
		return JSON.parse(JSON.stringify(value));
	}

	// probe() 用。オブジェクトのキー順に依存しない文字列にする
	// （復元は「消して足し直す」ことがあり、キーの順序が元と変わり得るため）。
	function stableStringify(v) {
		if (v === undefined) return 'null';
		if (v === null || typeof v !== 'object') return JSON.stringify(v);
		if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
		return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
	}
	function probeOf(value) {
		return stableStringify(value);
	}

	function pushUndo(entry) {
		if (!entry || typeof entry !== 'object') throw new TypeError('pushUndo: エントリはオブジェクトで渡してください');
		const missing = [];
		if (typeof entry.apply !== 'function') missing.push('apply');
		if (typeof entry.probe !== 'function') missing.push('probe');
		if (typeof entry.doneLabel !== 'string' || !entry.doneLabel) missing.push('doneLabel');
		if (typeof entry.undoneLabel !== 'string' || !entry.undoneLabel) missing.push('undoneLabel');
		if (typeof entry.scope !== 'string' || !entry.scope) missing.push('scope');
		if (missing.length > 0) throw new TypeError('pushUndo: エントリに ' + missing.join(' / ') + ' がありません');
		const baseline = typeof entry.baseline === 'string' ? entry.baseline : entry.probe();
		const stack = undoStackFor(entry.scope);
		stack.push({
			apply: entry.apply, probe: entry.probe, baseline: baseline,
			doneLabel: entry.doneLabel, undoneLabel: entry.undoneLabel, scope: entry.scope
		});
		if (stack.length > UNDO_STACK_LIMIT) stack.shift();
		toast(entry.doneLabel);
		notifyUndoChanged();
	}

	function performUndo() {
		const stack = undoStackFor(undoScope);
		const entry = stack[stack.length - 1];
		if (!entry) return false;
		let ok = false, before = '', after = '';
		try {
			before = entry.probe();
			ok = entry.apply() === true;
			after = entry.probe();
		} catch (e) {
			ok = false;
			if (global.console) global.console.error('[UmaSkillDeckCore] 元に戻す処理で例外', e);
		}
		if (!ok || after === before || after !== entry.baseline) {
			// 成功を名乗らない。エントリも残す（消費すると「戻したつもり」だけが残る）。
			if (global.console) global.console.warn('[UmaSkillDeckCore] 元に戻せませんでした', {
				scope: entry.scope, applied: ok, changed: after !== before, reachedBaseline: after === entry.baseline
			});
			toast('元に戻せませんでした');
			return false;
		}
		stack.pop();
		toast(entry.undoneLabel);
		notifyUndoChanged();
		return true;
	}

	// 呼び出し元ページが「いまどの画面か」を告げる。ボタンの数はこの scope のぶんだけ出す。
	function setUndoScope(scope) {
		undoScope = scope || 'list';
		notifyUndoChanged();
	}

	// その画面を閉じた／編集対象を切り替えたときに、その画面のエントリを捨てる。
	function dropUndoScope(scope) {
		undoStacks[scope] = [];
		notifyUndoChanged();
	}

	function clearUndo() {
		undoStacks = {};
		notifyUndoChanged();
	}

	function onUndoChanged(fn) {
		undoListeners.push(fn);
		fn(undoCount());
	}

	// ページを離れたら捨てる（bfcache から戻ってきても、古い状態を指すものは出さない）。
	if (global.addEventListener) global.addEventListener('pagehide', clearUndo);

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
		// モーダル下部に固定するフッター（追加ボタンと選択数）。パネルの3段目なので
		// スクロール領域と重ならず、一覧の最後の行を隠すこともない。
		// 地は不透明で塗る（opacity は使わない。B節ルール9・F-7）。狭い画面ではパネルの下端が
		// 画面の下端に接するので、iOS のホームバーぶんの余白を env() で足す。
		'.usd-modal-foot { flex-shrink: 0; display: flex; align-items: center; gap: var(--uma-sp-3);',
		'  padding: var(--uma-sp-3) var(--uma-sp-4);',
		'  padding-bottom: max(var(--uma-sp-3), env(safe-area-inset-bottom));',
		'  background: var(--uma-surface); border-top: 1px solid var(--uma-border); }',
		'.usd-modal-foot[hidden] { display: none !important; }',
		'.usd-foot-count { flex-shrink: 0; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  font-weight: 600; color: var(--uma-text-subtle); white-space: nowrap; }',
		'.usd-foot-commit { flex: 1 1 auto; justify-content: center; text-align: center; }',
		'.usd-foot-added { white-space: nowrap; font-weight: 400; }',
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
		// 画像から読み取る（ocr モード）の要約。文が複数行になるので改行をそのまま出す
		'.usd-ocr-summary { font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); color: var(--uma-text-subtle); white-space: pre-line; }',
		/* 報告の中のボタンは**意味ごとに見た目を分ける**（32セッション目に整理）。取り違えると
		   取り返しの付きやすさが違うものを同じ形で並べることになる（実際そうなっていた＝
		   「カスタムスキルとして追加」が候補チップと同じ形で並び、押すと新しいスキルが作られていた）。
		     .usd-paste-cand  … **押すとその場で確定する**。アクセント色・**角丸いっぱいの丸い形**
		     .usd-paste-panel … **押すと何かが開く**（入力欄・画像）。無彩色・**四角い形**
		     .usd-paste-skip  … **押すとその行を畳む／控えめな導線**。下線付きの淡い文字
		     .uma-btn--secondary … **押すと戻る**。共通部品の二次ボタン（枠と影のある普通のボタン）
		   新しいボタンを足すときは、この4つのどれかに必ず当てはめる。
		   32セッション目の実機で「戻る」を .usd-paste-skip で出していたら**押せる要素に見えなかった**。
		   候補チップと似せないようにして控えめに倒しすぎた例で、**戻るは別枠**として扱う。 */
		'.usd-paste-cand { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); padding: var(--uma-sp-0-5) var(--uma-sp-2);',
		'  border-radius: var(--uma-r-full); border: 1px solid var(--uma-accent-border); background: var(--uma-accent-soft);',
		'  color: var(--uma-accent-soft-text); cursor: pointer; }',
		'.usd-paste-cand:hover { background: var(--uma-accent-border); }',
		'.usd-paste-skip { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-faint);',
		'  text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0; }',
		'.usd-paste-skip:hover { color: var(--uma-text-subtle); }',
		// 行の右肩のボタンの並び（「画像を見る」＋「取り消す」／「無視する」）。31セッション目
		'.usd-paste-acts { display: flex; align-items: center; gap: var(--uma-sp-2); flex-shrink: 0; }',
		// 「押すと開く」側は**四角い形**にして、丸い候補チップと一目で分かるようにする（32セッション目）
		'.usd-paste-panel { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); padding: var(--uma-sp-0-5) var(--uma-sp-2);',
		'  border-radius: var(--uma-r-sm); border: 1px solid var(--uma-border); background: var(--uma-surface);',
		'  color: var(--uma-text-subtle); cursor: pointer; white-space: nowrap; }',
		'.usd-paste-panel:hover { color: var(--uma-text-heading); border-color: var(--uma-text-faint); }',
		'.usd-paste-scroll { max-height: 240px; overflow: auto; }',

		/* 「名前を入れて探す」のサブ画面（32セッション目）。報告と入れ替えで出す。
		   候補一覧だけが伸び縮みするので、スマホでキーボードが出ても入力欄が押し出されない。 */
		'.usd-name-head { margin-bottom: var(--uma-sp-3); }',
		// スマホで押しやすい大きさを確保する（共通部品の padding だけだと指には小さい）
		'.usd-name-back { min-height: 40px; padding-left: var(--uma-sp-3); padding-right: var(--uma-sp-4); }',
		'.usd-name-read { margin-bottom: var(--uma-sp-2); font-family: var(--uma-font-mono); word-break: break-all; }',
		// 画像は高さを抑える。抑えないと、縦に長い切り出しが来たときスマホで入力欄が画面の外へ押し出される
		'.usd-name-img { display: block; width: 100%; height: auto; max-height: 22vh; object-fit: contain;',
		'  margin-bottom: var(--uma-sp-3);',
		'  border: 1px solid var(--uma-border); border-radius: var(--uma-r-md); background: var(--uma-surface); }',
		'.usd-name-img[data-usd-act] { cursor: zoom-in; }',
		'.usd-name-label { display: block; margin-bottom: var(--uma-sp-1-5);',
		'  font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); }',
		'.usd-name-results { margin-top: var(--uma-sp-3); }',
		// 候補一覧も画面の高さに合わせる。キーボードが出て縦が狭いときに、一覧だけが伸びて
		// 入力欄を押し出さないようにする（入力欄の下に必ず数件は見えている状態を保つ）
		'.usd-name-list { display: flex; flex-direction: column; gap: var(--uma-sp-1);',
		'  max-height: min(240px, 40vh); overflow: auto; }',
		// 候補は「押すと確定する」もの。行の候補チップ（.usd-paste-cand）と同じアクセント色の系統にそろえる
		'.usd-name-hit { display: flex; align-items: center; justify-content: space-between; gap: var(--uma-sp-2);',
		'  text-align: left; padding: var(--uma-sp-2) var(--uma-sp-3); border-radius: var(--uma-r-md);',
		'  border: 1px solid var(--uma-accent-border); background: var(--uma-accent-soft);',
		'  color: var(--uma-accent-soft-text); font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); cursor: pointer; }',
		'.usd-name-hit:hover { background: var(--uma-accent-border); }',
		// 追加済みは一覧から消さずに出して、選べない見た目にする
		'.usd-name-hit--added { border-color: var(--uma-border); background: var(--uma-surface-sunken);',
		'  color: var(--uma-text-faint); cursor: default; }',
		'.usd-name-hit--added:hover { background: var(--uma-surface-sunken); }',
		'.usd-name-added { flex-shrink: 0; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); }',
		'.usd-name-none { margin-bottom: var(--uma-sp-2); }',
		'.usd-name-custom { display: inline-block; }',

		/* ------------------------------------------------------------
		 * 8軸フィルターのタブ（見出しタブ＋共通パネル1枚）
		 *
		 * 以前は軸ごとに <details> を縦に8つ並べていたが、開くほど縦に伸びて
		 * 肝心のスキル一覧が画面外へ押し出されていた。タブなら軸をいくつ
		 * 増やしても縦の高さは変わらない。
		 *
		 * 幅に応じて見た目を2通りに切り替える（どちらの幅でも8軸すべてが見えていて、
		 * 端へスクロールする操作は要らない、という状態を保つため）。
		 *   data-usd-rows="1"     … 1行に収まるとき。フォルダの見出し風（選択中がパネルと地続き）
		 *   data-usd-rows="multi" … 収まらないとき。角丸ボタンの格子（4列×2段など）へ切り替える
		 * 段が増えるとフォルダの切り欠きは上段で意味をなさないので、見た目ごと替えている。
		 * どちらにするかはCSSのブレークポイントではなくJSの実測で決める（F-28）。
		 * ------------------------------------------------------------ */
		'.usd-axis-tabs { --usd-tab-lift: 5px; --usd-opt-row: 32px; margin-bottom: var(--uma-sp-3); }',
		'.usd-tablist { display: flex; min-width: 0; }',
		// タブ本体。共通の見た目だけをここに置き、形は段数ごとの指定で上書きする
		'.usd-tab { display: flex; flex-direction: column; align-items: center; justify-content: center;',
		'  position: relative; padding: var(--uma-sp-1-5) var(--uma-sp-3); font: inherit;',
		'  font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); white-space: nowrap;',
		'  color: var(--uma-text-subtle); background: var(--uma-surface-muted);',
		'  border: 1px solid var(--uma-border); cursor: pointer;',
		'  transition: background-color var(--uma-transition), color var(--uma-transition); }',
		'.usd-tab:hover { background: var(--uma-surface); color: var(--uma-text-heading); }',
		'.usd-tab:focus-visible { outline: 2px solid var(--uma-focus-ring); outline-offset: -3px; }',
		'.usd-tab-main { font-weight: 600; }',
		'.usd-tab[aria-selected="true"] { color: var(--uma-text); background: var(--uma-surface); }',
		'.usd-tab[aria-selected="true"] .usd-tab-main { font-weight: 700; color: var(--uma-control); }',

		/* --- 1行に収まるとき：フォルダの見出し風 --- */
		// パネル上端の線はタブバー全体で引く。選択中タブがこの線を塗り潰して「つながって」見える
		'.usd-tabbar[data-usd-rows="1"] { display: flex; align-items: flex-end;',
		'  background: var(--uma-surface-sunken); border-radius: var(--uma-r-lg) var(--uma-r-lg) 0 0;',
		'  box-shadow: inset 0 -1px 0 var(--uma-border); }',
		// flex: 1 1 auto が無いと、タブの列がタブバーの幅いっぱいに伸びず右側が空く
		'[data-usd-rows="1"] .usd-tablist { flex: 1 1 auto; align-items: flex-end; gap: var(--uma-sp-1); padding: 0 var(--uma-sp-1-5); }',
		// flex: 1 0 0 で8枚を同じ幅に伸ばす。min-width で文字幅より縮まないようにし、
		// 縮めきれない＝1行に入らないことをJS側が scrollWidth で検出できるようにしてある
		'[data-usd-rows="1"] .usd-tab { flex: 1 0 0; min-width: max-content; min-height: 3.1rem;',
		'  margin-top: var(--usd-tab-lift); border-radius: var(--uma-r-lg) var(--uma-r-lg) 0 0; }',
		// 選択中：一段持ち上がり、上端に黒い帯（操作の色）、下の線を消してパネルと地続きにする
		'[data-usd-rows="1"] .usd-tab[aria-selected="true"] { margin-top: 0;',
		'  min-height: calc(3.1rem + var(--usd-tab-lift)); border-bottom-color: var(--uma-surface);',
		'  box-shadow: inset 0 3px 0 var(--uma-control); z-index: 1; }',
		'[data-usd-rows="1"] .usd-tabpanels { border-top: 0; border-radius: 0 0 var(--uma-r-lg) var(--uma-r-lg); }',

		/* --- 収まらないとき：角丸ボタンの格子（狭い画面。4列×2段など） --- */
		'.usd-tabbar[data-usd-rows="multi"] { background: var(--uma-surface-sunken);',
		'  border: 1px solid var(--uma-border); border-bottom: 0;',
		'  border-radius: var(--uma-r-lg) var(--uma-r-lg) 0 0; padding: var(--uma-sp-1-5); }',
		// auto-fit なので、幅に入るだけの列数へ自動で割れる（375pxなら4列×2段）
		'[data-usd-rows="multi"] .usd-tablist { display: grid; gap: var(--uma-sp-1-5);',
		'  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); }',
		'[data-usd-rows="multi"] .usd-tab { min-height: 2.6rem; padding: var(--uma-sp-1) var(--uma-sp-2);',
		'  border-radius: var(--uma-r-md); }',
		'[data-usd-rows="multi"] .usd-tab[aria-selected="true"] { background: var(--uma-control-soft);',
		'  border-color: var(--uma-control); box-shadow: inset 0 2px 0 var(--uma-control); }',
		'[data-usd-rows="multi"] .usd-tabpanels { border-radius: 0 0 var(--uma-r-lg) var(--uma-r-lg); }',

		// 条件が入っている軸の件数バッジ（他のタブに隠れた条件を見落とさないため）
		'.usd-tab-count { position: absolute; top: 3px; right: var(--uma-sp-1); min-width: 17px; height: 17px;',
		'  padding: 0 5px; border-radius: var(--uma-r-full); font-size: var(--uma-fs-2xs); font-weight: 700;',
		'  line-height: 17px; text-align: center; color: var(--uma-text-inverse); background: var(--uma-accent); }',
		'[data-usd-rows="1"] .usd-tab[aria-selected="true"] .usd-tab-count { top: 7px; }',
		'.usd-tab-count[hidden] { display: none; }',

		// 共通パネル。全軸を同じグリッドのマスに重ね、切り替えても下のスキル一覧が上下に跳ねないようにする
		'.usd-tabpanels { display: grid; background: var(--uma-surface); border: 1px solid var(--uma-border);',
		'  padding: var(--uma-sp-3) var(--uma-sp-4) var(--uma-sp-3-5); }',
		'.usd-tabpanel { grid-area: 1 / 1; min-width: 0; }',
		// Tailwind の hidden クラスは使わない（F-13）。visibility なら場所は取ったままなので、
		// いちばん背の高い軸に高さが揃う（display:none にすると揃わなくなる）
		'.usd-tabpanel:not(.is-active) { visibility: hidden; }',
		'.usd-tabpanel:focus-visible { outline: 2px solid var(--uma-focus-ring); outline-offset: 4px; border-radius: var(--uma-r-sm); }',
		'.usd-axis-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--uma-sp-1) var(--uma-sp-3);',
		'  margin-bottom: var(--uma-sp-2); }',
		'.usd-axis-title { margin: 0; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-axis-hint { margin: 0; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); }',
		'.usd-link-btn { margin-left: auto; font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  padding: var(--uma-sp-0-5) var(--uma-sp-1-5); border-radius: var(--uma-r-sm); color: var(--uma-accent-soft-text);',
		'  background: none; border: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }',
		'.usd-link-btn:disabled { color: var(--uma-border-strong); text-decoration: none; cursor: default; }',

		// 選択肢の置き場。2行ぶんで頭打ちにして、続きはこの中だけを縦スクロールさせる。
		// 選択肢が最多の軸（⑦レース場17個）に高さを合わせると、それだけでモーダルが埋まるため。
		// 続きがあることは下端のフェードで示す（data-more-below はJSが付け外しする）。
		'.usd-opts-wrap { position: relative; }',
		'.usd-opts-wrap::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 20px;',
		'  pointer-events: none; visibility: hidden;',
		'  background: linear-gradient(to top, var(--uma-surface), transparent); }',
		'.usd-opts-wrap[data-more-below]::after { visibility: visible; }',
		// 2行ぶん＋3行目が4分の3ほど覗く高さ。ちょうど2行で切ると、フェードが2行目に
		// かかって「2行目が切れている」としか見えず、続きの合図にならない。逆に覗きが
		// 数pxだと、ただの余白に見えて続きがあることが伝わらない。半分でもまだ気付き
		// にくかったので、チップの丸みが見分けられるところまで出してある。覗き（24px）は
		// フェードの高さ（20px）より大きくし、覗いた行の上端は素の色で見えるようにする。
		'.usd-opts { display: flex; flex-wrap: wrap; gap: var(--uma-sp-2);',
		'  max-height: calc(var(--usd-opt-row) * 2.75 + var(--uma-sp-2) * 2);',
		'  overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }',
		'.usd-opts::-webkit-scrollbar { display: none; }',

		// 選択肢チップ。中身は本物の checkbox のままなので、既存のJSとテストがそのまま掴める
		// （.usd-chip はテンプレートのスキル名チップで使用済みのため .usd-opt にしてある）
		'.usd-opt { display: inline-flex; align-items: center; gap: var(--uma-sp-1-5);',
		'  padding: var(--uma-sp-1-5) var(--uma-sp-3) var(--uma-sp-1-5) var(--uma-sp-2);',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-full);',
		'  background: var(--uma-surface); color: var(--uma-text-heading); font-size: var(--uma-fs-sm);',
		'  line-height: var(--uma-lh-sm); cursor: pointer; user-select: none;',
		'  transition: background-color var(--uma-transition), border-color var(--uma-transition); }',
		'.usd-opt:hover { border-color: var(--uma-accent-border); background: var(--uma-surface-sunken); }',
		'.usd-opt input { appearance: none; -webkit-appearance: none; flex: none; margin: 0; width: 18px; height: 18px;',
		'  border: 1.5px solid var(--uma-border-strong); border-radius: 50%; background: var(--uma-surface);',
		'  display: grid; place-content: center; cursor: pointer; }',
		'.usd-opt input::after { content: ""; width: 8px; height: 4.5px; border: 2px solid var(--uma-text-inverse);',
		'  border-top: 0; border-right: 0; transform: translateY(-1px) rotate(-45deg); visibility: hidden; }',
		'.usd-opt input:checked { background: var(--uma-accent); border-color: var(--uma-accent); }',
		'.usd-opt input:checked::after { visibility: visible; }',
		'.usd-opt:has(input:checked) { background: var(--uma-accent-soft); border-color: var(--uma-accent-border);',
		'  color: var(--uma-accent-soft-text); font-weight: 600; }',
		'.usd-opt:has(input:focus-visible) { outline: 2px solid var(--uma-accent-ring); outline-offset: 2px; }',

		// 絞り込み中の条件。どのタブに何が入っているかを一望し、押すとそのタブへ飛ぶ
		'.usd-active-summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-1-5) var(--uma-sp-2);',
		'  margin-top: var(--uma-sp-2-5); min-height: 30px; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); }',
		'.usd-summary-label { font-weight: 600; color: var(--uma-text-heading); }',
		'.usd-summary-item { font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  padding: var(--uma-sp-0-5) var(--uma-sp-2-5); border-radius: var(--uma-r-full); cursor: pointer;',
		'  color: var(--uma-accent-soft-text); background: var(--uma-accent-soft); border: 1px solid var(--uma-accent-border); }',
		'.usd-summary-item:hover { border-color: var(--uma-accent); }',
		'.usd-summary-item b { font-weight: 700; margin-right: var(--uma-sp-1); }',

		// スキルを足す3つの入口。モーダルは選ばれた1つぶんだけを出す
		'.usd-mode[hidden] { display: none; }',
		// 呼び出し元の画面に並べる入口ボタン
		'.usd-entry-row { display: flex; flex-wrap: wrap; gap: var(--uma-sp-2); margin-bottom: var(--uma-sp-3); }',
		'@media (prefers-reduced-motion: reduce) { .usd-tab, .usd-opt { transition: none; } }',

		// 編成パネル（C-51）
		'.usd-roster { display: flex; flex-direction: column; gap: var(--uma-sp-3); }',
		'.usd-roster-sec { display: flex; flex-direction: column; gap: var(--uma-sp-2); }',
		'.usd-roster-h { font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; margin: 0; }',
		'.usd-roster-row { display: flex; flex-wrap: wrap; gap: var(--uma-sp-2); align-items: center; }',
		'.usd-roster-slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--uma-sp-2); }',
		'@media (min-width: 640px) { .usd-roster-slots { grid-template-columns: repeat(3, minmax(0, 1fr)); } }',
		'.usd-roster-slot { display: flex; align-items: center; gap: var(--uma-sp-1); min-width: 0; }',
		'.usd-roster-slot > button:first-child { flex: 1 1 auto; min-width: 0; text-align: left;',
		'  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
		'.usd-roster-pills { display: flex; flex-wrap: wrap; gap: var(--uma-sp-1); }',
		'.usd-roster-pill { font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  padding: var(--uma-sp-0-5) var(--uma-sp-2-5); border-radius: var(--uma-r-full); cursor: pointer;',
		'  border: 1px solid var(--uma-border); background: var(--uma-surface); }',
		'.usd-roster-pill[aria-pressed="true"] { background: var(--uma-accent-soft); border-color: var(--uma-accent);',
		'  color: var(--uma-accent-soft-text); font-weight: 700; }',
		'.usd-roster-got { display: flex; flex-direction: column; gap: var(--uma-sp-1); max-height: 320px; overflow-y: auto; }',
		'.usd-roster-got-row { display: flex; flex-wrap: wrap; gap: var(--uma-sp-2); align-items: baseline;',
		'  font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); padding: var(--uma-sp-1) 0;',
		'  border-bottom: 1px dashed var(--uma-border); }',
		'.usd-roster-got-name { font-weight: 700; }',
		'.usd-roster-got-from { color: var(--uma-text-subtle); }',
		'.usd-roster-note { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); margin: 0; }',
		'.usd-roster-warn { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); margin: 0; }',
		'.usd-roster-unconf { display: flex; flex-wrap: wrap; gap: var(--uma-sp-1); margin: var(--uma-sp-1) 0 0; padding: 0; list-style: none; }',
		'.usd-roster-unconf li { font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs);',
		'  border: 1px dashed var(--uma-border); border-radius: var(--uma-r-full); padding: 0 var(--uma-sp-2); }',
		'.usd-roster-alpha { margin: 0; padding: var(--uma-sp-2) var(--uma-sp-3); border-radius: var(--uma-r-sm);',
		'  font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  background: var(--uma-surface-muted); border: 1px dashed var(--uma-border); }',
		// カード・育成ウマ娘を選ぶミニウィンドウ
		'.usd-roster-modal { position: fixed; inset: 0; z-index: 60; display: flex;',
		'  align-items: center; justify-content: center; padding: var(--uma-sp-3); }',
		'.usd-roster-modal-back { position: absolute; inset: 0; background: rgba(15, 23, 43, 0.4); }',
		'.usd-roster-modal-box { position: relative; z-index: 1; width: min(520px, 100%);',
		'  max-height: min(70vh, 560px); overflow: hidden; display: flex; flex-direction: column; gap: var(--uma-sp-2);',
		'  background: var(--uma-surface); border: 1px solid var(--uma-border);',
		'  border-radius: var(--uma-r-md); padding: var(--uma-card-pad); box-shadow: var(--uma-shadow-lg, 0 10px 30px rgba(0,0,0,.2)); }',
		'.usd-roster-modal-head { display: flex; align-items: center; justify-content: space-between; gap: var(--uma-sp-2); }',
		'.usd-roster-hits { overflow-y: auto; }'
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
	// activeAxis は「モーダルを開いている間だけ」覚える。openSkillPicker() で毎回
	// 先頭の軸に戻すので、localStorage には保存しない（以前の axisOpen と同じ寿命）。
	let picker = { mode: 'filter', filters: {}, checked: new Set(), onAdd: null, excludeIds: [], activeAxis: TAG_AXES[0].key };
	/**
	 * 一覧から隠すスキル（編成で得られるもの。C-51）。
	 *
	 * **`picker.excludeIds` を流用しないこと。** あちらは「一覧から隠す」と
	 * **「XXX種追加済み」の件数**（`updatePickerCommitState()` が `length` をそのまま出す）を
	 * 兼ねているので、編成由来のIDを混ぜると件数が壊れる。こちらは表示にだけ効かせ、
	 * 件数には一切使わない。モーダルを開き直しても残るよう、picker とは別に持つ。
	 */
	let pickerHiddenIds = [];
	// 一括貼り付けの照合結果。各行に chosenId（採用したスキルID）を後から書き込む。
	let pasteRows = [];
	// 貼り付け／画像から読み取る の報告に対する呼び出し元からの口（31セッション目）。
	// いまは onShowPanel(row) だけ。32セッション目に役割が変わり、**サブ画面の中の画像を押したときに
	// 原寸で見せる**ための任意の口になった（渡さなければ画像は押せないだけで、表示そのものは core が行う）。
	let pasteOptions = {};
	// 「名前を入れて探す」のサブ画面の状態（32セッション目）。
	//   row    … 開いている行の pasteRows の添字。-1 は閉じている
	//   scroll … 開く直前の報告のスクロール位置（戻ったときに同じ場所へ返すため。display:none で失われる）
	//   composing / timer … 日本語入力の変換中かどうかと、絞り込みの遅延
	let pasteName = { row: -1, scroll: 0, composing: false, timer: null };

	// スキルを足す入口は3つあり、どれも同じモーダルの中身を差し替えて出す。
	//   filter … 条件でスキルを検索（8軸フィルター＋絞り込み結果）
	//   paste  … テキストで検索（貼り付けたテキストとマスターの照合）
	//   custom … マスターにないスキルを追加（名前＋8軸タグの手入力）
	// 以前は3つを1枚のモーダルに縦に積んでいたが、実際には「今どれをやるか」は
	// 最初に決まっているので、選ばなかった2つは畳まれた見出しとして場所を取るだけだった。
	// 入口を呼び出し元の画面（テンプレート編集・比較シート編集）へ出し、
	// モーダルは選ばれた1つだけを出す形にしてある。
	// フッターの確定ボタンの見出し。押した実績があるときは
	// 「（XXX種追加済み）」を後ろに足すので、文字列はここ1か所に置く。
	const PICKER_COMMIT_LABEL = 'チェックしたスキルを追加';

	const PICKER_MODES = {
		filter: { title: '条件でスキルを検索（軸間はAND・軸内はOR）', commit: true },
		paste: { title: 'テキストで検索', commit: true },
		// 32セッション目: 利用者向けの語を「収録されていない」に統一（「マスター」も「一覧」も
		// 画面上に存在しないものを指していて、利用者は見たことのない何かを参照させられていた）。
		// **コード内部の識別子・変数名・開発ログの「マスター」は変えない。**
		custom: { title: '収録されていないスキルを追加', commit: false },
		// 4つ目（スキルセットOCR・フェーズa コミット3）。外で照合を済ませた行（ID付きの候補一覧）を受け取って、
		// 「テキストで検索」と同じ報告（候補チップ・取り消し・確定）を出す。貼り付け欄と照合ボタンは出さない。
		// 照合は common.js 側（CHAR_CONFUSION_MAP が効く経路）で行い、ここは見せるだけ＝C-24 調査4 の推奨。
		// 入口（special.html のボタン）はコミット4、Deck 単体ページの入口は後続。この段は口だけ。
		ocr: { title: '画像から読み取る', commit: true }
	};

	function pickerMarkup() {
		return '' +
			'<div class="usd-modal-panel">' +
				'<div class="flex items-center justify-between p-4 border-b border-slate-200" style="flex-shrink:0;">' +
					'<p class="text-sm font-semibold text-slate-700" data-usd-el="picker-title">条件でスキルを検索</p>' +
					'<button type="button" class="usd-icon-btn uma-icon-btn" data-usd-act="picker-close" aria-label="閉じる"><i data-lucide="x" class="w-4 h-4"></i></button>' +
				'</div>' +
				// ヘッダー／スクロール領域／フッターの3段。真ん中だけが伸び縮みするので、
				// 一覧をいくら下までスクロールしても追加ボタンが視界から消えない。
				// min-height:0 が無いと、flex の子は中身の高さより小さくなれず溢れる。
				'<div class="p-4" data-usd-el="picker-body" style="overflow:auto;min-height:0;">' +
					// ---- 条件でスキルを検索 ----
					'<div class="usd-mode" data-usd-el="mode-filter">' +
						// 8軸フィルター。中身（タブ＋共通パネル）は renderPickerFilterAxes() が
						// ensurePicker() のときに1回だけ組み立てる。
						'<div data-usd-el="filter-axes"></div>' +
						'<div class="flex items-center justify-between mb-1">' +
							'<label class="flex items-center gap-1.5 text-xs text-slate-600">' +
								'<input type="checkbox" data-usd-act="picker-select-all"/> 表示中を全て選択' +
							'</label>' +
							'<p class="text-xs text-slate-500">絞り込み結果（<span data-usd-el="result-count">0件</span>）</p>' +
						'</div>' +
						'<div data-usd-el="results" style="border:1px solid #e2e8f0;border-radius:.75rem;max-height:280px;overflow:auto;"></div>' +
					'</div>' +
					// ---- テキストで検索 ----
					// 枠も見出しも説明文も持たせない。何を貼ればよいかはプレースホルダー1行で足りる
					// （表記ゆれの読み替えやタブ入りの行のエラーは、照合したあとに結果として出る）。
					// 「画像から読み取る」（ocr モード）も同じ枠を使う。貼り付け欄と照合ボタン（paste-input-wrap）を隠し、
					// 代わりに読み取りの要約（paste-summary）を先頭に1行出す。報告（paste-report）の作りは共通。
					'<div class="usd-mode" data-usd-el="mode-paste" hidden>' +
						// 要約（文面は formatRowsSummary。複数行）。以前ここに注記 paste-note を置いていたが、
						// 前提が誤っていたので 31セッション目に撤去した（formatRowsSummary の見出し）。
						'<p class="usd-ocr-summary mb-2" data-usd-el="paste-summary" hidden></p>' +
						'<div data-usd-el="paste-input-wrap">' +
						'<textarea class="usd-input uma-input" rows="5" style="font-family:var(--uma-font-mono);resize:vertical;" data-usd-el="paste-input" placeholder="1行に1つずつスキル名を貼り付けるか、スプレッドシートの1列をそのまま貼り付け"></textarea>' +
						'<div class="flex flex-wrap gap-2 mt-2">' +
							'<button type="button" class="uma-btn uma-btn--primary" data-usd-act="paste-run">貼り付けたテキストを照合</button>' +
							'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="paste-clear">クリア</button>' +
						'</div>' +
						'</div>' +
						'<div data-usd-el="paste-report" class="mt-3"></div>' +
						// 「名前を入れて探す」のサブ画面（32セッション目）。要確認の行から開く。
						// 報告と入れ替えで出すので、狭い画面でもキーボードの上に入力欄と候補一覧が収まる。
						// 中身は renderPasteNamePanel() が組み立てる。画像は row.panelImage があるときだけ。
						'<div data-usd-el="paste-name" hidden></div>' +
					'</div>' +
					// ---- マスターにないスキルを追加 ----
					'<div class="usd-mode" data-usd-el="mode-custom" hidden>' +
						'<input type="text" class="usd-input uma-input mb-3" data-usd-el="custom-name" placeholder="スキル名"/>' +
						'<div data-usd-el="custom-tags"></div>' +
						'<button type="button" class="w-full uma-btn uma-btn--primary mt-2" data-usd-act="custom-add">カスタムスキルとして追加</button>' +
					'</div>' +
				'</div>' +
				// 追加ボタンはスクロール領域の外（フッター）に置く。以前は一覧の下に流れていたので、
				// 絞り込み結果を下まで見にいくとボタンが画面外へ出て、押すために戻る必要があった。
				// 「いま何種足すのか」をボタンの脇に出し、0種のときは押しても何も起きないので止める。
				'<div class="usd-modal-foot" data-usd-el="picker-footer">' +
					'<p class="usd-foot-count" data-usd-el="picker-checked-count">0種選択</p>' +
					'<button type="button" class="uma-btn uma-btn--primary usd-foot-commit" data-usd-el="picker-commit" data-usd-act="picker-add" disabled>' + PICKER_COMMIT_LABEL + '</button>' +
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

		// Esc。**「名前を入れて探す」を開いている間だけ**受け、サブ画面を閉じて一覧へ戻す
		// （32セッション目。モーダル全体は閉じない＝読み取った結果を消さない）。
		// 一覧の状態では何もしない（ピッカーはもともと Esc で閉じない作りで、そこは変えない）。
		// 手前に別の層（撮影ガイド・画像の拡大など）が開いているときは、そちらが先に処理して
		// preventDefault() を立てるので譲る。こちらも処理したら立てる（二重に閉じないため）。
		document.addEventListener('keydown', (e) => {
			if (e.key !== 'Escape' || e.defaultPrevented) return;
			if (!pickerEl || pickerEl.hidden || pasteName.row < 0) return;
			closePasteNameFinder();
			e.preventDefault();
		});

		pickerEl.addEventListener('click', (e) => {
			// 背景（パネル外）のクリック。**「名前を入れて探す」を開いている間は一覧へ戻るだけ**にする
			// （32セッション目・実機。ここでモーダルごと閉じると読み取った結果が全部消える）。
			if (e.target === pickerEl) {
				if (pasteName.row >= 0) closePasteNameFinder(); else closePicker();
				return;
			}
			const btn = e.target.closest('[data-usd-act]');
			if (!btn || !pickerEl.contains(btn)) return;
			const act = btn.dataset.usdAct;
			if (act === 'picker-close') closePicker();
			else if (act === 'filter-tab') selectPickerAxisTab(btn.dataset.usdAxis, false);
			// 「絞り込み中」から飛ぶときは、どのタブへ移ったかが分かるようフォーカスも移す。
			else if (act === 'filter-jump') selectPickerAxisTab(btn.dataset.usdAxis, true);
			else if (act === 'filter-clear-axis') clearPickerAxisFilter(btn.dataset.usdAxis);
			else if (act === 'filter-clear-all') clearAllPickerFilters();
			else if (act === 'picker-add') addCheckedSkills();
			else if (act === 'custom-add') addCustomSkillFromPicker();
			else if (act === 'paste-run') runPasteMatch();
			else if (act === 'paste-clear') clearPaste();
			else if (act === 'paste-pick') choosePasteCandidate(Number(btn.dataset.row), btn.dataset.skillId);
			else if (act === 'paste-find') openPasteNameFinder(Number(btn.dataset.row));
			else if (act === 'name-back') closePasteNameFinder();
			else if (act === 'name-pick') pickPasteNameResult(btn.dataset.skillId);
			else if (act === 'name-custom') createCustomFromName();
			else if (act === 'name-zoom') zoomPasteNameImage();
			else if (act === 'paste-skip') skipPasteRow(Number(btn.dataset.row));
		});
		pickerEl.addEventListener('change', (e) => {
			const el = e.target;
			if (el.dataset.usdAct === 'picker-select-all') { togglePickerSelectAll(el.checked); return; }
			if (el.dataset.usdEl === 'filter-check') { onPickerFilterChange(el); return; }
			if (el.dataset.usdEl === 'skill-check') { onPickerCheck(el.value, el.checked); return; }
		});
		renderCustomSkillTagInputs();
		// 軸は実行中に増減しないので、タブとパネルは1回だけ組み立てて使い回す。
		// 開き直すたびの初期化は resetPickerFilterUi() が担う。
		renderPickerFilterAxes();
		return pickerEl;
	}

	function q(root, name) {
		return root.querySelector('[data-usd-el="' + name + '"]');
	}
	/* ------------------------------------------------------------
	 * 8軸フィルター（タブ切り替え）
	 *
	 * 以前は軸ごとの <details> を縦に8つ並べていた。開くほど縦に伸びて、
	 * 肝心のスキル一覧が画面外へ押し出されるのを解消するためタブにした。
	 *
	 * 組み立ては ensurePicker() で1回だけ行い、以降は属性とクラスの付け外しで
	 * 更新する。以前のように checkbox を触るたび innerHTML を作り直すと、
	 * タブのフォーカスが毎回吹き飛ぶため。
	 * ------------------------------------------------------------ */

	// タブに出す軸名。ラベルの「（…）」が実名なのでそちらを優先し、無ければ
	// 先頭の丸数字を落とした部分を使う（⑥その他1（レース環境）→「レース環境」）。
	// 丸数字と「その他N」はタブから外すと8軸が1行に収まるようになる。軸の通し番号は
	// パネルの見出し（axis.label をそのまま出す）に残るので、対応は追える。
	// TAG_AXES 側は無変更で済ませたいので、短縮名をデータに持たせることはしない。
	function splitAxisLabel(label) {
		const m = String(label).match(/^(.+?)（(.+)）$/);
		const main = m ? m[1] : String(label);
		return { main: main, sub: m ? m[2] : '' };
	}

	function axisTabName(label) {
		const parts = splitAxisLabel(label);
		return parts.sub || parts.main.replace(/^[①-⑳]/, '');
	}

	function renderPickerFilterAxes() {
		const el = q(pickerEl, 'filter-axes');

		const tabs = TAG_AXES.map(axis => {
			const isActive = axis.key === picker.activeAxis;
			return '' +
			'<button type="button" role="tab" class="usd-tab" id="usd-tab-' + axis.key + '"' +
				' aria-controls="usd-panel-' + axis.key + '" aria-selected="' + isActive + '"' +
				' tabindex="' + (isActive ? 0 : -1) + '" data-usd-act="filter-tab" data-usd-axis="' + axis.key + '">' +
				'<span class="usd-tab-main">' + esc(axisTabName(axis.label)) + '</span>' +
				'<span class="usd-tab-count" data-usd-el="axis-count" data-usd-axis="' + axis.key + '" hidden></span>' +
			'</button>';
		}).join('');

		const panels = TAG_AXES.map(axis => {
			const isActive = axis.key === picker.activeAxis;
			// 選択肢の見た目だけチップにする。中身は従来どおり本物の checkbox で、
			// data-usd-el / data-axis / data-value もそのまま残してある。
			const opts = axis.options.map(o =>
				'<label class="usd-opt">' +
					'<input type="checkbox" data-usd-el="filter-check" data-axis="' + axis.key + '" data-value="' + esc(o.v) + '"/>' +
					'<span>' + esc(o.t) + '</span>' +
				'</label>'
			).join('');
			const hint = axis.flagAxis ? 'チェックすると該当スキルだけに絞る' : '選んだもののいずれかに一致（OR）';
			return '' +
			'<section role="tabpanel" class="usd-tabpanel' + (isActive ? ' is-active' : '') + '"' +
				' id="usd-panel-' + axis.key + '" aria-labelledby="usd-tab-' + axis.key + '"' +
				' data-usd-axis="' + axis.key + '" tabindex="0">' +
				'<div class="usd-axis-head">' +
					'<h3 class="usd-axis-title">' + esc(axis.label) + '</h3>' +
					'<p class="usd-axis-hint">' + hint + '</p>' +
					'<button type="button" class="usd-link-btn" data-usd-act="filter-clear-axis" data-usd-axis="' + axis.key + '">この軸を解除</button>' +
				'</div>' +
				'<div class="usd-opts-wrap">' +
					'<div class="usd-opts" data-usd-el="axis-options">' + opts + '</div>' +
				'</div>' +
			'</section>';
		}).join('');

		el.innerHTML = '' +
			'<div class="usd-axis-tabs">' +
				'<div class="usd-tabbar" data-usd-el="tabbar" data-usd-rows="1">' +
					'<div class="usd-tablist" role="tablist" aria-label="絞り込みの軸">' + tabs + '</div>' +
				'</div>' +
				'<div class="usd-tabpanels" data-usd-el="tabpanels">' + panels + '</div>' +
				'<div class="usd-active-summary" data-usd-el="filter-summary" aria-live="polite"></div>' +
			'</div>';

		const tablist = el.querySelector('.usd-tablist');
		// WAI-ARIA のタブの作法：←→で隣へ、Home/Endで端へ（移動と同時に切り替える）。
		tablist.addEventListener('keydown', (e) => {
			const keys = TAG_AXES.map(a => a.key);
			const i = keys.indexOf(picker.activeAxis);
			const next = {
				ArrowRight: (i + 1) % keys.length,
				ArrowLeft: (i - 1 + keys.length) % keys.length,
				Home: 0,
				End: keys.length - 1
			}[e.key];
			if (next === undefined) return;
			e.preventDefault();
			selectPickerAxisTab(keys[next], true);
		});
		// scroll はバブリングしないので、選択肢の縦スクロールは捕捉フェーズで1本だけ張る
		// （軸ごとに8本張らずに済む）。
		q(pickerEl, 'tabpanels').addEventListener('scroll', (e) => {
			if (e.target.classList && e.target.classList.contains('usd-opts')) updateOptionFade(e.target);
		}, true);
		if (global.ResizeObserver) new global.ResizeObserver(updatePickerFilterLayout).observe(tablist);
	}

	/* タブの切り替えは aria-selected・tabindex・is-active を揃えて付け替えるだけ。 */
	function selectPickerAxisTab(axisKey, focus) {
		picker.activeAxis = axisKey;
		pickerEl.querySelectorAll('.usd-tab').forEach(tab => {
			const on = tab.dataset.usdAxis === axisKey;
			tab.setAttribute('aria-selected', String(on));
			tab.tabIndex = on ? 0 : -1;
			if (on && focus) tab.focus({ preventScroll: true });
		});
		pickerEl.querySelectorAll('.usd-tabpanel').forEach(panel => {
			panel.classList.toggle('is-active', panel.dataset.usdAxis === axisKey);
		});
	}

	/**
	 * タブバーを1行で出すか、角丸ボタンの格子（多段）で出すかを決める。
	 *
	 * CSSのブレークポイントではなく実測で決めている。軸の数もラベルの長さも
	 * TAG_AXES 次第で変わるので、「何pxから2段」を決め打ちすると、軸を1本足した
	 * だけで静かに破綻するため。1行の指定を当てた状態で横にあふれるかどうかを見る。
	 */
	function updatePickerFilterLayout() {
		if (!pickerEl || pickerEl.hidden) return;
		const bar = q(pickerEl, 'tabbar');
		const tablist = bar && bar.querySelector('.usd-tablist');
		if (!tablist) return;
		bar.setAttribute('data-usd-rows', '1');
		const overflows = tablist.scrollWidth > tablist.clientWidth + 1;
		bar.setAttribute('data-usd-rows', overflows ? 'multi' : '1');

		// 選択肢を「2行ぶん」で頭打ちにする高さは、チップの実測値から決める。
		// px を決め打ちすると、チップの余白や中の checkbox の寸法を触った瞬間に
		// 2行目が半分だけ見える状態へ静かにずれる（実際に踏んだ）。
		const chip = pickerEl.querySelector('.usd-opt');
		const tabs = pickerEl.querySelector('.usd-axis-tabs');
		if (chip && chip.offsetHeight && tabs) tabs.style.setProperty('--usd-opt-row', chip.offsetHeight + 'px');

		pickerEl.querySelectorAll('.usd-opts').forEach(updateOptionFade);
	}

	/* 選択肢が2行に収まりきらないとき、続きがあることを下端のフェードで示す。 */
	function updateOptionFade(opts) {
		const wrap = opts.parentElement;
		if (!wrap) return;
		const more = opts.scrollHeight - opts.clientHeight - opts.scrollTop > 2;
		wrap.toggleAttribute('data-more-below', more);
	}

	/**
	 * 件数バッジ・「この軸を解除」の活性・「絞り込み中」の一覧をまとめて更新する。
	 * タブ化すると他の軸に入れた条件が視界から消えるので、この3つで補っている。
	 */
	function refreshPickerFilterUi() {
		if (!pickerEl) return;
		TAG_AXES.forEach(axis => {
			const n = picker.filters[axis.key].length;
			const badge = pickerEl.querySelector('[data-usd-el="axis-count"][data-usd-axis="' + axis.key + '"]');
			if (badge) { badge.hidden = n === 0; badge.textContent = n; }
			const tab = pickerEl.querySelector('.usd-tab[data-usd-axis="' + axis.key + '"]');
			if (tab) tab.setAttribute('aria-label', axisTabName(axis.label) + (n ? '（' + n + '件選択中）' : ''));
			const clearBtn = pickerEl.querySelector('[data-usd-act="filter-clear-axis"][data-usd-axis="' + axis.key + '"]');
			if (clearBtn) clearBtn.disabled = n === 0;
		});

		const summary = q(pickerEl, 'filter-summary');
		if (!summary) return;
		const active = TAG_AXES.filter(a => picker.filters[a.key].length > 0);
		if (active.length === 0) {
			summary.innerHTML = '<span>条件なし（すべてのスキルを表示）</span>';
			return;
		}
		summary.innerHTML = '<span class="usd-summary-label">絞り込み中</span>' +
			active.map(a =>
				'<button type="button" class="usd-summary-item" data-usd-act="filter-jump" data-usd-axis="' + a.key + '" title="このタブを開く">' +
					'<b>' + esc(axisTabName(a.label)) + '</b>' +
					esc(picker.filters[a.key].map(v => tagLabel(a.key, v)).join('・')) +
				'</button>'
			).join('') +
			'<button type="button" class="usd-link-btn" data-usd-act="filter-clear-all">すべて解除</button>';
	}

	/* モーダルを開き直したときに、チェックと選択中のタブを初期状態へ戻す。 */
	function resetPickerFilterUi() {
		pickerEl.querySelectorAll('[data-usd-el="filter-check"]').forEach(el => { el.checked = false; });
		pickerEl.querySelectorAll('.usd-opts').forEach(el => { el.scrollTop = 0; });
		selectPickerAxisTab(TAG_AXES[0].key, false);
		refreshPickerFilterUi();
		updatePickerFilterLayout();
	}

	function onPickerFilterChange(input) {
		const axis = input.dataset.axis, value = input.dataset.value;
		const arr = picker.filters[axis];
		const idx = arr.indexOf(value);
		if (input.checked && idx === -1) arr.push(value);
		if (!input.checked && idx !== -1) arr.splice(idx, 1);
		refreshPickerFilterUi();
		renderPickerResults();
	}

	function clearPickerAxisFilter(axisKey) {
		picker.filters[axisKey].length = 0;
		pickerEl.querySelectorAll('[data-usd-el="filter-check"][data-axis="' + axisKey + '"]').forEach(el => { el.checked = false; });
		refreshPickerFilterUi();
		renderPickerResults();
	}

	function clearAllPickerFilters() {
		TAG_AXES.forEach(a => { picker.filters[a.key].length = 0; });
		pickerEl.querySelectorAll('[data-usd-el="filter-check"]').forEach(el => { el.checked = false; });
		refreshPickerFilterUi();
		renderPickerResults();
		const tab = pickerEl.querySelector('.usd-tab[data-usd-axis="' + picker.activeAxis + '"]');
		if (tab) tab.focus();
	}

	// 「条件でスキルを検索」の母集団。追加カタログはここには入れない
	// （タグを持たないため、matchesFilters では万能スキル扱いになって全条件に当たる）。
	// 名前で探す側（findSkillsByNameFragment → buildSkillTextIndex）には入っている。
	function getFilteredPickerPool() {
		const pool = masterSkills.concat((ensureUserData().customSkills || []).map(c => ({ id: c.customId, name: c.name, tags: c.tags })));
		const hidden = new Set(pickerHiddenIds);
		return pool.filter(s => !picker.excludeIds.includes(s.id) && !hidden.has(s.id) && matchesFilters(s, picker.filters));
	}

	function renderPickerResults() {
		if (!pickerEl) return;
		const el = q(pickerEl, 'results');
		if (!el) return;
		const filtered = getFilteredPickerPool();
		q(pickerEl, 'result-count').textContent = filtered.length + '件';
		const selectAllBox = pickerEl.querySelector('[data-usd-act="picker-select-all"]');
		if (selectAllBox) selectAllBox.checked = filtered.length > 0 && filtered.every(s => picker.checked.has(s.id));
		updatePickerCommitState();
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
		// 一覧は作り直さない（チェックだけの操作でフォーカスを飛ばさない）ので、
		// フッターの数だけをここで更新する。
		updatePickerCommitState();
	}

	/**
	 * フッターの表示を、いまのチェック状態と「追加済みの総数」に合わせる。
	 *
	 * 2つの数は意味が違うので、出す場所も分けてある。
	 *   脇の「XXX種選択」   … picker.checked ＝ これから足すぶん（まだ足していない）
	 *   ボタンの「XXX種追加済み」… picker.excludeIds ＝ 編集中のセットに入っている総数。
	 *                              背後の「追加済みスキル（XXX種）」と必ず同じ数になる
	 * excludeIds は開くときに編集中のセットの中身をそのまま受け取り、足すたびに伸びるので、
	 * その長さが「いま何種入っているか」になる（一覧には出さないIDでもあるので二重に数えない）。
	 * 背後の見出しと数が重複して見えるが、**スマホでは背後が隠れて片方しか見えない**ため、
	 * ボタン側にも総数を出す意味がある（2026-09-12・おいもさんの実機確認）。
	 * どちらも「表示中を全て選択」の隣の件数（絞り込み結果の総数）とは別のもの。
	 *
	 * 条件で検索・テキストで検索のどちらも同じ集合を使うので、モードでは分けない。
	 * 0種のときは押しても何も足されなかったので、ボタンごと止めて理由を数で示す。
	 */
	function updatePickerCommitState() {
		if (!pickerEl) return;
		const n = picker.checked.size;
		const label = q(pickerEl, 'picker-checked-count');
		if (label) label.textContent = n + '種選択';
		const btn = q(pickerEl, 'picker-commit');
		if (!btn) return;
		btn.disabled = (n === 0);
		// まだ1種も入っていないうちは「（0種追加済み）」を出さない（数える意味がない）。
		// 375px では1行に収まらないので、折り返しは「追加済み」の括弧の中では起こさず、
		// 見出しとの境目で起こす（span 側を nowrap にしてある）。
		const added = picker.excludeIds.length;
		btn.innerHTML = PICKER_COMMIT_LABEL + (added > 0
			? '<span class="usd-foot-added">（' + added + '種追加済み）</span>' : '');
	}

	/**
	 * チェックしたスキルを、開いた側の受け皿へ足す。
	 * 3つのモード（条件で検索・テキストで検索・手入力）はどれもここへ合流するので、
	 * 「一度に2種以上足したらUndoに積む」の判定もここ1か所で済む。
	 *
	 * 受け皿（openPicker の第3引数）は次の形のオブジェクトで渡す:
	 *   { scope, add(ids)->実際に足したIDの配列, remove(ids)->真偽, probe()->文字列 }
	 * 関数をそのまま渡す旧い形も受け付けるが、その場合はUndoに積まない（戻し方が分からないため）。
	 */
	function addCheckedSkills() {
		if (picker.checked.size === 0) { toast('スキルにチェックを入れてください'); return; }
		const ids = Array.from(picker.checked);
		const sink = picker.onAdd;
		const undoable = sink && typeof sink === 'object' && typeof sink.add === 'function';
		// 足す前の姿を控えておく。実際に何種足りたかは足してみないと分からないので、
		// pushUndo は足したあとに回し、戻るべき姿は baseline として渡す（契約どおり）。
		const baseline = undoable ? sink.probe() : null;
		const added = undoable
			? (sink.add(ids) || [])
			: (typeof sink === 'function' ? (sink(ids), []) : []);
		picker.excludeIds = picker.excludeIds.concat(ids);
		picker.checked.clear();
		renderPickerResults();
		// 貼り付けの照合結果は消さずに残し、「追加済み」として見えるようにする
		// （まだ処理していない要確認の行が消えてしまわないように）。
		renderPasteReport();
		if (undoable && added.length >= UNDO_MIN_BULK_ADD) {
			// 取り消し側は「戻しました」の型を使わない。追加のUndoは結果として消えるので、
			// 「戻しました」だと逆の意味に読めるため（削除系とは別の言い回しにする）。
			pushUndo({
				scope: sink.scope,
				baseline: baseline,
				doneLabel: added.length + '種を追加しました',
				undoneLabel: '追加した' + added.length + '種を取り消しました',
				probe: () => sink.probe(),
				apply: () => sink.remove(added.slice())
			});
		}
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
		// 作ったその場で対象セットへ入れる。ここは1件ずつ作る画面なので、
		// 「作る」と「足す」を分けても押す手間が増えるだけになる。
		// モーダルは開いたままにして、続けて何件でも作れるようにしてある。
		if (picker.mode === 'custom') addCheckedSkills();
		renderPickerResults();
		toast('カスタムスキル「' + name + '」を追加しました');
	}

	/* ------------------------------------------------------------
	 * 一括貼り付けのUI
	 * ------------------------------------------------------------ */
	/**
	 * 照合済みの行を報告に載せ、確定してよい行をその場で選択状態に入れる。
	 * 「テキストで検索」（runPasteMatch）と「画像から読み取る」（openSkillRowsPicker）の共通の後処理。
	 *
	 * - kind === 'exact' の行は選択に入れる（従来どおり）。
	 * - 貼り付けでは距離1の候補は必ず利用者に選ばせる（自動採用しない）。
	 * - 画像の読み取りでは、外の照合が `autoAccepted: true` を付けた行（許容距離内で一意に当たった行）も
	 *   選択に入れる（決定 B-2。製品の bestCandidate() と同じ規則で、実測 9,609枚＋素材で誤着地 0）。
	 *   その行は kind が 'review' のままなので、報告では「完全一致ではない行（内容をご確認ください）」として
	 *   上部に並び、チェックが入った状態で出る＝既存の usd-paste-approx の見せ方をそのまま使う。
	 *   貼り付けの行には autoAccepted が無いので、貼り付けの挙動は変わらない。
	 */
	function applyPasteRows(rows) {
		pasteRows = rows || [];
		pasteRows.forEach(r => {
			const accept = r.kind === 'exact' || (r.autoAccepted === true && r.matchedId);
			if (!accept) return;
			r.chosenId = r.matchedId;
			if (picker.excludeIds.indexOf(r.matchedId) === -1) picker.checked.add(r.matchedId);
		});
		renderPasteReport();
		renderPickerResults();
	}

	function runPasteMatch() {
		const input = q(pickerEl, 'paste-input');
		const text = input ? input.value : '';
		if (!text.trim()) { toast('貼り付けたテキストがありません'); return; }
		const result = matchPastedSkillText(text);
		applyPasteRows(result.rows);
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

	/* ============================================================
	 * 「名前を入れて探す」のサブ画面（32セッション目）
	 *
	 * 要確認の行から開く。**スキルセットOCR（ocr モード）と「テキストで検索」（paste モード）で同じ仕組み**を使い、
	 * 切り出し画像の有無だけを出し分ける。Deck 単体ページにも OCR は無いが「テキストで検索」はあるので、
	 * ここが core にある必要がある（special.html 側に置くと Deck 単体ページで使えない）。
	 *
	 * 報告（paste-report）と**入れ替え**で出す。行の中に埋め込むと、報告のスクロール領域（240px）の中に
	 * 入力欄と候補一覧が入ってしまい、スマホでキーボードが出たときに何も見えなくなる。
	 * ============================================================ */

	/** サブ画面と報告の表示を入れ替える。 */
	function togglePasteNameView(on) {
		if (!pickerEl) return;
		// モーダル右上の×は**サブ画面を開いている間だけ隠す**（32セッション目・実機で判明）。
		// 開いている間、利用者には「いま操作しているこの行をやめる」ボタンに見えるが、実際には
		// モーダルごと閉じて読み取った結果が全部消える（読み取り直しは画像の選択からやり直し）。
		// ×そのものは無くさない。一覧の状態では閉じる手段として要る。
		// `.uma-icon-btn[hidden]` が css/common.css で display:none になるので hidden 属性で消える。
		const closeBtn = pickerEl.querySelector('[data-usd-act="picker-close"]');
		if (closeBtn) closeBtn.hidden = !!on;
		q(pickerEl, 'paste-name').hidden = !on;
		q(pickerEl, 'paste-report').hidden = !!on;
		const summary = q(pickerEl, 'paste-summary');
		// 要約は「何種読み取れたか」の話なので、名前を入れている間は引っ込める（縦の余地をあける）
		if (summary && summary.textContent) summary.hidden = !!on;
		// 貼り付け欄は paste モードのときだけ出ているので、開いている間は隠す
		const wrap = q(pickerEl, 'paste-input-wrap');
		if (wrap) wrap.hidden = on ? true : (picker.mode === 'ocr');
		// 確定のフッターは押し間違いのもとになるので、開いている間は畳む
		const spec = PICKER_MODES[picker.mode];
		q(pickerEl, 'picker-footer').hidden = on ? true : !(spec && spec.commit);
	}

	function openPasteNameFinder(rowIndex) {
		const row = pasteRows[rowIndex];
		if (!row) return;
		const area = pickerEl ? q(pickerEl, 'paste-report').querySelector('.usd-paste-scroll') : null;
		pasteName.row = rowIndex;
		pasteName.scroll = area ? area.scrollTop : 0;
		pasteName.composing = false;
		renderPasteNamePanel();
		togglePasteNameView(true);
		const input = q(pickerEl, 'find-input');
		if (input) input.focus();
	}

	function closePasteNameFinder() {
		if (pasteName.timer) { clearTimeout(pasteName.timer); pasteName.timer = null; }
		const scroll = pasteName.scroll;
		pasteName = { row: -1, scroll: 0, composing: false, timer: null };
		if (!pickerEl) return;
		togglePasteNameView(false);
		q(pickerEl, 'paste-name').textContent = '';
		const area = q(pickerEl, 'paste-report').querySelector('.usd-paste-scroll');
		if (area && scroll) area.scrollTop = scroll;
	}

	/** サブ画面の枠を組み立てる（1回だけ）。候補の中身は renderPasteNameResults() が入れ替える。 */
	function renderPasteNamePanel() {
		const row = pasteRows[pasteName.row];
		if (!row || !pickerEl) return;
		const el = q(pickerEl, 'paste-name');
		const img = row.panelImage
			? '<img class="usd-name-img" data-usd-el="find-img" src="' + esc(row.panelImage) + '" alt="読み取り元のスキルパネル"' +
				(typeof pasteOptions.onShowPanel === 'function' ? ' data-usd-act="name-zoom"' : '') + '>'
			: '';
		el.innerHTML = '' +
			// 戻るは**サブ画面で唯一の目に見える戻り手段**なので、押せることが一目で分かる大きさにする
			// （32セッション目・実機。以前は .usd-paste-skip ＝下線付きの淡い小さな文字で、押せる要素に見えなかった）。
			// 候補チップ（押すと確定）とも「開く」ボタンとも違う3つ目の形＝共通部品の二次ボタンを使う。
			'<div class="usd-name-head">' +
				'<button type="button" class="uma-btn uma-btn--secondary usd-name-back" data-usd-act="name-back">' +
					'<i data-lucide="arrow-left" class="w-4 h-4"></i><span>一覧へ戻る</span>' +
				'</button>' +
			'</div>' +
			(row.raw ? '<p class="usd-paste-hint usd-name-read">読み取った文字：「' + esc(row.raw) + '」</p>' : '') +
			img +
			'<label class="usd-name-label" for="usd-find-input">スキル名を入力すると候補が出ます</label>' +
			'<input type="text" id="usd-find-input" class="usd-input uma-input" data-usd-el="find-input" autocomplete="off" placeholder="名前の一部を入力（例：下り）">' +
			'<div class="usd-name-results" data-usd-el="find-results"></div>';
		refreshIcons(); // 戻るボタンの矢印（lucide）を実体化する
		const input = q(pickerEl, 'find-input');
		// 日本語入力の変換中は絞り込まない（未確定の文字で絞ると候補が目まぐるしく入れ替わる）。
		// compositionend のあとに input が来ない環境があるので、compositionend でも走らせる。
		input.addEventListener('compositionstart', () => { pasteName.composing = true; });
		input.addEventListener('compositionend', () => { pasteName.composing = false; schedulePasteNameSearch(); });
		input.addEventListener('input', (e) => {
			if (pasteName.composing || (e && e.isComposing)) return;
			schedulePasteNameSearch();
		});
		renderPasteNameResults();
	}

	function schedulePasteNameSearch() {
		if (pasteName.timer) clearTimeout(pasteName.timer);
		pasteName.timer = setTimeout(() => { pasteName.timer = null; renderPasteNameResults(); }, NAME_FIND_DEBOUNCE_MS);
	}

	/** 入力に応じた候補一覧。入力が空なら何も出さない。 */
	function renderPasteNameResults() {
		if (!pickerEl || pasteName.row < 0) return;
		const input = q(pickerEl, 'find-input');
		const out = q(pickerEl, 'find-results');
		if (!input || !out) return;
		const found = findSkillsByNameFragment(input.value);
		if (!found.query) { out.innerHTML = ''; return; }
		if (found.total === 0) {
			// 候補0件でも**自動でカスタム登録へ進ませない**（入力し直せる状態を保つ）。
			// 登録の導線は押しやすいボタンではなくリンク相当にして、控えめに置く。
			out.innerHTML = '<p class="usd-paste-hint usd-name-none">一致するスキルがありません。入力に誤りがないかご確認ください。新しく追加されたスキルなど、このツールに収録されていないスキルの可能性もあります。</p>' +
				'<button type="button" class="usd-paste-skip usd-name-custom" data-usd-act="name-custom">収録されていないスキルとして追加</button>';
			return;
		}
		const excluded = new Set(picker.excludeIds);
		// 編成で得られるものも、条件での検索と違って**一覧からは消さない**。
		// 名前を打った本人には「その名前で合っていた」ことが分かるほうがよいので、
		// 追加済みと同じく、出したうえで選べなくする（C-51）。
		const hidden = new Set(pickerHiddenIds);
		out.innerHTML = '<div class="usd-name-list">' +
			found.hits.map(h => excluded.has(h.id)
				// 追加済みのものも**一覧から消さない**（消すと「打ち間違えたのか」と迷うため）。
				// 出したうえで選べなくする＝自分の入力が正しかったことは確認できる。
				? '<span class="usd-name-hit usd-name-hit--added">' + esc(h.name) + '<span class="usd-name-added">追加済み</span></span>'
				: (hidden.has(h.id)
					? '<span class="usd-name-hit usd-name-hit--added">' + esc(h.name) + '<span class="usd-name-added">この編成で得られます</span></span>'
					: '<button type="button" class="usd-name-hit" data-usd-act="name-pick" data-skill-id="' + esc(h.id) + '">' + esc(h.name) + '</button>')
			).join('') + '</div>' +
			(found.more > 0 ? '<p class="usd-paste-hint">ほかにも候補があります（全' + found.total + '件）。もう少し入力すると絞り込めます。</p>' : '');
	}

	/** 候補を選んで確定する。格上げは候補チップと同じ既存の処理を使う。 */
	function pickPasteNameResult(skillId) {
		const rowIndex = pasteName.row;
		if (rowIndex < 0 || !skillId) return;
		closePasteNameFinder();
		choosePasteCandidate(rowIndex, skillId);
	}

	/**
	 * 収録されていないスキルとして登録する（32セッション目）。
	 * **利用者が入力した文字列がそのまま登録名になる。** 以前の `createCustomFromPasteRow()` は
	 * `row.norm`（OCRの読みを正規化した文字列）を登録名にしていたため、画面に出ている文字と
	 * 登録される名前が食い違うことがあった。その関数ごと置き換えた。
	 */
	function createCustomFromName() {
		const rowIndex = pasteName.row;
		const input = pickerEl ? q(pickerEl, 'find-input') : null;
		const name = input ? String(input.value || '').trim() : '';
		if (rowIndex < 0 || !pasteRows[rowIndex]) return;
		if (!name) { toast('スキル名を入力してください'); return; }
		const id = createCustomSkill(name, emptyTagSet());
		if (!id) return;
		pasteRows[rowIndex].chosenId = id;
		closePasteNameFinder();
		renderPasteReport();
		renderPickerResults();
		toast('「' + name + '」を収録されていないスキルとして追加しました（タグは未設定です）');
	}

	/** サブ画面の中の画像を押したとき。原寸で見せる作りは呼び出し元が持つ（special.html の .uma-overlay）。 */
	function zoomPasteNameImage() {
		const row = pasteRows[pasteName.row];
		if (!row || !row.panelImage) return;
		if (typeof pasteOptions.onShowPanel === 'function') pasteOptions.onShowPanel(row);
	}

	// そのスキルを参照している貼り付け行がもう無く、まだ追加もされていなければ選択を外す
	function releaseIfUnused(skillId) {
		if (!skillId) return;
		if (pasteRows.some(o => o.chosenId === skillId)) return;
		if (picker.excludeIds.indexOf(skillId) !== -1) return;
		picker.checked.delete(skillId);
	}

	function skipPasteRow(rowIndex) {
		if (rowIndex < 0 || rowIndex >= pasteRows.length) return;
		// 添字がずれるので、サブ画面が開いたままなら閉じる（通常は報告が隠れていて押せない）
		if (pasteName.row >= 0) closePasteNameFinder();
		const removed = pasteRows.splice(rowIndex, 1)[0];
		releaseIfUnused(removed.chosenId);
		renderPasteReport();
		renderPickerResults();
	}

	function renderPasteReport() {
		if (!pickerEl) return;
		const el = q(pickerEl, 'paste-report');
		if (!el) return;
		// 照合・候補の選び直し・行のスキップはどれも picker.checked を動かすので、
		// 貼り付けモードでもフッターの数を同じ関数で追従させる。
		updatePickerCommitState();
		if (pasteRows.length === 0) { el.innerHTML = ''; return; }

		/* この関数は報告を innerHTML で総入れ替えする。中にあるスクロール領域（.usd-paste-scroll）も
		   作り直されるので、**何もしないと scrollTop が 0 に戻る**（31セッション目・実機で判明。
		   要確認が複数あるとき、上から順に候補を選んでいく操作ができなくなっていた）。
		   総入れ替えをやめて「変わった行だけ差し替える」形にはしない。候補を選んだ行は要確認から
		   「完全一致ではない行」へ**区画をまたいで移動する**うえ、行のボタンが持つ番号は
		   pasteRows の添字で、「無視する」が splice するたびに後ろが全部ずれるので、
		   結局どの道すべての行を描き直すことになる（F-28 のタブ化とは事情が違う）。
		   ここでは前後のスクロール位置を持ち越すだけにする。 */
		const bodyEl = q(pickerEl, 'picker-body');
		const keep = {
			inner: (el.querySelector('.usd-paste-scroll') || {}).scrollTop || 0,
			body: bodyEl ? bodyEl.scrollTop : 0
		};
		const restoreScroll = () => {
			const next = el.querySelector('.usd-paste-scroll');
			if (next && keep.inner) next.scrollTop = keep.inner;
			if (bodyEl && keep.body) bodyEl.scrollTop = keep.body;
		};

		// 「名前を入れて探す」を開くボタン（32セッション目）。**すべての要確認・解決済みの行に出す。**
		// 画像を持つ行（スキルセットOCR）は画像も一緒に出すので、そのことが分かる名前にする。
		// 「押すと確定する」候補チップ（.usd-paste-cand）とは別のクラス（.usd-paste-panel＝押すと何かが開く）。
		const findBtn = (r, i) => '<button type="button" class="usd-paste-panel" data-usd-act="paste-find" data-row="' + i + '">' +
			(r.panelImage ? '画像を見て入力' : '入力して探す') + '</button>';

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
						'<span class="usd-paste-acts">' + findBtn(r, i) +
							'<button type="button" class="usd-paste-skip" data-usd-act="paste-skip" data-row="' + i + '">取り消す</button>' +
						'</span>' +
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
						'<span class="usd-paste-acts">' + findBtn(r, i) +
							'<button type="button" class="usd-paste-skip" data-usd-act="paste-skip" data-row="' + i + '">無視する</button>' +
						'</span>' +
					'</div>';
				// 候補がある行は従来どおりチップを並べる。候補が無い行には**何も置かない**
				// （32セッション目に「近いスキルが見つかりませんでした」＋「カスタムスキルとして追加」の
				//  組み合わせを廃止した。読み違いをそのまま登録させる近道になっていたため。
				//  代わりの導線は上の「入力して探す」で、カスタム登録はその中で候補0件のときだけ出る）。
				if (r.candidates.length > 0) {
					html += '<div class="usd-paste-cands"><span class="usd-paste-hint">近いスキル：</span>' +
						r.candidates.map(c =>
							'<button type="button" class="usd-paste-cand" data-usd-act="paste-pick" data-row="' + i + '" data-skill-id="' + esc(c.id) + '">' + esc(c.name) + '</button>'
						).join('') + '</div>';
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
		restoreScroll();
	}

	/**
	 * スキル選択モーダルを開く（ツール非依存）。
	 * existingSkillIds: 既に選択済みで一覧から除外したいID
	 * onAdd: 追加が押されたときに呼ばれる。引数は追加されたIDの配列。
	 */
	function openPicker(mode, existingSkillIds, onAdd) {
		ensurePicker();
		picker.mode = PICKER_MODES[mode] ? mode : 'filter';
		picker.filters = {};
		TAG_AXES.forEach(a => { picker.filters[a.key] = []; });
		picker.checked = new Set();
		picker.excludeIds = (existingSkillIds || []).slice();
		picker.onAdd = onAdd;
		pasteRows = [];
		// 呼び出し元の口はモードをまたいで残さない。openSkillRowsPicker がこの後で入れ直す
		pasteOptions = {};
		// 「名前を入れて探す」も開いたままにしない（モードを変えたら報告ごと作り直すため）
		if (pasteName.timer) clearTimeout(pasteName.timer);
		pasteName = { row: -1, scroll: 0, composing: false, timer: null };
		const nameEl = q(pickerEl, 'paste-name');
		if (nameEl) { nameEl.hidden = true; nameEl.textContent = ''; }
		q(pickerEl, 'paste-report').hidden = false;
		// サブ画面を開いたまま閉じられていた場合に備えて、×を出し直す
		const closeBtnReset = pickerEl.querySelector('[data-usd-act="picker-close"]');
		if (closeBtnReset) closeBtnReset.hidden = false;
		const pasteInput = q(pickerEl, 'paste-input');
		if (pasteInput) pasteInput.value = '';
		const customName = q(pickerEl, 'custom-name');
		if (customName) customName.value = '';
		pickerEl.querySelectorAll('[data-usd-el="custom-tag"]').forEach(el => { el.checked = false; });

		const spec = PICKER_MODES[picker.mode];
		q(pickerEl, 'picker-title').textContent = spec.title;
		// ocr モードは paste の枠を借りる（貼り付け欄だけ隠す）。要約は openSkillRowsPicker が入れる
		const isOcr = picker.mode === 'ocr';
		q(pickerEl, 'mode-filter').hidden = picker.mode !== 'filter';
		q(pickerEl, 'mode-paste').hidden = !(picker.mode === 'paste' || isOcr);
		q(pickerEl, 'mode-custom').hidden = picker.mode !== 'custom';
		q(pickerEl, 'paste-input-wrap').hidden = isOcr;
		const summaryEl = q(pickerEl, 'paste-summary');
		summaryEl.hidden = true;
		summaryEl.textContent = '';
		// 手入力は作った時点でその場で足すので、下の確定ボタンは要らない。
		// フッターごと畳む（条件で検索・テキストで検索の2モードは同じフッターを使う）。
		q(pickerEl, 'picker-commit').hidden = !spec.commit;
		q(pickerEl, 'picker-footer').hidden = !spec.commit;

		pickerEl.hidden = false;
		// 幅が確定するのは hidden を外したあとなので、タブの段数の判定もここで行う。
		resetPickerFilterUi();
		renderPickerResults();
		renderPasteReport();
		refreshIcons();
		const focusTarget = picker.mode === 'paste' ? pasteInput : (picker.mode === 'custom' ? customName : null);
		if (focusTarget) focusTarget.focus();
	}

	// 条件でスキルを検索（8軸フィルター）。従来の openSkillPicker と同じ呼び出し方。
	function openSkillPicker(existingSkillIds, onAdd) { openPicker('filter', existingSkillIds, onAdd); }
	// テキストで検索（貼り付けたテキストとマスターの照合）。
	function openTextSkillPicker(existingSkillIds, onAdd) { openPicker('paste', existingSkillIds, onAdd); }
	// マスターにないスキルを追加（名前＋8軸タグの手入力）。
	function openCustomSkillPicker(existingSkillIds, onAdd) { openPicker('custom', existingSkillIds, onAdd); }

	/**
	 * 外で照合を済ませた行を受け取って、候補の選択と確定だけをするモーダルを開く（スキルセットOCR・フェーズa コミット3）。
	 *
	 * @param existingSkillIds 既に入っているID（一覧から除外）
	 * @param onAdd            openPicker と同じ受け皿（{scope, add, remove, probe} か fn(ids)）
	 * @param rows             matchPastedSkillText() の rows と同じ形:
	 *                         { raw, norm, kind:'exact'|'review'|'none'|'error', matchedId, matchedName,
	 *                           candidates:[{id,name,distance}], reason?, autoAccepted? }
	 *                         autoAccepted:true の 'review' 行は選択に入った状態で出る（applyPasteRows）。
	 * @param options          省略可。`{ onShowPanel(row) }` を渡すと、**`row.panelImage` を持つ行にだけ**
	 *                         「画像を見る」ボタンを出し、押されたらその行を渡して呼ぶ（31セッション目）。
	 *                         **core 自身は画像を描かない。** 表示は呼び出し元（special.html が既存の
	 *                         `.uma-overlay` で出す。z-index 111 ＞ このモーダルの 80）。
	 * @param summary          { white, gold } 省略可。white＝確認なしで採用した白の種数（直下の「選択 N件」と
	 *                         一致する）、gold＝金の種数（読みの揺れで1〜2多く出るので「約」を付けて出す）。
	 *                         文面は formatRowsSummary。読み取れなかったパネルの数はここでは扱わない
	 *                         （31セッション目に文面4aを廃止。区画ごと special.html が持つ）。
	 *                         タブごとの内訳や設定数は利用者向けには出さない（開発ログだけ。コミット4の決定）。
	 *
	 * 照合そのものはここで行わない。この関数は Deck 側の照合（normalizeSkillText。混同マップ無し）を通さないので、
	 * common.js 側で CHAR_CONFUSION_MAP を効かせた結果をそのまま見せられる。
	 */
	function openSkillRowsPicker(existingSkillIds, onAdd, rows, summary, options) {
		openPicker('ocr', existingSkillIds, onAdd);
		pasteOptions = options || {};
		const text = formatRowsSummary(summary);
		const summaryEl = q(pickerEl, 'paste-summary');
		summaryEl.textContent = text;
		summaryEl.hidden = !text;
		applyPasteRows(Array.isArray(rows) ? rows.slice() : []);
	}

	/**
	 * 読み取りの要約の文面（Chat が確定。HANDOFF C-24「確定した文面4件」。**ここで勝手に変えない**）。
	 *   1. 通常時（白N・金M）: 「白スキル N種を読み取りました。金スキル（約M種）は対象外です。」
	 *   2. 金0件:             「白スキル N種を読み取りました。」
	 *   3. 白0件＋金N件:      3行
	 * 「白スキル」はゲーム内の色の呼び名。「取り込む」は Deck への受け渡しの意味に固定されているので使わない
	 * （ピッカーの動詞は「追加」）。「対象外」は Deck の取り込み結果で既にスキルに対して使われている語。
	 *
	 * **31セッション目（2026-09-14）の実機確認を受けた変更**（C-24「確定文面の変更」）:
	 *   - 注記「※白スキルは「〇〇の目覚め」等を含みます」は**撤去**した。目覚め6種はスキルセット画面に
	 *     原理上表示されない（`reference/not-on-skillset-screen.json`。網羅率の分母が 439種なのがその根拠）ので、
	 *     この画面に絶対に出ないものを白スキルの唯一の例として挙げていたことになる。
	 *   - 利用者向けの文言では、この画面の1つ1つのスキルの表示を**スキルパネル**と呼ぶ（「カード」「枚」は使わない）。
	 *   - **【廃止済み・いまは使っていない文言】文面4a**。「ほかに N つのスキルパネルを…」という
	 *     読み取れなかった数を出す行があったが、31セッション目に**この関数から取り除いた**
	 *     （下の実装にこの行は無い。復活させないこと）。
	 *     おいもさんの決定2＝手1（重複除去はせず見せ方で引き受ける）を採ったことで **N は「足りない数」ではなくなり**、
	 *     数字を出し続けると「N個足りない」と読まれ続ける。読み取れなかったパネルは**画像を並べて見せる**ので、
	 *     数は見れば分かり、数字が重複する。区画と文面は special.html（`#deck-ocr-panels`）が持つ。
	 *     そのため `summary` に `unreadable` を渡す必要はもう無い。
	 * @returns {string} 要約の文面（複数行）。要約が無いときは空文字
	 */
	function formatRowsSummary(s) {
		if (!s) return '';
		const n = typeof s.white === 'number' ? s.white : 0;
		const m = typeof s.gold === 'number' ? s.gold : 0;
		const lines = [];
		if (n === 0 && m > 0) {
			lines.push('金スキル（約' + m + '種）が見つかりましたが、白スキルはありませんでした。');
			lines.push('金スキルは対象外です。金スキルに対応する白スキルを探す機能は、まだありません。');
			lines.push('白スキルは「テキストで検索」または「条件でスキルを検索」から追加してください。');
		} else {
			lines.push('白スキル ' + n + '種を読み取りました。' + (m > 0 ? '金スキル（約' + m + '種）は対象外です。' : ''));
		}
		return lines.join('\n');
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
	 *   draftScopeKey     … 文字列を渡すと「ドラフト」（保存しない一時的な対象スキルセット）を
	 *                       一覧の先頭に出し、その内容を localStorage に永続化する。
	 *                       省略すると従来どおりテンプレートだけを扱う（uma-skill-deck.html はこちら）。
	 *   onSelectionChange … 選択が変わったとき fn(selection|null)。selection は getSelection() と同じ形。
	 *   onChange          … テンプレート/ドラフト/カスタムスキルが変化したとき fn()
	 *   onViewChange      … 一覧⇄編集が切り替わったとき fn('list'|'editor')
	 *   screenshotEntry   … { label, onClick } を渡すと、編集画面の入口の並び（「テキストで検索」と
	 *                       「マスターにないスキルを追加」の間）に4つ目の入口「スクショから読み取る」を出す。
	 *                       押したときの処理は呼び出し元（special.html のスキルセットOCR。撮影ガイドを開く）が持つ。
	 *                       省略すると出ない（uma-skill-deck.html はこちら。Deck 単体ページの入口は後続）。
	 *
	 * 呼び出し元がテンプレートIDやドラフトの区別を意識しなくて済むよう、
	 * 選択結果は getSelection() が返す { kind, id, name, skillIds } に統一している。
	 */
	/**
	 * 編成パネル（C-51）。**呼び出し元に依存しない**形にしてあるので、
	 * いまは special.html の Deck の引き出しだけに置いているが、
	 * そのまま uma-skill-deck.html のタブにも差せる。
	 *
	 * options:
	 *   onHiddenIdsChange(ids) … 「一覧から隠す」の対象が変わったとき（任意）
	 *   onRemoveFromScope(ids) … 「いまの対象スキルセットから外す」を押したとき。
	 *                            渡さなければそのボタンを出さない
	 */
	function createRosterPanel(container, options) {
		if (!container) return null;
		injectStyles();
		const opts = options || {};
		let roster = emptyRoster();
		let selectedId = '';          // 保存済みを選んでいればその rosterId
		let picking = null;           // { kind: 'uma' } / { kind: 'card', index } / null
		let pickQuery = '';           // ミニウィンドウの検索語
		let pickType = '';            // ミニウィンドウの種類の絞り込み（'' はすべて）
		let hide = false;             // 「一覧から隠す」
		let findTimer = 0;
		let lastOverlap = -1;         // 対象スキルセットと重なっていた数（通知の出し分け用）

		function computed() { return computeRosterSkills(roster); }

		function applyHidden() {
			const ids = hide ? computed().skillIds : [];
			pickerHiddenIds = ids;
			if (typeof opts.onHiddenIdsChange === 'function') opts.onHiddenIdsChange(ids.slice());
		}

		/** Step 2 でいま選んでいるスキルセットと、この編成で得られるスキルの重なりの数。 */
		function overlapWithScope(skillIds) {
			if (typeof opts.getScopeSkillIds !== 'function') return 0;
			const scope = opts.getScopeSkillIds() || [];
			if (scope.length === 0) return 0;
			const have = new Set(skillIds);
			return scope.filter(id => have.has(id)).length;
		}

		/**
		 * 編成を触ったあとで、Step 2 の選択と重なっていたら知らせる（C-51 の修正5）。
		 * **黙って消さない。** 画面には常に件数を出したうえで、増えた瞬間だけトーストも出す
		 * （引き出しの下のほうを見ていなくても気づけるように）。
		 */
		function notifyOverlap() {
			const n = overlapWithScope(computed().skillIds);
			if (n > 0 && n !== lastOverlap) {
				toast('Step 2 で選んでいるスキルセットに、この編成で得られるスキルが ' + n + '種 含まれています');
			}
			lastOverlap = n;
		}

		function labelOfUma() {
			if (!roster.umaId) return '育成ウマ娘を選ぶ';
			const uma = findUma(roster.umaId);
			return uma ? formatEntryLabel(uma) : '（読み込めません：' + roster.umaId + '）';
		}
		function labelOfCard(i) {
			const id = roster.cardIds[i];
			if (!id) return '＋ カードを選ぶ';
			const card = findCard(id);
			return card ? formatEntryLabel(card) : '（読み込めません：' + id + '）';
		}

		/**
		 * 選ぶ候補。**並びはリストの降順**（新しいものが先頭）。
		 * 昇順だと、いま使うカードほど後ろに来て実用に合わない（おいもさんの指摘）。
		 * 名前は部分一致だけ（あいまい照合は入れない）。種類はデータにあるときだけ効く。
		 */
		function searchEntries(kind, text, type) {
			const query = normalizeSkillText(text || '');
			const pool = (kind === 'uma' ? listUmas() : listCards()).slice().reverse();
			const used = kind === 'card' ? roster.cardIds.filter(Boolean) : [];
			return pool
				.filter(e => !type || cardTypeOf(e) === type)
				.filter(e => !query || normalizeSkillText(formatEntryLabel(e)).indexOf(query) !== -1)
				.map(e => ({ id: e.id, label: formatEntryLabel(e), used: used.indexOf(e.id) !== -1 }));
		}

		/**
		 * 選ぶためのミニウィンドウ。押した場所からテキスト欄へ飛ばさず、その場で開いて
		 * 候補を一度に並べる（おいもさんの指摘）。**育成ウマ娘もサポートカードも同じ作り**に
		 * してある ―― 片方だけ別の操作にすると、使う人が2つのやり方を覚えることになるため。
		 */
		function searchHtml() {
			if (!picking) return '';
			const isCard = picking.kind === 'card';
			const what = isCard ? 'サポートカード' : '育成ウマ娘';
			const types = isCard ? listCardTypes() : [];
			let h = '<div class="usd-roster-modal" data-usd-el="modal">';
			h += '<div class="usd-roster-modal-back" data-usd-act="cancel-pick"></div>';
			h += '<div class="usd-roster-modal-box" role="dialog" aria-modal="true" aria-label="' + what + 'を選ぶ">';
			h += '<div class="usd-roster-modal-head"><span class="usd-roster-h">' + what + 'を選ぶ</span>'
				+ '<button type="button" class="uma-icon-btn" data-usd-act="cancel-pick" aria-label="閉じる">×</button></div>';
			h += '<input class="uma-input" type="search" data-usd-el="find" data-usd-act="find" value="' + esc(pickQuery) + '"'
				+ ' placeholder="' + (isCard ? 'サポートカード名で検索' : '育成ウマ娘名で検索') + '" />';
			if (isCard) {
				if (types.length > 0) {
					h += '<div class="usd-roster-pills" data-usd-el="types">'
						+ '<button type="button" class="usd-roster-pill" data-usd-act="type" data-value=""'
						+ ' aria-pressed="' + (pickType === '' ? 'true' : 'false') + '">すべて</button>'
						+ types.map(t => '<button type="button" class="usd-roster-pill" data-usd-act="type" data-value="' + esc(t) + '"'
							+ ' aria-pressed="' + (pickType === t ? 'true' : 'false') + '">' + esc(t) + '</button>').join('')
						+ '</div>';
				} else {
					// データに種類が入れば、この分岐は自動で絞り込みの側へ移る。
					h += '<p class="usd-roster-note">種類のデータがまだありません。</p>';
				}
			}
			h += '<div class="usd-roster-hits" data-usd-el="hits"></div>';
			h += '</div></div>';
			return h;
		}

		function renderHits() {
			const box = q(container, 'hits');
			if (!box || !picking) return;
			const hits = searchEntries(picking.kind, pickQuery, picking.kind === 'card' ? pickType : '');
			if (hits.length === 0) { box.innerHTML = '<p class="usd-roster-note">見つかりません。</p>'; return; }
			const shown = hits.slice(0, PICK_LIST_LIMIT);
			box.innerHTML = '<div class="usd-name-list">' + shown.map(h => h.used
				// 同じカードを2枠には入れられない（実際に組めないため）。判定は id で行う
				// ので、同じ二つ名の別のカードは別物として選べる。
				? '<span class="usd-name-hit usd-name-hit--added">' + esc(h.label) + '<span class="usd-name-added">この編成に入っています</span></span>'
				: '<button type="button" class="usd-name-hit" data-usd-act="take" data-entry-id="' + esc(h.id) + '">' + esc(h.label) + '</button>'
			).join('') + '</div>'
				+ (hits.length > shown.length
					? '<p class="usd-roster-note">全' + hits.length + '件のうち ' + shown.length + '件を出しています。名前を入れると絞り込めます。</p>'
					: '<p class="usd-roster-note">' + hits.length + '件</p>');
		}

		function render() {
			const uma = roster.umaId ? findUma(roster.umaId) : null;
			const stars = starChoicesOf(uma);
			const maxLv = maxAwakeningLevelOf(uma);
			const res = computed();
			const saved = listRosters();

			let h = '<div class="usd-roster">';

			// αテスト中であることを、パネルを開いたら必ず目に入る位置に出す。
			h += '<p class="usd-roster-alpha">αテスト中の機能です。まだ作りかけで、'
				+ '<strong>結果が正しくないことがあります</strong>。確かめながらお使いください。</p>';

			// 保存した編成
			h += '<div class="usd-roster-sec"><p class="usd-roster-h">編成（' + saved.length + '／' + ROSTER_LIMIT + '件）</p>';
			h += '<div class="usd-roster-row">';
			h += '<select class="uma-input" data-usd-act="select"><option value="">新しい編成</option>'
				+ saved.map(r => '<option value="' + esc(r.rosterId) + '"' + (r.rosterId === selectedId ? ' selected' : '') + '>'
					+ esc(r.name || '（名称未設定）') + '</option>').join('') + '</select>';
			h += '<input class="uma-input" type="text" data-usd-el="name" data-usd-act="name" placeholder="編成の名前" value="' + esc(roster.name || '') + '" />';
			h += '<button type="button" class="uma-btn uma-btn--primary" data-usd-act="save">保存</button>';
			if (selectedId) h += '<button type="button" class="uma-btn uma-btn--ghost" data-usd-act="delete">削除</button>';
			h += '</div></div>';

			// 育成ウマ娘
			h += '<div class="usd-roster-sec"><p class="usd-roster-h">育成ウマ娘</p>';
			h += '<div class="usd-roster-row">';
			h += '<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="pick-uma">' + esc(labelOfUma()) + '</button>';
			if (roster.umaId) h += '<button type="button" class="uma-btn uma-btn--ghost" data-usd-act="clear-uma">外す</button>';
			h += '</div>';
			if (uma) {
				if (stars.length > 0) {
					h += '<div class="usd-roster-row"><span class="usd-roster-note">★</span><div class="usd-roster-pills">'
						+ stars.map(s => '<button type="button" class="usd-roster-pill" data-usd-act="star" data-value="' + s + '"'
							+ ' aria-pressed="' + (roster.star === s ? 'true' : 'false') + '">★' + s + '</button>').join('')
						+ '</div></div>';
				}
				if (maxLv > 0) {
					const lv = [];
					for (let i = 1; i <= maxLv; i++) lv.push(i);
					h += '<div class="usd-roster-row"><span class="usd-roster-note">覚醒</span><div class="usd-roster-pills">'
						+ lv.map(n => '<button type="button" class="usd-roster-pill" data-usd-act="awk" data-value="' + n + '"'
							+ ' aria-pressed="' + (roster.awakeningLevel === n ? 'true' : 'false') + '">Lv' + n + '</button>').join('')
						+ '</div></div>';
				}
			}
			h += '</div>';

			// サポートカード
			h += '<div class="usd-roster-sec"><p class="usd-roster-h">サポートカード</p><div class="usd-roster-slots">';
			for (let i = 0; i < ROSTER_CARD_SLOTS; i++) {
				h += '<div class="usd-roster-slot">'
					+ '<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="pick-card" data-index="' + i + '">'
					+ esc(labelOfCard(i)) + '</button>'
					+ (roster.cardIds[i] ? '<button type="button" class="uma-icon-btn" data-usd-act="clear-card" data-index="' + i + '" aria-label="外す">×</button>' : '')
					+ '</div>';
			}
			h += '</div></div>';

			h += searchHtml();

			// 得られるスキル
			h += '<div class="usd-roster-sec">';
			h += '<p class="usd-roster-h">この編成のカードと覚醒で得られるスキル ' + res.items.length + '種</p>';
			if (res.items.length === 0) {
				h += '<p class="usd-roster-note">育成ウマ娘とサポートカードを選ぶと、ここに出ます。</p>';
			} else {
				h += '<div class="usd-roster-got">' + res.items.map(it =>
					'<div class="usd-roster-got-row"><span class="usd-roster-got-name">' + esc(it.name) + '</span>'
					+ '<span class="usd-roster-got-from">' + esc(it.origins.join(' / ')) + '</span></div>').join('') + '</div>';
			}
			if (res.unconfirmed.length > 0) {
				// 件数だけでは「どれを埋めればよいか」が分からないので、名前で出す。
				h += '<p class="usd-roster-warn">まだ調べていないものがあります（これらは<strong>得られる側に入れていません</strong>）。</p>';
				h += '<ul class="usd-roster-unconf">' + res.unconfirmed.map(u =>
					'<li>' + esc(u.label) + ' の' + esc(u.what) + '</li>').join('') + '</ul>';
			}
			if (res.missing.length > 0) {
				h += '<p class="usd-roster-warn">読み込めないものがあります（収録データが変わった可能性があります）: '
					+ esc(res.missing.map(m => m.id).join(' / ')) + '</p>';
			}
			h += '</div>';

			// 対象スキルセットへの効かせ方
			h += '<div class="usd-roster-row">';
			h += '<label class="usd-roster-note"><input type="checkbox" data-usd-act="hide"' + (hide ? ' checked' : '') + ' /> '
				+ 'Step 2 でスキルを選ぶときに、これらを隠す</label>';
			if (typeof opts.onRemoveFromScope === 'function') {
				h += '<button type="button" class="uma-btn uma-btn--neutral" data-usd-act="remove"'
					+ (res.items.length === 0 ? ' disabled' : '') + '>Step 2 で選んでいるスキルセットから、これらを外す</button>';
			}
			h += '</div>';
			// Step 2 ですでに選んであるスキルとの重なり。**黙って消さない**ので、
			// 何件重なっているかを常に出し、外すかどうかは押して決めてもらう。
			const overlap = overlapWithScope(res.skillIds);
			if (overlap > 0) {
				h += '<p class="usd-roster-warn">Step 2 で選んでいるスキルセットに、この編成で得られるスキルが <strong>'
					+ overlap + '種</strong> 含まれています（<strong>まだ外していません</strong>。上のボタンで外せます）。</p>';
			}
			h += '<p class="usd-roster-note">ここに出ていないスキルが、この編成のカードと覚醒では得られないものです。</p>';
			h += '</div>';

			container.innerHTML = h;
			refreshIcons();
			if (picking) {
				const input = q(container, 'find');
				if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
			}
		}

		function loadSelected(id) {
			selectedId = id || '';
			const found = id ? findRoster(id) : null;
			roster = found ? snapshot(found) : emptyRoster();
			roster.cardIds = (roster.cardIds || []).slice(0, ROSTER_CARD_SLOTS);
			while (roster.cardIds.length < ROSTER_CARD_SLOTS) roster.cardIds.push(null);
			picking = null;
			applyHidden();
			render();
			// 保存してある編成を選び直すのも「Step 1 を操作した」うち。
			// ここで知らせないと、選んだ瞬間に Step 2 との重なりが生まれても気づけない。
			lastOverlap = -1;
			notifyOverlap();
		}

		container.addEventListener('click', function (ev) {
			const btn = ev.target.closest('[data-usd-act]');
			if (!btn || !container.contains(btn)) return;
			const act = btn.getAttribute('data-usd-act');
			if (act === 'pick-uma') { picking = { kind: 'uma' }; pickQuery = ''; pickType = ''; render(); renderHits(); }
			else if (act === 'pick-card') {
				picking = { kind: 'card', index: Number(btn.getAttribute('data-index')) };
				pickQuery = ''; pickType = '';
				render(); renderHits();
			}
			else if (act === 'cancel-pick') { picking = null; render(); }
			else if (act === 'type') { pickType = btn.getAttribute('data-value') || ''; render(); renderHits(); }
			else if (act === 'clear-uma') { roster.umaId = ''; roster.star = 0; roster.awakeningLevel = 0; applyHidden(); render(); notifyOverlap(); }
			else if (act === 'clear-card') { roster.cardIds[Number(btn.getAttribute('data-index'))] = null; applyHidden(); render(); notifyOverlap(); }
			else if (act === 'take') {
				const id = btn.getAttribute('data-entry-id');
				if (picking && picking.kind === 'uma') {
					roster.umaId = id;
					const uma = findUma(id);
					const stars = starChoicesOf(uma);
					// 既定は「そのウマ娘の初期の★」。無ければ選べる中でいちばん小さいもの。
					roster.star = (uma && typeof uma.initialStar === 'number') ? uma.initialStar : (stars[0] || 0);
					if (stars.length && stars.indexOf(roster.star) === -1) {
						roster.star = stars.filter(s => s <= roster.star).pop() || stars[0];
					}
					roster.awakeningLevel = maxAwakeningLevelOf(uma);   // 既定はそのウマ娘の最大
				} else if (picking && picking.kind === 'card') {
					roster.cardIds[picking.index] = id;
				}
				picking = null;
				applyHidden(); render(); notifyOverlap();
			}
			else if (act === 'star') { roster.star = Number(btn.getAttribute('data-value')); applyHidden(); render(); notifyOverlap(); }
			else if (act === 'awk') { roster.awakeningLevel = Number(btn.getAttribute('data-value')); applyHidden(); render(); notifyOverlap(); }
			else if (act === 'save') {
				const nameEl = q(container, 'name');
				roster.name = nameEl ? nameEl.value : roster.name;
				if (saveRoster(snapshot(roster))) {
					selectedId = roster.rosterId;
					toast('編成を保存しました');
					render();
				}
			}
			else if (act === 'delete') {
				if (!selectedId) return;
				deleteRoster(selectedId);
				toast('編成を削除しました');
				loadSelected('');
			}
			else if (act === 'remove') {
				if (typeof opts.onRemoveFromScope === 'function') opts.onRemoveFromScope(computed().skillIds.slice());
				render();                                          // 重なりの表示を更新する
				lastOverlap = overlapWithScope(computed().skillIds);
			}
		});

		container.addEventListener('change', function (ev) {
			const el = ev.target;
			const act = el.getAttribute && el.getAttribute('data-usd-act');
			if (act === 'select') loadSelected(el.value);
			else if (act === 'hide') { hide = !!el.checked; applyHidden(); }
		});

		container.addEventListener('input', function (ev) {
			const el = ev.target;
			const act = el.getAttribute && el.getAttribute('data-usd-act');
			if (act === 'find') {
				pickQuery = el.value;
				clearTimeout(findTimer);
				findTimer = setTimeout(function () { renderHits(); }, NAME_FIND_DEBOUNCE_MS);
			} else if (act === 'name') {
				roster.name = el.value;   // 再描画せずに覚えるだけ（入力中に描き直すと文字が飛ぶ）
			}
		});

		render();
		return {
			render: render,
			getRoster: function () { return snapshot(roster); },
			getSkillIds: function () { return computed().skillIds.slice(); },
			setHidden: function (on) { hide = !!on; applyHidden(); render(); }
		};
	}

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
					'<p class="flex-1 text-sm font-semibold text-slate-700" data-usd-el="draft-title" hidden>ドラフト</p>' +
				'</div>' +
				// スキルを足す入口は3つ。以前は「スキルを追加」1つだけを出し、
				// 中の畳んだ見出しで3つに分かれていたが、それだと「テキストで検索」も
				// 「マスターにないスキルを追加」も、開いてみるまで在ることが分からなかった。
				'<div class="usd-entry-row">' +
					'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="editor-pick">' +
						'<i data-lucide="filter" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> 条件でスキルを検索' +
					'</button>' +
					'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="editor-pick-text">' +
						'<i data-lucide="file-text" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> テキストで検索' +
					'</button>' +
					// 4つ目の入口（スクショから読み取る）は呼び出し元が opts.screenshotEntry を渡したときだけ出す
					// （special.html だけ。uma-skill-deck.html には出さない＝Deck 単体ページの入口は後続）。
					// アイコンはツール内のアップロード枠と同じ lucide の upload-cloud（雲＋上矢印）。見た目は他の入口と揃える。
					// 隣に「?」（撮影ガイド）を置いていたが外した: 入口を押せば必ずガイドが出るので情報を足さず、
					// スマホ幅で「?」の直前に改行が入って並びが崩れたため（30セッション目・おいもさんの指示）。
					(opts.screenshotEntry ?
						'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="editor-pick-screenshot">' +
							'<i data-lucide="upload-cloud" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> ' + esc(opts.screenshotEntry.label || 'スクショで追加') +
						'</button>'
					: '') +
					'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="editor-pick-custom">' +
						'<i data-lucide="plus" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> 収録されていないスキルを追加' +
					'</button>' +
				'</div>' +
				'<div class="flex items-baseline justify-between gap-2 mb-1">' +
					'<p class="text-xs text-slate-500">追加済みスキル（<span data-usd-el="selected-count">0</span>種）</p>' +
					// 一覧の行にあった「空にする」をここへ移した。中身を触っている画面で、
					// 何件消えるのかが見えている状態で押せるようにするため。
					'<button type="button" class="usd-link-btn" data-usd-act="editor-clear-skills" data-usd-el="clear-skills">すべて外す</button>' +
				'</div>' +
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
			else if (act === 'editor-pick') openEditorPicker('filter');
			else if (act === 'editor-pick-text') openEditorPicker('paste');
			else if (act === 'editor-pick-custom') openEditorPicker('custom');
			else if (act === 'editor-pick-screenshot') { if (opts.screenshotEntry && typeof opts.screenshotEntry.onClick === 'function') opts.screenshotEntry.onClick(); }
			else if (act === 'template-open') openEditor(btn.dataset.templateId);
			else if (act === 'template-duplicate') duplicateTemplate(btn.dataset.templateId);
			else if (act === 'template-delete') deleteTemplate(btn.dataset.templateId);
			else if (act === 'template-skill-remove') removeSkillFromEditing(btn.dataset.skillId);
			else if (act === 'editor-clear-skills') clearEditingSkills();
			else if (act === 'draft-open') openDraftEditor();
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
					// 件数は保存済みテンプレートの行と同じ位置・同じ言い回しで出す
					// （並びの中で見比べるものなので、片方だけ書式が違うと比べにくい）。
					'<p class="font-semibold text-sm text-slate-800 usd-truncate">ドラフト' +
						'<span class="text-xs font-normal text-slate-500 ml-2">' + n + '種</span></p>' +
					'<p class="text-xs text-slate-500">※次回開いた際も復元されます。繰り返し使う場合は「テンプレートとして保存」を選択してください。</p>' +
				'</div>' +
				'<div class="flex gap-1.5 shrink-0">' +
					// 空にする操作は編集画面側（追加済みスキルの「すべて外す」）へ移した。
					// 一覧の行に置くと、隣のテンプレートの削除ボタンと同じ見た目・同じ位置になり、
					// 「ドラフトごと消える」のか「中身が空になる」のかが区別できなかったため。
					'<button type="button" class="usd-icon-btn uma-icon-btn" data-usd-act="draft-open" title="編集"><i data-lucide="edit" class="w-4 h-4"></i></button>' +
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
					? '<p class="text-sm text-slate-400 p-4">保存済みのテンプレートはまだありません。上の「ドラフト」で試して、繰り返し使うものだけテンプレートに残せます。</p>'
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
							'<p class="text-xs text-slate-500">' + t.skillIds.length + '種・更新 ' + esc((t.updatedAt || '').slice(0, 10)) + '</p>' +
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
			q(container, 'clear-skills').disabled = ids.length === 0;
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
			// 編集対象が替わるので、前の編集画面のぶんは捨てる（閉じたときも同じ）
			dropUndoScope('editor');
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
			dropUndoScope('editor');
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
			dropUndoScope('editor');
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

		// 3つの入口はどれも同じ「選んだIDを編集中のセットへ足す」処理へ合流する。
		function openEditorPicker(mode) {
			openPicker(mode, editingSkillIds(), pickerSinkFor(editing, 'editor'));
		}

		// ピッカーの受け皿（openPicker の第3引数。{scope, probe, add, remove}）。
		// 編集画面の3つの入口と、ステップ①の「スキルセット画面のスクショから読み取る」（一覧の画面から呼ぶ）で共通。
		function pickerSinkFor(target, scope) {
			return {
				scope: scope,
				// 見るのは対象のセットの中身だけ。復元で変わるのはここだけなので、
				// 他の状態を混ぜると正しく戻せても「戻っていない」と判定してしまう。
				probe: () => probeOf(skillIdsOf(target)),
				add: (ids) => {
					const cur = skillIdsOf(target);
					if (!cur) return [];
					// 実際に足りるのは「まだ入っていないもの」だけ。すでに入っていたものは巻き込まない。
					const fresh = ids.filter(id => cur.indexOf(id) === -1);
					if (fresh.length === 0) return [];
					if (!writeSkillIds(target, cur.concat(fresh))) return [];
					// 一覧の画面から足したときは一覧ごと描き直す（件数・選択の行が変わる）
					afterEditorPickerAdd(target, scope !== 'editor');
					return fresh;
				},
				remove: (ids) => {
					const cur = skillIdsOf(target);
					if (!cur) return false;
					if (!writeSkillIds(target, cur.filter(id => ids.indexOf(id) === -1))) return false;
					// 一覧から消えていたぶんを戻す（モーダルが開いたままでも数が合うように）
					picker.excludeIds = picker.excludeIds.filter(id => ids.indexOf(id) === -1);
					renderPickerResults();
					renderPasteReport();
					afterEditorPickerAdd(target, true);
					return true;
				}
			};
		}

		/**
		 * 外で照合を済ませた行（スキルセットOCR。コミット4）を、いま扱っている対象スキルセットへ足すモーダルを開く。
		 * 対象は、編集中ならその対象、そうでなければ選択中のテンプレート、何も選んでいなければドラフト
		 * （足した時点でドラフトが選択される＝「ドラフトを編集して作れます」と同じ流れ）。
		 * 足した分は Undo に積める（受け皿は編集画面の入口と同じ pickerSinkFor）。scope は見ている画面に合わせる。
		 */
		function openSkillRowsPickerForSelection(rows, summary, options) {
			let target = editing;
			if (!target) {
				const t = ensureUserData().templates.find(x => x.templateId === selectedId);
				target = t ? { kind: 'template', obj: t } : { kind: 'draft' };
			}
			if (target.kind === 'draft' && !draftScope) { toast('対象スキルセットを1つ選んでください'); return false; }
			const scope = editing ? 'editor' : 'list';
			openSkillRowsPicker(skillIdsOf(target) || [], pickerSinkFor(target, scope), rows, summary, options);
			return true;
		}

		// スキルを足した／その追加を取り消したあとの描画と通知。
		function afterEditorPickerAdd(target, redrawAll) {
			if (redrawAll) render(); else renderSelectedList();
			// ドラフトに中身ができたら、そのまま使えるよう選択状態にする
			if (target.kind === 'draft' && draftScope.skillIds.length > 0 && selectedId !== DRAFT_SELECTION_ID) {
				selectedId = DRAFT_SELECTION_ID;
				fireSelection();
			} else if (isSelected(target)) {
				fireSelection();
			}
			fireChange();
		}

		// 編集中の対象が、いま選択されているものかどうか
		function isSelected(target) {
			if (!target) return false;
			return target.kind === 'draft'
				? selectedId === DRAFT_SELECTION_ID
				: selectedId === target.obj.templateId;
		}

		/**
		 * 編集中のセットから追加済みスキルをすべて外す。
		 * ドラフトでもテンプレートでも同じ操作にしてある（編集画面の見た目が同じなので、
		 * 片方だけ出来ないと「なぜここには無いのか」を考えさせることになる）。
		 * 破壊的な操作は確認ダイアログではなく「即実行＋元に戻す」で統一する方針に従う。
		 */
		function clearEditingSkills() {
			const target = editing;
			if (!target) return;
			const ids = skillIdsOf(target);
			if (!ids || ids.length === 0) return;
			const prev = snapshot(ids);
			// 状態を変える前に積む。積んだ時点の probe() が「戻るべき姿」になる。
			pushUndo({
				scope: 'editor',
				// 数えているのはスキルの種類数なので単位は「種」。取り消し側は実行時と別の文にする
				// （「元に戻しました」に実行時の文を連結すると「戻した結果、外れた」とも読めるため）。
				doneLabel: '追加済みスキル' + prev.length + '種を外しました',
				undoneLabel: '外した' + prev.length + '種を戻しました',
				probe: () => probeOf(skillIdsOf(target)),
				apply: () => {
					if (!writeSkillIds(target, snapshot(prev))) return false;
					picker.excludeIds = picker.excludeIds.concat(prev.filter(id => picker.excludeIds.indexOf(id) === -1));
					afterEditingSkillsChanged(target, true);
					return true;
				}
			});
			if (!writeSkillIds(target, [])) return;
			picker.excludeIds = picker.excludeIds.filter(id => prev.indexOf(id) === -1);
			afterEditingSkillsChanged(target);
		}

		function removeSkillFromEditing(skillId) {
			const target = editing;
			if (!target) return;
			const ids = skillIdsOf(target);
			const idx = ids ? ids.indexOf(skillId) : -1;
			if (idx === -1) return;
			const name = getSkillName(skillId);
			pushUndo({
				scope: 'editor',
				doneLabel: 'スキル「' + name + '」を外しました',
				undoneLabel: '外したスキル「' + name + '」を戻しました',
				// 見るのは「そのスキルが元の位置にあるか」だけ。あとから足したスキルは末尾に
				// 付くので、間に追加があっても正しく戻せたことを判定できる。
				probe: () => String((skillIdsOf(target) || []).indexOf(skillId)),
				apply: () => {
					const cur = skillIdsOf(target);
					if (!cur) return false;
					// 元に戻す前に同じスキルを足し直してあった場合は、重複させずに元の位置へ寄せる
					const next = cur.filter(id => id !== skillId);
					next.splice(Math.min(idx, next.length), 0, skillId);
					if (!writeSkillIds(target, next)) return false;
					if (picker.excludeIds.indexOf(skillId) === -1) picker.excludeIds.push(skillId);
					afterEditingSkillsChanged(target, true);
					return true;
				}
			});
			const next = ids.slice();
			next.splice(idx, 1);
			if (!writeSkillIds(target, next)) return;
			picker.excludeIds = picker.excludeIds.filter(id => id !== skillId);
			afterEditingSkillsChanged(target);
		}

		// 編集中のセット（ドラフト／テンプレート）の「今の」スキルID一覧。
		// ドラフトは保存のたびに draftScope ごと差し替わるので、捕まえておいた配列ではなく
		// 毎回ここで引き直す。テンプレートはIDで引き直す（読み直しで実体が替わっても届くように）。
		function skillIdsOf(target) {
			if (!target) return null;
			if (target.kind === 'draft') return draftScope ? draftScope.skillIds : null;
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			return t ? t.skillIds : null;
		}

		// 編集中のセットのスキルID一覧を、保存先まで書き換える。
		function writeSkillIds(target, ids) {
			if (target.kind === 'draft') {
				if (!draftScope) return false;
				draftScope = saveDraftScope(draftScopeKey, ids);
				return true;
			}
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			if (!t) return false;
			t.skillIds = ids.slice();
			t.updatedAt = nowIso();
			saveUserData();
			return true;
		}

		// 追加済みスキルが増減したあとの描画と通知（削除・全消し・元に戻す、で共通）。
		// 元に戻すときは、いま出ている画面（一覧か編集か）ごと描き直す。
		function afterEditingSkillsChanged(target, redrawAll) {
			if (redrawAll) render(); else renderSelectedList();
			renderPickerResults();
			renderPasteReport();
			if (isSelected(target)) fireSelection();
			fireChange();
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
			const removed = snapshot(data.templates[idx]);
			const label = removed.name || '（名称未設定）';
			pushUndo({
				scope: 'list',
				doneLabel: 'テンプレート「' + label + '」を削除しました',
				undoneLabel: '削除したテンプレート「' + label + '」を戻しました',
				// そのテンプレートが（同じ中身で）在るかどうか。無ければ空文字。
				probe: () => {
					const cur = ensureUserData().templates.find(x => x.templateId === templateId);
					return cur ? probeOf(cur) : '';
				},
				apply: () => {
					const d = ensureUserData();
					if (d.templates.some(x => x.templateId === templateId)) return false;
					if (d.templates.length >= TEMPLATE_LIMIT) return false;
					d.templates.splice(Math.min(idx, d.templates.length), 0, snapshot(removed));
					saveUserData();
					render();
					fireChange();
					return true;
				}
			});
			data.templates.splice(idx, 1);
			saveUserData();
			renderList();
			fireChange();
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
			// 編集対象がドラフトからテンプレートへ替わる
			dropUndoScope('editor');
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
				// name は画面に出る表示名（「✓『◯◯』の○件を照合します」、OCR結果の受け渡し先の
				// 既定のシート名など）。一覧の行と同じ呼び方にしておかないと、
				// 選んだものと表示されるものの名前が食い違って見える。
				return { kind: 'draft', id: DRAFT_SELECTION_ID, name: 'ドラフト', skillIds: draftScope.skillIds.slice() };
			}
			const t = ensureUserData().templates.find(x => x.templateId === selectedId);
			if (!t) return null;
			return { kind: 'template', id: t.templateId, name: t.name || '（名称未設定）', skillIds: t.skillIds.slice() };
		}

		/**
		 * いま選んでいる対象スキルセットから、渡したIDを外す（C-51 の編成から使う）。
		 * 編集中かどうかに関係なく「選ばれているもの」に効かせる。返り値は外した件数。
		 */
		function removeSkillsFromSelection(ids) {
			const sel = getSelection();
			if (!sel) { toast('対象スキルセットを選んでください'); return 0; }
			const drop = new Set(ids || []);
			const target = sel.kind === 'draft'
				? { kind: 'draft' }
				: { kind: 'template', obj: { templateId: sel.id } };
			const before = skillIdsOf(target);
			if (!before) return 0;
			const after = before.filter(id => !drop.has(id));
			const n = before.length - after.length;
			if (n === 0) return 0;
			if (!writeSkillIds(target, after)) return 0;
			afterEditingSkillsChanged(target, true);
			return n;
		}

		render();

		return {
			render: render,
			removeSkillsFromSelection: removeSkillsFromSelection,
			isEditing: function () { return !!editing; },
			openEditor: openEditor,
			closeEditor: closeEditor,
			getSelection: getSelection,
			setSelectedId: setSelectedId,
			// スキルセットOCR（コミット4）: 照合済みの行を、いま扱っている対象スキルセットへ足すモーダル
			openSkillRowsPickerForSelection: openSkillRowsPickerForSelection,
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
		// 外（引き出しの iframe など）で保存された内容を読み直す。中身が変わっていたら、
		// 積んである「元に戻す」は古い状態を指すので捨てる。変わっていなければ同じ
		// オブジェクトを使い続ける（差し替えると、掴んでいる参照が全部古くなる）。
		reloadUserData: function () {
			const next = loadUserData();
			if (stableStringify(next) !== stableStringify(userData)) {
				userData = next;
				clearUndo();
			}
			return userData;
		},
		saveUserData: saveUserData,
		replaceUserData: replaceUserData,
		createEmptyUserData: createEmptyUserData,

		// マスターデータ
		loadMasterSkills: loadMasterSkills,
		getMasterSkills: function () { return masterSkills; },
		getMasterMeta: function () { return masterMeta; },

		// 追加カタログ（マスターの外のもの。読み込みは loadMasterSkills が一緒に行う）
		loadExtraCatalog: loadExtraCatalog,
		getExtraCatalog: function () { return extraCatalog; },
		getExtraCatalogMeta: function () { return extraCatalogMeta; },
		getExtraCatalogSources: function () { return EXTRA_CATALOG_SOURCES.slice(); },
		// 収録データ（育成ウマ娘・サポートカード・イベントスキル）。呼んだ画面だけが読む。
		loadTrainingSources: loadTrainingSources,
		getTrainingSources: function () { return trainingSources; },
		getTrainingMeta: function () { return trainingMeta; },
		formatEntryLabel: formatEntryLabel,
		eventStatusOf: eventStatusOf,
		getEventSkillsOf: getEventSkillsOf,
		// サポートカードの種類。データに type が入るまでは空配列を返す（C-51 の修正2）。
		listCardTypes: listCardTypes,
		cardTypeOf: cardTypeOf,
		isReferableSkillId: isReferableSkillId,
		skillCatalogKind: skillCatalogKind,

		// スキル参照
		findSkill: findSkill,
		getSkillName: getSkillName,
		getSkillTags: getSkillTags,
		getSkillEntries: getSkillEntries,
		matchesFilters: matchesFilters,
		tagLabel: tagLabel,

		// 一括貼り付けテキストのマッチング（UIを持たない純粋なロジック）
		matchPastedSkillText: matchPastedSkillText,
		// 「名前を入れて探す」の絞り込み。core 内のスキル選択パネルに加えて、
		// 作業用ページ（card-event-input.html）からも使う（索引を二重に持たないため）。
		findSkillsByNameFragment: findSkillsByNameFragment,
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
		// 編成（C-51）。パネルは呼び出し元に依存しないので、どの画面にも差せる。
		createRosterPanel: createRosterPanel,
		listRosters: listRosters,
		computeRosterSkills: computeRosterSkills,
		getPickerHiddenIds: function () { return pickerHiddenIds.slice(); },
		setPickerHiddenIds: function (ids) { pickerHiddenIds = (ids || []).slice(); },

		// スキル選択モーダル
		openSkillPicker: openSkillPicker,
		openTextSkillPicker: openTextSkillPicker,
		openSkillRowsPicker: openSkillRowsPicker,
		openCustomSkillPicker: openCustomSkillPicker,
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

		// Undo（契約は「Undo」の節のコメント参照）
		pushUndo: pushUndo,
		performUndo: performUndo,
		undoCount: undoCount,
		onUndoChanged: onUndoChanged,
		setUndoScope: setUndoScope,
		getUndoScope: function () { return undoScope; },
		dropUndoScope: dropUndoScope,
		clearUndo: clearUndo,
		snapshot: snapshot,
		probeOf: probeOf
	};
})(window);
