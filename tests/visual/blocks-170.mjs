// T171（2026-11-11・決定 692）: UmaExam（exam.html）の [蹄鉄]（効率で選ぶの蹄鉄）の開発ログの「置きたかった行」を、
// [印]（T166 段5・決定 678。blocks-167 の「T166段5」）と同じく、置き場所の重なりを除いて数える。塊の見出しは「T171」で始まる
// （`npm run test:visual -- --only=T171`）。run-smoke.mjs の末尾から register170() で呼ばれる。
//
// 同じパネルが2枚の画に写ると、同じスキルの行が2つの rowKey になる。蹄鉄を置くときは重なりを避けて1つだけ置くが、
// 前は「置きたかった行」を rowKey の数で数えていたので「置いた 1 / 置きたかった行 2」と出ていた（蹄鉄の抜けは無い）。
// 変えたのは開発ログの行（と同じ数を返す wanted）だけ。蹄鉄を置く数・位置（結合画像）は変えない。
// 検査は OCR を使わず、行の形（personGeometry・personLines・personMelop）と効率の対象（effPersonItems）を作って drawEffIconsOnPerson を呼ぶ。

export async function register170(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

	// 作った行（blocks-167 の T166段5 と同じ形）: 画0 の2行目と画1 の1行目が結合画像の同じ所（y=220）に写る同じスキル（2つの rowKey）。
	// 画1 の3行目の別のスキルは結合画像の外（y=420。Canvas の高さは 400）。
	await block('T171 ―― exam.html: [蹄鉄] の「置きたかった行」は同じ行が2枚に写った重なりを除いて数える（蹄鉄を置く数は変えない）', async () => {
		const sp = await openPage(browser, base, 'exam.html', { width: 375, height: 812 }, EMPTY);
		sp.page.setDefaultTimeout(120000);
		try {
			const r = await sp.page.evaluate(async () => {
				const names = ['T171のスキルA', 'T171のスキルB'];
				const rows = (ys) => ys.map((y) => ({ x: 120, y, w: 200, h: 40, col: 0 }));
				const g = (ys) => ({ rows: rows(ys), columnXs: [100, 600], scale: 1, naturalW: 1000, naturalH: 2200 });
				// 蹄鉄の画像の代わり（区間ごとの4枚。drawImage に渡せる Canvas）
				const imgs = [0, 1, 2, 3].map(() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c; });
				const run = { eff: { bounds: [0, 0, 0], tiers: [true, true, true, true] }, effShoes: true };
				const drawOnce = (withOutside) => {
					personGeometry[0] = [g([100, 200, 300]), g([0, 100, 200])];
					personLines[0] = [{ text: names[0], rowKey: '0:1' }, { text: names[0], rowKey: '1:0' }, { text: names[1], rowKey: '1:2' }];
					personMelop[0] = { res: { skillSources: withOutside ? { [names[0]]: [0, 1], [names[1]]: [2] } : { [names[0]]: [0, 1] } } };
					const items = [{ dictName: names[0], tier: 1 }].concat(withOutside ? [{ dictName: names[1], tier: 2 }] : []);
					effPersonItems = () => items;
					const c = document.createElement('canvas'); c.width = 1000; c.height = 400;
					c._sourcePlacements = [{ fileIndex: 0, srcY0: 0, srcY1: 250, outY0: 0 }, { fileIndex: 1, srcY0: 50, srcY1: 250, outY0: 250 }];
					devGeometry = [];
					const e = drawEffIconsOnPerson(c, 0, run, imgs);
					return { placed: e.placed, wanted: e.wanted, drawn: e.drawn, log: devGeometry.filter((l) => /^\[蹄鉄\]/.test(l)) };
				};
				return { one: drawOnce(false), two: drawOnce(true) };
			});
			assert(r.one.drawn && r.one.placed === 1 && r.two.placed === 1, '前提: 同じ行が2枚に写っても蹄鉄は1つだけ置き、結合画像の外の行には置かない（置く数は前と同じ）', r);
			assert(r.one.log.length === 1 && /置いた 1 \/ 置きたかった行 1（/.test(r.one.log[0]) && r.one.wanted === 1,
				'同じ行が2枚に写っただけなら「置いた 1 / 置きたかった行 1」（前は「1 / 2」）', r.one);
			assert(r.two.log.length === 1 && /置いた 1 \/ 置きたかった行 2（/.test(r.two.log[0]) && r.two.wanted === 2,
				'結合画像の外の行があるときは「置いた 1 / 置きたかった行 2」（前は 3）', r.two);
		} finally { await sp.page.context().close(); }
	});
}
