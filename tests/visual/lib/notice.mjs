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
			// 出る・出ないは「お知らせの履歴（そのツールの新しい3件）に未読があるか」（2026-10-25。1件ずつ出す）。履歴と既読の読み方はページの定義（UmaAnnounce.history・NOTICE_KINDS）をそのまま使う
			const ua = window.UmaAnnounce;
			const page = location.pathname.indexOf('special') !== -1 ? 'special' : 'exam';
			if (!ua || typeof NOTICE_KINDS === 'undefined') return true;
			// 2026-10-31（C-260 の (a)）: 自動で開くかは日付でも決まる。ページと同じ判定（UmaAnnounce.autoOpenKind）をそのまま使う
			if (typeof ua.autoOpenKind === 'function') return !ua.autoOpenKind(page, (k) => NOTICE_KINDS[k].seen());
			let unseen = ua.history(page).some((h) => !NOTICE_KINDS[h.kind].seen());
			if (ua.isForced() && ua.history(page).length) unseen = true;
			return !unseen;
		}, null, { timeout });
		return true;
	} catch (e) {
		return false;
	}
}
