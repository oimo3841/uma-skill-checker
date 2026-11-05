/* js/deck-alpha-data.js — 新しい Deck の α版（T88・C-275）が使う公開データを読み、window.DECK_ALPHA_DATA に置いてから、ページの JS を順に読む。
 * モック版13 は lab/deck-v13/make-snapshot.mjs で作った写し（data-snapshot.js）を読んでいた。α版は同じ形をページを開くたびに公開データから作る
 * （データを受け入れたときに写しを作り直す手間を無くすため）。読む項目は make-snapshot.mjs と同じ。T94（2026-11-04）から拡張スキルの名前と札も skills に入れる。
 * 使い方: <script src="js/deck-alpha-data.js?v=…" data-next="js/deck-alpha-core.js?v=… js/deck-alpha.js?v=…"></script>
 * 公開先の Cache-Control（max-age=600）で古い JSON が残らないように、fetch は cache: 'no-cache'（毎回 ETag で確かめる）で読む。
 */
(function () {
	'use strict';
	const DECK_ALPHA_DATA_VERSION = '2026-11-05a';
	const me = document.currentScript;
	const next = ((me && me.dataset.next) || '').split(/\s+/).filter(Boolean);
	const get = (p) => fetch(p, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });

	function build(j) {
		const [master, ext, sf, genes, uma, nonSupport, rec, races, abbrev, eff] = j;
		const extName = new Map();
		for (const e of ext.entries || ext.skills || []) extName.set(e.id, e.name);
		const skills = master.skills.map((s) => ({
			id: s.id, name: s.name,
			dist: s.tags.distance || [], style: s.tags.style || [], surface: s.tags.surface || [], scenario: s.tags.scenario || [], phase: s.tags.phase || [],
			passive: (s.tags.passive || []).length > 0,
		}));
		// 拡張スキル（data/extended-skills.json の ex- の id）もマスターと同じ形で足す（並びはマスターのあと）。
		// UmaStar から送られる親のスキルと②の一覧には ex- の id が入るので、Deck でも名前と札を引けるようにする（T94・追加3。それまでは id のまま出ていた）
		for (const e of ext.entries || ext.skills || []) {
			const t = e.tags || {};
			skills.push({ id: e.id, name: e.name, dist: t.distance || [], style: t.style || [], surface: t.surface || [], scenario: t.scenario || [], phase: t.phase || [], passive: (t.passive || []).length > 0 });
		}
		const costumes = uma.entries.map((u) => {
			const uniq = [];
			for (const row of u.initialSkills || []) for (const sk of row.skills || []) {
				const n = sk.name || extName.get(sk.skillId) || '';
				if (n && !uniq.includes(n)) uniq.push(n);
			}
			return { id: u.id, title: u.title, chara: u.charaName, star: u.initialStar, uniq };
		});
		return {
			versions: { master: master.masterVersion, extended: ext.dataVersion, training: uma.dataVersion, genes: genes.dataVersion, scenarioFactors: sf.dataVersion, nonSupport: nonSupport.dataVersion, recommended: rec.dataVersion, races: races.dataVersion, abbrev: abbrev.dataVersion },
			skills,
			scenarioFactors: sf.entries.map((e) => ({ id: e.id, name: e.name })),
			genes: genes.entries.map((e) => ({ id: e.id, name: e.name })),
			costumes,
			nonSupportIds: nonSupport.entries.map((e) => e.skillId),
			scenarioSkillIds: rec.skills.filter((s) => s.section === 'scenario').map((s) => s.skillId),
			// UmaStar の「レース」の欄の一覧（並びはファイルのまま。selectable: false の行は UmaStar の欄に出ない＝Deck では終了とみなす）
			races: races.races.map((r) => ({ id: r.id, name: r.name, date: r.date, dateLabel: r.dateLabel, venue: r.venue, surface: r.surface, distance: r.distance, distanceCategory: r.distanceCategory, selectable: r.selectable !== false })),
			// 縮小の列の名前（衣装ごとの略称。C-275 の 7・8）
			abbrev: (abbrev.entries || []).map((e) => ({ id: e.id, abbr: e.abbr })),
			// 技能試験の効率（UmaExam 用の表の効率の列。T104・225。名前だけの行は使わない）
			efficiency: Object.fromEntries((eff.entries || []).filter((e) => e.skillId && typeof e.efficiency === 'number').map((e) => [String(e.skillId), e.efficiency])),
		};
	}
	function loadScript(src) {
		return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.body.appendChild(s); });
	}
	function fail(e) {
		const box = document.getElementById('stage') || document.getElementById('body') || document.body;
		box.innerHTML = '<div class="empty"><span>データを読み込めませんでした。通信できるところで開き直してください。</span></div>';
		console.warn('Deck α: データの読み込みに失敗', e);
	}
	Promise.all([
		'uma-skill-deck-skills.json', 'data/extended-skills.json', 'data/scenario-inheritance-factors.json', 'data/aptitude-genes.json',
		'data/training-umamusume.json', 'data/non-support-skills.json', 'data/recommended-skills.json', 'data/upcoming-races.json', 'data/deck-alpha/uma-abbrev.json', 'data/skill-efficiency.json',
	].map(get)).then((j) => {
		window.DECK_ALPHA_DATA = build(j);
		window.DECK_ALPHA_DATA.loaderVersion = DECK_ALPHA_DATA_VERSION;
		return next.reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve());
	}).catch(fail);
})();
