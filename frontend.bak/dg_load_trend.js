(function () {
    "use strict";

    const runningHoursValueLabelPlugin = {
        id: "runningHoursValueLabel",
        afterDatasetsDraw(chart) {
            if (chart?.canvas?.id !== "running-hours-chart") return;
            const datasetMeta = chart.getDatasetMeta(0);
            const dataset = chart.data?.datasets?.[0];
            if (!datasetMeta || !dataset) return;

            const { ctx } = chart;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "700 13px sans-serif";

            datasetMeta.data.forEach((bar, index) => {
                const value = Number(dataset.data[index]);
                if (!Number.isFinite(value)) return;
                ctx.fillStyle = "#0f172a";
                ctx.fillText(String(value), bar.x, (bar.y + bar.base) / 2);
            });

            ctx.restore();
        },
    };

    const pmsValueLabelPlugin = {
        id: "pmsValueLabel",
        afterDatasetsDraw(chart) {
            if (chart?.canvas?.id !== "pms-chart") return;
            const { ctx } = chart;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.font = "700 11px sans-serif";
            ctx.fillStyle = "#0f172a";

            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                meta.data.forEach((bar, index) => {
                    const value = Number(dataset.data[index]);
                    if (!Number.isFinite(value) || value <= 0) return;
                    ctx.fillText(String(Math.round(value * 100) / 100), bar.x, bar.y - 4);
                });
            });

            ctx.restore();
        },
    };

    const { fetchWithTimeout, resolveApiOrigin, bindChartViewportControls } = window.DashboardShared;

    const DOM = {
        from: document.getElementById("from-utc"),
        to: document.getElementById("to-utc"),
        dgCheckboxes: Array.from(document.querySelectorAll('input[name="dg-name"]')),
        status: document.getElementById("trend-status"),
        loading: document.getElementById("trend-loading"),
        clock: document.getElementById("current-datetime"),
        chartCanvas: document.getElementById("load-trend-chart"),
        runningHoursCanvas: document.getElementById("running-hours-chart"),
        pmsCanvas: document.getElementById("pms-chart"),
        pmsStatus: document.getElementById("pms-status"),
        pmsLoading: document.getElementById("pms-loading"),
        pmsVoltageValue: document.getElementById("pms-voltage-value"),
        pmsFrequencyValue: document.getElementById("pms-frequency-value"),
        apply: document.getElementById("apply-btn"),
        modeLoad: document.getElementById("mode-load-btn"),
        modePms: document.getElementById("mode-pms-btn"),
        mainChartTitle: document.getElementById("main-chart-title"),
        prev: document.getElementById("prev-24h-btn"),
        next: document.getElementById("next-24h-btn"),
        zoomIn: document.getElementById("zoom-in-btn"),
        zoomOut: document.getElementById("zoom-out-btn"),
        home: document.getElementById("go-home-logo"),
    };

    const CONFIG = {
        apiBase: `${resolveApiOrigin()}/api/engine_graph`,
        pmsApiBase: `${resolveApiOrigin()}/api/engine_graph/pms`,
        latestStatusApiBase: `${resolveApiOrigin()}/api/check_all_status_lable/all`,
        rangeMs: 10 * 60 * 60 * 1000,
        maxGapMs: 15 * 60 * 1000,
        minZoomRangeMs: 5 * 60 * 1000,
        requestTimeoutMs: 60000,
        requestMaxPoints: 300,
        cacheTtlMs: 60 * 1000,
        cachePrefix: "load-graph-trend::",
        chartModes: {
            load: {
                graphType: "load",
                title: "Load Trend",
                yTitle: "Load (KwE)",
                yRange: { min: 0, max: 750, step: 50 },
                unit: "KwE",
            },
            pms: {
                graphType: "pms",
                title: "PMS Trend",
                yTitle: "PMS Power (kW)",
                yRange: { min: 0, max: 750, step: 50 },
                unit: "kW",
            },
        },
        yRange: { min: 0, max: 750, step: 50 },
        seriesStyle: {
            "DG#1": { borderColor: "#1d4ed8", backgroundColor: "rgba(29, 78, 216, 0.18)" },
            "DG#2": { borderColor: "#16a34a", backgroundColor: "rgba(22, 163, 74, 0.18)" },
            "DG#3": { borderColor: "#b91c1c", backgroundColor: "rgba(185, 28, 28, 0.18)" },
        },
    };

    const state = {
        chart: null,
        runningHoursChart: null,
        pmsChart: null,
        range: { fromMs: NaN, toMs: NaN },
        didPan: false,
        activeRequestId: 0,
        activePmsRequestId: 0,
        timeZone: "__browser__",
        selectedPointMs: NaN,
        selectedDgNames: [],
        chartMode: "load",
    };

    const initialDg = (() => {
        const raw = new URLSearchParams(window.location.search).get("dg");
        const normalized = String(raw || "").trim().toUpperCase();
        if (normalized === "DG#1" || normalized === "DG1" || normalized === "1") return "DG#1";
        if (normalized === "DG#2" || normalized === "DG2" || normalized === "2") return "DG#2";
        if (normalized === "DG#3" || normalized === "DG3" || normalized === "3") return "DG#3";
        return "";
    })();

    function pad(value) { return String(value).padStart(2, "0"); }
    function isBrowserTimeZone(value) { return value === "__browser__"; }
    function getBrowserTimeZoneName() {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"; } catch { return "Local"; }
    }
    function getSelectedTimeZoneLabel() { return isBrowserTimeZone(state.timeZone) ? getBrowserTimeZoneName() : state.timeZone; }

    function getDateTimeParts(date, timeZone) {
        if (isBrowserTimeZone(timeZone)) {
            return {
                year: String(date.getFullYear()),
                month: pad(date.getMonth() + 1),
                day: pad(date.getDate()),
                hour: pad(date.getHours()),
                minute: pad(date.getMinutes()),
                second: pad(date.getSeconds()),
            };
        }
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone, year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
        });
        const parts = formatter.formatToParts(date);
        return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    }

    function formatDateForInput(date, timeZone) {
        const parts = getDateTimeParts(date, timeZone);
        return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    }

    function getTimeZoneOffsetMs(date, timeZone) {
        if (timeZone === "UTC") return 0;
        const parts = getDateTimeParts(date, timeZone);
        const utcMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
        return utcMs - date.getTime();
    }

    function parseInputValueForTimeZone(value, timeZone) {
        const raw = String(value || "").trim();
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const hour = Number(match[4]);
        const minute = Number(match[5]);
        if (isBrowserTimeZone(timeZone)) return new Date(year, month - 1, day, hour, minute, 0, 0);
        const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
        if (timeZone === "UTC") return new Date(naiveUtcMs);
        let candidateMs = naiveUtcMs;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const offsetMs = getTimeZoneOffsetMs(new Date(candidateMs), timeZone);
            const resolvedMs = naiveUtcMs - offsetMs;
            if (Math.abs(resolvedMs - candidateMs) < 1000) { candidateMs = resolvedMs; break; }
            candidateMs = resolvedMs;
        }
        return new Date(candidateMs);
    }

    function parseApiTimestamp(value) {
        const raw = String(value || "").trim();
        if (!raw) return NaN;
        const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
        return Date.parse(/[zZ]$|[+\-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
    }

    function formatTimeLabel(value, includeDate) {
        const parts = getDateTimeParts(new Date(Number(value)), state.timeZone);
        const hours = Number(parts.hour);
        const time = `${hours % 12 || 12}:${parts.minute} ${hours >= 12 ? "PM" : "AM"}`;
        return includeDate ? `${parts.day}/${parts.month} ${time}` : time;
    }

    function formatTooltipTime(value) {
        const parts = getDateTimeParts(new Date(Number(value)), state.timeZone);
        return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${getSelectedTimeZoneLabel()}`;
    }

    function formatPmsSnapshotText(timestampValue) {
        const ms = parseApiTimestamp(timestampValue);
        if (!Number.isFinite(ms)) return "Showing latest PMS snapshot.";
        return `PMS snapshot at ${formatTooltipTime(ms)}.`;
    }

    function updateHeaderTime() {
        if (!DOM.clock) return;
        const now = new Date();
        const parts = getDateTimeParts(now, state.timeZone);
        DOM.clock.innerHTML = `${parts.month}/${parts.day}/${String(parts.year).slice(-2)} &nbsp;&nbsp; ${parts.hour}:${parts.minute}:${parts.second}`;
    }

    function setStatus(message, isError) {
        DOM.status.textContent = message || "";
        DOM.status.classList.toggle("error", !!isError);
    }

    function getActiveChartModeConfig() {
        return CONFIG.chartModes[state.chartMode] || CONFIG.chartModes.load;
    }

    function updateModeButtons() {
        if (DOM.modeLoad) DOM.modeLoad.classList.toggle("is-active", state.chartMode === "load");
        if (DOM.modePms) DOM.modePms.classList.toggle("is-active", state.chartMode === "pms");
        if (DOM.mainChartTitle) DOM.mainChartTitle.textContent = getActiveChartModeConfig().title;
    }

    function setLoading(isLoading) {
        if (!DOM.loading) return;
        DOM.loading.classList.toggle("active", !!isLoading);
    }

    function setPmsLoading(isLoading) {
        if (!DOM.pmsLoading) return;
        DOM.pmsLoading.classList.toggle("active", !!isLoading);
    }

    function buildCacheKey(queryString) { return `${CONFIG.cachePrefix}${queryString}`; }
    function readCachedPayload(queryString) {
        try {
            const raw = sessionStorage.getItem(buildCacheKey(queryString));
            if (!raw) return null;
            const cached = JSON.parse(raw);
            if (!cached || typeof cached !== "object") return null;
            if ((Date.now() - Number(cached.savedAt || 0)) > CONFIG.cacheTtlMs) return null;
            return cached.payload || null;
        } catch { return null; }
    }
    function writeCachedPayload(queryString, payload) {
        try { sessionStorage.setItem(buildCacheKey(queryString), JSON.stringify({ savedAt: Date.now(), payload })); } catch {}
    }

    function getSelectedDgNames() {
        return Array.from(document.querySelectorAll('input[name="dg-name"]:checked'), (input) => input.value);
    }

    function extractLatestTimestampMs(payload) {
        const candidates = [];
        const pushTimestamp = (value) => {
            const ms = parseApiTimestamp(value);
            if (Number.isFinite(ms)) candidates.push(ms);
        };
        (Array.isArray(payload) ? payload : []).forEach((machine) => {
            pushTimestamp(machine?.timestamp);
            pushTimestamp(machine?.TimeStamp);
            pushTimestamp(machine?.timeStamp);
            pushTimestamp(machine?.time_stamp);
            const analogRows = Array.isArray(machine?.analog) ? machine.analog : [];
            const digitalRows = Array.isArray(machine?.digital) ? machine.digital : [];
            analogRows.forEach((row) => pushTimestamp(row?.timestamp));
            digitalRows.forEach((row) => pushTimestamp(row?.timestamp));
        });
        return candidates.length > 0 ? Math.max(...candidates) : NaN;
    }

    async function syncDefaultRange() {
        let maxTimestampMs = NaN;
        try {
            const response = await fetchWithTimeout(CONFIG.latestStatusApiBase, CONFIG.requestTimeoutMs, { cache: "no-store" });
            if (response.ok) {
                const payload = await response.json();
                maxTimestampMs = extractLatestTimestampMs(payload);
            }
        } catch (_) {}
        const anchorDate = Number.isFinite(maxTimestampMs) ? new Date(maxTimestampMs) : new Date();
        DOM.from.value = formatDateForInput(new Date(anchorDate.getTime() - CONFIG.rangeMs), state.timeZone);
        DOM.to.value = formatDateForInput(anchorDate, state.timeZone);
    }

    function shiftRange(deltaMs) {
        const from = parseInputValueForTimeZone(DOM.from.value, state.timeZone);
        const to = parseInputValueForTimeZone(DOM.to.value, state.timeZone);
        if (!from || !to) return;
        DOM.from.value = formatDateForInput(new Date(from.getTime() + deltaMs), state.timeZone);
        DOM.to.value = formatDateForInput(new Date(to.getTime() + deltaMs), state.timeZone);
        loadTrend();
    }

    function normalizeChartPoints(points, gapThresholdMs) {
        const normalized = (Array.isArray(points) ? points : []).map((point) => {
            const x = parseApiTimestamp(point.timestamp);
            const y = Number(point.value);
            return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        }).filter(Boolean);
        return normalized.reduce((result, point, index) => {
            const previous = normalized[index - 1];
            if (previous && (point.x - previous.x) > gapThresholdMs) result.push({ x: point.x, y: null });
            result.push(point);
            return result;
        }, []);
    }

    function createTooltipEl(chartInstance) {
        const existing = chartInstance.canvas.parentNode.querySelector(".chartjs-external-tooltip");
        if (existing) return existing;
        const tooltipEl = document.createElement("div");
        tooltipEl.className = "chartjs-external-tooltip";
        Object.assign(tooltipEl.style, {
            background: "rgba(255, 255, 255, 0.98)",
            border: "1px solid #94a3b8",
            borderRadius: "10px",
            color: "#0f172a",
            pointerEvents: "none",
            position: "absolute",
            transform: "translate(-50%, 0)",
            transition: "all .08s ease",
            padding: "8px 10px",
            fontWeight: "700",
            fontSize: "12px",
            boxShadow: "0 10px 20px rgba(15, 23, 42, 0.18)",
            whiteSpace: "nowrap",
            zIndex: "20",
            opacity: "0",
        });
        chartInstance.canvas.parentNode.style.position = "relative";
        chartInstance.canvas.parentNode.appendChild(tooltipEl);
        return tooltipEl;
    }

    function externalTooltipHandler({ chart: chartInstance, tooltip }) {
        const tooltipEl = createTooltipEl(chartInstance);
        if (!tooltip || tooltip.opacity === 0) { tooltipEl.style.opacity = "0"; return; }
        tooltipEl.innerHTML = `
            <div style="font-size:11px;margin-bottom:6px;">${(tooltip.title || []).join(" ")}</div>
            ${(tooltip.dataPoints || []).map((item) => `
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:12px;height:12px;border-radius:2px;background:${item.dataset.borderColor};border:1px solid ${item.dataset.borderColor};display:inline-block;"></span>
                    <span>${item.dataset.label}: ${item.formattedValue} ${item.dataset.unit || "KwE"}</span>
                </div>
            `).join("")}
        `;
        const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = chartInstance.canvas;
        const left = offsetLeft + tooltip.caretX;
        const top = offsetTop + tooltip.caretY + 18;
        tooltipEl.style.opacity = "1";
        tooltipEl.style.left = `${Math.max(12, Math.min(left, offsetLeft + offsetWidth - 12))}px`;
        tooltipEl.style.top = `${Math.min(top, offsetTop + offsetHeight - 12)}px`;
    }

    function createChartConfig() {
        const mode = getActiveChartModeConfig();
        return {
            type: "line",
            data: { datasets: [] },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "nearest", intersect: false },
                plugins: {
                    decimation: { enabled: true, algorithm: "min-max", samples: 180 },
                    legend: { labels: { color: "#334155", font: { size: 13, weight: "700" } } },
                    tooltip: { enabled: false, external: externalTooltipHandler, callbacks: { title(items) { return items?.[0] ? formatTooltipTime(items[0].parsed.x) : ""; } } },
                },
                scales: {
                    x: {
                        type: "linear",
                        ticks: { color: "#475569", maxTicksLimit: 10, callback(value) { return formatTimeLabel(value, (state.range.toMs - state.range.fromMs) > CONFIG.rangeMs); } },
                        title: { display: true, text: `Time (${getSelectedTimeZoneLabel()})`, color: "#334155", font: { size: 14, style: "italic", weight: "700" } },
                        grid: { color: "rgba(100, 116, 139, 0.14)" },
                        border: { color: "rgba(100, 116, 139, 0.28)" },
                    },
                    y: {
                        min: mode.yRange.min,
                        max: mode.yRange.max,
                        ticks: { color: "#475569", stepSize: mode.yRange.step },
                        title: { display: true, text: mode.yTitle, color: "#334155", font: { size: 14, style: "italic", weight: "700" } },
                        grid: { color: "rgba(100, 116, 139, 0.14)" },
                        border: { color: "rgba(100, 116, 139, 0.28)" },
                    },
                },
            },
        };
    }

    function createRunningHoursChartConfig() {
        return {
            type: "bar",
            data: {
                labels: ["DG#1", "DG#2", "DG#3"],
                datasets: [{
                    label: "Running Hours Max",
                    data: [0, 0, 0],
                    backgroundColor: ["rgba(29, 78, 216, 0.75)", "rgba(22, 163, 74, 0.75)", "rgba(185, 28, 28, 0.75)"],
                    borderColor: ["#1d4ed8", "#16a34a", "#b91c1c"],
                    borderWidth: 1.5,
                    borderRadius: 8,
                    categoryPercentage: 0.5,
                    barPercentage: 0.5,
                }],
            },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label(context) {
                                const value = Number(context.parsed.y);
                                return `${context.label}: ${Number.isFinite(value) ? value : 0} x10Hours`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: "#475569", font: { size: 13, weight: "700" } },
                        grid: { display: false },
                        border: { color: "rgba(100, 116, 139, 0.28)" },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: "#475569" },
                        title: { display: true, text: "Running Hours (x10Hours)", color: "#334155", font: { size: 14, style: "italic", weight: "700" } },
                        grid: { color: "rgba(100, 116, 139, 0.14)" },
                        border: { color: "rgba(100, 116, 139, 0.28)" },
                    },
                },
            },
        };
    }

    function createPmsChartConfig() {
        return {
            type: "bar",
            data: {
                labels: ["DG#1", "DG#2", "DG#3"],
                datasets: [
                    { label: "Power (kW)", data: [0, 0, 0], backgroundColor: [], borderColor: [], borderWidth: 1.5, borderRadius: 8, categoryPercentage: 0.62, barPercentage: 0.88 },
                    { label: "Current (A)", data: [0, 0, 0], backgroundColor: [], borderColor: [], borderWidth: 1.5, borderRadius: 8, categoryPercentage: 0.62, barPercentage: 0.88 },
                ],
            },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        onClick: () => {},
                        labels: { color: "#334155", font: { size: 12, weight: "700" } },
                    },
                    tooltip: {
                        callbacks: {
                            label(context) {
                                const unit = context.dataset.label.includes("Current") ? "A" : "kW";
                                const value = Number(context.parsed.y);
                                return `${context.dataset.label} ${context.label}: ${Number.isFinite(value) ? value : 0} ${unit}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        stacked: false,
                        ticks: {
                            color(context) {
                                const label = String(context?.tick?.label || "");
                                return state.selectedDgNames.includes(label) ? "#475569" : "#94a3b8";
                            },
                            font: { size: 13, weight: "700" },
                        },
                        grid: { display: false },
                        border: { color: "rgba(100, 116, 139, 0.28)" },
                    },
                    y: {
                        beginAtZero: true,
                        max: 600,
                        ticks: { color: "#475569" },
                        title: { display: true, text: "Power / Current", color: "#334155", font: { size: 14, style: "italic", weight: "700" } },
                        grid: { color: "rgba(100, 116, 139, 0.14)" },
                        border: { color: "rgba(100, 116, 139, 0.28)" },
                    },
                },
            },
        };
    }

    function buildChart() {
        state.chart = new Chart(DOM.chartCanvas.getContext("2d"), createChartConfig());
    }

    function buildRunningHoursChart() {
        if (!DOM.runningHoursCanvas) return;
        state.runningHoursChart = new Chart(DOM.runningHoursCanvas.getContext("2d"), {
            ...createRunningHoursChartConfig(),
            plugins: [runningHoursValueLabelPlugin],
        });
    }

    function buildPmsChart() {
        if (!DOM.pmsCanvas) return;
        state.pmsChart = new Chart(DOM.pmsCanvas.getContext("2d"), {
            ...createPmsChartConfig(),
            plugins: [pmsValueLabelPlugin],
        });
    }

    function isSelectedPoint(pointX) {
        return Number.isFinite(state.selectedPointMs) && Math.abs(Number(pointX) - state.selectedPointMs) < 1000;
    }

    async function loadPmsSnapshot(timestampIso) {
        const requestId = ++state.activePmsRequestId;
        const params = new URLSearchParams();
        if (timestampIso) params.set("timestamp", timestampIso);
        if (DOM.pmsStatus) DOM.pmsStatus.textContent = timestampIso ? "Loading PMS snapshot for selected point..." : "Loading latest PMS snapshot...";
        setPmsLoading(true);
        try {
            const response = await fetchWithTimeout(`${CONFIG.pmsApiBase}?${params.toString()}`, CONFIG.requestTimeoutMs, { cache: "no-store" });
            if (!response.ok) throw new Error(`PMS API error: ${response.status}`);
            const payload = await response.json();
            if (requestId !== state.activePmsRequestId) return;
            applyPmsChartData(payload);
        } catch (error) {
            console.error("PMS snapshot fetch error:", error);
            if (requestId !== state.activePmsRequestId) return;
            if (DOM.pmsStatus) DOM.pmsStatus.textContent = error?.message || "Failed to load PMS snapshot.";
        } finally {
            if (requestId === state.activePmsRequestId) setPmsLoading(false);
        }
    }

    function clearSelectedTrendPoint() {
        state.selectedPointMs = NaN;
        if (state.chart) state.chart.update("none");
        void loadPmsSnapshot("");
    }

    function bindPanZoom() {
        bindChartViewportControls({
            chartCanvas: DOM.chartCanvas,
            zoomInButton: DOM.zoomIn,
            zoomOutButton: DOM.zoomOut,
            getChart: () => state.chart,
            getRange: () => state.range,
            minZoomRangeMs: CONFIG.minZoomRangeMs,
            mouseButton: 0,
            intersect: false,
            onPointSelect: (rawPoint) => {
                state.selectedPointMs = Number(rawPoint.x);
                state.chart?.update("none");
                void loadPmsSnapshot(new Date(state.selectedPointMs).toISOString());
            },
            onReset: () => {
                if (!Number.isFinite(state.selectedPointMs)) return;
                clearSelectedTrendPoint();
            },
        });
    }

    function applyChartData(payload) {
        const mode = getActiveChartModeConfig();
        state.range = { fromMs: parseApiTimestamp(payload?.from), toMs: parseApiTimestamp(payload?.to) };
        let totalVisiblePoints = 0;
        const bucketGapMs = Number(payload?.bucket_seconds) > 0 ? Number(payload.bucket_seconds) * 2000 : 0;
        const gapThresholdMs = Math.max(CONFIG.maxGapMs, bucketGapMs);
        state.chart.options.scales.x.title.text = `Time (${getSelectedTimeZoneLabel()})`;
        state.chart.options.scales.y.min = mode.yRange.min;
        state.chart.options.scales.y.max = mode.yRange.max;
        state.chart.options.scales.y.ticks.stepSize = mode.yRange.step;
        state.chart.options.scales.y.title.text = mode.yTitle;
        state.chart.options.scales.x.min = Number.isFinite(state.range.fromMs) ? state.range.fromMs : undefined;
        state.chart.options.scales.x.max = Number.isFinite(state.range.toMs) ? state.range.toMs : undefined;
        state.chart.data.datasets = (Array.isArray(payload?.series) ? payload.series : []).flatMap((item) => {
            const data = normalizeChartPoints(item.points, gapThresholdMs);
            const validPoints = data.filter((point) => point && typeof point.y === "number");
            if (validPoints.length === 0) return [];
            totalVisiblePoints += validPoints.length;
            const style = CONFIG.seriesStyle[item.dg_name] || CONFIG.seriesStyle["DG#1"];
            const basePointRadius = validPoints.length <= 2 ? 4 : 1.5;
            return [{
                label: item.dg_name,
                unit: item.unit || mode.unit,
                data,
                parsing: false,
                normalized: true,
                borderColor: Number.isFinite(state.selectedPointMs) ? "rgba(148, 163, 184, 0.8)" : style.borderColor,
                backgroundColor: Number.isFinite(state.selectedPointMs) ? "rgba(148, 163, 184, 0.18)" : style.backgroundColor,
                pointBackgroundColor(context) {
                    const pointX = Number(context?.raw?.x);
                    return isSelectedPoint(pointX) || !Number.isFinite(state.selectedPointMs) ? style.borderColor : "rgba(148, 163, 184, 0.75)";
                },
                pointBorderColor(context) {
                    const pointX = Number(context?.raw?.x);
                    return isSelectedPoint(pointX) || !Number.isFinite(state.selectedPointMs) ? style.borderColor : "rgba(100, 116, 139, 0.9)";
                },
                pointRadius(context) {
                    const pointX = Number(context?.raw?.x);
                    const isSelected = isSelectedPoint(pointX);
                    const defaultRadius = context?.raw?.y === 0 ? Math.max(basePointRadius, 2.5) : basePointRadius;
                    return isSelected ? Math.max(defaultRadius, 5) : defaultRadius;
                },
                pointBorderWidth(context) {
                    const pointX = Number(context?.raw?.x);
                    return isSelectedPoint(pointX) ? 2 : 1;
                },
                pointHoverRadius: 4,
                pointHitRadius: 10,
                borderWidth: 2.5,
                segment: {
                    borderColor(context) {
                        if (!Number.isFinite(state.selectedPointMs)) return style.borderColor;
                        const startX = Number(context?.p0?.parsed?.x);
                        const endX = Number(context?.p1?.parsed?.x);
                        return isSelectedPoint(startX) || isSelectedPoint(endX) ? style.borderColor : "rgba(148, 163, 184, 0.8)";
                    },
                },
                tension: 0.15,
                fill: false,
                clip: false,
                showLine: true,
                spanGaps: false,
            }];
        });
        state.chart.update("none");
        return totalVisiblePoints;
    }

    function getTrendParams() {
        const from = parseInputValueForTimeZone(DOM.from.value, state.timeZone);
        const to = parseInputValueForTimeZone(DOM.to.value, state.timeZone);
        const dgNames = getSelectedDgNames();
        const mode = getActiveChartModeConfig();
        if (!from || !to) return { error: "Please choose both From and To time." };
        if (from >= to) return { error: "'From' must be earlier than 'To'." };
        if (dgNames.length === 0) return { error: "Please select at least one DG." };
        const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), graph_type: mode.graphType });
        dgNames.forEach((dgName) => params.append("dg_names", dgName));
        params.set("max_points", String(CONFIG.requestMaxPoints));
        return { params, dgNames };
    }

    function applyRunningHoursChartData(payload) {
        if (!state.runningHoursChart) return;
        const labels = ["DG#1", "DG#2", "DG#3"];
        const latestByDg = new Map(labels.map((dgName) => [dgName, null]));
        for (const machineItem of Array.isArray(payload) ? payload : []) {
            const dgName = String(machineItem?.dg_name || "").trim();
            if (!latestByDg.has(dgName)) continue;
            const analogRows = Array.isArray(machineItem?.analog) ? machineItem.analog : [];
            const runningHourRow = analogRows.find((row) => String(row?.label || "").trim().toUpperCase() === "RUNNING HOUR");
            const value = Number(runningHourRow?.value);
            if (Number.isFinite(value)) latestByDg.set(dgName, value);
        }
        const palette = {
            "DG#1": { background: "rgba(29, 78, 216, 0.75)", border: "#1d4ed8" },
            "DG#2": { background: "rgba(22, 163, 74, 0.75)", border: "#16a34a" },
            "DG#3": { background: "rgba(185, 28, 28, 0.75)", border: "#b91c1c" },
        };
        const values = labels.map((dgName) => {
            const value = latestByDg.get(dgName);
            return Number.isFinite(value) ? value : 0;
        });
        const maxValue = values.reduce((highest, value) => Math.max(highest, Number(value) || 0), 0);
        state.runningHoursChart.data.labels = labels;
        state.runningHoursChart.data.datasets[0].data = values;
        state.runningHoursChart.data.datasets[0].backgroundColor = labels.map((dgName) => palette[dgName]?.background || "rgba(100, 116, 139, 0.75)");
        state.runningHoursChart.data.datasets[0].borderColor = labels.map((dgName) => palette[dgName]?.border || "#64748b");
        state.runningHoursChart.options.scales.y.max = maxValue > 0 ? maxValue : 1;
        state.runningHoursChart.update("none");
    }

    function createDiagonalPattern(context, color) {
        const patternCanvas = document.createElement("canvas");
        patternCanvas.width = 12;
        patternCanvas.height = 12;
        const patternCtx = patternCanvas.getContext("2d");
        if (!patternCtx) return color;
        patternCtx.fillStyle = "rgba(255,255,255,0.9)";
        patternCtx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
        patternCtx.strokeStyle = color;
        patternCtx.lineWidth = 2;
        patternCtx.beginPath();
        patternCtx.moveTo(-2, 10);
        patternCtx.lineTo(10, -2);
        patternCtx.moveTo(2, 14);
        patternCtx.lineTo(14, 2);
        patternCtx.stroke();
        return context.createPattern(patternCanvas, "repeat") || color;
    }

    function applyPmsChartData(payload) {
        if (!state.pmsChart) return;
        const labels = ["DG#1", "DG#2", "DG#3"];
        const selectedSet = new Set(Array.isArray(state.selectedDgNames) && state.selectedDgNames.length > 0
            ? state.selectedDgNames
            : labels);
        const ctx = state.pmsChart.ctx;
        const palette = {
            "DG#1": { solid: "rgba(29, 78, 216, 0.82)", border: "#1d4ed8" },
            "DG#2": { solid: "rgba(22, 163, 74, 0.82)", border: "#16a34a" },
            "DG#3": { solid: "rgba(185, 28, 28, 0.82)", border: "#b91c1c" },
        };

        const machineMap = new Map((Array.isArray(payload?.machines) ? payload.machines : []).map((machine) => [String(machine?.dg_name || "").trim(), machine]));
        const powerValues = labels.map((dgName) => selectedSet.has(dgName) ? (Number(machineMap.get(dgName)?.power_kw?.value) || 0) : 0);
        const currentValues = labels.map((dgName) => selectedSet.has(dgName) ? (Number(machineMap.get(dgName)?.current?.value) || 0) : 0);
        const maxValue = Math.max(1, ...powerValues, ...currentValues);

        state.pmsChart.data.labels = labels;
        state.pmsChart.data.datasets[0].data = powerValues;
        state.pmsChart.data.datasets[0].backgroundColor = labels.map((dgName) => palette[dgName].solid);
        state.pmsChart.data.datasets[0].borderColor = labels.map((dgName) => palette[dgName].border);
        state.pmsChart.data.datasets[1].data = currentValues;
        state.pmsChart.data.datasets[1].backgroundColor = labels.map((dgName) => createDiagonalPattern(ctx, palette[dgName].border));
        state.pmsChart.data.datasets[1].borderColor = labels.map((dgName) => palette[dgName].border);
        state.pmsChart.options.scales.y.max = 600;
        state.pmsChart.update("none");

        const activeMachine = labels
            .map((dgName) => machineMap.get(dgName))
            .find((machine) => (Number(machine?.power_kw?.value) || 0) > 0) || null;

        if (DOM.pmsVoltageValue) {
            DOM.pmsVoltageValue.textContent = activeMachine ? `${Number(activeMachine?.voltage?.value) || 0} ${activeMachine?.voltage?.unit || "V"}` : "--";
        }
        if (DOM.pmsFrequencyValue) {
            DOM.pmsFrequencyValue.textContent = activeMachine ? `${Number(activeMachine?.frequency?.value) || 0} ${activeMachine?.frequency?.unit || "Hz"}` : "--";
        }

        if (DOM.pmsStatus) {
            DOM.pmsStatus.textContent = formatPmsSnapshotText(payload?.snapshot_timestamp);
        }
    }

    async function loadTrend() {
        const { params, dgNames, error } = getTrendParams();
        if (error) { setStatus(error, true); return; }
        state.selectedDgNames = dgNames.slice();
        const queryString = params.toString();
        const requestId = ++state.activeRequestId;
        const cachedPayload = readCachedPayload(`${state.chartMode}::${queryString}`);
        if (cachedPayload) {
            applyChartData(cachedPayload);
            setStatus("Showing recent cached trend while refreshing...");
        } else {
            setStatus("Loading trend data...");
        }
        setLoading(true);
        try {
            const [response, runningHoursResponse] = await Promise.all([
                fetchWithTimeout(`${CONFIG.apiBase}?${queryString}`, CONFIG.requestTimeoutMs, { cache: "no-store" }),
                fetchWithTimeout(CONFIG.latestStatusApiBase, CONFIG.requestTimeoutMs, { cache: "no-store" }),
            ]);
            if (!response.ok) throw new Error(`Trend API error: ${response.status}`);
            const payload = await response.json();
            if (runningHoursResponse && !runningHoursResponse.ok) {
                throw new Error(`Running hour API error: ${runningHoursResponse.status}`);
            }
            const runningHoursPayload = runningHoursResponse ? await runningHoursResponse.json() : null;
            if (requestId !== state.activeRequestId) return;
            writeCachedPayload(`${state.chartMode}::${queryString}`, payload);
            const totalVisiblePoints = applyChartData(payload);
            applyRunningHoursChartData(runningHoursPayload);
            if (Number.isFinite(state.selectedPointMs)) {
                await loadPmsSnapshot(new Date(state.selectedPointMs).toISOString());
            } else {
                await loadPmsSnapshot("");
            }
            setStatus(totalVisiblePoints > 0 ? "Trend loaded successfully." : "No trend data in the selected time range.", totalVisiblePoints === 0);
        } catch (error) {
            console.error("Load trend fetch error:", error);
            if (cachedPayload) {
                setStatus("Network refresh failed. Showing recent cached trend.", false);
                return;
            }
            setStatus(error?.message || "Failed to load trend data.", true);
        } finally {
            if (requestId === state.activeRequestId) setLoading(false);
        }
    }

    function bindEvents() {
        DOM.apply.addEventListener("click", loadTrend);
        if (DOM.modeLoad) {
            DOM.modeLoad.addEventListener("click", () => {
                if (state.chartMode === "load") return;
                state.chartMode = "load";
                updateModeButtons();
                loadTrend();
            });
        }
        if (DOM.modePms) {
            DOM.modePms.addEventListener("click", () => {
                if (state.chartMode === "pms") return;
                state.chartMode = "pms";
                updateModeButtons();
                loadTrend();
            });
        }
        DOM.prev.addEventListener("click", () => shiftRange(-CONFIG.rangeMs));
        DOM.next.addEventListener("click", () => shiftRange(CONFIG.rangeMs));
        DOM.home.addEventListener("click", () => { window.location.href = "./index.html"; });
        DOM.dgCheckboxes.forEach((input) => {
            input.addEventListener("change", () => {
                loadTrend();
            });
        });
    }

    async function init() {
        if (initialDg) {
            document.querySelectorAll('input[name="dg-name"]').forEach((input) => {
                input.checked = input.value === initialDg;
            });
        }
        await syncDefaultRange();
        updateHeaderTime();
        setInterval(updateHeaderTime, 1000);
        updateModeButtons();
        buildChart();
        buildRunningHoursChart();
        buildPmsChart();
        bindPanZoom();
        bindEvents();
        await loadTrend();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
