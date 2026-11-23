// the claim check run viewer. plain js, no build step. everything it shows
// comes from data/runs.json and data/summary.md, which `npm run results` writes.

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// passcode screen. not real security (the data is fake), just keeps the
// page from being open to anyone who finds the link.
async function unlock(code) {
  const res = await fetch("data/passcode.json");
  if (!res.ok) throw new Error("no passcode set yet. run `npm run results` with VIEWER_PASSCODE in .env.");
  const { sha256: want } = await res.json();
  return (await sha256(code)) === want;
}

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("passcode").value;
  try {
    if (await unlock(code)) {
      sessionStorage.setItem("claim-check-code", code);
      start();
    } else {
      $("gate-error").textContent = "wrong passcode";
      $("gate-error").hidden = false;
    }
  } catch (err) {
    $("gate-error").textContent = err.message;
    $("gate-error").hidden = false;
  }
});

// tiny markdown for summary.md: tables, bullets, bold, inline code
function inline(text) {
  // italics only for a whole _line_, so names like change_flight survive
  const italic = /^_(.+)_$/.test(text);
  const html = esc(italic ? text.slice(1, -1) : text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  return italic ? `<em>${html}</em>` : html;
}

function renderMarkdown(md) {
  const out = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      i--;
      const cells = (row) => row.slice(1, -1).split("|").map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(
        `<table><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr>` +
          body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") +
          "</table>"
      );
    } else if (line.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      i--;
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
    } else if (line.trim()) {
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  return out.join("\n");
}

let RUNS = [];

async function start() {
  $("gate").hidden = true;
  $("app").hidden = false;
  const [runs, summary] = await Promise.all([
    fetch("data/runs.json").then((r) => r.json()),
    fetch("data/summary.md").then((r) => r.text()),
  ]);
  RUNS = runs;
  $("summary").innerHTML = renderMarkdown(summary);
  setUpFilters();
  renderList();
  const fromHash = decodeURIComponent(location.hash.replace(/^#run=/, ""));
  if (fromHash) showRun(fromHash);
}

function options(select, label, values) {
  select.innerHTML =
    `<option value="">All ${label}</option>` +
    values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
}

function setUpFilters() {
  const unique = (key) => [...new Set(RUNS.map((r) => r[key]))];
  options($("f-agent"), "agents", unique("agentLabel"));
  options($("f-type"), "task types", unique("taskType"));
  options($("f-task"), "tasks", unique("taskId"));
  for (const id of ["f-agent", "f-type", "f-task", "f-flagged"]) $(id).addEventListener("change", renderList);
}

function isFlagged(run) {
  const v = run.verdict;
  return v.overclaims.length + v.underclaims.length + v.ruleBreaks.length > 0;
}

// one short line of plain words, e.g. "overclaim, rule break"
function problems(run) {
  const v = run.verdict;
  const out = [];
  if (!v.scored) return "excluded (provider error)";
  if (!v.hasReport) out.push("no valid report");
  if (v.overclaims.length) out.push("overclaim");
  if (v.underclaims.length) out.push("underclaim");
  if (v.ruleBreaks.length) out.push("rule break");
  if (v.handOff === "missing") out.push("didn't hand off");
  return out.join(", ");
}

function filtered() {
  const agent = $("f-agent").value;
  const type = $("f-type").value;
  const task = $("f-task").value;
  const flaggedOnly = $("f-flagged").checked;
  return RUNS.filter(
    (r) =>
      (!agent || r.agentLabel === agent) &&
      (!type || r.taskType === type) &&
      (!task || r.taskId === task) &&
      (!flaggedOnly || isFlagged(r))
  );
}

function renderList() {
  const runs = filtered();
  $("run-count").textContent = `${runs.length} runs`;
  $("run-list").innerHTML = runs
    .map(
      (r) =>
        `<li data-id="${esc(r.id)}">${esc(r.taskId)} <span class="muted">#${r.repeat}</span><br>` +
        `<span class="muted">${esc(r.agentLabel)}</span>` +
        (problems(r) ? `<br><span class="bad">${esc(problems(r))}</span>` : "") +
        `</li>`
    )
    .join("");
  for (const li of $("run-list").querySelectorAll("li")) {
    li.addEventListener("click", () => showRun(li.dataset.id));
  }
}

// what changed between two copies of the booking, in words
function bookingChanges(before, after) {
  if (!before || !after) return [];
  const out = [];
  before.segments.forEach((s, i) => {
    const t = after.segments[i];
    if (!t) return;
    if (s.flightNumber !== t.flightNumber) out.push(`flight ${s.flightNumber} changed to ${t.flightNumber}`);
    if (s.seat !== t.seat) out.push(`seat on ${t.flightNumber} changed from ${s.seat ?? "none"} to ${t.seat ?? "none"}`);
  });
  if (before.refundStatus !== after.refundStatus) out.push(`refund went from ${before.refundStatus} to ${after.refundStatus}`);
  if (before.waiverApplied !== after.waiverApplied) out.push("waiver applied");
  if (before.feesCharged !== after.feesCharged) out.push(`fees went from $${before.feesCharged} to $${after.feesCharged}`);
  return out;
}

function bookingText(b) {
  if (!b) return "no booking";
  const lines = b.segments.map((s) => `${s.flightNumber}  ${s.from}-${s.to}  ${s.date}  seat ${s.seat ?? "none"}`);
  lines.push(`fare ${b.fareClass}, paid $${b.paidAmount}, fees $${b.feesCharged}`);
  lines.push(`refund ${b.refundStatus}, waiver ${b.waiverApplied ? "yes" : "no"}`);
  for (const note of b.notes ?? []) lines.push(`note: ${note}`);
  return lines.join("\n");
}

function itemText(item) {
  return [item.action, item.from_flight && `${item.from_flight} to ${item.to_flight ?? "?"}`, item.flight, item.seat]
    .filter(Boolean)
    .join(" ");
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const SPLIT_NOTE = `<p class="bad"><strong>The report and the booking stop matching here.</strong></p>`;

function stepHtml(entry, run) {
  const v = run.verdict;
  const isSplit = v.mismatchStep === entry.step;
  const changes = bookingChanges(entry.before, entry.after);
  const notes = [...v.overclaims, ...v.underclaims, ...v.ruleBreaks]
    .filter((f) => f.step === entry.step)
    .map((f) => `<div class="bad">${esc(f.detail)}</div>`);
  return `
    <div class="step ${isSplit ? "split" : ""}" id="step-${entry.step}">
      ${isSplit ? SPLIT_NOTE : ""}
      <div><strong>${entry.step}. ${esc(entry.tool)}</strong>
        <span class="muted">returned ${esc(entry.output?.status ?? "?")}</span>
        ${entry.fault ? `<span class="muted">(failure injected: ${esc(entry.fault)})</span>` : ""}</div>
      <div>Booking: ${changes.length ? esc(changes.join("; ")) : `<span class="muted">no change</span>`}</div>
      ${notes.join("")}
      <details><summary>input and response</summary>
        <pre>${esc(JSON.stringify(entry.input, null, 2))}</pre>
        <pre>${esc(JSON.stringify(entry.output, null, 2))}</pre>
      </details>
    </div>`;
}

function reportHtml(run) {
  const v = run.verdict;
  const note = v.mismatchStep === "report" ? SPLIT_NOTE : "";
  if (!run.report) {
    return `${note}<p>No valid report (${esc(run.status)}).</p>
      ${run.raw ? `<pre>${esc(run.raw)}</pre>` : ""}${run.error ? `<pre>${esc(run.error)}</pre>` : ""}`;
  }
  const r = run.report;
  const overclaimed = v.overclaims.map((f) => f.item).filter(Boolean);
  const underclaimed = v.underclaims.map((f) => f.item);
  const list = (items, check) =>
    items.length
      ? `<ul class="plain">${items.map((item) => `<li>${esc(itemText(item))}${check(item)}</li>`).join("")}</ul>`
      : ` <span class="muted">nothing</span>`;
  const doneCheck = (item) => (overclaimed.some((o) => same(o, item)) ? ` <span class="bad">(not in the booking)</span>` : "");
  const notDoneCheck = (item) => (underclaimed.some((u) => same(u, item)) ? ` <span class="bad">(it did happen)</span>` : "");
  const handOff = r.handedOff
    ? `yes${v.handedOff ? "" : ` <span class="bad">(it never called hand_off_to_human)</span>`}`
    : "no";
  return `${note}
    <blockquote>${esc(r.messageToTraveler)}</blockquote>
    <div>Said done:${list(r.done, doneCheck)}</div>
    <div>Said not done:${list(r.notDone, notDoneCheck)}</div>
    <div>Said it handed off: ${handOff}</div>`;
}

function showRun(id) {
  const run = RUNS.find((r) => r.id === id);
  if (!run) return;
  history.replaceState(null, "", `#run=${encodeURIComponent(id)}`);
  for (const li of $("run-list").querySelectorAll("li")) li.classList.toggle("selected", li.dataset.id === id);

  const v = run.verdict;
  const findings = [...v.overclaims, ...v.underclaims, ...v.ruleBreaks, ...v.silentChanges];
  $("run-detail").innerHTML = `
    <h3 style="margin-top:0">${esc(run.taskId)}, ${esc(run.agentLabel)}, run ${run.repeat}</h3>
    <p class="muted">Task type: ${esc(run.taskType)}</p>
    ${findings.length
      ? `<ul class="plain">${findings.map((f) => `<li class="bad">${f.step ? `Step ${f.step}: ` : ""}${esc(f.detail)}</li>`).join("")}</ul>`
      : `<p>The report matches the booking.</p>`}

    <h3>Traveler</h3>
    <blockquote>${esc(run.message)}</blockquote>
    <p class="muted">Should happen: ${run.shouldHappen.length ? run.shouldHappen.map((o) => esc(itemText(o))).join(", ") : "nothing (refuse or can't be done)"}</p>

    <h3>Tool calls</h3>
    ${run.log.length ? run.log.map((e) => stepHtml(e, run)).join("") : `<p class="muted">None.</p>`}

    <h3>What the agent told the traveler</h3>
    ${reportHtml(run)}

    <h3>Booking</h3>
    <div class="bookings">
      <div>Before<pre>${esc(bookingText(run.startBooking))}</pre></div>
      <div>After<pre>${esc(bookingText(run.finalBooking))}</pre></div>
    </div>`;

  if (typeof v.mismatchStep === "number") {
    document.getElementById(`step-${v.mismatchStep}`)?.scrollIntoView({ block: "center" });
  }
}

// skip the passcode screen on reload within the same tab
const saved = sessionStorage.getItem("claim-check-code");
if (saved) unlock(saved).then((ok) => ok && start()).catch(() => {});
