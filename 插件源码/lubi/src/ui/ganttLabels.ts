/** Keep the complete label or hide it; never show clipped numbers under resize handles. */
export function fitGanttLabel(bar: HTMLElement): void {
  const label = bar.querySelector<HTMLElement>(".lubi-gantt-bar-label");
  if (!label) return;
  const fits = !!label.textContent && bar.clientWidth > 16 && label.scrollWidth <= bar.clientWidth - 16;
  label.style.visibility = fits ? "visible" : "hidden";
}
export function fitGanttLabels(host: ParentNode): void {
  host.querySelectorAll<HTMLElement>(".lubi-gantt-bar").forEach(fitGanttLabel);
}
