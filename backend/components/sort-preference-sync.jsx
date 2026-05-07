'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export default function SortPreferenceSync({ storageKey, sortKeys = [] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!storageKey || !sortKeys.length) return

    const key = `sort-pref:${storageKey}`
    const current = {}
    let hasCurrentSort = false

    for (const k of sortKeys) {
      const v = searchParams.get(k)
      if (v !== null && v !== '') {
        current[k] = v
        hasCurrentSort = true
      }
    }

    if (hasCurrentSort) {
      localStorage.setItem(key, JSON.stringify(current))
      return
    }

    const raw = localStorage.getItem(key)
    if (!raw) return

    let saved
    try {
      saved = JSON.parse(raw)
    } catch {
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    let changed = false

    for (const k of sortKeys) {
      const v = saved?.[k]
      if (typeof v === 'string' && v && !params.get(k)) {
        params.set(k, v)
        changed = true
      }
    }

    if (changed) {
      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname)
    }
  }, [storageKey, sortKeys, searchParams, pathname, router])

  return null
}
