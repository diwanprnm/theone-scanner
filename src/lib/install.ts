/**
 * PWA install. `beforeinstallprompt` fires once and early, so index.html grabs it
 * into `window.__bip` before the bundle even loads. A listener registered here
 * races the browser and usually loses, which leaves the button stuck on manual
 * instructions when it could have opened the real install dialog.
 */
import { useEffect, useState } from 'react'

interface PromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __bip?: PromptEvent | null
  }
}

const ua = navigator.userAgent
const isIOS = /iPhone|iPad|iPod/.test(ua)

export function useInstall() {
  const [event, setEvent] = useState<PromptEvent | null>(() => window.__bip ?? null)
  const [installed, setInstalled] = useState(
    () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
  )

  useEffect(() => {
    const sync = () => setEvent(window.__bip ?? null)
    const onInstalled = () => {
      setInstalled(true)
      setEvent(null)
    }
    addEventListener('bipready', sync)
    addEventListener('appinstalled', onInstalled)
    return () => {
      removeEventListener('bipready', sync)
      removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!event) return false
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') setInstalled(true)
    window.__bip = null
    setEvent(null)
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
