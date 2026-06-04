// Visual + feedback tokens aligned with scale-measure-prototype (GitHub:
// madhumadhupria/scale-measure-prototype).

export const MEASURE_DISTANCE_VISUAL = {
	committed: '#46d39a',
	active: '#4ea1ff',
	snapReal: '#5cb0ff',
	snapDetent: '#7d8893',
	labelBgDark: 'rgba(15, 18, 22, 0.85)',
	labelBgLight: 'rgba(255, 255, 255, 0.92)',
	pulseRing: 'rgba(92, 176, 255,',
	committedHex: 0x46d39a,
	activeHex: 0x4ea1ff,
	snapRealHex: 0x5cb0ff,
	lineWidth: 2,
	activeDash: [6, 5] as const,
	pulseDurationMs: 300,
} as const;

export const MEASURE_SNAP_AUDIO_HZ: Record<string, number> = {
	endpoint: 900,
	intersection: 780,
	midpoint: 670,
	on: 560,
};

export const MEASURE_SNAP_AUDIBLE = new Set(['endpoint', 'intersection', 'midpoint']);

export const MEASURE_COMMIT_CHORD_HZ = [660, 990] as const;

export const MEASURE_DISTANCE_ROOT_CLASS = 'priyam-measure-distance-theme';
export const MEASURE_DISTANCE_ACTIVE_CLASS = 'priyam-measure-distance-active';
