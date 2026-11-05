// T107（2026-11-05 回答 301・C-308）: 緑因子（継承固有）の読み取りに足した「緑の値の濃淡」の段の検査。
// run-smoke.mjs の末尾から register118() で呼ばれる（塊の見出しはすべて「T107」で始まる。`npm run test:visual -- --only=T107` で回せる）。
// 実物の読み（動画の祖A1）は tests/ocr/run-green-tests.mjs が見る（OCR と CDN が要るのでここでは回さない）。ここでは偽の OCR で段の順番と切り出しを見る。
const NAMES = ['萌到讓我活過來了！', '夏空ハレーション', '勝利の鼓動', '烈華の洗礼', '灯穂'];

// 緑の値（G）と青の値（B）で明暗が逆になる欄を作り、readGreenFactor を偽の OCR で呼ぶ
async function runRead(page, scripts) {
	return page.evaluate(async ({ NAMES, scripts }) => {
		const c = document.createElement('canvas'); c.width = 600; c.height = 200;
		const g = c.getContext('2d');
		g.fillStyle = 'rgb(140,207,50)'; g.fillRect(0, 0, 600, 200);
		// 文字の代わりの塊: 左は G が高く B が低い。右は G が低く B が高い
		g.fillStyle = 'rgb(255,255,50)'; g.fillRect(100, 50, 100, 30);
		g.fillStyle = 'rgb(140,207,246)'; g.fillRect(300, 50, 100, 30);
		const L = { imageData: g.getImageData(0, 0, 600, 200), W: 600, H: 200, h: 70, top: 40, x0: 40, x1: 480 };
		const orig = { load: loadImage, base: toBaseCanvas, q: assessImageQuality, layout: findGreenFactorLayout, stars: greenFactorStars, names: greenUniqueNames };
		loadImage = async () => c; toBaseCanvas = (x) => x; assessImageQuality = () => ({ ok: true }); findGreenFactorLayout = () => L; greenFactorStars = () => 2; greenUniqueNames = () => NAMES;
		const out = [];
		try {
			for (const texts of scripts) {
				const seen = [];
				const worker = { recognize: async (cv) => { seen.push(cv); return { data: { text: texts[seen.length - 1] || '' } }; } };
				const r = await readGreenFactor(worker, [new File([], 'x.png')]);
				out.push({ name: r.name, stars: r.stars, texts: r.texts, calls: seen.length, heights: seen.map((s) => s.height) });
				if (seen[2]) {
					const ctx = seen[2].getContext('2d');
					const k = (seen[2].height - 48) / (L.h * 0.68 + 1);
					const at = (x, y) => ctx.getImageData(24 + Math.round((x - 93) * k), 24 + Math.round((y - 46) * k), 1, 1).data[0];
					out[out.length - 1].grayLeft = at(150, 65); out[out.length - 1].grayRight = at(350, 65); out[out.length - 1].grayBase = at(250, 65);
				}
			}
		} finally {
			loadImage = orig.load; toBaseCanvas = orig.base; assessImageQuality = orig.q; findGreenFactorLayout = orig.layout; greenFactorStars = orig.stars; greenUniqueNames = orig.names;
		}
		return out;
	}, { NAMES, scripts });
}

export async function register118(env) {
	const { block, browser, base, openPage } = env;
	const assert = (label, cond, extra) => env.assert(cond, 'T107 緑因子 ' + label, extra);
	const NG = 'グチャグチャ1', NG2 = 'メチャクチャ2';

	await block('T107 緑因子の読み: 境の2段で決まらないときだけ緑の値の濃淡で読む（special・exam）', async () => {
		const sources = {};
		for (const file of ['special.html', 'exam.html']) {
			const { page, errors, ctx } = await openPage(browser, base, file);
			const [first, second, third, fourth, loose] = await runRead(page, [
				['夏空ハレーション'],                        // 1段目で決まる
				[NG, '夏空八レーション'],                    // 2段目で決まる
				[NG, NG2, '萌到譲我活遇來了'],               // 緑の値の1つ目で決まる（差 2/8）
				[NG, NG2, NG, '萌到諷我活遇來了'],           // 緑の値の2つ目で決まる
				[NG, NG2, '請到護我活遇格了', '疎到譚我活遇格了'], // 差 4/8 はゆるめないので決めない
			]);
			assert(file + ' 1段目で決まれば OCR は1回', first.name === NAMES[1] && first.calls === 1, JSON.stringify(first));
			assert(file + ' 2段目で決まれば OCR は2回', second.name === NAMES[1] && second.calls === 2, JSON.stringify(second));
			assert(file + ' 緑の値の1つ目で決まれば OCR は3回', third.name === NAMES[0] && third.calls === 3 && third.stars === 2, JSON.stringify(third));
			assert(file + ' 緑の値の2つ目で決まれば OCR は4回', fourth.name === NAMES[0] && fourth.calls === 4, JSON.stringify(fourth));
			assert(file + ' 差 4/8 の読みでは名前を決めない（OCR は4回まで）', loose.name === null && loose.calls === 4 && loose.texts.length === 4, JSON.stringify(loose));
			// 切り出しの高さ: 上下の余白 48 を除いて 96・128
			assert(file + ' 緑の値の切り出しの高さは 96・128', Math.abs(loose.heights[2] - 48 - 96) <= 2 && Math.abs(loose.heights[3] - 48 - 128) <= 2, JSON.stringify(loose.heights));
			// 緑の値で読む: G が高い塊だけ黒い。B が高いだけの塊は白い
			assert(file + ' 緑の値が高い所は黒い', loose.grayLeft < 60, String(loose.grayLeft));
			assert(file + ' 青の値が高いだけの所は白いまま', loose.grayRight > 200, String(loose.grayRight));
			assert(file + ' 地は白い', loose.grayBase > 200, String(loose.grayBase));
			assert(file + ' コンソールのエラーが無い', errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m)).length === 0, errors.join(' / '));
			sources[file] = await page.evaluate(() => greenFactorGrayCanvas.toString().replace(/\r\n/g, '\n'));
			await ctx.close();
		}
		assert('exam の切り出しは special の写しと同じ', sources['special.html'] === sources['exam.html']);
	});
}
