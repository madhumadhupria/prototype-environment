import { getLmvThree } from './lmvThree';
import { getModelHorizontalAxes, getModelWorldUp, getPrimaryStructuralModel } from './viewerEnvironmentBounds';
import { executeAfterGeometryLoaded } from './viewerEnvironmentEvents';

const STAIR_NAME_PATTERN = /stair/i;
const LANDING_NAME_PATTERN = /landing/i;
const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
const PUSHPIN_ASSET = assetUrl('assets/staircase-demo/pushpin.png');
const ASSISTANT_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M13.9122 11.3911C14.3571 11.1134 14.9428 11.2492 15.2208 11.6938L15.2687 11.7788C15.4813 12.2108 15.3353 12.7418 14.9181 13.0024L13.6805 13.7725L13.6697 13.7793C13.2524 14.0401 12.7109 13.9375 12.4158 13.5567L12.3602 13.4776C12.0995 13.0604 12.2024 12.5188 12.5828 12.2237L12.6629 12.168L13.9015 11.3989L13.9122 11.3911ZM14.4385 2.24988C14.8704 2.03727 15.4013 2.18174 15.6622 2.59852L15.71 2.68348C15.9086 3.08669 15.7955 3.57688 15.4405 3.85242L15.3604 3.90809L1.64391 12.3017C1.22686 12.5623 0.685156 12.4603 0.39 12.08L0.334336 11.9999C0.056303 11.555 0.192125 10.9684 0.637071 10.6904L14.3536 2.29676L14.4385 2.24988ZM6.95407 2.14237C7.39846 1.86736 7.98139 2.00259 8.25876 2.44608C8.53679 2.89103 8.40194 3.47762 7.95699 3.75565L7.95309 3.7576L1.7734 7.49393L1.77242 7.49295C1.35605 7.75005 0.818527 7.64809 0.524377 7.26932L0.468713 7.18924C0.19068 6.74429 0.325525 6.1577 0.77047 5.87967L0.774377 5.87771L6.95407 2.14237Z" fill="#3C3C3C"/><path d="M14.4385 6.64457C14.8704 6.43217 15.4015 6.57732 15.6622 6.99418L15.71 7.07914C15.9085 7.48233 15.7955 7.97261 15.4405 8.24809L15.3604 8.30375L6.19982 13.8506C5.7827 14.1112 5.24197 14.0084 4.94689 13.628L4.89123 13.5489C4.61322 13.104 4.74812 12.5174 5.19298 12.2393L14.3536 6.69242L14.4385 6.64457Z" fill="#3C3C3C"/></svg>`;
const CARET_ICON_SVG = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1.5 2.75L4 5.25L6.5 2.75" stroke="#3C3C3C" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SUGGESTED_ISSUE = 'Suggested issue - Not enough height clearance.';
const ZOOM_TIGHTNESS = 0.28;
const LANDING_BOUNDS_SHRINK = 0.5;
const OVERLAY_Z_INDEX = 2000;

type GhostingState = {
	ghostingEnabled: boolean | undefined;
};

type StairLandingTarget = {
	bounds: THREE.Box3;
	worldPoint: THREE.Vector3;
	dbIds: number[];
};

const extentAlongAxis = (box: THREE.Box3, axis: THREE.Vector3): number => {
	const THREE = getLmvThree();
	if (!THREE) return 0;

	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const corner of [
		box.min,
		box.max,
		new THREE.Vector3(box.min.x, box.min.y, box.max.z),
		new THREE.Vector3(box.min.x, box.max.y, box.min.z),
		new THREE.Vector3(box.max.x, box.min.y, box.min.z),
		new THREE.Vector3(box.max.x, box.max.y, box.min.z),
		new THREE.Vector3(box.min.x, box.max.y, box.max.z),
		new THREE.Vector3(box.max.x, box.min.y, box.max.z),
	]) {
		const value = corner.dot(axis);
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	return max - min;
};

const getLandingSurfacePoint = (viewer: Autodesk.Viewing.GuiViewer3D, bounds: THREE.Box3): THREE.Vector3 => {
	const up = getModelWorldUp(viewer);
	const center = bounds.getCenter(new THREE.Vector3());

	let maxAlongUp = Number.NEGATIVE_INFINITY;
	for (const corner of [
		new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
		new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
		new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
		new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
		new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
		new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
		new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
		new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
	]) {
		maxAlongUp = Math.max(maxAlongUp, corner.dot(up));
	}

	return center.clone().add(up.clone().multiplyScalar(maxAlongUp - center.dot(up) + 0.025));
};

const shrinkBounds = (bounds: THREE.Box3, factor: number): THREE.Box3 => {
	const THREE = getLmvThree();
	if (!THREE) return bounds.clone();

	const shrunk = bounds.clone();
	const center = shrunk.getCenter(new THREE.Vector3());
	const inset = Math.max(0, Math.min(1, 1 - factor));
	shrunk.min.lerp(center, inset);
	shrunk.max.lerp(center, inset);
	return shrunk;
};

const findLandingDbIds = (model: Autodesk.Viewing.Model, stairBounds: THREE.Box3): number[] => {
	const tree = model.getInstanceTree();
	if (!tree) return [];

	const landingIds: number[] = [];

	tree.enumNodeChildren(
		tree.getRootId(),
		(dbId: number) => {
			const name = tree.getNodeName(dbId);
			if (typeof name !== 'string' || !LANDING_NAME_PATTERN.test(name)) return;

			const leaves = collectDescendantLeaves(tree, dbId);
			const targetIds = leaves.length > 0 ? leaves : [dbId];
			const bounds = getDbIdsWorldBounds(model, targetIds);
			if (!bounds || !stairBounds.intersectsBox(bounds)) return;

			landingIds.push(...targetIds);
		},
		true
	);

	return [...new Set(landingIds)];
};

const findFlatLandingFragmentBounds = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	model: Autodesk.Viewing.Model,
	stairDbIds: readonly number[]
): THREE.Box3 | null => {
	const THREE = getLmvThree();
	const tree = model.getInstanceTree();
	if (!THREE || !tree) return null;

	const up = getModelWorldUp(viewer);
	const { axisU, axisV } = getModelHorizontalAxes(up, THREE);
	const fragList = model.getFragmentList();
	const fragBox = new THREE.Box3();

	let bestBounds: THREE.Box3 | null = null;
	let bestScore = 0;
	let bestElevation = Number.NEGATIVE_INFINITY;

	for (const dbId of stairDbIds) {
		tree.enumNodeFragments(
			dbId,
			(fragId: number) => {
				fragList.getWorldBounds(fragId, fragBox);
				if (fragBox.isEmpty()) return;

				const spanU = extentAlongAxis(fragBox, axisU);
				const spanV = extentAlongAxis(fragBox, axisV);
				const vertical = extentAlongAxis(fragBox, up);
				const horizontal = Math.max(spanU, spanV);
				const footprint = spanU * spanV;

				if (horizontal < 0.35 || footprint < 0.12) return;
				if (vertical > Math.max(horizontal * 0.28, 0.18)) return;

				const score = footprint / Math.max(vertical, 0.05);
				const elevation = fragBox.getCenter(new THREE.Vector3()).dot(up);
				const isBetter =
					score > bestScore + 1e-4 || (Math.abs(score - bestScore) <= 1e-4 && elevation > bestElevation);

				if (isBetter) {
					bestScore = score;
					bestElevation = elevation;
					bestBounds = fragBox.clone();
				}
			},
			true
		);
	}

	return bestBounds;
};

const findStairLandingTarget = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	model: Autodesk.Viewing.Model,
	stairDbIds: readonly number[]
): StairLandingTarget | null => {
	const stairBounds = getDbIdsWorldBounds(model, stairDbIds);
	if (!stairBounds) return null;

	const landingDbIds = findLandingDbIds(model, stairBounds);
	const namedLandingBounds =
		landingDbIds.length > 0 ? getDbIdsWorldBounds(model, landingDbIds) : null;
	const flatLandingBounds = findFlatLandingFragmentBounds(viewer, model, stairDbIds);

	let bounds = namedLandingBounds ?? flatLandingBounds;
	if (!bounds) {
		bounds = shrinkBounds(stairBounds, 0.42);
	}

	const dbIds = landingDbIds.length > 0 ? landingDbIds : [...stairDbIds];
	return {
		bounds,
		worldPoint: getLandingSurfacePoint(viewer, bounds),
		dbIds,
	};
};

const collectDescendantLeaves = (tree: Autodesk.Viewing.InstanceTree, dbId: number): number[] => {
	const leaves: number[] = [];
	tree.enumNodeChildren(
		dbId,
		(childId: number) => {
			if (tree.getChildCount(childId) === 0) {
				leaves.push(childId);
			}
		},
		true
	);
	return leaves;
};

/** Prefer the largest stair assembly so the pin lands on the main run, not a scattered leaf set. */
const findMainStairDbIds = (model: Autodesk.Viewing.Model): number[] => {
	const tree = model.getInstanceTree();
	if (!tree) return [];

	let bestDbIds: number[] = [];
	let bestVolume = 0;

	tree.enumNodeChildren(
		tree.getRootId(),
		(dbId: number) => {
			const name = tree.getNodeName(dbId);
			if (typeof name !== 'string' || !STAIR_NAME_PATTERN.test(name)) return;

			const leaves = collectDescendantLeaves(tree, dbId);
			const targetIds = leaves.length > 0 ? leaves : [dbId];
			const bounds = getDbIdsWorldBounds(model, targetIds);
			if (!bounds) return;

			const size = bounds.getSize(new THREE.Vector3());
			const volume = size.x * size.y * size.z;
			if (volume > bestVolume) {
				bestVolume = volume;
				bestDbIds = targetIds;
			}
		},
		true
	);

	return bestDbIds;
};

const getDbIdsWorldBounds = (model: Autodesk.Viewing.Model, dbIds: readonly number[]): THREE.Box3 | null => {
	const THREE = getLmvThree();
	const tree = model.getInstanceTree();
	if (!THREE || !tree || dbIds.length === 0) return null;

	const fragList = model.getFragmentList();
	const bounds = new THREE.Box3();
	const fragBox = new THREE.Box3();
	let hasBounds = false;

	for (const dbId of dbIds) {
		tree.enumNodeFragments(
			dbId,
			(fragId: number) => {
				fragList.getWorldBounds(fragId, fragBox);
				if (fragBox.isEmpty()) return;
				if (!hasBounds) {
					bounds.copy(fragBox);
					hasBounds = true;
				} else {
					bounds.union(fragBox);
				}
			},
			true
		);
	}

	return hasBounds ? bounds : null;
};

const worldToContainerPoint = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	worldPoint: THREE.Vector3
): { x: number; y: number } | null => {
	const impl = viewer.impl as Autodesk.Viewing.Private.Viewer3DImpl & {
		worldToClient?: (point: THREE.Vector3) => { x: number; y: number };
	};

	const screen =
		typeof impl.worldToClient === 'function'
			? impl.worldToClient(worldPoint.clone())
			: viewer.worldToClient(worldPoint.clone());

	if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
		return null;
	}

	return { x: screen.x, y: screen.y };
};

const getPushpinWorldPoint = (landing: StairLandingTarget): THREE.Vector3 => landing.worldPoint.clone();

const enableGhostEverything = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	model: Autodesk.Viewing.Model,
	stairDbIds: readonly number[]
): GhostingState => {
	const prefs = viewer.prefs as { get?: (key: string) => boolean };
	const ghostingEnabled = prefs.get?.('ghosting');
	viewer.setGhosting(true);
	viewer.isolate([...stairDbIds], model);
	viewer.impl.invalidate(true, false, true);
	return { ghostingEnabled };
};

const restoreGhosting = (viewer: Autodesk.Viewing.GuiViewer3D, state: GhostingState | undefined): void => {
	viewer.showAll();
	if (state?.ghostingEnabled === false) {
		viewer.setGhosting(false);
	} else if (state?.ghostingEnabled === true) {
		viewer.setGhosting(true);
	}
	viewer.impl.invalidate(true, false, true);
};

const createPushpinElement = (): HTMLDivElement => {
	const root = document.createElement('div');
	root.className = 'priyam-staircase-pushpin';
	root.setAttribute('role', 'img');
	root.setAttribute('aria-label', 'Issue pushpin');
	root.innerHTML = `
		<div class="priyam-staircase-pushpin__body">
			<img class="priyam-staircase-pushpin__pin" src="${PUSHPIN_ASSET}" width="63" height="72" alt="" draggable="false" />
		</div>
	`;
	return root;
};

const createAiPromptElement = (): HTMLDivElement => {
	const root = document.createElement('div');
	root.className = 'priyam-staircase-ai-prompt';
	root.hidden = true;
	root.innerHTML = `
		<div class="priyam-staircase-ai-prompt__content">
			<div class="priyam-staircase-ai-prompt__suggestion-wrap">
				<p class="priyam-staircase-ai-prompt__suggestion">${SUGGESTED_ISSUE}</p>
			</div>
			<div class="priyam-staircase-ai-prompt__footer">
				<div class="priyam-staircase-ai-prompt__assistant">
					<span class="priyam-staircase-ai-prompt__assistant-icon">${ASSISTANT_ICON_SVG}</span>
					<span class="priyam-staircase-ai-prompt__assistant-label">Autodesk Assistant</span>
					<span class="priyam-staircase-ai-prompt__caret">${CARET_ICON_SVG}</span>
				</div>
				<button type="button" class="priyam-staircase-ai-prompt__accept">Accept</button>
			</div>
		</div>
	`;
	return root;
};

class WorldAnchoredOverlay {
	private readonly viewer: Autodesk.Viewing.GuiViewer3D;
	private readonly element: HTMLElement;
	private readonly worldPoint: THREE.Vector3;
	private readonly onCameraChange: () => void;

	constructor(viewer: Autodesk.Viewing.GuiViewer3D, worldPoint: THREE.Vector3, element: HTMLElement) {
		this.viewer = viewer;
		this.worldPoint = worldPoint;
		this.element = element;
		this.onCameraChange = (): void => this.syncPosition();
	}

	public mount(container: HTMLElement): void {
		container.appendChild(this.element);
		this.syncPosition();
		this.viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.onCameraChange);
		this.viewer.addEventListener(Autodesk.Viewing.RENDER_PRESENTED_EVENT, this.onCameraChange);
		this.viewer.addEventListener(Autodesk.Viewing.CAMERA_TRANSITION_COMPLETED, this.onCameraChange);
	}

	public destroy(): void {
		this.viewer.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.onCameraChange);
		this.viewer.removeEventListener(Autodesk.Viewing.RENDER_PRESENTED_EVENT, this.onCameraChange);
		this.viewer.removeEventListener(Autodesk.Viewing.CAMERA_TRANSITION_COMPLETED, this.onCameraChange);
		this.element.remove();
	}

	public syncPosition(): boolean {
		const screen = worldToContainerPoint(this.viewer, this.worldPoint);
		if (!screen) {
			this.element.style.visibility = 'hidden';
			return false;
		}

		this.element.style.visibility = 'visible';
		this.element.style.left = `${screen.x}px`;
		this.element.style.top = `${screen.y}px`;
		return true;
	}
}

const zoomToLanding = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	model: Autodesk.Viewing.Model,
	landing: StairLandingTarget
): void => {
	const focusBounds = shrinkBounds(landing.bounds, LANDING_BOUNDS_SHRINK);
	const navigation = viewer.navigation as Autodesk.Viewing.Navigation & {
		fitBounds?: (immediate: boolean, bounds: THREE.Box3) => void;
		getPosition?: () => THREE.Vector3;
		getTarget?: () => THREE.Vector3;
		setView?: (eye: THREE.Vector3, target: THREE.Vector3) => void;
	};

	if (typeof navigation.fitBounds === 'function') {
		navigation.fitBounds(false, focusBounds);
	} else {
		viewer.fitToView([...landing.dbIds], model, false);
	}

	const position = navigation.getPosition?.();
	const target = navigation.getTarget?.();
	const landingCenter = focusBounds.getCenter(new THREE.Vector3());

	if (position && target) {
		const offset = position.clone().sub(target);
		const nextTarget = landingCenter.clone();
		const nextPosition = nextTarget.clone().add(offset.multiplyScalar(ZOOM_TIGHTNESS));
		navigation.setView?.(nextPosition, nextTarget);
	}

	viewer.impl.invalidate(true, true, true);
};

const ensureOverlayHost = (viewer: Autodesk.Viewing.GuiViewer3D): HTMLDivElement => {
	const container = viewer.container;
	if (getComputedStyle(container).position === 'static') {
		container.style.position = 'relative';
	}

	let layer = container.querySelector<HTMLDivElement>('.priyam-staircase-demo-layer');
	if (layer) {
		return layer;
	}

	layer = document.createElement('div');
	layer.className = 'priyam-staircase-demo-layer';
	layer.style.zIndex = String(OVERLAY_Z_INDEX);
	container.appendChild(layer);
	return layer;
};

export const startStaircaseIssueDemo = (viewer: Autodesk.Viewing.GuiViewer3D): (() => void) => {
	let teardown: (() => void) | undefined;
	let started = false;

	const run = (): void => {
		if (started) return;
		started = true;

		const model = getPrimaryStructuralModel(viewer) ?? viewer.model;
		if (!model) return;

		const stairDbIds = findMainStairDbIds(model);
		if (stairDbIds.length === 0) {
			console.warn('[StaircaseIssueDemo] No stair elements found in model.');
			return;
		}

		const landing = findStairLandingTarget(viewer, model, stairDbIds);
		if (!landing) return;

		zoomToLanding(viewer, model, landing);
		const ghostState = enableGhostEverything(viewer, model, stairDbIds);
		const pushpinWorld = getPushpinWorldPoint(landing);
		const overlayLayer = ensureOverlayHost(viewer);

		const pushpin = createPushpinElement();
		const pushpinOverlay = new WorldAnchoredOverlay(viewer, pushpinWorld, pushpin);
		pushpinOverlay.mount(overlayLayer);

		const prompt = createAiPromptElement();
		overlayLayer.appendChild(prompt);

		const syncPromptPosition = (): void => {
			const screen = worldToContainerPoint(viewer, pushpinWorld);
			if (!screen) {
				prompt.style.visibility = 'hidden';
				return;
			}
			prompt.style.visibility = prompt.hidden ? 'hidden' : 'visible';
			prompt.style.left = `${screen.x + 28}px`;
			prompt.style.top = `${screen.y - 132}px`;
		};

		const syncOverlays = (): void => {
			pushpinOverlay.syncPosition();
			syncPromptPosition();
		};

		viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, syncOverlays);
		viewer.addEventListener(Autodesk.Viewing.RENDER_PRESENTED_EVENT, syncOverlays);
		viewer.addEventListener(Autodesk.Viewing.CAMERA_TRANSITION_COMPLETED, syncOverlays);
		window.requestAnimationFrame(syncOverlays);
		window.setTimeout(syncOverlays, 250);
		window.setTimeout(syncOverlays, 900);

		let promptVisible = false;
		const showPrompt = (): void => {
			if (promptVisible) return;
			promptVisible = true;
			prompt.hidden = false;
			syncPromptPosition();
		};

		const hidePrompt = (): void => {
			promptVisible = false;
			prompt.hidden = true;
			syncPromptPosition();
		};

		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.code !== 'KeyH' && event.key !== 'h' && event.key !== 'H') return;
			const target = event.target as HTMLElement | null;
			if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
				return;
			}
			event.preventDefault();
			showPrompt();
		};

		const acceptButton = prompt.querySelector('.priyam-staircase-ai-prompt__accept');
		acceptButton?.addEventListener('click', hidePrompt);

		document.addEventListener('keydown', onKeyDown);

		teardown = (): void => {
			document.removeEventListener('keydown', onKeyDown);
			viewer.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, syncOverlays);
			viewer.removeEventListener(Autodesk.Viewing.RENDER_PRESENTED_EVENT, syncOverlays);
			viewer.removeEventListener(Autodesk.Viewing.CAMERA_TRANSITION_COMPLETED, syncOverlays);
			pushpinOverlay.destroy();
			prompt.remove();
			overlayLayer.remove();
			restoreGhosting(viewer, ghostState);
		};
	};

	executeAfterGeometryLoaded(viewer, () => {
		window.setTimeout(run, 900);
	});

	return (): void => {
		teardown?.();
	};
};
