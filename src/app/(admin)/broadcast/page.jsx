import { requireAuth } from '@/lib/session'
import { loadBroadcastHistoryAction } from '@/actions/admin'
import BroadcastClient from '@/components/BroadcastClient'

export default async function BroadcastPage() {
  await requireAuth()
  const { data: history = [] } = await loadBroadcastHistoryAction().catch(() => ({ data: [] }))
  return <BroadcastClient initialHistory={history} />
}
