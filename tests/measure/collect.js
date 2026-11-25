(() => {
	// DG09：画面に見えている文字つきの部品を、文字をかぎにして集める（製品と見本で同じ道具を使う）
	const out = [], vw = innerWidth, vh = innerHeight;
	const pid = new WeakMap(); let pn = 0;
	const idOf = (e) => { if (!e) return -1; if (!pid.has(e)) pid.set(e, ++pn); return pid.get(e); };
	const shown = (e) => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; if (x.hidden) return false; } return true; };
	const CTL = 'button, a, label, select, summary, [role="tab"], [role="radio"], [role="button"], th, .b, .pick, .uma-btn';
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	const seenEl = new Set();
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (!t) continue;
		const e = n.parentElement; if (!e || /^(SCRIPT|STYLE|OPTION|TITLE|NOSCRIPT|TEMPLATE)$/.test(e.tagName)) continue;
		if (e.closest('.mockbar')) continue;
		if (!shown(e)) continue;
		const rg = document.createRange(); rg.selectNodeContents(n);
		const rects = Array.from(rg.getClientRects()).filter(r => r.width > 0.5 && r.height > 0.5);
		if (!rects.length) continue;
		const tops = []; rects.forEach(r => { if (!tops.some(y => Math.abs(y - r.top) < r.height * 0.6)) tops.push(r.top); });
		const br = rg.getBoundingClientRect();
		const cx = Math.min(Math.max(br.left + Math.min(br.width / 2, 6), 0), vw - 1), cy = br.top + Math.min(br.height / 2, 8);
		let hit = null;
		if (cy >= 0 && cy < vh && br.left < vw && br.right > 0) { const top = document.elementFromPoint(cx, cy); hit = !!top && (top === e || e.contains(top) || top.contains(e)); }
		const ctl = e.closest(CTL) || e;
		const c = getComputedStyle(ctl), ce = getComputedStyle(e), cr = ctl.getBoundingClientRect();
		const clipEl = [e, ctl].find(x => { const s = getComputedStyle(x); return (s.overflowX === 'hidden' || s.overflowX === 'clip') && x.scrollWidth > x.clientWidth + 1; });
		out.push({ t: t.slice(0, 40), tag: ctl.tagName.toLowerCase(), cls: String(ctl.className && ctl.className.baseVal !== undefined ? ctl.className.baseVal : ctl.className).slice(0, 60), isCtl: ctl !== e || e.matches(CTL), dis: ctl.disabled === true || ctl.getAttribute('aria-disabled') === 'true',
			lines: tops.length, x: Math.round(br.left), y: Math.round(br.top), tw: Math.round(br.width), hit, clip: !!clipEl, offR: br.right > vw + 1,
			w: Math.round(cr.width * 10) / 10, h: Math.round(cr.height * 10) / 10, rad: parseFloat(c.borderTopLeftRadius) || 0, bgi: c.backgroundImage === 'none' ? '' : c.backgroundImage.slice(0, 60), bg: c.backgroundColor,
			bd: (parseFloat(c.borderTopWidth) || 0) > 0 && c.borderTopStyle !== 'none' ? c.borderTopColor : '', bdb: (parseFloat(c.borderBottomWidth) || 0) > 0 && c.borderBottomStyle !== 'none' ? c.borderBottomColor : '', col: ce.color, fs: ce.fontSize, fw: ce.fontWeight, op: c.opacity, ws: ce.whiteSpace,
			par: idOf(ctl.parentElement), self: idOf(ctl) });
	}
	// select の見えている値
	document.querySelectorAll('select').forEach(s => { if (!shown(s)) return; const r = s.getBoundingClientRect(); if (r.width < 1) return; const c = getComputedStyle(s); const o = s.options[s.selectedIndex];
		out.push({ t: (o ? o.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 40), tag: 'select', cls: String(s.className).slice(0, 60), isCtl: true, dis: s.disabled, lines: 1, x: Math.round(r.left), y: Math.round(r.top), tw: 0, hit: null, clip: false, offR: r.right > vw + 1,
			w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, rad: parseFloat(c.borderTopLeftRadius) || 0, bgi: '', bg: c.backgroundColor, bd: c.borderTopColor, bdb: c.borderBottomColor, col: c.color, fs: c.fontSize, fw: c.fontWeight, op: c.opacity, ws: c.whiteSpace, par: idOf(s.parentElement), self: idOf(s) }); });
	// 前面の窓：画面の格子の点ごとに、いちばん上の部品から「固定で置かれた親」をたどって集める
	const pops = new Map();
	for (let gy = 1; gy < 12; gy++) for (let gx = 1; gx < 8; gx++) {
		const e0 = document.elementFromPoint(vw * gx / 8, vh * gy / 12); if (!e0 || e0.closest('.mockbar')) continue;
		let top = null;
		for (let x = e0; x && x !== document.body && x.nodeType === 1; x = x.parentElement) { const c = getComputedStyle(x); if (c.position === 'fixed' || x.tagName === 'DIALOG') top = x; }
		if (!top) continue;
		// 固定の親が地（うしろの幕）なら、その中のいちばん大きい箱を窓とみなす
		let box = top; const tr = top.getBoundingClientRect();
		if (tr.width >= vw - 1 && tr.height >= vh - 1) { for (let x = e0; x && x !== top; x = x.parentElement) { const r = x.getBoundingClientRect(), c = getComputedStyle(x); const m = /rgba?\(([^)]+)\)/.exec(c.backgroundColor); const al = m ? (m[1].split(',').length > 3 ? parseFloat(m[1].split(',')[3]) : 1) : 0; if (al > 0.9 && r.width > 150 && r.height > 60) box = x; } }
		pops.set(box, (pops.get(box) || 0) + 1);
	}
	const pop = Array.from(pops.entries()).map(([e, n]) => { const r = e.getBoundingClientRect(); return { n, t: Math.round(r.top), b: Math.round(vh - r.bottom), l: Math.round(r.left), r: Math.round(vw - r.right), w: Math.round(r.width), h: Math.round(r.height), full: r.width >= vw - 1 && r.height >= vh - 1, rad: getComputedStyle(e).borderTopLeftRadius }; }).filter(p => p.w * p.h > vw * vh * 0.06).sort((x, y) => y.n - x.n).slice(0, 3);
	// T216（部品の地図）: この画面に見えている部品のクラス・id と、「クラス → その中にある id」。window.__wantParts のときだけ集める（測りが重くならないよう、各組の最初の幅だけ）
	let parts = null;
	if (window.__wantParts) {
		const cls = new Set(), ids = new Set(), contains = {};
		const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
		const els = Array.from(document.body.querySelectorAll('*')).filter((e) => !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(e.tagName) && !e.closest('.mockbar'));
		for (const e of els) {
			if (!vis(e)) continue;
			if (e.id) ids.add(e.id);
			const cl = typeof e.className === 'string' ? e.className.split(/\s+/).filter(Boolean) : [];
			cl.forEach((c) => cls.add(c));
			if (cl.length) {
				const inner = Array.from(e.querySelectorAll('[id]')).filter(vis).map((x) => x.id).slice(0, 60);
				if (inner.length) cl.forEach((c) => { const s = (contains[c] = contains[c] || new Set()); inner.forEach((i) => s.add(i)); });
			}
		}
		parts = { classes: Array.from(cls).sort(), ids: Array.from(ids).sort(), contains: Object.fromEntries(Object.entries(contains).map(([k, v]) => [k, Array.from(v).sort()])) };
	}
	return { vw, vh, sx: document.documentElement.scrollWidth - document.documentElement.clientWidth, n: out.length, items: out, pop, parts };
})()
