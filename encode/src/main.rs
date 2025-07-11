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
    println!("Loading and encoding N-Quads data...");
    
    // Create an encoder instance
    let mut encoder = Rdf2FrInMemoryEncoder::new();
    
    // Read the N-Quads file
    let nq_content = fs::read_to_string("../data.temp.nq")?;
    let quads_list = nq::parse_str(&nq_content).collect_quads()?;

    // Use the proper encoder method to get field representations
    let field_elements = encoder.quads_to_field_representations(&quads_list)?;
    
    println!("Generated {} field elements", field_elements.len());
    
    // Convert field elements to strings for JSON serialization
    let field_element_strings: Vec<String> = field_elements
        .iter()
        .map(|fe| format!("{:?}", fe))
        .collect();
    
    // Create the output structure
    let output = FieldElementArray(field_element_strings);
    
    // Serialize to JSON
    let json_output = serde_json::to_string_pretty(&output)?;
    
    // Write to file
    fs::write("../data.fr.temp.json", json_output)?;
    
    println!("\n✅ Successfully processed {} field elements and wrote to data.fr.json", 
             field_elements.len());
    
    Ok(())
}
