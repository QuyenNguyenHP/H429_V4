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

    global.DashboardShared = {
        getById,
        normalizeDgName,
        filterByTarget,
        setText,
        isOnValue,
        applyLayoutToElement,
        fetchWithTimeout,
        resolveApiOrigin,
    };
})(window);
