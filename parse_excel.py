import pandas as pd
import json

file_path = "redaktionsplan_v6_enriched.csv (1).xlsx"
df = pd.read_excel(file_path)

print("Columns:")
print(df.columns.tolist())
print("\nFirst 3 rows:")
print(df.head(3).to_dict(orient='records'))
