import json

with open('C:/Users/Merlin/.claude/projects/C--Users-Merlin-Documents-repos-Black-Owned/971d6a23-f6a1-4603-a222-5267e00dba15/tool-results/bch54tj7y.txt', 'r') as f:
    data = json.load(f)

print("=== Phase 4 Blocking Summary ===\n")

for ac_id, ac_data in data['acs'].items():
    blocked_by = ac_data.get('blocked_by', [])
    dep_details = ac_data.get('dep_details', [])

    if blocked_by:
        print(f"{ac_id}:")
        for dep in dep_details:
            print(f"  - Blocked by {dep['dep_ac']}: {dep['reason']}")
        print()
