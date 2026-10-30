// ②因子周回 段5 画像結合の枠（C-227・2026-10-29）の検査。run-smoke.mjs の末尾から register62() で呼ばれる
// （塊の見出しはすべて「結合画像の枠」で始まる。`npm run test:visual -- --only=結合画像の枠` で回せる）。
//
// 決め（おいもさん・Step 0 の D1〜D15 は推奨どおり。色と塗りは試し描き v2 のとおり）:
//  ・結合画像のスキルパネルには記号を一切置かない。段4 の判定の3種の色の枠で、パネルの外側を囲む。
//  ・枠（D13・案A）: 線の中心をパネルの縁に・太さ 0.05 step・下の辺は★の横の範囲（colX＋0.20〜0.50 pitch）で切る。
//    位置の比は行の間隔（step）基準（上端 cy−0.295 step・下端 cy+0.42 step・左端 colX−0.67 step・右端は次の列の左端 −0.67−0.10 step）。
//  ・枠の色: 周回サポカ #008070／サポカ外 #9C6A00／その他 #7A3FB0。塗り（薄め・乗算）: #E2F6F0／#FFF6CD／#F0E6FA。
//    塗りはパネルの内側の白・灰色の地だけ（文字・丸のアイコン・★の黄は元の色）。パネルの外の隙間は塗らない。
//  ・凡例（D9）: 見出し「枠の見かた：」・3行をいつも全部・断りの1行。「遺伝子」の語を使わない。枠0 なら帯なし。
//  ・D7: 結合画像の ◎○▲・◆◇ は描かない。
// 合成の画像（灰色のパネル・茶の文字・黄の★・青紫の丸）で、位置と色を画素で確かめる。スキル名は検査の側に書かない（恒久ルール1）。

import { reloadReady } from './lib/page-ready.mjs';
export async function register62(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const STAR = new Set(readJson('data/non-support-skills.json').entries.map((e) => e.skillId));
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const ONE12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
	const STAR3 = [...STAR].slice(0, 3);
	const GIDS = ONE12.concat(['32', '45']).concat(STAR3.filter((id) => ONE12.indexOf(id) === -1));
	const WANT = {
		card: { frame: '#008070', tint: '#E2F6F0', label: '周回サポカスキル' },
		star: { frame: '#9C6A00', tint: '#FFF6CD', label: 'サポカ外スキル' },
		other: { frame: '#7A3FB0', tint: '#F0E6FA', label: 'その他（親から継承）' }
	};

	/** special.html を、①（下書きの編成）と②の下書きを入れて開く（blocks-61 と同じ作り） */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, o.userData || EMPTY);
		await sp.page.evaluate(({ roster, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster || null, scope: o.ids ? { skillIds: o.ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 } : null });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); try { await UmaSkillDeckCore.loadSkillEvolutions(); } catch (e) {} });
		if (o.ids && o.ids.length) await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};

	/**
	 * 合成の1人分（ページの中で実行）: 列 2 本（colX 200／500・pitch 300）・行の間隔 step 80・行 4 段×2列。
	 * 地は白 242、パネルは灰 226（縁は Step 0 の比の位置）、名前の位置に茶の文字、★の位置に黄、左に青紫の丸。
	 * kindsByRow … 行（"列:段"）→ 種類（無ければ②に無いスキル）。factorRows … 因子・遺伝子の行。
	 * 戻り値: 描いた数・枠の位置の画素など。
	 */
	const SYNTH = ({ kindsByRow, factorRows, stepBase }) => {
		const S = stepBase || 80, P = 300, XS = [200, 500], W = 820, H = 120 + S * 4;
		const c = document.createElement('canvas'); c.width = W; c.height = H;
		const g = c.getContext('2d');
		g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, H);
		const rows = [], lines = [], kindByName = {};
		const cys = [0, 1, 2, 3].map((i) => 60 + i * S);
		cys.forEach((cy, ri) => [0, 1].forEach((col) => {
			const x = XS[col];
			g.fillStyle = 'rgb(226,226,226)';
			g.fillRect(x - 0.67 * S, cy - 0.295 * S, P - 0.10 * S, 0.715 * S);
			g.fillStyle = 'rgb(122,65,24)'; g.fillRect(x + 10, cy - 8, 90, 16);                    // 名前の文字
			g.fillStyle = 'rgb(255,208,63)'; g.fillRect(x + 0.27 * P, cy + 0.30 * S, 0.18 * P, 0.20 * S);   // ★（パネルの下の縁をまたぐ）
			g.fillStyle = 'rgb(150,150,230)'; g.fillRect(x - 0.45 * S, cy - 0.15 * S, 0.30 * S, 0.30 * S);  // 丸のアイコン
			const key = col + ':' + ri;
			rows.push({ y: cy - 12, h: 24, col });
			const name = 'R' + key;
			lines.push({ text: name, rowKey: '0:' + (rows.length - 1) });
			if (kindsByRow[key]) kindByName[name] = kindsByRow[key];
		}));
		const names = lines.map((l) => l.text).filter((n) => kindByName[n] || (factorRows || []).indexOf(n.slice(1)) !== -1);
		const prev = { g: personGeometry[0], l: personLines[0], r: personResults[0], t: tierMarksEnabled, k: window.deckMarkerKindByName };
		personGeometry[0] = [{ scale: 1, columnXs: XS, rows }];
		personLines[0] = lines;
		personResults[0] = { detectedSkills: new Set(names), skillSources: Object.fromEntries(lines.map((l, i) => [l.text, [i]])), skillStars: {}, matchReasons: {} };
		tierMarksEnabled = true;
		window.deckMarkerKindByName = () => kindByName;
		const before = g.getImageData(0, 0, W, H).data.slice();
		c._sourcePlacements = [];
		const count = drawFactorFramesOnPerson(c, 0);
		personGeometry[0] = prev.g; personLines[0] = prev.l; personResults[0] = prev.r; tierMarksEnabled = prev.t; window.deckMarkerKindByName = prev.k;
		const d = g.getImageData(0, 0, W, H).data;
		const px = (x, y) => { const k = (Math.round(y) * W + Math.round(x)) * 4; return [d[k], d[k + 1], d[k + 2]]; };
		const hex = (a) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
		// 枠の色の画素が、ある行の横の並びで何画素続くか（左の辺の太さ）
		const runAt = (y, x0, x1, color) => { let n = 0; for (let x = x0; x <= x1; x++) if (hex(px(x, y)) === color) n++; return n; };
		const changed = (x, y) => { const k = (Math.round(y) * W + Math.round(x)) * 4; return d[k] !== before[k] || d[k + 1] !== before[k + 1] || d[k + 2] !== before[k + 2]; };
		const per = {};
		Object.keys(kindsByRow).forEach((key) => {
			const [col, ri] = key.split(':').map(Number);
			const x = XS[col], cy = cys[ri];
			const L = x - 0.67 * S, R = x + P - 0.77 * S, T = cy - 0.295 * S, B = cy + 0.42 * S;
			const st = factorFrameStyleOf(kindsByRow[key]);
			per[key] = {
				kind: kindsByRow[key], frame: st.frame, tint: st.tint,
				left: hex(px(L, cy)), right: hex(px(R, cy)), top: hex(px((L + R) / 2, T)),
				bottomLeft: hex(px(L + 0.10 * S, B)), bottomRight: hex(px(R - 0.10 * S, B)),
				bottomInStar: hex(px(x + 0.35 * P, B)), bottomStarFrom: hex(px(x + 0.20 * P - 2, B)), bottomStarTo: hex(px(x + 0.50 * P + 2, B)),
				leftRun: runAt(Math.round(cy), Math.round(L - 10), Math.round(L + 10), st.frame.toUpperCase()),
				panel: px(x + 150, cy - 0.2 * S), text: px(x + 50, cy), star: px(x + 0.36 * P, cy + 0.36 * S), circle: px(x - 0.30 * S, cy),
				gapBelow: px(x + 100, cy + 0.5 * (0.42 + 0.627) * S), gapRight: px(x + P - 0.72 * S, cy),
				outsideChanged: changed(x + 100, cy + 0.5 * (0.42 + 0.627) * S) || changed(x + P - 0.72 * S, cy)
			};
		});
		// 枠も塗りも無いはずの行（②に無い・因子）の内側と縁
		const bare = [];
		cys.forEach((cy, ri) => [0, 1].forEach((col) => {
			const key = col + ':' + ri;
			if (kindsByRow[key]) return;
			const x = XS[col];
			bare.push({ key, panel: changed(x + 150, cy - 0.2 * S), edge: changed(x - 0.67 * S, cy), top: changed(x + 100, cy - 0.295 * S) });
		}));
		return { count, per, bare, line: Math.max(2, Math.round(S * 0.05)) };
	};
	const mulHex = (base, hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((t) => Math.round(base * t / 255)); };

	await block('結合画像の枠(1) 位置・太さ・下の辺の切れ目: 線の中心がパネルの縁（上 cy−0.295 step・下 cy+0.42 step・左 colX−0.67 step・右 次の列 −0.77 step）・太さ 0.05 step・下の辺は★の横の範囲（colX＋0.20〜0.50 pitch）だけ切れる・枠どうしの間の隙間は変えない', async () => {
		const { ctx, page, errors } = await openSp();
		const ALL = { '0:0': 'card', '1:0': 'star', '0:1': 'other', '1:1': 'card', '0:2': 'star', '1:2': 'other', '0:3': 'card', '1:3': 'star' };
		for (const S of [80, 62]) {
			const r = await page.evaluate(SYNTH, { kindsByRow: ALL, stepBase: S });
			assert(r.count === 8, '結合画像の枠(1): 8つのパネルに枠を置いた（step ' + S + '）', r.count);
			Object.entries(r.per).forEach(([key, p]) => {
				const f = p.frame.toUpperCase();
				assert(p.left === f && p.right === f && p.top === f && p.bottomLeft === f && p.bottomRight === f,
					'結合画像の枠(1): ' + key + '（' + p.kind + '・step ' + S + '）の左・右・上・下の辺の線がパネルの縁の上にある', p);
				assert(p.bottomInStar !== f && p.bottomStarFrom === f && p.bottomStarTo === f,
					'結合画像の枠(1): ' + key + '（step ' + S + '）の下の辺は★の横の範囲だけ切れている（★を隠さない）', p);
				assert(p.leftRun === r.line, '結合画像の枠(1): ' + key + '（step ' + S + '）の線の太さ ＝ 0.05 step（' + r.line + 'px）', { run: p.leftRun, want: r.line });
				assert(!p.outsideChanged && p.gapBelow.join() === '242,242,242' && p.gapRight.join() === '242,242,242',
					'結合画像の枠(1): ' + key + '（step ' + S + '）の下・右の隙間（パネルの外）は塗らず、枠も入らない（枠どうしが重ならない）', p);
			});
		}
		assert(jsErrors(errors).length === 0, '結合画像の枠(1): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の枠(2) 色と塗り: 枠の色（#008070／#9C6A00／#7A3FB0）・パネルの灰に塗り（#E2F6F0／#FFF6CD／#F0E6FA の乗算）・文字・★・丸のアイコンは元の色・②に無い行と因子の行は枠も塗りも無い（◎○▲・◆◇ を描かない）', async () => {
		const { ctx, page, errors } = await openSp();
		const core = await page.evaluate(() => UmaSkillDeckCore.markers.list.map((m) => ({ id: m.id, label: m.label, fill: m.light.fill, tint: m.imageTint })));
		core.forEach((m) => {
			assert(WANT[m.id] && m.fill.toUpperCase() === WANT[m.id].frame && m.tint.toUpperCase() === WANT[m.id].tint && m.label === WANT[m.id].label,
				'結合画像の枠(2): core の ' + m.id + ' の枠の色・塗り・呼び名が決定のとおり', m);
		});
		const r = await page.evaluate(SYNTH, { kindsByRow: { '0:0': 'card', '1:1': 'star', '0:2': 'other' }, factorRows: ['1:0', '1:3'] });
		assert(r.count === 3, '結合画像の枠(2): 枠は②のスキルの行（3つ）だけ・因子の行（2つ）には置かない', r.count);
		Object.entries(r.per).forEach(([key, p]) => {
			const want = mulHex(226, WANT[p.kind].tint);
			assert(p.panel.every((v, i) => Math.abs(v - want[i]) <= 1), '結合画像の枠(2): ' + key + '（' + p.kind + '）のパネルの灰に塗りが掛かる（226 × ' + WANT[p.kind].tint + '）', { got: p.panel, want });
			assert(p.text.join() === '122,65,24' && p.star.join() === '255,208,63' && p.circle.join() === '150,150,230',
				'結合画像の枠(2): ' + key + ' の文字（茶）・★（黄）・丸のアイコン（青紫）は元の色のまま', p);
		});
		assert(r.bare.length === 5 && r.bare.every((b) => !b.panel && !b.edge && !b.top),
			'結合画像の枠(2): ②に無い行・因子の行は、パネルの内側も縁も1画素も変わらない（印も描かない）', r.bare);
		assert(jsErrors(errors).length === 0, '結合画像の枠(2): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の枠(3) 判定: 枠の種類は段4 の画面のマーカー（getMarkerKinds・②のパネルの data-marker）と一致し、3種とも出る／枠の色はその種類の色', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: GIDS });
		const r = await page.evaluate(() => {
			const api = deckTemplateManager.getMarkerKinds();
			const dom = {};
			document.querySelectorAll('#deck-template-panel [data-usd-el="selected-list"] .usd-panel[data-skill-id]').forEach((p) => {
				const m = p.querySelector('[data-usd-el="factor-marker"]');
				if (m) dom[p.dataset.skillId] = m.dataset.marker;
			});
			const byName = deckMarkerKindByName();
			const entries = UmaSkillDeckCore.getSkillEntries(deckScope.skillIds);
			const nameKinds = {};
			entries.forEach((e) => { nameKinds[e.id] = byName[e.name] || null; });
			// 実際の名前で枠を描き、置いた枠の色を読む（行は 1 本ずつの合成。列 2 本）
			const geo = [{ scale: 1, columnXs: [200, 500], rows: entries.map((e, i) => ({ y: 48 + Math.floor(i / 2) * 80, h: 24, col: i % 2 })) }];
			const lines = entries.map((e, i) => ({ text: e.name, rowKey: '0:' + i }));
			const prev = { g: personGeometry[0], l: personLines[0], r: personResults[0] };
			personGeometry[0] = geo; personLines[0] = lines;
			personResults[0] = { detectedSkills: new Set(entries.map((e) => e.name)), skillSources: Object.fromEntries(lines.map((l, i) => [l.text, [i]])), skillStars: {}, matchReasons: {} };
			const c = document.createElement('canvas'); c.width = 820; c.height = 100 + Math.ceil(entries.length / 2) * 80;
			const g = c.getContext('2d'); g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, c.width, c.height);
			c._sourcePlacements = [];
			const count = drawFactorFramesOnPerson(c, 0);
			personGeometry[0] = prev.g; personLines[0] = prev.l; personResults[0] = prev.r;
			const d = g.getImageData(0, 0, c.width, c.height).data;
			const hex = (x, y) => { const k = (y * c.width + x) * 4; return '#' + [d[k], d[k + 1], d[k + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); };
			const drawn = {};
			entries.forEach((e, i) => { const x = Math.round([200, 500][i % 2] - 0.67 * 80), y = 60 + Math.floor(i / 2) * 80; drawn[e.id] = hex(x, y); });
			return { api, dom, nameKinds, count, drawn, n: entries.length };
		});
		const ids = Object.keys(r.api);
		assert(ids.length === r.n && r.n === GIDS.length, '結合画像の枠(3): 前提: ②のスキルすべてに種類がある', { api: ids.length, n: r.n });
		const mism = ids.filter((id) => r.dom[id] !== r.api[id] || r.nameKinds[id] !== r.api[id]);
		assert(mism.length === 0, '結合画像の枠(3): 結合画像が引く種類（deckMarkerKindByName）が、画面のマーカー・getMarkerKinds と全行一致', mism.map((id) => ({ id, api: r.api[id], dom: r.dom[id], img: r.nameKinds[id] })));
		const seen = new Set(Object.values(r.api));
		assert(seen.has('card') && seen.has('star') && seen.has('other'), '結合画像の枠(3): 3種とも実際に出ている（空振りでない）', [...seen]);
		assert(r.count === r.n, '結合画像の枠(3): ②のスキルの行すべてに枠を置いた', { count: r.count, n: r.n });
		const badColor = ids.filter((id) => r.drawn[id] !== WANT[r.api[id]].frame);
		assert(badColor.length === 0, '結合画像の枠(3): 置いた枠の色が、その行の種類の色', badColor.map((id) => ({ id, kind: r.api[id], got: r.drawn[id] })));
		assert(jsErrors(errors).length === 0, '結合画像の枠(3): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の枠(4) 凡例: 見出し「枠の見かた：」・3行（周回サポカ・サポカ外・その他）をいつも全部・断りの1行・「遺伝子」の語なし・帯の骨格は stitch.js／枠が0 なら帯を置かない（結合画像はスキルパネルだけ）', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate(async () => {
			const texts = [];
			const origFill = CanvasRenderingContext2D.prototype.fillText;
			CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { texts.push(String(t)); return origFill.apply(this, arguments); };
			let barCalls = 0;
			const origBar = window.stitchDrawNoteBar;
			window.stitchDrawNoteBar = function () { barCalls++; return origBar.apply(this, arguments); };
			const bar = buildFactorFrameLegendBar(1200, 1200, true);
			window.stitchDrawNoteBar = origBar;
			CanvasRenderingContext2D.prototype.fillText = origFill;
			const off = buildFactorFrameLegendBar(1200, 1200, false);
			// 期待の高さ: 同じ骨格に4行（3行＋断りの1行。1200px なら折り返さない）
			const c2 = document.createElement('canvas').getContext('2d');
			const m = stitchNoteMetrics(c2, 1200, 1200, FACTOR_LEGEND_NOTE);
			const ref = stitchDrawNoteBar(1200, m, [0, 1, 2, 3].map(() => stitchNoteTextRow(c2, 'x')));
			const d = bar.getContext('2d').getImageData(0, 0, bar.width, bar.height).data;
			const count = (hex) => { const v = parseInt(hex.slice(1), 16), R = (v >> 16) & 255, G = (v >> 8) & 255, B = v & 255; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === R && d[i + 1] === G && d[i + 2] === B) n++; return n; };
			const colors = {};
			UmaSkillDeckCore.markers.list.forEach((mk) => {
				const tint = parseInt(mk.imageTint.slice(1), 16);
				const panel = '#' + [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255].map((t) => Math.round(226 * t / 255).toString(16).padStart(2, '0')).join('');
				colors[mk.id] = { frame: count(mk.light.fill), edge: count(mk.light.edge), panel: count(panel) };
			});
			// 枠が0 の結合: 1人分の結合は合成の Canvas で済ませる（②に無い名前だけを検出した人）
			const keep = { s: window.stitchOnePerson, f: persons[0].files, g: personGeometry[0], l: personLines[0], r: personResults[0] };
			window.stitchOnePerson = async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; c._sourcePlacements = []; return c; };
			persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
			personGeometry[0] = [{ scale: 1, columnXs: [100, 250], rows: [{ y: 40, h: 20, col: 0 }, { y: 120, h: 20, col: 0 }] }];
			personLines[0] = [{ text: '②に無い名前', rowKey: '0:0' }, { text: '②に無い名前2', rowKey: '0:1' }];
			personResults[0] = { detectedSkills: new Set(['②に無い名前', '②に無い名前2']), skillSources: { '②に無い名前': [0], '②に無い名前2': [1] }, skillStars: {}, matchReasons: {} };
			const zero = await buildStitchedSetImage(0, null, true);
			window.stitchOnePerson = keep.s; persons[0].files = keep.f; personGeometry[0] = keep.g; personLines[0] = keep.l; personResults[0] = keep.r;
			return { texts, barCalls, off, w: bar.width, h: bar.height, refH: ref.height, colors, labels: UmaSkillDeckCore.markers.list.map((mk) => mk.label),
				zeroLegend: !!zero._layout.legend, zeroTable: !!zero._layout.table, zeroParent: !!zero._layout.parent, red: count('#d81f26') };
		});
		assert(r.off === null, '結合画像の枠(4): 枠が0 なら凡例の帯を作らない', r.off);
		assert(!r.zeroLegend && !r.zeroTable && r.zeroParent, '結合画像の枠(4): 枠を1つも置かず表も無い（OCR の写しが無い）結合画像には凡例が付かない（段6 の構成では右の画像だけ）', r);
		assert(r.barCalls === 1 && r.w === 1200 && r.h === r.refH, '結合画像の枠(4): 帯は stitch.js の骨格（stitchDrawNoteBar）で、4行ぶん（3行＋断りの1行）の高さ', { calls: r.barCalls, h: r.h, ref: r.refH });
		const want = ['枠の見かた：', ' 周回サポカスキル', '', ' サポカ外スキル', '', ' その他（親から継承）', '枠の無いパネルは、因子周回スキルに入れていないスキルです。'];
		assert(JSON.stringify(r.texts) === JSON.stringify(want), '結合画像の枠(4): 凡例の文字（見出し・3行の名前・断りの1行）が決定のとおり', r.texts);
		assert(!r.texts.concat(r.labels).some((t) => t.includes('遺伝子')), '結合画像の枠(4): 凡例に「遺伝子」の語が無い', r.texts);
		Object.entries(r.colors).forEach(([k, c]) => {
			assert(c.frame > 0 && c.edge > 0 && c.panel > 0, '結合画像の枠(4): ' + k + ' の行に、枠の見本（枠の色・塗りの色）とマーカー（外枠の色）が描かれている', c);
		});
		assert(r.red === 0, '結合画像の枠(4): 凡例に ◎（超優先の赤）が無い', r.red);
		assert(jsErrors(errors).length === 0, '結合画像の枠(4): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の枠(5) 枠は結合の後に描く・設定 OFF なら描かない・列が2本でない画像や行の間隔が測れない人には描かない（開発ログに理由）', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate(async () => {
			const kindByName = { A: 'card', B: 'star' };
			const keep = { k: window.deckMarkerKindByName, s: window.stitchOnePerson, f: persons[0].files, g: personGeometry[0], l: personLines[0], r: personResults[0], t: tierMarksEnabled };
			window.deckMarkerKindByName = () => kindByName;
			const setPerson = (geo) => {
				personGeometry[0] = geo;
				personLines[0] = [{ text: 'A', rowKey: '0:0' }, { text: 'B', rowKey: '0:1' }];
				personResults[0] = { detectedSkills: new Set(['A', 'B']), skillSources: { A: [0], B: [1] }, skillStars: {}, matchReasons: {} };
			};
			const GOOD = [{ scale: 1, columnXs: [200, 500], rows: [{ y: 48, h: 24, col: 0 }, { y: 128, h: 24, col: 0 }] }];
			const canvas = () => { const c = document.createElement('canvas'); c.width = 820; c.height = 260; c._sourcePlacements = []; return c; };
			// 結合の順: stitchOnePerson が返した Canvas に、後から枠を描く（結合の入力の画像には描かない）
			const order = [];
			window.stitchOnePerson = async () => { order.push('stitch'); return canvas(); };
			const origDraw = window.drawFactorFramesOnPerson;
			window.drawFactorFramesOnPerson = function (c, i) { order.push('frames'); return origDraw(c, i); };
			persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
			setPerson(GOOD);
			tierMarksEnabled = true;
			const withBar = await buildStitchedSetImage(0, null, true);
			window.drawFactorFramesOnPerson = origDraw;
			devGeometry = [];
			tierMarksEnabled = false;
			const offCount = drawFactorFramesOnPerson(canvas(), 0);
			tierMarksEnabled = true;
			setPerson([{ scale: 1, columnXs: [200, 350, 500], rows: GOOD[0].rows }]);
			const threeCols = drawFactorFramesOnPerson(canvas(), 0);
			setPerson([{ scale: 1, columnXs: [200, 500], rows: [{ y: 48, h: 24, col: 0 }, { y: 48, h: 24, col: 1 }] }]);
			const noStep = drawFactorFramesOnPerson(canvas(), 0);
			const dev = devGeometry.slice();
			window.deckMarkerKindByName = keep.k; window.stitchOnePerson = keep.s; persons[0].files = keep.f;
			personGeometry[0] = keep.g; personLines[0] = keep.l; personResults[0] = keep.r; tierMarksEnabled = keep.t;
			return { order, legend: !!withBar._layout.legend, offCount, threeCols, noStep, dev };
		});
		assert(r.order.join() === 'stitch,frames' && r.legend, '結合画像の枠(5): 枠は1人分の結合の後に描き、枠があれば凡例の帯が付く', r);
		assert(r.offCount === 0, '結合画像の枠(5): 「種類の枠を付ける」が OFF なら描かない', r.offCount);
		assert(r.threeCols === 0 && r.noStep === 0 && r.dev.some((s) => s.includes('[種類の枠]') && s.includes('列がちょうど2本')) && r.dev.some((s) => s.includes('[種類の枠]') && s.includes('行の間隔')),
			'結合画像の枠(5): 列が2本でない・行の間隔が測れないときは描かず、開発ログに理由を残す', r);
		assert(jsErrors(errors).length === 0, '結合画像の枠(5): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});
}
