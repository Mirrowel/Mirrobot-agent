import json
import sys
from pathlib import Path

CUSTOM_PROVIDERS_FILENAME = Path(__file__).parent / "custom_providers.json"

def minify_json_file(file_path: Path):
    if not file_path.is_file():
        print(f"Error: File not found at '{file_path}'")
        sys.exit(1)
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        minified_json = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
        print("✅ JSON is valid.")
        print("\nCopy the following single-line string and paste it into your GitHub secret:\n")
        print(minified_json)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in '{file_path}'.\nDetails: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) == 1:
        # No argument provided, use the default file
        input_file = CUSTOM_PROVIDERS_FILENAME
        print(f"No argument provided, using default file: {input_file}")
    elif len(sys.argv) == 2:
        input_file = Path(sys.argv[1])
    else:
        print("Usage: python minify_json_secret.py [path_to_your_json_file]")
        print("If no path is provided, will use: custom_providers.json")
        sys.exit(1)
    minify_json_file(input_file)