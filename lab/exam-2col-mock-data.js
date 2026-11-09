/* T146 のモックの見本のデータ（実物の exam.html に UmaExam の素材〔親・祖1・祖2〕を通して取った、帯と補助の帯の中身と画像の大きさ）。
   ゲームの画面の画像は入れていない（モックは同じ大きさの灰色の箱で描く）。 */
'use strict';
const EXAM_MOCK_SCENES = {
	"normal": {
		"effOn": false,
		"melop": false,
		"markKinds": [
			"sp70",
			"green",
			"plain",
			"factor",
			"gene"
		],
		"suppressed": [],
		"adjustNotes": [
			"検出したシナリオ因子（3種）：アオハル杯シナリオ・無人島シナリオ・温泉郷シナリオ",
			"検出した遺伝子（2種）：ダートの遺伝子・追込の遺伝子"
		],
		"persons": [
			{
				"label": "親A",
				"detected": 31,
				"sp70Count": 7,
				"factors": {
					"items": [
						{
							"name": "アオハル杯シナリオ",
							"stars": "★3",
							"text": "アオハル杯シナリオ：★3"
						},
						{
							"name": "無人島シナリオ",
							"stars": "★3",
							"text": "無人島シナリオ：★3"
						},
						{
							"name": "温泉郷シナリオ",
							"stars": "★3",
							"text": "温泉郷シナリオ：★3"
						}
					],
					"more": false
				},
				"genes": {
					"items": [
						{
							"name": "追込の遺伝子",
							"stars": "★2",
							"text": "追込の遺伝子：★2"
						}
					],
					"more": false
				},
				"effPanel": null,
				"totalText": null,
				"totalLines": null,
				"width": 1179,
				"height": 2342,
				"band": {
					"top": 282,
					"L": 13,
					"R": 1166
				},
				"topH": 1211
			},
			{
				"label": "祖A1",
				"detected": 23,
				"sp70Count": 10,
				"factors": {
					"items": [
						{
							"name": "温泉郷シナリオ",
							"stars": "★2",
							"text": "温泉郷シナリオ：★2"
						}
					],
					"more": false
				},
				"genes": {
					"items": [
						{
							"name": "ダートの遺伝子",
							"stars": "★2",
							"text": "ダートの遺伝子：★2"
						}
					],
					"more": false
				},
				"effPanel": null,
				"totalText": null,
				"totalLines": null,
				"width": 1179,
				"height": 1757,
				"band": {
					"top": 282,
					"L": 13,
					"R": 1166
				},
				"topH": 1162
			},
			{
				"label": "祖A2",
				"detected": 38,
				"sp70Count": 13,
				"factors": null,
				"genes": {
					"items": [
						{
							"name": "ダートの遺伝子",
							"stars": "★2",
							"text": "ダートの遺伝子：★2"
						}
					],
					"more": false
				},
				"effPanel": null,
				"totalText": null,
				"totalLines": null,
				"width": 1179,
				"height": 2521,
				"band": {
					"top": 282,
					"L": 13,
					"R": 1166
				},
				"topH": 1137
			}
		]
	},
	"eff": {
		"effOn": true,
		"melop": false,
		"markKinds": [],
		"suppressed": [],
		"adjustNotes": [
			"検出したシナリオ因子（3種）：アオハル杯シナリオ・無人島シナリオ・温泉郷シナリオ",
			"検出した遺伝子（2種）：ダートの遺伝子・追込の遺伝子"
		],
		"persons": [
			{
				"label": "親A",
				"detected": 31,
				"sp70Count": 7,
				"factors": {
					"items": [
						{
							"name": "アオハル杯シナリオ",
							"stars": "★3",
							"text": "アオハル杯シナリオ：★3"
						},
						{
							"name": "無人島シナリオ",
							"stars": "★3",
							"text": "無人島シナリオ：★3"
						},
						{
							"name": "温泉郷シナリオ",
							"stars": "★3",
							"text": "温泉郷シナリオ：★3"
						}
					],
					"more": false
				},
				"genes": {
					"items": [
						{
							"name": "追込の遺伝子",
							"stars": "★2",
							"text": "追込の遺伝子：★2"
						}
					],
					"more": false
				},
				"effPanel": {
					"cells": [
						{
							"tier": 0,
							"range": "3.78-2.74",
							"count": 0
						},
						{
							"tier": 1,
							"range": "4.79-3.82",
							"count": 0
						},
						{
							"tier": 2,
							"range": "5.88-4.91",
							"count": 20
						},
						{
							"tier": 3,
							"range": "7.56-6.17",
							"count": 11
						}
					]
				},
				"totalText": null,
				"totalLines": [
					"合計評価点/合計SP:6.098",
					"合計評価点（★補正）:12,059"
				],
				"width": 1179,
				"height": 2342,
				"band": {
					"top": 282,
					"L": 13,
					"R": 1166
				},
				"topH": 1211
			},
			{
				"label": "祖A1",
				"detected": 23,
				"sp70Count": 10,
				"factors": {
					"items": [
						{
							"name": "温泉郷シナリオ",
							"stars": "★2",
							"text": "温泉郷シナリオ：★2"
						}
					],
					"more": false
				},
				"genes": {
					"items": [
						{
							"name": "ダートの遺伝子",
							"stars": "★2",
							"text": "ダートの遺伝子：★2"
						}
					],
					"more": false
				},
				"effPanel": {
					"cells": [
						{
							"tier": 0,
							"range": "3.78-2.74",
							"count": 0
						},
						{
							"tier": 1,
							"range": "4.79-3.82",
							"count": 4
						},
						{
							"tier": 2,
							"range": "5.88-4.91",
							"count": 10
						},
						{
							"tier": 3,
							"range": "7.56-6.17",
							"count": 12
						}
					]
				},
				"totalText": null,
				"totalLines": [
					"合計評価点/合計SP:5.821",
					"合計評価点（★補正）:9,875"
				],
				"width": 1179,
				"height": 1757,
				"band": {
					"top": 282,
					"L": 13,
					"R": 1166
				},
				"topH": 1162
			},
			{
				"label": "祖A2",
				"detected": 38,
				"sp70Count": 13,
				"factors": null,
				"genes": {
					"items": [
						{
							"name": "ダートの遺伝子",
							"stars": "★2",
							"text": "ダートの遺伝子：★2"
						}
					],
					"more": false
				},
				"effPanel": {
					"cells": [
						{
							"tier": 0,
							"range": "3.78-2.74",
							"count": 0
						},
						{
							"tier": 1,
							"range": "4.79-3.82",
							"count": 2
						},
						{
							"tier": 2,
							"range": "5.88-4.91",
							"count": 18
						},
						{
							"tier": 3,
							"range": "7.56-6.17",
							"count": 18
						}
					]
				},
				"totalText": null,
				"totalLines": [
					"合計評価点/合計SP:6.101",
					"合計評価点（★補正）:14,533"
				],
				"width": 1179,
				"height": 2521,
				"band": {
					"top": 282,
					"L": 13,
					"R": 1166
				},
				"topH": 1137
			}
		]
	},
	"melop": {
		"effOn": false,
		"melop": true,
		"markKinds": [
			"sp70",
			"green",
			"plain",
			"factor",
			"gene"
		],
		"suppressed": [],
		"adjustNotes": [
			"検出したシナリオ因子（3種）：アオハル杯シナリオ・無人島シナリオ・温泉郷シナリオ",
			"検出した遺伝子（2種）：ダートの遺伝子・追込の遺伝子"
		],
		"persons": [
			{
				"label": "親A",
				"detected": 31,
				"sp70Count": 7,
				"factors": {
					"items": [
						{
							"name": "アオハル杯シナリオ",
							"stars": "★3",
							"text": "アオハル杯シナリオ：★3"
						},
						{
							"name": "無人島シナリオ",
							"stars": "★3",
							"text": "無人島シナリオ：★3"
						},
						{
							"name": "温泉郷シナリオ",
							"stars": "★3",
							"text": "温泉郷シナリオ：★3"
						}
					],
					"more": false
				},
				"genes": {
					"items": [
						{
							"name": "追込の遺伝子",
							"stars": "★2",
							"text": "追込の遺伝子：★2"
						}
					],
					"more": false
				},
				"effPanel": null,
				"totalText": "合計 6.098（評価点/SP）",
				"totalLines": null,
				"width": 1179,
				"height": 2342,
				"band": {
					"top": 282,
					"L": 13,
					"R": 1166
				},
				"topH": 1211
			},
			{
				"label": "祖A1",
				"detected": 23,
				"sp70Count": 10,
				"factors": {
					"items": [
						{
							"name": "温泉郷シナリオ",
							"stars": "★2",
							"text": "温泉郷シナリオ：★2"
						}
					],
					"more": false
				},
				"genes": {
					"items": [
						{
							"name": "ダートの遺伝子",
							"stars": "★2",
							"text": "ダートの遺伝子：★2"
						}
					],
					"more": false
				},
				"effPanel": null,
				"totalText": "合計 5.821（評価点/SP）",
				"totalLines": null,
				"width": 1179,
				"height": 1757,
				"band": {
					"top": 282,
					"L": 13,
					"R": 1166
				},
				"topH": 1162
			},
			{
				"label": "祖A2",
				"detected": 38,
				"sp70Count": 13,
				"factors": null,
				"genes": {
					"items": [
						{
							"name": "ダートの遺伝子",
							"stars": "★2",
							"text": "ダートの遺伝子：★2"
						}
					],
					"more": false
				},
				"effPanel": null,
				"totalText": "合計 6.101（評価点/SP）",
				"totalLines": null,
				"width": 1179,
				"height": 2521,
				"band": {
					"top": 282,
					"L": 13,
					"R": 1166
				},
				"topH": 1137
			}
		]
	}
};
