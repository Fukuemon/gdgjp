# mc.gdgs.jp

DevFest Kansai 2026 の司会を、事前に生成した AI 音声で遠隔操作するアプリ。

- 司会PC: `https://mc.gdgs.jp/`（GDG チャプターメンバーのみ）。トラックごとのタブから音声を再生・停止する。
- 配信PC: OBS の Browser Source に `https://mc.gdgs.jp/play?track=<A|B|C>&t=<token>` を読み込む。画面には何も描画せず、音声だけを出す。

トラックごとに独立したチャネル（`McRoom` Durable Object、トラックごとに1つ）が WebSocket で中継する。
司会PCは左上で選んだトラックのチャネルにつながり、A の司会PC は A の配信PC だけを操作する。
共通の予備音声は、選択中トラックの配信PCで再生される。

## 配信PC（OBS）のセットアップ

1. 配信PCのブラウザで `https://mc.gdgs.jp/` を開き、左上でそのPCのトラックを選んでから、診断パネル（右上の波形アイコン）の `Player URL (Track X)` をコピーする。トークンはトラックごとに別。
2. OBS で Browser Source を追加し、URL に貼り付ける。
   - 「OBS で音声を制御する」を **ON**（ミキサーに音声が出る）
   - 「表示されていないときにソースをシャットダウン」を **OFF**（シーン切り替えで切断されないように）
   - 「シーンがアクティブになったときにブラウザの表示を更新」を **OFF**
3. 配信PCで開いた司会画面は閉じる。司会PCの右上のランプが青になれば接続済み。
4. OBS ミキサーでこのソースの音量・ミュートを確認する（ブラウザ側からは検知できない唯一の項目）。

Player URL を再発行すると、そのトラックの古い URL は即座に無効になる。本番中は再発行しないこと。

## 音が出ないとき

司会PCの赤い帯と診断パネルに原因が出る。

| 表示 | 対処 |
| --- | --- |
| 司会PCがオフラインです | 司会PCのネットワーク。復旧すれば自動で再接続する |
| 配信PCが接続されていません | 配信PCのネットワーク、OBS の Browser Source、Player URL |
| 配信PCが複数接続されています | 同じ URL を開いている別のブラウザ／ソースを閉じる（音が二重に出る） |
| 自動再生がブロックされています | OBS 以外のブラウザで開いている。ページを一度クリック |
| 音声が進んでいません | 配信PCのオーディオデバイス |
| ページが非表示です | OBS のソースシャットダウン設定 |

## 音声データ

`音声/`（WAV）と `原稿/`（Markdown）は Git に含めない。手元に置いて次を実行すると、
`public/audio/*.mp3` と `app/features/clips/clips.json` が再生成される。

```sh
node scripts/transcribe.mjs   # Gemini (Vertex AI, ADC) で音声どおりの文面を scripts/overrides.json に保存
pnpm --filter @gdgjp/mc clips # mp3 変換 + 無音区間へのタイムスタンプ割り当て
```

追加した音声だけ文字起こしするときは `--only A-14,A-15` を付ける。

当日に音声を足すときは、司会PC画面の各タブ末尾（共通は予備音声の列の末尾）の ＋ から
アップロードする。音声は R2、見出し・テキスト・位置は D1 に保存され、配信PCは自動で先読みする。
`GEMINI_API_KEY`（Generative Language API が使えるキー）が設定されていればテキストは自動で
文字起こしされ、無ければ手入力する。追加した音声は ✎ から編集・削除できる。

## 開発

```sh
cp .dev.vars.example .dev.vars
pnpm --filter @gdgjp/mc migrate:local
pnpm --filter @gdgjp/mc dev        # http://localhost:5187/dev/login
pnpm --filter @gdgjp/mc test
pnpm --filter @gdgjp/mc test:e2e
```
