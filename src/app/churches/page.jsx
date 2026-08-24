import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/session'
import { loadChurchesAction } from '@/actions/admin'
import ChurchesClient from '@/components/ChurchesClient'
import AdminNav from '@/components/AdminNav'

export const metadata = { title: 'Churches — Covey Space Admin' }

export default async function ChurchesPage() {
  try {
    await requireAuth()
  } catch {
    redirect('/login')
  }

  const { data: churches } = await loadChurchesAction().catch(() => ({ data: [] }))

  return (
    <div className="h-screen flex overflow-hidden">
      <AdminNav activeView="churches" />
      <div className="flex-1 flex flex-col overflow-hidden bg-sunrise-50">
        <div className="bg-white border-b border-stone-100 px-6 py-3 flex gap-6 text-sm items-center shrink-0">
          <span className="text-stone-500">Church management</span>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <ChurchesClient initialChurches={churches ?? []} />
        </div>
      </div>
    </div>
  )
}
