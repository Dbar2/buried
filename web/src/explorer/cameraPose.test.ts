import { describe, expect, it } from 'vitest';
import { parseCameraPose } from './cameraPose';

describe('parseCameraPose', () => {
  it('reads a complete pose', () => {
    expect(parseCameraPose('{"target":[632500,4835000.5],"distanceM":170,"pitchDeg":80,"headingDeg":0}')).toEqual({
      target: [632500, 4835000.5],
      distanceM: 170,
      pitchDeg: 80,
      headingDeg: 0,
    });
  });

  it('rejects text that is not JSON, a missing or extra key, and values out of range', () => {
    expect(parseCameraPose('not json')).toBeNull();
    expect(parseCameraPose('null')).toBeNull();
    expect(parseCameraPose('{"target":[1,2],"distanceM":170,"pitchDeg":80}')).toBeNull();
    expect(parseCameraPose('{"target":[1,2],"distanceM":170,"pitchDeg":80,"headingDeg":0,"x":1}')).toBeNull();
    expect(parseCameraPose('{"target":[1],"distanceM":170,"pitchDeg":80,"headingDeg":0}')).toBeNull();
    expect(parseCameraPose('{"target":[1,2],"distanceM":0,"pitchDeg":80,"headingDeg":0}')).toBeNull();
    expect(parseCameraPose('{"target":[1,2],"distanceM":10,"pitchDeg":91,"headingDeg":0}')).toBeNull();
    expect(parseCameraPose('{"target":["1",2],"distanceM":10,"pitchDeg":80,"headingDeg":0}')).toBeNull();
  });
});
