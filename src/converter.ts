import { Algebra, Factory, Util, translate } from 'sparqlalgebrajs';
import { DataFactory } from 'n3';
import { Term, Variable } from '@rdfjs/types';
import { SparqlOperator } from '@comunica/utils-expression-evaluator';
import { simplifyExpression } from './expressionSimplifier.js';
import { operator as equivalentOperators } from './equivalentOperators.js';

/**
 * Represents a term in the Noir circuit (Field element)
 */
export interface NoirTerm {
  /** Type of the term */
  type: 'variable' | 'constant' | 'computed';
  /** Variable name (for variables) */
  name?: string;
  /** Constant value (for constants) */
  value?: string | number;
  /** Computation expression (for computed terms) */
  expression?: string;
}

/**
 * Represents a constraint that must be satisfied in the Noir circuit
 */
export interface NoirConstraint {
  /** Type of constraint */
  type: 'assert' | 'equality' | 'boolean' | 'range' | 'membership';
  /** Description of what this constraint checks */
  description: string;
  /** The actual Noir code that implements this constraint */
  noirCode: string;
  /** Variables involved in this constraint */
  variables: string[];
}

/**
 * Represents a triple pattern constraint in the BGP
 */
export interface TriplePattern {
  /** Subject field */
  subject: NoirTerm;
  /** Predicate field */
  predicate: NoirTerm;
  /** Object field */
  object: NoirTerm;
  /** Graph field (optional, defaults to default graph) */
  graph?: NoirTerm;
  /** Merkle proof path for this triple */
  proofPath: string;
  /** Index in the BGP array */
  index: number;
}

/**
 * Result of converting a SPARQL query to Noir ZKP constraints
 */
export interface SparqlToNoirResult {
  /** Variables used in the query (will become public inputs) */
  publicVariables: Map<string, NoirTerm>;
  /** Hidden variables (private to the circuit) */
  privateVariables: Map<string, NoirTerm>;
  /** Triple patterns that must be proven to exist in the dataset */
  triplePatterns: TriplePattern[];
  /** Additional constraints from FILTER expressions */
  filterConstraints: NoirConstraint[];
  /** Variable binding constraints from BIND/EXTEND */
  bindingConstraints: NoirConstraint[];
  /** Noir struct definition for Variables */
  variablesStruct: string;
  /** Noir function to check all constraints */
  checkBindingFunction: string;
  /** Metadata about the conversion */
  metadata: {
    originalQuery: string;
    algebra: Algebra.Operation;
    triplePatternCount: number;
    filterCount: number;
    selectVariables: string[];
  };
}

/**
 * Options for the SPARQL to Noir conversion
 */
export interface NoirConversionOptions {
  /** Maximum number of triple patterns supported */
  maxTriplePatterns?: number;
  /** Maximum depth for path expressions */
  maxDepth?: number;
  /** Whether to optimize generated constraints */
  optimize?: boolean;
}

const factory = new Factory();

/**
 * Converter that transforms SPARQL queries into Noir ZKP circuit constraints
 */
export class SparqlToNoirConverter {
  private publicVariables = new Map<string, NoirTerm>();
  private privateVariables = new Map<string, NoirTerm>();
  private triplePatterns: TriplePattern[] = [];
  private filterConstraints: NoirConstraint[] = [];
  private bindingConstraints: NoirConstraint[] = [];
  private triplePatternCount = 0;
  private filterCount = 0;
  private options: Required<NoirConversionOptions>;

  constructor(options: NoirConversionOptions = {}) {
    this.options = {
      maxTriplePatterns: options.maxTriplePatterns ?? 10,
      maxDepth: options.maxDepth ?? 10,
      optimize: options.optimize ?? true
    };
  }

  /**
   * Convert a SPARQL query to Noir circuit constraints
   */
  public convert(sparqlQuery: string): SparqlToNoirResult {
    // Reset state
    this.publicVariables.clear();
    this.privateVariables.clear();
    this.triplePatterns = [];
    this.filterConstraints = [];
    this.bindingConstraints = [];
    this.triplePatternCount = 0;
    this.filterCount = 0;

    // Parse SPARQL to algebra
    const algebra = translate(sparqlQuery);
    
    // Convert algebra to constraints
    this.processOperation(algebra);

    // Extract SELECT variables 
    const selectVariables = this.extractSelectVariables(algebra);
    
    // Generate Noir code
    const variablesStruct = this.generateVariablesStruct();
    const checkBindingFunction = this.generateCheckBindingFunction();

    return {
      publicVariables: new Map(this.publicVariables),
      privateVariables: new Map(this.privateVariables),
      triplePatterns: [...this.triplePatterns],
      filterConstraints: [...this.filterConstraints],
      bindingConstraints: [...this.bindingConstraints],
      variablesStruct,
      checkBindingFunction,
      metadata: {
        originalQuery: sparqlQuery,
        algebra,
        triplePatternCount: this.triplePatternCount,
        filterCount: this.filterCount,
        selectVariables
      }
    };
  }

  /**
   * Extract SELECT variables from algebra
   */
  private extractSelectVariables(algebra: Algebra.Operation): string[] {
    if (algebra.type === Algebra.types.PROJECT) {
      return algebra.variables.map(v => v.value);
    }
    return [];
  }

  /**
   * Process an algebra operation
   */
  private processOperation(operation: Algebra.Operation): void {
    switch (operation.type) {
      case Algebra.types.PROJECT:
        this.processOperation(operation.input);
        break;
      
      case Algebra.types.BGP:
        this.processBGP(operation);
        break;
      
      case Algebra.types.JOIN:
        this.processOperation(operation.left);
        this.processOperation(operation.right);
        break;
      
      case Algebra.types.UNION:
        this.processUnion(operation);
        break;
      
      case Algebra.types.FILTER:
        this.processFilter(operation);
        break;
      
      case Algebra.types.EXTEND:
        this.processExtend(operation);
        break;
      
      case Algebra.types.GROUP:
        this.processOperation(operation.input);
        break;
      
      case Algebra.types.ORDER_BY:
      case Algebra.types.SLICE:
      case Algebra.types.DISTINCT:
        this.processOperation(operation.input);
        break;
      
      default:
        throw new Error(`Unsupported operation type: ${operation.type}`);
    }
  }

  /**
   * Process a Basic Graph Pattern
   */
  private processBGP(bgp: Algebra.Bgp): void {
    for (const pattern of bgp.patterns) {
      this.triplePatternCount++;
      const triplePattern = this.processTriplePattern(pattern);
      this.triplePatterns.push(triplePattern);
    }
  }

  /**
   * Process a single triple pattern
   */
  private processTriplePattern(pattern: Algebra.Pattern): TriplePattern {
    const subject = this.processTerm(pattern.subject);
    const predicate = this.processTerm(pattern.predicate);
    const object = this.processTerm(pattern.object);
    const graph = pattern.graph ? this.processTerm(pattern.graph) : undefined;

    return {
      subject,
      predicate,
      object,
      graph,
      proofPath: `bgp[${this.triplePatterns.length}].path`,
      index: this.triplePatterns.length
    };
  }

  /**
   * Process a UNION operation
   */
  private processUnion(union: Algebra.Union): void {
    // For now, we'll treat UNION as requiring at least one branch to be satisfied
    // This would need more sophisticated handling in a full implementation
    this.processOperation(union.left);
    this.processOperation(union.right);
    
    // Add a constraint that at least one branch must be satisfied
    this.filterConstraints.push({
      type: 'boolean',
      description: 'At least one UNION branch must be satisfied',
      noirCode: '// TODO: Implement UNION constraint logic',
      variables: []
    });
  }

  /**
   * Process a FILTER operation
   */
  private processFilter(filter: Algebra.Filter): void {
    this.filterCount++;
    this.processOperation(filter.input);
    
    const constraint = this.processExpression(filter.expression);
    this.filterConstraints.push(constraint);
  }

  /**
   * Process an EXTEND (BIND) operation
   */
  private processExtend(extend: Algebra.Extend): void {
    this.processOperation(extend.input);
    
    const varName = extend.variable.value;
    const varTerm = this.processTerm(extend.variable);
    const exprConstraint = this.processExpression(extend.expression);
    
    // Create a binding constraint
    this.bindingConstraints.push({
      type: 'equality',
      description: `Bind variable ${varName}`,
      noirCode: `assert(variables.${varName} == ${exprConstraint.noirCode});`,
      variables: [varName, ...exprConstraint.variables]
    });
  }

  /**
   * Process an expression into a Noir constraint
   */
  private processExpression(expression: Algebra.Expression): NoirConstraint {
    const simplified = simplifyExpression(expression);
    
    switch (simplified.expressionType) {
      case Algebra.expressionTypes.OPERATOR:
        return this.processOperatorExpression(simplified);
      
      case Algebra.expressionTypes.TERM:
        const term = this.processTerm(simplified.term);
        return {
          type: 'boolean',
          description: `Term ${term.name || term.value} is truthy`,
          noirCode: `${this.termToNoirCode(term)}`,
          variables: term.name ? [term.name] : []
        };
      
      default:
        throw new Error(`Unsupported expression type: ${simplified.expressionType}`);
    }
  }

  /**
   * Process an operator expression
   */
  private processOperatorExpression(op: Algebra.OperatorExpression): NoirConstraint {
    const equivalent = equivalentOperators(op);
    
    switch (equivalent.operator) {
      case SparqlOperator.EQUAL:
        if (equivalent.args.length !== 2) {
          throw new Error("EQUAL operator must have exactly two arguments");
        }
        const left = this.processExpression(equivalent.args[0]);
        const right = this.processExpression(equivalent.args[1]);
        return {
          type: 'equality',
          description: 'Equality constraint',
          noirCode: `assert(${left.noirCode} == ${right.noirCode});`,
          variables: [...left.variables, ...right.variables]
        };
      
      case SparqlOperator.GT:
      case SparqlOperator.LT:
      case SparqlOperator.GTE:
      case SparqlOperator.LTE:
        if (equivalent.args.length !== 2) {
          throw new Error(`${equivalent.operator} operator must have exactly two arguments`);
        }
        const leftComp = this.processExpression(equivalent.args[0]);
        const rightComp = this.processExpression(equivalent.args[1]);
        const noirOp = this.sparqlOperatorToNoir(equivalent.operator);
        return {
          type: 'assert',
          description: `Comparison: ${equivalent.operator}`,
          noirCode: `assert(${leftComp.noirCode} ${noirOp} ${rightComp.noirCode});`,
          variables: [...leftComp.variables, ...rightComp.variables]
        };
      
      case SparqlOperator.LOGICAL_AND:
        const andConstraints = equivalent.args.map((arg: Algebra.Expression) => this.processExpression(arg));
        return {
          type: 'boolean',
          description: 'Logical AND of multiple constraints',
          noirCode: andConstraints.map((c: NoirConstraint) => c.noirCode).join('\n  '),
          variables: andConstraints.flatMap((c: NoirConstraint) => c.variables)
        };
      
      case SparqlOperator.LOGICAL_OR:
        const orConstraints = equivalent.args.map((arg: Algebra.Expression) => this.processExpression(arg));
        return {
          type: 'boolean',
          description: 'Logical OR (at least one must be true)',
          noirCode: `assert(${orConstraints.map((c: NoirConstraint) => `(${c.noirCode})`).join(' | ')});`,
          variables: orConstraints.flatMap((c: NoirConstraint) => c.variables)
        };
      
      case SparqlOperator.NOT:
        if (equivalent.args.length !== 1) {
          throw new Error("NOT operator must have exactly one argument");
        }
        const notConstraint = this.processExpression(equivalent.args[0]);
        return {
          type: 'boolean',
          description: 'Logical NOT',
          noirCode: `assert(!(${notConstraint.noirCode}));`,
          variables: notConstraint.variables
        };
      
      case SparqlOperator.IS_IRI:
      case SparqlOperator.IS_BLANK:
      case SparqlOperator.IS_LITERAL:
        if (equivalent.args.length !== 1) {
          throw new Error(`${equivalent.operator} operator must have exactly one argument`);
        }
        const termExpr = this.processExpression(equivalent.args[0]);
        const checkCode = this.generateTypeCheckCode(equivalent.operator, termExpr.noirCode);
        return {
          type: 'boolean',
          description: `Type check: ${equivalent.operator}`,
          noirCode: checkCode,
          variables: termExpr.variables
        };
      
      default:
        throw new Error(`Unsupported operator: ${equivalent.operator}`);
    }
  }

  /**
   * Process an RDF term into a Noir term
   */
  private processTerm(term: Term): NoirTerm {
    if (term.termType === 'Variable') {
      const varTerm: NoirTerm = {
        type: 'variable',
        name: term.value
      };
      
      // Add to public variables (assuming SELECT variables are public)
      this.publicVariables.set(term.value, varTerm);
      
      return varTerm;
    } else {
      // Constants (IRIs, literals, blank nodes) become Field values
      const hash = this.termToFieldHash(term);
      return {
        type: 'constant',
        value: hash
      };
    }
  }

  /**
   * Convert a term to its Field hash representation
   */
  private termToFieldHash(term: Term): string {
    // This would use the same hashing logic as the existing encode functions
    // For now, return a placeholder
    if (term.termType === 'NamedNode') {
      return `std::hash::pedersen_hash([2, /* encoded IRI */])`;
    } else if (term.termType === 'Literal') {
      return `std::hash::pedersen_hash([0, /* encoded literal */])`;
    } else if (term.termType === 'BlankNode') {
      return `std::hash::pedersen_hash([1, /* encoded blank node */])`;
    }
    return '0';
  }

  /**
   * Convert a NoirTerm to Noir code
   */
  private termToNoirCode(term: NoirTerm): string {
    switch (term.type) {
      case 'variable':
        return `variables.${term.name}`;
      case 'constant':
        return String(term.value);
      case 'computed':
        return term.expression || '0';
      default:
        return '0';
    }
  }

  /**
   * Convert SPARQL operator to Noir operator
   */
  private sparqlOperatorToNoir(op: SparqlOperator): string {
    switch (op) {
      case SparqlOperator.GT: return '>';
      case SparqlOperator.LT: return '<';
      case SparqlOperator.GTE: return '>=';
      case SparqlOperator.LTE: return '<=';
      default: return '==';
    }
  }

  /**
   * Generate type check code for IS_IRI, IS_LITERAL, etc.
   */
  private generateTypeCheckCode(operator: SparqlOperator, termCode: string): string {
    switch (operator) {
      case SparqlOperator.IS_IRI:
        // Check if the term has IRI encoding (type prefix 2)
        return `(${termCode} & 0xFF) == 2`;
      case SparqlOperator.IS_LITERAL:
        // Check if the term has literal encoding (type prefix 0)
        return `(${termCode} & 0xFF) == 0`;
      case SparqlOperator.IS_BLANK:
        // Check if the term has blank node encoding (type prefix 1)
        return `(${termCode} & 0xFF) == 1`;
      default:
        return 'false';
    }
  }

  /**
   * Generate the Variables struct for Noir
   */
  private generateVariablesStruct(): string {
    const fields = Array.from(this.publicVariables.keys())
      .map(varName => `  pub(crate) ${varName}: Field,`)
      .join('\n');
    
    return `pub(crate) struct Variables {\n${fields}\n}`;
  }

  /**
   * Generate the checkBinding function for Noir
   */
  private generateCheckBindingFunction(): string {
    let code = 'pub(crate) fn checkBinding(bgp: BGP, variables: Variables, hidden: Hidden) {\n';
    
    // Add triple pattern constraints
    for (const pattern of this.triplePatterns) {
      const subjectCode = this.termToNoirCode(pattern.subject);
      const predicateCode = this.termToNoirCode(pattern.predicate);
      const objectCode = this.termToNoirCode(pattern.object);
      
      code += `  assert(${subjectCode} == bgp[${pattern.index}].terms[0]);\n`;
      code += `  assert(${predicateCode} == bgp[${pattern.index}].terms[1]);\n`;
      code += `  assert(${objectCode} == bgp[${pattern.index}].terms[2]);\n`;
    }
    
    // Add filter constraints
    for (const constraint of this.filterConstraints) {
      code += `  ${constraint.noirCode}\n`;
    }
    
    // Add binding constraints
    for (const constraint of this.bindingConstraints) {
      code += `  ${constraint.noirCode}\n`;
    }
    
    code += '}';
    return code;
  }
}

/**
 * Convenience function to convert SPARQL to Noir constraints
 */
export function sparqlToNoir(
  sparqlQuery: string,
  options?: NoirConversionOptions
): SparqlToNoirResult {
  const converter = new SparqlToNoirConverter(options);
  return converter.convert(sparqlQuery);
}
