import json

with open("data/projects/tareno.json", "r") as f:
    data = json.load(f)

# Fix subagent outputPaths with real filenames
output_map = {
    "kb_retriever": ("01_research_tag01.md – KB-Pack Kontext (Top 30 Titel + Bullet-Insights)", "projects/blog-artifacts/tag01/01_research_tag01.md"),
    "research":     ("01_research_tag01.md – Search Intent, Audience, Patterns, Gaps, Differentiation Angles", "projects/blog-artifacts/tag01/01_research_tag01.md"),
    "outline":      ("02_outline_tag01.md – Article Blueprint mit [CORE]/[GAP]/[DIFF] H2-Tags", "projects/blog-artifacts/tag01/02_outline_tag01.md"),
    "writer":       ("03_draft_tag01.md – Longform Draft in Chunks", "projects/blog-artifacts/tag01/03_draft_tag01.md"),
    "product":      ("04_product_tag01.md – max. 3 Tareno Product Inserts", "projects/blog-artifacts/tag01/04_product_tag01.md"),
    "editor":       ("05_edited_tag01.md – bereinigtes, E-E-A-T-konformes Draft", "projects/blog-artifacts/tag01/05_edited_tag01.md"),
    "entity":       ("06_final_tag01.md – GEO-polierter finaler Draft", "projects/blog-artifacts/tag01/06_final_tag01.md"),
}

for sa in data.get("subagents", []):
    if sa["id"] in output_map:
        output_text, output_path = output_map[sa["id"]]
        sa["output"] = output_text
        sa["outputPath"] = output_path

# Fix dataRefs - add the real blog-artifact files
existing_paths = {r["path"] for r in data.get("dataRefs", [])}

new_refs = [
    {"label": "BLOG_ARTEFAKTE_INDEX", "path": "projects/blog-artifacts/TARENO_BLOG_ARTEFAKTE.md", "type": "md", "category": "Artefakte"},
    {"label": "Blog Artifacts – Index", "path": "projects/blog-artifacts/INDEX.md", "type": "md", "category": "Artefakte"},
    {"label": "TAG-01 🔄 Research", "path": "projects/blog-artifacts/tag01/01_research_tag01.md", "type": "md", "category": "Artefakt TAG-01"},
    {"label": "TAG-01 📚 Outline", "path": "projects/blog-artifacts/tag01/02_outline_tag01.md", "type": "md", "category": "Artefakt TAG-01"},
    {"label": "TAG-01 ✏️ Draft", "path": "projects/blog-artifacts/tag01/03_draft_tag01.md", "type": "md", "category": "Artefakt TAG-01"},
    {"label": "TAG-01 🏷️ Product Inserts", "path": "projects/blog-artifacts/tag01/04_product_tag01.md", "type": "md", "category": "Artefakt TAG-01"},
    {"label": "TAG-01 📘 Edited Draft", "path": "projects/blog-artifacts/tag01/05_edited_tag01.md", "type": "md", "category": "Artefakt TAG-01"},
    {"label": "TAG-01 ✨ Final", "path": "projects/blog-artifacts/tag01/06_final_tag01.md", "type": "md", "category": "Artefakt TAG-01", "status": "ready_for_publish"},
]

for ref in new_refs:
    if ref["path"] not in existing_paths:
        data["dataRefs"].append(ref)
        existing_paths.add(ref["path"])

with open("data/projects/tareno.json", "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Done! Fixed outputPaths and dataRefs.")
