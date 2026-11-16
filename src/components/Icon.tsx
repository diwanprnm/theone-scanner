/**
 * One icon set, drawn as square-cornered 1.5px strokes so it belongs to the
 * print language of the rest of the UI. Icons here name an action that already
 * has a label; none of them is decoration.
 */
type Name =
  | 'scan'
  | 'export'
  | 'save'
  | 'trash'
  | 'import'
  | 'upload'
  | 'backup'
  | 'share'
  | 'download'
  | 'rotate'
  | 'crop'
  | 'reset'
  | 'install'
  | 'plus'
  | 'left'
  | 'right'
  | 'close'
  | 'camera'
  | 'pencil'

const PATHS: Record<Name, React.ReactNode> = {
  // A sheet behind a viewfinder corner: scan.
  scan: (
    <>
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <path d="M8 9h8M8 12h8M8 15h5" />
    </>
  ),
  // Sheet leaving the stack: export.
  export: (
    <>
      <path d="M12 15V3m0 0L8 7m4-4l4 4" />
      <path d="M4 14v6h16v-6" />
    </>
  ),
  save: (
    <>
      <path d="M4 4h12l4 4v12H4z" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  // Sheet entering the stack: import.
  import: (
    <>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
      <path d="M4 18h16" />
    </>
  ),
  // Same arrow, lifting out of the tray: gallery upload.
  upload: (
    <>
      <path d="M12 16V4m0 0L8 8m4-4l4 4" />
      <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
    </>
  ),
  // Sheet with an archive box: backup.
  backup: (
    <>
      <path d="M3 6h18v4H3zM5 10v10h14V10" />
      <path d="M10 14h4" />
    </>
  ),
  share: (
    <>
      <path d="M8 12l8-4M8 12l8 4" />
      <path d="M5 12a2 2 0 104 0 2 2 0 10-4 0M15 7a2 2 0 104 0 2 2 0 10-4 0M15 17a2 2 0 104 0 2 2 0 10-4 0" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
      <path d="M4 19h16" />
    </>
  ),
  rotate: <path d="M20 11a8 8 0 10-3 6.2M20 5v6h-6" />,
  // Crop bracket, the same shape as the page's trim marks.
  crop: (
    <>
      <path d="M6 2v16h16" />
      <path d="M2 6h16v16" />
    </>
  ),
  reset: (
    <>
      <path d="M4 11a8 8 0 113 6.2" />
      <path d="M4 5v6h6" />
    </>
  ),
  install: (
    <>
      <path d="M12 3v10m0 0l-4-4m4 4l4-4" />
      <path d="M4 15v5h16v-5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  left: <path d="M14 6l-6 6 6 6" />,
  right: <path d="M10 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  camera: (
    <>
      <path d="M3 8h3l1.5-2h9L18 8h3v11H3z" />
      <path d="M9 13.5a3 3 0 106 0 3 3 0 10-6 0" />
    </>
  ),
  // A pencil has to survive 12px, so it is one closed diagonal body and a nib,
  // not an outline with an inner line that fills in at small sizes.
  pencil: (
    <>
      <path d="M3 21l1.5-5L16 4.5 19.5 8 8 19.5 3 21z" />
      <path d="M14 6.5l3.5 3.5" />
    </>
  ),
}

export default function Icon({
  name,
  size = 14,
  className = '',
}: {
  name: Name
  size?: number
  className?: string
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  )
}
