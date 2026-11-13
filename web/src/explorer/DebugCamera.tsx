import { useState } from 'react';
import { parseCameraPose } from './cameraPose';
import type { CameraPose } from './cameraPose';

/**
 * Only rendered with ?debug=1. The drape placement test types a pose here and submits it, and the
 * Explorer sends it through the one bridge as `debug/setCamera`. A form in the page, not a global,
 * so the test needs no channel into the page besides the DOM. Hidden from sight with CSS, not removed.
 */
export function DebugCamera({ onPose }: { onPose: (pose: CameraPose) => void }) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  return (
    <form
      className="visually-hidden"
      data-testid="debug-camera-form"
      onSubmit={(event) => {
        event.preventDefault();
        const pose = parseCameraPose(text);
        if (pose) {
          setProblem('');
          onPose(pose);
        } else {
          setProblem('The pose is not valid.');
        }
      }}
    >
      <label>
        Camera pose (debug)
        <textarea data-testid="debug-camera-input" value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <button type="submit" data-testid="debug-camera-send">
        Send camera pose
      </button>
      <span role="status" data-testid="debug-camera-problem">
        {problem}
      </span>
    </form>
  );
}
