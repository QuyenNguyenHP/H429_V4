(function (global) {
    "use strict";

    const THEME_STORAGE_KEY = "drums:theme";

    function resolveInitialTheme() {
        try {
            const savedTheme = global.localStorage?.getItem(THEME_STORAGE_KEY);
            if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
        } catch (_) {}

        return global.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    function updateThemeToggleLabels(theme) {
        document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
            const isDark = theme === "dark";
            button.setAttribute("aria-pressed", isDark ? "true" : "false");
            button.setAttribute("title", isDark ? "Switch to light theme" : "Switch to dark theme");
            button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
            const icon = button.querySelector("[data-theme-toggle-icon]");
            const text = button.querySelector("[data-theme-toggle-text]");
            if (icon) icon.textContent = isDark ? "\u2600" : "\u263E";
            if (text) text.textContent = isDark ? "Light" : "Dark";
        });
    }

    function applyTheme(theme) {
        const nextTheme = theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", nextTheme);
        document.body?.setAttribute("data-theme", nextTheme);
        try {
            global.localStorage?.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch (_) {}
        updateThemeToggleLabels(nextTheme);
        global.dispatchEvent?.(new CustomEvent("drums:themechange", { detail: { theme: nextTheme } }));
        return nextTheme;
    }

    function getTheme() {
        return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }

    function toggleTheme() {
        return applyTheme(getTheme() === "dark" ? "light" : "dark");
    }

    applyTheme(resolveInitialTheme());

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

        const location = global.location;
        const hostname = String(location?.hostname || "").toLowerCase();
        const protocol = String(location?.protocol || "").toLowerCase();
        const currentPort = String(location?.port || "");
        const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
        const backendOrigin = "http://127.0.0.1:8888";
        if (protocol === "file:") return backendOrigin;
        if (isLocalHost && currentPort !== "8888") return backendOrigin;

        return "";
    }

    function getEngineImageContentRect(options) {
        const container = document.querySelector(options?.containerSelector || ".engine-container");
        const image = getById(options?.imageId || "engine-background-image");
        if (!container) return { left: 0, top: 0, width: 0, height: 0 };

        const containerRect = container.getBoundingClientRect();
        const imageRect = image?.getBoundingClientRect();
        if (!imageRect?.width || !imageRect?.height) {
            return { left: 0, top: 0, width: containerRect.width, height: containerRect.height };
        }

        const naturalWidth = Number(image?.naturalWidth) || imageRect.width;
        const naturalHeight = Number(image?.naturalHeight) || imageRect.height;
        const imageRatio = naturalWidth / naturalHeight;
        const boxRatio = imageRect.width / imageRect.height;
        let width = imageRect.width;
        let height = imageRect.height;

        if (boxRatio > imageRatio) {
            height = imageRect.height;
            width = height * imageRatio;
        } else {
            width = imageRect.width;
            height = width / imageRatio;
        }

        return {
            left: imageRect.left - containerRect.left + ((imageRect.width - width) / 2),
            top: imageRect.top - containerRect.top + ((imageRect.height - height) / 2),
            width,
            height,
        };
    }

    function resolveOverlayCoord(value, imageRect, axis) {
        if (value == null) return value;
        const raw = String(value).trim();
        const offset = axis === "x" ? imageRect.left : imageRect.top;
        const length = axis === "x" ? imageRect.width : imageRect.height;
        if (raw.endsWith("%")) return `${offset + (length * parseFloat(raw) / 100)}px`;
        const numericValue = parseFloat(raw);
        return Number.isFinite(numericValue) ? `${offset + numericValue}px` : value;
    }

    function withImageOverlayPosition(cfg, imageRect) {
        return {
            ...cfg,
            x: cfg?.x ? resolveOverlayCoord(cfg.x, imageRect, "x") : cfg?.x,
            y: cfg?.y ? resolveOverlayCoord(cfg.y, imageRect, "y") : cfg?.y,
        };
    }

    function normalizeCylinderLayout(cylinders, fallbackCount) {
        if (Array.isArray(cylinders) && cylinders.length) {
            return cylinders.map((cfg, index) => ({ number: index + 1, cfg: cfg || {} }));
        }
        if (cylinders && typeof cylinders === "object") {
            return Object.keys(cylinders)
                .sort((a, b) => Number(a) - Number(b))
                .map((key) => ({ number: key, cfg: cylinders[key] || {} }));
        }
        return Array.from({ length: fallbackCount || 6 }, (_, index) => ({
            number: index + 1,
            cfg: { x: `${40.5 + (index * 7.5)}%`, y: "20%", scale: 1 },
        }));
    }

    function createOverlayLayoutController(config) {
        const layout = config?.layout || {};
        const containerSelector = config?.containerSelector || ".engine-container";
        const imageId = config?.imageId || "engine-background-image";
        const cylinderContainerId = config?.cylinderContainerId || "cylinders-container";
        const cylinderTemplateId = config?.cylinderTemplateId || "cyl-temp-template";
        let resizeObserver = null;
        let refreshFrame = 0;
        let stabilizedTimers = [];

        function getImageRect() {
            return getEngineImageContentRect({ containerSelector, imageId });
        }

        function getOverlayScale() {
            const baseWidth = Number(layout.baseWidth) || 1456;
            const imageRect = getImageRect();
            const visibleWidth =
                imageRect.width ||
                document.querySelector(containerSelector)?.getBoundingClientRect().width ||
                baseWidth;
            const rawScale = visibleWidth / baseWidth;
            return Math.min(2.4, Math.max(0.58, rawScale));
        }

        function apply() {
            config?.applySceneLayout?.();
            const overlayScale = getOverlayScale();
            const imageRect = getImageRect();
            const container = document.querySelector(containerSelector);
            if (container) container.style.setProperty("--overlay-scale", overlayScale.toFixed(3));

            (config?.panelBindings || []).forEach((binding) => {
                const panelCfg = layout.panels?.[binding.panelKey];
                if (!panelCfg) return;
                const scale = Number(panelCfg.scale ?? 1);
                applyLayoutToElement(getById(binding.elementId), {
                    ...withImageOverlayPosition(panelCfg, imageRect),
                    translateYCenter: binding.translateYCenter !== false,
                    scale: (Number.isNaN(scale) ? 1 : scale) * overlayScale,
                });
            });

            document.querySelectorAll(config?.tagSelector || ".data-tag").forEach((tag) => {
                const key = tag.getAttribute("data-tag-key");
                const cfg = layout.tags?.[key];
                if (!cfg) return;
                if (cfg.x) tag.style.setProperty("--x", resolveOverlayCoord(cfg.x, imageRect, "x"));
                if (cfg.y) tag.style.setProperty("--y", resolveOverlayCoord(cfg.y, imageRect, "y"));
                const scale = cfg.scale == null ? 1 : Number(cfg.scale);
                const scaledValue = (Number.isNaN(scale) ? 1 : scale) * overlayScale;
                tag.style.transform = `scale(${scaledValue})`;
                tag.style.transformOrigin = "top left";
                const label = tag.querySelector(".label-box");
                const value = tag.querySelector(".digital-value");
                if (label && cfg.labelWidth) label.style.minWidth = `${Math.round(parseFloat(cfg.labelWidth) * overlayScale)}px`;
                if (value && cfg.valueWidth) value.style.minWidth = `${Math.round(parseFloat(cfg.valueWidth) * overlayScale)}px`;
            });
        }

        function initCylinders() {
            const container = getById(cylinderContainerId);
            const template = getById(cylinderTemplateId);
            if (!container || !template) return;
            container.innerHTML = "";
            const imageRect = getImageRect();
            const overlayScale = getOverlayScale();

            normalizeCylinderLayout(layout.cylinders, config?.fallbackCylinderCount || 6).forEach(({ number, cfg }) => {
                const clone = template.content.cloneNode(true);
                const numberEl = clone.querySelector(".cyl-num");
                const valueEl = clone.querySelector(".cyl-val");
                const item = clone.querySelector(".cyl-item");
                if (numberEl) numberEl.textContent = number;
                if (valueEl) valueEl.id = `val-cyl-${number}`;
                if (item) {
                    const scale = cfg.scale == null ? 1 : Number(cfg.scale);
                    item.style.setProperty("--x", resolveOverlayCoord(cfg.x || "50%", imageRect, "x"));
                    item.style.setProperty("--y", resolveOverlayCoord(cfg.y || "20%", imageRect, "y"));
                    item.style.transform = `translate(-50%, -50%) scale(${(Number.isNaN(scale) ? 1 : scale) * overlayScale})`;
                }
                container.appendChild(clone);
            });
        }

        function refresh() {
            apply();
            initCylinders();
            config?.afterRefresh?.();
        }

        function scheduleRefresh() {
            if (refreshFrame) return;
            refreshFrame = global.requestAnimationFrame(() => {
                refreshFrame = 0;
                refresh();
            });
        }

        function scheduleStabilizedRefresh(delays) {
            stabilizedTimers.forEach((timerId) => global.clearTimeout(timerId));
            stabilizedTimers = (delays || [350, 1200]).map((delay) => global.setTimeout(scheduleRefresh, delay));
        }

        function bindResizeObserver() {
            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }
            if (typeof ResizeObserver !== "function") return;
            const targets = [
                document.querySelector(containerSelector),
                getById(imageId),
            ].filter(Boolean);
            if (targets.length === 0) return;
            resizeObserver = new ResizeObserver(scheduleRefresh);
            targets.forEach((target) => resizeObserver.observe(target));
        }

        return {
            apply,
            initCylinders,
            refresh,
            scheduleRefresh,
            scheduleStabilizedRefresh,
            bindResizeObserver,
            getImageRect,
            getOverlayScale,
        };
    }

    function stripTrailingTimeZone(value) {
        return String(value || "").trim().replace(/\s+[A-Za-z_\/+-]+$/, "");
    }

    function updateTimestampHeader(elementId, timestampValue, fallbackValue) {
        const el = getById(elementId || "current-datetime");
        if (!el) return;
        el.textContent = stripTrailingTimeZone(timestampValue) || fallbackValue || "--:--:--";
    }

    function pad2(value) {
        return String(value).padStart(2, "0");
    }

    function getLocalDateTimeParts(date) {
        return {
            year: String(date.getFullYear()),
            month: pad2(date.getMonth() + 1),
            day: pad2(date.getDate()),
            hour: pad2(date.getHours()),
            minute: pad2(date.getMinutes()),
            second: pad2(date.getSeconds()),
        };
    }

    function parseApiTimestamp(value) {
        const raw = String(value || "").trim();
        if (!raw) return NaN;
        const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
        return Date.parse(/[zZ]$|[+\-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
    }

    function formatTimestampDisplay(timestampPayload, fallbackValue) {
        const datePart = String(timestampPayload?.date || "").trim();
        const timePart = String(timestampPayload?.time || "").trim();
        const combined = datePart && timePart
            ? `${datePart} ${timePart}`
            : String(timestampPayload?.timestamp || fallbackValue || "").trim();
        const parsedMs = parseApiTimestamp(combined);
        if (Number.isFinite(parsedMs)) {
            const parts = getLocalDateTimeParts(new Date(parsedMs));
            return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
        }
        return stripTrailingTimeZone(combined);
    }

    function extractMachineTimestamp(machineData, payload) {
        const directValue =
            machineData?.TimeStamp ??
            machineData?.timestamp ??
            machineData?.timeStamp ??
            machineData?.time_stamp ??
            payload?.TimeStamp ??
            payload?.timestamp ??
            payload?.timeStamp ??
            payload?.time_stamp;
        if (directValue != null && String(directValue).trim() !== "") return directValue;

        const analogRows = Array.isArray(machineData?.analog) ? machineData.analog : [];
        const tsRow = analogRows.find((item) => {
            const label = String(item?.label || "").trim().toUpperCase();
            return label === "TIMESTAMP" || label === "TIME STAMP" || label === "DATE & TIME";
        });
        if (tsRow?.value != null && String(tsRow.value).trim() !== "") return tsRow.value;

        const digitalRows = Array.isArray(machineData?.digital) ? machineData.digital : [];
        const point = analogRows.find((item) => item?.timestamp) || digitalRows.find((item) => item?.timestamp);
        if (point?.timestamp != null && String(point.timestamp).trim() !== "") return point.timestamp;
        return "";
    }

    function bindHomeNavigation(elementId, href) {
        const target = href || "./index.html";
        const logo = getById(elementId || "drums-logo-link");
        if (logo) logo.addEventListener("click", () => { global.location.href = target; });
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
    const GLOBAL_NAV_AUTO_COLLAPSE_MS = 5000;

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
            <button class="global-theme-toggle" type="button" data-theme-toggle>
                <span class="global-theme-toggle-icon" data-theme-toggle-icon aria-hidden="true"></span>
                <span class="global-theme-toggle-text" data-theme-toggle-text></span>
            </button>
        `;

        document.body.insertBefore(shell, document.body.firstChild);

        const toggle = shell.querySelector(".global-nav-toggle");
        const themeToggle = shell.querySelector("[data-theme-toggle]");
        let autoCollapseTimer = 0;

        function persistCollapsedState(collapsed) {
            document.body.classList.toggle("global-nav-collapsed", collapsed);
            try {
                global.localStorage?.setItem(GLOBAL_NAV_STATE_KEY, collapsed ? "1" : "0");
            } catch (_) {}
        }

        function clearAutoCollapseTimer() {
            if (!autoCollapseTimer) return;
            global.clearTimeout(autoCollapseTimer);
            autoCollapseTimer = 0;
        }

        function collapseNav() {
            shell.classList.add("is-collapsed");
            persistCollapsedState(true);
            clearAutoCollapseTimer();
        }

        function scheduleAutoCollapse() {
            clearAutoCollapseTimer();
            if (shell.classList.contains("is-collapsed")) return;
            autoCollapseTimer = global.setTimeout(() => {
                collapseNav();
            }, GLOBAL_NAV_AUTO_COLLAPSE_MS);
        }

        if (toggle) {
            toggle.addEventListener("click", () => {
                const collapsed = shell.classList.toggle("is-collapsed");
                persistCollapsedState(collapsed);
                if (collapsed) clearAutoCollapseTimer();
                else scheduleAutoCollapse();
            });
        }
        if (themeToggle) themeToggle.addEventListener("click", toggleTheme);
        updateThemeToggleLabels(getTheme());
        scheduleAutoCollapse();
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
        getEngineImageContentRect,
        resolveOverlayCoord,
        createOverlayLayoutController,
        updateTimestampHeader,
        parseApiTimestamp,
        formatTimestampDisplay,
        extractMachineTimestamp,
        bindHomeNavigation,
        bindChartViewportControls,
        createGlobalNav,
        applyTheme,
        getTheme,
        toggleTheme,
    };
})(window);
