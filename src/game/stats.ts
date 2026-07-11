/** Per-fighter combat counters for a single match. */
export interface CombatStats {
  damageDealt: number;
  damageTaken: number;
  blocks: number;
  parries: number;
  kos: number;
  deaths: number;
  distanceM: number;
  peakPressure: number;
  shotsFired: number;
  hitsLanded: number;
}

export function emptyStats(): CombatStats {
  return {
    damageDealt: 0,
    damageTaken: 0,
    blocks: 0,
    parries: 0,
    kos: 0,
    deaths: 0,
    distanceM: 0,
    peakPressure: 0,
    shotsFired: 0,
    hitsLanded: 0,
  };
}

export class MatchStatsTracker {
  private stats = new Map<number, CombatStats>();

  ensure(id: number): CombatStats {
    let s = this.stats.get(id);
    if (!s) {
      s = emptyStats();
      this.stats.set(id, s);
    }
    return s;
  }

  get(id: number): CombatStats {
    return this.ensure(id);
  }

  getAll(): Map<number, CombatStats> {
    return this.stats;
  }

  recordDamage(attackerId: number, victimId: number, amount: number): void {
    if (amount <= 0) return;
    this.ensure(attackerId).damageDealt += amount;
    this.ensure(victimId).damageTaken += amount;
    this.ensure(attackerId).hitsLanded++;
  }

  recordBlock(defenderId: number, parry: boolean): void {
    const s = this.ensure(defenderId);
    s.blocks++;
    if (parry) s.parries++;
  }

  recordDistance(id: number, meters: number): void {
    this.ensure(id).distanceM += meters;
  }

  recordPeakPressure(id: number, pressure: number): void {
    const s = this.ensure(id);
    if (pressure > s.peakPressure) s.peakPressure = pressure;
  }

  recordShot(id: number): void {
    this.ensure(id).shotsFired++;
  }

  recordKO(attackerId: number, victimId: number): void {
    this.ensure(attackerId).kos++;
    this.ensure(victimId).deaths++;
  }
}
