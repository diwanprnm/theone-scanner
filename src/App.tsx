import { useEffect, useState } from 'react'
import Library from './components/Library'
import Editor from './components/Editor'

type Route = { name: 'library' } | { name: 'doc'; id: string }

function parseHash(): Route {
  const m = location.hash.match(/^#\/doc\/(.+)$/)
  return m ? { name: 'doc', id: m[1] } : { name: 'library' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  // The row the accent marks in Library: the record opened most recently.
  const [lastOpened, setLastOpened] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const go = (r: Route) => {
    if (r.name === 'doc' && r.id !== 'new') setLastOpened(r.id)
    location.hash = r.name === 'doc' ? `#/doc/${r.id}` : '#/'
    setRoute(r)
  }

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col bg-paper text-ink">
      {route.name === 'library' ? (
        <Library activeId={lastOpened} onOpen={(id) => go({ name: 'doc', id })} />
      ) : (
        <Editor id={route.id} onBack={() => go({ name: 'library' })} />
      )}
    </div>
  )
}