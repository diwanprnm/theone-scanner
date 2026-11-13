/**
 * The page's identity motif: four 2px ink brackets marking the trim area, inset
 * from the edge of the sheet. The same bracket shape becomes the crop handle on
 * the Potong screen, which is why the motif belongs to this product and not to
 * generic app chrome.
 *
 * `bottom` lifts the lower pair clear of a full-width action bar sitting at the
 * base of the screen.
 */
export default function CropMarks({ bottom = 'bottom-3' }: { bottom?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-x-3 top-3 z-10 ${bottom}`}>
      <span className="absolute left-0 top-0 h-[18px] w-[18px] border-l-2 border-t-2 border-ink" />
      <span className="absolute right-0 top-0 h-[18px] w-[18px] border-r-2 border-t-2 border-ink" />
      <span className="absolute bottom-0 left-0 h-[18px] w-[18px] border-b-2 border-l-2 border-ink" />
      <span className="absolute bottom-0 right-0 h-[18px] w-[18px] border-b-2 border-r-2 border-ink" />
    </div>
  )
}
