(function (global) {
    "use strict";

    function getById(id) {
        return document.getElementById(id);
    }

    function normalizeDgName(value) {
        if (value == null) return null;
        const raw = String(value).trim().toUpperCase().replace(/\s+/g, "").replace(/_/g, "-");
        if (raw === "DG1" || raw === "DG#1" || raw === "DG-1") return "DG#1";
        if (raw === "DG2" || raw === "DG#2" || raw === "DG-2") return "DG#2";
        if (raw === "DG3" || raw === "DG#3" || raw === "DG-3") return "DG#3";
        if (raw === "ME-PORT") return "ME-PORT";
        if (raw === "ME-STBD") return "ME-STBD";
        return String(value).trim();
    }

    function filterByTarget(rows, targetName) {
        return Array.isArray(rows)
            ? rows.filter((item) => normalizeDgName(item.dg_name) === targetName)
            : [];
    }

    function setText(el, value) {
        if (el && el.textContent !== value) el.textContent = value;
    }

    function isOnValue(value) {
        if (typeof value === "number") return value === 1;
        const normalized = String(value ?? "").trim().toLowerCase();
        return normalized === "on" || normalized === "1" || normalized === "true";
    }

    function applyLayoutToElement(el, cfg) {
        if (!el || !cfg) return;
        if (cfg.anchor === "right") {
            if (cfg.x) el.style.right = `calc(100% - ${cfg.x})`;
            el.style.left = "";
        } else if (cfg.x) {
            el.style.left = cfg.x;
            el.style.right = "";
        }
        if (cfg.y) el.style.top = cfg.y;
        const scale = cfg.scale == null ? 1 : Number(cfg.scale);
        if (!Number.isNaN(scale)) {
            const baseTransform = cfg.translateYCenter ? "translateY(-50%)" : "";
            el.style.transform = `${baseTransform} scale(${scale})`.trim();
            el.style.transformOrigin = cfg.anchor === "right" ? "top right" : "top left";
        }
    }

    async function fetchWithTimeout(url, timeoutMs, options) {
        const controller = new AbortController();
        const resolvedTimeoutMs = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 0;
        const timeoutMessage = `Request timed out after ${resolvedTimeoutMs}ms`;
        const timeoutId = resolvedTimeoutMs > 0
            ? setTimeout(() => controller.abort(new Error(timeoutMessage)), resolvedTimeoutMs)
            : null;
        try {
            const response = await fetch(url, {
                ...(options || {}),
                signal: controller.signal,
            });
            return response;
        } catch (error) {
            if (error?.name === "AbortError" || controller.signal.aborted) {
                const reasonMessage =
                    typeof controller.signal.reason === "string"
                        ? controller.signal.reason
                        : controller.signal.reason?.message;
                throw new Error(reasonMessage || timeoutMessage);
            }
            throw error;
        } finally {
            if (timeoutId != null) clearTimeout(timeoutId);
        }
    }

    function resolveApiOrigin(port) {
        const override = global.APP_CONFIG?.apiBaseUrl || global.API_BASE_URL || null;
        if (override) return String(override).replace(/\/+$/, "");

        const protocol = global.location?.protocol === "https:" ? "https:" : "http:";
        const hostname = global.location?.hostname || "localhost";
        const resolvedPort = port == null ? "8888" : String(port);
        return `${protocol}//${hostname}:${resolvedPort}`;
    }

    function bindChartViewportControls(config) {
        const chartCanvas = config?.chartCanvas;
        if (!chartCanvas) return () => {};

        const getChart = typeof config.getChart === "function" ? config.getChart : () => null;
        const getRange = typeof config.getRange === "function" ? config.getRange : () => ({ fromMs: NaN, toMs: NaN });
        const onPointSelect = typeof config.onPointSelect === "function" ? config.onPointSelect : () => {};
        const onReset = typeof config.onReset === "function" ? config.onReset : () => {};
        const minZoomRangeMs = Number(config.minZoomRangeMs) || 5 * 60 * 1000;
        const mouseButton = Number.isInteger(config.mouseButton) ? config.mouseButton : 0;
        const intersect = config.intersect === true;
        const selectionMode = config.selectionMode || "nearest";
        const state = { isPanning: false, lastPanClientX: 0, didPan: false };

        function getScaleState() {
            const chart = getChart();
            const xScale = chart?.scales?.x;
            const range = getRange() || {};
            const min = Number(xScale?.min);
            const max = Number(xScale?.max);
            const originalMin = Number(range.fromMs);
            const originalMax = Number(range.toMs);
            if (!xScale || ![min, max, originalMin, originalMax].every(Number.isFinite) || max <= min || originalMax <= originalMin) {
                return null;
            }
            return { chart, xScale, min, max, originalMin, originalMax };
        }

        function panByPixels(deltaX) {
            const scaleState = getScaleState();
            if (!scaleState) return;
            const { chart, xScale, min, max, originalMin, originalMax } = scaleState;
            const shift = deltaX * ((max - min) / (xScale.width || 1));
            const windowSize = max - min;
            let nextMin = min - shift;
            let nextMax = max - shift;
            if (nextMin < originalMin) {
                nextMin = originalMin;
                nextMax = originalMin + windowSize;
            }
            if (nextMax > originalMax) {
                nextMax = originalMax;
                nextMin = originalMax - windowSize;
            }
            chart.options.scales.x.min = Math.max(nextMin, originalMin);
            chart.options.scales.x.max = Math.min(nextMax, originalMax);
            chart.update("none");
        }

        function applyZoomFactor(zoomFactor, anchorRatio) {
            const scaleState = getScaleState();
            if (!scaleState) return;
            const { chart, min, max, originalMin, originalMax } = scaleState;
            const fullRange = originalMax - originalMin;
            const currentRange = max - min;
            const pointerRatio = Math.min(1, Math.max(0, Number(anchorRatio) || 0.5));
            const anchorValue = min + currentRange * pointerRatio;
            let nextRange = currentRange * zoomFactor;
            nextRange = Math.max(minZoomRangeMs, Math.min(fullRange, nextRange));
            if (Math.abs(nextRange - currentRange) < 1) return;
            if (nextRange >= fullRange) {
                chart.options.scales.x.min = originalMin;
                chart.options.scales.x.max = originalMax;
                chart.update("none");
                return;
            }
            let nextMin = anchorValue - nextRange * pointerRatio;
            let nextMax = nextMin + nextRange;
            if (nextMin < originalMin) {
                nextMin = originalMin;
                nextMax = originalMin + nextRange;
            }
            if (nextMax > originalMax) {
                nextMax = originalMax;
                nextMin = originalMax - nextRange;
            }
            chart.options.scales.x.min = nextMin;
            chart.options.scales.x.max = nextMax;
            chart.update("none");
        }

        function resetViewport() {
            const scaleState = getScaleState();
            if (!scaleState) return;
            const { chart, originalMin, originalMax } = scaleState;
            onReset();
            chart.options.scales.x.min = originalMin;
            chart.options.scales.x.max = originalMax;
            chart.update("none");
        }

        function stopPan() {
            state.isPanning = false;
        }

        chartCanvas.addEventListener("mousedown", (event) => {
            if (event.button !== mouseButton) return;
            event.preventDefault();
            state.isPanning = true;
            state.didPan = false;
            state.lastPanClientX = event.clientX;
        });

        chartCanvas.addEventListener("mousemove", (event) => {
            if (!state.isPanning) return;
            event.preventDefault();
            if (Math.abs(event.clientX - state.lastPanClientX) > 0) state.didPan = true;
            panByPixels(event.clientX - state.lastPanClientX);
            state.lastPanClientX = event.clientX;
        });

        chartCanvas.addEventListener("mouseup", stopPan);
        chartCanvas.addEventListener("mouseleave", stopPan);
        chartCanvas.addEventListener("contextmenu", (event) => {
            if (state.isPanning) event.preventDefault();
        });

        chartCanvas.addEventListener("click", (event) => {
            if (state.didPan) {
                state.didPan = false;
                return;
            }
            const chart = getChart();
            if (!chart) return;
            const points = chart.getElementsAtEventForMode(event, selectionMode, { intersect }, false);
            if (!Array.isArray(points) || points.length === 0) return;
            const firstPoint = points[0];
            const dataset = chart.data.datasets?.[firstPoint.datasetIndex];
            const rawPoint = dataset?.data?.[firstPoint.index];
            if (!rawPoint || !Number.isFinite(rawPoint.x) || !Number.isFinite(rawPoint.y)) return;
            onPointSelect(rawPoint, { chart, event, points });
        });

        chartCanvas.addEventListener("dblclick", resetViewport);
        global.addEventListener("mouseup", stopPan);
        global.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            resetViewport();
        });

        config.zoomInButton?.addEventListener("click", () => applyZoomFactor(0.85, 0.5));
        config.zoomOutButton?.addEventListener("click", () => applyZoomFactor(1.18, 0.5));

        return resetViewport;
    }

    const GLOBAL_NAV_STATE_KEY = "drums:global-nav:collapsed";

    function resolveActiveNavHref() {
        const pathname = (global.location?.pathname || "").toLowerCase();
        const searchParams = new URLSearchParams(global.location?.search || "");
        const dg = normalizeDgName(searchParams.get("dg"));
        if (pathname.endsWith("/index.html") || pathname.endsWith("/._index.html") || pathname === "/") return "./index.html";
        if (pathname.endsWith("/dg_dashboard.html")) return `./dg_dashboard.html?dg=${dg === "DG#2" ? "2" : dg === "DG#3" ? "3" : "1"}`;
        if (pathname.endsWith("/me_dashboard.html")) return `./me_dashboard.html?dg=${dg === "ME-STBD" ? "ME-STBD" : "ME-PORT"}`;
        if (pathname.endsWith("/3dgs_graph.html")) return "./3DGs_graph.html";
        return "";
    }

    function createGlobalNav() {
        if (!global.document?.body || document.querySelector(".global-nav-shell")) return;

        const navItems = [
            { href: "./index.html", short: "HM", label: "Home" },
            { href: "./dg_dashboard.html?dg=1", short: "1", label: "DG#1" },
            { href: "./dg_dashboard.html?dg=2", short: "2", label: "DG#2" },
            { href: "./dg_dashboard.html?dg=3", short: "3", label: "DG#3" },
            { href: "./me_dashboard.html?dg=ME-PORT", short: "MP", label: "ME-PORT" },
            { href: "./me_dashboard.html?dg=ME-STBD", short: "MS", label: "ME-STBD" },
            { href: "./3DGs_graph.html", short: "LG", label: "Load Graph" },
        ];

        document.body.classList.add("has-global-nav");
        const isCollapsed = global.localStorage?.getItem(GLOBAL_NAV_STATE_KEY) === "1";
        if (isCollapsed) document.body.classList.add("global-nav-collapsed");

        const shell = document.createElement("aside");
        shell.className = `global-nav-shell${isCollapsed ? " is-collapsed" : ""}`;

        const activeHref = resolveActiveNavHref();
        shell.innerHTML = `
            <div class="global-nav-top">
                <a class="global-nav-brand" href="./index.html" aria-label="DRUMS Home">
                    <img src="./Asset/DRUMS_logo_small.png" alt="DRUMS logo">
                </a>
                <button class="global-nav-toggle" type="button" aria-label="Toggle navigation">☰</button>
            </div>
            <nav class="global-nav-list">
                ${navItems.map((item) => `
                    <a class="global-nav-link${item.href === activeHref ? " is-active" : ""}" href="${item.href}" title="${item.label}">
                        <span class="global-nav-link-label">${item.label}</span>
                        <span class="global-nav-link-short" aria-hidden="true">${item.short}</span>
                    </a>
                `).join("")}
            </nav>
        `;

        document.body.insertBefore(shell, document.body.firstChild);

        const toggle = shell.querySelector(".global-nav-toggle");
        if (toggle) {
            toggle.addEventListener("click", () => {
                const collapsed = shell.classList.toggle("is-collapsed");
                document.body.classList.toggle("global-nav-collapsed", collapsed);
                try {
                    global.localStorage?.setItem(GLOBAL_NAV_STATE_KEY, collapsed ? "1" : "0");
                } catch (_) {}
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createGlobalNav, { once: true });
    } else {
        createGlobalNav();
    }

    global.DashboardShared = {
        getById,
        normalizeDgName,
        filterByTarget,
        setText,
        isOnValue,
        applyLayoutToElement,
        fetchWithTimeout,
        resolveApiOrigin,
        bindChartViewportControls,
        createGlobalNav,
    };
})(window);
