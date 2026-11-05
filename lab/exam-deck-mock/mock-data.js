/* lab/exam-deck-mock/mock-data.js — T104 段1 のモックの仮のデータ。親の★・因子は乱数で作った見本（実在のプレイデータではない）。
 * 親は3通り: UmaStar から登録した親（技能試験の表に出ない）／UmaExam から登録した親（sets に 'exam'）／両方に入っている親。
 * 同じ種から同じデータを作る（撮影のたびに同じ絵になる）。 */
(function () {
	'use strict';
	const K = window.DeckAlpha, D = K.D;
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	const star = (r) => { const q = r(); return q < .03 ? -1 : q < .52 ? 1 : q < .86 ? 2 : 3; };
	const pick = (r, a) => a[Math.floor(r() * a.length)];
	const BLUE = Object.keys(K.BLUE), RED = Object.keys(K.RED);
	const GENES = D.genes.map((g) => g.id);
	const others = D.skills.map((s) => s.id).filter((id) => !D.exam133.includes(id));

	function examSkills(r, p133) {
		const o = {};
		D.exam133.forEach((id) => { if (r() < p133) o[id] = star(r); });
		for (let i = 0; i < 12; i++) { const id = pick(r, others); if (r() < .7) o[id] = star(r); } // 133種の外（UmaStar の表で見える）
		return o;
	}
	function genes(r) { const o = {}; const n = Math.floor(r() * 3); for (let i = 0; i < n; i++) o[pick(r, GENES)] = 1 + Math.floor(r() * 3); return o; }
	function sheet(r) { const o = {}; const n = Math.floor(r() * 4); for (let i = 0; i < n; i++) o[pick(r, D.sheetNames)] = 1 + Math.floor(r() * 3); return o; }
	const blue = (r) => [pick(r, BLUE), 1 + Math.floor(r() * 3)];
	const red = (r) => [pick(r, RED), 1 + Math.floor(r() * 3)];
	function dateAgo(n) { const d = new Date(2026, 10, 5); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

	function makeDoc() {
		const r = rng(104);
		const cos = D.costumes;
		const fav = []; while (fav.length < 24) { const c = pick(r, cos); if (!fav.includes(c) && c.uniq.length) fav.push(c); }
		const races = D.races.filter((x) => x.selectable).slice(0, 2).map(K.newRaceSet);
		const raceSkills = D.skills.filter((s) => !s.passive && (s.dist.length || s.style.length)).slice(0, 40).map((s) => s.id);
		races.forEach((s, i) => K.addSend(s, raceSkills.slice(i * 6, i * 6 + 28)));
		const parents = [];
		let id = 1;
		const push = (o) => { const p = Object.assign({ id: 'p' + id, no: 1 }, o); id++; parents.push(p); return p; };
		// UmaStar から登録した親
		for (let i = 0; i < 16; i++) {
			const s = {}; raceSkills.forEach((x) => { if (r() < .3) s[x] = star(r); });
			push({ uma: fav[i % fav.length].id, date: dateAgo(20 + i), owner: r() < .15 ? 'friend' : 'self', sets: [races[i % races.length].id], tags: { style: [pick(r, Object.keys(K.STYLE))] }, blue: null, red: null, green: 1 + Math.floor(r() * 3), skills: s, genes: genes(r), gp: [] });
		}
		// UmaExam から登録した親（6割は祖2人つき）
		const examIds = [];
		for (let i = 0; i < 22; i++) {
			const withGp = i < 6 || r() < .6;
			const gp = withGp ? [0, 1].map(() => ({ uma: pick(r, fav).id, blue: blue(r), red: red(r), green: 1 + Math.floor(r() * 3), skills: examSkills(r, .16), genes: genes(r), sheet: sheet(r) })) : [];
			const sets = ['exam']; if (r() < .15) sets.push(races[0].id);
			const p = push({ uma: fav[(i * 5 + 3) % fav.length].id, date: dateAgo(i), owner: r() < .1 ? 'friend' : 'self', sets, tags: { style: [] }, blue: blue(r), red: red(r), green: 1 + Math.floor(r() * 3), skills: examSkills(r, .2 + r() * .12), genes: genes(r), sheet: sheet(r), gp });
			examIds.push(p.id);
		}
		const byDate = {}; parents.forEach((p) => { (byDate[p.date] = byDate[p.date] || []).push(p); });
		Object.values(byDate).forEach((a) => a.forEach((p, k) => { p.no = k + 1; }));
		const exam = K.newExamList(); K.addSend(exam, D.exam133);
		// 本育成設計の見本: 祖つきの先頭の2人の6人
		const a = parents.find((p) => p.id === examIds[0]), b = parents.find((p) => p.id === examIds[1]);
		const plans = { exam: { slots: [a.uma, a.gp[0].uma, a.gp[1].uma, b.uma, b.gp[0].uma, b.gp[1].uma], applied: false } };
		return { format: 'uma-deck', schema: 2, tool: 'star', savedAt: null, data: D.versions, next: id, sets: races, parents, plans, exam };
	}

	K.seedMock = async function () {
		const doc = makeDoc();
		await K.store.replaceAll(doc);
		await K.store.putMeta('seeded', true);
		await K.store.putMeta('settings', Object.assign({}, K.DEFAULT_SETTINGS, { cur: doc.sets[0].id, lastExport: '2026-11-04T00:00:00+09:00', mode: 'exam' }));
	};
	/** 撮影用: 親A・親Bの見本（UmaExam は本育成設計の6人の親。UmaStar は先頭の2人） */
	K.mockPair = function (doc, M, mode) {
		if (mode === 'exam') { const ps = doc.parents.filter((p) => p.sets.includes('exam')); return [ps[0].id, ps[1].id]; }
		const ps = doc.parents.filter((p) => p.sets.length && !p.sets.includes('exam')); return [ps[0].id, ps[1].id];
	};
	/** UmaExam の「Deck (αテスト)に送る」の中身の見本（js/deck-alpha-register.js の受け取りの口に from・send・sheet を足した形）。
	 * 親A は登録済みの親と同じ衣装（「同一」の候補が出る）・祖A1 は緑因子が決まらない・祖A2 は青因子が読めなかった */
	K.mockSend = function (doc) {
		const r = rng(2104);
		const base = doc.parents.find((p) => !p.sets.includes('exam'));
		const c0 = K.costume(base.uma);
		const unames = D.costumes.filter((c) => c.uniq.length && c.id !== base.uma).slice(0, 40).map((c) => c.uniq[c.uniq.length - 1]);
		return {
			format: 'uma-deck-send', v: 1, sentAt: '2026-11-05T12:00:00+09:00', from: 'exam', race: null, style: null, send: D.exam133.slice(), owner: 'self',
			persons: [
				{ uma: null, green: [c0.uniq[c0.uniq.length - 1], 2], greenCands: null, blue: ['speed', 3], red: ['medium', 2], skills: examSkills(r, .28), genes: { 'ap-turf': 2 }, sheet: sheet(r) },
				{ uma: null, green: [null, 1], greenCands: [unames[3], unames[11], unames[23]], blue: ['stamina', 2], red: ['sashi', -1], skills: examSkills(r, .2), genes: {}, sheet: sheet(r) },
				{ uma: null, green: [unames[30], 3], greenCands: null, blue: [null, 1], red: ['turf', 3], skills: examSkills(r, .22), genes: { 'ap-medium': 1 }, sheet: sheet(r) },
			],
		};
	};
})();
