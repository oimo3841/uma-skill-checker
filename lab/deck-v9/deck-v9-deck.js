/* lab/deck-v9/deck-v9-deck.js — Deck 本体（ヒートマップの表・親のカード・2組・目標の6人・バックアップ）。
 * 表は見える範囲だけ描く（T74 の (c)）。名前と最大の列・親の名前と数の行は、別の部品を重ねて固定する。
 * URL: ?theme=light|dark（見た目の固定）・?lv=0|1|2・?pane=parent|skill|view|tier・?A=p3&B=p9・?six=1・?sheet=data|card:p3（撮影用）
 */
(function () {
	'use strict';
	const K = window.DeckV9;
	const $ = (s) => document.querySelector(s);
	const Q = new URLSearchParams(location.search);
	const stage = $('#stage');
	const isNarrow = () => matchMedia('(max-width: 720px)').matches;

	const S = { doc: null, settings: null, M: null, lv: 1, pane: null, A: null, B: null, rs: 'def', cs: 'def',
		pf: { bundle: null, style: new Set(), owner: new Set(), tier: false }, sf: { cat: new Set(), dist: new Set(), style: new Set(), q: '', want: true },
		onlyMiss: false, six: false, fixedTheme: null, perf: {} };

	/* ---------- 起動 ---------- */
	async function init() {
		const th = Q.get('theme'); if (th === 'light' || th === 'dark') S.fixedTheme = th;
		let loaded;
		try { loaded = await K.store.load(); } catch (e) { stage.innerHTML = '<div class="empty">この端末では保存が使えません（' + K.esc(e.message) + '）</div>'; return; }
		S.perf.load = loaded.ms;
		S.settings = Object.assign({}, K.DEFAULT_SETTINGS, loaded.meta.settings || {});
		K.applyTheme(S.fixedTheme || S.settings.theme);
		if (!loaded.parents.length && !loaded.meta.seeded) {
			const m = K.makeMock(S.settings.mockN, 11);
			await K.store.replaceAll(m); await K.store.putMeta('seeded', true);
			loaded = await K.store.load();
			toast('仮のデータ（親' + m.parents.length + '人）を入れました');
		}
		S.doc = K.assemble(loaded);
		S.lv = Q.has('lv') ? +Q.get('lv') : S.settings.lv0;
		document.querySelectorAll('[data-lv]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.lv === S.lv ? 'true' : 'false'));
		if (Q.get('A')) S.A = Q.get('A'); if (Q.get('B')) S.B = Q.get('B'); if (Q.get('six') === '1') S.six = true;
		rebuild();
		document.body.classList.toggle('mono-chips', !S.settings.chipColor);
		renderAll();
		if (Q.get('pane')) { S.pane = Q.get('pane'); applyPanes(); }
		const sh = Q.get('sheet'); if (sh === 'data') openData(); else if (sh && sh.startsWith('card:')) { const p = S.M.byId.get(sh.slice(5)); if (p) openParent(p); } else if (sh === 'pair') openPairDetail();
		window.__deckV9 = { S, measure, draw: () => renderStage(true), setMock, openData, findPairs: () => $('#recPair').click() };
	}
	function rebuild() { const t0 = performance.now(); S.M = K.makeModel(S.doc, S.settings); S.perf.model = performance.now() - t0; }
	const saveSettings = () => K.store.putMeta('settings', S.settings).catch(() => toast('設定を保存できませんでした'));
	const saveHead = () => K.store.putMeta('doc', { schema: S.doc.schema, next: S.doc.next, bundles: S.doc.bundles, targets: S.doc.targets, data: S.doc.data }).catch(() => toast('保存できませんでした'));
	const saveParents = (list) => K.store.putParents(list).catch(() => toast('保存できませんでした'));

	/* ---------- 見える親・行 ---------- */
	const keysOf = (p) => S.M.keysFor(p, S.pf.bundle, S.pf.style);
	function visParents() {
		const M = S.M, f = S.pf, t = S.doc.targets;
		let ps = S.doc.parents.filter((p) => {
			if (f.bundle && !(p.bundles || []).includes(f.bundle)) return false;
			if (f.style.size && !(p.tags.style || []).some((s) => f.style.has(s))) return false;
			if (f.owner.size && !f.owner.has(p.owner)) return false;
			if (f.tier && K.tierActive(t)) { const m = K.famTier(M, p, t); if (!m || !m.reqOk || m.t1 + m.t2 < 2) return false; }
			return true;
		});
		const rows = visRowsRaw();
		if (S.cs === 'def') ps.sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
		else if (S.cs === 'many') { const c = (p) => rows.reduce((n, s) => n + (M.famHas(p, s.id) ? 1 : 0), 0); const cc = new Map(ps.map((p) => [p.id, c(p)])); ps.sort((a, b) => cc.get(b.id) - cc.get(a.id) || b.date.localeCompare(a.date)); }
		else if (S.cs === 'owner') ps.sort((a, b) => (a.owner === b.owner ? (b.date.localeCompare(a.date) || b.no - a.no) : a.owner === 'self' ? -1 : 1));
		return ps;
	}
	function wantBundle() { const b = S.pf.bundle && S.doc.bundles.find((x) => x.id === S.pf.bundle); return b && b.want && b.want.length ? b : null; }
	function visRowsRaw() {
		const f = S.sf, q = f.q.trim();
		const wb = f.want ? wantBundle() : null;
		const base = wb ? wb.want.map(K.skill) : S.M.rows;
		return base.filter((s) => {
			if (f.cat.size && !f.cat.has(s.cat)) return false;
			if (f.dist.size && !s.dist.some((d) => f.dist.has(d))) return false;
			if (f.style.size && !s.style.some((d) => f.style.has(d))) return false;
			if (q && !s.name.includes(q)) return false;
			return true;
		});
	}
	function selected() { return [S.A, S.B].map((id) => id && S.M.byId.get(id)).filter(Boolean); }
	function covered(rows) { const sel = selected(); return rows.filter((s) => sel.some((p) => S.M.famHas(p, s.id))); }
	function visRows(ps) {
		const M = S.M; let rows = visRowsRaw();
		if (S.onlyMiss && selected().length) { const cov = new Set(covered(rows).map((s) => s.id)); rows = rows.filter((s) => !cov.has(s.id)); }
		if (S.rs === 'few') { const all = S.doc.parents; const c = (s) => all.reduce((n, p) => n + (M.famHas(p, s.id) ? 1 : 0), 0); const cc = new Map(rows.map((s) => [s.id, c(s)])); rows.sort((a, b) => cc.get(a.id) - cc.get(b.id) || a.order - b.order); }
		else if (S.rs === 'max') { const mx = new Map(rows.map((s) => [s.id, ps.reduce((m, p) => Math.max(m, M.triple(p, s.id)), 0)])); rows.sort((a, b) => mx.get(b.id) - mx.get(a.id) || a.order - b.order); }
		else if (S.rs === 'cat') { const o = { scenario: 0, outside: 1, factor: 2, other: 3 }; rows.sort((a, b) => o[a.cat] - o[b.cat] || a.order - b.order); }
		return rows;
	}
	function columns(ps) {
		if (S.six && S.A && S.B) {
			const out = []; [S.A, S.B].forEach((id, si) => { const p = S.M.byId.get(id); if (!p) return; S.M.fam(p).forEach((m, k) => out.push({ kind: 'm', p, m, k, role: (si ? 'B' : 'A') + (k ? k : ''), pos: K.POS[si * 3 + k] })); });
			return out;
		}
		return ps.map((p) => ({ kind: 'p', p }));
	}

	/* ---------- 文言の部品 ---------- */
	function nameOf(p) { return K.fullName(p.uma); }
	function fzHtml(p, withGreen) {
		const g = p.green == null ? '—' : K.starText(p.green);
		return '<span class="fz b' + (p.blue ? '' : ' none') + '"><span class="k">青</span>' + K.esc(K.blueText(p.blue)) + '</span>' +
			'<span class="fz r' + (p.red ? '' : ' none') + '"><span class="k">赤</span>' + K.esc(K.redText(p.red)) + '</span>' +
			(withGreen === false ? '' : '<span class="fz g' + (p.green == null ? ' none' : '') + '"><span class="k">緑</span>' + K.esc(K.uniqName(p.uma) || '固有') + ' ' + g + '</span>');
	}
	function ownerMark(p) { return p.owner === 'friend' ? '<span class="fr">（フレンド）</span>' : ''; }

	/* ---------- 絞り込みの部品 ---------- */
	function chips(el, items, isOn, onTap) { el.innerHTML = ''; items.forEach(([v, t, dis]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.disabled = !!dis; b.setAttribute('aria-pressed', isOn(v) ? 'true' : 'false'); b.onclick = () => { onTap(v); renderAll(); }; el.appendChild(b); }); }
	const toggleSet = (set, v) => set.has(v) ? set.delete(v) : set.add(v);
	function renderFilters() {
		const B = S.doc.bundles, t = S.doc.targets;
		chips($('#pf-bundle'), [[null, 'すべて']].concat(B.map((b) => [b.id, b.name])), (v) => S.pf.bundle === v, (v) => { S.pf.bundle = v; });
		chips($('#pf-style'), Object.entries(K.STYLE), (v) => S.pf.style.has(v), (v) => toggleSet(S.pf.style, v));
		chips($('#pf-owner'), [['self', '自分'], ['friend', 'フレンド']], (v) => S.pf.owner.has(v), (v) => toggleSet(S.pf.owner, v));
		chips($('#pf-tier'), [[true, '目標に合う家系だけ', !K.tierActive(t)]], () => S.pf.tier, () => { S.pf.tier = !S.pf.tier; });
		const wb = wantBundle();
		chips($('#sf-want'), [[true, wb ? wb.name + ' の欲しいスキルだけ（' + wb.want.length + '種）' : 'まとまりの欲しいスキルだけ', !wb]], () => S.sf.want && !!wb, () => { S.sf.want = !S.sf.want; });
		chips($('#sf-cat'), Object.entries(K.CAT), (v) => S.sf.cat.has(v), (v) => toggleSet(S.sf.cat, v));
		chips($('#sf-dist'), Object.entries(K.DIST), (v) => S.sf.dist.has(v), (v) => toggleSet(S.sf.dist, v));
		chips($('#sf-style'), Object.entries(K.STYLE), (v) => S.sf.style.has(v), (v) => toggleSet(S.sf.style, v));
		$('#cs').value = S.cs; $('#rs').value = S.rs;
		document.querySelectorAll('[data-th]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.th === S.settings.th ? 'true' : 'false'));
		$('#gpToggle').setAttribute('aria-pressed', S.settings.gp ? 'true' : 'false');
		$('#geneToggle').setAttribute('aria-pressed', S.settings.geneRows ? 'true' : 'false');
	}
	/* ---------- 目標の6人 ---------- */
	function costumeOptions(sel) {
		const list = K.D.costumes.slice().sort((a, b) => (a.chara + a.title).localeCompare(b.chara + b.title, 'ja'));
		return '<option value="">（指定なし）</option>' + list.map((c) => '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + K.esc(c.chara + '［' + c.title + '］') + '</option>').join('');
	}
	function renderTier() {
		const t = S.doc.targets;
		$('#tierSlots').innerHTML = K.POS.map((pos, i) => '<div class="tslot"><span class="tl"><span>' + pos + '</span>' + (i % 3 === 0 ? '<label><input type="checkbox" data-must="' + (i ? 'B' : 'A') + '"' + (t.must[i ? 'B' : 'A'] ? ' checked' : '') + '> 必須</label>' : '') + '</span><select class="sel" data-slot="' + i + '" aria-label="' + pos + '">' + costumeOptions(t.t1[i]) + '</select></div>').join('');
		const t2 = t.t2.concat(['', '', '']).slice(0, 3);
		$('#tier2').innerHTML = t2.map((k, i) => '<select class="sel" data-t2="' + i + '" aria-label="次善の候補' + (i + 1) + '" style="flex:1;min-width:9em">' + costumeOptions(k) + '</select>').join('');
		const after = () => { saveHead(); renderAll(); };
		$('#tierSlots').querySelectorAll('[data-slot]').forEach((el) => { el.onchange = () => { t.t1[+el.dataset.slot] = el.value || null; after(); }; });
		$('#tierSlots').querySelectorAll('[data-must]').forEach((el) => { el.onchange = () => { t.must[el.dataset.must] = el.checked; after(); }; });
		$('#tier2').querySelectorAll('[data-t2]').forEach((el) => { el.onchange = () => { t.t2 = [...$('#tier2').querySelectorAll('select')].map((x) => x.value).filter(Boolean); after(); }; });
	}

	/* ---------- 表 ---------- */
	let V = null; // 描いている表の状態
	function dims() {
		const n = isNarrow(), six = S.six && S.A && S.B;
		if (S.lv === 1) return { cw: 18, rh: 18, nw: n ? 76 : 112, mw: 24, hh: six ? 92 : 76, fs: 10 };
		return { cw: 30, rh: 30, nw: n ? 128 : 184, mw: 30, hh: six ? 150 : 136, fs: 12 };
	}
	function cellInfo(col, sid) {
		const M = S.M;
		if (col.kind === 'm') { const v = col.m.skills[sid]; if (v == null || v === 0) return ['c0', '']; if (v < 0) return ['unk', '?']; if (v < M.th) return ['cl', v]; return ['c' + v, v]; }
		const f = M.fam(col.p), v = f[0].skills[sid];
		if (v != null && v !== 0) { if (v < 0) return [M.th === 1 ? 'unk' : 'unk', '?']; if (v < M.th) return M.gpOnly(col.p, sid) ? ['cl gp', v] : ['cl', v]; return ['c' + v, v]; }
		return M.gpOnly(col.p, sid) ? ['c0 gp', ''] : ['c0', ''];
	}
	/* 列 c の遺伝子の行 y（親・祖1・祖2）の数。祖がいない親は 0 */
	function geneAt(c, y) { const M = S.M; const mem = c.kind === 'p' ? M.fam(c.p)[y] : c.m; return mem ? M.geneN(mem, keysOf(c.p)) : 0; }
	function memAt(c, y) { return c.kind === 'p' ? S.M.fam(c.p)[y] : c.m; }
	function renderStage(force) {
		const t0 = performance.now();
		const ps = visParents(), rows = visRows(ps), cols = columns(ps);
		const pfOn = S.pf.bundle || S.pf.style.size || S.pf.owner.size || S.pf.tier, sfOn = S.sf.cat.size || S.sf.dist.size || S.sf.style.size || S.sf.q.trim() || S.onlyMiss || (S.sf.want && wantBundle());
		$('#nParent').textContent = pfOn ? ps.length : ''; $('#nParent').hidden = !pfOn; $('#nSkill').textContent = sfOn ? rows.length : ''; $('#nSkill').hidden = !sfOn;
		const t = S.doc.targets; $('#tierSum').textContent = K.tierActive(t) ? t.t1.filter(Boolean).length + '人' + (t.t2.length ? '＋次善' + t.t2.length : '') : '';
		stage.classList.toggle('ov', S.lv === 0); stage.classList.toggle('lv2', S.lv === 2);
		stage.onscroll = null;
		if (!S.doc.parents.length) { V = null; stage.innerHTML = '<div class="empty"><span>まだ親がいません。UmaStar の OCR から送るか、バックアップを読み込んでください。</span><button class="btn" type="button" id="emptyData">バックアップ・仮のデータ</button></div>'; $('#emptyData').onclick = openData; return; }
		if (!cols.length || !rows.length) { V = null; stage.innerHTML = '<div class="empty"><span>条件に合う親かスキルがありません。</span><button class="btn" type="button" id="emptyClear">絞り込みを外す</button></div>'; $('#emptyClear').onclick = () => { S.pf = { bundle: null, style: new Set(), owner: new Set(), tier: false }; S.sf = { cat: new Set(), dist: new Set(), style: new Set(), q: '', want: true }; $('#sf-q').value = ''; S.onlyMiss = false; renderAll(); }; return; }
		if (S.lv === 0) drawOverview(ps, rows, cols); else drawTable(ps, rows, cols, force);
		S.perf.lastRender = performance.now() - t0;
	}
	const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
	function drawOverview(ps, rows, cols) {
		const M = S.M; stage.innerHTML = ''; V = null;
		const W = stage.clientWidth - 2, barT = 22, barR = 26, gap = 2;
		const cw = Math.max(3, Math.floor((W - barR - gap) / cols.length)), ch = Math.max(3, Math.min(cw, rows.length > 80 ? 8 : 12));
		const GR = S.settings.geneRows ? (S.six && S.A && S.B ? 1 : 3) : 0, GH = GR ? ch * GR + 4 : 0;
		const w = cw * cols.length, h = ch * rows.length;
		const cv = document.createElement('canvas'); const dpr = window.devicePixelRatio || 1; const CW = w + gap + barR, CH = barT + gap + GH + h;
		cv.className = 'ov'; cv.width = CW * dpr; cv.height = CH * dpr; cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
		cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', '全体（スキル' + rows.length + '行×' + cols.length + '列）。押した所を縮小で開く');
		const g = cv.getContext('2d'); g.scale(dpr, dpr);
		const C = { h0: cssv('--dk-h0'), hl: cssv('--dk-hl'), h1: cssv('--dk-h1'), h2: cssv('--dk-h2'), h3: cssv('--dk-h3'), unk: cssv('--dk-unk'), gp: cssv('--dk-gp'), sel: cssv('--dk-sel') };
		const heat = (n) => C['h' + n];
		const colN = cols.map((c) => rows.reduce((n, s) => n + ((c.kind === 'p' ? M.famHas(c.p, s.id) : M.ok(c.m.skills[s.id])) ? 1 : 0), 0));
		const maxC = Math.max(1, ...colN);
		g.fillStyle = C.h2;
		cols.forEach((c, x) => { const bh = Math.round((barT - 4) * colN[x] / maxC); g.fillRect(x * cw + 1, barT - bh, Math.max(1, cw - 2), bh); });
		const par = (S.six && S.A && S.B) ? selected() : ps;
		rows.forEach((s, y) => { const n = par.reduce((m, p) => Math.max(m, M.triple(p, s.id)), 0); const bw = Math.round((barR - 4) * n / 9); g.fillRect(w + gap, barT + gap + GH + y * ch + 1, bw, Math.max(1, ch - 2)); });
		if (GR) cols.forEach((c, x) => { for (let k = 0; k < GR; k++) { g.fillStyle = heat(geneAt(c, k)); g.fillRect(x * cw, barT + gap + k * ch, cw, ch); } });
		rows.forEach((s, y) => cols.forEach((c, x) => {
			const [cls] = cellInfo(c, s.id); const X = x * cw, Y = barT + gap + GH + y * ch; const k = cls.split(' ')[0];
			g.fillStyle = k === 'unk' ? C.h0 : k === 'cl' ? C.hl : heat(k.slice(1)); g.fillRect(X, Y, cw, ch);
			if (k === 'unk') { g.fillStyle = C.unk; g.fillRect(X + cw / 4, Y + ch / 4, cw / 2, ch / 2); }
			if (cls.includes('gp')) { g.fillStyle = C.gp; g.fillRect(X + cw * .3, Y + ch * .3, cw * .4, ch * .4); }
		}));
		if (!(S.six && S.A && S.B)) ['A', 'B'].forEach((k) => { const x = cols.findIndex((c) => c.p.id === S[k]); if (x < 0) return; g.strokeStyle = C.sel; g.lineWidth = 1.5; g.strokeRect(x * cw + .75, barT + gap + .75, cw - 1.5, GH + h - 1.5); });
		cv.addEventListener('click', (e) => { const rc = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - rc.left) / cw), y = Math.floor((e.clientY - rc.top - barT - gap - GH) / ch); if (x < 0 || x >= cols.length) return; setLevel(1, { row: Math.max(0, Math.min(rows.length - 1, y)), col: x }); });
		stage.appendChild(cv);
	}
	function drawTable(ps, rows, cols, force) {
		const M = S.M, d = dims(), six = S.six && S.A && S.B, GR = S.settings.geneRows ? (six ? 1 : 3) : 0;
		const par = six ? selected() : ps;
		const rowMax = rows.map((s) => par.reduce((m, p) => Math.max(m, M.triple(p, s.id)), 0));
		const colN = cols.map((c) => rows.reduce((n, s) => n + ((c.kind === 'p' ? M.famHas(c.p, s.id) : M.ok(c.m.skills[s.id])) ? 1 : 0), 0));
		const R = GR + rows.length, L = d.nw + d.mw, totalW = L + cols.length * d.cw, totalH = d.hh + R * d.rh;
		const keep = V && !force && V.key === S.lv + ':' + six + ':' + cols.length + ':' + rows.length;
		stage.innerHTML = '<div class="vs" style="width:' + totalW + 'px;height:' + totalH + 'px"><div class="vp vb" id="vb"></div><div class="vp vh" id="vh"></div><div class="vp vl" id="vl"></div><div class="vp vc" id="vc" style="width:' + L + 'px;height:' + d.hh + 'px"></div></div>';
		const vb = $('#vb'), vh = $('#vh'), vl = $('#vl'), vc = $('#vc');
		if (!keep) { stage.scrollTop = 0; stage.scrollLeft = 0; }
		V = { key: S.lv + ':' + six + ':' + cols.length + ':' + rows.length, ps, rows, cols, r: [-1, -1], c: [-1, -1] };
		vc.innerHTML = '<button type="button" id="sortMax" class="' + (S.rs === 'max' ? 'sorted' : '') + '" title="1家系の★の合計のうち最大。押すと大きい順">' + (S.lv === 2 ? 'スキル ＼ 親　' : '') + '最大' + (S.rs === 'max' ? '▼' : '') + '</button>';
		$('#sortMax').onclick = () => { S.rs = S.rs === 'max' ? 'def' : 'max'; renderAll(); };
		const fz = (w) => 'width:' + w + 'px;min-width:' + w + 'px;max-width:' + w + 'px';
		const OV = 4;
		const labels = six ? ['遺伝子'] : (S.lv === 1 ? ['遺·親', '遺·祖1', '遺·祖2'] : ['遺伝子：親', '遺伝子：祖1', '遺伝子：祖2']);
		function render(r0, r1, c0, c1) {
			V.r = [r0, r1]; V.c = [c0, c1];
			// 上の見出し
			const colg = ('<col style="width:' + d.cw + 'px">').repeat(c1 - c0);
			let hh = '<table style="width:' + ((c1 - c0) * d.cw) + 'px"><colgroup>' + colg + '</colgroup><thead><tr style="height:' + d.hh + 'px">';
			for (let x = c0; x < c1; x++) { const c = cols[x]; const uma = c.kind === 'p' ? c.p.uma : c.m.uma; const fr = (c.kind === 'p' ? c.p.owner : c.m.owner) === 'friend';
				const sel = c.kind === 'p' ? (c.p.id === S.A ? ' sA' : c.p.id === S.B ? ' sB' : '') : (c.k === 0 ? (c.role === 'A' ? ' sA' : ' sB') : '');
				const nm = S.lv === 1 ? K.shortName(uma) : K.charaName(uma);
				const pre = c.kind === 'm' ? c.role + ' ' : (S.lv === 2 ? (c.p.id === S.A ? 'A ' : c.p.id === S.B ? 'B ' : '') : '');
				hh += '<th class="' + (fr ? 'fr' : '') + sel + (c.kind === 'm' ? ' role' : '') + '" data-c="' + x + '" style="' + fz(d.cw) + ';font-size:' + d.fs + 'px" title="' + K.esc(K.fullName(uma)) + '"><div class="vt">' + K.esc(pre + nm) + '</div><span class="cn">' + colN[x] + '</span></th>'; }
			vh.innerHTML = hh + '</tr></thead></table>';
			// 左の名前と最大
			let lh = '<table style="width:' + L + 'px"><colgroup><col style="width:' + d.nw + 'px"><col style="width:' + d.mw + 'px"></colgroup><tbody>';
			for (let y = r0; y < r1; y++) {
				if (y < GR) { let mx = 0; cols.forEach((c) => { mx = Math.max(mx, geneAt(c, y)); }); lh += '<tr style="height:' + d.rh + 'px"><th class="gl' + (y === GR - 1 ? ' gsep' : '') + '" style="' + fz(d.nw) + ';font-size:' + d.fs + 'px" title="レース条件・脚質に合う遺伝子の数（最大3）">' + labels[y] + '</th><th class="mx c' + mx + (y === GR - 1 ? ' gsep' : '') + '" style="' + fz(d.mw) + '">' + mx + '</th></tr>'; continue; }
				const s = rows[y - GR], n = rowMax[y - GR], lv = n === 0 ? 0 : n <= 3 ? 1 : n <= 6 ? 2 : 3;
				lh += '<tr style="height:' + d.rh + 'px"><th data-r="' + (y - GR) + '" style="' + fz(d.nw) + ';font-size:' + d.fs + 'px" title="' + K.esc(s.name) + '">' + K.esc(s.name) + '</th><th class="mx c' + lv + '" style="' + fz(d.mw) + '">' + n + '</th></tr>';
			}
			vl.innerHTML = lh + '</tbody></table>';
			// 本体
			let bh = '<table style="width:' + ((c1 - c0) * d.cw) + 'px"><colgroup>' + colg + '</colgroup><tbody>';
			for (let y = r0; y < r1; y++) {
				bh += '<tr style="height:' + d.rh + 'px">';
				for (let x = c0; x < c1; x++) { const c = cols[x]; const sel = c.kind === 'p' ? (c.p.id === S.A ? ' sA' : c.p.id === S.B ? ' sB' : '') : '';
					if (y < GR) { const n = geneAt(c, y); bh += '<td class="c' + n + (y === GR - 1 ? ' gsep' : '') + sel + '" data-g="' + y + '" data-c="' + x + '" style="' + fz(d.cw) + '">' + (S.lv === 2 && n ? n : '') + '</td>'; continue; }
					const s = rows[y - GR]; const [cls, txt] = cellInfo(c, s.id);
					bh += '<td class="' + cls + sel + '" data-r="' + (y - GR) + '" data-c="' + x + '" style="' + fz(d.cw) + '">' + (S.lv === 2 ? txt : '') + '</td>'; }
				bh += '</tr>';
			}
			vb.innerHTML = bh + '</tbody></table>';
			vb.style.transform = 'translate(' + (L + c0 * d.cw) + 'px,' + (d.hh + r0 * d.rh) + 'px)';
		}
		function place() {
			const st = stage.scrollTop, sl = stage.scrollLeft;
			vc.style.transform = 'translate(' + sl + 'px,' + st + 'px)';
			vh.style.transform = 'translate(' + (L + V.c[0] * d.cw) + 'px,' + st + 'px)';
			vl.style.transform = 'translate(' + sl + 'px,' + (d.hh + V.r[0] * d.rh) + 'px)';
		}
		function update() {
			const st = stage.scrollTop, sl = stage.scrollLeft, vhh = stage.clientHeight, vww = stage.clientWidth;
			const r0 = Math.max(0, Math.floor((st - d.hh) / d.rh)), r1 = Math.min(R, Math.ceil((st + vhh - d.hh) / d.rh) + 1);
			const c0 = Math.max(0, Math.floor((sl - L) / d.cw)), c1 = Math.min(cols.length, Math.ceil((sl + vww - L) / d.cw) + 1);
			if (r0 < V.r[0] || r1 > V.r[1] || c0 < V.c[0] || c1 > V.c[1]) render(Math.max(0, r0 - OV), Math.min(R, r1 + OV), Math.max(0, c0 - OV), Math.min(cols.length, c1 + OV));
			place();
		}
		update();
		let raf = 0; stage.onscroll = () => { place(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
		// 押したとき（部品ごとに1つ）
		vh.onclick = (e) => { const th = e.target.closest('th[data-c]'); if (!th) return; const c = cols[+th.dataset.c]; openParent(c.p, c.kind === 'm' ? c.k : 0); };
		vl.onclick = (e) => { const th = e.target.closest('th[data-r]'); if (!th) return; openSkill(rows[+th.dataset.r]); };
		vb.onclick = (e) => { const td = e.target.closest('td'); if (!td) return; const c = cols[+td.dataset.c];
			if (td.dataset.g != null) { const ks = keysOf(c.p); const mem = memAt(c, +td.dataset.g); if (!mem) { toast('祖がいません'); return; } toast((c.kind === 'p' ? ['', '祖1 ', '祖2 '][+td.dataset.g] : c.pos + ' ') + K.charaName(mem.uma) + ' の遺伝子：' + M.geneText(mem, ks)); return; }
			const s = rows[+td.dataset.r]; const m = c.kind === 'p' ? M.fam(c.p)[0] : c.m; const v = m.skills[s.id]; const who = c.kind === 'p' ? K.charaName(c.p.uma) : c.pos + ' ' + K.charaName(m.uma);
			toast(who + '／' + s.name + '：' + (v > 0 ? '★' + v : v < 0 ? '★不明' : 'なし') + (c.kind === 'p' && M.gpOnly(c.p, s.id) ? '（祖が持つ）' : '')); };
		V.focusTo = (row, col) => { const y = d.hh + (GR + row) * d.rh, x = L + col * d.cw; stage.scrollTop = Math.max(0, y - stage.clientHeight / 2); stage.scrollLeft = Math.max(0, x - stage.clientWidth / 2); update(); const td = vb.querySelector('td[data-r="' + row + '"][data-c="' + col + '"]'); if (td) td.style.outline = '2px solid var(--dk-sel)'; };
	}
	function setLevel(lv, focus) { S.lv = lv; document.querySelectorAll('[data-lv]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.lv === lv ? 'true' : 'false')); renderStage(true); if (focus && V && V.focusTo) V.focusTo(focus.row, focus.col); }
	document.querySelectorAll('[data-lv]').forEach((b) => { b.onclick = () => setLevel(+b.dataset.lv); });

	/* ピンチ（2本指）とトラックパッドの ctrl+ホイールで段階を切り替える */
	let pinch = null;
	stage.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { const [a, b] = e.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), done: false }; } }, { passive: true });
	stage.addEventListener('touchmove', (e) => { if (!pinch || e.touches.length !== 2) return; e.preventDefault(); const [a, b] = e.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinch.done) return; if (d / pinch.d > 1.35 && S.lv < 2) { pinch.done = true; setLevel(S.lv + 1); } else if (d / pinch.d < .72 && S.lv > 0) { pinch.done = true; setLevel(S.lv - 1); } }, { passive: false });
	stage.addEventListener('touchend', () => { pinch = null; });
	/* スマホ: 1本指の移動を縦か横の一方に固定する（最初に大きく動いた向き）。離したら少し惰性で進む */
	let pan = null, inert = 0;
	stage.addEventListener('touchstart', (e) => { cancelAnimationFrame(inert); if (!isNarrow() || e.touches.length !== 1 || S.lv === 0) { pan = null; return; } const t = e.touches[0]; pan = { x: t.clientX, y: t.clientY, sl: stage.scrollLeft, st: stage.scrollTop, axis: null, lx: t.clientX, ly: t.clientY, lt: performance.now(), v: 0 }; }, { passive: true });
	stage.addEventListener('touchmove', (e) => { if (!pan || e.touches.length !== 1 || pinch) return; const t = e.touches[0]; const dx = t.clientX - pan.x, dy = t.clientY - pan.y; if (!pan.axis) { if (Math.hypot(dx, dy) < 6) return; pan.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; } e.preventDefault(); const now = performance.now(), dt = Math.max(1, now - pan.lt); if (pan.axis === 'x') { stage.scrollLeft = pan.sl - dx; pan.v = (t.clientX - pan.lx) / dt; } else { stage.scrollTop = pan.st - dy; pan.v = (t.clientY - pan.ly) / dt; } pan.lx = t.clientX; pan.ly = t.clientY; pan.lt = now; }, { passive: false });
	stage.addEventListener('touchend', () => { if (!pan || !pan.axis) { pan = null; return; } const axis = pan.axis; let v = pan.v * 16; pan = null; if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; const step = () => { if (Math.abs(v) < .5) return; if (axis === 'x') stage.scrollLeft -= v; else stage.scrollTop -= v; v *= .94; inert = requestAnimationFrame(step); }; inert = requestAnimationFrame(step); });
	let wheelAcc = 0, wheelT = 0;
	stage.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); wheelAcc += e.deltaY; const now = Date.now(); if (now - wheelT < 450) return; if (wheelAcc < -40 && S.lv < 2) { wheelT = now; wheelAcc = 0; setLevel(S.lv + 1); } else if (wheelAcc > 40 && S.lv > 0) { wheelT = now; wheelAcc = 0; setLevel(S.lv - 1); } }, { passive: false });

	/* ---------- 小窓 ---------- */
	function openSheet(html, focusSel) { $('#sheetIn').innerHTML = html; $('#sheet').hidden = false; $('#scrim').hidden = false; $('#sheet').scrollTop = 0; const c = $('#sheetIn ' + (focusSel || '.acts .btn')); if (c) c.focus({ preventScroll: true }); }
	function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; }
	$('#scrim').onclick = closeSheet; document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
	function bindClose() { $('#sheetIn').querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeSheet; }); }
	let toastT; function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200); }

	/* 親のカード。k=1,2 のときは祖から開いた（紐づいていればその親のカード、そうでなければ祖だけ） */
	function openParent(p, k) {
		const M = S.M, t = S.doc.targets;
		if (k) { const m = M.fam(p)[k]; if (m.linked && !m.missing) { p = M.byId.get(m.id); } else { openMember(p, k); return; } }
		const rows = visRowsRaw(); const n = rows.filter((s) => M.ok(p.skills[s.id])).length;
		const fam = M.fam(p);
		const gpHtml = fam.slice(1).map((m, i) => {
			const k2 = i + 1; const gpp = M.gpParents(m); const mm = rows.filter((s) => M.ok(m.skills[s.id])).length;
			const who = m.missing ? '（消えた親）' : K.fullName(m.uma);
			const head = m.linked && !m.missing ? '<button class="btn" type="button" data-open="' + m.id + '" style="min-height:32px;padding:0 8px;font-size:12px">カード</button>' : '';
			const gg = gpp ? '祖' + k2 + 'の親：' + gpp.map((y) => K.fullName(y.uma) + ' <span class="fz r"><span class="k">赤</span>' + K.esc(K.redText(y.red)) + '</span>').join('／') : '祖' + k2 + 'の親：分からない（紐づけなし）';
			return '<div class="gpb"><div class="gph"><b>祖' + k2 + '：' + K.esc(who) + '</b><span class="muted small">' + (m.linked ? (m.missing ? '紐づけ先なし' : '登録済み ' + M.code(M.byId.get(m.id))) : 'この親と一緒に登録') + '・対象' + mm + '種</span>' + head + '</div>' +
				'<div class="row">' + fzHtml(m) + '</div><div class="gg">遺伝子 ' + K.esc(M.geneText(m, keysOf(p))) + '</div><div class="gg">' + gg + '</div></div>';
		}).join('');
		const tierLine = K.tierActive(t) ? ['A', 'B'].map((s, si) => { const m = K.sideMatch(M, p, si, t); return '親' + s + '側 T1 ' + m.t1 + '・T2 ' + m.t2 + (m.reqOk ? '' : '（必須の親と違う）'); }).join('／') : '指定なし';
		const B = S.doc.bundles;
		openSheet('<h2 id="sheetTitle"><span class="' + (p.owner === 'friend' ? 'fr' : '') + '">' + K.esc(nameOf(p)) + '</span><span class="sub mono">' + M.codeFull(p) + '</span></h2>' +
			'<div class="row">' + fzHtml(p) + '</div>' +
			'<dl class="kv"><dt>まとまり</dt><dd class="row" id="cardBundles">' + B.map((b) => '<button class="chip" type="button" data-bundle="' + b.id + '" aria-pressed="' + ((p.bundles || []).includes(b.id) ? 'true' : 'false') + '" style="min-height:32px">' + K.esc(b.name) + '</button>').join('') + '</dd>' +
			'<dt>脚質</dt><dd class="row">' + Object.entries(K.STYLE).map(([v, tx]) => '<button class="chip" type="button" data-style="' + v + '" aria-pressed="' + ((p.tags.style || []).includes(v) ? 'true' : 'false') + '" style="min-height:32px">' + tx + '</button>').join('') + '</dd>' +
			'<dt>持ち主</dt><dd><span class="seg sm" role="group"><button type="button" data-owner="self" aria-pressed="' + (p.owner === 'self') + '">自分</button><button type="button" data-owner="friend" aria-pressed="' + (p.owner === 'friend') + '">フレンド</button></span></dd>' +
			'<dt>遺伝子</dt><dd>' + K.esc(M.geneText(p, keysOf(p))) + '</dd><dt>対象</dt><dd>表示中の' + rows.length + '種のうち' + n + '種（本人・★' + M.th + '以上）</dd><dt>目標</dt><dd>' + tierLine + '</dd></dl>' +
			gpHtml +
			'<div class="acts"><button class="btn pri" type="button" data-pick="A">親Aにする</button><button class="btn pri" type="button" data-pick="B">親Bにする</button><button class="btn danger" type="button" data-del style="flex:0 0 auto">消す</button><button class="btn" type="button" data-close style="flex:0 0 auto">閉じる</button></div>');
		const inn = $('#sheetIn');
		inn.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { const k2 = b.dataset.pick, o = k2 === 'A' ? 'B' : 'A'; if (S[o] === p.id) S[o] = null; S[k2] = p.id; closeSheet(); renderAll(); }; });
		inn.querySelectorAll('[data-bundle]').forEach((b) => { b.onclick = () => { const id = b.dataset.bundle; const a = p.bundles || (p.bundles = []); const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); b.setAttribute('aria-pressed', i < 0); saveParents([p]); rebuild(); renderAll(); }; });
		inn.querySelectorAll('[data-style]').forEach((b) => { b.onclick = () => { const v = b.dataset.style; const a = p.tags.style || (p.tags.style = []); const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); b.setAttribute('aria-pressed', i < 0); saveParents([p]); rebuild(); renderAll(); }; });
		inn.querySelectorAll('[data-owner]').forEach((b) => { b.onclick = () => { p.owner = b.dataset.owner; inn.querySelectorAll('[data-owner]').forEach((x) => x.setAttribute('aria-pressed', x === b)); saveParents([p]); rebuild(); renderAll(); }; });
		inn.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { const q = M.byId.get(b.dataset.open); if (q) openParent(q); }; });
		inn.querySelector('[data-del]').onclick = () => confirmDelete(p);
		bindClose();
	}
	function openMember(p, k) {
		const M = S.M, m = M.fam(p)[k];
		openSheet('<h2 id="sheetTitle">祖' + k + '：' + K.esc(m.missing ? '（消えた親）' : K.fullName(m.uma)) + '<span class="sub">' + K.esc(nameOf(p)) + ' の祖</span></h2><div class="row">' + fzHtml(m) + '</div>' +
			'<dl class="kv"><dt>遺伝子</dt><dd>' + K.esc(M.geneText(m, keysOf(p))) + '</dd><dt>スキル</dt><dd>' + Object.keys(m.skills).length + '種</dd></dl>' +
			'<div class="acts"><button class="btn pri" type="button" data-open>親のカード</button><button class="btn" type="button" data-close>閉じる</button></div>');
		$('#sheetIn [data-open]').onclick = () => openParent(p); bindClose();
	}
	function confirmDelete(p) {
		const M = S.M, deps = K.dependents(S.doc, p.id), mode = S.settings.delMode;
		const depList = deps.length ? '<div class="list">' + deps.map((q) => '<div><span>' + K.esc(nameOf(q)) + ' <span class="muted mono small">' + M.code(q) + '</span></span><span class="sc">祖として紐づけ</span></div>').join('') + '</div>' : '';
		const body = mode === 'block' && deps.length
			? '<div class="errbox">この親は' + deps.length + '人の祖として紐づいているので消せません。先に紐づけを外すか、「⋯」の表示の設定で消し方を「中身に写す」にしてください。</div>' + depList
			: (deps.length ? '<div class="warnbox">' + deps.length + '人の祖として紐づいています。消すと、その祖は今の中身を写した「紐づけなし」になります（祖の親の赤因子は分からなくなります）。</div>' + depList : '<p class="small muted">この親を消します。元に戻せません。</p>');
		openSheet('<h2 id="sheetTitle">消す<span class="sub">' + K.esc(nameOf(p)) + ' ' + M.codeFull(p) + '</span></h2>' + body +
			'<div class="acts">' + (mode === 'block' && deps.length ? '' : '<button class="btn danger" type="button" data-go>消す</button>') + '<button class="btn" type="button" data-close>やめる</button></div>', '[data-close]');
		const go = $('#sheetIn [data-go]'); if (go) go.onclick = async () => { const r = K.removeParent(S.doc, p.id, mode); if (r.blocked) return; try { await K.store.deleteParent(p.id); if (r.changed.length) await K.store.putParents(r.changed); } catch (e) { toast('消せませんでした'); return; } if (S.A === p.id) S.A = null; if (S.B === p.id) S.B = null; closeSheet(); rebuild(); renderAll(); toast('消しました' + (r.changed.length ? '（' + r.changed.length + '人の祖に写しました）' : '')); };
		bindClose();
	}
	function openSkill(s) {
		const M = S.M, ps = visParents();
		const list = ps.map((p) => { const f = M.fam(p); const v = f[0].skills[s.id]; const go = M.gpOnly(p, s.id); return { p, v: v == null ? 0 : v, go }; }).filter((x) => x.v !== 0 || x.go).sort((a, b) => (b.v < 0 ? .5 : b.v) - (a.v < 0 ? .5 : a.v));
		const tags = [K.CAT[s.cat]].concat(s.dist.map((d) => K.DIST[d]), s.style.map((d) => K.STYLE[d]), s.surface.map((d) => K.SURF[d]));
		openSheet('<h2 id="sheetTitle">' + K.esc(s.name) + '<span class="sub">' + K.esc(tags.join('・')) + '／表示中の親' + ps.length + '人のうち' + list.length + '人</span></h2>' +
			'<div class="list">' + (list.map((x) => '<button type="button" data-p="' + x.p.id + '"><span><span class="' + (x.p.owner === 'friend' ? 'fr' : '') + '">' + K.esc(K.charaName(x.p.uma)) + '</span> <span class="muted mono small">' + M.code(x.p) + '</span></span><span class="sc">' + (x.v > 0 ? '★' + x.v : x.v < 0 ? '★不明' : '祖が持つ') + '</span></button>').join('') || '<div><span class="muted">持っている親はいません</span></div>') + '</div>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>');
		$('#sheetIn').querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => openParent(M.byId.get(b.dataset.p)); }); bindClose();
	}
	/* 親Bのおすすめ */
	$('#recB').onclick = () => {
		if (!S.A) { toast('先に親Aを選んでください（列の見出しから）'); return; }
		const M = S.M, A = M.byId.get(S.A), ps = visParents(), rows = visRowsRaw(), t = S.doc.targets;
		const r = K.recommendB(M, A, ps, rows, t, keysOf, 8);
		openSheet('<h2 id="sheetTitle">親Bのおすすめ<span class="sub">親A ' + K.esc(nameOf(A)) + ' の家系が持たない' + r.lack.length + '種を多く埋める順（同数なら★の合計、次に遺伝子）</span></h2>' +
			'<div class="recs" style="display:flex;flex-direction:column;gap:6px">' + r.list.map((x) => '<div class="rec"><span class="' + (x.p.owner === 'friend' ? 'fr' : '') + '">' + K.esc(nameOf(x.p)) + ' <span class="muted mono small">' + M.code(x.p) + '</span></span><span class="sc">埋める ' + x.n + '/' + r.lack.length + '・★' + x.st + '・遺伝子' + x.g + (x.tm ? '・T1 ' + x.tm.t1 + '・T2 ' + x.tm.t2 : '') + '</span><button class="btn pri" type="button" data-b="' + x.p.id + '">Bにする</button></div>').join('') + '</div>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>');
		$('#sheetIn').querySelectorAll('[data-b]').forEach((b) => { b.onclick = () => { S.B = b.dataset.b; closeSheet(); renderAll(); }; }); bindClose();
	};
	/* 2組を探す */
	$('#recPair').onclick = () => {
		const M = S.M, ps = visParents(), rows = visRowsRaw(), t = S.doc.targets;
		const t0 = performance.now(); const r = K.findPairs(M, ps, rows, t, keysOf, 8); S.perf.pairs = performance.now() - t0;
		openSheet('<h2 id="sheetTitle">2組を探す<span class="sub">表示中の親' + ps.length + '人から2家系（6人）を選ぶ' + r.total.toLocaleString() + '通り。スキル' + rows.length + '種の充足が多い順' + (K.tierActive(t) ? '（必須の親が合う組を先に、次に目標の一致）' : '') + '</span></h2>' +
			'<div style="display:flex;flex-direction:column;gap:6px">' + r.top.map((x, k) => '<div class="rec"><span>' + K.esc(K.charaName(x.a.uma)) + ' <span class="muted mono small">' + M.code(x.a) + '</span> ＋ ' + K.esc(K.charaName(x.b.uma)) + ' <span class="muted mono small">' + M.code(x.b) + '</span></span><span class="sc">' + (x.ts ? (x.tsc < 0 ? '必須なし・' : 'T1 ' + (x.ts[0].t1 + x.ts[1].t1) + '・T2 ' + (x.ts[0].t2 + x.ts[1].t2) + '・') : '') + x.n + '/' + rows.length + '・遺伝子' + x.g + '</span><button class="btn pri" type="button" data-k="' + k + '">この2組</button></div>').join('') + '</div>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>');
		$('#sheetIn').querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { const x = r.top[+b.dataset.k]; S.A = x.a.id; S.B = x.b.id; closeSheet(); renderAll(); }; }); bindClose();
	};
	/* 2組の詳細（充足の数を押す） */
	function openPairDetail() {
		const M = S.M, sel = selected(); if (!sel.length) { toast('列の見出しを押して親A・親Bを選ぶと充足が出ます'); return; }
		const rows = visRowsRaw(), cov = covered(rows), miss = rows.filter((s) => !cov.includes(s)), t = S.doc.targets;
		const parts = []; [S.A, S.B].forEach((id, si) => { const p = id && M.byId.get(id); if (!p) return; const tm = K.tierActive(t) ? K.sideMatch(M, p, si, t) : null; M.fam(p).forEach((m, k) => parts.push('<div><span>' + K.POS[si * 3 + k] + '　' + K.esc(K.charaName(m.uma)) + ' <span class="muted small">' + K.esc(K.uniqName(m.uma)) + '</span></span><span class="sc">' + K.starText(m.green) + (tm && tm.marks[k] ? '　' + tm.marks[k] : '') + '</span></div>')); });
		const gm = sel.flatMap((p) => { const ks = keysOf(p); return M.fam(p).map((m) => M.geneN(m, ks)); });
		const reds = (list) => { const m = {}; list.forEach((r) => { if (!r) return; const k = K.RED[r[0]]; m[k] = (m[k] || 0) + Math.max(0, r[1]); }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '★' + v).join('・') || 'なし'; };
		const lv1 = [], lv2 = []; let unknown = 0; sel.forEach((p) => { M.fam(p).forEach((m, k) => { lv1.push(m.red); if (k) { const gp = M.gpParents(m); if (gp) gp.forEach((y) => lv2.push(y.red)); else unknown += 2; } }); });
		openSheet('<h2 id="sheetTitle">2組の充足<span class="sub mono">' + cov.length + '/' + rows.length + '（' + (S.settings.gp ? '親＋祖' : '親だけ') + '・★' + M.th + '以上）</span></h2>' +
			'<div class="list">' + parts.join('') + '</div>' +
			'<dl class="kv"><dt>遺伝子</dt><dd>' + gm.filter((n) => n >= 1).length + '/' + gm.length + '人が1種以上・' + gm.filter((n) => n >= 2).length + '人が2種以上（合計' + gm.reduce((a, n) => a + n, 0) + '）</dd><dt>赤因子</dt><dd>親と祖：' + K.esc(reds(lv1)) + '<br>祖の親：' + K.esc(reds(lv2)) + (unknown ? '（' + unknown + '人は分からない）' : '') + '</dd><dt>足りない</dt><dd>' + miss.length + '種：' + K.esc(miss.map((s) => s.name).join('、') || 'なし') + '</dd></dl>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>');
		bindClose();
	}
	$('#cov').onclick = openPairDetail; $('#cov').style.cursor = 'pointer';

	/* ---------- 下の帯 ---------- */
	function renderDock() {
		const M = S.M, sel = selected();
		['A', 'B'].forEach((k) => { const p = S[k] && M.byId.get(S[k]); const el = $('#slot' + k + ' .nm'); el.textContent = p ? K.charaName(p.uma) + ' ' + M.code(p) : '未選択'; el.classList.toggle('none', !p); el.classList.toggle('fr', !!p && p.owner === 'friend'); });
		$('#onlyMiss').hidden = !sel.length; $('#sixCols').hidden = !(S.A && S.B); $('#clearSel').hidden = !sel.length;
		$('#onlyMiss').setAttribute('aria-pressed', S.onlyMiss ? 'true' : 'false'); $('#sixCols').setAttribute('aria-pressed', S.six ? 'true' : 'false');
		if (!sel.length) { $('#cov').innerHTML = '—<small>充足</small>'; $('#miss').textContent = '列の見出しを押して親A・親Bを選ぶ'; return; }
		const rows = visRowsRaw(), cov = covered(rows), miss = rows.filter((s) => !cov.includes(s));
		$('#cov').innerHTML = cov.length + '/' + rows.length + '<small>充足</small>';
		$('#miss').textContent = '足りない' + miss.length + '種：' + (miss.map((s) => s.name).join('、') || 'なし');
	}
	$('#slotA').onclick = () => { const p = S.A && S.M.byId.get(S.A); if (p) openParent(p); else toast('列の見出しを押して親Aを選ぶ'); };
	$('#slotB').onclick = () => { const p = S.B && S.M.byId.get(S.B); if (p) openParent(p); else toast('列の見出しを押して親Bを選ぶ'); };
	$('#onlyMiss').onclick = () => { S.onlyMiss = !S.onlyMiss; renderAll(); };
	$('#sixCols').onclick = () => { S.six = !S.six; renderAll(); };
	$('#clearSel').onclick = () => { S.A = S.B = null; S.onlyMiss = false; S.six = false; renderAll(); };

	/* ---------- 書き出しを促す（仮） ---------- */
	function renderNudge() {
		const el = $('#nudge'); const n = S.doc.parents.length; const d = K.daysSince(S.settings.lastExport);
		if (!n) { el.hidden = true; return; }
		if (d == null) { el.hidden = false; el.className = 'nudge'; el.textContent = '未書き出し'; return; }
		if (d >= 7) { el.hidden = false; el.className = 'nudge'; el.textContent = '書き出し ' + d + '日前'; return; }
		el.hidden = true;
	}
	$('#nudge').onclick = openData;

	/* ---------- データ（バックアップ・設定・仮のデータ） ---------- */
	function openData() {
		const d = K.daysSince(S.settings.lastExport), st = S.settings;
		const seg = (name, cur, items) => '<span class="seg sm" role="group">' + items.map(([v, t]) => '<button type="button" data-set="' + name + '" data-v="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + t + '</button>').join('') + '</span>';
		openSheet('<h2 id="sheetTitle">バックアップ<span class="sub">α版：データの形が変わることがあります。ときどき書き出してください。</span></h2>' +
			'<div class="opt"><span>最後の書き出し：' + (d == null ? 'まだ' : d === 0 ? '今日' : d + '日前') + '　<span class="muted small">親' + S.doc.parents.length + '人</span></span></div>' +
			'<div class="row"><button class="btn pri" type="button" id="exportBtn" style="flex:1">書き出す（JSON）</button><button class="btn" type="button" id="importBtn" style="flex:1">読み込む</button></div>' +
			'<p class="small muted">iPhone の Safari は、しばらく開かないとデータを消すことがあります。書き出したファイルを「ファイル」に残してください。</p>' +
			'<h2 style="font-size:14px">表示の設定<span class="sub">案の切り替え</span></h2>' +
			'<div class="opt"><span class="k">最初の段階</span>' + seg('lv0', st.lv0, [[0, '全体'], [1, '縮小'], [2, '拡大']]) + '</div>' +
			'<div class="opt"><span class="k">消し方</span>' + seg('delMode', st.delMode, [['copy', '祖に写して消す'], ['block', '紐づけ中は消せない']]) + '</div>' +
			'<div class="opt"><span class="k">因子の札</span>' + seg('chipColor', st.chipColor, [[true, '色つき'], [false, '単色']]) + '</div>' +
			'<div class="opt"><span class="k">見た目</span>' + seg('theme', st.theme, [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']]) + '</div>' +
			'<h2 style="font-size:14px">仮のデータ<span class="sub">モックの確認用</span></h2>' +
			'<div class="row"><button class="btn" type="button" data-mock="30">親30人</button><button class="btn" type="button" data-mock="100">親100人</button><button class="btn" type="button" data-mock="300">親300人</button><button class="btn danger" type="button" id="wipeBtn">全部消す</button></div>' +
			'<div class="row"><span class="muted small">登録の画面を試す：</span><a class="btn" href="register.html?case=a">親Aだけ</a><a class="btn" href="register.html?case=b">家系3人</a><a class="btn" href="register.html?case=c">読めない所あり</a><a class="btn" href="register.html?case=d">フレンド</a></div>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>', '[data-close]');
		$('#exportBtn').onclick = doExport; $('#importBtn').onclick = () => { $('#importFile').value = ''; $('#importFile').click(); };
		$('#sheetIn').querySelectorAll('[data-set]').forEach((b) => { b.onclick = () => { const k = b.dataset.set; let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^\d+$/.test(v)) v = +v; S.settings[k] = v; saveSettings(); if (k === 'theme') K.applyTheme(S.fixedTheme || v); if (k === 'chipColor') document.body.classList.toggle('mono-chips', !v); openData(); if (k === 'theme') renderStage(true); }; });
		$('#sheetIn').querySelectorAll('[data-mock]').forEach((b) => { b.onclick = () => setMock(+b.dataset.mock); });
		$('#wipeBtn').onclick = async () => { await K.store.clear(); S.doc = K.assemble(await K.store.load()); S.A = S.B = null; rebuild(); closeSheet(); renderAll(); toast('全部消しました'); };
		bindClose();
	}
	$('#menuBtn').onclick = openData;
	async function setMock(n) { const m = K.makeMock(n, 11); await K.store.replaceAll(m); S.settings.mockN = n; saveSettings(); const t0 = performance.now(); S.doc = K.assemble(await K.store.load()); S.perf.load = performance.now() - t0; S.A = S.B = null; rebuild(); closeSheet(); renderAll(); toast('仮のデータを親' + n + '人で入れ直しました'); }
	async function doExport() {
		const doc = K.buildExport(S.doc); const text = JSON.stringify(doc); const name = K.exportFileName();
		const blob = new Blob([text], { type: 'application/json' });
		let done = false;
		try { if (navigator.canShare && navigator.share) { const f = new File([blob], name, { type: 'application/json' }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); done = true; } } } catch (e) { if (e && e.name === 'AbortError') return; }
		if (!done) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
		S.settings.lastExport = new Date().toISOString(); saveSettings(); renderNudge(); toast('書き出しました（' + name + '・' + Math.round(text.length / 1024) + 'KB）'); openData();
	}
	$('#importFile').onchange = async () => {
		const f = $('#importFile').files[0]; if (!f) return; const text = await f.text(); const r = K.parseImport(text);
		if (r.error) { openSheet('<h2 id="sheetTitle">読み込めません</h2><div class="errbox">' + K.esc(r.error) + '</div><p class="small muted">' + K.esc(f.name) + '</p><div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>'); bindClose(); return; }
		const doc = r.doc;
		openSheet('<h2 id="sheetTitle">読み込む<span class="sub">' + K.esc(f.name) + '</span></h2><dl class="kv"><dt>親</dt><dd>' + doc.parents.length + '人（今は' + S.doc.parents.length + '人）</dd><dt>保存日時</dt><dd>' + K.esc(doc.savedAt || '不明') + '</dd><dt>版</dt><dd>' + r.fromSchema + (r.migrated ? '（今の形に直して読みます）' : '') + '</dd></dl>' +
			'<div class="acts"><button class="btn pri" type="button" data-rep>置き換える</button><button class="btn" type="button" data-add>今のデータに足す</button><button class="btn" type="button" data-close>やめる</button></div>', '[data-close]');
		$('#sheetIn [data-rep]').onclick = async () => { await K.store.replaceAll(doc); S.doc = K.assemble(await K.store.load()); S.A = S.B = null; rebuild(); closeSheet(); renderAll(); toast('置き換えました（親' + doc.parents.length + '人）'); };
		$('#sheetIn [data-add]').onclick = async () => {
			const have = new Set(S.doc.parents.map((p) => p.id)); let next = S.doc.next; const map = {}; const add = [];
			doc.parents.forEach((p) => { const q = JSON.parse(JSON.stringify(p)); if (have.has(q.id)) { map[p.id] = 'p' + next; q.id = 'p' + next; next++; } add.push(q); });
			add.forEach((q) => { (q.gp || []).forEach((g) => { if (g.link && map[g.link]) g.link = map[g.link]; }); });
			const bIds = new Set(S.doc.bundles.map((b) => b.id)); doc.bundles.forEach((b) => { if (!bIds.has(b.id)) S.doc.bundles.push(b); });
			S.doc.next = Math.max(next, S.doc.next); S.doc.parents = S.doc.parents.concat(add);
			await K.store.putParents(add); await saveHead(); rebuild(); closeSheet(); renderAll(); toast('足しました（親' + add.length + '人）');
		};
		bindClose();
	};

	/* ---------- 道具・引き出し ---------- */
	function applyPanes() {
		const n = isNarrow();
		document.querySelectorAll('[data-pane]').forEach((el) => { el.hidden = n && el.dataset.pane !== S.pane; });
		$('#panes').hidden = n && !S.pane;
		document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === S.pane ? 'true' : 'false'));
	}
	document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { S.pane = S.pane === b.dataset.tab ? null : b.dataset.tab; applyPanes(); renderStage(true); }; });
	$('#cs').onchange = (e) => { S.cs = e.target.value; renderStage(true); };
	$('#rs').onchange = (e) => { S.rs = e.target.value; renderStage(true); };
	let qT; $('#sf-q').oninput = (e) => { S.sf.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => renderStage(true), 150); };
	document.querySelectorAll('[data-th]').forEach((b) => { b.onclick = () => { S.settings.th = +b.dataset.th; saveSettings(); rebuild(); renderAll(); }; });
	$('#gpToggle').onclick = () => { S.settings.gp = !S.settings.gp; saveSettings(); rebuild(); renderAll(); };
	$('#geneToggle').onclick = () => { S.settings.geneRows = !S.settings.geneRows; saveSettings(); renderAll(); };
	let rzT, wasNarrow = isNarrow(); window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { const n = isNarrow(); if (n !== wasNarrow) { wasNarrow = n; applyPanes(); } renderStage(true); }, 150); });
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!S.doc) return; K.applyTheme(S.fixedTheme || S.settings.theme); renderStage(true); });

	function renderAll() { renderFilters(); renderTier(); applyPanes(); renderStage(true); renderDock(); renderNudge(); }

	/* ---------- 計測（報告用。window.__deckV9.measure() で呼ぶ） ---------- */
	const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	async function measure() {
		const out = { parents: S.doc.parents.length, rows: S.M.rows.length, load: S.perf.load, model: S.perf.model };
		for (const lv of [0, 1, 2]) { const t0 = performance.now(); setLevel(lv); await frame(); out['lv' + lv] = +(performance.now() - t0).toFixed(1); }
		setLevel(1); await frame();
		const sw = stage.scrollWidth - stage.clientWidth, sh = stage.scrollHeight - stage.clientHeight; let sum = 0;
		for (let k = 1; k <= 10; k++) { stage.scrollTop = Math.round(sh * k / 10); stage.scrollLeft = Math.round(sw * ((k * 3) % 10) / 10); const t0 = performance.now(); stage.dispatchEvent(new Event('scroll')); await frame(); sum += performance.now() - t0; }
		out.scroll = +(sum / 10).toFixed(1);
		const ps = visParents(), rows = visRowsRaw(); const t1 = performance.now(); const r = K.findPairs(S.M, ps, rows, S.doc.targets, keysOf, 8); out.pairs = +(performance.now() - t1).toFixed(1); out.pairsTotal = r.total;
		const t2 = performance.now(); K.recommendB(S.M, ps[0], ps, rows, S.doc.targets, keysOf, 8); out.recB = +(performance.now() - t2).toFixed(1);
		const t3 = performance.now(); JSON.stringify(K.buildExport(S.doc)); out.export = +(performance.now() - t3).toFixed(1);
		return out;
	}

	init();
})();
