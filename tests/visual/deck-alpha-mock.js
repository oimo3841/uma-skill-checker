/* tests/visual/deck-alpha-mock.js — 新しい Deck の α版（deck-alpha.html）の検査用の仮のデータ（T88）。製品のページは読まない。
 * 検査が page.addScriptTag で入れて、window.__deckAlphaMock から呼ぶ。中身はモック版13（lab/deck-v13/deck-v13-core.js の makeMock と
 * deck-v13-register.js の mockOcr）の写し（同じ種から同じ親を作るので、版13 と同じ値で見比べられる）。C-275 の 5 で製品から外したものを、検査の側に移した。
 *   makeMock(n, seed) … 親 n 人の文書（store.replaceAll に渡す）
 *   makeSend(c, doc)   … UmaStar から送られた形（受け取りの口 'umaDeck:send' の JSON。c は a|b|c|d|e。版13 の register.html?case= と同じ場面）
 */
(function () {
	'use strict';
	const K = window.DeckAlpha;
	const { SK, D, RACES, STYLE, BLUE, DIST, GENES, newRaceSet, newArcSet, setCond, addSend } = K;
	const SCHEMA = 2;
	/* ---------- 乱数（決まった種で同じ仮のデータを作る） ---------- */
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

	/* ---------- 仮のデータ（親 n 人） ---------- */
	// レースのセット（一覧の行）と、前からある終了レースのカテゴリ。race-0001 は一覧の selectable: false の行なので、開くと「終了レース：中距離」へ付け替わる
	const MOCK_SETS = [
		{ race: 'race-0002', style: 'sashi', w: 3, sends: 2 },
		{ race: 'race-0003', style: 'senko', w: 2, sends: 1 },
		{ race: 'race-0004', style: 'nige', w: 2, sends: 1 },
		{ race: 'race-0005', style: 'oikomi', w: 1, sends: 1 },
		{ race: 'race-0001', style: 'senko', w: 2, sends: 1 },
		{ arc: 'mile', style: 'sashi', w: 1 },
	];
	function mockPool(r) {
		// 表に出るスキルの母集団（約110種）: シナリオスキル・サポカ外・距離や脚質の札のあるスキルから・シナリオ因子
		const all = [...SK.values()];
		const sc = all.filter((s) => s.cat === 'scenario'), out = all.filter((s) => s.cat === 'outside');
		const tagged = all.filter((s) => s.cat === 'other' && (s.dist.length || s.style.length)).slice();
		for (let i = tagged.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [tagged[i], tagged[j]] = [tagged[j], tagged[i]]; }
		const fac = all.filter((s) => s.cat === 'factor').slice(0, 8);
		return sc.concat(out, tagged.slice(0, 60), fac);
	}
	function makeMock(n, seed) {
		const r = rng(seed || 11);
		const pool = mockPool(r);
		// よく育てる衣装（本育成設計の衣装が重なるように、8割はこの30衣装から）
		const cos = D.costumes, fav = []; while (fav.length < 30) { const c = cos[Math.floor(r() * cos.length)]; if (!fav.includes(c)) fav.push(c); }
		const pickCos = () => r() < .8 ? fav[Math.floor(r() * fav.length)] : cos[Math.floor(r() * cos.length)];
		const sets = MOCK_SETS.map((m) => { const s = m.race ? newRaceSet(RACES.get(m.race)) : newArcSet(m.arc); return { m, s, cond: setCond(s) }; });
		const wsum = MOCK_SETS.reduce((a, m) => a + m.w, 0);
		const pickSet = () => { let x = r() * wsum; for (const o of sets) { x -= o.m.w; if (x < 0) return o; } return sets[0]; };
		const parents = [];
		const styles = Object.keys(STYLE);
		const skillsFor = (c, st, rich) => {
			const o = {};
			pool.forEach((s) => {
				let p = s.cat === 'scenario' ? .2 : s.cat === 'outside' ? .15 : s.cat === 'factor' ? .12 : .07;
				if (s.dist.length) p = c.dist && s.dist.includes(c.dist) ? p + .35 : p * .4;
				if (s.style.length) p = s.style.includes(st) ? p + .3 : p * .5;
				if (s.surface.length) p = c.surface && s.surface.includes(c.surface) ? p + .2 : p * .4;
				if (rich) p = Math.min(.85, p * 1.7);
				if (r() >= p) return;
				o[s.id] = r() < .03 ? -1 : (() => { const q = r(); return q < .5 ? 1 : q < .85 ? 2 : 3; })();
			});
			return o;
		};
		const genesFor = (c, st) => {
			const q = r(); const cnt = q < .25 ? 0 : q < .6 ? 1 : q < .85 ? 2 : 3;
			const want = ['ap-' + (c.surface || 'turf'), 'ap-' + (c.dist || 'medium'), 'ap-' + st];
			const ids = [...GENES.keys()]; const o = {}; let guard = 0;
			while (Object.keys(o).length < cnt && guard++ < 20) { const k = r() < .7 ? want[Math.floor(r() * 3)] : ids[Math.floor(r() * ids.length)]; if (!(k in o)) o[k] = 1 + Math.floor(r() * 3); }
			return o;
		};
		const blueFor = () => [Object.keys(BLUE)[Math.floor(r() * 5)], 1 + Math.floor(r() * 3)];
		const redFor = (c, st) => [r() < .55 ? (c.dist || 'medium') : r() < .5 ? st : r() < .5 ? (c.surface || 'turf') : Object.keys(DIST)[Math.floor(r() * 4)], 1 + Math.floor(r() * 3)];
		const today = new Date(2026, 10, 2);
		for (let j = 0; j < n; j++) {
			const o = r() < .05 ? null : pickSet(); // 5% は「指定なし」で登録
			const c = o ? o.cond : { dist: Object.keys(DIST)[Math.floor(r() * 4)], surface: 'turf' };
			const st = o && r() < .6 ? o.m.style : styles[Math.floor(r() * 4)];
			const owner = r() < .1 ? 'friend' : 'self';
			const ps = o ? [o.s.id] : [];
			if (o && r() < .15) { const o2 = pickSet(); if (o2 !== o) ps.push(o2.s.id); }
			const tags = { style: [st] };
			if (r() < .2) { const s2 = styles[Math.floor(r() * 4)]; if (s2 !== st) tags.style.push(s2); }
			const daysAgo = Math.floor((n - 1 - j) * (60 / Math.max(1, n)) + r() * 1.5);
			const d = new Date(today); d.setDate(d.getDate() - daysAgo);
			const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
			const cc = pickCos();
			const p = { id: 'p' + (j + 1), uma: cc.id, date, no: 1, owner, sets: ps, tags, blue: blueFor(), red: redFor(c, st), green: 1 + Math.floor(r() * 3), skills: skillsFor(c, st, owner === 'friend'), genes: genesFor(c, st), gp: [] };
			if (r() < .04) p.blue = null; // 読めなかった例
			if (r() < .03) p.green = -1;
			for (let k = 0; k < 2; k++) {
				const cand = parents.filter((x) => x.owner === 'friend');
				if (cand.length && r() < .4) p.gp.push({ link: cand[Math.floor(r() * cand.length)].id });
				else if (parents.length && r() < .2) p.gp.push({ link: parents[Math.floor(r() * parents.length)].id });
				else {
					const c2 = pickCos();
					const sk = skillsFor(c, st, false); Object.keys(sk).forEach((id) => { if (r() < .4) delete sk[id]; });
					p.gp.push({ uma: r() < .05 ? null : c2.id, blue: blueFor(), red: redFor(c, st), green: 1 + Math.floor(r() * 3), skills: sk, genes: genesFor(c, st) });
				}
			}
			parents.push(p);
		}
		// 同じ日の管理番号（登録順）
		const byDate = {}; parents.forEach((p) => (byDate[p.date] = byDate[p.date] || []).push(p));
		Object.values(byDate).forEach((a) => a.forEach((p, k) => { p.no = k + 1; }));
		// セットごとのスキルの一覧（UmaStar の②から送られた想定。40種前後）。sends: 2 のセットは、1回目と2回目で一部が入れ替わる
		const listFor = (c, k) => { const sc = pool.filter((s) => s.cat === 'scenario'), out = pool.filter((s) => s.cat === 'outside'); const tg = pool.filter((s) => s.cat === 'other' && ((c.dist && s.dist.includes(c.dist)) || (c.surface && s.surface.includes(c.surface)))); return sc.concat(out, tg).map((s) => s.id).slice(k * 6, k * 6 + 40); };
		sets.forEach((o) => { const sends = o.m.sends || 1; for (let k = 0; k < sends; k++) addSend(o.s, listFor(o.cond, k)); });
		return { format: 'uma-deck', schema: SCHEMA, tool: 'star', savedAt: null, data: D.versions, next: n + 1, sets: sets.map((o) => o.s), parents, plans: {} };
	}

	/* ---------- 仮の OCR の結果（T73 の形: 青・赤・緑と★、白スキルと★、遺伝子） ---------- */
	function makeSend(c, doc) {
		const r = rng(c.charCodeAt(0) * 31 + 7);
		const pool = [...K.SK.values()].filter((s) => s.cat !== 'factor');
		const pick = (n) => { const o = {}; let guard = 0; while (Object.keys(o).length < n && guard++ < 500) { const s = pool[Math.floor(r() * pool.length)]; o[s.id] = 1 + Math.floor(r() * 3); } return o; };
		const cos = K.D.costumes;
		const person = (uma, extra) => Object.assign({ uma, green: [K.uniqName(uma), 1 + Math.floor(r() * 3)], blue: ['speed', 3], red: ['long', 2], skills: pick(12 + Math.floor(r() * 6)), genes: { 'ap-long': 2, 'ap-sashi': 1 }, greenCands: null }, extra || {});
		// UmaStar から一緒に送るもの: 今選んでいるレース・①の脚質（親の脚質の札の初期値）・②のスキルの一覧（40種前後。今のセットの一覧と一部が入れ替わる）
		const sendFor = (raceId) => { const rc = K.RACES.get(raceId); if (!rc) return []; const dist = rc.distanceCategory, sf = rc.surface; const all = [...K.SK.values()];
			const a = all.filter((s) => s.cat === 'scenario').concat(all.filter((s) => s.cat === 'outside'), all.filter((s) => s.cat === 'other' && (s.dist.includes(dist) || s.surface.includes(sf)))).map((s) => s.id);
			return a.slice(10, 50); };
		const at = { a: ['race-0002', 'sashi'], b: ['race-0002', 'sashi'], c: ['race-0004', 'nige'], d: ['race-0003', 'senko'], e: [null, 'sashi'] }[c] || ['race-0002', 'sashi'];
		const race = at[0], style = at[1], send = race ? sendFor(race) : [];
		// 受け取りの口の形（js/deck-alpha-register.js の冒頭）。フレンドの場面（d）は owner で送る（版13 は場面の文字で決めていた）
		const ret = (persons) => ({ format: 'uma-deck-send', v: 1, sentAt: new Date().toISOString(), from: 'star', race, style, send, owner: c === 'd' ? 'friend' : 'self', persons });
		if (c === 'b') {
			// 祖1: 登録済みの親（フレンド）と衣装・白スキル・★が全部同じ → 「同一」を選んだ状態。祖2: 同じ衣装の登録済みの親が2人以上いて、白スキルが少し違う → 候補の行を並べて選ぶ
			const byUma = {}; doc.parents.forEach((p) => (byUma[p.uma] = byUma[p.uma] || []).push(p));
			const ex1 = doc.parents.slice().reverse().find((p) => p.owner === 'friend') || doc.parents[doc.parents.length - 1];
			const ex2 = doc.parents.slice().reverse().find((p) => p !== ex1 && p.uma !== ex1.uma && byUma[p.uma].length >= 2 && Object.keys(p.skills).length >= 8) || doc.parents[0];
			const sk2 = Object.assign({}, ex2.skills); Object.keys(sk2).slice(0, 2).forEach((id) => delete sk2[id]); const add = pool[3]; sk2[add.id] = 2;
			return ret([person(cos[20].id), person(ex1.uma, { blue: ex1.blue, red: ex1.red, green: [K.uniqName(ex1.uma), ex1.green], skills: Object.assign({}, ex1.skills), genes: Object.assign({}, ex1.genes) }), person(ex2.uma, { blue: ex2.blue, red: ex2.red, green: [K.uniqName(ex2.uma), ex2.green], skills: sk2, genes: Object.assign({}, ex2.genes) })]);
		}
		if (c === 'c') {
			const u = cos[45]; const sk = pick(14); const ids = Object.keys(sk); sk[ids[1]] = -1; sk[ids[4]] = -1;
			return ret([person(null, { green: [null, 2], greenCands: [u.uniq[u.uniq.length - 1], cos[46].uniq[0], cos[47].uniq[0]], blue: ['power', -1], red: null, skills: sk })]);
		}
		return ret([person(cos[c === 'd' ? 77 : c === 'e' ? 30 : 10].id)]);
	}

	window.__deckAlphaMock = { makeMock, makeSend, rng };
})();
