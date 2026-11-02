// 新しい Deck のモック（lab/deck-v11）が使う公開データの写しを作る。
// 使い方: node lab/deck-v11/make-snapshot.mjs  → lab/deck-v11/data-snapshot.js を書き直す
// 読むのは data/ とマスターの公開データだけ。モックは通信しないので、ページに読み込める JS の形で置く。
// 中身: スキル（マスター 445 種の id・名前・距離/脚質/シナリオの札）、拡張スキルの名前（固有の名前を引くため）、
//       シナリオ因子（sf-）、遺伝子（ap-）、育成ウマ娘の衣装（id・二つ名・キャラ名・固有スキル名）、サポカ外スキルの id、
//       ②のオススメ（シナリオスキル）の id。親の中身（仮のデータ）はページの中で作る。
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

const extName = new Map();
for (const e of ext.entries || ext.skills || []) extName.set(e.id, e.name);

const skills = master.skills.map((s) => ({
	id: s.id,
	name: s.name,
	dist: s.tags.distance || [],
	style: s.tags.style || [],
	surface: s.tags.surface || [],
	scenario: s.tags.scenario || [],
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
	versions: { master: master.masterVersion, extended: ext.dataVersion, training: uma.dataVersion, genes: genes.dataVersion, scenarioFactors: sf.dataVersion, nonSupport: nonSupport.dataVersion, recommended: rec.dataVersion, races: races.dataVersion },
	skills,
	scenarioFactors: sf.entries.map((e) => ({ id: e.id, name: e.name })),
	genes: genes.entries.map((e) => ({ id: e.id, name: e.name })),
	costumes,
	nonSupportIds: nonSupport.entries.map((e) => e.skillId),
	scenarioSkillIds: rec.skills.filter((s) => s.section === 'scenario').map((s) => s.skillId),
	// UmaStar の「レース」の欄の一覧（並びはファイルのまま。selectable: false の行は UmaStar の欄に出ない＝Deck では終了とみなす）
	races: races.races.map((r) => ({ id: r.id, name: r.name, date: r.date, dateLabel: r.dateLabel, venue: r.venue, surface: r.surface, distance: r.distance, distanceCategory: r.distanceCategory, selectable: r.selectable !== false })),
};
const js = '// 公開データの写し（lab/deck-v11/make-snapshot.mjs が作る。手で直さない）。作成日 ' + out.made + '\n' +
	'window.DECK_V11_DATA = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(here, 'data-snapshot.js'), js, 'utf8');

// 要約
const withDist = skills.filter((s) => s.dist.length).length, withStyle = skills.filter((s) => s.style.length).length, withScen = skills.filter((s) => s.scenario.length).length;
console.log('skills', skills.length, 'dist', withDist, 'style', withStyle, 'scenario-tag', withScen, 'passive', skills.filter((s) => s.passive).length);
console.log('costumes', costumes.length, 'uniq names', new Set(costumes.flatMap((c) => c.uniq)).size, 'no-uniq', costumes.filter((c) => !c.uniq.length).length);
console.log('sf', out.scenarioFactors.length, 'genes', out.genes.length, 'nonSupport', out.nonSupportIds.length, 'scenarioSkills', out.scenarioSkillIds.length);
console.log('dist values', [...new Set(skills.flatMap((s) => s.dist))], 'style values', [...new Set(skills.flatMap((s) => s.style))], 'surface', [...new Set(skills.flatMap((s) => s.surface))], 'scenario', [...new Set(skills.flatMap((s) => s.scenario))]);
console.log('bytes', js.length);
