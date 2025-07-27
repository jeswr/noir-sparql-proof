import * as fs from "fs";
import { Algebra, Factory, translate } from "sparqlalgebrajs";
import { DataFactory as DF } from "n3";
import { getTermEncodings, getTermEncodingString, hash2, hash4 } from "./encode.js";
import { simplifyExpression, simplifyExpressionEBV } from "./expressionSimplifier.js";
import { optimizeExpression } from "./optimize.js";
import { getIndex } from "./termId.js";
import { operator as equivalentOperators } from "./equivalentOperators.js";
import { BindConstraint, CircomTerm, Computed, ComputedBinary, Constraint, Static, Var } from "./types.js";
import { SparqlOperator } from "@comunica/utils-expression-evaluator";

// Enhanced type definitions for better SPARQL 1.1 support
interface CircuitContext {
  variables: Set<string>;
  bindings: Map<string, CircomTerm>;
  constraints: Constraint[];
  hiddenInputs: CircomTerm[];
  inputPatterns: Algebra.Pattern[];
  optionalPatterns: Algebra.Pattern[];
  computedTerms: Map<string, CircomTerm>;
}

interface ExpressionResult {
  term: CircomTerm;
  constraints: Constraint[];
}

// Core expression evaluation with comprehensive SPARQL 1.1 support
function evaluateExpression(expr: Algebra.Expression, context: CircuitContext): ExpressionResult {
  const simplified = simplifyExpression(expr);
  
  switch (simplified.expressionType) {
    case Algebra.expressionTypes.TERM:
      return { term: termToCircomTerm(simplified), constraints: [] };
    
    case Algebra.expressionTypes.OPERATOR:
      return evaluateOperator(simplified, context);
    
    default:
      throw new Error(`Unsupported expression type: ${simplified.expressionType}`);
  }
}

function termToCircomTerm(term: Algebra.TermExpression): CircomTerm {
  switch (term.term.termType) {
    case "Variable":
      return { type: "variable", value: term.term.value };
    case "Literal":
    case "NamedNode":
      return { type: "static", value: term.term };
    default:
      throw new Error(`Unsupported term type: ${term.term.termType}`);
  }
}

function evaluateOperator(op: Algebra.OperatorExpression, context: CircuitContext): ExpressionResult {
  const normalizedOp = equivalentOperators(op);
  
  // Handle case where equivalentOperators returns a non-operator expression
  if (normalizedOp.expressionType !== Algebra.expressionTypes.OPERATOR) {
    return evaluateExpression(normalizedOp, context);
  }
  
  const operatorExpr = normalizedOp as Algebra.OperatorExpression;
  
  switch (operatorExpr.operator) {
    // Logical operators
    case SparqlOperator.LOGICAL_AND:
    case SparqlOperator.LOGICAL_OR:
      return evaluateLogicalOperator(operatorExpr, context);
    
    // Comparison operators
    case SparqlOperator.EQUAL:
    case SparqlOperator.NOT_EQUAL:
    case SparqlOperator.GT:
    case SparqlOperator.LT:
    case SparqlOperator.GTE:
    case SparqlOperator.LTE:
      return evaluateComparisonOperator(operatorExpr, context);
    
    // Unary operators
    case SparqlOperator.NOT:
      return evaluateUnaryOperator(operatorExpr, context);
    
    // Type checking operators
    case SparqlOperator.IS_IRI:
    case SparqlOperator.IS_BLANK:
    case SparqlOperator.IS_LITERAL:
      return evaluateTypeCheckOperator(operatorExpr, context);
    
    // String functions
    case SparqlOperator.LANG:
    case SparqlOperator.STR:
      return evaluateStringFunction(operatorExpr, context);
    
    // Numeric functions
    case SparqlOperator.ABS:
    case SparqlOperator.ROUND:
    case SparqlOperator.CEIL:
    case SparqlOperator.FLOOR:
      return evaluateNumericFunction(operatorExpr, context);
    
    // Conditional operators
    case SparqlOperator.IF:
      return evaluateConditionalOperator(operatorExpr, context);
    
    // List operators
    case SparqlOperator.IN:
    case SparqlOperator.NOT_IN:
      return evaluateListOperator(operatorExpr, context);
    
    default:
      throw new Error(`Unsupported operator: ${operatorExpr.operator}`);
  }
}

function evaluateLogicalOperator(op: Algebra.OperatorExpression, context: CircuitContext): ExpressionResult {
  const constraintType = op.operator === SparqlOperator.LOGICAL_AND ? "all" : "some";
  const constraints: Constraint[] = [];
  
  for (const arg of op.args) {
    const result = evaluateExpression(arg, context);
    if (result.term.type === "static" && result.term.value.termType === "Literal") {
      // Handle boolean literals
      const boolValue = result.term.value.value === "true";
      constraints.push({ type: "boolean", value: boolValue });
    } else {
      // Convert to boolean constraint
      constraints.push({ type: "=", left: result.term, right: { type: "static", value: DF.literal("true") } });
    }
  }
  
  return {
    term: { type: "static", value: DF.literal("true") }, // Placeholder
    constraints: [{ type: constraintType, constraints }]
  };
}

function evaluateComparisonOperator(op: Algebra.OperatorExpression, context: CircuitContext): ExpressionResult {
  if (op.args.length !== 2) {
    throw new Error(`Comparison operator ${op.operator} requires exactly 2 arguments`);
  }
  
  const left = evaluateExpression(op.args[0], context);
  const right = evaluateExpression(op.args[1], context);
  
  // Handle numeric comparisons
  if (isNumericOperator(op.operator as SparqlOperator)) {
    return evaluateNumericComparison(left.term, right.term, op.operator as SparqlOperator, context);
  }
  
  // Handle equality/inequality
  const constraint: Constraint = {
    type: "=",
    left: left.term,
    right: right.term
  };
  
  if (op.operator === SparqlOperator.NOT_EQUAL) {
    return {
      term: { type: "static", value: DF.literal("true") },
      constraints: [{ type: "not", constraint }]
    };
  }
  
  return {
    term: { type: "static", value: DF.literal("true") },
    constraints: [constraint]
  };
}

function evaluateUnaryOperator(op: Algebra.OperatorExpression, context: CircuitContext): ExpressionResult {
  if (op.args.length !== 1) {
    throw new Error(`Unary operator ${op.operator} requires exactly 1 argument`);
  }
  
  const arg = evaluateExpression(op.args[0], context);
  
  if (op.operator === SparqlOperator.NOT) {
    return {
      term: { type: "static", value: DF.literal("true") },
      constraints: [{ type: "not", constraint: { type: "=", left: arg.term, right: { type: "static", value: DF.literal("true") } } }]
    };
  }
  
  throw new Error(`Unsupported unary operator: ${op.operator}`);
}

function evaluateTypeCheckOperator(op: Algebra.OperatorExpression, context: CircuitContext): ExpressionResult {
  if (op.args.length !== 1) {
    throw new Error(`Type check operator ${op.operator} requires exactly 1 argument`);
  }
  
  const arg = evaluateExpression(op.args[0], context);
  
  return {
    term: { type: "computed", input: arg.term, computedType: op.operator as SparqlOperator },
    constraints: []
  };
}

function evaluateStringFunction(op: Algebra.OperatorExpression, context: CircuitContext): ExpressionResult {
  if (op.args.length !== 1) {
    throw new Error(`String function ${op.operator} requires exactly 1 argument`);
  }
  
  const arg = evaluateExpression(op.args[0], context);
  
  return {
    term: { type: "computed", input: arg.term, computedType: op.operator as SparqlOperator },
    constraints: []
  };
}

function evaluateNumericFunction(op: Algebra.OperatorExpression, context: CircuitContext): ExpressionResult {
  if (op.args.length !== 1) {
    throw new Error(`Numeric function ${op.operator} requires exactly 1 argument`);
  }
  
  const arg = evaluateExpression(op.args[0], context);
  
  return {
    term: { type: "computed", input: arg.term, computedType: op.operator as SparqlOperator },
    constraints: []
  };
}

function evaluateConditionalOperator(op: Algebra.OperatorExpression, context: CircuitContext): ExpressionResult {
  if (op.args.length !== 3) {
    throw new Error(`IF operator requires exactly 3 arguments`);
  }
  
  const condition = evaluateExpression(op.args[0], context);
  const thenExpr = evaluateExpression(op.args[1], context);
  const elseExpr = evaluateExpression(op.args[2], context);
  
  // Create conditional constraint
  const constraint: Constraint = {
    type: "some",
    constraints: [
      { type: "all", constraints: [
        { type: "=", left: condition.term, right: { type: "static", value: DF.literal("true") } },
        { type: "=", left: { type: "variable", value: "result" }, right: thenExpr.term }
      ]},
      { type: "all", constraints: [
        { type: "=", left: condition.term, right: { type: "static", value: DF.literal("false") } },
        { type: "=", left: { type: "variable", value: "result" }, right: elseExpr.term }
      ]}
    ]
  } as Constraint;
  
  return {
    term: { type: "variable", value: "result" },
    constraints: [constraint]
  };
}

function evaluateListOperator(op: Algebra.OperatorExpression, context: CircuitContext): ExpressionResult {
  if (op.args.length < 2) {
    throw new Error(`List operator ${op.operator} requires at least 2 arguments`);
  }
  
  const value = evaluateExpression(op.args[0], context);
  const list = op.args.slice(1).map(arg => evaluateExpression(arg, context));
  
  // Create IN/NOT IN constraint
  const listConstraints = list.map(item => ({
    type: "=",
    left: value.term,
    right: item.term
  }));
  
  const constraint: Constraint = {
    type: op.operator === SparqlOperator.IN ? "some" : "not",
    constraints: listConstraints
  } as Constraint;
  
  if (op.operator === SparqlOperator.NOT_IN) {
    return {
      term: { type: "static", value: DF.literal("true") },
      constraints: [{ type: "all", constraints: listConstraints.map(c => ({ type: "not", constraint: c })) } as Constraint]
    };
  }
  
  return {
    term: { type: "static", value: DF.literal("true") },
    constraints: [constraint]
  };
}

function evaluateNumericComparison(left: CircomTerm, right: CircomTerm, operator: SparqlOperator, context: CircuitContext): ExpressionResult {
  // Ensure both terms are numeric
  const leftNumeric = ensureNumericTerm(left, context);
  const rightNumeric = ensureNumericTerm(right, context);
  
  const constraint: Constraint = {
    type: "binary",
    left: leftNumeric,
    right: rightNumeric,
    operator
  };
  
  return {
    term: { type: "static", value: DF.literal("true") },
    constraints: [constraint]
  };
}

function ensureNumericTerm(term: CircomTerm, context: CircuitContext): CircomTerm {
  if (term.type === "static" && term.value.termType === "Literal") {
    const datatype = term.value.datatype?.value;
    if (datatype && (datatype.includes("integer") || datatype.includes("decimal") || datatype.includes("double"))) {
      return term;
    }
  }
  
  // Add computed term for numeric conversion
  const computedTerm: Computed = {
    type: "computed",
    input: term,
    computedType: SparqlOperator.ABS // Use as placeholder for numeric conversion
  };
  
  return computedTerm;
}

function isNumericOperator(operator: SparqlOperator): boolean {
  return [SparqlOperator.GT, SparqlOperator.LT, SparqlOperator.GTE, SparqlOperator.LTE].includes(operator);
}

// Pattern handling with enhanced support
function handlePatterns(patterns: (Algebra.Pattern | Algebra.Path)[], context: CircuitContext): void {
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    
    if (pattern.graph.termType !== "DefaultGraph") {
      throw new Error("Only default graph patterns are supported");
    }
    
    if (pattern.type === Algebra.types.PATH) {
      handlePathPattern(pattern, i, context);
    } else {
      handleBasicPattern(pattern, i, context);
    }
  }
}

function handleBasicPattern(pattern: Algebra.Pattern, index: number, context: CircuitContext): void {
  context.inputPatterns.push(pattern);
  
  const positions = ['subject', 'predicate', 'object'] as const;
  
  for (let j = 0; j < 3; j++) {
    const term = pattern[positions[j]];
    
    if (term.termType === "Variable") {
      const varName = term.value;
      const inputTerm: CircomTerm = { type: "input", value: [index, j] };
      
      if (context.variables.has(varName)) {
        // Variable already bound - add equality constraint
        context.constraints.push({
          type: "=",
          left: { type: "variable", value: varName },
          right: inputTerm
        });
      } else {
        // New variable - add binding
        context.variables.add(varName);
        context.bindings.set(varName, inputTerm);
      }
    } else if (term.termType === "NamedNode" || term.termType === "Literal") {
      // Static term - add equality constraint
      context.constraints.push({
        type: "=",
        left: { type: "static", value: term },
        right: { type: "input", value: [index, j] }
      });
    } else {
      throw new Error(`Unsupported term type: ${term.termType}`);
    }
  }
}

function handlePathPattern(pattern: Algebra.Path, index: number, context: CircuitContext): void {
  if (pattern.predicate.type === "ZeroOrOnePath") {
    handleZeroOrOnePath(pattern, index, context);
  } else if (pattern.predicate.type === "OneOrMorePath") {
    handleOneOrMorePath(pattern, index, context);
  } else if (pattern.predicate.type === "ZeroOrMorePath") {
    handleZeroOrMorePath(pattern, index, context);
  } else {
    throw new Error(`Unsupported path type: ${pattern.predicate.type}`);
  }
}

function handleZeroOrOnePath(pattern: Algebra.Path, index: number, context: CircuitContext): void {
  if (pattern.predicate.path.type !== Algebra.types.LINK) {
    throw new Error("ZeroOrOnePath only supports LINK paths");
  }
  
  // Add optional pattern
  const optionalPattern = new Factory().createPattern(
    pattern.subject,
    pattern.predicate.path.iri,
    pattern.object,
    pattern.graph
  );
  context.optionalPatterns.push(optionalPattern);
  
  // Create constraint: subject = object OR (subject, predicate, object) matches input
  const zeroPathConstraint: Constraint = {
    type: "=",
    left: { type: "variable", value: pattern.subject.value },
    right: { type: "variable", value: pattern.object.value }
  };
  
  const onePathConstraint: Constraint = {
    type: "all",
    constraints: [
      { type: "=", left: { type: "variable", value: pattern.subject.value }, right: { type: "input", value: [index, 0] } },
      { type: "=", left: { type: "static", value: pattern.predicate.path.iri }, right: { type: "input", value: [index, 1] } },
      { type: "=", left: { type: "variable", value: pattern.object.value }, right: { type: "input", value: [index, 2] } }
    ]
  };
  
  context.constraints.push({
    type: "some",
    constraints: [zeroPathConstraint, onePathConstraint]
  });
}

function handleOneOrMorePath(pattern: Algebra.Path, index: number, context: CircuitContext): void {
  // Simplified implementation - treat as regular pattern for now
  handleBasicPattern(pattern as any, index, context);
}

function handleZeroOrMorePath(pattern: Algebra.Path, index: number, context: CircuitContext): void {
  // Simplified implementation - treat as optional pattern
  handleZeroOrOnePath(pattern, index, context);
}

// Main operation handlers
function handleFilter(filter: Algebra.Filter, context: CircuitContext): void {
  const expression = evaluateExpression(filter.expression, context);
  
  // Add expression constraints
  context.constraints.push(...expression.constraints);
  
  // If expression returns a boolean term, add it as a constraint
  if (expression.term.type === "static" && expression.term.value.termType === "Literal") {
    const boolValue = expression.term.value.value === "true";
    context.constraints.push({ type: "boolean", value: boolValue });
  }
}

function handleExtend(extend: Algebra.Extend, context: CircuitContext): void {
  const expression = evaluateExpression(extend.expression, context);
  
  // Add binding for extended variable
  context.bindings.set(extend.variable.value, expression.term);
  
  // Add expression constraints
  context.constraints.push(...expression.constraints);
}

function handleJoin(join: Algebra.Join, context: CircuitContext): void {
  // Process all inputs and merge their patterns
  for (const input of join.input) {
    processOperation(input, context);
  }
}

function handleProject(project: Algebra.Project, context: CircuitContext): string[] {
  // Process the input operation
  processOperation(project.input, context);
  
  // Return the projected variables
  return project.variables.map(v => v.value);
}

function processOperation(op: Algebra.Operation, context: CircuitContext): void {
  switch (op.type) {
    case Algebra.types.FILTER:
      handleFilter(op, context);
      break;
    case Algebra.types.BGP:
      handlePatterns(op.patterns, context);
      break;
    case Algebra.types.EXTEND:
      handleExtend(op, context);
      break;
    case Algebra.types.JOIN:
      handleJoin(op, context);
      break;
    case Algebra.types.PROJECT:
      // This should be handled at the top level
      throw new Error("PROJECT operations should be handled at the top level");
    default:
      throw new Error(`Unsupported operation type: ${op.type}`);
  }
}

// Circuit generation with improved security
function generateCircuitCode(context: CircuitContext, variables: string[]): string {
  let output = 'use crate::types::Triple;\n\n';
  
  // Type definitions
  output += `pub(crate) type BGP = [Triple; ${context.inputPatterns.length}];\n`;
  if (context.hiddenInputs.length > 0) {
    output += `pub(crate) type Hidden = [Field; ${context.hiddenInputs.length}];\n`;
  }
  
  // Variables struct
  output += `pub(crate) struct Variables {\n`;
  for (const variable of variables) {
    output += `  pub(crate) ${variable}: Field,\n`;
  }
  output += `}\n\n`;
  
  // Main function
  output += `pub(crate) fn checkBinding(bgp: BGP, variables: Variables${context.hiddenInputs.length > 0 ? ', hidden: Hidden' : ''}) {\n`;
  
  // Generate constraints
  const optimizedConstraints = optimizeExpression({
    type: "all",
    constraints: context.constraints
  } as any);
  
  for (const constraint of (optimizedConstraints as any).type === "all" ? (optimizedConstraints as any).constraints : [optimizedConstraints]) {
    output += `  assert(${serializeConstraint(constraint, context)});\n`;
  }
  
  output += `}\n`;
  
  return output;
}

function serializeConstraint(constraint: Constraint, context: CircuitContext): string {
  switch (constraint.type) {
    case "all":
    case "some":
      const operator = constraint.type === "all" ? " & " : " | ";
      return constraint.constraints.map(c => `(${serializeConstraint(c, context)})`).join(operator);
    
    case "not":
      return `(${serializeConstraint(constraint.constraint, context)}) == false`;
    
    case "=":
      return `${serializeTerm(constraint.left, context)} == ${serializeTerm(constraint.right, context)}`;
    
    case "binary":
      return `${serializeNumericTerm(constraint.left, context)} ${getBinaryOperator(constraint.operator)} ${serializeNumericTerm(constraint.right, context)}`;
    
    case "boolean":
      return constraint.value.toString();
    
    default:
      throw new Error(`Unsupported constraint type: ${(constraint as any).type}`);
  }
}

function serializeTerm(term: CircomTerm, context: CircuitContext): string {
  switch (term.type) {
    case "static":
      return getTermEncodings([term.value])[0].toString();
    
    case "variable":
      return `variables.${term.value}`;
    
    case "input":
      return `bgp[${term.value[0]}].terms[${term.value[1]}]`;
    
    case "computed":
      return serializeComputedTerm(term, context);
    
    case "computedBinary":
      return serializeComputedBinaryTerm(term, context);
    
    default:
      throw new Error(`Unsupported term type: ${(term as any).type}`);
  }
}

function serializeComputedTerm(term: Computed, context: CircuitContext): string {
  const input = serializeTerm(term.input, context);
  
  switch (term.computedType) {
    case SparqlOperator.IS_IRI:
    case SparqlOperator.IS_BLANK:
    case SparqlOperator.IS_LITERAL:
      return `isType(${input}, ${getTypeConstant(term.computedType)})`;
    
    case SparqlOperator.LANG:
      return `getLang(${input})`;
    
    case SparqlOperator.STR:
      return `getStr(${input})`;
    
    default:
      throw new Error(`Unsupported computed type: ${term.computedType}`);
  }
}

function serializeComputedBinaryTerm(term: ComputedBinary, context: CircuitContext): string {
  const left = serializeTerm(term.left, context);
  const right = serializeTerm(term.right, context);
  
  switch (term.computedType) {
    case SparqlOperator.EQUAL:
      return `${left} == ${right}`;
    
    default:
      throw new Error(`Unsupported computed binary type: ${term.computedType}`);
  }
}

function serializeNumericTerm(term: CircomTerm, context: CircuitContext): string {
  const serialized = serializeTerm(term, context);
  
  if (term.type === "static" && term.value.termType === "Literal") {
    const datatype = term.value.datatype?.value;
    if (datatype && datatype.includes("integer")) {
      return parseInt(term.value.value, 10).toString();
    }
  }
  
  return `(${serialized} as i32)`;
}

function getBinaryOperator(operator: SparqlOperator): string {
  switch (operator) {
    case SparqlOperator.GT: return ">";
    case SparqlOperator.LT: return "<";
    case SparqlOperator.GTE: return ">=";
    case SparqlOperator.LTE: return "<=";
    default:
      throw new Error(`Unsupported binary operator: ${operator}`);
  }
}

function getTypeConstant(type: SparqlOperator): string {
  switch (type) {
    case SparqlOperator.IS_IRI: return "0";
    case SparqlOperator.IS_BLANK: return "1";
    case SparqlOperator.IS_LITERAL: return "2";
    default:
      throw new Error(`Unsupported type constant: ${type}`);
  }
}

// Main generation function
export function generateCircuit(queryFilePath: string = "./inputs/sparql.rq", options: { termSize?: number; version?: string } = {}) {
  const query = fs.readFileSync(queryFilePath, "utf8");
  const translated = translate(query);
  
  if (translated.type !== Algebra.types.PROJECT) {
    throw new Error("Expected a PROJECT operation at the top level");
  }
  
  // Initialize context
  const context: CircuitContext = {
    variables: new Set(),
    bindings: new Map(),
    constraints: [],
    hiddenInputs: [],
    inputPatterns: [],
    optionalPatterns: [],
    computedTerms: new Map()
  };
  
  // Process the query
  const variables = handleProject(translated, context);
  
  // Generate circuit code
  const circuit = generateCircuitCode(context, variables);
  
  // Generate main verification code
  const main = fs.readFileSync("./template/main-verify.template.nr", "utf8")
    .replace("{{h0}}", context.hiddenInputs.length > 0 ? ", Hidden" : "")
    .replace("{{h1}}", context.hiddenInputs.length > 0 ? ",\n    hidden: Hidden" : "")
    .replace("{{h2}}", context.hiddenInputs.length > 0 ? ", hidden" : "")
    .replace("{{hash2}}", hash2)
    .replace("{{hash4}}", hash4);
  
  return {
    circuit,
    main,
    metadata: {
      variables,
      inputPatterns: context.inputPatterns,
      optionalPatterns: context.optionalPatterns,
      hiddenInputs: context.hiddenInputs,
      bindings: Object.fromEntries(context.bindings),
      constraints: context.constraints
    }
  };
}

// Run the generator if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const { circuit, metadata, main } = generateCircuit();
  fs.writeFileSync("./noir_prove/src/sparql.nr", circuit);
  fs.writeFileSync("./noir_prove/src/main.nr", main);
  fs.writeFileSync("./noir_prove/metadata.json", JSON.stringify(metadata, null, 2));
}