import hljs from 'highlight.js/lib/core'
import graphql from 'highlight.js/lib/languages/graphql'
import typescript from 'highlight.js/lib/languages/typescript'

const highlighter = hljs.newInstance()
highlighter.registerLanguage('graphql', graphql)
highlighter.registerLanguage('typescript', typescript)

const codeClass = [
  'overflow-x-auto font-mono leading-[1.85] text-[#d4d4d4]',
  '[&_.hljs-keyword]:text-[#569cd6] [&_.hljs-literal]:text-[#569cd6]',
  '[&_.hljs-string]:text-[#ce9178] [&_.hljs-title]:text-[#dcdcaa] [&_.hljs-title.class_]:text-[#4ec9b0]',
  '[&_.hljs-variable]:text-[#9cdcfe] [&_.hljs-template-variable]:text-[#9cdcfe] [&_.hljs-attr]:text-[#9cdcfe] [&_.hljs-property]:text-[#9cdcfe] [&_.hljs-symbol]:text-[#9cdcfe]',
  '[&_.hljs-number]:text-[#b5cea8] [&_.hljs-built_in]:text-[#4ec9b0] [&_.hljs-type]:text-[#4ec9b0]',
  '[&_.hljs-comment]:text-[#6a9955]',
].join(' ')

export function HighlightedCode({
  source,
  language = 'typescript',
  lineNumbers = false,
  className = '',
}: {
  readonly source: string
  readonly language?: 'typescript' | 'graphql'
  readonly lineNumbers?: boolean
  readonly className?: string
}) {
  const highlighted = highlighter.highlight(source, { language }).value

  return (
    <pre
      className={`${codeClass} text-[11px] sm:text-xs ${lineNumbers ? 'flex' : ''} ${className}`}
    >
      {lineNumbers && (
        <span
          aria-hidden="true"
          className="sticky left-0 shrink-0 select-none bg-[#1f1f1f] pr-5 pl-4 text-right text-[#858585]"
        >
          {source
            .split('\n')
            .map((_, index) => index + 1)
            .join('\n')}
        </span>
      )}
      <code
        className={`hljs language-${language} ${lineNumbers ? 'block shrink-0 pr-5' : ''}`}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  )
}
