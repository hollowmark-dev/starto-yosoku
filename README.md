# STARTO推し予測

実在しない人物の顔を見比べて、好みの傾向を推定し、STARTO ENTERTAINMENTのタレントから傾向の近い3人をさがすツールです。

**サイト:** https://hollowmark-dev.github.io/starto-yosoku/

## 大事なこと

- 表示される顔は、すべて画像生成モデルで作った**実在しない人物の顔**です。
- タレントの写真は、モデルの学習にも顔の生成にも、このリポジトリにも一切使用していません。結果画面には、氏名・グループ名・公式プロフィールへのリンクだけを表示します。
- 個人が制作した非公式のファンサイトです。STARTO ENTERTAINMENTとは関係ありません。
- 権利者の方からご要請があれば、ただちに公開を停止します。ご連絡は X: @nooton123 のDMまで。

## 構成

| パス | 内容 |
|---|---|
| `docs/` | 公開サイト（GitHub Pages）。`build_site.py` が生成する静的ファイル |
| `build_site.py` | ロースター（`members_public.json`）・顔のプール・ハブ補正から `docs/` を組み立てるビルドスクリプト（Python 3 標準ライブラリのみ） |
| `publish/disclaimer.md` | 免責・説明文の原本。`docs/disclaimer.js` はここから逐語で生成される |
| `gas/` | 回答を匿名で記録する Google Apps Script と、その設置手順 |
| `tests/` | ビルド後の `docs/` を検証するテスト（`docs_test.js` / `check_publish.py`） |

記録する内容と記録しない内容は [gas/README.md](gas/README.md) にまとめています。

## ビルドとテスト

動作確認だけならスタブ（仮データ）でビルドできます。

```
python build_site.py --members path/to/members_public.json --stub
node tests/docs_test.js
python tests/check_publish.py
```

本番のデータでビルドする場合:

```
python build_site.py --members path/to/members_public.json \
  --pool path/to/pool.json --faces path/to/faces_dir --hub path/to/hub_offset.json
```
