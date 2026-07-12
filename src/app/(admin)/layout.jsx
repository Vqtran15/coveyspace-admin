import AdminNav from '@/components/AdminNav'
import PageTransition from '@/components/PageTransition'

export default function AdminLayout({ children }) {
  return (
    <div className="h-screen flex overflow-hidden">
      <AdminNav />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <PageTransition>
          {children}
        </PageTransition>
      </div>
    </div>
  )
}
