/**
 * Snap feedback on the LMV snap cursor: yellow tint on the native indicator,
 * concentric pulse rings in the snap overlay, ghost guides, and audio.
 */
import {
	GHOST_OVERLAY_SCENE,
	GhostGuide,
	MEASURE_COMMIT_CHORD_HZ,
	MEASURE_GHOST_GUIDE,
	MEASURE_SNAP_AUDIO_HZ,
	MEASURE_SNAP_AUDIBLE,
	MEASURE_SNAP_RING,
	MEASURE_SNAP_YELLOW,
	PULSE_OVERLAY_SCENE,
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

type SnapperIndicatorLike = {
	indicatorMaterial?: THREE.MeshBasicMaterial;
	geometryMaterial?: THREE.MeshPhongMaterial;
	setScale?: (point: THREE.Vector3) => number;
};

type MeasureToolLike = {
	isActive?: () => boolean;
	_currentMeasurement?: MeasurementLike;
	_snapper?: {
		getSnapResult?: () => SnapResultLike;
		indicator?: SnapperIndicatorLike;
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
let snapperYellowApplied = false;

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

const applySnapperYellow = (measureTool: MeasureToolLike | undefined, viewer: Autodesk.Viewing.GuiViewer3D): void => {
	if (snapperYellowApplied) {
		return;
	}
	const material = measureTool?._snapper?.indicator?.indicatorMaterial;
	if (!material) {
		return;
	}
	const color = material.color.clone();
	color.setHex(MEASURE_SNAP_YELLOW.hex);
	if (!viewer.impl.is2d) {
		color.multiply(color);
	}
	material.color.copy(color);

	const geometryMaterial = measureTool?._snapper?.indicator?.geometryMaterial;
	if (geometryMaterial) {
		const geomColor = geometryMaterial.color.clone();
		geomColor.setHex(MEASURE_SNAP_YELLOW.hex);
		if (!viewer.impl.is2d) {
			geomColor.multiply(geomColor);
		}
		geometryMaterial.color.copy(geomColor);
		geometryMaterial.opacity = 0.28;
	}

	snapperYellowApplied = true;
};

const ensureOverlayScene = (viewer: Autodesk.Viewing.GuiViewer3D, name: string): void => {
	const impl = viewer.impl as Autodesk.Viewing.Private.Viewer3DImpl & {
		overlayScenes?: Record<string, unknown>;
	};
	if (!impl.overlayScenes?.[name]) {
		viewer.impl.createOverlayScene(name);
	}
};

const resetOverlayScene = (viewer: Autodesk.Viewing.GuiViewer3D, name: string): void => {
	viewer.impl.clearOverlay(name, true);
	viewer.impl.removeOverlayScene(name);
	viewer.impl.createOverlayScene(name);
};

const makeYellowLineMaterial = (
	opacity: number,
	dashed: boolean,
	scale: number
): THREE.LineBasicMaterial | THREE.LineDashedMaterial => {
	if (dashed) {
		return new THREE.LineDashedMaterial({
			color: MEASURE_SNAP_YELLOW.hexCorrected,
			transparent: true,
			opacity,
			depthTest: false,
			depthWrite: false,
			dashSize: MEASURE_GHOST_GUIDE.dashSizePx * scale,
			gapSize: MEASURE_GHOST_GUIDE.gapSizePx * scale,
		});
	}
	return new THREE.LineBasicMaterial({
		color: MEASURE_SNAP_YELLOW.hexCorrected,
		transparent: true,
		opacity,
		depthTest: false,
		depthWrite: false,
	});
};

const addLineToOverlay = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	scene: string,
	a: THREE.Vector3,
	b: THREE.Vector3,
	opacity: number,
	dashed: boolean,
	scale: number
): void => {
	const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
	const material = makeYellowLineMaterial(opacity, dashed, scale);
	const line = dashed ? new THREE.Line(geometry, material as THREE.LineDashedMaterial) : new THREE.Line(geometry, material);
	if (dashed) {
		line.computeLineDistances();
	}
	viewer.impl.addOverlay(scene, line);
};

const addCircleRing = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	scene: string,
	center: THREE.Vector3,
	radiusPx: number,
	scale: number,
	opacity: number,
	lineWidthPx: number
): void => {
	const radius = radiusPx * scale;
	const right = viewer.navigation.getCameraRightVector().normalize();
	const up = viewer.navigation.getCameraUpVector().normalize();
	const segments = 40;
	const points: THREE.Vector3[] = [];
	for (let i = 0; i <= segments; i += 1) {
		const angle = (i / segments) * Math.PI * 2;
		points.push(
			center
				.clone()
				.add(right.clone().multiplyScalar(Math.cos(angle) * radius))
				.add(up.clone().multiplyScalar(Math.sin(angle) * radius))
		);
	}
	const geometry = new THREE.BufferGeometry().setFromPoints(points);
	const material = new THREE.LineBasicMaterial({
		color: MEASURE_SNAP_YELLOW.hexCorrected,
		transparent: true,
		opacity,
		depthTest: false,
		depthWrite: false,
		linewidth: lineWidthPx,
	});
	viewer.impl.addOverlay(scene, new THREE.Line(geometry, material));
};

const clientPointFromScreen = (viewer: Autodesk.Viewing.GuiViewer3D, screen: ScreenPoint): THREE.Vector3 | null => {
	const rect = viewer.container.getBoundingClientRect();
	const hit = viewer.clientToWorld(rect.left + screen.x, rect.top + screen.y, true);
	return hit?.point ?? null;
};

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
		for (const endpoint of Object.values(measurement.indicator?.endpoints ?? {})) {
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
	const height = viewer.container.clientHeight;
	const width = viewer.container.clientWidth;

	if (category && MEASURE_GHOST_GUIDE.crosshairAt.has(category)) {
		guides.push({ kind: 'vertical', x: snapScreen.x, faint: true });
		guides.push({ kind: 'horizontal', y: snapScreen.y, faint: true });
	}

	const current = measureTool?._currentMeasurement;
	const firstPick =
		current?.hasPick?.(1) && current.getPick ? current.getPick(1) : undefined;

	if (firstPick && snap.intersectPoint) {
		guides.push({ kind: 'worldSegment', a: firstPick.clone(), b: snap.intersectPoint.clone(), dashed: true });
		const firstScreen = projectPoint(viewer, firstPick);

		if (Math.abs(snapScreen.y - firstScreen.y) <= tol && Math.abs(snapScreen.x - firstScreen.x) > tol) {
			guides.push({ kind: 'vertical', x: firstScreen.x });
			guides.push({ kind: 'segment', x1: snapScreen.x, y1: snapScreen.y, x2: firstScreen.x, y2: snapScreen.y, dashed: true });
			const away = snapScreen.x < firstScreen.x ? 1 : -1;
			guides.push({
				kind: 'segment',
				x1: firstScreen.x,
				y1: snapScreen.y,
				x2: firstScreen.x + away * 72,
				y2: snapScreen.y,
				dashed: false,
			});
		} else if (Math.abs(snapScreen.x - firstScreen.x) <= tol && Math.abs(snapScreen.y - firstScreen.y) > tol) {
			guides.push({ kind: 'horizontal', y: firstScreen.y });
			guides.push({ kind: 'segment', x1: snapScreen.x, y1: snapScreen.y, x2: snapScreen.x, y2: firstScreen.y, dashed: true });
			const away = snapScreen.y < firstScreen.y ? 1 : -1;
			guides.push({
				kind: 'segment',
				x1: snapScreen.x,
				y1: firstScreen.y,
				x2: snapScreen.x,
				y2: firstScreen.y + away * 72,
				dashed: false,
			});
		}

		if (Math.abs(snapScreen.x - firstScreen.x) <= tol) {
			guides.push({ kind: 'vertical', x: snapScreen.x });
		}
		if (Math.abs(snapScreen.y - firstScreen.y) <= tol) {
			guides.push({ kind: 'horizontal', y: snapScreen.y });
		}
	}

	for (const ref of collectReferencePoints(measureTool)) {
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
	}

	void width;
	void height;
	return guides;
};

const drawGhostGuides = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	guides: GhostGuide[],
	height: number,
	scale: number
): void => {
	for (const guide of guides) {
		if (guide.kind === 'worldSegment') {
			addLineToOverlay(
				viewer,
				GHOST_OVERLAY_SCENE,
				guide.a,
				guide.b,
				guide.dashed ? MEASURE_GHOST_GUIDE.faintOpacity : MEASURE_GHOST_GUIDE.opacity,
				Boolean(guide.dashed),
				scale
			);
			continue;
		}

		if (guide.kind === 'vertical') {
			const top = clientPointFromScreen(viewer, { x: guide.x, y: 0 });
			const bottom = clientPointFromScreen(viewer, { x: guide.x, y: height });
			if (top && bottom) {
				addLineToOverlay(
					viewer,
					GHOST_OVERLAY_SCENE,
					top,
					bottom,
					guide.faint ? MEASURE_GHOST_GUIDE.faintOpacity : MEASURE_GHOST_GUIDE.opacity,
					guide.faint ?? false,
					scale
				);
			}
			continue;
		}

		if (guide.kind === 'horizontal') {
			const left = clientPointFromScreen(viewer, { x: 0, y: guide.y });
			const right = clientPointFromScreen(viewer, { x: viewer.container.clientWidth, y: guide.y });
			if (left && right) {
				addLineToOverlay(
					viewer,
					GHOST_OVERLAY_SCENE,
					left,
					right,
					guide.faint ? MEASURE_GHOST_GUIDE.faintOpacity : MEASURE_GHOST_GUIDE.opacity,
					guide.faint ?? false,
					scale
				);
			}
			continue;
		}

		if (guide.kind === 'segment') {
			const a = clientPointFromScreen(viewer, { x: guide.x1, y: guide.y1 });
			const b = clientPointFromScreen(viewer, { x: guide.x2, y: guide.y2 });
			if (a && b) {
				addLineToOverlay(
					viewer,
					GHOST_OVERLAY_SCENE,
					a,
					b,
					guide.dashed ? MEASURE_GHOST_GUIDE.faintOpacity : MEASURE_GHOST_GUIDE.opacity,
					Boolean(guide.dashed),
					scale
				);
			}
		}
	}
};

const drawSnapPulseRings = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	center: THREE.Vector3,
	scale: number,
	now: number,
	pulses: PulseBurst[]
): void => {
	const breatheMid = (MEASURE_SNAP_RING.breatheMinPx + MEASURE_SNAP_RING.breatheMaxPx) / 2;
	const breatheAmp = (MEASURE_SNAP_RING.breatheMaxPx - MEASURE_SNAP_RING.breatheMinPx) / 2;
	const breatheRadius = breatheMid + Math.sin(now * MEASURE_SNAP_RING.breatheSpeed) * breatheAmp;

	addCircleRing(viewer, PULSE_OVERLAY_SCENE, center, breatheRadius, scale, 0.95, MEASURE_SNAP_RING.lineWidthPx);
	addCircleRing(
		viewer,
		PULSE_OVERLAY_SCENE,
		center,
		breatheRadius + 5,
		scale,
		0.38,
		MEASURE_SNAP_RING.lineWidthPx
	);

	for (const pulse of pulses) {
		const expandPx =
			pulse.category === 'intersection'
				? MEASURE_SNAP_RING.pulseExpandPx + 4
				: MEASURE_SNAP_RING.pulseExpandPx;
		for (let i = 0; i < MEASURE_SNAP_RING.ringCount; i += 1) {
			const elapsed = now - pulse.startedAt - i * MEASURE_SNAP_RING.ringStaggerMs;
			if (elapsed < 0 || elapsed >= MEASURE_SNAP_RING.pulseDurationMs) {
				continue;
			}
			const t = elapsed / MEASURE_SNAP_RING.pulseDurationMs;
			const radiusPx = MEASURE_SNAP_RING.pulseStartPx + t * expandPx;
			addCircleRing(viewer, PULSE_OVERLAY_SCENE, center, radiusPx, scale, (1 - t) * 0.9, MEASURE_SNAP_RING.lineWidthPx);
		}
	}
};

export const attachMeasureDistanceVisualFeedback = (
	viewer: Autodesk.Viewing.GuiViewer3D
): (() => void) => {
	ensureOverlayScene(viewer, PULSE_OVERLAY_SCENE);
	ensureOverlayScene(viewer, GHOST_OVERLAY_SCENE);

	let rafId = 0;
	let lastSnapId: string | null = null;
	const pulses: PulseBurst[] = [];

	const getMeasureTool = (): MeasureToolLike | undefined => {
		const measureExt = viewer.getExtension('Autodesk.Measure') as MeasureExtensionLike | null;
		return measureExt?.measureTool;
	};

	const frame = (): void => {
		const measureTool = getMeasureTool();
		const measureActive = measureTool?.isActive?.() === true;

		resetOverlayScene(viewer, PULSE_OVERLAY_SCENE);
		resetOverlayScene(viewer, GHOST_OVERLAY_SCENE);

		if (!measureActive) {
			lastSnapId = null;
			pulses.length = 0;
			rafId = window.requestAnimationFrame(frame);
			return;
		}

		applySnapperYellow(measureTool, viewer);

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

		if (snap?.intersectPoint && !snap.isEmpty?.()) {
			const center = Autodesk.Viewing.MeasureCommon.getSnapResultPosition(snap, viewer);
			const scale = measureTool?._snapper?.indicator?.setScale?.(center) ?? 1;
			const snapScreen = projectPoint(viewer, center);

			drawSnapPulseRings(viewer, center, scale, now, pulses);

			const guides = computeGhostGuides(viewer, snap, measureTool, snapScreen, category);
			drawGhostGuides(viewer, guides, viewer.container.clientHeight, scale);
		}

		rafId = window.requestAnimationFrame(frame);
	};

	const onMeasurementCompleted = (): void => {
		playConfirmChord();
	};

	const onExtensionLoaded = (event: { extensionId?: string }): void => {
		if (event.extensionId === 'Autodesk.Measure') {
			applySnapperYellow(getMeasureTool(), viewer);
		}
	};

	viewer.addEventListener(Autodesk.Viewing.EXTENSION_LOADED_EVENT, onExtensionLoaded);
	viewer.addEventListener(Autodesk.Viewing.MeasureCommon.Events.MEASUREMENT_COMPLETED_EVENT, onMeasurementCompleted);

	rafId = window.requestAnimationFrame(frame);

	return () => {
		window.cancelAnimationFrame(rafId);
		viewer.removeEventListener(Autodesk.Viewing.EXTENSION_LOADED_EVENT, onExtensionLoaded);
		viewer.removeEventListener(
			Autodesk.Viewing.MeasureCommon.Events.MEASUREMENT_COMPLETED_EVENT,
			onMeasurementCompleted
		);
		resetOverlayScene(viewer, PULSE_OVERLAY_SCENE);
		resetOverlayScene(viewer, GHOST_OVERLAY_SCENE);
		snapperYellowApplied = false;
	};
};
