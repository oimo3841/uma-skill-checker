// 恒久ルールが2か所で一致しているかを見る。
//
//   npm run check:rules      … 単体で回す
//   npm run test:verify      … 納品前チェックの §8 からも呼ばれる
//
// ■ なぜ要るか
//   恒久ルールは**同じ全文が2か所**にある。リポジトリ直下の `CLAUDE.md`（Claude Code が
//   毎セッション自動で読む。.gitignore 済み）と、同期フォルダ側の `CLAUDE-RULES.md`（人が
//   読む用・バックアップ用）。
//   2026-09-16 に、`@` でリポジトリ外の絶対パスを読み込む形を実測したが展開されず
//   （区切りが / でも \ でも不可。ジャンクション越しの相対パスでも不可）、参照ではなく
//   全文を2か所に置く形になった。
//   弱点は「2か所にあること」ではなく「**コピーし忘れても誰も気づかないこと**」なので、
//   気づける形に機械化したのがこの検査。
//
// ■ 正本の場所をリポジトリに書かない（恒久ルール12）
//   同期フォルダ側のパスはこのファイルにも設定ファイル以外のどこにも書かない。次の順に探す:
//     1. 環境変数 UMA_CLAUDE_RULES
//     2. リポジトリ直下の .claude-rules.json（.gitignore 済み）の "rulesFile"
//   画面に出すときは根を伏せて `<同期フォルダ>/CLAUDE-RULES.md` とだけ表示する。
//
// ■ 落とすもの／警告にとどめるもの
//   落とす: 内容の不一致 / CLAUDE.md が無い / 同期フォルダは見えるのに正本が無い
//   警告  : 改行コードだけが違う / 同期フォルダの根が見えない / パスが未設定
//   環境の都合（Google ドライブ パソコン版が起動していない、clone 直後）で落とすと、
//   変更と無関係な理由で push が止まる。それは check-privacy.mjs と同じ理由で避ける
//   （偽陽性が出る設計では、警告が読まれなくなる）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const LOCAL_CONFIG = path.join(REPO_ROOT, '.claude-rules.json');
export const REPO_RULES_FILE = path.join(REPO_ROOT, 'CLAUDE.md');

/** 同期フォルダ側の正本の場所。見つからなければ file: null。 */
export function resolveRulesFile({ env = process.env, configFile = LOCAL_CONFIG } = {}) {
	const fromEnv = env.UMA_CLAUDE_RULES;
	if (fromEnv && String(fromEnv).trim()) {
		return { file: String(fromEnv).trim(), from: '環境変数 UMA_CLAUDE_RULES' };
	}
	if (fs.existsSync(configFile)) {
		try {
			const j = JSON.parse(fs.readFileSync(configFile, 'utf8'));
			if (j && j.rulesFile) return { file: String(j.rulesFile), from: '.claude-rules.json の "rulesFile"' };
			return { file: null, from: null, note: '.claude-rules.json に "rulesFile" が無い' };
		} catch {
			return { file: null, from: null, note: '.claude-rules.json を JSON として読めない' };
		}
	}
	return { file: null, from: null };
}

/** 根を伏せて見せる。値そのものはログに出さない。 */
export const mask = (p) => '<同期フォルダ>/' + path.basename(p);

export function eolOf(text) {
	const crlf = (text.match(/\r\n/g) || []).length;
	const lf = (text.match(/(?<!\r)\n/g) || []).length;
	if (crlf && lf) return `混在（CRLF ${crlf}行 / LF ${lf}行）`;
	if (crlf) return 'CRLF';
	if (lf) return 'LF';
	return '(改行なし)';
}

const normalizeEol = (s) => s.replace(/\r\n/g, '\n');

/**
 * 2つの本文を比べる。
 *   same     … 完全に同じ
 *   eol-only … 改行コードを揃えれば同じ（警告どまり）
 *   diff     … 中身が違う（落とす）。最初に違う行の「位置と長さ」だけを添える
 *
 * **本文そのものは返さない。** 返り値に行の中身を入れると、呼ぶ側がうっかり画面へ
 * 出せてしまう（実際、以前はここで返した行を80文字まで表示していた）。恒久ルールの
 * 本文は画面にも出さない約束なので、出せる形を残さない。
 */
export function compareRules(repoText, rulesText) {
	if (repoText === rulesText) return { kind: 'same' };
	const a = normalizeEol(repoText);
	const b = normalizeEol(rulesText);
	if (a === b) return { kind: 'eol-only' };
	const la = a.split('\n');
	const lb = b.split('\n');
	let i = 0;
	while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
	return {
		kind: 'diff',
		line: i + 1,
		repoLineLen: i < la.length ? [...la[i]].length : null,
		rulesLineLen: i < lb.length ? [...lb[i]].length : null,
		repoLines: la.length,
		rulesLines: lb.length,
	};
}

const stamp = (p) => {
	try {
		const d = fs.statSync(p).mtime;
		const z = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
	} catch {
		return '(不明)';
	}
};
/** 本文は出さない。行が有るか無いかと、その文字数だけを言う。 */
const lenOf = (n) => (n === null ? '（行なし）' : `${n} 文字`);

/**
 * 検査を1回走らせる。副作用は無く、結果だけ返す。
 * paths を渡せるのは、状況（不一致・CLAUDE.md が無い等）を再現して確かめられるようにするため。
 */
export function runCheck({ repoFile = REPO_RULES_FILE, env = process.env, configFile = LOCAL_CONFIG } = {}) {
	const lines = [];
	const warnings = [];
	// 「落ちなかった」と「一致を確かめられた」は別物。確かめられていないのに
	// [OK] 一致 と出すと嘘になるので、呼ぶ側が区別できるように返す。
	let verified = false;
	const say = (s) => lines.push(s);
	const warn = (s) => { warnings.push(s); say('[警告] ' + s); };
	let ok = true;
	const ng = (s, detail) => { ok = false; say('[NG] ' + s); (detail || []).forEach((d) => say('     ' + d)); };

	const resolved = resolveRulesFile({ env, configFile });

	// (d) パスが未設定 → 警告にとどめる（clone 直後・CI・別PC を想定）
	if (!resolved.file) {
		warn('恒久ルールの正本の場所が未設定のため、2か所の一致を確認できていない'
			+ (resolved.note ? `（${resolved.note}）` : ''));
		say('     次のどちらかを設定すると検査が働く:');
		say('       1) 環境変数 UMA_CLAUDE_RULES に CLAUDE-RULES.md の絶対パスを入れる');
		say('       2) リポジトリ直下に .claude-rules.json を作り {"rulesFile": "<絶対パス>"} と書く');
		say('          （.gitignore 済み。パスをリポジトリ内のファイルへ直書きしないための仕組み）');
		return { ok, verified, warnings, lines };
	}
	say(`     正本の場所: ${resolved.from} から取得（値はここには出さない）`);

	const repoExists = fs.existsSync(repoFile);
	const driveRoot = path.parse(resolved.file).root;
	const driveUp = !driveRoot || fs.existsSync(driveRoot);
	const rulesExists = driveUp && fs.existsSync(resolved.file);

	// (c) CLAUDE.md が無い → 落とす。恒久ルールが1つも効いていない状態なので、いちばん危ない
	if (!repoExists) {
		ng('CLAUDE.md がリポジトリ直下に無い', [
			'Claude Code が読むのはこのファイル。無い間は恒久ルールが1つも効いていない。',
			`${mask(resolved.file)} をリポジトリ直下に CLAUDE.md としてコピーする。`,
		]);
	}

	// 同期フォルダの根が見えない → 警告（環境の都合。変更の欠陥ではない）
	if (!driveUp) {
		warn('同期フォルダが見えないため、2か所の一致を確認できていない'
			+ '（Google ドライブ パソコン版が起動していない／オフライン／別PC）');
		return { ok, verified, warnings, lines };
	}
	// 根は見えるのに正本が無い → 落とす（消えた・改名された＝実害）
	if (!rulesExists) {
		ng(`${mask(resolved.file)} が見つからない`, [
			'同期フォルダは見えているのに正本が無い。消したか、名前を変えた可能性がある。',
		]);
		return { ok, verified, warnings, lines };
	}
	if (!repoExists) return { ok, verified, warnings, lines };

	const repoText = fs.readFileSync(repoFile, 'utf8');
	const rulesText = fs.readFileSync(resolved.file, 'utf8');
	const repoInfo = `${Buffer.byteLength(repoText, 'utf8')} B / ${repoText.split('\n').length} 行 / ${eolOf(repoText)} / 更新 ${stamp(repoFile)}`;
	const rulesInfo = `${Buffer.byteLength(rulesText, 'utf8')} B / ${rulesText.split('\n').length} 行 / ${eolOf(rulesText)} / 更新 ${stamp(resolved.file)}`;
	say(`     CLAUDE.md        ${repoInfo}`);
	say(`     CLAUDE-RULES.md  ${rulesInfo}`);

	const r = compareRules(repoText, rulesText);
	verified = true; // 両方を読んで実際に比べた
	if (r.kind === 'same') {
		// 合否そのものは末尾の「=== 恒久ルールの一致: OK ===」と、run-verify 側の [OK] が言う。
		// ここで [OK] を出すと §8 で同じ文が二重に並ぶので、明細として出す。
		say('     2か所の内容は同じ（バイト単位で一致）');
	} else if (r.kind === 'eol-only') {
		// (b) 改行コードだけの違い → 警告。中身は同じなので、ルールの内容はズレていない
		warn('改行コードだけが違う（中身は一致している）');
		say(`     CLAUDE.md        ${eolOf(repoText)}`);
		say(`     CLAUDE-RULES.md  ${eolOf(rulesText)}`);
		say('     どちらかに揃えてコピーし直すと消える。中身はズレていないので落とさない。');
	} else {
		// (a) 中身の不一致 → 落とす
		// 更新日時が同じ（＝同じ秒に書かれた）ときに、どちらかを「新しい」と言い切らない。
		const ta = fs.statSync(repoFile).mtime.getTime();
		const tb = fs.statSync(resolved.file).mtime.getTime();
		const hint = Math.abs(ta - tb) < 1000
			? '→ 更新日時はほぼ同じ。どちらが新しいかは日時からは決められないので、中身で判断する。'
			: `→ 更新日時では ${ta > tb ? 'CLAUDE.md' : 'CLAUDE-RULES.md'} のほうが新しい。新しいほうを古いほうへコピーする。`;
		ng('CLAUDE.md と CLAUDE-RULES.md が一致', [
			`最初に違う行: ${r.line} 行目`,
			`  CLAUDE.md        : ${lenOf(r.repoLineLen)}`,
			`  CLAUDE-RULES.md  : ${lenOf(r.rulesLineLen)}`,
			`行数        CLAUDE.md ${r.repoLines} / CLAUDE-RULES.md ${r.rulesLines}`,
			hint,
			'（同期フォルダ側の更新日時は、他の端末から同期で降りてきたときにも変わる。目安として見ること）',
			`中身はここには出さない。違いを見るときは、手元で CLAUDE.md と ${mask(resolved.file)} を`,
			'diff で突き合わせる（この検査に本文を出すオプションは用意しない）。',
		]);
	}
	return { ok, verified, warnings, lines };
}

/* 直接叩かれたときだけ実行する（状況を再現して確かめる側は runCheck() を import して使う） */
const invokedDirectly = process.argv[1]
	&& path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	const { ok, verified, lines } = runCheck();
	console.log('=== 恒久ルールの2か所の一致 ===');
	lines.forEach((l) => console.log(l));
	console.log('\n' + (!ok ? '=== 恒久ルールの一致: NG ==='
		: verified ? '=== 恒久ルールの一致: OK ==='
		: '=== 恒久ルールの一致: 未確認（上の警告を参照） ==='));
	// 終了コードは3値。呼ぶ側が「一致した」と「確かめられなかった」を取り違えないようにする。
	//   0 = 比べて一致した（改行コードだけの違いを含む） / 1 = 落とす / 2 = 確かめられなかった
	process.exit(!ok ? 1 : verified ? 0 : 2);
}
