import type { Locale } from '../lib/i18n'

const copy = {
  ja: {
    title: 'アクセス解析について',
    body: 'このサイトでは、ページの改善とLoutreの利用方法の把握のためにGoogle Analytics 4を使用しています。Cookieなどを使い、ページの閲覧、Docsや外部サイトへの移動、サンプルの起動、プロジェクト作成コマンドのコピーを計測します。',
    details:
      'サイトの独自計測では、URLのクエリとフラグメント、フォームへの入力内容、DevToolsで接続したアプリケーションの実行データを送信しません。コマンドのコピーや外部サイトへの移動は、インストールや実行の成功を表すものではありません。',
    controls:
      'Cookieの利用はブラウザの設定で制限できます。Googleによるデータの利用や収集を無効にする方法は、以下を参照してください。',
    google: 'Googleのサービスを使用するサイトやアプリから収集した情報の利用',
    optOut: 'Google Analyticsのオプトアウト',
  },
  en: {
    title: 'Website analytics',
    body: 'This website uses Google Analytics 4 to improve its pages and understand how visitors explore Loutre. Analytics uses cookies and similar technologies to measure page views, visits to documentation and external resources, sample launches, and copies of the project creation command.',
    details:
      'Our custom measurement excludes URL queries and fragments, form input, and execution data from applications connected to DevTools. Copying a command or opening an external resource does not establish that installation or execution succeeded.',
    controls:
      'You can restrict cookies in your browser settings. The following resources explain how Google uses data and how to opt out of Google Analytics.',
    google:
      'How Google uses information from sites or apps that use its services',
    optOut: 'Google Analytics opt-out',
  },
} as const

export function PrivacyPage({ locale }: { readonly locale: Locale }) {
  const text = copy[locale]
  return (
    <main className="shell py-16">
      <article className="max-w-3xl space-y-7 text-base leading-8 text-ink-soft">
        <h1 className="text-4xl font-semibold text-ink">{text.title}</h1>
        <p>{text.body}</p>
        <p>{text.details}</p>
        <p>{text.controls}</p>
        <ul className="list-disc space-y-3 pl-6">
          <li>
            <a
              className="text-copper-dark underline"
              href="https://policies.google.com/technologies/partner-sites"
            >
              {text.google}
            </a>
          </li>
          <li>
            <a
              className="text-copper-dark underline"
              href="https://tools.google.com/dlpage/gaoptout"
            >
              {text.optOut}
            </a>
          </li>
        </ul>
      </article>
    </main>
  )
}
