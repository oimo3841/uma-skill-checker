// T173（2026-11-11・決定 698・700〜702）: 未読の赤い点（.uma-fab-dot）の脈動を5回で止める。塊の見出しは「T173」で始まる
// （`npm run test:visual -- --only=T173`）。run-smoke.mjs の末尾から register171() で呼ばれる。
//
// 前は animation: uma-fab-pulse 1.8s ease-out infinite で、見るまで光り続けていた（T170 の読むだけの調べで、放置中に動き続けている唯一のもの）。
// - 5回光ったら止まる。止まったあとも点は出たまま（形・色・位置は同じ。光の輪だけ出なくなる）
// - 新しい結果（markFabUnseen）が出たら、点が出たままでも、隠れてから出る場合も、また5回光る（ほかの行き先の点は光り直さない）
// - special.html・exam.html の両方で同じ
// 「未読の丸（2026-09-15・43セッション目）」の塊（run-smoke.mjs）が見ている出る条件・赤・1つだけ・reduced-motion は変えない。
//
// 注意: 5回を終えた CSS アニメーションは getAnimations() に残らない。止まったことは、光っている間に覚えておいた
// Animation の playState（'finished'）と、いま動いている脈動が無いこと、の2つで見る。

export async function register171(env) {
	const { block, assert, browser, base, openPage } = env;
	const RED = 'rgb(197, 48, 48)';
	const PERIOD = 1800, COUNT = 5;

	// 点の状態: 出ているか・形・色と、いま動いている uma-fab-pulse・覚えておいた脈動の playState
	const readDots = (page, ids) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
		const dot = document.getElementById(id);
		const st = getComputedStyle(dot);
		const a = dot.getAnimations().find((x) => x.animationName === 'uma-fab-pulse');
		const kept = (window.__t173 || {})[id];
		return [id, {
			hidden: dot.hidden, w: dot.offsetWidth, h: dot.offsetHeight, bg: st.backgroundColor, border: st.borderTopWidth,
			radius: st.borderTopLeftRadius, count: st.animationIterationCount, shadow: st.boxShadow,
			anim: a ? { state: a.playState, t: Math.round(Number(a.currentTime)), iterations: a.effect.getComputedTiming().iterations } : null,
			kept: kept ? kept.playState : null, same: !!(kept && a && kept === a),
		}];
	})), ids);
	// いま動いている脈動を覚える
	const remember = (page, ids) => page.evaluate((ids) => {
		window.__t173 = window.__t173 || {};
		ids.forEach((id) => { window.__t173[id] = document.getElementById(id).getAnimations().find((x) => x.animationName === 'uma-fab-pulse') || null; });
	}, ids);
	// 脈動を終えたところまで進める（実時間の待ちは exam で1回だけ見る）
	const finish = (page, ids) => page.evaluate(({ ids, end }) => ids.forEach((id) => {
		const a = document.getElementById(id).getAnimations().find((x) => x.animationName === 'uma-fab-pulse');
		if (a) a.currentTime = end;
	}), { ids, end: PERIOD * COUNT + 50 });
	// 止まって、点は出たまま
	const assertStopped = (d, file, id, note) => {
		assert(d.kept === 'finished' && !d.anim,
			file + ': 5回光ったら脈動が止まる（' + id + (note || '') + '）', d);
		assert(!d.hidden && d.w === 12 && d.h === 12 && d.bg === RED && d.border === '2px' && d.shadow === 'none',
			file + ': 止まったあとも点は出たまま（12px の赤い丸・縁 2px・光の輪なし）（' + id + '）', d);
	};
	const assertFresh = (d, file, label) => assert(!d.hidden && d.anim && d.anim.state === 'running' && d.anim.t < 1000 && d.anim.iterations === COUNT,
		file + ': ' + label, d);

	const pages = [
		{ file: 'exam.html', tabDots: ['result-tab-dot-result', 'result-tab-dot-stitch'], realWait: true },
		{ file: 'special.html', tabDots: ['result-tab-result-dot', 'result-tab-stitch-dot', 'stitch-tab-result-dot', 'stitch-tab-stitch-dot'], realWait: false },
	];
	for (const P of pages) {
		await block('T173 ―― ' + P.file + ': 未読の赤い点は5回光って止まり、点は出たまま。新しい結果でまた5回光る', async () => {
			const { ctx, page, errors } = await openPage(browser, base, P.file);
			try {
				await page.evaluate(() => { if (typeof closeUiNotice === 'function') closeUiNotice(); });
				if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]');
				await page.waitForTimeout(300);
				const MAIN = 'fab-unseen-dot', R = 'fab-dot-result', S = 'fab-dot-stitch';
				const ALL = [MAIN, R, S];

				// 1. 出た直後: 5回の脈動が動いている（前は infinite）。タブの点も同じ部品なので回数は 5
				await page.evaluate(() => { markFabUnseen('result'); markFabUnseen('stitch'); });
				await remember(page, ALL);
				const a = await readDots(page, [...ALL, ...P.tabDots]);
				for (const id of ALL) assertFresh(a[id], P.file, '点が出た直後は脈動していて、回数は5回（' + id + '）');
				assert(P.tabDots.every((id) => a[id].count === String(COUNT)),
					P.file + ': 引き出しのタブの点も脈動は5回', P.tabDots.map((id) => a[id].count));

				// 2. 5回で止まる。止まったあとも点は出たまま（形・色・縁取りはそのまま、光の輪は無い）
				if (P.realWait) await page.waitForTimeout(PERIOD * COUNT + 500);
				else await finish(page, ALL);
				const b = await readDots(page, ALL);
				for (const id of ALL) assertStopped(b[id], P.file, id, P.realWait ? '・実時間で ' + (PERIOD * COUNT + 500) + 'ms 待った' : '');

				// 3. 出たままの点に新しい結果が出たら、その行き先の点とメインボタンの点がまた5回光る。ほかの行き先の点は止まったまま
				await page.evaluate(() => markFabUnseen('result'));
				const c = await readDots(page, ALL);
				assertFresh(c[MAIN], P.file, '点が出たままでも、新しい結果でまた最初から5回光る（' + MAIN + '）');
				assertFresh(c[R], P.file, '点が出たままでも、新しい結果でまた最初から5回光る（' + R + '）');
				assert(!c[S].hidden && !c[S].anim, P.file + ': 別の行き先（結合画像）の点は光り直さない', c[S]);

				// 4. 見て点が消えたあと、新しい結果でまた出るときも5回光る（stitch で確かめる）
				await remember(page, [MAIN, R]);
				await finish(page, [MAIN, R]);
				await page.evaluate(() => { fabUnseen.stitch = false; updateFabBadges(); });
				const d0 = await readDots(page, [S]);
				assert(d0[S].hidden, P.file + ': 前提: 見たら点は消える（出る・消える条件は変えていない）', d0[S]);
				await page.evaluate(() => markFabUnseen('stitch'));
				const d = await readDots(page, [MAIN, R, S]);
				assertFresh(d[S], P.file, '点が隠れてから新しい結果で出るときも5回光る');
				assertFresh(d[MAIN], P.file, 'メインボタンの点も新しい結果で光り直す');
				assert(!d[R].hidden && !d[R].anim, P.file + ': 照合結果の点は結合画像の新しい結果では光り直さない', d[R]);

				// 5. FAB を開いている間はメインボタンの点を出さない（前と同じ）
				await page.evaluate(() => setFabOpen(true));
				const e = await readDots(page, [MAIN]);
				assert(e[MAIN].hidden, P.file + ': FAB を開いている間はメインボタンの点を出さない（前と同じ）', e[MAIN]);
				await page.evaluate(() => setFabOpen(false));

				assert(errors.length === 0, P.file + ': コンソールエラーが出ない', errors.slice(0, 3));
			} finally { await ctx.close(); }
		});
	}
}
