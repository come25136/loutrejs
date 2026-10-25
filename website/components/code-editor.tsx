'use client'

import { ChevronDown, ChevronRight, FileCode2, Files } from 'lucide-react'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'

type EditorFile = {
  readonly path: string
  readonly language: 'typescript' | 'graphql'
  readonly content: ReactNode
}

type EditorPane = readonly [EditorFile, ...EditorFile[]]

function filename(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function directory(path: string) {
  return path.slice(0, path.lastIndexOf('/'))
}

export function CodeEditor({
  project,
  label,
  panes,
}: {
  readonly project: string
  readonly label: string
  readonly panes: readonly [EditorPane, EditorPane]
}) {
  const editorId = useId()
  const [activePaths, setActivePaths] = useState(() =>
    panes.map((files) => files[0].path),
  )
  const folders = new Map<string, { file: EditorFile; paneIndex: number }[]>()
  panes.forEach((files, paneIndex) => {
    files.forEach((file) => {
      const folder = directory(file.path)
      const entries = folders.get(folder) ?? []
      entries.push({ file, paneIndex })
      folders.set(folder, entries)
    })
  })

  function activateFile(paneIndex: number, path: string) {
    setActivePaths((paths) =>
      paths.map((current, index) => (index === paneIndex ? path : current)),
    )
  }

  function handleTabKey(
    event: KeyboardEvent<HTMLButtonElement>,
    paneIndex: number,
    fileIndex: number,
  ) {
    const files = panes[paneIndex]!
    let nextIndex: number
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (fileIndex + files.length - 1) % files.length
        break
      case 'ArrowRight':
        nextIndex = (fileIndex + 1) % files.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = files.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    activateFile(paneIndex, files[nextIndex]!.path)
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      )
    tabs?.[nextIndex]?.focus()
  }

  return (
    <div
      className="overflow-hidden rounded-md border border-[#333] bg-[#1f1f1f] text-[#ccc] shadow-[0_16px_48px_rgb(0_0_0/0.12)]"
      role="group"
      aria-label={label}
    >
      <div className="grid lg:grid-cols-[172px_minmax(0,1fr)]">
        <aside
          className="hidden border-r border-[#2b2b2b] bg-[#181818] text-[11px] lg:block"
          aria-label="Explorer"
        >
          <div className="flex h-10 items-center gap-2 px-4 text-[10px] tracking-wider">
            <Files size={14} aria-hidden="true" /> EXPLORER
          </div>
          <p className="flex items-center gap-1 px-2 py-2 font-semibold">
            <ChevronDown size={13} aria-hidden="true" />
            {project.toUpperCase()}
          </p>
          <ul className="leading-7">
            {[...folders].map(([folder, entries]) => (
              <li key={folder}>
                <span className="flex items-center gap-1 pl-4">
                  <ChevronDown size={13} aria-hidden="true" />
                  {folder}
                </span>
                <ul>
                  {entries.map(({ file, paneIndex }) => (
                    <li key={file.path}>
                      <button
                        className={`flex w-full min-w-0 items-center gap-2 pr-2 pl-8 text-left hover:bg-[#2a2d2e] ${activePaths[paneIndex] === file.path ? 'bg-[#37373d] text-white' : ''}`}
                        onClick={() => activateFile(paneIndex, file.path)}
                        aria-current={
                          activePaths[paneIndex] === file.path
                            ? 'true'
                            : undefined
                        }
                      >
                        <FileCode2
                          size={13}
                          className={`shrink-0 ${file.language === 'graphql' ? 'text-[#e4a3d8]' : 'text-[#519aba]'}`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{filename(file.path)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </aside>
        <div className="grid min-w-0 md:grid-cols-2">
          {panes.map((files, paneIndex) => (
            <div
              key={files[0].path}
              className="min-w-0 border-b border-[#2b2b2b] last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
            >
              <div
                className="flex h-10 overflow-x-auto border-b border-[#2b2b2b] bg-[#181818]"
                role="tablist"
                aria-label={`${label}: ${directory(files[0].path)}`}
              >
                {files.map((file, fileIndex) => (
                  <button
                    key={file.path}
                    role="tab"
                    aria-selected={activePaths[paneIndex] === file.path}
                    aria-controls={`${editorId}-${paneIndex}-${fileIndex}-panel`}
                    id={`${editorId}-${paneIndex}-${fileIndex}-tab`}
                    tabIndex={activePaths[paneIndex] === file.path ? 0 : -1}
                    onClick={() => activateFile(paneIndex, file.path)}
                    onKeyDown={(event) =>
                      handleTabKey(event, paneIndex, fileIndex)
                    }
                    className={`flex shrink-0 items-center gap-2 border-r border-[#2b2b2b] border-t px-4 text-xs ${activePaths[paneIndex] === file.path ? 'border-t-[#007acc] bg-[#1f1f1f] text-white' : 'border-t-transparent text-[#999] hover:bg-[#242424]'}`}
                  >
                    {file.language === 'graphql' ? (
                      <FileCode2
                        size={14}
                        className="text-[#e4a3d8]"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className="font-mono text-[10px] font-bold text-[#519aba]"
                        aria-hidden="true"
                      >
                        TS
                      </span>
                    )}
                    {filename(file.path)}
                  </button>
                ))}
              </div>
              {files.map((file, fileIndex) => (
                <div
                  key={file.path}
                  role="tabpanel"
                  id={`${editorId}-${paneIndex}-${fileIndex}-panel`}
                  aria-labelledby={`${editorId}-${paneIndex}-${fileIndex}-tab`}
                  hidden={activePaths[paneIndex] !== file.path}
                  tabIndex={0}
                >
                  <div className="flex h-8 items-center gap-1 px-4 text-[10px] text-[#969696]">
                    {directory(file.path)}
                    <ChevronRight size={12} aria-hidden="true" />
                    {filename(file.path)}
                  </div>
                  {file.content}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
