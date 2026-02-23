import json
import pandas as pd
from datetime import datetime, timedelta

file_path = "redaktionsplan_v6_enriched.csv (1).xlsx"
df = pd.read_excel(file_path)

with open("data/projects/tareno.json", "r") as f:
    project_data = json.load(f)

# Create content pipeline
pipeline = []
start_date = datetime.now()

for i, row in df.iterrows():
    date_str = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
    item = {
        "day": f"Tag {i+1}",
        "date": date_str,
        "topic": str(row.get("Titel (Arbeitstitel)", "")),
        "keyword": str(row.get("Fokus-Keyword", "")),
        "author": str(row.get("Autor (Experte)", "")),
        "feature": str(row.get("Tareno Feature / Tool", "")),
        "cluster": str(row.get("Cluster", "")),
        "wordTarget": str(row.get("word_target", "")),
        "steps": {
            "content_research": { "status": "done" if i == 0 else "pending", "doc": f"{i+1:02d}_research.md" if i == 0 else None },
            "structure": { "status": "done" if i == 0 else "pending", "doc": f"{i+1:02d}_seo.md" if i == 0 else None },
            "drafting": { "status": "done" if i == 0 else "pending", "doc": f"{i+1:02d}_draft.md" if i == 0 else None },
            "feature_inserts": { "status": "done" if i == 0 else "pending", "doc": f"{i+1:02d}_product.md" if i == 0 else None },
            "editing": { "status": "review" if i == 0 else "pending", "doc": f"{i+1:02d}_edit.md" if i == 0 else None },
            "geo_polish": { "status": "pending", "doc": None },
            "final": { "status": "pending", "doc": None }
        }
    }
    
    # Just to create a realistic pipeline feeling:
    if i == 1:
        item["steps"]["content_research"]["status"] = "review"
        item["steps"]["content_research"]["doc"] = f"{i+1:02d}_research.md"

    pipeline.append(item)

project_data["contentPipeline"] = pipeline

# Also update the blogPipeline summary to match the 68 items
project_data["blogPipeline"]["totalBlogs"] = len(df)
project_data["blogPipeline"]["completed"] = 0
project_data["blogPipeline"]["planned"] = len(df) - 1
project_data["blogPipeline"]["inProgress"] = 1

# Limit to first 10 for the blog pipeline overview to not blow up that table too much
# or just keep it simple
blogs = []
for i, row in df.head(10).iterrows():
    blogs.append({
        "id": f"TAG-{i+1:02d}",
        "title": str(row.get("Titel (Arbeitstitel)", "")),
        "status": "planned" if i > 0 else "in_progress",
        "progress": 0 if i > 0 else 80,
        "stepsCompleted": 0 if i > 0 else 5,
        "stepsTotal": 7
    })
project_data["blogPipeline"]["blogs"] = blogs

with open("data/projects/tareno.json", "w") as f:
    json.dump(project_data, f, indent=2)

print("tareno.json successfully updated with Excel data.")
