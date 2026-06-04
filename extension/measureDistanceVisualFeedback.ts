import {
	MEASURE_COMMIT_CHORD_HZ,
	MEASURE_DISTANCE_ACTIVE_CLASS,
	MEASURE_DISTANCE_ROOT_CLASS,
	MEASURE_DISTANCE_VISUAL,
	MEASURE_SNAP_AUDIO_HZ,
	MEASURE_SNAP_AUDIBLE,
} from './measureDistanceVisualTokens';
import { ensureMeasureDistanceStylesInjected } from './measureDistanceVisualStyles';

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
		indicator?: {
			indicatorMaterial?: THREE.MeshBasicMaterial;
			geometryMaterial?: THREE.MeshPhongMaterial;
		};
	};
	getMeasurementsManager?: () => {
		measurementsList?: Array<{ measurementType?: number; indicator?: IndicatorLike }>;
		getCurrentMeasurement?: () => {
			measurementType?: number;
			indicator?: IndicatorLike;
			hasPick?: (n: number) => boolean;
		};
	};
};

type IndicatorLike = {
	lines?: {
		xyz?: { material?: THREE.LineBasicMaterial; label?: HTMLElement };
	};
	segments?: Array<{ line?: unknown; material?: THREE.LineBasicMaterial }>;
	dashedLines?: Array<{ line?: unknown; material?: THREE.LineBasicMaterial }>;
	measurement?: { hasPick?: (n: number) => boolean; measurementType?: number };
};

type MeasureExtensionLike = {
	measureTool?: MeasureToolLike;
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

const isDistanceMeasurement = (measurementType: number | undefined): boolean =>
	measurementType === Autodesk.Viewing.MeasureCommon.MeasurementTypes.MEASUREMENT_DISTANCE;

const setMaterialColor = (
	material: THREE.Material | undefined,
	hex: number,
	viewer: Autodesk.Viewing.GuiViewer3D
): void => {
	if (!material || !('color' in material) || !material.color) {
		return;
	}
	const color = material.color as THREE.Color;
	color.setHex(hex);
	if (!viewer.impl.is2d) {
		color.multiply(color);
	}
};

const styleIndicator = (
	indicator: IndicatorLike | undefined,
	phase: 'active' | 'committed',
	viewer: Autodesk.Viewing.GuiViewer3D
): void => {
	if (!indicator) {
		return;
	}
	const hex = phase === 'active' ? MEASURE_DISTANCE_VISUAL.activeHex : MEASURE_DISTANCE_VISUAL.committedHex;
	const materials = new Set<THREE.LineBasicMaterial | THREE.Material>();
	if (indicator.lines?.xyz?.material) {
		materials.add(indicator.lines.xyz.material);
	}
	for (const segment of indicator.segments ?? []) {
		if (segment.material) {
			materials.add(segment.material);
		}
	}
	for (const dashed of indicator.dashedLines ?? []) {
		if (dashed.material) {
			materials.add(dashed.material);
		}
	}
	for (const material of materials) {
		setMaterialColor(material, hex, viewer);
	}
	const label = indicator.lines?.xyz?.label;
	if (label) {
		label.style.backgroundColor = MEASURE_DISTANCE_VISUAL.labelBgDark;
		label.style.color = phase === 'active' ? MEASURE_DISTANCE_VISUAL.active : MEASURE_DISTANCE_VISUAL.committed;
	}
};

const styleSnapperIndicator = (
	measureTool: MeasureToolLike | undefined,
	viewer: Autodesk.Viewing.GuiViewer3D
): void => {
	const indicator = measureTool?._snapper?.indicator;
	if (!indicator?.indicatorMaterial) {
		return;
	}
	setMaterialColor(indicator.indicatorMaterial, MEASURE_DISTANCE_VISUAL.snapRealHex, viewer);
	if (indicator.geometryMaterial) {
		setMaterialColor(indicator.geometryMaterial, MEASURE_DISTANCE_VISUAL.snapRealHex, viewer);
		indicator.geometryMaterial.opacity = 0.35;
	}
};

const styleAllDistanceIndicators = (
	measureTool: MeasureToolLike | undefined,
	viewer: Autodesk.Viewing.GuiViewer3D
): void => {
	const manager = measureTool?.getMeasurementsManager?.();
	if (!manager) {
		return;
	}
	const current = manager.getCurrentMeasurement?.();
	for (const measurement of manager.measurementsList ?? []) {
		if (!isDistanceMeasurement(measurement.measurementType)) {
			continue;
		}
		const indicator = measurement.indicator;
		const isCurrent = measurement === current;
		const hasFirstPick = indicator?.measurement?.hasPick?.(1) ?? false;
		const hasSecondPick = indicator?.measurement?.hasPick?.(2) ?? false;
		const phase = isCurrent && hasFirstPick && !hasSecondPick ? 'active' : 'committed';
		styleIndicator(indicator, phase, viewer);
	}
};

const createPulseOverlay = (viewer: Autodesk.Viewing.GuiViewer3D): HTMLCanvasElement => {
	const canvas = document.createElement('canvas');
	canvas.className = 'priyam-measure-distance-pulse';
	canvas.style.position = 'absolute';
	canvas.style.left = '0';
	canvas.style.top = '0';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	canvas.style.pointerEvents = 'none';
	canvas.style.zIndex = '3';
	viewer.container.style.position ||= 'relative';
	viewer.container.appendChild(canvas);
	return canvas;
};

const resizePulseOverlay = (canvas: HTMLCanvasElement, viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const rect = viewer.container.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;
	canvas.width = Math.max(1, Math.floor(rect.width * dpr));
	canvas.height = Math.max(1, Math.floor(rect.height * dpr));
	canvas.style.width = `${rect.width}px`;
	canvas.style.height = `${rect.height}px`;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}
};

const drawPulseRing = (
	canvas: HTMLCanvasElement,
	viewer: Autodesk.Viewing.GuiViewer3D,
	worldPoint: THREE.Vector3,
	startedAt: number
): void => {
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		return;
	}
	resizePulseOverlay(canvas, viewer);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const elapsed = performance.now() - startedAt;
	const t = elapsed / MEASURE_DISTANCE_VISUAL.pulseDurationMs;
	if (t >= 1) {
		return;
	}
	const projected = Autodesk.Viewing.MeasureCommon.project(worldPoint, viewer);
	ctx.strokeStyle = `${MEASURE_DISTANCE_VISUAL.pulseRing}${(1 - t) * 0.9})`;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(projected.x, projected.y, 8 + t * 16, 0, Math.PI * 2);
	ctx.stroke();
};

export const attachMeasureDistanceVisualFeedback = (
	viewer: Autodesk.Viewing.GuiViewer3D
): (() => void) => {
	ensureMeasureDistanceStylesInjected();
	viewer.container.classList.add(MEASURE_DISTANCE_ROOT_CLASS);

	let pulseCanvas: HTMLCanvasElement | undefined;
	let rafId = 0;
	let lastSnapId: string | null = null;
	let pulseStartedAt = 0;
	let pulsePoint: THREE.Vector3 | undefined;

	const getMeasureTool = (): MeasureToolLike | undefined => {
		const measureExt = viewer.getExtension('Autodesk.Measure') as MeasureExtensionLike | null;
		return measureExt?.measureTool;
	};

	const clearPulse = (): void => {
		if (!pulseCanvas) {
			return;
		}
		const ctx = pulseCanvas.getContext('2d');
		ctx?.clearRect(0, 0, pulseCanvas.width, pulseCanvas.height);
	};

	const frame = (): void => {
		const measureTool = getMeasureTool();
		const distanceActive =
			measureTool?.isActive?.() === true && isDistanceMeasurement(measureTool._measurementType);

		if (!distanceActive) {
			viewer.container.classList.remove(MEASURE_DISTANCE_ACTIVE_CLASS);
			clearPulse();
			lastSnapId = null;
			rafId = window.requestAnimationFrame(frame);
			return;
		}

		viewer.container.classList.add(MEASURE_DISTANCE_ACTIVE_CLASS);
		styleSnapperIndicator(measureTool, viewer);
		styleAllDistanceIndicators(measureTool, viewer);

		const snap = measureTool._snapper?.getSnapResult?.();
		const snapId = snapIdFromResult(snap);
		if (snapId && snapId !== lastSnapId) {
			const category = snapCategoryFromGeomType(snap?.geomType);
			if (category && MEASURE_SNAP_AUDIBLE.has(category)) {
				playTone(MEASURE_SNAP_AUDIO_HZ[category] ?? 700);
			}
			if (snap?.intersectPoint) {
				pulsePoint = snap.intersectPoint.clone();
				pulseStartedAt = performance.now();
			}
			lastSnapId = snapId;
		} else if (!snapId) {
			lastSnapId = null;
		}

		if (pulsePoint && performance.now() - pulseStartedAt < MEASURE_DISTANCE_VISUAL.pulseDurationMs) {
			if (!pulseCanvas) {
				pulseCanvas = createPulseOverlay(viewer);
			}
			drawPulseRing(pulseCanvas, viewer, pulsePoint, pulseStartedAt);
		} else {
			clearPulse();
		}

		rafId = window.requestAnimationFrame(frame);
	};

	const onMeasurementCompleted = (event: { data?: { type?: number } }): void => {
		if (!isDistanceMeasurement(event.data?.type)) {
			return;
		}
		playConfirmChord();
		const measureTool = getMeasureTool();
		window.setTimeout(() => styleAllDistanceIndicators(measureTool, viewer), 0);
	};

	const onMeasurementChanged = (): void => {
		styleAllDistanceIndicators(getMeasureTool(), viewer);
	};

	const onExtensionLoaded = (event: { extensionId?: string }): void => {
		if (event.extensionId !== 'Autodesk.Measure') {
			return;
		}
		styleSnapperIndicator(getMeasureTool(), viewer);
		styleAllDistanceIndicators(getMeasureTool(), viewer);
	};

	viewer.addEventListener(Autodesk.Viewing.EXTENSION_LOADED_EVENT, onExtensionLoaded);
	viewer.addEventListener(Autodesk.Viewing.MeasureCommon.Events.MEASUREMENT_COMPLETED_EVENT, onMeasurementCompleted);
	viewer.addEventListener(Autodesk.Viewing.MeasureCommon.Events.MEASUREMENT_CHANGED_EVENT, onMeasurementChanged);

	rafId = window.requestAnimationFrame(frame);

	return () => {
		window.cancelAnimationFrame(rafId);
		viewer.removeEventListener(Autodesk.Viewing.EXTENSION_LOADED_EVENT, onExtensionLoaded);
		viewer.removeEventListener(
			Autodesk.Viewing.MeasureCommon.Events.MEASUREMENT_COMPLETED_EVENT,
			onMeasurementCompleted
		);
		viewer.removeEventListener(Autodesk.Viewing.MeasureCommon.Events.MEASUREMENT_CHANGED_EVENT, onMeasurementChanged);
		viewer.container.classList.remove(MEASURE_DISTANCE_ROOT_CLASS, MEASURE_DISTANCE_ACTIVE_CLASS);
		pulseCanvas?.remove();
		pulseCanvas = undefined;
	};
};
