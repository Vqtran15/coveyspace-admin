import { requireAuth } from '@/lib/session'
import { loadGroups } from '@/actions/admin'
import DashboardClient from '@/components/DashboardClient'
import IdleLogout from '@/components/IdleLogout'

export default async function DashboardPage() {
  await requireAuth()
  const { data: groups = [] } = await loadGroups()

  return (
    <>
      <IdleLogout />
      <DashboardClient initialGroups={groups} />
    </>
  )
}
