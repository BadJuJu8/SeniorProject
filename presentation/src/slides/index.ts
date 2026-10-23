import { SlideDef } from './types'
import { cover } from './01-cover'
import { tools } from './02-tools'
import { problem } from './03-problem'
import { built } from './04-built'
import { proof } from './05-proof'
import { lessons } from './06-lessons'
import { flaw } from './07-flaw'
import { next } from './08-next'
import { backup } from './09-backup'
import { backupRule } from './10-backup-rule'
import { backupCreds } from './11-backup-creds'
import { backupLimits } from './12-backup-limits'
import { backupDecisions } from './13-backup-decisions'

/** The deck, in order. A slide and its notes live in the same module. */
export const slides: SlideDef[] = [
  cover,
  tools,
  problem,
  built,
  proof,
  lessons,
  flaw,
  next,
  backup,
  backupRule,
  backupCreds,
  backupLimits,
  backupDecisions,
]

export type { SlideDef }
