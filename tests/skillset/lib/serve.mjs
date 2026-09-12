// 検証用の最小静的サーバ。リポジトリと素材フォルダの両方を配信する。
//
// file:// のままだと、別ディレクトリの動画を <video> に読ませたときに canvas が汚染され
// getImageData() が使えない。http で同一オリジンにすれば済むのでこうする。
// 動画のシークのために Range リクエストに対応する。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, assetsRoot } from './assets.mjs';

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.mp4': 'video/mp4',
	'.mov': 'video/quicktime',
	'.m4v': 'video/mp4'
};

/** /assets/... は素材フォルダ、それ以外はリポジトリ。 */
function resolveFile(urlPath) {
	if (urlPath.startsWith('/assets/')) {
		const root = assetsRoot();
		const file = path.join(root, urlPath.slice('/assets/'.length));
		return file.startsWith(root) ? file : null;
	}
	const file = path.join(REPO_ROOT, urlPath === '/' ? '/index.html' : urlPath);
	return file.startsWith(REPO_ROOT) ? file : null;
}

export function startServer(port = 0) {
	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			const urlPath = decodeURIComponent(req.url.split('?')[0]);
			const file = resolveFile(urlPath);
			if (!file) { res.writeHead(403); res.end(); return; }
			fs.stat(file, (err, st) => {
				if (err || !st.isFile()) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
				const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
				const range = req.headers.range;
				if (range) {
					const m = /bytes=(\d*)-(\d*)/.exec(range);
					const start = m && m[1] ? Number(m[1]) : 0;
					const end = m && m[2] ? Number(m[2]) : st.size - 1;
					res.writeHead(206, {
						'Content-Type': type,
						'Content-Range': `bytes ${start}-${end}/${st.size}`,
						'Accept-Ranges': 'bytes',
						'Content-Length': end - start + 1,
						'Cache-Control': 'no-store'
					});
					fs.createReadStream(file, { start, end }).pipe(res);
					return;
				}
				res.writeHead(200, {
					'Content-Type': type,
					'Accept-Ranges': 'bytes',
					'Content-Length': st.size,
					'Cache-Control': 'no-store'
				});
				fs.createReadStream(file).pipe(res);
			});
		});
		server.listen(port, '127.0.0.1', () => {
			const actual = server.address().port;
			resolve({
				base: 'http://127.0.0.1:' + actual,
				close: () => new Promise((r) => server.close(r))
			});
		});
	});
}
