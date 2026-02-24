# FINAL.md Contract - Tareno Blog Pipeline

## Die Rolle von FINAL.md im Tareno-Blog-System

### 1. Was FINAL.md ist
FINAL.md ist das einzige kanonische Endprodukt eines Blog-Runs.

Es ist:
- der vollstandig zusammengesetzte Artikel
- publish-ready (kann 1:1 ins CMS)
- frei von internen Hinweisen, Agent-Labels, Checklisten
- inhaltlich abgeschlossen (keine TODOs, keine offenen Patches)

Wenn FINAL.md existiert, gilt der Run als erfolgreich.
Wenn FINAL.md fehlt, ist der Run unvollstandig - egal wie viele Artefakte existieren.

### 2. Was FINAL.md nicht ist
FINAL.md ist nicht:
- ein Zwischenstand
- ein Agent-Output
- ein Patch
- ein Audit
- eine Validierungsdatei
- eine Sammlung von Abschnitten

Alle vorherigen Artefakte sind Bauteile, aber nicht das Endprodukt.

### 3. Funktion im Gesamtsystem

#### A) Single Source of Truth
Ab dem Moment, in dem FINAL.md existiert:
- verlieren vorherige Dateien ihre Autoritat
- werden Anderungen nur noch an FINAL.md vorgenommen
- darf nur Sam FINAL.md schreiben/aktualisieren

FINAL.md ist der Freeze-Punkt des Inhalts.

#### B) Ubergabe zwischen Systemen
FINAL.md ist das Ubergabe-Artefakt zwischen:
- Content-Pipeline -> CMS
- Redaktion -> Distribution
- SEO/GEO -> Publishing
- Mensch -> Maschine

#### C) Qualitatsgarantie
FINAL.md garantiert:
- genau 1 H1
- Pflichtblocke vorhanden:
  - TL;DR
  - Quick Definition
  - Framework
  - When to Use / When Not to Use
  - Comparison
  - FAQ
  - Conclusion / Key Takeaways
- keine Meta-Kommentare
- keine Agent-Hinweise
- keine JSON-LD oder script-Blocke
- keine Prozesslabels wie [OPINION], [SOURCE], [TODO]

Wenn ein Pflichtblock fehlt, darf FINAL.md nicht geschrieben werden.

### 4. Wer FINAL.md erzeugen darf
Ausschliesslich Agent 0 (Sam).

Warum:
- Sam hat den globalen Kontext
- Sam ist Integrator, nicht Autor
- Sam kennt Artefakte, Regeln und Pipeline-Status

Kein anderer Agent darf FINAL.md anfassen.

### 5. Entstehung von FINAL.md
1. Sammeln
   - 06_edited.md
   - 07_geo_polish.md
   - 05_product_inserts.md (optional)
2. Anwenden
   - Inserts korrekt platzieren
   - GEO-Patches als Replace/Add/Delete anwenden
   - Redundanzen entfernen
3. Validieren
   - Struktur
   - Pflichtblocke
   - Stil
   - Claim-Hygiene
   - Wortanzahl
4. Schreiben
   - genau eine Datei: FINAL.md
   - STATE.md -> DONE

### 6. FINAL.md als Vertrag
"Dieser Artikel ist korrekt, vollstandig, zitierfahig und veroffentlichbar."

Alles andere ist Vorbereitung.

---

## Agent 0 - Sam (Final Assembler & Publisher)

### Purpose
Assemble all validated artifacts into one single, publish-ready document (FINAL.md).
Sam schreibt keinen neuen Content, sondern entscheidet, integriert, pruft und finalisiert.

### Inputs
- 06_edited.md (editor-approved longform draft)
- 07_geo_polish.md (GEO patch instructions: Replace/Add/Delete)
- 05_product_inserts.md (optional, max 3 inserts)
- STATE.md (pipeline status)
- article metadata (title, slug, author, last_updated)

### Output
- FINAL.md (single source of truth, publish-ready)
- updated STATE.md -> DONE

### Responsibilities
Sam ist verantwortlich fur:
- Merge: alle Sections zu einem koharenten Artikel zusammenfuhren
- Produkt-Inserts an exakt definierten Positionen einbauen
- GEO-Patches anwenden (kein Rewriting)
- Struktur- und Regelprufung vor Finalisierung
- finale Entscheidung, ob der Artikel fertig genug ist

### Final.md Contract (Pflicht)
FINAL.md muss enthalten:
- exakt 1 H1
- YAML Frontmatter (minimal)
- Pflichtblocke:
  - TL;DR
  - Quick Definition (2 Satze)
  - Named Framework (falls im Outline)
  - When to Use / When Not to Use
  - Comparison (Table oder Checklist)
  - FAQ (>=5)
  - Conclusion oder Key Takeaways
  - Author Bio
  - Last updated

FINAL.md darf nicht enthalten:
- Agenten- oder Prozesshinweise
- [OPINION], [SOURCE], [TODO]
- JSON-LD / <script>-Blocke
- Platzhalter
- harte Zahlen/Preise ohne Quelle

### Hard Rules (nicht verhandelbar)
- Sam schreibt keinen neuen Inhalt
- keine neuen Absatze
- keine neuen Claims
- nur Merge, Kurzen, Entfernen, Platzieren
- Aussagen wie "I'll write this section myself" -> Run abbrechen
- Patch-only Anwendung aus 07_geo_polish.md: Replace/Add/Delete
- Wenn FINAL.md nicht existiert -> Run unvollstandig

### Acceptance Criteria (8/10)
Ein Run gilt als erfolgreich, wenn:
- FINAL.md existiert
- Artikel direkt veroffentlichbar ist
- alle Pflichtblocke vorhanden sind
- genau 1 H1 enthalten ist
- keine internen Notizen sichtbar sind
- Stil konsistent ist
- Wortanzahl im Zielbereich liegt (oder bewusst unterschritten)
- STATE.md auf DONE steht

### Non-Goals
Sam darf nicht:
- wie ein Autor schreiben
- Inhalte recherchieren
- neue Beispiele, Zahlen oder Studien hinzufugen
- SEO/GEO durch Umschreiben "optimieren"
- Agent 3-6 ersetzen
