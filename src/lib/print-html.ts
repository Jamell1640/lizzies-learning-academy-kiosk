/**
 * Self-contained HTML builders for printable reports.
 *
 * Implements a near-replica of the official Wisconsin DCF-F-2438
 * "Daily Attendance Record" form (R. 02/2023) for both:
 *   1. Classroom Tracker weekly reports (Section A, B, C, Footer)
 *   2. Main Book center-wide reports (Section A, B with extra Classroom column, Footer)
 *
 * Each function returns a complete HTML document string (with inline
 * <style>) so it can be written into a freshly-opened print window with
 * NO dependency on the main app's stylesheet loading. This is the reliable
 * pattern that fixes the blank-printout bug: the new window contains only
 * the report markup + inline styles, and window.print() is called only
 * after that document fully loads (handled by openPrintWindow).
 *
 * Browser-safe pure functions (string building only).
 */
import type { WeeklyDcfReport } from "./weekly-dcf.types";
import { APP_NAME, KOALA_MASCOT_URL } from "./brand";
import { FACILITY_ID } from "./facility";
import { formatCrmTime } from "./kiosk-time";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDateShort(iso: string): string {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y) return iso || "";
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

function generatedStamp(): string {
  const d = new Date();
  const date = d.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} ${time}`;
}

/**
 * Shared CSS replicating the Wisconsin DCF-F-2438 form styling.
 * Crisp black borders, condensed sans-serif, high contrast for print.
 */
function dcfFormCss(): string {
  return `
    @page {
      size: letter landscape;
      margin: 0.25in 0.3in 0.25in 0.3in;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #fff; color: #000;
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 8pt;
      line-height: 1.2;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .dcf-page {
      width: 100%;
      padding: 0;
    }
    .brand-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .brand-title {
      font-size: 15pt;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: 0.01em;
    }
    .report-subtitle {
      font-size: 10pt;
      font-weight: 700;
      color: #0284c7;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 2px;
      font-size: 7pt;
      font-weight: bold;
    }
    .top-bar-left {
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .top-bar-right {
      color: #333;
    }
    .form-title {
      text-align: center;
      font-size: 13pt;
      font-weight: 900;
      letter-spacing: 0.01em;
      margin: 2px 0 3px 0;
      text-transform: uppercase;
    }
    .use-of-form-note {
      font-size: 6.5pt;
      line-height: 1.2;
      margin-bottom: 4px;
      color: #111;
      text-align: justify;
    }

    /* SECTION A HEADER BOX */
    .section-a-box {
      border: 1.5px solid #000;
      margin-bottom: 5px;
    }
    .section-a-title {
      font-size: 8pt;
      font-weight: 800;
      padding: 2px 4px;
      border-bottom: 1px solid #000;
      background: #fff;
    }
    .section-a-fields {
      display: flex;
      width: 100%;
    }
    .section-a-field {
      padding: 3px 6px;
      border-right: 1px solid #000;
      font-size: 7.5pt;
    }
    .section-a-field:last-child {
      border-right: none;
    }
    .field-lbl {
      font-weight: 700;
      margin-right: 4px;
    }
    .field-val {
      font-weight: 500;
    }

    /* SECTION B / C INSTRUCTIONS */
    .section-banner {
      border: 1px solid #000;
      border-bottom: none;
      padding: 2px 4px;
      font-size: 7pt;
      line-height: 1.25;
      background: #fff;
    }
    .section-banner-title {
      font-weight: 800;
      text-transform: uppercase;
    }

    /* TABLES */
    table.dcf-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1.5px solid #000;
      margin-bottom: 6px;
      font-size: 7.5pt;
    }
    table.dcf-table th, table.dcf-table td {
      border: 1px solid #000;
      padding: 2px 2px;
      text-align: center;
      vertical-align: middle;
      overflow: hidden;
      word-wrap: break-word;
    }
    /* Repeat the column header row on every printed page so paginated
       children still see the day labels. */
    table.dcf-table thead { display: table-header-group; }
    table.dcf-table tfoot { display: table-footer-group; }
    table.dcf-table tbody tr { break-inside: avoid; }
    table.dcf-table thead th {
      background: #f4f4f4;
      font-weight: 700;
      font-size: 7pt;
      line-height: 1.15;
    }
    .col-num { width: 22px; text-align: center; font-weight: bold; }
    .col-child-name { text-align: left; padding-left: 4px !important; }
    .col-time { width: 4.8%; font-size: 6.8pt; }
    .col-time .in-val { font-weight: bold; color: #000; }
    .col-time .out-val { font-size: 6.5pt; color: #333; }
    .col-sign { width: 70px; }
    .tot-row td {
      font-weight: 800;
      background: #f9f9f9;
      font-size: 7.5pt;
    }

    /* SECTION C STAFF */
    .section-c-wrap {
      margin-top: 4px;
      page-break-inside: avoid;
    }

    /* FOOTER & SIGNATURES */
    .dcf-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 6.5pt;
      margin-top: 4px;
      color: #333;
    }
    .dcf-sig-block {
      border-top: 1px solid #000;
      margin-top: 5px;
      padding-top: 4px;
      display: flex;
      gap: 20px;
      font-size: 7pt;
    }
    .sig-field {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      flex: 1;
    }
    .sig-line {
      flex: 1;
      border-bottom: 1px solid #000;
      height: 14px;
    }
  `;
}

/**
 * Build an official DCF-F-2438 "Daily Attendance Record" report HTML string
 * for either a single classroom (Tracker) or all classrooms (Main Book).
 */
export function buildDcf2438Html(opts: { report: WeeklyDcfReport; isMainBook?: boolean }): string {
  const { report, isMainBook } = opts;
  const stamp = generatedStamp();

  const weekStartFmt = fmtDateShort(report.weekStart);
  const weekEndFmt = fmtDateShort(report.weekEnd);

  // Daily totals calculation (count of children with check-in on that day)
  const dailyChildTotals = report.weekDates.map((date) => {
    return report.children.filter((c) => {
      const d = c.days.find((day) => day.date === date);
      return Boolean(d?.present);
    }).length;
  });

  // Calculate day-of-week header dates (MM/DD)
  const weekdayDates = report.weekDates.map((date) => {
    const [y, m, d] = date.split("-").map(Number);
    return `${m}/${d}`;
  });

  // SECTION B ROWS (Children)
  // Render ALL enrolled children (no cap) — paginate onto additional pages
  // like the real DCF form. Pad to a minimum of 12 rows so short rosters
  // still show the full grid for pen entry.
  const minRows = Math.max(report.children.length, 12);
  const childRows: string[] = [];

  for (let i = 0; i < minRows; i++) {
    const child = report.children[i];
    const rowNum = `${i + 1}.`;

    if (!child) {
      // Empty row matching the form grid lines
      childRows.push(`<tr>
        <td class="col-num">${rowNum}</td>
        <td class="col-child-name">&nbsp;</td>
        <td>&nbsp;</td>
        ${isMainBook ? "<td>&nbsp;</td>" : ""}
        <td>&nbsp;</td><td>&nbsp;</td>
        <td>&nbsp;</td><td>&nbsp;</td>
        <td>&nbsp;</td><td>&nbsp;</td>
        <td>&nbsp;</td><td>&nbsp;</td>
        <td>&nbsp;</td><td>&nbsp;</td>
        <td>&nbsp;</td><td>&nbsp;</td>
        <td>&nbsp;</td><td>&nbsp;</td>
        <td>&nbsp;</td>
      </tr>`);
      continue;
    }

    // Stack up to 4 In/Out pairs per day cell (the multi-cycle model creates
    // separate attendance_records rows for same-day sign-out/sign-in).
    const timeCells = report.weekDates
      .map((date) => {
        const d = child.days.find((day) => day.date === date);
        const pairs = d?.pairs || [];
        const inLines: string[] = [];
        const outLines: string[] = [];
        for (const p of pairs) {
          inLines.push(
            `<span class="in-val">${esc(p.checkInTime ? formatCrmTime(p.checkInTime) : "")}</span>`,
          );
          outLines.push(
            `<span class="out-val">${esc(p.checkOutTime ? formatCrmTime(p.checkOutTime) : "")}</span>`,
          );
        }
        // Pad to at least one line so the cell keeps its shape.
        if (inLines.length === 0) inLines.push(`<span class="in-val">&nbsp;</span>`);
        if (outLines.length === 0) outLines.push(`<span class="out-val">&nbsp;</span>`);
        return `
          <td class="col-time">${inLines.join("<br>")}</td>
          <td class="col-time">${outLines.join("<br>")}</td>
        `;
      })
      .join("");

    childRows.push(`<tr>
      <td class="col-num">${rowNum}</td>
      <td class="col-child-name"><strong>${esc(child.name)}</strong></td>
      <td>${esc(child.dob || "")}</td>
      ${isMainBook ? `<td style="font-size:7pt;text-align:left;padding-left:3px;">${esc(child.classroom || "")}</td>` : ""}
      ${timeCells}
      <td class="col-sign">&nbsp;</td>
    </tr>`);
  }

  // Daily totals row
  const totalCells = dailyChildTotals
    .map((tot) => `<td colspan="2" style="font-weight:bold;text-align:center;">${tot}</td>`)
    .join("");

  const sectionBTable = `
    <table class="dcf-table">
      <thead>
        <tr>
          <th rowspan="2" class="col-num">&nbsp;</th>
          <th rowspan="2" style="width:${isMainBook ? "15%" : "18%"};text-align:left;padding-left:4px;">
            Name – Child<br><span style="font-weight:normal;font-size:6.5pt;">(First and Last)</span>
          </th>
          <th rowspan="2" style="width:${isMainBook ? "7%" : "8%"};">
            Date of<br>Birth
          </th>
          ${isMainBook ? `<th rowspan="2" style="width:10%;text-align:left;padding-left:4px;">Classroom</th>` : ""}
          <th colspan="2">${WEEKDAY_NAMES[0]}<br><span style="font-weight:normal;font-size:6.5pt;">${weekdayDates[0]}</span></th>
          <th colspan="2">${WEEKDAY_NAMES[1]}<br><span style="font-weight:normal;font-size:6.5pt;">${weekdayDates[1]}</span></th>
          <th colspan="2">${WEEKDAY_NAMES[2]}<br><span style="font-weight:normal;font-size:6.5pt;">${weekdayDates[2]}</span></th>
          <th colspan="2">${WEEKDAY_NAMES[3]}<br><span style="font-weight:normal;font-size:6.5pt;">${weekdayDates[3]}</span></th>
          <th colspan="2">${WEEKDAY_NAMES[4]}<br><span style="font-weight:normal;font-size:6.5pt;">${weekdayDates[4]}</span></th>
          <th colspan="2">${WEEKDAY_NAMES[5]}<br><span style="font-weight:normal;font-size:6.5pt;">${weekdayDates[5]}</span></th>
          <th colspan="2">${WEEKDAY_NAMES[6]}<br><span style="font-weight:normal;font-size:6.5pt;">${weekdayDates[6]}</span></th>
          <th rowspan="2" class="col-sign">
            Parent<br>Sign Off<br><span style="font-weight:normal;font-size:6pt;">(signature)</span>
          </th>
        </tr>
        <tr>
          <th class="col-time">In</th><th class="col-time">Out</th>
          <th class="col-time">In</th><th class="col-time">Out</th>
          <th class="col-time">In</th><th class="col-time">Out</th>
          <th class="col-time">In</th><th class="col-time">Out</th>
          <th class="col-time">In</th><th class="col-time">Out</th>
          <th class="col-time">In</th><th class="col-time">Out</th>
          <th class="col-time">In</th><th class="col-time">Out</th>
        </tr>
      </thead>
      <tbody>
        ${childRows.join("")}
        <tr class="tot-row">
          <td colspan="${isMainBook ? 4 : 3}" style="text-align:right;padding-right:6px;">
            Total Daily Attendance
          </td>
          ${totalCells}
          <td>&nbsp;</td>
        </tr>
      </tbody>
    </table>
  `;

  // SECTION C (Staff / Provider Schedule)
  // Labeled Provider A, Provider B, Provider C, Provider D (up to 4 staff)
  let sectionC = "";
  if (!isMainBook || report.staff.length > 0) {
    const providerLabels = ["Provider A:", "Provider B:", "Provider C:", "Provider D:"];
    const staffRows: string[] = [];

    for (let p = 0; p < 4; p++) {
      const st = report.staff[p];
      const pLabel = providerLabels[p];
      const nameTitle = st ? `<strong>${esc(st.teacherName)}</strong> — Teacher` : "";

      const timeCells = report.weekDates
        .map((date) => {
          const d = st?.days.find((day) => day.date === date);
          const inStr = d?.clockInTime ? formatCrmTime(d.clockInTime) : "";
          const outStr = d?.clockOutTime ? formatCrmTime(d.clockOutTime) : "";
          return `
            <td class="col-time"><span class="in-val">${esc(inStr)}</span></td>
            <td class="col-time"><span class="out-val">${esc(outStr)}</span></td>
          `;
        })
        .join("");

      staffRows.push(`<tr>
        <td style="text-align:left;padding-left:4px;width:32px;font-weight:bold;">${pLabel}</td>
        <td style="text-align:left;padding-left:4px;">${nameTitle}</td>
        ${timeCells}
      </tr>`);
    }

    sectionC = `
      <div class="section-c-wrap">
        <div class="section-banner">
          <span class="section-banner-title">SECTION C – Provider Schedule:</span>
          Enter full name and position title for each provider, additional provider, substitute or emergency backup provider who worked with the children during the week. In the rows corresponding to the provider's name, record the actual times the provider, additional provider, substitute, or emergency backup provider was counted in staff-to-child ratios, using a.m. / p.m. designations.
        </div>
        <table class="dcf-table">
          <thead>
            <tr>
              <th colspan="2" style="text-align:left;padding-left:6px;">Provider Name and Position Title</th>
              <th colspan="2">${WEEKDAY_NAMES[0]}</th>
              <th colspan="2">${WEEKDAY_NAMES[1]}</th>
              <th colspan="2">${WEEKDAY_NAMES[2]}</th>
              <th colspan="2">${WEEKDAY_NAMES[3]}</th>
              <th colspan="2">${WEEKDAY_NAMES[4]}</th>
              <th colspan="2">${WEEKDAY_NAMES[5]}</th>
              <th colspan="2">${WEEKDAY_NAMES[6]}</th>
            </tr>
            <tr>
              <th colspan="2" style="font-size:6.5pt;font-weight:normal;text-align:left;padding-left:6px;">In / Out</th>
              <th class="col-time">In</th><th class="col-time">Out</th>
              <th class="col-time">In</th><th class="col-time">Out</th>
              <th class="col-time">In</th><th class="col-time">Out</th>
              <th class="col-time">In</th><th class="col-time">Out</th>
              <th class="col-time">In</th><th class="col-time">Out</th>
              <th class="col-time">In</th><th class="col-time">Out</th>
              <th class="col-time">In</th><th class="col-time">Out</th>
            </tr>
          </thead>
          <tbody>
            ${staffRows.join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  const roomDisplay =
    report.classroomName && report.classroomName !== "all"
      ? report.classroomName
      : "All Classrooms";

  const reportSubtitle = isMainBook ? "Main Book" : `${roomDisplay} Room Tracker`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Daily Attendance Record — ${esc(roomDisplay)} (DCF-F-2438)</title>
  <style>
    ${dcfFormCss()}
  </style>
</head>
<body>
  <div class="dcf-page">
    <div class="brand-header">
      <img class="brand-logo" src="${esc(KOALA_MASCOT_URL)}" alt="${esc(APP_NAME)}" />
      <div class="brand-title">${esc(APP_NAME)} Attendance Record</div>
    </div>
    <div class="report-subtitle">${esc(reportSubtitle)}</div>

    <div class="top-bar">
      <div class="top-bar-left">DEPARTMENT OF CHILDREN AND FAMILIES<br>Division of Early Care and Education</div>
      <div class="top-bar-right">DCF-F-2438 (R. 02/2023)</div>
    </div>

    <div class="use-of-form-note">
      <strong>Use of form:</strong> Use of this form is voluntary. This form may be used by Family Child Care Centers to ensure compliance with DCF 250.04 (6) (b) and 250.05 (2) (c), by Group Child Care Centers to ensure compliance with DCF 251.04 (6) (b) and 251.05 (2) (a) 6., by Day Camps for Children to ensure compliance with DCF 252.41 (4) (c) and 252.42 (1) (a) 5., and by certified providers to ensure compliance with DCF 202.08 (5) (i) and 202.08 (5) (j). Personal information you provide may be used for secondary purposes [Privacy Law, s. 15.04(1)(m), Wisconsin Statutes]. Completion of this form may also help ensure compliance with the Child and Adult Care Food Program regulation 7 CFR 226.18 (e) and child care subsidy rules under DCF 201.04 (6).
      <br><strong>Instructions:</strong> The daily attendance record must be kept on file for the length of time the child is enrolled in the center for licensed centers and for at least 3 years for certified providers. Attendance records shall include all children in care, including the operator's / provider's own children under age 7. It is a requirement under Wis. Stat., 49.155 (6m) (b) to retain attendance records for at least 3 years after the child's last day of attendance.
    </div>

    <!-- SECTION A -->
    <div class="section-a-box">
      <div class="section-a-title">SECTION A – Facility and Timeframe:</div>
      <div class="section-a-fields">
        <div class="section-a-field" style="flex:1.8;">
          <span class="field-lbl">Name – Facility:</span>
          <span class="field-val"><strong>${esc(APP_NAME)}</strong>${roomDisplay ? ` (${esc(roomDisplay)})` : ""}</span>
        </div>
        <div class="section-a-field" style="flex:1;">
          <span class="field-lbl">Facility ID Number:</span>
          <span class="field-val"><strong>${esc(FACILITY_ID)}</strong></span>
        </div>
        <div class="section-a-field" style="flex:1.4;">
          <span class="field-lbl">Week of:</span>
          <span class="field-val"><strong>${esc(weekStartFmt)}</strong> through <strong>${esc(weekEndFmt)}</strong></span>
        </div>
      </div>
    </div>

    <!-- SECTION B -->
    <div class="section-banner">
      <span class="section-banner-title">SECTION B – Daily Attendance Record:</span>
      Enter the child's full name and date of birth for each child in attendance during the week. In the rows corresponding to the child's name, record the actual time the child arrives and the actual time the child departs, using a.m. / p.m. designations (do not record this information in advance). Times must be recorded immediately upon the child's arrival and departure, and the record must reflect all children in care at any given time. It is recommended that providers have the parents review this form for accuracy at the end of the week and sign the form as verification that it is correct.
    </div>
    ${sectionBTable}

    <!-- SECTION C (if included) -->
    ${sectionC}

    <!-- FOOTER & SIGNATURES -->
    <div class="dcf-sig-block">
      <div class="sig-field">
        <span style="font-weight:bold;">Staff / Director Signature:</span>
        <div class="sig-line"></div>
      </div>
      <div class="sig-field" style="max-width:200px;">
        <span style="font-weight:bold;">Date:</span>
        <div class="sig-line"></div>
      </div>
    </div>

    <div class="dcf-footer">
      <div>Wisconsin DCF-F-2438 Compliant Daily Attendance Record &nbsp;|&nbsp; Facility #${esc(FACILITY_ID)}</div>
      <div>Generated on: ${esc(stamp)}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Backward-compatible wrapper for Tracker reports.
 */
export function buildWeeklyDcfHtml(report: WeeklyDcfReport): string {
  return buildDcf2438Html({ report, isMainBook: false });
}

/**
 * Backward-compatible wrapper for Main Book reports.
 */
export function buildMainBookHtml(opts: { report: WeeklyDcfReport }): string {
  return buildDcf2438Html({ report: opts.report, isMainBook: true });
}
