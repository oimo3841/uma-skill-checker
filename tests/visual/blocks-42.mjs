// 区間バーの数字（各区間の個数）の見え方（2026-10-21・C-183）の検査。run-smoke.mjs の末尾から register42() で呼ばれる
// （塊の見出しはすべて「C-183」で始まる。`npm run test:visual -- --only=C-183` で回せる）。
//
// 決め（おいもさん・モックで比較して案B2）:
//  1. 文字 14px・太さ500・濃いグレー #2b3140・外側に白の縁 2.5px（paint-order: stroke fill ＋ -webkit-text-stroke）。白の太字・影は廃止。
//  3. 色はトークン（--exam-eff-seg-n / --exam-eff-seg-n-edge）で、ライト・ダークとも同じ値。OFF の区間も同じ指定。
//  4. 「狭ければ非表示」（区間の幅 < 数字の幅＋8px）の判定は変えない。

export async function register42(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));

	const openExam = async (o = {}) => {
		const r = await openPage(browser, base, 'exam.html', { width: o.w || 1280, height: o.h || 900 });
		const page = r.page;
		await page.evaluate((theme) => { try { localStorage.setItem('uma-tools-theme', theme); } catch (e) {} }, o.theme || 'light');
		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForTimeout(400);
		if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
		await page.evaluate(() => selectStepTab(1));
		await page.waitForFunction(() => !!effValueById, null, { timeout: 15000 });
		await page.click('label[for="scope-mode-efficiency"]', { position: { x: 6, y: 6 } });
		await page.waitForFunction(() => !!effData && document.querySelectorAll('.eff-seg').length === 4, null, { timeout: 15000 });
		await page.waitForTimeout(300);
		return r;
	};
	const readStyle = (page) => page.evaluate(() => [...document.querySelectorAll('.eff-seg')].map((s) => {
		const n = s.querySelector('.eff-seg-n'), cs = getComputedStyle(n);
		return { on: s.getAttribute('data-on'), color: cs.color, size: cs.fontSize, weight: cs.fontWeight, shadow: cs.textShadow,
			stroke: cs.webkitTextStrokeWidth + ' ' + cs.webkitTextStrokeColor, order: cs.paintOrder, hidden: n.hidden };
	}));
	const tok = (page) => page.evaluate(() => ['--exam-eff-seg-n', '--exam-eff-seg-n-edge'].map((k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim()));
	const STROKE = '2.5px rgb(255, 255, 255)';

	await block('C-183 区間バーの数字: 14px・太さ500・濃いグレー・白の縁2.5px（外側だけ）・影なし。ライト・ダーク・OFF の区間とも同じ指定・トークン', async () => {
		const seen = [];
		for (const [w, theme] of [[1280, 'light'], [1280, 'dark'], [390, 'light'], [390, 'dark'], [360, 'light'], [360, 'dark']]) {
			const { ctx, page, errors } = await openExam({ w, theme });
			const tag = w + 'px・' + theme;
			const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
			assert(attr === theme, 'C-183(' + tag + '): 前提: 画面の色が指定どおり', attr);
			for (const off of [null, 1, 3]) {
				if (off !== null) await page.evaluate((k) => { effTiers[k] = false; layoutEffPanel(); }, off);
				const st = await readStyle(page);
				const label = tag + '・' + (off === null ? '全区間ON' : '区間' + off + 'をOFF');
				assert(st.length === 4 && st.every((s) => s.color === 'rgb(43, 49, 64)' && s.size === '14px' && s.weight === '500' && s.shadow === 'none' && s.stroke === STROKE && s.order.startsWith('stroke')),
					'C-183(' + label + '): 4区間とも 文字 #2b3140・14px・太さ500・影なし・縁 2.5px 白・paint-order は stroke が先（外側だけに縁）', st);
				if (off !== null) assert(st[off].on === 'false',
					'C-183(' + label + '): 前提: 指定の区間が OFF（灰色）', st.map((s) => s.on));
				seen.push(JSON.stringify(st.map((s) => [s.color, s.size, s.weight, s.shadow, s.stroke, s.order])));
			}
			const t = await tok(page);
			assert(JSON.stringify(t) === JSON.stringify(['#2b3140', '#ffffff']), 'C-183(' + tag + '): 色はトークン（--exam-eff-seg-n・--exam-eff-seg-n-edge）で、ライト・ダークとも同じ値', t);
			assert(jsErrors(errors).length === 0, 'C-183(' + tag + '): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
		assert(new Set(seen).size === 1, 'C-183: 幅・ライト／ダーク・OFF の有無によらず、数字の指定は完全に同じ', [...new Set(seen)]);
	});

	await block('C-183 区間バーの数字: 「狭ければ非表示」の判定（区間の幅 < 数字の幅＋8px）は崩れていない。虹が最小幅のときも、入らなければ隠して真下に出す', async () => {
		for (const [w, theme] of [[1280, 'light'], [390, 'light'], [390, 'dark'], [360, 'light'], [360, 'dark']]) {
			const { ctx, page, errors } = await openExam({ w, theme });
			const shapes = [['初期', null], ['最大の側へ寄せ切り（虹が最小幅）', (n) => [n - 4, n - 3, n - 2]], ['真ん中へ寄せ', (n) => [Math.floor(n / 2) - 1, Math.floor(n / 2), Math.floor(n / 2) + 1]], ['境目1だけ最小', (n) => [0, Math.floor(n / 2), n - 2]]];
			for (const [label, fn] of shapes) {
				if (fn) await page.evaluate((src) => { const f = eval('(' + src + ')'); effBounds = f(effData.steps.length).map((i) => effData.steps[i]); layoutEffPanel(); }, fn.toString());
				const p = await page.evaluate(() => [0, 1, 2, 3].map((k) => {
					const seg = document.querySelector('.eff-seg[data-tier="' + k + '"]'), n = seg.querySelector('.eff-seg-n');
					const was = n.hidden; n.hidden = false; const nw = n.getBoundingClientRect().width; n.hidden = was;
					const u = document.querySelector('.eff-num[data-tier="' + k + '"]');
					return { hidden: n.hidden, segW: seg.getBoundingClientRect().width, nw, underHidden: u.hidden, under: u.textContent, text: n.textContent, want: effTierCount(k) };
				}));
				const tag = w + 'px・' + theme + '・' + label;
				assert(p.every((t) => t.hidden === (t.segW < t.nw + 8) && t.hidden === !t.underHidden && (t.hidden ? t.under : t.text) === String(t.want)),
					'C-183(' + tag + '): 入らない区間（幅 < 数字の幅＋8px）だけ隠して、その真下に同じ数字。入る区間は中に出す', p);
				// 縁（片側 1.25px）が区間の外にはみ出さない余裕（左右4px）の内側に収まっている
				assert(p.every((t) => t.hidden || t.segW - t.nw >= 8), 'C-183(' + tag + '): バーの中に出した数字は、左右4pxの余白に縁が収まる', p);
			}
			assert(jsErrors(errors).length === 0, 'C-183(' + w + 'px・' + theme + '): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});
}
