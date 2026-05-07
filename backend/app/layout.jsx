import './globals.css'

export const metadata = {
  title: '194964 Admin',
  description: 'Admin panel for 194964 chatbot'
}

export default function RootLayout({ children }) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  )
}
