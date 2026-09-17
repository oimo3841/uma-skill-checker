// catalog-data/ に置く4ファイル（拡張スキル・育成ウマ娘・サポートカード・
// サポートカードのイベントスキル）が、決めた形どおりかを確かめる。
//
//   npm run check:catalog        … 単体で回す
//   npm run test:verify          … 納品前チェックの §10 からも呼ばれる
//   node tests/catalog/check-catalog.mjs --dir=<フォルダ> --baseline=<フォルダ>
//                                … 検査そのものの動作確認用。--dir は見に行く場所を差し替え、
//                                  --baseline は「以前の内容」を git の HEAD ではなく
//                                  別のフォルダから読む（退行の検査を手元で起こせるようにするため）
//
// ■ なぜ要るか
//   この4ファイルはおいもさんが用意し、手でも書き足す。ツールは中の id を鍵にして
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
const DIR = argValue('dir') || 'catalog-data';
const BASELINE_DIR = argValue('baseline');
const MASTER_FILE = 'uma-skill-deck-skills.json';

/* ──────────────────────── 形の定義（許可リスト） ──────────────────────── */

const FILES = [
	{ category: 'extendedSkill', file: 'extended-skills.json', prefix: 'ex-', key: 'id' },
	{ category: 'trainingUmamusume', file: 'training-umamusume.json', prefix: 'uma-', key: 'id' },
	{ category: 'supportCard', file: 'support-cards.json', prefix: 'card-', key: 'id' },
	// イベントスキルは独自の id を振らず、サポートカードの id（card-）を鍵にする
	{ category: 'supportCardEventSkill', file: 'support-card-event-skills.json', prefix: 'card-', key: 'cardId' },
];

// 上位のキー。need=必須 / opt=あってもよい。これ以外は落とす。
// イベントスキルのファイルは独自の id を振らないので nextSerial を持たない（行の鍵は cardId）。
const TOP_KEYS = {
	extendedSkill: { need: ['dataVersion', 'category', 'nextSerial', 'entries'], opt: ['note'] },
	trainingUmamusume: { need: ['dataVersion', 'category', 'nextSerial', 'entries'], opt: ['note'] },
	supportCard: { need: ['dataVersion', 'category', 'nextSerial', 'entries'], opt: ['note'] },
	supportCardEventSkill: { need: ['dataVersion', 'category', 'entries'], opt: ['note'] },
};

const ENTRY_KEYS = {
	extendedSkill: { need: ['id', 'name'], opt: ['tags', 'tagsPending'] },
	trainingUmamusume: { need: ['id', 'title', 'charaName', 'initialStar', 'initialSkills', 'awakeningSkills', 'dataStatus'], opt: [] },
	supportCard: { need: ['id', 'title', 'charaName', 'hintSkills', 'dataStatus'], opt: [] },
	supportCardEventSkill: { need: ['cardId', 'status', 'skills'], opt: [] },
};

const SKILL_REF_KEYS = { need: ['skillId', 'name'], opt: [] };
const STAR_ROW_KEYS = { need: ['minStar', 'skills'], opt: [] };
const LEVEL_ROW_KEYS = { need: ['level', 'skills'], opt: [] };
const DATA_STATUS_KEYS = {
	trainingUmamusume: { need: ['initial', 'awakening'], opt: [] },
	supportCard: { need: ['hint'], opt: [] },
};

const STATUS_VALUES = ['done', 'none', 'pending'];
const EVENT_STATUS_VALUES = ['done', 'none'];
const STAR_MIN = 1, STAR_MAX = 5;
// 覚醒レベルに上限は設けない（0以上の整数・昇順・重複なし だけを見る）。
// レベルの上限はゲーム側で変わりうるので、決め打ちにすると、増えたときに
// 正しいデータのほうが落ちる。0 は「覚醒のレベルに紐づかない枠（最初から
// 持っているスキル）」を表すので、下限は 1 ではなく 0。
const LEVEL_MIN = 0;
const DATA_VERSION_RE = /^\d{4}-\d{2}-\d{2}[a-z]$/;
const SERIAL_RE = /^(\d{4,})$/;

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
	none(unreadable, '4ファイルすべてが JSON として読める');
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
function readSkillRefs(list, where) {
	if (!isArr(list)) { badTypes.push(where + ': 配列でない'); return; }
	list.forEach((ref, i) => {
		const w = where + '[' + i + ']';
		if (!checkKeys(ref, SKILL_REF_KEYS, w, unknownKeys, missingKeys)) return;
		if (!isStr(ref.skillId) || !isStr(ref.name)) { badTypes.push(w + ': skillId / name は空でない文字列'); return; }
		refs.push({ where: w, skillId: ref.skillId, name: ref.name });
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
	readSkillRefs(e.hintSkills, w + '.hintSkills');
	if (checkKeys(e.dataStatus, DATA_STATUS_KEYS.supportCard, w + '.dataStatus', unknownKeys, missingKeys)) {
		if (!STATUS_VALUES.includes(e.dataStatus.hint)) badTypes.push(w + '.dataStatus.hint: ' + JSON.stringify(e.dataStatus.hint));
	}
});

// サポートカードのイベントスキル
docs.supportCardEventSkill.entries.forEach((e, i) => {
	const w = 'supportCardEventSkill[' + i + ']';
	if (!checkKeys(e, ENTRY_KEYS.supportCardEventSkill, w, unknownKeys, missingKeys)) return;
	if (!isStr(e.cardId)) badTypes.push(w + ': cardId は空でない文字列');
	if (!EVENT_STATUS_VALUES.includes(e.status)) badTypes.push(w + '.status: ' + JSON.stringify(e.status));
	readSkillRefs(e.skills, w + '.skills');
});

none(unknownKeys, '知らないキーが無い（許可リストどおり）');
none(missingKeys, '必須のキーが揃っている');
none(badTypes, '値が決めた形になっている');

/* ──────────────────────── 3. ID ──────────────────────── */

console.log('\n=== 3. ID ===');
// 同じフォルダにある他のカタログ（シナリオ因子など）の名前。§4 でも使う。
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
			if (e && e.name) otherCatalogNames.set(String(e.name), String(e.id));
		});
	}

	for (const f of FILES) {
		const doc = docs[f.category];
		const ids = doc.entries.map((e) => String(e[f.key] || ''));
		let maxSerial = 0;
		ids.forEach((id, i) => {
			const where = f.category + '[' + i + ']';
			if (!id.startsWith(f.prefix)) { badForm.push(where + ': ' + id); return; }
			const tail = id.slice(f.prefix.length);
			if (!SERIAL_RE.test(tail) || Number(tail) < 1) { badForm.push(where + ': ' + id); return; }
			maxSerial = Math.max(maxSerial, Number(tail));
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
		for (let i = 1; i < ids.length; i++) {
			const a = Number(ids[i - 1].replace(/^\D+/, '')), b = Number(ids[i].replace(/^\D+/, ''));
			if (Number.isFinite(a) && Number.isFinite(b) && b < a) { notAscending.push(f.category + ': ' + ids[i - 1] + ' → ' + ids[i]); break; }
		}
		if (TOP_KEYS[f.category].need.includes('nextSerial')) {
			const ns = String(doc.nextSerial || '');
			const tail = ns.startsWith(f.prefix) ? ns.slice(f.prefix.length) : '';
			if (!SERIAL_RE.test(tail)) badNext.push(f.category + ': ' + ns);
			else if (Number(tail) <= maxSerial) badNext.push(f.category + ': ' + ns + '（使用済みの最大は ' + maxSerial + '）');
		}
	}
	none(badForm, 'id が「接頭辞＋4桁以上の数字」の形');
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
}

/* ──────────────────────── 5. ★・覚醒レベル・状態 ──────────────────────── */

console.log('\n=== 5. ★・覚醒レベル・状態 ===');
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

	docs.supportCardEventSkill.entries.forEach((e, i) => {
		const w = 'supportCardEventSkill[' + i + ']';
		const n = isArr(e.skills) ? e.skills.length : 0;
		if (e.status === 'done' && n === 0) statusProblems.push(w + '.status: done なのに1件も無い');
		if (e.status === 'none' && n > 0) statusProblems.push(w + '.status: none なのに中身がある');
	});

	none(starProblems, 'minStar が初期の★以上で、昇順・重複なし');
	none(levelProblems, '覚醒レベルが昇順・重複なし');
	none(statusProblems, '状態の印と中身が食い違わない');
}

/* ──────────────────────── 6. 以前の内容との突き合わせ ──────────────────────── */

console.log('\n=== 6. 以前の内容との突き合わせ（' + (BASELINE_DIR || 'git の HEAD') + '） ===');
{
	const lost = [], renamed = [], serialBack = [];
	let compared = 0;
	for (const f of FILES) {
		const prev = readPrevious(f.file);
		if (!prev || !isArr(prev.entries)) continue;
		compared++;
		const now = new Map(docs[f.category].entries.map((e) => [String(e[f.key]), e]));
		prev.entries.forEach((pe) => {
			const id = String(pe[f.key] || '');
			if (!id) return;
			const cur = now.get(id);
			if (!cur) { lost.push(f.category + ': ' + id); return; }
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
		none(serialBack, 'nextSerial が戻っていない');
		if (renamed.length) warn('名前・二つ名が変わった行がある（表記の修正なら問題ない）', renamed);
	}
}

/* ──────────────────────── 7. 進み具合（情報） ──────────────────────── */

console.log('\n=== 7. 進み具合（情報。検査には影響しない） ===');
{
	const ex = docs.extendedSkill.entries;
	const tagged = ex.filter((e) => e.tags !== undefined).length;
	console.log('     拡張スキル: ' + ex.length + '件（タグ済 ' + tagged + ' / 未設定 ' + (ex.length - tagged) + '）');

	const countBy = (list, pick) => STATUS_VALUES.map((v) => v + ' ' + list.filter((e) => pick(e) === v).length).join(' / ');
	const uma = docs.trainingUmamusume.entries;
	console.log('     育成ウマ娘: ' + uma.length + '件');
	console.log('       初期スキル: ' + countBy(uma, (e) => (e.dataStatus || {}).initial));
	console.log('       覚醒スキル: ' + countBy(uma, (e) => (e.dataStatus || {}).awakening));

	const cards = docs.supportCard.entries;
	const ev = docs.supportCardEventSkill.entries;
	console.log('     サポートカード: ' + cards.length + '件');
	console.log('       ヒント: ' + countBy(cards, (e) => (e.dataStatus || {}).hint));
	console.log('       イベント: done ' + ev.filter((e) => e.status === 'done').length
		+ ' / none ' + ev.filter((e) => e.status === 'none').length
		+ ' / 未記載（未確認） ' + Math.max(0, cards.length - ev.length));
}

if (warnings.length > 0) {
	console.log('\n=== 警告（検査は落とさないが、放置しないこと。' + warnings.length + '件） ===');
	warnings.forEach((w) => console.log('  ・' + w));
}
console.log('\n' + (ok ? '=== 総合: OK ===' : '=== 総合: NG（上の[NG]を確認） ==='));
process.exit(ok ? 0 : 1);
