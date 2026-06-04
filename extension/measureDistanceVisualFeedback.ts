/**
 * Non-invasive snap feedback: ghost alignment lines, snap glyph + rings, audio.
 * Does not modify LMV measure materials or behavior.
 */
import {
	GhostGuide,
	MEASURE_COMMIT_CHORD_HZ,
	MEASURE_GHOST_GUIDE,
	MEASURE_OVERLAY_CLASS,
	MEASURE_SNAP_AUDIO_HZ,
	MEASURE_SNAP_AUDIBLE,
	MEASURE_SNAP_RING,
	SnapCategory,
} from './measureDistanceVisualTokens';

type SnapResultLike = {
	isEmpty?: () => boolean;
	intersectPoint?: THREE.Vector3;
	geomType?: number;
};

type MeasurementLike = {
	hasPick?: (index: number) => boolean;
	getPick?: (index: number) => THREE.Vector3;
};

type MeasureToolLike = {
	isActive?: () => boolean;
	_currentMeasurement?: MeasurementLike;
	_snapper?: {
		getSnapResult?: () => SnapResultLike;
	};
	getMeasurementsManager?: () => {
		measurementsList?: Array<{ indicator?: { endpoints?: Record<string, { position?: THREE.Vector3 }> } }>;
	};
};

type MeasureExtensionLike = {
	measureTool?: MeasureToolLike;
};

type PulseBurst = {
	startedAt: number;
	category: SnapCategory;
};

type ScreenPoint = { x: number; y: number };

let audioContext: AudioContext | undefined;

const getAudioContext = (): AudioContext | undefined => {
	if (typeof window === 'undefined') {
		return undefined;
	}
	if (!audioContext) {
		const Ctx =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) {
			return undefined;
		}
		audioContext = new Ctx();
	}
	return audioContext;
};

const playTone = (frequency: number, gainPeak = 0.07, durationSec = 0.07): void => {
	const ac = getAudioContext();
	if (!ac) {
		return;
	}
	void ac.resume();
	const start = ac.currentTime;
	const oscillator = ac.createOscillator();
	const gain = ac.createGain();
	oscillator.type = 'triangle';
	oscillator.frequency.value = frequency;
	gain.gain.setValueAtTime(0, start);
	gain.gain.linearRampToValueAtTime(gainPeak, start + 0.004);
	gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
	oscillator.connect(gain).connect(ac.destination);
	oscillator.start(start);
	oscillator.stop(start + durationSec);
};

const playConfirmChord = (): void => {
	MEASURE_COMMIT_CHORD_HZ.forEach((frequency, index) => {
		window.setTimeout(() => playTone(frequency, 0.09, 0.12), index * 50);
	});
};

const snapCategoryFromGeomType = (geomType: number | undefined): SnapCategory => {
	const SnapType = Autodesk.Viewing.MeasureCommon.SnapType;
	switch (geomType) {
		case SnapType.SNAP_VERTEX:
		case SnapType.RASTER_PIXEL:
		case SnapType.SNAP_CIRCLE_CENTER:
			return 'endpoint';
		case SnapType.SNAP_INTERSECTION:
			return 'intersection';
		case SnapType.SNAP_MIDPOINT:
			return 'midpoint';
		case SnapType.SNAP_EDGE:
		case SnapType.SNAP_CURVEDEDGE:
			return 'on';
		default:
			return null;
	}
};

const snapIdFromResult = (snap: SnapResultLike | null | undefined): string | null => {
	if (!snap || snap.isEmpty?.()) {
		return null;
	}
	const category = snapCategoryFromGeomType(snap.geomType);
	if (!category || !snap.intersectPoint) {
		return null;
	}
	const point = snap.intersectPoint;
	return `${category}:${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`;
};

const projectPoint = (viewer: Autodesk.Viewing.GuiViewer3D, point: THREE.Vector3): ScreenPoint =>
	Autodesk.Viewing.MeasureCommon.project(point, viewer);

const collectReferencePoints = (measureTool: MeasureToolLike | undefined): THREE.Vector3[] => {
	const refs: THREE.Vector3[] = [];
	const current = measureTool?._currentMeasurement;
	if (current?.hasPick?.(1) && current.getPick) {
		refs.push(current.getPick(1));
	}
	if (current?.hasPick?.(2) && current.getPick) {
		refs.push(current.getPick(2));
	}

	const manager = measureTool?.getMeasurementsManager?.();
	for (const measurement of manager?.measurementsList ?? []) {
		const endpoints = measurement.indicator?.endpoints;
		if (!endpoints) {
			continue;
		}
		for (const endpoint of Object.values(endpoints)) {
			if (endpoint?.position) {
				refs.push(endpoint.position);
			}
		}
	}
	return refs;
};

const computeGhostGuides = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	snap: SnapResultLike,
	measureTool: MeasureToolLike | undefined,
	snapScreen: ScreenPoint,
	category: SnapCategory
): GhostGuide[] => {
	const guides: GhostGuide[] = [];
	const tol = MEASURE_GHOST_GUIDE.alignTolerancePx;

	if (category && MEASURE_GHOST_GUIDE.crosshairAt.has(category)) {
		guides.push({ kind: 'vertical', x: snapScreen.x, faint: true });
		guides.push({ kind: 'horizontal', y: snapScreen.y, faint: true });
	}

	const refs = collectReferencePoints(measureTool);
	const current = measureTool?._currentMeasurement;
	const firstPick =
		current?.hasPick?.(1) && current.getPick ? current.getPick(1) : undefined;

	if (firstPick && snap.intersectPoint) {
		const firstScreen = projectPoint(viewer, firstPick);

		if (Math.abs(snapScreen.y - firstScreen.y) <= tol && Math.abs(snapScreen.x - firstScreen.x) > tol) {
			const y = snapScreen.y;
			const axisX = firstScreen.x;
			guides.push({ kind: 'vertical', x: axisX });
			guides.push({ kind: 'segment', x1: snapScreen.x, y1: y, x2: axisX, y2: y, dashed: true });
			const away = snapScreen.x < axisX ? 1 : -1;
			guides.push({ kind: 'segment', x1: axisX, y1: y, x2: axisX + away * 72, y2: y, dashed: false });
		} else if (Math.abs(snapScreen.x - firstScreen.x) <= tol && Math.abs(snapScreen.y - firstScreen.y) > tol) {
			const x = snapScreen.x;
			const axisY = firstScreen.y;
			guides.push({ kind: 'horizontal', y: axisY });
			guides.push({ kind: 'segment', x1: x, y1: snapScreen.y, x2: x, y2: axisY, dashed: true });
			const away = snapScreen.y < axisY ? 1 : -1;
			guides.push({ kind: 'segment', x1: x, y1: axisY, x2: x, y2: axisY + away * 72, dashed: false });
		} else {
			guides.push({
				kind: 'segment',
				x1: firstScreen.x,
				y1: firstScreen.y,
				x2: snapScreen.x,
				y2: snapScreen.y,
				dashed: true,
			});
		}

		if (Math.abs(snapScreen.x - firstScreen.x) <= tol) {
			guides.push({ kind: 'vertical', x: snapScreen.x });
		}
		if (Math.abs(snapScreen.y - firstScreen.y) <= tol) {
			guides.push({ kind: 'horizontal', y: snapScreen.y });
		}
	}

	for (const ref of refs) {
		if (firstPick && ref === firstPick) {
			continue;
		}
		const refScreen = projectPoint(viewer, ref);
		if (Math.abs(snapScreen.x - refScreen.x) <= tol) {
			guides.push({ kind: 'vertical', x: snapScreen.x });
		}
		if (Math.abs(snapScreen.y - refScreen.y) <= tol) {
			guides.push({ kind: 'horizontal', y: snapScreen.y });
		}
		if (Math.abs(snapScreen.x - refScreen.x) <= tol || Math.abs(snapScreen.y - refScreen.y) <= tol) {
			guides.push({
				kind: 'segment',
				x1: refScreen.x,
				y1: refScreen.y,
				x2: snapScreen.x,
				y2: snapScreen.y,
				dashed: true,
			});
		}
	}

	return guides;
};

const drawGhostGuides = (
	ctx: CanvasRenderingContext2D,
	guides: GhostGuide[],
	width: number,
	height: number
): void => {
	ctx.save();
	ctx.setLineDash([...MEASURE_GHOST_GUIDE.dash]);
	ctx.lineWidth = MEASURE_GHOST_GUIDE.lineWidth;

	for (const guide of guides) {
		if (guide.kind === 'vertical') {
			ctx.strokeStyle = guide.faint ? MEASURE_GHOST_GUIDE.crosshairColor : MEASURE_GHOST_GUIDE.activeColor;
			ctx.beginPath();
			ctx.moveTo(guide.x, 0);
			ctx.lineTo(guide.x, height);
			ctx.stroke();
		} else if (guide.kind === 'horizontal') {
			ctx.strokeStyle = guide.faint ? MEASURE_GHOST_GUIDE.crosshairColor : MEASURE_GHOST_GUIDE.activeColor;
			ctx.beginPath();
			ctx.moveTo(0, guide.y);
			ctx.lineTo(width, guide.y);
			ctx.stroke();
		} else if (guide.kind === 'segment') {
			ctx.strokeStyle = guide.dashed ? MEASURE_GHOST_GUIDE.faintColor : MEASURE_GHOST_GUIDE.activeColor;
			ctx.setLineDash(guide.dashed ? [...MEASURE_GHOST_GUIDE.dash] : []);
			ctx.beginPath();
			ctx.moveTo(guide.x1, guide.y1);
			ctx.lineTo(guide.x2, guide.y2);
			ctx.stroke();
			ctx.setLineDash([...MEASURE_GHOST_GUIDE.dash]);
		}
	}

	ctx.restore();
};

const drawExpandingRings = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	now: number,
	pulses: PulseBurst[]
): void => {
	for (const pulse of pulses) {
		const expand =
			pulse.category === 'intersection' ? MEASURE_SNAP_RING.pulseExpand + 4 : MEASURE_SNAP_RING.pulseExpand;
		for (let i = 0; i < MEASURE_SNAP_RING.ringCount; i += 1) {
			const elapsed = now - pulse.startedAt - i * MEASURE_SNAP_RING.ringStaggerMs;
			if (elapsed < 0 || elapsed >= MEASURE_SNAP_RING.pulseDurationMs) {
				continue;
			}
			const t = elapsed / MEASURE_SNAP_RING.pulseDurationMs;
			const alpha = (1 - t) * 0.9;
			const radius = MEASURE_SNAP_RING.pulseStartRadius + t * expand;
			ctx.strokeStyle = `${MEASURE_SNAP_RING.color}${alpha})`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(x, y, radius, 0, Math.PI * 2);
			ctx.stroke();
		}
	}
};

const drawSnapGlyph = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	now: number,
	category: SnapCategory
): void => {
	const mid = (MEASURE_SNAP_RING.breatheMin + MEASURE_SNAP_RING.breatheMax) / 2;
	const amp = (MEASURE_SNAP_RING.breatheMax - MEASURE_SNAP_RING.breatheMin) / 2;
	const radius = mid + Math.sin(now * MEASURE_SNAP_RING.breatheSpeed) * amp;

	ctx.strokeStyle = MEASURE_SNAP_RING.stroke;
	ctx.lineWidth = 2;

	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.stroke();

	ctx.beginPath();
	ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
	ctx.strokeStyle = `${MEASURE_SNAP_RING.color}0.35)`;
	ctx.lineWidth = 1.5;
	ctx.stroke();

	const half = MEASURE_SNAP_RING.squareSize;
	ctx.strokeStyle = MEASURE_SNAP_RING.stroke;
	ctx.lineWidth = 2;
	if (category === 'intersection') {
		ctx.beginPath();
		ctx.moveTo(x - half, y - half);
		ctx.lineTo(x + half, y + half);
		ctx.moveTo(x + half, y - half);
		ctx.lineTo(x - half, y + half);
		ctx.stroke();
	} else {
		ctx.strokeRect(x - half, y - half, half * 2, half * 2);
	}

	ctx.fillStyle = MEASURE_SNAP_RING.innerColor;
	ctx.beginPath();
	ctx.arc(x, y, 3, 0, Math.PI * 2);
	ctx.fill();
};

const createOverlayCanvas = (viewer: Autodesk.Viewing.GuiViewer3D): HTMLCanvasElement => {
	const canvas = document.createElement('canvas');
	canvas.className = MEASURE_OVERLAY_CLASS;
	canvas.style.position = 'absolute';
	canvas.style.inset = '0';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	canvas.style.pointerEvents = 'none';
	canvas.style.zIndex = '2';
	const parent = viewer.container;
	if (getComputedStyle(parent).position === 'static') {
		parent.style.position = 'relative';
	}
	parent.appendChild(canvas);
	return canvas;
};

const resizeOverlay = (
	canvas: HTMLCanvasElement,
	viewer: Autodesk.Viewing.GuiViewer3D
): CanvasRenderingContext2D | null => {
	const rect = viewer.container.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.floor(rect.width));
	const height = Math.max(1, Math.floor(rect.height));
	canvas.width = Math.max(1, Math.floor(width * dpr));
	canvas.height = Math.max(1, Math.floor(height * dpr));
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		return null;
	}
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return ctx;
};

export const attachMeasureDistanceVisualFeedback = (
	viewer: Autodesk.Viewing.GuiViewer3D
): (() => void) => {
	let overlayCanvas: HTMLCanvasElement | undefined;
	let rafId = 0;
	let lastSnapId: string | null = null;
	const pulses: PulseBurst[] = [];

	const getMeasureTool = (): MeasureToolLike | undefined => {
		const measureExt = viewer.getExtension('Autodesk.Measure') as MeasureExtensionLike | null;
		return measureExt?.measureTool;
	};

	const clearOverlay = (): void => {
		if (!overlayCanvas) {
			return;
		}
		const ctx = overlayCanvas.getContext('2d');
		if (ctx) {
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
		}
	};

	const frame = (): void => {
		const measureTool = getMeasureTool();
		const measureActive = measureTool?.isActive?.() === true;

		if (!measureActive) {
			clearOverlay();
			lastSnapId = null;
			pulses.length = 0;
			rafId = window.requestAnimationFrame(frame);
			return;
		}

		const snap = measureTool?._snapper?.getSnapResult?.();
		const snapId = snapIdFromResult(snap);
		const category = snapCategoryFromGeomType(snap?.geomType);
		const now = performance.now();

		if (snapId && snapId !== lastSnapId) {
			if (category && MEASURE_SNAP_AUDIBLE.has(category)) {
				playTone(MEASURE_SNAP_AUDIO_HZ[category] ?? 700);
			}
			pulses.push({ startedAt: now, category });
			if (pulses.length > 10) {
				pulses.splice(0, pulses.length - 10);
			}
			lastSnapId = snapId;
		} else if (!snapId) {
			lastSnapId = null;
		}

		if (!overlayCanvas) {
			overlayCanvas = createOverlayCanvas(viewer);
		}

		const ctx = resizeOverlay(overlayCanvas, viewer);
		if (!ctx) {
			rafId = window.requestAnimationFrame(frame);
			return;
		}

		const width = viewer.container.clientWidth;
		const height = viewer.container.clientHeight;
		ctx.clearRect(0, 0, width, height);

		if (snap?.intersectPoint && !snap.isEmpty?.()) {
			const snapScreen = projectPoint(viewer, snap.intersectPoint);
			const guides = computeGhostGuides(viewer, snap, measureTool, snapScreen, category);
			drawGhostGuides(ctx, guides, width, height);
			drawExpandingRings(ctx, snapScreen.x, snapScreen.y, now, pulses);
			drawSnapGlyph(ctx, snapScreen.x, snapScreen.y, now, category);
		}

		rafId = window.requestAnimationFrame(frame);
	};

	const onMeasurementCompleted = (): void => {
		playConfirmChord();
	};

	viewer.addEventListener(Autodesk.Viewing.MeasureCommon.Events.MEASUREMENT_COMPLETED_EVENT, onMeasurementCompleted);

	rafId = window.requestAnimationFrame(frame);

	return () => {
		window.cancelAnimationFrame(rafId);
		viewer.removeEventListener(
			Autodesk.Viewing.MeasureCommon.Events.MEASUREMENT_COMPLETED_EVENT,
			onMeasurementCompleted
		);
		clearOverlay();
		overlayCanvas?.remove();
		overlayCanvas = undefined;
	};
};
