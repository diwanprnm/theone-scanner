/**
 * PWA install. Chrome/Edge fire `beforeinstallprompt` once, usually before React
 * mounts, so the event is captured at module load — a listener inside useEffect
 * races the browser and loses, which leaves the app offering manual instructions
 * when it could have opened the real install dialog.
 */
import { useEffect, useState } from 'react'

interface PromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const ua = navigator.userAgent
const isIOS = /iPhone|iPad|iPod/.test(ua)

let deferred: PromptEvent | null = null
const watchers = new Set<(e: PromptEvent | null) => void>()

const notify = (e: PromptEvent | null) => {
  deferred = e
  watchers.forEach((w) => w(e))
}

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  notify(e as PromptEvent)
})
addEventListener('appinstalled', () => notify(null))

export function useInstall() {
  const [event, setEvent] = useState<PromptEvent | null>(deferred)
  const [installed, setInstalled] = useState(
    () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
  )

  useEffect(() => {
    watchers.add(setEvent)
    const onInstalled = () => setInstalled(true)
    addEventListener('appinstalled', onInstalled)
    return () => {
      watchers.delete(setEvent)
      removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!event) return false
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') setInstalled(true)
    notify(null)
    return outcome === 'accepted'
  }

  // No event means this browser has no programmatic install: name the path it does have.
  const hint = isIOS
    ? 'Di Safari: tombol Bagikan, lalu Tambah ke Layar Utama.'
    : /Firefox/.test(ua)
      ? 'Firefox tidak bisa memasang PWA. Buka di Chrome atau Edge.'
      : 'Di Chrome/Edge: ikon pasang di bilah alamat, atau menu ⋮ lalu Pasang aplikasi.'

  return { canInstall: !!event && !installed, installed, install, hint }
}
