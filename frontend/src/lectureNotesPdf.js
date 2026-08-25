import { jsPDF } from "jspdf";

// Brand colors — matches the app's purple/indigo gradient identity.
const PURPLE = [124, 58, 237];   // #7C3AED
const INDIGO = [67, 56, 202];    // #4338CA
const INK    = [31, 31, 41];
const MUTED  = [107, 114, 128];
const LIGHT  = [245, 243, 255];

const PAGE_W = 210, PAGE_H = 297, MARGIN = 20, CONTENT_W = PAGE_W - MARGIN * 2;

function addFooter(doc, pageNum) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text("SEMAI \u00b7 SayMyTech Developers", MARGIN, PAGE_H - 10);
  doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
}

// Writes wrapped body text starting at cursor.y, auto-paginating (with header/footer)
// whenever content would run off the page. Returns the updated cursor.
function writeParagraph(doc, text, cursor, opts = {}) {
  const { size = 10.5, color = INK, lineHeight = 5.6, spacingAfter = 4, newPage } = opts;
  doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, CONTENT_W);
  for (const line of lines) {
    if (cursor.y > PAGE_H - 26) {
      addFooter(doc, cursor.page);
      doc.addPage();
      cursor.page += 1; cursor.y = MARGIN;
      newPage?.(cursor);
    }
    doc.text(line, MARGIN, cursor.y);
    cursor.y += lineHeight;
  }
  cursor.y += spacingAfter;
  return cursor;
}

function writeHeading(doc, text, cursor) {
  if (cursor.y > PAGE_H - 36) {
    addFooter(doc, cursor.page);
    doc.addPage();
    cursor.page += 1; cursor.y = MARGIN;
  }
  doc.setFillColor(...LIGHT);
  doc.roundedRect(MARGIN - 3, cursor.y - 5.5, CONTENT_W + 6, 9, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(...PURPLE);
  doc.text(text, MARGIN, cursor.y);
  cursor.y += 10;
  return cursor;
}

// notes: { introduction, sections: [{title, notes}], summary, keyTakeaways: [] }
export function downloadLectureNotesPdf({ course, mod, notes, studentName }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cursor = { y: MARGIN, page: 1 };

  // ── Branded cover header ──────────────────────────────────────────────
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, PAGE_W, 48, "F");
  doc.setFillColor(...PURPLE);
  doc.circle(MARGIN + 8, 20, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
  doc.text("S", MARGIN + 8, 23, { align: "center" });

  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(255, 255, 255);
  doc.text("SEMAI", MARGIN + 20, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(220, 210, 255);
  doc.text("AI LECTURER \u00b7 LECTURE NOTES", MARGIN + 20, 24);

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
  doc.text(mod.title, MARGIN, 40);

  cursor.y = 58;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
  const metaLine = [course.title, course.institution, studentName ? `Prepared for ${studentName}` : "", new Date().toLocaleDateString()]
    .filter(Boolean).join("  \u00b7  ");
  doc.text(metaLine, MARGIN, cursor.y);
  cursor.y += 10;

  // ── Introduction ──────────────────────────────────────────────────────
  if (notes.introduction) {
    writeParagraph(doc, notes.introduction, cursor, { size: 10.5, color: INK, spacingAfter: 6 });
  }

  // ── Sections (one per slide taught) ──────────────────────────────────
  for (const section of notes.sections || []) {
    writeHeading(doc, section.title, cursor);
    writeParagraph(doc, section.notes, cursor, { spacingAfter: 5 });
  }

  // ── Hands-on note, if this module had one ────────────────────────────
  if (mod.practicalType !== "none" && mod.practicalNote) {
    writeHeading(doc, mod.practicalType === "code" ? "Hands-On: Code Walkthrough" : "Hands-On: Worked Example", cursor);
    writeParagraph(doc, mod.practicalNote, cursor, { spacingAfter: 5 });
  }

  // ── Summary ───────────────────────────────────────────────────────────
  if (notes.summary) {
    writeHeading(doc, "Summary", cursor);
    writeParagraph(doc, notes.summary, cursor, { spacingAfter: 5 });
  }

  // ── Key takeaways ─────────────────────────────────────────────────────
  if (notes.keyTakeaways?.length) {
    writeHeading(doc, "Key Takeaways", cursor);
    for (const t of notes.keyTakeaways) {
      if (cursor.y > PAGE_H - 26) { addFooter(doc, cursor.page); doc.addPage(); cursor.page += 1; cursor.y = MARGIN; }
      doc.setFillColor(...PURPLE); doc.circle(MARGIN + 1.5, cursor.y - 1.5, 1.3, "F");
      const lines = doc.splitTextToSize(t, CONTENT_W - 8);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...INK);
      doc.text(lines, MARGIN + 6, cursor.y);
      cursor.y += lines.length * 5.6 + 2.5;
    }
  }

  addFooter(doc, cursor.page);

  const safe = (s) => (s || "notes").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  doc.save(`SEMAI-notes-${safe(mod.title)}.pdf`);
}
