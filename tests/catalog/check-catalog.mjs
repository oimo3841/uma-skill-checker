// data/ に置く7ファイル（拡張スキル・育成ウマ娘・サポートカード・
// サポートカードのイベントスキル・シナリオ因子・遺伝子・レースの距離の一覧）が、決めた形どおりかを確かめる。
// （シナリオ因子は63セッション目・段1d に追加。それまでこのファイルだけ対象外だった。
//   遺伝子は64セッション目・段A に新設と同時に追加。
//   レースの距離の一覧は 2026-09-26・C-97 に新設と同時に追加 ―― `entries` を持たない形なので
//   FILES のループには入れず、§8 で独自に見る。
//   めろっぷ用の行の並び（melop-sheet-rows.json）は 2026-09-27・C-101 に新設と同時に追加 ―― 同じく §9。
//   スキルの効率（skill-efficiency.json）は 2026-10-09・C-136 に新設と同時に追加 ―― §14）
//
//   npm run check:catalog        … 単体で回す
//   npm run test:verify          … 納品前チェックの §10 からも呼ばれる
//   node tests/catalog/check-catalog.mjs --dir=<フォルダ> --baseline=<フォルダ>
//                                … 検査そのものの動作確認用。--dir は見に行く場所を差し替え、
//                                  --baseline は「以前の内容」を git の HEAD ではなく
//                                  別のフォルダから読む（退行の検査を手元で起こせるようにするため）
//
// ■ なぜ要るか
//   この6ファイルはおいもさんが用意し、手でも書き足す。ツールは中の id を鍵にして
//   保存済みの比較シートの行を指すので、**形の崩れが利用者のデータの崩れに直結する**。
//   目で見て確かめるには件数が多すぎる（スキルだけで千件規模）ので機械で見る。
//
// ■ 設計の決めごと
//   1. **スキル名・カード名・ウマ娘名をこのファイルに1つも書かない。** 件数も名前も
//      すべてファイルから読む（恒久ルール1）。ここに名前を書くと、データが変わるたびに
//      検査のほうを直す羽目になり、検査が「データに合わせて甘くなる」方向に働く。
//   2. **キーは許可リスト方式で、知らないキーがあったら落とす。** 想定していない項目が
//      混ざったまま公開されるのを防ぐための関門で、形の検査であると同時に中身の関門でもある。
//   3. **id が消えていたら落とす。** 更新の運用は「既存の行は id を引き継いで中身を直す」
//      「新しいものは末尾に足す」の2つだけと決めてある。id が消えるのはその運用から
//      外れた印で、保存済みの比較シートが行を見失う。名前の変更は正当（表記の修正）なので
//      落とさず警告にする。
//   4. **判定は id を鍵に行い、併記の name は照合の控えとして突き合わせるだけ。**
//      name が指す先とずれていたら落とす（手で書き足すときの取り違えをここで捕まえる）。
//
// ■ data/ の6ファイル以外に見ているもの
//   §4-2 だけは**マスター（uma-skill-deck-skills.json）のタグ**を見る。決めごと4 と同じ
//   「手で書くときの取り違え」の検査で、69セッション目に実際の取り違え（レース場のタグの
//   入れ替わり2件）を見つけたのを機に足した。`test:master` は毎セッションの手順にも
//   pre-push の関門にも入っていないので、そちらではなくここに置いてある。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
function argValue(name) {
	const p = '--' + name + '=';
	const a = args.find((x) => x.startsWith(p));
	return a ? a.slice(p.length) : '';
}
const DIR = argValue('dir') || 'data';
const BASELINE_DIR = argValue('baseline');
const MASTER_FILE = 'uma-skill-deck-skills.json';

/* ──────────────────────── 形の定義（許可リスト） ──────────────────────── */

// idTail … 接頭辞を外した残りの形。
//   'serial' … 4桁以上の数字（末尾に足して nextSerial を1つ進める運用）
//   'slug'   … 英小文字・数字をハイフンでつないだ語（採番しない。件数が少なく、
//              ゲーム側の区分にそのまま対応するので、番号より語のほうが読める）
const FILES = [
	{ category: 'extendedSkill', file: 'extended-skills.json', prefix: 'ex-', key: 'id', idTail: 'serial' },
	{ category: 'trainingUmamusume', file: 'training-umamusume.json', prefix: 'uma-', key: 'id', idTail: 'serial' },
	{ category: 'supportCard', file: 'support-cards.json', prefix: 'card-', key: 'id', idTail: 'serial' },
	// イベントスキルは独自の id を振らず、サポートカードの id（card-）を鍵にする
	{ category: 'supportCardEventSkill', file: 'support-card-event-skills.json', prefix: 'card-', key: 'cardId', idTail: 'serial' },
	// キャラクター共通のイベント（C-102 の区切り3・2026-09-27）。独自の id を振らず、キャラクター名（charaName）を鍵にする。
	// idTail 'name' … 接頭辞も番号も無い「名前」の鍵。空でないこと・重複しないことだけを見る（名前の実在は §3-2）
	{ category: 'characterEventSkill', file: 'character-event-skills.json', prefix: '', key: 'charaName', idTail: 'name' },
	// シナリオ因子（C-29）。63セッション目（段1d）に検査の対象へ入れた。
	// それまでこのファイルだけ入口に関門が無く、core 側の normalizeCatalogEntries() が
	// 「{id, name, category} に削ぎ落とす」ことで**偶然**想定外のキーを止めていた。
	// 段1c でそこを素通しにした（C-64）ので、止める場所がどこにも無くなった。
	// 非スキルの因子を手で足していく作業の前に埋める。
	{ category: 'scenarioFactor', file: 'scenario-inheritance-factors.json', prefix: 'sf-', key: 'id', idTail: 'slug' },
	// 遺伝子（64セッション目・段A で新設。C-67）。シナリオ因子と同じ「スキルではないカタログ」で、
	// 持つのは名前と id だけ（tags を持たないので「条件でスキルを検索」の母集団には入らない）。
	{ category: 'geneFactor', file: 'aptitude-genes.json', prefix: 'ap-', key: 'id', idTail: 'slug' },
];

// 上位のキー。need=必須 / opt=あってもよい。これ以外は落とす。
// イベントスキルのファイルは独自の id を振らないので nextSerial を持たない（行の鍵は cardId）。
const TOP_KEYS = {
	extendedSkill: { need: ['dataVersion', 'category', 'nextSerial', 'entries'], opt: ['note'] },
	trainingUmamusume: { need: ['dataVersion', 'category', 'nextSerial', 'entries'], opt: ['note'] },
	supportCard: { need: ['dataVersion', 'category', 'nextSerial', 'entries'], opt: ['note'] },
	supportCardEventSkill: { need: ['dataVersion', 'category', 'entries'], opt: ['note'] },
	characterEventSkill: { need: ['dataVersion', 'category', 'entries'], opt: ['note'] },
	// シナリオ因子は採番しない（id が語）ので nextSerial を持たない。
	// idNote / schemaNote はこのファイルだけが持つ覚え書き（C-29 のときからある）。
	scenarioFactor: { need: ['dataVersion', 'category', 'entries'], opt: ['note', 'idNote', 'schemaNote'] },
	// 遺伝子も採番しない（id が語）ので nextSerial を持たない。
	// schemaNote は入れない ―― 追加カタログの共通の形の説明はシナリオ因子のファイルが持っており、
	// 同じ説明を2か所に置くと片方が古くなる。
	geneFactor: { need: ['dataVersion', 'category', 'entries'], opt: ['note', 'idNote'] },
};

const ENTRY_KEYS = {
	// raceDistance（レースの距離の限定）は 2026-09-26・C-97 で許可した（おいもさんの承認）。中身の形は RACE_DISTANCE_KEYS と §2-2
	extendedSkill: { need: ['id', 'name'], opt: ['tags', 'tagsPending', 'raceDistance'] },
	trainingUmamusume: { need: ['id', 'title', 'charaName', 'initialStar', 'initialSkills', 'awakeningSkills', 'dataStatus'], opt: [] },
	// type（種類）と typeOrder（ゲーム内で扱われる順番）は、どちらもデータが持つ値。
	// **名前も番号もこのスクリプトに書かない**（恒久ルール1）。見るのは値どうしの整合だけ。
	// rarity・isGroup・groupMembers は 2026-09-27（C-102 の区切り3）に data-work の公開用データで入った。
	// groupMembers はグループのカード（isGroup が true）の行にだけある（§2 で見る）
	// groupName（グループのサポートカードの正式な名称）は 2026-09-30 に入った。グループのカードの行にだけあってよい（§2 で見る）
	supportCard: { need: ['id', 'title', 'charaName', 'type', 'typeOrder', 'hintSkills', 'dataStatus', 'rarity', 'isGroup'], opt: ['groupMembers', 'groupName'] },
	// 2026-09-27・C-102 で形を作り替えた（それまでは { cardId, status, skills } の平たい一覧。行は0件だった）。
	// chain（確かめた形）と unplaced（シートから取り込んだまま）は status でどちらを持つかが決まる（§5）
	supportCardEventSkill: { need: ['cardId', 'status'], opt: ['chain', 'unplaced'] },
	// キャラクター共通のイベント（C-102 の区切り3）。回の番号が無いだけで、中身の形は連続イベントと同じ
	characterEventSkill: { need: ['charaName', 'status'], opt: ['events', 'unplaced'] },
	// **いまの形をそのまま許可リストにする。** tags / 説明文など、今後足す予定のキーは
	// まだ入れない（実際に足すときに、形も運用も決めたうえでここへ入れる）。
	scenarioFactor: { need: ['id', 'name'], opt: [] },
	// **遺伝子は名前と id だけ。** tags / tagsPending を持たせない（C-67 の0節・6節）。
	// 許可リストに入れていないので、うっかり足せばここで落ちる。
	geneFactor: { need: ['id', 'name'], opt: [] },
};

/* **マスターの行のキー**（2026-09-26・C-97 に新設）。それまでマスターの行のキーを見る検査は無く、
   `raceDistance` を受け入れるのを機に、拡張スキルと同じ許可リスト方式にした。 */
const MASTER_ENTRY_KEYS = { need: ['id', 'name', 'tags'], opt: ['raceDistance'] };
/* **raceDistance（レースの距離の限定。C-96・C-97）の中身。**
   - min・max … 両端を含む整数（「3000m未満」は max 2999）。少なくとも一方を持つ
   - standardDistance … 根幹距離 true／非根幹距離 false。**min・max とは排他**（数字を持つ行には書かない）
   - scope … "all"（限定がスキル全体にかかる）／"part"（一部にかかる）。**必ず書く**
   - distanceTagScope … "all"／"part"。**距離のタグと raceDistance の両方を持つ行にだけ**書く */
const RACE_DISTANCE_KEYS = { need: ['scope'], opt: ['min', 'max', 'standardDistance', 'distanceTagScope'] };
const SCOPE_VALUES = ['all', 'part'];
/* レースの距離の一覧（data/race-distances.json。C-97）。区分の境目と実在する距離。
   `entries` を持たないので FILES には入れず、§8 で見る。 */
const RACE_FILE = 'race-distances.json';
const RACE_TOP_KEYS = { need: ['dataVersion', 'category', 'distanceCategories', 'distances'], opt: ['note'] };
const RACE_CATEGORY_KEYS = { need: ['key', 'name'], opt: ['minDistance', 'maxDistance'] };
const RACE_ROW_KEYS = { need: ['distance', 'category', 'surfaces'], opt: [] };
const RACE_CATEGORY_NAME = 'raceDistance';
/* これから開催されるレースの一覧（data/upcoming-races.json。オススメサポ ④・段7・2026-10-04）。`entries` を持たない
   （同じ名前のレースが複数あるので、スキルの名前の突き合わせに混ぜない）ので FILES には入れず、§12 で見る。
   どの行もすべての項目を書く（公開されていない項目は null）。 */
const UPCOMING_FILE = 'upcoming-races.json';
const UPCOMING_TOP_KEYS = { need: ['dataVersion', 'category', 'races'], opt: ['note'] };
const UPCOMING_ROW_KEYS = { need: ['id', 'name', 'date', 'dateLabel', 'venue', 'surface', 'distance', 'distanceCategory', 'direction', 'course', 'season', 'weather', 'ground', 'time', 'rule'], opt: [] };
const UPCOMING_CATEGORY_NAME = 'upcomingRace';
/* ②にまとめて追加するスキルのグループ（data/recommended-skills.json。C-130・2026-10-06）。`entries` を持たないので
   FILES には入れず、§13 で見る。onlyWhenRaceDistanceClass は race-distances.json の区分のキーの配列。 */
const RECOMMENDED_FILE = 'recommended-skills.json';
const RECOMMENDED_TOP_KEYS = { need: ['category', 'dataVersion', 'groups'], opt: ['equivalentPairs', 'note'] };
// 同じものとして扱うスキルの組（C-131。目覚めと、対応するスキル）
const RECOMMENDED_PAIR_KEYS = { need: ['key', 'skillIds'], opt: [] };
const RECOMMENDED_GROUP_KEYS = { need: ['key', 'label', 'skills'], opt: [] };
const RECOMMENDED_SKILL_KEYS = { need: ['skillId', 'name'], opt: ['onlyWhenRaceDistanceClass'] };
const RECOMMENDED_CATEGORY_NAME = 'recommendedSkills';
/* めろっぷ用の行の並び（data/melop-sheet-rows.json。C-101）。めろっぷ！【LTC】さんの因子管理シートの
   ★を貼る欄（H38:J601。2026-10-08 に H38:J599 から2行増えた）の行の並び。`entries` を持たないので FILES には入れず、§9 で見る。
   行番号の範囲は貼り先の形そのものなので、ここに数字で持つ（シートの欄が変わったら、こことデータを一緒に直す）。 */
const MELOP_FILE = 'melop-sheet-rows.json';
const MELOP_TOP_KEYS = { need: ['dataVersion', 'category', 'rows'], opt: ['note'] };
const MELOP_ROW_KEYS = { need: ['row', 'group', 'name'], opt: ['id', 'slot', 'column'] };
const MELOP_CATEGORY_NAME = 'melopSheetRows';
const MELOP_SLOTS = ['blue', 'red', 'unique'];
const MELOP_FIRST_ROW = 38;
const MELOP_LAST_ROW = 601;

const SKILL_REF_KEYS = { need: ['skillId', 'name'], opt: [] };
/* **サポートカードのイベント（C-102）。** 1回ぶんは { step, choices }。
   - step … 何回目か。1以上の整数・昇順・重複なし・上限なし。**スキルが得られる回だけ**を書くので、
     どの回にもスキルが1つ以上ある
   - choices … ゲームの選択肢の並び（上から）のまま。スキルを得ない選択肢も空の選択肢として書く。
     1つの選択肢は次の**どちらか一方の形**だけ:
       { skills: [参照] }              … 成否に分かれない
       { results: [[参照], [参照], …] } … 結果が分かれる。結果は2つ以上。**並びの先頭がいちばん良い結果（成功）**で、
                                         2番目以降が失敗側（成功に近い順）。編成パネルは先頭だけを使う
     選択肢が1つで { skills } の形のものは確定のイベントなので、skills を空にしない
   - 参照 … { skillId, name, hintLevel }。hintLevel はヒントのレベル（1以上の整数。上限は決めない）
   同じ枠（1つの skills・1つの結果）の中で同じスキルが2回出たら落とす。 */
const EVENT_KEYS = { need: ['step', 'choices'], opt: [] };
// キャラクター共通のイベントの1つ（回の番号を持たない）
const CHARA_EVENT_KEYS = { need: ['choices'], opt: [] };
// サポートカードのレアリティ（C-102 の区切り3）。**ゲームにある3つの区分そのもの**なので、値の集合をここに持つ
// （スキル名・カード名ではない。増えたらここを足す）
const RARITY_VALUES = ['R', 'SR', 'SSR'];
const EVENT_SKILL_REF_KEYS = { need: ['skillId', 'name', 'hintLevel'], opt: [] };
const EVENT_CHOICE_FORMS = ['skills', 'results'];
const STAR_ROW_KEYS = { need: ['minStar', 'skills'], opt: [] };
const LEVEL_ROW_KEYS = { need: ['level', 'skills'], opt: [] };
const DATA_STATUS_KEYS = {
	trainingUmamusume: { need: ['initial', 'awakening'], opt: [] },
	supportCard: { need: ['hint'], opt: [] },
};

const STATUS_VALUES = ['done', 'none', 'pending'];
// done（確かめた）／none（無いと確かめた）／seeded（シートから取り込んだまま。C-102）
const EVENT_STATUS_VALUES = ['done', 'none', 'seeded'];
const STAR_MIN = 1, STAR_MAX = 5;
// 覚醒レベルに上限は設けない（0以上の整数・昇順・重複なし だけを見る）。
// レベルの上限はゲーム側で変わりうるので、決め打ちにすると、増えたときに
// 正しいデータのほうが落ちる。0 は「覚醒のレベルに紐づかない枠（最初から
// 持っているスキル）」を表すので、下限は 1 ではなく 0。
const LEVEL_MIN = 0;
const DATA_VERSION_RE = /^\d{4}-\d{2}-\d{2}[a-z]$/;
const SERIAL_RE = /^(\d{4,})$/;
// 語の形の id（接頭辞を外した残り）。英小文字と数字をハイフンでつなぐ。
// 大文字・記号・全角を弾くのが狙い（手で足すときの取り違えをここで捕まえる）。
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ──────────────────────── 出力 ──────────────────────── */

let ok = true;
const warnings = [];
const SHOW = 10; // 明細は先頭この件数まで（落ちたときに画面が埋まらないように）
function check(cond, label, detail) {
	if (!cond) ok = false;
	let tail = '';
	if (detail !== undefined) {
		const arr = Array.isArray(detail) ? detail : [detail];
		tail = '  ' + JSON.stringify(arr.slice(0, SHOW)) + (arr.length > SHOW ? ` ほか${arr.length - SHOW}件` : '');
	}
	console.log((cond ? '[OK] ' : '[NG] ') + label + tail);
}
function none(list, label) { check(list.length === 0, label, list.length ? list : undefined); }
function warn(label, detail) {
	const arr = detail === undefined ? [] : (Array.isArray(detail) ? detail : [detail]);
	const tail = arr.length ? '  ' + JSON.stringify(arr.slice(0, SHOW)) + (arr.length > SHOW ? ` ほか${arr.length - SHOW}件` : '') : '';
	warnings.push(label + tail);
	console.log('[警告] ' + label + tail);
}

/* ──────────────────────── 読み込み ──────────────────────── */

function readJsonFile(abs) {
	try {
		return { ok: true, data: JSON.parse(fs.readFileSync(abs, 'utf8')) };
	} catch (e) {
		return { ok: false, error: String(e.message || e) };
	}
}
function readJsonText(text) {
	try {
		return { ok: true, data: JSON.parse(text) };
	} catch (e) {
		return { ok: false, error: String(e.message || e) };
	}
}
/** 「以前の内容」。--baseline があればそのフォルダから、無ければ git の HEAD から読む。 */
function readPrevious(relFile) {
	if (BASELINE_DIR) {
		const abs = path.join(REPO_ROOT, BASELINE_DIR, relFile);
		if (!fs.existsSync(abs)) return null;
		const r = readJsonFile(abs);
		return r.ok ? r.data : null;
	}
	const r = spawnSync('git', ['show', 'HEAD:' + DIR + '/' + relFile], { cwd: REPO_ROOT, encoding: 'utf8' });
	if (r.status !== 0) return null; // HEAD にまだ無い＝今回が初回
	const p = readJsonText(r.stdout);
	return p.ok ? p.data : null;
}

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isArr = (v) => Array.isArray(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

/**
 * キーの許可リスト照合。知らないキー・足りないキーをそれぞれの箱へ入れる。
 * where は「どこの話か」を示す文字列（落ちたときに場所が分かるようにするためだけのもの）。
 */
function checkKeys(obj, spec, where, unknown, missing) {
	if (!isObj(obj)) { missing.push(where + ': オブジェクトではない'); return false; }
	const keys = Object.keys(obj);
	const allowed = spec.need.concat(spec.opt);
	keys.filter((k) => !allowed.includes(k)).forEach((k) => unknown.push(where + ': ' + k));
	spec.need.filter((k) => !keys.includes(k)).forEach((k) => missing.push(where + ': ' + k));
	return true;
}

console.log('=== 収録データの形の検査（' + DIR + '/） ===');

/* ──────────────────────── 1. ファイルの形 ──────────────────────── */

console.log('\n=== 1. ファイルの形 ===');

const master = readJsonFile(path.join(REPO_ROOT, MASTER_FILE));
check(master.ok && isArr(master.data && master.data.skills), MASTER_FILE + ' が読める', master.ok ? undefined : master.error);
if (!master.ok) { console.log('\n=== 総合: NG ==='); process.exit(1); }

const masterSkills = master.data.skills;
const masterNameById = new Map(masterSkills.map((s) => [String(s.id), String(s.name)]));
// 8軸の並びはマスターから読む（軸名をこのファイルに書かないため）
const TAG_AXES = Object.keys((masterSkills[0] && masterSkills[0].tags) || {});
check(TAG_AXES.length > 0, 'マスターからタグの軸を読めた（' + TAG_AXES.length + '軸）');

const docs = {};
{
	const unreadable = [], badTop = [], badCategory = [], badVersion = [];
	const unknown = [], missing = [];
	for (const f of FILES) {
		const abs = path.join(REPO_ROOT, DIR, f.file);
		if (!fs.existsSync(abs)) { unreadable.push(f.file + ': ファイルが無い'); continue; }
		const r = readJsonFile(abs);
		if (!r.ok) { unreadable.push(f.file + ': ' + r.error); continue; }
		docs[f.category] = r.data;
		checkKeys(r.data, TOP_KEYS[f.category], f.file, unknown, missing);
		if (r.data.category !== f.category) badCategory.push(f.file + ': ' + String(r.data.category));
		if (!DATA_VERSION_RE.test(String(r.data.dataVersion))) badVersion.push(f.file + ': ' + String(r.data.dataVersion));
		if (!isArr(r.data.entries)) badTop.push(f.file + ': entries が配列でない');
	}
	none(unreadable, FILES.length + 'ファイルすべてが JSON として読める');
	none(unknown, '上位に知らないキーが無い');
	none(missing, '上位の必須のキーが揃っている');
	none(badCategory, 'category がファイルと対応する');
	none(badVersion, 'dataVersion が「YYYY-MM-DD＋英小文字1字」の形');
	none(badTop, 'entries が配列');
}
if (Object.keys(docs).length !== FILES.length) {
	console.log('\n=== 総合: NG（読めないファイルがあるので、以降の検査は行わない） ===');
	process.exit(1);
}

/* ──────────────────────── 2. 項目のキーと型 ──────────────────────── */

console.log('\n=== 2. 項目のキーと型 ===');

const unknownKeys = [], missingKeys = [], badTypes = [];

/** スキルの参照（{skillId, name}）。集めた参照は後段でまとめて突き合わせる。 */
const refs = []; // { where, skillId, name }
function readSkillRefs(list, where, spec) {
	const keys = spec || SKILL_REF_KEYS;
	if (!isArr(list)) { badTypes.push(where + ': 配列でない'); return; }
	list.forEach((ref, i) => {
		const w = where + '[' + i + ']';
		if (!checkKeys(ref, keys, w, unknownKeys, missingKeys)) return;
		if (!isStr(ref.skillId) || !isStr(ref.name)) { badTypes.push(w + ': skillId / name は空でない文字列'); return; }
		if (keys.need.includes('hintLevel') && (!isInt(ref.hintLevel) || ref.hintLevel < 1)) badTypes.push(w + '.hintLevel: 1以上の整数');
		refs.push({ where: w, skillId: ref.skillId, name: ref.name });
	});
}

/** 1つの枠（skills か1つの結果）の中で、同じスキルが2回出ていないか。 */
function checkNoDupInBucket(list, where) {
	if (!isArr(list)) return;
	const seen = new Set();
	list.forEach((ref) => {
		const id = ref && ref.skillId;
		if (!id) return;
		if (seen.has(id)) badTypes.push(where + ': 同じスキルが2回ある（' + id + '）');
		seen.add(id);
	});
}

/** サポートカードの連続イベント（C-102。形の決まりは EVENT_KEYS の上のコメント）。 */
/* withStep が偽なら、キャラクター共通のイベント（回の番号を持たない。C-102 の区切り3）として見る。 */
function readEventChain(chain, where, withStep = true) {
	if (!isArr(chain)) { badTypes.push(where + ': 配列でない'); return; }
	let prevStep = 0;
	chain.forEach((ev, i) => {
		const w = where + '[' + i + ']';
		if (!checkKeys(ev, withStep ? EVENT_KEYS : CHARA_EVENT_KEYS, w, unknownKeys, missingKeys)) return;
		if (!withStep) { /* 回の番号は持たない */ }
		else if (!isInt(ev.step) || ev.step < 1) badTypes.push(w + '.step: 1以上の整数');
		else {
			if (ev.step <= prevStep) badTypes.push(w + '.step: 昇順・重複なし（前の回は ' + prevStep + '）');
			prevStep = ev.step;
		}
		if (!isArr(ev.choices) || ev.choices.length === 0) { badTypes.push(w + '.choices: 1つ以上の配列'); return; }
		let skillCount = 0;
		ev.choices.forEach((c, j) => {
			const cw = w + '.choices[' + j + ']';
			if (!isObj(c)) { badTypes.push(cw + ': オブジェクトでない'); return; }
			const keys = Object.keys(c);
			if (keys.length !== 1 || !EVENT_CHOICE_FORMS.includes(keys[0])) {
				badTypes.push(cw + ': キーは ' + EVENT_CHOICE_FORMS.join(' か ') + ' のどちらか1つだけ（いまは ' + (keys.join(', ') || 'なし') + '）');
				return;
			}
			const buckets = [];
			if (keys[0] === 'skills') {
				buckets.push({ list: c.skills, w: cw + '.skills' });
				if (ev.choices.length === 1 && isArr(c.skills) && c.skills.length === 0) {
					badTypes.push(cw + '.skills: 選択肢が1つで成否に分かれないイベント（確定）なので、空にしない');
				}
			} else {
				if (!isArr(c.results) || c.results.length < 2) {
					badTypes.push(cw + '.results: 結果は2つ以上の配列（結果が1つなら skills の形で書く）');
					return;
				}
				c.results.forEach((r, k) => buckets.push({ list: r, w: cw + '.results[' + k + ']' }));
			}
			buckets.forEach((b) => {
				readSkillRefs(b.list, b.w, EVENT_SKILL_REF_KEYS);
				checkNoDupInBucket(b.list, b.w);
				if (isArr(b.list)) skillCount += b.list.length;
			});
		});
		if (skillCount === 0) badTypes.push(w + ': スキルが1つも無い（スキルが得られる' + (withStep ? '回' : 'イベント') + 'だけを書く）');
	});
}

// 拡張スキル
docs.extendedSkill.entries.forEach((e, i) => {
	const w = 'extendedSkill[' + i + ']';
	if (!checkKeys(e, ENTRY_KEYS.extendedSkill, w, unknownKeys, missingKeys)) return;
	if (!isStr(e.id) || !isStr(e.name)) badTypes.push(w + ': id / name は空でない文字列');
	const hasPending = Object.prototype.hasOwnProperty.call(e, 'tagsPending');
	const hasTags = Object.prototype.hasOwnProperty.call(e, 'tags');
	if (hasPending && e.tagsPending !== true) badTypes.push(w + ': tagsPending は true のときだけ持つ');
	if (hasPending === hasTags) badTypes.push(w + ': tagsPending と tags はどちらか一方だけ持つ');
	if (hasTags) {
		if (!isObj(e.tags)) { badTypes.push(w + ': tags はオブジェクト'); return; }
		const keys = Object.keys(e.tags);
		if (keys.length !== TAG_AXES.length || !TAG_AXES.every((a) => keys.includes(a))) {
			badTypes.push(w + ': tags の軸がマスターと同じ顔ぶれでない');
		}
		keys.forEach((k) => {
			if (!isArr(e.tags[k]) || !e.tags[k].every(isStr)) badTypes.push(w + ': tags.' + k + ' は文字列の配列');
		});
	}
});

// シナリオ因子（63セッション目・段1d に検査の対象へ入れた）
docs.scenarioFactor.entries.forEach((e, i) => {
	const w = 'scenarioFactor[' + i + ']';
	if (!checkKeys(e, ENTRY_KEYS.scenarioFactor, w, unknownKeys, missingKeys)) return;
	if (!isStr(e.id) || !isStr(e.name)) badTypes.push(w + ': id / name は空でない文字列');
});

// 遺伝子（64セッション目・段A）
docs.geneFactor.entries.forEach((e, i) => {
	const w = 'geneFactor[' + i + ']';
	if (!checkKeys(e, ENTRY_KEYS.geneFactor, w, unknownKeys, missingKeys)) return;
	if (!isStr(e.id) || !isStr(e.name)) badTypes.push(w + ': id / name は空でない文字列');
});

// 育成ウマ娘
docs.trainingUmamusume.entries.forEach((e, i) => {
	const w = 'trainingUmamusume[' + i + ']';
	if (!checkKeys(e, ENTRY_KEYS.trainingUmamusume, w, unknownKeys, missingKeys)) return;
	if (!isStr(e.id) || !isStr(e.title) || !isStr(e.charaName)) badTypes.push(w + ': id / title / charaName は空でない文字列');
	if (!isInt(e.initialStar) || e.initialStar < STAR_MIN || e.initialStar > STAR_MAX) badTypes.push(w + ': initialStar は ' + STAR_MIN + '〜' + STAR_MAX + ' の整数');
	if (isArr(e.initialSkills)) {
		e.initialSkills.forEach((row, j) => {
			const rw = w + '.initialSkills[' + j + ']';
			if (!checkKeys(row, STAR_ROW_KEYS, rw, unknownKeys, missingKeys)) return;
			if (!isInt(row.minStar) || row.minStar < STAR_MIN || row.minStar > STAR_MAX) badTypes.push(rw + ': minStar は ' + STAR_MIN + '〜' + STAR_MAX + ' の整数');
			readSkillRefs(row.skills, rw + '.skills');
		});
	} else badTypes.push(w + ': initialSkills は配列');
	if (isArr(e.awakeningSkills)) {
		e.awakeningSkills.forEach((row, j) => {
			const rw = w + '.awakeningSkills[' + j + ']';
			if (!checkKeys(row, LEVEL_ROW_KEYS, rw, unknownKeys, missingKeys)) return;
			if (!isInt(row.level) || row.level < LEVEL_MIN) badTypes.push(rw + ': level は ' + LEVEL_MIN + ' 以上の整数');
			readSkillRefs(row.skills, rw + '.skills');
		});
	} else badTypes.push(w + ': awakeningSkills は配列');
	if (checkKeys(e.dataStatus, DATA_STATUS_KEYS.trainingUmamusume, w + '.dataStatus', unknownKeys, missingKeys)) {
		['initial', 'awakening'].forEach((k) => {
			if (!STATUS_VALUES.includes(e.dataStatus[k])) badTypes.push(w + '.dataStatus.' + k + ': ' + JSON.stringify(e.dataStatus[k]));
		});
	}
});

// サポートカード
docs.supportCard.entries.forEach((e, i) => {
	const w = 'supportCard[' + i + ']';
	if (!checkKeys(e, ENTRY_KEYS.supportCard, w, unknownKeys, missingKeys)) return;
	if (!isStr(e.id) || !isStr(e.title) || !isStr(e.charaName)) badTypes.push(w + ': id / title / charaName は空でない文字列');
	if (!isStr(e.type)) badTypes.push(w + ': type は空でない文字列');
	if (!isInt(e.typeOrder) || e.typeOrder < 1) badTypes.push(w + ': typeOrder は1以上の整数');
	readSkillRefs(e.hintSkills, w + '.hintSkills');
	if (checkKeys(e.dataStatus, DATA_STATUS_KEYS.supportCard, w + '.dataStatus', unknownKeys, missingKeys)) {
		if (!STATUS_VALUES.includes(e.dataStatus.hint)) badTypes.push(w + '.dataStatus.hint: ' + JSON.stringify(e.dataStatus.hint));
	}
	// レアリティとグループ（C-102 の区切り3）。groupMembers はグループのカードにだけあり、空でなく、
	// 先頭が代表者＝その行の charaName。同じ名前が2回出ない
	if (e.rarity !== undefined && !RARITY_VALUES.includes(e.rarity)) badTypes.push(w + '.rarity: ' + JSON.stringify(e.rarity) + '（' + RARITY_VALUES.join('・') + ' のどれか）');
	if (e.isGroup !== undefined && typeof e.isGroup !== 'boolean') badTypes.push(w + '.isGroup: 真偽値');
	if (e.isGroup === true) {
		const gm = e.groupMembers;
		if (!isArr(gm) || gm.length === 0 || !gm.every(isStr)) badTypes.push(w + '.groupMembers: 空でない、名前の配列');
		else {
			if (gm[0] !== e.charaName) badTypes.push(w + '.groupMembers: 先頭が charaName（代表者）でない');
			if (new Set(gm).size !== gm.length) badTypes.push(w + '.groupMembers: 同じ名前が2回ある');
		}
	} else if (e.groupMembers !== undefined) badTypes.push(w + '.groupMembers: グループでないカードは持たない');
	// グループのサポートカードの正式な名称（2026-09-30）。無くてもよい（無ければ画面は今までの名前のまま）が、あれば空でない文字列
	if (e.groupName !== undefined) {
		if (e.isGroup !== true) badTypes.push(w + '.groupName: グループでないカードは持たない');
		else if (!isStr(e.groupName) || !e.groupName.trim()) badTypes.push(w + '.groupName: 空でない文字列');
	}
});

// サポートカードのイベントスキル
docs.supportCardEventSkill.entries.forEach((e, i) => {
	const w = 'supportCardEventSkill[' + i + ']';
	if (!checkKeys(e, ENTRY_KEYS.supportCardEventSkill, w, unknownKeys, missingKeys)) return;
	if (!isStr(e.cardId)) badTypes.push(w + ': cardId は空でない文字列');
	if (!EVENT_STATUS_VALUES.includes(e.status)) badTypes.push(w + '.status: ' + JSON.stringify(e.status));
	if (e.chain !== undefined) readEventChain(e.chain, w + '.chain');
	if (e.unplaced !== undefined) {
		readSkillRefs(e.unplaced, w + '.unplaced');
		checkNoDupInBucket(e.unplaced, w + '.unplaced');
	}
});

// キャラクター共通のイベント（C-102 の区切り3）。中身の形は連続イベントと同じで、回の番号だけが無い
docs.characterEventSkill.entries.forEach((e, i) => {
	const w = 'characterEventSkill[' + i + ']';
	if (!checkKeys(e, ENTRY_KEYS.characterEventSkill, w, unknownKeys, missingKeys)) return;
	if (!isStr(e.charaName)) badTypes.push(w + ': charaName は空でない文字列');
	if (!EVENT_STATUS_VALUES.includes(e.status)) badTypes.push(w + '.status: ' + JSON.stringify(e.status));
	if (e.events !== undefined) readEventChain(e.events, w + '.events', false);
	if (e.unplaced !== undefined) {
		readSkillRefs(e.unplaced, w + '.unplaced');
		checkNoDupInBucket(e.unplaced, w + '.unplaced');
	}
});

none(unknownKeys, '知らないキーが無い（許可リストどおり）');
none(missingKeys, '必須のキーが揃っている');
none(badTypes, '値が決めた形になっている');

/* ──────────────────────── 2-2. マスターの行のキーと raceDistance ──────────────────────── */

console.log('\n=== 2-2. マスターの行のキーと raceDistance（マスター＋拡張スキル） ===');
{
	const unknown = [], missing = [], bad = [];
	masterSkills.forEach((s, i) => {
		const w = 'マスター[' + i + ']';
		if (!checkKeys(s, MASTER_ENTRY_KEYS, w, unknown, missing)) return;
		if (!isObj(s.tags)) bad.push(w + ': tags はオブジェクト');
	});
	none(unknown, 'マスターの行に知らないキーが無い（' + MASTER_ENTRY_KEYS.need.concat(MASTER_ENTRY_KEYS.opt).join(' / ') + '）');
	none(missing, 'マスターの行に必須のキーが揃っている');

	/* raceDistance の中身。マスターと拡張スキルで規則は同じなので1つのループで回す。 */
	const rows = masterSkills.map((s, i) => ({ where: 'マスター[' + i + ']', e: s }))
		.concat(docs.extendedSkill.entries.map((e, i) => ({ where: 'extendedSkill[' + i + ']', e: e })));
	let count = 0, withTagAndLimit = 0;
	rows.forEach(({ where, e }) => {
		if (!Object.prototype.hasOwnProperty.call(e, 'raceDistance')) return;
		count++;
		const w = where + '.raceDistance';
		const rd = e.raceDistance;
		if (!checkKeys(rd, RACE_DISTANCE_KEYS, w, unknown, missing)) return;
		const hasMin = rd.min !== undefined, hasMax = rd.max !== undefined, hasStd = rd.standardDistance !== undefined;
		if (hasMin && (!isInt(rd.min) || rd.min < 1)) bad.push(w + ': min は1以上の整数');
		if (hasMax && (!isInt(rd.max) || rd.max < 1)) bad.push(w + ': max は1以上の整数');
		if (hasMin && hasMax && isInt(rd.min) && isInt(rd.max) && rd.min > rd.max) bad.push(w + ': min が max より大きい');
		if (hasStd && typeof rd.standardDistance !== 'boolean') bad.push(w + ': standardDistance は true / false');
		if (hasStd === (hasMin || hasMax)) bad.push(w + ': min・max と standardDistance はどちらか一方だけ持つ');
		if (!SCOPE_VALUES.includes(rd.scope)) bad.push(w + ': scope は ' + SCOPE_VALUES.join(' / '));
		const hasDistanceTag = isObj(e.tags) && isArr(e.tags.distance) && e.tags.distance.length > 0;
		const hasTagScope = rd.distanceTagScope !== undefined;
		if (hasTagScope && !SCOPE_VALUES.includes(rd.distanceTagScope)) bad.push(w + ': distanceTagScope は ' + SCOPE_VALUES.join(' / '));
		if (hasTagScope !== hasDistanceTag) bad.push(w + ': distanceTagScope は距離のタグを持つ行にだけ書く（タグ' + (hasDistanceTag ? 'あり' : 'なし') + '・印' + (hasTagScope ? 'あり' : 'なし') + '）');
		if (hasDistanceTag) withTagAndLimit++;
		// tagsPending の行（タグ未設定）には限定も付けない
		if (e.tagsPending) bad.push(where + ': tagsPending の行に raceDistance がある');
	});
	none(unknown, 'raceDistance に知らないキーが無い（' + RACE_DISTANCE_KEYS.need.concat(RACE_DISTANCE_KEYS.opt).join(' / ') + '）［' + count + '件］');
	none(missing, 'raceDistance に scope がある');
	none(bad, 'raceDistance の値が決めた形（min・max は両端を含む整数／standardDistance とは排他／distanceTagScope は距離のタグを持つ行だけ）');
	console.log('     raceDistance を持つ行: ' + count + '件（うち距離のタグも持つ行 ' + withTagAndLimit + '件）'
		+ (count === 0 ? '（0件なので上の検査は見るものが無い）' : ''));
}

/* ──────────────────────── 3. ID ──────────────────────── */

console.log('\n=== 3. ID ===');
/* スキルではないカタログの名前（シナリオ因子など）。§4 の「名前が一意か」で使う。
   スキル名（マスター445＋拡張スキル）と重なると、名前で引く索引が一意に決まらない。
   ただし**落とさず警告**にする ―― 別の種類のものなので、同じ名前が正しいこともある。

   **集め方が2通りあるのは、検査の対象に入っているファイルとそうでないファイルが
   あるため。** FILES に入っているものは docs から、入っていないものはフォルダを
   読んで集める。63セッション目（段1d）にシナリオ因子を FILES へ移したとき、
   ここを直さなければ**この警告の対象が0件になって黙って消えていた**
   （検査の対象を増やしたつもりが、別の検査を1つ減らすところだった）。 */
const NON_SKILL_CATEGORIES = ['scenarioFactor', 'geneFactor'];
const otherCatalogNames = new Map();
{
	const badForm = [], dup = [], collide = [], badNext = [], notAscending = [];
	const seen = new Map(); // id → どのファイルか

	// マスター（裸の数字）と、同じフォルダにある他のカタログの id を、衝突の相手として集める
	const takenIds = new Set(masterNameById.keys());
	const otherCatalogFiles = fs.existsSync(path.join(REPO_ROOT, DIR))
		? fs.readdirSync(path.join(REPO_ROOT, DIR)).filter((n) => n.endsWith('.json') && !FILES.some((f) => f.file === n))
		: [];
	for (const n of otherCatalogFiles) {
		const r = readJsonFile(path.join(REPO_ROOT, DIR, n));
		if (!r.ok || !isArr(r.data.entries)) continue;
		r.data.entries.forEach((e) => {
			if (e && e.id) takenIds.add(String(e.id));
			// id を持つ行（＝カタログの行）だけ。skill-effect-levels.json のように skillId と照合の控えの name を持つ行は、
			// 別のスキルを名乗る行ではないので数えない（C-129）
			if (e && e.id && e.name) otherCatalogNames.set(String(e.name), String(e.id));
		});
	}
	// 検査の対象に入っているスキルではないカタログの名前も、同じ箱へ入れる。
	// id の衝突のほうは、この下の seen / dup で FILES どうしを突き合わせるので
	// takenIds に足す必要はない（足すと自分自身と衝突したことになる）。
	for (const c of NON_SKILL_CATEGORIES) {
		((docs[c] && docs[c].entries) || []).forEach((e) => {
			if (e && e.name) otherCatalogNames.set(String(e.name), String(e.id));
		});
	}

	for (const f of FILES) {
		const doc = docs[f.category];
		const ids = doc.entries.map((e) => String(e[f.key] || ''));
		let maxSerial = 0;
		// 名前の鍵（キャラクター名）は、空でないことと、ファイルの中で重複しないことだけを見る
		if (f.idTail === 'name') {
			const s = new Set();
			ids.forEach((id, i) => {
				if (!id) { badForm.push(f.category + '[' + i + ']: 鍵（' + f.key + '）が空'); return; }
				if (s.has(id)) dup.push(id + '（' + f.category + ' に重複）'); else s.add(id);
			});
			continue;
		}
		ids.forEach((id, i) => {
			const where = f.category + '[' + i + ']';
			if (!id.startsWith(f.prefix)) { badForm.push(where + ': ' + id); return; }
			const tail = id.slice(f.prefix.length);
			if (f.idTail === 'slug') {
				if (!SLUG_RE.test(tail)) { badForm.push(where + ': ' + id); return; }
			} else {
				if (!SERIAL_RE.test(tail) || Number(tail) < 1) { badForm.push(where + ': ' + id); return; }
				maxSerial = Math.max(maxSerial, Number(tail));
			}
			if (f.key === 'id') {
				if (seen.has(id)) dup.push(id + '（' + seen.get(id) + ' と ' + f.category + '）');
				else seen.set(id, f.category);
				if (takenIds.has(id)) collide.push(id + '（' + f.category + '）');
			}
		});
		if (f.key === 'cardId') {
			const s = new Set();
			ids.forEach((id) => { if (s.has(id)) dup.push(id + '（' + f.category + ' に重複）'); else s.add(id); });
		}
		// 末尾に足す運用が守られているか（並びが昇順か）。運用の目安なので警告どまりにする。
		// 語の形の id は採番しないので、昇順という考え方が当てはまらない（見ない）。
		// ここを `continue` で飛ばさないのは、下の nextSerial の検査まで一緒に消さないため。
		if (f.idTail !== 'slug') {
			for (let i = 1; i < ids.length; i++) {
				const a = Number(ids[i - 1].replace(/^\D+/, '')), b = Number(ids[i].replace(/^\D+/, ''));
				if (Number.isFinite(a) && Number.isFinite(b) && b < a) { notAscending.push(f.category + ': ' + ids[i - 1] + ' → ' + ids[i]); break; }
			}
		}
		if (TOP_KEYS[f.category].need.includes('nextSerial')) {
			const ns = String(doc.nextSerial || '');
			const tail = ns.startsWith(f.prefix) ? ns.slice(f.prefix.length) : '';
			if (!SERIAL_RE.test(tail)) badNext.push(f.category + ': ' + ns);
			else if (Number(tail) <= maxSerial) badNext.push(f.category + ': ' + ns + '（使用済みの最大は ' + maxSerial + '）');
		}
	}
	none(badForm, 'id が「接頭辞＋4桁以上の数字」または「接頭辞＋語」の形（ファイルごとに決まっている）');
	none(dup, 'id が重複しない');
	none(collide, 'id がマスター（数字）や他のカタログの id と衝突しない');
	none(badNext, 'nextSerial が使用済みの最大より大きい');
	if (notAscending.length) warn('id の並びが昇順でない（新しいものは末尾に足す運用）', notAscending);
}

/* ──────────────────────── 4. スキルの参照 ──────────────────────── */

console.log('\n=== 4. スキルの参照 ===');
{
	const extendedNameById = new Map(docs.extendedSkill.entries.map((e) => [String(e.id), String(e.name)]));
	const resolve = (id) => (masterNameById.has(id) ? masterNameById.get(id) : extendedNameById.get(id));

	const notFound = [], nameMismatch = [];
	refs.forEach((r) => {
		const name = resolve(r.skillId);
		if (name === undefined) notFound.push(r.where + ': ' + r.skillId);
		else if (name !== r.name) nameMismatch.push(r.where + ': ' + r.skillId);
	});
	none(notFound, 'すべての skillId がマスターか拡張スキルで引ける（' + refs.length + '件）');
	none(nameMismatch, '併記の name が引いた先の名前と一致する');

	// 名前の重複（マスター445 と拡張スキルをまたいで一意であること）
	const dupNames = [];
	const nameSeen = new Map();
	masterNameById.forEach((n, id) => nameSeen.set(n, 'マスター:' + id));
	extendedNameById.forEach((n, id) => {
		if (nameSeen.has(n)) dupNames.push(id + '（' + nameSeen.get(n) + ' と同じ名前）');
		else nameSeen.set(n, 'extendedSkill:' + id);
	});
	none(dupNames, 'スキル名がマスターと拡張スキルをまたいで重複しない');

	// 他のカタログ（シナリオ因子など）と同じ名前があると、名前で引く索引が一意に決まらない
	const overlap = [];
	otherCatalogNames.forEach((id, n) => { if (nameSeen.has(n)) overlap.push(id + ' と ' + nameSeen.get(n)); });
	if (overlap.length) warn('他のカタログと同じ名前がある（名前で引くときに一意に決まらない）', overlap);

	// イベントスキルの cardId がサポートカードに実在するか
	const cardIds = new Set(docs.supportCard.entries.map((e) => String(e.id)));
	const unknownCard = docs.supportCardEventSkill.entries
		.map((e, i) => ({ i, id: String(e.cardId || '') }))
		.filter((x) => !cardIds.has(x.id))
		.map((x) => 'supportCardEventSkill[' + x.i + ']: ' + x.id);
	none(unknownCard, 'イベントスキルの cardId がサポートカードに実在する');

	// キャラクター共通のイベントの charaName が、共通イベントの当てはまるキャラクターか（C-102 の区切り3）。
	// 当てはまるのは、グループでないカードの charaName と、グループのカードの groupMembers。
	// **グループのカードの charaName（代表者）は、それだけでは数えない**（メンバーの一覧に入っているので同じことになる）
	const charaNames = new Set();
	docs.supportCard.entries.forEach((e) => {
		if (e.isGroup === true) (isArr(e.groupMembers) ? e.groupMembers : []).forEach((n) => charaNames.add(String(n)));
		else if (e.isGroup === false) charaNames.add(String(e.charaName));
	});
	const unknownChara = docs.characterEventSkill.entries
		.map((e, i) => ({ i, name: String(e.charaName || '') }))
		.filter((x) => !charaNames.has(x.name))
		.map((x) => 'characterEventSkill[' + x.i + ']: ' + x.name);
	none(unknownChara, '共通イベントの charaName が、グループでないカードの charaName か groupMembers に出る名前（' + charaNames.size + '人）');
}

/* ──────────────────────── 4-2. マスターのタグと名前の突き合わせ ──────────────────────── */

/* **なぜここに置くか**: 決めごと4（「併記の name が指す先とずれていたら落とす」）と同じ種類の検査
   ―― 手で書くときの**取り違え**を捕まえるもの。69セッション目に、マスターの
   `福島レース場○` に `track_niigata`、`新潟レース場○` に `track_fukushima` と、
   **2件のタグが入れ替わったまま**入っていたのを見つけたので足した（条件検索で「福島」を選ぶと
   新潟のスキルが出る、という実害が出ていた）。

   **`test:master` ではなくこちらに置いた。** `test:master` は毎セッションの手順にも
   pre-push の関門にも入っていないので、そこに置くと「再発しても落ちない」検査になる
   （`check:catalog` は `test:verify` の §10 から呼ばれる）。

   **レース場の名前をこのファイルに1つも書かない**（決めごと1）。選択肢の値と表示名は
   `js/uma-skill-deck-core.js` の `TAG_AXES` から読む（`test:norm` が
   `EMBEDDED_EXTRA_CATALOG` を読んでいるのと同じ手口）。

   **見るのは「名前に出ている選択肢が、タグにも入っているか」だけ**（名前 ⊆ タグ）。
   タグにしか無いものは落とさない ―― 名前に地名が出ていないのに特定のレース場でだけ
   効くスキルは、これからも出てきうるため。逆に、名前に地名が出ているのにタグが空のものは
   **付け忘れの疑い**として警告に留める（いまは0件）。 */

/** core.js の TAG_AXES から、1つの軸の選択肢（[{v, t}]）を読む。 */
function readAxisOptions(src, key) {
	const block = new RegExp("\\{ key: '" + key + "',[\\s\\S]*?options: \\[([\\s\\S]*?)\\n\\t\\t\\]").exec(src);
	if (!block) return null;   // その軸が TAG_AXES に無い（null と「選択肢0件」を区別する）
	// キーのあとに空白を許してから コロン を書く。**キー1文字＋コロン＋円記号**の並びを
	// 作らないため ―― `check:privacy` がそれを Windows のドライブのパスと読んで落ちる（偽陽性）。
	// 免除リストへ足すより、その並びを書かないほうがよい（検査の精度を落とさない）。
	// `internalOnly` の値も拾う ―― 利用者に選ばせないだけで、**データの側は持ってよい値**。
	return [...block[1].matchAll(/\{\s*v\s*:\s*'([^']+)'\s*,\s*t\s*:\s*'([^']+)'/g)].map((m) => ({ v: m[1], t: m[2] }));
}
const coreSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/uma-skill-deck-core.js'), 'utf8');

console.log('\n=== 4-2. マスターのタグと名前の突き合わせ ===');
{
	const venueOpts = readAxisOptions(coreSrc, 'trackVenue') || [];
	check(venueOpts.length > 0, 'core.js の TAG_AXES から「レース場」の選択肢を読めた（' + venueOpts.length + '件）');

	if (venueOpts.length > 0) {
		const known = new Set(venueOpts.map((o) => o.v));
		const unknownValue = [], mismatch = [], namedButNoTag = [];
		masterSkills.forEach((s) => {
			const name = String(s.name);
			const tags = ((s.tags || {}).trackVenue) || [];
			tags.forEach((v) => { if (!known.has(v)) unknownValue.push(s.id + '（' + name + '）: ' + v); });
			// 名前に表示名が出ている選択肢
			const named = venueOpts.filter((o) => name.includes(o.t));
			if (named.length === 0) return;
			if (tags.length === 0) { namedButNoTag.push(s.id + '（' + name + '）'); return; }
			named.filter((o) => !tags.includes(o.v)).forEach((o) => {
				mismatch.push(s.id + '（' + name + '）: 名前は ' + o.t + ' だがタグは [' + tags.join(', ') + ']');
			});
		});
		none(unknownValue, 'マスターの trackVenue の値が TAG_AXES の選択肢に実在する');
		none(mismatch, 'マスターの trackVenue のタグがスキル名の地名と一致する');
		if (namedButNoTag.length) warn('名前に地名が出ているのに trackVenue のタグが空（付け忘れの疑い）', namedButNoTag);
	}
}

/* **選択肢を減らしたときの取りこぼしを捕まえる検査**（70セッション目・段2 で新設）。

   段2 で効果タイプの選択肢を 18 → 12 に減らした（6値を `stat_up` へ、2値を `debuff` へ統合）。
   このとき**マスターに旧値が1件でも残ると、その行はどの条件でも出てこなくなる** ――
   `matchesFilters()` は選択肢を見ずに値どうしを比べるだけなので、**画面にも検査にも
   何も出ないまま静かに消える**。4-2 の trackVenue で既に同じ形の検査をしていたので、
   それを**全軸へ広げた**もの。

   **`test:master` ではなくこちらに置いた**（4-2 と同じ理由。`test:master` は毎セッションの
   手順にも pre-push にも入っていない。`check:catalog` は `test:verify` の §10 から呼ばれる）。

   **値も軸名もこのファイルに書かない。** 軸はマスターから、選択肢は core.js の `TAG_AXES` から読む。

   **`TAG_AXES` にまだ無い軸**（段2 で先行投入した `rarity` / `inherited` のように、
   データだけ先に入れてUIには出していないもの）は、**値が空であることだけを見る** ――
   選択肢が1つも無い軸に値が入っていたら、それはどこからも選べない値なので必ず誤り。

   **【74セッション目・第2回の段1】タグを持つ拡張スキルも同じ規則で見るようにした。**
   それまでこの節は `masterSkills` だけを回しており、**拡張スキルのタグの値は誰も見ていなかった**
   （Step 0 で実測 ―― `distance: ["BOGUS_VALUE"]` を入れても総合 OK のまま通った）。
   マスターと同じで、綴りを間違えた値は**画面にも検査にも何も出ないまま
   「その条件では永久に出てこないスキル」**になる。第2回で拡張スキルにタグが入るので、
   入る前にここを広げておく。**マスターと拡張スキルで規則は同じ**なので、
   同じ1つのループで回す（どちらの行かは報告のときに名乗る）。 */

console.log('\n=== 4-3. タグの値が TAG_AXES の選択肢に実在するか（マスター＋拡張スキル・全軸） ===');
{
	const uiAxes = [], dataOnlyAxes = [], unknownValue = [], valueInDataOnlyAxis = [];
	const optionsByAxis = new Map();
	for (const axis of TAG_AXES) {
		const opts = readAxisOptions(coreSrc, axis);
		if (opts === null) { dataOnlyAxes.push(axis); continue; }
		uiAxes.push(axis + '(' + opts.length + ')');
		optionsByAxis.set(axis, new Set(opts.map((o) => o.v)));
	}
	check(uiAxes.length > 0, 'core.js の TAG_AXES から選択肢を読めた: ' + uiAxes.join(' / '));
	// **マスターだけが持つ軸（絞り込みには出さない軸）が有るか無いかを、毎回はっきり出す。**
	// 70セッション目: 段2 で rarity / inherited のキーを入れ、段3 でいったん TAG_AXES へ出したが、
	// 段4 のあとに**絞り込みからは外した**（データのキーは残す）。だからいまは2本。
	// 黙って通ると「そういう軸はもう無い」のか「検査が見ていない」のかが読めなくなる。
	console.log(dataOnlyAxes.length
		? '     TAG_AXES に無い軸（マスターだけが持つ・絞り込みには出さない）: ' + dataOnlyAxes.join(' / ')
		: '     TAG_AXES に無い軸は無い（マスターの軸はすべて絞り込みに出ている）');
	/* 見る対象。**マスター全件＋タグを持つ拡張スキル**（`tagsPending` の行は tags を持たないので
	   自然に外れる）。カテゴリ名も件数もここに書かず、読んだファイルから作る。 */
	const taggedExtended = docs.extendedSkill.entries.filter((e) => isObj(e.tags));
	const targets = masterSkills.map((s) => ({ where: 'マスター', id: s.id, name: s.name, tags: s.tags || {} }))
		.concat(taggedExtended.map((e) => ({ where: '拡張スキル', id: e.id, name: e.name, tags: e.tags })));
	targets.forEach((s) => {
		const tags = s.tags || {};
		const at = s.where + ' ' + s.id + '（' + s.name + '）';
		for (const axis of TAG_AXES) {
			const values = isArr(tags[axis]) ? tags[axis] : [];
			const known = optionsByAxis.get(axis);
			if (!known) {
				values.forEach((v) => valueInDataOnlyAxis.push(at + ': ' + axis + ' = ' + v));
				continue;
			}
			values.forEach((v) => { if (!known.has(v)) unknownValue.push(at + ': ' + axis + ' = ' + v); });
		}
	});
	none(unknownValue, '全軸のタグの値が TAG_AXES の選択肢に実在する（廃した値が残っていない）'
		+ '［マスター' + masterSkills.length + '件＋タグ付きの拡張スキル' + taggedExtended.length + '件］');
	/* **拡張スキルのぶんが0件のときは、そう名乗る。** タグ付けはこれから（第2回の段3）なので、
	   いまは「マスターだけを見て通った」状態。0件のまま通ったことを [OK] に紛れさせない
	   （F-56「まだ0件だから通る検査は、通ったことに意味が無い」）。 */
	console.log(taggedExtended.length
		? '     拡張スキルは ' + taggedExtended.length + '件にタグが付いている（値も上の検査の対象）'
		: '     拡張スキルはまだ1件もタグが付いていない（＝上の検査は、いまはマスターだけを見ている）');
	// 先行している軸が1本も無いときは、この検査は見るものが無い（0件だから通る検査になる）。
	// **その状態をそう名乗る** ―― 通ったことに意味がある検査と、見るものが無い検査を、
	// 同じ [OK] の行で混ぜない（F-56）。
	// **74セッション目: 対象をマスターだけから「マスター＋タグ付きの拡張スキル」へ広げた。**
	// `rarity` / `inherited` は**どちらの側でも空**（受け取りの形の決まり）。
	if (dataOnlyAxes.length) {
		none(valueInDataOnlyAxis, 'TAG_AXES に無い軸（' + dataOnlyAxes.join(' / ')
			+ '）には、マスターにも拡張スキルにも値が入っていない（どこからも選べない値にならない）');
	} else {
		console.log('     （そういう軸が無いので「TAG_AXES に無い軸に値が入っていないか」は見ていない）');
	}

	/* core.js の組み込みサンプル（SAMPLE_MASTER_SKILLS）も同じ規則で見る。
	   これは**正本を取れなかったときにしか使われない**（F-16）ので、ふだんの操作でも
	   他の検査でも当たらない。揃っていないと、その状況でだけ絞り込みの結果が変わる。
	   実際、段2 で本体を付け替えたときにここだけ旧値（speed_up）が残っていた。 */
	const sampleBlock = /SAMPLE_MASTER_SKILLS\s*=\s*\{[\s\S]*?\n\t\]\};/.exec(coreSrc);
	check(!!sampleBlock, 'core.js から組み込みサンプル（SAMPLE_MASTER_SKILLS）を読めた');
	if (sampleBlock) {
		const entries = [...sampleBlock[0].matchAll(/tags:\s*\{([^}]*)\}/g)].map((m) => m[1]);
		check(entries.length > 0, '組み込みサンプルの件数（' + entries.length + '件）');
		const badAxes = [], badValues = [];
		entries.forEach((body, i) => {
			const pairs = [...body.matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)];
			const keys = pairs.map((p) => p[1]);
			if (keys.slice().sort().join(',') !== TAG_AXES.slice().sort().join(',')) {
				badAxes.push('サンプル[' + i + ']: ' + keys.join('/'));
			}
			pairs.forEach(([, axis, inner]) => {
				const known = optionsByAxis.get(axis);
				[...inner.matchAll(/'([^']+)'/g)].map((m) => m[1]).forEach((v) => {
					if (!known || !known.has(v)) badValues.push('サンプル[' + i + ']: ' + axis + ' = ' + v);
				});
			});
		});
		none(badAxes, '組み込みサンプルの軸の顔ぶれがマスターと同じ');
		none(badValues, '組み込みサンプルの値も TAG_AXES の選択肢に実在する');
	}
}

/* ──────────────────────── 8. レースの距離の一覧 ──────────────────────── */

console.log('\n=== 8. レースの距離の一覧（' + RACE_FILE + '） ===');
/* 目標のレースの距離（C-97）の判定の材料。区分の境目と、実在する距離。
   **数字はここに1つも書かない** ―― 境目どうしが隙間なく重ならずつながっているか、距離が範囲の中にあって
   その範囲の区分と一致しているか、を値どうしで見る。区分のキーは core の距離の軸の選択肢、
   surfaces の値はバ場の軸の選択肢と突き合わせる（キーの語を2か所で持たない）。 */
{
	const abs = path.join(REPO_ROOT, DIR, RACE_FILE);
	const r = fs.existsSync(abs) ? readJsonFile(abs) : { ok: false, error: 'ファイルが無い' };
	check(r.ok, RACE_FILE + ' が読める', r.ok ? undefined : r.error);
	if (r.ok) {
		const doc = r.data;
		const unknown = [], missing = [], bad = [];
		checkKeys(doc, RACE_TOP_KEYS, RACE_FILE, unknown, missing);
		if (doc.category !== RACE_CATEGORY_NAME) bad.push('category が ' + JSON.stringify(doc.category));
		if (!DATA_VERSION_RE.test(String(doc.dataVersion))) bad.push('dataVersion が「YYYY-MM-DD＋英小文字1字」の形でない: ' + String(doc.dataVersion));
		const cats = isArr(doc.distanceCategories) ? doc.distanceCategories : [];
		const rows = isArr(doc.distances) ? doc.distances : [];
		if (!isArr(doc.distanceCategories)) bad.push('distanceCategories が配列でない');
		if (!isArr(doc.distances)) bad.push('distances が配列でない');

		// 区分: キーは core の距離の軸の選択肢と同じ顔ぶれ・同じ並び。境目は隙間なく重ならない
		const distOpts = (readAxisOptions(coreSrc, 'distance') || []).map((o) => o.v);
		cats.forEach((c, i) => {
			const w = 'distanceCategories[' + i + ']';
			if (!checkKeys(c, RACE_CATEGORY_KEYS, w, unknown, missing)) return;
			if (!isStr(c.key) || !isStr(c.name)) bad.push(w + ': key / name は空でない文字列');
			if (c.minDistance !== undefined && (!isInt(c.minDistance) || c.minDistance < 1)) bad.push(w + ': minDistance は1以上の整数');
			if (c.maxDistance !== undefined && (!isInt(c.maxDistance) || c.maxDistance < 1)) bad.push(w + ': maxDistance は1以上の整数');
			if (i === 0 && c.minDistance !== undefined) bad.push(w + ': 最初の区分は minDistance を持たない（下に開いている）');
			if (i === cats.length - 1 && c.maxDistance !== undefined) bad.push(w + ': 最後の区分は maxDistance を持たない（上に開いている）');
			if (i > 0) {
				const prev = cats[i - 1];
				if (!isInt(prev.maxDistance) || !isInt(c.minDistance) || c.minDistance !== prev.maxDistance + 1) {
					bad.push(w + ': 前の区分の maxDistance＋1 から始まっていない（隙間か重なりがある）');
				}
			}
		});
		check(distOpts.length > 0 && JSON.stringify(cats.map((c) => c.key)) === JSON.stringify(distOpts),
			'distanceCategories のキーが core の距離の軸の選択肢と同じ顔ぶれ・並び', { 一覧: cats.map((c) => c.key), 選択肢: distOpts });

		// 距離: 昇順・重複なし・区分は境目から決まるものと一致・surfaces はバ場の選択肢の値
		const surfOpts = new Set((readAxisOptions(coreSrc, 'surface') || []).map((o) => o.v));
		const categoryOf = (d) => cats.find((c) => (c.minDistance === undefined || d >= c.minDistance) && (c.maxDistance === undefined || d <= c.maxDistance));
		const seen = new Set();
		rows.forEach((row, i) => {
			const w = 'distances[' + i + ']';
			if (!checkKeys(row, RACE_ROW_KEYS, w, unknown, missing)) return;
			if (!isInt(row.distance) || row.distance < 1) { bad.push(w + ': distance は1以上の整数'); return; }
			if (seen.has(row.distance)) bad.push(w + ': 距離 ' + row.distance + ' が重複');
			seen.add(row.distance);
			if (i > 0 && isInt(rows[i - 1].distance) && rows[i - 1].distance >= row.distance) bad.push(w + ': 昇順でない');
			const c = categoryOf(row.distance);
			if (!c) bad.push(w + ': ' + row.distance + ' はどの区分の範囲にも入らない');
			else if (c.key !== row.category) bad.push(w + ': category が ' + JSON.stringify(row.category) + ' だが境目からは ' + c.key);
			if (!isArr(row.surfaces) || row.surfaces.length === 0 || !row.surfaces.every((s) => surfOpts.has(s))) {
				bad.push(w + ': surfaces はバ場の選択肢の値の配列（1つ以上）');
			}
		});
		none(unknown, RACE_FILE + ' に知らないキーが無い');
		none(missing, RACE_FILE + ' の必須のキーが揃っている');
		none(bad, RACE_FILE + ' の値が決めた形（境目が隙間なくつながる／距離は昇順・重複なし・区分が境目と一致）');
		const perCat = cats.map((c) => c.name + ' ' + rows.filter((x) => x.category === c.key).length).join(' / ');
		console.log('     区分 ' + cats.length + '・距離 ' + rows.length + '種類（' + perCat + '）');
	}
}

/* ──────────────────────── 9. めろっぷ用の行の並び ──────────────────────── */

console.log('\n=== 9. めろっぷ用の行の並び（' + MELOP_FILE + '） ===');
/* exam.html の「めろっぷ！【LTC】専用拡張モード」（C-101）が、★の数をこの順で出す。
   シート側（★を貼る欄 H38:J601）が更新されたときにずれに気づけるよう、**行数と行番号の並び**を見る
   （シートの欄の範囲は、貼り先の形そのものなので、ここに数字で持つ。スキル名は書かない）。
   あわせて、独自IDの参照先が実在し、その名前が行の名前と同じもの（〇と○の違い・全角半角だけを揃えて）かを見る。 */
{
	const abs = path.join(REPO_ROOT, DIR, MELOP_FILE);
	const r = fs.existsSync(abs) ? readJsonFile(abs) : { ok: false, error: 'ファイルが無い' };
	check(r.ok, MELOP_FILE + ' が読める', r.ok ? undefined : r.error);
	if (r.ok) {
		const doc = r.data;
		const unknown = [], missing = [], bad = [];
		checkKeys(doc, MELOP_TOP_KEYS, MELOP_FILE, unknown, missing);
		if (doc.category !== MELOP_CATEGORY_NAME) bad.push('category が ' + JSON.stringify(doc.category));
		if (!DATA_VERSION_RE.test(String(doc.dataVersion))) bad.push('dataVersion が「YYYY-MM-DD＋英小文字1字」の形でない: ' + String(doc.dataVersion));
		const rows = isArr(doc.rows) ? doc.rows : [];
		if (!isArr(doc.rows)) bad.push('rows が配列でない');
		rows.forEach((row, i) => {
			const w = 'rows[' + i + ']';
			if (!checkKeys(row, MELOP_ROW_KEYS, w, unknown, missing)) return;
			if (!isInt(row.row)) bad.push(w + ': row は整数');
			if (!isStr(row.group) || !isStr(row.name)) bad.push(w + ': group / name は空でない文字列');
			if (row.id !== undefined && !isStr(row.id)) bad.push(w + ': id は空でない文字列');
			if (row.slot !== undefined && !MELOP_SLOTS.includes(row.slot)) bad.push(w + ': slot は ' + MELOP_SLOTS.join('・') + ' のどれか');
			if (row.slot !== undefined && row.id !== undefined) bad.push(w + ': slot の行は id を持たない（名前ではなく画面の位置で読む）');
			if ((row.column !== undefined) !== (row.slot === 'unique')) bad.push(w + ': column は slot が unique の行にだけ書く');
		});
		none(unknown, MELOP_FILE + ' に知らないキーが無い');
		none(missing, MELOP_FILE + ' の必須のキーが揃っている');
		none(bad, MELOP_FILE + ' の値が決めた形');

		// 行数と行番号の並び（シートの欄と1対1）
		const nums = rows.map((x) => x.row);
		const expected = Array.from({ length: MELOP_LAST_ROW - MELOP_FIRST_ROW + 1 }, (_, i) => MELOP_FIRST_ROW + i);
		check(rows.length === expected.length, '行数が ' + expected.length + '（シートの ' + MELOP_FIRST_ROW + '〜' + MELOP_LAST_ROW + '行目）', rows.length);
		const firstDiff = expected.findIndex((n, i) => nums[i] !== n);
		check(firstDiff === -1 && nums.length === expected.length, '行番号が ' + MELOP_FIRST_ROW + ' から1ずつ増えて ' + MELOP_LAST_ROW + ' で終わる（抜け・重なり・入れ替わりなし）',
			firstDiff === -1 ? undefined : { 位置: firstDiff, 期待: expected[firstDiff], 実際: nums[firstDiff] });

		// いちばん上の段から読む行: 青・赤は1行以上、継承固有は column 0・1・2 が1行ずつ
		const bySlot = (s) => rows.filter((x) => x.slot === s);
		check(bySlot('blue').length > 0 && bySlot('red').length > 0, 'slot: blue・red の行がある', { blue: bySlot('blue').length, red: bySlot('red').length });
		check(JSON.stringify(bySlot('unique').map((x) => x.column).sort()) === JSON.stringify([0, 1, 2]),
			'slot: unique の行が column 0・1・2 に1行ずつ', bySlot('unique').map((x) => x.row + ':' + x.column));

		// 名前の重なり（シートの同じ名前が2行あると、どちらに入れるか決まらない）
		const dupName = [];
		const seenName = new Map();
		rows.forEach((x) => { if (seenName.has(x.name)) dupName.push(x.row + ' と ' + seenName.get(x.name) + ': ' + x.name); else seenName.set(x.name, x.row); });
		none(dupName, '行の名前が重ならない');

		// 独自IDの参照先
		const nameById = new Map(masterNameById);
		[docs.extendedSkill, docs.scenarioFactor, docs.geneFactor].forEach((d) => (d.entries || []).forEach((e) => nameById.set(String(e.id), String(e.name))));
		const loose = (s) => String(s).normalize('NFKC').replace(/〇/g, '○');
		const noRef = [], nameDiff = [], dupId = [];
		const seenId = new Map();
		rows.filter((x) => x.id !== undefined).forEach((x) => {
			const id = String(x.id);
			if (seenId.has(id)) dupId.push(id + '（' + seenId.get(id) + ' と ' + x.row + '）'); else seenId.set(id, x.row);
			if (!nameById.has(id)) { noRef.push(x.row + ': ' + id); return; }
			if (loose(nameById.get(id)) !== loose(x.name)) nameDiff.push(x.row + ': ' + x.name + ' ≠ ' + id + ' ' + nameById.get(id));
		});
		none(noRef, '独自IDの参照先がマスター・拡張スキル・シナリオ因子・遺伝子に実在する');
		none(nameDiff, '独自IDの指す名前が行の名前と同じ（〇／○・全角半角の違いだけを揃えて比べる）');
		none(dupId, '同じ独自IDを2行が指していない');
		console.log('     ' + rows.length + '行（独自IDあり ' + seenId.size + ' / なし ' + (rows.length - seenId.size)
			+ '。いちばん上の段: 青 ' + bySlot('blue').length + '・赤 ' + bySlot('red').length + '・継承固有 ' + bySlot('unique').length + '）');
	}
}

/* ──────────────────────── 12. これから開催されるレースの一覧 ──────────────────────── */

console.log('\n=== 12. これから開催されるレースの一覧（' + UPCOMING_FILE + '） ===');
/* オススメサポのレース条件（④・段7・2026-10-04）。公式のお知らせで公開された条件だけを持ち、公開されていない項目は null。
   **値の語はスキルのタグと同じ** ―― ここに値を書かず、core.js の TAG_AXES の選択肢と、レースの項目とタグの値の対応（RACE_ENV_FIELDS）・
   内外の値（RACE_COURSE_VALUES）・特殊ルール（RACE_RULES）を読んで突き合わせる。距離と区分・バ場は race-distances.json と突き合わせる。 */
{
	const abs = path.join(REPO_ROOT, DIR, UPCOMING_FILE);
	const r = fs.existsSync(abs) ? readJsonFile(abs) : { ok: false, error: 'ファイルが無い' };
	check(r.ok, UPCOMING_FILE + ' が読める', r.ok ? undefined : r.error);
	const raceDoc = readJsonFile(path.join(REPO_ROOT, DIR, RACE_FILE));
	if (r.ok && raceDoc.ok) {
		const doc = r.data;
		const unknown = [], missing = [], bad = [];
		checkKeys(doc, UPCOMING_TOP_KEYS, UPCOMING_FILE, unknown, missing);
		if (doc.category !== UPCOMING_CATEGORY_NAME) bad.push('category が ' + JSON.stringify(doc.category));
		if (!DATA_VERSION_RE.test(String(doc.dataVersion))) bad.push('dataVersion が「YYYY-MM-DD＋英小文字1字」の形でない: ' + String(doc.dataVersion));
		const rows = isArr(doc.races) ? doc.races : [];
		if (!isArr(doc.races)) bad.push('races が配列でない');
		// core.js から読む: タグの選択肢・レースの項目とタグの値の対応・内外の値・特殊ルール
		const optsOf = (key) => new Set((readAxisOptions(coreSrc, key) || []).map((o) => o.v));
		const envOpts = optsOf('environment'), venueOpts = optsOf('trackVenue'), surfOpts = optsOf('surface'), distOpts = optsOf('distance');
		const envFields = (() => {
			const m = /const RACE_ENV_FIELDS = \{([\s\S]*?)\n\t\};/.exec(coreSrc);
			return m ? Object.fromEntries([...m[1].matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)].map((x) => [x[1], [...x[2].matchAll(/'([^']+)'/g)].map((y) => y[1])])) : {};
		})();
		const courseVals = (() => { const m = /const RACE_COURSE_VALUES = \[([^\]]*)\]/.exec(coreSrc); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((y) => y[1]) : []; })();
		const ruleKeys = (() => { const m = /const RACE_RULES = \{([\s\S]*?)\n\t\};/.exec(coreSrc); return m ? [...m[1].matchAll(/^\s*(\w+)\s*:\s*\{/gm)].map((y) => y[1]) : []; })();
		check(Object.keys(envFields).length > 0 && courseVals.length > 0 && ruleKeys.length > 0,
			'core.js からレースの項目とタグの値の対応（' + Object.keys(envFields).join('・') + '）・内外の値・特殊ルール（' + ruleKeys.join('・') + '）を読めた');
		const notTag = Object.keys(envFields).flatMap((f) => envFields[f].filter((v) => !envOpts.has(v)).map((v) => f + ': ' + v));
		none(notTag, 'core.js の RACE_ENV_FIELDS の値が、レース環境の軸の選択肢に実在する');
		const cats = raceDoc.data.distanceCategories || [];
		const dists = raceDoc.data.distances || [];
		const categoryOf = (d) => cats.find((c) => (c.minDistance === undefined || d >= c.minDistance) && (c.maxDistance === undefined || d <= c.maxDistance));
		const seen = new Set();
		rows.forEach((row, i) => {
			const w = 'races[' + i + ']';
			if (!checkKeys(row, UPCOMING_ROW_KEYS, w, unknown, missing)) return;
			const nullOrStr = (k) => row[k] === null || isStr(row[k]);
			if (!/^race-\d{4}$/.test(String(row.id))) bad.push(w + ': id は「race-」＋4桁');
			else if (seen.has(row.id)) bad.push(w + ': id ' + row.id + ' が重複');
			seen.add(row.id);
			if (!isStr(row.name)) bad.push(w + ': name は空でない文字列');
			['date', 'dateLabel', 'venue', 'surface', 'distanceCategory', 'course', 'rule'].concat(Object.keys(envFields)).forEach((k) => { if (!nullOrStr(k)) bad.push(w + ': ' + k + ' は空でない文字列か null'); });
			if (row.date !== null && !(/^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) && !isNaN(Date.parse(row.date)))) bad.push(w + ': date は YYYY-MM-DD か null');
			if (row.date === null && row.dateLabel === null) bad.push(w + ': date と dateLabel のどちらかは要る（画面に日付を出すため）');
			if (row.venue !== null && !venueOpts.has(row.venue)) bad.push(w + ': venue ' + row.venue + ' がレース場の選択肢に無い');
			if (row.surface !== null && !surfOpts.has(row.surface)) bad.push(w + ': surface ' + row.surface + ' がバ場の選択肢に無い');
			if (row.distanceCategory !== null && !distOpts.has(row.distanceCategory)) bad.push(w + ': distanceCategory ' + row.distanceCategory + ' が距離の選択肢に無い');
			Object.keys(envFields).forEach((k) => { if (row[k] !== null && !envFields[k].includes(row[k])) bad.push(w + ': ' + k + ' ' + row[k] + ' がこの項目のタグの値（' + envFields[k].join('・') + '）に無い'); });
			if (row.course !== null && !courseVals.includes(row.course)) bad.push(w + ': course は ' + courseVals.join('・') + ' か null');
			if (row.rule !== null && !ruleKeys.includes(row.rule)) bad.push(w + ': rule ' + row.rule + ' が既知の特殊ルール（' + ruleKeys.join('・') + '）に無い');
			if (row.distance !== null) {
				if (!isInt(row.distance) || row.distance < 1) { bad.push(w + ': distance は1以上の整数か null'); return; }
				const dr = dists.find((x) => x.distance === row.distance);
				if (!dr) bad.push(w + ': 距離 ' + row.distance + ' のレースが ' + RACE_FILE + ' に無い');
				else if (row.surface !== null && !(dr.surfaces || []).includes(row.surface)) bad.push(w + ': 距離 ' + row.distance + ' に ' + row.surface + ' のレースが無い');
				const c = categoryOf(row.distance);
				if (!c || c.key !== row.distanceCategory) bad.push(w + ': distanceCategory が ' + JSON.stringify(row.distanceCategory) + ' だが距離 ' + row.distance + ' の区分は ' + (c ? c.key : '(無し)'));
			} else if (row.distanceCategory !== null && row.surface !== null && !dists.some((x) => x.category === row.distanceCategory && (x.surfaces || []).includes(row.surface))) {
				bad.push(w + ': 区分 ' + row.distanceCategory + ' に ' + row.surface + ' のレースが無い');
			}
		});
		none(unknown, UPCOMING_FILE + ' に知らないキーが無い');
		none(missing, UPCOMING_FILE + ' の必須のキーが揃っている（公開されていない項目も null で書く）');
		none(bad, UPCOMING_FILE + ' の値が決めた形（値がタグの選択肢に実在する／項目に合ったタグの値／距離と区分が合う／その距離・区分にそのバ場がある／特殊ルールが既知）');
		console.log('     ' + rows.length + 'レース（特殊ルールあり ' + rows.filter((x) => x.rule !== null).length + '）');
	}
}

/* ──────────────────────── 13. ②にまとめて追加するスキルのグループ ──────────────────────── */

console.log('\n=== 13. ②にまとめて追加するスキルのグループ（' + RECOMMENDED_FILE + '） ===');
/* C-130（2026-10-06）。レースを選んだときの既定の追加（noDebuffExtra）と、②のパレットの行のボタン（脚質ごと）が使う。
   **スキル名・グループの文字はここに書かない** ―― skillId がマスター・拡張スキルに実在し name が一致すること、
   グループの中で重ならず管理ID順（マスターの数字の id の昇順、続けて ex- の id の昇順）であること、label が空でないこと、
   onlyWhenRaceDistanceClass の値が race-distances.json の区分のキーにあること、core.js が使うグループのキーがデータにあることを見る。 */
{
	const abs = path.join(REPO_ROOT, DIR, RECOMMENDED_FILE);
	const r = fs.existsSync(abs) ? readJsonFile(abs) : { ok: false, error: 'ファイルが無い' };
	check(r.ok, RECOMMENDED_FILE + ' が読める', r.ok ? undefined : r.error);
	const raceDoc = readJsonFile(path.join(REPO_ROOT, DIR, RACE_FILE));
	if (r.ok && raceDoc.ok) {
		const doc = r.data;
		const unknown = [], missing = [], bad = [], noRef = [], nameDiff = [], dup = [], order = [];
		checkKeys(doc, RECOMMENDED_TOP_KEYS, RECOMMENDED_FILE, unknown, missing);
		if (doc.category !== RECOMMENDED_CATEGORY_NAME) bad.push('category が ' + JSON.stringify(doc.category));
		if (!DATA_VERSION_RE.test(String(doc.dataVersion))) bad.push('dataVersion が「YYYY-MM-DD＋英小文字1字」の形でない: ' + String(doc.dataVersion));
		const groups = isArr(doc.groups) ? doc.groups : [];
		if (!isArr(doc.groups) || groups.length === 0) bad.push('groups が空でない配列でない');
		const catKeys = new Set((raceDoc.data.distanceCategories || []).map((c) => c.key));
		const nameById = new Map(masterNameById);
		docs.extendedSkill.entries.forEach((e) => nameById.set(String(e.id), String(e.name)));
		// 管理ID順の並びの鍵（マスターの数字の id が先・数の昇順、続けて ex- の id が番号の昇順）
		const orderKey = (id) => { const s = String(id); return /^\d+$/.test(s) ? [0, Number(s)] : (/^ex-(\d+)$/.test(s) ? [1, Number(s.slice(3))] : [2, 0]); };
		const before = (a, b) => { const x = orderKey(a), y = orderKey(b); return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); };
		const keys = new Set();
		let total = 0;
		groups.forEach((g, gi) => {
			const w = 'groups[' + gi + ']';
			if (!checkKeys(g, RECOMMENDED_GROUP_KEYS, w, unknown, missing)) return;
			if (!isStr(g.key)) bad.push(w + ': key は空でない文字列');
			else if (keys.has(g.key)) bad.push(w + ': key ' + g.key + ' が重複');
			keys.add(g.key);
			if (!isStr(g.label) || !String(g.label).trim()) bad.push(w + ': label は空でない文字列');
			if (!isArr(g.skills) || g.skills.length === 0) { bad.push(w + ': skills が空でない配列でない'); return; }
			const seen = new Set();
			g.skills.forEach((s, si) => {
				const ws = w + '.skills[' + si + ']';
				if (!checkKeys(s, RECOMMENDED_SKILL_KEYS, ws, unknown, missing)) return;
				total++;
				if (!isStr(s.skillId) || !isStr(s.name)) { bad.push(ws + ': skillId / name は空でない文字列'); return; }
				if (!nameById.has(s.skillId)) noRef.push(ws + ': ' + s.skillId);
				else if (nameById.get(s.skillId) !== s.name) nameDiff.push(ws + ': ' + s.skillId + ' の name が一致しない');
				if (seen.has(s.skillId)) dup.push(ws + ': ' + s.skillId);
				seen.add(s.skillId);
				if (si > 0 && isStr(g.skills[si - 1].skillId) && !before(g.skills[si - 1].skillId, s.skillId)) order.push(ws + ': ' + g.skills[si - 1].skillId + ' の次に ' + s.skillId);
				if (s.onlyWhenRaceDistanceClass !== undefined) {
					const v = s.onlyWhenRaceDistanceClass;
					if (!isArr(v) || v.length === 0 || !v.every(isStr)) bad.push(ws + ': onlyWhenRaceDistanceClass は空でない文字列の配列');
					else {
						if (new Set(v).size !== v.length) bad.push(ws + ': onlyWhenRaceDistanceClass の値が重複');
						v.filter((x) => !catKeys.has(x)).forEach((x) => bad.push(ws + ': onlyWhenRaceDistanceClass の ' + x + ' が ' + RACE_FILE + ' の区分に無い'));
					}
				}
			});
		});
		// core.js が使うグループのキー（RECOMMENDED_GROUP_FOR_STYLE・RECOMMENDED_RACE_EXTRA_GROUP）がデータにある
		const coreKeys = (() => {
			const out = [];
			const m1 = /const RECOMMENDED_RACE_EXTRA_GROUP = '([^']+)'/.exec(coreSrc);
			if (m1) out.push(m1[1]);
			const m2 = /const RECOMMENDED_GROUP_FOR_STYLE = \{([^}]*)\}/.exec(coreSrc);
			if (m2) [...m2[1].matchAll(/:\s*'([^']+)'/g)].forEach((x) => { if (!out.includes(x[1])) out.push(x[1]); });
			return out;
		})();
		// C-131: 同じものとして扱うスキルの組。2つの id がどちらもマスターにある・2つのタグが同じ・どの id も複数の組に入らない・key が空でなく重ならない
		{
			const pairs = doc.equivalentPairs === undefined ? [] : doc.equivalentPairs;
			const pairBad = [];
			if (doc.equivalentPairs !== undefined && !isArr(doc.equivalentPairs)) pairBad.push('equivalentPairs が配列でない');
			const masterById = new Map(masterSkills.map((s) => [String(s.id), s]));
			const pkeys = new Set(), used = new Map();
			(isArr(pairs) ? pairs : []).forEach((p, i) => {
				const w = 'equivalentPairs[' + i + ']';
				if (!checkKeys(p, RECOMMENDED_PAIR_KEYS, w, unknown, missing)) return;
				if (!isStr(p.key) || !String(p.key).trim()) pairBad.push(w + ': key は空でない文字列');
				else if (pkeys.has(p.key)) pairBad.push(w + ': key ' + p.key + ' が重複');
				pkeys.add(p.key);
				if (!isArr(p.skillIds) || p.skillIds.length !== 2 || !p.skillIds.every(isStr) || p.skillIds[0] === p.skillIds[1]) { pairBad.push(w + ': skillIds は違う2つの id'); return; }
				p.skillIds.forEach((id) => {
					if (!masterById.has(id)) pairBad.push(w + ': ' + id + ' がマスターに無い');
					if (used.has(id)) pairBad.push(w + ': ' + id + ' が ' + used.get(id) + ' にも入っている');
					used.set(id, w);
				});
				const [a, b] = p.skillIds.map((id) => masterById.get(id));
				if (a && b && JSON.stringify(a.tags) !== JSON.stringify(b.tags)) pairBad.push(w + ': ' + p.skillIds.join('・') + ' のタグが同じでない');
			});
			none(pairBad, RECOMMENDED_FILE + ': equivalentPairs（2つの id がマスターにある・タグが同じ・どの id も1つの組だけ・key が空でなく重ならない）［' + (isArr(pairs) ? pairs.length : 0) + '組］');
		}
		check(coreKeys.length > 0, 'core.js から使うグループのキーを読めた（' + coreKeys.join('・') + '）');
		none(coreKeys.filter((k) => !keys.has(k)), 'core.js が使うグループのキーがデータにある');
		none(unknown, RECOMMENDED_FILE + ' に知らないキーが無い');
		none(missing, RECOMMENDED_FILE + ' の必須のキーが揃っている');
		none(bad, RECOMMENDED_FILE + ' の値が決めた形（key は重ならない・label は空でない・onlyWhenRaceDistanceClass の値は ' + RACE_FILE + ' の区分）');
		none(noRef, RECOMMENDED_FILE + ': skillId がマスター・拡張スキルに実在する');
		none(nameDiff, RECOMMENDED_FILE + ': name（照合の控え）がマスター・拡張スキルの名前と一致');
		none(dup, RECOMMENDED_FILE + ': グループの中で skillId が重ならない');
		none(order, RECOMMENDED_FILE + ': グループの中の並びが管理ID順（マスターの数字の id の昇順、続けて ex- の id の昇順）');
		console.log('     ' + groups.length + 'グループ・のべ ' + total + '種（' + groups.map((g) => (g && g.key) + ' ' + ((g && isArr(g.skills)) ? g.skills.length : 0)).join(' / ') + '）');
	}
}

/* ──────────────────────── 14. スキルの効率 ──────────────────────── */

/* exam.html の「効率を指定（βテスト）」と結合画像の合計（評価点の合計÷消費SPの合計）が読む（C-136・2026-10-08）。
   1行は 独自ID（skillId）＋ 評価点（score）・消費スキルPt（sp）・効率（efficiency）。
   **継承固有・レース因子(スキル)は持たない**（2026-10-09 に継承固有の3行〔名前だけの行〕を外した）。
   トップに defaultBounds（効率を指定の初期の境目。段の値3つ）を持つ。
   **持たないもの**（取得元の管理用の番号・区分の名前・「高効率」の印）は、キーの許可リストで弾く
   （外部データの取得と利用 の項目7・12）。効率は E列ではなく score÷sp を小数第3位に四捨五入した値。 */
const EFF_FILE = 'skill-efficiency.json';
const EFF_TOP_KEYS = { need: ['dataVersion', 'category', 'entries', 'defaultBounds'], opt: ['note'] };
// 独自IDのキーは skillId（skill-pt.json と同じ）。id にすると §3 が「別のカタログの行」とみなして衝突を数える
const EFF_ROW_KEYS = { need: ['skillId', 'score', 'sp', 'efficiency'], opt: [] };
const EFF_CATEGORY_NAME = 'skillEfficiency';
console.log('\n=== 14. スキルの効率（' + EFF_FILE + '） ===');
{
	const abs = path.join(REPO_ROOT, DIR, EFF_FILE);
	// 無ければ見ない（効果量の段階と同じ）。data/ にあることは test:verify §1（exam の版の表と data/ の実ファイルの突き合わせ）が見る。
	// スモークの「スキルPt ―― check:catalog の §11」は data/ の写しに仮の skill-pt.json を置くので、写しからこのファイルを外す
	const r = fs.existsSync(abs) ? readJsonFile(abs) : null;
	if (r === null) console.log('       ' + EFF_FILE + ': 無い（無ければ見ない）');
	else check(r.ok, EFF_FILE + ' が読める', r.ok ? undefined : r.error);
	if (r && r.ok) {
		const doc = r.data;
		const unknown = [], missing = [], bad = [];
		checkKeys(doc, EFF_TOP_KEYS, EFF_FILE, unknown, missing);
		if (doc.category !== EFF_CATEGORY_NAME) bad.push('category が ' + JSON.stringify(doc.category));
		if (!DATA_VERSION_RE.test(String(doc.dataVersion))) bad.push('dataVersion が「YYYY-MM-DD＋英小文字1字」の形でない: ' + String(doc.dataVersion));
		const rows = isArr(doc.entries) ? doc.entries : [];
		if (!isArr(doc.entries) || rows.length === 0) bad.push('entries が空でない配列でない');
		const recalc = [], notPositive = [];
		rows.forEach((e, i) => {
			const w = 'entries[' + i + ']';
			if (!checkKeys(e, EFF_ROW_KEYS, w, unknown, missing)) return;
			if (!isStr(e.skillId)) bad.push(w + ': skillId は空でない文字列');
			if (!isInt(e.score) || !isInt(e.sp)) { bad.push(w + ': score / sp は整数'); return; }
			if (!(e.score > 0) || !(e.sp > 0) || !(typeof e.efficiency === 'number' && e.efficiency > 0)) { notPositive.push(w); return; }
			// 千分率の整数で丸める（data を作ったときと同じ式）
			if (Math.round(e.score * 1000 / e.sp) / 1000 !== e.efficiency) recalc.push(w + ': ' + e.score + '÷' + e.sp + ' → ' + e.efficiency);
		});
		none(unknown, EFF_FILE + ' に知らないキーが無い（管理用の番号・区分の名前・「高効率」の印を持たない）');
		none(missing, EFF_FILE + ' の必須のキーが揃っている');
		none(bad, EFF_FILE + ' の値が決めた形（skillId は文字列・score と sp は整数）');
		none(notPositive, EFF_FILE + ': 評価点・消費スキルPt・効率がどれも0より大きい（効率0の行を持たない）');
		none(recalc, EFF_FILE + ': 効率が 評価点÷消費スキルPt を小数第3位に四捨五入した値と一致');

		// 重なり
		const dup = [];
		const seen = new Set();
		rows.forEach((e) => { const k = String(e.skillId); if (seen.has(k)) dup.push(k); seen.add(k); });
		none(dup, EFF_FILE + ': 同じ独自IDの行が2つ無い');

		// 独自IDの実在と、拡張モードの並び（melop-sheet-rows.json）の同じ id の行の名前との一致
		const nameById = new Map(masterNameById);
		[docs.extendedSkill, docs.scenarioFactor, docs.geneFactor].forEach((d) => (d.entries || []).forEach((e) => nameById.set(String(e.id), String(e.name))));
		const melopDoc = readJsonFile(path.join(REPO_ROOT, DIR, MELOP_FILE));
		const melopRows = (melopDoc.ok && isArr(melopDoc.data.rows)) ? melopDoc.data.rows : [];
		const melopById = new Map(melopRows.filter((x) => x.id !== undefined).map((x) => [String(x.id), x]));
		const loose = (s) => String(s).normalize('NFKC').replace(/〇/g, '○');
		const noRef = [], noMelop = [], nameDiff = [];
		rows.forEach((e, i) => {
			const w = 'entries[' + i + ']';
			const id = String(e.skillId);
			if (!nameById.has(id)) { noRef.push(w + ': ' + id); return; }
			const m = melopById.get(id);
			if (!m) { noMelop.push(w + ': ' + id); return; }
			if (loose(m.name) !== loose(nameById.get(id))) nameDiff.push(w + ': ' + id + ' ' + nameById.get(id) + ' ≠ ' + m.name);
		});
		none(noRef, EFF_FILE + ': 独自IDの参照先がマスター・拡張スキル・シナリオ因子・遺伝子に実在する');
		none(noMelop, EFF_FILE + ': 独自IDが ' + MELOP_FILE + ' のどれかの行の id にある（照合の辞書に名前がある）');
		none(nameDiff, EFF_FILE + ': 独自IDの名前が ' + MELOP_FILE + ' の行の名前と同じ（〇／○・全角半角の違いだけを揃えて比べる）');

		// 継承固有（slot: unique）・レース因子(スキル)の行は持たない（どの集計にも入れない）
		const slotById = new Map(melopRows.filter((x) => x.id !== undefined).map((x) => [String(x.id), x.slot]));
		const excluded = rows.map((e, i) => 'entries[' + i + ']: ' + e.skillId).filter((_, i) => slotById.get(String(rows[i].skillId)) === 'unique');
		none(excluded, EFF_FILE + ': 継承固有の行を持たない');

		// 初期の境目（defaultBounds）: 段の値（効率の重複を除いたもの）3つ・昇順・どの区間も1種以上（境目1≧最小・境目3≦最大の1つ下の段の値）
		const stepMilli = Array.from(new Set(rows.map((e) => Math.round(e.efficiency * 1000)))).sort((a, b) => a - b);
		const db = doc.defaultBounds;
		const dbBad = [];
		if (!isArr(db) || db.length !== 3 || !db.every((v) => typeof v === 'number' && Number.isFinite(v))) dbBad.push('defaultBounds が数値3つの配列でない');
		else {
			const idx = db.map((v) => stepMilli.indexOf(Math.round(v * 1000)));
			if (idx.some((i) => i < 0)) dbBad.push('段の値でない境目がある: ' + JSON.stringify(db));
			else if (!(idx[0] < idx[1] && idx[1] < idx[2] && idx[2] <= stepMilli.length - 2)) dbBad.push('昇順でない、または最後の区間が空になる: ' + JSON.stringify(db));
			if (db.some((v) => Math.round(v * 1000) / 1000 !== v)) dbBad.push('小数第3位までの値でない');
		}
		none(dbBad, EFF_FILE + ': defaultBounds は段の値3つ・昇順で、4つの区間のどれも1種以上を含む');

		// 消費スキルPt と skill-pt.json の基礎値（載っているものだけ）
		const ptDoc = readJsonFile(path.join(REPO_ROOT, DIR, 'skill-pt.json'));
		const ptById = new Map(((ptDoc.ok && isArr(ptDoc.data.entries)) ? ptDoc.data.entries : []).map((x) => [String(x.skillId), x.pt]));
		const ptDiff = [];
		let ptCompared = 0;
		rows.forEach((e, i) => {
			if (e.skillId === undefined || !ptById.has(String(e.skillId))) return;
			ptCompared++;
			if (ptById.get(String(e.skillId)) !== e.sp) ptDiff.push('entries[' + i + ']: ' + e.skillId + ' sp ' + e.sp + ' ≠ skill-pt ' + ptById.get(String(e.skillId)));
		});
		check(ptCompared > 0, EFF_FILE + ': skill-pt.json と突き合わせられる行がある（' + ptCompared + '行）');
		none(ptDiff, EFF_FILE + ': 消費スキルPt が skill-pt.json の基礎値と一致（skill-pt.json に載っている行）');

		const effs = rows.map((e) => e.efficiency).filter((v) => typeof v === 'number');
		console.log('     ' + rows.length + '行・段の値 ' + stepMilli.length + '個・初期の境目 ' + JSON.stringify(db) + '・skill-pt.json と突き合わせ ' + ptCompared + '行・効率 '
			+ (effs.length ? Math.min(...effs) + '〜' + Math.max(...effs) : '-') + '）');
	}
}

/* ──────────────────────── 5. ★・覚醒レベル・状態 ──────────────────────── */

console.log('\n=== 5. ★・覚醒レベル・状態・種類 ===');
{
	const starProblems = [], levelProblems = [], statusProblems = [];

	docs.trainingUmamusume.entries.forEach((e, i) => {
		const w = 'trainingUmamusume[' + i + ']';
		const rows = isArr(e.initialSkills) ? e.initialSkills : [];
		const mins = rows.map((r) => r.minStar);
		mins.forEach((m, j) => { if (isInt(m) && isInt(e.initialStar) && m < e.initialStar) starProblems.push(w + '.initialSkills[' + j + ']: minStar が初期の★より小さい'); });
		if (new Set(mins).size !== mins.length) starProblems.push(w + ': minStar が重複している');
		for (let j = 1; j < mins.length; j++) if (mins[j] <= mins[j - 1]) { starProblems.push(w + ': minStar が昇順でない'); break; }

		const levels = (isArr(e.awakeningSkills) ? e.awakeningSkills : []).map((r) => r.level);
		if (new Set(levels).size !== levels.length) levelProblems.push(w + ': level が重複している');
		for (let j = 1; j < levels.length; j++) if (levels[j] <= levels[j - 1]) { levelProblems.push(w + ': level が昇順でない'); break; }

		const st = isObj(e.dataStatus) ? e.dataStatus : {};
		const initialCount = rows.reduce((n, r) => n + (isArr(r.skills) ? r.skills.length : 0), 0);
		const awakeCount = (isArr(e.awakeningSkills) ? e.awakeningSkills : []).reduce((n, r) => n + (isArr(r.skills) ? r.skills.length : 0), 0);
		if (st.initial === 'done' && initialCount === 0) statusProblems.push(w + '.dataStatus.initial: done なのに1件も無い');
		if (st.initial !== 'done' && rows.length > 0) statusProblems.push(w + '.dataStatus.initial: done でないのに中身がある');
		if (st.awakening === 'done' && awakeCount === 0) statusProblems.push(w + '.dataStatus.awakening: done なのに1件も無い');
		if (st.awakening !== 'done' && awakeCount > 0) statusProblems.push(w + '.dataStatus.awakening: done でないのに中身がある');
	});

	docs.supportCard.entries.forEach((e, i) => {
		const w = 'supportCard[' + i + ']';
		const n = isArr(e.hintSkills) ? e.hintSkills.length : 0;
		const st = isObj(e.dataStatus) ? e.dataStatus : {};
		if (st.hint === 'done' && n === 0) statusProblems.push(w + '.dataStatus.hint: done なのに1件も無い');
		if (st.hint !== 'done' && n > 0) statusProblems.push(w + '.dataStatus.hint: done でないのに中身がある');
	});

	// イベントの状態と中身（C-102）。done は chain だけ・seeded は unplaced だけ・none はどちらも持たない
	docs.supportCardEventSkill.entries.forEach((e, i) => {
		const w = 'supportCardEventSkill[' + i + ']';
		const has = (k) => Object.prototype.hasOwnProperty.call(e, k);
		const len = (k) => isArr(e[k]) ? e[k].length : 0;
		if (e.status === 'done') {
			if (len('chain') === 0) statusProblems.push(w + '.status: done なのに chain が無い（空）');
			if (has('unplaced')) statusProblems.push(w + '.status: done なのに unplaced がある（確かめたら全部 chain へ移す）');
		} else if (e.status === 'seeded') {
			if (len('unplaced') === 0) statusProblems.push(w + '.status: seeded なのに unplaced が無い（空）');
			if (has('chain')) statusProblems.push(w + '.status: seeded なのに chain がある');
		} else if (e.status === 'none') {
			if (has('chain') || has('unplaced')) statusProblems.push(w + '.status: none なのに chain か unplaced がある');
		}
	});
	// キャラクター共通のイベントも同じ決まり（chain の代わりに events）
	docs.characterEventSkill.entries.forEach((e, i) => {
		const w = 'characterEventSkill[' + i + ']';
		const has = (k) => Object.prototype.hasOwnProperty.call(e, k);
		const len = (k) => isArr(e[k]) ? e[k].length : 0;
		if (e.status === 'done') {
			if (len('events') === 0) statusProblems.push(w + '.status: done なのに events が無い（空）');
			if (has('unplaced')) statusProblems.push(w + '.status: done なのに unplaced がある');
		} else if (e.status === 'seeded') {
			if (len('unplaced') === 0) statusProblems.push(w + '.status: seeded なのに unplaced が無い（空）');
			if (has('events')) statusProblems.push(w + '.status: seeded なのに events がある');
		} else if (e.status === 'none') {
			if (has('events') || has('unplaced')) statusProblems.push(w + '.status: none なのに events か unplaced がある');
		}
	});

	none(starProblems, 'minStar が初期の★以上で、昇順・重複なし');
	none(levelProblems, '覚醒レベルが昇順・重複なし');
	none(statusProblems, '状態の印と中身が食い違わない');

	// 種類（type）と、ゲーム内で扱われる順番（typeOrder）の対応。
	// **名前も番号も書かず、データにある値どうしが一対一かだけを見る。**
	// ここがずれると、並べ替えの結果が実行ごとに違って見える。
	const orderOfType = new Map(), typeOfOrder = new Map();
	const typePairs = [];
	docs.supportCard.entries.forEach((e, i) => {
		if (!isStr(e.type) || !isInt(e.typeOrder)) return;
		const w = 'supportCard[' + i + ']';
		if (orderOfType.has(e.type) && orderOfType.get(e.type) !== e.typeOrder) {
			typePairs.push(w + ': 同じ type に違う typeOrder（' + orderOfType.get(e.type) + ' と ' + e.typeOrder + '）');
		} else orderOfType.set(e.type, e.typeOrder);
		if (typeOfOrder.has(e.typeOrder) && typeOfOrder.get(e.typeOrder) !== e.type) {
			typePairs.push(w + ': 同じ typeOrder に違う type');
		} else typeOfOrder.set(e.typeOrder, e.type);
	});
	none(typePairs, 'type と typeOrder が全件で一対一に対応する（' + orderOfType.size + '種類）');
}

/* ──────────────────────── 6. 以前の内容との突き合わせ ──────────────────────── */

console.log('\n=== 6. 以前の内容との突き合わせ（' + (BASELINE_DIR || 'git の HEAD') + '） ===');
{
	const lost = [], renamed = [], serialBack = [];
	let compared = 0;
	// 意図して公開データから除いた id（理由を必ず添える。黙って増やさない。免除は実行のたびに表示する）。
	// 2026-10-02：ゲームに未実装の金スキル7件（おいもさんの指示。外部データの項目9）。独自IDは欠番のまま使い回さない。
	const INTENTIONALLY_REMOVED_IDS = new Set([
		'extendedSkill: ex-0572', 'extendedSkill: ex-0576', 'extendedSkill: ex-0585', 'extendedSkill: ex-0608',
		'extendedSkill: ex-0609', 'extendedSkill: ex-0611', 'extendedSkill: ex-0612'
	]);
	const exempted = [];
	for (const f of FILES) {
		const prev = readPrevious(f.file);
		if (!prev || !isArr(prev.entries)) continue;
		compared++;
		const now = new Map(docs[f.category].entries.map((e) => [String(e[f.key]), e]));
		prev.entries.forEach((pe) => {
			const id = String(pe[f.key] || '');
			if (!id) return;
			const cur = now.get(id);
			if (!cur) {
				const key = f.category + ': ' + id;
				if (INTENTIONALLY_REMOVED_IDS.has(key)) exempted.push(key); else lost.push(key);
				return;
			}
			// 表記の修正は正当なので落とさない。ただし黙って通さない。
			['name', 'title', 'charaName'].forEach((k) => {
				if (pe[k] !== undefined && cur[k] !== undefined && pe[k] !== cur[k]) renamed.push(f.category + ': ' + id + ' の ' + k);
			});
		});
		if (prev.nextSerial && docs[f.category].nextSerial) {
			const num = (s) => Number(String(s).replace(/^\D+/, ''));
			if (num(docs[f.category].nextSerial) < num(prev.nextSerial)) serialBack.push(f.category + ': ' + prev.nextSerial + ' → ' + docs[f.category].nextSerial);
		}
	}
	if (compared === 0) console.log('[--] 以前の内容が見つからないので、この節は行わない（今回が初回）');
	else {
		none(lost, '以前あった id が1つも消えていない（' + compared + 'ファイルを突き合わせ）');
		if (exempted.length) console.log('[免除] 意図して除いた id（ゲームに未実装のため。2026-10-02）: ' + exempted.join(', '));
		none(serialBack, 'nextSerial が戻っていない');
		if (renamed.length) warn('名前・二つ名が変わった行がある（表記の修正なら問題ない）', renamed);
	}
	// 2026-10-05（C-128）: 意図して除いた id が、スキルの4ファイルのどこにも戻っていない（再発の防止）。
	// 2026-10-04 の書き出しに7件が戻っていたため。行の id だけでなく、前段などの参照（文字列の値）も含めて探す
	{
		const removedIds = new Set(Array.from(INTENTIONALLY_REMOVED_IDS).map((k) => k.replace(/^[^:]+:\s*/, '')));
		const back = [];
		const walk = (v, file) => {
			if (typeof v === 'string') { if (removedIds.has(v)) back.push(file + ': ' + v); return; }
			if (Array.isArray(v)) { v.forEach((x) => walk(x, file)); return; }
			if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], file));
		};
		let seen = 0;
		['extended-skills.json', 'skill-pt.json', 'skill-descriptions.json', 'skill-step-up.json'].forEach((file) => {
			const abs = path.join(REPO_ROOT, DIR, file);
			if (!fs.existsSync(abs)) return;
			const r = readJsonFile(abs);
			if (!r.ok) return;   // 読めないことは別の節が落とす
			seen++;
			walk(r.data, file);
		});
		none(back, '意図して除いた id（' + removedIds.size + '件）が、スキルの4ファイル（拡張スキル・Pt・説明文・前段）に1件も現れない（' + seen + 'ファイルを走査）');
	}
}

/* ──────────────────────── 7. 進み具合（情報） ──────────────────────── */

/* ──────────────────────── 11. スキルPt（段1・2026-09-30） ──────────────────────── */

/* 割引率の表（skill-pt-rules.json）は、実ファイルがあるとき見る。
   **skill-pt.json（基礎Pt・レアリティ）と skill-step-up.json（前段関係）は、実ファイルが届いたときだけ見る**
   （無ければ何も言わない。届いたら、core の DATA_JSON_VERSIONS に足すと読まれる）。
   **スキル名も記号（○・◎）もここに書かない**（恒久ルール1）。見るのは id どうしの関係だけ。 */
const PT_RULES_FILE = 'skill-pt-rules.json';
const PT_FILE = 'skill-pt.json';
const STEP_UP_FILE = 'skill-step-up.json';
const PT_RULES_TOP_KEYS = {
	need: ['dataVersion', 'category', 'hintDiscountPercent', 'hintLevelMax', 'practiceHintLevel', 'umaHintLevelDefault', 'parentHintLevelDefault', 'statuses', 'rounding'],
	opt: ['note', 'umaHintLevelChoice', 'umaHintLevelChoiceMinAwakening'],
};
const PT_STATUS_KEYS = { need: ['id', 'label', 'percent'], opt: [] };
const PT_ROUNDING_VALUES = ['floor', 'round', 'ceil'];
const PT_TOP_KEYS = { need: ['dataVersion', 'category', 'entries'], opt: ['note'] };
const PT_ROW_KEYS = { need: ['skillId', 'pt', 'rarity'], opt: [] };
const PT_RARITY_VALUES = ['white', 'gold', 'unique', 'evolved'];
const STEP_UP_ROW_KEYS = { need: ['skillId', 'prevSkillIds'], opt: ['hintRootSkillId'] };
console.log('\n=== 11. スキルPt（' + PT_RULES_FILE + '／届いたら ' + PT_FILE + '・' + STEP_UP_FILE + '） ===');
{
	const registered = new Set(masterNameById.keys());
	docs.extendedSkill.entries.forEach((e) => registered.add(String(e.id)));
	const readOpt = (name) => {
		const abs = path.join(REPO_ROOT, DIR, name);
		if (!fs.existsSync(abs)) return null;
		return readJsonFile(abs);
	};

	/* --- 割引率の表 --- */
	const rr = readOpt(PT_RULES_FILE);
	if (rr === null) {
		console.log('       ' + PT_RULES_FILE + ': まだ無い（無ければ見ない）');
	} else {
		check(rr.ok, PT_RULES_FILE + ' が読める', rr.ok ? undefined : rr.error);
		if (rr.ok) {
			const r = rr.data;
			const unknown = [], missing = [], bad = [];
			checkKeys(r, PT_RULES_TOP_KEYS, PT_RULES_FILE, unknown, missing);
			none(unknown, PT_RULES_FILE + ': 知らないキーが無い');
			none(missing, PT_RULES_FILE + ': 必須のキーが揃っている');
			if (r.category !== 'skillPtRules') bad.push('category が ' + JSON.stringify(r.category));
			if (!DATA_VERSION_RE.test(String(r.dataVersion))) bad.push('dataVersion が「YYYY-MM-DD＋英小文字1字」の形でない: ' + String(r.dataVersion));
			const isPct = (v) => isInt(v) && v >= 0 && v <= 100;
			if (!isInt(r.hintLevelMax) || r.hintLevelMax < 1) bad.push('hintLevelMax は1以上の整数');
			// 割引率は整数の百分率（小数で持たない。浮動小数点の誤差が計算に入るため）。並びの位置＝レベル−1、長さ＝上限
			if (!isArr(r.hintDiscountPercent) || !r.hintDiscountPercent.every(isPct)) bad.push('hintDiscountPercent は 0〜100 の整数の配列（小数は不可）');
			else {
				if (r.hintDiscountPercent.length !== r.hintLevelMax) bad.push('hintDiscountPercent の長さ（' + r.hintDiscountPercent.length + '）が hintLevelMax（' + r.hintLevelMax + '）と違う');
				if (r.hintDiscountPercent.some((p, i) => i > 0 && p < r.hintDiscountPercent[i - 1])) bad.push('hintDiscountPercent が、レベルが上がるほど小さくなっている');
			}
			['practiceHintLevel', 'umaHintLevelDefault', 'parentHintLevelDefault', 'umaHintLevelChoice'].forEach((k) => {
				if (r[k] !== undefined && !(isInt(r[k]) && r[k] >= 0 && r[k] <= r.hintLevelMax)) bad.push(k + ' は 0〜hintLevelMax の整数');
			});
			if (r.parentHintLevelDefault !== undefined && r.parentHintLevelDefault < 1) bad.push('parentHintLevelDefault は1以上（親由来のレベルに0は無い）');
			if (r.umaHintLevelChoiceMinAwakening !== undefined && !(isInt(r.umaHintLevelChoiceMinAwakening) && r.umaHintLevelChoiceMinAwakening >= 1)) bad.push('umaHintLevelChoiceMinAwakening は1以上の整数');
			if ((r.umaHintLevelChoice === undefined) !== (r.umaHintLevelChoiceMinAwakening === undefined)) bad.push('umaHintLevelChoice と umaHintLevelChoiceMinAwakening は、両方あるか両方無いか');
			if (!PT_ROUNDING_VALUES.includes(r.rounding)) bad.push('rounding は ' + PT_ROUNDING_VALUES.join('／') + ' のどれか');
			if (!isArr(r.statuses) || r.statuses.length === 0) bad.push('statuses は空でない配列');
			const sUnknown = [], sMissing = [];
			if (isArr(r.statuses) && r.statuses.length > 0) {
				const ids = new Set();
				r.statuses.forEach((s, i) => {
					const w = 'statuses[' + i + ']';
					if (!checkKeys(s, PT_STATUS_KEYS, w, sUnknown, sMissing)) return;
					if (!isStr(s.id) || !isStr(s.label)) bad.push(w + ': id / label は空でない文字列');
					if (!isPct(s.percent)) bad.push(w + '.percent は 0〜100 の整数（小数は不可）');
					if (ids.has(s.id)) bad.push(w + ': id が重複（' + s.id + '）');
					ids.add(s.id);
				});
				if (!r.statuses.some((s) => s && s.percent === 0)) bad.push('statuses に「割引なし（percent 0）」が無い');
			}
			none(sUnknown.concat(sMissing), PT_RULES_FILE + ': statuses の行のキーが揃っていて、知らないキーが無い');
			none(bad, PT_RULES_FILE + ': 割引率が整数の百分率で、上限・状態・丸めの向きが決めた形');
		}
	}

	/* --- 基礎Pt・レアリティ（届いたとき） --- */
	const pr = readOpt(PT_FILE);
	if (pr === null) {
		console.log('       ' + PT_FILE + ': まだ届いていない（届いたら見る）');
	} else {
		check(pr.ok, PT_FILE + ' が読める', pr.ok ? undefined : pr.error);
		if (pr.ok) {
			const d = pr.data;
			const unknown = [], missing = [], bad = [], dup = [], unregistered = [];
			checkKeys(d, PT_TOP_KEYS, PT_FILE, unknown, missing);
			if (d.category !== 'skillPt') bad.push('category が ' + JSON.stringify(d.category));
			if (!DATA_VERSION_RE.test(String(d.dataVersion))) bad.push('dataVersion の形が違う: ' + String(d.dataVersion));
			if (!isArr(d.entries)) bad.push('entries が配列でない');
			const seen = new Set();
			const uniqueNonZero = [];
			(isArr(d.entries) ? d.entries : []).forEach((e, i) => {
				const w = 'entries[' + i + ']';
				if (!checkKeys(e, PT_ROW_KEYS, w, unknown, missing)) return;
				if (!isStr(e.skillId)) { bad.push(w + '.skillId: 空でない文字列'); return; }
				if (seen.has(e.skillId)) dup.push(w + ': ' + e.skillId); seen.add(e.skillId);
				if (!registered.has(e.skillId)) unregistered.push(w + ': ' + e.skillId);
				if (!isInt(e.pt) || e.pt < 0) bad.push(w + '.pt: 0以上の整数（固有スキルなどのPt不要は 0）');
				if (!PT_RARITY_VALUES.includes(e.rarity)) bad.push(w + '.rarity: ' + PT_RARITY_VALUES.join('／') + ' のどれか');
				if (e.rarity === 'unique' && e.pt !== 0) uniqueNonZero.push(w + ': ' + e.skillId + ' pt=' + e.pt);
			});
			none(unknown.concat(missing), PT_FILE + ': キーが決めた形（知らないキーが無く、必須が揃っている）');
			none(bad, PT_FILE + ': category・版・pt（0以上の整数）・rarity（' + PT_RARITY_VALUES.join('／') + '）の形');
			none(dup, PT_FILE + ': skillId が重複しない');
			none(unregistered, PT_FILE + ': skillId がすべてマスターか拡張スキルで引ける');
			if (uniqueNonZero.length) warn(PT_FILE + ': rarity が unique なのに pt が0でない行（固有スキルはデータで pt:0 として表す決まり）', uniqueNonZero);
			// 編成で参照されるスキル（練習のヒント・イベント・育成ウマ娘）がすべて載っているか。載っていなければ警告→件数
			const referenced = new Set(refs.map((r) => r.skillId));
			const notListed = [...referenced].filter((id) => !seen.has(id));
			if (notListed.length) warn(PT_FILE + ': 編成で参照されるスキルのうち、行が無いもの（画面では「Pt 未収録」になる）' + notListed.length + '種', notListed);
			else console.log('       ' + PT_FILE + ': 編成で参照される ' + referenced.size + '種がすべて載っている');
		}
	}

	/* --- 公式の説明文（届いたとき。ⓘ・長押しを開いたときだけ読むファイル。段6） --- */
	const DESC_FILE = 'skill-descriptions.json';
	const dr = readOpt(DESC_FILE);
	if (dr === null) {
		console.log('       ' + DESC_FILE + ': まだ届いていない（届いたら見る）');
	} else {
		check(dr.ok, DESC_FILE + ' が読める', dr.ok ? undefined : dr.error);
		if (dr.ok) {
			const d = dr.data;
			const unknown = [], missing = [], bad = [], dup = [], unregistered = [];
			checkKeys(d, PT_TOP_KEYS, DESC_FILE, unknown, missing);
			if (d.category !== 'skillDescription') bad.push('category が ' + JSON.stringify(d.category));
			if (!DATA_VERSION_RE.test(String(d.dataVersion))) bad.push('dataVersion の形が違う: ' + String(d.dataVersion));
			if (!isArr(d.entries)) bad.push('entries が配列でない');
			const seen = new Set();
			(isArr(d.entries) ? d.entries : []).forEach((e, i) => {
				const w = 'entries[' + i + ']';
				if (!checkKeys(e, { need: ['skillId', 'text'], opt: [] }, w, unknown, missing)) return;
				if (!isStr(e.skillId)) { bad.push(w + '.skillId: 空でない文字列'); return; }
				if (seen.has(e.skillId)) dup.push(w + ': ' + e.skillId); seen.add(e.skillId);
				if (!registered.has(e.skillId)) unregistered.push(w + ': ' + e.skillId);
				if (!isStr(e.text)) bad.push(w + '.text: 空でない文字列');
			});
			none(unknown.concat(missing), DESC_FILE + ': キーが決めた形（知らないキーが無く、必須が揃っている）');
			none(bad, DESC_FILE + ': category・版・text（空でない文字列）の形');
			none(dup, DESC_FILE + ': skillId が重複しない');
			none(unregistered, DESC_FILE + ': skillId がすべてマスターか拡張スキルで引ける');
		}
	}

	/* --- シナリオの固定イベント（段7c の N・2026-10-03。編成パネルを作るときにだけ読むファイル） ---
	   形は許可リスト方式（知らないキーは落とす）。skillId は登録済み・hintLevel は1以上の整数・重複なし。
	   シナリオ名・イベント名・スキル名・キャラクター名はここに書かない（恒久ルール1）。見るのは形と id の実在だけ。 */
	const SCEN_FILE = 'scenario-event-skills.json';
	const scr = readOpt(SCEN_FILE);
	if (scr === null) {
		console.log('       ' + SCEN_FILE + ': まだ無い（無ければ見ない）');
	} else {
		check(scr.ok, SCEN_FILE + ' が読める', scr.ok ? undefined : scr.error);
		if (scr.ok) {
			const d = scr.data;
			const unknown = [], missing = [], bad = [], dup = [], unregistered = [], badLevel = [];
			checkKeys(d, PT_TOP_KEYS, SCEN_FILE, unknown, missing);
			if (d.category !== 'scenarioEventSkills') bad.push('category が ' + JSON.stringify(d.category));
			if (!DATA_VERSION_RE.test(String(d.dataVersion))) bad.push('dataVersion の形が違う: ' + String(d.dataVersion));
			if (!isArr(d.entries) || d.entries.length === 0) bad.push('entries が空でない配列でない');
			const refOk = (ref, w) => {
				if (!checkKeys(ref, { need: ['skillId', 'hintLevel'], opt: [] }, w, unknown, missing)) return null;
				if (!isStr(ref.skillId)) { bad.push(w + '.skillId: 空でない文字列'); return null; }
				if (!registered.has(ref.skillId)) unregistered.push(w + ': ' + ref.skillId);
				if (!isInt(ref.hintLevel) || ref.hintLevel < 1) badLevel.push(w + '.hintLevel: 1以上の整数（' + String(ref.hintLevel) + '）');
				return ref.skillId;
			};
			const refsOk = (list, w, ids) => {
				if (!isArr(list)) { bad.push(w + ': 配列'); return; }
				list.forEach((ref, i) => { const id = refOk(ref, w + '[' + i + ']'); if (id !== null) ids.push(id); });
			};
			const scenarios = new Set();
			(isArr(d.entries) ? d.entries : []).forEach((en, i) => {
				const w = 'entries[' + i + ']';
				if (!checkKeys(en, { need: ['scenario', 'events'], opt: [] }, w, unknown, missing)) return;
				if (!isStr(en.scenario)) bad.push(w + '.scenario: 空でない文字列');
				else { if (scenarios.has(en.scenario)) dup.push(w + ': シナリオ名の重複'); scenarios.add(en.scenario); }
				if (!isArr(en.events) || en.events.length === 0) { bad.push(w + '.events: 空でない配列'); return; }
				const eventNames = new Set();
				en.events.forEach((ev, j) => {
					const we = w + '.events[' + j + ']';
					if (!ev || typeof ev !== 'object') { bad.push(we + ': オブジェクト'); return; }
					if (ev.type === 'fixed') {
						if (!checkKeys(ev, { need: ['name', 'type', 'skills'], opt: ['when'] }, we, unknown, missing)) return;
						const ids = [];
						refsOk(ev.skills, we + '.skills', ids);
						if (new Set(ids).size !== ids.length) dup.push(we + '.skills: スキルの重複');
					} else if (ev.type === 'choice') {
						if (!checkKeys(ev, { need: ['name', 'type', 'choices'], opt: ['when'] }, we, unknown, missing)) return;
						if (!isArr(ev.choices) || ev.choices.length < 2) { bad.push(we + '.choices: 選択肢が2つ以上の配列'); return; }
						ev.choices.forEach((c, k) => {
							const wc = we + '.choices[' + k + ']';
							if (c && c.charaNames !== undefined) {
								if (!checkKeys(c, { need: ['label', 'charaNames', 'linked', 'unlinked'], opt: [] }, wc, unknown, missing)) return;
								if (!isStr(c.label)) bad.push(wc + '.label: 空でない文字列');
								if (!isArr(c.charaNames) || c.charaNames.length === 0 || !c.charaNames.every(isStr)) bad.push(wc + '.charaNames: 空でない文字列の配列');
								const a = [], b = [];
								refsOk(c.linked, wc + '.linked', a);
								refsOk(c.unlinked, wc + '.unlinked', b);
								if (new Set(a).size !== a.length) dup.push(wc + '.linked: スキルの重複');
								if (new Set(b).size !== b.length) dup.push(wc + '.unlinked: スキルの重複');
							} else {
								if (!checkKeys(c, { need: ['skills'], opt: ['label'] }, wc, unknown, missing)) return;
								const ids = [];
								refsOk(c.skills, wc + '.skills', ids);
								if (new Set(ids).size !== ids.length) dup.push(wc + '.skills: スキルの重複');
							}
						});
					} else {
						bad.push(we + '.type: choice か fixed');
						return;
					}
					if (!isStr(ev.name)) bad.push(we + '.name: 空でない文字列');
					else { if (eventNames.has(ev.name)) dup.push(we + ': イベント名の重複'); eventNames.add(ev.name); }
				});
			});
			none(unknown.concat(missing), SCEN_FILE + ': キーが決めた形（知らないキーが無く、必須が揃っている）');
			none(bad, SCEN_FILE + ': category・版・type・選択肢・名前の形');
			none(dup, SCEN_FILE + ': シナリオ・イベント・同じ組の中のスキルが重複しない');
			none(unregistered, SCEN_FILE + ': skillId がすべてマスターか拡張スキルで引ける');
			none(badLevel, SCEN_FILE + ': hintLevel は1以上の整数');
		}
	}

	/* --- 前段関係（届いたとき） --- */
	const sr = readOpt(STEP_UP_FILE);
	if (sr === null) {
		console.log('       ' + STEP_UP_FILE + ': まだ届いていない（届いたら見る）');
	} else {
		check(sr.ok, STEP_UP_FILE + ' が読める', sr.ok ? undefined : sr.error);
		if (sr.ok) {
			const d = sr.data;
			const unknown = [], missing = [], bad = [], dup = [], unregistered = [], selfPrev = [], dupPrev = [], cyc = [], badRoot = [];
			checkKeys(d, PT_TOP_KEYS, STEP_UP_FILE, unknown, missing);
			if (d.category !== 'skillStepUp') bad.push('category が ' + JSON.stringify(d.category));
			if (!DATA_VERSION_RE.test(String(d.dataVersion))) bad.push('dataVersion の形が違う: ' + String(d.dataVersion));
			if (!isArr(d.entries)) bad.push('entries が配列でない');
			const rows = new Map();
			(isArr(d.entries) ? d.entries : []).forEach((e, i) => {
				const w = 'entries[' + i + ']';
				if (!checkKeys(e, STEP_UP_ROW_KEYS, w, unknown, missing)) return;
				if (!isStr(e.skillId)) { bad.push(w + '.skillId: 空でない文字列'); return; }
				if (rows.has(e.skillId)) dup.push(w + ': ' + e.skillId);
				if (!registered.has(e.skillId)) unregistered.push(w + ': ' + e.skillId);
				if (!isArr(e.prevSkillIds) || e.prevSkillIds.length === 0 || !e.prevSkillIds.every(isStr)) { bad.push(w + '.prevSkillIds: 空でない、idの配列（前段の無いスキルは行を書かない）'); return; }
				if (new Set(e.prevSkillIds).size !== e.prevSkillIds.length) dupPrev.push(w + ': ' + e.skillId);
				e.prevSkillIds.forEach((p) => { if (p === e.skillId) selfPrev.push(w + ': ' + e.skillId); if (!registered.has(p)) unregistered.push(w + '.prevSkillIds: ' + p); });
				if (e.hintRootSkillId !== undefined) {
					if (!isStr(e.hintRootSkillId)) bad.push(w + '.hintRootSkillId: 空でない文字列');
					else if (!registered.has(e.hintRootSkillId)) unregistered.push(w + '.hintRootSkillId: ' + e.hintRootSkillId);
				}
				rows.set(e.skillId, e);
			});
			// 循環しない（前段をさかのぼって自分に戻らない）。ヒントの根は、前段をさかのぼって行き着く祖先で、自身は根であること
			const ancestors = (id) => {
				const out = new Set(); const stack = [id];
				while (stack.length) {
					const cur = stack.pop();
					const row = rows.get(cur);
					(row ? row.prevSkillIds : []).forEach((p) => { if (!out.has(p)) { out.add(p); stack.push(p); } });
				}
				return out;
			};
			rows.forEach((e, id) => {
				const anc = ancestors(id);
				if (anc.has(id)) cyc.push(id);
				if (e.hintRootSkillId !== undefined) {
					if (!anc.has(e.hintRootSkillId)) badRoot.push(id + ': 根 ' + e.hintRootSkillId + ' が前段をさかのぼった祖先にない');
					const rootRow = rows.get(e.hintRootSkillId);
					if (rootRow && rootRow.hintRootSkillId !== undefined) badRoot.push(id + ': 根 ' + e.hintRootSkillId + ' 自身が別の根を指している（根は自分自身が根）');
				}
			});
			none(unknown.concat(missing), STEP_UP_FILE + ': キーが決めた形（知らないキーが無く、必須が揃っている）');
			none(bad, STEP_UP_FILE + ': category・版・prevSkillIds の形');
			none(dup, STEP_UP_FILE + ': skillId が重複しない（1スキル1行）');
			none(unregistered, STEP_UP_FILE + ': skillId・prevSkillIds・hintRootSkillId がすべてマスターか拡張スキルで引ける');
			none(selfPrev, STEP_UP_FILE + ': 自分自身を前段にしない');
			none(dupPrev, STEP_UP_FILE + ': prevSkillIds の中に重複が無い');
			none(cyc, STEP_UP_FILE + ': 前段をさかのぼって自分に戻らない（循環しない）');
			none(badRoot, STEP_UP_FILE + ': hintRootSkillId は前段をさかのぼった祖先で、自身は根');
			const multi = [...rows.values()].filter((e) => isArr(e.prevSkillIds) && e.prevSkillIds.length >= 2).map((e) => e.skillId + '（前段 ' + e.prevSkillIds.length + '個）');
			if (multi.length) warn(STEP_UP_FILE + ': 前段が2個以上のスキル（「すべて必要」か「どれか1つ」かは要確認）', multi);
		}
	}

	/* --- 効果量の段階（C-129・2026-10-06。「低効果を除外」とオススメサポの「低効果」が使う。最初に必要になったときだけ読むファイル） ---
	   形は許可リスト方式（説明文の本文などを持たない＝知らないキーは落とす）。skillId は skill-pt.json に全部あり重複しない。
	   maxStage は stages の key か null。lowEffectMax の key と rank は stages の1つと一致する。段階の語はここに書かない（データから読む）。 */
	const EFFECT_FILE = 'skill-effect-levels.json';
	const er = readOpt(EFFECT_FILE);
	if (er === null) {
		console.log('       ' + EFFECT_FILE + ': まだ無い（無ければ見ない）');
	} else {
		check(er.ok, EFFECT_FILE + ' が読める', er.ok ? undefined : er.error);
		if (er.ok) {
			const d = er.data;
			const unknown = [], missing = [], bad = [], dup = [], notInPt = [], badStage = [], badName = [];
			checkKeys(d, { need: ['category', 'dataVersion', 'stages', 'lowEffectMax', 'entries'], opt: ['note'] }, EFFECT_FILE, unknown, missing);
			if (d.category !== 'skillEffectLevel') bad.push('category が ' + JSON.stringify(d.category));
			if (!DATA_VERSION_RE.test(String(d.dataVersion))) bad.push('dataVersion の形が違う: ' + String(d.dataVersion));
			const stages = isArr(d.stages) ? d.stages : [];
			if (!isArr(d.stages) || stages.length === 0) bad.push('stages が空でない配列でない');
			const rankOf = new Map();
			stages.forEach((s, i) => {
				const w = 'stages[' + i + ']';
				if (!checkKeys(s, { need: ['key', 'rank'], opt: [] }, w, unknown, missing)) return;
				if (!isStr(s.key)) bad.push(w + '.key: 空でない文字列');
				if (!isInt(s.rank) || s.rank < 1) bad.push(w + '.rank: 1以上の整数');
				if (rankOf.has(s.key)) bad.push(w + ': key が重複 ' + s.key);
				if ([...rankOf.values()].includes(s.rank)) bad.push(w + ': rank が重複 ' + s.rank);
				rankOf.set(s.key, s.rank);
			});
			const lm = d.lowEffectMax;
			if (checkKeys(lm, { need: ['key', 'rank'], opt: [] }, 'lowEffectMax', unknown, missing)) {
				if (!rankOf.has(lm.key) || rankOf.get(lm.key) !== lm.rank) bad.push('lowEffectMax の key と rank が stages の1つと一致しない: ' + JSON.stringify(lm));
			}
			const pr = readOpt(PT_FILE);
			const ptIds = new Set(pr && pr.ok && isArr(pr.data.entries) ? pr.data.entries.map((e) => e && e.skillId) : []);
			const nameOf = new Map(masterNameById);
			docs.extendedSkill.entries.forEach((e) => nameOf.set(String(e.id), e.name));
			const seen = new Set();
			if (!isArr(d.entries) || d.entries.length === 0) bad.push('entries が空でない配列でない');
			(isArr(d.entries) ? d.entries : []).forEach((e, i) => {
				const w = 'entries[' + i + ']';
				if (!checkKeys(e, { need: ['skillId', 'name', 'maxStage'], opt: [] }, w, unknown, missing)) return;
				if (!isStr(e.skillId)) { bad.push(w + '.skillId: 空でない文字列'); return; }
				if (seen.has(e.skillId)) dup.push(w + ': ' + e.skillId); seen.add(e.skillId);
				if (!ptIds.has(e.skillId)) notInPt.push(w + ': ' + e.skillId);
				if (e.maxStage !== null && !rankOf.has(e.maxStage)) badStage.push(w + ': ' + e.skillId + ' の maxStage ' + JSON.stringify(e.maxStage));
				if (nameOf.has(e.skillId) && nameOf.get(e.skillId) !== e.name) badName.push(w + ': ' + e.skillId);
			});
			none(unknown.concat(missing), EFFECT_FILE + ': キーが決めた形（知らないキー〔説明文の本文など〕が無く、必須が揃っている）');
			none(bad, EFFECT_FILE + ': category・版・stages・lowEffectMax の形（lowEffectMax は stages の1つと一致）');
			none(dup, EFFECT_FILE + ': skillId が重複しない');
			none(notInPt, EFFECT_FILE + ': skillId がすべて ' + PT_FILE + ' にある');
			none(badStage, EFFECT_FILE + ': maxStage は stages の key か null');
			none(badName, EFFECT_FILE + ': name（照合の控え）がマスター・拡張スキルの名前と一致');
			if (isArr(d.entries) && lm && rankOf.has(lm.key)) {
				const low = d.entries.filter((e) => e && e.maxStage !== null && rankOf.get(e.maxStage) <= lm.rank).length;
				const nul = d.entries.filter((e) => e && e.maxStage === null).length;
				console.log('       ' + EFFECT_FILE + ': ' + d.entries.length + '件（低効果 ' + low + '件・段階なし ' + nul + '件）');
			}
		}
	}
}

console.log('\n=== 7. 進み具合（情報。検査には影響しない） ===');
{
	const ex = docs.extendedSkill.entries;
	const tagged = ex.filter((e) => e.tags !== undefined).length;
	console.log('     拡張スキル: ' + ex.length + '件（タグ済 ' + tagged + ' / 未設定 ' + (ex.length - tagged) + '）');
	console.log('     シナリオ因子: ' + docs.scenarioFactor.entries.length + '件');
	console.log('     遺伝子: ' + docs.geneFactor.entries.length + '件');

	const countBy = (list, pick) => STATUS_VALUES.map((v) => v + ' ' + list.filter((e) => pick(e) === v).length).join(' / ');
	const uma = docs.trainingUmamusume.entries;
	console.log('     育成ウマ娘: ' + uma.length + '件');
	console.log('       初期スキル: ' + countBy(uma, (e) => (e.dataStatus || {}).initial));
	console.log('       覚醒スキル: ' + countBy(uma, (e) => (e.dataStatus || {}).awakening));

	const cards = docs.supportCard.entries;
	const ev = docs.supportCardEventSkill.entries;
	console.log('     サポートカード: ' + cards.length + '件');
	// 種類ごとの件数。**並びは typeOrder の昇順**（データの並び順はゲーム内の順番と違う）。
	// 種類の名前はデータから読む。
	{
		const byType = new Map();
		cards.forEach((e) => {
			const key = String(e.type || '(種類なし)');
			const cur = byType.get(key) || { n: 0, order: isInt(e.typeOrder) ? e.typeOrder : Number.MAX_SAFE_INTEGER };
			cur.n++;
			byType.set(key, cur);
		});
		const line = [...byType.entries()].sort((a, b) => a[1].order - b[1].order)
			.map(([name, v]) => name + ' ' + v.n).join(' / ');
		console.log('       種類: ' + (line || '(まだ入っていません)'));
	}
	console.log('       ヒント: ' + countBy(cards, (e) => (e.dataStatus || {}).hint));
	console.log('       イベント: done ' + ev.filter((e) => e.status === 'done').length
		+ ' / seeded（取り込んだまま） ' + ev.filter((e) => e.status === 'seeded').length
		+ ' / none ' + ev.filter((e) => e.status === 'none').length
		+ ' / 未記載（未確認） ' + Math.max(0, cards.length - ev.length));
	{
		const byRarity = {};
		cards.forEach((e) => { const k = e.rarity || '(なし)'; byRarity[k] = (byRarity[k] || 0) + 1; });
		console.log('       レアリティ: ' + Object.keys(byRarity).map((k) => k + ' ' + byRarity[k]).join(' / ')
			+ '／グループのカード ' + cards.filter((e) => e.isGroup === true).length + '枚');
		const ce = docs.characterEventSkill.entries;
		console.log('     キャラクター共通のイベント: done ' + ce.filter((e) => e.status === 'done').length
			+ ' / seeded ' + ce.filter((e) => e.status === 'seeded').length
			+ ' / none ' + ce.filter((e) => e.status === 'none').length);
	}
}

if (warnings.length > 0) {
	console.log('\n=== 警告（検査は落とさないが、放置しないこと。' + warnings.length + '件） ===');
	warnings.forEach((w) => console.log('  ・' + w));
}
console.log('\n' + (ok ? '=== 総合: OK ===' : '=== 総合: NG（上の[NG]を確認） ==='));
process.exit(ok ? 0 : 1);
