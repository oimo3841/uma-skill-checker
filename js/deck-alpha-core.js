/* js/deck-alpha-core.js — 新しい Deck の α版（T88・C-275）の共通部分（deck-alpha.html と deck-alpha-register.html が読む）。
 * モック版13（lab/deck-v13/deck-v13-core.js。T87・C-274）を製品に移した。版13 から変えたのは、公開データを js/deck-alpha-data.js が読んで渡す形・
 * 保存先（IndexedDB の uma-deck）・縮小の列の名前の略称（C-275 の 7・8）・親を保存したときの navigator.storage.persist()（C-275 の 3）・仮のデータを外したこと（C-275 の 5）。
 * 今のツールの保存（localStorage）には触れない。
 * データの形は T74 の第1版（schema 1）からの差分で schema 2（C-271）。セットに①の脚質（lastStyle）を記録しない（C-272 の 1・2）。
 *   doc: { format:'uma-deck', schema:2, tool:'star', savedAt, data:{版}, next, sets:[], parents:[], plans:{ セットの鍵: {slots:[6], applied} } }
 *   セット: { id, kind:'race'|'arc', raceId?, race?{レースの写し}, cat?(arc の距離 short…long か dirt), skills:{id:最後に入った送りの回}, sends }
 *     レースのセットの id は 'r:<レースの id>'、終了レースのカテゴリは 'arc:short|mile|medium|long|dirt'。「指定なし」の鍵は 'none'。
 *   親:  { id, uma, date, no, owner:'self'|'friend', sets:[セットの id], tags:{style}, blue:[種類,★]|null, red:[種類,★]|null,
 *          green:★|-1|null, skills:{id:★}, genes:{id:★}, gp:[ {link:id} | {uma, blue, red, green, skills, genes} ] }
 *   ★不明は -1、読めなかった因子は null。
 *   第1版からの差分: bundles → sets（レースの一覧の行と結ぶ）・親の bundles → sets・tags は style だけ（距離・バ場はセットの条件）・
 *   targets（目標の6人・次善・必須）→ plans（セットごとの本育成設計の6人と絞り込みの状態）。
 * T97（2026-11-04・140）: 「指定なし」で送った②のスキルの一覧を doc.none = { id:'none', kind:'none', skills:{id:最後に入った送りの回}, sends } に持つ
 *   （レースのセットと同じ形・同じ数え方。一度も送っていなければ無い＝今までの保存データ・書き出しのファイルはそのまま読める）。
 * T104（2026-11-05・UmaExam 用の表）: schema は 2 のまま次を足す（どれも無くてよい＝今までの保存データ・書き出しのファイルはそのまま読める。移行はしない）。
 *   doc.exam = { id:'exam', kind:'exam', skills:{133種の id: 回}, sends }（技能試験の一覧。UmaExam から一度でも送ったときだけ）・
 *   親の sets の 'exam'（技能試験の表に出す印）・親の from:'exam'（UmaExam から新しく登録した親。UmaStar 用の表の「指定なし」に出さない＝233）・
 *   親と祖の sheet = { めろっぷの行で id の無い行の名前: ★ }・settings の mode（star|exam）・colMax・colEff。書き出しのファイルは1つのまま（tool:'star'。240）。
 */
(function () {
	'use strict';
	const DECK_ALPHA_CORE_VERSION = '2026-11-05a';
	const D = window.DECK_ALPHA_DATA;
	const DB_NAME = 'uma-deck';
	const DB_VER = 1;
	const SCHEMA = 2;

	/* ---------- 語彙 ---------- */
	const BLUE = { speed: 'スピード', stamina: 'スタミナ', power: 'パワー', guts: '根性', wit: '賢さ' };
	const DIST = { short: '短距離', mile: 'マイル', medium: '中距離', long: '長距離' };
	const STYLE = { nige: '逃げ', senko: '先行', sashi: '差し', oikomi: '追込' };
	const SURF = { turf: '芝', dirt: 'ダート' };
	const RED = Object.assign({}, SURF, DIST, STYLE);
	const CAT = { scenario: 'シナリオスキル', outside: 'サポカ外', factor: 'シナリオ因子', other: 'そのほか' };
	const GENE_KEY = { 'ap-turf': 'turf', 'ap-dirt': 'dirt', 'ap-nige': 'nige', 'ap-senko': 'senko', 'ap-sashi': 'sashi', 'ap-oikomi': 'oikomi', 'ap-short': 'short', 'ap-mile': 'mile', 'ap-medium': 'medium', 'ap-long': 'long' };
	// 終了レースのカテゴリ（C-271 の 2・25）。ダートは距離にかかわらずダート
	const ARC = { short: '終了レース：短距離', mile: '終了レース：マイル', medium: '終了レース：中距離', long: '終了レース：長距離', dirt: '終了レース：ダート' };
	const ARC_ORDER = ['short', 'mile', 'medium', 'long', 'dirt'];
	// レース場の表示名（UmaStar の core の trackVenue と同じ語）
	const VENUE = { track_sapporo: '札幌', track_hakodate: '函館', track_fukushima: '福島', track_niigata: '新潟', track_nakayama: '中山', track_tokyo: '東京', track_chukyo: '中京', track_kyoto: '京都', track_hanshin: '阪神', track_kokura: '小倉', track_oi: '大井', track_kawasaki: '川崎', track_funabashi: '船橋', track_morioka: '盛岡', track_longchamp: 'ロンシャン', track_santaanita: 'サンタアニタパーク', track_delmar: 'デルマー' };

	/* 対象スキルの列挙の区分（C-274 の 5）: スキルのデータの区分 tags.phase から 0＝序盤・1＝中盤・2＝終盤・3＝その他。
	 * 2つの区分にまたがるスキルは早いほうに1回だけ */
	const PHASE = ['序盤', '中盤', '終盤', 'その他'];
	const PHASE_OF = { early: 0, start: 0, mid: 1, midpoint: 1, late: 2, second_half: 2, final_stage: 2, lastspurt: 2 };
	function phaseOf(tags) { const a = (tags || []).map((t) => PHASE_OF[t]).filter((v) => v != null); return a.length ? Math.min(...a) : 3; }

	/* ---------- 公開データの索引 ---------- */
	const SK = new Map();
	const scen = new Set(D.scenarioSkillIds), outs = new Set(D.nonSupportIds);
	D.skills.forEach((s, i) => {
		const cat = scen.has(s.id) || s.scenario.length ? 'scenario' : outs.has(s.id) ? 'outside' : 'other';
		SK.set(s.id, { id: s.id, name: s.name, dist: s.dist, style: s.style, surface: s.surface, cat, phase: phaseOf(s.phase), order: i });
	});
	D.scenarioFactors.forEach((f, i) => SK.set(f.id, { id: f.id, name: f.name, dist: [], style: [], surface: [], cat: 'factor', phase: 3, order: 10000 + i }));
	const GENES = new Map(D.genes.map((g) => [g.id, g]));
	const COS = new Map(D.costumes.map((c) => [c.id, c]));
	const UNIQ = new Map(); // 固有スキル名 → 衣装 id
	D.costumes.forEach((c) => c.uniq.forEach((n) => UNIQ.set(n, c.id)));
	const RACES = new Map(D.races.map((r) => [r.id, r]));

	function skill(id) { return SK.get(id) || { id, name: id, dist: [], style: [], surface: [], cat: 'other', phase: 3, order: 99999 }; }
	function costume(id) { return COS.get(id) || null; }
	function fullName(uma) { const c = costume(uma); return c ? '［' + c.title + '］' + c.chara : '（衣装が未定）'; }
	function charaName(uma) { const c = costume(uma); return c ? c.chara : '？'; }
	/** 縮小の列の名前: 衣装ごとの略称（5文字まで。data/deck-alpha/uma-abbrev.json）。無い衣装はキャラ名の頭5文字（C-275 の 7・8） */
	const ABBR = new Map((D.abbrev || []).map((e) => [e.id, e.abbr]));
	function shortName(uma) { const c = costume(uma); return c ? ABBR.get(uma) || Array.from(c.chara).slice(0, 5).join('') : '？'; }
	function uniqName(uma) { const c = costume(uma); return c ? c.uniq[c.uniq.length - 1] : ''; }
	function starText(v) { return v == null ? '—' : v < 0 ? '★?' : '★' + v; }
	function blueText(b) { return b ? BLUE[b[0]] + starText(b[1]) : '—'; }
	function redText(r) { return r ? RED[r[0]] + starText(r[1]) : '—'; }

	/* ---------- レースの一覧と表記（UmaStar の core の raceDateText・raceShortText・raceCondText と同じ形） ---------- */
	function raceDateText(r) { const m = r && r.date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date) : null; return m ? Number(m[2]) + '/' + Number(m[3]) : (r && r.dateLabel) || ''; }
	function raceShortText(r) {
		if (!r) return '';
		const parts = []; const v = VENUE[r.venue]; if (v) parts.push(v);
		const sf = SURF[r.surface] || '';
		if (r.distance) parts.push(sf + r.distance + 'm'); else { if (sf) parts.push(sf); if (DIST[r.distanceCategory]) parts.push(DIST[r.distanceCategory]); }
		return parts.join(' ');
	}
	/** UmaStar の「レース」の欄に出る行（selectable: false の行は出ない＝Deck では終了とみなす） */
	function activeRaces() { return D.races.filter((r) => r.selectable); }
	function arcCatOf(r) { return r.surface === 'dirt' ? 'dirt' : (DIST[r.distanceCategory] ? r.distanceCategory : 'medium'); }
	/** セットの条件（遺伝子の行に使う距離・バ場。C-271 の 23・25） */
	function setCond(set) {
		if (!set || set.kind === 'exam') return { dist: null, surface: null };
		if (set.kind === 'race') return { dist: DIST[set.race.distanceCategory] ? set.race.distanceCategory : null, surface: set.race.surface || null };
		if (set.cat === 'dirt') return { dist: null, surface: 'dirt' };
		return { dist: set.cat, surface: 'turf' };
	}
	function setName(set) { if (!set) return '指定なし'; if (set.kind === 'exam') return '技能試験'; return set.kind === 'race' ? (raceDateText(set.race) ? raceDateText(set.race) + ' ' : '') + set.race.name : ARC[set.cat]; }
	/** 見出しのボタンの短い表記（UmaStar の帯のレースのボタンと同じ「京都 芝3000m」の形。終了レースはカテゴリの名前） */
	function setShort(set) { if (!set) return '指定なし'; if (set.kind === 'exam') return '技能試験'; return set.kind === 'race' ? (raceShortText(set.race) || set.race.name) : ARC[set.cat]; }
	function newRaceSet(r) { return { id: 'r:' + r.id, kind: 'race', raceId: r.id, race: { id: r.id, name: r.name, date: r.date, dateLabel: r.dateLabel, venue: r.venue, surface: r.surface, distance: r.distance, distanceCategory: r.distanceCategory }, skills: {}, sends: 0 }; }
	function newArcSet(cat) { return { id: 'arc:' + cat, kind: 'arc', cat, skills: {}, sends: 0 }; }
	/** UmaStar の②から送られたスキルの一覧を足す（C-271 の 3）。前の一覧と OR。最新の送りに入っていたかは skills[id] === sends で分かる。①の脚質は記録しない（C-272 の 2） */
	function addSend(set, ids) {
		set.sends = (set.sends || 0) + 1;
		ids.forEach((id) => { set.skills[id] = set.sends; });
	}
	/** 「指定なし」の一覧（T97・140。一度も送っていなければ作る） */
	function newNoneList() { return { id: 'none', kind: 'none', skills: {}, sends: 0 }; }
	/** 技能試験の一覧（T104。UmaExam から一度も送っていなければ保存データに無い） */
	function newExamList() { return { id: 'exam', kind: 'exam', skills: {}, sends: 0 }; }
	function cleanExam(n) { return n && typeof n === 'object' && n.skills && typeof n.skills === 'object' && typeof n.sends === 'number' && n.sends > 0 ? { id: 'exam', kind: 'exam', skills: n.skills, sends: n.sends } : null; }
	/** UmaStar 用の表の「指定なし」に出す親か（UmaExam から新しく登録した親は出さない。レースのセットに入るのは親の小窓で選んだときだけ。233・245） */
	function inNoneList(p) { return p.from !== 'exam'; }
	/** 送りの回を区別する一覧か（レースのセットと「指定なし」の一覧。終了レースのカテゴリでは区別しない） */
	function sendsKind(set) { return !!set && (set.kind === 'race' || set.kind === 'none'); }
	/** そのスキルが前回までの一覧にだけあるか */
	function oldOnly(set, id) { return sendsKind(set) && set.sends > 1 && id in set.skills && set.skills[id] < set.sends; }
	/** 「指定なし」の一覧の形を確かめる（崩れていれば無いものとする） */
	function cleanNone(n) { return n && typeof n === 'object' && n.skills && typeof n.skills === 'object' && typeof n.sends === 'number' && n.sends > 0 ? { id: 'none', kind: 'none', skills: n.skills, sends: n.sends } : null; }

	/**
	 * 終了したレースを終了レースのカテゴリへ付け替える（C-271 の 2）。レースの一覧から消えたセットが対象。
	 * 親の sets を付け替え、スキルの一覧は OR でまとめ（区別しない）、本育成設計はカテゴリ側に無ければ移す。何度かけても結果は同じ。
	 * 戻り値: 中身を書き換えた親の一覧と、付け替えたセットの名前
	 */
	function archiveEnded(doc) {
		const live = new Set(activeRaces().map((r) => r.id));
		const changed = new Map(), moved = [];
		doc.sets.filter((s) => s.kind === 'race' && !live.has(s.raceId)).forEach((s) => {
			const cat = arcCatOf(s.race); let a = doc.sets.find((x) => x.id === 'arc:' + cat);
			if (!a) { a = newArcSet(cat); doc.sets.push(a); }
			Object.keys(s.skills).forEach((id) => { a.skills[id] = 1; }); a.sends = Math.max(1, a.sends || 0);
			doc.parents.forEach((p) => { const i = (p.sets || []).indexOf(s.id); if (i < 0) return; p.sets.splice(i, 1); if (!p.sets.includes(a.id)) p.sets.push(a.id); changed.set(p.id, p); });
			if (doc.plans[s.id] && !doc.plans[a.id]) doc.plans[a.id] = doc.plans[s.id];
			delete doc.plans[s.id];
			doc.sets = doc.sets.filter((x) => x !== s);
			moved.push(setName(s) + ' → ' + ARC[cat]);
		});
		return { changed: [...changed.values()], moved };
	}

	/* ---------- 保存（IndexedDB uma-deck。親1人1件 ＋ meta。C-275 の 3） ---------- */
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
		putParents(list) { return tx(['parents'], 'readwrite', (t) => { const s = t.objectStore('parents'); list.forEach((p) => s.put(p)); }).then(persistOnce); },
		deleteParent(id) { return tx(['parents'], 'readwrite', (t) => t.objectStore('parents').delete(id)); },
		putMeta(key, value) { return tx(['meta'], 'readwrite', (t) => t.objectStore('meta').put({ key, value })); },
		putHead(doc) { return tx(['meta'], 'readwrite', (t) => t.objectStore('meta').put({ key: 'doc', value: docHead(doc) })); },
		replaceAll(doc) { return tx(['parents', 'meta'], 'readwrite', (t) => { const s = t.objectStore('parents'); s.clear(); doc.parents.forEach((p) => s.put(p)); t.objectStore('meta').put({ key: 'doc', value: docHead(doc) }); }).then((r) => (doc.parents.length ? persistOnce(r) : r)); },
		clear() { return tx(['parents', 'meta'], 'readwrite', (t) => { t.objectStore('parents').clear(); t.objectStore('meta').delete('doc'); }); },
	};
	/** 親を保存したときに navigator.storage.persist() を1回呼ぶ（C-275 の 3・C-268 の B）。ページを開いている間に1回だけ。結果は待たず、失敗しても保存は成り立つ */
	let persistAsked = false;
	function persistOnce(r) {
		if (!persistAsked) { persistAsked = true; try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* 使えない環境では何もしない */ } }
		return r;
	}
	function docHead(doc) { const h = { schema: doc.schema, next: doc.next, sets: doc.sets, plans: doc.plans, data: doc.data }; if (doc.none) h.none = doc.none; if (doc.exam) h.exam = doc.exam; return h; }

	/* ---------- 設定（表示の状態。データの文書とは別に meta の settings に持つ） ---------- */
	const DEFAULT_SETTINGS = { theme: 'auto', gp: true, th: 1, geneRows: true, lastExport: null, cur: 'none', mode: 'star', colMax: true, colEff: true };

	/* ---------- 文書の組み立て ---------- */
	function emptyDoc() { return { format: 'uma-deck', schema: SCHEMA, tool: 'star', savedAt: null, data: D.versions, next: 1, sets: [], parents: [], plans: {} }; }
	function assemble(loaded) {
		const head = loaded.meta.doc || null;
		const doc = emptyDoc(); doc.parents = loaded.parents.slice();
		if (head) { doc.schema = head.schema || SCHEMA; doc.next = head.next || 1; doc.sets = head.sets || []; doc.plans = head.plans || {}; doc.data = head.data || D.versions; const nn = cleanNone(head.none); if (nn) doc.none = nn; const ne = cleanExam(head.exam); if (ne) doc.exam = ne; }
		doc.parents.sort((a, b) => numId(a.id) - numId(b.id));
		return doc;
	}
	function numId(id) { return +String(id).replace(/^p/, '') || 0; }
	function findSet(doc, key) { if (key === 'exam') return doc.exam || newExamList(); return key && key !== 'none' ? doc.sets.find((s) => s.id === key) || null : null; }
	/** 選べるセットの並び（レースの一覧の順 → 終了レースのカテゴリ） */
	function orderedSets(doc) {
		const races = activeRaces().map((r) => doc.sets.find((s) => s.id === 'r:' + r.id)).filter(Boolean);
		const arcs = ARC_ORDER.map((c) => doc.sets.find((s) => s.id === 'arc:' + c)).filter(Boolean);
		return races.concat(arcs);
	}

	/* ---------- 親と祖・充足の計算 ---------- */
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
		/* 遺伝子（C-271 の 23）: cond = { dist, surface, styles:[...] }。行は 距離・脚質・バ場 のうち条件の指定がある項目だけ */
		function geneRowsOf(cond) {
			const a = [];
			if (cond.dist) a.push({ key: 'dist', keys: [cond.dist], label: DIST[cond.dist] });
			if (cond.styles && cond.styles.length) a.push({ key: 'style', keys: cond.styles.slice(), label: cond.styles.map((s) => STYLE[s]).join('・') });
			if (cond.surface) a.push({ key: 'surface', keys: [cond.surface], label: SURF[cond.surface] });
			return a;
		}
		/** 1人の、行 row に合う遺伝子の★の数（★不明は数えない） */
		function geneStar(m, row) { if (!m) return 0; let n = 0; for (const k in (m.genes || {})) if (row.keys.includes(GENE_KEY[k]) && m.genes[k] > 0) n += m.genes[k]; return n; }
		/** 親の列の値（「祖2人も数える」なら祖2人も足す） */
		function geneFam(p, row) { const f = fam(p); return geneStar(f[0], row) + (gpOn ? geneStar(f[1], row) + geneStar(f[2], row) : 0); }
		/** 親と祖の、合う遺伝子の★の合計（全行。2組を探す・親Bのおすすめの並べ方に使う） */
		function geneTotal(p, grows) { return grows.reduce((a, row) => a + geneFam(p, row), 0); }
		function geneText(m, grows) { const keys = grows ? grows.flatMap((g) => g.keys) : []; const a = []; for (const k in (m.genes || {})) { const g = GENES.get(k); const nm = g ? g.name.replace('の遺伝子', '') : k; const inn = !grows || keys.includes(GENE_KEY[k]); a.push((inn ? '' : '（') + nm + '★' + m.genes[k] + (inn ? '' : '）')); } return a.join(' ') || 'なし'; }
		// 行の母集団（「指定なし」のとき）: 登録されている全親（と祖）が持つスキル
		const rowSet = new Set();
		doc.parents.forEach((p) => { if (!inNoneList(p)) return; fam(p).forEach((m) => Object.keys(m.skills || {}).forEach((id) => rowSet.add(id))); });
		const rows = [...rowSet].map(skill).sort((a, b) => a.order - b.order);
		// 管理番号
		const dup = {}; doc.parents.forEach((p) => { dup[p.date] = (dup[p.date] || 0) + 1; });
		function code(p) { return p.date.slice(5).replace('-', '/') + (dup[p.date] > 1 ? '-' + p.no : ''); }
		function codeFull(p) { return p.date + (dup[p.date] > 1 ? '-' + p.no : ''); }
		// 祖の親（曾祖）: 紐づけた祖だけ分かる
		function gpParents(m) { if (!m.linked || !m.gp) return null; return m.gp.map((g) => { const x = member(g); return { uma: x.uma, red: x.red, id: x.id }; }); }
		return { doc, byId, th, gpOn, ok, member, fam, famHas, gpOnly, triple, geneRowsOf, geneStar, geneFam, geneTotal, geneText, rows, code, codeFull, gpParents };
	}

	/* ---------- 本育成設計（C-271 の 13〜17） ---------- */
	const POS = ['親A', '祖A1', '祖A2', '親B', '祖B1', '祖B2'];
	function emptyPlan() { return { slots: [null, null, null, null, null, null], applied: false }; }
	function planFull(pl) { return !!pl && pl.slots.every(Boolean); }
	/** 親 p が (1) そのまま使える（親と祖3人が片側に完全一致・祖は順不同）なら 1、(2) 祖として構成できる（本人の衣装が6人のどれか）なら 2、どちらでもなければ 0 */
	function planMatch(M, p, pl) {
		const f = M.fam(p).map((m) => m.uma), s = pl.slots;
		for (let side = 0; side < 2; side++) {
			const a = s[side * 3], g1 = s[side * 3 + 1], g2 = s[side * 3 + 2];
			if (f[0] === a && f[1] && f[2] && ((f[1] === g1 && f[2] === g2) || (f[1] === g2 && f[2] === g1))) return 1;
		}
		return s.includes(p.uma) ? 2 : 0;
	}

	/* ---------- 2組を探す（ビット列）。並べ方は 充足 → 遺伝子の★ ---------- */
	function findPairs(M, ps, rows, grows, limit) {
		const S = rows.length, W = Math.ceil(S / 32);
		const bits = ps.map((p) => { const a = new Uint32Array(W); rows.forEach((s, k) => { if (M.famHas(p, s.id)) a[k >> 5] |= 1 << (k & 31); }); return a; });
		const gn = ps.map((p) => M.geneTotal(p, grows));
		const pop = (x) => { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
		const res = [];
		for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
			let n = 0; const A = bits[a], B = bits[b]; for (let w = 0; w < W; w++) n += pop((A[w] | B[w]) >>> 0);
			const item = { a: ps[a], b: ps[b], n, g: gn[a] + gn[b] };
			if (res.length < limit) { res.push(item); res.sort(cmpPair); }
			else if (cmpPair(item, res[limit - 1]) < 0) { res[limit - 1] = item; res.sort(cmpPair); }
		}
		return { top: res, total: ps.length * (ps.length - 1) / 2 };
	}
	function cmpPair(x, y) { return y.n - x.n || y.g - x.g; }

	/* ---------- 親Bのおすすめ。並べ方は 埋める数 → ★の合計 → 遺伝子の★ ---------- */
	function recommendB(M, A, ps, rows, grows, limit) {
		const lack = rows.filter((s) => !M.famHas(A, s.id)).map((s) => s.id);
		const out = ps.filter((p) => p.id !== A.id).map((p) => {
			const fill = lack.filter((id) => M.famHas(p, id));
			const st = fill.reduce((acc, id) => acc + M.triple(p, id), 0);
			return { p, n: fill.length, st, g: M.geneTotal(p, grows) };
		}).sort((a, b) => b.n - a.n || b.st - a.st || b.g - a.g);
		return { lack, list: out.slice(0, limit) };
	}

	/* ---------- 登録の画面: 祖が同一かを判断させる候補（C-272 の 13〜15）。
	 * 衣装が同じ登録済みの親を候補にし（衣装が未定なら白スキルの一致が半分以上の親）、exact（衣装・白スキル・★が全部同じ）→ 白スキルの一致の多い順に5人まで。
	 * 「同一」を選んだ状態で出すのは exact が1人だけのとき（C-271 の 28）。一致率は画面に出さない（並べる順にだけ使う） ---------- */
	function matchCandidates(doc, person) {
		const out = [];
		doc.parents.forEach((p) => {
			if (person.uma && p.uma !== person.uma) return;
			const a = person.skills || {}, b = p.skills || {}; const ka = Object.keys(a), kb = Object.keys(b);
			const union = new Set(ka.concat(kb)); let same = 0, starSame = 0, starCmp = 0;
			ka.forEach((id) => { if (id in b) { same++; if (a[id] >= 0 && b[id] >= 0) { starCmp++; if (a[id] === b[id]) starSame++; } } });
			const j = union.size ? same / union.size : 0;
			const score = Math.round(j * 100);
			const exact = person.uma === p.uma && same === union.size && starSame === starCmp && (person.green == null || p.green == null || person.green < 0 || p.green < 0 || person.green === p.green);
			if (person.uma || j >= .5 || exact) out.push({ p, score, exact });
		});
		return out.sort((x, y) => (y.exact - x.exact) || (y.score - x.score) || numId(y.p.id) - numId(x.p.id)).slice(0, 5);
	}

	/* ---------- バックアップ ---------- */
	function buildExport(doc) {
		const now = new Date();
		const tz = -now.getTimezoneOffset(); const sign = tz >= 0 ? '+' : '-'; const hh = String(Math.floor(Math.abs(tz) / 60)).padStart(2, '0'), mm = String(Math.abs(tz) % 60).padStart(2, '0');
		const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19) + sign + hh + ':' + mm;
		const out = { format: 'uma-deck', schema: SCHEMA, tool: 'star', savedAt: local, data: doc.data, next: doc.next, sets: doc.sets, parents: doc.parents, plans: doc.plans };
		if (doc.none) out.none = doc.none; // 「指定なし」の一覧（T97。送ったことがあるときだけ）
		if (doc.exam) out.exam = doc.exam; // 技能試験の一覧（T104。送ったことがあるときだけ）
		return out;
	}
	function exportFileName() { const d = new Date(); return 'uma-deck-star-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json'; }
	/**
	 * 第1版（schema 1・版9 の書き出し）からの移行。何度かけても同じ結果になり、schema 2 のデータは変えない（恒久ルール28）。
	 * まとまり（bundles）はレースの一覧の行と結べないので、条件（距離・バ場）から終了レースのカテゴリへ入れる。欲しいスキル（want）はそのカテゴリのスキルの一覧へ。
	 * 親の bundles → sets、tags は style だけ残す。目標の6人（targets.t1）は「指定なし」の本育成設計へ（次善・必須は捨てる）。
	 */
	function migrate1to2(j) {
		const sets = [], map = {};
		(j.bundles || []).forEach((b) => { const cat = b.surface === 'dirt' ? 'dirt' : (DIST[b.dist] ? b.dist : 'medium'); let a = sets.find((s) => s.cat === cat); if (!a) { a = newArcSet(cat); sets.push(a); } (b.want || []).forEach((id) => { a.skills[id] = 1; }); a.sends = 1; map[b.id] = a.id; });
		const parents = (j.parents || []).map((p) => { const q = Object.assign({}, p); q.sets = [...new Set((p.bundles || []).map((id) => map[id]).filter(Boolean))]; delete q.bundles; q.tags = { style: (p.tags && p.tags.style) || [] }; return q; });
		const plans = {}; const t1 = j.targets && j.targets.t1; if (Array.isArray(t1) && t1.some(Boolean)) plans.none = { slots: t1.slice(0, 6).concat([null, null, null, null, null, null]).slice(0, 6), applied: false };
		return { sets, parents, plans };
	}
	function parseImport(text) {
		let j; try { j = JSON.parse(text); } catch (e) { return { error: 'JSON として読めません' }; }
		if (!j || j.format !== 'uma-deck') return { error: 'Deck (αテスト)のバックアップではありません' };
		if (j.tool !== 'star') return { error: (j.tool === 'exam' ? 'UmaExam' : '別のツール') + ' のファイルです。UmaStar の Deck (αテスト)には読み込めません' };
		if (typeof j.schema !== 'number') return { error: '版が分かりません' };
		if (j.schema > SCHEMA) return { error: '新しい版（' + j.schema + '）のファイルです。Deck (αテスト)を更新してから読み込んでください' };
		if (!Array.isArray(j.parents)) return { error: '親のデータがありません' };
		const migrated = j.schema < SCHEMA;
		const body = migrated ? migrate1to2(j) : { sets: j.sets || [], parents: j.parents, plans: j.plans || {} };
		const doc = { format: 'uma-deck', schema: SCHEMA, tool: 'star', savedAt: j.savedAt || null, data: j.data || D.versions, next: j.next || (j.parents.length + 1), sets: body.sets, parents: body.parents, plans: body.plans };
		const nn = cleanNone(j.none); if (nn) doc.none = nn;
		const ne = cleanExam(j.exam); if (ne) doc.exam = ne;
		return { doc, migrated, fromSchema: j.schema };
	}
	function daysSince(iso) { if (!iso) return null; const t = new Date(iso).getTime(); if (!isFinite(t)) return null; return Math.floor((Date.now() - t) / 86400000); }

	/* ---------- 親を消す（紐づいている祖には中身を写してから消す。C-271 の 26） ---------- */
	function dependents(doc, id) { return doc.parents.filter((p) => (p.gp || []).some((g) => g.link === id)); }
	function removeParent(doc, id) {
		const deps = dependents(doc, id);
		const src = doc.parents.find((p) => p.id === id); if (!src) return { changed: [] };
		const changed = [];
		deps.forEach((p) => { p.gp = p.gp.map((g) => g.link === id ? Object.assign({ uma: src.uma, blue: src.blue, red: src.red, green: src.green, skills: src.skills, genes: src.genes }, src.sheet ? { sheet: src.sheet } : {}) : g); changed.push(p); });
		doc.parents = doc.parents.filter((p) => p.id !== id);
		return { changed };
	}

	/* ---------- 見た目（テーマ） ---------- */
	function isDark(mode) { return mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); }
	function applyTheme(mode) { document.documentElement.setAttribute('data-theme', isDark(mode) ? 'dark' : 'light'); }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

	/* ---------- レース/周回セットの選択欄（Deck の見出しと登録の画面で共通。UmaStar の「レース」の欄と同じ形: 指定なし → 一覧の行〔1行目＝日付＋名前、2行目＝条件〕） ---------- */
	function setListHtml(doc, cur, opts) {
		const o = opts || {};
		const cnt = (id) => doc.parents.reduce((n, p) => n + ((p.sets || []).includes(id) ? 1 : 0), 0);
		const nNone = doc.parents.filter(inNoneList).length; // 「指定なし」に出る親の数（233）
		const opt = (key, l1, l2, extra) => '<label class="ropt' + (key === cur ? ' on' : '') + '"><input type="radio" name="setpick" value="' + esc(key) + '"' + (key === cur ? ' checked' : '') + '><span class="rtx"><span class="l1">' + esc(l1) + '</span>' + (l2 ? '<span class="l2">' + esc(l2) + '</span>' : '') + '</span>' + (extra ? '<span class="rn">' + esc(extra) + '</span>' : '') + '</label>';
		let h = '<div class="rlist" role="radiogroup" aria-label="レース/周回セット">' + opt('none', '指定なし', '', o.counts ? '親' + nNone + '人' : '');
		activeRaces().forEach((r) => { const id = 'r:' + r.id; const has = doc.sets.some((s) => s.id === id); h += opt(id, (raceDateText(r) ? raceDateText(r) + ' ' : '') + r.name, raceShortText(r), o.counts ? (has ? '親' + cnt(id) + '人' : '親0人') : ''); });
		const arcs = ARC_ORDER.map((c) => doc.sets.find((s) => s.id === 'arc:' + c)).filter(Boolean);
		if (arcs.length && !o.noArc) { h += '<div class="rgh">終了レース</div>'; arcs.forEach((s) => { h += opt(s.id, ARC[s.cat], '', o.counts ? '親' + cnt(s.id) + '人' : ''); }); }
		return h + '</div>';
	}

	window.DeckAlpha = { VERSION: DECK_ALPHA_CORE_VERSION, D, SK, GENES, COS, UNIQ, RACES, BLUE, RED, DIST, STYLE, SURF, CAT, PHASE, GENE_KEY, ARC, ARC_ORDER, POS, skill, costume, fullName, charaName, shortName, uniqName, starText, blueText, redText,
		raceDateText, raceShortText, activeRaces, setCond, setName, setShort, newRaceSet, newArcSet, newNoneList, newExamList, inNoneList, EFF: D.efficiency, sendsKind, addSend, oldOnly, archiveEnded, findSet, orderedSets, setListHtml,
		store, DEFAULT_SETTINGS, emptyDoc, assemble, makeModel, emptyPlan, planFull, planMatch, findPairs, recommendB, matchCandidates, buildExport, exportFileName, parseImport, migrate1to2, daysSince, dependents, removeParent, isDark, applyTheme, esc };
})();
