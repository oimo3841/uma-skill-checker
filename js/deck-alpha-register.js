/* js/deck-alpha-register.js — 新しい Deck の α版（T88・C-275）の登録の画面（UmaStar の OCR から送ったとき）。
 * モック版13（lab/deck-v13/deck-v13-register.js）の見た目と動きをそのまま移し、仮の OCR の結果の代わりに、UmaStar から送られたデータ（受け取りの口）を読む。
 *
 * ■ 受け取りの口（段4 の 4-2 で UmaStar が書く。C-275 の 1）
 *   UmaStar は localStorage の 'umaDeck:send' に下の JSON を書いてから、このページ（deck-alpha-register.html）を開く。
 *   このページは開いたときに読み、登録できたら消す（登録せずに閉じたら残るので、開き直すと同じ内容で出る。次に送ると上書き）。
 *   { format: 'uma-deck-send', v: 1, sentAt: ISO の日時, from: 'star',
 *     race: UmaStar で今選んでいるレースの id（data/upcoming-races.json の id。無ければ null）,
 *     style: ①の脚質（nige|senko|sashi|oikomi か null。親の脚質の札の初期値）,
 *     send: ②のスキルの一覧（スキルの id の配列。レースのセットへ送るときに前の一覧と OR で足す）,
 *     owner: 'self'|'friend'（省略は 'self'）,
 *     persons: [ 親A, 祖A1, 祖A2 ]（1人か3人。3人なら「親Aセット」を選べる）
 *       各人 = { uma: 衣装の id か null, green: [固有スキル名か null, ★（-1 は★不明）] か null, greenCands: [固有スキル名…] か null（衣装を決められないときの候補）,
 *               blue: [speed|stamina|power|guts|wit, ★] か null, red: [芝・距離・脚質の鍵, ★] か null, skills: { スキルの id: ★ }, genes: { 'ap-…': ★ } } }
 *   ★不明は -1、読めなかった因子は null（T73 の形）。uma が無くても green の固有スキル名から衣装を引く。
 *   T92（段4 の 4-2）: UmaStar（special.html の sendToDeckAlpha）がこの形で書く。uma は null（blue・red は下の T116）、green は③の画像の緑因子の読み取り
 *   （名前が決まらなければ [null, ★] と greenCands、緑因子の欄が見つからなければ null）。owner は 'self'（持ち主はこの画面で選ぶ）。
 *   T92-1: blue・red の null は「読んでいない」として、閉じた状態で出し（因子の行は「—」）、「要確認」にも入れない。
 *   読もうとして決まらなかったものは [null, ★] で送れば、今までどおり開いて「読めなかった」を出す。
 *   T116（2026-11-07）: UmaStar も blue・red を読んで送る（読み方は UmaExam と同じ）。いちばん上の段が写っていない入力は null、段があって名前が決まらなければ [null, ★]。
 *   T104（2026-11-05・C-296）: UmaExam からは from: 'exam'・send: 133種の id・race と style は null・blue と red は読めた値（読めなければ [null, ★]）・
 *   persons[].sheet: { めろっぷの行で id の無い行の名前: ★ } を足して送る。セットは「技能試験（133種）」で固定・親Aにも「登録済みの〇〇と同一」を出す（234）。
 *   T115（2026-11-06・356〜363）: 右上にツール切り替えとライト／ダーク（Deck の本体と同じ。登録の前も後も）。UmaStar から送ったときも親Aに「同一」の候補を出す（UmaExam の 234 と同じ）。
 *   全部同じ親がいれば先頭（いちばん新しく登録した親）を「同一」に選んだ状態で出す。親Aを「同一」にして登録すると新しい親を作らず、読み取りの値を足し、送り先のセットに入れる。
 *   T126（2026-11-08・決定 418）: 各人に img: { slot, token } か null を足す（人ごとの結合画像の印。画像そのものは js/deck-alpha-images.js の別の IndexedDB）。
 *   slot で読み、書いてある token が印と同じときだけ出す。無ければ「結合画像はありません」。
 *
 * ■ T126（2026-11-08・決定 412〜418・512）: 画面の作り直し（T119 のモック lab/deck-register-mock.js の形）
 *   ①に「送る・持ち主・セット・脚質・スキル」と大きめの「登録する」（PC は右に 280×72px・スマホは①の先頭に幅いっぱい）。下の帯は無くした（414）。
 *   ②は親A／祖A1／祖A2 のタブ。タブの中は左に衣装の見出し・同一の候補・青赤緑の1行・白スキルと遺伝子を同じ形で並べた一覧（既定で開く。★の帯をスキル名に寄せる）、
 *   右に（PC）その人の結合画像（幅は最大 560px、画面の幅 1600px 以上では 640px）。スマホはタブの下の「読み取り結果｜結合画像」で切り替える（413・案B）。
 *   「同一」を選んだ人も一覧と画像を残す（415）。祖は読み取りの値を保存しないので押せない（見るだけ）。親Aは足すので押せる（T119 のモックのとおり）。
 *   遺伝子の名前は「〜の遺伝子」のまま（416）。遺伝子の★もこの画面で直せる（417）。
 *
 * 以下は版13 の説明。
 * 考え方: 確かめる所を最小にする。読めて決まったものは1行にたたみ（青・赤・緑の因子は1行の3つのボタン。C-272 の 8）、押すと直す形に入る（9）。
 * 決められなかった所（衣装の候補・★不明・読めなかった因子・祖が登録済みの親と同一か）だけを開いて「要確認」の数を上に出す。
 * ★不明のまま登録してもよい（Deck では「?」）。親Aの衣装だけは決めないと登録できない。
 * 送り先のレース/周回セットは、UmaStar で今選んでいるレースが初期値。「デフォルト」（T108 で「指定なし」から改名）でも登録できる（C-271 の 5）。T108: UmaStar が「レース指定なし／本育成編成なし」のとき（送る形の noPlan: true）は、独立したまとまり（'norace'）が初期値。
 * レースのセットへ送るときは、UmaStar の②のスキルの一覧を一緒に入れる（前の一覧と OR。C-271 の 3）。T97（140）から「デフォルト」へ送るときも「デフォルト」の一覧へ入れる。①の脚質はセットに記録しない（C-272 の 1・2）。
 * 「脚質」の欄は親の脚質の札（その親を何の脚質で育てたか。C-272 の 2）。初期値は UmaStar の①の脚質（版10 のまま）。
 * 祖の紐づけ（C-272 の 13〜15）: 同じ衣装の登録済みの親を候補にし、候補ごとに「登録済みの〇〇と同一」の行。「同一」か「新規登録」を選ぶ。
 * 衣装・白スキル・★が全部同じ親がいれば、先頭（いちばん新しく登録した親）を「同一」に選んだ状態で出す（押し直せる。T115・359）。
 */
(function () {
	'use strict';
	const DECK_ALPHA_REGISTER_JS_VERSION = '2026-11-08a';
	const K = window.DeckAlpha;
	const IMG = window.UmaDeckImages || null; // 人ごとの結合画像（js/deck-alpha-images.js。読めなくても画像が出ないだけ）
	const $ = (s) => document.querySelector(s);
	const Q = new URLSearchParams(location.search);
	const INBOX = 'umaDeck:send';
	// 画面の新しい文（決定 512 のまま）
	const TEXT = { read: '読み取り結果', image: '結合画像', noImage: '結合画像はありません', zoom: '結合画像を大きく見る' };
	// tab: 開いているタブ（0＝親A）。pane: スマホの「読み取り結果｜結合画像」。images[i]: undefined＝読み込み中・null＝無い・文字列＝object URL
	const S = { doc: null, settings: null, ocr: null, scope: 'one', setKey: 'none', styles: [], owner: 'self', persons: [], done: null, tab: 0, pane: 'read', images: [] };
	const phoneMq = matchMedia('(max-width: 899px)');
	const isPhone = () => phoneMq.matches;

	async function init() {
		const th = Q.get('theme');
		let loaded;
		try { loaded = await K.store.load(); } catch (e) { $('#body').innerHTML = '<div class="empty"><span>この端末では保存が使えません（' + K.esc(e.message) + '）</span></div>'; return; }
		S.settings = Object.assign({}, K.DEFAULT_SETTINGS, loaded.meta.settings || {});
		// 色は js/theme.js（ほかのツールと同じ設定）が <head> で付けてある（T92）。?theme= のときだけ上書きする（撮影用）
		if (th === 'light' || th === 'dark') K.applyTheme(th);
		S.doc = K.assemble(loaded);
		const ar = K.archiveEnded(S.doc);
		if (ar.moved.length) { await K.store.putParents(ar.changed); await K.store.putHead(S.doc); }
		S.ocr = readInbox(); S.exam = !!S.ocr && S.ocr.from === 'exam';
		$('#fromLabel').textContent = !S.ocr ? '' : S.exam ? 'UmaExam から' : 'UmaStar から';
		window.__deckAlphaRegister = { version: DECK_ALPHA_REGISTER_JS_VERSION, S, K, INBOX };
		if (!S.ocr) { renderNone(); return; }
		S.scope = S.ocr.persons.length >= 3 ? 'fam' : 'one';
		S.owner = S.ocr.owner === 'friend' ? 'friend' : 'self';
		// UmaStar で今選んでいるレース（一覧に無ければ「デフォルト」。新しいモードは独立したまとまり。T108）と、親の脚質の札の初期値（①の脚質）
		const live = K.activeRaces();
		S.setKey = S.exam ? 'exam' : S.ocr.noPlan ? 'norace' : S.ocr.race && live.some((r) => r.id === S.ocr.race) ? 'r:' + S.ocr.race : 'none';
		S.styles = S.ocr.style && K.STYLE[S.ocr.style] ? [S.ocr.style] : [];
		S.persons = S.ocr.persons.map((o, i) => prepPerson(o, i));
		S.images = S.persons.map(() => undefined);
		render();
		phoneMq.addEventListener('change', render);
		loadImages();
	}

	/* ---------- 人ごとの結合画像（決定 418）。印（img）と同じ token の記録だけ出す ---------- */
	async function loadImages() {
		if (IMG) IMG.sweep();
		// 結合した直後に送ると、書き終わる前に開くことがあるので、少し待って読み直す（合わせて約3秒）
		for (let tries = 0; tries < 6; tries++) {
			let waiting = false;
			for (let i = 0; i < S.persons.length; i++) {
				if (S.images[i] !== undefined) continue;
				const mark = S.ocr.persons[i].img;
				if (!IMG || !mark) { S.images[i] = null; continue; }
				const rec = await IMG.load(mark.slot);
				if (rec && rec.token === mark.token && rec.blob) S.images[i] = URL.createObjectURL(rec.blob);
				else if (tries === 5) S.images[i] = null;
				else waiting = true;
			}
			if (!S.done) render();
			if (!waiting) return;
			await new Promise((r) => setTimeout(r, 500));
		}
	}

	/* ---------- 受け取りの口（上の説明の形）。形が崩れていれば null（「送られた親がありません」を出す） ---------- */
	function readInbox() {
		let j = null;
		try { j = JSON.parse(localStorage.getItem(INBOX) || 'null'); } catch (e) { return null; }
		if (!j || j.format !== 'uma-deck-send' || !Array.isArray(j.persons) || !j.persons.length) return null;
		const pair = (a) => (Array.isArray(a) && a.length === 2 ? [a[0] == null ? null : String(a[0]), typeof a[1] === 'number' ? a[1] : -1] : null);
		const stars = (o) => { const r = {}; if (o && typeof o === 'object') Object.keys(o).forEach((k) => { if (typeof o[k] === 'number') r[k] = o[k]; }); return r; };
		const img = (a) => (a && typeof a === 'object' && typeof a.slot === 'string' && typeof a.token === 'string' ? { slot: a.slot, token: a.token } : null);
		const person = (o) => ({ uma: o && o.uma && K.costume(o.uma) ? o.uma : null, green: pair(o && o.green), greenCands: o && Array.isArray(o.greenCands) && o.greenCands.length ? o.greenCands.map(String) : null,
			blue: pair(o && o.blue), red: pair(o && o.red), skills: stars(o && o.skills), genes: stars(o && o.genes), sheet: stars(o && o.sheet), img: img(o && o.img) });
		return { from: j.from === 'exam' ? 'exam' : 'star', race: j.race || null, noPlan: j.noPlan === true, style: j.style || null, send: Array.isArray(j.send) ? j.send.map(String) : [], owner: j.owner, sentAt: j.sentAt || null, persons: j.persons.slice(0, 3).map(person) };
	}
	function renderNone() {
		$('#body').innerHTML = '<section class="card"><p class="small muted">送られた親がありません。UmaStar か UmaExam の OCR の結果から送ってください。</p><div class="row"><a class="btn pri" href="deck-alpha.html" style="flex:1">Deck (αテスト)を開く</a></div></section>';
		$('#needTop').hidden = true;
	}
	function prepPerson(o, i) {
		// 白スキルと遺伝子の一覧は既定で開く（要望 (2)。T126）
		const p = { role: K.POS[i], sheet: o.sheet, uma: o.uma, greenStar: o.green ? o.green[1] : null, greenCands: o.greenCands, blue: o.blue ? o.blue.slice() : null, red: o.red ? o.red.slice() : null, skills: Object.assign({}, o.skills), genes: Object.assign({}, o.genes), open: { sk: true }, link: null, linkMode: null, cands: [] };
		if (!p.uma && o.green && o.green[0]) p.uma = K.UNIQ.get(o.green[0]) || null;
		// 読めなかった・★不明の青赤緑は、最初から直す形で開いておく（衣装が決められない緑は、候補を並べるので開かない）。
		// 読んでいない青赤（null）は閉じたまま（T92-1）
		['blue', 'red'].forEach((k) => { if (p[k] && (!p[k][0] || p[k][1] < 0)) p.open[k] = true; });
		if (p.uma && p.greenStar != null && p.greenStar < 0) p.open.green = true;
		refreshCands(p); // 親Aにも「登録済みの〇〇と同一」を出す（UmaExam は 234・UmaStar は T115・363）
		return p;
	}
	/** 親と祖の候補（同じ衣装の登録済みの親）を引き直す。全部同じ親がいれば先頭（いちばん新しく登録した親）を「同一」を選んだ状態にする（まだ選んでいないときだけ。T115・359） */
	function refreshCands(p) {
		p.cands = K.matchCandidates(S.doc, p);
		if (p.link && !p.cands.some((c) => c.p.id === p.link)) { p.link = null; p.linkMode = null; }
		if (!p.linkMode) { const ex = p.cands.find((c) => c.exact); if (ex) { p.link = ex.p.id; p.linkMode = 'auto'; } }
	}

	/* ---------- 要確認の数 ---------- */
	function issues(p) {
		const a = [];
		if (p.link) return a; // 登録済みの親と同一にしたときは確かめる所が無い（祖は読み取りの値を保存しない。親Aは読み取りの値を足す）
		if (!p.uma) a.push('衣装');
		// 読んでいない青赤（null）は数えない（T92-1）
		if (p.blue && !p.blue[0]) a.push('青'); else if (p.blue && p.blue[1] < 0) a.push('青の★');
		if (p.red && !p.red[0]) a.push('赤'); else if (p.red && p.red[1] < 0) a.push('赤の★');
		if (p.greenStar != null && p.greenStar < 0) a.push('緑の★');
		const unk = Object.values(p.skills).filter((v) => v < 0).length; if (unk) a.push('★不明' + unk);
		if (p.cands.length && !p.link && p.linkMode !== 'none') a.push('紐づけ');
		return a;
	}
	function activePersons() { return S.scope === 'fam' ? S.persons : S.persons.slice(0, 1); }

	/* ---------- 描画（T126: T119 のモックの形。①の欄＋②のタブ） ---------- */
	const isOn = (i) => S.scope === 'fam' || i === 0;
	/** ★の帯。ro は押せない（「同一」を選んだ祖は見るだけ。決定 415） */
	function starSeg(cur, allowUnknown, ro) {
		const opts = [[1, '★1'], [2, '★2'], [3, '★3']].concat(allowUnknown ? [[-1, '?']] : []);
		return '<span class="stars" role="group">' + opts.map(([v, t]) => '<button type="button" data-star="' + v + '" aria-pressed="' + (cur === v) + '"' + (ro ? ' disabled' : '') + '>' + t + '</button>').join('') + '</span>';
	}
	/** 因子の種類（1つだけ選ぶ）は1本につながった帯、脚質（複数選べる）は角の四角い札（C-273 の 13・14） */
	function kindChips(map, cur, attr) {
		const ent = Object.entries(map);
		if (attr === 'data-style') return '<span class="tags">' + ent.map(([v, t]) => '<button class="tag" type="button" ' + attr + '="' + v + '" aria-pressed="false">' + t + '</button>').join('') + '</span>';
		return '<span class="seg sm' + (ent.length > 5 ? ' wrap' : '') + '" role="group">' + ent.map(([v, t]) => '<button type="button" ' + attr + '="' + v + '" aria-pressed="' + (cur === v) + '">' + t + '</button>').join('') + '</span>';
	}
	/** 衣装の表記（二つ名を小さめに、キャラ名と改行。UmaStar の①と似た配置。C-272 の 16） */
	function cosHtml(uma) { const c = uma && K.costume(uma); return '<span class="cos">' + (c ? '<span class="ttl">［' + K.esc(c.title) + '］</span><span class="chara">' + K.esc(c.chara) + '</span>' : '<span class="chara">？</span>') + '</span>'; }
	function smallBtn(act, i, text) { return '<button class="btn" type="button" data-act="' + act + '" data-i="' + i + '" style="min-height:32px;padding:0 8px;font-size:12px">' + text + '</button>'; }
	function codeOf(p) { const dup = S.doc.parents.filter((x) => x.date === p.date).length; return p.date.slice(5).replace('-', '/') + (dup > 1 ? '-' + p.no : ''); }
	function costumeOptions(sel) { const list = K.D.costumes.slice().sort((a, b) => (a.chara + a.title).localeCompare(b.chara + b.title, 'ja')); return '<option value="">（選ぶ）</option>' + list.map((c) => '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + K.esc(c.chara + '［' + c.title + '］') + '</option>').join(''); }
	function curSet() { return S.exam ? K.findSet(S.doc, 'exam') : S.setKey === 'none' ? null : S.setKey === 'norace' ? K.findSet(S.doc, 'norace') : (S.doc.sets.find((x) => x.id === S.setKey) || K.newRaceSet(K.RACES.get(S.setKey.slice(2)))); }

	/* ---------- ① の欄（要望 (3)。「登録する」はほかのボタンより大きく、①の中に置く。下の帯は無くした＝決定 414） ---------- */
	function topCard() {
		const setNow = curSet();
		// 「デフォルト」へ送るときも②の一覧を「デフォルト」の一覧に足す（T97・140）。前の一覧の数は「デフォルト」の一覧から
		const into = setNow || S.doc.none || null;
		const sendN = S.ocr.send.length, had = into && into.sends ? Object.keys(into.skills).length : 0;
		const noFam = S.ocr.persons.length < 3;
		const scopeLine = '<div class="line"><span class="k">送る</span><span class="seg" role="group" id="scopeSeg"><button type="button" data-scope="one" aria-pressed="' + (S.scope === 'one') + '">親Aだけ</button><button type="button" data-scope="fam" aria-pressed="' + (S.scope === 'fam') + '"' + (noFam ? ' disabled class="strike"' : '') + '>親Aセット</button></span></div>';
		const ownerLine = '<div class="line"><span class="k">持ち主</span><span class="seg" role="group"><button type="button" data-owner="self" aria-pressed="' + (S.owner === 'self') + '">自分</button><button type="button" data-owner="friend" aria-pressed="' + (S.owner === 'friend') + '">フレンド</button></span></div>';
		// UmaExam から: セットは「技能試験」だけ（97・100）。スキルの一覧は133種で決まっているので行を出さず、脚質の札も出さない
		const lines = '<div class="linepair">' + scopeLine + ownerLine + '</div>' + (S.exam
			? '<div class="line"><span class="k">セット</span><span>技能試験<span class="muted small">（133種）</span></span></div>'
			: '<div class="line"><span class="k">セット</span><button class="rsel" type="button" id="setPick" aria-haspopup="dialog" aria-label="レース/周回セット：' + K.esc(K.setName(setNow)) + '" style="flex:1;justify-content:space-between;margin-left:0"><span class="t">' + K.esc(K.setName(setNow)) + '</span><span class="car" aria-hidden="true">▾</span></button></div>' +
				'<div class="line"><span class="k">脚質</span>' + kindChips(K.STYLE, null, 'data-style') + '</div>' +
				(sendN ? '<div class="line"><span class="k">スキル</span><span>②の' + sendN + '種' + (had ? '<span class="muted small">（前の一覧 ' + had + '種に足す）</span>' : '') + '</span></div>' : ''));
		const all = activePersons().flatMap(issues);
		// 親Aの衣装が決まっていなくても、登録済みの親と「同一」を選べば登録できる（新しい親を作らない）
		const can = !!(S.persons[0].uma || S.persons[0].link);
		// 「?」のまま残るものがあるときだけ後ろの文を付ける（紐づけの選び残しは「?」にならない。T115・361）。狭い画面では「・★不明…」の前で折り返す
		const unknown = all.some((t) => t !== '紐づけ');
		const sum = can ? '<span>' + (S.scope === 'fam' ? '親Aセット（3人）を登録' : '親Aだけ（1人）を登録') + '</span>' + (unknown ? '<span>・★不明などは「?」のまま</span>' : '') : '親Aの衣装を決めると登録できます';
		const act = '<div class="regact"><button class="btn pri regbig" type="button" id="regBtn"' + (can ? '' : ' disabled') + '>登録する</button><span class="sum" id="regSum">' + sum + '</span></div>';
		return '<section class="card regtop"><div class="regtop-grid"><div class="reglines">' + lines + '</div>' + act + '</div></section>';
	}

	/* ---------- ② の欄：親A／祖A1／祖A2 のタブ（要望 (2)）。3人とも描き、開いていないタブは隠す（画像は開いているタブの人だけ） ---------- */
	function tabButtons() {
		return S.persons.map((p, i) => {
			const iss = isOn(i) ? issues(p) : [];
			const mark = !isOn(i) ? '<span class="ts">送らない</span>' : iss.length ? '<span class="tn" title="要確認 ' + K.esc(iss.join('・')) + '">要確認 ' + iss.length + '</span>' : '';
			return '<button type="button" role="tab" id="ptab' + i + '" aria-controls="ppanel' + i + '" data-tab="' + i + '" aria-selected="' + (S.tab === i) + '" aria-pressed="' + (S.tab === i) + '">' + p.role + mark + '</button>';
		}).join('');
	}
	function tabsCard() {
		// スマホ（決定 413・案B）: タブの下に「読み取り結果｜結合画像」。タブの帯と一緒に上に止める。送らない人のタブでは出さない
		const sub = isPhone() && isOn(S.tab)
			? '<span class="seg subrow" role="group"><button type="button" data-pane="read" aria-pressed="' + (S.pane === 'read') + '">' + TEXT.read + '</button><button type="button" data-pane="image" aria-pressed="' + (S.pane === 'image') + '">' + TEXT.image + '</button></span>' : '';
		return '<section class="card ptabcard"><div class="ptabs"><span class="seg ptabrow" role="tablist">' + tabButtons() + '</span>' + sub + '</div>' +
			S.persons.map((p, i) => '<div class="ppanel" role="tabpanel" id="ppanel' + i + '" aria-labelledby="ptab' + i + '" data-p="' + i + '"' + (S.tab === i ? '' : ' hidden') + '>' + panel(p, i) + '</div>').join('') + '</section>';
	}
	function imageBox(i) {
		const src = S.images[i];
		if (src === undefined) return '<div class="pimg wait"></div>'; // 読み込み中（文は出さない）
		if (!src) return '<div class="pimg none small muted">' + TEXT.noImage + '</div>';
		return '<div class="pimg"><button class="pimgbtn" type="button" data-zoom="' + i + '" aria-label="' + TEXT.zoom + '"><img src="' + src + '" alt="" /></button></div>';
	}
	function panel(p, i) {
		const on = isOn(i);
		const iss = on ? issues(p) : [];
		const head = '<div class="phead"><h2>' + cosHtml(p.uma) + (iss.length ? '<span class="need">要確認 ' + iss.join('・') + '</span>' : (on ? '' : '<span class="muted small">送らない</span>')) + '</h2></div>';
		if (!on) return head;
		const active = S.tab === i;
		if (isPhone() && active && S.pane === 'image') return head + imageBox(i);
		const left = '<div class="pleft">' + head + linkRows(p, i) + factorPart(p, i) + listPart(p, i) + '</div>';
		if (isPhone()) return '<div class="pgrid">' + left + '</div>';
		return '<div class="pgrid">' + left + '<div class="pimgwrap">' + (active ? imageBox(i) : '') + '</div></div>';
	}
	/** 祖の紐づけ（候補ごとに「登録済みの〇〇と同一」の行。「同一」か「新規登録」。C-272 の 13〜15） */
	function linkRows(p, i) {
		if (!p.cands.length) return '';
		return '<div class="links">' + p.cands.map((c) => '<div class="lrow"><span class="lt">登録済みの <button class="namebtn" type="button" data-view="' + c.p.id + '" aria-label="登録済みの ' + K.esc(K.fullName(c.p.uma)) + ' のデータを見る">' + K.esc(K.fullName(c.p.uma)) + '</button> <span class="muted small mono">' + K.esc(codeOf(c.p)) + '</span>' + (c.p.owner === 'friend' ? '<span class="muted small">・フレンド</span>' : '') + ' と同一</span><button class="btn" type="button" data-link="' + c.p.id + '" data-i="' + i + '" aria-pressed="' + (p.link === c.p.id) + '">同一</button></div>').join('') +
			'<div class="lrow"><span class="lt"></span><button class="btn" type="button" data-nolink="' + i + '" aria-pressed="' + (p.linkMode === 'none') + '">新規登録</button></div></div>';
	}
	/** 祖を「同一」にしたときは読み取りの値を保存しないので、見るだけ（押せない）にする。親Aは足すので押せる（決定 415・T119 のモック） */
	const readOnly = (p, i) => !!p.link && i > 0;
	function factorPart(p, i) {
		const ro = readOnly(p, i);
		// 因子の行（青・赤・緑の順で1行。押すと直す形に入る。C-272 の 8・9）
		const fzBtn = (kind, cls, text, need, title) => '<button class="fz ' + cls + (need ? ' need' : '') + '" type="button" data-act="toggle-' + kind + '" data-i="' + i + '" aria-pressed="' + !!p.open[kind] + '"' + (ro ? ' disabled' : '') + ' title="' + title + '" aria-label="' + title + '：' + K.esc(text) + '">' + K.esc(text) + '</button>';
		const blueT = p.blue && p.blue[0] ? K.BLUE[p.blue[0]] + ' ' + K.starText(p.blue[1]) : p.blue ? '読めなかった' : K.blueText(null);
		const redT = p.red && p.red[0] ? K.RED[p.red[0]] + ' ' + K.starText(p.red[1]) : p.red ? '読めなかった' : K.redText(null);
		const greenT = (p.uma ? K.uniqName(p.uma) : '？') + ' ' + K.starText(p.greenStar);
		const line = '<div class="line fzline"><span class="fzrow" role="group" aria-label="因子">' +
			fzBtn('blue', 'b', blueT, !!p.blue && (!p.blue[0] || p.blue[1] < 0), '青因子') + fzBtn('red', 'r', redT, !!p.red && (!p.red[0] || p.red[1] < 0), '赤因子') +
			fzBtn('green', 'g', greenT, !p.uma || (p.greenStar != null && p.greenStar < 0), '緑因子') + '</span></div>';
		if (ro) return line;
		// 直す形（青・赤: 種類と★。緑: 衣装と★）
		const kindForm = (kind, map) => { const val = p[kind]; if (!p.open[kind]) return '';
			return '<div class="line edit"><span class="k"></span>' + (val && val[0] ? '' : '<span class="need">読めなかった</span>') + kindChips(map, val ? val[0] : null, 'data-' + kind) + '</div>' +
				'<div class="line edit"><span class="k"></span>' + starSeg(val ? val[1] : null, true).replace('role="group"', 'role="group" data-' + kind + 'star="' + i + '"') + (val && val[1] < 0 ? '<span class="need">★不明</span>' : '') + smallBtn('close-' + kind, i, '閉じる') + '</div>'; };
		const greenForm = p.open.green ? '<div class="line edit"><span class="k"></span><select class="sel" data-umasel="' + i + '" aria-label="衣装" style="flex:1;min-width:0">' + costumeOptions(p.uma) + '</select></div>' +
			'<div class="line edit"><span class="k"></span>' + starSeg(p.greenStar, true).replace('role="group"', 'role="group" data-gstar="' + i + '"') + (p.greenStar != null && p.greenStar < 0 ? '<span class="need">★不明</span>' : '') + smallBtn('close-green', i, '閉じる') + '</div>' : '';
		const cands = !p.uma && p.greenCands ? '<div class="line"><span class="k"></span><span class="need">緑因子が決められない</span></div><div class="cands">' + p.greenCands.map((n) => '<button class="cand" type="button" data-cand="' + K.esc(n) + '" data-i="' + i + '">' + cosHtml(K.UNIQ.get(n)) + '<span class="sc">' + K.esc(n) + '</span></button>').join('') + '</div>' : '';
		return line + kindForm('blue', K.BLUE) + kindForm('red', K.RED) + greenForm + cands;
	}
	/** 白スキルと遺伝子を同じ形の行にする（要望 (2)。並びは白のあとに遺伝子。遺伝子の名前はデータのまま「〜の遺伝子」＝決定 416） */
	function rowsOf(p) {
		const white = Object.keys(p.skills).sort((a, b) => K.skill(a).order - K.skill(b).order).map((id) => ({ id, kind: 'skills', name: K.skill(id).name, star: p.skills[id] }));
		const genes = Object.keys(p.genes).map((id) => ({ id, kind: 'genes', name: (K.GENES.get(id) || { name: id }).name, star: p.genes[id] }));
		return white.concat(genes);
	}
	/** 一覧（既定で開く。★不明の行はいつも先頭に出す。C-272 の 10）。★の帯はいちばん長い名前のすぐ右にそろえる。遺伝子の★も直せる（決定 417） */
	function listPart(p, i) {
		const ro = readOnly(p, i);
		const rows = rowsOf(p);
		const nWhite = rows.filter((r) => r.kind === 'skills').length, nGene = rows.length - nWhite;
		const unk = rows.filter((r) => r.star < 0), ok = rows.filter((r) => !(r.star < 0));
		const unkWhite = unk.filter((r) => r.kind === 'skills').length;
		const row = (r) => '<div class="sk' + (r.star < 0 ? ' unk' : '') + '"><span class="nm">' + K.esc(r.name) + '</span>' + starSeg(r.star, true, ro).replace('role="group"', 'role="group" data-row="' + i + '" data-kind="' + r.kind + '" data-id="' + K.esc(r.id) + '"') + '</div>';
		const head = '<div class="line"><span class="k">白</span><button class="linkbtn" type="button" data-act="toggle-sk" data-i="' + i + '" aria-expanded="' + !!p.open.sk + '">' + nWhite + '種' + (unkWhite ? '（★不明 ' + unkWhite + '）' : '') + '<span class="car" aria-hidden="true">' + (p.open.sk ? '▾' : '▸') + '</span></button><span class="k gk">遺伝子</span><span>' + nGene + '種</span></div>';
		return head + '<div class="skt">' + unk.map(row).join('') + (p.open.sk ? ok.map(row).join('') : '') + '</div>';
	}

	function render() {
		if (S.done) { renderDone(); return; }
		const y = window.scrollY; // タブや★を押しても位置が飛ばないように
		$('#body').innerHTML = topCard() + tabsCard();
		$('#body').querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', S.styles.includes(b.dataset.style)));
		const n = activePersons().flatMap(issues).length;
		$('#needTop').hidden = !n; $('#needTop').textContent = '要確認 ' + n;
		bind();
		window.scrollTo(0, y);
	}
	function bind() {
		const body = $('#body');
		const on = (sel, fn) => body.querySelectorAll(sel).forEach((b) => { b.onclick = () => { fn(b); render(); }; });
		on('[data-scope]', (b) => { S.scope = b.dataset.scope; });
		on('[data-owner]', (b) => { S.owner = b.dataset.owner; });
		on('[data-style]', (b) => { const v = b.dataset.style, k = S.styles.indexOf(v); if (k >= 0) S.styles.splice(k, 1); else S.styles.push(v); });
		on('[data-tab]', (b) => { S.tab = +b.dataset.tab; });
		on('[data-pane]', (b) => { S.pane = b.dataset.pane; });
		if ($('#setPick')) $('#setPick').onclick = openSetPicker;
		$('#regBtn').onclick = register;
		body.querySelectorAll('[data-zoom]').forEach((b) => { b.onclick = () => openImage(+b.dataset.zoom); });
		body.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => viewParent(b.dataset.view); });
		on('[data-cand]', (b) => { const p = S.persons[+b.dataset.i]; p.uma = K.UNIQ.get(b.dataset.cand) || null; refreshCands(p); });
		body.querySelectorAll('[data-umasel]').forEach((el) => { el.onchange = () => { const p = S.persons[+el.dataset.umasel]; p.uma = el.value || null; refreshCands(p); render(); }; });
		on('[data-act]', (b) => { const p = S.persons[+b.dataset.i], a = b.dataset.act;
			const openK = (k) => { p.open[k] = true; if (k !== 'green' && !p[k]) p[k] = [null, -1]; };
			const closeK = (k) => { p.open[k] = false; if (k !== 'green' && p[k] && !p[k][0]) p[k] = null; };
			if (a === 'toggle-sk') p.open.sk = !p.open.sk;
			else if (a.startsWith('toggle-')) { const k = a.slice(7); if (p.open[k]) closeK(k); else openK(k); }
			else if (a.startsWith('close-')) closeK(a.slice(6)); });
		const who = (el) => S.persons[+el.closest('[data-p]').dataset.p];
		on('[data-blue]', (b) => { const p = who(b); p.blue = [b.dataset.blue, p.blue ? p.blue[1] : -1]; });
		on('[data-red]', (b) => { const p = who(b); p.red = [b.dataset.red, p.red ? p.red[1] : -1]; });
		on('[data-bluestar] [data-star]', (b) => { const p = S.persons[+b.closest('[data-bluestar]').dataset.bluestar]; p.blue = [p.blue ? p.blue[0] : null, +b.dataset.star]; });
		on('[data-redstar] [data-star]', (b) => { const p = S.persons[+b.closest('[data-redstar]').dataset.redstar]; p.red = [p.red ? p.red[0] : null, +b.dataset.star]; });
		on('[data-gstar] [data-star]', (b) => { S.persons[+b.closest('[data-gstar]').dataset.gstar].greenStar = +b.dataset.star; });
		// 白スキルと遺伝子の★（遺伝子も直せる。決定 417）
		on('[data-row] [data-star]', (b) => { const g = b.closest('[data-row]'); S.persons[+g.dataset.row][g.dataset.kind][g.dataset.id] = +b.dataset.star; });
		on('[data-link]', (b) => { const p = S.persons[+b.dataset.i]; if (p.link === b.dataset.link) { p.link = null; p.linkMode = 'pick'; } else { p.link = b.dataset.link; p.linkMode = 'pick'; } });
		on('[data-nolink]', (b) => { const p = S.persons[+b.dataset.nolink]; p.link = null; p.linkMode = p.linkMode === 'none' ? 'pick' : 'none'; });
	}
	/* 結合画像を大きく見る（小窓） */
	function openImage(i) {
		const src = S.images[i]; if (!src) return;
		$('#sheetIn').innerHTML = '<h2 id="sheetTitle">' + K.esc(S.persons[i].role) + '<span class="sub">' + K.esc(K.fullName(S.persons[i].uma) || '') + '</span></h2><img class="bigimg" src="' + src + '" alt="" />' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>';
		$('#sheet').hidden = false; $('#scrim').hidden = false; $('#sheet').scrollTop = 0; $('#sheet').classList.add('imgsheet');
		$('#sheetIn [data-close]').onclick = closeSheet; $('#sheetIn [data-close]').focus({ preventScroll: true });
	}
	/* 登録済みの親のデータ（紐づけの候補の名前を押したとき。C-272 の 13） */
	function fzChips(q) {
		return '<span class="fz b' + (q.blue ? '' : ' none') + '" title="青因子">' + K.esc(K.blueText(q.blue)) + '</span><span class="fz r' + (q.red ? '' : ' none') + '" title="赤因子">' + K.esc(K.redText(q.red)) + '</span><span class="fz g' + (q.green == null ? ' none' : '') + '" title="緑因子">' + K.esc(K.uniqName(q.uma) || '固有') + ' ' + K.starText(q.green) + '</span>';
	}
	function viewParent(id) {
		const q = S.doc.parents.find((x) => x.id === id); if (!q) return;
		const ids = Object.keys(q.skills).sort((a, b) => K.skill(a).order - K.skill(b).order);
		const genes = Object.keys(q.genes || {}).map((g) => K.esc((K.GENES.get(g) || { name: g }).name.replace('の遺伝子', '')) + '★' + q.genes[g]).join('　') || 'なし';
		const sets = (q.sets || []).map((sid) => K.setName(K.findSet(S.doc, sid))).join('、') || 'なし';
		$('#sheetIn').innerHTML = '<h2 id="sheetTitle">' + K.esc(K.fullName(q.uma)) + '<span class="sub mono">' + K.esc(q.date + (S.doc.parents.filter((x) => x.date === q.date).length > 1 ? '-' + q.no : '')) + '</span>' + (q.owner === 'friend' ? '<span class="sub">フレンド</span>' : '') + '</h2>' +
			'<div class="row">' + fzChips(q) + '</div>' +
			'<dl class="kv"><dt>セット</dt><dd>' + K.esc(sets) + '</dd><dt>脚質</dt><dd>' + K.esc(((q.tags && q.tags.style) || []).map((s) => K.STYLE[s]).join('・') || 'なし') + '</dd><dt>遺伝子</dt><dd>' + genes + '</dd><dt>白</dt><dd>' + ids.length + '種</dd></dl>' +
			'<div class="sklist">' + ids.map((sid) => '<div class="sk"><span class="nm">' + K.esc(K.skill(sid).name) + '</span><span class="sc mono">' + K.starText(q.skills[sid]) + '</span></div>').join('') + '</div>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>';
		$('#sheet').hidden = false; $('#scrim').hidden = false; $('#sheet').scrollTop = 0;
		$('#sheetIn [data-close]').onclick = closeSheet; $('#sheetIn [data-close]').focus({ preventScroll: true });
	}
	/* 送り先のレース/周回セット（UmaStar の「レース」の欄と同じ形の一覧。終了レースのカテゴリへは登録の画面から送らない。C-272 の 6） */
	function openSetPicker() {
		$('#sheetIn').innerHTML = '<h2 id="sheetTitle">レース/周回セット</h2>' + K.setListHtml(S.doc, S.setKey, { noArc: true }) + '<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>';
		$('#sheet').hidden = false; $('#scrim').hidden = false;
		const c = $('#sheetIn .rlist input:checked'); if (c) c.focus({ preventScroll: true });
		$('#sheetIn').querySelectorAll('input[name="setpick"]').forEach((el) => { el.onchange = () => { S.setKey = el.value; closeSheet(); render(); }; });
		$('#sheetIn [data-close]').onclick = closeSheet;
	}
	function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; $('#sheet').classList.remove('imgsheet'); }
	$('#scrim').onclick = closeSheet; document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

	/* ---------- 右上のツール切り替えとライト／ダーク（T115・356。Deck の本体と同じ形。この画面は Deck の本体ではないので「Deck (αテスト)」も押して移れる行にする） ---------- */
	$('#toolBtn').onclick = () => {
		$('#sheetIn').innerHTML = '<h2 id="sheetTitle">ツール切り替え</h2><div class="list"><a href="special.html" data-tool><span>UmaStar OCR</span></a><a href="exam.html" data-tool><span>UmaExam</span></a><a href="deck-alpha.html" data-tool><span>Deck (αテスト)</span></a></div>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>';
		$('#sheet').hidden = false; $('#scrim').hidden = false; $('#sheet').scrollTop = 0;
		$('#sheetIn [data-close]').onclick = closeSheet; $('#sheetIn [data-close]').focus({ preventScroll: true });
	};
	// ライト／ダークは、ほかのツールと同じ設定（js/theme.js）。アイコンは利用者の選択（自動／ライト／ダーク）を示す
	function syncThemeBtn() {
		const st = window.UmaTheme && window.UmaTheme.get ? window.UmaTheme.get() : document.documentElement.getAttribute('data-theme');
		$('#themeBtn').setAttribute('data-theme-state', st === 'light' || st === 'dark' ? st : 'auto');
	}
	$('#themeBtn').onclick = () => { window.UmaTheme.set(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); syncThemeBtn(); };
	new MutationObserver(syncThemeBtn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); // ほかのタブでの切り替え・OS の設定の変化
	syncThemeBtn();

	/* ---------- 登録 ---------- */
	async function register() {
		const doc = S.doc; const ps = activePersons(); const main = ps[0];
		if (!main.uma && !main.link) return;
		// レースのセット（無ければ作る）へ、②のスキルの一覧（前の一覧と OR）を入れる。脚質はセットに記録しない（C-272 の 2）
		let set = null;
		if (S.exam) { if (!doc.exam) doc.exam = K.newExamList(); K.addSend(doc.exam, S.ocr.send); set = doc.exam; }
		// T108: 新しいモードは独立したまとまりへ（一覧の入れ方は「デフォルト」と同じ。空の一覧では作らない）
		else if (S.setKey === 'norace') { if (S.ocr.send.length) { if (!doc.norace) doc.norace = K.newNoRaceList(); K.addSend(doc.norace, S.ocr.send); } set = K.findSet(doc, 'norace'); }
		else if (S.setKey !== 'none') { set = doc.sets.find((x) => x.id === S.setKey); if (!set) { set = K.newRaceSet(K.RACES.get(S.setKey.slice(2))); doc.sets.push(set); } K.addSend(set, S.ocr.send); }
		// 「デフォルト」へ送るときは、②の一覧を「デフォルト」の一覧へ（前の一覧と OR・送りの回の数え方はレースのセットと同じ。T97・140）。空の一覧では作らない
		else if (S.ocr.send.length) { if (!doc.none) doc.none = K.newNoneList(); K.addSend(doc.none, S.ocr.send); }
		const today = new Date(); const date = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
		const no = doc.parents.filter((p) => p.date === date).length + 1;
		const member = (p) => Object.assign({ uma: p.uma, blue: p.blue && p.blue[0] ? p.blue : null, red: p.red && p.red[0] ? p.red : null, green: p.greenStar, skills: p.skills, genes: p.genes }, S.exam ? { sheet: p.sheet } : {});
		const gp = S.scope === 'fam' ? ps.slice(1).map((p) => p.link ? { link: p.link } : member(p)) : [];
		// 親Aを登録済みの親と「同一」にしたときは、新しい親を作らず、その親に足す（読み取りの値で上書き・送り先のセットに入る。UmaExam は 234・UmaStar は T115・363）
		if (main.link) {
			const q = doc.parents.find((x) => x.id === main.link);
			mergeMember(q, member(main));
			if (gp.length) q.gp = gp.map((g) => { if (g.link) return g; const e = (q.gp || []).find((o) => !o.link && o.uma && o.uma === g.uma); if (!e) return g; const c = JSON.parse(JSON.stringify(e)); mergeMember(c, g); return c; });
			const qs = q.sets || (q.sets = []); if (set && !qs.includes(set.id)) qs.push(set.id);
			if (S.exam) S.settings.mode = 'exam';
			else {
				// UmaStar から送ったので、技能試験だけの親だったなら「デフォルト」にも出す（357。技能試験の表には sets の 'exam' で残る）
				if (q.from === 'exam') delete q.from;
				// 画面で選んだ脚質の札は親の札に足す（前の札は消さない）
				q.tags = { style: [...new Set(((q.tags && q.tags.style) || []).concat(S.styles))] };
				S.settings.cur = set ? set.id : 'none'; S.settings.mode = 'star';
			}
			try { await K.store.putParents([q]); await K.store.putHead(doc); await K.store.putMeta('settings', S.settings); } catch (e) { toast('保存できませんでした'); return; }
			try { localStorage.removeItem(INBOX); } catch (e) { /* 消せなくても登録は済んでいる */ }
			dropImages();
			S.done = { parent: q, no: q.no, date: q.date, gp: gp.length, set, merged: true };
			render();
			return;
		}
		const id = 'p' + doc.next; doc.next++;
		const parent = Object.assign({ id, date, no, owner: S.owner, sets: set ? [set.id] : [], tags: { style: S.styles.slice() }, gp }, member(main));
		// Deck を開いたときに、送り先のセットを選んだ状態にする
		if (S.exam) { parent.from = 'exam'; S.settings.mode = 'exam'; } // UmaExam から登録した親は「デフォルト」に出さない（233）。開いたときは UmaExam 用の表
		else { if (S.setKey === 'norace') parent.from = 'norace'; /* T108: 新しいモードから登録した印（T115・357 から「デフォルト」にも出す） */ S.settings.cur = set ? set.id : 'none'; S.settings.mode = 'star'; }
		try { await K.store.putParents([parent]); await K.store.putHead(doc); await K.store.putMeta('settings', S.settings); }
		catch (e) { toast('保存できませんでした'); return; }
		try { localStorage.removeItem(INBOX); } catch (e) { /* 消せなくても登録は済んでいる */ }
		dropImages();
		S.done = { parent, no, date, gp: gp.length, set };
		render();
	}
	/** 登録できたら、この送りの結合画像を消す（別の IndexedDB の記録と、この画面の object URL。決定 418 の消す仕組み） */
	function dropImages() {
		if (IMG) IMG.remove(S.ocr.persons.map((o) => o.img && o.img.slot));
		S.images.forEach((u) => { if (u) URL.revokeObjectURL(u); });
		S.images = S.persons.map(() => null);
	}
	/** 読み取りの値を登録済みの人に足す（★不明で、分かっている★を消さない。読めなかった因子は今の値のまま） */
	function mergeMember(q, m) {
		const up = (cur, add) => { const r = Object.assign({}, cur); Object.keys(add || {}).forEach((k) => { if (!(add[k] < 0 && r[k] > 0)) r[k] = add[k]; }); return r; };
		q.skills = up(q.skills, m.skills); q.genes = up(q.genes, m.genes); if (m.sheet) q.sheet = Object.assign({}, q.sheet, m.sheet); // UmaStar からは sheet が無い（空を足さない）
		// 青・赤: 同じ名前で★が不明なら、分かっている★を残す（T116）
		const fac = (cur, add) => (add ? (cur && cur[0] === add[0] && !(add[1] > 0) ? cur : add) : cur);
		q.blue = fac(q.blue, m.blue); q.red = fac(q.red, m.red);
		if (m.green != null && (m.green >= 0 || q.green == null)) q.green = m.green;
	}
	function renderDone() {
		const d = S.done; const dup = S.doc.parents.filter((x) => x.date === d.date).length + (d.merged ? 0 : 1);
		$('#body').innerHTML = '<section class="card"><div class="okbox">登録しました：<b>' + K.esc(K.fullName(d.parent.uma)) + '</b>　' + d.date + (dup > 1 ? '-' + d.no : '') + (d.gp ? '　祖' + d.gp + '人' : '') + '<br>' + K.esc(K.setName(d.set)) + '</div>' +
			'<div class="row"><a class="btn pri" href="deck-alpha.html" style="flex:1">Deck (αテスト)を開く</a></div></section>';
		$('#needTop').hidden = true;
	}
	let toastT; function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200); }

	init();
})();
