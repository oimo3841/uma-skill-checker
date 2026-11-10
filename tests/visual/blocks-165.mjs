// T162（2026-11-10・決定 660・652）: UmaStar の同点の行を、並びで決まらないときだけ読みの最後の字の形で決める直しの検査。
// run-smoke.mjs の末尾から register165() で呼ばれる（塊の見出しはすべて「T162」で始まる。`npm run test:visual -- --only=T162` で回せる）。
//
// 直したこと（special.html だけ。凍結の common.js・core は変えていない）:
//  - 同点で捨てた行のうち、並び（pickTiedRowsByGameOrder）でも決まらなかった行で、生存候補が「最後の1字だけが違う組」のときに、
//    読みの最後の字の形（TIED_LAST_CHAR_SHAPES。貝のつく字 → 賢・辶のつく字 → 速）で候補を絞り、当たるものがちょうど1つなら採る
//    （pickTiedByLastCharShape）。となりの行が決まっていれば、並びの間の候補の中だけで絞る。
// 検査は OCR を使わず、作った行（rowKey 付き）を matchWithAllSkillNames に渡して見る（T157 の blocks-160 と同じ形）。
//  (1) 並びで決まらない同点（上下なし・上下が組の全部をはさむ）で、最後の字が表の字なら、表の先の字で終わる候補が出る（両方の向き）。
//  (2) 形が当たる候補が0（表に無い字・当たる候補が別の行で出ていて外れた）なら出ない。2つ以上なら採らない（関数で直接見る）。
//  (3) 最後の1字だけが違う組でない同点には効かない（別の位置が違う組の行・組でない名前の取り合わせ）。
//  (4) 並びで決まる行は今までどおり並びで決まる（字の形が別の候補を指しても並びが先）。
// T163（2026-11-10・決定 664）: 速 の字を部首 162（辵・辶）のすべての漢字に広げた。塊 (5) の見出しは「T163」で始まる
//  （`--only=T163` で回せる）。
//  (5) 表の字数と重なり・新しく入った字（道・進・範囲の端・拡張 B。遠 は正規化で 速 になるので表と関数で）で 速 に決まる・辶でも貝でもない字（翌・鏈）では決まらない。
// スキル名・字は検査の側に書かない（恒久ルール1。データと製品の表から選ぶ）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register165(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

	const openSp = async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, EMPTY);
		await sp.page.evaluate(() => { localStorage.setItem('umaSkillDeck:stepTab', '1'); });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => {
			await UmaSkillDeckCore.loadMasterSkills(); await UmaSkillDeckCore.loadSkillPtData(); await UmaSkillDeckCore.loadSkillEvolutions(false);
			const line = (text, rowKey, stars) => ({ text: text, conf: 90, stars: stars === undefined ? 2 : stars, starsReliable: true, rowKey: rowKey });
			const setScope = (ids) => { onDeckScopeSelected({ skillIds: ids, name: '', tiers: {} }); allSkillNamesDict = null; };
			const match = (lines) => {
				allSkillNamesDict = null;
				const r = matchWithAllSkillNames(lines);
				return { detected: Array.from(r.detectedSkills), stars: r.skillStars, reasons: r.matchReasons,
					amb: (r.devAmbiguous || []).map((a) => ({ rowKey: a.rowKey, resolved: a.resolved, survivors: a.survivors, byOrder: a.byOrder || null, byShape: a.byShape || null })) };
			};
			// データから「最後の1字だけが違う組」で、表の先の字（賢・速 にあたる字）で終わる候補を両方持つ組を選ぶ
			const dict = allSkillNamesDictionary();
			const cmp = UmaSkillDeckCore.compareGameOrder;
			const known = (n) => { const id = allSkillIdByName.get(n); return (id !== undefined && cmp(id, '0') < 0) ? id : null; };
			const order = dict.list.filter((n) => known(n) !== null).sort((a, b) => cmp(known(a), known(b)));
			const targets = Array.from(new Set(Object.values(TIED_LAST_CHAR_SHAPES)));
			// 表の字のうち、正規化で変わらず、先の字にもならないもの（読みとして渡せる字）を先の字ごとに1つ
			const keyOf = {};
			Object.keys(TIED_LAST_CHAR_SHAPES).forEach((k) => {
				const t = TIED_LAST_CHAR_SHAPES[k];
				if (!keyOf[t] && normalizeText(k) === k && k !== t) keyOf[t] = k;
			});
			const heads = new Map();
			dict.index.forEach((s) => {
				const c = Array.from(s.norm);
				if (c.length < 4 || known(s.raw) === null) return;
				const k = c.length + '\u0000' + c.slice(0, -1).join('');
				if (!heads.has(k)) heads.set(k, []);
				heads.get(k).push(s.raw);
			});
			let group = null;
			for (const members of heads.values()) {
				if (members.length < 3) continue;
				const byTarget = {};
				targets.forEach((t) => { const m = members.filter((n) => lastLetterOf(n) === t); if (m.length === 1) byTarget[t] = m[0]; });
				if (targets.every((t) => byTarget[t] && keyOf[t])) { group = { members: members.slice().sort((a, b) => cmp(known(a), known(b))), byTarget }; break; }
			}
			window.__t162 = { line, setScope, match, order, known, keyOf, targets, group, dict };
		});
		return sp;
	};

	await block('T162 (1) 並びで決まらない同点は、読みの最後の字の形（表の字）で、その先の字で終わる候補を採る', async () => {
		const sp = await openSp();
		try {
			const r = await sp.page.evaluate(() => {
				const { line, setScope, match, order, known, keyOf, targets, group } = window.__t162;
				if (!group) return null;
				const m = group.members;
				const up = order[order.indexOf(m[0]) - 1], down = order[order.indexOf(m[m.length - 1]) + 1];
				const out = { members: m, up, down, cases: [] };
				setScope(m.map(known).concat([known(up), known(down)].filter(Boolean)));
				targets.forEach((t) => {
					const want = group.byTarget[t];
					const tieText = want.slice(0, want.length - 1) + keyOf[t];
					const solo = match([line(tieText, '0:4', 3)]);
					const wrapped = (up && down && !m.includes(up) && !m.includes(down)) ? match([line(up, '0:3'), line(tieText, '0:4', 3), line(down, '0:5')]) : null;
					out.cases.push({ t, key: keyOf[t], want, tieText, solo, wrapped });
				});
				return out;
			});
			assert(!!r, 'T162(1) データに、最後の1字だけが違い、表の先の字で終わる候補を両方持つ組がある', r);
			if (!r) return;
			for (const c of r.cases) {
				const a = c.solo.amb.find((x) => x.rowKey === '0:4');
				assert(!!a && !a.resolved && a.survivors.length >= 2 && a.byOrder && !a.byOrder.adjacent, 'T162(1) 「' + c.tieText + '」は同点で、並び（上下なし）では決まらない', a);
				assert(c.solo.detected.length === 1 && c.solo.detected[0] === c.want, 'T162(1) 上下なし: 最後の字「' + c.key + '」→「' + c.want + '」が出る', { detected: c.solo.detected, amb: a });
				assert(c.solo.stars[c.want] === 3, 'T162(1) 字の形で決めたスキルの★は同点の行の★', c.solo.stars);
				assert(!!a && a.byShape && a.byShape.last === c.key && a.byShape.picked === c.want, 'T162(1) 開発ログの同点の記録に、字の形で決めたことが残る', a && a.byShape);
				assert(/字の形/.test(c.solo.reasons[c.want] || ''), 'T162(1) 理由が「字の形で絞り込み」', c.solo.reasons[c.want]);
				assert(!!c.wrapped, 'T162(1) 組の全部をはさむ上下がデータにある', { up: r.up, down: r.down });
				if (c.wrapped) {
					const w = c.wrapped.amb.find((x) => x.rowKey === '0:4');
					assert(!!w && w.byOrder && w.byOrder.adjacent && w.byOrder.inRange.length >= 2 && !w.byOrder.picked, 'T162(1) 上下が組の全部をはさむ: 並びでは決まらない', w && w.byOrder);
					assert(c.wrapped.detected.includes(c.want) && c.wrapped.detected.length === 3, 'T162(1) 上下が組の全部をはさむ: 字の形で「' + c.want + '」が出る', c.wrapped.detected);
				}
			}
			assert(jsErrors(sp.errors).length === 0, 'T162(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T162 (2) 形が当たる候補が0（表に無い字・当たる候補が別の行で出ている）・2つ以上なら採らない', async () => {
		const sp = await openSp();
		try {
			const r = await sp.page.evaluate(() => {
				const { line, setScope, match, known, keyOf, targets, group } = window.__t162;
				if (!group) return null;
				const m = group.members;
				setScope(m.map(known));
				const t = targets[0], want = group.byTarget[t];
				const head = want.slice(0, want.length - 1);
				// 表に無い字（正規化で変わらず、組のどの最後の字でもない）
				const DUMMY = '鬱';
				const noKey = match([line(head + DUMMY, '0:4')]);
				// 当たる候補が同じ画の離れた行で出ている: 「別の行と断定」で生存候補から外れ、当たるものが0
				// （別の画の行では「別の行と断定」にならず生存候補に残る。そのときは字の形で同じスキルを指すだけで、結果は変わらない）
				const other = m.find((n) => n !== want);
				const taken = match([line(want, '0:0'), line(head + keyOf[t], '0:4')]);
				// 2つ以上（同じ名前が2回）: 関数で直接
				const two = pickTiedByLastCharShape(head + keyOf[t], m, [want, want]);
				// となりの行が決まっていて並びの間に2つ以上が入るとき、字の形の指す候補が並びの間の外なら採らない
				// （上＝組の先頭のすぐ前の名前・下＝組の3番目〔別の行で出ている〕。間は組の先頭と2番目。字の形は組の先頭・2番目でない候補を指す）
				const order = window.__t162.order;
				const up = order[order.indexOf(m[0]) - 1];
				const t2 = targets.find((tt) => ![m[0], m[1], m[2]].includes(group.byTarget[tt]));
				let outside = null;
				if (up && !m.includes(up) && m.length >= 4 && t2) {
					setScope(m.map(known).concat([known(up)]));
					const w2 = group.byTarget[t2];
					outside = { want: w2, m: match([line(up, '0:3'), line(w2.slice(0, w2.length - 1) + keyOf[t2], '0:4'), line(m[2], '0:5')]) };
				}
				return { want, other, dummyInTable: Object.prototype.hasOwnProperty.call(TIED_LAST_CHAR_SHAPES, DUMMY), noKey, taken, two, outside, inner: [m[0], m[1]] };
			});
			assert(!!r, 'T162(2) データに組がある', r);
			if (!r) return;
			assert(!r.dummyInTable, 'T162(2) 試しの字は表に無い', r.dummyInTable);
			const a0 = r.noKey.amb.find((x) => x.rowKey === '0:4');
			assert(r.noKey.detected.length === 0 && !!a0 && a0.byShape && a0.byShape.matched.length === 0 && !a0.byShape.picked, 'T162(2) 最後の字が表に無い: 出ない（今までどおり捨てる）', { detected: r.noKey.detected, amb: a0 });
			const a1 = r.taken.amb.find((x) => x.rowKey === '0:4');
			assert(!!a1 && a1.survivors.length >= 2 && !a1.survivors.includes(r.want), 'T162(2) 当たる候補が別の行で出ている: 生存候補から外れている', a1);
			assert(r.taken.detected.length === 1 && r.taken.detected[0] === r.want && !!a1 && a1.byShape && a1.byShape.matched.length === 0, 'T162(2) 当たる候補が別の行で出ている: 残りの候補を字の形で採らない', { detected: r.taken.detected, amb: a1 });
			assert(!!r.two && r.two.matched.length === 2 && r.two.picked === null, 'T162(2) 当たる候補が2つ: 採らない', r.two);
			assert(!!r.outside, 'T162(2) データから、並びの間に組の2つが入る上下と、間の外を指す表の字が選べる', r.outside);
			if (r.outside) {
				const a2 = r.outside.m.amb.find((x) => x.rowKey === '0:4');
				assert(!!a2 && a2.byOrder && a2.byOrder.adjacent && a2.byOrder.inRange.length === 2 && a2.byOrder.inRange.every((n) => r.inner.includes(n)), 'T162(2) 並びの間に組の2つが入る（並びでは決まらない）', a2 && a2.byOrder);
				assert(!r.outside.m.detected.some((n) => n === r.outside.want || r.inner.includes(n)) && !!a2 && a2.byShape && a2.byShape.matched.length === 0, 'T162(2) 字の形の指す「' + r.outside.want + '」が並びの間の外: 採らない', { detected: r.outside.m.detected, amb: a2 });
			}
			assert(jsErrors(sp.errors).length === 0, 'T162(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T162 (3) 最後の1字だけが違う組でない同点には、字の形を使わない', async () => {
		const sp = await openSp();
		try {
			const r = await sp.page.evaluate(() => {
				const { line, setScope, match, known, keyOf, targets, group, dict } = window.__t162;
				if (!group) return null;
				// 最後の字でない位置が違う組（同じ長さ・1字違い）。同点の行を作って、字の形の記録が付かないこと
				const DUMMY = '鬱';
				const pos = new Map();
				dict.index.forEach((s) => {
					const c = Array.from(s.norm);
					if (c.length < 6 || known(s.raw) === null) return;
					for (let i = 0; i < c.length - 1; i++) {
						const k = c.slice(0, i).join('') + '\u0000' + c.slice(i + 1).join('');
						if (!pos.has(k)) pos.set(k, []);
						pos.get(k).push(s.raw);
					}
				});
				let mid = null;
				for (const [k, members] of pos) {
					if (members.length < 2 || k.indexOf(DUMMY) !== -1) continue;
					const tieText = k.replace('\u0000', DUMMY);
					setScope(members.map(known));
					const m = match([line(tieText, '0:4')]);
					const a = m.amb.find((x) => x.rowKey === '0:4');
					if (!a || a.resolved || a.survivors.length < 2) continue;
					mid = { members, tieText, m, a };
					break;
				}
				// 組でない名前の取り合わせ（関数で直接）: 表の先の字で終わる名前と、別の頭の同じ長さの名前
				const t = targets[0], want = group.byTarget[t];
				const len = Array.from(normalizeText(want)).length;
				const stranger = dict.index.find((s) => Array.from(s.norm).length === len && s.norm.slice(0, -1) !== normalizeText(want).slice(0, -1));
				const mixed = stranger ? pickTiedByLastCharShape(want.slice(0, want.length - 1) + keyOf[t], [want, stranger.raw], [want, stranger.raw]) : 'none';
				const inGroup = pickTiedByLastCharShape(want.slice(0, want.length - 1) + keyOf[t], group.members, group.members);
				return { mid, stranger: stranger ? stranger.raw : null, mixed, inGroup, want };
			});
			assert(!!r, 'T162(3) データに組がある', r);
			if (!r) return;
			assert(!!r.mid, 'T162(3) データに、最後の字でない位置が違い同点になる組がある', r.mid);
			if (r.mid) {
				assert(!r.mid.a.byShape && r.mid.m.detected.length === 0, 'T162(3) 最後の字でない位置が違う組の同点: 字の形を使わず、出ない', { members: r.mid.members, detected: r.mid.m.detected, amb: r.mid.a });
			}
			assert(!!r.stranger && r.mixed === null, 'T162(3) 組でない名前の取り合わせ（頭が違う）: 字の形を使わない', { stranger: r.stranger, mixed: r.mixed });
			assert(!!r.inGroup && r.inGroup.picked === r.want, 'T162(3) 同じ読みでも、組なら字の形で決まる（比べの基準）', r.inGroup);
			assert(jsErrors(sp.errors).length === 0, 'T162(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T162 (4) 並びで決まる行は今までどおり並びで決まる（字の形が別の候補を指しても並びが先）', async () => {
		const sp = await openSp();
		try {
			const r = await sp.page.evaluate(() => {
				const { line, setScope, match, order, known, keyOf, targets, group } = window.__t162;
				if (!group) return null;
				const m = group.members;
				// 組の先頭 x を、すぐ前の並びの名前（組の外）と、組の2番目（別の行で出ている）ではさむ。字の形は x でない候補を指すようにする
				const x = m[0], up = order[order.indexOf(x) - 1], down = m[1];
				const t = targets.find((tt) => group.byTarget[tt] !== x && group.byTarget[tt] !== down);
				if (!up || m.includes(up) || !t) return { skip: { x, up, down, t } };
				const shapeWant = group.byTarget[t];
				setScope(m.map(known).concat([known(up)]));
				const tieText = x.slice(0, x.length - 1) + keyOf[t];
				const res = match([line(up, '0:3'), line(tieText, '0:4', 3), line(down, '0:5')]);
				return { x, up, down, shapeWant, tieText, res };
			});
			assert(!!r && !r.skip, 'T162(4) データから、組の1つだけを並びではさむ上下と、別の候補を指す表の字が選べる', r);
			if (!r || r.skip) return;
			const a = r.res.amb.find((x) => x.rowKey === '0:4');
			assert(!!a && a.byOrder && a.byOrder.picked === r.x, 'T162(4) 並びで「' + r.x + '」に決まる', a && a.byOrder);
			assert(r.res.detected.includes(r.x) && !r.res.detected.includes(r.shapeWant), 'T162(4) 字の形の指す「' + r.shapeWant + '」は出ない', r.res.detected);
			assert(!!a && !a.byShape, 'T162(4) 並びで決まった行には字の形の記録が付かない', a && a.byShape);
			assert(/並び/.test(r.res.reasons[r.x] || ''), 'T162(4) 理由は「並びで絞り込み」のまま', r.res.reasons[r.x]);
			assert(jsErrors(sp.errors).length === 0, 'T162(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	// T163（決定 664）: 速 の字を、部首が辵・辶（康熙部首 162）のすべての漢字にした（Unihan 18.0 の kRSUnicode・1,227 字）。
	// 新しく入った字（T162 の6字 返・逢・遥・通・途・連 の外）で 速 に決まること、辶でも貝でもない字では決まらないこと、
	// 賢 の字は T162 のまま・速 と重ならないことを見る。字の一覧は製品の表（TIED_LAST_CHAR_RADICAL_162）から引く。
	await block('T163 (5) 辶のつく字すべて（T162 の6字の外も）で 速 に決まり、辶でも貝でもない字では決まらない', async () => {
		const sp = await openSp();
		try {
			const r = await sp.page.evaluate(() => {
				const { line, setScope, match, known, group } = window.__t162;
				const own = (k) => Object.prototype.hasOwnProperty.call(TIED_LAST_CHAR_SHAPES, k);
				const T162_SIX = ['返', '逢', '遥', '通', '途', '連'];
				// 表の範囲の字（符号の範囲から並べる）
				const radical = [];
				TIED_LAST_CHAR_RADICAL_162.forEach(([a, b]) => { for (let cp = a; cp <= (b === undefined ? a : b); cp++) radical.push(String.fromCodePoint(cp)); });
				const keys = Object.keys(TIED_LAST_CHAR_SHAPES);
				const speedKeys = keys.filter((k) => TIED_LAST_CHAR_SHAPES[k] === '速');
				const kenKeys = keys.filter((k) => TIED_LAST_CHAR_SHAPES[k] === '賢');
				const radSet = new Set(radical);
				const table = {
					radical: radical.length, speed: speedKeys.length,
					allRadicalSpeed: radical.every((ch) => own(ch) && TIED_LAST_CHAR_SHAPES[ch] === '速'),
					speedOnlyRadical: speedKeys.filter((k) => !radSet.has(k)),
					sixInRadical: T162_SIX.filter((k) => radSet.has(k)).length,
					kenKeys: kenKeys.join(''), kenInRadical: kenKeys.filter((k) => radSet.has(k)),
					// 部首 162 の字の見本: 辵・辶（部首そのもの）・巡（URO の範囲の外）・U+FA24（互換の区画にある統合漢字）・遠・拡張 B の範囲の頭と末尾
					samples: [String.fromCodePoint(0x8FB5), String.fromCodePoint(0x8FB6), String.fromCodePoint(0x5DE1), String.fromCodePoint(0xFA24), '遠', String.fromCodePoint(0x2844D), String.fromCodePoint(0x28667)].map((ch) => ({ ch, to: own(ch) ? TIED_LAST_CHAR_SHAPES[ch] : null })),
					// 互換漢字（U+F99A 連）は lastLetterOf の NFKC で統合漢字に移ってから引かれる
					compat: (() => { const ch = lastLetterOf(String.fromCodePoint(0xF99A)); return { ch, to: own(ch) ? TIED_LAST_CHAR_SHAPES[ch] : null }; })()
				};
				if (!group) return { table, group: null };
				const m = group.members;
				const want = group.byTarget['速'];
				const head = want.slice(0, want.length - 1);
				setScope(m.map(known));
				// 新しく入った字: 表の範囲の字のうち、T162 の6字でも 速 でもなく、正規化（CHAR_CONFUSION_MAP）のあとも組のどの最後の字にもならないもの。
				// 遠 は正規化で 速 になり、同点にならずに 速 と読める（字の形の前に決まる）ので、照合の流れでは見ない（表と関数で直接見る）。
				// 照合の流れで見るのは 道（正規化で 進）・進（T163 の指示の例）と、URO の範囲の頭・表の最初と最後・拡張 B の字
				const lastsOfGroup = new Set(m.map((n) => normalizeText(lastLetterOf(n))));
				const fresh = radical.filter((ch) => !T162_SIX.includes(ch) && ch !== '速' && !lastsOfGroup.has(normalizeText(ch)));
				const pickFlow = ['道', '進'].filter((ch) => fresh.includes(ch))
					.concat([fresh.find((ch) => ch.codePointAt(0) >= 0x8FB5), fresh[0], fresh[fresh.length - 1], fresh.find((ch) => ch.codePointAt(0) >= 0x20000 && ch.codePointAt(0) < 0x2A6E0)])
					.filter((ch, i, a) => ch && a.indexOf(ch) === i);
				const flow = pickFlow.map((ch) => {
					const res = match([line(head + ch, '0:4', 2)]);
					const a = res.amb.find((x) => x.rowKey === '0:4');
					return { ch, cp: ch.codePointAt(0).toString(16), detected: res.detected, star: res.stars[want], reason: res.reasons[want] || '', byShape: a ? a.byShape : null, tie: !!a && !a.resolved && a.survivors.length >= 2, byOrderPicked: a && a.byOrder ? a.byOrder.picked : 'none' };
				});
				// 部首 162 の字すべて（T162 の6字・遠 も含む）を関数で直接（組の全部を候補に）
				const direct = radical.map((ch) => { const p = pickTiedByLastCharShape(head + ch, m, m); return !!p && p.picked === want; });
				// 辶でも貝でもない字（翌。T150 の動画8 祖2 の読み）・辶を部首でない所に持つ字（鏈〔金部〕）は表に無く、決まらない
				const others = ['翌', '鏈'].map((ch) => {
					const res = match([line(head + ch, '0:4', 2)]);
					const a = res.amb.find((x) => x.rowKey === '0:4');
					return { ch, inTable: own(ch), detected: res.detected, byShape: a ? a.byShape : null, tie: !!a && !a.resolved && a.survivors.length >= 2 };
				});
				return { table, group: m, want, freshCount: fresh.length, flow, directOk: direct.filter(Boolean).length, directAll: direct.length, others };
			});
			const t = r.table;
			assert(t.radical === 1227 && t.speed === 1227 && t.allRadicalSpeed, 'T163(5) 表: 部首 162 の 1,227 字がすべて 速 に行く', { radical: t.radical, speed: t.speed, all: t.allRadicalSpeed });
			assert(t.speedOnlyRadical.length === 0 && t.sixInRadical === 6, 'T163(5) 表: 速 に行く字は部首 162 の字だけ（T162 の6字も範囲に入る）', { extra: t.speedOnlyRadical, six: t.sixInRadical });
			assert(t.kenKeys === '買貴賞質費' && t.kenInRadical.length === 0, 'T163(5) 表: 賢 の字は T162 のまま（買・貴・賞・質・費）で、辶の字と重ならない', { ken: t.kenKeys, overlap: t.kenInRadical });
			assert(t.samples.every((s) => s.to === '速'), 'T163(5) 表: 辵・辶・巡・U+FA24・遠・拡張 B の字も 速', t.samples);
			assert(t.compat.ch === '連' && t.compat.to === '速', 'T163(5) 互換漢字の 連（U+F99A）は NFKC で 連 になって 速', t.compat);
			assert(!!r.group && !!r.want, 'T163(5) データに、最後の1字だけが違い 賢・速 で終わる候補を持つ組がある', r.group);
			if (!r.group) return;
			assert(r.flow.length >= 5 && ['道', '進'].every((ch) => r.flow.some((f) => f.ch === ch)), 'T163(5) 照合の流れで見る字に 道・進 と範囲の端・拡張 B の字が入る', r.flow.map((f) => f.ch + ' U+' + f.cp));
			for (const f of r.flow) {
				assert(f.tie && !f.byOrderPicked, 'T163(5) 「…' + f.ch + '」（U+' + f.cp + '）は同点で、並びでは決まらない', f);
				assert(f.detected.length === 1 && f.detected[0] === r.want && f.star === 2 && /字の形/.test(f.reason), 'T163(5) 最後の字「' + f.ch + '」→「' + r.want + '」が出る（字の形で絞り込み）', f);
				assert(!!f.byShape && f.byShape.last === f.ch && f.byShape.picked === r.want, 'T163(5) 開発ログの記録: 最後の字「' + f.ch + '」→ 速', f.byShape);
			}
			assert(r.freshCount >= 1200 && r.directAll === 1227 && r.directOk === r.directAll, 'T163(5) 部首 162 の字すべて（関数で直接）: 速 で終わる候補に決まる', { fresh: r.freshCount, ok: r.directOk, all: r.directAll });
			for (const o of r.others) {
				assert(!o.inTable && o.tie && o.detected.length === 0 && !!o.byShape && o.byShape.matched.length === 0 && !o.byShape.picked, 'T163(5) 辶でも貝でもない字「' + o.ch + '」: 表に無く、決まらない（今までどおり捨てる）', o);
			}
			assert(jsErrors(sp.errors).length === 0, 'T163(5) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});
}
