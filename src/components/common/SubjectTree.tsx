/**
 * NATS 主题层级树视图。
 * 从点分隔的主题字符串（如 "foo.bar.baz"）构建字典树，
 * 并将其渲染为可折叠的 Mantine Tree 组件。支持点击选择，
 * 用于浏览发现的主题和订阅。
 *
 * @file 主题字典树视图
 */
import { useMemo } from 'react'
import { Tree, type TreeNodeData } from '@mantine/core'

/** 用于构建主题层级结构的内部字典树节点。 */
interface SubjectNode {
  label: string
  value: string
  fullPath: string
  children?: SubjectNode[]
}

function buildTree(subjects: string[]): SubjectNode[] {
  const root: SubjectNode[] = []
  const map = new Map<string, SubjectNode>()

  for (const subject of subjects) {
    const parts = subject.split('.')
    let currentPath = ''
    let parentList = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}.${part}` : part
      const isLast = i === parts.length - 1

      if (!map.has(currentPath)) {
        const node: SubjectNode = {
          label: part,
          value: currentPath,
          fullPath: subject,
          children: [],
        }
        map.set(currentPath, node)
        parentList.push(node)
        parentList = node.children!
      } else {
        const existing = map.get(currentPath)!
        if (isLast) {
          existing.fullPath = subject
        }
        parentList = existing.children || []
      }
    }
  }

  return root
}

function toMantineTree(nodes: SubjectNode[], onSelect: (subject: string) => void): TreeNodeData[] {
  return nodes.map((n) => ({
    label: n.label,
    value: n.fullPath || n.value,
    children: n.children && n.children.length > 0 ? toMantineTree(n.children, onSelect) : undefined,
    nodeProps: {
      onClick: () => onSelect(n.fullPath || n.value),
    },
  }))
}

/** 主题树组件的属性。 */
interface Props {
  subjects: string[]
  onSelect: (subject: string) => void
}

export function SubjectTree({ subjects, onSelect }: Props) {
  const tree = useMemo(() => {
    const nodes = buildTree(subjects)
    return toMantineTree(nodes, onSelect)
  }, [subjects, onSelect])

  if (tree.length === 0) return null

  return (
    <Tree
      data={tree}
      levelOffset={20}
      selectOnClick
      clearSelectionOnOutsideClick
    />
  )
}
