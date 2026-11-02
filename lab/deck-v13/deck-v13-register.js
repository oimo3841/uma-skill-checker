/* lab/deck-v13/deck-v13-register.js — 登録の画面（UmaStar の OCR から送ったとき）。版11（T84・C-272）に、版12（T86・C-273）のボタンの形（帯と札）と配色を入れた。
 * 考え方: 確かめる所を最小にする。読めて決まったものは1行にたたみ（青・赤・緑の因子は1行の3つのボタン。C-272 の 8）、押すと直す形に入る（9）。
 * 決められなかった所（衣装の候補・★不明・読めなかった因子・祖が登録済みの親と同一か）だけを開いて「要確認」の数を上に出す。
 * ★不明のまま登録してもよい（Deck では「?」）。親Aの衣装だけは決めないと登録できない。
 * 送り先のレース/周回セットは、UmaStar で今選んでいるレースが初期値。「指定なし」でも登録できる（C-271 の 5）。
 * レースのセットへ送るときは、UmaStar の②のスキルの一覧を一緒に入れる（前の一覧と OR。C-271 の 3）。①の脚質はセットに記録しない（C-272 の 1・2）。
 * 「脚質」の欄は親の脚質の札（その親を何の脚質で育てたか。C-272 の 2）。初期値は UmaStar の①の脚質（版10 のまま）。
 * 祖の紐づけ（C-272 の 13〜15）: 同じ衣装の登録済みの親を候補にし、候補ごとに「登録済みの〇〇と同一」の行。「同一」か「新規登録」を選ぶ。
 * 衣装・白スキル・★が全部同じ親が1人だけなら「同一」を選んだ状態で出す（押し直せる）。
 */
(function () {
	'use strict';
	const K = window.DeckV13;
	const $ = (s) => document.querySelector(s);
	const Q = new URLSearchParams(location.search);
	const CASE = Q.get('case') || 'a';
	const S = { doc: null, settings: null, ocr: null, scope: 'one', setKey: 'none', styles: [], owner: 'self', persons: [], done: null };

	async function init() {
		const th = Q.get('theme');
		let loaded = await K.store.load();
		S.settings = Object.assign({}, K.DEFAULT_SETTINGS, loaded.meta.settings || {});
		K.applyTheme(th === 'light' || th === 'dark' ? th : S.settings.theme);
		if (!loaded.parents.length && !loaded.meta.seeded) { const m = K.makeMock(S.settings.mockN, 11); await K.store.replaceAll(m); await K.store.putMeta('seeded', true); loaded = await K.store.load(); toast('仮のデータ（親' + m.parents.length + '人）を入れました'); }
		S.doc = K.assemble(loaded);
		const ar = K.archiveEnded(S.doc, S.settings.simEnded);
		if (ar.moved.length) { await K.store.putParents(ar.changed); await K.store.putHead(S.doc); }
		S.ocr = mockOcr(CASE, S.doc);
		S.scope = S.ocr.persons.length >= 3 ? 'fam' : 'one';
		S.owner = CASE === 'd' ? 'friend' : 'self';
		// UmaStar で今選んでいるレース（一覧に無ければ「指定なし」）と、親の脚質の札の初期値（①の脚質）
		const live = K.activeRaces(S.settings.simEnded);
		S.setKey = S.ocr.race && live.some((r) => r.id === S.ocr.race) ? 'r:' + S.ocr.race : 'none';
		S.styles = S.ocr.style ? [S.ocr.style] : [];
		S.persons = S.ocr.persons.map((o, i) => prepPerson(o, i));
		render();
	}

	/* ---------- 仮の OCR の結果（T73 の形: 青・赤・緑と★、白スキルと★、遺伝子） ---------- */
	function mockOcr(c, doc) {
		const r = K.rng(c.charCodeAt(0) * 31 + 7);
		const pool = [...K.SK.values()].filter((s) => s.cat !== 'factor');
		const pick = (n) => { const o = {}; let guard = 0; while (Object.keys(o).length < n && guard++ < 500) { const s = pool[Math.floor(r() * pool.length)]; o[s.id] = 1 + Math.floor(r() * 3); } return o; };
		const cos = K.D.costumes;
		const person = (uma, extra) => Object.assign({ uma, green: [K.uniqName(uma), 1 + Math.floor(r() * 3)], blue: ['speed', 3], red: ['long', 2], skills: pick(12 + Math.floor(r() * 6)), genes: { 'ap-long': 2, 'ap-sashi': 1 }, greenCands: null }, extra || {});
		// UmaStar から一緒に送るもの: 今選んでいるレース・①の脚質（親の脚質の札の初期値）・②のスキルの一覧（40種前後。今のセットの一覧と一部が入れ替わる）
		const sendFor = (raceId) => { const rc = K.RACES.get(raceId); if (!rc) return []; const dist = rc.distanceCategory, sf = rc.surface; const all = [...K.SK.values()];
			const a = all.filter((s) => s.cat === 'scenario').concat(all.filter((s) => s.cat === 'outside'), all.filter((s) => s.cat === 'other' && (s.dist.includes(dist) || s.surface.includes(sf)))).map((s) => s.id);
			return a.slice(10, 50); };
		const at = { a: ['race-0002', 'sashi'], b: ['race-0002', 'sashi'], c: ['race-0004', 'nige'], d: ['race-0003', 'senko'], e: [null, 'sashi'] }[c] || ['race-0002', 'sashi'];
		const race = at[0], style = at[1], send = race ? sendFor(race) : [];
		const ret = (persons) => ({ race, style, send, persons });
		if (c === 'b') {
			// 祖1: 登録済みの親（フレンド）と衣装・白スキル・★が全部同じ → 「同一」を選んだ状態。祖2: 同じ衣装の登録済みの親が2人以上いて、白スキルが少し違う → 候補の行を並べて選ぶ
			const byUma = {}; doc.parents.forEach((p) => (byUma[p.uma] = byUma[p.uma] || []).push(p));
			const ex1 = doc.parents.slice().reverse().find((p) => p.owner === 'friend') || doc.parents[doc.parents.length - 1];
			const ex2 = doc.parents.slice().reverse().find((p) => p !== ex1 && p.uma !== ex1.uma && byUma[p.uma].length >= 2 && Object.keys(p.skills).length >= 8) || doc.parents[0];
			const sk2 = Object.assign({}, ex2.skills); Object.keys(sk2).slice(0, 2).forEach((id) => delete sk2[id]); const add = pool[3]; sk2[add.id] = 2;
			return ret([person(cos[20].id), person(ex1.uma, { blue: ex1.blue, red: ex1.red, green: [K.uniqName(ex1.uma), ex1.green], skills: Object.assign({}, ex1.skills), genes: Object.assign({}, ex1.genes) }), person(ex2.uma, { blue: ex2.blue, red: ex2.red, green: [K.uniqName(ex2.uma), ex2.green], skills: sk2, genes: Object.assign({}, ex2.genes) })]);
		}
		if (c === 'c') {
			const u = cos[45]; const sk = pick(14); const ids = Object.keys(sk); sk[ids[1]] = -1; sk[ids[4]] = -1;
			return ret([person(null, { green: [null, 2], greenCands: [u.uniq[u.uniq.length - 1], cos[46].uniq[0], cos[47].uniq[0]], blue: ['power', -1], red: null, skills: sk })]);
		}
		return ret([person(cos[c === 'd' ? 77 : c === 'e' ? 30 : 10].id)]);
	}
	function prepPerson(o, i) {
		const p = { role: K.POS[i], uma: o.uma, greenStar: o.green ? o.green[1] : null, greenCands: o.greenCands, blue: o.blue ? o.blue.slice() : null, red: o.red ? o.red.slice() : null, skills: Object.assign({}, o.skills), genes: Object.assign({}, o.genes), open: {}, link: null, linkMode: null, cands: [] };
		if (!p.uma && o.green && o.green[0]) p.uma = K.UNIQ.get(o.green[0]) || null;
		// 読めなかった・★不明の青赤緑は、最初から直す形で開いておく（衣装が決められない緑は、候補を並べるので開かない）
		['blue', 'red'].forEach((k) => { if (!p[k]) { p[k] = [null, -1]; p.open[k] = true; } else if (p[k][1] < 0) p.open[k] = true; });
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
		if (p.blue == null || !p.blue[0]) a.push('青'); else if (p.blue[1] < 0) a.push('青の★');
		if (p.red == null || !p.red[0]) a.push('赤'); else if (p.red[1] < 0) a.push('赤の★');
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
		const blueT = p.blue && p.blue[0] ? K.BLUE[p.blue[0]] + ' ' + K.starText(p.blue[1]) : '読めなかった';
		const redT = p.red && p.red[0] ? K.RED[p.red[0]] + ' ' + K.starText(p.red[1]) : '読めなかった';
		const greenT = (p.uma ? K.uniqName(p.uma) : '？') + ' ' + K.starText(p.greenStar);
		const fzLine = '<div class="line fzline"><span class="fzrow" role="group" aria-label="因子">' +
			fzBtn('blue', 'b', blueT, !(p.blue && p.blue[0]) || p.blue[1] < 0, '青因子') + fzBtn('red', 'r', redT, !(p.red && p.red[0]) || p.red[1] < 0, '赤因子') +
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
		const setNow = S.setKey === 'none' ? null : (S.doc.sets.find((x) => x.id === S.setKey) || K.newRaceSet(K.RACES.get(S.setKey.slice(2))));
		const sendN = setNow ? S.ocr.send.length : 0, had = setNow && setNow.sends ? Object.keys(setNow.skills).length : 0;
		const noFam = S.ocr.persons.length < 3;
		const scope = '<section class="card"><div class="line"><span class="k">送る</span><span class="seg" role="group" id="scopeSeg"><button type="button" data-scope="one" aria-pressed="' + (S.scope === 'one') + '">親Aだけ</button><button type="button" data-scope="fam" aria-pressed="' + (S.scope === 'fam') + '"' + (noFam ? ' disabled class="strike"' : '') + '>親Aセット</button></span></div>' +
			'<div class="line"><span class="k">セット</span><button class="rsel" type="button" id="setPick" aria-haspopup="dialog" aria-label="レース/周回セット：' + K.esc(K.setName(setNow)) + '" style="flex:1;justify-content:space-between"><span class="t">' + K.esc(K.setName(setNow)) + '</span><span class="car" aria-hidden="true">▾</span></button></div>' +
			(setNow && S.ocr.send.length ? '<div class="line"><span class="k">スキル</span><span>②の' + sendN + '種' + (had ? '<span class="muted small">（前の一覧 ' + had + '種に足す）</span>' : '') + '</span></div>' : '') +
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
		$('#sheetIn').innerHTML = '<h2 id="sheetTitle">レース/周回セット</h2>' + K.setListHtml(S.doc, S.setKey, S.settings.simEnded, { noArc: true }) + '<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>';
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
		S.done = { parent, no, date, gp: gp.length, set };
		render();
	};
	function renderDone() {
		const d = S.done; const dup = S.doc.parents.filter((x) => x.date === d.date).length + 1;
		$('#body').innerHTML = '<section class="card"><div class="okbox">登録しました：<b>' + K.esc(K.fullName(d.parent.uma)) + '</b>　' + d.date + (dup > 1 ? '-' + d.no : '') + (d.gp ? '　祖' + d.gp + '人' : '') + '<br>' + K.esc(K.setName(d.set)) + '</div>' +
			'<div class="row"><a class="btn pri" href="deck.html" style="flex:1">Deck を開く</a><a class="btn" href="register.html?case=' + CASE + '" style="flex:1">続けて登録（モック）</a></div></section>';
		$('#regbar').hidden = true; $('#needTop').hidden = true;
	}
	let toastT; function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200); }

	init();
})();
