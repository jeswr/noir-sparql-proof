#!/usr/bin/env node

import { sparqlToNoir } from './src/converter.js';

// Example SPARQL query
const sparqlQuery = `
SELECT ?person ?name WHERE {
  ?person <http://example.org/name> ?name .
  ?person <http://example.org/age> ?age .
  FILTER(?age > 18)
}
`;

console.log('Converting SPARQL query to Noir constraints...\n');
console.log('Input SPARQL query:');
console.log(sparqlQuery);

try {
  const result = sparqlToNoir(sparqlQuery);
  
  console.log('\n=== CONVERSION RESULT ===\n');
  
  console.log('Public Variables:');
  for (const [name, term] of result.publicVariables) {
    console.log(`  ${name}: ${JSON.stringify(term, null, 2)}`);
  }
  
  console.log('\nTriple Patterns:');
  result.triplePatterns.forEach((pattern, i) => {
    console.log(`  Pattern ${i}:`);
    console.log(`    Subject: ${JSON.stringify(pattern.subject, null, 4)}`);
    console.log(`    Predicate: ${JSON.stringify(pattern.predicate, null, 4)}`);
    console.log(`    Object: ${JSON.stringify(pattern.object, null, 4)}`);
  });
  
  console.log('\nFilter Constraints:');
  result.filterConstraints.forEach((constraint, i) => {
    console.log(`  Constraint ${i}: ${constraint.description}`);
    console.log(`    Noir Code: ${constraint.noirCode}`);
    console.log(`    Variables: [${constraint.variables.join(', ')}]`);
  });
  
  console.log('\nGenerated Noir Variables Struct:');
  console.log(result.variablesStruct);
  
  console.log('\nGenerated Noir checkBinding Function:');
  console.log(result.checkBindingFunction);
  
  console.log('\nMetadata:');
  console.log(`  Triple Pattern Count: ${result.metadata.triplePatternCount}`);
  console.log(`  Filter Count: ${result.metadata.filterCount}`);
  console.log(`  SELECT Variables: [${result.metadata.selectVariables.join(', ')}]`);
  
} catch (error) {
  console.error('Error converting SPARQL query:', error.message);
  process.exit(1);
}
