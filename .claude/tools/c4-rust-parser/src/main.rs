use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::Path;
use syn::{parse_file, Item, ItemStruct, ItemTrait, ItemImpl, ItemFn, Type, PatType, TypePath, UseTree};
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
struct Component {
    id: String,
    name: String,
    path: String,
    kind: String,
}

#[derive(Debug, Serialize)]
struct Relationship {
    source: String,
    target: String,
    label: String,
    technology: String,
    confidence: f32,
    pattern: String,
}

#[derive(Debug, Serialize)]
struct Output {
    components: Vec<Component>,
    relationships: Vec<Relationship>,
}

fn sanitize_id(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '-' })
        .collect()
}

fn extract_type_name(ty: &Type) -> Option<String> {
    match ty {
        Type::Path(TypePath { path, .. }) => {
            path.segments.last().map(|seg| seg.ident.to_string())
        }
        Type::Reference(reff) => extract_type_name(&reff.elem),
        Type::Tuple(tuple) => {
            tuple.elems.iter().find_map(extract_type_name)
        }
        _ => None,
    }
}

fn is_ignored_type(name: &str) -> bool {
    let ignored = [
        "String", "str", "Vec", "Option", "Result", "Box", "Arc", "Rc",
        "u8", "u16", "u32", "u64", "u128",
        "i8", "i16", "i32", "i64", "i128",
        "f32", "f64", "bool", "char", "usize", "isize",
        "Self", "()",
    ];
    ignored.contains(&name)
}

fn is_ignored_path(path: &str) -> bool {
    let ignored = [
        "std::", "core::", "alloc::",
        "tracing::", "serde::", "tokio::", "log::",
        "thiserror::", "async_trait::", "futures::",
        "pin_", "cfg_", "println", "format", "vec", "box",
    ];
    ignored.iter().any(|p| path.starts_with(p))
}

fn parse_rust_file(file_path: &Path, components: &mut Vec<Component>, relationships: &mut Vec<Relationship>) {
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let rel_path = file_path.to_string_lossy().to_string();
    let file = match parse_file(&content) {
        Ok(f) => f,
        Err(_) => return,
    };

    // Extract component definitions
    for item in &file.items {
        match item {
            Item::Struct(ItemStruct { ident, .. }) => {
                let name = ident.to_string();
                if !is_ignored_type(&name) {
                    components.push(Component {
                        id: sanitize_id(&name),
                        name: name.clone(),
                        path: rel_path.clone(),
                        kind: "struct".to_string(),
                    });
                }
            }
            Item::Trait(ItemTrait { ident, .. }) => {
                let name = ident.to_string();
                if !is_ignored_type(&name) {
                    components.push(Component {
                        id: sanitize_id(&name),
                        name: name.clone(),
                        path: rel_path.clone(),
                        kind: "trait".to_string(),
                    });
                }
            }
            Item::Impl(ItemImpl { trait_, self_ty, .. }) => {
                // Record trait implementations: impl Trait for Type
                if let Some((_, trait_path, _)) = trait_ {
                    if let Some(trait_name) = trait_path.segments.last().map(|s| s.ident.to_string()) {
                        if let Some(type_name) = extract_type_name(self_ty) {
                            if !is_ignored_type(&trait_name) && !is_ignored_type(&type_name) {
                                relationships.push(Relationship {
                                    source: sanitize_id(&type_name),
                                    target: sanitize_id(&trait_name),
                                    label: "Implements".to_string(),
                                    technology: "Trait impl".to_string(),
                                    confidence: 0.95,
                                    pattern: "trait_impl".to_string(),
                                });
                            }
                        }
                    }
                }
            }
            Item::Fn(ItemFn { sig, .. }) => {
                // Analyze function parameters for dependencies
                let func_name = sig.ident.to_string();
                for param in &sig.inputs {
                    if let syn::FnArg::Typed(PatType { ty, .. }) = param {
                        if let Some(type_name) = extract_type_name(ty) {
                            if !is_ignored_type(&type_name) {
                                // Function depends on this type
                                relationships.push(Relationship {
                                    source: sanitize_id(&func_name),
                                    target: sanitize_id(&type_name),
                                    label: "Uses".to_string(),
                                    technology: "Function parameter".to_string(),
                                    confidence: 0.85,
                                    pattern: "function_param".to_string(),
                                });
                            }
                        }
                    }
                }

                // Analyze return types
                if let syn::ReturnType::Type(_, ty) = &sig.output {
                    if let Some(type_name) = extract_type_name(ty) {
                        if !is_ignored_type(&type_name) {
                            relationships.push(Relationship {
                                source: sanitize_id(&func_name),
                                target: sanitize_id(&type_name),
                                label: "Produces".to_string(),
                                technology: "Return type".to_string(),
                                confidence: 0.80,
                                pattern: "return_type".to_string(),
                            });
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // Extract use statements — walk the UseTree AST to get the leaf name
    fn leaf_names_from_use_tree(tree: &UseTree, out: &mut Vec<String>) {
        match tree {
            UseTree::Name(n) => out.push(n.ident.to_string()),
            UseTree::Rename(r) => out.push(r.rename.to_string()),
            UseTree::Path(p) => leaf_names_from_use_tree(&p.tree, out),
            UseTree::Group(g) => {
                for t in &g.items {
                    leaf_names_from_use_tree(t, out);
                }
            }
            UseTree::Glob(_) => {}
        }
    }

    for item in &file.items {
        if let Item::Use(use_item) = item {
            let mut leaves = Vec::new();
            leaf_names_from_use_tree(&use_item.tree, &mut leaves);
            for type_name in leaves {
                if !is_ignored_type(&type_name) && !type_name.is_empty() {
                    let path_check = format!("{}", type_name);
                    if !is_ignored_path(&path_check) {
                        relationships.push(Relationship {
                            source: "module".to_string(),
                            target: sanitize_id(&type_name),
                            label: "Uses".to_string(),
                            technology: "Import".to_string(),
                            confidence: 0.60,
                            pattern: "use_statement".to_string(),
                        });
                    }
                }
            }
        }
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: c4-rust-parser <repo-root>");
        std::process::exit(1);
    }

    let repo_root = &args[1];
    let mut components: Vec<Component> = Vec::new();
    let mut relationships: Vec<Relationship> = Vec::new();

    // Walk all .rs files
    for entry in WalkDir::new(repo_root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.extension().map_or(false, |ext| ext == "rs") {
            continue;
        }

        // Skip test files and target directory
        let path_str = path.to_string_lossy();
        if path_str.contains("/tests/")
            || path_str.contains("\\tests\\")
            || path_str.contains("/target/")
            || path_str.contains("\\target\\")
        {
            continue;
        }

        parse_rust_file(path, &mut components, &mut relationships);
    }

    // Deduplicate relationships
    let mut seen: HashSet<(String, String, String)> = HashSet::new();
    let mut deduped: Vec<Relationship> = Vec::new();

    for rel in relationships {
        let key = (rel.source.clone(), rel.target.clone(), rel.label.clone());
        if seen.insert(key) {
            deduped.push(rel);
        }
    }

    // Deduplicate components
    let mut seen_comps: HashSet<String> = HashSet::new();
    let mut deduped_comps: Vec<Component> = Vec::new();

    for comp in components {
        if seen_comps.insert(comp.id.clone()) {
            deduped_comps.push(comp);
        }
    }

    let output = Output {
        components: deduped_comps,
        relationships: deduped,
    };

    println!("{}", serde_json::to_string(&output).unwrap());
}
