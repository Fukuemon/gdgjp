/**
 * Follows a moving target exactly while it moves continuously (playback), but
 * glides with a critically damped spring across discontinuities (a seek, a
 * cancelled scrub, a resync after reconnect).
 */
export class Smoother {
  value: number | null = null;
  private velocity = 0;
  private springing = false;

  constructor(
    /** Jumps larger than this (target units) glide instead of snapping. */
    private readonly jump: number,
    private readonly omega = 16,
  ) {}

  step(target: number, dtMs: number, instant = false): number {
    if (this.value === null || instant) {
      this.value = target;
      this.velocity = 0;
      this.springing = false;
      return target;
    }
    const diff = target - this.value;
    if (!this.springing && Math.abs(diff) > this.jump) this.springing = true;
    if (!this.springing) {
      this.value = target;
      return target;
    }
    const dt = Math.min(dtMs, 64) / 1000;
    // Critically damped spring: x'' = -ω²(x - target) - 2ωx'
    const accel = this.omega * this.omega * diff - 2 * this.omega * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    if (Math.abs(target - this.value) < this.jump * 0.02 && Math.abs(this.velocity) < this.jump) {
      this.value = target;
      this.velocity = 0;
      this.springing = false;
    }
    return this.value;
  }
}
