const ftpInput = document.getElementById("ftpInput");
const workoutList = document.getElementById("workoutList");
const detailMeta = document.getElementById("detailMeta");
const detailIntervals = document.getElementById("detailIntervals");
const loadBtn = document.getElementById("loadBtn");
const copyBtn = document.getElementById("copyBtn");
const xmlPreview = document.getElementById("xmlPreview");
const workoutCardTemplate = document.getElementById("workoutCardTemplate");
const detailIntervalTemplate = document.getElementById("detailIntervalTemplate");

const workoutLibrary = [
  {
    id: "sweet-spot-3x8",
    name: "Sweet Spot 3x8",
    author: "CycleTraining Library",
    description: "Sub-threshold builder with three 8-minute efforts and a gentle cool down.",
    focus: "Sweet spot / tempo",
    intervals: [
      { kind: "warmup", durationSec: 360, startPct: 0.55, endPct: 0.75 },
      { kind: "steady", durationSec: 300, targetPct: 0.88, label: "Settle" },
      { kind: "intervalBlock", repeat: 3, onDurationSec: 480, offDurationSec: 180, onPct: 0.92, offPct: 0.6, label: "Sweet spot repeats" },
      { kind: "steady", durationSec: 240, targetPct: 0.85, label: "Tempo flush" },
      { kind: "cooldown", durationSec: 300, startPct: 0.75, endPct: 0.5 },
    ],
  },
  {
    id: "vo2-6x2",
    name: "VO₂ Max 6x2",
    author: "CycleTraining Library",
    description: "Short-sharp aerobic power with matched recoveries.",
    focus: "High intensity",
    intervals: [
      { kind: "warmup", durationSec: 420, startPct: 0.5, endPct: 0.8 },
      { kind: "steady", durationSec: 300, targetPct: 0.88, label: "Prime" },
      { kind: "intervalBlock", repeat: 6, onDurationSec: 120, offDurationSec: 120, onPct: 1.15, offPct: 0.55, label: "VO₂ repeats" },
      { kind: "freeride", durationSec: 120, label: "Free spin" },
      { kind: "cooldown", durationSec: 300, startPct: 0.75, endPct: 0.5 },
    ],
  },
  {
    id: "endurance-cruise",
    name: "Endurance Cruise",
    author: "CycleTraining Library",
    description: "Aerobic time-in-zone with short tempo lifts.",
    focus: "Endurance",
    intervals: [
      { kind: "warmup", durationSec: 300, startPct: 0.55, endPct: 0.7 },
      { kind: "steady", durationSec: 1200, targetPct: 0.75, label: "Endurance" },
      { kind: "intervalBlock", repeat: 3, onDurationSec: 300, offDurationSec: 180, onPct: 0.85, offPct: 0.7, label: "Tempo lifts" },
      { kind: "steady", durationSec: 600, targetPct: 0.78, label: "Aerobic finish" },
      { kind: "cooldown", durationSec: 300, startPct: 0.7, endPct: 0.5 },
    ],
  },
  {
    id: "ftp-ramp-test",
    name: "FTP Ramp Test",
    author: "CycleTraining Library",
    description: "Classic 1-minute steps. Stop when you fail a step; last full minute x 0.75 ≈ FTP.",
    focus: "Assessment",
    intervals: [
      { kind: "warmup", durationSec: 420, startPct: 0.5, endPct: 0.75 },
      { kind: "steady", durationSec: 180, targetPct: 0.8, label: "Settle in" },
      { kind: "rampSteps", startPct: 0.8, stepPct: 0.05, steps: 12, stepDurationSec: 60, label: "Ramp" },
      { kind: "cooldown", durationSec: 420, startPct: 0.7, endPct: 0.45 },
    ],
  },
];

let selectedId = workoutLibrary[0]?.id || null;

ftpInput.addEventListener("input", () => {
  renderWorkoutList();
  renderDetail();
});

loadBtn.addEventListener("click", () => {
  const workout = getSelectedWorkout();
  if (!workout) return;
  const xml = buildXml(workout);
  localStorage.setItem("libraryWorkoutXml", xml);
  localStorage.setItem("libraryWorkoutName", workout.name);
  window.location.href = "index.html";
});

copyBtn.addEventListener("click", async () => {
  const workout = getSelectedWorkout();
  if (!workout) return;
  try {
    await navigator.clipboard.writeText(buildXml(workout));
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy .zwo"), 1200);
  } catch (err) {
    alert("Copy failed. You can still open the runner and load it there.");
  }
});

function renderWorkoutList() {
  const ftp = getFtp();
  workoutList.innerHTML = "";
  workoutLibrary.forEach((workout) => {
    const node = workoutCardTemplate.content.cloneNode(true);
    const card = node.querySelector(".workout-card");
    card.dataset.id = workout.id;
    const segments = expandWorkout(workout);
    const duration = totalDuration(segments);
    const firstSegment = segments[0];
    node.querySelector(".interval-name").textContent = workout.name;
    node.querySelector(".interval-meta").textContent = summaryLine(workout, ftp);
    node.querySelector(".interval-duration").textContent = formatTime(duration);
    node.querySelector(".interval-bar").style.background = firstSegment ? barGradient(firstSegment) : "#cbd5e1";
    card.classList.toggle("active", workout.id === selectedId);
    card.addEventListener("click", () => selectWorkout(workout.id));
    workoutList.appendChild(node);
  });
}

function renderDetail() {
  const workout = getSelectedWorkout();
  const ftp = getFtp();
  if (!workout) {
    detailMeta.innerHTML = "<p>Select a workout to see details.</p>";
    detailIntervals.innerHTML = "<p>No intervals yet.</p>";
    detailIntervals.classList.add("empty");
    loadBtn.disabled = true;
    copyBtn.disabled = true;
    xmlPreview.textContent = "";
    return;
  }

  const segments = expandWorkout(workout);
  detailMeta.innerHTML = `
    <p><strong>${workout.name}</strong> • ${workout.focus}</p>
    <p>${workout.description}</p>
    <p>Estimated time: ${formatTime(totalDuration(segments))}</p>
    <p class="subtle">Targets scale to your FTP. Current FTP: ${ftp ? `${ftp} W` : "not set"}.</p>
  `;

  detailIntervals.innerHTML = "";
  detailIntervals.classList.remove("empty");
  segments.forEach((segment) => {
    const node = detailIntervalTemplate.content.cloneNode(true);
    node.querySelector(".interval-name").textContent = segment.label;
    node.querySelector(".interval-meta").textContent = targetText(segment, ftp);
    node.querySelector(".interval-duration").textContent = formatTime(segment.durationSec);
    node.querySelector(".interval-bar").style.background = barGradient(segment);
    detailIntervals.appendChild(node);
  });

  xmlPreview.textContent = buildXml(workout);
  loadBtn.disabled = false;
  copyBtn.disabled = false;
}

function selectWorkout(id) {
  selectedId = id;
  renderWorkoutList();
  renderDetail();
}

function getSelectedWorkout() {
  return workoutLibrary.find((w) => w.id === selectedId) || null;
}

function getFtp() {
  const value = Number(ftpInput.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function expandWorkout(workout) {
  const segments = [];
  workout.intervals.forEach((interval) => {
    if (interval.kind === "warmup" || interval.kind === "cooldown") {
      segments.push({
        label: interval.kind === "warmup" ? "Warmup" : "Cooldown",
        durationSec: interval.durationSec,
        startPct: interval.startPct,
        endPct: interval.endPct,
      });
    } else if (interval.kind === "steady") {
      segments.push({
        label: interval.label || "Steady",
        durationSec: interval.durationSec,
        startPct: interval.targetPct,
        endPct: interval.targetPct,
      });
    } else if (interval.kind === "freeride") {
      segments.push({
        label: interval.label || "Free ride",
        durationSec: interval.durationSec,
        startPct: null,
        endPct: null,
      });
    } else if (interval.kind === "intervalBlock") {
      for (let i = 0; i < interval.repeat; i++) {
        segments.push({
          label: `${interval.label || "On"} ${i + 1}`,
          durationSec: interval.onDurationSec,
          startPct: interval.onPct,
          endPct: interval.onPct,
        });
        segments.push({
          label: "Recover",
          durationSec: interval.offDurationSec,
          startPct: interval.offPct,
          endPct: interval.offPct,
        });
      }
    } else if (interval.kind === "rampSteps") {
      for (let i = 0; i < interval.steps; i++) {
        const pct = interval.startPct + interval.stepPct * i;
        segments.push({
          label: `${interval.label || "Ramp"} ${percent(pct)}%`,
          durationSec: interval.stepDurationSec,
          startPct: pct,
          endPct: pct,
        });
      }
    }
  });
  return segments;
}

function totalDuration(segments) {
  return segments.reduce((sum, seg) => sum + seg.durationSec, 0);
}

function summaryLine(workout, ftp) {
  const segments = expandWorkout(workout);
  const main = segments.find((s) => s.startPct !== null) || segments[0];
  const duration = formatTime(totalDuration(segments));
  const text = main ? targetText(main, ftp) : "Free ride";
  return `${workout.focus} • ${duration} • ${text}`;
}

function targetText(segment, ftp) {
  if (segment.startPct === null || segment.endPct === null) return "Free ride / ERG off";
  const startPct = percent(segment.startPct);
  const endPct = percent(segment.endPct);
  const startW = ftp ? Math.round(segment.startPct * ftp) : null;
  const endW = ftp ? Math.round(segment.endPct * ftp) : null;
  if (startPct === endPct) {
    return ftp ? `${startW} W (${startPct}% FTP)` : `${startPct}% FTP`;
  }
  const pctText = `${startPct}% → ${endPct}% FTP`;
  if (!ftp) return pctText;
  return `${startW}-${endW} W (${pctText})`;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function percent(value) {
  return Math.round(value * 100);
}

function barGradient(segment) {
  if (segment.startPct === null || segment.endPct === null) {
    return "linear-gradient(90deg, #94a3b8, #cbd5e1)";
  }
  const start = Math.max(0, Math.min(1.4, segment.startPct));
  const end = Math.max(0, Math.min(1.4, segment.endPct));
  return `linear-gradient(90deg, ${powerColor(start)}, ${powerColor(end)})`;
}

function powerColor(power) {
  if (power < 0.6) return "#22c55e";
  if (power < 0.8) return "#10b981";
  if (power < 1.0) return "#2563eb";
  if (power < 1.2) return "#f59e0b";
  return "#ef4444";
}

function buildXml(workout) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<workout_file>");
  lines.push(`  <author>${escapeXml(workout.author || "CycleTraining Library")}</author>`);
  lines.push(`  <name>${escapeXml(workout.name)}</name>`);
  lines.push(`  <description>${escapeXml(workout.description || "")}</description>`);
  lines.push("  <workout>");
  workout.intervals.forEach((interval) => {
    xmlForInterval(interval).forEach((line) => lines.push(`    ${line}`));
  });
  lines.push("  </workout>");
  lines.push("</workout_file>");
  return lines.join("\n");
}

function xmlForInterval(interval) {
  switch (interval.kind) {
    case "warmup":
      return [
        `<Warmup Duration="${interval.durationSec}" PowerLow="${interval.startPct.toFixed(2)}" PowerHigh="${interval.endPct.toFixed(2)}" />`,
      ];
    case "cooldown":
      return [
        `<Cooldown Duration="${interval.durationSec}" PowerLow="${interval.endPct.toFixed(2)}" PowerHigh="${interval.startPct.toFixed(2)}" />`,
      ];
    case "steady":
      return [`<SteadyState Duration="${interval.durationSec}" Power="${interval.targetPct.toFixed(2)}" />`];
    case "freeride":
      return [`<FreeRide Duration="${interval.durationSec}" />`];
    case "intervalBlock":
      return [
        `<IntervalsT Repeat="${interval.repeat}" OnDuration="${interval.onDurationSec}" OffDuration="${interval.offDurationSec}" OnPower="${interval.onPct.toFixed(2)}" OffPower="${interval.offPct.toFixed(2)}" />`,
      ];
    case "rampSteps": {
      const lines = [];
      for (let i = 0; i < interval.steps; i++) {
        const pct = interval.startPct + interval.stepPct * i;
        lines.push(`<SteadyState Duration="${interval.stepDurationSec}" Power="${pct.toFixed(2)}" />`);
      }
      return lines;
    }
    default:
      return [];
  }
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Initial render
renderWorkoutList();
renderDetail();
