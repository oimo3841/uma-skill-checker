// テスト用の最小静的サーバ。
// file:// で開くと JSON の fetch が CORS で落ちるため、http で配信する。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// UMA_TEST_ROOT: 値を変えた製品の写しを配信して、検査が NG を出すか確かめるときだけ使う（T216。ふだんは未設定＝この作業フォルダ）
export const REPO_ROOT = process.env.UMA_TEST_ROOT ? path.resolve(process.env.UMA_TEST_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml',
};

/**
 * リポジトリルートを配信する。
 * @returns {Promise<{ base: string, close: () => Promise<void> }>}
 */
export function startServer(port = 0) {
	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			const url = decodeURIComponent(req.url.split('?')[0]);
			const file = path.join(REPO_ROOT, url === '/' ? '/index.html' : url);
			if (!file.startsWith(REPO_ROOT)) { res.writeHead(403); res.end(); return; }
			fs.readFile(file, (err, buf) => {
				if (err) { res.writeHead(404); res.end('not found: ' + url); return; }
				res.writeHead(200, {
					'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
					// 版ずれの検証を邪魔しないよう、テスト中はキャッシュさせない
					'Cache-Control': 'no-store',
				});
				res.end(buf);
			});
		});
		server.listen(port, '127.0.0.1', () => {
			const actual = server.address().port;
			resolve({
				base: 'http://127.0.0.1:' + actual,
				close: () => new Promise((r) => server.close(r)),
			});
		});
	});
}

// 単体で起動したときはポート8123で待ち受ける（手動確認用）
if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) {
	const { base } = await startServer(8123);
	console.log('serving ' + REPO_ROOT + ' on ' + base);
}
