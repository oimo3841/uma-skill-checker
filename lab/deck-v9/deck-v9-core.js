/* lab/deck-v9/deck-v9-core.js — 新しい Deck のモック（段3・T79）の共通部分。
 * 製品のファイルは変えない。保存は IndexedDB の uma-lab-deck-v9 だけ（今のツールのキーには触れない）。
 * データの形は T74 の第1版の案（schema 1）。
 *   doc: { format:'uma-deck', schema:1, tool:'star', savedAt, data:{版}, next, bundles:[], parents:[], targets:{t1:[6], t2:[], must:{A,B}} }
 *   親:  { id, uma, date, no, owner:'self'|'friend', bundles:[], tags:{dist,style,surface}, blue:[種類,★]|null, red:[種類,★]|null,
 *          green:★|-1|null, skills:{id:★}, genes:{id:★}, gp:[ {link:id} | {uma, blue, red, green, skills, genes} ] }
 *   ★不明は -1、読めなかった因子は null。
 */
(function () {
	'use strict';
	const D = window.DECK_V9_DATA;
	const DB_NAME = 'uma-lab-deck-v9';
	const DB_VER = 1;

	/* ---------- 語彙 ---------- */
	const BLUE = { speed: 'スピード', stamina: 'スタミナ', power: 'パワー', guts: '根性', wit: '賢さ' };
	const DIST = { short: '短距離', mile: 'マイル', medium: '中距離', long: '長距離' };
	const STYLE = { nige: '逃げ', senko: '先行', sashi: '差し', oikomi: '追込' };
	const SURF = { turf: '芝', dirt: 'ダート' };
	const RED = Object.assign({}, SURF, DIST, STYLE);
	const CAT = { scenario: 'シナリオ', outside: 'サポカ外', factor: 'シナリオ因子', other: 'そのほか' };
	const GENE_KEY = { 'ap-turf': 'turf', 'ap-dirt': 'dirt', 'ap-nige': 'nige', 'ap-senko': 'senko', 'ap-sashi': 'sashi', 'ap-oikomi': 'oikomi', 'ap-short': 'short', 'ap-mile': 'mile', 'ap-medium': 'medium', 'ap-long': 'long' };

	/* ---------- 公開データの索引 ---------- */
	const SK = new Map();
	const scen = new Set(D.scenarioSkillIds), outs = new Set(D.nonSupportIds);
	D.skills.forEach((s, i) => {
		const cat = scen.has(s.id) || s.scenario.length ? 'scenario' : outs.has(s.id) ? 'outside' : 'other';
		SK.set(s.id, { id: s.id, name: s.name, dist: s.dist, style: s.style, surface: s.surface, cat, order: i });
	});
	D.scenarioFactors.forEach((f, i) => SK.set(f.id, { id: f.id, name: f.name, dist: [], style: [], surface: [], cat: 'factor', order: 10000 + i }));
	const GENES = new Map(D.genes.map((g) => [g.id, g]));
	const COS = new Map(D.costumes.map((c) => [c.id, c]));
	const UNIQ = new Map(); // 固有スキル名 → 衣装 id
	D.costumes.forEach((c) => c.uniq.forEach((n) => UNIQ.set(n, c.id)));

	function skill(id) { return SK.get(id) || { id, name: id, dist: [], style: [], surface: [], cat: 'other', order: 99999 }; }
	function costume(id) { return COS.get(id) || null; }
	function fullName(uma) { const c = costume(uma); return c ? '［' + c.title + '］' + c.chara : '（衣装が未定）'; }
	function charaName(uma) { const c = costume(uma); return c ? c.chara : '？'; }
	function shortName(uma) { const c = costume(uma); return c ? c.chara.slice(0, 4) : '？'; }
	function uniqName(uma) { const c = costume(uma); return c ? c.uniq[c.uniq.length - 1] : ''; }
	function starText(v) { return v == null ? '—' : v < 0 ? '★?' : '★' + v; }
	function blueText(b) { return b ? BLUE[b[0]] + starText(b[1]) : '—'; }
	function redText(r) { return r ? RED[r[0]] + starText(r[1]) : '—'; }

	/* ---------- 乱数（決まった種で同じ仮のデータを作る） ---------- */
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

	/* ---------- 仮のデータ（親 n 人） ---------- */
	const MOCK_BUNDLES = [
		{ id: 'b1', name: '11月LoH', dist: 'medium', surface: 'turf' },
		{ id: 'b2', name: '10月CM', dist: 'mile', surface: 'turf' },
		{ id: 'b3', name: '12月CM', dist: 'long', surface: 'turf' },
		{ id: 'b4', name: '9月LoH', dist: 'mile', surface: 'dirt' },
	];
	function mockPool(r) {
		// 表に出るスキルの母集団（約110種）: シナリオスキル・サポカ外・距離や脚質の札のあるスキルから・シナリオ因子
		const all = [...SK.values()];
		const sc = all.filter((s) => s.cat === 'scenario'), out = all.filter((s) => s.cat === 'outside');
		const tagged = all.filter((s) => s.cat === 'other' && (s.dist.length || s.style.length)).slice();
		for (let i = tagged.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [tagged[i], tagged[j]] = [tagged[j], tagged[i]]; }
		const fac = all.filter((s) => s.cat === 'factor').slice(0, 8);
		return sc.concat(out, tagged.slice(0, 60), fac);
	}
	function makeMock(n, seed) {
		const r = rng(seed || 11);
		const pool = mockPool(r);
		const cos = D.costumes;
		const parents = [];
		const styles = Object.keys(STYLE);
		const skillsFor = (b, st, rich) => {
			const o = {};
			pool.forEach((s) => {
				let p = s.cat === 'scenario' ? .2 : s.cat === 'outside' ? .15 : s.cat === 'factor' ? .12 : .07;
				if (s.dist.length) p = s.dist.includes(b.dist) ? p + .35 : p * .4;
				if (s.style.length) p = s.style.includes(st) ? p + .3 : p * .5;
				if (s.surface.length) p = s.surface.includes(b.surface) ? p + .2 : p * .4;
				if (rich) p = Math.min(.85, p * 1.7);
				if (r() >= p) return;
				o[s.id] = r() < .03 ? -1 : (() => { const q = r(); return q < .5 ? 1 : q < .85 ? 2 : 3; })();
			});
			return o;
		};
		const genesFor = (b, st) => {
			const q = r(); const cnt = q < .25 ? 0 : q < .6 ? 1 : q < .85 ? 2 : 3;
			const want = ['ap-' + b.surface, 'ap-' + b.dist, 'ap-' + st];
			const ids = [...GENES.keys()]; const o = {}; let guard = 0;
			while (Object.keys(o).length < cnt && guard++ < 20) { const k = r() < .7 ? want[Math.floor(r() * 3)] : ids[Math.floor(r() * ids.length)]; if (!(k in o)) o[k] = 1 + Math.floor(r() * 3); }
			return o;
		};
		const blueFor = () => [Object.keys(BLUE)[Math.floor(r() * 5)], 1 + Math.floor(r() * 3)];
		const redFor = (b, st) => [r() < .55 ? b.dist : r() < .5 ? st : r() < .5 ? b.surface : Object.keys(DIST)[Math.floor(r() * 4)], 1 + Math.floor(r() * 3)];
		const today = new Date(2026, 10, 2);
		for (let j = 0; j < n; j++) {
			const b = MOCK_BUNDLES[Math.floor(r() * MOCK_BUNDLES.length)], st = styles[Math.floor(r() * 4)];
			const owner = r() < .1 ? 'friend' : 'self';
			const tags = { dist: [b.dist], style: [st], surface: [b.surface] };
			const bundles = [b.id];
			if (r() < .25) { const b2 = MOCK_BUNDLES[Math.floor(r() * MOCK_BUNDLES.length)]; if (b2.id !== b.id) { bundles.push(b2.id); if (!tags.dist.includes(b2.dist)) tags.dist.push(b2.dist); } const s2 = styles[Math.floor(r() * 4)]; if (!tags.style.includes(s2)) tags.style.push(s2); }
			const daysAgo = Math.floor((n - 1 - j) * (60 / Math.max(1, n)) + r() * 1.5);
			const d = new Date(today); d.setDate(d.getDate() - daysAgo);
			const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
			const c = cos[Math.floor(r() * cos.length)];
			const p = { id: 'p' + (j + 1), uma: c.id, date, no: 1, owner, bundles, tags, blue: blueFor(), red: redFor(b, st), green: 1 + Math.floor(r() * 3), skills: skillsFor(b, st, owner === 'friend'), genes: genesFor(b, st), gp: [] };
			if (r() < .04) p.blue = null; // 読めなかった例
			if (r() < .03) p.green = -1;
			for (let k = 0; k < 2; k++) {
				const cand = parents.filter((x) => x.owner === 'friend');
				if (cand.length && r() < .4) p.gp.push({ link: cand[Math.floor(r() * cand.length)].id });
				else if (parents.length && r() < .2) p.gp.push({ link: parents[Math.floor(r() * parents.length)].id });
				else {
					const c2 = cos[Math.floor(r() * cos.length)];
					const sk = skillsFor(b, st, false); Object.keys(sk).forEach((id) => { if (r() < .4) delete sk[id]; });
					p.gp.push({ uma: r() < .05 ? null : c2.id, blue: blueFor(), red: redFor(b, st), green: 1 + Math.floor(r() * 3), skills: sk, genes: genesFor(b, st) });
				}
			}
			parents.push(p);
		}
		// 同じ日の管理番号（登録順）
		const byDate = {}; parents.forEach((p) => (byDate[p.date] = byDate[p.date] || []).push(p));
		Object.values(byDate).forEach((a) => a.forEach((p, k) => { p.no = k + 1; }));
		return { format: 'uma-deck', schema: 1, tool: 'star', savedAt: null, data: D.versions, next: n + 1, bundles: MOCK_BUNDLES.map((b) => Object.assign({}, b)), parents,
			targets: { t1: [null, null, null, null, null, null], t2: [], must: { A: false, B: false } } };
	}

	/* ---------- 保存（IndexedDB uma-lab-deck-v9。親1人1件 ＋ meta） ---------- */
	let dbP = null;
	function openDb() {
		if (dbP) return dbP;
		dbP = new Promise((res, rej) => {
			if (!window.indexedDB) { rej(new Error('IndexedDB が使えない')); return; }
			const q = indexedDB.open(DB_NAME, DB_VER);
			q.onupgradeneeded = () => { const db = q.result; if (!db.objectStoreNames.contains('parents')) db.createObjectStore('parents', { keyPath: 'id' }); if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' }); };
			q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); q.onblocked = () => rej(new Error('blocked'));
		});
		return dbP;
	}
	function tx(stores, mode, fn) {
		return openDb().then((db) => new Promise((res, rej) => {
			const t = db.transaction(stores, mode); const out = fn(t);
			t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
		}));
	}
	function getAll(store) { return openDb().then((db) => new Promise((res, rej) => { const q = db.transaction(store, 'readonly').objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); })); }
	const store = {
		async load() {
			const t0 = performance.now();
			const [parents, metas] = await Promise.all([getAll('parents'), getAll('meta')]);
			const meta = {}; metas.forEach((m) => { meta[m.key] = m.value; });
			return { parents, meta, ms: performance.now() - t0 };
		},
		putParents(list) { return tx(['parents'], 'readwrite', (t) => { const s = t.objectStore('parents'); list.forEach((p) => s.put(p)); }); },
		deleteParent(id) { return tx(['parents'], 'readwrite', (t) => t.objectStore('parents').delete(id)); },
		putMeta(key, value) { return tx(['meta'], 'readwrite', (t) => t.objectStore('meta').put({ key, value })); },
		replaceAll(doc) { return tx(['parents', 'meta'], 'readwrite', (t) => { const s = t.objectStore('parents'); s.clear(); doc.parents.forEach((p) => s.put(p)); t.objectStore('meta').put({ key: 'doc', value: docHead(doc) }); }); },
		clear() { return tx(['parents', 'meta'], 'readwrite', (t) => { t.objectStore('parents').clear(); t.objectStore('meta').delete('doc'); }); },
	};
	function docHead(doc) { return { schema: doc.schema, next: doc.next, bundles: doc.bundles, targets: doc.targets, data: doc.data }; }

	/* ---------- 設定（表示の状態。データの文書とは別に meta の settings に持つ） ---------- */
	const DEFAULT_SETTINGS = { theme: 'auto', lv0: 1, delMode: 'copy', chipColor: true, gp: true, th: 1, geneRows: true, lastExport: null, mockN: 100 };

	/* ---------- 文書の組み立て ---------- */
	function assemble(loaded) {
		const head = loaded.meta.doc || null;
		const doc = { format: 'uma-deck', schema: 1, tool: 'star', savedAt: null, data: D.versions, next: 1, bundles: [], parents: loaded.parents.slice(),
			targets: { t1: [null, null, null, null, null, null], t2: [], must: { A: false, B: false } } };
		if (head) { doc.schema = head.schema || 1; doc.next = head.next || 1; doc.bundles = head.bundles || []; doc.targets = Object.assign(doc.targets, head.targets || {}); doc.data = head.data || D.versions; }
		doc.parents.sort((a, b) => numId(a.id) - numId(b.id));
		return doc;
	}
	function numId(id) { return +String(id).replace(/^p/, '') || 0; }

	/* ---------- 家系・充足の計算 ---------- */
	function makeModel(doc, settings) {
		const byId = new Map(doc.parents.map((p) => [p.id, p]));
		const th = settings.th, gpOn = settings.gp;
		const ok = (v) => v == null ? false : v < 0 ? th === 1 : v >= th;
		function member(g) {
			if (g.link != null) { const q = byId.get(g.link); if (q) return { uma: q.uma, blue: q.blue, red: q.red, green: q.green, skills: q.skills, genes: q.genes, linked: true, id: q.id, owner: q.owner, gp: q.gp }; return { uma: null, blue: null, red: null, green: null, skills: {}, genes: {}, linked: true, id: g.link, missing: true, gp: [] }; }
			return { uma: g.uma, blue: g.blue, red: g.red, green: g.green, skills: g.skills || {}, genes: g.genes || {}, linked: false, id: null, gp: null };
		}
		const famCache = new Map();
		function fam(p) { let f = famCache.get(p.id); if (!f) { f = [{ uma: p.uma, blue: p.blue, red: p.red, green: p.green, skills: p.skills, genes: p.genes, linked: false, id: p.id, owner: p.owner, gp: p.gp }].concat((p.gp || []).map(member)); famCache.set(p.id, f); } return f; }
		function famHas(p, sid) { const f = fam(p); if (ok(f[0].skills[sid])) return true; if (!gpOn) return false; return ok(f[1] && f[1].skills[sid]) || ok(f[2] && f[2].skills[sid]); }
		function gpOnly(p, sid) { const f = fam(p); if (!gpOn || ok(f[0].skills[sid])) return false; return ok(f[1] && f[1].skills[sid]) || ok(f[2] && f[2].skills[sid]); }
		function triple(p, sid) { const z = (v) => v >= th ? v : 0; const f = fam(p); return z(f[0].skills[sid]) + (gpOn ? z(f[1] && f[1].skills[sid]) + z(f[2] && f[2].skills[sid]) : 0); }
		// 遺伝子の対象: 親の絞り込みのまとまり → 無ければその親の最初のまとまり → 無ければタグ
		function keysFor(p, bundleId, styleSet) {
			const b = doc.bundles.find((x) => x.id === (bundleId || (p.bundles || [])[0]));
			const dist = b ? [b.dist] : (p.tags.dist || []).slice(0, 1), surf = b ? [b.surface] : (p.tags.surface || []).slice(0, 1);
			const sts = styleSet && styleSet.size ? [...styleSet] : (p.tags.style || []).slice(0, 1);
			return surf.concat(dist, sts).filter(Boolean);
		}
		function geneN(m, keys) { let n = 0; for (const k in (m.genes || {})) if (keys.includes(GENE_KEY[k]) && m.genes[k] >= th) n++; return n; }
		function geneText(m, keys) { const a = []; for (const k in (m.genes || {})) { const g = GENES.get(k); const nm = g ? g.name.replace('の遺伝子', '') : k; const inn = keys.includes(GENE_KEY[k]); a.push((inn ? '' : '（') + nm + '★' + m.genes[k] + (inn ? '' : '）')); } return a.join(' ') || 'なし'; }
		// 行の母集団: 登録されている全親（と祖）が持つスキル
		const rowSet = new Set();
		doc.parents.forEach((p) => { fam(p).forEach((m) => Object.keys(m.skills || {}).forEach((id) => rowSet.add(id))); });
		const rows = [...rowSet].map(skill).sort((a, b) => a.order - b.order);
		// 管理番号
		const dup = {}; doc.parents.forEach((p) => { dup[p.date] = (dup[p.date] || 0) + 1; });
		function code(p) { return p.date.slice(5).replace('-', '/') + (dup[p.date] > 1 ? '-' + p.no : ''); }
		function codeFull(p) { return p.date + (dup[p.date] > 1 ? '-' + p.no : ''); }
		// 祖の親（曾祖）: 紐づけた祖だけ分かる
		function gpParents(m) { if (!m.linked || !m.gp) return null; return m.gp.map((g) => { const x = member(g); return { uma: x.uma, red: x.red, id: x.id }; }); }
		return { doc, byId, th, gpOn, ok, member, fam, famHas, gpOnly, triple, keysFor, geneN, geneText, rows, code, codeFull, gpParents };
	}

	/* ---------- 目標の6人（Tier） ---------- */
	const POS = ['親A', '祖A1', '祖A2', '親B', '祖B1', '祖B2'];
	function tierActive(t) { return t.t1.some(Boolean) || t.t2.length > 0; }
	function sideMatch(M, p, side, t) {
		const sl = t.t1.slice(side * 3, side * 3 + 3); const m = M.fam(p).map((x) => x.uma); const must = side === 0 ? t.must.A : t.must.B;
		const reqOk = !must || !sl[0] || m[0] === sl[0]; let t1 = 0, t2 = 0; const marks = ['', '', ''];
		if (sl[0] && m[0] === sl[0]) { t1++; marks[0] = 'T1'; } else if (m[0] && t.t2.includes(m[0])) { t2++; marks[0] = 'T2'; }
		const used = [];
		[1, 2].forEach((k) => { const j = [sl[1], sl[2]].findIndex((c, ix) => c && c === m[k] && !used.includes(ix)); if (j >= 0) { used.push(j); t1++; marks[k] = 'T1'; } else if (m[k] && t.t2.includes(m[k])) { t2++; marks[k] = 'T2'; } });
		return { reqOk, t1, t2, score: reqOk ? t1 * 2 + t2 : -1, marks };
	}
	function famTier(M, p, t) { if (!tierActive(t)) return null; const a = sideMatch(M, p, 0, t), b = sideMatch(M, p, 1, t); return a.score >= b.score ? a : b; }

	/* ---------- 2組を探す（ビット列） ---------- */
	function findPairs(M, ps, rows, t, keysOf, limit) {
		const S = rows.length, W = Math.ceil(S / 32);
		const bits = ps.map((p) => { const a = new Uint32Array(W); rows.forEach((s, k) => { if (M.famHas(p, s.id)) a[k >> 5] |= 1 << (k & 31); }); return a; });
		const gn = ps.map((p) => { const ks = keysOf(p); return M.fam(p).reduce((acc, m) => acc + M.geneN(m, ks), 0); });
		const side = tierActive(t) ? ps.map((p) => [sideMatch(M, p, 0, t), sideMatch(M, p, 1, t)]) : null;
		const pop = (x) => { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
		const res = [];
		for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
			let n = 0; const A = bits[a], B = bits[b]; for (let w = 0; w < W; w++) n += pop((A[w] | B[w]) >>> 0);
			let ia = a, ib = b, tsc = 0, ts = null;
			if (side) { const s1 = [side[a][0], side[b][1]], s2 = [side[b][0], side[a][1]]; const sc = (s) => (s[0].reqOk && s[1].reqOk) ? s[0].score + s[1].score : -1; if (sc(s2) > sc(s1)) { ia = b; ib = a; ts = s2; } else ts = s1; tsc = sc(ts); }
			const g = gn[a] + gn[b];
			const item = { a: ps[ia], b: ps[ib], n, g, ts, tsc };
			if (res.length < limit) { res.push(item); res.sort(cmpPair); }
			else if (cmpPair(item, res[limit - 1]) < 0) { res[limit - 1] = item; res.sort(cmpPair); }
		}
		return { top: res, total: ps.length * (ps.length - 1) / 2 };
	}
	function cmpPair(x, y) { return y.tsc - x.tsc || y.n - x.n || y.g - x.g; }

	/* ---------- 親Bのおすすめ ---------- */
	function recommendB(M, A, ps, rows, t, keysOf, limit) {
		const lack = rows.filter((s) => !M.famHas(A, s.id)).map((s) => s.id);
		const out = ps.filter((p) => p.id !== A.id && (!tierActive(t) || sideMatch(M, p, 1, t).reqOk)).map((p) => {
			const fill = lack.filter((id) => M.famHas(p, id));
			const st = fill.reduce((acc, id) => acc + M.triple(p, id), 0);
			const ks = keysOf(p); const g = M.fam(p).reduce((acc, m) => acc + M.geneN(m, ks), 0);
			return { p, n: fill.length, st, g, tm: tierActive(t) ? sideMatch(M, p, 1, t) : null };
		}).sort((a, b) => b.n - a.n || b.st - a.st || b.g - a.g);
		return { lack, list: out.slice(0, limit) };
	}

	/* ---------- 登録の画面: 祖の紐づけの候補 ---------- */
	function matchCandidates(doc, person) {
		const out = [];
		doc.parents.forEach((p) => {
			if (person.uma && p.uma !== person.uma) return;
			const a = person.skills || {}, b = p.skills || {}; const ka = Object.keys(a), kb = Object.keys(b);
			const union = new Set(ka.concat(kb)); let same = 0, starSame = 0, starCmp = 0;
			ka.forEach((id) => { if (id in b) { same++; if (a[id] >= 0 && b[id] >= 0) { starCmp++; if (a[id] === b[id]) starSame++; } } });
			const j = union.size ? same / union.size : 0;
			const starOk = starCmp === 0 ? 1 : starSame / starCmp;
			const score = Math.round(j * 100);
			const exact = person.uma === p.uma && same === union.size && starSame === starCmp && (person.green == null || p.green == null || person.green < 0 || p.green < 0 || person.green === p.green);
			if (j >= .5 || exact) out.push({ p, score, exact, starOk });
		});
		return out.sort((x, y) => (y.exact - x.exact) || (y.score - x.score));
	}

	/* ---------- バックアップ ---------- */
	function buildExport(doc) {
		const now = new Date();
		const tz = -now.getTimezoneOffset(); const sign = tz >= 0 ? '+' : '-'; const hh = String(Math.floor(Math.abs(tz) / 60)).padStart(2, '0'), mm = String(Math.abs(tz) % 60).padStart(2, '0');
		const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19) + sign + hh + ':' + mm;
		return { format: 'uma-deck', schema: 1, tool: 'star', savedAt: local, data: doc.data, next: doc.next, bundles: doc.bundles, parents: doc.parents, targets: doc.targets };
	}
	function exportFileName() { const d = new Date(); return 'uma-deck-star-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json'; }
	function parseImport(text) {
		let j; try { j = JSON.parse(text); } catch (e) { return { error: 'JSON として読めません' }; }
		if (!j || j.format !== 'uma-deck') return { error: 'UmaSkill Deck のバックアップではありません' };
		if (j.tool !== 'star') return { error: (j.tool === 'exam' ? 'UmaExam' : '別のツール') + ' のファイルです。UmaStar の Deck には読み込めません' };
		if (typeof j.schema !== 'number') return { error: '版が分かりません' };
		if (j.schema > 1) return { error: '新しい版（' + j.schema + '）のファイルです。Deck を更新してから読み込んでください' };
		if (!Array.isArray(j.parents)) return { error: '親のデータがありません' };
		// 古い版の移行（第1版が最初なので今は何もしない。版が上がったらここで何度かけても同じ結果になる移行を足す）
		const migrated = j.schema < 1;
		const doc = { format: 'uma-deck', schema: 1, tool: 'star', savedAt: j.savedAt || null, data: j.data || D.versions, next: j.next || (j.parents.length + 1), bundles: j.bundles || [], parents: j.parents,
			targets: Object.assign({ t1: [null, null, null, null, null, null], t2: [], must: { A: false, B: false } }, j.targets || {}) };
		return { doc, migrated, fromSchema: j.schema };
	}
	function daysSince(iso) { if (!iso) return null; const t = new Date(iso).getTime(); if (!isFinite(t)) return null; return Math.floor((Date.now() - t) / 86400000); }

	/* ---------- 親を消す ---------- */
	function dependents(doc, id) { return doc.parents.filter((p) => (p.gp || []).some((g) => g.link === id)); }
	// mode 'copy': 紐づけている祖を中身に写してから消す（戻り値: 書き換えた親）。mode 'block': 紐づけがあれば消さない
	function removeParent(doc, id, mode) {
		const deps = dependents(doc, id);
		if (mode === 'block' && deps.length) return { blocked: deps };
		const src = doc.parents.find((p) => p.id === id); if (!src) return { blocked: null, changed: [] };
		const changed = [];
		deps.forEach((p) => { p.gp = p.gp.map((g) => g.link === id ? { uma: src.uma, blue: src.blue, red: src.red, green: src.green, skills: src.skills, genes: src.genes } : g); changed.push(p); });
		doc.parents = doc.parents.filter((p) => p.id !== id);
		return { blocked: null, changed };
	}

	/* ---------- 見た目（テーマ） ---------- */
	function applyTheme(mode) {
		const dark = mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
	}
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

	window.DeckV9 = { D, SK, GENES, COS, UNIQ, BLUE, RED, DIST, STYLE, SURF, CAT, GENE_KEY, POS, skill, costume, fullName, charaName, shortName, uniqName, starText, blueText, redText,
		makeMock, store, DEFAULT_SETTINGS, assemble, makeModel, tierActive, sideMatch, famTier, findPairs, recommendB, matchCandidates, buildExport, exportFileName, parseImport, daysSince, dependents, removeParent, applyTheme, esc, rng };
})();
