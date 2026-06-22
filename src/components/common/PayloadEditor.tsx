/**
 * 文本/JSON 有效载荷编辑器，支持模式切换。
 * 在原始文本和 JSON 模式之间切换。在 JSON 模式下，
 * 提供格式化（美化打印）和压缩按钮。使用等宽字体显示有效载荷内容。
 *
 * @file 文本/JSON 编辑器
 */
import { useState, useEffect } from 'react'
import { SegmentedControl, Textarea, Group, Button } from '@mantine/core'
import { useTranslation } from 'react-i18next'

/** 有效载荷编辑器组件的属性。 */
interface Props { value: string; onChange: (value: string) => void; placeholder?: string; minRows?: number }

export function PayloadEditor({ value, onChange, placeholder = 'Enter payload...', minRows = 6 }: Props) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'text' | 'json'>('text')
  const [local, setLocal] = useState(value)

  useEffect(() => { setLocal(value) }, [value])

  function handleChange(v: string) { setLocal(v); onChange(v) }
  function formatJson() { try { const obj = JSON.parse(local); const f = JSON.stringify(obj, null, 2); setLocal(f); onChange(f) } catch { /* */ } }
  function compressJson() { try { const obj = JSON.parse(local); const c = JSON.stringify(obj); setLocal(c); onChange(c) } catch { /* */ } }

  return (
    <>
      <Group justify="space-between" mb={4}>
        <SegmentedControl size="xs" value={mode} onChange={(v) => setMode(v as any)} data={[{ label: t('messages.listen') === 'Listen' ? 'Text' : '文本', value: 'text' }, { label: 'JSON', value: 'json' }]} />
        {mode === 'json' && <Group gap={4}><Button size="compact-xs" variant="light" onClick={formatJson}>{t('messages.clear')}</Button><Button size="compact-xs" variant="light" onClick={compressJson}>Compact</Button></Group>}
      </Group>
      <Textarea value={local} onChange={(e) => handleChange(e.target.value)} placeholder={placeholder} minRows={minRows} autosize styles={{ input: { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12 } }} />
    </>
  )
}
