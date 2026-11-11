import { Fragment, Item, Stagger } from '../deck'
import { BigStat } from '../components/BigStat'
import { SlideDef, windowFromNotes } from './types'

const notes = `2:45 to 3:20. Here is the most important thing I learned, and it is the reason the whole project fires a real attack instead of just checking the rule. My first rule passed all thirty practice tests, a perfect score. But when I fired the real attack, the alarm stayed silent. It turned out the alarm already had a generic, built-in rule that grabbed the event first and filed it as a harmless login, so my rule never got a say. One small change fixed it. [advance] The lesson: a rule can look perfect on paper and still fail against the real thing. The only way to know is to fire the real attack.`

function Lessons() {
  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">WHAT ONLY TESTING FOUND</Item>
        <Item>
          <h1 className="headline">
            All the practice tests passed, <em>and it still missed</em>
          </h1>
        </Item>
      </Stagger>
      <Stagger delay={0.12} className="lessons-col">
        <Item>
          <BigStat value="30 / 30" label="PRACTICE TESTS PASSED" />
        </Item>
        <Item className="lessons-sub">The real attack still slipped through</Item>
        <Item className="body-sm lessons-body">
          The alarm already had a generic rule that called the attack a harmless login. Mine was supposed to override it, and
          in my first version it didn’t.
        </Item>
      </Stagger>
      <Fragment index={1} className="bottom-line">
        A rule can be perfect on paper and still fail live. So the real attack is the test.
      </Fragment>
    </div>
  )
}

export const lessons: SlideDef = {
  id: 'lessons',
  section: 'found',
  fragments: 1,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: Lessons,
}
