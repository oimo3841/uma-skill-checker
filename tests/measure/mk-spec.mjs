// T216（B4）: 測りの組の一覧（spec）を作る。T212 の mkt212.py の置き換え（tests/measure/jobs-base.json を読む）。
//   node tests/measure/mk-spec.mjs <label> <theme> [--names=P-star-1,P-exam-1 | --names-file=<ファイル>] [--widths=390,1280] [--shots] [--rec] [--parts]
//   → output/scratch/measure/spec-<label>-<theme>.json（outDir は output/scratch/measure/m/<label>-<theme>）
// 組：UmaStar・UmaExam 124組（jobs-base.json）＋ card-event-input 4組＋旧 Deck 1組。--rec で録画 8本（ライトだけ。素材が無ければ飛ばす）。
// 幅は 320・360・390・430・1280px（--widths で絞れる）。--names を付けると、その名前の組だけ。--parts で「部品の地図」（クラス・id）も集める。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const [label, theme] = argv;
if (!label || !/^(light|dark)$/.test(theme || '')) { console.log('使い方: node tests/measure/mk-spec.mjs <label> <light|dark> [--names=…|--names-file=…] [--widths=…] [--shots] [--rec] [--parts]'); process.exit(2); }
const opt = (k) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const flag = (k) => argv.includes('--' + k);
const W = (opt('widths') || '320,360,390,430,1280').split(',').map(Number);
const SHOTW = [360, 390, 1280];
let names = opt('names') ? opt('names').split(',') : null;
if (opt('names-file')) names = fs.readFileSync(opt('names-file'), 'utf8').split(/\s+/).filter(Boolean);

const base = JSON.parse(fs.readFileSync(path.join(HERE, 'jobs-base.json'), 'utf8')).jobs;
const jobs = {};
for (const j of base) {
	const k = JSON.parse(JSON.stringify(j));
	k.theme = theme; k.widths = W;
	if (flag('shots')) k.shotW = SHOTW;
	jobs[k.name] = k;
}
const plain = (name, url, steps) => { jobs[name] = { name, url, w: 390, h: 844, theme, steps: steps || [], widths: W, measureFile: 'collect.js' }; if (flag('shots')) jobs[name].shotW = SHOTW; };
plain('P-cei-top', '/card-event-input.html', [{ wait: 1500 }]);
plain('P-cei-open', '/card-event-input.html', [{ wait: 1500 }, { click: '#cei-only-pending', wait: 500 }, { click: 'button:has-text("直す") >> visible=true >> nth=0', wait: 800 }]);
plain('P-cei-chara', '/card-event-input.html', [{ wait: 1500 }, { click: '[data-tab="chara"]', wait: 600 }, { click: '#cei-only-pending', wait: 500 }, { click: 'button:has-text("直す") >> visible=true >> nth=0', wait: 800 }]);
plain('P-cei-out', '/card-event-input.html', [{ wait: 1500 }, { eval: "document.getElementById('cei-out').scrollIntoView()", wait: 400 }]);
plain('P-olddeck', '/uma-skill-deck.html', [{ wait: 1500 }]);

if (flag('rec') && theme === 'light') {
	// 録画（ライトだけ）。素材（.skillset-assets.json の root 以下）が無ければ飛ばす。
	let assets = null;
	try { const a = JSON.parse(fs.readFileSync(path.join(ROOT, '.skillset-assets.json'), 'utf8')); assets = a.root || a.assetsRoot || Object.values(a)[0]; } catch (e) {}
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const R1 = { umaId: 'uma-0001', cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'], skillFilter: { style: 'senko' }, outsideOptions: { cards: ['card-0257', 'card-0402'] } };
	const SCOPE = { skillIds: Array.from({ length: 40 }, (_, i) => String(i + 1)), name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 };
	const SLS = { 'umaSkillDeck:userData': EMPTY, 'umaSkillDeck:stepTab': '2', 'umaSkillDeck:draftRoster:special': R1, 'umaSkillDeck:draftScope:special': SCOPE };
	const VM = { eval: "(() => { if (document.body.getAttribute('data-upload-mode') !== 'video') document.querySelector('[data-upload-mode-btn=\"video\"]').click(); })()", wait: 600 };
	const WAIT_A = '#personset-A-wrap .video-result, #video-error, #personset-A-wrap .cap-fail';
	const V = [['rec-exam', '/exam.html', {}, [{ click: '#step-tab-2', wait: 500 }], 'ScreenRecording_10-25-2026 17-11-41_1_Exam.MP4'],
		['rec-star-landscape-full', '/special.html', SLS, [], 'dmm-landscape-195520-full.mp4'],
		['rec-star-landscape-small', '/special.html', SLS, [], 'dmm-landscape-200434-window-small.mp4'],
		['rec-star-fast', '/special.html', SLS, [], 'fast-scroll-A-1.MP4'],
		['rec-star-short', '/special.html', SLS, [], 'ScreenRecording_11-08-2026 13-19-49_1.MP4'],
		['rec-exam-landscape', '/exam.html', {}, [{ click: '#step-tab-2', wait: 500 }], 'dmm-landscape-200318-window.mp4']];
	for (const [key, url, ls, pre, file] of V) {
		const p = assets ? path.join(assets, file) : null;
		if (!p || !fs.existsSync(p)) { console.log('素材が無い（飛ばす）:', file); continue; }
		jobs['P-' + key] = { name: 'P-' + key, url, w: 390, h: 844, theme, ls, steps: pre.concat([VM, { chooser: '#personset-A-wrap .video-pick-btn', paths: [p], waitSel: WAIT_A, waitMs: 500000, wait: 2000 }]), widths: W, measureFile: 'collect.js' };
	}
	const TAB = { click: '.skillres-tab', wait: 600 };
	const DONE = "(() => { const p = UmaSkillResult.peek(); return !p.vbusy && ((p.built && p.url) || document.querySelector('.sr-video-error, .sr-cap-fail')); })()";
	for (const [kind, f] of [['portrait', 'test-images/skill-video/ScreenRecording_11-17-2026 23-45-24_1.MP4'], ['landscape', 'test-images/skill-video/レコーディング 2026-11-17 235213.mp4']]) {
		const p = path.join(ROOT, f);
		if (!fs.existsSync(p)) { console.log('素材が無い（飛ばす）:', f); continue; }
		jobs['P-rec-skillres-' + kind] = { name: 'P-rec-skillres-' + kind, url: '/special.html', w: 390, h: 844, theme, ls: SLS, steps: [TAB, VM, { chooser: '[data-sr-act="video"]', paths: [p], waitFn: DONE, waitMs: 500000, wait: 1500 }], widths: W, measureFile: 'collect.js' };
	}
}
let list = Object.values(jobs);
if (names) {
	const miss = names.filter((n) => !jobs[n]);
	if (miss.length) console.log('一覧に無い名前（飛ばす）:', miss.join(','));
	list = names.filter((n) => jobs[n]).map((n) => jobs[n]);
}
const outRoot = path.join(ROOT, 'output', 'scratch', 'measure');
fs.mkdirSync(outRoot, { recursive: true });
const spec = { outDir: path.join('output', 'scratch', 'measure', 'm', label + '-' + theme).replace(/\\/g, '/'), parts: flag('parts'), jobs: list };
const specPath = path.join(outRoot, 'spec-' + label + '-' + theme + '.json');
fs.writeFileSync(specPath, JSON.stringify(spec));
console.log(label, theme, list.length + '組・幅 ' + W.join(',') + (flag('shots') ? '・画像あり' : '・画像なし') + (spec.parts ? '・部品の地図あり' : ''), '→', path.relative(ROOT, specPath).replace(/\\/g, '/'));
