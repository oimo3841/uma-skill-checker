// T179（2026-11-12・決定 732〜734）: 速い動画で、その行が1枚の画にしか写っていないときの読み違い2件の直し。
// 塊の見出しは「T179」で始まる（`npm run test:visual -- --only=T179`）。run-smoke.mjs の末尾から register174() で呼ばれる。
//
//  - S7（732。special.html・exam.html）: ★を「★の置き場所」で数える。画ごとに、きれいな★（幅 0.022〜0.034W・縦の中心が
//    すきまの 0.15〜0.40）から置き場所3つ（1つ目の位置・間隔・★の幅）を推定し、置き場所に重なる金色の連なりの数を★にする。
//    ★の左下に写った指のエフェクト（黄色い輪）を3つ目の★と数えていた（動画7 祖1 の先行けん制 ★3。正しくは★2）。
//    推定できない画（きれいな★が4つ未満）は今までどおり連なりの数。
//  - K1（733。special.html）: どの名前にも当たらなかった行のうち、読みが2文字の名前に距離1の行を、T157 と同じ決まり
//    （同じ画のすぐ上・すぐ下の行が決まっていて、並びの間に入る候補が1つだけ）で採る（動画8 祖1 の巨歩 →「巨坂」「巨執」）。
//  - 734（exam.html）: 564行の名前の照合（matchMelopLines。拡張モード・効率を指定・Deck へ送るぶん）に、T157 の並びの拾い直し
//    （同点の行）と K1 を写す。いつもの判定（対象の範囲の名前で照合）には、拾い直した名前のうち対象の範囲に入っているものだけを足す。
// OCR は使わない（★は金色の矩形を描いた画、名前は読みの行を作って渡す）。

export async function register174(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

	// ★の画: 幅 1170・1列（列の左端 x=60）。文字帯は 150px ごと（帯の高さ 22・すきま 128）。★は幅 33・間隔 39・1つ目は列の左端から 100
	const starCase = (fnName) => {
		const W = 1170, H = 1300, colX = 60, s1 = 100, pitch = 39, sw = 33;
		const c = document.createElement('canvas'); c.width = W; c.height = H;
		const x = c.getContext('2d');
		x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
		const bands = [];
		for (let i = 0; i < 7; i++) bands.push({ a: 100 + i * 150, b: 122 + i * 150 });
		const gold = 'rgb(255,215,60)', grayStar = 'rgb(205,205,205)';
		// 行ごと: [金の★の数, エフェクト, 窓の下端の切れ端]
		const plan = [[3], [2], [1], [3], [2, 'ring'], [2], [1, null, 'tip']];
		plan.forEach(([n, fx, tip], i) => {
			const b = bands[i].b;
			for (let k = 0; k < 3; k++) {
				x.fillStyle = k < n ? gold : grayStar;
				x.fillRect(colX + s1 + k * pitch, b + 20, sw, 30);
			}
			if (fx === 'ring') { x.fillStyle = gold; x.fillRect(colX, b + 45, 72, 29); }   // ★の左下の輪（幅 72・低い）
			if (tip) { x.fillStyle = gold; x.fillRect(colX + s1 + pitch + 13, b + 20, 8, 6); } // 2つ目の置き場所に★の先だけ（幅 8）
		});
		const rows = plan.map((_, i) => ({ band: i, col: 0, x: colX }));
		const fn = window[fnName];
		const all = fn(c, { bands, rows, columnXs: [colX] }).map((r) => r.stars);
		// 推定できない画: エフェクトの行と★1つの行だけ（きれいな★は3つ）
		const few = fn(c, { bands, rows: [rows[2], rows[4]], columnXs: [colX] }).map((r) => r.stars);
		// 今までの数え方（連なりの数）
		const g = goldMaskOf(getPixels(c));
		const old = rows.map((r) => countRowStarBlobs(g, W, colX, W, bands[r.band].b + 1, (bands[r.band + 1] ? bands[r.band + 1].a - 1 : bands[r.band].b + 128)));
		return { all, few, old };
	};

	for (const [file, fnName] of [['special.html', 'computeRowStarCountsSpecial'], ['exam.html', 'computeRowStarCountsExam']]) {
		await block('T179 ―― ' + file + ': ★は置き場所で数える（★の左下のエフェクトを3つ目と数えない・推定できない画は今までどおり）', async () => {
			const sp = await openPage(browser, base, file, { width: 375, height: 812 }, EMPTY);
			try {
				const r = await sp.page.evaluate(starCase, fnName);
				assert(r.old[4] === 3 && r.old[6] === 2, '前提: 今までの数え方（連なりの数）では、エフェクトの行は ★3・切れ端の行は ★2', r.old);
				assert(JSON.stringify(r.all) === JSON.stringify([3, 2, 1, 3, 2, 2, 2]), '置き場所で数える: エフェクトの行は ★2（ほかの行は今までと同じ）', r.all);
				assert(r.all[6] === 2, '窓の下端で★の先だけ写った細い切れ端も、置き場所に重なれば今どおり数える', r.all);
				assert(JSON.stringify(r.few) === JSON.stringify([1, 3]), 'きれいな★が4つ未満の画は推定せず、今までどおり連なりの数（エフェクトの行も ★3 のまま）', r.few);
			} finally { await sp.page.context().close(); }
		});
	}

	// 動画8 祖1 の巨歩の段（T178-check-1 の 2-1。f1 の行4〜6。読みは2通りとも1字違い）
	const L = (text, rowKey, stars) => ({ text, conf: 80, stars, starsReliable: true, rowKey });
	const kyoho = [L('勝負を懸けて', '1:4', 1), L('勝負を懸けて', '1:4', 1), L('巨坂', '1:5', 2), L('巨執', '1:5', 2), L('戦略家', '1:6', 3), L('戦略家', '1:6', 3)];

	await block('T179 ―― special.html: 2文字の名前に1字違いの行を、上下のとなりの行の並びで拾い直す（K1）', async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		try {
			await sp.page.waitForFunction(() => window.UmaSkillDeckCore && UmaSkillDeckCore.getSkillDisplayOrderMeta().ok, null, { timeout: 30000 });
			const r = await sp.page.evaluate(async ({ kyoho }) => {
				try { await UmaSkillDeckCore.loadSkillEvolutions(false); } catch (e) { /* 読めなくても進む */ }
				const d = allSkillNamesDictionary();
				allSkillNamesDict = d;
				// ③の照合の入口（matchWithAllSkillNames）。巨歩が②の範囲の外なら devOutsideScope に移るので、どちらかにあればよい
				const keep = deckMode;
				deckMode = true;
				let viaEntry;
				try {
					const res = matchWithAllSkillNames(kyoho.map((l) => Object.assign({}, l)));
					const out = (res.devOutsideScope || []).find((o) => o.name === '巨歩');
					viaEntry = res.detectedSkills.has('巨歩') ? { stars: res.skillStars['巨歩'], reason: res.matchReasons['巨歩'] } : (out ? { stars: out.stars, reason: out.reason } : null);
				} finally { deckMode = keep; }
				const runK = (lines) => {
					const res = matchAllSkillsWithStars(lines, d.list, d.index, ocrErrorDictionary);
					const at = typeof skillsByRowKey === 'function' ? skillsByRowKey(res, lines) : null;
					pickTiedRowsByGameOrder(res, lines);
					if (typeof pickShortRowsByGameOrder === 'function') pickShortRowsByGameOrder(res, lines, at, d);
					return { got: res.detectedSkills.has('巨歩'), stars: res.skillStars['巨歩'], n: res.detectedSkills.size };
				};
				const move = (lines, map) => lines.map((l) => Object.assign({}, l, { rowKey: map[l.rowKey] || l.rowKey }));
				return {
					inDict: d.list.indexOf('巨歩') !== -1,
					viaEntry,
					base: runK(kyoho),
					// となりでない（上の決まった行が2つ上）
					notAdjacent: runK(move(kyoho, { '1:4': '1:3' })),
					// 上下が入れ替わる（並びの間に巨歩が入らない）
					swapped: runK(move(kyoho, { '1:4': '1:6', '1:6': '1:4' })),
					// 上の行が別の画
					otherImage: runK(move(kyoho, { '1:4': '0:4' })),
					// 下の行が無い
					noDown: runK(kyoho.filter((l) => l.rowKey !== '1:6')),
					// 1字違いでない（2字違い）
					twoOff: runK(kyoho.map((l) => (l.rowKey === '1:5' ? Object.assign({}, l, { text: '臣坂' }) : l)))
				};
			}, { kyoho });
			assert(r.inDict, '前提: ③の照合の辞書に巨歩がある', r.inDict);
			assert(r.viaEntry && r.viaEntry.stars === 2 && /2文字の1字違い→並びで拾い直し/.test(r.viaEntry.reason), '③の照合（matchWithAllSkillNames）で「巨坂」「巨執」の行が巨歩 ★2 になる（上: 勝負を懸けて・下: 戦略家）', r.viaEntry);
			assert(r.base.got && r.base.stars === 2, '拾い直しの関数: 巨歩 ★2', r.base);
			assert(!r.notAdjacent.got, '上の決まった行がとなりでなければ拾わない', r.notAdjacent);
			assert(!r.swapped.got, '上下の並びの間に入らなければ拾わない', r.swapped);
			assert(!r.otherImage.got, '上の行が別の画なら拾わない', r.otherImage);
			assert(!r.noDown.got, '下の決まった行が無ければ拾わない', r.noDown);
			assert(!r.twoOff.got, '2文字の名前に2字違いの読みは拾わない', r.twoOff);
		} finally { await sp.page.context().close(); }
	});

	await block('T179 ―― exam.html: 並びの拾い直し（同点の行・2文字の1字違いの行）を564行の照合に掛け、いつもの判定には対象の範囲の名前だけを足す', async () => {
		const sp = await openPage(browser, base, 'exam.html', { width: 375, height: 812 }, EMPTY);
		try {
			const r = await sp.page.evaluate(async ({ kyoho }) => {
				const sheet = await loadMelopSheet();
				if (typeof loadSkillDisplayOrder === 'function') await loadSkillDisplayOrder();
				const pickedFull = (lines) => { const res = matchMelopLines(lines, sheet); return Array.from(res.detectedSkills).filter((n) => /拾い直し/.test(res.matchReasons[n] || '')).map((n) => n + '★' + res.skillStars[n]); };
				// 2文字の1字違い（巨歩・策士）と、同点の行（レースの真髄・体）
				const saku = [
					{ text: 'お見通し', conf: 85, stars: 2, starsReliable: true, rowKey: '0:0' },
					{ text: '策土', conf: 80, stars: 1, starsReliable: true, rowKey: '0:1' },
					{ text: '逃げのコツ○', conf: 85, stars: 3, starsReliable: true, rowKey: '0:2' }
				];
				const tied = [
					{ text: 'レースの真髄・速', conf: 85, stars: 2, starsReliable: true, rowKey: '2:0' },
					{ text: 'レースの真髄・冂', conf: 80, stars: 3, starsReliable: true, rowKey: '2:1' },
					{ text: 'レースの真髄・力', conf: 85, stars: 2, starsReliable: true, rowKey: '2:2' }
				];
				const full = { kyoho: pickedFull(kyoho), saku: pickedFull(saku), tied: pickedFull(tied) };
				// いつもの判定（対象の範囲で照合）＋ 対象の範囲の名前だけを足す
				const keepMode = targetScopeMode;
				const main = (mode) => {
					targetScopeMode = mode; rebuildSkillList();
					const run = captureRun();
					const lines = saku.concat(kyoho);
					const res = matchAllSkillsWithStars(lines, run.skillList, run.skillIndex, {});
					const before = res.detectedSkills.has('策士');
					if (typeof addOrderPicksInScope === 'function') addOrderPicksInScope(res, lines, sheet, run);
					return { before, saku: res.detectedSkills.has('策士') ? res.skillStars['策士'] : null, kyoho: res.detectedSkills.has('巨歩'), inScope: run.skillList.indexOf('策士') !== -1 };
				};
				let def, cur;
				try { def = main('default'); cur = main('curated'); } finally { targetScopeMode = keepMode; rebuildSkillList(); }
				// 効率を指定の対象（471種）に巨歩が入っている
				let effHas = null;
				try { const eff = await loadEffData(); effHas = eff.targets.some((t) => t.name === '巨歩'); } catch (e) { effHas = 'エラー ' + e.message; }
				const src = String(processImages);
				return { full, def, cur, effHas, wired: /addOrderPicksInScope\(personResults\[p\]/.test(src) && /loadSkillDisplayOrder\(\)/.test(src) };
			}, { kyoho });
			assert(r.full.kyoho.join() === '巨歩★2', '564行の照合: 「巨坂」「巨執」の行を巨歩 ★2 に拾い直す（K1）', r.full);
			assert(r.full.saku.join() === '策士★1', '564行の照合: 「策土」の行を策士 ★1 に拾い直す（上: お見通し・下: 逃げのコツ○）', r.full);
			assert(r.full.tied.join() === 'レースの真髄・体★3', '564行の照合: 同点の行（レースの真髄・冂）を、上下の並びの間の レースの真髄・体 に拾い直す（T157 を写したもの）', r.full);
			assert(r.effHas === true, '効率を指定の対象（並びのデータの行のうち効率のあるもの）に巨歩が入っている', r.effHas);
			assert(r.def.inScope && !r.def.before && r.def.saku === 1 && !r.def.kyoho, 'いつもの判定（既定の134種）: 対象に入っている策士は ★1 で足す・対象の外の巨歩は足さない', r.def);
			assert(!r.cur.inScope && r.cur.saku === null, '対象を絞る（策士を外す）: 策士は足さない', r.cur);
			assert(r.wired, 'processImages が並びのデータを読み、いつもの判定に addOrderPicksInScope を掛ける', r.wired);
		} finally { await sp.page.context().close(); }
	});
}
