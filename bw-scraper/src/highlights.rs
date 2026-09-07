//! Category highlight extraction for the HIGHLIGHTS epic (LOC-0086 / STORY-003).
//!
//! Pure, deterministic extraction module — no I/O. Inputs are a category slug
//! and the already-extracted corpus zones; output is a [`HighlightsDecision`]
//! the caller applies with fill-empty write semantics (a `None` value means
//! "no write" — the `highlights` column stays NULL).
//!
//! Epic contract:
//! - `highlights` = JSONB `string[]`, at most [`MAX_HIGHLIGHT_ENTRIES`]
//!   entries, each at most [`MAX_HIGHLIGHT_LEN`] chars, deduped.
//! - Match rule: word-boundary match per dictionary term (case-insensitive;
//!   "live music" does not match "lively musician"). Prominent-zone
//!   occurrences (nav, h1–h3, meta, SearXNG titles) weigh
//!   [`WEIGHT_PROMINENT`]; body-zone occurrences (SearXNG snippets, body
//!   text, place-JSON description) weigh [`WEIGHT_BODY`]. A term qualifies
//!   when its total weight is at least [`MIN_QUALIFYING_WEIGHT`] OR it has
//!   any occurrence in a prominent zone. Top-5 by weight; display casing is
//!   taken from the term's first occurrence in corpus scan order.
//! - Category dictionaries are committed data in
//!   `highlights/dictionaries.json`, loaded via `include_str!` at compile
//!   time. A category without a v1 dictionary yields no entries and no
//!   error.

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

/// Maximum number of highlight entries emitted per business.
pub const MAX_HIGHLIGHT_ENTRIES: usize = 5;
/// Maximum character length of a single highlight entry.
pub const MAX_HIGHLIGHT_LEN: usize = 80;
/// Weight for one occurrence in a prominent zone (nav / h1–h3 / meta / titles).
pub const WEIGHT_PROMINENT: u32 = 3;
/// Weight for one occurrence in a body zone (snippets / body / place description).
pub const WEIGHT_BODY: u32 = 1;
/// Minimum total weight for a term with no prominent-zone occurrence to qualify.
pub const MIN_QUALIFYING_WEIGHT: u32 = 2;
/// Per-business report note used when no highlights were found.
pub const NO_HIGHLIGHTS_NOTE: &str = "no highlights found";

/// Already-extracted text zones of one business corpus.
///
/// Zone weights: `nav`, `headings`, `meta`, `titles` are prominent
/// (3x); `snippets`, `body` are body (1x). Corpus scan order for
/// first-occurrence casing: nav, headings, meta, titles, snippets, body.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Corpus {
    /// Nav link texts.
    pub nav: Vec<String>,
    /// h1–h3 heading texts.
    pub headings: Vec<String>,
    /// Meta description / og:description values.
    pub meta: Vec<String>,
    /// SearXNG result titles.
    pub titles: Vec<String>,
    /// SearXNG result snippets.
    pub snippets: Vec<String>,
    /// Body text and place-JSON description.
    pub body: Vec<String>,
}

/// Outcome of a highlight extraction pass.
///
/// Mirrors `enrichment::DescriptionDecision`: `value: None` means the caller
/// performs no write (the `highlights` column stays NULL); `note` is the
/// per-business report line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HighlightsDecision {
    /// Entries to write as a JSONB `string[]`, or `None` for no write (zero
    /// matches, or a category without a v1 dictionary).
    pub value: Option<Vec<String>>,
    /// Per-business report note; [`NO_HIGHLIGHTS_NOTE`] when `value` is `None`.
    pub note: String,
}

/// A dictionary term that qualified for highlight inclusion.
struct Candidate {
    weight: u32,
    /// Dictionary index — deterministic tie-break for equal weights.
    order: usize,
    /// Display string: the term's first occurrence in the corpus, original
    /// casing.
    display: String,
}

/// Case-insensitive, trimmed comparison form of a string.
fn normalize(s: &str) -> String {
    s.trim().to_lowercase()
}

/// Truncate `s` to at most `max` chars (Unicode-safe — counts chars, not bytes).
fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect()
    }
}

/// Case-insensitive word-boundary matches of `needle` in `haystack`.
///
/// Returns the matched spans in original casing, in order of occurrence. A
/// match qualifies only when the char immediately before and the char
/// immediately after the match are both non-alphanumeric (or absent) — the
/// `\b` equivalent, so "soul food" does not match "soulful" and "live music"
/// does not match "lively musician". Dictionary terms are ASCII phrases, so
/// comparison is plain ASCII lowercasing.
fn word_boundary_matches(haystack: &str, needle: &str) -> Vec<String> {
    let needle_chars: Vec<char> = needle.to_lowercase().chars().collect();
    if needle_chars.is_empty() {
        return Vec::new();
    }
    let hay_chars: Vec<char> = haystack.chars().collect();
    let hay_lower: Vec<char> = hay_chars.iter().map(|c| c.to_ascii_lowercase()).collect();
    let mut out = Vec::new();
    let n = needle_chars.len();
    let h = hay_chars.len();
    if n > h {
        return out;
    }
    let mut i = 0usize;
    while i + n <= h {
        let matched = (0..n).all(|k| hay_lower[i + k] == needle_chars[k]);
        if matched {
            let before_ok = i == 0 || !hay_chars[i - 1].is_alphanumeric();
            let after = i + n;
            let after_ok = after == h || !hay_chars[after].is_alphanumeric();
            if before_ok && after_ok {
                let span: String = hay_chars[i..i + n].iter().collect();
                out.push(span);
                i += n;
            } else {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    out
}

/// Committed v1 category dictionaries, parsed once from the JSON fixture.
///
/// An unparseable fixture degrades to an empty map (no entries, no error)
/// rather than panicking mid-run; in practice a broken fixture fails at
/// compile time only via CI review — `include_str!` guarantees the file
/// exists.
fn dictionaries() -> &'static HashMap<String, Vec<String>> {
    static DICTS: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
    DICTS.get_or_init(|| {
        const RAW: &str = include_str!("highlights/dictionaries.json");
        serde_json::from_str::<HashMap<String, Vec<String>>>(RAW).unwrap_or_default()
    })
}

/// Dictionary terms for `category_slug`, or `None` when the category has no
/// v1 dictionary.
pub fn terms_for_category(category_slug: &str) -> Option<&'static [String]> {
    dictionaries().get(category_slug).map(|v| v.as_slice())
}

/// Extract highlight entries for one business, per the epic contract.
///
/// Pure: given the same `category_slug` and `corpus` the result is always
/// the same. `value: None` means "no write" — the caller leaves
/// `highlights` NULL; `note` carries the per-business report line.
pub fn extract_highlights(category_slug: &str, corpus: &Corpus) -> HighlightsDecision {
    let Some(terms) = terms_for_category(category_slug) else {
        // Unknown category: no v1 dictionary — no entries, no error.
        return HighlightsDecision {
            value: None,
            note: NO_HIGHLIGHTS_NOTE.to_string(),
        };
    };

    let prominent_zones: [&[String]; 4] = [
        &corpus.nav,
        &corpus.headings,
        &corpus.meta,
        &corpus.titles,
    ];
    let body_zones: [&[String]; 2] = [&corpus.snippets, &corpus.body];

    let mut candidates: Vec<Candidate> = Vec::new();
    for (order, term) in terms.iter().enumerate() {
        let mut prominent_hits: u32 = 0;
        let mut body_hits: u32 = 0;
        let mut first_display: Option<String> = None;

        for zone in &prominent_zones {
            for text in zone.iter() {
                let hits = word_boundary_matches(text, term);
                if !hits.is_empty() {
                    prominent_hits += hits.len() as u32;
                    first_display.get_or_insert_with(|| hits[0].clone());
                }
            }
        }
        for zone in &body_zones {
            for text in zone.iter() {
                let hits = word_boundary_matches(text, term);
                if !hits.is_empty() {
                    body_hits += hits.len() as u32;
                    first_display.get_or_insert_with(|| hits[0].clone());
                }
            }
        }

        let weight = prominent_hits * WEIGHT_PROMINENT + body_hits * WEIGHT_BODY;
        let qualifies = prominent_hits > 0 || weight >= MIN_QUALIFYING_WEIGHT;
        if qualifies {
            candidates.push(Candidate {
                weight,
                order,
                display: first_display.unwrap_or_else(|| term.clone()),
            });
        }
    }

    // Rank: weight descending; dictionary order breaks ties deterministically.
    candidates
        .sort_by(|a, b| b.weight.cmp(&a.weight).then(a.order.cmp(&b.order)));

    // Dedup by normalized display (case-insensitive), keeping the
    // highest-ranked occurrence, then cap the entry count.
    let mut seen: HashSet<String> = HashSet::new();
    let mut entries: Vec<String> = Vec::new();
    for c in candidates {
        if seen.insert(normalize(&c.display)) {
            entries.push(truncate_chars(&c.display, MAX_HIGHLIGHT_LEN));
        }
        if entries.len() == MAX_HIGHLIGHT_ENTRIES {
            break;
        }
    }

    if entries.is_empty() {
        HighlightsDecision {
            value: None,
            note: NO_HIGHLIGHTS_NOTE.to_string(),
        }
    } else {
        let note = format!("{} highlights found", entries.len());
        HighlightsDecision {
            value: Some(entries),
            note,
        }
    }
}

// ---------------------------------------------------------------------------
// Corpus zone extraction — pure string parsing, mirrors enrichment.rs helpers
// ---------------------------------------------------------------------------

/// ASCII-lowercased copy of `chars` (tag matching only; content is never
/// lowercased).
fn lower_chars(chars: &[char]) -> Vec<char> {
    chars.iter().map(|c| c.to_ascii_lowercase()).collect()
}

/// Char-index ranges of the inner content of every `<tag ...>...</tag>`
/// block in `chars`. Untagged or unterminated blocks are skipped.
fn inner_ranges(chars: &[char], tag: &str) -> Vec<(usize, usize)> {
    let lower = lower_chars(chars);
    let open: Vec<char> = format!("<{tag}").chars().collect();
    let close: Vec<char> = format!("</{tag}>").chars().collect();
    let mut out = Vec::new();
    let mut pos = 0usize;
    while pos + open.len() <= lower.len() {
        if !(0..open.len()).all(|k| lower[pos + k] == open[k]) {
            pos += 1;
            continue;
        }
        // `<h1x` is not an `<h1` tag — the char after the tag name must
        // delimit it.
        let boundary_ok = matches!(
            lower.get(pos + open.len()),
            Some('>' | ' ' | '\t' | '\n' | '\r' | '/')
        );
        if !boundary_ok {
            pos += 1;
            continue;
        }
        let Some(gt_rel) = lower[pos..].iter().position(|c| *c == '>') else {
            break;
        };
        let inner_start = pos + gt_rel + 1;
        let close_rel = lower[inner_start..]
            .windows(close.len())
            .position(|w| w == close.as_slice());
        match close_rel {
            Some(cs) => {
                let inner_end = inner_start + cs;
                out.push((inner_start, inner_end));
                pos = inner_end + close.len();
            }
            None => break,
        }
    }
    out
}

/// Decode the common HTML entities that appear in extracted text.
fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

/// Remove markup tags from `s`, keeping visible text.
fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    decode_entities(&out)
}

/// Collapse all whitespace runs to single spaces and trim.
fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Text of every h1/h2/h3 block, in document order, tags stripped and
/// whitespace collapsed.
pub fn extract_headings(html: &str) -> Vec<String> {
    let chars: Vec<char> = html.chars().collect();
    let mut spans: Vec<(usize, usize)> = Vec::new();
    for tag in ["h1", "h2", "h3"] {
        spans.extend(inner_ranges(&chars, tag));
    }
    spans.sort_by_key(|&(a, _)| a);
    spans
        .into_iter()
        .map(|(a, b)| {
            let text: String = chars[a..b].iter().collect();
            collapse_ws(&strip_tags(&text))
        })
        .filter(|s| !s.is_empty())
        .collect()
}

/// Nav link texts: `<a>` contents inside every `<nav>` block.
pub fn extract_nav_links(html: &str) -> Vec<String> {
    let chars: Vec<char> = html.chars().collect();
    let mut out = Vec::new();
    for (na, nb) in inner_ranges(&chars, "nav") {
        let nav_chars: Vec<char> = chars[na..nb].to_vec();
        for (la, lb) in inner_ranges(&nav_chars, "a") {
            let text: String = nav_chars[la..lb].iter().collect();
            let clean = collapse_ws(&strip_tags(&text));
            if !clean.is_empty() {
                out.push(clean);
            }
        }
    }
    out
}

/// Pull the `content` attribute out of a `<meta ...>` tag.
fn extract_content_attr(tag: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    for quote in ['"', '\''] {
        let marker = format!("content={quote}");
        if let Some(rel) = lower.find(&marker) {
            let after = rel + marker.len();
            if let Some(end) = tag[after..].find(quote) {
                return Some(tag[after..after + end].to_string());
            }
        }
    }
    None
}

/// `og:description` and `name="description"` meta values, in document order.
pub fn extract_meta_descriptions(html: &str) -> Vec<String> {
    let lower = html.to_lowercase();
    let mut out = Vec::new();
    let mut pos = 0usize;
    while let Some(rel) = lower[pos..].find("<meta") {
        let tag_start = pos + rel;
        let Some(gt_rel) = lower[tag_start..].find('>') else {
            break;
        };
        let tag = &html[tag_start..tag_start + gt_rel + 1];
        let tag_lower = &lower[tag_start..tag_start + gt_rel + 1];
        let is_description = tag_lower.contains("og:description")
            || tag_lower.contains("name=\"description\"")
            || tag_lower.contains("name='description'")
            || tag_lower.contains("name=description");
        if is_description {
            if let Some(content) = extract_content_attr(tag) {
                let content = content.trim();
                if !content.is_empty() {
                    out.push(decode_entities(content).to_string());
                }
            }
        }
        pos = tag_start + gt_rel + 1;
    }
    out
}

/// Visible text of the `<body>` block: tags stripped, whitespace collapsed.
/// Falls back to the whole document when no `<body>` tag is present.
pub fn extract_body_text(html: &str) -> String {
    let chars: Vec<char> = html.chars().collect();
    let text = match inner_ranges(&chars, "body").first() {
        Some(&(a, b)) => chars[a..b].iter().collect::<String>(),
        None => chars.iter().collect::<String>(),
    };
    collapse_ws(&strip_tags(&text))
}

/// Ranked (titles, snippets) from a SearXNG response body.
///
/// Unparseable JSON or a missing `results` array yields empty vectors.
pub fn extract_searxng_titles_and_snippets(json: &str) -> (Vec<String>, Vec<String>) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return (Vec::new(), Vec::new());
    };
    let Some(results) = value.get("results").and_then(serde_json::Value::as_array) else {
        return (Vec::new(), Vec::new());
    };
    let mut titles = Vec::new();
    let mut snippets = Vec::new();
    for r in results {
        if let Some(t) = r.get("title").and_then(serde_json::Value::as_str) {
            let t = t.trim();
            if !t.is_empty() {
                titles.push(t.to_string());
            }
        }
        if let Some(s) = r.get("snippet").and_then(serde_json::Value::as_str) {
            let s = s.trim();
            if !s.is_empty() {
                snippets.push(s.to_string());
            }
        }
    }
    (titles, snippets)
}

/// Build the corpus zones from homepage HTML, an optional SearXNG response,
/// and an optional place-JSON description (appended to the body zone).
pub fn parse_corpus(
    html: &str,
    searxng_json: Option<&str>,
    place_description: Option<&str>,
) -> Corpus {
    let (titles, snippets) = searxng_json
        .map(extract_searxng_titles_and_snippets)
        .unwrap_or_default();
    let mut body = Vec::new();
    let body_text = extract_body_text(html);
    if !body_text.is_empty() {
        body.push(body_text);
    }
    if let Some(p) = place_description.map(str::trim).filter(|s| !s.is_empty()) {
        body.push(p.to_string());
    }
    Corpus {
        nav: extract_nav_links(html),
        headings: extract_headings(html),
        meta: extract_meta_descriptions(html),
        titles,
        snippets,
        body,
    }
}

/// One-shot highlight pass: parse the corpus zones, then extract per the
/// epic contract. Mirrors `enrichment::enrich_description`.
pub fn enrich_highlights(
    category_slug: &str,
    html: &str,
    searxng_json: Option<&str>,
    place_description: Option<&str>,
) -> HighlightsDecision {
    let corpus = parse_corpus(html, searxng_json, place_description);
    extract_highlights(category_slug, &corpus)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a [`Corpus`] from fixture strings, zone by zone.
    fn corpus(
        nav: &[&str],
        headings: &[&str],
        meta: &[&str],
        titles: &[&str],
        snippets: &[&str],
        body: &[&str],
    ) -> Corpus {
        let v = |xs: &[&str]| xs.iter().map(|s| s.to_string()).collect();
        Corpus {
            nav: v(nav),
            headings: v(headings),
            meta: v(meta),
            titles: v(titles),
            snippets: v(snippets),
            body: v(body),
        }
    }

    // -------------------------------------------------------------
    // AC1 — dictionary terms extract per category (food-dining)
    // -------------------------------------------------------------

    #[test]
    fn ac1_food_dining_extracts_terms_with_original_casing() {
        // nav: "Soul Food" (3x) · h2: "Vegan Options" (3x) · body: "live
        // music" twice (1x each = 2, reaches the threshold).
        let c = corpus(
            &["Soul Food"],
            &["Vegan Options"],
            &[],
            &[],
            &[],
            &["We host live music every Friday.", "Our live music runs until midnight."],
        );

        let decision = extract_highlights("food-dining", &c);

        assert_eq!(
            decision.value,
            Some(vec![
                "Soul Food".to_string(),
                "Vegan Options".to_string(),
                "live music".to_string(),
            ])
        );
        assert_eq!(decision.note, "3 highlights found");
        // Contract invariant: no entry exceeds the length cap.
        for entry in decision.value.unwrap() {
            assert!(
                entry.chars().count() <= MAX_HIGHLIGHT_LEN,
                "entry {entry:?} exceeds {MAX_HIGHLIGHT_LEN} chars"
            );
        }
    }

    #[test]
    fn ac1_substring_is_not_a_word_boundary_match() {
        // "unbelievably soulful" must not match "soul food".
        let c = corpus(&[], &[], &[], &[], &[], &["unbelievably soulful"]);
        let decision = extract_highlights("food-dining", &c);
        assert!(decision.value.is_none());
        assert_eq!(decision.note, NO_HIGHLIGHTS_NOTE);
    }

    #[test]
    fn ac1_lively_musician_does_not_match_live_music() {
        // "lively musician" must not match "live music".
        let c = corpus(&[], &[], &[], &[], &[], &["a lively musician on stage"]);
        let decision = extract_highlights("food-dining", &c);
        assert!(decision.value.is_none());
    }

    #[test]
    fn ac1_adjacent_alphanumeric_rejects_the_match() {
        // Prefix ("alive music") and suffix ("live musical") are not
        // word-boundary occurrences of "live music".
        let c = corpus(
            &[],
            &[],
            &[],
            &[],
            &[],
            &["alive music is rare", "we are live musical hosts"],
        );
        let decision = extract_highlights("food-dining", &c);
        assert!(decision.value.is_none());
    }

    #[test]
    fn ac1_cap_at_five_entries_keeps_top_five_by_weight() {
        // 8 distinct food-dining terms above the threshold:
        //   weight 3: Soul Food (nav), Vegan Options (h2), Organic
        //             Ingredients (meta), Craft Cocktails (title)
        //   weight 2: live music, Vegetarian Menu, Private Dining, Outdoor
        //             Patio (body, 2x each)
        // Expected top-5: the four weight-3 terms + Live Music (lowest
        // dictionary order among the weight-2 terms).
        let c = corpus(
            &["Soul Food"],
            &["Vegan Options"],
            &["Organic Ingredients on every plate"],
            &["Craft Cocktails"],
            &[],
            &[
                "live music plays on Fridays. live music continues late. The Vegetarian Menu \
                 is posted. Our Vegetarian Menu updates weekly. Private Dining is available. \
                 Private Dining seats groups. An Outdoor Patio faces the street. An Outdoor \
                 Patio is pet friendly.",
            ],
        );

        let decision = extract_highlights("food-dining", &c);
        let entries = decision.value.expect("entries present");

        assert_eq!(entries.len(), MAX_HIGHLIGHT_ENTRIES, "exactly 5 entries, 6th dropped");
        for want in [
            "Soul Food",
            "Vegan Options",
            "Organic Ingredients",
            "Craft Cocktails",
            "live music",
        ] {
            assert!(entries.iter().any(|e| e == want), "missing {want:?}");
        }
        for dropped in ["Vegetarian Menu", "Private Dining", "Outdoor Patio"] {
            assert!(
                !entries.iter().any(|e| e == dropped),
                "{dropped:?} should have been dropped"
            );
        }
    }

    #[test]
    fn ac1_same_term_in_multiple_zones_dedupes_to_one_entry() {
        // "Soul Food" in nav + "soul food" in body: one entry, casing from
        // the first occurrence (nav), weight 3 + 1 = 4.
        let c = corpus(
            &["Soul Food"],
            &[],
            &[],
            &[],
            &[],
            &["soul food every sunday"],
        );

        let decision = extract_highlights("food-dining", &c);

        assert_eq!(
            decision.value,
            Some(vec!["Soul Food".to_string()])
        );
    }

    // -------------------------------------------------------------
    // AC2 — professional-services practice areas
    // -------------------------------------------------------------

    #[test]
    fn ac2_professional_services_extracts_practice_areas() {
        // nav: "Family Law" (3x) · h2: "Estate Planning" (3x).
        let c = corpus(&["Family Law"], &["Estate Planning"], &[], &[], &[], &[]);

        let decision = extract_highlights("professional-services", &c);

        assert_eq!(
            decision.value,
            Some(vec!["Family Law".to_string(), "Estate Planning".to_string()])
        );
        assert_eq!(decision.note, "2 highlights found");
    }

    #[test]
    fn ac2_single_body_mention_below_threshold_is_excluded() {
        // "criminal defense" exactly once in body, no title/nav: weight 1,
        // below the threshold and no prominent hit.
        let c = corpus(
            &[],
            &[],
            &[],
            &[],
            &[],
            &["Our criminal defense team handles complex cases."],
        );

        let decision = extract_highlights("professional-services", &c);

        assert!(decision.value.is_none());
        assert_eq!(decision.note, NO_HIGHLIGHTS_NOTE);
    }

    #[test]
    fn ac2_two_body_mentions_reach_the_threshold() {
        // "criminal defense" twice in body: weight 2 — qualifies.
        let c = corpus(
            &[],
            &[],
            &[],
            &[],
            &[],
            &["criminal defense consultation available. criminal defense trial support offered."],
        );

        let decision = extract_highlights("professional-services", &c);

        assert_eq!(
            decision.value,
            Some(vec!["criminal defense".to_string()])
        );
    }

    // -------------------------------------------------------------
    // AC3 — zero matches / unknown category means no write
    // -------------------------------------------------------------

    #[test]
    fn ac3_zero_matches_leaves_no_write_and_notes_it() {
        // food-dining corpus with no dictionary terms at all.
        let c = corpus(
            &[],
            &[],
            &[],
            &[],
            &[],
            &["Welcome to our kitchen. Fresh food served daily."],
        );

        let decision = extract_highlights("food-dining", &c);

        assert!(decision.value.is_none(), "zero matches: no write");
        assert_eq!(decision.note, NO_HIGHLIGHTS_NOTE);
    }

    #[test]
    fn ac3_unknown_category_produces_no_entries_without_error() {
        // "retail-fashion" has no v1 dictionary; a non-empty corpus must
        // still yield an empty result, not a panic.
        let c = corpus(
            &["New Arrivals"],
            &["Trendy Apparel"],
            &[],
            &[],
            &[],
            &["We sell fashionable clothing for everyone."],
        );

        let decision = extract_highlights("retail-fashion", &c);

        assert!(decision.value.is_none());
        assert_eq!(decision.note, NO_HIGHLIGHTS_NOTE);
    }

    #[test]
    fn ac3_empty_corpus_produces_no_write() {
        let decision = extract_highlights("food-dining", &Corpus::default());
        assert!(decision.value.is_none());
        assert_eq!(decision.note, NO_HIGHLIGHTS_NOTE);
    }

    // -------------------------------------------------------------
    // 80-char cap boundary
    // -------------------------------------------------------------

    #[test]
    fn cap_truncates_strings_over_80_chars() {
        let long = "x".repeat(85);
        let capped = truncate_chars(&long, MAX_HIGHLIGHT_LEN);
        assert_eq!(capped.chars().count(), MAX_HIGHLIGHT_LEN);
        assert_eq!(capped, "x".repeat(80));
    }

    #[test]
    fn cap_keeps_strings_at_or_under_80_chars() {
        let at_cap = "y".repeat(80);
        assert_eq!(truncate_chars(&at_cap, MAX_HIGHLIGHT_LEN), at_cap);
        assert_eq!(truncate_chars("abc", MAX_HIGHLIGHT_LEN), "abc");
    }

    #[test]
    fn cap_counts_multibyte_chars_not_bytes() {
        let long = "é".repeat(81);
        assert_eq!(truncate_chars(&long, MAX_HIGHLIGHT_LEN).chars().count(), 80);
    }

    // -------------------------------------------------------------
    // dictionary loading
    // -------------------------------------------------------------

    #[test]
    fn dictionaries_load_all_v1_categories() {
        for slug in ["food-dining", "professional-services", "personal-services"] {
            let terms = terms_for_category(slug).expect("v1 category must have a dictionary");
            assert!(!terms.is_empty(), "{slug} dictionary must not be empty");
            for term in terms {
                assert!(
                    term.chars().count() <= MAX_HIGHLIGHT_LEN,
                    "dictionary term {term:?} exceeds the entry cap"
                );
            }
        }
    }

    #[test]
    fn terms_for_unknown_category_is_none() {
        assert!(terms_for_category("retail-fashion").is_none());
    }

    // -------------------------------------------------------------
    // zone extraction + one-shot pass (integration seam)
    // -------------------------------------------------------------

    const FOOD_HTML: &str = "<html><head><title>Atlanta Kitchen</title></head>\
        <body>\
        <nav><a href=\"/menu\">Soul Food</a><a href=\"/events\">Events</a></nav>\
        <h1>Atlanta Kitchen</h1>\
        <h2>Vegan Options</h2>\
        <p>Enjoy live music every Friday evening.</p>\
        <p>Our live music program started in 1990.</p>\
        </body></html>";

    #[test]
    fn one_shot_food_dining_from_html_matches_ac1() {
        let json = r#"{"results": [{"title": "City Eats Guide", "snippet": "The best black owned restaurants in the city."}]}"#;

        let decision = enrich_highlights("food-dining", FOOD_HTML, Some(json), None);

        assert_eq!(
            decision.value,
            Some(vec![
                "Soul Food".to_string(),
                "Vegan Options".to_string(),
                "live music".to_string(),
            ])
        );
    }

    #[test]
    fn parse_corpus_extracts_all_zones() {
        let json = r#"{"results": [{"title": "City Eats", "snippet": "Great food."}]}"#;
        let corpus = parse_corpus(FOOD_HTML, Some(json), Some("  Known for soul food  "));

        assert_eq!(corpus.nav, vec!["Soul Food", "Events"]);
        assert_eq!(corpus.headings, vec!["Atlanta Kitchen", "Vegan Options"]);
        assert!(corpus.meta.is_empty());
        assert_eq!(corpus.titles, vec!["City Eats"]);
        assert_eq!(corpus.snippets, vec!["Great food."]);
        // Body zone: stripped body text + trimmed place description.
        assert!(corpus.body[0].contains("Enjoy live music every Friday evening."));
        assert_eq!(corpus.body[1], "Known for soul food");
    }

    #[test]
    fn extract_headings_respects_document_order() {
        // Headings appear h3 -> h1 -> h2 in the document; extraction must
        // return them in document position order, not tag-type order.
        let html = "<body><h3>Third</h3><h1>First</h1><h2>Second</h2></body>";
        assert_eq!(extract_headings(html), vec!["Third", "First", "Second"]);
    }

    #[test]
    fn extract_meta_descriptions_finds_og_and_name() {
        let html = "<html><head>\
            <meta property=\"og:description\" content=\"Authentic soul food daily\"/>\
            <meta name=\"description\" content=\"A neighborhood kitchen\"/>\
            </head><body></body></html>";
        assert_eq!(
            extract_meta_descriptions(html),
            vec!["Authentic soul food daily", "A neighborhood kitchen"]
        );
    }

    #[test]
    fn searxng_titles_and_snippets_from_valid_json() {
        let json = r#"{"results": [{"title": " A ", "snippet": "One."}, {"snippet": " Two "}, {"title": null, "snippet": ""}]}"#;
        let (titles, snippets) = extract_searxng_titles_and_snippets(json);
        assert_eq!(titles, vec!["A"]);
        assert_eq!(snippets, vec!["One.", "Two"]);
    }

    #[test]
    fn searxng_invalid_json_yields_empty_vectors() {
        let (titles, snippets) = extract_searxng_titles_and_snippets("not json");
        assert!(titles.is_empty());
        assert!(snippets.is_empty());
    }

    #[test]
    fn word_boundary_matches_returns_spans_in_original_casing() {
        let hits = word_boundary_matches("Try Soul Food today, soul food is back.", "soul food");
        assert_eq!(hits, vec!["Soul Food", "soul food"]);
    }
}
