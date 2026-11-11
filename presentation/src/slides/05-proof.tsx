import { useState } from 'react'
import { Fragment, Item, Stagger, useDeck } from '../deck'
import { Typewriter } from '../components/Typewriter'
import { DataTable } from '../components/DataTable'
import { SlideDef, windowFromNotes } from './types'

const notes = `2:05 to 2:45. On October 14th the whole pipeline went green for the first time. This is the test log: one alert, from my rule, for the account that was attacked. [advance] The attack tried every account in the domain. The alarm fired exactly once, on the only vulnerable one. That is the whole claim in one number: fired once.`

const shots = __SCREENSHOTS__

function Proof() {
  const { reduced } = useDeck()
  const [typed, setTyped] = useState(reduced)

  const rows = [
    ['Rule', '100201'],
    ['Severity', 'high (12)'],
    ['Account attacked', 'svc_sql'],
    ['Times fired', <span key="ft" className="accent proof-firedtimes">1</span>],
  ]

  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">PROOF / 2026-10-14</Item>
        <Item>
          <h1 className="headline">
            The full pipeline went <em>green</em>
          </h1>
        </Item>
        <div className="proof-panels">
          <Item className="proof-panel">
            <div className="label proof-title">Test log, attack step</div>
            <div className="box proof-box">
              {shots.ciLog ? (
                <img className="proof-shot" src="/screenshots/ci-log.png" alt="CI log of the detect job's integration step" />
              ) : (
                <>
                  <Typewriter
                    className="proof-pass pass"
                    text="[PASS] Found 1 alert(s) for rule.id=100201 / T1558.003."
                    delay={0.6}
                    onDone={() => setTyped(true)}
                  />
                </>
              )}
            </div>
          </Item>
          <Item className="proof-panel">
            <div className="label proof-title">The alarm in Wazuh</div>
            <div className="box proof-box">
              {shots.wazuhAlert ? (
                <img className="proof-shot" src="/screenshots/wazuh-alert.png" alt="The Kerberoasting alert in Wazuh" />
              ) : (
                typed && (
                  <DataTable
                    size={28}
                    columns={[
                      { header: '', width: '340px', mono: true },
                      { header: '', width: '1fr', mono: true },
                    ]}
                    rows={rows}
                  />
                )
              )}
            </div>
          </Item>
        </div>
      </Stagger>
      <Fragment index={1} className="bottom-line">
        The attack tried every account. The alarm fired once, on the only vulnerable one.
      </Fragment>
    </div>
  )
}

export const proof: SlideDef = {
  id: 'proof',
  section: 'built',
  fragments: 1,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: Proof,
}
