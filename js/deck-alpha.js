/* js/deck-alpha.js — 新しい Deck の α版（T88・C-275）の本体。モック版13（lab/deck-v13/deck-v13-deck.js。T87）の見た目と動きをそのまま移した。
 * 版13 から変えたのは、C-275 の 5（「⋯」の仮のデータ・終了をまねる・登録の画面を試すを入れない）・6（文の直し）・4（「ホーム画面に追加」の案内）と、
 * ツール切り替えの行をほかのツールのページへのリンクにしたこと。以下は版13 の説明。
 * Deck 本体（ヒートマップの表・親の小窓・2組・本育成設計・レース/周回セット・バックアップ）。版12（T86・C-273）:
 * マスの塗りと数字は親と祖の合計の5段・親本人の★は左上の小さな数字・PC は左の列に5つの欄を全部並べる・1つだけ選ぶ欄は帯・複数選べる欄は札。
 * 版13（T87・C-274）: 縮小と遺伝子の行にも左上の親本人の★・分類の「そのほか」の札を外す・親の小窓と祖の詳細に対象スキルの列挙（序盤／中盤／終盤／その他）・
 * 親Bだけのときは「親Aのおすすめ」・スマホの惰性のスクロール・スキルの小窓は対象スキル数の多い順・文の変更・「分類ごと」の色の帯と凡例。
 * 表は見える範囲だけ描く（T74 の (c)）。名前と最大の列・親の名前と数の行は、別の部品を重ねて固定する。
 * URL: ?theme=light|dark（見た目の固定）・?lv=0|1|2・?pane=parent|skill|view|sort|plan・?set=none|r:race-0002|arc:medium・?A=p3&B=p9・?six=1・
 *      ?sheet=data|card:p3|pair|set|tool（撮影用）
 */
(function () {
	'use strict';
	const DECK_ALPHA_JS_VERSION = '2026-11-02a';
	const K = window.DeckAlpha;
	const $ = (s) => document.querySelector(s);
	const Q = new URLSearchParams(location.search);
	const stage = $('#stage');
	const isNarrow = () => matchMedia('(max-width: 720px)').matches;

	const S = { doc: null, settings: null, M: null, lv: 1, pane: null, A: null, B: null, rs: 'def', cs: 'def',
		pf: { style: new Set(), owner: new Set() }, sf: { list: 'all', cat: new Set(), dist: new Set(), style: new Set(), q: '' },
		onlyMiss: false, six: false, fixedTheme: null, perf: {}, pm: new Map() };

	/* ---------- 起動 ---------- */
	async function init() {
		const th = Q.get('theme'); if (th === 'light' || th === 'dark') S.fixedTheme = th;
		let loaded;
		try { loaded = await K.store.load(); } catch (e) { stage.innerHTML = '<div class="empty">この端末では保存が使えません（' + K.esc(e.message) + '）</div>'; return; }
		S.perf.load = loaded.ms;
		S.settings = Object.assign({}, K.DEFAULT_SETTINGS, loaded.meta.settings || {});
		K.applyTheme(S.fixedTheme || S.settings.theme);
		S.doc = K.assemble(loaded);
		await runArchive();
		if (Q.has('set')) S.settings.cur = Q.get('set');
		if (!K.findSet(S.doc, S.settings.cur)) S.settings.cur = 'none';
		S.lv = Q.has('lv') ? +Q.get('lv') : 1;
		if (Q.get('A')) S.A = Q.get('A'); if (Q.get('B')) S.B = Q.get('B'); if (Q.get('six') === '1') S.six = true;
		applySetDefaults();
		rebuild();
		renderAll();
		if (Q.get('pane')) { S.pane = Q.get('pane'); applyPanes(); renderStage(true); }
		const sh = Q.get('sheet'); if (sh === 'data') openData(); else if (sh && sh.startsWith('card:')) { const p = S.M.byId.get(sh.slice(5)); if (p) nav(() => parentSheet(p)); } else if (sh === 'pair') openPairDetail(); else if (sh === 'set') openSetPicker(); else if (sh === 'tool') openTool();
		// 検査から読む口（画面には出ない）
		window.__deckAlpha = { version: DECK_ALPHA_JS_VERSION, S, K, measure, draw: () => renderStage(true), openData, inertia: () => inert !== 0 };
	}
	/** 終了したレースを終了レースのカテゴリへ（開いたときと、バックアップを読み込んだとき） */
	async function runArchive() {
		const cur = S.settings.cur; const curSet = K.findSet(S.doc, cur);
		const r = K.archiveEnded(S.doc);
		if (!r.moved.length) return;
		try { if (r.changed.length) await K.store.putParents(r.changed); await K.store.putHead(S.doc); } catch (e) { toast('保存できませんでした'); }
		if (curSet && curSet.kind === 'race' && !K.findSet(S.doc, cur)) S.settings.cur = 'arc:' + (curSet.race.surface === 'dirt' ? 'dirt' : curSet.race.distanceCategory);
		toast('終了したレースを付け替えました：' + r.moved.join('、'));
	}
	function rebuild() { const t0 = performance.now(); S.M = K.makeModel(S.doc, S.settings); S.perf.model = performance.now() - t0; }
	const saveSettings = () => K.store.putMeta('settings', S.settings).catch(() => toast('設定を保存できませんでした'));
	const saveHead = () => K.store.putHead(S.doc).catch(() => toast('保存できませんでした'));
	const saveParents = (list) => K.store.putParents(list).catch(() => toast('保存できませんでした'));

	/* ---------- レース/周回セット ---------- */
	const curSet = () => K.findSet(S.doc, S.settings.cur);
	const curKey = () => (curSet() ? S.settings.cur : 'none');
	/** セットを選んだとき: 「一覧」の絞りだけ戻す。脚質の絞りは利用者が自分で選ぶ（①の脚質は入れない。C-272 の 1。選んだ脚質はセットを変えても残る） */
	function applySetDefaults() { S.sf.list = 'all'; }
	function pickSet(key) { S.settings.cur = key; saveSettings(); applySetDefaults(); renderAll(); }
	/** 遺伝子の行の条件: 距離とバ場はセットの条件、脚質は親(列)の脚質の絞り（C-271 の 23） */
	function cond() { const c = K.setCond(curSet()); return { dist: c.dist, surface: c.surface, styles: [...S.pf.style] }; }
	const grows = () => S.M.geneRowsOf(cond());

	/* ---------- 本育成設計（セットごとに1つ保存。C-271 の 16） ---------- */
	function plan() { const k = curKey(); return S.doc.plans[k] || (S.doc.plans[k] = K.emptyPlan()); }
	const planActive = () => { const pl = S.doc.plans[curKey()]; return !!pl && pl.applied && K.planFull(pl); };

	/* ---------- 見える親・行 ---------- */
	function visParents() {
		const M = S.M, f = S.pf, s = curSet(), pa = planActive(), pl = pa ? plan() : null;
		S.pm = new Map();
		let ps = S.doc.parents.filter((p) => {
			if (s && !(p.sets || []).includes(s.id)) return false;
			if (f.style.size && !(p.tags.style || []).some((x) => f.style.has(x))) return false;
			if (f.owner.size && !f.owner.has(p.owner)) return false;
			if (pa) { const m = K.planMatch(M, p, pl); if (!m) return false; S.pm.set(p.id, m); }
			return true;
		});
		const rows = visRowsRaw();
		if (S.cs === 'def') ps.sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
		else if (S.cs === 'many') { const c = (p) => rows.reduce((n, x) => n + (M.famHas(p, x.id) ? 1 : 0), 0); const cc = new Map(ps.map((p) => [p.id, c(p)])); ps.sort((a, b) => cc.get(b.id) - cc.get(a.id) || b.date.localeCompare(a.date)); }
		else if (S.cs === 'owner') ps.sort((a, b) => (a.owner === b.owner ? (b.date.localeCompare(a.date) || b.no - a.no) : a.owner === 'self' ? -1 : 1));
		if (pa) ps = ps.filter((p) => S.pm.get(p.id) === 1).concat(ps.filter((p) => S.pm.get(p.id) === 2)); // (1) そのまま使える → (2) 祖にできる
		return ps;
	}
	/** 行の母集団: セットを選んでいればそのセットのスキルの一覧、「指定なし」なら親が持っているスキル全部（C-271 の 4） */
	function visRowsRaw() {
		const f = S.sf, q = f.q.trim(), s = curSet();
		const base = s ? Object.keys(s.skills).map(K.skill).sort((a, b) => a.order - b.order) : S.M.rows;
		const twoLists = s && s.kind === 'race' && s.sends > 1;
		return base.filter((x) => {
			if (twoLists && f.list !== 'all') { const old = K.oldOnly(s, x.id); if (f.list === 'new' ? old : !old) return false; }
			if (f.cat.size && !f.cat.has(x.cat)) return false;
			if (f.dist.size && !x.dist.some((d) => f.dist.has(d))) return false;
			if (f.style.size && !x.style.some((d) => f.style.has(d))) return false;
			if (q && !x.name.includes(q)) return false;
			return true;
		});
	}
	function selected() { return [S.A, S.B].map((id) => id && S.M.byId.get(id)).filter(Boolean); }
	function covered(rows) { const sel = selected(); return rows.filter((s) => sel.some((p) => S.M.famHas(p, s.id))); }
	function visRows(ps) {
		const M = S.M; let rows = visRowsRaw();
		if (S.onlyMiss && selected().length) { const cov = new Set(covered(rows).map((s) => s.id)); rows = rows.filter((s) => !cov.has(s.id)); }
		if (S.rs === 'few') { const all = S.doc.parents; const c = (s) => all.reduce((n, p) => n + (M.famHas(p, s.id) ? 1 : 0), 0); const cc = new Map(rows.map((s) => [s.id, c(s)])); rows.sort((a, b) => cc.get(a.id) - cc.get(b.id) || a.order - b.order); }
		else if (S.rs === 'max') { const mx = new Map(rows.map((s) => [s.id, rowMaxOf(ps, s.id)])); rows.sort((a, b) => mx.get(b.id) - mx.get(a.id) || a.order - b.order); }
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

	/* ---------- 文言の部品（青・赤・緑の因子は色で分かるので「青」「赤」「緑」の字は出さない。C-271 の 22） ---------- */
	function nameOf(p) { return K.fullName(p.uma); }
	function fzHtml(p) {
		const g = p.green == null ? '—' : K.starText(p.green);
		return '<span class="fz b' + (p.blue ? '' : ' none') + '" title="青因子">' + K.esc(K.blueText(p.blue)) + '</span>' +
			'<span class="fz r' + (p.red ? '' : ' none') + '" title="赤因子">' + K.esc(K.redText(p.red)) + '</span>' +
			'<span class="fz g' + (p.green == null ? ' none' : '') + '" title="緑因子">' + K.esc(K.uniqName(p.uma) || '固有') + ' ' + g + '</span>';
	}

	/* ---------- 引き出しの部品 ---------- */
	/** 複数選べる欄: 角の四角い札（選んだ札は青で塗って「✓」。C-273 の 14） */
	function chips(el, items, isOn, onTap) { el.innerHTML = ''; items.forEach(([v, t, dis]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tag'; b.textContent = t; b.disabled = !!dis; b.setAttribute('aria-pressed', isOn(v) ? 'true' : 'false'); b.onclick = () => { onTap(v); renderAll(); }; el.appendChild(b); }); }
	/** 1つだけ選ぶ欄: 1本につながった帯（選んだ所だけ塗る。C-273 の 13） */
	function segOf(el, items, isOn, onTap, label) { el.innerHTML = ''; const g = document.createElement('span'); g.className = 'seg sm'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); items.forEach(([v, t]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-pressed', isOn(v) ? 'true' : 'false'); b.onclick = () => { onTap(v); renderAll(); }; g.appendChild(b); }); el.appendChild(g); }
	const toggleSet = (set, v) => set.has(v) ? set.delete(v) : set.add(v);
	function renderFilters() {
		chips($('#pf-style'), Object.entries(K.STYLE), (v) => S.pf.style.has(v), (v) => toggleSet(S.pf.style, v));
		chips($('#pf-owner'), [['self', '自分'], ['friend', 'フレンド']], (v) => S.pf.owner.has(v), (v) => toggleSet(S.pf.owner, v));
		const s = curSet(), two = !!s && s.kind === 'race' && s.sends > 1;
		$('#sf-listRow').hidden = !two;
		if (two) segOf($('#sf-list'), [['all', '全部'], ['new', '最新の一覧'], ['old', '前回までだけ']], (v) => S.sf.list === v, (v) => { S.sf.list = v; }, 'スキルの一覧');
		// 分類の「そのほか」の札は出さない（C-274 の 3）
		chips($('#sf-cat'), Object.entries(K.CAT).filter(([v]) => v !== 'other'), (v) => S.sf.cat.has(v), (v) => toggleSet(S.sf.cat, v));
		chips($('#sf-dist'), Object.entries(K.DIST), (v) => S.sf.dist.has(v), (v) => toggleSet(S.sf.dist, v));
		chips($('#sf-style'), Object.entries(K.STYLE), (v) => S.sf.style.has(v), (v) => toggleSet(S.sf.style, v));
		$('#cs').value = S.cs; $('#rs').value = S.rs;
		$('#catLegendRow').hidden = S.rs !== 'cat'; // 分類の色の凡例は「分類ごと」のときだけ（C-274 の 15）
		document.querySelectorAll('[data-th]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.th === S.settings.th ? 'true' : 'false'));
		document.querySelectorAll('[data-lv]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.lv === S.lv ? 'true' : 'false'));
		$('#gpToggle').setAttribute('aria-pressed', S.settings.gp ? 'true' : 'false');
		$('#geneToggle').setAttribute('aria-pressed', S.settings.geneRows ? 'true' : 'false');
		$('#dotParent').hidden = !(S.pf.style.size || S.pf.owner.size);
		$('#dotSkill').hidden = !(S.sf.cat.size || S.sf.dist.size || S.sf.style.size || S.sf.q.trim() || (two && S.sf.list !== 'all'));
		$('#dotSort').hidden = S.cs === 'def' && S.rs === 'def';
		$('#dotPlan').hidden = !planActive();
	}
	function renderHeader() {
		const s = curSet();
		$('#setText').textContent = K.setShort(s);
		$('#setBtn').setAttribute('aria-label', 'レース/周回セット：' + K.setName(s));
		$('#setBtn').title = K.setName(s);
		const dark = document.documentElement.getAttribute('data-theme') === 'dark';
		$('#themeBtn').textContent = dark ? '☀' : '☾';
	}

	/* ---------- 本育成設計の系譜図（横向き: 親A → 祖A1・祖A2、親B → 祖B1・祖B2。C-271 の 13） ---------- */
	const pedHtml = (s, cur) => {
		const slot = (i) => { const c = s[i] && K.costume(s[i]); return '<button class="pslot' + (i % 3 === 0 ? ' pp' : '') + (c ? '' : ' empty') + (i === cur ? ' cur' : '') + '" type="button" data-slot="' + i + '" aria-label="' + K.POS[i] + '：' + K.esc(c ? K.fullName(s[i]) : '未指定') + '"' + (i === cur ? ' aria-current="true"' : '') + '><span class="pl">' + K.POS[i] + '</span>' + (c ? '<span class="pn">' + K.esc(c.chara) + '</span><span class="pt">［' + K.esc(c.title) + '］</span>' : '<span class="pn muted">未指定</span>') + '</button>'; };
		const grp = (k) => '<div class="grp">' + slot(k * 3) + '<span class="br" aria-hidden="true"></span><div class="gps">' + slot(k * 3 + 1) + slot(k * 3 + 2) + '</div></div>';
		return grp(0) + grp(1);
	};
	function renderPlan() {
		const pl = plan(), s = pl.slots;
		$('#planTree').innerHTML = pedHtml(s, -1);
		$('#planTree').querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => nav(() => slotSheet(+b.dataset.slot)); });
		// PC の左の列: 6枠を縦に並べた簡単な形。押すと系譜図の小窓（C-273 の 10）
		$('#planList').innerHTML = s.map((u, i) => { const c = u && K.costume(u); return '<button class="pslot' + (i % 3 ? ' gp' : '') + (c ? '' : ' empty') + '" type="button" data-slot="' + i + '" aria-label="' + K.POS[i] + '：' + K.esc(c ? K.fullName(u) : '未指定') + '"><span class="pl">' + K.POS[i] + '</span>' + (c ? '<span class="pn">' + K.esc(c.chara) + '</span><span class="pt">［' + K.esc(c.title) + '］</span>' : '<span class="pn muted">未指定</span>') + '</button>'; }).join('');
		$('#planList').querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => nav(() => slotSheet(+b.dataset.slot, true)); });
		const full = K.planFull(pl), act = planActive();
		$('#planGo').disabled = !full || act; $('#planOff').hidden = !act; $('#planClear').disabled = !s.some(Boolean);
		const left = s.filter((x) => !x).length;
		if (act) { visParents(); let n1 = 0, n2 = 0; S.pm.forEach((m) => { if (m === 1) n1++; else n2++; }); $('#planSum').innerHTML = '◎ そのまま使える <b>' + n1 + '</b>人・○ 祖にできる <b>' + n2 + '</b>人'; }
		else $('#planSum').textContent = left ? 'あと' + left + '人' : '';
	}
	function setSlot(i, uma) { const pl = plan(); pl.slots[i] = uma; if (!K.planFull(pl)) pl.applied = false; saveHead(); }
	$('#planGo').onclick = () => { const pl = plan(); if (!K.planFull(pl)) return; pl.applied = true; saveHead(); renderAll(); };
	$('#planOff').onclick = () => { plan().applied = false; saveHead(); renderAll(); };
	$('#planClear').onclick = () => { S.doc.plans[curKey()] = K.emptyPlan(); saveHead(); renderAll(); };
	/** 枠を押したとき: テキスト検索で衣装を指定（C-271 の 14） */
	const kata = (t) => t.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
	/** tree: PC の左の列の枠から開いたとき。上に横向きの系譜図を出し、枠を押すとその枠の衣装を探す（C-273 の 10） */
	function slotSheet(i, tree) {
		const pl = plan(); const cur = pl.slots[i];
		openSheet((tree ? '<div class="ped" id="sheetPed">' + pedHtml(pl.slots, i) + '</div>' : '') + '<h2 id="sheetTitle">' + K.POS[i] + 'の衣装<span class="sub">' + K.esc(cur ? K.fullName(cur) : '未指定') + '</span></h2>' +
			'<input class="txt" id="cosQ" type="search" placeholder="二つ名かキャラ名で探す" aria-label="二つ名かキャラ名で探す" autocomplete="off" />' +
			'<div class="list" id="cosList"></div>' +
			'<div class="acts">' + (cur ? '<button class="btn" type="button" data-unset>指定を外す</button>' : '') + '<button class="btn" type="button" data-close>閉じる</button></div>', '#cosQ');
		const all = K.D.costumes.slice().sort((a, b) => (a.chara + a.title).localeCompare(b.chara + b.title, 'ja'));
		const draw = () => {
			const q = kata($('#cosQ').value.trim());
			const hit = q ? all.filter((c) => kata('［' + c.title + '］' + c.chara).includes(q)) : [];
			$('#cosList').innerHTML = q ? (hit.slice(0, 40).map((c) => '<button type="button" data-cos="' + c.id + '"' + (c.id === cur ? ' aria-current="true"' : '') + '><span>［' + K.esc(c.title) + '］' + K.esc(c.chara) + '</span>' + (c.id === cur ? '<span class="sc">指定中</span>' : '') + '</button>').join('') + (hit.length > 40 ? '<div><span class="muted small">ほか' + (hit.length - 40) + '件</span></div>' : '') || '<div><span class="muted">見つかりません</span></div>') : '';
			$('#cosList').querySelectorAll('[data-cos]').forEach((b) => { b.onclick = () => { setSlot(i, b.dataset.cos); back(); renderAll(); }; });
		};
		$('#cosQ').oninput = draw; draw();
		if (tree) $('#sheetPed').querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => { const j = +b.dataset.slot; curView = () => slotSheet(j, true); slotSheet(j, true); }; });
		const un = $('#sheetIn [data-unset]'); if (un) un.onclick = () => { setSlot(i, null); back(); renderAll(); };
		bindClose();
	}

	/* ---------- 表 ---------- */
	let V = null; // 描いている表の状態
	function dims() {
		const n = isNarrow(), six = S.six && S.A && S.B;
		if (S.lv === 1) return { cw: 18, rh: 18, nw: n ? 76 : 112, mw: 24, hh: six ? 92 : 76, fs: 10 };
		return { cw: 30, rh: 30, nw: n ? 128 : 184, mw: 30, hh: six ? 150 : 136, fs: 12 };
	}
	/* マスの塗り（C-273 の 1〜3）: 親と祖の合計（親★＋祖1★＋祖2★、0〜9）の5段。1-2／3-4／5-6／7-8／9。0 は空のマス。
	 * 合計に入れるのは基準（★1以上／★2以上）を満たす★だけ。★不明は「★1以上」なら★1として足し、「★2以上」なら足さない（どちらも印を付ける）。
	 * 「祖2人も数える」を切ったときは親本人だけ（0〜3）。6人で見るときは1人ずつ（0〜3）。 */
	const lv5 = (n) => n <= 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : 5;
	const starOf = (v) => v == null || v === 0 ? 0 : v < 0 ? (S.M.th === 1 ? 1 : 0) : v >= S.M.th ? v : 0;
	/** 親と祖の合計: { n: 合計, own: 親本人の★（0 は持たない・-1 は★不明）, unk: 合計に★不明が入るか（★2以上のときは入らない）, parts: [親・祖1・祖2 の生の値] } */
	function famSum(p, sid) {
		const M = S.M, f = M.fam(p), mem = M.gpOn ? f.slice(0, 3) : f.slice(0, 1);
		const parts = mem.map((m) => (m && m.skills[sid]) || 0);
		return { n: parts.reduce((a, v) => a + starOf(v), 0), own: parts[0], unk: parts.some((v) => v < 0), parts };
	}
	/** 左上の親本人の★（持たないときは空）。縮小では中央の数字を出さずこれだけ出す（C-274 の 1） */
	const ownHtml = (v) => v ? '<i class="own">' + (v < 0 ? '?' : v) + '</i>' : '';
	/** [塗りの class, 拡大の中身, 縮小の中身] */
	function cellInfo(col, sid) {
		if (col.kind === 'm') { const v = col.m.skills[sid] || 0, n = starOf(v); return ['c' + lv5(n) + (v < 0 ? ' unk' : ''), n ? n + (v < 0 ? '?' : '') : (v < 0 ? '?' : ''), '']; }
		const r = famSum(col.p, sid);
		const own = S.M.gpOn ? ownHtml(r.own) : '';
		return ['c' + lv5(r.n) + (r.unk ? ' unk' : ''), own + (r.n ? r.n + (r.unk && S.M.th === 1 ? '?' : '') : ''), ownHtml(r.own)];
	}
	const rowMaxOf = (par, sid) => par.reduce((m, p) => Math.max(m, famSum(p, sid).n), 0);
	/* 遺伝子の行（C-271 の 23）: 列 c の行 g の★の数。親の列は「祖2人も数える」なら祖2人も足す。6人で見るときは1人ずつ。塗りはマスと同じ5段 */
	function geneAt(c, g) { return c.kind === 'p' ? S.M.geneFam(c.p, g) : S.M.geneStar(c.m, g); }
	/** 遺伝子の行のマスの中身（マスと同じ表し方: 拡大は合計＋左上の親本人の★、縮小は左上の親本人の★だけ。C-274 の 1） */
	function geneCell(c, g, n) {
		if (c.kind !== 'p') return S.lv === 2 && n ? String(n) : '';
		const own = S.M.geneStar(S.M.fam(c.p)[0], g);
		if (S.lv === 2) return (S.M.gpOn ? ownHtml(own) : '') + (n ? n : '');
		return ownHtml(own);
	}
	function geneLv(c, n) { return lv5(n); }
	function renderStage(force) {
		const t0 = performance.now();
		const ps = visParents(), rows = visRows(ps), cols = columns(ps);
		stage.classList.toggle('ov', S.lv === 0); stage.classList.toggle('lv2', S.lv === 2);
		stage.onscroll = null;
		if (!S.doc.parents.length) { V = null; stage.innerHTML = '<div class="empty"><span>まだ親がいません。UmaStar の OCR から送るか、バックアップを読み込んでください。</span><button class="btn" type="button" id="emptyData">バックアップ</button></div>'; $('#emptyData').onclick = openData; return; }
		const s = curSet();
		if (s && !S.doc.parents.some((p) => (p.sets || []).includes(s.id))) { V = null; stage.innerHTML = '<div class="empty"><span>このセットにはまだ親がいません。</span><button class="btn" type="button" id="emptyNone">指定なしで見る</button></div>'; $('#emptyNone').onclick = () => pickSet('none'); return; }
		if (!cols.length || !rows.length) { V = null; stage.innerHTML = '<div class="empty"><span>条件に合う親かスキルがありません。</span><button class="btn" type="button" id="emptyClear">絞り込みを外す</button></div>'; $('#emptyClear').onclick = () => { S.pf = { style: new Set(), owner: new Set() }; S.sf = { list: 'all', cat: new Set(), dist: new Set(), style: new Set(), q: '' }; $('#sf-q').value = ''; S.onlyMiss = false; const pl = S.doc.plans[curKey()]; if (pl) { pl.applied = false; saveHead(); } renderAll(); }; return; }
		if (S.lv === 0) drawOverview(ps, rows, cols); else drawTable(ps, rows, cols, force);
		S.perf.lastRender = performance.now() - t0;
	}
	const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
	function drawOverview(ps, rows, cols) {
		const M = S.M; stage.innerHTML = ''; V = null;
		const G = S.settings.geneRows ? grows() : [];
		const W = stage.clientWidth - 2, barT = 22, barR = 26, gap = 2;
		const cw = Math.max(3, Math.floor((W - barR - gap) / cols.length)), ch = Math.max(3, Math.min(cw, rows.length > 80 ? 8 : 12));
		const GR = G.length, GH = GR ? ch * GR + 4 : 0;
		const w = cw * cols.length, h = ch * rows.length;
		const cv = document.createElement('canvas'); const dpr = window.devicePixelRatio || 1; const CW = w + gap + barR, CH = barT + gap + GH + h;
		cv.className = 'ov'; cv.width = CW * dpr; cv.height = CH * dpr; cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
		cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', '全体（スキル' + rows.length + '行×' + cols.length + '列）。押した所を縮小で開く');
		const g = cv.getContext('2d'); g.scale(dpr, dpr);
		const C = { h0: cssv('--dk-h0'), h1: cssv('--dk-s1'), h2: cssv('--dk-s2'), h3: cssv('--dk-s3'), h4: cssv('--dk-s4'), h5: cssv('--dk-s5'), unk: cssv('--dk-unk'), sel: cssv('--dk-sel') };
		const heat = (n) => C['h' + n];
		const colN = cols.map((c) => rows.reduce((n, s) => n + ((c.kind === 'p' ? M.famHas(c.p, s.id) : M.ok(c.m.skills[s.id])) ? 1 : 0), 0));
		const maxC = Math.max(1, ...colN);
		g.fillStyle = C.h3;
		cols.forEach((c, x) => { const bh = Math.round((barT - 4) * colN[x] / maxC); g.fillRect(x * cw + 1, barT - bh, Math.max(1, cw - 2), bh); });
		const par = (S.six && S.A && S.B) ? selected() : ps;
		rows.forEach((s, y) => { const n = rowMaxOf(par, s.id); const bw = Math.round((barR - 4) * n / 9); g.fillRect(w + gap, barT + gap + GH + y * ch + 1, bw, Math.max(1, ch - 2)); });
		if (GR) cols.forEach((c, x) => { G.forEach((gr, k) => { g.fillStyle = heat(geneLv(c, geneAt(c, gr))); g.fillRect(x * cw, barT + gap + k * ch, cw, ch); }); });
		rows.forEach((s, y) => cols.forEach((c, x) => {
			const [cls] = cellInfo(c, s.id); const X = x * cw, Y = barT + gap + GH + y * ch; const k = cls.split(' ')[0];
			g.fillStyle = heat(k.slice(1)); g.fillRect(X, Y, cw, ch);
			if (cls.includes('unk')) { g.fillStyle = C.unk; g.fillRect(X + cw / 4, Y + ch / 4, cw / 2, ch / 2); }
		}));
		if (!(S.six && S.A && S.B)) ['A', 'B'].forEach((k) => { const x = cols.findIndex((c) => c.p.id === S[k]); if (x < 0) return; g.strokeStyle = C.sel; g.lineWidth = 1.5; g.strokeRect(x * cw + .75, barT + gap + .75, cw - 1.5, GH + h - 1.5); });
		cv.addEventListener('click', (e) => { const rc = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - rc.left) / cw), y = Math.floor((e.clientY - rc.top - barT - gap - GH) / ch); if (x < 0 || x >= cols.length) return; setLevel(1, { row: Math.max(0, Math.min(rows.length - 1, y)), col: x }); });
		stage.appendChild(cv);
	}
	function drawTable(ps, rows, cols, force) {
		const M = S.M, d = dims(), six = S.six && S.A && S.B, G = S.settings.geneRows ? grows() : [], GR = G.length, s0 = curSet();
		const par = six ? selected() : ps;
		const rowMax = rows.map((s) => rowMaxOf(par, s.id));
		const colN = cols.map((c) => rows.reduce((n, s) => n + ((c.kind === 'p' ? M.famHas(c.p, s.id) : M.ok(c.m.skills[s.id])) ? 1 : 0), 0));
		const R = GR + rows.length, L = d.nw + d.mw, totalW = L + cols.length * d.cw, totalH = d.hh + R * d.rh;
		const keep = V && !force && V.key === S.lv + ':' + six + ':' + cols.length + ':' + rows.length;
		stage.innerHTML = '<div class="vs" style="width:' + totalW + 'px;height:' + totalH + 'px"><div class="vp vb" id="vb"></div><div class="vp vh" id="vh"></div><div class="vp vl" id="vl"></div><div class="vp vc" id="vc" style="width:' + L + 'px;height:' + d.hh + 'px"></div></div>';
		const vb = $('#vb'), vh = $('#vh'), vl = $('#vl'), vc = $('#vc');
		if (!keep) { stage.scrollTop = 0; stage.scrollLeft = 0; }
		V = { key: S.lv + ':' + six + ':' + cols.length + ':' + rows.length, ps, rows, cols, r: [-1, -1], c: [-1, -1] };
		// 角: 親(列)の数・スキル(行)の数と「最大」（押すと大きい順）
		vc.innerHTML = '<div class="cnt mono">' + (six ? '6人' : ps.length + '人') + '<br>' + rows.length + '種</div><button type="button" id="sortMax" class="' + (S.rs === 'max' ? 'sorted' : '') + '" title="先代を含む★の合計のうち最大。押すと大きい順">' + (S.lv === 2 ? 'スキル ＼ 親　' : '') + '最大' + (S.rs === 'max' ? '▼' : '') + '</button>';
		$('#sortMax').onclick = () => { S.rs = S.rs === 'max' ? 'def' : 'max'; renderAll(); };
		const fz = (w) => 'width:' + w + 'px;min-width:' + w + 'px;max-width:' + w + 'px';
		const OV = 4;
		const glabel = (g) => (S.lv === 1 ? '遺·' : '遺伝子：') + g.label;
		function render(r0, r1, c0, c1) {
			V.r = [r0, r1]; V.c = [c0, c1];
			// 上の見出し（本育成設計で絞り込んでいるときは ◎＝そのまま使える・○＝祖にできる）
			const colg = ('<col style="width:' + d.cw + 'px">').repeat(c1 - c0);
			let hh = '<table style="width:' + ((c1 - c0) * d.cw) + 'px"><colgroup>' + colg + '</colgroup><thead><tr style="height:' + d.hh + 'px">';
			for (let x = c0; x < c1; x++) { const c = cols[x]; const uma = c.kind === 'p' ? c.p.uma : c.m.uma; const fr = (c.kind === 'p' ? c.p.owner : c.m.owner) === 'friend';
				const sel = c.kind === 'p' ? (c.p.id === S.A ? ' sA' : c.p.id === S.B ? ' sB' : '') : (c.k === 0 ? (c.role === 'A' ? ' sA' : ' sB') : '');
				const nm = S.lv === 1 ? K.shortName(uma) : K.charaName(uma);
				const pm = c.kind === 'p' ? S.pm.get(c.p.id) : 0;
				const pre = (pm === 1 ? '◎' : pm === 2 ? '○' : '') + (c.kind === 'm' ? c.role + ' ' : (S.lv === 2 ? (c.p.id === S.A ? 'A ' : c.p.id === S.B ? 'B ' : '') : ''));
				hh += '<th class="' + (fr ? 'fr' : '') + sel + (c.kind === 'm' ? ' role' : '') + (pm ? ' m' + pm : '') + '" data-c="' + x + '" style="' + fz(d.cw) + ';font-size:' + d.fs + 'px" title="' + K.esc(K.fullName(uma)) + '"><div class="vt">' + K.esc(pre + nm) + '</div><span class="cn">' + colN[x] + '</span></th>'; }
			vh.innerHTML = hh + '</tr></thead></table>';
			// 左の名前と最大（前回までの一覧にだけあるスキルは .old）
			let lh = '<table style="width:' + L + 'px"><colgroup><col style="width:' + d.nw + 'px"><col style="width:' + d.mw + 'px"></colgroup><tbody>';
			for (let y = r0; y < r1; y++) {
				if (y < GR) { const g = G[y]; let mx = 0, lvm = 0; cols.forEach((c) => { const n = geneAt(c, g); if (n > mx) { mx = n; lvm = geneLv(c, n); } }); lh += '<tr style="height:' + d.rh + 'px"><th class="gl' + (y === GR - 1 ? ' gsep' : '') + '" data-gr="' + y + '" style="' + fz(d.nw) + ';font-size:' + d.fs + 'px" title="' + K.esc(g.label) + 'の遺伝子の★の数">' + K.esc(glabel(g)) + '</th><th class="mx c' + lvm + (y === GR - 1 ? ' gsep' : '') + '" style="' + fz(d.mw) + '">' + mx + '</th></tr>'; continue; }
				const s = rows[y - GR], n = rowMax[y - GR], lv = lv5(n);
				// 「分類ごと」のときは、スキル名の欄の左端に分類の色の帯（C-274 の 14）
				const kc = (K.oldOnly(s0, s.id) ? 'old' : '') + (S.rs === 'cat' ? ' cb cb-' + s.cat : '');
				lh += '<tr style="height:' + d.rh + 'px"><th data-r="' + (y - GR) + '"' + (kc ? ' class="' + kc.trim() + '"' : '') + ' style="' + fz(d.nw) + ';font-size:' + d.fs + 'px" title="' + K.esc(s.name) + '">' + K.esc(s.name) + '</th><th class="mx c' + lv + '" style="' + fz(d.mw) + '">' + n + '</th></tr>';
			}
			vl.innerHTML = lh + '</tbody></table>';
			// 本体
			let bh = '<table style="width:' + ((c1 - c0) * d.cw) + 'px"><colgroup>' + colg + '</colgroup><tbody>';
			for (let y = r0; y < r1; y++) {
				bh += '<tr style="height:' + d.rh + 'px">';
				for (let x = c0; x < c1; x++) { const c = cols[x]; const sel = c.kind === 'p' ? (c.p.id === S.A ? ' sA' : c.p.id === S.B ? ' sB' : '') : '';
					if (y < GR) { const n = geneAt(c, G[y]); bh += '<td class="c' + geneLv(c, n) + (y === GR - 1 ? ' gsep' : '') + sel + '" data-g="' + y + '" data-c="' + x + '" style="' + fz(d.cw) + '">' + geneCell(c, G[y], n) + '</td>'; continue; }
					const s = rows[y - GR]; const [cls, txt, txt1] = cellInfo(c, s.id);
					bh += '<td class="' + cls + sel + '" data-r="' + (y - GR) + '" data-c="' + x + '" style="' + fz(d.cw) + '">' + (S.lv === 2 ? txt : txt1) + '</td>'; }
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
		vh.onclick = (e) => { const th = e.target.closest('th[data-c]'); if (!th) return; const c = cols[+th.dataset.c]; if (c.kind === 'm' && c.k) nav(() => memberOrLinked(c.p, c.k)); else nav(() => parentSheet(c.p)); };
		vl.onclick = (e) => { const th = e.target.closest('th[data-r]'); if (th) { nav(() => skillSheet(rows[+th.dataset.r])); return; } const gl = e.target.closest('th[data-gr]'); if (gl) toast(G[+gl.dataset.gr].label + 'の遺伝子の★の数' + (six ? '（1人ずつ）' : S.M.gpOn ? '（親＋祖2人）' : '（親だけ）')); };
		vb.onclick = (e) => { const td = e.target.closest('td'); if (!td) return; const c = cols[+td.dataset.c];
			if (td.dataset.g != null) { const g = G[+td.dataset.g]; if (c.kind === 'm') { toast(c.pos + ' ' + K.charaName(c.m.uma) + '：' + g.label + 'の遺伝子 ★' + M.geneStar(c.m, g)); return; } const f = M.fam(c.p); toast(K.charaName(c.p.uma) + '：' + g.label + 'の遺伝子 ★' + geneAt(c, g) + '（親 ★' + M.geneStar(f[0], g) + (M.gpOn ? '・祖1 ★' + M.geneStar(f[1], g) + '・祖2 ★' + M.geneStar(f[2], g) : '') + '）'); return; }
			const s = rows[+td.dataset.r]; const st = (v) => v > 0 ? '★' + v : v < 0 ? '★不明' : 'なし';
			if (c.kind === 'm') { toast(c.pos + ' ' + K.charaName(c.m.uma) + '／' + s.name + '：' + st(c.m.skills[s.id])); return; }
			const r = famSum(c.p, s.id);
			toast(K.charaName(c.p.uma) + '／' + s.name + '：' + (M.gpOn ? '合計 ' + r.n + '（親 ' + st(r.parts[0]) + '・祖1 ' + st(r.parts[1]) + '・祖2 ' + st(r.parts[2]) + '）' : st(r.parts[0]))); };
		V.focusTo = (row, col) => { const y = d.hh + (GR + row) * d.rh, x = L + col * d.cw; stage.scrollTop = Math.max(0, y - stage.clientHeight / 2); stage.scrollLeft = Math.max(0, x - stage.clientWidth / 2); update(); const td = vb.querySelector('td[data-r="' + row + '"][data-c="' + col + '"]'); if (td) td.style.outline = '2px solid var(--dk-sel)'; };
	}
	function setLevel(lv, focus) { S.lv = lv; document.querySelectorAll('[data-lv]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.lv === lv ? 'true' : 'false')); renderStage(true); if (focus && V && V.focusTo) V.focusTo(focus.row, focus.col); }
	document.querySelectorAll('[data-lv]').forEach((b) => { b.onclick = () => setLevel(+b.dataset.lv); });

	/* ピンチ（2本指）とトラックパッドの ctrl+ホイールで段階を切り替える */
	let pinch = null;
	stage.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { const [a, b] = e.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), done: false }; } }, { passive: true });
	stage.addEventListener('touchmove', (e) => { if (!pinch || e.touches.length !== 2) return; e.preventDefault(); const [a, b] = e.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinch.done) return; if (d / pinch.d > 1.35 && S.lv < 2) { pinch.done = true; setLevel(S.lv + 1); } else if (d / pinch.d < .72 && S.lv > 0) { pinch.done = true; setLevel(S.lv - 1); } }, { passive: false });
	stage.addEventListener('touchend', () => { pinch = null; });
	/* スマホ: 1本指の移動を縦か横の一方に固定する（最初に大きく動いた向き）。
	 * 指を離したあとも、離す直前の速さで惰性で進み、だんだん遅くなって止まる（C-274 の 8。向きは固定したまま）。
	 * 速さは離す直前 100ms の動きの平均（最後の1回の動きだけだと、離す瞬間の指の止まりで 0 に近くなり、すぐ止まっていた）。
	 * 指を止めてから離したとき（最後の動きから 80ms 以上）は惰性を付けない。減り方は 1ms ごとに 0.998 倍（iPhone の標準のスクロールと同じくらい）。端に着いたら止める。
	 * 動かしている間に表の見える範囲を描き直すと、指の下のマスの要素が入れ替わり、以後の touchmove・touchend が表（stage）まで上がってこない
	 * （外された要素に届く）。そのため、受け口は触り始めた要素そのものに付ける（外されたあとも、その要素自身には届く）。 */
	let pan = null, inert = 0;
	const FRICTION = 0.998, SAMPLE_MS = 100, HOLD_MS = 80, V_STOP = 0.02, V_MAX = 6;
	stage.addEventListener('touchstart', (e) => {
		cancelAnimationFrame(inert); inert = 0; if (pan) panOff();
		if (!isNarrow() || e.touches.length !== 1 || S.lv === 0) return;
		const t = e.touches[0]; pan = { x: t.clientX, y: t.clientY, sl: stage.scrollLeft, st: stage.scrollTop, axis: null, hist: [], tg: e.target };
		pan.tg.addEventListener('touchmove', panMove, { passive: false }); pan.tg.addEventListener('touchend', panEnd); pan.tg.addEventListener('touchcancel', panOff);
	}, { passive: true });
	function panOff() { if (!pan) return; pan.tg.removeEventListener('touchmove', panMove, { passive: false }); pan.tg.removeEventListener('touchend', panEnd); pan.tg.removeEventListener('touchcancel', panOff); pan = null; }
	function panMove(e) { if (!pan || e.touches.length !== 1 || pinch) return; const t = e.touches[0]; const dx = t.clientX - pan.x, dy = t.clientY - pan.y; if (!pan.axis) { if (Math.hypot(dx, dy) < 6) return; pan.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; } e.preventDefault(); const now = performance.now(); if (pan.axis === 'x') stage.scrollLeft = pan.sl - dx; else stage.scrollTop = pan.st - dy; pan.hist.push({ t: now, p: pan.axis === 'x' ? t.clientX : t.clientY }); while (pan.hist.length > 2 && now - pan.hist[0].t > SAMPLE_MS) pan.hist.shift(); }
	function panEnd() {
		if (!pan || !pan.axis) { panOff(); return; }
		const axis = pan.axis, h = pan.hist; panOff();
		if (h.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const a = h[0], b = h[h.length - 1], now = performance.now();
		if (now - b.t > HOLD_MS || b.t - a.t < 1) return;
		let v = Math.max(-V_MAX, Math.min(V_MAX, (b.p - a.p) / (b.t - a.t))); // px/ms（指の動き。スクロールは逆向き）
		let last = now, pos = axis === 'x' ? stage.scrollLeft : stage.scrollTop;
		const max = axis === 'x' ? stage.scrollWidth - stage.clientWidth : stage.scrollHeight - stage.clientHeight;
		const step = (ts) => {
			const dt = Math.min(50, Math.max(0, ts - last)); last = ts;
			if (Math.abs(v) < V_STOP) { inert = 0; return; }
			pos -= v * dt;
			const end = pos <= 0 || pos >= max; pos = Math.max(0, Math.min(max, pos)); // 端に着いたら止める
			if (axis === 'x') stage.scrollLeft = pos; else stage.scrollTop = pos;
			if (end) { inert = 0; return; }
			v *= Math.pow(FRICTION, dt);
			inert = requestAnimationFrame(step);
		};
		inert = requestAnimationFrame(step);
	}
	let wheelAcc = 0, wheelT = 0;
	stage.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); wheelAcc += e.deltaY; const now = Date.now(); if (now - wheelT < 450) return; if (wheelAcc < -40 && S.lv < 2) { wheelT = now; wheelAcc = 0; setLevel(S.lv + 1); } else if (wheelAcc > 40 && S.lv > 0) { wheelT = now; wheelAcc = 0; setLevel(S.lv - 1); } }, { passive: false });

	/* ---------- 小窓（下から出る）。nav で開いた小窓は積み重なり、「戻る」で前の小窓へ戻る（C-271 の 21） ---------- */
	let stack = [], curView = null;
	function nav(fn) { if (curView) stack.push(curView); curView = fn; fn(); }
	function back() { const fn = stack.pop(); curView = fn || null; if (fn) fn(); else closeSheet(); }
	function openSheet(html, focusSel) {
		$('#sheetIn').innerHTML = html; $('#sheet').hidden = false; $('#scrim').hidden = false; $('#sheet').scrollTop = 0;
		const acts = $('#sheetIn .acts'); if (acts && stack.length) { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = '戻る'; b.setAttribute('data-back', ''); b.style.flex = '0 0 auto'; acts.insertBefore(b, acts.firstChild); }
		const c = $('#sheetIn ' + (focusSel || '.acts .btn')); if (c) c.focus({ preventScroll: true });
	}
	function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; stack = []; curView = null; }
	$('#scrim').onclick = closeSheet; document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
	function bindClose() { $('#sheetIn').querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeSheet; }); $('#sheetIn').querySelectorAll('[data-back]').forEach((b) => { b.onclick = back; }); }
	let toastT; function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200); }

	/** 対象スキル（表示中のスキルのうち、その人が基準を満たして持つもの）を★付きで「序盤」「中盤」「終盤」「その他」に分けて列挙する（C-274 の 5・6）。空の区分は出さない */
	function targetHtml(m, rows) {
		const hit = rows.filter((s) => S.M.ok(m.skills[s.id]));
		if (!hit.length) return '<span class="muted">なし</span>';
		return '<div class="tgt">' + K.PHASE.map((ph, k) => { const a = hit.filter((s) => s.phase === k); return a.length ? '<div class="tgr"><span class="tgl">' + ph + '</span><span class="tgn">' + a.map((s) => K.esc(s.name) + '<span class="st">' + K.starText(m.skills[s.id]) + '</span>').join('、') + '</span></div>' : ''; }).join('') + '</div>';
	}
	/* 親の小窓 */
	function parentSheet(p) {
		const M = S.M, G = grows();
		if (!M.byId.has(p.id)) { back(); return; }
		const rows = visRowsRaw(); const n = rows.filter((s) => M.ok(p.skills[s.id])).length;
		const fam = M.fam(p);
		const gpHtml = fam.slice(1).map((m, i) => {
			const k2 = i + 1; const gpp = M.gpParents(m); const mm = rows.filter((s) => M.ok(m.skills[s.id])).length;
			const who = m.missing ? '（消えた親）' : K.fullName(m.uma);
			const det = m.missing ? '' : '<button class="btn" type="button" data-det="' + k2 + '" style="min-height:44px;padding:0 10px;font-size:12px">詳細</button>';
			// 祖の親は、親ごとに改行する（C-271 の 20）
			const gg = gpp ? '<div class="gg">祖' + k2 + 'の親</div><ul class="gpl">' + gpp.map((y) => '<li>' + K.esc(K.fullName(y.uma)) + ' <span class="fz r" title="赤因子">' + K.esc(K.redText(y.red)) + '</span></li>').join('') + '</ul>' : '<div class="gg">祖' + k2 + 'の親：分からない（紐づけなし）</div>';
			return '<div class="gpb"><div class="gph"><span><b>祖' + k2 + '：' + K.esc(who) + '</b><br><span class="muted small">' + (m.linked ? (m.missing ? '紐づけ先なし' : '登録済み ' + M.code(M.byId.get(m.id))) : 'この親と一緒に登録') + '・対象スキル' + mm + '種</span></span>' + det + '</div>' +
				'<div class="row">' + fzHtml(m) + '</div><div class="gg">遺伝子 ' + K.esc(M.geneText(m, G)) + '</div>' + gg + '</div>';
		}).join('');
		const sets = K.orderedSets(S.doc);
		openSheet('<h2 id="sheetTitle"><span class="' + (p.owner === 'friend' ? 'fr' : '') + '">' + K.esc(nameOf(p)) + '</span><span class="sub mono">' + M.codeFull(p) + '</span></h2>' +
			'<div class="row">' + fzHtml(p) + '</div>' +
			'<dl class="kv"><dt>セット</dt><dd class="row">' + (sets.map((s) => '<button class="tag" type="button" data-set="' + K.esc(s.id) + '" aria-pressed="' + ((p.sets || []).includes(s.id) ? 'true' : 'false') + '">' + K.esc(K.setName(s)) + '</button>').join('') || '<span class="muted">なし</span>') + '</dd>' +
			'<dt>脚質</dt><dd class="row">' + Object.entries(K.STYLE).map(([v, tx]) => '<button class="tag" type="button" data-style="' + v + '" aria-pressed="' + ((p.tags.style || []).includes(v) ? 'true' : 'false') + '">' + tx + '</button>').join('') + '</dd>' +
			'<dt>持ち主</dt><dd><span class="seg sm" role="group"><button type="button" data-owner="self" aria-pressed="' + (p.owner === 'self') + '">自分</button><button type="button" data-owner="friend" aria-pressed="' + (p.owner === 'friend') + '">フレンド</button></span></dd>' +
			'<dt>遺伝子</dt><dd>' + K.esc(M.geneText(p, G)) + '</dd><dt>対象スキル</dt><dd>表示中の' + rows.length + '種のうち' + n + '種（本人・★' + M.th + '以上）' + targetHtml(p, rows) + '</dd></dl>' +
			gpHtml +
			'<div class="acts"><button class="btn pri" type="button" data-pick="A">親Aにする</button><button class="btn pri" type="button" data-pick="B">親Bにする</button><button class="btn danger" type="button" data-del style="flex:0 0 auto">消す</button><button class="btn" type="button" data-close style="flex:0 0 auto">閉じる</button></div>');
		const inn = $('#sheetIn');
		inn.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { const k2 = b.dataset.pick, o = k2 === 'A' ? 'B' : 'A'; if (S[o] === p.id) S[o] = null; S[k2] = p.id; closeSheet(); renderAll(); }; });
		inn.querySelectorAll('[data-set]').forEach((b) => { b.onclick = () => { const id = b.dataset.set; const a = p.sets || (p.sets = []); const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); b.setAttribute('aria-pressed', i < 0); saveParents([p]); rebuild(); renderAll(); }; });
		inn.querySelectorAll('[data-style]').forEach((b) => { b.onclick = () => { const v = b.dataset.style; const a = p.tags.style || (p.tags.style = []); const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); b.setAttribute('aria-pressed', i < 0); saveParents([p]); rebuild(); renderAll(); }; });
		inn.querySelectorAll('[data-owner]').forEach((b) => { b.onclick = () => { p.owner = b.dataset.owner; inn.querySelectorAll('[data-owner]').forEach((x) => x.setAttribute('aria-pressed', x === b)); saveParents([p]); rebuild(); renderAll(); }; });
		inn.querySelectorAll('[data-det]').forEach((b) => { b.onclick = () => nav(() => memberOrLinked(p, +b.dataset.det)); });
		inn.querySelector('[data-del]').onclick = () => nav(() => confirmDelete(p));
		bindClose();
	}
	/** 祖の「詳細」: 紐づいていればその親の小窓、そうでなければ祖だけの小窓 */
	function memberOrLinked(p, k) { const m = S.M.fam(p)[k]; if (m && m.linked && !m.missing) parentSheet(S.M.byId.get(m.id)); else memberSheet(p, k); }
	function memberSheet(p, k) {
		const M = S.M, m = M.fam(p)[k], rows = visRowsRaw();
		if (!m) { toast('祖がいません'); back(); return; }
		openSheet('<h2 id="sheetTitle">祖' + k + '：' + K.esc(m.missing ? '（消えた親）' : K.fullName(m.uma)) + '<span class="sub">' + K.esc(nameOf(p)) + ' の祖</span></h2><div class="row">' + fzHtml(m) + '</div>' +
			'<dl class="kv"><dt>遺伝子</dt><dd>' + K.esc(M.geneText(m, grows())) + '</dd><dt>スキル</dt><dd>' + Object.keys(m.skills).length + '種</dd>' +
			'<dt>対象スキル</dt><dd>表示中の' + rows.length + '種のうち' + rows.filter((s) => M.ok(m.skills[s.id])).length + '種（★' + M.th + '以上）' + targetHtml(m, rows) + '</dd></dl>' +
			'<div class="acts">' + (stack.length ? '' : '<button class="btn pri" type="button" data-open>親の詳細</button>') + '<button class="btn" type="button" data-close>閉じる</button></div>');
		const o = $('#sheetIn [data-open]'); if (o) o.onclick = () => nav(() => parentSheet(p));
		bindClose();
	}
	function confirmDelete(p) {
		const M = S.M, deps = K.dependents(S.doc, p.id);
		const depList = deps.length ? '<div class="list">' + deps.map((q) => '<div><span>' + K.esc(nameOf(q)) + ' <span class="muted mono small">' + M.code(q) + '</span></span><span class="sc">祖として紐づけ</span></div>').join('') + '</div>' : '';
		const body = deps.length ? '<div class="warnbox">' + deps.length + '人の祖として紐づいています。消すと、その祖は今の中身を写した「紐づけなし」になります（祖の親の赤因子は分からなくなります）。</div>' + depList : '<p class="small muted">この親を消します。元に戻せません。</p>';
		openSheet('<h2 id="sheetTitle">消す<span class="sub">' + K.esc(nameOf(p)) + ' ' + M.codeFull(p) + '</span></h2>' + body +
			'<div class="acts"><button class="btn danger" type="button" data-go>消す</button><button class="btn" type="button" data-close>やめる</button></div>', '[data-close]');
		$('#sheetIn [data-go]').onclick = async () => { const r = K.removeParent(S.doc, p.id); try { await K.store.deleteParent(p.id); if (r.changed.length) await K.store.putParents(r.changed); } catch (e) { toast('消せませんでした'); return; } if (S.A === p.id) S.A = null; if (S.B === p.id) S.B = null; closeSheet(); rebuild(); renderAll(); toast('消しました' + (r.changed.length ? '（' + r.changed.length + '人の祖に写しました）' : '')); };
		bindClose();
	}
	function skillSheet(s) {
		const M = S.M, ps = visParents(), rows = visRowsRaw();
		// 親ごとの対象スキル数（親の小窓の「対象スキル」と同じ数え方）の多い順。同じ数なら登録日の新しい順（C-274 の 9）
		const list = ps.map((p) => { const f = M.fam(p); const v = f[0].skills[s.id]; const go = M.gpOnly(p, s.id); return { p, v: v == null ? 0 : v, go, t: rows.filter((x) => M.ok(p.skills[x.id])).length }; }).filter((x) => x.v !== 0 || x.go)
			.sort((a, b) => b.t - a.t || b.p.date.localeCompare(a.p.date) || b.p.no - a.p.no);
		const tags = [K.CAT[s.cat]].concat(s.dist.map((d) => K.DIST[d]), s.style.map((d) => K.STYLE[d]), s.surface.map((d) => K.SURF[d]));
		const old = K.oldOnly(curSet(), s.id);
		openSheet('<h2 id="sheetTitle">' + K.esc(s.name) + '<span class="sub">' + K.esc(tags.join('・')) + (old ? '・前回までの一覧にだけある' : '') + '／表示中の親' + ps.length + '人のうち' + list.length + '人</span></h2>' +
			'<div class="list">' + (list.map((x) => '<button type="button" data-p="' + x.p.id + '"><span><span class="' + (x.p.owner === 'friend' ? 'fr' : '') + '">' + K.esc(K.charaName(x.p.uma)) + '</span> <span class="muted mono small">' + M.code(x.p) + '</span></span><span class="sc">対象スキル' + x.t + '種・' + (x.v > 0 ? '★' + x.v : x.v < 0 ? '★不明' : '祖が持つ') + '</span></button>').join('') || '<div><span class="muted">持っている親はいません</span></div>') + '</div>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>');
		$('#sheetIn').querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => nav(() => parentSheet(M.byId.get(b.dataset.p))); }); bindClose();
	}
	/* 親Bのおすすめ（本育成設計で絞り込んでいるときは、絞り込まれた親の中から。C-271 の 17）。
	 * 親Bだけを選んでいるとき（親Aを外して親Bだけが残ったときも）は「親Aのおすすめ」: 親B の親と祖に対して親Aの候補を出す（C-274 の 7） */
	const recFor = () => (!S.A && S.B && S.M.byId.get(S.B) ? 'A' : 'B');
	$('#recB').onclick = () => {
		const want = recFor(), base = want === 'A' ? 'B' : 'A';
		if (!S[base]) { toast('先に親Aを選んでください（列の見出しから）'); return; }
		nav(() => {
			const M = S.M, P = M.byId.get(S[base]), ps = visParents(), rows = visRowsRaw();
			const r = K.recommendB(M, P, ps, rows, grows(), 8);
			openSheet('<h2 id="sheetTitle">親' + want + 'のおすすめ<span class="sub">親' + base + ' ' + K.esc(nameOf(P)) + ' と先代が持たない' + r.lack.length + '種を多く埋める順（同数なら★の合計、次に遺伝子の★）' + (planActive() ? '・本育成設計で絞った' + ps.length + '人から' : '') + '</span></h2>' +
				'<div class="recs" style="display:flex;flex-direction:column;gap:6px">' + r.list.map((x) => '<div class="rec"><span class="' + (x.p.owner === 'friend' ? 'fr' : '') + '">' + K.esc(nameOf(x.p)) + ' <span class="muted mono small">' + M.code(x.p) + '</span></span><span class="sc">埋める ' + x.n + '/' + r.lack.length + '・★' + x.st + '・遺伝子★' + x.g + '</span><button class="btn pri" type="button" data-b="' + x.p.id + '">' + want + 'にする</button></div>').join('') + '</div>' +
				'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>');
			$('#sheetIn').querySelectorAll('[data-b]').forEach((b) => { b.onclick = () => { S[want] = b.dataset.b; closeSheet(); renderAll(); }; }); bindClose();
		});
	};
	/* 2組を探す（同じく絞り込まれた親の中から。並べ方は 充足 → 遺伝子の★） */
	$('#recPair').onclick = () => nav(() => {
		const M = S.M, ps = visParents(), rows = visRowsRaw();
		const t0 = performance.now(); const r = K.findPairs(M, ps, rows, grows(), 8); S.perf.pairs = performance.now() - t0;
		openSheet('<h2 id="sheetTitle">2組を探す<span class="sub">' + (planActive() ? '本育成設計で絞った' : '表示中の') + '親' + ps.length + '人から2組（6人）を選ぶ' + r.total.toLocaleString() + '通り。スキル' + rows.length + '種の充足が多い順（同数なら遺伝子の★）</span></h2>' +
			'<div style="display:flex;flex-direction:column;gap:6px">' + (r.top.map((x, k) => '<div class="rec"><span>' + K.esc(K.charaName(x.a.uma)) + ' <span class="muted mono small">' + M.code(x.a) + '</span> ＋ ' + K.esc(K.charaName(x.b.uma)) + ' <span class="muted mono small">' + M.code(x.b) + '</span></span><span class="sc">' + x.n + '/' + rows.length + '・遺伝子★' + x.g + '</span><button class="btn pri" type="button" data-k="' + k + '">この2組</button></div>').join('') || '<p class="small muted">親が2人以上いません。</p>') + '</div>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>');
		$('#sheetIn').querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { const x = r.top[+b.dataset.k]; S.A = x.a.id; S.B = x.b.id; closeSheet(); renderAll(); }; }); bindClose();
	});
	/* 2組の詳細（充足の数を押す） */
	function openPairDetail() {
		const M = S.M, sel = selected(); if (!sel.length) { toast('列の見出しを押して親A・親Bを選ぶと充足が出ます'); return; }
		nav(() => {
			const rows = visRowsRaw(), cov = covered(rows), miss = rows.filter((s) => !cov.includes(s)), G = grows();
			const parts = []; [S.A, S.B].forEach((id, si) => { const p = id && M.byId.get(id); if (!p) return; M.fam(p).forEach((m, k) => parts.push('<div><span>' + K.POS[si * 3 + k] + '　' + K.esc(K.charaName(m.uma)) + ' <span class="muted small">' + K.esc(K.uniqName(m.uma)) + '</span></span><span class="sc">' + K.starText(m.green) + '</span></div>')); });
			const gsum = G.map((g) => g.label + ' ★' + sel.reduce((a, p) => a + M.fam(p).reduce((b, m) => b + M.geneStar(m, g), 0), 0)).join('・') || '条件の指定なし';
			const reds = (list) => { const m = {}; list.forEach((r) => { if (!r) return; const k = K.RED[r[0]]; m[k] = (m[k] || 0) + Math.max(0, r[1]); }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '★' + v).join('・') || 'なし'; };
			const lv1 = [], lv2 = []; let unknown = 0; sel.forEach((p) => { M.fam(p).forEach((m, k) => { lv1.push(m.red); if (k) { const gp = M.gpParents(m); if (gp) gp.forEach((y) => lv2.push(y.red)); else unknown += 2; } }); });
			openSheet('<h2 id="sheetTitle">2組の充足<span class="sub mono">' + cov.length + '/' + rows.length + '（' + (S.settings.gp ? '親＋祖' : '親だけ') + '・★' + M.th + '以上）</span></h2>' +
				'<div class="list">' + parts.join('') + '</div>' +
				'<dl class="kv"><dt>遺伝子</dt><dd>' + K.esc(gsum) + '（6人の合計）</dd><dt>赤因子</dt><dd>親と祖：' + K.esc(reds(lv1)) + '<br>祖の親：' + K.esc(reds(lv2)) + (unknown ? '（' + unknown + '人は分からない）' : '') + '</dd><dt>未所持スキル</dt><dd>' + miss.length + '種：' + K.esc(miss.map((s) => s.name).join('、') || 'なし') + '</dd></dl>' +
				'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>');
			bindClose();
		});
	}
	$('#cov').onclick = openPairDetail; $('#cov').style.cursor = 'pointer';

	/* ---------- 下の帯 ---------- */
	function renderDock() {
		const M = S.M, sel = selected();
		['A', 'B'].forEach((k) => { const p = S[k] && M.byId.get(S[k]); const el = $('#slot' + k + ' .nm'); el.textContent = p ? K.charaName(p.uma) + ' ' + M.code(p) : '未選択'; el.classList.toggle('none', !p); el.classList.toggle('fr', !!p && p.owner === 'friend'); });
		$('#onlyMiss').hidden = !sel.length; $('#sixCols').hidden = !(S.A && S.B); $('#clearSel').hidden = !sel.length;
		$('#onlyMiss').setAttribute('aria-pressed', S.onlyMiss ? 'true' : 'false'); $('#sixCols').setAttribute('aria-pressed', S.six ? 'true' : 'false');
		$('#recB').textContent = '親' + recFor() + 'のおすすめ';
		if (!sel.length) { $('#cov').innerHTML = '—<small>充足</small>'; $('#miss').textContent = '列の見出しを押して親A・親Bを選ぶ'; return; }
		const rows = visRowsRaw(), cov = covered(rows), miss = rows.filter((s) => !cov.includes(s));
		$('#cov').innerHTML = cov.length + '/' + rows.length + '<small>充足</small>';
		$('#miss').textContent = '未所持スキル' + miss.length + '種：' + (miss.map((s) => s.name).join('、') || 'なし');
	}
	$('#slotA').onclick = () => { const p = S.A && S.M.byId.get(S.A); if (p) nav(() => parentSheet(p)); else toast('列の見出しを押して親Aを選ぶ'); };
	$('#slotB').onclick = () => { const p = S.B && S.M.byId.get(S.B); if (p) nav(() => parentSheet(p)); else toast('列の見出しを押して親Bを選ぶ'); };
	$('#onlyMiss').onclick = () => { S.onlyMiss = !S.onlyMiss; renderAll(); };
	$('#sixCols').onclick = () => { S.six = !S.six; renderAll(); };
	$('#clearSel').onclick = () => { S.A = S.B = null; S.onlyMiss = false; S.six = false; renderAll(); };

	/* ---------- 見出しの行（レース/周回セット・ツールの切り替え・ライト／ダーク。C-271 の 6） ---------- */
	function openSetPicker() {
		nav(() => {
			openSheet('<h2 id="sheetTitle">レース/周回セット</h2>' + K.setListHtml(S.doc, curKey(), { counts: true }) +
				'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>', '.rlist input:checked');
			$('#sheetIn').querySelectorAll('input[name="setpick"]').forEach((el) => { el.onchange = () => {
				const key = el.value; closeSheet();
				if (key.startsWith('r:') && !S.doc.sets.some((s) => s.id === key)) { const r = K.RACES.get(key.slice(2)); S.doc.sets.push(K.newRaceSet(r)); saveHead(); }
				pickSet(key);
			}; });
			bindClose();
		});
	}
	$('#setBtn').onclick = openSetPicker;
	function openTool() {
		nav(() => {
			// 版13 では押しても移らなかった行を、ほかのツールのページへのリンクにした（見た目は同じ一覧の行）
			openSheet('<h2 id="sheetTitle">ツール切り替え</h2><div class="list"><a href="special.html" data-tool><span>UmaStar OCR</span></a><a href="exam.html" data-tool><span>UmaExam</span></a><div><span><b>Deck</b></span><span class="sc">選択中</span></div></div>' +
				'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>', '[data-close]');
			bindClose();
		});
	}
	$('#toolBtn').onclick = openTool;
	$('#themeBtn').onclick = () => {
		const dark = document.documentElement.getAttribute('data-theme') === 'dark';
		S.settings.theme = dark ? 'light' : 'dark'; S.fixedTheme = null; saveSettings(); K.applyTheme(S.settings.theme); renderHeader(); renderStage(true);
	};

	/* ---------- 書き出しを促す（版9 の形。C-271 の 31） ---------- */
	function renderNudge() {
		const el = $('#nudge'); const n = S.doc.parents.length; const d = K.daysSince(S.settings.lastExport);
		if (!n) { el.hidden = true; return; }
		if (d == null) { el.hidden = false; el.textContent = '未書き出し'; return; }
		if (d >= 7) { el.hidden = false; el.textContent = '書き出し ' + d + '日前'; return; }
		el.hidden = true;
	}
	$('#nudge').onclick = openData;

	/* ---------- データ（バックアップと「ホーム画面に追加」の案内。C-275 の 3・4。版13 の仮のデータ・終了をまねる・登録の画面を試すは入れない＝C-275 の 5） ---------- */
	function openData() {
		if (curView !== dataView) nav(dataView); else dataView();
	}
	function dataView() {
		const d = K.daysSince(S.settings.lastExport);
		openSheet('<h2 id="sheetTitle">バックアップ<span class="sub">α版：データの形が変わることがあります。ときどき書き出してください。</span></h2>' +
			'<div class="opt"><span>最後の書き出し：' + (d == null ? 'まだ' : d === 0 ? '今日' : d + '日前') + '　<span class="muted small">親' + S.doc.parents.length + '人</span></span></div>' +
			'<div class="row"><button class="btn pri" type="button" id="exportBtn" style="flex:1">書き出す（JSON）</button><button class="btn" type="button" id="importBtn" style="flex:1">読み込む</button></div>' +
			'<p class="small muted">iPhone の Safari は、しばらく開かないとデータを消すことがあります。書き出したファイルを「ファイル」に残してください。</p>' +
			// 「ホーム画面に追加」の案内（よく使う人向け。データが分かれることと移し方をセットで。C-275 の 4・C-268 の C）
			'<h2 style="font-size:14px" id="homeGuide">ホーム画面に追加<span class="sub">よく使う人向け</span></h2>' +
			'<p class="small muted">Safari の共有ボタン →「ホーム画面に追加」で、ホーム画面のアイコンから Deck を開けます。アイコンから開くと、しばらく開かなくてもデータが消えにくくなります。</p>' +
			'<p class="small muted">ただし、Safari で開いたときとアイコンから開いたときでは、データが別々になります。今のデータをアイコンの側へ移すには：</p>' +
			'<ol class="small muted" style="margin:4px 0 0;padding-left:1.6em"><li>ここで「書き出す」</li><li>ホーム画面のアイコンから Deck を開く</li><li>「⋯」→「読み込む」で書き出したファイルを選び、「置き換える」</li></ol>' +
			'<div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>', '[data-close]');
		$('#exportBtn').onclick = doExport; $('#importBtn').onclick = () => { $('#importFile').value = ''; $('#importFile').click(); };
		bindClose();
	}
	$('#moreBtn').onclick = openData;
	async function doExport() {
		const doc = K.buildExport(S.doc); const text = JSON.stringify(doc); const name = K.exportFileName();
		const blob = new Blob([text], { type: 'application/json' });
		let done = false;
		try { if (navigator.canShare && navigator.share) { const f = new File([blob], name, { type: 'application/json' }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); done = true; } } } catch (e) { if (e && e.name === 'AbortError') return; }
		if (!done) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
		S.settings.lastExport = new Date().toISOString(); saveSettings(); renderNudge(); toast('書き出しました（' + name + '・' + Math.round(text.length / 1024) + 'KB）'); dataView();
	}
	$('#importFile').onchange = async () => {
		const f = $('#importFile').files[0]; if (!f) return; const text = await f.text(); const r = K.parseImport(text);
		if (r.error) { nav(() => { openSheet('<h2 id="sheetTitle">読み込めません</h2><div class="errbox">' + K.esc(r.error) + '</div><p class="small muted">' + K.esc(f.name) + '</p><div class="acts"><button class="btn" type="button" data-close>閉じる</button></div>'); bindClose(); }); return; }
		const doc = r.doc;
		nav(() => {
			openSheet('<h2 id="sheetTitle">読み込む<span class="sub">' + K.esc(f.name) + '</span></h2><dl class="kv"><dt>親</dt><dd>' + doc.parents.length + '人（今は' + S.doc.parents.length + '人）</dd><dt>保存日時</dt><dd>' + K.esc(doc.savedAt || '不明') + '</dd><dt>版</dt><dd>' + r.fromSchema + (r.migrated ? '（今の形に直して読みます）' : '') + '</dd></dl>' +
				'<div class="acts"><button class="btn pri" type="button" data-rep>置き換える</button><button class="btn" type="button" data-add>今のデータに足す</button><button class="btn" type="button" data-close>やめる</button></div>', '[data-close]');
			$('#sheetIn [data-rep]').onclick = async () => { await K.store.replaceAll(doc); S.doc = K.assemble(await K.store.load()); await runArchive(); S.A = S.B = null; if (!K.findSet(S.doc, S.settings.cur)) S.settings.cur = 'none'; applySetDefaults(); rebuild(); closeSheet(); renderAll(); toast('置き換えました（親' + doc.parents.length + '人）'); };
			$('#sheetIn [data-add]').onclick = async () => {
				const have = new Set(S.doc.parents.map((p) => p.id)); let next = S.doc.next; const map = {}; const add = [];
				doc.parents.forEach((p) => { const q = JSON.parse(JSON.stringify(p)); if (have.has(q.id)) { map[p.id] = 'p' + next; q.id = 'p' + next; next++; } add.push(q); });
				add.forEach((q) => { (q.gp || []).forEach((g) => { if (g.link && map[g.link]) g.link = map[g.link]; }); });
				// セットは同じ id なら一覧を OR でまとめる（区別は読み込んだ側の回をそのまま使わず、今のセットの回に揃える）
				doc.sets.forEach((s) => { const t = S.doc.sets.find((x) => x.id === s.id); if (!t) S.doc.sets.push(s); else Object.keys(s.skills).forEach((id) => { if (!(id in t.skills)) t.skills[id] = Math.max(1, t.sends - 1); }); });
				S.doc.next = Math.max(next, S.doc.next); S.doc.parents = S.doc.parents.concat(add);
				await K.store.putParents(add); await saveHead(); await runArchive(); rebuild(); closeSheet(); renderAll(); toast('足しました（親' + add.length + '人）');
			};
			bindClose();
		});
	};

	/* ---------- 道具・引き出し（スマホ: 押した1つだけ開く。PC: 左の列に5つの欄を全部並べる。C-273 の 8） ---------- */
	function applyPanes() {
		const pc = !isNarrow();
		document.querySelectorAll('[data-pane]').forEach((el) => { el.hidden = !pc && el.dataset.pane !== S.pane; });
		$('#panes').hidden = !pc && !S.pane;
		document.getElementById('app').classList.toggle('has-pane', pc || !!S.pane);
		document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === S.pane ? 'true' : 'false'));
	}
	$('#moreBtnPc').onclick = openData;
	matchMedia('(max-width: 720px)').addEventListener('change', () => { if (S.doc) applyPanes(); });
	document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { S.pane = S.pane === b.dataset.tab ? null : b.dataset.tab; applyPanes(); renderStage(true); }; });
	$('#cs').onchange = (e) => { S.cs = e.target.value; renderAll(); };
	$('#rs').onchange = (e) => { S.rs = e.target.value; renderAll(); };
	let qT; $('#sf-q').oninput = (e) => { S.sf.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => { renderFilters(); renderStage(true); renderDock(); }, 150); };
	document.querySelectorAll('[data-th]').forEach((b) => { b.onclick = () => { S.settings.th = +b.dataset.th; saveSettings(); rebuild(); renderAll(); }; });
	$('#gpToggle').onclick = () => { S.settings.gp = !S.settings.gp; saveSettings(); rebuild(); renderAll(); };
	$('#geneToggle').onclick = () => { S.settings.geneRows = !S.settings.geneRows; saveSettings(); renderAll(); };
	let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => renderStage(true), 150); });
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!S.doc) return; K.applyTheme(S.fixedTheme || S.settings.theme); renderHeader(); renderStage(true); });

	function renderAll() { renderHeader(); renderFilters(); renderPlan(); applyPanes(); renderStage(true); renderDock(); renderNudge(); }

	/* ---------- 確かめる用（検査。window.__deckAlpha から呼ぶ。画面には出ない） ---------- */
	const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	async function measure() {
		const out = { parents: S.doc.parents.length, set: curKey(), cols: visParents().length, rows: visRowsRaw().length, load: S.perf.load, model: S.perf.model };
		for (const lv of [0, 1, 2]) { const t0 = performance.now(); setLevel(lv); await frame(); out['lv' + lv] = +(performance.now() - t0).toFixed(1); }
		setLevel(1); await frame();
		const sw = stage.scrollWidth - stage.clientWidth, sh = stage.scrollHeight - stage.clientHeight; let sum = 0;
		for (let k = 1; k <= 10; k++) { stage.scrollTop = Math.round(sh * k / 10); stage.scrollLeft = Math.round(sw * ((k * 3) % 10) / 10); const t0 = performance.now(); stage.dispatchEvent(new Event('scroll')); await frame(); sum += performance.now() - t0; }
		out.scroll = +(sum / 10).toFixed(1);
		// 絞り込む（脚質を1つ切り替えて描き直す）
		{ const t0 = performance.now(); toggleSet(S.pf.style, 'nige'); renderAll(); await frame(); out.filter = +(performance.now() - t0).toFixed(1); toggleSet(S.pf.style, 'nige'); renderAll(); await frame(); }
		const ps = visParents(), rows = visRowsRaw(); const t1 = performance.now(); const r = K.findPairs(S.M, ps, rows, grows(), 8); out.pairs = +(performance.now() - t1).toFixed(1); out.pairsTotal = r.total;
		const t2 = performance.now(); K.recommendB(S.M, ps[0], ps, rows, grows(), 8); out.recB = +(performance.now() - t2).toFixed(1);
		const t3 = performance.now(); JSON.stringify(K.buildExport(S.doc)); out.export = +(performance.now() - t3).toFixed(1);
		return out;
	}

	init();
})();
