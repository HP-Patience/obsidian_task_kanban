/** Position outside the dragged block, using actual viewport geometry and visible text. */
export function positionDragReadout(readout: HTMLElement, target: HTMLElement, scroller: HTMLElement, tl: HTMLElement, wrap: HTMLElement, atEnd = false): void {
    const blockRect = target.getBoundingClientRect(), wrapRect = wrap.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect(), bodyRect = wrap.closest(".lubi-body")?.getBoundingClientRect();
    const topBound = Math.max(viewport.top + 2, bodyRect?.top || 0), bottomBound = Math.min(viewport.bottom - 2, bodyRect?.bottom || window.innerHeight);
    const width = readout.offsetWidth || 80, height = readout.offsetHeight || 18;
    const x = Math.max(viewport.left + 2, blockRect.left - width - 4);
    const preferred = Math.max(topBound, Math.min(bottomBound - height, atEnd ? blockRect.bottom - height - 4 : blockRect.top + 4));
    const texts = Array.from(tl.querySelectorAll<HTMLElement>(".lubi-block-title,.lubi-block-time,.lubi-block-dur,.lubi-plan-title,.lubi-plan-time,.lubi-hour-label,.lubi-now-label,.lubi-pin,.lubi-plan-lane-title"))
      .filter(el => !el.hidden && window.getComputedStyle(el).visibility !== "hidden" && window.getComputedStyle(el).display !== "none")
      .map(el => el.getBoundingClientRect()).filter(r => r.bottom > topBound && r.top < bottomBound && r.width > 0 && r.right > x && r.left < x + width);
    const free = (y: number) => texts.every(r => r.bottom + 2 <= y || r.top - 2 >= y + height);
    let y = preferred;
    for (let distance = 0; distance <= bottomBound - topBound; distance += 2) {
      const candidates = [preferred - distance, preferred + distance];
      const found = candidates.find(value => value >= topBound && value + height <= bottomBound && free(value));
      if (found !== undefined) { y = found; break; }
    }
    readout.style.left = `${x - wrapRect.left}px`;
    readout.style.top = `${y - wrapRect.top}px`;
}
