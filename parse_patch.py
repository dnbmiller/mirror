import re
import sys

def parse_patch(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_file = None
    hunk_start = 0

    for line in lines:
        if line.startswith('+++ b/'):
            current_file = line[6:].strip()
            print(f"\n--- FILE: {current_file} ---")
        elif line.startswith('@@'):
            m = re.match(r'@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@', line)
            if m:
                hunk_start = int(m.group(1))
                print(f"[{hunk_start}] {line.strip()}")
        elif current_file and (line.startswith('+') or line.startswith('-') or line.startswith(' ')):
            if not line.startswith('+++') and not line.startswith('---'):
                prefix = line[0]
                content = line[1:].rstrip('\n')
                if prefix == '+':
                    print(f"{hunk_start}: + {content}")
                    hunk_start += 1
                elif prefix == ' ':
                    print(f"{hunk_start}:   {content}")
                    hunk_start += 1
                elif prefix == '-':
                    print(f"     - {content}")

parse_patch('pr_522.patch')
