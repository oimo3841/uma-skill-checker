// お知らせ（#ui-notice）の「出るか出ないかが決まる」のを待つ共通の部品（C-179）。
//
// special.html / exam.html は、読み込みが終わったあとの非同期の初期化（initUiMode）の最後に、未読のお知らせを出す。
// 負荷が高いと、その時点が networkidle の 1秒前後あとにずれる。検査が「いま見えているか」を1回だけ見て閉じる作りだと、
// 見たあとで出た背景幕（#ui-notice-backdrop）が次のクリックを遮り、TimeoutError になる（日付には依存しない）。
// そこで、**保存値から「出るはず」かを決め、出るはずなら出るまで待つ**。出ないはず（全部既読）なら待たずに返る。
// 文面・ID・キーは、ページの定義（*_NOTICE_STORAGE_KEY / *_NOTICE_ID / UmaAnnounce.ANNOUNCE.id）をそのまま読む（ここには書かない）。

/**
 * 読み込み直後のページで、お知らせが出る状態（uiNoticeOpen）になるまで待つ。出ないはずなら即座に返る。
 * 待ちきれなかったときは握りつぶす（そのあとの検査が、お知らせの有無を自分で確かめる）。
 * @returns {Promise<boolean>} 待ちが成立したか
 */
export async function waitNoticeSettled(page, timeout = 10000) {
	try {
		await page.waitForFunction(() => {
			// お知らせの仕組みを持たないページ（Deck など）は対象外
			if (typeof uiNoticeOpen === 'undefined' || typeof UI_NOTICE_STORAGE_KEY === 'undefined') return true;
			if (uiNoticeOpen) return true;
			const seen = (key, id) => { try { return localStorage.getItem(key) === id; } catch (e) { return false; } };
			let unseen = !seen(UI_NOTICE_STORAGE_KEY, UI_NOTICE_ID);
			if (typeof TARGET_NOTICE_STORAGE_KEY !== 'undefined') unseen = unseen || !seen(TARGET_NOTICE_STORAGE_KEY, TARGET_NOTICE_ID);
			if (typeof ALPHA_NOTICE_STORAGE_KEY !== 'undefined') unseen = unseen || !seen(ALPHA_NOTICE_STORAGE_KEY, ALPHA_NOTICE_ID);
			if (typeof CATALOG_NOTICE_STORAGE_KEY !== 'undefined') unseen = unseen || !seen(CATALOG_NOTICE_STORAGE_KEY, CATALOG_NOTICE_ID);
			const ua = window.UmaAnnounce;
			const page = location.pathname.indexOf('special') !== -1 ? 'special' : 'exam';
			const editionOn = !!(ua && ua.isFor(page));
			if (editionOn) unseen = unseen || !seen(EDITION_NOTICE_STORAGE_KEY, ua.ANNOUNCE.id);
			// 新シナリオへの未対応の知らせ（段1a）。ページごとに別のキー
			if (ua && ua.isScenarioFor(page)) unseen = unseen || !seen(SCENARIO_NOTICE_STORAGE_KEY, ua.SCENARIO_PENDING.id);
			if ((editionOn || (ua && ua.isScenarioFor(page))) && ua.isForced()) unseen = true;
			return !unseen;
		}, null, { timeout });
		return true;
	} catch (e) {
		return false;
	}
}
