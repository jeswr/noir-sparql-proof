// Noir-friendly RDF to Field Element Encoder
// Ensures all field elements are within BN254 scalar field modulus
use serde_json;
use std::fs;
use sha2::{Sha256, Digest};
use num_bigint::BigUint;

// BN254 scalar field modulus (Noir's field modulus)
const BN254_SCALAR_MODULUS: &str = "21888242871839275222246405745257275088548364400416034343698204186575808495617";

// Define a serializable structure for field elements
#[derive(serde::Serialize)]
struct FieldElementArray(Vec<String>);

/// Noir-friendly RDF encoder that generates field elements within BN254 scalar field
struct NoirFriendlyEncoder {
    modulus: BigUint,
}

impl NoirFriendlyEncoder {
    fn new() -> Self {
        let modulus = BN254_SCALAR_MODULUS.parse::<BigUint>()
            .expect("Failed to parse BN254 modulus");
        
        Self { modulus }
    }
    
    /// Encode a string term as a field element using SHA-256 hash and modular reduction
    fn encode_string_term(&self, term: &str) -> String {
        // Use SHA-256 to hash the string term
        let mut hasher = Sha256::new();
        hasher.update(term.as_bytes());
        let hash_bytes = hasher.finalize();
        
        // Convert hash bytes to BigUint (big-endian)
        let hash_value = BigUint::from_bytes_be(&hash_bytes);
        
        // Reduce modulo BN254 scalar field to ensure it fits in Noir
        let field_element = &hash_value % &self.modulus;
        
        field_element.to_string()
    }
    
    /// Encode a numeric literal term
    fn encode_numeric_term(&self, value: &str) -> String {
        // Try to parse as number first
        if let Ok(num) = value.parse::<u64>() {
            // For small numbers, use directly if they fit in field
            let field_element = BigUint::from(num) % &self.modulus;
            field_element.to_string()
        } else {
            // For large numbers or non-numeric strings, hash them
            self.encode_string_term(value)
        }
    }
    
    /// Convert an RDF term to a field element string
    fn term_to_field_element(&self, term_str: &str, term_type: &str) -> String {
        // For debugging
        println!("  {}: {} -> field element", term_type, term_str);
        
        // Check if it looks like a numeric literal
        if let Ok(num) = term_str.parse::<u64>() {
            if num < 1000000 { // Use small numbers directly
                return num.to_string();
            }
        }
        
        // Hash the term string to ensure it fits in field
        self.encode_string_term(term_str)
    }
    
    /// Process a single quad and extract its 5 field elements
    fn process_quad(&self, quad_str: &str, quad_index: usize) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        println!("\nProcessing Quad {}:", quad_index + 1);
        
        // Parse the N-Quad manually for more control
        let parts: Vec<&str> = quad_str.trim().split_whitespace().collect();
        
        if parts.len() < 3 {
            return Err(format!("Invalid quad: {}", quad_str).into());
        }
        
        // Extract subject, predicate, object
        let subject = parts[0].trim_matches('<').trim_matches('>');
        let predicate = parts[1].trim_matches('<').trim_matches('>');
        let object_raw = parts[2];
        
        // Process object - handle literals specially
        let (object, numeric_value) = if object_raw.starts_with('"') {
            // It's a literal
            let end_quote = object_raw[1..].find('"').unwrap_or(object_raw.len() - 1) + 1;
            let literal_value = &object_raw[1..end_quote];
            
            // Check if it's a typed literal
            if parts.len() > 3 && parts[3].starts_with("^^") {
                let datatype = parts[3].trim_start_matches("^^").trim_matches('<').trim_matches('>');
                if datatype.contains("integer") || datatype.contains("int") {
                    // Extract numeric value
                    (format!("{}^^{}", literal_value, datatype), literal_value.to_string())
                } else {
                    (format!("{}^^{}", literal_value, datatype), "0".to_string())
                }
            } else {
                (literal_value.to_string(), "0".to_string())
            }
        } else {
            // It's an IRI or blank node
            let cleaned = object_raw.trim_matches('<').trim_matches('>');
            (cleaned.to_string(), "0".to_string())
        };
        
        // Graph name (default to empty)
        let graph = "".to_string();
        
        // Generate field elements
        let subject_fe = self.term_to_field_element(subject, "Subject");
        let predicate_fe = self.term_to_field_element(predicate, "Predicate");
        let object_fe = self.term_to_field_element(&object, "Object");
        let graph_fe = self.term_to_field_element(&graph, "Graph");
        let value_fe = self.encode_numeric_term(&numeric_value);
        
        println!("  Generated field elements: S={}, P={}, O={}, G={}, V={}", 
                 subject_fe, predicate_fe, object_fe, graph_fe, value_fe);
        
        Ok(vec![subject_fe, predicate_fe, object_fe, graph_fe, value_fe])
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Parse command line arguments
    let args: Vec<String> = std::env::args().collect();
    
    if args.len() != 3 {
        eprintln!("Usage: {} <input_nquads_file> <output_json_file>", args[0]);
        eprintln!("Example: {} data.temp.nq data.fr.json", args[0]);
        std::process::exit(1);
    }
    
    let input_path = &args[1];
    let output_path = &args[2];
    
    println!("🔧 Noir-Friendly RDF Encoder");
    println!("Loading N-Quads data from: {}", input_path);
    println!("Field modulus: {}", BN254_SCALAR_MODULUS);
    
    // Create Noir-friendly encoder
    let encoder = NoirFriendlyEncoder::new();
    
    // Read the N-Quads file
    let nq_content = fs::read_to_string(input_path)?;
    let lines: Vec<&str> = nq_content.lines()
        .filter(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .collect();
    
    println!("\nProcessing {} quads...", lines.len());
    
    // Process each quad to generate field elements
    let mut all_field_elements = Vec::new();
    
    for (i, line) in lines.iter().enumerate() {
        match encoder.process_quad(line, i) {
            Ok(mut elements) => {
                all_field_elements.append(&mut elements);
            },
            Err(e) => {
                eprintln!("Error processing quad {}: {}", i + 1, e);
                return Err(e);
            }
        }
    }
    
    println!("\n✅ Generated {} field elements (all within BN254 modulus)", all_field_elements.len());
    
    // Verify all field elements are within modulus
    let modulus = BN254_SCALAR_MODULUS.parse::<BigUint>().unwrap();
    for (i, fe_str) in all_field_elements.iter().enumerate() {
        let fe_value = fe_str.parse::<BigUint>()
            .expect(&format!("Failed to parse field element {}", i));
        if fe_value >= modulus {
            panic!("Field element {} exceeds BN254 modulus!", i);
        }
    }
    println!("✅ All field elements verified to be within BN254 modulus");
    
    // Create the output structure
    let output = FieldElementArray(all_field_elements.clone());
    
    // Serialize to JSON
    let json_output = serde_json::to_string_pretty(&output)?;
    
    // Write to file
    fs::write(output_path, json_output)?;
    
    println!("\n🎯 Summary:");
    println!("  - Input: {} quads", lines.len());
    println!("  - Output: {} field elements", all_field_elements.len());
    println!("  - All elements fit within Noir's BN254 field");
    println!("  - Written to: {}", output_path);
    
    // Show sample values for verification
    if !all_field_elements.is_empty() {
        println!("\n📊 Sample field elements:");
        for (i, fe) in all_field_elements.iter().take(5).enumerate() {
            println!("  [{}]: {}", i, fe);
        }
        if all_field_elements.len() > 5 {
            println!("  ... and {} more", all_field_elements.len() - 5);
        }
    }
    
    Ok(())
}
