/**
 * Non-invasive snap feedback for LMV measure: concentric pulse rings, live
 * breathe halo, and audio. Does not patch LMV materials, labels, or cursors.
 */
import {
	MEASURE_COMMIT_CHORD_HZ,
	MEASURE_OVERLAY_CLASS,
	MEASURE_SNAP_AUDIO_HZ,
	MEASURE_SNAP_AUDIBLE,
	MEASURE_SNAP_RING,
} from './measureDistanceVisualTokens';

type SnapResultLike = {
	isEmpty?: () => boolean;
	intersectPoint?: THREE.Vector3;
	geomType?: number;
};

type MeasureToolLike = {
	isActive?: () => boolean;
	_measurementType?: number;
	_snapper?: {
		getSnapResult?: () => SnapResultLike;
	};
};

type MeasureExtensionLike = {
	measureTool?: MeasureToolLike;
};

type PulseBurst = {
	startedAt: number;
};

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

const snapCategoryFromGeomType = (geomType: number | undefined): string | null => {
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

const isMeasureToolActive = (measureTool: MeasureToolLike | undefined): boolean =>
	measureTool?.isActive?.() === true;

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

const resizeOverlay = (canvas: HTMLCanvasElement, viewer: Autodesk.Viewing.GuiViewer3D): CanvasRenderingContext2D | null => {
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

const drawExpandingRings = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	now: number,
	pulses: PulseBurst[]
): void => {
	for (const pulse of pulses) {
		for (let i = 0; i < MEASURE_SNAP_RING.ringCount; i += 1) {
			const elapsed = now - pulse.startedAt - i * MEASURE_SNAP_RING.ringStaggerMs;
			if (elapsed < 0) {
				continue;
			}
			const t = elapsed / MEASURE_SNAP_RING.pulseDurationMs;
			if (t >= 1) {
				continue;
			}
			const alpha = (1 - t) * 0.85;
			const radius = MEASURE_SNAP_RING.pulseStartRadius + t * MEASURE_SNAP_RING.pulseExpand;
			ctx.strokeStyle = `${MEASURE_SNAP_RING.color}${alpha})`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(x, y, radius, 0, Math.PI * 2);
			ctx.stroke();
		}
	}
};

const drawLiveHalo = (ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void => {
	const mid = (MEASURE_SNAP_RING.breatheMin + MEASURE_SNAP_RING.breatheMax) / 2;
	const amp = (MEASURE_SNAP_RING.breatheMax - MEASURE_SNAP_RING.breatheMin) / 2;
	const radius = mid + Math.sin(now * MEASURE_SNAP_RING.breatheSpeed) * amp;

	ctx.strokeStyle = `${MEASURE_SNAP_RING.color}0.95)`;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.stroke();

	ctx.strokeStyle = `${MEASURE_SNAP_RING.color}0.35)`;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
	ctx.stroke();

	ctx.fillStyle = MEASURE_SNAP_RING.innerColor;
	ctx.beginPath();
	ctx.arc(x, y, 3.5, 0, Math.PI * 2);
	ctx.fill();
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
		const measureActive = isMeasureToolActive(measureTool);

		if (!measureActive) {
			clearOverlay();
			lastSnapId = null;
			pulses.length = 0;
			rafId = window.requestAnimationFrame(frame);
			return;
		}

		const snap = measureTool?._snapper?.getSnapResult?.();
		const snapId = snapIdFromResult(snap);
		const now = performance.now();

		if (snapId && snapId !== lastSnapId) {
			const category = snapCategoryFromGeomType(snap?.geomType);
			if (category && MEASURE_SNAP_AUDIBLE.has(category)) {
				playTone(MEASURE_SNAP_AUDIO_HZ[category] ?? 700);
			}
			pulses.push({ startedAt: now });
			if (pulses.length > 8) {
				pulses.splice(0, pulses.length - 8);
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

		ctx.clearRect(0, 0, viewer.container.clientWidth, viewer.container.clientHeight);

		if (snap?.intersectPoint && !snap.isEmpty?.()) {
			const projected = Autodesk.Viewing.MeasureCommon.project(snap.intersectPoint, viewer);
			drawExpandingRings(ctx, projected.x, projected.y, now, pulses);
			drawLiveHalo(ctx, projected.x, projected.y, now);
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
