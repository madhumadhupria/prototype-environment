// Snap feedback config (scale-measure-prototype visuals).

export const MEASURE_SNAP_RING = {
	color: 'rgba(92, 176, 255,',
	stroke: '#5cb0ff',
	innerColor: 'rgba(92, 176, 255, 0.45)',
	pulseDurationMs: 300,
	pulseStartRadius: 8,
	pulseExpand: 18,
	breatheMin: 7,
	breatheMax: 11,
	breatheSpeed: 0.014,
	ringCount: 3,
	ringStaggerMs: 65,
	squareSize: 7,
} as const;

/** Ghost alignment / suggestion lines (dashed, Figma-style). */
export const MEASURE_GHOST_GUIDE = {
	activeColor: 'rgba(92, 176, 255, 0.82)',
	faintColor: 'rgba(92, 176, 255, 0.38)',
	crosshairColor: 'rgba(148, 160, 173, 0.55)',
	dash: [3, 5] as const,
	lineWidth: 1,
	alignTolerancePx: 7,
	/** Draw crosshair guides at these snap categories. */
	crosshairAt: new Set(['endpoint', 'intersection', 'midpoint']),
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

export type SnapCategory = 'endpoint' | 'intersection' | 'midpoint' | 'on' | null;

export type GhostGuide =
	| { kind: 'vertical'; x: number; faint?: boolean }
	| { kind: 'horizontal'; y: number; faint?: boolean }
	| { kind: 'segment'; x1: number; y1: number; x2: number; y2: number; dashed?: boolean };
