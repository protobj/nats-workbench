/**
 * NATS 连接配置表单。
 * 支持标签、服务器 URL、认证方式（无、令牌、
 * 用户/密码、nkey、JWT、TLS）以及高级选项，如重连、
 * 超时、回显和连接名。
 *
 * @file 连接配置表单
 */
import { useState, useEffect } from 'react'
import { TextInput, Textarea, NumberInput, Switch, Group, Stack, Radio, Divider } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ConnectionConfig, AuthMethod } from '@/types'

/** 连接配置表单的属性。 */
interface Props { value: ConnectionConfig; onChange: (config: ConnectionConfig) => void }

export function ConnectionForm({ value, onChange }: Props) {
  const { t } = useTranslation()
  const [form, setForm] = useState<ConnectionConfig>(() => JSON.parse(JSON.stringify(value)))

  useEffect(() => { setForm(JSON.parse(JSON.stringify(value))) }, [value])

  function update(partial: Partial<ConnectionConfig>) { const next = { ...form, ...partial }; setForm(next); onChange(JSON.parse(JSON.stringify(next))) }
  function updateAuth(partial: Partial<AuthMethod & { type: string }>) {
    const current = form.auth as any
    if (partial.type && partial.type !== current.type) {
      const base: any = { type: partial.type }
      if (partial.type === 'token') base.token = ''
      else if (partial.type === 'user_password') { base.username = ''; base.password = '' }
      else if (partial.type === 'nkey') base.nkey_seed = ''
      else if (partial.type === 'jwt') { base.jwt = ''; base.nkey_seed = '' }
      else if (partial.type === 'tls') { base.ca_cert_path = null; base.client_cert_path = ''; base.client_key_path = '' }
      update({ auth: base })
    } else update({ auth: { ...current, ...partial } })
  }
  function updateOptions(partial: Partial<ConnectionConfig['options']>) { update({ options: { ...form.options, ...partial } }) }

  const auth = form.auth as any; const authType = auth.type || 'none'

  return (
    <Stack gap="xs">
      <TextInput label={t('connections.label')} value={form.label} onChange={(e) => update({ label: e.target.value })} placeholder="My NATS Server" required />
      <TextInput label={t('connections.servers')} value={form.servers.join(', ')} onChange={(e) => update({ servers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="nats://localhost:4222" required />

      <Radio.Group label={t('auth.authentication')} value={authType} onChange={(v: string) => updateAuth({ type: v as any })}>
        <Group mt={4}>
          <Radio value="none" label={t('auth.none')} size="xs" />
          <Radio value="token" label={t('auth.token')} size="xs" />
          <Radio value="user_password" label={t('auth.userPassword')} size="xs" />
          <Radio value="nkey" label={t('auth.nkey')} size="xs" />
          <Radio value="jwt" label={t('auth.jwt')} size="xs" />
          <Radio value="tls" label={t('auth.tls')} size="xs" />
        </Group>
      </Radio.Group>

      {authType === 'token' && <TextInput label={t('auth.token')} type="password" value={auth.token || ''} onChange={(e) => updateAuth({ token: e.target.value })} />}
      {authType === 'user_password' && <Group grow><TextInput label={t('auth.username')} value={auth.username || ''} onChange={(e) => updateAuth({ username: e.target.value })} /><TextInput label={t('auth.password')} type="password" value={auth.password || ''} onChange={(e) => updateAuth({ password: e.target.value })} /></Group>}
      {authType === 'nkey' && <TextInput label={t('auth.nkeySeed')} type="password" value={auth.nkey_seed || ''} onChange={(e) => updateAuth({ nkey_seed: e.target.value })} placeholder="SUA..." />}
      {authType === 'jwt' && <><Textarea label={t('auth.jwt')} value={auth.jwt || ''} onChange={(e) => updateAuth({ jwt: e.target.value })} rows={2} /><TextInput label={t('auth.nkeySeed')} type="password" value={auth.nkey_seed || ''} onChange={(e) => updateAuth({ nkey_seed: e.target.value })} /></>}
      {authType === 'tls' && <><TextInput label={t('auth.caCert')} value={auth.ca_cert_path || ''} onChange={(e) => updateAuth({ ca_cert_path: e.target.value || null })} /><TextInput label={t('auth.clientCert')} value={auth.client_cert_path || ''} onChange={(e) => updateAuth({ client_cert_path: e.target.value })} /><TextInput label={t('auth.clientKey')} value={auth.client_key_path || ''} onChange={(e) => updateAuth({ client_key_path: e.target.value })} /></>}

      <Divider label={t('options.title')} labelPosition="center" />

      <Group grow>
        <NumberInput label={t('options.maxReconnects')} value={form.options.max_reconnects ?? 0} onChange={(v) => updateOptions({ max_reconnects: typeof v === 'number' ? v : null })} min={-1} />
        <NumberInput label={t('options.reconnectDelay')} value={form.options.reconnect_delay_ms ?? 0} onChange={(v) => updateOptions({ reconnect_delay_ms: typeof v === 'number' ? v : null })} min={0} />
        <NumberInput label={t('options.timeout')} value={form.options.connection_timeout_ms ?? 0} onChange={(v) => updateOptions({ connection_timeout_ms: typeof v === 'number' ? v : null })} min={0} />
      </Group>
      <Group grow>
        <TextInput label={t('options.connectionName')} value={form.options.name || ''} onChange={(e) => updateOptions({ name: e.target.value || null })} />
        <TextInput label={t('options.inboxPrefix')} value={form.options.inbox_prefix || ''} onChange={(e) => updateOptions({ inbox_prefix: e.target.value || null })} />
      </Group>
      <Group>
        <Switch label={t('options.retryOnFailedConnect')} checked={form.options.retry_on_failed_connect} onChange={(e) => updateOptions({ retry_on_failed_connect: e.target.checked })} />
        <Switch label={t('options.echo')} checked={form.options.echo} onChange={(e) => updateOptions({ echo: e.target.checked })} />
      </Group>
    </Stack>
  )
}
