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
	const UMA_SKILL_DECK_CORE_JS_VERSION = '2026-10-03n';

	/* ============================================================
	 * 定数
	 * ============================================================ */
	const STORAGE_KEY_USER = 'umaSkillDeck:userData';
	const STORAGE_KEY_MASTER = 'umaSkillDeck:masterCache';
	const MASTER_JSON_PATH = 'uma-skill-deck-skills.json';

	/**
	 * **マスターの版。`uma-skill-deck-skills.json` の `masterVersion` と必ず同じ値にする。**
	 * 取得するURLに `?v=` として付ける。**恒久ルール4・18 の「3点一致」の対象**で、
	 * ズレていたら `npm run test:verify` の §1 が落とす（ファイル名の代わりに JSON の中の
	 * `masterVersion` が「ファイル名に付ける版」の役目をしている）。
	 *
	 * **なぜ要るか（71セッション目・段7）** ―― 公開先（GitHub Pages）はこのファイルを
	 * **`Cache-Control: max-age=600`** で返す（実測）。版を付けないと、**更新してから10分間、
	 * ブラウザが再検証なしで古い本文を返す**。70セッション目にレース場のタグを足した直後、
	 * 実機で「福島を選ぶと0件」になり **F5 で直った** ―― その症状がこれだった。
	 * （`localStorage` の写しは `fetch` が失敗したときにしか使われず、F5 では消えないので、
	 *   F5 で直ったこととは辻褄が合わない。）
	 *
	 * **`data/` の6ファイルにも同じ問題がある**（どれも `?v=` が付かない）。
	 * そちらを対象に入れるかはまだ決めていない。
	 */
	const MASTER_JSON_VERSION = '2026-09-26b';

	/**
	 * **`data/` の6ファイルの版**（71セッション目・段7の続き）。
	 *
	 * マスターとまったく同じ理屈 ―― **公開先は `data/*.json` にも `Cache-Control: max-age=600`
	 * を付けて返す**ので、版を付けないと更新してから10分間は古い本文が返る。
	 *
	 * **版の正本は各 JSON の `dataVersion`。ここはその写し。**
	 * **ズレていたら `npm run test:verify` の §1 が落とす**（ファイルを1つでも足し忘れても落ちる）。
	 * **`dataVersion` を上げたら、必ずここも上げる。**
	 *
	 * **1つの表にまとめてある**理由 ―― 取得の入口が2つに分かれている
	 * （`EXTRA_CATALOG_SOURCES` ＝ スキルを供給される側／`TRAINING_SOURCES` ＝ 供給する側）ので、
	 * そちらに版を持たせると**片方だけ足し忘れても気づけない**。パスで引く1枚の表にして、
	 * 検査が「`data/` に在る JSON の顔ぶれ」と突き合わせられるようにした。
	 */
	const DATA_JSON_VERSIONS = {
		'data/scenario-inheritance-factors.json': '2026-09-15a',
		'data/aptitude-genes.json': '2026-09-19a',
		'data/extended-skills.json': '2026-10-02a',
		'data/training-umamusume.json': '2026-09-24a',
		'data/support-cards.json': '2026-09-30b',
		'data/support-card-event-skills.json': '2026-09-30c',
		// キャラクター共通のイベント（C-102 の区切り3・2026-09-27）。9本目
		'data/character-event-skills.json': '2026-09-30c',
		// レースの距離の一覧（C-97・2026-09-26）。7本目。スキルではないので EXTRA_CATALOG_SOURCES にも
		// TRAINING_SOURCES にも入れず、loadRaceDistances() が読む。
		'data/race-distances.json': '2026-09-26a',
		// スキルPt の割引率の表（段1・2026-09-30）。ゲームの公知の値で、スキル名を含まない。
		// 実ファイル（skill-pt.json・skill-step-up.json）は、届いてから載せた（載せると取りに行くため）。
		'data/skill-pt-rules.json': '2026-09-30a',
		// スキルの基礎Pt とレアリティ（2026-09-30 に実ファイルが届いたので載せた。載せると loadSkillPtData が読む）
		'data/skill-pt.json': '2026-10-02a',
		// スキルのステップアップの前段（2026-10-01c。2026-10-02 に実ファイルが届いたので載せた。loadSkillPtData が skill-pt.json と一緒に読む）
		'data/skill-step-up.json': '2026-10-02b',
		// スキルの公式の説明文（2026-10-02）。ページの読み込みでは取りに行かない（ⓘ・長押しを最初に開いたときだけ。段6）
		'data/skill-descriptions.json': '2026-10-02a',
		// シナリオの固定イベントで得られるスキルとヒントレベル（段7c・2026-10-03）。編成パネルを作るときにだけ読む（ほかのページの読み込みでは取りに行かない）
		'data/scenario-event-skills.json': '2026-10-03c'
	};

	/** URL にクエリを1つ足す（既にクエリが付いていれば `&` でつなぐ）。 */
	function withQuery(url, key, value) {
		return url + (url.indexOf('?') === -1 ? '?' : '&') + key + '=' + encodeURIComponent(value);
	}

	/**
	 * `data/` のパスに版（`?v=`）を付ける。表に無いパスはそのまま返す
	 * （足し忘れをここで握りつぶさないよう、**検査のほうで落とす**）。
	 */
	function withDataVersion(path) {
		const v = DATA_JSON_VERSIONS[path];
		return v ? withQuery(path, 'v', v) : path;
	}

	/**
	 * マスターを取りに行けなかったときの知らせ（71セッション目・段7）。
	 *
	 * それまでは**黙って古い写しへ落ちていた** ―― 追加カタログ（`loadExtraCatalog`）には
	 * 「読み込めませんでした」のトーストがあるのに、マスターには無いという非対称があった。
	 * 利用者向けの語は **「収録スキルデータ」**（データ管理タブの見出しと同じ。32セッション目）。
	 */
	const MASTER_FALLBACK_NOTICE = {
		cache: '収録スキルデータを取得できなかったので、前に読み込んだものを使っています。'
			+ '通信できないときは、ページを開き直すと直ることがあります。',
		sample: '収録スキルデータを読み込めませんでした。ごく一部のスキルしか出ません。'
			+ '通信できる状態でページを開き直してください。'
	};

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
	 * ファイルの形（data/*.json）:
	 *   { dataVersion, category, entries: [{ id, name }] }
	 * category はファイル単位。読み込んだ各エントリに category を押して、
	 * findSkill() が返すオブジェクトの kind になる。
	 *
	 * id はマスターの id（1〜445 の数字）と衝突しない接頭辞を付けること
	 * （保存済みの比較シートは id で行を指すため、衝突すると別物にすり替わる）。
	 * ------------------------------------------------------------ */
	const STORAGE_KEY_EXTRA_CATALOG = 'umaSkillDeck:extraCatalogCache';
	const EXTRA_CATALOG_SOURCES = [
		{ category: 'scenarioFactor', path: 'data/scenario-inheritance-factors.json' },
		// 遺伝子（C-67）。**tags を持たないので「条件でスキルを検索」の母集団には入らない**
		// （母集団に入るかどうかは tags の有無で決まる。C-64 の2節）。ここに並べるのは、
		// findSkill() で名前を引けるようにするため ―― 入れないと、保存済みの比較シートの
		// 遺伝子の行が「（不明なスキル：…）」に化ける。シナリオ因子とまったく同じ扱い。
		{ category: 'geneFactor', path: 'data/aptitude-genes.json' },
		// マスター445種の外にあるスキル（C-48・C-49）。件数が多いので EMBEDDED_EXTRA_CATALOG に
		// 写しは持たない（取得もキャッシュも駄目だったときは、黙って劣化させず知らせる）。
		{ category: 'extendedSkill', path: 'data/extended-skills.json' }
		// 育成ウマ娘・サポートカードはここに入れない。スキルではないので、入れると
		// findSkill() と名前の索引にカード名・ウマ娘名が混ざる（C-49）。
	];
	const TEMPLATE_LIMIT = 10;
	// スキルセットの分類（C-57）。ゲームの「スキルセット詳細」の3分類と同じ語。値は保存データ（tiers）にそのまま入る
	const TIERS = [{ id: 1, label: '超優先' }, { id: 2, label: '優先' }, { id: 3, label: '通常' }];
	const TIER_DEFAULT = 2;   // tiers に無い id はこの分類（既存のスキルは何もしなくても「優先」に入る）
	function tierOf(tiers, skillId) {
		const v = tiers && typeof tiers === 'object' ? tiers[skillId] : undefined;
		return TIERS.some(t => t.id === v) ? v : TIER_DEFAULT;
	}
	function tierLabel(tier) {
		const t = TIERS.find(x => x.id === tier);
		return t ? t.label : TIERS.find(x => x.id === TIER_DEFAULT).label;
	}
	/**
	 * 分類の印（競馬の印。C-58）。超優先＝◎（本命）／優先＝○（対抗）／通常＝▲（単穴）を
	 * **線で描き、塗りつぶさない**。形だけで順位が読めるので、色は補助でしかない。
	 *
	 * 形をここ1か所で決める理由: 画面（この SVG）と結合画像（special.html の Canvas）で
	 * 別々に描くと、同じ印のはずのものが2つの形を持つ（C-30 の drawSkillMark と同じ考え方）。
	 * 比率（半径・内側の輪・三角形）は Canvas 側と同じ値にしてある。
	 */
	function tierMarkHtml(tier) {
		const t = TIERS.some(x => x.id === tier) ? tier : TIER_DEFAULT;
		const shape = t === 1
			? '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.8"/>'   // ◎ 内側は外側の 0.42
			: t === 2
				? '<circle cx="12" cy="12" r="9"/>'                                  // ○
				: '<path d="M12 2.9 21.1 18.7 2.9 18.7Z"/>';                         // ▲（外接円は ○ の 1.12 倍）
		return '<span class="uma-tier-mark" data-tier="' + t + '" role="img" aria-label="' + esc(tierLabel(t)) + '">'
			+ '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true">'
			+ shape + '</svg></span>';
	}
	// 編成（育成ウマ娘1人＋サポートカード6枚）。テンプレート・比較シートと同じく
	// 「利用者が作ったもの」なので userData に置き、書き出し／取り込みの対象にする（C-51）。
	const ROSTER_LIMIT = 10;   // 段7の (4)（2026-10-03）: 5 → 10
	// 本育成パネルの絞り込み（段7の (17)）で使う軸のキー。選択肢は TAG_AXES から読む（値はここに書かない）
	const ROSTER_FILTER_AXIS_KEYS = ['distance', 'style', 'surface'];
	const ROSTER_CARD_SLOTS = 6;
	const RECORD_LIMIT = 10;
	// （カスタムスキルのソフトキャップ `CUSTOM_SKILL_SOFT_CAP`（50件）は、作る手段とデータ管理タブの件数の表示を
	//   2026-09-27 に廃止したので外した。C-100）
	const STAR_MIN = 0;
	const STAR_MAX = 3;
	const MAX_ENABLED_CANDIDATES = 6;
	const UNDO_STACK_LIMIT = 20;

	// 一度にこの数以上のスキルを足したときだけ「元に戻す」に積む。
	// 1種だけの追加はチップの×で消せるのでUndoの出番が薄く、スタックを埋める害のほうが大きい。
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

	/**
	 * **未保存のスキルセットの呼び名。利用者に見える文字列はここ1か所だけ。**
	 *
	 * ②のタブが「新規」、①の「除外するスキルセットを選ぶ」が「ドラフト」と
	 * 食い違っていた（①②の設計時期の差。C-66）。同じものを2つの名前で呼ぶと、
	 * 利用者は別のものだと思う。片方だけ直すとまた離れるので、定数にして両方から引く。
	 *
	 * **利用者が自分で付けた名前（draftScope.name）には使わない。** これは名前が
	 * 無いときの呼び名であって、名前を上書きするものではない。
	 */
	const DRAFT_LABEL = '新規（ドラフト）';

	/**
	 * **セットの呼び名の既定（`createTemplateManager` の `opts.setLabel` で差し替えられる）。**
	 *
	 * この共有モジュールが描く画面は2か所から使われ、**同じ部品を違う呼び名で出す**。
	 *   - `uma-skill-deck.html`（Deck 単体ページ）… 「スキルセット」（C-66 の5節で「テンプレート」から揃えた）
	 *   - `special.html` の②           … 「因子セット」（C-1。スキルセット・シナリオ因子・遺伝子を束ねた入れ物）
	 *
	 * **だからここの文字列を一律に置換してはいけない。** 置換すると Deck 単体ページの呼び名まで
	 * 変わり、C-66 で揃えたばかりのものを打ち消す。呼び名を出すところは必ず `setLabel` を通す。
	 *
	 * **通さないもの**: 分類のタブの `aria-label`（「スキルセットの分類」）。これは入れ物ではなく
	 * **A（スキルセット）の中の分類**（超優先／優先／通常）を指していて、special でも呼び名は変わらない。
	 */
	const DEFAULT_SET_LABEL = 'スキルセット';

	/* タグ辞書。フィルターパネル・タグ表示・タグ付け画面で共有する。
	 *
	 * **軸に付く印は4つ**（71セッション目・段8 で `optIn` を廃し、`hiddenAxis` / `poolExcluded` /
	 * `exclusive` を足した）:
	 *   `emptyMeansNone` … 空配列を「万能」ではなく「該当しない」と読む
	 *                       （効果タイプ・フェーズ・コース位置・その他。印の無い距離・脚質だけが空を「万能」と読む）
	 *   `exclusive`      … 軸内が OR ではなく**許可リスト**。持っている値が選んだ値に全部収まるものだけ通す
	 *   `hiddenAxis`     … **利用者の絞り込みには出さない**（タブに出さない）。
	 *                       データとしては残り、`card-event-input.html` のタグ付け画面には出る
	 *   `poolExcluded`   … **この軸に値を持つスキルを「条件で検索」の母集団に入れない**
	 *
	 * **`hiddenAxis` と `poolExcluded` は別物。まとめてはいけない。**
	 * レース環境・レース場は「隠すが母集団には居る」、パッシブは「隠すうえに母集団から外す」。
	 * 1つの印にすると、`environment` にタグを持つスキル（＝いまはパッシブ67件だけだが、
	 * 将来そうとは限らない）まで母集団から消える。
	 */
	const TAG_AXES = [
		/* **`targetDistance`（目標のレースの距離。C-96・C-97・2026-09-26）**: この軸のパネルにだけ
		 * 「目標のレースの距離」の入力欄が付き、`matchesFilters()` はこの軸だけ、区分のタグに加えて
		 * スキルの `raceDistance`（レースの距離の限定）とレースの一覧（`data/race-distances.json`）で判定する。
		 * 選択肢の値（short …）は、レースの一覧の `distanceCategories[].key` と同じ語（`check:catalog` が突き合わせる）。 */
		{ key: 'distance', label: '距離', targetDistance: true, options: [
			{ v: 'short', t: '短距離' }, { v: 'mile', t: 'マイル' }, { v: 'medium', t: '中距離' }, { v: 'long', t: '長距離' }
		]},
		{ key: 'style', label: '脚質', options: [
			{ v: 'nige', t: '逃げ' }, { v: 'senko', t: '先行' }, { v: 'sashi', t: '差し' }, { v: 'oikomi', t: '追込' }
		]},
		/* 71セッション目・段8。**距離・脚質と同等の扱いの軸**（指示）なので脚質の次に置く。
		 * 値は `environment` の `surface_turf` / `surface_dirt` から移した（マスターも同じ段で更新）。
		 *
		 * **この軸だけ軸内が OR ではない（`exclusive`）。**
		 * 「芝」を選んだらダートのタグを持つスキルを落とし、「ダート」を選んだら芝のタグを持つものを落とす。
		 * バ場を持たないスキル（＝どちらでも走れるもの）は、どちらを選んでも通る。
		 * **「芝を選ぶと芝のスキルだけが出る」ではない**ことに注意 ―― それは `emptyMeansNone` の読み方で、
		 * この軸ではバ場の指定が無い大多数のスキルが消えてしまう。
		 *
		 * **「ダート」を選んでも1件も減らない。** 芝のタグを持つ唯一のスキル（衝動）がパッシブで
		 * 母集団に居ないため。**ゲーム設計上やむを得ないものとして、このままにする**（決7）。
		 */
		{ key: 'surface', label: 'バ場', exclusive: true, options: [
			{ v: 'turf', t: '芝' }, { v: 'dirt', t: 'ダート' }
		]},
		// 70セッション目・段2 で選択肢を 18 → 12 に減らした（②(ア)A・D）。
		//   能力上昇（stat_up）  … speed_up / stamina_up / power_up / guts_up / wisdom_up / all_up の6値を統合（67件）
		//   デバフ（debuff）     … stamina_down / speed_down の2値を統合（31件）
		// **統合後は個別の絞り込みができなくなる。これは承知のうえの決定。**
		// 持久力回復（stamina）は据え置き（42件）。旧値の読み替えは LEGACY_EFFECT_VALUES を読むこと。
		//
		// **71セッション目・段8: `stat_up`（能力上昇）に `hiddenOption` を付けて、絞り込みの選択肢から外した。**
		// パッシブ67件を母集団から外すと、`stat_up` を持つスキルは**母集団に1件も残らない**
		// （67件すべてがパッシブ）。選んでも必ず0件になる選択肢を出す意味が無い（決3）。
		//
		// **値そのものはデータにも選択肢の並びにも残す**（消さない）。理由は3つ:
		//   (1) 消すと67件のうち63件の `effect` が空になる。`effect` は `emptyMeansNone` なので
		//       空は「該当なし」＝**効果タイプで絞ると1件も出なくなる**（C-89。2026-09-25 までは「万能」だった）。
		//       `test:master` の「効果タイプが空になったスキルは無い」も失われる
		//   **第2回の段3 で、母集団にも `stat_up` を持つスキルが入った**（パッシブでない拡張スキル2件）。
		//   選択肢は外したまま。**それらは `stat_up` 以外の効果タイプも持つので、そちらで絞れば見つかる**
		//   ことを根拠に置き換えた（C-88。`test:master` がデータから数えて見ている）
		//   (2) `check:catalog` の「マスターの値が選択肢に実在する」が効き続ける
		//   (3) `tagLabel()` が「能力上昇」を返せる。段12（⑧ 追加済みスキルのタグボタン群）で
		//       パッシブのタグを出すときに、生の値（`stat_up`）が画面に出ない
		//
		// **`internalOnly` ではなく `hiddenOption`。** `internalOnly` は「スキルではないものの値」で、
		// `card-event-input.html` ではそういう枠に入れて「ふつうのスキルには付けません」と注記される。
		// `stat_up` は**パッシブに付ける値**なので、タグ付け画面には他の値と並べて出す必要がある。
		// **2026-09-25（C-89）: 空配列を「万能」ではなく「該当なし」と読むようにした**（フェーズ・コース位置と同じ）。
		// 効果タイプが空のスキル（規則で効果タイプを付けない拡張スキル）が、
		// どの効果タイプで絞っても出てしまい、絞った意味が無くなるため。マスターには効果タイプが空のスキルは無い。
		//
		// **2026-09-26（C-98）: 「掛かり時間」を「デバフ」に、「レーン移動」を「コース取り」にまとめた**（おいもさんの要望）。
		// 掛かり時間はデバフの下位概念、レーン移動はいまは危険回避だけで、コース取りとの線引きが難しいため。
		// **データの値（`temptation_time` / `lane_change`）は変えない。** 値は有効なまま残し（`check:catalog` §4-3 のため）、
		// `mergedInto` を付けて**選択肢には出さず**（`pickableOptions()`）、**まとめ先を選んだときに一緒に当たる**ようにする
		// （`expandMergedValues()`）。表示名も `tagLabel()` がまとめ先の名前を返す。
		{ key: 'effect', label: '効果タイプ', emptyMeansNone: true, options: [
			{ v: 'target_speed_up', t: '速度上昇' }, { v: 'accel_up', t: '加速度上昇' }, { v: 'move_forward', t: '前に出る' }, { v: 'extend', t: '伸び' },
			{ v: 'stamina', t: '持久力回復' }, { v: 'debuff', t: 'デバフ' }, { v: 'start_good', t: 'スタート得意' }, { v: 'course_sense', t: 'コース取り' },
			{ v: 'lane_change', t: 'レーン移動', mergedInto: 'course_sense' }, { v: 'temptation_time', t: '掛かり時間', mergedInto: 'debuff' }, { v: 'vision', t: '視野' },
			{ v: 'stat_up', t: '能力上昇', hiddenOption: true }
		]},
		// 70セッション目・段5（③④）。**空配列を「万能」ではなく「該当なし」と読む。**
		// 「中盤」を選んだとき、中盤にも発動しうるが序盤・終盤にも発動しうるスキル（phase が空）は
		// 出さない ―― 利用者が「中盤」を選ぶのは「中盤に限定して発動するもの」を探すときなので、
		// どこでも発動しうるスキルが混ざると、絞り込んだ意味が無くなる。
		//
		// **2026-09-25（C-90）: 「前半」「中間」「後半」の3つを足した**（説明文の「前半」「中間」「後半」を独立したタグにしたもの）。
		// **2026-09-26（C-94）: さらに「最終盤」「スタート時」を足し、並びを時間の順にした**（おいもさんの決定）。
		// 足した5つは**序盤・中盤・終盤・ラストスパートとは別の概念**で、互いに読み替えない（親のタグは一緒に付けない）。
		// 軸内は OR のままなので、「終盤」だけを選ぶと「後半」「最終盤」のタグだけを持つスキルは出ない（両方を持つものは出る）。
		// 375px では3段になるが、3段の上限に収まる（「▼ ほか N件」は出ない）。
		{ key: 'phase', label: 'フェーズ', emptyMeansNone: true, options: [
			{ v: 'start', t: 'スタート時' }, { v: 'early', t: '序盤' }, { v: 'first_half', t: '前半' },
			{ v: 'mid', t: '中盤' }, { v: 'midpoint', t: '中間' }, { v: 'second_half', t: '後半' },
			{ v: 'late', t: '終盤' }, { v: 'final_stage', t: '最終盤' }, { v: 'lastspurt', t: 'ラストスパート' }
		]},
		// **2026-09-26（C-94）: 「最終コーナー」「第3コーナー」「最終直線」「向正面」を足し、親の隣に並べた**（おいもさんの決定）。
		// これらも**コーナー・直線とは別の概念**で、互いに読み替えない。「コーナー」だけを選ぶと、
		// 「最終コーナー」「第3コーナー」のタグだけを持つスキルは出ない（「直線」と「最終直線」「向正面」も同じ）。
		{ key: 'coursePos', label: 'コース位置', emptyMeansNone: true, options: [
			{ v: 'corner', t: 'コーナー' }, { v: 'third_corner', t: '第3コーナー' }, { v: 'final_corner', t: '最終コーナー' },
			{ v: 'straight', t: '直線' }, { v: 'backstretch', t: '向正面' }, { v: 'final_straight', t: '最終直線' },
			{ v: 'uphill', t: '上り坂' }, { v: 'downhill', t: '下り坂' }
		]},
		/* **距離の目安（2026-09-26・C-94・C-95）。** 説明文の「残り200m」「2ハロン目」のような、
		 * レースの中の**地点**の条件。フェーズ・コース位置とは別の概念で、互いに読み替えない。
		 * 並びは、残りの距離の小さい順 → ゴールまで遠い → ハロン目。
		 * 「ゴールまで遠い」には「ゴールまですごく遠い」も含む（別の値にしない）。
		 *
		 * **空は「該当なし」と読む。**「残りXXXm」を選ぶ人は、その地点で発動するスキルだけを
		 * 調べたい ―― それより前に発動する可能性のある万能のスキルは除外したい（おいもさんの意図）。
		 * 375px では5段になり「▼ ほか N件」が出る。1280px は3段で収まる。 */
		{ key: 'distanceMark', label: '距離の目安', emptyMeansNone: true, options: [
			{ v: 'remain_150', t: '残り150m' }, { v: 'remain_200', t: '残り200m' }, { v: 'remain_300', t: '残り300m' },
			{ v: 'remain_350', t: '残り350m' }, { v: 'remain_400', t: '残り400m' }, { v: 'remain_600', t: '残り600m' },
			{ v: 'remain_650', t: '残り650m' }, { v: 'remain_777', t: '残り777m' }, { v: 'remain_800', t: '残り800m' },
			{ v: 'remain_1000', t: '残り1000m' }, { v: 'goal_far', t: 'ゴールまで遠い' },
			{ v: 'furlong_2', t: '2ハロン目' }, { v: 'furlong_3', t: '3ハロン目' }, { v: 'furlong_4', t: '4ハロン目' }
		]},
		/* **`rarity`（レアリティ）と `inherited`（共通/継承）はここに入れない。**
		 *
		 * 70セッション目の段2 でマスター445件にキーを入れ（値は空）、段3 でいったんタブとして
		 * 出したが、**段4 のあとに「この画面にこの2軸は要らない」と決まって外した**。
		 * **データのキーは残したまま**（別の用途で要る分類なので消さない）、
		 * **絞り込みの軸としては出さない**、という状態。
		 *
		 * だから `TAG_AXES` とマスターの `tags` の軸は**顔ぶれが一致しない**。
		 * それを前提にしている場所が2つあるので、片方だけ直さないこと:
		 *   - `check:catalog` の §4-3 … 「TAG_AXES に無い軸には値が入っていないこと」を見る
		 *   - `test:master` … マスター側のキーの有無と、値が空であることを見る
		 * `matchesFilters()` は `TAG_AXES` を回すだけなので、この2軸はマッチングに一切関わらない。
		 *
		 * **`hiddenAxis`（レース環境・レース場・パッシブ）とは別物。** あちらは `TAG_AXES` に**在って**
		 * タブに出さないだけなので、値の検査は効き続ける。こちらは `TAG_AXES` に**無い**ので、
		 * 「値が入っていないこと」しか見られない。タグを付け始めたら `TAG_AXES` へ出すか、
		 * `hiddenAxis` として入れるかを決めることになる。
		 */
		/* **71セッション目・段8: この2軸は `hiddenAxis`（絞り込みのタブに出さない）にした。**
		 *
		 * 70セッション目・段5 で `optIn`（門番）＋`emptyMeansNone` にしたが、**実機で機能しなかった。**
		 * 原因は、この2軸に**パッシブスキル（ゲーム内の緑スキル）の条件が混ざっていた**こと ――
		 * 「東京レース場○」のようなパッシブは、アクティブスキルの発動条件を絞る軸の中に居るべきものではない。
		 * **絞り込みの軸は「アクティブスキルの発動条件」を表すものに限る**という方針に変えた（決5）。
		 *
		 * **軸ごと消さずに「隠す」。** 消すと `check:catalog` の2つの検査
		 * （§4-2 レース場の値の実在／§4-3 全軸の値が選択肢に実在）が**読むものを失って落ちる**ので、
		 * 値の見張りが外れてしまう。隠すだけならどちらもそのまま効く。
		 * `card-event-input.html` のタグ付け画面には引き続き出る（おいもさんが付ける値なので）。
		 *
		 * **`optIn`（門番）は段8 で仕組みごと消した。** 付く軸が0本になり、`matchesFilters()` の
		 * 先頭のブロックが必ず何もしない死にコードになるため。**`emptyMeansNone` も外した** ――
		 * 隠した軸は選べないので働かず、印は「見える軸のもの」に揃えたほうが読み違えない。
		 *
		 * **いまこの2軸にタグを持つのは、パッシブ67件だけ**（段8 のマスター更新後に実測）。
		 * ただし `poolExcluded` はこちらには付けない ―― 「隠す」と「母集団から外す」は別物で、
		 * 将来この軸にタグを持つ**アクティブ**スキルが増えたときに、黙って消えてしまうため。
		 */
		{ key: 'environment', label: 'レース環境', hiddenAxis: true, options: [
			{ v: 'ground_good', t: '良バ場' }, { v: 'ground_bad', t: '道悪' },
			{ v: 'right_turn', t: '右回り' }, { v: 'left_turn', t: '左回り' }, { v: 'small_track', t: '小回り' }, { v: 'straight_course', t: '直線コース' },
			{ v: 'weather_sunny', t: '晴れ' }, { v: 'weather_cloudy', t: '曇り' }, { v: 'weather_rain', t: '雨' }, { v: 'weather_snow', t: '雪' },
			{ v: 'season_spring', t: '春' }, { v: 'season_summer', t: '夏' }, { v: 'season_autumn', t: '秋' }, { v: 'season_winter', t: '冬' },
			{ v: 'time_day', t: '昼' }, { v: 'time_evening', t: '夕方' }, { v: 'time_night', t: 'ナイター' }
			// **根幹距離・非根幹距離（`distance_basis` / `distance_nonbasis`）は 2026-09-26（C-97）にこの軸から外した。**
			// レースの距離の限定は、スキルの `raceDistance`（`standardDistance: true/false`）に一本化した。
			// データからも同じ commit で外してある（`check:catalog` §4-3 が、残っていれば落とす）。
		]},
		{ key: 'trackVenue', label: 'レース場', hiddenAxis: true, options: [
			{ v: 'track_sapporo', t: '札幌' }, { v: 'track_hakodate', t: '函館' }, { v: 'track_fukushima', t: '福島' }, { v: 'track_niigata', t: '新潟' },
			{ v: 'track_nakayama', t: '中山' }, { v: 'track_tokyo', t: '東京' }, { v: 'track_chukyo', t: '中京' }, { v: 'track_kyoto', t: '京都' },
			{ v: 'track_hanshin', t: '阪神' }, { v: 'track_kokura', t: '小倉' },
			{ v: 'track_oi', t: '大井' }, { v: 'track_kawasaki', t: '川崎' }, { v: 'track_funabashi', t: '船橋' }, { v: 'track_morioka', t: '盛岡' },
			{ v: 'track_longchamp', t: 'ロンシャン' }, { v: 'track_santaanita', t: 'サンタアニタパーク' }, { v: 'track_delmar', t: 'デルマー' }
		]},
		// **空配列を「該当なし」と読む。**（かつては「この軸だけ、空配列の意味が他の7軸と逆」だったが、
		// 段5 でフェーズ・コース位置、C-89 で効果タイプが同じ読み方になり、いまは距離・脚質だけが「万能」。）
		// この軸は**入手経路の区分**（キャラやサポートカードからは得られないもの）なので、
		// 「空＝どれにも当たらない（ふつうのスキル）」。445件中418件が空で、そちらが普通の状態。
		// 選択肢が1つだった名残で flagAxis と呼んでいたが、**選択肢の数とは関係がない**ので
		// emptyMeansNone（空は「該当なし」）に改名した。
		// internalOnly の2つは**利用者が選ぶ値ではなく、データの側だけが持つ**値。
		// シナリオ因子・遺伝子はスキルではなく、条件検索の母集団にも入らない（C-67）ので、
		// 絞り込みの選択肢として出しても1件も当たらない。値そのものは消さずに残す
		// （データが持っており、tagLabel() が表示名に直すのに要る）。
		{ key: 'scenario', label: 'その他', emptyMeansNone: true, options: [
			{ v: 'scenario', t: 'シナリオスキル' },
			{ v: 'scenario_factor', t: 'シナリオ因子', internalOnly: true },
			{ v: 'gene', t: '遺伝子', internalOnly: true }
		]},
		/* **パッシブ（ゲーム内の緑スキル）。71セッション目・段8 で新設。**
		 *
		 * パッシブは**発動条件で絞るものではない** ―― レースの前から効いていて、
		 * 距離・脚質・フェーズ・コース位置のような「いつ出るか」を持たない。
		 * だから「条件でスキルを検索」の母集団から外し（`poolExcluded`）、
		 * **名前で直接選ぶ専用の入口**（段9「緑スキルを追加」）から足す。
		 *
		 * **軸として持つ理由**（`tags` の外や別のキーにしない）:
		 *   - `check:catalog` の「マスターの値が選択肢に実在する」「全件が同じ軸を持つ」がそのまま効く
		 *   - `card-event-input.html` のタグ付け画面に自動で出る（533件のタグ付けで要る）
		 *   - 緑スキルの一覧も `poolExcluded` の印から作れるので、**軸のキーをコードに書かずに済む**
		 *
		 * **`hiddenAxis` と `poolExcluded` の両方が付くのはこの軸だけ。**
		 * いまは67件（おいもさんがゲームの仕様に基づいて挙げた61件＋「目覚め」6種。決1・決2）。
		 */
		{ key: 'passive', label: 'パッシブ', hiddenAxis: true, poolExcluded: true, options: [
			{ v: 'passive', t: 'パッシブ' }
		]}
	];

	/**
	 * **利用者に選ばせる選択肢**だけを返す（`internalOnly` の値を落とす）。
	 *
	 * `internalOnly` は「絞り込みに出さない」という**用途**ではなく、
	 * 「利用者が選ぶ値ではなく、データの側だけが持つ」という**性質**の印（F-59）。
	 * だから、利用者に値を選ばせる画面はどれもこれを通す
	 * （いまは条件検索の絞り込み。2026-09-27 にカスタムスキルの入力を廃止するまでは、そのタグ欄も通していた）。
	 *
	 * **通してはいけないもの**:
	 *   - `tagLabel()` … 値 → 表示名の変換。通すと画面に生の値（`scenario_factor`）が出る
	 *   - `matchesFilters()` … そもそも options を見ない（マッチングには影響しない）
	 *   - `card-event-input.html` のタグ付け … おいもさんが**付ける**値なので全部出す
	 */
	function pickableOptions(axis) {
		// `mergedInto`（C-98）は、まとめ先の選択肢に含めて選ぶので、単独では出さない
		return axis.options.filter(o => !o.internalOnly && !o.hiddenOption && !o.mergedInto);
	}

	/**
	 * 選んだ値に、そこへまとめた値（`mergedInto` がその値を指すもの）を足して返す（C-98）。
	 * 「デバフ」を選べば掛かり時間のタグのスキルも、「コース取り」を選べばレーン移動のタグのスキルも当たる。
	 * **軸の名前も値もここに書かない**（印を読むだけ）。まとめる値が無い軸では、選んだ値をそのまま返す。
	 */
	function expandMergedValues(axis, selected) {
		const extra = axis.options.filter(o => o.mergedInto && selected.includes(o.mergedInto)).map(o => o.v);
		return extra.length ? selected.concat(extra) : selected;
	}

	/**
	 * **利用者の絞り込みに出す軸**だけを返す（`hiddenAxis` の軸を落とす）。
	 *
	 * `pickableOptions()` の軸版（71セッション目・段8）。タブ・キーボード移動・既定のタブが、
	 * どれも同じ判断を使えるようにしてある。
	 *
	 * **通してはいけないもの**:
	 *   - `matchesFilters()` … 隠した軸の `filters` は常に空なので通す必要が無く、
	 *     通すとむしろ「隠した軸のタグは無視する」という別の意味になってしまう
	 *   - `emptyTagSet()` … **全軸のキーを揃える**のが仕事なので、
	 *     隠した軸のキーも空配列で持たせる（マスターと顔ぶれを合わせるため）
	 *   - `card-event-input.html` のタグ付け … おいもさんが**付ける**値なので全軸を出す
	 */
	function pickableAxes() {
		return TAG_AXES.filter(a => !a.hiddenAxis);
	}

	/**
	 * **その軸の中の読み方を1文で言ったもの**（73セッション目に1か所へまとめた）。
	 *
	 * 軸内の読み方は**軸に付いた印だけ**で決まる（`exclusive` ／ `emptyMeansNone` ／ どちらも無い）。
	 * **軸のキーは書かない**（恒久ルール1）ので、印が同じ軸が増えても直さずに済む。
	 *
	 * **2か所が同じ文を使う**（恒久ルール19 の棚卸しで、同じことを別の言い方で言っていたのを揃えた）:
	 *   - 「条件で検索」のモーダルの、軸のパネルの注記（`renderPickerFilterAxes`）
	 *   - `card-event-input.html` のタグ付け画面の、軸ごとの注記
	 * あちらは**タグを付ける側**の画面だが、「空にしたらどう扱われるか」を知りたいのは
	 * 結局**絞り込みでどうなるか**なので、同じ文で足りる。
	 */
	function axisRuleHint(axis) {
		return axis.exclusive
			? '選んだもの以外を持つスキルは出ない（この軸のタグが無いスキルは出る）'
			: axis.emptyMeansNone
				? '選んだもののいずれかに一致（OR）。この軸のタグが無いスキルは出ない'
				: '選んだもののいずれかに一致（OR）';
	}

	/**
	 * その軸が**ふつうの読み方（軸内OR・タグが無ければどの条件でも出る）と違う**か。
	 * **本数を数えない** ―― 「1つの軸だけ」と書いた文が、印の付く軸が増えるたびに嘘になった
	 * （段5 で3軸、段8 で排他が1軸。`card-event-input.html` の文面が長く事実と合わないままだった）。
	 */
	function axisHasSpecialRule(axis) {
		return !!(axis.exclusive || axis.emptyMeansNone);
	}

	/* 【INTENTIONALLY_REMOVED・2026-09-27（カスタムスキルの廃止）】ここには、廃した効果タイプの値を
	   いまの値へ読み替える `LEGACY_EFFECT_VALUES` / `withLegacyTagsMapped()`（70セッション目・段2）があった。
	   読み替えるのは**利用者が作ったカスタムスキルのタグだけ**で、使い道は「条件で検索」の母集団だけだった。
	   カスタムスキルを検索の一覧から外したので、読む場所が無くなった（保存データは元から書き換えていない）。 */

	/* フェッチもキャッシュも駄目だったときに使う、追加カタログの組み込みの写し。
	   カタログが1件も無いと、保存済みの比較シートの行が「（不明なスキル：…）」に化けるので、
	   マスターのサンプルと違ってこちらは**全件**を持つ。
	   正本は data/ の各JSON。写しとの食い違いは npm run test:norm が見張る。 */
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
		],
		geneFactor: [
			{ id: 'ap-turf', name: '芝の遺伝子' },
			{ id: 'ap-dirt', name: 'ダートの遺伝子' },
			{ id: 'ap-nige', name: '逃げの遺伝子' },
			{ id: 'ap-senko', name: '先行の遺伝子' },
			{ id: 'ap-sashi', name: '差しの遺伝子' },
			{ id: 'ap-oikomi', name: '追込の遺伝子' },
			{ id: 'ap-short', name: '短距離の遺伝子' },
			{ id: 'ap-mile', name: 'マイルの遺伝子' },
			{ id: 'ap-medium', name: '中距離の遺伝子' },
			{ id: 'ap-long', name: '長距離の遺伝子' }
		]
	};

	// フェッチに失敗した場合のみ使うサンプルデータ（uma-skill-deck-skills.json が
	// まだ未公開/未配置の環境でも動作確認できるようにするための最終フォールバック）。
	// **軸の顔ぶれは正本（uma-skill-deck-skills.json）と揃えること。** 70セッション目・段2 で
	// rarity / inherited を足し、effect の廃した値（speed_up）を stat_up へ直した。
	// このサンプルは正本を取れなかったときにしか使われないので検査が当たりにくい ――
	// 揃っていないと、その状況でだけ絞り込みの結果が変わる。
	const SAMPLE_MASTER_SKILLS = { masterVersion: 'embedded-sample', skills: [
		{ id: '1', name: '右回り○', tags: { distance: [], style: [], surface: [], phase: [], coursePos: [], distanceMark: [], rarity: [], inherited: [], environment: ['right_turn'], trackVenue: [], effect: ['stat_up'], scenario: [], passive: ['passive'] } },
		{ id: '21', name: '積極策', tags: { distance: ['mile'], style: [], surface: [], phase: ['mid'], coursePos: [], distanceMark: [], rarity: [], inherited: [], environment: [], trackVenue: [], effect: ['target_speed_up'], scenario: [], passive: [] } },
		{ id: '26', name: '集中力', tags: { distance: [], style: [], surface: [], phase: [], coursePos: [], distanceMark: [], rarity: [], inherited: [], environment: [], trackVenue: [], effect: ['start_good'], scenario: [], passive: [] } }
	]};

	/* ============================================================
	 * 状態
	 * ============================================================ */
	let userData = null;
	let masterSkills = [];
	// source … 'network'（取れた）／'cache'（localStorage の写し）／'sample'（組み込みサンプル）。
	// 71セッション目・段7 で足した。呼び出し側が「新しいものを見ているのか」を判定できるようにするため。
	let masterMeta = { version: '', fetchedAt: '', source: '' };
	// 追加カタログ（全カテゴリを1本の配列にまとめたもの）。各要素は正本の1件＋ category。
	let extraCatalog = [];
	let extraCatalogMeta = { entryCount: 0, sources: [] };
	// カテゴリ → 取得した**生の doc**（正本のファイルそのまま。上の extraCatalog は
	// entries を平らにしたもので、ファイル階層のキー（dataVersion / nextSerial / note …）を
	// 持たない）。貼り付け用のテキストを組み立てる側が要るので、読んだものを残しておく。
	let extraCatalogDocs = {};
	let trainingSources = { };
	let trainingMeta = { loaded: false, sources: [] };
	/**
	 * レースの距離の一覧（`data/race-distances.json`。C-97・2026-09-26）。
	 * `{ dataVersion, distanceCategories: [{ key, name, minDistance?, maxDistance? }], distances: [{ distance, category, surfaces }] }`。
	 * **区分の境目も、実在する距離も、コードに数字で書かない** ―― 目標のレースの距離から区分を決めるのも、
	 * その距離のレースがあるかを見るのも、ここから読む。**写しは持たない**（読めなければ入力欄を無効にして知らせる）。
	 */
	let raceDistances = null;
	let raceDistancesMeta = { loaded: false, ok: false, version: '' };

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
		// schemaVersion 4 で template.tiers（スキルセットの分類。{ skillId: 1|2|3 }。C-57）が加わった。
		// これも読み込み側は分岐せず、**後から補わない**（tiers が無い id は「優先」（2）として読む。
		// 補うと、分類を一度も変えていない人のデータの姿が開いただけで変わる。C-51 の知見）。
		// schemaVersion 5 で template.scopes（節の ON/OFF。{ scenarioFactors: true, genes: true }。C-2a）が
		// 加わった。これも読み込み側は分岐せず、**後から補わない**（scopes が無いセットは
		// 「どの節も OFF」＝含めない、として読む。既定が OFF なので移行は要らない）。
		// schemaVersion 6（段8・C-120）で「セット」＝ template ＋ その baseRosterId が指す roster 1件、になった。
		// 5 以前の編成（roster）は migrateUserDataToSets() が読み込み時に1回だけセットへ振り分ける。
		return { schemaVersion: 6, templates: [], records: [], customSkills: [], rosters: [] };
	}

	/**
	 * schemaVersion 5 → 6 の移行（段8・C-120）。「セット」＝ template（因子周回）＋ その baseRosterId が指す roster（本育成編成）。
	 *   (a) 指す roster がある template はそのまま1セット（roster の name を template.name に揃える）
	 *   (a') 2つ以上の template が同じ roster を指すときは、先に並ぶ template が元を持ち、後の template には写し（新しい rosterId）を付ける
	 *   (a'') 指す先が無い baseRosterId は消す（①が空のセット）
	 *   (b) どの template からも指されていない roster は、同じ名前の新しい template（スキル0件）を作って付ける
	 *   (c) roster の無い template は①が空のセット（何も足さない）
	 *   (d) 合わせて TEMPLATE_LIMIT を超えたぶんは (b) を作らない（roster は rosters に残る＝書き出しに含まれる・消さない）
	 * 移すものが1つも無いデータ（rosters も baseRosterId も無い）は**触らない**（schemaVersion も上げない。開いただけで姿を変えない流儀）。
	 * 返り値: { changed, skipped（(d) で読み込まなかった件数） }。data をその場で書き換える。
	 */
	function migrateUserDataToSets(data) {
		const out = { changed: false, skipped: 0 };
		if (!data || typeof data !== 'object' || data.schemaVersion >= 6) return out;
		const templates = Array.isArray(data.templates) ? data.templates : [];
		const rosters = Array.isArray(data.rosters) ? data.rosters : [];
		const anyLink = templates.some(t => t && typeof t.baseRosterId === 'string');
		if (rosters.length === 0 && !anyLink) return out;
		const byId = new Map(rosters.map(r => [r && r.rosterId, r]));
		const owned = new Set();
		templates.forEach(t => {
			if (!t || typeof t.baseRosterId !== 'string') return;
			const r = byId.get(t.baseRosterId);
			if (!r) { delete t.baseRosterId; return; }
			if (!owned.has(r.rosterId)) {
				owned.add(r.rosterId);
				r.name = String(t.name || '');
				return;
			}
			// (a') 同じ roster を指す2件目以降は写しを付ける（①の中身を共有させない）
			const copy = JSON.parse(JSON.stringify(r));
			copy.rosterId = uid('roster');
			copy.name = String(t.name || '');
			copy.createdAt = copy.updatedAt = nowIso();
			rosters.push(copy);
			owned.add(copy.rosterId);
			t.baseRosterId = copy.rosterId;
		});
		rosters.slice().forEach(r => {
			if (!r || owned.has(r.rosterId)) return;
			if (templates.length >= TEMPLATE_LIMIT) { out.skipped++; return; }
			const now = nowIso();
			templates.push({ templateId: uid('tpl'), name: String(r.name || ''), skillIds: [], baseRosterId: r.rosterId, createdAt: now, updatedAt: now });
			owned.add(r.rosterId);
		});
		data.templates = templates;
		data.rosters = rosters;
		data.schemaVersion = 6;
		out.changed = true;
		return out;
	}
	/** 移行で読み込まなかった件数の知らせ。ページが configure() でトーストを差し込んだときに1回だけ出す */
	let pendingMigrationNotice = '';
	function noteMigration(res) {
		if (res && res.skipped > 0) pendingMigrationNotice = 'セットが' + TEMPLATE_LIMIT + '件を超えたため、' + res.skipped + '件は読み込んでいません';
	}
	function flushMigrationNotice() {
		if (!pendingMigrationNotice) return;
		const msg = pendingMigrationNotice;
		pendingMigrationNotice = '';
		toast(msg);
	}

	function loadUserData() {
		try {
			const raw = global.localStorage.getItem(STORAGE_KEY_USER);
			if (!raw) return createEmptyUserData();
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object') return createEmptyUserData();
			parsed.templates = parsed.templates || [];
			parsed.records = parsed.records || [];
			// customSkills は、作る手段を 2026-09-27 に廃止した（C-100）。保存済みのものは消さず・書き換えず、
			// 入っているスキルセット・比較シートで名前を引くためにだけ読む（`findSkill()`）。補う処理も従来のまま。
			parsed.customSkills = parsed.customSkills || [];
			// **rosters はここで補わない。** 補うと、編成を1件も作っていない人でも
			// ページを開いただけで保存データの姿が変わってしまう（次の保存で
			// localStorage に rosters: [] が書き足される）。読む側が毎回 `|| []` で
			// 受けるので、持たない古い形（schemaVersion 2 以前）のままで正しく動く。
			// 段8（C-120）: 5 以前の編成をセットへ振り分ける（1回だけ。移したときだけ保存し直す）
			const mig = migrateUserDataToSets(parsed);
			if (mig.changed) {
				noteMigration(mig);
				try { global.localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(parsed)); } catch (e) { /* 保存は次の書き込みで */ }
			}
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
		// 段8（C-120）: 取り込んだデータが 5 以前なら、読み込みと同じ移行を通す（6 のデータは何も変わらない）
		const mig = migrateUserDataToSets(userData);
		if (mig.changed) { noteMigration(mig); flushMigrationNotice(); }
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
			if (!raw) return { skillIds: [], name: '', updatedAt: '' };
			const parsed = JSON.parse(raw);
			if (!parsed || !Array.isArray(parsed.skillIds)) return { skillIds: [], name: '', updatedAt: '' };
			// name は C-53 で足した（「＋ 新規」のタブで入力した名前を保存まで覚えておく）。無い古い形は空文字。
			// tiers（分類。C-57）は持っているときだけ写す（無い古い形に補わない＝テンプレートと同じ流儀）
			// scopes（節の ON/OFF。C-2a）も tiers と同じ流儀（持っているときだけ写す）
			const out = { skillIds: parsed.skillIds.slice(), name: typeof parsed.name === 'string' ? parsed.name : '', updatedAt: parsed.updatedAt || '' };
			if (parsed.tiers && typeof parsed.tiers === 'object') out.tiers = Object.assign({}, parsed.tiers);
			if (parsed.scopes && typeof parsed.scopes === 'object') out.scopes = Object.assign({}, parsed.scopes);
			// 親由来のレベル F（段5）。持っているときだけ写す（無い古い形に補わない。知らない値もそのまま写し、使うときに既定へ解く）
			if (typeof parsed.parentHintLevel === 'number') out.parentHintLevel = parsed.parentHintLevel;
			// 「本育成編成」の対象（段7b の ⑬）＝保存した編成の rosterId。持っているときだけ写す（無い古い形に補わない）。
			// 段7 の withRoster（ON/OFF）は置き換えたので読まない。指す編成が無くなっていても、ここでは確かめない（使うときに無効として扱う）
			if (typeof parsed.baseRosterId === 'string' && parsed.baseRosterId) out.baseRosterId = parsed.baseRosterId;
			// 継承固有（段7d の ⑪）。持っているときだけ写す（無い古い形に補わない。知らない値は使うときに既定へ解く）
			if (parsed.inheritedUnique && typeof parsed.inheritedUnique === 'object') out.inheritedUnique = Object.assign({}, parsed.inheritedUnique);
			// ランクの ON/OFF（段8・D）。持っているときだけ写す
			if (parsed.ptRanks && typeof parsed.ptRanks === 'object') out.ptRanks = Object.assign({}, parsed.ptRanks);
			return out;
		} catch (e) {
			return { skillIds: [], name: '', updatedAt: '' };
		}
	}

	// label … 失敗を知らせるときの呼び名（呼び出し元の setLabel）。渡さなければ既定の呼び名
	function saveDraftScope(scopeKey, skillIds, name, tiers, label, scopes, parentHintLevel, baseRosterId, inheritedUnique, ptRanks) {
		const payload = { skillIds: (skillIds || []).slice(), name: typeof name === 'string' ? name : '', updatedAt: nowIso() };
		// 空の tiers は書かない（分類を変えていないドラフトの姿を変えない）
		if (tiers && typeof tiers === 'object' && Object.keys(tiers).length > 0) payload.tiers = Object.assign({}, tiers);
		// scopes（節の ON/OFF。C-2a）も同じ ―― 全部 OFF なら書かない
		if (scopes && typeof scopes === 'object' && Object.keys(scopes).length > 0) payload.scopes = Object.assign({}, scopes);
		// 親由来のレベル F（段5）も同じ流儀 ―― 選んでいなければ書かない
		if (typeof parentHintLevel === 'number') payload.parentHintLevel = parentHintLevel;
		// 「本育成編成」の対象（段7b の ⑬）も同じ流儀 ―― 選んでいなければ書かない
		if (typeof baseRosterId === 'string' && baseRosterId) payload.baseRosterId = baseRosterId;
		// 継承固有（段7d の ⑪）も同じ流儀 ―― 触っていなければ書かない
		if (inheritedUnique && typeof inheritedUnique === 'object' && Object.keys(inheritedUnique).length > 0) payload.inheritedUnique = Object.assign({}, inheritedUnique);
		// ランクの ON/OFF（段8・D）も同じ流儀 ―― 触っていなければ書かない
		if (ptRanks && typeof ptRanks === 'object') payload.ptRanks = Object.assign({}, ptRanks);
		try {
			global.localStorage.setItem(draftStorageKey(scopeKey), JSON.stringify(payload));
		} catch (e) {
			toast('一時的な' + (label || DEFAULT_SET_LABEL) + 'の保存に失敗しました（ブラウザのストレージ容量を確認してください）');
		}
		return payload;
	}

	function clearDraftScope(scopeKey) {
		try { global.localStorage.removeItem(draftStorageKey(scopeKey)); } catch (e) {}
	}

	/* ---- 編成のドラフト（「＋ 新規」の中身＝未保存の編成。C-53） ----
	   スキルセットのドラフト（上）と同じ考え方で userData の外に置く（書き出し・取り込みの対象外）。
	   タブを切り替えてもページを閉じても、保存していない編成を失わないためのもの。 */
	const STORAGE_KEY_DRAFT_ROSTER_PREFIX = 'umaSkillDeck:draftRoster:';
	function loadDraftRoster(key) {
		try {
			const raw = global.localStorage.getItem(STORAGE_KEY_DRAFT_ROSTER_PREFIX + String(key));
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			return (parsed && typeof parsed === 'object') ? parsed : null;
		} catch (e) { return null; }
	}
	function saveDraftRoster(key, roster) {
		try { global.localStorage.setItem(STORAGE_KEY_DRAFT_ROSTER_PREFIX + String(key), JSON.stringify(roster)); }
		catch (e) { toast('編成の一時保存に失敗しました（ブラウザのストレージ容量を確認してください）'); }
	}
	function clearDraftRoster(key) {
		try { global.localStorage.removeItem(STORAGE_KEY_DRAFT_ROSTER_PREFIX + String(key)); } catch (e) {}
	}

	/* ============================================================
	 * 帯のタブ（共有部品。C-54）
	 *
	 * 「＋ 新規／保存したもの…」のように、タブの中で扱うものを選ぶ2段目のタブ。
	 * 見た目は css/shell.css の .uma-subtabs（ステップのタブと同じ規則）。
	 * 編成パネル・スキルセット（テンプレート管理）・special の親A／親Bセットが同じものを使う。
	 * Exam で使うときは core.js を読み込む（見た目は shell.css にあるので Exam も読める）。
	 *
	 * items: [{ id, label, count?, selected?, isNew?, title?, className? }]
	 * opts : { act（押したときの data-usd-act）, ariaLabel, el（data-usd-el） }
	 * 押した先の処理は呼び出し元が data-usd-act と data-tab-id で受ける（部品はイベントを持たない）。
	 * ============================================================ */
	function tabStripHtml(items, opts) {
		const o = opts || {};
		const act = o.act || 'tab';
		return '<div class="uma-subtabs" role="tablist"' + (o.ariaLabel ? ' aria-label="' + esc(o.ariaLabel) + '"' : '')
			+ (o.el ? ' data-usd-el="' + esc(o.el) + '"' : '') + '>'
			+ (items || []).map(it => '<button type="button" role="tab" class="uma-subtab' + (it.isNew ? ' uma-subtab--new' : '')
				+ (it.className ? ' ' + esc(it.className) : '') + '"'
				+ ' data-usd-act="' + esc(act) + '" data-tab-id="' + esc(String(it.id)) + '"'
				+ ' aria-selected="' + (it.selected ? 'true' : 'false') + '" tabindex="' + (it.selected ? '0' : '-1') + '"'
				+ (it.title ? ' title="' + esc(it.title) + '"' : '') + '>'
				+ '<span class="uma-subtab-label">' + esc(it.label) + '</span>'
				+ (it.count !== undefined && it.count !== null && it.count !== '' ? '<span class="uma-subtab-count">' + esc(String(it.count)) + '</span>' : '')
				+ '</button>').join('')
			+ '</div>';
	}
	/** 選んでいるタブが帯の外（スワイプの先）にあっても見える位置へ寄せる。 */
	function revealSelectedTab(root, horizontalOnly) {
		// 名前を編集中のタブは、選んでいるタブの代わりに 入力欄・✓・↩ の丸になっている（.usd-ntab--edit）ので、そちらを見える位置へ寄せる
		const editing = root && root.querySelector && root.querySelector('.usd-ntab--edit');
		const cur = editing || (root && root.querySelector && root.querySelector('.uma-subtab[aria-selected="true"]'));
		if (!horizontalOnly) {
			// 従来の動き（Deck 単体ページのスキルセット）。横は「選んだタブを帯の左端に寄せる」（inline: 'start'）
			if (cur && typeof cur.scrollIntoView === 'function') {
				try { cur.scrollIntoView({ block: 'nearest', inline: 'start' }); } catch (e) { /* 古いブラウザ */ }
			}
			return;
		}
		const strip = cur && cur.closest ? cur.closest('.uma-subtabs') : null;
		if (!strip) return;
		// 横は「選んだタブを帯の左端に寄せる」。'nearest' だと、帯の scroll-snap（タブの先頭に吸着）が、
		// 右端を見せる位置から手前のタブの先頭へ引き戻してしまい、幅を広げた選択中のタブの後半と件数が
		// 切れて見えた（C-55 の (2) で実測）。
		// **scrollIntoView は使わない**（段7b の ⑥）。これは帯を含む祖先すべてをスクロールするので、
		// 表まで下がっているときに、描き直すたびにページごと帯の位置まで戻ってしまっていた
		// （実測: 375px で表を画面の途中に置いて並べ替えを押すと scrollY が 519 → 395）。
		// 動かすのは帯の scrollLeft だけ（縦のスクロールは起こさない）。
		const item = cur.closest('.usd-ntab') || cur;
		const delta = item.getBoundingClientRect().left - strip.getBoundingClientRect().left;
		if (Math.abs(delta) > 1) strip.scrollLeft += delta;
	}
	/** フォーカスを移す。**ページは動かさない**（段7b の ⑥。focus() の既定は、要素を画面に入れるためにスクロールする）。 */
	function focusNoScroll(el) {
		if (!el || typeof el.focus !== 'function') return;
		try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
	}
	/**
	 * 描き直しで押したボタンが画面の中で動かないようにする（段7b の ⑥）。
	 * 押す前に、ボタンを探し直す手がかり（data- 属性）と画面上の位置を覚えておき、描き直したあとに同じボタンを探して、
	 * 位置のずれのぶんだけページをスクロールして打ち消す。ボタンが無くなっていたら何もしない。
	 */
	const ANCHOR_ATTRS = ['data-usd-act', 'data-member-key', 'data-tab-id', 'data-index', 'data-axis', 'data-value', 'data-skill-id', 'data-usd-info', 'data-event-key', 'data-choice', 'data-tier', 'data-usd-el'];
	function captureAnchor(el) {
		if (!el || !el.getAttribute || !el.isConnected) return null;
		// 小窓（画面に固定）の中のボタンは、ページの位置とは関係が無いので対象にしない
		if (el.closest && el.closest('.uma-overlay, .usd-roster-modal')) return null;
		let sel = el.tagName.toLowerCase();
		ANCHOR_ATTRS.forEach(a => { const v = el.getAttribute(a); if (v !== null) sel += '[' + a + '="' + String(v).replace(/"/g, '\\"') + '"]'; });
		return { sel: sel, top: el.getBoundingClientRect().top };
	}
	function restoreAnchor(anchor, roots) {
		if (!anchor || !global.document) return;
		let el = null;
		for (let i = 0; i < roots.length && !el; i++) { if (roots[i]) el = roots[i].querySelector(anchor.sel); }
		if (!el) return;
		const d = el.getBoundingClientRect().top - anchor.top;
		if (Math.abs(d) > 0.5 && typeof global.scrollBy === 'function') global.scrollBy(0, d);
	}
	/** WAI-ARIA のタブの作法（←→で隣へ、Home/End で端へ）。onSelect(id) を呼んだあと、選んだタブへフォーカスを戻す。 */
	function tabStripKeydown(ev, onSelect) {
		const strip = ev.target && ev.target.closest ? ev.target.closest('.uma-subtabs') : null;
		if (!strip) return;
		const tabs = Array.from(strip.querySelectorAll('.uma-subtab'));
		const i = tabs.indexOf(ev.target.closest('.uma-subtab'));
		if (i < 0 || tabs.length === 0) return;
		const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[ev.key];
		if (next === undefined) return;
		ev.preventDefault();
		const id = tabs[next].getAttribute('data-tab-id');
		const root = strip.parentElement;
		onSelect(id);
		const again = root && root.querySelector ? root.querySelector('.uma-subtab[data-tab-id="' + id.replace(/"/g, '\\"') + '"]') : null;
		if (again) focusNoScroll(again);
	}

	/**
	 * 名前つきのタブの帯（段7b・G。①本育成編成と②因子周回で同じ部品を使う）。描くのは帯だけで、
	 * 押したときの処理は呼び出し元が data-usd-act で受ける（部品はイベントを持たない）。
	 *   選んでいるタブ … 名前の右に ✎（data-usd-act="name-edit"）と ×（"name-reset"）。選んでいないタブは名前だけ。
	 *   編集中 … そのタブが 入力欄（data-usd-el="name"）・✓（"name-commit"）・↩（"name-cancel"）に変わる。
	 * items: [{ id, label, count?, selected?, isNew?, title?, className? }]
	 * o: { act, ariaLabel, el, noun（「編成」「因子周回」）, edit（編集中なら { value }）, placeholder }
	 * ✓ は「＋新規」では名前が空のあいだ押せない。ボタンは 32px 以上。
	 */
	function namedTabsHtml(items, o) {
		const opt = o || {};
		const act = opt.act || 'tab';
		const noun = opt.noun || '';
		const icon = (name) => '<i data-lucide="' + name + '" class="w-4 h-4" aria-hidden="true"></i>';
		const tab = (it) => '<button type="button" role="tab" class="uma-subtab' + (it.isNew ? ' uma-subtab--new' : '')
			+ (it.className ? ' ' + esc(it.className) : '') + '"'
			+ ' data-usd-act="' + esc(act) + '" data-tab-id="' + esc(String(it.id)) + '"'
			+ ' aria-selected="' + (it.selected ? 'true' : 'false') + '" tabindex="' + (it.selected ? '0' : '-1') + '"'
			+ (it.title ? ' title="' + esc(it.title) + '"' : '') + '>'
			+ '<span class="uma-subtab-label">' + esc(it.label) + '</span>'
			+ (it.count !== undefined && it.count !== null && it.count !== '' ? '<span class="uma-subtab-count">' + esc(String(it.count)) + '</span>' : '')
			+ '</button>';
		const iconBtn = (actName, el, label, inner, disabled) => '<button type="button" class="usd-ntab-btn" data-usd-act="' + actName + '" data-usd-el="' + el + '"'
			+ ' aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (disabled ? ' disabled' : '') + '>' + inner + '</button>';
		let h = '<div class="uma-subtabs usd-ntabs" role="tablist"' + (opt.ariaLabel ? ' aria-label="' + esc(opt.ariaLabel) + '"' : '')
			+ (opt.el ? ' data-usd-el="' + esc(opt.el) + '"' : '') + '>';
		(items || []).forEach(it => {
			if (!it.selected) { h += tab(it); return; }
			if (opt.edit) {
				const value = String(opt.edit.value === undefined || opt.edit.value === null ? '' : opt.edit.value);
				const commitLabel = it.isNew ? noun + 'を保存' : '名前を確定';
				h += '<span class="usd-ntab usd-ntab--edit" data-usd-el="tab-edit">'
					+ '<input class="usd-ntab-input" type="text" data-usd-el="name" data-usd-act="name" value="' + esc(value) + '"'
					+ ' placeholder="' + esc(opt.placeholder || '') + '" aria-label="' + esc(opt.placeholder || noun + 'の名前') + '" />'
					+ iconBtn('name-commit', 'name-commit', commitLabel, icon('check'), it.isNew && !value.trim())
					+ iconBtn('name-cancel', 'name-cancel', '編集を取り消す', icon('undo-2'))
					+ '</span>';
				return;
			}
			h += '<span class="usd-ntab usd-ntab--sel">' + tab(it)
				+ iconBtn('name-edit', 'name-edit', '名前を編集', icon('pencil'))
				+ iconBtn('name-reset', 'name-reset', noun + (it.isNew ? 'をリセット' : 'を削除'), '×')
				+ '</span>';
		});
		return h + '</div>';
	}

	/**
	 * 確認の小窓（段7b・G。①の × と②の × で共有。もとは①の中にあった confirmHtml を外へ出したもの）。
	 * ページに1つだけ。背景・キャンセル・Esc で閉じ、OK で o.onOk を呼ぶ。置き場所は document.body の直下
	 * （.glass-card の backdrop-filter が position: fixed の基準を変えてしまうため。F-61）。
	 *   o: { text, ariaLabel, onOk, onCancel }
	 */
	let confirmModalEl = null;
	let confirmModalKey = null;
	function closeConfirmModal() {
		if (confirmModalKey) { global.document.removeEventListener('keydown', confirmModalKey, true); confirmModalKey = null; }
		if (confirmModalEl && confirmModalEl.parentNode) confirmModalEl.parentNode.removeChild(confirmModalEl);
		confirmModalEl = null;
	}
	function openConfirmModal(o) {
		injectStyles();
		closeConfirmModal();
		const doc = global.document;
		const opener = doc.activeElement;
		const el = doc.createElement('div');
		el.className = 'usd-roster-modal';
		el.setAttribute('data-usd-el', 'confirm-modal');
		el.innerHTML = '<div class="usd-roster-modal-back" data-usd-act="confirm-cancel"></div>'
			+ '<div class="usd-roster-modal-box usd-roster-modal-box--confirm" role="alertdialog" aria-modal="true" aria-label="' + esc(o.ariaLabel || '確認') + '">'
			+ '<p class="usd-roster-confirm-text" data-usd-el="confirm-text">' + esc(o.text) + '</p>'
			+ '<div class="usd-roster-row usd-roster-confirm-btns">'
			+ '<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="confirm-cancel">キャンセル</button>'
			+ '<button type="button" class="uma-btn uma-btn--danger" data-usd-act="confirm-ok" data-usd-el="confirm-ok">OK</button>'
			+ '</div></div>';
		doc.body.appendChild(el);
		confirmModalEl = el;
		const finish = (ok) => {
			closeConfirmModal();
			if (ok) { if (typeof o.onOk === 'function') o.onOk(); } else if (typeof o.onCancel === 'function') o.onCancel();
			if (opener && opener.isConnected) focusNoScroll(opener);
		};
		el.addEventListener('click', (e) => {
			const b = e.target.closest ? e.target.closest('[data-usd-act]') : null;
			if (!b) return;
			const a = b.getAttribute('data-usd-act');
			if (a === 'confirm-cancel') finish(false); else if (a === 'confirm-ok') finish(true);
		});
		confirmModalKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
		doc.addEventListener('keydown', confirmModalKey, true);
		focusNoScroll(el.querySelector('[data-usd-el="confirm-ok"]'));
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
		// **`?` で繋ぎ足さない** ―― 71セッション目・段7 でマスターのURLに `?v=` が付いたので、
		// `url + '?t='` だと `?v=…?t=…` になって壊れる（common.js 側は元から `&` で繋いでいる）。
		const res = await global.fetch(cacheBust ? withQuery(url, 't', Date.now()) : url);
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
	/**
	 * 追加カタログの1件を、内部で持つ形に整える（`{ …正本のキー全部, id, name, category }`）。
	 *
	 * **浅いコピー。知らないキーも落とさず素通しする。**
	 *
	 * 写すキーをここに並べると、正本に項目が増えるたびに core を直すことになり、
	 * **直し忘れたときに黙って落ちる**（C-49 の5節の `tags` がまさにこれだった。
	 * 項目を足した側は core を直す必要に気づけないので、**気づく仕組みが無い**のが問題）。
	 * 正本の入口は `npm run check:catalog` が許可リスト方式で固めているので、
	 * 想定外のキーがファイルから紛れ込むことはない。**関門は入口に1つ置き、
	 * ここは素通しにする**（C-64）。
	 *
	 * **無いものを既定値で作らない。** シナリオ因子は `tags` も `tagsPending` も持たないので、
	 * ここで既定値を入れるとカテゴリ名で分岐することになる（恒久ルール1）。
	 * 「全軸が空のタグ」は**タグを付けた結果そうなった**という別の意味を持つため
	 * （距離・脚質では「万能」、効果タイプ・フェーズ・コース位置・その他では「該当なし」。段5・C-89）、
	 * タグ未設定の代わりに空のタグを作ってはいけない。
	 *
	 * `id` / `name` / `category` だけは上書きする（前2つは型をそろえるため、
	 * `category` は正本ではなく `EXTRA_CATALOG_SOURCES` の並びが正のため）。
	 */
	function toCatalogEntry(e, category) {
		return Object.assign({}, e, { id: String(e.id), name: String(e.name), category: category });
	}

	function normalizeCatalogEntries(data, category) {
		const list = (data && Array.isArray(data.entries)) ? data.entries : [];
		return list
			.filter(e => e && e.id && e.name)
			.map(e => toCatalogEntry(e, category));
	}

	async function loadExtraCatalog(forceRefresh) {
		let cached = null;
		try { cached = JSON.parse(global.localStorage.getItem(STORAGE_KEY_EXTRA_CATALOG) || 'null'); } catch (e) {}
		const nextCache = {};
		const nextDocs = {};
		const entries = [];
		const sources = [];

		for (let i = 0; i < EXTRA_CATALOG_SOURCES.length; i++) {
			const src = EXTRA_CATALOG_SOURCES[i];
			let data = null, from = '';
			try {
				data = await fetchMasterJson(withDataVersion(src.path), !!forceRefresh);
				from = '取得';
			} catch (e) {
				if (cached && cached.data && cached.data[src.category]) { data = cached.data[src.category]; from = 'キャッシュ'; }
			}
			let list = normalizeCatalogEntries(data, src.category);
			if (list.length === 0) {
				// 組み込みの写し。ここまで来ても空なら、そのカテゴリは今回は無いものとして進む。
				// 正本と同じ toCatalogEntry() を通す（写しにタグを持たせたときに、
				// ここだけ落ちるということが起きないように）。
				list = (EMBEDDED_EXTRA_CATALOG[src.category] || [])
					.map(e => toCatalogEntry(e, src.category));
				data = null;
				from = '組み込み';
			}
			// nextCache は localStorage へ書き戻すぶん、nextDocs は画面へ渡すぶん。
			// 組み込みの写しに落ちたときは data が null なので、生の doc は残らない
			// （呼び出し側は「読めていない」と判断できる）。
			if (data) { nextCache[src.category] = data; nextDocs[src.category] = data; }
			list.forEach(e => entries.push(e));
			sources.push({ category: src.category, count: list.length, from: from, version: (data && data.dataVersion) || '' });
		}

		extraCatalog = entries;
		extraCatalogDocs = nextDocs;
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
		} else {
			/* **取れなかったが、写しがあったので中身は埋まった** ―― という場合を知らせる
			 * （71セッション目・段7の続き）。
			 *
			 * **ここが抜けていた。** 上の検査は「1件も読めなかったカテゴリ」しか見ていないので、
			 *   - シナリオ因子・遺伝子 … 組み込みの写しを持つので、取れなくても件数は埋まる
			 *   - 拡張スキル           … `localStorage` の写しがあれば埋まる
			 * のどちらも**黙って古い写しで動いていた**。マスターで直したのと同じ穴が、
			 * 「マスターより先に手当てされていたはず」の側に残っていた。
			 *
			 * カテゴリ名（`scenarioFactor` など）は**開発側の語**なので、利用者向けの文面には出さず
			 * 開発ログにだけ出す。文面はマスターのものと揃える。 */
			const stale = sources.filter(s => s.from !== '取得');
			if (stale.length > 0) {
				try {
					global.console.warn('[UmaSkillDeck] 収録データを取得できなかった: '
						+ stale.map(s => s.category + '←' + s.from).join(' / '));
				} catch (e) {}
				toast('収録データを取得できなかったので、前に読み込んだものを使っています。'
					+ '通信できないときは、ページを開き直すと直ることがあります。');
			}
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
		await loadRaceDistances(forceRefresh);
		// **`?v=` を付ける**（71セッション目・段7。MASTER_JSON_VERSION の説明を読むこと）。
		// forceRefresh のときは fetchMasterJson がさらに `&t=` を足してキャッシュを完全に避ける。
		const url = withQuery(masterJsonPath || MASTER_JSON_PATH, 'v', MASTER_JSON_VERSION);
		try {
			const data = await fetchMasterJson(url, !!forceRefresh);
			masterSkills = data.skills || [];
			masterMeta = { version: data.masterVersion || '', fetchedAt: nowIso(), source: 'network' };
			try { global.localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify({ data: data, fetchedAt: masterMeta.fetchedAt })); } catch (e) {}
			return { ok: true, source: 'network', version: masterMeta.version, count: masterSkills.length };
		} catch (e) {
			// フェッチ失敗時はキャッシュ→組み込みサンプルの順でフォールバックする。
			// **どちらに落ちたかを必ず知らせる**（71セッション目・段7）。それまでは黙って
			// 古い写しで動いていたので、「実装が間違っている」のか「古いものを見ている」のかを
			// 利用者も開発者も切り分けられなかった。追加カタログ側と同じ形（console.warn ＋ toast）。
			try {
				const cached = JSON.parse(global.localStorage.getItem(STORAGE_KEY_MASTER) || 'null');
				if (cached && cached.data) {
					masterSkills = cached.data.skills || [];
					masterMeta = { version: (cached.data.masterVersion || '') + '（キャッシュ）', fetchedAt: cached.fetchedAt || '', source: 'cache' };
					noticeMasterFallback('cache');
					return { ok: false, source: 'cache', version: masterMeta.version, count: masterSkills.length };
				}
			} catch (e2) {}
			masterSkills = SAMPLE_MASTER_SKILLS.skills;
			masterMeta = { version: SAMPLE_MASTER_SKILLS.masterVersion + '（組み込みサンプル）', fetchedAt: nowIso(), source: 'sample' };
			noticeMasterFallback('sample');
			return { ok: false, source: 'sample', version: masterMeta.version, count: masterSkills.length };
		}
	}

	/* ============================================================
	 * レースの距離の一覧（`data/race-distances.json`。C-97）
	 *
	 * 「目標のレースの距離」の判定に使う。スキルではないので EXTRA_CATALOG_SOURCES にも
	 * TRAINING_SOURCES にも入れない（findSkill() と名前の索引に混ぜないため）。
	 * 写しもキャッシュも持たない ―― 読めなかったときは `raceDistances` を null のままにし、
	 * 入力欄を無効にして知らせる（黙って古いものや決め打ちの数字で動かない）。
	 * ============================================================ */
	const RACE_DISTANCES_PATH = 'data/race-distances.json';
	/** 根幹距離の定義（400m の倍数）。競馬の一般用語で、ゲームのスキル説明文にも明示がある（C-95）。 */
	const STANDARD_DISTANCE_UNIT = 400;

	async function loadRaceDistances(forceRefresh) {
		try {
			const data = await fetchMasterJson(withDataVersion(RACE_DISTANCES_PATH), !!forceRefresh);
			const cats = (data && Array.isArray(data.distanceCategories)) ? data.distanceCategories : [];
			const dists = (data && Array.isArray(data.distances)) ? data.distances : [];
			if (cats.length === 0 || dists.length === 0) throw new Error('empty');
			raceDistances = { distanceCategories: cats, distances: dists };
			raceDistancesMeta = { loaded: true, ok: true, version: data.dataVersion || '' };
		} catch (e) {
			raceDistances = null;
			raceDistancesMeta = { loaded: true, ok: false, version: '' };
			try { global.console.warn('[UmaSkillDeck] レースの距離の一覧を読み込めなかった（目標のレースの距離は使えない）'); } catch (e2) {}
		}
		return raceDistancesMeta;
	}

	/** 距離 d の区分（`distanceCategories` の境目から決める）。無ければ null。 */
	function categoryOfDistance(d) {
		if (!raceDistances) return null;
		return raceDistances.distanceCategories.find(c =>
			(c.minDistance == null || d >= c.minDistance) && (c.maxDistance == null || d <= c.maxDistance)) || null;
	}

	/** 選んだ区分に実在する距離の一覧（区分だけを選んだときに、全体にかかる限定と突き合わせる相手）。 */
	function distancesInCategories(categoryKeys) {
		if (!raceDistances) return [];
		return raceDistances.distances.filter(x => categoryKeys.includes(x.category)).map(x => x.distance);
	}

	/** スキルの `raceDistance`（レースの距離の限定）に、距離 d が当たるか。min・max は両端を含む。 */
	function raceDistanceMatches(rd, d) {
		if (!rd) return false;
		if (typeof rd.standardDistance === 'boolean') return (d % STANDARD_DISTANCE_UNIT === 0) === rd.standardDistance;
		return (rd.min == null || d >= rd.min) && (rd.max == null || d <= rd.max);
	}

	/**
	 * 「目標のレースの距離」の入力を評価する（C-97）。
	 * 返すのは `{ state, distance, category, message }`。state は
	 *   'empty'       … 何も入っていない（条件なし）
	 *   'unavailable' … レースの一覧を読めていない（入力欄は無効）
	 *   'invalid'     … 数字でない
	 *   'noRace'      … その距離のレースが無い
	 *   'mismatch'    … 選んだ区分と合わない（マイル＋2400 など）
	 *   'ok'          … 使える（distance・category が入る）
	 * **エラーのときは d を使わずに絞る**（呼び出し側は state が 'ok' のときだけ d を渡す）。
	 * 正規化: 全角の数字・「m」・カンマ・空白を落とす。数字を自由に入れる形で、ゲームの距離の範囲では弾かない
	 * （実在するかはレースの一覧で見る）。
	 */
	function evaluateTargetDistance(text, selectedCategoryKeys) {
		const raw = String(text == null ? '' : text);
		if (raw.trim() === '') return { state: 'empty', distance: null, category: null, message: '' };
		if (!raceDistances) return { state: 'unavailable', distance: null, category: null, message: 'レースの一覧を読み込めなかったので、目標の距離は使えません' };
		const digits = raw.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30))
			.replace(/[mMｍＭ,，、\s]/g, '');
		if (!/^\d+$/.test(digits)) return { state: 'invalid', distance: null, category: null, message: '距離は数字で入れてください' };
		const d = Number(digits);
		if (!raceDistances.distances.some(x => x.distance === d)) return { state: 'noRace', distance: d, category: null, message: 'この距離のレースはありません' };
		const category = categoryOfDistance(d);
		if (!category) return { state: 'noRace', distance: d, category: null, message: 'この距離のレースはありません' };
		const selected = selectedCategoryKeys || [];
		const others = selected.filter(k => k !== category.key);
		if (others.length > 0) {
			const axis = TAG_AXES.find(a => a.targetDistance);
			const names = others.map(k => (axis ? tagLabel(axis.key, k) : k)).join('・');
			return { state: 'mismatch', distance: d, category: category,
				message: d + 'm は' + category.name + 'のレースです。選んだ区分（' + names + '）と合いません' };
		}
		return { state: 'ok', distance: d, category: category, message: '' };
	}

	/** 古い写し・組み込みサンプルに落ちたことを、開発ログと利用者の両方へ出す。 */
	function noticeMasterFallback(source) {
		const msg = MASTER_FALLBACK_NOTICE[source];
		if (!msg) return;
		try { global.console.warn('[UmaSkillDeck] ' + msg + '（source=' + source + '）'); } catch (e) {}
		toast(msg);
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
		{ key: 'trainingUmamusume', path: 'data/training-umamusume.json' },
		{ key: 'supportCard', path: 'data/support-cards.json' },
		{ key: 'supportCardEventSkill', path: 'data/support-card-event-skills.json' },
		// キャラクター共通のイベント（C-102 の区切り3）。キャラクター名（charaName）を鍵に、1人に1回だけ書く
		{ key: 'characterEventSkill', path: 'data/character-event-skills.json' }
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
				const data = await fetchMasterJson(withDataVersion(src.path), !!forceRefresh);
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
		return title + (groupNameOf(entry) || entry.charaName || '');
	}
	/**
	 * 選択済みの欄に出す短い名前＝**二つ名を落としてウマ娘名だけ**（C-51 の11節）。
	 * 選ぶミニウィンドウと凡例は正式名称（上）のまま。同じウマ娘の別のカードを同時に
	 * 選ぶと区別がつかなくなるが、編成の文脈で把握できるという割り切りで、特別な処理は入れない
	 * （おいもさんの判断）。ウマ娘名が無い行は正式名称に落とす。
	 */
	function formatEntryShortLabel(entry) {
		if (!entry) return '';
		return groupNameOf(entry) || entry.charaName || formatEntryLabel(entry);
	}
	/**
	 * グループのサポートカードの正式な名称（2026-09-30）。**グループのカードの名前はキャラクター名ではなく
	 * グループのサポートカード名**なので、画面にはこれを出す（上の2つは「ウマ娘名」の代わりにこれを使う）。
	 * `charaName`（代表者）は共通イベントとの紐づけに使っているので、データも使い方も変えない（表示にだけ使わない）。
	 * グループでないカード・名称の入っていないグループのカードは空文字（＝今までどおり charaName を出す）。
	 */
	function groupNameOf(entry) {
		if (!entry || entry.isGroup !== true || typeof entry.groupName !== 'string') return '';
		return entry.groupName.trim();
	}

	function findEventRow(cardId) {
		const doc = trainingSources.supportCardEventSkill;
		const rows = (doc && doc.entries) || [];
		return rows.find(r => r && r.cardId === cardId) || null;
	}

	/**
	 * イベントスキルの状態。'done'（確かめた）/ 'none'（無いと確かめた）/
	 * 'seeded'（シートから取り込んだまま。スキルは分かっているが、何回目か・選択肢・レベルは未確認）/
	 * 'pending'（未確認＝行が無い）
	 */
	function eventStatusOf(cardId) {
		const row = findEventRow(cardId);
		return row ? row.status : 'pending';
	}

	/**
	 * イベントの1つの選択肢の「成功側」（C-102）。選択肢の形は2つ ――
	 * (ア) `{ skills: [...] }`（成否に分かれない）と (イ) `{ results: [[...], [...], ...] }`
	 * （結果が分かれる。**先頭がいちばん良い結果＝成功**）。(イ) の2番目以降（失敗側）は
	 * 編成では使わない（失敗したときのスキルは基本的に下位のスキルで、利用者の関心の外。C-102 の問B）。
	 */
	function eventChoiceSuccessSkills(choice) {
		if (!choice) return [];
		if (Array.isArray(choice.skills)) return choice.skills;
		if (Array.isArray(choice.results) && Array.isArray(choice.results[0])) return choice.results[0];
		return [];
	}

	/**
	 * そのカードのイベントで得られるスキルを、編成の見方で返す（C-102）。
	 * 返り値は [{ skillId, name, sure }]。sure が true なら●（得られる。「本育成スキルを除外する」で外す）、
	 * false なら△（出すが外さない）。未確認・無しなら空配列。
	 *   - 選択肢が1つのイベント … 成功側が●
	 *   - 選択肢が2つ以上のイベント … **どれを選ぶかを選ぶ仕組みはまだ無い**ので、いつも「選んでいない」扱い。
	 *     各選択肢の成功側が△で、**すべての選択肢の成功側に入っているもの**だけ●（どれを選んでも得られる）
	 *   - 'seeded'（取り込んだまま） … 全部△
	 *   - 失敗側にだけあるスキルは出さない
	 * 同じスキルが複数のイベントから来たら、どこか1つでも●なら●。
	 */
	function getEventSkillsOf(cardId, evOpts) {
		return eventRowSkills(findEventRow(cardId), 'chain', evOpts);
	}

	/** そのカードのイベントの、イベントごとの出現（スキルPt の由来。eventRowOccurrences を参照）。 */
	function getEventOccurrencesOf(cardId, evOpts) {
		return eventRowOccurrences(findEventRow(cardId), 'chain', 'card:' + cardId, evOpts);
	}

	/**
	 * イベントの行（カードの連続イベントの行・キャラクター共通のイベントの行）から、編成の見方でスキルを引く。
	 * eventsKey は回の並びを持つキー（カードは 'chain'、キャラクターは 'events'）。回の中身の形と●・△の決まりは同じ。
	 *
	 * **返り値の形と中身は、hintLevel を持ち回る前（段2 より前）と同じ**（skillId が鍵の1行・sure は「どこか1か所でも●なら●」）。
	 * 元になる「イベントごとの出現」は eventRowOccurrences() が持つ。
	 */
	function eventRowSkills(row, eventsKey, evOpts) {
		const out = new Map();
		// 選択（段7の (19)）を効かせるときは、出現の eventKey が保存の鍵と同じになるよう keyBase を渡す
		eventRowOccurrences(row, eventsKey, evOpts && evOpts.keyBase ? evOpts.keyBase : '', evOpts).forEach(o => {
			const cur = out.get(o.skillId);
			if (cur) { if (o.sure) cur.sure = true; return; }
			out.set(o.skillId, { skillId: o.skillId, name: o.name, sure: !!o.sure });
		});
		return Array.from(out.values());
	}

	/**
	 * イベントの行から、**イベントごとの出現**を引く（段2・スキルPt の由来の機械可読化）。
	 * 返り値は [{ skillId, name, sure, hintLevel, eventKey }]。
	 *   - eventKey … どのイベントか（`keyBase + '#' + 回の並びの位置`。seeded は `keyBase + '#seeded'`）。
	 *     **同じイベントの中の複数の選択肢に同じスキルがあっても、1行にまとめる**（hintLevel はその中の最大、sure は「どれかで●なら●」）。
	 *     別のイベントに同じスキルがあれば、別の行（スキルPt では加算する）。
	 *   - hintLevel … 数（0以上の整数）。取り込んだまま（seeded）など、レベルを持たないものは null。
	 * ●・△の決まりは eventRowSkills と同じ（選択肢が1つなら成功側が●／2つ以上なら、すべての選択肢の成功側に入るものだけ●・ほかは△／
	 * seeded は全部△）。
	 */
	function eventRowOccurrences(row, eventsKey, keyBase, evOpts) {
		if (!row) return [];
		const out = [];
		const levelOf = (ref) => (Number.isInteger(ref && ref.hintLevel) && ref.hintLevel >= 0 ? ref.hintLevel : null);
		// 1つのイベントの中で、スキルごとに1行へまとめる
		const pushEvent = (eventKey, refs) => {
			const byId = new Map();
			refs.forEach(({ ref, sure }) => {
				if (!ref || !ref.skillId) return;
				const cur = byId.get(ref.skillId);
				const lv = levelOf(ref);
				if (cur) {
					if (sure) cur.sure = true;
					if (lv !== null && (cur.hintLevel === null || lv > cur.hintLevel)) cur.hintLevel = lv;
					return;
				}
				byId.set(ref.skillId, { skillId: ref.skillId, name: ref.name, sure: !!sure, hintLevel: lv, eventKey: eventKey });
			});
			byId.forEach(v => out.push(v));
		};
		if (row.status === 'seeded') {
			pushEvent(keyBase + '#seeded', (row.unplaced || []).map(ref => ({ ref: ref, sure: false })));
		} else if (row.status === 'done') {
			(row[eventsKey] || []).forEach((ev, idx) => {
				const sides = ((ev && ev.choices) || []).map(eventChoiceSuccessSkills);
				const refs = [];
				// 選んだ（または既定で選ばれた）選択肢があるイベント（段7の (19)）: その成功側だけが●。ほかの選択肢だけのスキルは出ない
				const pick = resolveEventChoice(sides, keyBase + '#' + idx, evOpts);
				if (pick) { sides[pick.index].forEach(ref => refs.push({ ref: ref, sure: true })); }
				else if (sides.length === 1) { sides[0].forEach(ref => refs.push({ ref: ref, sure: true })); }
				else {
					const inEvery = id => sides.every(side => side.some(ref => ref && ref.skillId === id));
					sides.forEach(side => side.forEach(ref => refs.push({ ref: ref, sure: !!(ref && inEvery(ref.skillId)) })));
				}
				pushEvent(keyBase + '#' + idx, refs);
			});
		}
		return out;
	}

	/**
	 * 選択肢が2つ以上あるイベントの、選ぶべき選択肢を決める（段7の (19)・2026-10-03）。
	 *   evOpts.choices … 利用者が選んだもの { eventKey: 選択肢の位置 }（編成の eventChoices）。指す先が無い値は無効
	 *   evOpts.autoChoose … 既定を決めるか。**残るスキル（evOpts.isWanted を通るもの）を成功側に持つ選択肢が1つだけ**のとき、それを選んだものとして扱う
	 *   evOpts.isWanted … 絞り込みの述語（無ければ全部残る）
	 * 返り値は { index, auto } か null（未選択）。
	 */
	function resolveEventChoice(sides, eventKey, evOpts) {
		if (!evOpts || sides.length < 2) return null;
		const chosen = evOpts.choices && evOpts.choices[eventKey];
		if (Number.isInteger(chosen) && chosen >= 0 && chosen < sides.length) return { index: chosen, auto: false };
		if (evOpts.autoChoose) {
			const has = (side) => side.some(ref => ref && ref.skillId && findSkill(ref.skillId) && (!evOpts.isWanted || evOpts.isWanted(ref.skillId)));
			const cands = [];
			sides.forEach((side, i) => { if (has(side)) cands.push(i); });
			if (cands.length === 1) return { index: cands[0], auto: true };
		}
		return null;
	}

	/**
	 * イベントの行から、**選べるイベント**（選択肢が2つ以上あり、どれかの成功側にスキルがあるもの）を並べる（段7の (19)）。
	 * 返り値は [{ eventKey, index, step, choices: [{ index, skills: [{ skillId, name, hintLevel }] }], chosen, auto }]。
	 * 回の名前・順序・選択肢の持ち方はデータに合わせる（名前を決め打ちしない）。seeded・none・pending は空。
	 */
	function eventRowChoiceEvents(row, eventsKey, keyBase, evOpts) {
		if (!row || row.status !== 'done') return [];
		const out = [];
		(row[eventsKey] || []).forEach((ev, idx) => {
			const sides = ((ev && ev.choices) || []).map(eventChoiceSuccessSkills);
			if (sides.length < 2) return;
			const choices = sides.map((side, i) => {
				const raw = (ev.choices || [])[i] || {};
				const c = { index: i, skills: side.filter(ref => ref && ref.skillId && findSkill(ref.skillId))
					.map(ref => ({ skillId: ref.skillId, name: ref.name, hintLevel: (Number.isInteger(ref.hintLevel) && ref.hintLevel >= 0) ? ref.hintLevel : null })) };
				// シナリオのイベント（段7c の N）の選択肢は、名前（キャラクター）と、編成にいるかどうか（linked／unlinked）を持つ
				if (typeof raw.label === 'string' && raw.label) c.label = raw.label;
				if (raw.state === 'linked' || raw.state === 'unlinked') c.state = raw.state;
				return c;
			});
			if (!choices.some(c => c.skills.length > 0)) return;
			const eventKey = keyBase + '#' + idx;
			const pick = resolveEventChoice(sides, eventKey, evOpts);
			// 選ぶ必要があるか（段7d の ⑤）。絞り込み後に残るスキルを成功側に持つ選択肢が2つ以上あるイベントだけ「選ぶ必要あり」。
			// 1つなら自動（resolveEventChoice）、0なら不要。pending は「選ぶ必要があるのに、まだ選んでいない」（「!」と「未選択N件」に数える）
			const isWanted = evOpts && typeof evOpts.isWanted === 'function' ? evOpts.isWanted : null;
			const wantedChoices = choices.filter(c => c.skills.some(s => !isWanted || isWanted(s.skillId))).length;
			out.push({ eventKey: eventKey, index: idx, step: (ev && Number.isInteger(ev.step)) ? ev.step : null, choices: choices,
				wantedChoices: wantedChoices, pending: !pick && wantedChoices >= 2,
				name: (ev && typeof ev.name === 'string') ? ev.name : null, when: (ev && typeof ev.when === 'string') ? ev.when : null,
				chosen: pick ? pick.index : null, auto: !!(pick && pick.auto) });
		});
		return out;
	}
	/* ---- キャラクター共通のイベント（C-102 の区切り3） ----
	   同じキャラクターのサポートカードに共通するイベント。キャラクター名を鍵に1人に1回だけ書き、
	   そのキャラクターのカード全部（R・SR・SSR）に当てはめる。**グループのカードはメンバー全員ぶん**。 */
	function findCharacterEventRow(charaName) {
		const doc = trainingSources.characterEventSkill;
		const rows = (doc && doc.entries) || [];
		return rows.find(r => r && r.charaName === charaName) || null;
	}
	/** 'done' / 'none' / 'seeded' / 'pending'（行が無い＝未確認） */
	function characterEventStatusOf(charaName) {
		const row = findCharacterEventRow(charaName);
		return row ? row.status : 'pending';
	}
	/** そのキャラクターの共通イベントで得られるスキル（[{ skillId, name, sure }]。決まりは連続イベントと同じ） */
	function getCharacterEventSkillsOf(charaName, evOpts) {
		return eventRowSkills(findCharacterEventRow(charaName), 'events', evOpts ? Object.assign({}, evOpts, { keyBase: 'chara:' + charaName }) : undefined);
	}
	/** そのキャラクターの共通イベントの、イベントごとの出現（スキルPt の由来）。同じキャラクターは何枚のカードから当たっても同じ eventKey。 */
	function getCharacterEventOccurrencesOf(charaName, evOpts) {
		return eventRowOccurrences(findCharacterEventRow(charaName), 'events', 'chara:' + charaName, evOpts);
	}
	/**
	 * そのカードに共通イベントが当てはまるキャラクター。グループでないカードはその charaName の1人、
	 * グループのカードは groupMembers の全員（charaName は代表者1人なので使わない）。
	 * **グループかどうかの印（isGroup）が無いカードには当てはめない**（C-102 の決定(4)。
	 * 印が無いまま charaName で引くと、グループのカードに代表者1人ぶんだけが当たってしまう）。
	 */
	function charactersOfCard(card) {
		if (!card || typeof card.isGroup !== 'boolean') return [];
		if (card.isGroup) return Array.isArray(card.groupMembers) ? card.groupMembers.slice() : [];
		return card.charaName ? [card.charaName] : [];
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

	/**
	 * **検索に出してよい拡張スキルの id の一覧**（2026-09-25・C-91。おいもさんの決定）。
	 *
	 * 拡張スキルのうち、**マスター445件と同じ独自カテゴリに当たるもの**だけ。それ以外の拡張スキルは
	 * 今後の機能拡張のために収録しているもので、いまの検索（条件で検索・緑スキルを追加・テキストで検索・
	 * 名前を入れて探す）には出さない。一覧はスキルの正本の独自カテゴリから作ったもの
	 * （元の一覧は7件）。**カテゴリの判断はここでしない**（id を持つだけ）。
	 *
	 * **外すのは検索だけ。** 次の経路はこの一覧を見ない（全件のまま）:
	 *   - `findSkill()`（保存済みのセット・テンプレートの id の解決）
	 *   - 編成の「この編成で得られるスキル」（`computeRosterSkills()`。C-51・C-81）
	 *   - `isReferableSkillId()`（収録データの入力ページでの選択。C-82）
	 *   - `findSkillsByNameFragment()` / `matchPastedSkillText()` の既定の呼び方
	 *     （収録データの入力ページと、Deck の OCR の受け取り口が使う。検索のモーダルだけが `searchableOnly` を渡す）
	 */
	const SEARCHABLE_EXTENDED_SKILL_IDS = new Set([
		'ex-0521', 'ex-0531', 'ex-0533', 'ex-0669', 'ex-0691', 'ex-0968', 'ex-0969'
	]);

	/** 追加カタログの行を、検索（条件で検索・緑スキル・テキストで検索・名前を入れて探す）に出してよいか。 */
	function isSearchableCatalogEntry(x) {
		return x.category !== REFERABLE_CATALOG_CATEGORY || SEARCHABLE_EXTENDED_SKILL_IDS.has(x.id);
	}

	/* ============================================================
	 * シナリオの固定イベント（段7c の N・2026-10-03）
	 *
	 * ゲーム内で確認できるシナリオの固定イベントで得られるスキルとヒントレベル（data/scenario-event-skills.json）。
	 * **編成パネルを作るときにだけ読む**（ほかのページの読み込みでは取りに行かない）。各イベントを、カードのイベントと同じ
	 * 「回 → 選択肢 → 成功側」の形（chain）に直して、既存の計算（eventRowOccurrences など）に載せる。
	 * 選択肢の成功側は編成を見て決める（charaNames を持つ選択肢は、そのキャラクターが編成にいれば linked、いなければ unlinked）。
	 * メンバーのキーは 'scenario'（表の7列目）。シナリオ名・スキル名・キャラクター名はコードに書かない（データから読む）。
	 * ============================================================ */
	const SCENARIO_EVENT_PATH = 'data/scenario-event-skills.json';
	const SCENARIO_KEY = 'scenario';
	let scenarioEventState = { status: 'idle', doc: null, promise: null };   // idle／loading／ok／failed／absent

	/** 読み込める形か（最小限。細かい形は check:catalog が固める）。使うシナリオは先頭の1件。 */
	function scenarioEntryOf(doc) {
		const e = doc && Array.isArray(doc.entries) ? doc.entries[0] : null;
		return (e && typeof e.scenario === 'string' && e.scenario && Array.isArray(e.events)) ? e : null;
	}
	function loadScenarioEvents(forceRefresh) {
		if (!DATA_JSON_VERSIONS[SCENARIO_EVENT_PATH]) { scenarioEventState = { status: 'absent', doc: null, promise: null }; return Promise.resolve('absent'); }
		if (scenarioEventState.status === 'ok' || scenarioEventState.status === 'loading') return scenarioEventState.promise;
		const st = { status: 'loading', doc: null, promise: null };
		scenarioEventState = st;
		st.promise = (async () => {
			try {
				const doc = await fetchMasterJson(withDataVersion(SCENARIO_EVENT_PATH), !!forceRefresh);
				st.doc = scenarioEntryOf(doc) ? doc : null;
				st.status = st.doc ? 'ok' : 'failed';
			} catch (e) { st.status = 'failed'; }
			return st.status;
		})();
		return st.promise;
	}
	/** 編成にいるキャラクターの名前（育成ウマ娘の charaName と、サポートカードのキャラクター。グループのカードはメンバー全員） */
	function rosterCharaNames(r) {
		const names = new Set();
		const uma = r && r.umaId ? findUma(r.umaId) : null;
		if (uma && uma.charaName) names.add(uma.charaName);
		((r && r.cardIds) || []).forEach(id => { if (id) charactersOfCard(findCard(id)).forEach(n => names.add(n)); });
		return names;
	}
	/**
	 * シナリオのイベントを、カードのイベントの行と同じ形（{ status:'done', chain:[…] }）に直す。編成にいるキャラクターの名前（Set）を見て、
	 * charaNames を持つ選択肢の成功側を linked／unlinked から決める。返り値は { name, row, events }（events は画面用の並び）。データが無ければ null。
	 */
	function scenarioRowFor(charaNames) {
		const entry = scenarioEventState.status === 'ok' ? scenarioEntryOf(scenarioEventState.doc) : null;
		if (!entry) return null;
		const refOf = (x) => ({ skillId: x.skillId, name: (findSkill(x.skillId) || {}).name || '', hintLevel: x.hintLevel });
		const events = [];
		const chain = entry.events.map((ev, idx) => {
			if (ev.type === 'fixed') {
				const skills = (ev.skills || []).map(refOf);
				events.push({ index: idx, type: 'fixed', name: ev.name || '', when: ev.when || null, eventKey: 'scenario:' + entry.scenario + '#' + idx, skills: skills });
				return { name: ev.name, when: ev.when, choices: [{ skills: skills }] };
			}
			events.push({ index: idx, type: 'choice', name: ev.name || '', when: ev.when || null, eventKey: 'scenario:' + entry.scenario + '#' + idx });
			return { name: ev.name, when: ev.when, choices: (ev.choices || []).map(c => {
				if (Array.isArray(c.charaNames)) {
					const linked = c.charaNames.some(n => charaNames.has(n));
					return { label: c.label, state: linked ? 'linked' : 'unlinked', skills: ((linked ? c.linked : c.unlinked) || []).map(refOf) };
				}
				return { label: c.label, skills: (c.skills || []).map(refOf) };
			}) };
		});
		return { name: entry.scenario, row: { status: 'done', chain: chain }, events: events };
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
	 * サポートカードの種類。**値も並び順もデータに従う** ――
	 * 種類の名前も番号もこのファイルに書かない（恒久ルール1の精神）。
	 *
	 * **並びは `typeOrder`（ゲーム内で扱われる順番）の昇順。** データの行の並びは
	 * ゲーム内の順番と一致していないので、出てきた順に並べると画面の並びが入れ替わる。
	 *
	 * `typeOrder` を持たない行は**いちばん後ろ**に回し、その中ではデータに出てきた順を保つ
	 * （番号が無いだけで種類はあるので、落とさずに選べるようにしておく）。
	 * データにまだ `type` が無ければ空配列を返し、呼び出し側は絞り込みを出さない。
	 */
	function listCardTypes() {
		const seen = new Map();   // type → { order, seq }
		listCards().forEach((c, i) => {
			const t = c && c.type;
			if (!t || seen.has(t)) return;
			const n = c.typeOrder;
			seen.set(t, { order: (typeof n === 'number' && isFinite(n)) ? n : Infinity, seq: i });
		});
		return Array.from(seen.keys())
			.sort((a, b) => (seen.get(a).order - seen.get(b).order) || (seen.get(a).seq - seen.get(b).seq));
	}
	function cardTypeOf(card) { return (card && card.type) || ''; }
	/** 種類の順番の番号（1〜）。無ければ null。色はこの番号で `--uma-card-type-<番号>-*` から引く（C-51 の11節）。 */
	function cardTypeOrderOf(card) {
		const n = card && card.typeOrder;
		return (typeof n === 'number' && isFinite(n) && n >= 1) ? n : null;
	}
	/**
	 * 種類の名前 → 種類の順番の番号（C-62 の (1)(2)）。**種類の名前はここにも書かない** ――
	 * データにある名前をそのままキーにして、色は番号で引く。番号を持たない種類は入れない
	 * （呼び出し側は「色が無い」として既定の面に落とす）。
	 */
	function cardTypeOrderByName() {
		const m = new Map();
		listCards().forEach((c) => {
			const t = c && c.type;
			if (!t || m.has(t)) return;
			const n = cardTypeOrderOf(c);
			if (n !== null) m.set(t, n);
		});
		return m;
	}
	/**
	 * 種類の色を、番号で CSS 変数へ流し込む宣言（C-51 の11節⑫ → C-62 で1か所にまとめた）。
	 * 定義の無い番号は fallback（既定の面）に落ちる。使う側は `--usd-card-*` を読む。
	 */
	function cardTypeColorVars(n) {
		return '--usd-card-bg: var(--uma-card-type-' + n + '-bg, var(--uma-surface));'
			+ '--usd-card-border: var(--uma-card-type-' + n + '-border, var(--uma-border));'
			+ '--usd-card-text: var(--uma-card-type-' + n + '-text, var(--uma-text-heading));';
	}

	/** そのウマ娘で選べる★（initialSkills のしきい値）。データが無ければ空。 */
	function starChoicesOf(uma) {
		const rows = (uma && uma.initialSkills) || [];
		return rows.map(r => r.minStar).filter(n => typeof n === 'number').sort((a, b) => a - b);
	}
	/**
	 * 初期スキルとして使う行（C-51 の修正）。**★は3で固定**し、
	 * `minStar` が 3 以下の行のうち最大のものを採る。3以下の行が1つも無ければ、
	 * そのウマ娘の `minStar` の最大の行（＝いちばん上の★の行）を採る。
	 * 各行はその★での「全部」であって差分ではない（C-48）。
	 */
	const ROSTER_FIXED_STAR = 3;
	function initialRowOf(uma) {
		const rows = ((uma && uma.initialSkills) || []).filter(x => typeof x.minStar === 'number');
		if (rows.length === 0) return null;
		const within = rows.filter(x => x.minStar <= ROSTER_FIXED_STAR);
		const pool = within.length > 0 ? within : rows;
		return pool.reduce((best, x) => (best === null || x.minStar > best.minStar ? x : best), null);
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
	 *   skillIds        … 得られると分かっているスキルのID（重複なし）。**●のものだけ**（C-102）
	 *   items           … [{ skillId, name, origins: [由来の文言], members: [key], sureMembers: [key], sure }]（表示用）。
	 *                     △（イベントの選択肢しだいのもの）も含む。sure は●か（どこか1つでも●なら●）、
	 *                     sureMembers は●で得られるメンバー（members のうち sureMembers に無いものは△）
	 *   members         … [{ key, kind, no, label, typeOrder }] 編成の並び順（凡例・★取り表の列）。
	 *                     key は並びの位置（0＝育成ウマ娘、1〜＝カードの枠）。kind は 'uma' | 'card'。
	 *                     no は画面に出す番号で、育成ウマ娘は null（★で示す）、カードは枠の順に 1〜。
	 *                     空いている枠は label が null。typeOrder はカードの種類の順番（無ければ null）
	 *   unconfirmed     … [{ cardId, label, what }] まだ調べていないもの
	 *   missing         … [{ kind, id }] id を引けなかったもの（行は消さずに知らせる）
 *   sources         … 由来を**機械が読める形**で並べたもの（段2・スキルPt の計算が使う。items の origins は表示用の文字列）。
 *                     [{ skillId, kind, sure, memberKey, hintLevel, eventKey, part }]
 *                     kind は 'hint'（練習のヒント）| 'event'（カードの連続イベント）| 'scenarioEvent'（シナリオの固定イベント。段7c）| 'commonEvent'（キャラクター共通のイベント）| 'uma'（育成ウマ娘の初期・覚醒）。
 *                     hintLevel はイベントだけが持つ（そのイベントごとの数。持たないものは null）。
 *                     eventKey はイベントの識別（同じイベントの中の複数の選択肢は、出現1つにまとめてある）。ほかの kind は null。
 *                     part は 'uma' のときだけ 'initial' | 'awakening'。引けなかったスキルは載せない（missing に出る）
	 *
	 * **番号は編成の並び順で機械的に振る**（育成ウマ娘は★、サポートカードが枠の順に 1〜6。
	 * C-51 の11節で「1〜7」から変えた）。名前も番号もコードに書かない（恒久ルール1）。
	 *
	 * **未確認のものは得られる側に入れない。** 除外しすぎて対象スキルセットから
	 * 必要なスキルが落ちるほうが痛いので、「得られると分かっているもの」だけを返す。
	 * イベントの選択肢しだいのもの（△。C-102）は items に入れて表に出すが、skillIds には入れない。
	 */
	function computeRosterSkills(roster, opts) {
		const o = opts || {};
		// イベントの選択（段7の (19)）。eventChoices は編成に保存した { eventKey: 選択肢の位置 }、autoChoose は既定を決めるか、
		// isWanted は絞り込みの述語（既定の判断にだけ使う。行の絞り込みは呼び出し側）。渡さなければ従来どおり（選択なし）
		const evOpts = { choices: (o.eventChoices && typeof o.eventChoices === 'object') ? o.eventChoices : {}, autoChoose: !!o.autoChoose,
			isWanted: typeof o.isWanted === 'function' ? o.isWanted : null };
		const events = [];           // 選べるイベント（段7の (19)。列見出しの▼から開く小窓が使う）
		const items = new Map();   // skillId → { skillId, name, origins: [], members: [], sureMembers: [], sure }
		const sources = [];        // 由来を機械が読める形で（段2）
		const unconfirmed = [];
		const missing = [];
		const members = [];
		// sure は省略すると●（ヒント・初期・覚醒は必ず得られる）。△はイベントの選択肢しだいのものだけ
		const add = (ref, origin, memberKey, sure, src) => {
			if (!ref || !ref.skillId) return;
			const sk = findSkill(ref.skillId);
			if (!sk) { missing.push({ kind: 'skill', id: ref.skillId }); return; }
			const isSure = sure !== false;
			// src を渡された呼び出し（練習のヒント・育成ウマ娘）だけ、由来を1件足す（イベントは下の pushOccurrences）
			if (src) sources.push(Object.assign({ skillId: ref.skillId, sure: isSure, memberKey: memberKey, hintLevel: null, eventKey: null, part: null }, src));
			const cur = items.get(ref.skillId) || { skillId: ref.skillId, name: sk.name, origins: [], members: [], sureMembers: [], sure: false };
			if (cur.origins.indexOf(origin) === -1) cur.origins.push(origin);
			if (cur.members.indexOf(memberKey) === -1) cur.members.push(memberKey);
			if (isSure && cur.sureMembers.indexOf(memberKey) === -1) cur.sureMembers.push(memberKey);
			if (isSure) cur.sure = true;
			items.set(ref.skillId, cur);
		};

		// イベントの出現（イベントごと）を由来へ足す。引けないスキルは載せない（items 側の add が missing に出す）
		const pushOccurrences = (list, kind, memberKey) => list.forEach(o => {
			if (!findSkill(o.skillId)) return;
			sources.push({ skillId: o.skillId, kind: kind, sure: !!o.sure, memberKey: memberKey, hintLevel: o.hintLevel, eventKey: o.eventKey, part: null });
		});

		const r = roster || {};
		// ── 育成ウマ娘（並びの先頭。番号ではなく★で示す） ──
		const UMA_KEY = 0;
		let umaLabel = null;
		let umaShort = null;
		if (r.umaId) {
			const uma = findUma(r.umaId);
			if (!uma) { missing.push({ kind: 'uma', id: r.umaId }); umaLabel = umaShort = '（読み込めません：' + r.umaId + '）'; }
			else {
				umaLabel = formatEntryLabel(uma);
				umaShort = formatEntryShortLabel(uma);
				// ★と覚醒レベルは**固定**（C-51 の修正）。実用上は★3以上・覚醒最大で使うので、
				// 選ばせる UI を削って認知負荷を下げた。保存済みの roster.star / awakeningLevel は
				// ここでは**読まない**（画面から変えられないものを判定に混ぜない）。
				const use = initialRowOf(uma);
				if (use) (use.skills || []).forEach(s => add(s, '初期（★' + use.minStar + '）', UMA_KEY, undefined, { kind: 'uma', part: 'initial' }));
				// 覚醒スキル: level 0 は「覚醒のレベルに紐づかない枠」なので**常に含める**
				// （画面では「最初から」と出す）。それ以外は、そのウマ娘の最大レベルまで全部。
				const maxLv = maxAwakeningLevelOf(uma);
				(uma.awakeningSkills || []).forEach(row => {
					if (row.level === 0) (row.skills || []).forEach(s => add(s, '最初から', UMA_KEY, undefined, { kind: 'uma', part: 'awakening' }));
					else if (typeof row.level === 'number' && row.level <= maxLv) {
						(row.skills || []).forEach(s => add(s, '覚醒 Lv' + row.level, UMA_KEY, undefined, { kind: 'uma', part: 'awakening' }));
					}
				});
			}
		}
		members.push({ key: UMA_KEY, kind: 'uma', no: null, label: umaLabel, shortLabel: umaShort, typeOrder: null });
		// ── サポートカード（番号 1〜。枠の順） ──
		const cardIds = (r.cardIds || []).slice(0, ROSTER_CARD_SLOTS);
		while (cardIds.length < ROSTER_CARD_SLOTS) cardIds.push(null);
		cardIds.forEach((cardId, i) => {
			const key = UMA_KEY + 1 + i;
			const no = i + 1;
			if (!cardId) { members.push({ key: key, kind: 'card', no: no, label: null, shortLabel: null, typeOrder: null }); return; }
			const card = findCard(cardId);
			if (!card) {
				missing.push({ kind: 'card', id: cardId });
				members.push({ key: key, kind: 'card', no: no, label: '（読み込めません：' + cardId + '）', shortLabel: '（読み込めません）', typeOrder: null });
				return;
			}
			const label = formatEntryLabel(card);
			members.push({ key: key, kind: 'card', no: no, label: label, shortLabel: formatEntryShortLabel(card), typeOrder: cardTypeOrderOf(card) });
			const hintStatus = (card.dataStatus && card.dataStatus.hint) || 'pending';
			if (hintStatus === 'done') (card.hintSkills || []).forEach(s => add(s, label + ' のヒント', key, undefined, { kind: 'hint' }));
			else if (hintStatus === 'pending') unconfirmed.push({ cardId: cardId, label: label, what: 'ヒント' });

			const evStatus = eventStatusOf(cardId);
			if (evStatus === 'pending') unconfirmed.push({ cardId: cardId, label: label, what: 'イベント' });
			else {
				const cardEv = Object.assign({}, evOpts, { keyBase: 'card:' + cardId });
				getEventSkillsOf(cardId, cardEv).forEach(s => add(s, label + ' のイベント' + (s.sure ? '' : '（確定でない）'), key, s.sure));
				pushOccurrences(getEventOccurrencesOf(cardId, evOpts), 'event', key);
				eventRowChoiceEvents(findEventRow(cardId), 'chain', 'card:' + cardId, evOpts).forEach(e => events.push(Object.assign({ memberKey: key, kind: 'event', cardId: cardId, charaName: null }, e)));
			}

			// キャラクター共通のイベント（C-102 の区切り3）。そのカードの列に出す。同じキャラクターが
			// 2枚のカードから当たっても、スキルは items の1行（skillId が鍵）で、印が両方の列に付く。
			charactersOfCard(card).forEach(name => {
				if (characterEventStatusOf(name) === 'pending') {
					unconfirmed.push({ cardId: cardId, label: label, what: '共通イベント（' + name + '）' });
					return;
				}
				getCharacterEventSkillsOf(name, evOpts).forEach(s =>
					add(s, label + ' の共通イベント（' + name + '）' + (s.sure ? '' : '（確定でない）'), key, s.sure));
				pushOccurrences(getCharacterEventOccurrencesOf(name, evOpts), 'commonEvent', key);
				eventRowChoiceEvents(findCharacterEventRow(name), 'events', 'chara:' + name, evOpts).forEach(e => events.push(Object.assign({ memberKey: key, kind: 'commonEvent', cardId: cardId, charaName: name }, e)));
			});
		});

		// ── シナリオの固定イベント（段7c の N。表の7列目 'scenario'）。編成が空でないときだけ。データが読めていなければ列ごと出さない ──
		let scenario = null;
		if (r.umaId || cardIds.some(Boolean)) {
			const scen = scenarioRowFor(rosterCharaNames(r));
			if (scen) {
				const base = 'scenario:' + scen.name;
				const label = 'シナリオ『' + scen.name + '』';
				members.push({ key: SCENARIO_KEY, kind: 'scenario', no: null, label: label, shortLabel: scen.name, typeOrder: null, scenarioName: scen.name });
				const scenOpts = Object.assign({}, evOpts, { keyBase: base });
				eventRowSkills(scen.row, 'chain', scenOpts).forEach(sk => add(sk, label + ' のイベント' + (sk.sure ? '' : '（確定でない）'), SCENARIO_KEY, sk.sure));
				pushOccurrences(eventRowOccurrences(scen.row, 'chain', base, evOpts), 'scenarioEvent', SCENARIO_KEY);
				eventRowChoiceEvents(scen.row, 'chain', base, evOpts).forEach(e => events.push(Object.assign({ memberKey: SCENARIO_KEY, kind: 'scenarioEvent', cardId: null, charaName: null }, e)));
				scenario = { key: SCENARIO_KEY, name: scen.name, label: label, events: scen.events };
			}
		}

		const list = Array.from(items.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
		return { skillIds: list.filter(x => x.sure).map(x => x.skillId), items: list, members: members, unconfirmed: unconfirmed, missing: missing, sources: sources, events: events, scenario: scenario };
	}

	/* ============================================================
	 * スキルPt の計算（段1・2026-09-30。設計は skill-pt-calculation-step0.md 第4版）
	 *
	 * **画面を持たない。** 純粋関数と、データの受け取り口だけ（画面は段3 以降）。
	 * **DOM・保存・special を知らない**ので、単体で検査できる（tests/visual/run-smoke.mjs の塊が関数を直に呼ぶ）。
	 * **スキル名も記号（○・◎）の規則も書かない**（恒久ルール1）。系列は前段データ（skill-step-up.json）の
	 * `hintRootSkillId` で持ち、Pt が0の固有スキルは skill-pt.json の `pt: 0` で表す。
	 *
	 * 決まり（Step 0 の 2-1・2-2。おいもさん確認済み）:
	 *   - 支払うPt = floor( 基礎値 × (100 − 割引率) ÷ 100 )。**割引率は整数の百分率**で持ち、**整数だけで計算する**
	 *     （浮動小数点で `基礎値 * (1 - 0.3)` と書くと、基礎90・Lv3 が 62 になる。正しくは 63）。
	 *     **1件ごとに丸めてから足す**。丸めの向きは data/skill-pt-rules.json の `rounding`（切り捨てで確定）の1か所。
	 *   - 割引率 = ヒントの割引率[L] ＋ 状態の割引率（なし0／勉強家4／切れ者10。**排他**）
	 *   - L = min(上限5, P + E + T + U + F)。**L の持ち主は系列の根だけ**（◎は根の○の L を援用する。金は自分が根）
	 *       P 練習のヒント … 5 ／ E イベント … ●で出るイベントごとの hintLevel の合計（同じイベントの中の重なりは最大の1つ）
	 *       T 有効にした△ … 出てくるイベントのうち最大のレベルを1回ぶん（段4 で使う）
	 *       U 育成ウマ娘 … 既定3（覚醒 Lv7 のウマ娘で Lv5 を選んだら5）／ F 親（因子）由来 … 既定5（段5 で使う）
	 * **前段を必要Ptに含める処理は入れていない**（段4b）。
	 * ============================================================ */
	const SKILL_PT_RULES_PATH = 'data/skill-pt-rules.json';
	// 実ファイルが届くまでは DATA_JSON_VERSIONS に載せない（＝取りに行かない。404 を出さない）。
	// 届いたら、DATA_JSON_VERSIONS に足すだけで読まれる（受け取り口は下の loadSkillPtData）。
	const SKILL_PT_OPTIONAL_SOURCES = [
		{ key: 'skillPt', path: 'data/skill-pt.json' },
		{ key: 'skillStepUp', path: 'data/skill-step-up.json' }
	];
	const SKILL_PT_ROUNDING_MODES = ['floor', 'round', 'ceil'];

	function isNonNegInt(n) { return typeof n === 'number' && Number.isInteger(n) && n >= 0; }

	function emptySkillPtData() {
		return {
			rules: null,        // data/skill-pt-rules.json（読めなければ null）
			skillPt: null,      // Map(skillId → { pt, rarity })。ファイルが無い間は null（＝全部「Pt 未収録」）
			stepUp: null,       // 前段データの索引（buildStepUpIndex）。ファイルが無い間は null（＝各スキルが自分自身を根とする）
			meta: { loaded: false, rules: 'absent', skillPt: 'absent', stepUp: 'absent' }
		};
	}
	let skillPtData = emptySkillPtData();

	/** 割引率の表（skill-pt-rules.json）として使える形か。使えなければ計算しない（既定値で黙って続けない）。 */
	function isValidSkillPtRules(r) {
		if (!r || typeof r !== 'object') return false;
		if (!isNonNegInt(r.hintLevelMax) || r.hintLevelMax < 1) return false;
		if (!Array.isArray(r.hintDiscountPercent) || r.hintDiscountPercent.length !== r.hintLevelMax) return false;
		if (!r.hintDiscountPercent.every(p => isNonNegInt(p) && p <= 100)) return false;
		if (!Array.isArray(r.statuses) || r.statuses.length === 0) return false;
		if (!r.statuses.every(s => s && typeof s.id === 'string' && isNonNegInt(s.percent) && s.percent <= 100)) return false;
		if (SKILL_PT_ROUNDING_MODES.indexOf(r.rounding) === -1) return false;
		return isNonNegInt(r.practiceHintLevel) && isNonNegInt(r.umaHintLevelDefault) && isNonNegInt(r.parentHintLevelDefault);
	}

	/** ヒントレベル L の割引率（％）。L が0以下なら0、上限を超えたら上限。 */
	function hintDiscountPercentOf(level, rules) {
		const L = Math.min(Math.max(Math.trunc(Number(level) || 0), 0), rules.hintLevelMax);
		return L <= 0 ? 0 : rules.hintDiscountPercent[L - 1];
	}

	/** 状態の割引率（％）。「なし」・未指定は0。**知らない状態は null**（呼び出し側が気づけるように。黙って0にしない）。 */
	function statusPercentOf(statusId, rules) {
		if (statusId === undefined || statusId === null || statusId === '') return 0;
		const s = rules.statuses.find(x => x.id === statusId);
		return s ? s.percent : null;
	}

	/** n（0以上の整数）÷100 を、rounding の向きで整数にする。**整数だけで計算する**（浮動小数点の誤差を持ち込まない）。 */
	function divideBy100(n, rounding) {
		const rest = n % 100;
		const q = (n - rest) / 100;
		if (rounding === 'ceil') return rest > 0 ? q + 1 : q;
		if (rounding === 'round') return rest >= 50 ? q + 1 : q;
		return q;   // floor
	}

	/**
	 * 1件のスキルの、支払うPt。**基礎値は0以上の整数**（そうでなければ例外。黙って丸めない）。
	 * 割引率が100％を超えるときは100％で止める。状態が知らない値のときは「なし」として計算する
	 * （知らない状態かどうかは statusPercentOf が null で教える）。
	 */
	function computeSkillPt(base, hintLevel, statusId, rules) {
		if (!isNonNegInt(base)) throw new TypeError('基礎値は0以上の整数');
		const percent = Math.min(100, hintDiscountPercentOf(hintLevel, rules) + (statusPercentOf(statusId, rules) || 0));
		return divideBy100(base * (100 - percent), rules.rounding);
	}

	/**
	 * ヒントレベル L（上限つき）。parts は { practice: 真偽, eventLevels: [数…], enabledLevel: 数, umaLevel: 数, parentLevel: 数 }。
	 * 数でないもの・負の数は0として足す。
	 */
	function sumHintLevel(parts, rules) {
		const p = parts || {};
		const n = (v) => (isNonNegInt(v) ? v : 0);
		let sum = p.practice ? rules.practiceHintLevel : 0;
		(p.eventLevels || []).forEach(v => { sum += n(v); });
		sum += n(p.enabledLevel) + n(p.umaLevel) + n(p.parentLevel);
		return Math.min(rules.hintLevelMax, sum);
	}

	/** 育成ウマ娘の初期・覚醒スキルに当てるレベルの選択肢。覚醒 Lv の最大が閾値以上のウマ娘だけ、上のレベルも選べる。 */
	function umaHintLevelChoices(maxAwakeningLevel, rules) {
		const out = [rules.umaHintLevelDefault];
		if (isNonNegInt(rules.umaHintLevelChoice) && isNonNegInt(rules.umaHintLevelChoiceMinAwakening)
			&& maxAwakeningLevel >= rules.umaHintLevelChoiceMinAwakening && out.indexOf(rules.umaHintLevelChoice) === -1) {
			out.push(rules.umaHintLevelChoice);
		}
		return out;
	}

	/** skill-pt.json → Map(skillId → { pt, rarity })。形の悪い行は飛ばす（検査は check:catalog が持つ）。 */
	function buildSkillPtIndex(doc) {
		const map = new Map();
		((doc && doc.entries) || []).forEach(e => {
			if (e && typeof e.skillId === 'string' && isNonNegInt(e.pt)) map.set(e.skillId, { pt: e.pt, rarity: e.rarity });
		});
		return map;
	}

	/**
	 * skill-step-up.json → 索引。`rootOf(skillId)` はヒントレベルの持ち主（最下位の○）の id で、
	 * 行が無い・`hintRootSkillId` が無いスキルは**自分自身**。`prevOf(skillId)` は直前のスキルの配列（段4b が使う）。
	 */
	function buildStepUpIndex(doc) {
		const roots = new Map();
		const prevs = new Map();
		const nexts = new Map();   // 直前のスキル → それを前段に持つスキル（段6の「系列」の表示が使う）
		((doc && doc.entries) || []).forEach(e => {
			if (!e || typeof e.skillId !== 'string') return;
			if (typeof e.hintRootSkillId === 'string' && e.hintRootSkillId) roots.set(e.skillId, e.hintRootSkillId);
			if (Array.isArray(e.prevSkillIds)) {
				const list = e.prevSkillIds.filter(x => typeof x === 'string');
				prevs.set(e.skillId, list);
				list.forEach(p => { if (!nexts.has(p)) nexts.set(p, []); if (nexts.get(p).indexOf(e.skillId) === -1) nexts.get(p).push(e.skillId); });
			}
		});
		return {
			rootOf: (skillId) => roots.get(skillId) || skillId,
			prevOf: (skillId) => (prevs.get(skillId) || []).slice(),
			nextOf: (skillId) => (nexts.get(skillId) || []).slice()
		};
	}

	/**
	 * スキルPt の元データを読む（起動時には読まない。必要な画面が呼ぶ）。
	 * 割引率の表は必ず取りに行く。**skill-pt.json・skill-step-up.json は DATA_JSON_VERSIONS に載っているときだけ**取りに行き、
	 * 載っていなければ「未収録」として扱う（無くても動く）。読めなかったものは meta に残し、そのキーは空のまま返す。
	 */
	async function loadSkillPtData(forceRefresh) {
		const next = emptySkillPtData();
		try {
			const doc = await fetchMasterJson(withDataVersion(SKILL_PT_RULES_PATH), !!forceRefresh);
			if (isValidSkillPtRules(doc)) { next.rules = doc; next.meta.rules = 'ok'; }
			else next.meta.rules = 'invalid';
		} catch (e) { next.meta.rules = 'failed'; }
		for (let i = 0; i < SKILL_PT_OPTIONAL_SOURCES.length; i++) {
			const src = SKILL_PT_OPTIONAL_SOURCES[i];
			if (!DATA_JSON_VERSIONS[src.path]) continue;   // 実ファイルが届くまでは取りに行かない
			try {
				const doc = await fetchMasterJson(withDataVersion(src.path), !!forceRefresh);
				if (src.key === 'skillPt') next.skillPt = buildSkillPtIndex(doc);
				else next.stepUp = buildStepUpIndex(doc);
				next.meta[src.key === 'skillPt' ? 'skillPt' : 'stepUp'] = 'ok';   // meta のキーは emptySkillPtData() の rules・skillPt・stepUp（以前は skillStepUp で書いて stepUp が 'absent' のままだった）
			} catch (e) { next.meta[src.key === 'skillPt' ? 'skillPt' : 'stepUp'] = 'failed'; }
		}
		next.meta.loaded = true;
		skillPtData = next;
		skillPtLoadListeners.forEach(fn => { try { fn(); } catch (e) { if (global.console) global.console.error('[UmaSkillDeckCore] スキルPt の読み込み後の更新で例外', e); } });
		if (next.meta.rules !== 'ok') {
			try { global.console.warn('[UmaSkillDeck] スキルPt の割引率の表を読み込めませんでした（' + next.meta.rules + '）。'); } catch (e) {}
		}
		return next.meta;
	}

	/**
	 * 本育成のスキルごとのPt・由来別の小計・合計。**前段は含めない**（段4b）。
	 *
	 * args:
	 *   sources          … computeRosterSkills(roster).sources
	 *   rules            … skill-pt-rules.json（isValidSkillPtRules を通るもの。通らなければ { ok:false }）
	 *   skillPt          … Map(skillId → { pt, rarity })。無ければ null（＝全部「Pt 未収録」）
	 *   stepUp           … buildStepUpIndex の結果。無ければ null（＝各スキルが自分自身を根とする）
	 *   statusId         … 'none'|'benkyo'|'kire'（rules.statuses の id）。既定は「なし」
	 *   umaHintLevel     … 育成ウマ娘の初期・覚醒スキルのレベル。既定は rules.umaHintLevelDefault
	 *   enabledSkillIds  … 有効にした△のスキルid（段4 で使う。既定は空）
	 *   parentHintLevels … { skillId: 親（因子）由来のレベル }（段5 で使う。既定は空）
	 *   offSkillIds      … 本育成で「取得しない」にしたスキルの id（段7c の M。既定は空）。**そのスキルは数えない**
	 *                      （items・合計・小計・未収録の件数に入らず、そのスキルを取るための前段も数えない）。
	 *                      **イベントのヒントレベルへの寄与（E・T）は変えない**（イベントは起きるので、系列の根の L は変わらない）。
	 *                      ほかのスキルのための前段としては数える。因子セットにあるスキルなら、親から得るので数える（L は親由来 F ＋ 本育成の由来）
	 *
	 * 「本育成のスキル」＝●（sure）のスキル ＋ 有効にした△。**Pt が未収録（skillPt に行が無い）のスキルは合計に入れず、
	 * unpriced に出す**（0として足さない）。固有スキルなどのPt不要は、データの `pt: 0` で表す（合計には0が足される）。
	 * 返り値の items は最初に出てきた順。subtotals は、スキルごとの「主な由来」（練習のヒント＞イベント＞育成ウマ娘＞親）で分けた小計。
	 */
	function computeRosterPt(args) {
		const a = args || {};
		const rules = a.rules;
		if (!isValidSkillPtRules(rules)) return { ok: false, reason: 'rules' };
		const rootOf = (a.stepUp && typeof a.stepUp.rootOf === 'function') ? a.stepUp.rootOf : (id => id);
		const ptIndex = a.skillPt instanceof Map ? a.skillPt : null;
		const enabled = new Set(a.enabledSkillIds || []);
		const parentLevels = a.parentHintLevels || {};
		const off = new Set(a.offSkillIds || []);
		const umaLevel = a.umaHintLevel !== undefined && a.umaHintLevel !== null ? a.umaHintLevel : rules.umaHintLevelDefault;
		const statusId = a.statusId;

		// 1. スキルごとに由来をまとめる（出てきた順）
		const bySkill = new Map();
		(a.sources || []).forEach(src => {
			if (!src || !src.skillId) return;
			const e = bySkill.get(src.skillId) || { skillId: src.skillId, sure: false, list: [] };
			e.list.push(src);
			if (src.sure) e.sure = true;
			bySkill.set(src.skillId, e);
		});
		// 親（因子）だけにあるスキル（段5。周回因子セットのスキルのうち、本育成には無いもの）。由来は親だけ＝L は F
		// 本育成の△にだけ出てくる（有効にしていない）スキルが因子セットにあるときも、親から得るので数える（その△の出現は L に効かない）
		Object.keys(parentLevels).forEach(id => {
			if (!(isNonNegInt(parentLevels[id]) && parentLevels[id] > 0)) return;
			const cur = bySkill.get(id);
			if (!cur) bySkill.set(id, { skillId: id, sure: false, parentOnly: true, list: [] });
			else if (!cur.sure || off.has(id)) cur.parentOnly = true;   // 取得しないにした●も、因子セットにあれば親から得る（段7c の M）
		});
		// contributors … 系列の根の L に寄与するスキル（取得しないにしたスキルも含む。イベントは起きるので E・T は変えない）。
		// included … 実際に数えるスキル（取得しないにしたスキルを除く。因子セットにあって親から得るものは数える）
		const contributors = Array.from(bySkill.values()).filter(e => e.sure || e.parentOnly || enabled.has(e.skillId));
		const included = contributors.filter(e => !off.has(e.skillId) || e.parentOnly);

		// 2. 系列の根ごとに、P・E・T・U・F を集める（根に集約する）
		const roots = new Map();
		const rootEntry = (rootId) => {
			if (!roots.has(rootId)) roots.set(rootId, { practice: false, uma: false, events: new Map(), enabledLevel: 0, parentLevel: 0 });
			return roots.get(rootId);
		};
		let unknownLevelCount = 0;
		const unknownSkillIds = new Set();   // ヒントレベルが不明（hintLevel が無い）出現を数えに入れたスキル（段4。画面が「Lv0 として計算」と知らせる）
		contributors.forEach(e => {
			const r = rootEntry(rootOf(e.skillId));
			let tMax = -1;
			e.list.forEach(src => {
				if (src.kind === 'hint') { if (src.sure) r.practice = true; return; }
				if (src.kind === 'uma') { if (src.sure) r.uma = true; return; }
				// イベント（連続イベント・共通イベント）
				const lv = isNonNegInt(src.hintLevel) ? src.hintLevel : null;
				if (src.sure) {
					// E: 同じイベントの中の重なりは、最大の1つにまとめる（イベントの識別 eventKey ごと）
					const k = String(src.eventKey);
					if (lv === null && !off.has(e.skillId)) { unknownLevelCount++; unknownSkillIds.add(e.skillId); }
					const cur = r.events.get(k);
					r.events.set(k, Math.max(cur === undefined ? 0 : cur, lv === null ? 0 : lv));
				} else if (enabled.has(e.skillId)) {
					// T: 有効にした△は、出てくるイベントのうち最大のレベルを1回ぶん（レベルが無い△は Lv0 として足す）
					if (lv === null) { unknownLevelCount++; unknownSkillIds.add(e.skillId); }
					tMax = Math.max(tMax, lv === null ? 0 : lv);
				}
			});
			if (tMax > 0) r.enabledLevel += tMax;
			const f = parentLevels[e.skillId];
			if (isNonNegInt(f)) r.parentLevel = Math.max(r.parentLevel, f);
		});

		// 3. スキルごとのPt
		const items = [];
		const subtotals = { hint: 0, event: 0, uma: 0, parent: 0, none: 0 };
		const unpriced = [];
		let total = 0;
		included.forEach(e => {
			const rootId = rootOf(e.skillId);
			const r = roots.get(rootId);
			const eventSum = Array.from(r.events.values()).reduce((s, v) => s + v, 0);
			const level = sumHintLevel({ practice: r.practice, eventLevels: Array.from(r.events.values()), enabledLevel: r.enabledLevel,
				umaLevel: r.uma ? umaLevel : 0, parentLevel: r.parentLevel }, rules);
			const primary = r.practice ? 'hint' : (eventSum > 0 || r.enabledLevel > 0) ? 'event' : r.uma ? 'uma' : r.parentLevel > 0 ? 'parent' : 'none';
			const row = ptIndex ? ptIndex.get(e.skillId) : undefined;
			const item = {
				skillId: e.skillId, rootSkillId: rootId, hintLevel: level,
				parts: { P: r.practice ? rules.practiceHintLevel : 0, E: eventSum, T: r.enabledLevel, U: r.uma ? umaLevel : 0, F: r.parentLevel },
				primaryKind: primary, sure: e.sure,
				// 有効にした△。**●のイベントにもあるスキル（●の行）でも、△の出現があれば有効にできる**（段4。T は E とは別に足す）
				enabled: enabled.has(e.skillId) && e.list.some(s => !s.sure),
				base: row ? row.pt : null, rarity: row ? row.rarity : null, pt: null
			};
			if (row) {
				item.pt = computeSkillPt(row.pt, level, statusId, rules);
				total += item.pt;
				subtotals[primary] += item.pt;
			} else {
				unpriced.push(e.skillId);
			}
			items.push(item);
		});

		// 4. 前段（段4b）。本育成のスキル（●＋有効な△）と因子セットのスキル（included）それぞれの前段を、前段データ（stepUp.prevOf）で
		//    さかのぼって全部たどり、included に無いものを「前段として必要」として1回だけ数える。**total は前段を含めない**
		//    （段3・段4 の合計の意味を変えない）。前段データが無い（stepUp が null）ときは何もしない＝段5 までの動きのまま。
		//    前段の Pt は各段で独立に計算する: L は系列の根（rootOf）の L を使い（◎は○の L を援用・金は金自身の L）、
		//    根に由来が無ければ L=0。すでに included にあるもの（ほかの由来・因子セット）は前段として数えず（二重にしない）、chains に印だけ残す。
		const prevOf = (a.stepUp && typeof a.stepUp.prevOf === 'function') ? a.stepUp.prevOf : null;
		const prevItems = [];
		const prevUnpriced = [];
		const chains = [];
		let prevTotal = 0;
		if (prevOf) {
			const inIncluded = new Set(included.map(e => e.skillId));
			const counted = new Map();
			// さかのぼった前段を、古い順（根に近いほうが先）に並べる。循環があっても止まる
			const ancestorsOf = (id) => {
				const out = [];
				const seen = new Set([id]);
				const walk = (x) => { prevOf(x).forEach(p => { if (seen.has(p)) return; seen.add(p); walk(p); out.push(p); }); };
				walk(id);
				return out;
			};
			included.forEach(e => {
				const anc = ancestorsOf(e.skillId);
				if (anc.length === 0) return;
				chains.push({ skillId: e.skillId, ancestors: anc.map(id => ({ skillId: id, inTable: inIncluded.has(id) })) });
				anc.forEach(id => {
					if (inIncluded.has(id)) return;
					if (counted.has(id)) { counted.get(id).neededFor.push(e.skillId); return; }
					const rootId = rootOf(id);
					const r = roots.get(rootId);
					const level = r ? sumHintLevel({ practice: r.practice, eventLevels: Array.from(r.events.values()), enabledLevel: r.enabledLevel,
						umaLevel: r.uma ? umaLevel : 0, parentLevel: r.parentLevel }, rules) : 0;
					const row = ptIndex ? ptIndex.get(id) : undefined;
					const item = { skillId: id, rootSkillId: rootId, hintLevel: level, base: row ? row.pt : null, rarity: row ? row.rarity : null, pt: null, neededFor: [e.skillId] };
					if (row) { item.pt = computeSkillPt(row.pt, level, statusId, rules); prevTotal += item.pt; }
					else prevUnpriced.push(id);
					counted.set(id, item);
					prevItems.push(item);
				});
			});
		}
		return { ok: true, items: items, total: total, subtotals: subtotals, unpriced: unpriced, unpricedCount: unpriced.length,
			prevItems: prevItems, prevTotal: prevTotal, prevUnpriced: prevUnpriced, chains: chains,
			totalWithPrev: total + prevTotal, allUnpricedCount: unpriced.length + prevUnpriced.length,
			unknownLevelCount: unknownLevelCount, unknownLevelSkillIds: Array.from(unknownSkillIds), statusId: statusId || 'none', umaHintLevel: umaLevel };
	}

	/**
	 * 編成の Pt の設定（roster.pt。段3）を、**計算に使う値**へ解く。**保存データは書き換えない**。
	 *   - 状態: 保存した値が割引率の表（rules.statuses）に無ければ「なし」（取り込んだ知らない値も「なし」として計算する）
	 *   - 育成ウマ娘のヒントLv: 選べる値（umaHintLevelChoices）に入っていなければ既定。
	 *     保存した 5 が残っていても、選べない育成ウマ娘（覚醒 Lv が足りない）では既定で計算する
	 * roster.pt は無いのが普通（読み込み時に補わない。使うところで既定として扱う）。
	 * 返り値の umaChoices は、そのウマ娘で選べる値（画面が「5」を有効にするかの判定にも使う）。
	 */
	const PT_STATUS_DEFAULT = 'none';
	function resolveRosterPtSettings(roster, rules) {
		const r = roster || {};
		const p = (r.pt && typeof r.pt === 'object') ? r.pt : {};
		const uma = r.umaId ? findUma(r.umaId) : null;
		const umaChoices = umaHintLevelChoices(uma ? maxAwakeningLevelOf(uma) : 0, rules);
		return {
			status: rules.statuses.some(s => s.id === p.status) ? p.status : PT_STATUS_DEFAULT,
			umaHintLevel: umaChoices.indexOf(p.umaHintLevel) !== -1 ? p.umaHintLevel : rules.umaHintLevelDefault,
			umaChoices: umaChoices
		};
	}

	/** 3桁ごとの区切りを入れる（表示用。ロケールに依存させない）。 */
	function formatPtNumber(n) {
		return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	/**
	 * 継承固有（段7d の ⑪）。親から継承する固有スキルの Pt。1つの基礎Pt は 200（ゲームの仕様）。
	 * 種類（2〜6。既定 6）とヒントLv（1〜上限。既定 3）を周回因子セットごとに選び、種類の数だけ computeSkillPt（本育成編成の割引つき）で数えて、
	 * ②の必要スキルPt（超優先・優先・通常のすべて）に足す。「種」には数えない。
	 * 保存はセットごと（template／ドラフトの inheritedUnique。触ったときだけ書く＝既定値と同じキーは書かない。schemaVersion は上げない）。
	 */
	const INHERITED_UNIQUE_BASE_PT = 200;
	const INHERITED_UNIQUE_COUNT_MIN = 2, INHERITED_UNIQUE_COUNT_MAX = 6, INHERITED_UNIQUE_COUNT_DEFAULT = 6;
	const INHERITED_UNIQUE_LEVEL_MIN = 1, INHERITED_UNIQUE_LEVEL_DEFAULT = 3;
	function inheritedUniqueLevelMax(rules) { return rules && isNonNegInt(rules.hintLevelMax) ? rules.hintLevelMax : 5; }
	function inheritedUniqueCountChoices() {
		const out = [];
		for (let n = INHERITED_UNIQUE_COUNT_MIN; n <= INHERITED_UNIQUE_COUNT_MAX; n++) out.push(n);
		return out;
	}
	function inheritedUniqueLevelChoices(rules) {
		const out = [];
		for (let lv = INHERITED_UNIQUE_LEVEL_MIN; lv <= inheritedUniqueLevelMax(rules); lv++) out.push(lv);
		return out;
	}
	/** 保存した値（無いのが普通）を、計算に使う { count, hintLevel } に解く。範囲外・数でない値は既定として扱う（保存値は書き換えない） */
	function resolveInheritedUnique(raw, rules) {
		const r = (raw && typeof raw === 'object') ? raw : {};
		const okCount = isNonNegInt(r.count) && r.count >= INHERITED_UNIQUE_COUNT_MIN && r.count <= INHERITED_UNIQUE_COUNT_MAX;
		const okLevel = isNonNegInt(r.hintLevel) && r.hintLevel >= INHERITED_UNIQUE_LEVEL_MIN && r.hintLevel <= inheritedUniqueLevelMax(rules);
		return { count: okCount ? r.count : INHERITED_UNIQUE_COUNT_DEFAULT, hintLevel: okLevel ? r.hintLevel : INHERITED_UNIQUE_LEVEL_DEFAULT };
	}
	/** 解いた値から、保存する形を作る（既定と同じキーは書かない。両方既定なら null＝項目ごと消す） */
	function storableInheritedUnique(v) {
		const out = {};
		if (v.count !== INHERITED_UNIQUE_COUNT_DEFAULT) out.count = v.count;
		if (v.hintLevel !== INHERITED_UNIQUE_LEVEL_DEFAULT) out.hintLevel = v.hintLevel;
		return Object.keys(out).length > 0 ? out : null;
	}

	/**
	 * 親由来のレベル F（段5）の、選べる値と、計算に使う値。選べるのは hintLevelMax〜1（0 は無い。既定は rules.parentHintLevelDefault）。
	 * 保存してある値が範囲の外・数でないときは既定として計算する（**保存データは書き換えない**）。
	 */
	function parentHintLevelChoices(rules) {
		const out = [];
		for (let lv = rules.hintLevelMax; lv >= 1; lv--) out.push(lv);
		return out;
	}
	function resolveParentHintLevel(raw, rules) {
		return (isNonNegInt(raw) && raw >= 1 && raw <= rules.hintLevelMax) ? raw : rules.parentHintLevelDefault;
	}

	/**
	 * 周回因子セットの必要スキルPt（段5）。**画面・保存・special を知らない純粋関数。**
	 * 本育成のスキル（●＋有効な△）は3つのどれにも常に含み、因子セットのスキルを分類（tierOf。設定していないものは優先）の
	 * 「その分類まで」で足す（超優先だけ／優先まで／通常まで＝累積）。**同じスキルは1回だけ数え**、そのスキルの L は
	 * 本育成の由来（P・E・T・U）に、その分類まで含まれる因子セットのスキルなら親由来 F を足して上限5（computeRosterPt の規則そのまま）。
	 * 因子セットだけにあるスキルは L = F。Pt が未収録のスキルは合計に入れず、widest（通常まで）で数えた件数を unpricedCount に出す。
	 *
	 * args は computeRosterPt の args（sources・rules・skillPt・stepUp・statusId・umaHintLevel・enabledSkillIds）に、
	 *   factorSkillIds … 因子セットのスキルid（シナリオ因子・遺伝子は skillIds に入らないので含まれない）
	 *   offSkillIds    … 本育成で「取得しない」にしたスキル（段7c の M。computeRosterPt を参照）
	 *   tiers          … 因子セットの分類 { skillId: 1|2|3 }（無い id は優先）
	 *   parentHintLevel… F（保存してある値。resolveParentHintLevel で解く）
	 * 返り値: { ok, parentHintLevel, roster: { total, count, unpricedCount }, cuts: [{ tier, label, total, count, unpricedCount }…], unpricedCount, overlapRaisable }
	 *   overlapRaisable … 本育成と因子セットの両方にあるスキルのうち、本育成の由来だけの L が上限未満のものの数（親から得ると安くなる）
	 *   roster … 因子セットを足さない、本育成だけの計算（「うち本育成」。本育成パネルの合計と同じ値）
	 */
	function computeFactorSetPt(args) {
		const a = args || {};
		const rules = a.rules;
		if (!isValidSkillPtRules(rules)) return { ok: false, reason: 'rules' };
		const F = resolveParentHintLevel(a.parentHintLevel, rules);
		const seen = new Set();
		const factorIds = [];
		(a.factorSkillIds || []).forEach(id => { if (typeof id === 'string' && id && !seen.has(id)) { seen.add(id); factorIds.push(id); } });
		const run = (parents) => computeRosterPt({
			sources: a.sources, rules: rules, skillPt: a.skillPt, stepUp: a.stepUp, statusId: a.statusId,
			umaHintLevel: a.umaHintLevel, enabledSkillIds: a.enabledSkillIds, offSkillIds: a.offSkillIds, parentHintLevels: parents
		});
		const base = run({});
		// 継承固有（段7d の ⑪）。種類の数だけ、選んだヒントLv と本育成編成の割引（状態）で数えて、3つの合計のすべてに足す。「種」には数えない
		const uniq = a.inheritedUnique ? resolveInheritedUnique(a.inheritedUnique, rules) : null;
		const uniqPt = uniq ? uniq.count * computeSkillPt(INHERITED_UNIQUE_BASE_PT, uniq.hintLevel, a.statusId, rules) : 0;
		// 本育成と因子セットの両方にあるスキルのうち、本育成の由来だけの L（F を足す前。P・E・T・U の合計・上限5）が上限未満のもの。
		// 親から得ると L が上がって安くなるので、画面が補足文を出すかの判定に使う（合計の値は変えない）
		const inFactor = new Set(factorIds);
		const overlapRaisable = base.items.filter(it => inFactor.has(it.skillId) && it.hintLevel < rules.hintLevelMax).length;
		const cuts = TIERS.map((t, i) => {
			const parents = {};
			factorIds.forEach(id => { if (tierOf(a.tiers, id) <= t.id) parents[id] = F; });
			const r = run(parents);
			return { tier: t.id, label: t.label + (i === 0 ? 'だけ' : 'まで'), total: r.totalWithPrev + uniqPt, count: r.items.length, unpricedCount: r.allUnpricedCount, prevCount: r.prevItems.length, prevTotal: r.prevTotal, items: r.items };
		});
		// ランクごとの Pt（段7d の追加・A）。そのランクを足したことで増える分（前段を含む）。「通常まで」の合計 ＝ 本育成編成 ＋ 継承固有 ＋ 超優先 ＋ 優先 ＋ 通常
		// になるよう、累計の差で出す。本育成と因子セットの両方にあるスキルは、親由来のレベルで安くなるぶん、そのランクの値が小さく（まれに負に）なる
		cuts.forEach((c, i) => { c.own = c.total - (i === 0 ? base.totalWithPrev + uniqPt : cuts[i - 1].total); });
		// 行の Pt（段7d の ⑬）。②に追加したスキルの Pt は、必要スキルPt に数えている値＝いちばん広い（通常まで）の計算の値
		// （親由来のレベルと本育成編成の割引を反映。因子セットのスキルはすべて親由来 F を足す）
		const skillPts = new Map();
		cuts[cuts.length - 1].items.forEach(it => { skillPts.set(it.skillId, { pt: it.pt, base: it.base, hintLevel: it.hintLevel }); });
		return { ok: true, parentHintLevel: F, inheritedUniquePt: uniqPt, skillPts: skillPts,
			// total は前段を含む値（本育成パネルの「前段を含む合計」と同じ）。本育成のスキルだけの値は own
			roster: { total: base.totalWithPrev, own: base.total, count: base.items.length, unpricedCount: base.allUnpricedCount, prevCount: base.prevItems.length, prevTotal: base.prevTotal },
			cuts: cuts, unpricedCount: cuts[cuts.length - 1].unpricedCount, overlapRaisable: overlapRaisable };
	}

	/**
	 * 表の並び（段7e の (1)）。**金スキルの直下に、その前段の白スキルを置く。** 前段は前段データ（skill-step-up.json の「金 → 直前のスキル」）の直前だけを見る
	 * （金かどうかは skill-pt.json の rarity）。前段の白が同じ表に出ているときだけ動かし、出ていなければ何もしない。
	 * 1つの白スキルが複数の金スキルの前段になっているときは、先に出る金スキルの直下に置く。
	 * 返り値は「単位」の配列。単位は [先頭の行, ...その直下に置く前段の白の行]。順序は元の並び（金スキルの位置）のまま。
	 * データが読めていない画面（Deck 単体ページなど）では、1行ずつの単位（並びは変わらない）。
	 */
	function arrangeStepUnits(items) {
		const list = Array.isArray(items) ? items : [];
		const su = skillPtData.stepUp, pt = skillPtData.skillPt;
		if (!su || typeof su.prevOf !== 'function' || !(pt instanceof Map)) return list.map(it => [it]);
		const isGold = (id) => { const row = pt.get(id); return !!row && row.rarity === 'gold'; };
		const byId = new Map(list.map(it => [it.skillId, it]));
		const moved = new Set();
		const under = new Map();
		list.forEach(it => {
			if (!isGold(it.skillId)) return;
			const ws = [];
			su.prevOf(it.skillId).forEach(p => {
				const w = byId.get(p);
				if (w && !isGold(p) && !moved.has(p)) { moved.add(p); ws.push(w); }
			});
			if (ws.length > 0) under.set(it.skillId, ws);
		});
		return list.filter(it => !moved.has(it.skillId)).map(it => [it].concat(under.get(it.skillId) || []));
	}
	/**
	 * 表の行の色分け（段7e の (2)〜(5)）。判定はマスターの tags だけ（スキル名は決め打ちしない）。
	 *   heal    … 効果タイプが回復（持久力回復）／ debuff … 効果タイプがデバフ（掛かり時間を含む）／ passive … パッシブのタグがある
	 * 重なったときの優先は呼び出し側で決める（地は 固有 > 金 > 回復。文字は 回復 > デバフ > パッシブ）。
	 */
	const ROW_HEAL_EFFECTS = ['stamina'];
	const ROW_DEBUFF_EFFECTS = ['debuff'];
	function rowToneOf(skillId) {
		const tags = getSkillTags(skillId) || {};
		const eff = Array.isArray(tags.effect) ? tags.effect : [];
		const effectAxis = TAG_AXES.find(a => a.key === 'effect');
		const debuffValues = expandMergedValues(effectAxis, ROW_DEBUFF_EFFECTS);
		return {
			heal: eff.some(v => ROW_HEAL_EFFECTS.indexOf(v) !== -1),
			debuff: eff.some(v => debuffValues.indexOf(v) !== -1),
			passive: Array.isArray(tags.passive) && tags.passive.length > 0
		};
	}

	/**
	 * 種数の数え方（段7d の ⑫）。**金スキルと、その前段の白スキルの両方を取る（ids に両方ある）ときは、合わせて1種**に数える
	 * （ゲームでは金を取ると下位は表示されなくなるため）。返り値は「金と組になって数えない白スキルの id」の Set。
	 * 前段は前段データ（skill-step-up.json）を最下位までさかのぼる。レアリティは skill-pt.json の rarity。
	 * データが読めていない（Deck 単体ページなど）・金スキルが無いときは空。
	 */
	function pairedWhiteIds(ids) {
		const out = new Set();
		const su = skillPtData.stepUp, pt = skillPtData.skillPt;
		const list = Array.from(new Set(ids || []));
		if (!su || typeof su.prevOf !== 'function' || !(pt instanceof Map) || list.length < 2) return out;
		const inList = new Set(list);
		const isGold = (id) => { const row = pt.get(id); return !!row && row.rarity === 'gold'; };
		list.forEach(id => {
			if (!isGold(id)) return;
			const seen = new Set([id]);
			const walk = (x) => su.prevOf(x).forEach(prev => {
				if (seen.has(prev)) return;
				seen.add(prev);
				if (inList.has(prev) && !isGold(prev)) out.add(prev);
				walk(prev);
			});
			walk(id);
		});
		return out;
	}
	/** 種数（ids の重なりは1つに数える）。金スキルと前段の白スキルの組は1種（pairedWhiteIds）。 */
	function countSkillKinds(ids) {
		const list = Array.from(new Set(ids || []));
		return list.length - pairedWhiteIds(list).size;
	}
	/** スキルPt の元データを読み終えたときに知らせる（種数の数え方が変わるため、画面が数え直す）。 */
	const skillPtLoadListeners = [];
	function onSkillPtLoaded(fn) { if (typeof fn === 'function') skillPtLoadListeners.push(fn); }

	/** 'loading'（まだ）／'ok'／'failed'（割引率の表か skill-pt.json を読めなかった）。編成パネル（①）と周回因子セット（②）で共有。 */
	function skillPtDataStatus() {
		const m = skillPtData.meta;
		if (!m.loaded) return 'loading';
		return (m.rules === 'ok' && m.skillPt !== 'failed') ? 'ok' : 'failed';
	}
	/**
	 * **保存した編成**の、スキルPt の計算に渡す材料（段7c の O の (5)）。②の「本育成編成」に選んだ編成の Pt を、
	 * ①でその編成を開いていなくても数えられるようにする。決まりは①のパネルと同じ（イベントの選択・絞り込みから決まる既定の選択・
	 * 取得しないにしたスキル・状態の設定）。返り値は rosterPtSource.getInputs() と同じ形に offIds を加えたもの。
	 */
	function rosterPtInputsOf(r) {
		const copy = snapshot(r);
		copy.cardIds = (copy.cardIds || []).slice(0, ROSTER_CARD_SLOTS);
		while (copy.cardIds.length < ROSTER_CARD_SLOTS) copy.cardIds.push(null);
		const res = rosterSkillResultOf(copy);
		// 段7d の ⑥：①のパネルと同じ「表に出す部分」（絞り込みに当たる行の由来・取得しないスキルを除いた●）を渡す
		const vp = visiblePartOf(copy, res);
		const status = skillPtDataStatus();
		return { status: status, sources: vp.visibleSources, enabledIds: [], sureIds: vp.takenIds, offIds: vp.offList,
			settings: status === 'ok' ? resolveRosterPtSettings(copy, skillPtData.rules) : null };
	}
	/** 本育成編成が「なし」のときの材料（段7d の ⑥(b)）。編成の Pt は 0 として数える。①で選択中の編成には戻らない */
	function emptyRosterPtInputs() {
		const status = skillPtDataStatus();
		return { status: status, sources: [], enabledIds: [], sureIds: [], offIds: [],
			settings: status === 'ok' ? resolveRosterPtSettings({}, skillPtData.rules) : null };
	}
	/**
	 * 保存した編成の本育成の Pt の合計（前段を含む・絞り込みなし・取得しないにしたスキルを除く。「本育成編成」のボタンに出す値）。
	 * 元データが使えないときは null。{ total, statusId, statusLabel }。statusLabel は「なし」のとき ''。
	 */
	function rosterPtSummaryOf(r) {
		const inp = rosterPtInputsOf(r);
		if (inp.status !== 'ok') return null;
		const rules = skillPtData.rules;
		const pt = computeRosterPt({ sources: inp.sources, rules: rules, skillPt: skillPtData.skillPt, stepUp: skillPtData.stepUp,
			statusId: inp.settings.status, umaHintLevel: inp.settings.umaHintLevel, offSkillIds: inp.offIds });
		if (!pt.ok) return null;
		const st = rules.statuses.find(x => x.id === inp.settings.status);
		return { total: pt.totalWithPrev, statusId: inp.settings.status, statusLabel: (st && inp.settings.status !== PT_STATUS_DEFAULT) ? String(st.label || '') : '' };
	}

	/**
	 * 編成パネル（①）が計算した「本育成のぶん」を、スキルセットのパネル（②。special だけ）へ渡す内部の受け渡し（段5）。
	 * 編成パネルは作るときに自分を登録し（rosterPtSource.getInputs() は呼ぶたびに現在の値を返す）、描き直すたびに
	 * emitRosterPtChange() で知らせる。スキルセットのパネルはそれを受けて必要Ptを描き直す。
	 * **special.html の接点は足していない**（core の中だけで足りる）。編成パネルが無い画面（Deck 単体ページ）では
	 * rosterPtSource が null のままなので、必要Ptは出ない。
	 */
	let rosterPtSource = null;
	const rosterPtListeners = [];
	function emitRosterPtChange() {
		rosterPtListeners.forEach(fn => { try { fn(); } catch (e) { if (global.console) global.console.error('[UmaSkillDeckCore] 必要Ptの更新で例外', e); } });
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

	/* ---- セット（段8・C-120。special だけ）----
	   セット＝ template（因子周回）＋ その baseRosterId が指す roster（本育成編成）。選んでいるセットは②（createTemplateManager）が持ち、
	   描き直すたびに setHubPublish() で知らせる。①（createRosterPanel）はそれを受けて、そのセットの編成を開く。
	   templateId は保存済みのセットの id、'' は「＋新規」（下書き。template と roster の下書きが対）。 */
	const setHub = { inited: false, templateId: '', listeners: [] };
	function setHubPublish(templateId, force) {
		const id = templateId || '';
		if (setHub.inited && setHub.templateId === id && !force) return;
		setHub.inited = true;
		setHub.templateId = id;
		setHub.listeners.forEach(fn => { try { fn(id); } catch (e) { if (global.console) global.console.error('[UmaSkillDeckCore] セットの切り替えで例外', e); } });
	}
	/** 保存済みのセットの編成（無ければ null）。下書きのセットは呼び出し元が下書きの編成を読む */
	function setRosterOfTemplate(t) {
		return t && typeof t.baseRosterId === 'string' && t.baseRosterId ? findRoster(t.baseRosterId) : null;
	}
	/**
	 * ①が空だったセットに、初めて編成を付ける（①に何かを入れたとき）。名前はセット名。上限（ROSTER_LIMIT）では止めない
	 * （編成はセットに付くだけなので、セットの数＝TEMPLATE_LIMIT を超えない）。付けたら schemaVersion を 6 にする。
	 */
	function attachRosterToTemplate(templateId, roster) {
		const data = ensureUserData();
		const t = (data.templates || []).find(x => x.templateId === templateId);
		if (!t || !roster) return false;
		roster.name = String(t.name || '');
		roster.updatedAt = nowIso();
		data.rosters = data.rosters || [];
		data.rosters.push(roster);
		t.baseRosterId = roster.rosterId;
		t.updatedAt = nowIso();
		if (!(data.schemaVersion >= 6)) data.schemaVersion = 6;
		saveUserData();
		return true;
	}
	/** 編成に中身があるか（育成ウマ娘・カード・設定のどれかを触っているか）。下書きの①を保存するときに、写しを作るかの判定に使う */
	function rosterHasContent(r) {
		if (!r || typeof r !== 'object') return false;
		if (r.umaId) return true;
		if ((r.cardIds || []).some(Boolean)) return true;
		return ['pt', 'eventChoices', 'skillFilter', 'offSkillIds'].some(k => r[k] !== undefined && r[k] !== null);
	}

	/**
	 * 編成の絞り込み（段7の (17)。距離・脚質・バ場）。設定は編成の skillFilter に保存してある
	 * （触らなければ足さない・読み込み時に補わない・知らない値は「指定なし」として扱う）。
	 * ①のパネルと、②の「本育成編成」（選んだ編成の●を数える）が同じ決まりで使うので、編成を引数に取る形でここに置く。
	 */
	function resolvedFilterOf(r) {
		const f = (r && r.skillFilter && typeof r.skillFilter === 'object') ? r.skillFilter : {};
		const out = {};
		ROSTER_FILTER_AXIS_KEYS.map(k => TAG_AXES.find(a => a.key === k)).filter(Boolean).forEach(axis => {
			const v = f[axis.key];
			if (typeof v === 'string' && v && pickableOptions(axis).some(o => o.v === v)) out[axis.key] = v;
		});
		return out;
	}
	/** 絞り込みの述語（matchesFilters。タグを持たないスキルは残る）。絞り込んでいなければ null */
	function filterPredicateOf(r) {
		const sel = resolvedFilterOf(r);
		const keys = Object.keys(sel);
		if (keys.length === 0) return null;
		const filters = {};
		keys.forEach(k => { filters[k] = [sel[k]]; });
		return (skillId) => {
			const s = findSkill(skillId);
			return !s || matchesFilters(s, filters, null);
		};
	}
	/** 編成で得られるスキル（イベントの選択と、絞り込みから決まる既定の選択を効かせる。①のパネルの computed() の元） */
	function rosterSkillResultOf(r) {
		return computeRosterSkills(r, { eventChoices: r.eventChoices, autoChoose: true, isWanted: filterPredicateOf(r) });
	}
	/**
	 * 本育成で「取得しない」にしたスキル（段7c の M。編成の offSkillIds）。**いま●のスキルに当たるものだけ**が有効
	 * （指す先が無い id〔イベントの選択が変わって●でなくなった・収録データが変わった〕は無視する。**保存値は書き換えない**）。
	 * 触らなければ offSkillIds は無い（読み込み時に補わない）。skillIds は rosterSkillResultOf(r).skillIds（絞り込みなしの●）。
	 */
	function validOffIdsOf(r, skillIds) {
		const stored = (r && Array.isArray(r.offSkillIds)) ? r.offSkillIds : [];
		if (stored.length === 0) return [];
		const sure = new Set(skillIds || []);
		const out = [];
		stored.forEach(id => { if (typeof id === 'string' && sure.has(id) && out.indexOf(id) === -1) out.push(id); });
		return out;
	}

	/**
	 * 編成の「表に出す部分」（段7d の ⑥）。絞り込みに当たる行とその由来・取得しないスキル・実際に取る●。
	 * **①のパネルの computed() と、②の「本育成編成」（rosterPtInputsOf）が同じ関数を通る**ので、
	 * ①の「X Pt/N種」と②が本育成編成として数える Pt は、絞り込み・取得しないスキル・イベントの選択・状態・ヒントLv・前段の扱いまで同じになる。
	 * res は rosterSkillResultOf(r) の結果。
	 */
	function visiblePartOf(r, res) {
		const wanted = filterPredicateOf(r);
		const visibleItems = wanted ? res.items.filter(it => wanted(it.skillId)) : res.items.slice();
		const vis = new Set(visibleItems.map(it => it.skillId));
		const visibleSources = wanted ? res.sources.filter(s => vis.has(s.skillId)) : res.sources;
		const offList = validOffIdsOf(r, res.skillIds);
		const off = new Set(offList);
		const takenIds = visibleItems.filter(it => it.sure && !off.has(it.skillId)).map(it => it.skillId);
		return { wanted: wanted, visibleItems: visibleItems, visibleSources: visibleSources, offList: offList, takenIds: takenIds };
	}

	/* ============================================================
	 * スキル参照ヘルパー（マスター／カスタムを横断）
	 * ============================================================ */
	function findSkill(skillId) {
		const m = masterSkills.find(s => s.id === skillId);
		if (m) return m;
		// 保存済みのカスタムスキル（作る手段は 2026-09-27 に廃止。C-100）。入っているセット・比較シート・
		// special の照合では今と同じ名前で出すため、ここでは引き続き引く。検索の一覧には出さない
		// （`taggedSkillPool()` には入れず、`buildSkillTextIndex()` は searchableOnly のときに外す）。
		const c = (ensureUserData().customSkills || []).find(s => s.customId === skillId);
		if (c) return { id: c.customId, name: c.name, tags: c.tags };
		// 追加カタログ（シナリオ因子・拡張スキルなど）。
		// **こちらも浅いコピーで返す**（上のマスターの層が生の1件をそのまま返しているのと
		// 同じ扱い）。ここだけ手で並べたオブジェクトを組むと、toCatalogEntry() を素通しに
		// しても**この関数でもう一度落ちる**（関門を入口に寄せた意味が無くなる。C-64）。
		// タグを持つものはそのまま返し、持たないものは空のタグ集合を返す。
		// **空のタグ集合は「万能スキル」の意味になる**ので、未設定と見分けたい呼び出し側は
		// tagsPending を見る（この2つを取り違えないよう、両方を返す）。
		// kind にカテゴリが入るので、呼び出し側は「カタログ由来か」を見分けられる
		// （素通しにした結果 category も一緒に来るが、kind はこの関数が昔から使っている名前）。
		const x = extraCatalog.find(s => s.id === skillId);
		if (x) return Object.assign({}, x, { tags: x.tags || emptyTagSet(), tagsPending: !!x.tagsPending, kind: x.category });
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

	/* フィルター一致判定。軸間はAND、軸内はOR。
	 *
	 * スキルがその軸に条件を持たない（空配列）場合は、その軸のどの選択肢にも一致する扱い（万能スキル）。
	 * ただし `emptyMeansNone` の軸は、空配列が「該当なし」であって「万能」ではない
	 * （2026-09-25・C-89 で効果タイプにも付けた。いま「万能」と読むのは距離・脚質だけ）。
	 * ここだけ扱いを分ける（選択肢の数とは関係がない。値が3つになっても同じ）。
	 * **70セッション目・段5 で、この印が付く軸は「その他」1本から5本になった**
	 * （フェーズ・コース位置・レース環境・レース場・その他）。逆でないのは
	 * 距離・脚質・効果タイプの3軸だけ。
	 *
	 * **`exclusive` の軸（バ場）だけ、軸内が OR ではない** ―― 71セッション目・段8。
	 * 「持っている値が、選んだ値に全部収まっているものだけ通す」＝**許可リスト**。
	 * 芝を選べばダートのタグを持つスキルが落ち、ダートを選べば芝のタグを持つスキルが落ちる。
	 * **その軸のタグを持たないスキルは通る**（どちらでも走れるので、排除する理由が無い）。
	 * `emptyMeansNone` とは別の規則なので、空の扱いを先に済ませてから分岐する。
	 *
	 * **70セッション目・段5 の門番（`optIn`）は 71セッション目・段8 で廃した。**
	 * レース環境・レース場を絞り込みから隠したことで付く軸が0本になり、
	 * 必ず何もしない死にコードになるため（決5）。
	 *
	 * **軸のキーをここに書かない。** 性質は `TAG_AXES` の印（`emptyMeansNone` / `exclusive`）が持ち、
	 * この関数は印を読むだけ。軸が増減しても追従する（恒久ルール1の精神）。
	 */
	function matchesFilters(skill, filters, target) {
		return TAG_AXES.every(axis => {
			const selected = filters[axis.key] || [];
			// 目標のレースの距離が付く軸（距離）だけ、判定を分ける（C-97）
			if (axis.targetDistance) return matchesDistanceAxis(skill, selected, axis, target);
			if (selected.length === 0) return true; // その軸で絞り込みしていない
			const skillValues = (skill.tags && skill.tags[axis.key]) || [];
			if (skillValues.length === 0) return !axis.emptyMeansNone; // 万能スキル（emptyMeansNone の軸では該当なし）
			const wanted = expandMergedValues(axis, selected);   // まとめた値も一緒に当てる（C-98）
			return axis.exclusive
				? skillValues.every(v => wanted.includes(v))   // 許可リスト（選んでいない値を持つものは落とす）
				: skillValues.some(v => wanted.includes(v));   // 軸内 OR
		});
	}

	/**
	 * 距離の軸の判定（C-97・2026-09-26）。区分のタグに加えて、スキルの `raceDistance`（レースの距離の限定）を見る。
	 *
	 * `target` は `evaluateTargetDistance()` の結果で **state が 'ok' のときだけ渡される**（d が有効なとき）。
	 * エラーのときは呼び出し側が null を渡すので、ここでは「区分だけ」の判定になる（＝ d を使わずに絞る）。
	 *
	 * **d が有効なとき**（区分は d の区分として判定する。区分を選んでいれば d の区分と一致していることは呼び出し側が確かめ済み）:
	 *   1. `scope` が "all"（限定がスキル全体にかかる）… d が限定に当たるときだけ出す
	 *   2. それ以外（限定が無い、または "part"）…
	 *      a. 距離のタグが無い → 出す（万能）
	 *      b. タグに d の区分がある → 出す
	 *      c. 限定が d に当たり、`distanceTagScope` が "part"（タグは追加の効果だけにかかる）→ 出す
	 *      d. どれでもない → 出さない
	 * **d が無く区分だけ選んでいるとき**:
	 *   "all" のスキルは、選んだ区分に実在する距離のどれかが限定に当たれば出す。
	 *   それ以外は今までどおり（タグが空なら出す／タグに選んだ区分があれば出す）。
	 * **どちらも無い** … 絞らない。
	 *
	 * レースの一覧を読めていないときは d が有効になることが無い（'unavailable'）。区分だけのときの "all" は、
	 * 実在する距離が分からないので**タグだけで判定する**（＝タグが無ければ出す。限定の無かった頃の動き）。
	 */
	function matchesDistanceAxis(skill, selected, axis, target) {
		const rd = skill.raceDistance || null;
		const tagValues = (skill.tags && skill.tags[axis.key]) || [];
		if (target && target.state === 'ok') {
			const d = target.distance;
			if (rd && rd.scope === 'all') return raceDistanceMatches(rd, d);
			if (tagValues.length === 0) return true;
			if (tagValues.includes(target.category.key)) return true;
			return !!(rd && rd.distanceTagScope === 'part' && raceDistanceMatches(rd, d));
		}
		if (selected.length === 0) return true;
		if (rd && rd.scope === 'all' && raceDistances) {
			return distancesInCategories(selected).some(d => raceDistanceMatches(rd, d));
		}
		if (tagValues.length === 0) return true;
		return tagValues.some(v => selected.includes(v));
	}

	function tagLabel(axisKey, value) {
		const axis = TAG_AXES.find(a => a.key === axisKey);
		if (!axis) return value;
		const opt = axis.options.find(o => o.v === value);
		if (opt && opt.mergedInto) return tagLabel(axisKey, opt.mergedInto);   // まとめた値はまとめ先の名前で出す（C-98）
		return opt ? opt.t : value;
	}

	/**
	 * スキルが持つ値を、画面に出す名前の並びにする（C-98）。まとめた値はまとめ先の名前になり、
	 * **同じ名前は1つだけ**（デバフと掛かり時間を両方持つスキルでも「デバフ」は1回）。
	 * いまこれを使う画面は無い（スキルの行にタグを出す場所が無い）が、出すときはこれを通すこと。
	 */
	function tagLabels(axisKey, values) {
		return [...new Set((values || []).map(v => tagLabel(axisKey, v)))];
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

	// 照合対象のプール。
	// スキル選択パネルの一覧と同じ母集団にしておくことで、
	// 「一覧には出ているのに貼り付けでは当たらない」というズレを避ける。
	// 名前で引くための索引。母集団は「マスター＋利用者のカスタムスキル＋追加カタログ」
	// （カスタムスキルは searchableOnly のときは入れない。下の 2026-09-27 の段落）。
	// カタログを入れているのは、OCRツールから渡ってきた名前（シナリオ因子など）を
	// 解決できるようにするため。「条件でスキルを検索」の母集団（getFilteredPickerPool）には
	// 入れない — カタログのエントリはタグを持たず、条件検索では「万能スキル」として
	// どの条件にも当たってしまうため。
	//
	// **2026-09-25（C-91）: `opts.searchableOnly` を渡すと、拡張スキルは検索に出してよいもの
	// （`SEARCHABLE_EXTENDED_SKILL_IDS`）だけになる。** 渡すのは「条件で検索」のモーダルの中の
	// テキストで検索と名前を入れて探すだけ。既定（渡さない）は全件のまま ―― 収録データの入力ページと
	// Deck の OCR の受け取り口は、これまでどおり全件で引く。
	//
	// **2026-09-27（C-100）: カスタムスキルも、searchableOnly のときは入れない**（作る手段の廃止に合わせて、
	// 検索の一覧から外した）。**既定の呼び方には残す** ―― Deck の OCR の受け取り口（`resolveHandoffSkills`）は
	// special が読み取った**名前**を id へ戻すので、ここから外すと、カスタムスキルが入ったセットで読み取った結果を
	// Deck へ渡したときにその行だけ落ちる（入っている場所では今までどおり使える、という決定に反する）。
	// 収録データの入力ページは `isReferableSkillId()` で外しているので、残しても影響は無い。
	function buildSkillTextIndex(opts) {
		const searchableOnly = !!(opts && opts.searchableOnly);
		const pool = masterSkills.map(sk => ({ id: sk.id, name: sk.name }))
			.concat(searchableOnly ? [] : (ensureUserData().customSkills || []).map(c => ({ id: c.customId, name: c.name })))
			.concat(extraCatalog.filter(x => !searchableOnly || isSearchableCatalogEntry(x)).map(x => ({ id: x.id, name: x.name })));
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
	 * 母集団は `buildSkillTextIndex()`。検索のモーダルからは `searchableOnly` で呼ぶので、「条件でスキルを検索」の一覧と同じ
	 * 顔ぶれになる（カスタムスキルは 2026-09-27 から入らない）。
	 * **ただし「条件で検索」と違い、追加済みのものも落とさずに返す**（呼び出し側で「追加済み」と示して選べなくする。
	 * 一覧から消すと利用者が「打ち間違えたのか」と迷うため）。
	 *
	 * @returns {{ query:string, hits:Array<{id,name,norm}>, total:number, more:number }}
	 */
	function findSkillsByNameFragment(text, opts) {
		const query = normalizeSkillText(text);
		if (!query) return { query: '', hits: [], total: 0, more: 0 };
		const starts = [], contains = [];
		buildSkillTextIndex(opts).forEach(p => {
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
	function matchPastedSkillText(text, opts) {
		const index = buildSkillTextIndex(opts);
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
		// 除外中の行（段3b）。**色で表す**（opacity は使わない）。理由は読めるよう、名前より濃い補助色にする。
		// 狭い幅では理由が名前の下へ折り返す（はみ出さない）。
		'.usd-row--excluded { flex-wrap: wrap; color: var(--uma-text-faint); cursor: default; }',
		'.usd-row--excluded:hover { background: transparent; }',
		'.usd-row--excluded input { cursor: default; }',
		'.usd-row-reason { margin-left: auto; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); }',
		'.usd-excluded-count { margin-left: var(--uma-sp-2); font-weight: 600; color: var(--uma-text-subtle); white-space: nowrap; }',
		'.usd-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
		// 既存の .glass-card 相当（テンプレート編集パネル・モーダルの下地）
		'.usd-modal { position: fixed; inset: 0; background: rgba(15,23,42,.4); z-index: 80; display: flex; align-items: flex-end; justify-content: center; }',
		'.usd-modal[hidden] { display: none !important; }',
		/* 幅は **42rem（672px）**。70セッション目の段3 で軸が10本になったとき 47rem へ広げたが、
		 * 段4 のあとに**2軸を絞り込みから外して8本へ戻した**ので、幅も元に戻した。
		 *
		 * 実測（1行の指定を当てた状態での「要る幅」と「使える幅＝モーダルの幅 − 左右の余白 32px」）:
		 *   8軸で要るのは **544px**。34rem→512px（32px 足りない）／**36rem→544px（ちょうど）**／
		 *   **42rem→640px（余り 96px）**。
		 * 最小は 36rem だが**余りが 0**。42rem なら**タブ1枚ぶん（74〜77px）より広い余裕**があり、
		 * ラベルが多少伸びても静かに格子へ落ちない。**元の幅でもあるので、戻すのが素直。**
		 * （参考: 10軸のときは 701px 要り、45rem＝688px では 13px 足りず、46rem は余り 3px、47rem で余り 19px だった。）
		 *
		 * ねらいは C-14 の「フォルダの見出し風」（data-usd-rows="1"）を PC で保つこと。
		 * 1行に収まっているかは run-smoke が**実際のレイアウトから**見張っている（幅の値は書いていない）。 */
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
		// サポートカードの候補だけ、種類ごとの色で塗る（C-62 の (1)）。スキルの候補（.usd-name-hit）は
		// 種類を持たないので、この修飾クラスが付いたときだけ色が変わる。
		'.usd-name-hit--typed { border-color: var(--usd-card-border); background: var(--usd-card-bg); color: var(--usd-card-text); }',
		'.usd-name-hit--typed:hover { background: var(--usd-card-bg); filter: brightness(.96); }',
		// 育成ウマ娘の候補（C-63 の (6)）。種類が無いので色では分けられない。★取り表の列と
		// 同じ薄い灰（--uma-table-col-alt）と白を交互にして、行の切れ目だけが分かるようにする。
		'.usd-name-hit--plain { border-color: var(--uma-border); background: var(--uma-surface); color: var(--uma-text); }',
		'.usd-name-hit--plain.usd-name-hit--row-alt { background: var(--uma-table-col-alt); }',
		'.usd-name-hit--plain:hover { background: var(--uma-surface-muted); }',
		// 追加済みは一覧から消さずに出して、選べない見た目にする
		'.usd-name-hit--added { border-color: var(--uma-border); background: var(--uma-surface-sunken);',
		'  color: var(--uma-text-faint); cursor: default; }',
		'.usd-name-hit--added:hover { background: var(--uma-surface-sunken); }',
		'.usd-name-added { flex-shrink: 0; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); }',
		'.usd-name-none { margin-bottom: var(--uma-sp-2); }',

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

		/* 件数バッジ（C-14）。条件が入っている軸のタブの角に出して、
		   他のタブに隠れた条件を見落とさないようにするためのもの。
		   **72セッション目・段9 のやり直しで、入口のボタンの中（`.usd-entry-count`）にも同じものを使う。**
		   見た目の定義は**1か所にまとめてある** ―― 「タブと同じバッジ」を意図しているので、
		   片方だけ色や大きさが変わると意図が崩れる。違うのは置き方（角に浮かせるか、文字の後ろに並べるか）だけ。 */
		'.usd-tab-count, .usd-entry-count { min-width: 17px; height: 17px;',
		'  padding: 0 5px; border-radius: var(--uma-r-full); font-size: var(--uma-fs-2xs); font-weight: 700;',
		'  line-height: 17px; text-align: center; color: var(--uma-text-inverse); background: var(--uma-accent); }',
		'.usd-tab-count { position: absolute; top: 3px; right: var(--uma-sp-1); }',
		'.usd-entry-count { display: inline-block; margin-left: var(--uma-sp-1-5); vertical-align: 1px; }',
		'[data-usd-rows="1"] .usd-tab[aria-selected="true"] .usd-tab-count { top: 7px; }',
		'.usd-tab-count[hidden], .usd-entry-count[hidden] { display: none; }',
		// 「緑スキル」の入口の草の芽。**色で名乗るのはこのアイコンだけ**（段9 のやり直し）。
		// lucide は <i> のクラスを <svg> へ引き継ぐので、stroke="currentColor" がこの色を拾う。
		'.usd-green-icon { color: var(--uma-green-skill); }',

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
		'.usd-axis-hint { margin: 0; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); }',
		'.usd-link-btn { margin-left: auto; font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  padding: var(--uma-sp-0-5) var(--uma-sp-1-5); border-radius: var(--uma-r-sm); color: var(--uma-accent-soft-text);',
		'  background: none; border: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }',
		'.usd-link-btn:disabled { color: var(--uma-border-strong); text-decoration: none; cursor: default; }',

		/* 選択肢の置き場。**3段ぶんで頭打ち**にして、続きはこの中だけを縦スクロールさせる。
		 * 選択肢が最多の軸（レース環境21個）に高さを合わせると、それだけでモーダルが埋まるため。
		 *
		 * **70セッション目・段4 で作り直した。**
		 * それまでは「2行ぶん＋3行目が4分の3ほど覗く」高さ（`* 2.75`）で、続きがあることは
		 * **箱の下端に重なる半透明の帯（フェード）**で示していた。これが読めなかった ――
		 * 覗いている 24px のうち **20px がフェードの下**にあり、素の色で見えているのは
		 * **上から 4px だけ**だった（実測）。設計では3行目は「覗かせる行」だったが、
		 * 利用者は「3段目の選択肢」として読もうとする。
		 *
		 * 直し方は2つ組み合わせている:
		 *   (1) 高さを**3段ちょうど**にする（`* 3 + 隙間 * 2`）。半端に切れる行が出ない。
		 *   (2) **重なる合図をやめ、箱の外に出す**（`.usd-opts-more`）。
		 *       重ねている限り「いちばん下の行がかすむ」ことは高さを変えても消えないため。
		 *       外に出した合図は**あと何件あるか**まで言えるので、フェード（「まだある」だけ）より
		 *       読み取れることが多い。
		 * 高さは px で書かず、**チップの実測値**（--usd-opt-row。updatePickerFilterLayout が入れる）
		 * と隙間のトークンから出す。チップの余白を触った瞬間に半端な高さへずれるのを避けるため。 */
		// 目標のレースの距離（C-97）。選択肢の下・合図の行の下に置く。エラーの文は1行まるごと（flex-basis:100%）
		'.usd-target-distance { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-1) var(--uma-sp-2);',
		'  margin-top: var(--uma-sp-1); font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); }',
		'.usd-target-distance-label { font-weight: 600; color: var(--uma-text-heading); }',
		'.usd-target-distance-field { display: inline-flex; align-items: center; gap: var(--uma-sp-1); }',
		'.usd-target-distance-input { width: 6.5em; padding: var(--uma-sp-0-5) var(--uma-sp-1-5); font-size: var(--uma-fs-sm); }',
		'.usd-target-distance-input[aria-invalid="true"] { border-color: var(--uma-danger-text); }',
		'.usd-target-distance-hint { flex-basis: 100%; margin: 0; }',
		// エラーの文は**場所を常に取る**（1行ぶんの min-height ＋ visibility）。hidden で消すと、
		// 文が出た瞬間にパネルが伸びて下のスキル一覧が跳ねる（375px で実測 230→236px）
		'.usd-target-distance-error { flex-basis: 100%; margin: 0; min-height: var(--uma-lh-xs); visibility: hidden;',
		'  color: var(--uma-danger-text); font-weight: 600; }',
		'.usd-target-distance-error[data-shown="true"] { visibility: visible; }',
		'.usd-opts-wrap { position: relative; }',
		'.usd-opts { display: flex; flex-wrap: wrap; gap: var(--uma-sp-2);',
		'  max-height: calc(var(--usd-opt-row) * 3 + var(--uma-sp-2) * 2);',
		'  overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }',
		'.usd-opts::-webkit-scrollbar { display: none; }',

		/* 続きがあることの合図。**箱の外**（下）に1行ぶんの場所を常に取る。
		 * **`hidden` で消さず `visibility` で消す** ―― 消すと、スクロールして続きが無くなった
		 * 瞬間にこの行のぶんだけ下のスキル一覧が跳ねる。場所は取ったまま中身だけ消す。
		 * 押すと1段ぶんスクロールする（段の高さは実測から出す。JS側を読むこと）。 */
		// **高さは文字の有無に関わらず一定**にする。中のボタンは見えないとき文字が空になるので、
		// min-height を置かないと 4px まで縮んで、合図が出た軸と出ない軸でパネルの高さが変わる
		// （＝下のスキル一覧が跳ねる）。値は書かず、中のボタンと同じ組み方（行の高さ＋上下の余白）で出す。
		'.usd-opts-more { display: flex; align-items: center; justify-content: flex-end;',
		'  margin-top: var(--uma-sp-1-5); min-height: calc(var(--uma-lh-xs) + var(--uma-sp-0-5) * 2); }',
		'.usd-opts-more-btn { font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  display: inline-flex; align-items: center; gap: var(--uma-sp-1);',
		'  padding: var(--uma-sp-0-5) var(--uma-sp-2); border: 0; border-radius: var(--uma-r-full);',
		'  background: var(--uma-surface-muted); color: var(--uma-text-muted); cursor: pointer; }',
		'.usd-opts-more-btn:hover { background: var(--uma-border); color: var(--uma-text-heading); }',
		'.usd-opts-more[data-more="none"] { visibility: hidden; }',

		/* 選択肢パネルを畳んだ状態（70セッション目・段4 の続き）。
		 * 選択中のタブをもう一度押すと閉じ、下のスキル一覧の場所がそのぶん広がる。
		 * **「絞り込み中」の行は畳まない** ―― 閉じている間も、どの軸に何が入っているかが読めるように。
		 * 畳んだときは**選択中のタブの下辺の色を戻して、タブ帯の下の線をつなげる**
		 * （開いているときは下辺を面の色で塗ってパネルと地続きに見せているので、
		 *   そのままだと「開いているのに中身が無い」ように見える）。 */
		'[data-usd-open="false"] .usd-tabpanels { display: none; }',
		'[data-usd-open="false"] [data-usd-rows="1"] .usd-tab[aria-selected="true"] {',
		'  margin-top: var(--usd-tab-lift); min-height: 3.1rem;',
		'  border-bottom-color: var(--uma-border); box-shadow: inset 0 3px 0 var(--uma-control); }',

		/* 絞り込み結果の一覧。**畳んで空いたぶんをここが受け取る。**
		 *
		 * 畳んでも**モーダル全体の高さが変わらない**のが狙い。素の作りでは、モーダルは
		 * 下ぞろえ（`.usd-modal` の align-items: flex-end）で高さが中身で決まるので、
		 * 選択肢パネルが消えたぶん**モーダルが縮むだけ**で、一覧の箱は 280px のまま
		 * ―― 一度に見える行数が増えない（実測: 1280px で 9行 → 9行）。
		 * そこで、**消えた選択肢パネルの高さ（--usd-results-extra）を一覧の上限に足す**。
		 * 足し引きが同じ量なので中身の合計は変わらず、**モーダルの高さも上端も動かない。**
		 * 値は JS が実測して入れる（setPickerAxisPanelOpen）。開いているときは 0。
		 *
		 * **71セッション目・段6【3】: `max-height` をやめて `height` にした。**
		 * それまでは「中身が上限より短いときは、埋めるものが無いのでモーダルは縮む」作りだったが、
		 * **絞り込んだ件数が変わるたびにモーダルの高さが動くのが読みにくい**（下ぞろえなので
		 * 下端は動かず、**上端だけがせり上がったり下りたりする**）。実測:
		 *   1280px … 445/20/10件は 757px で不動。**7件で 682px、5件で 624px、1件で 508px**
		 *   375px  … 7件までは 765px（本文がまだスクロールしている）。**6件で 736px、1件で 591px**
		 * `height` にすると箱が常に 280px＋extra になるので、**件数が何件でもモーダルは動かない。**
		 * 0件・1件のときは空白の箱になるが、**「結果が少ない」ことは件数の表示（絞り込み結果 N件）が
		 * 言っている**ので、高さでそれを表す必要は無い。
		 * **`--usd-results-extra`（畳んだぶんを受け取る足し算）はそのまま効く** ――
		 * 上限が固定値になっただけで、式は変えていない。 */
		'.usd-results { border: 1px solid var(--uma-border); border-radius: var(--uma-r-lg);',
		'  height: calc(280px + var(--usd-results-extra, 0px)); overflow: auto; }',
		/* 1件も当たらなかったとき（71セッション目・段7、案(ア)）。
		 * 高さを固定したので、文だけが上端に張り付いて下に 240px の空白が残っていた。
		 * **文を箱の中央に置く**と、空白が上下に分かれて「空の箱」として読める。
		 * 見分けは中身の形で付ける ―― 当たったときは `<label class="usd-row">` が並び、
		 * 0件のときだけ `<p>` が1つ（renderPickerResults）。**JS 側に印を足さずに済む。**
		 * `:has()` はこのファイルで既に使っている（.usd-opt:has(input:checked)）。 */
		'.usd-results:has(> p) { display: flex; align-items: center; justify-content: center; }',
		/* 「緑スキルを追加」の一覧（72セッション目・段9）。
		 * このモードには上に選択肢パネルが無いので、280px のままだとモーダルが半分ほどの高さになり、
		 * 67件を9行ずつ送ることになる。**高さだけを上書きする** ―― 罫線も 0件の中央ぞろえも
		 * .usd-results のものをそのまま使う。
		 * **固定値なのは「条件で検索」と同じ理由**（段6【3】）で、件数でモーダルの高さを動かさないため。
		 * `min()` の上限（560px）は、`.usd-modal-panel` の max-height: 85vh に余裕を持って収まる値。 */
		'.usd-results--tall { height: min(60vh, 560px); }',

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
		/* 呼び出し元の画面に並べる入口ボタン。
		   **折り返さず、横に送る**（73セッション目）。収まるときは普通の1行のままで、
		   **収まらないときだけ横スクロールになる** ―― C-14 の絞り込みタブ（css/shell.css の
		   `.uma-subtabs`）と同じ考え方で、**幅の px は決め打ちしない**（収まるかどうかで決まる）。
		   **端でボタンが切れて見えること自体が「続きがある」合図**なので、
		   **霞み・矢印・「端へ移動」・スクロールバーは付けない。**
		   並び順は使用頻度の高い順（条件で検索 → 緑スキル → テキストで検索 → スクショで追加 →
		   未収録スキルを追加）なので、画面の外へ出るのは使用頻度の低いほうになる。 */
		'.usd-entry-row { display: flex; flex-wrap: nowrap; gap: var(--uma-sp-2); margin-bottom: var(--uma-sp-3);',
		'  min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none;',
		/* スマホで横に振り切ったときにブラウザの「戻る」が出ないようにする */
		'  overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }',
		'.usd-entry-row::-webkit-scrollbar { display: none; }',
		// 縮まない・文字も折らない（折り返しをやめたので、縮むと文字が潰れる）
		'.usd-entry-row > * { flex: none; white-space: nowrap; }',
		/* **入口のボタンだけ小さくする**（73セッション目の手直し）。
		   上下・左右の余白と文字を一段落とす。**どの幅でも同じ大きさ**にする ――
		   狭いときだけ切り替えると、境目の幅でボタンの大きさが変わって揺れるため。
		   `.uma-btn` そのものは触らない（他の画面のボタンに波及させない）。 */
		'.usd-entry-row > .uma-btn { padding: var(--uma-sp-1-5) var(--uma-sp-2-5); gap: var(--uma-sp-1);',
		'  font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); }',
		/* **次の入口を必ず覗かせるための切り詰め**（73セッション目の手直し）。
		   実測すると、**ボタンの境目が表示範囲の右端とぴったり一致する幅が、境目の数だけ現れる**
		   （320〜1280px を 2px 刻みで測ると、あふれる幅のうち 1割強がそれ）。
		   ボタンを小さくしても**境目が増えるだけで無くならない**ので、大きさでは解決しない。
		   そこで、その幅のときだけ**表示範囲の右端をわずかに内側へ寄せて**、
		   直前のボタンが必ず切れて見えるようにする。値は JS が実測して入れる（F-28 と同じ考え方）。
		   **横に送りきったときは影響しない**（表示範囲が狭くなるぶん送れる量も増えるので、
		   最後の入口は丸ごと見える）。 */
		'.usd-entry-row { margin-inline-end: var(--usd-entry-trim, 0px); }',
		/* **隠れている側にだけ、わずかなフェード**（73セッション目の手直し）。
		   端で切れているだけでは、切れ目の位置が幅で動くので気づけない幅がある。
		   **文字が読めなくなるほど濃くしない**（端で 0.3 まで。完全には消さない）。
		   矢印・「端へ移動」・スクロールバーは引き続き出さない。 */
		'.usd-entry-row[data-usd-fade="right"], .usd-entry-row[data-usd-fade="both"] {',
		'  --usd-fade-r: rgba(0,0,0,.3) 100%; }',
		'.usd-entry-row[data-usd-fade="left"], .usd-entry-row[data-usd-fade="both"] {',
		'  --usd-fade-l: rgba(0,0,0,.3) 0; }',
		'.usd-entry-row[data-usd-fade] {',
		'  -webkit-mask-image: linear-gradient(to right, var(--usd-fade-l, #000 0), #000 var(--usd-entry-fade-w),',
		'    #000 calc(100% - var(--usd-entry-fade-w)), var(--usd-fade-r, #000 100%));',
		'  mask-image: linear-gradient(to right, var(--usd-fade-l, #000 0), #000 var(--usd-entry-fade-w),',
		'    #000 calc(100% - var(--usd-entry-fade-w)), var(--usd-fade-r, #000 100%)); }',
		'.usd-entry-row { --usd-entry-fade-w: 26px; }',
		/* フォーカスの枠は**内側に**描く。overflow-y: hidden なので、既定の outline-offset: 2px の
		   ままだと上下がこの行に切られて見えなくなる（`.uma-subtab` が同じ理由で内側にしている）。 */
		'.usd-entry-row > *:focus-visible { outline-offset: -2px; }',
		/* Deck の比較シート編集の入口は uma-skill-deck.html が自前で持っていて core の描画を通らない。
		   同じ振る舞いにするため同じクラスを当てるが、**下の余白だけそちらの元の値（8px）に合わせる**。 */
		'.usd-entry-row--inline { margin-bottom: var(--uma-sp-2); }',
		'@media (prefers-reduced-motion: reduce) { .usd-tab, .usd-opt { transition: none; } }',

		// 編成パネル（C-51）
		'.usd-roster { display: flex; flex-direction: column; gap: var(--uma-sp-3); }',
		'.usd-roster-sec { display: flex; flex-direction: column; gap: var(--uma-sp-2); }',
		'.usd-roster-h { font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; margin: 0; }',
		'.usd-roster-row { display: flex; flex-wrap: wrap; gap: var(--uma-sp-2); align-items: center; }',
		'.usd-roster-slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--uma-sp-2); }',
		'@media (min-width: 640px) { .usd-roster-slots { grid-template-columns: repeat(3, minmax(0, 1fr)); } }',
		'.usd-roster-slot { display: flex; align-items: center; gap: var(--uma-sp-1); min-width: 0; }',
		// 枠いっぱいに広げたボタンのラベルは左ぞろえ（.uma-btn は中央ぞろえなので上書きする。C-51 の10節④）
		'.usd-roster-slot > button:first-child { flex: 1 1 auto; min-width: 0; text-align: left; justify-content: flex-start;',
		'  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
		// 選択済みのカードの欄は、種類の順番（typeOrder）の色で塗る（C-51 の11節）。色は tokens.css の
		// --uma-card-type-<番号>-* を番号で引く。番号の色が定義されていなければ fallback（既定の面）に落ちる。
		// 値は render() が inline の変数（--usd-card-bg 等）に入れるので、ここは番号を知らない。
		'.usd-roster-slot > button.usd-roster-card--typed { background: var(--usd-card-bg); color: var(--usd-card-text);',
		'  border-color: var(--usd-card-border); border-left-width: 4px; }',
		'.usd-roster-slot > button.usd-roster-card--typed:hover:not(:disabled) { background: var(--usd-card-bg); border-color: var(--usd-card-border); filter: brightness(.97); }',
		// 保存済みの編成を選ぶタブの帯は共有部品（css/shell.css の .uma-subtabs・tabStripHtml()）。C-54 で
		// スキルセットと親A／親Bセットにも広げたので、ここには編成だけの規則は無い。
		// スキルセット（テンプレート管理。C-53）の1画面の骨格
		'.usd-tm { display: flex; flex-direction: column; gap: var(--uma-sp-3); }',
		// 節（A／B／C）の骨格は css/common.css の .uma-section（C-2a で共通部品にした）。
		// **段K で縦並び（A の下に B・C）から横並び（同じ行に3つ）へ変えた**ので、
		// 並びの行そのもの（.uma-section-row）と出っ張りの見た目も css/common.css が持つ。
		// ここに残るのは「B・C を入れる器の並べ方」だけ。1つも無ければ入れ物ごと高さを持たない
		'.usd-tm-scopes:empty { display: none; }',
		// B・C …（C-2c で1行に畳み、段K で A と同じ行へ移した）。1行そのものの見た目は
		// css/common.css の .uma-checkrow（exam も同じ形を使うので共通部品にした）。ここは並べ方だけ。
		// **並びの行は折り返さない**（出っ張りが枠から離れるため）ので、
		// 入りきらないぶんは**この器の中だけ**で折り返す（→ 幅による並べ替えが起きない。段K）。
		'.usd-tm-scopes { display: flex; flex: 1 1 auto; min-width: 0;',
		'  flex-direction: row; flex-wrap: wrap; align-items: center;',
		'  column-gap: var(--uma-section-row-gap); row-gap: 0; }',
		// 名前欄（①の編成名・②のスキルセット名）。欄は行いっぱい（.uma-input の width: 100%）で、
		// 保存／複製／削除はその下の行に折り返す（②も①と同じ並び。C-55 の (3)。それまで②だけ欄と
		// ボタンが同じ行だった）。文字は本文より一段大きく太くして、いま開いているセットの名前として読める大きさにする（C-55 の (6)）。
		'.usd-name-input { font-size: var(--uma-fs-md); line-height: var(--uma-lh-md); font-weight: 600; }',
		'.usd-name-input::placeholder { font-weight: 400; }',
		// スキルセットの分類（超優先／優先／通常）の切り替え（C-57 の (7)）。帯のタブ（.uma-subtabs＝どのセットか）と
		// 混ぜないよう、見た目の違う切り替えピル（.uma-pill）を3つ並べる。選択中は操作の黒（ゲームの緑は使わない。
		// ツール内の一貫性を優先したおいもさんの判断）。件数はピルの中の小さなバッジ
		'.usd-tier-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-2); }',
		'.usd-tier-tabs { display: inline-flex; gap: var(--uma-sp-1); }',
		'.usd-tier-tab .usd-tier-count { font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs); font-weight: 700;',
		'  padding: 0 var(--uma-sp-1-5); border-radius: var(--uma-r-full); background: var(--uma-surface); color: var(--uma-text-subtle); }',
		'.usd-tier-tab.active .usd-tier-count { background: rgba(255, 255, 255, .2); color: var(--uma-text-inverse); }',
		'.usd-tier-total { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); margin-left: auto; }',
		// 「再分類」「削除」のモード（C-57 の (9)）。押した状態を持つボタン。同時には ON にならない。既定は両方 OFF
		'.usd-mode-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-2); }',
		'.usd-mode-btn { font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); font-weight: 600;',
		'  padding: var(--uma-sp-0-5) var(--uma-sp-2-5); border-radius: var(--uma-r-full); cursor: pointer;',
		'  border: 1px solid var(--uma-control-border); background: var(--uma-surface); color: var(--uma-text-heading); }',
		'.usd-mode-btn:hover { border-color: var(--uma-control-border-strong); background: var(--uma-control-soft); }',
		'.usd-mode-btn[aria-pressed="true"] { background: var(--uma-control); border-color: var(--uma-control); color: var(--uma-text-inverse); }',
		'.usd-mode-btn:disabled { color: var(--uma-control-disabled); background: var(--uma-control-disabled-bg); border-color: var(--uma-control-disabled-bg); cursor: default; }',
		// スキルパネル（C-57 の (7)(8)）。ゲームの「スキルセット詳細」のパネルに寄せた箱（色は tokens.css の --uma-skillpanel-*）。
		// 並びは CSS Grid: PC は画面幅に合わせて可変（auto-fill）、640px 以下は 2 列固定（ゲームと同じ）。
		// 長い名前は 2 行まで折り返し、超えるぶんは「…」（ゲームは1行で切るが、こちらは名前で照合するので読めるほうを優先）
		'.usd-panels { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--uma-sp-2); }',
		'@media (max-width: 640px) { .usd-panels { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',
		// 地・枠・影は css/tokens.css の --uma-skillpanel-*（C-58 の作業A。ゲームの板の質感に寄せた
		// 横方向のグラデーション＋下端の内側の影＋上端の白いハイライト）。ここには値を書かない
		'.usd-panel { display: flex; align-items: center; gap: var(--uma-sp-1-5); min-width: 0; min-height: 36px;',
		'  padding: var(--uma-sp-1-5) var(--uma-sp-2); border-radius: var(--uma-r-sm);',
		'  background: var(--uma-skillpanel-bg); border: 1px solid var(--uma-skillpanel-border);',
		'  box-shadow: var(--uma-skillpanel-shadow); color: var(--uma-text); }',
		'.usd-panel-name { flex: 1 1 auto; min-width: 0; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); font-weight: 600;',
		'  overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }',
		// 各パネルの操作（モードが ON のときだけ出る）: 削除モードは ×、再分類モードは移動先の分類名の小ボタン
		// ②因子周回の行（段7d の ⑬）: 名前（button）と Pt を1行に。長いときは横に送る（続きがある側に薄いフェード）。パネルの高さは変えない
		'.usd-panel-name--scroll { display: flex; align-items: center; gap: var(--uma-sp-1-5); white-space: nowrap; overflow-wrap: normal;',
		'  overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior-x: contain; align-self: stretch; margin-block: -6px; padding-block: 6px; }',
		'.usd-panel-name--scroll::-webkit-scrollbar { display: none; }',
		'.usd-panel-name--scroll > * { flex: none; }',
		'.usd-panel-namebtn { position: relative; font: inherit; color: inherit; background: transparent; border: 0; padding: 0; cursor: pointer; text-align: left;',
		'  text-decoration: underline; text-decoration-color: var(--uma-border-strong); text-underline-offset: 2px; }',
		'.usd-panel-namebtn:hover { text-decoration-color: currentColor; }',
		// タップの領域は、見た目の大きさを変えずに広げる（パネルの高さの中に収まる）
		'.usd-panel-namebtn::after { content: ""; position: absolute; inset: -8px -3px; }',
		'.usd-panel-pt { font-weight: 400; color: var(--uma-text-subtle); }',
		'.usd-panel-pt:empty { display: none; }',
		'.usd-panel-ops { display: inline-flex; flex: none; gap: var(--uma-sp-1); align-items: center; }',
		// 再分類モードの移動先ボタン2つは、2列固定の狭い画面では名前と同じ行に入らない（名前が2文字＋「…」になる。実測）ので、
		// 名前の下の行へ折り返す
		'@media (max-width: 640px) {',
		'  .usd-panel--reclass { flex-wrap: wrap; }',
		'  .usd-panel--reclass .usd-panel-ops { flex-basis: 100%; justify-content: flex-end; }',
		'}',
		'.usd-panel-move { font: inherit; font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs); font-weight: 700;',
		'  padding: 0 var(--uma-sp-1-5); border-radius: var(--uma-r-full); cursor: pointer;',
		'  border: 1px solid var(--uma-control-border); background: var(--uma-surface); color: var(--uma-text-heading); }',
		'.usd-panel-move:hover { background: var(--uma-control-soft); border-color: var(--uma-control-border-strong); }',
		'.usd-panel-del { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--uma-r-full);',
		'  border: 0; background: var(--uma-surface); color: var(--uma-text-muted); cursor: pointer; padding: 0; }',
		'.usd-panel-del:hover { background: var(--uma-danger-bg); color: var(--uma-danger-text); }',
		'.usd-tm .usd-entry-row { margin-bottom: 0; }',
		'.usd-roster-pills { display: flex; flex-wrap: wrap; gap: var(--uma-sp-1); }',
		'.usd-roster-pill { font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  padding: var(--uma-sp-0-5) var(--uma-sp-2-5); border-radius: var(--uma-r-full); cursor: pointer;',
		'  border: 1px solid var(--uma-border); background: var(--uma-surface); }',
		// 番号を持たない種類（色が引けない）だけ、選んでいることを枠の濃さで示す
		'.usd-roster-pill[aria-pressed="true"] { border-color: var(--uma-text-heading); font-weight: 700; }',
		// 種類ごとの色（C-62 の (1)）。色は番号（typeOrder）で --uma-card-type-<番号>-* から引き、
		// render() が inline の変数（--usd-card-*）に入れる（＝ここは番号も種類の名前も知らない）。
		// 選んでいることは「色が付くこと」ではなく**枠の二重線と太字**で示す（色は種類の見分けに使い切る）。
		'.usd-roster-pill--typed { background: var(--usd-card-bg); border-color: var(--usd-card-border); color: var(--usd-card-text); }',
		'.usd-roster-pill--typed[aria-pressed="true"] { border-color: var(--usd-card-text); box-shadow: inset 0 0 0 1px currentColor; font-weight: 700; }',
		// 「すべて」は種類ではないので黒と白（選択中＝黒地に白）
		'.usd-roster-pill--all[aria-pressed="true"] { background: var(--uma-surface-inverse); border-color: var(--uma-surface-inverse);',
		'  color: var(--uma-text-inverse); font-weight: 700; }',
		// ★取り表（C-51 の10節⑥）。<table> ではなく div ＋ CSS Grid（比較シートと同じ流儀）。
		// **縦スクロールだけ**にする（overflow-x: hidden）。横スクロールを作らないので、
		// スマホで縦横が同時に動く「斜めスクロール」は構造的に起きない。幅が足りないぶんは
		// スキル名の列（minmax(0, 260px)）が縮んで折り返しで吸収する。番号の列は 26px 固定で、
		// 列の数（1＋カードの枠数）は JS が --usd-roster-cols に入れる。右端の余り列は
		// 行の地色を右端まで届かせるためのもの（JS が空セルを1つ出す）。
		'.usd-roster-grid-wrap { max-height: 320px; overflow-y: auto; overflow-x: hidden;',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-sm); background: var(--uma-surface); }',
		// 列の幅は画面幅で自動で切り替える（C-54 の (6)(7)）:
		//   狭い画面（既定）… スキル名の列は残りの幅（minmax(0, 1fr)）、メンバーの列は 24px 固定。見出しは印と番号だけ。
		//                     （28px → 24px は段3。名前セルの2行目「基礎 240 → 216 Pt（Lv1）」が 375px で1行に収まる幅を確保するため）
		//   768px 以上      … メンバーの列を広げて見出しにウマ娘名（短い名前）も出す。スキル名の列は 140〜260px。
		// 利用者が選ぶ切り替えにしなかった理由: 決め手は物理的な幅なので、幅で決めるほうが迷わせない（C-54）。
		// 段7の (15): 狭い幅では、スキル名の列を表の幅の約 1/3（固定）、メンバーの列の全体を約 2/3 にする（各列は等分）
		'.usd-roster-grid { display: grid; width: 100%;',
		'  grid-template-columns: 33.333% repeat(var(--usd-roster-cols, 7), minmax(0, 1fr)); }',
		'.usd-roster-gh-name { display: none; }',
		'@media (min-width: 768px) {',
		'  .usd-roster-grid { grid-template-columns: minmax(140px, 260px) repeat(var(--usd-roster-cols, 7), minmax(64px, 1fr)); }',
		'  .usd-roster-gh { flex-direction: column; gap: 2px; padding: var(--uma-sp-1); }',
		'  .usd-roster-gh.usd-roster-gc--name { flex-direction: row; }',
		'  .usd-roster-gh-name { display: block; font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs); font-weight: 600;',
		'    text-align: center; white-space: normal; overflow-wrap: anywhere; max-width: 100%; }',
		'}',
		'.usd-roster-grow { display: contents; }',
		// 列の見分け（C-51 の11節⑥〜⑧）: 行は横のヘアラインだけで区切り（行の交互の地色はやめた。
		// 行と列の両方を交互にすると市松になる）、列の側で地色を分ける。
		//   育成ウマ娘の列 … ツールのアクセントの淡い地＋右端に区切り線（見出しから全行まで）
		//   カードの列     … 1列おきに灰（--uma-surface-muted）と白
		// 表の見た目の確定形（C-57 の作業A・57セッション目）:
		//   本体のセルは白のまま。列の区別は地色ではなく**罫線**で行う（すべての列の間に縦の細い線、
		//   行の間は今までどおりの横のヘアライン）。塗るのは見出しのセルだけで、育成ウマ娘の列は
		//   見出しのセルの色味（濃い地に白い ♦）だけで区別する。1列おきの灰（--alt）はやめた。
		//   罫線と見出しの色は css/tokens.css の --uma-table-* で1か所で持つ（地色に依存させない＝
		//   ダークモードに対応するときはトークンを変えるだけ）。
		'.usd-roster-gc { min-width: 0; display: flex; align-items: center; justify-content: center;',
		'  padding: var(--uma-sp-1) var(--uma-sp-0-5); font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  background: var(--uma-surface); border-bottom: 1px solid var(--uma-table-rule); }',
		// 列の間の縦線（先頭のスキル名の列には引かない＝列と列の「間」だけ）
		'.usd-roster-gc:not(.usd-roster-gc--name) { border-left: 1px solid var(--uma-table-rule); }',
		// 1列おきの薄い灰（C-62 の (3)）。**罫線だけでは列を目で追えなかった**ので、C-57 でやめた
		// 縞を戻した。ただし戻したのは**サポートカードの列だけ**で、行の交互の地色は戻していない
		// （行と列の両方を交互にすると市松になる。C-51 の11節⑥〜⑧）。育成ウマ娘の列は
		// 見出しの色味だけで区別する扱いのまま＝本体のセルは白。
		'.usd-roster-gc--alt { background: var(--uma-table-col-alt); }',
		// 育成ウマ娘の列は本体のセルも地を敷く（C-63 の (4)）。見出しの色味だけで区別していたが、
		// **列としても追える**ようにする。1列おきの灰（--uma-table-col-alt）とは別の値
		// （--uma-table-col-key。一段濃い）にして、縞の一部に見えないようにする。
		// 見出しのセルは後ろの .usd-roster-gh が上書きするので、濃い地のまま。
		'.usd-roster-gc--uma { background: var(--uma-table-col-key); }',
		// 余り列のセルは余白を持たない（0px の列に余白ぶんだけはみ出して横スクロールの種になるため）
		'.usd-roster-gc--fill { padding: 0; }',
		'.usd-roster-gc--name { justify-content: flex-start; text-align: left; padding-left: var(--uma-sp-2);',
		'  font-weight: 700; overflow: hidden; }',
		// 見出し行（番号）は縦スクロール中も上に固定する。見出しのセルだけ地を塗る
		'.usd-roster-gh { position: sticky; top: 0; z-index: 1; background: var(--uma-table-head-bg);',
		'  font-weight: 700; color: var(--uma-text-heading); border-bottom: 1px solid var(--uma-table-rule-strong); }',
		// 育成ウマ娘の列は見出しのセルだけ濃い地（--uma-table-head-key-bg）に白い文字と ♦
		'.usd-roster-gh.usd-roster-gc--uma { background: var(--uma-table-head-key-bg); color: var(--uma-table-head-key-text); }',
		'.usd-roster-gh.usd-roster-gc--uma.usd-roster-gh--empty { color: var(--uma-table-head-key-text); opacity: 1; }',
		'.usd-roster-gh--empty { color: var(--uma-text-faint); font-weight: 400; }',
		// 見出しのセルは、サポートカードの種類ごとの色（C-62 の (2)）。1列おきの灰より後に書いて
		// 上書きする（灰は本体のセルのための縞で、見出しは種類の色が主）。空き枠には色が付かない
		// （typeOrder が無い＝colStyle が何も出さない）ので、そのまま既定の見出しの地に落ちる。
		'.usd-roster-gh.usd-roster-typed { background: var(--usd-card-bg); color: var(--usd-card-text); }',
		// 表の中の「得られる」印は**黒い輪郭の丸（塗りつぶしなし）**（C-57 の作業A。それまでは橙の★）。
		// 文字ではなく CSS で描く（フォントで太さや大きさが変わらないように）
		'.usd-roster-got { display: inline-block; width: 11px; height: 11px; border-radius: var(--uma-r-full);',
		'  border: 1.5px solid var(--uma-text-heading); box-sizing: border-box; }',
		// イベントの選択肢しだいで得られるもの（C-102）は**輪郭の△**。●（輪郭の丸）と同じ色・同じ線の太さ・
		// ほぼ同じ大きさにして、形だけで見分ける。△の線は SVG をマスクにして CSS の色で塗る
		// （文字の「△」はフォントで大きさと太さが変わるので使わない。●と同じ考え方）
		'.usd-roster-maybe { display: inline-block; width: 13px; height: 12px; background: var(--uma-text-heading); vertical-align: middle;',
		'  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 13 12%27%3E%3Cpath d=%27M6.5 1.2 12 10.9H1z%27 fill=%27none%27 stroke=%27%23000%27 stroke-width=%271.5%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E") center / contain no-repeat;',
		'  mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 13 12%27%3E%3Cpath d=%27M6.5 1.2 12 10.9H1z%27 fill=%27none%27 stroke=%27%23000%27 stroke-width=%271.5%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E") center / contain no-repeat; }',
		// 育成ウマ娘の見出しと凡例の印は**白い ♦（正方形を 45 度回したもの）**（C-57 の作業A。◎ → ● → ♦）。
		// 見出しと同じ濃い地のチップに白い ♦ を CSS で描く（見出しの中では地が同じなので ♦ だけが見える）。
		'.usd-roster-umamark { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 16px;',
		'  background: var(--uma-table-head-key-bg); border-radius: var(--uma-r-sm); }',
		'.usd-roster-umamark::before { content: ""; display: block; width: 7px; height: 7px; background: var(--uma-table-head-key-text);',
		'  transform: rotate(45deg); }',
		// 番号のバッジ（表の列見出し・カードの選択欄・イベントの小窓の見出しが使う部品。凡例は段7c の L で削除した）
		'.usd-roster-legend-no { flex: none; min-width: 20px; text-align: center; font-weight: 700;',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-sm); }',
		// 番号は表の見出しと同じ色にする（C-62 の (2)）。凡例は「番号 → 正式名称」の対応表なので、
		// 番号の見た目が表と食い違うと対応を追えない。
		'.usd-roster-legend-no.usd-roster-typed { background: var(--usd-card-bg); border-color: var(--usd-card-border);',
		'  color: var(--usd-card-text); }',
		'.usd-roster-note { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); margin: 0; }',
		'.usd-roster-warn { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); margin: 0; }',
		// スキルPt（段3）。育成の設定の箱・合計の行・名前セルの2行目。色と寸法はトークンだけで、共有の CSS には足していない
		'.usd-roster-settings { display: flex; flex-direction: column; gap: var(--uma-sp-1-5); padding: var(--uma-sp-2) var(--uma-sp-3);',
		'  background: var(--uma-surface-sunken); border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-sm); }',
		'.usd-roster-setrow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-1) var(--uma-sp-3); }',
		'.usd-roster-setlabel { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-roster-radio--disabled, .usd-roster-radio--disabled > input { cursor: not-allowed; }',
		'.usd-roster-radio--disabled { color: var(--uma-text-faint); }',
		'.usd-roster-ptsum { display: flex; flex-direction: column; gap: var(--uma-sp-1); }',
		'.usd-roster-ptsum-main { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-2); }',
		'.usd-roster-ptsum-total { font-size: var(--uma-fs-md); line-height: var(--uma-lh-md); font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-roster-skillcell { display: flex; flex-direction: column; gap: 1px; min-width: 0; }',
		'.usd-roster-pt { font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs); font-weight: 400; color: var(--uma-text-subtle); }',
		// 有効にする（段4）。△の行の2行目の参考値は薄い色、3行目のボタンは既存の .uma-btn の大きさのまま。
		// 「有効」の添え物は△の下に小さく（△は●と同じ色のまま）
		'.usd-roster-prev { margin: 0; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); color: var(--uma-text); overflow-wrap: anywhere; }',
		'.usd-roster-prev strong { color: var(--uma-text-heading); }',
		// 前段の1行（段7d の ②）: 折り返さず、長いときだけ横に送る（スクロールバーは出さない。続きがある側に薄いフェード）
		'.usd-roster-prevline { white-space: nowrap; overflow-x: auto; overflow-y: hidden; overflow-wrap: normal; scrollbar-width: none; overscroll-behavior-x: contain; }',
		'.usd-roster-prevline::-webkit-scrollbar { display: none; }',
		'.usd-roster-pt--ref { color: var(--uma-text-faint); }',
		// 周回因子セットの必要スキルPt（段5。special の②）。箱・見出しの行・3つの合計のチップ・親由来のレベルのセレクト。
		// トークンと既存の部品（.uma-badge・.uma-help-btn・.uma-help-box・.uma-input）だけで、共有の CSS には足していない
		'.usd-ptneed { display: flex; flex-direction: column; gap: var(--uma-sp-1); padding: var(--uma-sp-2) var(--uma-sp-3);',
		'  background: var(--uma-surface-sunken); border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-sm); }',
		'.usd-ptneed[hidden] { display: none; }',
		'.usd-ptneed-main { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-1-5) var(--uma-sp-2); }',
		'.usd-ptneed-title { font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-ptneed-chips { display: flex; flex-wrap: nowrap; gap: var(--uma-sp-1-5); min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior-x: contain; }',
		'.usd-ptneed-chips::-webkit-scrollbar { display: none; }',
		'.usd-ptneed-chip { flex: none; white-space: nowrap; }',
		'.usd-ptneed-chip { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); padding: var(--uma-sp-0-5) var(--uma-sp-2-5);',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-full); background: var(--uma-surface); color: var(--uma-text); white-space: nowrap; }',
		'.usd-ptneed-chip strong { color: var(--uma-text-heading); }',
		// 必要スキルPt の合計「合計：N Pt ?」（段7d の追加・A）。広い幅は「スキルセット　□シナリオ因子 ?　□遺伝子 ?」の行の右（.usd-ptsum-slot）、
		// 520px 以下は見出しの行の右端（.usd-ptsum--head）。どちらも中身は同じで、CSS が片方だけ見せる（行は増やさない）
		'.usd-ptsum-slot { flex: none; align-self: flex-end; display: flex; align-items: center; min-height: var(--uma-section-tab-h); }',
		'.usd-ptsum-slot:empty { display: none; }',
		'.usd-ptsum { display: inline-flex; align-items: center; gap: var(--uma-sp-1); white-space: nowrap; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text); }',
		'.usd-ptsum strong { color: var(--uma-text-heading); font-size: var(--uma-fs-sm); }',
		'.usd-ptsum--head { display: none; margin-left: auto; }',
		'@media (max-width: 520px) { .usd-ptsum-slot { display: none; } .usd-ptsum--head { display: inline-flex; } }',
		'.usd-ptneed-f { display: inline-flex; align-items: center; gap: var(--uma-sp-2); align-self: flex-start; }',
		'.usd-ptneed-select { width: auto; min-width: 64px; padding: var(--uma-sp-1) var(--uma-sp-2); font-size: var(--uma-fs-sm); }',
		'.usd-roster-enable { align-self: flex-start; margin-top: var(--uma-sp-1); font-weight: 600; }',
		'.usd-roster-onwrap { display: inline-flex; flex-direction: column; align-items: center; gap: 1px; }',
		'.usd-roster-on { font-size: var(--uma-fs-2xs); line-height: 1; font-weight: 700; color: var(--uma-text-heading); white-space: nowrap; }',
		'.usd-roster-unconf { display: flex; flex-wrap: wrap; gap: var(--uma-sp-1); margin: var(--uma-sp-1) 0 0; padding: 0; list-style: none; }',
		'.usd-roster-unconf li { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs);',
		'  border: 1px dashed var(--uma-border); border-radius: var(--uma-r-full); padding: 0 var(--uma-sp-2); }',
		// 2層（C-51 の修正3）: 上位層＝編成と除外、下位層＝育成ウマ娘・サポートカード。
		// 上位層は見出しを一段強くし、下位層は囲みの地色を沈めて内側に寄せる。
		'.usd-roster-top { display: flex; flex-direction: column; gap: var(--uma-sp-2);',
		'  padding-bottom: var(--uma-sp-3); border-bottom: 2px solid var(--uma-border-strong, var(--uma-border)); }',
		'.usd-roster-h--top { font-size: var(--uma-fs-md); line-height: var(--uma-lh-md); }',
		// 下位層は内側へ寄せない（左端を上位層と揃える。C-51 の10節④）。層の見分けは
		// 上位層の下線と、下位層の沈んだ地色の囲みで付ける。
		'.usd-roster-lower { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--uma-sp-3); }',
		'@media (min-width: 720px) { .usd-roster-lower { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); } }',
		'.usd-roster-sub { display: flex; flex-direction: column; gap: var(--uma-sp-2);',
		'  background: var(--uma-surface-sunken); border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-sm);',
		'  padding: var(--uma-sp-2-5) var(--uma-sp-3); }',
		'.usd-roster-h--sub { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle);',
		'  font-weight: 600; letter-spacing: .02em; }',
		'.usd-roster-alert { margin: 0; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-danger-text); }',
		'.usd-roster-unconf--alert li { border-color: var(--uma-danger-text); color: var(--uma-danger-text); }',
		// カード・育成ウマ娘を選ぶミニウィンドウ
		'.usd-roster-modal[hidden] { display: none; }',
		'.usd-roster-modal { position: fixed; inset: 0; z-index: 60; display: flex;',
		'  align-items: center; justify-content: center; padding: var(--uma-sp-3); }',
		'.usd-roster-modal-back { position: absolute; inset: 0; background: rgba(15, 23, 43, 0.4); }',
		'.usd-roster-modal-box { position: relative; z-index: 1; width: min(520px, 100%);',
		'  max-height: min(70vh, 560px); overflow: hidden; display: flex; flex-direction: column; gap: var(--uma-sp-2);',
		'  background: var(--uma-surface); border: 1px solid var(--uma-border);',
		'  border-radius: var(--uma-r-md); padding: var(--uma-card-pad); box-shadow: var(--uma-shadow-lg, 0 10px 30px rgba(0,0,0,.2)); }',
		'.usd-roster-modal-head { display: flex; align-items: center; justify-content: space-between; gap: var(--uma-sp-2); }',
		'.usd-roster-hits { overflow-y: auto; }',
		// スキルの説明（ⓘ・長押し。段6）。器は共有の .uma-overlay .uma-popover（css/shell.css）。ここは中身と ⓘ だけ。
		'.usd-info-line { display: flex; align-items: center; gap: var(--uma-sp-1-5); min-width: 0; }',
		'.usd-info-target { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }',
		'.usd-info-btn { flex: none; }',
		'.usd-info-btn::before { content: "i"; font-style: italic; font-family: Georgia, "Times New Roman", serif; }',
		'.usd-info-back { position: fixed; inset: 0; z-index: 110; background: rgba(15, 23, 43, 0.25); }',
		'.usd-info-back[hidden] { display: none; }',
		'.usd-info-body { display: flex; flex-direction: column; gap: var(--uma-sp-2); font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); color: var(--uma-text); overflow-wrap: anywhere; }',
		'.usd-info-body p { margin: 0; }',
		'.usd-info-rarity { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); font-weight: 700; color: var(--uma-text-subtle); }',
		'.usd-info-desc { white-space: pre-line; }',
		'.usd-info-desc--pending { color: var(--uma-text-subtle); }',
		'.usd-info-self { color: var(--uma-text-heading); }',
		'.usd-roster-line2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--uma-sp-2); }',
		'.usd-roster-share { font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs); color: var(--uma-text-subtle); }',
		'@media (max-width: 600px) { .usd-roster-share { display: none; } }',
		// ───── 段7（2026-10-03）: 本育成パネルの見直し ─────
		// 編成のタブ（(5)）: 1行の横スクロールのチップ。共有 CSS（shell.css の .uma-subtabs）は触らず、このパネルの中だけ上書きする
		'.usd-roster-tabs { display: flex; min-width: 0; }',
		// 名前つきのタブ（段7b・G。①本育成編成と②因子周回で共有の namedTabsHtml）。選んだタブは暗い丸の中に 名前・✎・×、編集中は 入力欄・✓・↩。ボタンは 32px 以上
		'.usd-ntabs { border-bottom: 0; gap: var(--uma-sp-1-5); padding-bottom: 2px; flex-basis: auto; align-items: center; min-width: 0; }',
		'.usd-ntabs .uma-subtab { max-width: 160px; min-width: 0; width: auto; padding: var(--uma-sp-1) var(--uma-sp-2-5); margin-bottom: 0;',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-full); background: var(--uma-surface); color: var(--uma-text);',
		'  font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); min-height: 32px; }',
		'.usd-ntabs .uma-subtab:focus-visible { border-radius: var(--uma-r-full); }',
		'.usd-ntab { flex: none; display: inline-flex; align-items: center; min-height: 32px; border-radius: var(--uma-r-full); scroll-snap-align: start; }',
		'.usd-ntab--sel { background: var(--uma-surface-inverse); color: var(--uma-text-inverse); }',
		'.usd-ntabs .usd-ntab--sel .uma-subtab { background: transparent; border-color: transparent; color: inherit; max-width: 180px; padding-inline-end: var(--uma-sp-1); }',
		'.usd-ntab--edit { background: var(--uma-surface); border: 1px solid var(--uma-control); padding-inline-start: var(--uma-sp-2); }',
		'.usd-ntab-input { width: 150px; max-width: 46vw; min-width: 0; height: 28px; padding: 0 var(--uma-sp-1-5); border: 0; outline: 0; background: transparent;',
		'  color: var(--uma-text-heading); font: inherit; font-size: var(--uma-fs-sm); }',
		'.usd-ntab-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0;',
		'  border-radius: var(--uma-r-full); background: transparent; color: inherit; font: inherit; font-size: var(--uma-fs-md); line-height: 1; cursor: pointer; }',
		'.usd-ntab-btn:hover:not(:disabled) { background: rgba(127,127,127,.22); }',
		'.usd-ntab-btn:focus-visible { outline: 2px solid var(--uma-focus-ring); outline-offset: -2px; }',
		'.usd-ntab-btn:disabled { opacity: .45; cursor: not-allowed; }',
		'.usd-ntab-btn svg { width: 16px; height: 16px; }',
		'.usd-roster-tab--full { opacity: 1; color: var(--uma-text-faint); border-style: dashed; cursor: not-allowed; }',
		'.usd-tm-name-row[hidden] { display: none; }',
		// 育成ウマ娘の欄（(7)(8)）・サポートカードの欄（(9)(10)）: 選択欄の中の右端に ×
		'.usd-roster-h--withinfo { display: flex; align-items: center; gap: var(--uma-sp-1-5); }',
		'.usd-roster-pickbox { display: flex; align-items: stretch; min-width: 0; min-height: 36px;',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-md); background: var(--uma-surface); overflow: hidden; }',
		'.usd-roster-pickbox.usd-roster-card--typed { background: var(--usd-card-bg); border-color: var(--usd-card-border); }',
		'.usd-roster-pickbtn { flex: 1 1 auto; min-width: 0; padding: var(--uma-sp-1-5) var(--uma-sp-2); border: 0; background: transparent; color: inherit;',
		'  font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); font-weight: 600; text-align: left; cursor: pointer;',
		'  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
		// 名前の前のバッジ（段7b の ⑧）: 名前は省略記号で切る。バッジは表の列見出し・凡例と同じ部品（.usd-roster-legend-no / .usd-roster-umamark）
		'.usd-roster-pickbtn { display: flex; align-items: center; gap: var(--uma-sp-1); }',
		'.usd-roster-pickname { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
		'.usd-roster-pickbtn .usd-roster-legend-no, .usd-roster-pickbtn .usd-roster-umamark { flex: none; }',
		'.usd-roster-slot .usd-roster-legend-no { min-width: 16px; font-size: var(--uma-fs-2xs); line-height: 1.3; }',
		// 375px の3列では名前に残る幅が小さいので、カードの欄だけ余白と × の幅を詰める（名前の全文は title と aria-label）
		'.usd-roster-slot .usd-roster-pickbtn { padding-inline: var(--uma-sp-1-5) var(--uma-sp-0-5); gap: 3px; }',
		'.usd-roster-slot .usd-roster-clearbtn { width: 28px; }',
		// 育成ウマ娘の欄（③⑦）: 欄の右隣に（i）。選んだ状態は白文字・黒背景（選んでいるタブと同じ暗い色のトークン）。× は欄の中の右端のまま
		'.usd-roster-umarow { display: flex; align-items: center; gap: var(--uma-sp-1-5); min-width: 0; }',
		'.usd-roster-umabox { flex: 1 1 auto; }',
		'.usd-roster-umainfo { flex: none; width: 28px; height: 28px; }',
		'.usd-roster-umabox.usd-roster-pickbox--filled { background: var(--uma-surface-inverse); border-color: var(--uma-surface-inverse); color: var(--uma-text-inverse); }',
		'.usd-roster-umabox.usd-roster-pickbox--filled .usd-roster-pickbtn { color: var(--uma-text-inverse); }',
		'.usd-roster-umabox.usd-roster-pickbox--filled .usd-roster-clearbtn { color: var(--uma-text-inverse); border-left-color: rgba(255,255,255,.28); }',
		'.usd-roster-umabox.usd-roster-pickbox--filled .usd-roster-clearbtn:hover { background: rgba(255,255,255,.16); color: var(--uma-text-inverse); }',
		'.usd-roster-pickbox.usd-roster-card--typed .usd-roster-pickbtn { color: var(--usd-card-text); }',
		'.usd-roster-pickbox:not(.usd-roster-pickbox--filled) .usd-roster-pickbtn { color: var(--uma-text-subtle); font-weight: 500; }',
		'.usd-roster-clearbtn { flex: none; width: 32px; min-height: 32px; padding: 0; border: 0; border-left: 1px solid var(--uma-border);',
		'  background: transparent; color: var(--uma-text-subtle); font: inherit; font-size: var(--uma-fs-md); line-height: 1; cursor: pointer; }',
		'.usd-roster-clearbtn:hover { background: var(--uma-surface-muted); color: var(--uma-text-heading); }',
		'.usd-roster-slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--uma-sp-1-5); }',
		'.usd-roster-slot { min-height: 36px; }',
		// 合計の1行（(11)〜(13)）。375px で収まらないときは、ボタン4つが2行目に落ちる（.usd-roster-sumbtns を1つの塊にしてある）
		'.usd-roster-sumrow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-1) var(--uma-sp-2); }',
		'.usd-roster-sumhead { display: inline-flex; align-items: center; gap: var(--uma-sp-1-5); white-space: nowrap; }',
		'.usd-roster-sumbtns { display: inline-flex; flex-wrap: nowrap; gap: var(--uma-sp-1); }',
		'.usd-roster-togglebtn { font: inherit; font-size: 11px; line-height: 1.2; font-weight: 600; padding: var(--uma-sp-1) var(--uma-sp-1-5); min-height: 28px;',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-full); background: var(--uma-surface); color: var(--uma-text); cursor: pointer; white-space: nowrap; }',
		'.usd-roster-togglebtn[aria-pressed="true"] { background: var(--uma-surface-inverse); border-color: var(--uma-surface-inverse); color: var(--uma-text-inverse); }',
		'.usd-roster-togglebtn:disabled { color: var(--uma-text-faint); border-style: dashed; cursor: not-allowed; }',
		// 絞り込みの行（(17)）: 距離・脚質・バ場の3つのセレクトを1行に
		'.usd-roster-filterrow { display: flex; flex-wrap: nowrap; gap: var(--uma-sp-1-5); min-width: 0; }',
		'.usd-roster-filter { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 0; }',
		'.usd-roster-filterlabel { font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs); color: var(--uma-text-subtle); font-weight: 600; }',
		'.usd-roster-filtersel.usd-roster-filtersel--on { background: var(--uma-surface-inverse); border-color: var(--uma-surface-inverse); color: var(--uma-text-inverse); }',
		'.usd-roster-filtersel option { background: var(--uma-surface); color: var(--uma-text); }',
		'.usd-roster-filtersel { width: 100%; min-width: 0; padding: var(--uma-sp-1) var(--uma-sp-1-5); font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); }',
		// 表（(14)(15)(16)(18)）: 狭い幅ではスキル名の列を 1/3、メンバーの列の全体を 2/3 に。名前と Pt は1行（nowrap）で、セルの中だけ横に送る
		'.usd-roster-namescroll { display: flex; align-items: center; gap: var(--uma-sp-1-5); min-width: 0; width: 100%; white-space: nowrap;',
		'  overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior-x: contain; }',
		'.usd-roster-namescroll::-webkit-scrollbar { display: none; }',
		'.usd-roster-namescroll > * { flex: none; }',
		'.usd-roster-skillname--btn { font: inherit; font-weight: 700; color: var(--uma-text-heading); background: transparent; border: 0; padding: 0; cursor: pointer;',
		'  text-decoration: underline; text-decoration-color: var(--uma-border-strong); text-underline-offset: 2px; min-height: 28px; }',
		'.usd-roster-skillname--btn:hover { text-decoration-color: currentColor; }',
		'.usd-roster-gc--none { color: var(--uma-text-subtle); font-weight: 400; }',
		// 列見出し（段7b の ⑧⑨）: 2行。上＝バッジ／！（選ぶ必要のあるイベントがあるカードは押せるボタン）、下＝漏斗（並べ替え。28px 以上）
		'.usd-roster-ghbtns { display: flex; flex-direction: column; align-items: center; gap: 2px; }',
		'.usd-roster-ghbtn { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0;',
		'  border: 0; border-radius: var(--uma-r-sm); background: transparent; color: inherit; font: inherit; font-size: var(--uma-fs-xs); line-height: 1; cursor: pointer; }',
		'.usd-roster-ghbtn:hover { background: rgba(0,0,0,.08); }',
		'.usd-roster-ghbtn:focus-visible { outline: 2px solid var(--uma-focus-ring); outline-offset: -2px; }',
		'.usd-roster-funnel { display: block; width: 16px; height: 16px; }',
		'.usd-roster-funnel path { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linejoin: round; }',
		'.usd-roster-ghbtn[aria-pressed="true"] .usd-roster-funnel path { fill: currentColor; }',
		// 押せるバッジ（イベントを選ぶ）。ボタンだとひと目で分かる見た目：枠と軽い影・押したときの沈み・フォーカスの輪。押せる範囲は見た目より広く取る
		'.usd-roster-evbtn { position: relative; padding: 0; background: var(--uma-surface); color: var(--uma-text-heading); font: inherit; line-height: inherit; font-weight: 700; cursor: pointer; box-shadow: 0 1px 2px rgba(15, 23, 42, .4); }',
		'.usd-roster-evbtn::after { content: ""; position: absolute; inset: -6px -4px; }',
		'.usd-roster-evbtn:active { transform: translateY(1px); box-shadow: none; }',
		'.usd-roster-evbtn:focus-visible { outline: 2px solid var(--uma-focus-ring); outline-offset: 2px; }',
		'.usd-roster-evbtn--alert { background: var(--uma-danger-text); border-color: var(--uma-danger-text); color: var(--uma-text-inverse); }',
		// 金スキルの行（(18)）: 淡い金の地（結合画像の琥珀と同じトークン）。名前は読める濃さのまま
		// 行の色分け（段7e の (2)〜(6)）。色は core の中のこの変数にまとめる（共有の tokens／common／shell は触らない）。
		// 地の優先は 固有 > 金 > 回復（CSS の並び順で決める＝回復 → 金 → 固有）、文字の優先は 回復 > デバフ > パッシブ（JS が1つだけクラスを付ける）。
		// 文字と地の組み合わせは、すべてコントラスト比 4.5 以上（検査が実際の色で見る）
		'.usd-roster-grid { --usd-skill-heal-bg: #e6f3fd; --usd-skill-heal-text: #0b5fa5; --usd-skill-passive-text: #1b7a3a; --usd-skill-debuff-text: #b3261e; --usd-skill-pt-text: #546580;',
		'  --usd-skill-unique-from: #e3f6e6; --usd-skill-unique-mid: #dff1fb; --usd-skill-unique-to: #fbe3f1; --usd-skill-unique-edge: #f0a8d0; }',
		// 段8・C: 回復の行の淡い水色の地はやめた（地は白。名前の青だけで示す＝緑・デバフと同じ扱い）。--usd-skill-heal-bg は使っていない
		'.usd-roster-grow--gold > .usd-roster-gc { background: var(--uma-stitch-soft); }',
		'.usd-roster-grow--gold > .usd-roster-gc--uma { background: var(--uma-stitch-soft); }',
		// 固有スキル: 行全体を左から右へ 淡い緑 → 空色 → 淡いピンク のグラデーション＋1px のピンクの縁（ゲームの固有スキルの虹色の枠の印象）。
		// 行は display: contents なので、この行だけ箱にして列を引き継ぐ（subgrid）。縁は outline（高さを変えない）
		'.usd-roster-grow--unique { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid;',
		'  background: linear-gradient(90deg, var(--usd-skill-unique-from), var(--usd-skill-unique-mid), var(--usd-skill-unique-to));',
		'  outline: 1px solid var(--usd-skill-unique-edge); outline-offset: -1px; }',
		'.usd-roster-grow--unique > .usd-roster-gc, .usd-roster-grow--unique > .usd-roster-gc--uma { background: transparent; }',
		// 得られる●の行の Pt の文字は、金・回復・固有の地の上で 4.5 以上になる少し濃い色にする（薄い△の参考値はそのまま）
		'.usd-roster-grow--gold:not(.usd-roster-grow--off) .usd-roster-pt:not(.usd-roster-pt--ref),',
		'  .usd-roster-grow--unique:not(.usd-roster-grow--off) .usd-roster-pt:not(.usd-roster-pt--ref) { color: var(--usd-skill-pt-text); }',
		'.usd-roster-skillname--heal { color: var(--usd-skill-heal-text); }',
		'.usd-roster-skillname--debuff { color: var(--usd-skill-debuff-text); }',
		'.usd-roster-skillname--passive { color: var(--usd-skill-passive-text); }',
		// 前段の白スキルの行（金スキルの直下に動かしたもの）: 段8・C で 4px の字下げをやめ、名前の先頭に薄い色の「└」を付けた（行頭は揃える）
		'.usd-roster-prevmark { flex: none; color: var(--uma-text-faint); font-size: var(--uma-fs-xs); line-height: 1; margin-right: 1px; }',
		// × の確認の小窓（(6)）
		'.usd-roster-modal-box--confirm { width: min(360px, 100%); }',
		'.usd-roster-confirm-text { margin: 0; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-md); color: var(--uma-text-heading); }',
		'.usd-roster-confirm-btns { justify-content: flex-end; }',
		// イベントを選ぶ小窓（(19)）
		'.usd-roster-event { display: flex; flex-direction: column; gap: var(--uma-sp-1); padding: var(--uma-sp-2) 0; border-top: 1px solid var(--uma-border); }',
		'.usd-roster-eventtitle { margin: 0; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-roster-autotag { display: inline-block; font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs); font-weight: 600; padding: 0 var(--uma-sp-1-5);',
		'  border-radius: var(--uma-r-full); background: var(--uma-surface-muted); color: var(--uma-text-subtle); vertical-align: middle; }',
		'.usd-roster-choices { display: flex; flex-direction: column; gap: var(--uma-sp-1); }',
		'.usd-roster-choice { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--uma-sp-1) var(--uma-sp-2); width: 100%; text-align: left;',
		'  padding: var(--uma-sp-1-5) var(--uma-sp-2); border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-md); background: var(--uma-surface);',
		'  color: var(--uma-text); font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); cursor: pointer; }',
		'.usd-roster-choice--on { border-color: var(--uma-control); box-shadow: inset 0 0 0 1px var(--uma-control); background: var(--uma-control-soft); }',
		'.usd-roster-choicelabel { flex: none; font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-roster-choiceskills { display: inline-flex; flex-wrap: wrap; gap: var(--uma-sp-1) var(--uma-sp-2); min-width: 0; }',
		'.usd-roster-choiceskill--dim, .usd-roster-choiceskill--none { color: var(--uma-text-faint); }',
		// イベントの選択の小窓の2カラム（段7b の ⑩）。共有の .uma-popover は触らず、修飾クラス（広い幅だけ幅を広げる）と中身のスタイルだけ。
		// 広い幅＝左にイベントの一覧・右に「取得できるスキル」。狭い幅（ボトムシート）＝2つのペインを横に並べ、scroll-snap でスワイプ
		'@media (min-width: 641px) { .usd-info-pop--wide { width: min(92vw, 860px); max-height: min(82vh, 680px); } }',
		'.usd-ev-title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
		'.usd-info-pop--wide .uma-popover-title { min-width: 0; flex: 1 1 auto; }',
		'.usd-ev-switch { display: none; flex: none; margin-inline-start: auto; padding: var(--uma-sp-1) var(--uma-sp-2-5); min-height: 32px;',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-full); background: var(--uma-surface); color: var(--uma-text-heading);',
		'  font: inherit; font-size: var(--uma-fs-xs); font-weight: 700; cursor: pointer; white-space: nowrap; }',
		'@media (max-width: 640px) { .usd-ev-switch { display: inline-flex; align-items: center; } }',
		'.usd-ev-panes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--uma-sp-4); min-width: 0; }',
		'.usd-ev-pane { min-width: 0; max-height: min(62vh, 520px); overflow-y: auto; overscroll-behavior: contain; }',
		'.usd-ev-pane--skills { border-inline-start: 1px solid var(--uma-border); padding-inline-start: var(--uma-sp-4); }',
		'@media (max-width: 640px) {',
		'  .usd-ev-panes { display: flex; gap: 0; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; }',
		'  .usd-ev-panes::-webkit-scrollbar { display: none; }',
		'  .usd-ev-pane { flex: 0 0 100%; scroll-snap-align: start; max-height: 52vh; }',
		'  .usd-ev-pane--skills { border-inline-start: 0; padding-inline-start: 0; }',
		'}',
		'.usd-ev-skills-title { margin: 0 0 var(--uma-sp-1); font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-ev-skilllist { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }',
		'.usd-ev-skill { display: flex; flex-direction: column; gap: 1px; min-width: 0; padding: var(--uma-sp-1-5) 0; border-top: 1px solid var(--uma-border); }',
		'.usd-ev-skill:first-child { border-top: 0; }',
		'.usd-ev-skill-name { margin: 0; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-ev-skill-pt { margin: 0; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); }',
		'.usd-ev-skill-desc { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text); white-space: nowrap; overflow-x: auto; overflow-y: hidden;',
		'  scrollbar-width: none; overscroll-behavior-x: contain; min-width: 0; }',
		'.usd-ev-skill-desc::-webkit-scrollbar { display: none; }',
		'.usd-ev-tag { display: inline-block; margin-inline-start: var(--uma-sp-1-5); padding: 0 var(--uma-sp-1-5); border: 1px dashed var(--uma-border-strong); border-radius: var(--uma-r-full);',
		'  font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs); font-weight: 600; color: var(--uma-text-subtle); vertical-align: middle; }',
		'.usd-ev-skill--maybe .usd-ev-skill-name, .usd-ev-skill--maybe .usd-ev-skill-pt, .usd-ev-skill--maybe .usd-ev-skill-desc { color: var(--uma-text-faint); font-weight: 400; }',
		'.usd-ev-skill--dim .usd-ev-skill-name, .usd-ev-skill--dim .usd-ev-skill-pt, .usd-ev-skill--dim .usd-ev-skill-desc { color: var(--uma-text-faint); }',
		// ②の「本育成編成」（E）
		'.usd-roster-link { display: flex; flex-wrap: wrap; align-items: center; gap: var(--uma-sp-1-5) var(--uma-sp-2); }',
		'.usd-roster-link[hidden] { display: none; }',
		'.usd-roster-link .usd-roster-note { flex: 1 1 100%; }',
		// 「本育成編成」のボタンと「継承固有」を同じ1行に（段7d の ⑪）。収まらない幅では、この行だけ横に送る（縦には増やさない）
		'.usd-roster-linkrow { display: flex; flex-wrap: nowrap; align-items: center; gap: var(--uma-sp-1-5); flex: 1 1 100%; min-width: 0; white-space: nowrap;',
		'  overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior-x: contain; }',
		'.usd-roster-linkrow::-webkit-scrollbar { display: none; }',
		'.usd-roster-linkrow > * { flex: none; }',
		'.usd-roster-linkrow > .usd-roster-linkbtn { flex: 0 1 auto; min-width: 0; }',
		// 継承固有の部品: 「本育成編成」のボタンと同じ高さ・枠・角丸・文字。ラベル＋2つのセレクト（種類・ヒントLv）で1つの部品
		'.usd-uniq { display: inline-flex; align-items: center; min-height: 32px; padding-inline: var(--uma-sp-3) var(--uma-sp-1);',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-full); background: var(--uma-surface); color: var(--uma-text-heading);',
		'  font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 600; }',
		'.usd-uniq-label { white-space: nowrap; padding-right: var(--uma-sp-1); }',
		'.usd-uniq-sel { font: inherit; color: inherit; background: transparent; border: 0; border-left: 1px solid var(--uma-border); border-radius: 0; margin: 0;',
		'  padding: 0 var(--uma-sp-0-5) 0 var(--uma-sp-1); min-height: 28px; cursor: pointer; }',
		'.usd-uniq-sel:last-child { border-radius: 0 var(--uma-r-full) var(--uma-r-full) 0; }',
		'.usd-uniq-sel:focus-visible { outline: 2px solid var(--uma-focus-ring); outline-offset: 1px; }',
		'.usd-uniq-sel option { background: var(--uma-surface); color: var(--uma-text); }',
		// 「本育成編成」のボタン（段7b の ⑬）。共有の .uma-btn--secondary は使わない（その :hover:not(:disabled) は特異度が (0,3,0) で、
		// 押している状態の暗い地を白に近い地へ上書きし、白い文字が白地に消えていた）。どの状態でも、文字と地のコントラストを保つ
		'.usd-roster-linkbtn { display: inline-flex; align-items: center; max-width: 100%; min-height: 32px; padding: var(--uma-sp-1) var(--uma-sp-3);',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-full); background: var(--uma-surface); color: var(--uma-text-heading);',
		'  font: inherit; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 600; cursor: pointer; }',
		'.usd-roster-linkname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
		'.usd-roster-linkbtn:hover { background: var(--uma-surface-muted); border-color: var(--uma-text-subtle); color: var(--uma-text-heading); }',
		'.usd-roster-linkbtn:focus-visible { outline: 2px solid var(--uma-focus-ring); outline-offset: 2px; }',
		'.usd-roster-linkbtn[aria-pressed="true"] { background: var(--uma-surface-inverse); border-color: var(--uma-surface-inverse); color: var(--uma-text-inverse); }',
		'.usd-roster-linkbtn[aria-pressed="true"]:hover { background: var(--uma-text-heading); border-color: var(--uma-text-heading); color: var(--uma-text-inverse); }',
		'.usd-link-list { display: flex; flex-direction: column; gap: var(--uma-sp-1-5); }',
		'.usd-link-opt { display: flex; align-items: center; gap: var(--uma-sp-2); min-height: 40px; padding: var(--uma-sp-1-5) var(--uma-sp-3);',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-md); background: var(--uma-surface); cursor: pointer; }',
		'.usd-link-opt--on { border-color: var(--uma-control); box-shadow: inset 0 0 0 1px var(--uma-control); background: var(--uma-control-soft); }',
		'.usd-link-opt input { flex: none; width: 18px; height: 18px; margin: 0; }',
		'.usd-link-name { min-width: 0; overflow-wrap: anywhere; font-weight: 600; color: var(--uma-text-heading); }',
		// ②因子周回（段8・D。special だけ＝.usd-setbody）: 白いパネル。1行目「X Pt/N種 ? とチップ」、2行目 継承固有・共通スキルのヒントLv、入口、ランクと再分類・削除、一覧
		'.usd-setbody > .uma-section-body { gap: var(--uma-sp-2); }',
		'.usd-setbody .usd-ptneed { padding: 0; background: transparent; border: 0; border-radius: 0; }',
		'.usd-sethead { display: flex; align-items: center; gap: var(--uma-sp-1-5); min-width: 0; }',
		'.usd-sethead-sum { flex: none; white-space: nowrap; font-size: var(--uma-fs-md); line-height: var(--uma-lh-md); font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-sethead .uma-help-btn { flex: none; }',
		'.usd-sethead .usd-ptneed-chips { flex: 1 1 auto; }',
		'.usd-help-dot { position: relative; }',
		'.usd-help-dot::after { content: ""; position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; border-radius: 50%; background: var(--uma-danger-text); border: 1px solid var(--uma-surface); }',
		'.usd-ptneed-chip--rank { font: inherit; font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); cursor: pointer; }',
		'.usd-ptneed-chip--rank:hover { border-color: var(--uma-text-subtle); }',
		'.usd-ptneed-chip--rank:focus-visible { outline: 2px solid var(--uma-focus-ring); outline-offset: 1px; }',
		'.usd-ptneed-chip--off { color: var(--uma-text-faint); border-style: dashed; background: var(--uma-surface-sunken); }',
		'.usd-ptneed-chip--off strong { color: var(--uma-text-faint); }',
		'.usd-chip-sp { display: none; }',
		'@media (max-width: 640px) {',
		'  .usd-chip-sep, .usd-chip-unit { display: none; }',
		'  .usd-chip-sp { display: inline; }',
		'  .usd-sethead .usd-ptneed-chip { padding-inline: var(--uma-sp-2); }',
		'  .usd-sethead .usd-ptneed-chips { gap: var(--uma-sp-1); }',
		'}',
		'.usd-setcfg { flex: none; }',
		'.usd-tier-ops { display: inline-flex; gap: var(--uma-sp-1-5); margin-left: auto; }',
		'.usd-setbody .usd-tier-row { flex-wrap: nowrap; }',
		'.usd-panel--taken .usd-panel-namebtn, .usd-panel--taken .usd-panel-pt { color: var(--uma-text-faint); }',
		'.usd-panel--taken { background: var(--uma-surface-sunken); }',
		'.usd-link-opt--off { cursor: not-allowed; color: var(--uma-text-faint); background: var(--uma-surface-sunken); }',
		'.usd-link-opt--off .usd-link-name { color: var(--uma-text-faint); }',
		'.usd-setlist-ops { display: flex; justify-content: flex-end; margin-top: var(--uma-sp-3); }',
		// 共通の見出しの帯（段8・B）。1行・高さ 36px。左＝セット名・✎・「3／10 ▾」、右＝合計（数字 19px 太字・ほか 11〜12px）と ?
		'.usd-setbar { display: flex; align-items: center; justify-content: space-between; gap: var(--uma-sp-2); min-height: 36px; }',
		'.usd-setbar-l { display: flex; align-items: center; gap: 2px; min-width: 0; flex: 1 1 auto; }',
		'.usd-setbar-r { display: flex; align-items: center; gap: var(--uma-sp-1); flex: none; }',
		'.usd-setbar-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; color: var(--uma-text-heading); }',
		'.usd-setbar-name--new { color: var(--uma-text-muted); }',
		'.usd-setbar-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; border-radius: var(--uma-r-full); background: transparent; color: var(--uma-text-muted); cursor: pointer; }',
		'.usd-setbar-btn:hover { background: var(--uma-surface-muted); color: var(--uma-text-heading); }',
		'.usd-setbar-btn:disabled { cursor: not-allowed; color: var(--uma-text-faint); background: transparent; }',
		'.usd-setbar-btn:focus-visible, .usd-setbar-list:focus-visible { outline: 2px solid var(--uma-focus-ring); outline-offset: 1px; }',
		'.usd-setbar-list { flex: none; display: inline-flex; align-items: center; gap: 2px; height: 28px; padding: 0 var(--uma-sp-2); border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-full);',
		'  background: var(--uma-surface); color: var(--uma-text); font: inherit; font-size: 12px; line-height: 1; font-weight: 600; cursor: pointer; white-space: nowrap; }',
		'.usd-setbar-list:hover { background: var(--uma-surface-muted); }',
		'.usd-setbar-caret { font-size: 10px; color: var(--uma-text-muted); }',
		'.usd-setbar-input { min-width: 0; flex: 1 1 auto; height: 28px; padding: 0 var(--uma-sp-2); border: 1px solid var(--uma-control); border-radius: var(--uma-r-md); font: inherit; font-size: var(--uma-fs-sm); background: var(--uma-surface); color: var(--uma-text-heading); }',
		'.usd-setbar-sum { display: inline-flex; align-items: baseline; gap: var(--uma-sp-1); white-space: nowrap; color: var(--uma-text); }',
		'.usd-setbar-sumline { display: inline-flex; align-items: baseline; gap: 2px; }',
		'.usd-setbar-k { font-size: 12px; line-height: 1; }',
		'.usd-setbar-num { font-size: 19px; line-height: 1.15; font-weight: 800; color: var(--uma-text-heading); font-variant-numeric: tabular-nums; }',
		'.usd-setbar-sub { font-size: 11px; line-height: 1.1; color: var(--uma-text-muted); }',
		// 狭い幅では、かっこ書きを数字の下に重ねる（2行。高さは帯の 36px の中）
		'@media (max-width: 480px) {',
		'  .usd-setbar-sum { flex-direction: column; align-items: flex-end; gap: 0; }',
		'}',
		// セルの中の横スクロール（名前と Pt）の「続きがある側のフェード」。入口の並びと同じ仕組み（data-usd-fade）
		'.usd-hscroll { margin-inline-end: var(--usd-entry-trim, 0px); }',
		'.usd-hscroll[data-usd-fade="right"], .usd-hscroll[data-usd-fade="both"] { --usd-fade-r: rgba(0,0,0,.3) 100%; }',
		'.usd-hscroll[data-usd-fade="left"], .usd-hscroll[data-usd-fade="both"] { --usd-fade-l: rgba(0,0,0,.3) 0; }',
		'.usd-hscroll[data-usd-fade] { --usd-entry-fade-w: 14px;',
		'  -webkit-mask-image: linear-gradient(to right, var(--usd-fade-l, #000 0), #000 var(--usd-entry-fade-w), #000 calc(100% - var(--usd-entry-fade-w)), var(--usd-fade-r, #000 100%));',
		'  mask-image: linear-gradient(to right, var(--usd-fade-l, #000 0), #000 var(--usd-entry-fade-w), #000 calc(100% - var(--usd-entry-fade-w)), var(--usd-fade-r, #000 100%)); }',
		// ───── 段7c（2026-10-03）: スキルごとのオン/オフ（M） ─────
		// ●の行の名前セルの左の小さなチェック（24px 以上のタップ領域）。オフの行は、名前に取り消し線・全体を薄く（色だけで表す。opacity は使わない＝
		// position:sticky の表で重なり順が壊れるため。F-7）・Pt は「—」・○は薄く残す
		'.usd-roster-take { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; min-height: 28px; margin-inline-start: -2px; cursor: pointer; }',
		'.usd-roster-take input { width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: var(--uma-control); }',
		'.usd-roster-take:has(input:focus-visible) { outline: 2px solid var(--uma-focus-ring); outline-offset: -2px; border-radius: var(--uma-r-sm); }',
		'.usd-roster-skillname--off { text-decoration: line-through; color: var(--uma-text-faint); text-decoration-color: var(--uma-text-faint); }',
		'.usd-roster-grow--off > .usd-roster-gc { background: var(--uma-surface-sunken); color: var(--uma-text-faint); }',
		'.usd-roster-grow--off .usd-roster-pt { color: var(--uma-text-faint); }',
		'.usd-roster-grow--off .usd-roster-got, .usd-roster-grow--off .usd-roster-maybe { border-color: var(--uma-text-faint); }',
		'.usd-roster-grow--off .usd-roster-maybe { background: var(--uma-text-faint); }',
		'.usd-info-offrow { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--uma-sp-2); }',
		'.usd-ptneed-boxline { display: block; margin-top: var(--uma-sp-1); }',
		// ───── 段7c（2026-10-03）: シナリオの固定イベントの列（N） ─────
		'.usd-roster-bowl { display: block; width: 14px; height: 14px; }',
		'.usd-roster-bowl path { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }',
		'.usd-roster-scenmark { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 18px; color: var(--uma-text-heading); }',
		'.usd-roster-evbtn--scen { display: inline-flex; align-items: center; justify-content: center; }',
		'.usd-roster-choicestate { flex: none; font-size: var(--uma-fs-2xs); line-height: var(--uma-lh-2xs); font-weight: 600; padding: 0 var(--uma-sp-1-5);',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-full); color: var(--uma-text-subtle); }',
		// ───── 段7c（2026-10-03）: 画面の最終調整（P） ─────
		// (7) デスクトップ（641px 以上）: 表の高さを、画面の高さから FAB の置き場（ページが --usd-fab-dock に入れる）とわずかな余白を引いた値にする。
		// ①のタブは本文の最後が表なので、ページを下端までスクロールすると表が画面いっぱいに見える（最小 360px）
		'@media (min-width: 641px) { .usd-roster-grid-wrap { max-height: max(360px, calc(100dvh - var(--usd-fab-dock, 96px) - var(--uma-sp-6))); } }',
		// (6) スマホ（640px 以下）: 操作と情報を1画面に収める。余白を詰め、育成ウマ娘とサポートカードを1つの帯にまとめ、
		// 表を残りの高さいっぱいに広げる（表の上端の位置は JS が --usd-grid-top に入れる。入るまでの既定は 380px）
		'@media (max-width: 640px) {',
		'  .usd-roster { gap: var(--uma-sp-1); }',
		'  .usd-roster-sec { gap: var(--uma-sp-1); }',
		'  .usd-roster-top { gap: var(--uma-sp-1); padding-bottom: var(--uma-sp-1); border-bottom-width: 1px; }',
		'  .usd-ntabs { padding-bottom: 0; }',
		'  .usd-roster-lower { gap: 0; padding: var(--uma-sp-1) var(--uma-sp-1-5); background: var(--uma-surface-sunken);',
		'    border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-sm); }',
		'  .usd-roster-lower .usd-roster-sub { background: transparent; border: 0; border-radius: 0; padding: 0; gap: var(--uma-sp-1); }',
		'  .usd-roster-lower .usd-roster-sub + .usd-roster-sub { margin-top: var(--uma-sp-1); }',
		'  .usd-roster-pickbox, .usd-roster-slot { min-height: 30px; }',
		'  .usd-roster-pickbtn { padding-block: var(--uma-sp-1); }',
		'  .usd-roster-clearbtn { min-height: 28px; }',
		'  .usd-roster-sumrow { gap: 0 var(--uma-sp-2); }',
		'  .usd-roster-ptsum { gap: 0; }',
		'  .usd-roster-prev { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); }',
		'  .usd-roster-filtersel { padding-block: var(--uma-sp-0-5); min-height: 28px; }',
		'  .usd-roster-pt { font-size: 11px; line-height: 1.2; }',
		// 2文字の名前（22px）は min-width:28px だと中央寄せで左右に 3px ずつ空き、半角スペースが入ったように見えた（段7d の ⑧）。
		// タップの領域は同じ 28px のまま、余白を負のマージンで外へ出して文字の位置を動かさない
		'  .usd-roster-skillname--btn { padding-inline: 3px; margin-inline: -3px; }',
		'  .usd-roster-filterrow { gap: var(--uma-sp-1); }',
		// ②（段7d）: 本育成編成のボタンと継承固有を375px で1行に。収まらない幅ではこの行だけ横に送る（ボタンの文字は切らない）
		'  .usd-roster-linkrow { gap: var(--uma-sp-1); }',
		'  .usd-roster-linkrow > .usd-roster-linkbtn { flex: none; padding-inline: var(--uma-sp-2); }',
		'  .usd-uniq { padding-inline: var(--uma-sp-2) var(--uma-sp-0-5); }',
		'  .usd-uniq-label { padding-right: var(--uma-sp-0-5); }',
		// 必要スキルPt の3つのチップ（「＋超優先：X,XXX Pt」…）を1行に。収まらない幅では横に送る
		'  .usd-ptneed { padding-inline: var(--uma-sp-2); }',
		'  .usd-ptneed-chips { flex: 1 1 100%; flex-wrap: nowrap; gap: var(--uma-sp-1); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior-x: contain; }',
		'  .usd-ptneed-chips::-webkit-scrollbar { display: none; }',
		'  .usd-ptneed-chip { flex: none; padding-inline: var(--uma-sp-1-5); }',
		// 表: 行を詰める（チェック・名前・Pt が1行に収まる範囲。文字は 11px 以上・タップの領域は 28px 以上。漏斗は 24px 以上）
		'  .usd-roster-gc { padding-block: 1px; }',
		'  .usd-roster-gh { padding: var(--uma-sp-0-5); }',
		'  .usd-roster-ghbtn { height: 24px; }',
		'  .usd-roster-grid-wrap { max-height: max(180px, calc(100dvh - var(--usd-grid-top, 380px) - var(--uma-sp-2))); }',
		'}'
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
	let picker = { mode: 'filter', checked: new Set(), onAdd: null, excludeIds: [], activeAxis: pickableAxes()[0].key };
	/**
	 * 「条件で検索」で入れたチェック（軸ごとに選んだ値の配列）。⑦・72セッション目・段10。
	 *
	 * **`picker` の中ではなく外に持つ**（`pickerHiddenIds` / `pickerAxisPanelOpen` と同じ理由）。
	 * `openPicker()` は `picker` の中身を作り直すので、中に置くと**開き直すたびに白紙へ戻る。**
	 * それが段10 の前の姿だった ―― 3件だけ足したくて閉じると、次に開くときは条件を入れ直しになる。
	 *
	 * **寿命はそのページを開いている間**（`localStorage` には保存しない）。
	 * `pickerAxisPanelOpen`（選択肢パネルの開閉）と**同じ寿命**にしてある。
	 * **どのセットを編集していても同じ条件が残る** ―― 条件は「どんなスキルを探しているか」であって
	 * セットの持ち物ではないので、セットを移っても引き継ぐほうが手数が減る。
	 * **リロードで白紙に戻る**ので、残り続けて困ることも起きない。
	 * 意図して消したいときは「すべて解除」（`filter-clear-all`）。
	 */
	let pickerFilters = {};
	TAG_AXES.forEach(a => { pickerFilters[a.key] = []; });
	/**
	 * 「目標のレースの距離」の入力欄の文字（C-96・C-97）。**寿命は `pickerFilters` と同じ**
	 * （ページを開いている間だけ。スキルセットには保存しない）。評価は `evaluateTargetDistance()` が
	 * そのつど行う（数字でない・レースが無い・区分と合わない、はここには持たない）。
	 */
	let pickerTargetDistanceText = '';
	/**
	 * 一覧から隠すスキル（編成で得られるもの。C-51）。
	 *
	 * **`picker.excludeIds` を流用しないこと。** あちらは「一覧から隠す」と
	 * **「XXX種追加済み」の件数**（`updatePickerCommitState()` が `length` をそのまま出す）を
	 * 兼ねているので、編成由来のIDを混ぜると件数が壊れる。こちらは表示にだけ効かせ、
	 * 件数には一切使わない。モーダルを開き直しても残るよう、picker とは別に持つ。
	 */
	let pickerHiddenIds = [];
	/**
	 * `pickerHiddenIds` のうち、**本育成編成で「取得しない」にしているスキル**（段7c の M。理由の文言が違う）。
	 * `pickerHiddenIds`（選べなくする全部＝本育成で得るもの＋不要にしているもの）の部分集合で、行ごとの理由の出し分けと、
	 * 「本育成編成のため選べない M件」の内訳にだけ使う。
	 */
	let pickerOffIds = [];
	/**
	 * 選択肢パネルを開いているか（70セッション目・段4 の続き）。
	 *
	 * **選択中のタブをもう一度押すと閉じる。** 段4 で選択肢を3段にしたぶん、特に狭い画面で
	 * 下のスキル一覧が押し下げられるので、要らないときは畳めるようにした。
	 * **閉じるのは表示だけ** ―― `pickerFilters` には触らないので、絞り込みの結果は変わらない。
	 *
	 * **`picker` の中ではなく外に持つ**（`pickerHiddenIds` と同じ理由）。`openPicker()` は
	 * `picker` の中身を作り直すので、中に置くと開き直すたびに開いた状態へ戻ってしまう。
	 * 寿命は**そのページを開いている間**（`localStorage` には保存しない）。
	 * これは C-14 の `picker.activeAxis` と同じ寿命で、⑦（段6）でチェックの状態を
	 * 同じ寿命にする予定なので、そこで揃う。
	 */
	let pickerAxisPanelOpen = true;
	/**
	 * 入口の並び（条件で検索〜リセット）を開いているか。⑩・72セッション目・段11。
	 *
	 * **既定は開く。** 閉じて始めると、初めて開いた人には
	 * 「スキルを足す手段が1つも見えない画面」になる。
	 * **寿命は `pickerAxisPanelOpen` / `pickerFilters` と同じ**（そのページを開いている間だけ）。
	 * 畳むのは「もう足し終えて追加済みスキルを眺めたい」ときなので、その間は畳んだままでいてほしいが、
	 * 次に開いたときまで覚えている必要は無い。**`localStorage` は使わない。**
	 * **`createTemplateManager` の外に置く**のは、描き直し（`render()`）で作り直されないため。
	 */
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
	//   （ほかに緑スキル・画像から読み取るの2つ。2026-09-27 に「未収録スキルを追加」（custom）を廃止した）
	// 以前は3つを1枚のモーダルに縦に積んでいたが、実際には「今どれをやるか」は
	// 最初に決まっているので、選ばなかった2つは畳まれた見出しとして場所を取るだけだった。
	// 入口を呼び出し元の画面（テンプレート編集・比較シート編集）へ出し、
	// モーダルは選ばれた1つだけを出す形にしてある。
	// フッターの確定ボタンの見出し。押した実績があるときは
	// 「（XXX種追加済み）」を後ろに足すので、文字列はここ1か所に置く。
	const PICKER_COMMIT_LABEL = 'チェックしたスキルを追加';
	// 「本育成スキルを除外する」を押している間、編成で得られる●のスキルを追加の一覧で選べなくするときの理由の文言。
	// **一覧から消さず、出したうえで選べなくして、理由を添える**（段3b・2026-09-30）。
	// 「条件で検索」「緑スキルを追加」「名前を入れて探す」の3か所が同じ文言を使うので、ここ1か所に置く。
	const PICKER_EXCLUDED_REASON = '本育成で得るため選べません';   // 段7（2026-10-03）: 「除外」の語を使わない
	// 本育成編成で「取得しない」にしているスキル（段7c の M。利用者が明示的に不要と判断したスキルを、因子周回で再び選べるのは不自然なため）
	const PICKER_OFF_REASON = '本育成編成で不要にしているため選べません';
	/** そのスキルを選べなくしている理由（選べるなら空）。不要にしているものは、本育成で得るものとは別の理由 */
	function pickerBlockReasonOf(skillId) {
		if (pickerHiddenIds.indexOf(skillId) === -1) return '';
		return pickerOffIds.indexOf(skillId) !== -1 ? PICKER_OFF_REASON : PICKER_EXCLUDED_REASON;
	}

	const PICKER_MODES = {
		// 71セッション目・段6: 「条件でスキルを検索」→「条件で検索」（利用者向けの文言だけ。
		// 識別子 `filter` と、コード内の説明の「条件でスキルを検索」は変えない＝恒久ルール19）。
		//
		// **段8: 括弧から「軸内はOR」を落とした。** バ場（`exclusive`）が入り、軸内の読み方が
		// 軸ごとに3通り（OR／OR＋空は該当なし／許可リスト）になったので、**見出しで一律には言えない**。
		// 軸内の読み方は**その軸のパネルの注記**が言う（renderPickerFilterAxes の hint）ので、
		// 見出しには**全軸に共通して成り立つこと＝軸間はAND**だけを残した。
		filter: { title: '条件で検索（軸間はAND）', commit: true },
		paste: { title: 'テキストで検索', commit: true },
		// 【INTENTIONALLY_REMOVED・2026-09-27（C-100）】3つ目の `custom`（「未収録スキルを追加」＝名前とタグを
		// 手入力してカスタムスキルを作る画面）は、カスタムスキルを作る手段ごと廃止した。
		// 4つ目（スキルセットOCR・フェーズa コミット3）。外で照合を済ませた行（ID付きの候補一覧）を受け取って、
		// 「テキストで検索」と同じ報告（候補チップ・取り消し・確定）を出す。貼り付け欄と照合ボタンは出さない。
		// 照合は common.js 側（CHAR_CONFUSION_MAP が効く経路）で行い、ここは見せるだけ＝C-24 調査4 の推奨。
		// 入口（special.html のボタン）はコミット4、Deck 単体ページの入口は後続。この段は口だけ。
		ocr: { title: '画像から読み取る', commit: true },
		/* 5つ目（72セッション目・段9）。**パッシブ（ゲーム内の緑スキル）を名前で選ぶ入口。**
		 * 段8 で `poolExcluded` の軸に値を持つものを「条件で検索」の母集団から外したので、
		 * その67件はどの入口からも選べなくなっていた。ここがその受け皿。
		 *
		 * **`commit: false`＝フッターの確定ボタンを出さない。** チェックした瞬間にセットへ入り、
		 * 外した瞬間に抜ける（当時は手入力＝`custom` に前例があった。2026-09-27 に廃止）。理由は2つ ――
		 *   (1) 一覧が「いま入っているか」をそのまま映すので、確定という段が入ると
		 *       「チェックは付いているがまだ入っていない」状態が生まれて読めなくなる。
		 *   (2) 外す操作は確定ボタンでは表せない（あちらは足すことしかできない）。
		 * **Undo には積まない**（1件ずつの操作で、押し直せば戻るため。§10 D の15）。 */
		passive: { title: '緑スキルを追加', commit: false }
	};

	function pickerMarkup() {
		return '' +
			'<div class="usd-modal-panel">' +
				'<div class="flex items-center justify-between p-4 border-b border-slate-200" style="flex-shrink:0;">' +
					'<p class="text-sm font-semibold text-slate-700" data-usd-el="picker-title">条件で検索</p>' +
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
						'<div class="flex items-center justify-between flex-wrap gap-x-2 mb-1">' +
							'<label class="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">' +
								'<input type="checkbox" data-usd-act="picker-select-all"/> 表示中を全て選択' +
							'</label>' +
							// 「除外中 M件」は M が0のときは出さない（renderPickerResults が hidden を切り替える）
							'<p class="text-xs text-slate-500">絞り込み結果（<span data-usd-el="result-count">0件</span>）' +
								'<span class="usd-excluded-count" data-usd-el="result-excluded" hidden></span></p>' +
						'</div>' +
						// 高さは .usd-results（下の CORE_STYLES）。**インラインの style をやめた** ――
						// 選択肢パネルを畳んだぶんをここへ足すのに、CSS 変数で足し算する必要があるため。
						// 罫線の色もトークン（--uma-border。値は同じ #e2e8f0）へ移した。
						'<div class="usd-results" data-usd-el="results"></div>' +
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
					// ---- 緑スキルを追加（72セッション目・段9） ----
					// 絞り込みの軸は持たない。**パッシブは「発動条件」を持たないスキル**なので、
					// 軸で絞る意味が無く、名前で探すしかない（だから母集団からも外してある）。
					// 一覧の箱は「条件で検索」と同じ .usd-results（件数で高さが動かない・0件は中央）。
					// 高さだけ .usd-results--tall で上書きする（上に選択肢パネルが無いぶん広く取れる）。
					'<div class="usd-mode" data-usd-el="mode-passive" hidden>' +
						// 数の単位は**背後の見出し（追加済みスキル（N種））と揃えて「種」**にする
						// （「絞り込み結果（N件）」は別の数なので、そちらの「件」に引きずられない）。
						// 「このうち」で、数えているのが**この一覧の中の何件か**であることを言う。
						'<p class="text-xs text-slate-500 mb-2" data-usd-el="passive-note">' +
							'チェックするとその場で追加済みスキルに入り、外すと抜けます' +
							'（このうち<span data-usd-el="passive-count">0種</span>が追加済み）' +
							'<span class="usd-excluded-count" data-usd-el="passive-excluded" hidden></span>' +
						'</p>' +
						'<div class="usd-results usd-results--tall" data-usd-el="passive-results"></div>' +
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
			else if (act === 'filter-tab') onPickerAxisTabClick(btn.dataset.usdAxis);
			// 「絞り込み中」から飛ぶときは、どのタブへ移ったかが分かるようフォーカスも移す。
			// **閉じていたら開く** ―― 見にいくために押しているので、閉じたままでは用を成さない。
			else if (act === 'filter-jump') { selectPickerAxisTab(btn.dataset.usdAxis, true); setPickerAxisPanelOpen(true); }
			else if (act === 'filter-clear-axis') clearPickerAxisFilter(btn.dataset.usdAxis);
			else if (act === 'filter-clear-all') clearAllPickerFilters();
			// 「▼ ほか N件」（段4）。1段ぶん下へ送る
			else if (act === 'opts-more') scrollOptionsByRow(btn.dataset.usdAxis);
			else if (act === 'picker-add') addCheckedSkills();
			else if (act === 'paste-run') runPasteMatch();
			else if (act === 'paste-clear') clearPaste();
			else if (act === 'paste-pick') choosePasteCandidate(Number(btn.dataset.row), btn.dataset.skillId);
			else if (act === 'paste-find') openPasteNameFinder(Number(btn.dataset.row));
			else if (act === 'name-back') closePasteNameFinder();
			else if (act === 'name-pick') pickPasteNameResult(btn.dataset.skillId);
			else if (act === 'name-zoom') zoomPasteNameImage();
			else if (act === 'paste-skip') skipPasteRow(Number(btn.dataset.row));
		});
		pickerEl.addEventListener('change', (e) => {
			const el = e.target;
			if (el.dataset.usdAct === 'picker-select-all') { togglePickerSelectAll(el.checked); return; }
			if (el.dataset.usdEl === 'filter-check') { onPickerFilterChange(el); return; }
			if (el.dataset.usdEl === 'skill-check') { onPickerCheck(el.value, el.checked); return; }
			// 緑スキル（段9）は確定ボタンを通さず、押したその場で受け皿へ流す
			if (el.dataset.usdEl === 'passive-check') { onPassiveCheck(el.value, el.checked); return; }
		});
		// 目標のレースの距離（C-97）。1文字ごとに評価して絞り直す（確定の操作は無い）
		pickerEl.addEventListener('input', (e) => {
			const el = e.target;
			if (el && el.dataset && el.dataset.usdEl === 'target-distance') onTargetDistanceInput(el);
		});
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

	// 軸名は TAG_AXES の label をそのまま出す。以前は label が「⑥その他1（レース環境）」の形で、
	// タブに出すときだけ丸数字と「その他N」を落とす関数（splitAxisLabel / axisTabName）を挟んでいたが、
	// label を素の名前（「レース環境」）にしたので、その加工は何もしなくなった。実体の無い加工は残さない。

	function renderPickerFilterAxes() {
		const el = q(pickerEl, 'filter-axes');

		// **隠す軸（hiddenAxis）はタブにもパネルにも出さない**（71セッション目・段8）。
		const tabs = pickableAxes().map(axis => {
			const isActive = axis.key === picker.activeAxis;
			return '' +
			// aria-expanded は「このタブのパネルが出ているか」（role="tab" が取れる状態）。
			// 選択中のタブをもう一度押すと畳めるので、選ばれているかどうかとは別に要る。
			'<button type="button" role="tab" class="usd-tab" id="usd-tab-' + axis.key + '"' +
				' aria-controls="usd-panel-' + axis.key + '" aria-selected="' + isActive + '"' +
				' aria-expanded="' + (isActive && pickerAxisPanelOpen) + '"' +
				' tabindex="' + (isActive ? 0 : -1) + '" data-usd-act="filter-tab" data-usd-axis="' + axis.key + '">' +
				'<span class="usd-tab-main">' + esc(axis.label) + '</span>' +
				'<span class="usd-tab-count" data-usd-el="axis-count" data-usd-axis="' + axis.key + '" hidden></span>' +
			'</button>';
		}).join('');

		const panels = pickableAxes().map(axis => {
			const isActive = axis.key === picker.activeAxis;
			// 選択肢の見た目だけチップにする。中身は従来どおり本物の checkbox で、
			// data-usd-el / data-axis / data-value もそのまま残してある。
			// 出すのは利用者が選ぶ値だけ（pickableOptions）。
			const opts = pickableOptions(axis).map(o =>
				'<label class="usd-opt">' +
					'<input type="checkbox" data-usd-el="filter-check" data-axis="' + axis.key + '" data-value="' + esc(o.v) + '"/>' +
					'<span>' + esc(o.t) + '</span>' +
				'</label>'
			).join('');
			/* 軸の注記。**軸内の読み方が軸ごとに違う**ので、その軸の規則をその場で言う。
			 * 71セッション目・段8 で `exclusive`（バ場）が加わり、3通りになった。
			 * **モーダルの見出しの括弧（「軸間はAND・軸内はOR」）は、この注記と役割が重なる**
			 * ので、見出しからは軸内の話を落とした（見出しは軸間だけ、軸内はここ）。 */
			// **軸の名前をここに書かない**（恒久ルール1）。印だけを見て文を選ぶので、
			// 同じ印の軸が増えても、この関数は書き換えずに済む。
			const hint = axisRuleHint(axis);
			return '' +
			'<section role="tabpanel" class="usd-tabpanel' + (isActive ? ' is-active' : '') + '"' +
				' id="usd-panel-' + axis.key + '" aria-labelledby="usd-tab-' + axis.key + '"' +
				' data-usd-axis="' + axis.key + '" tabindex="0">' +
				// 軸名はパネルの中に出さない。**タブで選んだ軸が開いている**ので、そこで名乗る必要がない。
				// 「いずれかに一致（OR）」の説明は残す ―― こちらは軸名ではなく**選択肢の読み方**で、初見では分からない。
				'<div class="usd-axis-head">' +
					'<p class="usd-axis-hint">' + hint + '</p>' +
					'<button type="button" class="usd-link-btn" data-usd-act="filter-clear-axis" data-usd-axis="' + axis.key + '">この軸を解除</button>' +
				'</div>' +
				'<div class="usd-opts-wrap">' +
					'<div class="usd-opts" data-usd-el="axis-options">' + opts + '</div>' +
				'</div>' +
				// 続きがあることの合図（段4）。**箱の外**に置くので、選択肢に重ならない。
				// 中身（件数）は updateOptionsMore() が入れる。3段に収まる軸では
				// data-more="none" が付いて見えなくなる（場所は取ったまま）。
				'<div class="usd-opts-more" data-usd-el="opts-more" data-usd-axis="' + axis.key + '" data-more="none">' +
					'<button type="button" class="usd-opts-more-btn" data-usd-act="opts-more" data-usd-axis="' + axis.key + '"></button>' +
				'</div>' +
				/* 目標のレースの距離（C-96・C-97）。**この印が付く軸（距離）のパネルにだけ**入力欄を出す。
				 * 数字を自由に入れる形（`type="text"` ＋ `inputmode="numeric"`。`number` はホイールで値が動き「e」も通るので使わない）。
				 * エラーの文は入力欄の下（`role="alert"`）。使えないとき（レースの一覧を読めていない）は無効にして同じ場所で知らせる。
				 * 有効・無効とエラーの文は `refreshPickerFilterUi()` が入れる（開き直すたびに揃える）。 */
				(axis.targetDistance ? '' +
				'<div class="usd-target-distance" data-usd-el="target-distance-box" data-usd-axis="' + axis.key + '">' +
					'<label class="usd-target-distance-label" for="usd-target-distance-input">目標のレースの距離</label>' +
					'<span class="usd-target-distance-field">' +
						'<input class="uma-input usd-target-distance-input" type="text" inputmode="numeric" autocomplete="off"' +
							' id="usd-target-distance-input" data-usd-el="target-distance" data-usd-axis="' + axis.key + '" placeholder="例: 2400"/>' +
						'<span>m</span>' +
					'</span>' +
					'<p class="usd-target-distance-hint">入れると、その距離のレースで発動するスキルに絞る（区分は距離から決まる）</p>' +
					'<p class="usd-target-distance-error" data-usd-el="target-distance-error" role="alert" data-shown="false"></p>' +
				'</div>' : '') +
			'</section>';
		}).join('');

		// data-usd-open は選択肢パネルの開閉。**「絞り込み中」の行（filter-summary）は
		// 畳まない** ―― 閉じている間も「どの軸に何が入っているか」が読めるようにするため
		// （タブの件数バッジと、この行の2つで補う）。
		el.innerHTML = '' +
			'<div class="usd-axis-tabs" data-usd-el="axis-tabs" data-usd-open="' + pickerAxisPanelOpen + '">' +
				'<div class="usd-tabbar" data-usd-el="tabbar" data-usd-rows="1">' +
					'<div class="usd-tablist" role="tablist" aria-label="絞り込みの軸">' + tabs + '</div>' +
				'</div>' +
				'<div class="usd-tabpanels" data-usd-el="tabpanels">' + panels + '</div>' +
				'<div class="usd-active-summary" data-usd-el="filter-summary" aria-live="polite"></div>' +
			'</div>';

		const tablist = el.querySelector('.usd-tablist');
		// WAI-ARIA のタブの作法：←→で隣へ、Home/Endで端へ（移動と同時に切り替える）。
		tablist.addEventListener('keydown', (e) => {
			const keys = pickableAxes().map(a => a.key);
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
			if (e.target.classList && e.target.classList.contains('usd-opts')) updateOptionsMore(e.target);
		}, true);
		if (global.ResizeObserver) new global.ResizeObserver(updatePickerFilterLayout).observe(tablist);
	}

	/* タブの切り替えは aria-selected・aria-expanded・tabindex・is-active を揃えて付け替えるだけ。 */
	function selectPickerAxisTab(axisKey, focus) {
		picker.activeAxis = axisKey;
		pickerEl.querySelectorAll('.usd-tab').forEach(tab => {
			const on = tab.dataset.usdAxis === axisKey;
			tab.setAttribute('aria-selected', String(on));
			tab.setAttribute('aria-expanded', String(on && pickerAxisPanelOpen));
			tab.tabIndex = on ? 0 : -1;
			if (on && focus) tab.focus({ preventScroll: true });
		});
		pickerEl.querySelectorAll('.usd-tabpanel').forEach(panel => {
			panel.classList.toggle('is-active', panel.dataset.usdAxis === axisKey);
		});
	}

	/**
	 * 選択肢パネルを開く／閉じる（段4 の続き）。
	 *
	 * **閉じるのは表示だけ。** `pickerFilters` には触らないので、絞り込みの結果は変わらない
	 * （チェックの状態も残ったままで、開き直すとそのまま見える）。
	 * 開いたときは `updatePickerFilterLayout()` を通す ―― 閉じている間はパネルが
	 * `display: none` で、チップの高さも箱の高さも 0 として読めるため、
	 * 開いた直後に測り直さないと「▼ ほか N件」が出鱈目な数のまま残る。
	 */
	function setPickerAxisPanelOpen(open) {
		pickerAxisPanelOpen = !!open;
		const box = q(pickerEl, 'axis-tabs');
		if (box) box.setAttribute('data-usd-open', String(pickerAxisPanelOpen));
		const tab = pickerEl.querySelector('.usd-tab[aria-selected="true"]');
		if (tab) tab.setAttribute('aria-expanded', String(pickerAxisPanelOpen));
		syncResultsExtra();
		if (pickerAxisPanelOpen) updatePickerFilterLayout();
	}

	/**
	 * 選択肢パネルの高さを測る。**畳んでいるときは一瞬だけ開いた指定を当てて読む。**
	 *
	 * 畳んだ状態でモーダルを開き直したときにも「いくら空いたか」が要るので、
	 * 開いているときの値を覚えておくのではなく、要るたびに測り直す
	 * （幅が変わればタブの段数も選択肢の段数も変わるため、覚えた値はすぐ古くなる）。
	 * 属性を戻すまでの間に描画は挟まらないので、画面はちらつかない。
	 */
	function measureTabPanelsHeight() {
		const box = q(pickerEl, 'axis-tabs');
		const panels = q(pickerEl, 'tabpanels');
		if (!box || !panels) return 0;
		const was = box.getAttribute('data-usd-open');
		if (was !== 'true') box.setAttribute('data-usd-open', 'true');
		const h = panels.offsetHeight;
		if (was !== 'true') box.setAttribute('data-usd-open', was);
		return h;
	}

	/**
	 * 畳んで空いたぶんを、絞り込み結果の一覧の上限へ足す（`--usd-results-extra`）。
	 * 足し引きが同じ量になるので、**モーダルの高さも上端も動かないまま、一覧だけが広がる。**
	 * 開いているときは 0 に戻す。**値が変わるときだけ書く**（ResizeObserver から
	 * 何度も呼ばれるので、毎回書くと測り直しが連鎖する）。
	 */
	function syncResultsExtra() {
		const results = q(pickerEl, 'results');
		if (!results) return;
		const next = pickerAxisPanelOpen ? '' : measureTabPanelsHeight() + 'px';
		const now = results.style.getPropertyValue('--usd-results-extra');
		if (now === next) return;
		if (next) results.style.setProperty('--usd-results-extra', next);
		else results.style.removeProperty('--usd-results-extra');
	}

	/**
	 * タブを押したとき。**いま開いている軸のタブをもう一度押すと閉じる**（それ以外は選んで開く）。
	 * キーボードの ←→・Home・End は必ず別の軸へ移るので、あちらは selectPickerAxisTab のまま
	 * （移動と同時に開く。閉じているときに矢印で移ったら開くのが自然）。
	 */
	function onPickerAxisTabClick(axisKey) {
		if (axisKey === picker.activeAxis && pickerAxisPanelOpen) { setPickerAxisPanelOpen(false); return; }
		selectPickerAxisTab(axisKey, false);
		setPickerAxisPanelOpen(true);
	}

	/* ------------------------------------------------------------
	 * 入口の並び（.usd-entry-row）の「続きがある」の見せ方（73セッション目の手直し）
	 *
	 * 折り返さず横に送る形にしたあと、**実機で「次の入口があることに気づけない幅」**が見つかった。
	 * 原因は、ボタンの境目と表示範囲の右端が**ぴったり一致する幅がある**こと。
	 * 320〜1280px を 2px 刻みで測ると、あふれる幅のうち1割強でそうなる（境目の数だけ現れる）。
	 *
	 * 直し方は2つ重ねる。
	 *   (1) **覗かせ** ―― その幅のときだけ表示範囲の右端をわずかに内側へ寄せ（--usd-entry-trim）、
	 *       直前のボタンが必ず切れて見えるようにする。
	 *   (2) **フェード** ―― 隠れている側にだけ薄くかける（data-usd-fade）。
	 *
	 * **どちらも px を決め打ちしない。** 実際の座標から決める（F-28・C-14 と同じ考え方）。
	 * ------------------------------------------------------------ */
	// 右端で切れているボタンは、これだけ見えていて、
	const ENTRY_MIN_PEEK = 12;
	// これだけ隠れていること（数pxしか隠れていないと、切れていることに気づけない）
	const ENTRY_MIN_CUT = 8;
	// 探す幅の上限。だめな帯は「隠れ＋ボタンのすきま＋見え」ぶんしか無いので、これで足りる
	const ENTRY_MAX_TRIM = 40;

	/**
	 * 切り詰めを測って当てる。**幅が変わったときだけ**呼ぶ。
	 *
	 * **送っている最中に測り直してはいけない。** 切り詰めを変えると表示範囲の幅が変わり、
	 * 送りきったかどうかの判定（scrollLeft と scrollWidth の関係）がその場でずれる。
	 * 実際、フェードが末尾で「左だけ」にならず「両側」のまま残る揺れが出た。
	 */
	function measureEntryRowTrim(row) {
		if (!row || !row.isConnected || !row.offsetParent) return;
		if (row.dataset.usdNoTrim) return;   // 覗かせの切り詰めが要らない（ボタンの並びでない）もの。フェードだけ使う
		const btns = [...row.children].filter((c) => c.tagName === 'BUTTON');
		if (btns.length === 0) return;

		/* (1) 覗かせ ―― いったん切り詰めを外して素の座標で測る。
		   **欲しいのは「右端をまたいでいるボタンが1つあって、見えている幅も隠れている幅も
		   それぞれ十分にある」状態。** 片方だけでは足りない ――
		   隠れているのが数pxだと、ボタンが切れていることに気づけない（実測で 1.6〜3.8px の幅があった）。
		   表示範囲の右端は**内側へしか動かせない**ので、条件を満たす切り詰めを 1px ずつ探す。
		   ボタンの境目の前後の「だめな帯」は 隠れ+すきま+見え ぶんしか無いので、必ず見つかる。 */
		row.style.setProperty('--usd-entry-trim', '0px');
		let trim = 0;
		if (row.scrollWidth > row.clientWidth + 1) {
			const base = row.getBoundingClientRect().left - row.scrollLeft;
			const 端 = btns.map((b) => {
				const r = b.getBoundingClientRect();
				return { 左: r.left - base, 右: r.right - base };
			});
			const よい = (right) => 端.some((e) => e.左 <= right - ENTRY_MIN_PEEK && e.右 >= right + ENTRY_MIN_CUT);
			const right0 = row.clientWidth;
			for (let t = 0; t <= ENTRY_MAX_TRIM; t++) {
				if (よい(right0 - t)) { trim = t; break; }
			}
			row.style.setProperty('--usd-entry-trim', trim + 'px');
		}
	}

	/** (2) フェード ―― 隠れている側にだけ。収まっているときはどちらにも付けない。送るたびに呼ぶ。 */
	function updateEntryRowFade(row) {
		if (!row || !row.isConnected || !row.offsetParent) return;
		const max = row.scrollWidth - row.clientWidth;
		if (max <= 1) row.removeAttribute('data-usd-fade');
		else {
			const 左に隠れている = row.scrollLeft > 1;
			const 右に隠れている = row.scrollLeft < max - 1;
			row.setAttribute('data-usd-fade',
				左に隠れている && 右に隠れている ? 'both' : 左に隠れている ? 'left' : 右に隠れている ? 'right' : 'none');
			if (!左に隠れている && !右に隠れている) row.removeAttribute('data-usd-fade');
		}
	}

	/** 画面にある入口の並びを全部見る。見張りは1度だけ付ける。 */
	function scanEntryRows() {
		document.querySelectorAll('.usd-entry-row, .usd-hscroll').forEach((row) => {
			if (!row.dataset.usdEntryWatched) {
				row.dataset.usdEntryWatched = '1';
				// 送るたびに変わるのは**フェードだけ**（切り詰めは測り直さない。上の注意）
				row.addEventListener('scroll', () => updateEntryRowFade(row), { passive: true });
				// 幅が変わったとき・隠れていたものが出てきたとき（Deck の比較シート編集）
				if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
					measureEntryRowTrim(row);
					updateEntryRowFade(row);
				}).observe(row);
			}
			measureEntryRowTrim(row);
			updateEntryRowFade(row);
		});
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('resize', scanEntryRows);
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanEntryRows);
		else scanEntryRows();
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

		// 選択肢を「3段ぶん」で頭打ちにする高さは、チップの実測値から決める（段4 で 2.75段 → 3段）。
		// px を決め打ちすると、チップの余白や中の checkbox の寸法を触った瞬間に
		// 3段目が半分だけ見える状態へ静かにずれる（実際に踏んだ）。
		const chip = pickerEl.querySelector('.usd-opt');
		const tabs = pickerEl.querySelector('.usd-axis-tabs');
		if (chip && chip.offsetHeight && tabs) tabs.style.setProperty('--usd-opt-row', chip.offsetHeight + 'px');

		pickerEl.querySelectorAll('.usd-opts').forEach(updateOptionsMore);
		// 幅が変われば選択肢の段数も変わる＝畳んで空く量も変わるので、測り直す（畳んでいるときだけ動く）
		syncResultsExtra();
	}

	/**
	 * 選択肢が3段に収まりきらないとき、**箱の外**に「▼ ほか N件」を出す（70セッション目・段4）。
	 *
	 * **N は「いま下に隠れている選択肢の数」**（段の数ではなく件数）。スクロールするたびに減る。
	 * 数え方は「その選択肢の下端が、見えている範囲の下端より下にあるか」だけ。
	 * 上へスクロールして隠れたぶんは数えない ―― 合図が指しているのは**下の続き**なので。
	 *
	 * **場所は常に取ったまま、見えなくするだけ**（`data-more="none"` ＋ CSS の visibility）。
	 * `hidden` で消すと、スクロールし切った瞬間にこの行のぶんだけ下のスキル一覧が跳ねる。
	 */
	function updateOptionsMore(opts) {
		const wrap = opts.parentElement;
		const panel = wrap && wrap.parentElement;
		const box = panel && panel.querySelector('[data-usd-el="opts-more"]');
		if (!box) return;
		// パネルを畳んでいる間は測れない（display:none で高さが 0 になり、全部が「隠れている」
		// と数えられてしまう）。開いたときに測り直すので、ここでは何もしない。
		if (opts.clientHeight === 0) return;
		const bottom = opts.scrollTop + opts.clientHeight;
		const hidden = [...opts.children].filter(c => c.offsetTop + c.offsetHeight > bottom + 1).length;
		box.setAttribute('data-more', hidden > 0 ? 'below' : 'none');
		const btn = box.querySelector('.usd-opts-more-btn');
		if (!btn) return;
		btn.textContent = hidden > 0 ? '▼ ほか ' + hidden + '件' : '';
		// 見えていないときはタブ移動でも拾わせない（場所は取ったままなので tabindex で外す）
		btn.tabIndex = hidden > 0 ? 0 : -1;
		btn.setAttribute('aria-hidden', hidden > 0 ? 'false' : 'true');
	}

	/**
	 * 「▼ ほか N件」を押したときに1段ぶんスクロールする。
	 * **段の高さは実測から出す**（チップの高さも隙間もトークン次第で変わるため）。
	 * 段が1つしか無いときはここへ来ない（そのときは合図が出ていない）。
	 */
	function scrollOptionsByRow(axisKey) {
		const opts = pickerEl.querySelector('.usd-tabpanel[data-usd-axis="' + axisKey + '"] .usd-opts');
		if (!opts) return;
		const tops = [...new Set([...opts.children].map(c => c.offsetTop))].sort((a, b) => a - b);
		const pitch = tops.length > 1 ? tops[1] - tops[0] : opts.clientHeight;
		opts.scrollTop = opts.scrollTop + pitch;
		updateOptionsMore(opts);
	}

	/**
	 * 件数バッジ・「この軸を解除」の活性・「絞り込み中」の一覧をまとめて更新する。
	 * タブ化すると他の軸に入れた条件が視界から消えるので、この3つで補っている。
	 */
	function refreshPickerFilterUi() {
		if (!pickerEl) return;
		// 目標のレースの距離（C-97）。件数バッジ・「この軸を解除」・「絞り込み中」に d を含める。
		// 評価は1回だけ行い、下の3か所で使い回す。
		const target = currentTargetDistance();
		const targetOk = target.state === 'ok';
		{
			const input = q(pickerEl, 'target-distance');
			const err = q(pickerEl, 'target-distance-error');
			if (input) {
				input.disabled = !raceDistances;
				input.setAttribute('aria-invalid', String(['invalid', 'noRace', 'mismatch'].includes(target.state)));
			}
			if (err) {
				// 使えないとき（読めていない）は、入力が空でも知らせる
				const msg = !raceDistances ? evaluateTargetDistance('0', []).message : (targetOk || target.state === 'empty' ? '' : target.message);
				err.textContent = msg;
				err.setAttribute('data-shown', String(msg !== ''));
			}
		}
		pickableAxes().forEach(axis => {
			const n = pickerFilters[axis.key].length + (axis.targetDistance && targetOk ? 1 : 0);
			const badge = pickerEl.querySelector('[data-usd-el="axis-count"][data-usd-axis="' + axis.key + '"]');
			if (badge) { badge.hidden = n === 0; badge.textContent = n; }
			const tab = pickerEl.querySelector('.usd-tab[data-usd-axis="' + axis.key + '"]');
			if (tab) tab.setAttribute('aria-label', axis.label + (n ? '（' + n + '件選択中）' : ''));
			const clearBtn = pickerEl.querySelector('[data-usd-act="filter-clear-axis"][data-usd-axis="' + axis.key + '"]');
			// 入力欄にエラーの文字が残っているときも「この軸を解除」で消せるようにする
			if (clearBtn) clearBtn.disabled = n === 0 && !(axis.targetDistance && pickerTargetDistanceText !== '');
		});

		const summary = q(pickerEl, 'filter-summary');
		if (!summary) return;
		const active = pickableAxes().filter(a => pickerFilters[a.key].length > 0 || (a.targetDistance && targetOk));
		if (active.length === 0) {
			summary.innerHTML = '<span>条件なし（すべてのスキルを表示）</span>';
			return;
		}
		summary.innerHTML = '<span class="usd-summary-label">絞り込み中</span>' +
			active.map(a =>
				'<button type="button" class="usd-summary-item" data-usd-act="filter-jump" data-usd-axis="' + a.key + '" title="このタブを開く">' +
					'<b>' + esc(a.label) + '</b>' +
					esc(pickerFilters[a.key].map(v => tagLabel(a.key, v))
						.concat(a.targetDistance && targetOk ? [target.distance + 'm'] : []).join('・')) +
				'</button>'
			).join('') +
			'<button type="button" class="usd-link-btn" data-usd-act="filter-clear-all">すべて解除</button>';
	}

	/* モーダルを開き直したときに、選択肢パネルの見た目を `pickerFilters` と揃え直す。
	 *
	 * **72セッション目・段10 で「初期状態へ戻す」のをやめた。**
	 * それまではここで全部のチェックを外していたので、**開き直すたびに条件が白紙**になっていた。
	 * いまは `pickerFilters`（ページを開いている間だけ残る）を DOM へ写す。
	 * **DOM ではなく `pickerFilters` が正**（チェックの有無はモーダルが閉じている間も変数だけが持つ）。 */
	function resetPickerFilterUi() {
		pickerEl.querySelectorAll('[data-usd-el="filter-check"]').forEach(el => {
			el.checked = (pickerFilters[el.dataset.axis] || []).indexOf(el.dataset.value) !== -1;
		});
		pickerEl.querySelectorAll('.usd-opts').forEach(el => { el.scrollTop = 0; });
		// 目標のレースの距離も `pickerTargetDistanceText` が正（DOM へ写す）
		const targetInput = q(pickerEl, 'target-distance');
		if (targetInput) targetInput.value = pickerTargetDistanceText;
		selectPickerAxisTab(pickableAxes()[0].key, false);
		// **開閉だけは初期化しない**（閉じていたら閉じたまま開き直す）。
		// ここで属性を入れ直すのは、モーダルを開くたびに DOM と変数を揃えるため。
		setPickerAxisPanelOpen(pickerAxisPanelOpen);
		refreshPickerFilterUi();
		updatePickerFilterLayout();
	}

	function onPickerFilterChange(input) {
		const axis = input.dataset.axis, value = input.dataset.value;
		const arr = pickerFilters[axis];
		const idx = arr.indexOf(value);
		if (input.checked && idx === -1) arr.push(value);
		if (!input.checked && idx !== -1) arr.splice(idx, 1);
		refreshPickerFilterUi();
		renderPickerResults();
	}

	function onTargetDistanceInput(input) {
		pickerTargetDistanceText = input.value;
		refreshPickerFilterUi();
		renderPickerResults();
	}

	/** 目標のレースの距離を空にする（変数と入力欄の両方）。「この軸を解除」「すべて解除」から。 */
	function clearTargetDistance() {
		pickerTargetDistanceText = '';
		const input = q(pickerEl, 'target-distance');
		if (input) input.value = '';
	}

	function clearPickerAxisFilter(axisKey) {
		pickerFilters[axisKey].length = 0;
		pickerEl.querySelectorAll('[data-usd-el="filter-check"][data-axis="' + axisKey + '"]').forEach(el => { el.checked = false; });
		const axis = TAG_AXES.find(a => a.key === axisKey);
		if (axis && axis.targetDistance) clearTargetDistance();
		refreshPickerFilterUi();
		renderPickerResults();
	}

	function clearAllPickerFilters() {
		TAG_AXES.forEach(a => { pickerFilters[a.key].length = 0; });
		pickerEl.querySelectorAll('[data-usd-el="filter-check"]').forEach(el => { el.checked = false; });
		clearTargetDistance();
		refreshPickerFilterUi();
		renderPickerResults();
		const tab = pickerEl.querySelector('.usd-tab[data-usd-axis="' + picker.activeAxis + '"]');
		if (tab) focusNoScroll(tab);
	}

	// 「条件でスキルを検索」の母集団。マスター＋**タグが付いた追加カタログのもの**（段1b）。
	// **利用者のカスタムスキルは 2026-09-27（C-100）から入れない**（作る手段の廃止に合わせて検索の一覧から外した。
	// 保存済みのものは、入っているセット・比較シートで `findSkill()` から名前を引くだけ）。
	//
	// **タグを持たないものは入れない。** matchesFilters() では、空配列を「万能（どの条件にも当たる）」と
	// 読む軸（距離・脚質）が残っているので、タグ未設定のものを入れると、
	// その2軸だけで絞ったときに一覧の先頭から最後まで居座ることになる。
	// **70セッション目・段5 で、残りの軸は空を「該当なし」と読むようになった**（効果タイプは C-89）ので、
	// 「どんな条件でも居座る」ではなくなったが、入れない理由としては変わらない。対象は2種類ある:
	// - タグ未設定の拡張スキル（`tagsPending`。付け終わったものから自動でここへ入る）
	// - そもそもタグを持たないカテゴリ（シナリオ因子。`tags` も `tagsPending` も持たない）
	// どちらも「`tags` を持っているか」の1つの判定で外れるので、カテゴリ名では分岐しない。
	//
	// 名前で探す側（findSkillsByNameFragment → buildSkillTextIndex）には、タグの有無に関係なく
	// 全件が入っている（名前で引くだけなら万能スキル扱いの問題が起きないため）。
	//
	// **72セッション目・段9: 顔ぶれを組み立てる部分を `taggedSkillPool()` へ出した。**
	// ここと「緑スキルを追加」の一覧（`getPoolExcludedSkills`）は**表と裏**で、
	// 片方から外したものはもう片方に出る、が成り立っていないと**どこからも選べないスキル**が生まれる。
	// 顔ぶれを2か所で組み立てていると、片方にだけ足し忘れてそれが起きる
	// （実際、段8 の時点では**カスタムスキルが母集団からは消えるのに緑スキルの一覧には出ない**状態だった）。
	// **`raceDistance`（レースの距離の限定。C-97）も一緒に通す** ―― ここで `{id, name, tags}` に削ると、
	// 距離の軸の判定に限定が届かない。
	function taggedSkillPool() {
		return masterSkills
			// C-91: 拡張スキルは検索に出してよいもの（`SEARCHABLE_EXTENDED_SKILL_IDS`）だけ。
			// 母集団と「緑スキルを追加」の一覧の両方がここから作られるので、ここで外せば両方から外れる。
			.concat(extraCatalog.filter(x => x.tags && isSearchableCatalogEntry(x)).map(x => ({ id: x.id, name: x.name, tags: x.tags, raceDistance: x.raceDistance })));
	}

	/** いまの「目標のレースの距離」の評価（入力の文字と、距離の軸で選んでいる区分から）。 */
	function currentTargetDistance() {
		const axis = TAG_AXES.find(a => a.targetDistance);
		return evaluateTargetDistance(pickerTargetDistanceText, axis ? (pickerFilters[axis.key] || []) : []);
	}

	/**
	 * 「条件で検索」の一覧の行（絞り込みに当たったもの全部）。**除外中のものも消さずに返し、`excluded` の印を付ける**
	 * （段3b・2026-09-30）。除外中＝「本育成スキルを除外する」を押している間の、編成で得られる●のスキル
	 * （`pickerHiddenIds`）。一覧では**グレーアウトで残し、チェックできず、理由を添える**。並びは元のまま。
	 * 追加済み（`picker.excludeIds`）と、パッシブ（緑スキルの一覧のほうへ行く）は、これまでどおり一覧に出さない。
	 * 返す `skill` は母集団の実体そのもの（印は行の側に付け、スキルの側は書き換えない）。
	 */
	function getPickerPoolRows() {
		const hidden = new Set(pickerHiddenIds);
		const target = currentTargetDistance();
		// エラー（数字でない・レースが無い・区分と合わない）のときは d を使わずに絞る（C-97）
		const usable = target.state === 'ok' ? target : null;
		return taggedSkillPool().filter(s => !picker.excludeIds.includes(s.id)
			&& !isPoolExcluded(s) && matchesFilters(s, pickerFilters, usable))
			.map(s => ({ skill: s, excluded: hidden.has(s.id) }));
	}

	/**
	 * 「条件で検索」で**追加できるスキル**（除外中を含まない）。「N件」・「表示中を全て選択」の対象はこれ。
	 * 除外中の行の数は `getPickerPoolRows()` から数える（「除外中 M件」）。
	 */
	function getFilteredPickerPool() {
		return getPickerPoolRows().filter(r => !r.excluded).map(r => r.skill);
	}

	/** いま除外中（「本育成スキルを除外する」で一覧から選べなくしている）か。 */
	function isPickerExcluded(skillId) {
		return pickerHiddenIds.indexOf(skillId) !== -1;
	}

	/**
	 * 「除外中 M件」の表示を合わせる。M が0のときは出さない。
	 * 単位は**その一覧の数え方に合わせる**: 「条件で検索」は「絞り込み結果（N件）」なので「件」、
	 * 「緑スキルを追加」は「（このうちN種が追加済み）」や①のバッジ「除外N種」と同じ「種」。
	 */
	function setExcludedCountLabel(el, count, unit) {
		if (!el) return;
		el.hidden = count <= 0;
		el.textContent = count > 0 ? '本育成編成のため選べない ' + count + '件' : '';   // 段7（旧3）: 行の数なので「件」。段7c の M: 本育成で得るためと、不要にしているための両方を合わせた件数
	}

	/** 除外中の行（グレーアウト・チェックできない・理由つき）。条件で検索と緑スキルの一覧で共通。 */
	function excludedRowHtml(skill, checkEl) {
		return '<label class="usd-row usd-row--excluded" data-usd-excluded="1" aria-disabled="true">' +
			'<input type="checkbox" data-usd-el="' + checkEl + '" value="' + esc(skill.id) + '" disabled/>' +
			'<span>' + esc(skill.name) + '</span>' +
			'<span class="usd-row-reason" data-usd-el="excluded-reason">' + esc(pickerBlockReasonOf(skill.id) || PICKER_EXCLUDED_REASON) + '</span>' +
		'</label>';
	}

	/**
	 * **「条件で検索」の母集団から外すもの**（71セッション目・段8）。
	 * いまはパッシブ（緑スキル）だけ。**軸のキーは書かない** ―― `TAG_AXES` の
	 * `poolExcluded` の印が付いた軸に値を持つかどうかだけを見る（恒久ルール1）。
	 * 外したものは、段9 の「緑スキルを追加」で名前から直接選ぶ。
	 */
	function isPoolExcluded(skill) {
		return TAG_AXES.some(a => a.poolExcluded && (((skill.tags && skill.tags[a.key]) || []).length > 0));
	}

	/**
	 * 逆向き：`poolExcluded` の軸に値を持つものだけを返す（段9 の「緑スキルを追加」の一覧の母集団）。
	 * **`getFilteredPickerPool()` と同じ顔ぶれ（`taggedSkillPool`）から取る。**
	 * 絞り込みが外したものは必ずここに出る ―― どちらからも漏れるスキルを作らないため。
	 */
	function getPoolExcludedSkills() {
		return taggedSkillPool().filter(isPoolExcluded);
	}

	/**
	 * 渡したIDのうち、**パッシブ（＝緑スキルの一覧に並ぶもの）が何種あるか**（段9 の追加）。
	 * 入口のボタンの「（N種追加済み）」と、モーダルの注記の「このうちN種が追加済み」が
	 * **必ず同じ数**になるよう、数え方をここ1か所に置く。**軸のキーは書かない**（恒久ルール1）。
	 */
	function countPassiveSkills(ids) {
		const set = new Set(getPoolExcludedSkills().map(s => s.id));
		return (ids || []).filter(id => set.has(id)).length;
	}

	function renderPickerResults() {
		if (!pickerEl) return;
		// 緑スキルの一覧も同じ合図で作り直す（72セッション目・段9）。
		// **再描画の入口を増やさない**のが狙い ―― `pickerSinkFor().remove()` のように
		// 「背後のセットが変わったら一覧を作り直す」経路が既にいくつかあり、
		// そちらに緑スキル用の呼び出しを足して回ると、足し忘れた経路でチェックがズレる。
		renderPassiveList();
		const el = q(pickerEl, 'results');
		if (!el) return;
		// 除外中の行は消さずに残す（段3b）。「N件」と「表示中を全て選択」は追加できる行だけを数え、
		// 除外中の行の数は「除外中 M件」として別に出す。
		const rows = getPickerPoolRows();
		const filtered = rows.filter(r => !r.excluded).map(r => r.skill);
		const excludedCount = rows.length - filtered.length;
		q(pickerEl, 'result-count').textContent = filtered.length + '件';
		setExcludedCountLabel(q(pickerEl, 'result-excluded'), excludedCount, '件');
		const selectAllBox = pickerEl.querySelector('[data-usd-act="picker-select-all"]');
		if (selectAllBox) selectAllBox.checked = filtered.length > 0 && filtered.every(s => picker.checked.has(s.id));
		updatePickerCommitState();
		if (rows.length === 0) {
			el.innerHTML = '<p class="text-xs text-slate-400 p-3">条件に一致するスキルがありません。</p>';
			return;
		}
		// 追加できる行が0件で、除外中の行だけが残るときは、そのことを1行で言ってから除外中の行を並べる。
		// **p にしない** ―― `.usd-results:has(> p)` は「0件の文を箱の中央に置く」ための規則で、
		// 直下に p があると行の並びまで中央寄せになってしまう。
		const lead = filtered.length === 0
			? '<div class="text-xs text-slate-400 p-3" data-usd-el="results-none-addable">追加できるスキルがありません。</div>' : '';
		el.innerHTML = lead + rows.map(r => r.excluded
			? excludedRowHtml(r.skill, 'skill-check-excluded')
			: '<label class="usd-row">' +
				'<input type="checkbox" data-usd-el="skill-check" value="' + esc(r.skill.id) + '"' + (picker.checked.has(r.skill.id) ? ' checked' : '') + '/>' +
				'<span>' + esc(r.skill.name) + '</span>' +
			'</label>'
		).join('');
	}

	/* ------------------------------------------------------------
	 * 緑スキルを追加（72セッション目・段9）
	 *
	 * **独立した選択の状態を持たない。** チェックが入っているかどうかは、そのつど
	 * `picker.excludeIds`（＝いま編集しているセットの中身）から作る。
	 * これで「追加済みスキルから消したのに、開き直すとチェックが残っている」が
	 * 構造として起こらない ―― 覚えている状態が無いので、食い違いようが無い。
	 * **モーダル（z-index:80）が追加済みスキルの一覧を覆う**ので、2つが同時に見える場面も無い。
	 *
	 * 並び順は**マスターの並びのまま**（`getPoolExcludedSkills()` が返す順）。
	 * 「条件で検索」の一覧と同じ順なので、2つの入口で同じスキルが違う場所に出ることが無い。
	 * ------------------------------------------------------------ */

	function renderPassiveList() {
		if (!pickerEl || picker.mode !== 'passive') return;
		const el = q(pickerEl, 'passive-results');
		if (!el) return;
		const list = getPoolExcludedSkills();
		const chosen = new Set(picker.excludeIds);
		const countEl = q(pickerEl, 'passive-count');
		// 数え方は入口のボタンの「（N種追加済み）」と同じ関数を通す（食い違わないため）
		if (countEl) countEl.textContent = countPassiveSkills(picker.excludeIds) + '種';
		if (list.length === 0) {
			// 実データでは起きない（マスターに67件ある）が、収録データを読めなかったときに
			// 空の箱だけが出るのは何が起きたのか分からないので、文を1つ置く。
			el.innerHTML = '<p class="text-xs text-slate-400 p-3">追加できる緑スキルがありません。</p>';
			return;
		}
		/* スクロールの位置を持ち越す。1件チェックするたびに一覧ごと作り直すため。
		 *
		 * **【実測・72セッション目】いまの作りでは、この2行が無くても位置は保たれる。**
		 * Chrome は「同じ高さの中身で innerHTML を入れ替えただけ」なら scrollTop を動かさない
		 * （`output/scratch/step9-scroll-probe.mjs` で 1405px のまま。ただし**いったん空にすると 0 に戻る**）。
		 * **チェックの前後で行数が変わらない**ので、そこに救われている。
		 * 残してあるのは保険 ―― 一覧の行数が変わる作りにした瞬間（絞り込みを足す、
		 * 追加済みを隠す、など）に、**下のほうを押すたび先頭へ飛ぶ**形で表に出る種類の不具合で、
		 * 押した本人には原因が見えない。**この2行には効いていることを示す検査が無い**
		 * （行数が変わらない以上、壊しても落ちない）。消すときは上の事情を承知のうえで。 */
		const keep = el.scrollTop;
		/* 「本育成スキルを除外する」を押している間、編成で得られる●のスキルは**消さずにグレーアウト**して
		 * 残し、チェックできず、理由を添える（段3b。「条件で検索」の一覧と同じ扱い）。
		 * **すでに追加済み（チェックが入っている）ものは普通の行のまま** ―― 無効にすると、外す操作までできなくなる。
		 * 実データでも編成の●に緑スキルは入る（練習のヒント・育成ウマ娘の覚醒・イベントのいずれにも）ので、この一覧でも効かせる。 */
		const isExcludedRow = (s) => !chosen.has(s.id) && isPickerExcluded(s.id);
		setExcludedCountLabel(q(pickerEl, 'passive-excluded'), list.filter(isExcludedRow).length, '種');
		el.innerHTML = list.map(s => isExcludedRow(s)
			? excludedRowHtml(s, 'passive-check-excluded')
			: '<label class="usd-row">' +
				'<input type="checkbox" data-usd-el="passive-check" value="' + esc(s.id) + '"' + (chosen.has(s.id) ? ' checked' : '') + '/>' +
				'<span>' + esc(s.name) + '</span>' +
			'</label>'
		).join('');
		el.scrollTop = keep;
	}

	/**
	 * 緑スキルのチェックを押したとき。**その場で受け皿へ流す**（確定ボタンを経由しない）。
	 * 受け皿は他の入口とまったく同じもの（`pickerSinkFor` / deck 側の `recordSkillSink`）なので、
	 * `saveUserData()` と背後の再描画まで既に通っている経路に乗る。
	 * **Undo には積まない** ―― 1件ずつの操作で、押し直せば戻るため（§10 D の15）。
	 */
	function onPassiveCheck(skillId, checked) {
		const sink = picker.onAdd;
		if (!sink) return;
		// 除外中（追加済みでないもの）は足さない（段3b。除外中の行のチェックは無効にしてあるので、保険）
		if (checked && isPickerExcluded(skillId) && picker.excludeIds.indexOf(skillId) === -1) { renderPassiveList(); return; }
		if (checked) {
			if (typeof sink === 'object' && typeof sink.add === 'function') sink.add([skillId]);
			else if (typeof sink === 'function') sink([skillId]);
			if (picker.excludeIds.indexOf(skillId) === -1) picker.excludeIds.push(skillId);
		} else {
			// 関数を渡す旧い形の受け皿は「足す」しかできないので、外す操作は受けられない。
			// 黙って何も起きないと壊れて見えるので、チェックを戻して知らせる。
			if (!(typeof sink === 'object' && typeof sink.remove === 'function')) {
				toast('この画面では緑スキルを外せません');
				renderPassiveList();
				return;
			}
			sink.remove([skillId]);
			// `pickerSinkFor().remove()` は自分でも掃除するが、Deck の比較シート側の受け皿は
			// 掃除しない。**どちらから来ても合うように、ここでも落とす**（二重に落としても害は無い）。
			picker.excludeIds = picker.excludeIds.filter(id => id !== skillId);
		}
		renderPassiveList();
	}

	function togglePickerSelectAll(checked) {
		const filtered = getFilteredPickerPool();
		filtered.forEach(s => { if (checked) picker.checked.add(s.id); else picker.checked.delete(s.id); });
		renderPickerResults();
	}

	function onPickerCheck(skillId, checked) {
		// 除外中の行にはチェックを入れさせない（段3b）。除外中の行のチェックは無効にしてあるので、
		// ここへは通常は来ない。**押せてしまう経路があっても足さない**ための保険。
		if (checked && isPickerExcluded(skillId)) { renderPickerResults(); return; }
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
	 * 確定ボタンを持つモード（条件で検索・テキストで検索・画像から読み取る）はどれもここへ合流するので、
	 * 「一度に2種以上足したらUndoに積む」の判定もここ1か所で済む。
	 *
	 * 受け皿（openPicker の第3引数）は次の形のオブジェクトで渡す:
	 *   { scope, add(ids)->実際に足したIDの配列, remove(ids)->真偽, probe()->文字列 }
	 * 関数をそのまま渡す旧い形も受け付けるが、その場合はUndoに積まない（戻し方が分からないため）。
	 */
	function addCheckedSkills() {
		if (picker.checked.size === 0) { toast('スキルにチェックを入れてください'); return; }
		// 本育成で得るスキル（「本育成編成」が ON のセット）は、どの経路からも足さない（段7の 旧4。保険）
		const ids = Array.from(picker.checked).filter(id => !isPickerExcluded(id));
		if (ids.length === 0) { picker.checked.clear(); renderPickerResults(); renderPasteReport(); return; }
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

	function emptyTagSet() {
		const tags = {};
		TAG_AXES.forEach(axis => { tags[axis.key] = []; });
		return tags;
	}

	/* 【INTENTIONALLY_REMOVED・2026-09-27（C-100）】ここには、カスタムスキルを作る処理
	   （`createCustomSkill()`・`addCustomSkillFromPicker()`・`renderCustomSkillTagInputs()`。同名の確認・
	   ソフトキャップ50件の確認・作ったときのトーストを含む）があった。作る手段ごと廃止した。
	   保存済みのカスタムスキルは消さずに、入っている場所でだけ名前を引く（`findSkill()`）。 */

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
			// 本育成で得るスキル（「本育成編成」が ON のセット）は選択に入れない（段7の 旧4。報告に「追加しなかったもの」として数える）
			if (picker.excludeIds.indexOf(r.matchedId) === -1 && !isPickerExcluded(r.matchedId)) picker.checked.add(r.matchedId);
		});
		renderPasteReport();
		renderPickerResults();
	}

	function runPasteMatch() {
		const input = q(pickerEl, 'paste-input');
		const text = input ? input.value : '';
		if (!text.trim()) { toast('貼り付けたテキストがありません'); return; }
		const result = matchPastedSkillText(text, { searchableOnly: true });   // C-91
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
		if (picker.excludeIds.indexOf(skillId) === -1 && !isPickerExcluded(skillId)) picker.checked.add(skillId);   // 本育成で得るものは足さない（段7の 旧4）
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
		if (input) focusNoScroll(input);
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
		const found = findSkillsByNameFragment(input.value, { searchableOnly: true });   // C-91
		if (!found.query) { out.innerHTML = ''; return; }
		if (found.total === 0) {
			// 文はそのまま。2026-09-27（C-100）までは下に「収録されていないスキルとして追加」
			// （カスタムスキルを作る導線）を置いていたが、作る手段ごと廃止したので外した。
			// その行を足さないときは、報告の「無視」で飛ばせる。
			out.innerHTML = '<p class="usd-paste-hint usd-name-none">一致するスキルがありません。入力に誤りがないかご確認ください。新しく追加されたスキルなど、このツールに収録されていないスキルの可能性もあります。</p>';
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
					? '<span class="usd-name-hit usd-name-hit--added">' + esc(h.name) + '<span class="usd-name-added">' + esc(pickerBlockReasonOf(h.id) || PICKER_EXCLUDED_REASON) + '</span></span>'
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
		// 本育成で得るため追加しなかったもの（段7の 旧4。「本育成編成」が ON のセットで、一致した行）。0種のときは出さない
		const blockedIds = new Set(resolved.filter(r => !excluded.has(r.chosenId) && isPickerExcluded(r.chosenId)).map(r => r.chosenId));

		let html = '<div class="usd-paste-summary">' +
			'<span class="usd-paste-ok">選択 ' + (resolvedIds.size - blockedIds.size) + '件</span>' +
			(alreadyIds.size > 0 ? '<span class="usd-paste-muted">（うち追加済み ' + alreadyIds.size + '件）</span>' : '') +
			(blockedIds.size > 0 ? '<span class="usd-paste-muted" data-usd-el="paste-blocked">本育成編成のため追加しなかったもの ' + blockedIds.size + '種</span>' : '') +
			(pending.length > 0 ? '<span class="usd-paste-warn">要確認 ' + pending.length + '件</span>' : '') +
			(errors.length > 0 ? '<span class="usd-paste-err">エラー ' + errors.length + '件</span>' : '') +
		'</div>';
		if (resolvedIds.size - blockedIds.size > alreadyIds.size) {
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
		// **絞り込みのチェック（pickerFilters）はここで消さない**（72セッション目・段10）。
		// 開き直したときも前に入れた条件のまま出す。**選択肢パネルの開閉と同じ寿命**
		// （どちらもモジュールの変数＝ページを開いている間だけ）。
		// **チェックしたスキル（picker.checked）は別**で、こちらは毎回空に戻す ――
		// 追加は閉じる前に確定しているので、持ち越すと「もう入っているものにチェックが付いたまま」になる。
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

		const spec = PICKER_MODES[picker.mode];
		q(pickerEl, 'picker-title').textContent = spec.title;
		// ocr モードは paste の枠を借りる（貼り付け欄だけ隠す）。要約は openSkillRowsPicker が入れる
		const isOcr = picker.mode === 'ocr';
		q(pickerEl, 'mode-filter').hidden = picker.mode !== 'filter';
		q(pickerEl, 'mode-paste').hidden = !(picker.mode === 'paste' || isOcr);
		q(pickerEl, 'mode-passive').hidden = picker.mode !== 'passive';
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
		const focusTarget = picker.mode === 'paste' ? pasteInput : null;
		if (focusTarget) focusNoScroll(focusTarget);
	}

	// 条件でスキルを検索（8軸フィルター）。従来の openSkillPicker と同じ呼び出し方。
	function openSkillPicker(existingSkillIds, onAdd) { openPicker('filter', existingSkillIds, onAdd); }
	// テキストで検索（貼り付けたテキストとマスターの照合）。
	function openTextSkillPicker(existingSkillIds, onAdd) { openPicker('paste', existingSkillIds, onAdd); }
	// 緑スキルを追加（パッシブを名前で選ぶ。72セッション目・段9）。
	function openPassiveSkillPicker(existingSkillIds, onAdd) { openPicker('passive', existingSkillIds, onAdd); }

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
			lines.push('白スキルは「テキストで検索」または「条件で検索」から追加してください。');
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
	 *   onChange          … テンプレート/ドラフトが変化したとき fn()
	 *   onViewChange      … 一覧⇄編集が切り替わったとき fn('list'|'editor')
	 *   screenshotEntry   … { label, onClick } を渡すと、編集画面の入口の並び（「テキストで検索」と
	 *                       「マスターにないスキルを追加」の間）に4つ目の入口「スクショから読み取る」を出す。
	 *                       押したときの処理は呼び出し元（special.html のスキルセットOCR。撮影ガイドを開く）が持つ。
	 *                       省略すると出ない（uma-skill-deck.html はこちら。Deck 単体ページの入口は後続）。
	 *
	 * 呼び出し元がテンプレートIDやドラフトの区別を意識しなくて済むよう、
	 * 選択結果は getSelection() が返す { kind, id, name, skillIds } に統一している。
	 */
	/* ============================================================
	 * スキルの説明（ⓘ と名前の長押し。段6。設計は skill-pt-calculation-step0.md の 2-6・2-9・2-10）
	 *
	 * **要素に付ける部品**（`attachSkillInfo(el, { skillId, getLine })`）。編成パネル・周回因子セットの描画コードには
	 * 埋め込まず、描いたあとに「名前の要素」へ付ける（Deck の改修で別の画面にも差せるように）。
	 *   ・ⓘ ボタン（名前のそば）と名前の長押し（約0.5秒）は、どちらも同じ説明を開く。
	 *   ・説明の器は共有の `.uma-overlay .uma-popover`（css/shell.css。640px 以下は下端固定のボトムシート）。
	 *   ・中身：名前／レアリティ（skill-pt.json）／公式の説明文（skill-descriptions.json）／基礎Pt／系列（skill-step-up.json）。
	 *   ・説明文は**開いたときに1回だけ**読む（ページの読み込みでは取りに行かない）。読めなくても開いて、基礎Pt などは出す。
	 *   ・説明文・名前は textContent で入れる（HTML として解釈しない）。
	 * 基礎Pt・レアリティ・前段は、段3 の loadSkillPtData が読んだものを共有する（二重に取りに行かない）。
	 * ============================================================ */
	const SKILL_RARITY_LABELS = { white: '白スキル', gold: '金スキル', unique: '固有スキル', evolved: '進化スキル' };
	const SKILL_DESCRIPTIONS_PATH = 'data/skill-descriptions.json';
	const SKILL_INFO_LONG_PRESS_MS = 500;
	const SKILL_INFO_CANCEL_MOVE_PX = 10;
	let skillDescState = { status: 'idle', map: null, promise: null };   // idle／loading／ok／failed
	let skillInfoUi = null;        // { back, pop, title, body, closeBtn }（最初に開いたときに作る共有の器）
	let skillInfoCur = null;       // 開いているもの { key, skillId, btn, opener, token, refocus, onClose }（段7で汎用の小窓にも使う）
	let skillInfoToken = 0;
	let skillInfoKeyBound = false;

	/** 説明文を読む。**1回だけ**（成功したら読み直さない。読み込み中は同じ約束を返す）。失敗したら次に開いたときにもう一度試す。 */
	function loadSkillDescriptions() {
		if (skillDescState.status === 'ok' || skillDescState.status === 'loading') return skillDescState.promise;
		const st = { status: 'loading', map: null, promise: null };
		skillDescState = st;
		st.promise = (async () => {
			try {
				const doc = await fetchMasterJson(withDataVersion(SKILL_DESCRIPTIONS_PATH), false);
				const map = new Map();
				((doc && doc.entries) || []).forEach(e => {
					if (e && typeof e.skillId === 'string' && typeof e.text === 'string' && e.text) map.set(e.skillId, e.text);
				});
				st.map = map;
				st.status = 'ok';
			} catch (e) { st.status = 'failed'; }
			return st.status;
		})();
		return st.promise;
	}

	/**
	 * 系列（前段データから）。前へはたどれる限り（前段が複数のときは先頭）、後ろへは次のスキルが1つのあいだたどる
	 * （次が複数なら、そこで束ねて止める）。関係が無ければ null。**名前や記号は見ない**（id の関係だけ）。
	 */
	function skillSeriesOf(skillId, stepUp) {
		if (!stepUp || typeof stepUp.prevOf !== 'function' || typeof stepUp.nextOf !== 'function') return null;
		const seen = new Set([skillId]);
		const back = [];
		for (let cur = skillId; ;) {
			const p = stepUp.prevOf(cur).filter(x => !seen.has(x))[0];
			if (!p) break;
			seen.add(p); back.unshift(p); cur = p;
		}
		const fwd = [];
		for (let cur = skillId; ;) {
			const n = stepUp.nextOf(cur).filter(x => !seen.has(x));
			if (n.length === 0) break;
			fwd.push(n);
			if (n.length > 1) break;
			seen.add(n[0]); cur = n[0];
		}
		if (back.length === 0 && fwd.length === 0) return null;
		return { back: back, fwd: fwd, rootId: stepUp.rootOf(skillId) };
	}

	function infoEl(tag, cls, text) {
		const e = global.document.createElement(tag);
		if (cls) e.className = cls;
		if (text !== undefined && text !== null) e.textContent = text;
		return e;
	}

	/** 説明文の欄を、いまの読み込みの状態に合わせて整える。行が無いスキルは欄ごと外す。 */
	function settleSkillInfoDesc(skillId, el) {
		const st = skillDescState.status;
		if (st === 'ok') {
			const t = skillDescState.map.get(skillId);
			if (t) { el.textContent = t; el.classList.remove('usd-info-desc--pending'); } else if (el.parentNode) el.parentNode.removeChild(el);
		} else if (st === 'failed') {
			el.textContent = '説明文は準備中です';
			el.classList.add('usd-info-desc--pending');
		} else {
			el.textContent = '読み込み中…';
			el.classList.add('usd-info-desc--pending');
		}
	}

	/** 基礎スキルPt の1行（説明の小窓とイベントの小窓の「取得できるスキル」で共通。Pt 不要・Pt 未収録はこの表記）。データを読み込み中なら null */
	function basePtText(skillId) {
		const pd = skillPtData;
		if (!pd.meta.loaded) return null;
		const row = pd.skillPt instanceof Map ? pd.skillPt.get(skillId) : null;
		if (!(pd.skillPt instanceof Map)) return pd.meta.skillPt === 'failed' ? 'Pt のデータを読み込めませんでした' : 'Pt 未収録';
		if (!row) return 'Pt 未収録';
		if (row.pt === 0) return 'Pt 不要';
		return '基礎 ' + row.pt + ' Pt';
	}

	/** 説明の本文を作る。line は呼び出し元が渡す「いまの設定」の1行（無ければ null）。note は系列の注記（「◎と共有」など。無ければ null） */
	function fillSkillInfo(skillId, line, note) {
		const ui = skillInfoUi;
		ui.title.textContent = getSkillName(skillId);
		const body = ui.body;
		body.textContent = '';
		const pd = skillPtData;
		const row = pd.skillPt instanceof Map ? pd.skillPt.get(skillId) : null;
		if (row && SKILL_RARITY_LABELS[row.rarity]) {
			const r = infoEl('p', 'usd-info-rarity', SKILL_RARITY_LABELS[row.rarity]);
			r.setAttribute('data-usd-el', 'info-rarity');
			body.appendChild(r);
		}
		const desc = infoEl('p', 'usd-info-desc', '');
		desc.setAttribute('data-usd-el', 'info-desc');
		body.appendChild(desc);
		settleSkillInfoDesc(skillId, desc);
		if (pd.meta.loaded) {
			const t = basePtText(skillId);
			const p = infoEl('p', 'usd-info-pt', t);
			p.setAttribute('data-usd-el', 'info-pt');
			body.appendChild(p);
			if (line) {
				const n = infoEl('p', 'usd-info-pt usd-info-pt--now', line);
				n.setAttribute('data-usd-el', 'info-pt-now');
				body.appendChild(n);
			}
		}
		const ser = skillSeriesOf(skillId, pd.stepUp);
		if (ser) {
			const p = infoEl('p', 'usd-info-series', '系列：');
			p.setAttribute('data-usd-el', 'info-series');
			const parts = [];
			ser.back.forEach(id => parts.push({ text: getSkillName(id) }));
			parts.push({ text: getSkillName(skillId), self: true });
			ser.fwd.forEach(group => parts.push({ text: group.map(getSkillName).join('／') }));
			parts.forEach((x, i) => {
				if (i > 0) p.appendChild(global.document.createTextNode(' → '));
				p.appendChild(x.self ? infoEl('strong', 'usd-info-self', x.text) : global.document.createTextNode(x.text));
			});
			body.appendChild(p);
			if (ser.rootId !== skillId) {
				const rt = infoEl('p', 'usd-info-root', 'Lv は ' + getSkillName(ser.rootId) + ' のものです');
				rt.setAttribute('data-usd-el', 'info-root');
				body.appendChild(rt);
			}
			// 系列の共有の注記（段7の (14)）: 行からは外し、ここ（系列の欄）にだけ出す
			if (note) {
				const nt = infoEl('p', 'usd-info-root', note);
				nt.setAttribute('data-usd-el', 'info-share');
				body.appendChild(nt);
			}
		}
	}

	function ensureSkillInfoUi() {
		if (skillInfoUi) return skillInfoUi;
		const doc = global.document;
		const back = infoEl('div', 'usd-info-back');
		back.setAttribute('data-usd-el', 'info-back');
		back.hidden = true;
		const pop = infoEl('div', 'uma-overlay uma-popover usd-info-pop');
		pop.setAttribute('data-usd-el', 'info-pop');
		pop.setAttribute('role', 'dialog');
		pop.hidden = true;
		const titleId = uid('usdinfotitle');
		pop.setAttribute('aria-labelledby', titleId);
		const head = infoEl('div', 'uma-popover-head');
		const title = infoEl('h2', 'uma-popover-title');
		title.id = titleId;
		const closeBtn = infoEl('button', 'uma-popover-close', '×');
		closeBtn.type = 'button';
		closeBtn.setAttribute('aria-label', '閉じる');
		closeBtn.setAttribute('data-usd-el', 'info-close');
		head.appendChild(title);
		head.appendChild(closeBtn);
		const bodyWrap = infoEl('div', 'uma-popover-body');
		const body = infoEl('div', 'usd-info-body');
		body.setAttribute('data-usd-el', 'info-body');
		bodyWrap.appendChild(body);
		pop.appendChild(head);
		pop.appendChild(bodyWrap);
		doc.body.appendChild(back);
		doc.body.appendChild(pop);
		back.addEventListener('click', () => closeSkillInfo());
		closeBtn.addEventListener('click', () => closeSkillInfo());
		if (!skillInfoKeyBound) {
			skillInfoKeyBound = true;
			// Escape で閉じる。開いているときだけ効き、ほかの Escape の処理（ミニウィンドウなど）へは回さない
			doc.addEventListener('keydown', (e) => {
				if (e.key !== 'Escape' || !skillInfoCur) return;
				e.preventDefault();
				e.stopPropagation();
				closeSkillInfo();
			}, true);
		}
		skillInfoUi = { back: back, pop: pop, head: head, title: title, body: body, closeBtn: closeBtn };
		return skillInfoUi;
	}

	function closeSkillInfo() {
		const cur = skillInfoCur;
		if (!cur || !skillInfoUi) return;
		skillInfoCur = null;
		skillInfoToken++;
		skillInfoUi.pop.hidden = true;
		skillInfoUi.back.hidden = true;
		if (cur.btn) cur.btn.setAttribute('aria-expanded', 'false');
		if (typeof cur.onClose === 'function') { try { cur.onClose(); } catch (e) { /* 呼び出し元の後始末の失敗で閉じる処理を止めない */ } }
		// 開いたきっかけの要素へフォーカスを戻す（画面が描き直されて無くなっていたら、同じものを探す）
		let target = cur.opener && cur.opener.isConnected ? cur.opener : (cur.btn && cur.btn.isConnected ? cur.btn : null);
		if (!target && cur.refocus) target = global.document.querySelector(cur.refocus);
		if (!target && cur.skillId) {
			const all = global.document.querySelectorAll('[data-usd-el="skill-info-btn"], [data-usd-info]');
			for (let i = 0; i < all.length; i++) {
				if ((all[i].getAttribute('data-skill-id') || all[i].getAttribute('data-usd-info')) === cur.skillId) { target = all[i]; break; }
			}
		}
		if (target && typeof target.focus === 'function') focusNoScroll(target);
	}

	/**
	 * 共有の小窓を開く（段7。スキルの説明と同じ器・同じ閉じ方）。
	 *   o.key    … 何を開いているかの印（同じ key で開き直すと中身だけ作り直す）
	 *   o.title  … 見出し／ o.build(body) … 本文を DOM で作る／ o.btn … aria-expanded を付け外しするボタン
	 *   o.opener … 閉じたときにフォーカスを戻す要素／ o.refocus … それが無くなっていたときに探すセレクタ／ o.onClose … 閉じたときの後始末
	 *   o.titleHtml … 見出しを HTML で渡す（呼び出し元が esc 済みのもの。番号のバッジを付けるとき。段7b の ⑩）。無ければ o.title
	 *   o.wide … 広い幅で小窓の幅を広げる（イベントの選択の2カラム。共有の CSS には触らず、core のスタイルの修飾クラスで広げる）
	 */
	function openPopover(o) {
		const ui = ensureSkillInfoUi();
		if (skillInfoCur && skillInfoCur.btn) skillInfoCur.btn.setAttribute('aria-expanded', 'false');
		if (skillInfoCur && typeof skillInfoCur.onClose === 'function' && skillInfoCur.key !== o.key) { try { skillInfoCur.onClose(); } catch (e) {} }
		const token = ++skillInfoToken;
		skillInfoCur = { key: o.key || '', skillId: o.skillId || null, btn: o.btn || null, opener: o.opener || o.btn || null, token: token, refocus: o.refocus || null, onClose: o.onClose || null };
		ui.pop.classList.toggle('usd-info-pop--wide', !!o.wide);
		const oldSwitch = ui.head.querySelector('.usd-ev-switch');
		if (oldSwitch) oldSwitch.parentNode.removeChild(oldSwitch);
		if (o.titleHtml) ui.title.innerHTML = o.titleHtml; else ui.title.textContent = o.title || '';
		ui.body.textContent = '';
		o.build(ui.body, token);
		ui.back.hidden = false;
		ui.pop.hidden = false;
		if (o.btn) o.btn.setAttribute('aria-expanded', 'true');
		focusNoScroll(ui.closeBtn);
		return token;
	}

	function openSkillInfo(skillId, line, btn, opener, note) {
		const ui = ensureSkillInfoUi();
		const token = openPopover({ key: 'skill:' + skillId, skillId: skillId, btn: btn, opener: opener || btn,
			build: () => fillSkillInfo(skillId, line, note) });
		// 説明文は、最初に開いたときに1回だけ読む。読み終わったとき、まだ同じ説明が開いていれば欄を整える
		if (skillDescState.status !== 'ok') {
			loadSkillDescriptions().then(() => {
				if (!skillInfoCur || skillInfoCur.token !== token) return;
				const el = ui.body.querySelector('[data-usd-el="info-desc"]');
				if (el) settleSkillInfoDesc(skillId, el);
			});
		}
	}

	/**
	 * 名前の要素 el に、ⓘ ボタン（el の直後）と長押しを付ける。戻り値は { button, detach }。
	 *   opts.skillId … 必須。
	 *   opts.getLine … 開く直前に呼ぶ。「いまの設定」の1行（例：「いまの設定：108 Pt（Lv5）」）か null。
	 *   opts.getNote … 開く直前に呼ぶ。系列の注記（「◎と共有」「○のレベル」）か null（段7の (14)）。
	 *   opts.trigger … 'info'（既定。ⓘ と長押し）か 'self'（段7の (14)。el 自身（button）を押すと開く。ⓘ も長押しも付けない）
	 * 長押し：約0.5秒押し続けると開く。10px 以上動いたら・スクロールが始まったら取り消す。端末標準の長押し
	 * （文字の選択・コンテキストメニュー・iOS の呼び出し）は、-webkit-touch-callout／user-select と contextmenu の抑止で避ける。
	 */
	function attachSkillInfo(el, opts) {
		const o = opts || {};
		if (!el || !el.parentNode || o.skillId === undefined || o.skillId === null || o.skillId === '') return null;
		injectStyles();
		const skillId = String(o.skillId);
		const doc = global.document;
		const lineOf = () => { try { return typeof o.getLine === 'function' ? (o.getLine() || null) : null; } catch (e) { return null; } };
		const noteOf = () => { try { return typeof o.getNote === 'function' ? (o.getNote() || null) : null; } catch (e) { return null; } };
		if (o.trigger === 'self') {
			// 名前そのものがボタン（段7の (14)）。Enter／Space は button の既定の click で届く
			el.setAttribute('data-usd-el', 'skill-info-btn');
			el.setAttribute('data-skill-id', skillId);
			el.setAttribute('aria-label', getSkillName(skillId) + 'の説明を開く');
			el.setAttribute('aria-expanded', 'false');
			const onClick = () => { if (skillInfoCur && skillInfoCur.btn === el) closeSkillInfo(); else openSkillInfo(skillId, lineOf(), el, el, noteOf()); };
			el.addEventListener('click', onClick);
			return { button: el, detach: function () { el.removeEventListener('click', onClick); } };
		}
		const btn = infoEl('button', 'uma-help-btn usd-info-btn');
		btn.type = 'button';
		btn.setAttribute('data-usd-el', 'skill-info-btn');
		btn.setAttribute('data-skill-id', skillId);
		btn.setAttribute('aria-label', getSkillName(skillId) + 'の説明を開く');
		btn.setAttribute('aria-expanded', 'false');
		btn.title = '説明を開く';
		el.parentNode.insertBefore(btn, el.nextSibling);
		el.classList.add('usd-info-target');
		btn.addEventListener('click', () => {
			if (skillInfoCur && skillInfoCur.btn === btn) closeSkillInfo(); else openSkillInfo(skillId, lineOf(), btn, btn, noteOf());
		});

		let timer = 0, sx = 0, sy = 0, active = false;
		const onScroll = () => cancel();
		function cancel() {
			if (timer) { global.clearTimeout(timer); timer = 0; }
			active = false;
			doc.removeEventListener('scroll', onScroll, true);
		}
		const onDown = (e) => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			cancel();
			sx = e.clientX; sy = e.clientY; active = true;
			doc.addEventListener('scroll', onScroll, true);
			timer = global.setTimeout(() => {
				timer = 0;
				if (!active) return;
				cancel();
				openSkillInfo(skillId, lineOf(), btn, el, noteOf());
			}, SKILL_INFO_LONG_PRESS_MS);
		};
		const onMove = (e) => {
			if (!active) return;
			if (Math.hypot(e.clientX - sx, e.clientY - sy) >= SKILL_INFO_CANCEL_MOVE_PX) cancel();
		};
		const onCtx = (e) => e.preventDefault();
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', cancel);
		el.addEventListener('pointercancel', cancel);
		el.addEventListener('pointerleave', cancel);
		el.addEventListener('contextmenu', onCtx);
		return {
			button: btn,
			detach: function () {
				cancel();
				el.removeEventListener('pointerdown', onDown);
				el.removeEventListener('pointermove', onMove);
				el.removeEventListener('pointerup', cancel);
				el.removeEventListener('pointercancel', cancel);
				el.removeEventListener('pointerleave', cancel);
				el.removeEventListener('contextmenu', onCtx);
				if (btn.parentNode) btn.parentNode.removeChild(btn);
				el.classList.remove('usd-info-target');
			}
		};
	}

	/** root の中の [data-usd-info="<skillId>"] すべてに attachSkillInfo を付ける（描き直すたびに呼ぶ。古い要素は捨てられる）。 */
	function attachSkillInfoIn(root, makeOpts) {
		if (!root) return;
		const els = root.querySelectorAll('[data-usd-info]');
		for (let i = 0; i < els.length; i++) {
			const id = els[i].getAttribute('data-usd-info');
			attachSkillInfo(els[i], makeOpts(id));
		}
	}

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
		// 「＋新規」の中身（未保存の編成）を残す localStorage のキー（C-53）。渡さなければメモリだけ
		const draftKey = opts.draftKey || null;
		// セット（段8・C-120。special だけ）。真のときは、編成のタブを出さず、②で選んでいるセットの編成を開く（setHub）
		const setBased = !!opts.setMode;
		let setTplId = '';            // setBased: 開いているセットの templateId（'' は「＋新規」＝下書き）
		let roster = restoreDraftRoster();
		let selectedId = '';          // 保存済みを選んでいればその rosterId
		let picking = null;           // { kind: 'uma' } / { kind: 'card', index } / null
		let pickQuery = '';           // ミニウィンドウの検索語
		let pickType = '';            // ミニウィンドウの種類の絞り込み（'' はすべて）
		let showUnconf = false;       // イベントスキル未収録のカード名の一覧を開いているか（既定は閉じる）
		let findTimer = 0;
		let nameEdit = null;          // 選んでいるタブの名前を編集中なら { value }（段7の (6)・段7b の ①。確定するまで保存しない）
		let limitNotice = false;      // 「編成は10件までです…」を出しているか（段7の (4)。次の操作で消える）
		let sortKey = null;           // 並べ替えている列のメンバー（段7の (16)。保存しない）
		let eventsFor = null;         // イベントを選ぶ小窓を開いている列のメンバー（段7の (19)。保存しない）
		let gridScrollReset = false;  // 次の描き直しで、表の中のスクロールを先頭へ戻すか（並べ替え・絞り込みのとき。段7c の M）
		const uidBase = uid('roster');

		/* ------------------------------------------------------------
		 * 絞り込み（段7の (17)）。距離・脚質・バ場の3つのセレクト。**判定は「条件で検索」と同じ matchesFilters**
		 * （空を万能と読むのは距離・脚質、バ場は排他）。タグを持たないスキルは絞り込み中も残る（黙って落とさない）。
		 * 設定は編成の skillFilter に保存する（触らなければ足さない・読み込み時に補わない・知らない値は「指定なし」として扱う）。
		 * ------------------------------------------------------------ */
		function filterAxes() {
			return ROSTER_FILTER_AXIS_KEYS.map(k => TAG_AXES.find(a => a.key === k)).filter(Boolean);
		}
		/** いまの絞り込み（解いたあとの値）。{ 軸のキー: 値 }。選んでいない・知らない値は入らない */
		function resolvedFilter() { return resolvedFilterOf(roster); }
		/** 絞り込みの述語。絞り込んでいなければ null。 */
		function filterPredicate() { return filterPredicateOf(roster); }
		function setFilter(axisKey, value) {
			if (!filterAxes().some(a => a.key === axisKey)) return;
			const cur = (roster.skillFilter && typeof roster.skillFilter === 'object') ? Object.assign({}, roster.skillFilter) : {};
			if (value) cur[axisKey] = value; else delete cur[axisKey];
			if (Object.keys(cur).length === 0) delete roster.skillFilter; else roster.skillFilter = cur;
			persistNow();
		}

		/**
		 * スキルごとのオン/オフ（段7c の M）。オフにしたスキルは「取得しない」として扱う。保存は編成の offSkillIds（skillId の配列）。
		 * 触らなければ足さない・読み込み時に補わない。**切り替えるのはその 1 つの id だけ**で、指す先が無くなった古い id は書き換えない。
		 */
		function setSkillTaken(skillId, taken) {
			const cur = Array.isArray(roster.offSkillIds) ? roster.offSkillIds.slice() : [];
			const i = cur.indexOf(skillId);
			if (taken && i !== -1) cur.splice(i, 1);
			else if (!taken && i === -1) cur.push(skillId);
			if (cur.length === 0) delete roster.offSkillIds; else roster.offSkillIds = cur;
			persistNow();
		}
		/** 「すべて取得に戻す」。いま有効な（●の）オフだけを外し、指す先が無い古い id は残す */
		function clearOffSkills() {
			const res = computed();
			const cur = (Array.isArray(roster.offSkillIds) ? roster.offSkillIds : []).filter(id => !res.offIds.has(id));
			if (cur.length === 0) delete roster.offSkillIds; else roster.offSkillIds = cur;
			persistNow();
			render();
		}

		/**
		 * 編成で得られるスキル。**skillIds は●だけ**（段7で「有効にした△」は廃止。保存済みの enabledSkillIds は読まない）。
		 * イベントの選択（roster.eventChoices）と、絞り込みから決まる既定の選択（autoChoose）を効かせる。
		 *   visibleItems … 表に出す行（絞り込み中はそれに当たるもの。並べ替えはここでは行わない）
		 *   visibleSources … 表に出す行ぶんの由来（Pt の合計・小計・前段はこちらで計算する）
		 *   skillIds・sources … 絞り込みなしの全件（②へ渡すのはこちら）
		 */
		function computed() {
			const wanted = filterPredicate();
			const r = rosterSkillResultOf(roster);
			const unsure = new Set();
			r.sources.forEach(src => { if (!src.sure) unsure.add(src.skillId); });
			r.unsureIds = unsure;
			r.enabledIds = [];
			r.filtered = !!wanted;
			// 表に出す部分は、②の「本育成編成」と同じ関数で求める（段7d の ⑥）。取得しないにしたスキル（段7c の M）は、
			// 合計・種数・小計・前段・②へ渡す値から外す。絞り込みで隠れていても「取得しない」のまま
			const vp = visiblePartOf(roster, r);
			r.visibleItems = vp.visibleItems;
			r.visibleSources = vp.visibleSources;
			r.offList = vp.offList;
			r.offIds = new Set(r.offList);
			r.takenIds = vp.takenIds;
			r.visibleSureCount = vp.takenIds.length;
			// 種数（段7d の ⑫）。金スキルと、その前段の白スキルを両方取るときは合わせて1種
			r.kindCount = countSkillKinds(vp.takenIds);
			return r;
		}

		/* ------------------------------------------------------------
		 * スキルPt（段3・段7）。元データ（割引率の表と skill-pt.json）は、この編成パネルを作ったときに読む
		 * （special の①タブだけ）。計算は computeRosterPt に任せ、ここは設定を渡して結果を並べるだけ。
		 * ------------------------------------------------------------ */
		/** 'loading'（まだ）／'ok'／'failed'（割引率の表か skill-pt.json を読めなかった）。 */
		function ptDataStatus() { return skillPtDataStatus(); }

		/** いまの設定（解いたあとの値）。データが使えないときは null。 */
		function ptView0() {
			return ptDataStatus() === 'ok' ? resolveRosterPtSettings(roster, skillPtData.rules) : null;
		}

		/** Pt の結果（表に出す行ぶん）。データが使えないとき（読み込み中・失敗）は null。 */
		function computePtView(res) {
			if (ptDataStatus() !== 'ok') return null;
			const rules = skillPtData.rules;
			const settings = resolveRosterPtSettings(roster, rules);
			const pt = computeRosterPt({
				sources: res.visibleSources, rules: rules, skillPt: skillPtData.skillPt, stepUp: skillPtData.stepUp,
				statusId: settings.status, umaHintLevel: settings.umaHintLevel, offSkillIds: res.offList
			});
			if (!pt.ok) return null;
			const byId = new Map();
			pt.items.forEach(x => byId.set(x.skillId, x));
			return { rules: rules, settings: settings, pt: pt, byId: byId, res: res };
		}

		/** △の行の参考値（そのイベントで選んだとしたときの Pt）。 */
		function ptReferenceOf(view, skillId) {
			const res = view.res;
			const pt = computeRosterPt({
				sources: res.visibleSources, rules: view.rules, skillPt: skillPtData.skillPt, stepUp: skillPtData.stepUp,
				statusId: view.settings.status, umaHintLevel: view.settings.umaHintLevel, enabledSkillIds: [skillId]
			});
			return pt.ok ? (pt.items.find(x => x.skillId === skillId) || null) : null;
		}

		/** 設定を1つ替えて保存する。保存するのは roster.pt（無いものは既定で補う。ほかのキーの保存値は書き換えない）。 */
		function setPtSetting(key, value) {
			const rules = skillPtData.rules;
			if (!rules) return;
			const cur = (roster.pt && typeof roster.pt === 'object') ? roster.pt : {};
			roster.pt = {
				umaHintLevel: cur.umaHintLevel !== undefined ? cur.umaHintLevel : rules.umaHintLevelDefault,
				status: cur.status !== undefined ? cur.status : PT_STATUS_DEFAULT
			};
			roster.pt[key] = value;
			persistNow();
		}

		/** ヒントLv5 を選べない理由（選べるときは ''）。文言は割引率の表の値から作る。 */
		function umaLevelBlockedReason(view) {
			const rules = view.rules;
			if (!isNonNegInt(rules.umaHintLevelChoice) || !roster.umaId) return '';
			if (view.settings.umaChoices.indexOf(rules.umaHintLevelChoice) !== -1) return '';
			return '覚醒ヒントLv' + rules.umaHintLevelChoice + 'は覚醒レベル' + rules.umaHintLevelChoiceMinAwakening + 'のウマ娘のみ選べます';
		}

		/**
		 * 前段として必要なスキル（段4b → 段7d の ②）。「前段として必要 K種 P Pt」「（内訳）」「前段を含む合計 T Pt」の3行は廃止した。
		 * 合計の「X Pt/N種」が前段のPt を含む額になったので、ここには**前段のスキルと Pt の1行**だけを出す（長いときはこの行だけ横に送る。縦には増やさない）。
		 * 形は「ヒントLv0：折れない心 162・曙光 170」。前段のヒントレベルが違うものは「／」で分ける。前段が無いときは何も出さない。
		 */
		function prevHtml(view) {
			const pt = view.pt;
			if (!pt.prevItems || pt.prevItems.length === 0) return '';
			const groups = new Map();
			pt.prevItems.forEach(x => { const lv = x.hintLevel || 0; if (!groups.has(lv)) groups.set(lv, []); groups.get(lv).push(x); });
			const text = (x) => getSkillName(x.skillId) + ' ' + (x.base === null ? 'Pt未収録' : x.pt);
			const line = Array.from(groups.keys()).sort((p, q2) => p - q2).map(lv => 'ヒントLv' + lv + '：' + groups.get(lv).map(text).join('・')).join('／');
			return '<p class="usd-roster-prev usd-roster-prevline usd-hscroll" data-usd-el="pt-prev" data-usd-no-trim="1">' + esc(line) + '</p>';
		}

		/**
		 * 合計の1行（段7の (11)〜(13)）：「XXX Pt/XX種」（?）［勉強家］［切れ者］［ヒントLv3］［ヒントLv5］。
		 * 勉強家・切れ者は排他の切り替え（もう一度押すと「なし」）。ヒントLv は必ずどちらか1つ。ラベルと値は割引率の表から作る。
		 * 絞り込み中は小さい印を添える。説明（理論値・小計・条件・未収録・ヒントLv5 の理由）は（?）の小窓。
		 */
		function ptSummaryHtml(view, res) {
			const rules = view.rules;
			const s = view.settings;
			const pt = view.pt;
			let h = '<div class="usd-roster-ptsum" data-usd-el="pt-sum">';
			h += '<div class="usd-roster-sumrow" data-usd-el="pt-sumrow">';
			h += '<span class="usd-roster-sumhead">'
				+ '<span class="usd-roster-ptsum-total"><strong data-usd-el="pt-total">' + formatPtNumber(pt.totalWithPrev) + '</strong> Pt/<strong data-usd-el="pt-count">' + res.kindCount + '</strong>種</span>'
				+ '<button type="button" class="uma-help-btn" data-usd-act="pt-help" data-usd-el="pt-help-btn" aria-expanded="false" aria-label="合計の説明を開く" title="合計の説明を開く">?</button>'
				+ '</span>';
			h += '<span class="usd-roster-sumbtns" data-usd-el="pt-sumbtns">';
			rules.statuses.filter(st => st.id !== PT_STATUS_DEFAULT).forEach(st => {
				h += '<button type="button" class="usd-roster-togglebtn" data-usd-act="pt-status" data-value="' + esc(st.id) + '"'
					+ ' aria-pressed="' + (st.id === s.status ? 'true' : 'false') + '" title="' + esc(st.label + (st.percent > 0 ? ' −' + st.percent + '%' : '')) + '">' + esc(st.label) + '</button>';
			});
			// 段7b の ⑤：「ヒントLv3」のボタンは無し。「覚醒ヒントLv5」だけ（押している＝Lv5、押していない＝Lv3＝既定）。
			// 覚醒レベルが足りないウマ娘のときは押せない（理由は title と（?）の中）。Lv の数字は割引率の表から
			const choice = rules.umaHintLevelChoice;
			if (isNonNegInt(choice) && choice !== rules.umaHintLevelDefault) {
				const blocked = s.umaChoices.indexOf(choice) === -1;
				h += '<button type="button" class="usd-roster-togglebtn" data-usd-act="pt-uma" data-value="' + choice + '"'
					+ ' aria-pressed="' + (s.umaHintLevel === choice ? 'true' : 'false') + '"' + (blocked ? ' disabled' : '')
					+ ' title="' + esc(blocked ? umaLevelBlockedReason(view) : '育成ウマ娘の覚醒ヒントLv' + choice) + '">覚醒ヒントLv' + choice + '</button>';
			}
			h += '</span></div>';
			h += '</div>';
			return h;
		}
		/**
		 * 段8・C: 「ヒントLv0：…」の前段の行と、前段・ヒントレベルの知らせ。①の並びは
		 * 「X Pt/N種」の行（ptSummaryHtml）→ 育成ウマ娘とカードのパネル → この行 → 絞り込み → 表。
		 */
		function ptSubHtml(view) {
			const pt = view.pt;
			let h = prevHtml(view);
			if (skillPtData.meta.stepUp === 'failed') h += '<p class="usd-roster-note" data-usd-el="pt-prev-error">前段のデータを読み込めませんでした</p>';
			if (pt.unknownLevelSkillIds.length > 0) {
				h += '<p class="usd-roster-note" data-usd-el="pt-unknown">ヒントレベルが不明なスキル' + pt.unknownLevelSkillIds.length + '種は Lv0 として計算しています</p>';
			}
			return h ? '<div class="usd-roster-ptsub" data-usd-el="pt-sub">' + h + '</div>' : '';
		}

		/** （?）の小窓の中身（段7の (13)）。出る条件があるものだけ、上から順に。 */
		function fillSummaryInfo(body) {
			const res = computed();
			const view = computePtView(res);
			if (!view) { body.appendChild(infoEl('p', 'usd-info-desc--pending', 'Pt のデータを読み込めませんでした')); return; }
			const pt = view.pt;
			const line = (cls, text, el) => { const p = infoEl('p', cls, text); if (el) p.setAttribute('data-usd-el', el); body.appendChild(p); };
			line('', '理論値（各スキルを最大のヒントレベルで得た場合のスキルPt）', 'info-theory');
			line('', 'ヒント ' + formatPtNumber(pt.subtotals.hint) + ' Pt／イベント ' + formatPtNumber(pt.subtotals.event) + ' Pt／育成ウマ娘 ' + formatPtNumber(pt.subtotals.uma) + ' Pt'
				+ (pt.prevTotal > 0 ? '／前段 ' + formatPtNumber(pt.prevTotal) + ' Pt' : ''), 'info-subtotals');
			const sel = resolvedFilter();
			const keys = Object.keys(sel);
			if (keys.length > 0) {
				line('', '絞り込み中：' + keys.map(k => { const axis = TAG_AXES.find(a => a.key === k); return axis.label + ' ' + tagLabel(k, sel[k]); }).join('／'), 'info-filter');
			}
			if (pt.allUnpricedCount > 0) line('', '（Pt未収録' + pt.allUnpricedCount + '種は含めていません）', 'info-unpriced');
			const reason = umaLevelBlockedReason(view);
			if (reason) line('', reason, 'info-uma-reason');
			// 取得しないスキル（段7c の M）。0種のときは出さない。押すとすべてオンに戻る
			if (res.offList.length > 0) {
				const row = infoEl('div', 'usd-info-offrow');
				row.setAttribute('data-usd-el', 'info-off');
				const t = infoEl('span', '', '取得しないスキル ' + res.offList.length + '種');
				t.setAttribute('data-usd-el', 'info-off-count');
				row.appendChild(t);
				const btn = infoEl('button', 'usd-roster-togglebtn', 'すべて取得に戻す');
				btn.type = 'button';
				btn.setAttribute('data-usd-el', 'info-off-reset');
				btn.addEventListener('click', () => { closeSkillInfo(); clearOffSkills(); });
				row.appendChild(btn);
				body.appendChild(row);
			}
		}

		/** 育成ウマ娘の（i）の小窓の中身（段7の (7)）。 */
		function fillUmaInfo(body) {
			const p = infoEl('p', '', '★3・覚醒レベル最大として扱います。');
			p.setAttribute('data-usd-el', 'info-uma-note');
			body.appendChild(p);
		}

		/** 系列の共有の注記（段6→段7で小窓の系列の欄だけに出す）。同じ表に相手が居るときだけ。 */
		function shareNoteOf(skillId, res) {
			const su = skillPtData.stepUp;
			if (!su || typeof su.rootOf !== 'function') return '';
			const ids = res.visibleItems.map(x => x.skillId);
			const root = su.rootOf(skillId);
			if (root !== skillId) return ids.indexOf(root) !== -1 ? '○のレベル' : '';
			return ids.some(id => id !== skillId && su.rootOf(id) === skillId) ? '◎と共有' : '';
		}

		/** 名前を押したときの小窓に添える「いまの設定」の1行。●＝「いまの設定：P Pt（LvL）」、△＝「このイベントで選ぶと：P Pt（LvL）」。 */
		function infoLineFor(skillId) {
			const res = computed();
			const view = computePtView(res);
			if (!view) return null;
			const it = res.items.find(x => x.skillId === skillId);
			if (!it) return null;
			if (it.sure && res.offIds.has(skillId)) return '取得しない設定です';   // 段7c の M
			if (it.sure) {
				const x = view.byId.get(skillId);
				return x && x.base !== null && x.base !== 0 ? 'いまの設定：' + x.pt + ' Pt（Lv' + x.hintLevel + '）' : null;
			}
			const x = ptReferenceOf(view, skillId);
			return x && x.base !== null && x.base !== 0 ? 'このイベントで選ぶと：' + x.pt + ' Pt（Lv' + x.hintLevel + '）' : null;
		}

		/** 名前の右の Pt（段7の (14)）。●＝「P Pt」（Pt 不要・Pt 未収録はそのまま）、△＝薄い色の参考値。データが使えないときは出さない。 */
		function ptCellHtml(view, it, off) {
			if (!view) return '';
			// 取得しないにした行は Pt を「—」にする（段7c の M）
			if (off) return '<span class="usd-roster-pt" data-usd-el="pt-line">—</span>';
			const x = it.sure ? view.byId.get(it.skillId) : ptReferenceOf(view, it.skillId);
			if (!x) return '';
			const text = x.base === null ? 'Pt 未収録' : x.base === 0 ? 'Pt 不要' : x.pt + ' Pt';
			return '<span class="usd-roster-pt' + (it.sure ? '' : ' usd-roster-pt--ref') + '" data-usd-el="' + (it.sure ? 'pt-line' : 'pt-ref') + '">' + esc(text) + '</span>';
		}

		/* ------------------------------------------------------------
		 * ミニウィンドウの置き場所（F-61。69セッション目に直した）
		 *
		 * **全画面に重ねるものは document.body の直下に置く。** パネルの中に置くと、
		 * special の②を包む `.glass-card` が `backdrop-filter` を持っているために
		 * **子孫の `position: fixed` が「画面」ではなく「そのカード」を基準にする**
		 * （実測: `.usd-roster-modal` の上端が 375px で -210px、1280px で -52px）。
		 * 中身（`searchHtml()` / `confirmHtml()`）は render() が作り直す。
		 * 置き場所が container の外になるので、**同じ click / input のハンドラをこちらにも付ける**。
		 * ------------------------------------------------------------ */
		let modalHost = null;
		function ensureModalHost() {
			if (!modalHost) {
				modalHost = global.document.createElement('div');
				modalHost.setAttribute('data-usd-el', 'roster-modal-host');
				global.document.body.appendChild(modalHost);
				modalHost.addEventListener('click', onPanelClick);
				modalHost.addEventListener('input', onPanelInput);
			}
			return modalHost;
		}

		/** ドラフト（未保存の編成）を保存先から戻す。無ければ空の編成。 */
		function restoreDraftRoster() {
			const d = draftKey ? loadDraftRoster(draftKey) : null;
			const base = emptyRoster();
			if (!d) return base;
			const r = Object.assign(base, snapshot(d));
			r.cardIds = (Array.isArray(r.cardIds) ? r.cardIds : []).slice(0, ROSTER_CARD_SLOTS);
			while (r.cardIds.length < ROSTER_CARD_SLOTS) r.cardIds.push(null);
			return r;
		}

		/**
		 * 変更をその場で保存する（C-53）。保存済みの編成ならそのまま保存し、「＋新規」ならドラフトとして残す。
		 * 段7の (6)：「保存」ボタンは無くなった。カード・育成ウマ娘・設定・イベントの選択・絞り込みは、変えたそのときに
		 * ここで保存する（以前からそうなっていた）。名前だけは ✓ で確定する。
		 */
		function persistNow() {
			syncFixedFields();
			if (setBased && setTplId) {
				// セットの名前と揃える（名前は帯の ✎ で template と roster の両方を書き換える。ここで古い名前を書き戻さない）
				const t = ensureUserData().templates.find(x => x.templateId === setTplId);
				if (t) roster.name = String(t.name || '');
				// ①が空だったセットに初めて入れたとき：編成を作ってセットに付ける
				if (!selectedId) { if (attachRosterToTemplate(setTplId, snapshot(roster))) selectedId = roster.rosterId; return; }
			}
			if (selectedId) saveRoster(snapshot(roster));
			else if (draftKey) saveDraftRoster(draftKey, snapshot(roster));
		}
		/** setBased: セットを開く（段8）。下書きは下書きの編成、保存済みは付いている編成。付いていなければ空の編成（触ったときに作る） */
		function loadForSet(templateId) {
			setTplId = templateId || '';
			const t = setTplId ? ensureUserData().templates.find(x => x.templateId === setTplId) : null;
			if (!t) { setTplId = ''; loadSelected(''); return; }
			const r = setRosterOfTemplate(t);
			if (r) { loadSelected(r.rosterId); return; }
			selectedId = '';
			roster = emptyRoster();
			roster.name = String(t.name || '');
			picking = null;
			nameEdit = null;
			sortKey = null;
			render();
		}

		function syncFixedFields() {
			const uma = roster.umaId ? findUma(roster.umaId) : null;
			const row = uma ? initialRowOf(uma) : null;
			roster.star = row ? row.minStar : 0;
			roster.awakeningLevel = uma ? maxAwakeningLevelOf(uma) : 0;
		}

		/** ①のタブの脇に出す数（表に出ている●の数）を呼び出し元へ知らせる（段7の (2)）。 */
		function notifySureCount(res) {
			if (typeof opts.onSureCountChange === 'function') opts.onSureCountChange(res.kindCount);
		}

		/**
		 * 表の上端の位置（ページの先頭からの px）を --usd-grid-top に入れる（段7c の P の (6)）。スマホで、表の高さを「画面の高さ − 表の上端」にして
		 * 1画面に収めるための値（CSS が使う。デスクトップでは使わない）。パネルが見えていないとき（②③のタブを見ているとき）は測れないので何もしない
		 * （見えるようになったとき、下の ResizeObserver が測り直す）。
		 */
		function fitGrid() {
			const wrap = container.querySelector('.usd-roster-grid-wrap');
			if (!wrap || container.getClientRects().length === 0) return;
			const top = Math.round(wrap.getBoundingClientRect().top + (global.pageYOffset || 0)) + 'px';
			if (wrap.style.getPropertyValue('--usd-grid-top') !== top) wrap.style.setProperty('--usd-grid-top', top);
		}
		if (typeof global.ResizeObserver === 'function') new global.ResizeObserver(function () { fitGrid(); }).observe(container);
		global.addEventListener('resize', function () { fitGrid(); });

		function labelOfUma() {
			if (!roster.umaId) return '育成ウマ娘を選ぶ';
			const uma = findUma(roster.umaId);
			return uma ? formatEntryLabel(uma) : '（読み込めません：' + roster.umaId + '）';
		}
		function labelOfCard(i) {
			const id = roster.cardIds[i];
			if (!id) return 'サポカを選ぶ';
			const card = findCard(id);
			return card ? formatEntryShortLabel(card) : '（読み込めません：' + id + '）';
		}
		function fullLabelOfCard(i) {
			const id = roster.cardIds[i];
			const card = id ? findCard(id) : null;
			return card ? formatEntryLabel(card) : labelOfCard(i);
		}
		function cardSlotColorAttrs(i) {
			const id = roster.cardIds[i];
			const card = id ? findCard(id) : null;
			const n = cardTypeOrderOf(card);
			if (n === null) return '';
			return ' data-type-order="' + n + '" style="' + cardTypeColorVars(n) + '"';
		}

		function searchEntries(kind, text, type) {
			const query = normalizeSkillText(text || '');
			const pool = (kind === 'uma' ? listUmas() : listCards()).slice().reverse();
			const used = kind === 'card' ? roster.cardIds.filter(Boolean) : [];
			return pool
				.filter(e => !type || cardTypeOf(e) === type)
				.filter(e => !query || normalizeSkillText(formatEntryLabel(e)).indexOf(query) !== -1)
				.map(e => ({ id: e.id, label: formatEntryLabel(e), used: used.indexOf(e.id) !== -1,
					typeOrder: kind === 'card' ? cardTypeOrderOf(e) : null }));
		}

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
					const orderByName = cardTypeOrderByName();
					h += '<div class="usd-roster-pills" data-usd-el="types">'
						+ '<button type="button" class="usd-roster-pill usd-roster-pill--all" data-usd-act="type" data-value=""'
						+ ' aria-pressed="' + (pickType === '' ? 'true' : 'false') + '">すべて</button>'
						+ types.map(t => {
							const n = orderByName.has(t) ? orderByName.get(t) : null;
							return '<button type="button" class="usd-roster-pill' + (n === null ? '' : ' usd-roster-pill--typed') + '"'
								+ ' data-usd-act="type" data-value="' + esc(t) + '"'
								+ (n === null ? '' : ' data-type-order="' + n + '" style="' + cardTypeColorVars(n) + '"')
								+ ' aria-pressed="' + (pickType === t ? 'true' : 'false') + '">' + esc(t) + '</button>';
						}).join('')
						+ '</div>';
				} else {
					h += '<p class="usd-roster-note">種類のデータがまだありません。</p>';
				}
			}
			h += '<div class="usd-roster-hits" data-usd-el="hits"></div>';
			h += '</div></div>';
			return h;
		}

		function renderHits() {
			const box = modalHost ? q(modalHost, 'hits') : null;
			if (!box || !picking) return;
			const hits = searchEntries(picking.kind, pickQuery, picking.kind === 'card' ? pickType : '');
			if (hits.length === 0) { box.innerHTML = '<p class="usd-roster-note">見つかりません。</p>'; return; }
			const shown = hits.slice(0, PICK_LIST_LIMIT);
			const tint = (h) => (h.typeOrder === null || h.typeOrder === undefined) ? ''
				: ' data-type-order="' + h.typeOrder + '" style="' + cardTypeColorVars(h.typeOrder) + '"';
			const plain = picking.kind !== 'card';
			box.innerHTML = '<div class="usd-name-list">' + shown.map((h, i) => h.used
				? '<span class="usd-name-hit usd-name-hit--added">' + esc(h.label) + '<span class="usd-name-added">この編成に入っています</span></span>'
				: '<button type="button" class="usd-name-hit'
					+ (plain ? ' usd-name-hit--plain' + (i % 2 === 1 ? ' usd-name-hit--row-alt' : '')
						: (tint(h) ? ' usd-name-hit--typed' : '')) + '"'
					+ ' data-usd-act="take" data-entry-id="' + esc(h.id) + '"' + (plain ? '' : tint(h)) + '>' + esc(h.label) + '</button>'
			).join('') + '</div>'
				+ (hits.length > shown.length
					? '<p class="usd-roster-note">全' + hits.length + '件のうち ' + shown.length + '件を出しています。名前を入れると絞り込めます。</p>'
					: '<p class="usd-roster-note">' + hits.length + '件</p>');
		}

		/** イベントを選ぶ小窓を開いている列の、未選択の数（段7の (19)。▼の点に使う）。 */
		function unselectedCountOf(res, memberKey) {
			return res.events.filter(e => e.memberKey === memberKey && e.pending).length;
		}

		function render() {
			const res = computed();
			const saved = listRosters();
			const ptView = computePtView(res);

			let h = '<div class="usd-roster">';

			/* ── 上位層: 編成のタブと名前 ── */
			h += '<div class="usd-roster-top">';
			const full = saved.length >= ROSTER_LIMIT;
			// 編成のタブ（段7の (5)）。1行の横スクロール。選んだタブは見える位置まで送る（revealSelectedTab）。
			// 上限に達したら「＋新規」は薄く押せない見た目（押すと知らせを出す）
			// 段7b の ①：名前の入力欄・✓・× の行は無くした。選んでいるタブの名前の右に ✎ と ×、編集中はそのタブが 入力欄・✓・↩ に変わる
			// （共有の部品 namedTabsHtml。②因子周回のタブも同じもの）
			if (!setBased) {   // 段8: セットの名前・切り替えは共通の見出しの帯（special）。編成のタブは出さない
			h += '<div class="usd-roster-tabs" data-usd-el="roster-tabs-wrap">';
			h += namedTabsHtml(
				[{ id: '', label: '＋新規', isNew: true, selected: !selectedId, title: full ? '編成は' + ROSTER_LIMIT + '件までです' : '新しい編成（未保存）',
					className: 'usd-roster-tab' + (full && selectedId ? ' usd-roster-tab--full' : '') }].concat(
					saved.map(r => ({ id: r.rosterId, label: r.name || '（名称未設定）', title: r.name || '（名称未設定）', selected: r.rosterId === selectedId, className: 'usd-roster-tab' }))),
				{ act: 'select-roster', ariaLabel: '保存した編成', el: 'roster-tabs', noun: '編成', edit: nameEdit, placeholder: '編成の名前' });
			h += '</div>';
			if (limitNotice) {
				h += '<p class="usd-roster-warn" data-usd-el="limit-notice">編成は' + ROSTER_LIMIT + '件までです。新しい編成を作るには、いまの編成を削除してください（名前の横の×）。</p>';
			}
			}   // !setBased
			// イベントスキルの未確認は、αテスト中の明示として編成の層に赤字で**1行だけ**出す
			if (res.unconfirmed.length > 0) {
				const cardCount = new Set(res.unconfirmed.map(u => u.cardId)).size;
				h += '<div class="usd-roster-row">';
				h += '<p class="usd-roster-alert">αテスト中：イベントスキル未収録（' + cardCount + '種）</p>';
				h += '<button type="button" class="uma-disclose" data-usd-act="toggle-unconf" aria-expanded="'
					+ (showUnconf ? 'true' : 'false') + '">' + (showUnconf ? '対象のカードを閉じる' : '対象のカードを見る') + '</button>';
				h += '</div>';
				if (showUnconf) {
					h += '<ul class="usd-roster-unconf usd-roster-unconf--alert">' + res.unconfirmed.map(u =>
						'<li>' + esc(u.label) + ' の' + esc(u.what) + '</li>').join('') + '</ul>';
				}
			}
			if (res.missing.length > 0) {
				h += '<p class="usd-roster-alert">読み込めないものがあります（収録データが変わった可能性があります）: '
					+ esc(res.missing.map(m => m.id).join(' / ')) + '</p>';
			}
			h += '</div>';

			/* ── 合計の1行（段8・C で、育成ウマ娘とカードのパネルの上へ移した）。読み込み中は何も出さず、読めなかったときだけ知らせる ── */
			if (res.items.length > 0) {
				if (ptView) h += ptSummaryHtml(ptView, res);
				else if (ptDataStatus() === 'failed') h += '<p class="usd-roster-alert" data-usd-el="pt-error">Pt のデータを読み込めませんでした</p>';
			}

			/* ── 下位層: 育成ウマ娘 と サポートカード ── */
			h += '<div class="usd-roster-lower">';
			// 育成ウマ娘（段7b の ③⑦⑧）: パネル名の行（名前＋（i））は無し。（i）は選択欄の右隣。選んだ状態は白文字・黒背景。
			// 名前の前に ◇ のバッジ（表の列見出し・凡例と同じ部品）。名前は省略記号で切り、全文は title と aria-label
			const umaChip = '<span class="usd-roster-umamark" role="img" aria-label="育成ウマ娘"></span>';
			// カードの番号のバッジ（表の列見出し・凡例と同じ角丸の四角。カードの種類の色）
			const cardBadge = (no, typeOrder) => {
				const typed = typeOrder !== null && typeOrder !== undefined;
				return '<span class="usd-roster-legend-no' + (typed ? ' usd-roster-typed' : '') + '"' + (typed ? ' data-type-order="' + typeOrder + '" style="' + cardTypeColorVars(typeOrder) + '"' : '') + ' data-usd-el="badge">' + no + '</span>';
			};
			h += '<div class="usd-roster-sub"><div class="usd-roster-umarow">';
			h += '<div class="usd-roster-pickbox usd-roster-umabox' + (roster.umaId ? ' usd-roster-pickbox--filled' : '') + '">';
			h += '<button type="button" class="usd-roster-pickbtn" data-usd-act="pick-uma" data-usd-el="pick-uma" title="' + esc(labelOfUma()) + '" aria-label="' + esc('育成ウマ娘：' + labelOfUma()) + '">'
				+ umaChip + '<span class="usd-roster-pickname">' + esc(labelOfUma()) + '</span></button>';
			if (roster.umaId) h += '<button type="button" class="usd-roster-clearbtn" data-usd-act="clear-uma" aria-label="育成ウマ娘を外す" title="外す">×</button>';
			h += '</div>';
			h += '<button type="button" class="uma-help-btn usd-info-btn usd-roster-umainfo" data-usd-act="uma-info" data-usd-el="uma-info-btn" aria-expanded="false" aria-label="育成ウマ娘の扱いの説明を開く" title="育成ウマ娘の扱いの説明を開く"></button>';
			h += '</div>';
			h += '</div>';

			// サポートカード（段7の (9)(10)・段7b の ⑧）: 見出しは無し。各パネルは小さく、375px で3列×2行。× は中の右端。名前の前に番号のバッジ
			h += '<div class="usd-roster-sub"><div class="usd-roster-slots" data-usd-el="card-slots">';
			for (let i = 0; i < ROSTER_CARD_SLOTS; i++) {
				const colorAttrs = cardSlotColorAttrs(i);
				const filled = !!roster.cardIds[i];
				const fullLabel = fullLabelOfCard(i);
				const cardId = roster.cardIds[i];
				const slotCard = cardId ? findCard(cardId) : null;
				const slotOrder = slotCard ? cardTypeOrderOf(slotCard) : null;
				h += '<div class="usd-roster-pickbox usd-roster-slot' + (filled ? ' usd-roster-pickbox--filled' : '') + (colorAttrs ? ' usd-roster-card--typed' : '') + '"' + colorAttrs + '>'
					+ '<button type="button" class="usd-roster-pickbtn" data-usd-act="pick-card" data-index="' + i + '" title="' + esc(fullLabel) + '" aria-label="' + esc((i + 1) + '枚目：' + fullLabel) + '">'
					+ cardBadge(i + 1, slotOrder) + '<span class="usd-roster-pickname">' + esc(labelOfCard(i)) + '</span></button>'
					+ (filled ? '<button type="button" class="usd-roster-clearbtn" data-usd-act="clear-card" data-index="' + i + '" aria-label="' + esc((i + 1) + '枚目を外す') + '" title="外す">×</button>' : '')
					+ '</div>';
			}
			h += '</div></div>';
			h += '</div>';

			/* ── 得られるスキルの表 ── */
			const colClass = (m) => m.kind === 'uma' ? ' usd-roster-gc--uma' : m.kind === 'scenario' ? '' : (m.no % 2 === 0 ? ' usd-roster-gc--alt' : '');
			const colStyle = (m) => (m.kind === 'card' && m.typeOrder !== null && m.typeOrder !== undefined)
				? ' data-type-order="' + m.typeOrder + '" style="' + cardTypeColorVars(m.typeOrder) + '"' : '';
			const colTypedClass = (m) => (m.kind === 'card' && m.typeOrder !== null && m.typeOrder !== undefined) ? ' usd-roster-typed' : '';
			const colName = (m) => m.kind === 'scenario' ? esc(m.label) : (m.kind === 'uma' ? '育成ウマ娘' : String(m.no)) + (m.label ? '：' + esc(m.label) : '（空き）');
			// 並べ替えのボタンの絵（段7b の ⑧）: 漏斗。押していない＝輪郭、押している＝塗りつぶし（インラインの SVG。色は currentColor）
			const funnelSvg = '<svg class="usd-roster-funnel" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2 2.5h12L9.8 8v4.7L6.2 14.5V8z"/></svg>';
			// 列見出し（段7b の ⑧⑨）: 2行。上＝バッジ／！、下＝漏斗（並べ替え）。「▼」は廃止。
			// 選ぶ必要のあるイベント（選択肢が2つ以上あり、どれかの成功側にスキルがあるもの）があるカードは、番号のバッジ自体が押せるボタン
			// （未選択が1件でもあるあいだは「！」。すべて選ぶ（自動を含む）と番号のバッジに変わり、押すと小窓にもう一度入れる）。
			// ◇（育成ウマ娘）と、選ぶ必要のあるイベントが無いカードの番号は、ボタンにしない
			const colHead = (m) => {
				let s = '<div class="usd-roster-ghbtns">';
				const evs = ((m.kind === 'card' && m.label) || m.kind === 'scenario') ? res.events.filter(e => e.memberKey === m.key) : [];
				const typedAttrs = (m.typeOrder !== null && m.typeOrder !== undefined) ? ' usd-roster-typed" data-type-order="' + m.typeOrder + '" style="' + cardTypeColorVars(m.typeOrder) : '';
				if (evs.length > 0) {
					const unsel = evs.filter(e => e.pending).length;
					const label = (m.kind === 'scenario' ? m.label : m.no + '番のカード') + 'のイベントを選ぶ' + (unsel > 0 ? '（未選択' + unsel + '件）' : '');
					s += '<button type="button" class="usd-roster-legend-no usd-roster-evbtn' + (m.kind === 'scenario' ? ' usd-roster-evbtn--scen' : '') + (unsel > 0 ? ' usd-roster-evbtn--alert' : typedAttrs) + '"'
						+ ' data-usd-act="events" data-member-key="' + m.key + '" data-usd-el="events-btn" data-unselected="' + unsel + '"'
						+ ' aria-label="' + esc(label) + '" title="' + esc(label) + '" aria-expanded="' + (eventsFor === m.key ? 'true' : 'false') + '">'
						+ (unsel > 0 ? '!' : (m.kind === 'scenario' ? bowlSvg : String(m.no))) + '</button>';
				} else if (m.kind === 'uma') {
					s += umaChip;
				} else if (m.kind === 'scenario') {
					s += '<span class="usd-roster-legend-no usd-roster-scenmark" role="img" aria-label="' + esc(m.label) + '">' + bowlSvg + '</span>';
				} else {
					s += cardBadge(m.no, m.typeOrder);
				}
				s += '<button type="button" class="usd-roster-ghbtn" data-usd-act="sort" data-member-key="' + m.key + '" data-usd-el="sort-btn"'
					+ ' aria-pressed="' + (sortKey === m.key ? 'true' : 'false') + '"'
					+ ' aria-label="' + esc((m.kind === 'uma' ? '育成ウマ娘' : m.kind === 'scenario' ? m.label : m.no + '枚目') + 'が得るスキルを上に寄せる') + '" title="並べ替え">' + funnelSvg + '</button>';
				s += '</div>';
				s += (m.shortLabel ? '<span class="usd-roster-gh-name">' + esc(m.shortLabel) + '</span>' : '');
				return s;
			};
			h += '<div class="usd-roster-sec">';
			if (res.items.length === 0) {
				h += '<p class="usd-roster-note">育成ウマ娘とサポートカードを選ぶと、ここに出ます。</p>';
			} else {
				const members = res.members;
				// 前段の1行（「ヒントLv0：…」。段8・C でパネルの下へ）
				if (ptView) h += ptSubHtml(ptView);
				// 絞り込み（段7の (17)）: 距離・脚質・バ場。選択肢は TAG_AXES から
				const sel = resolvedFilter();
				h += '<div class="usd-roster-filterrow" data-usd-el="filter-row">';
				filterAxes().forEach(axis => {
					// 段7b の ④：ラベルの行は無し。「指定なし」は「距離指定なし」のように軸の名前を含める
					h += '<label class="usd-roster-filter">'
						+ '<select class="uma-input usd-roster-filtersel' + (sel[axis.key] ? ' usd-roster-filtersel--on' : '') + '" data-usd-act="filter" data-axis="' + esc(axis.key) + '" aria-label="' + esc(axis.label + 'で絞り込む') + '">'
						+ '<option value=""' + (sel[axis.key] ? '' : ' selected') + '>' + esc(axis.label + '指定なし') + '</option>'
						+ pickableOptions(axis).map(o => '<option value="' + esc(o.v) + '"' + (sel[axis.key] === o.v ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('')
						+ '</select></label>';
				});
				h += '</div>';
				// 「絞り込み中」の印は段7c（L）で削除した（条件は（?）の小窓に残る）。セレクトの行の高さは絞り込みで変わらない
				// 並べ替え（段7の (16)）: 押した列のメンバーが得るスキルを上へ（安定ソート）
				// 並び（段7e の (1)）: 金スキルと、その直前の白スキルが同じ表にあるときは、金スキルの直下に前段の白を置く（単位として動かす）。
				// 並べ替えも単位ごと: 組のどちらかにその列の○があれば組ごと上へ寄せる（安定ソート）
				let units = arrangeStepUnits(res.visibleItems);
				if (sortKey !== null && members.some(m => m.key === sortKey)) {
					const hit = (u) => u.some(it => it.members.indexOf(sortKey) !== -1);
					units = units.filter(hit).concat(units.filter(u => !hit(u)));
				}
				const prevRowIds = new Set();
				units.forEach(u => u.slice(1).forEach(it => prevRowIds.add(it.skillId)));
				const rows = [].concat.apply([], units);
				h += '<div class="usd-roster-grid-wrap"><div class="usd-roster-grid" role="table" aria-label="本育成で得られるスキル"'
					+ ' style="--usd-roster-cols:' + members.length + '">';
				h += '<div class="usd-roster-grow" role="row">'
					+ '<div class="usd-roster-gc usd-roster-gc--name usd-roster-gh" role="columnheader">スキル名</div>'
					+ members.map(m => '<div class="usd-roster-gc usd-roster-gh' + colClass(m) + colTypedClass(m)
						+ (m.label ? '' : ' usd-roster-gh--empty') + '"'
						+ ' role="columnheader" aria-label="' + colName(m) + '"' + colStyle(m) + '>' + colHead(m) + '</div>').join('')
					+ '</div>';
				if (rows.length === 0) {
					h += '<div class="usd-roster-grow" role="row"><div class="usd-roster-gc usd-roster-gc--name usd-roster-gc--none" role="cell" data-usd-el="rows-none">絞り込みに当たるスキルがありません</div>'
						+ members.map(m => '<div class="usd-roster-gc' + colClass(m) + '" role="cell"></div>').join('') + '</div>';
				}
				rows.forEach((it) => {
					const isOff = it.sure && res.offIds.has(it.skillId);
					const x = ptView ? ptView.byId.get(it.skillId) : null;
					const rarity = x ? x.rarity : (skillPtData.skillPt instanceof Map && skillPtData.skillPt.get(it.skillId) ? skillPtData.skillPt.get(it.skillId).rarity : null);
					// ●の行の名前セルの左に、取得するかどうかの小さなチェック（段7c の M。既定はオン。△の行には付けない）
					const takeBox = it.sure
						? '<label class="usd-roster-take"><input type="checkbox" data-usd-act="take-skill" data-skill-id="' + esc(it.skillId) + '"'
							+ (isOff ? '' : ' checked') + ' aria-label="' + esc(it.name + 'を取得する') + '" /></label>'
						: '';
					// 色分け（段7e の (2)〜(5)）。取得しない（オフ）の行は今までの見た目のまま（地も文字も薄い色）
					const tone = rowToneOf(it.skillId);
					const nameTone = isOff ? '' : tone.heal ? ' usd-roster-skillname--heal' : tone.debuff ? ' usd-roster-skillname--debuff' : tone.passive ? ' usd-roster-skillname--passive' : '';
					h += '<div class="usd-roster-grow' + (rarity === 'gold' ? ' usd-roster-grow--gold' : '') + (rarity === 'unique' ? ' usd-roster-grow--unique' : '') + (tone.heal ? ' usd-roster-grow--heal' : '')
						+ (prevRowIds.has(it.skillId) ? ' usd-roster-grow--prev' : '') + (isOff ? ' usd-roster-grow--off' : '') + '" role="row" data-skill-id="' + esc(it.skillId) + '"' + (isOff ? ' data-usd-off="1"' : '') + '>'
						+ '<div class="usd-roster-gc usd-roster-gc--name" role="rowheader">' + takeBox + '<div class="usd-roster-namescroll usd-hscroll" data-usd-no-trim="1">'
							+ (prevRowIds.has(it.skillId) ? '<span class="usd-roster-prevmark" aria-hidden="true" data-usd-el="prev-mark">└</span>' : '')
							+ '<button type="button" class="usd-roster-skillname usd-roster-skillname--btn' + (isOff ? ' usd-roster-skillname--off' : '') + nameTone + '" data-usd-info="' + esc(it.skillId) + '">' + esc(it.name) + '</button>'
							+ ptCellHtml(ptView, it, isOff) + '</div></div>'
						+ members.map(m => '<div class="usd-roster-gc' + colClass(m) + '" role="cell">'
							+ (it.sureMembers.indexOf(m.key) !== -1 ? '<span class="usd-roster-got" role="img" aria-label="得られる"></span>'
								: it.members.indexOf(m.key) !== -1
									? '<span class="usd-roster-maybe" role="img" aria-label="選択肢しだいで得られる"></span>'
									: '')
							+ '</div>').join('')
						+ '</div>';
				});
				h += '</div></div>';
				// 表の最下段の凡例（育成ウマ娘・カード名の一覧）は段7c（L）で削除した（デスクトップでも出さない）
			}
			h += '</div>';
			h += '</div>';

			// 表の中のスクロール位置を描き直しても保つ（段7c の M。チェックを押したとき、表の途中の行が先頭へ戻って見えなくなるため）。
			// 並べ替え・絞り込みのときだけ先頭へ戻す（行の顔ぶれ・並びが変わるので、先頭から見せる）
			const oldWrap = container.querySelector('.usd-roster-grid-wrap');
			const keepGrid = oldWrap && !gridScrollReset ? { top: oldWrap.scrollTop, left: oldWrap.scrollLeft } : null;
			gridScrollReset = false;
			container.innerHTML = h;
			if (keepGrid) {
				const nw = container.querySelector('.usd-roster-grid-wrap');
				if (nw) { nw.scrollTop = keepGrid.top; nw.scrollLeft = keepGrid.left; }
			}
			// 名前を押すと説明の小窓（段7の (14)。ⓘ と長押しはやめた）。「いまの設定」の1行と系列の注記は開く直前に求める
			attachSkillInfoIn(container, (id) => ({ skillId: id, trigger: 'self', getLine: () => infoLineFor(id), getNote: () => shareNoteOf(id, computed()) }));
			const host = ensureModalHost();
			host.innerHTML = searchHtml();
			refreshIcons();
			// 編成のタブ（(5)）: 入口の並びと同じ仕組み（幅を実測して切り詰め・続きがある側に薄いフェード）を、帯のタブに当てる
			const strip = q(container, 'roster-tabs');
			if (strip) strip.classList.add('usd-hscroll');
			revealSelectedTab(container, true);
			scanEntryRows();
			if (picking) {
				const input = q(host, 'find');
				if (input) { focusNoScroll(input); input.setSelectionRange(input.value.length, input.value.length); }
			}
			if (nameEdit) {
				const input = q(container, 'name');
				if (input && global.document.activeElement !== input) { focusNoScroll(input); input.setSelectionRange(input.value.length, input.value.length); }
			}
			// イベントを選ぶ小窓が開いていれば、中身を作り直す（選んだ結果をその場で映す）
			if (eventsFor !== null) refreshEventsPopover(res);
			fitGrid();
			notifySureCount(res);
			// 本育成のぶんが変わったことを、②へ知らせる（段5・段7）
			emitRosterPtChange();
		}

		/* ------------------------------------------------------------
		 * イベントを選ぶ小窓（段7の (19)）。列見出しの▼で開く。そのカードの、選択肢が2つ以上あるイベントと、
		 * 同じキャラクターの共通イベントを並べ、選択肢を1つ選べる（もう一度押すと未選択）。既定（絞り込み後に
		 * 残るスキルを成功側に持つ選択肢が1つだけ）は「自動」と添える。保存するのは利用者が選んだものだけ（roster.eventChoices）。
		 * ------------------------------------------------------------ */
		/** 列見出しの data-member-key の値をメンバーのキーに戻す（育成ウマ娘・カードは数、シナリオは 'scenario'）。 */
		function memberKeyOf(attr) { return attr === SCENARIO_KEY ? SCENARIO_KEY : Number(attr); }
		/** ラーメンのどんぶり（シナリオ『トレセン軒』の列のアイコン。インラインの SVG・色は currentColor） */
		const bowlSvg = '<svg class="usd-roster-bowl" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">'
			+ '<path d="M1.8 7.2h12.4a6.2 6.2 0 0 1-12.4 0z"/><path d="M5.5 14.6h5"/><path d="M5.2 4.6c0-1 1-1.3 1-2.3M8.2 4.6c0-1 1-1.3 1-2.3M11 5c.3-.7 1-1 1-1.8"/></svg>';
		function eventTitle(e) {
			if (e.kind === 'scenarioEvent') return (e.name || '') + (e.when ? '（' + e.when + '）' : '');
			if (e.kind === 'commonEvent') return '共通イベント' + (isNonNegInt(e.step) ? ' ' + e.step + '回目' : ' ' + (e.index + 1));
			return isNonNegInt(e.step) ? e.step + '回目' : (e.index + 1) + 'つ目';
		}
		let eventsPane = 0;          // 狭い幅の小窓で見せているペイン（0＝イベント、1＝取得できるスキル。段7b の ⑩。保存しない）
		/** 取得できるスキルの1件（3行：スキル名／基礎Pt／公式の説明文）。絞り込みで外れるものは灰色、未選択のイベントしだいのものは薄く「未選択」の印 */
		function eventSkillRowEl(it, maybe, dim) {
			const li = infoEl('li', 'usd-ev-skill' + (maybe ? ' usd-ev-skill--maybe' : '') + (dim ? ' usd-ev-skill--dim' : ''));
			li.setAttribute('data-usd-el', 'ev-skill');
			li.setAttribute('data-skill-id', it.skillId);
			if (maybe) li.setAttribute('data-usd-maybe', '1');
			if (dim) li.setAttribute('data-usd-dim', '1');
			const name = infoEl('p', 'usd-ev-skill-name', getSkillName(it.skillId));
			if (maybe) {
				const tag = infoEl('span', 'usd-ev-tag', '未選択');
				tag.setAttribute('data-usd-el', 'ev-skill-tag');
				name.appendChild(tag);
			}
			li.appendChild(name);
			const ptText = basePtText(it.skillId);
			if (ptText) {
				const pt = infoEl('p', 'usd-ev-skill-pt', ptText);
				pt.setAttribute('data-usd-el', 'ev-skill-pt');
				li.appendChild(pt);
			}
			// 公式の説明文（1行。横に送ると全文が見られる。スクロールバーは出さず、続きがある側に薄いフェード）
			const desc = infoEl('div', 'usd-ev-skill-desc usd-hscroll', '');
			desc.setAttribute('data-usd-el', 'ev-skill-desc');
			desc.setAttribute('data-usd-no-trim', '1');
			desc.setAttribute('data-skill-id', it.skillId);
			li.appendChild(desc);
			settleSkillInfoDesc(it.skillId, desc);
			return li;
		}
		function fillEventsInfo(body, res, memberKey) {
			const wanted = filterPredicate();
			const list = res.events.filter(e => e.memberKey === memberKey);
			const unsel = list.filter(e => e.pending).length;
			const panes = infoEl('div', 'usd-ev-panes');
			panes.setAttribute('data-usd-el', 'events-panes');
			const left = infoEl('section', 'usd-ev-pane usd-ev-pane--events');
			left.setAttribute('data-usd-el', 'events-pane-events');
			const right = infoEl('section', 'usd-ev-pane usd-ev-pane--skills');
			right.setAttribute('data-usd-el', 'events-pane-skills');
			panes.appendChild(left);
			panes.appendChild(right);
			body.appendChild(panes);
			// ── 左：今のイベントの一覧（回の見出し・選択肢のボタン・自動の印） ──
			const head = infoEl('p', 'usd-roster-note', '未選択' + unsel + '件');
			head.setAttribute('data-usd-el', 'events-unselected');
			left.appendChild(head);
			if (list.length === 0) {
				const p = infoEl('p', 'usd-info-desc--pending', '選ぶイベントはありません');
				p.setAttribute('data-usd-el', 'events-none');
				left.appendChild(p);
			}
			const addChoiceEvent = (e) => {
				const box = infoEl('div', 'usd-roster-event');
				box.setAttribute('data-usd-el', 'event');
				box.setAttribute('data-event-key', e.eventKey);
				const t = infoEl('p', 'usd-roster-eventtitle', eventTitle(e));
				if (e.chosen !== null && e.auto) {
					const tag = infoEl('span', 'usd-roster-autotag', '自動');
					tag.setAttribute('data-usd-el', 'event-auto');
					t.appendChild(global.document.createTextNode(' '));
					t.appendChild(tag);
				}
				box.appendChild(t);
				const group = infoEl('div', 'usd-roster-choices');
				group.setAttribute('role', 'radiogroup');
				group.setAttribute('aria-label', eventTitle(e) + 'の選択肢');
				e.choices.forEach(c => {
					const on = e.chosen === c.index;
					const btn = infoEl('button', 'usd-roster-choice' + (on ? ' usd-roster-choice--on' : ''));
					btn.type = 'button';
					btn.setAttribute('role', 'radio');
					btn.setAttribute('aria-checked', on ? 'true' : 'false');
					btn.setAttribute('data-usd-el', 'event-choice');
					btn.setAttribute('data-event-key', e.eventKey);
					btn.setAttribute('data-choice', String(c.index));
					const lab = infoEl('span', 'usd-roster-choicelabel', c.label || ('選択肢' + (c.index + 1)));
					btn.appendChild(lab);
					// シナリオのイベント（段7c の N）: 編成にいるキャラクターのときの選択肢か、いないときのものかを添える
					if (c.state) {
						const st = infoEl('span', 'usd-roster-choicestate', c.state === 'linked' ? '編成時' : '非編成時');
						st.setAttribute('data-usd-el', 'event-choice-state');
						btn.appendChild(st);
					}
					const ul = infoEl('span', 'usd-roster-choiceskills');
					if (c.skills.length === 0) ul.appendChild(infoEl('span', 'usd-roster-choiceskill usd-roster-choiceskill--none', 'スキルなし'));
					c.skills.forEach(s => {
						const dim = wanted && !wanted(s.skillId);
						const sp = infoEl('span', 'usd-roster-choiceskill' + (dim ? ' usd-roster-choiceskill--dim' : ''),
							getSkillName(s.skillId) + (isNonNegInt(s.hintLevel) ? ' Lv' + s.hintLevel : ''));
						if (dim) sp.setAttribute('data-usd-dim', '1');
						ul.appendChild(sp);
					});
					btn.appendChild(ul);
					btn.addEventListener('click', () => toggleEventChoice(e.eventKey, c.index, e.chosen === c.index && !e.auto ? null : c.index, e));
					group.appendChild(btn);
				});
				box.appendChild(group);
				left.appendChild(box);
			};
			// 確定のイベント（選択肢なし。シナリオの固定イベント）: 得るスキルとヒントレベルを並べるだけ
			const addFixedEvent = (fe) => {
				const box = infoEl('div', 'usd-roster-event');
				box.setAttribute('data-usd-el', 'event-fixed');
				const t = infoEl('p', 'usd-roster-eventtitle', fe.name + (fe.when ? '（' + fe.when + '）' : ''));
				const tag = infoEl('span', 'usd-roster-autotag', '確定');
				tag.setAttribute('data-usd-el', 'event-fixed-tag');
				t.appendChild(global.document.createTextNode(' '));
				t.appendChild(tag);
				box.appendChild(t);
				const ul = infoEl('div', 'usd-roster-choiceskills');
				fe.skills.filter(x => findSkill(x.skillId)).forEach(x => {
					const sp = infoEl('span', 'usd-roster-choiceskill', getSkillName(x.skillId) + (isNonNegInt(x.hintLevel) ? ' Lv' + x.hintLevel : ''));
					sp.setAttribute('data-usd-el', 'event-fixed-skill');
					ul.appendChild(sp);
				});
				box.appendChild(ul);
				left.appendChild(box);
			};
			if (memberKey === SCENARIO_KEY && res.scenario) {
				// シナリオは、データの並び（イベント1・2・3…）のまま。選択式は選択肢のボタン、確定は一覧
				res.scenario.events.forEach(se => {
					if (se.type === 'fixed') { addFixedEvent(se); return; }
					const ce = list.find(x => x.eventKey === se.eventKey);
					if (ce) addChoiceEvent(ce);
				});
			} else {
				list.forEach(addChoiceEvent);
			}
			// ── 右：取得できるスキル。いまの選択（自動を含む）で得るもの（●）を先に、未選択のイベントしだいのもの（△）を薄く「未選択」の印つきで後ろに。
			//    絞り込みで外れるスキルは灰色で残す。選択を変えるたびに描き直す ──
			const h3 = infoEl('p', 'usd-ev-skills-title', '取得できるスキル');
			h3.setAttribute('data-usd-el', 'ev-skills-title');
			right.appendChild(h3);
			const mine = res.items.filter(it => it.members.indexOf(memberKey) !== -1);
			const sure = mine.filter(it => it.sureMembers.indexOf(memberKey) !== -1);
			const maybe = mine.filter(it => it.sureMembers.indexOf(memberKey) === -1);
			if (mine.length === 0) {
				right.appendChild(infoEl('p', 'usd-info-desc--pending', '取得できるスキルはありません'));
			} else {
				const ul = infoEl('ul', 'usd-ev-skilllist');
				ul.setAttribute('data-usd-el', 'ev-skills');
				sure.forEach(it => ul.appendChild(eventSkillRowEl(it, false, !!wanted && !wanted(it.skillId))));
				maybe.forEach(it => ul.appendChild(eventSkillRowEl(it, true, !!wanted && !wanted(it.skillId))));
				right.appendChild(ul);
			}
			// ── 狭い幅では、2つのペインを横に並べて scroll-snap でスワイプ。見出しの右の切り替えのボタンでも行き来できる ──
			const ui = skillInfoUi;
			const sw = infoEl('button', 'usd-ev-switch');
			sw.type = 'button';
			sw.setAttribute('data-usd-el', 'events-switch');
			const syncSwitch = () => {
				sw.textContent = eventsPane === 0 ? 'スキル ›' : '‹ イベント';
				sw.setAttribute('aria-label', eventsPane === 0 ? '取得できるスキルを見る' : 'イベントの選択に戻る');
			};
			syncSwitch();
			sw.addEventListener('click', () => {
				eventsPane = eventsPane === 0 ? 1 : 0;
				syncSwitch();
				try { panes.scrollTo({ left: eventsPane * panes.clientWidth, behavior: 'smooth' }); } catch (e) { panes.scrollLeft = eventsPane * panes.clientWidth; }
			});
			panes.addEventListener('scroll', () => {
				const n = panes.scrollLeft > panes.clientWidth / 2 ? 1 : 0;
				if (n !== eventsPane) { eventsPane = n; syncSwitch(); }
			}, { passive: true });
			if (ui && ui.head) ui.head.insertBefore(sw, ui.closeBtn);
			// 公式の説明文は、小窓を開いたときに1回だけ読む（読めなければ「説明文は準備中です」）。読み終えたら、まだ同じ小窓なら各行を整える
			const token = skillInfoToken;
			if (skillDescState.status !== 'ok') {
				loadSkillDescriptions().then(() => {
					if (!skillInfoCur || skillInfoCur.token !== token) return;
					right.querySelectorAll('[data-usd-el="ev-skill-desc"]').forEach(d => settleSkillInfoDesc(d.getAttribute('data-skill-id'), d));
					scanEntryRows();
				});
			}
			return panes;
		}
		/** 選択肢を押したとき。選んでいたものをもう一度押すと未選択。自動で選ばれていたものを押すと、その選択を保存する */
		function toggleEventChoice(eventKey, index, next, e) {
			const cur = (roster.eventChoices && typeof roster.eventChoices === 'object') ? Object.assign({}, roster.eventChoices) : {};
			if (next === null) delete cur[eventKey]; else cur[eventKey] = next;
			if (Object.keys(cur).length === 0) delete roster.eventChoices; else roster.eventChoices = cur;
			persistNow();
			render();
		}
		function eventsTitleHtml(m) {
			if (m.kind === 'scenario') return '<span class="usd-roster-legend-no usd-roster-scenmark" aria-hidden="true">' + bowlSvg + '</span> <span class="usd-ev-title-text">' + esc(m.label || '') + '</span>';
			const typed = m.typeOrder !== null && m.typeOrder !== undefined;
			return '<span class="usd-roster-legend-no' + (typed ? ' usd-roster-typed' : '') + '"' + (typed ? ' data-type-order="' + m.typeOrder + '" style="' + cardTypeColorVars(m.typeOrder) + '"' : '') + '>' + m.no + '</span>'
				+ ' <span class="usd-ev-title-text">' + esc(m.label || '') + '</span>';
		}
		function openEventsPopover(memberKey) {
			const res = computed();
			const m = res.members.find(x => x.key === memberKey);
			if (!m) return;
			eventsFor = memberKey;
			eventsPane = 0;
			const btn = container.querySelector('[data-usd-act="events"][data-member-key="' + memberKey + '"]');
			openPopover({
				key: 'events:' + uidBase + ':' + memberKey, title: (m.label || ''), titleHtml: eventsTitleHtml(m), wide: true,
				build: (body) => { fillEventsInfo(body, res, memberKey); },
				btn: btn, opener: btn, refocus: '[data-usd-act="events"][data-member-key="' + memberKey + '"]',
				onClose: () => { eventsFor = null; const b = container.querySelector('[data-usd-act="events"][data-member-key="' + memberKey + '"]'); if (b) b.setAttribute('aria-expanded', 'false'); }
			});
			scanEntryRows();
			restoreEventsPane();
		}
		/** 狭い幅で2つ目のペインを見ていたら、描き直したあともそのペインに合わせる */
		function restoreEventsPane() {
			const panes = skillInfoUi && skillInfoUi.body.querySelector('[data-usd-el="events-panes"]');
			if (panes && eventsPane === 1 && panes.scrollWidth > panes.clientWidth + 1) panes.scrollLeft = panes.clientWidth;
		}
		/** 選択を変えたとき、開いたままの小窓の中身を描き直す。小窓の中のスクロール位置（縦・横）は変えない（段7b の ⑥） */
		function refreshEventsPopover(res) {
			if (eventsFor === null || !skillInfoCur || skillInfoCur.key !== 'events:' + uidBase + ':' + eventsFor) { eventsFor = null; return; }
			const btn = container.querySelector('[data-usd-act="events"][data-member-key="' + eventsFor + '"]');
			if (btn) btn.setAttribute('aria-expanded', 'true');
			skillInfoCur.btn = btn;
			skillInfoCur.opener = btn;
			const body = skillInfoUi.body;
			const wrap = body.parentElement;
			const keep = {
				wrap: wrap ? wrap.scrollTop : 0,
				left: (body.querySelector('[data-usd-el="events-pane-events"]') || {}).scrollTop || 0,
				right: (body.querySelector('[data-usd-el="events-pane-skills"]') || {}).scrollTop || 0
			};
			const oldSwitch = skillInfoUi.head.querySelector('.usd-ev-switch');
			if (oldSwitch) oldSwitch.parentNode.removeChild(oldSwitch);
			body.textContent = '';
			fillEventsInfo(body, res, eventsFor);
			scanEntryRows();
			restoreEventsPane();
			if (wrap) wrap.scrollTop = keep.wrap;
			const l = body.querySelector('[data-usd-el="events-pane-events"]');
			const r = body.querySelector('[data-usd-el="events-pane-skills"]');
			if (l) l.scrollTop = keep.left;
			if (r) r.scrollTop = keep.right;
		}

		function loadSelected(id) {
			selectedId = id || '';
			const found = id ? findRoster(id) : null;
			roster = found ? snapshot(found) : restoreDraftRoster();
			roster.cardIds = (roster.cardIds || []).slice(0, ROSTER_CARD_SLOTS);
			while (roster.cardIds.length < ROSTER_CARD_SLOTS) roster.cardIds.push(null);
			picking = null;
			nameEdit = null;
			sortKey = null;
			render();
		}

		/**
		 * × を押したとき（段7b の ①。確認の小窓は共有の openConfirmModal）。
		 * 「＋新規」の × は、育成ウマ娘・カード・設定・絞り込み・イベントの選択を空に戻す。保存済みの編成の × は、その編成を削除する。
		 */
		function askReset() {
			const isDelete = !!selectedId;
			openConfirmModal({
				ariaLabel: '編成のリセット',
				text: isDelete ? '編成をリセットしますか？ この編成は削除され、タブが1つ減ります。' : '編成をリセットしますか？',
				onOk: () => runReset(isDelete)
			});
		}
		function runReset(isDelete) {
			nameEdit = null;
			if (isDelete) {
				if (!selectedId) { render(); return; }
				deleteRoster(selectedId);
				toast('編成を削除しました');
				selectedId = '';
				loadSelected('');
				return;
			}
			roster = emptyRoster();
			persistNow();
			toast('編成をリセットしました');
			render();
		}

		function onPanelClick(ev) {
			const btn = ev.target.closest('[data-usd-act]');
			if (!btn || !(container.contains(btn) || (modalHost && modalHost.contains(btn)))) return;
			const act = btn.getAttribute('data-usd-act');
			if (act === 'name') return;   // 入力欄そのもの（input で受ける）
			// 描き直しで押したボタンが画面の中で動かないようにする（段7b の ⑥）
			const anchor = captureAnchor(btn);
			try { dispatchAct(btn, act); } finally { restoreAnchor(anchor, [container, modalHost]); }
		}

		function dispatchAct(btn, act) {
			// 「編成は10件までです」の知らせは、次の操作で消す
			if (limitNotice && act !== 'select-roster') limitNotice = false;
			if (act === 'pick-uma') { picking = { kind: 'uma' }; pickQuery = ''; pickType = ''; render(); renderHits(); }
			else if (act === 'pick-card') {
				picking = { kind: 'card', index: Number(btn.getAttribute('data-index')) };
				pickQuery = ''; pickType = '';
				render(); renderHits();
			}
			else if (act === 'cancel-pick') { picking = null; render(); }
			else if (act === 'toggle-unconf') { showUnconf = !showUnconf; render(); }
			else if (act === 'uma-info') {
				openPopover({ key: 'uma-info:' + uidBase, title: '育成ウマ娘', build: fillUmaInfo, btn: btn, opener: btn, refocus: '[data-usd-act="uma-info"]' });
			}
			else if (act === 'pt-help') {
				openPopover({ key: 'pt-help:' + uidBase, title: '本育成のスキルPt', build: fillSummaryInfo, btn: btn, opener: btn, refocus: '[data-usd-act="pt-help"]' });
			}
			else if (act === 'pt-status') {
				// 排他の切り替え。押したものが今の値なら「なし」へ戻す
				if (btn.disabled) return;
				const value = btn.getAttribute('data-value');
				const cur = ptView0();
				setPtSetting('status', cur && cur.status === value ? PT_STATUS_DEFAULT : value);
				render();
			}
			else if (act === 'pt-uma') {
				if (btn.disabled) return;
				// 「覚醒ヒントLv5」の入れ替え（押している＝そのレベル、押していない＝既定のレベル）
				const value = Number(btn.getAttribute('data-value'));
				const cur = ptView0();
				if (!cur) return;
				setPtSetting('umaHintLevel', cur.umaHintLevel === value ? skillPtData.rules.umaHintLevelDefault : value);
				render();
			}
			else if (act === 'sort') {
				const key = memberKeyOf(btn.getAttribute('data-member-key'));
				sortKey = sortKey === key ? null : key;
				gridScrollReset = true;
				render();
			}
			else if (act === 'events') {
				const key = memberKeyOf(btn.getAttribute('data-member-key'));
				if (eventsFor === key) { closeSkillInfo(); return; }
				openEventsPopover(key);
			}
			else if (act === 'select-roster') {
				const id = btn.getAttribute('data-tab-id') || '';
				if (!id && !selectedId) return;
				if (!id && listRosters().length >= ROSTER_LIMIT) { limitNotice = true; render(); return; }
				loadSelected(id);
			}
			else if (act === 'type') { pickType = btn.getAttribute('data-value') || ''; render(); renderHits(); }
			else if (act === 'clear-uma') { roster.umaId = ''; persistNow(); render(); }
			else if (act === 'clear-card') { roster.cardIds[Number(btn.getAttribute('data-index'))] = null; persistNow(); render(); }
			else if (act === 'take') {
				const id = btn.getAttribute('data-entry-id');
				if (picking && picking.kind === 'uma') {
					roster.umaId = id;
					syncFixedFields();
				} else if (picking && picking.kind === 'card') {
					roster.cardIds[picking.index] = id;
				}
				picking = null;
				persistNow();
				render();
			}
			else if (act === 'name-edit') {
				// 保存済みの編成は今の名前から、「＋新規」は空から（段7b の ①）
				nameEdit = { value: selectedId ? (roster.name || '') : '' };
				render();
			}
			else if (act === 'name-cancel') { nameEdit = null; render(); }
			else if (act === 'name-commit') { commitName(); }
			else if (act === 'name-reset') { askReset(); }
		}

		/**
		 * ✓（段7の (6)・段7b の ①②）。保存済みなら名前を確定するだけ。
		 * 「＋新規」なら、いまの中身を新しい編成として保存し、そのタブを選ぶ。**「＋新規」の中身は空に戻さない**
		 * （育成ウマ娘・カード・設定・絞り込み・イベントの選択はそのまま残る。空になるのは入力した名前だけ。
		 * 空にするかどうかは、利用者が「＋新規」の × で決める）。保存した編成は別の rosterId を持つ別物。
		 */
		function commitName() {
			const nameEl = q(container, 'name');
			const value = nameEl ? nameEl.value : (nameEdit ? nameEdit.value : '');
			if (selectedId) {
				roster.name = value;
				nameEdit = null;
				syncFixedFields();
				saveRoster(snapshot(roster));
				render();
				return;
			}
			if (!String(value || '').trim()) return;
			syncFixedFields();
			if (draftKey) { roster.name = ''; saveDraftRoster(draftKey, snapshot(roster)); }
			const saved = snapshot(roster);
			saved.rosterId = uid('roster');
			saved.name = value;
			if (saveRoster(saved)) {
				toast('編成を保存しました');
				loadSelected(saved.rosterId);
			}
		}
		container.addEventListener('click', onPanelClick);
		container.addEventListener('keydown', function (ev) {
			const el = ev.target;
			if (el && el.getAttribute && el.getAttribute('data-usd-act') === 'name') {
				// Enter＝確定、Esc＝取り消し（編集中の「＋新規」も同じ）
				if (ev.key === 'Enter') { ev.preventDefault(); commitName(); }
				else if (ev.key === 'Escape' && nameEdit) { ev.preventDefault(); ev.stopPropagation(); nameEdit = null; render(); }
				return;
			}
			if (ev.target && ev.target.closest && ev.target.closest('.uma-subtabs')) { tabStripKeydown(ev, (id) => { if (id || selectedId) loadSelected(id || ''); }); return; }
		});
		container.addEventListener('change', function (ev) {
			const el = ev.target;
			if (el && el.getAttribute && el.getAttribute('data-usd-act') === 'take-skill') {
				// 取得するかどうかの切り替え（段7c の M）。押したチェックが画面の中で動かないようにする（段7b の ⑥ と同じ決まり）
				const anchor = captureAnchor(el);
				const id = el.getAttribute('data-skill-id');
				setSkillTaken(id, el.checked);
				render();
				restoreAnchor(anchor, [container, modalHost]);
				focusNoScroll(container.querySelector('input[data-usd-act="take-skill"][data-skill-id="' + id + '"]'));
				return;
			}
			if (el && el.getAttribute && el.getAttribute('data-usd-act') === 'filter') {
				// 絞り込み中の印などで上の行の高さが変わっても、押したセレクトが画面の中で動かないようにする（段7b の ⑥）
				const anchor = captureAnchor(el);
				gridScrollReset = true;
				setFilter(el.getAttribute('data-axis'), el.value || '');
				render();
				restoreAnchor(anchor, [container, modalHost]);
				focusNoScroll(container.querySelector('select[data-usd-act="filter"][data-axis="' + el.getAttribute('data-axis') + '"]'));
			}
		});

		function onPanelInput(ev) {
			const el = ev.target;
			const act = el.getAttribute && el.getAttribute('data-usd-act');
			if (act === 'find') {
				pickQuery = el.value;
				clearTimeout(findTimer);
				findTimer = setTimeout(function () { renderHits(); }, NAME_FIND_DEBOUNCE_MS);
			} else if (act === 'name') {
				// 確定するまで保存しない（✓ で反映、↩ で取り消し）。再描画せずに覚えるだけ（入力中に描き直すと文字が飛ぶ）
				if (nameEdit) nameEdit.value = el.value;
				// ✓ の押せる／押せない（「＋新規」は空のあいだ押せない）
				const commit = q(container, 'name-commit');
				if (commit) commit.disabled = !selectedId && !el.value.trim();
			}
		}
		container.addEventListener('input', onPanelInput);

		// 周回因子セット（②）へ、本育成のぶんを渡す（段5・段7。special.html の接点は足さず、core の中で受け渡す）。
		// sureIds は絞り込みなしの●（②の「本育成編成」と必要Ptが使う）
		rosterPtSource = {
			getInputs: function () {
				const res = computed();
				const status = ptDataStatus();
				return { status: status, sources: res.visibleSources, enabledIds: [], sureIds: res.takenIds.slice(), offIds: res.offList.slice(),
					settings: status === 'ok' ? resolveRosterPtSettings(roster, skillPtData.rules) : null };
			}
		};
		if (setBased) {
			// ②で選んでいるセットに合わせる（段8）。②が先に作られていれば、いま選んでいるセットを開く
			setHub.listeners.push(function (tid) { if (!container.isConnected) return; loadForSet(tid); });
			if (setHub.inited && setHub.templateId) loadForSet(setHub.templateId); else render();
		} else render();
		// スキルPt の元データがまだ読まれていなければ、読み終わったあとで描き直す（読めなくても描き直す＝知らせを出す）
		if (!skillPtData.meta.loaded) loadSkillPtData(false).then(function () { render(); });
		// シナリオの固定イベント（段7c の N）。編成パネルを作るときにだけ読む。読み終わったら描き直す（読めなければ列を出さない）
		if (scenarioEventState.status === 'idle' || scenarioEventState.status === 'failed') loadScenarioEvents(false).then(function () { render(); });
		return {
			render: render,
			getRoster: function () { return snapshot(roster); },
			getSkillIds: function () { return computed().skillIds.slice(); }
		};
	}

	function createTemplateManager(container, options) {
		injectStyles();
		const opts = options || {};
		const selectable = !!opts.selectable;
		const draftScopeKey = opts.draftScopeKey || null;
		// このセットの呼び名（DEFAULT_SET_LABEL の説明を読むこと）。Deck 単体ページは既定の
		// 「スキルセット」、special の②は「因子セット」。**呼び名を出すところは必ずこれを通す。**
		const setLabel = opts.setLabel || DEFAULT_SET_LABEL;
		// A（スキルセット）を「同じ層に並ぶ選択肢の1つ」として見せるか。**B・C が並ぶ画面（special の②）だけ真。**
		// 真のときは (1) A に見出し「スキルセット」を出し (2) それを枠の左上に接する出っ張りにして
		// (3) A の中身を枠で囲う（段K）。Deck 単体ページは A しか無く、入れ物も「スキルセット」なので、
		// 出すと「スキルセット（0／10件）」の下にもう一度「スキルセット」が出て二重に見える（実機で確認）。
		// **C-69 では `sectionHeadings`（見出しを出すか）だった。** 段K で枠と出っ張りも同じ条件で出る
		// ようになり、名前が実態より狭くなったので改名した（F-59 と同じ考え方。opts の鍵であって
		// 保存データではないので、改名の影響は core・special.html・smoke に閉じる）。
		const sectionGrouping = !!opts.sectionGrouping;
		/**
		 * **A（スキルセット）と同じ行に並べる、ON/OFF だけの節**（C-2a。段K で A の下から同じ行へ移した）。
		 * 中身は呼び出し元が渡す（`opts.screenshotEntry` と同じ手口）。
		 * **core は「何を ON にしているのか」を知らない。**
		 *
		 *   { key, label, names }
		 *     key   … 保存データの鍵。**保存済みのセットが指し続けるので後から変えない。**
		 *     label … 節の呼び名（例「シナリオ因子」）
		 *     names … 「?」で開く一覧に並べる名前の配列。配列か、開くたびに呼ぶ関数。
		 *             **画面にもここにも名前を書かない**ので、呼び出し元がデータから作って渡す
		 *
		 * **種数（`count`）は段K で廃した。** 1行に件数のバッジを出していたが、375px で
		 * 「スキルセット・シナリオ因子・遺伝子」の3つを1行に収めるには、バッジ2つぶんの
		 * 101px が入らなかった（字を小さくしても埋まらない）。種数は「?」の一覧の見出し
		 * （「シナリオ因子（24種）」）が引き続き出している。
		 *
		 * 渡さなければ節は1つも出ない（Deck 単体ページ・card-event-input.html）。
		 */
		const extraScopes = (Array.isArray(opts.extraScopes) ? opts.extraScopes : []).filter(s => s && s.key);
		// 並びの行（A の見出し＋ B・C）を出すか。**どちらか一方でもあれば出す** ――
		// extraScopes だけ渡して sectionGrouping を渡さなかったときに、節が黙って消えないようにする。
		const grouped = sectionGrouping || extraScopes.length > 0;
		// セット（段8・C-120。special だけ）。真のときは、選んでいる因子周回とその本育成編成（①）を1つの「セット」として扱う
		// （①は setHub で選択に従う。②の「本育成編成」の小窓は無く、相手は常に同じセットの①）。Deck 単体ページは渡さない
		const setBased = grouped && !!opts.setMode;
		// 共通の見出しの帯の置き場（段8・B。中身は renderSetBar()）
		const setBarEl = setBased && opts.setBar && opts.setBar.nodeType === 1 ? opts.setBar : null;
		// 「?」で一覧を開いている節（C-2c）。保存しない（開き直すと閉じている）
		let scopeHelpKey = null;

		// 選択中のID。null／DRAFT_SELECTION_ID＝「＋ 新規」（ドラフト＝未保存）、それ以外はテンプレートID。
		// **編集対象＝タブで選んでいるもの**（C-53）。別画面の編集ビューと「開く」は無く、選んだものをその場で編集する。
		let selectedId = null;
		// ドラフト（「＋ 新規」の中身）。draftScopeKey があれば localStorage に残す（今までどおり userData の外）。
		// 無ければメモリだけで持つ（ページを離れると消える）。
		let draftScope = draftScopeKey ? loadDraftScope(draftScopeKey) : { skillIds: [], name: '', updatedAt: '' };
		// 前回の続きがある場合は、そのまま使えるよう最初から選択しておく。
		if (draftScope.skillIds.length > 0) selectedId = DRAFT_SELECTION_ID;
		// 後方互換の別名: いま編集している対象（{ kind: 'draft' } または { kind: 'template', obj }）。render() のたびに引き直す。
		let editing = null;
		// 分類（C-57 の (7)）: いま開いている分類のタブ。既定は「優先」（tiers に無い id が入る分類）
		let currentTier = TIER_DEFAULT;
		// モード（C-57 の (9)）: null（両方 OFF）／'reclass'（再分類）／'delete'（削除）。保存しない（開き直すと OFF）
		let mode = null;
		// 「理論値」の「?」の説明を開いているか（段5。保存しない）
		let ptNeedHelpOpen = false;
		// 名前つきのタブ（段7b の ⑫。special の②だけ）。tabNoun は確認・ボタンの呼び名（special は「因子周回」。無ければ setLabel）
		const tabNoun = opts.tabNoun || setLabel;
		let nameEdit = null;       // 選んでいるタブの名前を編集中なら { value }（確定するまで保存しない）
		let limitNotice = false;   // 「…は10件までです」の知らせを出しているか（次の操作で消える）

		container.innerHTML = '' +
			'<div class="usd-tm">' +
				// 見出しと帯のタブ（保存したスキルセットを選ぶ。先頭は「＋ 新規」＝ドラフト）
				'<div class="uma-subtabs-row" data-usd-el="head"></div>' +
				/* 名前と 保存・リセット・複製・セットを削除（編成パネルと同じ並び。C-53）。
				 *
				 * **73セッション目: 「リセット」を入口の並びからここへ移した。**
				 * あちらは「スキルを足す入口」の並びで、リセットだけが**足すのではなく消す**操作だった。
				 * ここは**セットそのものを扱う行**（保存・複製・セットを削除）なので、
				 * 「このタイトルのセットを作り直す」というリセットの位置づけと揃う。
				 *
				 * **「削除」→「セットを削除」。** 拡張後のリセット（中身を空にする）との差が
				 * 読み取れるようにした。**同じパネルに「削除」が2つあった**
				 * （ここと、下段の「追加済みスキルを消すモード」）ので、その衝突も解消する。
				 * **下段の「削除」（モード）は変えない。** */
				// 段7b の ⑫：special の②（grouped）では、名前の入力欄・「保存」「リセット」「セットを削除」を無くした。
				// 名前・保存・リセット・削除はタブの ✎ ✓ ↩ × に移した（①本育成編成と同じ部品）。残るのは「複製」だけ
				// （新しい流れに当てはまらない操作。保存済みの因子周回を選んだときだけ出す）。
				(grouped ? '' :
				'<div class="usd-roster-row usd-tm-name-row">' +
					'<input type="text" class="usd-input uma-input usd-name-input" data-usd-el="name-input" placeholder="' + esc('新しい' + setLabel + 'の名前') + '"/>' +
					'<button type="button" class="uma-btn uma-btn--primary" data-usd-act="template-save">保存</button>' +
					// **押せるときだけ赤く名乗る**（70セッション目・段1・⑪）。取り消しの効く操作だが、
					// 保存の隣に居るので、他と同じ見た目だと押し間違える。
					// 消すものが1つも無いときは disabled で薄くなる（renderResetBtn）。
					'<button type="button" class="uma-btn uma-btn--danger" data-usd-act="editor-clear-skills" data-usd-el="clear-skills">' +
						'<i data-lucide="minus" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> リセット' +
					'</button>' +
					'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="template-duplicate" data-usd-el="dup-btn">複製</button>' +
					'<button type="button" class="uma-btn uma-btn--ghost" data-usd-act="template-delete" data-usd-el="del-btn">セットを削除</button>' +
				'</div>') +
				// ここから下が **A（スキルセット）** のひとまとまり（C-1）。special の②では、
				// **A と同じ行に B（シナリオ因子）・C（遺伝子）が並ぶ**（C-2a ＋ 段K）。
				// **囲んだだけで `data-usd-el` は1つも変えていない** ので、renderNameRow / renderTabs /
				// renderTierRow / renderSelectedList は無変更（どれも q(container, '…') で引くだけで深さを見ない）。
				// 見出しの呼び名は setLabel を通さない ―― A は special でも「スキルセット」のままで、
				// 入れ物（因子セット）の呼び名とは別（DEFAULT_SET_LABEL の説明を読むこと）。
				//
				// **段K の組み替え**: 「スキルセット」「☑ シナリオ因子 ?」「☑ 遺伝子 ?」を同じ行に並べ、
				// A の中身だけを枠で囲い、「スキルセット」をその枠の左上に接する出っ張りにした。
				// それまでは A → B → C の縦並びで、**セットを切り替えたときに B・C のチェックが
				// スキルの一覧の下（40種のセットで 700〜1300px 下）にあって見えなかった**（C-71 の10節）。
				// 枠と出っ張りの見た目は css/common.css の .uma-section--framed / .uma-section-row。
				'<div data-usd-el="section-a" class="uma-section' + (grouped ? ' uma-section--framed' : '') + '">' +
					// 並びの行（A の見出し＋ B・C）。**3つとも無い画面では行ごと出さない**
					// ―― 出すと .uma-section の gap のぶんだけ Deck 単体ページの見た目が動く。
					(grouped ?
						'<div class="uma-section-row">' +
							(sectionGrouping ? '<p class="uma-section-head">スキルセット</p>' : '') +
							// B・C …（opts.extraScopes。無ければ空のまま）。中身は renderExtraScopes() が描く
							'<div data-usd-el="extra-scopes" class="usd-tm-scopes"></div>' +
							// 必要スキルPt の合計（段7d の追加・A。special の②だけ。中身は renderPtNeed()）。広い幅だけここに出す（狭い幅は見出しの行の右端）
							'<div class="usd-ptsum-slot" data-usd-el="pt-total-row"></div>' +
						'</div>'
					: '') +
					'<div class="uma-section-body">' +
					/* 入口の並び。**常に見えている。**
					 *
					 * **「スキルの追加」の畳む見出しは 73セッション目に外した**（段11 ⑩ で入れたもの）。
					 * 入れた理由は「段9 で入口が増え、375px で3段・行の高さ 130px を占めた」こと。
					 * その後、**並びを折り返さず横に送る形にして1段（30px）に収めた**ので、
					 * 畳む理由が無くなった。**畳めること自体が、入口を一時的に隠せてしまう**ので、
					 * 理由が無いなら置かないほうがよい（初めて開いた人に「足す手段が見えない画面」を
					 * 作り得る）。開閉の状態（`entryRowOpen`）も一緒に取り除いた ――
					 * **保存先は持っていなかった**ので、残る値の後始末は要らない。 */
					'<div class="usd-entry-row">' +
						'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="editor-pick">' +
							'<i data-lucide="filter" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> 条件で検索' +
						'</button>' +
						// 「条件で検索」と「テキストで検索」の間（72セッション目・段9。おいもさんの指示）。
						// 段8 でパッシブを「条件で検索」の母集団から外したので、**ここが唯一の入口**になる。
						// 条件で選べないものを条件の隣に置くのは、利用者から見れば
						// 「条件で探す／緑は名前で選ぶ／テキストで探す」という探し方の並びだから。
						/* **色で名乗るのは草の芽のアイコン1つだけ**（72セッション目・段9 の追加のやり直し）。
						   いったん面・枠・文字を緑で塗る形（`.uma-btn--danger` と同じ組み方）にしたが、
						   **実機で他のボタンより明らかに大きく見えた** ―― 膨張色に加えて
						   「緑スキルを追加（N種追加済み）」という長い文字でボタン自体が横に広がり、
						   375px では入口の段数まで増えた（3段→4段）。
						   いまは **地・枠・文字は他の入口と同じ黒系統**、呼び名も「緑スキル」に短くし、
						   件数は**タブと同じ数字バッジ**（`.usd-entry-count`）にしてある。
						   **0種のときは出さない**（数える意味が無い）。 */
						'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="editor-pick-passive">' +
							'<i data-lucide="sprout" class="w-3.5 h-3.5 usd-green-icon" style="display:inline;vertical-align:-2px;"></i> 緑スキル' +
							'<span class="usd-entry-count" data-usd-el="passive-added" hidden></span>' +
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
						// 「未収録スキルを追加」（editor-pick-custom）は 2026-09-27 に廃止した（C-100）
						/* **「リセット」はここから名前の行へ移した**（73セッション目）。
						   C-3 では「消す範囲が位置から分かる」ようにA の中へ置いていたが、
						   **消す範囲が B・C（シナリオ因子・遺伝子）まで広がった**ので、
						   A の中に居ると逆に範囲が狭く読める。**名前の行＝セットそのものを扱う行**が正しい場所。 */
					'</div>' +       // .usd-entry-row
					// 分類の切り替え（超優先／優先／通常。C-57 の (7)）。追加の入口はいま選んでいる分類に足す
					// 「本育成編成」（段7の E。special の②だけ。中身は renderRosterLink()）
					'<div class="usd-roster-link" data-usd-el="roster-link" hidden></div>' +
					'<div class="usd-tier-row" data-usd-el="tier-row"></div>' +
					// 周回因子セットの必要スキルPt（段5。special の②だけ。中身は renderPtNeed()）
					'<div class="usd-ptneed" data-usd-el="pt-need" hidden></div>' +
					'<div class="usd-mode-row">' +
						'<p class="text-xs text-slate-500">追加済みスキル（<span data-usd-el="selected-count">0</span>種）</p>' +
						// 「再分類」「削除」のモード（C-57 の (9)）。既定は両方 OFF＝パネルに操作が出ない（ゲームと同じ見え方）
						'<button type="button" class="usd-mode-btn" data-usd-act="mode-reclass" data-usd-el="mode-reclass" aria-pressed="false">再分類</button>' +
						'<button type="button" class="usd-mode-btn" data-usd-act="mode-delete" data-usd-el="mode-delete" aria-pressed="false">削除</button>' +
					'</div>' +
					'<div data-usd-el="selected-list" class="usd-panels"></div>' +
					'</div>' +
				'</div>' +
				// 最下段の注記（「スキルの追加・削除はすぐに保存されます…」／「保存すると名前を付けて残せます…」）は
				// C-62 の (7) で削除した。どちらも保存の作法を言うだけで、名前欄と「保存」がその場に見えている
				// 画面では読む意味が無かった（renderNote() ごと外したので、描く対象も無い）。
			'</div>';

		// 段8・D（setBased）: 青灰色の枠をやめて①と同じ白いパネルにし、並びを組み替える。
		//   「X Pt/N種 ? とチップ4つ」（pt-need）→ 継承固有・共通スキルのヒントLv（roster-link）→ 入口 → ランクと再分類・削除（tier-row）→ 一覧。
		// 見出し「スキルセット」・合計のスロット・「追加済みスキル（N種）」の行は無い（再分類・削除は tier-row の右端に描く）。
		// シナリオ因子／遺伝子のチェック（extra-scopes）は③の先頭の1行へ移す（段8・E。opts.scopesBar）
		if (setBased) {
			const sec = q(container, 'section-a');
			const body = sec.querySelector('.uma-section-body');
			sec.classList.remove('uma-section--framed');
			sec.classList.add('usd-setbody');
			const row = sec.querySelector('.uma-section-row');
			const scopesEl = q(container, 'extra-scopes');
			if (scopesEl && opts.scopesBar && opts.scopesBar.nodeType === 1) opts.scopesBar.appendChild(scopesEl);
			if (row) row.parentNode.removeChild(row);
			const modeRow = body.querySelector('.usd-mode-row');
			if (modeRow) modeRow.parentNode.removeChild(modeRow);
			['pt-need', 'roster-link'].forEach(k => { const el = q(container, k); body.insertBefore(el, body.firstChild ? body.querySelector('.usd-entry-row') : null); });
		}
		// grouped（special の②）には名前の入力欄が無い（名前はタブの中で編集する）
		const nameInput = grouped ? null : q(container, 'name-input');
		// 編成パネル（①）が描き直したとき、必要Ptも描き直す（本育成のぶんが変わるため）。段5
		// 編成（①）が変わったら、必要Ptと「本育成編成」の重なり・追加の一覧のグレーアウトも描き直す（段7の E・旧5。モーダルが開いたままでも映す）
		rosterPtListeners.push(function () { if (!container.isConnected) return; renderPtNeed(); renderRosterLink(); applyRosterHidden(); if (setBased) { renderSetBar(); renderSelectedList(); } });
		onSkillPtLoaded(function () { if (!container.isConnected || !grouped) return; renderTabs(); renderSelectedList(); });

		container.addEventListener('click', (e) => {
			const btn = e.target.closest('[data-usd-act]');
			if (!btn || !container.contains(btn)) return;
			const act = btn.dataset.usdAct;
			if (act === 'name') return;   // 入力欄そのもの（input で受ける）
			// 「…は10件までです」の知らせは、次の操作で消す
			if (limitNotice && act !== 'template-tab') limitNotice = false;
			// 描き直しで押したボタンが画面の中で動かないようにする（段7b の ⑥。special の②だけ）
			const anchor = grouped ? captureAnchor(btn) : null;
			try { onTmAct(btn, act); } finally { if (anchor) restoreAnchor(anchor, [container]); }
		});
		function onTmAct(btn, act) {
			if (act === 'template-tab') {
				const id = btn.dataset.tabId;
				// 上限に達しているとき、選んでいない「＋新規」は押せない（帯の下に知らせを出す。段7b の ⑫）
				if (grouped && (id === DRAFT_SELECTION_ID || !id) && currentTemplateId() && ensureUserData().templates.length >= TEMPLATE_LIMIT) { limitNotice = true; nameEdit = null; render(); }
				else selectTab(id);
			}
			else if (act === 'name-edit') startNameEdit();
			else if (act === 'name-cancel') { nameEdit = null; render(); }
			else if (act === 'name-commit') commitNameEdit();
			else if (act === 'name-reset') askResetTab();
			else if (act === 'template-save') saveCurrent();
			else if (act === 'template-duplicate') duplicateTemplate(currentTemplateId());
			else if (act === 'template-delete') deleteTemplate(currentTemplateId());
			else if (act === 'editor-pick') openEditorPicker('filter');
			else if (act === 'editor-pick-passive') openEditorPicker('passive');
			else if (act === 'editor-pick-text') openEditorPicker('paste');
			else if (act === 'editor-pick-screenshot') { if (opts.screenshotEntry && typeof opts.screenshotEntry.onClick === 'function') opts.screenshotEntry.onClick(); }
			else if (act === 'template-skill-remove') removeSkillFromEditing(btn.dataset.skillId);
			else if (act === 'editor-clear-skills') clearEditingSkills();
			// 分類（C-57）: 分類のタブ・再分類／削除のモード・1件の移動
			else if (act === 'tier-tab') selectTier(Number(btn.dataset.tier));
			else if (act === 'mode-reclass') setMode('reclass');
			else if (act === 'mode-delete') setMode('delete');
			else if (act === 'tier-move') moveSkillTier(btn.dataset.skillId, Number(btn.dataset.tier));
			// B・C …（C-2a／C-2c）: 「?」で見るだけの一覧を開く。チェックそのものは change で受ける
			// （label の中なので click は2回来る）
			else if (act === 'scope-help') openScopeList(btn.dataset.scope);
			else if (act === 'scope-help-close') closeScopeList();
			else if (act === 'pt-need-help' && setBased) openPopover({ key: 'factor-help:' + draftScopeKey, title: '②の Pt', build: fillFactorHelp, btn: btn, opener: btn, refocus: '[data-usd-act="pt-need-help"]' });
			else if (act === 'pt-need-help') { ptNeedHelpOpen = !ptNeedHelpOpen; renderPtNeed(); }
			else if (act === 'pt-rank') setPtRank(Number(btn.dataset.tier));
			else if (act === 'pt-total-help') openPtTotalPopover(btn);
			else if (act === 'roster-link') openRosterLinkPopover(btn);
			// 段8: 共通の見出しの帯
			else if (act === 'set-list') openPopover({ key: 'set-list:' + draftScopeKey, title: 'セット', build: fillSetList, btn: btn, opener: btn, refocus: '[data-usd-act="set-list"]' });
			else if (act === 'set-total-help') openPopover({ key: 'set-total:' + draftScopeKey, title: '合計', build: fillSetTotalInfo, btn: btn, opener: btn, refocus: '[data-usd-act="set-total-help"]' });
		}
		// 段8: 帯（setBarEl）の操作も同じ処理へ渡す（名前の入力・確定・取り消し・一覧・合計の?）
		if (setBarEl) {
			setBarEl.addEventListener('click', (e) => {
				const b = e.target.closest('[data-usd-act]');
				if (!b || !setBarEl.contains(b)) return;
				const act = b.dataset.usdAct;
				if (act === 'name') return;
				onTmAct(b, act);
			});
			setBarEl.addEventListener('input', (e) => {
				if (!e.target || e.target.getAttribute('data-usd-act') !== 'name') return;
				if (nameEdit) nameEdit.value = e.target.value;
				const commit = q(setBarEl, 'name-commit');
				if (commit) commit.disabled = !currentTemplateId() && !e.target.value.trim();
			});
			setBarEl.addEventListener('keydown', (e) => {
				if (!e.target || e.target.getAttribute('data-usd-act') !== 'name') return;
				if (e.key === 'Enter') { e.preventDefault(); commitNameEdit(); }
				else if (e.key === 'Escape' && nameEdit) { e.preventDefault(); e.stopPropagation(); nameEdit = null; render(); }
			});
		}
		container.addEventListener('change', (e) => {
			const box = e.target;
			if (!box || !box.getAttribute) return;
			const act = box.getAttribute('data-usd-act');
			if (act === 'pt-parent-level') { setParentHintLevel(Number(box.value)); return; }
			if (act === 'uniq-count') { setInheritedUnique('count', Number(box.value)); return; }
			if (act === 'uniq-level') { setInheritedUnique('hintLevel', Number(box.value)); return; }
			if (act !== 'scope-check') return;
			setScope(box.dataset.scope, box.checked);
		});
		container.addEventListener('input', (e) => {
			if (nameInput && e.target === nameInput) onNameInput();
			// 名前つきのタブの入力欄（段7b の ⑫）。確定するまで保存しない。✓ は「＋新規」が空のあいだ押せない
			if (grouped && e.target && e.target.getAttribute && e.target.getAttribute('data-usd-act') === 'name') {
				if (nameEdit) nameEdit.value = e.target.value;
				const commit = q(container, 'name-commit');
				if (commit) commit.disabled = !currentTemplateId() && !e.target.value.trim();
			}
		});
		container.addEventListener('keydown', (e) => {
			const el = e.target;
			if (grouped && el && el.getAttribute && el.getAttribute('data-usd-act') === 'name') {
				// Enter＝確定、Esc＝取り消し
				if (e.key === 'Enter') { e.preventDefault(); commitNameEdit(); }
				else if (e.key === 'Escape' && nameEdit) { e.preventDefault(); e.stopPropagation(); nameEdit = null; render(); }
				return;
			}
			if (e.target && e.target.closest && e.target.closest('.uma-subtabs')) tabStripKeydown(e, (id) => selectTab(id));
		});
		// 「?」の一覧は Esc でも閉じる（ミニウィンドウの作法。手前に別の層があればそちらが先に処理する）
		document.addEventListener('keydown', (e) => {
			if (e.key !== 'Escape' || e.defaultPrevented || !scopeHelpKey) return;
			closeScopeList();
			e.preventDefault();
		});

		function fireChange() {
			if (opts.onChange) opts.onChange();
		}

		// 一覧⇄編集の切り替えは無くなった（C-53）。呼び出し元の互換のため、描画のたびに 'list' を知らせる
		// （「元に戻す」の scope は常に list）。
		function fireViewChange(view) {
			if (opts.onViewChange) opts.onViewChange(view);
		}

		function fireSelection() {
			if (opts.onSelectionChange) opts.onSelectionChange(getSelection());
		}

		/* ---------- 編集対象の抽象化（テンプレート／ドラフトを同じUIで扱う） ---------- */
		function currentTemplateId() {
			return (selectedId && selectedId !== DRAFT_SELECTION_ID) ? selectedId : null;
		}
		function currentTarget() {
			const id = currentTemplateId();
			if (!id) return { kind: 'draft' };
			const t = ensureUserData().templates.find(x => x.templateId === id);
			return t ? { kind: 'template', obj: t } : { kind: 'draft' };
		}
		function editingSkillIds() {
			const target = currentTarget();
			return target.kind === 'draft' ? draftScope.skillIds : target.obj.skillIds;
		}

		/* ---------- 描画（1画面。タブ・名前の行・入口・追加済みスキル・注記） ---------- */
		function render() {
			const data = ensureUserData();
			// 消えたテンプレートを選んだままにしない
			if (currentTemplateId() && !data.templates.some(t => t.templateId === selectedId)) {
				selectedId = null;
				fireSelection();
			}
			// ドラフトが空になったら選択も外す（「＋ 新規」のタブは選ばれたまま＝中身が空）
			if (selectedId === DRAFT_SELECTION_ID && draftScope.skillIds.length === 0) {
				selectedId = null;
				fireSelection();
			}
			editing = currentTarget();
			renderTabs();
			renderNameRow();
			renderSelectedList();
			renderExtraScopes();
			renderRosterLink();
			applyRosterHidden();
			/* 入口の並びの「続きがある」の見せ方を測り直す（73セッション目の手直し）。
			   **ここで呼ばないと、読み込んだ幅のままでは一度も測られない** ――
			   window の resize でしか走らないので、その幅で開いた人には何も当たらなかった。 */
			scanEntryRows();
			// 段8: ①に、選んでいるセットを知らせる（変わったときだけ①が開き直す）
			if (setBased) setHubPublish(currentTemplateId() || '');
			fireViewChange('list');
		}

		/* ---------- B・C …（opts.extraScopes。C-2a） ---------- */

		/**
		 * 節（B・C …）を描く。**1行（チェック・呼び名・「?」）だけ**（C-2c）。
		 *
		 * **種数のバッジは段K で外した。** 「スキルセット」「シナリオ因子」「遺伝子」を
		 * 375px でも1行に並べるため ―― バッジ2つで 101px あり、字を小さくしても
		 * 収まらなかった（実測は同期フォルダの `special-stage-k-step0.md` の13節）。
		 * **ON かどうかはチェックの四角そのもの**で読む（C-2c は「件数バッジの色で示す」
		 * と決めていたが、その手がかりはここで無くなる）。**種数は「?」の一覧の見出し**
		 * （「シナリオ因子（24種）」）が引き続き出している。
		 * **exam の同じ1行にはバッジが残っている**（段K では exam を触らないと決めたため）。
		 */
		function renderExtraScopes() {
			const el = q(container, 'extra-scopes');
			if (!el) return;
			if (extraScopes.length === 0) { el.innerHTML = ''; return; }
			const cur = scopesOf(currentTarget());
			el.innerHTML = extraScopes.map(s => {
				const on = cur[s.key] === true;
				return '<div class="uma-checkrow" data-usd-scope-section="' + esc(s.key) + '">' +
					'<label class="uma-checkrow-label">' +
						'<input type="checkbox" data-usd-act="scope-check" data-scope="' + esc(s.key) + '"' + (on ? ' checked' : '') + '>' +
						'<span>' + esc(s.label) + '</span>' +
					'</label>' +
					// 「?」は見るだけの一覧を開く（チェックは付かない）。説明を隠す「?」と同じ部品
					'<button type="button" class="uma-help-btn" data-usd-act="scope-help" data-scope="' + esc(s.key) + '"' +
						' aria-expanded="' + (scopeHelpKey === s.key ? 'true' : 'false') + '"' +
						' aria-label="' + esc(s.label) + 'の一覧を見る" title="' + esc(s.label) + 'の一覧を見る">?</button>' +
				'</div>';
			}).join('');
		}

		/**
		 * 「?」で開く、**見るだけ**の一覧のミニウィンドウ（C-2c）。
		 * 押して選ぶものではないので、候補のボタン（.usd-name-hit）ではなく素の一覧にする。
		 * 中身（名前の配列）は呼び出し元が opts.extraScopes の names() で渡す
		 * ―― core はここに何が並ぶのかを知らない。
		 *
		 * **置き場所は document.body の直下。** パネルの中に置くと画面の外へ出てしまう ――
		 * special の②を包む `.glass-card` が `backdrop-filter` を持っていて、
		 * **子孫の `position: fixed` が「画面」ではなく「そのカード」を基準にする**
		 * （実測: 375px で箱の上端が -121px、1280px で -19px。C-2c の項目3の調査で判明）。
		 * 全画面に重ねるものは body 直下、というのは special の撮影ガイドと同じ作法。
		 */
		let scopeListEl = null;

		function openScopeList(key) {
			const s = extraScopes.find(x => x.key === key);
			if (!s) return;
			const names = (typeof s.names === 'function' ? s.names() : s.names) || [];
			if (!scopeListEl) {
				scopeListEl = global.document.createElement('div');
				scopeListEl.className = 'usd-roster-modal';
				scopeListEl.setAttribute('data-usd-el', 'scope-list-modal');
				scopeListEl.addEventListener('click', (e) => {
					// 背景（箱の外）と×のどちらでも閉じる
					if (e.target === scopeListEl || (e.target.closest && e.target.closest('[data-usd-act="scope-help-close"]'))) closeScopeList();
				});
				global.document.body.appendChild(scopeListEl);
			}
			scopeListEl.innerHTML =
				'<div class="usd-roster-modal-back" data-usd-act="scope-help-close"></div>' +
				'<div class="usd-roster-modal-box" role="dialog" aria-modal="true" aria-label="' + esc(s.label) + 'の一覧">' +
					'<div class="usd-roster-modal-head"><span class="usd-roster-h">' + esc(s.label) + '（' + names.length + '種）</span>' +
						'<button type="button" class="uma-icon-btn" data-usd-act="scope-help-close" data-usd-el="scope-list-close" aria-label="閉じる">×</button></div>' +
					'<div class="usd-roster-hits"><ul class="uma-namelist">' +
						names.map(nm => '<li>' + esc(nm) + '</li>').join('') + '</ul></div>' +
				'</div>';
			scopeListEl.hidden = false;
			scopeHelpKey = key;
			renderExtraScopes();   // 「?」の aria-expanded を true にする
			const close = scopeListEl.querySelector('[data-usd-el="scope-list-close"]');
			// **preventScroll を付ける。** 付けないと、フォーカスを移すだけで画面が動く（C-65 と同じ）
			if (close) { try { close.focus({ preventScroll: true }); } catch (e) { close.focus(); } }
		}

		function closeScopeList() {
			if (!scopeHelpKey) return;
			const key = scopeHelpKey;
			scopeHelpKey = null;
			if (scopeListEl) { scopeListEl.hidden = true; scopeListEl.innerHTML = ''; }
			renderExtraScopes();
			// 開く前に押したボタンへフォーカスを戻す（画面は動かさない）
			const again = container.querySelector('[data-usd-act="scope-help"][data-scope="' + key.replace(/"/g, '\\"') + '"]');
			if (again) { try { again.focus({ preventScroll: true }); } catch (e) { /* 古いブラウザ */ } }
		}

		/**
		 * 節の ON/OFF。**「元に戻す」には積まない** ―― もう一度押せば戻る操作で、
		 * いまの状態も画面に出ている。積むと、戻したいのはスキルの追加だったのに
		 * チェックが戻る、ということが起きる（C-3 の「クリア」はまとめて戻すので、そちらには含める）。
		 */
		function setScope(key, on) {
			if (!extraScopes.some(s => s.key === key)) return;
			const target = currentTarget();
			const next = Object.assign({}, scopesOf(target));
			if (on) next[key] = true; else delete next[key];
			if (!writeScopes(target, next)) return;
			// **renderTabs() は呼ばない。** 帯のタブが出しているのはスキルの数で、ここでは変わらない。
			// 呼ぶと revealSelectedTab() の scrollIntoView が走り、**帯まで画面が戻る**
			// （B・C は帯より下にあるので、押した場所が動く。C-2c の項目3。実測 1280px で +106px／375px で +238px）。
			renderExtraScopes();
			// チェックが「リセット」の押せる条件に入った（73セッション目）ので、ここでも見直す
			renderResetBtn();
			if (isSelected(target)) fireSelection();
			fireChange();
		}

		function renderTabs() {
			const list = ensureUserData().templates;
			const onDraft = !currentTemplateId();
			// 段8（setBased）: ②のタブの帯は無い（セットの名前・切り替え・合計は、ステップのタブの上の共通の帯＝renderSetBar）
			if (setBased) { q(container, 'head').innerHTML = ''; renderSetBar(); return; }
			const items = [{
				id: DRAFT_SELECTION_ID, label: '＋ ' + DRAFT_LABEL, isNew: true, selected: onDraft,
				count: draftScope.skillIds.length > 0 ? countSkillKinds(draftScope.skillIds) + '種' : null,
				title: DRAFT_LABEL + '：保存していない' + setLabel
			}].concat(list.map(t => ({
				id: t.templateId, label: t.name || '（名称未設定）', title: t.name || '（名称未設定）',
				selected: t.templateId === selectedId, count: countSkillKinds(t.skillIds) + '種'
			})));
			if (grouped) {
				// 段7b の ⑫：見出し「因子セット（X／10件）」を無くし、①と同じ名前つきのタブ（共有の namedTabsHtml）にした。
				// 上限に達したら「＋新規」は薄く押せない見た目（選んでいるときは薄くしない）。押すと帯の下に知らせを出す
				const full = list.length >= TEMPLATE_LIMIT;
				items[0].className = 'usd-roster-tab' + (full && !onDraft ? ' usd-roster-tab--full' : '');
				if (full && !onDraft) items[0].title = tabNoun + 'は' + TEMPLATE_LIMIT + '件までです';
				items.forEach(it => { if (!it.className) it.className = 'usd-roster-tab'; });
				q(container, 'head').innerHTML =
					namedTabsHtml(items, { act: 'template-tab', ariaLabel: tabNoun, el: 'tabs', noun: tabNoun, edit: nameEdit, placeholder: tabNoun + 'の名前' }) +
					(limitNotice ? '<p class="usd-roster-warn" data-usd-el="limit-notice">' + esc(tabNoun) + 'は' + TEMPLATE_LIMIT + '件までです。新しい' + esc(tabNoun) + 'を作るには、いまの' + esc(tabNoun) + 'を削除してください（名前の横の×）。</p>' : '');
				const strip = q(container, 'tabs');
				if (strip) strip.classList.add('usd-hscroll');
				revealSelectedTab(container, true);
				refreshIcons();
				if (nameEdit) {
					const input = q(container, 'name');
					if (input && global.document.activeElement !== input) { focusNoScroll(input); input.setSelectionRange(input.value.length, input.value.length); }
				}
				return;
			}
			q(container, 'head').innerHTML =
				'<p class="usd-roster-h usd-roster-h--top">' + esc(setLabel) + '（<span data-usd-el="count-badge">' + list.length + '</span>／' + TEMPLATE_LIMIT + '件）</p>' +
				tabStripHtml(items, { act: 'template-tab', ariaLabel: setLabel, el: 'tabs' });
			revealSelectedTab(container);
		}

		/* ------------------------------------------------------------
		 * 共通の見出しの帯（段8・B。special だけ＝setBased で opts.setBar を渡したとき）
		 *   左：セット名・✎（名前の入力。Enter＝確定・Esc＝取り消し）・「3／10 ▾」（保存済みのセットの数／上限。押すと一覧の小窓）
		 *   右：「合計 N Pt（切れ者、①＋②）」と ?（式「合計 ＝ ① X ＋ ② Y」）
		 * 帯の置き場（sticky）は呼び出し元のページが決める。中身はここが描く
		 * ------------------------------------------------------------ */
		function setNameOf(target) {
			if (target.kind === 'template') return target.obj.name || '（名称未設定）';
			return '＋新規';
		}
		function renderSetBar() {
			if (!setBarEl) return;
			const target = currentTarget();
			const list = ensureUserData().templates;
			const sum = setSummaryOf(target);
			const icon = (name) => '<i data-lucide="' + name + '" class="w-4 h-4" aria-hidden="true"></i>';
			const btn = (act, el, label, inner, extra) => '<button type="button" class="usd-setbar-btn" data-usd-act="' + act + '" data-usd-el="' + el + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (extra || '') + '>' + inner + '</button>';
			let left;
			if (nameEdit) {
				const value = String(nameEdit.value || '');
				left = '<input class="usd-setbar-input" type="text" data-usd-el="name" data-usd-act="name" value="' + esc(value) + '" placeholder="セットの名前" aria-label="セットの名前" />'
					+ btn('name-commit', 'name-commit', target.kind === 'template' ? '名前を確定' : 'セットを保存', icon('check'), target.kind !== 'template' && !value.trim() ? ' disabled' : '')
					+ btn('name-cancel', 'name-cancel', '編集を取り消す', icon('undo-2'));
			} else {
				const name = setNameOf(target);
				left = '<span class="usd-setbar-name' + (target.kind === 'template' ? '' : ' usd-setbar-name--new') + '" data-usd-el="set-name" title="' + esc(name) + '">' + esc(name) + '</span>'
					+ btn('name-edit', 'name-edit', target.kind === 'template' ? 'セットの名前を変える' : '名前を付けて保存', icon('pencil'))
					+ '<button type="button" class="usd-setbar-list" data-usd-act="set-list" data-usd-el="set-list-btn" aria-haspopup="dialog" aria-expanded="false" aria-label="セットの一覧（' + list.length + '／' + TEMPLATE_LIMIT + '件）">'
					+ '<span data-usd-el="set-count">' + list.length + '／' + TEMPLATE_LIMIT + '</span><span class="usd-setbar-caret" aria-hidden="true">▾</span></button>';
			}
			let right = '';
			if (sum) {
				const sub = '（' + (sum.statusLabel ? sum.statusLabel + '、' : '') + '①＋②）';
				right = '<span class="usd-setbar-sum" data-usd-el="set-total" data-total="' + sum.total + '">'
					+ '<span class="usd-setbar-sumline"><span class="usd-setbar-k">合計</span> <strong class="usd-setbar-num" data-usd-el="set-total-num">' + formatPtNumber(sum.total) + '</strong> <span class="usd-setbar-k">Pt</span></span>'
					+ '<span class="usd-setbar-sub" data-usd-el="set-total-sub">' + esc(sub) + '</span></span>'
					+ '<button type="button" class="uma-help-btn" data-usd-act="set-total-help" data-usd-el="set-total-help" aria-haspopup="dialog" aria-expanded="false" aria-label="合計の式" title="合計の式">?</button>';
			}
			setBarEl.innerHTML = '<div class="usd-setbar" data-usd-el="setbar"><div class="usd-setbar-l">' + left + '</div><div class="usd-setbar-r">' + right + '</div></div>';
			refreshIcons();
			// ②のタブの脇の「N種」は②の先頭の N と同じ値（special が受け取って出す）
			if (typeof opts.onSetSummary === 'function') { try { opts.onSetSummary(sum); } catch (e) { /* 呼び出し元の不具合で帯を止めない */ } }
			if (nameEdit) {
				const input = q(setBarEl, 'name');
				if (input && global.document.activeElement !== input) { focusNoScroll(input); input.setSelectionRange(input.value.length, input.value.length); }
			}
		}
		/** 合計の式の小窓（?）。「合計 ＝ ① X ＋ ② Y」 */
		function fillSetTotalInfo(body) {
			const sum = setSummaryOf(currentTarget());
			if (!sum) { body.appendChild(infoEl('p', 'usd-info-desc--pending', 'Pt のデータを読み込めませんでした')); return; }
			const p = infoEl('p', '', '合計 ＝ ① ' + formatPtNumber(sum.rosterPt) + ' ＋ ② ' + formatPtNumber(sum.factorPt));
			p.setAttribute('data-usd-el', 'set-total-formula');
			body.appendChild(p);
		}
		/** セットの一覧の小窓（ラジオで切り替え・＋新規・選んだセットの削除） */
		function fillSetList(body) {
			const data = ensureUserData();
			const curId = currentTemplateId() || '';
			const full = data.templates.length >= TEMPLATE_LIMIT;
			const group = infoEl('div', 'usd-link-list');
			group.setAttribute('role', 'radiogroup');
			group.setAttribute('aria-label', 'セット');
			group.setAttribute('data-usd-el', 'set-list');
			const items = [{ id: '', name: '＋新規' }].concat(data.templates.map(t => ({ id: t.templateId, name: t.name || '（名称未設定）' })));
			items.forEach(o => {
				const on = o.id === curId;
				const blocked = !o.id && full && !on;   // 上限のときは「＋新規」へ移れない
				const lab = infoEl('label', 'usd-link-opt' + (on ? ' usd-link-opt--on' : '') + (blocked ? ' usd-link-opt--off' : ''));
				const input = infoEl('input');
				input.type = 'radio';
				input.name = 'usd-set-list';
				input.value = o.id;
				input.checked = on;
				input.disabled = blocked;
				input.setAttribute('data-usd-el', 'set-radio');
				input.addEventListener('change', () => {
					if (!input.checked) return;
					closeSkillInfo();
					selectTab(o.id || DRAFT_SELECTION_ID);
				});
				lab.appendChild(input);
				lab.appendChild(infoEl('span', 'usd-link-name', o.name));
				group.appendChild(lab);
			});
			body.appendChild(group);
			if (full) {
				const warn = infoEl('p', 'usd-roster-warn', 'セットは' + TEMPLATE_LIMIT + '件までです。新しく作るには、いまのセットを削除してください。');
				warn.setAttribute('data-usd-el', 'limit-notice');
				body.appendChild(warn);
			}
			const row = infoEl('div', 'usd-setlist-ops');
			const del = infoEl('button', 'uma-btn uma-btn--danger', '削除');
			del.type = 'button';
			del.setAttribute('data-usd-el', 'set-delete');
			del.addEventListener('click', () => { closeSkillInfo(); askResetTab(); });
			row.appendChild(del);
			body.appendChild(row);
		}

		function renderNameRow() {
			const target = currentTarget();
			if (nameInput) nameInput.value = target.kind === 'template' ? (target.obj.name || '') : (draftScope.name || '');
			const dup = q(container, 'dup-btn');
			const del = q(container, 'del-btn');
			if (dup) dup.hidden = target.kind !== 'template';
			if (del) del.hidden = target.kind !== 'template';
			// grouped の「複製」の行（保存済みを選んでいるときだけ）
			const actions = q(container, 'tm-actions');
			if (actions) actions.hidden = target.kind !== 'template';
		}

		/* ------------------------------------------------------------
		 * 「本育成編成」（段7の E・段7b の ⑬）。special の②（grouped）で、編成パネル（①）があるときだけ出す。
		 * ボタンを押すと、**保存した編成の一覧**を小窓で出す（先頭は「なし」）。選んだ編成の●（その編成の絞り込みの決まりで数えた、
		 * 本育成で得るスキル）を、そのセットから外す。**対象は「選んだ編成」**（段7 では①で選択中の編成だった。置き換え）。
		 * 保存はセットごと（template.baseRosterId / ドラフトの baseRosterId＝編成の rosterId。選んだときだけ書く・触らなければ足さない・
		 * 読み込み時に補わない。段7 の withRoster は読まない）。指す編成が無くなっていたら対象なしとして扱い、保存値は書き換えない。
		 *   - 選んだ時点で、そのセットのスキルのうち本育成で得るものを外す（通知と「元に戻す」）。「なし」で対象を解除（外したスキルは戻らない）
		 *   - 対象がある間は、追加の一覧（条件で検索・緑スキル・名前を入れて探す・貼り付け・画像取り込み）で、対象の編成の●を
		 *     グレーアウトで残して追加できなくする（pickerHiddenIds）
		 *   - 選んだ編成の中身が後から変わっても自動では外さず、重なりの数だけ更新して小さく出す
		 * ------------------------------------------------------------ */
		/** 対象（ドラフト／テンプレート）に保存してある編成の rosterId（無ければ ''。指す先が在るかは確かめない） */
		function storedBaseRosterIdOf(target) {
			if (!target) return '';
			if (target.kind === 'draft') return typeof draftScope.baseRosterId === 'string' ? draftScope.baseRosterId : '';
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			return t && typeof t.baseRosterId === 'string' ? t.baseRosterId : '';
		}
		/** 対象が使っている保存済みの編成。指す先が無ければ null（対象なしとして扱う。保存値は書き換えない） */
		function linkedRosterOf(target) {
			// 段8（setBased）: 相手は常に同じセットの①。下書きのセットは下書きの編成、保存済みは付いている編成（無ければ null＝①が空）
			if (setBased) {
				if (!target || target.kind === 'draft') return draftScopeKey ? loadDraftRoster(draftScopeKey) : null;
				return setRosterOfTemplate(ensureUserData().templates.find(x => x.templateId === target.obj.templateId));
			}
			const id = storedBaseRosterIdOf(target);
			return id ? findRoster(id) : null;
		}
		function writeBaseRosterId(target, rosterId) {
			if (target.kind === 'draft') {
				draftScope = persistDraft(draftScope.skillIds, draftScope.name, draftScope.tiers, draftScope.scopes, undefined, rosterId || null);
				return true;
			}
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			if (!t) return false;
			if (rosterId) t.baseRosterId = rosterId; else delete t.baseRosterId;
			t.updatedAt = nowIso();
			saveUserData();
			return true;
		}
		/** 選んだ編成の●（その編成の絞り込みの決まりで数えたもの）。編成パネルが無い画面・指す先が無いときは空 */
		// 段8: 引数は編成そのもの（下書きの編成には保存済みの id が無いため）
		function rosterSureIdsOf(r) {
			if (!grouped || !rosterPtSource || !r) return [];
			return rosterPtInputsOf(r).sureIds;
		}
		/** 選んだ編成で「取得しない」にしたスキル（段7c の M。いま●のものだけ）。追加の一覧では、本育成で得るものとは別の理由で選べなくする */
		function rosterOffIdsOf(r) {
			if (!grouped || !rosterPtSource || !r) return [];
			return rosterPtInputsOf(r).offIds;
		}
		/** 追加の一覧で選べなくするスキル（対象があるセットを編集しているときだけ）。モーダルが開いていれば描き直す（旧5）。 */
		function applyRosterHidden() {
			const linked = linkedRosterOf(currentTarget());
			const sure = linked ? rosterSureIdsOf(linked) : [];
			const off = linked ? rosterOffIdsOf(linked).filter(id => sure.indexOf(id) === -1) : [];
			const next = sure.concat(off);
			const changed = next.length !== pickerHiddenIds.length || next.some((id, i) => id !== pickerHiddenIds[i])
				|| off.length !== pickerOffIds.length || off.some((id, i) => id !== pickerOffIds[i]);
			pickerHiddenIds = next;
			pickerOffIds = off;
			if (changed) { renderPickerResults(); renderPasteReport(); }
		}
		function renderRosterLink() {
			const el = q(container, 'roster-link');
			if (!el) return;
			if (!grouped || !rosterPtSource) { el.hidden = true; el.innerHTML = ''; return; }
			const target = currentTarget();
			if (setBased) {
				// 段8・D: ②の2行目［継承固有 6種▾ Lv3▾］［共通スキルのヒントLv 5▾］（「親由来のレベル」を改名。保存は今のまま）。
				// 継承固有の Pt は1行目のチップに出すので、ここには出さない。重なり・不要にしたスキルの知らせは出さない（①で取得するものは②に数えない）
				const rules = skillPtData.rules;
				const uq0 = resolveInheritedUnique(inheritedUniqueOf(target), rules);
				const opt = (list, cur, fmt) => list.map(v => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + fmt(v) + '</option>').join('');
				let s = '<div class="usd-roster-linkrow usd-setcfg usd-hscroll" data-usd-no-trim="1" data-usd-el="roster-link-row">'
					+ '<span class="usd-uniq" role="group" aria-label="継承固有" data-usd-el="uniq">'
					+ '<span class="usd-uniq-label">継承固有</span>'
					+ '<select class="usd-uniq-sel" data-usd-act="uniq-count" data-usd-el="uniq-count" aria-label="継承固有の種類">' + opt(inheritedUniqueCountChoices(), uq0.count, v => v + '種') + '</select>'
					+ '<select class="usd-uniq-sel" data-usd-act="uniq-level" data-usd-el="uniq-level" aria-label="継承固有のヒントレベル">' + opt(inheritedUniqueLevelChoices(rules), uq0.hintLevel, v => 'Lv' + v) + '</select>'
					+ '</span>';
				if (rules) {
					const F = resolveParentHintLevel(parentHintLevelOf(target), rules);
					s += '<span class="usd-uniq" role="group" aria-label="共通スキルのヒントLv" data-usd-el="parent-level-group">'
						+ '<span class="usd-uniq-label">共通スキルのヒントLv</span>'
						+ '<select class="usd-uniq-sel" data-usd-act="pt-parent-level" data-usd-el="pt-parent-level" aria-label="共通スキルのヒントLv">'
						+ opt(parentHintLevelChoices(rules), F, v => String(v)) + '</select></span>';
				}
				el.hidden = false;
				el.innerHTML = s + '</div>';
				scanEntryRows();
				return;
			}
			const linked = linkedRosterOf(target);
			const sure = new Set(linked ? rosterSureIdsOf(linked) : []);
			const offSet = new Set(linked ? rosterOffIdsOf(linked) : []);
			const overlap = linked ? (skillIdsOf(target) || []).filter(id => sure.has(id)).length : 0;
			const offIn = linked ? (skillIdsOf(target) || []).filter(id => offSet.has(id)).length : 0;
			// 対象なし＝輪郭だけ（aria-pressed=false）。対象あり＝暗い塗りで「本育成編成：{編成の名前}」（長ければ省略記号。aria-pressed=true）。
			// 共有の .uma-btn--secondary は使わない（その :hover が押している状態の暗い地を上書きして、白い文字が白地に消えていた。段7b の ⑬）
			// 段7c の O：選んだ編成の本育成の Pt をボタンに入れる。「本育成編成（{状態}_{XXXX}Pt）：{編成名}」（状態が「なし」のときは状態と「_」を省く）。
			// 元データが使えないとき（読み込み中・失敗）は、かっこの中身を出さない。編成を選んでいないときは「本育成編成」だけ
			const name = linked ? (linked.name || '（名称未設定）') : '';
			const sum = linked ? rosterPtSummaryOf(linked) : null;
			// 段7d の ⑩：選んだあとも編成の名前は出さない。「本育成編成：切れ者_7,993 Pt」（状態が「なし」なら「本育成編成：7,993 Pt」）。名前は title と aria-label に残す
			const label = linked && sum
				? '本育成編成：' + (sum.statusLabel ? sum.statusLabel + '_' : '') + formatPtNumber(sum.total) + ' Pt'
				: '本育成編成';
			const fullLabel = linked ? label + '（' + name + '）' : label;
			// 段7d の ⑪：右隣に「継承固有」（種類・ヒントLv）。ボタンと同じ1行に収め、収まらない幅ではこの行だけ横に送る（縦には増やさない）
			const uq = resolveInheritedUnique(inheritedUniqueOf(target), skillPtData.rules);
			const optList = (list, cur, fmt) => list.map(v => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + fmt(v) + '</option>').join('');
			let h = '<div class="usd-roster-linkrow usd-hscroll" data-usd-no-trim="1" data-usd-el="roster-link-row">'
				// 段8（setBased）: 「本育成編成」のボタンと小窓は無い（相手は常に同じセットの①）
				+ (setBased ? '' : '<button type="button" class="usd-roster-linkbtn" data-usd-act="roster-link" data-usd-el="roster-link-btn"'
				+ ' aria-pressed="' + (linked ? 'true' : 'false') + '" aria-haspopup="dialog" aria-expanded="false" title="' + esc(fullLabel) + '" aria-label="' + esc(fullLabel) + '">'
				+ '<span class="usd-roster-linkname">' + esc(label) + '</span></button>')
				+ '<span class="usd-uniq" role="group" aria-label="継承固有" data-usd-el="uniq">'
				+ '<span class="usd-uniq-label">継承固有</span>'
				+ '<select class="usd-uniq-sel" data-usd-act="uniq-count" data-usd-el="uniq-count" aria-label="継承固有の種類">' + optList(inheritedUniqueCountChoices(), uq.count, v => v + '種') + '</select>'
				+ '<select class="usd-uniq-sel" data-usd-act="uniq-level" data-usd-el="uniq-level" aria-label="継承固有のヒントレベル">' + optList(inheritedUniqueLevelChoices(skillPtData.rules), uq.hintLevel, v => 'Lv' + v) + '</select>'
				+ '</span></div>';
			if (overlap > 0) h += '<span class="usd-roster-note" data-usd-el="roster-link-overlap">このセットには、本育成で得るスキルが' + overlap + '種含まれています</span>';
			// 取得しないにしたスキルがセットに入っているとき（段7c の M。自動では外さない）。0種なら出さない
			if (offIn > 0) h += '<span class="usd-roster-note" data-usd-el="roster-link-off">このセットには、本育成編成で不要にしたスキルが' + offIn + '種含まれています</span>';
			el.hidden = false;
			el.innerHTML = h;
			scanEntryRows();
		}
		/** 保存した編成の一覧の小窓（ラジオ。先頭は「なし」）。未保存の「＋新規」の編成は出さない */
		function fillRosterLinkList(body) {
			const cur = linkedRosterOf(currentTarget());
			const note = infoEl('p', 'usd-roster-note', '保存した編成から選べます');
			note.setAttribute('data-usd-el', 'link-note');
			body.appendChild(note);
			const group = infoEl('div', 'usd-link-list');
			group.setAttribute('role', 'radiogroup');
			group.setAttribute('aria-label', '本育成編成');
			group.setAttribute('data-usd-el', 'link-list');
			const opts = [{ id: '', name: 'なし' }].concat(listRosters().map(r => ({ id: r.rosterId, name: r.name || '（名称未設定）' })));
			opts.forEach(o => {
				const on = (cur ? cur.rosterId : '') === o.id;
				const lab = infoEl('label', 'usd-link-opt' + (on ? ' usd-link-opt--on' : ''));
				const input = infoEl('input');
				input.type = 'radio';
				input.name = 'usd-roster-link';
				input.value = o.id;
				input.checked = on;
				input.setAttribute('data-usd-el', 'link-radio');
				input.addEventListener('change', () => {
					if (!input.checked) return;
					closeSkillInfo();
					applyRosterLink(o.id);
				});
				lab.appendChild(input);
				lab.appendChild(infoEl('span', 'usd-link-name', o.name));
				group.appendChild(lab);
			});
			body.appendChild(group);
		}
		function openRosterLinkPopover(btn) {
			openPopover({ key: 'roster-link:' + draftScopeKey, title: '本育成編成', build: fillRosterLinkList, btn: btn, opener: btn, refocus: '[data-usd-act="roster-link"]' });
		}
		/** 小窓で編成（または「なし」）を選んだとき。選んだ編成の●を、そのセットから外す（いまの処理・同じ Undo・通知）。「なし」は対象を解除するだけ */
		function applyRosterLink(rosterId) {
			const target = currentTarget();
			if (!writeBaseRosterId(target, rosterId)) return;
			if (rosterId) {
				const sure = new Set(rosterSureIdsOf(findRoster(rosterId)));
				const before = skillIdsOf(target) || [];
				const drop = before.filter(id => sure.has(id));
				if (drop.length > 0) {
					const prev = snapshot(before);
					const prevTiers = snapshot(tiersOf(target));
					const text = '本育成編成で得るため、' + getSkillName(drop[0]) + (drop.length > 1 ? 'ほか' + (drop.length - 1) + '種' : '') + 'を因子周回から外しました';
					pushUndo({
						scope: 'list',
						doneLabel: text,
						undoneLabel: '外した' + drop.length + '種を因子周回に戻しました',
						probe: () => probeOf(skillIdsOf(target)),
						apply: () => {
							if (!writeSkillIds(target, snapshot(prev), snapshot(prevTiers))) return false;
							picker.excludeIds = picker.excludeIds.concat(prev.filter(id => picker.excludeIds.indexOf(id) === -1));
							afterEditingSkillsChanged(target);
							return true;
						}
					});
					if (writeSkillIds(target, before.filter(id => !sure.has(id)), tiersWithout(prevTiers, drop))) {
						picker.excludeIds = picker.excludeIds.filter(id => drop.indexOf(id) === -1);
					}
				}
			}
			afterEditingSkillsChanged(target);
		}
		/**
		 * 周回因子セットの必要スキルPt（段5）。**special の②だけ**（grouped）で、**本育成のぶんを渡す編成パネル（①）があるときだけ**出す
		 * （Deck 単体ページには出ない）。3つの合計（超優先だけ／優先まで／通常まで）・うち本育成・Pt 未収録の件数・親由来のレベル F。
		 * 計算は純粋関数 computeFactorSetPt。読み込み中は何も出さず、読めなかったときだけ知らせる。
		 */
		/**
		 * ②の必要スキルPt の計算（段7d）。必要スキルPt の表示と、②の各行の Pt（⑬）が同じ結果を使う。
		 * 本育成編成を選んでいるセットは、その編成の本育成（①の「X Pt/N種」と同じ値）。選んでいない（「なし」）セットは、編成の Pt を 0 として数える。
		 * 出せない画面（Deck 単体ページ）は null。元データが使えないときは { inp }（r は無い）。
		 */
		function factorPtState(target) {
			if (!grouped || !rosterPtSource) return null;
			const linkedRoster = linkedRosterOf(target);
			const inp = linkedRoster ? rosterPtInputsOf(linkedRoster) : emptyRosterPtInputs();
			if (inp.status !== 'ok') return { inp: inp };
			const allIds = skillIdsOf(target) || [];
			// 段8（setBased）: ①で得るスキル（①の表に出ている●でオンのもの）は②の Pt と種に数えない（因子セットから除いて計算する。自動では外さない）
			const taken = setBased ? new Set(inp.sureIds || []) : new Set();
			const ids = allIds.filter(id => !taken.has(id));
			const rules = skillPtData.rules;
			const F = resolveParentHintLevel(parentHintLevelOf(target), rules);
			const r = computeFactorSetPt({
				sources: inp.sources, rules: rules, skillPt: skillPtData.skillPt, stepUp: skillPtData.stepUp,
				statusId: inp.settings.status, umaHintLevel: inp.settings.umaHintLevel, enabledSkillIds: inp.enabledIds, offSkillIds: inp.offIds || [],
				factorSkillIds: ids, tiers: tiersOf(target), parentHintLevel: F, inheritedUnique: inheritedUniqueOf(target) || {}
			});
			return { inp: inp, ids: ids, takenIds: allIds.filter(id => taken.has(id)), rules: rules, F: F, r: r };
		}
		/** ランクの ON/OFF（段8・D。template.ptRanks: { high, mid, low }。無い・true 以外でない値は ON） */
		const PT_RANK_KEYS = { 1: 'high', 2: 'mid', 3: 'low' };
		function ptRanksOf(target) {
			const raw = target && target.kind === 'template' ? target.obj.ptRanks : draftScope.ptRanks;
			const out = {};
			TIERS.forEach(t => { out[t.id] = !(raw && typeof raw === 'object' && raw[PT_RANK_KEYS[t.id]] === false); });
			return out;
		}
		/**
		 * セットの数字（段8・B／D）。②の X ＝ 継承固有 ＋ ON のランクの Pt（チップの値の和）、N ＝ ON のランクの種（金と前段の白は1種・①で得るものは除く）＋ 継承固有の種類数。
		 * ①の値は、同じセットの①の「X Pt/N種」と同じ（前段込み）。合計 ＝ ① ＋ ②。元データが使えないときは null。
		 */
		function setSummaryOf(target) {
			const st = factorPtState(target);
			if (!st || !st.r || !st.r.ok) return null;
			const r = st.r, on = ptRanksOf(target);
			const uq = resolveInheritedUnique(inheritedUniqueOf(target), st.rules);
			const kinds = kindCountsOf(st.ids, tiersOf(target));
			let factorPt = r.inheritedUniquePt, factorKinds = uq.count;
			r.cuts.forEach(c => { if (on[c.tier]) { factorPt += c.own; factorKinds += kinds.byTier[c.tier]; } });
			const linked = linkedRosterOf(target);
			const rs = linked ? rosterPtSummaryOf(linked) : null;
			const rosterPt = rs ? rs.total : 0;
			return { rosterPt: rosterPt, statusLabel: rs ? rs.statusLabel : '', factorPt: factorPt, factorKinds: factorKinds,
				total: rosterPt + factorPt, ranks: on, takenIds: st.takenIds, unpricedCount: r.unpricedCount, st: st };
		}
		/** ②の各行の Pt を描き直す（⑬）。行の Pt は、必要スキルPt に数えている値（親由来のレベルと本育成編成の割引を反映したもの） */
		function renderPanelPts() {
			if (!grouped) return;
			const list = q(container, 'selected-list');
			const spans = list ? list.querySelectorAll('[data-usd-el="panel-pt"]') : [];
			if (spans.length === 0) return;
			const st = factorPtState(currentTarget());
			const taken = new Set(st && st.takenIds ? st.takenIds : []);
			spans.forEach(sp => {
				const id = sp.getAttribute('data-skill-id');
				// 段8・D: ①で得るスキル（●でオン）は②に数えない。行は薄くして、Pt の代わりに「①で取得」（自動では外さない）
				const panel = sp.closest ? sp.closest('.usd-panel') : null;
				if (panel) panel.classList.toggle('usd-panel--taken', taken.has(id));
				if (taken.has(id)) { sp.textContent = '①で取得'; return; }
				const x = st && st.r && st.r.ok ? st.r.skillPts.get(id) : null;
				sp.textContent = x ? (x.base === null ? 'Pt 未収録' : x.base === 0 ? 'Pt 不要' : x.pt + ' Pt') : '';
			});
			scanEntryRows();
		}
		/** 必要スキルPt の合計「合計：N Pt ?」（段7d の追加・A）。合計は「通常まで」の累計＝本育成編成 ＋ 継承固有 ＋ 超優先 ＋ 優先 ＋ 通常。（?）で内訳の小窓を開く */
		function ptTotalHtml(r, el) {
			const total = r.cuts[r.cuts.length - 1].total;
			return '<span class="usd-ptsum' + (el === 'pt-total-head' ? ' usd-ptsum--head' : '') + '" data-usd-el="' + el + '">合計：<strong data-usd-el="pt-total-num">' + formatPtNumber(total) + '</strong> Pt'
				+ '<button type="button" class="uma-help-btn" data-usd-act="pt-total-help" aria-haspopup="dialog" aria-expanded="false" aria-label="合計の内訳" title="合計の内訳">?</button></span>';
		}
		function fillPtTotalInfo(body) {
			const st = factorPtState(currentTarget());
			const line = (text, el) => { const p = infoEl('p', '', text); p.setAttribute('data-usd-el', el); body.appendChild(p); };
			if (!st || !st.r || !st.r.ok) { body.appendChild(infoEl('p', 'usd-info-desc--pending', 'Pt のデータを読み込めませんでした')); return; }
			const r = st.r, fmt = formatPtNumber;
			const parts = ['本育成編成 ' + fmt(r.roster.total) + (r.roster.prevTotal > 0 ? '（うち前段 ' + fmt(r.roster.prevTotal) + '）' : ''), '継承固有 ' + fmt(r.inheritedUniquePt)]
				.concat(r.cuts.map(c => tierLabel(c.tier) + ' ' + fmt(c.own)));
			line('合計 ＝ ' + parts.join(' ＋ '), 'info-total-formula');
			line(r.cuts.map(c => tierLabel(c.tier) + 'まで ' + fmt(c.total)).join('／'), 'info-total-cumulative');
		}
		function openPtTotalPopover(btn) {
			openPopover({ key: 'pt-total:' + draftScopeKey, title: '必要スキルPtの合計', build: fillPtTotalInfo, btn: btn, opener: btn, refocus: '[data-usd-act="pt-total-help"]' });
		}
		function renderPtNeed() {
			const el = q(container, 'pt-need');
			if (!el) return;
			// 段8: 帯の合計も同じ数字から出すので、ここで描き直す（継承固有・ヒントLv・ランクの ON/OFF の変更でも追随する）
			if (setBased) renderSetBar();
			const slot = q(container, 'pt-total-row');
			const hideIt = () => { el.hidden = true; el.innerHTML = ''; if (slot) slot.innerHTML = ''; };
			const st = factorPtState(currentTarget());
			if (!st) { hideIt(); return; }
			if (st.inp.status === 'loading') { hideIt(); return; }
			if (st.inp.status === 'failed') {
				el.hidden = false;
				el.innerHTML = '<p class="usd-roster-alert" data-usd-el="pt-need-error">Pt のデータを読み込めませんでした</p>';
				if (slot) slot.innerHTML = '';
				return;
			}
			if (setBased) { renderSetHead(el, st); return; }
			const ids = st.ids, rules = st.rules, F = st.F, r = st.r;
			if (!r.ok || (ids.length === 0 && r.roster.count === 0)) { hideIt(); return; }
			let h = '<div class="usd-ptneed-main">'
				+ '<span class="usd-ptneed-title">必要スキルPt</span>'
				+ '<span class="uma-badge uma-badge--accent" data-usd-el="pt-need-theory">理論値</span>'
				+ '<button type="button" class="uma-help-btn" data-usd-act="pt-need-help" data-usd-el="pt-need-help-btn"'
				+ ' aria-expanded="' + (ptNeedHelpOpen ? 'true' : 'false') + '" aria-label="理論値とは" title="理論値とは">?</button>'
				// 合計（段7d の追加・A）。広い幅では「スキルセット　□シナリオ因子 ?　□遺伝子 ?」の行の右（スロット）に、狭い幅（CSS の @media）では
				// この見出しの行の右端に出す。どちらも同じ内容で、CSS が片方だけ見せる（行は増やさない）
				+ ptTotalHtml(r, 'pt-total-head')
				// チップ: 継承固有 → ＋超優先 → ＋優先 → ＋通常（段7d の追加・A。それぞれそのランクのぶんだけ。本育成編成は含めない）。収まらないときはこの行だけ横に送る
				+ '<span class="usd-ptneed-chips">'
				+ '<span class="usd-ptneed-chip" data-usd-el="pt-need-uniq">継承固有：<strong>' + formatPtNumber(r.inheritedUniquePt) + '</strong> Pt</span>'
				+ r.cuts.map(c => '<span class="usd-ptneed-chip" data-usd-el="pt-need-' + c.tier + '" data-cum="' + c.total + '">＋' + esc(tierLabel(c.tier)) + '：<strong>' + formatPtNumber(c.own) + '</strong> Pt</span>').join('')
				+ '</span></div>';
			if (slot) slot.innerHTML = ptTotalHtml(r, 'pt-total-row');
			// 段7c の O の (4)：「（うち本育成 X）」の行は削除した（値の計算は変えていない）。補足文は（?）の中へ移した
			// （重なるスキル〔本育成と因子セットの両方〕が、本育成だけでは L が上限未満のとき、合計が「超優先だけ」より小さくなりうることの説明。出る条件は今のまま）
			h += '<p class="uma-help-box" data-usd-el="pt-need-help-box"' + (ptNeedHelpOpen ? '' : ' hidden') + '>理論値（各スキルを最大のヒントレベルで得た場合のスキルPt）'
				+ (r.roster.count > 0 && r.overlapRaisable > 0 ? '<span class="usd-ptneed-boxline" data-usd-el="pt-need-overlap">重なるスキルは、親から得ると、ヒントレベルが上がって安くなります。</span>' : '')
				+ '</p>';
			if (r.unpricedCount > 0) h += '<p class="usd-roster-note" data-usd-el="pt-need-unpriced">（Pt未収録' + r.unpricedCount + '種は含めていません）</p>';
			if (skillPtData.meta.stepUp === 'failed') h += '<p class="usd-roster-note" data-usd-el="pt-need-prev-error">前段のデータを読み込めませんでした</p>';
			h += '<label class="usd-ptneed-f"><span class="usd-roster-setlabel">親由来のレベル</span>'
				+ '<select class="uma-input usd-ptneed-select" data-usd-act="pt-parent-level" data-usd-el="pt-parent-level" aria-label="親由来のレベル">'
				+ parentHintLevelChoices(rules).map(lv => '<option value="' + lv + '"' + (lv === F ? ' selected' : '') + '>' + lv + '</option>').join('')
				+ '</select></label>';
			el.hidden = false;
			el.innerHTML = h;
			renderPanelPts();
		}

		/**
		 * ②の1行目（段8・D）：「X Pt/N種 ?」＋チップ4つ［継承固有］［＋超優先］［＋優先］［＋通常］。
		 * 超優先・優先・通常のチップは ON/OFF の切り替え（aria-pressed。既定は ON。OFF は薄く、X と N に入れない）。
		 * 641px 以上は「継承固有：720 Pt」、640px 以下は「継承固有 720」（CSS が「：」「Pt」と空白を出し分ける）。収まらなければチップの並びだけ横に送る
		 */
		function renderSetHead(el, st) {
			const r = st.r;
			if (!r || !r.ok) { el.hidden = true; el.innerHTML = ''; return; }
			const sum = setSummaryOf(currentTarget());
			const chipText = (label, n) => esc(label) + '<span class="usd-chip-sep">：</span><span class="usd-chip-sp"> </span><strong>' + formatPtNumber(n) + '</strong><span class="usd-chip-unit"> Pt</span>';
			const taken = sum ? sum.takenIds.length : 0;
			el.innerHTML = '<div class="usd-sethead" data-usd-el="set-head">'
				+ '<span class="usd-sethead-sum" data-usd-el="factor-sum"><strong data-usd-el="factor-pt">' + formatPtNumber(sum ? sum.factorPt : 0) + '</strong> Pt/<strong data-usd-el="factor-count">' + (sum ? sum.factorKinds : 0) + '</strong>種</span>'
				+ '<button type="button" class="uma-help-btn usd-sethead-help' + (taken > 0 ? ' usd-help-dot' : '') + '" data-usd-act="pt-need-help" data-usd-el="pt-need-help-btn" data-taken="' + taken + '"'
				+ ' aria-haspopup="dialog" aria-expanded="false" aria-label="②の Pt の説明' + (taken > 0 ? '（①で取得するスキルあり）' : '') + '" title="②の Pt の説明">?</button>'
				+ '<span class="usd-ptneed-chips usd-hscroll" data-usd-no-trim="1" data-usd-el="pt-chips">'
				+ '<span class="usd-ptneed-chip" data-usd-el="pt-need-uniq" data-pt="' + r.inheritedUniquePt + '">' + chipText('継承固有', r.inheritedUniquePt) + '</span>'
				+ r.cuts.map(c => {
					const on = sum ? sum.ranks[c.tier] : true;
					return '<button type="button" class="usd-ptneed-chip usd-ptneed-chip--rank' + (on ? '' : ' usd-ptneed-chip--off') + '" data-usd-act="pt-rank" data-tier="' + c.tier + '"'
						+ ' data-usd-el="pt-need-' + c.tier + '" data-cum="' + c.total + '" data-pt="' + c.own + '" aria-pressed="' + (on ? 'true' : 'false') + '"'
						+ ' title="' + esc(tierLabel(c.tier) + 'を数える（押すと切り替え）') + '">' + chipText('＋' + tierLabel(c.tier), c.own) + '</button>';
				}).join('')
				+ '</span></div>';
			el.hidden = false;
			renderPanelPts();
			scanEntryRows();
		}
		/** ②の「?」の小窓（段8・D）。理論値の説明・式・数えていないもの */
		function fillFactorHelp(body) {
			const target = currentTarget();
			const sum = setSummaryOf(target);
			const line = (text, el) => { const p = infoEl('p', '', text); p.setAttribute('data-usd-el', el); body.appendChild(p); };
			if (!sum) { body.appendChild(infoEl('p', 'usd-info-desc--pending', 'Pt のデータを読み込めませんでした')); return; }
			const r = sum.st.r, fmt = formatPtNumber;
			line('理論値です。親から得るスキルは、共通スキルのヒントLv（いま ' + sum.st.F + '）で得たものとして計算しています。', 'factor-help-theory');
			const parts = ['継承固有 ' + fmt(r.inheritedUniquePt)].concat(r.cuts.filter(c => sum.ranks[c.tier]).map(c => tierLabel(c.tier) + ' ' + fmt(c.own)));
			const offs = r.cuts.filter(c => !sum.ranks[c.tier]).map(c => tierLabel(c.tier));
			line('② ＝ ' + parts.join(' ＋ ') + (offs.length ? '（' + offs.join('・') + 'は数えない）' : ''), 'factor-help-formula');
			if (r.unpricedCount > 0) line('Pt 未収録のスキル ' + r.unpricedCount + '種は数えていません', 'factor-help-unpriced');
			if (sum.takenIds.length > 0) line('①で取得するスキル ' + sum.takenIds.length + '種は数えていません', 'factor-help-taken');
			if (skillPtData.meta.stepUp === 'failed') line('前段のデータを読み込めませんでした', 'factor-help-prev-error');
		}
		/** ランクの ON/OFF を切り替えて保存する（段8・D。template.ptRanks／下書きの ptRanks。触ったときだけ書く。「元に戻す」には積まない） */
		function setPtRank(tier) {
			const target = currentTarget();
			const cur = ptRanksOf(target);
			if (cur[tier] === undefined) return;
			cur[tier] = !cur[tier];
			const v = { high: cur[1], mid: cur[2], low: cur[3] };
			if (target.kind === 'template') {
				target.obj.ptRanks = v;
				target.obj.updatedAt = nowIso();
				const data = ensureUserData();
				if (!(data.schemaVersion >= 6)) data.schemaVersion = 6;
				saveUserData();
			} else {
				draftScope = persistDraft(draftScope.skillIds, draftScope.name, undefined, undefined, undefined, undefined, undefined, v);
			}
			renderPtNeed();
		}

		// 親由来のレベル F を替えて保存する（因子セット＝選んでいるセット側に持つ）。「元に戻す」には積まない（選び直せば戻る設定）
		function setParentHintLevel(level) {
			const rules = skillPtData.rules;
			if (!rules || !(parentHintLevelChoices(rules).indexOf(level) !== -1)) return;
			if (!writeParentHintLevel(currentTarget(), level)) return;
			renderPtNeed();
		}

		// 分類の切り替え（超優先／優先／通常）と合計（C-57 の (7)）
		// 種数（段7d の ⑫）。金スキルと前段の白スキルの組は1種で、**組は金の分類の側で数える**（白スキルの分類では数えない）
		function kindCountsOf(ids, tiers) {
			const paired = pairedWhiteIds(ids);
			const byTier = {};
			TIERS.forEach(t => { byTier[t.id] = 0; });
			let total = 0;
			ids.forEach(id => { if (paired.has(id)) return; byTier[tierOf(tiers, id)]++; total++; });
			return { byTier: byTier, total: total };
		}
		function renderTierRow() {
			const ids = editingSkillIds();
			const tiers = tiersOf(currentTarget());
			const kinds = kindCountsOf(ids, tiers);
			const counts = kinds.byTier;
			q(container, 'tier-row').innerHTML =
				'<div class="usd-tier-tabs" role="tablist" aria-label="スキルセットの分類">' +
				TIERS.map(t => '<button type="button" role="tab" class="uma-pill usd-tier-tab' + (t.id === currentTier ? ' active' : '') + '"'
					+ ' data-usd-act="tier-tab" data-tier="' + t.id + '" aria-selected="' + (t.id === currentTier ? 'true' : 'false') + '">'
					+ esc(t.label) + '<span class="usd-tier-count" data-usd-el="tier-count-' + t.id + '">' + counts[t.id] + '</span></button>').join('') +
				'</div>' +
				// 段8・D（setBased）: 「設定数」は無く、右端に「再分類」「削除」（「追加済みスキル（N種）」の行から移した）
				(setBased
					? '<span class="usd-tier-ops">'
						+ '<button type="button" class="usd-mode-btn" data-usd-act="mode-reclass" data-usd-el="mode-reclass" aria-pressed="false">再分類</button>'
						+ '<button type="button" class="usd-mode-btn" data-usd-act="mode-delete" data-usd-el="mode-delete" aria-pressed="false">削除</button></span>'
					: '<span class="usd-tier-total">設定数 <span data-usd-el="tier-total">' + kinds.total + '</span></span>');
			renderPtNeed();
		}

		/* 「リセット」の押せる／押せない（73セッション目に条件を広げた）。
		 * **消すものが1つも無いときだけ押せない。** スキルが0種でも、
		 * B・C（シナリオ因子・遺伝子）のどちらかにチェックが入っていれば消すものは在る。
		 * **`renderModes()` からだけでなく `setScope()` からも呼ぶ** ――
		 * チェックの付け外しでは `renderSelectedList()` が走らないので、
		 * ここを呼ばないと「チェックを入れたのに押せないまま」になる。
		 * B・C を持たない画面（Deck 単体ページ）では `scopesOf()` が常に空なので、条件は従来どおり。 */
		function renderResetBtn() {
			const clear = q(container, 'clear-skills');
			if (!clear) return;
			const n = (editingSkillIds() || []).length;
			const scopes = Object.keys(scopesOf(currentTarget())).length;
			clear.disabled = n === 0 && scopes === 0;
		}

		// モードのボタンの押した状態（C-57 の (9)）。「すべて外す」は削除モードのときだけ出す
		function renderModes(count) {
			const reclass = q(container, 'mode-reclass');
			const del = q(container, 'mode-delete');
			reclass.setAttribute('aria-pressed', mode === 'reclass' ? 'true' : 'false');
			del.setAttribute('aria-pressed', mode === 'delete' ? 'true' : 'false');
			reclass.disabled = count === 0;
			del.disabled = count === 0;
			renderResetBtn();
			/* 「緑スキル」の入口の件数バッジ（72セッション目・段9 の追加 → やり直しで括弧書きから
			   **タブと同じ数字バッジ**へ変えた。括弧書きはボタンを横に広げすぎた）。
			   **数えるのは追加済みスキルのうちパッシブであるもの**で、`count`（全体の種数）ではない。
			   **0種のときは出さない。** */
			const passiveAdded = q(container, 'passive-added');
			if (passiveAdded) {
				const n = countPassiveSkills(editingSkillIds());
				passiveAdded.hidden = n === 0;
				passiveAdded.textContent = String(n);
			}
		}

		function renderSelectedList() {
			const ids = editingSkillIds();
			const target = currentTarget();
			const tiers = tiersOf(target);
			const el = q(container, 'selected-list');
			// 件数はセット全体（分類ごとの件数は分類の切り替えの側に出す）。段8（setBased）はこの行が無い
			const selCount = q(container, 'selected-count');
			if (selCount) selCount.textContent = String(kindCountsOf(ids, tiers).total);
			if (ids.length === 0 && mode) mode = null;
			renderTierRow();
			renderModes(ids.length);
			if (ids.length === 0) {
				el.innerHTML = '<p class="text-xs text-slate-400" style="grid-column: 1 / -1;">まだスキルが選択されていません。</p>';
				return;
			}
			// いま開いている分類のぶんだけ並べる（順序はセットの中の順のまま）
			const shown = ids.filter(id => tierOf(tiers, id) === currentTier);
			if (shown.length === 0) {
				el.innerHTML = '<p class="text-xs text-slate-400" style="grid-column: 1 / -1;">「' + esc(tierLabel(currentTier)) + '」にはまだスキルがありません。</p>';
				return;
			}
			el.innerHTML = shown.map(id => {
				const tier = tierOf(tiers, id);
				let ops = '';
				if (mode === 'delete') {
					ops = '<button type="button" class="usd-panel-del" data-usd-act="template-skill-remove" data-skill-id="' + esc(id) + '" aria-label="削除"><i data-lucide="x" class="w-3 h-3"></i></button>';
				} else if (mode === 'reclass') {
					// 移動先＝いま開いている分類以外の2つ（文字は分類名）
					ops = TIERS.filter(t => t.id !== tier).map(t =>
						'<button type="button" class="usd-panel-move" data-usd-act="tier-move" data-skill-id="' + esc(id) + '" data-tier="' + t.id + '"'
						+ ' aria-label="「' + esc(getSkillName(id)) + '」を' + esc(t.label) + 'へ">' + esc(t.label) + '</button>').join('');
				}
				return '<div class="usd-panel' + (mode === 'reclass' ? ' usd-panel--reclass' : '') + '" data-skill-id="' + esc(id) + '">'
					+ tierMarkHtml(tier)
					+ (grouped
						? '<span class="usd-panel-name usd-panel-name--scroll usd-hscroll" data-usd-no-trim="1"><button type="button" class="usd-panel-namebtn" data-usd-info="' + esc(id) + '">' + esc(getSkillName(id)) + '</button>'
							+ '<span class="usd-panel-pt" data-usd-el="panel-pt" data-skill-id="' + esc(id) + '"></span></span>'
						: '<span class="usd-panel-name">' + esc(getSkillName(id)) + '</span>')
					+ (ops ? '<span class="usd-panel-ops">' + ops + '</span>' : '')
					+ '</div>';
			}).join('');
			// 周回因子セット（special の②）の行は、①と同じく名前（button）を押すと説明の小窓（段7d の ⑬。ⓘ と長押しはやめた）。基礎Pt だけ（「いまの設定」は本育成の行にだけ）
			if (grouped) { attachSkillInfoIn(el, (id) => ({ skillId: id, trigger: 'self' })); renderPanelPts(); }
			refreshIcons();
		}

		function selectTier(tier) {
			if (!TIERS.some(t => t.id === tier)) return;
			currentTier = tier;
			renderSelectedList();
		}

		function setMode(next) {
			// 同時には ON にならない（同じものをもう一度押すと OFF）
			mode = mode === next ? null : next;
			renderSelectedList();
		}

		/**
		 * 再分類（C-57 の (9)）。1件を移動先の分類へ移す。移動は「元に戻す」に積む
		 * （C-56 では積まない案だったが、まとめて動かすと戻せないと痛い、というおいもさんの判断で積むことにした）。
		 */
		function moveSkillTier(skillId, toTier) {
			if (!TIERS.some(t => t.id === toTier)) return;
			const target = currentTarget();
			const ids = skillIdsOf(target);
			if (!ids || ids.indexOf(skillId) === -1) return;
			const fromTier = tierOf(tiersOf(target), skillId);
			if (fromTier === toTier) return;
			const name = getSkillName(skillId);
			pushUndo({
				scope: 'list',
				doneLabel: '「' + name + '」を' + tierLabel(toTier) + 'へ移しました',
				undoneLabel: '「' + name + '」を' + tierLabel(fromTier) + 'に戻しました',
				// 見るのは「そのスキルの分類」だけ
				probe: () => String(tierOf(tiersOf(target), skillId)),
				apply: () => {
					if (!writeTier(target, skillId, fromTier)) return false;
					afterEditingSkillsChanged(target);
					return true;
				}
			});
			if (!writeTier(target, skillId, toTier)) return;
			afterEditingSkillsChanged(target);
		}

		/* ---------- タブの選択・名前・保存・複製・削除（C-53） ---------- */
		/**
		 * 名前欄に入れたまま「保存」を押していない名前を、タブを離れる前に反映する。
		 * 「タブを切り替えたら未保存の変更が捨てられる」のは望ましくない（おいもさんの判断）。
		 * ドラフトの名前は入力のたびにドラフトごと覚えているので、ここではテンプレートだけ。
		 */
		function flushPendingName() {
			if (!nameInput) return;   // grouped は名前の入力欄が無い（✓ で確定するまで保存しない）
			const target = currentTarget();
			if (target.kind !== 'template') return;
			const name = nameInput.value;
			if (name === (target.obj.name || '')) return;
			target.obj.name = name;
			target.obj.updatedAt = nowIso();
			saveUserData();
			fireChange();
		}

		function selectTab(id) {
			flushPendingName();
			nameEdit = null;
			limitNotice = false;
			if (id === DRAFT_SELECTION_ID || !id) {
				selectedId = draftScope.skillIds.length > 0 ? DRAFT_SELECTION_ID : null;
			} else {
				selectedId = ensureUserData().templates.some(t => t.templateId === id) ? id : null;
			}
			closePicker();
			render();
			fireSelection();
		}

		function onNameInput() {
			const target = currentTarget();
			if (target.kind === 'draft') {
				// ドラフトの名前は保存まで覚えておく（保存先はドラフトと同じ＝userData の外）
				draftScope = persistDraft(draftScope.skillIds, nameInput.value, draftScope.tiers);
			}
			// テンプレートの名前は「保存」（またはタブを離れるとき）に反映する
		}

		// tiers（分類。C-57）と scopes（節の ON/OFF。C-2a）は持っているときだけ残す（空なら書かない）。
		// **渡されなければ今のものを引き継ぐ**（片方を書き換えるときにもう片方を消さないため）
		function persistDraft(skillIds, name, tiers, scopes, parentHintLevel, baseRosterId, inheritedUnique, ptRanks) {
			const nextRanks = ptRanks !== undefined ? ptRanks : draftScope.ptRanks;   // ランクの ON/OFF（段8・D）。null で消す
			const nextTiers = tiers !== undefined ? tiers : draftScope.tiers;
			const nextScopes = scopes !== undefined ? scopes : draftScope.scopes;
			const nextParent = parentHintLevel !== undefined ? parentHintLevel : draftScope.parentHintLevel;   // null で消す（段5）
			const nextBase = baseRosterId !== undefined ? baseRosterId : draftScope.baseRosterId;   // null で消す（段7b の ⑬）
			const nextUniq = inheritedUnique !== undefined ? inheritedUnique : draftScope.inheritedUnique;   // null で消す（段7d の ⑪）
			if (draftScopeKey) return saveDraftScope(draftScopeKey, skillIds, name, nextTiers, setLabel, nextScopes, nextParent, nextBase, nextUniq, nextRanks);
			const out = { skillIds: (skillIds || []).slice(), name: typeof name === 'string' ? name : '', updatedAt: nowIso() };
			if (nextTiers && typeof nextTiers === 'object' && Object.keys(nextTiers).length > 0) out.tiers = Object.assign({}, nextTiers);
			if (nextScopes && typeof nextScopes === 'object' && Object.keys(nextScopes).length > 0) out.scopes = Object.assign({}, nextScopes);
			if (typeof nextParent === 'number') out.parentHintLevel = nextParent;
			if (typeof nextBase === 'string' && nextBase) out.baseRosterId = nextBase;
			if (nextUniq && typeof nextUniq === 'object' && Object.keys(nextUniq).length > 0) out.inheritedUnique = Object.assign({}, nextUniq);
			if (nextRanks && typeof nextRanks === 'object') out.ptRanks = Object.assign({}, nextRanks);
			return out;
		}

		/**
		 * 「保存」。テンプレートなら名前を反映するだけ（スキルは触った時点で保存済み）。
		 * ドラフトなら、名前を付けてテンプレートを作り、そのタブへ移る（ドラフトは空になる＝二重管理を避ける）。
		 */
		/* ---- 名前つきのタブの操作（段7b の ⑫。special の②だけ） ---- */
		function startNameEdit() {
			const target = currentTarget();
			// 保存済みは今の名前から、「＋新規」は空から
			nameEdit = { value: target.kind === 'template' ? (target.obj.name || '') : '' };
			render();
		}
		/** ✓。保存済みは名前を変えるだけ。「＋新規」は保存済みの因子周回として保存し、そのタブを選ぶ（「＋新規」の中身は残す）。 */
		function commitNameEdit() {
			const input = (setBarEl && q(setBarEl, 'name')) || q(container, 'name');
			const value = input ? input.value : (nameEdit ? nameEdit.value : '');
			const target = currentTarget();
			if (target.kind === 'template') {
				target.obj.name = value;
				target.obj.updatedAt = nowIso();
				// 段8（setBased）: 付いている編成の名前も同じにする
				if (setBased) { const r = setRosterOfTemplate(target.obj); if (r) { r.name = String(value || ''); r.updatedAt = nowIso(); } }
				saveUserData();
				nameEdit = null;
				render();
				fireSelection();
				fireChange();
				return;
			}
			if (!String(value || '').trim()) return;
			saveCurrent(value);
		}
		/** ×。「＋新規」は中身を空に戻し、保存済みはその因子周回を削除する。確認の小窓は共有の openConfirmModal */
		function askResetTab() {
			const isDelete = !!currentTemplateId();
			if (setBased) {
				// 段8: セットの削除は①②の両方を消す。「＋新規」は中身（①②の下書き）を空にする
				const t = currentTarget();
				openConfirmModal({
					ariaLabel: isDelete ? 'セットの削除' : '＋新規を空にする',
					text: isDelete ? 'セット「' + (t.kind === 'template' ? (t.obj.name || '（名称未設定）') : '') + '」を削除しますか？' : '＋新規の中身を空にしますか？',
					onOk: () => { nameEdit = null; if (isDelete) deleteTemplate(currentTemplateId()); else resetDraft(); }
				});
				return;
			}
			openConfirmModal({
				ariaLabel: tabNoun + 'のリセット',
				text: isDelete ? tabNoun + 'をリセットしますか？ この' + tabNoun + 'は削除され、タブが1つ減ります。' : tabNoun + 'をリセットしますか？',
				onOk: () => {
					nameEdit = null;
					if (isDelete) deleteTemplate(currentTemplateId()); else resetDraft();
				}
			});
		}
		function resetDraft() {
			const prev = draftScope.skillIds.slice();
			draftScope = persistDraft([], '', {}, {}, null, null, null, null);
			// 段8（setBased）: 「＋新規」は①の下書きと対なので、①も空に戻す（①を開き直させる）
			if (setBased && draftScopeKey) { clearDraftRoster(draftScopeKey); setHubPublish('', true); }
			picker.excludeIds = picker.excludeIds.filter(id => prev.indexOf(id) === -1);
			selectedId = null;
			render();
			renderPickerResults();
			renderPasteReport();
			fireSelection();
			fireChange();
			toast(tabNoun + 'をリセットしました');
		}

		function saveCurrent(nameValue) {
			const target = currentTarget();
			const data = ensureUserData();
			const nameToSave = nameValue !== undefined ? nameValue : (nameInput ? nameInput.value : '');
			if (target.kind === 'template') {
				target.obj.name = nameToSave;
				target.obj.updatedAt = nowIso();
				saveUserData();
				render();
				fireSelection();
				fireChange();
				toast(setLabel + 'を保存しました');
				return;
			}
			// 段8（setBased）: ①だけのセットもあるので、②のスキルが0件でも保存できる
			if (draftScope.skillIds.length === 0 && !setBased) { toast('スキルを1件以上選んでください'); return; }
			if (data.templates.length >= TEMPLATE_LIMIT) {
				toast(setLabel + 'は最大' + TEMPLATE_LIMIT + '件までです。不要なものを削除してください');
				return;
			}
			const t = { templateId: uid('tpl'), name: nameToSave, skillIds: draftScope.skillIds.slice(), createdAt: nowIso(), updatedAt: nowIso() };
			// ドラフトの分類（C-57）と節の ON/OFF（C-2a）もテンプレートへ写す
			// （「優先」だけなら tiers は持たない／全部 OFF なら scopes は持たない）
			setTemplateTiers(t, draftScope.tiers || {});
			setTemplateScopes(t, draftScope.scopes || {});
			if (typeof draftScope.parentHintLevel === 'number') t.parentHintLevel = draftScope.parentHintLevel;   // 親由来のレベル F（段5）
			if (draftScope.inheritedUnique && typeof draftScope.inheritedUnique === 'object') t.inheritedUnique = Object.assign({}, draftScope.inheritedUnique);   // 継承固有（段7d の ⑪）
			if (draftScope.ptRanks && typeof draftScope.ptRanks === 'object') t.ptRanks = Object.assign({}, draftScope.ptRanks);   // ランクの ON/OFF（段8・D）
			if (setBased) {
				// 段8: 下書きの①（編成）に中身があれば、写し（新しい rosterId・名前はセット名）を作ってこのセットに付ける。下書きの①はそのまま残す
				const dr = draftScopeKey ? loadDraftRoster(draftScopeKey) : null;
				if (rosterHasContent(dr)) {
					const r = Object.assign(emptyRoster(), snapshot(dr));
					r.rosterId = uid('roster');
					r.name = String(nameToSave || '');
					r.createdAt = r.updatedAt = nowIso();
					data.rosters = data.rosters || [];
					data.rosters.push(r);
					t.baseRosterId = r.rosterId;
					if (!(data.schemaVersion >= 6)) data.schemaVersion = 6;
				}
			} else if (typeof draftScope.baseRosterId === 'string' && draftScope.baseRosterId) t.baseRosterId = draftScope.baseRosterId;   // 「本育成編成」の対象（段7b の ⑬）
			data.templates.push(t);
			saveUserData();
			if (grouped) {
				// 段7b の ②：「＋新規」の中身は空に戻さない。保存した因子周回は別のもの（写し）で、
				// 空になるのは入力した名前だけ。空にするかどうかは、利用者が「＋新規」の × で決める
				draftScope = persistDraft(draftScope.skillIds, '', draftScope.tiers);
			} else {
				// 中身はテンプレートへ移ったので、ドラフトは空にする（二重管理を避ける）。
				// **{} を渡して明示的に消す** ―― persistDraft は undefined を「今のものを引き継ぐ」と読む
				draftScope = persistDraft([], '', {}, {}, null, null, null, null);
			}
			nameEdit = null;
			selectedId = t.templateId;
			render();
			fireSelection();
			fireChange();
			toast(setLabel + 'を保存しました');
		}

		/* ---------- スキルの追加（3つの入口） ---------- */
		// 3つの入口はどれも同じ「選んだIDを編集中のセットへ足す」処理へ合流する。
		function openEditorPicker(mode) {
			openPicker(mode, editingSkillIds(), pickerSinkFor(currentTarget(), 'list'));
		}

		// ピッカーの受け皿（openPicker の第3引数。{scope, probe, add, remove}）。
		// 3つの入口と、「スキルセット画面のスクショから読み取る」で共通。
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
					// 足したものは、いま開いている分類に入れる（C-57 の (7)。「優先」なら tiers には書かない＝既定）
					const nextTiers = tiersWithout(tiersOf(target), []);
					fresh.forEach(id => { if (currentTier !== TIER_DEFAULT) nextTiers[id] = currentTier; else delete nextTiers[id]; });
					if (!writeSkillIds(target, cur.concat(fresh), nextTiers)) return [];
					afterEditorPickerAdd(target);
					return fresh;
				},
				remove: (ids) => {
					const cur = skillIdsOf(target);
					if (!cur) return false;
					if (!writeSkillIds(target, cur.filter(id => ids.indexOf(id) === -1), tiersWithout(tiersOf(target), ids))) return false;
					// 一覧から消えていたぶんを戻す（モーダルが開いたままでも数が合うように）
					picker.excludeIds = picker.excludeIds.filter(id => ids.indexOf(id) === -1);
					renderPickerResults();
					renderPasteReport();
					afterEditorPickerAdd(target);
					return true;
				}
			};
		}

		/**
		 * 外で照合を済ませた行（スキルセットOCR。コミット4）を、いま扱っている対象スキルセットへ足すモーダルを開く。
		 * 対象は選択中のもの（テンプレート／ドラフト）。足した分は Undo に積める（受け皿は入口と同じ pickerSinkFor）。
		 */
		function openSkillRowsPickerForSelection(rows, summary, options) {
			const target = currentTarget();
			openSkillRowsPicker(skillIdsOf(target) || [], pickerSinkFor(target, 'list'), rows, summary, options);
			return true;
		}

		// スキルを足した／その追加を取り消したあとの描画と通知。
		function afterEditorPickerAdd(target) {
			// ドラフトに中身ができたら、そのまま使えるよう選択状態にする
			if (target.kind === 'draft' && draftScope.skillIds.length > 0 && selectedId !== DRAFT_SELECTION_ID) {
				selectedId = DRAFT_SELECTION_ID;
				render();
				fireSelection();
			} else {
				render();
				if (isSelected(target)) fireSelection();
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
		 * 編集中のセットの中身をリセットする（C-3 ＋ **73セッション目に消す範囲を広げた**）。
		 *
		 * **消すのは 追加済みスキル・その分類・B と C（節の ON/OFF）。**
		 * **名前には触らない** ―― ドラフトのタブ名も、名前の入力欄の中身も、保存済みセットの名前も残す。
		 * **「このタイトルのセットを作り直す」操作**という位置づけ（おいもさんの決定）。
		 *
		 * **C-69 の9節で決めた「消すのはスキルと分類だけ」は、この再設計で取り下げた。**
		 * あちらは「チェックはもう一度押せば戻せるから、消したいスキルのほうに限る」という判断だったが、
		 * **作り直すときにチェックだけ残るのは、残したかったのか消し忘れたのかが読めない。**
		 *
		 * ドラフトでもテンプレートでも**同じ動き**（見た目が同じなので、
		 * 片方だけ出来ないと「なぜここには無いのか」を考えさせることになる）。
		 * 破壊的な操作は確認ダイアログではなく「即実行＋元に戻す」で統一する方針に従う。
		 * **probe は「消す対象」をすべて含める**（名前は含めない。変わらないものを混ぜると、
		 * 正しく戻せても「戻っていない」と判定してしまう）。
		 */
		function clearEditingSkills() {
			const target = currentTarget();
			const ids = skillIdsOf(target);
			const prevScopes = snapshot(scopesOf(target));
			// **消すものが1つも無いときだけ何もしない。** スキルが0種でも、B・C のどちらかに
			// チェックが入っていれば消すものは在る（73セッション目に押せる条件を広げた）。
			if (!ids || (ids.length === 0 && Object.keys(prevScopes).length === 0)) return;
			const prev = snapshot(ids);
			const prevTiers = snapshot(tiersOf(target));   // 分類（C-57）も一緒に戻す
			// 状態を変える前に積む。積んだ時点の probe() が「戻るべき姿」になる。
			pushUndo({
				scope: 'list',
				/* 文面は**何を消したかを数えずに言う** ―― 消す対象がスキル・分類・B・C と
				   複数の種類にまたがるので、「N種」だけを出すと B・C が消えたことが伝わらない。
				   **「名前はそのままです」を添える**のは、名前まで消えたと読まれないため
				   （この操作でいちばん誤解されやすいのがそこ）。 */
				doneLabel: '中身をリセットしました（名前はそのままです）',
				undoneLabel: 'リセットを取り消しました',
				probe: () => probeOf(skillIdsOf(target)) + '|' + JSON.stringify(scopesOf(target)),
				apply: () => {
					if (!writeSkillIds(target, snapshot(prev), snapshot(prevTiers))) return false;
					if (!writeScopes(target, snapshot(prevScopes))) return false;
					picker.excludeIds = picker.excludeIds.concat(prev.filter(id => picker.excludeIds.indexOf(id) === -1));
					afterEditingSkillsChanged(target);
					return true;
				}
			});
			if (!writeSkillIds(target, [], tiersWithout(prevTiers, prev))) return;
			writeScopes(target, {});
			picker.excludeIds = picker.excludeIds.filter(id => prev.indexOf(id) === -1);
			afterEditingSkillsChanged(target);
		}

		function removeSkillFromEditing(skillId) {
			const target = currentTarget();
			const ids = skillIdsOf(target);
			const idx = ids ? ids.indexOf(skillId) : -1;
			if (idx === -1) return;
			const name = getSkillName(skillId);
			const prevTier = tierOf(tiersOf(target), skillId);   // 分類（C-57）も一緒に戻す
			pushUndo({
				scope: 'list',
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
					const nextTiers = tiersWithout(tiersOf(target), [skillId]);
					if (prevTier !== TIER_DEFAULT) nextTiers[skillId] = prevTier;
					if (!writeSkillIds(target, next, nextTiers)) return false;
					if (picker.excludeIds.indexOf(skillId) === -1) picker.excludeIds.push(skillId);
					afterEditingSkillsChanged(target);
					return true;
				}
			});
			const next = ids.slice();
			next.splice(idx, 1);
			if (!writeSkillIds(target, next, tiersWithout(tiersOf(target), [skillId]))) return;
			picker.excludeIds = picker.excludeIds.filter(id => id !== skillId);
			afterEditingSkillsChanged(target);
		}

		// 対象（ドラフト／テンプレート）の「今の」スキルID一覧。
		// ドラフトは保存のたびに draftScope ごと差し替わるので、捕まえておいた配列ではなく
		// 毎回ここで引き直す。テンプレートはIDで引き直す（読み直しで実体が替わっても届くように）。
		function skillIdsOf(target) {
			if (!target) return null;
			if (target.kind === 'draft') return draftScope.skillIds;
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			return t ? t.skillIds : null;
		}

		// 対象の「今の」分類（tiers。C-57）。持っていなければ空（＝全部「優先」）。返すのは写しではなく実体
		function tiersOf(target) {
			if (!target) return {};
			if (target.kind === 'draft') return draftScope.tiers || {};
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			return (t && t.tiers) || {};
		}
		/**
		 * 対象の「今の」節の ON/OFF（scopes。C-2a）。持っていなければ空（＝全部 OFF）。
		 * **tiers とまったく同じ流儀**: 無い古いデータに補わない／既定（全部 OFF）なら項目ごと持たない。
		 */
		function scopesOf(target) {
			if (!target) return {};
			if (target.kind === 'draft') return draftScope.scopes || {};
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			return (t && t.scopes) || {};
		}
		/**
		 * 対象の「今の」親由来のレベル F（段5。周回因子セットの必要Ptで使う）。持っていなければ undefined（＝使うところで既定として扱う）。
		 * **tiers・scopes と同じ流儀**: 無い古いデータに補わない／schemaVersion は上げない（無いのが既定の姿）。
		 */
		function parentHintLevelOf(target) {
			if (!target) return undefined;
			if (target.kind === 'draft') return draftScope.parentHintLevel;
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			return t ? t.parentHintLevel : undefined;
		}
		// 継承固有（段7d の ⑪）。持っていなければ undefined（＝使うところで既定として扱う）。tiers・scopes と同じ流儀
		function inheritedUniqueOf(target) {
			if (!target) return undefined;
			if (target.kind === 'draft') return draftScope.inheritedUnique;
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			return t ? t.inheritedUnique : undefined;
		}
		// value は保存する形（既定と同じキーを含まない）か null（項目ごと消す）
		function writeInheritedUnique(target, value) {
			if (target.kind === 'draft') {
				draftScope = persistDraft(draftScope.skillIds, draftScope.name, draftScope.tiers, draftScope.scopes, undefined, undefined, value);
				return true;
			}
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			if (!t) return false;
			if (value) t.inheritedUnique = value; else delete t.inheritedUnique;
			t.updatedAt = nowIso();
			saveUserData();
			return true;
		}
		// 種類かヒントLv を替えて保存する。「元に戻す」には積まない（選び直せば戻る設定）。選んだセレクトを作り直さない（フォーカスを保つ）ので、必要スキルPt だけ描き直す
		function setInheritedUnique(key, value) {
			const target = currentTarget();
			const cur = resolveInheritedUnique(inheritedUniqueOf(target), skillPtData.rules);
			cur[key] = value;
			if (!writeInheritedUnique(target, storableInheritedUnique(resolveInheritedUnique(cur, skillPtData.rules)))) return;
			renderPtNeed();
		}
		function writeParentHintLevel(target, level) {
			if (target.kind === 'draft') {
				draftScope = persistDraft(draftScope.skillIds, draftScope.name, draftScope.tiers, draftScope.scopes, level);
				return true;
			}
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			if (!t) return false;
			t.parentHintLevel = level;
			t.updatedAt = nowIso();
			saveUserData();
			return true;
		}
		// この画面が知っている節のうち、ON のものだけを残す（OFF は書かない＝全部 OFF なら項目ごと消える）
		function cleanScopes(scopes) {
			const out = {};
			extraScopes.forEach(s => { if (scopes && scopes[s.key] === true) out[s.key] = true; });
			return out;
		}
		function writeScopes(target, scopes) {
			const clean = cleanScopes(scopes);
			if (target.kind === 'draft') {
				draftScope = persistDraft(draftScope.skillIds, draftScope.name, draftScope.tiers, clean);
				return true;
			}
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			if (!t) return false;
			setTemplateScopes(t, clean);
			t.updatedAt = nowIso();
			saveUserData();
			return true;
		}
		// tiers の写しから、渡した id の項目を除いたもの（外したスキルの分類を残さない）
		function tiersWithout(tiers, ids) {
			const out = Object.assign({}, tiers || {});
			(ids || []).forEach(id => { delete out[id]; });
			return out;
		}
		// 対象のスキルID一覧を、保存先まで書き換える。**テンプレートは触った時点で保存**（C-53。元に戻せる）。
		// tiers（分類）を渡したときはそれも書く。**渡さなければ tiers には触らない**（tiers を持たないデータに
		// 空の tiers を書き足さない＝開いて触っただけでは保存データの姿が変わらない。C-51 の知見）。
		function writeSkillIds(target, ids, tiers) {
			if (target.kind === 'draft') {
				draftScope = persistDraft(ids, draftScope.name, tiers !== undefined ? tiers : draftScope.tiers);
				return true;
			}
			const t = ensureUserData().templates.find(x => x.templateId === target.obj.templateId);
			if (!t) return false;
			t.skillIds = ids.slice();
			if (tiers !== undefined) setTemplateTiers(t, tiers);
			t.updatedAt = nowIso();
			saveUserData();
			return true;
		}
		// テンプレートの tiers を書く。中身が空なら項目ごと消す（「優先」だけのセットは tiers を持たない＝旧データと同じ姿）。
		// 初めて tiers を書くとき、保存データの schemaVersion を 4 に上げる（形が増えたことの記録。C-57）
		function setTemplateTiers(t, tiers) {
			const clean = {};
			Object.keys(tiers || {}).forEach(id => { if (tiers[id] !== TIER_DEFAULT && TIERS.some(x => x.id === tiers[id])) clean[id] = tiers[id]; });
			if (Object.keys(clean).length === 0) { delete t.tiers; return; }
			t.tiers = clean;
			const data = ensureUserData();
			if (!(data.schemaVersion >= 4)) data.schemaVersion = 4;
		}
		// テンプレートの scopes を書く（C-2a）。setTemplateTiers とまったく同じ形。
		// 中身が空なら項目ごと消す（全部 OFF のセットは scopes を持たない＝旧データと同じ姿）。
		// 初めて scopes を書くとき、保存データの schemaVersion を 5 に上げる（形が増えたことの記録）
		function setTemplateScopes(t, scopes) {
			const clean = cleanScopes(scopes);
			if (Object.keys(clean).length === 0) { delete t.scopes; return; }
			t.scopes = clean;
			const data = ensureUserData();
			if (!(data.schemaVersion >= 5)) data.schemaVersion = 5;
		}
		// 1件の分類を書く（再分類。C-57 の (9)）
		function writeTier(target, skillId, tier) {
			const ids = skillIdsOf(target);
			if (!ids || ids.indexOf(skillId) === -1) return false;
			const next = tiersWithout(tiersOf(target), [skillId]);
			if (tier !== TIER_DEFAULT) next[skillId] = tier;
			return writeSkillIds(target, ids, next);
		}

		// 追加済みスキルが増減したあとの描画と通知（削除・全消し・元に戻す、で共通）。
		function afterEditingSkillsChanged(target) {
			render();
			renderPickerResults();
			renderPasteReport();
			if (isSelected(target)) fireSelection();
			fireChange();
		}

		function duplicateTemplate(templateId) {
			if (!templateId) return;
			const data = ensureUserData();
			if (data.templates.length >= TEMPLATE_LIMIT) { toast(setLabel + 'は最大' + TEMPLATE_LIMIT + '件までです'); return; }
			const t = data.templates.find(x => x.templateId === templateId);
			if (!t) return;
			flushPendingName();
			const copy = { templateId: uid('tpl'), name: t.name + '（コピー）', skillIds: t.skillIds.slice(), createdAt: nowIso(), updatedAt: nowIso() };
			if (t.tiers) copy.tiers = Object.assign({}, t.tiers);   // 分類（C-57）も写す
			if (t.scopes) copy.scopes = Object.assign({}, t.scopes); // 節の ON/OFF（C-2a）も写す
			if (typeof t.parentHintLevel === 'number') copy.parentHintLevel = t.parentHintLevel;   // 親由来のレベル F（段5）も写す
			if (t.inheritedUnique && typeof t.inheritedUnique === 'object') copy.inheritedUnique = Object.assign({}, t.inheritedUnique);   // 継承固有（段7d の ⑪）も写す
			if (typeof t.baseRosterId === 'string' && t.baseRosterId) copy.baseRosterId = t.baseRosterId;   // 「本育成編成」の対象（段7b の ⑬）も写す
			data.templates.push(copy);
			saveUserData();
			// 複製したものをそのまま選ぶ（続けて名前を直せるように）
			selectedId = copy.templateId;
			render();
			fireSelection();
			fireChange();
			toast('複製しました');
		}

		function deleteTemplate(templateId) {
			if (!templateId) return;
			const data = ensureUserData();
			const idx = data.templates.findIndex(x => x.templateId === templateId);
			if (idx === -1) return;
			const removed = snapshot(data.templates[idx]);
			const label = removed.name || '（名称未設定）';
			// 段8（setBased）: セットの削除は、付いている①の編成も一緒に消す（「元に戻す」で両方戻る）
			const removedRoster = setBased ? (setRosterOfTemplate(removed) ? snapshot(setRosterOfTemplate(removed)) : null) : null;
			pushUndo({
				scope: 'list',
				doneLabel: setLabel + '「' + label + '」を削除しました',
				undoneLabel: '削除した' + setLabel + '「' + label + '」を戻しました',
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
					if (removedRoster && !(d.rosters || []).some(x => x.rosterId === removedRoster.rosterId)) { d.rosters = d.rosters || []; d.rosters.push(snapshot(removedRoster)); }
					saveUserData();
					// 戻したものを選び直す
					selectedId = templateId;
					render();
					fireSelection();
					fireChange();
					return true;
				}
			});
			data.templates.splice(idx, 1);
			if (removedRoster) data.rosters = (data.rosters || []).filter(x => x.rosterId !== removedRoster.rosterId);
			saveUserData();
			// 消したあとは「＋ 新規」（ドラフト）へ
			selectedId = draftScope.skillIds.length > 0 ? DRAFT_SELECTION_ID : null;
			render();
			fireSelection();
			fireChange();
		}

		/* ---------- 選択 ---------- */
		function setSelectedId(id) {
			selectTab(id === DRAFT_SELECTION_ID ? DRAFT_SELECTION_ID : id);
		}

		function getSelection() {
			if (selectedId === DRAFT_SELECTION_ID && draftScope && draftScope.skillIds.length > 0) {
				// name は画面に出る表示名（「✓『◯◯』の○件を照合します」、OCR結果の受け渡し先の
				// 既定のシート名など）。タブと同じ呼び方にしておかないと、
				// 選んだものと表示されるものの名前が食い違って見える。
				// tiers（分類。C-57）は写しを渡す（無ければ空＝全部「優先」。呼び出し元は tierOf() で引く）
				// scopes（節の ON/OFF。C-2a）も写しを渡す（呼び出し元は scopes.<key> === true で見る）
				return { kind: 'draft', id: DRAFT_SELECTION_ID, name: draftScope.name || DRAFT_LABEL, skillIds: draftScope.skillIds.slice(), tiers: Object.assign({}, draftScope.tiers || {}), scopes: Object.assign({}, draftScope.scopes || {}) };
			}
			const t = ensureUserData().templates.find(x => x.templateId === selectedId);
			if (!t) return null;
			return { kind: 'template', id: t.templateId, name: t.name || '（名称未設定）', skillIds: t.skillIds.slice(), tiers: Object.assign({}, t.tiers || {}), scopes: Object.assign({}, t.scopes || {}) };
		}

		/**
		 * 選べるスキルセットの一覧（C-54 の (3)。編成パネルの「本育成スキルを除外する」で除外先を選ぶ）。
		 * 中身のあるドラフトが先頭、続けてテンプレート。返すのは { id, name, skillIds } の配列。
		 */
		function listSelections() {
			const out = [];
			if (draftScope && draftScope.skillIds.length > 0) {
				out.push({ id: DRAFT_SELECTION_ID, name: draftScope.name || DRAFT_LABEL, skillIds: draftScope.skillIds.slice() });
			}
			ensureUserData().templates.forEach(t => {
				out.push({ id: t.templateId, name: t.name || '（名称未設定）', skillIds: t.skillIds.slice() });
			});
			return out;
		}

		/**
		 * いま選んでいる対象スキルセットから、渡したIDを外す（C-51 の編成から使う）。
		 * 編集中かどうかに関係なく「選ばれているもの」に効かせる。返り値は外した件数。
		 */
		function removeSkillsFromSelection(ids) {
			const sel = getSelection();
			if (!sel) { toast(setLabel + 'を選んでください'); return 0; }
			const drop = new Set(ids || []);
			const target = sel.kind === 'draft'
				? { kind: 'draft' }
				: { kind: 'template', obj: { templateId: sel.id } };
			const before = skillIdsOf(target);
			if (!before) return 0;
			const after = before.filter(id => !drop.has(id));
			const n = before.length - after.length;
			if (n === 0) return 0;
			// 外すのは元に戻せない操作なので、他の破壊的な操作と同じく「即実行＋元に戻す」にする
			// （確認ダイアログは挟まない。C-51 の修正4）。状態を変える前に積む。
			const prev = snapshot(before);
			const prevTiers = snapshot(tiersOf(target));   // 分類（C-57）も一緒に戻す
			pushUndo({
				scope: 'list',
				doneLabel: '本育成スキル' + n + '種をスキルセットから外しました',
				undoneLabel: '外した' + n + '種をスキルセットに戻しました',
				probe: () => probeOf(skillIdsOf(target)),
				apply: () => {
					if (!writeSkillIds(target, snapshot(prev), snapshot(prevTiers))) return false;
					afterEditingSkillsChanged(target);
					return true;
				}
			});
			if (!writeSkillIds(target, after, tiersWithout(prevTiers, before.filter(id => drop.has(id))))) return 0;
			afterEditingSkillsChanged(target);
			return n;
		}

		render();

		return {
			render: render,
			removeSkillsFromSelection: removeSkillsFromSelection,
			listSelections: listSelections,
			// 後方互換: 別画面の編集ビューは無くなった（C-53）。openEditor はそのタブを選ぶ、closeEditor は描き直すだけ
			isEditing: function () { return false; },
			openEditor: function (templateId) { selectTab(templateId || DRAFT_SELECTION_ID); },
			closeEditor: function () { flushPendingName(); render(); },
			getSelection: getSelection,
			// 段8: 選んでいるセットの数字（①・②・合計・②の N）。出せないときは null
			getSetSummary: function () { return setBased ? setSummaryOf(currentTarget()) : null; },
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
	 *                              （作る手段は 2026-09-27 に廃止したが、保存済みのものがセットに入っていれば今も読まれる）
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
		// マスターの版（取得URLの ?v=）。検査が「JSON の masterVersion と揃っているか」を見る。
		MASTER_JSON_VERSION: MASTER_JSON_VERSION,
		// data/ の6ファイルの版（同上。正本は各 JSON の dataVersion）。
		DATA_JSON_VERSIONS: DATA_JSON_VERSIONS,
		TEMPLATE_LIMIT: TEMPLATE_LIMIT,
		RECORD_LIMIT: RECORD_LIMIT,
		STAR_MIN: STAR_MIN,
		STAR_MAX: STAR_MAX,
		MAX_ENABLED_CANDIDATES: MAX_ENABLED_CANDIDATES,
		TAG_AXES: TAG_AXES,
		DECK_TEXT_MATCH_MAX_DISTANCE: DECK_TEXT_MATCH_MAX_DISTANCE,
		DECK_TEXT_MATCH_MIN_LENGTH_FOR_FUZZY: DECK_TEXT_MATCH_MIN_LENGTH_FOR_FUZZY,
		DRAFT_SELECTION_ID: DRAFT_SELECTION_ID,

		// 設定
		configure: function (next) {
			config = Object.assign({}, config, next || {});
			// 段8（C-120）の移行で読み込まなかったぶんの知らせ（トーストが差し込まれてから1回だけ）
			if (next && typeof next.toast === 'function') { ensureUserData(); flushMigrationNotice(); }
		},

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
		// 追加カタログの1カテゴリの中身（{id, name} の配列）。**件数も名前もここから取る**
		// ―― 呼び出し元が「24種」「10種」のような数やスキル名を自前で持たないため（恒久ルール1）。
		getCatalogEntries: function (category) {
			return extraCatalog.filter(x => x.category === category).map(x => ({ id: x.id, name: x.name }));
		},
		getExtraCatalogSources: function () { return EXTRA_CATALOG_SOURCES.slice(); },
		/**
		 * 収録データから参照してよいスキルのカタログ（＝マスター445種の外にあるスキル）の
		 * **取得した生の doc**。読めていなければ null。
		 *
		 * **貼り付け用のテキストを組み立てる側は、必ずこちらを土台にすること。**
		 * `getExtraCatalog()` が返すのは core が正規化したあとの配列なので、それをもとに
		 * ファイルを組み立て直すと、**ファイル階層のキー（`nextSerial` / `note` など）が
		 * 丸ごと落ち、core が知らないエントリのキーも消える**。「1件足して貼ったら
		 * 既存の全件から説明文が消えていた」という類の事故になる（C-64 の3節）。
		 *
		 * カテゴリ名を呼び出し側に書かせないため、`isReferableSkillId()` と同じ判断を
		 * ここに置いてある（作業用ページはカテゴリ名を知らずに済む）。
		 */
		getReferableCatalogDoc: function () { return extraCatalogDocs[REFERABLE_CATALOG_CATEGORY] || null; },
		// 収録データ（育成ウマ娘・サポートカード・イベントスキル）。呼んだ画面だけが読む。
		loadTrainingSources: loadTrainingSources,
		getTrainingSources: function () { return trainingSources; },
		getTrainingMeta: function () { return trainingMeta; },
		formatEntryLabel: formatEntryLabel,
		eventStatusOf: eventStatusOf,
		getEventSkillsOf: getEventSkillsOf,
		getEventOccurrencesOf: getEventOccurrencesOf,
		characterEventStatusOf: characterEventStatusOf,
		getCharacterEventSkillsOf: getCharacterEventSkillsOf,
		getCharacterEventOccurrencesOf: getCharacterEventOccurrencesOf,
		// スキルPt（段1。画面は持たない。設計は skill-pt-calculation-step0.md）
		loadSkillPtData: loadSkillPtData,
		getSkillPtData: function () { return skillPtData; },
		isValidSkillPtRules: isValidSkillPtRules,
		computeSkillPt: computeSkillPt,
		sumHintLevel: sumHintLevel,
		hintDiscountPercentOf: hintDiscountPercentOf,
		statusPercentOf: statusPercentOf,
		umaHintLevelChoices: umaHintLevelChoices,
		buildSkillPtIndex: buildSkillPtIndex,
		buildStepUpIndex: buildStepUpIndex,
		// スキルの説明（段6）。名前の要素に ⓘ と長押しを付ける部品と、説明文の読み込み
		attachSkillInfo: attachSkillInfo,
		closeSkillInfo: closeSkillInfo,
		openPopover: openPopover,   // 共有の小窓（段7）
		ROSTER_LIMIT: ROSTER_LIMIT,
		ROSTER_FILTER_AXIS_KEYS: ROSTER_FILTER_AXIS_KEYS.slice(),
		loadSkillDescriptions: loadSkillDescriptions,
		SKILL_RARITY_LABELS: SKILL_RARITY_LABELS,
		computeRosterPt: computeRosterPt,
		resolveRosterPtSettings: resolveRosterPtSettings,
		computeFactorSetPt: computeFactorSetPt,
		countSkillKinds: countSkillKinds,
		resolveInheritedUnique: resolveInheritedUnique,
		INHERITED_UNIQUE_BASE_PT: INHERITED_UNIQUE_BASE_PT,
		onSkillPtLoaded: onSkillPtLoaded,
		resolveParentHintLevel: resolveParentHintLevel,
		parentHintLevelChoices: parentHintLevelChoices,
		charactersOfCard: charactersOfCard,
		// サポートカードの種類。データに type が入るまでは空配列を返す（C-51 の修正2）。
		listCardTypes: listCardTypes,
		cardTypeOf: cardTypeOf,
		isReferableSkillId: isReferableSkillId,
		/** 検索に出してよい拡張スキルの id（C-91）。検査が自分の名簿と突き合わせるために出す。 */
		getSearchableExtendedSkillIds: function () { return Array.from(SEARCHABLE_EXTENDED_SKILL_IDS); },
		skillCatalogKind: skillCatalogKind,
		/**
		 * その軸で**利用者に選ばせる選択肢**（`internalOnly` を落としたもの）。
		 * 画面と同じ判断を外から借りられるようにしてある ―― `TAG_AXES` の `options` を
		 * そのまま数えると `internalOnly` のぶんだけ食い違う（69セッション目に
		 * `test:master` が落ちていたのがこれ）。**同じ規則を検査の側で書き写さない。**
		 */
		pickableOptions: pickableOptions,
		/**
		 * **利用者の絞り込みに出す軸**（`hiddenAxis` を落としたもの）。71セッション目・段8。
		 * `pickableOptions` と同じ考え方で、**検査の側に「どの軸を隠すか」を書き写さずに済む**ように公開する。
		 */
		pickableAxes: pickableAxes,
		/**
		 * 軸内の読み方の1文と、「ふつうと違う軸か」（73セッション目）。
		 * **`card-event-input.html` が同じ文を使う**ために公開する ――
		 * 2か所で違うことを言わないため、かつ軸のキーを向こうに書かせないため。
		 */
		axisRuleHint: axisRuleHint,
		axisHasSpecialRule: axisHasSpecialRule,
		/**
		 * **「条件で検索」の母集団から外すスキル**（`poolExcluded` の軸に値を持つもの＝いまはパッシブ67件）。
		 * 段9 の「緑スキルを追加」の一覧がここから作られる。検査もこれを使って
		 * 「母集団に出ない」「緑スキルの一覧には出る」の両方を、軸のキーを書かずに見られる。
		 */
		getPoolExcludedSkills: getPoolExcludedSkills,
		/**
		 * 渡したIDのうちパッシブが何種あるか（段9 の追加）。入口のボタンの「（N種追加済み）」用。
		 * **Deck 単体ページの比較シート編集も自前の入口を持つ**ので、数え方を借りられるように公開する。
		 */
		countPassiveSkills: countPassiveSkills,

		// スキル参照
		findSkill: findSkill,
		getSkillName: getSkillName,
		getSkillTags: getSkillTags,
		getSkillEntries: getSkillEntries,
		matchesFilters: matchesFilters,
		// 目標のレースの距離（C-97）。検査が判定の材料（レースの一覧・評価）を読むために公開する
		evaluateTargetDistance: evaluateTargetDistance,
		getRaceDistances: function () { return raceDistances; },
		getRaceDistancesMeta: function () { return raceDistancesMeta; },
		tagLabel: tagLabel,
		tagLabels: tagLabels,
		expandMergedValues: expandMergedValues,

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
		// 帯のタブ（共有部品。C-54）。special の親A／親Bセットのタブが使う
		tabStrip: { html: tabStripHtml, reveal: revealSelectedTab, keydown: tabStripKeydown },
		// スキルセットの分類（C-57）。呼び出し元（special の照合結果の表）が印を出すために使う
		tiers: { list: TIERS.map(t => ({ id: t.id, label: t.label })), defaultTier: TIER_DEFAULT, of: tierOf, label: tierLabel, markHtml: tierMarkHtml },
		listRosters: listRosters,
		computeRosterSkills: computeRosterSkills,
		loadScenarioEvents: loadScenarioEvents,
		getScenarioEventStatus: function () { return scenarioEventState.status; },
		getPickerHiddenIds: function () { return pickerHiddenIds.slice(); },
		setPickerHiddenIds: function (ids) { pickerHiddenIds = (ids || []).slice(); },
		getPickerOffIds: function () { return pickerOffIds.slice(); },
		setPickerOffIds: function (ids) { pickerOffIds = (ids || []).slice(); },

		// スキル選択モーダル
		openSkillPicker: openSkillPicker,
		openTextSkillPicker: openTextSkillPicker,
		openSkillRowsPicker: openSkillRowsPicker,
		// 緑スキルを追加（72セッション目・段9）。Deck 単体ページの比較シート編集が自前の並びから呼ぶ。
		openPassiveSkillPicker: openPassiveSkillPicker,
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
