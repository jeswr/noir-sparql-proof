import fs from 'fs';
import path from 'path';
import { ProgramIR, Constraint } from '../../ir/types.js';

export interface EmitOptions { outDir: string; filename?: string; }

export function emitNoir(program: ProgramIR, opts: EmitOptions) {
  const { outDir } = opts;
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, opts.filename || 'generated.nr');
  const code = render(program);
  fs.writeFileSync(file, code, 'utf8');
  return file;
}

function render(p: ProgramIR): string {
  const vars = p.projected;
  const patCount = p.patterns.length;
  let out = '';
  out += '// Auto-generated Noir (prototype) from ProgramIR\n';
  out += `// queryHash: ${p.meta.queryHash}\n`;
  out += `pub struct Triple { terms: [Field; 3] }\n`;
  out += `pub struct MerkleProof { path: [Field; MERKLE_DEPTH], dirs: [Field; MERKLE_DEPTH] }\n`;
  out += `global MERKLE_DEPTH = 11;\n`;
  out += `pub struct Witness { bgp: BGP, proofs: [MerkleProof; ${patCount}] }\n`;
  out += `pub type BGP = [Triple; ${patCount}];\n`;
  out += 'pub struct Variables {\n';
  for (const v of vars) out += `  pub ${sanitize(v)}: Field,\n`;
  out += '}\n\n';
  out += 'fn assert_eq(a: Field, b: Field, msg: str) { assert(a == b, msg); }\n';
  out += 'fn assert_bool(cond: bool, msg: str) { assert(cond, msg); }\n\n';
  out += 'pub fn generated_check(bgp: BGP, variables: Variables, roots: [Field;1], proofs: [MerkleProof; ' + patCount + ']) {\n';
  // Membership verify placeholder
  p.patterns.forEach((pat, i) => {
    out += `  // verify membership for pattern ${pat.id}\n`;
    out += `  // TODO: implement merkle verification gadget using proofs[${i}] against roots[0]\n`;
  });
  // Variable binding assertions
  p.patterns.forEach((pat, i) => {
    const comp = (k: 'subject'|'predicate'|'object', idx: number) => {
      const term: any = (pat as any)[k];
      if (term.kind === 'Variable') {
        out += `  assert_eq(variables.${sanitize(term.value)}, bgp[${i}].terms[${idx}], "var ${term.value} binding mismatch");\n`;
      }
    };
    comp('subject',0); comp('predicate',1); comp('object',2);
  });
  // Constraints emission
  for (const c of p.constraints) {
    out += emitConstraint(c, p);
  }
  out += '}\n';
  return out;
}

function emitConstraint(c: Constraint, p: ProgramIR): string {
  switch (c.tag) {
    case 'Membership':
      return `  // membership constraint for ${c.patternId} (implicit in merkle verify)\n`;
    case 'Eq': {
      const a = exprRef(c.a); const b = exprRef(c.b);
      return `  assert_eq(${a}, ${b}, "constraint eq");\n`;
    }
    default:
      return `  // unsupported constraint ${c.tag}\n`;
  }
}

function exprRef(id: string): string { // basic lowering stub
  if (id.startsWith('var:')) return `variables.${sanitize(id.slice(4))}`;
  if (id.startsWith('pat:')) { const parts = id.split(':'); return `bgp[${parts[1].replace('pat','')}].terms[${indexForComponent(parts[2])}]`; }
  return '0';
}
function indexForComponent(c: string): number { return c === 'subject' ? 0 : c === 'predicate' ? 1 : 2; }
function sanitize(name: string) { return name.replace(/[^a-zA-Z0-9_]/g, '_'); }
