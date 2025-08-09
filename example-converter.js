import { sparqlToConstraints } from './dist/converter.js';

// Example SPARQL queries to demonstrate the converter

const simpleQuery = `
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?person ?name WHERE {
  ?person foaf:name ?name .
}`;

const complexQuery = `
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?person ?age WHERE {
  ?person foaf:name ?name .
  ?person foaf:age ?age .
  FILTER(?age > 21)
  FILTER(isLiteral(?name))
}`;

const bindQuery = `
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?person ?isAdult WHERE {
  ?person foaf:age ?age .
  BIND(?age >= 18 AS ?isAdult)
}`;

console.log('=== Simple Query Conversion ===');
try {
  const result1 = sparqlToConstraints(simpleQuery);
  console.log('Variables:', Array.from(result1.variables));
  console.log('Triple patterns:', result1.metadata.triplePatternCount);
  console.log('Filter count:', result1.metadata.filterCount);
  console.log('Constraint:', JSON.stringify(result1.constraint, null, 2));
} catch (error) {
  console.error('Error converting simple query:', error.message);
}

console.log('\n=== Complex Query with Filters ===');
try {
  const result2 = sparqlToConstraints(complexQuery);
  console.log('Variables:', Array.from(result2.variables));
  console.log('Triple patterns:', result2.metadata.triplePatternCount);
  console.log('Filter count:', result2.metadata.filterCount);
  console.log('Constraint:', JSON.stringify(result2.constraint, null, 2));
} catch (error) {
  console.error('Error converting complex query:', error.message);
}

console.log('\n=== Query with BIND ===');
try {
  const result3 = sparqlToConstraints(bindQuery);
  console.log('Variables:', Array.from(result3.variables));
  console.log('Triple patterns:', result3.metadata.triplePatternCount);
  console.log('Filter count:', result3.metadata.filterCount);
  console.log('Constraint:', JSON.stringify(result3.constraint, null, 2));
} catch (error) {
  console.error('Error converting bind query:', error.message);
}

console.log('\n=== Current Input Query ===');
import fs from 'fs';
try {
  const inputQuery = fs.readFileSync('./inputs/sparql.rq', 'utf8');
  const result4 = sparqlToConstraints(inputQuery);
  console.log('Variables:', Array.from(result4.variables));
  console.log('Triple patterns:', result4.metadata.triplePatternCount);
  console.log('Filter count:', result4.metadata.filterCount);
  console.log('Select variables:', result4.metadata.selectVariables);
  console.log('Constraint:', JSON.stringify(result4.constraint, null, 2));
} catch (error) {
  console.error('Error converting input query:', error.message);
}
