/* 本育成結果（T188・決定 775・783〜788）。本育成のスキル画面のスクショを1枚の画像にまとめる（OCR はしない）。special.html・exam.html の③／②の
 * 「本育成結果」のタブの中身。親A〜祖B2 の枠（persons）には入れず、この部品の中だけに持つ（OCR・照合結果・Deck へ送るぶん・タブの枚数・未読の印に混ざらない）。
 *
 * - 結合は凍結の js/stitch.js の stitchOnePerson をそのまま呼ぶ（呼び出し側が host.stitchOnePerson で渡す）。
 *   上の欄（タイトル「ウマ娘詳細」〜タブ）は結合では捨てられるので、ここで1枚目から足す（形2・T187）。左右は小窓の端で切る（ゲームの背景を落とす）。
 *   右のスクロールのつまみ（切れ切れに写る）は、つまみの列を右隣の地の色で塗る。
 * - タブの中に本育成結果用の「結合画像の設定」（T189・決定 804）: 「1列｜2列」と「スキルの数」（入れる／入れない）。今後足す情報もこの欄に加える。
 *   形（T191・決定 806・816〜818）: 「スキル・継承・育成情報」の行はどの形でも入れない。
 *   1列 … 上の欄（帯〜適性）の下に一覧。数を入れるときは、上の欄の下に「スキル情報の欄」（左右の端は「スピード〜賢さ」の欄にそろえる）。
 *   2列 … 上段の左に「ウマ娘詳細」の帯と顔の欄、右に「スピード〜賢さ」の欄と適性。数を入れるときは右の適性の下の隙間にスキル情報の欄（数なしは同じ並びで隙間を空ける）。
 *          その下に一覧を左右に半分ずつ。
 *   既定は 1列・数を入れない。設定はページごとに覚える（809。host.storageKey の localStorage・読めないときは既定）。タイトルのバーは付けない（786）。
 * - つなぎ目の「一致度が低い」は、本育成結果用の文で出す（787）。知らせの出た継ぎ目は元の2枚から測り直し、重なりの少ない次点だけが理由なら外す（T191・811 の案。reviewSeamWarnings）。
 * - スキルの数（全部・固有・進化・金・白）は、OCR を使わず行の色で数える（788・795・797）。数は保存する画像の中だけに入れる（796。画面の欄には出さない）。
 *   添え書き「色で数えた目安です」は画像に入れず、設定の欄の「スキルの数」の横に出す。
 * - メモリは T133・T186 と同じ作り: サムネイルは幅 336px の縮小画像・結合画像は Blob の object URL・使わなくなった URL は手放す。
 * 文の案はすべて SR_TEXTS（キーは報告の文の案の一覧と同じ）。
 */
(function () {
	'use strict';
	const SKILL_RESULT_JS_VERSION = '2026-11-17d';

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
		'sr.one': '1枚だけのときは、選んだ画像をそのまま出します。',
		'sr.stale': '画像が変わりました。「1枚にまとめる」を押すと作り直します。',
		'sr.warn': 'つなぎ目の一部で、スキルの行がずれているかもしれません。行が抜けたり重なったりしていないか見てください。',
		'sr.fail': '画像をまとめられませんでした: {msg}',
		'sr.done': '本育成結果の画像をまとめました',
		// スキル情報の欄の語（T191・820。画像の中で「スキル 69（■固有 1　■進化 1　■金 7　■白 60）」の形に並べる。括弧・四角・数は drawSkillCard が足す）
		'sr.card.all': 'スキル',
		'sr.card.unique': '固有',
		'sr.card.evo': '進化',
		'sr.card.gold': '金',
		'sr.card.white': '白',
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

	// スキル情報の欄の四角の色（スキルの種類の見本。ゲームのパネルの色に近いもの。T189 と同じ）
	const KIND_SWATCH = {
		unique: ['#7FD8F5', '#F7A8F2'], evo: ['#FFC4E6', '#FF8FD0'], gold: ['#FFE27A', '#FFB01F'], white: ['#E4E2F2', '#C6C3E3']
	};
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
	function roundRect(x, rx, ry, rw, rh, r) {
		x.beginPath();
		x.moveTo(rx + r, ry); x.arcTo(rx + rw, ry, rx + rw, ry + rh, r); x.arcTo(rx + rw, ry + rh, rx, ry + rh, r); x.arcTo(rx, ry + rh, rx, ry, r); x.arcTo(rx, ry, rx + rw, ry, r); x.closePath();
	}

	/**
	 * 上の欄（「ウマ娘詳細」の帯〜「スキル・継承・育成情報」の行）の区切り（T191・決定 806・816）。地の行（左右とも明るく緑の無い行）で区切られた塊を見る:
	 *   帯と顔の欄 … 0〜faceEnd ／ 「スピード〜賢さ」の欄 … 緑の枠の行（幅の 80% 超が緑）から始まる塊（statsTop〜statsEnd・左右の端 statsL〜statsR）／
	 *   適性 … その下〜aptEnd ／ 「スキル・継承・育成情報」の行 … いちばん下の塊（tabsTop〜。左寄りだけが緑）。
	 * 見つからない所は null（呼ぶ側が今の上の欄のまま使う）。bg は地の色。
	 */
	function headLayout(head) {
		if (!head || head.width < 50 || head.height < 50) return null;
		const W = head.width, H = head.height, d = pixels(head);
		const x0 = Math.floor(W * 0.01), x1 = Math.ceil(W * 0.99);
		const green = (i) => d[i + 1] > 150 && d[i + 1] > d[i] + 30 && d[i + 1] > d[i + 2] + 60;
		const rows = [];
		for (let y = 0; y < H; y++) {
			let g = 0, light = 0, n = 0;
			for (let x = x0; x < x1; x += 2) {
				const i = (y * W + x) * 4;
				n++;
				if (green(i)) g++;
				if (d[i] >= 236 && d[i + 1] >= 236 && d[i + 2] >= 236) light++;
			}
			rows.push({ g: g / n, bg: g === 0 && light === n });
		}
		const band = headBand(head);
		const from = band ? band.h : 0;
		// 「スピード〜賢さ」の欄: 帯より下で、地の行のすぐ下（間に縁のにじみの行が2行まで）にある緑の枠の行
		const bgAbove = (y) => { for (let k = 1; k <= 3; k++) if (y - k >= 0 && rows[y - k].bg) return y - k; return -1; };
		let statsTop = -1;
		for (let y = Math.max(3, from); y < H; y++) if (rows[y].g >= 0.8 && bgAbove(y) >= 0) { statsTop = y; break; }
		let faceEnd = -1, statsEnd = -1;
		if (statsTop > 0) {
			faceEnd = bgAbove(statsTop) + 1;
			while (faceEnd > from && rows[faceEnd - 1].bg) faceEnd--;
			statsEnd = statsTop;
			while (statsEnd < H && !rows[statsEnd].bg) statsEnd++;
		}
		// 「スキル・継承・育成情報」の行: 下の地の行を飛ばした、いちばん下の塊。左寄りだけが緑（緑の割合 15〜60%）
		let tabsTop = -1, aptEnd = -1;
		let y = H - 1;
		while (y > 0 && rows[y].bg) y--;
		let e = y;
		while (e > 0 && !rows[e].bg) e--;
		const top = e + 1;
		let tabsGreen = 0;
		for (let k = top; k <= y; k++) if (rows[k].g >= 0.15 && rows[k].g <= 0.6) tabsGreen++;
		if (y > top && tabsGreen >= (y - top + 1) * 0.5 && top > (statsEnd > 0 ? statsEnd : from)) {
			tabsTop = top;
			aptEnd = top;
			while (aptEnd > 0 && rows[aptEnd - 1].bg) aptEnd--;
		}
		let statsL = -1, statsR = -1;
		if (statsTop > 0) {
			const sy = Math.min(H - 1, statsTop + 1);
			for (let x = 0; x < W; x++) if (green((sy * W + x) * 4)) { if (statsL < 0) statsL = x; statsR = x + 1; }
		}
		let bg = 'rgb(249,249,249)';
		const by = faceEnd >= 0 && faceEnd < statsTop ? faceEnd : (aptEnd >= 0 && aptEnd < tabsTop ? aptEnd : -1);
		if (by >= 0) { const i = (by * W + Math.floor(W / 2)) * 4; bg = 'rgb(' + d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ')'; }
		const ok = statsTop > 0 && statsEnd > statsTop && tabsTop > statsEnd && aptEnd > statsEnd && statsR - statsL > W * 0.5;
		return { ok, faceEnd, statsTop, statsEnd, aptEnd, tabsTop, statsL, statsR, bg };
	}
	/** 上の欄の緑の帯（「ウマ娘詳細」）の高さ。右寄り（幅の 90%）の列を上から見て、緑の続く行。無ければ null */
	function headBand(head) {
		if (!head) return null;
		const W = head.width, H = Math.min(head.height, Math.round(head.height * 0.3));
		const d = head.getContext('2d', { willReadFrequently: true }).getImageData(Math.floor(W * 0.9), 0, 1, H).data;
		const green = (i) => d[i + 1] > 150 && d[i + 1] > d[i] + 30 && d[i + 1] > d[i + 2] + 60;
		let y = 0;
		while (y < H && green(y * 4)) y++;
		return y < 8 ? null : { h: y };
	}

	/**
	 * スキル情報の欄（T191・決定 815・819・820）。見本（幅 1504 に縮めた2列の画像）の値を、一覧の幅 w に合わせて大きくして使う（k = w / 745）。
	 * 白いカード・灰色の縁（約2px・#ADAAB8）・下に影（約3px・#C1BFCC）・角の丸み 8px。字は #794016 に薄い影（#DECDBC・右下へ約1px）。端末の太い書体。
	 * 文「スキル 69（■固有 1　■進化 1　■金 7　■白 60）」。字の大きさは3段（名前 < 数 < 合計）。
	 * 上下は、字・数・四角それぞれの目に見える部分（actualBoundingBox）の真ん中をカードの真ん中にそろえる。
	 * 間隔（四角と名前・名前と数・「スキル」と合計・「（」と固有の四角）は目に見える部分どうしで同じ幅 gap。行はカードの真ん中に置く。
	 * 項目と項目の間（「固有 1」の「1」と「■進化」の■など）だけは gap × CARD_ITEM_GAP_RATIO（T192・決定 822・823）。
	 * 戻り値: 置いた物の一覧（検査用。目に見える部分の左右・上下）
	 */
	const CARD_INK = '#794016', CARD_INK_SHADOW = '#DECDBC', CARD_BORDER = '#ADAAB8', CARD_SHADOW = '#C1BFCC';
	// 見本 T191-mock-2col-count-zoom.png の画素で測った比: 項目と項目の間 37px（3か所とも）÷ 名前と数の間 14.25px（14・14・13・16 の平均）
	const CARD_ITEM_GAP_RATIO = 37 / 14.25;
	const CARD_FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Meiryo","Yu Gothic",sans-serif';
	function cardMetrics(w) {
		const k = w / 745;
		return { k, h: Math.round(36 * k), border: Math.max(2, Math.round(2 * k)), shadow: Math.max(2, Math.round(3 * k)), radius: Math.round(8 * k), ts: Math.max(1, Math.round(1 * k)), gap: Math.round(12 * k) };
	}
	function drawSkillCard(x, cx, cy, cw, m, counts) {
		const ch = m.h;
		// 影（下へ）→ カード（白・灰色の縁）
		roundRect(x, cx, cy + m.shadow, cw, ch, m.radius);
		x.fillStyle = CARD_SHADOW; x.fill();
		roundRect(x, cx + m.border / 2, cy + m.border / 2, cw - m.border, ch - m.border, Math.max(1, m.radius - m.border / 2));
		x.fillStyle = '#ffffff'; x.fill();
		x.lineWidth = m.border; x.strokeStyle = CARD_BORDER; x.stroke();
		const mid = cy + ch / 2;
		const inner = cw - m.border * 2;
		// 字の大きさ（名前 < 数 < 合計）。幅に入らなければ全体を縮める
		let base = ch * 0.56;   // 見本の字の高さ（名前の漢字がカードの高さの約 55%）に合わせた
		const items = ['unique', 'evo', 'gold', 'white'].map((kind) => [kind, t('sr.card.' + kind), counts[kind]]);
		let pieces, total;
		const layout = () => {
			const fs = { name: base, num: base * 1.12, all: base * 1.32 };
			const gap = base * 0.42, sq = base * 0.74;
			const font = (px) => 'bold ' + px.toFixed(2) + 'px ' + CARD_FONT;
			const text = (s, px) => {
				x.font = font(px);
				const t = x.measureText(s);
				return { kind: 'text', s, px, adv: t.width, l: t.actualBoundingBoxLeft, r: t.actualBoundingBoxRight, asc: t.actualBoundingBoxAscent, desc: t.actualBoundingBoxDescent };
			};
			const list = [];
			// 置く: 目に見える部分の左端 at に置く（字は x の位置を測った値でずらす）
			let at = 0;
			const putInk = (p, gapBefore) => { at += gapBefore; p.inkL = at; p.inkR = at + (p.kind === 'text' ? p.l + p.r : p.size); at = p.inkR; list.push(p); return p; };
			// 字の送り（advance）で続ける（「69」→「（」・最後の数→「）」は字の形のまま）
			const putAdv = (p) => { const prev = list[list.length - 1]; const penPrev = prev.inkL + prev.l; const pen = penPrev + prev.adv; p.inkL = pen - p.l; p.inkR = pen + p.r; at = p.inkR; list.push(p); return p; };
			putInk(text(t('sr.card.all'), fs.name), 0);
			putInk(text(String(counts.all), fs.all), gap);
			// 「（」と固有の四角の間は、目に見える部分どうしでほかの間と同じ gap（T192・823。半角ぶん足すのはやめた）
			putAdv(text('（', fs.name));
			items.forEach(([kind, name, n], i) => {
				// 項目と項目の間（前の数と次の四角）だけを見本の比で広げる（T192・822）
				putInk({ kind: 'sq', sw: kind, size: sq }, i === 0 ? gap : gap * CARD_ITEM_GAP_RATIO);
				putInk(text(name, fs.name), gap);
				putInk(text(String(n), fs.num), gap);
			});
			putAdv(text('）', fs.name));
			pieces = list;
			total = list[list.length - 1].inkR - list[0].inkL;
		};
		layout();
		if (total > inner * 0.92) { base *= (inner * 0.92) / total; layout(); }
		const sx = cx + (cw - total) / 2 - pieces[0].inkL;
		const out = [];
		pieces.forEach((p) => {
			const L = sx + p.inkL;
			if (p.kind === 'sq') {
				const top = mid - p.size / 2;
				swatch(x, L, top, p.size, p.sw);
				out.push({ kind: 'sq', s: p.sw, l: L, r: L + p.size, top, bottom: top + p.size });
				return;
			}
			x.font = 'bold ' + p.px.toFixed(2) + 'px ' + CARD_FONT;
			x.textAlign = 'left';
			x.textBaseline = 'alphabetic';
			const px = L + p.l;
			const py = mid + (p.asc - p.desc) / 2;
			x.fillStyle = CARD_INK_SHADOW; x.fillText(p.s, px + m.ts, py + m.ts);
			x.fillStyle = CARD_INK; x.fillText(p.s, px, py);
			out.push({ kind: 'text', s: p.s, px: Math.round(p.px * 10) / 10, l: L, r: L + p.l + p.r, top: py - p.asc, bottom: py + p.desc });
		});
		return out;
	}

	/**
	 * 結合の結果（stitchOnePerson の Canvas）と1枚目の画から、出す画像を組み立てる（T191・決定 806・816・817・818）。
	 * o.cols 1|2・o.counts（スキルの数を入れるとき countSkills の値。無ければ入れない）。「スキル・継承・育成情報」の行はどの形でも入れない。
	 *   1列: 上の欄（帯〜適性）＋（数があれば）スキル情報の欄＋一覧。
	 *   2列: 上段の左に帯と顔の欄・右に「スピード〜賢さ」と適性（数があれば適性の下の隙間にスキル情報の欄。数なしは同じ並びで隙間を空ける）。その下に一覧を左右に半分ずつ。
	 * 上の欄の区切りが見つからない画では、上の欄（の「スキル…」の行より上）をそのまま左上（1列は上）に置く。
	 * 返す Canvas に _sr（{ band, headH, listH, split, thumb, cols, variant, info, topH, head, card, pieces }）を添える
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
		const layout = head ? headLayout(head) : null;
		return { band, head, body, headH, thumb, w, layout };
	}
	function compose(parts, o) {
		const { head, body, w } = parts;
		const headH = head ? head.height : 0, listH = body.height;
		const counts = o.counts || null;
		const lay = parts.layout || null;
		const ok = !!(lay && lay.ok);
		const m = cardMetrics(w);
		const G = Math.max(8, Math.round(w * 0.014));
		const bg = lay ? lay.bg : 'rgb(249,249,249)';
		// 上の欄から使う所: 帯〜適性（「スキル…」の行は入れない）
		const cutEnd = lay && lay.tabsTop > 0 ? lay.tabsTop : headH;
		const aptEnd = lay && lay.aptEnd > 0 ? lay.aptEnd : cutEnd;
		const cardL = ok ? lay.statsL : Math.round(w * 0.016), cardW = (ok ? lay.statsR : Math.round(w * 0.984)) - cardL;
		const block = m.gap + m.h + m.shadow + m.gap;   // スキル情報の欄の上下の空きを含む高さ
		let out, split = null, variant = null, topH, card = null, pieces = null;
		if (o.cols !== 2) {
			// 1列（817・818）: 上の欄（帯〜適性）＋スキル情報の欄＋一覧。数なしは「スキル…」の行の手前まで
			const top = counts ? aptEnd : cutEnd;
			topH = top + (counts ? block : 0);
			out = mk(w, topH + listH);
			const x = out.getContext('2d');
			x.fillStyle = bg; x.fillRect(0, 0, w, topH);
			if (head) x.drawImage(head, 0, 0, w, top, 0, 0, w, top);
			if (counts) {
				card = { x: cardL, y: top + m.gap, w: cardW, h: m.h };
				pieces = drawSkillCard(x, card.x, card.y, card.w, m, counts);
			}
			x.drawImage(body, 0, topH);
		} else {
			// 2列（806・816）: 上段の左に帯と顔の欄・右に「スピード〜賢さ」と適性＋スキル情報の欄。その下に一覧を半分ずつ（左右の下端がそろう所＝真ん中に近い行の間で分ける）
			variant = 'split';
			const leftH = ok ? lay.faceEnd : cutEnd;
			const rightTop = ok ? lay.faceEnd : 0, rightH = ok ? aptEnd - lay.faceEnd : 0;
			topH = Math.max(leftH, rightH + block);
			split = findRowGap(body, listH / 2, listH * 0.3, listH * 0.7);
			const rightL = listH - split;
			out = mk(w * 2 + G, topH + Math.max(split, rightL));
			const x = out.getContext('2d');
			x.fillStyle = bg; x.fillRect(0, 0, w, topH); x.fillRect(w + G, 0, w, topH);
			if (head && leftH) x.drawImage(head, 0, 0, w, leftH, 0, 0, w, leftH);
			if (head && rightH) x.drawImage(head, 0, rightTop, w, rightH, w + G, 0, w, rightH);
			if (counts) {
				card = { x: w + G + cardL, y: rightH + m.gap, w: cardW, h: m.h };
				pieces = drawSkillCard(x, card.x, card.y, card.w, m, counts);
			}
			x.drawImage(body, 0, 0, w, split, 0, topH, w, split);
			x.drawImage(body, 0, split, w, rightL, w + G, topH, w, rightL);
		}
		out._sr = { band: parts.band, headH, listH, split, thumb: parts.thumb, cols: o.cols === 2 ? 2 : 1, variant, info: !!counts, topH,
			head: lay ? { ok: lay.ok, faceEnd: lay.faceEnd, statsTop: lay.statsTop, statsEnd: lay.statsEnd, aptEnd: lay.aptEnd, tabsTop: lay.tabsTop, statsL: lay.statsL, statsR: lay.statsR } : null,
			gap: G, card, pieces };
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
		cols: 1, withCount: false,   // 結合画像の設定（804）。既定は 1列・スキルの数を入れない。ページごとに覚える（809・loadSettings／saveSettings）
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
	/*
	 * つなぎ目の知らせの見直し（T191・811。案。採るかどうかはおいもさんが決める）。
	 * 凍結の stitch.js は、継ぎ目の不一致率が 3% 未満でも、最良の位置から 40行より離れた「次点」との比が 2 未満なら「一致度が低い」と知らせる。
	 * 素材 IMG_4520〜4526 の画像4→5 では、次点が重なり 64行（下限 60行のすぐ上・行の間の明るい所どうし）の位置で、比が 1.04 になって知らせが出ていた
	 * （結合の位置は正しい。別の物差しでも最良・結合画像は元の行と同じ）。重なりが少ない位置は判断の材料が足りないので、次点に数えない。
	 * ここでは、知らせの出た継ぎ目だけを、元の2枚から同じ物差し（灰色の差が 24 を超える画素の割合・左右1割を外す・2行／3列おき）で測り直し、
	 *   結合の決めた位置が最良（±1行）で不一致率が 3% 未満、かつ「40行より離れ、重なりが SEAM_MIN_EVIDENCE 行以上の位置」の次点との比が 2 以上なら、知らせを外す。
	 * それ以外（位置が最良でない・不一致率が高い・測れない）は今までどおり知らせる。
	 */
	const SEAM_MIN_EVIDENCE = 120;
	function seamGray(c, y0, y1) {
		const x0 = Math.floor(c.width * 0.1), x1 = c.width - x0, w = x1 - x0, h = y1 - y0;
		const d = c.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
		const g = new Uint8Array(w * h);
		for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
		return { g, w, h };
	}
	/** 上の画 A と下の画 B（同じ窓の灰色）で、下を d 行ずらして重ねたときの不一致率（d ごと。白どうしの位置は Infinity） */
	function seamRates(A, B) {
		const w = A.w, h = A.h, rates = new Float64Array(Math.max(0, h - 60) + 1).fill(Infinity);
		for (let d = 1; d <= h - 60; d++) {
			let bad = 0, tot = 0, ink = 0;
			for (let y = 0; y < h - d; y += 2) {
				const ra = (y + d) * w, rb = y * w;
				for (let x = 0; x < w; x += 3) {
					const a = A.g[ra + x], b = B.g[rb + x];
					if (a < 240 || b < 240) ink++;
					if (Math.abs(a - b) > 24) bad++;
					tot++;
				}
			}
			if (tot && ink >= tot * 0.05) rates[d] = bad / tot;
		}
		return rates;
	}
	/** 測り直しの判定（検査はここも直接呼ぶ）。rates・結合の決めた位置 d・窓の高さ h → { ok, best, rate, second, secondD, ratio } */
	function judgeSeam(rates, d, h) {
		let best = -1, rate = Infinity;
		for (let k = 1; k < rates.length; k++) if (rates[k] < rate) { rate = rates[k]; best = k; }
		let second = Infinity, secondD = -1;
		for (let k = 1; k < rates.length; k++) if (Math.abs(k - d) > 40 && h - k >= SEAM_MIN_EVIDENCE && rates[k] < second) { second = rates[k]; secondD = k; }
		const ratio = second / rate;
		const ok = best > 0 && Math.abs(best - d) <= 1 && rate < 0.03 && (!isFinite(second) || ratio >= 2);
		return { ok, best, rate, second: isFinite(second) ? second : null, secondD, ratio: isFinite(ratio) ? ratio : null };
	}
	/** 知らせの出た継ぎ目を測り直す。戻り値 { warnings（残す知らせ）, review（継ぎ目ごとの結果） } */
	async function reviewSeamWarnings(files, list) {
		const warns = (list._stitchWarnings || []).slice();
		const pl = list._sourcePlacements || [];
		const review = [];
		if (!warns.length || pl.length < 2) return { warnings: warns, review };
		const keep = [];
		for (const msg of warns) {
			const m = /画像(\d+)→(\d+)/.exec(msg);
			const k = m ? Number(m[1]) : -1;
			if (k < 0 || !pl[k] || !pl[k + 1]) { keep.push(msg); continue; }
			let a = null, b = null;
			try {
				const d = (pl[k + 1].outY0 - pl[k + 1].srcY0) - (pl[k].outY0 - pl[k].srcY0);
				a = await fileCanvas(files[pl[k].fileIndex]);
				b = await fileCanvas(files[pl[k + 1].fileIndex]);
				const y0 = pl[0].srcY0, y1 = Math.min(pl[0].srcY1, a.height, b.height);
				if (a.width !== b.width || y1 - y0 < 200) throw new Error('窓が小さい');
				const r = judgeSeam(seamRates(seamGray(a, y0, y1), seamGray(b, y0, y1)), d, y1 - y0);
				review.push(Object.assign({ seam: k, d }, r));
				if (!r.ok) keep.push(msg);
			} catch (e) {
				review.push({ seam: k, ok: false, error: String(e && e.message || e) });
				keep.push(msg);
			} finally {
				if (a) a.width = a.height = 0;
				if (b) b.width = b.height = 0;
			}
		}
		return { warnings: keep, review };
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
				const seams = await reviewSeamWarnings(files, list);
				built = { files, one: false, first: null, parts, counts, warnings: seams.warnings, seamReview: seams.review };
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
	// 設定（1列｜2列・スキルの数）をページごとに覚える（T191・809）。保存の読み書きは try/catch で包み、読めないとき・形の違う値は既定（1列・数なし）
	function loadSettings() {
		st.cols = 1; st.withCount = false;
		const key = st.host && st.host.storageKey;
		if (!key) return;
		try {
			const v = JSON.parse(localStorage.getItem(key) || 'null');
			if (v && typeof v === 'object') {
				st.cols = v.cols === 2 ? 2 : 1;
				st.withCount = v.count === true;
			}
		} catch (e) { st.cols = 1; st.withCount = false; }
	}
	function saveSettings() {
		const key = st.host && st.host.storageKey;
		if (!key) return;
		try { localStorage.setItem(key, JSON.stringify({ cols: st.cols, count: st.withCount })); } catch (e) { /* 保存できなくても動く（覚えないだけ） */ }
	}
	// 設定を変えたら、覚えて、作った材料から組み直す（結合はやり直さない）
	function settingChanged() {
		saveSettings();
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
	/** host = { stitchOnePerson(files, label), attachSaveName(link), toast(text), onChange(n), storageKey（設定を覚える localStorage のキー。ページごと） } */
	function mount(root, host) {
		injectStyle();
		st.root = root;
		st.host = host || {};
		loadSettings();
		root.addEventListener('click', onClick);
		root.addEventListener('change', (e) => {
			if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-sr-input')) { addFiles(e.target.files); e.target.value = ''; return; }
			if (e.target && e.target.getAttribute && e.target.getAttribute('data-sr-opt') === 'count') { st.withCount = !!e.target.checked; settingChanged(); }
		});
		render();
	}

	window.UmaSkillResult = Object.freeze({
		version: SKILL_RESULT_JS_VERSION, texts: SR_TEXTS,
		mount, prepareParts, compose, countSkills, modalBand, eraseScrollThumb, findRowGap, headLayout, drawSkillCard, cardMetrics, reviewSeamWarnings, judgeSeam,
		count: () => st.files.length,
		files: () => st.files.slice(),
		// 検査用: 今の状態（URL・形・作ったか）
		peek: () => ({ files: st.files.length, cols: st.cols, withCount: st.withCount, built: !!st.built, url: st.png ? st.png.url : null,
			thumbs: Array.from(st.thumbs.values()).map((x) => x.url), counts: st.built ? st.built.counts : null, sr: st.built && st.built.last ? st.built.last._sr : null,
			warnings: st.built ? (st.built.warnings || []).slice() : [], seamReview: st.built ? st.built.seamReview || [] : [] }),
		addFiles, build
	});
})();
