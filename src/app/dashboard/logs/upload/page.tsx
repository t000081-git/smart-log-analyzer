import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import UploadForm from './UploadForm'

export const dynamic = 'force-dynamic'

export default async function UploadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          href="/dashboard/logs"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Logs
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">Upload Logs</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Upload a log file to parse and add its events to the analyzer.
          AI clustering runs automatically after ingestion.
        </p>
      </div>

      <UploadForm />

      <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Supported formats
        </h2>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li>
            <span className="font-medium text-zinc-300">Linux syslog</span>
            {' '}— RFC 3164 (<code className="text-xs text-zinc-400">/var/log/syslog</code>,{' '}
            <code className="text-xs text-zinc-400">/var/log/messages</code>) and RFC 5424
          </li>
          <li>
            <span className="font-medium text-zinc-300">PRTG CSV</span>
            {' '}— Historic Data export from PRTG Network Monitor (comma or tab delimited)
          </li>
          <li>
            <span className="font-medium text-zinc-300">Generic text</span>
            {' '}— any line-delimited log; severity auto-detected from keywords
            (ERROR, WARN, INFO, DEBUG, CRITICAL)
          </li>
        </ul>
        <p className="mt-3 text-xs text-zinc-600">
          Max file size: 4 MB · Max events per upload: 2,000
        </p>
      </div>
    </div>
  )
}
