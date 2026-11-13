import { useEffect, useRef, useState } from 'react';
import { readTokens } from '../plate/colours';
import { plateToTile } from '../plate/plateView';
import type { Rect, Size } from '../plate/plateView';
import { useImage } from '../plate/useImage';
import type { ProposalFeature } from './reviewModel';

const BOX_W = 296;
const BOX_H = 200;

/**
 * The current proposal on the plate, at the tile's own resolution: one tile pixel is one screen
 * pixel, no smoothing, no sharpening (a source image is evidence). The outline is drawn over it in
 * `ink`. The tile is the published map-area image; the full-resolution plate is not served to the
 * browser, so this is the sharpest crop the page has.
 */
export function ProposalCrop({ proposal, imageUrl, tile, crop }: { proposal: ProposalFeature; imageUrl: string; tile: Size; crop: Rect }) {
  const image = useImage(imageUrl);
  const ref = useRef<HTMLCanvasElement>(null);
  const [ink, setInk] = useState('');
  useEffect(() => setInk(readTokens().ink), []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image || !ink) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = proposal.properties.crop_px;
    const a = plateToTile({ x: c.x, y: c.y }, crop, tile);
    const b = plateToTile({ x: c.x + c.width, y: c.y + c.height }, crop, tile);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const sx = Math.round(cx - BOX_W / 2);
    const sy = Math.round(cy - BOX_H / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, BOX_W, BOX_H);
    ctx.drawImage(image, sx, sy, BOX_W, BOX_H, 0, 0, BOX_W, BOX_H);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    proposal.properties.pixel_polygon.forEach(([x, y], i) => {
      const t = plateToTile({ x, y }, crop, tile);
      if (i === 0) ctx.moveTo(t.x - sx, t.y - sy);
      else ctx.lineTo(t.x - sx, t.y - sy);
    });
    ctx.closePath();
    ctx.stroke();
  }, [image, ink, proposal, crop, tile]);

  return (
    <canvas
      ref={ref}
      width={BOX_W}
      height={BOX_H}
      className="proposal-crop"
      data-testid="proposal-crop"
      role="img"
      aria-label="The current proposal, cut from the plate image at its own resolution, with its outline drawn on it"
    />
  );
}
