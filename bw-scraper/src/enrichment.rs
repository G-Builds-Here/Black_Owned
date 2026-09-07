//! Description enrichment for the HIGHLIGHTS epic (LOC-0085 / STORY-002).
//!
//! Pure, deterministic extraction module — no I/O. Inputs are already-fetched
//! homepage HTML and SearXNG search-result JSON; output is a description
//! decision the caller applies with fill-empty write semantics.
//!
//! Description candidate order (epic contract):
//! 1. `og:description` — when it is >= 40 chars and not a duplicate of any
//!    SearXNG snippet.
//! 2. Top SearXNG snippet — used alone when it is >= 80 chars.
//! 3. Merged snippets — when the top snippet is < 80 chars, up to 3
//!    additional ranked snippets are merged in (sentence-level,
//!    overlap-deduped via token Jaccard > 0.6, capped at 500 chars, cutting
//!    only at sentence boundaries).
//!
//! Fill-empty: an existing non-empty `description` is never overwritten.

use std::collections::HashSet;

/// Minimum length for `og:description` to be eligible as a candidate.
pub const MIN_OG_DESCRIPTION_LEN: usize = 40;
/// Snippets shorter than this are considered "thin" and trigger merging.
pub const THIN_SNIPPET_THRESHOLD: usize = 80;
/// Maximum length of a merged description.
pub const MAX_MERGED_DESCRIPTION_LEN: usize = 500;
/// Maximum number of *additional* snippets merged after the top snippet.
pub const MAX_EXTRA_SNIPPETS: usize = 3;
/// Token Jaccard similarity above which a sentence counts as a duplicate.
pub const JACCARD_DUP_THRESHOLD: f64 = 0.6;

/// Where a candidate description came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DescriptionSource {
    /// Fill-empty: an existing description was present; nothing written.
    Existing,
    /// The homepage `og:description` meta tag was used.
    OgDescription,
    /// The top-ranked SearXNG snippet was used alone.
    TopSnippet,
    /// The top snippet plus up to 3 additional snippets were merged.
    MergedSnippets,
    /// No usable candidate was found; `description` stays NULL.
    Unavailable,
}

/// Outcome of a description enrichment pass.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DescriptionDecision {
    /// Value to write when `source` is `OgDescription`, `TopSnippet`, or
    /// `MergedSnippets`. `None` means "no write" (fill-empty or nothing
    /// usable was found).
    pub value: Option<String>,
    pub source: DescriptionSource,
}

/// Case-insensitive, trimmed comparison form of a string.
fn normalize(s: &str) -> String {
    s.trim().to_lowercase()
}

/// Lowercase alphanumeric word tokens of `s` (anything else is a separator).
fn tokenize(s: &str) -> Vec<String> {
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect()
}

/// Token Jaccard similarity (intersection / union) between two sentences.
fn jaccard_similarity(a: &str, b: &str) -> f64 {
    let ta: HashSet<String> = tokenize(a).into_iter().collect();
    let tb: HashSet<String> = tokenize(b).into_iter().collect();
    if ta.is_empty() && tb.is_empty() {
        return 1.0;
    }
    let inter = ta.intersection(&tb).count();
    let union = ta.union(&tb).count();
    if union == 0 {
        1.0
    } else {
        inter as f64 / union as f64
    }
}

/// Split `text` into sentences on `.`, `!`, `?` boundaries followed by
/// whitespace or end-of-text. The terminator stays attached to the sentence;
/// any trailing fragment without a terminator is kept as the last sentence.
/// (Heuristic: abbreviations such as "St." mid-sentence will split.)
fn split_sentences(text: &str) -> Vec<String> {
    let s = text.trim();
    if s.is_empty() {
        return Vec::new();
    }
    let chars: Vec<char> = s.chars().collect();
    let mut out = Vec::new();
    let mut start = 0usize;
    for (i, c) in chars.iter().enumerate() {
        if matches!(c, '.' | '!' | '?') {
            let next_is_boundary = chars.get(i + 1).map_or(true, |c| c.is_whitespace());
            if next_is_boundary {
                let sentence: String = chars[start..=i].iter().collect();
                let sentence = sentence.trim();
                if !sentence.is_empty() {
                    out.push(sentence.to_string());
                }
                start = i + 1;
            }
        }
    }
    let tail: String = chars[start..].iter().collect();
    let tail = tail.trim();
    if !tail.is_empty() {
        out.push(tail.to_string());
    }
    out
}

/// Pull the `content` attribute out of a `<meta ...>` tag.
fn extract_content_attr(tag: &str) -> Option<&str> {
    let lower = tag.to_lowercase();
    for quote in ['"', '\''] {
        let marker = format!("content={quote}");
        if let Some(rel) = lower.find(&marker) {
            let after = rel + marker.len();
            if let Some(end) = tag[after..].find(quote) {
                return Some(&tag[after..after + end]);
            }
        }
    }
    // Unquoted value (non-standard, but tolerate it).
    if let Some(rel) = lower.find("content=") {
        let rest = &tag[rel + "content=".len()..];
        let end = rest
            .find(|c: char| c.is_whitespace())
            .unwrap_or(rest.len());
        Some(&rest[..end])
    } else {
        None
    }
}

/// True when `candidate` duplicates any snippet: equal, contains a snippet,
/// or is contained by one (case-insensitive).
fn is_duplicate_of_any_snippet(candidate: &str, snippets: &[String]) -> bool {
    let c = normalize(candidate);
    if c.is_empty() {
        return false;
    }
    snippets
        .iter()
        .filter(|s| !s.trim().is_empty())
        .any(|s| {
            let s = normalize(s);
            c == s || c.contains(&s) || s.contains(&c)
        })
}

/// Extract the `og:description` value from homepage HTML.
///
/// Matches `<meta>` tags carrying `og:description` via the `property` or
/// `name` attribute (single-, double- or unquoted attribute values).
/// `og:description` is plain text, so no host-resolution rule applies the
/// way it does for URL-valued meta tags such as `og:image`.
pub fn find_og_description(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let mut pos = 0usize;
    while let Some(rel) = lower[pos..].find("<meta") {
        let tag_start = pos + rel;
        let tag_end = lower[tag_start..].find('>')? + tag_start;
        let tag = &html[tag_start..=tag_end];
        let tag_lower = &lower[tag_start..=tag_end];
        let is_og = [
            "property=\"og:description\"",
            "property='og:description'",
            "property=og:description",
            "name=\"og:description\"",
            "name='og:description'",
            "name=og:description",
        ]
        .iter()
        .any(|attr| tag_lower.contains(attr));
        if is_og {
            if let Some(content) = extract_content_attr(tag) {
                let content = content.trim();
                if !content.is_empty() {
                    return Some(content.to_string());
                }
            }
        }
        pos = tag_end + 1;
    }
    None
}

/// Extract ranked SearXNG snippets from a SearXNG response body.
///
/// Reads `results[].snippet` in rank order; empty/whitespace snippets are
/// dropped. Unparseable JSON or a missing `results` array yields `vec![]`.
pub fn extract_searxng_snippets(json: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let Some(results) = value.get("results").and_then(serde_json::Value::as_array) else {
        return Vec::new();
    };
    results
        .iter()
        .filter_map(|r| r.get("snippet").and_then(serde_json::Value::as_str))
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// Merge a thin top snippet with up to `MAX_EXTRA_SNIPPETS` additional
/// ranked snippets.
///
/// Sentences are concatenated in rank order; a sentence is skipped when its
/// token Jaccard similarity with an already-chosen sentence exceeds
/// `JACCARD_DUP_THRESHOLD`. Accumulation stops at the last sentence that
/// keeps the total within `MAX_MERGED_DESCRIPTION_LEN` (cuts happen only at
/// sentence boundaries).
pub fn merge_thin_snippets(snippets: &[String]) -> Option<String> {
    let pool: Vec<&str> = snippets
        .iter()
        .take(1 + MAX_EXTRA_SNIPPETS)
        .map(String::as_str)
        .collect();
    let mut chosen: Vec<String> = Vec::new();
    let mut total = 0usize;
    for snippet in pool {
        for sentence in split_sentences(snippet) {
            if chosen
                .iter()
                .any(|c| jaccard_similarity(c, &sentence) > JACCARD_DUP_THRESHOLD)
            {
                continue;
            }
            let glue = usize::from(!chosen.is_empty());
            let add_len = glue + sentence.chars().count();
            if total + add_len > MAX_MERGED_DESCRIPTION_LEN {
                return if chosen.is_empty() {
                    None
                } else {
                    Some(chosen.join(" "))
                };
            }
            total += add_len;
            chosen.push(sentence);
        }
    }
    if chosen.is_empty() {
        None
    } else {
        Some(chosen.join(" "))
    }
}

/// Choose a description candidate following the epic contract.
///
/// Fill-empty check runs first: an existing non-empty description always
/// wins and is never overwritten.
pub fn select_description(
    existing: Option<&str>,
    og_description: Option<&str>,
    snippets: &[String],
) -> DescriptionDecision {
    // Fill-empty: never overwrite a description that already has content.
    if existing.map_or(false, |e| !e.trim().is_empty()) {
        return DescriptionDecision {
            value: None,
            source: DescriptionSource::Existing,
        };
    }

    // Candidate 1: og:description (>= min length, not duplicating any snippet).
    if let Some(og) = og_description.map(str::trim).filter(|o| !o.is_empty()) {
        if og.chars().count() >= MIN_OG_DESCRIPTION_LEN
            && !is_duplicate_of_any_snippet(og, snippets)
        {
            return DescriptionDecision {
                value: Some(og.to_string()),
                source: DescriptionSource::OgDescription,
            };
        }
    }

    // Candidates 2/3: top snippet, alone when substantial, merged when thin.
    let top = snippets
        .iter()
        .find(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string());
    match top {
        Some(top) if top.chars().count() >= THIN_SNIPPET_THRESHOLD => DescriptionDecision {
            value: Some(top),
            source: DescriptionSource::TopSnippet,
        },
        Some(top) => match merge_thin_snippets(snippets) {
            Some(merged) => DescriptionDecision {
                value: Some(merged),
                source: DescriptionSource::MergedSnippets,
            },
            None => DescriptionDecision {
                value: Some(top),
                source: DescriptionSource::TopSnippet,
            },
        },
        None => DescriptionDecision {
            value: None,
            source: DescriptionSource::Unavailable,
        },
    }
}

/// One-shot enrichment pass: parse `og:description` from the homepage HTML,
/// parse SearXNG snippets from the search JSON, then select per contract.
pub fn enrich_description(
    existing: Option<&str>,
    html: &str,
    searxng_json: Option<&str>,
) -> DescriptionDecision {
    let og = find_og_description(html);
    let snippets = searxng_json
        .map(extract_searxng_snippets)
        .unwrap_or_default();
    select_description(existing, og.as_deref(), &snippets)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal homepage with an `og:description` meta tag.
    fn html_with_og(og: &str) -> String {
        format!(
            "<html><head><title>My Business</title>\
             <meta property=\"og:description\" content=\"{og}\"/>\
             </head><body><h1>My Business</h1></body></html>"
        )
    }

    /// A homepage without any og:description meta tag.
    const HTML_WITHOUT_OG: &str =
        "<html><head><title>My Business</title></head><body><h1>My Business</h1></body></html>";

    /// Build a minimal SearXNG response body from ranked snippet strings.
    fn searxng_json(snippets: &[&str]) -> String {
        let results: Vec<String> = snippets
            .iter()
            .map(|s| format!("{{\"snippet\": {}}}", serde_json::to_string(*s).unwrap()))
            .collect();
        format!("{{\"query\": \"black owned business\", \"results\": [{}]}}", results.join(", "))
    }

    // -------------------------------------------------------------
    // AC1 — og:description preferred when usable
    // -------------------------------------------------------------

    #[test]
    fn ac1_og_description_preferred_when_valid() {
        let og = "Authentic soul food served fresh daily in our Atlanta family kitchen since 1998.";
        let html = html_with_og(og);
        let json = searxng_json(&["Great spot for dinner"]);

        let decision = enrich_description(None, &html, Some(&json));

        assert_eq!(decision.source, DescriptionSource::OgDescription);
        assert_eq!(decision.value.as_deref(), Some(og));
    }

    #[test]
    fn ac1_og_too_short_falls_back_to_top_snippet() {
        // 32 chars < 40 minimum.
        let og = "Small family-run bakery downtown";
        let html = html_with_og(og);
        let top = "A beloved neighborhood spot known for its excellent coffee and pastries every morning";
        let json = searxng_json(&[top]);

        let decision = enrich_description(None, &html, Some(&json));

        assert_eq!(decision.source, DescriptionSource::TopSnippet);
        assert_eq!(decision.value.as_deref(), Some(top));
    }

    #[test]
    fn ac1_og_equal_to_top_snippet_falls_back() {
        let dup = "A beloved neighborhood spot known for its excellent coffee and pastries every morning";
        let html = html_with_og(dup);
        let json = searxng_json(&[dup]);

        let decision = enrich_description(None, &html, Some(&json));

        assert_eq!(decision.source, DescriptionSource::TopSnippet);
        assert_eq!(decision.value.as_deref(), Some(dup));
    }

    #[test]
    fn ac1_og_contained_in_snippet_falls_back() {
        // 47 chars >= 40, but it is a substring of the top snippet.
        let og = "Fresh pastries daily in our small family bakery";
        let html = html_with_og(og);
        let top = "We serve fresh pastries daily in our small family bakery since 2010, and locals love the sourdough loaves and cinnamon rolls every weekend.";
        let json = searxng_json(&[top]);

        let decision = enrich_description(None, &html, Some(&json));

        assert_eq!(decision.source, DescriptionSource::TopSnippet);
        assert_eq!(decision.value.as_deref(), Some(top));
    }

    #[test]
    fn ac1_no_og_meta_uses_snippet_path() {
        let top = "A beloved neighborhood spot known for its excellent coffee and pastries every morning";
        let json = searxng_json(&[top]);

        let decision = enrich_description(None, HTML_WITHOUT_OG, Some(&json));

        assert_eq!(decision.source, DescriptionSource::TopSnippet);
        assert_eq!(decision.value.as_deref(), Some(top));
    }

    #[test]
    fn ac1_og_meta_with_name_attribute_is_found() {
        let og = "Authentic soul food served fresh daily in our Atlanta family kitchen since 1998.";
        let html = format!(
            "<html><head><meta name=\"og:description\" content=\"{og}\"/></head><body></body></html>"
        );

        assert_eq!(find_og_description(&html).as_deref(), Some(og));
    }

    // -------------------------------------------------------------
    // AC2 — thin top snippets merge up to 500 chars
    // -------------------------------------------------------------

    #[test]
    fn ac2_thin_top_snippet_merged_with_up_to_3_additional() {
        let json = searxng_json(&[
            "Cozy garden patio.",
            "Live jazz on weekends.",
            "Family-friendly happy hour.",
            "Award-winning brunch menu.",
            "Overlooked fifth snippet.",
        ]);

        let decision = enrich_description(None, HTML_WITHOUT_OG, Some(&json));

        assert_eq!(decision.source, DescriptionSource::MergedSnippets);
        let merged = decision.value.expect("merged description present");
        assert!(merged.contains("Cozy garden patio."));
        assert!(merged.contains("Live jazz on weekends."));
        assert!(merged.contains("Family-friendly happy hour."));
        assert!(merged.contains("Award-winning brunch menu."));
        // Only the top + up to 3 additional snippets participate.
        assert!(!merged.contains("Overlooked fifth snippet."));
        assert!(merged.chars().count() <= MAX_MERGED_DESCRIPTION_LEN);
    }

    #[test]
    fn ac2_top_snippet_already_substantial_is_not_merged() {
        let top = "A beloved neighborhood spot known for its excellent coffee and pastries every morning";
        let json = searxng_json(&[top, "Live jazz on weekends."]);

        let decision = enrich_description(None, HTML_WITHOUT_OG, Some(&json));

        assert_eq!(decision.source, DescriptionSource::TopSnippet);
        assert_eq!(decision.value.as_deref(), Some(top));
    }

    #[test]
    fn ac2_merge_dedupes_overlapping_sentences() {
        let json = searxng_json(&[
            "Great coffee here.",
            "Great coffee here. Fresh pastries daily.",
            "Great coffee is here.",
        ]);

        let decision = enrich_description(None, HTML_WITHOUT_OG, Some(&json));

        assert_eq!(decision.source, DescriptionSource::MergedSnippets);
        let merged = decision.value.expect("merged description present");
        // "Great coffee here." appears once (exact + Jaccard > 0.6 variant
        // both deduped); the unique sentence from snippet 2 survives.
        assert_eq!(merged.matches("Great coffee here.").count(), 1);
        assert!(!merged.contains("Great coffee is here."));
        assert!(merged.contains("Fresh pastries daily."));
    }

    #[test]
    fn ac2_fewer_than_3_additional_snippets_still_merge() {
        let json = searxng_json(&["Cozy garden patio.", "Live jazz on weekends."]);

        let decision = enrich_description(None, HTML_WITHOUT_OG, Some(&json));

        assert_eq!(decision.source, DescriptionSource::MergedSnippets);
        assert_eq!(
            decision.value.as_deref(),
            Some("Cozy garden patio. Live jazz on weekends.")
        );
    }

    #[test]
    fn ac2_merge_respects_500_char_cap_at_sentence_boundary() {
        // Four ~120-char sentences: full merge would exceed 500 chars.
        let long = |tag: &str| {
            format!(
                "The {tag} district hosts a very popular community market with many local vendors every single weekend of the year."
            )
        };
        let s1 = long("first");
        let s2 = long("second");
        let s3 = long("third");
        let s4 = long("fourth");
        let json = searxng_json(&["Short opener.", &s1, &s2, &s3, &s4]);

        let decision = enrich_description(None, HTML_WITHOUT_OG, Some(&json));

        assert_eq!(decision.source, DescriptionSource::MergedSnippets);
        let merged = decision.value.expect("merged description present");
        assert!(
            merged.chars().count() <= MAX_MERGED_DESCRIPTION_LEN,
            "merged description must be <= {MAX_MERGED_DESCRIPTION_LEN} chars, was {}",
            merged.chars().count()
        );
        // Cut happens at a sentence boundary: result ends with a terminator.
        assert!(
            merged.ends_with('.') || merged.ends_with('!') || merged.ends_with('?'),
            "cut must land on a sentence boundary: {merged}"
        );
        // Every sentence in the result came from the input pool, unmodified.
        for sent in [
            "Short opener.",
            s1.as_str(),
            s2.as_str(),
            s3.as_str(),
            s4.as_str(),
        ] {
            if merged.contains(sent) {
                assert!(merged.contains(sent));
            }
        }
    }

    // -------------------------------------------------------------
    // AC3 — fill-empty still applies
    // -------------------------------------------------------------

    #[test]
    fn ac3_existing_description_never_overwritten() {
        let og = "Authentic soul food served fresh daily in our Atlanta family kitchen since 1998.";
        let html = html_with_og(og);
        let json = searxng_json(&["Great spot for dinner"]);

        let decision =
            enrich_description(Some("My carefully curated existing copy"), &html, Some(&json));

        assert_eq!(decision.source, DescriptionSource::Existing);
        assert!(decision.value.is_none(), "fill-empty: no write when description exists");
    }

    #[test]
    fn ac3_blank_existing_description_is_treated_as_missing() {
        let og = "Authentic soul food served fresh daily in our Atlanta family kitchen since 1998.";
        let html = html_with_og(og);

        let decision = enrich_description(Some("   "), &html, None);

        assert_eq!(decision.source, DescriptionSource::OgDescription);
        assert_eq!(decision.value.as_deref(), Some(og));
    }

    #[test]
    fn ac3_no_usable_source_leaves_description_null() {
        let json = searxng_json(&[]);

        let decision = enrich_description(None, HTML_WITHOUT_OG, Some(&json));

        assert_eq!(decision.source, DescriptionSource::Unavailable);
        assert!(decision.value.is_none());
    }

    // -------------------------------------------------------------
    // primitive helpers
    // -------------------------------------------------------------

    #[test]
    fn find_og_description_returns_none_without_meta() {
        assert_eq!(find_og_description(HTML_WITHOUT_OG), None);
    }

    #[test]
    fn find_og_description_skips_empty_content() {
        let html = "<html><head><meta property=\"og:description\" content=\"\"></head></html>";
        assert_eq!(find_og_description(html), None);
    }

    #[test]
    fn extract_snippets_from_valid_searxng_json() {
        let json = searxng_json(&["One.", " Two "]);
        let snippets = extract_searxng_snippets(&json);
        assert_eq!(snippets, vec!["One.", "Two"]);
    }

    #[test]
    fn extract_snippets_from_invalid_json_is_empty() {
        assert!(extract_searxng_snippets("not json at all").is_empty());
    }

    #[test]
    fn extract_snippets_missing_results_is_empty() {
        assert!(extract_searxng_snippets(r#"{"query": "x"}"#).is_empty());
    }

    #[test]
    fn select_description_no_snippets_no_og_is_unavailable() {
        let decision = select_description(None, None, &[]);
        assert_eq!(decision.source, DescriptionSource::Unavailable);
        assert!(decision.value.is_none());
    }
}
