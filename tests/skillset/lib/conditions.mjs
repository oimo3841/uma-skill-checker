// 精度を測る条件（鮮明／人工劣化／実劣化）の一覧。
//
// **縮小率は推測ではなく measure-text-height.mjs の実測から決めている:**
//   スキルセット画面（iPhone 1179x2556）の文字の高さ … 23px
//   因子画面（同じ iPhone の実画像 4枚）             … 23px  → 倍率 1.00
//   因子画面（PC 953px幅の実画像 7枚）               … 20px  → 倍率 0.87
//   3世代結合画像が MAX_SIDE_PX(3000) で縮んだ状態    …  8px  → 倍率 0.35
//
// 「スキルセット画面の文字は因子画面より大きいので、そのまま読んでも因子画面の誤読が
// 再現されない」という前提は**実測では成り立たなかった**。同じ端末で撮る限り
// 文字の高さはほぼ同じで、差は背景の複雑さと前処理の側にある。
// そのため人工劣化は「因子画面の文字の高さまで縮小」ではなく、
// **実際に製品の入力で起こりうる縮小**（PC幅相当・結合画像の縮小相当）を水準にする。
//
// productLike: 製品（special.html / exam.html）と同じ整形を通すかどうか。
//   true  … 文字の外接矩形で切り直す → ROW_TARGET_HEIGHT(56) まで拡大 → 白地に余白付き
//            → preprocessVariants()（二値化・反転・原画の3変種）をすべてOCR
//   false … 切り出した画像をそのままOCR（前処理の効き目を測るための対照）

export const CONDITIONS = {
	// 鮮明
	'sharp-raw': { kind: 'sharp', label: '鮮明・前処理なし（対照）', scale: 1, productLike: false },
	sharp: { kind: 'sharp', label: '鮮明・製品と同じ前処理', scale: 1, productLike: true },
	// 人工劣化（1回の縮小＋1回のJPEG圧縮）
	'pc-q90': { kind: 'artificial', label: '人工劣化 PC幅相当(0.87倍)＋JPEG90', scale: 0.87, quality: 0.9, productLike: true },
	'pc-q70': { kind: 'artificial', label: '人工劣化 PC幅相当(0.87倍)＋JPEG70', scale: 0.87, quality: 0.7, productLike: true },
	'pc-q50': { kind: 'artificial', label: '人工劣化 PC幅相当(0.87倍)＋JPEG50', scale: 0.87, quality: 0.5, productLike: true },
	'jpeg-q70': { kind: 'artificial', label: '人工劣化 縮小なし＋JPEG70', scale: 1, quality: 0.7, productLike: true },
	'jpeg-q50': { kind: 'artificial', label: '人工劣化 縮小なし＋JPEG50', scale: 1, quality: 0.5, productLike: true },
	'stitch-q90': { kind: 'artificial', label: '人工劣化 結合画像相当(0.35倍)＋JPEG90', scale: 0.35, quality: 0.9, productLike: true },
	'stitch-q70': { kind: 'artificial', label: '人工劣化 結合画像相当(0.35倍)＋JPEG70', scale: 0.35, quality: 0.7, productLike: true }
};

export const DEFAULT_CONDITIONS = [
	'sharp-raw',
	'sharp',
	'pc-q90',
	'pc-q70',
	'pc-q50',
	'jpeg-q70',
	'jpeg-q50',
	'stitch-q90',
	'stitch-q70'
];

export function resolveConditions(arg) {
	const names = arg ? arg.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_CONDITIONS;
	return names.map((n) => {
		if (!CONDITIONS[n]) throw new Error(`知らない条件です: ${n}（使えるもの: ${Object.keys(CONDITIONS).join(', ')}）`);
		return { name: n, ...CONDITIONS[n] };
	});
}
