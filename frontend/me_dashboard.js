const ME_OPTIONS = ["DG#1", "DG#2", "DG#3", "ME-PORT", "ME-STBD"];
const dgParam = new URLSearchParams(window.location.search).get("dg");
const {
    getById,
    normalizeDgName,
    filterByTarget,
    isOnValue,
    fetchWithTimeout,
    resolveApiOrigin,
    createOverlayLayoutController,
    updateTimestampHeader: setTimestampHeader,
    formatTimestampDisplay,
    extractMachineTimestamp,
    bindHomeNavigation
} = window.DashboardShared;
const API_BASE = `${resolveApiOrigin()}/api/check_all_status_lable`;
const ANALOG_FIXED_POINTS = [
    "BOOST AIR PRESS.",
    "FUEL OIL PRESS.",
    "LUB. OIL PRESS.",
    "H.T. F.W. PRESS.",
    "T/C LUB. OIL PRESS.",
    "L.O. AUTO. BACKWASH FILTER DIFF. P.",
    "LUB. OIL TEMP.",
    "H.T. F.W. TEMP.",
    "BOOST AIR TEMP.",
    "FUEL OIL TEMP.",
    "NO.1 CYL. EXH. GAS OUTLET TEMP.",
    "NO.2 CYL. EXH. GAS OUTLET TEMP.",
    "NO.3 CYL. EXH. GAS OUTLET TEMP.",
    "NO.4 CYL. EXH. GAS OUTLET TEMP.",
    "NO.5 CYL. EXH. GAS OUTLET TEMP.",
    "NO.6 CYL. EXH. GAS OUTLET TEMP.",
    "EXH. GAS T/C INLET NO.1 TEMP.",
    "EXH. GAS T/C INLET NO.2 TEMP.",
    "EXH. GAS T/C OUTLET TEMP",
    "R/G OIL TEMP.",
    "R/G THRUST BEAR. TEMP.",
    "NO.1 START AIR PRESS",
    "NO.2 START AIR PRESS",
    "CONTROL AIR PRESS.",
    "R/G LUB. OIL PRESS.",
    "M/E REVOLUTION",
    "T/C REVOLUTION",
    "F.O. RACK"
];

const DATA_MAPPING = {
    "BOOST AIR PRESS.": "val-boost-air-press",
    "FUEL OIL PRESS.": "val-fuel-oil-press",
    "LUB. OIL PRESS.": "val-lub-oil-press",
    "H.T. F.W. PRESS.": "val-ht-fw-press",
    "T/C LUB. OIL PRESS.": "val-tc-lub-oil-press",
    "EXH. GAS T/C INLET NO.1 TEMP.": "val-exh-inlet-1",
    "EXH. GAS T/C INLET NO.2 TEMP.": "val-exh-inlet-2",
    "EXH. GAS T/C OUTLET TEMP": "val-exh-outlet",
    "R/G OIL TEMP.": "val-rg-oil-temp",
    "R/G THRUST BEAR. TEMP.": "val-rg-thrust-temp",
    "R/G LUB. OIL PRESS.": "val-rg-lub-press",
    "M/E REVOLUTION": "val-me-rev",
    "T/C REVOLUTION": "val-tc-rev",
    "F.O. RACK": "val-fo-rack"
};
// Manual layout control for all overlay boxes on the engine image.
// Edit only this object when you want to move cylinders, metric panels,
// or data tags without touching the HTML structure below.
const UI_LAYOUT = {
    baseWidth: 1456,
    cylinders: {
        "1": { x: "40%", y: "20%", scale: 1.0 },
        "2": { x: "47%", y: "20%", scale: 1.0 },
        "3": { x: "54.3%", y: "20%", scale: 1.0 },
        "4": { x: "61.5%", y: "20%", scale: 1.0 },
        "5": { x: "68.7%", y: "20%", scale: 1.0 },
        "6": { x: "76%", y: "20%", scale: 1.0 }
    },
    panels: {
        meRev: { x: "15%", y: "55%", scale: 1.2 },
        tcRev: { x: "31%", y: "42%", scale: 1.2, anchor: "right" }
    },
    tags: {
        "boost-air-press": { x: "39%", y: "30%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "fuel-oil-press": { x: "39%", y: "38%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "lub-oil-press": { x: "39%", y: "46%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "ht-fw-press": { x: "39%", y: "54%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "tc-lub-oil-press": { x: "39%", y: "62%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "fo-rack": { x: "39%", y: "70%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "exh-inlet-1": { x: "60%", y: "30%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "exh-inlet-2": { x: "60%", y: "38%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "exh-outlet": { x: "60%", y: "46%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "rg-oil-temp": { x: "60%", y: "54%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "rg-thrust-temp": { x: "60%", y: "62%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" },
        "rg-lub-press": { x: "60%", y: "70%", scale: 1.2, labelWidth: "200px", valueWidth: "60px" }
    }
};

const DIGITAL_FIXED_POINTS = [
    { addr: 1, label: "MAIN (AC) SOURCE", unit: "On/Off" },
    { addr: 2, label: "EMERG. (DC) SOURCE", unit: "On/Off" },
    { addr: 3, label: "TELEGRAPH SYSTEM SOURCE", unit: "On/Off" },
    { addr: 4, label: "GOVERNOR SOURCE", unit: "On/Off" },
    { addr: 5, label: "BATTERY SOURCE", unit: "On/Off" },
    { addr: 7, label: "CONTROL SYSTEM", unit: "On/Off" },
    { addr: 8, label: "SAFETY SYSTEM", unit: "On/Off" },
    { addr: 9, label: "GOVERNOR MAJOR FAILURE", unit: "On/Off" },
    { addr: 10, label: "GOVERNOR MINOR FAILURE", unit: "On/Off" },
    { addr: 11, label: "SPEED SW. UNIT FOR CONT. CPU", unit: "On/Off" },
    { addr: 12, label: "SENSOR FOR CONTROL", unit: "On/Off" },
    { addr: 13, label: "SPEED SW. UNIT FOR SAFETY CPU", unit: "On/Off" },
    { addr: 14, label: "SENSOR FOR SAFETY", unit: "On/Off" },
    { addr: 15, label: "HANDLE SWITCH", unit: "On/Off" },
    { addr: 18, label: "M/E MANUAL EMERG. SHUT DOWN", unit: "On/Off" },
    { addr: 19, label: "M/E OVER SPEED SHUT DOWN", unit: "On/Off" },
    { addr: 20, label: "M/E L.O. LOW PRESS. SHD", unit: "On/Off" },
    { addr: 21, label: "OIL MIST HIGH HIGH DENSITY SHD", unit: "On/Off" },
    { addr: 22, label: "R/G OPERATING OIL LOW PRESS. SHD", unit: "On/Off" },
    { addr: 23, label: "M/E EMERG. SHUT DOWN PREWARNING", unit: "On/Off" },
    { addr: 24, label: "M/E EMERG. SHUT DOWN CANCEL", unit: "On/Off" },
    { addr: 26, label: "R/G OPERATING OIL LOW PRESS. SLD", unit: "On/Off" },
    { addr: 27, label: "R/G OIL HIGH TEMP. SLD", unit: "On/Off" },
    { addr: 28, label: "R/G THRUST BEAR. HIGH TEMP. SLD", unit: "On/Off" },
    { addr: 29, label: "M/E SLOW DOWN PREWARNING", unit: "On/Off" },
    { addr: 30, label: "M/E SLOW DOWN CANCEL", unit: "On/Off" },
    { addr: 32, label: "M/E FUEL OIL PRESS.", unit: "On/Off" },
    { addr: 33, label: "M/E LUB. OIL PRESS.", unit: "On/Off" },
    { addr: 34, label: "M/E H.T. F.W. PRESS.", unit: "On/Off" },
    { addr: 35, label: "M/E T/C LUB. OIL PRESS.", unit: "On/Off" },
    { addr: 36, label: "M/E FUEL OIL LEAKED TANK LEVEL", unit: "On/Off" },
    { addr: 37, label: "M/E L.O. AUTO. BACKWASH FILTER DIFF", unit: "On/Off" },
    { addr: 39, label: "M/E LUB. OIL TEMP.", unit: "On/Off" },
    { addr: 40, label: "M/E H.T. F.W. TEMP.", unit: "On/Off" },
    { addr: 42, label: "M/E FUEL OIL TEMP.", unit: "On/Off" },
    { addr: 44, label: "OIL MIST DETECTOR FAILURE", unit: "On/Off" },
    { addr: 45, label: "OIL MIST HIGH DENSITY", unit: "On/Off" },
    { addr: 46, label: "M/E NO.1 CYL. EXH. GAS OUTLET TEMP", unit: "On/Off" },
    { addr: 47, label: "M/E NO.2 CYL. EXH. GAS OUTLET TEMP", unit: "On/Off" },
    { addr: 48, label: "M/E NO.3 CYL. EXH. GAS OUTLET TEMP", unit: "On/Off" },
    { addr: 49, label: "M/E NO.4 CYL. EXH. GAS OUTLET TEMP", unit: "On/Off" },
    { addr: 50, label: "M/E NO.5 CYL. EXH. GAS OUTLET TEMP", unit: "On/Off" },
    { addr: 51, label: "M/E NO.6 CYL. EXH. GAS OUTLET TEMP", unit: "On/Off" },
    { addr: 55, label: "M/E NO.1 CYL. EXH. GAS OUT. TEMP. DI", unit: "On/Off" },
    { addr: 56, label: "M/E NO.2 CYL. EXH. GAS OUT. TEMP. DI", unit: "On/Off" },
    { addr: 57, label: "M/E NO.3 CYL. EXH. GAS OUT. TEMP. DI", unit: "On/Off" },
    { addr: 58, label: "M/E NO.4 CYL. EXH. GAS OUT. TEMP. DI", unit: "On/Off" },
    { addr: 59, label: "M/E NO.5 CYL. EXH. GAS OUT. TEMP. DI", unit: "On/Off" },
    { addr: 60, label: "M/E NO.6 CYL. EXH. GAS OUT. TEMP. DI", unit: "On/Off" },
    { addr: 61, label: "NO.1 START AIR PRESS.", unit: "On/Off" },
    { addr: 62, label: "NO.2 START AIR PRESS.", unit: "On/Off" },
    { addr: 63, label: "CONTROL AIR PRESS.", unit: "On/Off" },
    { addr: 76, label: "R/G LUB. OIL PRESS.", unit: "On/Off" },
    { addr: 78, label: "R/G OIL TEMP.", unit: "On/Off" },
    { addr: 79, label: "R/G THRUST BEAR. TEMP.", unit: "On/Off" },
    { addr: 81, label: "R/G OPERATING OIL LOW PRESS.", unit: "On/Off" },
    { addr: 82, label: "R/G L.O. FILTER HIGH DIFF. PRESS.", unit: "On/Off" },
    { addr: 83, label: "R/G OIL LEVEL TOO LOW", unit: "On/Off" },
    { addr: 84, label: "R/G CONTROL VOLTAGE", unit: "On/Off" }
];

const TARGET_ME = ME_OPTIONS.includes(normalizeDgName(dgParam)) ? normalizeDgName(dgParam) : "ME-PORT";

function updatePageTitle() {
    const el = getById("page-title");
    if (!el) return;
    el.textContent = `${TARGET_ME} Dashboard`;
}

const filterRowsByTarget = (rows) => {
    if (!Array.isArray(rows)) return [];
    const hasDgName = rows.some((item) => item && item.dg_name != null);
    return hasDgName ? filterByTarget(rows, TARGET_ME) : rows;
};

function applyMeSceneLayout() {
    // Scene layout is handled by responsive CSS grid for ME_dashboard.html.
}

const overlayLayout = createOverlayLayoutController({
    layout: UI_LAYOUT,
    applySceneLayout: applyMeSceneLayout,
    panelBindings: [
        { elementId: "panel-me-rev", panelKey: "meRev" },
        { elementId: "panel-tc-rev", panelKey: "tcRev" },
    ],
    afterRefresh: () => updateOverlayAnalog(latestAnalogRows),
});

const refreshOverlayLayout = () => overlayLayout.refresh();
const scheduleOverlayRefresh = () => overlayLayout.scheduleRefresh();
const scheduleStabilizedLayoutRefresh = () => overlayLayout.scheduleStabilizedRefresh();
const bindOverlayResizeObserver = () => overlayLayout.bindResizeObserver();

function getEngineIdleImagePath() {
    return "Asset/engine.png";
}

let lastEngineRunningState = false;

function updateEngineBackgroundImage(isEngineRunning) {
    lastEngineRunningState = Boolean(isEngineRunning);
    const engineBackgroundImage = getById("engine-background-image");
    if (!engineBackgroundImage) return;
    engineBackgroundImage.src = lastEngineRunningState ? "Asset/engine_running_kiosk.png" : getEngineIdleImagePath();
}

function resolveDisplayRows(rows) {
    if (!Array.isArray(rows)) return [];
    if (rows.length === 0) return rows;
    return rows.some((item) => item && item.dg_name != null)
        ? filterRowsByTarget(rows)
        : rows;
}

function updateHeaderLights(digitalRows) {
    const rows = resolveDisplayRows(digitalRows);
    const runRow = rows.find(item => String(item.label || "").trim().toUpperCase() === "ENGINE RUN");
    const meRevNum = Number(latestMeRevolution);
    const isRunningByMeRev = Number.isFinite(meRevNum) && meRevNum !== 0;
    const isEngineRunning = isOnValue(runRow?.value) || isRunningByMeRev;

    updateEngineBackgroundImage(isEngineRunning);
}

function updateAlarmLight(machineData) {
    const analogRows = Array.isArray(machineData?.analog) ? machineData.analog : [];
    const digitalRows = Array.isArray(machineData?.digital) ? machineData.digital : [];
    const analogCritical = analogRows.some((item) => String(item?.status || "").trim().toLowerCase() === "critical");
    const digitalAlarm = digitalRows.some((item) => String(item?.status || "").trim().toLowerCase() === "alarm");
    const indicator = getById("engine-alarm-indicator");
    if (indicator) indicator.classList.toggle("active", analogCritical || digitalAlarm);
}

function getCylinderValueElementId(label) {
    const normalized = String(label || "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
    const match = normalized.match(/(?:^|[\s/-])NO\.\s*(\d+)\s*CYL\./i);
    return match ? `val-cyl-${match[1]}` : null;
}

function updateOverlayAnalog(data) {
    if (!data || data.length === 0) return;
    const rows = resolveDisplayRows(data);
    let nextMeRevolution = 0;
    let hasMeRevolution = false;
    rows.forEach((item) => {
        if (item.value == null || item.label == null) return;
        const label = String(item.label).trim();
        if (label === "M/E REVOLUTION") {
            const parsed = Number(item.value);
            nextMeRevolution = Number.isFinite(parsed) ? parsed : 0;
            hasMeRevolution = true;
        }
        const cylId = getCylinderValueElementId(label);
        if (cylId) {
            const el = getById(cylId);
            if (el) el.textContent = String(Math.round(item.value));
            return;
        }
        const elementId = DATA_MAPPING[label];
        if (!elementId) return;
        const el = getById(elementId);
        if (!el) return;
        const isPress = label.includes("PRESS.");
        const next = isPress ? Number(item.value).toFixed(2) : String(Math.round(item.value));
        el.textContent = next;
    });
    latestMeRevolution = hasMeRevolution ? nextMeRevolution : 0;
}

function updateAnalogTable(data) {
    const leftTbody = getById("analog-tbody-left");
    const middleTbody = getById("analog-tbody-middle");
    const rightTbody = getById("analog-tbody-right");
    if (!leftTbody || !middleTbody || !rightTbody) return;
    leftTbody.innerHTML = "";
    middleTbody.innerHTML = "";
    rightTbody.innerHTML = "";
    const rows = resolveDisplayRows(data);
    const valueByLabel = new Map();
    rows.forEach((item) => {
        const key = String(item.label || "").trim();
        if (!key) return;
        valueByLabel.set(key, { value: item.value, unit: item.unit });
    });

    const chunkSize = Math.ceil(ANALOG_FIXED_POINTS.length / 3);
    const leftPoints = ANALOG_FIXED_POINTS.slice(0, chunkSize);
    const middlePoints = ANALOG_FIXED_POINTS.slice(chunkSize, chunkSize * 2);
    const rightPoints = ANALOG_FIXED_POINTS.slice(chunkSize * 2);

    function render(points, tbody) {
        points.forEach((label) => {
            const tr = document.createElement("tr");
            const labelTd = document.createElement("td");
            labelTd.textContent = label;
            tr.appendChild(labelTd);

            const valueTd = document.createElement("td");
            const payload = valueByLabel.get(label);
            if (payload && payload.value != null) {
                const val = payload.value;
                valueTd.textContent = payload.unit ? `${val} ${payload.unit}` : String(val);
            } else {
                valueTd.textContent = "";
            }
            tr.appendChild(valueTd);
            tbody.appendChild(tr);
        });
    }

    render(leftPoints, leftTbody);
    render(middlePoints, middleTbody);
    render(rightPoints, rightTbody);
}

function updateDigitalTable(data) {
    const leftTbody = getById("digital-tbody-left");
    const middleTbody = getById("digital-tbody-middle");
    const rightTbody = getById("digital-tbody-right");
    if (!leftTbody || !middleTbody || !rightTbody) return;
    leftTbody.innerHTML = "";
    middleTbody.innerHTML = "";
    rightTbody.innerHTML = "";
    const rows = resolveDisplayRows(data);
    const greenStatusLabels = new Set(["ENGINE RUN", "READY TO START"]);
    const valueByLabel = new Map();
    rows.forEach((item) => {
        const key = String(item.label || "").trim();
        if (!key) return;
        valueByLabel.set(key, item.value);
    });

    const chunkSize = Math.ceil(DIGITAL_FIXED_POINTS.length / 3);
    const leftPoints = DIGITAL_FIXED_POINTS.slice(0, chunkSize);
    const middlePoints = DIGITAL_FIXED_POINTS.slice(chunkSize, chunkSize * 2);
    const rightPoints = DIGITAL_FIXED_POINTS.slice(chunkSize * 2);

    function render(points, tbody) {
        points.forEach((point) => {
            const tr = document.createElement("tr");
            const labelTd = document.createElement("td");
            labelTd.textContent = point.label;
            tr.appendChild(labelTd);

            const valueTd = document.createElement("td");
            const rawValue = valueByLabel.get(point.label);
            let value = rawValue == null ? "" : String(rawValue);
            if (rawValue != null) {
                if (isOnValue(rawValue)) {
                    value = "ON";
                } else if (String(rawValue).trim() === "0" || Number(rawValue) === 0) {
                    value = "OFF";
                }
            }
            valueTd.textContent = value;
            if (rawValue != null && isOnValue(rawValue)) {
                valueTd.classList.add(
                    greenStatusLabels.has(String(point.label || "").trim().toUpperCase())
                        ? "digital-status-on"
                        : "digital-on"
                );
            }
            tr.appendChild(valueTd);
            tbody.appendChild(tr);
        });
    }

    render(leftPoints, leftTbody);
    render(middlePoints, middleTbody);
    render(rightPoints, rightTbody);
}

let isFetching = false;
let consecutiveFailures = 0;
let latestMeRevolution = 0;
const POLL_INTERVAL_MS = 5000;
const FETCH_TIMEOUT_MS = 60000;
let latestAnalogRows = [];

async function fetchData() {
    if (isFetching) return;
    isFetching = true;
    try {
        const response = await fetchWithTimeout(`${API_BASE}/all`, FETCH_TIMEOUT_MS, { cache: "no-store" });
        if (!response.ok) throw new Error(`Status API error: ${response.status}`);

        const payload = await response.json();
        const machineData = Array.isArray(payload)
            ? payload.find((item) => normalizeDgName(item?.dg_name) === TARGET_ME)
            : null;
        const analogData = Array.isArray(machineData?.analog) ? machineData.analog : [];
        const digitalData = Array.isArray(machineData?.digital) ? machineData.digital : [];
        latestAnalogRows = analogData;

        updateOverlayAnalog(analogData);
        updateAnalogTable(analogData);
        updateDigitalTable(digitalData);
        updateHeaderLights(digitalData);
        updateAlarmLight(machineData);
        setTimestampHeader("current-datetime", formatTimestampDisplay(null, extractMachineTimestamp(machineData, payload)));
        consecutiveFailures = 0;
    } catch (error) {
        console.error("Fetch error:", error);
        consecutiveFailures += 1;
        latestMeRevolution = 0;
        setTimestampHeader("current-datetime", error?.message || "---- -- -- --:--:--");
        if (consecutiveFailures >= 2) {
            updateHeaderLights([]);
            updateAlarmLight(null);
        }
    } finally {
        isFetching = false;
    }
}

window.onload = () => {
    updatePageTitle();
    bindHomeNavigation();
    refreshOverlayLayout();
    updateAnalogTable([]);
    updateDigitalTable([]);
    setTimestampHeader("current-datetime", "");
    updateEngineBackgroundImage(false);
    window.addEventListener("drums:themechange", () => updateEngineBackgroundImage(lastEngineRunningState));
    bindOverlayResizeObserver();
    window.addEventListener("resize", scheduleOverlayRefresh);
    window.addEventListener("pageshow", scheduleStabilizedLayoutRefresh);
    const engineBackgroundImage = getById("engine-background-image");
    if (engineBackgroundImage) {
        engineBackgroundImage.addEventListener("load", scheduleOverlayRefresh);
    }
    scheduleStabilizedLayoutRefresh();
    fetchData();
    setInterval(fetchData, POLL_INTERVAL_MS);
};
