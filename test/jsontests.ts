import { assert } from 'chai'
import 'mocha'
import { readdirSync } from 'fs'
import { populateTree, serdeTrie } from './testHandlers'
import { keccak256, rlp, toBuffer } from 'ethereumjs-util'

const testDir = 'test/testdata'
const ignoreFiles = ["block.json", "singleTxBlock.json", 'trietestnextprev.json']

describe('JSON-Tests', () => {
  for (const f of readdirSync(testDir).filter(_ => !ignoreFiles.includes(_))) {

      describe(f, () => {
        const test = require("./testdata/" + f)

        Object.keys(test).forEach(testcase => {
          it(testcase, async() => {
            const trie = await populateTree(test[testcase])
            assert.isTrue(toBuffer(test[testcase].root).equals(trie.root))
          })
        })
      })

      describe(f + " - SerDe", () => {
        const test = require("./testdata/" + f)

        Object.keys(test).forEach(testcase => {
          it(testcase, async() => {
            const trie = await populateTree(test[testcase])
            const reconstructedTrie = serdeTrie(trie)
            const secure = test[testcase].secure?true:false
            const empty = test[testcase].empty?true:false

            if(!empty) {
              for( const key of Object.keys(test[testcase].in)) {
                const proofIndex = secure?keccak256(key):toBuffer(key)
                assert.deepEqual((await trie.getProof(proofIndex)), (await reconstructedTrie.getProof(proofIndex)))
              }
            }
          })
        })
      })

  }
})
