// Core IR type definitions (Phase 1 subset)
import type { Algebra } from 'sparqlalgebrajs';

export type TermKind = 'Variable' | 'NamedNode' | 'BlankNode' | 'Literal' | 'DefaultGraph';

export interface TermIRBase { kind: TermKind; value: string; }
export type TermIR = TermIRBase; // future: extended fields for literals (datatype/lang)

export interface PatternIR {
  id: string;
  subject: TermIR; predicate: TermIR; object: TermIR; graph: TermIR;
  optionalGroup?: string;
  unionBranch?: string;
  origin?: { pathExpanded?: boolean; depth?: number; algebraRef: string };
}

export type ExprId = string;

export type ExprNode =
  | { tag: 'VarRef'; name: string; id: ExprId; valueCategory: string }
  | { tag: 'Const'; encoding: string; id: ExprId; valueCategory: string }
  | { tag: 'Op'; op: string; args: ExprId[]; id: ExprId; valueCategory: string };

export type Constraint =
  | { tag: 'Eq'; a: ExprId; b: ExprId; source?: string }
  | { tag: 'And'; items: Constraint[] }
  | { tag: 'Or'; items: Constraint[] }
  | { tag: 'Not'; inner: Constraint }
  | { tag: 'Implies'; a: Constraint; b: Constraint }
  | { tag: 'Membership'; patternId: string; datasetIndex: number }
  | { tag: 'OperatorEval'; expr: ExprId };

export interface ProgramIR {
  patterns: PatternIR[];
  exprs: Record<ExprId, ExprNode>;
  constraints: Constraint[];
  projected: string[]; // variable names
  meta: { queryHash: string; operatorSetVersion: string };
}
