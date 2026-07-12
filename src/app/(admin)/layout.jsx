import AdminNav from '@/components/AdminNav'

export default function AdminLayout({ children }) {
  return (
    <div className="h-screen flex overflow-hidden">
      <AdminNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
