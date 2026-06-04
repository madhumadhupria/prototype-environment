// Snap feedback tokens (scale-measure-prototype).

export const MEASURE_SNAP_RING = {
	color: 'rgba(92, 176, 255,',
	innerColor: 'rgba(92, 176, 255, 0.55)',
	pulseDurationMs: 300,
	pulseStartRadius: 8,
	pulseExpand: 16,
	breatheMin: 6,
	breatheMax: 10,
	breatheSpeed: 0.012,
	ringCount: 3,
	ringStaggerMs: 70,
} as const;

export const MEASURE_SNAP_AUDIO_HZ: Record<string, number> = {
	endpoint: 900,
	intersection: 780,
	midpoint: 670,
	on: 560,
};

export const MEASURE_SNAP_AUDIBLE = new Set(['endpoint', 'intersection', 'midpoint']);

export const MEASURE_COMMIT_CHORD_HZ = [660, 990] as const;

export const MEASURE_OVERLAY_CLASS = 'priyam-measure-snap-overlay';
