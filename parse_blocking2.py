import json

with open('C:/Users/Merlin/.claude/projects/C--Users-Merlin-Documents-repos-Black-Owned/971d6a23-f6a1-4603-a222-5267e00dba15/tool-results/bsr0ns1q3.txt', 'r') as f:
    data = json.load(f)

print("=== Phase 4 Blocking Summary (After Merge) ===\n")
print(f"Merged ACs: {', '.join(data['acs_merged'])}\n")

for ac_id, ac_data in data['acs'].items():
    blocked_by = ac_data.get('blocked_by', [])
    dep_details = ac_data.get('dep_details', [])
    status = ac_data.get('status', 'unknown')
    dispatch_status = ac_data.get('dispatch_status', 'unknown')

    if blocked_by:
        print(f"{ac_id} (status: {status}):")
        for dep in dep_details:
            reason = dep.get('reason', dep.get('method', 'unknown'))
            print(f"  - Blocked by {dep['dep_ac']}: {reason}")
        print()
    else:
        print(f"{ac_id}: READY - {dispatch_status}")
