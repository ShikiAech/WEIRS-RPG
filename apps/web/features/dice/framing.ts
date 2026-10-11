type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

// Fit projected dice bounds, with breathing room for edges and no fixed empty floor.
export function diceFrustum(bounds: Bounds, width: number, height: number) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const halfHeight =
    Math.max((bounds.maxY - bounds.minY) / 2, (bounds.maxX - bounds.minX) / (2 * aspect), 0.1) *
    1.12;
  const x = (bounds.minX + bounds.maxX) / 2;
  const y = (bounds.minY + bounds.maxY) / 2;
  return {
    left: x - halfHeight * aspect,
    right: x + halfHeight * aspect,
    top: y + halfHeight,
    bottom: y - halfHeight,
  };
}
