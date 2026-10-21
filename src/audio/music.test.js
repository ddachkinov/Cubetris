import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MusicEngine } from './music.js';

// Just enough of an AudioContext for the scheduler: a clock the test moves by
// hand, and nodes that accept every call. Notes are counted at _playStep.
function fakeContext() {
  const param = () => ({
    value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
  });
  const node = () => ({
    gain: param(), frequency: param(), Q: param(), type: '',
    connect(n) { return n; }, start() {}, stop() {},
  });
  return {
    currentTime: 0,
    sampleRate: 44100,
    destination: node(),
    createGain: node,
    createBiquadFilter: node,
    createOscillator: node,
    createBufferSource: node,
    createBuffer: () => ({ getChannelData: () => new Float32Array(16) }),
  };
}

describe('MusicEngine scheduling', () => {
  let ctx, engine, played;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = fakeContext();
    engine = new MusicEngine(ctx);
    played = [];
    engine._playStep = (step, time) => played.push({ step, time, at: ctx.currentTime });
    engine.start();
  });

  afterEach(() => {
    engine.pause();
    vi.useRealTimers();
  });

  // Advance the audio clock and the scheduler's timer together
  function play(seconds, { timers = true } = {}) {
    const ms = 30;
    for (let t = 0; t < seconds * 1000; t += ms) {
      ctx.currentTime += ms / 1000;
      if (timers) vi.advanceTimersByTime(ms);
    }
  }

  it('schedules a steady stream of steps, each ahead of the clock', () => {
    play(2);
    expect(played.length).toBeGreaterThan(10);
    expect(played.every((n) => n.time >= n.at)).toBe(true);
  });

  it('plays nothing while paused, and no burst on resume after a long gap', () => {
    play(1);
    engine.pause();
    const before = played.length;
    play(5, { timers: false }); // the clock runs on, the scheduler doesn't
    expect(played.length).toBe(before);

    engine.resume();
    vi.advanceTimersByTime(30);
    const burst = played.slice(before);
    // One tick schedules ~0.12 s of lookahead: at most a couple of 16ths,
    // and none of them in the past
    expect(burst.length).toBeLessThanOrEqual(3);
    expect(burst.every((n) => n.time >= ctx.currentTime)).toBe(true);
  });

  it('without resync a stalled scheduler would burst; the lag guard skips instead', () => {
    play(1);
    // The timer stalls for 3 s while the clock runs (a throttled hidden tab)
    play(3, { timers: false });
    const before = played.length;
    vi.advanceTimersByTime(30);
    expect(played.length - before).toBeLessThanOrEqual(3);
  });

  it('resync keeps the bar position', () => {
    play(1);
    const step = engine.step;
    engine.resync();
    expect(engine.step).toBe(step);
    expect(engine.nextStepTime).toBeCloseTo(ctx.currentTime + 0.1, 5);
  });
});
