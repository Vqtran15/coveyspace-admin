import { requireAuth } from '@/lib/session'
import { loadClientErrorsAction } from '@/actions/admin'
import ErrorsClient from '@/components/ErrorsClient'

export default async function ErrorsPage() {
  await requireAuth()
  const result = await loadClientErrorsAction()
  return <ErrorsClient initialErrors={result.data ?? []} initialError={result.error ?? null} />
}
