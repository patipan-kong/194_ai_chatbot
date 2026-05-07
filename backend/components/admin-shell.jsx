import Link from 'next/link'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/alert-threshold-settings', label: 'Alert Threshold Settings' },
  { href: '/system-setting', label: 'System Setting' },
  { href: '/prompt-playground', label: 'Prompt Playground' },
  { href: '/knowledge-base', label: 'Knowledge Base' },
  { href: '/interactions', label: 'Interactions' },
  { href: '/pending', label: 'Pending Review' },
  { href: '/admin-users', label: 'Admin Users' },
  { href: '/reports/model', label: 'Model Report' },
  { href: '/reports/search', label: 'Search Analytics' },
  { href: '/audit-logs', label: 'Audit Logs' }
]

export default function AdminShell({ title, children }) {
  return (
    <div className='min-h-dvh grid grid-cols-[280px_1fr]'>
      <aside className='bg-ink text-white p-5'>
        <h1 className='text-xl font-semibold mb-6'>194964 Admin</h1>
        <nav className='space-y-2'>
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className='block rounded-lg px-3 py-2 text-sm hover:bg-white/10'>
              {item.label}
            </Link>
          ))}
        </nav>
        <form action='/api/auth/logout' method='post' className='mt-8'>
          <button className='w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold'>Logout</button>
        </form>
      </aside>
      <main className='p-6'>
        <header className='mb-5'>
          <h2 className='text-2xl font-semibold'>{title}</h2>
        </header>
        {children}
      </main>
    </div>
  )
}
