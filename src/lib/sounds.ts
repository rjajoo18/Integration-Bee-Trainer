export type SoundType = 'correct' | 'wrong' | 'opponent' | 'roundStart' | 'win' | 'lose';

export function playSound(type: SoundType, muted: boolean): void {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx() as AudioContext;

    function tone(freq: number, duration: number, startAt: number, type: OscillatorType = 'sine', volume = 0.2) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(volume, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      osc.start(startAt);
      osc.stop(startAt + duration);
    }

    switch (type) {
      case 'correct':
        // Ascending chime: E5 → G5
        tone(659, 0.45, ctx.currentTime, 'sine', 0.28);
        tone(784, 0.35, ctx.currentTime + 0.12, 'sine', 0.22);
        break;
      case 'wrong':
        // Low sawtooth buzz
        tone(110, 0.3, ctx.currentTime, 'sawtooth', 0.18);
        break;
      case 'opponent':
        // Soft neutral ping
        tone(440, 0.25, ctx.currentTime, 'sine', 0.12);
        break;
      case 'roundStart':
        // Short high tick
        tone(900, 0.15, ctx.currentTime, 'sine', 0.14);
        break;
      case 'win':
        // C5 → E5 → G5 ascending triple
        [523, 659, 784].forEach((freq, i) => tone(freq, 0.3, ctx.currentTime + i * 0.15, 'sine', 0.22));
        break;
      case 'lose':
        // G4 → E4 → C4 descending triple
        [392, 330, 262].forEach((freq, i) => tone(freq, 0.3, ctx.currentTime + i * 0.15, 'sine', 0.18));
        break;
    }

    setTimeout(() => ctx.close(), 2000);
  } catch {
    // AudioContext unavailable or blocked — fail silently
  }
}
