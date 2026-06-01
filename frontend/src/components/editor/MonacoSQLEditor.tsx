import { useRef, useEffect } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import { useAppStore } from '@/store'

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS',
  'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS',
  'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'TRUE', 'FALSE',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'DROP TABLE',
  'WITH', 'UNION', 'INTERSECT', 'EXCEPT', 'ALL',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
  'OVER', 'PARTITION BY', 'ROWS BETWEEN', 'RANGE BETWEEN', 'UNBOUNDED PRECEDING', 'CURRENT ROW',
  'CAST', 'CONVERT', 'DATE', 'YEAR', 'MONTH', 'DAY', 'NOW', 'CURRENT_DATE',
  'CONCAT', 'SUBSTRING', 'TRIM', 'UPPER', 'LOWER', 'LENGTH', 'REPLACE', 'ROUND', 'ABS',
]

interface Props {
  value: string
  onChange: (val: string) => void
  schema?: string
  language?: 'sql' | 'python'
  onRun: () => void
  onSubmit: () => void
}

function extractTableNames(schema: string): string[] {
  const matches = schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)
  return [...matches].map(m => m[1])
}

function extractColumnNames(schema: string): string[] {
  const matches = schema.matchAll(/^\s+(\w+)\s+(?:INTEGER|VARCHAR|TEXT|FLOAT|DOUBLE|DATE|DATETIME|BOOLEAN|INT|BIGINT|DECIMAL|CHAR|NUMERIC)/gim)
  return [...matches].map(m => m[1])
}

export default function MonacoSQLEditor({ value, onChange, schema = '', language = 'sql', onRun, onSubmit }: Props) {
  const { theme, practiceLanguage } = useAppStore()
  const monaco = useMonaco()
  const editorRef = useRef<any>(null)

  useEffect(() => {
    if (!monaco || language !== 'sql') return
    const tableNames = extractTableNames(schema)
    const columnNames = extractColumnNames(schema)

    const disposable = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model, position) => {
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: model.getWordUntilPosition(position).startColumn,
          endColumn: position.column,
        }
        const suggestions = [
          ...SQL_KEYWORDS.map(kw => ({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
          })),
          ...tableNames.map(t => ({
            label: t,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t,
            range,
            detail: 'Table',
          })),
          ...columnNames.map(c => ({
            label: c,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: c,
            range,
            detail: 'Column',
          })),
        ]
        return { suggestions }
      },
    })
    return () => disposable.dispose()
  }, [monaco, schema, language])

  const themeKey = theme === 'dark'
    ? (practiceLanguage === 'python' ? 'forge-python-dark' : 'forge-sql-dark')
    : (practiceLanguage === 'python' ? 'forge-python-light' : 'forge-sql-light')

  const handleMount = (editor: any, monacoInstance: any) => {
    editorRef.current = editor

    monacoInstance.editor.defineTheme('forge-sql-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'FFA116', fontStyle: 'bold' },
        { token: 'string', foreground: '98C379' },
        { token: 'number', foreground: 'D19A66' },
        { token: 'comment', foreground: '5C6370', fontStyle: 'italic' },
        { token: 'operator', foreground: '61AFEF' },
        { token: 'identifier', foreground: 'ABB2BF' },
      ],
      colors: {
        'editor.background': '#1A1A1A',
        'editor.foreground': '#ABB2BF',
        'editor.lineHighlightBackground': '#282828',
        'editorLineNumber.foreground': '#3D3D3D',
        'editorLineNumber.activeForeground': '#7D7D7D',
        'editor.selectionBackground': '#3D3D3D80',
        'editorCursor.foreground': '#FFA116',
        'editorIndentGuide.background': '#2D2D2D',
      },
    })

    monacoInstance.editor.defineTheme('forge-python-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '4A90D9', fontStyle: 'bold' },
        { token: 'string', foreground: '98C379' },
        { token: 'number', foreground: 'D19A66' },
        { token: 'comment', foreground: '5C6370', fontStyle: 'italic' },
        { token: 'operator', foreground: '61AFEF' },
        { token: 'identifier', foreground: 'ABB2BF' },
      ],
      colors: {
        'editor.background': '#1E2430',
        'editor.foreground': '#D4DCE8',
        'editor.lineHighlightBackground': '#262E3C',
        'editorLineNumber.foreground': '#3D4A5C',
        'editorLineNumber.activeForeground': '#7D8FA8',
        'editor.selectionBackground': '#3776AB40',
        'editorCursor.foreground': '#3776AB',
        'editorIndentGuide.background': '#2A3342',
      },
    })

    monacoInstance.editor.defineTheme('forge-sql-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'E07400', fontStyle: 'bold' },
        { token: 'string', foreground: '50A14F' },
        { token: 'number', foreground: 'C18401' },
        { token: 'comment', foreground: 'A0A1A7', fontStyle: 'italic' },
        { token: 'operator', foreground: '0070C1' },
        { token: 'identifier', foreground: '374151' },
      ],
      colors: {
        'editor.background': '#F9FAFB',
        'editor.foreground': '#111827',
        'editor.lineHighlightBackground': '#F3F4F6',
        'editorLineNumber.foreground': '#9CA3AF',
        'editorLineNumber.activeForeground': '#4B5563',
        'editor.selectionBackground': '#DBEAFE',
        'editorCursor.foreground': '#FFA116',
        'editorIndentGuide.background': '#E5E7EB',
        'editorWidget.background': '#FFFFFF',
        'editorSuggestWidget.background': '#FFFFFF',
        'editorSuggestWidget.border': '#E5E7EB',
        'editorSuggestWidget.selectedBackground': '#EFF6FF',
      },
    })

    monacoInstance.editor.defineTheme('forge-python-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '2B6CB0', fontStyle: 'bold' },
        { token: 'string', foreground: '2F855A' },
        { token: 'number', foreground: 'C05621' },
        { token: 'comment', foreground: '718096', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#F0F7FF',
        'editor.foreground': '#1A202C',
        'editor.lineHighlightBackground': '#E8F0FE',
        'editorCursor.foreground': '#3776AB',
      },
    })

    monacoInstance.editor.setTheme(themeKey)

    // Keyboard shortcuts
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => onRun())
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.Enter,
      () => onSubmit()
    )
  }

  useEffect(() => {
    if (monaco && editorRef.current) {
      monaco.editor.setTheme(themeKey)
    }
  }, [theme, monaco, practiceLanguage, themeKey])

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={v => onChange(v || '')}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: true,
        lineHeight: 22,
        padding: { top: 12, bottom: 12 },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        tabSize: 2,
        renderLineHighlight: 'line',
        cursorBlinking: 'smooth',
        smoothScrolling: true,
        contextmenu: true,
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'smart',
      }}
    />
  )
}
