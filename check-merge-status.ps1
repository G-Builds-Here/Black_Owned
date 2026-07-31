# Get all feature branches
$branches = git -C "C:/Users/Merlin/Documents/repos/Black_Owned" branch --no-merged epic/LOC-0030 | Where-Object { $_ -match "feature/LOC" } | ForEach-Object { $_.Trim().Replace("+ ", "").Trim() }

Write-Host "=== UNMERGED BRANCHES ==="
foreach ($branch in $branches) {
    Write-Host "$branch"
}

# Check each branch's latest commit against epic
Write-Host "`n=== CHECKING EACH BRANCH ==="
foreach ($branch in $branches) {
    $commit = git -C "C:/Users/Merlin/Documents/repos/Black_Owned" rev-parse "$branch" 2>$null
    $inEpic = git -C "C:/Users/Merlin/Documents/repos/Black_Owned" merge-base --is-ancestor $commit epic/LOC-0030 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "$branch - ALREADY IN EPIC (commit $commit)"
    } else {
        Write-Host "$branch - NOT IN EPIC (commit $commit)"
    }
}
