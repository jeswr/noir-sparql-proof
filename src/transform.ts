import { Store, Term, Variable } from '@rdfjs/types';
import { DataFactory } from 'n3';
import { matchTerm } from 'rdf-terms';
import { Algebra, Factory, Util } from 'sparqlalgebrajs';
import { v4 as uuidv4 } from 'uuid';
import { QueryEngine } from "@comunica/query-sparql";

const factory = new Factory();

/**
 * Generate a unique variable name for use in SPARQL operations
 * @returns A unique variable name prefixed with 'v' followed by a UUID
 */
function generateVariable(): string {
  return 'v' + uuidv4().replace(/-/g, '');
}

/**
 * Convert a path expression to a Basic Graph Pattern (BGP), join, or union operation
 * @param subject - The subject term of the path
 * @param path - The path expression or term to convert
 * @param object - The object term of the path
 * @returns A BGP, join, or union operation representing the path
 * @throws Error for unsupported path expression types
 */
function pathToBgp(subject: Term, path: Algebra.PropertyPathSymbol, object: Term): Algebra.Operation {
  // Handle PathExpression cases
  switch (path.type) {
    case 'link':
      return factory.createBgp([
        factory.createPattern(subject, path.iri, object, DataFactory.defaultGraph())
      ]);
    case 'inv':
      return pathToBgp(object, path.path, subject);
    case 'seq':
      const variable = DataFactory.variable(generateVariable());
      factory.createJoin([
        pathToBgp(subject, path.left, variable),
        pathToBgp(variable, path.right, object)
      ]);
    case 'alt':
      return factory.createUnion(path.input.map(input => pathToBgp(subject, input, object)));
    default:
      throw new Error(`Unsupported path expression: ${path.type}`);
  }
}

/**
 * Convert a triple pattern to an extend operation that includes the triple as a result variable
 * @param variables - Array of variables to which the new triple variable will be added
 * @param pattern - The triple pattern to convert
 * @returns An extend operation that includes the triple pattern as a variable
 */
function toExtend(patternMap: Map<string, Algebra.Pattern>, variables: Variable[], pattern: Algebra.Pattern): any {
  const variable = DataFactory.variable(generateVariable());
  variables.push(variable);

  let { subject, predicate, object } = pattern;

  // Convert blank nodes to variables
  if (subject.termType === 'BlankNode') {
    subject = DataFactory.variable(generateVariable());
  }
  if (object.termType === 'BlankNode') {
    object = DataFactory.variable(generateVariable());
  }
  
  patternMap.set(variable.value, pattern);

  // Create a TRIPLE expression to represent the triple
  return factory.createExtend(
    factory.createBgp([factory.createPattern(subject, predicate, object, DataFactory.defaultGraph())]),
    variable,
    factory.createOperatorExpression(
      'triple',
      [termToExpression(subject), termToExpression(predicate), termToExpression(object)]
    )        
  );
}

/**
 * Convert a term to an expression
 */
function termToExpression(term: Term): Algebra.TermExpression {
  return factory.createTermExpression(term);
}

/**
 * Convert a BGP to joins of extended patterns
 */
function convertBgp(patternMap: Map<string, Algebra.Pattern>, variables: Variable[], patterns: Algebra.Pattern[]): any {
  if (patterns.length === 0) {
    throw new Error('Empty BGP');
  }

  return patterns.slice(1).reduce((result, pattern) => {
    return factory.createJoin([result, toExtend(patternMap, variables, pattern)]);
  }, toExtend(patternMap, variables, patterns[0]));
}

/**
 * Transform a SPARQL query to include triples as result variables
 * @param algebra - The SPARQL algebra operation to transform
 * @returns The transformed operation with triples included as result variables
 * @throws Error if the operation is not a SELECT query (project operation)
 */
export function transformQuery(algebra: Algebra.Operation): {
  algebra: Algebra.Operation;
  patternMap: Map<string, Algebra.Pattern>;
} {
  if (algebra.type !== 'project') {
    throw new Error('Only SELECT queries (project operations) are supported');
  }

  const patternMap = new Map<string, Algebra.Pattern>();

  const resultAlgebra = Util.mapOperation(algebra, {
    bgp: (bgp) => {
      return {
        result: convertBgp(patternMap, algebra.variables, bgp.patterns),
        recurse: false,
      }
    },
    path: (path) => {
      return {
        result: pathToBgp(path.subject, path.predicate, path.object),
        recurse: false,
      };
    }
  });

  return {
    algebra: resultAlgebra,
    patternMap: patternMap,
  }
}

export function getBindOrder(patterns: Algebra.Pattern[], map: Map<string, Algebra.Pattern>): string[] {
  return patterns.map(pattern => {
    for (const [key, value] of map.entries()) {
      if (matchTerm(pattern.subject, value.subject) &&
          matchTerm(pattern.predicate, value.predicate) &&
          matchTerm(pattern.object, value.object) &&
          matchTerm(pattern.graph, value.graph)) {
        return key;
      }
    }
    throw new Error(`Pattern not found in map: ${pattern.subject.value} ${pattern.predicate.value} ${pattern.object.value}`);
  })
}

export async function *getBindings(query: Algebra.Operation, source: Store, patterns: Algebra.Pattern[]) {
  const { algebra, patternMap } = transformQuery(query);
  const bindings = await new QueryEngine().queryBindings(algebra, {
    sources: [source],
  });

  const bindOrder = getBindOrder(patterns, patternMap);

  for await (let elem of bindings) {
    const bgp = bindOrder.map(va => {
      const result = elem.get(va);
      if (!result) {
        throw new Error(`Variable ${va} not found in bindings`);
      }
      if (result.termType !== 'Quad') {
        throw new Error(`Expected Quad for variable ${va}, got ${result.termType}`);
      }
      return result;
    });
    for (const va of bindOrder) {
      elem = elem.delete(va);
    }
    yield {
      bgp,
      bindings: elem,
    }
  }
}
