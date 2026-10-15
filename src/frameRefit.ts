/**
 * Decides when an embedded map should refit to its frame as the frame resizes.
 *
 * The editor fits once after the first layout. An embed's frame can change
 * size afterwards (the page reflows, the window resizes, a hidden embed is
 * shown), which leaves the map off-centre in the new frame. Feed this every
 * observed frame size; it calls `fit` when the size actually changed.
 *
 * - The first non-empty size is the baseline the initial fit already covers.
 * - A zero-sized frame (hidden or not yet laid out) is ignored; if the frame
 *   was empty before its first real size, the initial fit ran against nothing,
 *   so that first real size refits too.
 */
export function createFrameRefitter(fit: () => void): (size: { width: number; height: number }) => void {
  let last: { width: number; height: number } | null = null;
  let sawEmpty = false;
  return (size) => {
    const width = Math.round(size.width);
    const height = Math.round(size.height);
    if (width <= 0 || height <= 0) {
      sawEmpty = true;
      return;
    }
    const previous = last;
    last = { width, height };
    if (previous === null) {
      if (sawEmpty) fit();
      return;
    }
    if (previous.width !== width || previous.height !== height) fit();
  };
}
