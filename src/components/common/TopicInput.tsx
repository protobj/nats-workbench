/**
 * NATS 主题自动补全输入框。
 * 提供一个自动补全文本字段，数据来自主题仓库中
 * 已发现的主题和活跃订阅。
 *
 * @file 主题自动补全输入框
 */
import { Autocomplete } from '@mantine/core'
import { useMemo } from 'react'
import { useTopicStore } from '@/stores/topicStore'

/** 主题自动补全输入框的属性。 */
interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TopicInput({ value, onChange, placeholder = 'nats.subject.name' }: Props) {
  const discoveredSubjects = useTopicStore((s) => s.discoveredSubjects)
  const subscriptions = useTopicStore((s) => s.subscriptions)

  const data = useMemo(() => {
    const all = new Set([...discoveredSubjects, ...subscriptions.map((s) => s.subject)])
    return Array.from(all)
  }, [discoveredSubjects, subscriptions])

  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      data={data}
      placeholder={placeholder}
      size="xs"
    />
  )
}
