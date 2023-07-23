import create from './create.js'
import join from './join.js'
import startProposal from './startProposal.js'
import whoami from './whoami.js'
import ls from './ls.js'

const mapping = {
  'create': create,
  'join': join,
  'start-proposal': startProposal,
  'whoami': whoami,
  'ls': ls
}

export default mapping