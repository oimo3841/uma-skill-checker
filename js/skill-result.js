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
 * - 動画（T193・決定 774 の続き）: 入口は親A と同じ。タブの行の右端の「静止画｜動画」（ページの uploadMode。body の data-upload-mode）が「動画」のとき、
 *   「画像を選ぶ」の代わりに「動画を選ぶ β」「ウィンドウから取り込む β」（PC だけ）。スマホの縦の録画・DMM版の横画面の録画（UmaLandscape.wrapSource）・
 *   PC のウィンドウの取り込み（UmaPcCapture）を、親A と同じ部品（UmaVideoFrames.openSource・selectFrames・UmaPcCapture.removePointer）でコマに分け、
 *   選んだコマを静止画と同じ組み立て（build → host.stitchOnePerson）に渡す。録画の先頭で一覧を引っぱりすぎたコマは外す（trimLeadingOverscroll）。
 *   コマは静止画と同じく st.files に入れ、親A と同じく「動画の画像」の1行（押すと全部）で見せる。タブの枚数には数えない（親A と同じ）。
 * 文の案はすべて SR_TEXTS（キーは報告の文の案の一覧と同じ）。動画の文は親A のもの（host.video.text）を使い、本育成結果に専用の文だけ SR_TEXTS に置く。
 */
(function () {
	'use strict';
	const SKILL_RESULT_JS_VERSION = '2026-11-24a';

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
		'sr.title': '本育成結果',
		// 動画の入口（T193）。ほかの文は親A の動画の文（ページの VIDEO_TEXTS。host.video.text）をそのまま使う。ここは本育成結果に専用の文だけ
		// （親A の文が「因子の画面」「親から祖2」を言う所）
		'sr.lead.video': '本育成のスキル画面を、スキルの一覧の一番下までゆっくりスクロールした動画から、1枚の画像にまとめます（OCR はしません）。',
		'sr.video.howto1': '・スキルの一覧の一番下までゆっくりスクロール。',
		'sr.video.err.noscreen': '動画の中に本育成のスキル画面（スキルの一覧）が見つかりませんでした。スキルの一覧を開いてから撮り直してください。',
		'sr.cap.fail.band': 'ゲームのスキル画面を見つけられませんでした。スキルの一覧を開いてから取り込んでください。',
		'sr.cap.fail.toofew': '動きが読み取れませんでした。スキルの一覧をスクロールしてください。'
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
		// T193: 動画のタッチの光（白っぽい輪・蹄鉄）が金の右寄りに乗ると、右の色が白っぽくなって白に数えていた（スマホの録画の「正々堂々」R(231,214,187)）。
		// 右が金でもピンクでもないとき、左寄りが金寄り（R が B より 30 を超えて高い）で右も暖色（R が B より高い）なら金とする。
		// 測った左寄り: 金 (242〜253, 225〜232, 145〜174)・光の乗った金 (236,226,194)・白 (224〜240, 223〜240, 229〜245)・固有 (195〜199, 223〜225, 235〜238)・進化は右がピンクなので先に決まる
		if (L.r > 225 && L.g > 200 && L.r - L.b > 30 && R.r - R.b > 15) return 'gold';
		return 'white';
	}
	function countSkills(list) {
		const W = list.width, H = list.height, d = pixels(list);
		const halves = [[Math.floor(W * 0.03), Math.floor(W * 0.495)], [Math.floor(W * 0.505), Math.floor(W * 0.965)]];
		const out = { all: 0, unique: 0, evo: 0, gold: 0, white: 0, panels: [] };
		const runs = [];
		halves.forEach(([xa, xb], col) => {
			// その列の真ん中の縦の線で、パネルのある行（明るくない行）が 40px 以上続く所をパネルとする
			const xs = [xa + Math.floor((xb - xa) * 0.55), xa + Math.floor((xb - xa) * 0.8)];
			const dark = (y) => xs.some((x) => { const i = (y * W + x) * 4; return d[i] < 236 || d[i + 1] < 236 || d[i + 2] < 236; });
			let y = 0;
			while (y < H) {
				if (!dark(y)) { y++; continue; }
				let e = y;
				while (e < H && dark(e)) e++;
				if (e - y >= Math.max(40, W * 0.045)) runs.push({ col, y0: y, y1: e, xa, xb });
				y = e + 1;
			}
		});
		// T193: 動画のタッチの光（輪・蹄鉄・星）が行の間をふさぐと、上下2枚のパネルが1つのまとまりになる（スマホの録画の「アグレッシブ」と「正々堂々」）。
		// ふつうのパネルの高さ（まとまりの高さの中央値）の 1.5倍を超えるまとまりは、パネルの高さと行の間（同じ列の隣のまとまりとの間の中央値）で割って分ける
		const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
		const h = med(runs.map((r) => r.y1 - r.y0));
		const gaps = [];
		for (let k = 1; k < runs.length; k++) if (runs[k].col === runs[k - 1].col) gaps.push(runs[k].y0 - runs[k - 1].y1);
		const g = med(gaps);
		runs.forEach((r) => {
			const len = r.y1 - r.y0;
			const n = h > 0 && len > h * 1.5 ? Math.max(1, Math.round((len + g) / (h + g))) : 1;
			const sub = (len - (n - 1) * g) / n;
			for (let k = 0; k < n; k++) {
				const y0 = Math.round(r.y0 + k * (sub + g)), y1 = n === 1 ? r.y1 : Math.round(y0 + sub);
				const kind = classifyPanel(d, W, y0, y1, r.xa, r.xb);
				out[kind]++; out.all++;
				out.panels.push(n === 1 ? { col: r.col, y0, y1, kind } : { col: r.col, y0, y1, kind, split: n });
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
		// 「スピード〜賢さ」の欄: 帯より下で、地の行のすぐ下（間に縁のにじみの行が4行まで）にある緑の枠の行
		// （T193: 動画のコマは圧縮で枠の上の縁が3行にじむ〔スマホの録画で地の行 443・にじみ 444〜446・緑の枠 447〕。静止画は1行）
		const bgAbove = (y) => { for (let k = 1; k <= 5; k++) if (y - k >= 0 && rows[y - k].bg) return y - k; return -1; };
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
		busy: false,
		// 動画（T193）
		video: null,          // 今の st.files が動画から来たとき { files: [File], expanded, small, kind }。画像を足す・外すと null（親A の videoTouched と同じ）
		vbusy: null,          // 動画の処理中 { ctrl, capture, step }
		stageEl: null,        // 進み具合・失敗・取り込みの箱（render で作り直さない。中の video を止めないため）
		capArea: null         // 取り込みの途中で見つけた領域（小さい窓の知らせに使う）
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
		// 動画から来た画は、親A と同じく「動画の画像」の1行（押すと全部）で見せる（T193）
		const tile = !!(n && st.video && !st.video.expanded);
		const imgOf = (f, i) => { const th = thumbOf(f); return '<img ' + (th.url ? 'src="' + th.url + '"' : 'data-sr-thumb="' + i + '"') + ' alt="" />'; };
		r.innerHTML =
			'<div class="sr-panel' + (st.stageEl && st.stageEl.querySelector('.cap-box') ? ' sr-cap-on' : '') + '" data-sr-panel>' +
				'<p class="sr-lead sr-lead-shot">' + esc(t('sr.lead')) + '</p>' +
				(videoOffered() ? '<p class="sr-lead sr-lead-video">' + esc(t('sr.lead.video')) + '</p>' + videoRowHtml() : '') +
				'<div class="sr-pick-row">' +
					'<label class="uma-btn uma-btn--secondary sr-pick"><input type="file" accept="image/*" multiple hidden data-sr-input /><span>' + esc(t('sr.btn.pick')) + '</span></label>' +
					(n ? '<button type="button" class="sr-clear" data-sr-act="clear"' + (st.vbusy ? ' disabled' : '') + '>' + esc(t('sr.btn.clear')) + '</button>' : '') +
				'</div>' +
				'<div data-sr-stage></div>' +
				(tile ? '<div class="sr-thumbs" data-sr-thumbs><button type="button" class="video-tile" data-sr-act="vtile">' + imgOf(st.files[0], 0) +
					esc(vt('video.tile.text')) + '<small>' + esc(vt('video.tile.hint')) + '</small></button></div>' : '') +
				(n && !tile ? '<div class="sr-thumbs" data-sr-thumbs>' + st.files.map((f, i) => {
					return '<div class="sr-thumb">' + imgOf(f, i) + '<span class="sr-thumb-no">' + (i + 1) + '</span>' +
						'<button type="button" class="sr-thumb-x" data-sr-remove="' + i + '" aria-label="' + (i + 1) + '枚目を外す">×</button></div>';
				}).join('') + '</div>' : '') +
				settingsHtml(one) +
				'<button type="button" class="uma-btn uma-btn--primary w-full sr-build" data-sr-act="build"' + (n && !st.busy && (!st.built || stale) ? '' : ' disabled') + '><span>' + esc(st.busy ? t('sr.btn.busy') : t('sr.btn.build')) + '</span></button>' +
				(one ? '<p class="sr-note">' + esc(t('sr.one')) + '</p>' : '') +
				(stale ? '<p class="sr-note" data-sr-stale>' + esc(t('sr.stale')) + '</p>' : '') +
				'<div class="sr-result" data-sr-result></div>' +
			'</div>';
		// 進み具合・取り込みの箱は作り直さずに差し込む（取り込みの映像を止めない）
		const slot = r.querySelector('[data-sr-stage]');
		if (slot && st.stageEl) {
			slot.replaceWith(st.stageEl);
			const m = st.stageEl.querySelector('video');
			if (m && m.paused) m.play().catch(() => { /* 流れなくても取り込みは続く */ });
		}
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
		// DMM版の横画面の小さい窓（親A の appendSmallWindowNote と同じ文・同じ箱。T193）
		if (st.video && st.video.small && st.host.video) {
			const vw = document.createElement('div');
			vw.className = 'video-small-window rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex gap-2';
			vw.setAttribute('role', 'status');
			vw.innerHTML = (st.host.video.svgTri ? st.host.video.svgTri('text-amber-500') : '') + '<div>' + esc(vt('video.warn.window')) + '</div>';
			block.appendChild(vw);
		}
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
	/* ───────── 動画（T193） ───────── */
	// 親A の動画の文（ページの VIDEO_TEXTS）。ページが渡さないとき（動画の無いページ）は動画の入口を出さない
	function vt(key, vars) { const v = st.host && st.host.video; return v && v.text ? v.text(key, vars) : key; }
	function videoOffered() { return !!(st.host && st.host.video && window.UmaVideoFrames); }
	function captureOffered() { const v = st.host && st.host.video; return !!(v && v.captureOffered && v.captureOffered() && window.UmaPcCapture); }
	function videoRowHtml() {
		const v = st.host.video, dis = st.vbusy || st.busy ? ' disabled' : '';
		const alpha = '<span class="video-alpha" aria-hidden="true">' + esc(vt('video.entry.alpha')) + '</span>';
		return '<div class="sr-video-row video-pick-row"><input type="file" accept="video/*" hidden data-sr-video-input />' +
			'<button type="button" class="video-pick-btn" data-sr-act="video"' + dis + '>' + (v.svg || '') + '<span>' + esc(vt('video.btn.pick')) + '</span>' + alpha + '</button>' +
			(captureOffered() ? '<button type="button" class="video-capture-btn" data-sr-act="capture"' + dis + '>' + (v.svgWindow || '') + '<span>' + esc(vt('video.btn.capture')) + '</span>' + alpha + '</button>' : '') +
			'</div>';
	}
	function stage() {
		if (!st.stageEl) { st.stageEl = document.createElement('div'); st.stageEl.className = 'sr-video-stage'; }
		return st.stageEl;
	}
	function clearStage() { if (st.stageEl) st.stageEl.textContent = ''; }
	/* 進み具合（親A の renderVideoProgress と同じ箱・同じ文。段は 読み込み → 「本育成結果 のフレームを選んでいます」→ 完了） */
	function renderProgress(step, ratio) {
		const names = [vt('video.prog.read'), vt('video.prog.person', { 人: t('sr.title') }), vt('video.prog.done')];
		const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
		const s = stage();
		let el = s.querySelector('.sr-video-progress');
		if (!el) {
			el = document.createElement('div');
			el.className = 'sr-video-progress p-4 rounded-xl bg-green-50 border border-green-200';
			el.setAttribute('role', 'status');
			el.setAttribute('aria-live', 'polite');
			el.innerHTML = '<div class="flex justify-between text-xs font-semibold text-green-900 mb-2"><span class="flex items-center gap-1.5">' + (st.host.video.svgSpin || '')
				+ '<span class="video-prog-label"></span></span><span class="video-prog-pct"></span></div>'
				+ '<div class="h-2 bg-green-200/70 rounded-full overflow-hidden"><div class="video-prog-bar h-full bg-green-600 rounded-full"></div></div>'
				+ '<ol class="video-steps"></ol>'
				+ '<div class="video-prog-foot"><small>' + esc(vt('video.prog.foot')) + '</small>'
				+ '<button type="button" class="uma-btn uma-btn--secondary" data-sr-act="abort" style="min-height:44px">' + esc(vt('video.btn.abort')) + '</button></div>';
			s.appendChild(el);
		}
		el.querySelector('.video-prog-label').textContent = names[step] + (step < names.length - 1 ? '…' : '');
		el.querySelector('.video-prog-pct').textContent = pct + '%';
		el.querySelector('.video-prog-bar').style.width = pct + '%';
		el.querySelector('.video-steps').innerHTML = names.map((n, i) => {
			const k = i < step ? 'done' : (i === step ? 'now' : 'todo');
			return '<li data-st="' + k + '"><i>' + (k === 'done' ? '✓' : (k === 'now' ? '▸' : '・')) + '</i>' + esc(n) + '</li>';
		}).join('');
	}
	function onVideoProgress(p) {
		if (!st.vbusy) return;
		const step = p.phase === 'read' ? 0 : 1;
		st.vbusy.step = Math.max(st.vbusy.step, step);
		renderProgress(st.vbusy.step, p.ratio || 0);
	}
	// 失敗の文（親A の videoErrorKey と同じ分け方。画面が見つからないときだけ本育成結果の文）
	function videoErrorText(e) {
		const c = e && e.code;
		if (c === 'band' || c === 'too-few') return t('sr.video.err.noscreen');
		if (c === 'too-many' || c === 'track') return vt('video.err.fast');
		return vt('video.err.unreadable');
	}
	function showVideoError(e) {
		const el = document.createElement('div');
		el.className = 'sr-video-error rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 flex gap-2';
		el.setAttribute('role', 'alert');
		el.innerHTML = (st.host.video.svgTri ? st.host.video.svgTri('text-red-500') : '') + '<div class="video-error-text">' + esc(videoErrorText(e)) + '<br>' + esc(vt('video.err.keep')) + '</div>';
		stage().appendChild(el);
	}
	// 取り込みの失敗（親A の showCaptureFail と同じ箱・「もう一度」）。画面が見つからない・動かないは本育成結果の文
	function showCaptureFail(kind) {
		const text = kind === 'band' || kind === 'toofew' ? t('sr.cap.fail.' + kind) : vt('video.cap.fail.' + kind);
		stage().innerHTML = '<div class="cap-fail sr-cap-fail" role="alert"><p>' + esc(text) + '</p><button type="button" class="uma-btn uma-btn--secondary" data-sr-act="capture">' + esc(vt('video.cap.retry')) + '</button></div>';
	}
	// DMM版の横画面の切り出しの幅が小さいとき（親A の LANDSCAPE_SMALL_W〔570px〕と同じ境。決定 677）
	const LANDSCAPE_SMALL_W = 570;
	function isSmallWindow(rect) {
		const w = rect && (rect.how === undefined || rect.how === 'landscape') && rect.w > 0 ? rect.w : null;
		return w != null && w < LANDSCAPE_SMALL_W;
	}
	/** 選んだコマを、撮った順に1列にする（人に分かれたときもまとめる。removePointer が置き換えた画を使う）。戻り値 { files, shift01 } */
	function framesOf(sel) {
		const byIdx = new Map();
		let shift01 = null;
		for (const p of sel.persons || []) {
			(p.frameIndexes || []).forEach((fi, k) => { if (p.files[k]) byIdx.set(fi, p.files[k]); });
			const fi = p.frameIndexes || [];
			for (let k = 0; k + 1 < fi.length; k++) if (fi[k] === 0 && fi[k + 1] === 1 && p.shifts) shift01 = p.shifts[k];
		}
		const idx = Array.from(byIdx.keys()).sort((a, b) => a - b);
		const files = idx.length ? idx.map((i) => byIdx.get(i)) : (sel.files || []).slice();
		return { files, shift01 };
	}
	/** 一覧の上端（hE）から、最初のパネルの行（幅の 6〜94% の半分以上が明るくない行）までの行数。タッチの光（薄い）は空きに数える */
	function listTopGap(c, hE) {
		const W = c.width, H = c.height, d = pixels(c);
		const x0 = Math.floor(W * 0.06), x1 = Math.floor(W * 0.94);
		for (let y = Math.max(0, hE); y < H; y++) {
			let n = 0, k = 0;
			for (let x = x0; x < x1; x += 5) { const i = (y * W + x) * 4; n++; if (d[i] < 236 || d[i + 1] < 236 || d[i + 2] < 236) k++; }
			if (k * 2 >= n) return y - hE;
		}
		return H - hE;
	}
	/**
	 * 録画の先頭で一覧を下へ引っぱりすぎたコマ（一覧の上に空きがあり、ゲームのタッチの光が写る）を外す（T193）。
	 * スマホの録画の1枚目は、一覧の上端から最初のパネルまでが 145行（ふつうは 17〜25行。静止画も同じ）で、次のコマとのずれ 130行は引っぱった分とほぼ同じだった。
	 * 外すのは「1枚目の空きが幅の 5% を超え」かつ「1枚目の最初のパネルが、2枚目でも一覧の上端の近く（2枚目の空き ±幅の 2%）に見えている」とき
	 * （2枚目に一覧の頭がそのまま写っているので、外しても行は欠けない）。3枚以上あるときだけ。戻り値 { files, dropped }
	 */
	async function trimLeadingOverscroll(files, hE, shift01) {
		if (files.length < 3 || !(shift01 > 0) || !(hE >= 0)) return { files, dropped: 0, why: null };
		let a = null, b = null;
		try {
			a = await fileCanvas(files[0]);
			b = await fileCanvas(files[1]);
			const W = a.width, g0 = listTopGap(a, hE), g1 = listTopGap(b, hE);
			const why = { g0, g1, shift01, W };
			if (g0 > W * 0.05 && Math.abs((g0 - shift01) - g1) <= W * 0.02) return { files: files.slice(1), dropped: 1, why };
			return { files, dropped: 0, why };
		} catch (e) {
			return { files, dropped: 0, why: { error: String(e && e.message || e) } };
		} finally {
			if (a) a.width = a.height = 0;
			if (b) b.width = b.height = 0;
		}
	}
	/* 動画（File）か取り込みの一回分（UmaPcCapture.begin の戻り値）を、親A の onVideoChosen と同じ部品でコマに分け、
	 * 選んだコマで今の画像を置き換えて（親A と同じく確かめない。置き換えるのは成功したときだけ）、静止画と同じ組み立てを自動で行う。
	 * 戻り値 { ok, aborted?, error?, frames?, dropped? } */
	async function runVideo(input, o) {
		const capture = !!(o && o.capture);
		const V = window.UmaVideoFrames;
		if (!input || st.vbusy || st.busy || !V) return { ok: false };
		const ctrl = new AbortController();
		st.vbusy = { ctrl, capture, step: 0 };
		const s = stage();
		s.querySelectorAll('.sr-video-progress, .sr-video-error, .sr-cap-fail').forEach((el) => el.remove());
		if (o && o.limit) s.innerHTML = '<p class="cap-note">' + esc(vt('video.cap.limit')) + '</p>';
		renderProgress(0, 0);
		render();
		let src = null;
		const log = (line) => { if (st.host.log) st.host.log('[本育成結果の動画] ' + line); };
		try {
			// 出どころ（親A と同じ）: 取り込みは一回分の open・フレームの出どころ（drawAt を持つもの。検査の作り物）はそのまま・動画のファイルは openSource
			src = capture ? await V.untilAbort(input.open(ctrl.signal), ctrl.signal)
				: (typeof input.drawAt === 'function') ? input : await V.openSource(input, { signal: ctrl.signal });
			// DMM版の横画面の録画は、パネルを切り出した出どころにする（親A と同じ。取り込みは pc-capture.js が切り出す）
			if (!capture && window.UmaLandscape) src = await V.untilAbort(UmaLandscape.wrapSource(src, { signal: ctrl.signal }), ctrl.signal);
			const small = isSmallWindow(capture ? st.capArea : (src.landscape && src.landscape.rect));
			log('出どころ: ' + (src.kind || '?') + (src.codec ? '・' + src.codec : '') + '・' + src.width + 'x' + src.height);
			const opts = { labels: [t('sr.title')], signal: ctrl.signal, onProgress: onVideoProgress };
			// PC で撮った画（取り込み・横画面の録画）はタッチのエフェクトの置き換えを切り、カーソルを消す（親A と同じ。T156・決定 637）
			const debug = {}, pcVideo = capture || !!src.landscape;
			if (pcVideo) { opts.debug = debug; opts.effectVote = false; }
			const sel = await V.untilAbort(V.selectFrames(src, opts), ctrl.signal);
			if (pcVideo && window.UmaPcCapture) await V.untilAbort(UmaPcCapture.removePointer(src, sel, debug.track || [], ctrl.signal), ctrl.signal);
			const fr = framesOf(sel);
			const trim = await trimLeadingOverscroll(fr.files, sel.header ? sel.header.headerEnd : -1, fr.shift01);
			log('コマ ' + fr.files.length + '枚（人の区切り ' + (sel.persons || []).length + '）' + (trim.dropped ? '・先頭の引っぱりすぎのコマを外した' : '') + (trim.why ? '（空き ' + trim.why.g0 + '／' + trim.why.g1 + '行・ずれ ' + trim.why.shift01 + '）' : ''));
			if (!trim.files.length) { const e = new Error('コマが無い'); e.code = 'too-few'; throw e; }
			// 置き換える（親A の決定 272 と同じ）
			st.files = trim.files.slice();
			st.video = { files: trim.files.slice(), expanded: false, small, kind: capture ? 'capture' : (src.landscape ? 'landscape' : 'portrait'), frames: fr.files.length, dropped: trim.dropped };
			setPng(null);
			if (st.built && st.built.last) st.built.last.width = st.built.last.height = 0;
			st.built = null;
			releaseThumbs();
			if (st.host.onChange) st.host.onChange(st.files.length);
			// 組み立てが終わるまで「完了 100%」のまま残す。組み立ては取り消せないので「取り消す」は押せなくする（親A と同じ）
			renderProgress(2, 1);
			const ab = s.querySelector('[data-sr-act="abort"]');
			if (ab) ab.disabled = true;
			st.vbusy = null;
			await build();
			const pr = s.querySelector('.sr-video-progress');
			if (pr) pr.remove();
			if (capture) s.querySelectorAll('.cap-note').forEach((el) => el.remove());
			render();
			return { ok: true, frames: fr.files.length, dropped: trim.dropped };
		} catch (e) {
			const pr = s.querySelector('.sr-video-progress');
			if (pr) pr.remove();
			if (capture) s.querySelectorAll('.cap-note').forEach((el) => el.remove());
			if (V.isAbortError(e)) {
				if (st.host.toast) st.host.toast(vt('video.toast.cancel'));
				return { ok: false, aborted: true };
			}
			const capKind = capture && e && (e.capFail || { band: 'band', 'too-few': 'toofew' }[e.code]);
			if (!capKind) console.error(e);   // 取り込みの案内で知らせる失敗（窓が小さいなど）は不具合ではない
			log('取り込めませんでした（code=' + (e && e.code) + '）: ' + (e && e.message));
			if (capKind) showCaptureFail(capKind);
			else showVideoError(e);
			return { ok: false, error: capKind || (e && e.code) || 'error' };
		} finally {
			if (src && src !== input && typeof src.close === 'function') { try { src.close(); } catch (e) { /* 閉じられなくてもよい */ } }
			if (capture && input && typeof input.dispose === 'function') input.dispose();
			st.vbusy = null;
			render();
		}
	}
	/* PC のウィンドウの取り込み（親A の startPcCapture と同じ流れ・同じ箱。映像は枠の中に出す〔親A の右の余白へ出す形は使わない〕） */
	async function startCapture() {
		if (st.vbusy || st.busy || !window.UmaVideoFrames || !window.UmaPcCapture) return;
		st.vbusy = { ctrl: new AbortController(), capture: true, step: 0, picking: true };
		let session = null, stopped = false;
		try {
			st.capArea = null;
			session = await UmaPcCapture.begin({
				onTick: capTick,
				onStop: (reason) => { if (stopped) return; stopped = true; Promise.resolve().then(() => captureStopped(session, reason)); }
			});
		} catch (e) {
			st.vbusy = null;
			clearStage();
			// 選ぶのをやめた: 入口に戻す（案内は出さない）
			if (!e || e.name !== 'NotAllowedError') { console.error(e); showVideoError(e); }
			render();
			return;
		}
		st.capSession = session;
		const s = stage();
		s.innerHTML = '<div class="cap-box"><div class="cap-video"><video muted playsinline></video><div class="cap-frame" hidden></div></div><div class="cap-body">'
			+ '<p class="cap-howto">' + esc(t('sr.video.howto1')) + '</p><p class="cap-howto">' + esc(vt('video.howto.step2')) + '</p>'
			+ '<p class="cap-time" hidden><span class="cap-dot" aria-hidden="true"></span><span></span></p>'
			+ '<div class="cap-actions"><button type="button" class="uma-btn uma-btn--primary" data-sr-act="cap-stop">' + esc(vt('video.cap.stop')) + '</button></div></div></div>';
		const m = s.querySelector('video');
		m.srcObject = session.stream;
		m.play().catch(() => { /* 流れなくても取り込みは続く */ });
		render();
	}
	// 見つかったら青い枠と残り時間を出す（親A の renderCaptureTick と同じ）
	function capTick(tk) {
		const s = st.stageEl;
		const vid = s && s.querySelector('.cap-video'), time = s && s.querySelector('.cap-time'), frame = s && s.querySelector('.cap-frame');
		if (!vid || !time || !frame) return;
		const found = !!(tk.area && tk.area.ok && tk.width);
		if (found) st.capArea = tk.area;
		time.hidden = !found;
		frame.hidden = !found;
		if (!found) return;
		const sec = Math.ceil(tk.rest);
		time.lastChild.textContent = vt('video.cap.remain', { t: Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') });
		const bw = vid.clientWidth, bh = vid.clientHeight, q = Math.min(bw / tk.width, bh / tk.height);
		const ox = (bw - tk.width * q) / 2, oy = (bh - tk.height * q) / 2;
		frame.style.left = (ox + tk.area.x * q) + 'px';
		frame.style.top = (oy + tk.area.y * q) + 'px';
		frame.style.width = (tk.area.w * q) + 'px';
		frame.style.height = (tk.area.h * q) + 'px';
	}
	// 止まった: 処理の箱へ（上限のときは上に1行）。処理は動画と同じ runVideo
	function captureStopped(session, reason) {
		st.capSession = null;
		clearStage();
		st.vbusy = null;
		runVideo(session, { capture: true, limit: reason === 'limit' });
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
		st.video = null;   // 画像を足したら動画から来た印を外す（親A の videoTouched と同じ。画はそのまま）
		changed();
	}
	function onClick(e) {
		const el = e.target.closest && e.target.closest('[data-sr-act],[data-sr-remove],[data-sr-cols]');
		if (!el || !st.root.contains(el) || el.disabled) return;
		if (el.hasAttribute('data-sr-remove')) { st.files.splice(Number(el.getAttribute('data-sr-remove')), 1); st.video = null; changed(); return; }
		const act = el.getAttribute('data-sr-act');
		if (act === 'clear') { st.files = []; st.video = null; setPng(null); st.built = null; clearStage(); changed(); return; }
		if (act === 'build') { build(); return; }
		// 動画（T193）。ファイルの選択は押した操作の中で開く（iPhone の Safari は操作の外からは開かない）
		if (act === 'video') { const input = st.root.querySelector('[data-sr-video-input]'); if (input && !st.vbusy && !st.busy) { input.value = ''; input.click(); } return; }
		if (act === 'capture') { startCapture(); return; }
		if (act === 'abort') { if (st.vbusy && st.vbusy.ctrl) st.vbusy.ctrl.abort(); return; }
		if (act === 'cap-stop') { if (st.capSession) st.capSession.stop('stop'); return; }
		if (act === 'vtile') { if (st.video) st.video.expanded = true; render(); return; }
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
		'.sr-panel{border:1px solid transparent;background:var(--uma-surface);border-radius:var(--uma-r-tool);padding:16px;display:flex;flex-direction:column;gap:10px}',
		'.sr-lead{font-size:12px;line-height:1.6;color:var(--uma-text-muted);margin:0}',
		'.sr-pick-row{display:flex;align-items:center;gap:12px}',
		'.sr-pick{cursor:pointer}',
		'.sr-clear{font-size:11px;color:var(--uma-text-subtle);text-decoration:underline;text-underline-offset:2px;background:none;border:0;cursor:pointer;padding:8px 4px}',
		'.sr-thumbs{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}',
		'.sr-thumb{position:relative;flex:0 0 auto;width:60px;height:104px;border:1px solid var(--uma-border);border-radius:var(--uma-r-tool);overflow:hidden;background:var(--uma-surface-muted)}',
		'.sr-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
		'.sr-thumb-no{position:absolute;left:3px;bottom:3px;min-width:18px;height:18px;border-radius:0;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px}',
		'.sr-thumb-x{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:11px;border:0;background:rgba(0,0,0,.6);color:#fff;font-size:13px;line-height:1;cursor:pointer}',
		// 本育成結果用の「結合画像の設定」（804）。値は special.html・exam.html の .stitch-show・.stitch-cols・.stitch-show-item と同じ
		'.sr-show{padding:var(--uma-sp-3);border:1px solid transparent;border-radius:var(--uma-r-tool);background:var(--uma-surface-muted);text-align:left}',
		'.sr-show-title{margin:0 0 var(--uma-sp-1-5);font-size:var(--uma-fs-xs);line-height:var(--uma-lh-xs);font-weight:700;color:var(--uma-text-heading);display:flex;align-items:center;gap:var(--uma-sp-1-5)}',
		'.sr-show-title svg{width:14px;height:14px;color:var(--uma-stitch-accent)}',
		'.sr-cols{display:grid;grid-template-columns:1fr 1fr;margin:0 0 var(--uma-sp-1-5);border:1px solid var(--uma-border-strong);border-radius:var(--uma-r-tool);overflow:hidden}',
		'.sr-cols-btn{min-height:40px;border:0;background:var(--uma-surface);color:var(--uma-text-heading);font:inherit;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}',
		'.sr-cols-btn+.sr-cols-btn{border-left:1px solid var(--uma-border-strong)}',
		'.sr-cols-btn:focus-visible{outline:2px solid var(--uma-focus-ring);outline-offset:-2px}',
		'.sr-cols-btn[aria-pressed="true"]{background:var(--uma-surface-inverse);color:var(--uma-text-inverse)}',
		'.sr-cols-btn:disabled{opacity:1;color:var(--uma-off);background:var(--uma-off-bg);cursor:default}',
		'.sr-cols-btn i{display:inline-flex;gap:2px}',
		'.sr-cols-btn i b{display:block;width:5px;height:12px;border-radius:1px;background:currentColor}',
		'.sr-cols-btn i b.is-wide{width:12px}',
		'.sr-show-list{display:flex;flex-direction:column;gap:var(--uma-sp-0-5)}',
		'.sr-show-item{display:flex;align-items:flex-start;gap:var(--uma-sp-2);padding:var(--uma-sp-1) var(--uma-sp-1-5);border-radius:var(--uma-r-tool);font-size:var(--uma-fs-xs);line-height:var(--uma-lh-xs);font-weight:600;color:var(--uma-text-heading);cursor:pointer;transition:background-color var(--uma-transition)}',
		'.sr-show-item:hover{background:var(--uma-surface)}',
		'.sr-show-item.is-off{opacity:1;color:var(--uma-off);cursor:not-allowed}',
		'.sr-show-check{flex-shrink:0;width:1rem;height:1rem;margin-top:1px;accent-color:var(--uma-control-mark);cursor:pointer}',
		'.sr-show-item.is-off .sr-show-check{cursor:not-allowed}',
		'.sr-show-sub{margin-left:var(--uma-sp-2);font-weight:400;color:var(--uma-text-subtle)}',
		'.sr-note{margin:0;font-size:11px;color:var(--uma-text-muted);text-align:center}',
		'.sr-result-block{display:flex;flex-direction:column;gap:8px;margin-top:4px}',
		'.sr-result-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
		'.sr-result-title{margin:0;font-size:12px;font-weight:700;color:var(--uma-text-heading)}',
		'.sr-img{width:100%;border:1px solid var(--uma-border);border-radius:var(--uma-r-tool);display:block}',
		'.sr-warn{border:1px solid var(--uma-warn-border);background:var(--uma-warn-bg);color:var(--uma-warn-text);border-radius:var(--uma-r-tool);padding:10px 12px;font-size:11px;line-height:1.6}',
		'.sr-warn p{margin:0}.sr-warn-head{font-weight:700;margin-bottom:2px!important}',
		'.sr-fail{border:1px solid var(--uma-danger-border);background:var(--uma-danger-bg);color:var(--uma-danger-text);border-radius:var(--uma-r-tool);padding:10px 12px;font-size:12px}',
		// 動画（T193）: 入口はページの「静止画｜動画」（body の data-upload-mode）で出し分ける。ボタンの見た目はページの .video-pick-btn・.video-capture-btn（親A と同じ）
		'.sr-lead-video,.sr-video-row{display:none}',
		'body[data-upload-mode="video"] .sr-lead-video{display:block}',
		'body[data-upload-mode="video"] .sr-lead-shot{display:none}',
		'body[data-upload-mode="video"] .sr-video-row{display:flex}',
		'body[data-upload-mode="video"] .sr-pick{display:none}',
		'body[data-upload-mode="video"] .sr-pick-row:not(:has(.sr-clear)){display:none}',
		'.sr-video-row .video-pick-btn,.sr-video-row .video-capture-btn{margin:0}',
		'.sr-panel.sr-cap-on .sr-video-row{display:none}',
		'.sr-video-stage{display:flex;flex-direction:column;gap:8px}',
		'.sr-video-stage:empty{display:none}',
		'.sr-video-stage .cap-box,.sr-video-stage .cap-fail,.sr-video-stage .cap-note{margin:0}',
		'.sr-thumbs .video-tile{flex:1 1 auto}',
	].join('\n');
	function injectStyle() {
		if (document.getElementById('sr-style')) return;
		const s = document.createElement('style');
		s.id = 'sr-style';
		s.textContent = SR_CSS;
		document.head.appendChild(s);
	}
	/** host = { stitchOnePerson(files, label), attachSaveName(link), toast(text), onChange(n), storageKey（設定を覚える localStorage のキー。ページごと）,
	 *          video（T193。無ければ動画の入口を出さない）: { text(key, vars)〔ページの videoText〕, svg, svgWindow, svgSpin, svgTri(cls), captureOffered() },
	 *          log(line)（開発ログ。無くてもよい） } */
	function mount(root, host) {
		injectStyle();
		st.root = root;
		st.host = host || {};
		loadSettings();
		root.addEventListener('click', onClick);
		root.addEventListener('change', (e) => {
			if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-sr-input')) { addFiles(e.target.files); e.target.value = ''; return; }
			if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-sr-video-input')) {
				const f = e.target.files && e.target.files[0];
				e.target.value = '';
				if (f) runVideo(f);   // 選ばずに戻った（0本）: 何もしない（親A と同じ）
				return;
			}
			if (e.target && e.target.getAttribute && e.target.getAttribute('data-sr-opt') === 'count') { st.withCount = !!e.target.checked; settingChanged(); }
		});
		render();
	}

	window.UmaSkillResult = Object.freeze({
		version: SKILL_RESULT_JS_VERSION, texts: SR_TEXTS,
		mount, prepareParts, compose, countSkills, modalBand, eraseScrollThumb, findRowGap, headLayout, drawSkillCard, cardMetrics, reviewSeamWarnings, judgeSeam,
		trimLeadingOverscroll, listTopGap, framesOf, runVideo,
		// タブの枚数。動画から取った画は数えない（親A の personShownCount と同じ。T193）
		count: () => st.video ? st.files.filter((f) => !st.video.files.includes(f)).length : st.files.length,
		busy: () => !!(st.vbusy || st.busy),
		files: () => st.files.slice(),
		// 検査用: 今の状態（URL・形・作ったか）
		peek: () => ({ files: st.files.length, cols: st.cols, withCount: st.withCount, built: !!st.built, url: st.png ? st.png.url : null,
			thumbs: Array.from(st.thumbs.values()).map((x) => x.url), counts: st.built ? st.built.counts : null, sr: st.built && st.built.last ? st.built.last._sr : null,
			warnings: st.built ? (st.built.warnings || []).slice() : [], seamReview: st.built ? st.built.seamReview || [] : [],
			video: st.video ? { frames: st.video.frames, used: st.video.files.length, dropped: st.video.dropped, small: st.video.small, kind: st.video.kind, expanded: st.video.expanded } : null,
			vbusy: !!st.vbusy }),
		addFiles, build
	});
})();
