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

                const x = bar.x;
                const y = (bar.y + bar.base) / 2;
                ctx.fillStyle = "#0f172a";
                ctx.fillText(String(value), x, y);
            });

            ctx.restore();
        },
    };

    const { fetchWithTimeout, resolveApiOrigin } = window.DashboardShared;

    const DOM = {
        from: document.getElementById("from-utc"),
        to: document.getElementById("to-utc"),
        status: document.getElementById("trend-status"),
        loading: document.getElementById("trend-loading"),
        clock: document.getElementById("current-datetime"),
        chartCanvas: document.getElementById("load-trend-chart"),
        runningHoursCanvas: document.getElementById("running-hours-chart"),
        apply: document.getElementById("apply-btn"),
        prev: document.getElementById("prev-24h-btn"),
        next: document.getElementById("next-24h-btn"),
        home: document.getElementById("go-home-logo"),
    };

    const CONFIG = {
        apiBase: `${resolveApiOrigin()}/api/engine_graph`,
        latestStatusApiBase: `${resolveApiOrigin()}/api/check_all_status_lable/all`,
        rangeMs: 24 * 60 * 60 * 1000,
        maxGapMs: 15 * 60 * 1000,
        minZoomRangeMs: 5 * 60 * 1000,
        requestTimeoutMs: 60000,
        requestMaxPoints: 720,
        cacheTtlMs: 60 * 1000,
        cachePrefix: "load-graph-trend::",
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
        range: { fromMs: NaN, toMs: NaN },
        isPanning: false,
        lastPanClientX: 0,
        activeRequestId: 0,
        timeZone: "__browser__",
        selectedPointMs: NaN,
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

    function setLoading(isLoading) {
        if (!DOM.loading) return;
        DOM.loading.classList.toggle("active", !!isLoading);
    }

    function clearSelectedTrendPoint() {
        state.selectedPointMs = NaN;
        if (state.chart) state.chart.update("none");
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

    function syncDefaultRange() {
        const now = new Date();
        DOM.from.value = formatDateForInput(new Date(now.getTime() - CONFIG.rangeMs), state.timeZone);
        DOM.to.value = formatDateForInput(now, state.timeZone);
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
            background: "rgba(255, 255, 255, 0.98)", border: "1px solid #94a3b8", borderRadius: "10px", color: "#0f172a",
            pointerEvents: "none", position: "absolute", transform: "translate(-50%, 0)", transition: "all .08s ease",
            padding: "8px 10px", fontWeight: "700", fontSize: "12px", boxShadow: "0 10px 20px rgba(15, 23, 42, 0.18)",
            whiteSpace: "nowrap", zIndex: "20", opacity: "0",
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
                        min: CONFIG.yRange.min,
                        max: CONFIG.yRange.max,
                        ticks: { color: "#475569", stepSize: CONFIG.yRange.step },
                        title: { display: true, text: "Load (KwE)", color: "#334155", font: { size: 14, style: "italic", weight: "700" } },
                        grid: { color: "rgba(100, 116, 139, 0.14)" },
                        border: { color: "rgba(100, 116, 139, 0.28)" },
                    },
                },
            },
        };
    }

    function buildChart() { state.chart = new Chart(DOM.chartCanvas.getContext("2d"), createChartConfig()); }
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
    function buildRunningHoursChart() {
        if (!DOM.runningHoursCanvas) return;
        state.runningHoursChart = new Chart(
            DOM.runningHoursCanvas.getContext("2d"),
            {
                ...createRunningHoursChartConfig(),
                plugins: [runningHoursValueLabelPlugin],
            }
        );
    }

    function panChartByPixels(deltaX) {
        const xScale = state.chart?.scales?.x;
        if (!xScale) return;
        const min = Number(xScale.min), max = Number(xScale.max), originalMin = Number(state.range.fromMs), originalMax = Number(state.range.toMs);
        if (![min, max, originalMin, originalMax].every(Number.isFinite) || max <= min || originalMax <= originalMin) return;
        const shift = deltaX * ((max - min) / (xScale.width || 1));
        const windowSize = max - min;
        let nextMin = min - shift, nextMax = max - shift;
        if (nextMin < originalMin) [nextMin, nextMax] = [originalMin, originalMin + windowSize];
        if (nextMax > originalMax) [nextMin, nextMax] = [originalMax - windowSize, originalMax];
        state.chart.options.scales.x.min = Math.max(nextMin, originalMin);
        state.chart.options.scales.x.max = Math.min(nextMax, originalMax);
        state.chart.update("none");
    }

    function zoomChartAtClientX(deltaY, clientX) {
        const xScale = state.chart?.scales?.x;
        if (!xScale) return;
        const min = Number(xScale.min), max = Number(xScale.max), originalMin = Number(state.range.fromMs), originalMax = Number(state.range.toMs);
        if (![min, max, originalMin, originalMax].every(Number.isFinite) || max <= min || originalMax <= originalMin) return;
        const fullRange = originalMax - originalMin, currentRange = max - min;
        const pointerRatio = Math.min(1, Math.max(0, (clientX - xScale.left) / (xScale.width || 1)));
        const anchorValue = min + currentRange * pointerRatio;
        const zoomFactor = deltaY < 0 ? 0.85 : 1.18;
        let nextRange = currentRange * zoomFactor;
        nextRange = Math.max(CONFIG.minZoomRangeMs, Math.min(fullRange, nextRange));
        if (Math.abs(nextRange - currentRange) < 1) return;
        if (nextRange >= fullRange) {
            state.chart.options.scales.x.min = originalMin;
            state.chart.options.scales.x.max = originalMax;
            state.chart.update("none");
            return;
        }
        let nextMin = anchorValue - nextRange * pointerRatio;
        let nextMax = nextMin + nextRange;
        if (nextMin < originalMin) { nextMin = originalMin; nextMax = originalMin + nextRange; }
        if (nextMax > originalMax) { nextMax = originalMax; nextMin = originalMax - nextRange; }
        state.chart.options.scales.x.min = nextMin;
        state.chart.options.scales.x.max = nextMax;
        state.chart.update("none");
    }

    function bindPanZoom() {
        DOM.chartCanvas.addEventListener("mousedown", (event) => {
            if (event.button !== 2) return;
            event.preventDefault();
            state.isPanning = true;
            state.lastPanClientX = event.clientX;
        });
        DOM.chartCanvas.addEventListener("mousemove", (event) => {
            if (!state.isPanning) return;
            event.preventDefault();
            panChartByPixels(event.clientX - state.lastPanClientX);
            state.lastPanClientX = event.clientX;
        });
        const stopPan = () => { state.isPanning = false; };
        DOM.chartCanvas.addEventListener("mouseup", stopPan);
        DOM.chartCanvas.addEventListener("mouseleave", stopPan);
        DOM.chartCanvas.addEventListener("contextmenu", (event) => { if (state.isPanning || event.button === 2) event.preventDefault(); });
        DOM.chartCanvas.addEventListener("wheel", (event) => { event.preventDefault(); zoomChartAtClientX(event.deltaY, event.clientX); }, { passive: false });
        DOM.chartCanvas.addEventListener("click", (event) => {
            if (!state.chart) return;
            const points = state.chart.getElementsAtEventForMode(
                event,
                "nearest",
                { intersect: true },
                false
            );
            if (!Array.isArray(points) || points.length === 0) return;
            const firstPoint = points[0];
            const dataset = state.chart.data.datasets?.[firstPoint.datasetIndex];
            const rawPoint = dataset?.data?.[firstPoint.index];
            if (!rawPoint || !Number.isFinite(rawPoint.x) || !Number.isFinite(rawPoint.y)) return;
            state.selectedPointMs = Number(rawPoint.x);
            state.chart.update("none");
        });
        DOM.chartCanvas.addEventListener("dblclick", () => {
            if (!Number.isFinite(state.range.fromMs) || !Number.isFinite(state.range.toMs)) return;
            clearSelectedTrendPoint();
            state.chart.options.scales.x.min = state.range.fromMs;
            state.chart.options.scales.x.max = state.range.toMs;
            state.chart.update("none");
        });
        window.addEventListener("mouseup", stopPan);
    }

    function isSelectedPoint(pointX) {
        return Number.isFinite(state.selectedPointMs) && Math.abs(Number(pointX) - state.selectedPointMs) < 1000;
    }

    function applyChartData(payload) {
        state.range = { fromMs: parseApiTimestamp(payload?.from), toMs: parseApiTimestamp(payload?.to) };
        let totalVisiblePoints = 0;
        const bucketGapMs = Number(payload?.bucket_seconds) > 0 ? Number(payload.bucket_seconds) * 2000 : 0;
        const gapThresholdMs = Math.max(CONFIG.maxGapMs, bucketGapMs);
        state.chart.options.scales.x.title.text = `Time (${getSelectedTimeZoneLabel()})`;
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
                label: item.dg_name, unit: item.unit || "KwE", data, parsing: false, normalized: true,
                borderColor: Number.isFinite(state.selectedPointMs) ? "rgba(148, 163, 184, 0.8)" : style.borderColor,
                backgroundColor: Number.isFinite(state.selectedPointMs) ? "rgba(148, 163, 184, 0.18)" : style.backgroundColor,
                pointBackgroundColor(context) {
                    const pointX = Number(context?.raw?.x);
                    return isSelectedPoint(pointX) || !Number.isFinite(state.selectedPointMs)
                        ? style.borderColor
                        : "rgba(148, 163, 184, 0.75)";
                },
                pointBorderColor(context) {
                    const pointX = Number(context?.raw?.x);
                    return isSelectedPoint(pointX) || !Number.isFinite(state.selectedPointMs)
                        ? style.borderColor
                        : "rgba(100, 116, 139, 0.9)";
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
                pointHoverRadius: 4, pointHitRadius: 10, borderWidth: 2.5,
                segment: {
                    borderColor(context) {
                        if (!Number.isFinite(state.selectedPointMs)) return style.borderColor;
                        const startX = Number(context?.p0?.parsed?.x);
                        const endX = Number(context?.p1?.parsed?.x);
                        return isSelectedPoint(startX) || isSelectedPoint(endX)
                            ? style.borderColor
                            : "rgba(148, 163, 184, 0.8)";
                    },
                },
                tension: 0.15, fill: false, clip: false, showLine: true, spanGaps: false,
            }];
        });
        state.chart.update("none");
        return totalVisiblePoints;
    }

    function getTrendParams() {
        const from = parseInputValueForTimeZone(DOM.from.value, state.timeZone);
        const to = parseInputValueForTimeZone(DOM.to.value, state.timeZone);
        const dgNames = getSelectedDgNames();
        if (!from || !to) return { error: "Please choose both From and To time." };
        if (from >= to) return { error: "'From' must be earlier than 'To'." };
        if (dgNames.length === 0) return { error: "Please select at least one DG." };
        const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), graph_type: "load" });
        dgNames.forEach((dgName) => params.append("dg_names", dgName));
        params.set("max_points", String(CONFIG.requestMaxPoints));
        return { params };
    }

    function applyRunningHoursChartData(payload, selectedDgNames) {
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

    async function loadTrend() {
        const { params, error } = getTrendParams();
        if (error) { setStatus(error, true); return; }
        const queryString = params.toString();
        const requestId = ++state.activeRequestId;
        const cachedPayload = readCachedPayload(queryString);
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
            writeCachedPayload(queryString, payload);
            const totalVisiblePoints = applyChartData(payload);
            applyRunningHoursChartData(runningHoursPayload);
            setStatus(totalVisiblePoints > 0 ? "Trend loaded successfully." : "No trend data in the selected time range.", totalVisiblePoints === 0);
        } catch (error) {
            console.error("Load trend fetch error:", error);
            if (cachedPayload) { setStatus("Network refresh failed. Showing recent cached trend.", false); return; }
            setStatus(error?.message || "Failed to load trend data.", true);
        } finally {
            if (requestId === state.activeRequestId) setLoading(false);
        }
    }

    function bindEvents() {
        DOM.apply.addEventListener("click", loadTrend);
        DOM.prev.addEventListener("click", () => shiftRange(-CONFIG.rangeMs));
        DOM.next.addEventListener("click", () => shiftRange(CONFIG.rangeMs));
        DOM.home.addEventListener("click", () => { window.location.href = "./index.html"; });
    }

    function init() {
        if (initialDg) {
            document.querySelectorAll('input[name="dg-name"]').forEach((input) => {
                input.checked = input.value === initialDg;
            });
        }
        syncDefaultRange();
        updateHeaderTime();
        setInterval(updateHeaderTime, 1000);
        buildChart();
        buildRunningHoursChart();
        bindPanZoom();
        bindEvents();
        loadTrend();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
