import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import { plateToTile } from '../plate/plateView';
import type { Rect, Size } from '../plate/plateView';
import { useImage } from '../plate/useImage';
import { areaProblems, bannedWarning } from './areaModel';
import type { AreaConfidence, AreaContext } from './areaModel';
import { isTextEntry } from './keymap';
import type { TraceAction, TraceForm } from './traceDraft';
import { useDraft } from './useDraft';

export type TracePanelProps = {
  form: TraceForm;
  dispatch: Dispatch<TraceAction>;
  context: AreaContext;
  sourceId: string;
  imageUrl: string;
  tile: Size;
  crop: Rect;
  /** The plate pixels the pane shows now, so "Add a corner" lands where the reviewer is looking. */
  visible: Rect;
  /** Whether the stage is waiting for a crop drag. */
  choosingCrop: boolean;
  onChooseCrop: (on: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
};

const BOX_W = 296;
const BOX_H = 120;

const CONFIDENCE_LABEL: Record<AreaConfidence, string> = { documented: 'Documented', estimated: 'Estimated', unknown: 'Unknown' };

/** A number field that commits on Enter or blur. */
function NumberField({ label, value, onCommit, testId, min }: { label: string; value: number | ''; onCommit: (n: number) => void; testId: string; min?: number }) {
  const draft = useDraft(String(value), (text) => {
    const n = Number(text);
    if (text.trim() !== '' && Number.isFinite(n)) onCommit(Math.round(n));
  }, String(value));
  return (
    <label className="small">
      {label}
      <input type="number" step={1} min={min} inputMode="numeric" data-testid={testId} {...draft} />
    </label>
  );
}

/** The lettering's crop, at the tile's own resolution, scaled to fit the box. A source image is evidence: no sharpening. */
function ReadPreview({ read, imageUrl, tile, crop }: { read: Rect; imageUrl: string; tile: Size; crop: Rect }) {
  const image = useImage(imageUrl);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image) return;
    const a = plateToTile({ x: read.x, y: read.y }, crop, tile);
    const b = plateToTile({ x: read.x + read.width, y: read.y + read.height }, crop, tile);
    const w = Math.max(1, b.x - a.x);
    const h = Math.max(1, b.y - a.y);
    const scale = Math.min(BOX_W / w, BOX_H / h);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, a.x, a.y, w, h, 0, 0, canvas.width, canvas.height);
  }, [image, read, crop, tile]);
  return <canvas ref={ref} className="proposal-crop" data-testid="read-crop-preview" role="img" aria-label="The crop the use was read from, cut from the plate image" />;
}

/**
 * The trace tool's form (requirement 24.1 and 24.2). The corners are listed as numbers so the whole
 * outline can be made and edited from the keyboard; the plate pane is the quicker way for a mouse.
 * Save is available only when the Service would accept the area, so nothing fails late. Enter closes
 * the outline, Backspace removes the last corner and Escape cancels, while no field has focus.
 */
export function TracePanel({ form, dispatch, context, sourceId, imageUrl, tile, crop, visible, choosingCrop, onChooseCrop, onSave, onCancel }: TracePanelProps) {
  const problems = form.closed ? areaProblems(form, context) : [];
  const warning = bannedWarning(form.use);

  const use = { value: form.use, onChange: (e: { target: { value: string } }) => dispatch({ type: 'setUse', value: e.target.value }) };
  const reason = { value: form.reason, onChange: (e: { target: { value: string } }) => dispatch({ type: 'setReason', value: e.target.value }) };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextEntry(event.target)) return;
      const onControl = event.target instanceof HTMLElement && ['BUTTON', 'A', 'SELECT'].includes(event.target.tagName);
      if (event.key === 'Escape') {
        event.preventDefault();
        if (choosingCrop) onChooseCrop(false);
        else onCancel();
      } else if (event.key === 'Backspace' && !onControl) {
        event.preventDefault();
        dispatch({ type: 'removeLast' });
      } else if (event.key === 'Enter' && !onControl) {
        event.preventDefault();
        dispatch({ type: 'close' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch, onCancel, choosingCrop, onChooseCrop]);

  const centre = { x: Math.round(visible.x + visible.width / 2), y: Math.round(visible.y + visible.height / 2) };
  const readEdit = (patch: Partial<Rect>) => {
    const base = form.read ?? { x: Math.max(crop.x, centre.x - 40), y: Math.max(crop.y, centre.y - 10), width: 80, height: 20 };
    dispatch({ type: 'setRead', read: { ...base, ...patch } });
  };

  return (
    <div className="trace-panel" data-testid="trace-panel" data-closed={form.closed}>
      <h3>{form.editingId ? 'Edit an area' : 'Trace an area'}</h3>
      <p className="muted small">
        Outline the area on the plate: click to place corners. Close the outline with Enter or a double-click. Then type the use as the plate prints it and mark the lettering.
      </p>

      <section aria-labelledby="corners-heading">
        <h4 id="corners-heading">Corners</h4>
        <p className="mono small" data-testid="corner-count" aria-live="polite">
          {form.ring.length} {form.ring.length === 1 ? 'corner' : 'corners'}, {form.closed ? 'closed' : 'open'}
        </p>
        <ol className="corners">
          {form.ring.map((v, i) => (
            <li key={i}>
              <NumberField label={`Corner ${i + 1} x`} value={v[0]} min={0} testId={`corner-x-${i}`} onCommit={(n) => dispatch({ type: 'move', index: i, vertex: [n, v[1]] })} />
              <NumberField label={`Corner ${i + 1} y`} value={v[1]} min={0} testId={`corner-y-${i}`} onCommit={(n) => dispatch({ type: 'move', index: i, vertex: [v[0], n] })} />
              <button type="button" onClick={() => dispatch({ type: 'removeCorner', index: i })} aria-label={`Remove corner ${i + 1}`}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        <div className="actions">
          {!form.closed && (
            <button type="button" onClick={() => dispatch({ type: 'add', vertex: [centre.x, centre.y] })} data-testid="corner-add">
              Add a corner at the centre of the view
            </button>
          )}
          {form.closed ? (
            <button type="button" onClick={() => dispatch({ type: 'reopen' })} data-testid="outline-reopen">
              Reopen the outline
            </button>
          ) : (
            <button type="button" onClick={() => dispatch({ type: 'close' })} disabled={form.ring.length < 4} data-testid="outline-close">
              Close the outline <kbd>Enter</kbd>
            </button>
          )}
          <button type="button" onClick={() => dispatch({ type: 'removeLast' })} disabled={form.ring.length === 0} data-testid="corner-remove-last">
            Remove the last corner <kbd>Backspace</kbd>
          </button>
        </div>
        {!form.closed && form.ring.length < 4 && <p className="muted small">Place at least 4 corners.</p>}
      </section>

      <section aria-labelledby="lettering-heading">
        <h4 id="lettering-heading">Lettering</h4>
        <label>
          Use as lettered on the plate
          <input type="text" autoComplete="off" required data-testid="area-use" {...use} />
        </label>
        <p className="muted small">Type it exactly as printed, in the plate's own words. Buried does not classify it.</p>
        {warning && (
          <p role="status" data-testid="banned-warning">
            {warning}
          </p>
        )}

        <div className="actions">
          <button type="button" aria-pressed={choosingCrop} onClick={() => onChooseCrop(!choosingCrop)} data-testid="read-draw">
            {choosingCrop ? 'Stop drawing the crop' : 'Drag the crop on the plate'}
          </button>
        </div>
        <div className="crop-fields">
          <NumberField label="Crop x" value={form.read?.x ?? ''} min={0} testId="read-x" onCommit={(n) => readEdit({ x: n })} />
          <NumberField label="Crop y" value={form.read?.y ?? ''} min={0} testId="read-y" onCommit={(n) => readEdit({ y: n })} />
          <NumberField label="Width" value={form.read?.width ?? ''} min={1} testId="read-width" onCommit={(n) => readEdit({ width: n })} />
          <NumberField label="Height" value={form.read?.height ?? ''} min={1} testId="read-height" onCommit={(n) => readEdit({ height: n })} />
        </div>
        {form.read ? <ReadPreview read={form.read} imageUrl={imageUrl} tile={tile} crop={crop} /> : <p className="muted small">No crop yet. The crop is the evidence for the lettering.</p>}
      </section>

      <section aria-labelledby="confidence-heading">
        <h4 id="confidence-heading">How sure</h4>
        <label>
          Confidence
          <select value={form.confidence} onChange={(e) => dispatch({ type: 'setConfidence', value: e.target.value as AreaConfidence })} data-testid="area-confidence">
            {(Object.keys(CONFIDENCE_LABEL) as AreaConfidence[]).map((c) => (
              <option key={c} value={c}>
                {CONFIDENCE_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        {form.confidence === 'documented' ? (
          <p className="muted small">Recorded as: Area and use traced by a person from <span className="mono">{sourceId}</span>.</p>
        ) : (
          <label>
            Why
            <input type="text" autoComplete="off" data-testid="area-reason" {...reason} />
          </label>
        )}
      </section>

      {problems.length > 0 && (
        <ul className="blockers" aria-label="What stops this area being saved" data-testid="area-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {!form.closed && <p className="muted small">Close the outline to save it.</p>}

      <div className="actions">
        <button type="button" className="primary" disabled={!form.closed || problems.length > 0} onClick={onSave} data-testid="area-save">
          {form.editingId ? 'Save changes' : 'Save the area'}
        </button>
        <button type="button" onClick={onCancel} data-testid="area-cancel">
          Cancel <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
