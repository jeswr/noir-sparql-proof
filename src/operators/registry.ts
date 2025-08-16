import { SparqlOperator } from '@comunica/utils-expression-evaluator';
import type { Algebra } from 'sparqlalgebrajs';

/** Value categories aligned with IR spec */
export type ValueCategory =
  | 'IRI' | 'BlankNode' | 'SimpleLiteral' | 'TypedLiteral' | 'NumericInteger' | 'NumericDecimal'
  | 'NumericFloatDouble' | 'Boolean' | 'LangString' | 'DateTime' | 'Date' | 'Time' | 'Duration'
  | 'StringLike' | 'Term' | 'Error' | 'Unknown';

export type NormalisationStep =
  | { kind: 'NumericCanonical'; target: 'Integer' | 'Decimal' | 'FloatDouble' }
  | { kind: 'LangTagExtract' }
  | { kind: 'DatatypeAssert'; datatype: string }
  | { kind: 'EBVCoerce' }
  | { kind: 'StringToNumericAttempt' }
  | { kind: 'DateTimeParse' };

/** Declarative semantics descriptor */
export interface OperatorSemantics {
  op: SparqlOperator | string;                    // string for extensions (e.g. 'strbefore')
  arity: number | { min: number; max?: number };  // max undefined => unbounded upper
  /** Each inner array is one acceptable signature (sequence of categories). 'Any' wildcard = Term */
  signatures: ValueCategory[][];                  // e.g. [["NumericInteger","NumericInteger"],["NumericDecimal","NumericDecimal"]]
  /** Determine (or compute) result category */
  result: ValueCategory | ((args: ValueCategory[]) => ValueCategory);
  /** Coercions required prior to evaluation (static list or computed) */
  coercions: NormalisationStep[] | ((args: ValueCategory[]) => NormalisationStep[]);
  /** Whether expression already EBV (no further EBV coercion) */
  ebv: boolean;
  /** Lowering tag used by backend to select Noir gadget/template */
  lower: string;                                   // e.g. 'cmp_numeric', 'logic_and', 'eq_term'
  /** Spec reference (section anchor or URL fragment) */
  specRef: string;
  /** Free-form notes to aid auditing */
  notes?: string;
}

/** Internal registry map */
const REGISTRY: Record<string, OperatorSemantics> = Object.create(null);

function def(op: OperatorSemantics) {
  REGISTRY[op.op] = Object.freeze(op);
}

/** Helper to build simple fixed-arity operator */
function simple(op: SparqlOperator, arity: number, signatures: ValueCategory[][], result: OperatorSemantics['result'], lower: string, specRef: string, opts?: Partial<Omit<OperatorSemantics, 'op' | 'arity' | 'signatures' | 'result' | 'lower' | 'specRef' | 'coercions' | 'ebv'>>) : OperatorSemantics {
  return {
    op,
    arity,
    signatures,
    result,
    coercions: [],
    ebv: result === 'Boolean',
    lower,
    specRef,
    ...opts,
  };
}

// Logical operators (short-circuit semantics modelled at higher layer; here treat as boolean op gadgets)
def(simple(
  SparqlOperator.LOGICAL_AND,
  2,
  [['Boolean', 'Boolean']],
  'Boolean',
  'logic_and',
  '#sparql-logical-and'
));

def(simple(
  SparqlOperator.LOGICAL_OR,
  2,
  [['Boolean', 'Boolean']],
  'Boolean',
  'logic_or',
  '#sparql-logical-or'
));

def(simple(
  SparqlOperator.NOT,
  1,
  [['Boolean']],
  'Boolean',
  'logic_not',
  '#operandDataTypes'
));

// Equality (term / value). For now: treat all terms; numeric path optimised separately.
// Signatures kept broad; downstream planner may refine & insert coercions.
def({
  op: SparqlOperator.EQUAL,
  arity: 2,
  signatures: [
    ['Term', 'Term']
  ],
  result: 'Boolean',
  coercions: [],
  ebv: true,
  lower: 'eq_term',
  specRef: '#func-RDFterm-equal',
  notes: 'Uses term encoding equality; numeric canonicalization performed earlier if numeric categories.'
});

// Relational numeric comparisons share coercion rule to numeric canonical
const relationalCoercion = (args: ValueCategory[]): NormalisationStep[] => [
  { kind: 'NumericCanonical', target: 'Integer' } // placeholder: generalise to detect decimal/float
];

def({
  op: SparqlOperator.GT,
  arity: 2,
  signatures: [['Term', 'Term']], // planner ensures numeric categories
  result: 'Boolean',
  coercions: relationalCoercion,
  ebv: true,
  lower: 'cmp_numeric_gt',
  specRef: '#func-numeric-compare',
  notes: 'Requires both operands numeric after canonicalization.'
});

def({
  op: SparqlOperator.LT,
  arity: 2,
  signatures: [['Term', 'Term']],
  result: 'Boolean',
  coercions: relationalCoercion,
  ebv: true,
  lower: 'cmp_numeric_lt',
  specRef: '#func-numeric-compare'
});

def({
  op: SparqlOperator.GTE,
  arity: 2,
  signatures: [['Term', 'Term']],
  result: 'Boolean',
  coercions: relationalCoercion,
  ebv: true,
  lower: 'cmp_numeric_gte',
  specRef: '#func-numeric-compare'
});

def({
  op: SparqlOperator.LTE,
  arity: 2,
  signatures: [['Term', 'Term']],
  result: 'Boolean',
  coercions: relationalCoercion,
  ebv: true,
  lower: 'cmp_numeric_lte',
  specRef: '#func-numeric-compare'
});

// Type tests
for (const [op, cat, tag, ref] of [
  [SparqlOperator.IS_IRI, 'IRI', 'is_iri', '#func-isIRI'],
  [SparqlOperator.IS_BLANK, 'BlankNode', 'is_blank', '#func-isBlank'],
  [SparqlOperator.IS_LITERAL, 'Literal', 'is_literal', '#func-isLiteral'],
] as const) {
  def({
    op,
    arity: 1,
    signatures: [['Term']],
    result: 'Boolean',
    coercions: [],
    ebv: true,
    lower: tag,
    specRef: ref,
    notes: `True iff operand category resolves to ${cat}.`
  });
}

// LANGUAGE tag extraction (LANG)
def({
  op: SparqlOperator.LANG,
  arity: 1,
  signatures: [['Term']],
  result: 'LangString', // Actually returns a (possibly empty) simple literal; category kept for planner reuse
  coercions: [{ kind: 'LangTagExtract' }],
  ebv: false,
  lower: 'lang_extract',
  specRef: '#func-lang',
  notes: 'Returns language tag literal or empty string literal.'
});

// BOUND (handled as special form; still recorded for consistency)
def({
  op: SparqlOperator.BOUND,
  arity: 1,
  signatures: [['Term']],
  result: 'Boolean',
  coercions: [],
  ebv: true,
  lower: 'bound_check',
  specRef: '#func-bound'
});

// Arithmetic numeric coercion helper
const numericCoercion = (args: ValueCategory[]): NormalisationStep[] => [
  { kind: 'NumericCanonical', target: 'Integer' }
];

// Arithmetic operators (correct enum names)

def({
  op: SparqlOperator.ADDITION,
  arity: 2,
  signatures: [['Term','Term']],
  result: (a) => a[0],
  coercions: numericCoercion,
  ebv: false,
  lower: 'arith_add',
  specRef: '#func-numeric-add'
});

def({
  op: SparqlOperator.SUBTRACTION,
  arity: 2,
  signatures: [['Term','Term']],
  result: (a) => a[0],
  coercions: numericCoercion,
  ebv: false,
  lower: 'arith_sub',
  specRef: '#func-numeric-sub'
});

def({
  op: SparqlOperator.MULTIPLICATION,
  arity: 2,
  signatures: [['Term','Term']],
  result: (a) => a[0],
  coercions: numericCoercion,
  ebv: false,
  lower: 'arith_mul',
  specRef: '#func-numeric-multiply'
});

def({
  op: SparqlOperator.DIVISION,
  arity: 2,
  signatures: [['Term','Term']],
  result: (a) => a[0],
  coercions: numericCoercion,
  ebv: false,
  lower: 'arith_div',
  specRef: '#func-numeric-divide',
  notes: 'Division by zero check performed in gadget.'
});

// STRLEN

def({
  op: SparqlOperator.STRLEN,
  arity: 1,
  signatures: [['Term']],
  result: 'NumericInteger',
  coercions: [],
  ebv: false,
  lower: 'strlen',
  specRef: '#func-strlen'
});

// CONCAT (variadic ≥2)

def({
  op: SparqlOperator.CONCAT,
  arity: { min: 2 },
  signatures: [['Term','Term']], // planner will allow more; we only check minimum here
  result: 'StringLike',
  coercions: [],
  ebv: false,
  lower: 'concat',
  specRef: '#func-concat'
});

// UCASE / LCASE
for (const [op, tag, ref] of [
  [SparqlOperator.UCASE, 'ucase', '#func-ucase'],
  [SparqlOperator.LCASE, 'lcase', '#func-lcase'],
] as const) {
  def({
    op,
    arity: 1,
    signatures: [['Term']],
    result: 'StringLike',
    coercions: [],
    ebv: false,
    lower: tag,
    specRef: ref
  });
}

// CONTAINS (string containment)

def({
  op: SparqlOperator.CONTAINS,
  arity: 2,
  signatures: [['Term','Term']],
  result: 'Boolean',
  coercions: [],
  ebv: true,
  lower: 'contains',
  specRef: '#func-contains'
});

export function getOperator(op: SparqlOperator | string): OperatorSemantics | undefined {
  return REGISTRY[op];
}

export function listOperators(): OperatorSemantics[] {
  return Object.values(REGISTRY).sort((a, b) => String(a.op).localeCompare(String(b.op)));
}

/** Validate an Algebra.OperatorExpression against registry */
export function validateOperator(expr: Algebra.OperatorExpression, argCategories: ValueCategory[]): { semantics: OperatorSemantics; coercions: NormalisationStep[] } {
  const semantics = getOperator(expr.operator);
  if (!semantics) throw new Error(`UNSUPPORTED_OPERATOR: ${expr.operator}`);
  const arity = typeof semantics.arity === 'number' ? semantics.arity : undefined;
  if (arity !== undefined && expr.args.length !== arity) {
    throw new Error(`TYPE_MISMATCH: expected arity ${arity}, got ${expr.args.length}`);
  }
  // Signature matching (simple first match strategy)
  let matched = false;
  for (const sig of semantics.signatures) {
    if (sig.length === expr.args.length) { matched = true; break; }
  }
  if (!matched) throw new Error(`TYPE_MISMATCH: no matching signature for ${expr.operator}`);
  const coercions = typeof semantics.coercions === 'function' ? semantics.coercions(argCategories) : semantics.coercions;
  return { semantics, coercions };
}

/** Register (or override) an operator at runtime (advanced / testing) */
export function registerCustom(op: OperatorSemantics) { def(op); }

// Export raw registry for auditing (read-only by freezing entries already) *avoid mutating REGISTRY directly*
export const OPERATOR_REGISTRY: Readonly<Record<string, OperatorSemantics>> = REGISTRY;
