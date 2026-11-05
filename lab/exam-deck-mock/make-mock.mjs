// T104 段1 のモック（lab/exam-deck-mock.html）の部品を作る。
// 使い方: node lab/exam-deck-mock/make-mock.mjs  → このフォルダの core.js・deck.js・register.js・data-snapshot.js・exam-result.html を書き直す
// 製品の js/deck-alpha*.js と lab/result-heatmap-mock.html（T100）を読み、下の置き換えだけを当てた写しを作る（製品のファイルは変えない）。
// 置き換えの一覧が、そのまま段2 で製品に入れる変更の見取り図になる。当たらない置き換えがあれば止まる。
// モックの保存は sessionStorage の uma-lab-exam-deck だけ（IndexedDB の uma-deck・localStorage の umaDeck:send には触れない）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const readText = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const read = (p) => JSON.parse(readText(p));
const out = (name, text) => fs.writeFileSync(path.join(here, name), text, 'utf8');

function patch(text, list, label) {
	let t = text;
	list.forEach(([a, b], i) => {
		if (a instanceof RegExp) { if (!a.test(t)) throw new Error(label + ' の置き換え ' + i + ' が当たらない: ' + a); t = t.replace(a, b); return; }
		if (!t.includes(a)) throw new Error(label + ' の置き換え ' + i + ' が当たらない: ' + a.slice(0, 80));
		t = t.split(a).join(b);
	});
	return t;
}

/* ---------- 公開データの写し（js/deck-alpha-data.js の build と同じ形に、効率と133種を足す） ---------- */
function snapshot() {
	const master = read('uma-skill-deck-skills.json'), ext = read('data/extended-skills.json'), sf = read('data/scenario-inheritance-factors.json'), genes = read('data/aptitude-genes.json');
	const uma = read('data/training-umamusume.json'), nonSupport = read('data/non-support-skills.json'), rec = read('data/recommended-skills.json'), races = read('data/upcoming-races.json'), abbrev = read('data/deck-alpha/uma-abbrev.json');
	const eff = read('data/skill-efficiency.json'), sheet = read('data/melop-sheet-rows.json');
	const extName = new Map();
	for (const e of ext.entries || ext.skills || []) extName.set(e.id, e.name);
	const skills = master.skills.map((s) => ({ id: s.id, name: s.name, dist: s.tags.distance || [], style: s.tags.style || [], surface: s.tags.surface || [], scenario: s.tags.scenario || [], phase: s.tags.phase || [], passive: (s.tags.passive || []).length > 0 }));
	for (const e of ext.entries || ext.skills || []) { const t = e.tags || {}; skills.push({ id: e.id, name: e.name, dist: t.distance || [], style: t.style || [], surface: t.surface || [], scenario: t.scenario || [], phase: t.phase || [], passive: (t.passive || []).length > 0 }); }
	const costumes = uma.entries.map((u) => { const uniq = []; for (const row of u.initialSkills || []) for (const sk of row.skills || []) { const n = sk.name || extName.get(sk.skillId) || ''; if (n && !uniq.includes(n)) uniq.push(n); } return { id: u.id, title: u.title, chara: u.charaName, star: u.initialStar, uniq }; });
	// 133種の並びの正本は exam.html の EXAM_SKILL_LIST（ここでは id だけ読む）
	const m = readText('exam.html').match(/const EXAM_SKILL_LIST\s*=\s*\[([\s\S]*?)\n\s*\];/);
	const exam133 = [...m[1].matchAll(/\{\s*id:\s*'([^']+)'/g)].map((x) => x[1]);
	if (exam133.length !== 133) throw new Error('133種が読めない: ' + exam133.length);
	const efficiency = {}; eff.entries.forEach((e) => { if (exam133.includes(String(e.skillId))) efficiency[e.skillId] = e.efficiency; });
	const D = {
		versions: { master: master.masterVersion, extended: ext.dataVersion, training: uma.dataVersion, genes: genes.dataVersion, scenarioFactors: sf.dataVersion, nonSupport: nonSupport.dataVersion, recommended: rec.dataVersion, races: races.dataVersion, abbrev: abbrev.dataVersion },
		skills, scenarioFactors: sf.entries.map((e) => ({ id: e.id, name: e.name })), genes: genes.entries.map((e) => ({ id: e.id, name: e.name })), costumes,
		nonSupportIds: nonSupport.entries.map((e) => e.skillId), scenarioSkillIds: rec.skills.filter((s) => s.section === 'scenario').map((s) => s.skillId),
		races: races.races.map((r) => ({ id: r.id, name: r.name, date: r.date, dateLabel: r.dateLabel, venue: r.venue, surface: r.surface, distance: r.distance, distanceCategory: r.distanceCategory, selectable: r.selectable !== false })),
		abbrev: (abbrev.entries || []).map((e) => ({ id: e.id, abbr: e.abbr })),
		// T104 で足す: 効率（133種の分だけ）・133種・id の無いめろっぷの行の名前（仮のデータの見本用）
		exam133, efficiency, sheetNames: sheet.rows.filter((r) => !r.id && !r.slot).map((r) => r.name),
	};
	const missing = exam133.filter((id) => efficiency[id] == null);
	console.log('133種のうち効率のある数', exam133.length - missing.length, '無い', missing.length);
	out('data-snapshot.js', '// 公開データの写し（lab/exam-deck-mock/make-mock.mjs が作る。手で直さない）\nwindow.DECK_ALPHA_DATA = ' + JSON.stringify(D) + ';\n');
}

/* ---------- core ---------- */
function core() {
	let t = readText('js/deck-alpha-core.js');
	t = t.replace(/let dbP = null;[\s\S]*?function docHead\(doc\)/, `// モック: 保存は sessionStorage の uma-lab-exam-deck だけ（製品は IndexedDB の uma-deck。navigator.storage.persist() も呼ばない）
	const MOCK_KEY = 'uma-lab-exam-deck';
	let memCache = null;
	function mem() { if (memCache) return memCache; try { memCache = JSON.parse(sessionStorage.getItem(MOCK_KEY) || 'null'); } catch (e) { memCache = null; } if (!memCache) memCache = { parents: [], meta: {} }; return memCache; }
	function memSave() { try { sessionStorage.setItem(MOCK_KEY, JSON.stringify(memCache)); } catch (e) { /* 保存できなくても開いている間は動く */ } }
	const copy = (v) => JSON.parse(JSON.stringify(v));
	const store = {
		async load() { const m = mem(); return { parents: copy(m.parents), meta: copy(m.meta), ms: 0 }; },
		async putParents(list) { const m = mem(); list.forEach((p) => { const i = m.parents.findIndex((x) => x.id === p.id); if (i >= 0) m.parents[i] = copy(p); else m.parents.push(copy(p)); }); memSave(); },
		async deleteParent(id) { const m = mem(); m.parents = m.parents.filter((x) => x.id !== id); memSave(); },
		async putMeta(key, value) { mem().meta[key] = copy(value); memSave(); },
		async putHead(doc) { mem().meta.doc = copy(docHead(doc)); memSave(); },
		async replaceAll(doc) { const m = mem(); m.parents = copy(doc.parents); m.meta.doc = copy(docHead(doc)); memSave(); },
		async clear() { const m = mem(); m.parents = []; delete m.meta.doc; memSave(); },
	};
	function docHead(doc)`);
	t = patch(t, [
		['/* js/deck-alpha-core.js — ', '/* T104 段1 のモック: 製品の js/deck-alpha-core.js の写し（make-mock.mjs が作る。手で直さない）。\n * js/deck-alpha-core.js — '],
		// 技能試験の一覧（doc.exam）。「指定なし」の一覧（T97）と同じ形で、UmaExam から送るたびに133種を足す。無ければ今までの保存データのまま
		["function newNoneList() { return { id: 'none', kind: 'none', skills: {}, sends: 0 }; }", "function newNoneList() { return { id: 'none', kind: 'none', skills: {}, sends: 0 }; }\n\t/** 技能試験の一覧（T104。UmaExam から一度も送っていなければ保存データに無い） */\n\tfunction newExamList() { return { id: 'exam', kind: 'exam', skills: {}, sends: 0 }; }\n\tfunction cleanExam(n) { return n && typeof n === 'object' && n.skills && typeof n.skills === 'object' && typeof n.sends === 'number' && n.sends > 0 ? { id: 'exam', kind: 'exam', skills: n.skills, sends: n.sends } : null; }"],
		["if (!set) return { dist: null, surface: null };", "if (!set || set.kind === 'exam') return { dist: null, surface: null };"],
		["function setName(set) { if (!set) return '指定なし'; return set.kind === 'race'", "function setName(set) { if (!set) return '指定なし'; if (set.kind === 'exam') return '技能試験'; return set.kind === 'race'"],
		["function setShort(set) { if (!set) return '指定なし'; return set.kind === 'race'", "function setShort(set) { if (!set) return '指定なし'; if (set.kind === 'exam') return '技能試験'; return set.kind === 'race'"],
		["if (doc.none) h.none = doc.none; return h;", "if (doc.none) h.none = doc.none; if (doc.exam) h.exam = doc.exam; return h;"],
		["const DEFAULT_SETTINGS = { theme: 'auto', gp: true, th: 1, geneRows: true, lastExport: null, cur: 'none' };", "const DEFAULT_SETTINGS = { theme: 'auto', gp: true, th: 1, geneRows: true, lastExport: null, cur: 'none', mode: 'star', colMax: true, colEff: true };"],
		["const nn = cleanNone(head.none); if (nn) doc.none = nn; }", "const nn = cleanNone(head.none); if (nn) doc.none = nn; const ne = cleanExam(head.exam); if (ne) doc.exam = ne; }"],
		["function findSet(doc, key) { return key && key !== 'none' ?", "function findSet(doc, key) { if (key === 'exam') return doc.exam || newExamList(); return key && key !== 'none' ?"],
		["const inn = keys.includes(GENE_KEY[k]);", "const inn = !grows.length || keys.includes(GENE_KEY[k]);"],
		["if (doc.none) out.none = doc.none; // 「指定なし」の一覧（T97。送ったことがあるときだけ）", "if (doc.none) out.none = doc.none; // 「指定なし」の一覧（T97。送ったことがあるときだけ）\n\t\tif (doc.exam) out.exam = doc.exam; // 技能試験の一覧（T104。送ったことがあるときだけ）"],
		["const nn = cleanNone(j.none); if (nn) doc.none = nn;", "const nn = cleanNone(j.none); if (nn) doc.none = nn; const ne = cleanExam(j.exam); if (ne) doc.exam = ne;"],
		["{ uma: src.uma, blue: src.blue, red: src.red, green: src.green, skills: src.skills, genes: src.genes }", "{ uma: src.uma, blue: src.blue, red: src.red, green: src.green, skills: src.skills, genes: src.genes, sheet: src.sheet }"],
		["newNoneList, sendsKind,", "newNoneList, newExamList, EFF: D.efficiency, sendsKind,"],
	], 'core');
	out('core.js', t);
}

/* ---------- 本体 ---------- */
function deck() {
	const t = patch(readText('js/deck-alpha.js'), [
		['/* js/deck-alpha.js — ', '/* T104 段1 のモック: 製品の js/deck-alpha.js の写し（make-mock.mjs が作る。手で直さない）。\n * js/deck-alpha.js — '],
		["S.perf.load = loaded.ms;", "if (!loaded.parents.length && !loaded.meta.seeded) { await K.seedMock(); loaded = await K.store.load(); }\n\t\tS.perf.load = loaded.ms;"],
		["S.settings = Object.assign({}, K.DEFAULT_SETTINGS, loaded.meta.settings || {});", "S.settings = Object.assign({}, K.DEFAULT_SETTINGS, loaded.meta.settings || {});\n\t\tif (Q.get('mode')) S.settings.mode = Q.get('mode');\n\t\tS.mode = S.settings.mode === 'exam' ? 'exam' : 'star';"],
		// 起動: ?pair=1 で親A・親Bを選んだ状態で開く（撮影用）
		["applySetDefaults();\n\t\trebuild();\n\t\trenderAll();", "applySetDefaults();\n\t\trebuild();\n\t\tif (Q.get('pair')) { const pr = K.mockPair(S.doc, S.M, S.mode); S.A = pr[0]; S.B = pr[1]; }\n\t\tif (Q.get('rs')) S.rs = Q.get('rs');\n\t\trenderAll();"],
		// どちらの表か
		["const curSet = () => K.findSet(S.doc, S.settings.cur);", "const isExam = () => S.mode === 'exam';\n\tconst curSet = () => isExam() ? K.findSet(S.doc, 'exam') : K.findSet(S.doc, S.settings.cur);"],
		["const curKey = () => (curSet() ? S.settings.cur : 'none');", "const curKey = () => isExam() ? 'exam' : (curSet() ? S.settings.cur : 'none');"],
		["function grows() {\n", "function grows() {\n\t\tif (isExam()) return []; // 技能試験の表に遺伝子の行は無い（96・97）\n"],
		// 効率の順（225）
		["else if (S.rs === 'cat') {", "else if (S.rs === 'eff') { const ef = (s) => K.EFF[s.id] == null ? -1 : K.EFF[s.id]; rows.sort((a, b) => ef(b) - ef(a) || a.order - b.order); }\n\t\telse if (S.rs === 'cat') {"],
		// 引き出しの出し分け
		["function renderFilters() {\n", `/** 充足の分母（UmaExam は名前で絞っていても133種。98） */
	function covRows() { return isExam() ? Object.keys(curSet().skills).map(K.skill).sort((a, b) => a.order - b.order) : visRowsRaw(); }
	/** どちらの表かで出す項目を変える（data-star＝UmaStar 用だけ・data-exam＝UmaExam 用だけ） */
	function syncModeUi() {
		const ex = isExam();
		document.querySelectorAll('[data-star]').forEach((el) => { el.hidden = ex; });
		document.querySelectorAll('[data-exam]').forEach((el) => { el.hidden = !ex; });
		const rs = ex ? [['def', '既定（ゲーム内）'], ['few', '所持率の低いスキル順'], ['max', '★数の大きい順'], ['eff', '効率の高い順']] : [['def', '既定（ゲーム内）'], ['few', '所持率の低いスキル順'], ['max', '★数の大きい順'], ['cat', '分類ごと']];
		$('#rs').innerHTML = rs.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('');
		$('#colMax').setAttribute('aria-pressed', S.settings.colMax ? 'true' : 'false');
		$('#colEff').setAttribute('aria-pressed', S.settings.colEff ? 'true' : 'false');
		const seg = $('#modeSeg');
		if (seg) { seg.hidden = Q.get('sw') !== 'head'; seg.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === S.mode ? 'true' : 'false')); }
		$('#setBtn').hidden = Q.get('sw') === 'head' && ex;
	}
	function renderFilters() {
		syncModeUi();
`],
		// 本育成設計の充足 N/133（98）
		["else $('#planSum').textContent = left ? 'あと' + left + '人' : '';", `else $('#planSum').textContent = left ? 'あと' + left + '人' : '';
		if (isExam() && s.some(Boolean)) { const c = planCover(); $('#planSum').insertAdjacentHTML('beforeend', '<div class="plancov"><b class="mono">' + (c == null ? '—' : c) + '/' + covRows().length + '</b><small>充足</small></div>'); }`],
		["function setSlot(i, uma) {", `/** 本育成設計の6人の充足: その片側の3人と衣装が一致する親（◎そのまま使える）のうち、いちばん多く埋まる組み合わせの種数。片側に居なければその側は 0 種。どちらにも居なければ null */
	function planCover() {
		const M = S.M, s = plan().slots, rows = covRows();
		const side = (k) => { const a = s[k * 3], g1 = s[k * 3 + 1], g2 = s[k * 3 + 2]; if (!a || !g1 || !g2) return []; return S.doc.parents.filter((p) => (p.sets || []).includes('exam')).filter((p) => { const f = M.fam(p).map((m) => m.uma); return f[0] === a && f[1] && f[2] && ((f[1] === g1 && f[2] === g2) || (f[1] === g2 && f[2] === g1)); }); };
		const A = side(0), B = side(1); if (!A.length && !B.length) return null;
		let best = 0; (A.length ? A : [null]).forEach((a) => (B.length ? B : [null]).forEach((b) => { const n = rows.filter((r) => (a && M.famHas(a, r.id)) || (b && M.famHas(b, r.id))).length; if (n > best) best = n; }));
		return best;
	}
	function setSlot(i, uma) {`],
		// 表の寸法: 効率の列の幅
		["nw: n ? 76 : 112, mw: 24, hh: six ? 92 : 76, fs: 10 };", "nw: n ? 76 : 112, mw: 24, ew: 26, hh: six ? 92 : 76, fs: 10 };"],
		["nw: n ? 128 : 184, mw: 30, hh: six ? 150 : 136, fs: 12 };", "nw: n ? 128 : 184, mw: 30, ew: 38, hh: six ? 150 : 136, fs: 12 };"],
		// 技能試験の親がいないとき
		["if (!S.doc.parents.length) { V = null;", "if (isExam() && !S.doc.parents.some((p) => (p.sets || []).includes('exam'))) { V = null; stage.innerHTML = '<div class=\"empty\"><span>技能試験の親はまだいません。UmaExam の OCR から送ってください。</span></div>'; return; }\n\t\tif (!S.doc.parents.length) { V = null;"],
		// 列の幅（最大・効率の列は「表示」で出し入れ。225）
		["L = d.nw + d.mw, totalW", "showM = !isExam() || S.settings.colMax, showE = isExam() && S.settings.colEff, mw = showM ? d.mw : 0, ew = showE ? d.ew : 0, L = d.nw + mw + ew, totalW"],
		["vc.innerHTML = '<div class=\"cnt mono\">' + (six ? '6人' : ps.length + '人') + '<br>' + rows.length + '種</div><button type=\"button\" id=\"sortMax\" class=\"' + (S.rs === 'max' ? 'sorted' : '') + '\" title=\"先代を含む★の合計のうち最大。押すと大きい順\">' + (S.lv === 2 ? 'スキル ＼ 親　' : '') + '最大' + (S.rs === 'max' ? '▼' : '') + '</button>';\n\t\t$('#sortMax').onclick = () => { S.rs = S.rs === 'max' ? 'def' : 'max'; renderAll(); };",
			`vc.innerHTML = '<div class="cnt mono">' + (six ? '6人' : ps.length + '人') + '<br>' + rows.length + '種</div>' + (isExam()
			? '<div class="chd"><span class="chn"' + (S.lv === 2 ? '' : ' hidden') + '>スキル ＼ 親</span>' +
				(showM ? '<button type="button" id="sortMax" class="' + (S.rs === 'max' ? 'sorted' : '') + '" style="width:' + mw + 'px" aria-pressed="' + (S.rs === 'max') + '" title="先代を含む★の合計のうち最大。押すと大きい順">最大</button>' : '') +
				(showE ? '<button type="button" id="sortEff" class="' + (S.rs === 'eff' ? 'sorted' : '') + '" style="width:' + ew + 'px" aria-pressed="' + (S.rs === 'eff') + '" title="技能試験の効率。押すと大きい順">効率</button>' : '') + '</div>'
			: '<button type="button" id="sortMax" class="' + (S.rs === 'max' ? 'sorted' : '') + '" title="先代を含む★の合計のうち最大。押すと大きい順">' + (S.lv === 2 ? 'スキル ＼ 親　' : '') + '最大' + (S.rs === 'max' ? '▼' : '') + '</button>');
		if ($('#sortMax')) $('#sortMax').onclick = () => { S.rs = S.rs === 'max' ? 'def' : 'max'; renderAll(); };
		if ($('#sortEff')) $('#sortEff').onclick = () => { S.rs = S.rs === 'eff' ? 'def' : 'eff'; renderAll(); };`],
		["<colgroup><col style=\"width:' + d.nw + 'px\"><col style=\"width:' + d.mw + 'px\"></colgroup><tbody>'", "<colgroup><col style=\"width:' + d.nw + 'px\">' + (showM ? '<col style=\"width:' + mw + 'px\">' : '') + (showE ? '<col style=\"width:' + ew + 'px\">' : '') + '</colgroup><tbody>'"],
		["K.esc(s.name) + '</th><th class=\"mx c' + lv + '\" style=\"' + fz(d.mw) + '\">' + n + '</th></tr>';", "K.esc(s.name) + '</th>' + (showM ? '<th class=\"mx c' + lv + '\" style=\"' + fz(mw) + '\">' + n + '</th>' : '') + (showE ? '<th class=\"ef\" style=\"' + fz(ew) + '\">' + (K.EFF[s.id] == null ? '—' : K.EFF[s.id].toFixed(S.lv === 2 ? 3 : 2)) + '</th>' : '') + '</tr>';"],
		// 親の小窓: UmaExam の表ではセットと脚質の欄を出さない（97・100）
		["const inn = $('#sheetIn');\n\t\tinn.querySelectorAll('[data-pick]')", "const inn = $('#sheetIn');\n\t\tif (isExam()) inn.querySelectorAll('.kv dt').forEach((dt) => { if (dt.textContent === 'セット' || dt.textContent === '脚質') { dt.nextElementSibling.remove(); dt.remove(); } });\n\t\tinn.querySelectorAll('[data-pick]')"],
		// スキルの小窓: 札の代わりに効率
		["const tags = [K.CAT[s.cat]].concat(s.dist.map((d) => K.DIST[d]), s.style.map((d) => K.STYLE[d]), s.surface.map((d) => K.SURF[d]));", "const tags = isExam() ? (K.EFF[s.id] == null ? [] : ['効率 ' + K.EFF[s.id].toFixed(3)]) : [K.CAT[s.cat]].concat(s.dist.map((d) => K.DIST[d]), s.style.map((d) => K.STYLE[d]), s.surface.map((d) => K.SURF[d]));"],
		// 遺伝子の文は UmaExam の表では出さない
		["'種を多く埋める順（同数なら★の合計、次に遺伝子の★）'", "'種を多く埋める順' + (isExam() ? '（同数なら★の合計）' : '（同数なら★の合計、次に遺伝子の★）')"],
		["'・★' + x.st + '・遺伝子★' + x.g + '</span>", "'・★' + x.st + (isExam() ? '' : '・遺伝子★' + x.g) + '</span>"],
		["'種の充足が多い順（同数なら遺伝子の★）</span></h2>'", "'種の充足が多い順' + (isExam() ? '' : '（同数なら遺伝子の★）') + '</span></h2>'"],
		["'/' + rows.length + '・遺伝子★' + x.g + '</span>", "'/' + rows.length + (isExam() ? '' : '・遺伝子★' + x.g) + '</span>"],
		["'<dl class=\"kv\"><dt>遺伝子</dt><dd>' + K.esc(gsum) + '（6人の合計）</dd><dt>赤因子</dt>", "'<dl class=\"kv\">' + (isExam() ? '' : '<dt>遺伝子</dt><dd>' + K.esc(gsum) + '（6人の合計）</dd>') + '<dt>赤因子</dt>"],
		// 充足は133種の分数（98）
		["const rows = visRowsRaw(), cov = covered(rows), miss = rows.filter((s) => !cov.includes(s)), G = grows();", "const rows = covRows(), cov = covered(rows), miss = rows.filter((s) => !cov.includes(s)), G = grows();"],
		["const rows = visRowsRaw(), cov = covered(rows), miss = rows.filter((s) => !cov.includes(s));", "const rows = covRows(), cov = covered(rows), miss = rows.filter((s) => !cov.includes(s));"],
		// 切り替え（104）: 見出しのセットのボタンの小窓の中（案A）か、見出しの帯の中（案B: ?sw=head）
		["function openSetPicker() {\n\t\tnav(() => {\n\t\t\topenSheet('<h2 id=\"sheetTitle\">レース/周回セット</h2>' + K.setListHtml(S.doc, curKey(), { counts: true }) +",
			`const PER_MODE = ['A', 'B', 'rs', 'cs', 'pf', 'sf', 'onlyMiss', 'six', 'pane'];
	const FRESH = () => ({ A: null, B: null, rs: 'def', cs: 'def', pf: { style: new Set(), owner: new Set() }, sf: { list: 'all', cat: new Set(), dist: new Set(), style: new Set(), q: '' }, onlyMiss: false, six: false, pane: null });
	const memo = {};
	/** UmaStar 用と UmaExam 用を切り替える。親の選択・絞り込み・並びは表ごとに覚える */
	function switchMode(m) {
		if (m === S.mode) return;
		const keep = {}; PER_MODE.forEach((k) => { keep[k] = S[k]; }); memo[S.mode] = keep;
		const o = memo[m] || FRESH(); PER_MODE.forEach((k) => { S[k] = o[k]; });
		S.mode = m; S.settings.mode = m; saveSettings(); $('#sf-q').value = S.sf.q; renderAll();
	}
	document.querySelectorAll('#modeSeg [data-mode]').forEach((b) => { b.onclick = () => switchMode(b.dataset.mode); });
	function modeRowHtml() { return Q.get('sw') === 'head' ? '' : '<div class="modeline"><span class="seg sm" role="group" aria-label="表"><button type="button" data-mode="star" aria-pressed="' + !isExam() + '">UmaStar</button><button type="button" data-mode="exam" aria-pressed="' + isExam() + '">UmaExam</button></span></div>'; }
	function examListHtml() { const n = S.doc.parents.filter((p) => (p.sets || []).includes('exam')).length; return '<div class="rlist" role="radiogroup" aria-label="セット"><label class="ropt on"><input type="radio" name="setpick" value="exam" checked><span class="rtx"><span class="l1">技能試験</span></span><span class="rn">親' + n + '人</span></label></div>'; }
	function openSetPicker() {
		nav(() => {
			openSheet('<h2 id="sheetTitle">' + (isExam() ? 'セット' : 'レース/周回セット') + '</h2>' + modeRowHtml() + (isExam() ? examListHtml() : K.setListHtml(S.doc, curKey(), { counts: true })) +`],
		["$('#sheetIn').querySelectorAll('input[name=\"setpick\"]').forEach((el) => { el.onchange = () => {\n\t\t\t\tconst key = el.value; closeSheet();",
			"$('#sheetIn').querySelectorAll('.modeline [data-mode]').forEach((b) => { b.onclick = () => { const m = b.dataset.mode; if (m === S.mode) return; switchMode(m); if (m === 'exam') closeSheet(); else { closeSheet(); openSetPicker(); } }; });\n\t\t\t$('#sheetIn').querySelectorAll('input[name=\"setpick\"]').forEach((el) => { el.onchange = () => {\n\t\t\t\tconst key = el.value; closeSheet();\n\t\t\t\tif (key === 'exam') return;"],
		["$('#geneToggle').onclick = () => {", "$('#colMax').onclick = () => { S.settings.colMax = !S.settings.colMax; if (!S.settings.colMax && S.rs === 'max') S.rs = 'def'; saveSettings(); renderAll(); };\n\t$('#colEff').onclick = () => { S.settings.colEff = !S.settings.colEff; if (!S.settings.colEff && S.rs === 'eff') S.rs = 'def'; saveSettings(); renderAll(); };\n\t$('#geneToggle').onclick = () => {"],
		['<a href="special.html" data-tool>', '<a href="../special.html" data-tool>'],
		['<a href="exam.html" data-tool>', '<a href="../exam.html" data-tool>'],
	], 'deck');
	out('deck.js', t);
}

/* ---------- 登録の画面 ---------- */
function register() {
	const t = patch(readText('js/deck-alpha-register.js'), [
		['/* js/deck-alpha-register.js — ', '/* T104 段1 のモック: 製品の js/deck-alpha-register.js の写し（make-mock.mjs が作る。手で直さない）。受け取りの口の代わりに仮の送りの中身（K.mockSend）を読む。\n * 段2 で受け取りの口に足す形: from: \'exam\'・send: 133種の id・persons[].sheet: { めろっぷの行で id の無い行の名前: ★ }・blue・red は読めた値（読めなければ [null, ★]）。\n * js/deck-alpha-register.js — '],
		["const INBOX = 'umaDeck:send';", "const INBOX = 'uma-lab-exam-deck:send';"],
		["try { loaded = await K.store.load(); }", "try { loaded = await K.store.load(); if (!loaded.parents.length && !loaded.meta.seeded) { await K.seedMock(); loaded = await K.store.load(); } }"],
		["S.ocr = readInbox();", "S.ocr = readInbox(); S.exam = !!S.ocr && S.ocr.from === 'exam';"],
		["S.setKey = S.ocr.race && live.some((r) => r.id === S.ocr.race) ? 'r:' + S.ocr.race : 'none';", "S.setKey = S.exam ? 'exam' : S.ocr.race && live.some((r) => r.id === S.ocr.race) ? 'r:' + S.ocr.race : 'none';"],
		["try { j = JSON.parse(localStorage.getItem(INBOX) || 'null'); } catch (e) { return null; }", "j = JSON.parse(JSON.stringify(K.mockSend(S.doc)));"],
		["skills: stars(o && o.skills), genes: stars(o && o.genes) });", "skills: stars(o && o.skills), genes: stars(o && o.genes), sheet: stars(o && o.sheet) });"],
		["return { race: j.race || null,", "return { from: j.from, race: j.race || null,"],
		["const p = { role: K.POS[i], uma: o.uma,", "const p = { role: K.POS[i], sheet: o.sheet, uma: o.uma,"],
		["if (i > 0) refreshCands(p);\n\t\treturn p;", "if (i > 0 || S.exam) refreshCands(p);\n\t\treturn p;"],
		["const umaChanged = (i, p) => { if (i > 0) refreshCands(p); };", "const umaChanged = (i, p) => { if (i > 0 || S.exam) refreshCands(p); };"],
		["if (i > 0 && on && p.cands.length) {", "if ((i > 0 || S.exam) && on && p.cands.length) {"],
		["const setNow = S.setKey === 'none' ? null :", "const setNow = S.exam ? K.findSet(S.doc, 'exam') : S.setKey === 'none' ? null :"],
		["$('#body').innerHTML = scope + S.persons.map(personCard).join('');", `// UmaExam から: セットは「技能試験」だけ（97・100）。スキルの一覧は133種で決まっているので行を出さず、脚質の札も出さない
		const examScope = '<section class="card"><div class="line"><span class="k">送る</span><span class="seg" role="group" id="scopeSeg"><button type="button" data-scope="one" aria-pressed="' + (S.scope === 'one') + '">親Aだけ</button><button type="button" data-scope="fam" aria-pressed="' + (S.scope === 'fam') + '"' + (noFam ? ' disabled class="strike"' : '') + '>親Aセット</button></span></div>' +
			'<div class="line"><span class="k">セット</span><span>技能試験<span class="muted small">（133種）</span></span></div>' +
			'<div class="line"><span class="k">持ち主</span><span class="seg" role="group"><button type="button" data-owner="self" aria-pressed="' + (S.owner === 'self') + '">自分</button><button type="button" data-owner="friend" aria-pressed="' + (S.owner === 'friend') + '">フレンド</button></span></div></section>';
		$('#body').innerHTML = (S.exam ? examScope : scope) + S.persons.map(personCard).join('');`],
		["$('#setPick').onclick = openSetPicker;", "if ($('#setPick')) $('#setPick').onclick = openSetPicker;"],
		["let set = null;\n\t\tif (S.setKey !== 'none') {", "let set = null;\n\t\tif (S.exam) { if (!doc.exam) doc.exam = K.newExamList(); K.addSend(doc.exam, S.ocr.send); set = doc.exam; }\n\t\telse if (S.setKey !== 'none') {"],
		["green: p.greenStar, skills: p.skills, genes: p.genes });", "green: p.greenStar, skills: p.skills, genes: p.genes, sheet: p.sheet });"],
		["const id = 'p' + doc.next; doc.next++;", `// UmaExam から: 親Aを登録済みの親と「同一」にしたときは、その親に足す（読み取りの値で上書き。親1人の記録を増やさない）
		if (S.exam && main.link) {
			const q = doc.parents.find((x) => x.id === main.link);
			q.skills = Object.assign({}, q.skills, main.skills); q.genes = Object.assign({}, q.genes, main.genes); q.sheet = main.sheet;
			if (main.blue && main.blue[0]) q.blue = main.blue; if (main.red && main.red[0]) q.red = main.red; if (main.greenStar != null) q.green = main.greenStar;
			if (!q.sets.includes('exam')) q.sets.push('exam'); if (!q.gp.length && gp.length) q.gp = gp;
			S.settings.mode = 'exam';
			try { await K.store.putParents([q]); await K.store.putHead(doc); await K.store.putMeta('settings', S.settings); } catch (e) { toast('保存できませんでした'); return; }
			S.done = { parent: q, no: q.no, date: q.date, gp: gp.length, set };
			render();
			return;
		}
		const id = 'p' + doc.next; doc.next++;`],
		["S.settings.cur = set ? set.id : 'none';", "if (S.exam) S.settings.mode = 'exam'; else S.settings.cur = set ? set.id : 'none';"],
		['<a class="btn pri" href="deck-alpha.html" style="flex:1">', '<a class="btn pri" href="?screen=deck&mode=exam" style="flex:1">'],
	], 'register');
	out('register.js', t);
}

/* ---------- UmaExam の照合結果（T100 のモックの exam の形を写し、案内の箱を「Deck (αテスト)に送る」と停止の1行に置き換える。224） ---------- */
function examResult() {
	const t = patch(readText('lab/result-heatmap-mock.html'), [
		['<title>照合結果のヒートマップ</title>', '<title>UmaExam 照合結果</title>'],
		[/T100 段1 のモック（作業用）。/, 'T104 段1 のモックの部品（lab/exam-deck-mock/make-mock.mjs が T100 のモック lab/result-heatmap-mock.html から作る。手で直さない）。T100 段1 のモック（作業用）。'],
		["if (!isExam) {\n\t\t\thtml += '<div id=\"deck-alpha-send-note\">", "if (true) {\n\t\t\thtml += '<div id=\"deck-alpha-send-note\">"],
		["<button type=\"button\" class=\"btn-deck\">' + SVG.send", "<button type=\"button\" class=\"btn-deck\" id=\"deck-alpha-send-btn\">' + SVG.send"],
		["if (isExam && s === 'ab') document.querySelector('.result-table').style.setProperty('--hm-col', '36px');", `if (isExam && s === 'ab') document.querySelector('.result-table').style.setProperty('--hm-col', '36px');
		// 親Aセット・親Bセットの両方が送れるときは小窓で選ぶ（UmaStar と同じ形。103）。1つなら登録の画面へ。親のページの ?screen=register を開く
		const go = () => { (window.parent !== window ? window.parent : window).location.href = '../exam-deck-mock.html?screen=register&theme=' + theme; };
		document.getElementById('deck-alpha-send-btn').onclick = () => {
			if (s !== 'ab') { go(); return; }
			const pop = document.createElement('div'); pop.className = 'send-pop';
			pop.innerHTML = '<div class="send-pop-in" role="dialog" aria-label="Deck (αテスト)に送る"><p class="send-pop-t">Deck (αテスト)に送る</p><button type="button" class="send-pop-b">親Aセット</button><button type="button" class="send-pop-b">親Bセット</button></div>';
			pop.onclick = (e) => { if (e.target === pop) pop.remove(); };
			pop.querySelectorAll('.send-pop-b').forEach((b) => { b.onclick = go; });
			document.body.appendChild(pop);
		};
		if (q.get('pop') === '1') document.getElementById('deck-alpha-send-btn').click();
		// 右下のボタン群とツール切り替えの項目（224）。?nav=1 で開いた形を見せる
		if (q.get('nav') === '1') {
			const nav = document.createElement('div'); nav.className = 'nav-mock';
			nav.innerHTML = '<div class="tool-menu"><p class="tool-h">ツール切り替え</p><a class="tool-i">UmaStar OCR<small>チャンミ/LoH用OCR（β版）</small></a><div class="tool-i cur">UmaExam OCR<span class="tool-sel">選択中</span><small>技能試験用OCR</small></div><a class="tool-i dk">Deck (αテスト)</a><a class="tool-i">お知らせ</a></div>' +
				'<div class="fab-mock"><span class="fab-i">結合画像の設定</span><span class="fab-i">照合結果</span><span class="fab-i">結合画像の表示</span><span class="fab-i dk">Deck (αテスト)</span></div>';
			document.body.appendChild(nav);
		}`],
		['</style>', `
/* T104: 「Deck (αテスト)に送る」は UmaStar と同じ部品（製品は .uma-btn--primary .deck-accent。地はそのページの --uma-control） */
:root[data-tool="exam"] { --deck-btn: var(--copy-btn); --deck-btn-text: #fff; }
/* T104: 送り先を選ぶ小窓・右下のボタン群・ツール切り替え（見本） */
.send-pop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: flex-end; justify-content: center; z-index: 100; }
.send-pop-in { background: var(--uma-surface); color: var(--uma-text); width: 100%; max-width: 420px; border-radius: 16px 16px 0 0; padding: 14px 16px 20px; display: flex; flex-direction: column; gap: 8px; }
.send-pop-t { margin: 0; font-size: 14px; font-weight: 700; }
.send-pop-b { min-height: 44px; border: 1px solid var(--uma-surface-muted); border-radius: 10px; background: transparent; color: var(--uma-text); font-size: 13px; font-weight: 600; }
.nav-mock { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 90; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; padding: 12px; font-size: 12px; }
.tool-menu { width: 288px; max-width: calc(100vw - 24px); background: var(--uma-surface); color: var(--uma-text); border-radius: 16px; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
.tool-h { margin: 0; padding: 8px 12px; font-size: 10px; font-weight: 700; opacity: .65; }
.tool-i { display: block; padding: 10px 12px; border-radius: 12px; font-weight: 700; position: relative; }
.tool-i small { display: block; font-weight: 400; font-size: 11px; opacity: .7; margin-top: 2px; }
.tool-i.cur { background: var(--deco-soft-50); color: var(--deco-text); }
.tool-sel { position: absolute; right: 10px; top: 10px; font-size: 10px; }
.fab-mock { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.fab-i { background: var(--uma-surface); color: var(--uma-text); border-radius: 999px; padding: 10px 16px; font-weight: 600; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
.fab-i.dk, .tool-i.dk { outline: 2px solid var(--deck-note-btn); outline-offset: -2px; }
</style>`],
	], 'exam-result');
	out('exam-result.html', t);
}

/* ---------- 旧 UmaSkill Deck のページの先頭（?screen=old）。見た目はページの <style> の写し＋ css/common.css（製品のページは読まない＝保存データに触れない） ---------- */
function oldPage() {
	const css = [...readText('uma-skill-deck.html').matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
	out('old-page.css', '/* uma-skill-deck.html の <style> の写し（make-mock.mjs が作る。手で直さない） */\n' + css);
}

snapshot(); core(); deck(); register(); examResult(); oldPage();
console.log('OK');
