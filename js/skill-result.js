/* 本育成結果（T188・決定 775・783〜788）。本育成のスキル画面のスクショを1枚の画像にまとめる（OCR はしない）。special.html・exam.html の③／②の
 * 「本育成結果」のタブの中身。親A〜祖B2 の枠（persons）には入れず、この部品の中だけに持つ（OCR・照合結果・Deck へ送るぶん・タブの枚数・未読の印に混ざらない）。
 *
 * - 結合は凍結の js/stitch.js の stitchOnePerson をそのまま呼ぶ（呼び出し側が host.stitchOnePerson で渡す）。
 *   上の欄（タイトル「ウマ娘詳細」〜タブ）は結合では捨てられるので、ここで1枚目から足す（形2・T187）。左右は小窓の端で切る（ゲームの背景を落とす）。
 *   右のスクロールのつまみ（切れ切れに写る）は、つまみの列を右隣の地の色で塗る。
 * - 形は「1列｜2列」（785）。2列の見せ方は案を3つ持ち、決まるまで切り替えられる（既定は1列）。タイトルのバーは付けない（786）。
 * - つなぎ目の「一致度が低い」は、本育成結果用の文で出す（787）。
 * - スキルの数（全部・固有・進化・金・白）は、OCR を使わず行の色で数える試し（788。表示の置き場所は案。決定を待つ）。
 * - メモリは T133・T186 と同じ作り: サムネイルは幅 336px の縮小画像・結合画像は Blob の object URL・使わなくなった URL は手放す。
 * 文の案はすべて SR_TEXTS（キーは報告の文の案の一覧と同じ）。
 */
(function () {
	'use strict';
	const SKILL_RESULT_JS_VERSION = '2026-11-16a';

	const SR_TEXTS = {
		'sr.lead': '本育成のスキル画面のスクショを、上から順に選んでください。1枚の画像にまとめます（OCR はしません）。',
		'sr.btn.pick': '画像を選ぶ',
		'sr.btn.clear': 'クリア',
		'sr.btn.build': '1枚にまとめる',
		'sr.btn.busy': 'まとめています…',
		'sr.form': '形',
		'sr.form2': '2列の見せ方（試し）',
		'sr.v.half': '案1 一覧を半分',
		'sr.v.even': '案2 高さをそろえる',
		'sr.v.span': '案3 上の欄を上に',
		'sr.info': 'スキルの数の表示（試し）',
		'sr.info.none': 'なし',
		'sr.info.panel': '欄の中',
		'sr.info.image': '画像の中',
		'sr.info.both': '両方',
		'sr.one': '1枚だけのときは、選んだ画像をそのまま出します。',
		'sr.stale': '画像が変わりました。「1枚にまとめる」を押すと作り直します。',
		'sr.warn': 'つなぎ目の一部で、スキルの行がずれているかもしれません。行が抜けたり重なったりしていないか見てください。',
		'sr.fail': '画像をまとめられませんでした: {msg}',
		'sr.done': '本育成結果の画像をまとめました',
		'sr.count': 'スキル {all}（固有 {unique}・進化 {evo}・金 {gold}・白 {white}）',
		'sr.count.note': '色で数えた目安です',
		'sr.dl': 'PNGをダウンロード',
		'sr.title': '本育成結果'
	};
	function t(key, vars) {
		return SR_TEXTS[key].replace(/\{([^}]+)\}/g, (m, k) => (vars && k in vars) ? String(vars[k]) : m);
	}
	const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

	/* ───────── 画像の組み立て（同期・DOM の外。検査はここを直接呼ぶ） ───────── */
	function mk(w, h) {
		const c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(w));
		c.height = Math.max(1, Math.round(h));
		const x = c.getContext('2d');
		x.fillStyle = '#ffffff';
		x.fillRect(0, 0, c.width, c.height);
		return c;
	}
	function pixels(canvas) {
		return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
	}
	/** 小窓の上端の緑の帯（「ウマ娘詳細」）の行と、小窓の左右の端。special.html の stitchModalBand と同じ見方（画の上半分で横幅の 70% 超が緑の最初の行）。無ければ null */
	function modalBand(canvas) {
		const W = canvas.width, H = Math.floor(canvas.height * 0.5);
		if (W < 10 || H < 2) return null;
		const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
		const green = (i) => d[i + 1] > 150 && d[i + 1] > d[i] + 30 && d[i + 1] > d[i + 2] + 60;
		for (let y = 0; y < H; y++) {
			let n = 0;
			for (let x = 0; x < W; x += 2) if (green((y * W + x) * 4)) n++;
			if (n * 2 <= W * 0.7) continue;
			const my = Math.min(H - 1, y + Math.round(W * 0.03));
			let lx = W, rx = -1;
			for (let x = 0; x < W; x++) if (green((my * W + x) * 4)) { if (x < lx) lx = x; rx = x; }
			if (rx < 0 || rx + 1 - lx < W * 0.6) return null;
			return { top: y, L: lx, R: rx + 1 };
		}
		return null;
	}
	/** 右のスクロールのつまみ（溝とつまみ）の列を、右隣の地の色で塗る。戻り値: 塗った列 [x0, x1) か null。
	 *  溝は行の間（ほかの所は明るい）にも続くので、右の 8% の中で「灰色（明るさ 100〜232・色み少ない）の行が 88% 以上」の列が
	 *  6列以上・幅の 3% 以下で続くまとまり（右端に接しないもの。右端の線は小窓の枠）とする。パネルの右の影は行の間で明るいので当たらない。
	 *  7枚の素材で測った溝の色は (208〜224) 前後・つまみは (112〜128, 112〜128, 128〜144) */
	function eraseScrollThumb(canvas) {
		const W = canvas.width, H = canvas.height;
		if (W < 50 || H < 50) return null;
		const d = pixels(canvas);
		const x0s = Math.floor(W * 0.92);
		const on = [];
		for (let x = x0s; x < W; x++) {
			let n = 0, m = 0;
			for (let y = 0; y < H; y += 2) {
				const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
				m++;
				if (Math.abs(r - g) < 14 && Math.abs(g - b) < 22 && r >= 100 && r <= 232) n++;
			}
			on.push(n / m >= 0.88);
		}
		let run = null;
		for (let k = 0; k < on.length;) {
			if (!on[k]) { k++; continue; }
			let e = k;
			while (e < on.length && on[e]) e++;
			const len = e - k;
			if (len >= 6 && len <= W * 0.03 && x0s + e < W - 1) { run = [x0s + k, x0s + e]; break; }
			k = e;
		}
		if (!run) return null;
		const x0 = run[0], x1 = run[1];
		const ref = Math.min(W - 1, x1 + 1);
		const ctx = canvas.getContext('2d');
		const img = ctx.getImageData(0, 0, W, H);
		const p = img.data;
		for (let y = 0; y < H; y++) {
			const ri = (y * W + ref) * 4;
			for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; p[i] = p[ri]; p[i + 1] = p[ri + 1]; p[i + 2] = p[ri + 2]; p[i + 3] = 255; }
		}
		ctx.putImageData(img, 0, 0);
		return [x0, x1];
	}
	/** 行の間（左右とも明るい行）で、target にいちばん近い所。lo〜hi の中で探す。無ければ target */
	function findRowGap(canvas, target, lo, hi) {
		const W = canvas.width, H = canvas.height, d = pixels(canvas);
		const isGap = (y) => {
			if (y < 0 || y >= H) return false;
			for (let x = Math.floor(W * 0.06); x < W * 0.94; x += 7) { const i = (y * W + x) * 4; if (d[i] < 236 || d[i + 1] < 236 || d[i + 2] < 236) return false; }
			return true;
		};
		let best = -1, bd = Infinity;
		for (let y = Math.max(1, Math.floor(lo)); y < Math.min(H - 8, hi); y++) {
			if (isGap(y) && isGap(y + 6) && Math.abs(y + 3 - target) < bd) { bd = Math.abs(y + 3 - target); best = y + 3; }
		}
		return best > 0 ? best : Math.round(target);
	}

	/* スキルの数を行の色で数える（試し・788）。一覧（上の欄を除き、小窓の端で切ったもの）の2列のパネルを、行の間の明るい帯で区切って見つけ、
	 * パネルの左寄り（幅の 28〜45%）と右寄り（72〜92%）の色（文字の暗い画素を除く平均）で分ける:
	 *   金 … 右が橙〜黄（R 高・B 低）／ 固有 … 右がピンク・左が水色（虹の帯）／ 進化 … 左右ともピンク／ 白 … それ以外（藤色の地） */
	function classifyPanel(d, W, y0, y1, xa, xb) {
		const avg = (f0, f1) => {
			let r = 0, g = 0, b = 0, n = 0;
			for (let y = y0 + Math.floor((y1 - y0) * 0.3); y < y0 + (y1 - y0) * 0.7; y += 2) {
				for (let x = Math.floor(xa + (xb - xa) * f0); x < xa + (xb - xa) * f1; x += 3) {
					const i = (y * W + x) * 4;
					if (d[i] + d[i + 1] + d[i + 2] < 450) continue;   // 文字（暗い）を除く
					r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
				}
			}
			return n ? { r: r / n, g: g / n, b: b / n } : null;
		};
		const L = avg(0.28, 0.45), R = avg(0.72, 0.92);
		if (!L || !R) return 'white';
		if (R.r > 220 && R.b < 150 && R.r - R.b > 90) return 'gold';
		// 右がピンク: 左が水色寄り（B が R より高い）なら虹＝固有、左もピンク寄り（R が高い）なら進化。測った色（7枚）: 固有 L(199,225,237) R(236,192,247)・
		// 進化 L(244,212,221) R(255,173,220)・金 R(255,203,78)・白 L(226,221,229) R(201,199,224)
		const pinkR = R.r > 225 && R.b > 170 && R.r - R.g > 35;
		if (pinkR && L.b > L.r + 8) return 'unique';
		if (pinkR && L.r >= L.b) return 'evo';
		return 'white';
	}
	function countSkills(list) {
		const W = list.width, H = list.height, d = pixels(list);
		const halves = [[Math.floor(W * 0.03), Math.floor(W * 0.495)], [Math.floor(W * 0.505), Math.floor(W * 0.965)]];
		const out = { all: 0, unique: 0, evo: 0, gold: 0, white: 0, panels: [] };
		halves.forEach(([xa, xb], col) => {
			// その列の真ん中の縦の線で、パネルのある行（明るくない行）が 40px 以上続く所をパネルとする
			const xs = [xa + Math.floor((xb - xa) * 0.55), xa + Math.floor((xb - xa) * 0.8)];
			const dark = (y) => xs.some((x) => { const i = (y * W + x) * 4; return d[i] < 236 || d[i + 1] < 236 || d[i + 2] < 236; });
			let y = 0;
			while (y < H) {
				if (!dark(y)) { y++; continue; }
				let e = y;
				while (e < H && dark(e)) e++;
				if (e - y >= Math.max(40, W * 0.045)) {
					const kind = classifyPanel(d, W, y, e, xa, xb);
					out[kind]++; out.all++;
					out.panels.push({ col, y0: y, y1: e, kind });
				}
				y = e + 1;
			}
		});
		return out;
	}

	/** 情報の帯（画像の中に置く案）。幅 w */
	function infoBand(w, counts) {
		const h = Math.round(w * 0.075);
		const c = mk(w, h);
		const x = c.getContext('2d');
		x.fillStyle = '#F4F7EF';
		x.fillRect(0, 0, w, h);
		x.fillStyle = '#7ED321';
		x.fillRect(0, h - Math.max(2, Math.round(h * 0.05)), w, Math.max(2, Math.round(h * 0.05)));
		x.fillStyle = '#3B2A1A';
		x.textBaseline = 'middle';
		x.textAlign = 'center';
		let fs = Math.round(h * 0.42);
		const text = t('sr.count', counts);
		do { x.font = 'bold ' + fs + 'px sans-serif'; } while (x.measureText(text).width > w * 0.94 && --fs > 8);
		x.fillText(text, w / 2, h * 0.48);
		return c;
	}

	/**
	 * 結合の結果（stitchOnePerson の Canvas）と1枚目の画から、出す画像を組み立てる。
	 * o.cols 1|2・o.variant 'half'|'even'|'span'（2列のとき）・o.counts（情報の帯を描くとき countSkills の値。無ければ描かない）
	 * 返す Canvas に _sr（{ band, headH, listH, split, thumb, cols, variant }）を添える。o.parts を渡すと、上の欄・一覧（切ったもの）を作り直さずに使う
	 */
	function prepareParts(list, first) {
		const pl = (list._sourcePlacements || [])[0];
		let band = first ? modalBand(first) : null;
		if (band && first.width !== list.width) band = null;
		const L0 = band ? band.L : 0, R0 = band ? band.R : list.width, w = R0 - L0;
		const headH = (band && pl && pl.srcY0 > band.top) ? pl.srcY0 - band.top : 0;
		const head = headH ? mk(w, headH) : null;
		if (head) head.getContext('2d').drawImage(first, L0, band.top, w, headH, 0, 0, w, headH);
		const body = mk(w, list.height);
		body.getContext('2d').drawImage(list, L0, 0, w, list.height, 0, 0, w, list.height);
		const thumb = eraseScrollThumb(body);
		return { band, head, body, headH, thumb, w };
	}
	function compose(parts, o) {
		const { head, body, w } = parts;
		const headH = head ? head.height : 0, listH = body.height;
		const info = o.counts ? infoBand(w, o.counts) : null;
		const infoH = info ? info.height : 0;
		const G = Math.max(8, Math.round(w * 0.014));
		let out, split = null;
		if (o.cols !== 2) {
			out = mk(w, headH + infoH + listH);
			const x = out.getContext('2d');
			if (head) x.drawImage(head, 0, 0);
			if (info) x.drawImage(info, 0, headH);
			x.drawImage(body, 0, headH + infoH);
		} else if (o.variant === 'span') {
			split = findRowGap(body, listH / 2, listH * 0.3, listH * 0.7);
			const rightH = listH - split, colH = Math.max(split, rightH);
			const W2 = w * 2 + G;
			out = mk(W2, headH + infoH + colH);
			const x = out.getContext('2d');
			if (head) x.drawImage(head, Math.round((W2 - w) / 2), 0);
			if (info) x.drawImage(infoBand(W2, o.counts), 0, headH);
			x.drawImage(body, 0, 0, w, split, 0, headH + infoH, w, split);
			x.drawImage(body, 0, split, w, rightH, w + G, headH + infoH, w, rightH);
		} else {
			const target = o.variant === 'even' ? (listH - headH - infoH) / 2 : listH / 2;
			split = findRowGap(body, Math.max(listH * 0.15, target), listH * 0.1, listH * 0.9);
			const leftH = headH + infoH + split, rightH = listH - split;
			out = mk(w * 2 + G, Math.max(leftH, rightH));
			const x = out.getContext('2d');
			if (head) x.drawImage(head, 0, 0);
			if (info) x.drawImage(info, 0, headH);
			x.drawImage(body, 0, 0, w, split, 0, headH + infoH, w, split);
			x.drawImage(body, 0, split, w, rightH, w + G, 0, w, rightH);
		}
		out._sr = { band: parts.band, headH, listH, split, thumb: parts.thumb, cols: o.cols === 2 ? 2 : 1, variant: o.cols === 2 ? (o.variant || 'half') : null, info: !!info };
		return out;
	}

	/* ───────── 欄（UI） ───────── */
	const THUMB_W = 336;
	function makeThumbUrl(file) {
		const full = URL.createObjectURL(file);
		const img = new Image();
		return new Promise((resolve) => {
			img.onload = () => {
				const w = img.naturalWidth, h = img.naturalHeight;
				if (!w || !h || w <= THUMB_W) { resolve(full); return; }
				const c = document.createElement('canvas');
				c.width = THUMB_W;
				c.height = Math.max(1, Math.round(h * THUMB_W / w));
				const x = c.getContext('2d');
				x.imageSmoothingEnabled = true;
				x.imageSmoothingQuality = 'high';
				x.drawImage(img, 0, 0, c.width, c.height);
				c.toBlob((blob) => {
					c.width = c.height = 0;
					img.removeAttribute('src');
					if (!blob) { resolve(full); return; }
					URL.revokeObjectURL(full);
					resolve(URL.createObjectURL(blob));
				}, 'image/png');
			};
			img.onerror = () => resolve(full);
			img.src = full;
		});
	}
	async function fileCanvas(file) {
		const url = URL.createObjectURL(file);
		try {
			const img = new Image();
			img.src = url;
			await img.decode();
			const c = document.createElement('canvas');
			c.width = img.naturalWidth;
			c.height = img.naturalHeight;
			c.getContext('2d').drawImage(img, 0, 0);
			return c;
		} finally { URL.revokeObjectURL(url); }
	}

	const st = {
		host: null, root: null,
		files: [],
		thumbs: new Map(),    // File → { url, ready, dead }
		thumbQueue: Promise.resolve(),
		cols: 1, variant: 'half', info: 'none',
		built: null,          // { files, list, first, parts, counts, one } 作ったときの材料（形を変えたらここから組み直す）
		png: null,            // { url, blob, canvas }
		busy: false
	};
	function thumbOf(file) {
		let th = st.thumbs.get(file);
		if (!th) {
			th = { url: '', dead: false };
			th.ready = st.thumbQueue = st.thumbQueue.then(() => (th.dead ? '' : makeThumbUrl(file))).then((url) => {
				if (th.dead) { if (url) URL.revokeObjectURL(url); return ''; }
				th.url = url;
				return url;
			});
			st.thumbs.set(file, th);
		}
		return th;
	}
	function releaseThumbs() {
		const live = new Set(st.files);
		for (const [file, th] of st.thumbs) {
			if (live.has(file)) continue;
			st.thumbs.delete(file);
			th.dead = true;
			if (th.url) URL.revokeObjectURL(th.url);
		}
	}
	function setPng(next) {
		if (st.png && (!next || st.png.url !== next.url)) URL.revokeObjectURL(st.png.url);
		st.png = next;
	}
	function sameFiles(a, b) { return a.length === b.length && a.every((f, i) => f === b[i]); }

	function seg(name, items, cur) {
		return '<div class="sr-seg" role="group" data-sr-seg="' + name + '" style="--sr-n:' + items.length + '">' + items.map(([v, label]) =>
			'<button type="button" class="sr-seg-btn" data-sr-' + name + '="' + v + '" aria-pressed="' + String(String(cur) === String(v)) + '">' + esc(label) + '</button>').join('') + '</div>';
	}
	function render() {
		const r = st.root;
		if (!r) return;
		const n = st.files.length;
		const stale = !!(st.built && !sameFiles(st.built.files, st.files));
		const one = n === 1;
		r.innerHTML =
			'<div class="sr-panel" data-sr-panel>' +
				'<p class="sr-lead">' + esc(t('sr.lead')) + '</p>' +
				'<div class="sr-pick-row">' +
					'<label class="uma-btn uma-btn--secondary sr-pick"><input type="file" accept="image/*" multiple hidden data-sr-input /><span>' + esc(t('sr.btn.pick')) + '</span></label>' +
					(n ? '<button type="button" class="sr-clear" data-sr-act="clear">' + esc(t('sr.btn.clear')) + '</button>' : '') +
				'</div>' +
				(n ? '<div class="sr-thumbs" data-sr-thumbs>' + st.files.map((f, i) => {
					const th = thumbOf(f);
					return '<div class="sr-thumb"><img ' + (th.url ? 'src="' + th.url + '"' : 'data-sr-thumb="' + i + '"') + ' alt="" /><span class="sr-thumb-no">' + (i + 1) + '</span>' +
						'<button type="button" class="sr-thumb-x" data-sr-remove="' + i + '" aria-label="' + (i + 1) + '枚目を外す">×</button></div>';
				}).join('') + '</div>' : '') +
				'<div class="sr-form">' +
					'<p class="sr-form-label">' + esc(t('sr.form')) + '</p>' + seg('cols', [[1, '1列'], [2, '2列']], one ? 1 : st.cols) +
					(st.cols === 2 && !one ? '<p class="sr-form-label">' + esc(t('sr.form2')) + '</p>' + seg('variant', [['half', t('sr.v.half')], ['even', t('sr.v.even')], ['span', t('sr.v.span')]], st.variant) : '') +
					'<p class="sr-form-label">' + esc(t('sr.info')) + '</p>' + seg('info', [['none', t('sr.info.none')], ['panel', t('sr.info.panel')], ['image', t('sr.info.image')], ['both', t('sr.info.both')]], st.info) +
				'</div>' +
				'<button type="button" class="uma-btn uma-btn--primary w-full sr-build" data-sr-act="build"' + (n && !st.busy && (!st.built || stale) ? '' : ' disabled') + '><span>' + esc(st.busy ? t('sr.btn.busy') : t('sr.btn.build')) + '</span></button>' +
				(one ? '<p class="sr-note">' + esc(t('sr.one')) + '</p>' : '') +
				(stale ? '<p class="sr-note" data-sr-stale>' + esc(t('sr.stale')) + '</p>' : '') +
				'<div class="sr-result" data-sr-result></div>' +
			'</div>';
		if (one) r.querySelectorAll('[data-sr-cols]').forEach((b) => { b.disabled = b.getAttribute('data-sr-cols') === '2'; });
		r.querySelectorAll('img[data-sr-thumb]').forEach((img) => {
			const f = st.files[Number(img.getAttribute('data-sr-thumb'))];
			if (f) thumbOf(f).ready.then((url) => { if (url && img.isConnected) { img.src = url; img.removeAttribute('data-sr-thumb'); } });
		});
		renderResult();
	}
	function renderResult() {
		const box = st.root && st.root.querySelector('[data-sr-result]');
		if (!box) return;
		box.textContent = '';
		const b = st.built;
		if (!b || !st.png || !sameFiles(b.files, st.files)) return;
		const block = document.createElement('div');
		block.className = 'sr-result-block';
		if (b.warnings && b.warnings.length) {
			const w = document.createElement('div');
			w.className = 'sr-warn';
			w.setAttribute('role', 'status');
			w.innerHTML = '<p class="sr-warn-head">⚠ ' + esc(t('sr.warn')) + '</p>' + b.warnings.map((s) => '<p>' + esc(s) + '</p>').join('');
			block.appendChild(w);
		}
		const head = document.createElement('div');
		head.className = 'sr-result-head';
		head.innerHTML = '<p class="sr-result-title">' + esc(t('sr.title')) + '</p>';
		const a = document.createElement('a');
		a.href = st.png.url;
		a.className = 'uma-btn uma-btn--primary sr-dl';
		a.textContent = t('sr.dl');
		a.setAttribute('data-sr-dl', '');
		if (st.host.attachSaveName) st.host.attachSaveName(a);
		const png = st.png;
		if (window.UmaStitchShare) UmaStitchShare.attach(a, () => png.blob);
		head.appendChild(a);
		block.appendChild(head);
		if (b.counts && (st.info === 'panel' || st.info === 'both')) {
			const c = document.createElement('p');
			c.className = 'sr-count';
			c.setAttribute('data-sr-count', '');
			c.innerHTML = '<b>' + esc(t('sr.count', b.counts)) + '</b><small>' + esc(t('sr.count.note')) + '</small>';
			block.appendChild(c);
		}
		const img = document.createElement('img');
		img.className = 'sr-img';
		img.alt = '';
		img.src = st.png.url;
		block.appendChild(img);
		box.appendChild(block);
	}
	function toPng(canvas) {
		return new Promise((resolve) => {
			try { canvas.toBlob(resolve, 'image/png'); } catch (e) { resolve(null); }
		}).then((blob) => {
			if (!blob) return { url: canvas.toDataURL('image/png'), blob: null, canvas };
			return { url: URL.createObjectURL(blob), blob, canvas };
		});
	}
	// 作った材料から、今の形で画像を組み直す（形・情報の表示を変えたとき。結合はやり直さない）
	async function recompose() {
		const b = st.built;
		if (!b) return;
		let canvas;
		if (b.one) canvas = b.first;
		else canvas = compose(b.parts, { cols: st.cols, variant: st.variant, counts: (st.info === 'image' || st.info === 'both') ? b.counts : null });
		const png = await toPng(canvas);
		if (st.built !== b) { if (png.blob) URL.revokeObjectURL(png.url); return; }
		setPng(png);
		if (canvas !== b.first && b.last && b.last !== canvas) { b.last.width = b.last.height = 0; }
		b.last = canvas === b.first ? null : canvas;
		render();
	}
	async function build() {
		if (st.busy || !st.files.length) return;
		const files = st.files.slice();
		st.busy = true;
		render();
		try {
			const first = await fileCanvas(files[0]);
			let built;
			if (files.length === 1) {
				built = { files, one: true, first, counts: null, warnings: [] };
			} else {
				const list = await st.host.stitchOnePerson(files, t('sr.title'));
				const parts = prepareParts(list, first);
				const counts = countSkills(parts.body);
				built = { files, one: false, first: null, parts, counts, warnings: (list._stitchWarnings || []).slice() };
				list.width = list.height = 0;
				first.width = first.height = 0;
			}
			if (st.built && st.built.last) st.built.last.width = st.built.last.height = 0;
			st.built = built;
			st.busy = false;
			await recompose();
			if (st.host.toast) st.host.toast(t('sr.done'));
		} catch (e) {
			st.busy = false;
			render();
			const box = st.root.querySelector('[data-sr-result]');
			if (box) box.innerHTML = '<div class="sr-fail" role="alert">' + esc(t('sr.fail', { msg: (e && e.message) || String(e) })) + '</div>';
		}
	}
	function changed() {
		releaseThumbs();
		if (st.built && !sameFiles(st.built.files, st.files)) setPng(null);
		render();
		if (st.host.onChange) st.host.onChange(st.files.length);
	}
	function addFiles(list) {
		const add = Array.from(list || []).filter((f) => /^image\//.test(f.type || 'image/') && !st.files.some((u) => u.name === f.name && u.size === f.size));
		if (!add.length) return;
		st.files = st.files.concat(add);
		changed();
	}
	function onClick(e) {
		const el = e.target.closest && e.target.closest('[data-sr-act],[data-sr-remove],[data-sr-cols],[data-sr-variant],[data-sr-info]');
		if (!el || !st.root.contains(el) || el.disabled) return;
		if (el.hasAttribute('data-sr-remove')) { st.files.splice(Number(el.getAttribute('data-sr-remove')), 1); changed(); return; }
		const act = el.getAttribute('data-sr-act');
		if (act === 'clear') { st.files = []; setPng(null); st.built = null; changed(); return; }
		if (act === 'build') { build(); return; }
		if (el.hasAttribute('data-sr-cols')) st.cols = Number(el.getAttribute('data-sr-cols')) === 2 ? 2 : 1;
		else if (el.hasAttribute('data-sr-variant')) st.variant = el.getAttribute('data-sr-variant');
		else if (el.hasAttribute('data-sr-info')) st.info = el.getAttribute('data-sr-info');
		if (st.built && sameFiles(st.built.files, st.files)) recompose(); else render();
	}
	// 見た目（2つのページで同じ。ページの CSS の変数〔css/tokens.css〕を使う。ダークでも変数が切り替わる）
	const SR_CSS = [
		'.sr-panel{border:1px solid var(--uma-border);background:var(--uma-surface);border-radius:var(--uma-r-xl);padding:16px;display:flex;flex-direction:column;gap:10px}',
		'.sr-lead{font-size:12px;line-height:1.6;color:var(--uma-text-muted);margin:0}',
		'.sr-pick-row{display:flex;align-items:center;gap:12px}',
		'.sr-pick{cursor:pointer}',
		'.sr-clear{font-size:11px;color:var(--uma-text-subtle);text-decoration:underline;text-underline-offset:2px;background:none;border:0;cursor:pointer;padding:8px 4px}',
		'.sr-thumbs{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}',
		'.sr-thumb{position:relative;flex:0 0 auto;width:60px;height:104px;border:1px solid var(--uma-border);border-radius:8px;overflow:hidden;background:var(--uma-surface-muted)}',
		'.sr-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
		'.sr-thumb-no{position:absolute;left:3px;bottom:3px;min-width:18px;height:18px;border-radius:9px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px}',
		'.sr-thumb-x{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:11px;border:0;background:rgba(0,0,0,.6);color:#fff;font-size:13px;line-height:1;cursor:pointer}',
		'.sr-form{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:6px 10px}',
		'.sr-form-label{margin:0;font-size:11px;font-weight:700;color:var(--uma-text-heading)}',
		'.sr-seg{display:grid;grid-template-columns:repeat(var(--sr-n),1fr);border:1px solid var(--uma-border-strong);border-radius:var(--uma-r-lg);overflow:hidden}',
		'.sr-seg-btn{min-height:36px;border:0;background:var(--uma-surface);color:var(--uma-text-heading);font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:2px 4px;line-height:1.3}',
		'.sr-seg-btn+.sr-seg-btn{border-left:1px solid var(--uma-border-strong)}',
		'.sr-seg-btn[aria-pressed="true"]{background:var(--uma-surface-inverse);color:var(--uma-text-inverse)}',
		'.sr-seg-btn:disabled{opacity:.4;cursor:default}',
		'.sr-seg-btn:focus-visible{outline:2px solid var(--uma-focus-ring);outline-offset:-2px}',
		'.sr-note{margin:0;font-size:11px;color:var(--uma-text-muted);text-align:center}',
		'.sr-result-block{display:flex;flex-direction:column;gap:8px;margin-top:4px}',
		'.sr-result-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
		'.sr-result-title{margin:0;font-size:12px;font-weight:700;color:var(--uma-text-heading)}',
		'.sr-img{width:100%;border:1px solid var(--uma-border);border-radius:8px;display:block}',
		'.sr-warn{border:1px solid var(--uma-warn-border);background:var(--uma-warn-bg);color:var(--uma-warn-text);border-radius:8px;padding:10px 12px;font-size:11px;line-height:1.6}',
		'.sr-warn p{margin:0}.sr-warn-head{font-weight:700;margin-bottom:2px!important}',
		'.sr-fail{border:1px solid var(--uma-danger-border);background:var(--uma-danger-bg);color:var(--uma-danger-text);border-radius:8px;padding:10px 12px;font-size:12px}',
		'.sr-count{margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;font-size:13px;color:var(--uma-text-heading);background:var(--uma-surface-muted);border-radius:8px;padding:8px 10px}',
		'.sr-count small{font-size:11px;color:var(--uma-text-muted)}',
		'@media (max-width:480px){.sr-form{grid-template-columns:1fr}}'
	].join('\n');
	function injectStyle() {
		if (document.getElementById('sr-style')) return;
		const s = document.createElement('style');
		s.id = 'sr-style';
		s.textContent = SR_CSS;
		document.head.appendChild(s);
	}
	/** host = { stitchOnePerson(files, label), attachSaveName(link), toast(text), onChange(n) } */
	function mount(root, host) {
		injectStyle();
		st.root = root;
		st.host = host || {};
		root.addEventListener('click', onClick);
		root.addEventListener('change', (e) => {
			if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-sr-input')) { addFiles(e.target.files); e.target.value = ''; }
		});
		render();
	}

	window.UmaSkillResult = Object.freeze({
		version: SKILL_RESULT_JS_VERSION, texts: SR_TEXTS,
		mount, prepareParts, compose, countSkills, modalBand, eraseScrollThumb, findRowGap,
		count: () => st.files.length,
		files: () => st.files.slice(),
		// 検査用: 今の状態（URL・形・作ったか）
		peek: () => ({ files: st.files.length, cols: st.cols, variant: st.variant, info: st.info, built: !!st.built, url: st.png ? st.png.url : null,
			thumbs: Array.from(st.thumbs.values()).map((x) => x.url), counts: st.built ? st.built.counts : null, sr: st.built && st.built.last ? st.built.last._sr : null }),
		addFiles, build
	});
})();
