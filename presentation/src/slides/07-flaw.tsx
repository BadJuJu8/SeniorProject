import { Fragment, Item, Stagger } from '../deck'
import { PipelineStrip } from '../components/PipelineStrip'
import { SlideDef, windowFromNotes } from './types'

const notes = `3:20 to 4:15. Now the honest part. Today the attack runs before the new rule is installed, so it tests the old rule, not the one I just wrote. A typo in the new rule would pass and ship. [advance] The fix: install the new rule on the side, as a candidate, next to the trusted one. [advance] The attack has to set off the candidate. Only then does it replace the old rule. The trusted rule never stops working. If the attack step fails, the candidate is deleted and nothing changed.`

function Flaw() {
  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">HONEST STATUS</Item>
        <Item>
          <h1 className="headline">
            One flaw, and <em>the fix</em>
          </h1>
        </Item>
        <Item className="body flaw-body">
          Today, the attack tests the old rule, not the new one.
        </Item>
        <Item className="flaw-row">
          <div className="flaw-row-head">
            <span className="label">TODAY</span>
            <span className="label">tests the old rule</span>
          </div>
          <PipelineStrip
            run
            nodes={[{ label: 'validate' }, { label: 'detect', stopped: true }, { label: 'deploy' }, { label: 'verify-deploy' }]}
          />
        </Item>
      </Stagger>
      <Fragment index={1} className="flaw-row flaw-row--planned">
        <div className="flaw-row-head">
          <span className="label accent">PLANNED / SHADOW CANDIDATE</span>
        </div>
        <PipelineStrip
          nodes={[
            { label: 'validate' },
            { label: 'stage-candidate', accent: true },
            { label: 'detect' },
            { label: 'promote', accent: true },
            { label: 'verify-deploy' },
          ]}
        />
      </Fragment>
      <Fragment index={2} className="body-sm flaw-planned-body">
        Try the new rule on the side. Only then replace the old one.
      </Fragment>
    </div>
  )
}

export const flaw: SlideDef = {
  id: 'flaw',
  section: 'found',
  fragments: 2,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: Flaw,
}
