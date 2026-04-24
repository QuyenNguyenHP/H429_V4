const API_BASE = (() => {
    return window.DashboardShared.resolveApiOrigin();
})();
const INDEX_STATUS_API = "/api/check_all_status_lable/index";
const INDEX_STATUS_FALLBACK_API = "/api/check_all_status_lable/all";
const INDEX_CACHE_KEY = "drums:index:last_status_v1";
const INDEX_DG_CONFIG = [
    {
        cardNo: 5,
        dgName: "ME-PORT",
        groupId: "me-section",
        href: "./me_dashboard.html?dg=ME-PORT",
        image: "./Asset/ME.png",
        imageAlt: "Main Engine PORT",
        imageStyle: "--image-scale: 1; --image-shift-y: 35px;",
        isLarge: true,
        readyLabel: "READY",
        hasPms: false
    },
    {
        cardNo: 4,
        dgName: "ME-STBD",
        groupId: "me-section",
        href: "./me_dashboard.html?dg=ME-STBD",
        image: "./Asset/ME.png",
        imageAlt: "Main Engine STBD",
        imageStyle: "--image-scale: 1.1; --image-shift-y: 35px;",
        isLarge: true,
        readyLabel: "READY",
        hasPms: false
    },
    {
        cardNo: 1,
        dgName: "DG#1",
        groupId: "dg-section",
        href: "./dg_dashboard.html?dg=1",
        image: "./Asset/engine_mainpage_kiosk.png",
        imageAlt: "Diesel Generator 1",
        readyLabel: "READY TO START",
        hasPms: true,
        showLinkFail: true
    },
    {
        cardNo: 2,
        dgName: "DG#2",
        groupId: "dg-section",
        href: "./dg_dashboard.html?dg=2",
        image: "./Asset/engine_mainpage_kiosk.png",
        imageAlt: "Diesel Generator 2",
        readyLabel: "READY TO START",
        hasPms: true,
        showLinkFail: true
    },
    {
        cardNo: 3,
        dgName: "DG#3",
        groupId: "dg-section",
        href: "./dg_dashboard.html?dg=3",
        image: "./Asset/engine_mainpage_kiosk.png",
        imageAlt: "Diesel Generator 3",
        readyLabel: "READY TO START",
        hasPms: true,
        showLinkFail: true
    }
];
const INDEX_IDLE_CRITICAL_IGNORE_LABELS = new Set(["STARTING AIR PRESSURE"]);

function createStatusItem(cardNo, key, label) {
    const item = document.createElement("div");
    item.className = "dg-status-item";
    item.innerHTML = `
        <div id="dg${cardNo}-${key}-light" class="status-light light-${key}"></div>
        <span class="dg-status-label font-extrabold">${label}</span>
    `;
    return item;
}

function createMachineCard(cfg) {
    const card = document.createElement("div");
    card.className = `dg-card${cfg.isLarge ? " dg-card-large" : ""}`;
    card.dataset.dgCard = String(cfg.cardNo);
    card.addEventListener("click", () => { window.location.href = cfg.href; });

    const title = document.createElement("span");
    title.className = "dg-title";
    title.textContent = cfg.dgName;

    const main = document.createElement("div");
    main.className = "dg-card-main";

    const imageBox = document.createElement("div");
    imageBox.className = "dg-engine-box dg-engine-visual flex items-center justify-center border border-gray-100";
    const image = document.createElement("img");
    image.src = cfg.image;
    image.alt = cfg.imageAlt;
    image.className = "dg-engine-image";
    image.decoding = "async";
    if (cfg.imageStyle) image.setAttribute("style", cfg.imageStyle);
    imageBox.appendChild(image);

    const statusColumn = document.createElement("div");
    statusColumn.className = "dg-status-column";
    statusColumn.appendChild(createStatusItem(cfg.cardNo, "ready", cfg.readyLabel));
    statusColumn.appendChild(createStatusItem(cfg.cardNo, "run", "RUNNING"));
    statusColumn.appendChild(createStatusItem(cfg.cardNo, "alarm", "ALARM"));

    main.appendChild(imageBox);
    main.appendChild(statusColumn);

    const fail = document.createElement("div");
    fail.className = "serial-fail";
    fail.dataset.hideWhenOk = "1";
    if (cfg.showLinkFail) {
        fail.id = `dg${cfg.cardNo}-link-fail`;
        fail.textContent = "FAIL CONNECTION !";
    }

    card.appendChild(title);
    card.appendChild(main);
    card.appendChild(fail);
    return card;
}

function renderMachineCards() {
    document.querySelectorAll("#me-section, #dg-section").forEach((section) => {
        section.textContent = "";
    });
    INDEX_DG_CONFIG.forEach((cfg) => {
        document.getElementById(cfg.groupId)?.appendChild(createMachineCard(cfg));
    });
}

function updateClock() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });
    const clockEl = document.getElementById('clock');
    if (clockEl) clockEl.innerHTML = `${dateStr} &nbsp;&nbsp; ${timeStr}`;
}

// Hiệu ứng nhấp nháy cho cảnh báo "Serial link failure"
function blinkAlerts() {
    const alerts = document.querySelectorAll('.serial-fail');
    alerts.forEach(el => {
        if (el.dataset.hideWhenOk === "1" && el.textContent.trim() === "") {
            el.style.visibility = 'hidden';
            return;
        }
        el.style.visibility = (el.style.visibility === 'hidden' ? 'visible' : 'hidden');
    });
}

function setDGState(dgNo, isRunning, isReady, hasAlarm, hasData) {
    const readyLight = document.getElementById(`dg${dgNo}-ready-light`);
    const runLight = document.getElementById(`dg${dgNo}-run-light`);
    const alarmLight = document.getElementById(`dg${dgNo}-alarm-light`);
    const linkFail = document.getElementById(`dg${dgNo}-link-fail`);

    if (readyLight) {
        readyLight.classList.toggle("active", !!isReady);
    }
    if (runLight) runLight.classList.toggle("active", !!isRunning);
    if (alarmLight) alarmLight.classList.toggle("active", !!hasAlarm);
    if (linkFail) {
        linkFail.dataset.hideWhenOk = "1";
        linkFail.textContent = hasData ? "" : "FAIL CONNECTION !";
        linkFail.style.visibility = hasData ? "hidden" : "visible";
    }
}

function formatPmsValue(point, opts = {}) {
    if (!point || point.value == null) return "--";
    const value = Number(point.value);
    if (Number.isNaN(value)) return "--";
    if (opts.treatAsEmptyValue != null && value === opts.treatAsEmptyValue) return "--";
    const fixed = typeof opts.decimals === "number" ? value.toFixed(opts.decimals) : `${value}`;
    const unit = (point.unit || "").trim();
    return unit ? `${fixed} ${unit}` : `${fixed}`;
}

function hasUsablePmsData(pms) {
    if (!pms || typeof pms !== "object") return false;
    return Object.values(pms).some((point) => point && point.value != null);
}

function mergeIndexMachineData(primaryMachine, fallbackMachine) {
    const primary = primaryMachine && typeof primaryMachine === "object" ? primaryMachine : {};
    const fallback = fallbackMachine && typeof fallbackMachine === "object" ? fallbackMachine : {};
    const fallbackPms = fallback?.pms && typeof fallback.pms === "object" ? fallback.pms : {};
    const primaryPms = primary?.pms && typeof primary.pms === "object" ? primary.pms : {};
    return {
        ...fallback,
        ...primary,
        pms: hasUsablePmsData(primaryPms) ? primaryPms : fallbackPms
    };
}

async function loadIndexStatus() {
    try {
        const res = await fetch(`${API_BASE}${INDEX_STATUS_API}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Index status API error: ${res.status}`);
        const payload = await res.json();
        let rows = Array.isArray(payload) ? payload : [];

        const needsFallbackPms = rows.some((machine) => {
            const dgName = String(machine?.dg_name || "").trim().toUpperCase();
            const cfg = INDEX_DG_CONFIG.find((item) => item.dgName.toUpperCase() === dgName);
            return cfg?.hasPms && !hasUsablePmsData(machine?.pms);
        });

        if (needsFallbackPms) {
            const fallbackRes = await fetch(`${API_BASE}${INDEX_STATUS_FALLBACK_API}`, { cache: "no-store" });
            if (!fallbackRes.ok) throw new Error(`Fallback status API error: ${fallbackRes.status}`);
            const fallbackPayload = await fallbackRes.json();
            const fallbackRows = Array.isArray(fallbackPayload) ? fallbackPayload : [];
            const fallbackByDg = new Map(
                fallbackRows.map((item) => [String(item?.dg_name || "").trim().toUpperCase(), item])
            );
            rows = rows.map((machine) => {
                const dgKey = String(machine?.dg_name || "").trim().toUpperCase();
                return mergeIndexMachineData(machine, fallbackByDg.get(dgKey));
            });
        }

        try {
            sessionStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(rows));
        } catch (_) {}

        applyIndexRows(rows);
    } catch (error) {
        console.error("Index API fetch error:", error);
        INDEX_DG_CONFIG.forEach((cfg) => {
            setDGState(cfg.cardNo, false, false, false, false);
            if (!cfg.hasPms) return;
            const dgNo = cfg.cardNo;
            const pfEl = document.getElementById(`pms-card-dg${dgNo}-pf`);
            const freqEl = document.getElementById(`pms-card-dg${dgNo}-freq`);
            const curEl = document.getElementById(`pms-card-dg${dgNo}-cur`);
            const volEl = document.getElementById(`pms-card-dg${dgNo}-vol`);
            const pwrEl = document.getElementById(`pms-card-dg${dgNo}-pwr`);

            if (pfEl) pfEl.textContent = "--";
            if (freqEl) freqEl.textContent = "--";
            if (curEl) curEl.textContent = "--";
            if (volEl) volEl.textContent = "--";
            if (pwrEl) pwrEl.textContent = "--";
        });
    }
}

function applyIndexRows(rows) {
        INDEX_DG_CONFIG.forEach((cfg) => {
            const machine = rows.find((item) => String(item?.dg_name || "").trim().toUpperCase() === cfg.dgName.toUpperCase());
            const digital = Array.isArray(machine?.digital) ? machine.digital : [];
            const analog = Array.isArray(machine?.analog) ? machine.analog : [];

            const hasActiveDigitalLabel = (label) => digital.some((item) => {
                if (String(item?.label || "").trim().toUpperCase() !== label) return false;
                const value = item?.value;
                if (typeof value === "number") return value === 1;
                const normalized = String(value ?? "").trim().toLowerCase();
                return normalized === "1" || normalized === "on" || normalized === "true" || normalized === "yes";
            });
            const meRevValues = analog
                .filter((item) => String(item?.label || "").trim().toUpperCase() === "M/E REVOLUTION")
                .map((item) => Number(item?.value))
                .filter((value) => !Number.isNaN(value));
            const meRevValue = meRevValues.length > 0 ? Math.max(...meRevValues) : NaN;
            const isRunning = cfg.dgName.startsWith("ME-")
                ? (!Number.isNaN(meRevValue) && meRevValue > 0)
                : hasActiveDigitalLabel("ENGINE RUN");
            const isReady = hasActiveDigitalLabel("READY TO START");
            const hasAlarmDigital = digital.some((item) => String(item?.status || "").trim().toUpperCase() === "ALARM");
            const hasAlarmAnalog = analog.some((item) => {
                const status = String(item?.status || "").trim().toUpperCase();
                if (status !== "CRITICAL") return false;
                const label = String(item?.label || "").trim().toUpperCase();
                if (!isRunning && !isReady && INDEX_IDLE_CRITICAL_IGNORE_LABELS.has(label)) return false;
                return true;
            });
            const hasData = digital.length > 0 || analog.length > 0;

            setDGState(cfg.cardNo, isRunning, isReady, hasAlarmDigital || hasAlarmAnalog, hasData);

            if (!cfg.hasPms) return;
            const pms = machine?.pms || {};
            const dgNo = cfg.cardNo;
            const pfEl = document.getElementById(`pms-card-dg${dgNo}-pf`);
            const freqEl = document.getElementById(`pms-card-dg${dgNo}-freq`);
            const curEl = document.getElementById(`pms-card-dg${dgNo}-cur`);
            const volEl = document.getElementById(`pms-card-dg${dgNo}-vol`);
            const pwrEl = document.getElementById(`pms-card-dg${dgNo}-pwr`);

            if (pfEl) pfEl.textContent = formatPmsValue(pms.power_factor, { treatAsEmptyValue: 32.768, decimals: 2 });
            if (freqEl) freqEl.textContent = formatPmsValue(pms.frequency);
            if (curEl) curEl.textContent = formatPmsValue(pms.current, { decimals: 2 });
            if (volEl) volEl.textContent = formatPmsValue(pms.voltage);
            if (pwrEl) pwrEl.textContent = formatPmsValue(pms.power_kw);
        });
}

function restoreIndexFromCache() {
    try {
        const rawRows = sessionStorage.getItem(INDEX_CACHE_KEY);
        if (!rawRows) return;
        const rows = JSON.parse(rawRows);
        if (!Array.isArray(rows)) return;
        applyIndexRows(rows);
    } catch (_) {}
}

// Page startup.
window.onload = () => {
    renderMachineCards();
    restoreIndexFromCache();
    loadIndexStatus();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(loadIndexStatus, 5000);
    setInterval(blinkAlerts, 750);
};

window.addEventListener("pageshow", () => {
    if (!document.querySelector("[data-dg-card]")) renderMachineCards();
    restoreIndexFromCache();
    loadIndexStatus();
});

