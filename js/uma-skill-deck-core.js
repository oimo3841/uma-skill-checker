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
	const UMA_SKILL_DECK_CORE_JS_VERSION = '2026-09-22i';

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
	const MASTER_JSON_VERSION = '2026-09-22a';

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
		'data/extended-skills.json': '2026-09-18a',
		'data/training-umamusume.json': '2026-09-18a',
		'data/support-cards.json': '2026-09-18b',
		'data/support-card-event-skills.json': '2026-09-18a'
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

	/* タグ辞書。フィルターパネル・タグ表示・カスタムスキル入力・タグ付け画面で共有する。
	 *
	 * **軸に付く印は4つ**（71セッション目・段8 で `optIn` を廃し、`hiddenAxis` / `poolExcluded` /
	 * `exclusive` を足した）:
	 *   `emptyMeansNone` … 空配列を「万能」ではなく「該当しない」と読む
	 *   `exclusive`      … 軸内が OR ではなく**許可リスト**。持っている値が選んだ値に全部収まるものだけ通す
	 *   `hiddenAxis`     … **利用者の絞り込みには出さない**（タブにもカスタムスキル入力にも出さない）。
	 *                       データとしては残り、`card-event-input.html` のタグ付け画面には出る
	 *   `poolExcluded`   … **この軸に値を持つスキルを「条件で検索」の母集団に入れない**
	 *
	 * **`hiddenAxis` と `poolExcluded` は別物。まとめてはいけない。**
	 * レース環境・レース場は「隠すが母集団には居る」、パッシブは「隠すうえに母集団から外す」。
	 * 1つの印にすると、`environment` にタグを持つスキル（＝いまはパッシブ67件だけだが、
	 * 将来そうとは限らない）まで母集団から消える。
	 */
	const TAG_AXES = [
		{ key: 'distance', label: '距離', options: [
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
		//   (1) 消すと67件のうち63件の `effect` が空になる。`effect` は `emptyMeansNone` ではないので
		//       空は「万能」の意味になり、`test:master` の「効果タイプが空になったスキルは無い」も失われる
		//   (2) `check:catalog` の「マスターの値が選択肢に実在する」が効き続ける
		//   (3) `tagLabel()` が「能力上昇」を返せる。段12（⑧ 追加済みスキルのタグボタン群）で
		//       パッシブのタグを出すときに、生の値（`stat_up`）が画面に出ない
		//
		// **`internalOnly` ではなく `hiddenOption`。** `internalOnly` は「スキルではないものの値」で、
		// `card-event-input.html` ではそういう枠に入れて「ふつうのスキルには付けません」と注記される。
		// `stat_up` は**パッシブに付ける値**なので、タグ付け画面には他の値と並べて出す必要がある。
		{ key: 'effect', label: '効果タイプ', options: [
			{ v: 'target_speed_up', t: '速度上昇' }, { v: 'accel_up', t: '加速度上昇' }, { v: 'move_forward', t: '前に出る' }, { v: 'extend', t: '伸び' },
			{ v: 'stamina', t: '持久力回復' }, { v: 'debuff', t: 'デバフ' }, { v: 'start_good', t: 'スタート得意' }, { v: 'course_sense', t: 'コース取り' },
			{ v: 'lane_change', t: 'レーン移動' }, { v: 'temptation_time', t: '掛かり時間' }, { v: 'vision', t: '視野' },
			{ v: 'stat_up', t: '能力上昇', hiddenOption: true }
		]},
		// 70セッション目・段5（③④）。**空配列を「万能」ではなく「該当なし」と読む。**
		// 「中盤」を選んだとき、中盤にも発動しうるが序盤・終盤にも発動しうるスキル（phase が空）は
		// 出さない ―― 利用者が「中盤」を選ぶのは「中盤に限定して発動するもの」を探すときなので、
		// どこでも発動しうるスキルが混ざると、絞り込んだ意味が無くなる。
		{ key: 'phase', label: 'フェーズ', emptyMeansNone: true, options: [
			{ v: 'early', t: '序盤' }, { v: 'mid', t: '中盤' }, { v: 'late', t: '終盤' }, { v: 'lastspurt', t: 'ラストスパート' }
		]},
		{ key: 'coursePos', label: 'コース位置', emptyMeansNone: true, options: [
			{ v: 'corner', t: 'コーナー' }, { v: 'straight', t: '直線' }, { v: 'uphill', t: '上り坂' }, { v: 'downhill', t: '下り坂' }
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
			{ v: 'time_day', t: '昼' }, { v: 'time_evening', t: '夕方' }, { v: 'time_night', t: 'ナイター' },
			{ v: 'distance_basis', t: '根幹距離' }, { v: 'distance_nonbasis', t: '非根幹距離' }
		]},
		{ key: 'trackVenue', label: 'レース場', hiddenAxis: true, options: [
			{ v: 'track_sapporo', t: '札幌' }, { v: 'track_hakodate', t: '函館' }, { v: 'track_fukushima', t: '福島' }, { v: 'track_niigata', t: '新潟' },
			{ v: 'track_nakayama', t: '中山' }, { v: 'track_tokyo', t: '東京' }, { v: 'track_chukyo', t: '中京' }, { v: 'track_kyoto', t: '京都' },
			{ v: 'track_hanshin', t: '阪神' }, { v: 'track_kokura', t: '小倉' },
			{ v: 'track_oi', t: '大井' }, { v: 'track_kawasaki', t: '川崎' }, { v: 'track_funabashi', t: '船橋' }, { v: 'track_morioka', t: '盛岡' },
			{ v: 'track_longchamp', t: 'ロンシャン' }, { v: 'track_santaanita', t: 'サンタアニタパーク' }, { v: 'track_delmar', t: 'デルマー' }
		]},
		// **この軸だけ、空配列の意味が他の7軸と逆。** 他は「空＝どの条件でも出る（万能スキル）」だが、
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
	 * （いまは条件検索の絞り込みと、カスタムスキル入力のタグの2か所）。
	 *
	 * **通してはいけないもの**:
	 *   - `tagLabel()` … 値 → 表示名の変換。通すと画面に生の値（`scenario_factor`）が出る
	 *   - `matchesFilters()` … そもそも options を見ない（マッチングには影響しない）
	 *   - `card-event-input.html` のタグ付け … おいもさんが**付ける**値なので全部出す
	 */
	function pickableOptions(axis) {
		return axis.options.filter(o => !o.internalOnly && !o.hiddenOption);
	}

	/**
	 * **利用者の絞り込みに出す軸**だけを返す（`hiddenAxis` の軸を落とす）。
	 *
	 * `pickableOptions()` の軸版（71セッション目・段8）。タブ・カスタムスキル入力の
	 * タグ欄・キーボード移動・既定のタブが、どれも同じ判断を使えるようにしてある。
	 *
	 * **通してはいけないもの**:
	 *   - `matchesFilters()` … 隠した軸の `filters` は常に空なので通す必要が無く、
	 *     通すとむしろ「隠した軸のタグは無視する」という別の意味になってしまう
	 *   - `emptyTagSet()` / `addCustomSkillFromPicker()` … **全軸のキーを揃える**のが仕事なので、
	 *     隠した軸のキーも空配列で持たせる（マスターと顔ぶれを合わせるため）
	 *   - `card-event-input.html` のタグ付け … おいもさんが**付ける**値なので全軸を出す
	 */
	function pickableAxes() {
		return TAG_AXES.filter(a => !a.hiddenAxis);
	}

	/**
	 * **廃した値 → いまの値** の読み替え（70セッション目・段2）。
	 *
	 * マスターの445件は付け替え済みだが、**利用者が自分で作ったカスタムスキル**
	 * （`userData.customSkills[].tags`）には古い値が残る。そのままだと
	 * `matchesFilters()` は値どうしを比べるだけなので、「能力上昇」で絞っても出てこない。
	 *
	 * **保存データは書き換えない。** このファイルは「読み込み側は分岐せず、後から補わない」
	 * （`loadUserData()` の説明）を原則にしていて、開いただけで保存データの姿が変わるのを避けている。
	 * 代わりに**読むときに通す**（`getFilteredPickerPool()` の1か所）。利用者が次にその
	 * カスタムスキルを作り直したときには、自然に新しい値で保存される。
	 *
	 * **軸ごとに持つ**（`{ 軸キー: { 旧値: 新値 } }`）―― 値の名前は軸をまたいで一意とは限らない。
	 * 読み替え先が無い値（打ち間違いなど）はそのまま通す。**選択肢に無い値は、どの条件にも
	 * 当たらないだけで害は無い**（画面にタグを出す場所が無いので、生の値が見えることもない）。
	 */
	const LEGACY_EFFECT_VALUES = {
		speed_up: 'stat_up', stamina_up: 'stat_up', power_up: 'stat_up',
		guts_up: 'stat_up', wisdom_up: 'stat_up', all_up: 'stat_up',
		stamina_down: 'debuff', speed_down: 'debuff'
	};
	const LEGACY_TAG_VALUES = { effect: LEGACY_EFFECT_VALUES };

	/** タグの組を読み替えたものを返す。読み替えるものが1つも無ければ、元のオブジェクトをそのまま返す。 */
	function withLegacyTagsMapped(tags) {
		if (!tags) return tags;
		let changed = false;
		const out = {};
		for (const axisKey of Object.keys(tags)) {
			const table = LEGACY_TAG_VALUES[axisKey];
			const values = tags[axisKey];
			if (!table || !Array.isArray(values)) { out[axisKey] = values; continue; }
			const mapped = [];
			for (const v of values) {
				const next = Object.prototype.hasOwnProperty.call(table, v) ? table[v] : v;
				if (next !== v) changed = true;
				if (mapped.indexOf(next) === -1) mapped.push(next);   // 6値が1値に潰れるので重複を除く
			}
			if (mapped.length !== values.length) changed = true;
			out[axisKey] = mapped;
		}
		return changed ? out : tags;
	}

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
		{ id: '1', name: '右回り○', tags: { distance: [], style: [], surface: [], phase: [], coursePos: [], rarity: [], inherited: [], environment: ['right_turn'], trackVenue: [], effect: ['stat_up'], scenario: [], passive: ['passive'] } },
		{ id: '21', name: '積極策', tags: { distance: ['mile'], style: [], surface: [], phase: ['mid'], coursePos: [], rarity: [], inherited: [], environment: [], trackVenue: [], effect: ['target_speed_up'], scenario: [], passive: [] } },
		{ id: '26', name: '集中力', tags: { distance: [], style: [], surface: [], phase: [], coursePos: [], rarity: [], inherited: [], environment: [], trackVenue: [], effect: ['start_good'], scenario: [], passive: [] } }
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
		// schemaVersion 4 で template.tiers（スキルセットの分類。{ skillId: 1|2|3 }。C-57）が加わった。
		// これも読み込み側は分岐せず、**後から補わない**（tiers が無い id は「優先」（2）として読む。
		// 補うと、分類を一度も変えていない人のデータの姿が開いただけで変わる。C-51 の知見）。
		// schemaVersion 5 で template.scopes（節の ON/OFF。{ scenarioFactors: true, genes: true }。C-2a）が
		// 加わった。これも読み込み側は分岐せず、**後から補わない**（scopes が無いセットは
		// 「どの節も OFF」＝含めない、として読む。既定が OFF なので移行は要らない）。
		return { schemaVersion: 5, templates: [], records: [], customSkills: [], rosters: [] };
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
			if (!raw) return { skillIds: [], name: '', updatedAt: '' };
			const parsed = JSON.parse(raw);
			if (!parsed || !Array.isArray(parsed.skillIds)) return { skillIds: [], name: '', updatedAt: '' };
			// name は C-53 で足した（「＋ 新規」のタブで入力した名前を保存まで覚えておく）。無い古い形は空文字。
			// tiers（分類。C-57）は持っているときだけ写す（無い古い形に補わない＝テンプレートと同じ流儀）
			// scopes（節の ON/OFF。C-2a）も tiers と同じ流儀（持っているときだけ写す）
			const out = { skillIds: parsed.skillIds.slice(), name: typeof parsed.name === 'string' ? parsed.name : '', updatedAt: parsed.updatedAt || '' };
			if (parsed.tiers && typeof parsed.tiers === 'object') out.tiers = Object.assign({}, parsed.tiers);
			if (parsed.scopes && typeof parsed.scopes === 'object') out.scopes = Object.assign({}, parsed.scopes);
			return out;
		} catch (e) {
			return { skillIds: [], name: '', updatedAt: '' };
		}
	}

	// label … 失敗を知らせるときの呼び名（呼び出し元の setLabel）。渡さなければ既定の呼び名
	function saveDraftScope(scopeKey, skillIds, name, tiers, label, scopes) {
		const payload = { skillIds: (skillIds || []).slice(), name: typeof name === 'string' ? name : '', updatedAt: nowIso() };
		// 空の tiers は書かない（分類を変えていないドラフトの姿を変えない）
		if (tiers && typeof tiers === 'object' && Object.keys(tiers).length > 0) payload.tiers = Object.assign({}, tiers);
		// scopes（節の ON/OFF。C-2a）も同じ ―― 全部 OFF なら書かない
		if (scopes && typeof scopes === 'object' && Object.keys(scopes).length > 0) payload.scopes = Object.assign({}, scopes);
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
	function revealSelectedTab(root) {
		const cur = root && root.querySelector && root.querySelector('.uma-subtab[aria-selected="true"]');
		if (cur && typeof cur.scrollIntoView === 'function') {
			// 横は「選んだタブを帯の左端に寄せる」（inline: 'start'）。'nearest' だと、帯の scroll-snap
			// （タブの先頭に吸着）が、右端を見せる位置から手前のタブの先頭へ引き戻してしまい、
			// 幅を広げた選択中のタブの後半と件数が切れて見えた（C-55 の (2) で実測）。
			try { cur.scrollIntoView({ block: 'nearest', inline: 'start' }); } catch (e) { /* 古いブラウザ */ }
		}
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
		if (again) again.focus();
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
	 * （距離・脚質・効果タイプでは「万能」、残り5軸では「該当なし」。段5）、
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
		{ key: 'supportCardEventSkill', path: 'data/support-card-event-skills.json' }
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
		return title + (entry.charaName || '');
	}
	/**
	 * 選択済みの欄に出す短い名前＝**二つ名を落としてウマ娘名だけ**（C-51 の11節）。
	 * 選ぶミニウィンドウと凡例は正式名称（上）のまま。同じウマ娘の別のカードを同時に
	 * 選ぶと区別がつかなくなるが、編成の文脈で把握できるという割り切りで、特別な処理は入れない
	 * （おいもさんの判断）。ウマ娘名が無い行は正式名称に落とす。
	 */
	function formatEntryShortLabel(entry) {
		if (!entry) return '';
		return entry.charaName || formatEntryLabel(entry);
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
	 *   skillIds        … 得られると分かっているスキルのID（重複なし）
	 *   items           … [{ skillId, name, origins: [由来の文言], members: [key] }]（表示用）
	 *   members         … [{ key, kind, no, label, typeOrder }] 編成の並び順（凡例・★取り表の列）。
	 *                     key は並びの位置（0＝育成ウマ娘、1〜＝カードの枠）。kind は 'uma' | 'card'。
	 *                     no は画面に出す番号で、育成ウマ娘は null（★で示す）、カードは枠の順に 1〜。
	 *                     空いている枠は label が null。typeOrder はカードの種類の順番（無ければ null）
	 *   unconfirmed     … [{ cardId, label, what }] まだ調べていないもの
	 *   missing         … [{ kind, id }] id を引けなかったもの（行は消さずに知らせる）
	 *
	 * **番号は編成の並び順で機械的に振る**（育成ウマ娘は★、サポートカードが枠の順に 1〜6。
	 * C-51 の11節で「1〜7」から変えた）。名前も番号もコードに書かない（恒久ルール1）。
	 *
	 * **未確認のものは得られる側に入れない。** 除外しすぎて対象スキルセットから
	 * 必要なスキルが落ちるほうが痛いので、「得られると分かっているもの」だけを返す。
	 */
	function computeRosterSkills(roster) {
		const items = new Map();   // skillId → { skillId, name, origins: [], members: [] }
		const unconfirmed = [];
		const missing = [];
		const members = [];
		const add = (ref, origin, memberKey) => {
			if (!ref || !ref.skillId) return;
			const sk = findSkill(ref.skillId);
			if (!sk) { missing.push({ kind: 'skill', id: ref.skillId }); return; }
			const cur = items.get(ref.skillId) || { skillId: ref.skillId, name: sk.name, origins: [], members: [] };
			if (cur.origins.indexOf(origin) === -1) cur.origins.push(origin);
			if (cur.members.indexOf(memberKey) === -1) cur.members.push(memberKey);
			items.set(ref.skillId, cur);
		};

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
				if (use) (use.skills || []).forEach(s => add(s, '初期（★' + use.minStar + '）', UMA_KEY));
				// 覚醒スキル: level 0 は「覚醒のレベルに紐づかない枠」なので**常に含める**
				// （画面では「最初から」と出す）。それ以外は、そのウマ娘の最大レベルまで全部。
				const maxLv = maxAwakeningLevelOf(uma);
				(uma.awakeningSkills || []).forEach(row => {
					if (row.level === 0) (row.skills || []).forEach(s => add(s, '最初から', UMA_KEY));
					else if (typeof row.level === 'number' && row.level <= maxLv) {
						(row.skills || []).forEach(s => add(s, '覚醒 Lv' + row.level, UMA_KEY));
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
			if (hintStatus === 'done') (card.hintSkills || []).forEach(s => add(s, label + ' のヒント', key));
			else if (hintStatus === 'pending') unconfirmed.push({ cardId: cardId, label: label, what: 'ヒント' });

			const evStatus = eventStatusOf(cardId);
			if (evStatus === 'done') getEventSkillsOf(cardId).forEach(s => add(s, label + ' のイベント', key));
			else if (evStatus === 'pending') unconfirmed.push({ cardId: cardId, label: label, what: 'イベント' });
		});

		const list = Array.from(items.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
		return { skillIds: list.map(x => x.skillId), items: list, members: members, unconfirmed: unconfirmed, missing: missing };
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
	 * ただし `emptyMeansNone` の軸は、空配列が「該当なし」であって「万能」ではない。
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
	function matchesFilters(skill, filters) {
		return TAG_AXES.every(axis => {
			const selected = filters[axis.key] || [];
			if (selected.length === 0) return true; // その軸で絞り込みしていない
			const skillValues = (skill.tags && skill.tags[axis.key]) || [];
			if (skillValues.length === 0) return !axis.emptyMeansNone; // 万能スキル（入手経路の軸だけは該当なし）
			return axis.exclusive
				? skillValues.every(v => selected.includes(v))   // 許可リスト（選んでいない値を持つものは落とす）
				: skillValues.some(v => selected.includes(v));   // 軸内 OR
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
		//   狭い画面（既定）… スキル名の列は残りの幅（minmax(0, 1fr)）、メンバーの列は 28px 固定。見出しは印と番号だけ。
		//   768px 以上      … メンバーの列を広げて見出しにウマ娘名（短い名前）も出す。スキル名の列は 140〜260px。
		// 利用者が選ぶ切り替えにしなかった理由: 決め手は物理的な幅なので、幅で決めるほうが迷わせない（C-54）。
		'.usd-roster-grid { display: grid; width: 100%; --usd-roster-colw: 28px;',
		'  grid-template-columns: minmax(0, 1fr) repeat(var(--usd-roster-cols, 7), var(--usd-roster-colw)); }',
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
		'  font-weight: 700; overflow-wrap: anywhere; }',
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
		// 育成ウマ娘の見出しと凡例の印は**白い ♦（正方形を 45 度回したもの）**（C-57 の作業A。◎ → ● → ♦）。
		// 見出しと同じ濃い地のチップに白い ♦ を CSS で描く（見出しの中では地が同じなので ♦ だけが見える）。
		'.usd-roster-umamark { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 16px;',
		'  background: var(--uma-table-head-key-bg); border-radius: var(--uma-r-sm); }',
		'.usd-roster-umamark::before { content: ""; display: block; width: 7px; height: 7px; background: var(--uma-table-head-key-text);',
		'  transform: rotate(45deg); }',
		// 凡例（番号 → 正式名称）。表の外に、左ぞろえで1行1件
		'.usd-roster-legend { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--uma-sp-0-5);',
		'  font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); }',
		'.usd-roster-legend li { display: flex; align-items: center; gap: var(--uma-sp-1-5); min-width: 0; }',
		'.usd-roster-legend-no { flex: none; min-width: 20px; text-align: center; font-weight: 700;',
		'  border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-sm); }',
		// 番号は表の見出しと同じ色にする（C-62 の (2)）。凡例は「番号 → 正式名称」の対応表なので、
		// 番号の見た目が表と食い違うと対応を追えない。
		'.usd-roster-legend-no.usd-roster-typed { background: var(--usd-card-bg); border-color: var(--usd-card-border);',
		'  color: var(--usd-card-text); }',
		'.usd-roster-legend--empty { color: var(--uma-text-faint); }',
		'.usd-roster-note { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); color: var(--uma-text-subtle); margin: 0; }',
		'.usd-roster-warn { font-size: var(--uma-fs-xs); line-height: var(--uma-lh-xs); margin: 0; }',
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
	 * 一覧から隠すスキル（編成で得られるもの。C-51）。
	 *
	 * **`picker.excludeIds` を流用しないこと。** あちらは「一覧から隠す」と
	 * **「XXX種追加済み」の件数**（`updatePickerCommitState()` が `length` をそのまま出す）を
	 * 兼ねているので、編成由来のIDを混ぜると件数が壊れる。こちらは表示にだけ効かせ、
	 * 件数には一切使わない。モーダルを開き直しても残るよう、picker とは別に持つ。
	 */
	let pickerHiddenIds = [];
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
	let entryRowOpen = true;
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
		// 71セッション目・段6: 「条件でスキルを検索」→「条件で検索」（利用者向けの文言だけ。
		// 識別子 `filter` と、コード内の説明の「条件でスキルを検索」は変えない＝恒久ルール19）。
		//
		// **段8: 括弧から「軸内はOR」を落とした。** バ場（`exclusive`）が入り、軸内の読み方が
		// 軸ごとに3通り（OR／OR＋空は該当なし／許可リスト）になったので、**見出しで一律には言えない**。
		// 軸内の読み方は**その軸のパネルの注記**が言う（renderPickerFilterAxes の hint）ので、
		// 見出しには**全軸に共通して成り立つこと＝軸間はAND**だけを残した。
		filter: { title: '条件で検索（軸間はAND）', commit: true },
		paste: { title: 'テキストで検索', commit: true },
		// 32セッション目: 利用者向けの語を「収録されていない」に統一（「マスター」も「一覧」も
		// 画面上に存在しないものを指していて、利用者は見たことのない何かを参照させられていた）。
		// **コード内部の識別子・変数名・開発ログの「マスター」は変えない。**
		// 71セッション目・段6: 「収録されていないスキルを追加」→「未収録スキルを追加」（文言だけ）。
		custom: { title: '未収録スキルを追加', commit: false },
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
		 * 外した瞬間に抜ける（手入力＝`custom` に前例がある）。理由は2つ ――
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
						'<div class="flex items-center justify-between mb-1">' +
							'<label class="flex items-center gap-1.5 text-xs text-slate-600">' +
								'<input type="checkbox" data-usd-act="picker-select-all"/> 表示中を全て選択' +
							'</label>' +
							'<p class="text-xs text-slate-500">絞り込み結果（<span data-usd-el="result-count">0件</span>）</p>' +
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
						'</p>' +
						'<div class="usd-results usd-results--tall" data-usd-el="passive-results"></div>' +
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
			else if (act === 'filter-tab') onPickerAxisTabClick(btn.dataset.usdAxis);
			// 「絞り込み中」から飛ぶときは、どのタブへ移ったかが分かるようフォーカスも移す。
			// **閉じていたら開く** ―― 見にいくために押しているので、閉じたままでは用を成さない。
			else if (act === 'filter-jump') { selectPickerAxisTab(btn.dataset.usdAxis, true); setPickerAxisPanelOpen(true); }
			else if (act === 'filter-clear-axis') clearPickerAxisFilter(btn.dataset.usdAxis);
			else if (act === 'filter-clear-all') clearAllPickerFilters();
			// 「▼ ほか N件」（段4）。1段ぶん下へ送る
			else if (act === 'opts-more') scrollOptionsByRow(btn.dataset.usdAxis);
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
			// 緑スキル（段9）は確定ボタンを通さず、押したその場で受け皿へ流す
			if (el.dataset.usdEl === 'passive-check') { onPassiveCheck(el.value, el.checked); return; }
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
			const hint = axis.exclusive
				? '選んだもの以外を持つスキルは出ない（この軸のタグが無いスキルは出る）'
				: axis.emptyMeansNone
					? '選んだもののいずれかに一致（OR）。この軸のタグが無いスキルは出ない'
					: '選んだもののいずれかに一致（OR）';
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
		pickableAxes().forEach(axis => {
			const n = pickerFilters[axis.key].length;
			const badge = pickerEl.querySelector('[data-usd-el="axis-count"][data-usd-axis="' + axis.key + '"]');
			if (badge) { badge.hidden = n === 0; badge.textContent = n; }
			const tab = pickerEl.querySelector('.usd-tab[data-usd-axis="' + axis.key + '"]');
			if (tab) tab.setAttribute('aria-label', axis.label + (n ? '（' + n + '件選択中）' : ''));
			const clearBtn = pickerEl.querySelector('[data-usd-act="filter-clear-axis"][data-usd-axis="' + axis.key + '"]');
			if (clearBtn) clearBtn.disabled = n === 0;
		});

		const summary = q(pickerEl, 'filter-summary');
		if (!summary) return;
		const active = pickableAxes().filter(a => pickerFilters[a.key].length > 0);
		if (active.length === 0) {
			summary.innerHTML = '<span>条件なし（すべてのスキルを表示）</span>';
			return;
		}
		summary.innerHTML = '<span class="usd-summary-label">絞り込み中</span>' +
			active.map(a =>
				'<button type="button" class="usd-summary-item" data-usd-act="filter-jump" data-usd-axis="' + a.key + '" title="このタブを開く">' +
					'<b>' + esc(a.label) + '</b>' +
					esc(pickerFilters[a.key].map(v => tagLabel(a.key, v)).join('・')) +
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

	function clearPickerAxisFilter(axisKey) {
		pickerFilters[axisKey].length = 0;
		pickerEl.querySelectorAll('[data-usd-el="filter-check"][data-axis="' + axisKey + '"]').forEach(el => { el.checked = false; });
		refreshPickerFilterUi();
		renderPickerResults();
	}

	function clearAllPickerFilters() {
		TAG_AXES.forEach(a => { pickerFilters[a.key].length = 0; });
		pickerEl.querySelectorAll('[data-usd-el="filter-check"]').forEach(el => { el.checked = false; });
		refreshPickerFilterUi();
		renderPickerResults();
		const tab = pickerEl.querySelector('.usd-tab[data-usd-axis="' + picker.activeAxis + '"]');
		if (tab) tab.focus();
	}

	// 「条件でスキルを検索」の母集団。マスター＋利用者のカスタムスキル＋
	// **タグが付いた追加カタログのもの**（段1b）。
	//
	// **タグを持たないものは入れない。** matchesFilters() では、空配列を「万能（どの条件にも当たる）」と
	// 読む軸（距離・脚質・効果タイプ）が残っているので、タグ未設定のものを入れると、
	// その3軸だけで絞ったときに一覧の先頭から最後まで居座ることになる。
	// **70セッション目・段5 で、残り5軸は空を「該当なし」と読むようになった**ので、
	// 「どんな条件でも居座る」ではなくなったが、入れない理由としては変わらない。対象は2種類ある:
	// - タグ未設定の拡張スキル（`tagsPending`。付け終わったものから自動でここへ入る）
	// - そもそもタグを持たないカテゴリ（シナリオ因子。`tags` も `tagsPending` も持たない）
	// どちらも「`tags` を持っているか」の1つの判定で外れるので、カテゴリ名では分岐しない。
	//
	// 名前で探す側（findSkillsByNameFragment → buildSkillTextIndex）には、タグの有無に関係なく
	// 全件が入っている（名前で引くだけなら万能スキル扱いの問題が起きないため）。
	//
	// **カスタムスキルだけ `withLegacyTagsMapped()` を通す**（段2）。マスターと追加カタログは
	// リポジトリの中にあって付け替え済みなので、通す必要が無い（通すと毎回445件ぶん無駄に回る）。
	//
	// **72セッション目・段9: 顔ぶれを組み立てる部分を `taggedSkillPool()` へ出した。**
	// ここと「緑スキルを追加」の一覧（`getPoolExcludedSkills`）は**表と裏**で、
	// 片方から外したものはもう片方に出る、が成り立っていないと**どこからも選べないスキル**が生まれる。
	// 顔ぶれを2か所で組み立てていると、片方にだけ足し忘れてそれが起きる
	// （実際、段8 の時点では**カスタムスキルが母集団からは消えるのに緑スキルの一覧には出ない**状態だった）。
	function taggedSkillPool() {
		return masterSkills
			.concat((ensureUserData().customSkills || []).map(c => ({ id: c.customId, name: c.name, tags: withLegacyTagsMapped(c.tags) })))
			.concat(extraCatalog.filter(x => x.tags).map(x => ({ id: x.id, name: x.name, tags: x.tags })));
	}

	function getFilteredPickerPool() {
		const hidden = new Set(pickerHiddenIds);
		return taggedSkillPool().filter(s => !picker.excludeIds.includes(s.id) && !hidden.has(s.id)
			&& !isPoolExcluded(s) && matchesFilters(s, pickerFilters));
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
		el.innerHTML = list.map(s =>
			'<label class="usd-row">' +
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
		// 手入力のタグ欄も、利用者に出す軸だけ（隠す軸のタグは付けさせない。71セッション目・段8）。
		el.innerHTML = pickableAxes().map(axis =>
			'<div class="mb-2">' +
				'<p class="text-[11px] text-slate-500 mb-1">' + axis.label + '</p>' +
				'<div class="flex flex-wrap gap-1.5">' +
					// 利用者が自分のスキルに付ける値だけを出す（pickableOptions）。
					pickableOptions(axis).map(o =>
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
		const focusTarget = picker.mode === 'paste' ? pasteInput : (picker.mode === 'custom' ? customName : null);
		if (focusTarget) focusTarget.focus();
	}

	// 条件でスキルを検索（8軸フィルター）。従来の openSkillPicker と同じ呼び出し方。
	function openSkillPicker(existingSkillIds, onAdd) { openPicker('filter', existingSkillIds, onAdd); }
	// テキストで検索（貼り付けたテキストとマスターの照合）。
	function openTextSkillPicker(existingSkillIds, onAdd) { openPicker('paste', existingSkillIds, onAdd); }
	// マスターにないスキルを追加（名前＋8軸タグの手入力）。
	function openCustomSkillPicker(existingSkillIds, onAdd) { openPicker('custom', existingSkillIds, onAdd); }
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
		// 「＋ 新規」の中身（未保存の編成）を残す localStorage のキー（C-53）。渡さなければメモリだけ
		const draftKey = opts.draftKey || null;
		let roster = restoreDraftRoster();
		let selectedId = '';          // 保存済みを選んでいればその rosterId
		let pickingScope = false;     // 除外先のスキルセットを選ぶミニウィンドウ（C-54 の (3)）
		let picking = null;           // { kind: 'uma' } / { kind: 'card', index } / null
		let pickQuery = '';           // ミニウィンドウの検索語
		let pickType = '';            // ミニウィンドウの種類の絞り込み（'' はすべて）
		let hide = false;             // 「一覧から隠す」
		let showUnconf = false;       // イベントスキル未収録のカード名の一覧を開いているか（既定は閉じる）
		let findTimer = 0;
		let lastOverlap = -1;         // 対象スキルセットと重なっていた数（通知の出し分け用）

		function computed() { return computeRosterSkills(roster); }

		/* ------------------------------------------------------------
		 * ミニウィンドウの置き場所（F-61。69セッション目に直した）
		 *
		 * **全画面に重ねるものは document.body の直下に置く。** パネルの中に置くと、
		 * special の②を包む `.glass-card` が `backdrop-filter` を持っているために
		 * **子孫の `position: fixed` が「画面」ではなく「そのカード」を基準にする**
		 * （実測: `.usd-roster-modal` の上端が 375px で -210px、1280px で -52px）。
		 * いままでは箱が小さくて画面に収まっていただけで、項目が増えれば画面外へ出る。
		 * **C-2c の「?」の一覧（openScopeList）と同じ作法**に揃えた。
		 *
		 * 中身（`searchHtml()` / `scopeChooserHtml()`）は render() が作り直す。
		 * 置き場所が container の外になるので、**同じ click / input のハンドラを
		 * こちらにも付ける**（`onPanelClick` / `onPanelInput` を共有する）。
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
		 * 変更をその場で保存する（C-53。「タブを切り替えたら未保存の変更が捨てられる」のをやめた）。
		 * 保存済みの編成ならそのまま保存し、「＋ 新規」ならドラフトとして残す。
		 * 名前だけは「保存」を押したとき（またはタブを離れるとき）に反映する。
		 */
		function persistNow() {
			syncFixedFields();
			if (selectedId) saveRoster(snapshot(roster));
			else if (draftKey) saveDraftRoster(draftKey, snapshot(roster));
		}

		/** 名前欄に入れたまま「保存」を押していない名前を、タブを離れる前に反映する。 */
		function flushPendingName() {
			const nameEl = q(container, 'name');
			if (!nameEl) return;
			if (selectedId) {
				const saved = findRoster(selectedId);
				if (saved && nameEl.value !== (saved.name || '')) { roster.name = nameEl.value; persistNow(); }
			} else {
				roster.name = nameEl.value;
				if (draftKey) saveDraftRoster(draftKey, snapshot(roster));
			}
		}

		/**
		 * 保存する形に残している star / awakeningLevel には、**実際に計算に使った値**を書く
		 * （★は固定の規則で決まる行の minStar、覚醒はそのウマ娘の最大）。読むときは使わない。
		 * 画面から変えられない項目を空のまま残すより、何で計算したかが記録に残るほうがよい。
		 */
		function syncFixedFields() {
			const uma = roster.umaId ? findUma(roster.umaId) : null;
			const row = uma ? initialRowOf(uma) : null;
			roster.star = row ? row.minStar : 0;
			roster.awakeningLevel = uma ? maxAwakeningLevelOf(uma) : 0;
		}

		function applyHidden() {
			const ids = hide ? computed().skillIds : [];
			pickerHiddenIds = ids;
			if (typeof opts.onHiddenIdsChange === 'function') opts.onHiddenIdsChange(ids.slice());
		}

		/** ②（周回因子セット）でいま選んでいるセットのスキルと、この編成で得られるスキルの重なりの数。 */
		function overlapWithScope(skillIds) {
			if (typeof opts.getScopeSkillIds !== 'function') return 0;
			const scope = opts.getScopeSkillIds() || [];
			if (scope.length === 0) return 0;
			const have = new Set(skillIds);
			return scope.filter(id => have.has(id)).length;
		}

		/**
		 * 編成を触ったあとで、②（周回因子セット）の選択と重なっていたら知らせる（C-51 の修正5）。
		 * **黙って消さない。** 画面には常に件数を出したうえで、増えた瞬間だけトーストも出す
		 * （引き出しの下のほうを見ていなくても気づけるように）。
		 */
		function notifyOverlap() {
			const n = overlapWithScope(computed().skillIds);
			if (n > 0 && n !== lastOverlap) {
				toast('スキルセットに、本育成で得られるスキルが ' + n + '種 含まれています');
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
			return card ? formatEntryShortLabel(card) : '（読み込めません：' + id + '）';
		}
		/**
		 * 選択済みのカードの欄に付ける、種類の色の属性（C-51 の11節⑫）。色は番号（typeOrder）で
		 * tokens.css の --uma-card-type-<番号>-* から引き、無い番号は既定の面に落ちる。
		 * 種類の名前はここに出てこない。
		 */
		function cardSlotColorAttrs(i) {
			const id = roster.cardIds[i];
			const card = id ? findCard(id) : null;
			const n = cardTypeOrderOf(card);
			if (n === null) return '';
			return ' data-type-order="' + n + '" style="' + cardTypeColorVars(n) + '"';
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
				// typeOrder は候補の行を種類ごとの色で塗るため（C-62 の (1)）。育成ウマ娘には無いので null
				.map(e => ({ id: e.id, label: formatEntryLabel(e), used: used.indexOf(e.id) !== -1,
					typeOrder: kind === 'card' ? cardTypeOrderOf(e) : null }));
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
					// 種類ごとの色（C-62 の (1)）。**選択済みのカードの欄と同じ色**を、同じ番号（typeOrder）から
					// 引く（色の定義は css/tokens.css の --uma-card-type-<番号>-*。種類の名前はここに書かない）。
					// 押していない状態でも色を出す ―― 「どれがどの種類か」を一目で見分けるための色なので、
					// 選んだときだけ色が付く形では役に立たない。選んでいることは枠の二重線と太字で示す。
					// 「すべて」だけは種類ではないので黒と白（選択中＝黒地に白）。
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
					// データに種類が入れば、この分岐は自動で絞り込みの側へ移る。
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
			// 候補の行の色（C-62 の (1)・C-63 の (6)）。**どれも同じ緑**だったので、一覧を眺めても
			// 何の行か分からなかった。**サポートカードと育成ウマ娘で分け方が違う。**
			//   サポートカード … 種類ごとの色（選択済みの欄・絞り込み・表の見出しと同じものを
			//                    同じ番号（typeOrder）から引く）。
			//   育成ウマ娘     … **種類が無い**ので色では分けられない。★取り表の列と同じ考え方で
			//                    **薄い灰と白の交互**にして、行の切れ目だけが分かるようにする。
			// すでにこの編成に入っている行は、選べない見た目（灰）を優先する（カードだけで起こる）。
			const tint = (h) => (h.typeOrder === null || h.typeOrder === undefined) ? ''
				: ' data-type-order="' + h.typeOrder + '" style="' + cardTypeColorVars(h.typeOrder) + '"';
			const plain = picking.kind !== 'card';
			box.innerHTML = '<div class="usd-name-list">' + shown.map((h, i) => h.used
				// 同じカードを2枠には入れられない（実際に組めないため）。判定は id で行う
				// ので、同じ二つ名の別のカードは別物として選べる。
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

		function render() {
			const res = computed();
			const saved = listRosters();
			const overlap = overlapWithScope(res.skillIds);

			let h = '<div class="usd-roster">';

			// αテスト中の注記は、呼び出し元の見出し（special.html の①のタブ）の「αテスト」ラベルの中へ移した（C-51 の11節②）。

			/* ── 上位層: 編成（保存・読み込み・名前）と、スキルセットへの除外 ──
			   下位層（育成ウマ娘・サポートカード）より一段強い見出しと、囲みの地色で見分ける。 */
			h += '<div class="usd-roster-top">';
			// 保存済みの編成はプルダウンではなくタブで選ぶ（C-51 の11節③）。先頭の「＋ 新規」が
			// 「保存済みを選んでいない＝新しい編成」。名前はタブ幅に収まるぶんだけ出して「…」で切る
			// （略称は作らない。正式名は title と、選んだときの名前欄に全文が入る）。
			h += '<div class="uma-subtabs-row">';
			h += '<p class="usd-roster-h usd-roster-h--top">編成（' + saved.length + '／' + ROSTER_LIMIT + '件）</p>';
			h += tabStripHtml(
				[{ id: '', label: '＋ 新規', isNew: true, selected: !selectedId, title: '新しい編成（未保存）' }].concat(
					saved.map(r => ({ id: r.rosterId, label: r.name || '（名称未設定）', title: r.name || '（名称未設定）', selected: r.rosterId === selectedId }))),
				{ act: 'select-roster', ariaLabel: '保存した編成', el: 'roster-tabs' });
			h += '</div>';
			h += '<div class="usd-roster-row">';
			h += '<input class="uma-input usd-name-input" type="text" data-usd-el="name" data-usd-act="name" placeholder="新しい編成の名前" value="' + esc(roster.name || '') + '" />';
			h += '<button type="button" class="uma-btn uma-btn--primary" data-usd-act="save">保存</button>';
			// 複製（C-54 の (5)。スキルセットと同じ）と削除は保存済みのときだけ
			if (selectedId) h += '<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="duplicate">複製</button>';
			if (selectedId) h += '<button type="button" class="uma-btn uma-btn--ghost" data-usd-act="delete">削除</button>';
			h += '</div>';

			// 「隠す」と「外す」を1つにまとめた操作（C-51 の修正）。押した状態＝隠しつつ、押した時点で外す。
			// 外すのは元に戻せないので Undo に積む（黙って消さない方針は変えない）。
			// 表記は状態で入れ替える（「本育成スキルを除外する」／除外中は「除外を解除する」。C-51 の11節④）。
			if (typeof opts.onRemoveFromScope === 'function') {
				h += '<div class="usd-roster-row">';
				h += '<button type="button" class="uma-btn ' + (hide ? 'uma-btn--primary' : 'uma-btn--neutral') + '" data-usd-act="exclude"'
					+ ' aria-pressed="' + (hide ? 'true' : 'false') + '"' + (res.items.length === 0 && !hide ? ' disabled' : '')
					+ '>' + (hide ? '除外を解除する' : '本育成スキルを除外する') + '</button>';
				h += '</div>';
			}
			// スキルセットですでに選んであるスキルとの重なり。**黙って消さない**ので、
			// 何件重なっているかを常に出し、外すかどうかは押して決めてもらう。
			if (overlap > 0) {
				h += '<p class="usd-roster-warn">スキルセットに、本育成で得られるスキルが <strong>'
					+ overlap + '種</strong> 含まれています（<strong>まだ外していません</strong>。上のボタンで外せます）。</p>';
			}
			// イベントスキルの未確認は、αテスト中の明示として編成の層に赤字で**1行だけ**出す
			// （C-51 の10節①。件数は未確認のカードの数）。どのカードかの一覧は常時出さず、
			// 「対象のカードを見る」を押したときだけ開く（スマホで縦に長くなるため）。
			// 一覧そのものは残す（それが無いと card-event-input.html へ埋めに行けない）。
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

			/* ── 下位層: 育成ウマ娘 と サポートカード を並列に ── */
			h += '<div class="usd-roster-lower">';
			h += '<div class="usd-roster-sub"><p class="usd-roster-h usd-roster-h--sub">育成ウマ娘</p>';
			h += '<div class="usd-roster-row">';
			h += '<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="pick-uma">' + esc(labelOfUma()) + '</button>';
			if (roster.umaId) h += '<button type="button" class="uma-btn uma-btn--ghost" data-usd-act="clear-uma">外す</button>';
			h += '</div>';
			h += '<p class="usd-roster-note">★3・覚醒レベル最大として扱います。</p>';
			h += '</div>';

			h += '<div class="usd-roster-sub"><p class="usd-roster-h usd-roster-h--sub">サポートカード</p><div class="usd-roster-slots">';
			for (let i = 0; i < ROSTER_CARD_SLOTS; i++) {
				const colorAttrs = cardSlotColorAttrs(i);
				h += '<div class="usd-roster-slot">'
					+ '<button type="button" class="uma-btn uma-btn--secondary' + (colorAttrs ? ' usd-roster-card--typed' : '') + '"'
					+ ' data-usd-act="pick-card" data-index="' + i + '"' + colorAttrs + '>'
					+ esc(labelOfCard(i)) + '</button>'
					+ (roster.cardIds[i] ? '<button type="button" class="uma-icon-btn" data-usd-act="clear-card" data-index="' + i + '" aria-label="外す">×</button>' : '')
					+ '</div>';
			}
			h += '</div></div>';
			h += '</div>';

			// ミニウィンドウ（選ぶ・除外先を選ぶ）は container には入れない。
			// body 直下の器へ出す（すぐ下の container.innerHTML のあと）。理由は ensureModalHost。

			// 得られるスキル（★取り表。C-51 の10節⑥・11節⑤〜⑧・C-54）。左の列にスキル名、見出し行に編成の並び
			// （育成ウマ娘は「♦」、サポートカードは枠の順の番号 1〜）を置き、どのメンバーから得られるかを黒い輪郭の丸で示す（C-57 の作業A）。
			// 768px 以上では見出しにウマ娘名（短い名前）も出す（CSS が幅で切り替える。狭い画面では印と番号だけ）。
			// 列は**常に全部**出す（空いている枠も列にする）ので、番号が枠の位置と常に一致し、表の形も安定する。
			// 番号と正式名称の対応は表の外の凡例に置く（スマホの幅で正式名称を見出し行に並べられないため）。
			// 印は CSS が描く（白い ♦。C-57 の作業A）ので中身は空
			const umaChip = '<span class="usd-roster-umamark" role="img" aria-label="育成ウマ娘"></span>';
			// 列の区別は罫線＋**1列おきの薄い灰**（C-62 の (3)。罫線だけでは列を目で追えなかった）。
			// 育成ウマ娘の列は今までどおり**見出しのセルの色味だけ**で区別する（C-57 の作業A）ので、
			// 灰の縞には入れない（本体のセルは白のまま）。
			const colClass = (m) => m.kind === 'uma' ? ' usd-roster-gc--uma'
				: (m.no % 2 === 0 ? ' usd-roster-gc--alt' : '');
			// 見出しのセルと凡例の番号は、サポートカードの種類ごとの色（C-62 の (2)）。
			// 選択済みの欄・ミニウィンドウの候補と**同じ色を同じ番号から**引く。
			const colStyle = (m) => (m.kind === 'card' && m.typeOrder !== null && m.typeOrder !== undefined)
				? ' data-type-order="' + m.typeOrder + '" style="' + cardTypeColorVars(m.typeOrder) + '"' : '';
			const colTypedClass = (m) => (m.kind === 'card' && m.typeOrder !== null && m.typeOrder !== undefined)
				? ' usd-roster-typed' : '';
			const colHead = (m) => (m.kind === 'uma' ? umaChip : String(m.no))
				+ (m.shortLabel ? '<span class="usd-roster-gh-name">' + esc(m.shortLabel) + '</span>' : '');
			const colName = (m) => (m.kind === 'uma' ? '育成ウマ娘' : String(m.no)) + (m.label ? '：' + esc(m.label) : '（空き）');
			h += '<div class="usd-roster-sec">';
			h += '<p class="usd-roster-h">本育成で得られるスキル ' + res.items.length + '種</p>';
			if (res.items.length === 0) {
				h += '<p class="usd-roster-note">育成ウマ娘とサポートカードを選ぶと、ここに出ます。</p>';
			} else {
				const members = res.members;
				h += '<div class="usd-roster-grid-wrap"><div class="usd-roster-grid" role="table" aria-label="本育成で得られるスキル"'
					+ ' style="--usd-roster-cols:' + members.length + '">';
				h += '<div class="usd-roster-grow" role="row">'
					+ '<div class="usd-roster-gc usd-roster-gc--name usd-roster-gh" role="columnheader">スキル名</div>'
					+ members.map(m => '<div class="usd-roster-gc usd-roster-gh' + colClass(m) + colTypedClass(m)
						+ (m.label ? '' : ' usd-roster-gh--empty') + '"'
						+ ' role="columnheader" aria-label="' + colName(m) + '"' + colStyle(m) + '>' + colHead(m) + '</div>').join('')
					+ '</div>';
				res.items.forEach((it) => {
					h += '<div class="usd-roster-grow" role="row">'
						+ '<div class="usd-roster-gc usd-roster-gc--name" role="rowheader">' + esc(it.name) + '</div>'
						+ members.map(m => '<div class="usd-roster-gc' + colClass(m) + '" role="cell">'
							+ (it.members.indexOf(m.key) !== -1 ? '<span class="usd-roster-got" role="img" aria-label="得られる"></span>' : '')
							+ '</div>').join('')
						+ '</div>';
				});
				h += '</div></div>';
				// 「◆＝育成ウマ娘、1〜N＝サポートカード」の1行は C-63 の (5) で削除した
				// （すぐ下に実際の一覧が並んでいるので、印と番号の意味はそちらで分かる）。
				h += '<ol class="usd-roster-legend">' + members.map(m =>
					'<li' + (m.label ? '' : ' class="usd-roster-legend--empty"') + '>'
					+ (m.kind === 'uma' ? umaChip
						: '<span class="usd-roster-legend-no' + colTypedClass(m) + '"' + colStyle(m) + '>' + m.no + '</span>')
					+ '<span>' + (m.label ? esc(m.label) : '（空き）') + '</span></li>').join('') + '</ol>';
			}
			// 「ここに出ていないスキルが…」の1行は C-62 の (6) で削除した（表の見出しが
			// 「本育成で得られるスキル N種」と言っているので、裏返しの言い換えにしかなっていなかった）。
			h += '</div>';
			h += '</div>';

			container.innerHTML = h;
			const host = ensureModalHost();
			host.innerHTML = searchHtml() + scopeChooserHtml(res);
			refreshIcons();
			// 選んでいる編成のタブが帯の外（スワイプの先）にあっても見える位置に寄せる
			revealSelectedTab(container);
			if (picking) {
				const input = q(host, 'find');
				if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
			}
		}

		/**
		 * 除外先のスキルセットを選ぶミニウィンドウ（C-54 の (3)）。呼び出し元が getScopeChoices() で
		 * 候補（{ id, name, skillIds }）を渡したときだけ。各候補に、本育成で得られるスキルが何種含まれているかを添える。
		 */
		function scopeChooserHtml(res) {
			if (!pickingScope) return '';
			const choices = (typeof opts.getScopeChoices === 'function' ? opts.getScopeChoices() : null) || [];
			const have = new Set(res.skillIds);
			let h = '<div class="usd-roster-modal" data-usd-el="scope-modal">';
			h += '<div class="usd-roster-modal-back" data-usd-act="cancel-scope"></div>';
			h += '<div class="usd-roster-modal-box" role="dialog" aria-modal="true" aria-label="除外するスキルセットを選ぶ">';
			h += '<div class="usd-roster-modal-head"><span class="usd-roster-h">除外するスキルセットを選ぶ</span>'
				+ '<button type="button" class="uma-icon-btn" data-usd-act="cancel-scope" aria-label="閉じる">×</button></div>';
			h += '<p class="usd-roster-note">選んだスキルセットから、本育成で得られるスキルを外します（元に戻せます）。</p>';
			h += '<div class="usd-roster-hits"><div class="usd-name-list">' + choices.map(c => {
				const n = (c.skillIds || []).filter(id => have.has(id)).length;
				return '<button type="button" class="usd-name-hit" data-usd-act="exclude-into" data-choice-id="' + esc(c.id) + '">'
					+ esc(c.name) + '<span class="usd-name-added">' + (n > 0 ? n + '種が含まれています' : '含まれていません') + '</span></button>';
			}).join('') + '</div></div>';
			h += '</div></div>';
			return h;
		}

		/** 除外を実行する（隠す＋選んだスキルセットから外す）。choiceId が null なら、選択中のものから外す。 */
		function runExclude(choiceId) {
			pickingScope = false;
			hide = true;
			applyHidden();
			if (typeof opts.onRemoveFromScope === 'function') opts.onRemoveFromScope(computed().skillIds.slice(), choiceId);
			render();
			lastOverlap = overlapWithScope(computed().skillIds);
		}

		function loadSelected(id) {
			// タブを離れる前に、名前欄の未反映の名前とドラフトを残す（C-53。黙って捨てない）
			flushPendingName();
			selectedId = id || '';
			const found = id ? findRoster(id) : null;
			roster = found ? snapshot(found) : restoreDraftRoster();
			roster.cardIds = (roster.cardIds || []).slice(0, ROSTER_CARD_SLOTS);
			while (roster.cardIds.length < ROSTER_CARD_SLOTS) roster.cardIds.push(null);
			picking = null;
			pickingScope = false;
			applyHidden();
			render();
			// 保存してある編成を選び直すのも「①（本育成編成）を操作した」うち。
			// ここで知らせないと、選んだ瞬間に②との重なりが生まれても気づけない。
			lastOverlap = -1;
			notifyOverlap();
		}

		function onPanelClick(ev) {
			const btn = ev.target.closest('[data-usd-act]');
			if (!btn || !(container.contains(btn) || (modalHost && modalHost.contains(btn)))) return;
			const act = btn.getAttribute('data-usd-act');
			if (act === 'pick-uma') { picking = { kind: 'uma' }; pickQuery = ''; pickType = ''; render(); renderHits(); }
			else if (act === 'pick-card') {
				picking = { kind: 'card', index: Number(btn.getAttribute('data-index')) };
				pickQuery = ''; pickType = '';
				render(); renderHits();
			}
			else if (act === 'cancel-pick') { picking = null; render(); }
			else if (act === 'toggle-unconf') { showUnconf = !showUnconf; render(); }
			else if (act === 'select-roster') { loadSelected(btn.getAttribute('data-tab-id') || ''); }
			else if (act === 'type') { pickType = btn.getAttribute('data-value') || ''; render(); renderHits(); }
			else if (act === 'clear-uma') { roster.umaId = ''; persistNow(); applyHidden(); render(); notifyOverlap(); }
			else if (act === 'clear-card') { roster.cardIds[Number(btn.getAttribute('data-index'))] = null; persistNow(); applyHidden(); render(); notifyOverlap(); }
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
				applyHidden(); render(); notifyOverlap();
			}
			else if (act === 'exclude') {
				// 1つの操作で「隠す」と「外す」の両方（C-51 の修正）。
				// ON にした時点で、すでに選んである分を外す。外すのは元に戻せないので、
				// 呼び出し元（テンプレート管理）が Undo に積む。OFF は隠すのをやめるだけ。
				// 除外先が複数あるときは、どのスキルセットから外すかを選んでもらう（C-54 の (3)）。
				if (hide) {
					hide = false;
					applyHidden();
					render();
					lastOverlap = overlapWithScope(computed().skillIds);
					return;
				}
				const choices = typeof opts.getScopeChoices === 'function' ? (opts.getScopeChoices() || []) : null;
				if (choices && choices.length > 1) { pickingScope = true; render(); return; }
				runExclude(choices && choices.length === 1 ? choices[0].id : null);
			}
			else if (act === 'exclude-into') { runExclude(btn.getAttribute('data-choice-id')); }
			else if (act === 'cancel-scope') { pickingScope = false; render(); }
			else if (act === 'duplicate') {
				// 複製（C-54 の (5)）。保存済みの編成を「（コピー）」の名前で増やし、そのタブへ移る
				if (!selectedId) return;
				const src = findRoster(selectedId);
				if (!src) return;
				flushPendingName();
				const copy = snapshot(src);
				copy.rosterId = uid('roster');
				copy.name = (src.name || '') + '（コピー）';
				copy.createdAt = nowIso();
				copy.updatedAt = nowIso();
				if (saveRoster(copy)) {
					loadSelected(copy.rosterId);
					toast('複製しました');
				}
			}
			else if (act === 'save') {
				const nameEl = q(container, 'name');
				roster.name = nameEl ? nameEl.value : roster.name;
				syncFixedFields();
				if (selectedId) {
					// 保存済み: 中身は触った時点で保存してあるので、ここで反映するのは名前
					saveRoster(snapshot(roster));
					toast('編成を保存しました');
					render();
				} else if (saveRoster(snapshot(roster))) {
					// 「＋ 新規」から保存: 保存済みのタブへ移り、ドラフトは空にする（二重管理を避ける）
					selectedId = roster.rosterId;
					if (draftKey) clearDraftRoster(draftKey);
					toast('編成を保存しました');
					render();
				}
			}
			else if (act === 'delete') {
				if (!selectedId) return;
				deleteRoster(selectedId);
				toast('編成を削除しました');
				selectedId = '';
				loadSelected('');
			}
		}
		container.addEventListener('click', onPanelClick);
		container.addEventListener('keydown', function (ev) {
			if (ev.target && ev.target.closest && ev.target.closest('.uma-subtabs')) tabStripKeydown(ev, (id) => loadSelected(id || ''));
		});

		function onPanelInput(ev) {
			const el = ev.target;
			const act = el.getAttribute && el.getAttribute('data-usd-act');
			if (act === 'find') {
				pickQuery = el.value;
				clearTimeout(findTimer);
				findTimer = setTimeout(function () { renderHits(); }, NAME_FIND_DEBOUNCE_MS);
			} else if (act === 'name') {
				roster.name = el.value;   // 再描画せずに覚えるだけ（入力中に描き直すと文字が飛ぶ）
				// 「＋ 新規」の名前はドラフトごと残す（保存済みの名前は「保存」かタブを離れるときに反映）
				if (!selectedId && draftKey) saveDraftRoster(draftKey, snapshot(roster));
			}
		}
		container.addEventListener('input', onPanelInput);

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

		container.innerHTML = '' +
			'<div class="usd-tm">' +
				// 見出しと帯のタブ（保存したスキルセットを選ぶ。先頭は「＋ 新規」＝ドラフト）
				'<div class="uma-subtabs-row" data-usd-el="head"></div>' +
				// 名前と保存・複製・削除（編成パネルと同じ並び。C-53）
				'<div class="usd-roster-row usd-tm-name-row">' +
					'<input type="text" class="usd-input uma-input usd-name-input" data-usd-el="name-input" placeholder="' + esc('新しい' + setLabel + 'の名前') + '"/>' +
					'<button type="button" class="uma-btn uma-btn--primary" data-usd-act="template-save">保存</button>' +
					'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="template-duplicate" data-usd-el="dup-btn">複製</button>' +
					'<button type="button" class="uma-btn uma-btn--ghost" data-usd-act="template-delete" data-usd-el="del-btn">削除</button>' +
				'</div>' +
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
						'</div>'
					: '') +
					'<div class="uma-section-body">' +
					/* 入口の並び（72セッション目・段11 ⑩ で畳めるようにした）。
					 *
					 * **以前は「スキルを追加」1つだけを出し、中の畳んだ見出しで3つに分かれていた。**
					 * それだと「テキストで検索」も「未収録スキルを追加」も、開いてみるまで在ることが
					 * 分からなかったので、**6つを並べて常時見せる**形にしてあった。
					 * 段9 で入口が6つになり、**375px では3段**（行の高さ 130px）を占めるようになったので、
					 * **まとめて畳めるように**した。**畳めるのは並び全体で、中の6つは畳んでも分かれない**
					 * ―― 昔の作りへ戻すのではなく、「全部見せる」と「全部しまう」の2択にしてある。
					 *
					 * **既定は開く。** 閉じて始めると、初めて開いた人には
					 * 「スキルを足す手段が1つも見えない画面」になる。
					 * **開閉は覚える**（`entryRowOpen`。モジュールの変数＝ページを開いている間だけ。
					 * 段10 の `pickerFilters` と同じ寿命）。畳むのは「もう足し終えて追加済みを眺めたい」
					 * ときなので、その間ずっと畳んだままでいてほしい。
					 *
					 * 畳む仕掛けは共通部品の `.uma-section`（`css/common.css`）をそのまま使う
					 * ―― あちらのコメントの「畳む必要が出たら <button> にして、開閉の向きを示す印を足す」が
					 * これ。印は `.uma-section-caret`（向きだけ common.css が受け持つ）。 */
					'<div class="uma-section usd-entry-section">' +
						'<button type="button" class="uma-section-head" data-usd-act="entry-toggle" data-usd-el="entry-toggle"' +
							' aria-expanded="' + entryRowOpen + '">' +
							'<i data-lucide="chevron-down" class="w-3.5 h-3.5 uma-section-caret"></i>' +
							'スキルの追加・リセット' +
						'</button>' +
						'<div class="uma-section-body" data-usd-el="entry-body"' + (entryRowOpen ? '' : ' hidden') + '>' +
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
						'<button type="button" class="uma-btn uma-btn--secondary" data-usd-act="editor-pick-custom">' +
							'<i data-lucide="plus" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> 未収録スキルを追加' +
						'</button>' +
						// 追加済みスキルの一括削除（C-3）。**A（スキルセット）の中に置く** ―― 名前の行に
						// 置くと、名前や B・C まで消えるように読める。消すのはスキルだけなので、
						// 消す範囲が位置から分かるここに置く。
						// **押せるときだけ赤く名乗る**（段1・⑪）。まとめて消すのは取り消しの効く操作だが
						// （Undo に積む）、いちばん多い操作（スキルを足す）と同じ並びに居るので、
						// 他の入口と同じ見た目だと押し間違える。0種のときは disabled で薄くなる。
						'<button type="button" class="uma-btn uma-btn--danger" data-usd-act="editor-clear-skills" data-usd-el="clear-skills">' +
							'<i data-lucide="minus" class="w-3.5 h-3.5" style="display:inline;vertical-align:-2px;"></i> リセット' +
						'</button>' +
					'</div>' +
						'</div>' +   // .uma-section-body（入口の並びの中身。畳むのはここ）
					'</div>' +       // .usd-entry-section
					// 分類の切り替え（超優先／優先／通常。C-57 の (7)）。追加の入口はいま選んでいる分類に足す
					'<div class="usd-tier-row" data-usd-el="tier-row"></div>' +
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

		const nameInput = q(container, 'name-input');

		container.addEventListener('click', (e) => {
			const btn = e.target.closest('[data-usd-act]');
			if (!btn || !container.contains(btn)) return;
			const act = btn.dataset.usdAct;
			if (act === 'template-tab') selectTab(btn.dataset.tabId);
			else if (act === 'template-save') saveCurrent();
			else if (act === 'template-duplicate') duplicateTemplate(currentTemplateId());
			else if (act === 'template-delete') deleteTemplate(currentTemplateId());
			else if (act === 'editor-pick') openEditorPicker('filter');
			else if (act === 'entry-toggle') setEntryRowOpen(!entryRowOpen);
			else if (act === 'editor-pick-passive') openEditorPicker('passive');
			else if (act === 'editor-pick-text') openEditorPicker('paste');
			else if (act === 'editor-pick-custom') openEditorPicker('custom');
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
		});
		container.addEventListener('change', (e) => {
			const box = e.target;
			if (!box || !box.getAttribute || box.getAttribute('data-usd-act') !== 'scope-check') return;
			setScope(box.dataset.scope, box.checked);
		});
		container.addEventListener('input', (e) => {
			if (e.target === nameInput) onNameInput();
		});
		container.addEventListener('keydown', (e) => {
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
			if (isSelected(target)) fireSelection();
			fireChange();
		}

		function renderTabs() {
			const list = ensureUserData().templates;
			const onDraft = !currentTemplateId();
			const items = [{
				id: DRAFT_SELECTION_ID, label: '＋ ' + DRAFT_LABEL, isNew: true, selected: onDraft,
				count: draftScope.skillIds.length > 0 ? draftScope.skillIds.length + '種' : null,
				title: DRAFT_LABEL + '：保存していない' + setLabel
			}].concat(list.map(t => ({
				id: t.templateId, label: t.name || '（名称未設定）', title: t.name || '（名称未設定）',
				selected: t.templateId === selectedId, count: t.skillIds.length + '種'
			})));
			q(container, 'head').innerHTML =
				'<p class="usd-roster-h usd-roster-h--top">' + esc(setLabel) + '（<span data-usd-el="count-badge">' + list.length + '</span>／' + TEMPLATE_LIMIT + '件）</p>' +
				tabStripHtml(items, { act: 'template-tab', ariaLabel: setLabel, el: 'tabs' });
			revealSelectedTab(container);
		}

		/* 入口の並びの開閉（72セッション目・段11 ⑩）。
		   **`entryRowOpen` が正**で、DOM はその写し。`render()` は HTML を作り直さない
		   （入口の並びは一度きりの組み立て）ので、ここで属性を付け替える。 */
		function setEntryRowOpen(open) {
			entryRowOpen = !!open;
			const btn = q(container, 'entry-toggle');
			const body = q(container, 'entry-body');
			if (btn) btn.setAttribute('aria-expanded', String(entryRowOpen));
			if (body) body.hidden = !entryRowOpen;
		}

		function renderNameRow() {
			const target = currentTarget();
			nameInput.value = target.kind === 'template' ? (target.obj.name || '') : (draftScope.name || '');
			q(container, 'dup-btn').hidden = target.kind !== 'template';
			q(container, 'del-btn').hidden = target.kind !== 'template';
		}

		// 分類の切り替え（超優先／優先／通常）と合計（C-57 の (7)）
		function renderTierRow() {
			const ids = editingSkillIds();
			const tiers = tiersOf(currentTarget());
			const counts = {};
			TIERS.forEach(t => { counts[t.id] = 0; });
			ids.forEach(id => { counts[tierOf(tiers, id)]++; });
			q(container, 'tier-row').innerHTML =
				'<div class="usd-tier-tabs" role="tablist" aria-label="スキルセットの分類">' +
				TIERS.map(t => '<button type="button" role="tab" class="uma-pill usd-tier-tab' + (t.id === currentTier ? ' active' : '') + '"'
					+ ' data-usd-act="tier-tab" data-tier="' + t.id + '" aria-selected="' + (t.id === currentTier ? 'true' : 'false') + '">'
					+ esc(t.label) + '<span class="usd-tier-count" data-usd-el="tier-count-' + t.id + '">' + counts[t.id] + '</span></button>').join('') +
				'</div>' +
				'<span class="usd-tier-total">設定数 <span data-usd-el="tier-total">' + ids.length + '</span></span>';
		}

		// モードのボタンの押した状態（C-57 の (9)）。「すべて外す」は削除モードのときだけ出す
		function renderModes(count) {
			const reclass = q(container, 'mode-reclass');
			const del = q(container, 'mode-delete');
			reclass.setAttribute('aria-pressed', mode === 'reclass' ? 'true' : 'false');
			del.setAttribute('aria-pressed', mode === 'delete' ? 'true' : 'false');
			reclass.disabled = count === 0;
			del.disabled = count === 0;
			// 一括削除（C-3）は**常に見えている**。0種のときは押せない
			// （削除モードのときだけ出る隠れた導線より、常時見えるほうが分かりやすい）
			const clear = q(container, 'clear-skills');
			clear.disabled = count === 0;
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
			// 件数はセット全体（分類ごとの件数は分類の切り替えの側に出す）
			q(container, 'selected-count').textContent = String(ids.length);
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
					+ '<span class="usd-panel-name">' + esc(getSkillName(id)) + '</span>'
					+ (ops ? '<span class="usd-panel-ops">' + ops + '</span>' : '')
					+ '</div>';
			}).join('');
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
		function persistDraft(skillIds, name, tiers, scopes) {
			const nextTiers = tiers !== undefined ? tiers : draftScope.tiers;
			const nextScopes = scopes !== undefined ? scopes : draftScope.scopes;
			if (draftScopeKey) return saveDraftScope(draftScopeKey, skillIds, name, nextTiers, setLabel, nextScopes);
			const out = { skillIds: (skillIds || []).slice(), name: typeof name === 'string' ? name : '', updatedAt: nowIso() };
			if (nextTiers && typeof nextTiers === 'object' && Object.keys(nextTiers).length > 0) out.tiers = Object.assign({}, nextTiers);
			if (nextScopes && typeof nextScopes === 'object' && Object.keys(nextScopes).length > 0) out.scopes = Object.assign({}, nextScopes);
			return out;
		}

		/**
		 * 「保存」。テンプレートなら名前を反映するだけ（スキルは触った時点で保存済み）。
		 * ドラフトなら、名前を付けてテンプレートを作り、そのタブへ移る（ドラフトは空になる＝二重管理を避ける）。
		 */
		function saveCurrent() {
			const target = currentTarget();
			const data = ensureUserData();
			if (target.kind === 'template') {
				target.obj.name = nameInput.value;
				target.obj.updatedAt = nowIso();
				saveUserData();
				render();
				fireSelection();
				fireChange();
				toast(setLabel + 'を保存しました');
				return;
			}
			if (draftScope.skillIds.length === 0) { toast('スキルを1件以上選んでください'); return; }
			if (data.templates.length >= TEMPLATE_LIMIT) {
				toast(setLabel + 'は最大' + TEMPLATE_LIMIT + '件までです。不要なものを削除してください');
				return;
			}
			const t = { templateId: uid('tpl'), name: nameInput.value, skillIds: draftScope.skillIds.slice(), createdAt: nowIso(), updatedAt: nowIso() };
			// ドラフトの分類（C-57）と節の ON/OFF（C-2a）もテンプレートへ写す
			// （「優先」だけなら tiers は持たない／全部 OFF なら scopes は持たない）
			setTemplateTiers(t, draftScope.tiers || {});
			setTemplateScopes(t, draftScope.scopes || {});
			data.templates.push(t);
			saveUserData();
			// 中身はテンプレートへ移ったので、ドラフトは空にする（二重管理を避ける）。
			// **{} を渡して明示的に消す** ―― persistDraft は undefined を「今のものを引き継ぐ」と読む
			draftScope = persistDraft([], '', {}, {});
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
		 * 編集中のセットの追加済みスキルを全て削除する（C-3）。
		 *
		 * **消すのはスキルと分類だけ。** セットの名前も、B・C（節の ON/OFF）も触らない
		 * ―― チェックはもう一度押せば戻せるが、スキルは1件ずつ消すのに手数がかかる。
		 * 消したいのはスキルのほうなので、そこに限る。
		 *
		 * ドラフトでもテンプレートでも同じ操作にしてある（見た目が同じなので、
		 * 片方だけ出来ないと「なぜここには無いのか」を考えさせることになる）。
		 * 破壊的な操作は確認ダイアログではなく「即実行＋元に戻す」で統一する方針に従う。
		 * probe / apply が見るのも**スキルと分類だけ**（名前と B・C は変わらないので混ぜない
		 * ―― 混ぜると、正しく戻せても「戻っていない」と判定してしまう）。
		 */
		function clearEditingSkills() {
			const target = currentTarget();
			const ids = skillIdsOf(target);
			if (!ids || ids.length === 0) return;
			const prev = snapshot(ids);
			const prevTiers = snapshot(tiersOf(target));   // 分類（C-57）も一緒に戻す
			// 状態を変える前に積む。積んだ時点の probe() が「戻るべき姿」になる。
			pushUndo({
				scope: 'list',
				// 数えているのはスキルの種類数なので単位は「種」。取り消し側は実行時と別の文にする
				// （「元に戻しました」に実行時の文を連結すると「戻した結果、消えた」とも読めるため）。
				doneLabel: '追加済みスキル' + prev.length + '種を削除しました',
				undoneLabel: '削除した追加済みスキル' + prev.length + '種を戻しました',
				probe: () => probeOf(skillIdsOf(target)),
				apply: () => {
					if (!writeSkillIds(target, snapshot(prev), snapshot(prevTiers))) return false;
					picker.excludeIds = picker.excludeIds.concat(prev.filter(id => picker.excludeIds.indexOf(id) === -1));
					afterEditingSkillsChanged(target);
					return true;
				}
			});
			if (!writeSkillIds(target, [], tiersWithout(prevTiers, prev))) return;
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
		// マスターの版（取得URLの ?v=）。検査が「JSON の masterVersion と揃っているか」を見る。
		MASTER_JSON_VERSION: MASTER_JSON_VERSION,
		// data/ の6ファイルの版（同上。正本は各 JSON の dataVersion）。
		DATA_JSON_VERSIONS: DATA_JSON_VERSIONS,
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
		// サポートカードの種類。データに type が入るまでは空配列を返す（C-51 の修正2）。
		listCardTypes: listCardTypes,
		cardTypeOf: cardTypeOf,
		isReferableSkillId: isReferableSkillId,
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
		/**
		 * 廃した値をいまの値へ読み替えたタグの組（70セッション目・段2）。
		 * カスタムスキルを読むときに通している。**検査が読み替えの表を書き写さずに
		 * 済むよう**公開してある（`pickableOptions` と同じ考え方）。
		 */
		withLegacyTagsMapped: withLegacyTagsMapped,

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
		// 帯のタブ（共有部品。C-54）。special の親A／親Bセットのタブが使う
		tabStrip: { html: tabStripHtml, reveal: revealSelectedTab, keydown: tabStripKeydown },
		// スキルセットの分類（C-57）。呼び出し元（special の照合結果の表）が印を出すために使う
		tiers: { list: TIERS.map(t => ({ id: t.id, label: t.label })), defaultTier: TIER_DEFAULT, of: tierOf, label: tierLabel, markHtml: tierMarkHtml },
		listRosters: listRosters,
		computeRosterSkills: computeRosterSkills,
		getPickerHiddenIds: function () { return pickerHiddenIds.slice(); },
		setPickerHiddenIds: function (ids) { pickerHiddenIds = (ids || []).slice(); },

		// スキル選択モーダル
		openSkillPicker: openSkillPicker,
		openTextSkillPicker: openTextSkillPicker,
		openSkillRowsPicker: openSkillRowsPicker,
		openCustomSkillPicker: openCustomSkillPicker,
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
