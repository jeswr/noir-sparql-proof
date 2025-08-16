import { Constraint } from '../ir/types.js';

export function assembleConstraints(base: Constraint[], extra: Constraint[] = []): Constraint[] {
  return [...base, ...extra];
}
