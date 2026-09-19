import Link from 'next/link'
import { ossLicenses } from '../lib/oss-licenses.generated'
import { localePrefix, type Locale } from '../lib/i18n'

const copy = {
  en: {
    eyebrow: 'Legal',
    title: 'Open source licenses',
    description:
      'Loutre uses the open source packages listed below. Their license texts are included here for convenience.',
    back: 'Back to home',
    packageCount: (count: number) => `${count} packages`,
  },
  ja: {
    eyebrow: 'Legal',
    title: 'オープンソースライセンス',
    description:
      'Loutreが利用しているオープンソースパッケージと、そのライセンス本文を掲載しています。',
    back: 'トップページへ戻る',
    packageCount: (count: number) => `${count}パッケージ`,
  },
} satisfies Record<Locale, object>

export function OssLicensesPage({ locale }: { locale: Locale }) {
  const prefix = localePrefix(locale)
  const text = copy[locale]

  return (
    <main>
      <section className="shell py-20 md:py-28">
        <div className="max-w-3xl">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-ink md:text-6xl">
            {text.title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-ink-soft md:text-lg">
            {text.description}
          </p>
          <p className="mt-4 text-sm text-ink-soft">
            {text.packageCount(ossLicenses.length)}
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-surface-muted py-12 md:py-16">
        <div className="shell">
          <div className="flex flex-col gap-3">
            {ossLicenses.map((entry) => (
              <details
                className="group rounded-xl border border-line bg-paper px-5 py-4 shadow-[0_8px_24px_rgba(2,8,23,0.04)]"
                key={`${entry.name}@${entry.version}`}
              >
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <span className="font-mono text-sm font-semibold text-ink">
                    {entry.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {entry.version} · {entry.license}
                  </span>
                </summary>
                <pre className="mt-5 max-h-[32rem] overflow-auto whitespace-pre-wrap border-t border-line pt-5 font-mono text-xs leading-6 text-ink-soft">
                  {entry.text}
                </pre>
              </details>
            ))}
          </div>
          <Link
            className="mt-10 inline-flex text-sm font-semibold text-interaction hover:underline"
            href={`${prefix}/`}
          >
            ← {text.back}
          </Link>
        </div>
      </section>
    </main>
  )
}
