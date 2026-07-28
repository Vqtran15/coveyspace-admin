import { requireAuth } from '@/lib/session'
import { loadAdminsBroadcastHistoryAction } from '@/actions/admin'
import BroadcastAdminsClient from '@/components/BroadcastAdminsClient'

export default async function BroadcastAdminsPage() {
  await requireAuth()
  const { data: history = [] } = await loadAdminsBroadcastHistoryAction().catch(() => ({ data: [] }))
  return <BroadcastAdminsClient initialHistory={history} />
}
