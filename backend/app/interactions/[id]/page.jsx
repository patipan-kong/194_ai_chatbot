import AdminShell from '@/components/admin-shell'
import ChatHistoryModal from '@/components/chat-history-modal'
import { apiGet } from '@/lib/admin-api'

export default async function InteractionDetailPage({ params }) {
  const { id } = await params
  const interactionId = Number(id)
  const data = await apiGet(`/api/admin/interactions/${id}`)
  const item = data.item
  const isMissing = item?.pendingReview?.source === 'UNKNOWN_ANSWER'

  return (
    <AdminShell title={`Interaction #${id}`}>
      {!item ? (
        <div className='card'>Not found</div>
      ) : (
        <div className='space-y-4'>
          {/* header actions */}
          <div className='flex items-center gap-3 flex-wrap'>
            <ChatHistoryModal interactionId={interactionId} />
            {item.isThumbUp === true && (
              <span className='rounded-full px-3 py-1 text-sm font-medium bg-green-100 text-green-700'>👍 Thumb Up</span>
            )}
            {item.isThumbUp === false && (
              <span className='rounded-full px-3 py-1 text-sm font-medium bg-red-100 text-red-700'>👎 Thumb Down</span>
            )}
            {isMissing && (
              <span className='rounded-full px-3 py-1 text-sm font-medium bg-orange-100 text-orange-700'>⚠ Missing Answer</span>
            )}
          </div>

          <div className='card grid grid-cols-2 gap-4'>
            <div>
              <p className='text-xs text-slate-500'>Model</p>
              <p className='font-medium'>{item.modelId}</p>
            </div>
            <div>
              <p className='text-xs text-slate-500'>User ID</p>
              <p className='font-medium text-xs break-all'>{item.userId}</p>
            </div>
            <div>
              <p className='text-xs text-slate-500'>Created</p>
              <p className='font-medium'>{new Date(item.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <p className='text-xs text-slate-500'>Latency</p>
              <p className='font-medium'>{((item.responseTime || 0) / 1000).toFixed(2)} s</p>
            </div>
            <div>
              <p className='text-xs text-slate-500'>Tokens</p>
              <p className='font-medium'>in: {item.inputTokens || 0} / out: {item.outputTokens || 0}</p>
            </div>
            <div>
              <p className='text-xs text-slate-500'>Cost</p>
              <p className='font-medium'>${(item.cost || 0).toFixed(6)}</p>
            </div>
          </div>

          <div className='card'>
            <p className='text-xs text-slate-500 mb-2'>Question</p>
            <p className='whitespace-pre-wrap'>{item.userQuestion}</p>
          </div>

          <div className='card'>
            <p className='text-xs text-slate-500 mb-2'>AI Response</p>
            <p className='whitespace-pre-wrap'>{item.aiResponse}</p>
          </div>

          <div className='card'>
            <p className='text-xs text-slate-500 mb-2'>Prompt Template Used (Version {data.promptVersionUsed || '-'})</p>
            <pre className='whitespace-pre-wrap text-xs'>{data.promptTemplateUsed || '-'}</pre>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
