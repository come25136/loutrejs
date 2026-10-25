import type { Locale } from './i18n'

export const batchResolutionCopy = {
  en: {
    title: 'GraphQL N+1 queries and Batch Resolution',
    home: 'Home',
    breadcrumb: 'Breadcrumb',
    pageNavigation: 'On this page',
    sections: {
      comparison: 'Fetching related data',
      implementation: 'Resolver implementation',
    },
    implementationLead:
      'This example fetches products for items in an order list. Replace per-item lookups with load; the application implements the bulk fetch in its catalog service.',
    body: 'Batch Resolution fetches related GraphQL data in bulk. Loutre groups requests and manages execution scopes, without separate DataLoader setup.',
    editorLabel: 'Field Resolver and Batch Resolution code comparison',
    docs: 'Data Resolution guide',
    example: 'GraphQL Orders example',
    diagram: {
      lead: 'When a GraphQL query returns a list with related data, related fields are resolved for each item. Fetching that data individually adds one request per item to the initial list fetch: the N+1 problem.',
      individual: 'Fetch individually',
      batched: 'Batch with Loutre',
      calls: 'Related data fetch calls',
      callUnit: '×',
      list: 'Items in a GraphQL list',
      item: 'Item',
      fetch: 'Fetch',
      bulkFetch: 'Fetch together',
      normalLabel:
        'Three list items each resolve a related field and fetch data separately: three calls.',
      batchLabel:
        'Loutre passes three related-field requests to load together: one bulk fetch.',
      normalNote: 'Each resolver fetches its own related data.',
      batchNote: 'Loutre collects the requests and passes them to load.',
      note: 'Three items with the same field, arguments, and selection, resolved synchronously. Counts exclude fetching the original list.',
    },
  },
  ja: {
    title: 'GraphQLのN+1問題とBatch Resolution',
    home: 'トップページ',
    breadcrumb: 'パンくずリスト',
    pageNavigation: 'このページの内容',
    sections: {
      comparison: '関連データの取得',
      implementation: 'resolverの実装',
    },
    implementationLead:
      '注文一覧の各明細から商品データを取得する例です。1件ずつ取得する処理をloadへ置き換えます。商品サービスの一括取得処理はアプリケーション側で実装します。',
    body: 'GraphQLの関連データを一括取得する仕組みです。取得要求の集約と実行スコープの管理はLoutreが行うので、DataLoaderの組み込みは不要です。',
    editorLabel: '個別取得とBatch Resolutionのコード比較',
    docs: 'Data Resolutionの使い方',
    example: 'GraphQL Ordersのサンプル',
    diagram: {
      lead: 'GraphQLで一覧とその関連データを返すとき、関連フィールドは一覧の要素ごとに解決されます。そこで1件ずつデータを取得すると、一覧取得の1回に加え、件数分の問い合わせが発生します（N+1問題）。',
      individual: '1件ずつ取得',
      batched: 'Loutreで一括取得',
      calls: '関連データの取得回数',
      callUnit: '回',
      list: 'GraphQLで取得する一覧',
      item: '要素',
      fetch: '取得',
      bulkFetch: 'まとめて取得',
      normalLabel:
        '一覧の3要素それぞれで関連フィールドを解決し、データを個別に取得するため、呼び出しは3回。',
      batchLabel:
        'Loutreが3要素の関連フィールドの取得要求をloadへまとめて渡すため、一括取得の呼び出しは1回。',
      normalNote: '各resolverからデータを個別に取得するケース',
      batchNote: 'Loutreが取得要求をまとめ、loadで一括取得するケース',
      note: '同じフィールド・引数・選択フィールドの3件を同期的に解決する例です。元となる一覧データの取得は回数に含めません。',
    },
  },
} as const satisfies Record<Locale, Record<string, unknown>>
