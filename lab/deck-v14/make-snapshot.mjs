// 方眼紙デザインのモック版14（lab/deck-v14）が使う公開データの写しを作る（版13 の make-snapshot.mjs に、製品の js/deck-alpha-data.js と同じ略称〔abbrev〕を足した）。
// 使い方: node lab/deck-v14/make-snapshot.mjs  → lab/deck-v14/data-snapshot.js を書き直す
// 読むのは data/ とマスターの公開データだけ。モックは通信しないので、ページに読み込める JS の形で置く。中身の形は製品の window.DECK_ALPHA_DATA と同じ。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const master = read('uma-skill-deck-skills.json');
const ext = read('data/extended-skills.json');
const sf = read('data/scenario-inheritance-factors.json');
const genes = read('data/aptitude-genes.json');
const uma = read('data/training-umamusume.json');
const nonSupport = read('data/non-support-skills.json');
const rec = read('data/recommended-skills.json');
const races = read('data/upcoming-races.json');
const abbrev = read('data/deck-alpha/uma-abbrev.json');

const extName = new Map();
for (const e of ext.entries || ext.skills || []) extName.set(e.id, e.name);

const skills = master.skills.map((s) => ({
	id: s.id, name: s.name,
	dist: s.tags.distance || [], style: s.tags.style || [], surface: s.tags.surface || [], scenario: s.tags.scenario || [], phase: s.tags.phase || [],
	passive: (s.tags.passive || []).length > 0,
}));
const costumes = uma.entries.map((u) => {
	const uniq = [];
	for (const row of u.initialSkills || []) for (const sk of row.skills || []) {
		const n = sk.name || extName.get(sk.skillId) || '';
		if (n && !uniq.includes(n)) uniq.push(n);
	}
	return { id: u.id, title: u.title, chara: u.charaName, star: u.initialStar, uniq };
});
const out = {
	made: new Date().toISOString().slice(0, 10),
	versions: { master: master.masterVersion, extended: ext.dataVersion, training: uma.dataVersion, genes: genes.dataVersion, scenarioFactors: sf.dataVersion, nonSupport: nonSupport.dataVersion, recommended: rec.dataVersion, races: races.dataVersion, abbrev: abbrev.dataVersion },
	skills,
	scenarioFactors: sf.entries.map((e) => ({ id: e.id, name: e.name })),
	genes: genes.entries.map((e) => ({ id: e.id, name: e.name })),
	costumes,
	nonSupportIds: nonSupport.entries.map((e) => e.skillId),
	scenarioSkillIds: rec.skills.filter((s) => s.section === 'scenario').map((s) => s.skillId),
	races: races.races.map((r) => ({ id: r.id, name: r.name, date: r.date, dateLabel: r.dateLabel, venue: r.venue, surface: r.surface, distance: r.distance, distanceCategory: r.distanceCategory, selectable: r.selectable !== false })),
	abbrev: (abbrev.entries || []).map((e) => ({ id: e.id, abbr: e.abbr })),
};
const js = '// 公開データの写し（lab/deck-v14/make-snapshot.mjs が作る。手で直さない）。作成日 ' + out.made + '\n' +
	'window.DECK_V14_DATA = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(here, 'data-snapshot.js'), js, 'utf8');
console.log('skills', skills.length, 'costumes', costumes.length, 'races', out.races.length, 'abbrev', out.abbrev.length, 'bytes', js.length);
