// Snap feedback config — yellow palette aligned with LMV measure snap cursor.

/** LMV default snap orange is ~0xff7700; we tune to a clearer yellow. */
export const MEASURE_SNAP_YELLOW = {
	hex: 0xffd200,
	hexCorrected: 0xffa800,
	stroke: '#ffd200',
} as const;

export const MEASURE_SNAP_RING = {
	pulseDurationMs: 300,
	pulseStartPx: 8,
	pulseExpandPx: 18,
	breatheMinPx: 6,
	breatheMaxPx: 11,
	breatheSpeed: 0.014,
	ringCount: 3,
	ringStaggerMs: 65,
	lineWidthPx: 2,
} as const;

export const MEASURE_GHOST_GUIDE = {
	opacity: 0.42,
	faintOpacity: 0.22,
	dashSizePx: 3,
	gapSizePx: 5,
	lineWidthPx: 1,
	alignTolerancePx: 7,
	crosshairAt: new Set(['endpoint', 'intersection', 'midpoint']),
} as const;

export const MEASURE_SNAP_AUDIO_HZ: Record<string, number> = {
	endpoint: 900,
	intersection: 780,
	midpoint: 670,
	on: 560,
	origin: 820,
};

export const MEASURE_ORIGIN_AUDIO_HZ = MEASURE_SNAP_AUDIO_HZ.origin;

export const MEASURE_SNAP_AUDIBLE = new Set(['endpoint', 'intersection', 'midpoint']);

export const MEASURE_COMMIT_CHORD_HZ = [660, 990] as const;

export const PULSE_OVERLAY_SCENE = 'priyam-measure-snap-pulse';
export const GHOST_OVERLAY_SCENE = 'priyam-measure-snap-ghost';

export type SnapCategory = 'endpoint' | 'intersection' | 'midpoint' | 'on' | null;

export type GhostGuide =
	| { kind: 'vertical'; x: number; faint?: boolean }
	| { kind: 'horizontal'; y: number; faint?: boolean }
	| { kind: 'segment'; x1: number; y1: number; x2: number; y2: number; dashed?: boolean }
	| { kind: 'worldSegment'; a: THREE.Vector3; b: THREE.Vector3; dashed?: boolean };
