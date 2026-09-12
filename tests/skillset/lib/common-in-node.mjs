// js/common.js を Node の中でそのまま読み込み、照合ロジックを再実装せずに使う。
//
// common.js は素の <script>（classic script）で、読み込み時には関数定義と定数定義しか
// 行わない（DOM に触るのは関数の中だけ）。そのため vm で評価してもブラウザは要らない。
// **ロジックの複製を作らないこと**が目的。文字正規化のしきい値や混同マップを
// このリポジトリで二重に持つと、片方だけ直したときに測定結果が静かにずれる。

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { REPO_ROOT } from './assets.mjs';

const COMMON_JS = path.join(REPO_ROOT, 'js', 'common.js');

const WANTED = [
	'COMMON_JS_VERSION',
	'CHAR_CONFUSION_MAP',
	'HOMOGLYPH_MAP',
	'normalizeText',
	'levenshtein',
	'allowedDistance',
	'buildSkillDictionary',
	'matchAllSkills',
	'matchAllSkillsWithStars',
	'extractLines'
];

function evaluateCommonJs(source) {
	const sandbox = {
		console,
		// common.js の読み込み時には DOM を使わないが、万一使われたら黙って動くより落としたい
		document: new Proxy({}, { get() { throw new Error('common.js が読み込み時に document を使っています'); } }),
		window: undefined
	};
	const context = vm.createContext(sandbox);
	const appendix = `\nglobalThis.__commonExports = { ${WANTED.join(', ')} };\n`;
	new vm.Script(source + appendix, { filename: 'js/common.js' }).runInContext(context);
	return context.__commonExports;
}

const source = fs.readFileSync(COMMON_JS, 'utf-8');
export const common = evaluateCommonJs(source);

/**
 * 文字混同マップ（CHAR_CONFUSION_MAP）を**使わない**正規化。
 * normalizeText() から混同マップの一段だけを抜いたもので、それ以外（NFKC・記号落とし・
 * 見た目が同じ字の統一＝HOMOGLYPH_MAP・長音の連続の圧縮）は同じ。
 * 「OCRの読みがそのまま一致したのか、混同マップのおかげで一致したのか」を分けて数えるために使う。
 *
 * normalizeText() 本体には手を入れられない（製品ファイル）ので、混同マップを空にして
 * 同じ手順を踏む実装をここに置く。**手順を変えたら common.js 側と突き合わせること。**
 */
export function normalizeWithoutConfusion(input) {
	if (!input) return '';
	let s = String(input).normalize('NFKC');
	s = s.replace(/[\s　]/g, '');
	s = s.replace(/[★☆✦✧♪♫※・,.。、:：;；!！?？"'`()（）[\]{}<>«»\\/@#$%^&*+=]/g, '');
	let out = '';
	for (const ch of s) {
		const c = common.HOMOGLYPH_MAP[ch] !== undefined ? common.HOMOGLYPH_MAP[ch] : ch;
		out += c;
	}
	return out.replace(/ー{2,}/g, 'ー');
}

/**
 * 混同マップに一時的な読み替えを足した状態の normalizeText。
 * common.js を書き換えずに候補を試すための入口（フェーズ0では common.js を変更しない）。
 */
export function normalizeWithExtraMap(input, extra) {
	if (!input) return '';
	let s = String(input).normalize('NFKC');
	s = s.replace(/[\s　]/g, '');
	s = s.replace(/[★☆✦✧♪♫※・,.。、:：;；!！?？"'`()（）[\]{}<>«»\\/@#$%^&*+=]/g, '');
	const conf = Object.assign({}, common.CHAR_CONFUSION_MAP, extra || {});
	let out = '';
	for (const ch of s) {
		let c = conf[ch] !== undefined ? conf[ch] : ch;
		c = common.HOMOGLYPH_MAP[c] !== undefined ? common.HOMOGLYPH_MAP[c] : c;
		out += c;
	}
	return out.replace(/ー{2,}/g, 'ー');
}

/** uma-skill-deck-skills.json のスキル一覧（445種）。 */
export function loadMaster() {
	const json = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'uma-skill-deck-skills.json'), 'utf-8'));
	const skills = json.skills || json;
	return skills.map((s) => ({ id: s.id != null ? s.id : s.name, name: s.name || String(s) }));
}
