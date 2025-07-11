// Import RDF and encoding related types
use demo_lib::rdf4zkp::encoder::{Rdf2FrEncoder, Rdf2FrInMemoryEncoder};
use sophia::api::source::QuadSource;
use sophia::turtle::parser::nq;
use serde_json;
use std::fs;

// Define a serializable structure for field elements
#[derive(serde::Serialize)]
struct FieldElementArray(Vec<String>);

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
    
    println!("Loading and encoding N-Quads data from: {}", input_path);
    
    // Create an encoder instance
    let mut encoder = Rdf2FrInMemoryEncoder::new();
    
    // Read the N-Quads file
    let nq_content = fs::read_to_string(input_path)?;
    let quads_list = nq::parse_str(&nq_content).collect_quads()?;

    // Use the proper encoder method to get field representations
    let field_elements = encoder.quads_to_field_representations(&quads_list)?;
    
    println!("Generated {} field elements", field_elements.len());
    
    // Convert field elements directly to strings representing the full BigInt values
    let field_element_strings: Vec<String> = field_elements
        .iter()
        .map(|fe| {
            // Try to convert to string representation
            // First, let's see if the field element has a Display or ToString impl
            fe.to_string()
        })
        .collect();
    
    // Create the output structure
    let output = FieldElementArray(field_element_strings);
    
    // Serialize to JSON
    let json_output = serde_json::to_string_pretty(&output)?;
    
    // Write to file
    fs::write(output_path, json_output)?;
    
    println!("\n✅ Successfully processed {} field elements and wrote to {}", 
             field_elements.len(), output_path);
    
    Ok(())
}
