const typeSelect = document.getElementById("intervalType");
const addIntervalBtn = document.getElementById("addIntervalBtn");
const clearIntervalsBtn = document.getElementById("clearIntervalsBtn");
const downloadBtn = document.getElementById("downloadBtn");
const copyBtn = document.getElementById("copyBtn");
const builderList = document.getElementById("builderList");
const preview = document.getElementById("preview");
const rowTemplate = document.getElementById("builderRowTemplate");

const nameInput = document.getElementById("nameInput");
const authorInput = document.getElementById("authorInput");
const descInput = document.getElementById("descInput");

const fieldGroups = {
  Warmup: document.getElementById("fieldsWarmup"),
  SteadyState: document.getElementById("fieldsSteadyState"),
  IntervalsT: document.getElementById("fieldsIntervalsT"),
  FreeRide: document.getElementById("fieldsFreeRide"),
  Cooldown: document.getElementById("fieldsCooldown"),
};

const state = { intervals: [] };

typeSelect.addEventListener("change", onTypeChange);
addIntervalBtn.addEventListener("click", onAddInterval);
clearIntervalsBtn.addEventListener("click", clearIntervals);
downloadBtn.addEventListener("click", downloadZwo);
copyBtn.addEventListener("click", copyXmlToClipboard);
[nameInput, authorInput, descInput].forEach((el) =>
  el.addEventListener("input", () => {
    if (state.intervals.length) preview.textContent = generateXml();
  })
);

function onTypeChange() {
  Object.values(fieldGroups).forEach((el) => el.classList.add("hidden"));
  const current = fieldGroups[typeSelect.value];
  if (current) current.classList.remove("hidden");
}

function onAddInterval() {
  const type = typeSelect.value;
  const interval = buildInterval(type);
  if (!interval) return;
  interval.id = newId();
  state.intervals.push(interval);
  renderList();
}

function buildInterval(type) {
  const num = (id) => Number(document.getElementById(id).value);
  switch (type) {
    case "Warmup":
      return {
        type,
        durationSec: num("wuDuration"),
        powerLow: num("wuLow") / 100,
        powerHigh: num("wuHigh") / 100,
        label: "Warmup",
      };
    case "SteadyState":
      return {
        type,
        durationSec: num("ssDuration"),
        power: num("ssPower") / 100,
        label: "Steady State",
      };
    case "IntervalsT":
      return {
        type,
        repeat: num("intRepeats"),
        onDuration: num("intOnDuration"),
        offDuration: num("intOffDuration"),
        onPower: num("intOnPower") / 100,
        offPower: num("intOffPower") / 100,
        label: "Intervals",
      };
    case "FreeRide":
      return {
        type,
        durationSec: num("frDuration"),
        label: "Free Ride",
      };
    case "Cooldown":
      return {
        type,
        durationSec: num("cdDuration"),
        powerHigh: num("cdHigh") / 100,
        powerLow: num("cdLow") / 100,
        label: "Cooldown",
      };
    default:
      return null;
  }
}

function renderList() {
  builderList.innerHTML = "";
  if (state.intervals.length === 0) {
    builderList.classList.add("empty");
    builderList.innerHTML = "<p>No blocks yet. Add one to get started.</p>";
    preview.textContent = "";
    return;
  }
  builderList.classList.remove("empty");
  state.intervals.forEach((interval, idx) => {
    const node = rowTemplate.content.cloneNode(true);
    const container = node.querySelector(".interval");
    container.dataset.id = interval.id;
    node.querySelector(".interval-name").textContent = interval.label || interval.type;
    node.querySelector(".interval-meta").textContent = describeInterval(interval);
    node.querySelector(".interval-bar").style.background = barGradientFor(interval);
    node.querySelector(".pill").textContent = interval.type;
    node.querySelector(".remove-row").addEventListener("click", () => removeInterval(interval.id));
    builderList.appendChild(node);
  });
  preview.textContent = generateXml();
}

function describeInterval(interval) {
  switch (interval.type) {
    case "Warmup":
      return `${interval.durationSec}s ramp ${percent(interval.powerLow)}% → ${percent(interval.powerHigh)}%`;
    case "Cooldown":
      return `${interval.durationSec}s ramp ${percent(interval.powerHigh)}% → ${percent(interval.powerLow)}%`;
    case "SteadyState":
      return `${interval.durationSec}s @ ${percent(interval.power)}%`;
    case "FreeRide":
      return `${interval.durationSec}s free ride`;
    case "IntervalsT":
      return `${interval.repeat} x ${interval.onDuration}s @ ${percent(interval.onPower)}% / ${interval.offDuration}s @ ${percent(interval.offPower)}%`;
    default:
      return "";
  }
}

function removeInterval(id) {
  state.intervals = state.intervals.filter((i) => i.id !== id);
  renderList();
}

function clearIntervals() {
  state.intervals = [];
  renderList();
}

function generateXml() {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<workout_file>");
  lines.push(`  <author>${escapeXml(authorInput.value || "You")}</author>`);
  lines.push(`  <name>${escapeXml(nameInput.value || "Custom Workout")}</name>`);
  const desc = descInput.value || "";
  if (desc) lines.push(`  <description>${escapeXml(desc)}</description>`);
  lines.push("  <workout>");
  state.intervals.forEach((interval) => {
    lines.push(...intervalToXml(interval).map((l) => `    ${l}`));
  });
  lines.push("  </workout>");
  lines.push("</workout_file>");
  return lines.join("\n");
}

function intervalToXml(interval) {
  switch (interval.type) {
    case "Warmup":
      return [
        `<Warmup Duration="${interval.durationSec}" PowerLow="${interval.powerLow.toFixed(2)}" PowerHigh="${interval.powerHigh.toFixed(2)}" />`,
      ];
    case "Cooldown":
      return [
        `<Cooldown Duration="${interval.durationSec}" PowerLow="${interval.powerLow.toFixed(2)}" PowerHigh="${interval.powerHigh.toFixed(2)}" />`,
      ];
    case "SteadyState":
      return [`<SteadyState Duration="${interval.durationSec}" Power="${interval.power.toFixed(2)}" />`];
    case "FreeRide":
      return [`<FreeRide Duration="${interval.durationSec}" />`];
    case "IntervalsT":
      return [
        `<IntervalsT Repeat="${interval.repeat}" OnDuration="${interval.onDuration}" OffDuration="${interval.offDuration}" OnPower="${interval.onPower.toFixed(2)}" OffPower="${interval.offPower.toFixed(2)}" />`,
      ];
    default:
      return [];
  }
}

function percent(value) {
  return Math.round(value);
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function downloadZwo() {
  if (state.intervals.length === 0) {
    alert("Add at least one block before exporting.");
    return;
  }
  const blob = new Blob([generateXml()], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (nameInput.value || "custom_workout").replace(/\s+/g, "_").toLowerCase();
  a.download = `${safeName}.zwo`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyXmlToClipboard() {
  try {
    const xml = generateXml();
    await navigator.clipboard.writeText(xml);
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy XML"), 1200);
  } catch (err) {
    alert("Copy failed. You can still download the file.");
  }
}

function barGradientFor(interval) {
  const simpleColor = "#2563eb";
  switch (interval.type) {
    case "Warmup":
      return `linear-gradient(90deg, ${powerColor(interval.powerLow)}, ${powerColor(interval.powerHigh)})`;
    case "Cooldown":
      return `linear-gradient(90deg, ${powerColor(interval.powerHigh)}, ${powerColor(interval.powerLow)})`;
    case "SteadyState":
      return `linear-gradient(90deg, ${powerColor(interval.power)}, ${powerColor(interval.power)})`;
    case "FreeRide":
      return "linear-gradient(90deg, #94a3b8, #cbd5e1)";
    case "IntervalsT":
      return `linear-gradient(90deg, ${powerColor(interval.onPower)}, ${powerColor(interval.offPower)})`;
    default:
      return simpleColor;
  }
}

function powerColor(power) {
  if (power < 0.6) return "#22c55e";
  if (power < 0.8) return "#10b981";
  if (power < 1.0) return "#2563eb";
  if (power < 1.2) return "#f59e0b";
  return "#ef4444";
}

// Initialize view
onTypeChange();
renderList();
