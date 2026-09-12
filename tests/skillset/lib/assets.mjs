// スキルセットOCRの検証素材（ゲームのスクリーンショット・画面収録）の置き場所を解決する。
//
// 素材はGitの管理外（Googleドライブ同期フォルダ）に置く。理由はB節ルール8・10補足:
// ゲームのスクリーンショットを公開リポジトリに入れないため。
// **実際のパスはこのリポジトリのどのファイルにも書かない。** 次の順に探す:
//
//   1. 環境変数 UMA_SKILLSET_ASSETS
//   2. リポジトリ直下の .skillset-assets.json（.gitignore 済み）の "root"
//
// どちらも無ければエラーにして、設定方法を表示する。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');
const LOCAL_CONFIG = path.join(REPO_ROOT, '.skillset-assets.json');

export function assetsRoot() {
	const fromEnv = process.env.UMA_SKILLSET_ASSETS;
	if (fromEnv && fromEnv.trim()) return ensureExists(fromEnv.trim(), '環境変数 UMA_SKILLSET_ASSETS');
	if (fs.existsSync(LOCAL_CONFIG)) {
		const json = JSON.parse(fs.readFileSync(LOCAL_CONFIG, 'utf-8'));
		if (json && json.root) return ensureExists(String(json.root), '.skillset-assets.json の "root"');
	}
	throw new Error(
		[
			'素材フォルダの場所が分かりません。次のどちらかを設定してください:',
			'  1) 環境変数 UMA_SKILLSET_ASSETS に素材フォルダの絶対パスを入れる',
			'  2) リポジトリ直下に .skillset-assets.json を作り {"root": "<絶対パス>"} と書く',
			'     （.gitignore 済み。パスをリポジトリ内のファイルへ直書きしないための仕組み）'
		].join('\n')
	);
}

function ensureExists(dir, where) {
	if (!fs.existsSync(dir)) throw new Error(`${where} が指すフォルダが見つかりません: ${dir}`);
	return dir;
}

/** 素材フォルダ配下の決まった場所。無ければ作る。 */
export function assetsDir(...parts) {
	const dir = path.join(assetsRoot(), ...parts);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

/** 素材フォルダ配下のパスをログに出すときは、根を伏せて相対で見せる。 */
export function relToAssets(p) {
	return path.relative(assetsRoot(), p).split(path.sep).join('/');
}

/** <種別>/<撮影セット名>/ の一覧。 */
export function listSets(kind) {
	const dir = path.join(assetsRoot(), kind);
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();
}

export function listFiles(dir, extensions) {
	if (!fs.existsSync(dir)) return [];
	const exts = new Set(extensions.map((e) => e.toLowerCase()));
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isFile() && exts.has(path.extname(e.name).toLowerCase()))
		.map((e) => path.join(dir, e.name))
		.sort();
}
