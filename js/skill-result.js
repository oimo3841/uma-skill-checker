/* 本育成結果（T188・決定 775・783〜788）。本育成のスキル画面のスクショを1枚の画像にまとめる（OCR はしない）。special.html・exam.html の③／②の
 * 「本育成結果」のタブの中身。親A〜祖B2 の枠（persons）には入れず、この部品の中だけに持つ（OCR・照合結果・Deck へ送るぶん・タブの枚数・未読の印に混ざらない）。
 *
 * - 結合は凍結の js/stitch.js の stitchOnePerson をそのまま呼ぶ（呼び出し側が host.stitchOnePerson で渡す）。
 *   上の欄（タイトル「ウマ娘詳細」〜タブ）は結合では捨てられるので、ここで1枚目から足す（形2・T187）。左右は小窓の端で切る（ゲームの背景を落とす）。
 *   右のスクロールのつまみ（切れ切れに写る）は、つまみの列を右隣の地の色で塗る。
 * - タブの中に本育成結果用の「結合画像の設定」（T189・決定 804）: 「1列｜2列」と「スキルの数」（入れる／入れない）。今後足す情報もこの欄に加える。
 *   形（T189・決定 794・803）: 1列 … 上の欄の下に一覧（数を入れるときは上の欄の下に帯）。
 *   2列・数なし … 案2（高さをそろえる: 左に上の欄＋一覧の前半、右に後半。左右の高さがそろう所で分ける）。
 *   2列・数あり … 案4（左の列の上に上の欄、右の列の上に上の欄と同じ高さの「情報の箱」〔スキルの数〕。その下に左右とも一覧を半分ずつ）。
 *   既定は 1列・数を入れない。設定は覚えない（開き直すと既定）。タイトルのバーは付けない（786）。
 * - つなぎ目の「一致度が低い」は、本育成結果用の文で出す（787）。
 * - スキルの数（全部・固有・進化・金・白）は、OCR を使わず行の色で数える（788・795・797）。数は保存する画像の中だけに入れる（796。画面の欄には出さない）。
 *   添え書き「色で数えた目安です」は画像に入れず、設定の欄の「スキルの数」の横に出す。
 * - メモリは T133・T186 と同じ作り: サムネイルは幅 336px の縮小画像・結合画像は Blob の object URL・使わなくなった URL は手放す。
 * 文の案はすべて SR_TEXTS（キーは報告の文の案の一覧と同じ）。
 */
(function () {
	'use strict';
	const SKILL_RESULT_JS_VERSION = '2026-11-17a';

	const SR_TEXTS = {
		'sr.lead': '本育成のスキル画面のスクショを、上から順に選んでください。1枚の画像にまとめます（OCR はしません）。',
		'sr.btn.pick': '画像を選ぶ',
		'sr.btn.clear': 'クリア',
		'sr.btn.build': '1枚にまとめる',
		'sr.btn.busy': 'まとめています…',
		'sr.settings': '結合画像の設定',
		'sr.form': '形',
		'sr.cols1': '1列',
		'sr.cols2': '2列',
		'sr.opt.count': 'スキルの数',
		'sr.box.title': 'スキルの数',
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

	// 情報の箱・帯の色（スキルの種類の見本の四角。ゲームのパネルの色に近いもの）
	const KIND_SWATCH = {
		unique: ['#7FD8F5', '#F7A8F2'], evo: ['#FFC4E6', '#FF8FD0'], gold: ['#FFE27A', '#FFB01F'], white: ['#E4E2F2', '#C6C3E3']
	};
	const INK = '#3B2A1A';
	function swatch(x, sx, sy, s, kind) {
		const c = KIND_SWATCH[kind];
		const g = x.createLinearGradient(sx, 0, sx + s, 0);
		g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
		const r = Math.max(2, s * 0.22);
		x.beginPath();
		x.moveTo(sx + r, sy); x.arcTo(sx + s, sy, sx + s, sy + s, r); x.arcTo(sx + s, sy + s, sx, sy + s, r); x.arcTo(sx, sy + s, sx, sy, r); x.arcTo(sx, sy, sx + s, sy, r); x.closePath();
		x.fillStyle = g; x.fill();
		x.lineWidth = Math.max(1, s * 0.06); x.strokeStyle = 'rgba(80,60,120,.35)'; x.stroke();
	}
	/** 上の欄の緑の帯（「ウマ娘詳細」）の高さと色。右寄り（幅の 90%）の列を上から見て、緑の続く行。無ければ null */
	function headBand(head) {
		if (!head) return null;
		const W = head.width, H = Math.min(head.height, Math.round(head.height * 0.3));
		const d = head.getContext('2d', { willReadFrequently: true }).getImageData(Math.floor(W * 0.9), 0, 1, H).data;
		const green = (i) => d[i + 1] > 150 && d[i + 1] > d[i] + 30 && d[i + 1] > d[i + 2] + 60;
		let y = 0;
		while (y < H && green(y * 4)) y++;
		if (y < 8) return null;
		const m = Math.floor(y / 2) * 4;
		return { h: y, color: 'rgb(' + d[m] + ',' + d[m + 1] + ',' + d[m + 2] + ')' };
	}
	/**
	 * 情報の箱（2列・数ありの案4。右の列の上・上の欄と同じ高さ）。幅 w・高さ h。
	 * 上に上の欄と同じ高さ・色の緑の帯（見出し「スキルの数」）、その下の白いカードに「スキル 69」と「（固有 1・進化 1・金 7・白 60）」（決定 797 の文の形を2行に分けたもの）。
	 * 今後この欄に情報を足すときは、カードの行を足す。
	 */
	function infoBox(w, h, counts, head) {
		const c = mk(w, h);
		const x = c.getContext('2d');
		x.fillStyle = 'rgb(242,242,242)';
		x.fillRect(0, 0, w, h);
		const hb = headBand(head);
		const bandH = hb ? hb.h : Math.round(w * 0.065);
		x.fillStyle = hb ? hb.color : 'rgb(140,203,30)';
		x.fillRect(0, 0, w, bandH);
		x.textBaseline = 'middle';
		x.textAlign = 'center';
		const tf = Math.round(bandH * 0.56);
		x.font = 'bold ' + tf + 'px sans-serif';
		x.lineJoin = 'round';
		x.lineWidth = Math.max(2, tf * 0.16);
		x.strokeStyle = 'rgba(40,110,10,.85)';
		x.strokeText(t('sr.box.title'), w / 2, bandH * 0.52);
		x.fillStyle = '#ffffff';
		x.fillText(t('sr.box.title'), w / 2, bandH * 0.52);
		// カード
		const m = Math.round(w * 0.035);
		const cx = m, cy = bandH + m, cw = w - m * 2, ch = h - bandH - m * 2;
		if (ch < 20) return c;
		const r = Math.round(w * 0.02);
		x.beginPath();
		x.moveTo(cx + r, cy); x.arcTo(cx + cw, cy, cx + cw, cy + ch, r); x.arcTo(cx + cw, cy + ch, cx, cy + ch, r); x.arcTo(cx, cy + ch, cx, cy, r); x.arcTo(cx, cy, cx + cw, cy, r); x.closePath();
		x.fillStyle = '#ffffff'; x.fill();
		x.lineWidth = Math.max(2, Math.round(w * 0.003)); x.strokeStyle = 'rgb(214,212,228)'; x.stroke();
		// 1行目「スキル 69」: 見出しの語と大きな数
		let f1 = Math.round(Math.min(ch * 0.16, w * 0.09));
		const word = 'スキル', num = String(counts.all);
		let f1n, w1, w2;
		for (;;) {
			f1n = Math.round(f1 * 1.9);
			x.font = 'bold ' + f1 + 'px sans-serif'; w1 = x.measureText(word + ' ').width;
			x.font = 'bold ' + f1n + 'px sans-serif'; w2 = x.measureText(num).width;
			if (w1 + w2 <= cw * 0.9 || f1 <= 10) break;
			f1--;
		}
		// 2行目「（固有 1・進化 1・金 7・白 60）」: 名前の前に種類の色の四角
		const items = [['unique', '固有', counts.unique], ['evo', '進化', counts.evo], ['gold', '金', counts.gold], ['white', '白', counts.white]];
		let f2 = Math.round(f1 * 0.78);
		let line2W;
		const measure2 = () => {
			x.font = 'bold ' + f2 + 'px sans-serif';
			const sw = f2 * 0.9, sp = f2 * 0.25;
			let tw = x.measureText('（').width + x.measureText('）').width;
			items.forEach(([, name, n], i) => { tw += sw + sp + x.measureText(name + ' ' + n).width + (i < items.length - 1 ? x.measureText('・').width : 0); });
			return tw;
		};
		while ((line2W = measure2()) > cw * 0.92 && f2 > 9) f2--;
		const blockH = f1n * 1.05 + f2 * 0.9 + f2 * 1.2;
		const top = cy + Math.max(0, (ch - blockH) / 2);
		// 1行目
		const y1 = top + f1n * 0.55;
		let sx = cx + (cw - (w1 + w2)) / 2;
		x.textAlign = 'left';
		x.textBaseline = 'alphabetic';
		x.fillStyle = INK;
		x.font = 'bold ' + f1 + 'px sans-serif';
		x.fillText(word + ' ', sx, y1 + f1n * 0.36);
		x.font = 'bold ' + f1n + 'px sans-serif';
		x.fillText(num, sx + w1, y1 + f1n * 0.36);
		// 2行目
		const y2 = top + f1n * 1.05 + f2 * 0.9 + f2 * 0.6;
		x.font = 'bold ' + f2 + 'px sans-serif';
		x.textBaseline = 'middle';
		sx = cx + (cw - line2W) / 2;
		const put = (s) => { x.fillStyle = INK; x.fillText(s, sx, y2); sx += x.measureText(s).width; };
		put('（');
		items.forEach(([kind, name, n], i) => {
			const sw = f2 * 0.9;
			swatch(x, sx, y2 - sw / 2, sw, kind);
			sx += sw + f2 * 0.25;
			put(name + ' ' + n);
			if (i < items.length - 1) put('・');
		});
		put('）');
		return c;
	}

	/** 情報の帯（1列で数を入れるとき・803。上の欄の下に置く）。幅 w */
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
	 * o.cols 1|2・o.counts（スキルの数を入れるとき countSkills の値。無ければ入れない）
	 *   1列: 上の欄＋（数があれば帯）＋一覧。2列: 数なしは案2（variant 'even'）・数ありは案4（variant 'side'）
	 * 返す Canvas に _sr（{ band, headH, listH, split, thumb, cols, variant, info, topH }）を添える
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
		const counts = o.counts || null;
		const G = Math.max(8, Math.round(w * 0.014));
		let out, split = null, variant = null, topH = headH;
		if (o.cols !== 2) {
			// 1列（803）: 数を入れるときは上の欄の下に帯
			const info = counts ? infoBand(w, counts) : null;
			const infoH = info ? info.height : 0;
			out = mk(w, headH + infoH + listH);
			const x = out.getContext('2d');
			if (head) x.drawImage(head, 0, 0);
			if (info) x.drawImage(info, 0, headH);
			x.drawImage(body, 0, headH + infoH);
			topH = headH + infoH;
		} else if (counts) {
			// 案4（794）: 左の上に上の欄・右の上に同じ高さの情報の箱。その下に一覧を半分ずつ（左右の下端がそろう所＝一覧の真ん中に近い行の間で分ける）
			variant = 'side';
			topH = headH || Math.round(w * 0.3);
			split = findRowGap(body, listH / 2, listH * 0.3, listH * 0.7);
			const rightH = listH - split;
			out = mk(w * 2 + G, topH + Math.max(split, rightH));
			const x = out.getContext('2d');
			if (head) x.drawImage(head, 0, 0);
			x.drawImage(infoBox(w, topH, counts, head), w + G, 0);
			x.drawImage(body, 0, 0, w, split, 0, topH, w, split);
			x.drawImage(body, 0, split, w, rightH, w + G, topH, w, rightH);
		} else {
			// 案2（794）: 左に上の欄＋一覧の前半、右に後半。左右の高さがそろう所で分ける
			variant = 'even';
			split = findRowGap(body, Math.max(listH * 0.15, (listH - headH) / 2), listH * 0.1, listH * 0.9);
			const leftH = headH + split, rightH = listH - split;
			out = mk(w * 2 + G, Math.max(leftH, rightH));
			const x = out.getContext('2d');
			if (head) x.drawImage(head, 0, 0);
			x.drawImage(body, 0, 0, w, split, 0, headH, w, split);
			x.drawImage(body, 0, split, w, rightH, w + G, 0, w, rightH);
		}
		out._sr = { band: parts.band, headH, listH, split, thumb: parts.thumb, cols: o.cols === 2 ? 2 : 1, variant, info: !!counts, topH };
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
		cols: 1, withCount: false,   // 結合画像の設定（804）。既定は 1列・スキルの数を入れない。覚えない
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

	/** 本育成結果用の「結合画像の設定」（804）。見た目は因子の結合画像の「結合画像の設定」（.stitch-show・.stitch-cols・.stitch-show-item）にそろえる。
	 *  1枚だけのときは画像をそのまま出すので、2列と数は押せない */
	function settingsHtml(one) {
		const colsBtn = (n, bars) => '<button type="button" class="sr-cols-btn" data-sr-cols="' + n + '" aria-pressed="' + String((one ? 1 : st.cols) === n) + '"' + (one && n === 2 ? ' disabled' : '') + '>' +
			'<i aria-hidden="true">' + bars + '</i><span>' + esc(t('sr.cols' + n)) + '</span></button>';
		return '<div class="sr-show" data-sr-settings>' +
			'<p class="sr-show-title"><i data-lucide="sliders-horizontal"></i><span>' + esc(t('sr.settings')) + '</span></p>' +
			'<div class="sr-cols" role="group" aria-label="' + esc(t('sr.form')) + '">' + colsBtn(1, '<b class="is-wide"></b>') + colsBtn(2, '<b></b><b></b>') + '</div>' +
			'<div class="sr-show-list">' +
				'<label class="sr-show-item' + (one ? ' is-off' : '') + '"><input type="checkbox" class="sr-show-check" data-sr-opt="count"' + (st.withCount && !one ? ' checked' : '') + (one ? ' disabled' : '') + ' />' +
					'<span>' + esc(t('sr.opt.count')) + '<span class="sr-show-sub">' + esc(t('sr.count.note')) + '</span></span></label>' +
			'</div>' +
		'</div>';
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
				settingsHtml(one) +
				'<button type="button" class="uma-btn uma-btn--primary w-full sr-build" data-sr-act="build"' + (n && !st.busy && (!st.built || stale) ? '' : ' disabled') + '><span>' + esc(st.busy ? t('sr.btn.busy') : t('sr.btn.build')) + '</span></button>' +
				(one ? '<p class="sr-note">' + esc(t('sr.one')) + '</p>' : '') +
				(stale ? '<p class="sr-note" data-sr-stale>' + esc(t('sr.stale')) + '</p>' : '') +
				'<div class="sr-result" data-sr-result></div>' +
			'</div>';
		if (window.lucide && r.querySelector('[data-lucide]')) { try { window.lucide.createIcons(); } catch (e) { /* アイコンが無くても動く */ } }
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
		// 設定を続けて変えたとき、前の組み直しが後から終わって古い形を出さないように、いちばん新しい頼みだけを使う
		const gen = st.gen = (st.gen || 0) + 1;
		let canvas;
		if (b.one) canvas = b.first;
		else canvas = compose(b.parts, { cols: st.cols, counts: st.withCount ? b.counts : null });
		const png = await toPng(canvas);
		if (st.built !== b || gen !== st.gen) {
			if (png.blob) URL.revokeObjectURL(png.url);
			if (canvas !== b.first) canvas.width = canvas.height = 0;
			return;
		}
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
		const el = e.target.closest && e.target.closest('[data-sr-act],[data-sr-remove],[data-sr-cols]');
		if (!el || !st.root.contains(el) || el.disabled) return;
		if (el.hasAttribute('data-sr-remove')) { st.files.splice(Number(el.getAttribute('data-sr-remove')), 1); changed(); return; }
		const act = el.getAttribute('data-sr-act');
		if (act === 'clear') { st.files = []; setPng(null); st.built = null; changed(); return; }
		if (act === 'build') { build(); return; }
		if (el.hasAttribute('data-sr-cols')) st.cols = Number(el.getAttribute('data-sr-cols')) === 2 ? 2 : 1;
		settingChanged();
	}
	// 設定を変えたら、作った材料から組み直す（結合はやり直さない）
	function settingChanged() {
		render();   // 押した形・チェックをすぐ映す（画像は組み直しが終わったら替わる）
		if (st.built && sameFiles(st.built.files, st.files)) recompose();
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
		// 本育成結果用の「結合画像の設定」（804）。値は special.html・exam.html の .stitch-show・.stitch-cols・.stitch-show-item と同じ
		'.sr-show{padding:var(--uma-sp-3);border:1px solid var(--uma-border);border-radius:var(--uma-r-xl);background:var(--uma-surface-muted);text-align:left}',
		'.sr-show-title{margin:0 0 var(--uma-sp-1-5);font-size:var(--uma-fs-xs);line-height:var(--uma-lh-xs);font-weight:700;color:var(--uma-text-heading);display:flex;align-items:center;gap:var(--uma-sp-1-5)}',
		'.sr-show-title svg{width:14px;height:14px;color:var(--uma-stitch-accent)}',
		'.sr-cols{display:grid;grid-template-columns:1fr 1fr;margin:0 0 var(--uma-sp-1-5);border:1px solid var(--uma-border-strong);border-radius:var(--uma-r-lg);overflow:hidden}',
		'.sr-cols-btn{min-height:40px;border:0;background:var(--uma-surface);color:var(--uma-text-heading);font:inherit;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}',
		'.sr-cols-btn+.sr-cols-btn{border-left:1px solid var(--uma-border-strong)}',
		'.sr-cols-btn:focus-visible{outline:2px solid var(--uma-focus-ring);outline-offset:-2px}',
		'.sr-cols-btn[aria-pressed="true"]{background:var(--uma-surface-inverse);color:var(--uma-text-inverse)}',
		'.sr-cols-btn:disabled{opacity:.4;cursor:default}',
		'.sr-cols-btn i{display:inline-flex;gap:2px}',
		'.sr-cols-btn i b{display:block;width:5px;height:12px;border-radius:1px;background:currentColor}',
		'.sr-cols-btn i b.is-wide{width:12px}',
		'.sr-show-list{display:flex;flex-direction:column;gap:var(--uma-sp-0-5)}',
		'.sr-show-item{display:flex;align-items:flex-start;gap:var(--uma-sp-2);padding:var(--uma-sp-1) var(--uma-sp-1-5);border-radius:var(--uma-r-md);font-size:var(--uma-fs-xs);line-height:var(--uma-lh-xs);font-weight:600;color:var(--uma-text-heading);cursor:pointer;transition:background-color var(--uma-transition)}',
		'.sr-show-item:hover{background:var(--uma-surface)}',
		'.sr-show-item.is-off{opacity:.45;cursor:not-allowed}',
		'.sr-show-check{flex-shrink:0;width:1rem;height:1rem;margin-top:1px;accent-color:var(--uma-control-mark);cursor:pointer}',
		'.sr-show-item.is-off .sr-show-check{cursor:not-allowed}',
		'.sr-show-sub{margin-left:var(--uma-sp-2);font-weight:400;color:var(--uma-text-subtle)}',
		'.sr-note{margin:0;font-size:11px;color:var(--uma-text-muted);text-align:center}',
		'.sr-result-block{display:flex;flex-direction:column;gap:8px;margin-top:4px}',
		'.sr-result-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
		'.sr-result-title{margin:0;font-size:12px;font-weight:700;color:var(--uma-text-heading)}',
		'.sr-img{width:100%;border:1px solid var(--uma-border);border-radius:8px;display:block}',
		'.sr-warn{border:1px solid var(--uma-warn-border);background:var(--uma-warn-bg);color:var(--uma-warn-text);border-radius:8px;padding:10px 12px;font-size:11px;line-height:1.6}',
		'.sr-warn p{margin:0}.sr-warn-head{font-weight:700;margin-bottom:2px!important}',
		'.sr-fail{border:1px solid var(--uma-danger-border);background:var(--uma-danger-bg);color:var(--uma-danger-text);border-radius:8px;padding:10px 12px;font-size:12px}',
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
			if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-sr-input')) { addFiles(e.target.files); e.target.value = ''; return; }
			if (e.target && e.target.getAttribute && e.target.getAttribute('data-sr-opt') === 'count') { st.withCount = !!e.target.checked; settingChanged(); }
		});
		render();
	}

	window.UmaSkillResult = Object.freeze({
		version: SKILL_RESULT_JS_VERSION, texts: SR_TEXTS,
		mount, prepareParts, compose, countSkills, modalBand, eraseScrollThumb, findRowGap, infoBox, infoBand,
		count: () => st.files.length,
		files: () => st.files.slice(),
		// 検査用: 今の状態（URL・形・作ったか）
		peek: () => ({ files: st.files.length, cols: st.cols, withCount: st.withCount, built: !!st.built, url: st.png ? st.png.url : null,
			thumbs: Array.from(st.thumbs.values()).map((x) => x.url), counts: st.built ? st.built.counts : null, sr: st.built && st.built.last ? st.built.last._sr : null }),
		addFiles, build
	});
})();
