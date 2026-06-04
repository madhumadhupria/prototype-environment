import {
	MEASURE_DISTANCE_ACTIVE_CLASS,
	MEASURE_DISTANCE_ROOT_CLASS,
	MEASURE_DISTANCE_VISUAL,
} from './measureDistanceVisualTokens';

const STYLE_ELEMENT_ID = 'priyam-measure-distance-visual-styles';

const CSS = `
.${MEASURE_DISTANCE_ROOT_CLASS} .measure-length {
	background-color: ${MEASURE_DISTANCE_VISUAL.labelBgDark};
	box-shadow: none;
	border-radius: 5px;
	color: ${MEASURE_DISTANCE_VISUAL.committed};
	font-size: 13px;
	font-weight: 600;
	line-height: 1.2;
	padding: 2px 0;
	pointer-events: none;
}

.${MEASURE_DISTANCE_ROOT_CLASS} .measure-length-text {
	color: inherit;
	font-size: 13px;
	font-weight: 600;
	margin: 0 6px;
}

.${MEASURE_DISTANCE_ROOT_CLASS} .measure-label-icon {
	background-color: ${MEASURE_DISTANCE_VISUAL.snapReal};
	border-color: #ffffff;
	border-radius: 100px;
	border-width: 2px;
	box-shadow: 0 2px 5px rgba(24, 42, 61, 0.35);
	height: 7px;
	width: 7px;
}

.${MEASURE_DISTANCE_ROOT_CLASS} .measure-label-axis-delta {
	background-color: ${MEASURE_DISTANCE_VISUAL.labelBgDark};
	border-radius: 5px;
	box-shadow: none;
	color: ${MEASURE_DISTANCE_VISUAL.committed};
	font-size: 13px;
	font-weight: 600;
	opacity: 1;
}

.${MEASURE_DISTANCE_ROOT_CLASS} .measure-label-axis-delta .measure-label-axis-icon.shape {
	background-color: ${MEASURE_DISTANCE_VISUAL.committed};
}

.${MEASURE_DISTANCE_ACTIVE_CLASS} .adsk-viewing-viewer canvas,
.${MEASURE_DISTANCE_ACTIVE_CLASS} canvas.adsk-viewing-viewer {
	cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cg stroke='%23fff' stroke-width='3.5' stroke-linecap='round'%3E%3Cpath d='M12 2v20M2 12h20'/%3E%3C/g%3E%3Cg stroke='%235cb0ff' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M12 2v20M2 12h20'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E") 11 11, crosshair;
}
`;

export const ensureMeasureDistanceStylesInjected = (): void => {
	if (typeof document === 'undefined' || document.getElementById(STYLE_ELEMENT_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = STYLE_ELEMENT_ID;
	style.textContent = CSS;
	document.head.appendChild(style);
};
