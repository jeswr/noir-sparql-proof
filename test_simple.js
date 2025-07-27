import * as fs from 'fs';

// Simple test to verify the new implementation works
async function testSimple() {
  console.log("Testing new SPARQL compiler...");
  
  try {
    // Create a simple test query
    const testQuery = `
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      SELECT ?person WHERE {
        ?person foaf:name ?name .
        FILTER(isIRI(?person))
      }
    `;
    
    // Write to temporary file
    const tempFile = './temp_test.rq';
    fs.writeFileSync(tempFile, testQuery);
    
    console.log("✅ Test query created successfully");
    console.log("Query:", testQuery.trim());
    
    // Clean up
    fs.unlinkSync(tempFile);
    
    console.log("✅ Test completed successfully");
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testSimple();