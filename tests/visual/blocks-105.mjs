// ③の照合の辞書を全スキルの名前にし、②に無い名前に当たった行を捨てる（T95・2026-11-04）の検査。
// run-smoke.mjs の末尾から register105() で呼ばれる（塊の見出しはすべて「T95全スキルで照合」で始まる。`npm run test:visual -- --only=T95全スキルで照合` で回せる）。
//
// 決め（T93 の §4-3。②が少ないと OCR の行が似た名前の別のスキルに寄る〔「差しためらい」→「逃げためらい」など〕）:
//  - 新UI の③は、skillList（②＋対象の遺伝子）→ マスター → 追加カタログ（進化スキルを除く）の順の辞書で照合し（common.js の照合はそのまま）、
//    ②に無い名前に当たったものは結果（detectedSkills・skillStars・skillSources・matchReasons）から外して devOutsideScope に残す（開発ログに出す）。
//  - ②の名前は skillList の表記のまま検出される（buildSkillDictionary は正規化後が同じ名前を先のもので残す）。②にしか無い名前も辞書に入る。
//  - 旧UI（deckMode でない）は今までどおり skillList だけで照合し、全スキルの辞書は作らない。
// 行は作り物（OCR はしない。照合の関数に行をそのまま渡す）。名前はマスターから規則で選ぶ（ソースにスキル名を書かない）。

export async function register105(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const open = async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		sp.page.setDefaultTimeout(60000);
		await sp.page.evaluate(async () => {
			await UmaSkillDeckCore.loadMasterSkills(false);
			try { await UmaSkillDeckCore.loadSkillEvolutions(false); } catch (e) {}
			window.__t95 = {
				/** マスターから、正規化後の距離が許容の内（0 でない）で、どちらも相手を含まない2つの名前を規則で選ぶ（A を②に入れ、B は②の外にする） */
				pair() {
					const m = UmaSkillDeckCore.getMasterSkills().map((s) => ({ raw: s.name, norm: normalizeText(s.name) })).filter((s) => s.norm.length >= 3);
					for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++) {
						if (i === j) continue;
						const a = m[i], b = m[j];
						if (a.norm.indexOf(b.norm) !== -1 || b.norm.indexOf(a.norm) !== -1) continue;
						const d = levenshtein(a.norm, b.norm);
						if (d > 0 && d <= allowedDistance(a.norm.length) && d <= allowedDistance(b.norm.length)) return { A: a.raw, B: b.raw, d };
					}
					return null;
				},
				/** ②（skillList）を名前の配列で置く。因子の節は空（この塊は照合の関数だけを見る） */
				setScope(names) {
					const d = buildSkillDictionary(names);
					skillList = d.list; skillIndex = d.index; skillOnlyList = d.list.slice(); factorOnlyList = []; factorNormSet = new Set(); factorMarkByNorm = new Map();
					allSkillNamesDict = null;
				},
				line(text, stars, key) { return { text: text, conf: 90, stars: stars, starsReliable: true, rowKey: key || '0:0' }; },
				det(r) { return Array.from(r.detectedSkills).map((n) => n + '★' + r.skillStars[n]); }
			};
		});
		return sp;
	};

	await block('T95全スキルで照合 ―― 辞書: skillList（②）→ マスター → 追加カタログ（進化スキルは入れない）。②の名前は skillList の表記のまま', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(() => {
				const T = window.__t95;
				const master = UmaSkillDeckCore.getMasterSkills().map((s) => s.name);
				const cat = UmaSkillDeckCore.getExtraCatalog();
				const evolved = cat.filter((x) => UmaSkillDeckCore.isEvolvedSkillId(x.id)).map((x) => normalizeText(x.name));
				// T157（決定 630）: ◎ と金スキルは因子の画面に出ないので辞書に入れない（blocks-160 が見る）。ここではそれを除いた全部が入るかを見る
				const pt = UmaSkillDeckCore.getSkillPtData().skillPt;
				const t157Out = (x) => x.name.indexOf('◎') !== -1 || (pt instanceof Map && pt.get(x.id) && pt.get(x.id).rarity === 'gold');
				const kept = cat.filter((x) => !UmaSkillDeckCore.isEvolvedSkillId(x.id) && !t157Out(x)).map((x) => normalizeText(x.name));
				const custom = 'T95にしか無い名前';
				// ②はマスターの末尾の名前と、どこにも無い名前（カスタムスキルの代わり）
				T.setScope([master[master.length - 1], custom]);
				const d = allSkillNamesDictionary();
				const norms = new Set(d.index.map((x) => x.norm));
				const keptSet = new Set(kept.concat(master.map(normalizeText)));
				return {
					size: d.list.length, master: master.length, cat: cat.length, evolved: evolved.length,
					head: d.list.slice(0, 2), expectHead: [master[master.length - 1], custom],
					masterAll: master.every((n) => norms.has(normalizeText(n))),
					keptAll: kept.every((n) => norms.has(n)),
					// 進化スキルの名前は、同じ正規化の名前がマスターか進化でない行に無ければ辞書に入らない
					evolvedOut: evolved.filter((n) => !keptSet.has(n)).every((n) => !norms.has(n)),
					dup: d.list.filter((n) => normalizeText(n) === normalizeText(master[master.length - 1])).length
				};
			});
			assert(r.head.join('|') === r.expectHead.join('|') && r.dup === 1, '②の名前が先頭に、その表記のまま1つだけ入る（②にしか無い名前も入る）', [r.head, r.dup]);
			assert(r.masterAll && r.keptAll, 'マスターの全部と、追加カタログの進化スキルでない全部（◎・金を除く。T157）が入る', [r.masterAll, r.keptAll, r.size]);
			assert(r.evolved > 0 && r.evolvedOut, '進化スキルの名前は入らない（進化の一覧 ' + r.evolved + '件）', [r.evolved, r.evolvedOut]);
			assert(r.size > r.master && r.size < r.master + r.cat + 2, '辞書の大きさはマスター＋②の分より大きく、追加カタログの全部を足した数より小さい（進化スキルを外したぶん）', [r.size, r.master, r.cat]);
		} finally { await sp.page.context().close(); }
	});

	await block('T95全スキルで照合 ―― ②に無い名前に当たった行は捨て、②の名前の行はその★で検出する（前は②の似た名前に寄っていた）', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(() => {
				const T = window.__t95;
				const p = T.pair();
				if (!p) return { nopair: true };
				T.setScope([p.A]);
				const lines = [T.line(p.B, 3, '0:0')];
				const before = T.det(matchAllSkillsWithStars(lines, skillList, skillIndex, {}));
				const after = matchWithAllSkillNames(lines);
				const both = matchWithAllSkillNames([T.line(p.A, 2, '0:1'), T.line(p.B, 3, '0:2')]);
				return {
					p: p, before: before, after: T.det(after), afterKeys: Object.keys(after.skillSources).concat(Object.keys(after.matchReasons)),
					outside: (after.devOutsideScope || []).map((u) => u.name + '★' + u.stars + '/' + u.reason),
					both: T.det(both), bothOutside: (both.devOutsideScope || []).length, bothSources: JSON.stringify(both.skillSources)
				};
			});
			assert(!r.nopair, 'マスターに、正規化後の距離が許容の内の2つの名前がある（検査の前提）', r.p);
			if (r.nopair) return;
			assert(r.before.length === 1 && r.before[0] === r.p.A + '★3', '前: ②に無い名前の行が、②の似た名前（距離 ' + r.p.d + '）に寄っていた', [r.p, r.before]);
			assert(r.after.length === 0 && r.afterKeys.length === 0, '後: ②に無い名前に当たった行は結果に入らない（skillSources・matchReasons にも残らない）', [r.after, r.afterKeys]);
			assert(r.outside.length === 1 && r.outside[0].indexOf(r.p.B + '★3/') === 0, '捨てたものは devOutsideScope に名前・★・理由で残る', r.outside);
			assert(r.both.length === 1 && r.both[0] === r.p.A + '★2' && r.bothOutside === 1 && r.bothSources === JSON.stringify({ [r.p.A]: [0] }), '②の名前の行はその★で検出し、根拠の行はその行だけ', [r.both, r.bothOutside, r.bothSources]);
		} finally { await sp.page.context().close(); }
	});

	await block('T95全スキルで照合 ―― 旧UI（deckMode でない）は skillList だけで照合し、全スキルの辞書を作らない', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(() => {
				const T = window.__t95;
				const p = T.pair();
				if (!p) return { nopair: true };
				T.setScope([p.A]);
				const lines = [T.line(p.B, 3, '0:0'), T.line(p.A, 1, '0:1')];
				const saved = deckMode;
				deckMode = false;
				try {
					const r1 = matchWithAllSkillNames(lines);
					const r0 = matchAllSkillsWithStars(lines, skillList, skillIndex, ocrErrorDictionary);
					return { same: JSON.stringify(T.det(r1)) === JSON.stringify(T.det(r0)), det: T.det(r1), noField: r1.devOutsideScope === undefined, noDict: allSkillNamesDict === null };
				} finally { deckMode = saved; }
			});
			assert(!r.nopair, 'マスターに、正規化後の距離が許容の内の2つの名前がある（検査の前提）', r);
			if (r.nopair) return;
			assert(r.same && r.det.length === 1 && r.noField && r.noDict, '旧UI は matchAllSkillsWithStars(skillList) と同じ結果で、devOutsideScope も全スキルの辞書も無い', r);
		} finally { await sp.page.context().close(); }
	});

	await block('T95全スキルで照合 ―― 開発ログに「全スキルで照合して②に無い名前に当たった行（捨てた）」が人ごとに出る', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(() => {
				const T = window.__t95;
				const p = T.pair();
				if (!p) return { nopair: true };
				T.setScope([p.A]);
				personResults[0] = applyFactorStrictMatch(matchWithAllSkillNames([T.line(p.B, 3, '0:0')]), []);
				document.getElementById('opt-devlog').checked = true;
				renderDevLog();
				const text = document.getElementById('dev-log').textContent;
				personResults[0] = null;
				const m = /全スキルで照合して②に無い名前に当たった行（捨てた）1件:\n\s+(.+)/.exec(text);
				return { p: p, has: !!m, line: m ? m[1] : '', hidden: document.getElementById('dev-wrap').classList.contains('hidden') };
			});
			assert(!r.nopair, 'マスターに、正規化後の距離が許容の内の2つの名前がある（検査の前提）', r);
			if (r.nopair) return;
			assert(r.has && r.line.indexOf(r.p.B + '（★3 / ') === 0 && !r.hidden, '捨てた名前・★・理由が開発ログの人の節に出る', [r.has, r.line, r.hidden]);
		} finally { await sp.page.context().close(); }
	});

	await block('T95全スキルで照合 ―― 呼び出し元: processImages が matchWithAllSkillNames を通し、押すたびに辞書を作り直す', async () => {
		const fs = env.fs, path = env.path;
		const sp = fs.readFileSync(path.join(env.REPO_ROOT, 'special.html'), 'utf8');
		assert(/personResults\[p\] = applyFactorStrictMatch\(matchWithAllSkillNames\(matchLines\), matchLines\);/.test(sp), 'processImages は因子の絞り込みの前に matchWithAllSkillNames を通す', null);
		assert((sp.match(/matchAllSkillsWithStars\(lines, /g) || []).length === 2 && (sp.match(/matchAllSkillsWithStars\(matchLines/g) || []).length === 0, 'common.js の照合を行で呼ぶのは matchWithAllSkillNames の中の2か所だけ（旧UI・全スキル）', null);
		assert(/allSkillNamesDict = null;\r?\n\s*if \(deckMode\) \{ try \{ await UmaSkillDeckCore\.loadSkillEvolutions\(false\); \} catch \(e\) \{\} \}/.test(sp), 'processImages は押すたびに辞書を捨て、新UI では進化の一覧を待ってから照合する', null);
	});
}
