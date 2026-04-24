# 住宅・建設市況ダッシュボード

日本の建材メーカー向けに、住宅・建設市況と主要なマクロ経済指標を e-Stat API と各省庁の公式配布データから取得して一覧できる Next.js ダッシュボードです。  
ワンクリックで全指標を更新し、足元の変化と直近トレンドを短時間で確認できるようにしています。

## 特徴
- `最新データを取得` ボタンで対象指標を一括更新
- `住宅・建設 / マクロ経済 / 雇用・所得 / 消費・物価` のカテゴリ切り替え
- 指標ごとに最新値、変化率、直近 12〜36 期間チャート、最終更新対象期間、出典を表示
- e-Stat API と各省庁の公式配布ファイルをサーバー側で取得
- 指標定義は `src/config/indicators.ts` に集約
- appId 未設定時はセットアップ案内を表示
- 一部指標の取得失敗時も画面全体は継続表示し、失敗した指標名を明示
- Docker / docker compose で起動可能

## 技術スタック
- Next.js App Router
- TypeScript
- Tailwind CSS v4
- shadcn/ui 互換コンポーネント
- Recharts
- e-Stat API 3.0
- 各省庁の公開 HTML / CSV / Excel

## 画面構成
- ヘッダー
  - タイトル
  - 説明文
  - 最新データ取得ボタン
  - 最終更新時刻
- サマリーカード
  - 新設住宅着工戸数
  - 建設受注（民間・建築）
  - CPI 総合
  - 完全失業率
  - 鉱工業生産指数
  - 名目賃金指数
- カテゴリタブ
  - 住宅・建設
  - マクロ経済
  - 雇用・所得
  - 消費・物価
- 指標カード
  - 最新値
  - 前月比 / 前期比 / 前年同月比 / 前年同期比
  - トレンドチャート
  - 最終更新対象期間
  - 出典
  - 詳細ダイアログ

## 初期実装済み指標
### 住宅・建設
- 新設住宅着工戸数
- 持家着工戸数
- 貸家着工戸数
- 分譲住宅着工戸数
- 建設受注（民間・建築）
- 建設工事費デフレーター（住宅総合）
- リフォーム受注高（住宅）

### マクロ経済
- 実質GDP
- CPI 総合
- 鉱工業生産指数

### 雇用・所得
- 完全失業率
- 実質賃金指数
- 名目賃金指数

### 消費・物価
- 家計調査 住居支出
- 家計調査 設備修繕・維持
- 家計調査 家具・家事用品

## セットアップ
### 1. e-Stat の appId を取得
1. e-Stat にユーザー登録します
2. API 用の appId を発行します
3. プロジェクト直下に `.env` を作成します

`.env`
```bash
ESTAT_APP_ID=your-estat-app-id
```

既存運用の都合で `ESTAT_APP_KEY` を使っている場合も互換で読み取ります。

### 2. ローカルで起動
```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

### 3. Docker で起動
```bash
docker compose up --build
```

ブラウザで `http://localhost:3000` を開きます。

## 主なコマンド
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
```

## ディレクトリ構成
```text
src/
  app/
    api/dashboard/refresh/route.ts
    loading.tsx
    layout.tsx
    page.tsx
  components/
    dashboard/
    ui/
  config/
    indicators.ts
  lib/
    estat/
      client.ts
      fetchIndicators.ts
      normalize.ts
      types.ts
    utils.ts
```

## 指標追加方法
追加時は原則として `src/config/indicators.ts` だけを編集し、取得ロジック本体は触らない構成を目指しています。

1. `INDICATORS` に新しい設定を追加します
2. 必要に応じて `preferredTableIds` を設定します
3. `selectors` に対象系列の分類コードを入れます
4. `periodStrategy` を `timeCode` または `yearMonth` から選びます
5. `calcMode` と `changeType` を指定します

設定例:
```ts
{
  id: "example-indicator",
  category: "macro",
  title: "例示指標",
  sourceName: "統計名",
  statSearchKeyword: "検索キーワード",
  statsCode: "00000000",
  preferredTableIds: ["0000000000"],
  unit: "指数",
  calcMode: "yoy",
  changeType: "percent",
  selectors: {
    tab: "1",
    cat01: "0001",
    area: "00000",
  },
  periodStrategy: "timeCode",
  notes: "短い補助コメント",
}
```

## 実装方針
- e-Stat 呼び出しはサーバー側のみ
- `getStatsList / getMetaInfo / getStatsData` をラップ
- 簡易サーバーキャッシュで同一表の重複取得を抑制
- 指標ごとの UI 表示は共通フォーマットに正規化
- 1 指標の失敗で全体を止めず、部分的に表示継続

## 既知の制約
- e-Stat の表 ID や分類コードは基準改定や再編で変わることがあります
- 一部の表は `OPEN_DATE` と `UPDATED_DATE` の意味合いが異なるため、将来変更時には `preferredTableIds` の見直しが必要です
- 毎月勤労統計の一部系列は `年` と `月` が別軸で提供されるため、`periodStrategy: "yearMonth"` で吸収しています
- 建設受注やリフォーム統計は改定や推計方法の注記が付くことがあるため、業務利用時は公表資料も併読してください

## 今後の拡張ポイント
- 地域別比較
- 指標の選択 UI
- CSV ダウンロード
- 定期自動更新
- 指標ごとの注記表示
- e-Stat 検索候補を UI から差し替える管理画面
- Vercel の ISR / KV を使ったキャッシュ強化

## Vercel デプロイの補足
- `ESTAT_APP_ID` を Vercel の Environment Variables に設定してください
- 本プロジェクトは App Router の標準構成なので、そのままデプロイしやすい構成です
