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
 *   T92（段4 の 4-2）: UmaStar（special.html の sendToDeckAlpha）がこの形で書く。uma・blue・red は null、green は③の画像の緑因子の読み取り
 *   （名前が決まらなければ [null, ★] と greenCands、緑因子の欄が見つからなければ null）。owner は 'self'（持ち主はこの画面で選ぶ）。
 *   T92-1: blue・red の null は「読んでいない」として、閉じた状態で出し（因子の行は「—」）、「要確認」にも入れない。
 *   読もうとして決まらなかったものは [null, ★] で送れば、今までどおり開いて「読めなかった」を出す。
 *
 * 以下は版13 の説明。
 * 考え方: 確かめる所を最小にする。読めて決まったものは1行にたたみ（青・赤・緑の因子は1行の3つのボタン。C-272 の 8）、押すと直す形に入る（9）。
 * 決められなかった所（衣装の候補・★不明・読めなかった因子・祖が登録済みの親と同一か）だけを開いて「要確認」の数を上に出す。
 * ★不明のまま登録してもよい（Deck では「?」）。親Aの衣装だけは決めないと登録できない。
 * 送り先のレース/周回セットは、UmaStar で今選んでいるレースが初期値。「指定なし」でも登録できる（C-271 の 5）。
 * レースのセットへ送るときは、UmaStar の②のスキルの一覧を一緒に入れる（前の一覧と OR。C-271 の 3）。T97（140）から「指定なし」へ送るときも「指定なし」の一覧へ入れる。①の脚質はセットに記録しない（C-272 の 1・2）。
 * 「脚質」の欄は親の脚質の札（その親を何の脚質で育てたか。C-272 の 2）。初期値は UmaStar の①の脚質（版10 のまま）。
 * 祖の紐づけ（C-272 の 13〜15）: 同じ衣装の登録済みの親を候補にし、候補ごとに「登録済みの〇〇と同一」の行。「同一」か「新規登録」を選ぶ。
 * 衣装・白スキル・★が全部同じ親が1人だけなら「同一」を選んだ状態で出す（押し直せる）。
 */
(function () {
	'use strict';
	const DECK_ALPHA_REGISTER_JS_VERSION = '2026-11-04a';
	const K = window.DeckAlpha;
	const $ = (s) => document.querySelector(s);
	const Q = new URLSearchParams(location.search);
	const INBOX = 'umaDeck:send';
	const S = { doc: null, settings: null, ocr: null, scope: 'one', setKey: 'none', styles: [], owner: 'self', persons: [], done: null };

	async function init() {
		const th = Q.get('theme');
		let loaded;
		try { loaded = await K.store.load(); } catch (e) { $('#body').innerHTML = '<div class="empty"><span>この端末では保存が使えません（' + K.esc(e.message) + '）</span></div>'; $('#regbar').hidden = true; return; }
		S.settings = Object.assign({}, K.DEFAULT_SETTINGS, loaded.meta.settings || {});
		// 色は js/theme.js（ほかのツールと同じ設定）が <head> で付けてある（T92）。?theme= のときだけ上書きする（撮影用）
		if (th === 'light' || th === 'dark') K.applyTheme(th);
		S.doc = K.assemble(loaded);
		const ar = K.archiveEnded(S.doc);
		if (ar.moved.length) { await K.store.putParents(ar.changed); await K.store.putHead(S.doc); }
		S.ocr = readInbox();
		window.__deckAlphaRegister = { version: DECK_ALPHA_REGISTER_JS_VERSION, S, K, INBOX };
		if (!S.ocr) { renderNone(); return; }
		S.scope = S.ocr.persons.length >= 3 ? 'fam' : 'one';
		S.owner = S.ocr.owner === 'friend' ? 'friend' : 'self';
		// UmaStar で今選んでいるレース（一覧に無ければ「指定なし」）と、親の脚質の札の初期値（①の脚質）
		const live = K.activeRaces();
		S.setKey = S.ocr.race && live.some((r) => r.id === S.ocr.race) ? 'r:' + S.ocr.race : 'none';
		S.styles = S.ocr.style && K.STYLE[S.ocr.style] ? [S.ocr.style] : [];
		S.persons = S.ocr.persons.map((o, i) => prepPerson(o, i));
		render();
	}

	/* ---------- 受け取りの口（上の説明の形）。形が崩れていれば null（「送られた親がありません」を出す） ---------- */
	function readInbox() {
		let j = null;
		try { j = JSON.parse(localStorage.getItem(INBOX) || 'null'); } catch (e) { return null; }
		if (!j || j.format !== 'uma-deck-send' || !Array.isArray(j.persons) || !j.persons.length) return null;
		const pair = (a) => (Array.isArray(a) && a.length === 2 ? [a[0] == null ? null : String(a[0]), typeof a[1] === 'number' ? a[1] : -1] : null);
		const stars = (o) => { const r = {}; if (o && typeof o === 'object') Object.keys(o).forEach((k) => { if (typeof o[k] === 'number') r[k] = o[k]; }); return r; };
		const person = (o) => ({ uma: o && o.uma && K.costume(o.uma) ? o.uma : null, green: pair(o && o.green), greenCands: o && Array.isArray(o.greenCands) && o.greenCands.length ? o.greenCands.map(String) : null,
			blue: pair(o && o.blue), red: pair(o && o.red), skills: stars(o && o.skills), genes: stars(o && o.genes) });
		return { race: j.race || null, style: j.style || null, send: Array.isArray(j.send) ? j.send.map(String) : [], owner: j.owner, sentAt: j.sentAt || null, persons: j.persons.slice(0, 3).map(person) };
	}
	function renderNone() {
		$('#body').innerHTML = '<section class="card"><p class="small muted">UmaStar から送られた親がありません。UmaStar の OCR の結果から送ってください。</p><div class="row"><a class="btn pri" href="deck-alpha.html" style="flex:1">Deck (αテスト)を開く</a></div></section>';
		$('#regbar').hidden = true; $('#needTop').hidden = true;
	}
	function prepPerson(o, i) {
		const p = { role: K.POS[i], uma: o.uma, greenStar: o.green ? o.green[1] : null, greenCands: o.greenCands, blue: o.blue ? o.blue.slice() : null, red: o.red ? o.red.slice() : null, skills: Object.assign({}, o.skills), genes: Object.assign({}, o.genes), open: {}, link: null, linkMode: null, cands: [] };
		if (!p.uma && o.green && o.green[0]) p.uma = K.UNIQ.get(o.green[0]) || null;
		// 読めなかった・★不明の青赤緑は、最初から直す形で開いておく（衣装が決められない緑は、候補を並べるので開かない）。
		// 読んでいない青赤（null）は閉じたまま（T92-1）
		['blue', 'red'].forEach((k) => { if (p[k] && (!p[k][0] || p[k][1] < 0)) p.open[k] = true; });
		if (p.uma && p.greenStar != null && p.greenStar < 0) p.open.green = true;
		if (i > 0) refreshCands(p);
		return p;
	}
	/** 祖の候補（同じ衣装の登録済みの親）を引き直す。全部同じ親が1人だけなら「同一」を選んだ状態にする（まだ選んでいないときだけ） */
	function refreshCands(p) {
		p.cands = K.matchCandidates(S.doc, p);
		if (p.link && !p.cands.some((c) => c.p.id === p.link)) { p.link = null; p.linkMode = null; }
		if (!p.linkMode) { const ex = p.cands.filter((c) => c.exact); if (ex.length === 1) { p.link = ex[0].p.id; p.linkMode = 'auto'; } }
	}

	/* ---------- 要確認の数 ---------- */
	function issues(p) {
		const a = [];
		if (p.link) return a; // 登録済みの親と同一にしたときは、この読み取りの値は保存しないので確かめる所が無い
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

	/* ---------- 描画 ---------- */
	function starSeg(cur, allowUnknown) {
		const opts = [[1, '★1'], [2, '★2'], [3, '★3']].concat(allowUnknown ? [[-1, '?']] : []);
		return '<span class="stars" role="group">' + opts.map(([v, t]) => '<button type="button" data-star="' + v + '" aria-pressed="' + (cur === v) + '">' + t + '</button>').join('') + '</span>';
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
	function personCard(p, i) {
		const on = S.scope === 'fam' || i === 0;
		const iss = on ? issues(p) : [];
		const head = '<h2><span class="role">' + p.role + '</span>' + cosHtml(p.uma) + (iss.length ? '<span class="need">要確認 ' + iss.join('・') + '</span>' : (on ? '' : '<span class="muted small">送らない</span>')) + '</h2>';
		// 因子の行（青・赤・緑の順で1行。押すと直す形に入る。C-272 の 8・9）
		const fzBtn = (kind, cls, text, need, title) => '<button class="fz ' + cls + (need ? ' need' : '') + '" type="button" data-act="toggle-' + kind + '" data-i="' + i + '" aria-pressed="' + !!p.open[kind] + '" title="' + title + '" aria-label="' + title + '：' + K.esc(text) + '">' + K.esc(text) + '</button>';
		const blueT = p.blue && p.blue[0] ? K.BLUE[p.blue[0]] + ' ' + K.starText(p.blue[1]) : p.blue ? '読めなかった' : K.blueText(null);
		const redT = p.red && p.red[0] ? K.RED[p.red[0]] + ' ' + K.starText(p.red[1]) : p.red ? '読めなかった' : K.redText(null);
		const greenT = (p.uma ? K.uniqName(p.uma) : '？') + ' ' + K.starText(p.greenStar);
		const fzLine = '<div class="line fzline"><span class="fzrow" role="group" aria-label="因子">' +
			fzBtn('blue', 'b', blueT, !!p.blue && (!p.blue[0] || p.blue[1] < 0), '青因子') + fzBtn('red', 'r', redT, !!p.red && (!p.red[0] || p.red[1] < 0), '赤因子') +
			fzBtn('green', 'g', greenT, !p.uma || (p.greenStar != null && p.greenStar < 0), '緑因子') + '</span></div>';
		// 直す形（青・赤: 種類と★。緑: 衣装と★）
		const kindForm = (kind, map) => { const val = p[kind]; if (!p.open[kind]) return '';
			return '<div class="line edit"><span class="k"></span>' + (val && val[0] ? '' : '<span class="need">読めなかった</span>') + kindChips(map, val ? val[0] : null, 'data-' + kind) + '</div>' +
				'<div class="line edit"><span class="k"></span>' + starSeg(val ? val[1] : null, true).replace('role="group"', 'role="group" data-' + kind + 'star="' + i + '"') + (val && val[1] < 0 ? '<span class="need">★不明</span>' : '') + smallBtn('close-' + kind, i, '閉じる') + '</div>'; };
		const greenForm = p.open.green ? '<div class="line edit"><span class="k"></span><select class="sel" data-umasel="' + i + '" aria-label="衣装" style="flex:1;min-width:0">' + costumeOptions(p.uma) + '</select></div>' +
			'<div class="line edit"><span class="k"></span>' + starSeg(p.greenStar, true).replace('role="group"', 'role="group" data-gstar="' + i + '"') + (p.greenStar != null && p.greenStar < 0 ? '<span class="need">★不明</span>' : '') + smallBtn('close-green', i, '閉じる') + '</div>' : '';
		const cands = !p.uma && p.greenCands ? '<div class="line"><span class="k"></span><span class="need">緑因子が決められない</span></div><div class="cands">' + p.greenCands.map((n) => '<button class="cand" type="button" data-cand="' + K.esc(n) + '" data-i="' + i + '">' + cosHtml(K.UNIQ.get(n)) + '<span class="sc">' + K.esc(n) + '</span></button>').join('') + '</div>' : '';
		// 白スキル（「白 N種」を押すと一覧が開く。★不明のものは常に出す。C-272 の 10）
		const ids = Object.keys(p.skills).sort((a, b) => K.skill(a).order - K.skill(b).order);
		const unk = ids.filter((id) => p.skills[id] < 0), okIds = ids.filter((id) => p.skills[id] >= 0);
		const skRow = (id) => '<div class="sk' + (p.skills[id] < 0 ? ' unk' : '') + '"><span class="nm">' + K.esc(K.skill(id).name) + '</span>' + starSeg(p.skills[id], true).replace('role="group"', 'role="group" data-skstar="' + i + '" data-sk="' + id + '"') + '</div>';
		const skills = '<div class="line"><span class="k">白</span><button class="linkbtn" type="button" data-act="toggle-sk" data-i="' + i + '" aria-expanded="' + !!p.open.sk + '">' + ids.length + '種' + (unk.length ? '（★不明 ' + unk.length + '）' : '') + '<span class="car" aria-hidden="true">' + (p.open.sk ? '▾' : '▸') + '</span></button></div>' +
			(unk.length ? '<div class="sklist">' + unk.map(skRow).join('') + '</div>' : '') +
			(p.open.sk ? '<div class="sklist">' + okIds.map(skRow).join('') + '</div>' : '');
		const genes = '<div class="line"><span class="k">遺伝子</span><span>' + (Object.keys(p.genes).map((g) => K.esc((K.GENES.get(g) || { name: g }).name.replace('の遺伝子', '')) + '★' + p.genes[g]).join('　') || 'なし') + '</span></div>';
		// 祖の紐づけ（候補ごとに「登録済みの〇〇と同一」の行。「同一」か「新規登録」。C-272 の 13〜15）
		let link = '';
		if (i > 0 && on && p.cands.length) {
			link = '<div class="links">' + p.cands.map((c) => '<div class="lrow"><span class="lt">登録済みの <button class="namebtn" type="button" data-view="' + c.p.id + '" aria-label="登録済みの ' + K.esc(K.fullName(c.p.uma)) + ' のデータを見る">' + K.esc(K.fullName(c.p.uma)) + '</button> <span class="muted small mono">' + K.esc(codeOf(c.p)) + '</span>' + (c.p.owner === 'friend' ? '<span class="muted small">・フレンド</span>' : '') + ' と同一</span><button class="btn" type="button" data-link="' + c.p.id + '" data-i="' + i + '" aria-pressed="' + (p.link === c.p.id) + '">同一</button></div>').join('') +
				'<div class="lrow"><span class="lt"></span><button class="btn" type="button" data-nolink="' + i + '" aria-pressed="' + (p.linkMode === 'none') + '">新規登録</button></div></div>';
		}
		return '<section class="card' + (on ? '' : ' off') + '">' + head + (on ? link + (p.link ? '' : fzLine + kindForm('blue', K.BLUE) + kindForm('red', K.RED) + greenForm + cands + skills + genes) : '') + '</section>';
	}
	function codeOf(p) { const dup = S.doc.parents.filter((x) => x.date === p.date).length; return p.date.slice(5).replace('-', '/') + (dup > 1 ? '-' + p.no : ''); }
	function costumeOptions(sel) { const list = K.D.costumes.slice().sort((a, b) => (a.chara + a.title).localeCompare(b.chara + b.title, 'ja')); return '<option value="">（選ぶ）</option>' + list.map((c) => '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + K.esc(c.chara + '［' + c.title + '］') + '</option>').join(''); }

	function render() {
		if (S.done) { renderDone(); return; }
		$('#regbar').hidden = false; // データを読み終えるまでは出さない（HTML で hidden）
		const setNow = S.setKey === 'none' ? null : (S.doc.sets.find((x) => x.id === S.setKey) || K.newRaceSet(K.RACES.get(S.setKey.slice(2))));
		// 「指定なし」へ送るときも②の一覧を「指定なし」の一覧に足す（T97・140）。前の一覧の数は「指定なし」の一覧から
		const into = setNow || S.doc.none || null;
		const sendN = S.ocr.send.length, had = into && into.sends ? Object.keys(into.skills).length : 0;
		const noFam = S.ocr.persons.length < 3;
		const scope = '<section class="card"><div class="line"><span class="k">送る</span><span class="seg" role="group" id="scopeSeg"><button type="button" data-scope="one" aria-pressed="' + (S.scope === 'one') + '">親Aだけ</button><button type="button" data-scope="fam" aria-pressed="' + (S.scope === 'fam') + '"' + (noFam ? ' disabled class="strike"' : '') + '>親Aセット</button></span></div>' +
			'<div class="line"><span class="k">セット</span><button class="rsel" type="button" id="setPick" aria-haspopup="dialog" aria-label="レース/周回セット：' + K.esc(K.setName(setNow)) + '" style="flex:1;justify-content:space-between"><span class="t">' + K.esc(K.setName(setNow)) + '</span><span class="car" aria-hidden="true">▾</span></button></div>' +
			(S.ocr.send.length ? '<div class="line"><span class="k">スキル</span><span>②の' + sendN + '種' + (had ? '<span class="muted small">（前の一覧 ' + had + '種に足す）</span>' : '') + '</span></div>' : '') +
			'<div class="line"><span class="k">脚質</span>' + kindChips(K.STYLE, null, 'data-style') + '</div>' +
			'<div class="line"><span class="k">持ち主</span><span class="seg" role="group"><button type="button" data-owner="self" aria-pressed="' + (S.owner === 'self') + '">自分</button><button type="button" data-owner="friend" aria-pressed="' + (S.owner === 'friend') + '">フレンド</button></span></div></section>';
		$('#body').innerHTML = scope + S.persons.map(personCard).join('');
		$('#body').querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', S.styles.includes(b.dataset.style)));
		const all = activePersons().flatMap(issues); const n = all.length;
		$('#needTop').hidden = !n; $('#needTop').textContent = '要確認 ' + n;
		const can = !!S.persons[0].uma;
		$('#regBtn').disabled = !can; $('#regSum').textContent = can ? (S.scope === 'fam' ? '親A＋祖2人' : '親Aだけ') + (n ? '・★不明などは「?」のまま登録' : '') : '親Aの衣装を決めると登録できます';
		bind();
	}
	function personIndex(el) { const cards = [...$('#body').querySelectorAll('section.card')]; return cards.indexOf(el.closest('section.card')) - 1; }
	function bind() {
		const body = $('#body');
		body.querySelectorAll('[data-scope]').forEach((b) => { b.onclick = () => { S.scope = b.dataset.scope; render(); }; });
		$('#setPick').onclick = openSetPicker;
		body.querySelectorAll('[data-style]').forEach((b) => { b.onclick = () => { const v = b.dataset.style; const i = S.styles.indexOf(v); if (i >= 0) S.styles.splice(i, 1); else S.styles.push(v); render(); }; });
		body.querySelectorAll('[data-owner]').forEach((b) => { b.onclick = () => { S.owner = b.dataset.owner; render(); }; });
		const umaChanged = (i, p) => { if (i > 0) refreshCands(p); };
		body.querySelectorAll('[data-cand]').forEach((b) => { b.onclick = () => { const i = +b.dataset.i, p = S.persons[i]; p.uma = K.UNIQ.get(b.dataset.cand) || null; umaChanged(i, p); render(); }; });
		body.querySelectorAll('[data-umasel]').forEach((el) => { el.onchange = () => { const i = +el.dataset.umasel, p = S.persons[i]; p.uma = el.value || null; umaChanged(i, p); render(); }; });
		body.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.dataset.i], a = b.dataset.act;
			const openK = (k) => { p.open[k] = true; if (k !== 'green' && !p[k]) p[k] = [null, -1]; };
			const closeK = (k) => { p.open[k] = false; if (k !== 'green' && p[k] && !p[k][0]) p[k] = null; };
			if (a === 'toggle-sk') p.open.sk = !p.open.sk;
			else if (a.startsWith('toggle-')) { const k = a.slice(7); if (p.open[k]) closeK(k); else openK(k); }
			else if (a.startsWith('close-')) closeK(a.slice(6));
			render(); }; });
		body.querySelectorAll('[data-blue]').forEach((b) => { b.onclick = () => { const p = S.persons[personIndex(b)]; p.blue = [b.dataset.blue, p.blue ? p.blue[1] : -1]; render(); }; });
		body.querySelectorAll('[data-red]').forEach((b) => { b.onclick = () => { const p = S.persons[personIndex(b)]; p.red = [b.dataset.red, p.red ? p.red[1] : -1]; render(); }; });
		body.querySelectorAll('[data-bluestar] [data-star]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.closest('[data-bluestar]').dataset.bluestar]; p.blue = [p.blue ? p.blue[0] : null, +b.dataset.star]; render(); }; });
		body.querySelectorAll('[data-redstar] [data-star]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.closest('[data-redstar]').dataset.redstar]; p.red = [p.red ? p.red[0] : null, +b.dataset.star]; render(); }; });
		body.querySelectorAll('[data-gstar] [data-star]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.closest('[data-gstar]').dataset.gstar]; p.greenStar = +b.dataset.star; render(); }; });
		body.querySelectorAll('[data-skstar] [data-star]').forEach((b) => { b.onclick = () => { const g = b.closest('[data-skstar]'); const p = S.persons[+g.dataset.skstar]; p.skills[g.dataset.sk] = +b.dataset.star; render(); }; });
		body.querySelectorAll('[data-link]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.dataset.i]; if (p.link === b.dataset.link) { p.link = null; p.linkMode = 'pick'; } else { p.link = b.dataset.link; p.linkMode = 'pick'; } render(); }; });
		body.querySelectorAll('[data-nolink]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.dataset.nolink]; p.link = null; p.linkMode = p.linkMode === 'none' ? 'pick' : 'none'; render(); }; });
		body.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => viewParent(b.dataset.view); });
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
	function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; }
	$('#scrim').onclick = closeSheet; document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

	/* ---------- 登録 ---------- */
	$('#regBtn').onclick = async () => {
		const doc = S.doc; const ps = activePersons(); const main = ps[0];
		if (!main.uma) return;
		// レースのセット（無ければ作る）へ、②のスキルの一覧（前の一覧と OR）を入れる。脚質はセットに記録しない（C-272 の 2）
		let set = null;
		if (S.setKey !== 'none') { set = doc.sets.find((x) => x.id === S.setKey); if (!set) { set = K.newRaceSet(K.RACES.get(S.setKey.slice(2))); doc.sets.push(set); } K.addSend(set, S.ocr.send); }
		// 「指定なし」へ送るときは、②の一覧を「指定なし」の一覧へ（前の一覧と OR・送りの回の数え方はレースのセットと同じ。T97・140）。空の一覧では作らない
		else if (S.ocr.send.length) { if (!doc.none) doc.none = K.newNoneList(); K.addSend(doc.none, S.ocr.send); }
		const today = new Date(); const date = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
		const no = doc.parents.filter((p) => p.date === date).length + 1;
		const member = (p) => ({ uma: p.uma, blue: p.blue && p.blue[0] ? p.blue : null, red: p.red && p.red[0] ? p.red : null, green: p.greenStar, skills: p.skills, genes: p.genes });
		const gp = S.scope === 'fam' ? ps.slice(1).map((p) => p.link ? { link: p.link } : member(p)) : [];
		const id = 'p' + doc.next; doc.next++;
		const parent = Object.assign({ id, date, no, owner: S.owner, sets: set ? [set.id] : [], tags: { style: S.styles.slice() }, gp }, member(main));
		// Deck を開いたときに、送り先のセットを選んだ状態にする
		S.settings.cur = set ? set.id : 'none';
		try { await K.store.putParents([parent]); await K.store.putHead(doc); await K.store.putMeta('settings', S.settings); }
		catch (e) { toast('保存できませんでした'); return; }
		try { localStorage.removeItem(INBOX); } catch (e) { /* 消せなくても登録は済んでいる */ }
		S.done = { parent, no, date, gp: gp.length, set };
		render();
	};
	function renderDone() {
		const d = S.done; const dup = S.doc.parents.filter((x) => x.date === d.date).length + 1;
		$('#body').innerHTML = '<section class="card"><div class="okbox">登録しました：<b>' + K.esc(K.fullName(d.parent.uma)) + '</b>　' + d.date + (dup > 1 ? '-' + d.no : '') + (d.gp ? '　祖' + d.gp + '人' : '') + '<br>' + K.esc(K.setName(d.set)) + '</div>' +
			'<div class="row"><a class="btn pri" href="deck-alpha.html" style="flex:1">Deck (αテスト)を開く</a></div></section>';
		$('#regbar').hidden = true; $('#needTop').hidden = true;
	}
	let toastT; function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200); }

	init();
})();
