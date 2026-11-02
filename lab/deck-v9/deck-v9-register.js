/* lab/deck-v9/deck-v9-register.js — 登録の画面（UmaStar の OCR から送ったとき）。
 * 考え方: 確かめる所を最小にする。読めて決まったものは1行にたたみ、決められなかった所（衣装の候補・★不明・読めなかった因子・祖の紐づけ）だけを開いて
 * 「要確認」の数を上に出す。★不明のまま登録してもよい（Deck では「?」）。親Aの衣装だけは決めないと登録できない。
 */
(function () {
	'use strict';
	const K = window.DeckV9;
	const $ = (s) => document.querySelector(s);
	const Q = new URLSearchParams(location.search);
	const CASE = Q.get('case') || 'a';
	const S = { doc: null, settings: null, ocr: null, scope: 'one', bundleIds: [], newBundle: '', styles: [], owner: 'self', persons: [], done: null };

	async function init() {
		const th = Q.get('theme');
		let loaded = await K.store.load();
		S.settings = Object.assign({}, K.DEFAULT_SETTINGS, loaded.meta.settings || {});
		K.applyTheme(th === 'light' || th === 'dark' ? th : S.settings.theme);
		document.body.classList.toggle('mono-chips', !S.settings.chipColor);
		if (!loaded.parents.length && !loaded.meta.seeded) { const m = K.makeMock(S.settings.mockN, 11); await K.store.replaceAll(m); await K.store.putMeta('seeded', true); loaded = await K.store.load(); toast('仮のデータ（親' + m.parents.length + '人）を入れました'); }
		S.doc = K.assemble(loaded);
		S.ocr = mockOcr(CASE, S.doc);
		S.scope = S.ocr.persons.length >= 3 ? 'fam' : 'one';
		S.owner = CASE === 'd' ? 'friend' : 'self';
		// レース条件からまとまりと脚質を自動で付ける（名前が同じまとまりがあればそれ、無ければ新しいまとまり）
		const rc = S.ocr.race; const b = S.doc.bundles.find((x) => x.name === rc.bundleName);
		if (b) S.bundleIds = [b.id]; else S.newBundle = rc.bundleName;
		S.styles = [rc.style];
		S.persons = S.ocr.persons.map((o, i) => prepPerson(o, i));
		render();
	}

	/* ---------- 仮の OCR の結果（T73 の形: 青・赤・緑と★、白スキルと★、遺伝子） ---------- */
	function mockOcr(c, doc) {
		const r = K.rng(c.charCodeAt(0) * 31 + 7);
		const pool = [...K.SK.values()].filter((s) => s.cat !== 'factor');
		const pick = (n) => { const o = {}; let guard = 0; while (Object.keys(o).length < n && guard++ < 500) { const s = pool[Math.floor(r() * pool.length)]; o[s.id] = 1 + Math.floor(r() * 3); } return o; };
		const cos = K.D.costumes;
		const person = (uma, extra) => Object.assign({ uma, green: [K.uniqName(uma), 1 + Math.floor(r() * 3)], blue: ['speed', 3], red: ['medium', 2], skills: pick(12 + Math.floor(r() * 6)), genes: { 'ap-medium': 2, 'ap-sashi': 1 }, greenCands: null }, extra || {});
		const race = { bundleName: '11月LoH', dist: 'medium', surface: 'turf', style: 'sashi' };
		if (c === 'b') {
			const ex1 = doc.parents.slice().reverse().find((p) => p.owner === 'friend') || doc.parents[doc.parents.length - 1];
			const ex2 = doc.parents.slice().reverse().find((p) => p !== ex1 && Object.keys(p.skills).length >= 8) || doc.parents[0];
			const sk2 = Object.assign({}, ex2.skills); Object.keys(sk2).slice(0, 2).forEach((id) => delete sk2[id]); sk2['999x'] = undefined; delete sk2['999x']; const add = pool[3]; sk2[add.id] = 2;
			return { race, persons: [person(cos[20].id), person(ex1.uma, { blue: ex1.blue, red: ex1.red, green: [K.uniqName(ex1.uma), ex1.green], skills: Object.assign({}, ex1.skills), genes: Object.assign({}, ex1.genes) }), person(ex2.uma, { blue: ex2.blue, red: ex2.red, green: [K.uniqName(ex2.uma), ex2.green], skills: sk2, genes: Object.assign({}, ex2.genes) })] };
		}
		if (c === 'c') {
			const u = cos[45]; const sk = pick(14); const ids = Object.keys(sk); sk[ids[1]] = -1; sk[ids[4]] = -1;
			return { race, persons: [person(null, { green: [null, 2], greenCands: [u.uniq[u.uniq.length - 1], cos[46].uniq[0], cos[47].uniq[0]], blue: ['power', -1], red: null, skills: sk })] };
		}
		return { race, persons: [person(cos[c === 'd' ? 77 : 10].id)] };
	}
	function prepPerson(o, i) {
		const p = { role: K.POS[i], uma: o.uma, greenStar: o.green ? o.green[1] : null, greenCands: o.greenCands, blue: o.blue ? o.blue.slice() : null, red: o.red ? o.red.slice() : null, skills: Object.assign({}, o.skills), genes: Object.assign({}, o.genes), open: {}, link: null, linkMode: null, cands: [] };
		if (!p.uma && o.green && o.green[0]) p.uma = K.UNIQ.get(o.green[0]) || null;
		// 読めなかった・★不明の青赤は、最初から選べる形で開いておく（「直す」を押す手間を省く）
		['blue', 'red'].forEach((k) => { if (!p[k]) { p[k] = [null, -1]; p.open[k] = true; } else if (p[k][1] < 0) p.open[k] = true; });
		if (i > 0) { p.cands = K.matchCandidates(S.doc, p); if (p.cands.length === 1 && p.cands[0].exact) { p.link = p.cands[0].p.id; p.linkMode = 'auto'; } }
		return p;
	}

	/* ---------- 要確認の数 ---------- */
	function issues(p) {
		const a = [];
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
	function starSeg(cur, onPick, allowUnknown) {
		const opts = [[1, '★1'], [2, '★2'], [3, '★3']].concat(allowUnknown ? [[-1, '?']] : []);
		return '<span class="stars" role="group">' + opts.map(([v, t]) => '<button type="button" data-star="' + v + '" aria-pressed="' + (cur === v) + '">' + t + '</button>').join('') + '</span>';
	}
	function kindChips(map, cur, attr) { return '<span class="row">' + Object.entries(map).map(([v, t]) => '<button class="chip" type="button" ' + attr + '="' + v + '" aria-pressed="' + (cur === v) + '" style="min-height:36px;padding:0 10px">' + t + '</button>').join('') + '</span>'; }
	function personCard(p, i) {
		const on = S.scope === 'fam' || i === 0;
		const iss = on ? issues(p) : [];
		const costumeLine = p.uma
			? '<div class="line"><span class="k">衣装</span><span><b>' + K.esc(K.fullName(p.uma)) + '</b> <span class="fz g"><span class="k">緑</span>' + K.esc(K.uniqName(p.uma)) + ' ' + K.starText(p.greenStar) + '</span></span><button class="btn" type="button" data-act="uma" data-i="' + i + '" style="min-height:32px;padding:0 8px;font-size:12px">別の衣装</button></div>'
			: '<div class="line"><span class="k">衣装</span><span class="need">緑因子が決められない</span></div><div class="cands">' + (p.greenCands || []).map((n) => '<button class="cand" type="button" data-cand="' + K.esc(n) + '" data-i="' + i + '"><span>' + K.esc(K.fullName(K.UNIQ.get(n))) + '</span><span class="sc">' + K.esc(n) + '</span></button>').join('') + '</div>';
		const umaSel = p.open.uma ? '<div class="line"><select class="sel" data-umasel="' + i + '" style="flex:1">' + costumeOptions(p.uma) + '</select></div>' : '';
		const greenStarLine = p.greenStar != null && p.greenStar < 0 ? '<div class="line"><span class="k">緑の★</span>' + starSeg(p.greenStar, null, true).replace('role="group"', 'role="group" data-gstar="' + i + '"') + '<span class="need">★不明</span></div>' : '';
		const fzLine = (kind, val, map) => {
			const lbl = kind === 'blue' ? '青' : '赤'; const cls = kind === 'blue' ? 'b' : 'r';
			if (p.open[kind]) return '<div class="line"><span class="k">' + lbl + '</span>' + (val && val[0] ? '' : '<span class="need">読めなかった</span>') + kindChips(map, val ? val[0] : null, 'data-' + kind) + '</div><div class="line"><span class="k"></span>' + starSeg(val ? val[1] : null, null, true).replace('role="group"', 'role="group" data-' + kind + 'star="' + i + '"') + (val && val[1] < 0 ? '<span class="need">★不明</span>' : '') + '<button class="btn" type="button" data-act="close-' + kind + '" data-i="' + i + '" style="min-height:32px;padding:0 8px;font-size:12px">閉じる</button></div>';
			if (!val) return '<div class="line"><span class="k">' + lbl + '</span><span class="need">読めなかった</span><button class="btn" type="button" data-act="open-' + kind + '" data-i="' + i + '" style="min-height:32px;padding:0 8px;font-size:12px">選ぶ</button></div>';
			return '<div class="line"><span class="k">' + lbl + '</span><span class="fz ' + cls + '">' + K.esc(map[val[0]]) + ' ' + K.starText(val[1]) + '</span>' + (val[1] < 0 ? '<span class="need">★不明</span>' : '') + '<button class="btn" type="button" data-act="open-' + kind + '" data-i="' + i + '" style="min-height:32px;padding:0 8px;font-size:12px">直す</button></div>';
		};
		const ids = Object.keys(p.skills).sort((a, b) => K.skill(a).order - K.skill(b).order);
		const unk = ids.filter((id) => p.skills[id] < 0), okIds = ids.filter((id) => p.skills[id] >= 0);
		const skRow = (id) => '<div class="sk' + (p.skills[id] < 0 ? ' unk' : '') + '"><span class="nm">' + K.esc(K.skill(id).name) + '</span>' + starSeg(p.skills[id], null, true).replace('role="group"', 'role="group" data-skstar="' + i + '" data-sk="' + id + '"') + '</div>';
		const skills = '<div class="line"><span class="k">白</span><span>' + ids.length + '種' + (unk.length ? '（★不明 ' + unk.length + '）' : '') + '</span></div>' +
			(unk.length ? '<div class="sklist">' + unk.map(skRow).join('') + '</div>' : '') +
			'<details class="fold"' + (p.open.sk ? ' open' : '') + ' data-fold="' + i + '"><summary>' + (unk.length ? '確定した' + okIds.length + '種' : '一覧') + '</summary><div class="sklist">' + okIds.map(skRow).join('') + '</div></details>';
		const genes = '<div class="line"><span class="k">遺伝子</span><span>' + (Object.keys(p.genes).map((g) => K.esc((K.GENES.get(g) || { name: g }).name.replace('の遺伝子', '')) + '★' + p.genes[g]).join('　') || 'なし') + '</span></div>';
		let link = '';
		if (i > 0 && on) {
			if (p.link && p.linkMode === 'auto') { const q = S.doc.parents.find((x) => x.id === p.link); link = '<div class="okbox" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span>登録済みの <b>' + K.esc(K.fullName(q.uma)) + '</b> ' + K.esc(codeOf(q)) + ' と同じ → 紐づける</span><button class="btn" type="button" data-act="unlink" data-i="' + i + '" style="min-height:32px;padding:0 8px;font-size:12px;margin-left:auto">別の親として登録</button></div>'; }
			else if (p.cands.length && p.linkMode !== 'none') { link = '<div class="line"><span class="need">登録済みの親に似ている</span><span class="muted small">どれに紐づけるか</span></div><div class="cands">' + p.cands.map((c) => '<button class="cand" type="button" data-link="' + c.p.id + '" data-i="' + i + '" aria-pressed="' + (p.link === c.p.id) + '"><span>' + K.esc(K.fullName(c.p.uma)) + ' <span class="muted small">' + K.esc(codeOf(c.p)) + (c.p.owner === 'friend' ? '・フレンド' : '') + '</span></span><span class="sc">一致 ' + c.score + '%</span></button>').join('') + '<button class="cand" type="button" data-nolink="' + i + '" aria-pressed="' + (p.linkMode === 'none') + '"><span>紐づけない（この親と一緒に登録）</span></button></div>'; }
			else if (p.linkMode === 'none' && p.cands.length) { link = '<div class="line"><span class="muted small">登録済みの親には紐づけない</span><button class="btn" type="button" data-act="relink" data-i="' + i + '" style="min-height:32px;padding:0 8px;font-size:12px">選び直す</button></div>'; }
		}
		const linkedOnly = p.link ? '<p class="small muted">紐づけ先の親のデータを使います（この読み取りの値は保存しません）。</p>' : '';
		return '<section class="card' + (on ? '' : ' off') + '"><h2><span class="role">' + p.role + '</span><span>' + K.esc(p.uma ? K.charaName(p.uma) : '？') + '</span>' + (iss.length ? '<span class="need">要確認 ' + iss.join('・') + '</span>' : (on ? '<span class="muted small">読めた</span>' : '<span class="muted small">送らない</span>')) + '</h2>' +
			(on ? link + (p.link ? linkedOnly : costumeLine + umaSel + greenStarLine + fzLine('blue', p.blue, K.BLUE) + fzLine('red', p.red, K.RED) + skills + genes) : '') + '</section>';
	}
	function codeOf(p) { const dup = S.doc.parents.filter((x) => x.date === p.date).length; return p.date.slice(5).replace('-', '/') + (dup > 1 ? '-' + p.no : ''); }
	function costumeOptions(sel) { const list = K.D.costumes.slice().sort((a, b) => (a.chara + a.title).localeCompare(b.chara + b.title, 'ja')); return '<option value="">（選ぶ）</option>' + list.map((c) => '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + K.esc(c.chara + '［' + c.title + '］') + '</option>').join(''); }

	function render() {
		if (S.done) { renderDone(); return; }
		const B = S.doc.bundles;
		const scope = '<section class="card"><div class="line"><span class="k">送る</span><span class="seg" role="group" id="scopeSeg"><button type="button" data-scope="one" aria-pressed="' + (S.scope === 'one') + '">親Aだけ</button><button type="button" data-scope="fam" aria-pressed="' + (S.scope === 'fam') + '"' + (S.ocr.persons.length < 3 ? ' disabled' : '') + '>家系3人</button></span>' + (S.ocr.persons.length < 3 ? '<span class="muted small">祖は読んでいない</span>' : '') + '</div>' +
			'<div class="line"><span class="k">まとまり</span><span class="row">' + B.map((b) => '<button class="chip" type="button" data-bundle="' + b.id + '" aria-pressed="' + S.bundleIds.includes(b.id) + '" style="min-height:36px;padding:0 10px">' + K.esc(b.name) + '</button>').join('') + (S.newBundle ? '<button class="chip" type="button" data-bundle="__new" aria-pressed="true" style="min-height:36px;padding:0 10px">' + K.esc(S.newBundle) + '（新規）</button>' : '') + '</span></div>' +
			'<div class="line"><span class="k">脚質</span>' + kindChips(K.STYLE, null, 'data-style').replace(/aria-pressed="false"/g, 'aria-pressed="false"') + '</div>' +
			'<div class="line"><span class="k">持ち主</span><span class="seg" role="group"><button type="button" data-owner="self" aria-pressed="' + (S.owner === 'self') + '">自分</button><button type="button" data-owner="friend" aria-pressed="' + (S.owner === 'friend') + '">フレンド</button></span></div></section>';
		$('#body').innerHTML = scope + S.persons.map(personCard).join('');
		$('#body').querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', S.styles.includes(b.dataset.style)));
		const all = activePersons().flatMap(issues); const n = all.length;
		$('#needTop').hidden = !n; $('#needTop').textContent = '要確認 ' + n;
		const can = !!S.persons[0].uma;
		$('#regBtn').disabled = !can; $('#regSum').textContent = can ? (S.scope === 'fam' ? '親A＋祖2人' : '親Aだけ') + (n ? '・★不明などは「?」のまま登録' : '') : '親Aの衣装を決めると登録できます';
		bind();
	}
	function bind() {
		const body = $('#body');
		body.querySelectorAll('[data-scope]').forEach((b) => { b.onclick = () => { S.scope = b.dataset.scope; render(); }; });
		body.querySelectorAll('[data-bundle]').forEach((b) => { b.onclick = () => { const id = b.dataset.bundle; if (id === '__new') { S.newBundle = S.newBundle ? '' : S.ocr.race.bundleName; } else { const i = S.bundleIds.indexOf(id); if (i >= 0) S.bundleIds.splice(i, 1); else S.bundleIds.push(id); } render(); }; });
		body.querySelectorAll('[data-style]').forEach((b) => { b.onclick = () => { const v = b.dataset.style; const i = S.styles.indexOf(v); if (i >= 0) S.styles.splice(i, 1); else S.styles.push(v); render(); }; });
		body.querySelectorAll('[data-owner]').forEach((b) => { b.onclick = () => { S.owner = b.dataset.owner; render(); }; });
		body.querySelectorAll('[data-cand]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.dataset.i]; p.uma = K.UNIQ.get(b.dataset.cand) || null; render(); }; });
		body.querySelectorAll('[data-umasel]').forEach((el) => { el.onchange = () => { const p = S.persons[+el.dataset.umasel]; p.uma = el.value || null; p.open.uma = false; render(); }; });
		body.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.dataset.i], a = b.dataset.act;
			if (a === 'uma') p.open.uma = !p.open.uma; else if (a === 'open-blue') { p.open.blue = true; if (!p.blue) p.blue = [null, -1]; } else if (a === 'open-red') { p.open.red = true; if (!p.red) p.red = [null, -1]; }
			else if (a === 'close-blue') { p.open.blue = false; if (!p.blue[0]) p.blue = null; } else if (a === 'close-red') { p.open.red = false; if (!p.red[0]) p.red = null; }
			else if (a === 'unlink') { p.link = null; p.linkMode = 'none'; } else if (a === 'relink') { p.linkMode = null; p.link = null; }
			render(); }; });
		body.querySelectorAll('[data-blue]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.closest('.card').dataset.i || personIndex(b)]; p.blue = [b.dataset.blue, p.blue ? p.blue[1] : -1]; render(); }; });
		body.querySelectorAll('[data-red]').forEach((b) => { b.onclick = () => { const p = S.persons[personIndex(b)]; p.red = [b.dataset.red, p.red ? p.red[1] : -1]; render(); }; });
		body.querySelectorAll('[data-bluestar] [data-star]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.closest('[data-bluestar]').dataset.bluestar]; p.blue = [p.blue ? p.blue[0] : null, +b.dataset.star]; render(); }; });
		body.querySelectorAll('[data-redstar] [data-star]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.closest('[data-redstar]').dataset.redstar]; p.red = [p.red ? p.red[0] : null, +b.dataset.star]; render(); }; });
		body.querySelectorAll('[data-gstar] [data-star]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.closest('[data-gstar]').dataset.gstar]; p.greenStar = +b.dataset.star; render(); }; });
		body.querySelectorAll('[data-skstar] [data-star]').forEach((b) => { b.onclick = () => { const g = b.closest('[data-skstar]'); const p = S.persons[+g.dataset.skstar]; p.skills[g.dataset.sk] = +b.dataset.star; p.open.sk = !!p.open.sk; render(); }; });
		body.querySelectorAll('[data-fold]').forEach((d) => { d.ontoggle = () => { S.persons[+d.dataset.fold].open.sk = d.open; }; });
		body.querySelectorAll('[data-link]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.dataset.i]; p.link = b.dataset.link; p.linkMode = 'pick'; render(); }; });
		body.querySelectorAll('[data-nolink]').forEach((b) => { b.onclick = () => { const p = S.persons[+b.dataset.nolink]; p.link = null; p.linkMode = 'none'; render(); }; });
	}
	function personIndex(el) { const cards = [...$('#body').querySelectorAll('section.card')]; return cards.indexOf(el.closest('section.card')) - 1; }

	/* ---------- 登録 ---------- */
	$('#regBtn').onclick = async () => {
		const doc = S.doc; const ps = activePersons(); const main = ps[0];
		if (!main.uma) return;
		let bundles = S.bundleIds.slice();
		if (S.newBundle) { const id = 'b' + (doc.bundles.length + 1); doc.bundles.push({ id, name: S.newBundle, dist: S.ocr.race.dist, surface: S.ocr.race.surface }); bundles.push(id); }
		const today = new Date(); const date = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
		const no = doc.parents.filter((p) => p.date === date).length + 1;
		const bs = doc.bundles.filter((b) => bundles.includes(b.id));
		const tags = { dist: [...new Set(bs.map((b) => b.dist))], style: S.styles.slice(), surface: [...new Set(bs.map((b) => b.surface))] };
		const member = (p) => ({ uma: p.uma, blue: p.blue && p.blue[0] ? p.blue : null, red: p.red && p.red[0] ? p.red : null, green: p.greenStar, skills: p.skills, genes: p.genes });
		const gp = S.scope === 'fam' ? ps.slice(1).map((p) => p.link ? { link: p.link } : member(p)) : [];
		const id = 'p' + doc.next; doc.next++;
		const parent = Object.assign({ id, date, no, owner: S.owner, bundles, tags, gp }, member(main));
		try { await K.store.putParents([parent]); await K.store.putMeta('doc', { schema: doc.schema, next: doc.next, bundles: doc.bundles, targets: doc.targets, data: doc.data }); }
		catch (e) { toast('保存できませんでした'); return; }
		S.done = { parent, no, date, gp: gp.length };
		render();
	};
	function renderDone() {
		const d = S.done; const dup = S.doc.parents.filter((x) => x.date === d.date).length + 1;
		$('#body').innerHTML = '<section class="card"><div class="okbox">登録しました：<b>' + K.esc(K.fullName(d.parent.uma)) + '</b>　' + d.date + (dup > 1 ? '-' + d.no : '') + (d.gp ? '　祖' + d.gp + '人' : '') + '</div>' +
			'<div class="row"><a class="btn pri" href="deck.html" style="flex:1">Deck を開く</a><a class="btn" href="register.html?case=' + CASE + '" style="flex:1">続けて登録（モック）</a></div></section>';
		$('#regbar').hidden = true; $('#needTop').hidden = true;
	}
	let toastT; function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200); }

	init();
})();
